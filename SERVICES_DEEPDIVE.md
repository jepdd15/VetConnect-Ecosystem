# Services Module Deep Dive

> **Target files:** `VetConnect-Admin/src/features/Services/` (6 files, 1,347 LOC, commit `9d1f662`)
> **Companion documents:** [ECOSYSTEM_ARCHITECTURE_REPORT.md](ECOSYSTEM_ARCHITECTURE_REPORT.md), [INVENTORY_DEEPDIVE.md](INVENTORY_DEEPDIVE.md), [CLINICAL_WORKSPACE_DEEPDIVE.md](CLINICAL_WORKSPACE_DEEPDIVE.md)
> **Audit method:** 3 codebase-architecture-researcher sub-agents in parallel (core files, components, modals), each performing forensic file-level analysis with cross-reference tracing against ClinicalWorkspace.jsx, POSModal.jsx, WalkInModal.jsx, Queue.jsx, useBookingEngine.js, and resolveTieredPrice.js.

---

## Module Architecture

```
Services/
├── Services.jsx                          (224 lines) — Page orchestrator: toolbar, tabs, filters, modal wiring
├── hooks/
│   └── useServices.js                    (161 lines) — Data layer: 3 listeners, CRUD, field diff engine, audit logging
├── components/
│   ├── ServiceTable.jsx                  (268 lines) — Sortable table with expandable SOP rows
│   └── ServiceActivityLog.jsx            (210 lines) — Global audit trail (service_logs, real-time, limit 300)
└── modals/
    ├── ServiceFormModal.jsx              (359 lines) — Create/edit form with tiered pricing + linked products
    └── ServiceLogModal.jsx               (125 lines) — Per-service audit trail (one-shot)
```

