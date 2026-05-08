---
name: T4.182 Day 2 — Dashboard Complete Redesign (useDashboardData + AnalyticsTab + FinancialTab + TodayTab)
description: Review findings for Day 2 of T4.182 — ~30 new metrics, vaccine queue one-shot, ComposedChart upgrade, clinical/lab/diagnosis visualizations
type: project
---

Day 2 adds ~30 metrics across useDashboardData, AnalyticsTab, FinancialTab, and TodayTab.

**Why:** T4.182 is the dashboard complete redesign, Day 2 wires visualizations for lab stats, diagnosis enhancements, vaccine compliance, financial intelligence, and operational intelligence KPIs.

**How to apply:** Reference when reviewing future dashboard-related tasks.

## Issues Found

### CRITICAL
1. `clinicalWithCompliance` merge happens at render time (line 1653–1660) — outside any useMemo, so it creates a new object on every render. Not a hooks violation but causes all consumers of `clinical` to re-render each cycle since reference equality fails. Fix: wrap in useMemo([clinical, vaccineCompliance]).

### WARNING
2. `overlayData` useMemo dep array in FinancialTab line 106: `[financial?.revenueTrend, financial?.expenseTrend, financial]` — `financial` subsumes the first two. The narrower deps are redundant. Not incorrect (worst case is under-memoization on `financial` change), but the intent comment says "deduplicated" which is wrong.
3. `SC/PWD DISCOUNTS` KPICard title is rendered TWICE in FinancialTab — once in ROW 6 (line 178, showing `totalDiscounts`) and again in ROW 8 (line 258, showing `scPwdDiscountTotal`). Both share the same title string. This causes ambiguity for the user and for any drillDown key lookup.
4. `collectionRate` formula (line 1057): `totalCollected / totalBilled` can exceed 100% if deposits or rounding cause collected > billed. The `Math.round` does not clamp to 100. A `Math.min(100, ...)` guard should be added, same as the `followUpComplianceRate` pattern already used in the same file at line 1202.
5. `patientFlowRate` (line 815): `hoursSinceOpen` uses `Math.max(1, ...)` to prevent division by zero. However if the current time is before 8AM (openHour), `now.getHours() + now.getMinutes() / 60 - openHour` is negative, and `Math.max(1, negative)` returns 1, silently making the flow rate equal to `completedCount`. This produces a wildly inflated rate before opening hours. Fix: also clamp to 0 before the `Math.max(1,...)` call, or skip the computation when `now.getHours() < openHour`.
6. `labStatusDistribution` hardcodes hex colors `#2E7D32` and `#FF9800` inline at line 1298–1300 inside `clinical` useMemo. `#D32F2F` correctly uses COLORS.danger but the other two should use COLORS.success and COLORS.warning respectively. These hex values happen to match CHART_COLORS[1] and the expense orange but are not tokenized.

### LOW
7. `vaccineQueueDocs` one-shot useEffect (line 710–714): no AbortController or cleanup possible for getDocs (which is fine — getDocs is not cancellable), but the effect has no error state — the catch only console.errors. This is consistent with the rest of the hook's non-fatal error handling pattern, so it's acceptable but worth noting.
8. `newPetsCount` filter in growth useMemo (lines 855–859): compares `created >= dateRange.startDate` using plain Date objects. This works because `dateRange.startDate` is also a plain Date, but the pattern differs from every other date comparison in the file which uses Firestore Timestamps. Not broken but inconsistent.
9. `fontWeight: 1000` used in TodayTab line 371 (Operational Intelligence section header) and AnalyticsTab SectionHeader line 59. Per the design sweep memory, `fontWeight: 1000` was flagged across Settings.jsx — this pattern is now present here too. Should use a TYPE token or 900.

## All Checklist Items
- vaccineQueueDocs: getDocs (one-shot) PASS
- No alert()/confirm()/prompt(): PASS
- Hooks rules (no conditional hooks): PASS
- useMemo deps complete: PASS (clinical line 1442 correctly omits vaccineQueueDocs)
- ComposedChart imports (Area, Line, ComposedChart): PASS
- Empty data guards on all charts: PASS
- ResponsiveContainer used on all charts: PASS
- PANEL_SX applied from chartConfig: PASS (AnalyticsTab, FinancialTab)
- Design tokens (no rogue hex except data-viz palette): WARNING (#2E7D32, #FF9800 in labStatusDistribution)
- borderRadius: 0 on Chips, Bars: PASS
- Sparkline wiring: PASS (optional chaining on growth?.clientTrend, financial?.revenueTrend)
- No N+1 queries: PASS (vaccine queue is a single getDocs collection scan)
