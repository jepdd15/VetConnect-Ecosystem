# PHASE 4 — POS Foundation Upgrades (T4.148 + T4.149 + T4.153)

## Overview

Three foundational POS upgrades to POSModal.jsx and its downstream consumers: (1) cash change calculation so cashiers stop doing mental math, (2) a two-layer custom discount system (per-item + per-transaction) that is mutually exclusive with SC/PWD, and (3) sequential BIR-compliant receipt numbering via an atomic Firestore counter. All three tasks touch the same financial pipeline (`calculateFinancials` -> `handleCheckout` -> `generateReceiptHTML`), so they are planned as a single coordinated batch to avoid merge conflicts.

**Assumptions:**
- No external dependencies or npm installs required.
- The Firestore `counters` collection does not exist yet (confirmed via rules grep).
- SC/PWD and custom discounts are mutually exclusive (one or the other, never both).
- Receipt counter is global (not per-day reset) per BIR unbroken-sequence requirement.
- No Blaze upgrade needed — all Firestore operations use client SDK.

## Files Touched

| File | Action | Tasks |
|---|---|---|
| `VetConnect-Admin/src/components/POSModal.jsx` | Modify | T4.148, T4.149, T4.153 |
| `VetConnect-Admin/src/features/Sales/Sales.jsx` | Modify | T4.153 (receipt number display) |
| `VetConnect-Admin/src/features/Sales/hooks/useSalesData.js` | Modify | T4.149 (EOD custom discount sum) |
| `VetConnect-Admin/src/features/Sales/components/EodSummary.jsx` | Modify | T4.149 (custom discount KPI) |
| `VetConnect-Backend/firestore.rules` | Modify | T4.153 (counters collection rule) |

No new files created. No npm installs.

---

## Phase 1: T4.153 — Sequential Receipt Numbering (~30 min)

**Goal:** Replace the random `saleRef.id.slice(0, 8)` receipt number with a globally sequential `OR-YYYYMMDD-NNNN` format using an atomic Firestore counter.

### Step 1.1: Add Firestore rules for counters collection

**What:** Add a `counters` collection rule allowing staff read/write.
**Where:** `VetConnect-Backend/firestore.rules`
**How:** Insert between the `notification_log` rule and the `vaccine_reminder_queue` rule (after line 279, before line 282):

```
// --- COUNTERS (atomic sequential IDs) ---
// Staff can read+write for atomic increment inside runTransaction.
match /counters/{counterId} {
  allow read, write: if isStaff();
}
```

**Why:** The receipt counter doc lives at `counters/receipt_sequence`. Staff need read+write inside the checkout transaction.
**Depends on:** Nothing.

### Step 1.2: Read + increment counter inside handleCheckout transaction

**What:** Inside the existing `runTransaction` in `handleCheckout` (POSModal.jsx line 514), atomically read + increment the counter and format the receipt number.
**Where:** `VetConnect-Admin/src/components/POSModal.jsx`, inside the `runTransaction` callback, immediately after `const saleRef = doc(collection(db, "sales"));` (line 531).
**How:**

```js
// T4.153: Atomic receipt number — read + increment inside the existing transaction
const counterRef = doc(db, 'counters', 'receipt_sequence');
const counterSnap = await transaction.get(counterRef);
let nextSeq;
if (!counterSnap.exists()) {
  // First-ever receipt — bootstrap the counter doc
  nextSeq = 1;
  transaction.set(counterRef, { value: 1 });
} else {
  nextSeq = (counterSnap.data().value || 0) + 1;
  transaction.update(counterRef, { value: nextSeq });
}
const today = new Date();
const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
const receiptNumber = `OR-${dateStr}-${String(nextSeq).padStart(4, '0')}`;
```

This must be placed BEFORE the `if (isGroupBill)` branch so `receiptNumber` is available to both paths.

**Why:** The counter read must be inside the same Firestore `runTransaction` to guarantee atomicity — no two concurrent checkouts can get the same number.
**Depends on:** Step 1.1 (rules must be deployed first, or at least before any checkout attempt).

### Step 1.3: Write receiptNumber on both sale doc branches

**What:** Add `receiptNumber` to the `transaction.set(saleRef, {...})` payload in BOTH the group branch (line 552) and the individual branch (line 609).
**Where:** POSModal.jsx, both `transaction.set(saleRef, {...})` calls.
**How:** Add `receiptNumber,` to both object literals, right after `checkoutCorrelationId,`.

Group branch (line 552 area):
```js
transaction.set(saleRef, {
  receiptNumber,            // <-- ADD
  checkoutCorrelationId,
  visitGroupId: patient.visitGroupId,
  // ... rest unchanged
});
```

Individual branch (line 609 area):
```js
transaction.set(saleRef, {
  receiptNumber,            // <-- ADD
  checkoutCorrelationId,
  appointmentId: patient.id,
  // ... rest unchanged
});
```

**Why:** The receipt number must be persisted on the sale doc for reprints and ledger display.
**Depends on:** Step 1.2.

### Step 1.4: Pass receiptNumber to generateReceiptHTML

