# VetConnect Master Task List

**Last updated:** 2026-04-27 · **Branch:** `main`
**Total tasks:** ~782 · **Cancelled/Absorbed:** ~17 · **Active:** ~765
**DONE:** ~622 · **TODO:** ~145 · **Deferred sub-tasks:** 50
**Phase 2:** COMPLETE · **Phase 3 Essential:** COMPLETE (except Blaze-gated T3.40-42) · **Phase 3 High-Value:** 8/8 batches done (T3.50 remains, T3.5 DONE) · **Phase 4 Dashboard S:** COMPLETE (T4.1-T4.4)
**Total effort estimate:** ~350-400 hours (Phase 1+2) + ~80-110 days (Phase 3) + ~158 hours (Phase 4 S-Tier)

**Companion files:**
- [handoff.json](handoff.json) — architectural context, decisions, bugs, terminology
- [ECOSYSTEM_ARCHITECTURE_REPORT.md](ECOSYSTEM_ARCHITECTURE_REPORT.md) — monorepo map, thesis coverage, divergences
- [CLINICAL_WORKSPACE_DEEPDIVE.md](CLINICAL_WORKSPACE_DEEPDIVE.md) — 13-question ClinicalWorkspace audit
- [MOBILE_BOOKING_DEEPDIVE.md](MOBILE_BOOKING_DEEPDIVE.md) — booking flow + useBookingEngine audit
- [PATIENTS_CRM_DEEPDIVE.md](PATIENTS_CRM_DEEPDIVE.md) — 11-agent Patients module audit (865 lines)
- [SALES_DEEPDIVE.md](SALES_DEEPDIVE.md) — Sales module audit (3 files, 12 tasks, 4 decisions)
- [INVENTORY_DEEPDIVE.md](INVENTORY_DEEPDIVE.md) — Inventory module audit (8 files, 38 bugs, 25+ tasks)
- [SETTINGS_DEEPDIVE.md](SETTINGS_DEEPDIVE.md) — Settings.jsx audit + no-show rebook + dispensing hardening
- [DASHBOARD_DEEPDIVE.md](DASHBOARD_DEEPDIVE.md) — Dashboard.jsx audit (7-line stub, S-tier analytics scoped)
- [MONITOR_DEEPDIVE.md](MONITOR_DEEPDIVE.md) — Monitor.jsx audit (125 lines, 13 bugs)
- [EXPENSES_DEEPDIVE.md](EXPENSES_DEEPDIVE.md) — Expenses.jsx audit (382 lines, 19 bugs)
- [LOGIN_DEEPDIVE.md](LOGIN_DEEPDIVE.md) — Login.jsx audit (169 lines, 2 CRITICAL security bugs)
- [MOBILE_CLIENT_DEEPDIVE.md](MOBILE_CLIENT_DEEPDIVE.md) — 10 mobile client screens (5,496 LOC, 91 tasks)
- [SERVICES_DEEPDIVE.md](SERVICES_DEEPDIVE.md) — Services module audit (6 files, 17 tasks)
- [STAFF_DEEPDIVE.md](STAFF_DEEPDIVE.md) — Staff module audit (5 files, 2 CRITICAL bugs)

**Status legend:** `TODO` · `IN PROGRESS` · `DONE` · `CANCELLED` · `ABSORBED`

---

## Phase 1 — Thesis & Documentation

> 10 tasks · ~15-25 hours · Critical path: ~13 hours (P0 items)

### P0 — Defense Blocking

| ID | Name | Effort | Status | Notes |
|---|---|---|---|---|
| T1.1 | Rewrite thesis Batch 3 scope/limits | 3-4 hrs | TODO | Batch 3 says "web-based only" — contradicts the actual dual-surface architecture |
| T1.2 | Rewrite thesis Batch 9 stack/backend | 4-6 hrs | TODO | Claims Cloud Functions are deployed; they are not (Spark plan) |
| T1.4 | Defense reconciliation addendum | 4-6 hrs | TODO | 1-page addendum covering all 7 divergences (D1-D7) as conscious scope decisions |
| T1.5 | Chapter IV temporal data model paragraph (visit/case/medical record) | 1-2 hrs | TODO | Uses locked terminology from handoff |
| T1.6 | Chapter IV clinical audit system paragraphs (strengths + limitations) | 1-2 hrs | TODO | Cover pulse engine, dual-clock, seal lifecycle, client-side timestamp limitation |
| T1.9 | Chapter IV EndOfDayModal UI integrity paragraph | 30 min | TODO | 3-silo model, mandatory audit reasons, pre-flight census |

### P1 — High Priority

| ID | Name | Effort | Status | Notes |
|---|---|---|---|---|
| T1.3 | Regenerate FDD features list Batch 2 | 2-3 hrs | TODO | Add 11 architectural investments from ecosystem report Section 9 |
| T1.7 | Chapter I glossary entries + admin UI helper text | 1 hr | TODO | visit/case/medical_record/appointment definitions |
| T1.8 | Audit thesis prose for overloaded 'record' | 30 min | TODO | Replace ambiguous 'record' with visit/case/medical_record per context |
| T1.10 | Chapter IV per-visit forensic record design paragraph | 30 min | TODO | |

---

## Phase 2 — Code Tasks

> 189 active tasks · ~185-215 hours

### P0 — Defense Blocking

| ID | Name | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|
| T2.28-expanded | Wire nextVisit UI + fix 5 follow-up creation bugs | 2-3 hrs | T2.32 | DONE | B5 follow-up shipped but NON-FUNCTIONAL |
| T2.37 | Firestore rule: clinicalPulse append-only enforcement | 1-2 hrs | — | DONE | Append-only size check + `is list` type guard. **Review fix:** exists() null-safety on getUserRole |
| T2.37a | Firestore rule: no-show status transition requires isStaff() — mobile pet owners should not be able to set status to no-show | 15 min | T2.1 | DONE | Review finding — appointments update allows any auth user to set no-show |
| T2.42 | Revert terminal drift fix: clear forensicSeal + TERMINAL_REVERSAL event | 30 min | — | DONE | |
| T2.44 | Write forensicSeal on normal sign-off + completed path | 30 min | — | DONE | Happy path has no seal |
| T2.44a | ForensicMetricGrid: decouple age metrics (Record Age + Op Hours Age) from shift/queue/consult metrics for active records. Add `liveAge` prop — when true, override age metrics with `new Date()` instead of day-capped `auditEnd`. Apply to all 3 consumers: Queue.jsx (latest day only), EndOfDayModal.jsx (latest active day), Records.jsx (unsealed+non-terminal). Also fix Records.jsx missing props: add `settings`, `sealedMetrics`, `liveAge` for consistency with Queue.jsx. Export `getOperationalMinutes` from pulseUtils.js. ~10 lines across 3 files. | P2 | 30 min | T2.44 | DONE | Review finding — active records show stale age (2D instead of 9D) because `auditEnd` caps at pulse event day, not current time |
| T2.57 | Records.jsx bug fixes (4 bugs) | 45 min | — | DONE | Vets→users collection, departments→departments collection, jsScheduled→scheduledDate, window.location→useNavigate. **Review fixes:** error callbacks on both listeners |
| T2.57a | Records.jsx: undo Snackbar and toast Snackbar overlap — use different `anchorOrigin` values or suppress toast when undo is active | P3 | 5 min | T2.72 | DONE | Review finding — both render at same position simultaneously |
| T2.58 | Records.jsx terminology cleanup | 30 min | — | DONE | All forensic/teleport/state-vector terms replaced with plain clinical language |
| T2.79 | Fix tiered pricing per-pet weight | 30 min | — | DONE | Per-pet resolveTieredPrice inside forEach loop. **Review fix:** step 4 shows "Est. Total" with weight-adjustment note |
| T2.119 | Normalize allergy field: read `petAllergies \|\| allergies` everywhere, write `petAllergies`, propagate to active appointments on edit | 45 min | — | DONE | **PATIENT SAFETY** — allergy warnings suppressed for mobile pets |
| T2.149 | `adjustStock`: wrap in `runTransaction` with stock floor check (`newStock >= 0`) and reserved check (`newStock >= reserved`) | 30 min | — | DONE | **Review fix:** spread-copy batches array before push to prevent transaction retry double-append |
| T2.150 | Normalize refund log schema: use `action: 'RESTOCK'`, `amountChange`, `userName`/`userId`. Add `RESTOCK` to GlobalActivityLog ACTION_CONFIG. Extract shared `normalizeLog` utility. | 45 min | — | DONE | Shared normalizeInventoryLog.js created |
| T2.208 | Remove hardcoded password. Generate random 12-char temp password, display to admin in toast. | 30 min | — | DONE | **Review fixes:** crypto.getRandomValues replaces Math.random; clipboard fallback for non-HTTPS; sets mustChangePassword flag (unblocks T2.278); token-compliant dialog |
| T2.209 | Add PH phone validation (`/^09\d{9}$/`) to StaffFormModal. Extract `isValidPHPhone` to shared util. | 5 min | — | DONE | Shared util at src/utils/phoneValidation.js |

### P1 — High Priority

| ID | Name | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|
| T2.1 | Firestore RBAC rules (isStaff + isAdmin helpers) | 2 hrs | — | DONE | 16 explicit collection rules, deny-all fallback. **Review fixes:** inventory_categories create→isStaff, users delete→isOwner\|\|isAdmin, exists() null-safety |
| T2.2 | Printable visit summary | 2-3 hrs | — | DONE | SOAP, vitals, Rx, vaccine, lab, discharge sections. Shared printUtils.js. **Review fix:** esc() XSS prevention on all dynamic values |
| T2.3 | Printable vaccination record | 1-2 hrs | — | DONE | Per-pet history + status summary. **Review fixes:** Timestamp-safe dueDate parsing, dedup comparison via toDate().getTime(). NOTE: reads vaccineData singular — needs update after T2.472 |
| T2.4 | Printable referral report | 1-2 hrs | — | DONE | ReferralModal (ephemeral, no Firestore write) + printReferralReport. **Review fix:** form state reset on reopen via useEffect([open]) |
| T2.4a | Extract calculatePetAge to printUtils.js shared helper (duplicated in printVisitSummary + printReferralReport + PatientDashboard) | P3 | 10 min | DONE | Canonical export in printUtils.js, 4 consumers updated |
| T2.4b | printReferralReport: add vitals.pain to guard condition (omitted from the 7-vital check) | P3 | 1 min | DONE | Review finding |
| T2.4c | PatientDashboard: remove stale `pet` from useEffect dependency array (pre-existing, causes re-fetch loop risk) | P3 | 1 min | DONE | Review finding — pre-existing tech debt |
| T2.4d | PatientDashboard banner buttons: borderRadius 1.5 → 0 (neubrutalism compliance, affects Add Record + Book Visit + Referral) | P3 | 5 min | DONE | Review finding — Design Sweep scope |
| T2.30 | Multi-staff clinical attribution | 2 hrs | — | DONE | |
| T2.30a | Staff attribution dropdown: add "— Unassigned —" placeholder MenuItem when vetsList is empty or no prior assignment | P3 | 5 min | T2.30 | DONE | Review finding — blank dropdown with no visible option to leave unassigned |
| T2.31 | Protect default inventory categories | 1-2 hrs | — | DONE | Firestore rule !catId.matches default_ + Settings.jsx client guard + hide delete icon |
| T2.32 | Extract SoapGrid component (blocks T2.28) | 2-3 hrs | — | DONE | |
| T2.32a | Move ZEN_PLACEHOLDERS to shared constants file — duplicated in SoapGrid.jsx + ClinicalWorkspace.jsx, divergence risk | P3 | 10 min | T2.32 | DONE | Extracted to soapConstants.js, both consumers import from it |
| T2.33 | dischargePolicy per service (required/optional) | 1.5 hrs | — | DONE | |
| T2.41 | Remove caseDay increment from reschedule path | 10 min | — | DONE | |
| T2.105 | SC/PWD discount eligibility per service (`isScPwdEligible` toggle) | 30 min | — | DONE | **Legal compliance (RA 9994)** |
| T2.112 | Sales ownerId: add to sales docs + update query | 30 min | — | DONE | Name collisions + name changes break billing |
| T2.120 | Species filter normalization ('Dog'→'canine') | 5 min | — | DONE | Dogs disappear when filtering |
| T2.121 | Date type guards across PetList + BillingLedger | 15 min | — | DONE | Crash on non-Timestamp dates |
| T2.137 | EOD dual display: primary "COLLECTED TODAY" + secondary "total billed" annotation. Expand eodTotals. Payment method tiles use collected amounts. | 45 min | — | DONE | **Review fix:** refunds annotation changed from "- ₱X" to "REFUNDS TODAY: ₱X" to avoid implying deduction |
| T2.138 | Refund: update appointment status to `billing` + reset `balanceRemaining` + write `TRANSACTION_REFUNDED` clinicalPulse event | 30 min | — | DONE | **Review fix:** balanceRemaining parseFloat guard for legacy data |
| T2.139 | Refund: pass current user to `useSalesData` hook via `useUser()`. Replace hardcoded `"Admin"` with actual staff identity. | 20 min | — | DONE | |
| T2.151 | `reserveStock`/`releaseStock`: wrap in `runTransaction`. reserveStock validates `reserved + qty <= stock`. releaseStock validates `reserved - qty >= 0`. | 30 min | — | DONE | **Review fix:** isNaN(qty) guard on both functions; releaseStock clamps to zero |
| T2.152 | `adjustStock`: batch-aware positive adjustments (optional batch fields). Flat negative. | 1.5 hrs | — | DONE | **Review fix:** submitting state + disabled button on StockAdjustModal |
| T2.153 | Pass `loading` from useInventory to InventoryTable. Add loading skeleton. | 10 min | — | DONE | |
| T2.154 | Add `isAdmin` guard on scrubDatabase button in Inventory.jsx | 5 min | — | DONE | |
| T2.155 | ProductFormModal: add category required validation. Add costPrice `< 0` validation. | 10 min | — | DONE | |
| T2.177 | Settings.jsx: add `useUser()` + `isAdmin` guard. Redirect non-admin. | 10 min | — | DONE | Route guard from T2.262 + in-component useUser for attribution |
| T2.178 | Closed dates: auto-persist on add/remove via `setDoc` immediately. Add navigation guard for unsaved fields. | 30 min | — | DONE | beforeunload handler + Save button unsaved indicator |
| T2.179 | Category delete: add usage shield — count inventory items before allowing delete. | 20 min | — | DONE | One-shot getDocs count, case-insensitive match |
| T2.191 | Service archive/delete: add active-appointment guard. Block if services referenced by non-terminal appointments. | 30 min | — | DONE | **Review fix:** limit(500) + Array.isArray guard on appointments query |
| T2.192 | Service delete: add `isAdmin` guard. Only show delete button for admin users. | 10 min | — | DONE | |
| T2.193 | ServiceFormModal: negative validation for price (`< 0`), duration (`<= 0`), bufferTime (`< 0`). Add `min` on inputs. | 10 min | — | DONE | **Review fix:** isNaN() checks added for non-numeric strings |
| T2.210 | Fix Firebase App memory leak: import `deleteApp`, call in `finally` after `signOut`. | 5 min | — | DONE | Leaks app instance per staff creation |
| T2.211 | Add active-appointment guard on staff revocation. Block if `assignedVetId` matches non-terminal appointments. | 20 min | — | DONE | Revoking vet mid-consult orphans patients |
| T2.212 | Fix ConfirmRevokeModal text: "Staff profile will be deactivated. Login access requires separate Auth management." | 5 min | — | DONE | UI claims Auth disabled — only Firestore flag set |
| T2.213 | Preserve existing `role` on edit — don't overwrite. Only set `role: formData.accessLevel` on create. 3-line fix. | 5 min | — | DONE | Editing vet overwrites role, removes from Queue |
| T2.214 | Fix workload query: add `on-hold`, `dispensing`, `billing` to status filter. | 5 min | — | DONE | Staff with dispensing patients show "Available" |
| T2.215 | Fix Queue.jsx vet filter: exclude `'disabled'` accessLevel. Use allowlist instead of truthy check. | 5 min | — | DONE | **Review fix:** simplified to accessLevel allowlist only, removed redundant role checks |
| T3.10a | View in Records quick link on queue row | 30 min | — | DONE | |

### P2 — Medium Priority

