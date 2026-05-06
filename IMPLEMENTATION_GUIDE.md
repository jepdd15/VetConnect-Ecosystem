# VetConnect Implementation Guide

**Created:** 2026-04-20 · **Updated:** 2026-04-21
**Source of truth for:** implementation trajectory, module sequence, dependencies, prompts, and the "endgame" vision

---

## Status (updated 2026-04-30)

**Phase 2 COMPLETE AND VERIFIED.** 501 tasks audited — 496 PASS, 6 minor PARTIAL, 0 FAIL.

**Phase 3 Essential: COMPLETE (except Blaze-gated T3.40-42).**

**Phase 3 High-Value: COMPLETE.** All 8 batches executed. T3.5 (informed consent, 8-phase build) DONE. T3.50 deferred post-defense.

**Phase 3 Unclassified: Mostly DONE.**
- Queue services popover (T3.68), EOD waterfall (T3.69), sign-off pulse gap (T3.78): DONE
- Notes restructure (T3.70): DONE — clientNotes/staffNotes/systemChips split
- Admin parity (T3.83-T3.87, T3.91, T3.92): DONE — discharge, labs, status, assessment, attachments, amendments, vaccines
- Mobile parity (T3.81-T3.82, T3.88-T3.90, T3.93-T3.97): DONE — vitals, assessment, amendments, sparklines, search, Rx frequency, year headers, case day, services chips
- Full admin/mobile parity achieved for pet medical history display

**Phase 4 S-Tier: Dashboard S-Push COMPLETE (T4.1-T4.4).** Auto-refresh, draggable KPI layout, YoY benchmarking, multi-tab PDF export.

**Phase 4 Mobile S-Push: T4.78 (in-app reschedule) DONE.** Group support, required reason, JIT capacity check.

**Testing: 322 unit tests passing.** 50 pulseUtils engine + 256 pulse event writing + 16 draft save/resume.

**Session 2026-04-27/28 (T3.111-T3.124):**
- Queue action column collapse (T3.111): Check In button visible, Assign/Time/Cancel moved to overflow
- Mobile INCEPTION pulse (T3.112): every online booking now has an INCEPTION event in clinicalPulse
- Self-check-in fix (T3.113-T3.114): Firestore rule deployed, pulse format corrected, GPS timeout
- Ask AI panel (T3.115-T3.116): loading spinner, auto-scroll, Strict Mode fix, Markdown rendering via react-markdown
- God View symmetry (T3.117): flex layout, scroll chain, border lines
- Shared AmendmentDialog (T3.118): extracted from CW, PatientDashboard amendment button added
- EndOfDayModal cleanup (T3.119): services sort toggle, null guard, redundant PULSE EVENTS removed
- Check-in simplification (T3.120): staff UI stripped from AssignStaffModal, Assign mode removed, statusHistory arrayUnion→array-spread across 6 write sites
- Sign-off guard (T3.121): auto-transitions arrived/confirmed→in-consult before sign-off
- On-hold UI (T3.122): Put On Hold + Resume Consult overflow menu items
- Service pulse display (T3.123): serviceName in labels on 3 display surfaces
- Re-route button (T3.124): RE-ROUTE TO CASHIER for reverted sealed records

**Firestore rules deployed:** queue collection `allow update: if isAuth()` (was isStaff) — enables mobile self-check-in.

**Vaccine System Hardening:** T3.100 (species filter) + T3.101 (exemption flag) DONE. Remaining: T3.102-T3.106 (contraindication, lot linking, dueDate normalization, legacy shim removal, mobile optimization).

**Terminology Rename (T3.98):** rxCart→treatmentCart, prescriptions→dispensedProducts, prescribedItems→encounterItems. 11 files, dual-read fallback for existing documents.

**AI Clinical Reasoning (T3.107):** Claude Haiku 4.5 via Cloudflare Worker proxy. Purple "Ask AI" panel with loading spinner, auto-scroll, Markdown rendering. Feature-flagged, audit-logged.

**Cloudflare Worker URL:** https://cool-fire-2d53.jepdd15.workers.dev

**Phase 2 remaining (9 tasks — mostly deferred to later phases):**
1. T2.451 — alert()/confirm() → MUI Dialog (~2 hrs, excludes Queue+CW) — optional
2. T2.61a, T2.63a — covered by T4.15 Records S-Push
3. T2.228a, T2.320a — covered by T4.1/T4.3 Dashboard S-Push (T4.1/T4.3 NOW DONE)
4. T2.278a — covered by T3.40-42 Auth rewrite
5. T2.472a — covered by T3.51-53 Vaccination A-Tier (DONE)
6. T2.10 — manual Firebase Console operation (5 min, do during deployment)
7. T2.11 — Blaze-dependent (1-2 hrs)

**Audit Integrity:** T3.72 (checkout correlation ID) + T3.74 (auditReason append-only) DONE. T3.120 fixed statusHistory across 6 write sites. Remaining: T3.73 (reserve/release logging).

**Session 2026-04-29 (T3.125-T3.127, T4.85-T4.97):**
- Queue hardening: statusHistory push on cancel/no-show/EOD (T3.125), carried-over added to TERMINAL_STATUSES (T3.126), inline reschedule split into simple + full carry-over (T3.127)
- My Bookings redesign: case day chain with swipe pager (T4.85), vertical visit timeline from clinicalPulse (T4.86), encounter summary with lazy medical_records (T4.87), wait time transparency from forensicSeal (T4.88)
- Push notifications: Cloudflare Worker /push + /push/custom (T4.89), sendPushNotification utility + 18 write paths (T4.90), notification template editor in Settings (T4.91), custom notification dialog (T4.92), appointment reminders widget (T4.93), mobile handler (T4.94), notification logging + NotificationLogs page (T4.95)
- AI assistants: admin PetHistoryAIDrawer with multi-turn chat (T4.96), mobile PetHistoryAISheet with SOAP stripping + safety guardrails + rate limit (T4.97)

**Cloudflare Worker model:** claude-haiku-4-5-20251001 (updated from 20250401 which was retired).

**Firestore rules deployed:** notification_templates (staff read, admin write) + notification_log (staff read, auth create, append-only).

**Additional (late session 2026-04-29):**
- T4.107: Dynamic department-based record filters (resolveDepartmentForRecord utility + admin + mobile)
- T4.108: normalizeMarkdownTables utility for AI table rendering (Rule 6 for merged header+delimiter)
- T4.109: SOAP quadrant swap [S|A / O|P] + multi-turn AI via chatWithHistory replacing single-shot callClinicalReasoning
- T4.110: ClinicalAIPanel extracted — collapsible drawer (default view, z-index 1400) + persistent third column (God View flex:7/3). DiagnosticBridge slimmed to buttons-only. No-tables system prompt added.
- Layout fixes: DraggableKPIGrid ResizeObserver width, m:-4 hack removal, Inventory pagination, Services Activity Log full-bleed
- Mobile fixes: SimpleMarkdown Text wrapping, chatbot navbar clearance, ClientDashboard cleanup
- Tasks formalized: T4.98-T4.106 (queue centralization, timestamp validation, RBAC, My Bookings offline/pagination/error/animation/accessibility/pull-to-refresh)
- APK built + admin deployed to Firebase Hosting

**Session 2026-04-30 (T3.128-T3.137, T4.111-T4.118):**
- Clinical workspace: department-filtered staff assignment (T4.111), carry-over signedOffAt bug fix (T3.128), EOD parity (T3.130), sign-off requires Subjective (T3.131)
- Vitals: resolveVitals amendment-aware utility (T3.132-T3.133), admin zoom dialog + time-proportional axis + delta annotations (T4.112), 3-layer input validation (T3.136), mobile 7-vital S-push with zoom modal (T4.113)
- Structured physical exam: PhysicalExamChecklist 10 body systems + dental/hydration/MM, examUtils dual-read, Zen zoom parity, sticky header (T4.115)
- EMRDrawer fixes: z-index 1400 + dischargeSummary crash (T3.129)
- AI: error message surfacing (T3.134), retry logic + graceful degradation UI (T3.135), dead callClinicalReasoning removed
- Prescriptions: active/historical split + pin toggle + zoom modal + RX drug/non-drug split + qty fix + widget cleanup + back-nav fix (T4.116)
- Vaccine restructure: vaccineConfig schema, category-based detection, Plan quadrant Autocomplete, noStockDeduction override, Settings migration button, useVaccineCatalog rewrite (T4.117) — 3-day build
- Mobile vaccination status: completeness bar, overdue alerts, per-vaccine cards with tap-to-expand history, passport button absorbed (T4.118)
- Inventory categories moved from Settings to Inventory third tab (T3.137)
- Tasks formalized: T4.119-T4.125 (notification history, lab redesign, file attachments, mobile parity ×3, CRM redesign), T3.55 updated (Cloudflare Cron vaccine reminders)
- ~650 DONE / ~166 TODO. ~824 total tasks.

**Session 2026-05-01 (T4.119, T3.55, T4.126, T3.138) — continued from Apr 30:**
- Mobile Notification History: bell icon + unread badge + SectionList + type filters + infinite scroll (T4.119)
- Automated vaccine reminders: pre-computed queue, sign-off piggyback, weekly recompute, Worker Cron 7AM Manila (T3.55)
- Automated 3-stage appointment reminders: configurable heads-up + fixed tomorrow + fixed today, Worker Cron handler (T4.126)
- Notification log fix: client-side template resolution + backfill button + type filter parity (T3.138)
- Cloudflare Worker: FIREBASE_API_KEY env var, Cron Trigger 0 23 * * *, handleVaccineReminders + handleAppointmentReminders via Promise.allSettled
- Firestore rules deployed: notification_log (owner reads + admin update), vaccine_reminder_queue (public), appointment_reminder_queue (public), clinic_settings/general (public read), notification_log composite index (ownerId + sentAt)
- 30 discovered gaps documented in memory (pending decision rounds)
- ~655 DONE / ~157 TODO. ~826 total tasks.

**Cloudflare Worker state (updated 2026-05-01):**
- URL: https://cool-fire-2d53.jepdd15.workers.dev
- Model: claude-haiku-4-5-20251001
- Endpoints: POST / (AI), POST /push (template), POST /push/custom (free-text)
- Cron: 0 23 * * * UTC (7 AM Manila) — runs handleVaccineReminders + handleAppointmentReminders
- Env vars: ANTHROPIC_API_KEY + FIREBASE_API_KEY
- 17 templates total (12 status + 2 vaccine + 3 appointment)
- Worker source NOT in repo

**Session 2026-05-01 to 2026-05-04 (T4.120-T4.141):**
- Lab results redesign: 78-test catalog, useLabTestCatalog, Autocomplete form, zoom modal with SparkLine, 8 consumer updates, Amendment 1 pos/neg mapping (T4.120, 3-day)
- File attachments: uploadAttachment utility, CW UI, per-lab-test + general SOAP, clientVisible toggle, storage.rules — Blaze-gated (T4.121, 2-day)
- Mobile parity: prescriptions active/historical + qty (T4.122), lab summary + LabZoomModal (T4.123), attachment viewer + lightbox (T4.124)
- Offline support: Firestore memoryLocalCache, onAuthStateChanged auth routing, NetworkContext + offline banner, 14 error callbacks, offline-aware UI states. Absorbs T4.101 + T4.130 (T4.74)
- Registration expansion: DPA checkbox consent + address + city + emergency contact + promo (T4.128)
- Liability waiver: digital signing via ConsentScreen with consentType:'waiver', valid under RA 8792 (T4.129)
- Queue transparency: 6 approaches — dept-filtered count, per-dept time estimate (absorbs T4.6), dept lane header, breadcrumb, explainer, Monitor badges (T4.134, 2-day)
- Page header unification: COLORS.sky token, 2-word titles, Sky Blue primary actions, outlined search, 2-row flexWrap across 12 pages (T4.133, 2-day)
- Multi-channel notifications: push → email (Resend) → SMS (Semaphore) cascade, Worker /email + /sms endpoints, Settings toggles, NotificationLogs channel column (T4.135, 3-day)
- Booking engine Professional tier: petServiceMap per-pet services, weight-resolved pricing, cumulative capacity, parallel dept scheduling (T4.139, 3-day)
- Fixes: God View quadrant sizing, Zen lab parity, hooks order crash, VitalsZoomModal, SparkLine width, responsive titles, SuperCard collapse, WalkInModal layout, consent_versions rule, Firestore memoryLocalCache, sidebar responsive, triage text cleanup
- Tasks formalized: T4.127, T4.136-T4.141, T1.11
- ~669 DONE / ~155 TODO. ~842 total tasks.

**Cloudflare Worker state (updated 2026-05-04):**
- URL: https://cool-fire-2d53.jepdd15.workers.dev
- Model: claude-haiku-4-5-20251001
- Endpoints: POST / (AI), POST /push (template), POST /push/custom (free-text), POST /email (Resend relay), POST /sms (Semaphore relay)
- Cron: 0 23 * * * UTC (7 AM Manila) — runs handleVaccineReminders + handleAppointmentReminders (push + email + SMS)
- Env vars: ANTHROPIC_API_KEY + FIREBASE_API_KEY + RESEND_API_KEY + RESEND_FROM_EMAIL + SEMAPHORE_API_KEY + SEMAPHORE_SENDER_NAME
- 15 push templates + 3 SMS templates + email HTML wrapper
- Worker source in repo: VetConnect-Backend/cloudflare-worker/worker.js (739 lines)

**Session 2026-05-05 (T4.141-T4.168, T3.139, T4.13):**
- Structured diagnosis system: 452-entry catalog, 10 severity scales, useDiagnosisCatalog hook, Autocomplete + severity selectors, dual-write (diagnoses[] + diagnosis string), 12 consumer files updated (T4.141, 3-day)
- Auth hardening: force password change blocking dialog (T4.137), 3-layer staff revocation (T4.138), role simplification — isStaff()=isAuth() (T4.154, absorbs T4.81)
- POS Professional upgrade: cash change (T4.148), custom discounts per-item + bill with mandatory reason (T4.149), split-tender sequential-add (T4.150), EOD close-out + Z-report (T4.151), receipt PDF + email (T4.152), sequential receipt OR-YYYYMMDD-NNNN (T4.153)
- Refund/void fixes: statusHistory push (T4.143), batch restoration parity (T4.144), balanceRemaining reset (T4.145)
- Partial payment follow-up: 7 capabilities — Queue badge, Mark as Settled, snooze, Patients badge, mobile banner fix, booking warning, Worker Cron handleBalanceReminders (T4.147, 2-day)
- CW sidebar split: Services panel + Items panel, inline progress toggles, mid-consult service registration, ServiceProgressCard deleted (T4.127)
- PetHistoryScreen full redesign: collapsible records, month picker + dot timeline, neubrutalism conversion, Pet Health Snapshot strip, 7 display gaps fixed, pull-to-refresh, loading skeleton (T4.155, 3-day)
- ClientDashboard statistics: 13-stat KPI grid + mini bar chart, useClientStats hook (T4.156)
- Carry-over data hygiene: encounterItems, encounterItemsVersion, finalTotal excluded from clone (T3.139)
- Subjective auto-populate from intake notes + IntakeContext display removed (T4.158)
- Service-driven SOAP validation (T4.159, then REVERTED by T4.164)
- ServiceFormModal cleanup: RESOURCE ROUTING removed, inventory groupBy, OPERATIONAL RULES hidden, department placeholder (T4.160)
- WalkInModal 13-fix cleanup: scroll, designTokens, groupBy, price summary, MUI Dialog confirm (T4.163)
- Settings 5-tab layout (T4.157). Chatbot keyboard fix (T4.161). MyPetsScreen neubrutalism (T4.162).
- Firestore rules: getUserRole() get() failure on Spark plan — isStaff()=isAuth() workaround
- Tasks formalized: T4.142 (3-tier classification, 6-8 hrs), T4.146 (TOCTOU, 1.5 hrs), T4.164 (soft warnings, 1 hr), T4.165 (vitals cleanup, 30 min), T4.166 (mobile record redesign, 4-5 hrs), T4.167 (admin record redesign, 4-5 hrs), T4.13 (problem list, 4-5 hrs), T4.168 (POS transaction fix, 1.5-2 hrs)
- ~695 DONE / ~184 TODO. ~871 total tasks.

