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
 * @param {{ record: object, petName: string, services?: object[], clinicSettings?: object }} params
 *   record   — medical_records document (or appointment object with service/vitals fields)
 *   petName  — pet display name shown in the PDF header
 *   services — optional appointment services[] array
 *   clinicSettings - optional dynamic clinic contact info from Firestore
 */
export async function generateVisitPDF({ record, petName, services, clinicSettings }) {
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
  const dsDiagnosisList = (record.diagnoses?.length > 0
    ? record.diagnoses
    : (record.dischargeSummary?.diagnosis ? [{ name: record.dischargeSummary.diagnosis }] : (record.diagnosis ? [{ name: record.diagnosis }] : [])))
    .filter(dx => dx.name && !['Clinical Visit', 'Unspecified', 'N/A'].includes(dx.name));
  
  const hasMultipleDx = dsDiagnosisList.length > 1;
  const dxLabel = hasMultipleDx ? 'Diagnoses' : 'Diagnosis';
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

  const clinic = clinicSettings || {};
  const clinicName = esc(clinic.clinicName || '');
  const clinicAddress = esc(clinic.clinicAddress || '');
  const clinicPhone = esc(clinic.clinicPhone || '');
  const clinicEmail = esc(clinic.clinicEmail || '');
  const baiReg = esc(clinic.baiRegistrationNumber || '—');
  const clinicTIN = esc(clinic.clinicTIN || '—');

  const sortedServices = [...(record.serviceNames?.length > 0 ? record.serviceNames : [record.serviceType || 'Clinical Visit'])].sort();
  const servicesText = sortedServices.join(', ');
  const staffNames = record.serviceAttribution?.filter(a => a.staffName).map(a => a.staffName) || [];
  const staffText = staffNames.length > 0 ? [...new Set(staffNames)].join(', ') : esc(record.vetName || 'Attending Clinician');

  const htmlContent = `
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px 40px; color: #1A1A1A; line-height: 1.5; }
          .header-container { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
          .clinic-info { flex: 1; }
          .clinic-name { font-size: 22px; font-weight: 900; color: #1A1A1A; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: -0.5px; }
          .clinic-meta { font-size: 11px; color: #666; margin: 0; }
          
          .doc-badge { background: #1A1A1A; color: #FFFFFF; padding: 8px 16px; font-size: 12px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
          
          .memo-grid { display: table; width: 100%; border-top: 2px solid #1A1A1A; border-bottom: 1px solid #E5E5E5; margin-bottom: 24px; padding: 12px 0; }
          .memo-row { display: table-row; }
          .memo-label { display: table-cell; width: 100px; font-size: 10px; font-weight: 900; color: #888; padding: 4px 0; text-transform: uppercase; letter-spacing: 1px; }
          .memo-value { display: table-cell; font-size: 13px; font-weight: 700; color: #1A1A1A; padding: 4px 0; }
          
          .section-anchor { font-size: 11px; font-weight: 900; color: #888; text-transform: uppercase; letter-spacing: 1.5px; margin: 24px 0 8px 0; border-bottom: 1px dashed #E5E5E5; padding-bottom: 4px; }
          .content-text { font-size: 14px; color: #1A1A1A; font-weight: 500; margin: 0; }
          .bullet-list { margin: 8px 0; padding-left: 16px; list-style-type: none; }
          .bullet-item { font-size: 14px; color: #1A1A1A; margin-bottom: 6px; position: relative; }
          .bullet-item::before { content: "•"; position: absolute; left: -14px; color: #888; }
          
          .vitals-table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          .vitals-row { border-bottom: 1px dashed #F0F0F0; }
          .vitals-label { font-size: 11px; font-weight: 900; color: #888; padding: 8px 0; text-transform: uppercase; }
          .vitals-value { font-size: 13px; font-weight: 700; color: #1A1A1A; text-align: right; padding: 8px 0; font-family: monospace; }
          .stipple { color: #DDD; font-weight: 400; letter-spacing: 2px; }

          .signature-area { margin-top: 60px; display: flex; flex-direction: column; align-items: flex-end; }
          .sig-label { font-size: 10px; font-weight: 700; color: #888; font-style: italic; margin-bottom: 4px; }
          .sig-name { font-size: 14px; font-weight: 900; color: #1A1A1A; margin-bottom: 4px; }
          .sig-line { width: 200px; height: 1px; background: #1A1A1A; margin-bottom: 4px; }
          .sig-title { font-size: 9px; font-weight: 900; color: #888; letter-spacing: 1px; text-transform: uppercase; }
          
          .reg-footer { margin-top: 40px; border-top: 1px solid #E5E5E5; padding-top: 12px; display: flex; justify-content: space-between; font-size: 9px; color: #AAA; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div class="clinic-info">
            <h1 class="clinic-name">${clinicName}</h1>
            <p class="clinic-meta">${clinicAddress}</p>
            <p class="clinic-meta">T: ${clinicPhone} | E: ${clinicEmail}</p>
          </div>
          <div class="doc-badge">Visit Summary</div>
        </div>

        <div class="memo-grid">
          <div class="memo-row">
            <div class="memo-label">Services</div>
            <div class="memo-value">${esc(servicesText)}</div>
          </div>
          <div class="memo-row">
            <div class="memo-label">Staff</div>
            <div class="memo-value">${esc(staffText)}</div>
          </div>
          <div class="memo-row">
            <div class="memo-label">Patient</div>
            <div class="memo-value">${esc(petName)}</div>
          </div>
          <div class="memo-row">
            <div class="memo-label">Date</div>
            <div class="memo-value">${esc(dateStr)}</div>
          </div>
        </div>

        ${record.soap?.subjective ? `
          <div class="section-anchor">Reason for Visit</div>
          <p class="content-text" style="font-size: 16px; font-weight: 700;">${esc(record.soap.subjective)}</p>
        ` : ''}

        ${dsDiagnosisList.length > 0 ? `
          <div class="section-anchor">${dxLabel}</div>
          ${hasMultipleDx ? `
            <ul class="bullet-list">
              ${dsDiagnosisList.map(dx => `<li class="bullet-item">${esc(dx.name)}${dx.severity ? ` (${esc(dx.severity.toUpperCase())})` : ''}</li>`).join('')}
            </ul>
          ` : `<p class="content-text">${esc(dsDiagnosisList[0].name)}${dsDiagnosisList[0].severity ? ` (${esc(dsDiagnosisList[0].severity.toUpperCase())})` : ''}</p>`}
        ` : ''}

        ${hasAnyVital ? `
          <div class="section-anchor">Vitals</div>
          <table class="vitals-table">
            <tr class="vitals-row">
              <td class="vitals-label">Weight <span class="stipple">................</span></td>
              <td class="vitals-value">${esc(pdfVitals.weight || '-')} kg</td>
              <td style="width: 40px;"></td>
              <td class="vitals-label">Temperature <span class="stipple">...........</span></td>
              <td class="vitals-value">${esc(pdfVitals.temp || '-')} &deg;C</td>
            </tr>
            <tr class="vitals-row">
              <td class="vitals-label">Heart Rate <span class="stipple">...........</span></td>
              <td class="vitals-value">${esc(pdfVitals.hr || '-')} bpm</td>
              <td style="width: 40px;"></td>
              <td class="vitals-label">Resp Rate <span class="stipple">.............</span></td>
              <td class="vitals-value">${esc(pdfVitals.rr || '-')} br/min</td>
            </tr>
            <tr class="vitals-row">
              <td class="vitals-label">CRT <span class="stipple">..................</span></td>
              <td class="vitals-value">${esc(pdfVitals.crt || '-')} s</td>
              <td style="width: 40px;"></td>
              <td class="vitals-label">BCS <span class="stipple">..................</span></td>
              <td class="vitals-value">${esc(pdfVitals.bcs || '-')} / 9</td>
            </tr>
          </table>
        ` : ''}

        ${hasDischarge && dsInstructions ? `
          <div class="section-anchor">Discharge Notes</div>
          <p class="content-text" style="line-height: 1.6;">${esc(dsInstructions).replace(/\n/g, '<br/>')}</p>
        ` : ''}

        ${hasDischarge && dsMeds.length > 0 ? `
          <div class="section-anchor">Medications</div>
          <ul class="bullet-list">
            ${dsMeds.map(med => `
              <li class="bullet-item">
                <b>${esc(med.name)}</b> x${esc(med.qty || 1)}: ${esc(med.instructions || 'Use as directed')}
              </li>
            `).join('')}
          </ul>
        ` : ''}

        ${nextVisitStr ? `
          <div class="section-anchor">Next Steps</div>
          <p class="content-text" style="color: #D32F2F; font-weight: 900;">RECHECK IN: ${esc(nextVisitStr)}</p>
        ` : ''}

        <div class="signature-area">
          <div class="sig-label">Signed by</div>
          <div class="sig-name">${esc(record.vetName || 'Authorized Clinician')}</div>
          <div class="sig-line"></div>
          <div class="sig-title">Attending Veterinarian</div>
        </div>

        <div class="reg-footer">
          <span>BAI Reg No: ${baiReg}</span>
          <span>TIN: ${clinicTIN}</span>
        </div>
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
