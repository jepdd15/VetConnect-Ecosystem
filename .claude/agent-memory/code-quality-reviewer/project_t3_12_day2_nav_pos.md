---
name: T3.12 Day 2 — Next-Pet Nav + POSModal Consolidated Billing
description: Review findings for ClinicalWorkspace Phase 3 (group nav bar, dirty-state dialog) and POSModal Phase 4 (group/individual billing toggle, merged cart, group checkout)
type: project
---

Group navigation bar, dirty-state switch dialog, POSModal billingMode toggle, merged cart, and group checkout transaction reviewed.

**Why:** T3.12 Day 2 adds sibling-pet navigation inside ClinicalWorkspace and consolidated group billing in POSModal.

**How to apply:** Key issues to track: (1) `handleSaveThenSwitch` does not await save success before switching — it always switches even if the draft save throws; (2) `balanceRemaining` written as full group total on every appointment doc, not per-pet proportion; (3) `buildCartForAppointment` fallback merges linked products into the group cart without dedup across pets — same product for two pets gets two entries which is correct for billing but collides on `deductInventoryInTransaction` where each product entry triggers its own stock read+decrement independently (correct behavior, not a bug); (4) billingMode `useEffect` has `[billingMode]` dep only — does NOT re-run if `patient` or `groupAppointments` change while modal is open and billingMode is already 'group' (low risk since modal always re-opens); (5) `handleSaveDraft` in POSModal saves individual cart only regardless of billingMode — correct by design since draft targets single appointment; (6) `isGroupVisit` check uses `groupAppointments.length > 1` which is correct.