**Cloudflare Worker state (updated 2026-05-05):**
- URL: https://cool-fire-2d53.jepdd15.workers.dev
- Model: claude-haiku-4-5-20251001
- Endpoints: POST / (AI), POST /push (template), POST /push/custom (free-text), POST /email (Resend relay), POST /sms (Semaphore relay)
- Cron: 0 23 * * * UTC (7 AM Manila) — runs handleVaccineReminders + handleAppointmentReminders + handleBalanceReminders (push + email + SMS)
- Env vars: ANTHROPIC_API_KEY + FIREBASE_API_KEY + RESEND_API_KEY + RESEND_FROM_EMAIL + SEMAPHORE_API_KEY + SEMAPHORE_SENDER_NAME
- 15 push templates + 3 SMS templates + 1 balance-reminder + email HTML wrapper
- Worker source in repo: VetConnect-Backend/cloudflare-worker/worker.js (~1020 lines)

**Firestore rules state (updated 2026-05-05):**
- isStaff() = isAuth() (getUserRole() get() fails on Spark plan — client-side role enforcement only)
- isAdmin() = isStaff() (role distinction removed)
- getUserRole() function kept but unused — available for future Blaze upgrade
- counters collection added (receipt_sequence for sequential numbering)
- daily_closings collection added (EOD Z-reports)

**Session 2026-05-05/06 continued (T4.169-T4.188, advisory + fixes):**
- WalkInModal UI rewrite: 3-section layout, design system parity, multi-pet UI removed, data parity fixes (ownerPhone, statusHistory, timestamps, isValidPHPhone) (T4.171 DONE)
- Inventory: KPI clickable filters replacing toggles, scrubDatabase deleted, maxCages removed
- Registration fix: App.js onAuthStateChanged race condition + Firestore rules consent_policy public read
- Outstanding balance: query by ownerId replacing ownerName (name collision + drift fix)
- 20 tasks formalized (T4.169-T4.188): reservation audit+cleanup, multi-pet removal, breed catalog, My Bookings (hardening + SuperCard + neubrutalism + card enrichment), QueueScreen + Monitor redesigns (D/M/c model), data parity, CW patient editing, Dashboard 4-tab redesign (TODAY/ANALYTICS/FINANCIAL/PERFORMANCE), Visit Log 3-tab redesign, standalone retail POS, EMRDrawer redesign, My Stats screen, Expenses upgrade, Philippine legal compliance
- ~700 DONE / ~204 TODO. ~892 total tasks.

**Firestore rules state (updated 2026-05-06):**
- isStaff() = isAuth() (unchanged)
- isAdmin() = isStaff() (unchanged)
- clinic_settings read: isAuth() || settingId == 'general' || settingId == 'consent_policy' (consent_policy added for unauthenticated registration DPA fetch)
- counters + daily_closings collections (unchanged)

**Session 2026-05-06/07 (T4.168, T4.188, T4.142, T4.164, T4.165, T4.167, T4.184, T4.166, T4.172, T4.175, T4.178, T4.179, T4.183, T4.189, T4.176, T4.177 + 42 bugfixes):**
- Phase A Foundation: T4.168 (POS transaction restructure, 3-phase read/compute/write), T4.188 (Philippine legal compliance, PRC/PTR/BAI, dual print Client/Internal/Both), T4.142 (3-tier product classification Medicine/Medical Supply/Retail, 20 changes across 10 files, 3-day build)
- Phase B Admin Clinical: T4.164 (universal soft-warning dialog replacing per-service gates), T4.165 (vitals empty defaults + WNL cleanup), T4.167 (PatientDashboard record SOAP-order redesign, Assessment hero, per-dx notes input in SoapGrid, collapsible Objective), T4.184 (standalone retail POS, 3 entry points Queue+Sales+Sidebar, saleType field, customer nudge dialog)
- Phase C Mobile: T4.166 (PetHistoryScreen redesign, diagnosis-first hero, department bottom sheet, year dropdown, DISCHARGE NOTES rename, header compaction)
- Phase D Multi-pet removal: T4.172 (17 files, 241 refs removed, single-pet-per-appointment across entire ecosystem)
- Phase D downstream: T4.175 (SuperCard redesign, 10 features, per-service progress, financial preview, case day swipe), T4.178 (QueueScreen redesign, per-dept Now Serving, multi-dept breakdown, two-row breadcrumb, Book Now CTA), T4.179 (Monitor redesign, multi-lane display, estimated wait, clock, after-hours)
- Phase D continued: T4.183 (Visit Log 3-tab redesign, filter drawer merged into header, row-click audit, per-tab KPIs, date headers, case headers), T4.189 (Visit Log phase-aware action buttons, 4 modals wired, overflow menu, revert dialog), T4.176 (My Bookings neubrutalism, bottom sheet filters replacing chips, search bar), T4.177 (card content enrichment, shared AppointmentCardContent, structured sig UI, active med tracking, generateVisitPDF extraction)
- 42 bugfixes: mobile balance source (appointments→sales), chatbot SimpleMarkdown, timeline events expanded, CaseDayCard pageWidth, EncounterSummary services/products split + dedup, POS Autocomplete with category grouping, BillingLedger 7-gap rewrite, Transactions KPI split (Bank Transfer pink) + date-aware labels + responsive columns, Staff page access level + live status removed, responsiveness (Queue/Records/Expenses/EOD/BillingLedger), useSalesData date guard, POSModal DOM nesting fix, StaffFormModal departments array guard, Dispensing Unit conditional, PetHistoryScreen header merged + medical record polish (section dividers/vet signature/diagnosis labels), MyPets filter consolidation + vaccine-catalog health status + vertical stack cards, warm status messages (QueueScreen+SuperCard), barcode UI removed, Visit Log case header service aggregation
- ~717 DONE / ~189 TODO. ~906 total tasks.

**Structured sig system (NEW — session 2026-05-07):**
- ClinicalWorkspace: medicine items now have 5 structured sig fields (Dose, Unit, Frequency select, Days number, Route select) instead of free-text TextField
- `sig` object persisted to `dispensedProducts` on medical_records (was missing before)
- `buildInstructionsFromSig()` helper auto-generates readable instructions from structured fields
- Mobile PetHistoryScreen: active medication tracking computes endDate from `sig.duration`, shows "X days remaining" with countdown
- Fallback: records without sig.duration use 90-day window

**Next:** T4.182 (Dashboard 4-tab redesign, 12-14 hrs, depends T4.142+T4.184) → T4.173 (Breed catalog, 1.5 hrs) → T4.180 (Data parity, 2.5-3 hrs) → T4.181 (CW patient editing, 2-3 hrs) → T4.174 (My Bookings hardening, 2.5 hrs) → T4.185 (EMR Drawer redesign, 3-4 hrs) → T4.186 (My Stats screen, 5-6 hrs) → T4.187 (Expenses upgrade, 4-5 hrs) → T4.169+T4.170 (Reservation audit+cleanup, 1.5 hrs) → T4.13 (Problem list, 4-5 hrs) → T4.146 (Booking TOCTOU fix, 1.5 hrs)

---

## How to Start a Fresh Implementation Session

Paste this prompt at the start of a new session:

```
Read these files in this order:
1. IMPLEMENTATION_GUIDE.md — current status section + module sequence
2. handoff.json (section: advisory_session_2026_05_06_07) — latest context
3. MASTER_TASKLIST.md — task registry with IDs, priorities, dependencies, status

The full VetConnect codebase has been audited across 5+ sessions — every source
file has been deep-dived. Do NOT re-scan any code. All findings are in the
deep-dive files at the repo root. Use the "Task-to-Source Cross-Reference" table
in IMPLEMENTATION_GUIDE.md to find the backing file for any task.

Context: This is a continuation of the 2026-05-06/07 advisory session.
~717 DONE, ~189 TODO. Build passes. 322 tests passing.
Cloudflare Worker URL: https://cool-fire-2d53.jepdd15.workers.dev
Cloudflare Worker model: claude-haiku-4-5-20251001
Cloudflare Worker Cron: 0 23 * * * UTC (7 AM Manila daily)
Cloudflare Worker handlers: handleVaccineReminders + handleAppointmentReminders + handleBalanceReminders (push + email + SMS)
Cloudflare Worker env vars: ANTHROPIC_API_KEY + FIREBASE_API_KEY + RESEND_API_KEY + RESEND_FROM_EMAIL + SEMAPHORE_API_KEY + SEMAPHORE_SENDER_NAME
Cloudflare Worker endpoints: POST / (AI), /push, /push/custom, /email (Resend), /sms (Semaphore)
Cloudflare Worker reference copy: VetConnect-Backend/cloudflare-worker/worker.js (~1020 lines)

I want to work on [MODULE NAME]. Follow the module workflow:
1. LOOK UP: Find the module in the "Module Sequence" table. Read the listed
   deep-dive file + handoff.json for context.
2. PLAN: Use one implementation-planner sub-agent for this module. The planner reads
   the deep-dive file, then ALL source files for the module. It plans EVERY task for
   the module (P0 first → P1 → P2 → P3), checking "Depends On" in MASTER_TASKLIST.md
   for any cross-module blockers. Output: [MODULE]_PLAN.md
3. REVIEW: Show me the plan. I will approve before any code changes.
4. EXECUTE: Use the elite-code-engineer to implement the approved plan.
5. BUILD: Run npm run build to verify no breakage.
6. AUDIT: Use the code-quality-reviewer if the module has >10 tasks or Firestore changes.
7. TEST: I will test before committing (browser for admin, Expo for mobile).
8. UPDATE: Mark completed tasks as DONE in MASTER_TASKLIST.md. Commit.

Do NOT skip steps or combine plan+execute. Wait for my approval between steps.
```

---

## Full Trajectory — Start to Finish

> This is the big picture. Six steps, in order. Each step feeds the next.
> Defense-ready after ~80 hrs (Steps 0-1 partial + Step 2).
> S-tier across entire ecosystem after ~600 hrs total.

### Step 0 — Prerequisites (30 min)

3 tasks. Do once before anything else: T2.442, T2.434, T2.342.

**Step 0 Prompt:**
```
Start with the 3 prerequisites: T2.442, T2.434, T2.342.

Main agent: spawn ONE implementation-planner sub-agent with this brief:

"You are planning the 3 prerequisite tasks for VetConnect.
Tasks: T2.442, T2.434, T2.342

For T2.442: Read EXPENSES_DEEPDIVE.md and INVENTORY_DEEPDIVE.md for orphan
color lists. Read VetConnect-Admin/src/theme/designTokens.js. Remove the GLASS
export, add missing tokens.

For T2.434: Read MOBILE_CLIENT_DEEPDIVE.md and handoff.json design_system_findings
for the mobileTokens spec. Read LoginScreen.js and RegisterScreen.js as reference.
Create VetConnect/src/theme/mobileTokens.js.

For T2.342: Delete VetConnect-Admin/src/pages/Staff.jsx. Move Dashboard.jsx to
VetConnect-Admin/src/features/Dashboard/Dashboard.jsx. Update import in App.jsx.

Save as PREREQUISITES_PLAN.md"

Show me the plan. I will approve before any code changes.
```

### Step 1 — Work through 19 Modules (~350 hrs)

Pick a module from the Module Sequence table below. One planner per module reads one deep-dive, plans every task P0→P3. Approve, execute, test, commit, mark DONE, pick next module.

Recommended order (CRITICAL density first):

```
Login (10 tasks, ~1 hr)           ← 2 CRITICAL auth bugs, quick win
Staff (20 tasks, ~4 hrs)          ← 2 CRITICAL security bugs
ClinicalWorkspace (60 tasks, ~30 hrs) ← core clinical, 5 sub-modules
Mobile Client (90 tasks, ~25 hrs) ← 6 CRITICAL, 8 sub-modules
Inventory (25 tasks, ~12 hrs)     ← P0 stock integrity
Patients CRM (35 tasks, ~18 hrs)  ← P0 allergy normalization
Sales (12 tasks, ~5 hrs)          ← P1 EOD + refund
Expenses (15 tasks, ~4 hrs)       ← P0 security gaps
Services (15 tasks, ~4 hrs)       ← P1 archive guards
Settings (14 tasks, ~3 hrs)       ← P1 admin guard
Monitor (14 tasks, ~3 hrs)        ← P0 race condition
Queue JSX (13 tasks, ~2 hrs)      ← P0 Grid v1 fixes
Booking Engine (12 tasks, ~4 hrs) ← P0 tiered pricing
Firestore Rules (3 tasks, ~5 hrs) ← P0 RBAC + append-only
Printables (3 tasks, ~5 hrs)      ← P1 thesis deliverables
Vaccination Redesign (6 tasks, ~3 hrs) ← strict chain order
Records (15 tasks, ~12 hrs)       ← P0 broken filters
Dashboard Build (70 tasks, ~32 hrs) ← ground-up, plan day-by-day
Design Sweep (17 tasks, ~16 hrs)  ← ALWAYS LAST
```

Reorder freely **except**: Dashboard after prerequisites, Design Sweep last, vaccination chain in strict order, CW internal chains (T2.32→T2.28, T2.94→T2.95→T2.96).

### Step 1.5 — Deferred Cleanup (after all 19 modules, before Design Sweep)

Reviewer audits generate deferred P3 sub-tasks (T2.xxxA/B/C/D pattern) that belong to
completed modules. The planners for remaining modules won't pick these up — they're
outside those modules' task ID ranges. Batch them into one cleanup pass.

**Prompt:**
```
I want to work on Deferred Cleanup.

Main agent: spawn ONE implementation-planner sub-agent with this brief:

"You are planning a Deferred Cleanup pass for VetConnect.
These are P3 sub-tasks from completed module audits, plus any blocked tasks
that are now unblocked.

1. Read MASTER_TASKLIST.md — find ALL Phase 2 tasks still marked TODO whose
   IDs fall within completed module ranges (modules 1-16 in the Module Sequence).
   Include sub-ID tasks (T2.xxxA/B/C/D variants).
2. For each task, read the target source file to understand current state
3. Plan every task, grouped by file to minimize context switches
4. For each task: one-line 'done when' acceptance check
5. Save as DEFERRED_CLEANUP_PLAN.md"

Show me the plan. I will approve before any code changes.
```

**When to run:** After the last functional module (Dashboard Build, module 18) and before
Design Sweep (module 19). The count will vary — currently 25 known deferred tasks, but
more may accumulate from the remaining 5 modules' audits.

### Step 2 — Phase 1 Thesis (10 tasks, ~25 hrs)

Separate workstream. Interleave with coding when you need a break, or batch into dedicated writing days. Thesis rewrites (T1.1-T1.2), defense addendum (T1.4), Chapter IV paragraphs (T1.5-T1.10).

### Step 3 — Phase 3 Essential (13 tasks, ~28 hrs)

Gates Phase 4 or fills critical gaps. Requires Blaze for some tasks:
- Staff Auth Production Path (T3.40-T3.42)
- Forensic Reporting (T3.8)
- RA 10173 right-to-erasure (T3.11)
- Vaccination A-Tier (T3.51-T3.53)
- Queue Workflow Gaps (T3.9, T3.10a, T3.10b, T3.10d)
- Inventory Safety (T3.24, T3.31)

