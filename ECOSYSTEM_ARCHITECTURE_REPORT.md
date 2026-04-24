# VetConnect Ecosystem Architecture Report

**Repo:** `c:\Users\jepdd\Documents\VetConnect-Capstone` · **Branch:** `main` · **Commit:** `9d1f662` · **Date:** 2026-04-13

---

## Executive Summary

VetConnect is a monorepo with **two shipped front-ends and one stub backend**, all pointing at a single Firestore project (`starbarks-vetconnect-f6443`) on the Spark (free) plan. The **mobile Expo app** (`VetConnect/`) handles client booking, queue viewing, QR check-in, and vet SOAP/scanner flows. The **React+Vite admin dashboard** (`VetConnect-Admin/`) is the real clinical operations surface — queue control, clinical workspace with SOAP, POS with FIFO auto-deduct, inventory, services, patients CRM, records browser, settings, and lobby monitor. The **Cloud Functions** in `VetConnect-Backend/functions/index.js` are **source-only, not deployed** — the Spark plan blocks deployment, so all logic that the thesis describes as "server-side" actually runs client-side or via deployed Firestore rules.

Against the thesis: roughly **~80% of required features are demonstrably implemented in code**, but two thesis claims are structurally wrong relative to the repo — (1) the thesis says "mobile only / React Native + Expo" while the real system includes a desktop web admin that does most of the clinical work, and (2) the thesis says Cloud Functions power validation and reminders, but no function is deployed and reminders are in-app Firestore listeners. The biggest true feature gaps are **printable vaccination records and referral reports** (only POS receipts print), and **automated reminders in the thesis sense** (there is no push/SMS — only in-app `nextVisit` banners).

The system is **defendable as-is** if the developer is willing to reframe these gaps as scope decisions in the defense; otherwise, a 2–3 day focused push (printables, thesis/reality reconciliation language, and a Blaze-plan demo flag) would close the material risks.

---

## 1. Ecosystem Block Diagram

```
                      FIREBASE PROJECT: starbarks-vetconnect-f6443 (SPARK plan)
  ┌────────────────────────────────────────────────────────────────────────────────┐
  │                                                                                │
  │  ┌────────────┐   ┌─────────────────┐   ┌────────────┐   ┌──────────────────┐  │
  │  │ Auth       │   │ Firestore       │   │ Storage    │   │ Cloud Functions  │  │
  │  │ (email/pw) │   │ (primary DB)    │   │ (pet imgs) │   │ NOT DEPLOYED     │  │
  │  └─────┬──────┘   │ + rules (LIVE)  │   └────────────┘   │ (source only)    │  │
  │        │          └────────┬────────┘                    └──────────────────┘  │
  └────────┼───────────────────┼─────────────────────────────────────┬──────────────┘
           │                   │                                     │
     auth state         onSnapshot / transactions / batch         NEVER INVOKED
           │                   │ writes                              │
  ┌────────┴───────────────────┴──────────────┐    ┌─────────────────┴─────────────────┐
  │                                           │    │    functions/index.js (dead)      │
  │   MOBILE — VetConnect/ (Expo 54 / RN)     │    │    - midnightQueueSweep (cron)    │
  │   Entry: App.js (Stack Navigator)         │    │    - reservationCleanup (cron)    │
  │                                           │    │    - secureBookAppointment (cal)  │
  │   Client flow                             │    │    - sendAppointmentUpdate (trig) │
  │     LoginScreen → ClientDashboard         │    │    - mergeGuestAccount (auth)     │
  │       MyPets / AddPet / EditPet           │    └───────────────────────────────────┘
  │       BookAppointment (wizard)            │
  │         └─ useBookingEngine               │    ┌───────────────────────────────────┐
  │       ClientAppointments (SuperCard,      │    │   ADMIN — VetConnect-Admin/       │
  │         12-status, follow-up row)         │    │   Entry: main.jsx → App.jsx       │
  │       PetHistory (SOAP timeline)          │    │   React 19 / Vite 7 / MUI 7       │
  │       QueueScreen / ChatbotScreen         │    │   UserProvider / BrowserRouter    │
  │                                           │    │                                   │
  │   Staff flow                              │    │   Pages                           │
  │     StaffDashboard                        │    │     /  Dashboard                  │
  │       StaffAppointments                   │    │     /queue (Queue.jsx)            │
  │       ManageQueueScreen                   │    │     /records (Records.jsx)        │
  │       ScannerScreen (QR check-in)         │    │     /patients + /patients/:id     │
  │       ConsultationScreen                  │    │     /services /inventory          │
  │                                           │    │     /staff /sales /expenses       │
  │   Design: soft rounded, warm palette      │    │     /monitor (lobby TV)           │
  │                                           │    │     /settings                     │
  └───────────────────────────────────────────┘    │                                   │
                                                   │   Shared components               │
                                                   │     ClinicalWorkspace.jsx (1989L) │
                                                   │     POSModal.jsx (554L)           │
                                                   │     Sidebar.jsx (adminOnly gate)  │
                                                   │                                   │
                                                   │   Design: Neubrutalism, tokens    │
                                                   └───────────────────────────────────┘

  Firestore collections touched (both sides):
    users · pets · appointments · medical_records · services · inventory · sales
    inventory_logs · inventory_categories · service_logs · staff_logs
    queue/daily_queue · clinic_settings/general · departments · expenses

  LIVE deployed rules (firestore.rules):
    - all reads/writes require auth
    - appointment.create rejects if scheduledDateStr ∈ clinic_settings/general.closedDates
    - appointment.update: isTriaged is one-way
    - transitions to cancelled/no-show require non-empty auditReason
    - setting isTriaged=true requires forensicSeal field
```

