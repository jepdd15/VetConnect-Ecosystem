---
name: Inventory P2+P3 — Reviewed Patterns & Known Issues
description: T2.156-T2.173 review findings: ConfirmDeleteModal swallows errors, Firestore compound-query index gap, batch expiryDate type assumption, design token drift in new files
type: project
---

T2.157 ConfirmDeleteModal: `onClose()` runs unconditionally after `await onConfirm()` — any throw from onConfirm is silently swallowed because there is no try/catch in the inline async handler. The parent `handleConfirmDelete` does have a try/catch but it never calls `onClose` on error, so the modal stays open. Verdict: safe in practice (parent closes on error via state), but the inline handler style masks exceptions.

T2.170 GlobalActivityLog `buildQuery`: Firestore `where('action','==',...)` is `unshift`-ed before `orderBy('timestamp','desc')`. This is the correct SDK order, but using a compound `where + orderBy` on two different fields requires a composite index (`action ASC, timestamp DESC`). No evidence this index exists in firestore.indexes.json. If the index is missing the first time a user picks an action filter, they will get a runtime error with a link to create the index. Low probability of being caught in dev because the default path (filterAction==='ALL') skips the where entirely.

T2.165 / T2.166 batch.expiryDate type assumption: batch entries written by `adjustStock` store `expiryDate` as an ISO string (e.g. `"2025-09-12"`). The KPI engine in Inventory.jsx uses `new Date(batch.expiryDate + 'T00:00:00')` which works for strings. The Tooltip in InventoryTable renders `b.expiryDate` directly. If a legacy batch entry were to store a Firestore Timestamp object instead of a string, both the KPI calc and the tooltip display would produce `NaN` / `[object Object]`. No defensive coercion exists.

T2.172 calculateMargin: `!cost || !retail` treats cost===0 and retail===0 as missing, returning null. This is correct semantically (0-cost items shouldn't show a margin). However, a product with retail=0 (e.g., a comp item) would also return null and show "N/A" rather than an explicit 0% — a minor UX ambiguity, not a bug.

Design token drift: GlobalActivityLog and InventoryLogModal were rewritten without referencing COLORS tokens. Raw hex strings used throughout (`'#5D4037'`, `'#3E2723'`, `'#FFF8E1'`, etc.). This is consistent with how the rest of the Inventory module is authored (the older files also use raw hex), so it is not a regression — but the drift from COLORS tokens continues to compound.

Quick-add category isMedicine default: `handleQuickAddCategory` in ProductFormModal always writes `isMedicine: false`. A user quick-adding "chemotherapy" would get a non-medicine category requiring a manual toggle. Low-impact but a known gap.

**Why:** Recorded for future reviewers to know which issues are pre-existing patterns (token drift, raw hex) vs. new regressions.
**How to apply:** When reviewing future Inventory PRs, do not flag raw hex as a regression — flag it only when a *new* component is added that should set the precedent for COLORS usage.
