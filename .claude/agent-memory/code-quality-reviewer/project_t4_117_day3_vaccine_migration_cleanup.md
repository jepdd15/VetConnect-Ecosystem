---
name: T4.117 Day 3 — Vaccine Migration Button + vaccineConstants Cleanup
description: Review findings for Settings.jsx migration button (Step 3.1) and vaccineConstants.js cleanup (Step 3.3); Day 1-2 consumer verification
type: project
---

## Findings: T4.117 Day 3 (Settings.jsx + vaccineConstants.js)

**All 23 checklist items PASS** with two warnings:

### PASS items confirmed:
1. migrationDialogOpen + isMigrating + vaccinesMigrated state — all present (lines 148, 155, 156)
2. vaccine_catalog onSnapshot reads migratedToInventory flag — line 285
3. Pillar 9 conditional: post-migration shows "Migrated" message + link, pre-migration shows CRUD + migrate button — lines 1877-2168
4. handleMigrateVaccines: writeBatch creates inventory products with price:0, stock:0, vaccineConfig — lines 729-746
5. Migration writes migratedToInventory: true on vaccine_catalog doc — line 750
6. Audit logging to settings_logs via logSettingsEvent — lines 754-756
7. Confirmation Dialog with count, explanation, irreversibility warning — lines 3674-3727
8. Success toast instructs to set prices and stock — lines 759-763
9. borderRadius: 0 on Dialog PaperProps + both buttons — lines 3680, 3708, 3718
10. buildVaccineKeywords DELETED from vaccineConstants.js — confirmed absent
11. VACCINE_KEYWORDS DELETED — confirmed absent
12. VACCINE_CATALOG re-export DELETED — confirmed absent
13. DEFAULT_VACCINE_CATALOG KEPT in vaccineConstants.js — line 17
14. resolveVaccineFromName KEPT — line 36
15. getVaccineAdministrations KEPT — line 58
16. ZERO remaining imports of deleted exports across entire src/ — grep confirms clean
17. ClinicalWorkspace: no import of buildVaccineKeywords — comment left as tombstone, not import
18. useVaccineCatalog: reads from inventory collection — confirmed
19. ProductFormModal: vaccineConfig section renders for vaccine category — confirmed
20. SoapGrid: Autocomplete replaces toggle button — confirmed with borderRadius:0
21. ZERO alert()/prompt()/confirm() in new code — confirmed
22. All borderRadius: 0 — confirmed on dialog and buttons
23. No unused imports — Settings imports MoveToInboxIcon, VaccinesIcon, writeBatch all used

### Warnings (non-blocking):
- **migratedAt + migratedBy omitted from batch.update**: Plan spec says to write `{ migratedToInventory: true, migratedAt: Timestamp.now(), migratedBy: who }`. Actual implementation only writes `{ migratedToInventory: true }`. The audit trail for who/when the migration happened is missing from Firestore. logSettingsEvent call does capture this, so it's in settings_logs but not on the vaccine_catalog doc itself.
- **vaccinesMigrated not set optimistically**: Handler doesn't call setVaccinesMigrated(true) after commit — relies on the onSnapshot listener to update it. Between commit() resolving and the listener firing, the migrate button briefly remains visible. Not a double-submit risk (dialog closes first), but deviates from the plan spec. Low risk in practice.

### Settings imports:
- Settings.jsx imports DEFAULT_VACCINE_CATALOG from useVaccineCatalog (not vaccineConstants) — correct per Step 3.5 plan
- Settings.jsx has zero imports from vaccineConstants — correct

### Post-migration link:
- Uses MUI Button with `href="/inventory"` prop (not window.location.href) — correct React Router compatible pattern
