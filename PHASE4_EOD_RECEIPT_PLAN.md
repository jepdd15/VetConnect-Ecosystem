# PHASE4_EOD_RECEIPT_PLAN.md

## T4.151 — POS Formal EOD Close-Out with Z-Report
## T4.152 — POS Receipt PDF Fallback + Robustness

---

## Overview

**T4.151** adds a formal end-of-day close-out procedure to the Sales page. A "Close Day" button (admin-only) creates a `daily_closings/{YYYY-MM-DD}` Firestore doc that freezes the day's financial totals into a Z-report. After close, POSModal tags all new sales with `postClose:true` so they show an amber "AFTER CLOSE" badge in the ledger. Admin can reopen a closed day with an audit reason. The Z-report is a printable/downloadable HTML summary containing all financial KPIs, per-method breakdown, discount summaries, and closing staff info.

**T4.152** replaces the fragile `window.open()` + `window.print()` receipt mechanism with a robust 3-button pattern (Print / Download PDF / Email Receipt) at both the POSModal checkout success state and the Sales ledger reprint column. Uses an iframe-based print approach (no npm dependencies) with a Blob URL download fallback when pop-up blockers interfere. Email Receipt sends the receipt HTML to the client's email via the existing Cloudflare Worker `/email` endpoint.

**Key architectural decisions:**
- **No npm installs.** T4.152 uses a hidden iframe + Blob URL approach instead of html2canvas/jsPDF. This avoids adding ~400KB of dependencies for what amounts to a print dialog.
- **Soft close (Decision 1 locked).** Post-close transactions are allowed but flagged. No hard lockout.
- **Full Z-report (Decision 2 locked).** Date, counts, gross/net, refunds, voids, per-method, per-discount-type, closer name, timestamp.

**Assumptions:**
- The Cloudflare Worker `/email` endpoint (Resend) is already deployed and functional.
- `isAdmin` from `useUser()` correctly identifies admin users (`profile?.accessLevel === 'admin' || profile?.role === 'admin'`).
- The `eodTotals` computation in useSalesData.js is the source of truth for the Z-report. NOTE: voided sales are NOT currently excluded from eodTotals (line 97 only checks `status === 'refunded'`). The Z-report will freeze whatever eodTotals computes; fixing the voided-sale bug is out of scope but flagged.

---

## Prerequisites

- No npm installs required.
- Cloudflare Worker `/email` endpoint must be deployed (already done per T4.135).
- Firestore rules must be updated to allow `daily_closings` collection access.

---

## Phase 1: Firestore Rules + Data Model (T4.151 foundation)

### Step 1.1 — Add `daily_closings` collection to Firestore rules

**What:** Add a new rule block for the `daily_closings` collection.
**Where:** `VetConnect-Backend/firestore.rules`
**How:** Insert after the `counters` rule block (line 285), before the vaccine_reminder_queue block:

```
// --- DAILY CLOSINGS (EOD close-out Z-reports) ----------------------
// Staff can read (view close status). Only admin can write (close/reopen).
match /daily_closings/{dateId} {
  allow read: if isStaff();
  allow create, update: if isAdmin();
  allow delete: if false;  // Closing records are permanent audit trail
}
```

**Why:** Closing/reopening a day is an admin-level action. Staff can read to detect close status. Deletions are never allowed -- closings are permanent audit trail.
**Depends on:** Nothing.
**Done when:** `firebase deploy --only firestore:rules` succeeds without errors.

### Step 1.2 — Define the `daily_closings/{YYYY-MM-DD}` document schema

**What:** Document the Firestore schema. No code change -- this is the contract.
**Where:** Reference only (used by useSalesData.js and Sales.jsx).
**Schema:**

| Field | Type | Description |
|---|---|---|
| `closedAt` | Timestamp | When the day was closed |
| `closedBy` | string | Staff UID who closed |
| `closedByName` | string | Staff display name |
| `transactionCount` | number | Total transactions (paid + refunded) |
| `grossRevenue` | number | totalBilled from eodTotals |
| `netRevenue` | number | totalCollected - refunds |
| `refunds` | number | Total refund amount |
| `voids` | number | Count of voided transactions |
| `voidAmount` | number | Total voided amount |
| `cashTotal` | number | Cash method total |
| `gcashTotal` | number | GCash method total |
| `cardTotal` | number | Card method total |
| `bankTotal` | number | Bank Transfer method total |
| `scPwdDiscounts` | number | totalDiscounts from eodTotals |
| `customDiscounts` | number | totalCustomDiscounts from eodTotals |
| `depositTotal` | number | totalDeposits from eodTotals |
| `reopenedAt` | Timestamp or null | When the day was reopened (null if not reopened) |
| `reopenedBy` | string or null | Staff UID who reopened |
| `reopenedByName` | string or null | Staff display name who reopened |
| `reopenReason` | string or null | Audit reason for reopening |
| `postCloseCount` | number | Number of post-close transactions (live counter updated on each post-close sale) |
| `postCloseTotal` | number | Total revenue from post-close transactions |

**Depends on:** Nothing.

---

## Phase 2: useSalesData.js — Close Status Detection + Actions (T4.151 data layer)

### Step 2.1 — Add `daily_closings/{filterDate}` onSnapshot listener

**What:** Subscribe to the daily_closings doc for the current filterDate. Export `isDayClosed`, `closingData`.
**Where:** `VetConnect-Admin/src/features/Sales/hooks/useSalesData.js`
**How:**

Add state:
```js
const [closingData, setClosingData] = useState(null);
```

Inside the existing `useEffect` (line 11-89), after `unsub2`, add a third onSnapshot:

```js
// Query 3: Daily closing status for this date
const closingRef = doc(db, 'daily_closings', filterDate);
const unsub3 = onSnapshot(closingRef, (snapshot) => {
  setClosingData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
}, (err) => {
  console.error('[useSalesData] Closing status fetch error:', err);
  // Non-fatal — closingData stays null (treated as "day open")
});
```

Update cleanup: `return () => { unsub1(); unsub2(); unsub3(); };`

Derive `isDayClosed`:
```js
const isDayClosed = closingData !== null && !closingData.reopenedAt;
```

**Why:** Real-time detection of close status. Reopened days have `reopenedAt` set, which makes `isDayClosed` false again.
**Depends on:** Step 1.1 (Firestore rules must allow the read).

### Step 2.2 — Add `closeDay()` function

**What:** Create and export a `closeDay()` async function that writes the daily_closings doc.
**Where:** `VetConnect-Admin/src/features/Sales/hooks/useSalesData.js`
**How:**

```js
const closeDay = async (staffProfile) => {
  if (!staffProfile?.id) throw new Error('Staff profile required to close day.');

  const closingRef = doc(db, 'daily_closings', filterDate);

  // Count voids from the current sales array
  const voidedSales = sales.filter(s => s.status === 'voided');
  const voidCount = voidedSales.length;
  const voidAmount = voidedSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);

  const { setDoc } = await import('firebase/firestore');
  await setDoc(closingRef, {
    closedAt: Timestamp.now(),
    closedBy: staffProfile.id,
    closedByName: staffProfile.fullName || 'Admin',
    transactionCount: sales.length,
    grossRevenue: eodTotals.totalBilled,
    netRevenue: eodTotals.totalCollected - eodTotals.refunds,
    refunds: eodTotals.refunds,
    voids: voidCount,
    voidAmount,
    cashTotal: eodTotals.cash,
    gcashTotal: eodTotals.gcash,
    cardTotal: eodTotals.card,
    bankTotal: eodTotals.bank,
    scPwdDiscounts: eodTotals.totalDiscounts,
    customDiscounts: eodTotals.totalCustomDiscounts,
    depositTotal: eodTotals.totalDeposits,
    reopenedAt: null,
    reopenedBy: null,
    reopenedByName: null,
    reopenReason: null,
    postCloseCount: 0,
    postCloseTotal: 0,
  });
};
```

