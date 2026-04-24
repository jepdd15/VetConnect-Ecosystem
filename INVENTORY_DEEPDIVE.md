# Inventory Module Deep Dive

> **Target files:** `VetConnect-Admin/src/features/Inventory/` (8 files, commit `9d1f662`)
> **Companion documents:** [ECOSYSTEM_ARCHITECTURE_REPORT.md](ECOSYSTEM_ARCHITECTURE_REPORT.md), [SALES_DEEPDIVE.md](SALES_DEEPDIVE.md), [CLINICAL_WORKSPACE_DEEPDIVE.md](CLINICAL_WORKSPACE_DEEPDIVE.md)
> **Audit method:** 5 codebase-architecture-researcher sub-agents across 2 rounds (components+modals round 1, core files round 2), each performing forensic file-level analysis with cross-reference tracing against POSModal.jsx, useSalesData.js, ClinicalWorkspace.jsx, and Queue.jsx.

---

## Module Architecture

```
Inventory/
├── Inventory.jsx                     (414 lines) — Page orchestrator: KPI cards, tabs, filter bar, modal wiring
├── hooks/
│   └── useInventory.js               (224 lines) — Data layer: listener, CRUD, adjustStock, reserve/release, scrub
├── components/
│   ├── InventoryTable.jsx            (312 lines) — Sortable/paginated DataGrid with stock status badges
│   └── GlobalActivityLog.jsx         (272 lines) — Clinic-wide audit trail (inventory_logs)
└── modals/
    ├── ProductFormModal.jsx           (427 lines) — Create/edit product form
    ├── StockAdjustModal.jsx           (120 lines) — Manual stock +/- adjustment
    ├── InventoryLogModal.jsx          (117 lines) — Per-item audit trail
    └── ConfirmDeleteModal.jsx         (92 lines)  — Soft-delete (archive) confirmation
```

### Component Connection Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                     Inventory.jsx (orchestrator)                        │
│  13 useState hooks + 1 useEffect + 2 useMemo                          │
│                                                                        │
│  useInventory() hook ──────────────────────────────────────────┐       │
│    ├── inventory[]         (onSnapshot: full collection)       │       │
│    ├── loading             (NOT passed to InventoryTable)      │       │
│    ├── createItem / updateItem / deleteItem (=archiveItem)     │       │
│    ├── restoreItem / permanentlyDeleteItem                     │       │
│    ├── adjustStock         (P0: no transaction, no floor)      │       │
│    ├── reserveStock / releaseStock (no guards, no audit)       │       │
│    └── scrubDatabase       (category normalization migration)  │       │
│                                                                │       │
│  Tab 0: InventoryTable ───── filteredItems, 6 action callbacks │       │
│  Tab 1: GlobalActivityLog ── (self-contained, no props)        │       │
│                                                                │       │
│  Modals: ProductFormModal, StockAdjustModal,                   │       │
│          InventoryLogModal, ConfirmDeleteModal,                │       │
│          ScrubConfirmDialog (inline)                           │       │
└────────────────────────────────────────────────────────────────────────┘

                  EXTERNAL CONSUMERS OF useInventory
