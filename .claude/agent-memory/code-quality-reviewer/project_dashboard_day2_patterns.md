---
name: Dashboard Day 2 — Reviewed Patterns & Known Issues
description: T2.280-T2.314, T2.230-T2.306, T2.270: GrowthTab, FinancialTab, useDashboardData extension — one retention denominator bug, otherwise clean
type: project
---

Dashboard Day 2 review complete (2026-04-23). 7 listeners, 2 computed useMemo blocks, 2 new tab components.

## Verdict: Needs Minor Fixes (1 WARNING, 2 SUGGESTIONS)

### WARNING — Retention denominator includes walk-ins (useDashboardData.js ~line 533)
`periodOwnerIds` is built from ALL appointments including walk-ins (WALK_IN_USER, GUEST_*). Walk-ins are excluded from the numerator (returningClients) but not the denominator, so the retention rate is artificially low. Fix: filter walk-in ownerIds out of `periodOwnerIds` before computing the Set.

### SUGGESTION — overlayData merge in FinancialTab.jsx (~line 89) loses chronological order
`Object.values(merged)` after merging revenueTrend + expenseTrend buckets is not sorted. If expense-only buckets exist, they insert at the end, breaking the chart x-axis order. Fix: sort by revenue-trend index after merging.

### SUGGESTION — Chart style constants duplicated across GrowthTab.jsx and FinancialTab.jsx
CHART_TICK_STYLE, CHART_TOOLTIP_STYLE, CHART_GRID constants copy-pasted. Extract to shared chartConfig.js before Day 3 (Clinical tab) adds a third copy.

## PASS items
- All 7 listeners return cleanup. Period-scoped listeners (1,4,6,7) depend on [dateRange]. Period-independent (3,4b,5) use [].
- buildTrend and buildFinancialTrend both implement sortKeys timestamp-based sort (Risk Assessment fix applied correctly).
- totalCollected excludes refunded/voided. netMargin = collected - expenses (not billed - expenses).
- Walk-in detection uses all 5 conditions: isWalkIn, WALK_IN_USER, GUEST_, ticketPrefix W, ticketPrefix E.
- All Bar elements radius={0}. CartesianGrid strokeDasharray + vertical=false. Tooltip contentStyle borderRadius:0. All charts in ResponsiveContainer.
- Token imports confirmed. panelSx uses COLORS.cardBg, COLORS.accent, COLORS.brand.
- FinancialTab has no role gate — gated in Dashboard.jsx via visibleTabs filter only. Correct.
- overlayData ComposedChart renders both Bar (revenue) and Line (expense) on the same chart instance.
- All 23 task acceptance checks pass. No hardcoded stub values in any KPICard or chart data prop.

**Why:** Record for future sessions to avoid re-auditing Day 2 files.
**How to apply:** When reviewing Day 3 (Clinical tab), apply the overlayData sort pattern proactively and assume chartConfig.js extraction is still pending.
