// Reads vaccineAdministrations[] (array per record) with backward compat
// for legacy vaccineData (singular) via getVaccineAdministrations().

import { PRINT_STYLES, formatPrintDate, esc } from './printUtils';
import { getVaccineAdministrations } from './vaccineConstants';

/**
 * Derives a vaccination status label (Current / Due Soon / Overdue / Unknown)
 * and the days-until-due figure from a single vaccine administration object.
 *
 * @param {object} vaxAdmin    A single vaccine administration entry (from vaccineAdministrations[] or vaccineData)
 * @param {object} recordDate  The Firestore `date` field of the parent medical record
 * @returns {{ status: string, daysUntilDue: number|null }}
 */
function deriveVaxStatus(vaxAdmin, recordDate) {
  const intervalDays = vaxAdmin?.intervalDays || 365;
  const date = recordDate;

  const lastDate = date?.toDate
    ? date.toDate()
    : date?.seconds
      ? new Date(date.seconds * 1000)
      : null;

  if (!lastDate) return { status: 'Unknown', daysUntilDue: null };

  const explicitDue = vaxAdmin?.dueDate
    ? (vaxAdmin.dueDate.toDate
        ? vaxAdmin.dueDate.toDate()
        : vaxAdmin.dueDate.seconds
          ? new Date(vaxAdmin.dueDate.seconds * 1000)
          : new Date(vaxAdmin.dueDate))
    : null;
  const daysUntilDue = explicitDue
    ? Math.floor((explicitDue.getTime() - Date.now()) / 86400000)
    : intervalDays - Math.floor((Date.now() - lastDate.getTime()) / 86400000);

  const status = daysUntilDue < 0 ? 'Overdue'
    : daysUntilDue <= 30 ? 'Due Soon'
    : 'Current';

  return { status, daysUntilDue };
}

// ── Passport-mode CSS additions ────────────────────────────────────
// Appended to PRINT_STYLES only when mode === 'passport'.
const PASSPORT_STYLES = `
  .passport-cover {
    text-align: center;
    padding: 40px 0 32px;
    border-bottom: 3px solid #3E2723;
    margin-bottom: 32px;
    page-break-after: avoid;
  }
  .passport-title {
    font-size: 28px;
    font-weight: 900;
    color: #3E2723;
    text-transform: uppercase;
    letter-spacing: 3px;
    margin: 8px 0 4px;
  }
  .passport-subtitle {
    font-size: 12px;
    color: #8D6E63;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin: 0 0 24px;
  }
  .passport-pet-card {
    display: inline-block;
    border: 2px solid #3E2723;
    padding: 12px 24px;
    margin-top: 16px;
    text-align: left;
    background: #FFF8E1;
  }
  .passport-pet-card .pet-name {
    font-size: 18px;
    font-weight: 800;
    color: #3E2723;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .passport-pet-card .pet-detail {
    font-size: 11px;
    color: #5D4037;
    margin-top: 2px;
  }
  .passport-generated {
    font-size: 10px;
    color: #A1887F;
    margin-top: 16px;
  }
  .vaccine-cards-section {
    margin: 24px 0;
  }
  .vaccine-card {
    padding: 12px 14px;
    margin: 8px 0;
    border: 1px solid #E0E0E0;
    page-break-inside: avoid;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }
  .vaccine-card-body {
    flex: 1;
  }
  .vaccine-card-name {
    font-size: 13px;
    font-weight: 700;
    color: #3E2723;
  }
  .vaccine-card-detail {
    font-size: 11px;
    color: #5D4037;
    margin-top: 3px;
  }
  .status-badge {
    display: inline-block;
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .certification-block {
    border: 2px solid #3E2723;
    padding: 20px 24px;
    margin-top: 32px;
    background: #FFF8E1;
    page-break-before: auto;
    page-break-inside: avoid;
  }
  .certification-block p {
    font-size: 11px;
    color: #3E2723;
    margin: 0 0 20px;
    line-height: 1.6;
  }
  .certification-block p.cert-note {
    font-size: 10px;
    color: #757575;
    margin-top: 16px;
    border-top: 1px solid #E0E0E0;
    padding-top: 10px;
  }
  .signature-row {
    display: flex;
    gap: 32px;
    margin-top: 8px;
  }
  .signature-cell {
    flex: 1;
  }
  .signature-line {
    border-bottom: 1.5px solid #3E2723;
    height: 36px;
    margin-bottom: 4px;
  }
  .signature-label {
    font-size: 10px;
    color: #5D4037;
    margin: 0;
  }
  @media print {
    .vaccine-card { page-break-inside: avoid; }
    .certification-block { page-break-inside: avoid; }
  }
`;

