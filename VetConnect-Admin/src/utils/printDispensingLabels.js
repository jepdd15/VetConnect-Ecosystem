/**
 * printDispensingLabels.js
 *
 * Generates and opens a print window containing one 4×2 inch adhesive label
 * per dispensed item. Each label includes patient identity, medication details,
 * dispensing date, dosage/Sig, and lot/expiry when available.
 *
 * XSS protection: all dynamic values are passed through esc() before being
 * interpolated into HTML. Never skip esc() for any Firestore-sourced field.
 */

import { formatDosage } from '../constants/dosageUnits';

/** Escapes HTML special characters to prevent XSS injection in print templates. */
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Formats a date value (Firestore Timestamp, seconds-object, or string/Date)
 * into a short locale date string (e.g. "Apr 22, 2026").
 * Returns '—' when the value is absent or unparsable.
 *
 * @param {*} value
 * @returns {string}
 */
function formatLabelDate(value) {
  if (!value) return '—';
  try {
    const d = value.toDate
      ? value.toDate()
      : value.seconds
        ? new Date(value.seconds * 1000)
        : new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

/**
 * Builds the full HTML document for a sheet of dispensing labels.
 *
 * @param {Array<{name: string, dosage?: string, instructions?: string, qty: number, batchNumber?: string, expiryDate?: string}>} items
 * @param {{ petName: string, ownerName?: string }} patient  - Appointment/patient snapshot
 * @param {{ clinicName?: string, clinicAddress?: string }} clinicSettings
 * @returns {string} Full HTML document string
 */
function buildLabelsHTML(items, patient, clinicSettings) {
  const today = new Date().toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const clinicName = esc(clinicSettings?.clinicName || 'VetConnect Clinic');
  const clinicAddress = esc(clinicSettings?.clinicAddress || '');
  const petName = esc(patient?.petName || patient?.name || 'Unknown');
  const ownerName = esc(patient?.ownerName || patient?.owner || '');

  const labelCards = items
    .filter(item => item.type !== 'service' && !item.isBase) // Physical products only
    .map(item => {
      const medName = esc(item.name);
      const dosage = esc(formatDosage(item.dosageValue, item.dosageUnit, item.dosageUnitCustom) || item.dosage || item.sig?.dose || '');
      const sig = esc(item.instructions || '');
      const qty = esc(String(item.qty ?? 1));
      const batch = esc(item.batchNumber || item.lotNumber || '');
      const expiry = item.expiryDate ? esc(formatLabelDate(item.expiryDate)) : '—';

      return `
        <div class="label">
          <div class="label-header">
            <span class="clinic-name">${clinicName}</span>
            ${clinicAddress ? `<span class="clinic-addr">${clinicAddress}</span>` : ''}
          </div>

          <div class="patient-row">
            <span class="field-label">Patient:</span>
            <span class="field-value">${petName}</span>
            ${ownerName ? `<span class="field-label">Owner:</span><span class="field-value">${ownerName}</span>` : ''}
          </div>

          <div class="med-name">${medName}</div>

          ${dosage ? `<div class="med-detail"><span class="field-label">Dosage:</span> ${dosage}</div>` : ''}
          ${sig ? `<div class="med-detail sig"><span class="field-label">Sig:</span> ${sig}</div>` : ''}

          <div class="med-row">
            <div class="med-detail"><span class="field-label">Qty:</span> ${qty}</div>
            <div class="med-detail"><span class="field-label">Dispensed:</span> ${esc(today)}</div>
          </div>

          ${(batch || expiry !== '—') ? `
            <div class="batch-row">
              ${batch ? `<div class="med-detail"><span class="field-label">Lot:</span> ${batch}</div>` : ''}
              ${expiry !== '—' ? `<div class="med-detail"><span class="field-label">Exp:</span> ${expiry}</div>` : ''}
            </div>
          ` : ''}

          <div class="label-footer">${clinicName}</div>
        </div>
      `;
    })
    .join('');

  if (!labelCards.trim()) {
    return `<!DOCTYPE html><html><body><p>No dispensable product items found.</p></body></html>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Dispensing Labels — ${petName}</title>
  <style>
    /* Reset */
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: white;
    }

    /* Label sheet layout — standard 4×2 inch (96×48mm) Avery style */
    .label-sheet {
      display: flex;
      flex-wrap: wrap;
      gap: 4mm;
      padding: 8mm;
    }

    .label {
      width: 96mm;
      height: 48mm;
      border: 1.5px solid #5D4037;
      padding: 4mm 5mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      page-break-inside: avoid;
      background: white;
    }

    .label-header {
      display: flex;
      flex-direction: column;
      border-bottom: 1px solid #D7CCC8;
      padding-bottom: 1.5mm;
      margin-bottom: 1.5mm;
    }

    .clinic-name {
      font-size: 7pt;
      font-weight: 900;
      color: #5D4037;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .clinic-addr {
      font-size: 5.5pt;
      color: #8D6E63;
    }

    .patient-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0 4mm;
      font-size: 6.5pt;
      margin-bottom: 1mm;
    }

    .med-name {
      font-size: 10pt;
      font-weight: 900;
      color: #1A1A1A;
      margin-bottom: 1mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .med-detail {
      font-size: 6.5pt;
      color: #333;
      line-height: 1.3;
    }

    .sig {
      font-style: italic;
    }

    .med-row,
    .batch-row {
      display: flex;
      gap: 6mm;
    }

    .field-label {
      font-weight: 700;
      color: #5D4037;
    }

    .field-value {
      color: #1A1A1A;
    }

    .label-footer {
      font-size: 5pt;
      color: #BCAAA4;
      text-align: right;
      border-top: 0.5px solid #E0D6CC;
      padding-top: 1mm;
      margin-top: auto;
    }

    @media print {
      body { background: white; }
      .label-sheet { padding: 0; gap: 3mm; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="label-sheet">
    ${labelCards}
  </div>
</body>
</html>`;
}

/**
 * Generates and opens a print window containing one dispensing label per item.
 *
 * @param {Array<{name: string, dosage?: string, instructions?: string, qty: number, batchNumber?: string, expiryDate?: string, type?: string, isBase?: boolean}>} items
 * @param {{ petName: string, ownerName?: string }} patient
 * @param {{ clinicName?: string, clinicAddress?: string }} clinicSettings
 * @param {function} [onBlocked] - Called when the browser blocks the popup window
 */
export function printDispensingLabels(items, patient, clinicSettings, onBlocked) {
  const html = buildLabelsHTML(items, patient, clinicSettings);
  const win = window.open('', '_blank', 'width=800,height=600');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 250);
  } else if (onBlocked) {
    onBlocked();
  }
}
