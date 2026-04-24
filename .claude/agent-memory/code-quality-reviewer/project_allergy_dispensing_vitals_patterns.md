---
name: Allergy+Dispensing+Vitals Session — Review Findings
description: T2.86/T2.112/T2.114/T2.119/T2.120/T2.121/T2.122/T2.174-T2.176/T2.188-T2.189/T2.278/T2.466-T2.470 review: allergy normalization gaps, dispensing dialog deadlock, alert() stub, balance formula drift
type: project
---

Session reviewed 15 files. Key findings:

**Patient Safety (allergy normalization)**
- `DispensingVerificationDialog.jsx` line 56: reads `patient?.petAllergies || ''` without the `|| patient?.allergies` legacy fallback. Old appointment docs without the canonical field silently show NKA when the patient has allergies. Fix: chain to `|| patient?.allergies || ''`.
- `ClinicalWorkspace.jsx` ~line 2185 (compact strip): `patient?.petAllergies` alone — same risk. The expanded header at line 1775 and line 2258 are both correctly normalized.
- `DispensingVerificationDialog.jsx` line 57–58: `hasAllergies` check uses `toUpperCase() !== 'NONE'` only; misses `'None recorded'` variant. Add a Set-based check.
- All other read sites in PetList, EditPetModal, PatientDashboard, usePatientManager correctly chain `petAllergies || allergies`.

**Dispensing Dialog Deadlock**
- `DispensingVerificationDialog.jsx` line 52: `allChecked` returns `false` when `prescribedItems.length === 0`. Fast-tracked or grooming patients with no prescribed items cannot proceed through the dialog. Fix: short-circuit to `true` when array is empty.

**Stub in Production**
- `PatientDashboard.jsx` line 581: "Add Record" button calls `alert('Coming soon!')`. Replace with a disabled button + Tooltip or hide until implemented.

**Balance Formula Drift**
- `usePatientManager.js` lines 160–167: `outstandingBalance` computed as `total - depositPaid` (legacy formula). `PatientDashboard.jsx` T2.101 computes it from `balanceRemaining` (newer field). Both show on the same session for the same client → inconsistent figures. Fix usePatientManager to use `s.balanceRemaining || 0`.

**Confirmed Clean**
- `printDispensingLabels.js`: XSS coverage complete — every Firestore-sourced value goes through `esc()`.
- `useInventory.js adjustStock`: transaction spread-copy before batch mutation is correct.
- `findFirstBookableDate` capacity callback wiring in `ClientAppointments.js` is correct.
- `ownerId: patient.ownerId || null` on sale docs (POSModal) is clean.
- `EditPetModal` propagation batch covers ACTIVE_STATUSES correctly (no batch >500 guard but practically safe).
- `writeBatch` imported but unused in `PatientDashboard.jsx` — minor cleanup.

**Why:** Allergy normalization is a patient-safety surface; the dispensing dialog deadlock blocks staff workflow for any non-clinical appointment.
**How to apply:** Always chain `petAllergies || allergies` at every allergy read site. Never assume `petAllergies` is present on older appointment documents.
