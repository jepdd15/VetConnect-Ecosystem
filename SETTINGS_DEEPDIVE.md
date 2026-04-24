# Settings.jsx Deep Dive

> **Target file:** `VetConnect-Admin/src/pages/Settings.jsx` (733 lines, commit `9d1f662`)
> **Companion documents:** [ECOSYSTEM_ARCHITECTURE_REPORT.md](ECOSYSTEM_ARCHITECTURE_REPORT.md), [INVENTORY_DEEPDIVE.md](INVENTORY_DEEPDIVE.md)
> **Audit method:** Direct forensic analysis with cross-reference tracing against useClinicSettings.js, useBookingEngine.js, Queue.jsx, Inventory.jsx, and all consumers of `clinic_settings/general`.

---

## Module Architecture

```
Settings.jsx (733 lines) — Single-page admin configuration panel
├── Pillar 1: Operating Hours (openHour, closeHour, workingDays, closedDates, lunch)
├── Pillar 2: Client Limitations (minSlotInterval, advanceNoticeMins, maxFutureBookingDays, maxPetsPerBooking)
├── Pillar 3: Capacity & Triage (maxCages, autoNoShowMins, trafficModerate, trafficHigh)
├── Pillar 4: Departments (CRUD on `departments` collection)
└── Pillar 5: Inventory Categories (CRUD on `inventory_categories` collection)
```

### Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Settings.jsx                                  │
│                                                                      │
│  5 onSnapshot listeners (mount-only):                                │
│    ├── clinic_settings/general  → settings state (14+ fields)        │
│    ├── departments              → departments state                  │
│    ├── inventory_categories     → invCategories state                │
│    ├── services                 → allServices (usage count only)     │
│    └── users                    → allStaff (usage count only)        │
│                                                                      │
│  Writes:                                                             │
│    ├── setDoc(clinic_settings/general, merge:true) — "Save Config"   │
│    ├── addDoc(departments)    — immediate on "Add"                   │
│    ├── deleteDoc(departments) — immediate on chip delete             │
│    ├── addDoc(inventory_categories) — immediate on "Add"             │
│    └── deleteDoc(inventory_categories) — immediate on chip delete    │
│                                                                      │
│  NO useUser() — NO role check — NO audit trail on CRUD              │
└──────────────────────────────────────────────────────────────────────┘
                    │
                    │ clinic_settings/general consumed by:
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  useClinicSettings.js (singleton onSnapshot, useSyncExternalStore)  │
│    → Queue.jsx, Records.jsx, EndOfDayModal.jsx                     │
│                                                                     │
│  useBookingEngine.js (one-shot getDoc — T2.5 upgrades to onSnapshot)│
│    → BookAppointment.js (mobile slot generation)                   │
│                                                                     │
│  firestore.rules                                                    │
│    → closedDates enforcement on appointment.create                  │
│                                                                     │
│  pulseUtils.js                                                      │
│    → openHour/closeHour for business-hour clock routing             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Firestore Read/Write Paths

### Reads (5 real-time listeners, all on mount)

| # | Collection | Line | Mechanism | Purpose |
|---|---|---|---|---|
| 1 | `clinic_settings/general` | L141 | `onSnapshot` (single doc) | Populate settings form |
| 2 | `departments` | L146 | `onSnapshot` (full collection) | Render department chips |
| 3 | `inventory_categories` | L152 | `onSnapshot` (full collection) | Render category chips |
| 4 | `services` | L158 | `onSnapshot` (full collection) | Department usage count only |
| 5 | `users` | L163 | `onSnapshot` (full collection) | Department usage count only |

All listeners cleaned up at L167: `return () => { unsubSettings(); unsubDepts(); unsubInvCats(); unsubAllServices(); unsubAllStaff(); };`

### Writes

| Operation | Collection | Line | Mechanism | Immediate? | Audit? |
|---|---|---|---|---|---|
| Save all settings | `clinic_settings/general` | L212 | `setDoc` with `{ merge: true }` | On "Save" click | `updatedBy` + `updatedAt` only (no field diff) |
| Add department | `departments` | L228 | `addDoc` | **Immediate** | **None** |
| Delete department | `departments/{id}` | L253 | `deleteDoc` | **Immediate** | **None** |
| Add inv category | `inventory_categories` | L282 | `addDoc` | **Immediate** | **None** |
| Delete inv category | `inventory_categories/{id}` | L295 | `deleteDoc` | **Immediate** | **None** |