### Step 4 — Phase 3 High-Value (16 tasks, ~45 hrs)

Post-defense, if time permits:
- EMR + Multi-Vaccine UI (T3.1-T3.3)
- Dispensing Hardening (T3.36-T3.39)
- Multi-Pet Visit (T3.12, 15-20 hrs)
- Testing Foundation (T3.14)
- RA 10173 Informed Consent (T3.5, 8-12 days)

### Step 5 — Phase 4 S-Tier (77 tasks, ~154 hrs)

Push each module from A/A- to S. Work module-by-module same as Step 1, using Phase 4 section of MASTER_TASKLIST.md. Each module's S-Push depends on its Phase 2+3 tasks being done.

### Step 6 — Phase 3 Optional (38 tasks)

LLM Chatbot, Advanced Inventory, Hospital-Grade Safety, Vaccination Deep, etc. Pick based on interest. Skip without consequence.

### Timeline at a Glance

```
Step 0 ──→ Step 1 (19 modules) ──→ Step 1.5 (deferred cleanup) ──→ Step 2 (thesis)
(30 min)      (~350 hrs)              (~3-5 hrs)                    (~25 hrs)
                  │                        │
                  │                        └── between last functional module and Design Sweep
                  ├── can interleave thesis (Step 2) between modules
                  └── defense-ready after first ~6 modules + thesis (~80 hrs)

──→ Step 3 ──→ Step 4 ──→ Step 5 ──→ Step 6
  (~28 hrs)  (~45 hrs) (~154 hrs) (skip-able)
```

| Milestone | Effort | What You Can Demonstrate |
|---|---|---|
| After Prerequisites + Login + Staff | ~5 hrs | All CRITICAL security bugs fixed |
| After + ClinicalWorkspace + Mobile | ~60 hrs | Core clinical workflow + mobile app functional |
| After + Inventory + Patients + thesis | ~80 hrs | **Defense-ready.** All P0, key P1s, thesis aligned |
| After 18 modules + Deferred Cleanup | ~355 hrs | All Phase 2 functional tasks done, reviewer findings resolved |
| After Design Sweep (module 19) | ~370 hrs | Full Phase 2 complete. Every module at A-/A grade |
| After Phase 3 Essential | ~400 hrs | Legal compliance, forensic reporting, vaccine A-tier |
| After Phase 4 S-Tier | ~555 hrs | Every module at S grade. Full endgame |

---

## Module Sequence (Primary Workflow)

> **This is the recommended way to implement.** Work through one module at a time.
> Within each module, fix everything P0 → P1 → P2 → P3.
> The planner reads ONE deep-dive + the module's source files. Nothing gets missed.
>
> The batch structure (further below) is kept as a reference for dependency chains
> and pre-built planner prompts, but is NOT the primary workflow.

### Prerequisites (do these 3 tasks FIRST, before any module)

| Task | Name | Effort | Why First |
|---|---|---|---|
| T2.442 | Fix designTokens.js: remove GLASS, add missing tokens | 30 min | All admin modules need correct tokens |
| T2.434 | Create mobileTokens.js | 30 min | All mobile modules need token file |
| T2.342 | Delete dead pages/Staff.jsx + move Dashboard to features/Dashboard/ | 10 min | Dashboard can't be built in pages/ |

### Hard Dependency Rules

These 5 constraints override the module sequence. Check before starting any module:

1. **T2.442** must ship before → Dashboard build, Design sweep
2. **T2.434** must ship before → Mobile design conversions
3. **T2.476 → T2.477 → T2.472** → then T2.474/T2.478/T2.479 (vaccination chain, strict order)
4. **T2.32 → T2.28-expanded** and **T2.94 + T2.13 → T2.95 → T2.96** (CW internal chains)
5. **Design sweep (all T2.435-T2.451) ships LAST** after all functional changes

### Module Order

> Ordered by: CRITICAL/P0 density first → highest-impact modules → polish last.
> You can reorder modules freely as long as you respect the 5 hard dependencies above.

| # | Module | Deep-Dive File | Task IDs | Count | Key Priority Mix |
|---|---|---|---|---|---|
| 1 | **Login** | LOGIN_DEEPDIVE.md | T2.259-T2.266, T2.277-T2.278 | 10 | 2 CRITICAL, 1 HIGH |
| 2 | **Staff** | STAFF_DEEPDIVE.md | T2.208-T2.227 | 20 | 2 CRITICAL (hardcoded password, phone) |
| 3 | **ClinicalWorkspace** | CLINICAL_WORKSPACE_DEEPDIVE.md | T2.8, T2.12-T2.22, T2.24-T2.30, T2.32-T2.36, T2.38-T2.54, T2.46.1, T2.56, T2.75, T2.80, T2.93-T2.111, T2.518-T2.523 | 62 | P0 seal/audit, P1 SoapGrid chain. Excludes T2.23 (Booking), T2.31/T2.37 (Firestore Rules) |
| 4 | **Mobile Client** | MOBILE_CLIENT_DEEPDIVE.md | T2.343-T2.433, T2.480-T2.504 | 90 | 6 CRITICAL, 12 P0/P1 |
| 5 | **Inventory** | INVENTORY_DEEPDIVE.md | T2.149-T2.176 | 25 | P0 stock integrity |
| 6 | **Patients CRM** | PATIENTS_CRM_DEEPDIVE.md | T2.112-T2.136, T2.453-T2.470 | 35 | P0 allergy normalization |
| 7 | **Sales** | SALES_DEEPDIVE.md | T2.137-T2.148 | 12 | P1 EOD + refund lifecycle |
| 8 | **Expenses** | EXPENSES_DEEPDIVE.md | T2.243-T2.258 | 15 | P0 security (no auth) |
| 9 | **Services** | SERVICES_DEEPDIVE.md | T2.191-T2.207 | 15 | P1 archive guard |
| 10 | **Settings** | SETTINGS_DEEPDIVE.md | T2.7, T2.177-T2.190 | 15 | P1 admin guard |
| 11 | **Monitor** | MONITOR_DEEPDIVE.md | T2.231-T2.242, T2.273-T2.275 | 14 | P0 race condition |
| 12 | **Queue JSX** | handoff.json (critical_bugs_found) | T2.76, T2.77, T2.505-T2.517 | 15 | P0/P1 Grid v1, null guards, QR check-in |
| 13 | **Booking Engine** | MOBILE_BOOKING_DEEPDIVE.md | T2.5-T2.6, T2.11, T2.23, T2.78, T2.79, T2.81-T2.89 | 14 | P0 tiered pricing |
| 14 | **Firestore Rules** | CLINICAL_WORKSPACE_DEEPDIVE.md (pulse section) | T2.1, T2.9, T2.10, T2.31, T2.37 | 5 | P0/P1 RBAC + append-only + CF decision |
| 15 | **Printables** | [NO BACKING] — read CW for record format | T2.2, T2.3, T2.4 | 3 | P1 thesis deliverables |
| 16 | **Vaccination Redesign** | CLINICAL_WORKSPACE_DEEPDIVE.md + MOBILE_CLIENT_DEEPDIVE.md | T2.472-T2.479 | 6 | P1, strict chain (see hard deps) |
| 17 | **Records** | CLINICAL_WORKSPACE_DEEPDIVE.md (Records section) | T2.57-T2.74 | 14 | P0 broken filters |
| 18 | **Dashboard Build** | DASHBOARD_DEEPDIVE.md | T2.228-T2.230, T2.270-T2.272, T2.279-T2.341 | 70 | Ground-up build, plan day-by-day |
| 19 | **Design Sweep** | handoff.json (design_system_findings) + per-module files | T2.435-T2.441, T2.443-T2.451 | 16 | LAST — after all functional work. Excludes T2.442 (prerequisite) |

> **Coverage note:** These 19 modules + 3 prerequisites account for ALL 484 active Phase 2 tasks.
> Every task belongs to exactly one module. The planner for each module reads MASTER_TASKLIST.md
> filtered to that module's task IDs — nothing gets skipped.

### Module Workflow Details

### Delegation Model — Who Does What

```
YOU paste a prompt
  ↓
MAIN AGENT (orchestrator) — reads tables, spawns sub-agents, runs builds, commits
  ↓ spawns via Agent tool
IMPLEMENTATION-PLANNER sub-agent — reads deep-dive + source files, produces plan
  ↓ returns plan to main agent
MAIN AGENT shows you the plan
  ↓ you approve
MAIN AGENT spawns via Agent tool
  ↓
ELITE-CODE-ENGINEER sub-agent — reads plan + source files, makes code changes
  ↓ returns change summary to main agent
MAIN AGENT runs npm run build (Bash tool), shows you results
  ↓ optionally spawns
CODE-QUALITY-REVIEWER sub-agent — reads changed files, checks for issues
  ↓ you test (browser for admin, Expo for mobile)
MAIN AGENT updates MASTER_TASKLIST.md, commits (directly, no sub-agent)
```

**Key rule:** The main agent does NOT read deep-dive files or source files itself.
It reads only the Module Sequence table and cross-reference table (small lookups).
All heavy file reading is delegated to sub-agents to keep the main context clean.

### How the planner ensures nothing is skipped

The planner sub-agent does NOT rely on pre-enumerated task lists. Instead:

1. You say "I want to work on **Settings**"
2. The main agent reads the Module Sequence table → finds Task IDs: `T2.7, T2.177-T2.190`
3. The main agent spawns an implementation-planner sub-agent with this prompt:

```
You are planning the Settings module for VetConnect.
Task IDs for this module: T2.7, T2.177-T2.190

1. Read MASTER_TASKLIST.md — extract every active (TODO) task matching those IDs
2. Read SETTINGS_DEEPDIVE.md for bug analysis and code quotes
3. Read the target source files: Settings.jsx
4. Plan EVERY task, ordered P0 → P1 → P2 → P3
5. For each task: exact file, line number range, what to change, code snippet
6. For each task: one-line "done when" acceptance check (e.g., "DONE when Sidebar.jsx has /monitor link")
7. Check "Depends On" column — flag any cross-module blockers not yet DONE
8. Save the plan as SETTINGS_PLAN.md
```

4. The planner reads MASTER_TASKLIST.md, gets all 15 tasks, reads the deep-dive, reads Settings.jsx, and returns a plan
5. The main agent shows you the plan for approval

The task list comes from MASTER_TASKLIST.md (source of truth), not from the prompt.

### Module Planning Prompts — What You Paste

**For small modules (≤15 tasks):**

```
I want to work on [MODULE].

Main agent: look up [MODULE] in the Module Sequence table. Get the Task IDs
and deep-dive file. Then spawn ONE implementation-planner sub-agent with
this brief:

"You are planning the [MODULE] module for VetConnect.
Task IDs: [IDS from table]
1. Read MASTER_TASKLIST.md — extract every active (TODO) task matching those IDs
2. Read [DEEPDIVE_FILE] for bug details and code quotes
3. Read the target source files for this module
4. Plan every task, ordered P0→P1→P2→P3
5. For each task: exact file, line range, what to change, code snippet
6. For each task: one-line 'done when' acceptance check (e.g., 'DONE when Sidebar.jsx has /monitor link')
7. Check 'Depends On' column — flag any unmet cross-module blockers
8. Save as [MODULE]_PLAN.md"

Show me the plan. I will approve before any code changes.
```

**For large modules (>15 tasks):**

```
I want to work on [MODULE].

Main agent: look up [MODULE] in the Module Sequence table. Get the Task IDs
and deep-dive file. Then spawn ONE implementation-planner sub-agent with
this brief:

"You are planning the [MODULE] module for VetConnect.
Task IDs: [IDS from table]
1. Read MASTER_TASKLIST.md — extract every active (TODO) task matching those IDs
2. Read [DEEPDIVE_FILE]
3. Read all source files for the module
4. Split the plan into phases:
   - Phase A: P0/CRITICAL tasks
   - Phase B: P1 tasks
   - Phase C: P2/P3 tasks
5. For each task: exact file, line range, what to change, code snippet
6. For each task: one-line 'done when' acceptance check
7. Check 'Depends On' — flag blockers
8. Save as [MODULE]_PLAN.md"

Show me Phase A first. I will approve each phase separately.
```

**For ClinicalWorkspace (~62 tasks):** Split into 5 sub-modules, one planner each.

```
I want to work on ClinicalWorkspace, sub-module CW-[N].

CW-1: Seal + audit integrity (T2.37, T2.42, T2.44, T2.38, T2.39, T2.45)
CW-2: SoapGrid + follow-up chain (T2.32, T2.28-expanded, T2.33, T2.41)
CW-3: Service completion chain (T2.13, T2.94, T2.95, T2.96, T2.80, T2.105)
CW-4: Remaining P2/P3 (T2.12, T2.14-T2.20, T2.22-T2.54 remainder, T2.75, T2.97-T2.111)
CW-5: JSX audit fixes (T2.518-T2.523)

Main agent: spawn an implementation-planner sub-agent for CW-[N] only.
Brief the planner with the task IDs for that sub-module.
Deep-dive: CLINICAL_WORKSPACE_DEEPDIVE.md. Source: ClinicalWorkspace.jsx.
```

**For Mobile Client (~90 tasks):** Split into 8 sub-modules, one planner each.

```
I want to work on Mobile Client, sub-module MOB-[N].

MOB-1: QueueScreen (T2.343-T2.354, T2.484-T2.490)
MOB-2: ClientDashboard + ClientAppointments (T2.384-T2.401)
MOB-3: UserProfileScreen + MyPetsScreen (T2.363-T2.383, T2.497-T2.504)
MOB-4: PetHistoryScreen + SuperCard (T2.402-T2.416)
MOB-5: BookAppointment + ChatbotScreen (T2.355-T2.362)
MOB-6: RegisterScreen (T2.418-T2.426)
MOB-7: helpers.js extraction (T2.427-T2.433)
MOB-8: Mobile A- push (T2.480-T2.504)

Main agent: spawn an implementation-planner sub-agent for MOB-[N] only.
Brief the planner with the task IDs for that sub-module.
Deep-dive: MOBILE_CLIENT_DEEPDIVE.md ([screen] section).
```

**For Dashboard Build (ground-up, ~70 tasks):** One planner per day.

```
I want to work on Dashboard Build, Day [N].

Main agent: spawn an implementation-planner sub-agent.
Brief: "Plan Dashboard Day [N]. Read DASHBOARD_DEEPDIVE.md.
[If Day 2+: also read the prior day plans for established patterns.]
See Batch 4 in the Implementation Batch Order section for the day breakdown.
Save as DASHBOARD_DAY[N]_PLAN.md"
```

### Phase 1 (Thesis) — Separate Workstream

Thesis tasks (T1.1-T1.10) are NOT code tasks and don't follow the module workflow.
Do them when you need a break from coding, or batch them into a dedicated writing day.
The main agent handles these directly — no sub-agents needed.
See MASTER_TASKLIST.md Phase 1 section for details.

---

## Prompts for Steps 3-6 (Post-Phase-2)

> Steps 3-6 use the same execute/audit/commit prompts as Step 1 (Prompts 4-6 below).
> Only the planning prompt changes per step.

### Step 3 Planning Prompt — Phase 3 Essential

