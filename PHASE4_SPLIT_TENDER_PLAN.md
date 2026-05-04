# T4.150 — POS Split-Tender (Multiple Payment Methods)

## Overview

Replace POSModal's single `paymentMethod` state with a multi-tender system that lets cashiers split a transaction across payment methods (e.g., "P500 cash, rest on GCash"). The UI follows a sequential-add pattern: one payment row by default (zero extra clicks for the 90% single-method case), with an "Add Payment Method" button for split scenarios. Data model uses dual-write: a new `paymentTenders[]` array on sale docs alongside the legacy `paymentMethod` string for backward compatibility. EOD totals, ledger display, receipts, and filtering all update to read the tenders array with fallback to the legacy field.

### Locked Decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Data model | Dual-write: `paymentTenders[]` + legacy `paymentMethod` (largest tender) |
| D2 | UI pattern | Sequential add: default 1 row, "+ Add Payment Method" button, remainder auto-fill |
| D3 | Cash change | Per-Cash-tender tendered/change fields (absorbs T4.148 state into tender row) |
| D4 | Checkout guard | `remaining > 0` OR any Cash tender insufficient OR loading OR discount-without-reason |

### Assumptions

- No new npm dependencies required.
- The four payment methods remain: Cash, GCash, Card, Bank Transfer.
- Firestore indexes do not need changes (paymentTenders is written but never queried with `where`).
- No Blaze upgrade or external blockers identified.

---

## Files Touched

| File | Action | Lines Affected |
|------|--------|----------------|
| `VetConnect-Admin/src/components/POSModal.jsx` | Modify | ~15 sites across 1334 lines |
| `VetConnect-Admin/src/features/Sales/hooks/useSalesData.js` | Modify | Lines 91-114 (eodTotals) |
| `VetConnect-Admin/src/features/Sales/Sales.jsx` | Modify | Lines 71-72 (filter), 179 (reprint), 319-329 (Method column) |
| `VetConnect-Admin/src/features/Sales/components/EodSummary.jsx` | No change | Already consumes `totals.cash/gcash/card/bank` — upstream fix in useSalesData is sufficient |

---

## Phase 1: State Model Refactor (POSModal.jsx)

**Goal**: Replace single `paymentMethod` + `amountTendered` state with a `paymentTenders[]` array. Each tender is `{ method, amount, amountTendered, changeDue }`.

### Step 1.1 — Replace state declarations

**Where**: `POSModal.jsx`, lines 46 and 52-53.

**What**: Remove:
```js
const [paymentMethod, setPaymentMethod] = useState('Cash');
// ...
const [amountTendered, setAmountTendered] = useState('');
```

Add:
```js
// T4.150: Multi-tender state — array of { method, amount, amountTendered }.
// Default: one Cash tender for the full balance. Replaces single paymentMethod + amountTendered.
const [paymentTenders, setPaymentTenders] = useState([
  { method: 'Cash', amount: '', amountTendered: '' }
]);
```

**Why**: Central state change that everything else derives from.

**Depends on**: Nothing.

**Done when**: Component renders without errors; single payment row visible with Cash selected.

### Step 1.2 — Add tender management helpers

**Where**: `POSModal.jsx`, after the new state declaration (around line 50).

**What**: Add these helper functions:
```js
// T4.150: Derive the legacy paymentMethod (largest tender by amount) for backward compat.
const primaryPaymentMethod = useMemo(() => {
  if (paymentTenders.length === 0) return 'Cash';
  if (paymentTenders.length === 1) return paymentTenders[0].method;
  const sorted = [...paymentTenders].sort((a, b) =>
    (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0)
  );
  return sorted[0].method;
}, [paymentTenders]);

// T4.150: Tender CRUD helpers.
const updateTender = (index, field, value) => {
  setPaymentTenders(prev => {
    const next = [...prev];
    next[index] = { ...next[index], [field]: value };
    return next;
  });
};

const addTender = () => {
  // Pick first unused method, defaulting to GCash.
  const usedMethods = new Set(paymentTenders.map(t => t.method));
  const available = ['GCash', 'Cash', 'Card', 'Bank Transfer'].find(m => !usedMethods.has(m)) || 'GCash';
  setPaymentTenders(prev => [...prev, { method: available, amount: '', amountTendered: '' }]);
};

const removeTender = (index) => {
  if (paymentTenders.length <= 1) return; // Minimum 1 row
  setPaymentTenders(prev => prev.filter((_, i) => i !== index));
};
```

