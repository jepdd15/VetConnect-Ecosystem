/**
 * pulseEventBuilders.js — Test-only utilities replicating pulse event construction
 * from production handlers. Each function mirrors a specific write site exactly.
 *
 * MAINTENANCE: If a production handler's pulse event shape changes,
 * update the corresponding builder AND its tests.
 *
 * Cross-reference table at bottom maps each builder to its source.
 *
 * Source files audited:
 *   - useQueueActions.js  (W1–W7)
 *   - Queue.jsx           (W8–W16)
 *   - ClinicalWorkspace.jsx (W17–W20)
 *   - WalkInModal.jsx     (W21)
 *   - AssignStaffModal.jsx (W22a–W22b)
 *   - POSModal.jsx        (W23–W24)
 *   - Records.jsx         (W25–W28)
 */

// NOTE: firebase/firestore must be mocked by the consuming test file BEFORE importing this module.
// See pulseEventWriters.test.js for the vi.mock() call.

import { createPulseEvent, makePulseEventId } from '../pulseUtils';
import { Timestamp } from 'firebase/firestore';

// ── useQueueActions.js BUILDERS ─────────────────────────────────────────────

/**
 * W1: changeStatus — forward status transition.
 * Source: useQueueActions.js → changeStatus → line ~29
 */
export const buildStatusChangeEvent = ({ fromStatus, toStatus, staffId, staffName, isOnHold = false }) =>
  createPulseEvent('STATUS_CHANGE', {
    fromStatus: fromStatus || 'unknown',
    toStatus,
    staffId: staffId || 'unknown',
    staffName: staffName || 'System/Admin',
    note: isOnHold
      ? 'Patient placed on-hold (Pause Engine Triggered)'
      : `Status transition to ${toStatus}`,
  });

/**
 * W2: revertStatus — correction with forensic DNA link.
 * Source: useQueueActions.js → revertStatus → line ~132
 */
export const buildCorrectionEvent = ({
  fromStatus,
  toStatus,
  staffId,
  staffName,
  revertReason,
  correctedEventId,
  wasTerminal,
}) =>
  createPulseEvent('CORRECTION', {
    fromStatus,
    toStatus,
    staffId: staffId || 'unknown',
    staffName: staffName || 'System/Admin',
    note: wasTerminal
      ? `TERMINAL REVERSAL: ${revertReason || 'Manual Status Reversion'} (seal cleared)`
      : `REVERSION: ${revertReason || 'Manual Status Reversion'}`,
    correctedEventId,
    isCorrection: true,
  });

/**
 * W3: markNoShow — individual no-show flagging.
 * Source: useQueueActions.js → markNoShow → line ~186
 */
export const buildNoShowEvent = ({ fromStatus, staffId, staffName, reason }) =>
  createPulseEvent('STATUS_CHANGE', {
    fromStatus: fromStatus || 'unknown',
    toStatus: 'no-show',
    staffId: staffId || 'unknown',
    staffName: staffName || 'System/Admin',
    note: `Individually flagged as No-Show: ${reason}`,
  });

/**
 * W4: rejectAppointment — individual cancellation.
 * Source: useQueueActions.js → rejectAppointment → line ~229
 */
export const buildRejectEvent = ({ fromStatus, staffId, staffName, reason, isForensic }) =>
  createPulseEvent('STATUS_CHANGE', {
    fromStatus: fromStatus || 'unknown',
    toStatus: 'cancelled',
    staffId: staffId || 'unknown',
    staffName: staffName || 'System/Admin',
    note: isForensic ? `Forensic Triage Cleanup: ${reason}` : (reason || 'Individually cancelled'),
  });

/**
 * W5: quickAdmitER — emergency INCEPTION, manual object.
 * Source: useQueueActions.js → quickAdmitER → line ~296
 *
 * NOTE: Production uses `staffSignature` (= profile?.fullName || user?.email)
 * for staffName, and `profile?.id` for staffId. The note uses `profile?.fullName`
 * directly (separate from staffSignature).
 */
