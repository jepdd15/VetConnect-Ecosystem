---
name: T4.142 3-Tier Product Classification Patterns
description: Dual-write/dual-read conventions, write site coverage, and a rename+reclassify bug in InventoryCategoryManager.handleEditCategory
type: project
---

3-tier system: medicine / medical_supply / retail. Both `productClass` (string) and `isMedicine` (bool) must be co-written on every write site.

**Dual-read fallback pattern** used at every read site except one:
`productClass || (isMedicine ? 'medicine' : 'retail')`
The exception is `resolvedProductClass` in ProductFormModal (line 85), which uses `?.productClass || 'retail'`.
This is safe in practice because Inventory.jsx category listener normalizes productClass before passing it as props.

**Known bug (simultaneous rename + reclassify in handleEditCategory):**
When a user renames a category AND changes its productClass at the same time (non-default categories), the second getDocs query (line 200) uses the NEW name as the filter, but inventory items still have the OLD name. The productClass batch-update on those inventory items is silently skipped.
Fix: use `oldName` for the productClass query when a rename is also in progress.

**Write site coverage — all 5 sites PASS:**
- ProductFormModal.handleQuickAddCategory: both isMedicine + productClass written
- Inventory.jsx.handleSaveForm: enrichedData sets both fields
- InventoryCategoryManager.handleAddCategory: both fields written
- InventoryCategoryManager.handleEditCategory: both fields on category doc; both fields on inventory items (with per-item override guard)
- Drug migration: category + productClass + isMedicine all written

**isMedicineOverride:** State and Switch fully removed from ProductFormModal. Stale comment remains at line 151 (harmless). Inventory.jsx has a defensive `delete enrichedData.isMedicineOverride` at line 265 (correct cleanup).

**Why:** T4.142 established the 3-tier system to replace the old boolean isMedicine approach.
**How to apply:** When reviewing future inventory writes, check both fields. When reviewing category renames with class changes, verify which name is used for the inventory query.