---

## Settings Fields Inventory

### Fields written to `clinic_settings/general` on Save (L195-216)

| Field | Type | Default | Validated? | Consumed by |
|---|---|---|---|---|
| `openHour` | number | 8 | Yes (< closeHour) | useClinicSettings → Queue, pulseUtils (business-hour routing) |
| `closeHour` | number | 17 | Yes (> openHour) | useClinicSettings → Queue, pulseUtils |
| `lunchEnabled` | boolean | true | Yes (start < end, within hours) | useBookingEngine (slot generation skips lunch) |
| `lunchStart` | number | 12 | Conditional (if lunchEnabled) | useBookingEngine |
| `lunchEnd` | number | 13 | Conditional (if lunchEnabled) | useBookingEngine |
| `workingDays` | number[] | [0-6] | No | useBookingEngine (slot generation skips non-working days) |
| `closedDates` | string[] | [] | No (only > 365 warning) | useBookingEngine, firestore.rules (appointment create block) |
| `minSlotInterval` | number | 30 | No | useBookingEngine (slot grid step) |
| `advanceNoticeMins` | number | 120 | No | useBookingEngine (TOO_SOON filter) |
| `maxPetsPerBooking` | number | 3 | No | BookAppointment.js (pet selection limit) |
| `maxCages` | number | 5 | No | useClinicSettings → Queue (confinement limit) |
| `trafficModerate` | number | 6 | No | useBookingEngine (busyness level) |
| `trafficHigh` | number | 13 | No | useBookingEngine (busyness level) |
| `maxFutureBookingDays` | number | 30 | No | **DEAD — never consumed** |
| `autoNoShowMins` | number | 30 | No | **DEAD — never consumed** |
| `updatedAt` | Timestamp | — | — | Not consumed (audit only) |
| `updatedBy` | string | — | — | Not consumed (audit only) |

### Dead configuration fields (confirmed via grep)

**`autoNoShowMins`** — UI says "Mins late before Queue displays No-Show button." Grep across entire `VetConnect-Admin/src` returns only Settings.jsx (L115, L202, L509). Queue.jsx and queueColumns.jsx do not read this field. The No-Show button is always visible for confirmed patients regardless of arrival time.

**`maxFutureBookingDays`** — UI says "Future Limit (Days)." Grep across entire `VetConnect/src` returns zero matches. `useBookingEngine.js` does not enforce a maximum booking horizon. Clients can book arbitrarily far into the future.

---

## Validation Analysis

### What's validated (L173-186)

```js
const validateSettings = () => {
    if (settings.openHour >= settings.closeHour) {
        return "Clinic Opening time must be earlier than the Closing time.";
    }
    if (settings.lunchEnabled) {
        if (settings.lunchStart >= settings.lunchEnd) {
            return "Lunch Start must be earlier than the Lunch End.";
        }
        if (settings.lunchStart < settings.openHour || settings.lunchEnd > settings.closeHour) {
            return "Lunch break must fall within clinic operating hours.";
        }
    }
    return null;
};
```

### What's NOT validated

| Field | Risk | What could go wrong |
|---|---|---|
| `minSlotInterval` | **High** | Value of 0 causes infinite loop in useBookingEngine slot generation (divides time range into 0-minute steps) |
| `maxPetsPerBooking` | Medium | Value of 0 blocks all multi-pet bookings. Value of 999 allows absurd bookings. |
| `trafficModerate` vs `trafficHigh` | Medium | If moderate >= high, the busyness system has inverted thresholds — "moderate" would never display |
| `maxCages` | Low | Negative value is nonsensical but wouldn't crash (compared against count) |
| `advanceNoticeMins` | Low | Negative value would make all slots show as "TOO_SOON" |
| `workingDays` | Medium | Empty array means no working days — useBookingEngine would show zero slots every day |
| `closedDates` | Low | No date format validation — manually typed strings could corrupt the array |

---

## Department CRUD Analysis

### Create (L223-231)

