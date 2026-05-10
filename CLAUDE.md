# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Target User & Context

**Small Philippine veterinary practice with 1-2 vets.** The same human often acts as clinician, cashier, pharmacist, and admin across a single shift. Device of choice: **iPad tablet** for the admin dashboard. Features that assume role separation (dedicated cashier vs. clinician) must be opt-in and default off. The mobile app is for pet-owner clients — frame mobile features for pet owners, not clinicians.

## Project Structure

This is a **monorepo with three sub-projects** sharing a single Firebase backend (`starbarks-vetconnect-f6443`):

| Directory | What | Stack |
|---|---|---|
| `VetConnect/` | Mobile app (**client-only** — pet owners) | Expo 54, React Native 0.81, React 19, JS |
| `VetConnect-Admin/` | Web admin dashboard (all clinic staff) | React 19, Vite 7, MUI 7, JS |
| `VetConnect-Backend/` | Cloud Functions (NOT deployed — Spark plan) + Cloudflare Worker (DEPLOYED) | Node 20, Firebase Functions v7 |

Each has its own `package.json` — run `npm install` inside the relevant directory.

**Important**: The mobile app is for **pet-owner clients ONLY**. Staff/vet/admin use the web admin dashboard. Staff routing in App.js is deprecated dead code.

## Build & Run Commands

### Mobile App (`VetConnect/`)
```
npm start          # Expo dev server
npm run android    # Android emulator
npm run ios        # iOS simulator
npm run web        # Web preview
npm run lint       # ESLint
```

### Admin Dashboard (`VetConnect-Admin/`)
```
npm run dev        # Vite dev server (localhost:5173)
npm run build      # Production build → dist/
npm run preview    # Preview prod build
npm run lint       # ESLint
npm run deploy     # Deploy to Firebase Hosting
```

### Backend (`VetConnect-Backend/`)
```
# Cloud Functions (NOT deployable on Spark plan):
cd functions && npm run serve   # Firebase emulator

# Firestore rules (deployable on Spark):
firebase deploy --only firestore:rules

# Cloudflare Worker (deployed via Dashboard, NOT CLI):
# Reference copy: VetConnect-Backend/cloudflare-worker/worker.js (~1031 lines)
# Live Worker: https://cool-fire-2d53.jepdd15.workers.dev
```

## Spark Plan Constraints

The Firebase project is on the **free Spark plan**. These are hard limitations:
- **Cloud Functions CANNOT be deployed** — all 5 functions in `functions/index.js` exist as reference implementations only
- **No Custom Claims** — `isStaff()` uses `isAuth()` as a workaround (getUserRole() get() fails under concurrent listeners). Server-side role enforcement requires Blaze for Admin SDK Custom Claims.
- **No server-side triggers** — Firestore triggers, Auth triggers, and scheduled functions require Blaze. All automation uses the Cloudflare Worker cron instead.
- **No Cloud Storage triggers** — file upload callbacks require Blaze
- **Workarounds in place**: Cloudflare Worker handles AI proxy, push/email/SMS, and cron jobs. Client-side routing provides access control. Pre-computed queue collections (vaccine/appointment/balance) with public read rules enable Worker access to data.

Do NOT plan tasks that require Cloud Functions deployment, Custom Claims, or server-side Firestore triggers unless explicitly marked as "Blaze-gated."

## Architecture

### Mobile App (React Navigation — client-only)
- Entry point: `VetConnect/App.js` — single Stack Navigator
- All authenticated users route to `ClientDashboard` (role-based staff routing is deprecated)
- Screens: ClientDashboard, MyPetsScreen, BookAppointment, ClientAppointments (My Bookings), PetHistoryScreen, QueueScreen, ChatbotScreen, MyStatsScreen, NotificationHistory, UserProfileScreen, SelfCheckInScreen, ConsentScreen, AddPetScreen, EditPetScreen