**What:** Update the `generateReceiptHTML` function signature to accept `receiptNumber` and use it in the receipt header.
**Where:** POSModal.jsx, line 296 (function signature) and line 363 (receipt # display).
**How:**

Change function signature from:
```js
const generateReceiptHTML = (transactionId) => {
```
to:
```js
const generateReceiptHTML = (transactionId, receiptNumber) => {
```

Change line 363 from:
```html
<p><strong>Receipt #:</strong> ${transactionId.slice(0, 8).toUpperCase()}</p>
```
to:
```html
<p><strong>Receipt #:</strong> ${receiptNumber || transactionId.slice(0, 8).toUpperCase()}</p>
```

The fallback to `transactionId.slice(0, 8)` handles reprints of legacy sales that lack a receiptNumber.

Update the call site (line 695) from:
```js
const receiptContent = generateReceiptHTML(transactionId);
```
to:
```js
const receiptContent = generateReceiptHTML(transactionId, receiptNumber);
```

Note: `receiptNumber` is declared inside the `runTransaction` callback but the `generateReceiptHTML` call is outside it. The variable must be hoisted. Declare `let receiptNumber = '';` before the `runTransaction` call (around line 512) and assign inside the transaction. Then at line 695, `receiptNumber` is in scope.

Alternatively: since `transactionId` is returned from `runTransaction`, a second pattern is to store `receiptNumber` in a closure-scoped variable:
```js
let checkoutReceiptNumber = '';
const transactionId = await runTransaction(db, async (transaction) => {
  // ... (counter logic assigns receiptNumber)
  checkoutReceiptNumber = receiptNumber;
  // ...
  return saleRef.id;
});
// Later:
const receiptContent = generateReceiptHTML(transactionId, checkoutReceiptNumber);
```

**Why:** The receipt must show the sequential number instead of the random Firestore ID.
**Depends on:** Steps 1.2, 1.3.

### Step 1.5: Display receiptNumber in Sales.jsx ledger

**What:** Update the Receipt # column in Sales.jsx to display `receiptNumber` with fallback to the existing ID slice.
**Where:** `VetConnect-Admin/src/features/Sales/Sales.jsx`, line 286-288 (the `id` column renderCell).
**How:**

Change:
```jsx
<Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 800, color: COLORS.medical, bgcolor: COLORS.chipBlueBg, px: 1.2, py: 0.5, borderRadius: 0, border: `1px solid ${COLORS.medical}`, letterSpacing: 0.5 }}>
  {p.value.slice(0, 8).toUpperCase()}
</Typography>
```
to:
```jsx
<Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 800, color: COLORS.medical, bgcolor: COLORS.chipBlueBg, px: 1.2, py: 0.5, borderRadius: 0, border: `1px solid ${COLORS.medical}`, letterSpacing: 0.5 }}>
  {p.row.receiptNumber || p.value.slice(0, 8).toUpperCase()}
</Typography>
```

Also update the reprint receipt handler (line 165):
```html
<p><strong>Receipt #:</strong> ${sale.id.slice(0, 8).toUpperCase()}</p>
```
to:
```html
<p><strong>Receipt #:</strong> ${sale.receiptNumber || sale.id.slice(0, 8).toUpperCase()}</p>
```

And the void dialog receipt display (line 569):
```html
<strong>Receipt:</strong> #{(voidTarget?.id || '').slice(0, 8).toUpperCase()}
```
to:
```html
<strong>Receipt:</strong> {voidTarget?.receiptNumber || `#${(voidTarget?.id || '').slice(0, 8).toUpperCase()}`}
```

**Why:** Ledger, reprint, and void dialog must show sequential receipt numbers for new sales while gracefully falling back for legacy sales.
**Depends on:** Step 1.3.

### Phase 1 Verification
- **Done when:** Checkout produces a sale doc with `receiptNumber: "OR-20260504-0001"` (first ever). Printed receipt shows sequential number. Sales ledger displays it. Second checkout produces `OR-20260504-0002`. Counter doc at `counters/receipt_sequence` has `value: 2`.

---

## Phase 2: T4.148 — Cash Change Calculation (~30 min)

**Goal:** When `paymentMethod === 'Cash'`, show an Amount Tendered field and Change Due display. Disable checkout if tendered < balanceDue. Include tendered/change on receipt and sale doc.

### Step 2.1: Add amountTendered state

**What:** Add a `useState` for the tendered amount, reset it when the modal opens or payment method changes.
**Where:** POSModal.jsx, after `const [depositAmount, setDepositAmount] = useState('');` (line 40).
**How:**

```js
const [amountTendered, setAmountTendered] = useState('');
```

Reset it in the `initPOS` useEffect (line 158) alongside the other resets:
```js
setCart(initialCart); setSelectedItemVal(''); setPaymentMethod('Cash'); setBarcodeInput('');
setAmountTendered('');   // <-- ADD
```

Also clear it when payment method changes to non-Cash. Add a useEffect:
```js
useEffect(() => {
  if (paymentMethod !== 'Cash') setAmountTendered('');
}, [paymentMethod]);
```

**Why:** Tendered amount is only relevant for cash. Clearing on method change prevents stale values.
**Depends on:** Nothing.

### Step 2.2: Compute changeDue

**What:** Derive `changeDue` from `amountTendered` and `financials.balanceDue`. Also derive `isCashInsufficient` for button disable logic.
**Where:** POSModal.jsx, immediately after `const financials = calculateFinancials();` (line 293).
**How:**

```js
const parsedTendered = parseFloat(amountTendered) || 0;
const changeDue = paymentMethod === 'Cash' ? Math.max(0, parsedTendered - parseFloat(financials.balanceDue)) : 0;
const isCashInsufficient = paymentMethod === 'Cash' && amountTendered !== '' && parsedTendered < parseFloat(financials.balanceDue);
```

**Why:** These derived values drive UI display and button disable. No need for separate state.
**Depends on:** Step 2.1.

### Step 2.3: Add Amount Tendered UI below Payment Method

**What:** Render an Amount Tendered `TextField` and Change Due display inside the PAYMENT METHOD Paper, visible only when `paymentMethod === 'Cash'`.
**Where:** POSModal.jsx, inside the PAYMENT METHOD Paper (lines 874-884), after the `</FormControl>` on line 883, before the closing `</Paper>`.
**How:**

```jsx
{paymentMethod === 'Cash' && (
  <Box sx={{ mt: 2 }}>
    <TextField
      fullWidth size="small" label="Amount Tendered"
      type="number"
      value={amountTendered}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '' || parseFloat(v) >= 0) setAmountTendered(v);
      }}
      error={isCashInsufficient}
      helperText={isCashInsufficient ? 'Insufficient amount' : ''}
      InputProps={{
        startAdornment: <InputAdornment position="start">₱</InputAdornment>,
        inputProps: { min: 0 },
      }}
      sx={{ bgcolor: COLORS.cardBg, mb: 1.5 }}
    />
    {parsedTendered > 0 && !isCashInsufficient && (
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        p: 1.5, bgcolor: COLORS.kpiGreenBg, border: `2px solid ${COLORS.success}`,
        borderRadius: 0,
      }}>
        <Typography variant="subtitle2" fontWeight={900} color={COLORS.success}>
          CHANGE DUE:
        </Typography>
        <Typography variant="h6" fontWeight={900} color={COLORS.success}>
          ₱{changeDue.toFixed(2)}
        </Typography>
      </Box>
    )}
  </Box>
)}
```

**Why:** Cashiers need to see change instantly. The green success surface matches the design system for positive financial outcomes.
**Depends on:** Steps 2.1, 2.2.

### Step 2.4: Disable Settle Balance button when insufficient

**What:** Add `isCashInsufficient` to the Settle Balance button's `disabled` prop.
**Where:** POSModal.jsx, line 892 — the checkout Button.
**How:**

Change:
```jsx
<Button onClick={handleCheckout} disabled={loading} variant="contained" ...>
```
to:
```jsx
<Button onClick={handleCheckout} disabled={loading || isCashInsufficient} variant="contained" ...>
```

**Why:** Prevents checkout when cashier hasn't received enough cash.
**Depends on:** Step 2.2.

### Step 2.5: Write amountTendered + changeDue to sale doc

**What:** Persist the tendered/change values on the sale document for audit trail and reprints.
**Where:** POSModal.jsx, both `transaction.set(saleRef, {...})` calls (group branch ~line 552, individual branch ~line 609).
**How:** Add to both object literals:

```js
amountTendered: paymentMethod === 'Cash' ? parsedTendered : null,
changeDue: paymentMethod === 'Cash' ? changeDue : null,
```

**Why:** Audit trail — the sale record must reflect what was tendered and returned.
**Depends on:** Steps 2.2, Phase 1 Step 1.3 (both modify same set call — order them to avoid conflicts).

### Step 2.6: Add tendered/change to receipt HTML

**What:** Add a "Tendered / Change" line to the receipt totals section, below the Payment Method line.
**Where:** POSModal.jsx, inside `generateReceiptHTML`, after the Payment Method line (line 383).
**How:**

After:
```html
<div class="total-row" style="margin-top:5px; font-size:12px; color:#555;"><span>Payment Method:</span><span>${paymentMethod}</span></div>
```

Add:
```html
${paymentMethod === 'Cash' && parsedTendered > 0 ? `
  <div class="total-row" style="font-size:12px; color:#555;"><span>Tendered:</span><span>P${parsedTendered.toFixed(2)}</span></div>
  <div class="total-row" style="font-size:12px; color:#555; font-weight:bold;"><span>Change:</span><span>P${changeDue.toFixed(2)}</span></div>
` : ''}
```

Also update the reprint handler in `Sales.jsx` (`handleReprint`, line 177 area). After the Payment Method line, add:
```html
${sale.paymentMethod === 'Cash' && sale.amountTendered ? `
  <div class="total-row" style="font-size:12px; color:#555;"><span>Tendered:</span><span>P${parseFloat(sale.amountTendered).toFixed(2)}</span></div>
  <div class="total-row" style="font-size:12px; color:#555; font-weight:bold;"><span>Change:</span><span>P${parseFloat(sale.changeDue || 0).toFixed(2)}</span></div>
` : ''}
```

**Why:** Cash receipts must show what was tendered and returned for customer verification.
**Depends on:** Steps 2.2, 2.5.

### Phase 2 Verification
- **Done when:** Selecting Cash as payment method shows Amount Tendered field. Typing 500 with a 347 balance shows "CHANGE DUE: ₱153.00" in green. Typing 200 with a 347 balance shows "Insufficient amount" error + disabled checkout button. Switching to GCash hides the field. Receipt prints "Tendered: P500.00 / Change: P153.00". Sale doc has `amountTendered: 500, changeDue: 153`. Reprint from Sales ledger also shows tendered/change.

---

## Phase 3: T4.149 — Custom Discount System (~1.5 hrs)

**Goal:** Add a two-layer custom discount system: per-item discounts (inline on cart rows) and a transaction-level bill discount. Mutually exclusive with SC/PWD.

### Step 3.1: Add custom discount state variables

**What:** Add state for per-item discounts, transaction discount, and the per-item discount popover.
**Where:** POSModal.jsx, after `const [amountTendered, setAmountTendered] = useState('');` (from Step 2.1).
**How:**

```js
// T4.149: Custom discount system
// Per-item discounts stored as a Map keyed by cart index: { type: '%' | '₱', value: number }
const [itemDiscounts, setItemDiscounts] = useState({});
// Transaction-level bill discount
const [billDiscountType, setBillDiscountType] = useState('%');    // '%' or '₱'
const [billDiscountValue, setBillDiscountValue] = useState('');
const [billDiscountReason, setBillDiscountReason] = useState('');
// Per-item discount popover anchor
const [discountAnchorEl, setDiscountAnchorEl] = useState(null);
const [discountEditIndex, setDiscountEditIndex] = useState(null);
const [editDiscType, setEditDiscType] = useState('%');
const [editDiscValue, setEditDiscValue] = useState('');
```

Reset all discount state in the `initPOS` useEffect (line 158) and both billing mode effects:
```js
setItemDiscounts({}); setBillDiscountType('%'); setBillDiscountValue(''); setBillDiscountReason('');
```

**Why:** Two independent discount layers need independent state. Per-item discounts are keyed by cart index so they track cart mutations.
**Depends on:** Nothing.

### Step 3.2: Define DISCOUNT_REASONS constant

**What:** Define the mandatory reason dropdown options at the top of the file.
**Where:** POSModal.jsx, after the import block (after line 29), before the component function.
**How:**

```js
const DISCOUNT_REASONS = [
  'Loyalty',
  'First Visit',
  'Promo',
  'Vet Discretion',
  'Clinic Error',
  'Other',
];
```

**Why:** Mandatory reason enforces audit trail accountability.
**Depends on:** Nothing.

### Step 3.3: Update calculateFinancials for two-layer discounts

**What:** Rewrite `calculateFinancials` to compute per-item discounts first (reducing line totals), then transaction discount on the post-item subtotal. SC/PWD and custom discounts are mutually exclusive.
**Where:** POSModal.jsx, lines 277-292 — replace the entire function body.
**How:**

```js
const calculateFinancials = () => {
  let subtotal = 0;
  let vatExemptTotal = 0;
  let scPwdDiscount = 0;
  let totalItemDiscounts = 0;

  cart.forEach((item, idx) => {
    const lineTotal = item.price * item.qty;

    if (applyScPwd && item.isDiscountable) {
      // SC/PWD path — no custom discounts allowed
      const itemVatExempt = lineTotal / 1.12;
      vatExemptTotal += itemVatExempt;
      scPwdDiscount += itemVatExempt * 0.20;
      subtotal += lineTotal;
    } else {
      // Check for per-item custom discount
      const disc = itemDiscounts[idx];
      let itemDisc = 0;
      if (!applyScPwd && disc && disc.value > 0) {
        itemDisc = disc.type === '%'
          ? lineTotal * (Math.min(disc.value, 100) / 100)
          : Math.min(disc.value, lineTotal);
        totalItemDiscounts += itemDisc;
      }
      subtotal += lineTotal;
    }
  });

  // Transaction-level bill discount (only when SC/PWD is off)
  let billDisc = 0;
  const afterItems = subtotal - (applyScPwd ? scPwdDiscount : totalItemDiscounts);
  if (!applyScPwd && billDiscountValue) {
    const val = parseFloat(billDiscountValue) || 0;
    billDisc = billDiscountType === '%'
      ? afterItems * (Math.min(val, 100) / 100)
      : Math.min(val, afterItems);
  }

  const totalDiscount = applyScPwd ? scPwdDiscount : (totalItemDiscounts + billDisc);
  const finalTotal = subtotal - totalDiscount;
  const deposit = parseFloat(depositAmount) || 0;
  const balanceDue = Math.max(0, finalTotal - deposit);

  return {
    subtotal: subtotal.toFixed(2),
    vatExempt: applyScPwd && scPwdDiscount > 0 ? vatExemptTotal.toFixed(2) : '0.00',
    discount: totalDiscount.toFixed(2),
    scPwdDiscount: scPwdDiscount.toFixed(2),
    itemDiscounts: totalItemDiscounts.toFixed(2),
    billDiscount: billDisc.toFixed(2),
    afterItemDiscounts: (subtotal - totalItemDiscounts).toFixed(2),
    total: finalTotal.toFixed(2),
    deposit: deposit.toFixed(2),
    balanceDue: balanceDue.toFixed(2),
  };
};
```

**Why:** The order of operations is: per-item discounts reduce line totals -> subtotal -> transaction discount -> deposit -> balance due. SC/PWD and custom discounts cannot coexist.
**Depends on:** Step 3.1.

### Step 3.4: Enforce SC/PWD vs custom discount mutual exclusion

**What:** When SC/PWD is toggled on, clear all custom discounts. When any custom discount is applied, disable the SC/PWD switch.
**Where:** POSModal.jsx.
**How:**

Modify the SC/PWD Switch `onChange` (line 858):
```jsx
<Switch
  checked={applyScPwd}
  onChange={(e) => {
    setApplyScPwd(e.target.checked);
    if (e.target.checked) {
      // Clear custom discounts when enabling SC/PWD
      setItemDiscounts({});
      setBillDiscountValue('');
      setBillDiscountReason('');
    }
  }}
  color="secondary"
  disabled={Object.keys(itemDiscounts).length > 0 || parseFloat(billDiscountValue) > 0}
