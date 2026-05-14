import { UNIFIED_PRINT_STYLES, formatPrintDate, esc, calculatePetAge } from './printUtils';
import { resolveVitals } from './resolveVitals';
import { resolveObjectiveText } from './examUtils';
import {
  renderVitalsSection,
  renderPrescriptionsSection,
  renderVaccineSection,
  renderLabResultsSection,
  renderDischargeSection,
  renderAttachmentsSection,
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
        <td><code style="font-size:10px;">${esc(a.field || '—')}</code></td>
        <td style="color:#666;">${esc(String(a.oldValue ?? '—'))}</td>
        <td style="font-weight:700;">${esc(String(a.newValue ?? '—'))}</td>
      </tr>
    `;
  }).join('');
  return `
    <div class="section-anchor">Audit Trail: Amendment History</div>
    <table class="data-table">
      <thead><tr><th>Clinician</th><th>Timestamp</th><th>Field</th><th>Previous</th><th>Updated</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
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
  ${renderAttachmentsSection(rec.attachments)}

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