export const buildERInceptionEvent = ({ staffId, staffName }) => ({
  eventId: makePulseEventId('inception'),
  type: 'INCEPTION',
  toStatus: 'arrived',
  timestamp: Timestamp.now(),
  staffId: staffId || 'unknown',
  staffName: staffName || 'System/Admin',
  note: 'Emergency ' + (staffName ? 'admitted by ' + staffName : 'quick admission'),
});

/**
 * W6: deferAppointment — triage deferral.
 * Source: useQueueActions.js → deferAppointment → line ~339
 */
export const buildDeferEvent = ({ staffId, staffName, reason, triageKey }) =>
  createPulseEvent('STATUS_CHANGE', {
    toStatus: 'pending (deferred)',
    staffId: staffId || 'unknown',
    staffName: staffName || 'System/Admin',
    note: `Shift Deferred to ${triageKey} (Reason: ${reason})`,
  });

/**
 * W7: rescheduleAppointment — appointment rescheduling.
 * Source: useQueueActions.js → rescheduleAppointment → line ~371
 *
 * NOTE: Production passes `new Date(newDate).toLocaleString()` as the date string
 * in the note. The builder accepts a pre-formatted `newDateStr` to keep it pure.
 */
export const buildRescheduleEvent = ({ fromStatus, staffId, staffName, reason, newDateStr }) =>
  createPulseEvent('STATUS_CHANGE', {
    fromStatus: fromStatus || 'unknown',
    staffId: staffId || 'unknown',
    staffName: staffName || 'System/Admin',
    note: `SCHEDULE SHIFT: ${reason} (Moved to ${newDateStr})`,
  });

// ── Queue.jsx BUILDERS ───────────────────────────────────────────────────────

/**
 * W8/W9: EOD triage — carryover pulse written to the OLD appointment.
 * Source: Queue.jsx → EOD triage batch loop → lines ~414 and ~440
 *
 * The two write sites produce identical shapes; they differ only in whether
 * the appointment was already 'carried-over' (W8) or is transitioning (W9).
 */
export const buildTriageCarryoverEvent = ({
  action,
  rawStatus,
  staffId,
  staffName,
  actionLabel,
  dateStr,
  reason,
}) => ({
  eventId: makePulseEventId('carryover'),
  type:
    action === 'defer'
      ? 'TRIAGE_DEFER'
      : action === 'hospitalize'
      ? 'TRIAGE_CONFINE'
      : action === 'carryover'
      ? 'TRIAGE_CARRYOVER'
      : 'TRIAGE_RESCHEDULE',
  fromStatus: rawStatus,
  toStatus: 'carried-over',
  timestamp: Timestamp.now(),
  staffId: staffId || 'system',
  staffName,
  note: `Shift Cleanup: ${actionLabel} to ${dateStr}. Justification: ${reason}`,
});

/**
 * W10: EOD triage — INCEPTION seed on the NEW appointment document.
 * Source: Queue.jsx → EOD triage batch loop → line ~476
 */
export const buildTriageInceptionEvent = ({
  action,
  staffId,
  staffName,
  actionLabel,
  originApptId,
  depositEntry,
}) => ({
  eventId: makePulseEventId('inception'),
  type: 'INCEPTION',
  toStatus: action === 'hospitalize' ? 'confined' : 'confirmed',
  timestamp: Timestamp.now(),
  staffId: staffId || 'system',
  staffName,
  note: `Generated via Triage ${actionLabel} from Appt ${originApptId}${
    depositEntry ? ` — Deposit: ₱${depositEntry.amount} (${depositEntry.method})` : ''
  }`,
});

/**
 * W11: EOD triage — terminal audit (cancel or no-show path).
 * Source: Queue.jsx → EOD triage batch loop → line ~500
 */
export const buildTriageTerminalEvent = ({ action, rawStatus, staffId, staffName, reason }) => ({
  eventId: makePulseEventId('triage'),
  type: action === 'no-show' ? 'TRIAGE_NO_SHOW' : 'TRIAGE_CANCELLED',
  fromStatus: rawStatus,
  toStatus: action === 'no-show' ? 'no-show' : 'cancelled',
  timestamp: Timestamp.now(),
  staffId: staffId || 'system',
  staffName,
  note: `Shift Cleanup Sign-off: ${reason}`,
});