---

## 2. Mobile App Architecture — `VetConnect/`

**Stack:** Expo 54, React Native 0.81, React 19, mostly JS. Entry: `VetConnect/App.js` — single `Stack.Navigator`.

### Navigation Tree (all screens exist in `VetConnect/src/screens/`)

```
Auth:
  LoginScreen.js            role-gate → staffRoles=[admin,staff,vet,groomer]
  RegisterScreen.js

Client flow:
  ClientDashboard.js        active-appt listener, reminders, push token registration
    ├─ MyPetsScreen.js      ownerId pets query
    │    ├─ AddPetScreen.js
    │    └─ EditPetScreen.js
    ├─ BookAppointment.js   4-step wizard, writeBatch w/ scheduledDateStr + QR
    ├─ ClientAppointments.js SuperCard live card, follow-up ghost handling
    ├─ PetHistoryScreen.js  SOAP/vax/lab timeline, Book Follow-Up CTA
    ├─ QueueScreen.js       live queue view
    ├─ ChatbotScreen.js     rule-based FAQ bot
    └─ UserProfileScreen.js

Staff flow (same stack):
  StaffDashboard.js
    ├─ StaffAppointments.js  pending queue for staff confirmation
    ├─ ManageQueueScreen.js  staff queue controller
    ├─ ScannerScreen.js      expo-camera → QR → appointment transaction
    └─ ConsultationScreen.js SOAP note capture on mobile
```

### Key Hooks & Utilities

- **`src/hooks/useBookingEngine.js` (382 lines)** — the scheduling brain. Reads `clinic_settings/general`, `services`, staff with `accessLevel in [admin,staff]`, and computes `departmentCapacity`. Generates slot grid via the "Enterprise Tetris" algorithm that iterates half-hour slots, enforces lunch, advance notice, closedDates, and multi-service/multi-pet department capacity. Also exports `findFirstBookableDate()` used by B5 follow-up booking (cascade: exact → ±tolerance → 14-day scan).
  - **Known flaw:** uses `getDoc()` one-shot for `clinic_settings`, not `onSnapshot` — mobile users see stale closedDates until screen remount (flagged in `handoff.json` as P2).
- **`src/utils/statusLabels.js`** — single source of truth for the 12-status badge/icon/color system and the `sanitizeCancelReason()` that strips admin forensic prefixes from reasons before showing to clients.
- **`src/components/SuperCard.js`** — the live super-card pinned above the ClientAppointments tab row for any active-status appointment; hardcoded phone (`09123456789`, P3 known issue).

### Firestore Read/Write (Mobile)

| Collection | Read | Write |
|---|---|---|
| `users` | profile, staff for capacity | `expoPushToken` on dashboard mount |
| `pets` | ownerId filter (realtime) | add/edit pet |
| `appointments` | day queries, own appts (realtime) | writeBatch create, update to cancelled (w/ auditReason) |
| `medical_records` | petId timeline | none on mobile |
| `services` | catalog | none |
| `clinic_settings/general` | one-shot | none |
| `queue/daily_queue` | realtime | via ScannerScreen transaction |

---

## 3. Admin Dashboard Architecture — `VetConnect-Admin/`

**Stack:** React 19, Vite 7, MUI 7, JS. Entry: `src/main.jsx → src/App.jsx`. Auth: `src/context/UserContext.jsx` — real-time `onSnapshot` on `users/{uid}`; exposes `user`, `profile`, `isAdmin`, `loading`. `isAdmin = accessLevel==='admin' || role==='admin'`.

### Route Map (`App.jsx:79–114`)

```
/login                        Login.jsx
/                             Dashboard.jsx
/queue                        features/Queue/Queue.jsx (2597 lines)
/records                      features/Records/Records.jsx
/patients                     features/Patients/Patients.jsx
/patients/:id                 features/Patients/PatientDashboard.jsx
/services                     features/Services/Services.jsx
/inventory                    features/Inventory/Inventory.jsx
/staff                        features/Staff/Staff.jsx (adminOnly)
/sales                        features/Sales/Sales.jsx (adminOnly)
/expenses                     pages/Expenses.jsx (adminOnly)
/monitor                      pages/Monitor.jsx (fullscreen lobby TV)
/settings                     pages/Settings.jsx (adminOnly)
```

`MainLayout` (`App.jsx:46–60`) skips the Sidebar when `location.pathname === '/monitor'` for fullscreen lobby display.

### Feature Module Inventory

Each module lives under `src/features/<Name>/` with `components/`, `modals/`, `hooks/` subfolders.

#### Queue (`features/Queue/`)
- `Queue.jsx` (2597 lines) — the core clinical operations console. Tabs for today vs. scheduled, forensic pulse metrics grid, staff assignment, walk-in triage, end-of-day reconciliation.
- Modals/dialogs: `WalkInModal`, `AssignStaffModal`, `EndOfDayModal`, `DispensingVerificationDialog`.
- `ForensicMetricGrid.jsx`, `queueColumns.jsx`, `useQueueActions.js` — `changeStatus`, `revertStatus`, `markNoShow`, `rejectAppointment`, `quickAdmitER`, `deferAppointment`, `rescheduleAppointment`.
- **Firestore:** `appointments` (realtime, writes, transactions), `users` (vets listener), `inventory`, `inventory_categories`, `services`, `departments`, `medical_records` (history peek).

