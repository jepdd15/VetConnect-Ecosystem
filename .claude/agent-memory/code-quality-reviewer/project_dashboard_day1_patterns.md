---
name: Dashboard Day 1 — Reviewed Patterns & Known Issues
description: T2.315-T2.318, T2.228-T2.288, T2.272, T2.279: useDashboardData hook + 5 components + Dashboard.jsx reviewed. Key findings: activeTab index desync for non-admins (WARNING), scheduledDate missing duck-type guard (WARNING), purple KPI hardcoded hex, FONT missing from TYPE.tiny in HorizontalBar plan-vs-code minor delta.
type: project
---

Dashboard Day 1 (7 files, 14 tasks) reviewed 2026-04-23.

**Why:** Day 1 of S-tier Dashboard implementation. Infrastructure + Operations tab.

**Key findings:**

- WARNING: `activeTab` initialized to `opsIndex` but `opsIndex` is computed before state is set — works correctly on first render. However, there is a subtle desync risk: if `isAdmin` flips after mount (auth race), `visibleTabs` changes length but `activeTab` remains at its initial index. The `currentTab = visibleTabs[activeTab] || visibleTabs[0]` fallback catches the crash but the selected tab index shown in the Tabs indicator will be wrong. Low risk in practice because `isAdmin` settles before the component renders (UserContext loading gate in App.jsx).

- WARNING: `scheduledDate` field is NOT duck-typed in the appointments listener. The query uses `Timestamp.fromDate()` correctly but the raw docs stored in state may have `scheduledDate` as a plain string in legacy data. The `useMemo` ops block never reads `scheduledDate` directly (only `timeArrived`, `timeStarted`, `timeCompleted` — all duck-typed correctly), so this is low-risk but inconsistent with the project's defensive pattern.

- SUGGESTION: `KPICard` purple variant uses hardcoded `'#6A1B9A'` for text color (not in designTokens.js). Acceptable as a one-off since there is no `kpiPurpleText` token defined.

- SUGGESTION: `HorizontalBar` label segment text color is hardcoded `'#fff'` (white on any segment color). Acceptable as a data-viz choice.

- PASS: All 3 onSnapshot listeners have cleanup (return unsub pattern). Queue listener correctly skips when period !== 'today' and returns undefined (no cleanup needed — no listener opened).

- PASS: All ops useMemo timestamp fields use duck-typing correctly (timeArrived, timeStarted, timeCompleted).

- PASS: ops useMemo returns null when period !== 'today'.

- PASS: loading starts true, flips false on first snapshot.

- PASS: Grid uses MUI v2 `size={{ xs: 12 }}` API throughout all files.

- PASS: Skeleton has `borderRadius: 0`.

- PASS: Chip uses `onClick` (not onPress). `disabled` prop passed correctly.

- PASS: Financial tab filtered from visibleTabs for non-admins. QuickNavTiles Sales/Expenses gated via adminOnly filter.

- PASS: Tab switching resets period via handleTabChange.

- PASS: effectivePeriod overrides to 'today' when currentTab.key === 'ops'.

- PASS: All 5 OperationsTab visual rows render real computed data (no stubs/placeholders).

- PASS: HorizontalBar uses proportional `${pct}%` widths.

- PASS: KPICard subtitle wired to computed values (throughputPct, currentWaitingCount, consultCount, queueData).

- PASS: QuickNavTiles navigate() paths match App.jsx routes (/queue, /patients, /inventory, /sales, /expenses).

- PASS: activeTab initialized via findIndex('ops') — adapts correctly for non-admin (ops is still index 1 after filtering, growth is 0).

**How to apply:** When extending useDashboardData for Days 2-6, continue duck-typing all timestamp reads. The activeTab desync risk is acceptable given the loading gate — do not over-engineer it.