**Why**: Encapsulates all tender mutations; keeps JSX clean.

**Depends on**: Step 1.1.

**Done when**: `addTender()` / `removeTender()` / `updateTender()` callable without error.

### Step 1.3 — Derive computed values (remaining, cash checks)

**Where**: `POSModal.jsx`, replacing lines 387-394 (the old `parsedTendered` / `changeDue` / `isCashInsufficient` block).

**What**: Remove the old derived values and add:
```js
// T4.150: Multi-tender derived values.
// Total amount allocated across all tender rows.
const totalTendered = useMemo(() =>
  paymentTenders.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0),
  [paymentTenders]
);
const balanceDueNum = parseFloat(financials.balanceDue) || 0;
const remaining = Math.max(0, balanceDueNum - totalTendered);

// Per-Cash-tender insufficiency: true if any Cash tender has amountTendered < its amount.
const anyCashInsufficient = paymentTenders.some(t =>
  t.method === 'Cash'
  && t.amountTendered !== ''
  && (parseFloat(t.amountTendered) || 0) < (parseFloat(t.amount) || 0)
);

// Helper: compute change due for a single Cash tender row.
const getChangeDue = (tender) => {
  if (tender.method !== 'Cash') return 0;
  const tendered = parseFloat(tender.amountTendered) || 0;
  const amt = parseFloat(tender.amount) || 0;
  return Math.max(0, tendered - amt);
};
```

**Why**: These replace the old single-method derived values and feed the checkout guard + UI.

**Depends on**: Step 1.1.

**Done when**: `remaining`, `anyCashInsufficient`, `getChangeDue` compute correct values.

### Step 1.4 — Auto-fill remainder on first/second tender amount change

**Where**: `POSModal.jsx`, inside or alongside `updateTender`.

**What**: Enhance `updateTender` so that when the `amount` field changes on any tender, the LAST tender row auto-fills with the remainder:
```js
const updateTender = (index, field, value) => {
  setPaymentTenders(prev => {
    const next = [...prev];
    next[index] = { ...next[index], [field]: value };

    // T4.150: Auto-fill the last row with the remainder when any amount changes.
    if (field === 'amount' && next.length > 1) {
      const otherSum = next.reduce((sum, t, i) =>
        i === next.length - 1 ? sum : sum + (parseFloat(t.amount) || 0), 0
      );
      const bal = parseFloat(financials.balanceDue) || 0;
      const leftover = Math.max(0, bal - otherSum);
      // Only auto-fill the last row if the user is editing a non-last row.
      if (index !== next.length - 1) {
        next[next.length - 1] = { ...next[next.length - 1], amount: leftover > 0 ? leftover.toFixed(2) : '' };
      }
    }
    return next;
  });
};
```

**Why**: Key UX requirement from D2 — "when cashier types amount in row 1, row 2 auto-fills remainder."

**Depends on**: Step 1.2.

**Done when**: Typing "500" in row 1 auto-fills row 2 with `balanceDue - 500`.

### Step 1.5 — Reset tenders on modal open

**Where**: `POSModal.jsx`, line 184 inside the `initPOS` function.

**What**: Replace:
```js
setPaymentMethod('Cash');
// ...
setAmountTendered('');
```
With:
```js
setPaymentTenders([{ method: 'Cash', amount: '', amountTendered: '' }]);
```

Also in line 186, remove `setAmountTendered('')` (already gone with state removal).

**Depends on**: Step 1.1.

**Done when**: Each time POSModal opens, tenders reset to a single Cash row.

### Step 1.6 — Remove the old paymentMethod useEffect

**Where**: `POSModal.jsx`, lines 203-206.

**What**: Delete the entire `useEffect` block:
```js
// T4.148: Clear tendered amount when switching to a non-Cash payment method.
useEffect(() => {
  if (paymentMethod !== 'Cash') setAmountTendered('');
}, [paymentMethod]);
```

**Why**: The `amountTendered` field is now per-tender-row. When a tender's method changes to non-Cash, we clear its `amountTendered` inline in `updateTender`.

**What to add**: Extend `updateTender` — when `field === 'method'` and the new value is not 'Cash', clear that tender's `amountTendered`:
```js
if (field === 'method' && value !== 'Cash') {
  next[index] = { ...next[index], [field]: value, amountTendered: '' };
}
```

**Depends on**: Step 1.2.

**Done when**: Switching a tender from Cash to GCash clears its tendered field.

### Verification Checkpoint (Phase 1)