#### Patients (`features/Patients/`)
- `Patients.jsx` (directory), `PatientDashboard.jsx` (`:id` route).
- Components: `BillingLedger`, `ClientDetails`, `ClientHeader`, `InternalLogs`, `PatientDirectory`, `PetList`.
- Modals: `AddPetModal`, `EditPetModal`, `NewClientModal`, `QuickBookModal`.
- Hook: `usePatientManager.js` — joins pets, medical_records, appointments, sales by client.
- **Firestore:** `users` (role==='pet_owner'), `pets`, `medical_records`, `appointments`, `sales`.

#### Records (`features/Records/`)
- `Records.jsx` — global records grid with 6 silos: GLOBAL, TRIAGE, CLINICAL, IN-PATIENT, ARCHIVE, VOIDED; date-range, facet filters (vet, service, species, origin), and an audit popover that drives `useAncestorChain`.
- Hooks: `useGlobalRecords.js`, `useAncestorChain.js`.
- **Firestore:** `appointments`, `medical_records`.

#### Services (`features/Services/`)
- `Services.jsx`, `ServiceTable`, `ServiceActivityLog`, `ServiceFormModal`, `ServiceLogModal`, `useServices.js`.
- **Firestore:** `services`, `service_logs`, `inventory`, `departments`.
- Tiered pricing: `utils/resolveTieredPrice.js`.

#### Inventory (`features/Inventory/`)
- `Inventory.jsx` — KPI cards (Low Stock / Out of Stock / Expiring Soon / Total Value), filterable grid.
- `InventoryTable`, `GlobalActivityLog`, `ProductFormModal`, `StockAdjustModal`, `InventoryLogModal`, `ConfirmDeleteModal`.
- `hooks/useInventory.js` — `createItem`, `updateItem`, `deleteItem`, `restoreItem`, `adjustStock`, `scrubDatabase`.
- **Firestore:** `inventory`, `inventory_logs`, `inventory_categories`.

#### Staff (`features/Staff/`)
- `Staff.jsx`, `StaffTable`, `StaffFormModal`, `ConfirmRevokeModal`, `useStaffManager.js`.
- **Firestore:** `users` (all staff), `staff_logs`, `departments`, `appointments` (active check).

#### Sales (`features/Sales/`)
- `Sales.jsx`, `EodSummary.jsx`, `useSalesData.js`.
- **Firestore:** `sales`, `inventory_logs` (for refund stock restoration).

### Shared Components

- **`components/ClinicalWorkspace.jsx` (1989 lines)** — the biggest single file in the repo. Renders the SOAP form for an appointment row, pulls last vitals from `medical_records` history for the comparison "ghost", enforces a vaccine-visit branch, holds the A3 draft recovery banner, runs the assistive rule-based `KNOWLEDGE_BASE` (keyword→test suggestions), manages the Rx cart with inventory reservation/release, and on sign-off does a `writeBatch` that creates a `medical_records` doc, sets the appointment to `dispensing` or `billing`, and creates a follow-up ghost appointment when `nextVisit` is set (B5). Consumed by `Queue.jsx` and `Records.jsx`.
- **`components/POSModal.jsx` (554 lines)** — the billing surface. `runTransaction` path: re-reads each inventory item, FIFO-deducts batches by expiry (falls back to flat stock), writes `inventory_logs` audit, creates a `sales` doc with cashier/discount/payment metadata, updates the appointment to `completed`. Renders and prints an official receipt via `window.open` + `printWindow.print()` with pop-up-blocker detection. Consumed by `Queue.jsx`.
- **`components/Sidebar.jsx`** — renders `menuItems` array with `adminOnly` flag; filters the menu via `const visibleMenuItems = menuItems.filter(i => !i.adminOnly || isAdmin)`. Staff, Transactions, Expenses, Settings are admin-only.

### Context & Design System

- **`context/UserContext.jsx`** — the only React context in the admin app.
- **`theme/designTokens.js`** — exports `COLORS`, `TYPE`, `FONT`, `GLASS`; consumed throughout `features/` and `components/`. MUI `theme` is hydrated from this file in `App.jsx:31–43`.
- **`hooks/useClinicSettings.js`** — a singleton `useSyncExternalStore` pattern that maintains a module-level `onSnapshot` on `clinic_settings/general` for the lifetime of the page. This is the admin's live clinicSettings feed (used by Queue, Records, Settings).

---

## 4. Backend State — `VetConnect-Backend/`

### `functions/index.js` — 390 lines, NOT deployed

Five exports, all Firebase Functions v1 runtime:
1. `midnightQueueSweep` — `pubsub.schedule('59 23 * * *')` cron, Asia/Manila, resets `queue/daily_queue` counters.
2. `reservationCleanup` — `pubsub.schedule('0 6 * * *')` cron, corrects stranded `inventory.reserved` values by diffing against active appointments' `prescribedItems`.
3. `secureBookAppointment` — `https.onCall` validator: checks 2-hour advance notice against server clock, enforces `closedDates`, caps active appointments at 4, creates `appointments` via admin batch. **Explicitly marked ASPIRATIONAL in comments** (`functions/index.js:138–160`) — the mobile `BookAppointment.js` does NOT invoke it; bookings are a direct `writeBatch`.
4. `sendAppointmentUpdateNotification` — Firestore trigger on `appointments/{id}` that pushes to Expo via `axios.post('https://exp.host/--/api/v2/push/send', ...)` with per-status title/body. Dead code in the Spark environment.
5. `mergeGuestAccount` — `auth.user().onCreate` that reconciles unclaimed guest profiles by phone. Dead.

