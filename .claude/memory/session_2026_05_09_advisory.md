---
name: Session 2026-05-09 — Major advisory + implementation session
description: T4.13 problem list DONE, T4.196 queue notes DONE, T4.197 service progress DONE, T4.195 BookAppointment neubrutalism DONE, POS neubrutalism DONE. 5 tasks formalized (T4.196-T4.200). ~30 inline fixes. Extensive decision rounds (intake notes 9 decisions, service progress 13 decisions, calendar AI 10 decisions, My Stats 18 decisions, vaccine 4 decisions). Mockup-driven design. Spec verification gap discovery methodology documented.
type: project
originSessionId: afefd8b6-5aac-42ec-9231-c662616b1f84
---
## Tasks shipped

- **T4.13** Structured Problem List (5 phases, 5 UI locations, useProblemList hook, Firestore rules, TDZ bug caught)
- **T4.195** BookAppointment neubrutalism (27 borderRadius, 107 hex, 9 elevations)
- **T4.196** Queue intake notes & visit status flags (9 fixes: column rename "Context / Notes", unified Owner:/Staff: display, chips relocated to identity column, row accent borders, CONFINED chip, quickAdmitER staffNotes removed, QUICK-ADMIT dropped from inline, stale date prefix, inline staff notes edit)
- **T4.197** Per-service progress visibility (6 phases across 6 surfaces: SuperCard enrichment, AppointmentCardContent service lines, VisitTimeline nested sub-items, QueueScreen strip, Monitor chips, Dashboard SuperCard replacement)
- **POS neubrutalism** (12 borderRadius, 6 hex, settle balance offset shadow)
- **Chatbot keyboard fix** (KAV restructured to wrap chat+input together)
- **Android nav bar safe area** (11 screens)

## Inline fixes (this session)

- CW vitals "LAST" scan all history (not just most recent) + "(N visits ago)" suffix + "No prior reading" label
- CW per-service staff attribution dropdown restored with department grouping (lost in T4.127)
- CW assignedVet + assignedVetId written at sign-off (was permanently "Unassigned")
- CW sidebar "(added)" label for addedDuringConsult services
- CW sidebar actual duration display for completed services
- Defer staffNotes pollution removed from useQueueActions
- Calendar popover: species inline with pet name, ownerPhone/ownerEmail displayed
- Calendar popover: per-service status lines replacing comma text
- BookAppointment: ownerPhone + ownerEmail added to transaction payload
- WalkInModal: ownerEmail + data parity fields (scheduledDateStr, triageDate, serviceDuration/Buffer/Price, serviceType)
- WalkInModal: triage notes made optional
- Booking/walk-in data parity: statusHistory, isAgeExact added
- Queue popover: actual duration, "(added)" label, "Day 1" carry-over annotation, unassigned softened, total time actual vs estimate, estimated time for pending services
- EndOfDayModal: same 4 service data parity fixes + ~ prefix on estimates
- SuperCard active day: "prev. day" annotation, completion fraction, estimated time on pending
- SuperCard past day: upgraded from bare summary to full read-only card (services, timeline, encounter summary)
- AppointmentCardContent: carried-over prev. day detection fixed (timestamp comparison replacing blanket caseDay>1), completion fraction added, estimated time on pending
- VisitTimeline: "prev. day" annotation on sub-items (scheduledDate + caseDay props added)
- Printed internal record: per-service breakdown with status icons + duration + staff
- Triage clock popover defaults to latest case day (Infinity sentinel)
- Chatbot location response: hardcoded sign mention removed

## Tasks formalized (TODO)

- **T4.196** Queue intake notes (DONE this session)
- **T4.197** Per-service progress (DONE this session)
- **T4.198** Calendar AI scheduling assistant (6-8 hrs, 10 decisions locked)
- **T4.199** My Stats redesign 5-tab analytics dashboard (10-12 hrs, 18 decisions locked)
- **T4.200** Vaccine system hardening — multi-dose series + stock warning + dueDate normalization + Worker preferences (4-5 days, 4 decisions locked)

## Decision rounds conducted

### Intake Notes & Status Flags (T4.196) — 9 decisions
1. Column rename → "Context / Notes"
2. Unified Owner:/Staff: display (no tabs)
3. System chips relocated to Patient Identity column
4. Row accent border (red emergency/confined, orange carry-over/deferred)
5. CONFINED chip at confine action
6. quickAdmitER staffNotes removed
7. QUICK-ADMIT dropped from inline
8. Stale carry-over date prefix (display-only)
9. Inline staff notes edit (staffNotes only, clientNotes read-only)

### Service Progress Visibility (T4.197) — 13 decisions
10. Parallel status board (NOT sequential timeline)
11. Single-service skips SERVICES section
12. Staff shown only when different per service
13. Carry-over "done Day 1" / "prev. day" via timestamp comparison
14. Confined warm message
15. VisitTimeline nests under "In Consult" (not injected as entries)
16. Mid-consult "(added)" label
17. Per-service cost from price field
18. 5 surfaces updated
19. Progress revert (deferred — no decision on UX pattern)
20. SuperCard additions (staff + price + "(added)")
21. Dashboard SuperCard for arrived+ only, thin card for pending/confirmed
22. Multi-pet handled (SuperCard already collapsible)

