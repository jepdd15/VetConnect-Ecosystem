---
name: T4.111 Department-Filtered Staff Assignment — Review Findings
description: ClinicalWorkspace.jsx dept field in cart + partitioned dropdown; Queue.jsx alert() → Dialog; 1 WARNING (missingDepts duplicates), 2 SUGGESTIONS
type: project
---

T4.111 shipped in ClinicalWorkspace.jsx and Queue.jsx. All 4 plan parts implemented and functionally correct.

**Why:** T4.111 adds department awareness to the "Performed By" dropdown and replaces the Queue.jsx alert() with a MUI Dialog.

**How to apply:** Reference these findings if any follow-up touches the staffing gap logic or treatment cart initialization.

## Issues found

WARNING — missingDepts array in handleStatusChange (Queue.jsx:823-829) has no dedup guard. If a patient has two services in the same unserviced department, the Chip list shows that department twice in the Dialog. Fix: `const missingDepts = [...new Set(...)]` or filter before push.

SUGGESTION — When user selects "— Unassigned —" (empty string value), onChange sets staffName to 'Unknown' because `allStaff.find(v => v.id === '')` returns undefined and the fallback is `'Unknown'`. Should be `'Unassigned'` to match the init attribution fallback at line 708.

SUGGESTION — staffGapDepts state comment is missing (no T4.111 task tag) while notifDialogOpen directly above has one. Minor consistency gap.

## What passed

- Part A: `department: svc.department || svcDef?.department || 'General'` fallback chain correct
- Part B: IIFE pattern, partition logic, ListSubheader conditional on others.length > 0 — all correct
- Part C: colored dot absorbed into Part B, borderRadius:'50%' intentional (not a design violation)
- Part D: Dialog renders, Chip borderRadius:0, "Understood" closes dialog, departments state is local onSnapshot in Queue.jsx (not a prop) — works correctly
- ListSubheader imported at line 14; no unused imports added
- COLORS.textMuted and COLORS.formBg both exist in designTokens.js
- departments state available locally in Queue.jsx (line 81) — no prop threading needed
- No new alert()/confirm()/prompt() introduced in changed code paths
- serviceAttribution save path (line 1603-1607) unaffected
