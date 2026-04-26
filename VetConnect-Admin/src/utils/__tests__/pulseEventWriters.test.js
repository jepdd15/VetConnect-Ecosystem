/**
 * pulseEventWriters.test.js — Contract tests for pulse event construction correctness.
 *
 * T3.76: Validates that every pulse event write site in the admin codebase produces
 * a structurally correct, semantically consistent event object.
 *
 * Strategy: builder functions in pulseEventBuilders.js mirror each production
 * handler's event construction. These tests assert against those builders.
 * No production files are modified; no Firestore stack is instantiated.
 *
 * ~245 tests across 6 describe blocks (Phases 2–6).
 *
 * Depends on:
 *   - T3.14 (Vitest configured, pulseUtils.js tested)
 *   - pulseEventBuilders.js (this directory)
 */

// Mock firebase/firestore BEFORE importing builders (which import pulseUtils → Timestamp)
vi.mock('firebase/firestore', () => ({
  Timestamp: {
    now: () => ({ seconds: 1700000000, nanoseconds: 0, toDate: () => new Date(1700000000 * 1000) }),
    fromDate: (d) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0, toDate: () => d }),
  },
}));

import {
  // useQueueActions.js builders
  buildStatusChangeEvent,
  buildCorrectionEvent,
  buildNoShowEvent,
  buildRejectEvent,
  buildERInceptionEvent,
  buildDeferEvent,
  buildRescheduleEvent,
  // Queue.jsx builders
  buildTriageCarryoverEvent,
  buildTriageInceptionEvent,
  buildTriageTerminalEvent,
  buildDispenseVerifiedEvent,
  buildDispenseFlagEvent,
  buildFlagResolvedEvent,
  buildInlineRescheduleEvent,
  buildIdentityEditEvent,
  // ClinicalWorkspace.jsx builders
  buildServiceProgressEvent,
  buildSignOffStatusChangeEvent,
  buildFollowUpInceptionEvent,
  buildDraftDiscardedEvent,
  buildAmendmentEvent,
  // WalkInModal.jsx builders
  buildWalkInInceptionEvent,
  // AssignStaffModal.jsx builders
  buildCheckInEvent,
  buildSiblingCheckInEvent,
  // POSModal.jsx builders
  buildCheckoutEvent,
  buildGroupCheckoutEvent,
  // Records.jsx builders
  buildRescheduleUndoEvent,
  buildAddendumEvent,
  buildBulkReassignEvent,
  buildRecordsIdentityEditEvent,
} from './pulseEventBuilders';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const STAFF_ID   = 'staff-uid-001';
const STAFF_NAME = 'Dr. Reyes';
const MOCK_TIMESTAMP = { seconds: 1700000000, nanoseconds: 0, toDate: () => new Date(1700000000 * 1000) };

// ---------------------------------------------------------------------------
// Phase 2: Core contract tests — createPulseEvent callers
// ---------------------------------------------------------------------------

