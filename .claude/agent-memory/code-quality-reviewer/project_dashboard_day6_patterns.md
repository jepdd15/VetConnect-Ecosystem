---
name: Dashboard Day 6 — Reviewed Patterns & Known Issues
description: T2.331/T2.332/T2.336-T2.341: useMemo-after-early-return in GrowthTab+FinancialTab, AlertStrip unused Typography import, annotateChartData all-zeros edge case, dirty-tracking gap for new Settings fields
type: project
---

Rules-of-Hooks violation confirmed in GrowthTab.jsx (line 87) and FinancialTab.jsx (line 89): `React.useMemo` is called AFTER `if (!growth/financial) return null`. This violates the Rules of Hooks — hooks must not be called conditionally. Fix: move the `if (!x) return null` guards to AFTER all hooks, or restructure using a wrapper component pattern.

AlertStrip.jsx imports `Typography` from MUI but never renders a Typography element in JSX — unused import.

annotateChartData all-zeros edge case: when all values are 0, `minVal` stays `Infinity` (no `v>0`), `maxVal=0`. `maxVal===minVal` is false (0!==Infinity), so the function falls through to annotation + refLines. A refLine at y=0 is generated (sits on x-axis, harmless). The returned `trough` pointer = `annotated[0]` with `annotation: null` — semantically wrong but benign since tab components don't use `peak`/`trough` return values directly.

Settings.jsx dirty-tracking baseline (`lastSavedSettings`) does NOT include `dashboardAlerts` or `dashboardGoals`, so the unsaved-changes detection won't cover these new fields. Low priority — the save flow itself is correct.

AlertStrip thresholds correctly use hardcoded defaults merged with Firestore values (not pure Firestore), so even if the clinic has never configured alerts, sensible defaults apply. This is better than the plan spec which would have been no defaults.

Historical useEffect uses empty dep array [] — fires once on mount only. Confirmed. Period changes do not retrigger it. Error handling is non-fatal (console.error). All three review checks pass.

**Why:** Documented during Day 6 review on 2026-04-24.
**How to apply:** When reviewing future Dashboard or tab-component changes, verify that no hook calls appear after early-return guards. This pattern has now appeared in both GrowthTab and FinancialTab.
