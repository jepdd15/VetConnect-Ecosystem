---
name: T4.200 Day 3 — Vaccine Hardening (Notification Templates + Reminder Queue + Stock Warning + ProductFormModal)
description: Review findings for T4.200 Day 3: dose placeholder cleanup regex bug in sendVaccineReminders; 23/24 items PASS before fix, 24/24 after
type: project
---

## Key Finding: Placeholder Cleanup Regex Bug (FIXED)

**vaccineReminderQueue.js** `sendVaccineReminders`, lines 540-545 (original):

The interpolation step for the legacy path (doseNumber=null, totalDoses=null) replaced both tokens with empty string, yielding `"(Dose /)"` in the body. The subsequent cleanup regex checked `m.includes('{')` — which was false after replacement — so the fragment was NOT stripped.

Fix applied: replaced the `includes('{')` condition with a digit-presence check on both sides of the slash. Any `(Dose X/Y)` fragment where X or Y is not a pure digit sequence is now stripped.

New regex (capture groups):
```js
.replace(/\s*\(Dose ([^)]*?)\/([^)]*?)\)/g, (m, d1, d2) => {
  if (m.includes('{') || !/^\d+$/.test(d1.trim()) || !/^\d+$/.test(d2.trim())) return '';
  return m;
})
```

## Checklist Results (24 items)

1. vaccine-due template includes "(Dose {doseNumber}/{totalDoses})" — PASS (line 81)
2. vaccine-overdue template includes "(Dose {doseNumber}/{totalDoses})" — PASS (line 85)
3. {doseNumber} and {totalDoses} in PLACEHOLDER_REFERENCE array — PASS (lines 171-172)
4. Cleanup regex strips "(Dose {doseNumber}/{totalDoses})" — PASS after fix
5. computePetVaccineStatuses collects ALL admins per vaccine (not just most recent) — PASS (allAdmins loop across all records, lines 136-148)
6. Queue results include doseNumber field — PASS (line 209 structured, line 255 legacy null)
7. Queue results include totalDoses field — PASS (line 210, line 256)
8. Queue results include catalogId field — PASS (line 211, line 257)
9. mapProductToCatalogEntry reads doses: vc.doses || 1 — PASS (line 66)
10. sendVaccineReminders interpolates {doseNumber} — PASS (lines 532, 538)
11. sendVaccineReminders interpolates {totalDoses} — PASS (lines 533, 539)
12. CW inline stock warning Alert renders when vaccine stock = 0 — PASS (lines 3118-3140)
13. Stock warning checks available stock (stock - reserved <= 0) — PASS: `available > 0` returns null, else renders (line 3126)
14. Stock warning has borderRadius: 0 — PASS (line 3133)
15. ProductFormModal vaccineConfig state reads doses on init (toString || '1') — PASS (line 74)
16. ProductFormModal vaccineConfig state reads doseIntervalDays on init (join(', ')) — PASS (line 75)
17. ProductFormModal handleSubmit saves doses as Number || 1 — PASS (line 151)
18. ProductFormModal handleSubmit parses doseIntervalDays from comma string — PASS (lines 152-154)
19. ProductFormModal has Total Doses TextField — PASS (lines 529-537)
20. ProductFormModal has Dose Intervals TextField with helper text — PASS (lines 540-548)
21. ProductFormModal has Min Age TextField with helper text — PASS (lines 551-559)
22. No alert()/confirm()/prompt() in changed files — PASS (none found)
23. mapProductToCatalogEntry reads doseIntervalDays and startAgeWeeks — PASS (lines 67-68)
24. ProductFormModal handleSubmit saves startAgeWeeks as Number || null — PASS (line 155)

## Advisory Notes

- `nextDoseNumber` when `seriesComplete=true` is set to `totalDoses` (e.g., "Dose 3/3 booster") — design choice, not a bug. No "Booster" label, but the context is clear from the body text.
- Stock warning match uses exact lowercase name comparison — will miss mismatched casing between catalog and free-text vaccine name entry. Low risk since CW autocomplete sources from the same vaccineProducts list.
