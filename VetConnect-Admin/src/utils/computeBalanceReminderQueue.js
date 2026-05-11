/**
 * computeBalanceReminderQueue.js — T4.204
 *
 * Computes outstanding balance state and writes to the balance_reminder_queue
 * Firestore collection. Two public entry points:
 *
 * 1. computeFullBalanceReminderQueue()
 *    Reads ALL sales with balanceRemaining > 0, groups by ownerId, writes one
 *    queue doc per owner. Called from the Dashboard "Recompute Balance Queue"
 *    button. Returns { updated, deleted, errors } counts.
 *
 * 2. computeSingleOwnerBalanceReminder(ownerId, ownerData)
 *    Re-reads only this owner's sales and writes/deletes their queue doc.
 *    Called fire-and-forget from POSModal after checkout and from
 *    PatientDashboard after handleMarkSettled.
 *
 * Queue doc schema (balance_reminder_queue/{ownerId}):
 * {
 *   ownerId: string,
 *   ownerName: string,
 *   ownerEmail: string,
 *   ownerPhone: string,
 *   pushToken: string | null,
 *   totalBalance: number,
 *   saleCount: number,
 *   lastSaleDate: Timestamp | null,
 *   updatedAt: Timestamp,
 *   lastReminderSentAt: Timestamp | null,   // preserved via merge:true
 *   balanceReminderSnoozedUntil: Timestamp | null, // preserved via merge:true
 * }
 *
 * setDoc with merge:true is used on every write so snooze and cooldown fields
 * are never overwritten by a recompute. deleteDoc is called when the owner's
 * balance reaches zero — they drop out of the queue entirely.
 */
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

// ── Internal: Write or delete one owner's queue doc ──────────────────────────

/**
 * Upserts or removes the balance_reminder_queue doc for a single owner.
 *
 * If totalBalance > 0: writes with merge:true (preserves snooze + cooldown).
 * If totalBalance === 0: deletes the doc so the owner is no longer iterated
 *   by the Worker Cron.
 *
 * @param {string} ownerId
 * @param {string} ownerName
 * @param {string} ownerEmail
 * @param {string} ownerPhone
 * @param {string|null} pushToken
 * @param {number} totalBalance - Sum of all unpaid balanceRemaining values
 * @param {number} saleCount - Count of sales with outstanding balance
 * @param {import('firebase/firestore').Timestamp|null} lastSaleDate
 * @returns {Promise<'updated'|'deleted'>}
 */
async function writeOrDeleteQueueDoc(
  ownerId,
  ownerName,
  ownerEmail,
  ownerPhone,
  pushToken,
  totalBalance,
  saleCount,
  lastSaleDate,
) {
  const queueRef = doc(db, 'balance_reminder_queue', ownerId);

  if (totalBalance <= 0) {
    try {
      await deleteDoc(queueRef);
    } catch {
      // Silent — doc may not exist; either way the owner is off the queue
    }
    return 'deleted';
  }

  await setDoc(
    queueRef,
    {
      ownerId,
      ownerName:   ownerName  || '',
      ownerEmail:  ownerEmail || '',
      ownerPhone:  ownerPhone || '',
      pushToken:   pushToken  || null,
      totalBalance,
      saleCount,
      lastSaleDate: lastSaleDate || null,
      updatedAt:   serverTimestamp(),
    },
    { merge: true },
    // merge:true intentionally preserves lastReminderSentAt and
    // balanceReminderSnoozedUntil — these are only written by the
    // Worker Cron and the PatientDashboard snooze handler respectively.
  );

  return 'updated';
}

// ── Public: Single-owner recompute (POS/settle piggyback) ────────────────────

/**
 * Re-reads all sales for one owner, sums unpaid balances, and writes/deletes
 * their balance_reminder_queue doc.
 *
 * Called fire-and-forget (.catch(() => {})) from:
 *   - POSModal.handleCheckout — after the Firestore transaction commits
 *   - POSModal.handleRetailCheckout — when clientInfo has an id
 *   - PatientDashboard.handleMarkSettled — after the sales doc update
 *
 * @param {string} ownerId - Firestore users/{ownerId} doc ID
 * @param {{ ownerName?: string, ownerEmail?: string, ownerPhone?: string, pushToken?: string }} ownerData
 *   Partial owner fields from the surface that triggered the recompute.
 *   If a field is unavailable at the call site, pass empty string — the Worker
 *   reads these values directly from the queue doc, so accuracy matters here.
 * @returns {Promise<void>}
 */