### Admin Dashboard (React Router)
- Entry: `VetConnect-Admin/src/main.jsx` → `App.jsx`
- Auth context: `src/context/UserContext.jsx` — exposes `useUser()` with `user`, `isAdmin`, `loading`
- **All staff have full access** (T4.154) — no admin/staff distinction. `isStaff() === isAuth()` in Firestore rules.
- **Feature-module architecture** in `src/features/`:
  - `Queue/` — clinical queue management, walk-ins, staff assignment, end-of-day reconciliation
  - `Patients/` — CRM with `PatientDashboard` (`:id` route), client/pet CRUD, billing ledger, consent recording
  - `Records/` — Visit Log (renamed from Records) with 3-tab layout (Pending/Active/Completed)
  - `Services/` — service catalog, activity logs, tiered pricing
  - `Inventory/` — product management (3-tier: Medicine/Medical Supply/Retail), stock adjustments, vaccine catalog
  - `Staff/` — staff directory, role management
  - `Sales/` — transaction ledger, EOD close-out, Z-reports, retail POS
  - `Dashboard/` — 4-tab analytics (TODAY/ANALYTICS/FINANCIAL/PERFORMANCE)
- Standalone pages: Calendar, Monitor, Expenses, Settings, Login, NotificationLogs
- Shared components: `ClinicalWorkspace`, `POSModal`, `Sidebar`, `CalendarAIPanel`, `BulkPromoDialog`, `EMRDrawer`
- Routes: `/`, `/queue`, `/records`, `/patients`, `/patients/:id`, `/services`, `/inventory`, `/staff`, `/sales`, `/expenses`, `/monitor`, `/settings`, `/calendar`, `/notification-logs`

### Cloudflare Worker (DEPLOYED — the actual backend)
- URL: `https://cool-fire-2d53.jepdd15.workers.dev`
- Model: `claude-haiku-4-5-20251001`
- Endpoints: `POST /` (AI proxy), `/push` (template notification), `/push/custom` (free-text), `/email` (Resend), `/sms` (Semaphore)
- Cron: `0 23 * * *` UTC (7 AM Manila daily) — runs `handleVaccineReminders` + `handleAppointmentReminders` + `handleBalanceReminders`
- Env vars: `ANTHROPIC_API_KEY`, `FIREBASE_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SEMAPHORE_API_KEY`, `SEMAPHORE_SENDER_NAME`
- Reference copy in repo: `VetConnect-Backend/cloudflare-worker/worker.js` — after editing, paste to Cloudflare Dashboard → Workers → Edit Code → Deploy
- Cloud Functions in `functions/index.js` exist but are **NOT deployed** (Spark plan). They are aspirational reference implementations.

### AI Systems
- **Clinical AI** (ClinicalWorkspace): "Ask AI" button → ClinicalAIPanel (collapsible drawer/column), multi-turn chat via `chatWithHistory` from `llmService.js`, source:'clinical' audit logs
- **Calendar AI** (Calendar page): CalendarAIPanel side panel + right-click contextual, 5 quick action chips, `buildCalendarContext` 7-section data builder, source:'calendar' audit logs
- **AI Booking Advisor** (BookAppointment mobile): BookingAISheet bottom sheet, pet vaccination/history context, 3 quick chips, source:'booking' audit logs
- **Pet History AI** (PetHistoryScreen mobile): PetHistoryAISheet bottom sheet, pet-owner-facing health Q&A
- **Chatbot** (ChatbotScreen mobile): General FAQ chatbot
- All AI uses the same Cloudflare Worker `POST /` endpoint with Claude Haiku. System prompts stored in `system_prompts/{feature}` Firestore collection (tunable via Settings), with hardcoded defaults as fallback.

### Booking System
- `useBookingEngine` hook: department-parallel slot scheduling, real-time `onSnapshot` for slot grid, Manila timezone enforcement
- TOCTOU protection: `slot_reservations/{date}_{HH}_{MM}_{dept}` deterministic docs inside `runTransaction` (T4.205)
- 4-step wizard: Pet → Services → Date/Time → Confirm. AI Booking Advisor FAB on all steps.
- Reschedule/cancel/follow-up flows with slot reservation cleanup

