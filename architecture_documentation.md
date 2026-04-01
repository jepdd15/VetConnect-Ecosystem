# VetConnect Ecosystem: Comprehensive Architecture Documentation

This document outlines the high-level architecture, module breakdown, and data flow of the complete **VetConnect Ecosystem**. The ecosystem is composed of three primary repositories/directories operating on a shared centralized Firebase backend. It has been extensively scaled to support enterprise-grade clinical and inventory operations.

---

## 1. System Architecture Overview
The VetConnect Capstone operates on a **Serverless Hub-and-Spoke** architecture.
- **Backend (Hub)**: Firebase (Authentication, Firestore Database, Storage, Cloud Functions). Acts as the single source of truth and enforces medical data integrity.
- **Portal App (Spoke 1)**: A React Native + Expo application serving both Pet Owners (Clients) and Clinic Staff (Vets/Techs) on mobile devices and tablets.
- **Web Admin (Spoke 2)**: A React + Vite web dashboard utilized by receptionists, inventory managers, and veterinarians for intensive clinical and analytical operations on desktop displays.

---

## 2. VetConnect Backend (Cloud Functions)
*Path: `/VetConnect-Backend`*

Because VetConnect relies on Firebase's client SDKs for direct database interaction, the "Backend" directory is extraordinarily lightweight, containing only the server-side Cloud Functions necessary for secure or scheduled tasks.

### Core Files
- `index.js`: The primary entry point for Firebase Cloud Functions.
  - **Connections**: Listens to Firestore triggers (e.g., `onCreate`, `onUpdate`) or HTTP requests to perform administrative tasks that cannot be trusted to the client application (like bulk data aggregation, automated email triggers, or secure staff credential synchronization).

---

## 3. VetConnect Web Admin (Desktop React + Vite)
*Path: `/VetConnect-Admin`*

The enterprise-grade command center for the clinic. Built on a modular, feature-based architecture utilizing Material UI and React Router. It heavily emphasizes high-density layouts, "warm" typography (Inter font), and zero-friction UX.

### Core Configuration
- `src/App.jsx`: The application shell. Implements `MainLayout` (sidebar + content area) and secures all internal routes behind a global `useUser()` context check.
- `src/firebaseConfig.js`: Initializes Firebase and exports the `db` and `auth` instances.
- `src/theme/designTokens.js`: The central nervous system for the UI aesthetic. Defines the professional color palette, typography (`FONT`: Inter), and spacing metrics to ensure total design unification.

### Core Components
- **`src/components/ClinicalWorkspace.jsx`**: The Crown Jewel of the veterinary flow. 
  - **Function**: A highly advanced, scalable S.O.A.P. (Subjective, Objective, Assessment, Plan) documentation interface.
  - **Features**: 
    - *Vertical Narrative Stack*: Fields elastically expand from 4 to 25 rows for heavy clinical typing.
    - *Zen Mode (Focus UI)*: Converts any S.O.A.P. field into a distraction-free, full-screen writing surface.
    - *God-View (Unified Command Center)*: A 4-panel total-immersion dashboard presenting history, exam, diagnostics, and vitals simultaneously without scrolling.
    - *Clinical Intelligence*: Integrates a real-time keystroke matching engine that suggests diagnostic insights based on narrative input, plus color-coded vitals triage logic and rapid "WNL" (Within Normal Limits) auto-fill macros.
- **`src/components/POSModal.jsx`**: Global Point-of-Sale module. Consolidates treatment charges, pharmacy dispensing, and walk-in purchases into a unified checkout terminal.

### Feature Modules (`/src/features`)
The admin app is sliced into tightly cohesive vertical domains. 

#### A. Patients CRM (`/src/features/Patients`)
- **`Patients.jsx` / `PatientDirectory.jsx`**: The main directory. Shows vital alerts (Allergies/Aggression) directly in the list.
- **`PatientDashboard.jsx`**: A heavy-duty split-panel analytical view (Route: `/patients/:id`).
  - *Left Panel*: A dense, chronological S.O.A.P. timeline with intelligent data chunking and search filters.
  - *Right Panel*: A resilient real-time analytics dashboard featuring Weight Trends, Vitals Sparklines, Visit Frequency, and Persistent Owner Contacts.
