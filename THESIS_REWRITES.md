# Thesis Rewrites — T1.1, T1.2, T1.7, T1.8

> These are replacement paragraphs for the thesis PDF. Each section identifies
> the EXACT pages and paragraphs to replace, and provides the corrected text
> in the same academic tone and citation style.

---

## T1.1 — Rewrite Scope and Limitation (Pages 11-15)

### What changes and why

The current scope says "web-based application and does not include native mobile
applications" (page 15). This contradicts the actual system which has TWO surfaces:
a web admin dashboard AND a mobile client app (React Native via Expo). The rewrite
must acknowledge the dual-surface architecture while framing the mobile app as a
client-facing companion to the web-based admin platform.

### Page 11, Paragraph 1 — REPLACE the opening paragraph

**CURRENT (page 11):**
> This study focuses on the design and development of VetConnect: an
> Appointment and Record Management System for Starbarks Veterinary Clinic,
> a veterinary clinic located in Santa Barbara, Pangasinan. The system is
> intended to support the clinic's administrative operations, clinical
> documentation, and basic business processes through a unified, web-based
> platform aligned with the clinic's existing workflow.

**REPLACE WITH:**
> This study focuses on the design and development of VetConnect: an
> Appointment and Record Management System for Starbarks Veterinary Clinic,
> a veterinary clinic located in Santa Barbara, Pangasinan. The system is
> intended to support the clinic's administrative operations, clinical
> documentation, and basic business processes through a dual-surface
> architecture: a web-based admin dashboard for clinic staff and
> veterinarians, and a cross-platform mobile application for pet owners.
> Both surfaces share a single cloud-hosted backend and database, enabling
> real-time synchronization between clinic operations and client interactions.
> Studies on small veterinary practices emphasize that operational efficiency
> and workflow alignment are critical in improving service delivery and staff
> workload management (Helm, McCarthy, & Sargison, 2019).

### Page 11-12, Walk-in paragraph — REPLACE

**CURRENT (page 11-12):**
> VetConnect supports both scheduled appointments and walk-in consultations,
> with walk-in clients digitally registered by clinic staff and placed in the
> service queue based on predefined clinic rules.

**REPLACE WITH:**
> VetConnect supports both scheduled appointments and walk-in consultations.
> Pet owners book appointments through the mobile application, while
> walk-in clients are digitally registered by clinic staff through the web
> admin dashboard and placed in the service queue based on predefined clinic
> rules. The mobile application also provides pet owners with real-time
> visibility of their queue position and appointment status, reducing
> uncertainty during clinic visits.

### Page 14-15, Final limitation paragraph — REPLACE

**CURRENT (page 14-15):**
> The development and evaluation of VetConnect are limited to Starbarks
> Veterinary Clinic, and findings are not intended to be generalized to larger
> veterinary hospitals or multi-branch clinic systems. The system is developed
> as a web-based application and does not include native mobile applications,
> automated diagnosis, electronic prescription transmission, external
> laboratory integration, or long-term deployment evaluation.

**REPLACE WITH:**
> The development and evaluation of VetConnect are limited to Starbarks
> Veterinary Clinic, and findings are not intended to be generalized to
> larger veterinary hospitals or multi-branch clinic systems. The system
> consists of a web-based admin dashboard for clinic staff and veterinarians,
> and a cross-platform mobile application built using React Native and Expo
> SDK for pet owners. The mobile application is limited to client-facing
> functions including appointment booking, pet profile management, queue
> status viewing, visit history review, and an FAQ chatbot. Clinical
> operations, medical record management, queue handling, billing, inventory,
> and administrative functions are accessible exclusively through the web
> admin dashboard. The system does not include automated diagnosis,
> electronic prescription transmission, external laboratory integration,
> online payment processing, or long-term deployment evaluation. These
> limitations are consistent with academic system development studies that
> prioritize feasibility, usability, and contextual relevance over
> enterprise-scale deployment (Cachuela et al., 2025).

---

## T1.2 — Rewrite Methodology Stack/Backend (Pages 43-46)

### What changes and why

1. Frontend section (page 43) describes only the mobile app — must add the web
   admin dashboard (React 19, Vite 7, MUI 7)
2. Backend section (page 45) claims Cloud Functions are deployed — they exist in
   source code but are NOT deployed due to Firebase Spark plan constraints
3. Table 3.1 (page 44) lists only mobile tech — must add web admin tech
4. Table 3.2 (page 46) lists Cloud Functions as active — must clarify status
5. Table 3.4 (page 48) lists only mobile — must add web admin

### Page 43, Frontend section — REPLACE entirely

**CURRENT (page 43):**
> Frontend. The frontend of the system is developed as a cross-platform
> mobile application using React Native...

