---
name: T4.151/T4.152 EOD Close-Out and Receipt Robustness Patterns
description: Patterns, bugs, and architectural decisions from the EOD Z-report and receipt PDF fallback implementation
type: project
---

T4.151 introduced `daily_closings/{dateStr}` with staff-read/admin-write/no-delete Firestore rules, a `setDoc`-based idempotent `closeDay()`, and fire-and-forget `increment()` for post-close counters. T4.152 replaced `window.confirm` checkout with a 3-button success overlay and introduced `printViaIframe`, `downloadHtmlAsFile`, `emailReceiptToOwner` in `receiptUtils.js`.

**Why:** BIR audit compliance, pop-up blocker avoidance, post-close audit trail.

**Known issues flagged in review:**

1. `printViaIframe` always returns `true` from the outer try-block — the inner print runs in a `setTimeout`. The `if (!printed)` guard in `handlePrintReceipt` (POSModal.jsx:993) is dead code. The internal catch already handles fallback to `window.open`.

2. Checkout error path in `handleCheckout` sets `emailFeedback` but `checkoutSuccess` is null on failure, so the error is never rendered. Need a separate `checkoutError` state or toast.

3. `checkoutSuccess` state shape is `{ receiptHTML, total }` — missing `receiptNumber`. Used in fallback filename `receipt-${checkoutSuccess?.receiptNumber}` which resolves to `receipt-undefined.html`.

4. `transactionCount` in `closeDay()` includes `_crossDayRefund` entries from the merged sales array. Should filter: `sales.filter(s => !s._crossDayRefund).length`.

5. `generateZReportHTML` called 3× in the Z-Report dialog (Print, Download, dangerouslySetInnerHTML). Should be memoized.

6. `postCloseRevenue` in Z-report uses live `sales` array filtered by `postClose` flag — can diverge from `closingData.postCloseTotal` which is updated via fire-and-forget `increment()`. Two sources of truth.

**How to apply:** When reviewing future EOD, billing, or receipt-related code, flag: (1) async operations hidden inside setTimeout returning synchronous success booleans, (2) error state set but never rendered, (3) multiple calls to expensive string-building functions that should be memoized, (4) live-snapshot fields used in frozen documents (prefer frozen doc fields for immutable reports).