### `firestore.rules` — 56 lines, **DEPLOYED and LIVE**

Confirmed live per handoff. Contents:
- Global: all reads/writes require `request.auth != null`.
- `appointments/{apptId}`:
  - `create`: auth + not closed (`scheduledDateStr ∈ clinic_settings/general.closedDates` triggers rejection).
  - `update`: auth + `isTriaged` one-way (never reverts from true), + transition to `cancelled`/`no-show` requires non-empty `auditReason` string, + setting `isTriaged=true` requires non-null `forensicSeal` field.
- All other collections: authenticated read/write only (no per-field or per-role rules).

**Gap:** The rules enforce auth but do NOT enforce role-based restrictions. A user logged in as `pet_owner` on the mobile app could, in principle, write to `inventory` or `sales` — nothing in the rules stops them. The admin UI is gated client-side via `isAdmin`, which is cosmetic, not a security boundary. This is a legitimate security shortcoming relative to the thesis's RBAC + RA 10173 claims.

---

## 5. Firestore Data Model (inferred from code)

### Active collections

| Collection | Key fields read/written | Notes |
|---|---|---|
| `users` | `uid`, `role` (pet_owner/vet/groomer/staff/admin), `accessLevel`, `departments[]`, `fullName`, `email`, `phone`, `expoPushToken`, `accountStatus` (claimed/unclaimed_guest), `outstandingBalance` (orphaned per handoff) | Auth-linked profiles; staff gated by `accessLevel` |
| `pets` | `ownerId`, `name`, `species`, `breed`, `gender`, `color`, `isNeutered`, `dob`, `weight`/`lastWeight`, `allergies`, `status` (active/archived) | Owned by clients |
| `appointments` | `ownerId`, `petId`, `petName`, `petSpecies`, `petBreed`, `petGender`, `petColor`, `petIsNeutered`, `petBirthdate`, `petWeight`, `petAllergies`, `services[]`, `primaryService`, `serviceType`, `serviceCategory`, `serviceDuration`, `serviceBuffer`, `servicePrice`, `status`, `scheduledDate` (Timestamp), `scheduledDateStr` (YYYY-MM-DD for rules), `triageDate`, `createdAt`, `qrCode`, `notes`, `queueNumber`, `ticketPrefix`, `isTriaged`, `forensicSeal`, `auditReason`, `clinicalPulse[]`, `soapDraft`, `prescribedItems[]`, `prescribedItemsVersion`, `balanceRemaining`, `isFollowUp`, `parentAppointmentId`, `parentRecordId`, `timeCompleted`, `caseDay`, `ownerName`, `department`, `staffId`, `staffName`, `workflowType` | 12-status lifecycle |
| `medical_records` | `appointmentId`, `petId`, `petName`, `ownerId`, `ownerName`, `vetId`, `vetName`, `signedBy`, `date`, `serviceType`, `soap{subjective, objectiveNotes, assessment, plan}`, `vitals{weight, temp, hr, rr, crt, bcs, pain}`, `dischargeSummary{vetName, ...}`, `patientStatus`, `nextVisit`, `items[]` | Orphaned fields per handoff: `recheckOutcome`, `labValues`, `dentalGrade`, `outcomeAssessment`, `parentRecordId`, `childRecordId`, `resolvedAt`, `orderIds` |
| `services` | `name`, `price`, `duration`, `bufferTime`, `department`/`category`, `targetSpecies`, `isArchived`, `tieredPricing[]` (weight-based) | |
| `inventory` | `itemName`, `stock`, `reserved`, `minStock`, `batches[{batchNumber, qty, expiryDate}]`, `expiryDate`, `isArchived`, category | FIFO batches; minStock drives Low Stock KPI |
| `inventory_logs` | `itemId`, `itemName`, `action` (SOLD/ADJUSTED/etc), `amountChange`, `reason`, `userId`, `userName`, `timestamp` | Audit trail |
| `inventory_categories` | `name` | |
| `service_logs` | service audit entries | |
| `staff_logs` | staff audit entries | |
| `sales` | `appointmentId`, `petName`, `ownerName`, `items[]`, `subtotal`, `discount`, `depositPaid`, `total`, `paymentMethod`, `hasScPwdDiscount`, `date`, `cashier`, `cashierId`, `status`, `prescribedItemCount`, `cashierAddedItemCount`, `hasUnprescribedAdditions` | POS receipts |
| `queue/daily_queue` | `currentServing`, `currentPrefix`, `lastNumberIssued`, `status` | Single doc counter |
| `clinic_settings/general` | `openHour`, `closeHour`, `workingDays[]`, `closedDates[]`, `maxCages`, `advanceNoticeMins`, `minSlotInterval`, `lunchEnabled`, `lunchStart`, `lunchEnd`, `trafficModerate`, `trafficHigh`, `maxPetsPerBooking` | |
| `departments` | `name`, `color` | |
| `expenses` | `amount`, `date`, `loggedBy`, description | |