**REPLACE WITH:**
> **Frontend.** The frontend of VetConnect consists of two client applications
> that share a single cloud-hosted backend. The web-based admin dashboard
> is developed using React 19 with Vite as the build tool and Material UI
> (MUI 7) as the component library. This dashboard provides clinic staff,
> veterinarians, and administrators with access to queue management,
> clinical workspace, medical records, patient CRM, inventory, sales,
> expenses, staff management, analytics, and clinic settings. The web
> dashboard follows a feature-module architecture where each functional
> area (Queue, Records, Patients, Services, Inventory, Sales, Staff) is
> organized into its own directory with dedicated components, hooks, and
> modals.
>
> The client-facing mobile application is developed using React Native with
> Expo SDK, enabling a single codebase to run on both Android and iOS
> devices. The mobile app is designed exclusively for pet owners and
> provides appointment booking, pet profile management, visit history
> viewing, real-time queue status monitoring, and an FAQ chatbot for
> non-clinical inquiries. React Native enables the creation of mobile
> interfaces using JavaScript and reusable components, resulting in
> consistent appearance and behavior across different platforms (Facebook
> Open Source, 2024). The Expo SDK simplifies development and provides
> built-in support for mobile features such as QR code generation,
> notifications, and device compatibility (Expo Documentation, 2024).
>
> Both frontend applications communicate directly with Firebase services
> to display updated information. Changes to appointments, records, and
> operational status are reflected in real time through Firestore's
> onSnapshot listeners, allowing users to access current and accurate data
> during clinic operations. The web admin dashboard uses a design system
> based on Modern Clinical Neubrutalism, characterized by zero
> border-radius on containers, solid offset shadows, and a defined color
> palette, while the mobile application uses its own soft, rounded
> aesthetic optimized for touch interaction on smaller screens.

### Page 44, Table 3.1 — REPLACE

**REPLACE Table 3.1 with:**

| Programming Language / Framework | Definition |
|---|---|
| JavaScript | JavaScript is used to create interactive and dynamic behavior within both the web and mobile applications and serves as the main programming language for React and React Native development (Flanagan, 2020). |
| React 19 | React is a JavaScript library for building user interfaces using a component-based architecture. It is used for the web admin dashboard (Meta Open Source, 2024). |
| React Native | React Native is a mobile development framework that allows a single application to run on both Android and iOS devices using shared code (Brito et al., 2022). |
| Vite 7 | Vite is a build tool that provides fast development server startup and optimized production builds for web applications (Evan You, 2024). |
| Material UI (MUI 7) | MUI is a React component library implementing Material Design, used for the admin dashboard's UI components including DataGrid, Tabs, Dialogs, and form elements (MUI Documentation, 2024). |
| Expo SDK 54 | Expo provides tools and libraries that simplify mobile app development and enable access to device features such as notifications, QR code scanning, and vibration (Expo Documentation, 2024). |
| JSX | JSX is a syntax extension that allows user interface components to be written in a clear and readable format within JavaScript code (Facebook Open Source, 2024). |
| recharts 3.8 | recharts is a composable charting library built on React components, used for data visualization in the admin dashboard's analytics module (recharts Documentation, 2024). |

### Page 45, Backend section — REPLACE the Cloud Functions paragraph

**CURRENT (page 45):**
> System workflows and automated processes are managed through Firebase
> services and cloud functions. These services support features such as
> appointment validation and notification delivery.

**REPLACE WITH:**
> System workflows are primarily managed through client-side logic and
> Firestore security rules. Five Cloud Functions are defined in the source
> code (midnightQueueSweep, secureBookAppointment,
> sendAppointmentUpdateNotification, reservationCleanup, and
> mergeGuestAccount) to support server-side validation, automated
> notifications, and scheduled maintenance. However, these functions
> require Firebase's Blaze (pay-as-you-go) billing plan for deployment.
> During the development and evaluation phases of this study, the project
> operates under the Firebase Spark (free) plan, which does not support
> Cloud Function deployment. As a result, all functionality that would
> otherwise be handled by Cloud Functions is implemented through
> equivalent client-side mitigations: appointment validation is performed
> through Firestore security rules, queue resets are handled at the
> application level, and notification delivery is managed through
> foreground Firestore listeners with local notification display. The
> Cloud Functions remain in the codebase as documented aspirational
> features with a defined activation path upon Blaze plan upgrade. This
> approach is consistent with findings that small clinics often adopt
> incremental digitization strategies based on available resources
> (Elepaño et al., 2025).

### Page 46, Table 3.2 — REPLACE

**REPLACE Table 3.2 with:**

| Technology | Definition | Deployment Status |
|---|---|---|
| Firebase Authentication | Provides secure login and role-based access control for system users using email/password authentication (Madaminov & Allaberganova, 2023). | Deployed and active |
| Cloud Firestore | A cloud-based NoSQL document database that stores and synchronizes system data in real time across devices. Includes security rules for role-based access control and data validation (Firebase Documentation, 2024). | Deployed and active |
| Firestore Security Rules | Server-side rules that enforce authentication requirements, field validation, role-based access (isStaff, isAdmin helpers), and data integrity constraints such as append-only audit trails and mandatory audit reasons for status transitions. | Deployed and active |
| Firebase Cloud Functions | Executes backend logic such as automated notifications, server-side booking validation, and scheduled queue maintenance. Requires Blaze billing plan (Firebase Documentation, 2024). | Source code only (Spark plan — not deployed) |
| Firebase Hosting | Serves the web admin dashboard as a static site with SSL and CDN distribution (Firebase Documentation, 2024). | Deployed and active |

