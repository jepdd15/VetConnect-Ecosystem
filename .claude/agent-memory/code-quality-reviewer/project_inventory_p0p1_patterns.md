---
name: Inventory P0+P1 — Reviewed Patterns & Known Issues
description: T2.149-T2.155 review findings: array mutation in transactions, audit trail userName gap, double-submit risk, dead code in ProductFormModal
type: project
---

Inventory P0+P1 implementation (T2.149-T2.155) reviewed 2026-04-21.

**Critical pattern: array mutation in Firestore transactions**
Both `useInventory.js` (adjustStock, line 162) and `useSalesData.js` (refund restock, line 72) do `const batches = data.batches || []` then `batches.push(...)` — this mutates the Firestore snapshot object in memory. Fix: always spread a copy: `const batches = [...(data.batches || [])]`.

**Audit trail integrity gap in useSalesData.js**
`processRefundTransaction` writes `userName: 'Admin'` and `userId: null` hardcoded. The hook does not call `useUser()`. All refund RESTOCK log entries will show "Admin" regardless of who processed the refund. This is a forensic integrity issue. Fix: pass user info as a parameter or import `useUser`.

**releaseStock NaN guard missing**
`if (!qty || qty <= 0) return` guard in `releaseStock` does not catch `NaN`. `Math.max(0, currentReserved - NaN)` returns `NaN` which Firestore may silently accept. Add `isNaN(qty)` to the guard.

**StockAdjustModal double-submit**
`handleSubmit` is async but the Confirm button has no `disabled` state during the await. A user can double-click and fire two transactions.

**Dead code in ProductFormModal**
`const selectedCatObj = categories.find(...)` on line 17 is declared but never used.

**Design token shadow pattern (pre-existing)**
`rgba(93,64,55,0.1)` semi-transparent shadows appear in GlobalActivityLog, InventoryLogModal, StockAdjustModal — inconsistent with design system's solid offset shadow spec, but pre-existing pattern not introduced by this batch.

**Why:** These patterns affect audit trail reliability and transaction safety in clinical inventory management.

**How to apply:** Flag array mutation before push in any future Firestore transaction code. Flag hardcoded userName in any audit log writer that doesn't pull from useUser().
