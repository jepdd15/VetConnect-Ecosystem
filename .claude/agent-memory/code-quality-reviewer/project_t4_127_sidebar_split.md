---
name: T4.127 ClinicalWorkspace Sidebar Split — Review Findings
description: T4.127 sidebar split into SERVICES+ITEMS panels: handleToggleServiceProgress drops mid-consult services (CRITICAL), isBase staff-attribution block dead in ITEMS panel (WARN), close icon on isBase services is silent no-op (UX)
type: project
---

ClinicalWorkspace.jsx sidebar split into two panels (SERVICES + ITEMS & MEDICATIONS). ServiceProgressCard.jsx deleted with zero remaining consumers.

**Critical:** `handleToggleServiceProgress` (line 1557) builds `newServices` by mapping `patient.services` (the prop), which does not include mid-consult services added via `arrayUnion`. When progress is toggled for a mid-consult service, `updateDoc` writes `services: newServices` — a full replacement that silently drops any service added since the dialog opened. `handleSaveConsult` (line 1969) correctly handles this by merging treatmentCart additions, but `handleToggleServiceProgress` does not. Fix: read a fresh snapshot (`getDoc`) before building `newServices`, or merge treatmentCart services into `patient.services` before mapping.

**Warning:** The `isBase` staff-attribution block at line 3940 is inside the ITEMS panel (`productItems = treatmentCart.filter(rx => rx.type === 'product')`). All `isBase` items are `type: 'service'`, so this block is dead code — it was moved from the old mixed cart but the new type filter makes it unreachable.

**UX:** The SERVICES panel shows the remove `CloseIcon` button for all services when `!isRecordLocked`, including `isBase` services. Clicking it calls `handleRemoveRx` which silently returns at line 1487 for isBase items. The button should be hidden when `rx.isBase` to avoid a confusing no-op.

**All checklist items PASS:**
- arrayUnion used correctly in mid-consult service registration
- setServiceProgress seeds new service to 'pending' before the async write
- Non-blocking try/catch with showToast on registration failure
- serviceItems filtered by type==='service', productItems by type==='product'
- progress chip uses serviceProgress[rx.id] || 'pending'
- chip onClick guards on isToggleable (isRecordLocked || status === 'completed' makes it non-clickable)
- cartIdx is `treatmentCart.indexOf(rx)` — safe because deduplication at line 1356 prevents duplicate ids
- Collapse imported (line 17), used in non-drug collapsible instructions
- Grand total at line 4003 sums full treatmentCart (both types) — correct
- Zero ServiceProgressCard references remain (file deleted, no consumers)
- No new alert()/prompt() added; pre-existing window.confirm calls untouched
- borderRadius: 0 on both new Paper containers and all row boxes
- Colors: COLORS.sky for SERVICES border/header, COLORS.accent for ITEMS, #9E9E9E/COLORS.warning/COLORS.success for chips
- Pre-existing borderRadius:2 on Autocomplete search TextField is pre-existing and out of scope

**Why:** `patient` is a static prop — no onSnapshot refreshes it inside ClinicalWorkspace. Any `arrayUnion` write bypasses the in-memory `patient.services` reference.

**How to apply:** When reviewing ClinicalWorkspace changes that involve writing to `appointments.services` via both `arrayUnion` and full-replace patterns in the same session, always verify both write paths use the same source-of-truth for the existing services list.
