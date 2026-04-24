---
name: Dashboard Day 3 — Reviewed Patterns & Known Issues
description: T2.316b, T2.289-T2.297, T2.320, T2.321: chart extraction, ClinicalTab, delta system, KPICard extension
type: project
---

Day 3 adds ClinicalTab (9 metrics), chartConfig extraction, period-over-period delta system, and KPICard delta/insight props.

**Why:** Completing the clinical analytics tab and adding trend comparison (S-tier dashboard feature).

**How to apply:** Flag the two incomplete-extraction warnings if Day 4 work touches these files.

## Findings

### WARNING: PANEL_SX extraction incomplete in GrowthTab and FinancialTab
- GrowthTab.jsx lines 63-70 and FinancialTab.jsx lines 65-72 both define `const panelSx = { ... }` locally.
- This is byte-for-byte identical to the exported `PANEL_SX` in chartConfig.js.
- ClinicalTab correctly uses `PANEL_SX` from chartConfig; the older two tabs were not updated.
- Fix: replace local `panelSx` with imported `PANEL_SX` in both files.

### WARNING: week delta is systematically biased mid-week
- `buildDateRange('week')` = rolling 7 days ending NOW (partial).
- `buildPrevDateRange('week')` = complete 7 days ending yesterday.
- Comparing in-progress current week against complete prior week always shows down-delta mid-week.
- Same structural bias applies to `quarter` and `year` (rolling current vs complete prior).
- Acceptable known limitation for Day 3; document in comments; proper fix in Day 4+ if needed.

### PASS: All 9 clinical metrics use real computed data (no stubs)
- recordsSigned, topDiagnoses, vaccinesByType (dual-path legacy support), topPrescribed, followUpComplianceRate (Math.min(100,...) capped), speciesVisitDistribution, confinementRate, recordsPerVet, avgVitalsBySpecies all compute from live Firestore state.
- avgVitalsBySpecies correctly cross-references appointments array via appointmentId for petSpecies.

### PASS: Listener 8 has correct cleanup
- medical_records onSnapshot at lines 411-428 returns `unsub` as cleanup.
- getDocs prevData effect does NOT return cleanup (correct — one-shot, no cleanup needed).
- Total: 9 onSnapshot listeners (plan said 8 — Listener 4b is period-independent but still real-time).

### PASS: pctChange returns null when prev is zero
- Line 944-946: `if (prev === 0 || prev == null) return null`. Clean, no Infinity/NaN.

### PASS: Delta system uses Promise.all (parallel, not sequential)
- Line 438: all 4 getDocs queries inside Promise.all.

### PASS: KPICard backward compatible
- delta and insight are both undefined when not passed; guard conditions handle correctly.

### SUGGESTION: fontWeight: 1000 out of CSS spec (clamps to 900)
- KPICard.jsx line 97. Pre-existing, renders correctly. Not introduced in Day 3.

### SUGGESTION: Vertical bar charts correctly inline CartesianGrid (not spread CHART_GRID_PROPS)
- ClinicalTab diagnoses and vaccine charts need horizontal={false} vertical — opposite of CHART_GRID_PROPS default. Inline definition is architecturally correct for vertical layout charts.
