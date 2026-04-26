/**
 * generateForensicReportHTML — Produces a self-contained, print-ready HTML document
 * for the Forensic Reports page.
 *
 * Mirrors the structure and CSS conventions of
 * `features/Dashboard/utils/generateReportHTML.js` so both export workflows
 * feel identical to the user.
 *
 * Accept:
 *   { tabKey, reportData, clinicSettings, startDate, endDate }
 *
 *   tabKey      — 'consult' | 'audit' | 'staff'
 *   reportData  — full return value from useForensicReportData (data object)
 *   clinicSettings — from useClinicSettings()
 *   startDate   — YYYY-MM-DD string (Manila timezone)
 *   endDate     — YYYY-MM-DD string (Manila timezone)
 *
 * Usage (in Reports.jsx):
 *   const html = generateForensicReportHTML({ tabKey, reportData, clinicSettings, startDate, endDate });
 *   const w = window.open('', '_blank');
 *   w.document.write(html);
 *   w.document.close();
 *   w.print();
 */

// ── XSS guard ────────────────────────────────────────────────────
/** Escapes user-supplied text for safe inline HTML injection. */
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ── Duration formatter (plain-JS mirror of pulseUtils.formatDuration) ──
/**
 * Converts a raw minute count to a human-readable string.
 * e.g. 90 → "1H 30M", 0 → "0M", null → "—"
 * Kept here so the report generator has zero runtime import deps.
 */
