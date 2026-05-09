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
      <td>${esc(d.name || '—')}</td>
      <td>${esc(d.severity || '—')}</td>
      <td>${esc(d.category || '—')}</td>
    </tr>
  `).join('');
  return `
    <h2>Diagnoses</h2>
    <table>
      <thead>
        <tr><th>Name</th><th>Severity</th><th>Category</th></tr>
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

function renderPulseTimelineSection(pulseSummary) {
  if (!pulseSummary?.events?.length) return '';
  const rows = pulseSummary.events.map(e => {
    const ts = e.timestamp?.toDate
      ? e.timestamp.toDate().toLocaleString('en-PH')
      : (e.timestamp ? new Date(e.timestamp).toLocaleString('en-PH') : '—');
    return `
      <tr>
        <td>${esc(e.type || '—')}</td>
        <td>${esc(ts)}</td>
        <td>${esc(e.staffName || '—')}</td>
        <td>${esc(e.note || '')}</td>
      </tr>
    `;
  }).join('');
  return `
    <h2>Clinical Pulse Timeline</h2>
    <table>
      <thead><tr><th>Event</th><th>Timestamp</th><th>Staff</th><th>Note</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

export function generateInternalRecordHTML({
  record, pet, owner,
  clinicName, clinicAddress, clinicPhone, clinicBAI,
  vetStaff, appointment, pulseSummary,
}) {
  const rec = record || {};
  const soap = rec.soap || {};

  const visitDate = formatPrintDate(rec.date);
  const petName = esc(pet?.name || rec.petName || '—');
  const species = esc(pet?.species || '—');
  const breed = esc((pet?.breed && pet.breed !== 'Unknown Breed') ? pet.breed : '—');
  const sexLabel = pet?.gender === 'Male'
    ? (pet?.isNeutered ? 'MN (Male Neutered)' : 'MI (Male Intact)')
    : pet?.gender === 'Female'
      ? (pet?.isNeutered ? 'FS (Female Spayed)' : 'FI (Female Intact)')
      : '—';
  const age = calculatePetAge(pet?.dob);
  const rvPrint = resolveVitals(rec);
  const weight = rvPrint.weight ? `${rvPrint.weight} kg` : (pet?.lastWeight ? `${pet.lastWeight} kg` : '—');
  const microchip = esc(pet?.microchipNumber || pet?.microchip || '');
  const neutered = pet?.isNeutered ? 'Yes' : 'No';

  const ownerName = esc(owner?.displayName || owner?.name || rec.ownerName || '—');
  const ownerPhone = esc(owner?.phone || owner?.contactNumber || '—');
  const ownerAddress = esc([owner?.address, owner?.city].filter(Boolean).join(', ') || '');

  const vetName = esc(vetStaff?.fullName || rec.vetName || '—');
  const vetPRC = esc(vetStaff?.prcLicense || '');
  const vetPTR = esc(vetStaff?.ptrNumber || '');
  const department = esc(rec.department || appointment?.department || '—');

  const servicesArr = Array.isArray(rec.services) ? rec.services : [];
  const servicesList = servicesArr.length > 0
    ? servicesArr.map(s => {
        const name = esc(s.name || (typeof s === 'string' ? s : '—'));
        const st = s.serviceStatus || 'pending';
        const icon = st === 'completed' ? '✓' : st === 'in-progress' ? '⏳' : '○';
        const staff = s.staffName ? ` · ${esc(s.staffName)}` : '';
        const dur = (() => {
          if (st !== 'completed' || !s.serviceStartedAt || !s.serviceCompletedAt) return '';
          const startMs = typeof s.serviceStartedAt.toDate === 'function' ? s.serviceStartedAt.toDate().getTime() : new Date(s.serviceStartedAt).getTime();
          const endMs = typeof s.serviceCompletedAt.toDate === 'function' ? s.serviceCompletedAt.toDate().getTime() : new Date(s.serviceCompletedAt).getTime();
          const mins = Math.round((endMs - startMs) / 60000);
          return Number.isFinite(mins) && mins > 0 ? ` (${mins} min)` : '';
        })();
        return `${icon} ${name}${dur}${staff}`;
      }).join('<br/>')
    : esc(rec.serviceType || rec.recordType || '—');

  const recordId = esc(rec.id || '—');
  const caseDay = rec.caseDay && rec.caseDay > 1 ? `Day ${esc(String(rec.caseDay))}` : '';

  const rawAllergies = pet?.petAllergies || pet?.allergies;
  const allergies = (rawAllergies && !['None', 'None recorded', ''].includes(rawAllergies))
    ? `<strong style="color:#C62828;">${esc(rawAllergies)}</strong>`
    : 'None known';

  const now = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });

  const objectiveText = resolveObjectiveText(rec);
  const assessmentText = rec.diagnoses?.length > 0
    ? rec.diagnoses.map(d => d.severity ? `${d.name} (${d.severity})` : d.name).join('; ') + (rec.assessmentNotes ? '\n\n' + rec.assessmentNotes : '')
    : (soap.assessment || rec.diagnosis || '—');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Internal Clinical Record — ${petName}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="clinic-header">
    <p class="clinic-name">${esc(clinicName || 'Veterinary Clinic')}</p>
    <p class="clinic-address">${esc(clinicAddress || '')}</p>
    ${clinicPhone ? `<p class="clinic-address">${esc(clinicPhone)}</p>` : ''}
    ${clinicBAI ? `<p class="clinic-address">BAI Reg. No. ${esc(clinicBAI)}</p>` : ''}
    <p class="doc-title">INTERNAL CLINICAL RECORD</p>
  </div>

  <h2>Patient Information</h2>
  <div class="info-grid">
    <div><span class="label">Name:</span> <span class="value">${petName}</span></div>
    <div><span class="label">Species:</span> <span class="value">${species}</span></div>
    <div><span class="label">Breed:</span> <span class="value">${breed}</span></div>
    <div><span class="label">Sex:</span> <span class="value">${sexLabel}</span></div>
    <div><span class="label">Age:</span> <span class="value">${age}</span></div>
    <div><span class="label">Weight:</span> <span class="value">${weight}</span></div>
    <div><span class="label">Neutered:</span> <span class="value">${neutered}</span></div>
    ${microchip ? `<div><span class="label">Microchip:</span> <span class="value">${microchip}</span></div>` : ''}
    <div><span class="label">Allergies:</span> <span class="value">${allergies}</span></div>
  </div>

  <h2>Owner Information</h2>
  <div class="info-grid">
    <div><span class="label">Name:</span> <span class="value">${ownerName}</span></div>
    <div><span class="label">Phone:</span> <span class="value">${ownerPhone}</span></div>
    ${ownerAddress ? `<div><span class="label">Address:</span> <span class="value">${ownerAddress}</span></div>` : ''}
  </div>

  <h2>Visit Details</h2>
  <div class="info-grid">
    <div><span class="label">Date:</span> <span class="value">${visitDate}</span></div>
    <div><span class="label">Services:</span> <span class="value" style="text-transform:capitalize;">${servicesList}</span></div>
    <div><span class="label">Attending Vet:</span> <span class="value">${vetName}</span></div>
    ${vetPRC ? `<div><span class="label">PRC License:</span> <span class="value">${vetPRC}</span></div>` : ''}
    ${vetPTR ? `<div><span class="label">PTR:</span> <span class="value">${vetPTR}</span></div>` : ''}
    <div><span class="label">Department:</span> <span class="value">${department}</span></div>
    <div><span class="label">Record ID:</span> <span class="value" style="font-size:11px; color:#666;">${recordId}</span></div>
    ${caseDay ? `<div><span class="label">Case:</span> <span class="value">${caseDay}</span></div>` : ''}
  </div>

  <h2>SOAP Notes</h2>
  <table>
    <thead>
      <tr><th style="width:18%">Section</th><th>Notes</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>S — Subjective</strong></td>
        <td style="white-space:pre-wrap;">${esc(soap.subjective || '—')}</td>
      </tr>
      <tr>
        <td><strong>O — Objective</strong></td>
        <td style="white-space:pre-wrap;">${esc(objectiveText || '—')}</td>
      </tr>
      <tr>
        <td><strong>A — Assessment</strong></td>
        <td style="white-space:pre-wrap;">${esc(assessmentText)}</td>
      </tr>
      <tr>
        <td><strong>P — Plan</strong></td>
        <td style="white-space:pre-wrap;">${esc(soap.plan || rec.treatment || '—')}</td>
      </tr>
      ${soap.prognosis ? `<tr><td><strong>Prognosis</strong></td><td style="white-space:pre-wrap;">${esc(soap.prognosis)}</td></tr>` : ''}
    </tbody>
  </table>

  ${renderVitalsSection(rvPrint)}
  ${renderDiagnosesSection(rec.diagnoses)}
  ${renderPrescriptionsSection(rec.dispensedProducts || rec.prescriptions)}
  ${renderVaccineSection(rec.vaccineData)}
  ${renderLabResultsSection(rec.labResults)}
  ${renderExamChecklistSection(rec.examChecklist)}
  ${renderAmendmentHistorySection(rec.amendments)}
  ${renderDischargeSection(rec.dischargeSummary)}
  ${renderAttachmentsSection(rec.attachments)}
  ${renderPulseTimelineSection(pulseSummary)}

  <div style="margin-top:40px; display:flex; gap:32px;">
    <div style="flex:1;">
      <div style="border-bottom:1.5px solid #3E2723; height:36px; margin-bottom:4px;"></div>
      <p style="font-size:10px; color:#5D4037; margin:0;">Veterinarian Signature</p>
      ${vetPRC ? `<p style="font-size:10px; color:#5D4037; margin:2px 0 0;">PRC: ${vetPRC}${vetPTR ? ' / PTR: ' + vetPTR : ''}</p>` : ''}
    </div>
    <div style="flex:1;">
      <div style="border-bottom:1.5px solid #3E2723; height:36px; margin-bottom:4px;"></div>
      <p style="font-size:10px; color:#5D4037; margin:0;">Date Signed</p>
    </div>
  </div>

  <div class="footer" style="margin-top:24px; color:#C62828; font-weight:700; text-align:center; border-top:2px solid #C62828; padding-top:8px;">
    INTERNAL RECORD — NOT FOR CLIENT DISTRIBUTION
  </div>
  <div class="footer">
    Generated on ${now} &nbsp;|&nbsp; ${esc(clinicName || 'Veterinary Clinic')} &nbsp;|&nbsp; Confidential clinical record.
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
