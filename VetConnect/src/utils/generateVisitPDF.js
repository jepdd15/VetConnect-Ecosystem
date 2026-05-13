import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatDisplayDate, calculateAge } from './helpers';
import { resolveVitals } from './resolveVitals';

/**
 * Super Template: Mobile PDF Generator
 * Achieves 1:1 parity with Administrative Printouts.
 */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const stipple = '<span style="color: #DDD; font-weight: 400; letter-spacing: 2px;">................</span>';

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

// ─── Modular Renderers (1:1 with Admin) ──────────────────────────────────────

const renderVitalsSection = (vitals) => {
  const v = vitals || {};
  return `
    <div class="section-anchor">Vitals</div>
    <table class="vitals-table">
      <tr class="vitals-row">
        <td class="vitals-label">Weight ${stipple}</td>
        <td class="vitals-value">${esc(v.weight || '—')} kg</td>
        <td style="width: 40px;"></td>
        <td class="vitals-label">Temperature ${stipple}</td>
        <td class="vitals-value">${esc(v.temp || '—')} &deg;C</td>
      </tr>
      <tr class="vitals-row">
        <td class="vitals-label">Heart Rate ${stipple}</td>
        <td class="vitals-value">${esc(v.hr || '—')} bpm</td>
        <td style="width: 40px;"></td>
        <td class="vitals-label">Resp Rate ${stipple}</td>
        <td class="vitals-value">${esc(v.rr || '—')} br/min</td>
      </tr>
      <tr class="vitals-row">
        <td class="vitals-label">CRT ${stipple}</td>
        <td class="vitals-value">${esc(v.crt || '—')} s</td>
        <td style="width: 40px;"></td>
        <td class="vitals-label">BCS ${stipple}</td>
        <td class="vitals-value">${esc(v.bcs || '—')} / 9</td>
      </tr>
    </table>
  `;
};