```
All Phase 2 modules are complete. I want to work on Phase 3 Essential.
These are in Batch 12 of the Implementation Batch Order section.

Main agent: read the 6 sub-batches below. Check which have unmet dependencies
(Blaze upgrade, prerequisite tasks). Tell me which to start with.

After I pick one, spawn an implementation-planner sub-agent with this brief:

"You are planning Phase 3 sub-batch [12x] for VetConnect.
Tasks: [TASK IDS]
1. Read MASTER_TASKLIST.md Phase 3 section — get task details
2. Look up backing files in the cross-reference table (Phase 3 rows) — read them
3. These tasks have partial or [NO BACKING] — also read the source files directly
4. Plan all tasks, ordered by dependency chain
5. For each task: one-line 'done when' acceptance check
6. Flag anything requiring Blaze upgrade or external blockers
7. Save as PHASE3_[BATCH_NAME]_PLAN.md"

Show me the plan. I will approve before any code changes.
```

Sub-batch reference for the planner:

```
12a — Staff Auth Production Path (T3.40, T3.41, T3.42):
  Read STAFF_DEEPDIVE.md. REQUIRES BLAZE. Skip if not upgraded.

12b — Forensic Reporting (T3.8):
  Read CLINICAL_WORKSPACE_DEEPDIVE.md (pulse engine section).
  Ground-up feature — design data model, queries, and UI from scratch.

12c — RA 10173 Right-to-Erasure (T3.11):
  [NO BACKING]. Read Firestore schema, identify all PII collections.
  Design the anonymization strategy.

12d — Vaccination A-Tier (T3.51, T3.52, T3.53):
  Read CLINICAL_WORKSPACE_DEEPDIVE.md (vaccine section) + MOBILE_CLIENT_DEEPDIVE.md.
  Prerequisite: T2.476-T2.479 must be DONE.

12e — Queue Workflow Gaps (T3.9, T3.10a, T3.10b, T3.10d):
  Read CLINICAL_WORKSPACE_DEEPDIVE.md (Queue/EOD sections).

12f — Inventory Safety (T3.24, T3.31):
  Read INVENTORY_DEEPDIVE.md + SETTINGS_DEEPDIVE.md. Quick wins (~2 hrs).
```

### Step 4 Planning Prompt — Phase 3 High-Value

```
Phase 3 Essential is complete. I want to work on Phase 3 High-Value.
These are in Batch 13 of the Implementation Batch Order section.

Main agent: read the 8 sub-batches below. Recommend which to start with
based on effort, impact, and unmet dependencies.

After I pick one, spawn an implementation-planner sub-agent with this brief:

"You are planning Phase 3 sub-batch [13x] for VetConnect.
Tasks: [TASK IDS]
1. Read MASTER_TASKLIST.md Phase 3 section — get task details
2. Look up backing files in the cross-reference table — read them
3. Most are NEW FEATURES with only partial backing — also read source files
4. Design the solution: data model, UI components, Firestore schema, integration points
5. Plan the feature end-to-end
6. For each task: one-line 'done when' acceptance check
7. Save as PHASE3_[BATCH_NAME]_PLAN.md"

Show me the plan. I will approve before any code changes.
```

Sub-batch reference for the planner:

```
13a — EMR + Multi-Vaccine UI (T3.1, T3.2, T3.3):
  Read CLINICAL_WORKSPACE_DEEPDIVE.md. T3.3 overlaps T3.52 — skip if T3.52 done.

13b — Dispensing Hardening (T3.36, T3.37, T3.38, T3.39):
  Read SETTINGS_DEEPDIVE.md (dispensing section) + INVENTORY_DEEPDIVE.md.

13c — Inventory Operations (T3.21, T3.26, T3.27):
  Read INVENTORY_DEEPDIVE.md. Reorder alerts + adjustment types + export.

13d — Appointment Lifecycle (T3.32, T3.34):
  Read MOBILE_BOOKING_DEEPDIVE.md. T3.34 requires Blaze.

13e — Testing Foundation (T3.14):
  Read CLINICAL_WORKSPACE_DEEPDIVE.md (pulse section).
  First and only test suite in the project. Jest + pulseUtils.js.

13f — Dashboard A+ Analytics (T3.43, T3.50):
  Read DASHBOARD_DEEPDIVE.md. Extended revenue trend + file restructure.

13g — RA 10173 Informed Consent (T3.5):
  [NO BACKING]. Largest single task (8-12 days). Needs legal research + UI design.

13h — Multi-Pet Visit (T3.12):
  Read MOBILE_BOOKING_DEEPDIVE.md. 15-20 hrs, 11 sub-tasks. Depends T2.78.
```

### Step 5 Planning Prompt — Phase 4 S-Tier

```
I want to work on Phase 4 S-Tier for [MODULE NAME].

Main agent: read the Phase 4 Summary table in MASTER_TASKLIST.md. Get this
module's S-Push task IDs and key dependencies. Verify all dependencies are DONE.
If any aren't, tell me what's blocking.

If clear, spawn an implementation-planner sub-agent with this brief:

"You are planning Phase 4 S-Tier for [MODULE] in VetConnect.
Tasks: [TASK IDS from Phase 4 Summary]
1. Read MASTER_TASKLIST.md Phase 4 section — get task details
2. Read [DEEPDIVE_FILE] from cross-reference table (Phase 4 rows) for architecture context
3. These are NEW FEATURES on top of a completed module — design from scratch
4. Read the source files to understand the current state
5. Plan every S-tier task for this module
6. For each task: one-line 'done when' acceptance check
7. Save as [MODULE]_S_TIER_PLAN.md"

Show me the plan. I will approve before any code changes.
```

S-Push modules (replace [MODULE NAME] with one of these):

```
Dashboard S-Push (T4.1-T4.4) — depends T2.315, T2.320, T2.333
Queue S-Push (T4.5-T4.10) — depends T2.214, T2.281, T2.331, T2.442
ClinicalWorkspace S-Push (T4.11-T4.17) — depends T2.32, T2.442, T2.461
POSModal S-Push (T4.18-T4.23) — depends T2.101, T2.102, T2.105, Blaze
Records S-Push (T4.24-T4.28) — depends T2.57, T2.71, T2.75, T2.130
Patients/EMR S-Push (T4.29-T4.34) — depends T2.134, T2.135, T2.460, Blaze
Services S-Push (T4.35-T4.38) — depends T2.301
Inventory S-Push (T4.39-T4.43) — depends T3.21-T3.25
Staff S-Push (T4.44-T4.48) — depends Blaze, T3.40, T3.42
Sales S-Push (T4.49-T4.53) — depends T2.137, T2.141, T4.21
Settings S-Push (T4.54-T4.58) — depends T2.180, T2.181
Monitor S-Push (T4.59-T4.63) — depends T2.273-T2.275, T4.6
Expenses S-Push (T4.64-T4.68) — depends Blaze
Login S-Push (T4.69-T4.73) — depends T2.277, Blaze
Mobile S-Push (T4.74-T4.80) — depends T2.434, Blaze
```

### Step 6 Planning Prompt — Phase 3 Optional

```
I want to work on [BATCH NAME] from Phase 3 Optional (Batch 14).

Main agent: spawn an implementation-planner sub-agent with this brief:

"You are planning Phase 3 optional batch [BATCH NAME] for VetConnect.
Tasks: [TASK IDS from Batch 14 table]
1. Read MASTER_TASKLIST.md Phase 3 section — get task details
2. Most have [NO BACKING] or partial backing — read source files directly
3. Design the feature from scratch: data model, UI, Firestore schema, integration
4. For each task: one-line 'done when' acceptance check
5. Save as PHASE3_[BATCH_NAME]_PLAN.md"

Show me the plan. I will approve before any code changes.
```

Optional batches (pick based on interest):

```
LLM Chatbot (T3.62-T3.67) — ~4 hrs, Blaze + LLM
Advanced Inventory (T3.22, T3.23, T3.25) — 5-10 days, hardware-dependent
Hospital-Grade Safety (T3.29, T3.30) — 10-13 hrs
Vaccination Deep (T3.54-T3.58) — ~4 days+
QueueScreen Polish (T3.10c, T3.59, T3.60, T3.61) — ~4 hrs
Patient Extras (T3.15-T3.20) — 2-3 weeks
Niche Features (T3.4, T3.6, T3.13, T3.28, T3.33, T3.35) — ~2 weeks
Dashboard Predictive (T3.44-T3.49) — ~12 hrs
```

---

## Shared Prompts (used across all steps)

### Execute Prompt (after plan is approved)

```
Plan approved. Now execute it.

Main agent: spawn an elite-code-engineer sub-agent with this brief:

"Read [PLAN_FILE].md for the implementation spec.
For each task in the plan:
1. Read the target source file
2. Make the changes exactly as specified in the plan
3. Report what was modified (file, lines, summary)
Do NOT deviate from the plan. If something in the plan seems wrong,
report the concern instead of improvising a fix."

After the engineer finishes, verify the build (main agent does this directly):

For ADMIN-ONLY modules (Staff, ClinicalWorkspace, Inventory, Sales,
Expenses, Services, Settings, Monitor, Queue JSX, Firestore Rules,
Printables, Records, Dashboard, Design Sweep):
  → Run: cd VetConnect-Admin && npm run build

For MOBILE-ONLY modules (Mobile Client sub-modules MOB-1 through MOB-8,
Mobile A- push):
  → Run: cd VetConnect && npx expo export --platform web
  (or if Expo export fails, run: npx tsc --noEmit to check types)

For MIXED modules (Login [T2.266], Patients CRM [T2.119], Vaccination
Redesign [T2.479], Booking Engine [T2.11]):
  → Run BOTH admin and mobile builds

If build PASSES: report the result to me.
If build FAILS:
  1. Show me the error
  2. Identify which task likely caused it
  3. Propose a fix (do NOT apply it without my approval)
  4. If the fix is trivial (missing import, typo), ask: "Shall I fix this directly?"
  5. If the fix requires re-thinking the plan, say so — I may need to revise
```

### Audit Prompt (optional — use for >10 tasks or Firestore changes)

```
Before I test, run a code review.

Main agent: spawn a code-quality-reviewer sub-agent with this brief:

"The elite-code-engineer just implemented [MODULE/BATCH].
Read [PLAN_FILE].md to see the planned changes and their 'done when' acceptance checks.
Review the changed files for:
1. Regression risk — did any change break existing functionality?
2. Missing edge cases — null guards, empty arrays, undefined fields
3. Firestore rule compatibility — do new writes include all required fields?
4. Design token compliance — new styles use tokens, not hardcoded values?
5. Import hygiene — no unused imports, no circular dependencies
6. Scope completeness — for each task in the plan, verify the 'done when' acceptance
   check passes. Flag any task where the code change was partial or missing.
7. Stub detection — for each new UI element (button, link, handler), verify it
   performs its described action, not a placeholder (toast, console.log, alert, no-op).
Only review CHANGED lines and immediate context. Do NOT re-audit entire files."

Show me the reviewer's findings before I test (browser for admin, Expo for mobile).
```

### Commit Prompt (after testing passes — browser for admin, Expo for mobile)

```
All good. Do these directly (no sub-agent needed):

1. Update MASTER_TASKLIST.md: change TODO → DONE for every task completed
2. Commit with message: fix/feat([scope]): [brief description]
3. Tell me what's next based on the Module Sequence / trajectory
```

---

## Complete Prompt Chain Reference

```
SESSION START (Prompt 1) — once per session, reads 3 files

STEP 0: Prerequisites (Prompt 2) — once ever
  → Execute → build → test → Commit

STEP 1: Phase 2 Modules — repeat per module:
  Module Plan (Prompt 3) → review → Execute → build → test → Commit → next module

STEP 2: Thesis (T1.1-T1.10) — interleave anytime, no special prompt

STEP 3: Phase 3 Essential — repeat per sub-batch:
  Step 3 Plan → review → Execute → build → test → Commit → next sub-batch

STEP 4: Phase 3 High-Value — repeat per sub-batch:
  Step 4 Plan → review → Execute → build → test → Commit → next sub-batch

STEP 5: Phase 4 S-Tier — repeat per module:
  Step 5 Plan → review → Execute → build → test → Commit → next module

STEP 6: Phase 3 Optional — pick and choose:
  Step 6 Plan → review → Execute → build → test → Commit
```

---

## Implementation Batch Order (Reference — for dependency chains and pre-built prompts)

### Batch 0: Prerequisites (must ship before ANY other work)

| Task | Name | Effort | Why First |
|---|---|---|---|
| T2.442 | Fix designTokens.js: remove GLASS, add missing tokens | 30 min | Dashboard + all new components need correct tokens |
| T2.434 | Create mobileTokens.js | 30 min | Mobile screens need token file before conversion |
| T2.342 | Delete dead pages/Staff.jsx + move Dashboard to features/Dashboard/ | 10 min | Dashboard can't be built in pages/ |

**Prompt for Batch 0:**
```
Use the implementation-planner sub-agent to plan Batch 0 (Prerequisites).

Tasks: T2.442, T2.434, T2.342
Context:
- T2.442: Read VetConnect-Admin/src/theme/designTokens.js. Remove the GLASS export (it uses
  glassmorphism contradicting neubrutalism). Add missing color tokens: #FFF8E1 (surface.cream),
  #757575 (textDisabled), #B71C1C (dangerDark). See EXPENSES_DEEPDIVE.md and INVENTORY_DEEPDIVE.md
  for the full list of orphan colors that need tokens.
- T2.434: Create VetConnect/src/theme/mobileTokens.js with COLORS, SHADOW, CARD_STYLES,
  BUTTON_STYLES, INPUT_STYLES, TYPE. Use LoginScreen.js and RegisterScreen.js as the reference
  implementation (positioned View shadows, borderRadius:0, press snap).
- T2.342: Delete VetConnect-Admin/src/pages/Staff.jsx (zero imports, confirmed dead). Move
  Dashboard.jsx to VetConnect-Admin/src/features/Dashboard/Dashboard.jsx. Update import in App.jsx.
  Verify with npm run build.

Output a file-by-file change list. No code execution yet.
```

---

### Batch 1: Critical Fixes (~1.5 hrs — ship IMMEDIATELY after prerequisites)

| Task | Name | Effort | File |
|---|---|---|---|
| T2.259 | Login: add disabled flag check | 5 min | Login.jsx |
| T2.260 | Login: sign out in catch block | 5 min | Login.jsx |
| T2.363 | UserProfile: write emergencyName + fix BookAppointment reader | 10 min | UserProfileScreen.js, BookAppointment.js |
| T2.384 | ClientDashboard: fix queue-ahead (date → scheduledDateStr) | 15 min | ClientDashboard.js |
| T2.394 | ClientAppointments: fix ghost filter (cancelReason → auditReason) | 5 min | ClientAppointments.js |
| T2.395 | ClientAppointments: fix cancel (add auditReason) | 5 min | ClientAppointments.js |
| T2.373 | MyPetsScreen: fix allergy field read | 5 min | MyPetsScreen.js |
| T2.514 | WalkInModal: inject allergyArray into pet document | 5 min | WalkInModal.jsx |
| T2.518 | ClinicalWorkspace: unify allergy field source across views | 10 min | ClinicalWorkspace.jsx |
| T2.343 | QueueScreen: auth null guard | 15 min | QueueScreen.js |
| T2.344 | QueueScreen: status null guard | 5 min | QueueScreen.js |

**No dependencies between these — can be implemented in any order.**

**Prompt for Batch 1:**
```
Use the implementation-planner sub-agent to plan Batch 1 (Critical Fixes).

Tasks: T2.259, T2.260, T2.363, T2.384, T2.394, T2.395, T2.373, T2.514, T2.518, T2.343, T2.344
Context: These are all CRITICAL/P0 bugs. See MOBILE_CLIENT_DEEPDIVE.md, LOGIN_DEEPDIVE.md,
and the JSX audit findings in handoff.json session_2026_04_20_supplement.critical_bugs_found.
Each is a surgical fix (1-15 lines changed per file). No architectural changes.

Key details:
- T2.363: Write BOTH emergencyName flat field in UserProfileScreen AND update BookAppointment
  to check emergencyContacts[0]?.name as fallback. Decision locked: both sides.
- T2.518: Standardize to patient?.petAllergies || patient?.allergies in ALL three views
  (Identity Strip ~L1310, God-View ~L1872, Zen-mode ~L1799).
- T2.514: In WalkInModal handleSubmit, before the pet transaction.set, add
  petAllergies: resolvedAllergies to the pet payload (currently always empty string).

Output a file-by-file change list with exact line numbers and code snippets.
```

