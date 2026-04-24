# Staff Module Deep Dive

> **Target files:** `VetConnect-Admin/src/features/Staff/` (5 files, 1,039 LOC, commit `9d1f662`)
> **Companion documents:** [ECOSYSTEM_ARCHITECTURE_REPORT.md](ECOSYSTEM_ARCHITECTURE_REPORT.md), [SETTINGS_DEEPDIVE.md](SETTINGS_DEEPDIVE.md)
> **Audit method:** 2 codebase-architecture-researcher sub-agents in parallel (core files + modals/components), each performing forensic file-level analysis with cross-reference tracing against Queue.jsx, AssignStaffModal.jsx, useBookingEngine.js, and Settings.jsx.

---

## Module Architecture

```
Staff/
├── Staff.jsx                             (204 lines) — Page orchestrator: toolbar, filters, modal wiring
├── hooks/
│   └── useStaffManager.js                (165 lines) — Data layer: 3 listeners, CRUD, Firebase Auth, audit logging
├── components/
│   └── StaffTable.jsx                    (183 lines) — DataGrid with workload column
└── modals/
    ├── StaffFormModal.jsx                (410 lines) — Create/edit form with Firebase Auth creation
    └── ConfirmRevokeModal.jsx            (77 lines)  — Soft-delete (disable) confirmation
```

### Component Connection Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Staff.jsx (orchestrator)                      │
│  7 useState + 2 useMemo (kpis UNUSED, filteredStaff)                │
│                                                                      │
│  useStaffManager() ──────────────────────────────────────────┐       │
│    ├── staffList[]         (onSnapshot: users, client filter)│       │
│    ├── activeAppointments[](onSnapshot: appointments)        │       │
│    ├── departments[]       (onSnapshot: departments)         │       │
│    ├── loading             (NOT consumed by Staff.jsx)       │       │
│    ├── getWorkload(vetId)  (count active appts per staff)    │       │
│    ├── saveStaff(id, data) (create w/ Firebase Auth + edit)  │       │
│    └── removeStaff(id)     (soft-delete: disabled flag)      │       │
│                                                              │       │
│  StaffTable ─── filteredStaff, getWorkload, callbacks        │       │
│  StaffFormModal ─── item, departments, onSave                │       │
│  ConfirmRevokeModal ─── staffName, onConfirm                 │       │
│  KPICard ─── DEFINED BUT NEVER RENDERED (dead code)          │       │
└──────────────────────────────────────────────────────────────────────┘

                  EXTERNAL CONSUMERS OF staff DATA