┌──────────────────────────┐    ┌────────────────────────────────────────┐
│  Queue.jsx               │    │  ClinicalWorkspace.jsx (via props)     │
│  Uses: inventory[],      │    │  Uses: reserveStock, releaseStock      │
│    reserveStock,         │    │  (Rx cart stock reservation system)    │
│    releaseStock          │    │                                        │
│  Enriches with isMedicine│    │  POSModal.jsx (OWN transaction)        │
│  via category join       │    │  Does NOT use useInventory —           │
│  (joinedInventory L1133) │    │  writes directly via runTransaction    │
└──────────────────────────┘    └────────────────────────────────────────┘
```

---

## Firestore Read/Write Paths

### useInventory.js — 1 Listener, 10 Write Functions

| Operation | Collection | Mechanism | Line | Transactional? |
|---|---|---|---|---|
| **Read** (real-time) | `inventory` | `onSnapshot` (full collection, no filter) | L48-63 | N/A |
| **Write** | `inventory` | `addDoc` | L96 (`createItem`) | No |
| **Write** | `inventory/{id}` | `updateDoc` | L107 (`updateItem`) | No |
| **Write** | `inventory/{id}` | `updateDoc(increment)` | L143 (`adjustStock`) | **No — P0** |
| **Write** | `inventory/{id}` | `updateDoc(increment)` | L153 (`reserveStock`) | No |
| **Write** | `inventory/{id}` | `updateDoc(increment)` | L160 (`releaseStock`) | No |
| **Write** | `inventory/{id}` | `updateDoc` | L122 (`archiveItem`) | No |
| **Write** | `inventory/{id}` | `updateDoc` | L131 (`restoreItem`) | No |
| **Write** | `inventory/{id}` | `deleteDoc` | L116 (`deleteItem`) | No |
| **Write** | `inventory_logs` | `addDoc` | L71 (`logEvent`) | No |
| **Write** | `inventory` + `inventory_categories` | `writeBatch` | L170 (`scrubDatabase`) | Yes (batch) |

### Inventory.jsx — 1 Listener, 1 Batch Write

| Operation | Collection | Mechanism | Line |
|---|---|---|---|
| **Read** (real-time) | `inventory_categories` | `onSnapshot` | L95 |
| **Write** (seed) | `inventory_categories` | `writeBatch` (7 default categories) | L98-111 |

### GlobalActivityLog.jsx — 1 Listener

| Operation | Collection | Mechanism | Line |
|---|---|---|---|
| **Read** (real-time) | `inventory_logs` | `onSnapshot`, `orderBy timestamp desc`, `limit(300)` | L51-54 |

### InventoryLogModal.jsx — 1 One-Shot Query

| Operation | Collection | Mechanism | Line |
|---|---|---|---|
| **Read** (one-shot) | `inventory_logs` | `getDocs`, `where itemId == item.id`, `orderBy timestamp desc` | L28-33 |

### ProductFormModal.jsx — 1 Direct Write (bypasses hook)

| Operation | Collection | Mechanism | Line |
|---|---|---|---|
| **Write** | `inventory_categories` | `addDoc` (quick-add category) | L96 |

---

## Log Schema Incompatibility — Cross-Cutting P0

Four different writers produce documents in `inventory_logs` with **incompatible field names**:

| Field | `logEvent` (useInventory L71-80) | POSModal (L328-337) | useSalesData refund (L79-80) | GlobalActivityLog reads |
|---|---|---|---|---|
| Action type | `action` | `action: "SOLD"` | **`type: "restock"`** | `log.action` — **MISSES refund** |
| Quantity | `amountChange` | `amountChange` | **`quantity`** | `log.amountChange` — **MISSES refund** |
| User name | `userName` | `userName` | **`user: "Admin"`** | `log.userName` — **MISSES refund** |
| User ID | `userId` | `userId` | *(not written)* | *(not displayed)* |
| Timestamp | `serverTimestamp()` | `Timestamp.now()` | `Timestamp.now()` | `log.timestamp?.toDate()` |

**Impact:** Every refund restock log entry renders with broken data in GlobalActivityLog — action shows `undefined`, quantity shows `undefined`, user shows "System". The per-item InventoryLogModal has a `normalizeLog()` function (L11-16) that patches this, but GlobalActivityLog does not.

```
Writers:                              Reader:
┌────────────────────┐               ┌──────────────────────────┐
│ logEvent           │──┐            │ GlobalActivityLog        │
│ {action,           │  │            │ reads: action, itemName, │
│  amountChange,     │  │            │   amountChange, reason,  │
│  userName,         │  ├──► inventory_logs/  userName, timestamp│
│  serverTimestamp}  │  │            │                          │
└────────────────────┘  │            │ ✓ logEvent logs OK       │
┌────────────────────┐  │            │ ✓ POSModal logs OK       │
│ POSModal           │──┤            │ ✗ useSalesData logs      │
│ {action:"SOLD",    │  │            │   BROKEN (3/6 columns)   │
│  amountChange,     │  │            └──────────────────────────┘
│  userName,         │  │
│  Timestamp.now()}  │  │            ┌──────────────────────────┐
└────────────────────┘  │            │ InventoryLogModal        │
┌────────────────────┐  │            │ HAS normalizeLog() —     │
│ useSalesData       │──┘            │ patches type→action,     │
│ {type:"restock",   │  ← WRONG     │ quantity→amountChange,   │
│  quantity,         │  FIELDS      │ user→userName             │
│  user:"Admin",     │               │ (but negates qty wrong)  │
│  Timestamp.now()}  │               └──────────────────────────┘
└────────────────────┘
```

---

## Bugs Found — Full Inventory with Code Quotes

### P0 — Data Integrity

#### BUG 1: `adjustStock` uses `increment()` without transaction — stock can go negative

**Location:** `useInventory.js:143-145`

```js
await updateDoc(doc(db, "inventory", id), {
  stock: increment(amount)
});
```

`increment()` is atomic at the field level but has no floor constraint. The StockAdjustModal validates `item.stock - amount >= 0` client-side (L22), but two concurrent decrements (modal + POS checkout + ClinicalWorkspace) can all pass client validation and all execute server-side. Contrast with POSModal which uses `runTransaction` with a read-before-write pattern.

#### BUG 2: Refund log schema incompatible with GlobalActivityLog

**Location:** `useSalesData.js:79-80`

```js
transaction.set(logRef, {
  itemId: item.id, itemName: item.name,
  type: 'restock',        // should be: action: 'RESTOCK'
  quantity: item.qty,      // should be: amountChange: item.qty
  reason: `Customer Refund (Receipt #${selectedSale.id.slice(0,5)})`,
  oldStock: data.stock, newStock: newStock,
  batchInfo: 'Returned Item',
  user: "Admin",           // should be: userName + userId
  timestamp: Timestamp.now()
});
```

GlobalActivityLog reads `log.action` (L160), `log.amountChange` (L216), `log.userName` (L252). Refund logs have none of these — they render with `undefined` in 3 of 6 columns. `ACTION_CONFIG` (L20-29) has no `RESTOCK` entry, so even with field fix, restocks would get generic grey styling.

---

### P1 — Functional / Audit Gaps

#### BUG 3: `reserveStock` can over-reserve — no validation

**Location:** `useInventory.js:153-155`

```js
const reserveStock = async (id, qty) => {
  if (!qty || qty <= 0) return;
  await updateDoc(doc(db, "inventory", id), {
    reserved: increment(qty)
  });
};
```

No check that `reserved + qty <= stock`. Two concurrent ClinicalWorkspace sessions can each reserve the last 3 items of a stock-3 product, resulting in `reserved: 6` while `stock: 3`.

#### BUG 4: `releaseStock` can make reserved negative

**Location:** `useInventory.js:160-162`

```js
await updateDoc(doc(db, "inventory", id), {
  reserved: increment(-qty)
});
```

No floor check. If POSModal decrements reserved during sale AND ClinicalWorkspace releases on unmount, double-decrement makes `reserved` negative.

#### BUG 5: `adjustStock` ignores `batches[]` — FIFO tracking drifts

**Location:** `useInventory.js:143-145`

Only updates flat `stock` counter. `batches[]` array is never touched by adjustStock. Over time, `sum(batches[].qty)` diverges from `stock`. Compare to POSModal which correctly does FIFO batch deduction inside a transaction.

| Operation | Touches batches? |
|---|---|
| `createItem` | Yes (conditionally — lotNumber + expiry + stock > 0) |
| `updateItem` | Only if caller passes it (blind array overwrite) |
| **`adjustStock`** | **NO — FIFO drift** |
| `reserveStock` / `releaseStock` | NO |
| POSModal SOLD | YES (FIFO deduction in transaction) |
| useSalesData refund | YES (appends return batch in transaction) |

#### BUG 6: Hard delete writes log AFTER deletion

**Location:** `useInventory.js:116-118`

```js
await deleteDoc(doc(db, "inventory", id));
await logEvent(id, itemName || "Unknown", "DELETED", 0, "Permanently Removed from Database");
```

If log fails (silently caught in `logEvent`), permanent deletion is unaudited. No guard against deleting items with active stock or reservations.

#### BUG 7: `loading` state not passed to InventoryTable

**Location:** `Inventory.jsx:69` (destructured but not passed), `Inventory.jsx:339-347` (prop list)

`useInventory()` returns `loading` but Inventory.jsx doesn't destructure it. InventoryTable receives no loading prop. Users see empty state instead of spinner on initial Firestore fetch.

#### BUG 8: No role gating on `scrubDatabase`

**Location:** `Inventory.jsx:298-300`

```jsx
<IconButton size="small" onClick={() => setOpenScrubConfirm(true)}
  sx={{ color: '#5D4037', bgcolor: 'transparent', border: '1px solid #5D403733', ml: 1 }}>
  <AutoFixHighIcon fontSize="small" />
