---
name: T4.116 Day 1 — Prescriptions Redesign (Items 1-3)
description: PatientDashboard.jsx: active/historical Rx split with pin toggle, richer med cards, zoom modal; #B45309 introduced without token; double-filter in empty-state check
type: project
---

All 18 acceptance criteria from the plan PASS. Two sub-threshold issues introduced:

1. **#B45309 hardcoded at lines 2059 and 2937** — instruction-text amber color used in new code. Also exists pre-T4.116 at line 1531. No `COLORS.rxInstructions` token exists in designTokens.js; `COLORS.rxText` (#9A3412) is semantically different (heading red). Minor token gap; cosmetically correct.

2. **Double-filter in zoom modal empty-state** (lines 2944-2947) — the same `.filter().filter().length === 0` chain runs a second time just to compute the empty state. Functionally correct; wastes one filter pass on re-render. Pre-existing pattern in zoom dialogs elsewhere.

**Why:** rxTimeline can be large (many records), double-filter is redundant but runtime cost is negligible in practice.
**How to apply:** Flag as SUGGESTION in future reviews of this pattern; not blocking.