┌──────────────────────────┐    ┌────────────────────────────────────────┐
│  useBookingEngine.js     │    │  Queue.jsx                             │
│  Queries: users where    │    │  Queries: users collection             │
│    accessLevel in        │    │  Filters: role='veterinarian' ||       │
│    ['admin','staff']     │    │    role='groomer' || accessLevel       │
│  Counts: per department  │    │  Passes to: AssignStaffModal,          │
│  for capacity            │    │    ClinicalWorkspace                   │
└──────────────────────────┘    └────────────────────────────────────────┘
┌──────────────────────────┐
│  Settings.jsx            │
│  Reads: ALL users        │
│  Counts: role='staff'    │
│  per department for      │
│  usage shield on delete  │
└──────────────────────────┘
```

---

## Firestore Read/Write Paths

### useStaffManager.js — 3 Listeners, 3 Write Functions

| Operation | Collection | Mechanism | Line | Notes |
|---|---|---|---|---|
| **Read** (real-time) | `users` | `onSnapshot` (full collection, client-side filter) | L59 | Filters: `!u.disabled && role in [vet,staff,admin,groomer] \|\| u.accessLevel` |
| **Read** (real-time) | `appointments` | `onSnapshot`, `where status in [arrived, in-consult, confined]` | L68-69 | **Misses 3 active statuses** |
| **Read** (real-time) | `departments` | `onSnapshot` (full collection) | L74 | Department list |
| **Write** (create) | `users/{newUid}` | `setDoc` (after Firebase Auth creation) | L141 | UID from Auth |
| **Write** (update) | `users/{editId}` | `updateDoc` | L124 | Edit existing |
| **Write** (revoke) | `users/{id}` | `updateDoc` (disabled flag) | L155-159 | Soft-delete |
| **Write** (audit) | `staff_logs` | `addDoc` | L90 | Every mutation logged |

### Firebase Auth — Secondary App Pattern

| Operation | Line | Notes |
|---|---|---|
| `initializeApp(firebaseConfig, tempAppName)` | L131 | Creates secondary app to avoid admin session hijack |
| `createUserWithEmailAndPassword(secondaryAuth, email, "vetconnect123!")` | L137 | **CRITICAL: hardcoded password** |
| `secondaryAuth.signOut()` | L147 | Signs out secondary session |
| `deleteApp(secondaryApp)` | **NEVER CALLED** | **HIGH: memory leak** |

---

## Staff Document Schema (as written by saveStaff)

```js
// useStaffManager.js:108-118
{
  fullName,
  email,
  phone,
  accessLevel,          // 'staff' or 'admin' (form only offers 2 options)
  role: accessLevel,    // COPIES accessLevel — overwrites 'veterinarian'/'groomer' on edit
  departments: [],      // array of department names
  prcLicense,           // PH Regulation Commission license number
  address,
  emergencyContacts: [],
  updatedAt: new Date(),      // client-side timestamp (not serverTimestamp)
  createdAt: new Date(),      // only on create
}
```

**On revoke (removeStaff):**
```js
// useStaffManager.js:155-159
{
  disabled: true,
  disabledAt: new Date(),     // client-side timestamp
  role: 'disabled',
  accessLevel: 'disabled',
}
```

---

## Audit Log Schema (staff_logs)

```js
// useStaffManager.js:88-98
{
  staffId:    string,
  staffName:  string,
  action:     'CREATED' | 'UPDATED' | 'ACCESS_REVOKED',
  details:    string,       // diff summary or description
  timestamp:  serverTimestamp()   // correctly uses server timestamp (unlike doc fields)
}
```

### Diff Engine (diffStaffFields, L19-48)

Tracks changes to: `fullName`, `email`, `phone`, `accessLevel`, `prcLicense`, `address`, `departments[]`, `emergencyContacts[]`.

---

## Consumer Cross-Reference — Critical Findings

### Role/AccessLevel Architecture Mismatch

| Consumer | How it reads staff | What it expects | What saveStaff writes |
|---|---|---|---|
| Queue.jsx L1123 | `u.role === 'veterinarian' \|\| u.role === 'groomer' \|\| u.accessLevel` | `role: 'veterinarian'` for vets | `role: formData.accessLevel` — only 'staff' or 'admin' |
| useBookingEngine L72 | `accessLevel in ['admin', 'staff']` | accessLevel as capacity signal | Correct — writes 'staff' or 'admin' |
| AssignStaffModal | `v.departments?.includes(dept)` | departments array | Correct |
| Settings.jsx L236 | `u.role === 'staff'` | role for usage count | Breaks for vets (role becomes 'staff' on edit) |

**The mismatch:** StaffFormModal offers only `staff` and `admin` for accessLevel. The hook copies accessLevel to role (`role: formData.accessLevel`). Editing a veterinarian overwrites `role: 'veterinarian'` to `role: 'staff'`. The vet disappears from Queue.jsx's vet dropdown and can no longer be assigned to patients.

### Revoked Staff Leak into Queue.jsx Vet List

Queue.jsx L1123 filter: `u.role === 'veterinarian' || u.role === 'groomer' || u.accessLevel`

When `removeStaff` sets `accessLevel: 'disabled'`, the string `'disabled'` is truthy. The `|| u.accessLevel` filter passes. Revoked staff appear in the vet dropdown for patient assignment.

---

## Data Flow: Staff Creation (End-to-End)

```
StaffFormModal                useStaffManager                Firebase
    │                              │                          │
    │ handleSave(formData)         │                          │
    │─────────────────────►        │                          │
    │                     saveStaff(null, formData)           │
    │                              │                          │
    │                    initializeApp(secondaryApp)          │
    │                              │──────────────────────►   │
    │                    createUserWithEmail(email,            │
    │                      "vetconnect123!")                   │
    │                              │◄─────────────────────   │
    │                              │     userCredential       │
    │                              │                          │
    │                    setDoc(users/{uid}, payload)         │
    │                              │──────────────────────►   │
    │                              │                          │
    │                    addDoc(staff_logs, audit)            │
    │                              │──────────────────────►   │
    │                              │                          │
    │                    secondaryAuth.signOut()              │
    │                              │  (but NO deleteApp!)     │
    │◄─────────────────────────────│                          │