</IconButton>
```

No `isAdmin` check. Any user who reaches `/inventory` can trigger database-wide category normalization affecting both `inventory_categories` and `inventory` collections.

#### BUG 9: StockAdjustModal ignores `reserved` in removal validation

**Location:** `StockAdjustModal.jsx:22`

```js
} else if (action === 'remove' && (item?.stock || 0) - amount < 0) {
```

Validates against `item.stock` (total) but ignores `item.reserved`. If 10 units in stock and 8 reserved, staff can remove all 10 via this modal, destroying active reservations.

#### BUG 10: `category` not validated as required in ProductFormModal

**Location:** `ProductFormModal.jsx:59-69`

```js
const newErrors = {};
if (!formData.itemName.trim()) newErrors.itemName = 'Product name is required.';
if (formData.price === '' || isNaN(Number(formData.price)) || Number(formData.price) < 0)
  newErrors.price = 'A valid retail price is required.';
if (!formData.unit.trim()) newErrors.unit = 'Unit of measure is required';
// NO category validation
```

Products can be created with `category: ""`. Downstream filtering, KPI grouping, and the `isMedicine` category join in Queue.jsx all depend on category being meaningful.

#### BUG 11: `costPrice` allows negative values

**Location:** `ProductFormModal.jsx:77`

```js
costPrice: Number(formData.costPrice) || 0,
```

`price` is validated for `< 0` (L62), but `costPrice` has zero validation. Negative cost corrupts margin calculations and totalValue KPI.

---

### P2 — Medium Severity

#### BUG 12: `archiveItem` doesn't release reserved stock

**Location:** `useInventory.js:121-127`

```js
await updateDoc(doc(db, "inventory", id), {
  isArchived: true,
  archivedAt: serverTimestamp(),
});
```

Archived items retain their `reserved` count. If ClinicalWorkspace had reserved stock, those reservations are orphaned.

#### BUG 13: Reserve/release events not logged

**Location:** `useInventory.js:151-163`

Neither `reserveStock` nor `releaseStock` calls `logEvent`. Reservation events are completely invisible in the audit trail.

#### BUG 14: `normalizeLog` negates refund quantities incorrectly

**Location:** `InventoryLogModal.jsx:14`

```js
amountChange: log.amountChange ?? (log.quantity ? -log.quantity : 0),
```

Refund restocks should show as POSITIVE (stock returning). But `normalizeLog` negates `quantity` (assumes sales). Restocks display as negative in the per-item modal.

#### BUG 15: Optimistic close in StockAdjustModal — dialog closes before write completes

**Location:** `StockAdjustModal.jsx:36-37`

```js
onAdjust(finalAmount, reason.trim());
onClose();
```

`onAdjust` is async but not awaited. Modal closes immediately. If Firestore write fails, user sees the modal close then a toast error with no way to retry.

#### BUG 16: Optimistic close in ConfirmDeleteModal — same pattern

**Location:** `ConfirmDeleteModal.jsx:82`

```js
onClick={() => { onConfirm(item.id, item.itemName); onClose(); }}
```

`onConfirm` is async but not awaited.

#### BUG 17: StockAdjustModal form state not reset on close/reopen

**Location:** `StockAdjustModal.jsx:9-12`

```js
const [action, setAction] = useState('add');
const [qty, setQty] = useState('');
const [reason, setReason] = useState('Restocked from Supplier');
```

State persists across open/close cycles. Reopening for a different item shows stale values from previous session. No `useEffect` resets state when `open` or `item` changes.

#### BUG 18: Quick-add category bypasses hook — no audit trail

**Location:** `ProductFormModal.jsx:92-104`

```js
await addDoc(collection(db, 'inventory_categories'), { name: lowerName });
```

Direct Firestore write bypassing `useInventory`. No `logEvent` call. No `isMedicine` default set. No duplicate category guard — can create unlimited duplicates with the same name.

#### BUG 19: `handleDelete` creates partial selectedItem stub

**Location:** `Inventory.jsx:199-202`

```js
const handleDelete = (id, name) => {
  setSelectedItem({ id, itemName: name });
  setOpenDelete(true);
};
```

Replaces `selectedItem` with `{ id, itemName }` only, losing all other fields. Other modal openers pass the full item object. ConfirmDeleteModal can only use `id` and `itemName`.

#### BUG 20: Category seed has no idempotency guard

**Location:** `Inventory.jsx:96-113`

```js
if (snap.empty) {
  const batch = writeBatch(db);
  const defaultCategories = [...];
  // ...
  await batch.commit();
}
```

Two concurrent tabs on a fresh database both see `snap.empty === true` and both seed — creating duplicate categories.

#### BUG 21: No pre-archive impact check in ConfirmDeleteModal

**Location:** `ConfirmDeleteModal.jsx` (entire file)

Does not check for active appointments, reserved stock, or linked services before archiving. Shows generic warning text with no context about downstream impact.

#### BUG 22: InventoryLogModal has no query limit

**Location:** `InventoryLogModal.jsx:28-32`

```js
const q = query(
  collection(db, "inventory_logs"),
  where("itemId", "==", item.id),
  orderBy("timestamp", "desc")
);
```

No `limit()` clause. For a heavily-used product, fetches all logs — could return thousands of entries.

#### BUG 23: InventoryLogModal has no error state UI

**Location:** `InventoryLogModal.jsx:36-37`

```js
} catch (err) {
  console.error("Failed to fetch logs:", err);
}
```

Error silently swallowed. User sees "No history recorded" instead of an error message.

#### BUG 24: `createItem` makes 3 non-atomic writes

**Location:** `useInventory.js:96-100`

```js
await addDoc(collection(db, "inventory"), itemData);
await logEvent(id, ..., "CREATED", 0, ...);
if (initialStock > 0) await logEvent(id, ..., "ADJUSTED", initialStock, ...);
```

Three separate `addDoc` calls with no transaction. If the first log fails (silently caught), the doc exists but audit trail is incomplete.

#### BUG 25: Timestamp inconsistency across log writers

`logEvent` uses `serverTimestamp()` (server-evaluated). POSModal and useSalesData use `Timestamp.now()` (client-evaluated). Under clock skew, logs from the same transaction can appear out of order.

---

### P3 — Polish & Design

#### BUG 26: InventoryTable — `batches[]` array completely ignored

No expandable rows, no batch detail tooltip. Staff cannot see FIFO distribution or per-batch expiry. Only top-level `expiryDate` is checked for expiry warnings.

#### BUG 27: InventoryTable — `isMedicine` field ignored

No clinical vs non-clinical badge. The `isMedicine` flag is enriched at runtime by Queue.jsx's `joinedInventory` (L1133-1140) from category docs, not stored on inventory items. InventoryTable doesn't perform this join.

#### BUG 28: InventoryTable — negative margins hidden as "N/A"

**Location:** `InventoryTable.jsx:55`

```js
if (!cost || !retail || cost >= retail) return 0;
```

Items priced below cost show "N/A" in the margin column instead of a red negative percentage.

#### BUG 29: GlobalActivityLog — hard limit of 300 with no truncation warning

**Location:** `GlobalActivityLog.jsx:54`

```js
limit(300)
```

No pagination, no "load more", no indication to user that results are truncated.

#### BUG 30: GlobalActivityLog — no filtering or search

No action type filter, no date range picker, no product name search, no user filter. For an audit trail component, this limits forensic usefulness.

#### BUG 31: `restoreItem` doesn't clear `archivedAt`

**Location:** `useInventory.js:131-133`

```js
await updateDoc(doc(db, "inventory", id), {
  isArchived: false,
  restoredAt: serverTimestamp(),
});
```

Both `archivedAt` and `restoredAt` timestamps coexist on the doc after restore.

#### BUG 32: Dead code — `glassStyle` and `GLASS` import in Inventory.jsx

**Location:** `Inventory.jsx:232`

```js
const glassStyle = GLASS.panel;
```

Assigned but never referenced. `GLASS` import (L21) is dead.

#### BUG 33: Dead code — `selectedCatObj` in ProductFormModal

**Location:** `ProductFormModal.jsx:17`

```js
const selectedCatObj = categories.find(c => c.name === item?.category);
```

Computed every render, never referenced anywhere.

#### BUG 34: Dead import — `COLORS` imported but unused in 3 modals

StockAdjustModal, InventoryLogModal, and ConfirmDeleteModal all import `COLORS` from designTokens but never reference it. All colors are hardcoded.

#### BUG 35: 100+ hardcoded hex color values across entire module

Only `FONT` is consistently used from designTokens. `COLORS` is imported in some files but barely referenced. Every file has 15-30 hardcoded hex values.

| File | Hardcoded colors | Tokens imported | Tokens actually used |
|---|---|---|---|
| Inventory.jsx | ~30 | FONT, TYPE, COLORS, GLASS | FONT (most), COLORS (3 places), TYPE (0) |
| InventoryTable.jsx | ~25 | FONT | FONT only |
| GlobalActivityLog.jsx | ~20 | None | None |
| ProductFormModal.jsx | ~30 | None | None |
| StockAdjustModal.jsx | ~12 | FONT, COLORS | FONT only (COLORS dead) |
| InventoryLogModal.jsx | ~20 | FONT, COLORS | FONT only (COLORS dead) |
| ConfirmDeleteModal.jsx | ~14 | FONT, COLORS | FONT only (COLORS dead) |

#### BUG 36: `borderRadius: 1` on Chips across multiple files

InventoryTable (L184, L209, L238), GlobalActivityLog (L142, L208, L221, L259). Design guide mandates `borderRadius: 0`. InventoryLogModal correctly uses `borderRadius: 0` on its Chips — inconsistency within the module.

#### BUG 37: `scrubDatabase` has no batch chunking

**Location:** `useInventory.js:170`

```js
const batch = writeBatch(db);
```

Single `writeBatch`. Firestore limit is 500 operations per batch. If `inventory_categories` + `inventory` combined need >500 updates, `batch.commit()` throws.

#### BUG 38: InventoryLogModal stale data on re-open

`getDocs` one-shot with `[item?.id]` dependency. Re-opening for the same item after an adjustment shows stale data — the effect doesn't re-fire because `item.id` hasn't changed.

#### BUG 39: InventoryLogModal "Just now" timestamp fallback

**Location:** `InventoryLogModal.jsx:90`

```js
{log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString(...) : 'Just now'}
```

"Just now" is misleading for missing timestamps — should be "Unknown".

---

## Race Condition Analysis

| Function | Mechanism | Transactional? | Race Risk |
|---|---|---|---|
| `createItem` | `addDoc` + 2x `addDoc` (logs) | No | Low — new doc |
| `updateItem` | `updateDoc` + `addDoc` (log) | No | Medium — concurrent edits, last-write-wins |
| **`adjustStock`** | `updateDoc(increment)` + `addDoc` (log) | **No** | **HIGH — stock can go negative** |
| **`reserveStock`** | `updateDoc(increment)` | **No** | **HIGH — can over-reserve** |
| **`releaseStock`** | `updateDoc(increment)` | **No** | **HIGH — reserved can go negative** |
| `archiveItem` | `updateDoc` + `addDoc` (log) | No | Low |
| `restoreItem` | `updateDoc` + `addDoc` (log) | No | Low |
| `deleteItem` | `deleteDoc` + `addDoc` (log) | No | Medium — log orphaned |
| `scrubDatabase` | `writeBatch` | Yes (batch) | Low |
| **POSModal SOLD** | `runTransaction` | **Yes** | **None — correct pattern** |
| **useSalesData refund** | `runTransaction` | **Yes** | **None — correct pattern** |

**Key insight:** The two highest-contention operations (POS checkout and refund) correctly use `runTransaction`. The lower-contention admin operations (adjust, reserve, release) do not. This suggests the developer added transactions where they were most obviously needed but didn't propagate the pattern to the hook functions.

---

## KPI Card Calculations

**Location:** `Inventory.jsx:134-153`

```js
const activeInventory = inventory.filter(item => !item.isArchived);
let totalValue = 0, outOfStock = 0, lowStock = 0, expiringSoon = 0;
activeInventory.forEach(item => {
    const stock = Number(item.stock) || 0;
    const cost = Number(item.costPrice) || 0;
    const min = Number(item.minStock) || 0;
    totalValue += (stock * cost);
    if (stock <= 0) outOfStock++;
    else if (stock <= min) lowStock++;
    if (item.expiryDate) {
        const expiry = new Date(item.expiryDate + 'T00:00:00');
        const daysUntil = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= 30) expiringSoon++;
    }
});
```

| Metric | Correct? | Issue |
|---|---|---|
| Total Value | Partially | Uses `costPrice` not `price` — this is cost basis, not retail value. Label says "Total Value" which is ambiguous. Negative costPrice would corrupt. |
| Out of Stock | Yes | `stock <= 0` — correct |
| Low Stock | Yes | `stock > 0 && stock <= minStock` — correct (mutually exclusive with Out of Stock) |
| Expiring Soon | Partially | Only checks top-level `expiryDate`, not `batches[].expiryDate`. Items with expired batches but future top-level expiry are missed. |

---

## Feature Completeness Matrix

| Feature | Present? | Quality | Notes |
|---|---|---|---|
| Real-time inventory list | Yes | Good | `onSnapshot` with proper cleanup |
| Product CRUD | Yes | Good | Create, edit, archive, restore, permanent delete |
| Stock adjustment | Yes | **Buggy** | No transaction, no batch tracking, no reserved check |
| Stock reservation | Yes | **Buggy** | No over-reserve guard, no audit trail |
| KPI dashboard | Yes | Partial | 4 tiles (Out of Stock, Low Stock, Expiring, Total Value). Click-to-filter. |
| Batch/FIFO visibility | **No** | — | `batches[]` completely invisible in InventoryTable |
| Expiry warnings | Partial | — | Only top-level `expiryDate`, not per-batch |
| Audit trail (global) | Yes | **Buggy** | Refund logs broken (field mismatch). No filtering, search, or pagination beyond 300. |
| Audit trail (per-item) | Yes | Good | `normalizeLog` handles refund fields. But no limit, no error UI, stale on re-open. |
| Category management | Partial | — | Auto-seed + scrub. No add/edit/delete UI. Quick-add in ProductFormModal bypasses hook. |
| Archive/restore | Yes | Good | Soft-delete with audit trail. Missing: impact check, reserved release. |
| `isMedicine` classification | **Runtime only** | — | Not on inventory docs. Queue.jsx joins at render time from category docs. |
| Receipt/export | **No** | — | No print, CSV, or PDF export for inventory reports |
| Loading states | **No** | — | `loading` not passed to InventoryTable |
| Design token compliance | **Poor** | — | 100+ hardcoded colors across 7 files |

---

## Proposed Tasks

| ID | Name | Priority | Effort | Notes |
|---|---|---|---|---|
| T2.149 | `adjustStock`: wrap in `runTransaction` with stock floor check (`newStock >= 0`) and reserved check (`newStock >= reserved`). Read current doc inside transaction before applying delta. | **P0** | 30 min | Stock can go negative |
| T2.150 | Normalize refund log schema in `useSalesData.js`: use `action: 'RESTOCK'`, `amountChange`, `userName`/`userId` instead of `type`/`quantity`/`user`. Add `RESTOCK` entry to GlobalActivityLog's `ACTION_CONFIG`. Extract `normalizeLog` to shared utility for backward compat with existing docs. | **P0** | 45 min | 3 columns render `undefined` for refund logs |
| T2.151 | `reserveStock`/`releaseStock`: wrap in `runTransaction`. reserveStock validates `reserved + qty <= stock`. releaseStock validates `reserved - qty >= 0`. | **P1** | 30 min | Over-reserve and negative-reserve bugs |
| T2.152 | `adjustStock`: update `batches[]` on positive adjustments — optional batch number + expiry fields in StockAdjustModal (shown only for `action === 'add'`). If provided, append new batch entry. If omitted, flat increment only. Negative adjustments stay flat (no FIFO). Decision locked: batch-aware add, flat remove. | **P1** | 1.5 hrs | FIFO drift on every manual adjustment |
| T2.153 | Pass `loading` from useInventory to InventoryTable. Add loading skeleton or spinner. | **P1** | 10 min | Empty state shown during initial fetch |
| T2.154 | Add `isAdmin` guard on scrubDatabase button in Inventory.jsx. Import `useUser()`. | **P1** | 5 min | Any user can trigger database-wide writes |
| T2.155 | ProductFormModal: add category required validation. Add costPrice `< 0` validation. | **P1** | 10 min | Empty category, negative cost allowed |
| T2.156 | StockAdjustModal: validate against `stock - reserved` not `stock`. Show "Available: X (Y reserved)" in modal. | **P2** | 15 min | Reserved stock removable |
| T2.157 | StockAdjustModal + ConfirmDeleteModal: `await` async callback before `onClose()`. | **P2** | 10 min | Optimistic close race in both modals |
| T2.158 | StockAdjustModal: add `useEffect` to reset form state when `open` or `item` changes. | **P2** | 5 min | Stale data on re-open |
| T2.159 | `archiveItem`: release reserved stock (set `reserved: 0`) before archiving. | **P2** | 10 min | Orphaned reservations |
| T2.160 | `deleteItem`: reverse order — write log first, then delete doc. Or wrap in transaction. | **P2** | 10 min | Unaudited permanent deletions |
| T2.161 | ConfirmDeleteModal: check for active appointments and reserved stock before archive. Show impact summary. | **P2** | 30 min | Blind archive |
| T2.162 | ProductFormModal quick-add category: add duplicate check, set `isMedicine: false` default, route through hook instead of direct Firestore write. | **P2** | 20 min | No audit trail, no dedup, no isMedicine |
| T2.163 | InventoryLogModal: add `limit(500)`, add error state UI, add `open` to useEffect deps for re-fetch on re-open. | **P2** | 15 min | Unbounded fetch, silent errors, stale data |
| T2.164 | Inventory.jsx: hide filter controls when Activity Log tab is active. | **P2** | 10 min | UX confusion |
| T2.165 | InventoryTable: add batch detail visibility — expandable row or tooltip showing `batches[]` with per-batch qty + expiry. | **P2** | 1.5 hrs | FIFO invisible to staff |
| T2.166 | KPI expiry count: iterate `batches[].expiryDate` in addition to top-level `expiryDate`. | **P2** | 15 min | Expired batches missed |
| T2.167 | Write `isMedicine` to inventory items on create/update (derive from category). Remove reliance on Queue.jsx runtime join. | **P2** | 20 min | Works by accident via runtime join |
| T2.168 | Delete dead code: `glassStyle`/`GLASS` (Inventory.jsx L232), `selectedCatObj` (ProductFormModal L17), dead `COLORS` imports (3 modals). | **P3** | 5 min | Cleanup |
| T2.169 | Design token compliance: import COLORS/TYPE, replace 100+ hardcoded hex values across 7 files. | **P3** | 1.5 hrs | Mechanical but needed for consistency |
| T2.170 | GlobalActivityLog: full filtering — action type multi-select, date range picker, product name search, user filter, paginated queries with `startAfter` cursor. Depends on T2.150. Decision locked: full scope. | **P2** | 3 hrs | No compromise — audit trail needs proper forensic tooling |
| T2.171 | `restoreItem`: clear `archivedAt` field on restore (use `deleteField()`). | **P3** | 5 min | Both timestamps coexist |
| T2.172 | InventoryTable: show negative margins as red percentage instead of "N/A". | **P3** | 10 min | Loss-making items invisible |
| T2.173 | Category seed idempotency: use `setDoc` with deterministic IDs instead of `addDoc` with random IDs. | **P3** | 15 min | Concurrent tabs create duplicates |
| T2.174 | Batch-aware negative stock adjustments: batch picker in StockAdjustModal for removals, per-batch deduction, partial batch handling. | **P3** | 2 hrs | Deferred — positive batch-aware (T2.152) ships first |
| T2.175 | Allergen safety system: `allergyTags[]` on ALL inventory products (not gated by isMedicine) + cart-add allergen check in ClinicalWorkspace handleAddRx + auto-bundle loop warning + Option C dispensing routing (`hasDrugsInCart \|\| hasAllergenTaggedItems`) + DispensingVerificationDialog per-item allergen cross-check with override badges. Depends on T2.119. | **P2** | 1.5 hrs | Decision locked: Option C + Approach 2 |
| T2.176 | Client-facing dispensing label: per-medication printable label in DispensingVerificationDialog (pet name, owner, drug, dosage, sig, vet, date, lot/expiry). Same window.open+print pattern as receipts. | **P2** | 1.5 hrs | Benefits from T2.147 (batch info at sale time) for lot/expiry |

### Late Inventory Tasks (Phase 3)

| ID | Name | Priority | Effort | Notes |
|---|---|---|---|---|
| T3.21 | Reorder point alerts: low-stock notification badge in Sidebar + printable "Reorder List" report | P3 | 2-3 hrs | In-app only (Spark) |
| T3.22 | Barcode/QR scanning for stock intake (camera or USB scanner, product lookup by SKU) | P3 | 3-5 days | Hardware-dependent |
| T3.23 | Inventory valuation report: value by category, COGS, margin analysis, turnover rate | P3 | 1-2 days | Overlaps T3.8 (reporting dashboard) |
| T3.24 | Expiry disposal workflow: "Dispose Expired" batch action, auto-find expired batches, batch-adjust | P3 | 1.5 hrs | Idempotent |
| T3.25 | Supplier directory: `suppliers` collection, `supplierId` on items, dropdown in ProductFormModal | P3 | 3-4 hrs | Free-text works for small clinics |
| T3.26 | Structured adjustment types: dropdown (recount/damage/expiry/theft/shipment/other) + `adjustmentType` field in logs | P3 | 1 hr | Enables shrinkage analytics |
| T3.27 | Inventory export (CSV/PDF): current list + activity log date-range export | P3 | 1 hr | |
| T3.28 | Internal ward/hospitalization medication labels: ward label with cage#, drug, route, frequency, staff | P3 | 1 hr | Only for clinics with overnight patients |
| T3.29 | Structured allergy entries with coded drug classes (Tier 2): drug class taxonomy, dual-mode picker, deterministic cross-reactivity detection. Supersedes keyword matching in T2.175. | P3 | 6-8 hrs | Touches 15+ files across admin + mobile |
| T3.30 | Barcode scan before product administration: in-clinic camera scanning, real-time allergen cross-check at point-of-use. Depends on T2.175 + T3.22. | P3 | 3-5 hrs | Hospital-grade safety |

### Dispensing Verification Hardening (from Inventory/Dispensing discussion)

| ID | Name | Priority | Effort | Notes |
|---|---|---|---|---|
| T2.188 | Services non-checkable in dispensing checklist: render for context with auto-checked greyed-out checkboxes, only products require manual verification. Button: "VERIFY ALL X PRODUCTS." User's pushback led to this design. | **P2** | 20 min | UX improvement for every dispensing interaction |
| T2.189 | Dosage/concentration display in dispensing checklist: propagate `dosage` from inventory item to cart item in ClinicalWorkspace handleAddRx + auto-bundle. Display per product row. | **P2** | 15 min | Pharmacy safety — "right drug, right dose" |
| T3.36 | Hold for vet review in dispensing: `dispensingHold` flag, DISPENSING_FLAGGED/FLAG_RESOLVED pulse events, amber badge, disabled verify until resolved | P3 | 1.5 hrs | Inter-staff clinical communication |
| T3.37 | Stock verification at dispensing time: fetch current stock on dialog mount, advisory warnings per item | P3 | 30 min | POSModal remains hard gate |
| T3.38 | Batch/lot selection at dispensing: batch picker per product, record in dispensingData. Depends on T2.165. | P3 | 1.5 hrs | Drug recall traceability |
| T3.39 | Partial dispensing support: qty input per item instead of checkbox, backorder tracking, modified qty to POS | P3 | 1 hr | Handles partial stock availability |

---

## Implementation Sketches for Key Tasks

### T2.149 — adjustStock Transaction with Floor Check

**useInventory.js** — replace L139-148:

```js
const adjustStock = async (id, itemName, amount, reason) => {
    if (!amount) throw new Error("Amount must be non-zero");
    if (!reason) throw new Error("A reason must be provided to adjust stock.");

    await runTransaction(db, async (transaction) => {
        const ref = doc(db, "inventory", id);
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error("Item not found");

        const data = snap.data();
        const currentStock = data.stock || 0;
        const reserved = data.reserved || 0;
        const newStock = currentStock + amount;

        if (newStock < 0) throw new Error(`Cannot reduce below zero. Current: ${currentStock}`);
        if (newStock < reserved) throw new Error(`Cannot reduce below reserved (${reserved}). Available: ${currentStock - reserved}`);

        transaction.update(ref, { stock: increment(amount) });
    });

    await logEvent(id, itemName, "ADJUSTED", amount, reason);
};
```

### T2.150 — Normalize Refund Log Schema

**useSalesData.js L79-80** — replace with consistent fields:

```js
transaction.set(logRef, {
    itemId: item.id,
    itemName: item.name,
    action: 'RESTOCK',                    // was: type: 'restock'
    amountChange: item.qty,               // was: quantity: item.qty (positive = stock added)
    reason: `Customer Refund (Receipt #${selectedSale.id.slice(0,5)})`,
    oldStock: data.stock,
    newStock: newStock,
    batchInfo: 'Returned Item',
    userId: currentUser?.id || null,       // was: missing
    userName: currentUser?.fullName || 'Unknown Staff',  // was: user: "Admin"
    timestamp: Timestamp.now()
});
```

**GlobalActivityLog.jsx L20-29** — add RESTOCK to ACTION_CONFIG:

```js
RESTOCK: { label: 'Restocked', color: '#1565C0', bg: '#EFF6FF', Icon: UnarchiveOutlinedIcon },
```

**Shared normalizeLog utility** — extract from InventoryLogModal to `src/utils/normalizeInventoryLog.js` for backward compat:

```js
export const normalizeInventoryLog = (log) => ({
    ...log,
    action: log.action || (log.type === 'sale' ? 'SOLD' : log.type?.toUpperCase() || 'UNKNOWN'),
    amountChange: log.amountChange ?? (log.quantity || 0),  // no negation — restock is positive
    userName: log.userName || log.user || 'System',
});
```

### T2.151 — Reserve/Release Transaction Guards

**useInventory.js** — replace L151-163:

```js
const reserveStock = async (id, qty) => {
    if (!qty || qty <= 0) return;
    await runTransaction(db, async (transaction) => {
        const ref = doc(db, "inventory", id);
        const snap = await transaction.get(ref);
        if (!snap.exists()) return;
        const data = snap.data();
        if ((data.reserved || 0) + qty > (data.stock || 0)) {
            throw new Error(`Cannot reserve ${qty} — only ${(data.stock || 0) - (data.reserved || 0)} available`);
        }
        transaction.update(ref, { reserved: increment(qty) });
    });
};