- POSModal renders with no console errors.
- Single Cash tender row visible (default state).
- `remaining` correctly tracks `balanceDue - sum(tender amounts)`.
- All references to the old `paymentMethod` / `amountTendered` / `setPaymentMethod` / `setAmountTendered` / `parsedTendered` / `changeDue` / `isCashInsufficient` are removed or replaced.

---

## Phase 2: Receipt & Checkout Transaction Updates (POSModal.jsx)

**Goal**: Update receipt HTML, sale doc writes, and pulse events to use multi-tender data.

### Step 2.1 — Update receipt HTML payment section

**Where**: `POSModal.jsx`, lines 490-494 inside `generateReceiptHTML`.

**What**: Replace the single payment method + tendered/change block with a multi-tender section:
```js
// T4.150: Multi-tender receipt section.
const tenderLines = paymentTenders.map(t => {
  const amt = parseFloat(t.amount) || 0;
  let line = `<div class="total-row" style="font-size:12px; color:#555;"><span>${t.method}:</span><span>P${amt.toFixed(2)}</span></div>`;
  if (t.method === 'Cash' && t.amountTendered && parseFloat(t.amountTendered) > 0) {
    const tendered = parseFloat(t.amountTendered);
    const change = Math.max(0, tendered - amt);
    line += `<div class="total-row" style="font-size:11px; color:#888; margin-left:10px;"><span>&nbsp;&nbsp;Tendered:</span><span>P${tendered.toFixed(2)}</span></div>`;
    line += `<div class="total-row" style="font-size:11px; color:#888; font-weight:bold; margin-left:10px;"><span>&nbsp;&nbsp;Change:</span><span>P${change.toFixed(2)}</span></div>`;
  }
  return line;
}).join('');
```

Then in the receipt template, replace:
```html
<div class="total-row" style="..."><span>Payment Method:</span><span>${paymentMethod}</span></div>
${paymentMethod === 'Cash' && parsedTendered > 0 ? `...` : ''}
```
With:
```html
<div class="total-row" style="margin-top:5px; font-size:12px; color:#555; font-weight:bold;"><span>Payment:</span><span>${paymentTenders.length > 1 ? 'Split' : primaryPaymentMethod}</span></div>
${tenderLines}
```

**Depends on**: Phase 1 complete.

**Done when**: Receipt shows each tender on its own line with per-Cash tendered/change.

### Step 2.2 — Update sale doc writes (group + individual)

**Where**: `POSModal.jsx`, line 733 (group branch) and line 790 (individual branch).

**What**: In BOTH `transaction.set(saleRef, { ... })` calls:

1. Replace `paymentMethod,` with:
```js
paymentMethod: primaryPaymentMethod,  // Legacy compat: largest tender
paymentTenders: paymentTenders.map(t => ({
  method: t.method,
  amount: parseFloat(t.amount) || 0,
  ...(t.method === 'Cash' && t.amountTendered ? {
    amountTendered: parseFloat(t.amountTendered),
    changeDue: getChangeDue(t),
  } : {}),
})),
```

2. Update `cashAuditFields` (lines 690-693). Replace:
```js
const cashAuditFields = {
  amountTendered: paymentMethod === 'Cash' && amountTendered !== '' ? parsedTendered : null,
  changeDue: paymentMethod === 'Cash' && amountTendered !== '' ? changeDue : null,
};
```
With:
```js
// T4.150: Cash audit fields — aggregate across all Cash tenders for backward compat.
const cashTenders = paymentTenders.filter(t => t.method === 'Cash' && t.amountTendered !== '');
const totalCashTendered = cashTenders.reduce((s, t) => s + (parseFloat(t.amountTendered) || 0), 0);
const totalCashChange = cashTenders.reduce((s, t) => s + getChangeDue(t), 0);
const cashAuditFields = {
  amountTendered: cashTenders.length > 0 ? totalCashTendered : null,
  changeDue: cashTenders.length > 0 ? totalCashChange : null,
};
```

**Why**: Dual-write ensures old readers see `paymentMethod` (string) while new readers see `paymentTenders[]`.

**Depends on**: Step 1.3 (for `primaryPaymentMethod`, `getChangeDue`).

**Done when**: Sale docs in Firestore contain both `paymentMethod` and `paymentTenders[]` after checkout.

### Step 2.3 — Update pulse event notes

**Where**: `POSModal.jsx`, line 768 (group pulse) and line 818 (individual pulse).

