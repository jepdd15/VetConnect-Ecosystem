---
name: T4.141 Day 1 — Structured Diagnosis System Review Findings
description: diagnosisConstants.js, useDiagnosisCatalog.js, SoapGrid.jsx, ClinicalWorkspace.jsx — critical: diagnosis fields missing from medical_record write; stale-ref fallback reads soapData.assessment (undefined); follow-up notes use undefined assessment
type: project
---

Medical record write at ClinicalWorkspace.jsx:1784 uses `soapData.assessment || "Clinical Visit"` for top-level `diagnosis` field and `soap.assessment` — but `soapData.assessment` was REMOVED in T4.141; it is always undefined. The new fields `soapData.diagnoses` and `soapData.assessmentNotes` are only written to the draft save path, NOT to the permanent medical_record batch.set(). Follow-up appointment notes at line 2007 also use the undefined `soapData.assessment`.

**Why:** The medical_record write was not updated alongside the soapData state shape change — it still references the legacy field. This means every signed record has `diagnosis: "Clinical Visit"` and `soap.assessment: undefined` regardless of what was entered.

**How to apply:** Flag any T4.141 Day 2 work that touches the sign-off write path to include `diagnoses: soapData.diagnoses || []`, `assessmentNotes: soapData.assessmentNotes || ''`, and generate a human-readable `diagnosis` summary string from `soapData.diagnoses`.

Additional findings:
- chip key=idx (SoapGrid:166) is a warning when items are deleted mid-list; catalogId is stable and should be used as key
- `#E8F5E9` hardcoded for chip no-severity background (SoapGrid:176) — no token exists for this surface
- MVD `stage-1-5` scale is clinically inaccurate — ACVIM uses lettered stages (A/B1/B2/C/D); `severity-1-5` would be a less-incorrect fallback
- `card-chf` has `hasSeverity: false` — the ACVIM/NYHA system exists for CHF staging; minor omission
- `useDiagnosisCatalog` is a perfect structural clone of `useLabTestCatalog` — PASS
- Both SoapGrid instances (main + God View) receive all 3 new props — PASS
- Hook called unconditionally before early returns at line 536 — PASS
- Draft save/resume backward compat (assessment fallback) at lines 781 + 2179 — PASS
- Sign-off validation requires diagnoses.length > 0 at line 1627 — PASS
- Custom diagnosis Dialog has PaperProps borderRadius:0 — PASS
- No prompt()/alert() in new T4.141 code — PASS (pre-existing alert()s in sign-off path are out of scope)
- Firestore arrayUnion write at line 2596 uses setDoc+merge — correct pattern
