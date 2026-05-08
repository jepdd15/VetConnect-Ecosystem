---
name: T4.113 Mobile Vitals Trend Charts S-Push — Review Findings
description: speciesVitalRanges, chartHelpers, SparkLine, VitalsZoomModal, PetHistoryScreen: all 32 checklist items PASS; dead vitalKey prop in VitalsZoomModal (WARN); null-return-while-visible edge case (low-risk WARN)
type: project
---

T4.113 reviewed 2026-04-30. All 32 acceptance checklist items PASS.

**Why:** Mobile vitals trends expanded from 3 to 7 vitals with species reference bands, date labels, delta annotations, 1-point graceful degradation, and a tap-to-expand zoom modal.

**How to apply:** Two open issues to address in a follow-up or same commit:

1. `vitalKey` prop in VitalsZoomModal is destructured but never read inside the component body (dead prop surface). Remove from props + call site, or assign a purpose.

2. VitalsZoomModal returns `null` when `validPoints.length === 0`, but it does so while `visible` is still `true`. In normal use this path is unreachable (trendRow guard ensures `chartData.length >= 1` before opening), but if data clears mid-open an Android blank-flash can occur. Defensive: add `if (!visible) return null` as the first line before the validPoints filter.

**Architecture notes confirmed:**
- `chartHelpers.js` correctly extracts `clamp` + `valueToY` shared by both SparkLine and VitalsZoomModal — no duplication.
- `speciesVitalRanges.js` covers temp/hr/rr/crt/bcs only (weight/pain correctly excluded).
- `VITALS_CONFIG` module-level constant in PetHistoryScreen drives both the trendRow map and the zoom modal prop derivation — correct pattern.
- `listHeader` useMemo deps are correct: `setVitalsZoom` (stable setter) used inside but not listed; `vitalsZoom` itself not read inside memo.
- Hardcoded hex values in VITALS_CONFIG (`#7B1FA2`, `#00838F`, `#EF6C00`) and VitalsZoomModal (`#D7CCC8`, `#4CAF50`, `#E0E0E0`) are intentional — no mobileToken equivalents for these semantic chart colors.
