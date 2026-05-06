# T4.184 — Standalone Retail POS Implementation Plan

## Overview

Add a "standalone" retail mode to POSModal so staff can sell inventory products (food, treats, accessories) without creating a fake appointment. When `patient` is `null`, the modal opens in retail mode: empty cart, inventory-only product search (no services), optional customer linking via a nudge dialog before checkout, and a sale doc with `saleType:'retail'`. Three entry points — Queue page header, Transactions page header, and Sidebar "Quick Sale" menu item — ensure staff can reach the feature from any page. Dashboard and Transactions page gain retail-vs-clinical revenue analytics.

**Locked Decisions:**
- **Decision 1 (Customer identification):** C — optional with soft nudge. MUI Dialog with client Autocomplete + "LINK CLIENT" + "SKIP — COUNTER SALE" before checkout.
- **Decision 2 (Sale doc schema):** A — explicit `saleType` field: `'retail'` for standalone, `'clinical'` for appointment-based. Existing sales without `saleType` treated as `'clinical'`.
- **Decision 3 (Products only):** A — retail mode shows inventory products only. No services in the dropdown or cart.

**Assumptions:**
- The `users` collection already contains client profiles with `fullName`, `phone`, `id` fields usable for the Autocomplete search.
- Queue.jsx already loads `joinedInventory` and `servicesList` via onSnapshot listeners (lines 1653-1655). POSModal in retail mode only needs `inventoryList`, but passing the full `servicesList` is harmless (it will be hidden in the UI).
- The Sidebar navigates via `react-router-dom`; opening POSModal from Sidebar uses a query-param approach (`/sales?retailPOS=true`) to avoid global state.
- No Blaze upgrade or external service required.

---

## Day 1 (~2 hrs): POSModal Standalone Mode + Queue Entry Point

### Phase 1 — POSModal Retail Mode Guard

**Goal:** Make POSModal functional when `patient` is `null`.

#### Step 1.1 — Add `isRetailMode` flag and retail-mode state

**What:** Add a derived constant and new state for the customer nudge dialog.
**Where:** `VetConnect-Admin/src/components/POSModal.jsx`, lines 42-87.
**How:**

After line 42 (the function signature — stays unchanged, `patient` is already optional in practice), add:

```js
const isRetailMode = !patient;
```

Add new state variables alongside existing state (after line 84):

```js
// T4.184: Retail mode — customer nudge state
const [showCustomerNudge, setShowCustomerNudge] = useState(false);
const [linkedClient, setLinkedClient] = useState(null);  // { id, fullName, phone }
const [clientOptions, setClientOptions] = useState([]);
const [clientSearchLoading, setClientSearchLoading] = useState(false);
```

Add imports at the top (alongside existing MUI imports on line 1-8):
- `Autocomplete` from `@mui/material`
- `ShoppingCartIcon` from `@mui/icons-material/ShoppingCart`
- `PersonSearchIcon` from `@mui/icons-material/PersonSearch`
- `getDocs, query, where, limit as firestoreLimit` from `firebase/firestore` (some already imported — just add `getDocs`, `query`, `where`, `limit as firestoreLimit` if missing)

**Why:** `isRetailMode` is the single boolean that gates every retail-vs-clinical branch. All downstream code checks this flag instead of `!patient` repeatedly.
**Depends on:** Nothing.
**Done when:** `isRetailMode` evaluates to `true` when `patient` is `null`.

---

#### Step 1.2 — Guard the initialization useEffect

**What:** Skip the encounter-item loading and SC/PWD lookup when in retail mode.
**Where:** `POSModal.jsx`, lines 231-259 (the `useEffect` with `initPOS`).
**How:**

Currently line 233 checks `if (open && patient)`. This already naturally skips when `patient` is `null`. BUT: add explicit retail-mode initialization below it:

```js
// After the existing if (open && patient) { ... } block, add:
if (open && isRetailMode) {
  // Retail mode: start with empty cart, no pre-loaded items
  setCart([]); setSelectedItemVal(''); setBarcodeInput('');
  setPaymentTenders([{ method: 'Cash', amount: '', amountTendered: '' }]);
  setDepositAmount('');
  setItemDiscounts({}); setBillDiscountType('%'); setBillDiscountValue(''); setBillDiscountReason('');
  setCheckoutSuccess(null); setCheckoutError(''); setEmailFeedback('');
  setHasScId(false); setApplyScPwd(false);
  setBillingMode('individual');
  // T4.184: Reset customer link state
  setLinkedClient(null); setShowCustomerNudge(false);
}
```

Also update the dependency array (line 259) — add `isRetailMode` to the deps or leave as-is since `patient` changing will trigger the effect. The existing deps `[open, patient, servicesList, inventoryList]` already cover it because `patient` going from `null` to an object (or vice versa) triggers the effect.

**Why:** Retail mode starts with an empty cart. The existing `if (open && patient)` guard already prevents encounter-item loading, but we need to explicitly reset state for retail opens.
**Depends on:** Step 1.1.
**Done when:** Opening POSModal with `patient={null}` shows an empty cart with no errors.

---

#### Step 1.3 — Guard the billing-mode useEffect

**What:** Prevent the billing-mode toggle useEffect from crashing on null patient.
**Where:** `POSModal.jsx`, lines 266-285 (the `useEffect` on `[billingMode]`).
**How:**

Line 267 already has `if (!open || !patient) return;` — this naturally guards retail mode. No change needed. Verify this line exists and is correct.

**Why:** The group billing toggle is irrelevant in retail mode.
**Depends on:** Step 1.1.
**Done when:** No crash when `billingMode` changes while `patient` is `null`.

---

#### Step 1.4 — Guard `handleSaveDraft`

**What:** Disable "Save Invoice Draft" in retail mode (no appointment to save to).
**Where:** `POSModal.jsx`, line 588-618 (`handleSaveDraft`) and line 1698 (the button).
**How:**

At the button on line 1698, add `disabled={loading || isRetailMode}` (append `isRetailMode` to existing `disabled={loading}`). Optionally wrap with a Tooltip in retail mode: "Draft saving not available for retail sales."

