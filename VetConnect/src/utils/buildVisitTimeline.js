/**
 * buildVisitTimeline — Pure utility that converts a raw `clinicalPulse` array
 * into a flat, client-safe timeline array.
 *
 * Architectural rule: all internal pulse event types (INCEPTION, TRIAGE_DEFER,
 * draft lifecycle, per-service granularity, pharmacy flags) are deliberately
 * excluded. Only status transitions that are meaningful to the pet owner are
 * surfaced. Staff notes are never forwarded — only label + staffName + time.
 *
 * Used by VisitTimeline.js (mobile component) only. No Firestore reads — the
 * pulse array is already loaded by the ClientAppointments onSnapshot listener.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Statuses that a pet owner can understand and that signal progress through
 * the clinic visit. All other STATUS_CHANGE toStatus values are filtered out.
 */
const CLIENT_VISIBLE_STATUSES = new Set([
  'arrived',
  'in-consult',
  'on-hold',
  'confined',
  'dispensing',
  'billing',
  'completed',
  'cancelled',
  'no-show',
  'carried-over',
]);

/**
 * Human-readable labels aligned with statusLabels.js STATUS_META for consistency,
 * but defined here to keep the mapping co-located with the filter logic.
 */
const CLIENT_LABEL_MAP = {
  'arrived':      'Checked in',
  'in-consult':   'With the vet',
  'on-hold':      'Paused',
  'confined':     'Admitted to clinic',
  'dispensing':   'Preparing meds',
  'billing':      'Ready for checkout',
  'completed':    'Visit complete',
  'cancelled':    'Cancelled',
  'no-show':      'Marked absent',
  'carried-over': 'Continued next day',
};

/**
 * Statuses that represent a closed/terminal visit. Used to attach signedOffAt
 * metadata to the last node and to avoid projecting live-elapsed time.
 */
const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'no-show', 'carried-over']);

/**
 * Event types that are never shown to the client — internal workflow noise.
 */
