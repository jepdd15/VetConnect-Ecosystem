# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a **monorepo with three sub-projects** sharing a single Firebase backend (`starbarks-vetconnect-f6443`):

| Directory | What | Stack |
|---|---|---|
| `VetConnect/` | Mobile app (client & staff) | Expo 54, React Native 0.81, React 19, TypeScript/JS |
| `VetConnect-Admin/` | Web admin dashboard | React 19, Vite 7, MUI 7, TypeScript/JS |
| `VetConnect-Backend/` | Cloud Functions | Node 20, Firebase Functions v7 |

Each has its own `package.json` — run `npm install` inside the relevant directory.

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

### Backend (`VetConnect-Backend/functions/`)
```
npm run serve      # Firebase emulator
npm run deploy     # Deploy Cloud Functions
npm run logs       # View function logs
```

## Architecture

### Mobile Navigation (React Navigation)
- Entry point: `VetConnect/App.js` — single Stack Navigator
- **Role-based routing** after login: users with role/accessLevel of `admin`, `staff`, `veterinarian`, or `groomer` route to `StaffDashboard`; everyone else to `ClientDashboard`
- Client flow: Dashboard → MyPets, BookAppointment, ClientAppointments, PetHistory, QueueScreen, ChatbotScreen
- Staff flow: Dashboard → StaffAppointments, ManageQueue, Scanner (QR check-in), Consultation (SOAP notes)

### Admin Dashboard (React Router)
- Entry: `VetConnect-Admin/src/main.jsx` → `App.jsx`
- Auth context: `src/context/UserContext.jsx` — exposes `useUser()` with `user`, `isAdmin`, `loading`
- **Feature-module architecture** in `src/features/` — each module has its own `components/`, `modals/`, `hooks/` subdirectories:
  - `Queue/` — clinical queue management, walk-ins, staff assignment, end-of-day reconciliation
  - `Patients/` — CRM with `PatientDashboard` (`:id` route), client/pet CRUD, billing ledger
  - `Records/` — global medical records with ancestor-chain navigation
  - `Services/` — service catalog, activity logs, tiered pricing
  - `Inventory/` — product management, stock adjustments, audit logs
  - `Staff/` — staff directory, role management
  - `Sales/` — transaction ledger, end-of-day summaries
- Standalone pages in `src/pages/`: Dashboard, Monitor (fullscreen, no sidebar), Expenses, Settings, Login
- Shared components: `ClinicalWorkspace` (clinical queue/triage), `POSModal` (billing), `Sidebar`
- **Sidebar role gating**: menu items with `adminOnly: true` are filtered out for non-admin users
- Routes: `/`, `/queue`, `/records`, `/patients`, `/patients/:id`, `/services`, `/inventory`, `/staff`, `/sales`, `/expenses`, `/monitor`, `/settings`

### State Management
No Redux or Zustand. State is managed via:
- **Local `useState` hooks** per screen
- **Firestore `onSnapshot()` listeners** for real-time reactivity (queue state, appointments, pets)
- **Custom hooks per feature** (admin): `useQueueActions`, `usePatientManager`, `useStaffManager`, `useInventory`, `useServices`, `useSalesData`, `useGlobalRecords`, `useAncestorChain` — each in their feature's `hooks/` directory
- **`useBookingEngine` hook** (`VetConnect/src/hooks/useBookingEngine.js`) — the core mobile booking logic implementing multi-service, multi-department slot scheduling with department capacity tracking

### Data Layer — Firebase
- **Auth**: Email/password with `ReactNativeAsyncStorage` persistence on mobile
- **Firestore** (primary database): real-time listeners throughout; transactions for atomic queue operations
- **Cloud Storage**: pet images, documents
- **Cloud Functions**: server-side validation, cron jobs, push notifications