**Why:** Freezes the current financial state into an immutable closing record. `setDoc` (not `updateDoc`) is used because the doc may not exist yet.
**Depends on:** Step 2.1 (closingData state needed for pre-condition checks in UI).

### Step 2.3 — Add `reopenDay()` function

**What:** Create and export a `reopenDay()` async function that stamps `reopenedAt` + reason on the existing closing doc.
**Where:** `VetConnect-Admin/src/features/Sales/hooks/useSalesData.js`
**How:**

```js
const reopenDay = async (staffProfile, reason) => {
  if (!staffProfile?.id) throw new Error('Staff profile required to reopen day.');
  if (!reason || reason.trim().length === 0) throw new Error('Audit reason required.');

  const closingRef = doc(db, 'daily_closings', filterDate);
  const { updateDoc: firestoreUpdateDoc } = await import('firebase/firestore');
  await firestoreUpdateDoc(closingRef, {
    reopenedAt: Timestamp.now(),
    reopenedBy: staffProfile.id,
    reopenedByName: staffProfile.fullName || 'Admin',
    reopenReason: reason.trim(),
  });
};
```

**Why:** Reopening stamps audit metadata but does NOT delete the closing doc. The original frozen totals remain as a historical record.
**Depends on:** Step 2.1.

### Step 2.4 — Add void count to eodTotals + export new values

**What:** Extend the `eodTotals` useMemo to count voided transactions (currently unhandled). Export `isDayClosed`, `closingData`, `closeDay`, `reopenDay`.
**Where:** `VetConnect-Admin/src/features/Sales/hooks/useSalesData.js`
**How:**

In the `eodTotals` useMemo (line 91-128), add inside the initializers:
```js
let voidCount = 0, voidAmount = 0;
```

In the forEach, add an else-if branch after the refunded check:
```js
else if (sale.status === 'voided') {
  voidCount++;
  voidAmount += sale.total;
}
```

Add to the return object: `voidCount, voidAmount`.

Update the hook's return statement (line 315) to:
```js
return { sales, loading, error, eodTotals, processRefundTransaction, voidTransaction, isDayClosed, closingData, closeDay, reopenDay };
```

**Why:** Z-report needs void data. The voided-sale exclusion from revenue is an existing gap (voided sales were counting toward cash/gcash totals) -- this step does NOT fix that deeper bug, it only exposes the count/amount for the Z-report.
**Depends on:** Steps 2.1, 2.2, 2.3.

**Verification checkpoint (Phase 2):** After these changes, `useSalesData` should compile. The `isDayClosed` value should be `false` (no daily_closings docs exist yet). Console should show no errors from the new onSnapshot.

---

## Phase 3: POSModal — Post-Close Tagging (T4.151)

### Step 3.1 — Accept `isDayClosed` + `closingData` props in POSModal

**What:** Add `isDayClosed` and `closingData` to the POSModal props destructuring.
**Where:** `VetConnect-Admin/src/components/POSModal.jsx`, line 41.
**How:**

Change the function signature from:
```js
export default function POSModal({ open, onClose, patient, inventoryList, servicesList, groupAppointments = [] }) {
```
to:
```js
export default function POSModal({ open, onClose, patient, inventoryList, servicesList, groupAppointments = [], isDayClosed = false, closingData = null }) {
```

**Why:** POSModal needs to know close status to tag post-close sales.
**Depends on:** Phase 2 (values must be exported by useSalesData).

### Step 3.2 — Tag post-close sales with `postClose:true`

**What:** When `isDayClosed` is true, add `postClose: true` and `closedAt: closingData.closedAt` fields to the sale doc during checkout.
**Where:** `VetConnect-Admin/src/components/POSModal.jsx`, inside `handleCheckout`.
**How:**

In both the GROUP MODE `transaction.set(saleRef, {...})` block (around line 789) and the INDIVIDUAL MODE `transaction.set(saleRef, {...})` block (around line 857), add these fields at the end of the object:

```js
...(isDayClosed ? {
  postClose: true,
  dayClosedAt: closingData?.closedAt || null,
} : {}),
```

Also, when `isDayClosed` is true, after the main transaction completes, increment the closing doc's post-close counters. Add AFTER the transaction (fire-and-forget, around line 918):

```js
// T4.151: Increment post-close counters on the daily_closings doc
if (isDayClosed && closingData?.id) {
  import('firebase/firestore').then(({ updateDoc: ud, increment: inc }) => {
    ud(doc(db, 'daily_closings', closingData.id), {
      postCloseCount: inc(1),
      postCloseTotal: inc(parseFloat(financials.total) || 0),
    }).catch(() => {}); // Fire-and-forget
  });
}
```

**Why:** Post-close sales need to be identifiable for audit purposes. The daily_closings doc keeps a running total of post-close activity.
**Depends on:** Step 3.1.

### Step 3.3 — Show amber post-close warning banner in POSModal

**What:** When `isDayClosed`, show an amber warning at the top of the Dialog content.
**Where:** `VetConnect-Admin/src/components/POSModal.jsx`, inside `<DialogContent>`, right after the opening tag (line 985).
**How:**

```jsx
{isDayClosed && (
  <Alert
    severity="warning"
    sx={{
      mx: 3, mt: 2, borderRadius: 0,
      border: `2px solid ${COLORS.amber}`,
      fontWeight: 800,
      bgcolor: COLORS.warningSurface,
    }}
  >
    Day was closed at {closingData?.closedAt?.toDate?.()
      ? closingData.closedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'unknown time'}. This transaction will be flagged as post-close.
  </Alert>
)}
```

**Why:** Cashier should be aware they are creating a post-close transaction.
**Depends on:** Step 3.1.

### Step 3.4 — Replace window.confirm in checkout success with MUI Dialog state

**What:** Replace the `window.confirm()` at line 954 with a React state-driven success Dialog that shows Print / Download PDF / Email Receipt buttons (groundwork for T4.152 Phase 5).
**Where:** `VetConnect-Admin/src/components/POSModal.jsx`
**How:**

Add state variables near the top of the component (after line 73):
```js
const [checkoutSuccess, setCheckoutSuccess] = useState(null); // { receiptHTML, total }
```

Replace the checkout success block (lines 951-964) with:
```js
const receiptContent = generateReceiptHTML(transactionId, checkoutReceiptNumber);
setCheckoutSuccess({ receiptHTML: receiptContent, total: financials.balanceDue });
// Don't close the modal yet — user picks receipt action from success state
```

Remove the `onClose()` call at line 952. The success Dialog will have its own close button.

