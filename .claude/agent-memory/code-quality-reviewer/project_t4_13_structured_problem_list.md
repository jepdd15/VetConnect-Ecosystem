---
name: T4.13 Structured Problem List — Review Findings
description: useProblemList hook-only (no mutations), "Update & Sign Off" stale-closure note, rgba inline values; all 20 spec items PASS/qualified PASS
type: project
---

T4.13 Structured Problem List — 5 files reviewed (firestore.rules, useProblemList.js, ClinicalWorkspace.jsx, PatientDashboard.jsx, PetHistoryScreen.js).

**Why:** Feature adds a persistent pets/{petId}/problems sub-collection with a CW update gate, PatientDashboard read panel, and mobile OVERVIEW tab CONDITIONS card.

**Findings:**
- Spec item 2 (WARN): useProblemList exports only reactive state (activeProblems/resolvedProblems/allProblems/loading). No addProblem/updateProblem/resolveProblem functions are exported — mutations live entirely inside ClinicalWorkspace's proceedWithSave batch, not the hook. Spec literally says "addProblem, updateProblem, resolveProblem" — the mutations exist but are inlined in CW, not exposed from the hook.
- "Update & Sign Off" button calls `problemListDialog._proceedFn` (from live state via closure) NOT from `problemListDialogRef.current`. The ref is for proceedWithSave to read dialog state, not vice versa — this is correct, not a bug.
- Two inline rgba values in T4.13 Dialog area: `rgba(216,67,21,0.2)` (shadow) and `rgba(0,0,0,0.04)` (hover) — pre-existing CW pattern but introduced by this PR in the problem list dialog.
- Mobile getDocs query uses where('status', 'in', ['active', 'monitoring']) + orderBy('diagnosedAt') — requires a composite index.
- alert() at line 2497 in proceedWithSave is pre-existing (not introduced by T4.13).
- All critical flow, atomicity, walk-in guards, batch writes, stale-closure fix (ref+useEffect) PASS.

**How to apply:** In future T4.13 reviews, note that addProblem/updateProblem/resolveProblem live in CW's batch — not the hook. Flag composite index gap for mobile conditions query.