### Orphaned collections (per handoff; no code consumers confirmed)
- `protocols` — vaccine/parasite/wellness schedules
- `estimates` — treatment plan estimates
- `nps_responses` — post-visit feedback
- `cashier_shifts` — cashier shift reconciliation

### Appointment Status Lifecycle (as implemented, `utils/statusConstants.js`)

```
pending ──┬─► confirmed ──┬─► arrived ──┬─► in-consult ──┬─► dispensing ──► billing ──► completed
          │               │             │                │
          │               │             ▼                ▼
          │               │          on-hold          confined ──► carried-over ──► (back to arrived)
          │               │             │                │
          ▼               ▼             ▼                ▼
       cancelled      cancelled     cancelled        completed
       no-show        no-show       no-show
```

Rules enforcement: `cancelled`/`no-show` transitions require `auditReason`, `isTriaged` is one-way.

---

## 6. Thesis Requirement Coverage Matrix

| Thesis Feature | Required | Implemented? | Where | Gaps / Notes |
|---|---|---|---|---|
| **Online booking (client-led)** | Yes | ✅ Full | `VetConnect/src/screens/BookAppointment.js`, `src/hooks/useBookingEngine.js` | Multi-service, multi-pet, closedDates, department capacity, advance notice all enforced client-side. Bypasses Cloud Function. |
| **Walk-in registration (staff-led)** | Yes | ✅ Full | `VetConnect-Admin/src/features/Queue/WalkInModal.jsx` + `useQueueActions.js` | Admin creates pet + client + appointment in one flow. |
| **QR code check-in** | Yes | ✅ Full | Mobile: `ScannerScreen.js` (expo-camera → Firestore transaction); generation in `BookAppointment.js:393` and `WalkInModal.jsx`. Format: `VC-{uid5}-{timestamp}-{index}` | QR only verifies; contains no PHI. Consistent with thesis Key Definitions. |
| **Automated reminders** | Yes (thesis: cloud-function-driven) | ⚠️ Partial — NOT in thesis sense | Mobile: `ClientDashboard.js:213–246` reads `medical_records.nextVisit`, shows in-app banner; B5 follow-up ghost in `ClientAppointments.js` | **Thesis gap**: no push, no SMS, no email. `sendAppointmentUpdateNotification` in `functions/index.js` is dead code. In-app Firestore listener is the entire "reminder" system. |
| **Timeline medical records** | Yes | ✅ Full | Mobile: `PetHistoryScreen.js:140–200` — timeline graphic with dots + SOAP cards per visit, vitals, discharge. Admin: `Records.jsx` + `PatientDashboard.jsx` with ancestor chain | Real. |
| **Rule-based queue coordination** | Yes | ✅ Full | `features/Queue/Queue.jsx` (2597 lines), `useQueueActions.js`, state machine in `statusConstants.js:VALID_TRANSITIONS` | 12-status lifecycle enforced in code and rules. |
| **POS billing** | Yes | ✅ Full | `components/POSModal.jsx` | Receipts print via `window.print()`, SC/PWD discount, payment method, cashier attribution. |
| **Inventory auto-deduct on sale** | Yes | ✅ Full | `POSModal.jsx:290–338` — Firestore `runTransaction`, FIFO batch deduction by expiry, falls back to flat stock, writes `inventory_logs` audit entry | Real and transactional. |
| **Low-stock alerts** | Yes | ✅ Partial | `Inventory.jsx:136–152, 311–312` — KPI tile showing count of items where `stock <= minStock` | Passive UI badge only. No push, no email, no banner elsewhere in the app. |
| **FAQ chatbot** | Yes (non-clinical, booking/nav) | ✅ Full | `VetConnect/src/screens/ChatbotScreen.js:30–445` — rule-based with dynamic open/closed computation from `clinic_settings`, reads services catalog | Matches thesis scope exactly (rule-based, informational). |
| **Printable receipts** | Yes | ✅ Full | `POSModal.jsx:381–397` | Pop-up blocker detection, official receipt template. |
| **Printable visit summaries** | Yes | ❌ Missing | — | No `window.print()` or PDF generation for medical records / discharge sheets found. Only POS receipts print. |
| **Printable vaccination records** | Yes | ❌ Missing | — | No vaccination card export. Vaccination data IS captured (ClinicalWorkspace vaccine branch + `vaccine` keyword detection on line 833) but no print target. |
| **Printable referral reports** | Yes | ❌ Missing | — | No referral template or export path. |
| **Assistive clinical support** | Yes (non-diagnostic) | ✅ Full | `ClinicalWorkspace.jsx:266–273` `KNOWLEDGE_BASE` array + `runAssistiveDiagnosis()` at line 708 + `DiagnosticBridge` component | 6-rule keyword→test-suggestion engine. Matches thesis language ("strictly supportive, not diagnostic"). |
| **Secure authentication** | Yes | ✅ Full | Firebase Auth (email/password) on both mobile and admin; `UserContext.jsx` realtime profile | |
| **Role-Based Access Control (RBAC)** | Yes | ⚠️ Partial — client-side only | Mobile: `LoginScreen.js:50–55` routes by role. Admin: `Sidebar.jsx:50` filters adminOnly items by `isAdmin`. Rules: auth-only, no role enforcement | **Security gap**: Firestore rules don't enforce roles. A client with `pet_owner` role could technically write to any non-`appointments` collection. Thesis's RA 10173 compliance claim is weakened by this. |
| **Audit trail logging** | Yes | ✅ Full | `inventory_logs`, `service_logs`, `staff_logs`, `appointments.clinicalPulse[]`, `appointments.auditReason`, `appointments.forensicSeal`, sales attribution fields | Pervasive. Exceeds thesis requirement. |
| **Data privacy / client portal restrictions** | Yes (sensitive notes restricted from client) | ⚠️ Partial | Mobile `PetHistoryScreen.js` exposes `soap.subjective`, vitals, discharge, vet name | Client DOES see SOAP subjective notes. Thesis says "sensitive clinical notes and internal vet records are restricted from the client portal" — the mobile timeline shows subjective/assessment text that the thesis arguably says should be clinician-only. This is a thesis/reality interpretation gap the developer should be prepared to address. |
| **Monitor / lobby display** | Not explicitly required | ✅ Bonus | `pages/Monitor.jsx` fullscreen lobby TV view (no sidebar) | |
| **End-of-day reconciliation** | Not explicitly required | ✅ Bonus | `Queue/EndOfDayModal.jsx` — leftover patient triage w/ mandatory auditReasons | |