function fmtDuration(totalMins) {
  if (totalMins == null || isNaN(totalMins)) return '—';
  const m = Math.max(0, Math.round(totalMins));
  if (m === 0) return '0M';
  if (m < 60) return `${m}M`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}H ${rem}M` : `${h}H`;
}

// ── Shared HTML helpers ──────────────────────────────────────────

/**
 * Renders a KPI card as inline HTML.
 * @param {string} label
 * @param {string|number} value
 * @param {string} [sub]
 */
function kpiCard(label, value, sub = '') {
  return `<div class="kpi-card">
    <div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value">${esc(String(value))}</div>
    ${sub ? `<div class="kpi-sub">${esc(String(sub))}</div>` : ''}
  </div>`;
}

/**
 * Wraps a set of kpiCard() outputs in a 4-column grid.
 */
function kpiGrid(...cards) {
  return `<div class="kpi-grid">${cards.join('')}</div>`;
}

/**
 * Renders a section header (h2) with the neubrutalism bottom-border style.
 */
function sectionH2(title) {
  return `<h2 class="section-title">${esc(title)}</h2>`;
}

/**
 * Wraps a table header row from a column-label array.
 */
function tableHeader(cols) {
  return `<tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>`;
}

// ── Tab body builders ────────────────────────────────────────────

/**
 * CONSULT PERFORMANCE tab HTML body.
 * Sections: KPI summary → duration distribution → by-vet → by-dept → by-service
 *           → status transition matrix → queue flow analysis
 */
function buildConsultBody(reportData, totalCount) {
  const c = reportData.consult;
  if (!c || totalCount === 0) {
    return '<p class="empty-state">No appointment data available for this report period.</p>';
  }

  let html = '';

  // ── KPI summary ──────────────────────────────────────────────
  html += sectionH2('Consult Duration Summary');
  html += kpiGrid(
    kpiCard('Avg Consult Duration', fmtDuration(c.avgConsultMins),     `P90: ${fmtDuration(c.p90ConsultMins)}`),
    kpiCard('Median Consult',        fmtDuration(c.medianConsultMins),  '50th percentile'),
    kpiCard('Avg Queue Wait',        fmtDuration(c.avgQueueMins),       'Time from arrival to consult start'),
    kpiCard('Median Queue Wait',     fmtDuration(c.medianQueueMins),    '50th percentile'),
  );

  // ── Duration distribution ─────────────────────────────────────
  if (c.distribution?.length) {
    html += '<div class="section page-break-inside-avoid">';
    html += sectionH2('Consult Duration Distribution');
    html += '<table>';
    html += tableHeader(['Duration Bucket', 'Appointment Count', '% of Total']);
    const distTotal = c.distribution.reduce((s, b) => s + b.count, 0);
    c.distribution.forEach(b => {
      const pct = distTotal > 0 ? Math.round((b.count / distTotal) * 100) : 0;
      html += `<tr><td>${esc(b.label)}</td><td class="numeric">${b.count}</td><td class="numeric">${pct}%</td></tr>`;
    });
    html += '</table></div>';
  }

  // ── By vet ────────────────────────────────────────────────────
  const assignedVets = (c.byVet || []).filter(v => v.vetName !== 'Unassigned');
  if (assignedVets.length > 0) {
    html += '<div class="section page-break-before">';
    html += sectionH2('Avg Consult Duration by Vet');
    html += '<table>';
    html += tableHeader(['Vet Name', 'Patients', 'Avg Consult', 'Avg Queue Wait']);
    assignedVets.forEach(v => {
      html += `<tr>
        <td>${esc(v.vetName)}</td>
        <td class="numeric">${v.patients}</td>
        <td class="numeric">${fmtDuration(v.avgConsultMins)}</td>
        <td class="numeric">${fmtDuration(v.avgQueueMins || 0)}</td>
      </tr>`;
    });
    html += '</table></div>';
  }

  // ── By department ─────────────────────────────────────────────
  if (c.byDept?.length > 0) {
    html += '<div class="section">';
    html += sectionH2('Department Performance');
    html += '<table>';
    html += tableHeader(['Department', 'Appointments (w/ Pulse)', 'Total Count', 'Avg Queue Wait', 'Avg Consult']);
    c.byDept.forEach(d => {
      html += `<tr>
        <td>${esc(d.dept)}</td>
        <td class="numeric">${d.count}</td>
        <td class="numeric">${d.totalCount}</td>
        <td class="numeric">${fmtDuration(d.avgQueueMins)}</td>
        <td class="numeric">${fmtDuration(d.avgConsultMins)}</td>
      </tr>`;
    });
    html += '</table></div>';
  }

  // ── Top services ──────────────────────────────────────────────
  if (c.byService?.length > 0) {
    html += '<div class="section">';
    html += sectionH2('Top Services by Appointment Volume');
    html += '<table>';
    html += tableHeader(['#', 'Service', 'Appointments', 'Avg Duration', 'Median Duration']);
    c.byService.forEach((s, i) => {
      html += `<tr>
        <td class="numeric">${i + 1}</td>
        <td>${esc(s.service)}</td>
        <td class="numeric">${s.count}</td>
        <td class="numeric">${s.avgConsultMins > 0 ? fmtDuration(s.avgConsultMins) : '—'}</td>
        <td class="numeric">${s.medianConsultMins > 0 ? fmtDuration(s.medianConsultMins) : '—'}</td>
      </tr>`;
    });
    html += '</table></div>';
  }

  // ── Status transition matrix ──────────────────────────────────
  const matrix = c.transitionMatrix || {};
  const matrixEntries = Object.entries(matrix).filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  if (matrixEntries.length > 0) {
    html += '<div class="section page-break-before">';
    html += sectionH2('Status Transition Flow');
    html += '<table>';
    html += tableHeader(['Transition', 'Count']);
    matrixEntries.forEach(([key, count]) => {
      html += `<tr><td>${esc(key)}</td><td class="numeric">${count}</td></tr>`;
    });
    html += '</table></div>';
  }

  // ── Queue flow analysis ───────────────────────────────────────
  const q2c = c.queueToCompletion;
  if (q2c && q2c.count > 0) {
    html += '<div class="section">';
    html += sectionH2('Queue Flow Analysis (Arrival to Completion)');
    html += kpiGrid(
      kpiCard('Avg Queue-to-Completion',  fmtDuration(q2c.avg),    `from ${q2c.count} completed records`),
      kpiCard('Median Queue-to-Completion', fmtDuration(q2c.median), '50th percentile'),
      kpiCard('P90 Queue-to-Completion',  fmtDuration(q2c.p90),    'worst 10% of patients'),
      kpiCard('Records Analyzed',          q2c.count,              'with arrival + completion timestamps'),
    );

    if (q2c.distribution?.length) {
      html += '<table style="margin-top:12px">';
      html += tableHeader(['Total Facility Time', 'Appointment Count', '% of Total']);
      const q2cTotal = q2c.distribution.reduce((s, b) => s + b.count, 0);
      q2c.distribution.forEach(b => {
        const pct = q2cTotal > 0 ? Math.round((b.count / q2cTotal) * 100) : 0;
        html += `<tr><td>${esc(b.label)}</td><td class="numeric">${b.count}</td><td class="numeric">${pct}%</td></tr>`;
      });
      html += '</table>';
    }
    html += '</div>';
  }

  return html;
}

/**
 * AUDIT INTEGRITY tab HTML body.
 * Sections: pulse coverage → seal coverage → correction event log → event type counts
 */
function buildAuditBody(reportData, totalCount) {
  const a = reportData.audit;
  if (!a || totalCount === 0) {
    return '<p class="empty-state">No appointment data available for this report period.</p>';
  }

  const pulsePercent  = totalCount > 0 ? Math.round((a.withPulse / totalCount) * 100) : 0;
  const missingPercent = totalCount > 0 ? Math.round((a.withoutPulse / totalCount) * 100) : 0;
  const sealPercent   = a.terminalCount > 0 ? Math.round((a.withSeal / a.terminalCount) * 100) : 0;
  const sealGapPercent = a.terminalCount > 0 ? Math.round((a.withoutSeal / a.terminalCount) * 100) : 0;

  let html = '';

  // ── Pulse coverage ────────────────────────────────────────────
  html += sectionH2('Pulse Data Coverage');
  html += kpiGrid(
    kpiCard('Appointments Analyzed',  totalCount,              'Total records in date range'),
    kpiCard('With Pulse Data',        a.withPulse,             `${pulsePercent}% coverage — forensic timeline active`),
    kpiCard('Missing Pulse Data',     a.withoutPulse,          `${missingPercent}% — legacy records (pre-Phase 2)`),
  );

  // ── Seal coverage ─────────────────────────────────────────────
  html += sectionH2('Forensic Seal Coverage');
  html += kpiGrid(
    kpiCard('Terminal Records',    a.terminalCount,  'Completed, cancelled, or no-show'),
    kpiCard('With Forensic Seal',  a.withSeal,       `${sealPercent}% — metrics frozen at terminal state`),
    kpiCard('Seal Coverage Gap',   a.withoutSeal,    `${sealGapPercent}% — unsealed terminal records (pre-T2.44)`),
  );

  // ── Corrections & reversals ───────────────────────────────────
  html += sectionH2('Corrections &amp; Reversals');
  html += kpiGrid(
    kpiCard('Total Corrections',    a.correctionCount,             'CORRECTION events across all pulse arrays'),
    kpiCard('Terminal Reversals',   a.terminalReversals?.length ?? 0, 'Corrections applied to already-terminal records'),
  );

  // Correction event log
  const corrections = [...(a.correctionEvents || [])].sort((x, y) => {
    const xMs = x.timestamp?.toDate?.()?.getTime?.() ?? 0;
    const yMs = y.timestamp?.toDate?.()?.getTime?.() ?? 0;
    return yMs - xMs; // newest first
  });

  html += '<div class="section page-break-before">';
  html += sectionH2('Correction Event Log');
  if (corrections.length === 0) {
    html += '<p class="empty-state">No corrections recorded in this period.</p>';
  } else {
    html += '<table>';
    html += tableHeader(['Timestamp', 'Staff', 'From → To', 'Reason / Patient']);
    corrections.forEach(evt => {
      const ts = (() => {
        try {
          const d = evt.timestamp?.toDate ? evt.timestamp.toDate() : new Date(evt.timestamp);
          return d.toLocaleString('en-PH', {
            timeZone: 'Asia/Manila',
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
          });
        } catch { return '—'; }
      })();
      const transition = `${evt.fromStatus || '?'} → ${evt.toStatus || '?'}`;
      const reason = [evt.note, evt.petName ? `(${evt.petName})` : ''].filter(Boolean).join(' ') || 'No reason recorded';
      html += `<tr>
        <td style="white-space:nowrap;font-size:9px;">${esc(ts)}</td>
        <td>${esc(evt.staffName || evt.staffId || 'Unknown')}</td>
        <td style="font-weight:800;">${esc(transition)}</td>
        <td>${esc(reason)}</td>
      </tr>`;
    });
    html += '</table>';
  }
  html += '</div>';

  // ── Event type distribution ───────────────────────────────────
  const eventTypeSorted = Object.entries(a.eventTypeCounts || {})
    .sort(([, a2], [, b2]) => b2 - a2);

  if (eventTypeSorted.length > 0) {
    html += '<div class="section">';
    html += sectionH2('Pulse Event Type Distribution');
    html += '<table>';
    html += tableHeader(['Event Type', 'Count', '% of All Events']);
    const totalEvents = eventTypeSorted.reduce((s, [, c2]) => s + c2, 0);
    eventTypeSorted.forEach(([type, count]) => {
      const pct = totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0;
      html += `<tr>
        <td style="font-weight:700;">${esc(type.replace(/_/g, ' '))}</td>
        <td class="numeric">${count}</td>
        <td class="numeric">${pct}%</td>
      </tr>`;
    });
    html += `</table>
      <p style="font-size:9px;color:#999;margin-top:6px;">Total pulse events: ${totalEvents}</p>
    </div>`;
  }

  return html;
}

/**
 * STAFF WORKLOAD tab HTML body.
 * Sections: staff summary KPIs → vet performance table
 */
function buildStaffBody(reportData, totalCount) {
  const s = reportData.staff;
  if (!s || totalCount === 0) {
    return '<p class="empty-state">No appointment data available for this report period.</p>';
  }

  const totalEncounters = (s.byVet || [])
    .filter(v => v.vetName !== 'Unassigned')
    .reduce((sum, v) => sum + v.patients, 0);

  let html = '';

  // ── Staff summary KPIs ────────────────────────────────────────
  html += sectionH2('Staff Summary');
  html += kpiGrid(
    kpiCard('Active Vets',               s.activeVets,          'Unique vets with assigned appointments'),
    kpiCard('Total Patient Encounters',   totalEncounters,       'Appointments with a named vet'),
    kpiCard('Total Consult Hours',        `${s.totalConsultHours}h`, 'Aggregate clinical time across all vets'),
  );

  // ── Vet performance table ─────────────────────────────────────
  if (!s.byVet?.length) {
    html += '<p class="empty-state">No vet assignment data available for this period.</p>';
    return html;
  }

  const unassignedVet = s.byVet.find(v => v.vetName === 'Unassigned');
  const assignedVets  = s.byVet.filter(v => v.vetName !== 'Unassigned');
  const tableRows     = [...assignedVets, ...(unassignedVet ? [unassignedVet] : [])];

  // Check for high unassigned ratio
  if (unassignedVet) {
    const unassignedPct = totalEncounters > 0
      ? Math.round((unassignedVet.patients / (totalEncounters + unassignedVet.patients)) * 100)
      : 0;
    if (unassignedPct > 20) {
      html += `<p class="warning-notice">
        Warning: ${unassignedPct}% of appointments (${unassignedVet.patients}) have no assigned vet.
        Review staff assignment workflow.
      </p>`;
    }
  }

  html += '<div class="section page-break-before">';
  html += sectionH2('Vet Performance Table');
  html += '<p style="font-size:9px;color:#888;margin-bottom:6px;">Sorted by patient count descending. "Unassigned" row appears last.</p>';
  html += '<table>';
  html += tableHeader([
    'Vet Name', 'Patients', 'Total Consult', 'Avg Consult', 'Avg Queue Wait', 'Depts Served',
  ]);
  tableRows.forEach(v => {
    const isUnassigned = v.vetName === 'Unassigned';
    html += `<tr${isUnassigned ? ' style="color:#888;font-style:italic;"' : ''}>
      <td style="font-weight:700;">${esc(v.vetName)}</td>
      <td class="numeric" style="font-weight:900;">${v.patients}</td>
      <td class="numeric">${v.totalConsultMins > 0 ? fmtDuration(v.totalConsultMins) : '—'}</td>
      <td class="numeric">${v.avgConsultMins > 0 ? fmtDuration(v.avgConsultMins) : '—'}</td>
      <td class="numeric">${v.avgQueueMins > 0 ? fmtDuration(v.avgQueueMins) : '—'}</td>
      <td>${esc(v.departments?.join(', ') || '—')}</td>
    </tr>`;
  });
  html += '</table></div>';

  return html;
}

// ── Shared CSS ───────────────────────────────────────────────────

const BASE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 12px;
    color: #3E2723;
    padding: 24px;
    max-width: 860px;
    margin: 0 auto;
    background: #fff;
  }
  .report-header {
    border-bottom: 3px solid #3E2723;
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  .report-header h1 {
    font-size: 20px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #3E2723;
    margin-bottom: 3px;
  }
  .report-header .subtitle {
    font-size: 11px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .report-header .date-range {
    font-size: 13px;
    font-weight: 700;
    color: #5D4037;
    margin-top: 5px;
  }
  .report-header .generated-at {
    font-size: 9px;
    color: #999;
    margin-top: 3px;
  }
  /* KPI grid */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 20px;
  }
  .kpi-card {
    border: 2px solid #3E2723;
    padding: 10px 12px;
    background: #FFF8E1;
  }
  .kpi-label {
    font-size: 8.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #666;
    margin-bottom: 4px;
  }
  .kpi-value {
    font-size: 18px;
    font-weight: 900;
    color: #3E2723;
    line-height: 1.1;
  }
  .kpi-sub {
    font-size: 8.5px;
    color: #888;
    margin-top: 2px;
  }
  /* Sections */
  .section {
    margin-bottom: 20px;
  }
  h2.section-title {
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #3E2723;
    border-bottom: 2px solid #3E2723;
    padding-bottom: 4px;
    margin-bottom: 8px;
    margin-top: 20px;
  }
  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
  }
  th {
    background: #FFF8E1;
    border: 1px solid #3E2723;
    padding: 5px 8px;
    font-weight: 800;
    text-transform: uppercase;
    font-size: 8.5px;
    letter-spacing: 0.4px;
    text-align: left;
    color: #3E2723;
  }
  td {
    border: 1px solid #ccc;
    padding: 4px 8px;
    color: #3E2723;
    line-height: 1.4;
  }
  td.numeric {
    text-align: right;
    font-weight: 700;
  }
  /* States */
  .empty-state {
    font-size: 11px;
    color: #999;
    font-style: italic;
    padding: 12px 0;
    text-align: center;
  }
  .warning-notice {
    font-size: 10px;
    color: #E65100;
    font-weight: 700;
    border: 1.5px solid #FDBA74;
    background: #FFF7ED;
    padding: 6px 10px;
    margin-bottom: 12px;
  }
  /* Footer */
  .report-footer {
    margin-top: 32px;
    padding-top: 10px;
    border-top: 1px solid #ccc;
    font-size: 9px;
    color: #999;
    text-align: center;
  }
  /* Print */
  @media print {
    body { font-size: 10pt; padding: 12px; }
    .kpi-grid { grid-template-columns: repeat(4, 1fr); }
    .kpi-card { break-inside: avoid; }
    .section { break-inside: avoid; }
    .page-break-before { page-break-before: always; break-before: page; }
    .page-break-inside-avoid { break-inside: avoid; }
    .report-footer { position: fixed; bottom: 0; left: 0; right: 0; }
  }
`;