No changes needed to the function body — if someone bypasses the disabled button, the function will fail on `doc(db, "appointments", patient.id)` which is acceptable.

**Why:** Retail sales have no appointment doc to save a draft to.
**Depends on:** Step 1.1.
**Done when:** "Save Invoice Draft" button is grayed out when `patient` is `null`.

---

#### Step 1.5 — Guard `handleDropdownAdd` to hide services in retail mode

**What:** In retail mode, the item selector only shows inventory products, not services.
**Where:** `POSModal.jsx`, lines 1253-1278 (the Select dropdown with ListSubheaders).
**How:**

Wrap the services `ListSubheader` and its `servicesList.map(...)` block (lines 1257-1262) with:

```jsx
{!isRetailMode && (
  <>
    <ListSubheader sx={{fontWeight:'900', bgcolor:COLORS.panelBg}}>Clinic Services (Add-ons)</ListSubheader>
    {servicesList.filter(s => s.name !== patient?.serviceType).map((s) => (
      <MenuItem key={`service|${s.id}`} value={`service|${s.id}`}>
         <MedicalServicesIcon fontSize="small" sx={{mr:1, color:COLORS.medical}}/> {s.name} (+₱{s.price})
      </MenuItem>
    ))}
  </>
)}
```

Also update the `InputLabel` on line 1255: change "Select Item / Service" to a conditional:

```jsx
<InputLabel>{isRetailMode ? 'Add Product' : 'Select Item / Service'}</InputLabel>
```

And update the `Select` label prop similarly.

**Why:** Decision 3 locks retail mode to inventory products only.
**Depends on:** Step 1.1.
**Done when:** Opening POSModal in retail mode shows only "Inventory Products" in the dropdown, no services section.

---

#### Step 1.6 — Build the customer nudge dialog

**What:** MUI Dialog that appears when cashier clicks "Settle Balance" in retail mode. Offers client search Autocomplete + "LINK CLIENT" + "SKIP — COUNTER SALE."
**Where:** `POSModal.jsx`, new Dialog rendered after the existing External Rx Override Modal (after line 1726).
**How:**

Add a client-search function:

```js
const searchClients = async (searchText) => {
  if (!searchText || searchText.length < 2) { setClientOptions([]); return; }
  setClientSearchLoading(true);
  try {
    // Read from the already-loaded vets/users or do a one-shot query.
    // Since we don't have a users listener in POSModal, do a getDocs query.
    const q = query(
      collection(db, 'users'),
      where('role', 'in', ['client', 'pet_owner']),
    );
    const snap = await getDocs(q);
    const results = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u =>
        (u.fullName || '').toLowerCase().includes(searchText.toLowerCase()) ||
        (u.phone || '').includes(searchText)
      )
      .slice(0, 10);
    setClientOptions(results);
  } catch (e) {
    console.error('[POSModal] Client search error:', e);
    setClientOptions([]);
  } finally {
    setClientSearchLoading(false);
  }
};
```

**OPTIMIZATION NOTE:** The above queries ALL clients then filters client-side (Firestore doesn't support substring search). For a clinic with <500 clients this is fine. If performance matters later, consider Algolia or a cloud function.

Add the Dialog JSX:

```jsx
{/* T4.184: Customer Nudge Dialog — shown before checkout in retail mode */}
<Dialog
  open={showCustomerNudge}
  onClose={() => {}}  // Prevent backdrop close — must choose an action
  maxWidth="sm" fullWidth
  PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.sky}`, boxShadow: `8px 8px 0px ${COLORS.sky}1A` } }}
