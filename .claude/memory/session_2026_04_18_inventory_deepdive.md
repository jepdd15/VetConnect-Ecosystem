---
name: Session 2026-04-18 — Inventory Module Deep Dive
description: Inventory module audit (8 files, 1978 LOC), 28 new tasks T2.149-T2.176 + 10 Phase 3 tasks T3.21-T3.30 + dispensing tasks T2.188-T2.189/T3.36-T3.39, 9 decisions locked including allergen safety system and dispensing labels
type: project
originSessionId: 364ea246-536e-4b43-9b69-773b8596dab0
---
## Inventory Module Deep Dive (2026-04-18)

Companion file: INVENTORY_DEEPDIVE.md (900+ lines)

### Key Findings
- 2 P0 bugs: adjustStock can go negative (no transaction), refund log schema incompatible with GlobalActivityLog
- 11 P1 bugs: reserve/release no guards, batches ignored by adjustStock, hard delete before log, loading not passed, no scrub role gate, category not validated, negative costPrice
- 15 P2 bugs: archive doesn't release reserved, no reserve/release audit, normalizeLog negation wrong, optimistic closes, timestamp inconsistency, quick-add bypasses hook, etc.
- 10 P3 bugs: 100+ hardcoded colors, dead code, borderRadius, batch size limit, stale data

### Decisions Locked (9 total)
1. **isMedicine denormalization (T2.167)**: Write to inventory items on create/update from category flag. Category stays source of truth. Queue.jsx join stays as fallback. scrubDatabase re-derives.
2. **isMedicine override (T2.167 detail)**: Derived with optional per-item override toggle. Label communicates dispensing consequence.
3. **Batch-aware adjustments (T2.152)**: Optional batch fields on positive adjustments only. Flat decrement for negative.
4. **Batch-aware negative adjustments (T2.174)**: Scoped as P3 future task. T2.152 ships first.
5. **GlobalActivityLog filtering (T2.170)**: Full scope — action type, date range, product search, user filter, paginated queries. P2 at 3 hrs. Depends on T2.150.
6. **No-expiry refund guard (T2.147 addendum)**: If no batchSource AND no batches[], just increment stock without creating batch entry.
7. **Allergen safety system (T2.175)**: Option C (route allergyTags items through dispensing) + Approach 2 (cart-add time check in ClinicalWorkspace). allergyTags on ALL products, not gated by isMedicine. Non-medicine products can trigger allergic reactions.
8. **Dispensing labels (T2.176)**: Client-facing medication labels at dispensing time. Internal ward labels as T3.28 (late).
9. **Structured allergies (T3.29)**: Tier 2 coded drug classes scoped as Phase 3. T2.175 keyword-based matching ships first as Phase 2.

### New Tasks: T2.149-T2.176 (28 Phase 2 tasks) + T3.21-T3.30 (10 Phase 3 tasks)
- P0: T2.149 (adjustStock transaction), T2.150 (refund log schema normalization)
- P1: T2.151-T2.155 (reserve/release guards, batch-aware adjust, loading state, scrub role gate, form validation)
- P2: T2.156-T2.167 + T2.170 + T2.175-T2.176 (reserved display, optimistic closes, form reset, archive reserved release, delete order, impact check, quick-add fix, log modal fixes, tab UX, batch visibility, KPI expiry, isMedicine, global log filtering, allergen system, dispensing labels)
- P3: T2.168-T2.169 + T2.171-T2.174 (dead code, design tokens, restore clear, negative margins, seed idempotency, batch-aware negative adjustments)
- Phase 3: T3.21-T3.30 (reorder alerts, barcode scanning, valuation report, expiry disposal, supplier directory, adjustment types, export, ward labels, structured allergies, barcode-before-admin)

### Dispensing verification assessment
DispensingVerificationDialog.jsx is functional prototype — checkbox confirmation gate works, but lacks: stock verification at dispensing time, batch/lot selection, partial dispensing, dosage/concentration display, interaction/contraindication check, hold-for-vet-review option, services mixed with products in checklist, no print/label capability.

### Audit system assessment (honest)
- Architecture: B+ (sound conceptual separation — pulse for patients, inventory_logs for products, sales for money)
- Execution: C+ (inconsistent coverage, field name fragmentation, no unified schema validation, write-then-pray pattern, no cross-system correlation)
- After all scoped tasks ship: A- (95% pulse coverage, 100% inventory_logs coverage, 100% seal coverage)
- Unaddressed gaps (no tasks yet): cross-system correlation ID, reserve/release not logged, auditReason overwritten not appended, category changes unaudited, clinic settings changes unaudited, dispensing details not in pulse, draft save/resume unaudited

### 7 distinct note systems in current codebase (all live, none planned)
1. Appointment `notes` — client booking reason + staff triage prefix (overloaded)
2. SOAP fields — clinical documentation (immutable)
3. `auditReason` — terminal transition justification (Firestore rule enforced)
4. clinicalPulse `note` — per-event context (append-only)
5. `staffNotes` — CRM internal client memos (race condition T2.125)
6. Discharge summary — client-safe visit instructions
7. Inventory log `reason` — stock adjustment justification

### Cross-cutting: T2.150 overlaps with T2.139 (Sales deep dive) — both touch the same useSalesData refund transaction.set call

### Files Fully Scanned
- Inventory.jsx (414 lines)
- useInventory.js (224 lines)
- InventoryTable.jsx (312 lines)
- GlobalActivityLog.jsx (272 lines)
- ProductFormModal.jsx (427 lines)
- StockAdjustModal.jsx (120 lines)
- InventoryLogModal.jsx (117 lines)
- ConfirmDeleteModal.jsx (92 lines)
