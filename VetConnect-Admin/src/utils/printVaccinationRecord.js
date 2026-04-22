// NOTE: Currently reads vaccineData (singular) from each medical record.
// When Module 16 (Vaccination Redesign, T2.472) ships, this will need
// updating to read from vaccineAdministrations[] (array per record).

import { PRINT_STYLES, formatPrintDate, esc } from './printUtils';

/**
 * Derives a vaccination status label (Current / Due Soon / Overdue / Unknown)
 * and the days-until-due figure from a vaccine record's due date.
 *
 * @param {object} vaxRecord  A medical_records document that has vaccineData
 * @returns {{ status: string, daysUntilDue: number|null }}
 */
function deriveVaxStatus(vaxRecord) {
  const { vaccineData, date } = vaxRecord;
  const intervalDays = vaccineData?.intervalDays || 365;

  const lastDate = date?.toDate
    ? date.toDate()
    : date?.seconds
      ? new Date(date.seconds * 1000)
      : null;

  if (!lastDate) return { status: 'Unknown', daysUntilDue: null };

  const explicitDue = vaccineData?.dueDate
    ? (vaccineData.dueDate.toDate
        ? vaccineData.dueDate.toDate()
        : vaccineData.dueDate.seconds
          ? new Date(vaccineData.dueDate.seconds * 1000)
          : new Date(vaccineData.dueDate))
    : null;
  const daysUntilDue = explicitDue
    ? Math.floor((explicitDue.getTime() - Date.now()) / 86400000)
    : intervalDays - Math.floor((Date.now() - lastDate.getTime()) / 86400000);

  const status = daysUntilDue < 0 ? 'Overdue'
    : daysUntilDue <= 30 ? 'Due Soon'
    : 'Current';

  return { status, daysUntilDue };
}

/**
 * Generates a complete HTML string for a printable vaccination record /
 * passport for a single pet.
 *
 * The returned string is a self-contained HTML document — pass it directly
 * to `openPrintWindow()`.
 *
 * @param {object}   params
 * @param {object}   params.pet            Pet Firestore document
 * @param {object}   params.owner          Owner user document
 * @param {Array}    params.vaccineRecords  Medical records filtered to those with vaccineData,
 *                                          sorted ascending by date (caller's responsibility)
 * @param {string}   params.clinicName     From useClinicSettings()
 * @param {string}   params.clinicAddress  From useClinicSettings()
 * @returns {string} Full HTML document string
 */
