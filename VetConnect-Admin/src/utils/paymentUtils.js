/**
 * paymentUtils.js — T4.237: Append-only payment audit trail helpers.
 *
 * Four exports used across POSModal (clinical + retail checkout),
 * PatientDashboard (handleRecordPayment + handleMarkSettled), and tests.
 *
 * Design decisions (all locked in MASTER_TASKLIST T4.237):
 *   D1 — root `payments/{paymentId}` collection schema
 *   D4 — no migration; three-era dual-read fallback in getPaymentHistory
 *
 * ZERO React/UI imports. Pure business logic + Firestore SDK only.
 */

import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { isRefNumberRequired, PAYMENT_METHOD_LABELS } from '../constants/paymentMethods';

// ─── getPaymentHistory ────────────────────────────────────────────────────────

/**
 * Returns all payment documents for a given sale, handling three data eras:
 *
 *   Era 1 — Forward-compat only: `sale.payments` is an embedded array (never used
 *            in production today, but handled for future flexibility).
 *   Era 2 — Post-2026-05-17: One or more docs exist in the `payments` root collection.
 *   Era 3 — Pre-2026-05-17 legacy: No payment docs exist but `sale.amountPaid > 0`.
 *            Synthesizes a single legacy payment from the sale's `amountPaid` field.
 *
 * The returned array is sorted by `collectedAt` ascending (newest last).
 * Reversal docs appear inline — their negative amounts are visible to `recomputeBalance`.
 *
 * @param {object} sale - A Firestore sale document object (must have `.id`).
 * @returns {Promise<Array>} Array of payment objects.
 */
export async function getPaymentHistory(sale) {
  // Era 1: embedded array (forward-compat)
  if (Array.isArray(sale.payments) && sale.payments.length > 0) {
    return sale.payments;
  }

  // Era 2: query root payments collection
  const q = query(collection(db, 'payments'), where('saleId', '==', sale.id));
  const snap = await getDocs(q);

  if (!snap.empty) {
    const payments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort ascending by collectedAt (Timestamp → millis comparison)
    payments.sort((a, b) => {
      const aMs = a.collectedAt?.toDate?.()?.getTime() ?? 0;
      const bMs = b.collectedAt?.toDate?.()?.getTime() ?? 0;
      return aMs - bMs;
    });
    return payments;
  }

  // Era 3: synthesize from amountPaid (legacy pre-2026-05-17 data, no migration)
  if ((sale.amountPaid || 0) > 0) {
    return [{
      id: `legacy_${sale.id}`,
      saleId: sale.id,
      amount: sale.amountPaid,
      method: (sale.paymentMethod || 'cash').toLowerCase(),
      referenceNumber: null,
      note: null,
      collectedBy: 'Unknown (pre-2026-05-17)',
      collectedByUid: null,
      collectedAt: sale.date || null,
      reversalOf: null,
      _isLegacy: true,
    }];
  }

  return [];
}

// ─── recomputeBalance ─────────────────────────────────────────────────────────

/**
 * Computes the outstanding balance for a sale given its full payment history.
 *
 * Pure function — no Firestore calls. Safe to call synchronously once payments
 * are loaded.
 *
 * Reversals are represented as negative-amount payment docs (the `reversalOf`
 * field identifies what they reverse). Because reversal amounts are already
 * negative, a simple sum across all payments naturally nets them out — no
 * special-case logic required.
 *
 * The result is clamped at zero: overpayment is possible (e.g. rounding) but
 * the clinic should never see a negative balance displayed.
 *
 * @param {object} sale - Sale document (must have `.total`).
 * @param {Array}  payments - Full payment history including any reversal docs.
 * @returns {number} Outstanding balance in pesos, clamped at zero.
 */
