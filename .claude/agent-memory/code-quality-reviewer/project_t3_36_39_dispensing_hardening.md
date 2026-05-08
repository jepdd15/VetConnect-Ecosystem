---
name: T3.36-T3.39 Dispensing Hardening — Review Findings
description: DispensingVerificationDialog, Queue.jsx, queueColumns.jsx, POSModal — dispensing hold, stock verification, batch/lot selection, partial dispensing
type: project
---

## Review scope
T3.36 (hold for vet review), T3.37 (stock verification), T3.38 (batch/lot selection), T3.39 (partial dispensing) across 4 files.

## Issues found

### CRITICAL
- **window.confirm() inside handleConfirmDispensing** (`DispensingVerificationDialog.jsx` line 157): When any product qty = 0, the code calls `window.confirm()` to ask the user to proceed. This is a direct Amendment 1 violation. The flag/resolve dialogs in Queue.jsx use proper MUI Dialogs, but the zero-qty confirmation is still a raw browser dialog inside the dialog component itself.
- **handleDispenseVerified uses alert()** (`Queue.jsx` line 681): The catch block for the atomic dispense transaction fires `alert("Dispensing Error: " + e.message)`. This is T3.36 scope (the dispensing workflow). Should use the existing `dispenseHoldToast` Snackbar that was added for flag/resolve errors.

### WARNING
- **stockIssueCount only counts items with available < prescribed qty** — it misses the 'out-of-stock' case where `invData.available === 0`. The condition `inv.available < item.qty` does cover out-of-stock (0 < qty evaluates true) so this is actually fine — just worth noting the implicit coverage.
- **dispensingChecklist keyed by item name, not item ID** (`POSModal.jsx` buildCartForAppointment line 75): `checklistMap.set(ci.name, ci)` — if a patient has two prescribed items with the same name (e.g., two different strengths of the same drug added as separate entries with identical names), one will shadow the other. Edge case but real for polypharmacy patients.
- **No optimistic-lock guard before confirm in handleDispenseVerified**: The transaction re-reads the doc but doesn't check `dispensingHold` inside the transaction. If a vet re-flags mid-confirm between the UI check (`isHeld` in DVDialog) and the commit, the hold gets silently overwritten. Should check `apptDoc.data().dispensingHold` inside the transaction and throw if set.

### SUGGESTION
- The `today` date object is recalculated inside the map callback on every render for the validBatches filter (DVDialog line 287). It should be hoisted outside the map (or computed once in useMemo) since it doesn't depend on loop variables.
- The two T3.36 dialogs share `dispenseReasonText` state. Switching from flag to resolve without the dialogs opening resets the field correctly (both openers call `setDispenseReasonText('')`), but a tab-focus race would cause no problem since only one dialog is open at a time. Low risk, documented for awareness.

## What passed
- No prompt() anywhere in all 4 files.
- T3.36 flag/resolve use proper MUI Dialogs with borderRadius: 0, fontWeight: 900.
- T3.36: handleDispenseFlag + handleDispenseResolve use runTransaction + deleteField + createPulseEvent (DISPENSING_FLAGGED / FLAG_RESOLVED).
- T3.36: errors from flag/resolve use Snackbar (dispenseHoldToast), not alert().
- T3.36: queueColumns DISPENSING row correctly shows ON HOLD chip + RESOLVE button vs VERIFY ITEMS + FLAG icon.
- T3.36: DispensingVerificationDialog confirm button disabled when isHeld. Stock warnings do NOT block confirm (advisory only).
- T3.37: stockMap is a useMemo O(1) Map. Per-item warnings: out-of-stock (red), insufficient (orange), low-stock (amber). Available qty annotation in right column. Summary alert when stockIssueCount > 0.
- T3.38: batchSelections state with FIFO-first auto-default on open. Select dropdown shows unexpired batches sorted by expiryDate asc. batchSelections included in dispensingData.
- T3.39: dispensedQtys state per item. Numeric input min=0 max=prescribed. PARTIAL / NOT DISPENSED chips present. dispensedQty/prescribedQty/backorderQty/hasPartialDispensing in dispensingData. Confirm button label changes for partial. allChecked logic updated (products auto-check when qty > 0).
- T3.39 POSModal: buildCartForAppointment reads dispensingChecklist, overrides product qty with dispensed qty, filters out qty=0 items. Individual billing path (no dispensingChecklist) unchanged.
- inventoryList prop threaded through Queue.jsx → DispensingVerificationDialog using joinedInventory (the enriched inventory with isMedicine flag).
- Design tokens: all borderRadius values are 0, COLORS palette used correctly in new dialogs.