| ID | Name | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|
| T2.5 | useBookingEngine onSnapshot for clinic_settings | 30 min | — | DONE | **Review fix:** removed clinicSettings from initializeUser useEffect deps to prevent re-fire |
| T2.6 | Reminder banner timestamp crash fix | 5 min | — | DONE | Safe chain with isNaN guard |
| T2.8 | Path A clientReport split | 1 hr | — | DONE | |
| T2.9 | Cloud Functions fate decision | 15 min-4 hrs | — | DONE | Documented as aspirational with activation path + client-side mitigations |
| T2.12 | Rename Sign Digital Consent → Lock Clinical Record | 15 min | — | DONE | |
| T2.13 | Refactor CRM Sovereignty (delete sync, keep vitals cache) | 1 hr | — | DONE | Frees sidebar slot for T2.95 |
| T2.14 | Fix auto-bundling (all services + stock guard) | 30 min | — | DONE | |
| T2.15 | Expand KNOWLEDGE_BASE to 30+ rules | 3-4 hrs | — | DONE | |
| T2.16 | POSModal reserved decrement leak fix | 30-60 min | — | DONE | |
| T2.22 | Vaccine-aware inventory + auto-fill | 2-3 hrs | — | DONE | |
| T2.23 | useBookingEngine reads lastVitals.weight | 30 min | — | DONE | |
| T2.24-27 | Promote lab results | 2-3 hrs | — | DONE | Mobile PetHistoryScreen lab card + PatientDashboard aggregatedLabResults widget |
| T2.29 | Ditch primaryService field | 2 hrs | — | DONE | |
| T2.43 | Resolve carried-over → arrived ambiguity | 30 min | — | DONE | |
| T2.45 | Eliminate statusHistory duplication | 45 min | — | DONE | |
| T2.50 | Typed confirmation for Active-silo batch cancel | 30 min | — | DONE | |
| T2.51 | IDENTITY_EDIT pulse event | 15 min | — | DONE | |
| T2.52 | Atomic handleDispenseVerified | 20 min | — | DONE | |
| T2.59 | Records.jsx UX polish | 1.5 hrs | — | DONE | MUI void dialog, Snackbar errors, search clear button, DataGrid pagination 25/50/100 |
| T2.61 | Records.jsx case-grouping view toggle | 2 hrs | — | DONE | Visits/Cases toggle, originApptId chain grouping, case-continuation CSS class |
| T2.61a | Case View visual distinction: add case header row with pet name + service + case span, thicker separator between groups, indent continuation rows, collapse/expand per case | P2 | 45 min | — | TODO | Review finding — current Cases mode visually identical to Visits mode. Grouping logic works but needs stronger visual communication |
| T2.65 | Amend audit log for terminal records | 1 hr | — | DONE | AUDIT_ADDENDUM pulse event, inline addendum input on sealed records. **Review fix:** null user guard |
| T2.70 | Quick-range date filter buttons in Records | 30 min | — | DONE | Today/7d/30d/This Month chips + Clear chip |
| T2.71 | Saved filter presets for Records | 2.5 hrs | — | DONE | useSavedFilters hook, users/{uid}/recordFilterPresets subcollection. **Review fix:** Firestore rule added for subcollection |
| T2.75 | Clinical amendment path for locked records | 3 hrs | — | DONE | Most important P2 |
| T2.80 | POSModal services[] rewrite for multi-service billing | 1-2 hrs | — | DONE | |
| T2.80a | POSModal handleDropdownAdd: read `isScPwdEligible` from service definition instead of hardcoding `isDiscountable: true` | P3 | 5 min | T2.80 | DONE | Review finding — manually-added services always marked discountable regardless of service config |
| T2.87 | BookAppointment TOCTOU race fix (runTransaction) | 45 min | — | DONE | writeBatch → runTransaction with atomic retry |
| T2.93 | Delete `workflowType` legacy field | 5 min | — | DONE | |
| T2.94 | Delete phantom per-service code in ClinicalWorkspace | 15 min | — | DONE | |
| T2.95 | Per-service progress card in ClinicalWorkspace sidebar | 45 min | T2.94, T2.13 | DONE | Absorbs T2.103 |
| T2.96 | Decouple sign-off from status advancement | 1-2 hrs | T2.95 | DONE | |
| T2.100 | POSModal: clinicalPulse event on checkout | 10 min | — | DONE | |
| T2.100a | POSModal handleCheckout: appointment update writes `status: 'completed'` without statusHistory push — billing→completed transition missing from revert index | P3 | 10 min | T2.100 | DONE | Review finding — pre-existing gap, POSModal bypasses changeStatus entirely |
| T2.101 | Outstanding balance: remove counter, compute from sales. "Record Payment" in BillingLedger. | 2-3 hrs | — | DONE | Decision locked: computed only |
| T2.104 | Transaction void with inventory reversal | 3-4 hrs | — | DONE | |
| T2.108 | Document client-side timestamp limitation | 5 min | — | DONE | |
| T2.110 | Pulse events for per-service state changes | 10 min | T2.95 | DONE | |
| T2.113 | Outstanding balance: remove Firestore counter | 45 min | — | DONE | Decision locked: Option A. balanceRemaining-based sum replaces total-depositPaid |
| T2.115 | QuickBookModal → WalkInModal direct integration with prefill | 1.5-2 hrs | — | DONE | Decision locked: Option B. prefillClient/prefillPet props, QuickBookModal deleted. **Review fix:** separate useEffect for pet auto-select |
| T2.116 | Archive pet: confirmation dialog + archivedBy + restore | 30 min | — | DONE | Confirmation Dialog, archivedBy field, restorePet function, collapsible archived section. **Review fix:** borderRadius:0 on dialog buttons |
| T2.122 | Weight type fix: parseFloat, write both weight + lastWeight | 10 min | — | DONE | |
| T2.123 | Admin pet modal field parity (updatedAt, isAgeExact, max DOB, petAllergies) | 20 min | — | DONE | |
| T2.124 | NewClientModal: add `accountStatus: 'admin_registered'` flag | 10 min | — | DONE | Decision locked: Option A |
| T2.125 | Staff notes: delete confirmation + arrayUnion for atomic adds | 30 min | — | DONE | |
| T2.126 | PatientDashboard: fix double-fetch (remove pet from useEffect deps) | 15 min | — | DONE | 50 wasted reads |
| T2.132 | Duplicate client phone check with override dialog | 20 min | — | DONE | Decision locked: Option A |
| T2.140 | Refund date: Option C — show on both days. Dual query + dedup + cross-day badge. EOD refund total uses refund date. | 1.5 hrs | — | DONE | **Review fix:** filterStatus case mismatch fixed; needs composite index sales(status ASC, refundedAt ASC) |
| T2.141 | Add "Bank Transfer" to payment method filter dropdown. Fix Card tile click to include Bank Transfer. | 10 min | — | DONE | |
| T2.142 | Wire Print Report button: generate EOD summary HTML | 1 hr | — | DONE | **Review fix:** printWindow.close() added; disabled during loading |
| T2.143 | Add DataGrid pagination: remove `hideFooter={true}` | 5 min | — | DONE | pageSizeOptions 25/50/100 |
| T2.156 | StockAdjustModal: validate against `stock - reserved`. Show "Available: X (Y reserved)". | 15 min | — | DONE | |
| T2.157 | StockAdjustModal + ConfirmDeleteModal: `await` async callback before `onClose()` | 10 min | — | DONE | **Review fix:** parent handleConfirmDelete uses finally for close; modal no longer calls onClose |
| T2.158 | StockAdjustModal: reset form state on reopen | 5 min | — | DONE | useEffect on [open, item?.id] |
| T2.159 | `archiveItem`: release reserved stock before archiving | 10 min | — | DONE | |
| T2.160 | `deleteItem`: log before delete (or transaction) | 10 min | — | DONE | |
| T2.161 | ConfirmDeleteModal: pre-archive impact check (appointments, reserved stock) | 30 min | — | DONE | |
| T2.162 | ProductFormModal quick-add category: dedup + isMedicine default + route through hook | 20 min | — | DONE | |
| T2.163 | InventoryLogModal: add limit, error UI, re-fetch on reopen | 15 min | — | DONE | limit(500), error state, open dependency |
| T2.164 | Inventory.jsx: hide filter controls on Activity Log tab | 10 min | — | DONE | |
| T2.165 | InventoryTable: batch detail visibility (expandable/tooltip) | 1.5 hrs | — | DONE | **Review fix:** expiryDate Timestamp/string normalizer in tooltip |
| T2.166 | KPI expiry: check `batches[].expiryDate` in addition to top-level | 15 min | — | DONE | **Review fix:** toDateStr normalizer handles Firestore Timestamps |
| T2.167 | Write `isMedicine` to inventory items on create/update (derived + optional override toggle). Label: "Requires pharmacy dispensing verification". | 20 min | — | DONE | |
| T2.170 | GlobalActivityLog: full filtering — action type, date range, product search, user filter, paginated queries. | 3 hrs | T2.150 | DONE | **Review fix:** composite index requirement documented; needs inventory_logs(action ASC, timestamp DESC) |
| T2.175 | Allergen safety system: `allergyTags[]` on ALL products + cart-add check in ClinicalWorkspace + Option C dispensing routing + DispensingVerificationDialog cross-check | 1.5 hrs | T2.119 | DONE | Decision locked: Option C + Approach 2 |
| T2.176 | Client-facing dispensing label: per-medication printable label | 1.5 hrs | — | DONE | Benefits from T2.147 for lot/expiry |
| T2.180 | Department + category CRUD audit trail: write to `settings_logs` collection | 30 min | — | DONE | logSettingsEvent helper, wired to dept/cat CRUD |
| T2.181 | Settings save field-level diff: write changed fields to `settings_logs` | 30 min | — | DONE | **Review fix:** sanitized baseline prevents spurious diffs on first save |
| T2.182 | Wire `autoNoShowMins`: No-Show button disabled until threshold. Tooltip: "No-Show window opens at [time] per clinic policy" (Option B). | 30 min | — | DONE | **Review fix:** `??` instead of `\|\|` so explicit 0 is respected |
| T2.183 | Wire `maxFutureBookingDays`: date picker constraint in BookAppointment | 15 min | — | DONE | maximumDate on DateTimePicker |
| T2.184 | Settings bounds validation: minSlotInterval > 0, maxPetsPerBooking 1-10, trafficModerate < trafficHigh, etc. | 20 min | — | DONE | **Review fix:** workingDays deselect guard in onChange |
| T2.188 | Services non-checkable in dispensing checklist: auto-verified, shown for context. Button: "VERIFY ALL X PRODUCTS". | 20 min | — | DONE | User's design |
| T2.189 | Dosage/concentration display in dispensing checklist: propagate `dosage` from inventory item to cart item | 15 min | — | DONE | Pharmacy safety |
| T2.190 | No-show rebook detection: auto-detect on pet selection, `rebookedFromId` + `noShowCount`, banners in BookAppointment (client) + WalkInModal (staff) + ClinicalWorkspace (vet chip). Option A matching, 30-day window, most-recent + count. | 2 hrs | — | DONE | **Review fixes:** conditional spread (no pollution when count=0), Manila timezone cutoff, clinicPhone Alert instead of fake fallback |
| T2.194 | Audit diff: track individual pricing tier changes (minWeight, maxWeight, price per tier). | 30 min | — | DONE | Per-tier add/remove/change with exact values |
| T2.195 | Tier validation: overlap, gap, inversion checks before save. | 30 min | — | DONE | **Review fix:** overlap uses strict < (touching boundaries allowed) |
| T2.196 | Add `createdAt`/`updatedAt` with `serverTimestamp()` to service documents. | 5 min | — | DONE | |
| T2.197 | Pass `loading` from useServices to ServiceTable. Add loading skeleton. | 10 min | — | DONE | |
| T2.198 | ServiceTable: add `linkedProducts` badge/chip per row. | 15 min | — | DONE | |
| T2.199 | ServiceLogModal: display `log.reason` alongside `log.changes`. | 5 min | — | DONE | |
| T2.216 | Staff departments: hard block if `departments.length === 0`. | 5 min | — | DONE | Decision locked: hard block |
| T2.217 | Staff timestamps: replace `new Date()` with `serverTimestamp()` for `createdAt`, `updatedAt`, `disabledAt`. | 5 min | — | DONE | Client-side timestamps inconsistent |
| T2.218 | Staff listener: server-side `where("role", "in", [...])` filter. | 15 min | — | DONE | Decision locked: P2 for correctness |
| T2.219 | Staff emergency contact mutation: deep-copy objects before modifying. | 5 min | — | DONE | React state mutation anti-pattern |
| T2.220 | Staff activeAppointments: add `.id` to mapping. | 2 min | — | DONE | Inconsistent with staffList |

### P3 — Polish & Deferred

| ID | Name | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|
| T2.7 | Move hardcoded clinic phone to settings | 30 min | — | DONE | clinicPhone in useClinicSettings defaults; SuperCard, ChatbotScreen, ClientAppointments updated |
| T2.10 | Delete orphaned Firestore collections | 5 min | — | TODO | Manual Console operation — do during deployment prep. Deny-all fallback already blocks access. |
| T2.11 | Wire mobile to secureBookAppointment (Blaze) | 1-2 hrs | T2.9 | TODO | |
| T2.17 | Rename Treatment Plan sidebar → Services & Items | 5 min | — | DONE | |
| T2.18 | ClinicalWorkspace dead code cleanup (~300 lines) | 1-2 days | — | DONE | |
| T2.19 | handleSaveDraft optimistic lock | 15 min | — | DONE | |
| T2.20 | Empty-cart sign-off confirm dialog | 15 min | — | DONE | |
| T2.34 | Normalize lineage field terminology | 2 hrs | — | DONE | |
| T2.35 | useCaseChain bidirectional walker | 2-3 hrs | — | DONE | |
| T2.38 | Unified pulse eventId format (10 call sites) | 35 min | — | DONE | |
| T2.39 | Code comments at Timestamp.now() pulse sites | 15 min | — | DONE | |
| T2.46 | EndOfDayModal polish (scenarioMap + confined default) | 15 min | — | DONE | |
| T2.46.1 | Rename rebook → reschedule/carryover | 45 min | — | DONE | |
| T2.49 | Unify ancestor chain walkers | 1.25 hrs | — | DONE | |
| T2.53 | rescheduleAppointment runTransaction conversion | 15 min | — | DONE | |
| T2.53a | rejectAppointment cancel pulse: add missing `fromStatus` field for audit trail completeness | P3 | 2 min | — | DONE | Review finding — pre-existing gap, all other STATUS_CHANGE events include fromStatus |
| T2.54 | IDENTITY_HEALING pulse event | 10 min | — | DONE | |
| T2.56 | CONFINE date picker color cues | 1 hr | — | DONE | |
| T2.62 | Case lineage indicator column | 30 min | — | DONE | Day N chip for multi-day cases |
| T2.63 | Follow-up linkage in audit popover | 1 hr | — | DONE | Previous/Next Visit buttons for originApptId/followUpId links. **PARTIAL:** buttons are stubs — close popover + toast instead of navigating to linked visit |
| T2.63a | Linked Visits navigation: clicking Previous/Next Visit should load the linked row's audit data in the popover, not show a toast with raw ID | P2 | 30 min | — | TODO | Review finding — stub implementation, find linked row in groupedRecords and setActiveAuditRow |
| T2.66 | Defer triage action in Records | 20 min | — | DONE | isDeferred flag + DEFERRED pulse event. **Review fix:** null user guard |
| T2.67 | Edit identity fields in Records | 45 min | — | DONE | Inline petName/ownerName/ownerPhone edit + IDENTITY_EDIT pulse. **Review fixes:** empty string validation, null user guard, trim on save |
| T2.68 | Copy ID + print record actions | 30 min | — | DONE | Copy to clipboard with toast, formatted print via shared printUtils. **Review fixes:** full XSS escaping, null fallbacks, en-PH locale |
| T2.69 | Phone normalization | 1.5 hrs | — | DONE | normalizePhone in phoneValidation.js, wired in useGlobalRecords phone search. **Partial — search-side only, write-side normalization deferred** (booking/walk-in already write 09xx; legacy +63 data not covered) |
| T2.69a | Write-side phone normalization: call normalizePhone(ownerPhone) before writing to Firestore in WalkInModal.jsx and useBookingEngine.js, so all new appointments store canonical 09xx format | P3 | 15 min | T2.69 | DONE | WalkInModal guest path only — mobile BookAppointment doesn't write ownerPhone |
| T2.72 | Structured reschedule pulse + undo | 45 min | — | DONE | 10s undo Snackbar, RESCHEDULE_UNDO pulse. **Review fix:** Timestamp.fromDate for undo write |
| T2.73 | Bulk reschedule in Records | 2 hrs | — | DONE | Checkbox selection (pending/confirmed only), floating bar, bulk dialog. **Review fix:** per-item failure tracking, DataGrid v8 selection model compat |
| T2.73a | Records: only show checkboxSelection on TRIAGE tab — disabled checkboxes on other tabs confuse users into thinking the feature is broken | P2 | 15 min | — | DONE | checkboxSelection={activeTab === 1} |
| T2.74 | Bulk staff reassignment in Records | 1.5 hrs | — | DONE | writeBatch atomic update, STAFF_REASSIGN pulse, vet dropdown from users collection |
| T2.76 | Client self-check-in via clinic QR | 5-6 hrs | — | DONE | Settings QR card + print poster, SelfCheckInScreen (expo-camera + expo-location), GPS geofence with graceful fallback, batchArrive transaction, visitGroupId shared queue numbers, SELF badge in admin queue. **Review fixes:** arrivedResults retry safety, getLocalDateStr timezone, double-tap guard, print QR SVG ref |
| T2.77 | 4-tier ticket prefix scheme (A/W/E/R) | 30 min | — | DONE | R prefix for caseDay > 1; apptLabel shows RETURN |
| T2.78 | visitGroupId at multi-pet booking time | 30 min | — | DONE | VG-{uid5}-{timestamp}, groupSize, groupIndex per appointment |
| T2.81 | Fix advanceNoticeBuffer phantom field | 5 min | — | DONE | Uses advanceNoticeMins/60 |
| T2.82 | Mixed-species filter warning banner | 15 min | — | DONE | Amber banner when Canine+Feline selected |
| T2.83 | Debounce slot generation | 30 min | — | DONE | Split into effect 3a (fetch) + 3b (compute, 300ms debounce). **Review fix:** closedDatesKey serialized for stable deps |
| T2.84 | Write serviceBuffer to appointment root | 10 min | — | DONE | bundleTotalBuffer accumulated and written |
| T2.85 | Zero-capacity department explanation | 20 min | — | DONE | "No staff assigned to [dept]" message |
| T2.86 | findFirstBookableDate capacity check | 1 hr | — | DONE | checkCapacity callback wired in ClientAppointments — queries appointment count vs maxSlotsPerDay |
| T2.88 | Profile up-to-date nudge | 20 min | — | DONE | 6-month freshness check with Update Now / Later Alert |
| T2.89 | Past-date submit guard | 10 min | — | DONE | Aborts with "Time Passed" alert, resets to step 3 |
| T2.97 | ServiceProgressCard shared component | 1 hr | T2.95 | DONE | |
| ~~T2.98~~ | ~~POSModal receipt: clinic name from settings~~ | — | — | ABSORBED | Absorbed into T2.148 (superset scope: Sales.jsx + POSModal) |
| T2.99 | POSModal receipt: cashier name fix | 5 min | — | DONE | |
| T2.102 | Deposit collection modal for carry-over | 2-3 hrs | — | DONE | |
| T2.102a | Deposit modal: validate negative amounts with error hint instead of silent discard | P3 | 5 min | T2.102 | DONE | Review finding — `<input min="0">` is advisory only, negative values silently ignored |
| T2.102b | POSModal: clamp `balanceDue` to `Math.max(0, total - deposit)` to prevent negative balance display | P3 | 5 min | T2.102 | DONE | Review finding — deposit exceeding visit cost shows negative balance |
| T2.102c | Deposit modal: borderRadius 1.2/4px → 0 for neubrutalism compliance | P3 | 2 min | T2.102 | DONE | Review finding — Design Sweep scope |
| T2.107 | Per-service time tracking (Option A: explicit start/complete) | 25 min | T2.95 | DONE | |
| T2.109 | Centralized pulse event factory | 45 min | T2.38 | DONE | |
| T2.109a | Adopt createPulseEvent factory: refactor 3+ inline pulse-event objects in useQueueActions.js to use the factory | P3 | 30 min | T2.109 | DONE | 6 sites converted, quickAdmitER INCEPTION left inline. **Review fix:** fromStatus added to rescheduleAppointment |
| T2.111 | Extract shared ClinicalTimeline component | 1.5 hrs | — | DONE | Non-essential refactor |
| T2.114 | Owner name: fullName fix in PatientDashboard | 2 min | — | DONE | |
| T2.117 | Deduplicate calculateAge into shared util | 10 min | — | DONE | |
| T2.118 | PatientDashboard dead buttons (3) | 15 min | — | DONE | "Add Record" removed, both "Book Visit" wired to WalkInModal |
| T2.127 | PatientDirectory: empty state + null guard + React.memo | 15 min | — | DONE | |
| T2.128 | Stale-data flash on client switch | 15 min | — | DONE | |
| T2.129 | Replace 3 alert() calls with MUI Snackbar (Patients) | 15 min | — | DONE | 4 alert() → Snackbar across Patients.jsx + PatientDashboard.jsx |
| T2.130 | Expand search to include prescriptions, assessment, plan | 10 min | — | DONE | |
| T2.131 | Remove dead code (4 items in Patients module) | 5 min | — | DONE | |
| T2.133 | Contact freshness prompt at check-in (>90 days) | 30 min | — | DONE | Yellow banner in ClientHeader, updatedAt written on profile save, createdAt fallback |
| T2.134 | Client-level engagement KPIs in ClientHeader | 45 min | — | DONE | totalVisits, lastVisitDate, avgDaysBetween, noShowRate. One-shot getDocs. Gates T4.29 |
| T2.135 | Deceased pet status + dateOfDeath + memorial indicator | 15 min | — | DONE | Mark Deceased menu + confirm dialog, In Memoriam section, dateOfDeath field. **Review fix:** try/catch/finally. Gates T4.34 |
| T2.136 | Referral detail: "Referred by" text field | 15 min | — | DONE | NewClientModal field, ClientDetails DataField, ClientHeader chip, usePatientManager payload |
| T2.144 | Replace 3 alert() calls with MUI Snackbar (Sales) | 15 min | — | DONE | |
| T2.145 | Delete dead code: clinicalFlatStyle, Divider/Grid imports (Sales) | 2 min | — | DONE | |
| T2.146 | Design token compliance: Sales.jsx + EodSummary.jsx (60+ hardcoded colors) | 30 min | — | DONE | Sales-scoped only; POSModal deferred to T2.148a |
| T2.147 | Refund restock: store batch info at sale time (Option A) + no-expiry guard | 30 min | — | DONE | **Review fix:** spread-copy batches before push |
| T2.148 | Receipt clinic name from settings (Sales.jsx + POSModal) | 15 min | — | DONE | clinicName + clinicAddress added to useClinicSettings defaults |
| T2.148a | POSModal MUI JSX: design token + borderRadius compliance (50+ hardcoded hex, borderRadius:2 violations) | 45 min | — | DONE | Absorbed into T2.449 Design Sweep |
| T2.147a | Flat-stock refund guard: skip batch creation for non-batch-tracked items to prevent phantom batch conversion | 15 min | T2.147 | DONE | isBatchTracked guard, flat-stock only gets stock increment |
| T2.140a | useSalesData: expose error state when dual-query partially fails, show dismissible Alert in Sales.jsx | 15 min | T2.140 | DONE | Review finding — silent partial data on query error |
| T2.168 | Delete dead code: glassStyle/GLASS, selectedCatObj, dead COLORS imports (Inventory) | 5 min | — | DONE | |
| T2.169 | Design token compliance: Inventory module (100+ hardcoded colors, 7 files) | 1.5 hrs | — | DONE | Absorbed into T2.445 Design Sweep |
| T2.171 | `restoreItem`: clear `archivedAt` on restore | 5 min | — | DONE | Uses deleteField() |
| T2.172 | InventoryTable: negative margins as red percentage | 10 min | — | DONE | Three-tier color: green/orange/red + null for N/A |
| T2.173 | Category seed idempotency: deterministic IDs | 15 min | — | DONE | default_medicine, default_vaccine, etc. |
| T2.174 | Batch-aware negative stock adjustments: batch picker for removals | 2 hrs | T2.152 | DONE | Deferred — positive ships first |
| T2.174a | GlobalActivityLog: show "Load More" when client-side filter empties page but hasMore is true | 15 min | T2.170 | DONE | Removed filteredLogs.length > 0 gate, updated empty-state hint |
| T2.174b | Quick-add category: auto-detect isMedicine from medical keywords (antibiotic, vaccine, etc.) | 15 min | T2.162 | DONE | MEDICINE_KEYWORDS constant, autoMedicine flag in addDoc |
| T2.174c | `normalizeInventoryLog` sign ambiguity: old sale logs with positive `quantity` show up-arrow for "Sold" | 15 min | T2.150 | DONE | SOLD + positive amountChange flipped to negative |
| T2.174d | `adjustStock` hook: trim `batchInfo.batchNumber` at hook level for self-protecting contract | 5 min | T2.152 | DONE | Review finding — modal trims, but direct callers don't |
| T2.185 | Settings: replace services + users listeners with one-shot getDocs | 15 min | — | DONE | refreshUsageCounts helper for post-mutation refresh |
| T2.186 | Settings: replace 2 window.confirm() with MUI Dialog | 10 min | — | DONE | **Review fix:** Dialog Cancel borderRadius: 0 |
| T2.187 | Settings: delete dead variable `dashboardCream` | 1 min | — | DONE | |
| T2.200 | Services: delete dead code (clinicalFlatStyle prop, useNavigate, CircleIcon). Keep isAdmin import for T2.192. | 5 min | — | DONE | |
| T2.201 | Services: `restoreService` clear `archivedAt` on restore | 5 min | — | DONE | Uses deleteField() |
| T2.202 | Services: extract shared ACTION_CONFIG to `src/utils/serviceLogConfig.js` | 10 min | — | DONE | |
| T2.203 | ServiceActivityLog: add filtering (action type, date range, service name) + pagination | 2 hrs | — | DONE | Cursor pagination + filters; needs composite index service_logs(action ASC, timestamp DESC) |
| T2.204 | ServiceLogModal: add `limit(500)` to query | 2 min | — | DONE | |
| T2.205 | Services: design token compliance across 4 child components (60+ hardcoded colors) | 1 hr | — | DONE | Child components done; parent deferred to T2.205a |
| T2.206 | ServiceTable: add pagination | 15 min | — | DONE | **Review fix:** pagination reset depends on data reference, not data.length |
| T2.207 | CLAUDE.md: fix `tieredPricing` → `pricingTiers` + `hasTieredPricing` in field docs | 2 min | — | DONE | |
| T2.205a | Services.jsx parent page: design token sweep (12+ hardcoded hex in header toolbar) | 20 min | T2.205 | DONE | Absorbed into T2.444 Design Sweep |
| T2.205b | serviceLogConfig.js: replace raw hex with COLORS token imports | P3 | 10 min | T2.202 | DONE | Absorbed into T2.444 Design Sweep |
| T2.205c | Services child components: remaining #757575/#616161 fallback colors not tokenized | P3 | 10 min | T2.205 | DONE | Absorbed into T2.444 Design Sweep (kept as-is per plan) |
| T2.203a | ServiceActivityLog: friendly error message for failed-precondition (missing Firestore index) | P3 | 5 min | T2.203 | DONE | Review finding — raw Firestore error URL shown to user |
| T2.5a | useBookingEngine: checkClinicLoad captures stale clinicSettings closure (pre-existing, worsened by T2.5 real-time listener) | P3 | 15 min | T2.5 | DONE | Review finding — add clinicSettings.trafficModerate/High to effect deps or parameterize |
| T2.221 | Staff: delete dead code (KPICard + kpis + 4 icons, WorkIcon, headerSx, deleteDoc, showToast prop) | 5 min | — | DONE | |
| T2.222 | Staff: pass `loading` to StaffTable, add skeleton | 10 min | — | DONE | |
| T2.223 | Staff: add loading/disabled state on REVOKE button | 5 min | — | DONE | **Review fix:** setRevoking in finally block to prevent stuck button on error |
| T2.224 | Staff: fix cleanName crash `cleanName[0]?.toUpperCase() \|\| '?'` | 2 min | — | DONE | |
| T2.225 | Staff: add null guard on `departments` prop in StaffTable | 2 min | — | DONE | |
| T2.226 | Staff: design token compliance across 3 child components (50+ hardcoded colors) | 45 min | — | DONE | **Review fix:** also tokenized Staff.jsx header + temp password dialog; added dangerHover, dangerSurface, warningSurface tokens to designTokens.js |
| T2.227 | Staff: fix borderRadius violations (search field, warning box, scrollbar) | 5 min | — | DONE | |
| T2.227a | StaffFormModal: initialize emergencyContacts to `[]` for new staff instead of one empty `{name:'',kinship:'',phone:''}` | P3 | 5 min | — | DONE | Review finding — empty contacts written to Firestore, diffEngine reports phantom "1 record(s)" |