**What**: Replace `via ${paymentMethod}` with:
```js
`via ${paymentTenders.length > 1 ? 'split (' + paymentTenders.map(t => t.method).join('+') + ')' : primaryPaymentMethod}`
```

Line 768 becomes:
```js
note: `Group checkout: ₱${apptBreakdown?.subtotal?.toFixed(2) || '0.00'} (subtotal) via ${paymentTenders.length > 1 ? 'split (' + paymentTenders.map(t => t.method).join('+') + ')' : primaryPaymentMethod}`,
```

Line 818 becomes:
```js
note: `Checkout: ₱${financials.total} via ${paymentTenders.length > 1 ? 'split (' + paymentTenders.map(t => t.method).join('+') + ')' : primaryPaymentMethod}`,
```

**Depends on**: Step 1.2.

**Done when**: Pulse events show "via split (Cash+GCash)" for split tenders.

### Verification Checkpoint (Phase 2)

- Checkout completes without error for both single and split tenders.
- Firestore sale doc has both `paymentMethod: 'Cash'` and `paymentTenders: [{...}]`.
- Receipt HTML shows each tender on a separate line.
- Pulse events show the correct method string.

---

## Phase 3: Payment Method UI Replacement (POSModal.jsx)

**Goal**: Replace the single payment method Select + Cash tendered/change block (lines 1187-1232) with the sequential-add tenders UI.

### Step 3.1 — Replace PAYMENT METHOD Paper section

**Where**: `POSModal.jsx`, lines 1187-1232 (the entire Paper block starting with `PAYMENT METHOD`).

**What**: Replace with the multi-tender UI:

```jsx
<Paper variant="outlined" sx={{ p: 2, bgcolor: COLORS.cardBg, borderRadius: 0 }}>
  <Typography variant="subtitle2" fontWeight="900" color="textSecondary" gutterBottom>
    PAYMENT METHOD
  </Typography>

  {paymentTenders.map((tender, idx) => (
    <Box key={idx} sx={{
      display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5,
      p: 1.5, border: `2px solid ${COLORS.border}`, borderRadius: 0,
      bgcolor: COLORS.formBg,
      ...(paymentTenders.length > 1 ? { boxShadow: `3px 3px 0px ${COLORS.accent}1A` } : {}),
    }}>
      {/* Row: Method dropdown + Amount + Remove */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <Select
            value={tender.method}
            onChange={(e) => updateTender(idx, 'method', e.target.value)}
            sx={{ borderRadius: 0, fontWeight: 900, fontSize: '0.8rem' }}
          >
            <MenuItem value="Cash">Cash</MenuItem>
            <MenuItem value="GCash">GCash / Maya</MenuItem>
            <MenuItem value="Card">Credit / Debit Card</MenuItem>
            <MenuItem value="Bank Transfer">Bank Transfer</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small" type="number" fullWidth
          placeholder={balanceDueNum.toFixed(2)}
          value={tender.amount}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '' || parseFloat(v) >= 0) updateTender(idx, 'amount', v);
          }}
          InputProps={{
            startAdornment: <InputAdornment position="start">₱</InputAdornment>,
            inputProps: { min: 0 },
          }}
          sx={{ bgcolor: COLORS.cardBg, borderRadius: 0 }}
        />
        {paymentTenders.length > 1 && (
          <IconButton
            size="small"
            onClick={() => removeTender(idx)}
            sx={{ color: COLORS.danger, border: `1px solid ${COLORS.danger}4D`, borderRadius: 0 }}
          >
            <RemoveCircleIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Cash-specific: Amount Tendered + Change Due */}
      {tender.method === 'Cash' && (
        <Box sx={{ mt: 0.5 }}>
          <TextField
            fullWidth size="small" label="Amount Tendered"
            type="number"
            value={tender.amountTendered}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || parseFloat(v) >= 0) updateTender(idx, 'amountTendered', v);
            }}
            error={
              tender.amountTendered !== ''
              && (parseFloat(tender.amountTendered) || 0) < (parseFloat(tender.amount) || 0)
            }
            helperText={
              tender.amountTendered !== ''
              && (parseFloat(tender.amountTendered) || 0) < (parseFloat(tender.amount) || 0)
                ? 'Insufficient amount'
                : ''
            }
            InputProps={{
              startAdornment: <InputAdornment position="start">₱</InputAdornment>,
              inputProps: { min: 0 },
            }}
            sx={{ bgcolor: COLORS.cardBg, mb: 1 }}
          />
          {(parseFloat(tender.amountTendered) || 0) > 0
            && (parseFloat(tender.amountTendered) || 0) >= (parseFloat(tender.amount) || 0) && (
            <Box sx={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              p: 1.5, bgcolor: COLORS.kpiGreenBg, border: `2px solid ${COLORS.success}`,
              borderRadius: 0,
            }}>
              <Typography variant="subtitle2" fontWeight={900} color={COLORS.success}>
                CHANGE DUE:
              </Typography>
              <Typography variant="h6" fontWeight={900} color={COLORS.success}>
                ₱{getChangeDue(tender).toFixed(2)}
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  ))}

  {/* Add Payment Method button */}
  {paymentTenders.length < 4 && (
    <Button
      fullWidth
      variant="outlined"
      size="small"
      onClick={addTender}
      sx={{
        mt: 0.5, borderRadius: 0, fontWeight: 900,
        color: COLORS.sky, borderColor: COLORS.sky,
        borderStyle: 'dashed', borderWidth: 2,
        '&:hover': { borderColor: COLORS.skyHover, bgcolor: COLORS.chipBlueBg },
      }}
    >
      + ADD PAYMENT METHOD
    </Button>
  )}

  {/* Remaining balance indicator */}
  <Box sx={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    mt: 1.5, p: 1.5, borderRadius: 0,
    bgcolor: remaining > 0.005 ? COLORS.kpiOrangeBg : COLORS.kpiGreenBg,
    border: `2px solid ${remaining > 0.005 ? COLORS.warning : COLORS.success}`,
  }}>
    <Typography variant="subtitle2" fontWeight={900}
      color={remaining > 0.005 ? COLORS.warning : COLORS.success}
    >
      {remaining > 0.005 ? 'REMAINING:' : 'FULLY COVERED'}
    </Typography>
    <Typography variant="h6" fontWeight={900}
      color={remaining > 0.005 ? COLORS.warning : COLORS.success}
    >
      ₱{remaining.toFixed(2)}
    </Typography>
  </Box>
</Paper>
```

