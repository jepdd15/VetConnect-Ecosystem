---
name: T4.181 ClinicalWorkspace Inline Pet Identity Editing
description: Review findings for T4.181 — ClinicalWorkspace.jsx inline identity edit form; isAgeExact undefined changedFields drift, stale allergy chip, appointment doc missing microchip field
type: project
---

T4.181 adds inline identity editing to ClinicalWorkspace identity strip. Single-file change.

Key findings:

**WARN: isAgeExact undefined causes spurious dob changedField entry**
- handleEditIdentity (line 1717): `isAgeExact === undefined` routes initialDobMode to 'exact'
- origDobMode comparison (line 1813): `isAgeExact === undefined` falls to else branch → 'approximate' (when dob exists)
- Net: legacy pets with no isAgeExact field always show dob in changedFields, even if vet made no change to DOB.
- Fix: unify to `petDetails?.isAgeExact === true || petDetails?.isAgeExact === undefined` in origDobMode computation.

**WARN: Appointment doc write missing microchip field**
- handleSaveIdentity appointment updateDoc (line 1821-1841): writes petName/petSpecies/petBreed/petGender/petIsNeutered/petBirthdate/isAgeExact/petAllergies/color — but NOT microchip.
- changedFields correctly tracks microchip change but the appointment doc snapshot is left stale.

**WARN: Identity strip allergy chip shows stale value after save**
- Allergy chip at line 3529 reads from `patient?.petAllergies` (the prop passed from parent, never mutated)
- handleSaveIdentity refreshes `petDetails` (line 1864-1865) but not the `patient` prop — no callback available.
- Chip will show pre-edit allergy for the remainder of the open session.

**All critical checks PASS:**
- Dual-write: pets/{petId} at line 1801, appointments/{id} at line 1821 — both present
- IDENTITY_EDIT pulse: arrayUnion, eventId, type, timestamp, staffId, staffName, note — all present
- Allergy propagation: ACTIVE_STATUSES matches valid lifecycle, skips current appt, correct batch
- DOB exact→Timestamp+true, approximate→computed+false, unknown→null+false — correct
- Autocomplete triple-bind: value+onChange+onInputChange with reason==='input' guard — correct
- componentsProps paper borderRadius:0 — correct
- Species change clears breed via `prev.species !== newSpecies ? '' : prev.breed` — correct
- Allergy pre-fill: comma-split, trim, filter — correct
- Close guard: isEditingIdentity+identityForm reset at top of handleCloseRequest before confirm check — correct
- No alert()/prompt() introduced by T4.181 (existing window.confirm calls are pre-existing)
- borderRadius:0 on all new form elements — correct
- FONT/COLORS/TYPE tokens used — correct, no new hardcoded hex introduced

**Why:** isAgeExact undefined was a legacy pre-T4.181 gap; microchip is a pet-catalog field not historically tracked on appointment docs; allergy chip is display-only from the incoming `patient` prop.
**How to apply:** When reviewing identity edit flows, check origDobMode vs pre-fill mode for isAgeExact===undefined parity; check all changedFields tracked fields are also mirrored in the appointment doc write.
