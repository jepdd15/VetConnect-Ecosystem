---
name: Session 2026-04-20 — Standalone Pages + Dashboard Analytics Design
description: Deep-scan of 4 admin standalone pages (Dashboard, Monitor, Expenses, Login), S-tier Dashboard analytics design with 4 tabs + insight engine + drill-downs + exports, file structure assessment, ~120 new tasks (T2.228-T2.342, T3.43-T3.50)
type: project
originSessionId: 6f6872b8-3735-4126-94e0-d0bcd6289350
---
## Session Summary

Deep-scanned the 4 remaining admin standalone pages: Dashboard.jsx (7-line stub, grade F), Monitor.jsx (125 lines, early prototype, grade C-), Expenses.jsx (382 lines, functional but insecure, grade B-), Login.jsx (169 lines, 2 critical security gaps, grade C+).

Designed a comprehensive S-tier Dashboard analytics system with 4 tabs (Growth → Operations → Clinical → Financial), period-over-period views (Today/Week/Month/Quarter/Year), recharts for trend charts, CSS bars for compositions, an actionable insight engine (30 rules), drill-down navigation, exportable reports, KPI threshold alerts, goal tracking, comparative self-context, and smart chart annotations.

Assessed the entire admin file/folder structure. Identified pages/Staff.jsx as dead code (317-line old version, zero imports). Recommended minimal restructure: delete dead Staff + move Dashboard to features/ before build, defer everything else to post-defense.

## Decisions Locked

1. **Dashboard scope**: Full analytics dashboard — thesis deliverable (analytics mentioned in thesis)
2. **Login auth gap fix**: Option B — route-level role protection in App.jsx + catch-block signout (belt-and-suspenders)
3. **Monitor priority styling**: 2-tier — red/urgent for emergencies, neutral for everything else
4. **Expenses "Refunds" category**: Defer to P3
5. **Monitor sidebar link**: Add "Lobby Monitor" to Sidebar (absorbed into T2.238)
6. **Dashboard tab order**: Growth → Operations → Clinical → Financial (Growth first for thesis narrative)
7. **Period views**: Per-tab toggle (Operations always "Today", others have Today/Week/Month/Quarter/Year)
8. **Charting**: recharts for trend/bar charts, plain CSS for horizontal bars and compositions. No pie/donut charts (round violates borderRadius:0)
9. **File restructure — minimal**: Delete dead pages/Staff.jsx + move Dashboard to features/Dashboard/ before build. Full restructure deferred to T3.50 post-defense.
10. **pages/Staff.jsx**: Confirmed dead code (zero imports), safe to delete

## Critical Bugs Found

- Login: `disabled` flag never checked — revoked staff can log in (T2.259 CRITICAL)
- Login: catch-block gap — Auth succeeds + Firestore fails = unguarded dashboard access (T2.260 CRITICAL)
- Expenses: hardcoded `loggedBy: "Admin"` — no audit attribution (T2.243 P0)
- Expenses: no route guard — any user can access `/expenses` via URL (T2.244 P0)
- Expenses: no Firestore rules — wildcard passthrough (T2.245 P0)
- Monitor: race condition in fetchTicketDetails (T2.231 P0)
- Monitor: ticket prefix completely missing from display (T2.232 P0)
- Monitor: isPriority logic semantically inverted (T2.233 P1)
- AssignStaffModal: ticket prefix assigns 'W' to pre-booked appointments instead of 'A' (T2.242 P1)
- Mobile LoginScreen: `accessLevel: 'disabled'` passes truthy check (T2.266 MEDIUM)

## Task Count

~120 new tasks this session: T2.228-T2.342, T3.43-T3.50
Running total across all sessions: ~368 tasks

## Session Extended — Mobile Deep Dives + JSX Audits + Design Unification + Vaccination Redesign