---

### Batch 2: Admin P0/P1 Fixes (~4 hrs)

**Dependencies:** Batch 0 must be complete (designTokens.js fixed).

| Task | Name | Effort | Depends On |
|---|---|---|---|
| T2.243-T2.246 | Expenses security (user, route, rules, validation) | 35 min | — |
| T2.231-T2.232 | Monitor race condition + prefix display | 45 min | — |
| T2.208-T2.209 | Staff password + phone validation | 35 min | — |
| T2.210-T2.215 | Staff remaining P1 fixes | 45 min | — |
| T2.505-T2.508 | Queue JSX fixes (Grid v1, deprecated prop, null guards) | 25 min | — |
| T2.519 | ClinicalWorkspace God-View: add vaccine + lab + draft | 45 min | — |
| T2.262 | Route-level role protection in App.jsx | 30 min | — |

---

### Batch 3: Vaccination System Redesign (~3.25 hrs)

**Dependencies:** Batch 1 complete (allergy field unified).

| Order | Task | Depends On |
|---|---|---|
| 1 | T2.476 — Create VACCINE_CATALOG | — |
| 2 | T2.477 — Replace vaccine TextField with dropdown | T2.476 |
| 3 | T2.472 — Promote vaccineData to vaccineAdministrations[] | T2.477 |
| 4 | T2.474 — Auto-populate from inventory batch | T2.472 |
| 5 | T2.478 — Update PatientDashboard tracker | T2.472 |
| 6 | T2.479 — Update mobile PetHistoryScreen | T2.472 |

**T2.476 must ship first. T2.472 must ship before T2.474/T2.478/T2.479.**

---

### Batch 4: Dashboard S-Tier Build (~32 hrs, 6 days)

**Dependencies:** Batch 0 complete (T2.342 moved Dashboard, T2.442 fixed tokens). recharts installed.

| Day | What Ships |
|---|---|
| Day 1 | T2.228 (base layout) + T2.315 (useDashboardData hook) + T2.316-T2.318 (shared components) + Tab 2 Operations |
| Day 2 | Tab 1 Growth + Tab 4 Financial |
| Day 3 | Tab 3 Clinical + T2.320-T2.321 (period-over-period deltas) |
| Day 4 | T2.319 + T2.322-T2.325 (insight engine + 30 rules) |
| Day 5 | T2.326-T2.330 (drill-down navigation) + T2.333-T2.335 (exportable reports) |
| Day 6 | T2.331-T2.332 (threshold alerts) + T2.336-T2.337 (goals) + T2.338-T2.341 (context + annotations) |

---

### Batch 5: Remaining P1 Tasks (~8 hrs)

**Dependencies:** Varies — check MASTER_TASKLIST.md per task.

Key dependency chains:
- T2.32 (SoapGrid extraction) → T2.28-expanded (nextVisit UI) — SoapGrid MUST ship first
- T2.95 (per-service progress card) depends on T2.94 (delete phantom code) + T2.13 (CRM sovereignty refactor)
- T2.96 (decouple sign-off) depends on T2.95
- T2.110 (per-service pulse events) depends on T2.95

---

### Batch 6: P2 Feature Work (~40 hrs)

All remaining P2 tasks across all modules. No specific ordering required except:
- T2.115 (WalkInModal prefill) before T2.458 (PatientDashboard Quick Book button)
- T2.75/T2.453 (clinical amendments) is the most important P2

---

### Batch 7: Mobile Client Hardening (~10 hrs)

All T2.345-T2.416 that aren't already shipped in Batch 1.

---

### Batch 8: helpers.js Extraction (~1.5 hrs)

T2.427-T2.433. Do after Batch 7 so the mobile files are stable.

---

### Batch 9: PatientDashboard A+ (~11 hrs)

T2.453-T2.470. Do after Batch 5 (needs T2.75 clinical amendments).

---

### Batch 10: Mobile A- Push (~6 hrs)

T2.480-T2.504. MyPetsScreen filters, QueueScreen A-tier, UserProfileScreen parity.

---

### Batch 11: Design Sweep — LAST (~16 hrs)

**Dependencies:** ALL bug fixes and feature work complete. This is terminal polish.

| Order | Task | Effort |
|---|---|---|
| 1 | T2.450 — fontWeight fix across entire admin (including Queue + CW) | 1 hr |
| 2 | T2.443 — Patients module sweep (13 files) | 2 hrs |
| 3 | T2.444 — Services module sweep (6 files) | 1 hr |
| 4 | T2.445 — Inventory module sweep (8 files) | 1.5 hrs |
| 5 | T2.446 — Sales module sweep (3 files) | 30 min |
| 6 | T2.447 — Staff module sweep (5 files) | 45 min |
| 7 | T2.448 — Standalone pages sweep (Settings, Monitor, Expenses, Login) | 1.5 hrs |
| 8 | T2.449 — Shared components sweep (Sidebar, POSModal) | 30 min |
| 9 | T2.451 — Replace alert()/confirm() with MUI Dialog/Snackbar | 2 hrs |
| 10 | T2.435-T2.441 — Mobile screen conversions (7 files) | 4.5 hrs |

**Regression protocol for sweep:**
1. Screenshot every route BEFORE starting
2. One module per commit
3. `npm run build` after each module
4. Visual comparison against baseline screenshots
5. `git revert <hash>` if anything looks wrong

---

### Batch 12: Phase 3 — Essential (~28 hrs)

> 13 tasks that gate other work or fill critical gaps. Ship these before any Phase 4.

| Order | Batch Name | Tasks | Effort | Notes |
|---|---|---|---|---|
| 12a | Staff Auth Production Path | T3.40, T3.41, T3.42 | ~6 hrs | Blaze required. Gates T4.44. Revoke/re-enable/password are one story |
| 12b | Forensic Reporting | T3.8 | 3-4 days | P1. Thesis narrative. Proves audit system works at scale |
| 12c | Legal Compliance (RA 10173) | T3.11 | 4 hrs | Right-to-erasure. Philippine data privacy law |
| 12d | Vaccination A-Tier | T3.51, T3.52, T3.53 | 7.5 hrs | Firestore catalog + printable passport + overdue alerts. After T2.476-T2.479 |
| 12e | Queue Workflow Gaps | T3.9, T3.10a, T3.10b, T3.10d | 4.5-6.5 hrs | Terminal revert + Records quick link + recently resolved + global search |
| 12f | Inventory Safety | T3.24, T3.31 | ~2 hrs | Expiry disposal + configurable no-show window. Quick wins |

---

### Batch 13: Phase 3 — High-Value (~45 hrs)

> 16 tasks with significant UX/business improvement. System works without them, but noticeably better with.

| Order | Batch Name | Tasks | Effort | Notes |
|---|---|---|---|---|
| 13a | EMR + Multi-Vaccine UI | T3.1, T3.2, T3.3 | 2.5 days | EMRDrawer + multi-vaccine + passport. T3.3 overlaps T3.52 |
| 13b | Dispensing Hardening | T3.36, T3.37, T3.38, T3.39 | 4.5 hrs | Hold for review + stock verify + batch picker + partial dispensing |
| 13c | Inventory Operations | T3.21, T3.26, T3.27 | 4 hrs | Reorder alerts + adjustment types + CSV/PDF export |
| 13d | Appointment Lifecycle | T3.32, T3.34 | 4 hrs | Client confirmation + push reminders. Blaze for T3.34 |
| 13e | Testing Foundation | T3.14 | 3-4 hrs | First and only test suite in the project |
| 13f | Dashboard A+ Analytics | T3.43, T3.50 | 2.5 hrs | Extended revenue trend + file restructure |
| 13g | RA 10173 Informed Consent | T3.5 | 8-12 days | Largest single task. Post-defense legal compliance |
| 13h | Multi-Pet Visit | T3.12 | 15-20 hrs | 11 sub-tasks. Depends on T2.78. Major feature |

---

### Batch 14: Phase 3 — Optional (skip without consequence)

> 38 tasks. Nice-to-have features that don't gate anything. Pick based on time/interest.

| Batch Name | Tasks | Effort | Notes |
|---|---|---|---|
| LLM Chatbot | T3.62-T3.67 | ~4 hrs | All 6 tasks. Blaze + LLM. Chatbot is functional without |
| Advanced Inventory | T3.22, T3.23, T3.25 | 5-10 days | Barcode scanning + valuation report + supplier directory |
| Hospital-Grade Safety | T3.29, T3.30 | 10-13 hrs | Structured allergies + barcode scan before admin |
| Vaccination Deep | T3.54, T3.55, T3.56, T3.57, T3.58 | ~4 days+ | Protocol engine + push + recall + QR cert + BAI |
| QueueScreen Polish | T3.10c, T3.59, T3.60, T3.61 | ~4 hrs | Resolved toggle + service times + pet tips + GPS geofencing |
| Patient Extras | T3.15, T3.16, T3.17, T3.18, T3.19, T3.20 | 2-3 weeks | Auth + household + comms + referrals + photos + analytics |
| Niche Features | T3.4, T3.6, T3.13, T3.28, T3.33, T3.35 | ~2 weeks | Grooming form + LLM gateway + partial refund + ward labels + waitlist |
| Dashboard Predictive | T3.44-T3.49 | ~12 hrs | Turnover + shrinkage + demand forecast + reorder + funnel |

---

### Batch 15: Phase 4 — S-Tier Push (~154 hrs)

> 77 active tasks (T4.1-T4.80, 3 absorbed). Each module has its own S-Push batch.
> Prerequisites: ALL Phase 2 tasks + relevant Phase 3 Essential batches complete.
> Full task details in MASTER_TASKLIST.md "Phase 4 — S-Tier Roadmap" section.

| Order | Batch Name | Tasks | Effort | Key Dependencies |
|---|---|---|---|---|
| 15a | Dashboard S-Push | T4.1-T4.4 | 7.5 hrs | T2.315, T2.320, T2.333 |
| 15b | Queue S-Push | T4.5-T4.10 | 13 hrs | T2.214, T2.281, T2.331, T2.442 |
| 15c | ClinicalWorkspace S-Push | T4.11-T4.17 | 17 hrs | T2.32, T2.442, T2.461 |
| 15d | POSModal S-Push | T4.18-T4.23 | 12 hrs | T2.101, T2.102, T2.105, Blaze |
| 15e | Records S-Push | T4.24-T4.28 | 10 hrs | T2.57, T2.71, T2.75, T2.130 |
| 15f | Patients/EMR S-Push | T4.29-T4.34 | 11 hrs | T2.134, T2.135, T2.460, Blaze |
| 15g | Services S-Push | T4.35-T4.38 | 7 hrs | T2.301 |
| 15h | Inventory S-Push | T4.39-T4.43 | 10-12 hrs | T3.21-T3.25 |
| 15i | Staff S-Push | T4.44-T4.48 | 11-12 hrs | Blaze, T3.40, T3.42 |
| 15j | Sales S-Push | T4.49-T4.53 | 9.5 hrs | T2.137, T2.141, T4.21 |
| 15k | Settings S-Push | T4.54-T4.58 | 10 hrs | T2.180, T2.181 |
| 15l | Monitor S-Push | T4.59-T4.63 | 6.5 hrs | T2.273-T2.275, T4.6 |
| 15m | Expenses S-Push | T4.64-T4.68 | 10.5 hrs | Blaze |
| 15n | Login S-Push | T4.69-T4.73 (excl T4.70) | 5 hrs 10 min | T2.277, Blaze |
| 15o | Mobile S-Push | T4.74-T4.80 (excl T4.77) | 13.5 hrs | T2.434, Blaze |

**Recommended S-tier order:** Start with modules that already have the most Phase 2 work done. Dashboard (15a) → Records (15e) → POSModal (15d) → the rest by interest.

---

## Task-to-Source Cross-Reference

> Use this table to find the backing documentation for any task.
> Sub-agents: look up the task ID range here before planning. Read the listed file(s) for code quotes, line numbers, and field-level findings.
> Tasks marked **[NO BACKING]** need a full planning pass — the planner must read the source files directly, not a deep-dive.

### Phase 1 — Thesis

| Task Range | Backing File(s) | What's In There |
|---|---|---|
| T1.1-T1.2 | handoff.json → `divergences` (D1-D7) | 7 thesis-vs-code divergences with specific claims to correct |
| T1.4 | handoff.json → `divergences` (D1-D7) | Same divergences, formatted as defense addendum |
| T1.5-T1.6, T1.9-T1.10 | handoff.json → `terminology_locked`, CLINICAL_WORKSPACE_DEEPDIVE.md | Locked terms (visit/case/medical_record), pulse engine analysis |
| T1.3, T1.7-T1.8 | handoff.json → `architectural_investments`, `terminology_locked` | Feature list, glossary definitions |

### Phase 2 — Code Tasks

