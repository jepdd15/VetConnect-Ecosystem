import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatDisplayDate } from './helpers';
import { resolveVitals } from './resolveVitals';

/**
 * Generates and shares a PDF visit summary for a completed appointment.
 *
 * @param {{ record: object, petName: string }} params
 *   record  — medical_records document (or appointment object with service/vitals fields)
 *   petName — pet display name shown in the PDF header
 */
export async function generateVisitPDF({ record, petName }) {
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const dateStr = formatDisplayDate(record.date);

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
  if (record.prescriptions && record.prescriptions.length > 0 && !dsMeds.length) {
    const medications = record.prescriptions.filter(
      (rx) => (rx.productClass || (rx.isDrug ? 'medicine' : 'retail')) === 'medicine',
    );
    const nonDrugItems = record.prescriptions.filter(
      (rx) => (rx.productClass || (rx.isDrug ? 'medicine' : 'retail')) !== 'medicine',
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
          <tr><td><b>Service:</b> ${esc(record.serviceType)}</td><td style="text-align: right;"><b>Attending Vet:</b> ${esc(record.vetName || 'Staff')}</td></tr>
        </table>
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
