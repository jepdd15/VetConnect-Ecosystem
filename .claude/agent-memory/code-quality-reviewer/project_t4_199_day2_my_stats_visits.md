---
name: T4.199 Day 2 — My Stats VISITS Tab Enhancements
description: useMyStats 8 new memos + MyStatsScreen VISITS tab toggles, YoY dual-mode, VISIT PATTERNS section — all 21 spec items checked
type: project
---

## Scope
- `VetConnect/src/screens/MyStatsScreen.js` — VISITS tab rebuilt
- `VetConnect/src/hooks/useMyStats.js` — 8+ new useMemos

## Spec Results
All 21 items PASS (see review for details).

## Issues Found

### WARNING — weeklyVisitData Sunday bucket gap
- `weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1 - ...)` formula skips Sunday visits.
- When today is Sunday (getDay()=0): current-week bucket starts tomorrow; previous-week bucket ends Saturday.
  Visits on any Sunday fall into no bucket.
- Fix: treat Sunday (0) as day 7 for Monday-first ISO weeks:
  `const dow = weekStart.getDay() || 7; weekStart.setDate(weekStart.getDate() - dow + 1 - ...)`

### WARNING — VISIT PATTERNS empty-state never renders
- `preferredDays.length === 0` is always false when activeTab==='visits' because the memo always
  returns a 7-element array (Mon–Sun counts).
- The empty-state message `"Not enough visit data yet."` will never render.
- Fix: add a `hasVisits` guard: `const hasVisits = allAppointments.some(a => a.status === 'completed');`
  or replace the `preferredDays.length === 0` condition with `!hasVisits`.

### ADVISORY — redundant seasonalPattern dep in perPetSeasonalPattern
- `perPetSeasonalPattern` lists `seasonalPattern` in its deps array, but also has `allAppointments`
  directly. Both change together, causing no double-run per render but the dep is logically redundant.
- Not a correctness bug; can simplify to avoid confusion.

### ADVISORY — time-grouping toggle has no effect on pie charts (UX)
- When `visitBreakdownMode` is 'byPet'/'byService'/'byDepartment', the MONTHLY/WEEKLY toggle is
  visible but has no effect on the pie data (all-time counts). No label clarifies this.
- Consider hiding the time-grouping row when breakdown mode is not 'total', or adding a note.

## Pre-existing (not introduced by Day 2)
- `diagnosisHistory` not destructured in MyStatsScreen (noted in Day 1 review)
- `no-show` status used in visitOutcomes — valid in this codebase per T4.93 context
