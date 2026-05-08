---
name: T4.113 Mobile Vitals S-Push Plan
description: 6-item plan for PetHistoryScreen vitals enhancements — 7 vitals, species bands, date labels, delta, 1-point, zoom modal
type: project
---

T4.113 plan produced with 6 items across 3 new files + 2 modified files.

**Why:** Pet owner engagement differentiator — interactive vitals trending with species reference ranges is uncommon in vet client apps.

**How to apply:** Plan saved to `PHASE4_MOBILE_VITALS_SPUSH_PLAN.md`. Key architecture decisions: VITALS_CONFIG registry drives both sparklines and zoom modal via `.map()` refactor; chartHelpers.js shares valueToY between SparkLine and VitalsZoomModal; speciesVitalRanges.js mirrors admin SPECIES_VITAL_RANGES.
