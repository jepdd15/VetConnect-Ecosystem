---
name: CW4 Phase B — Review Findings
description: T2.17/18/19/20/35/46/46.1/49/53/54/56/57a/97/99/107/109/111 review: rebook rename complete, soapRef dead ref, optimistic lock first-draft bypass, createPulseEvent exported but unused, batch date picker lacks color cues
type: project
---

CW4 Phase B was reviewed (17 tasks). Overall quality is high — correctness and regression checks passed on the critical items.

**Why:** Final batch of ClinicalWorkspace work. Key concerns were regression from dead-code removal (T2.18) and rebook→reschedule/carryover rename (T2.46.1).

**How to apply:** Findings below are the remaining issues for the next implementation sprint.

## Issues Found

### T2.18 — soapRef is dead (low severity)
`soapRef` was not removed. The plan noted it as dead (no scrollTo consumer), but the ref is now attached to the SOAP column Box at line 1699 — which appears to be used for layout (not scrollTo). The plan also noted `dischargeRef` as dead — it is NOT present in the file at all. So dischargeRef was correctly removed. soapRef was partially cleaned: attached to DOM but never read by any handler. Not breaking, just residual.

### T2.19 — Optimistic lock bypass on first draft (warning)
`handleSaveDraft` version check: `if (serverVersion > 0 && localVersion > 0 && serverVersion !== localVersion)`. The guard requires BOTH sides to be > 0. On the very first draft save for a fresh appointment, `patient.prescribedItemsVersion` is null/undefined → `localVersion = 0`. This means the lock is skipped entirely on the first save. Two tabs can clobber each other on the first save. Subsequent saves are protected. Low real-world risk but the condition is slightly weaker than intended.

### T2.35 — useAncestorChain: forward walk infinite loop risk (theoretical)
If a data anomaly creates a circular chain (appointment A's descendant points back to A), the `while (fwdDepth < MAX_DEPTH)` guard (MAX_DEPTH=10) correctly caps it. The backward walk is also capped. No production bug, but worth documenting.

### T2.46.1 — rebook rename: comment-only remnant at line 575
One `rebook` string remains in EndOfDayModal.jsx at line 575, inside a comment: `// Look for original or rebooked schedule matching THIS day`. This is documentation, not code — no functional impact. All action values are correctly renamed.

### T2.49 — Inline ancestor chain in handleFetchHistory still exists
EndOfDayModal.jsx still has `handleFetchHistory` (line ~1032) which does its own Firestore ancestry walk (using `originApptId` + fallback query). This is separate from `useAncestorChain`. T2.49 required removing the inline walker — the AuditPatientCard now uses the hook, but the `handleFetchHistory` function (used for the "SHOW ANCESTRY" button) still has an inline walk. T2.49 is partially done.

### T2.56 — Batch date picker missing color cues
The per-card individual date picker (line 794) correctly applies `getDatePickerStyle`. But the BATCH date picker in the staging area (line 1344) uses a raw inline style with no `getDatePickerStyle` call — closed/today color cues are absent on batch operations.

### T2.109 — createPulseEvent exported but unused
`createPulseEvent` is exported from pulseUtils.js but no call site in the codebase uses it yet. The plan required "at least 3 call sites refactored." Zero refactors done. The factory is available but the migration work is deferred.

### T2.111 — ClinicalTimeline used only once
ClinicalTimeline is imported and used in EndOfDayModal (line 537). Not yet used in Queue audit panel or Records. Meets the "used by at least one consumer" done-when check, but the broader usage goal is deferred.

## Confirmed Clean
- T2.18: Widget, getGlucoseLevel, labQuickStats, dentalGrade, lamenessGrade, murmurGrade, respEffort, palpationFindings, dischargeRef — all absent from file.
- T2.46.1: All action value occurrences use 'reschedule' or 'carryover' — no functional 'rebook' strings remain.
- T2.17: Sidebar reads "Services & Items" (line 1971).
- T2.97: ServiceProgressCard renders real data with clickable toggles. Uses COLORS tokens. Zero border-radius compliant.
- T2.111: ClinicalTimeline renders actual pulse events with timestamps and staff. Uses COLORS/FONT/TYPE tokens. Zero border-radius compliant (borderRadius: 0 on Chip).
- T2.53: rescheduleAppointment uses runTransaction.
- T2.54: IDENTITY_HEALING pulse event correctly distinguishes QUICK ADMIT patients.
- T2.99: POSModal cashier name uses profile?.fullName.
- T2.107: serviceStartedAt/serviceCompletedAt written in handleToggleServiceProgress.
- T2.19: runTransaction implemented in handleSaveDraft (with the first-draft bypass caveat above).
- T2.20: Empty-cart confirm uses window.confirm with correct "Services & Items" text.
- T2.35: Bidirectional walker implemented with MAX_DEPTH=10, returns ancestors + descendants + combinedPulse + combinedServices.
