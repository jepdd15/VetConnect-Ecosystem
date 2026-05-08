---
name: Admin Design Sweep Plan
description: 7-task admin design sweep plan -- 441 hex, 53 borderRadius, 88 fontWeight:1000 across 41 files in 7 tasks
type: project
---

Admin Design Sweep plan produced (DESIGN_SWEEP_ADMIN_PLAN.md). 7 tasks, 41 files, ~8 hrs estimated.

**Why:** Unify all admin module styling under designTokens.js -- hex values, borderRadius: 0 neubrutalism, fontWeight 900 compliance.

**How to apply:** Execute tasks in order T2.446 (Sales, 20m) -> T2.449 (Shared, 30m) -> T2.447 (Staff, 30m) -> T2.444 (Services, 45m) -> T2.443 (Patients, 2.5h) -> T2.445 (Inventory, 2h) -> T2.448 (Standalone, 1.5h). Absorbs 6 deferred sub-tasks: T2.148a, T2.169, T2.205a/b/c, T2.453a.

Key finding: Inventory module (187 hex) and PatientDashboard (78 hex, 23 borderRadius) are the two heaviest files. Monitor.jsx and Login.jsx are already fully compliant. EodSummary.jsx and useSalesData.js are already fully tokenized.