describe('Phase 2A: STATUS_CHANGE via createPulseEvent (W1, W3, W4, W6, W7)', () => {
  it('2A.1 buildStatusChangeEvent → type is STATUS_CHANGE', () => {
    const event = buildStatusChangeEvent({ fromStatus: 'arrived', toStatus: 'in-consult', staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.type).toBe('STATUS_CHANGE');
  });

  it('2A.2 buildStatusChangeEvent → fromStatus and toStatus match inputs', () => {
    const event = buildStatusChangeEvent({ fromStatus: 'arrived', toStatus: 'in-consult', staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.fromStatus).toBe('arrived');
    expect(event.toStatus).toBe('in-consult');
  });

  it('2A.3 buildStatusChangeEvent → staffId and staffName are propagated', () => {
    const event = buildStatusChangeEvent({ fromStatus: 'pending', toStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.staffId).toBe(STAFF_ID);
    expect(event.staffName).toBe(STAFF_NAME);
  });

  it('2A.4 buildStatusChangeEvent → eventId matches pulse_STATUS_CHANGE_{timestamp}_{random} format', () => {
    const event = buildStatusChangeEvent({ fromStatus: 'pending', toStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.eventId).toMatch(/^pulse_STATUS_CHANGE_\d+_[a-z0-9]{7}$/);
  });

  it('2A.5 buildStatusChangeEvent → timestamp is the mocked Timestamp object', () => {
    const event = buildStatusChangeEvent({ fromStatus: 'pending', toStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.timestamp).toBeDefined();
    expect(event.timestamp.seconds).toBe(1700000000);
  });

  it('2A.6 buildStatusChangeEvent → note field is a non-empty string', () => {
    const event = buildStatusChangeEvent({ fromStatus: 'arrived', toStatus: 'in-consult', staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(typeof event.note).toBe('string');
    expect(event.note.length).toBeGreaterThan(0);
  });

  it('2A.7 buildStatusChangeEvent({ isOnHold: true }) → note contains "on-hold" or "Pause Engine"', () => {
    const event = buildStatusChangeEvent({ fromStatus: 'in-consult', toStatus: 'on-hold', staffId: STAFF_ID, staffName: STAFF_NAME, isOnHold: true });
    expect(event.note).toMatch(/on-hold|Pause Engine/);
  });

  it('2A.8 buildNoShowEvent → toStatus is no-show', () => {
    const event = buildNoShowEvent({ fromStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Patient did not call' });
    expect(event.toStatus).toBe('no-show');
  });

  it('2A.9 buildNoShowEvent → note contains the provided reason string', () => {
    const reason = 'Patient did not call';
    const event = buildNoShowEvent({ fromStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, reason });
    expect(event.note).toContain(reason);
  });

  it('2A.10 buildRejectEvent → toStatus is cancelled', () => {
    const event = buildRejectEvent({ fromStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Owner request', isForensic: false });
    expect(event.toStatus).toBe('cancelled');
  });

  it('2A.11 buildRejectEvent({ isForensic: true }) → note starts with "Forensic Triage Cleanup"', () => {
    const event = buildRejectEvent({ fromStatus: 'arrived', staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Stale record', isForensic: true });
    expect(event.note).toMatch(/^Forensic Triage Cleanup/);
  });

  it('2A.12 buildRejectEvent({ isForensic: false }) → note is the plain reason', () => {
    const reason = 'Owner changed their mind';
    const event = buildRejectEvent({ fromStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, reason, isForensic: false });
    expect(event.note).toBe(reason);
  });

  it('2A.13 buildDeferEvent → toStatus is "pending (deferred)"', () => {
    const event = buildDeferEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Owner unavailable', triageKey: '2026-04-27' });
    expect(event.toStatus).toBe('pending (deferred)');
  });

  it('2A.14 buildDeferEvent → note contains triageKey and reason', () => {
    const triageKey = '2026-04-27';
    const reason = 'Owner unavailable';
    const event = buildDeferEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, reason, triageKey });
    expect(event.note).toContain(triageKey);
    expect(event.note).toContain(reason);
  });

  it('2A.15 buildRescheduleEvent → note contains "SCHEDULE SHIFT" and the reason', () => {
    const reason = 'Vet unavailable';
    const event = buildRescheduleEvent({ fromStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, reason, newDateStr: '4/28/2026, 10:00:00 AM' });
    expect(event.note).toContain('SCHEDULE SHIFT');
    expect(event.note).toContain(reason);
  });

  it('2A.16 buildRescheduleEvent → fromStatus matches input', () => {
    const event = buildRescheduleEvent({ fromStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Conflict', newDateStr: '4/28/2026, 10:00:00 AM' });
    expect(event.fromStatus).toBe('confirmed');
  });
});

describe('Phase 2B: CORRECTION (W2)', () => {
  it('2B.1 buildCorrectionEvent → type is CORRECTION', () => {
    const event = buildCorrectionEvent({ fromStatus: 'in-consult', toStatus: 'arrived', staffId: STAFF_ID, staffName: STAFF_NAME, correctedEventId: 'evt-123', wasTerminal: false });
    expect(event.type).toBe('CORRECTION');
  });

  it('2B.2 buildCorrectionEvent → correctedEventId is present and matches input', () => {
    const correctedEventId = 'pulse_STATUS_CHANGE_1700000000_abc1234';
    const event = buildCorrectionEvent({ fromStatus: 'in-consult', toStatus: 'arrived', staffId: STAFF_ID, staffName: STAFF_NAME, correctedEventId, wasTerminal: false });
    expect(event.correctedEventId).toBe(correctedEventId);
  });

  it('2B.3 buildCorrectionEvent → isCorrection is true', () => {
    const event = buildCorrectionEvent({ fromStatus: 'in-consult', toStatus: 'arrived', staffId: STAFF_ID, staffName: STAFF_NAME, correctedEventId: 'evt-1', wasTerminal: false });
    expect(event.isCorrection).toBe(true);
  });

  it('2B.4 buildCorrectionEvent({ wasTerminal: true }) → note contains "TERMINAL REVERSAL" and "(seal cleared)"', () => {
    const event = buildCorrectionEvent({ fromStatus: 'completed', toStatus: 'billing', staffId: STAFF_ID, staffName: STAFF_NAME, revertReason: 'Billing error', correctedEventId: 'evt-1', wasTerminal: true });
    expect(event.note).toContain('TERMINAL REVERSAL');
    expect(event.note).toContain('(seal cleared)');
  });

  it('2B.5 buildCorrectionEvent({ wasTerminal: false }) → note contains "REVERSION" but not "TERMINAL"', () => {
    const event = buildCorrectionEvent({ fromStatus: 'in-consult', toStatus: 'arrived', staffId: STAFF_ID, staffName: STAFF_NAME, revertReason: 'Wrong status', correctedEventId: 'evt-1', wasTerminal: false });
    expect(event.note).toContain('REVERSION');
    expect(event.note).not.toContain('TERMINAL');
  });

  it('2B.6 buildCorrectionEvent → fromStatus and toStatus match inputs', () => {
    const event = buildCorrectionEvent({ fromStatus: 'in-consult', toStatus: 'arrived', staffId: STAFF_ID, staffName: STAFF_NAME, correctedEventId: 'evt-1', wasTerminal: false });
    expect(event.fromStatus).toBe('in-consult');
    expect(event.toStatus).toBe('arrived');
  });
});

describe('Phase 2C: DISPENSING_FLAGGED / FLAG_RESOLVED (W13, W14)', () => {
  it('2C.1 buildDispenseFlagEvent → type is DISPENSING_FLAGGED', () => {
    const event = buildDispenseFlagEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Wrong drug listed' });
    expect(event.type).toBe('DISPENSING_FLAGGED');
  });

  it('2C.2 buildDispenseFlagEvent → note contains the provided reason', () => {
    const reason = 'Wrong drug listed';
    const event = buildDispenseFlagEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, reason });
    expect(event.note).toContain(reason);
  });

  it('2C.3 buildDispenseFlagEvent → staffId and staffName are propagated', () => {
    const event = buildDispenseFlagEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Needs vet confirmation' });
    expect(event.staffId).toBe(STAFF_ID);
    expect(event.staffName).toBe(STAFF_NAME);
  });

  it('2C.4 buildFlagResolvedEvent → type is FLAG_RESOLVED', () => {
    const event = buildFlagResolvedEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, note: 'Vet confirmed dosage' });
    expect(event.type).toBe('FLAG_RESOLVED');
  });

  it('2C.5 buildFlagResolvedEvent → note defaults to "Hold resolved" when none provided', () => {
    const event = buildFlagResolvedEvent({ staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.note).toBe('Hold resolved');
  });
});

// ---------------------------------------------------------------------------
// Phase 3: Manual object tests — INCEPTION events
// ---------------------------------------------------------------------------

describe('Phase 3A: quickAdmitER INCEPTION (W5)', () => {
  it('3A.1 buildERInceptionEvent → type is INCEPTION', () => {
    const event = buildERInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.type).toBe('INCEPTION');
  });

  it('3A.2 buildERInceptionEvent → toStatus is arrived', () => {
    const event = buildERInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.toStatus).toBe('arrived');
  });

  it('3A.3 buildERInceptionEvent → eventId starts with pulse_inception_', () => {
    const event = buildERInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.eventId).toMatch(/^pulse_inception_/);
  });

  it('3A.4 buildERInceptionEvent → has timestamp property', () => {
    const event = buildERInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.timestamp).toBeDefined();
    expect(event.timestamp.seconds).toBeDefined();
  });

  it('3A.5 buildERInceptionEvent → note contains "Emergency"', () => {
    const event = buildERInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.note).toContain('Emergency');
  });

  it('3A.6 buildERInceptionEvent → does NOT have fromStatus (inception = birth)', () => {
    const event = buildERInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event).not.toHaveProperty('fromStatus');
  });
});

describe('Phase 3B: EOD triage INCEPTION (W10)', () => {
  it('3B.1 buildTriageInceptionEvent({ action: "hospitalize" }) → toStatus is confined', () => {
    const event = buildTriageInceptionEvent({ action: 'hospitalize', staffId: STAFF_ID, staffName: STAFF_NAME, actionLabel: 'CONFINE', originApptId: 'appt-abc123' });
    expect(event.toStatus).toBe('confined');
  });

  it('3B.2 buildTriageInceptionEvent({ action: "reschedule" }) → toStatus is confirmed', () => {
    const event = buildTriageInceptionEvent({ action: 'reschedule', staffId: STAFF_ID, staffName: STAFF_NAME, actionLabel: 'RESCHEDULE', originApptId: 'appt-abc123' });
    expect(event.toStatus).toBe('confirmed');
  });

  it('3B.3 buildTriageInceptionEvent → note contains originApptId', () => {
    const originApptId = 'appt-abc123';
    const event = buildTriageInceptionEvent({ action: 'carryover', staffId: STAFF_ID, staffName: STAFF_NAME, actionLabel: 'CARRY-OVER', originApptId });
    expect(event.note).toContain(originApptId);
  });

  it('3B.4 buildTriageInceptionEvent with deposit → note contains deposit amount and method', () => {
    const depositEntry = { amount: 500, method: 'GCash' };
    const event = buildTriageInceptionEvent({ action: 'carryover', staffId: STAFF_ID, staffName: STAFF_NAME, actionLabel: 'CARRY-OVER', originApptId: 'appt-1', depositEntry });
    expect(event.note).toContain('500');
    expect(event.note).toContain('GCash');
  });

  it('3B.5 buildTriageInceptionEvent without deposit → note does NOT contain "₱"', () => {
    const event = buildTriageInceptionEvent({ action: 'carryover', staffId: STAFF_ID, staffName: STAFF_NAME, actionLabel: 'CARRY-OVER', originApptId: 'appt-1' });
    expect(event.note).not.toContain('₱');
  });
});

describe('Phase 3C: Follow-up INCEPTION (W18)', () => {
  it('3C.1 buildFollowUpInceptionEvent → type is STATUS_CHANGE (not INCEPTION)', () => {
    const event = buildFollowUpInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, originApptId: 'appt-parent-001' });
    expect(event.type).toBe('STATUS_CHANGE');
  });

  it('3C.2 buildFollowUpInceptionEvent → toStatus is pending', () => {
    const event = buildFollowUpInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, originApptId: 'appt-parent-001' });
    expect(event.toStatus).toBe('pending');
  });

  it('3C.3 buildFollowUpInceptionEvent → note contains origin appointment ID', () => {
    const originApptId = 'appt-parent-001';
    const event = buildFollowUpInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, originApptId });
    expect(event.note).toContain(originApptId);
  });

  it('3C.4 buildFollowUpInceptionEvent → does NOT have fromStatus', () => {
    const event = buildFollowUpInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, originApptId: 'appt-parent-001' });
    expect(event).not.toHaveProperty('fromStatus');
  });
});

