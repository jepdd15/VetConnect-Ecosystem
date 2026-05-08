---
name: T3.98 Terminology Rename — Review Findings
description: rxCart→treatmentCart, prescriptions→dispensedProducts, prescribedItems→encounterItems, prescribedItemsVersion→encounterItemsVersion across 11 files
type: project
---

All 11 files reviewed. Zero old WRITE sites remain. All dual-read fallbacks confirmed. PetHistoryScreen Option A (local property name kept) confirmed correct. One pre-existing alert() in PetHistoryScreen generatePDF was not introduced by this PR.

**Why:** Pure rename PR with zero logic changes. Backward compat maintained via dual-read on all READ paths.
**How to apply:** Any future reads from appointments must use `encounterItems || prescribedItems` and `encounterItemsVersion || prescribedItemsVersion`. Any future reads from medical_records must use `dispensedProducts || prescriptions`.
