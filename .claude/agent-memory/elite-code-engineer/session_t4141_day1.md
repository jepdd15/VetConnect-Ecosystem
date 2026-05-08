---
name: T4.141 Structured Diagnosis System — COMPLETE (Day 1 + 2 + 3)
description: T4.141 fully done: 10 consumer files updated across admin + mobile + AI prompt builders. Dual-write/dual-read, 452 entries, 10 severity scales. Build + 322 tests pass.
type: project
---

T4.141 ALL 3 DAYS DONE. Structured diagnosis system complete end-to-end.

**Why:** Transforms the Assessment quadrant from free-text to a queryable clinical catalog, enabling accurate Dashboard Top Diagnoses stats (eliminates "CKD" vs "Chronic Kidney Disease" duplicates).

**How to apply:** T4.141 is DONE. All 10 consumer files updated (SoapGrid, ClinicalWorkspace, EMRDrawer, PatientDashboard, useDashboardData, printVisitSummary, buildPetHistoryPrompt, buildPetOwnerPrompt, PetHistoryScreen). Build + 322 tests green.

## Files created
- `VetConnect-Admin/src/utils/diagnosisConstants.js` — ~500+ entries, 13 categories, 9 severity scales
- `VetConnect-Admin/src/hooks/useDiagnosisCatalog.js` — singleton useSyncExternalStore hook, Firestore path: clinic_settings/diagnosis_catalog

## Files modified
- `VetConnect-Admin/src/components/SoapGrid.jsx`:
  - Imports SEVERITY_SCALES from diagnosisConstants
  - 3 new props: diagnosisCatalog, patientSpecies, onAddCustomDiagnosis
  - Assessment quadrant overflow: 'hidden' → 'auto'
  - Assessment TextField replaced with: chips + Autocomplete + severity selectors + assessmentNotes TextField
  - DiagnosticBridge (AI buttons) untouched — stays above the new form
- `VetConnect-Admin/src/components/ClinicalWorkspace.jsx`:
  - Imports useDiagnosisCatalog, DIAGNOSIS_CATEGORIES
  - useDiagnosisCatalog() called unconditionally before early returns (hooks order rule)
  - soapData initial state: assessment:'' → diagnoses:[], assessmentNotes:''
  - freshDefaults: same replacement
  - Stale draft hydration: dual-read (diagnoses || [], assessmentNotes || assessment || '')
  - handleResumeDraft: same dual-read
  - handleSaveDraft: writes diagnoses[], assessmentNotes (replaces assessment key)
  - Sign-off validation: !assessment.trim() → diagnoses.length === 0, updated toast message
  - Both SoapGrid instances get diagnosisCatalog, patientSpecies, onAddCustomDiagnosis props
  - addCustomDxOpen/customDxName/customDxCategory dialog state added
  - handleSaveCustomDiagnosis: writes to clinic_settings/diagnosis_catalog via setDoc arrayUnion, adds to soapData.diagnoses
  - Add Custom Diagnosis Dialog JSX (next to Add Custom Lab Test dialog)

## Day 2 files modified
- `VetConnect-Admin/src/components/ClinicalWorkspace.jsx` (handleSaveConsult):
  - diagnosis field: soapData.assessment → diagnoses[0]?.name || "Clinical Visit"
  - diagnoses[] array + assessmentNotes fields added after diagnosis
  - soap.assessment: soapData.assessment → soapData.assessmentNotes || ''
  - dischargeSummary.diagnosis: same dual-read
  - follow-up notes + parentDiagnosis: same dual-read
- `VetConnect-Admin/src/components/EMRDrawer.jsx`:
  - diagnosis variable: added diagnoses?.[0]?.name as first fallback
  - Assessment section: structured chips with severity + assessmentNotes text fallback
- `VetConnect-Admin/src/features/Patients/PatientDashboard.jsx`:
  - textFields search: r.diagnoses?.map(d=>d.name).join(' ') prepended
  - Timeline mapping: r.diagnoses?.[0]?.name || r.diagnosis
  - Record header Typography: same dual-read
  - Expanded SOAP Assessment: chips with severity + assessmentNotes text fallback
- `VetConnect-Admin/src/features/Dashboard/hooks/useDashboardData.js`:
  - Top 5 Diagnoses: structured records group by catalogId, legacy records fallback to diagnosis string
- `VetConnect-Admin/src/utils/printVisitSummary.js`:
  - Visit Details Diagnosis: all structured diagnoses with severity in parens, joined by '; '
  - SOAP Assessment td: same + assessmentNotes block appended

## Verified (no changes needed)
- ClinicalTab.jsx: dataKey="diagnosis" + dataKey="count" unchanged — compatible
- generateReportHTML.js: d.diagnosis + d.count unchanged — compatible
- generateInsight.js: top.diagnosis + top.count unchanged — compatible

## Day 3 files modified
- `VetConnect/src/screens/PetHistoryScreen.js`:
  - Search filter (line 650): r.diagnoses?.map(d=>d.name).join(' ') || r.diagnosis prepended
  - Diagnosis text (line 1500): item.diagnoses?.[0]?.name || item.diagnosis dual-read
  - Severity chip added below diagnosis text: bg #FFF3E0, text #E65100, borderRadius 0
  - "+N more diagnosis/diagnoses" indicator when item.diagnoses.length > 1
  - Assessment block condition: assessmentNotes || (soap.assessment !== diagnosis)
  - Assessment text: item.assessmentNotes || item.soap?.assessment
- `VetConnect-Admin/src/utils/buildPetHistoryPrompt.js`:
  - SOAP Assessment block replaced with structured diagnosis block (lines 88-96)
  - diagnoses[] → "A (Diagnoses): name (severity), ..." + "A (Notes): assessmentNotes"
  - Falls back to soap.assessment, then r.diagnosis for legacy records
  - Removed redundant legacy fallback line for diagnosis
- `VetConnect/src/utils/buildPetOwnerPrompt.js`:
  - Diagnosis line (line 160-161): structured multi-diagnosis list with severity, fallback to legacy

## Key architectural decisions locked
- Severity scales: 9 scales, hasSeverity:true ONLY for established clinical grading systems
- Custom diagnosis ID format: custom-{timestamp}, added to clinic_settings/diagnosis_catalog.tests via arrayUnion
- Backward compat: draft resume reads d.diagnoses||[] and d.assessmentNotes||d.assessment||''
- Species fallback: if patientSpecies is empty, shows all diagnoses (safe default)
