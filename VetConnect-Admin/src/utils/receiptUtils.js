/**
 * receiptUtils.js — Receipt printing, PDF download, and email utilities (T4.152).
 *
 * Strategy: iframe-based printing avoids pop-up blockers. Blob URL download
 * is the fallback when both iframe and window.open are blocked. No npm
 * dependencies — html2canvas/jsPDF not needed.
 */
import { getWorkerUrl, getCachedOwnerEmail, resolvePushToken } from './sendPushNotification';
import { PAYMENT_METHOD_LABELS } from '../constants/paymentMethods';

/**
 * Prints HTML content via a hidden iframe.
 * Falls back to window.open if iframe printing is blocked by the browser.
 *
 * @param {string} html - Full HTML document string to print.
 * @returns {boolean} true if printing was initiated, false if blocked at all paths.
 */
export function printViaIframe(html) {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // Allow the browser to render the content before triggering print.
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch {
        // iframe print blocked — try window.open as a fallback.
        const win = window.open('', '_blank', 'width=800,height=600');
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
          setTimeout(() => { win.print(); win.close(); }, 250);
        }
      }
      // Remove the hidden iframe after a safe delay.
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    }, 300);

    return true;
  } catch {
    return false;
  }
}

/**
 * Downloads HTML content as a .html file via Blob URL.
 * Zero pop-up dependencies — works even when pop-up blockers are active.
 *
 * @param {string} html - The HTML content to download.
 * @param {string} filename - Download filename, e.g. 'OR-20260504-0001.html'.
 */
