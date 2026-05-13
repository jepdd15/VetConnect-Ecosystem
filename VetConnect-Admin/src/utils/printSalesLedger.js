import { PRINT_STYLES, esc, openPrintWindow } from './printUtils';

/**
 * Generates a self-contained printable HTML sales ledger for the current
 * filtered view. Includes clinic header, transaction list, and payment summary.
 *
 * @param {Array}  sales          Already-filtered sales records from Sales.jsx
 * @param {object} clinicSettings Firestore clinic_settings/general document data
 * @param {string} [filterSummary] Human-readable description of active filters
 * @returns {string} Full HTML document string
 */
export function generateSalesLedgerHTML(sales, clinicSettings = {}, filterSummary = '') {
  const clinicName = esc(clinicSettings?.clinicName || 'VetConnect Clinic');
  const clinicAddr = esc(clinicSettings?.clinicAddress || '');
  const generated = new Date().toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const rows = sales.map((s) => {
    const dateStr = s.jsDate ? s.jsDate.toLocaleDateString() : 'N/A';
    const timeStr = s.jsDate ? s.jsDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const receipt = s.receiptNumber || s.id.slice(0, 8).toUpperCase();
    const itemsSummary = (s.items || []).map(i => `${i.qty}x ${i.name}`).join(', ');
    
    // T4.150: Payment method display
    const method = s.paymentTenders && s.paymentTenders.length > 1
      ? `Split`
      : s.paymentMethod || 'Cash';

    const isRefunded = s.status === 'refunded';

    return `<tr>
      <td>
        <span style="font-weight:700;">${esc(dateStr)}</span><br>
        <small style="color:#666;">${esc(timeStr)}</small>
      </td>
      <td><code style="background:#F5F0EB;padding:2px 4px;">${esc(receipt)}</code></td>
      <td>
        <span style="font-weight:700;">${esc(s.petName || 'N/A')}</span><br>
        <small style="color:#666;">${esc(s.ownerName || 'Walk-In')}</small>
      </td>
      <td><div style="font-size:11px;line-height:1.2;max-width:200px;">${esc(itemsSummary)}</div></td>
      <td style="text-align:center;"><small>${esc(method)}</small></td>
      <td style="text-align:right;font-weight:700;${isRefunded ? 'text-decoration:line-through;color:#999;' : ''}">
        &#8369;${parseFloat(s.total || 0).toFixed(2)}
      </td>
      <td style="text-align:center;">
        <span style="font-size:10px;font-weight:900;padding:2px 4px;border:1px solid ${isRefunded ? '#D32F2F' : '#2E7D32'};color:${isRefunded ? '#D32F2F' : '#2E7D32'};">
          ${isRefunded ? 'REFUND' : 'PAID'}
        </span>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Sales Transaction Ledger</title>
  <style>
    ${PRINT_STYLES}
    .filter-note {
      font-size: 11px;
      color: #A1887F;
      margin-bottom: 12px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="clinic-header">
    <p class="clinic-name">${clinicName}</p>
    ${clinicAddr ? `<p class="clinic-address">${clinicAddr}</p>` : ''}
    ${clinicSettings?.clinicPhone ? `<p class="clinic-address">TEL: ${esc(clinicSettings.clinicPhone)}</p>` : ''}
    ${clinicSettings?.clinicTIN ? `<p class="clinic-address">TIN: ${esc(clinicSettings.clinicTIN)}</p>` : ''}
  </div>
  <div class="doc-title">TRANSACTION LEDGER</div>
  <p style="text-align:center;font-size:11px;color:#A1887F;margin-bottom:4px;">Generated: ${generated}</p>
  ${filterSummary ? `<p class="filter-note">Filters: ${esc(filterSummary)}</p>` : ''}

  <table>
    <thead>
      <tr>
        <th>Date & Time</th>
        <th>Receipt #</th>
        <th>Patient & Owner</th>
        <th>Items Purchased</th>
        <th style="text-align:center;">Method</th>
        <th style="text-align:right;">Total Paid</th>
        <th style="text-align:center;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">VetConnect Administrative Suite &bull; ${clinicName}</div>
</body>
</html>`;
}

/**
 * Opens a print window containing the sales transaction ledger.
 */
export function printSalesLedger(sales, clinicSettings, filterSummary, onBlocked) {
  const html = generateSalesLedgerHTML(sales, clinicSettings, filterSummary);
  openPrintWindow(html, onBlocked);
}