**Styling notes**:
- Zero `borderRadius` on all elements.
- Each tender row gets a solid `boxShadow` when multi-row (neubrutalism offset).
- "+ ADD PAYMENT METHOD" uses dashed Sky Blue border matching the design system's CTA pattern.
- Remaining indicator uses green (covered) or orange (outstanding) KPI surfaces.

**Depends on**: All Phase 1 steps.

**Done when**: Payment section shows tender rows, add/remove works, Cash rows show tendered/change, remaining indicator accurate.

### Step 3.2 — Update checkout button disabled condition

**Where**: `POSModal.jsx`, line 1305.

**What**: Replace:
```js
disabled={loading || isCashInsufficient || (parseFloat(billDiscountValue) > 0 && !billDiscountReason)}
```
With:
```js
disabled={
  loading
  || remaining > 0.005
  || anyCashInsufficient
  || (parseFloat(billDiscountValue) > 0 && !billDiscountReason)
}
```

**Why**: D4 — total tenders must cover `balanceDue`, and all Cash tenders must be sufficiently tendered.

**Depends on**: Step 1.3.

**Done when**: Checkout button disabled when remaining > 0 or any Cash tender insufficient; enabled when fully covered.

### Step 3.3 — Auto-fill single tender amount with balanceDue

**Where**: `POSModal.jsx`, inside the tender amount `TextField`.

**What**: When there is exactly one tender and its amount is empty, the placeholder already shows `balanceDueNum.toFixed(2)`. But for checkout, an empty amount field should be treated as the full balance. Update the `totalTendered` computation (Step 1.3):

```js
const totalTendered = useMemo(() =>
  paymentTenders.reduce((sum, t) => {
    const amt = parseFloat(t.amount);
    // T4.150: Empty amount on a single-tender row means "full balance" — zero extra clicks.
    if (isNaN(amt) && paymentTenders.length === 1) return sum + balanceDueNum;
    return sum + (amt || 0);
  }, 0),
  [paymentTenders, balanceDueNum]
);
```

Also in the sale doc write, when building `paymentTenders` for Firestore, resolve the empty-amount case:
```js
paymentTenders: paymentTenders.map(t => ({
  method: t.method,
  amount: parseFloat(t.amount) || (paymentTenders.length === 1 ? balanceDueNum : 0),
  ...(t.method === 'Cash' && t.amountTendered ? { ... } : {}),
})),
```