Add a success overlay inside the main Dialog (before `</Dialog>`) that renders when `checkoutSuccess` is not null:
```jsx
{checkoutSuccess && (
  <Box sx={{
    position: 'absolute', inset: 0, bgcolor: 'rgba(255,255,255,0.97)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', zIndex: 10, gap: 3, p: 4,
  }}>
    <Typography variant="h4" sx={{ fontWeight: 900, color: COLORS.success, fontFamily: FONT }}>
      TRANSACTION COMPLETE
    </Typography>
    <Typography variant="h5" sx={{ fontWeight: 900, color: COLORS.brand }}>
      Collected: ₱{checkoutSuccess.total}
    </Typography>
    <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
      <Button
        variant="contained"
        startIcon={<PrintIcon />}
        onClick={() => printReceiptViaIframe(checkoutSuccess.receiptHTML)}
        sx={{ bgcolor: COLORS.sky, fontWeight: 900, borderRadius: 0, px: 3, '&:hover': { bgcolor: COLORS.skyHover } }}
      >
        PRINT
      </Button>
      <Button
        variant="outlined"
        onClick={() => downloadReceiptAsPdf(checkoutSuccess.receiptHTML)}
        sx={{ fontWeight: 900, borderRadius: 0, px: 3, borderColor: COLORS.accent, color: COLORS.accent, borderWidth: 2 }}
      >
        DOWNLOAD PDF
      </Button>
      <Button
        variant="outlined"
        onClick={() => emailReceipt(checkoutSuccess.receiptHTML)}
        sx={{ fontWeight: 900, borderRadius: 0, px: 3, borderColor: COLORS.success, color: COLORS.success, borderWidth: 2 }}
      >
        EMAIL RECEIPT
      </Button>
    </Box>
    <Button
      onClick={() => { setCheckoutSuccess(null); onClose(); }}
      sx={{ mt: 2, fontWeight: 800, color: COLORS.textMuted }}
    >
      CLOSE
    </Button>
  </Box>
)}
```

NOTE: `PrintIcon` must be imported (already imported in Sales.jsx but not POSModal). Add:
```js
import PrintIcon from '@mui/icons-material/Print';
```

The `printReceiptViaIframe`, `downloadReceiptAsPdf`, and `emailReceipt` functions are defined in Phase 5.

**Why:** Replaces window.confirm (forbidden per spec) and provides the anchor points for T4.152's 3-button receipt UX. The overlay pattern keeps the POS Dialog open until the user explicitly closes it.
**Depends on:** Nothing structural. Phase 5 provides the function implementations.

### Step 3.5 — Reset checkoutSuccess on modal open

**What:** Clear `checkoutSuccess` when the POS modal opens.
**Where:** `VetConnect-Admin/src/components/POSModal.jsx`, inside the `initPOS` useEffect (line 223).
**How:** Add `setCheckoutSuccess(null);` alongside the existing state resets (line 234).
**Depends on:** Step 3.4.

**Verification checkpoint (Phase 3):** POSModal should compile. When `isDayClosed` is false, behavior is unchanged except the checkout success now shows a proper overlay instead of window.confirm. When `isDayClosed` is true, amber banner appears and sale docs get `postClose:true`.

---

## Phase 4: Sales.jsx + EodSummary — Close Day Button, Z-Report, Post-Close Badge (T4.151)

### Step 4.1 — Destructure new values from useSalesData

**What:** Pull `isDayClosed`, `closingData`, `closeDay`, `reopenDay` from the hook.
**Where:** `VetConnect-Admin/src/features/Sales/Sales.jsx`, line 34.
**How:**

Change:
```js
const { sales, loading, error: salesError, eodTotals, processRefundTransaction, voidTransaction } = useSalesData(filterDate, profile);
```
to:
```js
const { sales, loading, error: salesError, eodTotals, processRefundTransaction, voidTransaction, isDayClosed, closingData, closeDay, reopenDay } = useSalesData(filterDate, profile);
```

Also pull `isAdmin` from useUser. Change line 28:
```js
const { profile } = useUser();
```
to:
```js
const { profile, isAdmin } = useUser();
```

**Why:** Sales.jsx needs all of these for the Close Day button, Z-report, and post-close badge.
**Depends on:** Phase 2 complete.

### Step 4.2 — Add Close Day / Reopen Day Dialog states

**What:** Add React state for the close-day confirmation dialog, reopen dialog, and Z-report dialog.
**Where:** `VetConnect-Admin/src/features/Sales/Sales.jsx`, after the void state (line 57).
**How:**

```js
// T4.151: EOD close-out state
const [openCloseDay, setOpenCloseDay] = useState(false);
const [openReopenDay, setOpenReopenDay] = useState(false);
const [reopenReason, setReopenReason] = useState('');
const [openZReport, setOpenZReport] = useState(false);
const [closeDayLoading, setCloseDayLoading] = useState(false);
```

**Depends on:** Step 4.1.

### Step 4.3 — Implement `handleCloseDay` and `handleReopenDay` handlers

**What:** Async handlers that call the hook functions with appropriate error handling.
**Where:** `VetConnect-Admin/src/features/Sales/Sales.jsx`, after `executeVoid` (line 120).
**How:**

```js
// T4.151: Close Day handler
const handleCloseDay = async () => {
  setCloseDayLoading(true);
  try {
    await closeDay(profile);
    setOpenCloseDay(false);
    setToast({ open: true, message: `Day closed successfully. Z-report frozen.`, severity: 'success' });
  } catch (error) {
    console.error('[Sales.handleCloseDay]:', error);
    setToast({ open: true, message: 'Close day failed: ' + error.message, severity: 'error' });
  } finally {
    setCloseDayLoading(false);
  }
};

// T4.151: Reopen Day handler
const handleReopenDay = async () => {
  setCloseDayLoading(true);
  try {
    await reopenDay(profile, reopenReason);
    setOpenReopenDay(false);
    setReopenReason('');
    setToast({ open: true, message: 'Day reopened. Post-close flagging deactivated.', severity: 'info' });
  } catch (error) {
    console.error('[Sales.handleReopenDay]:', error);
    setToast({ open: true, message: 'Reopen failed: ' + error.message, severity: 'error' });
  } finally {
    setCloseDayLoading(false);
  }
};
```

**Depends on:** Steps 4.1, 4.2.

### Step 4.4 — Add Close Day / Reopen / Z-Report buttons to the command strip

**What:** Add buttons next to the existing Print Report icon button in the top header.
**Where:** `VetConnect-Admin/src/features/Sales/Sales.jsx`, inside the Row 1 Box (line 434-444).
**How:** After the flexGrow spacer `<Box sx={{ flexGrow: 1 }} />` and before the Print Report IconButton, add:

```jsx
{/* T4.151: Close Day / Reopen / Z-Report buttons (admin only) */}
{isAdmin && !isDayClosed && (
  <Button
    variant="contained"
    size="small"
    onClick={() => setOpenCloseDay(true)}
    disabled={loading || sales.length === 0}
    sx={{
      bgcolor: COLORS.danger, fontWeight: 900, borderRadius: 0, px: 2,
      border: `2px solid ${COLORS.dangerHover}`,
      boxShadow: `3px 3px 0px ${COLORS.danger}33`,
      '&:hover': { bgcolor: COLORS.dangerHover, boxShadow: `1px 1px 0px ${COLORS.danger}33` },
      textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem',
    }}
  >
    CLOSE DAY
  </Button>
)}
{isDayClosed && (
  <Button
    variant="outlined"
    size="small"
    onClick={() => setOpenZReport(true)}
    sx={{
      fontWeight: 900, borderRadius: 0, px: 2,
      borderColor: COLORS.success, color: COLORS.success, borderWidth: 2,
      textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem',
    }}
  >
    VIEW Z-REPORT
  </Button>
)}
{isDayClosed && isAdmin && (
  <Button
    variant="outlined"
    size="small"
    onClick={() => setOpenReopenDay(true)}
    sx={{
      fontWeight: 900, borderRadius: 0, px: 2,
      borderColor: COLORS.warning, color: COLORS.warning, borderWidth: 2,
      textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem',
    }}
  >
    REOPEN DAY
  </Button>
)}
```

