---
name: Session 2026-04-18 — Sales Module Deep Dive
description: Sales module audit (3 files, 608 LOC), 12 new tasks T2.137-T2.148, 4 decisions locked (EOD dual display, refund access, refund date Option C, batch expiry Option A)
type: project
originSessionId: 364ea246-536e-4b43-9b69-773b8596dab0
---
## Sales Module Deep Dive (2026-04-18)

Companion file: SALES_DEEPDIVE.md (490+ lines, code quotes, data flow diagrams)

### Key Findings
- 5 P1 bugs: EOD revenue semantics wrong, refund doesn't reverse appointment/balance, hardcoded "Admin" in refund logs, dead print button
- 6 P2 bugs: Bank Transfer filter missing, fake batch expiry on restock, refund date on wrong day, no pagination, no void concept
- 6 P3 bugs: dead code, design token violations (60+ hardcoded colors), hardcoded clinic name

### Decisions Locked
1. **T2.137 EOD display**: Dual — primary "COLLECTED TODAY" (total minus deposits) + secondary "total billed" annotation
2. **T2.139 Refund access**: Any Sales-page user, no additional client-side gate. T2.1 Firestore RBAC handles server-side (Spark-compatible, NOT Blaze-dependent)
3. **T2.140 Refund date**: Option C — show on both days (original sale day AND refund day). EOD refund total uses refund date. Single-shot 1.5hr implementation.
4. **T2.147 Batch expiry**: Option A — store original batch info (batchNumber, expiryDate) at POS checkout time. Refund reads it back.

### New Tasks: T2.137-T2.148 (12 tasks)
- P1: T2.137 (EOD dual display), T2.138 (refund appointment reversal), T2.139 (refund staff attribution)
- P2: T2.140 (refund date both days), T2.141 (Bank Transfer filter), T2.142 (wire print report), T2.143 (pagination)
- P3: T2.144-T2.148 (alert→snackbar, dead code, design tokens, batch expiry, clinic name)

### Important Clarification
- Firestore security rules do NOT require Blaze plan. They are deployed and live on Spark. T2.1 (RBAC rules) is Spark-compatible.
- Only Cloud Functions (functions/index.js) require Blaze.

### Files Fully Scanned
- Sales.jsx (440 lines)
- useSalesData.js (89 lines)
- EodSummary.jsx (79 lines)
- POSModal.jsx (partial cross-reference)
