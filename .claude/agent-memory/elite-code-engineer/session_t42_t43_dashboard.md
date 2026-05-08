---
name: T4.2 + T4.3 Dashboard S-Tier Session
description: T4.3 YoY benchmarking and T4.2 draggable KPI layout — react-grid-layout v2 exports ResponsiveGridLayout directly, no WidthProvider needed
type: project
---

T4.3 (YoY Benchmarking) and T4.2 (Draggable KPI Layout) implemented for Dashboard.

**Why:** Phase 4 S-tier push to complete Dashboard feature set.

**How to apply:** Both features are live. Key implementation notes:

- react-grid-layout v2 exports `ResponsiveGridLayout` as a single pre-composed named export. `WidthProvider` is NOT exported — importing it causes a build failure. Use `import { ResponsiveGridLayout } from 'react-grid-layout'` directly.
- `useDashboardData` final signature: `useDashboardData(period, refreshKey, benchmarkEnabled)` — all three params now wired in Dashboard.jsx.
- New files: `defaultLayouts.js`, `useDashboardPreferences.js`, `DraggableKPIGrid.jsx`.
- All 4 tab components now accept `yearAgoDeltas`, `layout`, `onLayoutChange` props.
- KPICard now accepts `yearAgoDelta` prop (shows "YoY +X%" in blue/red below the period delta).
- KPICard title area is the drag handle (`className="kpi-drag-handle"`); DragIndicatorIcon fades in on hover.
- Chart panels (recharts) are NOT inside DraggableKPIGrid — only KPICards are draggable.
- Layout stored in `users/{uid}.dashboardPreferences.layouts` with merge:true writes.
- YoY data fetched via 4 parallel getDocs when benchmarkEnabled=true; reset to empty on disable.