### Component Connection Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Services.jsx (orchestrator)                    │
│  9 useState hooks + useServices() hook                               │
│                                                                      │
│  useServices() ──────────────────────────────────────────────┐       │
│    ├── services[]       (onSnapshot: full collection)        │       │
│    ├── inventory[]      (onSnapshot: for linkedProducts)     │       │
│    ├── departments[]    (onSnapshot: for dept picker)        │       │
│    ├── loading          (NOT consumed by Services.jsx)       │       │
│    ├── saveService      (create + update with diff audit)    │       │
│    ├── archiveService   (soft-delete, NO appointment check)  │       │
│    ├── restoreService   (un-archive, doesn't clear archivedAt)│      │
│    └── removeService    (hard delete, audit-first)           │       │
│                                                              │       │
│  Tab 0: ServiceTable ─── filteredServices, 5 action callbacks│       │
│  Tab 1: ServiceActivityLog ── (self-contained, 0 props)      │       │
│                                                              │       │
│  Modals: ServiceFormModal, ServiceLogModal                   │       │
└──────────────────────────────────────────────────────────────────────┘

                  EXTERNAL CONSUMERS OF services COLLECTION
┌──────────────────────────┐    ┌────────────────────────────────────────┐
│  useBookingEngine.js     │    │  ClinicalWorkspace.jsx                 │
│  Reads: duration,        │    │  Reads: name (lookup), linkedProducts, │
│    bufferTime, department,│    │    linkedProduct (fallback)            │
│    isArchived            │    │                                        │
└──────────────────────────┘    │  POSModal.jsx                          │
┌──────────────────────────┐    │  Reads: name (lookup), linkedProducts  │
│  WalkInModal.jsx         │    │                                        │
│  Reads: name, department,│    │  Queue.jsx                             │
│    duration, price,      │    │  Reads: isInpatient (confinement)      │
│    isEmergency, isWalkIn │    └────────────────────────────────────────┘
└──────────────────────────┘
```

---

## Firestore Read/Write Paths

### useServices.js — 3 Listeners, 4 Write Functions

| Operation | Collection | Mechanism | Purpose |
|---|---|---|---|
| **Read** (real-time) | `services` | `onSnapshot` (full, no filter) | Service catalog |
| **Read** (real-time) | `inventory` | `onSnapshot` (full) | linkedProducts picker |
| **Read** (real-time) | `departments` | `onSnapshot` (sorted by name) | Department dropdown |
| **Write** (create) | `services` | `addDoc` | New service |
| **Write** (update) | `services/{id}` | `updateDoc` | Edit service |
| **Write** (archive) | `services/{id}` | `updateDoc` | `isArchived: true` |
| **Write** (restore) | `services/{id}` | `updateDoc` | `isArchived: false` |
| **Write** (delete) | `services/{id}` | `deleteDoc` | Hard delete |
| **Write** (audit) | `service_logs` | `addDoc` | Every mutation logged |

### ServiceActivityLog.jsx — 1 Listener

| Operation | Collection | Mechanism |
|---|---|---|
| **Read** (real-time) | `service_logs` | `onSnapshot`, `orderBy timestamp desc`, `limit(300)` |

### ServiceLogModal.jsx — 1 One-Shot Query

| Operation | Collection | Mechanism |
|---|---|---|
| **Read** (one-shot) | `service_logs` | `getDocs`, `where serviceId == item.id`, `orderBy timestamp desc` |

---

## Service Document Schema (as written by saveService)

```js
// useServices.js:101-112
const payload = {
  ...formData,                            // spreads ALL form fields
  price:        Number(formData.price) || 0,
  duration:     Number(formData.duration) || 30,
  bufferTime:   Number(formData.bufferTime) || 0,
  department:   departmentName,
  category:     departmentName,            // legacy backward-compat key
  linkedProducts,                          // array of inventory product IDs
  linkedProduct: linkedProducts[0] || '',  // singular backward-compat
  hasTieredPricing: Boolean(formData.hasTieredPricing),
  pricingTiers:    formData.pricingTiers || [],
};
```

**Fields written:** `name`, `department`, `category`, `price`, `duration`, `bufferTime`, `targetSpecies`, `description`, `isWalkIn`, `isInpatient`, `isEmergency`, `linkedProducts`, `linkedProduct`, `hasTieredPricing`, `pricingTiers`

**Fields NOT written (planned):** `isScPwdEligible` (T2.105), `dischargePolicy` (T2.33)

**Fields NOT written (gap):** `createdAt`, `updatedAt` — the service doc has no temporal metadata (archive/restore have timestamps, create/update don't)

---

## Audit Log Schema (service_logs)

```js
// useServices.js:77-92 — logServiceEvent
{
  serviceId:   string,
  serviceName: string,
  action:      "CREATED" | "UPDATED" | "ARCHIVED" | "RESTORED" | "DELETED",
  reason:      string,      // e.g., "Service configuration updated"
  changes:     string,      // pipe-delimited diff summary or empty
  userId:      string,
  userName:    string,
  timestamp:   serverTimestamp()
}
```

**Log schema consistency:** Confirmed consistent between writer (`logServiceEvent`) and readers (`ServiceActivityLog`, `ServiceLogModal`). No field name mismatch — unlike the Inventory `GlobalActivityLog` P0 bug.

---

## Field Diff Engine

**Tracked fields** in `FIELD_LABELS` (useServices.js:7-17):
- `name`, `department`, `price` (currency format), `duration`, `bufferTime`, `targetSpecies`, `description`, `isWalkIn`, `isInpatient`, `isEmergency`

**Custom diff blocks:**
- `linkedProducts` (L36-39): Compares arrays, reports added/removed product IDs with backward-compat migration from singular `linkedProduct`
- `hasTieredPricing` (L42-44): Reports ON/OFF toggle only

**NOT tracked by diff:**
- Individual pricing tier value changes (`pricingTiers[]` array contents)
- `category` (legacy alias, always mirrors `department`)

---

## Consumer Cross-Reference

| Consumer | Lookup Method | Fields Accessed | All Written? |
|---|---|---|---|
| `useBookingEngine.js` | Filters by `!isArchived` | `duration`, `bufferTime`, `department`, `category` | Yes |
| `ClinicalWorkspace.jsx:494` | `servicesList.find(s => s.name === patient.primaryService)` | `linkedProducts`, `linkedProduct` (fallback) | Yes |
| `POSModal.jsx:52` | `servicesList.find(s => s.name === patient.serviceType)` | `linkedProducts`, `linkedProduct` (fallback) | Yes |
| `WalkInModal.jsx:263` | `servicesList.find(item => item.name === svcName)` | `name`, `department`, `duration`, `price`, `isEmergency` | Yes |
| `Queue.jsx:552` | `servicesList.find(s => s.name === p.primaryService)` | `isInpatient` | Yes |
| `resolveTieredPrice.js` | Direct call with service object | `hasTieredPricing`, `pricingTiers`, `price` | Yes |

**Confirmed: No field name mismatches between writer and any consumer.**

---

## Bugs Found — Full Inventory

### P1 — High

#### BUG 1: No active-appointment guard before archive or delete

**Location:** `useServices.js:126-148`

```js
const archiveService = async (id) => {
    await updateDoc(doc(db, "services", id), {
      isArchived: true, archivedAt: Timestamp.now()
    });
    // NO check for active appointments referencing this service
```

Archiving or deleting a service that has `pending`, `confirmed`, or `in-consult` appointments breaks:
- `ClinicalWorkspace.jsx:494` — `servicesList.find(s => s.name === patient.primaryService)` returns `undefined` (archived services filtered out by Queue.jsx L1126)
- `POSModal.jsx:52` — linked product hydration fails
- `Queue.jsx:552` — inpatient confinement suggestion fails silently

Compare to Inventory's `ConfirmDeleteModal` which (per T2.161) is scoped to add an impact check. Services has no equivalent.

#### BUG 2: Hard delete available to all users — no admin guard

**Location:** `ServiceTable.jsx:227-231`

```jsx
<Tooltip title="Permanently Delete" arrow>
  <IconButton size="small" onClick={() => onDelete(row.id, row.name)}
    sx={{ color: '#D32F2F' }}>
    <DeleteIcon fontSize="small" />
  </IconButton>
</Tooltip>
```

The permanent delete button renders for every service row regardless of user role or archive state. `ServiceFormModal` imports `useUser()` and destructures `isAdmin` (L9, L21) but **never uses it**. `ServiceTable` receives no role information. Any authenticated user can permanently delete service records.

#### BUG 3: Negative price, duration, and bufferTime accepted

**Location:** `ServiceFormModal.jsx:85-95`

```js
// L85-86: only checks empty, not negative
if (!formData.name || formData.price === '') {
  return showToast("Service Name and Base Price are required.", "error");
}

// L93-95: parseFloat/parseInt allow negatives
price: parseFloat(formData.price) || 0,      // parseFloat("-100") = -100 (truthy)
duration: parseInt(formData.duration) || 30,  // parseInt("-5") = -5 (truthy)
bufferTime: parseInt(formData.bufferTime) || 0,
```

Negative prices corrupt billing. Negative duration could produce invalid slot calculations in `useBookingEngine`. No `min` attribute on the duration or buffer TextFields.

---

### P2 — Medium

#### BUG 4: Pricing tier content changes not tracked by audit diff

**Location:** `useServices.js:42-44`

```js
if (Boolean(before.hasTieredPricing) !== Boolean(after.hasTieredPricing)) {
  changes.push(`Tiered Pricing: "${before.hasTieredPricing ? 'ON' : 'OFF'}" → "${after.hasTieredPricing ? 'ON' : 'OFF'}"`);
}
```

Only the ON/OFF toggle is diffed. Changing a tier from "0-10kg: P500" to "0-10kg: P800" produces "Minor details updated (no tracked field changed)" — a misleading audit entry for a pricing change.

#### BUG 5: No tier overlap/gap validation

**Location:** `ServiceFormModal.jsx:84-98`

```js
if (formData.hasTieredPricing && formData.pricingTiers.length === 0) {
  return showToast("Add at least one pricing tier...", "error");
}
// NO overlap, gap, or inversion validation
```

Users can create overlapping tiers (0-10kg and 5-15kg) — `resolveTieredPrice` returns first match, silently shadowing later tiers. Weight gaps mean some pets get no tier match and fall to base price (which is P0 when tiered is enabled since the base field is disabled). `minWeight > maxWeight` within a tier never matches anything.

#### BUG 6: No `createdAt`/`updatedAt` on service documents

**Location:** `useServices.js:95-123`

The `saveService` function writes to `services` but never sets `createdAt` (on create) or `updatedAt` (on update). The audit log gets `serverTimestamp()`, but the service doc has no temporal metadata. `archivedAt` and `restoredAt` exist — inconsistency.

#### BUG 7: `loading` state returned but never consumed

**Location:** `useServices.js:53,160` vs `Services.jsx:20`

```js
// useServices.js returns loading
return { services, inventory, departments, loading, saveService, ... };

// Services.jsx does NOT destructure loading
const { services, inventory, departments, saveService, ... } = useServices();
```

Empty state flash during initial fetch. Same pattern as Inventory (T2.153).

#### BUG 8: `linkedProducts` not displayed in ServiceTable

The form manages them, the hook diffs them for audit, but the table shows zero indication of which services have auto-bundled inventory items. A service with 3 linked products looks identical to one with none.

#### BUG 9: No pagination in ServiceTable

All services rendered via `.map()` at L123. No `TablePagination`, no page state. Same pattern as other modules.

#### BUG 10: No filtering in ServiceActivityLog

No action type filter, date range picker, or service name search. Hard limit of 300 docs with no truncation indicator. Event count chip shows "300 events" as if that's the complete total.

#### BUG 11: `reason` field not displayed in ServiceLogModal

**Location:** `ServiceLogModal.jsx:91-94`

```jsx
{log.changes && (
  <Typography variant="body2" color="textSecondary" ...>
    {log.changes}
  </Typography>
)}
// log.reason is NEVER rendered
```

The hook writes both `reason` and `changes` to every `service_logs` entry. The modal only renders `changes`. For ARCHIVED/RESTORED actions, `changes` is always empty — user sees no context beyond the action label.

---

### P3 — Polish

#### BUG 12: Dead code — `clinicalFlatStyle`

`Services.jsx:74-79` computes style object, passes to `ServiceTable` as prop (L186). `ServiceTable.jsx:22` destructures it but never references it in JSX.

#### BUG 13: Dead code — `useNavigate`

`ServiceFormModal.jsx:8,22` imports and instantiates `useNavigate()`. `navigate` never called.

#### BUG 14: Dead code — `isAdmin` from `useUser()`

`ServiceFormModal.jsx:9,21` destructures `isAdmin` from `useUser()`. Never used for any gating logic. Possible abandoned role gate.

#### BUG 15: Dead code — `CircleIcon` import

`ServiceTable.jsx:12` imports `CircleIcon`. Never rendered.

#### BUG 16: `isWalkIn !== false` shows Walk-In tag for legacy services

**Location:** `ServiceTable.jsx:192`

```jsx
{row.isWalkIn !== false && <Chip label="Walk-In" ... />}
```

Services that never had `isWalkIn` set (legacy data, field is `undefined`) show the Walk-In tag because `undefined !== false` is `true`. Intentionally permissive per the form's default (`isWalkIn: true`), but may confuse staff for old services.

#### BUG 17: Price sort ignores tiered pricing

**Location:** `ServiceTable.jsx:52`

```js
valA = parseFloat(a.price) || 0;
```

Sorts by flat `price` even for tiered services. A service displayed as "P150 - P500" sorts by its flat base price, not the tier range.

#### BUG 18: `ACTION_CONFIG` duplicated

`ServiceActivityLog.jsx:16-22` and `ServiceLogModal.jsx:16-22` both define action type color/icon mappings with slightly different shapes. Should be extracted to a shared constant.

#### BUG 19: `restoreService` doesn't clear `archivedAt`

**Location:** `useServices.js:135-141`

Sets `isArchived: false`, `restoredAt: Timestamp.now()`. Both `archivedAt` and `restoredAt` coexist after restore. Same pattern as Inventory (T2.171).

#### BUG 20: ServiceLogModal has no query limit

`getDocs` with no `limit()`. Unbounded for heavily-edited services.

#### BUG 21: Zero design token imports across all 4 child components

Only `Services.jsx` imports `FONT` and `COLORS`. The four children (`ServiceTable`, `ServiceActivityLog`, `ServiceFormModal`, `ServiceLogModal`) import zero from `designTokens.js`. ~60+ hardcoded hex values total.

#### BUG 22: `borderRadius: 1` on Chips

`ServiceActivityLog.jsx:126,179,200` and `ServiceFormModal.jsx:297`. Design guide mandates `borderRadius: 0`.

---

## Feature Completeness Matrix

| Feature | Present? | Quality | Notes |
|---|---|---|---|
| Service CRUD | Yes | Good | Create, edit, archive, restore, hard delete |
| Tiered pricing | Yes | Good | Weight-based tiers with min/max/price, toggle, UI |
| Linked products | Yes | Good | Multi-select from inventory, backward compat singular |
| Department routing | Yes | Good | Dropdown from departments collection, legacy `category` alias |
| Species targeting | Yes | Good | Dog/Cat/Universal filter in booking + table |
| Operational tags | Yes | Good | Walk-In, Inpatient, Emergency toggles |
| Expandable SOP | Yes | Good | Description in collapse row |
| Field diff audit | Yes | **Partial** | Tracks 10 fields + linkedProducts toggle, but NOT tier content changes |
| Audit trail (global) | Yes | **Partial** | Real-time, limit 300, no filtering/search/pagination |
| Audit trail (per-service) | Yes | **Partial** | One-shot, no limit, `reason` field not displayed |
| Appointment guard on archive | **No** | — | Can archive services with active appointments |
| Role gating on delete | **No** | — | Any user can permanently delete |
| Validation | **Partial** | — | Name + price required, but no negative/overlap/gap guards |
| `isScPwdEligible` | **Not implemented** | — | T2.105 fully unimplemented |
| `dischargePolicy` | **Not implemented** | — | T2.33 fully unimplemented |
| Loading state | **No** | — | `loading` returned by hook but never consumed |
| Design token compliance | **Poor** | — | 60+ hardcoded colors across 4 child components |

---

## Proposed Tasks

| ID | Name | Priority | Effort | Notes |
|---|---|---|---|---|
| T2.191 | Service archive/delete: add active-appointment guard. Query `appointments` where `services[].name` matches and status is non-terminal. Block with count feedback. | **P1** | 30 min | Archiving breaks ClinicalWorkspace, POSModal, Queue |
| T2.192 | Service delete: add `isAdmin` guard. Only show delete button for admin users. Remove dead `isAdmin` destructure from ServiceFormModal. | **P1** | 10 min | Any user can permanently delete services |
| T2.193 | ServiceFormModal: add negative validation for price (`< 0`), duration (`<= 0`), bufferTime (`< 0`). Add `inputProps={{ min: 0 }}` on all numeric fields. | **P1** | 10 min | Negative values corrupt billing + scheduling |
| T2.194 | Audit diff: track individual pricing tier changes (minWeight, maxWeight, price per tier). Produce "Tier 1: P500 → P800" in diff summary. | **P2** | 30 min | Pricing changes invisible in audit trail |
| T2.195 | Tier validation: check for overlaps (ranges intersect), gaps (ranges don't cover continuous spectrum), and inversions (min > max). Show validation errors before save. | **P2** | 30 min | Silent shadowing and fall-through to zero base price |
| T2.196 | Add `createdAt: serverTimestamp()` on create, `updatedAt: serverTimestamp()` on update to service documents. | **P2** | 5 min | No temporal metadata on service docs |
| T2.197 | Pass `loading` from useServices to ServiceTable. Add loading skeleton. | **P2** | 10 min | Empty state flash during initial fetch |
| T2.198 | ServiceTable: add `linkedProducts` display — small badge or chip count showing "3 linked products" per row. | **P2** | 15 min | Auto-bundled services indistinguishable from non-bundled |
| T2.199 | ServiceLogModal: display `log.reason` alongside `log.changes`. Show reason for all action types. | **P2** | 5 min | ARCHIVED/RESTORED actions show no context |
| T2.200 | Delete dead code: `clinicalFlatStyle` (Services.jsx + ServiceTable prop), `useNavigate` (ServiceFormModal), `CircleIcon` (ServiceTable). Keep `isAdmin` import in ServiceFormModal for T2.192. | **P3** | 5 min | |
| T2.201 | `restoreService`: clear `archivedAt` field on restore (use `deleteField()`). | **P3** | 5 min | Both timestamps coexist — same as Inventory T2.171 |
| T2.202 | Extract `ACTION_CONFIG` to shared `src/utils/serviceLogConfig.js`. Import in both ServiceActivityLog and ServiceLogModal. | **P3** | 10 min | Duplicated constant |
| T2.203 | ServiceActivityLog: add filtering (action type, date range, service name search) + pagination. | **P3** | 2 hrs | Same scope as Inventory GlobalActivityLog T2.170 |
| T2.204 | ServiceLogModal: add `limit(500)` to query. | **P3** | 2 min | Unbounded fetch |
| T2.205 | Design token compliance: import COLORS/TYPE across all 4 child components. Replace 60+ hardcoded hex values. | **P3** | 1 hr | |
| T2.206 | ServiceTable: add pagination. | **P3** | 15 min | |
| T2.207 | CLAUDE.md fix: change `tieredPricing` to `pricingTiers` + `hasTieredPricing` in the service field documentation. | **P3** | 2 min | Documentation inaccuracy |

---

## What the Module Does Well

1. **Field diff engine** — `diffFields` (useServices.js:7-46) produces human-readable audit summaries: "Price: ₱500 → ₱800 | Duration: 30min → 45min". Tracks 10 fields plus linkedProducts changes with backward-compat migration. Sophisticated for a capstone.

2. **linkedProducts backward compatibility** — dual-write pattern (`linkedProducts` array + `linkedProduct` singular) at useServices.js:108-109. All consumers use the fallback pattern `linkedProducts || (linkedProduct ? [linkedProduct] : [])`. Clean migration without data migration scripts.

3. **Tiered pricing UI** — full weight-based tier management with add/remove/edit per tier, base price disabled when tiered is on, "set Max to 0 for unlimited" hint, and price range display in table. `resolveTieredPrice` utility handles the resolution cleanly.

4. **Expandable SOP rows** — ServiceTable's collapse section shows service description as "SOP / Clinical Instructions." Good use of MUI Collapse for progressive disclosure without a modal.

5. **Audit-first hard delete** — `removeService` writes the audit log BEFORE `deleteDoc` (useServices.js:147-148). If the delete fails, the log still records the intent. Comment calls it "admin emergency use."

6. **Species filter includes Universal** — Services.jsx L45: `matchSpecies = filterSpecies === 'All' || s.targetSpecies === filterSpecies || s.targetSpecies === 'Universal'`. Universal services correctly appear in both Dog and Cat filtered views.

7. **Consistent log schema** — No field name mismatch between `logServiceEvent` writer and `ServiceActivityLog`/`ServiceLogModal` readers. The Inventory module's P0 refund log bug does not exist here.

---

## Cross-Cutting Findings

### Shared patterns with other modules

| Pattern | Also found in | Existing task |
|---|---|---|
| No archive appointment guard | Inventory ConfirmDeleteModal | T2.161 |
| No role gate on delete | Inventory (scrubDatabase T2.154), Settings (T2.177) | New finding for Services |
| `loading` not consumed | Inventory (T2.153) | New finding for Services |
| `restoreItem` doesn't clear `archivedAt` | Inventory (T2.171) | Same pattern |
| No pagination in table | Inventory (InventoryTable), Sales (DataGrid hideFooter) | Multiple modules |
| Zero design token imports in children | Inventory (all 7 files), Sales (EodSummary) | Systemic |
| Activity log: no filtering, limit 300 | Inventory GlobalActivityLog (T2.170) | Same pattern |

---

## Files Fully Audited

| File | Lines | Key Findings |
|---|---|---|
| Services.jsx | 224 | Dead clinicalFlatStyle, loading not consumed, filter logic correct, species includes Universal |
| useServices.js | 161 | No appointment guard, no createdAt/updatedAt, tier content not diffed, audit-first delete (good), consistent log schema |
| ServiceTable.jsx | 268 | Dead CircleIcon + clinicalFlatStyle prop, linkedProducts not displayed, no pagination, price sort ignores tiers, Walk-In tag for legacy |
| ServiceActivityLog.jsx | 210 | No filtering, limit 300, consistent schema (good), borderRadius on Chips, ACTION_CONFIG duplicated |
| ServiceFormModal.jsx | 359 | Dead useNavigate + isAdmin, no negative validation, no tier overlap check, linkedProducts migration (good), tiered pricing UI (good) |
| ServiceLogModal.jsx | 125 | reason not displayed, no query limit, ACTION_CONFIG duplicated, no normalizeLog (not needed currently) |
