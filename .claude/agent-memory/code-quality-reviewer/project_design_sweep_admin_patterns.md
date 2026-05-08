---
name: Admin Design Sweep — Review Findings
description: T2.443-T2.449: borderRadius/fontWeight/hex token sweep across 41 files. Remaining issues and confirmed compliant areas.
type: project
---

Post-sweep spot-check (2026-04-25). Review covered 7 task groups across Sales, Sidebar, POSModal, Staff, Services, Patients, Inventory, Settings, Expenses.

## Confirmed PASS

- **Sales/Sales.jsx (T2.446)**: All UI hex tokenized. Raw hex exists only inside `handlePrintReport`/`handleReprint` inline HTML strings — correctly kept per plan. COLORS tokens used throughout for all rendered UI.
- **Sidebar.jsx (T2.449)**: No borderRadius > 0, no raw hex. Import hygiene correct.
- **Staff module (T2.447)**: All 4 JSX files use COLORS/FONT imports. No remaining raw hex outside `#616161` (keep-as-is). No fontWeight 1000.
- **Services module (T2.444)**: All files token-compliant. `#424242` and `#F57C00` in ServiceTable.jsx are keep-as-is per plan. No fontWeight 1000 remaining.
- **Inventory module (T2.445)**: All 7 JSX files import `{ FONT, COLORS }`. No remaining raw hex outside `#9E9E9E` (ProductFormModal margin label — keep-as-is). No fontWeight 1000. T2.169 absorbed.
- **Expenses.jsx (T2.448)**: No raw hex. `#0D47A1` is keep-as-is per plan.
- **T2.453a (PatientDashboard #E65100)**: Confirmed replaced with `COLORS.warning` throughout.
- **T2.148a (POSModal token sweep)**: Absorbed. UI hex tokenized; `#90CAF9` (barcode field border) is a light blue one-off not in the token table — tolerable minor gap.
- **T2.205a/b/c (Services absorptions)**: Absorbed. No raw hex remaining outside keep-as-is.

## Issues Found

### 1. Settings.jsx — fontWeight "1000" not fully replaced (T2.448) — ISSUE
Lines 593, 745, 765, 786, 897: `fontWeight: "1000"` still present on 5 Typography components.
Fix: replace with `fontWeight: 900` on all 5.

### 2. ClientDetails.jsx — borderRadius: 1 on MuiOutlinedInput root (T2.443) — ISSUE
Line 26: `'& .MuiOutlinedInput-root': { borderRadius: 1, ... }` — this is a React component container, not a MUI internal chip/avatar. Should be `borderRadius: 0`.

### 3. PatientDashboard.jsx — borderRadius: 2 on decorative timeline stripe (T2.443) — LOW SEVERITY ISSUE
Line 911: `<Box sx={{ width: 3, height: 24, borderRadius: 2, ... }}` — a narrow colored vertical bar used as a visual separator in the timeline. The `borderRadius: 2` rounds the ends of this pill shape. Strict neubrutalism rule says 0; however this is a 3px-wide decorative element, not a card/container/button. In prior sessions assessment green was kept hardcoded intentionally — same judgment call applies here (purely ornamental). Record as a soft warning.
Also line 913: `borderRadius: 0.5` on a record-type badge — same situation.
Lines 798, 832: `borderRadius: '50%'` on 7–8px status dots — these are circular dots, analogous to Avatar (keep-as-is category).

### 4. PatientDashboard.jsx — #7B1FA2 not tokenized for BCS vital chart (T2.443) — MINOR
Lines 1224 and 1235: Body Condition Score chart uses raw `'#7B1FA2'` for the icon and line stroke. Token equivalent is `COLORS.grooming`. All other vital chart colors (#EF6C00, #E53935, #0288D1, #00838F, #D84315) are chart-specific data-viz colors without matching tokens — kept as-is per plan. The `#7B1FA2` case is inconsistent since a token exists. Low risk.

### 5. Settings.jsx — MedicinePillSwitch hex correctly kept
Lines 63-91 (MedicinePillSwitch styled component): `#fff`, `#D32F2F20`, `#D32F2F`, `#9E9E9E`, `#E0E0E0`, `#00000010` — these are all inside the styled pill toggle component. Per plan these are intentional keep-as-is. `borderRadius: 20` on switch track and `borderRadius: '50%'` on thumb are also correctly kept.

### 6. Settings.jsx — CLINIC_COLORS data array hex is correctly kept
Lines 39-53: Array of `{ label, value: '#...' }` entries — these are user-selectable color options passed as data values, not rendered CSS. Correctly not tokenized.

**Why:** Knowing these are data values (not sx props) prevents future reviewers from flagging them as violations.

## Token Accuracy Check (spot-checks all passed)
- `#5D4037` → `COLORS.accent` (verified in Inventory.jsx, Staff.jsx, Settings.jsx)
- `#3E2723` → `COLORS.brand` (verified in Inventory.jsx)
- `#D32F2F` → `COLORS.danger` (verified in Settings, Inventory, Staff)
- `#E65100` → `COLORS.warning` (verified in PatientDashboard, NewClientModal)
- `#D84315` → `COLORS.cta` and `#BF360C` → `COLORS.ctaHover` (verified in Inventory.jsx)
- No brand/accent transpositions found.
