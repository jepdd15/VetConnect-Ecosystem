---
name: T3.99 Structured SOAP Amendment Form — Review Findings
description: T3.99 review: ClinicalWorkspace, PatientDashboard, EMRDrawer, PetHistoryScreen — showAmendMeds dead state, vitals empty-field bloat, hardcoded hex in new mobile styles
type: project
---

T3.99 ships structured SOAP amendment form across 4 files. All critical flow checks pass.

**Why:** Replacing text-only amendment with structured S/O/A/P fields + optional vitals + optional meds on sealed records.
**How to apply:** When reviewing future amendment-adjacent code, note the patterns flagged below.

## Issues found

### WARN — showAmendMeds is dead state
- `showAmendMeds` is declared and reset on success/cancel, but never read in JSX. The meds section is gated by `amendMeds.length > 0`, not the bool. Not a bug (UX works correctly via the array), but the state variable is unused noise.

### WARN — vitalsPayload stores empty-string fields in Firestore
- When `hasVitals` is true, `{ ...amendVitals }` is spread as-is. Any field the user left blank goes to Firestore as `""`. Renderers filter them out correctly (`.some(v => v)` guards), but the document bloats. Pattern: filter to non-empty before spread.

### WARN — VitalsRow dual-path mismatch in EMRDrawer for amendments
- `VitalsRow` is designed for records whose vitals can appear as top-level fields (`v.objWeight`, etc.) **or** under a `vitals` sub-object. When called with `am.vitals` directly (amendment sub-object), the `v.vitals || v` fallback in VitalsRow resolves to `am.vitals` correctly. Works as-is, but the guard `am.vitals && Object.values(am.vitals).some(v => v)` is correct pre-check.

### SUGGESTION — Hardcoded hex in new mobile styles (PetHistoryScreen.js)
- `amendmentCard.borderColor: '#FFE0B2'` (line 2021) and `amendVitalsRow.backgroundColor: '#FFF3E0'` (line 2073) are hardcoded. Mobile token file has no warningSurface or peach equivalents. These match admin's `COLORS.peach` and `COLORS.warningSurface` semantically but aren't tokenized on mobile. Pre-existing pattern in the file; not introduced uniquely by this task but new code adds two more instances.

### SUGGESTION — BF360C hover hex in ClinicalWorkspace (line 2640)
- `'&:hover': { bgcolor: '#BF360C' }` — admin designTokens defines `COLORS.ctaHover: '#BF360C'`. Should use token.

### INFO — #E8F5E9 / #2E7D32 in RECORD SEALED banner (lines 2469-2477)
- Pre-existing from T2.75, not new in T3.99. COLORS.success = '#2E7D32' exists in designTokens; no successSurface token exists. Out of scope for this task.

## All critical checks PASS
- amendmentText state fully removed (not present anywhere)
- All new state declared: amendSoap, amendVitals, amendMeds, showAmendVitals, showAmendMeds
- Validation: reason.trim() + at least one SOAP field
- handleSubmitAmendment builds type:'structured' entry correctly
- Only non-empty SOAP fields in payload
- Vitals omitted when all empty
- Meds filtered by name.trim()
- Pulse event note updated to structured summary
- All state reset on success AND cancel
- Save button disabled when !amendmentValid
- Orange theme (COLORS.warning / COLORS.warningSurface)
- borderRadius: 0 on all NEW amendment form elements
- Zero prompt()/alert()/confirm() in new code
- PatientDashboard: branch on type==='structured', legacy unchanged, only non-empty SOAP rendered
- EMRDrawer: vetName||author + timestamp||createdAt fallback fixed, SoapText/VitalsRow sub-components used
- PetHistoryScreen: branch correct, legacy unchanged, new styles present