---

## Phase 3 — Future & Long-Form

> 42 tasks · Multi-day efforts

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T3.1 | EMRDrawer slide-over | P2 | 1 day | — | DONE | EMRDrawer.jsx created; wired into ClinicalWorkspace identity strip |
| T3.2 | Multi-vaccine per visit + manual form toggle | P2 | 1 day | — | DONE | Manual toggle + showVaccineForm gate + info banner |
| T3.3 | Printable vaccination passport | P2 | 0.5 day | — | DONE | ABSORBED → T3.52 (admin passport + mobile PDF fully shipped) |
| T3.4 | Grooming-specific consult form | P3 | 1-2 days | — | TODO | |
| T3.5 | Real RA 10173 informed consent system | P2 | 8-12 days | — | DONE | 8-phase build: consent versioning, drawn/typed signatures, consent gate, re-consent flow, admin viewing + ConsentRecordDialog, withdrawal + erasure integration, legacy migration, edge cases |
| T3.6 | Cloud Function LLM gateway | P3 | 2-3 days | Blaze | TODO | |
| T3.8 | Clinic-wide forensic reporting dashboard | P1 | 3-4 days | — | DONE | |
| T3.9 | Admin-only revert from terminal states | P2 | 1 hr | — | DONE | |
| T3.10b | Recently Resolved panel with undo | P2 | 2-3 hrs | — | DONE | |
| T3.10c | Show resolved today toggle | P3 | 1 hr | — | TODO | |
| T3.10d | Global patient search in Queue | P2 | 1-2 hrs | — | DONE | |
| T3.11 | RA 10173 right-to-erasure anonymization | P2 | 4 hrs | — | DONE | |
| T3.12 | Multi-Pet Visit Support (full UI) | P2 | 15-20 hrs | T2.78 | DONE | Phase 8 (Step 8.1) done: group chip in identity col, sibling panel in audit popover |
| T3.13 | Partial refund with line-item selection | P3 | 6-8 hrs | T2.104 | TODO | |
| T3.14 | Unit test suite for pulseUtils.js | P3 | 3-4 hrs | — | DONE | 50 tests, 0 fail; vitest + vite.config test block + eslint globals |
| T3.15 | Firebase Auth for admin-created clients | P3 | 2-3 hrs | Blaze | TODO | |
| T3.16 | Household/family modeling | P3 | 3-4 days | — | TODO | Late optional |
| T3.17 | Communication history tab + routing | P3 | 3-5 days | Blaze | TODO | Late optional |
| T3.18 | Referral Level 2 (ID links + count badge + incentives) | P3 | 2-3 hrs | T2.136 | TODO | |
| T3.19 | Client profile photo (RA 10173 compliant) | P3 | 2-3 hrs | — | TODO | Build only if advisors request |
| T3.20 | Client behavior profile analytics card | P3 | 2-3 hrs | — | TODO | No-show rate, late payments, visit regularity |
| T3.21 | Reorder point alerts: low-stock notification badge + printable reorder list | P3 | 2-3 hrs | — | DONE | In-app only (Spark) |
| T3.22 | Barcode/QR scanning for stock intake | P3 | 3-5 days | — | TODO | Hardware-dependent |
| T3.23 | Inventory valuation report: value by category, COGS, margin analysis | P3 | 1-2 days | — | TODO | Overlaps T3.8 |
| T3.24 | Expiry disposal workflow: "Dispose Expired" batch action | P3 | 1.5 hrs | — | DONE | Idempotent |
| T3.25 | Supplier directory: `suppliers` collection, dropdown in ProductFormModal | P3 | 3-4 hrs | — | TODO | Free-text works for small clinics |
| T3.26 | Structured adjustment types for shrinkage analytics | P3 | 1 hr | — | DONE | |
| T3.27 | Inventory export (CSV/PDF) | P3 | 1 hr | — | DONE | |
| T3.28 | Internal ward/hospitalization medication labels | P3 | 1 hr | — | TODO | Only for overnight clinics |
| T3.29 | Structured allergy entries with coded drug classes (Tier 2) | P3 | 6-8 hrs | — | TODO | Supersedes T2.175 keyword matching |
| T3.30 | Barcode scan before product administration | P3 | 3-5 hrs | T2.175, T3.22 | TODO | Hospital-grade safety |
| T3.31 | Configurable no-show link window: `noShowLinkWindowDays` in clinic_settings | P3 | 10 min | T2.190 | DONE | Currently hardcoded 30 days |
| T3.32 | Client-side appointment confirmation flow: `confirmedByClient` + Queue badge | P3 | 1.5 hrs | — | DONE | Spark-compatible |
| T3.33 | No-show rate display at booking/check-in | P3 | 30 min | — | TODO | Spark-compatible |
| T3.34 | Pre-appointment push reminder | P3 | 2-3 hrs | Blaze | TODO | Deploy sendAppointmentUpdateNotification |
| T3.35 | Waitlist and slot recovery automation | P3 | 3-5 hrs | Blaze | TODO | |
| T3.36 | Hold for vet review in dispensing: `dispensingHold` flag + pulse events | P3 | 1.5 hrs | T2.52 | DONE | |
| T3.37 | Stock verification at dispensing time: advisory warnings per item | P3 | 30 min | — | DONE | POSModal remains hard gate |
| T3.38 | Batch/lot selection at dispensing: batch picker per product | P3 | 1.5 hrs | T2.165 | DONE | Drug recall traceability |
| T3.39 | Partial dispensing support: qty input per item, backorder tracking | P3 | 1 hr | — | DONE | |
| T3.40 | Firebase Auth disable on staff revocation: Cloud Function with Admin SDK | P3 | 2 hrs | Blaze | TODO | Currently only Firestore flag set |
| T3.41 | Staff re-enable flow: UI to restore revoked staff + RESTORED audit event | P3 | 1 hr | — | TODO | No re-enable path despite modal text claiming it |
| T3.42 | Staff password management: Cloud Function for secure creation (Option C) + password reset flow | P3 | 3-4 hrs | Blaze | TODO | Production deployment path |

---

## Cancelled & Absorbed Tasks

| ID | Reason |
|---|---|
| T2.21 | Duplicate of T2.17 |
| T2.36 | Superseded by T2.63 |
| T2.55 | Redundant with T2.46 |
| T2.60 | Merged into T2.61 |
| T2.103 | ABSORBED into T2.95 |
| T2.106 | CANCELLED — no separate grooming UI |

---

## Recommended Ship Sequence

### Week 1 — Defense-Ready Core

**Day 1 AM (~8 hrs):** Structural unblocks + patient safety + inventory integrity
- T2.119 (allergy normalization) + T2.37 (pulse append-only) + T2.42 (seal drift) + T2.44 (seal on sign-off) + T2.57 (Records bugs) + T2.58 (Records terminology) + T2.41 (caseDay fix) + T2.149 (adjustStock transaction) + T2.150 (refund log schema)

**Day 1 PM (~4-6 hrs):** Defense writing
- T1.4 (defense addendum)

**Day 2 AM (~5 hrs):** Activate B5 follow-up
- T2.32 (SoapGrid extraction) + T2.28-expanded (nextVisit UI + follow-up bugs)

**Day 2 PM (~8 hrs):** Thesis rewrites
- T1.1 (Batch 3) + T1.2 (Batch 9)

**Day 3 (~6 hrs):** Printables
- T2.2 (visit summary) + T2.3 (vaccination record) + T2.4 (referral report)

**Day 4 (~7 hrs):** Security + thesis + billing integrity
- T1.5 + T1.6 + T1.9 + T1.10 + T2.1 (RBAC) + T2.112 (sales ownerId) + T2.120 (species filter) + T2.121 (date guards) + T2.137 (EOD dual display) + T2.138 (refund appointment reversal) + T2.139 (refund staff attribution)

### Week 2 — High-Value Features

**Day 5 (~5 hrs):** Audit story
- T2.33 (dischargePolicy) + T2.75 (clinical amendments) + T2.65 (amend audit log)

**Day 6 (~4 hrs):** Records demo story
- T2.61 (case-grouping) + T2.62 (lineage badge) + T2.63 (follow-up linkage)

**Day 7 (~6 hrs):** Service completion + billing
- T2.93 + T2.94 (cleanup) + T2.95 (service toggles) + T2.96 (sign-off decoupling) + T2.105 (SC/PWD) + T2.80 (POSModal services[])

**Day 8 (~5 hrs):** Inventory hardening + settings
- T2.151 (reserve/release guards) + T2.152 (batch-aware adjust) + T2.153 (loading) + T2.154 (scrub gate) + T2.155 (form validation) + T2.177 (settings role check) + T2.178 (closed dates persist) + T2.179 (category usage shield)

### Week 3 — Polish + New Features

**Day 9 (~5 hrs):**
- T2.13 (CRM Sovereignty) + T2.14 (auto-bundling) + T2.50 + T2.70 + T2.71 + T3.10a

**Day 10 (~5 hrs):**
- T2.104 (void) + T2.101 (balance + payments) + T2.100 (checkout pulse) + T2.113 (remove counter)

**Day 11 (~4 hrs):** Patients CRM fixes
- T2.115 (WalkInModal integration) + T2.116 (archive confirm) + T2.122 (weight type) + T2.123 (field parity) + T2.124 (admin_registered flag) + T2.125 (notes atomic) + T2.126 (double-fetch)

**Day 12 (~5 hrs):** Allergen safety + dispensing + no-show
- T2.175 (allergen system) + T2.176 (dispensing labels) + T2.188 (services non-checkable) + T2.189 (dosage display) + T2.182 (autoNoShowMins) + T2.190 (no-show rebook detection)

**Day 13 (~3 hrs):** Staff critical + high fixes
- T2.208 (hardcoded password) + T2.209 (phone validation) + T2.210 (App leak) + T2.211 (revoke guard) + T2.212 (modal text) + T2.213 (role preserve) + T2.214 (workload statuses) + T2.215 (Queue filter)

**Day 14 (~2 hrs):** Services + Staff P2 fixes
- T2.191 (service archive guard) + T2.192 (service delete gate) + T2.193 (negative validation) + T2.194 (tier diff) + T2.195 (tier validation) + T2.216 (dept required) + T2.217 (timestamps) + T2.218 (staff listener) + T2.219 (contact mutation) + T2.220 (appt .id)

**Day 15+:** Remaining P2/P3, Phase 3 as time permits

---

## Batch Groupings for Implementation Planning

| Batch Name | Tasks | Total Effort | Plan File |
|---|---|---|---|
| Records Renovation | T2.57, T2.58, T2.59, T2.61, T2.62, T2.63, T2.65, T2.70, T2.71 | ~12 hrs | RECORDS_RENOVATION_PLAN.md |
| Firestore Rules Hardening | T2.1, T2.37, T2.31 | ~5 hrs | FIRESTORE_HARDENING_PLAN.md |
| ClinicalWorkspace Sign-Off | T2.32, T2.28-expanded, T2.33, T2.44, T2.42 | ~8 hrs | CLINICAL_SIGNOFF_PLAN.md |
| Pulse Engine Cleanup | T2.38, T2.45, T2.18, T2.39, T2.109 | ~4 hrs | PULSE_CLEANUP_PLAN.md |
| Queue Audit Polish | T2.46, T2.50, T2.51, T2.52, T2.53, T2.54 | ~2 hrs | QUEUE_AUDIT_POLISH_PLAN.md |
| Printables | T2.2, T2.3, T2.4 | ~5 hrs | PRINTABLES_PLAN.md |
| Clinical Amendment | T2.75 | ~3 hrs | CLINICAL_AMENDMENT_PLAN.md |
| Service Completion & Billing | T2.93, T2.94, T2.95, T2.96, T2.97, T2.80, T2.105, T2.100, T2.107, T2.110 | ~7 hrs | SERVICE_COMPLETION_PLAN.md |
| Financial Operations | T2.101, T2.102, T2.104, T2.113, T2.137, T2.138, T2.139, T2.140, T2.141, T2.142, T2.143 | ~12 hrs | FINANCIAL_OPS_PLAN.md |
| Patients CRM Fixes | T2.119, T2.112, T2.115, T2.116, T2.120, T2.121, T2.122, T2.123, T2.124, T2.125, T2.126, T2.132 | ~7 hrs | PATIENTS_CRM_PLAN.md |
| Inventory Hardening | T2.149, T2.150, T2.151, T2.152, T2.153, T2.154, T2.155, T2.156, T2.157, T2.158, T2.159, T2.160, T2.161, T2.162, T2.163, T2.164, T2.165, T2.166, T2.167, T2.170 | ~12 hrs | INVENTORY_HARDENING_PLAN.md |
| Settings & Configuration | T2.177, T2.178, T2.179, T2.180, T2.181, T2.182, T2.183, T2.184 | ~3 hrs | SETTINGS_PLAN.md |
| Allergen Safety & Dispensing | T2.175, T2.176, T2.188, T2.189 | ~3.5 hrs | ALLERGEN_DISPENSING_PLAN.md |
| No-Show Lifecycle | T2.182, T2.190 | ~2.5 hrs | NOSHOW_LIFECYCLE_PLAN.md |
| Services Hardening | T2.191, T2.192, T2.193, T2.194, T2.195, T2.196, T2.197, T2.198, T2.199 | ~2.5 hrs | SERVICES_HARDENING_PLAN.md |
| Staff Security & Integrity | T2.208, T2.209, T2.210, T2.211, T2.212, T2.213, T2.214, T2.215, T2.216, T2.217, T2.218, T2.219, T2.220 | ~2 hrs | STAFF_SECURITY_PLAN.md |

---

## Session 2026-04-20 — Standalone Pages + Mobile Client + JSX Audits + Design + Vaccination

> ~230 new tasks · ~200+ hours additional effort
> Deep-dive files: DASHBOARD_DEEPDIVE.md, MONITOR_DEEPDIVE.md, EXPENSES_DEEPDIVE.md, LOGIN_DEEPDIVE.md, MOBILE_CLIENT_DEEPDIVE.md

### Admin Standalone Pages

#### Dashboard — S-Tier Analytics (T2.228-T2.341)

**Infrastructure:**

| ID | Name | Priority | Effort | Status | Notes |
|---|---|---|---|---|---|
| T2.228 | Install recharts + Dashboard base: 4-tab layout (Growth/Ops/Clinical/Financial), design tokens, useUser for tab gating | P0 | 1 hr | DONE | Growth tab first (thesis narrative). Prereq T2.342 DONE |
| T2.315 | Create `useDashboardData` hook with period-parameterized queries | P0 | 1.5 hrs | DONE | All tabs' data. Period: Today/Week/Month/Quarter/Year |
| T2.316 | Create shared `<KPICard>` component | P1 | 20 min | DONE | Reusable across all tabs |
| T2.317 | Create shared `<HorizontalBar>` component (CSS-only) | P1 | 20 min | DONE | No recharts dependency |
| T2.318 | Create shared `<PeriodSelector>` component | P1 | 15 min | DONE | Chip row. Ops tab always "Today" |
| T2.272 | Quick-nav tiles + role gating | P2 | 15 min | DONE | |
| T2.342 | Delete dead pages/Staff.jsx + move Dashboard to features/Dashboard/ | P1 | 10 min | DONE | Prerequisite for Dashboard build |
| T2.228a | Dashboard: activeTab index desync if isAdmin flips after mount. Mitigated by currentTab fallback | P3 | 10 min | TODO | Review finding — edge case, no fix needed unless role changes mid-session |
| T2.315a | useDashboardData: add duck-type guard when reading scheduledDate off individual docs (needed for Days 2-6) | P3 | 10 min | DONE | Review finding — already guarded via duck-type pattern in all 3 usage sites |
| T2.316a | KPICard: purple variant text uses hardcoded #6A1B9A (no token). Add COLORS.kpiPurpleText to designTokens.js | P3 | 5 min | DONE | Review finding — token added to designTokens.js |
| T2.229a | Dashboard: clinic open/closed uses integer hour comparison (same as Queue.jsx). Track for closeMinute support | P3 | 5 min | DONE | Review finding — no-op, integer hour comparison is correct as-is |

**Tab 1 — Growth (default: This Month):**

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.282 | New clients + total active | P1 | 15 min | DONE |
| T2.307 | Client registration trend (recharts bar) | P1 | 30 min | DONE |
| T2.308 | Total active pets + species distribution | P1 | 15 min | DONE |
| T2.309 | Top breeds | P2 | 15 min | DONE |
| T2.285 | Appointment volume trend (recharts bar) | P1 | 30 min | DONE |
| T2.280 | Walk-in vs scheduled ratio | P1 | 15 min | DONE |
| T2.310 | Peak hours analysis (recharts bar) | P2 | 25 min | DONE |
| T2.311 | Service popularity ranking | P1 | 15 min | DONE |
| T2.312 | Booking lead time average | P2 | 10 min | DONE |
| T2.313 | Client retention rate | P2 | 20 min | DONE |
| T2.314 | Clinic utilization rate | P2 | 20 min | DONE |

**Tab 2 — Operations (always Today):**

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.228b | Appointment status breakdown | P0 | 30 min | DONE |
| T2.229 | Queue status + clinic open/closed | P1 | 20 min | DONE |
| T2.281 | Avg wait time + longest current wait | P1 | 30 min | DONE |
| T2.271 | Average consult duration | P1 | 15 min | DONE |
| T2.286 | Department load distribution | P1 | 15 min | DONE |
| T2.287 | Staff workload (per vet) | P1 | 20 min | DONE |
| T2.279 | No-show + cancellation count | P1 | 10 min | DONE |
| T2.288 | Emergency count | P2 | 5 min | DONE |

**Tab 3 — Clinical (default: This Month):**

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.289 | Records signed this period | P1 | 20 min | DONE |
| T2.290 | Top 5 diagnoses | P1 | 30 min | DONE |
| T2.291 | Vaccine administration by type | P1 | 20 min | DONE |
| T2.292 | Top prescribed items | P1 | 25 min | DONE |
| T2.293 | Follow-up compliance rate | P2 | 20 min | DONE |
| T2.294 | Species distribution of visits | P2 | 10 min | DONE |
| T2.295 | Confinement + carry-over rate | P2 | 10 min | DONE |
| T2.296 | Records per vet | P2 | 15 min | DONE |
| T2.297 | Average vitals by species | P2 | 20 min | DONE |

