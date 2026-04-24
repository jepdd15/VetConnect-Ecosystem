# Sales Module Deep Dive

> **Target files:** `VetConnect-Admin/src/features/Sales/` (3 files, commit `9d1f662`)
> **Companion documents:** [ECOSYSTEM_ARCHITECTURE_REPORT.md](ECOSYSTEM_ARCHITECTURE_REPORT.md), [PATIENTS_CRM_DEEPDIVE.md](PATIENTS_CRM_DEEPDIVE.md)
> **Audit method:** 3 codebase-architecture-researcher sub-agents in parallel, each performing forensic file-level analysis with cross-reference tracing against POSModal.jsx (writer) and usePatientManager.js (reader).

---

## Module Architecture

```
Sales/
├── Sales.jsx                    (440 lines) — Page component: ledger grid, refund modal, receipt reprint
├── hooks/
│   └── useSalesData.js          (89 lines)  — Data layer: Firestore listener, EOD aggregation, refund transaction
└── components/
    └── EodSummary.jsx           (79 lines)  — KPI tiles: Cash, GCash, Card & Bank, Total Revenue
```

### Component Connection Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Sales.jsx (page)                          │
│  13 useState hooks (date, search, filters, sort, refund modal)   │
│                                                                  │
│  useSalesData(filterDate) hook ───────────────────────────┐      │
│    ├── sales[]          (real-time from Firestore)        │      │
│    ├── loading                                            │      │
│    ├── eodTotals ─────────────────────────────────────┐   │      │
│    └── processRefundTransaction(sale, restock)        │   │      │
│                                                       │   │      │
│  ┌────────────────────────────────────────────────────┤   │      │
│  │  EodSummary                                        │   │      │
│  │  props:                                            │   │      │
│  │    totals ← eodTotals                              │   │      │
│  │    filterMethod ← Sales state (bidirectional)      │   │      │
│  │    setFilterMethod ← Sales setter                  │   │      │
│  │                                                    │   │      │
│  │  Renders 4 clickable KPI tiles                     │   │      │
│  │  Click toggles filterMethod → filters DataGrid     │   │      │
│  └────────────────────────────────────────────────────┘   │      │
│                                                           │      │
│  DataGrid (processedSales filtered+sorted)                │      │
│    Columns: Date, Receipt#, Patient&Owner, Items,         │      │
│             Method, Total Paid, Status, Actions            │      │
│    Actions per row: Reprint Receipt, Process Refund       │      │
└───────────────────────────────────────────────────────────┘

                         WRITERS                    READERS (other modules)
                    ┌──────────────┐           ┌──────────────────────────┐
                    │  POSModal    │           │  usePatientManager.js    │
                    │  (L341-361)  │           │  (L152-153)              │
                    │  Creates     │           │  Queries sales/          │
                    │  sales/ doc  │           │  by ownerName string     │
                    │  via txn     │           │  (NOT ownerId)           │
                    └──────────────┘           └──────────────────────────┘