### Notification System
- Push: Expo Push API via Worker `/push` and `/push/custom`
- Email: Resend API via Worker `/email`
- SMS: Semaphore API via Worker `/sms`
- Templates: 17+ push templates in `notificationTemplateConstants.js` + Worker `DEFAULT_TEMPLATES`
- Audit: all sends logged to `notification_log` collection
- Cron reminders: vaccine (pre-computed queue), appointment (3-stage), balance (pre-computed queue)
- Bulk promo: `BulkPromoDialog` 3-step compose/preview/send, `promo_templates` collection

### State Management
No Redux or Zustand. State managed via:
- **Local `useState` hooks** per screen
- **Firestore `onSnapshot()` listeners** for real-time reactivity
- **Custom hooks per feature** (admin): `useQueueActions`, `usePatientManager`, `useStaffManager`, `useInventory`, `useServices`, `useSalesData`, `useGlobalRecords`, `useAncestorChain`, `useClinicSettings`, `useCalendarData`, `useVaccineCatalog`
- **`useBookingEngine` hook** (mobile): multi-service, multi-department slot scheduling with real-time availability

### Firestore Collections
| Collection | Purpose |
|---|---|
| `users` | Profiles (clients & staff), role, departments, push tokens, consent versions, allowPromos, preferredComm, referral |
| `pets` | Pet profiles linked to owners via `ownerId`. Sub-collection: `problems/{problemId}` (structured problem list) |
| `appointments` | Bookings with status lifecycle + Clinical Passport + clinicalPulse audit trail + services[] array |
| `medical_records` | SOAP-format clinical records with structured diagnosis, vaccineAdministrations[], encounterItems[] |
| `services` | Available services with duration, department, target species, tiered pricing |
| `inventory` | Products with 3-tier classification (Medicine/Medical Supply/Retail), vaccineConfig for vaccines |
| `sales` | Transaction records with payment method, items, balanceRemaining |
| `clinic_settings` | Operating hours, slot intervals, departments, notification config. Sub-docs: `general`, `llm_config` |
| `queue` | `daily_queue` doc: currentServing, lastNumberIssued, status |
| `slot_reservations` | Booking TOCTOU protection — deterministic doc IDs `{date}_{HH}_{MM}_{dept}` |
| `vaccine_reminder_queue` | Pre-computed vaccine reminder targets (public read for Worker) |
| `appointment_reminder_queue` | Pre-computed appointment reminder targets (public read for Worker) |
| `balance_reminder_queue` | Pre-computed balance reminder targets (public read for Worker) |
| `vaccine_preferences` | Per-pet vaccine reminder opt-outs (public read for Worker) |
| `notification_log` | Audit trail for all sent notifications (push/email/SMS) |
| `notification_templates` | Customizable notification templates |
| `promo_templates` | Saved promotional message templates |
| `consent_versions` | DPA and waiver policy versions (type: 'dpa' or 'waiver') |
| `system_prompts` | AI system prompts (calendar_assistant, booking_assistant, etc.) |
| `llm_audit_logs` | AI query audit trail (source: 'clinical', 'calendar', 'booking') |
| `daily_closings` | EOD Z-report snapshots |
| `counters` | Sequential numbering (receipt_sequence) |
| `expense_categories` | Dynamic expense categories with monthly budgets |

## Design System — Modern Clinical Neubrutalism

- **Zero border-radius** on all containers, inputs, buttons — `borderRadius: 0` everywhere
- **Solid offset shadows** instead of native elevation/blur
- **Color palette**: Cream `#FFF8E1`, Espresso `#3E2723`/`#5D4037`, Sky Blue `#3ABEF9`, Red `#D32F2F`
- **Admin design tokens**: `VetConnect-Admin/src/theme/designTokens.js` — exports `COLORS`, `TYPE`, `FONT`, `STATUS_COLORS`
- **Mobile design tokens**: `VetConnect/src/theme/mobileTokens.js` — exports `COLORS`, `FONTS`, `SHADOW`, `SPACING`
- **STATUS_COLORS** in `designTokens.js` — single source of truth for appointment status colors across Calendar, Visit Log, Queue, Dashboard
- **MUI Grid v2**: use `<Grid size={{ xs: 12, md: 6 }}>` NOT `<Grid item xs={12} md={6}>`

