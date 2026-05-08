---
name: T4.182 Day 3 — Dashboard Complete Redesign
description: generateInsight 5 new rules, drillDownConfig 15 new KPI mappings, generateReportHTML performance tab, useForensicReportData funnel+utilization, PerformanceTab
type: project
---

T4.182 Day 3 review findings (generateInsight, drillDownConfig, generateReportHTML, useForensicReportData, PerformanceTab).

**Critical issues (2):**
1. `buildPerformanceReport` in generateReportHTML.js accesses `data.performanceData` but `useDashboardData` never returns that key — the Performance section in both single-tab export and generateFullReportHTML always renders the "not available" fallback message. The Dashboard passes `data` directly (from useDashboardData) to both export functions with no `performanceData` field added.
2. `generateFullReportHTML` includes the Performance section for ALL users regardless of `isAdmin` — the existing `isAdmin` parameter is accepted but never used to gate the Performance section (Financial is also ungated in Day 3). The original design intent (jsdoc says "for admins — Financial") has been bypassed.

**Warnings (2):**
1. `useForensicReportData` `staffUtilization` uses `totalAvailableHours = operatingHours * workingDayCount` without accounting for how many vets are on staff — all vets are benchmarked against the same single-vet hours budget. A 3-vet clinic will show 300% aggregate utilization vs the available pool. The denominator should multiply by active vet count (or be clearly labeled as "per-vet available hours").
2. Day 2 files were touched (FinancialTab.jsx and useDashboardData.js) — confirmed via git diff. These are substantive changes (DraggableKPIGrid removed, revenueTrend Area+Line chart added, vaccineQueueDocs fetch added), not just line-ending noise.

**Advisories (2):**
1. Rule 32 (analytics-noshow-weekday) targets `'NO-SHOW RATE'` which is a new Day 2 KPICard title but was not verified to match the exact title string used in AnalyticsTab. If the card title is slightly different (e.g., "NO SHOW RATE" without hyphen), the insight silently never attaches.
2. `extractBody` in `buildPerformanceReport` falls back to the full HTML string if no `<body>` tags are found. `generateForensicReportHTML` always produces a full document, so this path is fine in practice — but if the forensic generator is ever refactored to return a fragment, CSS from the inner document's `<style>` block would bleed through.

**All other checks PASS:** insight rule null-safety (try/catch), no division by zero in funnel (totalDocs > 0 guards), utilization 100-clamp present, workingDays array format matches codebase pattern, drillDown routes all valid (/patients /records /sales /queue /expenses), no alert/confirm/prompt, no hardcoded hex, no borderRadius violations, FONT/TYPE/COLORS used throughout, generateForensicReportHTML exists and accepts the expected signature.

**Why:** The `performanceData` gap means the Performance report export is silently broken on first ship. The isAdmin gap means staff users can export Financial data in the full report.
**How to apply:** Flag both CRITICAL items for immediate fix before merging. The staffUtilization denominator clarification is a WARNING worth fixing before the feature ships to avoid misleading KPI values.