**Rough shipped coverage against thesis-required features: ~80%.** Missing: non-receipt printables (3 categories), push-style reminders (1), role-based Firestore security (1), client-portal note redaction (1).

---

## 7. Thesis / Reality Divergences (Critical Section)

These are the items the developer must be ready to defend. Each is a place where the code contradicts the thesis document verbatim.

### D1. "Mobile only, React Native + Expo" — FALSE

**Thesis claim** (`thesis_notes.md` Batch 9, Table 3.1 and Batch 3 limitations): frontend is React Native + Expo; limitation says "no native mobile applications (web-based only)".
**Reality:** The system has BOTH:
- a React Native mobile Expo app (`VetConnect/`), AND
- a React + Vite + MUI web admin dashboard (`VetConnect-Admin/`) that is ~3× the size of the mobile app and hosts 100% of the clinical operations (SOAP, POS, queue control, inventory, staff, settings, lobby monitor).

**Also note a contradiction internal to the thesis itself**: Batch 3 says "no native mobile applications (web-based only)" while Batch 9 Table 3.1 says React Native (Cross-platform for Android and iOS). The thesis is internally inconsistent about whether the product is native mobile or web.

**Defense recommendation:** Own the reality. Reframe the architecture as "dual-surface: pet owners on mobile, clinic staff on web — each optimized for its context" and fix the thesis prose to match. Cite the design rationale in `handoff.json` ("solo-vet clinics need desktop for multi-window clinical work; pet owners need phone-native booking").

### D2. "Cloud Functions for validation and reminders" — ASPIRATIONAL ONLY

**Thesis claim** (Batch 9 Backend Infrastructure): "Uses Firebase Cloud Functions for background tasks like appointment validation and reminder delivery."
**Reality:** The Firebase project is on the Spark (free) plan, which Google blocks from deploying any Cloud Function (policy since late 2023). Source exists in `functions/index.js` for five functions but none are deployed. Mobile booking bypasses `secureBookAppointment` entirely (direct `writeBatch` in `BookAppointment.js:390`). `sendAppointmentUpdateNotification` is dead code. The `midnightQueueSweep` cron never runs. The dead code is even self-documented at `functions/index.js:138–160` with a note that the Blaze upgrade is the activation path.

Server-side validation that DOES exist lives in the deployed `firestore.rules`:
- closedDates enforcement on `appointments.create`
- auditReason enforcement on cancel/no-show transitions
- isTriaged one-way invariant
- forensicSeal required for triage

**Defense recommendation:** Either (a) upgrade to Blaze for the demo and deploy the functions (the code is ready and mostly correct), or (b) rewrite the thesis backend section to say "server-side enforcement via Firestore security rules, with Cloud Functions reserved as an aspirational Blaze-plan upgrade path." Don't claim functions in the defense without deploying them.

### D3. Reminders are in-app Firestore listeners, not "automated reminders"

**Thesis claim**: "automated reminders" that (per lit review) reduce no-shows by 20–40%.
**Reality:** `ClientDashboard.js:213–246` subscribes to `medical_records` with `nextVisit` and renders upcoming visit banners. That's it. No scheduled push (needs Blaze), no SMS, no email. A pet owner who doesn't open the app never sees any reminder.

**Defense recommendation:** Add an explicit scope caveat: "Reminders are implemented as in-app banners on the client dashboard and the B5 follow-up ghost row; background push is an FDD Phase-6 feature pending Blaze upgrade." This is defensible — the app is running on free infra.

### D4. Firestore rules do not enforce RBAC

**Thesis claim**: "Role-Based Access Control (RBAC)"; "server-side rules restrict data access based on user roles and permissions."
**Reality:** `firestore.rules` checks only `request.auth != null` for every collection except `appointments`. Role/access-level is never read from the rules. The admin UI's role gating (`Sidebar.jsx:50`, `LoginScreen.js:50`) is cosmetic — any authenticated user can write to `inventory`, `sales`, `users`, etc. via a direct Firestore call.

**Defense recommendation:** Add a 20-line rule patch that reads `get(/databases/$(database)/documents/users/$(request.auth.uid)).data.accessLevel` and gates write access to inventory/sales/staff by `accessLevel == 'admin'`. This is a legitimate P1 security hardening, and doing it before defense closes the single most material gap in the RA 10173 compliance story.