- **Modals**: Hooks like `usePatientManager.js` feed `EditPetModal.jsx` and `QuickBookModal.jsx`, allowing split-second updates without leaving the CRM environment.

#### B. Inventory Command Center (`/src/features/Inventory`)
- **`Inventory.jsx`**: A master logistics dashboard. 
  - **Features**: Clickable KPI cards filter immediately by "Critically Low", "Out of Stock", or "Expiring Soon".
- **`useInventory.js`**: Contains the **Medical-Grade Audit Engine**. Every creation, deletion, or stock adjustment injects an immutable log into the `inventory_logs` collection, performing a before/after diff to track exact value changes.
- **Components**: 
  - `InventoryTable.jsx`: Renders current stock with row-level colour-coded expiry badges.
  - `GlobalActivityLog.jsx`: A real-time, clinic-wide ledger tracking the "Who/When/Why/Delta" of every item touched in the hospital.
- **Modals**: `ProductFormModal.jsx` correctly silos Batch/Lot Numbers and Expiry Dates independent of core logistics data, preventing compliance failures. 

#### C. Patient Queue (`/src/features/Queue`)
- **`Queue.jsx`**: A real-time Kanban board for clinic flow (Waiting → Triage → Exam → Billing).
- **`queueColumns.jsx`**: Maps the board logic. Integrates seamlessly with `ClinicalWorkspace.jsx` when patients enter the "Exam" phase.

#### D. Staff & HR (`/src/features/Staff`)
- **`Staff.jsx`**: Centralized management.
- **`useStaffManager.js`**: Orchestrates secure role provisioning (Vet vs. Tech vs. Admin) and handles independent Firebase Auth app instances to protect the active user session when onboarding new staff.

---

## 4. VetConnect Portal App (Mobile React Native)
*Path: `/VetConnect`*

This is the dual-purpose mobile interface built with React Native and Expo Router. It employs a **Role-Based Routing** system sending clients to `ClientDashboard` and staff to `StaffDashboard`.

### Core Configuration
- `App.js`: The application root. Handles authentication state initialization and global providers.

### Screens & Features (`/src/screens`)
These views read and construct data for the unified Firestore backend.

#### Client Facing (Pet Owners)
- **`ClientDashboard.js`**: Landing page for owners. Shows upcoming appointments.
- **`MyPetsScreen.js`** / **`PetHistoryScreen.js`**: Read-only extraction of the `pets` and `medical_records` collections. Acts as a "digital pet passport."
- **`BookAppointment.js`**: A specialized form calling `useBookingEngine.js` to cross-reference clinic availability and block overlapping slots. Updates the `appointments` pipeline.

#### Staff Facing (Vets/Techs)
- **`StaffDashboard.js`** / **`StaffAppointments.js`**: Fast-access view for vets to see their daily roster on a tablet/phone.
- **`ManageQueueScreen.js`** / **`QueueScreen.js`**: Allows receptionists to pull walk-in data directly into the system or push patients down the Kanban pipeline without needing a desktop.
- **`ConsultationScreen.js`**: A lightweight data entry point for recording standard form vitals or simple notes while away from the main command center.

---

## 5. Data Connections & Integrity
All modules dynamically read and write to standardized Firestore Collections, heavily protected by specific data architecture pipelines:

1. **`users`**: Distinguishes Clients from Staff via the `role` field.
2. **`pets`**: Bi-directionally linked to `users` via `ownerId`.
3. **`appointments`**: Drives the scheduling engine in the mobile app and acts to prepopulate the Kanban board (`Queue`) upon arrival.
4. **`medical_records`**: Bound to a specific `petId`. Read by the mobile app's `PetHistoryScreen.js` and exhaustively analyzed by the Web Admin's `PatientDashboard.jsx`.
5. **`inventory`**: Bound to local clinic status.
6. **`inventory_logs`**: Bound strictly, writing an immutable chronological record (used by `GlobalActivityLog.jsx`) via heavily restricted `where/orderBy` composite querying.

*By enforcing strict data boundaries between UI components and high-leverage Firebase Hooks, the VetConnect Ecosystem achieves enterprise speed with medical-grade integrity.*
