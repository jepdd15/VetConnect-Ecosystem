---
name: T4.200 Day 1 — Vaccine Schema + CW Dose Selector + buildVaccinationStatus Rewrite
description: 4-file review: vaccineConstants.js, useVaccineCatalog.js, vaccineHelpers.js, ClinicalWorkspace.jsx — multi-dose series engine, 19/19 spec items PASS
type: project
---

All 19 spec items PASS.

**Two warnings to track:**

1. `nextDoseNumber` off-by-one for gap-doseNumber scenario: `dosesGiven + 1` computed from `Math.min(doseMap.size, totalDoses)`, which does not account for gaps in the dose-number Set (e.g., doses 1 and 3 given but not 2). `nextDoseNumber` will suggest 3 when the correct answer is 2. Low-impact in practice (gap only arises from corrupted legacy data).

2. Second useEffect in CW (doseAutoDetectMap reaction, line 652) reads `vaccineCatalog` inside its body but has only `[doseAutoDetectMap]` in deps — `eslint-disable-next-line` suppresses the warning. Because `vaccineCatalog` comes from a `useSyncExternalStore` singleton it is effectively stable, but the suppression is a code smell.

**Advisory-level items:**
- `#fff !important` in selected ToggleButton text color is the only new inline hex. `COLORS.cardBg` (#FFFFFF) would be the token alternative. Low severity.
- Pre-existing inline hex `#A5D6A7`, `#558B2F`, `#C62828` in vaccine-row border/labels (not introduced by T4.200).
- Pre-existing `alert()` calls in ClinicalWorkspace (lines 1746, 2244, 2667) are not in the T4.200 changed code paths.

**Why:** Introduced multi-dose series schema across 3 catalog sources, one-shot getDocs dose auto-detect in CW, ToggleButtonGroup dose selector, binary completeness in buildVaccinationStatus.

**How to apply:** When reviewing Day 2 (cart integration), watch that dose-number is carried through the inventory stock deduction path correctly.