**Why**: The 90% single-payment case should require zero extra clicks. The cashier just picks a method and checks out.

**Depends on**: Step 1.3.

**Done when**: Single Cash tender with empty amount field enables checkout and writes correct amount to Firestore.

### Step 3.4 — Add new icon import

**Where**: `POSModal.jsx`, line 11-20 (icon imports).

**What**: Add:
```js
import AddIcon from '@mui/icons-material/Add';
```

Actually, the "+ ADD PAYMENT METHOD" button uses text, not an icon. `RemoveCircleIcon` is already imported (line 13) and reused for the row remove button. No new icon imports needed. The `CloseIcon` alternative is also not needed since we use `RemoveCircleIcon` for consistency with the cart row remove pattern.

**Depends on**: Nothing.

**Done when**: N/A — no new import needed.

### Verification Checkpoint (Phase 3)

- Default state: one Cash row, no amount entered, checkout enabled (single-tender auto-fill).
- Click "+ ADD PAYMENT METHOD": second row appears, remaining indicator shows outstanding.
- Type 500 in row 1: row 2 auto-fills with remainder.
- Cash rows show tendered/change; non-Cash rows do not.
- Remove button (X) removes a row; minimum 1 row enforced.
- Checkout disabled when remaining > 0 or Cash tender insufficient.

---

## Phase 4: Sales Page Updates

**Goal**: Update ledger filtering, method column display, and reprint receipt to handle multi-tender sales.

### Step 4.1 — Update useSalesData EOD totals

**Where**: `useSalesData.js`, lines 96-113 inside the `eodTotals` useMemo.

**What**: Replace the single `sale.paymentMethod` distribution (lines 108-111) with a dual-read that checks `paymentTenders[]` first:

```js
// T4.150: Distribute collected amount across tenders.
// New sales have paymentTenders[]; legacy sales have only paymentMethod.
if (sale.paymentTenders && sale.paymentTenders.length > 0) {
  sale.paymentTenders.forEach(t => {
    const tenderAmt = parseFloat(t.amount) || 0;
    if (t.method === 'Cash') cash += tenderAmt;
    else if (t.method?.includes('GCash')) gcash += tenderAmt;
    else if (t.method === 'Card') card += tenderAmt;
    else if (t.method === 'Bank Transfer') bank += tenderAmt;
  });
} else {
  // Legacy fallback: single paymentMethod
  if (sale.paymentMethod === 'Cash') cash += collected;
  else if (sale.paymentMethod?.includes('GCash')) gcash += collected;
  else if (sale.paymentMethod === 'Card') card += collected;
  else if (sale.paymentMethod === 'Bank Transfer') bank += collected;
}
```

**Important**: For split-tender sales, the sum of tender amounts equals `balanceDue` (the collected amount after deposit). The variable `collected` (`sale.total - deposit`) is what was used before. With tenders, we use the per-tender amounts directly. These should be equivalent because `sum(tenderAmounts) == balanceDue == total - deposit`. But to be safe, this approach uses the stored tender amounts which are the source of truth.

**Depends on**: Phase 2 (sale docs now contain `paymentTenders[]`).

**Done when**: EOD tiles show correct per-method totals for both legacy and split-tender sales.

### Step 4.2 — Update Sales.jsx filtering

**Where**: `Sales.jsx`, line 71-72 inside `processedSales` filter.

**What**: Replace:
```js
const matchMethod = filterMethod.includes('All') || filterMethod.includes(s.paymentMethod) ||
                    (filterMethod.includes('Card') && s.paymentMethod === 'Bank Transfer');
```
With:
```js
// T4.150: Match method filter against paymentTenders[] (with legacy fallback).
const saleMethods = s.paymentTenders && s.paymentTenders.length > 0
  ? s.paymentTenders.map(t => t.method)
  : [s.paymentMethod];
const matchMethod = filterMethod.includes('All')
  || saleMethods.some(m => filterMethod.includes(m))
  || (filterMethod.includes('Card') && saleMethods.includes('Bank Transfer'));
```

**Why**: A split Cash+GCash sale should appear when filtering by either Cash or GCash.

**Depends on**: Nothing (pure read-side change).

**Done when**: Filtering by "Cash" shows sales that include a Cash tender (even if split with GCash).

### Step 4.3 — Update Sales.jsx Method column

**Where**: `Sales.jsx`, lines 319-331 (the `paymentMethod` column `renderCell`).