describe('Phase 3D: Walk-in INCEPTION (W21)', () => {
  it('3D.1 buildWalkInInceptionEvent → type is INCEPTION', () => {
    const event = buildWalkInInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, weight: 5, isEmergency: false, triageNotes: 'Limping' });
    expect(event.type).toBe('INCEPTION');
  });

  it('3D.2 buildWalkInInceptionEvent → toStatus is arrived', () => {
    const event = buildWalkInInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, weight: 5, isEmergency: false, triageNotes: 'Limping' });
    expect(event.toStatus).toBe('arrived');
  });

  it('3D.3 buildWalkInInceptionEvent({ isEmergency: true }) → note contains "URGENT ER"', () => {
    const event = buildWalkInInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, weight: 3, isEmergency: true, triageNotes: 'Convulsing' });
    expect(event.note).toContain('URGENT ER');
  });

  it('3D.4 buildWalkInInceptionEvent({ isEmergency: false }) → note does NOT contain "URGENT"', () => {
    const event = buildWalkInInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, weight: 5, isEmergency: false, triageNotes: 'Routine check' });
    expect(event.note).not.toContain('URGENT');
  });

  it('3D.5 buildWalkInInceptionEvent with group → note contains group index and size', () => {
    const event = buildWalkInInceptionEvent({
      staffId: STAFF_ID, staffName: STAFF_NAME, weight: 4, isEmergency: false,
      triageNotes: 'Itching', visitGroupId: 'vg-001', groupIndex: 0, groupSize: 3,
    });
    expect(event.note).toContain('Group');
    expect(event.note).toContain('1/3');
  });

  it('3D.6 buildWalkInInceptionEvent without group → note does NOT contain "Group"', () => {
    const event = buildWalkInInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, weight: 5, isEmergency: false, triageNotes: 'Coughing' });
    expect(event.note).not.toContain('Group');
  });

  it('3D.7 buildWalkInInceptionEvent → note contains the weight value', () => {
    const event = buildWalkInInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, weight: 12.5, isEmergency: false, triageNotes: 'Vomiting' });
    expect(event.note).toContain('12.5');
  });
});