```js
const handleAddDepartment = async () => {
    if (!newDepartmentName.trim()) return setToast({...});
    const isDuplicate = departments.some(d => d.name.toLowerCase() === newDepartmentName.trim().toLowerCase());
    if (isDuplicate) return setToast({...});
    await addDoc(collection(db, "departments"), { name: newDepartmentName.trim(), color: newDepartmentColor });
};
```

**Good:** Duplicate check (case-insensitive), name trim, immediate persist.
**Missing:** No audit log, no `createdBy`/`createdAt` fields on the department doc.

### Delete (L234-257)

```js
const handleDeleteDepartment = async (id, name) => {
    const staffCount = allStaff.filter(u =>
        u.role === 'staff' &&
        (Array.isArray(u.departments) ? u.departments.includes(name) : u.department === name)
    ).length;
    const serviceCount = allServices.filter(s => !s.isArchived && (s.department || s.category) === name).length;
    if (staffCount > 0 || serviceCount > 0) {
        return setToast({ message: `Department In Use: Assigned to ${staffCount} staff and ${serviceCount} services. Re-assign them first.` });
    }
    if (window.confirm(`Delete the "${name}" department?`)) {
        await deleteDoc(doc(db, "departments", id));
    }
};
```

**Good:** Usage shield checks staff AND service references before allowing delete. Specific count feedback.
**Missing:** No audit log, `window.confirm` instead of MUI Dialog, no check for active appointments in that department.

---

## Inventory Category CRUD Analysis

### Create (L277-289)

```js
const handleAddInvCategory = async () => {
    if (!newInvCatName.trim()) return setToast({...});
    const isDuplicate = invCategories.some(d => d.name.toLowerCase() === newInvCatName.trim().toLowerCase());
    if (isDuplicate) return setToast({...});
    await addDoc(collection(db, "inventory_categories"), {
        name: newInvCatName.trim(),
        isMedicine: newInvCatIsMedicine
    });
};
```

**Good:** Duplicate check, includes `isMedicine` flag (unlike ProductFormModal quick-add which omits it — T2.162).
**Missing:** No audit log, no `createdBy`/`createdAt`.

### Delete (L292-298)

```js
const handleDeleteInvCategory = async (id, name) => {
    if (window.confirm(`Delete the "${name}" category?`)) {
        await deleteDoc(doc(db, "inventory_categories", id));
    }
};
```

**Missing compared to department delete:**
- **No usage check.** No count of inventory items referencing this category. Deleting "medicine" while 50 items use it silently breaks the Queue.jsx `joinedInventory` isMedicine lookup (L1133-1140), the Inventory.jsx category filter, and ProductFormModal category dropdown.
- No audit log
- `window.confirm` instead of MUI Dialog

---

## Closed Dates — Save Inconsistency

### The problem

Closed dates are managed via local state only:

```js
// L260-268 — handleAddClosedDate
const next = [...existing, newClosedDate].sort();
handleChange('closedDates', next);  // handleChange at L170: setSettings(prev => ({...prev, [field]: value}))

// L271-273 — handleRemoveClosedDate
const next = (settings.closedDates || []).filter(d => d !== dateStr);
handleChange('closedDates', next);
```

Both update LOCAL `settings` state. The actual Firestore write only happens when "Save Configuration" is clicked (L189-220). If the admin adds 5 closed dates and navigates away, all 5 are lost.

Compare:
- **Departments:** `addDoc` → immediate Firestore write on "Add" button click
- **Categories:** `addDoc` → immediate Firestore write on "Add" button click
- **Closed dates:** `setSettings` → local state only, requires explicit Save

There's no `beforeunload` warning, no React Router navigation guard, no visual indicator that unsaved changes exist.

---

## Cross-Reference: useClinicSettings.js

The singleton hook (63 lines) maintains a module-level `onSnapshot` on `clinic_settings/general` for the lifetime of the page. It uses `useSyncExternalStore` with a subscriber set pattern — sophisticated React pattern that eliminates Strict Mode double-mount flicker.

**Key observation:** Settings.jsx has its OWN `onSnapshot` on the same document (L141). Two listeners on the same doc. The useClinicSettings singleton listener runs for the entire app lifetime. Settings.jsx adds a second listener when the page mounts. Both are reading `clinic_settings/general` in real-time. This is redundant but not harmful — Firestore deduplicates identical listeners at the SDK level. Still, Settings.jsx could consume `useClinicSettings()` instead of running its own listener.