### Page 48, Table 3.4 — REPLACE

**REPLACE Table 3.4 with:**

| Component | Minimum Requirements |
|---|---|
| Mobile Operating System | Android 10 or later, iOS 13 or later |
| Web Browser (Admin) | Google Chrome, Mozilla Firefox, or Microsoft Edge (latest version) |
| Mobile Framework | React Native 0.81 with Expo SDK 54 |
| Web Framework | React 19 with Vite 7 and Material UI 7 |
| Database | Firebase Cloud Firestore |
| Backend Services | Firebase Authentication, Firestore Security Rules, Firebase Hosting |
| Backend Services (Aspirational) | Firebase Cloud Functions (requires Blaze plan upgrade) |

---

## T1.7 — Add Glossary Entries to Chapter I Definition of Terms (Page 17-19)

### Add these entries in alphabetical order within the existing Definition of Terms section:

> **Appointment.** The client-facing term used in the mobile application to
> refer to a scheduled or walk-in visit. The admin dashboard uses the term
> "visit" for the same concept. This audience-specific naming is intentional.

> **Case.** The complete clinical encounter a patient experiences, consisting
> of one or more visits linked through backward pointers (originApptId).
> A same-day case consists of one visit. A multi-day case (hospitalization)
> consists of multiple visits, one per day of active care, linked via the
> originApptId field.

> **Medical Record.** A signed SOAP (Subjective, Objective, Assessment, Plan)
> document stored in the medical_records Firestore collection. Created when
> a clinician signs off on their clinical notes during a visit. Each visit
> may produce zero, one, or more medical records depending on the number of
> discrete consultations that occur.

> **Visit.** One entry in the queue management dashboard, represented by a
> single appointments document in Firestore. Each day of clinical activity
> for a patient produces one visit. The admin dashboard uses "visit"
> terminology while the mobile client app uses "appointment."

---

## T1.8 — Audit Thesis Prose for Overloaded "Record"

### Replacement guide

The word "record" is used ambiguously throughout Chapters 1-3. Apply these
substitutions where the context is clear:

| Current usage | Context | Replace with |
|---|---|---|
| "medical records" (when referring to the Firestore collection) | Technical/data context | "medical records" (keep — matches collection name) |
| "records" (when referring to a patient's visit history) | Clinical workflow context | "visit records" or "visit history" |
| "patient records" (when referring to administrative data) | Administrative context | "patient profiles" or "pet profiles" |
| "record" (when referring to a single consultation note) | Clinical documentation context | "medical record" or "SOAP record" |
| "records" (when referring to general data storage) | System/database context | "data" or "documents" |

### Specific replacements in the thesis:

**Page 2, paragraph 2:** "Medical record management" → Keep as-is (correct usage)

**Page 5, paragraph 2:** "manual and fragmented record systems" → "manual and fragmented documentation systems"

**Page 6, Statement of Objectives #1:** "the existing appointment and record management process" → Keep as-is (title matches system name)

**Page 11, paragraph 3:** "centralized veterinary medical records for managing pet profiles, visit history, vaccinations, treatments, and services rendered" → Keep as-is (correct — describes the medical_records collection content)

**Page 12, paragraph 1:** "Records are presented through a timeline-based view" → "Visit records are presented through a timeline-based view"

**Page 12, paragraph 3:** "printable outputs for selected records such as transaction receipts, visit summaries, vaccination records" → Keep as-is (correct usage — these are distinct record types)

**Page 14, paragraph 1:** "role-based access control, secure authentication, and audit trail logging to record user activities" → "...audit trail logging to document user activities" (avoid "record" as verb when discussing records as nouns)

**Page 14, paragraph 2:** "Access to veterinary records through the client portal is restricted to approved and non-sensitive information only, while internal clinical notes and veterinarian-only records remain inaccessible" → "Access to visit history through the mobile application is restricted to approved and non-sensitive information only, while internal clinical notes (SOAP subjective and objective fields) and veterinarian-only documentation remain inaccessible"

---

## Summary

| Task | Pages Affected | What Changes | Effort |
|---|---|---|---|
| T1.1 | 11, 12, 14-15 | 3 paragraph replacements — acknowledge dual-surface (web + mobile) | 1-2 hrs to integrate into formatted doc |
| T1.2 | 43-48 | Frontend section rewrite, 3 table replacements, Cloud Functions paragraph rewrite | 2-3 hrs to integrate into formatted doc |
| T1.7 | 17-19 | 4 new glossary entries (appointment, case, medical record, visit) | 30 min |
| T1.8 | Throughout Ch 1-3 | ~6 specific word substitutions | 30 min |
