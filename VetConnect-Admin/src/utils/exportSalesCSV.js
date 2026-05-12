/**
 * Escapes a single CSV cell value.
 * Wraps in double-quotes when the value contains a comma, double-quote, or newline.
 */
function escCSV(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates a filter-aware CSV from the given sales records and triggers a browser download.
 * Operates on the already-filtered array from Sales.jsx.
 *
 * @param {Array}  sales     Already-filtered sales records from Sales.jsx
 * @param {string} [filename] Downloaded filename
 */
export function exportSalesCSV(sales, filename = 'sales_export.csv') {
  const headers = [
    'Date',
    'Time',
    'Receipt #',
    'Type',
    'Patient',
    'Owner',
    'Items',
    'Method',
    'Subtotal',
    'Discount',
    'Deposit',
    'Total Paid',
    'Status'
  ];

  const rows = sales.map((s) => {
    const dateStr = s.jsDate ? s.jsDate.toLocaleDateString() : 'N/A';
    const timeStr = s.jsDate ? s.jsDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
    const receipt = s.receiptNumber || s.id.slice(0, 8).toUpperCase();
    const itemsSummary = (s.items || []).map(i => `${i.qty}x ${i.name}`).join('; ');
    
    // T4.150: Handle payment tenders for method display
    const method = s.paymentTenders && s.paymentTenders.length > 1
      ? `Split (${s.paymentTenders.map(t => t.method).join('/')})`
      : s.paymentMethod || 'Cash';

    return [
      dateStr,
      timeStr,
      receipt,
      (s.saleType || 'clinical').toUpperCase(),
      s.petName || 'N/A',
      s.ownerName || 'Walk-In',
      itemsSummary,
      method,
      parseFloat(s.subtotal || 0).toFixed(2),
      parseFloat(s.discount || 0).toFixed(2),
      parseFloat(s.depositPaid || 0).toFixed(2),
      parseFloat(s.total || 0).toFixed(2),
      (s.status || 'paid').toUpperCase()
    ].map(escCSV).join(',');
  });

  const csvBody = [headers.join(','), ...rows].join('\n');

  // BOM prefix ensures Excel opens the file as UTF-8 (preserves ₱, accented characters)
  const blob = new Blob(['\ufeff' + csvBody], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