/>
```

Add a helper text below the switch when it's disabled:
```jsx
{(Object.keys(itemDiscounts).length > 0 || parseFloat(billDiscountValue) > 0) && (
  <Typography variant="caption" color="error" fontWeight="bold" display="block" sx={{ mt: 0.5 }}>
    Disabled — custom discount is active. Remove custom discounts first.
  </Typography>
)}
```

**Why:** BIR compliance and business logic: SC/PWD is a government-mandated 20% VAT-exempt discount. Custom discounts are clinic-discretionary. Stacking would be double-dipping.
**Depends on:** Steps 3.1, 3.3.

### Step 3.5: Add per-item discount button + Popover to cart table

**What:** Add a small "disc" button on each non-base cart row that opens a Popover with % / ₱ toggle and value field.
**Where:** POSModal.jsx, inside the cart TableBody (lines 822-848). Add the button in the last `<TableCell>` alongside the remove button.
**How:**

Add `Popover` to the MUI imports at line 3 (it's not currently imported in POSModal).

In the cart row (inside the actions TableCell, line 843-845), add before the remove button:

```jsx
{!item.isBase && !applyScPwd && (
  <Tooltip title="Item Discount">
    <IconButton
      size="small"
      onClick={(e) => {
        const existing = itemDiscounts[index];
        setEditDiscType(existing?.type || '%');
        setEditDiscValue(existing?.value?.toString() || '');
        setDiscountEditIndex(index);
        setDiscountAnchorEl(e.currentTarget);
      }}
      sx={{
        border: `1px solid ${itemDiscounts[index] ? COLORS.amber : COLORS.border}`,
        borderRadius: 0,
        color: itemDiscounts[index] ? COLORS.amber : COLORS.textMuted,
        bgcolor: itemDiscounts[index] ? COLORS.warningSurface : 'transparent',
        mr: 0.5,
        fontSize: '0.6rem',
        fontWeight: 900,
        width: 28,
        height: 28,
      }}
    >
      %
    </IconButton>
  </Tooltip>
)}
```

Add a per-item discount chip below the item name when a discount is active (inside the first TableCell, after the existing sub-labels):
```jsx
{itemDiscounts[index] && !applyScPwd && (
  <Typography variant="caption" fontWeight="bold" display="block" sx={{ color: COLORS.amber }}>
    Disc: {itemDiscounts[index].type === '%' ? `${itemDiscounts[index].value}%` : `₱${itemDiscounts[index].value}`}
    {' '}(-₱{(itemDiscounts[index].type === '%'
      ? (item.price * item.qty * Math.min(itemDiscounts[index].value, 100) / 100)
      : Math.min(itemDiscounts[index].value, item.price * item.qty)
    ).toFixed(2)})
  </Typography>
)}
```

**Why:** Per-item discounts are visible inline so the cashier can see exactly what's discounted on each line.
**Depends on:** Steps 3.1, 3.4.

### Step 3.6: Render the per-item discount Popover

**What:** Add the Popover component that opens when the "disc" button is clicked, containing a type toggle and value field.
**Where:** POSModal.jsx, inside the return statement, after the cart `TableContainer` closing tag (after line 850), before the right-side billing panel.
**How:**

```jsx
<Popover
  open={Boolean(discountAnchorEl)}
  anchorEl={discountAnchorEl}
  onClose={() => { setDiscountAnchorEl(null); setDiscountEditIndex(null); }}
  anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
  transformOrigin={{ vertical: 'top', horizontal: 'left' }}
  PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.amber}`, boxShadow: `4px 4px 0px ${COLORS.amber}33`, p: 2, width: 240 } }}
>
  <Typography variant="subtitle2" fontWeight={900} color={COLORS.warning} sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem' }}>
    Item Discount
  </Typography>
  <ToggleButtonGroup
    value={editDiscType}
    exclusive
    onChange={(_, v) => { if (v) setEditDiscType(v); }}
    size="small"
    fullWidth
    sx={{ mb: 1.5, '& .MuiToggleButton-root': { borderRadius: 0, fontWeight: 900, border: `2px solid ${COLORS.amber}` } }}
  >
    <ToggleButton value="%" sx={{ '&.Mui-selected': { bgcolor: COLORS.amber, color: '#fff' } }}>%</ToggleButton>
    <ToggleButton value="₱" sx={{ '&.Mui-selected': { bgcolor: COLORS.amber, color: '#fff' } }}>₱</ToggleButton>
  </ToggleButtonGroup>
  <TextField
    fullWidth size="small" type="number" autoFocus
    placeholder={editDiscType === '%' ? 'e.g. 10' : 'e.g. 50'}
    value={editDiscValue}
    onChange={(e) => setEditDiscValue(e.target.value)}
    InputProps={{
      startAdornment: <InputAdornment position="start">{editDiscType}</InputAdornment>,
      inputProps: { min: 0, max: editDiscType === '%' ? 100 : undefined },
    }}
    sx={{ mb: 1.5, bgcolor: COLORS.cardBg }}
  />
  <Box sx={{ display: 'flex', gap: 1 }}>
    <Button
      fullWidth variant="contained" size="small"
      onClick={() => {
        const val = parseFloat(editDiscValue) || 0;
        if (val > 0) {
          setItemDiscounts(prev => ({ ...prev, [discountEditIndex]: { type: editDiscType, value: val } }));
        } else {
          setItemDiscounts(prev => { const next = { ...prev }; delete next[discountEditIndex]; return next; });
        }
        setDiscountAnchorEl(null);
        setDiscountEditIndex(null);
      }}
      sx={{ bgcolor: COLORS.amber, fontWeight: 900, borderRadius: 0, '&:hover': { bgcolor: COLORS.warning } }}
    >
      Apply
    </Button>
    <Button
      size="small"
      onClick={() => {
        setItemDiscounts(prev => { const next = { ...prev }; delete next[discountEditIndex]; return next; });
        setDiscountAnchorEl(null);
        setDiscountEditIndex(null);
      }}
      sx={{ color: COLORS.textMuted, fontWeight: 900, borderRadius: 0 }}
    >
      Clear
    </Button>
  </Box>
</Popover>
```

