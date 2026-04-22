import { PRINT_STYLES, formatPrintDate, esc } from './printUtils';

/**
 * Generates a complete HTML string for a printable veterinary referral report.
 *
 * The returned string is a self-contained HTML document — pass it directly
 * to `openPrintWindow()`. Referral data is ephemeral (collected via
 * ReferralModal, never written to Firestore).
 *
 * @param {object} params
 * @param {object} params.pet            Pet Firestore document
 * @param {object} params.owner          Owner user document
 * @param {object} params.form           ReferralModal form state:
 *                                         { referredToClinic, referredToDoctor,
 *                                           referralReason, urgency, clinicalSummary }
 * @param {object} params.latestRecord   Most recent medical_records document (may be null)
 * @param {string} params.referringVet   Attending vet name (from latest record or profile)
 * @param {string} params.clinicName     From useClinicSettings()
 * @param {string} params.clinicAddress  From useClinicSettings()
 * @returns {string} Full HTML document string
 */
export function generateReferralReportHTML({
  pet,
  owner,
  form,
  latestRecord,
  referringVet,
  clinicName,
  clinicAddress,
}) {
  const petName = esc(pet?.name || '—');
  const species = esc(pet?.species || '—');
  const breed = esc((pet?.breed && pet.breed !== 'Unknown Breed') ? pet.breed : '—');
  const gender = esc(pet?.gender || '—');

  // Age
  let age = '—';
  if (pet?.dob) {
    try {
      const bd = pet.dob.toDate ? pet.dob.toDate() : new Date(pet.dob);
      if (!isNaN(bd.getTime())) {
        const today = new Date();
        let y = today.getFullYear() - bd.getFullYear();
        const m = today.getMonth() - bd.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) y--;
        age = y < 0 ? '—' : y === 0
          ? `${Math.floor((today - bd) / (1000 * 60 * 60 * 24 * 30.44))}mo`
          : `${y}y`;
      }
    } catch { /* ignore */ }
  }

  const lastWeight = latestRecord?.vitals?.weight || pet?.lastWeight;
  const weightLabel = lastWeight ? `${esc(String(lastWeight))} kg` : '—';
  const ownerName = esc(owner?.displayName || owner?.name || '—');
  const ownerPhone = esc(owner?.phone || owner?.contactNumber || '—');
  const allergies = (pet?.allergies && !['None', 'None recorded', ''].includes(pet?.allergies))
    ? `<strong style="color:#C62828;">${esc(pet.allergies)}</strong>`
    : 'None known';

  const {
    referredToClinic: _referredToClinic,
    referredToDoctor: _referredToDoctor,
    referralReason: _referralReason,
    urgency,
    clinicalSummary: _clinicalSummary,
  } = form;
  const referredToClinic = esc(_referredToClinic || '—');
  const referredToDoctor = _referredToDoctor ? esc(_referredToDoctor) : null;
  const referralReason = esc(_referralReason || '—');
  const clinicalSummary = esc(_clinicalSummary || '—');
  const escapedReferringVet = esc(referringVet || '—');

  // ── Urgency badge (shown for Urgent or Emergency) ──────────────
  const urgencyBadge = urgency !== 'Routine' ? `
    <div style="
      display: inline-block;
      background: ${urgency === 'Emergency' ? '#FFEBEE' : '#FFF8E1'};
      color: ${urgency === 'Emergency' ? '#C62828' : '#E65100'};
      border: 2px solid ${urgency === 'Emergency' ? '#C62828' : '#E65100'};
      padding: 4px 14px;
      font-weight: 900;
      font-size: 13px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 16px;
    ">${urgency}</div>
  ` : '';

  // ── Vitals (from latest record) ───────────────────────────────
  const vitals = latestRecord?.vitals;
  const vitalsSection = vitals && (vitals.weight || vitals.temp || vitals.hr || vitals.rr || vitals.crt || vitals.bcs)
    ? `
    <h2>Recent Vitals (from latest record — ${formatPrintDate(latestRecord?.date)})</h2>
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
    `
    : '';

  // ── Current Medications (from latest record, no prices) ───────
  const prescriptions = latestRecord?.prescriptions;
  const medsSection = prescriptions?.length
    ? `
    <h2>Current Medications</h2>
    <table>
      <thead>
        <tr><th>#</th><th>Medication</th><th>Qty</th><th>Instructions</th></tr>
      </thead>
      <tbody>
        ${prescriptions.map((rx, i) => `
          <tr>
            <td>${i + 1}</td>
            <td><strong>${esc(rx.name || '—')}</strong></td>
            <td>${rx.qty ?? '—'}</td>
            <td>${esc(rx.instructions || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    `
    : '';

  const now = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Referral Report — ${petName}</title>
  <style>
    ${PRINT_STYLES}
    .referral-from-to {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    .referral-box {
      border: 1px solid #D7CCC8;
      padding: 10px 14px;
      background: #FAF8F5;
    }
    .referral-box-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #5D4037;
      margin-bottom: 6px;
    }
    .referral-box p {
      margin: 2px 0;
      font-size: 13px;
    }
    .sig-line {
      margin-top: 40px;
      border-top: 1px solid #3E2723;
      width: 260px;
      padding-top: 6px;
      font-size: 12px;
      color: #5D4037;
    }
  </style>
</head>
<body>
  <div class="clinic-header">
    <p class="clinic-name">${esc(clinicName || 'Veterinary Clinic')}</p>
    <p class="clinic-address">${esc(clinicAddress || '')}</p>
    <p class="doc-title">Veterinary Referral Report</p>
  </div>

  ${urgencyBadge}

  <div class="referral-from-to">
    <div class="referral-box">
      <div class="referral-box-title">From</div>
      <p><strong>${esc(clinicName || 'Veterinary Clinic')}</strong></p>
      <p>${esc(clinicAddress || '')}</p>
      <p>Referring Veterinarian: <strong>${escapedReferringVet}</strong></p>
    </div>
    <div class="referral-box">
      <div class="referral-box-title">To</div>
      <p><strong>${referredToClinic}</strong></p>
      <p>${referredToDoctor ? `Attn: Dr. ${referredToDoctor}` : 'Attending Veterinarian'}</p>
    </div>
  </div>

  <h2>Patient Information</h2>
  <div class="info-grid">
    <div><span class="label">Name:</span> <span class="value">${petName}</span></div>
    <div><span class="label">Species:</span> <span class="value">${species}</span></div>
    <div><span class="label">Breed:</span> <span class="value">${breed}</span></div>
    <div><span class="label">Sex:</span> <span class="value">${gender}</span></div>
    <div><span class="label">Age:</span> <span class="value">${age}</span></div>
    <div><span class="label">Weight:</span> <span class="value">${weightLabel}</span></div>
    <div><span class="label">Owner:</span> <span class="value">${ownerName}</span></div>
    <div><span class="label">Phone:</span> <span class="value">${ownerPhone}</span></div>
    <div><span class="label">Allergies:</span> <span class="value">${allergies}</span></div>
  </div>

  <h2>Reason for Referral</h2>
  <p style="font-size:13px; white-space:pre-wrap;">${referralReason}</p>

  <h2>Clinical Summary</h2>
  <p style="font-size:13px; white-space:pre-wrap;">${clinicalSummary}</p>

  ${vitalsSection}
  ${medsSection}

  <div style="margin-top:40px;">
    <div class="sig-line">
      ________________________
      <br/>Referring Veterinarian
      <br/><strong>${escapedReferringVet}</strong>
    </div>
  </div>

  <div class="footer">
    Generated on ${now} &nbsp;|&nbsp; ${esc(clinicName || 'Veterinary Clinic')} &nbsp;|&nbsp; This referral report is for veterinary use only.
  </div>
</body>
</html>`;
}
