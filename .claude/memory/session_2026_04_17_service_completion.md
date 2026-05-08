---
name: Session 2026-04-17 — Service Completion & Billing Deep Dive
description: Decisions locked during the service completion tracking, POSModal billing, and queue UI discussion session. Covers per-service status tracking, sign-off decoupling, billing accuracy, audit system assessment, and shared component extractions.
type: project
originSessionId: ed041186-2d3b-4c52-860b-6de10b8c43f4
---
## Key Decisions Locked

### Per-Service Completion Tracking
- `workflowType` field is LEGACY — delete it (T2.93)
- `handleCompleteService` + `lockedServices` in ClinicalWorkspace is PHANTOM dead code — delete it (T2.94)
- Per-service progress card in ClinicalWorkspace sidebar with 3-state toggle (pending/in-progress/completed) + inline staff dropdown + department color + duration display (T2.95)
- Option A chosen for time tracking: explicit START writes `startedAt`, COMPLETE writes `completedAt` + computes `duration`. NOT auto-start on consult entry.
- Sign-off decoupled from status advancement: handleSaveConsult creates medical record but only advances appointment when ALL services completed. Soft gate confirm if any still in-progress. (T2.96)
- Pulse events for service state changes: SERVICE_STARTED, SERVICE_COMPLETED, SERVICE_REVERTED (T2.110)
- T2.103 (staff reassignment) ABSORBED into T2.95 — inline in service card, not overflow menu
- T2.106 (separate grooming UI) CANCELLED — ClinicalWorkspace is the single surface for all departments

### Shared Components
- `ServiceProgressCard` — shared component for service list with status, used identically by queue hover popover and EndOfDayModal. Header + scrollable list + pinned footer. `compact` and `maxHeight` props. Insertion order (no alphabetical sort). Sort control offering: booking order, by status, by department. (T2.97)
- `ClinicalTimeline` extraction — non-essential late task (T2.111, P3)

### POSModal & Billing
- POSModal Scenario B confirmed broken for multi-service (T2.80) — reads scalar serviceType/servicePrice instead of services[]
- `isScPwdEligible` toggle needed on ServiceFormModal — grooming incorrectly gets 20% SC/PWD discount (T2.105, P1 legal compliance)
- Transaction void with inventory reversal (T2.104) — full void only, not partial refund
- Partial refund deferred to T3.13 (P3, 6-8 hrs)
- Outstanding balance needs payments collection + audit trail (T2.101)
- POSModal checkout needs clinicalPulse event (T2.100)
- Receipt needs clinic name from settings (T2.98) and correct cashier name (T2.99)

### Billing Model
- Option 1 (pay at end) as default + Option 3 (deposit) as opt-in for carry-over
- Partial billing (Option 2) rejected as over-engineering for small PH clinics

### Audit System Assessment
- Overall grade: A- after all tasks ship
- Architecture is sound (dual-clock, DNA corrections, forensic seals)
- Messy items: eventId fragmentation (T2.38), statusHistory duplication (T2.45), client-side timestamps (T2.108 document), no pulse factory (T2.109), no pulseUtils tests (T3.14)

## Task IDs Assigned This Session
T2.93-T2.111, T3.13, T3.14
Total new: 19 tasks (17 active + 2 cancelled/absorbed)
Running total after session: 113 tasks