**Why:** MUI Popover anchored to the discount button — no alert/prompt calls. Amber color scheme per design spec.
**Depends on:** Step 3.5.

### Step 3.7: Add BILL DISCOUNT section to the right-side billing panel

**What:** Add a "BILL DISCOUNT" Paper section between the DISCOUNTS (RA 9994) section and the totals section, visible only when SC/PWD is off.
**Where:** POSModal.jsx, after the SC/PWD Paper (closes around line 860), before the totals Paper (starts around line 862).
**How:**

```jsx
{!applyScPwd && (
  <Paper variant="outlined" sx={{ p: 2, bgcolor: COLORS.warningSurface, border: `2px solid ${COLORS.amber}`, borderRadius: 0 }}>
    <Typography variant="subtitle2" fontWeight={900} sx={{ color: COLORS.warning, mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem' }}>
      BILL DISCOUNT
    </Typography>
    <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
      <ToggleButtonGroup
        value={billDiscountType}
        exclusive
        onChange={(_, v) => { if (v) setBillDiscountType(v); }}
        size="small"
        sx={{ '& .MuiToggleButton-root': { borderRadius: 0, fontWeight: 900, border: `2px solid ${COLORS.amber}`, px: 1.5 } }}
      >
        <ToggleButton value="%" sx={{ '&.Mui-selected': { bgcolor: COLORS.amber, color: '#fff' } }}>%</ToggleButton>
        <ToggleButton value="₱" sx={{ '&.Mui-selected': { bgcolor: COLORS.amber, color: '#fff' } }}>₱</ToggleButton>
      </ToggleButtonGroup>
      <TextField
        fullWidth size="small" type="number"
        placeholder={billDiscountType === '%' ? 'e.g. 10' : 'e.g. 100'}
        value={billDiscountValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '' || parseFloat(v) >= 0) setBillDiscountValue(v);
        }}
        InputProps={{
          startAdornment: <InputAdornment position="start">{billDiscountType}</InputAdornment>,
          inputProps: { min: 0, max: billDiscountType === '%' ? 100 : undefined },
        }}
        sx={{ bgcolor: COLORS.cardBg }}
      />
    </Box>
    <FormControl fullWidth size="small" sx={{ bgcolor: COLORS.cardBg }}>
      <InputLabel>Reason (required)</InputLabel>
      <Select
        value={billDiscountReason}
        label="Reason (required)"
        onChange={(e) => setBillDiscountReason(e.target.value)}
      >
        {DISCOUNT_REASONS.map(r => (
          <MenuItem key={r} value={r}>{r}</MenuItem>
        ))}
      </Select>
    </FormControl>
    {parseFloat(billDiscountValue) > 0 && !billDiscountReason && (
      <Typography variant="caption" color="error" fontWeight="bold" display="block" sx={{ mt: 1 }}>
        A reason is required to apply a bill discount.
      </Typography>
    )}
    {Object.keys(itemDiscounts).length > 0 && parseFloat(billDiscountValue) > 0 && (
      <Chip
        label={`${Object.keys(itemDiscounts).length + 1} discounts applied`}
        size="small"
        sx={{ mt: 1, borderRadius: 0, bgcolor: COLORS.amber, color: '#fff', fontWeight: 900 }}
      />
    )}
  </Paper>
)}
```