**Tab 4 — Financial (admin-only, default: This Month):**

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.230 | Revenue (collected + billed) | P0 | 20 min | DONE |
| T2.283 | Net margin | P1 | 10 min | DONE |
| T2.298 | Payment method distribution | P1 | 15 min | DONE |
| T2.299 | SC/PWD discount total + usage rate | P1 | 10 min | DONE |
| T2.300 | Average transaction value | P1 | 5 min | DONE |
| T2.301 | Revenue trend (recharts) | P1 | 45 min | DONE |
| T2.302 | Expense category breakdown | P1 | 15 min | DONE |
| T2.303 | Revenue vs expense trend overlay (recharts) | P2 | 30 min | DONE |
| T2.304 | Refund rate + total refunded | P2 | 10 min | DONE |
| T2.305 | Outstanding balances total | P2 | 10 min | DONE |
| T2.306 | Revenue by service/department | P2 | 20 min | DONE |
| T2.270 | Monthly expense burn rate | P1 | 10 min | DONE |
| T2.313a | useDashboardData: retention rate denominator inflation — strip walk-in IDs from periodOwnerIds | P3 | 5 min | DONE | Review finding — fix applied inline |
| T2.303a | FinancialTab: sort overlayData after merging revenue + expense buckets (chronological sort) | P3 | 10 min | DONE | Review finding — insertion-order tracking + sort applied |
| T2.316b | Extract CHART_TOOLTIP_STYLE, CHART_TICK_STYLE, CHART_GRID_STYLE to shared chartConfig.js | P3 | 10 min | DONE | Review finding — extracted to chartConfig.js, all tabs import from it |
| T2.316c | GrowthTab + FinancialTab: replace local panelSx with imported PANEL_SX from chartConfig.js | P3 | 5 min | DONE | Review finding — ClinicalTab already uses shared export, cosmetic duplication |
| T2.320a | useDashboardData: rolling-window delta bias — normalize by days elapsed for in-progress periods | P3 | 30 min | TODO | Review finding — week/quarter/year deltas compare incomplete current vs complete previous period |

**S-Tier Features:**

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.319 | Create `generateInsight()` rule engine | P1 | 1.5 hrs | DONE |
| T2.320 | Extend useDashboardData for period-over-period deltas | P1 | 1 hr | DONE |
| T2.321 | Extend KPICard with delta display + insight slot | P1 | 20 min | DONE |
| T2.322 | Insight rules: Operations tab (10 rules) | P1 | 1 hr | DONE |
| T2.323 | Insight rules: Clinical tab (8 rules) | P2 | 45 min | DONE |
| T2.324 | Insight rules: Financial tab (7 rules) | P2 | 45 min | DONE |
| T2.325 | Insight rules: Growth tab (5 rules) | P2 | 30 min | DONE |
| T2.319a | generateInsight: cross-tab target collision on "TOTAL APPOINTMENTS" — namespace or separate maps | P3 | 15 min | DONE | Growth target → "TOTAL APPOINTMENTS (GROWTH)", GrowthTab + drillDownConfig updated |
| T2.319b | generateInsight Rule 8: Math.max on empty deptLoad returns -Infinity — add empty guard | P3 | 5 min | DONE | Review finding — condition evaluates false, no crash |
| T2.319c | generateInsight Rule 19: fires when deltas.revenue === 0 producing noisy "0% above" — add !== 0 guard | P3 | 2 min | DONE | Review finding — technically correct but low signal |
| T2.326 | Drill-down: Operations → Queue/Records | P1 | 45 min | DONE |
| T2.327 | Drill-down: Clinical → Records/Patients | P2 | 30 min | DONE |
| T2.328 | Drill-down: Financial → Sales/Expenses | P2 | 30 min | DONE |
| T2.329 | Drill-down: Growth → Patients/Queue | P2 | 15 min | DONE |
| T2.330 | Drill-down: target page filter acceptance | P1 | 45 min | DONE |
| T2.331 | Settings: Dashboard Alerts threshold configuration | P2 | 45 min | DONE |
| T2.332 | Dashboard: alert strip + threshold check | P2 | 30 min | DONE |
| T2.333 | Create `generateReportHTML()` utility | P1 | 1 hr | DONE |
| T2.334 | "Export Report" button per tab | P1 | 1 hr | DONE |
| T2.335 | PDF-specific print styling | P2 | 30 min | DONE |
| T2.336 | Settings: monthly goals configuration | P2 | 30 min | DONE |
| T2.337 | Dashboard: goal progress bars per tab | P2 | 45 min | DONE |
| T2.338 | Extend useDashboardData with historical min/max/avg | P2 | 1 hr | DONE |
| T2.339 | KPICard comparative context tooltip | P2 | 30 min | DONE |
| T2.340 | Create `annotateChartData()` utility | P2 | 1 hr | DONE |
| T2.341 | recharts custom annotation labels | P2 | 45 min | DONE |
| T2.330a | Queue drill-down "ACTIVE IN FACILITY" maps to tab 3 (Started) but KPI counts arrived+in-consult+dispensing+billing — no single tab matches | P3 | 15 min | DONE | Removed active:3 from tabMap, opens default view |
| T2.331a | Settings.jsx: add dashboardAlerts and dashboardGoals to the tracked array so changes appear in activity log | P3 | 5 min | DONE | Review finding — Day 6 audit |

#### Monitor (T2.231-T2.242, T2.273-T2.275)

| ID | Name | Priority | Effort | Status | Notes |
|---|---|---|---|---|---|
| T2.231 | Fix race condition in fetchTicketDetails | P0 | 30 min | DONE | useRef sequence counter prevents stale data; folds T2.236+T2.237 |
| T2.232 | Display ticket prefix (`W-005`) | P0 | 15 min | DONE | currentPrefix + padStart(3,'0') format |
| T2.233 | Fix isPriority — 2-tier (emergency=red, else=neutral) | P1 | 10 min | DONE | isEmergency replaces isPriority |
| T2.234 | Fix service display for walk-ins | P1 | 10 min | DONE | primaryService \|\| serviceType \|\| 'General Visit' |
| T2.235 | Queue status handling (paused/closed/idle) | P1 | 20 min | DONE | Tri-state: serving/paused/idle |
| T2.236 | Date filter on appointment query + null guard | P2 | 15 min | DONE | Folded into T2.231. **Review fix:** also applied to fetchUpcoming |
| T2.237 | Error handling on Firestore calls | P2 | 10 min | DONE | Folded into T2.231. **Review fix:** listenerError state with visible error screen |
| T2.238 | Sidebar link + clinic name from settings | P2 | 15 min | DONE | Lobby Monitor button in Sidebar + useClinicSettings in Monitor footer |
| T2.239 | Remove unused Grid import | P3 | 1 min | DONE | Folded into T2.275 |
| T2.242 | AssignStaffModal: fix ticket prefix for pre-booked (A not W) | P1 | 10 min | DONE | 3-way: E/W/A. Cascade analysis confirmed safe |
| T2.273 | Upcoming queue preview (next 2-3 tickets) | P2 | 45 min | DONE | **Review fix:** today date filter on upcoming query. Needs composite index appointments(status ASC, queueNumber ASC) |
| T2.274 | Transition animation on number change | P3 | 20 min | DONE | MUI Fade on mount (no exit animation — key remount) |
| T2.275 | Design tokens + TV readability pass | P2 | 30 min | DONE | All hex replaced with COLORS tokens, solid shadows, borderRadius:0 |

#### Expenses (T2.243-T2.258)

| ID | Name | Priority | Effort | Status | Notes |
|---|---|---|---|---|---|
| T2.243 | Wire useUser() + actual user attribution | P0 | 10 min | DONE | |
| T2.244 | Admin route guard | P0 | 10 min | DONE | Already wrapped in AdminRoute from T2.262 |
| T2.245 | Firestore security rules for expenses | P0 | 10 min | DONE | create requires loggedByUid==auth.uid; TODO: tighten to isAdmin after T2.1 |
| T2.246 | Validate amount > 0 and isFinite | P0 | 5 min | DONE | **Review fix:** added user?.uid guard to prevent null UID writes |
| T2.247 | Replace alert/confirm with MUI Snackbar + Dialog | P1 | 20 min | DONE | Absorbs T2.257 |
| T2.248 | Design tokens + fontWeight + solid shadows | P1 | 30 min | DONE | 62+ hex replaced, fontWeight normalized to 800 |
| T2.249 | onSnapshot error callback | P1 | 5 min | DONE | |
| T2.250 | Date-range filtering | P1 | 30 min | DONE | **Review fix:** Manila timezone (+08:00) on date bounds; daily KPIs (Option A) |
| T2.251 | Fix misleading Dashboard profit Alert | P1 | 5 min | DONE | |
| T2.252 | Remove dead code (Paper, Switch, FormControlLabel, style objects) | P2 | 2 min | DONE | |
| T2.253 | Enable DataGrid pagination | P2 | 5 min | DONE | pageSizeOptions 25/50/100 |
| T2.254 | Expense edit capability | P2 | 45 min | DONE | **Review fix:** guard against editing deleted expenses |
| T2.255 | Soft-delete instead of hard delete | P2 | 20 min | DONE | **Review fix:** updatedByUid added to satisfy Firestore rule |
| T2.256 | Expense date picker (allow backdating) | P2 | 15 min | DONE | **Review fix:** T04:00:00Z for Manila noon; expenseDate excluded from Firestore spread |
| T2.258 | displayDate locale fix | P3 | 5 min | DONE | en-PH, Asia/Manila timezone |

#### Login (T2.259-T2.266, T2.277-T2.278)

| ID | Name | Priority | Effort | Status | Notes |
|---|---|---|---|---|---|
| T2.259 | Add `disabled` flag check | CRITICAL | 5 min | DONE | Revoked staff can log in. **Review fix:** added missing `return` after role-denial `setError` to prevent fall-through |
| T2.260 | Sign out in catch block when Auth succeeded | CRITICAL | 5 min | DONE | Bypass: Auth + Firestore fail = unguarded. **Review fix:** wrapped catch-block `signOut()` in try/catch to prevent swallowing original error |
| T2.261 | Trim email input | HIGH | 2 min | DONE | |
| T2.262 | Route-level role protection in App.jsx (Option B locked) | HIGH | 30 min | DONE | Fixes 3 bugs in 1. **Review note:** infinite spinner possible for profile-less auth users — needs UserContext refactor (deferred) |
| T2.263 | Differentiate network vs auth errors | MEDIUM | 10 min | DONE | |
| T2.264 | Neubrutalism design alignment | P2 | 30 min | DONE | **Review fix:** removed unused `TYPE`, `FONT` imports (dead after design pass) |
| T2.265 | Remove dead LockOutlinedIcon import | LOW | 1 min | DONE | |
| T2.266 | Mobile LoginScreen: add disabled check | P2 | 5 min | DONE | Cross-project |
| T2.277 | Login: "Forgot Password" link | P1 | 20 min | DONE | Bumped from P2 — absorbs T4.70. **Review fix:** added `@` guard to prevent misleading success message on clearly invalid input |
| T2.278 | Login: default password detection warning | P3 | 15 min | DONE | Depends on T2.208 |
| T2.278a | App.jsx: infinite spinner for profile-less auth users — distinguish null (loading) from false (missing) in UserContext | P2 | 30 min | — | TODO | Review finding from T2.262 — needs UserContext refactor |
| T2.278b | App.jsx: replace hardcoded `bgcolor: '#212121'` with `COLORS.monitorBg` on Monitor layout | P3 | 1 min | — | DONE | Review finding — token exists but not used |
| T2.278c | Mobile LoginScreen.js: remove duplicate `label` style in StyleSheet (first definition silently overwritten) | P3 | 2 min | — | DONE | Review finding — pre-existing dead style block |
| ~~T2.524~~ | ~~UserContext infinite spinner~~ | — | — | ABSORBED | Duplicate of T2.278a (sub-ID grouped with Login module) |

### Mobile Client Screens (T2.343-T2.433)

> See MOBILE_CLIENT_DEEPDIVE.md for full code quotes and data flow diagrams

#### QueueScreen (T2.343-T2.354)

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.343 | Guard auth.currentUser null | P0 | 15 min | DONE |
| T2.344 | Guard queueData.status null | P0 | 5 min | DONE |
| T2.345 | Scope lobby query — strip to {queueNumber, serviceDuration, priority} (Option C locked) | P1 | 45 min | DONE |
| T2.346 | Expand my-ticket status filter to full active lifecycle | P1 | 15 min | DONE |
| T2.347 | Expand lobby status filter | P1 | 10 min | DONE |
| T2.348 | Standardize ticket format {prefix}-{padStart(3,'0')} | P2 | 15 min | DONE |
| T2.349 | Replace hardcoded 60-min emergency penalty | P2 | 15 min | DONE |
| T2.350 | parseInt radix + NaN guard | P2 | 5 min | DONE |
| T2.351 | Design tokens (after mobileTokens.js) | P2 | 30 min | DONE |
| T2.352 | Memoize patientsAhead/estWaitTimeMins | P3 | 10 min | DONE |
| T2.353 | Remove/deregister ManageQueueScreen.js | P1 | 10 min | DONE |
| T2.354 | Import statusLabels.js for human-friendly text | P3 | 15 min | DONE |

#### ChatbotScreen (T2.355-T2.362)

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.355 | Respect workingDays/closedDates | P1 | 30 min | DONE |
| T2.356 | Merge settings with defaults | P3 | 5 min | DONE |
| T2.357 | Full services catalog by department, fix tiered ₱0 | P1 | 30 min | DONE |
| T2.358 | Filter archived services | P3 | 5 min | DONE |
| T2.359 | Remove/restyle fake input bar | P3 | 10 min | DONE |
| T2.360 | Error state feedback | P3 | 10 min | DONE |
| T2.361 | Sub-intents by department | P3 | 30 min | DONE |
| T2.362 | Clinic contact from Firestore | P3 | 10 min | DONE |

#### UserProfileScreen (T2.363-T2.372)

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.363 | Write emergencyName flat field + modernize BookAppointment reader (BOTH locked) | CRITICAL | 10 min | DONE |
| T2.364 | Skip phone validation on empty optional contacts | P1 | 10 min | DONE |
| T2.365 | Null guard on getHighlightStyle | P1 | 5 min | DONE |
| T2.366 | Implement handleDeleteAccount or remove button | P2 | 30 min | DONE |
| T2.367 | Add email field to mobile profile | P2 | 15 min | ABSORBED |
| T2.368 | Add missing admin-parity fields | P3 | 30 min | ABSORBED |
| T2.369 | Auth null guard | P3 | 5 min | DONE |
| T2.370 | Remove empty contacts before save | P3 | 5 min | DONE |
| T2.371 | DOB null write on save | P3 | 5 min | DONE |
| T2.372 | Gender null vs "Decline" fix | P3 | 5 min | DONE |

#### MyPetsScreen (T2.373-T2.383)

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.373 | Fix allergy field read (petAllergies \|\| allergies) | P0 | 5 min | DONE |
| T2.374 | Optimize medical_records query (orderBy + limit 1) | P1 | 15 min | DONE |
| T2.375 | Parallelize N+1 queries (Promise.all) | P1 | 15 min | DONE |
| T2.376 | Replace hard delete with soft archive | P1 | 15 min | DONE |
| T2.377 | Auth null guard | P1 | 5 min | DONE |
| T2.378 | Guard lastVisit.toDate() | P2 | 10 min | DONE |
| T2.379 | Add weight display | P2 | 10 min | DONE |
| T2.379a | MyPetsScreen 4-column demoGrid: reduce fontSize or flex ratios to prevent text clipping on 320px screens (weight "12.5 kg" truncates) | P3 | 10 min | DONE | demoValue fontSize 15→13 |
| T2.380 | Add microchip badge | P3 | 10 min | DONE |
| T2.381 | Memoize processedPets | P2 | 10 min | DONE |
| T2.382 | Firestore rule: prevent client pet hard-deletion | P2 | 10 min | DONE |
| T2.383 | Design tokens | P3 | 30 min | ABSORBED | → T2.440 (Mobile Design Sweep: Convert MyPetsScreen) |

#### ClientDashboard (T2.384-T2.393)

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.384 | Fix queue-ahead: arrivedAppt.date → scheduledDateStr | CRITICAL | 15 min | DONE |
| T2.385 | Guard rec.petName.toUpperCase() | P1 | 5 min | DONE |
| T2.386 | Fix incomplete optional chaining on scheduledDate | P1 | 5 min | DONE |
| T2.387 | Add on-hold to status query | P1 | 10 min | DONE |
| T2.388 | Restructure reminders useEffect try/catch | P2 | 10 min | DONE |
| T2.389 | Remove dead imports | P3 | 2 min | DONE |
| T2.390 | Auth guard on all useEffects | P3 | 10 min | DONE |
| T2.391 | Dynamic queue progress bar width | P3 | 10 min | DONE |
| T2.392 | Consider showing pending appointments | P3 | 15 min | DONE |
| T2.393 | First-time user empty state | P3 | 15 min | DONE |

#### ClientAppointments (T2.394-T2.401)

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.394 | Fix history-tab ghost filter: cancelReason → auditReason | CRITICAL | 5 min | DONE |
| T2.394a | ClientAppointments handleDismissFollowUp: incomplete optional chaining on `item.scheduledDate?.toDate().toLocaleDateString()` — crashes when toDate() returns undefined | P3 | 2 min | DONE | Review finding — MOB-2 audit. Already fixed via formatDisplayDate in MOB-7 |
| T2.395 | Fix client cancel: include auditReason | CRITICAL | 5 min | DONE |
| T2.396 | Show reason for no-show/carried-over | P2 | 10 min | DONE |
| T2.397 | Fix invalid `my` CSS → marginVertical | P2 | 2 min | DONE |
| T2.398 | Add re-book for no-show/carried-over | P2 | 15 min | DONE |
| T2.399 | Refund indicator in receipt modal | P3 | 15 min | DONE |
| T2.400 | Debounce sales/parentRecords re-fetch | P3 | 20 min | DONE |
| T2.401 | Audit borderRadius | P3 | 15 min | DONE |

#### PetHistoryScreen (T2.402-T2.409)

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.402 | Remove soap.subjective per Q11 | HIGH | 10 min | DONE |
| T2.403 | Replace treatment with dischargeSummary.instructions (Option A locked: hide for legacy) | HIGH | 15 min | DONE |
| T2.404 | Rewrite generatePDF() client-safe only | HIGH | 30 min | DONE |
| T2.404a | BookAppointment.js: duplicate `toTitleCase` declarations in renderStep4 — two identical const definitions back-to-back | P3 | 1 min | DONE | Review finding — MOB-7 audit. Already fixed during MOB-7 |
| T2.405 | Guard nextVisit non-Timestamp (T2.6 fix) | P1 | 10 min | DONE |
| T2.406 | Strip price from prescriptions | P3 | 20 min | DONE |
| T2.407 | Defensive vitals coercion | P3 | 5 min | DONE |
| T2.408 | Replace hardcoded phone | P3 | 10 min | DONE |
| T2.409 | Design tokens | P3 | 30 min | ABSORBED (→ T2.440: Mobile Design Sweep: Convert PetHistoryScreen) |

#### SuperCard (T2.410-T2.416)

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.410 | Replace hardcoded CLINIC_PHONE | P2 | 10 min | DONE |
| T2.411 | Replace hardcoded CLINIC_ADDRESS (wrong city!) | P2 | 10 min | DONE |
| T2.412 | Add service type display | P2 | 10 min | DONE |
| T2.413 | petName null guard | P3 | 5 min | DONE |
| T2.414 | Implement queue-ahead count | P3 | 30 min | DONE |
| T2.415 | Reset pulseAnim on appointment change | P3 | 5 min | DONE |
| T2.416 | Create unified useClinicContact() hook | P2 | 20 min | DONE |

#### RegisterScreen (T2.417-T2.426)

| ID | Name | Priority | Effort | Status | Notes |
|---|---|---|---|---|---|
| T2.417 | ~~Fix BookAppointment profile check~~ | — | — | — | ABSORBED into T2.363 |
| T2.418 | Auth rollback on Firestore write failure | P1 | 20 min | DONE | |
| T2.419 | Merge: migrate medical_records | P1 | 15 min | DONE | |
| T2.420 | Merge: preserve guest createdAt | P2 | 10 min | DONE | |
| T2.421 | Merge: carry forward guest fields | P2 | 15 min | DONE | |
| T2.422 | Standard path: add accountStatus | P3 | 5 min | DONE | |
| T2.423 | Friendly error messages | P3 | 10 min | DONE | |
| T2.424 | Document/remove dormant mergeGuestAccount CF | P3 | 15 min | DONE | |
| T2.425 | Remove duplicate label style | P3 | 5 min | DONE | Duplicate removed in lint cleanup pass |
| T2.426 | Add profileComplete: false to registration | P3 | 5 min | DONE | |

#### helpers.js Extraction (T2.427-T2.433)

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.427 | Extract isValidPHPhone, eliminate duplicates | P1 | 10 min | DONE |
| T2.428 | Extract resolveTieredPrice, port admin NaN guard | P1 | 15 min | DONE |
| T2.429 | Extract calculateAge with future-DOB guard | P2 | 10 min | DONE |
| T2.430 | Extract unified formatFirestoreTime | P2 | 15 min | DONE |
| T2.431 | Move getLocalDateStrMobile to helpers | P2 | 10 min | DONE |
| T2.431a | Replace inline todayStr YYYY-MM-DD computation in ClientAppointments.js + ClientDashboard.js with `getLocalDateStr()` from helpers.js | P3 | 5 min | DONE | Review finding — MOB-7 audit |
| T2.432 | Extract formatHour | P3 | 5 min | DONE |
| T2.433 | Create formatDisplayDate/Time wrappers | P3 | 20 min | DONE |

### Design Unification (T2.434-T2.452)

> Design sweep is TERMINAL — do LAST after all bug fixes and feature work
> Skip: Queue/ directory (8 files) + ClinicalWorkspace.jsx (except fontWeight fix)