---

## Bugs Found — Full Inventory

### P1 — High

#### BUG 1: No role check — any authenticated user can modify clinic settings

**Location:** L89 (entire component)

```js
export default function Settings() {
  // NO useUser() import or call
  // NO isAdmin check
  // Uses auth.currentUser only for updatedBy attribution (L211)
```

Settings.jsx does not import `useUser` from `UserContext`. The Sidebar gates this page as `adminOnly` (cosmetic), but navigating directly to `/settings` works for any authenticated user. All 5 write operations (settings save, 2 department, 2 category) are unguarded.

#### BUG 2: Closed dates — local-only until explicit Save, no unsaved warning

**Location:** L260-273

```js
const handleAddClosedDate = () => {
    // ...
    handleChange('closedDates', next);  // LOCAL STATE ONLY
    setNewClosedDate('');
};
```

Departments and categories persist immediately. Closed dates require "Save Configuration." No `beforeunload` warning. Staff can add dates, see them as chips, think they're saved, navigate away, and lose them all.

#### BUG 3: Department CRUD has no audit trail

**Location:** L228, L253

```js
await addDoc(collection(db, "departments"), { name: newDepartmentName.trim(), color: newDepartmentColor });
// NO logEvent, NO createdBy, NO createdAt

await deleteDoc(doc(db, "departments", id));
// NO logEvent, NO deletedBy, NO record of what was deleted
```

Department creation and deletion write zero audit entries. No `settings_logs` or equivalent collection.

#### BUG 4: Inventory category delete has no usage check

**Location:** L292-298

```js
const handleDeleteInvCategory = async (id, name) => {
    if (window.confirm(`Delete the "${name}" category?`)) {
      await deleteDoc(doc(db, "inventory_categories", id));
    }
};
```

Compare to `handleDeleteDepartment` (L234-257) which checks `staffCount` and `serviceCount` before allowing delete. Category delete has zero checks. Deleting a category with active inventory items breaks downstream isMedicine lookups, filter dropdowns, and ProductFormModal category picker.

### P2 — Medium

#### BUG 5: Settings save doesn't track what changed

**Location:** L212-216

```js
await setDoc(doc(db, "clinic_settings", "general"), {
    ...sanitizedSettings,
    updatedAt: Timestamp.now(),
    updatedBy: adminIdentity
}, { merge: true });
```

Records who and when, but not what. No field-level diff. "Dr. Santos updated settings at 2:15 PM" with no indication whether they changed open hour, closed dates, max pets, or all three.

#### BUG 6: `autoNoShowMins` is dead configuration

**Location:** L115, L202, L509

```js
autoNoShowMins: parseInt(settings.autoNoShowMins) || 30,
```

Stored in `clinic_settings/general` but never read by any consumer. Queue.jsx does not conditionally show/hide the No-Show button based on this value. The UI promises "Mins late before Queue displays No-Show button" — this behavior does not exist. Confirmed via grep: only Settings.jsx references this field.

#### BUG 7: `maxFutureBookingDays` is dead configuration

**Location:** L114, L199, L489

```js
maxFutureBookingDays: parseInt(settings.maxFutureBookingDays) || 30,
```

Stored but never consumed. `useBookingEngine.js` does not enforce a booking horizon limit. Confirmed via grep: zero references in `VetConnect/src`.

#### BUG 8: No validation on numeric fields beyond operating hours

**Location:** L173-186 (validation only covers hours/lunch)

Missing bounds checks:
- `minSlotInterval === 0` → infinite loop in useBookingEngine slot generation
- `maxPetsPerBooking === 0` → blocks all multi-pet bookings
- `trafficModerate >= trafficHigh` → inverted busyness thresholds
- `workingDays === []` → zero available booking days
- Negative values on any numeric field

#### BUG 9: 5 simultaneous Firestore listeners — 2 only for usage counts

**Location:** L158-165

```js
const unsubAllServices = onSnapshot(collection(db, "services"), (snapshot) => {
    setAllServices(snapshot.docs.map(d => d.data()));
});
const unsubAllStaff = onSnapshot(collection(db, "users"), (snapshot) => {
    setAllStaff(snapshot.docs.map(d => d.data()));
});
```

