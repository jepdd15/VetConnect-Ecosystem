const formatCategory = (str) => {
  if (!str || typeof str !== 'string') return str?.name || 'Uncategorized';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Escapes a single CSV cell value.
 * Wraps in double-quotes when the value contains a comma, double-quote, or newline.
 *
 * @param {*} val
 * @returns {string}
 */
function escCSV(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates a filter-aware CSV from the given inventory items and triggers a
 * browser download. No server round-trip — operates entirely on the in-memory
 * array already filtered by the Inventory page.
 *
 * A UTF-8 BOM is prepended so Excel opens the file with correct encoding for
 * special characters (₱, accented names).
 *
 * @param {Array}  items     Already-filtered inventory items from Inventory.jsx
 * @param {string} [filename] Downloaded filename (default: 'inventory_export.csv')
 */
export function exportInventoryCSV(items, filename = 'inventory_export.csv') {
  const headers = [
    'Product Name',
    'SKU',
    'Category',
    'Stock',
    'Min Stock',
    'Reserved',
    'Cost Price',
    'Retail Price',
    'Margin %',
    'Unit',
    'Supplier',
    'Location',
    'Expiry Date',
    'Status',
  ];

  const rows = items.map((item) => {
    const stock = Number(item.stock) || 0;
    const min = Number(item.minStock) || 10;
    const cost = Number(item.costPrice) || 0;
    const retail = Number(item.price) || 0;
    const margin = cost > 0 && retail > 0
      ? (((retail - cost) / retail) * 100).toFixed(1)
      : '';

    let status = 'Healthy';
    if (stock <= 0) status = 'Out of Stock';
    else if (stock <= min) status = 'Low Stock';

    return [
      item.itemName,
      item.sku || '',
      formatCategory(item.category),
      stock,
      min,
      item.reserved || 0,
      cost.toFixed(2),
      retail.toFixed(2),
      margin,
      item.unit || '',
      item.supplier || '',
      item.location || '',
      item.expiryDate || '',
      status,
    ].map(escCSV).join(',');
  });

  const csvBody = [headers.join(','), ...rows].join('\n');

  // BOM prefix ensures Excel opens the file as UTF-8 (preserves ₱, accented characters)
  const blob = new Blob(['﻿' + csvBody], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
