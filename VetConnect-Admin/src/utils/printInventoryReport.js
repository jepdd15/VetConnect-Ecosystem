import { PRINT_STYLES, esc, openPrintWindow } from './printUtils';
const formatCategory = (str) => {
  if (!str || typeof str !== 'string') return str?.name || 'Uncategorized';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Generates a self-contained printable HTML inventory report for the current
 * filtered view. Includes clinic header, summary KPIs, and a full item table.
 *
 * @param {Array}  items          Already-filtered inventory items from Inventory.jsx
 * @param {object} clinicSettings Firestore clinic_settings/general document data
 * @param {string} [filterSummary] Human-readable description of active filters
 * @returns {string} Full HTML document string
 */
export function generateInventoryReportHTML(items, clinicSettings = {}, filterSummary = '') {
  const clinicName = esc(clinicSettings?.clinicName || '');
  const clinicAddr = esc(clinicSettings?.clinicAddress || '');
  const generated = new Date().toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Compute summary KPIs from the filtered set
  let totalValue = 0;
  let lowStock = 0;
  let outOfStock = 0;

  items.forEach((item) => {
    const stock = Number(item.stock) || 0;
    const cost = Number(item.costPrice) || 0;
    const min = Number(item.minStock) || 10;
    totalValue += stock * cost;
    if (stock <= 0) outOfStock++;
    else if (stock <= min) lowStock++;
  });

  const rows = items.map((item) => {
    const stock = Number(item.stock) || 0;
    const min = Number(item.minStock) || 10;
    const cost = Number(item.costPrice) || 0;
    const retail = Number(item.price) || 0;
    const margin = cost > 0 && retail > 0
      ? (((retail - cost) / retail) * 100).toFixed(0) + '%'
      : '—';

    let status = 'Healthy';
    let statusStyle = '';
    if (stock <= 0) {
      status = 'OUT';
      statusStyle = 'color:#D32F2F;font-weight:900;';
    } else if (stock <= min) {
      status = 'LOW';
      statusStyle = 'color:#E65100;font-weight:900;';
    }

    return `<tr>
      <td>
        ${esc(item.itemName || '—')}
        ${item.sku ? `<br><small style="color:#999;font-size:10px">${esc(item.sku)}</small>` : ''}
      </td>
      <td>${esc(item.dosage || '')}</td>
      <td>${esc(formatCategory(item.category))}</td>
      <td style="text-align:center;${statusStyle}">${stock}</td>
      <td style="text-align:center">${min}</td>
      <td style="text-align:right">&#8369;${cost.toFixed(2)}</td>
      <td style="text-align:right">&#8369;${retail.toFixed(2)}</td>
      <td style="text-align:center">${margin}</td>
      <td style="text-align:center;${statusStyle}">${status}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Inventory Report</title>
  <style>
    ${PRINT_STYLES}
    .summary-bar {
      display: flex;
      gap: 30px;
      margin: 10px 0 15px;
      font-size: 13px;
      flex-wrap: wrap;
    }
    .summary-bar .kpi-label {
      font-weight: 700;
      color: #5D4037;
    }
    .summary-bar .kpi-val {
      font-size: 16px;
      font-weight: 900;
      color: #3E2723;
      display: block;
    }
    .filter-note {
      font-size: 11px;
      color: #A1887F;
      margin-bottom: 8px;
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
  <div class="doc-title">INVENTORY REPORT</div>
  <p style="text-align:center;font-size:11px;color:#A1887F;">Generated: ${generated}</p>
 
  ${filterSummary ? `<p class="filter-note">Filters: ${esc(filterSummary)}</p>` : ''}
 
  <div class="summary-bar">
    <div>
      <span class="kpi-label">Total Items</span>
      <span class="kpi-val">${items.length}</span>
    </div>
    <div>
      <span class="kpi-label">Total Value</span>
      <span class="kpi-val">&#8369;${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
    <div>
      <span class="kpi-label">Low Stock</span>
      <span class="kpi-val" style="color:#E65100">${lowStock}</span>
    </div>
    <div>
      <span class="kpi-label">Out of Stock</span>
      <span class="kpi-val" style="color:#D32F2F">${outOfStock}</span>
    </div>
  </div>
 
  <table>
    <thead>
      <tr>
        <th style="text-align:left">Product</th>
        <th style="text-align:left">Dosage</th>
        <th style="text-align:left">Category</th>
        <th style="text-align:center">Stock</th>
        <th style="text-align:center">Min</th>
        <th style="text-align:right">Cost</th>
        <th style="text-align:right">Retail</th>
        <th style="text-align:center">Margin</th>
        <th style="text-align:center">Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">VetConnect Inventory System &bull; ${clinicName}</div>
</body>
</html>`;
}

/**
 * Opens a print window containing the inventory report.
 * Calls `onBlocked` if the browser's popup blocker prevents the window.
 *
 * @param {Array}    items          Already-filtered inventory items
 * @param {object}   clinicSettings Firestore clinic_settings/general document data
 * @param {string}   filterSummary  Human-readable active filter description
 * @param {function} [onBlocked]    Callback invoked when the popup is blocked
 */
export function printInventoryReport(items, clinicSettings, filterSummary, onBlocked) {
  const html = generateInventoryReportHTML(items, clinicSettings, filterSummary);
  openPrintWindow(html, onBlocked);
}