Full `services` and `users` collections loaded in real-time purely to count how many reference each department (L236-241, L601-604). For 200 users + 100 services = 300 docs kept in sync for a display-only count.

#### BUG 10: Duplicate listener on `clinic_settings/general`

**Location:** L141 + useClinicSettings.js

Settings.jsx creates its own `onSnapshot` on `clinic_settings/general` (L141). The `useClinicSettings` singleton hook also maintains a permanent listener on the same document. Two concurrent listeners on the same Firestore doc. Settings.jsx could consume `useClinicSettings()` instead.

### P3 — Polish

#### BUG 11: `dashboardCream` variable declared but never used

**Location:** L108

```js
const dashboardCream = '#FAF8F5';
```

Dead variable. Never referenced in JSX.

#### BUG 12: `#FFF8E1` hardcoded for panel headers — not in COLORS tokens

**Location:** L95, L340, L452, L479, L520, L631

The Antique Cream background color appears 6+ times as a hardcoded hex value. `COLORS` is imported and used for some values, but `#FFF8E1` has no corresponding token in `designTokens.js`.

#### BUG 13: `window.confirm()` for department and category delete

**Location:** L251, L293

```js
if (window.confirm(`Delete the "${name}" department?`)) {
```

Inconsistent with MUI Dialog/Snackbar patterns used in other admin modules.

#### BUG 14: Semi-transparent shadows instead of solid neubrutalism offset

**Location:** L98, L105

```js
boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
```

Design guide specifies solid Espresso-colored offset shadows, not 10% opacity.

#### BUG 15: Category chips lack delete usage check

**Location:** L706

```js
onDelete={() => handleDeleteInvCategory(cat.id, cat.name)}
```

The `isMedicine` category chip shows a red border and medication icon — visually marking it as clinical. But the delete handler has no guard against deleting categories with the `isMedicine: true` flag that serve as the source of truth for dispensing routing.

---

## What the Page Does Well

1. **Operating hours validation** — `validateSettings()` (L173-186) prevents impossible hour configurations
2. **Department usage shield** — checks staff AND service references with specific count feedback before allowing delete
3. **Duplicate detection** — case-insensitive duplicate check on both department and category creation
4. **`isMedicine` toggle on categories** — custom `MedicinePillSwitch` styled component (L51-87) clearly communicates the clinical classification
5. **`merge: true` on settings save** — prevents overwriting fields not managed by this page
6. **Real-time sync** — all listeners provide immediate feedback when settings change in another tab
7. **`updatedBy` attribution** — records who last saved (partial audit — better than nothing)
8. **Working days selector** — clean ToggleButtonGroup with visual day-of-week mapping
9. **Department color picker** — curated 15-color palette with swatch preview
10. **Closed dates auto-sort** — chronological ordering on add

---

## Proposed Tasks

| ID | Name | Priority | Effort | Notes |
|---|---|---|---|---|
| T2.177 | Settings.jsx: add `useUser()` + `isAdmin` guard. Redirect non-admin to dashboard. | **P1** | 10 min | Any user can modify clinic-wide settings via URL |
| T2.178 | Closed dates: auto-persist on add/remove via `setDoc` immediately. Add `beforeunload` or `useBlocker` warning for other unsaved settings fields. | **P1** | 30 min | Closed dates lost on navigation |
| T2.179 | Category delete: add usage shield — count inventory items referencing the category before allowing delete. Match department delete pattern. | **P1** | 20 min | Deleting "medicine" breaks isMedicine lookup for all items |
| T2.180 | Department + category CRUD audit trail: write entries to a `settings_logs` collection (who, what, when for create/delete). | **P2** | 30 min | Closes audit gap #4 from audit system assessment |
| T2.181 | Settings save field-level diff: compare current state against last Firestore snapshot, write changed fields to `settings_logs`. | **P2** | 30 min | Closes audit gap #5 — "what changed" not just "who saved" |
| T2.182 | Wire `autoNoShowMins`: read in queueColumns.jsx, No-Show button disabled until `scheduledDate + autoNoShowMins` elapses. Tooltip: "No-Show window opens at [time] per clinic policy" (Option B). Replace hardcoded 30 at L562 with settings value. Decision locked: wire (not remove). | **P2** | 30 min | Dead configuration → active feature |
| T2.183 | Wire `maxFutureBookingDays`: read in useBookingEngine.js, disable dates beyond limit in BookAppointment date picker. Decision locked: wire (not remove). | **P2** | 15 min | Dead configuration → active feature |
| T2.184 | Add bounds validation: `minSlotInterval > 0`, `maxPetsPerBooking` 1-10, `trafficModerate < trafficHigh`, `maxCages >= 0`, `advanceNoticeMins >= 0`, `workingDays.length > 0`. | **P2** | 20 min | Invalid values accepted |
| T2.185 | Replace services + users listeners with one-shot `getDocs` for department usage counts. Recount on add/delete only. | **P3** | 15 min | 5 listeners excessive |
| T2.186 | Replace 2 `window.confirm()` calls with MUI Dialog. | **P3** | 10 min | UX inconsistency |
| T2.187 | Delete dead variable `dashboardCream` (L108). | **P3** | 1 min | Dead code |