const releaseStock = async (id, qty) => {
    if (!qty || qty <= 0) return;
    await runTransaction(db, async (transaction) => {
        const ref = doc(db, "inventory", id);
        const snap = await transaction.get(ref);
        if (!snap.exists()) return;
        const data = snap.data();
        const newReserved = (data.reserved || 0) - qty;
        transaction.update(ref, { reserved: increment(-qty) });
        if (newReserved < 0) {
            transaction.update(ref, { reserved: 0 });
        }
    });
};
```

---

## Decisions Locked During Deep Dive

| Decision | Choice | Rationale |
|---|---|---|
| `isMedicine` denormalization (T2.167) | **Write to inventory items on create/update, derived from category flag. Category-level flag stays as source of truth. Queue.jsx join stays as backward-compat fallback. scrubDatabase re-derives on demand.** | Removes fragile runtime dependency. ~6 lines across 3 files. Stale-flag on category reclassification covered by existing scrubDatabase. |
| Batch-aware adjustments (T2.152) | **Batch fields (batchNumber + expiryDate) on positive adjustments only (optional). Flat decrement for negative adjustments. No FIFO on removals — staff notes batch in reason field if known.** | Adding stock = receiving a shipment with lot/expiry on the box. Removing stock = correction or loss where batch context is often unknown. Optional fields keep the workflow fast for clinics that don't track batches. |
| GlobalActivityLog filtering (T2.170) | **Full scope: action type multi-select, date range picker, product name search, user filter, paginated queries with `startAfter` cursor. Depends on T2.150 (refund log schema fix).** | No feature compromise. The global log is the audit surface for "show me everything that happened to inventory on Monday." Effort revised to 3 hrs. |
| No-expiry items in refund restock (T2.147 addendum) | **If refunded item has no `batchSource` AND original inventory item has no `batches[]`, just increment `stock` without creating a batch entry. No fake expiry for non-expiring products.** | Prevents phantom batch creation for products that have no expiry (surgical supplies, accessories, etc.). |
| `isMedicine` override (T2.167 detail) | **Derived from category with optional per-item override toggle in ProductFormModal. Toggle label communicates dispensing consequence ("Requires pharmacy dispensing verification"). Default from category, editable per-item.** | Allows fine-tuning which products trigger dispensing step. Override is explicit and labeled. |
| Allergen safety system (T2.175) | **Option C (route items with allergyTags through dispensing) + Approach 2 (cart-add time allergen check in ClinicalWorkspace). allergyTags on ALL products, not gated by isMedicine. Non-medicine products (food, shampoo, topicals) can trigger allergic reactions.** | Three-layer safety: (1) cart-add warning before vet uses product, (2) dispensing verification cross-check, (3) future barcode scan (T3.30). |
| Batch-aware negative adjustments (T2.174) | **Scoped as P3 future task. Positive batch-aware adjustments (T2.152) ship first. Negative adjustments stay flat for now — staff notes batch in reason field if known.** | Flat-remove path works today. Batch-aware removal requires batch picker UI (2 hrs). T2.152 fixes the bigger half of FIFO drift. |
| Dispensing labels (T2.176) | **Client-facing medication labels at dispensing time. Internal ward labels scoped as T3.28 (late task).** | Client needs drug name, dosage, sig, vet name on each container. Internal labels only relevant for overnight hospitalization clinics. |

---

## Cross-Cutting Findings

### Shared bugs with other modules

| Bug | Also affects | Existing task |
|---|---|---|
| Refund log field mismatch | Sales module (T2.139 touches same code) | T2.150 (new, overlaps T2.139) |
| `alert()` usage | Sales, Patients, Queue, ClinicalWorkspace | Multiple existing tasks |
| Hardcoded clinic name | POSModal, Sales receipts | T2.148 |
| Optimistic close race | ConfirmDeleteModal pattern seen in other modals | T2.157 |

### What the module does well

1. **Self-healing `reserved` field** — listener forces `reserved: data.reserved ?? 0` on read (L56), handling pre-existing docs that lack the field.
2. **`diffFields` engine** (L6-41) — purpose-built field-diff system with human-readable labels for audit logging. Tracks 12 metadata fields with before/after comparisons.
3. **Category deduplication** — `Inventory.jsx:117-124` deduplicates categories by lowercased name in the listener callback, preventing UI issues from Firestore duplicates.
4. **`scrubDatabase` idempotency** — uses `data.isMedicine ?? isMedicine` (L190), preserving existing values while filling gaps. Safe to re-run.
5. **KPI-as-filter pattern** — clicking KPI cards toggles stock filters. Same elegant pattern as Sales module's EodSummary tiles.
6. **Archive aliasing** — exporting `archiveItem` as `deleteItem` (L223) makes soft-delete the default behavior. Deliberate safety design.

---

## Files Fully Audited

| File | Lines | Key Findings |
|---|---|---|
| Inventory.jsx | 414 | loading not passed, no scrub role gate, dead glassStyle, 30+ hardcoded colors, category seed race |
| useInventory.js | 224 | P0 adjustStock no transaction, reserve/release no guards, batches ignored, log-after-delete, no reserve audit |
| InventoryTable.jsx | 312 | batches invisible, isMedicine invisible, expiry top-level only, negative margins hidden |
| GlobalActivityLog.jsx | 272 | P0 refund log field mismatch, no RESTOCK in ACTION_CONFIG, limit 300 no pagination, no filters |
| ProductFormModal.jsx | 427 | no category validation, negative costPrice, quick-add bypasses hook, dead selectedCatObj |
| StockAdjustModal.jsx | 120 | P0 negative stock (via useInventory), reserved ignored, stale form, optimistic close |
| InventoryLogModal.jsx | 117 | normalizeLog exists (good), no limit, no error UI, stale on re-open, negation bug |
| ConfirmDeleteModal.jsx | 92 | optimistic close, no impact check, COLORS dead import |