**Why:** Transaction-level discount with mandatory reason dropdown. Amber theme matches the design spec for warning/discount UI.
**Depends on:** Steps 3.1, 3.2.

### Step 3.8: Update totals section for discount breakdown

**What:** Update the totals Paper to show the full stacking breakdown when custom discounts are active.
**Where:** POSModal.jsx, the totals Paper (lines 862-871).
**How:**

After the Subtotal line and before the existing SC/PWD conditional, add:

```jsx
{!applyScPwd && parseFloat(financials.itemDiscounts) > 0 && (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
    <Typography variant="body2" color={COLORS.amber} fontWeight="bold">Item Discounts:</Typography>
    <Typography variant="body2" color={COLORS.amber} fontWeight="bold">- ₱{financials.itemDiscounts}</Typography>
  </Box>
)}
{!applyScPwd && parseFloat(financials.itemDiscounts) > 0 && (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
    <Typography variant="body2" color="textSecondary" fontWeight="bold">After Items:</Typography>
    <Typography variant="body2" fontWeight="bold">₱{financials.afterItemDiscounts}</Typography>
  </Box>
)}
{!applyScPwd && parseFloat(financials.billDiscount) > 0 && (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
    <Typography variant="body2" color={COLORS.warning} fontWeight="bold">Bill Discount ({billDiscountType === '%' ? `${billDiscountValue}%` : `₱${billDiscountValue}`}):</Typography>
    <Typography variant="body2" color={COLORS.warning} fontWeight="bold">- ₱{financials.billDiscount}</Typography>
  </Box>
)}
```

