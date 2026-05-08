---
name: Reports T3.8 Day 3 — Print Export & Tab Enhancements Review
description: T3.8 Day 3 review findings: by-vet column header mismatch, Blob URL leak, all XSS/design/hook-order checks pass
type: project
---

T3.8 Day 3 — generateForensicReportHTML, Reports.jsx Export button, ConsultPerformanceTab (matrix + q2c), AuditIntegrityTab edge cases, StaffWorkloadTab edge cases.

**Why:** T3.8 is the forensic reporting system; Day 3 adds print export, transition matrix heatmap, queue flow analysis, and empty-state hardening across all three tabs.

**How to apply:** One Warning and one Suggestion. No criticals. Safe to ship after the by-vet column label fix.

Key findings:

1. WARNING — generateForensicReportHTML.js line 132: by-vet table header column 4 is "P90 Consult" but the data cell (line 138) renders `v.avgQueueMins`, not `v.p90ConsultMins`. Either rename the header to "Avg Queue Wait" or switch the data field to `v.p90ConsultMins`.

2. SUGGESTION — Reports.jsx handleExport (lines 152-154): `URL.createObjectURL(blob)` is called in the popup-blocked fallback path but `URL.revokeObjectURL()` is never called. The Blob URL will live until the tab closes. Fix: `const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 10000);` (10 s gives the browser time to start loading it).

All other checks PASS:
- esc() used on all user-derived string content (vetName, dept, service, petName, staffName, transition key, note, reason).
- Numeric values (counts, percentages, durations) are all computed integers or fmtDuration() strings — no XSS risk.
- kpiCard() wraps both label and value through esc(String()).
- No external stylesheets or script tags in generated HTML.
- @media print rules, page-break-before/inside-avoid, fixed footer all present.
- Generation timestamp in footer: present.
- Export button: disabled={!data}, borderRadius: 0, fontWeight: 900 confirmed.
- Popup-blocked fallback via Blob URL: present (minus revokeObjectURL — see above).
- Transition matrix key uses → (U+2192) — matches what useForensicReportData produces at line 276.
- useMemo for matrixRows/matrixCols/matrixMax is called before the isEmpty early return — hooks order correct.
- queueToCompletion defaults to {} so q2c.count access is safe (undefined > 0 is false).
- heatmapCellBg defined after the early return — hoisted by JS function declaration, no bug.
- All three tabs have TabEmptyState with isEmpty guard placed after all hooks.
- StaffWorkloadTab unassigned >20% warning: correctly computed, fires with red vs orange.
- borderRadius: 0 throughout all five files — no violations.
- No non-900/700/800 fontWeight values in Reports.jsx.