export async function computeSingleOwnerBalanceReminder(ownerId, ownerData = {}) {
  if (!ownerId || ownerId === 'WALK_IN_USER' || String(ownerId).includes('GUEST_')) return;

  const salesSnap = await getDocs(
    query(
      collection(db, 'sales'),
      where('ownerId', '==', ownerId),
    ),
  );

  let totalBalance = 0;
  let saleCount    = 0;
  let lastSaleDate = null;

  for (const d of salesSnap.docs) {
    const data   = d.data();
    const status = data.status || '';

    // Exclude refunded/voided sales — consistent with the old Worker logic
    if (status === 'refunded' || status === 'voided') continue;

    const parsedBalance = parseFloat(data.balanceRemaining ?? 0);
    const balance = isNaN(parsedBalance) ? 0 : parsedBalance;
    if (balance <= 0) continue;

    totalBalance += balance;
    saleCount    += 1;

    const saleTs = data.date || null;
    if (saleTs) {
      if (!lastSaleDate) {
        lastSaleDate = saleTs;
      } else {
        // Keep the most recent date — compare epoch ms
        const existing = lastSaleDate.toDate
          ? lastSaleDate.toDate().getTime()
          : (lastSaleDate.seconds ? lastSaleDate.seconds * 1000 : 0);
        const candidate = saleTs.toDate
          ? saleTs.toDate().getTime()
          : (saleTs.seconds ? saleTs.seconds * 1000 : 0);
        if (candidate > existing) lastSaleDate = saleTs;
      }
    }
  }

  await writeOrDeleteQueueDoc(
    ownerId,
    ownerData.ownerName  || '',
    ownerData.ownerEmail || '',
    ownerData.ownerPhone || '',
    ownerData.pushToken  || null,
    totalBalance,
    saleCount,
    lastSaleDate,
  );
}

// ── Public: Full recompute (Dashboard button) ────────────────────────────────

/**
 * Reads ALL sales with any balanceRemaining > 0, groups by ownerId, and
 * writes/deletes one balance_reminder_queue doc per owner.
 *
 * Called from the Dashboard "Recompute Balance Queue" button.
 * Runs fire-and-forget — returns a summary for display in Snackbar.
 *
 * Note: this function cannot resolve pushToken or email/phone for owners whose
 * data is not stored on the sale doc — those fields will be empty strings until
 * computeSingleOwnerBalanceReminder overwrites them after the next POS/settle
 * event, or the Worker reads them from the users collection as a fallback.
 * For most use cases the Cron already has those values from earlier writes.
 *
 * @returns {Promise<{ updated: number, deleted: number, errors: number }>}
 */
export async function computeFullBalanceReminderQueue() {
  // Fetch all sales in one pass — Firestore does not support > 0 numeric filter
  // via simple query, so we over-fetch and filter client-side.
  const salesSnap = await getDocs(collection(db, 'sales'));

  // Group unpaid sales by ownerId
  // Map: ownerId → { totalBalance, saleCount, lastSaleDate, ownerName, ownerEmail, ownerPhone, pushToken }
  const ownerMap = new Map();

  for (const d of salesSnap.docs) {
    const data     = d.data();
    const ownerId  = data.ownerId || '';
    const status   = data.status  || '';

    if (!ownerId || ownerId === 'WALK_IN_USER' || String(ownerId).includes('GUEST_')) continue;
    if (status === 'refunded' || status === 'voided') continue;

    const parsedBalance2 = parseFloat(data.balanceRemaining ?? 0);
    const balance = isNaN(parsedBalance2) ? 0 : parsedBalance2;
    if (balance <= 0) continue;

    const existing = ownerMap.get(ownerId) || {
      totalBalance: 0,
      saleCount:    0,
      lastSaleDate: null,
      ownerName:    data.ownerName || '',
      ownerEmail:   data.ownerEmail || '',
      ownerPhone:   data.ownerPhone || '',
      pushToken:    data.pushToken  || null,
    };

    existing.totalBalance += balance;
    existing.saleCount    += 1;

    const saleTs = data.date || null;
    if (saleTs) {
      if (!existing.lastSaleDate) {
        existing.lastSaleDate = saleTs;
      } else {
        const existingMs  = existing.lastSaleDate.toDate
          ? existing.lastSaleDate.toDate().getTime()
          : (existing.lastSaleDate.seconds ? existing.lastSaleDate.seconds * 1000 : 0);
        const candidateMs = saleTs.toDate
          ? saleTs.toDate().getTime()
          : (saleTs.seconds ? saleTs.seconds * 1000 : 0);
        if (candidateMs > existingMs) existing.lastSaleDate = saleTs;
      }
    }

    ownerMap.set(ownerId, existing);
  }

  let updated = 0;
  let deleted = 0;
  let errors  = 0;

  // Process in batches of 10 to avoid overwhelming Firestore with concurrent writes
  const BATCH_SIZE = 10;
  const ownerEntries = [...ownerMap.entries()];

  for (let i = 0; i < ownerEntries.length; i += BATCH_SIZE) {
    const batch = ownerEntries.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async ([ownerId, data]) => {
        try {
          const outcome = await writeOrDeleteQueueDoc(
            ownerId,
            data.ownerName,
            data.ownerEmail,
            data.ownerPhone,
            data.pushToken,
            data.totalBalance,
            data.saleCount,
            data.lastSaleDate,
          );
          if (outcome === 'updated') updated++;
          else                       deleted++;
        } catch (err) {
          console.error('[computeFullBalanceReminderQueue] Write error for', ownerId, err?.message);
          errors++;
        }
      }),
    );
  }

  return { updated, deleted, errors };
}