/**
 * W12: handleDispenseVerified — dispensing → billing transition, manual object.
 * Source: Queue.jsx → handleDispenseVerified → line ~667
 */
export const buildDispenseVerifiedEvent = ({ staffId, staffName }) => ({
  eventId: makePulseEventId('status'),
  type: 'STATUS_CHANGE',
  fromStatus: 'dispensing',
  toStatus: 'billing',
  timestamp: Timestamp.now(),
  staffId: staffId || 'unknown',
  staffName: staffName || 'System',
  note: 'Dispensing verified, moved to billing.',
});

/**
 * W13: handleDispenseFlag — flags dispensing for vet re-review.
 * Source: Queue.jsx → handleDispenseFlag → line ~700
 */
export const buildDispenseFlagEvent = ({ staffId, staffName, reason }) =>
  createPulseEvent('DISPENSING_FLAGGED', {
    staffId,
    staffName,
    note: reason || 'Flagged for vet review',
  });

/**
 * W14: handleDispenseResolve — resolves an existing dispensing hold.
 * Source: Queue.jsx → handleDispenseResolve → line ~724
 */
export const buildFlagResolvedEvent = ({ staffId, staffName, note }) =>
  createPulseEvent('FLAG_RESOLVED', {
    staffId,
    staffName,
    note: note || 'Hold resolved',
  });

/**
 * W15: saveReschedule — inline clinical reschedule, manual object.
 * Source: Queue.jsx → saveReschedule → line ~930
 */
export const buildInlineRescheduleEvent = ({
  isCarryOver,
  staffId,
  staffName,
  updatedDayStr,
  additionalWaitMins,
  auditReason,
}) => ({
  eventId: makePulseEventId('shift'),
  type: 'STATUS_CHANGE',
  toStatus: isCarryOver ? 'carried-over' : 'confirmed',
  shiftNote: 'shifted',
  timestamp: Timestamp.now(),
  staffId: staffId || 'unknown',
  staffName,
  note: isCarryOver
    ? `CLINICAL CARRY-OVER to ${updatedDayStr} [Wait: ${additionalWaitMins}m] (Reason: ${auditReason})`
    : `Manual Clinical Shift to ${updatedDayStr} (Reason: ${auditReason})`,
});

/**
 * W16: Identity edit from Queue.jsx — IDENTITY_EDIT or IDENTITY_HEALING.
 * Source: Queue.jsx → identity edit handler → line ~853
 */
export const buildIdentityEditEvent = ({ isQuickAdmit, staffId, staffName, changedFields }) => ({
  eventId: makePulseEventId(isQuickAdmit ? 'identity-healing' : 'identity-edit'),
  type: isQuickAdmit ? 'IDENTITY_HEALING' : 'IDENTITY_EDIT',
  timestamp: Timestamp.now(),
  staffId: staffId || 'unknown',
  staffName: staffName || 'System',
  note:
    changedFields.length > 0
      ? `Identity fields edited: ${changedFields.join(', ')}`
      : 'Identity record accessed (no changes detected)',
});

// ── ClinicalWorkspace.jsx BUILDERS ───────────────────────────────────────────

/**
 * W17: Service progress toggle — SERVICE_STARTED or SERVICE_COMPLETED.
 * Source: ClinicalWorkspace.jsx → service toggle handler → line ~1011
 */
export const buildServiceProgressEvent = ({ svcId, next, staffId, staffName, serviceName }) => ({
  eventId: makePulseEventId(`svc-${next}`),
  type: next === 'in-progress' ? 'SERVICE_STARTED' : 'SERVICE_COMPLETED',
  timestamp: Timestamp.now(),
  staffId: staffId || 'unknown',
  staffName: staffName || 'Authorized Clinician',
  serviceId: svcId,
  serviceName: serviceName || svcId,
  note: `Service ${next === 'in-progress' ? 'started' : 'completed'}.`,
});

/**
 * W17b: Clinical sign-off STATUS_CHANGE — in-consult → dispensing/billing.
 * Source: ClinicalWorkspace.jsx → handleSaveConsult → appointmentUpdate → ~1285
 *
 * This event was MISSING prior to T3.78. It closes the forensic gap where
 * sign-off transitions wrote statusHistory + forensicSeal but no pulse event.
 */