>
  <DialogTitle sx={{
    bgcolor: COLORS.chipBlueBg, color: COLORS.brand, fontWeight: 900,
    display: 'flex', alignItems: 'center', gap: 1.5, py: 2,
    borderBottom: `2px solid ${COLORS.sky}`,
    textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.95rem',
  }}>
    <PersonSearchIcon /> Link to Client Account?
  </DialogTitle>
  <DialogContent sx={{ p: 3, bgcolor: COLORS.cardBg }}>
    <Typography variant="body2" sx={{ mb: 2, color: COLORS.textSecondary, fontWeight: 700 }}>
      Link this sale to a client for purchase history tracking, or skip for an anonymous counter sale.
    </Typography>
    <Autocomplete
      options={clientOptions}
      getOptionLabel={(opt) => `${opt.fullName || 'Unknown'} — ${opt.phone || 'No phone'}`}
      loading={clientSearchLoading}
      onInputChange={(_, val) => searchClients(val)}
      onChange={(_, val) => setLinkedClient(val)}
      value={linkedClient}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Search client by name or phone"
          placeholder="e.g. Juan Dela Cruz or 09..."
          fullWidth
          sx={{ bgcolor: COLORS.formBg }}
        />
      )}
      noOptionsText="No clients found"
      sx={{ mb: 2 }}
    />
    {linkedClient && (
      <Alert severity="success" sx={{ borderRadius: 0, fontWeight: 800, border: `2px solid ${COLORS.success}` }}>
        Linking sale to: <strong>{linkedClient.fullName}</strong> ({linkedClient.phone || 'No phone'})
      </Alert>
    )}
  </DialogContent>
  <DialogActions sx={{ p: 2.5, bgcolor: COLORS.panelBg, display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${COLORS.border}` }}>
    <Button
      onClick={() => {
        setLinkedClient(null);
        setShowCustomerNudge(false);
        handleRetailCheckout(null);  // Proceed with anonymous sale
      }}
      sx={{
        fontWeight: 900, borderRadius: 0, px: 3,
        color: COLORS.textMuted, border: `2px solid ${COLORS.border}`,
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}
    >
      SKIP — COUNTER SALE
    </Button>
    <Button
      variant="contained"
      disabled={!linkedClient}
      onClick={() => {
        setShowCustomerNudge(false);
        handleRetailCheckout(linkedClient);  // Proceed with linked client
      }}
      sx={{
        bgcolor: COLORS.sky, fontWeight: 900, borderRadius: 0, px: 4,
        '&:hover': { bgcolor: COLORS.skyHover || COLORS.sky },
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}
    >
      LINK CLIENT
    </Button>
  </DialogActions>
</Dialog>
```

**Why:** Decision 1 requires an optional nudge before checkout. The dialog balances speed (anonymous) with attribution (purchase history).
**Depends on:** Step 1.1.
**Done when:** Clicking "Settle Balance" in retail mode shows the nudge dialog with working client search.

---

#### Step 1.7 — Build `handleRetailCheckout` (the retail transaction)

**What:** A streamlined checkout handler for retail sales. No appointment reads/writes, no status transitions, no clinicalPulse, no push notifications. Still does: inventory FIFO deduction, receipt counter, sale doc write.
**Where:** `POSModal.jsx`, new function defined near `handleCheckout` (after line 1081).
**How:**

```js
const handleRetailCheckout = async (clientInfo) => {
  setLoading(true);
  try {
    let checkoutReceiptNumber = '';

    const transactionId = await runTransaction(db, async (transaction) => {
      const patientLabel = clientInfo?.fullName || 'Counter Sale';

      // PHASE 1 — ALL READS
      const inventoryMap = await readInventoryDocs(transaction, cart);
      const counterRef = doc(db, 'counters', 'receipt_sequence');
      const counterSnap = await transaction.get(counterRef);

      // PHASE 2 — ALL COMPUTATIONS
      const { updatePayloads, logEntries, batchSourceMap } =
        computeInventoryDeductions(cart, inventoryMap, patientLabel);

      let nextSeq;
      if (!counterSnap.exists()) { nextSeq = 1; }
      else { nextSeq = (counterSnap.data().value || 0) + 1; }
      const today = new Date();
      const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      const receiptNumber = `OR-${dateStr}-${String(nextSeq).padStart(4, '0')}`;
      checkoutReceiptNumber = receiptNumber;

      // Custom discount audit fields (reuse existing computation)
      const customDiscountAuditFields = {
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
      };

      // Cash audit fields
      const cashTenders = paymentTenders.filter(t => t.method === 'Cash' && t.amountTendered !== '');
      const totalCashTendered = cashTenders.reduce((s, t) => s + (parseFloat(t.amountTendered) || 0), 0);
      const totalCashChange = cashTenders.reduce((s, t) => s + getChangeDue(t), 0);
      const cashAuditFields = {
        amountTendered: cashTenders.length > 0 ? totalCashTendered : null,
        changeDue: cashTenders.length > 0 ? totalCashChange : null,
      };

      // Sale doc — retail schema
      const saleRef = doc(collection(db, 'sales'));
      const salePayload = {
        saleType: 'retail',  // T4.184: Explicit retail marker
        receiptNumber,
        appointmentId: null,
        ownerId: clientInfo?.id || null,
        ownerName: clientInfo?.fullName || 'Counter Sale',
        petName: null,
        petId: null,
        items: cart.map(ci =>
          ci.type === 'product' && batchSourceMap[ci.id]
            ? { ...ci, batchSource: batchSourceMap[ci.id] }
            : ci
        ),
        subtotal: parseFloat(financials.subtotal),
        discount: parseFloat(financials.discount),
        depositPaid: parseFloat(financials.deposit),
        total: parseFloat(financials.total),
        paymentMethod: primaryPaymentMethod,
        paymentTenders: paymentTenders.map(t => ({
          method: t.method,
          amount: parseFloat(t.amount) || (paymentTenders.length === 1 ? balanceDueNum : 0),
          ...(t.method === 'Cash' && t.amountTendered ? {
            amountTendered: parseFloat(t.amountTendered),
            changeDue: getChangeDue(t),
          } : {}),
        })),
        hasScPwdDiscount: applyScPwd,
        date: Timestamp.now(),
        cashier: profile?.fullName || 'POS Cashier',
        cashierId: profile?.id || null,
        status: 'paid',
        prescribedItemCount: 0,
        cashierAddedItemCount: cart.length,
        hasUnprescribedAdditions: true,
        ...cashAuditFields,
        ...customDiscountAuditFields,
        ...(isDayClosed ? { postClose: true, dayClosedAt: closingData?.closedAt || null } : {}),
      };

      // PHASE 3 — ALL WRITES
      writeInventoryUpdates(transaction, updatePayloads, logEntries);
      if (!counterSnap.exists()) { transaction.set(counterRef, { value: 1 }); }
      else { transaction.update(counterRef, { value: nextSeq }); }
      transaction.set(saleRef, salePayload);
      // NO appointment update — retail has no appointment
      // NO clinicalPulse event — retail has no clinical context

      return saleRef.id;
    });

    // NO push notification — retail has no appointment lifecycle

    // Post-close counter increment (fire-and-forget)
    if (isDayClosed && closingData?.id) {
      updateDoc(doc(db, 'daily_closings', closingData.id), {
        postCloseCount: increment(1),
        postCloseTotal: increment(parseFloat(financials.total) || 0),
      }).catch(() => {});
    }

    // Generate receipt
    const receiptContent = generateRetailReceiptHTML(transactionId, checkoutReceiptNumber, clientInfo);
    setCheckoutSuccess({ receiptHTML: receiptContent, total: financials.balanceDue, receiptNumber: checkoutReceiptNumber });
  } catch (error) {
    console.error('[POSModal.handleRetailCheckout]:', error);
    setCheckoutSuccess(null);
    setCheckoutError(`Checkout failed: ${error.message}`);
  } finally {
    setLoading(false);
  }
};
```

**Why:** Retail checkout is a strict subset of clinical checkout — no appointment reads/writes, no status transitions, no pulse events, no push notifications. Keeping it as a separate function avoids adding `if (isRetailMode)` branches throughout the 100-line `handleCheckout`.
**Depends on:** Steps 1.1, 1.6.
**Done when:** Retail checkout creates a sale doc with `saleType:'retail'` and deducts inventory.

---

#### Step 1.8 — Build `generateRetailReceiptHTML`

**What:** Receipt HTML for retail sales. Reuses 90% of existing `generateReceiptHTML` but with retail-specific labels.
**Where:** `POSModal.jsx`, new function near `generateReceiptHTML` (after line 586).
**How:**

```js
const generateRetailReceiptHTML = (transactionId, receiptNumber, clientInfo) => {
  const today = new Date().toLocaleString();
  const itemsHTML = cart.map(item => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.qty}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">P${item.price.toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">P${(item.price * item.qty).toFixed(2)}</td>
    </tr>
  `).join('');

  const customerLabel = clientInfo?.fullName
    ? `${clientInfo.fullName}${clientInfo.phone ? ` (${clientInfo.phone})` : ''}`
    : 'Counter Sale (Walk-In)';

  // Reuse exact same HTML template structure as clinical receipts,
  // but with "Customer" instead of "Patient" and retail-specific label.
  return `
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #8B4513; padding-bottom: 10px; }
          .clinic-name { font-size: 24px; font-weight: bold; color: #5D4037; margin: 0; }
          .details { margin-bottom: 20px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background-color: #f5f5f5; padding: 10px; text-align: left; font-size: 14px; border-bottom: 2px solid #ddd; }
          .totals { width: 50%; float: right; border-top: 2px solid #8B4513; padding-top: 10px; }
          .total-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 14px; }
          .grand-total { font-weight: bold; font-size: 18px; margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px; }
          .footer { clear: both; text-align: center; margin-top: 50px; font-size: 12px; color: #777; }
          .retail-badge { text-align: center; font-weight: bold; border: 2px solid #3ABEF9; padding: 5px; margin-bottom: 15px; color: #3ABEF9; letter-spacing: 2px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="retail-badge">RETAIL SALE</div>
        <div class="header">
          <p class="clinic-name">${clinicSettings.clinicName}</p>
          <p style="margin: 0; font-size: 12px; color: #666;">${clinicSettings.clinicAddress} | Official Receipt</p>
        </div>
        <div class="details">
          <p><strong>Receipt #:</strong> ${receiptNumber || transactionId.slice(0, 8).toUpperCase()}</p>
          <p><strong>Date:</strong> ${today}</p>
          <p><strong>Customer:</strong> ${customerLabel}</p>
          <p><strong>Cashier:</strong> ${profile?.fullName || 'POS Cashier'}</p>
        </div>
        <table>
          <thead><tr><th>Description</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Amount</th></tr></thead>
          <tbody>${itemsHTML}</tbody>
        </table>
        <div class="totals">
          <div class="total-row"><span>Subtotal:</span><span>P${financials.subtotal}</span></div>
          ${applyScPwd && parseFloat(financials.discount) > 0 ? `
            <div class="total-row"><span>VAT Exempt (Eligible):</span><span>P${financials.vatExempt}</span></div>
            <div class="total-row" style="color: #D32F2F;"><span>SC/PWD Discount (20%):</span><span>- P${financials.discount}</span></div>
          ` : ''}
          ${!applyScPwd && parseFloat(financials.itemDiscounts) > 0 ? `
            <div class="total-row" style="color: #E65100;"><span>Item Discounts:</span><span>- P${financials.itemDiscounts}</span></div>
          ` : ''}
          ${!applyScPwd && parseFloat(financials.billDiscount) > 0 ? `
            <div class="total-row" style="color: #E65100;"><span>Bill Discount (${billDiscountReason || 'Custom'}):</span><span>- P${financials.billDiscount}</span></div>
          ` : ''}
          <div class="total-row grand-total"><span>TOTAL PAID:</span><span>P${financials.balanceDue}</span></div>
          <div class="total-row" style="margin-top:5px; font-size:12px; color:#555; font-weight:bold;"><span>Payment:</span><span>${paymentTenders.length > 1 ? 'Split' : primaryPaymentMethod}</span></div>
          ${paymentTenders.map(t => {
            const amt = parseFloat(t.amount) || balanceDueNum;
            let line = `<div class="total-row" style="font-size:12px; color:#555;"><span>${t.method}:</span><span>P${amt.toFixed(2)}</span></div>`;
            if (t.method === 'Cash' && t.amountTendered && parseFloat(t.amountTendered) > 0) {
              const tendered = parseFloat(t.amountTendered);
              const change = Math.max(0, tendered - amt);
              line += `<div class="total-row" style="font-size:11px; color:#888; margin-left:10px;"><span>&nbsp;&nbsp;Tendered:</span><span>P${tendered.toFixed(2)}</span></div>`;
              line += `<div class="total-row" style="font-size:11px; color:#888; font-weight:bold; margin-left:10px;"><span>&nbsp;&nbsp;Change:</span><span>P${change.toFixed(2)}</span></div>`;
            }
            return line;
          }).join('')}
        </div>
        <div class="footer">
          <p>Thank you for your purchase at ${clinicSettings.clinicName}!</p>
          <p>This document is a system-generated receipt.</p>
        </div>
      </body>
    </html>
  `;
};
```

**Why:** Retail receipts say "Customer" not "Patient," "TOTAL PAID" not "BALANCE PAID," and show a "RETAIL SALE" badge. Keeping this separate avoids cluttering the clinical receipt generator.
**Depends on:** Step 1.1.
**Done when:** Retail receipt HTML renders with correct labels and no patient-specific fields.

---

#### Step 1.9 — Wire the "Settle Balance" button to trigger nudge or checkout

**What:** In retail mode, clicking "Settle Balance" opens the customer nudge dialog instead of calling `handleCheckout` directly.
**Where:** `POSModal.jsx`, line 1699 (the checkout button `onClick`).
**How:**

Change the `onClick` from `handleCheckout` to:

```jsx
onClick={() => {
  if (isRetailMode) {
    setShowCustomerNudge(true);  // Show nudge dialog first
  } else {
    handleCheckout();  // Clinical path — unchanged
  }
}}
```

**Why:** Decision 1 requires the nudge to appear before checkout in retail mode.
**Depends on:** Steps 1.6, 1.7.
**Done when:** In retail mode, clicking "Settle Balance" opens the nudge dialog. In clinical mode, checkout proceeds as before.

---

#### Step 1.10 — Update DialogTitle for retail mode

**What:** Show "Retail Sale" title instead of "Checkout: {petName}" when in retail mode.
**Where:** `POSModal.jsx`, lines 1111-1118 (DialogTitle).
**How:**

Replace the title Typography content:

```jsx
<Typography variant="h6" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
  {isRetailMode ? <ShoppingCartIcon /> : <PaidIcon />}
  {isRetailMode
    ? 'Retail Sale'
    : billingMode === 'group' && isGroupVisit
      ? `Group Bill — ${patient?.ownerName || 'Walk-In'} (${groupAppointments.length} pets)`
      : `Checkout: ${patient?.petName}`}