| Task Range | Backing File(s) | What's In There |
|---|---|---|
| T2.1-T2.4 | **[NO BACKING]** — early session, pre-deep-dive | RBAC rules + printables. Read Firestore rules + ClinicalWorkspace directly |
| T2.5-T2.6, T2.23, T2.79, T2.81-T2.89 | MOBILE_BOOKING_DEEPDIVE.md | useBookingEngine flow, slot scheduling, tiered pricing bugs |
| T2.7-T2.11 | **[NO BACKING]** — early session | Misc cleanup. Read target files directly |
| T2.12-T2.54 | CLINICAL_WORKSPACE_DEEPDIVE.md | 13-question audit: SOAP, pulse engine, God-View, sign-off, follow-up, seal, EOD |
| T2.57-T2.75 | CLINICAL_WORKSPACE_DEEPDIVE.md (Records section) | Records.jsx filters, case-grouping, amendment path, lineage |
| T2.76-T2.78 | MOBILE_BOOKING_DEEPDIVE.md | QR check-in, ticket prefix, visitGroupId |
| T2.80 | CLINICAL_WORKSPACE_DEEPDIVE.md (POSModal section) | POSModal services[] rewrite for multi-service billing |
| T2.93-T2.111 | CLINICAL_WORKSPACE_DEEPDIVE.md + handoff.json → `session_2026_04_17_supplement` | Service completion, per-service tracking, pulse events, POSModal |
| T2.112-T2.136 | PATIENTS_CRM_DEEPDIVE.md | 11-agent audit: CRM, PatientDashboard, pet CRUD, billing ledger, client fields |
| T2.137-T2.148 | SALES_DEEPDIVE.md | 3 files: Sales.jsx, EodSummary, POSModal. EOD model, refund lifecycle, 4 locked decisions |
| T2.149-T2.176 | INVENTORY_DEEPDIVE.md | 8 files, 38 bugs: stock transactions, FIFO batches, allergen safety, dispensing labels |
| T2.177-T2.190 | SETTINGS_DEEPDIVE.md | Settings.jsx audit, dispensing hardening, no-show rebook, 25 tasks |
| T2.191-T2.207 | SERVICES_DEEPDIVE.md | 6 files: ServiceTable, FormModal, ActivityLog, LogModal. Tiered pricing, archive guards |
| T2.208-T2.227 | STAFF_DEEPDIVE.md | 5 files, 2 CRITICAL: hardcoded password, phone validation. Role preserve, workload query |
| T2.228-T2.341 | DASHBOARD_DEEPDIVE.md | 7-line stub → full S-tier scope. Tab structure, KPI definitions, insight rules, drill-downs |
| T2.231-T2.242, T2.273-T2.275 | MONITOR_DEEPDIVE.md | 125 lines, 13 bugs: race condition, missing prefix, priority system, sidebar link |
| T2.243-T2.258 | EXPENSES_DEEPDIVE.md | 382 lines, 19 bugs: no auth, no route guard, hardcoded user, no Firestore rules |
| T2.259-T2.266, T2.277-T2.278 | LOGIN_DEEPDIVE.md | 169 lines, 2 CRITICAL: disabled check missing, catch-block no signout |
| T2.342 | DASHBOARD_DEEPDIVE.md | Dead pages/Staff.jsx confirmation, Dashboard move rationale |
| T2.343-T2.354 | MOBILE_CLIENT_DEEPDIVE.md → QueueScreen section | Auth null guard, lobby query privacy, status filter gaps |
| T2.355-T2.362 | MOBILE_CLIENT_DEEPDIVE.md → ChatbotScreen section | workingDays, services catalog, fake input bar |
| T2.363-T2.372 | MOBILE_CLIENT_DEEPDIVE.md → UserProfileScreen section | emergencyName loop, phone validation, field parity |
| T2.373-T2.383 | MOBILE_CLIENT_DEEPDIVE.md → MyPetsScreen section | Allergy field read, N+1 queries, soft delete |
| T2.384-T2.393 | MOBILE_CLIENT_DEEPDIVE.md → ClientDashboard section | queue-ahead wrong field, petName crash, status query |
| T2.394-T2.401 | MOBILE_CLIENT_DEEPDIVE.md → ClientAppointments section | Ghost filter, cancel auditReason, CSS bug |
| T2.402-T2.409 | MOBILE_CLIENT_DEEPDIVE.md → PetHistoryScreen section | SOAP visibility, dischargeSummary, PDF rewrite |
| T2.410-T2.416 | MOBILE_CLIENT_DEEPDIVE.md → SuperCard section | Hardcoded phone/address, queue-ahead, useClinicContact |
| T2.417-T2.426 | MOBILE_CLIENT_DEEPDIVE.md → RegisterScreen section | Auth rollback, guest merge, accountStatus |
| T2.427-T2.433 | MOBILE_CLIENT_DEEPDIVE.md → helpers.js section | Shared utility extraction: phone, price, age, date |
| T2.434-T2.441 | MOBILE_CLIENT_DEEPDIVE.md (design findings) + handoff.json → `design_system_findings` | mobileTokens.js spec, per-screen conversion notes |
| T2.442-T2.451 | handoff.json → `design_system_findings` + per-module deep-dives (hardcoded color counts) | designTokens.js fix, per-module sweep scope. Color counts in each module's deep-dive |
| T2.453-T2.470 | PATIENTS_CRM_DEEPDIVE.md → PatientDashboard section | Vitals display gaps, weight trend, search expansion, amendment system |
| T2.472-T2.479 | CLINICAL_WORKSPACE_DEEPDIVE.md (vaccine section) + MOBILE_CLIENT_DEEPDIVE.md → PetHistoryScreen | Vaccine data model, VACCINE_CATALOG spec, PatientDashboard tracker, mobile display |
| T2.480-T2.483 | MOBILE_CLIENT_DEEPDIVE.md → MyPetsScreen section | Filter chips, sort options, book button, vaccine badge |
| T2.484-T2.490 | MOBILE_CLIENT_DEEPDIVE.md → QueueScreen section | Position indicator, countdown, alerts, multi-pet |
| T2.497-T2.504 | MOBILE_CLIENT_DEEPDIVE.md → UserProfileScreen section | Field parity with admin ClientDetails |
| T2.505-T2.513 | handoff.json → `critical_bugs_found` | Queue.jsx + queueColumns.jsx JSX audit: Grid v1, deprecated prop, null guards |
| T2.514-T2.517 | handoff.json → `critical_bugs_found` + INVENTORY_DEEPDIVE.md (allergy section) | WalkInModal: allergyArray never written, unused imports |
| T2.518-T2.523 | handoff.json → `critical_bugs_found` + CLINICAL_WORKSPACE_DEEPDIVE.md | ClinicalWorkspace JSX audit: allergy unify, God-View gaps, dead code |

### Phase 3 — Future & Long-Form

| Task Range | Backing File(s) | What's In There |
|---|---|---|
| T3.1-T3.3 | CLINICAL_WORKSPACE_DEEPDIVE.md (partial) | EMRDrawer concept mentioned. Multi-vaccine data model in vaccine section |
| T3.4 | **[NO BACKING]** | Grooming-specific form. No analysis exists |
| T3.5 | **[NO BACKING]** | RA 10173 informed consent. Needs legal research + UI design from scratch |
| T3.6 | **[NO BACKING]** | LLM gateway. Needs architecture design |
| T3.8 | CLINICAL_WORKSPACE_DEEPDIVE.md (pulse engine section) | Pulse metrics, forensic seal, audit trail — the data this dashboard would surface |
| T3.9, T3.10b-T3.10d | CLINICAL_WORKSPACE_DEEPDIVE.md (Queue/EOD sections) | Terminal states, resolved handling, queue search gaps |
| T3.11 | **[NO BACKING]** | RA 10173 right-to-erasure. Needs legal + Firestore schema analysis |
| T3.12 | MOBILE_BOOKING_DEEPDIVE.md (multi-pet section) | visitGroupId concept, booking flow for multiple pets |
| T3.13 | SALES_DEEPDIVE.md (refund section) | Refund lifecycle context. Partial refund is new feature on top |
| T3.14 | CLINICAL_WORKSPACE_DEEPDIVE.md (pulse section) | pulseUtils.js function signatures and edge cases documented |
| T3.15-T3.20 | PATIENTS_CRM_DEEPDIVE.md (partial) | Client field analysis. Features themselves are new |
| T3.21-T3.28 | INVENTORY_DEEPDIVE.md (partial) | Inventory schema, batch system. Features are new but schema is documented |
| T3.29-T3.30 | INVENTORY_DEEPDIVE.md (allergen section) | T2.175 allergen system design. These supersede/extend it |
| T3.31 | SETTINGS_DEEPDIVE.md (no-show section) | No-show rebook system design, hardcoded 30-day window |
| T3.32-T3.35 | MOBILE_BOOKING_DEEPDIVE.md (partial) + SETTINGS_DEEPDIVE.md (no-show section) | Booking flow, appointment lifecycle. Features are new |
| T3.36-T3.39 | SETTINGS_DEEPDIVE.md (dispensing section) + INVENTORY_DEEPDIVE.md | Dispensing flow documented. Hold/batch/partial are new features |
| T3.40-T3.42 | STAFF_DEEPDIVE.md | Staff auth analysis, Firestore-only flag limitation documented |
| T3.43-T3.49 | DASHBOARD_DEEPDIVE.md (partial) | Dashboard data model. Predictive features are new |
| T3.50 | **[NO BACKING]** | File restructure. Read current directory structure directly |
| T3.51-T3.58 | CLINICAL_WORKSPACE_DEEPDIVE.md (vaccine section) + MOBILE_CLIENT_DEEPDIVE.md | Vaccine data model, VACCINE_CATALOG spec. Advanced features are new |
| T3.59-T3.61 | MOBILE_CLIENT_DEEPDIVE.md → QueueScreen section | QueueScreen analysis. GPS/tips are new features |
| T3.62-T3.67 | MOBILE_CLIENT_DEEPDIVE.md → ChatbotScreen section | Current chatbot architecture. LLM integration is new |

### Phase 4 — S-Tier

| Task Range | Backing File(s) | What's In There |
|---|---|---|
| T4.1-T4.4 | DASHBOARD_DEEPDIVE.md | Dashboard architecture. S-features are new on top |
| T4.5-T4.10 | CLINICAL_WORKSPACE_DEEPDIVE.md (Queue sections) + handoff.json → `design_system_findings` | Queue analysis. Drag-drop/forecasting/design sweep are new |
| T4.11-T4.17 | CLINICAL_WORKSPACE_DEEPDIVE.md | CW architecture, God-View analysis. Templates/attachments/voice are new |
| T4.18-T4.23 | CLINICAL_WORKSPACE_DEEPDIVE.md (POSModal section) + SALES_DEEPDIVE.md | Billing flow. Partial pay/tax/GCash are new |
| T4.24-T4.28 | CLINICAL_WORKSPACE_DEEPDIVE.md (Records section) | Records architecture. Full-text/export/comparison are new |
| T4.29-T4.34 | PATIENTS_CRM_DEEPDIVE.md | Patient/pet data model. Engagement scoring/growth charts are new |
| T4.35-T4.38 | SERVICES_DEEPDIVE.md | Service schema. Packages/promos/analytics are new |
| T4.39-T4.43 | INVENTORY_DEEPDIVE.md | Inventory schema, batch system. Auto-reorder/barcode/heatmap are new |
| T4.44-T4.48 | STAFF_DEEPDIVE.md | Staff data model. Auth CF/scheduling/KPIs are new |
| T4.49-T4.53 | SALES_DEEPDIVE.md | Sales schema. Date range/P&L/VAT/reconciliation are new |
| T4.54-T4.58 | SETTINGS_DEEPDIVE.md | Settings schema. History/preview/multi-location are new |
| T4.59-T4.63 | MONITOR_DEEPDIVE.md | Monitor architecture. Multi-room/carousel/weather are new |
| T4.64-T4.68 | EXPENSES_DEEPDIVE.md | Expenses schema. Receipt scan/recurring/budgets are new |
| T4.69-T4.73 | LOGIN_DEEPDIVE.md | Login flow. MFA/biometric/session timeout are new |
| T4.74-T4.80 | MOBILE_CLIENT_DEEPDIVE.md (all sections) | Mobile architecture. Offline/push/dark mode are new |

---

## Prompt Templates for Each Batch

### Splitting rule: one planner per deep-dive affinity

Do NOT send an entire batch to a single planner if the tasks span multiple deep-dive files.
Split by which deep-dive backs the tasks — tasks sharing a deep-dive go to one planner.
Run planners in parallel when they read different files.

**Exception:** Batch 0 and Batch 3 (vaccination chain) are small/sequential enough for a single planner.

### Batch 1 parallel split (reference example):

```
Run these 3 implementation-planner sub-agents IN PARALLEL:

Planner 1A — Login Fixes (T2.259, T2.260):
  Read LOGIN_DEEPDIVE.md, then Login.jsx.
  Output: BATCH_1A_LOGIN_PLAN.md

Planner 1B — Mobile Critical (T2.363, T2.384, T2.394, T2.395, T2.373, T2.343, T2.344):
  Read MOBILE_CLIENT_DEEPDIVE.md (sections: UserProfileScreen, ClientDashboard,
  ClientAppointments, MyPetsScreen, QueueScreen).
  Then read each target source file.
  Output: BATCH_1B_MOBILE_PLAN.md

Planner 1C — Admin Allergy (T2.514, T2.518):
  Read handoff.json critical_bugs_found, then WalkInModal.jsx, then ClinicalWorkspace.jsx.
  Output: BATCH_1C_ALLERGY_PLAN.md
```

### Batch 2 parallel split (reference example):

```
Run these 4 implementation-planner sub-agents IN PARALLEL:

Planner 2A — Expenses Security (T2.243-T2.246):
  Read EXPENSES_DEEPDIVE.md, then Expenses.jsx.
  Output: BATCH_2A_EXPENSES_PLAN.md

Planner 2B — Monitor Fixes (T2.231-T2.232):
  Read MONITOR_DEEPDIVE.md, then Monitor.jsx.
  Output: BATCH_2B_MONITOR_PLAN.md

Planner 2C — Staff Fixes (T2.208-T2.209, T2.210-T2.215):
  Read STAFF_DEEPDIVE.md, then StaffFormModal.jsx, useStaffManager.js, Staff.jsx.
  Output: BATCH_2C_STAFF_PLAN.md

Planner 2D — Queue/CW/Login (T2.505-T2.508, T2.519, T2.262):
  Read handoff.json critical_bugs_found + CLINICAL_WORKSPACE_DEEPDIVE.md + LOGIN_DEEPDIVE.md.
  Then read Queue.jsx, queueColumns.jsx, ClinicalWorkspace.jsx, App.jsx.
  Output: BATCH_2D_QUEUE_CW_PLAN.md
```

### Batch 3 — single sequential planner (dependency chain):

```
Use a SINGLE implementation-planner sub-agent (SEQUENTIAL — dependency chain):

Planner 3 — Vaccination Redesign (T2.476 → T2.477 → T2.472 → T2.474, T2.478, T2.479):
  Read CLINICAL_WORKSPACE_DEEPDIVE.md (vaccine section) + MOBILE_CLIENT_DEEPDIVE.md
  (PetHistoryScreen section).
  Then read: ClinicalWorkspace.jsx, PatientDashboard.jsx, PetHistoryScreen.js.
  Plan tasks IN ORDER — T2.476 first (VACCINE_CATALOG), then T2.477 (dropdown),
  then T2.472 (data model), then T2.474/T2.478/T2.479 in parallel.
  Output: BATCH_3_VACCINATION_PLAN.md
```

### Batch 4 — sequential day-by-day planners (each builds on prior day):

```
Run these planners SEQUENTIALLY — each day's plan depends on the previous day's output:

Planner 4-Day1 — Dashboard Base + Operations Tab:
  Tasks: T2.228, T2.315, T2.316-T2.318, T2.228b, T2.229, T2.281, T2.271, T2.286-T2.288, T2.279
  Read DASHBOARD_DEEPDIVE.md. Design the component architecture, hook interface,
  and tab layout from scratch. This plan sets the foundation for all later days.
  Output: BATCH_4_DAY1_PLAN.md

Planner 4-Day2 — Growth Tab + Financial Tab:
  Tasks: T2.282, T2.307-T2.314, T2.280, T2.285, T2.230, T2.283, T2.298-T2.306, T2.270
  Read BATCH_4_DAY1_PLAN.md for established patterns, then DASHBOARD_DEEPDIVE.md.
  Output: BATCH_4_DAY2_PLAN.md

Planner 4-Day3 — Clinical Tab + Period Deltas:
  Tasks: T2.289-T2.297, T2.320-T2.321
  Read BATCH_4_DAY1_PLAN.md + BATCH_4_DAY2_PLAN.md for patterns.
  Output: BATCH_4_DAY3_PLAN.md

Planner 4-Day4 — Insight Engine + Rules:
  Tasks: T2.319, T2.322-T2.325
  Read prior day plans for data shape, then DASHBOARD_DEEPDIVE.md.
  Output: BATCH_4_DAY4_PLAN.md

Planner 4-Day5 — Drill-Downs + Reports:
  Tasks: T2.326-T2.330, T2.333-T2.335
  Read prior plans. Drill-downs need to know target page routes.
  Output: BATCH_4_DAY5_PLAN.md

Planner 4-Day6 — Alerts + Goals + Annotations:
  Tasks: T2.331-T2.332, T2.336-T2.337, T2.338-T2.341
  Read prior plans. Read Settings.jsx for threshold/goal config location.
  Output: BATCH_4_DAY6_PLAN.md
```

### Batch 5 — parallel split by named grouping (P0/P1 tasks only):

> Batch 5 = all P0/P1 tasks NOT already in Batches 0-4.
> Uses the "Batch Groupings for Implementation Planning" from MASTER_TASKLIST.md.
> Each planner reads the grouping's backing deep-dive.