export const buildSignOffStatusChangeEvent = ({ fromStatus, toStatus, staffId, staffName }) =>
  createPulseEvent('STATUS_CHANGE', {
    fromStatus: fromStatus || 'in-consult',
    toStatus,
    staffId,
    staffName,
    note: `Clinical sign-off. Record finalized. Routed to ${toStatus}.`,
  });

/**
 * W18: Follow-up creation INCEPTION seed (sign-off path).
 * Source: ClinicalWorkspace.jsx → handleSaveConsult → line ~1323
 *
 * NOTE: Production type is 'STATUS_CHANGE', NOT 'INCEPTION'. This is intentional
 * production behavior — the follow-up is seeded with a status transition event,
 * not a true inception. See risk table in PHASE3_PULSE_WRITING_TESTS_PLAN.md.
 */
export const buildFollowUpInceptionEvent = ({ staffId, staffName, originApptId }) => ({
  eventId: makePulseEventId('inception'),
  type: 'STATUS_CHANGE',
  toStatus: 'pending',
  timestamp: Timestamp.now(),
  staffId,
  staffName,
  note: `Follow-up created from sign-off of appointment ${originApptId}.`,
});

/**
 * W19: handleDiscardDraft — permanent draft removal audit event.
 * Source: ClinicalWorkspace.jsx → handleDiscardDraft → line ~1455
 */
export const buildDraftDiscardedEvent = ({ staffId, staffName, savedByName, savedAt, savedByUid }) => ({
  eventId: makePulseEventId('draft-discard'),
  type: 'DRAFT_DISCARDED',
  timestamp: Timestamp.now(),
  staffId: staffId || 'unknown',
  staffName: staffName || 'Authorized Clinician',
  note: `Draft discarded (was saved by ${savedByName || 'unknown'})`,
  discardedDraftSavedAt: savedAt ? Timestamp.fromDate(savedAt) : null,
  discardedDraftSavedBy: savedByUid || null,
});

/**
 * W19b: handleSaveDraft — DRAFT_SAVED audit event (inside transaction).
 * Source: ClinicalWorkspace.jsx → handleSaveDraft → transaction.update payload
 */
export const buildDraftSavedEvent = ({ staffId, staffName }) =>
  createPulseEvent('DRAFT_SAVED', {
    staffId: staffId || 'unknown',
    staffName: staffName || 'Clinician',
    note: 'SOAP draft saved.',
  });

/**
 * W19c: handleResumeDraft — DRAFT_RESUMED audit event (non-blocking updateDoc).
 * Source: ClinicalWorkspace.jsx → handleResumeDraft → updateDoc after state updates
 */
export const buildDraftResumedEvent = ({ staffId, staffName, savedByName }) =>
  createPulseEvent('DRAFT_RESUMED', {
    staffId: staffId || 'unknown',
    staffName: staffName || 'Clinician',
    note: `Draft resumed (was saved by ${savedByName || 'unknown'}).`,
  });

/**
 * W20: handleSubmitAmendment — append-only clinical amendment on sealed record.
 * Source: ClinicalWorkspace.jsx → handleSubmitAmendment → line ~1507
 */
export const buildAmendmentEvent = ({ staffId, staffName, reason, text }) => ({
  eventId: makePulseEventId('amend'),
  type: 'CLINICAL_AMENDMENT',
  timestamp: Timestamp.now(),
  staffId: staffId || 'unknown',
  staffName: staffName || 'Clinician',
  note: `Amendment (${(reason || '').slice(0, 40)}): ${(text || '').slice(0, 80)}`,
});

// ── WalkInModal.jsx BUILDERS ─────────────────────────────────────────────────

/**
 * W21: Walk-in INCEPTION — physical intake event.
 * Source: WalkInModal.jsx → buildApptPayload → line ~258
 */