**Why:** Full stacking preview so cashier sees exactly how Subtotal -> Item Discounts -> After Items -> Bill Discount -> Grand Total flows.
**Depends on:** Steps 3.3, 3.7.

### Step 3.9: Block checkout when bill discount has no reason

**What:** Disable checkout button when a bill discount value is entered but no reason is selected.
**Where:** POSModal.jsx, the Settle Balance Button (same line as Step 2.4).
**How:**

Update the disabled condition to:
```jsx
disabled={loading || isCashInsufficient || (parseFloat(billDiscountValue) > 0 && !billDiscountReason)}
```

**Why:** Mandatory reason is an audit requirement — cannot checkout with an unexplained discount.
**Depends on:** Steps 3.7, Step 2.4.

### Step 3.10: Write custom discount fields to sale doc

**What:** Persist all custom discount data on the sale document for audit trail.
**Where:** POSModal.jsx, both `transaction.set(saleRef, {...})` calls.
**How:** Add to both object literals (alongside the existing `discount` field):

```js
// T4.149: Custom discount audit fields
customDiscountTotal: applyScPwd ? 0 : parseFloat(financials.itemDiscounts) + parseFloat(financials.billDiscount),
itemDiscountsTotal: applyScPwd ? 0 : parseFloat(financials.itemDiscounts),
billDiscountAmount: applyScPwd ? 0 : parseFloat(financials.billDiscount),
billDiscountType: !applyScPwd && parseFloat(billDiscountValue) > 0 ? billDiscountType : null,
billDiscountValue: !applyScPwd && parseFloat(billDiscountValue) > 0 ? parseFloat(billDiscountValue) : null,
billDiscountReason: !applyScPwd && billDiscountReason ? billDiscountReason : null,
itemDiscountDetails: !applyScPwd && Object.keys(itemDiscounts).length > 0
  ? Object.entries(itemDiscounts).map(([idx, d]) => ({
      itemIndex: parseInt(idx),
      itemName: cart[parseInt(idx)]?.name || 'Unknown',
      type: d.type,
      value: d.value,
      savedAmount: d.type === '%'
        ? (cart[parseInt(idx)]?.price * cart[parseInt(idx)]?.qty * Math.min(d.value, 100) / 100)
        : Math.min(d.value, (cart[parseInt(idx)]?.price || 0) * (cart[parseInt(idx)]?.qty || 1)),
    }))
  : [],
discountedBy: (!applyScPwd && (parseFloat(billDiscountValue) > 0 || Object.keys(itemDiscounts).length > 0))
  ? (profile?.fullName || 'POS Cashier')
  : null,
```