### Key Cloud Functions (`VetConnect-Backend/functions/index.js`)
- `midnightQueueSweep` — cron (11:59 PM Asia/Manila): resets daily ticket counter
- `secureBookAppointment` — validates bookings server-side (advance notice, appointment caps, QR generation)
- `sendAppointmentUpdateNotification` — Firestore trigger: sends Expo push notifications on appointment status changes
- `mergeGuestAccount` — Auth trigger: reconciles guest accounts by phone number on registration

### Firestore Collections
| Collection | Purpose |
|---|---|
| `users` | Profiles (clients & staff), role, departments, push tokens |
| `pets` | Pet profiles linked to owners via `ownerId` |
| `appointments` | Bookings with status lifecycle: pending → confirmed → arrived → in-consult → dispensing → billing → completed |
| `medical_records` | SOAP-format clinical records linked to pets via `petId` |
| `services` | Available services with duration, department, target species, pricing. Tiered pricing via `hasTieredPricing` (bool) + `pricingTiers` (array of {minWeight, maxWeight, price}) |
| `clinic_settings` | Operating hours, slot intervals, traffic thresholds, booking limits |
| `queue` | `daily_queue` doc: currentServing, lastNumberIssued, status |

## Design System — Modern Clinical Neubrutalism

The UI follows a strict design language (see `VETCONNECT_MODERN_NEUBRUTALISM_DESIGN_GUIDE.md`):

- **Zero border-radius** on all containers, inputs, buttons — `borderRadius: 0` everywhere
- **Solid offset shadows** instead of native elevation/blur: a solid Espresso-colored view positioned +4px X/Y behind the component
- **Color palette**: Antique Cream `#FFF8E1` (background), Espresso `#3E2723`/`#5D4037` (borders/text), Sky Blue `#3ABEF9` (primary actions), Institutional Red `#D32F2F` (destructive/alerts)
- **Typography**: Headers at 48px/900-weight/uppercase; sub-headers 14-15px/uppercase/wide letter-spacing
- **Press interaction**: button translates +4px to "close" shadow gap on press (physical snap effect)

## Implementation Workflow

This codebase has been fully audited across 5+ sessions. **Do NOT re-scan code** — all findings are in the deep-dive files at the repo root.

**Read IMPLEMENTATION_GUIDE.md first.** It contains:
- The full trajectory (6 steps, prerequisites through S-tier)
- Module Sequence table (19 modules, each with task IDs and deep-dive file)
- Task-to-Source Cross-Reference (maps every task to its backing evidence file)
- Copy-paste prompts for planning, executing, auditing, and committing
- Sub-agent delegation model (which sub-agent does what)

**Read MASTER_TASKLIST.md** for the task registry (~560 tasks, Phases 1-4, with Status column).

**Read handoff.json** (`session_2026_04_21_supplement`) for the latest session context.

## Key Conventions

- **Firebase config** lives at `firebaseConfig.js` in each sub-project root (mobile and admin) — these contain client-side keys (expected for Firebase)
- **Phone validation** uses PH format: `09xxxxxxxxx` (`/^09\d{9}$/`)
- **QR codes** follow format: `VC-{userId5chars}-{timestamp}-{index}`
- **Appointment status lifecycle**: `pending` → `confirmed` → `arrived` → `in-consult` → `dispensing` → `billing` → `completed` (or `cancelled`)
- **Timezone**: All server-side scheduling uses `Asia/Manila`
- **Admin design tokens** are centralized in `VetConnect-Admin/src/theme/designTokens.js` — exports `COLORS`, `TYPE`, `FONT` constants. All styling should reference these tokens instead of ad-hoc values
- **Tiered pricing**: Services can have weight-based pricing tiers — use `resolveTieredPrice(service, petWeight)` from `VetConnect-Admin/src/utils/resolveTieredPrice.js`
- **Clinical pulse metrics**: `VetConnect-Admin/src/utils/pulseUtils.js` contains the forensic temporal engine (`calculatePulseMetrics`, `getSmartShiftDate`) for queue/consult duration tracking with business-hour and absolute clock modes