export const buildWalkInInceptionEvent = ({
  staffId,
  staffName,
  weight,
  isEmergency,
  triageNotes,
}) => ({
  eventId: makePulseEventId('walkin'),
  type: 'INCEPTION',
  toStatus: 'arrived',
  timestamp: Timestamp.now(),
  staffId: staffId || 'system_walkin',
  staffName,
  note: `Physical Intake [WT: ${weight || 'N/A'}kg]:${isEmergency ? ' URGENT ER' : ''} ${triageNotes || ''}`,
});

// ── AssignStaffModal.jsx BUILDERS ────────────────────────────────────────────

/**
 * W22a: Primary appointment check-in.
 * Source: AssignStaffModal.jsx → check-in transaction
 */
export const buildCheckInEvent = ({
  staffId,
  staffName,
  isGroupCheckIn,
  siblingCount,
  sharedNumber,
}) => ({
  eventId: makePulseEventId('assign'),
  type: 'STATUS_CHANGE',
  fromStatus: 'confirmed',
  toStatus: 'arrived',
  timestamp: Timestamp.now(),
  staffId: staffId || 'unknown',
  staffName,
  note: isGroupCheckIn
    ? `Group check-in (1/${siblingCount + 1}). Shared queue: ${sharedNumber}.`
    : 'Patient physically arrived and checked-in.',
});

/**
 * W22b: Sibling check-in within a group visit.
 * Source: AssignStaffModal.jsx → sibling loop
 */
export const buildSiblingCheckInEvent = ({
  staffId,
  staffName,
  siblingIndex,
  siblingCount,
  sharedNumber,
}) => ({
  eventId: makePulseEventId('assign'),
  type: 'STATUS_CHANGE',
  fromStatus: 'confirmed',
  toStatus: 'arrived',
  timestamp: Timestamp.now(),
  staffId: staffId || 'unknown',
  staffName,
  note: `Group check-in (${siblingIndex + 2}/${siblingCount + 1}). Shared queue: ${sharedNumber}.`,
});

// ── POSModal.jsx BUILDERS ────────────────────────────────────────────────────

/**
 * W23: Individual checkout — single appointment billing completion.
 * Source: POSModal.jsx → individual checkout path → line ~626
 */
export const buildCheckoutEvent = ({ staffId, staffName, total, paymentMethod }) => ({
  eventId: makePulseEventId('checkout'),
  type: 'CHECKOUT_COMPLETED',
  timestamp: Timestamp.now(),
  staffId: staffId || 'pos_system',
  staffName: staffName || 'POS Cashier',
  note: `Checkout: ₱${total} via ${paymentMethod}`,
});

/**
 * W24: Group checkout — multi-pet visit billing completion.
 * Source: POSModal.jsx → group checkout path → line ~582
 */
export const buildGroupCheckoutEvent = ({ staffId, staffName, subtotal, paymentMethod }) => ({
  eventId: makePulseEventId('checkout'),
  type: 'CHECKOUT_COMPLETED',
  timestamp: Timestamp.now(),
  staffId: staffId || 'pos_system',
  staffName: staffName || 'POS Cashier',
  note: `Group checkout: ₱${subtotal?.toFixed(2) || '0.00'} (subtotal) via ${paymentMethod}`,
});

// ── Records.jsx BUILDERS ─────────────────────────────────────────────────────

/**
 * W25: handleUndoReschedule — reschedule reversal from Records ledger.
 * Source: Records.jsx → handleUndoReschedule → line ~327
 */
export const buildRescheduleUndoEvent = ({ staffName, staffId }) => ({
  type: 'RESCHEDULE_UNDO',
  note: 'Reschedule reverted from Records ledger',
  staffName: staffName || 'Unknown',
  staffId: staffId || '',
  timestamp: Timestamp.now(),
  eventId: makePulseEventId('resched-undo'),
});

/**
 * W26: handleAddAddendum — audit addendum appended from Records ledger.
 * Source: Records.jsx → handleAddAddendum → line ~364
 */
export const buildAddendumEvent = ({ staffName, staffId, text }) => ({
  type: 'AUDIT_ADDENDUM',
  note: (text || '').trim(),
  staffName: staffName || 'Unknown',
  staffId: staffId || '',
  timestamp: Timestamp.now(),
  eventId: makePulseEventId('addendum'),
});