**Why:** Close Day is admin-only, destructive (red). Z-Report is visible when closed. Reopen is admin-only with warning color.
**Depends on:** Steps 4.1, 4.2.

### Step 4.5 — Add "AFTER CLOSE" badge to the DataGrid status column

**What:** Show an amber "AFTER CLOSE" chip below the status chip when `sale.postClose === true`.
**Where:** `VetConnect-Admin/src/features/Sales/Sales.jsx`, inside the `status` column renderCell (line 381-393).
**How:**

After the existing `_crossDayRefund` chip (line 386-390), add:

```jsx
{p.row.postClose && (
  <Chip
    label="AFTER CLOSE"
    size="small"
    sx={{
      borderRadius: 0, fontWeight: 900, fontSize: '0.55rem',
      bgcolor: COLORS.warningSurface, color: COLORS.warning,
      border: `1px solid ${COLORS.amber}`, height: 18,
    }}
  />
)}
```

**Why:** Visual indicator of post-close transactions for audit review.
**Depends on:** Nothing (renders from existing sale data).

### Step 4.6 — Build the Z-Report HTML generator function

**What:** Create a `generateZReportHTML()` function that produces a printable HTML document from `closingData` and `eodTotals`.
**Where:** `VetConnect-Admin/src/features/Sales/Sales.jsx`, as a standalone function inside the component (after the handlers).
**How:**

