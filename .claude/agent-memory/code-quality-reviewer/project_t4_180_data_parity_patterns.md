---
name: T4.180 Data Parity — Review Findings
description: NewClientModal emergency contacts + AddPetModal/EditPetModal DOB 3-mode + allergy tags review; clientTag ghost in resetForms, allergy switch-ON+empty resolves to None, duplicate Dialog missing PaperProps
type: project
---

T4.180 review covered 5 files: ClientDetails, NewClientModal, AddPetModal, usePatientManager, EditPetModal.

Key findings:
- NewClientModal resetForms (line 32) includes `clientTag: 'Regular'` — ghost field from the removed tag system, written to Firestore on reset-then-save path. WARNING.
- Allergy resolution: switch ON but empty allergyArray resolves to 'None' (correct). But the UI leaves the switch ON and shows "No allergens added yet..." — creates a misleading state where the danger styling is active but 'None' is written. UX WARNING.
- Duplicate phone warning Dialog (line 246) missing PaperProps borderRadius:0. SUGGESTION.
- window.confirm in handleDeleteNote (line 298 usePatientManager) is pre-existing, not T4.180-introduced.
- All 6 UI-only fields (dobMode, estYears, estMonths, showAllergyInput, allergyArray, currentAllergyInput) correctly destructured out in usePatientManager.js.
- resolveDob: exact→Timestamp+true, approximate→1st-of-month anchor+false, unknown→null+false. PASS.
- Legacy scalar emergencyName/emergencyPhone written alongside emergencyContacts[]. PASS.
- Both petAllergies + allergies written on both add and edit paths. PASS.
- Emergency contact validation: name requires phone, PH format checked. PASS.
- EditPetModal isAgeExact undefined treated as exact (legacy compat). PASS.
- All design tokens used except duplicate Dialog PaperProps.

**Why:** T4.180 data parity task. 2 warnings + 1 suggestion. No critical issues.
**How to apply:** When reviewing future modal work, check resetForms for dead state fields. The allergy switch-ON+empty → 'None' behavior is known and intentional.