// ── Public API ────────────────────────────────────────────────────

/**
 * Generates a complete, self-contained HTML document for print export.
 *
 * @param {object} options
 * @param {'consult'|'audit'|'staff'} options.tabKey
 * @param {object}  options.reportData      — full data object from useForensicReportData
 * @param {object}  options.clinicSettings  — from useClinicSettings()
 * @param {string}  options.startDate       — YYYY-MM-DD
 * @param {string}  options.endDate         — YYYY-MM-DD
 * @returns {string} Full HTML document as a string
 */
export function generateForensicReportHTML({ tabKey, reportData, clinicSettings, startDate, endDate }) {
  const clinicName = esc(clinicSettings?.clinicName || 'Starbarks Veterinary Clinic');

  const now = new Date();
  const generatedAt = now.toLocaleString('en-PH', {
    timeZone:    'Asia/Manila',
    year:        'numeric',
    month:       'long',
    day:         'numeric',
    hour:        '2-digit',
    minute:      '2-digit',
  });

  const TAB_LABELS = {
    consult: 'Consult Performance Report',
    audit:   'Audit Integrity Report',
    staff:   'Staff Workload Report',
  };

  const tabLabel  = TAB_LABELS[tabKey] || 'Forensic Report';
  const totalCount = reportData?.totalCount ?? 0;

  // Format the date range for display
  const fmtDate = (str) => {
    try {
      return new Date(str + 'T00:00:00+08:00').toLocaleDateString('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch { return str; }
  };
  const dateRangeLabel = `${fmtDate(startDate)} — ${fmtDate(endDate)}`;

  // Select body builder by tab
  let body = '';
  switch (tabKey) {
    case 'consult': body = buildConsultBody(reportData, totalCount); break;
    case 'audit':   body = buildAuditBody(reportData, totalCount);   break;
    case 'staff':   body = buildStaffBody(reportData, totalCount);   break;
    default:        body = '<p class="empty-state">Unknown report tab.</p>';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(tabLabel)} — ${clinicName}</title>
  <style>${BASE_CSS}</style>
</head>
<body>

  <div class="report-header">
    <h1>${clinicName}</h1>
    <div class="subtitle">${esc(tabLabel)}</div>
    <div class="date-range">${esc(dateRangeLabel)}</div>
    <div class="generated-at">
      Generated on ${esc(generatedAt)} &bull;
      ${totalCount.toLocaleString()} appointment${totalCount !== 1 ? 's' : ''} analyzed
    </div>
  </div>

  ${body}

  <div class="report-footer">
    Generated by VetConnect Forensic Reporting Engine &bull; ${esc(generatedAt)}
  </div>

</body>
</html>`;
}
