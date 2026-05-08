---
name: T4.141 Day 2 — Structured Diagnosis Consumer Updates
description: Day 2 review findings: EMRDrawer hasSoap gate misses diagnoses[], PatientDashboard rec.soap.assessment bare access, #E8F5E9 hardcoded in chips; all critical dual-write/XSS/dual-read checks PASS
type: project
---

Day 2 of T4.141 ships the dual-write path and 4 consumer updates (ClinicalWorkspace handleSaveConsult, EMRDrawer, PatientDashboard, useDashboardData, printVisitSummary).

**Critical checks — all PASS:**
- Zero remaining soapData.assessment references in ClinicalWorkspace.jsx (grep confirmed)
- Dual-write: both diagnosis (string) and diagnoses[] (array) written on sign-off
- assessmentNotes written both at top-level and inside soap.assessment for legacy compat
- dischargeSummary.diagnosis uses diagnoses[0].name
- Follow-up appointment notes + parentDiagnosis both updated
- All diagnosis text in printVisitSummary goes through esc() — no XSS
- useDashboardData { diagnosis, count } output shape preserved
- Chip keys: EMRDrawer uses dx.catalogId || i; PatientDashboard uses dx.catalogId || i
- borderRadius: 0 on all new chips

**Findings:**

WARNING — EMRDrawer hasSoap gate does not include `record.diagnoses?.length > 0`. For a hypothetical future record that has diagnoses but no subjective/plan (e.g., a partial record or partial read), the SOAP section would be hidden. In practice, sign-off requires both subjective and plan, so this is low-risk but technically incomplete.
- File: EMRDrawer.jsx line 99

WARNING — PatientDashboard line 1429 accesses `rec.soap.assessment` without optional chaining: `{rec.assessmentNotes || rec.soap.assessment}`. The outer condition `(rec.assessmentNotes || (!rec.diagnoses?.length && rec.soap?.assessment))` guarantees rec.soap is non-null when rec.soap.assessment is needed (short-circuit logic), but the bare access is fragile — a maintainer refactoring the condition could inadvertently introduce a crash.
- File: PatientDashboard.jsx line 1429

ADVISORY — `#E8F5E9` hardcoded for no-severity chip backgrounds in EMRDrawer (line 202) and PatientDashboard (line 1422). Pre-existing pattern in this codebase (T4.121 flagged the same). No COLORS token for light-green surface exists.

ADVISORY — useDashboardData mixed-key collision: a custom diagnosis with no catalogId (key = dx.name) could theoretically collide with a legacy-record key of the same string. Counts would merge under a single entry — actually desirable behavior, but coincidental.

**All other checklist items PASS:** dual-read pattern consistent across all 5 files, no orphaned assessment references, XSS safe, design tokens used for primary colors, chip keys stable.