export function downloadHtmlAsFile(html, filename = 'receipt.html') {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  // Revoke the object URL after the browser picks up the download.
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Emails receipt HTML to the pet owner via the Cloudflare Worker /email endpoint.
 *
 * Resolves the owner's email from the session-level cache populated by
 * resolvePushToken (which caches email on the same Firestore read — zero extra ops).
 *
 * @param {object} params
 * @param {string} params.html - The receipt HTML content.
 * @param {string} params.ownerId - The Firestore user ID of the pet owner.
 * @param {string} params.receiptNumber - For the email subject line.
 * @param {string} params.clinicName - Clinic name for the subject line.
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function emailReceiptToOwner({ html, ownerId, receiptNumber, clinicName }) {
  if (!ownerId || ownerId === 'WALK_IN_USER' || ownerId === 'UNKNOWN') {
    return { success: false, message: 'Walk-in client — no email on file.' };
  }

  // Trigger a cache-fill if the owner hasn't been resolved this session yet.
  // resolvePushToken caches email, phone, and name in a single Firestore read.
  await resolvePushToken(ownerId);
  const email = getCachedOwnerEmail(ownerId);

  if (!email) {
    return { success: false, message: 'No email address on file for this client.' };
  }

  const workerUrl = await getWorkerUrl();
  if (!workerUrl) {
    return { success: false, message: 'Email service not configured. Contact admin.' };
  }

  const baseEndpoint = workerUrl.replace(/\/+$/, '');
  const subject = `Receipt ${receiptNumber || ''} — ${clinicName || 'VetConnect'}`;

  try {
    const response = await fetch(`${baseEndpoint}/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: email, subject, html }),
    });

    if (!response.ok) {
      return { success: false, message: `Email send failed (HTTP ${response.status}).` };
    }

    return { success: true, message: `Receipt emailed to ${email}` };
  } catch (err) {
    console.error('[receiptUtils.emailReceiptToOwner]:', err);
    return { success: false, message: `Email failed: ${err.message}` };
  }
}

// ─── Receipt HTML helpers ────────────────────────────────────────────────────

/** Shared header block for all receipt variants. */
function _renderReceiptHeader(clinicSettings) {
  const name    = clinicSettings?.clinicName    || 'VetConnect Clinic';
  const address = clinicSettings?.clinicAddress || '';
  const phone   = clinicSettings?.clinicPhone   || '';
  return `
    <div style="text-align:center;border-bottom:2px solid #3E2723;padding-bottom:10px;margin-bottom:10px;">
      <div style="font-size:16px;font-weight:900;letter-spacing:1px;">${name}</div>
      ${address ? `<div style="font-size:11px;margin-top:2px;">${address}</div>` : ''}
      ${phone   ? `<div style="font-size:11px;">${phone}</div>` : ''}
    </div>`;
}

/** Shared footer block for all receipt variants. */
function _renderReceiptFooter(clinicSettings) {
  const name = clinicSettings?.clinicName || 'VetConnect Clinic';
  return `
    <div style="border-top:2px solid #3E2723;padding-top:8px;margin-top:10px;text-align:center;font-size:10px;color:#5D4037;">
      <div>Authorized Signatory: _______________________</div>
      <div style="margin-top:6px;font-style:italic;">Thank you for choosing ${name}!</div>
    </div>`;
}

/**
 * Internal helper — renders the line-items section of a sale as an HTML fragment.
 * Used by generateSaleSummaryReceipt. Not exported (POSModal has its own inline renderer).
 *
 * @param {object} sale - Firestore sale document.
 * @returns {string} HTML fragment string.
 */
function _renderSaleBody(sale) {
  const items  = sale.items || [];
  const total    = parseFloat(sale.total    || 0);
  const discount = parseFloat(sale.discount || 0);

  const itemRows = items.map(item => {
    const qty   = item.qty  || item.quantity || 1;
    const price = parseFloat(item.price || 0);
    const line  = qty * price;
    return `
      <tr>
        <td style="padding:3px 0;">${item.name || '—'}</td>
        <td style="text-align:center;">${qty}</td>
        <td style="text-align:right;">₱${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right;">₱${line.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
      </tr>`;
  }).join('');

  const discountRow = discount > 0
    ? `<tr><td colspan="3" style="text-align:right;font-weight:700;">Discount</td><td style="text-align:right;color:#D32F2F;">−₱${discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>`
    : '';

  return `
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px;">
      <thead>
        <tr style="border-bottom:1px solid #3E2723;">
          <th style="text-align:left;padding:3px 0;">Item</th>
          <th style="text-align:center;">Qty</th>
          <th style="text-align:right;">Unit</th>
          <th style="text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || '<tr><td colspan="4" style="text-align:center;font-style:italic;">No items</td></tr>'}
        ${discountRow}
        <tr style="border-top:1px solid #3E2723;font-weight:900;font-size:13px;">
          <td colspan="3" style="text-align:right;padding-top:4px;">TOTAL</td>
          <td style="text-align:right;padding-top:4px;">₱${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>
      </tbody>
    </table>`;
}

/** Formats a Firestore Timestamp or ISO string to a localized date-time string. */
function _formatTimestamp(ts) {
  if (!ts) return '—';
  const date = ts?.toDate ? ts.toDate() : (ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

// ─── generatePaymentReceipt ───────────────────────────────────────────────────

/**
 * Generates a single-payment receipt as a full HTML document string.
 *
 * ~80mm-friendly width (300px). Cream background, espresso text — matches
 * the clinic's neubrutalist design system. Safe to pass directly to printViaIframe.
 *
 * @param {object} payment         - Payment document from the `payments` collection.
 * @param {object} sale            - Firestore sale document the payment belongs to.
 * @param {object} owner           - Owner Firestore user document (may be null for walk-ins).
 * @param {object} clinicSettings  - From useClinicSettings().
 * @param {number} runningBalance  - Outstanding balance AFTER this payment (caller computes).
 * @returns {string} Full HTML document string.
 */
export function generatePaymentReceipt(payment, sale, owner, clinicSettings, runningBalance) {
  const methodLabel = PAYMENT_METHOD_LABELS[(payment.method || '').toLowerCase()] || payment.method || 'Cash';
  const receiptNum  = `PAY-${sale.receiptNumber || sale.id?.slice(-6) || '000000'}-${(payment.id || '').slice(-4).toUpperCase()}`;
  const amount      = parseFloat(payment.amount || 0);
  const balance     = typeof runningBalance === 'number' ? runningBalance : 0;

  const refRow = payment.referenceNumber
    ? `<tr><td style="color:#5D4037;">Reference #</td><td style="font-weight:700;">${payment.referenceNumber}</td></tr>`
    : '';

  const noteRow = payment.note
    ? `<tr><td style="color:#5D4037;">Note</td><td>${payment.note}</td></tr>`
    : '';

  const ownerName = owner?.fullName || owner?.firstName || 'Walk-in Client';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payment Receipt ${receiptNum}</title>
  <style>
    @media print { body { margin: 0; } }
    body {
      font-family: 'Courier New', monospace;
      background: #FFF8E1;
      color: #3E2723;
      margin: 0;
      padding: 16px;
      max-width: 300px;
      font-size: 12px;
    }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 3px 0; vertical-align: top; }
    td:last-child { text-align: right; }
    h2 { font-size: 14px; text-align: center; letter-spacing: 2px; margin: 8px 0; }
  </style>
</head>
<body>
  ${_renderReceiptHeader(clinicSettings)}
  <h2>PAYMENT RECEIPT</h2>
  <table>
    <tr><td style="color:#5D4037;">Receipt #</td><td style="font-weight:700;">${receiptNum}</td></tr>
    <tr><td style="color:#5D4037;">Date</td><td>${_formatTimestamp(payment.collectedAt)}</td></tr>
    <tr><td style="color:#5D4037;">Client</td><td>${ownerName}</td></tr>
    <tr><td style="color:#5D4037;">For Sale</td><td>${sale.receiptNumber || '—'}</td></tr>
  </table>

  <div style="border:2px solid #3E2723;margin:10px 0;padding:8px;text-align:center;">
    <div style="font-size:10px;letter-spacing:1px;color:#5D4037;">AMOUNT PAID</div>
    <div style="font-size:24px;font-weight:900;">₱${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
    <div style="font-size:11px;font-weight:700;">${methodLabel}</div>
  </div>

  <table>
    ${refRow}
    <tr><td style="color:#5D4037;">Collected By</td><td>${payment.collectedBy || '—'}</td></tr>
    ${noteRow}
    <tr style="border-top:1px solid #3E2723;margin-top:4px;">
      <td style="color:#5D4037;padding-top:6px;">Running Balance</td>
      <td style="font-weight:900;color:${balance > 0 ? '#D32F2F' : '#2E7D32'};padding-top:6px;">
        ₱${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </td>
    </tr>
  </table>
  ${_renderReceiptFooter(clinicSettings)}
</body>
</html>`;
}

// ─── generateSaleSummaryReceipt ───────────────────────────────────────────────

/**
 * Generates a sale summary receipt — the original sale line items followed by a
 * complete payment history table. Useful for clients who made multiple partial
 * payments and want a single consolidated document.
 *
 * @param {object}   sale           - Firestore sale document.
 * @param {Array}    payments       - Full payment history from getPaymentHistory().
 * @param {object}   owner          - Owner Firestore user document (may be null for walk-ins).
 * @param {object}   clinicSettings - From useClinicSettings().
 * @returns {string} Full HTML document string.
 */
export function generateSaleSummaryReceipt(sale, payments, owner, clinicSettings) {
  const sortedPayments = [...(payments || [])].sort((a, b) => {
    const aMs = a.collectedAt?.toDate?.()?.getTime() ?? (a.collectedAt?.seconds ? a.collectedAt.seconds * 1000 : 0);
    const bMs = b.collectedAt?.toDate?.()?.getTime() ?? (b.collectedAt?.seconds ? b.collectedAt.seconds * 1000 : 0);
    return aMs - bMs;
  });

  // Determine which payments have been reversed (their id is referenced by a reversal's reversalOf)
  const reversedIds = new Set(sortedPayments.filter(p => p.reversalOf).map(p => p.reversalOf));

  const totalPaid = sortedPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const balance   = Math.max(0, parseFloat(sale.total || 0) - totalPaid);

  const paymentRows = sortedPayments.map(p => {
    const isReversal = !!p.reversalOf;
    const isReversed = reversedIds.has(p.id);
    const amount     = parseFloat(p.amount || 0);
    const methodLabel = PAYMENT_METHOD_LABELS[(p.method || '').toLowerCase()] || p.method || '—';

    const amountDisplay = isReversed
      ? `<span style="text-decoration:line-through;">₱${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> (reversed)`
      : isReversal
        ? `<span style="color:#D32F2F;">−₱${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>`
        : `₱${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    return `
      <tr style="${isReversal ? 'color:#D32F2F;' : isReversed ? 'color:#9E9E9E;' : ''}">
        <td style="padding:3px 2px;">${_formatTimestamp(p.collectedAt)}</td>
        <td style="text-align:right;padding:3px 2px;">${amountDisplay}</td>
        <td style="padding:3px 2px;">${methodLabel}</td>
        <td style="padding:3px 2px;">${p.referenceNumber || '—'}</td>
        <td style="padding:3px 2px;">${p.collectedBy || '—'}</td>
        <td style="padding:3px 2px;">${p.note || '—'}</td>
      </tr>`;
  }).join('');

  const ownerName = owner?.fullName || owner?.firstName || 'Walk-in Client';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Sale Summary ${sale.receiptNumber || sale.id}</title>
  <style>
    @media print { body { margin: 0; } }
    body {
      font-family: 'Courier New', monospace;
      background: #FFF8E1;
      color: #3E2723;
      margin: 0;
      padding: 16px;
      max-width: 580px;
      font-size: 11px;
    }
    table { width: 100%; border-collapse: collapse; }
    td, th { padding: 3px 2px; vertical-align: top; }
    h2 { font-size: 14px; text-align: center; letter-spacing: 2px; margin: 8px 0; }
    h3 { font-size: 12px; letter-spacing: 1px; margin: 12px 0 4px; border-bottom: 1px solid #3E2723; padding-bottom: 2px; }
    .footer-totals { font-weight:900; margin-top:6px; border-top:2px solid #3E2723; padding-top:6px; text-align:right; }
  </style>
</head>
<body>
  ${_renderReceiptHeader(clinicSettings)}
  <h2>SALE SUMMARY</h2>

  <table style="margin-bottom:6px;">
    <tr><td style="color:#5D4037;">Receipt #</td><td style="font-weight:700;text-align:right;">${sale.receiptNumber || '—'}</td></tr>
    <tr><td style="color:#5D4037;">Client</td><td style="text-align:right;">${ownerName}</td></tr>
    <tr><td style="color:#5D4037;">Date</td><td style="text-align:right;">${_formatTimestamp(sale.date)}</td></tr>
  </table>

  <h3>ITEMS PURCHASED</h3>
  ${_renderSaleBody(sale)}

  <h3>PAYMENT HISTORY</h3>
  <table>
    <thead>
      <tr style="border-bottom:1px solid #3E2723;font-weight:700;">
        <th style="text-align:left;">Date</th>
        <th style="text-align:right;">Amount</th>
        <th style="text-align:left;">Method</th>
        <th style="text-align:left;">Ref #</th>
        <th style="text-align:left;">Collected By</th>
        <th style="text-align:left;">Note</th>
      </tr>
    </thead>
    <tbody>
      ${paymentRows || '<tr><td colspan="6" style="text-align:center;font-style:italic;">No payments recorded</td></tr>'}
    </tbody>
  </table>

  <div class="footer-totals">
    Total Paid: ₱${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
    &nbsp;·&nbsp;
    Balance: <span style="color:${balance > 0 ? '#D32F2F' : '#2E7D32'};">₱${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
  </div>

  ${_renderReceiptFooter(clinicSettings)}
</body>
</html>`;
}