const EXCLUDED_TYPES = new Set([
  'INCEPTION',
  'TRIAGE_DEFER',
  'TRIAGE_CARRYOVER',
  'TRIAGE_RESCHEDULE',
  'DRAFT_SAVED',
  'DRAFT_RESUMED',
  'SERVICE_STARTED',
  'SERVICE_COMPLETED',
  'DISPENSING_FLAGGED',
  'FLAG_RESOLVED',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely converts a Firestore Timestamp or raw value to a JS Date.
 * Falls back to epoch (Date(0)) rather than throwing, so callers can sort
 * without crashing on malformed data.
 *
 * @param {*} ts - Firestore Timestamp, ISO string, or number.
 * @returns {Date}
 */
const resolveDate = (ts) => {
  if (!ts) return new Date(0);
  if (typeof ts.toDate === 'function') return ts.toDate();
  const parsed = new Date(ts);
  return isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

/**
 * Formats elapsed minutes into a compact human-readable duration string.
 * Examples: 45 -> "45m", 75 -> "1h 15m", 120 -> "2h"
 *
 * @param {number|null} mins
 * @returns {string|null}
 */
export const formatDurationMins = (mins) => {
  if (mins == null || mins < 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Transforms a raw clinicalPulse array into a flat, client-safe array of
 * timeline event objects suitable for direct rendering by VisitTimeline.js.
 *
 * Processing passes:
 *   Pass 0 — Guard & sort ascending by timestamp.
 *   Pass 1 — Filter to client-visible STATUS_CHANGE events + CORRECTION events.
 *   Pass 2 — Map each event to a clean timeline node object.
 *   Pass 3 — Compute durationMins between consecutive events.
 *   Pass 4 — Set isCurrent on the last event when isActive.
 *   Pass 5 — Attach signedOffAt to the last node when terminal + completed.
 *
 * @param {Array|null|undefined} clinicalPulse - Raw pulse array from appointment doc.
 * @param {Object} opts
 * @param {boolean}  opts.isActive     - True if the appointment is still in-clinic.
 * @param {string}   [opts.assignedVet] - Assigned vet name (not used here; passed through to callers).
 * @param {*}        [opts.signedOffAt] - Firestore Timestamp of sign-off for completed visits.
 * @returns {Array<{
 *   label:        string,
 *   staffName:    string|null,
 *   timestamp:    Date,
 *   durationMins: number|null,
 *   isCurrent:    boolean,
 *   isCorrection: boolean,
 *   isTerminal:   boolean,
 *   signedOffAt:  Date|null,
 * }>}
 */
export const buildVisitTimeline = (clinicalPulse, opts = {}) => {
  // ── Pass 0: Guard & sort ──────────────────────────────────────────────────
  if (!clinicalPulse || clinicalPulse.length === 0) return [];

  const { isActive = false, signedOffAt = null } = opts;

  const sorted = [...clinicalPulse].sort((a, b) => {
    const da = resolveDate(a.timestamp);
    const db = resolveDate(b.timestamp);
    return da - db;
  });

  // ── Pass 1 + 2: Filter + Map ──────────────────────────────────────────────
  const events = [];

  for (const event of sorted) {
    const type = (event.type || '').toUpperCase();

    // Skip any internal-only event type explicitly.
    if (EXCLUDED_TYPES.has(type)) continue;

    const isStatusChange = type === 'STATUS_CHANGE';
    const isCorrection   = type === 'CORRECTION';

    if (!isStatusChange && !isCorrection) continue;

    const toStatus = (event.toStatus || '').toLowerCase();

    // STATUS_CHANGE: only include client-visible destination statuses.
    if (isStatusChange && !CLIENT_VISIBLE_STATUSES.has(toStatus)) continue;

    // Resolve label: corrections get special handling for terminal-reversal notes.
    let label;
    if (isCorrection) {
      label = (event.note || '').includes('TERMINAL REVERSAL')
        ? 'Record reopened'
        : 'Status corrected';
    } else {
      label = CLIENT_LABEL_MAP[toStatus] || toStatus;
    }

    // Filter out system-generated staff attribution — not meaningful to pet owners.
    const staffName = (event.staffName && event.staffName !== 'System')
      ? event.staffName
      : null;

    events.push({
      label,
      staffName,
      timestamp:    resolveDate(event.timestamp),
      durationMins: null,   // computed in Pass 3
      isCurrent:    false,  // set in Pass 4
      isCorrection,
      isTerminal:   TERMINAL_STATUSES.has(toStatus),
      toStatus,             // retained for terminal icon logic in the component
      signedOffAt:  null,   // set in Pass 5
    });
  }

  if (events.length === 0) return [];

  // ── Pass 3: Duration computation ──────────────────────────────────────────
  for (let i = 0; i < events.length; i++) {
    const isLast = i === events.length - 1;

    if (!isLast) {
      const diffMs = events[i + 1].timestamp.getTime() - events[i].timestamp.getTime();
      events[i].durationMins = Math.max(0, Math.round(diffMs / 60000));
    } else if (isActive) {
      // Live elapsed on the current stage — updated at render time by the component.
      const elapsed = Math.max(0, Math.round((Date.now() - events[i].timestamp.getTime()) / 60000));
      events[i].durationMins = elapsed;
    }
    // Otherwise last event gets null — no duration displayed after a terminal event.
  }

  // ── Pass 4: Mark current event ────────────────────────────────────────────
  if (isActive) {
    events[events.length - 1].isCurrent = true;
  }

  // ── Pass 5: Attach sign-off timestamp ─────────────────────────────────────
  const lastEvent = events[events.length - 1];
  if (lastEvent.isTerminal && lastEvent.toStatus === 'completed' && signedOffAt) {
    lastEvent.signedOffAt = resolveDate(signedOffAt);
  }

  return events;
};