// ---------------------------------------------------------------------------
// Phase 4: Manual object tests — Triage & Queue events
// ---------------------------------------------------------------------------

describe('Phase 4A: EOD triage carryover (W8/W9)', () => {
  it('4A.1 buildTriageCarryoverEvent({ action: "defer" }) → type is TRIAGE_DEFER', () => {
    const event = buildTriageCarryoverEvent({ action: 'defer', rawStatus: 'pending', staffId: STAFF_ID, staffName: STAFF_NAME, actionLabel: 'DEFER', dateStr: 'Mon Apr 27 2026', reason: 'Not ready' });
    expect(event.type).toBe('TRIAGE_DEFER');
  });

  it('4A.2 buildTriageCarryoverEvent({ action: "hospitalize" }) → type is TRIAGE_CONFINE', () => {
    const event = buildTriageCarryoverEvent({ action: 'hospitalize', rawStatus: 'arrived', staffId: STAFF_ID, staffName: STAFF_NAME, actionLabel: 'CONFINE', dateStr: 'Mon Apr 27 2026', reason: 'Post-op monitoring' });
    expect(event.type).toBe('TRIAGE_CONFINE');
  });

  it('4A.3 buildTriageCarryoverEvent({ action: "carryover" }) → type is TRIAGE_CARRYOVER', () => {
    const event = buildTriageCarryoverEvent({ action: 'carryover', rawStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, actionLabel: 'CARRY-OVER', dateStr: 'Mon Apr 27 2026', reason: 'Rescheduled' });
    expect(event.type).toBe('TRIAGE_CARRYOVER');
  });

  it('4A.4 buildTriageCarryoverEvent({ action: "reschedule" }) → type is TRIAGE_RESCHEDULE', () => {
    const event = buildTriageCarryoverEvent({ action: 'reschedule', rawStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, actionLabel: 'RESCHEDULE', dateStr: 'Mon Apr 27 2026', reason: 'Vet conflict' });
    expect(event.type).toBe('TRIAGE_RESCHEDULE');
  });

  it('4A.5 buildTriageCarryoverEvent → toStatus is always carried-over', () => {
    const event = buildTriageCarryoverEvent({ action: 'carryover', rawStatus: 'arrived', staffId: STAFF_ID, staffName: STAFF_NAME, actionLabel: 'CARRY-OVER', dateStr: 'Mon Apr 27 2026', reason: 'Active patient' });
    expect(event.toStatus).toBe('carried-over');
  });

  it('4A.6 buildTriageCarryoverEvent → fromStatus matches input rawStatus', () => {
    const rawStatus = 'in-consult';
    const event = buildTriageCarryoverEvent({ action: 'defer', rawStatus, staffId: STAFF_ID, staffName: STAFF_NAME, actionLabel: 'DEFER', dateStr: 'Mon Apr 27 2026', reason: 'Ongoing' });
    expect(event.fromStatus).toBe(rawStatus);
  });

  it('4A.7 buildTriageCarryoverEvent → note contains actionLabel, dateStr, and reason', () => {
    const actionLabel = 'CARRY-OVER';
    const dateStr = 'Mon Apr 27 2026';
    const reason = 'Follow-up needed';
    const event = buildTriageCarryoverEvent({ action: 'carryover', rawStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, actionLabel, dateStr, reason });
    expect(event.note).toContain(actionLabel);
    expect(event.note).toContain(dateStr);
    expect(event.note).toContain(reason);
  });

  it('4A.8 buildTriageCarryoverEvent → eventId starts with pulse_carryover_', () => {
    const event = buildTriageCarryoverEvent({ action: 'defer', rawStatus: 'pending', staffId: STAFF_ID, staffName: STAFF_NAME, actionLabel: 'DEFER', dateStr: 'Mon Apr 27 2026', reason: 'Pending' });
    expect(event.eventId).toMatch(/^pulse_carryover_/);
  });
});