## Terminology (locked — use consistently)

- **Visit**: one entry in the queue, one appointments document, one caseDay, one clinicalPulse array
- **Case**: complete clinical encounter, one or more visits linked via originApptId, tracked by caseDay counter
- **Medical record**: signed SOAP document in medical_records collection, immutable once signed
- **Appointment**: pet-owner-facing term for a visit (mobile says "appointment", admin says "visit")

## Testing

**322 unit tests passing** (50 pulseUtils engine + 256 pulse event writing + 16 draft save/resume). Future changes should maintain or increase this count. Run: `cd VetConnect-Admin && npm test`

## Deploy Workflow

- **Admin dashboard**: `cd VetConnect-Admin && npm run deploy` (Firebase Hosting)
- **Mobile APK**: EAS Build via Expo
- **Firestore rules**: `cd VetConnect-Backend && firebase deploy --only firestore:rules`
- **Cloudflare Worker**: manual paste — copy `VetConnect-Backend/cloudflare-worker/worker.js` content → Cloudflare Dashboard → Workers → cool-fire-2d53 → Edit Code → select all → paste → Deploy. Verify via Schedule tab → Trigger scheduled event.

## Memory System

A persistent memory directory exists at `.claude/projects/c--Users-jepdd-Documents-VetConnect-Capstone/memory/` with **37+ files** indexed by `MEMORY.md`. Contains:
- **Session files** — what happened in each work session (tasks shipped, decisions made, fixes applied)
- **Feedback files** — behavioral rules from user corrections (prompt patterns, decision rounds, spec cross-reference, mockup workflow). These are instructions, not history — follow them.
- **Project files** — facts about the project not in code (mobile is client-only, discovered gaps pending decisions)
- **Reference files** — approved mockups and visual specs (30+ ASCII mockups across 9 features in `reference_mockups_2026_05_09.md`)

Check `MEMORY.md` index for relevant files before starting work. **Do NOT re-debate locked decisions** — handoff.json and session memory files contain decisions from decision rounds that were explicitly locked with user input. Check before proposing alternatives.

## Implementation Workflow

This codebase has been fully audited across 10+ sessions. **Do NOT re-scan code.** All findings are in the deep-dive files at the repo root. **Deep-dive files are HISTORICAL** (written April 15-21, before ~750 tasks were implemented). Use deep-dives for architectural context and locked decisions, but **trust the CURRENT source files** for what the code looks like now.

**Read IMPLEMENTATION_GUIDE.md first** — contains status, module sequence, task cross-reference, session prompts.

**Read MASTER_TASKLIST.md** for the task registry (~913 tasks, ~758 DONE, ~151 TODO).

**Read handoff.json** (`advisory_session_2026_05_10`) for the latest session context.

**Approved mockups** are in `.claude/projects/.../memory/reference_mockups_2026_05_09.md` — 30+ ASCII mockups across 9 features. Reference this file in execute prompts for any UI task.

## Advisory Workflow Rules (CRITICAL — follow exactly)

### 1. Spec Cross-Reference After Every Execute Prompt
After generating an execute prompt, **proactively cross-reference** every locked decision and spec point from the MASTER_TASKLIST against the spec verification items. Present a mapping table. Report gaps. Add missing items. The user will ask "will that execute prompt ensure our decisions and spec saved in the master tasklist are completely followed?" — have the answer ready.

### 2. Mockup-Driven Implementation
For any task that changes UI, **create ASCII mockups BEFORE generating execute prompts**. Save mockups to `reference_mockups_2026_05_09.md`. Include the file path + section name in the execute prompt with: "The engineer MUST read and match these layouts." Verify implementation against mockups post-execution.

### 3. Single Prompt Rule
Include ALL flags, amendments, mockup references, and spec verification items in ONE execute prompt. Do NOT separate into follow-up messages. The implementation session may not follow multi-message intent.

