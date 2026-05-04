/**
 * receiptUtils.js — Receipt printing, PDF download, and email utilities (T4.152).
 *
 * Strategy: iframe-based printing avoids pop-up blockers. Blob URL download
 * is the fallback when both iframe and window.open are blocked. No npm
 * dependencies — html2canvas/jsPDF not needed.
 */
import { getWorkerUrl, getCachedOwnerEmail, resolvePushToken } from './sendPushNotification';

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
