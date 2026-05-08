---
name: T4.182 Day 1 — Dashboard Complete Redesign
description: TODAY/ANALYTICS/FINANCIAL/PERFORMANCE tabs, drag-drop removed, Reports absorbed; key findings from Day 1 review
type: project
---

T4.182 Day 1 ships 4-tab Dashboard redesign (TODAY|ANALYTICS|FINANCIAL|PERFORMANCE), removes DraggableKPIGrid, absorbs standalone Reports page into PERFORMANCE tab.

**Key findings:**
- CRITICAL: AnalyticsTab has useMemo (apptAnnotation, line 87-90) placed BEFORE the `if (!growth || !clinical) return null` guard (line 92) — this is a rules-of-hooks violation because hooks must not appear before conditional returns.
- MEDIUM: FinancialTab `visibleTabs = TAB_CONFIG` (Dashboard.jsx line 83) — the `adminOnly` guard on the Financial tab from the original TAB_CONFIG was removed. Financial data is now visible to all staff roles, not just admins. isAdmin is imported but only used for `generateFullReportHTML`.
- LOW: `generateFromDates` is in the PerformanceTab useEffect dependency array (line 97) — the function is stable (useCallback with no deps), so this is safe but lint will warn.
- ADVISORY: STATUS_COLORS in TodayTab and data-viz color maps in FinancialTab use hardcoded hex by design (data-visualization palettes intentionally distinct from design tokens). Comment justification is present in TodayTab.
- ADVISORY: `#BDBDBD` (belowAvg bar fill) and `#fff` (white text on bar) appear in AnalyticsTab and FinancialTab — these are chart-specific, not UI chrome.
- PASS: All 9 Reports sub-components exist and are imported correctly by PerformanceTab.
- PASS: No alert()/confirm()/prompt() found.
- PASS: MUI v7 Grid `size={{ xs, sm, md }}` pattern used throughout.
- PASS: No dead imports for DraggableKPIGrid, useDashboardPreferences, GrowthTab, ClinicalTab.
- PASS: /reports route correctly removed from App.jsx.
- PASS: generateFromDates wrapper correctly converts Date objects to en-CA Manila strings.
- PASS: Sparkline in KPICard correctly guards with `sparkline.length > 1`.

**Why:** Review commissioned for T4.182 Day 1 implementation.
**How to apply:** The useMemo-before-return is a hooks rules violation that must be fixed before Day 2.
