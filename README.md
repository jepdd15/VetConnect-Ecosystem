# 🐾 VetConnect: Integrated Practice Management System

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Firebase](https://img.shields.io/badge/firebase-ffca28?style=for-the-badge&logo=firebase&logoColor=black)
![MUI](https://img.shields.io/badge/Material%20UI-007FFF?style=for-the-badge&logo=mui&logoColor=white)

**VetConnect** is an enterprise-grade Appointment and Record Management System developed for Starbarks Veterinary Clinic (Santa Barbara, Pangasinan). 

Built as an academic capstone project, this system implements **Domain-Driven Design (DDD)** and **Separation of Concerns (SoC)** to deliver a highly scalable, decoupled architecture split into three distinct pillars: a Client Mobile App, a Web-Based Admin Dashboard, and a Serverless Cloud Backend.

---

## 🌟 Key Enterprise Features
*   **Smart Scheduling Engine:** A configuration-driven algorithm that prevents double-booking, enforces cross-species filtering, and calculates dynamic lead times based on live clinic capacity.
*   **Patient 360 (CRM/EMR):** Comprehensive Electronic Medical Records featuring vertical clinical timelines, auto-calculated weight deltas, and 1-click PDF visit summaries.
*   **Logistics & Supply Chain:** Advanced inventory control featuring Strict FIFO (First-In, First-Out) batch tracking, automated UOM (Unit of Measure) conversions, and real-time profitability/margin calculations.
*   **Rule-Based Virtual Assistant:** A context-aware chatbot that queries live database settings to provide 100% accurate operational information without AI hallucination risks.
*   **Automated Cloud Operations:** Background Node.js Cron Jobs that execute midnight queue sweeps and hardware push notifications.

---

## 🏗️ System Architecture

This monorepo contains the three core pillars of the VetConnect ecosystem:

```text
📁 VetConnect-Capstone/
 ├── 📁 VetConnect/             # TIER 1: Patient Portal (React Native / Expo)
 ├── 📁 VetConnect-Admin/       # TIER 2: Practice Management System (React / Vite / MUI v6)
 └── 📁 VetConnect-Backend/     # TIER 3: Serverless Infrastructure (Firebase Cloud Functions)