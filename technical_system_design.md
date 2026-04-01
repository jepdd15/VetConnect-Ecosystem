# VetConnect: Technical System Design & Core Engines

This document provides a deep-dive into the technical architecture, data flow patterns, and the proprietary algorithms ("Engines") that power the **VetConnect Ecosystem**. 

---

## 1. High-Level Communication Architecture

VetConnect utilizes a **Serverless Real-Time** architecture. Unlike traditional REST-based systems, VetConnect minimizes HTTP request/response cycles by leveraging **Firebase Persistent Connections**.

### Data Flow Overview
1.  **Subscription Pattern**: Both the Mobile (`VetConnect`) and Web (`VetConnect-Admin`) applications use Firestore `onSnapshot` listeners. When a Vet in the Web Admin updates a patient's status to "In-Consult", the Mobile App's Queue screen updates instantly without a page refresh.
2.  **Thick-Client Logic**: Most heavy computation (scheduling, audit diffing, clinical intelligence) is executed on the client-side to ensure zero-latency feedback and reduce Cloud Function execution costs.
3.  **Privileged Execution**: Operations requiring elevated security (Staff account creation, bulk data scrubbing) are routed to `VetConnect-Backend` (Firebase Cloud Functions) to prevent exposing administrative credentials on the client.

---

## 2. Core Technical Engines

### A. The "Enterprise Tetris" Booking Engine
*Location: `VetConnect/src/hooks/useBookingEngine.js`*

The booking engine is a multi-dimensional constraint-satisfaction algorithm designed to solve the "Multi-Pet, Multi-Service" scheduling problem.

-   **Department Capacity Mapping**: The engine fetches the entire staff list and dynamically constructs a `departmentCapacity` object. It maps staff skills (e.g., Surgery, Grooming, Consultation) to concurrent slot limits.
-   **Bundle Fitting**: When a user selects multiple services for multiple pets, the engine treats this as a "Time Bundle". It iterates through the day in `minSlotInterval` (30m) increments.
-   **Collision Detection**: For every possible slot, it performs three checks:
    1.  **Boundary Check**: Does the entire multi-pet bundle fit before closing time?
    2.  **Lunch Lock**: Does any part of the bundle overlap with the clinic's `lunchStart/End`?
    3.  **Skill-Based Capacity**: For every service in the bundle, does the clinic have an available staff member in that specific department for that specific timeframe?

### B. The Immutable Audit Ledger (Inventory)
*Location: `VetConnect-Admin/src/features/Inventory/hooks/useInventory.js`*

VetConnect implements a medical-grade inventory trail that tracks not just *that* a change happened, but *exactly what* changed.

-   **The Diff Engine**: When an item is updated, the `updateItem` function receives the "Before" snapshot (`originalItem`) and the "After" data (`cleanData`).
-   **Field Mapping**: It iterates through a high-fidelity map (`FIELD_LABELS`) and performs a character-level comparison. 
-   **Immutable Writes**: The results are piped into the `inventory_logs` collection. Every entry is stamped with a `serverTimestamp()` and the `userId` of the logged-in staff member, creating an indisputable forensic trail of stock movements.

### C. The Clinical Intelligence Logic
*Location: `VetConnect-Admin/src/components/ClinicalWorkspace.jsx`*

The S.O.A.P. workspace uses an **Active Observer Pattern** to assist clinicians.

-   **Keyword Matching Engine**: A `useEffect` monitors the `soapData.subjective` and `soapData.assessment` strings. It tokenizes the input and cross-references it against a `KNOWLEDGE_BASE` array.
-   **Visual Triage Pipe**: A functional transformer takes raw vital inputs (Temp, HR, RR) and maps them to "Safety Levels" (Critical, Warning, Normal). This results in real-time UI state changes (e.g., vital numbers turning red) based on medical thresholds.

---

## 3. Distributed State Management

VetConnect intentionally avoids complex global state libraries (like Redux) in favor of **Context-API + Firebase Sync**.

-   **UserContext**: Manages the `Profile` state across the entire session. It handles the "Role-Based Gating" logic.
-   **Real-time Hydration**: 
    -   `VetConnect-Admin` features (Inventory, Patients, Queue) maintain their own local `onSnapshot` listeners within designated hooks (`useInventory`, `usePatientManager`). 
    -   This ensures that if two receptionists are looking at the same inventory item, and one changes the price, the other's screen reflects the change in <100ms.

---

## 4. Cross-App Integration (The Monorepo Logic)

Although separated into three directories, the apps share a **Unified Data Schema**:

| Collection | Spoke 1 (Mobile) | Spoke 2 (Web Admin) | Trigger (Backend) |
| :--- | :--- | :--- | :--- |
| `appointments` | Writes (Booking) | Reads/Updates (Queue) | N/A |
| `inventory` | Reads (Price check) | Full CRUD | N/A |
| `users` | Auth/Profile | Role Mgmt/HR | `onCreate` Sync |
| `medical_records` | Read (History) | Write (S.O.A.P.) | N/A |

---

## 5. Security & Infrastructure

### Authentication Flow
1.  **Handshake**: Client initiates Auth via `firebase/auth`.
2.  **Claim Retrieval**: Post-login, the app fetches the corresponding document in the `users` collection.
3.  **Role Gating**: `App.jsx` (Web) or `App.js` (Mobile) renders the appropriate navigation stack based on the `role` field.

### Performance Optimizations
-   **Composite Indexing**: High-leverage queries (like "Global Activity Logs") use manual Firestore composite indexes to prevent "Linear Scan" performance degradation as the database grows.
-   **Pagination & Capping**: Large collections (Medical Records/Logs) are capped at `300` results or paginated to maintain 60fps UI performance on mobile devices.
