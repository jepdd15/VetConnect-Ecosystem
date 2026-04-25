import { PRINT_STYLES, formatPrintDate, esc, calculatePetAge } from './printUtils';

/**
 * Renders the vitals table row. Returns an empty string when no vitals exist.
 *
 * @param {object} vitals
 * @returns {string} HTML string
 */
function renderVitalsSection(vitals) {
  if (!vitals || !(vitals.weight || vitals.temp || vitals.hr || vitals.rr || vitals.crt || vitals.bcs || vitals.pain)) {
    return '';
  }
  return `
    <h2>Vitals</h2>
    <table>
      <thead>
        <tr>
          <th>Weight (kg)</th>
          <th>Temp (°C)</th>
          <th>HR (bpm)</th>
          <th>RR (rpm)</th>
          <th>CRT</th>
          <th>BCS</th>
          <th>Pain</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${esc(vitals.weight || '—')}</td>
          <td>${esc(vitals.temp || '—')}</td>
          <td>${esc(vitals.hr || '—')}</td>
          <td>${esc(vitals.rr || '—')}</td>
          <td>${esc(vitals.crt || '—')}</td>
          <td>${esc(vitals.bcs || '—')}</td>
          <td>${esc(vitals.pain || '—')}</td>
        </tr>
      </tbody>
    </table>
  `;
}

/**
 * Renders the prescriptions table. Omits price per clinical document policy
 * (prices belong on receipts, not clinical notes).
 *
 * @param {Array} prescriptions
 * @returns {string} HTML string
 */
function renderPrescriptionsSection(prescriptions) {
  if (!prescriptions?.length) return '';
  const rows = prescriptions.map((rx, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${esc(rx.name || '—')}</strong></td>
      <td>${rx.qty ?? '—'}</td>
      <td>${esc(rx.instructions || '—')}</td>
    </tr>
  `).join('');
  return `
    <h2>Prescriptions</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Medication</th>
          <th>Qty</th>
          <th>Instructions</th>
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
function renderVaccineSection(vaccineData) {
  if (!vaccineData?.vaccineName) return '';
  return `
    <h2>Vaccine Administered</h2>
    <div class="info-grid">
      <div><span class="label">Vaccine:</span></div>
      <div><span class="value">${esc(vaccineData.vaccineName)}</span></div>
      <div></div>
      <div><span class="label">Manufacturer:</span></div>
      <div><span class="value">${esc(vaccineData.manufacturer || '—')}</span></div>
      <div></div>
      <div><span class="label">Lot Number:</span></div>
      <div><span class="value">${esc(vaccineData.lotNumber || '—')}</span></div>
      <div></div>
      <div><span class="label">Route:</span></div>
      <div><span class="value">${esc(vaccineData.routeOfAdmin || '—')}</span></div>
      <div></div>
      <div><span class="label">Site:</span></div>
      <div><span class="value">${esc(vaccineData.siteOfInjection || '—')}</span></div>
      <div></div>
      <div><span class="label">Next Due:</span></div>
      <div><span class="value">${vaccineData.dueDate ? formatPrintDate(vaccineData.dueDate) : '—'}</span></div>
      <div></div>
    </div>
  `;
}

/**
 * Renders the lab results table, only when lab results exist.
 *
 * @param {Array} labResults
 * @returns {string} HTML string
 */
function renderLabResultsSection(labResults) {
  if (!labResults?.length) return '';
  const rows = labResults.map(lr => `
    <tr>
      <td>${esc(lr.testName || '—')}</td>
      <td>${esc(lr.result || '—')}</td>
      <td>${esc(lr.status || '—')}</td>
      <td>${esc(lr.notes || '—')}</td>
    </tr>
  `).join('');
  return `
    <h2>Lab Results</h2>
    <table>
      <thead>
        <tr>
          <th>Test</th>
          <th>Result</th>
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
function renderDischargeSection(dischargeSummary) {
  if (!dischargeSummary) return '';
  const { instructions, nextVisit, recheckIn, patientStatus } = dischargeSummary;
  if (!(instructions || nextVisit || recheckIn || patientStatus)) return '';
  const followUp = nextVisit || recheckIn || '—';
  return `
    <h2>Discharge Instructions</h2>
    <p style="font-size:13px; white-space:pre-wrap;">${esc(instructions || 'None provided.')}</p>
    <div class="info-grid">
      <div><span class="label">Follow-up:</span></div>
      <div><span class="value">${esc(followUp)}</span></div>
      <div></div>
      <div><span class="label">Patient Status:</span></div>
      <div><span class="value">${esc(patientStatus || '—')}</span></div>
      <div></div>
    </div>
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
export function generateVisitSummaryHTML({ record, pet, owner, clinicName, clinicAddress }) {
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
  const weight = rec.vitals?.weight ? `${rec.vitals.weight} kg` : (pet?.lastWeight ? `${pet.lastWeight} kg` : '—');
  const ownerName = esc(owner?.displayName || owner?.name || rec.ownerName || '—');
  const ownerPhone = esc(owner?.phone || owner?.contactNumber || '—');
  const rawAllergies = pet?.petAllergies || pet?.allergies;
  const allergies = (rawAllergies && !['None', 'None recorded', ''].includes(rawAllergies))
    ? `<strong style="color:#C62828;">${esc(rawAllergies)}</strong>`
    : 'None known';

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
    <div><span class="label">Allergies:</span> <span class="value">${allergies}</span></div>
  </div>

  <h2>Visit Details</h2>
  <div class="info-grid">
    <div><span class="label">Date:</span> <span class="value">${visitDate}</span></div>
    <div><span class="label">Service:</span> <span class="value" style="text-transform:capitalize">${esc(rec.serviceType || rec.recordType || '—')}</span></div>
    <div></div>
    <div><span class="label">Attending Vet:</span> <span class="value">${esc(rec.vetName || '—')}</span></div>
    <div><span class="label">Diagnosis:</span> <span class="value">${esc(rec.diagnosis || '—')}</span></div>
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
        <td style="white-space:pre-wrap">${esc(soap.objectiveNotes || soap.objective || '—')}</td>
      </tr>
      <tr>
        <td><strong>Assessment</strong></td>
        <td style="white-space:pre-wrap">${esc(soap.assessment || rec.diagnosis || '—')}</td>
      </tr>
      <tr>
        <td><strong>Plan</strong></td>
        <td style="white-space:pre-wrap">${esc(soap.plan || rec.treatment || '—')}</td>
      </tr>
      ${soap.prognosis ? `<tr><td><strong>Prognosis</strong></td><td style="white-space:pre-wrap">${esc(soap.prognosis)}</td></tr>` : ''}
    </tbody>
  </table>

  ${renderVitalsSection(rec.vitals)}
  ${renderPrescriptionsSection(rec.prescriptions)}
  ${renderVaccineSection(rec.vaccineData)}
  ${renderLabResultsSection(rec.labResults)}
  ${renderDischargeSection(rec.dischargeSummary)}

  <div class="footer">
    Generated on ${now} &nbsp;|&nbsp; ${esc(clinicName || 'Veterinary Clinic')} &nbsp;|&nbsp; This is a system-generated document.
  </div>
</body>
</html>`;
}
