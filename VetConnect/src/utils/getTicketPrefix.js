/**
 * Computes the 4-tier ticket prefix from appointment data.
 *
 * Tier mapping:
 *   E = Emergency   (priority === 'high')
 *   R = Return visit (caseDay > 1)
 *   W = Walk-in      (ownerId is WALK_IN_USER or GUEST_ prefixed)
 *   A = Scheduled appointment (default)
 *
 * LOCKED DECISION: Self-check-in uses booking ORIGIN, not check-in method.
 * A client who booked online and self-checks-in gets prefix 'A', not a new prefix.
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
