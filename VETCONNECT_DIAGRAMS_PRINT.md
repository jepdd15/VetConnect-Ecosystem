# VetConnect System Diagrams (Print-Friendly)

> Simplified versions for printed hardcopy. Full field details in VETCONNECT_DIAGRAMS.md.

---

## 1. Firestore ERD (Simplified)

```mermaid
erDiagram
    direction LR

    users {
        string id PK
        string role "pet_owner | vet | staff | admin"
        string fullName
        string phone
        string email
    }

    pets {
        string id PK
        string ownerId FK
        string name
        string species
        string breed
    }

    appointments {
        string id PK
        string ownerId FK
        string petId FK
        string assignedVetId FK
        string status "12-state lifecycle"
        timestamp scheduledDate
        string serviceType
        int queueNumber
    }

    medical_records {
        string id PK
        string petId FK
        string ownerId FK
        string appointmentId FK
        string vetId FK
        string recordType
        object soap
        string diagnosis
    }

    services {
        string id PK
        string name
        string department
        float price
        int duration
    }

    sales {
        string id PK
        string appointmentId FK
        string ownerId FK
        float total
        string paymentMethod
        string status
    }

    inventory {
        string id PK
        string name
        string category
        int stock
        float sellingPrice
    }

    expenses {
        string id PK
        string category
        float amount
        timestamp date
    }

    clinic_settings {
        string id PK
        int openHour
        int closeHour
        array workingDays
        array closedDates
    }

    queue_daily {
        string id PK
        int currentServing
        int lastNumberIssued
        string status
    }

    users ||--o{ pets : "owns"
    users ||--o{ appointments : "books"
    pets ||--o{ appointments : "scheduled for"
    pets ||--o{ medical_records : "has records"
    appointments ||--o| medical_records : "produces"
    appointments ||--o| sales : "billed via"
    services ||--o{ appointments : "requested in"
    inventory ||--o{ sales : "sold in"
    users ||--o{ expenses : "logged by"
```

---

## 2A. Client Mobile App Flow

```mermaid
flowchart LR
    START([START: Client Opens App]) --> AUTH{Authenticated?}
    AUTH -->|No| LOGIN[Login / Register]
    AUTH -->|Yes| DASH[Client Dashboard]
    LOGIN --> DASH

    DASH --> PETS[My Pets]
    DASH --> BOOK[Book Appointment]
    DASH --> APPTS[My Bookings]
    DASH --> QUEUE[Queue Status]
    DASH --> CHAT[AI Chatbot]
    DASH --> PROFILE[My Profile]

    PETS --> HISTORY[Pet History]
    PETS --> BOOK
    HISTORY --> PDF[/Download PDF Summary/]
    APPTS --> CANCEL[Cancel Booking]
    APPTS --> RESCHEDULE[Reschedule Visit]
    APPTS --> CONFIRM_BTN[Confirm Attendance]
    QUEUE --> ALERT[/Called Alert + Vibration/]
    CHAT --> QUICK{Quick Action or Free Text?}
    QUICK -->|Quick Action| RULE[Rule-Based Answer]
    QUICK -->|Free Text| AI[AI Response via Claude]

    CANCEL & RESCHEDULE & CONFIRM_BTN & RULE & AI & PDF & ALERT --> END_CLIENT([END: Client Action Complete])
```

## 2B. Admin Web Dashboard Flow

```mermaid
flowchart LR
    START([START: Staff Opens Browser]) --> LOGIN[Staff Login]
    LOGIN --> ROLE{Role Check}
    ROLE -->|Unauthorized| BLOCKED([END: Access Denied])
    ROLE -->|Authorized| DASH[Dashboard Analytics]

    DASH --> QUEUE[Queue Management]
    DASH --> PATIENTS[Patients CRM]
    DASH --> RECORDS[Medical Records]
    DASH --> SERVICES[Services Catalog]
    DASH --> INVENTORY[Inventory]
    DASH --> STAFF[Staff Directory]
    DASH --> SALES[Sales + POS]
    DASH --> EXPENSES[Expenses]
    DASH --> MONITOR[Lobby Monitor]
    DASH --> SETTINGS[Clinic Settings]
    DASH --> REPORTS[Forensic Reports]

    QUEUE --> TRIAGE{New Appointment?}
    TRIAGE -->|Accept| CHECK_IN[Check-In + Assign Staff]
    TRIAGE -->|Reject| REJECT([END: Rejected])
    CHECK_IN --> CLINICAL[Clinical Workspace]

    CLINICAL --> SOAP[SOAP Notes]
    CLINICAL --> RX[Treatment Plan]
    CLINICAL --> VAX[Vaccines]
    CLINICAL --> SIGNOFF[Discharge + Sign-Off]

    SIGNOFF --> HAS_DRUGS{Has Drug Items?}
    HAS_DRUGS -->|Yes| DISPENSE[Dispensing Verification]
    HAS_DRUGS -->|No| POS[POS Billing]
    DISPENSE --> POS
    POS --> COMPLETE([END: Visit Complete])
```

---

## 3. Appointment Status Lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending : Client books
    pending --> confirmed : Staff accepts
    pending --> cancelled : Rejected

    confirmed --> arrived : Check-in
    confirmed --> no_show : Did not arrive
    confirmed --> cancelled : Cancelled

    arrived --> in_consult : Vet starts

    in_consult --> on_hold : Awaiting labs
    in_consult --> dispensing : Pharmacy needed
    in_consult --> billing : Direct to billing
    in_consult --> confined : Hospitalized

    on_hold --> in_consult : Resume

    dispensing --> billing : Items verified

    billing --> completed : Payment collected

    confined --> carried_over : EOD rebook

    carried_over --> arrived : Returns next day

    completed --> [*]
    cancelled --> [*]
    no_show --> [*]
```