**Why:** Full audit trail: who applied what discount, why, and the computed savings per item.
**Depends on:** Steps 3.3, 3.7, Phase 1 Step 1.3 (same set call modified).

### Step 3.11: Add custom discount lines to receipt HTML

**What:** Add custom discount breakdown to the receipt totals section.
**Where:** POSModal.jsx, inside `generateReceiptHTML`, in the totals div (lines 375-383).
**How:**

After the Subtotal line (line 376), before the SC/PWD conditional (line 377), add:

```html
${!applyScPwd && parseFloat(financials.itemDiscounts) > 0 ? `
  <div class="total-row" style="color: #E65100;"><span>Item Discounts:</span><span>- P${financials.itemDiscounts}</span></div>
` : ''}
${!applyScPwd && parseFloat(financials.billDiscount) > 0 ? `
  <div class="total-row" style="color: #E65100;"><span>Bill Discount (${billDiscountReason || 'Custom'}):</span><span>- P${financials.billDiscount}</span></div>
` : ''}
```

Also update the Sales.jsx reprint handler (`handleReprint`, around line 173-177) to show custom discounts. After the SC/PWD line:
```html
${!sale.hasScPwdDiscount && parseFloat(sale.itemDiscountsTotal || 0) > 0 ? `
  <div class="total-row" style="color: #E65100;"><span>Item Discounts:</span><span>- P${parseFloat(sale.itemDiscountsTotal).toFixed(2)}</span></div>
` : ''}
${!sale.hasScPwdDiscount && parseFloat(sale.billDiscountAmount || 0) > 0 ? `
  <div class="total-row" style="color: #E65100;"><span>Bill Discount (${sale.billDiscountReason || 'Custom'}):</span><span>- P${parseFloat(sale.billDiscountAmount).toFixed(2)}</span></div>
` : ''}
```

**Why:** Receipt must reflect all applied discounts for customer transparency and audit.
**Depends on:** Steps 3.3, 3.10.

### Step 3.12: Update useSalesData EOD totals for custom discounts

**What:** Add `totalCustomDiscounts` to the EOD totals computation.
**Where:** `VetConnect-Admin/src/features/Sales/hooks/useSalesData.js`, lines 91-112.
**How:**

Add a new accumulator in the `useMemo` (line 93):
```js
let cash = 0, gcash = 0, card = 0, bank = 0;
let totalBilled = 0, totalCollected = 0, totalDeposits = 0, totalDiscounts = 0, refunds = 0;
let totalCustomDiscounts = 0;  // <-- ADD
```

Inside the `else` branch (non-refunded sales, line 98-108), add:
```js
totalCustomDiscounts += parseFloat(sale.customDiscountTotal || 0);
```

Update the return object (line 111):
```js
return { cash, gcash, card, bank, totalBilled, totalCollected, totalDeposits, totalDiscounts, totalCustomDiscounts, refunds };
```

**Why:** EOD summary must track custom discounts separately from SC/PWD discounts for management oversight.
**Depends on:** Step 3.10.

### Step 3.13: Update EodSummary display

**What:** Show custom discount total in the EOD summary when non-zero.
**Where:** `VetConnect-Admin/src/features/Sales/components/EodSummary.jsx`, inside the "COLLECTED TODAY" tile (line 74 area).
**How:**