```
Run these implementation-planner sub-agents IN PARALLEL:

Planner 5A — CW Sign-Off Chain (T2.32, T2.28-expanded, T2.33, T2.44, T2.42, T2.41):
  Read CLINICAL_WORKSPACE_DEEPDIVE.md (sign-off + seal + follow-up sections).
  Then read ClinicalWorkspace.jsx.
  NOTE: T2.32 (SoapGrid) MUST ship before T2.28-expanded. Plan accordingly.
  Output: BATCH_5A_CW_SIGNOFF_PLAN.md

Planner 5B — Firestore Rules + RBAC (T2.1, T2.37, T2.31):
  Read CLINICAL_WORKSPACE_DEEPDIVE.md (pulse section for T2.37).
  T2.1 and T2.31 have [NO BACKING] — read firestore.rules directly.
  Output: BATCH_5B_FIRESTORE_PLAN.md

Planner 5C — Printables (T2.2, T2.3, T2.4):
  [NO BACKING] — read ClinicalWorkspace.jsx for record format,
  CLINICAL_WORKSPACE_DEEPDIVE.md for SOAP structure and field names.
  Output: BATCH_5C_PRINTABLES_PLAN.md

Planner 5D — Service Completion Chain (T2.93, T2.94, T2.13, T2.95, T2.96, T2.80, T2.105):
  Read CLINICAL_WORKSPACE_DEEPDIVE.md (service completion section).
  Then read ClinicalWorkspace.jsx, POSModal.
  NOTE: T2.94 + T2.13 must ship before T2.95. T2.95 before T2.96.
  Output: BATCH_5D_SERVICE_COMPLETION_PLAN.md

Planner 5E — Financial Ops P1 (T2.137, T2.138, T2.139):
  Read SALES_DEEPDIVE.md. Then read Sales.jsx, EodSummary, POSModal.
  Output: BATCH_5E_FINANCIAL_PLAN.md

Planner 5F — Patients CRM P1 (T2.119, T2.112, T2.120, T2.121):
  Read PATIENTS_CRM_DEEPDIVE.md. Then read PatientDashboard.jsx, BillingLedger,
  PetList, ClientDetails.
  Output: BATCH_5F_PATIENTS_PLAN.md

Planner 5G — Inventory P1 (T2.149, T2.150, T2.151, T2.152, T2.153, T2.154, T2.155):
  Read INVENTORY_DEEPDIVE.md. Then read useInventory.js, Inventory.jsx,
  ProductFormModal.jsx, InventoryTable.jsx.
  Output: BATCH_5G_INVENTORY_PLAN.md

Planner 5H — Settings + Services P1 (T2.177, T2.178, T2.179, T2.191, T2.192, T2.193):
  Read SETTINGS_DEEPDIVE.md + SERVICES_DEEPDIVE.md.
  Then read Settings.jsx, ServiceTable.jsx, ServiceFormModal.jsx.
  Output: BATCH_5H_SETTINGS_SERVICES_PLAN.md

Planner 5I — Monitor + Expenses P1 (T2.233-T2.235, T2.242, T2.247-T2.251, T2.261):
  Read MONITOR_DEEPDIVE.md + EXPENSES_DEEPDIVE.md + LOGIN_DEEPDIVE.md (T2.261 trim).
  Then read Monitor.jsx, Expenses.jsx, Login.jsx.
  Output: BATCH_5I_STANDALONE_PLAN.md
```

### Batch 6 — parallel split by named grouping (P2 tasks only):

> Batch 6 = all P2 tasks. ~40 hrs. Uses same named groupings, filtered to P2.

```
Run these implementation-planner sub-agents IN PARALLEL:

Planner 6A — Records Renovation (T2.59, T2.61, T2.62, T2.63, T2.65, T2.70, T2.71):
  Read CLINICAL_WORKSPACE_DEEPDIVE.md (Records section).
  Then read Records.jsx.
  Output: BATCH_6A_RECORDS_PLAN.md

Planner 6B — Clinical Amendment (T2.75):
  Read CLINICAL_WORKSPACE_DEEPDIVE.md (amendment section).
  Then read ClinicalWorkspace.jsx, Records.jsx.
  Output: BATCH_6B_AMENDMENT_PLAN.md

Planner 6C — Pulse + Queue Polish (T2.38, T2.45, T2.18, T2.39, T2.46, T2.50-T2.54, T2.109):
  Read CLINICAL_WORKSPACE_DEEPDIVE.md (pulse + queue + EOD sections).
  Then read ClinicalWorkspace.jsx, Queue.jsx, pulseUtils.js.
  Output: BATCH_6C_PULSE_QUEUE_PLAN.md

Planner 6D — Service Completion P2 (T2.97, T2.100, T2.107, T2.110):
  Read CLINICAL_WORKSPACE_DEEPDIVE.md (service completion section).
  Output: BATCH_6D_SERVICE_P2_PLAN.md

Planner 6E — Financial Ops P2 (T2.101, T2.102, T2.104, T2.113, T2.140-T2.143):
  Read SALES_DEEPDIVE.md. Then read Sales.jsx, EodSummary, POSModal.
  Output: BATCH_6E_FINANCIAL_P2_PLAN.md

Planner 6F — Patients CRM P2 (T2.115, T2.116, T2.122-T2.126, T2.132):
  Read PATIENTS_CRM_DEEPDIVE.md.
  Then read PatientDashboard.jsx, WalkInModal.jsx, NewClientModal.
  Output: BATCH_6F_PATIENTS_P2_PLAN.md

Planner 6G — Inventory P2 (T2.156-T2.167, T2.170):
  Read INVENTORY_DEEPDIVE.md. Then read StockAdjustModal, ConfirmDeleteModal,
  ProductFormModal, InventoryLogModal, InventoryTable, GlobalActivityLog.
  Output: BATCH_6G_INVENTORY_P2_PLAN.md

Planner 6H — Allergen + Dispensing + No-Show (T2.175, T2.176, T2.182, T2.188-T2.190):
  Read SETTINGS_DEEPDIVE.md (dispensing + no-show sections) + INVENTORY_DEEPDIVE.md (allergen section).
  Then read ClinicalWorkspace.jsx, BookAppointment.js, WalkInModal.jsx.
  Output: BATCH_6H_ALLERGEN_NOSHOW_PLAN.md

Planner 6I — Settings P2 (T2.180, T2.181, T2.183, T2.184):
  Read SETTINGS_DEEPDIVE.md. Then read Settings.jsx.
  Output: BATCH_6I_SETTINGS_P2_PLAN.md

Planner 6J — Services P2 (T2.194-T2.199):
  Read SERVICES_DEEPDIVE.md. Then read ServiceTable, ServiceActivityLog, ServiceLogModal.
  Output: BATCH_6J_SERVICES_P2_PLAN.md

Planner 6K — Staff P2 (T2.216-T2.220):
  Read STAFF_DEEPDIVE.md. Then read StaffFormModal, StaffTable, useStaffManager.
  Output: BATCH_6K_STAFF_P2_PLAN.md

Planner 6L — Expenses + Monitor + Login P2:
  Expenses: T2.252-T2.258. Monitor: T2.236-T2.238, T2.273-T2.275. Login: T2.263-T2.266, T2.277-T2.278.
  Read EXPENSES_DEEPDIVE.md + MONITOR_DEEPDIVE.md + LOGIN_DEEPDIVE.md.
  Then read Expenses.jsx, Monitor.jsx, Login.jsx.
  Output: BATCH_6L_STANDALONE_P2_PLAN.md

Planner 6M — Queue + CW P2/P3 (T2.509-T2.513, T2.515-T2.517, T2.520-T2.523):
  Read handoff.json critical_bugs_found + CLINICAL_WORKSPACE_DEEPDIVE.md.
  Then read Queue.jsx, WalkInModal.jsx, ClinicalWorkspace.jsx.
  Output: BATCH_6M_QUEUE_CW_P2_PLAN.md
```

### Batch 7 — parallel split by mobile screen:

> Batch 7 = T2.345-T2.416 not already in Batch 1. All backed by MOBILE_CLIENT_DEEPDIVE.md.
> Split by screen section to keep each planner focused.

```
Run these implementation-planner sub-agents IN PARALLEL:

Planner 7A — QueueScreen (T2.345-T2.354):
  Read MOBILE_CLIENT_DEEPDIVE.md (QueueScreen section). Then read QueueScreen.js.
  Output: BATCH_7A_QUEUESCREEN_PLAN.md

Planner 7B — ChatbotScreen (T2.355-T2.362):
  Read MOBILE_CLIENT_DEEPDIVE.md (ChatbotScreen section). Then read ChatbotScreen.js.
  Output: BATCH_7B_CHATBOT_PLAN.md

Planner 7C — UserProfile + MyPets (T2.364-T2.372, T2.374-T2.383):
  Read MOBILE_CLIENT_DEEPDIVE.md (UserProfileScreen + MyPetsScreen sections).
  Then read UserProfileScreen.js, MyPetsScreen.js.
  Output: BATCH_7C_PROFILE_PETS_PLAN.md

Planner 7D — ClientDashboard + ClientAppointments (T2.385-T2.401):
  Read MOBILE_CLIENT_DEEPDIVE.md (ClientDashboard + ClientAppointments sections).
  Then read ClientDashboard.js, ClientAppointments.js.
  Output: BATCH_7D_DASHBOARD_APPTS_PLAN.md

Planner 7E — PetHistory + SuperCard + Register (T2.402-T2.426):
  Read MOBILE_CLIENT_DEEPDIVE.md (PetHistoryScreen + SuperCard + RegisterScreen sections).
  Then read PetHistoryScreen.js, SuperCard.js, RegisterScreen.js.
  Output: BATCH_7E_HISTORY_CARD_REG_PLAN.md
```

### Batch 8 — single planner:

```
Planner 8 — helpers.js Extraction (T2.427-T2.433):
  Read MOBILE_CLIENT_DEEPDIVE.md (helpers.js section).
  Then read each mobile screen file to find the functions to extract.
  Output: BATCH_8_HELPERS_PLAN.md
```

### Batch 9 — single planner:

```
Planner 9 — PatientDashboard A+ (T2.453-T2.470):
  Read PATIENTS_CRM_DEEPDIVE.md (PatientDashboard section).
  Then read PatientDashboard.jsx.
  16 tasks but all in one component + its deep-dive section.
  Output: BATCH_9_PATIENTDASH_PLAN.md
```

### Batch 10 — parallel split by screen:

```
Run these 3 implementation-planner sub-agents IN PARALLEL:

Planner 10A — MyPetsScreen A- (T2.480-T2.483):
  Read MOBILE_CLIENT_DEEPDIVE.md (MyPetsScreen section). Then read MyPetsScreen.js.
  Output: BATCH_10A_MYPETS_PLAN.md

Planner 10B — QueueScreen A (T2.484-T2.490):
  Read MOBILE_CLIENT_DEEPDIVE.md (QueueScreen section). Then read QueueScreen.js.
  Output: BATCH_10B_QUEUE_PLAN.md

Planner 10C — UserProfileScreen Parity (T2.497-T2.504):
  Read MOBILE_CLIENT_DEEPDIVE.md (UserProfileScreen section). Then read UserProfileScreen.js.
  Output: BATCH_10C_PROFILE_PLAN.md
```

### Batch 11 — sequential per-module planners (one commit per module):

> Design sweep MUST be sequential — screenshot before, sweep one module, build, compare, commit.
> Each planner reads the module's files and the design tokens.

```
Run these planners SEQUENTIALLY (one module at a time, verify after each):

Planner 11A — fontWeight Fix (T2.450):
  Read designTokens.js. Grep for fontWeight:'1000' across entire admin.
  Output: BATCH_11A_FONTWEIGHT_PLAN.md

Planner 11B — Patients Sweep (T2.443):
  Read designTokens.js + all 13 files in features/Patients/.
  Output: BATCH_11B_PATIENTS_SWEEP_PLAN.md

Planner 11C — Services Sweep (T2.444):
  Read designTokens.js + all 6 files in features/Services/.
  Output: BATCH_11C_SERVICES_SWEEP_PLAN.md

Planner 11D — Inventory Sweep (T2.445):
  Read designTokens.js + all 8 files in features/Inventory/.
  Output: BATCH_11D_INVENTORY_SWEEP_PLAN.md

Planner 11E — Sales Sweep (T2.446):
  Read designTokens.js + Sales.jsx, EodSummary.jsx, POSModal.jsx.
  Output: BATCH_11E_SALES_SWEEP_PLAN.md

Planner 11F — Staff Sweep (T2.447):
  Read designTokens.js + all 5 files in features/Staff/.
  Output: BATCH_11F_STAFF_SWEEP_PLAN.md

Planner 11G — Standalone Pages Sweep (T2.448):
  Read designTokens.js + Settings.jsx, Monitor.jsx, Expenses.jsx, Login.jsx.
  Output: BATCH_11G_STANDALONE_SWEEP_PLAN.md

Planner 11H — Shared Components Sweep (T2.449):
  Read designTokens.js + Sidebar.jsx, POSModal.jsx.
  Output: BATCH_11H_SHARED_SWEEP_PLAN.md

Planner 11I — alert/confirm Replacement (T2.451):
  Grep for alert( and confirm( across all admin files (excluding Queue/ + ClinicalWorkspace).
  Output: BATCH_11I_DIALOGS_PLAN.md

Planner 11J — Mobile Conversions (T2.435-T2.441):
  Read mobileTokens.js + all 7 mobile screen files.
  Output: BATCH_11J_MOBILE_SWEEP_PLAN.md
```

### Generic template (fallback for batches without a pre-built split):
```
Use the implementation-planner sub-agent to plan [BATCH NAME] ([TASK IDS]).
Read handoff.json session_2026_04_20_supplement for context.
Look up the backing file(s) in the "Task-to-Source Cross-Reference" table in
IMPLEMENTATION_GUIDE.md, then read those files for bug details and code quotes.
Read the target source files: [FILE LIST].
Output a file-by-file change list with exact line numbers, code snippets,
edge cases, and test plan. Save as [BATCH_NAME]_PLAN.md.
```

### When to use a single planner vs parallel:
- **Single planner:** ≤5 tasks, all backed by the same deep-dive, total source files <2,000 lines
- **Parallel planners:** >5 tasks OR multiple deep-dives OR total source files >2,000 lines
- **Sequential planners:** Tasks in a dependency chain (Batch 3 vaccination, Dashboard day-by-day, Design sweep)

---

## Post-Batch Checklist

> Run this after EVERY batch. Do NOT skip to the next batch without completing all steps.

```
After the engineer finishes and you've verified (browser for admin, Expo for mobile):

1. BUILD: Run `npm run build` in the affected sub-project(s).
   - VetConnect-Admin: `cd VetConnect-Admin && npm run build`
   - VetConnect (mobile): `cd VetConnect && npx expo export --platform web` (or test on device)
   If build fails → fix before proceeding. Do NOT move to step 2.

2. UPDATE STATUS: In MASTER_TASKLIST.md, change `TODO` → `DONE` for every task completed
   in this batch. Include the date: `DONE (2026-04-XX)`.

3. COMMIT: Create a git commit with format:
   `feat/fix(module): Batch N — [brief description]`
   Example: `fix(admin): Batch 1 — critical login + allergy + mobile fixes`

4. NEXT BATCH CHECK: Read IMPLEMENTATION_GUIDE.md Batch [N+1] section.
   Verify all dependencies are met (previous batches done, prerequisite tasks shipped).
   If dependencies aren't met → tell the user which tasks are blocking.

5. CONFIRM: Tell the user "Batch N complete. N tasks shipped. Ready for Batch N+1?"
   Wait for user approval before starting the next batch.
```

### To execute a plan:
```
Use the elite-code-engineer sub-agent to execute the [BATCH NAME] plan.
Read [BATCH_NAME]_PLAN.md for the implementation spec.
Read each target file before making changes.
Make the changes. Report what was modified.
```

