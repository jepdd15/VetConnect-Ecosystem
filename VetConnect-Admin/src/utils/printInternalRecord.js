import { PRINT_STYLES, formatPrintDate, esc, calculatePetAge } from './printUtils';
import { resolveVitals } from './resolveVitals';
import { resolveObjectiveText } from './examUtils';
import {
  renderVitalsSection,
  renderPrescriptionsSection,
  renderVaccineSection,
  renderLabResultsSection,
  renderDischargeSection,
  renderAttachmentsSection,
} from './printVisitSummary';

function renderDiagnosesSection(diagnoses) {
  if (!diagnoses?.length) return '';
  const rows = diagnoses.map(d => `
    <tr>
      <td><strong style="font-size:13px;">${esc(d.name || '—')}</strong></td>
      <td style="text-align:center;">${esc(d.severity || '—')}</td>
      <td style="text-align:center;">${esc(d.category || '—')}</td>
      <td>${esc(d.notes || '—')}</td>
    </tr>
  `).join('');
  return `
    <h2>Diagnoses Detail</h2>
    <table>
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
      <td style="font-weight:600; text-transform:capitalize;">${esc(system.replace(/([A-Z])/g, ' $1').trim())}</td>
      <td>${esc(typeof finding === 'string' ? finding : (finding?.finding || finding?.value || JSON.stringify(finding)))}</td>
    </tr>
  `).join('');
  return `
    <h2>Physical Exam</h2>
    <table>
      <thead><tr><th>System</th><th>Finding</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderAmendmentHistorySection(amendments) {
  if (!amendments?.length) return '';
  const rows = amendments.map(a => {
    const ts = a.timestamp?.toDate
      ? a.timestamp.toDate().toLocaleString('en-PH')
      : (a.timestamp ? new Date(a.timestamp).toLocaleString('en-PH') : '—');
    return `
      <tr>
        <td>${esc(a.vetName || a.by || '—')}</td>
        <td>${esc(ts)}</td>
        <td>${esc(a.field || '—')}</td>
        <td>${esc(String(a.oldValue ?? '—'))}</td>
        <td>${esc(String(a.newValue ?? '—'))}</td>
      </tr>
    `;
  }).join('');
  return `
    <h2>Amendment History</h2>
    <table>
      <thead><tr><th>Vet</th><th>Timestamp</th><th>Field</th><th>Previous</th><th>Updated</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}



function renderHeadboard({ clinicName, clinicAddress, clinicPhone, clinicBAI, pet, owner, visitDate, vetName, vetPRC, vetPTR, department }) {
  const sexLabel = pet?.gender === 'Male'
    ? (pet?.isNeutered ? 'MN (Male Neutered)' : 'MI (Male Intact)')
    : pet?.gender === 'Female'
      ? (pet?.isNeutered ? 'FS (Female Spayed)' : 'FI (Female Intact)')
      : '—';
  const age = calculatePetAge(pet?.dob);

  return `
    <div class="headboard">
      <div class="headboard-column">
        <div class="clinic-branding">
          <div class="clinic-name">${esc(clinicName || 'Veterinary Clinic')}</div>
          <div class="clinic-meta">${esc(clinicAddress || '')}</div>
          ${clinicPhone ? `<div class="clinic-meta">TEL: ${esc(clinicPhone)}</div>` : ''}
          ${clinicBAI ? `<div class="clinic-meta">BAI REG: ${esc(clinicBAI)}</div>` : ''}
        </div>
      </div>

      <div class="headboard-column">
        <div class="headboard-label">Patient / Owner</div>
        <div class="headboard-value" style="font-size:15px; font-weight:900;">${esc(pet?.name || '—')}</div>
        <div class="headboard-value" style="font-size:11px; opacity:0.8;">Owner: ${esc(owner?.fullName || owner?.displayName || owner?.name || '—')} (${esc(owner?.phone || owner?.contactNumber || '—')})</div>
        
        <div style="margin-top:8px;">
          <div class="headboard-label">Species / Breed</div>
          <div class="headboard-value">${esc(pet?.species || '—')} · ${esc(pet?.breed || '—')}</div>
        </div>

        <div style="margin-top:8px;">
          <div class="headboard-label">Sex / Age</div>
          <div class="headboard-value">${esc(sexLabel)} · ${esc(age)}</div>
        </div>
      </div>

      <div class="headboard-column">
        <div class="headboard-label">Visit Date</div>
        <div class="headboard-value" style="font-size:14px;">${esc(visitDate)}</div>

        <div style="margin-top:8px;">
          <div class="headboard-label">Attending Veterinarian</div>
          <div class="headboard-value">${esc(vetName)}</div>
          ${vetPRC ? `<div class="clinic-meta" style="font-size:9px; margin-top:2px;">PRC: ${esc(vetPRC)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

export function generateInternalRecordHTML({
  record, pet, owner,
  clinicName, clinicAddress, clinicPhone, clinicBAI,
  vetStaff, appointment,
}) {
  const rec = record || {};
  const soap = rec.soap || {};

  const visitDate = formatPrintDate(rec.date);
  const vetName = esc(vetStaff?.fullName || rec.vetName || '—');
  const vetPRC = esc(vetStaff?.prcLicense || '');
  const vetPTR = esc(vetStaff?.ptrNumber || '');
  const department = esc(rec.department || appointment?.department || 'General');

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

  // Add Status & Prognosis badges
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
      <div class="soap-block">
        <div class="soap-header">${esc(s.label)}</div>
        <div class="soap-content ${isEmpty ? 'empty' : ''}">${esc(s.content || '—')}</div>
      </div>
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
  <style>${PRINT_STYLES}</style>
</head>
<body>
  ${renderHeadboard({ clinicName, clinicAddress, clinicPhone, clinicBAI, pet, owner, visitDate, vetName, vetPRC, vetPTR, department })}

  ${renderVitalsSection(rvPrint)}

  ${soapHtml}

  ${renderDiagnosesSection(rec.diagnoses)}
  ${renderPrescriptionsSection(medicineItems, 'Medical Prescriptions')}
  ${renderPrescriptionsSection(otherItems, 'Retail & Other Dispensary')}
  ${renderVaccineSection(rec.vaccineData)}
  ${renderLabResultsSection(rec.labResults)}
  ${renderExamChecklistSection(rec.examChecklist)}
  ${renderAmendmentHistorySection(rec.amendments)}
  ${renderDischargeSection(rec.dischargeSummary)}
  ${renderAttachmentsSection(rec.attachments)}


  <div style="margin-top:60px; display:flex; gap:64px;">
    <div style="flex:1;">
      <div style="border-bottom:2px solid #3E2723; height:48px; margin-bottom:8px;"></div>
      <p style="font-size:10px; color:#8D6E63; font-weight:900; text-transform:uppercase; margin:0; letter-spacing:1px;">Attending Veterinarian Signature</p>
      ${vetPRC ? `<p style="font-size:9px; color:#8D6E63; margin:4px 0 0;">LICENSE NO: ${vetPRC}</p>` : ''}
    </div>
    <div style="flex:1;">
      <div style="border-bottom:2px solid #3E2723; height:48px; margin-bottom:8px;"></div>
      <p style="font-size:10px; color:#8D6E63; font-weight:900; text-transform:uppercase; margin:0; letter-spacing:1px;">Date of Sign-off</p>
    </div>
  </div>

  <div class="footer">
    Generated on ${now} &nbsp;|&nbsp; ${esc(clinicName || 'Veterinary Clinic')} &nbsp;|&nbsp; Electronic medical record.
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