```

---

## Firestore Read/Write Paths

### useSalesData.js — 1 Listener + 1 Transaction (3 collections)

| Operation | Collection | Query/Fields | Line | Type |
|---|---|---|---|---|
| **Read** (real-time) | `sales` | `where date >= startOfDay AND date <= endOfDay, orderBy date desc` | L17-22 | `onSnapshot` |
| **Write** (refund) | `sales/{id}` | `status: 'refunded', refundedAt: Timestamp.now()` | L60-61 | `transaction.update` |
| **Read** (refund) | `inventory/{id}` | stock, batches | L66-67 | `transaction.get` |
| **Write** (refund) | `inventory/{id}` | `stock: newStock, batches: [...]` | L77 | `transaction.update` |
| **Write** (refund) | `inventory_logs` | `itemId, itemName, type, quantity, reason, oldStock, newStock, batchInfo, user, timestamp` | L79-80 | `transaction.set` |

### Sales.jsx — No Direct Firestore Access

All data flows through `useSalesData` hook. Sales.jsx is purely UI.

### EodSummary.jsx — No Firestore Access

Pure presentation component. Receives `totals` prop from parent.

---

## Data Contract: POSModal (Writer) vs Sales Module (Reader)

### Sales doc schema written by POSModal (L341-361):

```js
transaction.set(saleRef, {
    appointmentId: patient.id,
    petName: patient.petName,
    ownerName: patient.ownerName || 'Walk-In',
    items: cart,                              // full cart array
    subtotal: parseFloat(financials.subtotal),
    discount: parseFloat(financials.discount),
    depositPaid: parseFloat(financials.deposit),
    total: parseFloat(financials.total),       // subtotal - discount (NOT minus deposit)
    paymentMethod: paymentMethod,
    hasScPwdDiscount: applyScPwd,
    date: Timestamp.now(),
    cashier: profile?.fullName || 'POS Cashier',
    cashierId: profile?.id || null,
    status: 'paid',
    prescribedItemCount: cart.filter(i => i.isPrescribed).length,
    cashierAddedItemCount: cart.filter(i => i.addedBy === 'cashier').length,
    hasUnprescribedAdditions: cart.some(i => i.addedBy === 'cashier'),
});
```

### Critical field: What does `total` mean?

From `POSModal.jsx:177`:
```js
const finalTotal = subtotal - discountAmount;
```
And `POSModal.jsx:179`:
```js
const balanceDue = finalTotal - deposit;
```

So **`sale.total` = subtotal minus SC/PWD discount, but BEFORE subtracting deposit.** The actual amount collected at the register is `balanceDue` = `total - depositPaid`. This distinction matters for EOD revenue.

### Fields read by Sales.jsx vs written by POSModal:

| Field | Written by POSModal | Read by Sales.jsx | Read by useSalesData |
|---|---|---|---|
| `appointmentId` | Yes | No | No |
| `petName` | Yes | Yes (grid L199) | No (via spread) |
| `ownerName` | Yes | Yes (grid L200) | No (via spread) |
| `items` | Yes | Yes (grid L209, reprint L108) | Yes (refund L64) |
| `subtotal` | Yes | Yes (reprint L151) | No |
| `discount` | Yes | Yes (reprint L152) | No |
| `depositPaid` | Yes | Yes (reprint L153) | No |
| `total` | Yes | Yes (grid L235) | Yes (aggregation L45) |
| `paymentMethod` | Yes | Yes (grid L218) | Yes (aggregation L46-49) |
| `hasScPwdDiscount` | Yes | Yes (reprint L152) | No |
| `date` | Yes (Timestamp) | Yes (via jsDate L28) | Yes (query filter L19-20) |
| `cashier` | Yes | Yes (reprint L144) | No |
| `cashierId` | Yes | No | No |
| `status` | Yes (`'paid'`) | Yes (grid L243) | Yes (aggregation L42) |
| `prescribedItemCount` | Yes | **No** | No |
| `cashierAddedItemCount` | Yes | **No** | No |
| `hasUnprescribedAdditions` | Yes | **No** | No |

**Missing `ownerId`**: POSModal writes `ownerName` but NOT `ownerId`. This is the same bug documented in PATIENTS_CRM_DEEPDIVE.md (T2.112). usePatientManager queries sales by `ownerName` string match.

---

## Bugs Found — Full Inventory with Code Quotes

### P1 — Financial & Data Integrity

#### BUG 1: EOD "TOTAL REVENUE" is semantically wrong — counts deposit money collected on other days

**Location:** `useSalesData.js:45`, `EodSummary.jsx:72-73`

```js
// useSalesData.js:45
total += sale.total;
```
```jsx
// EodSummary.jsx:72-73
<Typography ...>TOTAL REVENUE</Typography>
<Typography ...>₱{totals.total.toFixed(2)}</Typography>
```

**Impact:** `sale.total` = subtotal minus discount, but BEFORE subtracting `depositPaid` (see POSModal L177: `const finalTotal = subtotal - discountAmount`). If a customer paid a ₱500 deposit yesterday and the total bill is ₱2000, today's EOD counts the full ₱2000 — not the ₱1500 actually collected today. The deposit collected yesterday is never counted in any day's EOD. The label says "TOTAL REVENUE" but the number is neither gross revenue (that would include discount) nor cash collected today (that would subtract deposit).

#### BUG 2: Refund does NOT reverse appointment status from `completed`

**Location:** `useSalesData.js:60-61` (only touches sales doc, never appointments)

```js
// useSalesData.js:60-61
const saleRef = doc(db, "sales", selectedSale.id);
transaction.update(saleRef, { status: 'refunded', refundedAt: Timestamp.now() });
// NO appointment update anywhere in the refund transaction
```

Compare to POSModal (L363-368) which writes:
```js
transaction.update(apptRef, {
    status: 'completed',
    timeCompleted: Timestamp.now(),
    balanceRemaining: parseFloat(financials.balanceDue)
});
```

After refund, the appointment remains `completed` with a stale `balanceRemaining`. The appointment status lifecycle has no concept of refund.

#### BUG 3: Refund does NOT reverse CRM `outstandingBalance` increment

**Location:** `useSalesData.js:56-86` — no user doc update

POSModal increments the balance (L371-373):
```js
if (parseFloat(financials.balanceDue) > 0 && patient.ownerId ...) {
    const ownerRef = doc(db, "users", patient.ownerId);
    transaction.update(ownerRef, { outstandingBalance: increment(parseFloat(financials.balanceDue)) });
}
```

The refund transaction does not decrement it. The counter only goes up, never down. Note: T2.113 already plans to remove this counter in favor of computed-from-sales, which would self-correct. But until T2.113 ships, refunds inflate the balance.

#### BUG 4: Refund inventory log hardcodes `user: "Admin"`

**Location:** `useSalesData.js:80`

```js
transaction.set(logRef, {
    itemId: item.id, itemName: item.name, type: 'restock',
    quantity: item.qty,
    reason: `Customer Refund (Receipt #${selectedSale.id.slice(0,5)})`,
    oldStock: data.stock, newStock: newStock,
    batchInfo: 'Returned Item',
    user: "Admin",           // ← HARDCODED, should be actual staff
    timestamp: Timestamp.now()
});
```

Compare to POSModal (L334-335) which uses the actual user:
```js
userId: profile?.id || "pos_system",
userName: profile?.fullName || "POS System",
```

`useSalesData` hook never receives the current user profile. `Sales.jsx` does not import `useUser()` context.

#### BUG 5: No auth/role check on refund — any staff can process refunds

**Location:** `Sales.jsx:26` — no `useUser()` import or consumption

```js
export default function Sales() {
  // NO useUser() call anywhere in this component
  // The refund button renders for ALL users who can see the Sales page
```

The Sales page is already `adminOnly` in the Sidebar menu, but any user who navigates directly to `/sales` can access it. The refund action has no additional authorization check.

#### BUG 6: Print Report button has no `onClick` handler — dead UI element

**Location:** `Sales.jsx:347-351`

```jsx
<Tooltip title="Print Detailed Report">
  <IconButton sx={{ bgcolor: 'white', border: '1px solid #5D403733', color: '#5D4037' }}>
    <PrintIcon fontSize="small" />
  </IconButton>
</Tooltip>
// NO onClick handler — button renders but does nothing
```

Users see a print icon that does nothing when clicked. Misleading.

#### BUG 7: Refund date attribution is wrong — refund appears on original sale date, not refund date

**Location:** `useSalesData.js:60-61`

```js
transaction.update(saleRef, { status: 'refunded', refundedAt: Timestamp.now() });
// Only updates status and refundedAt — does NOT change the 'date' field
```

The Firestore query filters by `date` (L19-20), which is the original sale date. A sale made on Day 1 and refunded on Day 2 will show up as a refund entry in Day 1's view. Day 2's view shows nothing about it. The `refundedAt` field is written but never queried or displayed.

---

### P2 — Functional Issues

#### BUG 8: "Bank Transfer" missing from payment method filter dropdown

**Location:** `Sales.jsx:330-333`

```jsx
<MenuItem value="All">All Methods (Reset)</MenuItem>
<MenuItem value="Cash">Cash</MenuItem>
<MenuItem value="GCash">GCash / Maya</MenuItem>
<MenuItem value="Card">Card</MenuItem>
// NO "Bank Transfer" option
```

But `useSalesData.js:49` tracks bank transfers separately:
```js
else if (sale.paymentMethod === 'Bank Transfer') bank += sale.total;
```

And `EodSummary.jsx:62-63` combines Card + Bank in one tile:
```jsx
<Typography ...>CARD & BANK</Typography>
<Typography ...>₱{(totals.card + totals.bank).toFixed(2)}</Typography>
```

Clicking the "Card & Bank" tile only filters by `'Card'` — Bank Transfer sales are unfilterable via either the dropdown or the KPI tiles.

#### BUG 9: Refund restock creates fake batch with fabricated 1-year expiry

**Location:** `useSalesData.js:74-75`

```js
const nextYear = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 1);
batches.push({
    batchNumber: `RET-${selectedSale.id.slice(0,4)}`,
    expiryDate: nextYear.toISOString().split('T')[0],  // ← fabricated
    qty: item.qty,
    dateAdded: new Date().toISOString()
});
```

Returned items get a fake expiry date 1 year from refund date. The original batch expiry is not stored in the sale's `items[]` array, so it's lost at point of sale. This could mask expired products being re-shelved.

#### BUG 10: DataGrid has no pagination — `hideFooter={true}`

**Location:** `Sales.jsx:375`

```jsx
hideFooter={true}
```

All rows for a single day render at once with no pagination, no row count display. For a busy clinic with 100+ transactions/day, this degrades scrolling performance.

#### BUG 11: Refund feedback uses raw `alert()` instead of MUI components

**Location:** `Sales.jsx:100, 102`

```js
alert("Refund Processed Successfully!");
// ...
alert("Refund failed: " + error.message);
```

`window.alert()` is blocking and unstyled. The error message path could leak Firestore internals to the user.

#### BUG 12: No voided transaction handling — only `paid` and `refunded` exist

**Location:** `useSalesData.js:42-44`

```js
if (sale.status === 'refunded') {
    refunds += sale.total;
} else {
    // counts as revenue — no 'voided' check
```

There is no concept of voiding a transaction before it's fully processed. Only full refund exists. No partial refund. If a future feature introduces a `voided` status, those transactions would silently count as revenue.

#### BUG 13: Receipt reprint date fallback shows reprint time, not original sale time

**Location:** `Sales.jsx:107`

```js
const receiptDate = sale.jsDate ? sale.jsDate.toLocaleString() : new Date().toLocaleString();
```

If `jsDate` is missing (rare edge case), the receipt shows the current time instead of the original sale time. The `*** DUPLICATE RECEIPT (REPRINT) ***` badge is present (L135), but the date would be wrong.

#### BUG 14: `clinicalFlatStyle` is dead code

**Location:** `Sales.jsx:45-50`

```js
const clinicalFlatStyle = {
  bgcolor: 'white',
  border: '2px solid #5D4037',
  borderRadius: 0,
  boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
};
// NEVER referenced anywhere in the JSX
```

---

### P3 — Polish & Design

#### BUG 15: Dead imports

**Location:** `Sales.jsx:6-8`

```js
import { ... Divider, ... } from '@mui/material';  // Divider never used
import Grid from '@mui/material/Grid';              // Grid never used in Sales.jsx
```

#### BUG 16: `borderRadius: 1` on action icon buttons violates zero-radius design rule

**Location:** `Sales.jsx:256, 262`

```jsx
<IconButton ... sx={{ border: '1px solid rgba(21, 101, 192, 0.3)', borderRadius: 1 }}>
```

Design system mandates `borderRadius: 0` everywhere.

#### BUG 17: Scrollbar thumb uses `borderRadius: '4px'`

**Location:** `Sales.jsx:399`

```js
'&::-webkit-scrollbar-thumb': { background: '#5D4037', borderRadius: '4px' },
```

Minor design system deviation (browser chrome, cosmetic only).

#### BUG 18: Clinic name hardcoded in receipt reprint

**Location:** `Sales.jsx:137`

```html
<p class="clinic-name">Starbarks Veterinary Clinic</p>
```

Same issue in POSModal (L214). Should come from `clinic_settings/general` or a constant.

#### BUG 19: 60+ hardcoded color values across Sales module

Sales.jsx imports only `FONT` from designTokens (L24). Does NOT import `COLORS` or `TYPE`. EodSummary.jsx imports zero design tokens.

| Hardcoded | Token equivalent | Example locations |
|---|---|---|
| `'#5D4037'` | `COLORS.accent` | Sales L47, L178, L196, L281, L290, L294, L348, L381, L386 |
| `'#3E2723'` | `COLORS.brand` | Sales L181, L199, L292, L400; EodSummary L29-30, L69 |
| `'#FFF8E1'` | (Antique Cream bg) | Sales L273, L279, L380; EodSummary L50, L56, L62, L70 |
| `'#2E7D32'` | `COLORS.success` | Sales L218, L234, L419; EodSummary L49, L51 |
| `'#1565C0'` | `COLORS.medical` | Sales L190, L219; EodSummary L55, L57 |
| `'#D32F2F'` | `COLORS.danger` | Sales L407-408, L421, L428-430 |
| `'#F57C00'` | (no exact token) | Sales L220; EodSummary L61, L63 |
| `'#757575'` | (no exact token) | EodSummary L50, L56, L62 |
| `fontWeight: '1000'` | Should be `TYPE.label.fontWeight` (800) | ~25 occurrences across both files |

---

## Revenue Aggregation Analysis

### How EOD revenue is computed

**Step 1 — Firestore query** (`useSalesData.js:14-22`):
```js
const startOfDay = new Date(filterDate); startOfDay.setHours(0, 0, 0, 0);
const endOfDay = new Date(filterDate); endOfDay.setHours(23, 59, 59, 999);
const q = query(
    collection(db, "sales"),
    where("date", ">=", Timestamp.fromDate(startOfDay)),
    where("date", "<=", Timestamp.fromDate(endOfDay)),
    orderBy("date", "desc")
);
```

**Step 2 — Aggregation** (`useSalesData.js:39-52`):
```js
const eodTotals = useMemo(() => {
    let cash = 0, gcash = 0, card = 0, bank = 0, total = 0, refunds = 0;
    sales.forEach(sale => {
        if (sale.status === 'refunded') {
            refunds += sale.total;
        } else {
            total += sale.total;
            if (sale.paymentMethod === 'Cash') cash += sale.total;
            else if (sale.paymentMethod?.includes('GCash')) gcash += sale.total;
            else if (sale.paymentMethod === 'Card') card += sale.total;
            else if (sale.paymentMethod === 'Bank Transfer') bank += sale.total;
        }
    });
    return { cash, gcash, card, bank, total, refunds };
}, [sales]);
```

**Step 3 — Display** (`EodSummary.jsx:51-74`):
```jsx
₱{totals.cash.toFixed(2)}           // Cash tile
₱{totals.gcash.toFixed(2)}          // GCash tile
₱{(totals.card + totals.bank).toFixed(2)}  // Card & Bank tile (COMBINED)
₱{totals.total.toFixed(2)}          // "TOTAL REVENUE" tile
{totals.refunds > 0 && <Typography ...>- ₱{totals.refunds.toFixed(2)} [REFUNDS]</Typography>}
```

### Financial math verification

| Concern | Handled? | Details |
|---|---|---|
| **Voided transactions** | **No** | No `voided` status exists. Only `paid` and `refunded`. |
| **SC/PWD discounts** | **Partially** | `sale.total` already has discount subtracted (POSModal L177), so EOD total is post-discount. But the discount AMOUNT is not shown separately in EOD — only on receipt reprint. |
| **Deposits** | **No** | `sale.total` includes the deposit portion. EOD inflates revenue by the deposit amount (collected on a prior day). No deposit collection record exists. |
| **Refunds** | **Partially** | Refunded sales excluded from `total`, shown as separate annotation. But refund appears on ORIGINAL sale date, not refund date (BUG 7). |
| **Timezone** | **No** | `new Date(filterDate).setHours(0,0,0,0)` uses browser local time. A user in UTC+0 sees wrong results for Asia/Manila sales. |
| **Float precision** | **No** | `total += sale.total` accumulates JS float rounding. Minor — centavo-level drift. |

### Revenue gap example

```
Day 1: Customer deposits ₱500 (no record in sales collection)
Day 2: POS checkout — subtotal ₱2000, discount ₱0, total ₱2000, deposit ₱500
        → balanceDue = ₱1500 (actual cash collected)
        → sale.total = ₱2000 (what EOD sums)

Day 2 EOD shows: TOTAL REVENUE ₱2000
Day 2 actual cash collected: ₱1500
Day 1 deposit never counted anywhere
Discrepancy: ₱500
```

---

## Transaction Handling Summary

| Feature | Status | Details |
|---|---|---|
| **Full refund** | Implemented | `processRefundTransaction` in `useSalesData.js:56-86`. Atomic via `runTransaction`. Updates sale status + optionally restocks inventory. |
| **Partial refund** | **Not implemented** | All-or-nothing on entire sale. No item-level selection. |
| **Void (before close)** | **Not implemented** | No void concept. Only post-checkout refund. |
| **Receipt reprint** | Implemented | `handleReprint` in `Sales.jsx:106-173`. Opens popup window with styled HTML. Clearly labeled "DUPLICATE RECEIPT (REPRINT)". |
| **EOD report print** | **Not implemented** | Print button exists (L347-351) but has no onClick handler. |
| **CSV/PDF export** | **Not implemented** | No export functionality. |
| **SC/PWD discount display** | Partial | Shown on receipt reprint. NOT shown in DataGrid columns or EOD tiles. |
| **Deposit tracking** | Partial | `depositPaid` stored on sale doc. Shown on receipt reprint ("Less Deposit"). NOT visible in DataGrid or EOD. |

---

## Cross-Reference: usePatientManager Sales Query

**Location:** `usePatientManager.js:152-153`

```js
const unsubSales = onSnapshot(
    query(collection(db, "sales"), where("ownerName", "==", selectedClient.fullName)),
    ...
);
```

| Aspect | useSalesData | usePatientManager |
|---|---|---|
| Filter | Date range (Timestamp) | `ownerName == fullName` (string) |
| Scope | One day | All time |
| Purpose | Daily ledger | Client billing history |
| Join key | None (date-based) | `ownerName` (fragile) |
| Listener | Re-subscribes on date change | Re-subscribes on client change |

**Confirmed:** Two completely different query patterns for the same collection. The `ownerName` string match in usePatientManager is documented as BUG 1 in PATIENTS_CRM_DEEPDIVE.md (T2.112).

---

## Data Flow: End-to-End Sale Lifecycle

```
1. Vet signs off in ClinicalWorkspace
   └─► appointment.status = 'dispensing' or 'billing'

2. Cashier opens POSModal from Queue
   └─► Loads cart from appointment.prescribedItems
   └─► Cashier adjusts cart, applies SC/PWD, enters deposit
   └─► Clicks "PROCESS PAYMENT"

3. POSModal.runTransaction (atomic):
   ├─► inventory/{id} stock deduction (FIFO batches)
   ├─► inventory_logs audit entry per product (SOLD)
   ├─► sales/ doc creation (full schema above)
   ├─► appointments/{id} → status: 'completed'
   └─► users/{ownerId} → outstandingBalance increment (if balance due)

4. Sales page (useSalesData) picks up new sale via onSnapshot
   └─► Appears in DataGrid
   └─► eodTotals recalculated via useMemo

5. If cashier clicks REFUND:
   └─► processRefundTransaction.runTransaction (atomic):
       ├─► sales/{id} → status: 'refunded', refundedAt
       ├─► inventory/{id} stock restock (if restock=true)
       └─► inventory_logs audit entry (restock, user: "Admin")

   NOT DONE by refund:
   ├─► appointments/{id} NOT updated (stays 'completed')
   ├─► users/{ownerId}.outstandingBalance NOT decremented
   ├─► No clinicalPulse event written
   └─► No refundedAt displayed anywhere in UI
```

---

## Decisions Locked During Deep Dive

| Decision | Choice | Rationale |
|---|---|---|
| EOD primary number | **Dual display: "COLLECTED TODAY" primary + "total billed" secondary** | Staff needs drawer reconciliation (collected); accountant needs full billed amount. Both computed in eodTotals. |
| Refund access control | **Any Sales-page user** (no additional client-side gate) | Sales page is already adminOnly in Sidebar. T2.1 Firestore RBAC rules handle server-side enforcement (Spark-compatible — does NOT require Blaze). |
| Refund date attribution | **Option C — show on both days** (original sale day AND refund day) | Most complete audit picture. Requires dual Firestore query + deduplication. EOD refund total uses refund date. Single-shot implementation at 1.5 hrs. |
| Batch expiry on restock | **Option A — store at sale time** | POSModal FIFO loop already knows which batches it drew from. Persist batchNumber + expiryDate on each product item in the sales doc. Refund reads it back. Zero staff burden, accurate data. |

---

## Proposed Tasks

| ID | Name | Priority | Effort | Notes |
|---|---|---|---|---|
| T2.137 | EOD dual display: primary "COLLECTED TODAY" (total minus deposits), secondary "total billed" annotation. Expand eodTotals to track totalBilled, totalCollected, totalDeposits, totalDiscounts. Payment method tiles use collected amounts. | **P1** | 45 min | Decision locked: dual display |
| T2.138 | Refund: update appointment status to `billing` + reset `balanceRemaining` + write `TRANSACTION_REFUNDED` clinicalPulse event. Read `appointmentId` from sale doc. | **P1** | 30 min | Appointment lifecycle integrity |
| T2.139 | Refund: pass current user to `useSalesData` hook via `useUser()` in Sales.jsx. Replace hardcoded `"Admin"` with actual staff identity in inventory log. No additional client-side auth gate (T2.1 handles server-side). | **P1** | 20 min | Decision locked: any Sales-page user |
| T2.140 | Refund date: Option C — show on both days. Write `refundedAt` (already exists). Add second Firestore query `where("refundedAt", ">=", startOfDay)`. Merge + deduplicate results. Badge for cross-day refunds. EOD refund total uses refund date. | **P2** | 1.5 hrs | Decision locked: Option C |
| T2.141 | Add "Bank Transfer" to payment method filter dropdown (Sales.jsx L330-333). Fix Card tile click to also filter Bank Transfer sales. | **P2** | 10 min | Filter completeness |
| T2.142 | Wire Print Report button (Sales.jsx L347-351): generate EOD summary HTML with payment breakdown, transaction count, refund total. Use same `window.open` pattern. | **P2** | 1 hr | Dead UI element |
| T2.143 | Add DataGrid pagination: remove `hideFooter={true}`, set `pageSizeOptions={[25, 50, 100]}` | **P2** | 5 min | Performance at scale |
| T2.144 | Replace 3 `alert()` calls with MUI Snackbar (L100, L102, L171) | **P3** | 15 min | UX consistency |
| T2.145 | Delete dead code: `clinicalFlatStyle` (L45-50), `Divider` import (L6), `Grid` import (L8) | **P3** | 2 min | Cleanup |
| T2.146 | Design token compliance: import COLORS/TYPE, replace 60+ hardcoded hex values in Sales.jsx + EodSummary.jsx | **P3** | 30 min | Design system |
| T2.147 | Fix refund restock: store original batch info (batchNumber, expiryDate) on each product item in sales doc at POS checkout time. POSModal FIFO loop persists batch source per item. Refund reads it back instead of fabricating fake expiry. | **P3** | 30 min | Decision locked: Option A |
| T2.148 | Receipt clinic name from settings instead of hardcoded (Sales.jsx L137, POSModal L214) | **P3** | 15 min | Configurable |

---

## Implementation Sketches for Key Tasks

### T2.137 — EOD Dual Display (Decision: both numbers)

**useSalesData.js** — expand eodTotals computation:

```js
const eodTotals = useMemo(() => {
    let cash = 0, gcash = 0, card = 0, bank = 0;
    let totalBilled = 0, totalCollected = 0, totalDeposits = 0;
    let totalDiscounts = 0, refunds = 0;
    sales.forEach(sale => {
        if (sale.status === 'refunded') {
            refunds += sale.total;
        } else {
            totalBilled += sale.total;
            totalDeposits += (sale.depositPaid || 0);
            totalCollected += (sale.total - (sale.depositPaid || 0));
            totalDiscounts += (sale.discount || 0);
            const collected = sale.total - (sale.depositPaid || 0);
            if (sale.paymentMethod === 'Cash') cash += collected;
            else if (sale.paymentMethod?.includes('GCash')) gcash += collected;
            else if (sale.paymentMethod === 'Card') card += collected;
            else if (sale.paymentMethod === 'Bank Transfer') bank += collected;
        }
    });
    return { cash, gcash, card, bank, totalBilled, totalCollected, totalDeposits, totalDiscounts, refunds };
}, [sales]);
```

**EodSummary.jsx** — update Total tile with dual display:
```jsx
<Typography variant="caption" ...>COLLECTED TODAY</Typography>
<Typography variant="h4" ...>₱{totals.totalCollected.toFixed(2)}</Typography>
<Typography variant="caption" ...>₱{totals.totalBilled.toFixed(2)} total billed</Typography>
{totals.totalDeposits > 0 && <Typography variant="caption" ...>(₱{totals.totalDeposits.toFixed(2)} via prior deposits)</Typography>}
{totals.refunds > 0 && <Typography variant="caption" color="error" ...>- ₱{totals.refunds.toFixed(2)} [REFUNDS]</Typography>}
```

### T2.138 — Refund Appointment Status Reversal

**useSalesData.js** — inside `processRefundTransaction`, after sale status update:

```js
// After L61:
if (selectedSale.appointmentId) {
    const apptRef = doc(db, "appointments", selectedSale.appointmentId);
    const apptDoc = await transaction.get(apptRef);
    if (apptDoc.exists()) {
        transaction.update(apptRef, {
            status: 'billing',
            balanceRemaining: selectedSale.total,
        });
        transaction.update(apptRef, {
            clinicalPulse: arrayUnion({
                eventId: `pulse_refund_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
                type: 'TRANSACTION_REFUNDED',
                fromStatus: 'completed',
                toStatus: 'billing',
                timestamp: Timestamp.now(),
                staffId: currentUser?.id || 'system',
                staffName: currentUser?.fullName || 'System',
                note: `Full refund processed. Receipt #${selectedSale.id.slice(0,5)}. Restock: ${restock ? 'yes' : 'no'}.`
            })
        });
    }
}
```

Requires `currentUser` to be passed into the hook — see T2.139.

### T2.139 — Pass Current User to useSalesData (Decision: any Sales-page user)

**useSalesData.js** — change hook signature:

```js
export function useSalesData(filterDate, currentUser) {
    // ... existing code ...
    
    const processRefundTransaction = async (selectedSale, restock) => {
        // ... inside transaction:
        transaction.set(logRef, {
            ...existingFields,
            user: currentUser?.fullName || "Unknown Staff",
            userId: currentUser?.id || null,
        });
    };
}
```

**Sales.jsx** — consume UserContext (no additional auth gate per locked decision):

```js
import { useUser } from '../../context/UserContext';

export default function Sales() {
    const { profile } = useUser();
    const { sales, loading, eodTotals, processRefundTransaction } = useSalesData(filterDate, profile);
}
```

### T2.140 — Refund Date Attribution (Decision: Option C — both days)

**useSalesData.js** — add second query for cross-day refunds:

```js
useEffect(() => {
    setLoading(true);
    const startOfDay = new Date(filterDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(filterDate); endOfDay.setHours(23, 59, 59, 999);

    // Query 1: sales made on this day (existing)
    const qSales = query(
        collection(db, "sales"),
        where("date", ">=", Timestamp.fromDate(startOfDay)),
        where("date", "<=", Timestamp.fromDate(endOfDay)),
        orderBy("date", "desc")
    );

    // Query 2: refunds processed on this day (for sales made on OTHER days)
    const qRefunds = query(
        collection(db, "sales"),
        where("refundedAt", ">=", Timestamp.fromDate(startOfDay)),
        where("refundedAt", "<=", Timestamp.fromDate(endOfDay)),
        where("status", "==", "refunded")
    );

    let salesData = [], refundData = [];
    const merge = () => {
        // Deduplicate: if a sale was made AND refunded today, it appears in both
        const seen = new Set();
        const merged = [];
        for (const s of salesData) { seen.add(s.id); merged.push(s); }
        for (const r of refundData) {
            if (!seen.has(r.id)) {
                merged.push({ ...r, _crossDayRefund: true }); // badge flag
            }
        }
        setSales(merged);
        setLoading(false);
    };

    const unsub1 = onSnapshot(qSales, (snap) => {
        salesData = snap.docs.map(d => ({ id: d.id, ...d.data(), jsDate: d.data().date?.toDate() }));
        merge();
    });
    const unsub2 = onSnapshot(qRefunds, (snap) => {
        refundData = snap.docs.map(d => ({ id: d.id, ...d.data(), jsDate: d.data().date?.toDate() }));
        merge();
    });

    return () => { unsub1(); unsub2(); };
}, [filterDate]);
```

**Sales.jsx grid** — badge for cross-day refunds:
```jsx
// In status column renderCell:
{sale._crossDayRefund && (
    <Typography variant="caption" color="textSecondary">
        sold {sale.jsDate?.toLocaleDateString()}
    </Typography>
)}
```

**eodTotals** — refund total uses refund date (cross-day refunds counted in today's refunds):
```js
// Cross-day refunds have _crossDayRefund: true — count them in refunds
if (sale.status === 'refunded') {
    refunds += sale.total;
}
```

**Note:** Requires composite Firestore index on `refundedAt + status`.

### T2.141 — Bank Transfer Filter Fix

**Sales.jsx L330-333** — add Bank Transfer option:

```jsx
<MenuItem value="All">All Methods (Reset)</MenuItem>
<MenuItem value="Cash">Cash</MenuItem>
<MenuItem value="GCash">GCash / Maya</MenuItem>
<MenuItem value="Card">Card</MenuItem>
<MenuItem value="Bank Transfer">Bank Transfer</MenuItem>
```

**Sales.jsx L64** — update filter to handle combined Card & Bank tile:

```js
const matchMethod = filterMethod.includes('All') ||
    filterMethod.includes(s.paymentMethod) ||
    (filterMethod.includes('Card') && s.paymentMethod === 'Bank Transfer');
```

Or change the EodSummary Card tile to set both `['Card', 'Bank Transfer']` on click.

### T2.147 — Store Batch Info at Sale Time (Decision: Option A)

**POSModal.jsx** — inside the FIFO deduction loop (~L290-338), persist batch source per item:

```js
// After FIFO deduction, before writing the sale doc:
// Add batchSource to each product cart item
const enrichedCart = cart.map(item => {
    if (item.type !== 'product') return item;
    // batchesUsed is already built during FIFO deduction
    const source = item._batchesUsed || [];
    return {
        ...item,
        batchSource: source.map(b => ({
            batchNumber: b.batchNumber,
            expiryDate: b.expiryDate,
            qtyFromBatch: b.qtyUsed
        }))
    };
});
// Use enrichedCart in the sale doc instead of raw cart
transaction.set(saleRef, { ...saleFields, items: enrichedCart });
```

**useSalesData.js** — refund restock reads batch source instead of fabricating:

```js
// Replace L74-75:
if (item.batchSource && item.batchSource.length > 0) {
    item.batchSource.forEach(src => {
        const existing = batches.find(b => b.batchNumber === src.batchNumber);
        if (existing) { existing.qty += src.qtyFromBatch; }
        else { batches.push({ batchNumber: src.batchNumber, expiryDate: src.expiryDate, qty: src.qtyFromBatch, dateAdded: new Date().toISOString() }); }
    });
} else {
    // Fallback for legacy sales without batchSource
    const nextYear = new Date(); nextYear.setFullYear(nextYear.getFullYear() + 1);
    batches.push({ batchNumber: `RET-${selectedSale.id.slice(0,4)}`, expiryDate: nextYear.toISOString().split('T')[0], qty: item.qty, dateAdded: new Date().toISOString() });
}
```

---

## Cross-Cutting Findings

### Shared bugs with other modules

| Bug | Also affects | Existing task |
|---|---|---|
| `ownerName` join instead of `ownerId` | usePatientManager billing | T2.112 |
| `outstandingBalance` counter drift | PatientDashboard, ClientHeader | T2.113 |
| Hardcoded clinic name in receipts | POSModal.jsx L214 | T2.148 (new) |
| `alert()` instead of MUI Snackbar | Queue.jsx, Patients.jsx, ClinicalWorkspace.jsx | Multiple existing tasks |

### What the module does well

1. **Atomic refund transaction** — `runTransaction` correctly groups sale status update + inventory restock + audit log into one atomic operation. No partial writes.
2. **Restock toggle** — giving the cashier the option to NOT restock (for opened/damaged items) is thoughtful.
3. **EodSummary as filter control** — KPI tiles doubling as clickable filter toggles is elegant UX. The multi-select toggle logic in `handleToggle` (EodSummary L6-22) correctly handles edge cases (empty selection defaults to 'All').
4. **Receipt reprint** — clearly labeled as "DUPLICATE RECEIPT (REPRINT)" with dashed badge. Good audit practice.
5. **Proper listener cleanup** — `useSalesData.js:36` returns unsubscribe function. No memory leaks.

---

## Files Fully Audited

| File | Lines | Key Findings |
|---|---|---|
| Sales.jsx | 440 | Dead print button, dead code (clinicalFlatStyle), no auth check, 60+ hardcoded colors, `alert()` calls, no pagination, receipt clinic name hardcoded |
| useSalesData.js | 89 | Refund doesn't reverse appointment/balance, hardcoded "Admin" in logs, fake batch expiry, EOD revenue semantics wrong, proper listener cleanup |
| EodSummary.jsx | 79 | Card+Bank display/filter mismatch, "TOTAL REVENUE" label misleading, all colors hardcoded, stateless (good) |
| POSModal.jsx | 554 (partial) | Cross-referenced L165-180 (financial math) and L341-374 (sale+appointment writes). Confirmed `total` = post-discount pre-deposit. |
| usePatientManager.js | 295 (partial) | Cross-referenced L152-153. Confirmed ownerName string-match query (T2.112). |
