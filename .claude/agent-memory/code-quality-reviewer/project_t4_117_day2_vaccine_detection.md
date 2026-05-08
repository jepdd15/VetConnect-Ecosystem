---
name: T4.117 Day 2 — Vaccine Detection Change, Form Auto-Population, Manual Toggle, Stock-Out Override
description: Steps 2.1-2.5 review findings: sidebar Autocomplete blocks out-of-stock vaccines (inconsistent with Plan quadrant override), Button unused import in SoapGrid, isVaccinationVisit not memoized (micro-perf); all critical flow checks PASS
type: project
---

Steps 2.1-2.5 in ClinicalWorkspace.jsx and SoapGrid.jsx.

**Why:** T4.117 Day 2 replaces keyword-based vaccine detection with category-based detection, adds vaccine form auto-population, redesigns the Plan quadrant manual toggle as an Autocomplete, and adds stock-out override for client-supplied vaccines.

**How to apply:** Two warnings require fixes before Day 3.

## FAIL / Critical

None.

## WARNING 1 — Sidebar Autocomplete blocks out-of-stock vaccines (Check #19 inconsistency)

ClinicalWorkspace.jsx line 2902:
```js
getOptionDisabled={(option) => option.isOut === true}
```
This blanket-disables ALL items where netAvailable <= 0, including vaccine products. The stock-out override only works if the item can be selected. The Plan quadrant SoapGrid Autocomplete correctly has NO `getOptionDisabled`, so out-of-stock vaccines can be selected there. But a vet using the sidebar search cannot add an out-of-stock vaccine at all — the Plan quadrant is the only path.

This is an architectural inconsistency: Check #19 says "Vaccine out-of-stock: allowed with noStockDeduction:true" but this only holds via the Plan quadrant path. The sidebar path silently blocks it.

Fix: Change sidebar `getOptionDisabled` to allow vaccine out-of-stock items:
```js
getOptionDisabled={(option) => option.isOut === true && option.inventoryCategory !== 'vaccine'}
```

## WARNING 2 — Unused `Button` import in SoapGrid.jsx

SoapGrid.jsx line 2 imports `Button` from MUI but the component no longer renders a `<Button>` anywhere (it was replaced by the Autocomplete in T4.117). This will cause a lint warning.

Fix: Remove `Button` from the import line.

## SUGGESTION — isVaccinationVisit not wrapped in useMemo

ClinicalWorkspace.jsx line 1470: `const isVaccinationVisit = treatmentCart.some(item => item.category === 'vaccine')` is a plain expression, not `useMemo`. The plan specified `useMemo`. In a 3500-line component with many state variables, this recalculates on every render. For a small cart array this is negligible, but adding `useMemo` with `[treatmentCart]` dependency would align with the plan and be marginally more efficient.

## All passing checks

- Check 1: buildVaccineKeywords import DELETED (comment tombstone left correctly at line 4) ✓
- Check 2: vaccineKeywords useMemo DELETED ✓
- Check 3: isVaccinationVisit uses treatmentCart.some(item => item.category === 'vaccine') ✓
- Check 4: Zero live matches for vaccineKeywords / buildVaccineKeywords ✓
- Check 5: Keyword detection replaced with item.category === 'vaccine' in handleAddRx (line 1304) ✓
- Check 6: Auto-fill uses vaccineConfig (route, site, manufacturer, intervalDays) ✓
- Check 7: Due date = today + intervalDays (lines 1313-1318) ✓
- Check 8: setManualVaccineOverride(true) called if vaccine form not showing (line 1309-1311) ✓
- Check 9: Category-based detection in initial hydration (line 744, 754) ✓
- Check 10: Auto-fill enhanced with vaccineConfig defaults in hydration (lines 764-778) ✓
- Check 11: vaccineProducts + onAddVaccineProduct props added to SoapGrid (lines 61, 168, 171) ✓
- Check 12: Autocomplete replaces button in SoapGrid Plan quadrant (lines 165-215) ✓
- Check 13: Stock indicator (OUT OF STOCK chip with color="warning") shown in renderOption ✓
- Check 14: Selection delegates to onAddVaccineProduct (line 171) ✓
- Check 15: vaccineProducts useMemo in ClinicalWorkspace, species-filtered (lines 1490-1499) ✓
- Check 16: handleAddVaccineProduct handler exists (lines 1506-1509) ✓
- Check 17: Both SoapGrid instances receive vaccineProducts + onAddVaccineProduct (lines 2867-2868, 3359-3360) ✓
- Check 18: Non-vaccine out-of-stock: showToast NOT alert (line 1220) ✓
- Check 19: Vaccine out-of-stock: allowed — PARTIAL (Plan quadrant yes, sidebar no — see WARNING 1)
- Check 20: noStockDeduction flows to itemObj (line 1277) ✓
- Check 21: Soft-reserve skipped for noStockDeduction items (line 1351) ✓
- Check 22: noStockDeduction persisted to vaccineAdministrations in handleSaveConsult (line 1742) ✓
- Check 23: Warning badge shown on cart items with noStockDeduction (lines 3044-3056) ✓
- Check 24: No new alert()/prompt()/confirm() in T4.117 code paths ✓ (all existing ones are pre-existing)
- Check 25: All new UI has borderRadius: 0 ✓
- Check 26: No unused imports in ClinicalWorkspace ✓ (Button not imported); SoapGrid has orphaned Button import ✗