describe('Phase 4B: EOD triage terminal (W11)', () => {
  it('4B.1 buildTriageTerminalEvent({ action: "no-show" }) → type is TRIAGE_NO_SHOW', () => {
    const event = buildTriageTerminalEvent({ action: 'no-show', rawStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Did not come' });
    expect(event.type).toBe('TRIAGE_NO_SHOW');
  });

  it('4B.2 buildTriageTerminalEvent({ action: "cancel" }) → type is TRIAGE_CANCELLED', () => {
    const event = buildTriageTerminalEvent({ action: 'cancel', rawStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Owner cancelled' });
    expect(event.type).toBe('TRIAGE_CANCELLED');
  });

  it('4B.3 buildTriageTerminalEvent → toStatus matches the final status per action', () => {
    const nsEvent = buildTriageTerminalEvent({ action: 'no-show', rawStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'No response' });
    expect(nsEvent.toStatus).toBe('no-show');

    const cancelEvent = buildTriageTerminalEvent({ action: 'cancel', rawStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Request' });
    expect(cancelEvent.toStatus).toBe('cancelled');
  });

  it('4B.4 buildTriageTerminalEvent → note contains "Shift Cleanup Sign-off"', () => {
    const event = buildTriageTerminalEvent({ action: 'no-show', rawStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Did not arrive' });
    expect(event.note).toContain('Shift Cleanup Sign-off');
  });
});

describe('Phase 4C: Dispense verified (W12)', () => {
  it('4C.1 buildDispenseVerifiedEvent → type is STATUS_CHANGE', () => {
    const event = buildDispenseVerifiedEvent({ staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.type).toBe('STATUS_CHANGE');
  });

  it('4C.2 buildDispenseVerifiedEvent → fromStatus is dispensing', () => {
    const event = buildDispenseVerifiedEvent({ staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.fromStatus).toBe('dispensing');
  });

  it('4C.3 buildDispenseVerifiedEvent → toStatus is billing', () => {
    const event = buildDispenseVerifiedEvent({ staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.toStatus).toBe('billing');
  });

  it('4C.4 buildDispenseVerifiedEvent → eventId starts with pulse_status_', () => {
    const event = buildDispenseVerifiedEvent({ staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.eventId).toMatch(/^pulse_status_/);
  });
});

describe('Phase 4D: Inline reschedule (W15)', () => {
  it('4D.1 buildInlineRescheduleEvent({ isCarryOver: true }) → toStatus is carried-over', () => {
    const event = buildInlineRescheduleEvent({ isCarryOver: true, staffId: STAFF_ID, staffName: STAFF_NAME, updatedDayStr: '2026-04-28', additionalWaitMins: 45, auditReason: 'Active patient' });
    expect(event.toStatus).toBe('carried-over');
  });

  it('4D.2 buildInlineRescheduleEvent({ isCarryOver: false }) → toStatus is confirmed', () => {
    const event = buildInlineRescheduleEvent({ isCarryOver: false, staffId: STAFF_ID, staffName: STAFF_NAME, updatedDayStr: '2026-04-28', additionalWaitMins: 0, auditReason: 'Convenience' });
    expect(event.toStatus).toBe('confirmed');
  });

  it('4D.3 buildInlineRescheduleEvent → has shiftNote equal to "shifted"', () => {
    const event = buildInlineRescheduleEvent({ isCarryOver: false, staffId: STAFF_ID, staffName: STAFF_NAME, updatedDayStr: '2026-04-28', additionalWaitMins: 0, auditReason: 'Convenience' });
    expect(event.shiftNote).toBe('shifted');
  });

  it('4D.4 buildInlineRescheduleEvent (carry-over) → note contains "CLINICAL CARRY-OVER" and wait mins', () => {
    const event = buildInlineRescheduleEvent({ isCarryOver: true, staffId: STAFF_ID, staffName: STAFF_NAME, updatedDayStr: '2026-04-28', additionalWaitMins: 30, auditReason: 'Active case' });
    expect(event.note).toContain('CLINICAL CARRY-OVER');
    expect(event.note).toContain('30m');
  });

  it('4D.5 buildInlineRescheduleEvent (normal) → note contains "Manual Clinical Shift"', () => {
    const event = buildInlineRescheduleEvent({ isCarryOver: false, staffId: STAFF_ID, staffName: STAFF_NAME, updatedDayStr: '2026-04-28', additionalWaitMins: 0, auditReason: 'Patient request' });
    expect(event.note).toContain('Manual Clinical Shift');
  });
});

// ---------------------------------------------------------------------------
// Phase 5: Manual object tests — Clinical & Records events
// ---------------------------------------------------------------------------

describe('Phase 5A: Identity edit (W16)', () => {
  it('5A.1 buildIdentityEditEvent({ isQuickAdmit: false }) → type is IDENTITY_EDIT', () => {
    const event = buildIdentityEditEvent({ isQuickAdmit: false, staffId: STAFF_ID, staffName: STAFF_NAME, changedFields: ['petName'] });
    expect(event.type).toBe('IDENTITY_EDIT');
  });

  it('5A.2 buildIdentityEditEvent({ isQuickAdmit: true }) → type is IDENTITY_HEALING', () => {
    const event = buildIdentityEditEvent({ isQuickAdmit: true, staffId: STAFF_ID, staffName: STAFF_NAME, changedFields: ['petName', 'ownerName'] });
    expect(event.type).toBe('IDENTITY_HEALING');
  });

  it('5A.3 buildIdentityEditEvent with changed fields → note lists field names', () => {
    const changedFields = ['petName', 'ownerPhone', 'petBreed'];
    const event = buildIdentityEditEvent({ isQuickAdmit: false, staffId: STAFF_ID, staffName: STAFF_NAME, changedFields });
    expect(event.note).toContain('petName');
    expect(event.note).toContain('ownerPhone');
    expect(event.note).toContain('petBreed');
  });

  it('5A.4 buildIdentityEditEvent with empty changedFields → note says "no changes detected"', () => {
    const event = buildIdentityEditEvent({ isQuickAdmit: false, staffId: STAFF_ID, staffName: STAFF_NAME, changedFields: [] });
    expect(event.note).toContain('no changes detected');
  });

  it('5A.5 buildIdentityEditEvent({ isQuickAdmit: true }) → eventId contains "identity-healing"', () => {
    const event = buildIdentityEditEvent({ isQuickAdmit: true, staffId: STAFF_ID, staffName: STAFF_NAME, changedFields: ['petName'] });
    expect(event.eventId).toContain('identity-healing');
  });

  it('5A.6 buildIdentityEditEvent({ isQuickAdmit: false }) → eventId contains "identity-edit"', () => {
    const event = buildIdentityEditEvent({ isQuickAdmit: false, staffId: STAFF_ID, staffName: STAFF_NAME, changedFields: ['petName'] });
    expect(event.eventId).toContain('identity-edit');
  });
});

describe('Phase 5B: Service progress (W17)', () => {
  it('5B.1 buildServiceProgressEvent({ next: "in-progress" }) → type is SERVICE_STARTED', () => {
    const event = buildServiceProgressEvent({ svcId: 'svc-001', next: 'in-progress', staffId: STAFF_ID, staffName: STAFF_NAME, serviceName: 'Grooming' });
    expect(event.type).toBe('SERVICE_STARTED');
  });

  it('5B.2 buildServiceProgressEvent({ next: "completed" }) → type is SERVICE_COMPLETED', () => {
    const event = buildServiceProgressEvent({ svcId: 'svc-001', next: 'completed', staffId: STAFF_ID, staffName: STAFF_NAME, serviceName: 'Grooming' });
    expect(event.type).toBe('SERVICE_COMPLETED');
  });

  it('5B.3 buildServiceProgressEvent → has serviceId and serviceName fields', () => {
    const event = buildServiceProgressEvent({ svcId: 'svc-001', next: 'in-progress', staffId: STAFF_ID, staffName: STAFF_NAME, serviceName: 'Grooming' });
    expect(event.serviceId).toBe('svc-001');
    expect(event.serviceName).toBe('Grooming');
  });

  it('5B.4 buildServiceProgressEvent → eventId starts with pulse_svc-', () => {
    const event = buildServiceProgressEvent({ svcId: 'svc-001', next: 'in-progress', staffId: STAFF_ID, staffName: STAFF_NAME, serviceName: 'Grooming' });
    expect(event.eventId).toMatch(/^pulse_svc-/);
  });
});

describe('Phase 3B+: Sign-off STATUS_CHANGE (W17b / T3.78)', () => {
  it('W17b.1 buildSignOffStatusChangeEvent → type is STATUS_CHANGE', () => {
    const event = buildSignOffStatusChangeEvent({
      fromStatus: 'in-consult',
      toStatus: 'dispensing',
      staffId: STAFF_ID,
      staffName: STAFF_NAME,
    });
    expect(event.type).toBe('STATUS_CHANGE');
  });

  it('W17b.2 fromStatus defaults to in-consult when omitted', () => {
    const event = buildSignOffStatusChangeEvent({ toStatus: 'billing', staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.fromStatus).toBe('in-consult');
  });

  it('W17b.3 toStatus reflects dispensing path', () => {
    const event = buildSignOffStatusChangeEvent({ fromStatus: 'in-consult', toStatus: 'dispensing', staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.toStatus).toBe('dispensing');
  });

  it('W17b.4 toStatus reflects billing path', () => {
    const event = buildSignOffStatusChangeEvent({ fromStatus: 'in-consult', toStatus: 'billing', staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.toStatus).toBe('billing');
  });

  it('W17b.5 note contains sign-off context', () => {
    const event = buildSignOffStatusChangeEvent({ toStatus: 'dispensing', staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.note).toContain('sign-off');
    expect(event.note).toContain('dispensing');
  });

  it('W17b.6 has eventId with STATUS_CHANGE prefix', () => {
    const event = buildSignOffStatusChangeEvent({ toStatus: 'billing', staffId: STAFF_ID, staffName: STAFF_NAME });
    expect(event.eventId).toMatch(/^pulse_STATUS_CHANGE_/);
  });
});

describe('Phase 5C: Draft discarded (W19)', () => {
  it('5C.1 buildDraftDiscardedEvent → type is DRAFT_DISCARDED', () => {
    const event = buildDraftDiscardedEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, savedByName: 'Dr. Cruz', savedAt: null, savedByUid: null });
    expect(event.type).toBe('DRAFT_DISCARDED');
  });

  it('5C.2 buildDraftDiscardedEvent → note mentions the original drafter name', () => {
    const savedByName = 'Dr. Cruz';
    const event = buildDraftDiscardedEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, savedByName, savedAt: null, savedByUid: null });
    expect(event.note).toContain(savedByName);
  });

  it('5C.3 buildDraftDiscardedEvent → has discardedDraftSavedAt and discardedDraftSavedBy fields', () => {
    const savedAt = new Date(1700000000 * 1000);
    const event = buildDraftDiscardedEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, savedByName: 'Dr. Cruz', savedAt, savedByUid: 'uid-456' });
    expect(event).toHaveProperty('discardedDraftSavedAt');
    expect(event).toHaveProperty('discardedDraftSavedBy');
    expect(event.discardedDraftSavedBy).toBe('uid-456');
  });

  it('5C.4 buildDraftDiscardedEvent with null savedAt → discardedDraftSavedAt is null', () => {
    const event = buildDraftDiscardedEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, savedByName: 'Dr. Cruz', savedAt: null, savedByUid: null });
    expect(event.discardedDraftSavedAt).toBeNull();
  });
});

describe('Phase 5D: Clinical amendment (W20)', () => {
  it('5D.1 buildAmendmentEvent → type is CLINICAL_AMENDMENT', () => {
    const event = buildAmendmentEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Dosage error', text: 'Corrected amoxicillin to 250mg' });
    expect(event.type).toBe('CLINICAL_AMENDMENT');
  });

  it('5D.2 buildAmendmentEvent → note contains truncated reason (40 chars) and text (80 chars)', () => {
    const reason = 'Dosage error';
    const text = 'Corrected amoxicillin to 250mg';
    const event = buildAmendmentEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, reason, text });
    expect(event.note).toContain(reason.slice(0, 40));
    expect(event.note).toContain(text.slice(0, 80));
  });

  it('5D.3 buildAmendmentEvent with long text → note is truncated correctly', () => {
    const reason = 'A'.repeat(60);
    const text = 'B'.repeat(100);
    const event = buildAmendmentEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, reason, text });
    // reason truncated to 40, text to 80
    expect(event.note).toContain('A'.repeat(40));
    expect(event.note).not.toContain('A'.repeat(41));
    expect(event.note).toContain('B'.repeat(80));
    expect(event.note).not.toContain('B'.repeat(81));
  });

  it('5D.4 buildAmendmentEvent → eventId starts with pulse_amend_', () => {
    const event = buildAmendmentEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Error', text: 'Fix' });
    expect(event.eventId).toMatch(/^pulse_amend_/);
  });
});

describe('Phase 5E: Checkout (W23, W24)', () => {
  it('5E.1 buildCheckoutEvent → type is CHECKOUT_COMPLETED', () => {
    const event = buildCheckoutEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, total: '1500.00', paymentMethod: 'Cash' });
    expect(event.type).toBe('CHECKOUT_COMPLETED');
  });

  it('5E.2 buildCheckoutEvent → note contains payment method and total', () => {
    const event = buildCheckoutEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, total: '1500.00', paymentMethod: 'GCash' });
    expect(event.note).toContain('1500.00');
    expect(event.note).toContain('GCash');
  });

  it('5E.3 buildCheckoutEvent → eventId starts with pulse_checkout_', () => {
    const event = buildCheckoutEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, total: '1500.00', paymentMethod: 'Cash' });
    expect(event.eventId).toMatch(/^pulse_checkout_/);
  });

  it('5E.4 buildGroupCheckoutEvent → type is CHECKOUT_COMPLETED', () => {
    const event = buildGroupCheckoutEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, subtotal: 750.0, paymentMethod: 'Cash' });
    expect(event.type).toBe('CHECKOUT_COMPLETED');
  });

  it('5E.5 buildGroupCheckoutEvent → note contains "Group checkout" and subtotal', () => {
    const event = buildGroupCheckoutEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, subtotal: 750.0, paymentMethod: 'Maya' });
    expect(event.note).toContain('Group checkout');
    expect(event.note).toContain('750.00');
  });
});