**What**: Replace the renderCell to handle split display:
```js
renderCell: (p) => {
  // T4.150: Show primary method chip + "Split" badge for multi-tender sales.
  const tenders = p.row.paymentTenders;
  const isSplit = tenders && tenders.length > 1;
  const displayMethod = p.row.paymentMethod || p.value || 'Cash';

  const getMethodStyle = (method) => {
    if (method === 'Cash') return { icon: <AccountBalanceWalletIcon fontSize="small" />, color: COLORS.success };
    if (method?.includes('GCash')) return { icon: <PhoneIphoneIcon fontSize="small" />, color: COLORS.medical };
    if (method === 'Card') return { icon: <CreditCardIcon fontSize="small" />, color: COLORS.amber };
    return { icon: <AccountBalanceIcon fontSize="small" />, color: COLORS.grooming };
  };

  const { icon, color } = getMethodStyle(displayMethod);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', height: '100%', gap: 0.3 }}>
      <Chip icon={icon} label={displayMethod} size="small" sx={{ borderRadius: 0, bgcolor: COLORS.cardBg, color: color, border: `2px solid ${color}`, fontWeight: 900, '& .MuiChip-icon': { color: color } }} />
      {isSplit && (
        <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 900, color: COLORS.sky, letterSpacing: 0.3 }}>
          SPLIT ({tenders.length} methods)
        </Typography>
      )}
    </Box>
  );
}
```

**Why**: Cashiers and managers can immediately identify split-tender transactions in the ledger.

**Depends on**: Nothing.

**Done when**: Split-tender sales show the primary method chip + "SPLIT (2 methods)" label below.

### Step 4.4 — Update Sales.jsx reprint receipt

**Where**: `Sales.jsx`, line 179-183 inside `handleReprint`.

**What**: Replace:
```html
<div class="total-row" style="..."><span>Payment Method:</span><span>${sale.paymentMethod || 'Cash'}</span></div>
${sale.paymentMethod === 'Cash' && sale.amountTendered ? `...tendered/change...` : ''}
```
With:
```js
// T4.150: Multi-tender reprint support.
const tenderHTML = sale.paymentTenders && sale.paymentTenders.length > 0
  ? sale.paymentTenders.map(t => {
      const amt = parseFloat(t.amount) || 0;
      let line = `<div class="total-row" style="font-size:12px; color:#555;"><span>${t.method}:</span><span>P${amt.toFixed(2)}</span></div>`;
      if (t.method === 'Cash' && t.amountTendered) {
        line += `<div class="total-row" style="font-size:11px; color:#888; margin-left:10px;"><span>&nbsp;&nbsp;Tendered:</span><span>P${parseFloat(t.amountTendered).toFixed(2)}</span></div>`;
        line += `<div class="total-row" style="font-size:11px; color:#888; font-weight:bold; margin-left:10px;"><span>&nbsp;&nbsp;Change:</span><span>P${parseFloat(t.changeDue || 0).toFixed(2)}</span></div>`;
      }
      return line;
    }).join('')
  : `<div class="total-row" style="margin-top:5px; font-size:12px; color:#555;"><span>Payment Method:</span><span>${sale.paymentMethod || 'Cash'}</span></div>
     ${sale.paymentMethod === 'Cash' && sale.amountTendered ? `
       <div class="total-row" style="font-size:12px; color:#555;"><span>Tendered:</span><span>P${parseFloat(sale.amountTendered).toFixed(2)}</span></div>
       <div class="total-row" style="font-size:12px; color:#555; font-weight:bold;"><span>Change:</span><span>P${parseFloat(sale.changeDue || 0).toFixed(2)}</span></div>
     ` : ''}`;
```

Then insert `${tenderHTML}` into the receipt template where the old payment method lines were.

**Why**: Reprinted receipts from split-tender sales must show all tender rows. Legacy sales (no `paymentTenders[]`) fall back to the old single-method format.

**Depends on**: Nothing (pure read-side).

**Done when**: Reprinting a split-tender sale shows each tender; reprinting a legacy sale shows the old format.

### Step 4.5 — Update EOD print report in Sales.jsx

**Where**: `Sales.jsx`, lines 230-237 inside `handlePrintReport`.

**What**: The EOD print report already reads from `eodTotals.cash`, `eodTotals.gcash`, etc. Since Step 4.1 fixes the upstream computation, no changes are needed here.

**Depends on**: Step 4.1.

**Done when**: Verified — no change needed.

### Verification Checkpoint (Phase 4)