/**
 * W27: handleBulkReassign — bulk staff reassignment from Records ledger.
 * Source: Records.jsx → handleBulkReassign → line ~463
 */
export const buildBulkReassignEvent = ({ staffName, staffId, vetName }) => ({
  type: 'STAFF_REASSIGN',
  note: `Bulk reassigned to ${vetName || 'Unknown'} from Records`,
  staffName: staffName || 'Unknown',
  staffId: staffId || '',
  timestamp: Timestamp.now(),
  eventId: makePulseEventId('reassign'),
});

/**
 * W28: Identity edit from Records ledger.
 * Source: Records.jsx → identity edit JSX onClick → line ~948
 */
export const buildRecordsIdentityEditEvent = ({ staffName, staffId }) => ({
  type: 'IDENTITY_EDIT',
  note: 'Identity updated from Records ledger',
  staffName: staffName || 'Unknown',
  staffId: staffId || '',
  timestamp: Timestamp.now(),
  eventId: makePulseEventId('id-edit'),
});

// ── Cross-reference table ────────────────────────────────────────────────────
//
// Builder                      | Source File              | Handler/Function          | ~Line
// -----------------------------|--------------------------|---------------------------|-------
// buildStatusChangeEvent       | useQueueActions.js       | changeStatus              | 29
// buildCorrectionEvent         | useQueueActions.js       | revertStatus              | 132
// buildNoShowEvent             | useQueueActions.js       | markNoShow                | 186
// buildRejectEvent             | useQueueActions.js       | rejectAppointment         | 229
// buildERInceptionEvent        | useQueueActions.js       | quickAdmitER              | 296
// buildDeferEvent              | useQueueActions.js       | deferAppointment          | 339
// buildRescheduleEvent         | useQueueActions.js       | rescheduleAppointment     | 371
// buildTriageCarryoverEvent    | Queue.jsx                | EOD triage batch loop     | 414/440
// buildTriageInceptionEvent    | Queue.jsx                | EOD triage batch loop     | 476
// buildTriageTerminalEvent     | Queue.jsx                | EOD triage batch loop     | 500
// buildDispenseVerifiedEvent   | Queue.jsx                | handleDispenseVerified    | 667
// buildDispenseFlagEvent       | Queue.jsx                | handleDispenseFlag        | 700
// buildFlagResolvedEvent       | Queue.jsx                | handleDispenseResolve     | 724
// buildInlineRescheduleEvent   | Queue.jsx                | saveReschedule            | 930
// buildIdentityEditEvent       | Queue.jsx                | identity edit handler     | 853
// buildServiceProgressEvent    | ClinicalWorkspace.jsx    | service toggle handler    | 1011
// buildSignOffStatusChangeEvent| ClinicalWorkspace.jsx    | handleSaveConsult         | ~1285
// buildFollowUpInceptionEvent  | ClinicalWorkspace.jsx    | handleSaveConsult         | 1323
// buildDraftDiscardedEvent     | ClinicalWorkspace.jsx    | handleDiscardDraft        | 1455
// buildDraftSavedEvent         | ClinicalWorkspace.jsx    | handleSaveDraft           | ~1408
// buildDraftResumedEvent       | ClinicalWorkspace.jsx    | handleResumeDraft         | ~1449
// buildAmendmentEvent          | ClinicalWorkspace.jsx    | handleSubmitAmendment     | 1507
// buildWalkInInceptionEvent    | WalkInModal.jsx          | buildApptPayload          | 258
// buildCheckInEvent            | AssignStaffModal.jsx     | check-in transaction      | 212
// buildSiblingCheckInEvent     | AssignStaffModal.jsx     | sibling loop              | 243
// buildCheckoutEvent           | POSModal.jsx             | individual checkout       | 626
// buildGroupCheckoutEvent      | POSModal.jsx             | group checkout            | 582
// buildRescheduleUndoEvent     | Records.jsx              | handleUndoReschedule      | 327
// buildAddendumEvent           | Records.jsx              | handleAddAddendum         | 364
// buildBulkReassignEvent       | Records.jsx              | handleBulkReassign        | 463
// buildRecordsIdentityEditEvent| Records.jsx              | identity edit JSX         | 948