```js
const generateZReportHTML = () => {
  const cd = closingData;
  if (!cd) return '';
  const closedTime = cd.closedAt?.toDate?.() ? cd.closedAt.toDate().toLocaleString('en-PH') : 'N/A';
  const reportDate = new Date(filterDate).toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Post-close summary
  const postCloseSales = sales.filter(s => s.postClose);
  const postCloseRevenue = postCloseSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);

  return `<html>
    <head><style>
      body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; max-width: 700px; margin: 0 auto; padding: 30px; }
      h1 { color: #5D4037; font-size: 22px; border-bottom: 3px solid #5D4037; padding-bottom: 10px; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 2px; }
      h2 { color: #5D4037; font-size: 14px; margin-top: 25px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #D7CCC8; padding-bottom: 5px; }
      .date { color: #8D6E63; font-size: 13px; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
      th, td { padding: 8px 12px; text-align: left; font-size: 13px; }
      th { background: #F5F0EB; font-weight: 700; border-bottom: 2px solid #5D4037; }
      td { border-bottom: 1px solid #E0D6CC; }
      .amount { text-align: right; font-weight: 700; }
      .total-row td { font-weight: 800; font-size: 15px; border-top: 2px solid #5D4037; }
      .refund { color: #D32F2F; }
      .warning { color: #E65100; }
      .footer { text-align: center; margin-top: 40px; font-size: 11px; color: #A1887F; border-top: 1px solid #E0D6CC; padding-top: 10px; }
      .z-badge { text-align: center; font-weight: 900; font-size: 18px; border: 3px solid #5D4037; padding: 8px; margin-bottom: 20px; letter-spacing: 3px; color: #5D4037; }
      .close-info { background: #F5F0EB; padding: 12px; margin-bottom: 20px; border-left: 4px solid #5D4037; }
      .post-close { background: #FFF3E0; padding: 12px; margin-bottom: 20px; border-left: 4px solid #E65100; }
      .signature { margin-top: 60px; display: flex; justify-content: space-between; }
      .sig-line { border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 5px; font-size: 12px; }
    </style></head>
    <body>
      <div class="z-badge">Z-REPORT (END OF DAY)</div>
      <h1>${clinicSettings.clinicName || 'VetConnect Clinic'}</h1>
      <p class="date">${reportDate}</p>

      <div class="close-info">
        <strong>Closed by:</strong> ${cd.closedByName || 'N/A'}<br/>
        <strong>Closed at:</strong> ${closedTime}
        ${cd.reopenedAt ? `<br/><strong style="color:#E65100;">Reopened by:</strong> ${cd.reopenedByName || 'N/A'} — ${cd.reopenReason || 'No reason'}` : ''}
      </div>

      ${postCloseSales.length > 0 ? `
        <div class="post-close">
          <strong class="warning">Post-Close Activity:</strong> ${postCloseSales.length} transaction(s) totaling P${postCloseRevenue.toFixed(2)} recorded after day was closed.
        </div>
      ` : ''}

      <h2>Revenue Summary</h2>
      <table>
        <tbody>
          <tr><td>Total Transactions</td><td class="amount">${cd.transactionCount}</td></tr>
          <tr><td>Gross Revenue (Total Billed)</td><td class="amount">P${cd.grossRevenue.toFixed(2)}</td></tr>
          <tr><td>Prior Deposits Applied</td><td class="amount">P${cd.depositTotal.toFixed(2)}</td></tr>
          <tr><td>SC/PWD Discounts</td><td class="amount">P${cd.scPwdDiscounts.toFixed(2)}</td></tr>
          ${cd.customDiscounts > 0 ? `<tr><td>Custom Discounts</td><td class="amount warning">P${cd.customDiscounts.toFixed(2)}</td></tr>` : ''}
          ${cd.refunds > 0 ? `<tr class="refund"><td>Refunds</td><td class="amount">- P${cd.refunds.toFixed(2)}</td></tr>` : ''}
          ${cd.voids > 0 ? `<tr class="refund"><td>Voided Transactions (${cd.voids})</td><td class="amount">P${cd.voidAmount.toFixed(2)}</td></tr>` : ''}
          <tr class="total-row"><td>Net Revenue Collected</td><td class="amount">P${cd.netRevenue.toFixed(2)}</td></tr>
        </tbody>
      </table>

      <h2>Payment Method Breakdown</h2>
      <table>
        <thead><tr><th>Method</th><th class="amount">Collected</th></tr></thead>
        <tbody>
          <tr><td>Cash</td><td class="amount">P${cd.cashTotal.toFixed(2)}</td></tr>
          <tr><td>GCash / Maya</td><td class="amount">P${cd.gcashTotal.toFixed(2)}</td></tr>
          <tr><td>Card</td><td class="amount">P${cd.cardTotal.toFixed(2)}</td></tr>
          <tr><td>Bank Transfer</td><td class="amount">P${cd.bankTotal.toFixed(2)}</td></tr>
          <tr class="total-row"><td>Total Collected</td><td class="amount">P${(cd.cashTotal + cd.gcashTotal + cd.cardTotal + cd.bankTotal).toFixed(2)}</td></tr>
        </tbody>
      </table>

      <div class="signature">
        <div class="sig-line">Prepared by: ${cd.closedByName || '_______________'}</div>
        <div class="sig-line">Verified by: _______________</div>
      </div>

      <div class="footer">
        <p>Generated on ${new Date().toLocaleString('en-PH')} | ${clinicSettings.clinicName || 'VetConnect'}</p>
        <p>This is a system-generated Z-Report. Retain for BIR compliance.</p>
      </div>
    </body>
  </html>`;
};
```

**Why:** Z-report is the official EOD financial summary. Follows the same HTML styling conventions as the existing `handlePrintReport` and `generateReceiptHTML`.
**Depends on:** Step 4.1 (closingData must be available).

### Step 4.7 — Add Close Day Confirmation Dialog

**What:** MUI Dialog showing a summary preview before closing the day. Zero prompt()/confirm().
**Where:** `VetConnect-Admin/src/features/Sales/Sales.jsx`, after the void dialog (line 626).
**How:**

```jsx
{/* T4.151: CLOSE DAY CONFIRMATION DIALOG */}
<Dialog open={openCloseDay} onClose={() => setOpenCloseDay(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.danger}`, boxShadow: `8px 8px 0px ${COLORS.danger}1A` } }}>
  <DialogTitle sx={{ bgcolor: COLORS.dangerSurface, color: COLORS.danger, fontWeight: 800, py: 2, borderBottom: `2px solid ${COLORS.danger}`, textTransform: 'uppercase', letterSpacing: 1, fontSize: '1rem' }}>
    Close Day — Freeze Totals
  </DialogTitle>
  <DialogContent sx={{ p: 4, bgcolor: COLORS.cardBg }}>
    <Alert severity="warning" sx={{ mb: 3, fontWeight: 800, border: `2px solid ${COLORS.warning}`, borderRadius: 0, bgcolor: COLORS.warningSurface }}>
      This will freeze today's totals into a Z-report. New transactions will be flagged as post-close.
    </Alert>
    <Paper variant="outlined" sx={{ p: 2.5, bgcolor: COLORS.formBg, borderRadius: 0, border: `2px dashed ${COLORS.border}` }}>
      <Typography variant="caption" sx={{ fontWeight: 800, color: COLORS.accent, display: 'block', mb: 1.5, borderBottom: `1px solid ${COLORS.border}`, pb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Summary Preview
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>Transactions: {sales.length}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>Total Collected: ₱{eodTotals.totalCollected.toFixed(2)}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>Refunds: ₱{eodTotals.refunds.toFixed(2)}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>Net: ₱{(eodTotals.totalCollected - eodTotals.refunds).toFixed(2)}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>Cash: ₱{eodTotals.cash.toFixed(2)} | GCash: ₱{eodTotals.gcash.toFixed(2)} | Card: ₱{eodTotals.card.toFixed(2)} | Bank: ₱{eodTotals.bank.toFixed(2)}</Typography>
    </Paper>
  </DialogContent>
  <DialogActions sx={{ p: 3, borderTop: `2px solid ${COLORS.danger}`, bgcolor: COLORS.dangerSurface, justifyContent: 'space-between' }}>
    <Button onClick={() => setOpenCloseDay(false)} sx={{ fontWeight: 800, color: COLORS.textSecondary, px: 3, fontFamily: FONT }}>CANCEL</Button>
    <Button
      onClick={handleCloseDay} variant="contained" disabled={closeDayLoading}
      sx={{
        fontWeight: 800, px: 4, py: 1.5, borderRadius: 0,
        bgcolor: COLORS.danger, border: `2px solid ${COLORS.dangerHover}`,
        boxShadow: `4px 4px 0px ${COLORS.danger}33`,
        '&:hover': { bgcolor: COLORS.dangerHover, boxShadow: `2px 2px 0px ${COLORS.danger}33` },
        fontFamily: FONT,
      }}
    >
      {closeDayLoading ? 'CLOSING...' : 'CONFIRM CLOSE DAY'}
    </Button>
  </DialogActions>
</Dialog>
```

**Depends on:** Steps 4.2, 4.3.

### Step 4.8 — Add Reopen Day Dialog (with reason field)

**What:** MUI Dialog with a required TextField for the audit reason.
**Where:** `VetConnect-Admin/src/features/Sales/Sales.jsx`, after the Close Day dialog.
**How:**

```jsx
{/* T4.151: REOPEN DAY DIALOG */}
<Dialog open={openReopenDay} onClose={() => { setOpenReopenDay(false); setReopenReason(''); }} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.warning}` } }}>
  <DialogTitle sx={{ bgcolor: COLORS.warningSurface, color: COLORS.warning, fontWeight: 800, py: 2, borderBottom: `2px solid ${COLORS.warning}`, textTransform: 'uppercase', letterSpacing: 1, fontSize: '1rem' }}>
    Reopen Closed Day
  </DialogTitle>
  <DialogContent sx={{ p: 4, bgcolor: COLORS.cardBg }}>
    <Alert severity="info" sx={{ mb: 3, fontWeight: 800, borderRadius: 0 }}>
      Reopening will deactivate post-close flagging. The original Z-report totals are preserved.
    </Alert>
    <Typography variant="body2" sx={{ fontWeight: 700, mb: 2 }}>
      Closed by {closingData?.closedByName || 'N/A'} at {closingData?.closedAt?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || 'N/A'}
    </Typography>
    <TextField
      fullWidth
      label="Reason for reopening (required)"
      placeholder="e.g. Missed a walk-in transaction before close"
      value={reopenReason}
      onChange={(e) => setReopenReason(e.target.value)}
      multiline rows={2}
      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
    />
  </DialogContent>
  <DialogActions sx={{ p: 3, borderTop: `2px solid ${COLORS.warning}`, bgcolor: COLORS.warningSurface, justifyContent: 'space-between' }}>
    <Button onClick={() => { setOpenReopenDay(false); setReopenReason(''); }} sx={{ fontWeight: 800, color: COLORS.textSecondary, px: 3, fontFamily: FONT }}>CANCEL</Button>
    <Button
      onClick={handleReopenDay} variant="contained" disabled={closeDayLoading || !reopenReason.trim()}
      sx={{
        fontWeight: 800, px: 4, py: 1.5, borderRadius: 0,
        bgcolor: COLORS.warning, border: `2px solid ${COLORS.ctaHover}`,
        '&:hover': { bgcolor: COLORS.ctaHover },
        fontFamily: FONT,
      }}
    >
      {closeDayLoading ? 'REOPENING...' : 'REOPEN DAY'}
    </Button>
  </DialogActions>
</Dialog>
```

**Depends on:** Steps 4.2, 4.3.

### Step 4.9 — Add Z-Report Dialog (printable)

**What:** Full-screen Dialog that renders the Z-report HTML with a Print button.
**Where:** `VetConnect-Admin/src/features/Sales/Sales.jsx`, after the Reopen dialog.
**How:**

```jsx
{/* T4.151: Z-REPORT VIEW DIALOG */}
<Dialog open={openZReport} onClose={() => setOpenZReport(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.brand}`, boxShadow: `8px 8px 0px ${COLORS.brand}1A` } }}>
  <DialogTitle sx={{ bgcolor: COLORS.cream, color: COLORS.brand, fontWeight: 800, py: 2, borderBottom: `2px solid ${COLORS.brand}`, textTransform: 'uppercase', letterSpacing: 1, fontSize: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    Z-Report — {filterDate}
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Button
        variant="contained" size="small"
        startIcon={<PrintIcon />}
        onClick={() => {
          const html = generateZReportHTML();
          printViaIframe(html);
        }}
        sx={{ bgcolor: COLORS.sky, fontWeight: 900, borderRadius: 0, '&:hover': { bgcolor: COLORS.skyHover } }}
      >
        PRINT
      </Button>
      <Button
        variant="outlined" size="small"
        onClick={() => {
          const html = generateZReportHTML();
          downloadHtmlAsFile(html, `Z-Report-${filterDate}.html`);
        }}
        sx={{ fontWeight: 900, borderRadius: 0, borderColor: COLORS.accent, color: COLORS.accent, borderWidth: 2 }}
      >
        DOWNLOAD
      </Button>
    </Box>
  </DialogTitle>
  <DialogContent sx={{ p: 0, bgcolor: COLORS.cardBg }}>
    <Box
      sx={{ p: 3 }}
      dangerouslySetInnerHTML={{ __html: generateZReportHTML() }}
    />
  </DialogContent>
  <DialogActions sx={{ p: 2, borderTop: `2px solid ${COLORS.border}` }}>
    <Button onClick={() => setOpenZReport(false)} sx={{ fontWeight: 800, color: COLORS.textSecondary, fontFamily: FONT }}>CLOSE</Button>
  </DialogActions>
</Dialog>
```

NOTE: `printViaIframe` and `downloadHtmlAsFile` are utility functions defined in Phase 5.

**Depends on:** Steps 4.6 (Z-report generator), Phase 5 (utility functions).

### Step 4.10 — Update EodSummary to show close status

**What:** Pass `isDayClosed` and `closingData` to EodSummary. Show a close-status indicator.
**Where:** `VetConnect-Admin/src/features/Sales/components/EodSummary.jsx`
**How:**

Update the component signature:
```js
export default function EodSummary({ totals, filterMethod, setFilterMethod, isDayClosed, closingData }) {
```

After the `<Grid container>` (line 48), add a full-width row when closed:
```jsx
{isDayClosed && (
  <Grid size={{ xs: 12 }}>
    <Paper sx={{
      p: 1.5, borderRadius: 0, bgcolor: COLORS.warningSurface,
      border: `2px solid ${COLORS.amber}`, display: 'flex', alignItems: 'center', gap: 1.5,
    }}>
      <Typography variant="caption" sx={{ fontWeight: 900, color: COLORS.warning, fontSize: '0.7rem', letterSpacing: 0.5 }}>
        DAY CLOSED at {closingData?.closedAt?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || 'N/A'} by {closingData?.closedByName || 'N/A'}
      </Typography>
      {(closingData?.postCloseCount || 0) > 0 && (
        <Typography variant="caption" sx={{ fontWeight: 900, color: COLORS.danger, fontSize: '0.65rem' }}>
          | {closingData.postCloseCount} post-close txn(s) (₱{(closingData.postCloseTotal || 0).toFixed(2)})
        </Typography>
      )}
      {closingData?.reopenedAt && (
        <Typography variant="caption" sx={{ fontWeight: 900, color: COLORS.success, fontSize: '0.65rem' }}>
          | REOPENED by {closingData.reopenedByName || 'N/A'}
        </Typography>
      )}
    </Paper>
  </Grid>
)}
```

Update the EodSummary call in Sales.jsx (line 516):
```jsx
<EodSummary totals={eodTotals} filterMethod={filterMethod} setFilterMethod={setFilterMethod} isDayClosed={isDayClosed} closingData={closingData} />
```

**Depends on:** Step 4.1.

### Step 4.11 — Pass isDayClosed/closingData from wherever POSModal is rendered

**What:** Thread the `isDayClosed` and `closingData` props to POSModal at its call site.
**Where:** The POSModal is rendered from the Queue page (ClinicalWorkspace.jsx or Queue.jsx). Search the codebase for `<POSModal` to find the render site(s).
**How:** At each `<POSModal ... />` call site, add:
```jsx
isDayClosed={isDayClosed}
closingData={closingData}
```

The Queue/ClinicalWorkspace component will need to call `useSalesData` to get these values, OR receive them as props from a parent that already subscribes. The lightest approach: add a minimal `useClosingStatus` custom hook that only subscribes to the daily_closings doc (not the full sales query).

Alternative (simpler): Create a tiny hook in the same hooks directory:

```js
// VetConnect-Admin/src/features/Sales/hooks/useClosingStatus.js
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

export function useClosingStatus(dateStr) {
  const [closingData, setClosingData] = useState(null);
  useEffect(() => {
    if (!dateStr) return;
    const unsub = onSnapshot(doc(db, 'daily_closings', dateStr), (snap) => {
      setClosingData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    }, () => {});
    return unsub;
  }, [dateStr]);
  const isDayClosed = closingData !== null && !closingData.reopenedAt;
  return { isDayClosed, closingData };
}
```

Then in the Queue component, import and use this hook with today's date, and pass the values to POSModal.

**Depends on:** Steps 3.1, Phase 2.

**Verification checkpoint (Phase 4):** Close Day button appears for admin users. Clicking it shows a confirmation dialog with summary. After confirming, the button changes to "VIEW Z-REPORT" + "REOPEN DAY". The Z-report dialog renders with all financial data. Post-close badge appears on any new transactions. EodSummary shows the amber close-status bar.

---

## Phase 5: Receipt PDF Fallback + Email Receipt Utilities (T4.152)

### Step 5.1 — Create `receiptUtils.js` utility file

**What:** A shared utility file with `printViaIframe`, `downloadHtmlAsFile`, and `emailReceiptToOwner` functions.
**Where:** `VetConnect-Admin/src/utils/receiptUtils.js` (NEW FILE)
**How:**

```js
/**
 * receiptUtils.js — Receipt printing, PDF download, and email utilities (T4.152).
 *
 * Strategy: iframe-based printing avoids pop-up blockers. Blob URL download
 * is the fallback. No npm dependencies (html2canvas/jsPDF not needed).
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getWorkerUrl, getCachedOwnerEmail, resolvePushToken } from './sendPushNotification';

/**
 * Prints HTML content via a hidden iframe.
 * Falls back to window.open if iframe printing fails.
 * Returns true if printing was initiated, false if blocked.
 */
export function printViaIframe(html) {
  try {
    // Create a hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // Wait for content to render before printing
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch {
        // iframe print failed — try window.open fallback
        const win = window.open('', '_blank', 'width=800,height=600');
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
          setTimeout(() => { win.print(); win.close(); }, 250);
        }
      }
      // Clean up iframe after a delay
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 300);

    return true;
  } catch {
    return false;
  }
}

/**
 * Downloads HTML content as a .html file via Blob URL.
 * This is the fallback when both iframe and window.open fail.
 *
 * @param {string} html - The HTML content
 * @param {string} filename - Download filename (e.g., 'receipt-OR-20260504-0001.html')
 */
export function downloadHtmlAsFile(html, filename = 'receipt.html') {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Emails receipt HTML to the pet owner via the Cloudflare Worker /email endpoint.
 * Resolves the owner's email from the cached push token resolver (which also caches email).
 *
 * @param {object} params
 * @param {string} params.html - The receipt HTML content
 * @param {string} params.ownerId - The Firestore user ID of the pet owner
 * @param {string} params.receiptNumber - For the email subject line
 * @param {string} params.clinicName - Clinic name for subject line
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function emailReceiptToOwner({ html, ownerId, receiptNumber, clinicName }) {
  if (!ownerId || ownerId === 'WALK_IN_USER' || ownerId === 'UNKNOWN') {
    return { success: false, message: 'Walk-in client — no email on file.' };
  }

  // Ensure the owner's email is cached (resolvePushToken also caches email)
  await resolvePushToken(ownerId);
  const email = getCachedOwnerEmail(ownerId);

  if (!email) {
    return { success: false, message: 'No email address on file for this client.' };
  }

  const workerUrl = await getWorkerUrl();
  if (!workerUrl) {
    return { success: false, message: 'Email service not configured. Contact admin.' };
  }

  const baseEndpoint = workerUrl.replace(/\/+$/, '');
  const subject = `Receipt ${receiptNumber || ''} — ${clinicName || 'VetConnect'}`;

  try {
    const response = await fetch(baseEndpoint + '/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      return { success: false, message: `Email send failed (HTTP ${response.status}).` };
    }

    return { success: true, message: `Receipt emailed to ${email}` };
  } catch (err) {
    return { success: false, message: `Email failed: ${err.message}` };
  }
}
```

**Why:** Centralizes all receipt delivery mechanisms. `printViaIframe` is the primary print path (avoids pop-up blockers). `downloadHtmlAsFile` is the zero-dependency PDF alternative (downloads HTML that the user can print-to-PDF from their browser). `emailReceiptToOwner` reuses the existing Worker/email infrastructure.
**Depends on:** Nothing (new file). Uses existing `sendPushNotification.js` exports for email resolution.

### Step 5.2 — Wire receipt utility functions into POSModal checkout success

**What:** Import the utilities and connect the three buttons in the checkout success overlay.
**Where:** `VetConnect-Admin/src/components/POSModal.jsx`
**How:**

Add import at the top:
```js
import { printViaIframe, downloadHtmlAsFile, emailReceiptToOwner } from '../utils/receiptUtils';
```

Add handler functions inside the component (before the return):
```js
// T4.152: Receipt action handlers
const handlePrintReceipt = (html) => {
  const success = printViaIframe(html);
  if (!success) {
    // Iframe failed — fall back to download
    downloadHtmlAsFile(html, `receipt-${checkoutSuccess?.receiptNumber || 'unknown'}.html`);
    // Toast is set by parent — we can't access toast here, but the success overlay handles this
  }
};

const handleDownloadReceipt = (html) => {
  const receiptNum = html.match(/Receipt #:<\/strong>\s*([^<]+)/)?.[1]?.trim() || 'receipt';
  downloadHtmlAsFile(html, `${receiptNum}.html`);
};

const handleEmailReceipt = async (html) => {
  const receiptNum = html.match(/Receipt #:<\/strong>\s*([^<]+)/)?.[1]?.trim() || '';
  const result = await emailReceiptToOwner({
    html,
    ownerId: patient?.ownerId,
    receiptNumber: receiptNum,
    clinicName: clinicSettings.clinicName,
  });
  // Use a simple alert-like state for feedback within the success overlay
  // We'll use a local state for this
  setEmailFeedback(result.message);
};
```

Add state for email feedback:
```js
const [emailFeedback, setEmailFeedback] = useState('');
```

Update the success overlay buttons (from Step 3.4) to call these handlers:
- Print button: `onClick={() => handlePrintReceipt(checkoutSuccess.receiptHTML)}`
- Download PDF button: `onClick={() => handleDownloadReceipt(checkoutSuccess.receiptHTML)}`
- Email Receipt button: `onClick={() => handleEmailReceipt(checkoutSuccess.receiptHTML)}`

Add email feedback display below the buttons:
```jsx
{emailFeedback && (
  <Typography variant="body2" sx={{ mt: 1, fontWeight: 700, color: emailFeedback.includes('emailed') ? COLORS.success : COLORS.warning }}>
    {emailFeedback}
  </Typography>
)}
```

Reset `emailFeedback` on modal open (in the initPOS useEffect): `setEmailFeedback('');`

**Depends on:** Steps 3.4, 5.1.

### Step 5.3 — Wire receipt utilities into Sales.jsx reprint handler

**What:** Replace the `handleReprint` window.open mechanism with the 3-button pattern. Add a reprint dialog instead of directly printing.
**Where:** `VetConnect-Admin/src/features/Sales/Sales.jsx`
**How:**

Add import:
```js
import { printViaIframe, downloadHtmlAsFile, emailReceiptToOwner } from '../../utils/receiptUtils';
```

Add state:
```js
const [reprintSale, setReprintSale] = useState(null); // sale object for reprint dialog
const [reprintFeedback, setReprintFeedback] = useState('');
```

Replace the `handleReprint` function (lines 133-222) with:
```js
const handleReprint = (sale) => {
  setReprintSale(sale);
  setReprintFeedback('');
};
```

Add a helper that generates the reprint receipt HTML (keep the existing HTML template from the old handleReprint, but as a function that returns the HTML string instead of printing it):

```js
const generateReprintHTML = (sale) => {
  // ... (same HTML generation logic currently in handleReprint, lines 134-213)
  // Return the HTML string instead of opening a window
};
```

Add a Reprint Dialog after the existing dialogs:
```jsx
{/* T4.152: REPRINT DIALOG — 3-button receipt actions */}
<Dialog open={!!reprintSale} onClose={() => setReprintSale(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.medical}` } }}>
  <DialogTitle sx={{ bgcolor: COLORS.chipBlueBg, color: COLORS.medical, fontWeight: 800, py: 2, borderBottom: `2px solid ${COLORS.medical}`, textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.9rem' }}>
    Reprint Receipt — {reprintSale?.receiptNumber || reprintSale?.id?.slice(0, 8).toUpperCase()}
  </DialogTitle>
  <DialogContent sx={{ p: 3, bgcolor: COLORS.cardBg, display: 'flex', flexDirection: 'column', gap: 2, pt: 3 }}>
    <Button
      fullWidth variant="contained"
      startIcon={<PrintIcon />}
      onClick={() => {
        const html = generateReprintHTML(reprintSale);
        printViaIframe(html);
      }}
      sx={{ bgcolor: COLORS.sky, fontWeight: 900, borderRadius: 0, py: 1.5, '&:hover': { bgcolor: COLORS.skyHover } }}
    >
      PRINT RECEIPT
    </Button>
    <Button
      fullWidth variant="outlined"
      onClick={() => {
        const html = generateReprintHTML(reprintSale);
        downloadHtmlAsFile(html, `reprint-${reprintSale?.receiptNumber || 'receipt'}.html`);
      }}
      sx={{ fontWeight: 900, borderRadius: 0, py: 1.5, borderColor: COLORS.accent, color: COLORS.accent, borderWidth: 2 }}
    >
      DOWNLOAD FILE
    </Button>
    <Button
      fullWidth variant="outlined"
      onClick={async () => {
        const html = generateReprintHTML(reprintSale);
        const result = await emailReceiptToOwner({
          html,
          ownerId: reprintSale?.ownerId,
          receiptNumber: reprintSale?.receiptNumber || reprintSale?.id?.slice(0, 8),
          clinicName: clinicSettings.clinicName,
        });
        setReprintFeedback(result.message);
      }}
      sx={{ fontWeight: 900, borderRadius: 0, py: 1.5, borderColor: COLORS.success, color: COLORS.success, borderWidth: 2 }}
    >
      EMAIL RECEIPT
    </Button>
    {reprintFeedback && (
      <Typography variant="body2" sx={{ fontWeight: 700, color: reprintFeedback.includes('emailed') ? COLORS.success : COLORS.warning, textAlign: 'center' }}>
        {reprintFeedback}
      </Typography>
    )}
  </DialogContent>
  <DialogActions sx={{ p: 2, borderTop: `2px solid ${COLORS.border}` }}>
    <Button onClick={() => setReprintSale(null)} sx={{ fontWeight: 800, color: COLORS.textSecondary, fontFamily: FONT }}>CLOSE</Button>
  </DialogActions>
</Dialog>
```

**Depends on:** Step 5.1.

### Step 5.4 — Wire `printViaIframe` and `downloadHtmlAsFile` into Z-Report Dialog

**What:** The Z-Report dialog (Step 4.9) uses `printViaIframe` and `downloadHtmlAsFile`. Import them.
**Where:** `VetConnect-Admin/src/features/Sales/Sales.jsx`
**How:** Already imported in Step 5.3. The Z-Report dialog buttons from Step 4.9 call these functions directly.
**Depends on:** Steps 4.9, 5.1.

### Step 5.5 — Replace `handlePrintReport` to use iframe printing

**What:** The existing Print Report button (line 225-298) uses window.open. Replace with `printViaIframe`.
**Where:** `VetConnect-Admin/src/features/Sales/Sales.jsx`
**How:**

Replace the print mechanism at the bottom of `handlePrintReport` (lines 292-298):
```js
// Old:
const printWindow = window.open('', '_blank', 'width=800,height=600');
if (printWindow) { ... }

// New:
printViaIframe(reportContent);
```

**Depends on:** Step 5.1.

**Verification checkpoint (Phase 5):** 
- POSModal checkout: success overlay shows 3 buttons. Print opens iframe print dialog. Download downloads HTML file. Email sends to owner's email.
- Sales ledger: reprint icon opens a 3-button dialog instead of directly printing.
- Z-Report: Print and Download buttons work via iframe and blob URL respectively.
- Existing Print Report button uses iframe instead of window.open.

---

## Phase 6: Pass Props Through Component Tree (T4.151 wiring)

### Step 6.1 — Find all POSModal render sites and thread props

**What:** Grep for `<POSModal` across the codebase and add `isDayClosed`/`closingData` props.
**Where:** Search result will determine files. Expected: Queue.jsx or ClinicalWorkspace.jsx.
**How:**

At each render site:
1. Import `useClosingStatus` from `VetConnect-Admin/src/features/Sales/hooks/useClosingStatus.js`
2. Call `const { isDayClosed, closingData } = useClosingStatus(new Date().toISOString().split('T')[0]);`
3. Pass `isDayClosed={isDayClosed} closingData={closingData}` to `<POSModal>`

**Depends on:** Step 4.11 (useClosingStatus hook created).

**Verification checkpoint (Phase 6):** POSModal receives the close status from wherever it's opened. Post-close sales get tagged correctly.

---

## Files Summary

### Modified Files (6)
| File | Task | Changes |
|---|---|---|
| `VetConnect-Backend/firestore.rules` | T4.151 | Add `daily_closings` collection rules |
| `VetConnect-Admin/src/features/Sales/hooks/useSalesData.js` | T4.151 | Add onSnapshot for daily_closings, export isDayClosed/closingData/closeDay/reopenDay, extend eodTotals with voidCount/voidAmount |
| `VetConnect-Admin/src/features/Sales/Sales.jsx` | T4.151 + T4.152 | Close Day button, Reopen dialog, Z-Report dialog, post-close badge, reprint 3-button dialog, iframe print |
| `VetConnect-Admin/src/features/Sales/components/EodSummary.jsx` | T4.151 | Accept isDayClosed/closingData props, show close status bar |
| `VetConnect-Admin/src/components/POSModal.jsx` | T4.151 + T4.152 | Accept isDayClosed/closingData props, tag post-close sales, replace window.confirm with success overlay, 3-button receipt actions |
| Queue/ClinicalWorkspace render site(s) | T4.151 | Thread isDayClosed/closingData to POSModal |

### New Files (2)
| File | Task | Purpose |
|---|---|---|
| `VetConnect-Admin/src/features/Sales/hooks/useClosingStatus.js` | T4.151 | Lightweight hook for POSModal render sites that don't have full useSalesData |
| `VetConnect-Admin/src/utils/receiptUtils.js` | T4.152 | printViaIframe, downloadHtmlAsFile, emailReceiptToOwner utilities |

---

## Risk Assessment

1. **Pop-up blocker variations.** The iframe print approach works in Chrome, Firefox, and Edge. Safari may require a user-gesture context. Mitigation: the Blob URL download fallback always works.

2. **Firestore daily_closings read cost.** Each Sales page load adds one onSnapshot listener. Cost: 1 read/page-load, then only reads on changes. Negligible.

3. **Post-close counter race condition.** If two cashiers check out simultaneously after close, `increment()` is atomic -- no race. The Firestore `increment` field transform handles this.

4. **Email delivery reliability.** The Cloudflare Worker `/email` endpoint (Resend) has its own failure modes (rate limits, bad email addresses). Mitigation: the `emailReceiptToOwner` function returns success/failure messages displayed inline.

5. **voided sales in eodTotals.** Currently, voided sales are NOT excluded from payment method totals (they count toward cash/gcash/card/bank). The Z-report freezes these values as-is. A separate task should fix the voided-sale exclusion in eodTotals (out of scope for T4.151).

6. **setDoc vs updateDoc for closeDay.** Using `setDoc` means if a daily_closings doc already exists (admin accidentally clicked close twice), it will be overwritten. The UI guards against this (button hidden when isDayClosed), but Firestore rules do not. Acceptable for admin-only write access.

---

## Testing Strategy

### Manual QA Checklist

**T4.151:**
- [ ] Admin sees "CLOSE DAY" button on Sales page. Non-admin does not.
- [ ] Clicking "CLOSE DAY" shows confirmation dialog with correct summary totals.
- [ ] After confirming, button changes to "VIEW Z-REPORT" + "REOPEN DAY".
- [ ] Z-Report dialog shows all financial data correctly.
- [ ] Z-Report Print and Download buttons work.
- [ ] New checkout after close shows amber "post-close" warning in POSModal.
- [ ] Sale doc in Firestore has `postClose:true` after post-close checkout.
- [ ] "AFTER CLOSE" badge appears on post-close transactions in the ledger.
- [ ] EodSummary shows amber close-status bar with closer name and time.
- [ ] Admin can reopen day with reason. Close-status bar updates.
- [ ] After reopening, new checkouts do NOT get postClose flag.
- [ ] Navigating to a different date and back preserves close status.

**T4.152:**
- [ ] POSModal checkout success shows 3 buttons: Print, Download PDF, Email Receipt.
- [ ] Print opens browser print dialog (via iframe, not popup).
- [ ] Download creates a .html file download.
- [ ] Email sends receipt to client's email address. Feedback message shown.
- [ ] Email fails gracefully for walk-in clients (no email on file).
- [ ] Sales ledger reprint icon opens 3-button dialog instead of direct print.
- [ ] Print Report button on Sales page uses iframe printing.

---

## Estimated Effort

| Phase | Effort | Notes |
|---|---|---|
| Phase 1: Firestore rules | 5 min | One rule block |
| Phase 2: useSalesData data layer | 30 min | 4 changes to one file |
| Phase 3: POSModal post-close tagging | 45 min | Props, tagging, success overlay |
| Phase 4: Sales.jsx + EodSummary UI | 1 hr | 3 dialogs, Z-report generator, badge |
| Phase 5: Receipt utilities | 30 min | New file + wiring |
| Phase 6: Prop threading | 15 min | Find sites, thread props |
| **Total** | **~3 hrs** | |

---

## Done-When Acceptance

- **T4.151:** Admin clicks "Close Day" on Sales page. Firestore `daily_closings/{date}` doc exists with frozen totals. New POS checkouts after close are tagged `postClose:true`. Z-Report renders and prints. Admin can reopen with audit reason.
- **T4.152:** POSModal checkout success shows Print/Download/Email buttons. All three work. Sales ledger reprint shows the same three options. No `window.confirm()` or `alert()` anywhere in the receipt flow.

---

## External Blockers

- **None.** No npm installs required. No Blaze upgrade. Cloudflare Worker `/email` endpoint already deployed. Firestore rules deploy requires Firebase CLI access (already available).