describe('Phase 5F: Check-in (W22a, W22b)', () => {
  it('5F.1 buildCheckInEvent({ isGroupCheckIn: false }) → note says "physically arrived and checked-in"', () => {
    const event = buildCheckInEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, isGroupCheckIn: false, siblingCount: 0, sharedNumber: 5 });
    expect(event.note).toContain('physically arrived and checked-in');
  });

  it('5F.2 buildCheckInEvent({ isGroupCheckIn: true }) → note contains "Group check-in" and queue number', () => {
    const event = buildCheckInEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, isGroupCheckIn: true, siblingCount: 2, sharedNumber: 7 });
    expect(event.note).toContain('Group check-in');
    expect(event.note).toContain('7');
  });

  it('5F.3 buildCheckInEvent → fromStatus is confirmed, toStatus is arrived', () => {
    const event = buildCheckInEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, isGroupCheckIn: false, siblingCount: 0, sharedNumber: 3 });
    expect(event.fromStatus).toBe('confirmed');
    expect(event.toStatus).toBe('arrived');
  });

  it('5F.4 buildSiblingCheckInEvent → note contains correct sibling index', () => {
    // siblingIndex=0, siblingCount=2 → note should say "(2/3)"
    const event = buildSiblingCheckInEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, siblingIndex: 0, siblingCount: 2, sharedNumber: 7 });
    expect(event.note).toContain('2/3');
  });
});