### Calendar AI (T4.198) — 10 decisions
1. Side panel + right-click contextual (B+D)
2. Visible range + on-demand expansion (D)
3. Full context: appointments + services + staff + settings + capacities + inventory + medical history
4. Chips + free-text (B)
5. Read-only intelligence (A)
6. Multi-turn within session (B)
7. Firestore prompt + dynamic inject (C+B)
8. No rate limits (~$0.005/query)
9. llm_audit_logs (A)
10. All staff access (A)

### My Stats Redesign (T4.199) — 18 decisions
1. Analytics-only scope (clinical details → PetHistoryScreen)
2. Services breakdown toggle (BY DEPARTMENT / BY SERVICE)
3. Spending: granular toggles (time grouping + breakdown), bars for time, pies for composition
4. All 6 new chart types
5. Pet cards medium (weight sparkline + med count, no clinical detail)
6. Conditions Overview KPI pills from problem list (not raw diagnoses)
7. Preventive care kept as-is with BOOK CTAs
8. Calendar mini-view for upcoming
9. 5-tab layout (OVERVIEW/VISITS/SPENDING/PETS/HEALTH)
10. Toggle-driven flexibility
11. YoY visits+spending toggle
12. Seasonal per-pet filter
13. Visit breakdown absorbed into Visit Trends
14. BY PET/BY SERVICE text rows absorbed into Spending pies
15. Relationship Health Score removed (gamification is patronizing)
16. Problem list integration
17. Per-tab PDF export
18. Lazy section rendering

### Vaccine System (T4.200) — 4 decisions
19. Series definition: catalog extension (optional doses/doseIntervalDays/startAgeWeeks)
20. Status computation: explicit doseNumber tracking
21. UI display: dots + text (● ● ○ + "Next: Dose 3 in 12 days")
22. Completeness impact: binary (incomplete series = not current)

## Critical workflow discoveries

### Spec verification gap methodology
When reviewing the T4.197 execute prompt, I cross-referenced all 13 locked decisions against the prompt and found 2 gaps:

1. **Carried-over appointment cards not handled** — Phase 2 Step 2.2 filtered for `status === 'completed'` only, but carried-over appointments (`status === 'carried-over'`) also appear in history with mixed service completion (some ✓, some ✗). The execute prompt didn't include carried-over in the filter.

2. **No spec verification for carried-over service display** — Spec item #6 checked for "Day 1" text presence via grep but had no item verifying that carried-over cards show ✗ for non-completed services.

**Lesson:** After generating an execute prompt, systematically cross-reference EVERY locked decision against the prompt's phase descriptions AND spec verification items. Grep-based spec checks confirm text existence but NOT logic correctness. The `caseDay > 1` blanket check passed the grep ("prev. day" text found) but was logically wrong (should be `serviceCompletedAt < scheduledDate` timestamp comparison).

**Process to follow:**
1. List all locked decisions in a table
2. For each decision, find the corresponding phase description in the execute prompt
3. For each decision, find the corresponding spec verification item
4. Flag any decision that lacks BOTH a phase description AND a spec check
5. Flag any spec check that verifies text presence but not logic correctness

### Mockup-driven design examples

**SuperCard multi-day carry-over mockup pattern:**
- Day 2 active: shows "prev. day" on services completed before scheduledDate
- Day 1 past (swipe left): full read-only card with ✓/✗ mixed states + completion fraction + full timeline
- Confined Day 1: warm message + ⏳ overnight service

**AppointmentCardContent icon system:**
- ✓ = completed (any card state)
- ⏳ = in progress (active cards only)
- ○ = waiting (active cards — will be done)
- ✗ = not completed (terminal/carried-over cards — will NOT be done this visit)

**Estimated time phrasing decision:**
- "waiting · ~25 min" → ambiguous (sounds like "25 min wait")
- "waiting (~25 min)" → still vague
- "waiting · est. duration: 25 min" → too wordy
- "waiting · ~25 min service" → **CHOSEN** — "service" clarifies it's service length, not wait time

## Remaining gaps (not yet formalized)

### Service-related (bigger features)
1. EncounterSummary service-level financial grouping (needs sourceServiceId data model) ~2-3 hrs
2. Queue popover progress toggle (advance service status from popover) ~1 hr
3. Queue popover staff reassignment (change vet from popover) ~1 hr
4. Per-service push notifications ("Grooming done! Vaccination starting") ~1.5 hrs
5. Mobile generateVisitPDF service breakdown (needs appointment data passed) ~30 min

### From discovered gaps registry
- 28 weaknesses from 8 assessments still pending decision rounds (project_discovered_gaps_pending_decisions.md)

## Deployments
- Admin deployed to Firebase Hosting
- APK built via EAS
