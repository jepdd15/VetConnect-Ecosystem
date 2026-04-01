# VetConnect Thesis Notes

## Project Overview
- **Title:** VetConnect: Appointment and Record Management System for Starbarks Veterinary Clinic
- **Target Clinic:** Starbarks Veterinary Clinic (Santa Barbara, Pangasinan)
- **Services:** Consultations, vaccinations, grooming, minor procedures, and pet supplies.
- **Goal:** To modernize veterinary clinic operations through efficient scheduling and accurate digital medical record management.

## Batch 1: Chapter I - Introduction (Pages 1-5)

### Problem Statement & Background
- **Inefficiencies:** Small clinics often rely on manual, handwritten logs or fragmented digital tools (e.g., informal messaging), leading to high administrative workload and data retrieval errors.
- **Current State of Starbarks:** Uses a mix of paper-based processes and basic digital tools. This results in scheduling conflicts, limited visibility of inventory, and difficulty in interpreting long-term clinical data.
- **Decision Support:** The paper highlights the potential for AI to act as a supportive decision-support tool (not a replacement for professional judgment) to assist in symptom suggestion and condition identification.

### Key Proposed Features (Mentioned in Background)
- **QR Code Identification:** Proposed as a way to streamline check-in and reduce identification errors.
- **Rule-Based Scheduling:** Implementation of structured queue coordination and service priorities (first-come-first-served).
- **Assistive Analytics:** Using data from appointments, billing, and inventory to support administrative decision-making.

### Regulatory & Global Context
- **Compliance:** The system aims to comply with:
  - **RA 8485 / RA 10631:** Animal Welfare Act.
  - **RA 10173:** Data Privacy Act of 2012 (ensuring secure handling of sensitive information).
- **Alignment with UN SDGs:**
  - **SDG 3:** Good Health and Well-Being (One Health approach).
  - **SDG 9:** Industry, Innovation, and Infrastructure (adoption of digital systems).
  - **SDG 12:** Responsible Consumption and Production (reduced resource waste in inventory).

## Batch 2: Objectives & Methodology (Pages 6-10)

### Statement of Objectives
1. **Identify** the existing appointment and record management processes.
2. **Describe** the features of the VetConnect system.
3. **Evaluate** the usability of the system.

### Conceptual Framework: IPO Model
- **Input:** Data gathered from interviews with veterinarians/staff, direct observation of clinic operations (medical and grooming), and feedback from pet owners.
- **Process:** Adoption of **Feature-Driven Development (FDD)**, an agile methodology.
  - Transmutes stakeholder needs into prioritized features.
  - Emphasizes incremental development and user-centered design.
- **Output:** The conceptual design and functional implementation of the VetConnect System.
- **Feedback Loop:** Continuous refinement based on stakeholder evaluation of the output.

### The FDD Lifecycle (Figure 1.1)
1. **Develop Overall Model:** Analysis of requirements and high-level system architecture.
2. **Build Features List:** Identifying specific system features based on user needs.
3. **Plan by Feature:** Scheduling, responsibility assignment, and time estimation.
4. **Design by Feature:** Database schema design, UI/UX wireframing, and logic definition.
5. **Build by Feature:** Incremental implementation, testing, bug fixing, and user validation.

## Batch 3: Scope, Features & Limitations (Pages 11-15)

### System Scope & Core Features
- **Appointment Management:** Supports both online booking (client-led) and in-clinic registration for walk-ins (staff-led). Includes automated reminders and QR code-based verification for check-ins.
- **Medical Records:** Centralized digital records featuring a **timeline-based view** of visit history, vaccinations, treatments, and prescriptions.
- **Queue Coordination:** Uses rule-based logic to manage service flows and reduce waiting times.
- **POS & Inventory:** Basic billing for services and products, automated stock deduction upon sale, and low-stock alerts.
- **FAQ Chatbot:** Provides non-clinical support to guide users through booking and navigation.
- **Printable Outputs:** Generation of receipts, visit summaries, vaccination records, and referral reports.

### Clinical & Technical Specifications
- **Assistive Clinical Support:** A tool for veterinarians to encode observed symptoms and view reference-based condition indicators and suggested tests. (Note: Strictly for support, not a replacement for professional judgment).
- **Security & RBAC:** Features secure authentication, Role-Based Access Control (RBAC), and audit trail logging for all data modifications.
- **Data Privacy:** Compliant with RA 10173; sensitive clinical notes and internal vet records are restricted from the client portal.