const renderExamSection = (record) => {
  if (!record.physicalExam) return '';
  const exams = record.physicalExam;
  const categories = Object.keys(exams).filter(cat => exams[cat].status && exams[cat].status !== 'not_examined');
  if (categories.length === 0) return '';

  return `
    <div class="section-anchor">Physical Examination</div>
    <div style="column-count: 2; column-gap: 30px;">
      ${categories.map(cat => {
        const data = exams[cat];
        const isAbnormal = data.status === 'abnormal';
        return `
          <div style="break-inside: avoid; margin-bottom: 12px; border-left: 2px solid ${isAbnormal ? '#D32F2F' : '#E5E5E5'}; padding-left: 8px;">
            <div style="font-size: 9px; font-weight: 900; color: #888; text-transform: uppercase;">${esc(cat.replace(/_/g, ' '))}</div>
            <div style="font-size: 11px; font-weight: 700; color: ${isAbnormal ? '#D32F2F' : '#1A1A1A'};">${isAbnormal ? 'ABNORMAL' : 'NORMAL'}</div>
            ${data.notes ? `<div style="font-size: 11px; color: #666; margin-top: 2px;">${esc(data.notes)}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
};

const renderLabResultsSection = (labResults) => {
  const labs = Array.isArray(labResults) ? labResults : [];
  if (labs.length === 0) return '';

  return `
    <div class="section-anchor">Laboratory Results</div>
    <table class="data-table">
      <thead>
        <tr>
          <th>Test Name</th>
          <th style="text-align: right;">Result</th>
          <th>Status</th>
          <th>Reference Range</th>
        </tr>
      </thead>
      <tbody>
        ${labs.map(lab => `
          <tr>
            <td><b>${esc(lab.testName || lab.name)}</b></td>
            <td style="text-align: right; font-family: monospace; font-weight: 700;">${esc(lab.result)} ${esc(lab.unit || '')}</td>
            <td><span class="status-badge status-${(lab.status || 'normal').toLowerCase()}">${esc((lab.status || 'NORMAL').toUpperCase())}</span></td>
            <td style="color: #888; font-size: 11px;">${esc(lab.referenceRange || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
};

const renderVaccineSection = (vaccines) => {
  const vaxList = Array.isArray(vaccines) ? vaccines : (vaccines ? [vaccines] : []);
  if (vaxList.length === 0) return '';

  return `
    <div class="section-anchor">Immunizations</div>
    <table class="data-table">
      <thead>
        <tr>
          <th>Vaccine</th>
          <th>Dose</th>
          <th>Lot / Batch</th>
          <th style="text-align: right;">Next Due</th>
        </tr>
      </thead>
      <tbody>
        ${vaxList.map(v => `
          <tr>
            <td><b>${esc(v.vaccineName || v.name)}</b><br/><small style="color:#888">${esc(v.manufacturer || '')}</small></td>
            <td>${esc(v.doseNumber ? 'Dose ' + v.doseNumber : '—')}</td>
            <td style="font-family: monospace;">${esc(v.lotNumber || '—')}</td>
            <td style="text-align: right; font-weight: 700;">${v.dueDate ? esc(formatDisplayDate(v.dueDate)) : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
};

const renderPrescriptionsSection = (prescriptions) => {
  const meds = (prescriptions || []).filter(rx => (rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail')) === 'medicine');
  if (meds.length === 0) return '';

  return `
    <div class="section-anchor">Prescriptions</div>
    <div class="bullet-list">
      ${meds.map(rx => `
        <div class="bullet-item">
          <div style="font-size: 13px; font-weight: 700;">${esc(rx.name)} ${rx.qty ? `(${esc(rx.qty)})` : ''}</div>
          <div style="font-size: 12px; color: #444; font-style: italic;">Sig: ${esc(rx.instructions || 'Use as directed')}</div>
        </div>
      `).join('')}
    </div>
  `;
};

const renderServicesSection = (record, services) => {
  const validServices = Array.isArray(services) && services.length >= 2 ? services : null;
  if (!validServices) return '';

  return `
    <div class="section-anchor">Services Performed</div>
    <table class="data-table">
      <thead>
        <tr>
          <th>Service</th>
          <th>Duration</th>
          <th>Staff</th>
          <th style="text-align: right;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${validServices.map(svc => {
          const startMs = resolveTimestampMs(svc.serviceStartedAt);
          const endMs = resolveTimestampMs(svc.serviceCompletedAt);
          const duration = startMs != null && endMs != null ? formatDuration(endMs - startMs) : '—';
          return `
            <tr>
              <td><b>${esc(svc.name || '—')}</b></td>
              <td style="color: #666;">${esc(duration)}</td>
              <td>${esc(svc.staffName || '—')}</td>
              <td style="text-align: right; font-weight: 700;">&#x20B1;${Number(svc.price || 0).toLocaleString()}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
};

const renderDischargeSection = (discharge, soapPrognosis) => {
  if (!discharge && !soapPrognosis) return '';
  const status = discharge?.patientStatus || '—';
  
  return `
    <div class="section-anchor">Discharge Notes</div>
    ${discharge?.instructions ? `
      <div style="margin-bottom: 12px; background: #F9F9F9; padding: 12px; border-left: 3px solid #1A1A1A;">
        <p class="content-text" style="font-size: 13px; line-height: 1.6;">${esc(discharge.instructions).replace(/\n/g, '<br/>')}</p>
      </div>
    ` : ''}

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 12px;">
      <div>
        <span style="font-size: 9px; font-weight: 900; color: #888; text-transform: uppercase;">Patient Status</span>
        <p class="content-text" style="font-weight: 700;">${esc(status).toUpperCase()}</p>
      </div>
      ${soapPrognosis ? `
        <div>
          <span style="font-size: 9px; font-weight: 900; color: #888; text-transform: uppercase;">Prognosis</span>
          <p class="content-text" style="font-weight: 700;">${esc(soapPrognosis).toUpperCase()}</p>
        </div>
      ` : ''}
    </div>
    
    <div style="border-top: 1px solid #EEE; padding-top: 12px; display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 9px; font-weight: 900; color: #888; text-transform: uppercase;">Follow-up / Recheck</span>
      <span style="font-size: 13px; font-weight: 700;">${esc(discharge?.nextVisit ? formatDisplayDate(discharge.nextVisit) : (discharge?.recheckIn || 'None scheduled'))}</span>
    </div>
  `;
};

// ─── Main Export ─────────────────────────────────────────────────────────────

export async function generateVisitPDF({ record, pet, owner, services, clinicSettings }) {
  const dateStr = formatDisplayDate(record.date);
  const pdfVitals = resolveVitals(record);
  
  const clinic = clinicSettings || {};
  const clinicName = esc(clinic.clinicName);
  const clinicAddress = esc(clinic.clinicAddress);
  const clinicPhone = esc(clinic.clinicPhone);
  const clinicEmail = esc(clinic.clinicEmail);
  const clinicTIN = esc(clinic.clinicTIN || '—');
  const clinicBAI = esc(clinic.baiRegistrationNumber || '—');

  // Signalment Helpers
  const petName = esc(pet?.name || 'Unknown Patient');
  const speciesBreed = `${esc(pet?.species || '—')} / ${esc(pet?.breed || '—')}`;
  const sexAge = `${esc(pet?.gender || '—')}${pet?.isNeutered ? ' (D)' : ''} / ${esc(pet?.dob ? calculateAge(pet.dob) : '—')}`;
  const ownerName = esc(owner?.fullName || owner?.name || '—');
  const ownerContact = `${esc(owner?.phoneNumber || '—')} / ${esc(owner?.email || '—')}`;

  const diagnoses = (record.diagnoses?.length > 0
    ? record.diagnoses.map(dx => dx.severity ? `${dx.name} (${dx.severity.toUpperCase()})` : dx.name).join('; ')
    : (record.diagnosis || '—'));

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 30px 45px; color: #1A1A1A; line-height: 1.4; }
        
        /* Header & Identity */
        .header-container { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; }
        .clinic-info { flex: 1; }
        .clinic-name { font-size: 20px; font-weight: 900; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: -0.5px; }
        .clinic-meta { font-size: 10px; color: #666; margin: 0; font-weight: 500; }
        .doc-badge { background: #1A1A1A; color: #FFF; padding: 6px 12px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }

        .signalment-grid { 
          display: grid; 
          grid-template-columns: 110px 1fr 110px 1fr; 
          width: 100%; 
          border-top: 2px solid #1A1A1A; 
          border-bottom: 2px solid #1A1A1A; 
          margin-bottom: 20px; 
          padding: 10px 0;
        }
        .sig-row { display: contents; }
        .sig-label { font-size: 9px; font-weight: 900; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; padding: 4px 0; }
        .sig-value { font-size: 13px; font-weight: 700; color: #1A1A1A; padding: 4px 0; }

        /* Sections */
        .section-anchor { font-size: 10px; font-weight: 900; color: #888; text-transform: uppercase; letter-spacing: 1.5px; margin: 24px 0 10px 0; border-bottom: 1px solid #EEE; padding-bottom: 4px; }
        .content-text { font-size: 14px; margin: 0; font-weight: 500; }
        
        /* Allergy Alert */
        .allergy-alert { background: #D32F2F; color: #FFF; padding: 8px 12px; font-weight: 900; font-size: 11px; text-transform: uppercase; margin-bottom: 20px; letter-spacing: 1px; }

        /* Tables */
        .vitals-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
        .vitals-row { border-bottom: 1px dashed #E5E5E5; }
        .vitals-label { font-size: 10px; font-weight: 900; color: #888; padding: 8px 0; text-transform: uppercase; }
        .vitals-value { font-size: 13px; font-weight: 700; text-align: right; padding: 8px 0; font-family: monospace; }
        
        .data-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
        .data-table th { font-size: 9px; font-weight: 900; color: #888; text-transform: uppercase; text-align: left; padding: 8px; border-bottom: 2px solid #1A1A1A; }
        .data-table td { font-size: 12px; padding: 8px; border-bottom: 1px solid #EEE; vertical-align: middle; }
        
        .status-badge { padding: 2px 6px; font-size: 9px; font-weight: 900; border-radius: 0; text-transform: uppercase; }
        .status-normal { background: #E8F5E9; color: #2E7D32; }
        .status-abnormal { background: #FFEBEE; color: #D32F2F; }

        .bullet-list { margin-top: 5px; }
        .bullet-item { padding: 8px 12px; border-left: 3px solid #EEE; margin-bottom: 8px; background: #FAFAFA; }

        /* Signature & Footer */
        .footer-area { margin-top: 50px; display: flex; justify-content: flex-end; align-items: flex-end; }
        .signature-block { width: 220px; }
        .sig-line { border-bottom: 1px solid #1A1A1A; height: 35px; margin-bottom: 5px; }
        .sig-label { font-size: 9px; font-weight: 900; color: #888; text-transform: uppercase; }
        
        .legal-footer { border-top: 1px solid #EEE; padding-top: 15px; margin-top: 30px; display: flex; justify-content: space-between; font-size: 9px; color: #AAA; font-weight: 700; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="header-container">
        <div class="clinic-info">
          <h1 class="clinic-name">${clinicName}</h1>
          <p class="clinic-meta">${clinicAddress}</p>
          <p class="clinic-meta">TEL: ${clinicPhone} &middot; EMAIL: ${clinicEmail}</p>
        </div>
        <div class="doc-badge">Visit Summary</div>
      </div>

      <div class="signalment-grid">
        <div class="sig-row">
          <div class="sig-label">Patient</div>
          <div class="sig-value">${petName}</div>
          <div class="sig-label">Type</div>
          <div class="sig-value">${speciesBreed}</div>
        </div>
        <div class="sig-row">
          <div class="sig-label">Sex</div>
          <div class="sig-value">${pet?.gender === 'Male' ? (pet?.isNeutered ? 'Male Neutered (MN)' : 'Male Intact (MI)')
            : pet?.gender === 'Female' ? (pet?.isNeutered ? 'Female Spayed (FS)' : 'Female Intact (FI)')
            : '—'}</div>
          <div class="sig-label">Age</div>
          <div class="sig-value">${esc(pet?.dob ? calculateAge(pet.dob) : '—')}</div>
        </div>
        <div class="sig-row">
          <div class="sig-label">Allergies</div>
          <div class="sig-value" style="grid-column: span 3;">${esc(pet?.allergies || 'None Recorded')}</div>
        </div>
        <div class="sig-row">
          <div class="sig-label">Owner</div>
          <div class="sig-value">${ownerName}</div>
          <div class="sig-label">Contact</div>
          <div class="sig-value">${ownerContact}</div>
        </div>
        <div class="sig-row">
          <div class="sig-label">Visit Date</div>
          <div class="sig-value">${esc(dateStr)}</div>
          <div class="sig-label">Attending</div>
          <div class="sig-value">${esc(record.vetName || 'Authorized Clinician')}</div>
        </div>
      </div>

      ${record.soap?.subjective ? `
        <div class="section-anchor">Subjective / Chief Complaint</div>
        <p class="content-text">${esc(record.soap.subjective)}</p>
      ` : ''}

      ${renderExamSection(record)}
      ${renderVitalsSection(pdfVitals)}
      
      <div class="section-anchor">Diagnosis / Findings</div>
      <div style="font-size: 14px; font-weight: 500; color: #1A1A1A; margin-top: 4px; margin-bottom: 24px;">
        ${esc(diagnoses)}
      </div>
      ${renderLabResultsSection(record.labResults)}
      ${renderVaccineSection(record.vaccineAdministrations || record.vaccineData)}
      ${renderPrescriptionsSection(record.prescriptions || record.dispensedProducts)}
      ${renderServicesSection(record, services)}
      ${renderDischargeSection(record.dischargeSummary, record.soap?.prognosis)}

      <div class="footer-area">
        <div class="signature-block">
          <div class="sig-line"></div>
          <div class="sig-label">Attending Veterinarian Signature</div>
          <div style="font-size: 13px; font-weight: 700; margin-top: 4px;">${esc(record.vetName || 'Authorized Clinician')}</div>
        </div>
      </div>

      <div class="legal-footer">
        <span>BAI Reg No: ${esc(clinicBAI)}</span>
        <span>TIN: ${esc(clinicTIN)}</span>
        <span>Generated: ${esc(new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }))}</span>
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
