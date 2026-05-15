import { UNIFIED_PRINT_STYLES, formatPrintDate, esc, calculatePetAge } from './printUtils';
import { resolveVitals } from './resolveVitals';
import { resolveObjectiveText } from './examUtils';
import { Timestamp } from 'firebase/firestore';
import { formatDosage } from '../constants/dosageUnits';

/**
 * Formats a duration in milliseconds into a human-readable string.
 */
function formatDuration(ms) {
  const totalMins = Math.round(ms / 60000);
  if (!Number.isFinite(totalMins) || totalMins <= 0) return '';
  if (totalMins < 60) return `${totalMins} min`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function resolveTimestampMs(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  const parsed = new Date(ts).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Renders the persistent stippled vitals table.
 *
 * @param {object} vitals
 * @returns {string} HTML string
 */
export function renderVitalsSection(vitals) {
  const v = vitals || {};
  const hasV = (val) => (val != null && val !== '');
  
  return `
    <div class="section-anchor">Vitals</div>
    <table class="vitals-table">
      <tr class="vitals-row">
        <td class="vitals-label">Weight <span class="stipple">................</span></td>
        <td class="vitals-value">${esc(hasV(v.weight) ? v.weight : '—')} kg</td>
        <td style="width: 40px;"></td>
        <td class="vitals-label">Temperature <span class="stipple">...........</span></td>
        <td class="vitals-value">${esc(hasV(v.temp) ? v.temp : '—')} &deg;C</td>
      </tr>
      <tr class="vitals-row">
        <td class="vitals-label">Heart Rate <span class="stipple">...........</span></td>
        <td class="vitals-value">${esc(hasV(v.hr) ? v.hr : '—')} bpm</td>
        <td style="width: 40px;"></td>
        <td class="vitals-label">Resp Rate <span class="stipple">.............</span></td>
        <td class="vitals-value">${esc(hasV(v.rr) ? v.rr : '—')} br/min</td>
      </tr>
      <tr class="vitals-row">
        <td class="vitals-label">CRT <span class="stipple">..................</span></td>
        <td class="vitals-value">${esc(hasV(v.crt) ? v.crt : '—')} s</td>
        <td style="width: 40px;"></td>
        <td class="vitals-label">BCS <span class="stipple">..................</span></td>
        <td class="vitals-value">${esc(hasV(v.bcs) ? v.bcs + '/9' : '—')}</td>
      </tr>
    </table>
  `;
}

/**
 * Renders the prescriptions table with price parity for services.
 */
export function renderPrescriptionsSection(items, title = 'Medications') {
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
      sigLine = `<div style="font-size:10px; color:#888; margin-top:4px;">Sig: ${parts.join(' · ')}</div>`;
    }

    return `
      <tr>
        <td style="width:30px; text-align:center;">${i + 1}</td>
        <td>
          <b style="font-size:13px;">${esc(rx.name || '—')} ${rx.dosage ? `(${esc(rx.dosage)})` : (formatDosage(rx.dosageValue, rx.dosageUnit, rx.dosageUnitCustom) ? `(${esc(formatDosage(rx.dosageValue, rx.dosageUnit, rx.dosageUnitCustom))})` : '')}</b>
          ${sigLine}
        </td>
        <td style="text-align:center;">x${rx.qty ?? 1}</td>
        <td>${esc(rx.instructions || '—')}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="section-anchor">${title}</div>
    <table class="data-table">
      <thead>
        <tr>
          <th style="width:30px; text-align:center;">#</th>
          <th>Item / Medication</th>
          <th style="text-align:center;">Qty</th>
          <th>Instructions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * Renders the vaccine administered section with detailed forensic data.
 */
export function renderVaccineSection(vax) {
  if (!vax?.vaccineName) return '';
  const date = vax.recordDate ? formatPrintDate(vax.recordDate) : '—';
  const due = vax.dueDate ? formatPrintDate(vax.dueDate) : '—';
  
  return `
    <div class="section-anchor">Immunizations</div>
    <table class="data-table">
      <thead>
        <tr>
          <th>Vaccine</th>
          <th>Manufacturer</th>
          <th>Lot / Batch</th>
          <th>Route</th>
          <th style="text-align:right;">Next Due</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><b>${esc(vax.vaccineName)}</b>${vax.doseNumber ? `<br/><small>Dose ${vax.doseNumber}</small>` : ''}</td>
          <td>${esc(vax.manufacturer || '—')}</td>
          <td style="font-family: monospace;">${esc(vax.lotNumber || '—')}</td>
          <td>${esc(vax.routeOfAdmin || '—')}</td>
          <td style="text-align:right; font-weight:700;">${esc(due)}</td>
        </tr>
      </tbody>
    </table>
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
  const labs = Array.isArray(labResults) ? labResults : [];
  if (labs.length === 0) return '';
  const rows = labs.map(lr => {
    const resultWithUnit = `${esc(lr.result || '—')}${lr.unit ? ' ' + esc(lr.unit) : ''}`;
    const refDisplay = resolveRefRangeForPrint(lr.referenceRange || null);
    const status = (lr.status || 'normal').toLowerCase();
    return `
      <tr>
        <td><b>${esc(lr.testName || '—')}</b></td>
        <td style="font-family: monospace; font-weight: 700;">${resultWithUnit}</td>
        <td style="color: #888;">${esc(refDisplay)}</td>
        <td><span class="status-badge status-${status}">${esc(status.toUpperCase())}</span></td>
        <td style="font-size: 11px; color: #666;">${esc(lr.notes || '—')}</td>
      </tr>
    `;
  }).join('');
  return `
    <div class="section-anchor">Laboratory Results</div>
    <table class="data-table">
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
 * Renders the hierarchical physical exam section.
 */
export function renderExamSection(record) {
  if (!record.physicalExam) return '';
  const exams = record.physicalExam;
  const categories = Object.keys(exams).filter(cat => exams[cat].status && exams[cat].status !== 'not_examined');
  if (categories.length === 0) return '';

  const cards = categories.map(cat => {
    const data = exams[cat];
    const isAbnormal = data.status === 'abnormal';
    return `
      <div style="break-inside: avoid; margin-bottom: 12px; border-left: 3px solid ${isAbnormal ? '#D32F2F' : '#EEE'}; padding-left: 10px;">
        <div style="font-size: 9px; font-weight: 900; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">${esc(cat.replace(/_/g, ' '))}</div>
        <div style="font-size: 12px; font-weight: 700; color: ${isAbnormal ? '#D32F2F' : '#1A1A1A'}; margin: 2px 0;">${isAbnormal ? 'ABNORMAL' : 'NORMAL'}</div>
        ${data.notes ? `<div style="font-size: 11px; color: #666; line-height: 1.4;">${esc(data.notes)}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="section-anchor">Physical Examination</div>
    <div style="column-count: 2; column-gap: 30px; margin-top: 8px;">
      ${cards}
    </div>
  `;
}

/**
 * Renders the financial services ledger for a record.
 */
export function renderServicesSection(record) {
  // Mobile uses appointment services array; Admin usually has serviceNames on the record.
  // We prioritize the structured ledger if available.
  const services = record.services || [];
  if (services.length < 2) return '';

  const rows = services.map(svc => {
    const startMs = resolveTimestampMs(svc.serviceStartedAt);
    const endMs = resolveTimestampMs(svc.serviceCompletedAt);
    const duration = (startMs != null && endMs != null) ? formatDuration(endMs - startMs) : '—';

    return `
      <tr>
        <td><b>${esc(svc.name || '—')}</b></td>
        <td style="color: #666;">${esc(duration)}</td>
        <td>${svc.staffName || '—'}</td>
        <td style="text-align: right; font-weight: 900; font-family: monospace;">&#x20B1;${Number(svc.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="section-anchor">Services Performed</div>
    <table class="data-table">
      <thead>
        <tr>
          <th>Service Item</th>
          <th>Duration</th>
          <th>Staff</th>
          <th style="text-align: right;">Price</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * Renders the discharge instructions section with integrated Clinical Outlook.
 */
export function renderDischargeSection(dischargeSummary, soapPrognosis) {
  if (!dischargeSummary && !soapPrognosis) return '';
  const { instructions, nextVisit, recheckIn, patientStatus } = dischargeSummary || {};
  const prognosis = soapPrognosis || '—';
  const status = patientStatus || '—';
  
  return `
    <div class="section-anchor">Discharge Notes</div>
    <div style="font-size: 14px; color: #1A1A1A; white-space: pre-wrap; margin-bottom: 16px; padding: 12px; background: #FEFEFE; border: 1px dashed #EEE;">${esc(instructions || 'No specific notes provided.')}</div>

    <div style="display: flex; gap: 12px; margin-bottom: 16px;">
      <div style="flex: 1; background: #1A1A1A; color: white; padding: 12px; border-radius: 0;">
        <span style="font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; display: block; opacity: 0.7; margin-bottom: 4px;">Patient Status</span>
        <span style="font-size: 15px; font-weight: 900;">${esc(status)}</span>
      </div>
      <div style="flex: 1; background: #F9F9F9; border: 1px solid #EEE; padding: 12px;">
        <span style="font-size: 10px; font-weight: 900; color: #888; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 4px;">Prognosis</span>
        <span style="font-size: 15px; font-weight: 900; color: #1A1A1A;">${esc(prognosis)}</span>
      </div>
    </div>
    
    <div style="display: flex; justify-content: space-between; border-top: 1px solid #E5E5E5; padding-top: 12px;">
      <span style="font-size: 10px; font-weight: 900; color: #888; text-transform: uppercase;">Follow-up / Recheck</span>
      <span style="font-size: 13px; font-weight: 700; color: #1A1A1A;">${esc(nextVisit || recheckIn || 'None scheduled')}</span>
    </div>
  `;
}

/**
 * Renders the attachments section for print output.
 */
export function renderAttachmentsSection(attachments) {
  if (!attachments?.length) return '';
  const items = attachments.map(att => {
    const icon = att.mimeType?.startsWith('image/') ? '📷' : '📄';
    return `
      <div style="padding: 8px 12px; background: #F9F9F9; border: 1px solid #EEE; margin-bottom: 8px; display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 20px;">${icon}</span>
        <div>
          <b style="font-size: 12px; display: block;">${esc(att.label || att.fileName || 'Attachment')}</b>
          <span style="font-size: 10px; color: #888;">${esc(att.type || 'other')}</span>
        </div>
      </div>
    `;
  }).join('');
  return `
    <div class="section-anchor">Reference Attachments</div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">${items}</div>
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
/**
 * Generates a complete HTML string for the Super Template Visit Summary.
 */
export function generateVisitSummaryHTML({ record, pet, owner, clinicName, clinicAddress, clinicPhone, clinicEmail, clinicTIN, clinicBAI, vetStaff }) {
  const rec = record || {};
  const soap = rec.soap || {};

  const visitDate = formatPrintDate(rec.date);
  const petName = esc(pet?.name || rec.petName || '—');
  const species = esc(pet?.species || '—');
  const breed = esc((pet?.breed && pet.breed !== 'Unknown Breed') ? pet.breed : '—');
  const typeLabel = `${species} (${breed})`;
  
  const sexLabel = pet?.gender === 'Male' ? (pet?.isNeutered ? 'Male Neutered (MN)' : 'Male Intact (MI)')
    : pet?.gender === 'Female' ? (pet?.isNeutered ? 'Female Spayed (FS)' : 'Female Intact (FI)')
    : '—';
    
  const ageLabel = calculatePetAge(pet?.dob);
  const dobLabel = pet?.dob ? formatPrintDate(pet.dob) : 'Unknown';
  
  const rvPrint = resolveVitals(rec);
  const ownerName = esc(owner?.displayName || owner?.name || rec.ownerName || '—');
  const ownerPhone = esc(owner?.phone || owner?.contactNumber || '—');
  const ownerEmail = esc(owner?.email || '—');
  const contactLabel = `${ownerPhone} | ${ownerEmail}`;

  const rawAllergies = pet?.petAllergies || pet?.allergies || rec.allergies;
  const allergyList = (rawAllergies && !['None', 'None recorded', ''].includes(rawAllergies)) ? esc(rawAllergies) : null;

  const vetName = esc(rec.vetName || 'Attending Clinician');
  const vetPRC = esc(vetStaff?.prcLicense || '');
  
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
      <div class="memo-value">${vetName} ${vetPRC ? '(PRC: ' + vetPRC + ')' : ''}</div>
    </div>
  </div>

  ${soap.subjective ? `
    <div class="section-anchor">Reason for Visit</div>
    <p class="content-text" style="margin-bottom: 24px;">${esc(soap.subjective)}</p>
  ` : ''}

  ${renderExamSection(rec)}

  ${renderVitalsSection(rvPrint)}
  
  <div class="section-anchor">Diagnosis / Findings</div>
  <div style="font-size: 14px; font-weight: 500; color: #1A1A1A; margin-top: 4px; margin-bottom: 24px;">
    ${rec.diagnoses?.length > 0 
      ? rec.diagnoses.map(d => d.severity ? `${d.name} (${d.severity})` : d.name).join('; ')
      : (rec.diagnosis || '—')}
  </div>

  ${renderLabResultsSection(rec.labResults)}
  
  ${(rec.vaccineAdministrations?.length > 0
    ? rec.vaccineAdministrations.map(v => renderVaccineSection(v)).join('')
    : renderVaccineSection(rec.vaccineData))}

  ${(() => {
    const allItems = rec.dispensedProducts || rec.prescriptions || [];
    const resolvePC = (rx) => rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
    const medicineItems = allItems.filter(rx => resolvePC(rx) === 'medicine');
    const otherItems = allItems.filter(rx => resolvePC(rx) !== 'medicine');
    
    return `
      ${renderPrescriptionsSection(medicineItems, 'Medical Prescriptions')}
      ${renderPrescriptionsSection(otherItems, 'Retail & Other Dispensary')}
    `;
  })()}

  ${renderServicesSection(rec)}

  ${renderDischargeSection(rec.dischargeSummary, soap.prognosis)}
  ${renderAttachmentsSection(rec.attachments)}

  <div class="signature-area">
    <div style="font-size: 9px; font-weight: 900; color: #888; text-transform: uppercase; margin-bottom: 2px;">Signed by</div>
    <div class="sig-name">${vetName}</div>
    <div class="sig-line" style="margin-top: 8px;"></div>
    <div class="sig-title">Attending Veterinarian</div>
  </div>

  <div class="reg-footer">
    <span>BAI Reg No: ${esc(clinicBAI || '—')}</span>
    <span>TIN: ${esc(clinicTIN || '—')}</span>
    <span>Generated: ${now}</span>
  </div>
</body>
</html>`;
}
