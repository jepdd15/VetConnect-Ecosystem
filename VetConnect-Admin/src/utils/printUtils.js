/**
 * Shared print utility for all VetConnect printable documents.
 *
 * All three printable generators (visit summary, vaccination record, referral
 * report) use the same window.open + document.write + setTimeout print pattern
 * that was previously duplicated in Sales.jsx (lines 162-170, 239-245).
 * This module is the single canonical implementation.
 */

// ── Shared CSS injected into every print template ─────────────────────────
// Follows the VetConnect Clinical Neubrutalism design language:
// Espresso (#5D4037) headers, warm neutral surfaces, collapsed-border tables.
export const PRINT_STYLES = `
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #333;
    max-width: 700px;
    margin: 0 auto;
    padding: 30px;
    line-height: 1.6;
  }
  .clinic-header {
    text-align: center;
    border-bottom: 2px solid #5D4037;
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  .clinic-name {
    font-size: 22px;
    font-weight: bold;
    color: #5D4037;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .clinic-address {
    font-size: 12px;
    color: #8D6E63;
    margin: 4px 0 0;
  }
  .doc-title {
    font-size: 16px;
    font-weight: 800;
    color: #5D4037;
    text-transform: uppercase;
    letter-spacing: 2px;
    text-align: center;
    margin: 15px 0;
  }
  h2 {
    color: #5D4037;
    font-size: 13px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid #D7CCC8;
    padding-bottom: 4px;
    margin-top: 20px;
    margin-bottom: 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
  }
  th {
    background: #F5F0EB;
    padding: 6px 10px;
    text-align: left;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #5D4037;
    border-bottom: 2px solid #5D4037;
  }
  td {
    padding: 6px 10px;
    font-size: 13px;
    border-bottom: 1px solid #E0D6CC;
  }
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 4px 20px;
    font-size: 13px;
    margin-bottom: 12px;
  }
  .info-grid .label {
    font-weight: 700;
    color: #5D4037;
  }
  .info-grid .value {
    color: #333;
  }
  .footer {
    text-align: center;
    margin-top: 30px;
    font-size: 11px;
    color: #A1887F;
    border-top: 1px solid #E0D6CC;
    padding-top: 10px;
  }
  @media print {
    body { margin: 0; padding: 15mm; }
    .no-print { display: none; }
  }
`;

/**
 * Converts a Firestore Timestamp, seconds-object, or date string to a
 * formatted Philippine locale date string (e.g. "April 22, 2026").
 *
 * Guards against all three storage formats found in the VetConnect Firestore:
 * - Firestore SDK Timestamp (has `.toDate()`)
 * - Plain object with `.seconds` (serialised Timestamp from older SDK)
 * - ISO string or any value parseable by `new Date()`
 *
 * @param {*} firestoreDate
 * @returns {string} Formatted date or '—' when value is absent/invalid
 */
export function formatPrintDate(firestoreDate) {
  if (!firestoreDate) return '—';
  try {
    const d = firestoreDate.toDate
      ? firestoreDate.toDate()
      : firestoreDate.seconds
        ? new Date(firestoreDate.seconds * 1000)
        : new Date(firestoreDate);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '—';
  }
}

/**
 * Opens a new browser window, writes the given full HTML document string,
 * and triggers the native print dialog after a short delay so the browser
 * has time to render the document.
 *
 * Calls `onBlocked()` if the browser's popup blocker prevents the window
 * from opening — the caller should surface a user-visible warning in that
 * case (e.g. a Snackbar toast).
 *
 * @param {string}    html       Full HTML document string (<!DOCTYPE html>…)
 * @param {function}  [onBlocked] Optional callback invoked when popup is blocked
 */
/**
 * Escapes HTML special characters to prevent XSS in print templates.
 * Apply to every dynamic Firestore value interpolated into template literals.
 */
export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function openPrintWindow(html, onBlocked) {
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