/**
 * Generates a complete HTML string for a printable vaccination record or
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
 * @param {string}   [params.mode]         'record' (default) or 'passport'
 * @param {Array}    [params.vaccineCatalog] Vaccine catalog array — used in passport mode
 *                                           for status derivation. Falls back to vaccineRecords.
 * @returns {string} Full HTML document string
 */
export function generateVaccinationRecordHTML({ pet, owner, vaccineRecords, clinicName, clinicAddress, mode = 'record', vaccineCatalog, clinicPhone, clinicBAI, staffLookup }) {
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
  const ownerAddress = esc([owner?.address, owner?.city].filter(Boolean).join(', ') || '');

  const now = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });

  // ── Vaccination History table rows ────────────────────────────
  // flatMap so that multi-vaccine visits produce one row per administration.
  const historyRows = vaccineRecords.flatMap(r => {
    const admins = getVaccineAdministrations(r);
    const vetDoc = staffLookup?.get(r.vetName) || null;
    const hasLicense = vetDoc && (vetDoc.prcLicense || vetDoc.ptrNumber);
    const vetLicenseCell = hasLicense
      ? `${esc(r.vetName || '—')}<br/><span style="font-size:10px;color:#5D4037;">PRC: ${esc(vetDoc.prcLicense || '—')} / PTR: ${esc(vetDoc.ptrNumber || '—')}</span>`
      : esc(r.vetName || '—');
    return admins.map(vd => `
      <tr>
        <td>${formatPrintDate(r.date)}</td>
        <td><strong>${esc(vd.vaccineName || '—')}</strong></td>
        <td>${esc(vd.manufacturer || '—')}</td>
        <td>${esc(vd.lotNumber || '—')}</td>
        <td>${esc(vd.routeOfAdmin || '—')}</td>
        <td>${esc(vd.siteOfInjection || '—')}</td>
        <td>${vetLicenseCell}</td>
        <td>${vd.dueDate ? formatPrintDate(vd.dueDate) : '—'}</td>
      </tr>
    `);
  }).join('');

  // ── Vaccination Status Summary table rows ────────────────────
  // Deduplicate by vaccine name — pick the most recent administration per vaccine.
  const latestByVaccine = new Map();
  vaccineRecords.forEach(r => {
    const admins = getVaccineAdministrations(r);
    const rTime = r.date?.toDate ? r.date.toDate().getTime() : (r.date?.seconds ? r.date.seconds * 1000 : 0);
    admins.forEach(admin => {
      const name = admin.vaccineName;
      if (!name) return;
      const existing = latestByVaccine.get(name);
      if (!existing || rTime > existing.rTime) latestByVaccine.set(name, { admin, record: r, rTime });
    });
  });

  const statusRows = Array.from(latestByVaccine.values()).map(({ admin, record }) => {
    const { status, daysUntilDue } = deriveVaxStatus(admin, record.date);
    const statusColor = status === 'Current' ? '#2E7D32'
      : status === 'Due Soon' ? '#F57F17'
      : status === 'Overdue' ? '#C62828'
      : '#757575';
    const dueLabel = daysUntilDue === null ? '—'
      : daysUntilDue < 0 ? `${Math.abs(daysUntilDue)}d overdue`
      : `${daysUntilDue}d`;
    return `
      <tr>
        <td><strong>${esc(admin.vaccineName)}</strong></td>
        <td>${formatPrintDate(record.date)}</td>
        <td style="color:${statusColor}; font-weight:700">${status}</td>
        <td>${dueLabel}</td>
      </tr>
    `;
  }).join('');

  // ── Passport mode ────────────────────────────────────────────────
  // Generates an owner-facing certificate with cover, status cards, and
  // a veterinarian certification block. The 'record' mode return below
  // is completely unaffected.
  if (mode === 'passport') {
    const nowDateOnly = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

    // Build per-vaccine status cards from the deduplication map already computed above.
    // When a vaccineCatalog is provided, use it to resolve the canonical intervalDays
    // for any administration entry that doesn't carry its own (legacy records).
    const vaccineCards = Array.from(latestByVaccine.values()).map(({ admin, record }) => {
      const catalogEntry = Array.isArray(vaccineCatalog)
        ? vaccineCatalog.find(v => v.name?.toLowerCase() === (admin.vaccineName || '').toLowerCase()
            || (v.keywords || []).some(kw => (admin.vaccineName || '').toLowerCase().includes(kw)))
        : null;
      const resolvedAdmin = catalogEntry && !admin.intervalDays
        ? { ...admin, intervalDays: catalogEntry.intervalDays }
        : admin;
      const { status, daysUntilDue } = deriveVaxStatus(resolvedAdmin, record.date);

      const statusColor = status === 'Current' ? '#2E7D32'
        : status === 'Due Soon' ? '#E65100'
        : status === 'Overdue' ? '#C62828'
        : '#757575';
      const statusBg = status === 'Current' ? '#E8F5E9'
        : status === 'Due Soon' ? '#FFF3E0'
        : status === 'Overdue' ? '#FFEBEE'
        : '#F5F5F5';
      const borderColor = statusColor;

      const dueText = daysUntilDue === null ? 'Unknown'
        : daysUntilDue < 0 ? `${Math.abs(daysUntilDue)} days overdue`
        : daysUntilDue === 0 ? 'Due today'
        : `in ${daysUntilDue} days`;

      const mfrLot = [
        admin.manufacturer ? `Mfr: ${esc(admin.manufacturer)}` : null,
        admin.lotNumber ? `Lot: ${esc(admin.lotNumber)}` : null,
      ].filter(Boolean).join(' &nbsp;|&nbsp; ');

      const nextDueDisplay = admin.dueDate
        ? formatPrintDate(admin.dueDate)
        : (daysUntilDue !== null && daysUntilDue >= 0
            ? `~${new Date(Date.now() + daysUntilDue * 86400000).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}`
            : '—');

      return `
        <div class="vaccine-card" style="border-left: 4px solid ${borderColor};">
          <div class="vaccine-card-body">
            <div class="vaccine-card-name">${esc(admin.vaccineName || '—')}</div>
            <div class="vaccine-card-detail">Last administered: ${formatPrintDate(record.date)}${record.vetName ? ` &mdash; ${esc(record.vetName)}` : ''}</div>
            ${mfrLot ? `<div class="vaccine-card-detail">${mfrLot}</div>` : ''}
            <div class="vaccine-card-detail">Next due: ${esc(nextDueDisplay)} (${esc(dueText)})</div>
          </div>
          <span class="status-badge" style="background:${statusBg}; color:${statusColor}; border: 1px solid ${statusColor};">${esc(status)}</span>
        </div>
      `;
    }).join('');

    const safeClinicName = esc(clinicName || 'Veterinary Clinic');
    const safeClinicAddress = esc(clinicAddress || '');

    const lastVetName = vaccineRecords[vaccineRecords.length - 1]?.vetName || '';
    const lastVetDoc = staffLookup?.get(lastVetName) || null;
    const lastVetHasLicense = lastVetDoc && (lastVetDoc.prcLicense || lastVetDoc.ptrNumber);
    const certVetLine = lastVetName
      ? `${esc(lastVetName)}${lastVetHasLicense ? `<br/>PRC: ${esc(lastVetDoc.prcLicense || '—')} / PTR: ${esc(lastVetDoc.ptrNumber || '—')}` : ''}`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vaccination Passport — ${petName}</title>
  <style>${PRINT_STYLES}${PASSPORT_STYLES}</style>
</head>
<body>

  <!-- ── Cover Section ───────────────────────────────────────── -->
  <div class="passport-cover">
    <p class="clinic-name" style="margin:0 0 2px;">${safeClinicName}</p>
    ${safeClinicAddress ? `<p style="font-size:11px; color:#5D4037; margin:0 0 4px;">${safeClinicAddress}</p>` : ''}
    ${clinicPhone ? `<p style="font-size:11px; color:#5D4037; margin:0 0 4px;">${esc(clinicPhone)}</p>` : ''}
    ${clinicBAI ? `<p style="font-size:11px; color:#5D4037; margin:0 0 16px;">BAI Reg. No. ${esc(clinicBAI)}</p>` : ''}
    <p class="passport-title">Vaccination Passport</p>
    <p class="passport-subtitle">Official Veterinary Immunization Record</p>
    <div class="passport-pet-card">
      <div class="pet-name">${petName}</div>
      <div class="pet-detail">${species}${breed !== '—' ? ` &middot; ${breed}` : ''} &middot; ${gender}</div>
      <div class="pet-detail">DOB: ${dobLabel} &nbsp;&middot;&nbsp; Weight: ${weightLabel}</div>
      <div class="pet-detail">Microchip: ${microchip}</div>
      <div class="pet-detail" style="margin-top:6px;">Owner: ${ownerName} &nbsp;&middot;&nbsp; ${ownerPhone}</div>
      ${ownerAddress ? `<div class="pet-detail">${ownerAddress}</div>` : ''}
    </div>
    <p class="passport-generated">Document generated ${nowDateOnly}</p>
  </div>

  <!-- ── Vaccine Status Cards ────────────────────────────────── -->
  <h2>Vaccination Status</h2>
  <div class="vaccine-cards-section">
    ${latestByVaccine.size > 0
      ? vaccineCards
      : '<p style="font-size:13px;color:#A1887F;font-style:italic;">No vaccination records on file.</p>'}
  </div>

  <!-- ── Full History Table ──────────────────────────────────── -->
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

  <!-- ── Certification Block ─────────────────────────────────── -->
  <div class="certification-block">
    <p>I certify that the vaccinations listed above were administered to the patient
       identified in this document in accordance with veterinary standards of care,
       and that the information provided is accurate to the best of my knowledge.</p>
    <div class="signature-row">
      <div class="signature-cell">
        <div class="signature-line"></div>
        <p class="signature-label">Veterinarian Signature</p>
      </div>
      <div class="signature-cell">
        <div style="border-bottom:1.5px solid #3E2723; height:36px; margin-bottom:4px; font-size:11px; color:#3E2723; display:flex; align-items:flex-end; padding-bottom:2px;">${certVetLine}</div>
        <p class="signature-label">Veterinarian Name &amp; License No.</p>
      </div>
      <div class="signature-cell">
        <div class="signature-line"></div>
        <p class="signature-label">Date Signed</p>
      </div>
    </div>
    <p class="cert-note">
      This document was generated by VetConnect and serves as an official vaccination record
      from ${safeClinicName}${safeClinicAddress ? `, ${safeClinicAddress}` : ''}.
      For verification, contact the clinic directly.
    </p>
  </div>

  <div class="footer">
    Generated on ${now} &nbsp;|&nbsp; ${safeClinicName} &nbsp;|&nbsp; Vaccination Passport
  </div>
</body>
</html>`;
  }

  // ── Record mode (default) ───────────────────────────────────
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
    ${clinicPhone ? `<p class="clinic-address">${esc(clinicPhone)}</p>` : ''}
    ${clinicBAI ? `<p class="clinic-address">BAI Reg. No. ${esc(clinicBAI)}</p>` : ''}
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
    ${ownerAddress ? `<div><span class="label">Address:</span> <span class="value">${ownerAddress}</span></div>` : ''}
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
