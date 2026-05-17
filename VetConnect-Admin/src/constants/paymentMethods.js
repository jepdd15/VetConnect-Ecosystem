/**
 * paymentMethods.js — Canonical payment method enum + validation helpers.
 *
 * T4.237: Used by POSModal tenders, handleRecordPayment, handleMarkSettled,
 * and the payments collection schema. Keep this the single source of truth
 * for any code that reads or writes a payment method string.
 */

/** All valid payment method identifiers. Stored lowercase in Firestore. */
export const PAYMENT_METHODS = [
  'cash',
  'gcash',
  'maya',
  'bank',
  'card',
  'check',
  'other',
];

/**
 * Human-readable labels for each payment method.
 * Used in dropdowns, receipts, and audit trail display.
 */
export const PAYMENT_METHOD_LABELS = {
  cash:  'Cash',
  gcash: 'GCash',
  maya:  'Maya',
  bank:  'Bank Transfer',
  card:  'Card',
  check: 'Check',
  other: 'Other',
};

/**
 * Methods that require a reference number (e.g. transaction ID, check number).
 * Validated at the POS tender UI and in validatePaymentInput().
 */
export const REF_NUMBER_REQUIRED = new Set(['gcash', 'maya', 'bank', 'check']);

/**
 * Returns true when the given method requires a reference number.
 * Normalizes input to lowercase so 'GCash' and 'gcash' both match.
 *
 * @param {string} method - Payment method string (case-insensitive).
 * @returns {boolean}
 */
export const isRefNumberRequired = (method) =>
  REF_NUMBER_REQUIRED.has((method || '').toLowerCase());