export function recomputeBalance(sale, payments) {
  const total = typeof sale.total === 'number' ? sale.total : parseFloat(sale.total) || 0;
  const paid = (payments || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  return Math.max(0, total - paid);
}

// ─── buildPaymentDocPayload ───────────────────────────────────────────────────

/**
 * Builds the Firestore document payload for a single payment.
 *
 * Pure builder — stamps `collectedAt: Timestamp.now()` and defaults
 * `reversalOf` to `null` when omitted. Callers must supply the required fields.
 *
 * All 10 fields from the D1 schema are present on every returned object.
 *
 * @param {object} params
 * @param {string}      params.saleId          - FK to sales/{saleId}
 * @param {string|null} params.ownerId         - Denormalized owner ID (null for walk-ins)
 * @param {number}      params.amount          - Positive for payment, negative for reversal
 * @param {string}      params.method          - One of PAYMENT_METHODS (will be lowercased)
 * @param {string|null} params.referenceNumber - GCash/Maya/bank/check transaction ID
 * @param {string|null} params.note            - Optional free-text note
 * @param {string}      params.collectedBy     - Staff display name
 * @param {string|null} params.collectedByUid  - Firebase Auth UID
 * @param {string|null} [params.reversalOf]    - paymentId being reversed; null for normal payments
 * @returns {object} Firestore document payload ready for transaction.set() or batch.set()
 */
export function buildPaymentDocPayload({
  saleId,
  ownerId,
  amount,
  method,
  referenceNumber,
  note,
  collectedBy,
  collectedByUid,
  reversalOf = null,
}) {
  return {
    saleId,
    ownerId: ownerId ?? null,
    amount: parseFloat(amount) || 0,
    method: (method || 'cash').toLowerCase(),
    referenceNumber: referenceNumber || null,
    note: note || null,
    collectedBy: collectedBy || 'Unknown',
    collectedByUid: collectedByUid ?? null,
    collectedAt: Timestamp.now(),
    reversalOf: reversalOf ?? null,
  };
}

// ─── validatePaymentInput ─────────────────────────────────────────────────────

/**
 * Validates the inputs for a payment write before submitting to Firestore.
 *
 * Enforces D3: reference number is required for gcash, maya, bank, check.
 *
 * @param {object} params
 * @param {number|string} params.amount          - Payment amount
 * @param {string}        params.method          - Payment method (case-insensitive)
 * @param {string|null}   params.referenceNumber - Reference / transaction ID
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validatePaymentInput({ amount, method, referenceNumber }) {
  const parsedAmount = parseFloat(amount);

  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { valid: false, error: 'Amount must be greater than zero.' };
  }

  if (isRefNumberRequired(method) && !referenceNumber?.trim()) {
    const label = PAYMENT_METHOD_LABELS[(method || '').toLowerCase()] || method;
    return {
      valid: false,
      error: `Reference number required for ${label}.`,
    };
  }

  return { valid: true, error: null };
}

// ─── paymentMethodBucket ──────────────────────────────────────────────────────

/**
 * Normalizes any payment-method string to one of four reporting buckets used by
 * the Sales KPI cards, the method filter, and the daily_closings snapshot.
 *
 * Single source of truth so the aggregation and the filter cannot drift apart
 * again (the T4.239 bug: KPIs and filter each matched capitalized literals while
 * methods are stored lowercase). Handles three input forms:
 *   - the lowercase enum (T4.237): cash | gcash | maya | bank | card | check | other
 *   - legacy capitalized values: 'Cash' | 'GCash' | 'Card' | 'Bank Transfer'
 *   - the EodSummary card labels: 'Cash' | 'GCash' | 'Card' | 'Bank Transfer'
 *
 * 'maya' folds into the 'gcash' bucket (the card is labeled "GCash / Maya").
 * 'check' and 'other' return null — counted in total collected, no dedicated card.
 *
 * @param {string} method - Any payment-method string (case-insensitive).
 * @returns {'cash'|'gcash'|'card'|'bank'|null}
 */
export function paymentMethodBucket(method) {
  const m = (method || '').toLowerCase();
  if (m === 'cash') return 'cash';
  if (m === 'gcash' || m === 'maya') return 'gcash';
  if (m === 'card') return 'card';
  if (m === 'bank' || m === 'bank transfer') return 'bank';
  return null;
}
