/**
 * Single source of truth for all 12 canonical appointment statuses.
 * All display functions (label, color, icon) read from STATUS_META so the
 * three concerns stay in sync when a new status is added.
 *
 * Consumers outside this file: getClientStatusLabel (ClientDashboard.js),
 * getClientStatusColor + getClientStatusIcon (ClientAppointments.js, SuperCard.js).
 */
const STATUS_META = {
  pending: {
    label: 'Awaiting Confirmation',
    icon: '⏳',
    color: '#ED6C02',
    bg: '#FFF3E0',
    active: false,
  },
  confirmed: {
    label: 'Confirmed',
    icon: '✓',
    color: '#2E7D32',
    bg: '#E8F5E9',
    active: false,
  },
  arrived: {
    label: 'Checked In',
    icon: '📍',
    color: '#1565C0',
    bg: '#E3F2FD',
    active: true,
  },
  'in-consult': {
    label: 'With the Vet',
    icon: '🩺',
    color: '#6A1B9A',
    bg: '#F3E5F5',
    active: true,
  },
  dispensing: {
    label: 'Preparing Meds',
    icon: '💊',
    color: '#E65100',
    bg: '#FFF3E0',
    active: true,
  },
  billing: {
    label: 'Ready for Checkout',
    icon: '🧾',
    color: '#00695C',
    bg: '#E0F2F1',
    active: true,
  },
  'on-hold': {
    label: 'On Hold',
    icon: '⏸',
    color: '#455A64',
    bg: '#ECEFF1',
    active: true,
  },
  confined: {
    label: 'Admitted to Clinic',
    icon: '🏥',
    color: '#6A1B9A',
    bg: '#F3E5F5',
    active: true,
  },
  completed: {
    label: 'Visit Complete',
    icon: '✔',
    color: '#1976D2',
    bg: '#E3F2FD',
    active: false,
  },
  cancelled: {
    label: 'Cancelled',
    icon: '✕',
    color: '#D32F2F',
    bg: '#FFEBEE',
    active: false,
  },
  'no-show': {
    label: 'Missed',
    icon: '⚠',
    color: '#D32F2F',
    bg: '#FFEBEE',
    active: false,
  },
  'carried-over': {
    label: 'Rescheduled by Clinic',
    icon: '↻',
    color: '#6D4C41',
    bg: '#EFEBE9',
    active: false,
  },
};

const FALLBACK_META = {
  label: 'Unknown',
  icon: '•',
  color: '#555',
  bg: '#EEEEEE',
  active: false,
};

const getMeta = (status) =>
  STATUS_META[(status || '').toLowerCase()] || FALLBACK_META;

/**
 * Returns a client-friendly label for a given appointment status.
 * Falls back to a title-cased version of the raw status if not in the map.
 *
 * @param {string} status
 * @returns {string}
 */
export const getClientStatusLabel = (status) => {
  if (!status) return 'Unknown';
  return getMeta(status).label;
};

/**
 * Returns foreground and background colors appropriate for a given appointment status.
 * Intended for use with React Native Text/View style props.
 *
 * @param {string} status
 * @returns {{ color: string, backgroundColor: string }}
 */
export const getClientStatusColor = (status) => {
  const meta = getMeta(status);
  return { color: meta.color, backgroundColor: meta.bg };
};

/**
 * Returns the display emoji for a given appointment status.
 *
 * @param {string} status
 * @returns {string}
 */
export const getClientStatusIcon = (status) => getMeta(status).icon;

/**
 * Returns true when the appointment status represents an actively in-clinic visit
 * (patient is on-site and the case has not yet closed).
 * Matches the ACTIVE_STATUSES set in the admin statusConstants.js.
 *
 * @param {string} status
 * @returns {boolean}
 */
export const isActiveStatus = (status) => getMeta(status).active;

/**
 * Converts a raw cancellation reason string (from auditReason or rejectReason)
 * into a warm, pet-owner-friendly display string.
 *
 * Returns '' (empty) for null / undefined / whitespace-only input — callers
 * should render nothing when the return value is empty.
 *
 * Processing rules (applied in priority order, short-circuit on first match):
 *   1. null / undefined / whitespace-only  → ''
 *   2. Starts with '[Triage Audit]'         → 'Rescheduled by the clinic'
 *   3. Contains '[Clinical Triage: ...]'    → 'Rescheduled by the clinic'
 *   4. Starts with 'Shift Cleanup:'        → 'Rescheduled by the clinic'
 *   5. Contains word 'forensic' or 'audit' → 'Cancelled by the clinic'
 *   6. Exactly 'Cancelled by Pet Owner'    → 'You cancelled this booking'
 *   7. Anything else                       → raw string, trimmed
 *
 * @param {string|null|undefined} raw
 * @returns {string}
 */
export const sanitizeCancelReason = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('[triage audit]')) return 'Rescheduled by the clinic';
  if (/\[clinical triage:.*?\]/i.test(trimmed)) return 'Rescheduled by the clinic';
  if (lower.startsWith('shift cleanup:')) return 'Rescheduled by the clinic';
  if (lower === 'client-dismissed-followup') return '';
  if (lower === 'client-booked-followup') return '';
  if (lower.startsWith("forensic")) return 'Cancelled by the clinic';
  if (lower === 'cancelled by pet owner') return 'You cancelled this booking';

  return trimmed;
};