```

## Data Flow: Staff Revocation (End-to-End)

```
ConfirmRevokeModal → Staff.jsx handleConfirmRevoke → removeStaff(id)
    │
    ▼
updateDoc(users/{id}, {
    disabled: true,
    disabledAt: new Date(),       ← client timestamp
    role: 'disabled',
    accessLevel: 'disabled',      ← truthy string, passes Queue.jsx filter
})
    │
    ▼
addDoc(staff_logs, { action: 'ACCESS_REVOKED' })

NOT DONE:
├── Firebase Auth account NOT disabled (user can still log in)
├── Active appointments NOT checked (vet mid-consult can be revoked)
├── assignedVetId on appointments NOT cleared
└── No re-enable UI exists (modal text says "admin can re-enable" — false)
```

---

## Bugs Found — Full Inventory

### CRITICAL

#### BUG 1: Hardcoded default password in source code

**Location:** `useStaffManager.js:137`

```js
const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, "vetconnect123!");
```

Every new staff account gets the same plaintext password. Checked into source control (public GitHub repo). No password reset flow. No first-login forced change. Anyone who reads the source knows the default credential for every staff account ever created.

#### BUG 2: No phone format validation on staff creation

**Location:** `StaffFormModal.jsx:89`

```js
if (!formData.phone.trim()) newErrors.phone = 'Phone number is required.';
```

Only checks non-empty. Accepts "abc", "123", any string. CLAUDE.md mandates `/^09\d{9}$/` (PH format). WalkInModal correctly validates with `isValidPHPhone()` — this form does not.

### HIGH

#### BUG 3: Secondary Firebase App never destroyed — memory leak

**Location:** `useStaffManager.js:131-148`

```js
const tempAppName = 'SecondaryApp' + Date.now();
const secondaryApp = initializeApp(firebaseConfig, tempAppName);
// ...
} finally {
    secondaryAuth.signOut();
    // deleteApp(secondaryApp) NEVER CALLED
}
```

`deleteApp` is not imported from `firebase/app`. Each staff creation permanently leaks a Firebase App instance with open WebSocket connections and internal listeners.

#### BUG 4: No active-appointment guard on revocation

**Location:** `useStaffManager.js:152-162`

```js
const removeStaff = async (id) => {
    const staff = staffList.find(s => s.id === id);
    await updateDoc(doc(db, "users", id), {
      disabled: true,
      // NO appointment check anywhere in this function
    });
```

The handoff claims an "active-appointment guard" exists. **This is false.** Verified across all three files in the revoke chain — zero appointment queries. A vet currently in-consult with 5 patients can be revoked, orphaning `assignedVetId` references on active appointments.

#### BUG 5: Modal claims Firebase Auth is disabled — it's not

**Location:** `ConfirmRevokeModal.jsx:48-49`

```
"⚠ Note: Their Firebase Auth account will be disabled, not deleted."
```

The actual `removeStaff` code only sets Firestore fields (`disabled: true`). The Firebase Auth account remains fully active. The revoked user can still log in. True Auth disabling requires Firebase Admin SDK (Cloud Function, Blaze-dependent).

### MEDIUM

#### BUG 6: Role/accessLevel form only offers staff/admin — vet/groomer roles silently overwritten

**Location:** `StaffFormModal.jsx:215-218`, `useStaffManager.js:114`

```jsx
// StaffFormModal — only 2 options
<MenuItem value="staff">Clinical Staff</MenuItem>
<MenuItem value="admin">Clinic Administrator</MenuItem>
```

```js
// useStaffManager — copies accessLevel to role
role: formData.accessLevel,
```

Editing a veterinarian sets `role: 'staff'`. Queue.jsx filters `u.role === 'veterinarian'` — the vet disappears from the dropdown. They can no longer be assigned to patients.

#### BUG 7: Workload query misses 3 active statuses

**Location:** `useStaffManager.js:68`

```js
const qAppts = query(collection(db, "appointments"),
    where("status", "in", ["arrived", "in-consult", "confined"]));
```

Per `statusConstants.js`, active statuses also include `on-hold`, `dispensing`, `billing`. Staff with patients in dispensing/billing appear "Available" in the table.

#### BUG 8: Revoked staff pass Queue.jsx vet filter

**Location:** `Queue.jsx:1123`

```js
.filter(u => u.role === 'veterinarian' || u.role === 'groomer' || u.accessLevel)
```

When `removeStaff` sets `accessLevel: 'disabled'`, the string `'disabled'` is truthy. The `|| u.accessLevel` filter passes. Revoked staff appear in Queue.jsx's vet list and can be assigned to patients via AssignStaffModal.

#### BUG 9: Client-side `new Date()` instead of `serverTimestamp()`

**Location:** `useStaffManager.js:118, 128, 157`

```js
updatedAt: new Date()     // L118
createdAt: new Date()     // L128
disabledAt: new Date()    // L157
```

The audit log correctly uses `serverTimestamp()` (L95), but user doc timestamps use client-side `new Date()`. Clock skew produces inaccurate timestamps. Inconsistency within the same hook.

#### BUG 10: Full `users` collection read with client-side filtering

**Location:** `useStaffManager.js:59`

```js
const unsubStaff = onSnapshot(collection(db, "users"), (snapshot) => {
    setStaffList(snapshot.docs.map(...).filter(u => !u.disabled && ...));
```

Loads ALL users (including pet owners) then filters client-side. For clinics with thousands of clients, this reads far more documents than needed.

#### BUG 11: Departments labeled required (*) but not validated

**Location:** `StaffFormModal.jsx:230`

```jsx
<InputLabel>Assigned Departments *</InputLabel>
```

The label shows `*` (required), but `handleSave` (L84-93) does not validate `departments.length > 0`. A staff member saved with zero departments won't appear in any department capacity count in `useBookingEngine`, effectively becoming invisible to the booking system.

#### BUG 12: Emergency contact array shallow-copy mutation

**Location:** `StaffFormModal.jsx:79`

```js
const handleContactChange = (index, field, value) => {
    const updated = [...formData.emergencyContacts];
    updated[index][field] = value;  // MUTATES existing state object
    setFormData(prev => ({ ...prev, emergencyContacts: updated }));
};
```

`[...array]` creates a shallow copy of the array but objects inside are still references. `updated[index][field] = value` mutates the original state object. Works by accident because `setFormData` triggers a re-render.

#### BUG 13: `activeAppointments` mapped without `.id`

**Location:** `useStaffManager.js:70`

```js
setActiveAppointments(snapshot.docs.map(d => d.data()));
```

Compare to staff listener (L60): `{ id: doc.id, ...doc.data() }`. Inconsistent pattern. Current workload computation only uses `assignedVetId` (not the doc ID), but future consumers would get `undefined` for `.id`.

### LOW / P3

#### BUG 14: KPICard + kpis — defined but never rendered (dead code)

**Location:** `Staff.jsx:21-45, 67-77`

```js
const KPICard = ({ title, value, icon, color, bgcolor, border, onClick, active }) => ( ... );
// 25 lines of component definition NEVER used in JSX

const kpis = useMemo(() => { ... }, [staffList, activeAppointments]);
// Computed every render, result NEVER read
```

Also makes 4 icon imports dead code: `PeopleIcon`, `LocalHospitalIcon`, `EventAvailableIcon`, `AdminPanelSettingsIcon`.

#### BUG 15: Additional dead code

- `WorkIcon` import (StaffTable.jsx:11) — never used
- `headerSx` variable (StaffTable.jsx:23-27) — defined, never referenced
- `deleteDoc` import (useStaffManager.js:3) — never called (soft-delete only)
- `GLASS` and `COLORS` imports (Staff.jsx:12) — imported, never referenced
- `showToast` prop (StaffFormModal.jsx:22) — received, never called

#### BUG 16: `loading` state exported but never consumed

`useStaffManager` returns `loading` (L164). `Staff.jsx` does not destructure it (L48). No loading indicator during initial fetch.

#### BUG 17: No loading/disabled state on REVOKE button

`ConfirmRevokeModal.jsx:59-71` — button has no `disabled` or loading state during async `removeStaff`. Double-click triggers duplicate writes.

#### BUG 18: Potential crash on empty cleanName

`StaffTable.jsx:33-38`:
```js
const cleanName = p.value ? p.value.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/i, '') : '?';
{cleanName[0].toUpperCase()}
```
If name is exactly "Dr." with no following text, `cleanName` is `''` and `cleanName[0]` is `undefined` → `.toUpperCase()` throws.

#### BUG 19: No null guard on `departments` prop

`StaffTable.jsx:73`:
```js
const deptObj = departments.find(d => d.name === deptName);
```
If `departments` is `undefined` (before listener resolves), `.find()` throws.

#### BUG 20: Design token violations — 50+ hardcoded colors

Only `Staff.jsx` imports tokens (`FONT`, `TYPE`, `COLORS`, `GLASS`). Of those, only `FONT` and `TYPE.label` are actually used. `COLORS` and `GLASS` are imported but never referenced. The three child components (`StaffTable`, `StaffFormModal`, `ConfirmRevokeModal`) import zero tokens. ~50+ hardcoded hex values across the module.

#### BUG 21: `borderRadius` violations

- `Staff.jsx:143` — search field `borderRadius: 1`
- `ConfirmRevokeModal.jsx:44` — warning box `borderRadius: 2`
- `StaffTable.jsx:176` — scrollbar thumb `borderRadius: '4px'`

---

## Handoff Claim Verification

| Handoff Claim | Verified? | Finding |
|---|---|---|
| "ConfirmRevokeModal has active-appointment guard on revocation" | **FALSE** | Zero appointment queries in the revoke chain. No guard exists. |
| Staff module uses `accountStatus` (active/suspended/revoked) | **FALSE** | Uses `disabled` boolean + `role: 'disabled'` pattern instead. `accountStatus` is not used for staff. |
| Staff fields include `specialization`, `licenseNumber` | **FALSE** | Uses `prcLicense` instead. Neither `specialization` nor `licenseNumber` exists in code. |

---

## Decisions Locked During Deep Dive

| Decision | Choice | Rationale |
|---|---|---|
| Password strategy (T2.208) | **Option A — random temp password in toast.** Option C (Cloud Function) scoped as T3.42 for production deployment. | Admin creates account in person, sees temp password, tells staff face-to-face. No email infrastructure needed on Spark. |
| Role dropdown (T2.213) | **Don't overwrite `role` on edit — only set on create (3-line fix).** Full `clinicalRole` field separation as P3. | Departments handle all routing/capacity/assignment. `role` is just a display label + Queue vet filter. Adding a new field for display-only is P3 polish. |
| `vetsList` rename | **Don't rename.** | 8 references across 4 files for zero functional benefit. Name collision risk with `staffList` in useStaffManager. Will become accurate if clinicalRole ships. |
| Staff listener optimization (T2.218) | **P2 — server-side role filter.** | Not for performance (Starbarks scale is fine) but for correctness — listener fires for pet owner doc changes which is architecturally wrong. |
| Departments validation (T2.216) | **Hard block — `departments.length === 0` check in handleSave.** | Label shows `*` (required). Zero-department staff is functionally useless (invisible to booking, unassignable). No valid use case at Starbarks scale. |
| Option B vs C for production | **Option C (Cloud Function) preferred for production.** Solves password, Auth disable, custom claims in one feature. Scoped as T3.42. Option B (email-link) is Spark-compatible alternative. | Option C gives server-side RBAC via custom claims + real Auth disable on revoke + user-chosen passwords. Requires Blaze. |

---

## Proposed Tasks

| ID | Name | Priority | Effort | Notes |
|---|---|---|---|---|
| T2.208 | Remove hardcoded password. Generate random 12-char temp password, display to admin in success toast. Decision locked: Option A. | **CRITICAL** | 30 min | Source code exposes every staff credential |
| T2.209 | Add PH phone validation (`/^09\d{9}$/`) to StaffFormModal. Extract `isValidPHPhone` to shared util. | **CRITICAL** | 5 min | Any string accepted as phone number |
| T2.210 | Fix Firebase App memory leak: import `deleteApp` from `firebase/app`, call in `finally` block after `signOut`. | **P1** | 5 min | Leaks app instance per staff creation |
| T2.211 | Add active-appointment guard on revocation: query appointments where `assignedVetId === staffId` AND status is non-terminal. Block with count feedback. | **P1** | 20 min | Revoking vet mid-consult orphans patients |
| T2.212 | Fix ConfirmRevokeModal text: "Staff profile will be deactivated. Login access requires separate Auth management." Document Auth disable as Blaze-dependent (T3.40). | **P1** | 5 min | Misleading UI text — claims Auth disabled but only Firestore flag set |
| T2.213 | Preserve existing `role` on edit — don't overwrite. Only set `role: formData.accessLevel` on create path. 3-line fix. Full `clinicalRole` field as P3. | **P1** | 5 min | Decision locked: preserve on edit, set on create |
| T2.214 | Fix workload query: add `on-hold`, `dispensing`, `billing` to status filter. Match `ACTIVE_STATUSES` from statusConstants.js. | **P1** | 5 min | Staff with dispensing/billing patients show as "Available" |
| T2.215 | Fix Queue.jsx vet filter: change `\|\| u.accessLevel` to `\|\| ['veterinarian','groomer','staff','admin'].includes(u.accessLevel)`. Exclude `'disabled'`. | **P1** | 5 min | Revoked staff appear in vet assignment dropdown |
| T2.216 | Validate departments required: hard block if `departments.length === 0`. Decision locked: hard block. | **P2** | 5 min | Zero-department staff invisible to booking capacity |
| T2.217 | Replace `new Date()` with `serverTimestamp()` for `createdAt`, `updatedAt`, `disabledAt` on user docs. | **P2** | 5 min | Client-side timestamps inconsistent with audit log |
| T2.218 | Server-side staff listener filter: `where("role", "in", ["veterinarian","staff","admin","groomer"])`. Keep `disabled` filter client-side. Decision locked: P2 for correctness. | **P2** | 15 min | Listener fires on pet owner changes — architecturally wrong |
| T2.219 | Fix emergency contact mutation: deep-copy objects before modifying. `updated[index] = { ...updated[index], [field]: value }`. | **P2** | 5 min | React state mutation anti-pattern |
| T2.220 | Add `.id` to activeAppointments mapping: `{ id: d.id, ...d.data() }`. | **P2** | 2 min | Inconsistent with staffList pattern |
| T2.221 | Delete dead code: KPICard + kpis useMemo + 4 icon imports (Staff.jsx), WorkIcon + headerSx (StaffTable), deleteDoc import (useStaffManager), showToast dead prop (StaffFormModal). | **P3** | 5 min | |
| T2.222 | Pass `loading` from useStaffManager to StaffTable. Add loading skeleton. | **P3** | 10 min | |
| T2.223 | Add loading/disabled state on REVOKE button during async. | **P3** | 5 min | Double-click triggers duplicate writes |
| T2.224 | Fix cleanName crash: `cleanName[0]?.toUpperCase() \|\| '?'`. | **P3** | 2 min | Crash if name is exactly "Dr." |
| T2.225 | Add null guard on `departments` prop in StaffTable. | **P3** | 2 min | |
| T2.226 | Design token compliance: import COLORS/TYPE across 3 child components. Replace 50+ hardcoded hex values. | **P3** | 45 min | |
| T2.227 | Fix borderRadius violations (search field, warning box, scrollbar). | **P3** | 5 min | |

### Phase 3

| ID | Name | Priority | Effort | Notes |
|---|---|---|---|---|
| T3.40 | Firebase Auth disable on staff revocation: Cloud Function with Admin SDK to actually disable the Auth account. Blaze-dependent. | P3 | 2 hrs | Currently only Firestore flag is set |
| T3.41 | Staff re-enable flow: UI to restore revoked staff (set disabled:false, restore role/accessLevel, add RESTORED audit event). | P3 | 1 hr | Currently no re-enable path exists despite modal text claiming it does |
| T3.42 | Staff password management: password reset flow, force change on first login, or switch to email-link auth. | P3 | 3-4 hrs | Currently hardcoded default password with no change mechanism |

---

## What the Module Does Well

1. **Secondary Firebase App pattern** — correctly avoids admin session hijack during staff Auth creation. The pattern is sound; the implementation just needs `deleteApp` cleanup.

2. **Soft-delete over hard-delete** — `removeStaff` sets `disabled: true` instead of deleting the doc. Prevents Auth-Firestore orphans. The `deleteDoc` import being dead code confirms this was a deliberate design decision.

3. **Diff engine for audit logging** — `diffStaffFields` (L19-48) tracks 8 fields including array comparisons for `departments[]` and `emergencyContacts[]`. Produces human-readable change summaries.

4. **Emergency contact migration** — form gracefully migrates legacy flat fields (`emergencyName`, `emergencyKinship`, `emergencyPhone`) to array format on edit (L39-44).

5. **Multi-department support** — staff can be assigned to multiple departments via multi-select. Color-coded department chips in the table with lookup against the departments collection.

6. **PRC license field** — domain-specific to Philippine veterinary practice. Shows field is designed for the target market.

---

## Cross-Cutting Findings

### Shared patterns with other modules

| Pattern | Also found in | Existing task |
|---|---|---|
| No active-operation guard before archive/revoke | Services (T2.191), Inventory (T2.161) | New finding for Staff |
| `loading` not consumed | Services (T2.197), Inventory (T2.153) | Same pattern |
| Full collection read with client-side filter | Settings.jsx (services+users for dept counts, T2.185) | New finding for Staff |
| Dead code (defined but never rendered) | Inventory (clinicalFlatStyle), Services (clinicalFlatStyle) | Same pattern |
| `new Date()` instead of `serverTimestamp()` | — | New finding (other modules use serverTimestamp correctly) |
| Zero design tokens in child components | Inventory (7 files), Services (4 files), Sales (2 files) | Systemic |
| `borderRadius` violations | Every module | Systemic |

### Role/AccessLevel as a system-wide architecture concern

The Staff module's role handling affects the entire clinical workflow:

```
StaffFormModal writes: role = accessLevel = 'staff' or 'admin'
    │
    ├── Queue.jsx reads: u.role === 'veterinarian' → BROKEN after edit
    │   └── AssignStaffModal: vet not in dropdown → can't assign to patients
    │
    ├── useBookingEngine reads: accessLevel in ['admin','staff'] → OK
    │   └── Capacity count: vet still counted (accessLevel unchanged)
    │
    ├── ClinicalWorkspace reads: patient.staffName (from assignment)
    │   └── Vet name on sign-off: OK (uses assignment, not role)
    │
    └── Settings.jsx reads: u.role === 'staff' for dept usage count
        └── Vet counted as 'staff' → misleading count
```

T2.213 (add vet/groomer to dropdown) fixes the root cause. T2.215 (fix Queue filter for disabled staff) fixes the revocation leak.

---

## Files Fully Audited

| File | Lines | Key Findings |
|---|---|---|
| Staff.jsx | 204 | KPICard dead code, loading not consumed, filter collapses vet/groomer to staff/admin, kpis computed but never read |
| useStaffManager.js | 165 | CRITICAL hardcoded password, HIGH Firebase App leak, HIGH no revoke guard, workload misses 3 statuses, full users collection read, client-side timestamps |
| StaffTable.jsx | 183 | WorkIcon + headerSx dead, cleanName crash potential, departments null guard missing, pagination disabled |
| StaffFormModal.jsx | 410 | CRITICAL no phone validation, role only staff/admin (overwrites vet), departments not validated despite * label, emergency contact mutation, showToast dead prop |
| ConfirmRevokeModal.jsx | 77 | HIGH: false Auth disable claim, no active-appointment guard (handoff claim refuted), no loading state on button, borderRadius violation |