describe('Phase 5G: Records-only events (W25–W28)', () => {
  it('5G.1 buildRescheduleUndoEvent → type is RESCHEDULE_UNDO', () => {
    const event = buildRescheduleUndoEvent({ staffName: STAFF_NAME, staffId: STAFF_ID });
    expect(event.type).toBe('RESCHEDULE_UNDO');
  });

  it('5G.2 buildAddendumEvent → type is AUDIT_ADDENDUM', () => {
    const event = buildAddendumEvent({ staffName: STAFF_NAME, staffId: STAFF_ID, text: 'Patient improved after treatment' });
    expect(event.type).toBe('AUDIT_ADDENDUM');
  });

  it('5G.3 buildAddendumEvent → note is the trimmed input text', () => {
    const text = '  Patient improved after treatment  ';
    const event = buildAddendumEvent({ staffName: STAFF_NAME, staffId: STAFF_ID, text });
    expect(event.note).toBe(text.trim());
  });

  it('5G.4 buildBulkReassignEvent → type is STAFF_REASSIGN', () => {
    const event = buildBulkReassignEvent({ staffName: STAFF_NAME, staffId: STAFF_ID, vetName: 'Dr. Santos' });
    expect(event.type).toBe('STAFF_REASSIGN');
  });

  it('5G.5 buildBulkReassignEvent → note contains vet name', () => {
    const vetName = 'Dr. Santos';
    const event = buildBulkReassignEvent({ staffName: STAFF_NAME, staffId: STAFF_ID, vetName });
    expect(event.note).toContain(vetName);
  });

  it('5G.6 buildRecordsIdentityEditEvent → type is IDENTITY_EDIT', () => {
    const event = buildRecordsIdentityEditEvent({ staffName: STAFF_NAME, staffId: STAFF_ID });
    expect(event.type).toBe('IDENTITY_EDIT');
  });

  it('5G.7 All Records events → each has eventId starting with pulse_', () => {
    const events = [
      buildRescheduleUndoEvent({ staffName: STAFF_NAME, staffId: STAFF_ID }),
      buildAddendumEvent({ staffName: STAFF_NAME, staffId: STAFF_ID, text: 'Note' }),
      buildBulkReassignEvent({ staffName: STAFF_NAME, staffId: STAFF_ID, vetName: 'Dr. Santos' }),
      buildRecordsIdentityEditEvent({ staffName: STAFF_NAME, staffId: STAFF_ID }),
    ];
    events.forEach(event => {
      expect(event.eventId).toMatch(/^pulse_/);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 6: Cross-cutting contract tests — universal field presence
// ---------------------------------------------------------------------------

describe('Phase 6: Cross-cutting contract tests', () => {
  // Collect one instance of every builder to exercise all 28 write sites.
  const allEvents = [
    // useQueueActions.js (W1–W7)
    buildStatusChangeEvent({ fromStatus: 'arrived', toStatus: 'in-consult', staffId: STAFF_ID, staffName: STAFF_NAME }),
    buildCorrectionEvent({ fromStatus: 'in-consult', toStatus: 'arrived', staffId: STAFF_ID, staffName: STAFF_NAME, correctedEventId: 'evt-1', wasTerminal: false }),
    buildNoShowEvent({ fromStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'No call' }),
    buildRejectEvent({ fromStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Cancelled', isForensic: false }),
    buildERInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME }),
    buildDeferEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Not ready', triageKey: '2026-04-27' }),
    buildRescheduleEvent({ fromStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Conflict', newDateStr: '4/28/2026' }),
    // Queue.jsx (W8–W16)
    buildTriageCarryoverEvent({ action: 'defer', rawStatus: 'pending', staffId: STAFF_ID, staffName: STAFF_NAME, actionLabel: 'DEFER', dateStr: 'Mon Apr 27 2026', reason: 'Pending' }),
    buildTriageInceptionEvent({ action: 'carryover', staffId: STAFF_ID, staffName: STAFF_NAME, actionLabel: 'CARRY-OVER', originApptId: 'appt-abc' }),
    buildTriageTerminalEvent({ action: 'no-show', rawStatus: 'confirmed', staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'No response' }),
    buildDispenseVerifiedEvent({ staffId: STAFF_ID, staffName: STAFF_NAME }),
    buildDispenseFlagEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Wrong item' }),
    buildFlagResolvedEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, note: 'Confirmed OK' }),
    buildInlineRescheduleEvent({ isCarryOver: false, staffId: STAFF_ID, staffName: STAFF_NAME, updatedDayStr: '2026-04-28', additionalWaitMins: 0, auditReason: 'Request' }),
    buildIdentityEditEvent({ isQuickAdmit: false, staffId: STAFF_ID, staffName: STAFF_NAME, changedFields: ['petName'] }),
    // ClinicalWorkspace.jsx (W17–W20)
    buildServiceProgressEvent({ svcId: 'svc-1', next: 'in-progress', staffId: STAFF_ID, staffName: STAFF_NAME, serviceName: 'Checkup' }),
    buildSignOffStatusChangeEvent({ fromStatus: 'in-consult', toStatus: 'dispensing', staffId: STAFF_ID, staffName: STAFF_NAME }),
    buildFollowUpInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, originApptId: 'appt-parent' }),
    buildDraftDiscardedEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, savedByName: 'Dr. Cruz', savedAt: null, savedByUid: null }),
    buildAmendmentEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, reason: 'Error', text: 'Correction' }),
    // WalkInModal.jsx (W21)
    buildWalkInInceptionEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, weight: 5, isEmergency: false, triageNotes: 'Limping' }),
    // AssignStaffModal.jsx (W22a–W22b)
    buildCheckInEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, isGroupCheckIn: false, siblingCount: 0, sharedNumber: 1 }),
    buildSiblingCheckInEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, siblingIndex: 0, siblingCount: 1, sharedNumber: 1 }),
    // POSModal.jsx (W23–W24)
    buildCheckoutEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, total: '1000.00', paymentMethod: 'Cash' }),
    buildGroupCheckoutEvent({ staffId: STAFF_ID, staffName: STAFF_NAME, subtotal: 500.0, paymentMethod: 'GCash' }),
    // Records.jsx (W25–W28)
    buildRescheduleUndoEvent({ staffName: STAFF_NAME, staffId: STAFF_ID }),
    buildAddendumEvent({ staffName: STAFF_NAME, staffId: STAFF_ID, text: 'Note' }),
    buildBulkReassignEvent({ staffName: STAFF_NAME, staffId: STAFF_ID, vetName: 'Dr. Santos' }),
    buildRecordsIdentityEditEvent({ staffName: STAFF_NAME, staffId: STAFF_ID }),
  ];

  it.each(allEvents.map((e, i) => [i, e]))('event %i → eventId is a string starting with pulse_', (_i, event) => {
    expect(typeof event.eventId).toBe('string');
    expect(event.eventId).toMatch(/^pulse_/);
  });

  it.each(allEvents.map((e, i) => [i, e]))('event %i → type is a non-empty uppercase string', (_i, event) => {
    expect(typeof event.type).toBe('string');
    expect(event.type.length).toBeGreaterThan(0);
    expect(event.type).toBe(event.type.toUpperCase());
  });

  it.each(allEvents.map((e, i) => [i, e]))('event %i → timestamp is defined with seconds property', (_i, event) => {
    expect(event.timestamp).toBeDefined();
    expect(event.timestamp.seconds).toBeDefined();
  });

  it.each(allEvents.map((e, i) => [i, e]))('event %i → staffId and staffName are strings', (_i, event) => {
    expect(typeof event.staffId).toBe('string');
    expect(typeof event.staffName).toBe('string');
  });

  it('all 29 builders produce unique eventIds', () => {
    const ids = allEvents.map(e => e.eventId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  const VALID_PULSE_TYPES = new Set([
    'STATUS_CHANGE',
    'INCEPTION',
    'CORRECTION',
    'CHECKOUT_COMPLETED',
    'CLINICAL_AMENDMENT',
    'DRAFT_DISCARDED',
    'SERVICE_STARTED',
    'SERVICE_COMPLETED',
    'DISPENSING_FLAGGED',
    'FLAG_RESOLVED',
    'IDENTITY_EDIT',
    'IDENTITY_HEALING',
    'TRIAGE_DEFER',
    'TRIAGE_CONFINE',
    'TRIAGE_CARRYOVER',
    'TRIAGE_RESCHEDULE',
    'TRIAGE_NO_SHOW',
    'TRIAGE_CANCELLED',
    'RESCHEDULE_UNDO',
    'AUDIT_ADDENDUM',
    'STAFF_REASSIGN',
  ]);

  it.each(allEvents.map((e, i) => [i, e]))('event %i → type is in the valid pulse type set', (_i, event) => {
    expect(VALID_PULSE_TYPES.has(event.type)).toBe(true);
  });
});
