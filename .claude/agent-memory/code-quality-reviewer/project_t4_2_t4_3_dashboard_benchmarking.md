---
name: T4.2 + T4.3 Dashboard Benchmarking — Review Findings
description: T4.2 draggable KPI layout + T4.3 YoY benchmarking: onLayoutChange receives (layout, layouts) but saves only layout; GrowthTab/FinancialTab useMemo-before-early-return (pre-existing pattern); month/quarter endDate is mid-period in buildYearAgoRange; VACCINATIONS card uses recordsSigned YoY key; inline style tag deduplication caveat
type: project
---

T4.2 and T4.3 reviewed and mostly PASS. Three issues found:

**WARN — onLayoutChange saves the current-breakpoint layout, not the full layouts object**
`DraggableKPIGrid` passes `newLayout` (single breakpoint array) to `onLayoutChange`. The `ResponsiveGridLayout.onLayoutChange` fires with `(layout, layouts)` where `layouts` is the full breakpoints object. Dashboard.jsx calls `saveLayout('growth', newLayout)` passing only the single-breakpoint slice. On restore, the saved single-breakpoint array is used for all three breakpoints (`lg: layout, md: layout, sm: layout`) — functionally OK but semantically sloppy; no data is lost.

**WARN — GrowthTab `newClients` and `totalAppointments` both use `yearAgoDeltas.appointments` as YoY delta**
`newClients` card uses `yearAgoDeltas?.appointments` rather than a client-count delta. yearAgoDeltas does not include a `newClients` key — the hook only returns appointments/revenue/expenses/netMargin/recordsSigned. This means "New Clients" YoY shows appointment growth, not client registration growth.

**WARN — ClinicalTab `vaccinations` card uses `yearAgoDeltas?.recordsSigned` as YoY delta**
There is no vaccine-specific YoY key. This makes the vaccinations card show record-count YoY, not vaccination count YoY.

**SUGGESTION — month/quarter endDate in buildYearAgoRange is mid-period**
For 'month', endDate is endOfDay(oneYearAgo) — today's date minus one year, not end of that full calendar month. This is intentional (apples-to-apples with the current partial month) and matches the buildDateRange behavior. Not a bug, but worth noting.

**SUGGESTION — useMemo-before-early-return in GrowthTab and FinancialTab**
Pre-existing pattern (flagged in Day 6 review). The useMemo calls at lines 56-58 in GrowthTab and 81-104 in FinancialTab run before `if (!growth) return null` and `if (!financial) return null`. Technically violates hooks ordering rules if growth/financial is undefined during initial render — but in practice both are always computed before the component renders.

**PASS — react-grid-layout v2 ResponsiveGridLayout named export is valid**
Confirmed in dist/index.mjs. The import `{ ResponsiveGridLayout } from 'react-grid-layout'` is correct for v2.

**PASS — inline style deduplication comment is incorrect**
React does NOT deduplicate identical `<style>` tags — the comment on line 61 of DraggableKPIGrid.jsx is misleading. However, since each DraggableKPIGrid mounts once per tab render and the CSS is scoped to `.dashboard-kpi-grid`, there is no functional problem. A single `<style>` in index.html or a CSS module would be cleaner.

**PASS — All checklist items otherwise verified:**
- buildYearAgoRange covers all 8 period modes
- yearAgoDeltas returns null when benchmarkEnabled=false
- pctChange handles division by zero (returns null)
- yearAgoDeltas in return object
- 4 parallel getDocs in year-ago fetch
- sales filtered (refunded/voided excluded), expenses filtered (deletedAt)
- VS LAST YEAR chip uses design tokens (COLORS.info, COLORS.kpiBlueBg, COLORS.cardBg, COLORS.border), borderRadius: 0
- Layout keys in defaultLayouts.js match div keys in tab components
- 12-column grid, reasonable w/h values
- useDashboardPreferences: onSnapshot on users/{uid}, listener cleaned up, saveLayout uses setDoc merge:true, resetLayouts writes defaults, useUser for uid
- DraggableKPIGrid: isDraggable, isResizable=false, draggableHandle=".kpi-drag-handle", CSS overrides zero borderRadius
- Hexes in CSS overrides exempt (documented)
- No console.log, no alert/confirm/prompt in new code
- All 4 tabs accept yearAgoDeltas/layout/onLayoutChange
- Chart panels NOT inside DraggableKPIGrid
- react-grid-layout in package.json (^2.2.3), react-resizable in lock file