### D5. Client portal shows SOAP subjective text

**Thesis claim**: "sensitive clinical notes and internal vet records are restricted from the client portal."
**Reality:** `PetHistoryScreen.js:173–186` renders `item.soap?.subjective` directly to clients (after stripping a decorative `Client noted:` prefix). It also shows discharge summary, vet name, vitals. Whether `soap.subjective` counts as "sensitive clinical notes" depends on interpretation — subjective is the client's own reported history, so technically it's THEIR data reflected back. But the field is freeform and can easily contain vet notes.

**Defense recommendation:** Minor — but consider limiting PetHistoryScreen to discharge summary + vaccinations + next-visit, and hiding the free SOAP text. Or explicitly argue that subjective is client-owned data.

### D6. Printable outputs: only receipts actually print

**Thesis claim**: "Generation of receipts, visit summaries, vaccination records, and referral reports."
**Reality:** Only POS receipts (`POSModal.jsx:381–397`) print. There is no code path for visit summary PDFs, vaccination card printing, or referral letters. `window.print`, `react-to-print`, and `jsPDF` have no other matches in the repo.

**Defense recommendation:** This is the single biggest legitimate feature gap. If you can ship anything before defense, ship at minimum a printable **visit summary** from the discharge card — it's a `window.open` + HTML template pattern copied straight from `POSModal.jsx:381`, and uses data you already have on each medical record. Vaccination records and referral letters can be cited as "Phase 6 follow-on."

### D7. Features in code the thesis doesn't mention (architectural investments)

These are the strengths hidden in the codebase that probably deserve a paragraph in the thesis Chapter IV/V.

- **A3 Draft SOAP Recovery banner** — `ClinicalWorkspace.jsx:421–490` 3-branch detection (fresh/stale/none), Resume/Discard actions. Demonstrates forensic rigor: prevents silent hydration of stale drafts from contaminating clinician sign-off. Directly maps to thesis "clinical responsibility stays with the vet."
- **B5 One-Tap Follow-Up Booking** — end-to-end loop in `ClinicalWorkspace.jsx`, `ClientAppointments.js`, `BookAppointment.js`, `findFirstBookableDate()` in `useBookingEngine.js:340–382`. Demonstrates cross-surface feature engineering with closedDates awareness.
- **Clinical Pulse Forensic Engine** — `VetConnect-Admin/src/utils/pulseUtils.js` with business-hour and absolute clock modes, salami-slicer math across day boundaries, 6 duration metrics. This is a significant engineering investment.
- **ClosedDates end-to-end enforcement** — admin UI (Settings), mobile guard (`useBookingEngine`), Firestore rule (deployed), and the aspirational Cloud Function. Defense-ready story: "defense-in-depth on a calendar constraint."
- **12-status state machine with explicit valid-transitions table** — `statusConstants.js:VALID_TRANSITIONS`. Rare in thesis-level student code.
- **Feature-module architecture with per-feature hooks** — each admin feature is a self-contained micro-app.
- **Design token system (`theme/designTokens.js`)** — consistent neubrutalism enforcement.
- **FIFO batch-aware inventory with audit logs** — `POSModal.jsx:290–338`, transactional and correct.

---

## 8. Readiness Assessment

### Shipped-vs-required score
- **Hard features (~80% shipped, blunt count):** online booking ✓, walk-in ✓, QR check-in ✓, timeline records ✓, rule-based queue ✓, POS billing ✓, auto-deduct ✓, low-stock alert ✓, chatbot ✓, receipts ✓, assistive support ✓, audit trail ✓, authentication ✓. That's 13/16.
- **Soft gaps (3/16):** visit summary/vaccination/referral printables, push/SMS reminders, role-enforced Firestore rules.
- **Structural gaps (not in matrix):** web admin in addition to mobile, Cloud Functions dead code, SOAP subjective exposed to clients.

### Defense demo risk ladder

| Severity | Gap | Sink-the-demo probability |
|---|---|---|
| **P0** | Panel asks "show me a printed visit summary for my pet" | **High** — nothing to demo. 30–60 min to patch by cloning POS print flow. |
| **P0** | Panel asks "walk me through the Cloud Functions" or "how does the reminder get sent" | **High** — only defensible by pivoting to "Firestore rules + in-app listeners, with Blaze-plan activation path documented." Pre-rehearse this pivot. |
| **P0** | Panel asks "your thesis says web-based mobile-only, why is there a desktop dashboard" | **High if unrehearsed, low if owned** — reframe as dual-surface design. Update the thesis section beforehand if possible. |
| **P1** | Panel opens Firestore Console and notices non-admin users can write to `inventory` | **Medium** — unlikely to happen live, but technically a failure of the RBAC claim. 1–2 hours to patch with rule updates. |
| **P1** | Panel asks to see vaccination history printout | **Medium** — same fix as visit summary. |
| **P2** | Panel notices SOAP subjective text on pet owner's phone | **Low** — defensible as client-reported data. |
| **P2** | Panel notices hardcoded clinic phone | **Low** — cosmetic. |

### Is it defendable as-is?

**Yes, with caveats.** The clinical and operational features are real, correct, and in many places (pulse metrics, state machine, audit trail, closedDates defense-in-depth) exceed normal capstone quality. The holes are bounded and explainable.

