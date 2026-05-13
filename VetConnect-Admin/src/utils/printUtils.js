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
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
  body {
    font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #3E2723;
    max-width: 850px;
    margin: 0 auto;
    padding: 30px;
    line-height: 1.5;
    background: #FFF;
  }
  .headboard {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr;
    gap: 24px;
    border-bottom: 3px solid #3E2723;
    padding-bottom: 24px;
    margin-bottom: 32px;
    align-items: start;
  }
  .headboard-column {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .headboard-label {
    font-size: 9px;
    font-weight: 900;
    color: #8D6E63;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    margin-bottom: -2px;
  }
  .headboard-value {
    font-size: 12px;
    font-weight: 700;
    color: #3E2723;
    word-break: break-word;
  }
  .clinic-branding {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .clinic-name {
    font-size: 20px;
    font-weight: 900;
    color: #3E2723;
    text-transform: uppercase;
    letter-spacing: 1px;
    line-height: 1.1;
  }
  .clinic-meta {
    font-size: 11px;
    color: #8D6E63;
    font-weight: 600;
  }
  .doc-type-badge {
    background: #3E2723;
    color: white;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 2px;
    width: fit-content;
    margin-top: 12px;
  }
  h2 {
    color: #3E2723;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    border-bottom: 2px solid #E0D6CC;
    padding-bottom: 6px;
    margin-top: 28px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .soap-block {
    margin-bottom: 32px;
    border-left: 4px solid #3E2723;
    padding: 0 0 0 24px;
    background: transparent;
  }
  .soap-header {
    font-size: 11px;
    font-weight: 900;
    color: #3E2723;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 10px;
    display: block;
  }
  .soap-content {
    font-size: 13.5px;
    color: #000000;
    white-space: pre-wrap;
    line-height: 1.6;
    font-weight: 500;
  }
  .soap-content.empty {
    color: #8D6E63;
    font-style: italic;
    opacity: 0.7;
  }
  .vitals-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin: 16px 0 24px;
  }
  .vital-card {
    flex: 1;
    min-width: 90px;
    border: 2px solid #3E2723;
    padding: 10px 8px;
    text-align: center;
    background: #FAF8F5;
  }
  .vital-card.critical {
    border-color: #D32F2F;
    background: #FFEBEE;
  }
  .vital-card.warning {
    border-color: #EF6C00;
    background: #FFF3E0;
  }
  .vital-label {
    font-size: 9px;
    font-weight: 900;
    color: #8D6E63;
    text-transform: uppercase;
    margin-bottom: 4px;
    letter-spacing: 0.5px;
  }
  .vital-value {
    font-size: 15px;
    font-weight: 900;
    color: #3E2723;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
    border: 2px solid #3E2723;
  }
  th {
    background: #3E2723;
    color: white;
    padding: 8px 12px;
    text-align: left;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  td {
    padding: 8px 12px;
    font-size: 12px;
    border-bottom: 1px solid #E0D6CC;
    color: #3E2723;
  }
  tr:nth-child(even) {
    background-color: #FAF8F5;
  }
  .footer {
    text-align: center;
    margin-top: 40px;
    font-size: 10px;
    color: #8D6E63;
    font-weight: 600;
    border-top: 2px solid #E0D6CC;
    padding-top: 16px;
  }
  @media print {
    body { margin: 0; padding: 10mm; }
    .soap-block { break-inside: avoid; }
    table { break-inside: avoid; }
  }
`;

export const UNIFIED_PRINT_STYLES = `
  body { 
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
    padding: 20px 40px; 
    color: #1A1A1A; 
    line-height: 1.5; 
    background: #FFF;
  }
  .header-container { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
  .clinic-info { flex: 1; }
  .clinic-name { font-size: 22px; font-weight: 900; color: #1A1A1A; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: -0.5px; }
  .clinic-meta { font-size: 11px; color: #666; margin: 0; }
  
  .memo-grid { 
    display: grid; 
    grid-template-columns: 110px 1fr 110px 1fr; 
    width: 100%; 
    border-top: 2px solid #1A1A1A; 
    border-bottom: 1px solid #E5E5E5; 
    margin-bottom: 24px; 
    padding: 12px 0; 
  }
  .memo-row { display: contents; }
  .memo-label { font-size: 10px; font-weight: 900; color: #888; padding: 4px 0; text-transform: uppercase; letter-spacing: 1px; }
  .memo-value { font-size: 13px; font-weight: 700; color: #1A1A1A; padding: 4px 0; }
  
  .allergy-alert-bar { 
    background: #FFEBEE; 
    border: 2px solid #D32F2F; 
    color: #D32F2F; 
    padding: 12px 16px; 
    margin-bottom: 24px; 
    font-size: 12px; 
    font-weight: 900; 
    text-transform: uppercase;
    letter-spacing: 1px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

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

  .data-table { width: 100%; border-collapse: collapse; margin: 12px 0; border: 1px solid #EEE; }
  .data-table th { background: #F9F9F9; color: #888; font-size: 10px; font-weight: 900; text-transform: uppercase; padding: 8px 12px; text-align: left; border-bottom: 2px solid #1A1A1A; }
  .data-table td { padding: 10px 12px; font-size: 12px; border-bottom: 1px solid #F0F0F0; color: #1A1A1A; }
  .data-table tr:last-child td { border-bottom: none; }

  .signature-area { margin-top: 60px; display: flex; flex-direction: column; align-items: flex-end; }
  .sig-label { font-size: 10px; font-weight: 700; color: #888; font-style: italic; margin-bottom: 4px; }
  .sig-name { font-size: 14px; font-weight: 900; color: #1A1A1A; margin-bottom: 4px; }
  .sig-line { width: 200px; height: 1px; background: #1A1A1A; margin-bottom: 4px; }
  .sig-title { font-size: 9px; font-weight: 900; color: #888; letter-spacing: 1px; text-transform: uppercase; }
  
  .reg-footer { margin-top: 40px; border-top: 1px solid #E5E5E5; padding-top: 12px; display: flex; justify-content: space-between; font-size: 9px; color: #AAA; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  
  @media print {
    body { margin: 0; padding: 10mm; }
    .section-anchor, .vitals-table, .data-table { break-inside: avoid; }
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

// NOTE: Do NOT use calculatePetAge for ClinicalWorkspace or queueColumns — those have intentionally different formats (Xy Xm, isAgeExact).
export function calculatePetAge(dob) {
  if (!dob) return '—';
  try {
    const birthDate = dob.toDate 
      ? dob.toDate() 
      : dob.seconds 
        ? new Date(dob.seconds * 1000) 
        : new Date(dob);
    if (isNaN(birthDate.getTime())) return '—';
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    if (age < 0) return '—';
    if (age === 0) {
      const mo = Math.floor((today - birthDate) / (1000 * 60 * 60 * 24 * 30.44));
      return mo > 0 ? `${mo}mo` : 'Newborn';
    }
    return `${age}y`;
  } catch {
    return '—';
  }
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