### Limitations of the Study
- **Environment:** Specifically designed for Starbarks Veterinary Clinic; not generalized for multi-branch or enterprise-scale hospitals.
- **Technical Exclusions:** 
  - No native mobile applications (web-based only).
  - No electronic prescription transmission or external lab integrations.
  - No automated/AI-generated diagnosis or treatment prescription.
  - Excludes full financial/accounting automation (limited to basic POS).

### Significance of the Study
- **Primary Beneficiary:** Starbarks Veterinary Clinic (improved operational flow and coordination).
- **Broader Impact:** Demonstrates how structured digital transformation reduces administrative burden in small-scale healthcare settings.

## Batch 4: Stakeholder Benefits & Definitions (Pages 16-20)

### Stakeholder Benefits
- **Veterinarians:** Improved access to organized records via timeline-based views, supporting continuity of care. The system remains strictly assistive; clinical responsibility stays with the vet.
- **Clinic Staff:** Reduced administrative workload through digital intake, automated queue updates, and centralized inventory monitoring.
- **Pet Owners:** Predictable experience with timely reminders and visibility of service progress. Access to approved pet health summaries via the Patient Portal.
- **Developers:** Opportunity to apply FDD and user-centered design in a real-world clinical setting.

### Key Definitions (Formalized Terms)
- **EVMR (Electronic Veterinary Medical Record):** Digital storage for pet profiles, vaccination history, consultation notes, treatments, and prescriptions.
- **Pet Health Timeline:** A chronological visual representation of a pet's medical and service history.
- **Digital Intake:** The electronic collection of client/patient info to improve workflow and accuracy.
- **QR Code Booking ID:** Used solely for appointment verification and queue confirmation (contains no medical data).
- **FAQ Chatbot:** Limited to informational/non-clinical support to assist with navigation and booking.
- **Queue Management:** Monitors the order of patients based on predefined clinic rules to reduce congestion.

### Literature Review: Existing Processes (Page 20)
- **Problem:** Many clinics in developing regions still rely on manual or partially digitized systems, leading to fragmented workflows.
- **Infrastructure Constraints:** Studies (Elepaño et al., 2025) note that even with EHR implementation, many facilities remain "transitional," continuing to use paper records alongside digital systems due to limited staff training and resource constraints.

## Batch 5: Literature Review - Benefits & Data (Pages 21-25)

### Local Context (Philippines)
- **Parallel Documentation:** 70% of local healthcare workers maintain parallel paper/electronic records due to familiarity and internet connectivity issues (De Mesa et al., 2025).
- **Digital Success Stories:** Implementation of systems like E-Konsulta resulted in a 40% improvement in record completeness and a 25% reduction in missed follow-ups (Santos et al., 2022).

### Scheduling & No-Show Research
- **Inefficiency of Static Slots:** Traditional fixed-time-slot scheduling is ineffective at managing demand variability, often increasing wait times by 20-35% during peak hours (Ala & Chen, 2022).
- **The "No-Show" Impact:** Traditional systems typically lack predictive features to prevent no-shows, which range from 15-30% in most studies (Salazar et al., 2022).
- **Automated Reminders:** Proven to reduce no-show rates by **20% to 40%**, significantly lowering the need for manual staff follow-up (Wang et al., 2023).

### Online Booking & Optimization
- **Efficiency Gains:** Transitioning to web-based scheduling reduces no-show rates by 18-32% and wait times by up to 33% (Zhao et al., 2017).
- **Resource Utilization:** Static/rule-based systems often lead to >25% resource underutilization as they cannot accommodate cancellations or emergencies. Adaptive scheduling models are shown to be significantly more efficient.
- **Workflow Synergy:** Online booking reduces administrative booking time by up to 40%, allowing staff to focus on clinical tasks (Hogan et al., 2022).

### Justification for VetConnect
- These findings support the inclusion of **Online Booking**, **Automated Reminders**, and **Integrated Records** in VetConnect to specifically address the 20-30% inefficiency gap noted in traditional veterinary/medical workflows.

## Batch 6: Efficiency Metrics & Usability Framework (Pages 26-30)

