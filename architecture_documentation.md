# VetConnect Ecosystem: Comprehensive Architecture Documentation

This document outlines the high-level architecture, module breakdown, and data flow of the complete **VetConnect Ecosystem**. The ecosystem is composed of three primary repositories/directories operating on a shared centralized Firebase backend. 

---

## 1. System Architecture Overview
The VetConnect Capstone operates on a **Serverless Hub-and-Spoke** architecture.
- **Backend (Hub)**: Firebase (Authentication, Firestore Database, Storage, Cloud Functions). Acts as the single source of truth.
- **Portal App (Spoke 1)**: A React Native + Expo application serving both Pet Owners (Clients) and Clinic Staff (Vets/Techs) on mobile devices.
- **Web Admin (Spoke 2)**: A React + Vite web dashboard utilized by receptionists, inventory managers, and administrators on desktop displays.

---

## 2. VetConnect Backend (Cloud Functions)
*Path: `/VetConnect-Backend`*

Because VetConnect relies on Firebase's client SDKs for direct database interaction, the "Backend" directory is extraordinarily lightweight, containing only the server-side Cloud Functions necessary for secure or scheduled tasks.

### Core Files
- `index.js`: The primary entry point for Firebase Cloud Functions.
  - **Connections**: Listens to Firestore triggers (e.g., `onCreate`, `onUpdate`) or HTTP requests to perform administrative tasks that cannot be trusted to the client application (like bulk data aggregation, automated email triggers, or daily role-syncing).

---

## 3. VetConnect Portal App (Mobile React Native)
*Path: `/VetConnect`*

This is the mobile-first interface built with React Native and Expo. It employs a **Role-Based Routing** system sending clients to `ClientDashboard` and staff to `StaffDashboard`.

### Core Configuration
- `App.js`: The application root. Handles authentication state initialization, Expo Router configuration, and global context providers.
- `firebaseConfig.js`: Initializes the Firebase app and auth state.

### Screens & Features (`/src/screens`)
These files represent the main views rendered to the user.

- **Authentication & Setup**
  - `LoginScreen.js` & `RegisterScreen.js`: Handle Firebase Authentication. Routes users based on their custom claims/role post-login.
  - `UserProfileScreen.js`: Allows users to update their personal details.

- **Client Facing (Pet Owners)**
  - `ClientDashboard.js`: The landing page for pet owners. Shows upcoming appointments and quick links.
  - `MyPetsScreen.js`: Displays a list of the owner's registered pets.
  - `AddPetScreen.js` & `EditPetScreen.js`: Forms to register and update biosignalment data. Writes to the `pets` collection.
  - `BookAppointment.js`: A specialized form for clients to request visits. Calls `useBookingEngine.js` to find available slots and writes to the `appointments` collection.
  - `PetHistoryScreen.js`: A read-only timeline of the pet's past `medical_records`.

- **Staff Facing (Vets/Techs)**
  - `StaffDashboard.js`: The landing page for vets to see their schedule for the day.
  - `ManageQueueScreen.js` & `QueueScreen.js`: Mobile views of the Patient Queue. Allows staff to pull patients from the lobby from their tablets.
  - `StaffAppointments.js`: A calendar view of the vet's upcoming scheduled appointments.
  - `ConsultationScreen.js`: A mobile interface for entering SOAP notes and recording vitals during an examination.

- **Utilities & Logic**
  - `src/hooks/useBookingEngine.js`: Complex logic matching vet availability schedules against requested appointment times to prevent double-booking.
  - `src/utils/helpers.js`: Date formatters, timestamp converters, and role verifiers.

---

## 4. VetConnect Web Admin (Desktop React + Vite)
*Path: `/VetConnect-Admin`*

The enterprise-grade command center for the clinic. Built on a modular, feature-based architecture utilizing Material UI and React Router.

### Core Configuration
- `src/App.jsx`: The application shell. Implements `MainLayout` (sidebar + content area) and secures all internal routes (`/patients`, `/inventory`, etc.) behind checking `useUser()` context.
- `src/firebaseConfig.js`: Initializes Firebase and exports the `db` and `auth` instances used heavily by feature hooks.
- `src/theme/designTokens.js`: The central nervous system for the UI aesthetic. Defines the "Warm Espresso" palette (`COLORS.accent`, `COLORS.surface`), typography (`FONT`), and glass/shadow effects to ensure 100% visual unification across all modules.

### Feature Modules (`/src/features`)
The admin app is sliced into vertical domains. Each folder contains its own `Index` view component, `components/` for UI, `hooks/` for Firebase logic, and `modals/` for forms/actions.

#### A. Patients CRM (`/src/features/Patients`)
- **`Patients.jsx`**: The main split-panel container. Connects the Directory (left) and the Tabbed Content panels (right).
- **Hooks**: `hooks/usePatientManager.js` handles deep-fetching of clients, their pets, transaction history, and handles updates.
- **Components**: 
  - `PetList.jsx`: Renders cards for owned pets with "+ Add" interaction links.
  - `InternalLogs.jsx`: A secure workspace for staff to leave administrative notes.
  - `PatientDashboard.jsx`: The heavy-duty clinical timeline and real-time analytics dashboard for a specific pet. (Accessed via `/patients/:id`).
- **Modals**: `EditPetModal.jsx` & `NewClientModal.jsx` allow walk-in operations and data updates without breaking workflow context.

#### B. Patient Queue (`/src/features/Queue`)
- **`Queue.jsx`**: A real-time Kanban board for clinic flow (Waiting, Triage, Exam, Billing).
- **Hooks**: `hooks/useQueueActions.js` manages moving patients between columns, recording wait times, and pushing historical data upon "End of Day" execution.
- **Modals**: `WalkInModal.jsx` injects unregistered walk-in patients directly into the queue.

#### C. Inventory Management (`/src/features/Inventory`)
- **`Inventory.jsx`**: The master supply tracking screen.
- **Hooks**: `hooks/useInventory.js` executes batch operations, low-stock threshold monitoring, and lifecycle tracking.
- **Components**: `InventoryTable.jsx` utilizes MUI DataGrid for high-density rendering. `GlobalActivityLog.jsx` provides an indisputable audit trail of all manual stock adjustments.
- **Modals**: `StockAdjustModal.jsx` forces staff to input reasons and quantities for adds/deductions.

#### D. Staff & HR (`/src/features/Staff`)
- **`Staff.jsx`**: The centralized management for employee accounts.
- **Hooks**: `hooks/useStaffManager.js` generates default passwords, syncs credentials to Firestore `users`, and manages role assignments (Admin vs. Vet).
- **Modals**: `ConfirmRevokeModal.jsx` handles irreversible account suspension workflows.

#### E. Sales & Services (`/src/features/Sales`, `/src/features/Services`)
- **`Sales.jsx`**: A financial dashboard providing End of Day (`EodSummary.jsx`) rollups, linking directly back to Patient Billing Ledgers.
- **`Services.jsx`**: Manages the price book and duration metadata utilized by the `useBookingEngine.js` in the mobile app.

## Data Connections & Integrity
All modules read and write to standard Firestore Collections:
1. `users`: Holds both clients and staff. Differentiated by the `role` field.
2. `pets`: Linked tightly to `users` via `ownerId`. 
3. `medical_records`: Linked to a specific `petId` and displayed via `PatientDashboard.jsx` in the Admin app, and `PetHistoryScreen.js` in the Mobile app.
4. `inventory`: Checked and updated dynamically.

*By separating purely cosmetic UI code into `components/` and heavy Firebase Firestore queries into `hooks/`, the VetConnect ecosystem remains modular, testable, and strictly unified.*