**The honest risk is not the code — it's the thesis document claiming things the code does not do.** A panel that reads the thesis carefully and then opens the running system will notice (1) desktop exists where the thesis says mobile-only, (2) no functions are deployed where the thesis says functions run validation/reminders, (3) no printable vaccination/referral. If you cannot fix those facts in the code, fix them in the thesis narrative *before* defense.

### Minimum Viable Pre-Defense Checklist

If you have 2–3 days:

1. **[P0, 2–3 hrs]** Add a printable **visit summary** to `PetHistoryScreen` (mobile) AND a printable **vaccination record** to the admin `ClinicalWorkspace` vaccine branch. Copy the `POSModal.jsx:381–397` print pattern verbatim.
2. **[P0, 1–2 hrs]** Write a 1-page "Architecture Reality vs. Thesis Document" addendum for the defense — explicitly label the 4 divergences (D1, D2, D3, D6) as conscious FDD scope decisions with rationale. This turns "gotcha" into "we anticipated this."
3. **[P1, 2 hrs]** Patch `firestore.rules` to gate writes on `inventory`, `sales`, `inventory_logs`, `staff_logs`, `service_logs`, and `users` by admin/staff role. Deploy. This is the single highest-leverage security fix.
4. **[P1, 1 hr]** Add a TODO comment in the mobile `PetHistoryScreen.js` explaining the SOAP subjective exposure, OR gate it behind a check.
5. **[P2 nice-to-have, 4 hrs]** Upgrade the project to Blaze for a defense-only window, deploy `midnightQueueSweep` and `sendAppointmentUpdateNotification`, demo one push notification live, then downgrade. This single demo turns D2 from a gap into a showcase.

If you only have 1 day: do steps 1 + 2.

If you only have half a day: do step 2.

---

## 9. Architectural Strengths — The Defense Story

Use these as your "investment narrative" paragraphs. Every one of them is backed by real code:

1. **Defense-in-depth on closed dates.** Four-layer enforcement: admin Settings UI → mobile `useBookingEngine` slot guard → Firestore rule (deployed and live) → aspirational Cloud Function (documented). Cite: `Settings.jsx:262–273`, `useBookingEngine.js:161–168`, `firestore.rules:14–19`, `functions/index.js:162–181`.

2. **Forensic clinical pulse engine.** `pulseUtils.js` computes 6 duration metrics (recordAge, opHoursAge, shiftQueue/totalQueue, shiftConsult/totalConsult) with business-hour and absolute clock modes and a salami-slicer that respects midnight gates. `ForensicMetricGrid.jsx` renders these live in the Queue and Records consoles.

3. **12-status state machine with validated transitions.** `statusConstants.js` defines `VALID_TRANSITIONS` as a frozen object and `validateTransition()` as a pure function. Rare in capstone code and directly demonstrates the "rule-based queue coordination" thesis requirement in source form.

4. **A3 Draft SOAP Recovery.** Intercepts silent hydration of stale draft SOAPs before a vet signs off contaminated notes. The 3-branch detection + Resume/Discard banner + `DRAFT_DISCARDED` pulse event is a legitimate patient-safety feature.

5. **B5 One-Tap Follow-Up Booking loop.** Vet sets `nextVisit` in SOAP → admin `ClinicalWorkspace` creates a pending follow-up ghost → mobile `ClientAppointments` renders it as an amber "Follow-Up Recommended" row → client taps Book → `BookAppointment` pre-fills with `findFirstBookableDate()` cascade (exact/±tolerance/14-day scan) → new booking commits, ghost is cancelled with `auditReason: 'client-booked-followup'`. Touches 4 files and respects the Firestore rule on cancellation reasons.

6. **FIFO-aware POS transaction.** `POSModal.jsx:290–338` uses Firestore `runTransaction` to re-read each inventory item, sort batches by expiry, deduct smallest expiring first, fall back to flat stock when batches are absent, reject expired flat stock, write audit log, write sale, and flip the appointment to completed — all atomically. No thesis requires this level of correctness; you built it anyway.

7. **Feature-module architecture.** Each admin feature under `src/features/<Name>/` has its own `components/`, `modals/`, `hooks/`. This is a clean implementation of the FDD "Build by Feature" stage, directly matching Batch 7 of the thesis methodology.

8. **Centralized design token system.** `theme/designTokens.js` exports `COLORS`, `TYPE`, `FONT`, `GLASS` — consumed by `App.jsx` MUI theme and feature files. Enforces the "Modern Clinical Neubrutalism" aesthetic consistently. Defense story: "I made one consistent visual language for the clinical surface and another for the pet-owner surface and did not let them contaminate each other."

9. **Singleton `onSnapshot` clinicSettings store.** `useClinicSettings.js` uses `useSyncExternalStore` with a module-level subscriber set to give every admin component the same live settings without Strict Mode double-mount flicker. Sophisticated React pattern for a capstone.

10. **End-of-day reconciliation with mandatory audit reasons.** `EndOfDayModal.jsx` requires the operator to explicitly classify every leftover patient (completed/carry-over/no-show/cancel) with `auditReasons[]` before the batch commit can fire, enforced both at the UI level (Phase 3 hard-gate) and at the Firestore rule level.

11. **Assistive clinical support that matches thesis language exactly.** `KNOWLEDGE_BASE` in `ClinicalWorkspace.jsx:266–273` is a 6-rule keyword→suggestion engine that outputs "RECOMMEND: …" text. Not AI, not diagnostic, not deterministic — exactly what the thesis says at Batch 3 "strictly for support, not a replacement for professional judgment."