### Operational Efficiency Metrics
- **Record Retrieval:** Transitioning from paper to digital records improves retrieval time by up to **50%** (Silva et al., 2019).
- **Queue Management:** Digital tracking and clearly defined structures improve flow efficiency by up to **25%** (ScienceDirect, 2024).
- **Inventory & POS:** Integrated systems reduce stock discrepancies by **15-25%** and improve transaction visibility by ~30% (Baysari et al., 2018).
- **Administrative Relief:** FAQ Chatbots reduce routine inquiries by up to **30%**, allowing staff to focus on clinical service delivery (BMC Health Services Research, 2024).

### Assistive Clinical Support
- **Diagnostic Preparation:** Reference-based systems improve test selection accuracy, especially for junior clinicians. VetConnect’s version is strictly **non-deterministic** (supportive, not diagnostic).

### Usability Framework (ISO 9241-11:2018)
- **Primary Attributes:** Defined as Effectiveness, Efficiency, and Satisfaction.
- **The "Workaround" Phenomenon:** Research shows **>60%** of cases where users revert to manual/external tools are directly caused by poor system usability and interface complexity.
- **Design Impact:**
  - **Interface Simplification:** Can reduce task completion time by **25%**.
  - **Poor Navigation:** Can increase completion time by **45%** and lead to higher clinical error rates.
  - **Early Testing Advantage:** Systems subjected to early-stage usability testing Achieve **40% higher satisfaction** scores than those evaluated only after deployment (Zhang et al., 2020).

## Batch 7: Clinician Experience & Methodology (Pages 31-35)

### Clinician Satisfaction & System Sustainability
- **Documentation Time:** Redesigning interfaces to align with clinician workflows can reduce documentation time by up to **28%** (Drews et al., 2025).
- **User Satisfaction:** Using standardized usability scales and task-based testing can lead to a **>35%** increase in user satisfaction/acceptance.
- **Philippine Context:** Targeted usability training and simplified UI designs improve perceived ease of use by over **30%** among local healthcare workers (Elepaño et al., 2025).

### Chapter III: Methodology - Research Design
- **Type:** **Descriptive-Developmental Research Design**.
- **The Descriptive Phase:** Focuses on capturing authentic operational conditions at Starbarks Veterinary Clinic through:
  - Direct observation of clinic operations.
  - Interviews with clinic staff.
  - Review of existing appointment and record documentation practices.
- **The Developmental Phase:** Uses findings from the Descriptive Phase as direct inputs for the system design, ensuring that VetConnect addresses real-world workflow gaps rather than theoretical assumptions.

### System Development Life Cycle (SDLC)
- **Framework:** Methodical application of Analysis, Design, Development, and Evaluation.
- **Agile Approach:** Formal adoption of **Feature-Driven Development (FDD)**.
  - **Stage 1 - Develop an Overall Model:** Creating a high-level representation of the system to define the problem domain and component relationships. This serves as the conceptual foundation for all subsequent feature development.
- **Stage 2 - Build a Features List:** Decomposing the complex system into manageable, modular units that represent client-valued capabilities.
- **Stage 3 - Plan by Feature:** Sequencing features based on dependencies. Foundational components (Appointments/Records) are planned first to ensure system stability.
- **Stage 4 - Design by Feature:** Detailed design of workflows, data structures, and UI elements for each feature before coding begins.
- **Stage 5 - Build by Feature:** Incremental coding, testing, and integration. This allows for early issue detection.

## Batch 8: Data Sources & Architecture (Pages 36-40)

### Sources of Data & Triangulation
- **Primary Data Sources:** Obtained directly from Starbarks Veterinary Clinic.
  - **Key Focal Person:** **Dr. Mary Nicole Capua**.
  - **Stakeholders:** Administrator, veterinarians, receptionists, and groomers.
  - **Methods:** Direct observation of natural work routines, semi-structured interviews, and short client surveys.
- **Secondary Data Sources:** Review of physical and digital logs (appointment logbooks, grooming schedules, service transaction notes, and message-based records).
- **Research Validity:** Integrated primary and secondary data support **Data Triangulation**, ensuring the system reflects the "operational realities" of the clinic.

### System Architecture
- **Structure:** Structural relationship between users (Owners, Vets, Staff), the web-based app, and the database.
- **Information Flow:** Browser-based interface → Centralized Application Environment → Secure Database for storage and retrieval.
- **Security Priority:** Implementation of **Role-Based Access Control (RBAC)** and structured data layers, which are critical for clinical and administrative record protection (Yusof & Mohamed, 2020).

## Batch 9: Technology Stack & Technical Design (Pages 41-45)