- EOD tiles show correct per-method breakdown for split-tender sales.
- Filtering by "Cash" includes a Cash+GCash split sale.
- Method column shows primary method + "SPLIT (2 methods)" badge.
- Reprint shows all tenders. Legacy reprint unchanged.

---

## Phase 5: EodSummary.jsx Assessment

**Where**: `VetConnect-Admin/src/features/Sales/components/EodSummary.jsx`

**What**: No changes needed. EodSummary receives `totals` (cash, gcash, card, bank, etc.) as props from `useSalesData`. The upstream fix in Step 4.1 ensures these values are correctly computed from `paymentTenders[]`. The tiles, click-to-filter behavior, and display are all method-agnostic — they just show the numbers.

**Done when**: Verified — no change needed.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| **Empty amount on single tender** | High (90% of transactions) | Step 3.3: treat empty amount as full `balanceDue`; zero extra clicks for single-method |
| **Floating-point mismatch** | Medium | Use `toFixed(2)` on all amount comparisons; `remaining > 0.005` guard instead of `> 0` |
| **Legacy sales missing paymentTenders** | Certain (all existing data) | Every reader checks `sale.paymentTenders?.length > 0` first, falls back to `sale.paymentMethod` |
| **Cash change regression** | Low | Per-tender `amountTendered` / `getChangeDue` replicate exact T4.148 logic but scoped per row |
| **Firestore transaction size** | Low | `paymentTenders` array adds ~100 bytes per tender; max 4 tenders = ~400 bytes extra |
| **Window.confirm still used on checkout success** | Pre-existing | Out of scope (T4.152 addresses receipt print UX) |

---

## Testing Strategy

### Manual QA Checklist

1. **Single Cash transaction (90% case)**:
   - Open POS, leave defaults, click Checkout. Verify: one tender row (Cash), amount auto-fills, receipt shows "Cash: P{balanceDue}", sale doc has `paymentTenders: [{ method: 'Cash', amount: X }]` AND `paymentMethod: 'Cash'`.

2. **Single GCash transaction**:
   - Change method to GCash, checkout. Verify: no tendered/change fields shown, receipt shows "GCash: P{amount}".

3. **Split Cash + GCash**:
   - Add second tender, type 500 in Cash row, verify GCash row auto-fills remainder. Enter tendered amount for Cash. Checkout. Verify: receipt shows both tenders, sale doc has both in `paymentTenders[]`, `paymentMethod` is the larger of the two.

4. **Split 3-way**:
   - Cash + GCash + Card. Verify all three show in receipt and Firestore.

5. **Remove tender row**:
   - Add 2 rows, remove second, verify remaining indicator updates.

6. **Checkout guard**:
   - With remaining > 0: button disabled.
   - With Cash tender insufficient: button disabled.
   - With bill discount but no reason: button disabled.
   - All conditions met: button enabled.

7. **EOD totals**:
   - Process a split Cash+GCash sale. Check EOD tiles: Cash tile shows Cash portion, GCash tile shows GCash portion, total shows sum.

8. **Ledger filter**:
   - Filter by "Cash" — split Cash+GCash sale appears.
   - Filter by "GCash" — same sale appears.
   - Filter by "Card" — sale does NOT appear.

9. **Ledger Method column**:
   - Split sale shows primary method chip + "SPLIT (2 methods)" text.
   - Single sale shows just the chip (no split badge).

10. **Reprint split sale**:
    - Click reprint on a split sale. Verify all tenders shown with per-Cash tendered/change.

11. **Reprint legacy sale**:
    - Click reprint on a sale made before T4.150. Verify old format still works (single payment method line).

12. **Group billing + split tender**:
    - Multi-pet visit, group mode, split tender. Verify per-pet breakdown + multi-tender on the same receipt.

---

## Estimated Effort

| Phase | Scope | Effort |
|-------|-------|--------|
| Phase 1: State Model Refactor | 6 steps in POSModal.jsx | 30 min |
| Phase 2: Receipt & Checkout | 3 steps in POSModal.jsx | 30 min |
| Phase 3: Payment UI | 3 steps in POSModal.jsx | 30 min |
| Phase 4: Sales Page Updates | 4 steps across 2 files | 30 min |
| **Total** | **16 steps, 3 files** | **~2 hrs** |

All phases are sequential (each depends on the previous). No parallelization possible.

---

## External Blockers

None. No Blaze upgrade needed. No new npm packages. No Firestore index changes. No Cloud Function changes. No Cloudflare Worker changes.
