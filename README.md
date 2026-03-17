# 🐾 VetConnect: Integrated Practice Management System

**VetConnect** is an enterprise-grade Appointment and Record Management System developed for **Starbarks Veterinary Clinic** (Santa Barbara, Pangasinan). 

Built as a capstone project for the Universidad De Dagupan, this system implements **Domain-Driven Feature Architecture** and **Separation of Concerns (SoC)** to deliver a highly scalable, decoupled ecosystem split into three distinct pillars.

---

## 🌟 Key Features
*   **Smart Scheduling Engine:** A dynamic "Tetris" algorithm that calculates available slots based on staff capacity, service durations, and cleanup buffers.
*   **Patient 360 (CRM/EMR):** Comprehensive clinical records featuring a vertical medical timeline, automatic weight-loss deltas, and e-prescribing.
*   **Logistics & Supply Chain:** Advanced inventory control with **FIFO (First-In, First-Out)** batch tracking and expiration date quarantining.
*   **BIR-Compliant Billing:** A professional POS system that handles VAT-exemptions and SC/PWD discounts automatically.
*   **Automated Cloud Operations:** Server-side Cron Jobs that execute midnight queue resets and hardware push notifications.

---

## 🏗️ System Architecture

This monorepo organizes the ecosystem into logical tiers:

```text
📁 VetConnect-Capstone/
 ├── 📁 VetConnect/             # TIER 1: Patient Portal (React Native / Expo)
 ├── 📁 VetConnect-Admin/       # TIER 2: Staff Management System (React / Vite / MUI v6)
 └── 📁 VetConnect-Backend/     # TIER 3: Cloud Infrastructure (Firebase Functions / Node.js)


⚙️ Installation & Setup Guide
1. Clone the Repository
git clone https://github.com/jepdd15/VetConnect-Ecosystem.git

cd VetConnect-Ecosystem

2. Setup the Web Admin Dashboard (Tier 2)
This launches the command center used by doctors and receptionists.

cd VetConnect-Admin
npm install
npm run dev

Access: Open http://localhost:5173
Live Site: https://starbarks-vetconnect.web.app

3. Setup the Mobile App (Tier 1)
This launches the patient portal for pet owners.

cd VetConnect
npm install
npx expo start --clear

Testing: Open the Expo Go app on your physical device and scan the QR code generated in the terminal.

Configuration & Security
To run this project, a valid firebaseConfig.js must be present in the root of the VetConnect and VetConnect-Admin directories. This file contains the API keys required to connect to the Firebase instance.

👥 Development Team
Capua, Emerson Dave S.
Desear, James Ed Patrick
Gutierrez, Maria Teresita B.
Gille, Chennie O.
Villosillo, Jayvee Joshe O.