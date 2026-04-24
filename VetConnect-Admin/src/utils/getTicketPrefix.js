/**
 * Computes the 4-tier ticket prefix for an appointment.
 * A = scheduled appointment, W = walk-in, E = emergency, R = return visit
 * LOCKED: Self-check-in gets prefix based on booking ORIGIN, not check-in method.
 *
 * @param {{ priority?: string, caseDay?: number, ownerId?: string }} appt
 * @returns {'A' | 'W' | 'E' | 'R'}
 */
export function getTicketPrefix(appt) {
  if (appt.priority === 'high') return 'E';
  if ((appt.caseDay || 0) > 1) return 'R';
  if (appt.ownerId === 'WALK_IN_USER' || String(appt.ownerId || '').includes('GUEST_')) return 'W';
  return 'A';
}
