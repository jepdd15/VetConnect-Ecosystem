/**
 * serviceProgressWriter — T4.248 Phase 2
 *
 * Marks a single service's progress (pending → in-progress → completed) on an
 * appointment, appending a clinicalPulse event. This is a SAFE COPY of the logic
 * inline in ClinicalWorkspace.handleToggleServiceProgress (left untouched to avoid
 * regression on the clinical sign-off path) so the Queue can drive per-service
 * progress for non-clinical visits WITHOUT opening the workspace.
 *
 * The pure helpers (cycleServiceStatus / buildServiceList) are unit-tested; the
 * writer is a thin Firestore wrapper around them.
 */

import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { createPulseEvent } from './pulseUtils';

/**
 * Next status in the progression. Completed is terminal (stays completed).
 * @param {string} current
 * @returns {'in-progress'|'completed'}
 */
export function cycleServiceStatus(current) {
  if (current === 'in-progress') return 'completed';
  if (current === 'completed') return 'completed';
  return 'in-progress'; // pending / undefined / anything else
}

/**
 * Pure: returns a NEW services array with `svcId` set to `next` (stamping
 * serviceStartedAt / serviceCompletedAt as appropriate) and all other services
 * preserved (status normalized to 'pending' when missing). Does not mutate input.
 *
 * @param {Array<object>} services
 * @param {string} svcId
 * @param {'in-progress'|'completed'} next
 * @param {*} now - timestamp to stamp (Timestamp.now() in production)
 * @returns {Array<object>}
 */
export function buildServiceList(services, svcId, next, now) {
  return (services || []).map((s) => {
    if (s.id !== svcId) {
      return { ...s, serviceStatus: s.serviceStatus ?? 'pending' };
    }
    return {
      ...s,
      serviceStatus: next,
      ...(next === 'in-progress' ? { serviceStartedAt: now } : {}),
      ...(next === 'completed' ? { serviceCompletedAt: now } : {}),
    };
  });
}

/**
 * Writes the updated services array + a SERVICE_STARTED/SERVICE_COMPLETED pulse
 * event to the appointment. Async; throws on Firestore failure (caller toasts).
 *
 * @param {object} params
 * @param {string} params.appointmentId
 * @param {Array<object>} params.services - current appointment services
 * @param {string} params.svcId
 * @param {'in-progress'|'completed'} params.next
 * @param {object} [params.profile] - acting staff ({ uid, fullName, email })
 */
export async function writeServiceProgress({ appointmentId, services, svcId, next, profile }) {
  const now = Timestamp.now();
  const newServices = buildServiceList(services, svcId, next, now);
  const svcName = newServices.find((s) => s.id === svcId)?.name || svcId;

  await updateDoc(doc(db, 'appointments', appointmentId), {
    services: newServices,
    clinicalPulse: arrayUnion(
      createPulseEvent(next === 'in-progress' ? 'SERVICE_STARTED' : 'SERVICE_COMPLETED', {
        staffId: profile?.uid || 'unknown',
        staffName: profile?.fullName || profile?.email || 'Staff',
        serviceId: svcId,
        serviceName: svcName,
        note: `${svcName} ${next === 'in-progress' ? 'started' : 'completed'}.`,
      }),
    ),
  });
}
