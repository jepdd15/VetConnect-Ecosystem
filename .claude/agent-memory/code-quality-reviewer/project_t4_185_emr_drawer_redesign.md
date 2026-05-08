---
name: T4.185 EMRDrawer Redesign — Review Findings
description: EMRDrawer.jsx major rewrite + Queue.jsx Dialog→EMRDrawer swap + ClinicalWorkspace appointmentId prop; all 13 spec items PASS; 4 advisory-level findings
type: project
---

T4.185 EMRDrawer redesign (all 3 files) reviewed. All 13 mandatory spec items PASS.

**Key findings:**

- orderBy('date') in petId fetch but resolveRecordDate reads `createdAt || date` — if a record has only `createdAt` and no `date` field, the Firestore query will miss it or mis-sort it (ADVISORY)
- 8 hardcoded hex values that have no design-token equivalent (#E8F5E9, #E3F2FD, #FFF3E0, #F3E5F5, #F5F5F5, #FAFAFA, #FEFEFE, #A5D6A7, #6A1B9A, #FFF8E1 interior uses) — pre-existing pattern throughout the codebase, not introduced uniquely here
- Queue.jsx still has pre-existing alert() calls (lines 348, 359, 630, 631, 638, 720, 876, 1008, 1252, 1265, 1276, 1301) — none introduced by this PR; none in the EMRDrawer-related handleOpenEMR path
- ClinicalWorkspace EMRDrawer render does NOT pass `petId` prop — correct by design (history prop is used instead)
- `lastMonthKey` IIFE mutation-in-map pattern is unconventional but functionally correct for React render

**Why:** These are design-system gap notes, not correctness issues. The fetch orderBy mismatch is the only actionable item.
**How to apply:** Flag orderBy('date') vs createdAt ambiguity in future medical_records queries. The pre-existing alert() calls in Queue.jsx are tracked separately under T3.36-T3.39 review.
