import { UNIFIED_PRINT_STYLES, formatPrintDate, esc, calculatePetAge } from './printUtils';
import { resolveVitals } from './resolveVitals';
import { resolveObjectiveText } from './examUtils';
import {
  classifyAmendments,
  isNewEntry,
  amendmentAuthorName,
  kindChipLabel,
  entryDate,
  formatDiffValue,
  snapshotSummary,
} from './amendmentDisplay';
import {
  renderVitalsSection,
  renderPrescriptionsSection,
  renderVaccineSection,
  renderLabResultsSection,
  renderDischargeSection,
  renderServicesSection,
} from './printVisitSummary';

function renderDiagnosesSection(diagnoses) {
  if (!diagnoses?.length) return '';
  const rows = diagnoses.map(d => `
    <tr>
      <td><b style="font-size:13px;">${esc(d.name || '—')}</b></td>
      <td style="text-align:center;">${esc(d.severity || '—')}</td>
      <td style="text-align:center;">${esc(d.category || '—')}</td>
      <td>${esc(d.notes || '—')}</td>
    </tr>
  `).join('');
  return `
    <div class="section-anchor">Diagnoses Detail (Internal)</div>
    <table class="data-table">
      <thead>
        <tr><th>Name</th><th style="text-align:center;">Severity</th><th style="text-align:center;">Category</th><th>Clinical Notes</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderExamChecklistSection(examChecklist) {
  if (!examChecklist || !Object.keys(examChecklist).length) return '';
  const rows = Object.entries(examChecklist).map(([system, finding]) => `
    <tr>
      <td style="font-weight:900; text-transform:uppercase; font-size:10px; color:#888;">${esc(system.replace(/([A-Z])/g, ' $1').trim())}</td>
      <td>${esc(typeof finding === 'string' ? finding : (finding?.finding || finding?.value || JSON.stringify(finding)))}</td>
    </tr>
  `).join('');
  return `
    <div class="section-anchor">Physical Exam Checklist</div>
    <table class="data-table">
      <thead><tr><th style="width:150px;">System</th><th>Clinical Finding</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// T4.243 Phase 3a: audit trail rendered from the shared amendmentDisplay helpers so print
// matches the on-screen trail. Handles new per-field diff entries, legacy AmendmentDialog
// entries, and the frozen original baseline.
function renderAmendmentHistorySection(amendments) {
  const { original, trail, count } = classifyAmendments(amendments);
  // count excludes the frozen original; a lone original can't occur (baseline is only written
  // alongside a revision). Hide when there are no trail entries — matches AmendmentsTrail.jsx.
  if (count === 0) return '';

  const fmt = (d) => (d ? d.toLocaleString('en-PH') : '—');

  const entriesHTML = trail.map((e) => {
    let body;
    if (isNewEntry(e)) {
      const chip = kindChipLabel(e);
      const rows = (e.diff || []).map((d) => {
        const action = d.changeType === 'added' ? 'Added' : d.changeType === 'removed' ? 'Removed' : 'Changed';
        return `
          <tr>
            <td style="font-weight:700;">${esc(action)}</td>
            <td>${esc(d.fieldLabel || '—')}</td>
            <td style="color:#666;">${d.changeType === 'added' ? '—' : esc(formatDiffValue(d.fieldKey, d.before))}</td>
            <td style="font-weight:700;">${d.changeType === 'removed' ? '—' : esc(formatDiffValue(d.fieldKey, d.after))}</td>
          </tr>`;
      }).join('');
      const heading = `Amendment ${esc(String(e.revisionNumber ?? ''))} &middot; ${esc(amendmentAuthorName(e))} &middot; ${esc(fmt(entryDate(e)))}${chip ? ` &middot; [${esc(chip)}]` : ''}`;
      const reason = e.reason ? `<p style="margin:2px 0 4px; font-style:italic; color:#555;">Reason: ${esc(e.reason)}</p>` : '';
      body = `
        <div style="font-weight:900; font-size:11px;">${heading}</div>
        ${reason}
        <table class="data-table"><thead><tr><th>Change</th><th>Field</th><th>Previous</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table>`;
    } else {
      // legacy AmendmentDialog entry — reason + free-text/SOAP + vitals + added meds (parity with LegacyEntryCard)
      const soapText = ['subjective', 'objective', 'assessment', 'plan']
        .filter((k) => e.soap?.[k])
        .map((k) => `<b>${k[0].toUpperCase()}:</b> ${esc(e.soap[k])}`)
        .join('<br/>');
      const vitalsText = e.vitals ? [
        e.vitals.weight ? `Wt ${esc(String(e.vitals.weight))} kg` : null,
        e.vitals.temp ? `Temp ${esc(String(e.vitals.temp))} °C` : null,
        e.vitals.hr ? `HR ${esc(String(e.vitals.hr))} bpm` : null,
        e.vitals.rr ? `RR ${esc(String(e.vitals.rr))} rpm` : null,
        e.vitals.crt ? `CRT ${esc(String(e.vitals.crt))}s` : null,
        e.vitals.bcs ? `BCS ${esc(String(e.vitals.bcs))}/9` : null,
        e.vitals.pain ? `Pain ${esc(String(e.vitals.pain))}/4` : null,
      ].filter(Boolean).join(' &middot; ') : '';
      const medsText = e.addedMedications?.length
        ? e.addedMedications.map((m) => `${esc(m.name || '')}${m.qty ? ` x${esc(String(m.qty))}` : ''}${m.instructions ? ` — ${esc(m.instructions)}` : ''}`).join('<br/>')
        : '';
      const heading = `Amendment &middot; ${esc(amendmentAuthorName(e))} &middot; ${esc(fmt(entryDate(e)))}`;
      const reason = e.reason ? `<p style="margin:2px 0 4px; font-weight:700; color:#555;">Reason: ${esc(e.reason)}</p>` : '';
      body = `
        <div style="font-weight:900; font-size:11px;">${heading}</div>
        ${reason}
        ${e.text ? `<p style="margin:2px 0;">${esc(e.text)}</p>` : ''}
        ${soapText ? `<p style="margin:2px 0;">${soapText}</p>` : ''}
        ${vitalsText ? `<p style="margin:2px 0; color:#555;"><b>Vitals:</b> ${vitalsText}</p>` : ''}
        ${medsText ? `<p style="margin:2px 0;"><b>Added Medications:</b><br/>${medsText}</p>` : ''}`;
    }
    // border-left uses COLORS.warning (#E65100) — hex literal required in print HTML strings
    return `<div style="margin-bottom:10px; padding-left:8px; border-left:3px solid #E65100;">${body}</div>`;
  }).join('');

  const originalHTML = original ? (() => {
    const sum = snapshotSummary(original.snapshot).map((s) => `<b>${esc(s.label)}:</b> ${esc(s.value)}`).join(' &middot; ');
    return `<div style="margin-top:6px; padding:8px; border:1px dashed #999; color:#666; font-size:11px;">
      &#128274; Original &middot; signed ${esc(fmt(entryDate(original)))} &middot; ${esc(amendmentAuthorName(original))} &middot; frozen${sum ? `<br/>${sum}` : ''}
    </div>`;
  })() : '';

  return `
    <div class="section-anchor">Audit Trail: Amendment History (${count})</div>
    ${entriesHTML}
    ${originalHTML}
  `;
}

function renderHeadboard({ clinicName, clinicAddress, clinicPhone, clinicEmail, pet, owner, visitDate, vetName, vetPRC, vetPTR, allergyList, contactLabel }) {
  const petName = esc(pet?.name || '—');
  const species = esc(pet?.species || '—');
  const breed = esc((pet?.breed && pet.breed !== 'Unknown Breed') ? pet.breed : '—');
  const typeLabel = `${species} (${breed})`;
  
  const sexLabel = pet?.gender === 'Male' ? (pet?.isNeutered ? 'Male Neutered (MN)' : 'Male Intact (MI)')
    : pet?.gender === 'Female' ? (pet?.isNeutered ? 'Female Spayed (FS)' : 'Female Intact (FI)')
    : '—';
    
  const ageLabel = calculatePetAge(pet?.dob);
  const ownerName = esc(owner?.fullName || owner?.displayName || owner?.name || '—');

  return `
    <div class="header-container">
      <div class="clinic-info">
        <h1 class="clinic-name">${esc(clinicName || 'Veterinary Clinic')}</h1>
        <p class="clinic-meta">${esc(clinicAddress || '')}</p>
        <p class="clinic-meta">TEL: ${esc(clinicPhone || '—')} &middot; EMAIL: ${esc(clinicEmail || '—')}</p>
      </div>
    </div>

    <div class="memo-grid">
      <div class="memo-row">
        <div class="memo-label">Patient</div>
        <div class="memo-value">${petName}</div>
        <div class="memo-label">Type</div>
        <div class="memo-value">${typeLabel}</div>
      </div>
      <div class="memo-row">
        <div class="memo-label">Sex</div>
        <div class="memo-value">${sexLabel}</div>
        <div class="memo-label">Age</div>
        <div class="memo-value">${ageLabel}</div>
      </div>
      <div style="grid-column: span 4; border-top: 1px dashed #EEE; padding: 8px 0; margin-top: 4px;">
        <div class="memo-label" style="margin-bottom: 2px;">Allergies</div>
        <div class="memo-value" style="font-size: 14px; color: #1A1A1A;">${allergyList || 'None Recorded'}</div>
      </div>
      <div class="memo-row">
        <div class="memo-label">Owner</div>
        <div class="memo-value">${ownerName}</div>
        <div class="memo-label">Contact</div>
        <div class="memo-value">${contactLabel}</div>
      </div>
      <div class="memo-row">
        <div class="memo-label">Visit Date</div>
        <div class="memo-value">${visitDate}</div>
        <div class="memo-label">Attending</div>
        <div class="memo-value">
          ${vetName} ${vetPRC ? `(PRC: ${vetPRC})` : ''}
          <div style="font-size: 10px; color: #666; margin-top: 2px;">PTR No. ${esc(vetPTR || '—')}</div>
        </div>
      </div>
    </div>
  `;
}

export function generateInternalRecordHTML({
  record, pet, owner,
  clinicName, clinicAddress, clinicPhone, clinicEmail, clinicBAI, clinicTIN,
  vetStaff, appointment,
}) {
  const rec = record || {};
  const soap = rec.soap || {};

  const visitDate = formatPrintDate(rec.date);
  const vetName = esc(vetStaff?.fullName || rec.vetName || '—');
  const vetPRC = esc(vetStaff?.prcLicense || '');
  const vetPTR = esc(vetStaff?.ptrNumber || '');

  const rawAllergies = pet?.petAllergies || pet?.allergies || rec.allergies;
  const allergyList = (rawAllergies && !['None', 'None recorded', ''].includes(rawAllergies)) ? esc(rawAllergies) : null;

  const ownerPhone = esc(owner?.phone || owner?.contactNumber || '—');
  const ownerEmail = esc(owner?.email || '—');
  const contactLabel = `${ownerPhone} | ${ownerEmail}`;

  const objectiveText = resolveObjectiveText(rec);
  
  let assessmentContent = '';
  if (rec.diagnoses?.length > 0) {
    assessmentContent = rec.diagnoses.map(d => {
      let line = d.severity ? `[${d.severity}] ${d.name}` : d.name;
      if (d.notes) line += ` — ${d.notes}`;
      return line;
    }).join('\n');
  } else {
    assessmentContent = soap.assessment || rec.diagnosis || '—';
  }

  const statusLine = [
    rec.patientStatus ? `STATUS: ${rec.patientStatus.toUpperCase()}` : '',
    rec.soap?.prognosis ? `PROGNOSIS: ${rec.soap.prognosis.toUpperCase()}` : ''
  ].filter(Boolean).join('  |  ');

  const assessmentText = (statusLine ? `【 ${statusLine} 】\n\n` : '') + 
    assessmentContent + 
    (rec.assessmentNotes ? '\n\n' + rec.assessmentNotes : '');

  const rvPrint = resolveVitals(rec);

  const soapSections = [
    { label: 'S — Subjective (History & Client Report)', content: soap.subjective },
    { label: 'O — Objective (Exam & Findings)', content: objectiveText },
    { label: 'A — Assessment (Diagnosis & Prognosis)', content: assessmentText },
    { label: 'P — Plan (Treatment & Rechecks)', content: soap.plan || rec.treatment },
  ];

  const soapHtml = soapSections.map(s => {
    const isEmpty = !s.content || s.content === '—';
    return `
      <div class="section-anchor">${esc(s.label)}</div>
      <div class="content-text ${isEmpty ? 'empty' : ''}" style="white-space: pre-wrap; margin-bottom: 24px;">${esc(s.content || '—')}</div>
    `;
  }).join('');

  const allItems = rec.dispensedProducts || rec.prescriptions || [];
  const resolvePC = (rx) => rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
  const medicineItems = allItems.filter(rx => resolvePC(rx) === 'medicine');
  const otherItems = allItems.filter(rx => resolvePC(rx) !== 'medicine');

  const now = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title></title>
  <style>${UNIFIED_PRINT_STYLES}</style>
</head>
<body>
  ${renderHeadboard({ clinicName, clinicAddress, clinicPhone, clinicEmail, clinicBAI, pet, owner, visitDate, vetName, vetPRC, vetPTR, allergyList, contactLabel })}

  ${renderVitalsSection(rvPrint)}

  ${soapHtml}

  ${renderDiagnosesSection(rec.diagnoses)}
  ${renderPrescriptionsSection(medicineItems, 'Medical Prescriptions')}
  ${renderPrescriptionsSection(otherItems, 'Retail & Other Dispensary')}
  ${renderVaccineSection(rec.vaccineData)}
  ${renderLabResultsSection(rec.labResults)}
  ${renderServicesSection(rec)}
  ${renderExamChecklistSection(rec.objectiveExam || rec.examChecklist)}
  ${renderAmendmentHistorySection(rec.amendments)}
  ${renderDischargeSection(rec.dischargeSummary)}

  <div class="signature-area">
    <div style="font-size: 9px; font-weight: 900; color: #888; text-transform: uppercase; margin-bottom: 2px;">Signed by</div>
    <div class="sig-name">${vetName}</div>
    <div class="sig-line" style="margin-top: 8px;"></div>
    <div class="sig-title">Attending Veterinarian ${vetPRC ? `&middot; PRC: ${vetPRC}` : ''}</div>
  </div>

  <div class="reg-footer">
    <span>BAI Reg No: ${esc(clinicBAI || '—')}</span>
    <span>TIN: ${esc(clinicTIN || '—')}</span>
    <span>Generated: ${now}</span>
  </div>
</body>
</html>`;
}

export function generateCombinedPrintHTML(clientHTML, internalHTML) {
  const clientBody = clientHTML.replace(/<\/body>\s*<\/html>\s*$/i, '');
  const internalBody = internalHTML.replace(/^[\s\S]*?<body[^>]*>/i, '');
  return `${clientBody}
    <div style="page-break-before:always;"></div>
    ${internalBody}`;
}
