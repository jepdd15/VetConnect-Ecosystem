/**
 * STATUS CONSTANTS — Single source of truth for appointment status strings.
 *
 * Rules:
 * - Only import STATUS.* values when writing to Firestore or comparing status fields.
 * - Never change timestamp field names (e.g. timeDispenseStarted) — they are field names, not statuses.
 * - Use normalizeStatus() when reading legacy Firestore data that may contain old alias strings.
 */

/** All canonical appointment statuses. Frozen to prevent accidental mutation. */
export const STATUS = Object.freeze({
  PENDING:      'pending',
  CONFIRMED:    'confirmed',
  ARRIVED:      'arrived',
  IN_CONSULT:   'in-consult',
  DISPENSING:   'dispensing',
  BILLING:      'billing',
  COMPLETED:    'completed',
  CANCELLED:    'cancelled',
  NO_SHOW:      'no-show',
  ON_HOLD:      'on-hold',
  CONFINED:     'confined',
  CARRIED_OVER: 'carried-over',
});

/**
 * Statuses that represent a patient physically present or actively being processed.
 * Used for high-stakes triage guards and forensic audit locks.
 */
export const ACTIVE_STATUSES = new Set([
  STATUS.ARRIVED,
  STATUS.IN_CONSULT,
  STATUS.ON_HOLD,
  STATUS.DISPENSING,
  STATUS.BILLING,
  STATUS.CONFINED,
]);

/**
 * Statuses that require a mandatory forensic justification before any queue action.
 * Superset of ACTIVE_STATUSES — includes confirmed appointments that were never seen.
 */
export const HIGH_STAKES_STATUSES = new Set([
  STATUS.ARRIVED,
  STATUS.IN_CONSULT,
  STATUS.DISPENSING,
  STATUS.BILLING,
  STATUS.CONFIRMED,
  STATUS.ON_HOLD,
  STATUS.CONFINED,
]);

/**
 * Statuses that represent a fully resolved case. The clinical clock stops here.
 *
 * NOTE: CARRIED_OVER is intentionally excluded. A carried-over patient returns
 * the next shift and transitions to ARRIVED, so the record must not be treated
 * as fully resolved — the pulse engine must keep the clock running until the
 * follow-up appointment is sealed.
 */
export const TERMINAL_STATUSES = new Set([
  STATUS.COMPLETED,
  STATUS.CANCELLED,
  STATUS.NO_SHOW,
]);

/**
 * Statuses counted toward the "active consult" duration metric in the pulse engine.
 */
export const CONSULT_STATES = new Set([
  STATUS.IN_CONSULT,
  STATUS.DISPENSING,
  STATUS.BILLING,
  STATUS.ON_HOLD,
]);

/** Statuses counted toward the "lobby wait" (queue) duration metric. */
export const QUEUE_STATES = new Set([STATUS.ARRIVED]);

/** Statuses counted toward the "confined / inpatient" duration metric. */
export const CONFINED_STATES = new Set([STATUS.CONFINED]);

// ---------------------------------------------------------------------------
// STATE MACHINE
// ---------------------------------------------------------------------------

/**
 * Legal forward transitions for each status.
 * Reverse/revert transitions are handled separately by the revertStatus action.
 */
export const VALID_TRANSITIONS = Object.freeze(
  Object.fromEntries(
    Object.entries({
      [STATUS.PENDING]:      [STATUS.CONFIRMED, STATUS.CANCELLED, STATUS.NO_SHOW],
      [STATUS.CONFIRMED]:    [STATUS.ARRIVED, STATUS.CANCELLED, STATUS.NO_SHOW],
      [STATUS.ARRIVED]:      [STATUS.IN_CONSULT, STATUS.ON_HOLD, STATUS.CONFINED, STATUS.CANCELLED, STATUS.NO_SHOW],
      [STATUS.IN_CONSULT]:   [STATUS.DISPENSING, STATUS.BILLING, STATUS.ON_HOLD, STATUS.CONFINED, STATUS.COMPLETED],
      [STATUS.ON_HOLD]:      [STATUS.IN_CONSULT, STATUS.DISPENSING, STATUS.BILLING, STATUS.CANCELLED],
      [STATUS.DISPENSING]:   [STATUS.BILLING, STATUS.COMPLETED],
      [STATUS.BILLING]:      [STATUS.COMPLETED],
      [STATUS.CONFINED]:     [STATUS.IN_CONSULT, STATUS.COMPLETED, STATUS.CARRIED_OVER],
      [STATUS.COMPLETED]:    [],
      [STATUS.CANCELLED]:    [],
      [STATUS.NO_SHOW]:      [],
      [STATUS.CARRIED_OVER]: [STATUS.ARRIVED],
    }).map(([k, v]) => [k, Object.freeze(v)])
  )
);

/**
 * Validates whether a status transition is permitted by the state machine.
 *
 * @param {string} fromStatus - The current status string (should already be canonical).
 * @param {string} toStatus   - The desired next status string.
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateTransition(fromStatus, toStatus) {
  const from = (fromStatus || '').toLowerCase();
  const to   = (toStatus   || '').toLowerCase();

  const allowed = VALID_TRANSITIONS[from];

  if (!allowed) {
    return { valid: false, reason: `Unknown source status: '${from}'` };
  }

  if (!allowed.includes(to)) {
    return {
      valid: false,
      reason: `Transition '${from}' → '${to}' is not permitted. Allowed: [${allowed.join(', ') || 'none'}]`,
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// LEGACY ALIAS NORMALIZER
// ---------------------------------------------------------------------------

/**
 * Maps legacy / misspelled status strings found in old Firestore documents to
 * their canonical equivalents. Use this when reading data, not when writing.
 *
 * Known aliases:
 *   dispense   → dispensing
 *   payment    → billing
 *   scheduled  → confirmed
 *   admitted   → confined
 *   done       → completed
 *   pharmacy   → dispensing
 *
 * @param {string} raw - The raw status string from Firestore.
 * @returns {string} The canonical status string.
 */
export function normalizeStatus(raw) {
  const s = (raw || '').toLowerCase().trim();

  switch (s) {
    case 'dispense':  return STATUS.DISPENSING;
    case 'pharmacy':  return STATUS.DISPENSING;
    case 'payment':   return STATUS.BILLING;
    case 'scheduled': return STATUS.CONFIRMED;
    case 'admitted':  return STATUS.CONFINED;
    case 'done':      return STATUS.COMPLETED;
    default:          return s || STATUS.PENDING;
  }
}
