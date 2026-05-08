---
name: Patients CRM Tier 6 Session
description: 11 tasks completed: dead buttons, Snackbar migration, engagement KPIs, deceased pets, referral, Quick Book, vitals reference lines, print CSS, prescription frequency, vaccine completeness
type: project
---

All 11 tasks from PATIENTS_TIER6_PLAN.md completed and build-verified (27s, zero errors).

**Why:** Polish pass on Patients CRM module — clinical UX improvements, data quality, and print support.

**How to apply:** These tasks are DONE. Mark T2.118, T2.129, T2.133, T2.134, T2.135, T2.136, T2.458, T2.461, T2.463, T2.464, T2.465 as completed in MASTER_TASKLIST.md.

## What was done

- **T2.118 + T2.458**: PatientDashboard — removed "Add Record" (no workflow), wired both "Book Visit" buttons + "Rebook" per-record button to WalkInModal. Added services/departments onSnapshot listeners.
- **T2.129**: Replaced all `alert()` calls in Patients.jsx (3) and PatientDashboard.jsx (1) with MUI Snackbar+Alert.
- **T2.133**: ClientHeader shows yellow staleness banner when profile not updated in >90 days. usePatientManager.handleSaveProfile now writes `updatedAt: Timestamp.now()` on every save.
- **T2.134**: usePatientManager computes engagementKPIs (totalVisits, lastVisitDate, avgDaysBetween, noShowCount) via one-shot getDocs on appointments. ClientHeader displays KPI row.
- **T2.135**: PetList supports `status === 'deceased'` — excluded from active count, shown in "In Memoriam" section with dove emoji. Context menu has "Mark as Deceased" with confirmation dialog. Firestore write: `{ status: 'deceased', dateOfDeath: Timestamp.now() }`.
- **T2.136**: `referredBy` field added to NewClientModal form+payload, usePatientManager editForm+handleSaveProfile, ClientDetails DataField, ClientHeader chip display.
- **T2.461**: `ReferenceLine` added to Temp, HR, RR, CRT, BCS charts with `SPECIES_VITAL_RANGES` constant. `speciesKey` derived from `pet.species`. Weight/Pain charts intentionally excluded.
- **T2.463**: `@media print` block appended to index.css — hides sidebar/buttons/dialogs, expands all Collapse containers, forces color printing, avoids record page breaks.
- **T2.464**: `allPrescriptions` useMemo replaced with `prescriptionFrequency` — counts per-medication across all records, sorted most-frequent first. Widget shows Nx badge.
- **T2.465**: `vaccineCompleteness` useMemo filters `vaccinationStatus` to species-relevant vaccines (dog=4, cat=3). Vaccination Status widget shows completeness progress bar + X/Y (Z%) at top.