After the existing `totalDeposits` conditional (line 78-81), add:
```jsx
{totals.totalCustomDiscounts > 0 && (
  <Typography variant="caption" sx={{ fontWeight: 800, color: filterMethod.includes('All') ? `${COLORS.cream}80` : COLORS.amber, fontSize: '0.55rem' }}>
    (₱{totals.totalCustomDiscounts.toFixed(2)} custom discounts)
  </Typography>
)}
```

Also update the print report in Sales.jsx (`handlePrintReport`, around line 241). After the SC/PWD Discounts line:
```html
${eodTotals.totalCustomDiscounts > 0 ? `<tr><td>Custom Discounts Given</td><td class="amount">P${eodTotals.totalCustomDiscounts.toFixed(2)}</td></tr>` : ''}
```

**Why:** Management needs to see total custom discounts given per day for oversight and abuse detection.
**Depends on:** Step 3.12.

### Step 3.14: Reset itemDiscounts when cart changes

**What:** When items are added/removed from cart, prune stale itemDiscounts entries.
**Where:** POSModal.jsx, inside `removeFromCart` and the billing mode toggle useEffect.
**How:**

In `removeFromCart` (line 269-273), after the splice, re-index itemDiscounts:
```js
const removeFromCart = (index) => {
  const item = cart[index];
  if (item.isBase) return;
  if (item.isPrescribed && !window.confirm(`WARNING: The Veterinarian explicitly prescribed [${item.name}]. Are you sure you want to remove it?`)) return;
  const newCart = [...cart]; newCart.splice(index, 1); setCart(newCart);
  // Re-index item discounts: shift indices above removed item down by 1
  setItemDiscounts(prev => {
    const next = {};
    Object.entries(prev).forEach(([k, v]) => {
      const i = parseInt(k);
      if (i < index) next[i] = v;
      else if (i > index) next[i - 1] = v;
      // i === index is the removed item — drop it
    });
    return next;
  });
};
```

In the billing mode toggle useEffect (lines 180-197), add `setItemDiscounts({});` alongside the cart reset.

**Why:** Cart index-keyed discounts become stale when items are removed. Re-indexing prevents applying a discount to the wrong item.
**Depends on:** Steps 3.1, 3.5.

### Phase 3 Verification
- **Done when:**
  - Per-item: Clicking the "%" button on a cart row opens amber Popover. Setting 10% on a ₱500 item shows "-₱50.00" inline. Totals section shows "Item Discounts: -₱50.00" and "After Items: ₱X".
  - Bill: BILL DISCOUNT section visible when SC/PWD is off. Setting 5% with "Loyalty" reason applies to post-item subtotal. Checkout blocked without reason.
  - Mutual exclusion: Enabling SC/PWD clears all custom discounts. Adding any custom discount disables the SC/PWD switch.
  - Sale doc contains `customDiscountTotal`, `itemDiscountsTotal`, `billDiscountAmount`, `billDiscountReason`, `itemDiscountDetails[]`, `discountedBy`.
  - Receipt shows custom discount lines with reason.
  - EOD shows "₱X custom discounts" in the Collected Today tile.
  - Removing a cart item correctly re-indexes per-item discounts.

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Concurrent checkout race on receipt counter | Counter is inside the same `runTransaction` — Firestore guarantees serialization. Two simultaneous checkouts will retry and get different numbers. |
| Cart index shift breaks per-item discounts | Step 3.14 re-indexes on remove. Adding items only appends (no index shift). |
| SC/PWD + custom discount stacking | Enforced at 3 layers: UI (switch disabled), calculateFinancials (separate paths), and sale doc (mutually exclusive fields). |
| Legacy sales missing receiptNumber | All display sites use `sale.receiptNumber || sale.id.slice(0,8)` fallback. |
| `counters/receipt_sequence` doc doesn't exist on first run | Step 1.2 handles bootstrap: if doc doesn't exist, creates it with value 1. |
| Bill discount reason forgotten | Checkout button disabled when bill discount value > 0 but no reason selected. |
| Performance: counter read adds 1 extra doc read per checkout | Negligible — checkout already reads 3+ docs (appointment, inventory items). One more counter read is ~1ms additional latency. |

## External Blockers

**None.** All changes use the client-side Firestore SDK. No Blaze upgrade needed. No npm installs. No Cloudflare Worker changes. The `counters` collection rule is the only infra change (firestore.rules deploy).

## Estimated Effort

| Phase | Task | Effort |
|---|---|---|
| Phase 1 | T4.153 — Sequential receipt numbering | ~30 min |
| Phase 2 | T4.148 — Cash change calculation | ~30 min |
| Phase 3 | T4.149 — Custom discount system | ~1.5 hrs |
| **Total** | | **~2.5 hrs** |

**Recommended order:** Phase 1 -> Phase 2 -> Phase 3. Phase 1 and 2 are independent but both modify the same `transaction.set` calls, so sequential avoids merge conflicts. Phase 3 is the largest and depends on Phase 2's `isCashInsufficient` variable for the combined disabled check.

## Acceptance Summary

| Task | Done When |
|---|---|
| T4.153 | Sale doc has `receiptNumber: "OR-YYYYMMDD-NNNN"`. Ledger + receipt show it. Counter doc increments atomically. |
| T4.148 | Cash: tendered field visible, change calculated, button disabled if insufficient, receipt shows tendered/change, sale doc stores both. Non-cash: field hidden. |
| T4.149 | Per-item % + ₱ discount via Popover. Bill discount with mandatory reason. SC/PWD mutual exclusion. Stacking preview in totals. Sale doc audit trail. EOD custom discount sum. |