---

## Decisions Locked During Deep Dive

| Decision | Choice | Rationale |
|---|---|---|
| `autoNoShowMins` fate (T2.182) | **Wire the feature** — No-Show button disabled until threshold elapses. Option B tooltip: "No-Show window opens at [time] per clinic policy." | The setting exists because the feature was intended. Time-gated No-Show prevents premature marking. |
| `maxFutureBookingDays` fate (T2.183) | **Wire the feature** — date picker constraint in BookAppointment. | Prevents booking 90+ days out when slots may be reconfigured. 30-day default is reasonable. |
| No-Show button UX (T2.182 detail) | **Option B — disabled with tooltip until threshold.** Not hidden (Option A), not always-active with warning (Option C). | Staff sees the feature exists, understands when it activates, can't trigger prematurely. |
| No-show rebook detection (T2.190) | **Auto-detect on pet selection, 30-day window, Option A matching (any pet, ignore service), most-recent + count display.** BookAppointment uses Promise.all, WalkInModal pre-fetches on pet selection. | Zero performance impact. Soft context link via `rebookedFromId` (not `originApptId`). Banners in 3 surfaces. |
| No-show weaknesses prioritization | **All P3 (late tasks).** No proactive outreach (Spark constraint), no financial consequences, no automated policy enforcement. | None are demo-relevant. The P2 tasks (time-gate, rebook detection, banners) cover the defense story. |

---

## No-Show Rebook Detection & Dispensing Tasks (from Settings discussion threads)

### Phase 2 — No-Show & Dispensing

| ID | Name | Priority | Effort | Notes |
|---|---|---|---|---|
| T2.188 | Services non-checkable in dispensing checklist: services render for context with auto-checked greyed-out checkboxes, only products require manual verification. Button text: "VERIFY ALL X PRODUCTS." | **P2** | 20 min | User's pushback led to "keep for context, make non-checkable" |
| T2.189 | Dosage/concentration display in dispensing checklist: propagate `dosage` from inventory item to cart item in ClinicalWorkspace handleAddRx + auto-bundle. Display in DispensingVerificationDialog. | **P2** | 15 min | "Right drug, right dose, right patient" |
| T2.190 | No-show rebook detection: auto-detect recent no-shows on pet selection (BookAppointment Promise.all + WalkInModal pre-fetch). Write `rebookedFromId` + `noShowCount` on new appointment. Banners in BookAppointment (client), WalkInModal (staff), ClinicalWorkspace (vet chip + expandable). Option A matching, 30-day window, most-recent + count. | **P2** | 2 hrs | Full no-show return lifecycle |

### Phase 3 — No-Show & Dispensing Late Tasks