#### Mobile Design Tokens

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.434 | Create VetConnect/src/theme/mobileTokens.js | P1 | 30 min | DONE |
| T2.435 | Convert MyPetsScreen | P2 | 45 min | DONE |
| T2.436 | Convert UserProfileScreen | P2 | 45 min | DONE |
| T2.437 | Convert ChatbotScreen | P2 | 30 min | DONE |
| T2.438 | Convert QueueScreen | P2 | 30 min | DONE |
| T2.439 | Convert ClientAppointments | P2 | 45 min | DONE |
| T2.440 | Convert PetHistoryScreen | P2 | 45 min | DONE |
| T2.441 | Convert SuperCard | P2 | 20 min | DONE |

#### Admin Design Sweep

| ID | Name | Priority | Effort | Status | Notes |
|---|---|---|---|---|---|
| T2.442 | Fix designTokens.js: remove GLASS preset, add missing tokens | P1 | 30 min | DONE | Do BEFORE Dashboard build |
| T2.443 | Sweep: Patients module (13 files) | P2 | 2 hrs | DONE | Absorbs T2.453a |
| T2.444 | Sweep: Services module (6 files) | P2 | 1 hr | DONE | Absorbs T2.205a/b/c |
| T2.445 | Sweep: Inventory module (8 files) | P2 | 1.5 hrs | DONE | Absorbs T2.169 |
| T2.446 | Sweep: Sales module (3 files) | P2 | 30 min | DONE | |
| T2.447 | Sweep: Staff module (5 files) | P2 | 45 min | DONE | |
| T2.448 | Sweep: standalone pages (Settings, Monitor, Expenses, Login) | P2 | 1.5 hrs | DONE | |
| T2.449 | Sweep: shared components (Sidebar, POSModal) | P2 | 30 min | DONE | Absorbs T2.148a |
| T2.450 | Replace fontWeight:'1000' across ENTIRE admin (including Queue + CW) | P2 | 1 hr | DONE | All sweep-scoped modules fixed. Remaining fontWeight:1000 only in Queue + CW (Phase 4 exempt — T4.10/T4.16) |
| T2.451 | Replace all alert()/confirm() with MUI Dialog/Snackbar (sweep scope) | P2 | 2 hrs | TODO | Excludes Queue + CW |
| T2.452 | ~~Admin sweep: Queue modals~~ | — | — | — | CANCELLED — Queue/ directory skipped entirely |

### PatientDashboard A/A+ Tier (T2.453-T2.470)

| ID | Name | Priority | Effort | Status | Notes |
|---|---|---|---|---|---|
| T2.453 | Clinical amendment system (= T2.75) | P1 | 3 hrs | DONE | Append-only clinicalAmendments[] |
| T2.454 | Print Visit Summary button per record | P1 | 1.5 hrs | DONE | Already implemented at PatientDashboard.jsx L834-857 |
| T2.453a | Records.jsx + PatientDashboard.jsx: replace hardcoded #E65100 amendment orange with COLORS.amendment token (add to designTokens.js) | P3 | 5 min | DONE | Absorbed into T2.443 Design Sweep (used COLORS.warning) |
| T2.457 | Case-day linkage badges | P2 | 45 min | DONE | "Day X of Y" badges, integrated into existing appt fetch, blue day-1/orange day-2+. **Review fix:** caseDay<=1 guard → <1 so Day 1 records in chain get badge |
| T2.458 | Quick Book button per record | P2 | 20 min | DONE | "Rebook" button per expanded record + banner/sidebar buttons, all via WalkInModal prefill |
| T2.459 | Lab results aggregation in right sidebar (absorbs T2.24-27 admin portion) | P2 | 1.5 hrs | DONE | Always renders, trend context (previous result/date), reference range, status chips, empty state |
| T2.460 | Weight trend chart improvements (1-point display, delta annotation) | P2 | 30 min | DONE | Single-point prominent display, 2+ points delta annotation (green gain/red loss) |
| T2.461 | Vitals trend improvements (species-normal reference lines) | P2 | 30 min | DONE | SPECIES_VITAL_RANGES constant, dashed green ReferenceLine on Temp/HR/RR/CRT/BCS. **Review fix:** RR domain [10,50]. Gates T4.15 |
| T2.462 | Expand search: labResults + vaccineData | P2 | 15 min | DONE | |
| T2.463 | Print-friendly stylesheet (@media print) | P3 | 1 hr | DONE | 10 rules in index.css — hide nav/buttons, expand Collapse, force colors, page breaks |
| T2.464 | Prescription frequency analysis | P3 | 45 min | DONE | prescriptionFrequency memo, Nx count badges, sorted most-frequent first. **Review fix:** don't overwrite lastDate |
| T2.465 | Vaccination schedule completeness percentage | P3 | 30 min | DONE | vaccineCompleteness memo, species-filtered, progress bar + X/Y (Z%) display |
| T2.466 | Add RR, CRT, BCS, Pain to per-record vitals box | P1 | 20 min | DONE | 4 vitals recorded but not displayed |
| T2.467 | Add RR trend chart to sidebar | P2 | 15 min | DONE | |
| T2.468 | Add BCS trend chart to sidebar | P2 | 15 min | DONE | |
| T2.469 | Add Pain Scale trend chart to sidebar | P2 | 15 min | DONE | |
| T2.470 | Extract RR/CRT/BCS/Pain from medical_records in data processing | P1 | 10 min | DONE | |

### Vaccination System Redesign (T2.472-T2.479)

> Supersedes: ~~T2.455~~, ~~T2.456~~, ~~T2.471~~, ~~T2.473~~, ~~T2.475~~

| ID | Name | Priority | Effort | Status | Notes |
|---|---|---|---|---|---|
| T2.472 | Promote vaccineData to vaccineAdministrations[] array | P1 | 1.5 hrs | DONE | Multi-vaccine form, dual write (new array + legacy shim), printVaccinationRecord updated. **Review fix:** esc() XSS prevention |
| T2.474 | Auto-populate vaccine form from linked inventory batch | P2 | 30 min | DONE | **Review fix:** pre-fill only overwrites empty fields (preserves user edits) |
| T2.476 | Create VACCINE_CATALOG shared constant (6 vaccines, IDs, species, intervals) | P1 | 15 min | DONE | vaccineConstants.js with VACCINE_CATALOG, VACCINE_KEYWORDS, resolveVaccineFromName, getVaccineAdministrations |
| T2.477 | Replace vaccine TextField with species-filtered Autocomplete dropdown + "Other" | P1 | 30 min | DONE | freeSolo Autocomplete. **Review fix:** inputValue prop for proper controlled behavior |
| T2.478 | Update PatientDashboard tracker: vaccineId match + keyword fallback for legacy | P1 | 30 min | DONE | **Review fix:** both paths now pick most-recent match (not first) |
| T2.479 | Update mobile PetHistoryScreen for vaccineAdministrations[] | P1 | 20 min | DONE | Inline fallback to vaccineData, multiple cards with separator |
| T2.472a | ClinicalWorkspace: verify vaccineAdministrations state resets on patient change (or confirm component unmounts between patients) | P2 | 15 min | TODO | Review finding — stale vaccine data may persist if CW stays mounted |

### MyPetsScreen A- Tier (T2.480-T2.483)

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.480 | Add sex + medical status filter chips | P2 | 20 min | DONE |
| T2.481 | Add sort options (age, last visit) | P2 | 15 min | DONE |
| T2.482 | "Book Visit" button per pet card | P2 | 20 min | DONE |
| T2.483 | Vaccination completeness mini-badge per pet | P2 | 30 min | DONE |

### QueueScreen A Tier (T2.484-T2.490)

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.484 | Visual position indicator with progress bar | P1 | 30 min | DONE |
| T2.485 | Live countdown timer | P2 | 30 min | DONE |
| T2.487 | In-app alert when number called (vibration + banner) | P1 | 20 min | DONE |
| T2.488 | Historical average wait display | P2 | 30 min | DONE |
| T2.489 | Multi-pet awareness (show all checked-in pets) | P2 | 20 min | DONE |
| T2.490 | "Running Late" notification to clinic | P3 | 30 min | DONE |

### UserProfileScreen Parity (T2.497-T2.504)

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.497 | Add email field (editable) | P1 | 15 min | DONE |
| T2.498 | Add secondaryPhone | P2 | 10 min | DONE |
| T2.499 | Add govIdType + govIdNumber | P2 | 20 min | DONE |
| T2.500 | Add referralSource | P3 | 10 min | DONE |
| T2.501 | Add preferredComm | P3 | 10 min | DONE |
| T2.502 | Add whatsappOptIn toggle | P3 | 5 min | DONE |
| T2.503 | Add waiverSigned toggle with consent text | P3 | 15 min | DONE |
| T2.504 | Organize fields into collapsible sections | P2 | 20 min | DONE |

### JSX Audit Fixes (need formal IDs — grouped by file)

> From Queue.jsx, queueColumns.jsx, WalkInModal.jsx, ClinicalWorkspace.jsx JSX audits.
> These complement existing tasks. fontWeight fix covered by T2.450.

**Queue.jsx + queueColumns.jsx:**

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.505 | Replace deprecated disableSelectionOnClick → disableRowSelectionOnClick | P1 | 2 min | DONE |
| T2.506 | Fix Grid v1 API: `<Grid item xs={12}>` → `<Grid size={{ xs: 12 }}>` | P1 | 5 min | DONE |
| T2.507 | Guard .name.localeCompare() (Queue L1823 + queueColumns L327) | P1 | 10 min | DONE | **Review fix:** also guarded in AssignStaffModal L36 |
| T2.508 | Guard history dialog date crash (h.date?.toDate()) | P1 | 5 min | DONE |
| T2.509 | Add loading/disabled state to all 8 dialog submit buttons | P2 | 30 min | DONE | **Review fix:** triage shield handler made async with await + try/finally |
| T2.510 | Fix No-Show fieldset color ternary (both branches identical) | P3 | 2 min | DONE |
| T2.511 | Remove dead isAgeExact state + duplicate sortable + dead isVeryLate + 10 unused imports | P3 | 10 min | DONE | Fixes pre-existing build warning |
| T2.512 | Add on-hold + confined cases to timing column switch | P2 | 20 min | DONE |
| T2.513 | Filter pharmacy checklist to drugs only (isDrug, not all products) | P2 | 5 min | DONE | **Review fix:** 3-clause fallback for pre-T2.167 items |

**WalkInModal.jsx:**

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.514 | Fix: inject allergyArray into pet document write (currently always empty '') | P0 | 5 min | DONE | Patient safety — both guest + existing-client pet paths fixed |
| T2.515 | Clear errorMsg on radio toggle | P1 | 2 min | DONE |
| T2.516 | Replace onKeyPress with onKeyDown (deprecated React API) | P3 | 2 min | DONE |
| T2.517 | Remove unused imports (Accordion, AccordionSummary, AccordionDetails, PersonAddIcon, AccessTimeIcon) | P3 | 2 min | DONE | **Review fix:** handleClose resets allergyArray + 5 other states to prevent leak |

**ClinicalWorkspace.jsx:**

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T2.518 | Unify allergy field source across Identity Strip / God-View / Zen-mode | P0 | 10 min | DONE |
| T2.519 | Add Vaccine + Lab Results + Save Draft to God-View Plan quadrant | P1 | 45 min | DONE |
| T2.520 | Fix Assessment text color inconsistency (green vs espresso) | P2 | 5 min | DONE |
| T2.521 | Remove dentalGrade/lamenessGrade Firestore writes (no input UI, always 0) | P2 | 5 min | DONE |
| T2.522 | Propagate live weight to main Identity Strip | P2 | 5 min | DONE |
| T2.523 | Remove dead code: Widget, getGlucoseLevel, selectedRxItem, dischargeRef | P3 | 10 min | DONE |
| T2.518a | ClinicalWorkspace allergy case inconsistency: Identity Strip checks `!== 'None'` (exact case), God-View checks `.toUpperCase() !== 'NONE'` — normalize to case-insensitive | P3 | 2 min | T2.518 | DONE | Review finding — 'none' (lowercase from legacy data) would show as allergy in Identity Strip |
| T2.518b | ClinicalWorkspace: remove residual `soapRef` state — attached to Box but never consumed (no scrollTo/focus caller) | P3 | 1 min | — | DONE | Review finding — dead state from T2.18 cleanup |
| T2.95a | ServiceProgressCard: replace hardcoded `#2E7D32`/`#E8F5E9` with `COLORS.success`/`COLORS.kpiGreenBg` tokens | P3 | 5 min | T2.95 | DONE | Review finding — Design Sweep scope |
| T2.105a | ServiceFormModal: isScPwdEligible Switch uses `color="secondary"` instead of `COLORS.accent` token override | P3 | 5 min | T2.105 | DONE | Review finding — Design Sweep scope |

---

## Phase 3 — Future & Late Tasks (Session 2026-04-20 additions)

### Dashboard A+ (Late)

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T3.43 | Revenue trend extended (3mo/6mo/1yr) | P3 | 1.5 hrs | DONE |
| T3.44 | Stock turnover rate per product | P3 | 2 hrs | TODO |
| T3.45 | Shrinkage estimate | P3 | 1 hr | TODO |
| T3.46 | Predictive demand forecasting | P3 | 3-5 hrs | TODO |
| T3.47 | Stock reorder prediction | P3 | 2-3 hrs | TODO |
| T3.48 | Multi-pet booking percentage (depends T2.78) | P3 | 15 min | TODO |
| T3.49 | Patient journey funnel | P3 | 3 hrs | TODO |

### File Structure

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T3.50 | Full admin file restructure (post-defense) | P3 | 1 hr | TODO |

### Vaccination System A/A+

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T3.51 | Move VACCINE_CATALOG to Firestore with Settings UI | P2 | 2 hrs | DONE |
| T3.52 | Printable vaccination passport/certificate | P2 | 4 hrs | DONE |
| T3.53 | Overdue vaccine alert on ClientDashboard + check-in banner | P2 | 1.5 hrs | DONE |
| T3.54 | Vaccine protocol engine (puppy/kitten multi-dose series) | P3 | 3 days | TODO |
| T3.55 | Vaccine reminder push notifications (Blaze-dependent) | P3 | 2 hrs | TODO |
| T3.56 | Batch recall query tool | P3 | 1.5 hrs | TODO |
| T3.57 | QR-scannable vaccination certificate | P3 | 2 hrs | TODO |
| T3.58 | Philippine BAI vaccine reporting integration | P3 | **Scope unknown — research first** | TODO |

### QueueScreen + ChatbotScreen Late

