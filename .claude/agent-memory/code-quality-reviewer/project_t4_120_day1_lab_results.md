---
name: T4.120 Day 1 — Lab Results System Redesign
description: labTestConstants (78 entries), useLabTestCatalog singleton hook, ClinicalWorkspace form redesign, SoapGrid Objective placement
type: project
---

Critical bug: draft hydration (both initial onSnapshot load and handleResumeDraft) does not restore labResults state — lab data is lost when a draft is resumed. Both setSoapData call sites (line ~688 and ~2039) must be accompanied by setLabResults(d.labResults || []) with field fallbacks (unit/'', referenceRange/null, catalogTestId/null, resultType/'descriptive').

Advisory: CUSTOM_TEST_SENTINEL object and labCatalogWithSentinel array are recreated on every render (lines 2378-2379) inside the component body. The Autocomplete `options` prop gets a new array reference on every render, causing unnecessary re-renders of all rows. Should be memoized with useMemo (deps: [labCatalog]).

Advisory: SoapGrid JSDoc comment still says "Plan quadrant extras" for labResultsNode (line 29) even though it is now rendered in the Objective quadrant. Stale documentation — update the comment to "Objective quadrant extras".

PASS items: Amendment 1 compliance fully correct — positive-negative tests show Positive/Negative labels but store 'abnormal'/'normal'. No code path can write 'positive' or 'negative' as a status value. computeAutoStatus, getStatusChipLabel, and status dropdown MenuItems all enforce the 3-value contract. Auto-status 30% heuristic comment present at line 2352. All 78 catalog entries have required fields. SNAP tests use positive-negative resultType with null referenceRange. Singleton hook matches useVaccineCatalog pattern exactly. Write path writes unit, referenceRange, catalogTestId, resultType with fallbacks; filter(l => l.testName) guard preserved. Custom test dialog uses setDoc+merge+arrayUnion correctly, borderRadius:0 on PaperProps. SoapGrid placement is Objective quadrant after PhysicalExamChecklist, NOT in Plan. No alert()/confirm()/prompt() introduced by T4.120 (pre-existing ones in ClinicalWorkspace are known tech debt).

**Why:** Draft hydration is the only ISSUE that must be fixed before shipping — without it, any lab results entered during a partial consult are silently lost when the vet resumes the draft.

**How to apply:** When reviewing ClinicalWorkspace draft paths, always check that every state slice that can be entered mid-consult (labResults, treatmentCart, vaccine entries) is restored in all hydration paths.
