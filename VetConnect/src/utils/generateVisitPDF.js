import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatDisplayDate } from './helpers';
import { resolveVitals } from './resolveVitals';

/**
 * Formats a duration in milliseconds into a human-readable string.
 * Examples: 75 min → "1h 15m", 40 min → "40 min", 0 or invalid → "".
 *
 * @param {number} ms — duration in milliseconds
 * @returns {string}
 */
function formatDuration(ms) {
  const totalMins = Math.round(ms / 60000);
  if (!Number.isFinite(totalMins) || totalMins <= 0) return '';
  if (totalMins < 60) return `${totalMins} min`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Resolves a Firestore Timestamp or ISO string to a millisecond epoch value.
 *
 * @param {object|string|null} ts
 * @returns {number|null}
 */
function resolveTimestampMs(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  const parsed = new Date(ts).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Generates and shares a PDF visit summary for a completed appointment.
 *
 * @param {{ record: object, petName: string, services?: object[] }} params
 *   record   — medical_records document (or appointment object with service/vitals fields)
 *   petName  — pet display name shown in the PDF header
 *   services — optional appointment services[] array; when provided and has 2+ entries,
 *              a "Services Performed" section is rendered with per-service status, duration,
 *              staff, and price. Gracefully omitted when undefined, null, or length < 2.
 */
export async function generateVisitPDF({ record, petName, services }) {
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const dateStr = formatDisplayDate(record.date);

  // --- Services Performed section ---
  // Only rendered when 2 or more services are provided.
  const validServices = Array.isArray(services) && services.length >= 2 ? services : null;

  const servicesHtml = validServices
    ? `<h3>Services Performed</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="border-bottom: 1px solid #ccc;">
              <th style="text-align: left; padding: 4px 8px;">Service</th>
              <th style="text-align: left; padding: 4px 8px;">Duration</th>
              <th style="text-align: left; padding: 4px 8px;">Staff</th>
              <th style="text-align: right; padding: 4px 8px;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${validServices.map((svc) => {
              const status = svc.serviceStatus || 'pending';
              const icon = status === 'completed' ? '✓' : status === 'in-progress' ? '⏳' : '○';
              const name = esc(svc.name || (typeof svc === 'string' ? svc : '—'));
              const startMs = resolveTimestampMs(svc.serviceStartedAt);
              const endMs = resolveTimestampMs(svc.serviceCompletedAt);
              const duration =
                startMs != null && endMs != null
                  ? formatDuration(endMs - startMs)
                  : '';
              const staffName = svc.staffName ? esc(svc.staffName) : '—';
              const price =
                svc.price != null
                  ? `&#x20B1;${Number(svc.price).toLocaleString()}`
                  : '—';
              return `<tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 6px 8px;">${icon} ${name}</td>
                <td style="padding: 6px 8px; color: #555;">${esc(duration) || '—'}</td>
                <td style="padding: 6px 8px; color: #555;">${staffName}</td>
                <td style="text-align: right; padding: 6px 8px;">${price}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`
    : '';

  // When there are 2+ services, show "Services: N" in the header summary row
  // (key becomes "Services", value becomes the count — avoids "Services: Services: 3").
  const serviceHeaderKey = validServices ? 'Services' : 'Service';
  const serviceHeaderLabel = validServices
    ? String(validServices.length)
    : esc(record.serviceType);

  const hasDischarge = !!record.dischargeSummary;
  const dsInstructions = record.dischargeSummary?.instructions || '';
  const dsDiagnosis = record.dischargeSummary?.diagnosis || record.diagnosis || '';
  const dsMeds = record.dischargeSummary?.medications || [];

  const rxHtmlFromDischarge =
    dsMeds.length > 0
      ? `<h3>Medications</h3><ul>${dsMeds
          .map(
            (med) =>
              `<li><b>${esc(med.name)}</b> x${esc(med.qty || 1)}: ${esc(med.instructions || 'Use as directed')}</li>`,
          )
          .join('')}</ul>`
      : '';

  const dsSupplies = record.dischargeSummary?.supplies || [];
  const suppliesHtmlFromDischarge =
    dsSupplies.length > 0
      ? `<h3>Take-Home Supplies</h3><ul>${dsSupplies
          .map(
            (sup) =>
              `<li><b>${esc(sup.name)}</b> x${esc(sup.qty || 1)}${sup.instructions ? `: ${esc(sup.instructions)}` : ''}</li>`,
          )
          .join('')}</ul>`
      : '';

  let rxHtml = '';
  const allMeds = [
    ...(record.prescriptions || []),
    ...(record.dispensedProducts || [])
  ];

  if (allMeds.length > 0 && !dsMeds.length) {
    const medications = allMeds.filter(
      (rx) => (rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail')) === 'medicine',
    );
    const nonDrugItems = allMeds.filter(
      (rx) => (rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail')) !== 'medicine',
    );
    rxHtml = [
      medications.length > 0
        ? `<h3>Prescribed Medications</h3><ul>${medications
            .map(
              (rx) =>
                `<li><b>${esc(rx.name)}${rx.qty ? ` x${esc(rx.qty)}` : ''}</b>: ${esc(rx.instructions || 'Use as directed')}</li>`,
            )
            .join('')}</ul>`
        : '',
      nonDrugItems.length > 0
        ? `<h3>Other Items</h3><ul>${nonDrugItems
            .map(
              (rx) =>
                `<li><b>${esc(rx.name)}${rx.qty ? ` x${esc(rx.qty)}` : ''}</b>: ${esc(rx.instructions || 'Use as directed')}</li>`,
            )
            .join('')}</ul>`
        : '',
    ].join('');
  }

  const nextVisitRaw = record.dischargeSummary?.nextVisit || record.nextVisit;
  const nextVisitStr = nextVisitRaw
    ? formatDisplayDate(nextVisitRaw, { month: 'long', day: 'numeric', year: 'numeric' }, null)
    : null;

  const pdfVitals = resolveVitals(record);
  const hasAnyVital = Object.values(pdfVitals).some((v) => v != null && v !== '');

  const htmlContent = `
    <html>
      <body style="font-family: Helvetica, Arial, sans-serif; padding: 40px; color: #333;">
        <h1 style="color: #8B4513; text-align: center; border-bottom: 2px solid #8B4513; padding-bottom: 10px;">Starbarks Veterinary Clinic</h1>
        <h2 style="text-align: center; margin-top: 0;">Visit Summary</h2>
        <table style="width: 100%; margin-bottom: 30px;">
          <tr><td><b>Patient:</b> ${esc(petName)}</td><td style="text-align: right;"><b>Date:</b> ${esc(dateStr)}</td></tr>
          <tr><td><b>${serviceHeaderKey}:</b> ${serviceHeaderLabel}</td><td style="text-align: right;"><b>Attending Vet:</b> ${esc(record.vetName || 'Staff')}</td></tr>
        </table>
        ${servicesHtml}
        ${hasAnyVital ? `<h3>Vitals</h3>
        <p>
          <b>Weight:</b> ${esc(pdfVitals.weight || '-')} kg &nbsp;&nbsp; | &nbsp;&nbsp;
          <b>Temp:</b> ${esc(pdfVitals.temp || '-')} &deg;C &nbsp;&nbsp; | &nbsp;&nbsp;
          <b>Heart Rate:</b> ${esc(pdfVitals.hr || '-')} bpm
          ${pdfVitals.rr ? ` &nbsp;&nbsp; | &nbsp;&nbsp; <b>RR:</b> ${esc(pdfVitals.rr)} br/min` : ''}
          ${pdfVitals.crt ? ` &nbsp;&nbsp; | &nbsp;&nbsp; <b>CRT:</b> ${esc(pdfVitals.crt)} sec` : ''}
          ${pdfVitals.bcs ? ` &nbsp;&nbsp; | &nbsp;&nbsp; <b>BCS:</b> ${esc(pdfVitals.bcs)}/9` : ''}
          ${pdfVitals.pain ? ` &nbsp;&nbsp; | &nbsp;&nbsp; <b>Pain:</b> ${esc(pdfVitals.pain)}/10` : ''}
        </p>` : ''}
        ${dsDiagnosis ? `<h3>Diagnosis</h3><p>${esc(dsDiagnosis)}</p>` : ''}
        ${record.patientStatus ? `<p><b>Status:</b> ${esc(record.patientStatus)}</p>` : ''}
        ${hasDischarge && dsInstructions ? `<h3>Discharge Notes</h3><p>${esc(dsInstructions).replace(/\n/g, '<br/>')}</p>` : ''}
        ${hasDischarge ? rxHtmlFromDischarge + suppliesHtmlFromDischarge : rxHtml}
        ${nextVisitStr ? `<h3 style="color: #D32F2F;">Next Follow-Up Due: ${esc(nextVisitStr)}</h3>` : ''}
        <hr style="margin-top: 50px;" />
        <p style="text-align: center; font-size: 12px; color: #888;">This is an electronically generated visit summary and does not require a physical signature.</p>
      </body>
    </html>
  `;

  try {
    const { uri } = await Print.printToFileAsync({ html: htmlContent });
    await Sharing.shareAsync(uri, {
      UTI: '.pdf',
      mimeType: 'application/pdf',
    });
  } catch (error) {
    console.warn('[generateVisitPDF]', error.message);
    throw error;
  }
}
