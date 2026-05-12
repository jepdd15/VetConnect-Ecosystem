import { generateForensicReportHTML } from '../../Reports/utils/generateForensicReportHTML';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Shared CSS for all report documents ───────────────────────────────────
// Both generateReportHTML and generateFullReportHTML reference this constant
// so the stylesheet stays in one place.
const REPORT_CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      color: #3E2723;
      padding: 40px;
      max-width: 900px;
      margin: 0 auto;
      background: #fff;
    }
    .header {
      border-bottom: 4px solid #3E2723;
      padding-bottom: 15px;
      margin-bottom: 30px;
      position: relative;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.5px;
      color: #3E2723;
    }
    .header .subtitle {
      font-size: 12px;
      font-weight: 700;
      color: #795548;
      text-transform: uppercase;
      margin-top: 4px;
    }
    .header .period {
      font-size: 12px;
      font-weight: 900;
      color: #3E2723;
      margin-top: 10px;
      background: #F5F5F5;
      display: inline-block;
      padding: 4px 12px;
      border: 2px solid #3E2723;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    .kpi-card {
      border: 2px solid #3E2723;
      padding: 15px;
      background: #fff;
      box-shadow: 4px 4px 0px #3E2723;
    }
    .kpi-card .label {
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      color: #795548;
      margin-bottom: 6px;
    }
    .kpi-card .value {
      font-size: 20px;
      font-weight: 900;
      color: #3E2723;
      line-height: 1;
    }
    .kpi-card .delta {
      font-size: 10px;
      font-weight: 900;
      margin-top: 6px;
      padding: 2px 6px;
      display: inline-block;
      border: 1px solid #3E2723;
    }
    .delta.up { color: #2E7D32; background: #E8F5E9; }
    .delta.down { color: #D32F2F; background: #FFEBEE; }
    .delta.neutral { color: #757575; background: #F5F5F5; }

    .section {
      margin-bottom: 30px;
      page-break-inside: avoid;
    }
    .section h2 {
      font-size: 14px;
      font-weight: 900;
      text-transform: uppercase;
      color: #fff;
      background: #3E2723;
      padding: 6px 12px;
      margin-bottom: 15px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 2px solid #3E2723;
    }
    th {
      background: #EFEBE9;
      border: 2px solid #3E2723;
      padding: 10px;
      font-weight: 900;
      text-transform: uppercase;
      font-size: 10px;
      text-align: left;
    }
    td {
      border: 1px solid #D7CCC8;
      padding: 8px 10px;
      font-weight: 600;
    }
    tr:nth-child(even) { background: #FAFAFA; }
    .footer {
      margin-top: 50px;
      border-top: 2px solid #3E2723;
      padding-top: 15px;
      font-size: 10px;
      font-weight: 700;
      text-align: center;
      text-transform: uppercase;
    }
`;

function fmt(n) {
  return `₱${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function kpi(label, value, sub = '', delta = null) {
  let deltaHtml = '';
  if (delta !== null) {
    const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
    const sym = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
    deltaHtml = `<div class="delta ${cls}">${sym} ${Math.abs(delta)}% vs prev</div>`;
  }

  return `<div class="kpi-card">
    <div class="label">${esc(label)}</div>
    <div class="value">${esc(String(value))}</div>
    ${deltaHtml}
    ${sub ? `<div class="sub">${esc(String(sub))}</div>` : ''}
  </div>`;
}

function buildOpsReport(data) {
  const { ops, queueData } = data;
  if (!ops) return '<p>Operations data is only available for the "Today" period.</p>';

  const activeCount = (ops.statusCounts.arrived || 0) + (ops.statusCounts['in-consult'] || 0) +
    (ops.statusCounts.dispensing || 0) + (ops.statusCounts.billing || 0);

  let html = '<div class="kpi-grid">';
  html += kpi('Total Appointments', ops.totalAppointments);
  html += kpi('Completed', ops.statusCounts.completed || 0,
    ops.totalAppointments > 0 ? `${Math.round(((ops.statusCounts.completed || 0) / ops.totalAppointments) * 100)}% throughput` : '');
  html += kpi('Active In Facility', activeCount);
  html += kpi('Queue Serving', queueData ? `${esc(queueData.currentPrefix || '')}${queueData.currentServing || 0}` : '--',
    queueData ? `${queueData.lastNumberIssued || 0} tickets issued` : '');
  html += '</div>';

  html += '<div class="kpi-grid">';
  html += kpi('Avg Wait Time', `${ops.avgWaitMins} min`, `${ops.currentWaitingCount} currently waiting`);
  html += kpi('Longest Current Wait', ops.longestCurrentWait > 0 ? `${ops.longestCurrentWait} min` : '--');
  html += kpi('Avg Consult Duration', ops.consultCount > 0 ? `${ops.avgConsultMins} min` : '--',
    ops.consultCount > 0 ? `from ${ops.consultCount} completed` : '');
  html += kpi('Emergencies', ops.emergencyCount);
  html += '</div>';

  html += '<div class="section"><h2>Appointment Status Breakdown</h2><table>';
  html += '<tr><th>Status</th><th>Count</th><th>Percentage</th></tr>';
  Object.entries(ops.statusCounts).filter(([, v]) => v > 0).forEach(([status, count]) => {
    const pct = ops.totalAppointments > 0 ? Math.round((count / ops.totalAppointments) * 100) : 0;
    html += `<tr><td>${esc(status.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase()))}</td><td class="numeric">${count}</td><td class="numeric">${pct}%</td></tr>`;
  });
  html += '</table></div>';

  html += '<div class="section"><h2>Department Load</h2><table>';
  html += '<tr><th>Department</th><th>Appointments</th><th>Percentage</th></tr>';
  Object.entries(ops.deptLoad).sort(([, a], [, b]) => b - a).forEach(([dept, count]) => {
    const pct = ops.totalAppointments > 0 ? Math.round((count / ops.totalAppointments) * 100) : 0;
    html += `<tr><td>${esc(dept)}</td><td class="numeric">${count}</td><td class="numeric">${pct}%</td></tr>`;
  });
  html += '</table></div>';

  html += '<div class="section"><h2>Staff Workload</h2><table>';
  html += '<tr><th>Staff</th><th>Appointments</th></tr>';
  Object.entries(ops.staffWorkload).sort(([, a], [, b]) => b - a).forEach(([name, count]) => {
    html += `<tr><td>${esc(name)}</td><td class="numeric">${count}</td></tr>`;
  });
  html += '</table></div>';

  html += '<div class="kpi-grid">';
  html += kpi('No-Shows', ops.noShowCount);
  html += kpi('Cancellations', ops.cancelledCount);
  html += '</div>';

  return html;
}

function buildGrowthReport(data) {
  const { growth } = data;
  if (!growth) return '<p>Growth data not available.</p>';

  let html = '<div class="kpi-grid">';
  html += kpi('New Clients', growth.newClientCount, 'registered this period');
  html += kpi('Total Active Clients', growth.totalActiveClients);
  html += kpi('Total Active Pets', growth.totalActivePets);
  html += kpi('Total Appointments', growth.totalAppointments,
    `${growth.walkInCount} walk-in / ${growth.scheduledCount} scheduled`);
  html += '</div>';

  html += '<div class="section"><h2>Species Distribution</h2><table>';
  html += '<tr><th>Species</th><th>Count</th></tr>';
  Object.entries(growth.speciesDistribution).sort(([, a], [, b]) => b - a).forEach(([species, count]) => {
    html += `<tr><td>${esc(species)}</td><td class="numeric">${count}</td></tr>`;
  });
  html += '</table></div>';

  if (growth.topBreeds.length > 0) {
    html += '<div class="section"><h2>Top Breeds</h2><table>';
    html += '<tr><th>#</th><th>Breed</th><th>Count</th></tr>';
    growth.topBreeds.forEach((b, i) => {
      html += `<tr><td>${i + 1}</td><td>${esc(b.breed)}</td><td class="numeric">${b.count}</td></tr>`;
    });
    html += '</table></div>';
  }

  if (growth.serviceRanking.length > 0) {
    html += '<div class="section"><h2>Service Popularity</h2><table>';
    html += '<tr><th>#</th><th>Service</th><th>Appointments</th></tr>';
    growth.serviceRanking.forEach((s, i) => {
      html += `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td class="numeric">${s.count}</td></tr>`;
    });
    html += '</table></div>';
  }

  html += '<div class="section"><h2>Peak Hours</h2><table>';
  html += '<tr><th>Hour</th><th>Appointments</th></tr>';
  growth.peakHours.filter(h => h.count > 0).forEach(h => {
    html += `<tr><td>${esc(h.label)}</td><td class="numeric">${h.count}</td></tr>`;
  });
  html += '</table></div>';

  html += '<div class="kpi-grid">';
  html += kpi('Booking Lead Time', growth.avgLeadTimeHours > 0 ? `${growth.avgLeadTimeHours}h` : '--',
    growth.leadTimeCount > 0 ? `avg from ${growth.leadTimeCount} bookings` : '');
  html += kpi('Client Retention', `${growth.retentionRate}%`,
    `${growth.returningClientCount} returning / ${growth.uniqueClientCount} total`);
  html += '</div>';

  return html;
}

function buildClinicalReport(data) {
  const { clinical } = data;
  if (!clinical) return '<p>Clinical data not available.</p>';

  let html = '<div class="kpi-grid">';
  html += kpi('Records Signed', clinical.recordsSigned, 'this period');
  html += kpi('Vaccinations', clinical.totalVaccinations,
    `${clinical.vaccinesByType.length} vaccine types`);
  html += kpi('Follow-Up Compliance', `${clinical.followUpComplianceRate}%`,
    `${clinical.followUpAttended} attended / ${clinical.recordsWithFollowUp} requested`);
  html += kpi('Confinement Rate', `${clinical.confinementRate}%`,
    `${clinical.confinedCount} confined / ${clinical.carriedOverCount} carried over`);
  html += '</div>';

  if (clinical.topDiagnoses.length > 0) {
    html += '<div class="section"><h2>Top Diagnoses</h2><table>';
    html += '<tr><th>#</th><th>Diagnosis</th><th>Count</th></tr>';
    clinical.topDiagnoses.forEach((d, i) => {
      html += `<tr><td>${i + 1}</td><td>${esc(d.diagnosis)}</td><td class="numeric">${d.count}</td></tr>`;
    });
    html += '</table></div>';
  }

  if (clinical.vaccinesByType.length > 0) {
    html += '<div class="section"><h2>Vaccine Administration</h2><table>';
    html += '<tr><th>Vaccine</th><th>Doses</th></tr>';
    clinical.vaccinesByType.forEach(v => {
      html += `<tr><td>${esc(v.name)}</td><td class="numeric">${v.count}</td></tr>`;
    });
    html += '</table></div>';
  }

  if (clinical.topPrescribed.length > 0) {
    html += '<div class="section"><h2>Top Prescribed Items</h2><table>';
    html += '<tr><th>#</th><th>Item</th><th>Qty</th></tr>';
    clinical.topPrescribed.forEach((rx, i) => {
      html += `<tr><td>${i + 1}</td><td>${esc(rx.name)}</td><td class="numeric">${rx.qty}</td></tr>`;
    });
    html += '</table></div>';
  }

  if (clinical.recordsPerVet.length > 0) {
    html += '<div class="section"><h2>Records Per Vet</h2><table>';
    html += '<tr><th>Vet</th><th>Records</th></tr>';
    clinical.recordsPerVet.forEach(r => {
      html += `<tr><td>${esc(r.vet)}</td><td class="numeric">${r.count}</td></tr>`;
    });
    html += '</table></div>';
  }

  if (clinical.avgVitalsBySpecies.length > 0) {
    html += '<div class="section"><h2>Average Vitals By Species</h2><table>';
    html += '<tr><th>Species</th><th>Avg Weight (kg)</th><th>Avg Temp (C)</th><th>Avg HR (bpm)</th><th>Avg RR (bpm)</th><th>Sample</th></tr>';
    clinical.avgVitalsBySpecies.forEach(row => {
      html += `<tr><td>${esc(row.species)}</td><td class="numeric">${row.avgWeight || '--'}</td><td class="numeric">${row.avgTemp || '--'}</td><td class="numeric">${row.avgHR || '--'}</td><td class="numeric">${row.avgRR || '--'}</td><td class="numeric">${row.sampleSize}</td></tr>`;
    });
    html += '</table></div>';
  }

  return html;
}

function buildFinancialReport(data) {
  const { financial, deltas } = data;
  if (!financial) return '<p>Financial data not available.</p>';

  const isProfit = financial.netMargin >= 0;

  let html = '<div class="kpi-grid">';
  html += kpi('Revenue Collected', fmt(financial.totalCollected), `${financial.transactionCount} transactions`, deltas?.revenue);
  html += kpi('Total Billed', fmt(financial.totalBilled), 'before deposits');
  html += kpi('Total Expenses', fmt(financial.totalExpenses), '', deltas?.expenses);
  html += kpi('Net Margin', fmt(Math.abs(financial.netMargin)), isProfit ? 'profit' : 'loss');
  html += '</div>';

  html += '<div class="section"><h2>Payment Method Distribution</h2><table>';
  html += '<tr><th>Method</th><th>Amount</th><th>Percentage</th></tr>';
  const totalPayments = Object.values(financial.paymentMethods || {}).reduce((s, v) => s + v, 0);
  Object.entries(financial.paymentMethods || {}).sort(([, a], [, b]) => b - a).forEach(([method, amount]) => {
    const pct = totalPayments > 0 ? Math.round((amount / totalPayments) * 100) : 0;
    html += `<tr><td>${esc(method)}</td><td class="numeric">${fmt(amount)}</td><td class="numeric">${pct}%</td></tr>`;
  });
  html += '</table></div>';

  html += '<div class="section"><h2>Revenue By Department</h2><table>';
  html += '<tr><th>Department</th><th>Amount</th></tr>';
  Object.entries(financial.revByDept || {}).sort(([, a], [, b]) => b - a).forEach(([dept, amount]) => {
    html += `<tr><td>${esc(dept)}</td><td class="numeric">${fmt(amount)}</td></tr>`;
  });
  html += '</table></div>';

  html += '<div class="section"><h2>Expense Category Breakdown</h2><table>';
  html += '<tr><th>Category</th><th>Amount</th></tr>';
  Object.entries(financial.expenseCategories || {}).sort(([, a], [, b]) => b - a).forEach(([cat, amount]) => {
    html += `<tr><td>${esc(cat)}</td><td class="numeric">${fmt(amount)}</td></tr>`;
  });
  html += '</table></div>';

  html += '<div class="kpi-grid">';
  html += kpi('SC/PWD Discounts', fmt(financial.totalDiscounts),
    `${financial.scPwdCount} transactions (${financial.scPwdUsageRate}% usage)`);
  html += kpi('Avg Transaction', fmt(financial.avgTransactionValue),
    `${financial.transactionCount} total transactions`);
  html += kpi('Monthly Burn Rate', fmt(financial.monthlyBurnRate),
    `${fmt(financial.dailyExpenseRate)}/day avg`);
  html += kpi('Refund Rate', `${financial.refundRate}%`,
    `${financial.refundCount} refunds (${fmt(financial.totalRefunded)})`);
  html += '</div>';

  return html;
}

function buildAnalyticsReport(data) {
  const { growth, clinical, financial, deltas } = data;
  if (!growth && !clinical) return '<p>Analytics data not available.</p>';

  const isProfit = financial?.netMargin >= 0;
  let html = '';

  // ── FINANCIAL SUMMARY section ─────────────────────────────────
  if (financial) {
    html += '<div class="section"><h2>Financial Performance</h2>';
    html += '<div class="kpi-grid">';
    html += kpi('Revenue Collected', fmt(financial.totalCollected), `${financial.transactionCount} transactions`, deltas?.revenue);
    html += kpi('Total Expenses', fmt(financial.totalExpenses), '', deltas?.expenses);
    html += kpi('Net Margin', fmt(Math.abs(financial.netMargin)), isProfit ? 'Profit' : 'Loss');
    html += kpi('Collection Rate', `${financial.collectionRate || 0}%`);
    html += '</div>';

    // Radar Alert: Revenue Leakage
    if (financial.leakageCount > 0) {
      html += `
        <div class="kpi-card" style="border-color: #D32F2F; background: #FFEBEE; margin-bottom: 20px;">
          <div class="label" style="color: #D32F2F;">⚠ REVENUE LEAKAGE ALERT</div>
          <div class="value" style="color: #D32F2F;">${financial.leakageCount} Unbilled Appointments</div>
          <div class="sub" style="color: #3E2723; font-weight: 700; margin-top: 4px;">
            Estimated Missing Revenue: ${fmt(financial.leakageEstimatedAmount)}
          </div>
        </div>
      `;
    }
    html += '</div>';
  }

  // ── PATIENTS section ──────────────────────────────────────────
  if (growth) {
    html += '<div class="section"><h2>Patient & Growth Metrics</h2>';
    html += '<div class="kpi-grid">';
    html += kpi('New Clients', growth.newClientCount, 'registered this period', deltas?.uniqueClients);
    html += kpi('Total Active Clients', growth.totalActiveClients);
    html += kpi('Total Active Pets', growth.totalActivePets);
    if (growth.newPetsCount != null) {
      html += kpi('New Pets', growth.newPetsCount, 'registered this period');
    }
    html += '</div>';

    if (growth.topBreeds?.length > 0) {
      html += '<div class="section"><h2>Top Breeds</h2><table>';
      html += '<tr><th>#</th><th>Breed</th><th>Count</th></tr>';
      growth.topBreeds.forEach((b, i) => {
        html += `<tr><td>${i + 1}</td><td>${esc(b.breed)}</td><td class="numeric">${b.count}</td></tr>`;
      });
      html += '</table></div>';
    }

    html += '<div class="section"><h2>Species Distribution</h2><table>';
    html += '<tr><th>Species</th><th>Count</th></tr>';
    Object.entries(growth.speciesDistribution || {}).sort(([, a], [, b]) => b - a).forEach(([species, count]) => {
      html += `<tr><td>${esc(species)}</td><td class="numeric">${count}</td></tr>`;
    });
    html += '</table></div>';
    html += '</div>';
  }

  // ── APPOINTMENTS section ──────────────────────────────────────
  if (growth) {
    html += '<div class="section"><h2>Appointments</h2>';
    html += '<div class="kpi-grid">';
    html += kpi('Total Appointments', growth.totalAppointments,
      `${growth.walkInCount} walk-in / ${growth.scheduledCount} scheduled`);
    html += kpi('Clinic Utilization', `${growth.utilizationRate ?? '--'}%`);
    html += kpi('Booking Lead Time', growth.avgLeadTimeHours > 0 ? `${growth.avgLeadTimeHours}h` : '--',
      growth.leadTimeCount > 0 ? `avg from ${growth.leadTimeCount} bookings` : '');
    html += kpi('Client Retention', `${growth.retentionRate}%`,
      `${growth.returningClientCount} returning / ${growth.uniqueClientCount} total`);
    html += '</div>';

    if (growth.serviceRanking?.length > 0) {
      html += '<div class="section"><h2>Service Popularity</h2><table>';
      html += '<tr><th>#</th><th>Service</th><th>Appointments</th></tr>';
      growth.serviceRanking.forEach((s, i) => {
        html += `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td class="numeric">${s.count}</td></tr>`;
      });
      html += '</table></div>';
    }

    if (growth.peakHours?.filter(h => h.count > 0).length > 0) {
      html += '<div class="section"><h2>Peak Hours</h2><table>';
      html += '<tr><th>Hour</th><th>Appointments</th></tr>';
      growth.peakHours.filter(h => h.count > 0).forEach(h => {
        html += `<tr><td>${esc(h.label)}</td><td class="numeric">${h.count}</td></tr>`;
      });
      html += '</table></div>';
    }

    if (clinical?.noShowByWeekday) {
      html += '<div class="section"><h2>No-Show by Weekday</h2><table>';
      html += '<tr><th>Day</th><th>No-Shows</th></tr>';
      clinical.noShowByWeekday.filter(d => d.count > 0).forEach(d => {
        html += `<tr><td>${esc(d.day)}</td><td class="numeric">${d.count}</td></tr>`;
      });
      html += '</table></div>';
    }

    html += '</div>';
  }

  // ── CLINICAL section ──────────────────────────────────────────
  if (clinical) {
    html += '<div class="section"><h2>Clinical</h2>';
    html += '<div class="kpi-grid">';
    html += kpi('Records Signed', clinical.recordsSigned, 'this period');
    html += kpi('Vaccinations', clinical.totalVaccinations,
      `${clinical.vaccinesByType?.length ?? 0} vaccine types`);
    html += kpi('Follow-Up Compliance', `${clinical.followUpComplianceRate}%`,
      `${clinical.followUpAttended} attended / ${clinical.recordsWithFollowUp} requested`);
    html += kpi('Confinement Rate', `${clinical.confinementRate}%`,
      `${clinical.confinedCount} confined / ${clinical.carriedOverCount} carried over`);
    html += '</div>';

    if (clinical.amendmentRate != null) {
      html += '<div class="kpi-grid">';
      html += kpi('Amendment Rate', `${clinical.amendmentRate}%`,
        `${clinical.amendmentCount ?? 0} amendments from ${clinical.recordsSigned} records`);
      if (clinical.labTestsOrdered != null) {
        html += kpi('Lab Tests Ordered', clinical.labTestsOrdered, 'this period');
      }
      html += '</div>';
    }

    if (clinical.topDiagnoses?.length > 0) {
      html += '<div class="section"><h2>Top Diagnoses</h2><table>';
      html += '<tr><th>#</th><th>Diagnosis</th><th>Count</th></tr>';
      clinical.topDiagnoses.forEach((d, i) => {
        html += `<tr><td>${i + 1}</td><td>${esc(d.diagnosis)}</td><td class="numeric">${d.count}</td></tr>`;
      });
      html += '</table></div>';
    }

    if (clinical.diagnosisByCategory?.length > 0) {
      html += '<div class="section"><h2>Diagnosis by Category</h2><table>';
      html += '<tr><th>Category</th><th>Count</th></tr>';
      clinical.diagnosisByCategory.forEach(d => {
        html += `<tr><td>${esc(d.name)}</td><td class="numeric">${d.count}</td></tr>`;
      });
      html += '</table></div>';
    }

    if (clinical.severityDistribution?.length > 0) {
      html += '<div class="section"><h2>Severity Distribution</h2><table>';
      html += '<tr><th>Severity</th><th>Count</th></tr>';
      clinical.severityDistribution.forEach(s => {
        html += `<tr><td>${esc(s.name)}</td><td class="numeric">${s.count}</td></tr>`;
      });
      html += '</table></div>';
    }

    if (clinical.labStatusDistribution?.length > 0) {
      html += '<div class="section"><h2>Lab Test Status Breakdown</h2><table>';
      html += '<tr><th>Status</th><th>Count</th></tr>';
      clinical.labStatusDistribution.forEach(s => {
        html += `<tr><td>${esc(s.name)}</td><td class="numeric">${s.value}</td></tr>`;
      });
      html += '</table></div>';
    }

    if (clinical.topLabTests?.length > 0) {
      html += '<div class="section"><h2>Most Ordered Lab Tests</h2><table>';
      html += '<tr><th>#</th><th>Test</th><th>Count</th></tr>';
      clinical.topLabTests.forEach((t, i) => {
        html += `<tr><td>${i + 1}</td><td>${esc(t.name)}</td><td class="numeric">${t.count}</td></tr>`;
      });
      html += '</table></div>';
    }

    if (clinical.noShowByWeekday?.some(d => d.count > 0)) {
      html += '<div class="section"><h2>No-Show by Weekday</h2><table>';
      html += '<tr><th>Day</th><th>No-Shows</th></tr>';
      clinical.noShowByWeekday.filter(d => d.count > 0).forEach(d => {
        html += `<tr><td>${esc(d.day)}</td><td class="numeric">${d.count}</td></tr>`;
      });
      html += '</table></div>';
    }

    if (clinical.vaccinesByType?.length > 0) {
      html += '<div class="section"><h2>Vaccine Administration</h2><table>';
      html += '<tr><th>Vaccine</th><th>Doses</th></tr>';
      clinical.vaccinesByType.forEach(v => {
        html += `<tr><td>${esc(v.name)}</td><td class="numeric">${v.count}</td></tr>`;
      });
      html += '</table></div>';
    }

    if (clinical.topPrescribed?.length > 0) {
      html += '<div class="section"><h2>Top Prescribed Items</h2><table>';
      html += '<tr><th>#</th><th>Item</th><th>Qty</th></tr>';
      clinical.topPrescribed.forEach((rx, i) => {
        html += `<tr><td>${i + 1}</td><td>${esc(rx.name)}</td><td class="numeric">${rx.qty}</td></tr>`;
      });
      html += '</table></div>';
    }

    if (clinical.recordsPerVet?.length > 0) {
      html += '<div class="section"><h2>Records Per Vet</h2><table>';
      html += '<tr><th>Vet</th><th>Records</th></tr>';
      clinical.recordsPerVet.forEach(r => {
        html += `<tr><td>${esc(r.vet)}</td><td class="numeric">${r.count}</td></tr>`;
      });
      html += '</table></div>';
    }

    if (clinical.avgVitalsBySpecies?.length > 0) {
      html += '<div class="section"><h2>Average Vitals by Species</h2><table>';
      html += '<tr><th>Species</th><th>Avg Weight (kg)</th><th>Avg Temp (C)</th><th>Avg HR (bpm)</th><th>Avg RR (bpm)</th><th>Sample</th></tr>';
      clinical.avgVitalsBySpecies.forEach(row => {
        html += `<tr><td>${esc(row.species)}</td><td class="numeric">${row.avgWeight || '--'}</td><td class="numeric">${row.avgTemp || '--'}</td><td class="numeric">${row.avgHR || '--'}</td><td class="numeric">${row.avgRR || '--'}</td><td class="numeric">${row.sampleSize}</td></tr>`;
      });
      html += '</table></div>';
    }

    html += '</div>';
  }

  return html;
}

function buildFinancialReportExtended(data) {
  const { financial, deltas } = data;
  if (!financial) return '<p>Financial data not available.</p>';

  const isProfit = financial.netMargin >= 0;

  let html = '<div class="kpi-grid">';
  html += kpi('Revenue Collected', fmt(financial.totalCollected), `${financial.transactionCount} transactions`, deltas?.revenue);
  html += kpi('Total Billed', fmt(financial.totalBilled), 'before deposits');
  html += kpi('Total Expenses', fmt(financial.totalExpenses), '', deltas?.expenses);
  html += kpi('Net Margin', fmt(Math.abs(financial.netMargin)), isProfit ? 'profit' : 'loss');
  html += '</div>';

  if (financial.collectionRate != null) {
    html += '<div class="kpi-grid">';
    html += kpi('Collection Rate', `${financial.collectionRate}%`,
      financial.collectionRate >= 90 ? 'Healthy' : financial.collectionRate >= 70 ? 'Below target' : 'Action needed');
    if (financial.upcomingRevenue != null) {
      html += kpi('Revenue Forecast', fmt(financial.upcomingRevenue),
        `${financial.upcomingCount ?? 0} upcoming appointments`);
    }
    if (financial.depositTotal != null) {
      html += kpi('Deposit Breakdown', fmt(financial.depositTotal), 'deposits collected');
    }
    html += kpi('Avg Transaction', fmt(financial.avgTransactionValue),
      `${financial.transactionCount} total transactions`);
    html += '</div>';
  }

  if (financial.scPwdDiscountTotal != null || financial.customDiscountTotal != null) {
    html += '<div class="kpi-grid">';
    html += kpi('SC/PWD Discounts', fmt(financial.scPwdDiscountTotal ?? financial.totalDiscounts),
      `${financial.scPwdCount} transactions (${financial.scPwdUsageRate}% usage)`);
    if (financial.customDiscountTotal != null) {
      html += kpi('Custom Discounts', fmt(financial.customDiscountTotal), 'non-SC/PWD discounts');
    }
    html += kpi('Monthly Burn Rate', fmt(financial.monthlyBurnRate),
      `${fmt(financial.dailyExpenseRate)}/day avg`);
    html += kpi('Refund Rate', `${financial.refundRate}%`,
      `${financial.refundCount} refunds (${fmt(financial.totalRefunded)})`);
    html += '</div>';
  } else {
    html += '<div class="kpi-grid">';
    html += kpi('SC/PWD Discounts', fmt(financial.totalDiscounts),
      `${financial.scPwdCount} transactions (${financial.scPwdUsageRate}% usage)`);
    html += kpi('Avg Transaction', fmt(financial.avgTransactionValue),
      `${financial.transactionCount} total transactions`);
    html += kpi('Monthly Burn Rate', fmt(financial.monthlyBurnRate),
      `${fmt(financial.dailyExpenseRate)}/day avg`);
    html += kpi('Refund Rate', `${financial.refundRate}%`,
      `${financial.refundCount} refunds (${fmt(financial.totalRefunded)})`);
    html += '</div>';
  }

  html += '<div class="section"><h2>Payment Method Distribution</h2><table>';
  html += '<tr><th>Method</th><th>Amount</th><th>Percentage</th></tr>';
  const totalPayments = Object.values(financial.paymentMethods || {}).reduce((s, v) => s + v, 0);
  Object.entries(financial.paymentMethods || {}).sort(([, a], [, b]) => b - a).forEach(([method, amount]) => {
    const pct = totalPayments > 0 ? Math.round((amount / totalPayments) * 100) : 0;
    html += `<tr><td>${esc(method)}</td><td class="numeric">${fmt(amount)}</td><td class="numeric">${pct}%</td></tr>`;
  });
  html += '</table></div>';

  html += '<div class="section"><h2>Revenue by Department</h2><table>';
  html += '<tr><th>Department</th><th>Amount</th></tr>';
  Object.entries(financial.revByDept || {}).sort(([, a], [, b]) => b - a).forEach(([dept, amount]) => {
    html += `<tr><td>${esc(dept)}</td><td class="numeric">${fmt(amount)}</td></tr>`;
  });
  html += '</table></div>';

  if (financial.revenueByService?.length > 0) {
    html += '<div class="section"><h2>Revenue by Service</h2><table>';
    html += '<tr><th>#</th><th>Service</th><th>Amount</th></tr>';
    financial.revenueByService.forEach((s, i) => {
      html += `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td class="numeric">${fmt(s.amount)}</td></tr>`;
    });
    html += '</table></div>';
  }

  if (financial.topSoldProducts?.length > 0) {
    html += '<div class="section"><h2>Top Sold Products</h2><table>';
    html += '<tr><th>#</th><th>Product</th><th>Qty</th></tr>';
    financial.topSoldProducts.forEach((p, i) => {
      html += `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td class="numeric">${p.count}</td></tr>`;
    });
    html += '</table></div>';
  }

  if (financial.topSpendingClients?.length > 0) {
    html += '<div class="section"><h2>Top Spending Clients</h2><table>';
    html += '<tr><th>#</th><th>Client</th><th>Total Spent</th></tr>';
    financial.topSpendingClients.forEach((c, i) => {
      html += `<tr><td>${i + 1}</td><td>${esc(c.name)}</td><td class="numeric">${fmt(c.amount)}</td></tr>`;
    });
    html += '</table></div>';
  }

  html += '<div class="section"><h2>Expense Category Breakdown</h2><table>';
  html += '<tr><th>Category</th><th>Amount</th></tr>';
  Object.entries(financial.expenseCategories || {}).sort(([, a], [, b]) => b - a).forEach(([cat, amount]) => {
    html += `<tr><td>${esc(cat)}</td><td class="numeric">${fmt(amount)}</td></tr>`;
  });
  html += '</table></div>';

  return html;
}

function buildPerformanceReport(data, clinicSettings, period) {
  // Use the forensic report HTML generator to produce the performance section.
  // We inline all 3 sub-sections (consult, audit, staff) as a combined document body.
  if (!data?.performanceData) {
    return '<p>Performance data is not available for this period. Visit the PERFORMANCE tab to generate it first, then export.</p>';
  }

  const reportData = data.performanceData;
  const toDate = (v) => v instanceof Date ? v : (v?.toDate?.() ?? new Date());
  const startDate = data.dateRange
    ? toDate(data.dateRange.startDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    : new Date().toLocaleDateString('en-CA');
  const endDate = data.dateRange
    ? toDate(data.dateRange.endDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    : new Date().toLocaleDateString('en-CA');

  // Generate inline HTML bodies for all 3 sub-tabs to create a combined section
  const consultHtml = generateForensicReportHTML({
    tabKey: 'consult',
    reportData,
    clinicSettings,
    startDate,
    endDate,
  });
  const auditHtml = generateForensicReportHTML({
    tabKey: 'audit',
    reportData,
    clinicSettings,
    startDate,
    endDate,
  });
  const staffHtml = generateForensicReportHTML({
    tabKey: 'staff',
    reportData,
    clinicSettings,
    startDate,
    endDate,
  });

  // Extract just the body content (between <body> tags) from each generated document
  const extractBody = (html) => {
    const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return match ? match[1] : html;
  };

  return `
    <div class="section"><h2>Consult Performance</h2></div>
    ${extractBody(consultHtml)}
    <div class="section"><h2>Audit Integrity</h2></div>
    ${extractBody(auditHtml)}
    <div class="section"><h2>Staff Workload</h2></div>
    ${extractBody(staffHtml)}
  `;
}

// ── Period label lookup (shared between single-tab and full-report exports) ──
const PERIOD_LABELS = {
  today:   'Today',
  week:    'This Week',
  month:   'This Month',
  quarter: 'This Quarter',
  year:    'This Year',
  '3month': 'Last 3 Months',
  '6month': 'Last 6 Months',
  '1year':  'Last 1 Year',
};

export function generateReportHTML(tabKey, data, clinicSettings, period) {
  const clinicName = esc(clinicSettings.clinicName || 'Starbarks Veterinary Clinic');
  const now = new Date();
  const generated = now.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const periodLabel = PERIOD_LABELS[period] || period;

  const toDate = (v) => v instanceof Date ? v : (v?.toDate?.() ?? new Date());
  const dateRangeStr = data.dateRange
    ? `${toDate(data.dateRange.startDate).toLocaleDateString('en-PH')} — ${toDate(data.dateRange.endDate).toLocaleDateString('en-PH')}`
    : periodLabel;

  const tabLabels = {
    // New tab keys
    today:       'Operations Report',
    analytics:   'Analytics Report',
    financial:   'Financial Report',
    performance: 'Performance Report',
    // Legacy keys for backward compat
    ops:         'Operations Report',
    growth:      'Growth Report',
    clinical:    'Clinical Report',
  };

  let body = '';
  switch (tabKey) {
    case 'today':
    case 'ops':        body = buildOpsReport(data); break;
    case 'analytics':
    case 'growth':
    case 'clinical':   body = buildAnalyticsReport(data); break;
    case 'financial':  body = buildFinancialReportExtended(data); break;
    case 'performance': body = buildPerformanceReport(data, clinicSettings, period); break;
    default:           body = '<p>Unknown tab</p>';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(tabLabels[tabKey])} — ${clinicName}</title>
  <style>${REPORT_CSS}</style>
</head>
<body>
  <div class="header">
    <h1>${clinicName}</h1>
    <div class="subtitle">${esc(tabLabels[tabKey])}</div>
    <div class="period">${esc(periodLabel)} &mdash; ${esc(dateRangeStr)}</div>
  </div>

  ${body}

  <div class="footer">
    Generated on ${esc(generated)} &bull; VetConnect Admin Dashboard
  </div>
</body>
</html>`;
}

/**
 * Generates a single HTML document containing all Dashboard tab reports
 * (Operations, Growth, Clinical, and — for admins — Financial), separated
 * by CSS page breaks for clean PDF/print output.
 *
 * Operations is always "today" data regardless of the selected period;
 * its section heading makes this explicit with "(Today)".
 *
 * @param {object}  data           - Full return value from useDashboardData
 * @param {object}  clinicSettings - From useClinicSettings
 * @param {string}  period         - Active period key (e.g. 'month', 'week')
 * @returns {string} Complete HTML document string
 */
export function generateFullReportHTML(data, clinicSettings, period) {
  const clinicName = esc(clinicSettings.clinicName || 'Starbarks Veterinary Clinic');
  const now = new Date();
  const generated = now.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const periodLabel = PERIOD_LABELS[period] || period;

  const toDate = (v) => v instanceof Date ? v : (v?.toDate?.() ?? new Date());
  const dateRangeStr = data.dateRange
    ? `${toDate(data.dateRange.startDate).toLocaleDateString('en-PH')} — ${toDate(data.dateRange.endDate).toLocaleDateString('en-PH')}`
    : periodLabel;

  // Today tab is always forced to today-period data regardless of the selected period;
  // its section heading makes this explicit with "(Today)".
  const sections = [
    { title: `Operations Report (Today)`,          body: buildOpsReport(data) },
    { title: `Analytics Report (${periodLabel})`,  body: buildAnalyticsReport(data) },
    { title: `Financial Report (${periodLabel})`,  body: buildFinancialReportExtended(data) },
    { title: `Performance Report (${periodLabel})`, body: buildPerformanceReport(data, clinicSettings, period) },
  ];

  const tabsHTML = sections.map((section, i) => `
    ${i > 0 ? '<div class="page-break"></div>' : ''}
    <div class="tab-section">
      <h2 class="tab-title">${esc(section.title)}</h2>
      ${section.body}
    </div>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Full Dashboard Report — ${clinicName}</title>
  <style>
    ${REPORT_CSS}
    /* Multi-tab layout additions */
    .page-break {
      page-break-before: always;
      margin-top: 40px;
    }
    .tab-title {
      font-size: 16px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #3E2723;
      border-bottom: 2px solid #5D4037;
      padding-bottom: 6px;
      margin-bottom: 16px;
      margin-top: 24px;
    }
    .tab-section {
      margin-bottom: 30px;
    }
    @media print {
      .page-break { page-break-before: always; margin-top: 0; }
      .tab-section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${clinicName}</h1>
    <div class="subtitle">Full Dashboard Report</div>
    <div class="period">${esc(periodLabel)} &mdash; ${esc(dateRangeStr)}</div>
  </div>

  ${tabsHTML}

  <div class="footer">
    Generated on ${esc(generated)} &bull; VetConnect Admin Dashboard &bull; All Tabs
  </div>
</body>
</html>`;
}
