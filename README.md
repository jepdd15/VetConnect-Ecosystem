# 🐾 VetConnect: Appointment and Record Management System for Starbarks Veterinary Clinic

**VetConnect** is an integrated Practice Management System (PMS) designed and developed as a Capstone Research Project for **Universidad De Dagupan**. It provides a unified digital infrastructure for Starbarks Veterinary Clinic to streamline clinical workflows, automate scheduling, and secure sensitive medical records.

---

## 📖 Research Context
As detailed in the **Chapter I: Introduction**, veterinary clinics face significant challenges in time management and workflow organization. VetConnect addresses the inefficiencies of manual, paper-based registration and fragmented digital communication by providing a centralized, role-based platform.

### 🏛️ Regulatory & Global Alignment
*   **Republic Act No. 10173 (Data Privacy Act of 2012):** Implemented via Firebase Authentication and strict Firestore Security Rules to protect pet owner PII.
*   **Republic Act No. 8485 (Animal Welfare Act):** Supports humane treatment by ensuring continuity of care through digitized medical history.
*   **Sustainable Development Goals (SDGs):** 
    *   **Goal 3 (Good Health & Well-Being):** Proactive veterinary care via the "One Health" approach.
    *   **Goal 9 (Industry & Innovation):** Modernization of small-scale service institutions.
    *   **Goal 12 (Responsible Consumption):** Reducing resource waste via automated inventory monitoring.

---

## 🔬 Theoretical & Methodological Framework

### 🔄 Conceptual Framework: IPO Model
The system architecture follows the **Input–Process–Output (IPO)** model:
*   **Input:** Interviews, direct observation of clinic workflows, and stakeholder feedback.
*   **Process:** **Feature-Driven Development (FDD)** involving modeling, feature listing, planning, and iterative design/construction.
*   **Output:** The VetConnect Ecosystem (Mobile App, Web Admin, and Cloud Backend).

### 🛠️ Methodology: Feature-Driven Development (FDD)
As an Agile methodology, FDD allowed the team to translate user needs into functional components across five distinct phases:
1.  **Develop an Overall Model** (System Architecture)
2.  **Build a Features List** (Requirements Gathering)
3.  **Plan by Feature** (Development Roadmap)
4.  **Design by Feature** (UI/UX Prototyping)
5.  **Build by Feature** (React & Firebase Implementation)

---

## 🏗️ System Architecture (Monorepo)

```text
📁 VetConnect-Capstone/
 ├── 📁 VetConnect/             # TIER 1: Patient Portal (React Native / Expo)
 ├── 📁 VetConnect-Admin/       # TIER 2: Practice Management System (React / Vite / MUI v6)
 └── 📁 VetConnect-Backend/     # TIER 3: Cloud Infrastructure (Node.js Functions)

🛰️ The Tech Stack
Frontend: React (Vite) for Widescreen Administration.
Mobile: React Native (Expo) for Cross-Platform Client Access.
Backend: Firebase Serverless Architecture (Firestore, Auth, Cloud Functions).

## ⚙️ Installation & Local Setup

This project is built using a modern JavaScript stack. Follow these steps precisely to replicate the development environment.

### 📋 Prerequisites
Before starting, ensure you have the following installed:
*   **Node.js (LTS Version):** [Download here](https://nodejs.org/) (Recommended v18 or v20).
*   **Git:** [Download here](https://git-scm.com/).
*   **Expo Go App:** Download on your [Android](https://play.google.com/store/apps/details?id=host.exp.exponent) or [iOS](https://apps.apple.com/us/app/expo-go/id982107779) device to test the mobile app.
*   **Firebase CLI:** Run `npm install -g firebase-tools` in your terminal.

---

### 1. Clone the Repository
Open your terminal/command prompt and run:
```bash
git clone https://github.com/jepdd15/VetConnect-Ecosystem.git
cd VetConnect-Ecosystem
2. Configure Environment Variables (CRITICAL)
For security, API keys are not stored in GitHub. You must manually link the apps to the Firebase project:
Create a file named firebaseConfig.js in the following two locations:
VetConnect/firebaseConfig.js
VetConnect-Admin/firebaseConfig.js
Paste your Firebase SDK configuration object into these files:
code
JavaScript
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "starbarks-vetconnect.firebaseapp.com",
  projectId: "starbarks-vetconnect",
  storageBucket: "starbarks-vetconnect.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
3. Setup & Launch Web Admin Dashboard (Tier 2)
Used by Veterinarians and Receptionists.
code
Bash
# Navigate to the Admin directory
cd VetConnect-Admin

# Install all dependencies
npm install

# Start the local development server
npm run dev
Access: Open http://localhost:5173 in your browser.
4. Setup & Launch Mobile App (Tier 1)
Used by Pet Owners for booking and records.
code
Bash
# Navigate to the Mobile directory (Open a new terminal window)
cd VetConnect

# Install all dependencies
npm install

# Start the Expo development bundler
npx expo start --clear
Testing:
Ensure your phone and laptop are on the same Wi-Fi network.
Scan the QR Code displayed in the terminal using the Expo Go app.
5. Setup Cloud Backend (Tier 3)
To modify or deploy the server-side logic and automated Cron Jobs:
code
Bash
# Navigate to the Functions directory
cd VetConnect-Backend/functions

# Install backend dependencies
npm install

# Login to your Firebase account
firebase login

# Deploy functions to the live server
firebase deploy --only functions
🛠️ Troubleshooting
"Module not found": Ensure you ran npm install inside the specific folder (Mobile or Admin), not just the root.
"Firebase Config Error": Double-check that firebaseConfig.js is correctly exported and that the API keys match your Firebase project settings.
Mobile app not connecting: Ensure your firewall allows connections on port 8081, or try starting expo with the tunnel flag: npx expo start --tunnel.