| ID | Name | Priority | Effort | Status |
|---|---|---|---|---|
| T3.59 | QueueScreen: service-specific estimated times | P3 | 30 min | DONE | Per-service-type breakdown below aggregate estimate. Groups by serviceType, shows count + total mins. Only renders when 2+ types. |
| T3.60 | QueueScreen: pet care tips while waiting | P3 | 1 hr | TODO |
| T3.61 | QueueScreen: self-check-in via GPS geofencing (was T2.486) | P3 | 1.5 hrs | TODO |
| T3.62 | ChatbotScreen: enable real text input | P3 | 15 min | DONE | TextInput + Send button, KeyboardAvoidingView, fallback when LLM not configured |
| T3.63 | ChatbotScreen: chatbot gateway via Cloudflare Worker (Claude Haiku 4.5) | P3 | 2 hrs | DONE | chatbotService.js — plain fetch to Worker URL, DEFAULT_CHATBOT_SYSTEM_PROMPT. No Cloud Function needed. |
| T3.64 | ChatbotScreen: integrate gateway send/receive | P3 | 30 min | DONE | handleSendMessage with multi-turn conversationHistory, AI bubbles, error bubbles, typing indicator |
| T3.65 | ChatbotScreen: hybrid UI (buttons + free text) | P3 | 20 min | DONE | Quick-action chips as persistent horizontal bar. Emergency/Hours/Location/Services rule-based. Free text → AI. |
| T3.66 | ChatbotScreen: system prompt in Firestore | P3 | 15 min | DONE | Reads system_prompts/chatbot_assistant on mount, falls back to DEFAULT_CHATBOT_SYSTEM_PROMPT |
| T3.67 | ChatbotScreen: session management + rate limiting | P3 | 20 min | DONE | 5s rate limit, 20-msg cap, NEW CHAT button, in-memory conversation history |
| T3.68 | Queue services popover: show per-service status (pending/in-progress/completed) via ServiceProgressCard in the hover card. Wire serviceStatus from appointment.services[] into queueColumns.jsx services renderCell. Sort controls: booking order / status / department (per locked decision in handoff.json line 1825). Also addresses dropped T2.91 (popover accessibility) and T2.92 (Dispensing/Billing tab popovers). | P2 | 2-3 hrs | T2.95, T2.97 | DONE | Services popover: status chips + 3-way sort toggle + X/N DONE cell indicator. Insertion order default per locked decision. |
| T3.69 | EndOfDayModal service waterfall: show per-service completion status for each unresolved appointment so staff can see which services are incomplete before resolving. Use ServiceProgressCard in the appointment detail expansion. Enables informed carry-over vs cancel decisions. | P2 | 1.5 hrs | T2.95, T2.97 | DONE | Status chips in AuditPatientCard services panel + PROGRESS footer fraction. ServiceProgressCard visual language integrated directly. |
| T3.70 | Queue notes column restructure: split single 'notes' field into structured clientNotes/staffNotes/system-chips. Requires design session for data split, backward compat, ClinicalWorkspace subjective auto-fill interaction. Originally scoped as T2.90 discussion topic (handoff.json line 1509), never formalized. | P3 | 3-4 hrs | — | DONE | 13-step restructure: 5 write sites (clientNotes/staffNotes/systemChips), EOD carry-over propagation, tabbed popover (Client/Staff/System/Legacy), SoapGrid read-only context box, intakeContext on medical_records, dual-read fallback for legacy. 11 files modified. |
| T3.72 | Checkout correlation ID: shared ID linking sale doc + appointment update for forensic audit matching. Currently relies on appointmentId one-way link + temporal proximity. | P3 | 30 min | T2.100 | DONE | checkoutCorrelationId (CHK-timestamp-random) written to both individual + group checkout paths. Generated outside transaction for retry safety. |
| T3.73 | Reserve/release audit logging: write inventory_log entries when reserveStock/releaseStock modify reserved quantities. Currently invisible to audit trail. | P3 | 1 hr | T2.151 | TODO | Dropped — handoff.json L1406, L2206 |
| T3.74 | auditReason append-only: convert auditReason field to auditReasons[] array so cancel→revert→re-cancel preserves all reasons. Low priority — clinicalPulse already captures full history. | P3 | 30 min | — | DONE | Dual-write: scalar auditReason preserved + auditReasons arrayUnion at all 13 write sites (5 files). Each entry: { reason, action, staffName, timestamp }. |
| T3.75 | Draft save/resume pulse events: add DRAFT_SAVED and DRAFT_RESUMED clinicalPulse event types for forensic reconstruction. | P3 | 30 min | T2.19 | DONE | DRAFT_SAVED inside handleSaveDraft transaction. DRAFT_RESUMED via async updateDoc in handleResumeDraft (non-blocking). 2 builders (W19b, W19c) + 6 tests. 322 tests pass. |
| T3.76 | Unit tests for pulse event writing correctness | P2 | 4-6 hrs | T3.14 | DONE | 28 builders in pulseEventBuilders.js + 246 tests in pulseEventWriters.test.js. All 295 tests pass (246 new + 49 existing). Contract-tests all 7 source files (useQueueActions, Queue, ClinicalWorkspace, WalkInModal, AssignStaffModal, POSModal, Records). |
| T3.77 | Scanned/photo signature upload for consent system | P3 | 2-3 hrs | T3.5, Blaze | TODO | expo-image-picker → Cloud Storage → URL in signatureData. Add tab to ConsentScreen + ConsentRecordDialog. Deferred from T3.5 Amendment 1 |
| T3.78 | Sign-off pulse event gap — add STATUS_CHANGE for in-consult→dispensing/billing | P2 | 30 min | — | DONE | clinicalPulse arrayUnion in handleSaveConsult appointmentUpdate. buildSignOffStatusChangeEvent builder + 6 tests (W17b). 306 tests pass. |
| T3.79 | Historical tooltip period flexibility — match lookback to selected period | P3 | 30 min | T3.43 | TODO | Dashboard historical min/max/avg tooltip hardcoded to 6 months. Should adapt to 3mo/6mo/1yr. Deferred from T3.43 |
| T3.80 | Erasure engine Cloud Function migration (T3.11 Phase B) | P3 | 3-4 hrs | T3.11, T3.40, Blaze | TODO | Move useErasureEngine to callable CF + admin.auth().deleteUser() + atomic cross-collection writes. Documented in PHASE3_RA10173_ERASURE_PLAN.md Blaze Upgrade Path |
| T3.81 | Replace recordType badge with services[] chips on PatientDashboard + PetHistoryScreen | P3 | 1.5 hrs | — | DONE | Per-service chips on both surfaces. Fallback: serviceNames → [serviceType] → ['Clinical Visit']. |
| T3.82 | Fix serviceType to capture all services, not just the first | P3 | 30 min | — | DONE | Added serviceNames array alongside serviceType in handleSaveConsult. Backward-compatible — existing serviceType string unchanged. |
| T3.83 | PatientDashboard: render discharge summary in expanded record view | P2 | 1.5 hrs | — | DONE | Cream/peach card: diagnosis, instruction bullets, medications, follow-up, recheck, vet signature. All sub-fields conditional. |
| T3.84 | PatientDashboard: render lab results in expanded record view | P2 | 30 min | — | DONE | Blue section: test name + result, status Chip (NORMAL green / ABNORMAL orange / CRITICAL red), optional notes. |
| T3.85 | PatientDashboard: render patient status badge in expanded record view | P3 | 15 min | — | DONE | Color-coded Chip in header row: STABLE green, CRITICAL red, GUARDED orange. |
| T3.86 | PatientDashboard: render attachments in expanded record view | P3 | 30 min | — | DONE | Clickable file links in right column. Handles both {name,url} objects and plain URLs. |
| T3.87 | PatientDashboard: render SOAP Assessment field in expanded record view | P2 | 15 min | — | DONE | Green-bordered Assessment block between Objective and Plan/Treatment. |
| T3.88 | PetHistoryScreen: render extended vitals (RR, CRT, BCS, pain) | P2 | 30 min | — | DONE | 7 vitals in flexWrap row + PDF generator updated. |
| T3.89 | PetHistoryScreen: render SOAP Assessment in discharge-less records | P2 | 15 min | — | DONE | Green assessment block, guarded: !dischargeSummary && assessment !== diagnosis. |
| T3.90 | PetHistoryScreen: render amendments history | P2 | 30 min | — | DONE | Orange amendment cards: reason, text, author, timestamp. Sorted ascending. |
| T3.91 | PatientDashboard: render amendments in expanded record view | P2 | 30 min | — | DONE | ABSORBED → T2.453 (already implemented at PatientDashboard.jsx lines 1089-1136) |
| T3.92 | PatientDashboard: render inline vaccination details per record | P3 | 30 min | — | DONE | Green cards per vaccine: name, manufacturer, lot, route, site, due date. Handles both vaccineAdministrations[] and legacy vaccineData. |
| T3.93 | PetHistoryScreen: vitals trend mini-charts (weight + temp sparklines) | P3 | 2-3 hrs | — | DONE | Reusable SparkLine.js component (react-native-svg). Weight/temp/HR sparklines in collapsible card. Memoized ListHeaderComponent. |
| T3.94 | PetHistoryScreen: search + filter bar | P3 | 2 hrs | — | DONE | TextInput search + 4 filter chips (All/Medical/Grooming/Vaccination). filteredHistory useMemo. |
| T3.95 | PetHistoryScreen: case day badge for multi-day cases | P3 | 15 min | — | DONE | "Day N" badge via Promise.all appointment reads. caseDayMap state. |
| T3.96 | PetHistoryScreen: year section headers | P3 | 30 min | — | DONE | Inline year dividers using resolveDate + filteredHistory comparison. |
| T3.97 | PetHistoryScreen: prescription frequency analysis | P3 | 1 hr | — | DONE | Collapsible "Frequently Prescribed" card. Top 10 meds with Nx badges. |
| T3.98 | Rename prescription/rxCart terminology — rxCart→treatmentCart, prescriptions→dispensedProducts, prescribedItems→encounterItems across all code + Firestore fields. Dual-read fallback for existing documents (dispensedProducts || prescriptions). No logic changes — isDrug routing, dispensing flow, discharge medications all unchanged. | P2 | 2-3 hrs | — | DONE | 11 files, ~105 occurrences. Writes use new names, reads use dual-fallback (newField || oldField). Zero logic changes. |
| T3.99 | Structured SOAP amendment form — replace text-only amendment input with a full SOAP form (S/O/A/P fields + optional vitals + optional medications). Amendments stored with type:'structured' to distinguish from legacy text-only. Display as orange-bordered mini SOAP card on PatientDashboard, PetHistoryScreen, and EMRDrawer. Original record stays locked and untouched — amendment is a structured addendum. Backward compat: legacy amendments (type undefined) render as text blob. | P2 | 3-4 hrs | T2.453 | DONE | 4 files. ClinicalWorkspace: structured SOAP form + handler. PatientDashboard + EMRDrawer + PetHistoryScreen: branch renderer (structured → SOAP card, legacy → text blob). EMRDrawer field name fix. |
| T3.100 | Vaccination tracker species filter — filter completeness bar by pet species. Currently iterates ALL catalog vaccines regardless of species. Cat shows DHPP as 'NOT RECORDED'. Fix: vaccineCatalog.filter(v => v.species.includes(petSpecies)). Affects PatientDashboard vaccinationStatus useMemo. | P2 | 30 min | T3.51 | DONE | Species filter in vaccinationStatus useMemo. vaccineCompleteness simplified to trivial count. Cats see 3 vaccines, dogs see 4. |
| T3.101 | Vaccine exemption flag — add vaccineExemptions[] array on pet doc. Per-vaccine N/A marking with reason + exemptedBy. Tracker shows grey 'EXEMPT' instead of red 'NOT RECORDED'. UI: small 'Mark N/A' button per vaccine row on PatientDashboard tracker. | P2 | 1 hr | T3.100 | DONE | vaccineExemptions[] on pet doc. Grey Exempt chip + reason Tooltip. MUI Dialog for reason. Undo via arrayRemove. Excluded from completeness denominator. |
| T3.102 | Vaccine-allergy contraindication warning — cross-reference pet allergies (petAllergies field) against vaccine catalog keywords when vet selects a vaccine in ClinicalWorkspace. Show orange warning chip if potential match. Advisory only, not blocking. | P2 | 1.5 hrs | T3.51 | TODO | Patient safety — requires allergen-to-vaccine mapping in catalog or a simple keyword cross-check |
| T3.103 | Link vaccine lot number to inventory batch — when vet selects vaccine from catalog in ClinicalWorkspace, auto-populate lot/manufacturer from inventory batch picker (same pattern as T3.38 dispensing batch selection). Creates true batch recall traceability. Currently lot number is free-text with no inventory validation. | P2 | 2 hrs | T3.38 | TODO | Drug recall traceability — lot must trace back to actual inventory batch |
| T3.104 | Normalize vaccine dueDate to Firestore Timestamp — currently stored as ISO string on some records, Timestamp on others. Every reader needs typeof/toDate fallback parsing. Standardize write to Timestamp.fromDate(), add dual-read fallback at all read sites. | P3 | 1 hr | — | TODO | Data consistency — same pattern as T3.70 dual-read approach |
| T3.105 | Remove legacy vaccineData shim — stop dual-writing the single-object vaccineData field alongside vaccineAdministrations[]. All readers already use vaccineAdministrations || [vaccineData] fallback. Removing the write saves document size. Keep read fallback for historical records. | P3 | 30 min | — | TODO | Tech debt cleanup — vaccineData is redundant since T2.474 shipped multi-vaccine array |
| T3.106 | Optimize mobile overdue vaccine detection — ClientDashboard does N+1 getDocs per pet. Refactor to a single collectionGroup query or batch the pet IDs into fewer queries. | P3 | 1 hr | — | TODO | Performance — acceptable for <10 pets but scales poorly for multi-pet owners |
| T3.107 | Client-side LLM clinical reasoning — Anthropic Claude Haiku 4.5 via Cloudflare Worker proxy. Augments existing KNOWLEDGE_BASE with "Ask AI" button. Settings Pillar 11: Worker URL, system prompt, feature toggle. Audit logging to llm_audit_logs. Purple-themed response panel with mandatory disclaimer. | P2 | 3-4 hrs | — | DONE | llmService.js (plain fetch, zero npm deps) + Settings Pillar 11 + ClinicalWorkspace Ask AI button + purple panel + audit trail. API key in Cloudflare env only. |
| T3.108 | FAQ management system — admin CRUD for chatbot knowledge base. New faqs Firestore collection with question/answer/category/active fields. Settings Pillar 12 UI for managing FAQ entries. On ChatbotScreen mount, inject FAQ entries + live clinic data (clinic_settings + services catalog with prices) into the system prompt appendix so Claude references real clinic information in free-text answers. Categories: General, Services, Pricing, Policies, Pet Care. | P2 | 4-6 hrs | T3.62-T3.67 | DONE | buildPromptAppendix (live clinic data + FAQ injection), faqConstants.js (5 categories + 8 seed entries), Settings Pillar 12 (CRUD with category tabs + dialogs + seed defaults), mobile FAQ fetch via getDocs. |
| T3.109 | PetHistoryScreen: split dispensedProducts display by isDrug — show actual medications under "Medications" label (isDrug: true) and non-drug products under "Other Items Dispensed" label (isDrug: false). Currently all products render under misleading "Prescribed Medications:" label. Also fix the Rx frequency analysis (T3.97) to separate drug frequency from non-drug frequency. Discharge summary medications section is already correct (filtered to isDrug only). | P2 | 30 min | — | DONE | renderRecord: 💊 Medications + 🛍️ Items Dispensed split. PDF generator: same split. prescriptionFrequency: isDrug filter only. Discharge summary unchanged. |
| T3.110 | Treatment Plan sidebar: add prescription instructions input per item — ClinicalWorkspace Treatment Plan sidebar (line ~2668) shows item name, qty, price, and staff attribution but has NO TextField for dosing instructions. The handler handleUpdateRxSig exists (line 1234) and the sig object is initialized with defaults but there is no UI to edit it. Add a compact instructions TextField per product item (collapsible or inline) so the vet can type "1 tab BID x 7 days". This flows through to dispensedProducts.instructions on medical_records and dischargeSummary.medications.instructions for the client. Currently all prescriptions show "Use as directed" fallback. | P1 | 1 hr | — | DONE | Drug items: always-visible orange TextField with MedicationIcon. Non-drug: collapsible toggle. Auto-populate from sig defaults. _showInstructions stripped from encounterItems writes. |
| T3.111 | Queue action column layout overflow — confirmed-status action cell in queueColumns.jsx (lines 779-868) renders a 2-tier layout: Check In button row (top) + 2x2 secondary grid (Assign, Time, No-Show, Cancel). This exceeds the fixed 110px rowHeight (Queue.jsx:1941), causing the primary Check In button to be clipped off-screen. Only secondary buttons are visible. Fix: collapse to single horizontal row [ Check In (flex) ] [ Assign ] [ ⋮ ]. Remove inline Time, No-Show, Cancel buttons — all three already exist in the MoreVert overflow menu (Queue.jsx:2192-2197 No-Show, 2199-2204 Reschedule, 2232-2238 Cancel/Void). Apply same treatment to pending-status block (lines 746-777): collapse to [ Accept (flex) ] [ Defer ] [ ⋮ ], remove inline Reject (covered by Cancel/Void in overflow menu). Keep all isTomorrow disabled guards, caseDay > 1 RE-ARRIVE variant, and Defer inline (no Defer in overflow menu). Do NOT change rowHeight, overflow menu contents, or any other status action layouts. | P2 | 30 min | — | DONE | Pending: [Accept] [Defer] [⋮]. Confirmed: [Check In] [Assign] [⋮]. Removed inline Time/No-Show/Cancel/Reject (all in overflow menu). 3 unused icon imports removed. |
| T3.112 | Mobile booking INCEPTION pulse event — online appointments created via BookAppointment.js (not useBookingEngine — that hook is read-only) write zero clinicalPulse events. Fix: add clinicalPulse array with INCEPTION event to transaction.set payload in BookAppointment.js. Reschedule/ghost paths are updateDoc only — no INCEPTION needed. | P2 | 15 min | — | DONE | clinicalPulse: [{ type: 'INCEPTION', toStatus: 'pending', staffName: ownerName, note: 'Online booking by client [Group X/Y]' }] added to transaction.set. Inline eventId, no new imports. |
| T3.113 | Self-check-in broken — Firestore rule blocks client queue write + pulse event format wrong. | P1 | 20 min | — | DONE | Queue rule split: allow update isAuth() + allow create,delete isStaff(). Pulse event rewritten to canonical format (fromStatus/toStatus/timestamp/eventId/staffId/staffName). Deploy firestore.rules required. |
| T3.114 | Self-check-in GPS timeout — Location.getCurrentPositionAsync hangs on slow GPS. | P2 | 15 min | — | DONE | Promise.race with 10s GPS_TIMEOUT_MS. Resolves to null → graceful fallback { ok: true, fallback: true, reason: 'Location check timed out' }. |
| T3.115 | Ask AI panel invisible — DiagnosticBridge Collapse hidden during loading + below scroll fold. | P2 | 30 min | — | DONE | Collapse in simplified to llmPanelOpen. Loading spinner + "Analyzing clinical data..." during fetch. Auto-scroll via useRef + scrollIntoView with 150ms delay. Fixes all 3 views (SOAP, God View, Zen). |
| T3.116 | Ask AI panel Markdown rendering — replace raw whiteSpace pre-line with ReactMarkdown. | P2 | 20 min | T3.115 | DONE | react-markdown installed. DiagnosticBridge renders h1-h3 (purple), p, li, table/th/td (kpiPurpleBorder borders), hr via components prop. All 3 views auto-covered. |
| T3.117 | God View quadrant symmetry — flex layout, scroll chain, border lines. | P3 | 30 min | — | DONE | Replaced calc(100vh-84px) with minHeight:0 (flex fill). Plan quadrant scrolls via existing SoapQuadrant overflowY:auto. Added borderTop on A+P for mobile cross pattern. |
| T3.118 | PatientDashboard amendment button — the "Add Amendment" form currently only exists in ClinicalWorkspace.jsx (lines 2891-3070), requiring vets to navigate Queue → find appointment → open workspace to amend a sealed record. The PatientDashboard.jsx displays amendments read-only (lines 1330-1379) but has no creation UI. Fix: add an "Add Amendment" button on each sealed medical record card in PatientDashboard. The button opens a Dialog with the same structured amendment form (reason + SOAP fields + optional vitals + optional meds) from ClinicalWorkspace. The write handler performs the same dual writeBatch: medical_records.amendments[] via arrayUnion + appointments.clinicalPulse[] CLINICAL_AMENDMENT event. Extract the amendment form + handler from ClinicalWorkspace into a shared AmendmentDialog component that both surfaces can use (ClinicalWorkspace passes appointmentId + recordRef, PatientDashboard passes the same from its medical records query). The button should only appear when record.legal.isLocked === true. Use the same orange styling and structured SOAP mini-card pattern as existing amendment displays. | P2 | 1.5 hrs | T3.99 | DONE | Extracted AmendmentDialog.jsx (~350 lines). PatientDashboard: orange button on sealed cards, refreshKey re-fetch. ClinicalWorkspace: removed ~270 lines inline form, replaced with dialog. Net ~95 fewer lines. |
| T3.119 | EndOfDayModal services sort toggle — the Queue services popover (T3.68) has a 3-way sort toggle (Booking Order / Status / Department) per locked decision in handoff.json line 1825: "LOCKED: ServiceProgressCard shared component — identical header/list/footer in queue popover and EndOfDayModal." However, the EndOfDayModal (T3.69) only renders services in insertion order with status chips and a PROGRESS footer — no sort control. The services column (column 2 of the 4-column AuditPatientCard) should have a compact sort toggle matching the popover's pattern. Implementation: add a `servicesSortMode` state to EndOfDayModal (or per-card via the AuditPatientCard component), add a small ToggleButtonGroup (Booking/Status/Dept) above the services list, apply the same sort logic as Queue.jsx lines 2380-2394 (STATUS_ORDER for status sort, localeCompare for department). Keep it compact — the card column is narrower than the popover. | P3 | 30 min | T3.69 | DONE | Per-card servicesSortMode state + compact ToggleButtonGroup (Booking/Status/Dept). SERVICES_STATUS_ORDER module constant. useMemo sortedServices with spread-before-sort. Matches Queue popover pattern. |
| T3.120 | Simplify check-in — remove staff assignment from AssignStaffModal, make check-in a direct action. Currently AssignStaffModal.jsx has two modes: 'check-in' (queue number + staff assignment + status transition) and 'assign' (staff assignment only). For a 1-2 vet clinic, staff assignment at check-in is redundant — the vet assigns themselves via ClinicalWorkspace "Performed By" dropdown during consultation. Refactor: (1) Strip the per-service staff assignment UI and dropdowns from AssignStaffModal — keep only the queue number issuance, ticket prefix, group check-in coordination, confirmed→arrived transition, and pulse event writing. The modal becomes a simple confirmation dialog ("Check in [petName]? Queue number will be issued.") or a direct action with no modal at all. (2) Remove the 'assign' mode entirely — delete the "Assign" button from queueColumns.jsx confirmed-status action row. (3) Add `statusHistory: arrayUnion(patient.status)` to the check-in write at AssignStaffModal.jsx lines 225-232 and sibling writes at lines 254-261 — this fixes the missing statusHistory bug that corrupts the revert chain (confirmed→arrived transition currently doesn't record 'confirmed' in statusHistory, causing revert from dispensing to skip back to arrived instead of in-consult). (4) Also fix the `arrayUnion` deduplication problem for statusHistory: if a patient goes in-consult→on-hold→in-consult, the second 'in-consult' is silently dropped by arrayUnion, corrupting the revert chain. Fix: change statusHistory from arrayUnion to array spread (`[...freshData.statusHistory, currentStatus]`) at ALL write sites (useQueueActions.js:42, ClinicalWorkspace.jsx:1598, AssignStaffModal.jsx, Queue.jsx:684). This allows duplicate entries which is correct for a revert stack. | P2 | 2 hrs | — | DONE | AssignStaffModal stripped to confirmation dialog (~450 lines removed). 'Assign' mode + button removed. statusHistory added to check-in writes. arrayUnion→array-spread at all 6 statusHistory write sites (useQueueActions, ClinicalWorkspace, Queue, POSModal×2, AssignStaffModal). Revert chain now handles status cycles correctly. |
| T3.121 | ClinicalWorkspace sign-off guard for non-consult patients — when a group visit workspace is open, clicking a sibling tab (via onSwitchPatient) loads that pet's appointment regardless of status. If the sibling is still in 'arrived' status (not yet started consult), the vet can fill SOAP fields AND click "SIGN & SEND TO CASHIER" or "LOCK CLINICAL RECORD", which bypasses the arrived→in-consult transition entirely. This means: no STATUS_CHANGE pulse event for in-consult, no timeStarted timestamp, consult duration metrics are zero/wrong, and statusHistory jumps from 'arrived' directly to 'dispensing/billing'. Fix: in ClinicalWorkspace.jsx, check patient.status before sign-off. If status is 'arrived' (or 'confirmed'), auto-transition to 'in-consult' first by calling changeStatus before proceeding with the sign-off write. This should be a silent pre-flight — write the STATUS_CHANGE pulse event + timeStarted + statusHistory entry, then continue with the normal sign-off flow. The SOAP fields can remain editable in all statuses (pre-filling notes is fine), but the sign-off buttons must enforce the transition. Also consider: should "SAVE DRAFT" be allowed on arrived patients? Probably yes — drafts are non-destructive. Only sign-off needs the guard. | P1 | 30 min | T3.120 | DONE | Pre-flight guard in handleSaveConsult: auto-transitions arrived/confirmed→in-consult via inline updateDoc before sign-off batch. Writes STATUS_CHANGE pulse, timeStarted, statusHistory. Also fixed stale patient.status refs in sign-off batch (lines 1639, 1650) to use server-truth currentFreshStatus. |
| T3.122 | On-hold UI button missing — the on-hold status is fully implemented in the backend: useQueueActions.js changeStatus supports in-consult→on-hold transition (line 82 writes lastPausedAt), on-hold→in-consult resume (line 84 calculates totalPausedMinutes), the Triage Clock column renders ON HOLD duration (queueColumns.jsx:641-650), and the STARTED tab includes on-hold patients (Queue.jsx:1431). But there is NO UI button to trigger the transition anywhere — not in the queue action column (in-consult rows show only WORKSPACE + MoreVert), not in the overflow menu (no "Put On Hold" MenuItem), and not in ClinicalWorkspace. Fix: add a "Pause / On Hold" button. Two placement options: (A) In the overflow menu as a MenuItem for in-consult patients — "Put On Hold" with PauseCircleIcon, calls handleStatusChange(row, 'on-hold'). Resume is already handled by changeStatus when the vet clicks START CONSULT on an on-hold row. (B) In ClinicalWorkspace as a button near the sign-off area — allows the vet to pause mid-consult without closing the workspace. Option A is simpler and matches the existing overflow menu pattern. Option B is more accessible during active consultation. Consider implementing both — the overflow menu for queue-level pausing, and a CW button for workspace-level pausing. | P2 | 30 min | — | DONE | Overflow menu: "Put On Hold" (in-consult→on-hold, PauseCircleIcon, COLORS.warning) + "Resume Consult" (on-hold→in-consult, PlayCircleFilledWhiteIcon, COLORS.success). Both call handleStatusChange→changeStatus which handles lastPausedAt, totalPausedMinutes, pulse event. |
| T3.123 | Service-level pulse event display — SERVICE_STARTED and SERVICE_COMPLETED pulse events contain serviceName and serviceId fields (written at ClinicalWorkspace.jsx:1329-1330) but the display label in EndOfDayModal milestones (line 243) renders them as generic "EVENT" because it falls through to p.type without incorporating p.serviceName. The note field correctly shows "Service started." / "Service completed." but doesn't name the service either. Fix: (1) EndOfDayModal.jsx line 243: when p.type is SERVICE_STARTED or SERVICE_COMPLETED, use p.serviceName in the label — e.g., label: `${p.serviceName}: ${next === 'SERVICE_STARTED' ? 'STARTED' : 'COMPLETED'}`. (2) Same fix in the Queue hover popover timeline (Queue.jsx ~line 2649 area) and Records.jsx audit timeline (~line 985) — any surface that renders pulse event labels should check for serviceName. (3) Also update the note field at ClinicalWorkspace.jsx:1331 from generic "Service started." to include the name: `${serviceName} started.` / `${serviceName} completed.` so even surfaces that only render the note get the service context. | P3 | 20 min | — | DONE | 3 display surfaces (EndOfDayModal, Queue popover, Records timeline) now show serviceName for SERVICE_STARTED/COMPLETED events. ClinicalWorkspace note field includes service name at write time. Fallback to generic label preserved. |
| T3.124 | Re-route button for reverted signed records — when a patient's medical record is already sealed (legal.isLocked === true) but the appointment status has been reverted to a pre-billing status (in-consult, on-hold, arrived), the ClinicalWorkspace shows "RECORD SEALED" + "ADD AMENDMENT" but no forward-moving action. The sign-off handler (handleSaveConsult) blocks re-entry because lockedServices.has('medical') returns true (line 1377). The vet is stuck — can't re-sign-off, can't advance to dispensing/billing. Fix: in ClinicalWorkspace.jsx, when the record is locked AND the patient status is NOT in a post-sign-off status (dispensing/billing/completed), show a "RE-ROUTE TO CASHIER" button that performs a direct status transition to dispensing (or billing if no dispensable items). This button skips the sign-off flow entirely (record is already signed) and just writes: status change, statusHistory push, STATUS_CHANGE pulse event with note "Re-routed after revert — record already sealed." The button replaces the greyed-out "SIGN & SEND TO CASHIER" in this specific scenario. Condition: isRecordLocked && !['dispensing', 'billing', 'completed', 'carried-over', 'cancelled', 'no-show'].includes(patient.status). | P2 | 30 min | T3.121 | DONE | handleRerouteSealed handler + RE-ROUTE TO CASHIER button in RECORD SEALED section. getDoc for fresh statusHistory, nextStatus matches hasDrugsInCart logic (dispensing vs billing), STATUS_CHANGE pulse event, showToast + onClose. Button guarded by post-sign-off status exclusion list. |
| T3.125 | statusHistory gap on cancel/no-show paths — `rejectAppointment` (useQueueActions.js:249), `markNoShow` (useQueueActions.js:205), and EOD batch cancel (Queue.jsx:511) all write terminal status (`cancelled`/`no-show`) WITHOUT pushing the current status onto `statusHistory` first. The normal `changeStatus` function (useQueueActions.js:43) correctly does `statusHistory: [...(freshApptData.statusHistory || []), freshApptData.status]`, but these three paths skip it entirely. Result: when `revertStatus` pops `statusHistory[last]`, it gets a stale earlier status (e.g., `in-consult` instead of `billing`), sending the record to the wrong queue tab. Fix: add `statusHistory: [...(freshData.statusHistory || []), freshData.status]` to all three write paths. `rejectAppointment` and `markNoShow` already run inside `runTransaction` with a fresh read, so use `apptDoc.data().statusHistory` and `apptDoc.data().status`. EOD batch uses `writeBatch` (no fresh read), so use the client-side `rawStatus` and read `statusHistory` from the snapshot or add a pre-read. ~3 lines changed per path. | P2 | 30 min | — | DONE | Added statusHistory push to all 3 terminal paths: markNoShow (transaction, apptDoc.data()), rejectAppointment (transaction, apptDoc.data()), EOD batch cancel (writeBatch, patient.statusHistory + rawStatus). 3 lines added. |
| T3.126 | statusHistory gap on EOD carry-over path + carried-over terminal guard — EOD carry-over (Queue.jsx ~line 445) writes `status: 'carried-over'` without pushing current status onto statusHistory. Same root cause as T3.125 — revert pops wrong entry. Additionally, `carried-over` behaves terminally (Done tab, forensicSeal, record resolved) but is NOT in TERMINAL_STATUSES (statusConstants.js ~line 61), meaning any staff can revert it — and carry-over revert creates duplicate records (old record reactivated + cloned next-day record still exists). The comment at line 56-59 says "CARRIED_OVER is intentionally excluded" — this decision is being REVERSED because revert without clone cleanup is the most dangerous gap in the queue system. Fix: (a) add statusHistory push to the EOD carry-over batch.update at ~line 444: `statusHistory: [...(patient.statusHistory || []), rawStatus]`, (b) add `STATUS.CARRIED_OVER` to TERMINAL_STATUSES set so only admins can revert carry-over, (c) rewrite the exclusion comment to explain the new rationale. | P2 | 20 min | T3.125 | DONE | statusHistory push added to EOD carry-over batch.update. STATUS.CARRIED_OVER added to TERMINAL_STATUSES (admin-only revert). Comment rewritten. Terminal reversal warning updated with carried-over + duplicate-record caveat. |
| T3.127 | Inline reschedule: full carry-over for active patients + transaction wrap — Queue.jsx saveReschedule (~line 931-986) currently modifies the record in-place for ALL patients, setting `status: 'confirmed'` regardless of whether the patient is active (arrived/in-consult/on-hold/dispensing/billing/confined). For active patients, this silently erases evidence of today's visit — arrival time, consult duration, pulse events, and all metrics get moved to tomorrow's date context. The dialog title already says "CLINICAL CARRY-OVER" and claims to "increment Case Day status" for active patients, but the code never follows through. The pulse event correctly records `toStatus: 'carried-over'` for active patients (line 960) — the implementation just never matched the intent. Fix: split saveReschedule into two branches based on the existing `isCarryOver` flag (line 944-949). For `isCarryOver === false` (pending/confirmed): keep current behavior (modify in-place, status 'confirmed', new date), add statusHistory push, wrap in runTransaction. For `isCarryOver === true` (active patients): replicate the EOD carry-over pattern (Queue.jsx ~lines 438-505) — old record gets `status: 'carried-over'` + forensicSeal + statusHistory push + systemChips CARRY-OVER + isTriaged; new clone document gets `status: 'confirmed'` + `caseDay + 1` + `originApptId` + INCEPTION pulse + accumulatedWaitMins + preservedData minus temporal fields (same destructure as EOD line 468). Use writeBatch for atomicity (batch.update old + batch.set new). Add fresh-status terminal guard. | P1 | 1.5 hrs | T3.126 | DONE | saveReschedule split into 2 branches. Branch 1 (pending/confirmed): runTransaction + terminal guard + statusHistory push. Branch 2 (active): full carry-over — old record sealed (carried-over, forensicSeal, statusHistory, CARRY-OVER chip, auditReasons), new clone (confirmed, caseDay+1, originApptId, INCEPTION pulse, notes propagation, 20+ fields stripped). Both branches have terminal guards. |

---

## New Batch Groupings (Session 2026-04-20)

| Batch Name | Tasks | Total Effort | Notes |
|---|---|---|---|
| Dashboard S-Tier Build | T2.228-T2.341 (infrastructure + 4 tabs + S-tier features) | ~32 hrs | 6-day sprint. Prerequisite: T2.342 + T2.442 |
| Admin Standalone Pages | T2.231-T2.278 (Monitor + Expenses + Login fixes) | ~7 hrs | |
| Mobile Critical Fixes | T2.343, T2.344, T2.363, T2.373, T2.384, T2.394, T2.395, T2.514, T2.518 | ~1.5 hrs | All CRITICAL/P0 — ship first |
| Mobile Client Hardening | T2.345-T2.416 (remaining mobile fixes) | ~10 hrs | |
| Mobile Helpers Extraction | T2.427-T2.433 | ~1.5 hrs | |
| Design Unification | T2.434-T2.451 (mobile tokens + admin sweep) | ~16 hrs | Do LAST |
| PatientDashboard A+ | T2.453-T2.470 | ~11 hrs | |
| Vaccination Redesign | T2.472-T2.479 | ~3.25 hrs | |
| Mobile A- Push | T2.480-T2.504 (MyPets + Queue + Profile parity) | ~6 hrs | |
| JSX Audit Fixes | T2.505-T2.523 | ~3 hrs | |

---

## Phase 3 Batch Groupings (Session 2026-04-21)

> 67 tasks classified into 13 essential, 16 high-value, 38 truly optional
> Batches ordered by priority: Essential first, then High-Value, then Optional

### Phase 3 Essential Batches

| Batch Name | Tasks | Effort | Notes |
|---|---|---|---|
| Staff Auth Production Path | T3.40, T3.41, T3.42 | ~6 hrs | Blaze required. Gates T4.44. Ship together — revoke/re-enable/password are one story |
| Forensic Reporting | T3.8 | 3-4 days | P1. Thesis narrative. Proves audit system works at scale |
| Legal Compliance (RA 10173) | T3.11 | 4 hrs | Right-to-erasure. Philippine data privacy law |
| Vaccination A-Tier | T3.51, T3.52, T3.53 | 7.5 hrs | Firestore catalog + printable passport + overdue alerts. Prerequisite: T2.476-T2.479 |
| Queue Workflow Gaps | T3.9, T3.10a, T3.10b, T3.10d | 4.5-6.5 hrs | Terminal revert + Records quick link + recently resolved + global search |
| Inventory Safety | T3.24, T3.31 | ~2 hrs | Expiry disposal + configurable no-show window. Quick wins |

### Phase 3 High-Value Batches

| Batch Name | Tasks | Effort | Notes |
|---|---|---|---|
| EMR + Multi-Vaccine UI | T3.1, T3.2, T3.3 | 2.5 days | EMRDrawer + multi-vaccine + passport. T3.3 overlaps T3.52 — do T3.52 first, T3.3 becomes mobile-specific |
| RA 10173 Informed Consent | T3.5 | 8-12 days | Largest single task. Post-defense. Legal compliance |
| Multi-Pet Visit | T3.12 | 15-20 hrs | 11 sub-tasks. Depends on T2.78. Major real-world feature |
| Dispensing Hardening | T3.36, T3.37, T3.38, T3.39 | 4.5 hrs | Hold for review + stock verify + batch picker + partial dispensing |
| Inventory Operations | T3.21, T3.26, T3.27 | 4 hrs | Reorder alerts + adjustment types + CSV/PDF export |
| Appointment Lifecycle | T3.32, T3.34 | 4 hrs | Client confirmation + push reminders. Blaze for T3.34 |
| Testing Foundation | T3.14 | 3-4 hrs | First and only test suite in the project |
| Dashboard A+ Analytics | T3.43, T3.50 | 2.5 hrs | Extended revenue trend + file restructure |

### Phase 3 Optional Batches (skip without consequence)

| Batch Name | Tasks | Effort | Notes |
|---|---|---|---|
| LLM Chatbot | T3.62-T3.67 | ~4 hrs | All 6 tasks. Blaze + LLM. Chatbot is functional without this |
| Advanced Inventory | T3.22, T3.23, T3.25 | 5-10 days | Barcode scanning + valuation report + supplier directory. Hardware-dependent |
| Hospital-Grade Safety | T3.29, T3.30 | 10-13 hrs | Structured allergies + barcode scan before admin. Overkill for small clinic |
| Vaccination Deep | T3.54, T3.55, T3.56, T3.57, T3.58 | ~4 days+ | Protocol engine + push + recall + QR cert + BAI integration |
| QueueScreen Polish | T3.10c, T3.59, T3.60, T3.61 | ~4 hrs | Resolved toggle + service times + pet tips + GPS geofencing |
| Patient Extras | T3.15, T3.16, T3.17, T3.18, T3.19, T3.20 | 2-3 weeks | Auth for clients + household + comms + referrals + photos + analytics |
| Niche Features | T3.4, T3.6, T3.13, T3.28, T3.33, T3.35 | ~2 weeks | Grooming form + LLM gateway + partial refund + ward labels + no-show rate + waitlist |
| Dashboard Predictive | T3.44-T3.49 | ~12 hrs | Stock turnover + shrinkage + demand forecast + reorder prediction + multi-pet % + journey funnel |

---

## Phase 4 Batch Groupings (Session 2026-04-21)

> 80 tasks (3 absorbed → 77 active) · ~154 hrs
> Batches ordered by module affinity. All require Phase 2 + relevant Phase 3 complete.

### Phase 4 Batches

| Batch Name | Tasks | Effort | Key Dependencies | Notes |
|---|---|---|---|---|
| Dashboard S-Push | T4.1-T4.4 | 7.5 hrs | T2.315, T2.320, T2.333 | Auto-refresh + custom layout + benchmarking + sharing |
| Queue S-Push | T4.5-T4.10 | 13 hrs | T2.214, T2.281, T2.331, T2.442 | Drag-drop + forecasting + recommendations + multi-dept + alerts + design sweep |
| ClinicalWorkspace S-Push | T4.11-T4.17 | 17 hrs | T2.32, T2.442, T2.461 | Templates + attachments + problem list + voice + decision support + design sweep + unification |
| POSModal S-Push | T4.18-T4.23 | 12 hrs | T2.101, T2.102, T2.105, Blaze | Partial pay + receipt email + GCash + VAT + multi-currency + deposits |
| Records S-Push | T4.24-T4.28 | 10 hrs | T2.57, T2.71, T2.75, T2.130 | Full-text search + bulk export + audit viz + comparison + saved queries |
| Patients/EMR S-Push | T4.29-T4.34 | 11 hrs | T2.134, T2.135, T2.460, Blaze | Engagement scoring + birthdays + growth charts + health risk + comms + deceased |
| Services S-Push | T4.35-T4.38 | 7 hrs | T2.301 | Packages + promo pricing + analytics + dependency chains |
| Inventory S-Push | T4.39-T4.43 | 10-12 hrs | T3.21-T3.25 | Auto-reorder + barcode + disposal + valuation + heatmap |
| Staff S-Push | T4.44-T4.48 | 11-12 hrs | Blaze, T3.40, T3.42 | Auth CF + scheduling + performance + KPIs + credentials |
| Sales S-Push | T4.49-T4.53 | 9.5 hrs | T2.137, T2.141, T4.21 | Date range + trend + P&L + VAT/BIR + reconciliation |
| Settings S-Push | T4.54-T4.58 | 10 hrs | T2.180, T2.181 | History viewer + preview + multi-location + import/export + feature flags |
| Monitor S-Push | T4.59-T4.63 | 6.5 hrs | T2.273-T2.275, T4.6 | A- rollup + multi-room + wait estimate + carousel + weather |
| Expenses S-Push | T4.64-T4.68 | 10.5 hrs | Blaze | Receipt scan + recurring + budgets + approval + year-end report |
| Login S-Push | T4.69-T4.73 (excl T4.70) | 5 hrs 10 min | T2.277, Blaze | MFA + biometric + session timeout + audit log |
| Mobile S-Push | T4.74-T4.80 (excl T4.77) | 13.5 hrs | T2.434, Blaze | Offline + push + dark mode + reschedule + pet photos + haptics |

---

## Cancelled / Absorbed Tasks (Session 2026-04-20)

| ID | Reason |
|---|---|
| T2.417 | Absorbed into T2.363 (emergencyName both-sides fix) |
| T2.452 | Cancelled — Queue/ directory skipped from design sweep |
| T2.455 | Absorbed into T2.476 (VACCINE_CATALOG includes feline) |
| T2.456 | Absorbed into T2.478 (vaccineId matching eliminates keyword issues) |
| T2.471 | Absorbed into T2.477 (dropdown IS the manual toggle) |
| T2.473 | Superseded by T2.477 (dropdown always available, no isVaccineService needed) |
| T2.475 | Absorbed into T2.476 (VACCINE_CATALOG is the shared constant) |
| T2.486 | Moved to T3.61 (self-check-in deferred to Phase 3) |
| T2.491-T2.496 | Moved to T3.62-T3.67 (LLM chatbot deferred to Phase 3) |

### Absorbed in Session 2026-04-21 (S-Tier Scoping)

| ID | Reason |
|---|---|
| T2.98 | Absorbed into T2.148 (superset scope: Sales.jsx + POSModal clinic name) |
| T4.70 | Absorbed into T2.277 (identical scope — Forgot Password link. T2.277 bumped P2→P1) |
| T4.77 | Absorbed into T4.71 (biometric login covers both admin + mobile) |
| T2.47 | Absorbed into T2.18 (ClinicalWorkspace dead code cleanup) |
| T2.18.1 | Absorbed into T2.18 |
| T2.18.2 | Absorbed into T2.18 |
| T2.18.3 | Absorbed into T2.18 |

---

## Phase 4 — S-Tier Roadmap

> ~80 tasks · ~156 hours · Post-defense aspirational tier
> Source: IMPLEMENTATION_GUIDE.md S-Tier Roadmap section
> Prerequisites: ALL Phase 2 tasks + relevant Phase 3 tasks must be complete
> These features push each module from A/A- to S grade

### Dashboard S (T4.1-T4.4) — +7.5 hrs

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T4.1 | Real-time auto-refresh: 30s interval on useDashboardData | P2 | 1 hr | T2.315 | DONE | refreshKey param, 30s interval with 3 guards (toggle + Page Visibility + interaction pause), spinning AutorenewIcon |
| T4.2 | Customizable widget layout: react-grid-layout, per-user prefs in Firestore | P3 | 3-4 hrs | T2.228 | DONE | DraggableKPIGrid + useDashboardPreferences + defaultLayouts. KPI cards draggable, layout saved per-user, Reset Layout button |
| T4.3 | Comparative benchmarking: this month vs same month last year | P2 | 2 hrs | T2.320 | DONE | buildYearAgoRange, benchmarkEnabled 3rd param, "VS LAST YEAR" chip, blue YoY deltas on KPICards |
| T4.4 | Dashboard sharing: snapshot URL or full multi-tab PDF export | P3 | 1.5 hrs | T2.333, T2.334 | DONE | generateFullReportHTML (4-tab concatenation with page breaks), EXPORT ALL TABS button, popup-blocked Snackbar |

### Queue S (T4.5-T4.10) — +13 hrs

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T4.5 | Drag-and-drop queue reordering: @dnd-kit, queuePosition field, pulse event | P2 | 3 hrs | — | TODO | |
| T4.6 | Real-time capacity forecasting: "queue clears by 4:30 PM" | P2 | 1.5 hrs | T2.281 | TODO | Uses avg consult duration |
| T4.7 | Staff assignment recommendations: sort by lowest workload | P2 | 1 hr | T2.214 | TODO | Needs correct workload query |
| T4.8 | Split-screen multi-department view: side-by-side filtered DataGrids | P3 | 4 hrs | — | TODO | |
| T4.9 | Audio/visual alert for staff when wait >X minutes | P2 | 30 min | T2.331 | TODO | Uses threshold config |
| T4.10 | Full Queue design sweep: 8 files, tokens + borderRadius + shadows | P2 | 3-4 hrs | T2.442 | TODO | Currently skipped from sweep |

### ClinicalWorkspace S (T4.11-T4.17) — +17 hrs

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T4.11 | SOAP template library: soap_templates collection, dropdown per quadrant | P2 | 2 hrs | — | TODO | |
| T4.12 | Image/file attachments in SOAP: Firebase Storage, thumbnail preview | P3 | 3-4 hrs | — | TODO | Blaze recommended |
| T4.13 | Structured problem list: problems sub-collection, active/resolved tracking | P2 | 3-4 hrs | — | TODO | |
| T4.14 | Voice-to-text for SOAP fields: Web Speech API, per-quadrant mic button | P3 | 2-3 hrs | — | TODO | Browser support varies |
| T4.15 | Clinical decision support: species-adjusted vital range alerts | P2 | 1 hr | T2.461 | TODO | Uses species-normal ref lines |
| T4.16 | Full ClinicalWorkspace design sweep: 1,989 lines, glassmorphism removal | P2 | 2-3 hrs | T2.442 | TODO | Currently skipped from sweep |
| T4.17 | God-View + main grid unification via SoapGrid extraction | P1 | 2-3 hrs | T2.32 | TODO | Completes T2.32 scope |

### POSModal S (T4.18-T4.23) — +12 hrs

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T4.18 | Partial payments / installment tracking: payments sub-collection | P2 | 3 hrs | T2.101 | TODO | Needs computed balance |
| T4.19 | Receipt email/SMS to client: Blaze CF, SendGrid/Twilio | P3 | 1.5 hrs | Blaze | TODO | |
| T4.20 | Integrated payment terminal: GCash QR generation, merchant API | P3 | 2-3 hrs | Blaze | TODO | External API |
| T4.21 | Tax computation: VAT, SC/PWD tax-exempt breakdown per RA 9994 | P1 | 1.5 hrs | T2.105 | TODO | Legal compliance |
| T4.22 | Multi-currency support: USD for expat clients, exchange rate config | P3 | 1 hr | — | TODO | |
| T4.23 | Deposit collection at booking time: mobile + deposits collection + POS reads | P2 | 2 hrs | T2.102 | TODO | |

### Records S (T4.24-T4.28) — +10 hrs

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T4.24 | Full-text search across all SOAP fields, prescriptions, diagnoses | P2 | 2 hrs | T2.130 | TODO | Extends search scope |
| T4.25 | Bulk export to CSV/PDF: filtered records → downloadable file | P2 | 1.5 hrs | T2.57 | TODO | Needs working filters |
| T4.26 | Audit trail visualization: pulse timeline per record, expandable row | P2 | 2 hrs | T2.75 | TODO | Needs amendment path |
| T4.27 | Record comparison: two records side-by-side, vitals delta, SOAP diff | P3 | 2 hrs | — | TODO | |
| T4.28 | Saved search queries: per-user Firestore subcollection | P3 | 2.5 hrs | T2.71 | TODO | Extends saved filters |

### Patients CRM + PatientDashboard EMR S (T4.29-T4.34) — +11 hrs

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T4.29 | Client engagement scoring: 0-100 composite (visit frequency + no-show + balance + completeness) | P2 | 2 hrs | T2.134 | TODO | Extends engagement KPIs |
| T4.30 | Automated birthday/pet anniversary messages: Blaze cron, push/in-app | P3 | 1.5 hrs | Blaze | TODO | |
| T4.31 | Pet growth charts: breed-specific weight-for-age curves with percentile | P3 | 3 hrs | T2.460 | TODO | Extends weight trend |
| T4.32 | Breed-specific health risk profile: static dataset, "Health Watch" sidebar | P2 | 2 hrs | — | TODO | |
| T4.33 | Client communication log: communications sub-collection, CRM tab | P3 | 2 hrs | T3.17 | TODO | |
| T4.34 | Deceased pet memorial handling: Mark as Deceased + dateOfDeath + memorial indicator | P2 | 30 min | T2.135 | TODO | Extends deceased status |

### Services S (T4.35-T4.38) — +7 hrs

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T4.35 | Package deals: service_packages collection, bundle pricing, BookAppointment integration | P2 | 3 hrs | — | TODO | |
| T4.36 | Seasonal/promotional pricing: promotions collection, date-range discounts, POS applies | P3 | 1.5 hrs | — | TODO | |
| T4.37 | Service analytics: revenue per service, actual vs scheduled duration, demand patterns | P2 | 1.5 hrs | T2.301 | TODO | Uses revenue trend data |
| T4.38 | Service dependency chains: prerequisites[], BookAppointment pre-check | P3 | 1 hr | — | TODO | |

### Inventory S (T4.39-T4.43) — +10-12 hrs

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T4.39 | Auto-reorder alerts with supplier integration: reorderPoint field, purchase order PDF | P2 | 3 hrs | T3.21, T3.25 | TODO | Needs reorder alerts + supplier dir |
| T4.40 | Barcode/QR scanning for stock intake: camera scanner, SKU lookup | P3 | 3-5 days | T3.22 | TODO | Multi-day. Hardware-dependent |
| T4.41 | Expiry disposal workflow: batch-find expired, batch-adjust, audit log | P2 | 1.5 hrs | T3.24 | TODO | Extends disposal batch action |
| T4.42 | Inventory valuation report: COGS, margin by category, turnover rate, CSV/PDF export | P2 | 2 hrs | T3.23 | TODO | Extends valuation report |
| T4.43 | Stock movement heatmap: fastest-moving items by day-of-week | P3 | 1 hr | — | TODO | |

### Staff S (T4.44-T4.48) — +11-12 hrs

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T4.44 | Cloud Function for Firebase Auth management: disable, custom claims, password reset | P1 | 3-4 hrs | Blaze, T3.40, T3.42 | TODO | Production-critical |
| T4.45 | Staff scheduling/availability: per-staff workingDays[], useBookingEngine integration | P2 | 3 hrs | — | TODO | |
| T4.46 | Performance metrics dashboard: patients seen, avg consult, revenue per vet | P2 | 2 hrs | — | TODO | |
| T4.47 | Staff KPI cards: wire dead KPICard component with real data | P2 | 1 hr | T2.221 | TODO | After dead code cleaned |
| T4.48 | Credential management: PRC license expiry tracking, CE credits, renewal alerts | P3 | 2 hrs | — | TODO | PH regulatory |
| T4.81 | Unify role/accessLevel redundancy: pick one canonical field, migrate all consumers (Firestore rules, App.jsx, UserContext, LoginScreen, Queue.jsx, useStaffManager, Records.jsx, StaffTable), write Firestore migration script for legacy veterinarian/groomer docs, delete the redundant field. | P3 | 4-5 hrs | T2.213 | TODO | Tech debt — both fields currently work but create confusion. See handoff.json role vs accessLevel analysis. |
| T4.82 | Integration tests — pulseUtils consumer argument validation | P3 | 8-12 hrs | T3.14 | TODO | @testing-library/react + jsdom. Test consumers pass correct args to calculatePulseMetrics |
| T4.83 | End-to-end clinical workflow automated tests | P3 | 15-20 hrs | T3.76 | TODO | Playwright/Cypress + Firestore emulator. Full patient lifecycle automated testing |
| T4.84 | UI rendering tests for forensic components | P3 | 6-8 hrs | T3.14 | TODO | @testing-library/react + jsdom. ForensicMetricGrid, KPICard, chart rendering |
| T4.85 | My Bookings: case day chain with swipe pager — ClientAppointments.js History tab currently shows multi-day visits as separate unlinked cards with zero reference to caseDay or originApptId. Fix: client-side group appointments by originApptId chain into a single "Case" card. Use FlatList with horizontal + pagingEnabled to enable swipe between days within a case. Pinned header shows pet name, service, "CASE: X DAYS", date range, and total clinic time (accumulatedWaitMins). Dot indicators show swipe position. Single-day visits render normally with no case wrapper. Multi-pet visits group by visitGroupId first, then within each pet by originApptId chain. Data: caseDay, originApptId, accumulatedWaitMins already on each appointment document — no new Firestore reads. | P2 | 5-6 hrs | — | DONE | buildCaseChains.js utility (pure function, cycle guard, O(n) with root caching). CaseDayCard.js component (pinned header, horizontal FlatList pager, dot indicators, per-day status/price/actions). ClientAppointments.js: chain detection on standalone items in History tab only, _isCaseWrapper in renderItem. Neubrutalism: borderRadius 0, COLORS.warning border, #FFF3E0 header. |
| T4.86 | My Bookings: vertical visit timeline from clinicalPulse — ClientAppointments.js currently shows zero pulse data. Add a vertical timeline to both the SuperCard (active visits) and expanded History cards (completed visits). Derive from clinicalPulse STATUS_CHANGE events. Map internal statuses to client-friendly labels (arrived→"Arrived", in-consult→"Consultation started", on-hold→"Paused", dispensing→"Pharmacy", billing→"Checkout", completed→"Visit complete"). Show staff name and timestamp at each node. Duration between nodes as subtle label. CORRECTION events shown as "Status corrected" and TERMINAL_REVERSAL as "Record reopened" — do NOT expose raw staff notes to clients (staff write notes assuming only staff see them). For active visits: live elapsed time at current stage. For completed: signedOffAt displayed as "Signed by Dr. X at TIME". | P2 | 6-7 hrs | T4.85 | DONE | buildVisitTimeline.js utility (filter+map+duration, 10 excluded event types, CLIENT_LABEL_MAP). VisitTimeline.js component (collapsed breadcrumb + expanded vertical timeline, pulsing dot, live elapsed, signed-by annotation). Integrated into SuperCard (active), CaseDayCard (per-day history), ClientAppointments (standalone history). Staff notes excluded from client view. |
| T4.87 | My Bookings: encounter summary with expand/collapse — ClientAppointments.js completed visit cards currently show only a status badge ("VISIT COMPLETE") with zero detail about what was done. Add expandable encounter summary showing: services performed with staff name and price (from encounterItems[]), total cost (from finalTotal), medications dispensed with sig instructions (from encounterItems[].sig where isDrug), recheck recommendation (from medical_records query where appointmentId matches), prognosis and next visit (from medical_records). Default state: collapsed (pet + service + date + status). Tap to expand one card. Add "Expand All / Collapse All" toggle button at top of History list. Add "View Full Record" button that navigates to PetHistoryScreen with pet pre-selected. medical_records query fires only on expand (lazy load), not on list render. | P2 | 6-7 hrs | T4.85 | DONE | EncounterSummary.js component (4 sections: services, medications with sig, next steps from lazy medical_records query, action buttons). Integrated into ClientAppointments (standalone history) + CaseDayCard (per-day pages, hideViewRecord). Expand All/Collapse All toggle. medRecordFetched cache prevents re-query. |
| T4.88 | My Bookings: wait time transparency from forensicSeal — ClientAppointments.js shows no timing data to clients. Add wait/consult/total duration display to both active SuperCard and completed History cards. For completed visits: derive from forensicSeal metrics (shiftQueueMins, shiftConsultMins, totalOperationalMins) — already computed, zero additional work. For active visits: live computation from clinicalPulse timestamps. Show on-hold as "Paused: Xm". Show clinic average wait time computed from client's own visit history (personal benchmark — no Cloud Functions needed). Format: "Wait: 18m · Consult: 1h 15m · Total: 2h 3m" on completed, "Waiting: 42m (your avg: 25m)" on active. | P2 | 3-4 hrs | T4.86 | DONE | WaitTimeMetrics.js component (CompletedMetrics from forensicSeal.raw, ActiveMetrics with live 60s timer from clinicalPulse, 6 status sub-modes, warning highlight when wait exceeds personal avg). avgWaitMins useMemo (3-visit threshold). Integrated into SuperCard (active), ClientAppointments (history), CaseDayCard (per-day + header forensicSeal aggregate). |
| T4.89 | Push notifications: Cloudflare Worker endpoint with template engine + debounce — Add a /push endpoint to the existing Cloudflare Worker (https://cool-fire-2d53.jepdd15.workers.dev). Accepts { pushToken, status, petName, vetName, date, amount, ownerId } and sends to Expo Push API (https://exp.host/--/api/v2/push/send). Built-in template map: all 12 status transitions have a default message template with {petName}, {vetName}, {date}, {amount} placeholders. Before sending, check Firestore notification_templates collection for admin-customized overrides — if found, use custom template; otherwise fall back to hardcoded default. Add /push/custom endpoint for free-text notifications: accepts { pushToken, title, body }. Implement debounce for multi-pet visits: hold notifications for 3 seconds keyed by ownerId, merge if multiple arrive (e.g., "Yoko and Cynthia are now being seen by Dr. Santos" instead of two separate notifications). All 12 transitions: pending→confirmed, arrived→in-consult, in-consult→on-hold, on-hold→in-consult, in-consult→dispensing, dispensing→billing, billing→completed, any→cancelled, any→no-show, any→carried-over, confirmed→arrived (self-check-in acknowledgment), on-hold→dispensing. | P1 | 5-6 hrs | — | DONE | Cloudflare Worker updated with POST /push (12-status DEFAULT_TEMPLATES + interpolateTemplate + customTitle/customBody override + sendToExpo) and POST /push/custom (free-text relay). Option B (caller passes templates) — worker stays stateless. Debounce skipped for v1. Firestore rules added for notification_templates (staff read, admin write). Worker deployed externally. |
| T4.90 | Push notifications: admin-side sendPushNotification utility + integration into all status write paths — Create VetConnect-Admin/src/utils/sendPushNotification.js utility function that reads the pet owner's expoPushToken from the appointment/user doc and POSTs to the Cloudflare Worker /push endpoint. Integrate into ALL status write paths (19 paths across 5 files): changeStatus, revertStatus, markNoShow, rejectAppointment (useQueueActions.js), AssignStaffModal check-in (2 paths), ClinicalWorkspace sign-off + auto-transition guard + re-route (3 paths), Queue.jsx EOD batch carry-over/cancel/no-show + inline reschedule Branch 1 (simple) + inline reschedule Branch 2 (carry-over old record) + dispensing→billing (6 paths), POSModal checkout (2 paths), WalkInModal walk-in creation. Note: T3.127 split the inline reschedule into 2 branches — Branch 1 (simple) and Branch 2 (carry-over old record → carried-over + clone). Branch 2's old record transition is the 19th path. Each call passes appointment data + new status. Fire-and-forget (no await — don't block the UI on push delivery). | P1 | 3-4 hrs | T4.89 | DONE | sendPushNotification.js utility (fire-and-forget, module-level tokenCache + workerUrl cache, WALK_IN guard). 18 integration points across 6 files: useQueueActions (4), Queue.jsx (6), AssignStaffModal (2), ClinicalWorkspace (3), POSModal (2), WalkInModal (1). on-hold→in-consult sends 'resumed'. All calls after successful writes, never awaited. |
| T4.91 | Push notifications: admin-customizable templates in Settings page — Add a "Notification Templates" section to VetConnect-Admin/src/pages/Settings.jsx. Display all 12 status transition templates with editable TextFields showing the current message (default or custom). On save, write to Firestore notification_templates collection. Each template has: transitionKey (e.g., 'in-consult'), title, body (with placeholder syntax: {petName}, {vetName}, {date}, {amount}). Show placeholder reference guide. "Reset to Default" button per template. The Cloudflare Worker (T4.89) already reads from this collection — this task just provides the admin UI to edit them. | P2 | 2-3 hrs | T4.89 | TODO | Lets the clinic customize notification wording without code changes |
| T4.92 | Push notifications: custom notification UI — PatientDashboard + Queue overflow menu — Add a "Send Notification" button in two locations: (1) PatientDashboard per-client view (VetConnect-Admin/src/features/Patients/PatientDashboard.jsx) — sends to the client's expoPushToken with a free-text title + body via MUI Dialog, (2) Queue overflow menu per-appointment (VetConnect-Admin/src/features/Queue/Queue.jsx) — sends to the appointment owner with appointment context pre-filled. Both call the Cloudflare Worker /push/custom endpoint. Dialog: title TextField, body TextField (multiline), preview section, Send + Cancel buttons. Log each custom notification to the appointment's clinicalPulse as a NOTIFICATION event for audit trail. | P2 | 2-3 hrs | T4.89 | TODO | Admin can send arbitrary messages to clients — lab results ready, pickup notice, reminders |
| T4.93 | Push notifications: scheduled appointment reminders via Cloudflare Cron Trigger — Add a Cloudflare Cron Trigger (free tier supports cron schedules) that runs daily at 8:00 AM Asia/Manila. The cron handler queries Firestore for tomorrow's confirmed appointments, reads each owner's expoPushToken, and sends a reminder: "Reminder: {petName}'s appointment is tomorrow at {time} — {service}". Use the notification_templates collection for customizable reminder text (T4.91). Skip appointments where the owner has no pushToken. Add a clinic_settings toggle (enableAppointmentReminders, default true) so clinics can disable. Log sent reminders to avoid duplicates on retry. | P2 | 3-4 hrs | T4.89, T4.91 | TODO | "Your appointment is tomorrow" — the most requested notification feature for clinic clients |
| T4.94 | Push notifications: mobile notification handler + app open on tap — Configure expo-notifications in the mobile app to handle incoming push notifications. Foreground: show as in-app banner via Notifications.setNotificationHandler (already partially set up in ClientDashboard.js). Background/killed: system notification tray (handled automatically by Expo). On tap: open the app to the home screen (ClientDashboard) via Notifications.addNotificationResponseReceivedListener. Register notification categories for action buttons if needed (e.g., "View Appointment" on status updates). Ensure expoPushToken registration (already at ClientDashboard.js:113-117) works on both Android and iOS. Test on physical device — push notifications do not work on emulators. | P1 | 1-2 hrs | T4.89 | TODO | Mobile-side handler to receive and display push notifications from the Cloudflare Worker |

### Sales S (T4.49-T4.53) — +9.5 hrs

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T4.49 | Multi-day date range view: week/month sales, range picker, pagination | P2 | 2 hrs | — | TODO | |
| T4.50 | Revenue trend visualization: daily line chart for selected period | P2 | 1 hr | T2.301 | TODO | Mirrors Dashboard chart |
| T4.51 | Profit/loss statement: revenue - expenses - COGS for a period, PDF export | P1 | 2 hrs | T2.137 | TODO | Needs EOD dual display |
| T4.52 | Tax computation and reporting: monthly VAT summary for BIR filing | P1 | 1.5 hrs | T4.21 | TODO | PH regulatory (BIR) |
| T4.53 | Payment reconciliation: match GCash/bank deposits vs recorded sales, show discrepancies | P2 | 3 hrs | T2.141 | TODO | Needs Bank Transfer method |

### Settings S (T4.54-T4.58) — +10 hrs

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T4.54 | Change history viewer: settings_logs entries, who changed what when | P2 | 1.5 hrs | T2.180, T2.181 | TODO | Needs settings audit trail |
| T4.55 | Configuration preview: "3 appointments affected by this change" | P2 | 2 hrs | — | TODO | |
| T4.56 | Multi-location support: locations collection, per-location config, location selector | P3 | 4-5 hrs | — | TODO | Multi-tenant precursor |
| T4.57 | Configuration import/export: backup/restore as JSON | P3 | 1 hr | — | TODO | |
| T4.58 | Feature flags management: featureFlags object, Settings toggles, component checks | P2 | 1.5 hrs | — | TODO | |

### Monitor S (T4.59-T4.63) — +6.5 hrs

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T4.59 | A- tier tasks: upcoming preview, animation, TV readability | P2 | 1.5 hrs | T2.273-T2.275 | TODO | Rollup of T2.273 + T2.274 + T2.275 — no additional work beyond those tasks. Mark done when all three ship. |
| T4.60 | Multi-room display mode: /monitor?room=consult1, department-filtered | P3 | 2 hrs | — | TODO | |
| T4.61 | Estimated individual wait per patient in upcoming list | P2 | 1 hr | T4.6 | TODO | Uses forecasting engine |
| T4.62 | Clinic information carousel: idle-mode content from clinic_settings | P3 | 1.5 hrs | — | TODO | |
| T4.63 | Weather + clock display: ambient info, OpenWeatherMap API | P3 | 30 min | — | TODO | Low priority polish |

### Expenses S (T4.64-T4.68) — +10.5 hrs

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T4.64 | Receipt/attachment scanning: Firebase Storage, camera capture, thumbnail | P2 | 2 hrs | — | TODO | Blaze recommended |
| T4.65 | Recurring expenses: recurring_expenses collection, auto-create on due date | P2 | 2 hrs | Blaze | TODO | CF for auto-create |
| T4.66 | Budget tracking: per-category monthly budgets, actual vs budget bars | P2 | 2 hrs | — | TODO | |
| T4.67 | Expense approval workflow: pending → approved → paid, admin-only approve | P3 | 3 hrs | — | TODO | Multi-user workflow |
| T4.68 | Year-end expense report: 12 months × N categories, totals, CSV/PDF export | P2 | 1.5 hrs | — | TODO | BIR filing support |

### Login S (T4.69-T4.73) — +5 hrs 10 min

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T4.69 | Multi-factor authentication: Firebase MFA, phone-based second factor | P2 | 1.5 hrs | Blaze | TODO | |
| ~~T4.70~~ | ~~Forgot Password flow~~ | — | — | — | — | ABSORBED into T2.277 (identical scope, T2.277 bumped to P1) |
| T4.71 | Biometric login: expo-local-authentication for mobile + admin, secure token storage | P2 | 1.5 hrs | — | TODO | Covers both admin and mobile (absorbs T4.77) |
| T4.72 | Session timeout: configurable idle detection, warning modal, auto-signout | P1 | 1 hr | — | TODO | Security requirement |
| T4.73 | Login audit log: login_logs collection, IP/userAgent, success/failure tracking | P2 | 1 hr | — | TODO | |

### Mobile App S (T4.74-T4.80) — +13.5 hrs

| ID | Name | Priority | Effort | Depends On | Status | Notes |
|---|---|---|---|---|---|---|
| T4.74 | Offline support: Firestore persistence, offline indicator, queued writes | P1 | 4-5 hrs | — | TODO | Major UX improvement |
| T4.75 | Push notifications for all appointment lifecycle events: deploy existing CF | P1 | 2 hrs | Blaze | TODO | CF already written |
| T4.76 | Dark mode: DARK_COLORS in mobileTokens, useColorScheme detection | P2 | 3-4 hrs | T2.434 | TODO | Needs mobileTokens.js |
| ~~T4.77~~ | ~~Biometric login~~ | — | — | — | — | ABSORBED into T4.71 |
| T4.78 | In-app appointment rescheduling: date/slot picker, rescheduleReason | P2 | 2 hrs | — | DONE | Reschedule mode in BookAppointment.js. Single + group support (Amendment 1). Required reason (Amendment 2). JIT capacity check, auditReasons, scheduledDateStr fix. |
| T4.79 | Pet photo upload and display: Firebase Storage, camera/gallery picker | P3 | 1.5 hrs | — | TODO | |
| T4.80 | Haptic feedback on key interactions: expo-haptics | P3 | 30 min | — | TODO | Polish |

---

## Phase 4 Summary

| Module | Tasks | Effort | Key Dependencies |
|---|---|---|---|
| Dashboard | T4.1-T4.4 | 7.5 hrs | T2.315, T2.320, T2.333 |
| Queue | T4.5-T4.10 | 13 hrs | T2.214, T2.281, T2.331, T2.442 |
| ClinicalWorkspace | T4.11-T4.17 | 17 hrs | T2.32, T2.442, T2.461 |
| POSModal | T4.18-T4.23 | 12 hrs | T2.101, T2.102, T2.105, Blaze |
| Records | T4.24-T4.28 | 10 hrs | T2.57, T2.71, T2.75, T2.130 |
| Patients/EMR | T4.29-T4.34 | 11 hrs | T2.134, T2.135, T2.460, Blaze |
| Services | T4.35-T4.38 | 7 hrs | T2.301 |
| Inventory | T4.39-T4.43 | 10-12 hrs | T3.21-T3.25 |
| Staff | T4.44-T4.48 | 11-12 hrs | Blaze, T3.40, T3.42 |
| Sales | T4.49-T4.53 | 9.5 hrs | T2.137, T2.141, T2.301, T4.21 |
| Settings | T4.54-T4.58 | 10 hrs | T2.180, T2.181 |
| Monitor | T4.59-T4.63 | 6.5 hrs | T2.273-T2.275, T4.6 |
| Expenses | T4.64-T4.68 | 10.5 hrs | Blaze |
| Login | T4.69-T4.73 | 5 hrs 10 min | T2.277, Blaze |
| Mobile | T4.74-T4.80 | 13.5 hrs | T2.434, Blaze |
| **Total** | **T4.1-T4.80 (3 absorbed)** | **~154 hrs** | |
