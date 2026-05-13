import { PRINT_STYLES, formatPrintDate, esc, calculatePetAge } from './printUtils';
import { resolveVitals } from './resolveVitals';
import { resolveObjectiveText } from './examUtils';

/**
 * Renders the vitals table row. Returns an empty string when no vitals exist.
 *
 * @param {object} vitals
 * @returns {string} HTML string
 */
export function renderVitalsSection(vitals) {
  const v = vitals || {};
  const cards = [
    { label: 'Weight', value: v.weight ? `${v.weight} kg` : '—' },
    { label: 'Temp',   value: v.temp ? `${v.temp} °C` : '—' },
    { label: 'HR',     value: v.hr ? `${v.hr} bpm` : '—' },
    { label: 'RR',     value: v.rr ? `${v.rr} rpm` : '—' },
    { label: 'CRT',    value: v.crt || '—' },
    { label: 'BCS',    value: v.bcs ? `${v.bcs}/9` : '—' },
    { label: 'Pain',   value: v.pain ? `${v.pain}/10` : '—' },
  ];

  const cardsHtml = cards.map(c => `
    <div class="vital-card">
      <div class="vital-label">${esc(c.label)}</div>
      <div class="vital-value">${esc(c.value)}</div>
    </div>
  `).join('');

  return `
    <h2>Clinical Vitals</h2>
    <div class="vitals-row">${cardsHtml}</div>
  `;
}

/**
 * Renders the prescriptions table. Omits price per clinical document policy
 * (prices belong on receipts, not clinical notes).
 *
 * @param {Array} dispensedProducts
 * @returns {string} HTML string
 */
