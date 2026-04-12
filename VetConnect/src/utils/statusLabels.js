/**
 * Maps internal appointment statuses to client-friendly display labels.
 *
 * Internal statuses are implementation details; clients should see plain-English
 * descriptions that reflect their experience, not the clinic's workflow vocabulary.
 */
const STATUS_LABELS = {
  pending: 'Awaiting Confirmation',
  confirmed: 'Appointment Confirmed',
  arrived: 'Checked In',
  'in-consult': 'With the Veterinarian',
  dispensing: 'Preparing Medications',
  billing: 'Ready for Checkout',
  completed: 'Visit Complete',
  cancelled: 'Cancelled',
  'no-show': 'Missed Appointment',
  'on-hold': 'On Hold',
  confined: 'Admitted to Clinic',
  'carried-over': 'Rescheduled',
};

/**
 * Returns a client-friendly label for a given appointment status.
 * Falls back to a title-cased version of the raw status if not in the map.
 *
 * @param {string} status - The raw appointment status from Firestore.
 * @returns {string}
 */
export const getClientStatusLabel = (status) => {
  if (!status) return 'Unknown';
  return STATUS_LABELS[status.toLowerCase()] || status.charAt(0).toUpperCase() + status.slice(1);
};

/**
 * Returns foreground and background colors appropriate for a given appointment status.
 * Intended for use with React Native Text/View style props.
 *
 * @param {string} status - The raw appointment status from Firestore.
 * @returns {{ color: string, backgroundColor: string }}
 */
export const getClientStatusColor = (status) => {
  const s = (status || '').toLowerCase();
  switch (s) {
    case 'confirmed':
      return { color: '#2E7D32', backgroundColor: '#E8F5E9' };
    case 'pending':
      return { color: '#ED6C02', backgroundColor: '#FFF3E0' };
    case 'arrived':
      return { color: '#1565C0', backgroundColor: '#E3F2FD' };
    case 'in-consult':
    case 'on-hold':
      return { color: '#6A1B9A', backgroundColor: '#F3E5F5' };
    case 'dispensing':
      return { color: '#E65100', backgroundColor: '#FFF3E0' };
    case 'billing':
      return { color: '#2E7D32', backgroundColor: '#E8F5E9' };
    case 'completed':
      return { color: '#1976D2', backgroundColor: '#E3F2FD' };
    case 'cancelled':
    case 'no-show':
      return { color: '#D32F2F', backgroundColor: '#FFEBEE' };
    case 'confined':
      return { color: '#6A1B9A', backgroundColor: '#F3E5F5' };
    default:
      return { color: '#555', backgroundColor: '#eee' };
  }
};