</Typography>
```

Replace the owner name Chip (line 1118):

```jsx
{!isRetailMode && (
  <Chip label={patient?.ownerName || 'Walk-In'} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 'bold' }} />
)}
{isRetailMode && linkedClient && (
  <Chip label={linkedClient.fullName} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 'bold' }} />
)}
```

**Why:** Visual clarity — staff instantly know they are in retail mode vs clinical checkout.
**Depends on:** Step 1.1.
**Done when:** Dialog title shows "Retail Sale" with ShoppingCartIcon in retail mode.

---

#### Step 1.11 — Hide group billing toggle and deposit in retail mode

**What:** The multi-pet billing toggle and deposit field are irrelevant for retail sales.
**Where:** `POSModal.jsx`, lines 1197-1239 (group billing toggle) and line 1421 (deposit row in financials panel).
**How:**

Wrap the group billing toggle (lines 1197-1239) with `{!isRetailMode && isGroupVisit && (` ... `)}`.

For the deposit row (line 1421), wrap with `{!isRetailMode && (` ... `)}`. Or simply: since `depositAmount` starts as `''` in retail mode, the deposit will be ₱0.00 — which is correct. Keep the field visible but pre-filled as empty (already handled by Step 1.2).

**Why:** Retail has no appointment deposits and no group visits.
**Depends on:** Step 1.1.
**Done when:** Group billing toggle hidden, deposit shows ₱0.00 (or is hidden) in retail mode.

---

#### Step 1.12 — Add `saleType: 'clinical'` to existing checkout paths

**What:** Tag existing clinical sales with `saleType: 'clinical'` for backward-compatible filtering.
**Where:** `POSModal.jsx`, line 872 (group sale payload) and line 943 (individual sale payload).
**How:**

Add `saleType: 'clinical',` to both `salePayload` objects. In the group payload (line 872 area), add it as the first field. Same for individual payload (line 943 area).

**Why:** Decision 2 requires explicit `saleType` field. Existing sales without it are treated as `'clinical'` by consumers, but new sales should be explicit.
**Depends on:** Nothing.
**Done when:** All new clinical sales include `saleType: 'clinical'` in the Firestore document.

---

### Phase 2 — Queue Entry Point

**Goal:** Add "RETAIL SALE" button to Queue page header.

#### Step 2.1 — Add retail POS state and second POSModal instance

**What:** Add state for the retail POS modal and a "RETAIL SALE" button in the Queue header.
**Where:** `VetConnect-Admin/src/features/Queue/Queue.jsx`.
**How:**

1. Add state after line 192 (`openPOS` state):
```js
const [openRetailPOS, setOpenRetailPOS] = useState(false);
```

2. Add import for `ShoppingCartIcon` at the top (import section, lines 35-65):
```js
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
```

3. Add the button after the "Add Walk-In" button (after line 1076), inside the same `{isToday && !isTomorrowView && (` guard:

```jsx
<Button
  variant="outlined"
  startIcon={<ShoppingCartIcon />}
  sx={{
    borderColor: COLORS.sky, color: COLORS.sky, fontWeight: '900',
    textTransform: 'uppercase', letterSpacing: 0.5, px: 3, borderRadius: 0,
    borderWidth: 2,
    '&:hover': { bgcolor: COLORS.chipBlueBg, borderColor: COLORS.skyHover || COLORS.sky },
  }}
  onClick={() => setOpenRetailPOS(true)}
>
  RETAIL SALE
</Button>
```

4. Add a second POSModal instance after line 2282 (after the existing POSModal):

```jsx
{/* T4.184: Retail POS — standalone product sale without appointment */}
<POSModal
  open={openRetailPOS}
  onClose={() => setOpenRetailPOS(false)}
  patient={null}
  inventoryList={joinedInventory}
  servicesList={servicesList}
  isDayClosed={isDayClosed}
  closingData={closingData}
/>
```

**Why:** Queue is the staff's home base. "RETAIL SALE" next to "ADD WALK-IN" is the natural position for a counter sale shortcut.
**Depends on:** Phase 1 complete.
**Done when:** "RETAIL SALE" button visible in Queue header when viewing today. Clicking it opens POSModal in retail mode with empty cart.

---

### Phase 2 Verification Checkpoint

1. Open Queue page. See "RETAIL SALE" button next to "ADD WALK-IN."
2. Click "RETAIL SALE." POSModal opens with title "Retail Sale," empty cart, no services in dropdown.
3. Add a product from inventory dropdown or barcode scan. Cart shows product with quantity controls.
4. Set payment method to Cash. Enter amount tendered. Change due calculated correctly.
5. Click "Settle Balance." Customer nudge dialog appears.
6. Click "SKIP — COUNTER SALE." Checkout completes. Receipt shows "RETAIL SALE" badge, "Customer: Counter Sale (Walk-In)."
7. Check Firestore `sales` collection — new doc has `saleType: 'retail'`, `appointmentId: null`, `petName: null`.
8. Inventory stock decremented correctly.
9. Repeat with "LINK CLIENT" — select a client, verify `ownerId` and `ownerName` on the sale doc.
10. Clinical POS path unchanged — open a billing-status appointment, verify `saleType: 'clinical'` on new sales.

---

## Day 2 (~1.5 hrs): Sales Entry Point + Type Filter + Sidebar + Dashboard

### Phase 3 — Sales Page Entry Point + Type Filter

**Goal:** Add "NEW SALE" button to Transactions page + saleType filter/column.

#### Step 3.1 — Add inventory listeners and POSModal to Sales.jsx

**What:** Sales.jsx needs inventory data to pass to POSModal. Add Firestore listeners.
**Where:** `VetConnect-Admin/src/features/Sales/Sales.jsx`, top of component (after line 34).
**How:**

Add imports at the top of the file:

```js
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import POSModal from '../../components/POSModal';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
```

Note: `db` may already be available through `useSalesData` internals, but `Sales.jsx` doesn't import it directly. Add the import.

Add state and listeners inside the component:

```js
const [inventoryList, setInventoryList] = useState([]);
const [inventoryCategories, setInventoryCategories] = useState([]);
const [servicesList, setServicesList] = useState([]);
const [openRetailPOS, setOpenRetailPOS] = useState(false);

// Retail POS needs inventory + services data
useEffect(() => {
  const unsubInv = onSnapshot(collection(db, 'inventory'), (snap) =>
    setInventoryList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
  const unsubCat = onSnapshot(collection(db, 'inventory_categories'), (snap) =>
    setInventoryCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
  const unsubSvc = onSnapshot(collection(db, 'services'), (snap) =>
    setServicesList(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !s.isArchived))
  );
  return () => { unsubInv(); unsubCat(); unsubSvc(); };
}, []);

// Forensic inventory join (same pattern as Queue.jsx)
const joinedInventory = useMemo(() => {
  return inventoryList
    .filter(item => !item.isArchived)
    .map(item => {
      const catObj = inventoryCategories.find(c => c.name?.toLowerCase() === item.category?.toLowerCase());
      return {
        ...item,
        isMedicine: catObj ? !!catObj.isMedicine : false,
        productClass: catObj?.productClass || (catObj?.isMedicine ? 'medicine' : 'retail'),
      };
    });
}, [inventoryList, inventoryCategories]);
```

Add `useMemo` and `useEffect` to the React import if not already present (check line 0 — both are already imported).

**Why:** POSModal requires `inventoryList` and `servicesList`. Sales.jsx doesn't currently load inventory — it only loads sales data via `useSalesData`.
**Depends on:** Nothing.
**Done when:** `joinedInventory` and `servicesList` arrays populate in Sales component.

---

#### Step 3.2 — Add "NEW SALE" button to Sales page header

**What:** Primary action button in the Transactions page header.
**Where:** `Sales.jsx`, line 582 (the `<Box sx={{ flexGrow: 1 }} />` spacer in Row 1).
**How:**

Add the button BEFORE the spacer (so it appears left of the EOD controls):

```jsx
<Button
  variant="contained"
  startIcon={<ShoppingCartIcon />}
  onClick={() => setOpenRetailPOS(true)}
  sx={{
    bgcolor: COLORS.sky, fontWeight: 900, borderRadius: 0, px: 3,
    border: `2px solid ${COLORS.skyHover || COLORS.sky}`,
    boxShadow: `3px 3px 0px ${COLORS.sky}33`,
    textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem',
    '&:hover': { bgcolor: COLORS.skyHover || COLORS.sky, boxShadow: `1px 1px 0px ${COLORS.sky}33` },
  }}
>
  NEW SALE
</Button>
```

**Why:** Staff reviewing transactions who realize a sale was missed can start one without navigating away.
**Depends on:** Step 3.1.
**Done when:** "NEW SALE" button visible in Transactions page header. Clicking opens POSModal in retail mode.

---

#### Step 3.3 — Add POSModal render to Sales.jsx

**What:** Render the retail POSModal at the bottom of Sales.jsx.
**Where:** `Sales.jsx`, before the closing `</Box>` on line 1002 (after the Snackbar).
**How:**

```jsx
{/* T4.184: Retail POS Modal */}
<POSModal
  open={openRetailPOS}
  onClose={() => setOpenRetailPOS(false)}
  patient={null}
  inventoryList={joinedInventory}
  servicesList={servicesList}
  isDayClosed={isDayClosed}
  closingData={closingData}
/>
```

**Why:** The POSModal component must be rendered in the tree to be openable.
**Depends on:** Steps 3.1, 3.2.
**Done when:** POSModal opens from Sales page in retail mode.

---

#### Step 3.4 — Auto-open POSModal from query param

**What:** If the URL contains `?retailPOS=true`, auto-open the retail POS on mount.
**Where:** `Sales.jsx`, after the existing `useEffect` that reads `location.state?.dashboardFilter` (lines 41-45).
**How:**

```js
// T4.184: Auto-open retail POS from query param (Sidebar Quick Sale link)
useEffect(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('retailPOS') === 'true') {
    setOpenRetailPOS(true);
    // Clean the URL to prevent re-opening on re-render
    window.history.replaceState({}, '', location.pathname);
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

**Why:** Enables the Sidebar "Quick Sale" link to open the POS from any page by navigating to `/sales?retailPOS=true`.
**Depends on:** Step 3.1.
**Done when:** Navigating to `/sales?retailPOS=true` opens the retail POS modal automatically.

---

#### Step 3.5 — Add saleType filter to Sales.jsx

**What:** A filter dropdown for All / Retail Only / Clinical Only in the filter row.
**Where:** `Sales.jsx`, lines 691-697 (after the status filter `<FormControl>`).
**How:**

Add a new state variable (near line 38):

```js
const [filterType, setFilterType] = useState('All');
```

Add a new `<FormControl>` after the status filter:

```jsx
<FormControl size="small" sx={{ minWidth: 140 }}>
  <Select
    value={filterType}
    onChange={(e) => setFilterType(e.target.value)}
    displayEmpty
    sx={{ fontWeight: 800, color: COLORS.accent, bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-notchedOutline': { borderColor: `${COLORS.accent}33`, borderRadius: 0 }, borderRadius: 0 }}
  >
    <MenuItem value="All">All Types</MenuItem>
    <MenuItem value="retail">Retail Only</MenuItem>
    <MenuItem value="clinical">Clinical Only</MenuItem>
  </Select>
</FormControl>
```

Update the `processedSales` useMemo filter (line 78-91) to add a type filter predicate:

```js
// Add after the matchStatus line:
const saleType = s.saleType || 'clinical';  // backward compat: missing = clinical
const matchType = filterType === 'All' || saleType === filterType;
return matchSearch && matchMethod && matchStatus && matchType;
```

Add `filterType` to the useMemo dependency array (line 115).

**Why:** Staff need to distinguish retail from clinical transactions for reconciliation.
**Depends on:** Nothing.
**Done when:** Selecting "Retail Only" shows only `saleType:'retail'` rows. "Clinical Only" shows everything else.

---

#### Step 3.6 — Add saleType column to DataGrid

**What:** A "Type" column showing RETAIL / CLINICAL badge per sale.
**Where:** `Sales.jsx`, in the `columns` array (line 433). Insert after the Receipt # column (line 451).
**How:**

```js
{
  field: 'saleType', headerName: 'TYPE', width: 100, align: 'center', headerAlign: 'center', sortable: false, disableColumnMenu: true,
  renderCell: (p) => {
    const type = p.value || 'clinical';
    const isRetail = type === 'retail';
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Chip
          label={isRetail ? 'RETAIL' : 'CLINICAL'}
          size="small"
          sx={{
            borderRadius: 0,
            fontWeight: 900,
            fontSize: '0.6rem',
            letterSpacing: 0.5,
            bgcolor: isRetail ? COLORS.chipBlueBg : COLORS.kpiGreenBg,
            color: isRetail ? COLORS.sky : COLORS.success,
            border: `2px solid ${isRetail ? COLORS.sky : COLORS.success}`,
          }}
        />
      </Box>
    );
  },
},
```

**Why:** Visual distinction in the ledger. Staff instantly see which transactions are retail vs clinical.
**Depends on:** Step 1.12 (clinical sales tagged with `saleType`).
**Done when:** Each row shows a RETAIL or CLINICAL badge. Existing sales without `saleType` show CLINICAL.

---

### Phase 4 — Sidebar Quick Sale

**Goal:** Add a "Quick Sale" menu item in the Sidebar that navigates to `/sales?retailPOS=true`.

#### Step 4.1 — Add Quick Sale menu item

**What:** New menu item below "Transactions" in the Sidebar.
**Where:** `VetConnect-Admin/src/components/Sidebar.jsx`, line 36-37 (after the Transactions entry).
**How:**

Add import at the top:
```js
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
```

Add the menu item after line 36 (`{ name: 'Transactions', icon: <TransactionIcon />, path: '/sales' },`):

```js
{ name: 'Quick Sale', icon: <ShoppingCartIcon />, path: '/sales?retailPOS=true' },
```

Update the active-state detection in the `ListItemButton` `sx` prop (line 108). The current logic:
```js
backgroundColor: (item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path))
```

This will match `/sales?retailPOS=true` against `location.pathname` which is `/sales`. The `startsWith` check will work but will also highlight "Transactions" when "Quick Sale" is active (both start with `/sales`). To fix this, for the Quick Sale item, use exact match:

```js
backgroundColor: (() => {
  if (item.path === '/') return location.pathname === '/';
  if (item.path.includes('?')) return location.pathname + location.search === item.path;
  return location.pathname.startsWith(item.path) && !location.search;
})()
```

**Alternative simpler approach:** Don't use a `path` with query params. Instead, add a special `action` field to the Quick Sale item:

```js
{ name: 'Quick Sale', icon: <ShoppingCartIcon />, path: '/sales', action: 'retailPOS' },
```

Then in `handleNavClick`:
```js
const handleNavClick = (path, action) => {
  if (action === 'retailPOS') {
    navigate('/sales', { state: { openRetailPOS: true } });
  } else {
    navigate(path);
  }
  if (isMobile) setMobileOpen(false);
};
```

And update the ListItemButton `onClick`:
```jsx
onClick={() => handleNavClick(item.path, item.action)}
```

Then in Sales.jsx, update the auto-open effect (Step 3.4) to also check `location.state`:
```js
useEffect(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('retailPOS') === 'true' || location.state?.openRetailPOS) {
    setOpenRetailPOS(true);
    window.history.replaceState({}, '', location.pathname);
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

**RECOMMENDATION:** Use the `location.state` approach (second option above) — cleaner than query params, no URL pollution, standard React Router pattern.

**Why:** "Quick Sale" is accessible from any page. One click reaches the POS.
**Depends on:** Step 3.4.
**Done when:** "Quick Sale" appears in Sidebar below Transactions. Clicking it navigates to Sales page and auto-opens the retail POS modal.

---

### Phase 5 — Dashboard Revenue Split

**Goal:** Add `retailRevenue` and `clinicalRevenue` to dashboard financial metrics.

#### Step 5.1 — Add retail/clinical revenue split to useDashboardData

**What:** Compute separate revenue totals for retail vs clinical sales.
**Where:** `VetConnect-Admin/src/features/Dashboard/hooks/useDashboardData.js`, inside the `financial` useMemo (around line 917).
**How:**

After line 919 (`const paidSales = ...`), add:

```js
// T4.184: Retail vs Clinical revenue split
const retailSales = paidSales.filter(s => s.saleType === 'retail');
const clinicalSales = paidSales.filter(s => s.saleType !== 'retail');  // includes legacy without saleType
const retailRevenue = retailSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
const clinicalRevenue = clinicalSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
const retailTransactionCount = retailSales.length;
```

Add to the return object (after line 1009):
```js
retailRevenue,
clinicalRevenue,
retailTransactionCount,
```

**Why:** Dashboard needs to show the retail vs clinical split for financial analysis.
**Depends on:** Step 1.12 (sales tagged with `saleType`).
**Done when:** `financial.retailRevenue` and `financial.clinicalRevenue` available in Dashboard components.

---

### Phase 5 Verification Checkpoint

1. Navigate to Transactions page. "NEW SALE" button visible in header.
2. Click "NEW SALE." POSModal opens in retail mode.
3. Complete a retail sale. Sale appears in the DataGrid with "RETAIL" badge in the Type column.
4. Filter by "Retail Only" — only retail sales shown.
5. Filter by "Clinical Only" — retail sales hidden.
6. Click "Quick Sale" in Sidebar — navigates to Transactions page, POS auto-opens.
7. Check Dashboard — `financial.retailRevenue` reflects the retail sale total.

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Client search query loads ALL clients (performance) | Acceptable for target clinic (<500 clients). Filter client-side after getDocs. Add debounce to `onInputChange` if needed. |
| `alert()` calls in POSModal (lines 289, 334, 340, 351, 360, 611) | These exist in current code for stock/Rx validation. Not touched by this task — flag for future Snackbar migration but out of scope. |
| Concurrent retail + clinical POS open on Queue page | Two separate `POSModal` instances with independent state. No conflict — each has its own `open` boolean. |
| Sales.jsx adding 3 new Firestore listeners (inventory, categories, services) | Acceptable cost for the page. These are small collections. Listeners auto-unsubscribe on unmount. |
| Existing sales without `saleType` field | Consumers treat missing `saleType` as `'clinical'` via `s.saleType \|\| 'clinical'` fallback. No migration needed. |
| Email receipt for anonymous retail sales (`ownerId: null`) | `emailReceiptToOwner` already handles null ownerId gracefully (returns "No email address found"). No change needed. |

---

## Testing Strategy

### Manual QA Checklist

**Retail Mode (POSModal):**
- [ ] Open POSModal with `patient={null}` — title says "Retail Sale," cart empty
- [ ] Services dropdown section hidden — only "Inventory Products" visible
- [ ] Barcode scan adds product to cart correctly
- [ ] Manual dropdown add works for inventory products
- [ ] Qty +/- and remove buttons work
- [ ] SC/PWD discount toggle works (if no custom discount active)
- [ ] Custom per-item and bill discounts work
- [ ] Split-tender payment works (Cash + GCash)
- [ ] Cash change calculation correct
- [ ] "Settle Balance" opens customer nudge dialog
- [ ] "SKIP — COUNTER SALE" processes checkout with `ownerId: null`, `ownerName: 'Counter Sale'`
- [ ] "LINK CLIENT" with selected client processes checkout with correct `ownerId` and `ownerName`
- [ ] Client search Autocomplete returns matching users
- [ ] Receipt shows "RETAIL SALE" badge, "Customer" instead of "Patient"
- [ ] Sale doc in Firestore: `saleType: 'retail'`, `appointmentId: null`, `petName: null`
- [ ] Inventory stock correctly decremented (FIFO batch deduction)
- [ ] Receipt counter incremented — sequential receipt numbers
- [ ] Post-close flag set when `isDayClosed` is true
- [ ] "Save Invoice Draft" button disabled in retail mode
- [ ] Checkout success overlay shows Print / Download / Email buttons
- [ ] Email receipt for anonymous sale returns graceful "no email" message

**Clinical Mode (regression):**
- [ ] Clinical POS unchanged — "Checkout: {petName}" title
- [ ] Sale doc includes `saleType: 'clinical'`
- [ ] All existing features still work (encounter items, status transition, pulse events, push notifications)

**Entry Points:**
- [ ] Queue page: "RETAIL SALE" button visible on today view, hidden on tomorrow view
- [ ] Transactions page: "NEW SALE" button visible in header
- [ ] Sidebar: "Quick Sale" navigates to Transactions + auto-opens POS
- [ ] Auto-open cleans URL/state — refreshing page does NOT re-open POS

**Filters (Sales.jsx):**
- [ ] "All Types" shows all sales
- [ ] "Retail Only" shows only `saleType: 'retail'`
- [ ] "Clinical Only" shows all others (including legacy without `saleType`)
- [ ] Type column shows correct RETAIL / CLINICAL badge

**Dashboard:**
- [ ] `financial.retailRevenue` reflects retail sales in selected period
- [ ] `financial.clinicalRevenue` reflects clinical sales in selected period
- [ ] Sum of retail + clinical = totalCollected

---

## Estimated Effort

| Phase | Scope | Effort |
|---|---|---|
| Phase 1 | POSModal standalone mode (12 steps) | ~2 hrs |
| Phase 2 | Queue entry point | ~15 min |
| Phase 3 | Sales entry point + type filter/column | ~45 min |
| Phase 4 | Sidebar Quick Sale | ~15 min |
| Phase 5 | Dashboard revenue split | ~15 min |
| **Total** | | **~3.5 hrs** |

**Recommended split:**
- **Day 1:** Phases 1-2 (~2.25 hrs) — POSModal standalone mode + Queue button
- **Day 2:** Phases 3-5 (~1.25 hrs) — Sales button + filter + Sidebar + Dashboard

---

## Files Modified

| File | Changes |
|---|---|
| `VetConnect-Admin/src/components/POSModal.jsx` | `isRetailMode` guard, retail init, services hidden, nudge dialog, `handleRetailCheckout`, retail receipt HTML, dialog title, `saleType:'clinical'` on existing paths |
| `VetConnect-Admin/src/features/Queue/Queue.jsx` | `openRetailPOS` state, "RETAIL SALE" button, second POSModal render |
| `VetConnect-Admin/src/features/Sales/Sales.jsx` | Inventory listeners, "NEW SALE" button, POSModal render, auto-open from state, `filterType` state + dropdown, saleType DataGrid column |
| `VetConnect-Admin/src/components/Sidebar.jsx` | "Quick Sale" menu item with `action: 'retailPOS'`, `handleNavClick` update |
| `VetConnect-Admin/src/features/Dashboard/hooks/useDashboardData.js` | `retailRevenue`, `clinicalRevenue`, `retailTransactionCount` in financial useMemo |

**No Firestore rules changes needed** — sales collection already allows `isAuth()` create.
**No Blaze upgrade needed** — all operations use existing Firestore patterns.
**No external dependencies** — zero new npm packages.