export function renderPrescriptionsSection(items, title = 'Prescriptions') {
  if (!items?.length) return '';
  const rows = items.map((rx, i) => {
    const sig = rx.sig;
    let sigLine = '';
    if (sig && (sig.dose || sig.frequency || sig.route)) {
      const parts = [
        sig.dose ? `${sig.dose} ${sig.unit || ''}` : '',
        sig.route ? `via ${sig.route}` : '',
        sig.frequency || '',
        sig.duration ? `for ${sig.duration} days` : '',
      ].filter(Boolean);
      sigLine = `<div style="font-size:10px; color:#5D4037; margin-top:4px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Order: ${parts.join(' · ')}</div>`;
    }

    return `
      <tr>
        <td style="width:30px; text-align:center; font-weight:900;">${i + 1}</td>
        <td>
          <strong style="font-size:13px;">${esc(rx.name || '—')}</strong>
          ${sigLine}
        </td>
        <td style="text-align:center;">${rx.qty ?? '—'}</td>
        <td style="font-size:11px;">${esc(rx.instructions || '—')}</td>
      </tr>
    `;
  }).join('');

  return `
    <h2>${title}</h2>
    <table>
      <thead>
        <tr>
          <th style="width:30px; text-align:center;">#</th>
          <th>Item / Description</th>
          <th style="text-align:center;">Qty</th>
          <th>Instructions / Sig</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * Renders the vaccine administered section, only when vaccineData is present.
 *
 * @param {object} vaccineData
 * @returns {string} HTML string
 */
export function renderVaccineSection(vaccineData) {
  if (!vaccineData?.vaccineName) return '';
  const doseInfo = vaccineData.doseNumber ? ` (Dose ${vaccineData.doseNumber}${vaccineData.totalDoses ? '/' + vaccineData.totalDoses : ''})` : '';
  
  return `
    <h2>Vaccine Administered</h2>
    <div style="display:grid; grid-template-columns:1.5fr 1fr 1fr; gap:20px; margin-bottom:24px; border:2px solid #3E2723; padding:16px; background:#FAF8F5;">
      <div class="headboard-column">
        <div class="headboard-label">Vaccine / Antigen</div>
        <div class="headboard-value" style="font-size:14px; font-weight:900;">${esc(vaccineData.vaccineName)}${doseInfo}</div>
        <div style="margin-top:8px;">
          <div class="headboard-label">Manufacturer / Brand</div>
          <div class="headboard-value">${esc(vaccineData.manufacturer || '—')}</div>
        </div>
      </div>
      <div class="headboard-column">
        <div class="headboard-label">Lot / Batch No.</div>
        <div class="headboard-value">${esc(vaccineData.lotNumber || '—')}</div>
        <div style="margin-top:8px;">
          <div class="headboard-label">Route & Site</div>
          <div class="headboard-value">${esc(vaccineData.routeOfAdmin || '—')} · ${esc(vaccineData.siteOfInjection || '—')}</div>
        </div>
      </div>
      <div class="headboard-column">
        <div class="headboard-label">Next Due Date</div>
        <div class="headboard-value" style="color:#D32F2F; font-weight:900;">${vaccineData.dueDate ? formatPrintDate(vaccineData.dueDate) : '—'}</div>
      </div>
    </div>
  `;
}

/**
 * Resolves a lab reference range to a display string for print output.
 * Handles species-keyed objects, legacy arrays, and null gracefully.
 *
 * @param {object|Array|null} range - referenceRange value from the record
 * @returns {string} Display string or '—'
 */
function resolveRefRangeForPrint(range) {
  if (!range) return '—';
  if (typeof range === 'object' && !Array.isArray(range)) {
    const parts = [];
    if (range.canine) parts.push(`Dog: ${range.canine[0]}–${range.canine[1]}`);
    if (range.feline) parts.push(`Cat: ${range.feline[0]}–${range.feline[1]}`);
    return parts.length ? parts.join(' / ') : '—';
  }
  if (Array.isArray(range) && range.length === 2) {
    return `${range[0]}–${range[1]}`;
  }
  return '—';
}

/**
 * Renders the lab results table, only when lab results exist.
 * 5-column layout: Test | Result (with unit) | Ref. Range | Status | Notes
 *
 * @param {Array} labResults
 * @returns {string} HTML string
 */
export function renderLabResultsSection(labResults) {
  if (!labResults?.length) return '';
  const rows = labResults.map(lr => {
    const resultWithUnit = `${esc(lr.result || '—')}${lr.unit ? ' ' + esc(lr.unit) : ''}`;
    const refDisplay = resolveRefRangeForPrint(lr.referenceRange || null);
    return `
      <tr>
        <td>${esc(lr.testName || '—')}</td>
        <td>${resultWithUnit}</td>
        <td>${esc(refDisplay)}</td>
        <td>${esc(lr.status || '—')}</td>
        <td>${esc(lr.notes || '—')}</td>
      </tr>
    `;
  }).join('');
  return `
    <h2>Lab Results</h2>
    <table>
      <thead>
        <tr>
          <th>Test</th>
          <th>Result</th>
          <th>Ref. Range</th>
          <th>Status</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * Renders the discharge instructions section.
 *
 * @param {object} dischargeSummary
 * @returns {string} HTML string
 */
export function renderDischargeSection(dischargeSummary) {
  if (!dischargeSummary) return '';
  const { instructions, nextVisit, recheckIn, patientStatus } = dischargeSummary;
  if (!(instructions || nextVisit || recheckIn || patientStatus)) return '';
  const followUp = nextVisit || recheckIn || '—';
  return `
    <h2>Discharge Notes</h2>
    <div style="font-size:13px; white-space:pre-wrap; margin-bottom:16px; border-left:4px solid #3E2723; padding-left:16px;">${esc(instructions || 'None provided.')}</div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; border-top:1px solid #E0D6CC; pt:12px;">
      <div class="headboard-column">
        <div class="headboard-label">Follow-up / Recheck</div>
        <div class="headboard-value">${esc(followUp)}</div>
      </div>
      <div class="headboard-column">
        <div class="headboard-label">Patient Status at Discharge</div>
        <div class="headboard-value" style="font-weight:900;">${esc(patientStatus || '—')}</div>
      </div>
    </div>
  `;
}

/**
 * Renders the attachments section for print output.
 * Attachment labels are rendered as clickable links. Client-visible
 * attachments are flagged so recipients know the file was shared with the owner.
 *
 * All dynamic values go through esc() to prevent XSS in the printed document.
 *
 * @param {Array} attachments
 * @returns {string} HTML string
 */
export function renderAttachmentsSection(attachments) {
  if (!attachments?.length) return '';
  const items = attachments.map(att => {
    const icon = att.mimeType?.startsWith('image/') ? '📷' : '📄';
    const shared = att.clientVisible ? ' <span style="color:#2E7D32; font-size:10px;">[Shared with owner]</span>' : '';
    return `<li style="margin-bottom:4px;">
      ${icon} <a href="${esc(att.url || (typeof att === 'string' ? att : ''))}" target="_blank" rel="noopener noreferrer" style="color:#1565C0;">${esc(att.label || att.fileName || 'Attachment')}</a>
      <span style="color:#999; font-size:11px;"> (${esc(att.type || 'other')})</span>${shared}
    </li>`;
  }).join('');
  return `
    <h2>Attachments</h2>
    <ul style="list-style:none; padding-left:0;">${items}</ul>
  `;
}

/**
 * Generates a complete HTML string for a printable clinical visit summary.
 *
 * The returned string is a self-contained HTML document — pass it directly
 * to `openPrintWindow()`. The document is designed to print cleanly on A4
 * or US Letter paper at 15mm margins.
 *
 * @param {object} params
 * @param {object} params.record         The medical_records Firestore document
 * @param {object} params.pet            The pet Firestore document (for species, breed, dob, etc.)
 * @param {object} params.owner          The owner user document (for phone)
 * @param {string} params.clinicName     From useClinicSettings()
 * @param {string} params.clinicAddress  From useClinicSettings()
 * @returns {string} Full HTML document string
 */
export function generateVisitSummaryHTML({ record, pet, owner, clinicName, clinicAddress, clinicPhone, clinicBAI, vetStaff }) {
  const rec = record || {};
  const soap = rec.soap || {};

  const visitDate = formatPrintDate(rec.date);
  const petName = esc(pet?.name || rec.petName || '—');
  const species = esc(pet?.species || '—');
  const breed = esc((pet?.breed && pet.breed !== 'Unknown Breed') ? pet.breed : '—');
  const sexLabel = pet?.gender === 'Male' ? (pet?.isNeutered ? 'MN (Male Neutered)' : 'MI (Male Intact)')
    : pet?.gender === 'Female' ? (pet?.isNeutered ? 'FS (Female Spayed)' : 'FI (Female Intact)')
    : '—';
  const age = calculatePetAge(pet?.dob);
  const rvPrint = resolveVitals(rec);
  const weight = rvPrint.weight ? `${rvPrint.weight} kg` : (pet?.lastWeight ? `${pet.lastWeight} kg` : '—');
  const ownerName = esc(owner?.displayName || owner?.name || rec.ownerName || '—');
  const ownerPhone = esc(owner?.phone || owner?.contactNumber || '—');
  const ownerAddress = esc([owner?.address, owner?.city].filter(Boolean).join(', ') || '');
  const rawAllergies = pet?.petAllergies || pet?.allergies;
  const allergies = (rawAllergies && !['None', 'None recorded', ''].includes(rawAllergies))
    ? `<strong style="color:#C62828;">${esc(rawAllergies)}</strong>`
    : 'None known';

  const vetPRC = esc(vetStaff?.prcLicense || '');
  const vetPTR = esc(vetStaff?.ptrNumber || '');

  const now = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Visit Summary — ${petName}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="clinic-header">
    <p class="clinic-name">${esc(clinicName || 'Veterinary Clinic')}</p>
    <p class="clinic-address">${esc(clinicAddress || '')}</p>
    ${clinicPhone ? `<p class="clinic-address">${esc(clinicPhone)}</p>` : ''}
    ${clinicBAI ? `<p class="clinic-address">BAI Reg. No. ${esc(clinicBAI)}</p>` : ''}
    <p class="doc-title">Visit Summary</p>
  </div>

  <h2>Patient Information</h2>
  <div class="info-grid">
    <div><span class="label">Name:</span> <span class="value">${petName}</span></div>
    <div><span class="label">Species:</span> <span class="value">${species}</span></div>
    <div><span class="label">Breed:</span> <span class="value">${breed}</span></div>
    <div><span class="label">Sex:</span> <span class="value">${sexLabel}</span></div>
    <div><span class="label">Age:</span> <span class="value">${age}</span></div>
    <div><span class="label">Weight:</span> <span class="value">${weight}</span></div>
    <div><span class="label">Owner:</span> <span class="value">${ownerName}</span></div>
    <div><span class="label">Phone:</span> <span class="value">${ownerPhone}</span></div>
    ${ownerAddress ? `<div><span class="label">Address:</span> <span class="value">${ownerAddress}</span></div>` : ''}
    <div><span class="label">Allergies:</span> <span class="value">${allergies}</span></div>
  </div>

  <h2>Visit Details</h2>
  <div class="info-grid">
    <div><span class="label">Date:</span> <span class="value">${visitDate}</span></div>
    <div><span class="label">Service:</span> <span class="value" style="text-transform:capitalize">${esc(rec.serviceType || rec.recordType || '—')}</span></div>
    <div></div>
    <div><span class="label">Attending Vet:</span> <span class="value">${esc(rec.vetName || '—')}</span></div>
    ${vetPRC ? `<div><span class="label">PRC License:</span> <span class="value">${vetPRC}</span></div>` : ''}
    ${vetPTR ? `<div><span class="label">PTR:</span> <span class="value">${vetPTR}</span></div>` : ''}
    <div><span class="label">Diagnosis:</span> <span class="value">${esc(
      rec.diagnoses?.length > 0
        ? rec.diagnoses.map(d => d.severity ? `${d.name} (${d.severity})` : d.name).join('; ')
        : (rec.diagnosis || '—')
    )}</span></div>
    <div></div>
  </div>

  <h2>Clinical Notes (SOAP)</h2>
  <table>
    <thead>
      <tr><th style="width:18%">Section</th><th>Notes</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Subjective</strong></td>
        <td style="white-space:pre-wrap">${esc(soap.subjective || '—')}</td>
      </tr>
      <tr>
        <td><strong>Objective</strong></td>
        <td style="white-space:pre-wrap">${esc(resolveObjectiveText(rec) || '—')}</td>
      </tr>
      <tr>
        <td><strong>Assessment</strong></td>
        <td style="white-space:pre-wrap">${esc(
          rec.diagnoses?.length > 0
            ? rec.diagnoses.map(d => d.severity ? `${d.name} (${d.severity})` : d.name).join('; ') + (rec.assessmentNotes ? '\n\n' + rec.assessmentNotes : '')
            : (soap.assessment || rec.diagnosis || '—')
        )}</td>
      </tr>
      <tr>
        <td><strong>Plan</strong></td>
        <td style="white-space:pre-wrap">${esc(soap.plan || rec.treatment || '—')}</td>
      </tr>
      ${soap.prognosis ? `<tr><td><strong>Prognosis</strong></td><td style="white-space:pre-wrap">${esc(soap.prognosis)}</td></tr>` : ''}
    </tbody>
  </table>

  ${renderVitalsSection(rvPrint)}
  ${renderPrescriptionsSection(rec.dispensedProducts || rec.prescriptions)}
  ${(rec.vaccineAdministrations?.length > 0
    ? rec.vaccineAdministrations.map(v => renderVaccineSection(v)).join('')
    : renderVaccineSection(rec.vaccineData))}
  ${renderLabResultsSection(rec.labResults)}
  ${renderDischargeSection(rec.dischargeSummary)}
  ${renderAttachmentsSection(rec.attachments)}

  <div style="margin-top:40px; display:flex; gap:32px;">
    <div style="flex:1;">
      <div style="border-bottom:1.5px solid #3E2723; height:36px; margin-bottom:4px;"></div>
      <p style="font-size:10px; color:#5D4037; margin:0;">Veterinarian Signature</p>
    </div>
    <div style="flex:1;">
      <div style="border-bottom:1.5px solid #3E2723; height:36px; margin-bottom:4px;"></div>
      <p style="font-size:10px; color:#5D4037; margin:0;">Date Signed</p>
    </div>
  </div>

  <div class="footer">
    Generated on ${now} &nbsp;|&nbsp; ${esc(clinicName || 'Veterinary Clinic')} &nbsp;|&nbsp; This is a system-generated document.
  </div>
</body>
</html>`;
}
