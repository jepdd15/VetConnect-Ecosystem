---
name: CW3 Phase 3+4+5 — T2.96, T2.80, T2.105 Review Findings
description: Sign-off decoupling, POSModal services[] contract fix, SC/PWD eligibility — key bugs and design deviations found
type: project
---

T2.96 (sign-off decoupling): window.confirm correctly blocks sign-off — it has `return` on cancel. Auto-stamp at sign-off correctly sets all services to `completed` unconditionally (line 1146-1149). serviceProgress is persisted to medical record (line 1023-1026). However, the `serviceProgress` state used in the sign-off check is a snapshot captured at the moment the user clicks — if `handleToggleServiceProgress` is in-flight (Firestore write pending) at the same time the user hits sign-off, the local optimistic state may already be updated, so this is safe.

T2.96 CRITICAL BUG: Empty `serviceProgress` edge case. If `patient.services` is empty or all services have no `id`, `incompleteServices` will be empty and the confirm guard is skipped — this is correct behavior (no services = nothing to warn about). Safe.

T2.96 WARNING: The `updatedServices` built at line 1121-1128 uses `serviceProgress[svc.id] || svc.serviceStatus || 'pending'` as an intermediate value, but then the `appointmentUpdate.services` on line 1146 maps over `updatedServices` and stamps all as `'completed'` unconditionally. This means the intermediate `serviceProgress[svc.id]` value in `updatedServices` is immediately overwritten — the double-map is redundant but harmless.

T2.80 (POSModal Scenario B rewrite): Correctly iterates `patient.services[]`. Fallback to scalar `serviceType`/`servicePrice` works via the `bookedServices` ternary at line 55-57. Auto-bundle logic is now per-service (not just for the primary). `isDiscountable` reads from `svcDef?.isScPwdEligible !== false`. 

T2.80 CRITICAL BUG: Price resolution uses `svcDef?.price` (flat price from catalog) for Scenario B, not `resolveTieredPrice()`. ClinicalWorkspace (Scenario A) uses `resolveTieredPrice()` correctly, but POSModal Scenario B bypasses tiered pricing. For a grooming appointment with weight-based pricing, the cart will show the flat base price regardless of pet weight. This was pre-existing for the scalar path but is now newly broken for the multi-service path where the service definition is found.

T2.80 WARNING: When `svc.id` is undefined (legacy appointments with no services[]), the fallback creates `{ id: 'svc_fee', name: patient.serviceType || 'Service', price: patient.servicePrice || 0 }`. The `svcDef` lookup will then be `servicesList.find(s => s.id === 'svc_fee')` which always returns undefined, so `isDiscountable` defaults to `true` (correct for backward compat). Safe.

T2.105 (isScPwdEligible): Switch in ServiceFormModal correctly bound — onChange updates `formData.isScPwdEligible` (line 415-416). useServices.js payload includes `isScPwdEligible: formData.isScPwdEligible !== false` (line 136). FIELD_LABELS includes 'isScPwdEligible' (line 19). ClinicalWorkspace cart push includes `isDiscountable: svcDef?.isScPwdEligible !== false` (line 500). POSModal Scenario B reads same flag (line 69). Chain is complete.

T2.105 STYLE: ServiceFormModal Switch uses `color="secondary"` and `size="small"`. Other operational rule switches in the same file use explicit sx color overrides (matching COLORS.accent). Minor inconsistency — secondary MUI color may not map to design token. Low severity.

T2.105 DESIGN TOKEN: Switch sx styles use MUI color prop ("secondary") rather than explicit COLORS token reference. Inconsistent with hasTieredPricing switch at line 303-306 and other switches in Section 3 (line 442-451) which use explicit sx overrides. Should use `COLORS.accent` override for consistency.

POSModal Scenario A (prescribedItems spread): Still correct — `...item` spread at line 50 carries `isDiscountable` through from ClinicalWorkspace cart. No change needed and none was made.

clinicalPulse: POSModal checkout does NOT append a clinicalPulse event on status→completed write (line 390-394). This pre-existing gap is noted in CW1 plan notes and is outside CW3 scope. Confirmed still absent.

Auto-bundle in ClinicalWorkspace init (line 504-546): Only bundles from `baseService` (the first/primary service), not from each booked service individually. POSModal Scenario B (line 73-91) correctly bundles per-service. This asymmetry is pre-existing and may cause a discrepancy between the ClinicalWorkspace Treatment Plan cart and the POSModal Scenario B cart for non-primary services.