| ID | Name | Priority | Effort | Notes |
|---|---|---|---|---|
| T3.31 | Configurable no-show link window: `noShowLinkWindowDays: 30` in clinic_settings/general via Settings.jsx | P3 | 10 min | Currently hardcoded 30 days |
| T3.32 | Client-side appointment confirmation flow: `confirmedByClient` field, mobile confirm button, Queue "UNCONFIRMED" badge | P3 | 1.5 hrs | Spark-compatible |
| T3.33 | No-show rate display at booking/check-in: compute rate from appointments, show in queueColumns + AssignStaffModal | P3 | 30 min | Spark-compatible |
| T3.34 | Pre-appointment push reminder: deploy sendAppointmentUpdateNotification + scheduled trigger | P3 | 2-3 hrs | Blaze-dependent |
| T3.35 | Waitlist and slot recovery automation: waitlist collection, auto-offer freed slots | P3 | 3-5 hrs | Blaze-dependent |
| T3.36 | Hold for vet review in dispensing: `dispensingHold` flag, DISPENSING_FLAGGED/FLAG_RESOLVED pulse events, amber badge | P3 | 1.5 hrs | |
| T3.37 | Stock verification at dispensing time: fetch current stock on dialog mount, show warnings per item | P3 | 30 min | POSModal remains hard gate |
| T3.38 | Batch/lot selection at dispensing: batch picker per product, record in dispensingData | P3 | 1.5 hrs | Depends on T2.165 |
| T3.39 | Partial dispensing support: qty input per item, backorder tracking, modified qty to POS | P3 | 1 hr | |

---

## Cross-Cutting Findings

### Shared patterns with other modules

| Pattern | Also found in | Existing task |
|---|---|---|
| No `useUser()` role check | Inventory.jsx (scrubDatabase) | T2.154 |
| `window.confirm()` instead of MUI Dialog | Sales.jsx, Patients.jsx, ClinicalWorkspace.jsx | Multiple tasks |
| Dead configuration fields | BookAppointment.js `advanceNoticeBuffer` (T2.81) | T2.81 |
| No audit trail on CRUD | Inventory category quick-add (T2.162) | T2.162, T2.180 |
| Duplicate Firestore listener | — | New finding |

### Settings as the source of truth

This page controls parameters that ripple across the entire system:

```
Settings.jsx writes to clinic_settings/general
    │
    ├── useClinicSettings.js (singleton) reads it
    │   ├── Queue.jsx — openHour/closeHour for display
    │   ├── Records.jsx — settings for filters
    │   └── EndOfDayModal.jsx — settings for carry-over/confine
    │
    ├── useBookingEngine.js reads it (one-shot, T2.5 upgrades to onSnapshot)
    │   ├── closedDates → slot generation guard
    │   ├── workingDays → day availability
    │   ├── openHour/closeHour → time grid boundaries
    │   ├── lunchEnabled/Start/End → lunch skip
    │   ├── minSlotInterval → grid step size
    │   ├── advanceNoticeMins → TOO_SOON filter
    │   ├── trafficModerate/High → busyness level
    │   └── maxPetsPerBooking → pet selection limit
    │
    ├── pulseUtils.js reads it (via Queue.jsx prop)
    │   └── openHour/closeHour → business-hour clock routing
    │
    └── firestore.rules reads it (server-side)
        └── closedDates → appointment create rejection

Settings.jsx also writes to departments + inventory_categories
    │
    ├── departments → useBookingEngine (capacity per department)
    │                → AssignStaffModal (staff assignment)
    │                → ServiceFormModal (service department)
    │                → Queue.jsx (department column)
    │
    └── inventory_categories → Queue.jsx joinedInventory (isMedicine lookup)
                             → Inventory.jsx (filter dropdown)
                             → ProductFormModal (category picker)
```

**Any unvalidated or accidental change to these parameters has system-wide impact.** This is why BUG 1 (no role check) and BUG 8 (no bounds validation) are P1 — they expose critical configuration to any user without safeguards.

---

## Files Referenced

| File | Purpose |
|---|---|
| `VetConnect-Admin/src/pages/Settings.jsx` | Full read (733 lines) |
| `VetConnect-Admin/src/hooks/useClinicSettings.js` | Full read (63 lines) — singleton settings consumer |
| `VetConnect-Admin/src/theme/designTokens.js` | Cross-referenced for token compliance |
| `VetConnect/src/hooks/useBookingEngine.js` | Grep for `trafficModerate`, `maxFutureBookingDays`, `autoNoShowMins` |
| `VetConnect-Admin/src/features/Queue/Queue.jsx` | Grep for `autoNoShowMins` consumption (none found) |