### Mobile Client Scan (10 files, 5,496 LOC)
- MOBILE_CLIENT_DEEPDIVE.md produced (~1,400 lines)
- 91 tasks (T2.343-T2.433) including RegisterScreen + helpers.js
- 5 CRITICAL bugs, 9 HIGH bugs, 14 MEDIUM bugs
- Key: client cancellation silently fails (auditReason), queue-ahead broken (wrong field), Q11 privacy violations, emergencyName booking loop

### JSX Rendering Audits (4 files — Queue.jsx, WalkInModal, queueColumns, ClinicalWorkspace)
- God-View missing vaccine/lab/draft features (ClinicalWorkspace)
- Patient safety: allergy field inconsistent across views
- WalkInModal allergies never written to pet document
- MUI Grid v1 API broken on v2 (Queue edit dialog)
- 165 fontWeight:1000, 50+ borderRadius violations, 230+ hardcoded colors, 20 alert/confirm calls

### Design Unification (18 tasks, T2.434-T2.451)
- Mobile: mobileTokens.js + 7 screen conversions (~5 hrs)
- Admin: designTokens fix + 38-file sweep (~11 hrs)
- Skip Queue/ directory + ClinicalWorkspace (except fontWeight fix)
- Sweep is LAST P2 — after all bug fixes and feature work

### Vaccination System Redesign (14 tasks)
- Core: VACCINE_CATALOG with standardized IDs, dropdown instead of free text, multi-vaccine per visit, vaccineId-based matching (3.25 hrs)
- A-tier: Firestore-configurable catalog, printable passport, overdue alerts (7.5 hrs)
- A+: Protocol engine, push reminders, batch recall tool, QR certificate (8.5 hrs)
- Superseded: T2.455, T2.456, T2.471, T2.473, T2.475

### Additional Decisions Locked
- T2.345: Option C — strip lobby query to {queueNumber, serviceDuration, priority} in state
- T2.363: Both — write emergencyName flat field + modernize BookAppointment reader
- T2.403: Option A — hide plan section for records without dischargeSummary
- T2.417: Absorbed into T2.363
- PatientDashboard A/A+ tier scoped: amendments, print summary, feline vaccines, case-day badges, missing vitals (RR/CRT/BCS/Pain), lab aggregation, weight/temp/HR chart improvements, search expansion, print stylesheet, prescription frequency, vaccination completeness

## How to apply

- Read DASHBOARD_DEEPDIVE.md, MONITOR_DEEPDIVE.md, EXPENSES_DEEPDIVE.md, LOGIN_DEEPDIVE.md for admin page bugs
- Read MOBILE_CLIENT_DEEPDIVE.md for all mobile client bugs
- Dashboard tasks are the largest block (~76 tasks, ~46 hrs for full S-tier)
- T2.342 (delete dead Staff + move Dashboard) is prerequisite for Dashboard build
- T2.259-T2.260 (Login security) are 5 min each and should ship immediately
- Design sweep is terminal — do LAST after all bug fixes and feature work
- Vaccination redesign (T2.472-T2.479) replaces the old patchwork approach
- S-tier roadmap persisted in IMPLEMENTATION_GUIDE.md (~156 additional hrs, 15 modules)
- S-tier features need formal task IDs (T3.68+) assigned in next session
- MASTER_TASKLIST.md = parts catalog (what exists), IMPLEMENTATION_GUIDE.md = assembly manual (how to execute)
- All admin modules graded current + future: 13 of 16 reach A- or above after tasks. Queue reaches A, Staff reaches B+, Monitor reaches B+
- All mobile screens graded: overall C+ → A- after tasks. PetHistoryScreen reaches A, QueueScreen reaches A
- Ecosystem-wide grade after all 480 tasks: A (not A+ due to: no tests, Queue/CW design debt, client-side timestamps, single-tenant, no CI/CD)
- 10 known remaining gaps documented in IMPLEMENTATION_GUIDE.md "Why Not 100%" section