### To review after execution:
```
Use the code-quality-reviewer sub-agent to review the [BATCH NAME] changes.
Check for: regression risk, missing edge cases, Firestore rule compatibility,
design token compliance, and any orphaned imports or dead code introduced.
```

### For tiny tasks (skip planning):
```
Implement [TASK ID] — [TASK NAME]. Read [DEEPDIVE FILE] section [SECTION]
for the bug details. Read the target file, make the fix. No plan needed.
```

---

## Code-Quality-Reviewer Usage

Use **after** the engineer finishes a batch — not during, not before.

**Cycle:** planner → you approve → engineer executes → **reviewer audits** → you test (browser/Expo) → commit

**Prompt template:**
```
Use the code-quality-reviewer sub-agent to review the [BATCH NAME] changes.
The engineer just implemented [TASK IDS] across [FILE LIST].
The plan was [PLAN_FILE.md].

Review for:
1. Regression risk — did any change break an existing feature?
2. Missing edge cases — null guards, empty arrays, undefined fields
3. Firestore rule compatibility — do new writes include all required fields?
4. Design token compliance — are new components using tokens not hardcoded values?
5. Import hygiene — no unused imports, no circular dependencies
6. Consistency with existing module patterns

Do NOT re-audit the entire file. Only review CHANGED lines and immediate context.
```

**Use for:** Dashboard build (after each day), vaccination redesign, clinical amendments, any Firestore rules changes.
**Skip for:** Batch 0 (file moves), single-line Batch 1 fixes, design sweep (use screenshot comparison instead).

---

## Known Remaining Gaps (Why Not 100%)

These are documented limitations that persist even after all ~480 tasks ship:

### 1. No Automated Tests
Zero unit, integration, or E2E tests. All correctness verification is manual.
**Impact:** No regression safety net. A future code change could reintroduce any fixed bug.
**To close:** Jest + React Testing Library for admin, Jest for mobile. Estimated: 2-3 weeks.

### 2. Queue + ClinicalWorkspace Design Debt
5,349 lines skipped from design sweep. 200+ hardcoded colors, 25+ borderRadius violations,
20 alert/confirm calls remain in the two most-used admin surfaces.
**Impact:** Visual inconsistency between swept and skipped pages.
**To close:** Full design sweep of Queue/ + ClinicalWorkspace. Estimated: 3-4 hrs but high risk.

### 3. Client-Side Timestamps (Spark Constraint)
clinicalPulse events use Timestamp.now() (client clock) not serverTimestamp(). Clock skew
between devices produces out-of-order audit events.
**Impact:** Forensic timeline could show events in wrong order across devices.
**To close:** Blaze upgrade → Cloud Function middleware for timestamp normalization.

### 4. Reservation System is Advisory
inventory.reserved is incremented/decremented by ClinicalWorkspace but POSModal's runTransaction
reads real stock, not stock-minus-reserved. Two concurrent POS checkouts could both succeed
for the last item (transaction retries handle this in practice, but reservations aren't a hard lock).
**Impact:** Theoretical double-sale on last item under high concurrency.
**To close:** POSModal transaction checks reserved counter as an additional guard.

### 5. No Cross-System Correlation ID
A ClinicalWorkspace sign-off, its downstream POSModal checkout, and the resulting Sales doc
have no shared transactionId. Traceable via appointmentId but requires manual joining.
**Impact:** Audit trail requires multi-collection joins for end-to-end tracing.
**To close:** Generate a UUID at sign-off, propagate through billing to sale. ~1 hr.

### 6. Reserve/Release Events Not Logged
reserveStock and releaseStock in useInventory.js produce no inventory_logs entries.
Reservation activity is invisible in the audit trail.
**Impact:** Cannot audit who reserved what when, or diagnose reservation counter drift.
**To close:** Add logEvent calls to reserveStock/releaseStock. ~15 min.

### 7. KNOWLEDGE_BASE Negation Handling
"not coughing" triggers the cough rule because substring "cough" matches. 30 rules but
all use naive substring matching with no negation detection.
**Impact:** False-positive clinical suggestions for negated symptoms.
**To close:** Add negation window check (5 words before keyword for "not", "no", "denies"). ~30 min.

### 8. Single-Tenant Architecture
One Firebase project, one clinic. Multi-tenant SaaS needs per-clinic document scoping,
tenant isolation, subscription management, white-labeling.
**Impact:** Cannot serve multiple clinics from one deployment.
**To close:** Phase 4+ architectural redesign. Multi-week effort.

### 9. No CI/CD Pipeline
No GitHub Actions, no pre-commit hooks, no automated builds on PR.
**Impact:** No automated quality gates. Broken code can be committed freely.
**To close:** GitHub Actions workflow for build + lint. ~2 hrs.

### 10. Enterprise Security Features Not Present
No MFA, no session timeout, no IP blocking, no rate limiting (beyond Firebase defaults),
no CSP headers, no CORS configuration, no request signing.
**Impact:** Acceptable for capstone. Not for production deployment with real patient data.
**To close:** Varies per feature. MFA via Firebase (1 hr). CSP headers (30 min). Session timeout (1 hr).

---

## S-Tier Roadmap — The Full Endgame

> ~154 additional hours on top of the ~480 scoped tasks (~350 hrs) — 3 tasks absorbed in session 2026-04-21
> Total to S across entire ecosystem: ~504 hours
> Timeline: ~12-13 weeks full-time or ~6 months part-time
> Formal task IDs: T4.1-T4.80 in MASTER_TASKLIST.md (T4.70, T4.77 absorbed; T2.98 absorbed)

### Dashboard (S- → S): +7.5 hrs

| Feature | Effort |
|---|---|
| Real-time auto-refresh (30s interval on useDashboardData) | 1 hr |
| Customizable widget layout (react-grid-layout, per-user prefs) | 3-4 hrs |
| Comparative benchmarking (this month vs same month last year) | 2 hrs |
| Dashboard sharing (snapshot URL or full multi-tab PDF) | 1.5 hrs |

### Queue (A → S): +13 hrs

| Feature | Effort |
|---|---|
| Drag-and-drop queue reordering (@dnd-kit, queuePosition field, pulse event) | 3 hrs |
| Real-time capacity forecasting ("queue clears by 4:30 PM") | 1.5 hrs |
| Staff assignment recommendations (sort by lowest workload) | 1 hr |
| Split-screen multi-department view (side-by-side filtered DataGrids) | 4 hrs |
| Audio/visual alert for staff when wait >X minutes | 30 min |
| Full design sweep (currently skipped — 8 files, tokens + borderRadius + shadows) | 3-4 hrs |

### ClinicalWorkspace (A- → S): +17 hrs

| Feature | Effort |
|---|---|
| SOAP template library (soap_templates collection, dropdown per quadrant) | 2 hrs |
| Image/file attachments in SOAP (Firebase Storage, thumbnail preview) | 3-4 hrs |
| Structured problem list (problems sub-collection, active/resolved tracking) | 3-4 hrs |
| Voice-to-text for SOAP fields (Web Speech API, per-quadrant mic button) | 2-3 hrs |
| Clinical decision support (species-adjusted vital range alerts with visual cues) | 1 hr |
| Full design sweep (currently skipped — 1,989 lines, glassmorphism removal) | 2-3 hrs |
| God-View + main grid unification via SoapGrid extraction (T2.32 completion) | 2-3 hrs |

### POSModal (A- → S): +12 hrs

| Feature | Effort |
|---|---|
| Partial payments / installment tracking (payments sub-collection) | 3 hrs |
| Receipt email/SMS to client (Blaze CF, SendGrid/Twilio) | 1.5 hrs |
| Integrated payment terminal (GCash QR generation, merchant API) | 2-3 hrs |
| Tax computation (VAT, SC/PWD tax-exempt breakdown per RA 9994) | 1.5 hrs |
| Multi-currency support (USD for expat clients, exchange rate config) | 1 hr |
| Deposit collection at booking time (mobile + deposits collection + POS reads) | 2 hrs |

### Records (A- → S): +10 hrs

| Feature | Effort |
|---|---|
| Full-text search across all SOAP fields, prescriptions, diagnoses | 2 hrs |
| Bulk export to CSV/PDF (filtered records → downloadable file) | 1.5 hrs |
| Audit trail visualization (pulse timeline per record, expandable row) | 2 hrs |
| Record comparison (two records side-by-side, vitals delta, SOAP diff) | 2 hrs |
| Saved search queries (per-user Firestore subcollection) | 2.5 hrs |

### Patients CRM + PatientDashboard EMR (A-/A+ → S): +11 hrs

| Feature | Effort |
|---|---|
| Client engagement scoring (0-100, visit frequency + no-show + balance + completeness) | 2 hrs |
| Automated birthday/pet anniversary messages (Blaze cron, push/in-app) | 1.5 hrs |
| Pet growth charts (breed-specific weight-for-age curves with percentile) | 3 hrs |
| Breed-specific health risk profile (static dataset, "Health Watch" sidebar section) | 2 hrs |
| Client communication log (communications sub-collection, CRM tab) | 2 hrs |
| Deceased pet memorial handling (Mark as Deceased + dateOfDeath + memorial indicator) | 30 min |

### Services (A- → S): +7 hrs

| Feature | Effort |
|---|---|
| Package deals (service_packages collection, bundle pricing, BookAppointment integration) | 3 hrs |
| Seasonal/promotional pricing (promotions collection, date-range discounts, POS applies) | 1.5 hrs |
| Service analytics (revenue per service, actual vs scheduled duration, demand patterns) | 1.5 hrs |
| Service dependency chains (prerequisites[], BookAppointment pre-check) | 1 hr |

### Inventory (A- → S): +10-12 hrs

| Feature | Effort |
|---|---|
| Auto-reorder alerts with supplier integration (reorderPoint field, purchase order PDF) | 3 hrs |
| Barcode/QR scanning for stock intake (camera scanner, SKU lookup) | 3-5 days |
| Expiry disposal workflow (batch-find expired, batch-adjust, audit log) | 1.5 hrs |
| Inventory valuation report (COGS, margin by category, turnover rate, CSV/PDF export) | 2 hrs |
| Stock movement heatmap (fastest-moving items by day-of-week) | 1 hr |

### Staff (B+ → S): +11-12 hrs

| Feature | Effort |
|---|---|
| Cloud Function for Firebase Auth management (disable, custom claims, password reset) | 3-4 hrs |
| Staff scheduling/availability (per-staff workingDays[], useBookingEngine integration) | 3 hrs |
| Performance metrics dashboard (patients seen, avg consult, revenue per vet) | 2 hrs |
| Staff KPI cards (wire dead KPICard component with real data) | 1 hr |
| Credential management (PRC license expiry tracking, CE credits, renewal alerts) | 2 hrs |

### Sales (A- → S): +9.5 hrs

| Feature | Effort |
|---|---|
| Multi-day date range view (week/month sales, range picker, pagination) | 2 hrs |
| Revenue trend visualization (daily line chart for selected period) | 1 hr |
| Profit/loss statement (revenue - expenses - COGS for a period, PDF export) | 2 hrs |
| Tax computation and reporting (monthly VAT summary for BIR filing) | 1.5 hrs |
| Payment reconciliation (match GCash/bank deposits vs recorded sales, show discrepancies) | 3 hrs |

### Settings (A- → S): +10 hrs

| Feature | Effort |
|---|---|
| Change history viewer (settings_logs entries, who changed what when) | 1.5 hrs |
| Configuration preview ("3 appointments affected by this change") | 2 hrs |
| Multi-location support (locations collection, per-location config, location selector) | 4-5 hrs |
| Configuration import/export (backup/restore as JSON) | 1 hr |
| Feature flags management (featureFlags object, Settings toggles, component checks) | 1.5 hrs |

### Monitor (B+ → S): +6.5 hrs

| Feature | Effort |
|---|---|
| A- tier tasks (upcoming preview, animation, TV readability) — already scoped | 1.5 hrs |
| Multi-room display mode (/monitor?room=consult1, department-filtered) | 2 hrs |
| Estimated individual wait per patient in upcoming list | 1 hr |
| Clinic information carousel (idle-mode content from clinic_settings) | 1.5 hrs |
| Weather + clock display (ambient info, OpenWeatherMap API) | 30 min |

### Expenses (A- → S): +10.5 hrs

| Feature | Effort |
|---|---|
| Receipt/attachment scanning (Firebase Storage, camera capture, thumbnail) | 2 hrs |
| Recurring expenses (recurring_expenses collection, auto-create on due date) | 2 hrs |
| Budget tracking (per-category monthly budgets, actual vs budget bars) | 2 hrs |
| Expense approval workflow (pending → approved → paid, admin-only approve) | 3 hrs |
| Year-end expense report (12 months × N categories, totals, CSV/PDF export) | 1.5 hrs |

### Login (A- → S): +5 hrs 10 min

| Feature | Effort |
|---|---|
| Multi-factor authentication (Firebase MFA, phone-based second factor) | 1.5 hrs |
| ~~Forgot Password flow~~ — absorbed into T2.277 (bumped to P1) | ~~20 min~~ |
| Biometric login (expo-local-authentication for mobile + admin, secure token storage) | 1.5 hrs |
| Session timeout (configurable idle detection, warning modal, auto-signout) | 1 hr |
| Login audit log (login_logs collection, IP/userAgent, success/failure tracking) | 1 hr |

### Mobile App (A- → S): +13.5 hrs

| Feature | Effort |
|---|---|
| Offline support (Firestore persistence, offline indicator, queued writes) | 4-5 hrs |
| Push notifications for all appointment lifecycle events (deploy existing CF) | 2 hrs |
| Dark mode (DARK_COLORS in mobileTokens, useColorScheme detection) | 3-4 hrs |
| ~~Biometric login~~ — absorbed into Login S-tier (T4.71 covers both) | ~~1.5 hrs~~ |
| In-app appointment rescheduling (date/slot picker, rescheduleReason) | 2 hrs |
| Pet photo upload and display (Firebase Storage, camera/gallery picker) | 1.5 hrs |
| Haptic feedback on key interactions (expo-haptics) | 30 min |

### S-Tier Grand Total (updated 2026-04-21)

| Area | S Effort | Cumulative (480 tasks + S) | Task IDs |
|---|---|---|---|
| Dashboard | +7.5 hrs | ~39.5 hrs | T4.1-T4.4 |
| Queue | +13 hrs | ~20 hrs | T4.5-T4.10 |
| ClinicalWorkspace | +17 hrs | ~30 hrs | T4.11-T4.17 |
| POSModal | +12 hrs | ~17 hrs | T4.18-T4.23 |
| Records | +10 hrs | ~22 hrs | T4.24-T4.28 |
| Patients/EMR | +11 hrs | ~23 hrs | T4.29-T4.34 |
| Services | +7 hrs | ~12 hrs | T4.35-T4.38 |
| Inventory | +10 hrs | ~22 hrs | T4.39-T4.43 |
| Staff | +11 hrs | ~15 hrs | T4.44-T4.48 |
| Sales | +9.5 hrs | ~15 hrs | T4.49-T4.53 |
| Settings | +10 hrs | ~15 hrs | T4.54-T4.58 |
| Monitor | +6.5 hrs | ~14 hrs | T4.59-T4.63 |
| Expenses | +10.5 hrs | ~15 hrs | T4.64-T4.68 |
| Login | +5 hrs 10 min | ~7 hrs 40 min | T4.69-T4.73 (T4.70 absorbed) |
| Mobile | +13.5 hrs | ~33.5 hrs | T4.74-T4.80 (T4.77 absorbed) |
| **Total** | **~154 hrs** | **~504 hrs** | **T4.1-T4.80 (77 active)** |