### System Architecture (Updated)
- **User Groups:** Administrator, Veterinarian, Clinic Staff, and Pet Owner.
- **Presentation Layer:** Browser-based interface ensuring wide device compatibility.
- **Data Flow:** Bidirectional communication between the application layer and the database allows real-time updates across all user interfaces.

### Frontend Development (Table 3.1)
- **Framework:** **React Native** (Cross-platform for Android and iOS).
- **Tooling:** **Expo SDK** (Simplifies development; provides built-in QR code generation and notification support).
- **Language:** **JavaScript** and **JSX** for interactive, readable interface components.
- **UI Design:** Touch-optimized for mobile screen sizes with clear visual feedback to guide task completion.

### Backend Infrastructure
- **BaaS Provider:** **Firebase** (Cloud-hosted).
- **Core Features:** Built-in authentication, database management, and **Real-Time Data Synchronization**.
- **Automated Processing:** Uses **Firebase Cloud Functions** for background tasks like appointment validation and reminder delivery.
- **Security Rules:** Server-side rules restrict data access based on user roles and permissions, protecting sensitive clinical and client information.

## Batch 10: Requirements & Data Collection (Pages 46-50)

### Hardware Requirements (Table 3.3)
- **Minimum Specs:**
  - **Processor:** Quad-core mobile processor.
  - **RAM:** 4 GB.
  - **Storage:** 200 MB available space.
  - **Display:** Smartphone or tablet (720p minimum resolution).
- **Advantage:** Cloud-hosted architecture reduces local hardware costs and allows deployment on standard personal mobile devices.

### Software Requirements (Table 3.4)
- **Operating System:** Android 10 or later; iOS 13 or later.
- **Frameworks:** React Native with Expo SDK.
- **Development Tools:** Visual Studio Code (Coding), Expo CLI (Testing/Deployment), Firebase CLI (Backend management).

### Instrumentation and Data Collection
- **Methodology Rigor:** Use of multiple instruments (Interviews, Observation, Surveys, Usability Testing) to capture both operational processes and user perspectives.
- **Evaluation Framework:** Survey questionnaires based on the **ISO/IEC 25010** software quality model, focusing on:
  - Usability, Efficiency, Reliability, Learnability, and Overall Satisfaction.
- **Task-Based Usability Testing:** Participants complete predefined activities (e.g., managing appointments, retrieving records) to identify specific usability issues in "real-world" task performance.
- **Analysis:** Employs both statistical and non-statistical tools to interpret qualitative and quantitative findings.

## Batch 11: Architectural Diagrams & Evaluation Metrics (Pages 51-55)

### System Analysis & Design Tools
- **Flowcharts:** Graphical representation used to identify redundancies and workflow gaps in current intake, queue, and service coordination at Starbarks.
- **Entity-Relationship Diagram (ERD):** Defines entities (Owners, Patients, Appointments, Services, Queues) and their relationships to ensure logical data organization.
- **Database Schema:** Developed based on the ERD to serve as a blueprint for implementation and ensure data integrity.
- **Use Case Diagrams:** Illustrates user-system interactions to ensure features align with actual user responsibilities (Veterinarians, Staff, Admins, Owners).

### Sampling & Quantitative Evaluation
- **Sampling Technique:** **Convenience Sampling** (Participants selected based on availability and willingness).
- **Likert Scale:** Uses a **5-point fixed response scale** to quantify user perceptions of usability, clarity, and satisfaction.
- **Average Weighted Mean (AWM):** Statistical method used to compute representative average scores from Likert responses for systematic analysis.
- **System Usability Scale (SUS):** A standardized, reliable 10-item questionnaire used as a benchmarked assessment of user experience and ease of use.

## Batch 12: References (Pages 56-59)
- Complete academic citations including **Creswell & Creswell (2018)** on qualitative/quantitative research, **Lewis (2018)** on SUS reliability, and **Yeung & Ng (2016)** on business process flowcharting.
- These references establish the academic foundation for VetConnect's technical and methodological choices.

---

# Digitization Complete
- **Total Pages Processed:** 59
- **Completion Date:** March 31, 2026
- **Status:** All core thesis findings (Introduction, Literature Review, Methodology, Tech Stack, and Evaluation Metrics) are now documented as a central project reference.

> [!IMPORTANT]
> This file (`thesis_notes.md`) serves as the functional and research-based blueprint for the VetConnect Capstone. All subsequent system design and feature implementation must align with the operational realities and ISO standards documented here.