export function generateVaccinationRecordHTML({ pet, owner, vaccineRecords, clinicName, clinicAddress }) {
  const petName = esc(pet?.name || '—');
  const species = esc(pet?.species || '—');
  const breed = esc((pet?.breed && pet.breed !== 'Unknown Breed') ? pet.breed : '—');
  const gender = esc(pet?.gender || '—');
  const microchip = esc(pet?.microchip || pet?.microchipId || 'None on file');

  // DOB / age
  let dobLabel = '—';
  if (pet?.dob) {
    try {
      const d = pet.dob.toDate ? pet.dob.toDate() : new Date(pet.dob);
      if (!isNaN(d.getTime())) dobLabel = d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch { /* ignore */ }
  }

  // Most recent weight from the latest vaccine record or pet profile
  const lastWeight = vaccineRecords[vaccineRecords.length - 1]?.vitals?.weight || pet?.lastWeight;
  const weightLabel = lastWeight ? `${lastWeight} kg` : '—';

  const ownerName = esc(owner?.displayName || owner?.name || '—');
  const ownerPhone = esc(owner?.phone || owner?.contactNumber || '—');

  const now = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });

  // ── Vaccination History table rows ────────────────────────────
  const historyRows = vaccineRecords.map(r => {
    const vd = r.vaccineData || {};
    return `
      <tr>
        <td>${formatPrintDate(r.date)}</td>
        <td><strong>${esc(vd.vaccineName || '—')}</strong></td>
        <td>${esc(vd.manufacturer || '—')}</td>
        <td>${esc(vd.lotNumber || '—')}</td>
        <td>${esc(vd.routeOfAdmin || '—')}</td>
        <td>${esc(vd.siteOfInjection || '—')}</td>
        <td>${esc(r.vetName || '—')}</td>
        <td>${vd.dueDate ? formatPrintDate(vd.dueDate) : '—'}</td>
      </tr>
    `;
  }).join('');

  // ── Vaccination Status Summary table rows ────────────────────
  // Deduplicate by vaccine name — pick the most recent record per vaccine.
  const latestByVaccine = new Map();
  vaccineRecords.forEach(r => {
    const name = r.vaccineData?.vaccineName;
    if (!name) return;
    const existing = latestByVaccine.get(name);
    const rTime = r.date?.toDate ? r.date.toDate().getTime() : (r.date?.seconds ? r.date.seconds * 1000 : 0);
    const eTime = existing?.date?.toDate ? existing.date.toDate().getTime() : (existing?.date?.seconds ? existing.date.seconds * 1000 : 0);
    if (!existing || rTime > eTime) latestByVaccine.set(name, r);
  });

  const statusRows = Array.from(latestByVaccine.values()).map(r => {
    const { status, daysUntilDue } = deriveVaxStatus(r);
    const statusColor = status === 'Current' ? '#2E7D32'
      : status === 'Due Soon' ? '#F57F17'
      : status === 'Overdue' ? '#C62828'
      : '#757575';
    const dueLabel = daysUntilDue === null ? '—'
      : daysUntilDue < 0 ? `${Math.abs(daysUntilDue)}d overdue`
      : `${daysUntilDue}d`;
    return `
      <tr>
        <td><strong>${esc(r.vaccineData.vaccineName)}</strong></td>
        <td>${formatPrintDate(r.date)}</td>
        <td style="color:${statusColor}; font-weight:700">${status}</td>
        <td>${dueLabel}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vaccination Record — ${petName}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="clinic-header">
    <p class="clinic-name">${esc(clinicName || 'Veterinary Clinic')}</p>
    <p class="clinic-address">${esc(clinicAddress || '')}</p>
    <p class="doc-title">Vaccination Record</p>
  </div>

  <h2>Patient Information</h2>
  <div class="info-grid">
    <div><span class="label">Name:</span> <span class="value">${petName}</span></div>
    <div><span class="label">Species:</span> <span class="value">${species}</span></div>
    <div><span class="label">Breed:</span> <span class="value">${breed}</span></div>
    <div><span class="label">Sex:</span> <span class="value">${gender}</span></div>
    <div><span class="label">Date of Birth:</span> <span class="value">${dobLabel}</span></div>
    <div><span class="label">Weight:</span> <span class="value">${weightLabel}</span></div>
    <div><span class="label">Microchip:</span> <span class="value">${microchip}</span></div>
    <div><span class="label">Owner:</span> <span class="value">${ownerName}</span></div>
    <div><span class="label">Phone:</span> <span class="value">${ownerPhone}</span></div>
  </div>

  <h2>Vaccination History</h2>
  ${vaccineRecords.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Vaccine</th>
        <th>Manufacturer</th>
        <th>Lot #</th>
        <th>Route</th>
        <th>Site</th>
        <th>Vet</th>
        <th>Next Due</th>
      </tr>
    </thead>
    <tbody>${historyRows}</tbody>
  </table>
  ` : '<p style="font-size:13px;color:#A1887F;font-style:italic;">No vaccination records on file.</p>'}

  <h2>Vaccination Status Summary</h2>
  ${latestByVaccine.size > 0 ? `
  <table>
    <thead>
      <tr>
        <th>Vaccine</th>
        <th>Last Given</th>
        <th>Status</th>
        <th>Days Until Due</th>
      </tr>
    </thead>
    <tbody>${statusRows}</tbody>
  </table>
  ` : '<p style="font-size:13px;color:#A1887F;font-style:italic;">No status data available.</p>'}

  <div class="footer">
    Generated on ${now} &nbsp;|&nbsp; ${esc(clinicName || 'Veterinary Clinic')} &nbsp;|&nbsp; This vaccination record is for veterinary reference only.
  </div>
</body>
</html>`;
}