### 4. Decision Rounds Before Formalization
Run decision rounds BEFORE formalizing any feature with design choices. Present numbered options with pros/cons/lean. Lock each with user input. Do NOT skip — the user will challenge you.

### 5. Task Formalization
Immediately formalize any discovered gap, bug, or enhancement as a task in MASTER_TASKLIST.md. Self-contained description with current state, desired state, file paths, effort estimate.

## Key Conventions

- **Firebase config**: `firebaseConfig.js` in each sub-project root
- **Phone validation**: PH format `09xxxxxxxxx` (`/^09\d{9}$/`)
- **QR codes**: format `VC-{userId5chars}-{timestamp}-{index}`
- **Appointment status lifecycle**: `pending` → `confirmed` → `arrived` → `in-consult` → `on-hold` → `dispensing` → `billing` → `completed` (or `cancelled`, `no-show`, `confined`, `carried-over`)
- **Timezone**: All scheduling uses `Asia/Manila`
- **Tiered pricing**: `resolveTieredPrice(service, petWeight)` from `VetConnect-Admin/src/utils/resolveTieredPrice.js`
- **Clinical pulse**: `pulseUtils.js` forensic temporal engine with dual-clock (business-hour + absolute)
- **Vaccine catalog**: `vaccineConfig` sub-object on inventory products (doses, doseIntervalDays, startAgeWeeks). Multi-dose series with explicit doseNumber, binary completeness.
- **Structured sig**: 5-field dosing on medicines (Dose, Unit, Frequency, Days, Route) replacing free-text
- **Consent system**: DPA + waiver. Checkbox at registration (both mobile + admin). ConsentScreen with drawn/typed signature for version updates. `consent_versions` + `consent_records` collections.
- **Emergency contacts**: Array pattern on all 4 surfaces (RegisterScreen, UserProfileScreen, NewClientModal, ClientDetails). Legacy scalar fallback (emergencyName/emergencyPhone).
- **Relation field**: Standardized dropdown/chips — Spouse, Parent, Sibling, Child, Relative, Friend, Caretaker, Other
- **Referral field**: Unified `referral: { source, referredBy }` with 7 options (Walk-by/Facebook/Google/Referral/Returning/Vet Referral/Other). Dual-read/dual-write with legacy scalars.
- **EncounterSummary grouping**: `sourceServiceId` + `sourceServiceName` on auto-bundled encounterItems. Grouped rendering for multi-service, flat for single-service.
- **Firestore rules**: `isStaff() === isAuth()` (Spark plan limitation). Closed-date check on both create AND update appointment paths.
- **Commit messages**: `feat(scope): description (task IDs)`. No Co-Authored-By. No trailing lines.
- **ZERO prompt()/alert()/confirm()**: MUI Dialog/Snackbar on admin, Alert.alert on mobile
- **Registration data parity**: both mobile (RegisterScreen) and admin (NewClientModal) collect: name, phone, email, address, city, emergency contacts array, DPA + waiver consent checkboxes (with View Policy dialog on admin), allowPromos + preferredComm, unified referral. Intentional differences: password (mobile only, Firebase Auth), address/emergency required on mobile but optional on admin (walk-in may not have info), referredBy text (admin only, "how did they find us?")
- **Backward compat dual-read/dual-write**: when restructuring data fields, ALWAYS write BOTH the new structured field AND legacy scalars. Read new field first with fallback to legacy. Pattern used on: `referral` (object + referredBy/referralSource scalars), `emergencyContacts` (array + emergencyName/emergencyPhone scalars), `vaccineAdministrations` (array + vaccineData singular), `dueDate` (Timestamp + ISO string). Never assume legacy data has been migrated.
- **Service icon system** (locked): ✓ = completed, ⏳ = in-progress, ○ = waiting (will be done), ✗ = not completed (terminal/carried-over). Used on SuperCard, AppointmentCardContent, VisitTimeline, QueueScreen, Monitor. Do NOT invent new icons.
- **"prev. day" detection**: `serviceCompletedAt < scheduledDate` (timestamp comparison). NOT `caseDay > 1` (blanket, marks all services on Day 2+). This was a hard-won fix — do not revert.
