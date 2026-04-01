# 🧪 VetConnect Clinical Triage Engine: Documentation 🏛️🕰️🏗️✨🏙️

The VetConnect Triage Engine is a **high-density, phase-aware temporal Cockpit** designed for mission-hardened clinical documentation. It ensures total situational dominance by dynamically adapting the "Clock Entity" as a patient moves through the medical workspace.

---

## 1. The "Shape-Shifting" Triage Clock (Main Grid) 🧬⚖️

The primary Triage Clock column in the Patient Queue is not a static timer. It is a **State-Aware Logic Engine** that transforms its primary and secondary labels based on the active tab/clinical phase.

### **Temporal Transformation Matrix**
| Tab / Phase | Primary Display | Secondary Metadata | Clinical Urgency (Color) |
| :--- | :--- | :--- | :--- |
| **ONLINE / SCHEDULED** | **Appointment Time** | Countdown/Late Timer (m) | **Red** if >30m Late |
| **ARRIVED** | **Check-In Time** | **↳ IN LOBBY: Xm** | **Orange** if >20m Wait |
| **STARTED** | **Consult Start** | **↳ ACTIVE FOR: Xm** | **Green** (Active Phase) |
| **DONE / CANCELLED** | **Historic Date** | Absolute Processed Time | **Neutral** (Audit Mode) |

---

## 2. The Forensic Audit HUD (Hover Context) 🔍🛡️✨

Hovering over any Triage Clock triggers the **Clinical Zoom** overlay. This is a "Forensic Sidecar" that provides the full chronological history of the patient encounter without leaving the dashboard.

### **The HUD Design Anatomy**
*   **The Forensic Timeline**: A dashed vertical trail connecting every clinical milestone (Booked → Scheduled → Arrived → Started).
*   **The Temporal Anchors**: Every timestamp is explicitly prefixed with the **Absolute Date** (e.g., `MAR 31 ●`) to prevent "mental time jumping" errors.
*   **The Stealth Shield**: Implemented with `pointer-events: none` to ensure the HUD never steals mouse focus, eliminating UI flickering.

---

## 3. The Forensic Metric Ledger 🚦🛋️⏳

The bottom of the Audit HUD features a symmetric, two-column ledger for instant executive decision-making.

| Metric | Calculation Logic | Clinical Purpose |
| :--- | :--- | :--- |
| **Punctuality** | **[Arrived Time] - [Scheduled Slot]** | Measures patient reliability and shift adherence. ⚖️ |
| **Lobby Wait** | **[Consult Start] - [Arrived Time]** | Measures clinic workflow efficiency. 🛋️ |
| **Total Wait** | **[Now / Finish] - [Arrived Time]** | Measures total clinic resource occupation per patient. ⏳ |

---

## 4. Date-Awareness: Audit Mode vs. Live Mode 📅🏹

The engine features a **Temporal Logic Gate** that detects the selected filter date:

1.  **Live Mode (Today's Queue)**:
    *   Timers are **Dynamic**. They tick up every 60 seconds (e.g., `WAITING: 15M`).
    *   Focuses on **Actionable Urgency.**

2.  **Audit Mode (Past/Future Views)**:
    *   **Forensic Mute**: Live timers are stripped away.
    *   **Absolute Chronology**: Replaced with fixed Dates and Start Times.
    *   **The Result**: Ensures the Medical Record is a "Frozen Audit" of exactly when events occurred. 🛡️✅

---

## 5. UI Philosophy: High-Density Minimalism 🏗️💎

*   **Zero Noise**: Vertical alert bars are removed to prioritize **Clean Typography.**
*   **Unit Up-Scaling (H:M)**: Any time value exceeding 60 minutes automatically transforms from minutes to **Hours and Minutes** (e.g., `8H 52M`) to reduce mental load on staff. ⚖️📏
*   **Coffee Theme**: Uses **Coffee Brown (#5D4037)** for primary accents, maintaining a warm but professional clinical environment. 🖋️☕

---
**Document Version: 1.1**  
**System Status: MISSION-HARDENED** 🏁🛰️🏢✨🏙️🚀
