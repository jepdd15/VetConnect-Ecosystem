# Patients CRM Deep Dive

> **Target files:** `VetConnect-Admin/src/features/Patients/` (13 files, commit `9d1f662`)
> **Companion documents:** [ECOSYSTEM_ARCHITECTURE_REPORT.md](ECOSYSTEM_ARCHITECTURE_REPORT.md), [CLINICAL_WORKSPACE_DEEPDIVE.md](CLINICAL_WORKSPACE_DEEPDIVE.md), [MOBILE_BOOKING_DEEPDIVE.md](MOBILE_BOOKING_DEEPDIVE.md)
> **Audit method:** 11 codebase-architecture-researcher sub-agents across 3 rounds (components → modals → core files), each performing forensic file-level analysis with cross-reference tracing.

---

## Module Architecture

```
Patients/
├── Patients.jsx              (175 lines) — Master-detail client directory
├── PatientDashboard.jsx      (925 lines) — Per-pet EMR view (/patients/:id)
├── hooks/
│   └── usePatientManager.js  (295 lines) — Data layer for Patients.jsx
├── components/
│   ├── PatientDirectory.jsx  (41 lines) — Left sidebar client search/list
│   ├── ClientHeader.jsx      (97 lines) — Client identity + financials + edit toggle
│   ├── PetList.jsx           (232 lines) — Pet cards with sort/filter engine
│   ├── ClientDetails.jsx     (182 lines) — Owner CRM form (edit/view toggle)
│   ├── BillingLedger.jsx     (68 lines) — DataGrid of sales transactions
│   └── InternalLogs.jsx      (65 lines) — Staff notes with categories
└── modals/
    ├── AddPetModal.jsx       (92 lines) — Admin pet registration
    ├── EditPetModal.jsx      (163 lines) — Pet profile edit
    ├── NewClientModal.jsx    (172 lines) — Guest client creation
    └── QuickBookModal.jsx    (31 lines) — Dead-end redirect to /queue
```

### Component Connection Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Patients.jsx (orchestrator)                    │
│  19 total useState hooks (6 local + 13 from usePatientManager)       │
│                                                                      │
│  usePatientManager() hook ──────────────────────────────────────┐    │
│    ├── owners (onSnapshot: users where role=pet_owner)          │    │
│    ├── allPetsSnapshot (onSnapshot: pets where status=active)   │    │
│    ├── selectedClient + clientPets + clientTransactions          │    │
│    ├── outstandingBalance (computed from sales)                  │    │
│    ├── editForm + isEditing                                     │    │
│    ├── newNote + noteCategory                                   │    │
│    ├── newPetData                                               │    │
│    └── archivePet, handleSaveProfile, handleAdminAddPet, etc.   │    │
│                                                                  │    │
│  Tab 0: PetList ───── pets, calculateAge, archivePet,           │    │
│                       onQuickBook, onEditPet, onRegisterPet     │    │
│  Tab 1: ClientDetails ── editForm, setEditForm, isEditing       │    │
│  Tab 2: BillingLedger ── clientTransactions                     │    │
│  Tab 3: InternalLogs ─── staffNotes, newNote, handleAdd/Delete  │    │
│                                                                  │    │
│  Modals: AddPetModal, EditPetModal, NewClientModal,             │    │
│          QuickBookModal (dead-end redirect)                     │    │
└──────────────────────────┬───────────────────────────────────────┘
                           │
               /patients/:id (separate route)
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  PatientDashboard.jsx (independent data fetch, no shared hook)   │
│  3-column layout: TOC sidebar | Clinical records | Analytics     │
│  Fetches: pet, owner, medical_records (N+1), siblings, appts    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Firestore Read/Write Paths

### usePatientManager.js — 4 Listeners, 2 Global + 2 Per-Client

| Listener | Collection | Query | Cleanup | Notes |
|---|---|---|---|---|
| A: Owners directory | `users` | `where("role", "==", "pet_owner")` | Yes (L95) | Sorts by fullName. Sets `owners` + clears `loadingDirectory`. |
| B: Global pets snapshot | `pets` | `where("status", "==", "active")` | Yes (L95) | Lightweight: only `{ownerId, name}` per doc. Powers pet-name search. |
| C: Client pets | `pets` | `where("ownerId", "==", selectedClient.id)` | Yes (L174) | **N+1 inside callback** — per-pet getDocs on medical_records + appointments. |
| D: Client sales | `sales` | `where("ownerName", "==", selectedClient.fullName)` | Yes (L174) | **BUG: joins by ownerName string, not ownerId.** |

**N+1 Blast Radius (Listener C):**

For a client with 10 pets, every change to ANY pet doc fires the onSnapshot callback, which runs `Promise.all` with 2 queries per pet:

```
Per snapshot event for 10-pet client:
  1 snapshot (10 pet docs returned)          = 10 doc reads
  10 × medical_records query (limit 1 each)  = 10 reads
  10 × appointments query (limit 1 each)     = 10 reads
  ────────────────────────────────────────────
  Total: ~30 Firestore reads per pet change
```

If a staff member edits Pet A's profile, all 10 pets get their history and appointments re-fetched — including the 9 that didn't change.

### PatientDashboard.jsx — One-Shot Fetch on Mount

| Step | Operation | Lines | Read Count |
|---|---|---|---|
| A | `getDoc(pets/{id})` — skipped if `location.state?.pet` | 99-103 | 0 or 1 |
| B | `getDoc(users/{ownerId})` | 107-109 | 1 |
| C | `getDocs(medical_records where petId)` | 112-113 | 1 query (N docs) |
| D | Per-record: `getDoc(appointments/{appointmentId})` — only if `!rec.prescriptions` | 119-120 | **Up to N** |
| E | `getDocs(pets where ownerId)` — siblings | 150-151 | 1 query |
| F | `getDocs(appointments where petId)` — upcoming | 158-159 | 1 query |

**Worst case for 20 legacy records:** 1 + 1 + 20 + 1 + 1 = **25 reads**. Double this on direct URL navigation (see BUG 14).

---

## Bugs Found — Full Inventory with Code Quotes

### P0 — Clinical Safety

#### BUG: `allergies` vs `petAllergies` Field Name Mismatch — SILENT DATA LOSS

**The mismatch across the entire codebase:**

| File | Line | Reads | Writes |
|---|---|---|---|
| AddPetModal (via usePatientManager L39/L246) | L71 | — | `allergies` |
| EditPetModal | L33 (read), L54 (write) | `pet.allergies` | `allergies` |
| PatientDashboard | L383 | `pet?.allergies` | — |
| Mobile AddPetScreen | L163 | — | `petAllergies` |
| Mobile EditPetScreen | L68 (read), L120 (write) | `pet.petAllergies \|\| pet.allergies` | `petAllergies` |
| BookAppointment clinical passport | L411 | `pet.allergies` | `petAllergies` on appointment doc |
| ClinicalWorkspace | — | `patient.petAllergies` (from appointment) | — |
| EndOfDayModal | — | `patient.petAllergies` (from appointment) | — |

**Impact chain — mobile-registered pet viewed on admin:**

```
Mobile creates pet: { petAllergies: "Penicillin" }
                     (no 'allergies' field)
                              │
Admin reads pet:    pet.allergies → undefined
                              │
PatientDashboard L383:
  const hasAllergies = pet?.allergies && !['None','None recorded',''].includes(pet.allergies);
  // undefined && ... → false
  // hasAllergies = false
                              │
Allergy banner L425-428:
  {hasAllergies ? <Chip "Penicillin" /> : <Typography>NKA</Typography>}
  // Shows "NKA" (No Known Allergies) ← WRONG
```

**Impact chain — admin edits a mobile-registered pet:**

```
EditPetModal L33:  form.allergies = pet.allergies || 'None'
                   // pet.allergies is undefined → form shows "None"

EditPetModal L54:  allergies: form.allergies.trim() || 'None'
                   // Writes allergies: "None" to Firestore

Pet doc now has BOTH fields:
  { petAllergies: "Penicillin", allergies: "None" }
  // Contradictory data on the same document
```

**Fix (T2.119):** Read `pet.petAllergies || pet.allergies` everywhere on admin. Write `petAllergies` to match mobile. On pet edit, also propagate allergy changes to active appointments:

```js
// In EditPetModal save, after updating pets/{petId}:
if (allergiesChanged) {
    const activeAppts = await getDocs(query(
        collection(db, "appointments"),
        where("petId", "==", pet.id),
        where("status", "in", ["pending","confirmed","arrived","in-consult","on-hold","confined"])
    ));
    const batch = writeBatch(db);
    activeAppts.docs.forEach(d => batch.update(d.ref, { petAllergies: newAllergies }));
    await batch.commit();
}
```

---

### P1 — Data Integrity

#### BUG 1: Sales Query Joins by `ownerName` String

**Location:** `usePatientManager.js:153`
```js
query(collection(db, "sales"), where("ownerName", "==", selectedClient.fullName))
```

**POSModal writes (L342-361) — no `ownerId`:**
```js
transaction.set(saleRef, {
    appointmentId: patient.id,
    petName: patient.petName,
    ownerName: patient.ownerName || 'Walk-In',  // ← string, not ID
    // ... NO ownerId field anywhere in this object
});
```

**Three failure modes:**
1. Two clients named "Juan Cruz" → merged billing ledgers
2. Client renames via profile edit → historical sales orphaned (query stops matching)
3. Walk-in with ownerName "Walk-In" → all walk-in sales merged into one phantom client

#### BUG 2: Outstanding Balance Dual-Source

```
┌──────────────┐                    ┌─────────────────────┐
│  POSModal    │─── increment() ──►│ users/{id}           │
│  (L371-373)  │    (ownerId)      │ .outstandingBalance  │◄── PatientDashboard
│              │                    │ (monotonic counter)  │    reads this (L411)
│              │                    └─────────────────────┘
│              │
│  (L342-361)  │─── set() ────────►┌─────────────────────┐
│              │    (ownerName)     │ sales/{id}           │
└──────────────┘                    │ .total, .depositPaid │
                                    │ .status              │
                                    └──────────┬──────────┘
                                               │ onSnapshot
                                               ▼
                                    ┌─────────────────────┐
                                    │ usePatientManager    │
                                    │ L160-170: sum unpaid │◄── ClientHeader
                                    │ (ownerName match)    │    displays this
                                    └─────────────────────┘

     Source A (computed) and Source B (counter) diverge immediately.
     Source B only increments. Source A re-derives but uses ownerName (fragile).
```

**Decision locked:** Option A (computed only). Remove the counter. All surfaces compute from sales.

#### BUG 3: Species Filter Makes Dogs Disappear

**Location:** `PetList.jsx:45`
```js
if (filter.species !== 'all') 
    list = list.filter(p => (p.species || '').toLowerCase() === filter.species);
```
ToggleButton value is `'canine'`. Pet species stored as `'Dog'` (some mobile paths). `'dog' !== 'canine'` → pet vanishes from filtered view.

#### BUG 4: Sort/Filter Crash on Non-Timestamp Dates

**Location:** `PetList.jsx:57-60`
```js
case 'age_asc': 
    list.sort((a,b) => (a.dob?.toDate() || 0) > (b.dob?.toDate() || 0) ? -1 : 1);
```
If `dob` exists but is a string (e.g., `"2020-01-15"`) or a JS Date, `.toDate()` throws `TypeError: a.dob.toDate is not a function`. The `?.` only guards null/undefined, not wrong types. Same crash on `lastVisit` (L59-60) and `needs_vaccine` filter (L50).

**BillingLedger has the same pattern** at L12:
```js
new Date(p.value.seconds * 1000).toLocaleDateString()
```
Crashes if `date` is null, a JS Date, or a string.

#### BUG 5: Weight Saved as String

**Location:** `usePatientManager.js:246`
```js
const payload = { ownerId: selectedClient.id, ...newPetData, ... };
```
`newPetData.lastWeight` comes from a `<TextField type="number">` which returns a string. The `...newPetData` spread writes it as-is. Mobile uses `parseFloat(weight) || null` (AddPetScreen L160). `resolveTieredPrice` compares weight against numeric tier boundaries.

#### BUG 6: No Firebase Auth for Admin-Created Clients

**Location:** `NewClientModal.jsx:41-54`
```js
const ownerRef = await addDoc(collection(db, 'users'), ownerPayload);
// ownerRef.id = random Firestore auto-ID, NOT an Auth UID
```

**Mobile code that breaks:**
```
Mobile LoginScreen:    getDoc(doc(db, "users", auth.currentUser.uid))  → not found
Mobile ClientDashboard: pets where ownerId == auth.currentUser.uid     → empty
Mobile RegisterScreen:  setDoc(doc(db, "users", uid), {...})           → creates DUPLICATE user doc
```

**Decision locked:** Option A — add `accountStatus: 'admin_registered'` flag. Document as guest-client pattern. Auth creation deferred to T3.15 (Blaze-dependent).

---

### P2 — Functional Issues

#### BUG 7: QuickBookModal Dead-End Redirect

**Location:** `QuickBookModal.jsx:27`
```js
onClick={() => { onClose(); navigate('/queue'); }}
// navigate('/queue') — ZERO state payload. No pet, no owner, no service context.
```
Queue.jsx has no `location.state` consumption (confirmed via grep). WalkInModal already has existing-client search, pet fetching, multi-service selection, and transaction-based queue entry.

**Decision locked:** Option B — import WalkInModal directly into Patients.jsx with prefill props. Delete QuickBookModal. Effort: 1.5-2 hrs (T2.115).

#### BUG 8: Archive Pet — No Confirmation, No Undo

**Location:** `PetList.jsx:206` → `usePatientManager.js:281-284`
```js
// PetList — one click, no dialog:
<MenuItem onClick={() => {onArchive(selectedPet.id); handleMenuClose();}}>

// usePatientManager — one-way write, no archivedBy:
const archivePet = async (petId) => {
    await updateDoc(doc(db, "pets", petId), { status: 'archived', archivedAt: Timestamp.now() });
};
```
No confirmation dialog. No `archivedBy` field. No unarchive function anywhere. Global pets snapshot hides archived pets (`where("status", "==", "active")`), but per-client pets listener does NOT filter by status — creating an inconsistency.

#### BUG 9: Staff Notes Race Condition

**Location:** `usePatientManager.js:229-235`
```js
const handleAddNote = async () => {
    const note = { id: Date.now().toString(), text: newNote, ... };
    const updatedNotes = [...(selectedClient.staffNotes || []), note];
    await updateDoc(doc(db, "users", selectedClient.id), { staffNotes: updatedNotes });
};
```
Read-modify-write without a transaction. Reads from `selectedClient.staffNotes` (stale local state that is NOT updated by the owners listener after `updateDoc` succeeds). Two simultaneous adds: the second silently overwrites the first.

#### BUG 10: No Validation on Client Profile Save

**Location:** `usePatientManager.js:198-227`

Only check: `if (!selectedClient) throw new Error(...)`. No phone format (`/^09\d{9}$/`), no email format, no required fields. `fullName` can be saved as empty string. No `updatedAt` or `updatedBy` audit trail.

#### BUG 11: RA 10173 Consent — No Audit Trail

**Location:** `ClientDetails.jsx:137-138`
```jsx
<DataField label="DPA 2012 Consent" type="switch" value={editForm.dpaConsent} ... />
<DataField label="Liability Waiver" type="switch" value={editForm.waiverSigned} ... />
```
Bare booleans. No timestamp of when consent was given, no staff attribution, no consent version, no withdrawal workflow. Toggling off and on again is indistinguishable from never having toggled. Scoped as T3.5 (Phase 3, 8-12 days) for full RA 10173 system.

#### BUG 12: PatientDashboard Double-Fetch

**Location:** `PatientDashboard.jsx:93-180`

`useEffect` depends on `[id, pet]`. On direct URL navigation:
```
1. Component mounts. pet = null (no location.state).
2. useEffect fires. Fetches pet from Firestore. Calls setPet(fetchedPet).
3. setPet changes the pet dependency → useEffect fires AGAIN.
4. Second run: pet is non-null. Skips pet fetch but runs everything else AGAIN.
   Owner, medical_records (N+1), siblings, appointments — all fetched twice.
```
Up to 50 wasted Firestore reads for a pet with 20 legacy records.

#### BUG 13: No Empty State in PatientDirectory

**Location:** `PatientDirectory.jsx:18-37`

When search yields zero results, the `List` renders nothing — blank white panel. Also: `owners.map()` has no null guard — crash if `owners` is ever `undefined`. Component is not wrapped in `React.memo` — re-renders on every parent state change.

#### BUG 14: Stale-Data Flash When Switching Clients

**Location:** `Patients.jsx:80`
```jsx
{loading && !selectedClient ? (<CircularProgress />) : selectedClient ? (
```
Loading spinner only shows for initial load. When switching between clients, old client's pets/billing/notes remain visible until new Firestore snapshot fires. `loadingClientData` is true but the condition `loading && !selectedClient` is false because `selectedClient` is already set.

---

### P3 — Polish & Data Quality

#### BUG 15: Owner Name Shows "Unknown"

**Location:** `PatientDashboard.jsx:898, 901`
```js
// Avatar:
{(owner.displayName || owner.name || '?')[0].toUpperCase()}
// Name text:
{owner.displayName || owner.name || 'Unknown'}
```
The `users` collection uses `fullName`. Shows "Unknown" and "?" for every client. Fix: `owner.fullName || 'Unknown'`.

#### BUG 16: `lastWeight || ''` Treats Zero as Falsy

**Location:** `EditPetModal.jsx:35`
```js
lastWeight: pet.lastWeight || '',  // 0 is falsy → shows empty
```
Should use `pet.lastWeight ?? ''`.

#### BUG 17: Future DOB Allowed

Admin date inputs have no `max` attribute. Mobile prevents future dates with `maximumDate={new Date()}`.

#### BUG 18: Pet Edits Don't Propagate to Appointments

**Location:** `EditPetModal.jsx:58`

Writes ONLY to `pets/{petId}`. Existing appointments retain stale denormalized `petBreed`, `petGender`, `petWeight`, `petAllergies`. **Decision locked:** Don't propagate (Option A) — except allergies, which propagate to active appointments via T2.119.

#### BUG 19: Missing Fields on Admin-Created Pets

**Admin vs Mobile Field Write Comparison:**

```
                        Admin (AddPet/EditPet)    Mobile (AddPetScreen/EditPetScreen)
                        ──────────────────────    ────────────────────────────────────
name                    ✓ (untrimmed)             ✓ (trimmed)
species                 ✓                         ✓
breed                   ✓ (free text)             ✓ (curated picker, BREED_DATA)
color                   ✓                         ✓ (trimmed)
gender                  ✓ (defaults 'Male')       ✓ (forces explicit selection)
isNeutered              ✓                         ✓
weight                  ✗ MISSING                 ✓ (parseFloat, number)
lastWeight              ✓ (STRING, not number)    ✓ (parseFloat, number)
microchip               ✓ (may be empty)          ✓ (defaults "N/A")
allergies               ✓ (WRONG FIELD NAME)      ✗
petAllergies            ✗                         ✓
dob                     ✓ (no max date guard)     ✓ (3-mode: exact/approx/unknown)
isAgeExact              ✗ MISSING                 ✓
updatedAt               ✗ MISSING                 ✓ (Timestamp.now())
createdAt               ✓                         ✓
status                  ✓ ('active')              ✓ ('active')
```

#### BUG 20: Dead Code

| Item | Location |
|---|---|
| `fetchPetClinicalData` destructured but never used | Patients.jsx L39 |
| `CloseIcon`, `SaveIcon` imported but unused | Patients.jsx L26-27 |
| `onViewChart` prop declared but never used or passed | PetList.jsx L25 |
| `GLASS` imported but never used | PetList.jsx L11 |
| "Add Record" button shows `alert('Coming soon!')` | PatientDashboard.jsx L462 |
| "Book Visit" button in sidebar has NO onClick handler | PatientDashboard.jsx L865 |
| "Book Visit" button in banner navigates to /queue with no context | PatientDashboard.jsx L466 |

#### BUG 21: No Duplicate Client Detection

**Location:** `NewClientModal.jsx:32-35`

Zero Firestore queries before `addDoc`. Can create unlimited duplicate clients with the same phone number.

**Decision locked:** Phone uniqueness check with override dialog (Option A). Staff sees existing match, can create anyway if it's a different person.

---

## Performance Concerns

### N+1 in Pet List Listener — 30 Reads Per Pet Change

`usePatientManager.js:109-149` — detailed above. For 10 pets: 30 reads per snapshot event, even when only 1 pet changed. Fix: cache per-pet results, only re-fetch the changed pet.

### N+1 in Clinical Data Fetch — Duplicated Across Two Files

Both `usePatientManager.js:252-279` and `PatientDashboard.jsx:115-131` do per-record `getDoc` on appointments for `serviceType` and `prescribedItems`. PatientDashboard's version is smarter (guards with `!rec.prescriptions`). The hook version always overwrites. These are independent code paths for the same data.

### PatientDashboard Double-Fetch — 50 Wasted Reads

Direct URL navigation runs the entire useEffect twice. Fix: remove `pet` from dependency array, use a ref.

### No List Virtualization

PatientDirectory, PetList, InternalLogs all render all items in the DOM. No `react-window` or similar. Fine for small clinics, problematic at 500+ clients.

---

## Architectural Observations

### Strengths

1. **PatientDashboard's collapsible TOC with IntersectionObserver** — scroll-tracking with 5 thresholds, rootMargin `'-10% 0px -60% 0px'`, highlights active record in sidebar. Observer cleanup is correct (`observer.disconnect()` on dep change).

2. **Vaccination tracker dual-path matching** (PatientDashboard L259-320) — prefers structured `vaccineData` from records, falls back to keyword matching against SOAP text. 4 vaccines tracked (Rabies, DHPP, Bordetella, Leptospirosis). Supports explicit `dueDate` from structured data OR interval-based computation. Edge case: keyword fallback produces false positives ("Kennel cough observation — no vaccination given" matches Bordetella).

3. **PetList multi-axial filter/sort engine** — 3 filter dimensions (species, sex, medical status) + 5 sort options. Well-implemented `useMemo`. Empty state handled for zero results after filtering.

4. **ClientDetails field symmetry** — confirmed every field displayed in the form IS present in the `handleSaveProfile` payload. Zero orphaned fields. 22-field save payload covers identity, government ID, contact, marketing, legal, and emergency contacts.

5. **Legacy emergency contact migration** (usePatientManager L178-179) — reads old `emergencyName`/`emergencyPhone` flat fields and converts to array format. Read-only migration, doesn't write back until user saves.

### Weaknesses

1. **God-hook pattern** — `usePatientManager` has 14 useState hooks mixing 4 domains: directory (owners, allPetsSnapshot, search), client detail (selectedClient, clientPets, transactions, balance), form state (editForm, isEditing, newNote, newPetData), and mutations (save, add, delete, archive). Should split into `usePatientDirectory` + `useClientDetail(clientId)`.

2. **Handler functions not memoized** — `handleSaveProfile`, `handleAddNote`, `handleDeleteNote`, `handleAdminAddPet`, `fetchPetClinicalData`, `archivePet` are all plain async functions recreated every render. Child components receiving these as props re-render unnecessarily.

3. **Inconsistent error handling** — Patients.jsx uses `alert()` (3 calls at L95, L98, L145). NewClientModal and EditPetModal use inline Typography errors. No shared toast/snackbar pattern.

4. **Design token non-compliance** — PatientDashboard has 15+ hardcoded hex colors (vaccination status widget alone has 6). PetList has rounded corners and blur shadows on every element. `#FFE0B2` inline gradient in Patients.jsx not in tokens. All 13 files use non-zero `borderRadius` (should be 0 per neubrutalism spec, though the design tokens themselves contradict this with `GLASS.card.borderRadius: 3`).

5. **processedHistory search gap** (PatientDashboard L214) — searches `diagnosis`, `vetName`, `soap.subjective`, `soap.objectiveNotes`, `treatment`. Does NOT search prescriptions, `soap.assessment`, `soap.plan`, or `vaccineData`. Searching "Amoxicillin" returns zero results even if prescribed.

---

## Data Model Gaps

### `sales` Collection Missing `ownerId`

POSModal writes `ownerName` but not `ownerId`. usePatientManager queries by `ownerName`. Name changes orphan records. Name collisions merge records. Fix: T2.112 (write `ownerId`, query by it).

### `users` Docs: Two Creation Paths

| Path | Auth | Doc ID | Fields |
|---|---|---|---|
| Mobile (RegisterScreen) | Firebase Auth email/password | Auth UID | `uid`, `role`, `fullName`, `email`, `phone` |
| Admin (NewClientModal) | None | Auto-generated Firestore ID | `role`, `fullName`, `phone` (no `uid`) |

Mobile code that does `doc(db, "users", auth.currentUser.uid)` only finds Auth-registered users. Admin-created clients are invisible to mobile.

### `pets` Docs: Two Creation Paths with Different Field Names

| Field | Admin path | Mobile path |
|---|---|---|
| Allergies | `allergies` (string) | `petAllergies` (string) |
| Weight | `lastWeight` (STRING) | `weight` (number) + `lastWeight` (number) |
| Age certainty | Not written | `isAgeExact` (boolean) |
| Edit timestamp | Not written | `updatedAt` (Timestamp) |
| Breed source | Free text (any string) | Curated BREED_DATA picker |

### `staffNotes` Stored as Array on User Doc

Race condition on concurrent writes. Array grows unbounded (no pagination). Each add/delete rewrites the entire array. `arrayUnion` would fix adds; deletes need transactions.

---

## Proposed Tasks

### From Patients Deep Dive

| ID | Name | Priority | Effort | Notes |
|---|---|---|---|---|
| T2.119 | Normalize allergy field: read `petAllergies \|\| allergies` everywhere, write `petAllergies`, propagate to active appointments on edit | **P0** | 45 min | Patient safety — allergy warnings suppressed for mobile pets |
| T2.112 | Sales ownerId: add `ownerId` to sales docs (POSModal write) + update usePatientManager query | **P1** | 30 min | Name collisions + name changes break billing |
| T2.120 | Species filter normalization: 'Dog'→'canine' equivalence | **P1** | 5 min | Dogs disappear when filtering |
| T2.121 | Date type guards: `.toDate()` and `.seconds` across PetList + BillingLedger | **P1** | 15 min | Crash on non-Timestamp dates |
| T2.113 | Outstanding balance: remove counter, all surfaces compute from sales | **P2** | 45 min | Decision locked: Option A (computed only) |
| T2.115 | QuickBookModal → WalkInModal direct integration with prefill | **P2** | 1.5-2 hrs | Decision locked: Option B |
| T2.116 | Archive pet: confirmation dialog + `archivedBy` + restore button | **P2** | 30 min | |
| T2.122 | Weight type fix: parseFloat in save, write both `weight` and `lastWeight` | **P2** | 10 min | |
| T2.123 | Admin pet modal field parity: `updatedAt`, `isAgeExact`, max DOB, `petAllergies` | **P2** | 20 min | |
| T2.124 | NewClientModal: add `accountStatus: 'admin_registered'` flag | **P2** | 10 min | |
| T2.125 | Staff notes: delete confirmation + `arrayUnion` for atomic adds | **P2** | 30 min | |
| T2.126 | PatientDashboard: fix double-fetch (remove `pet` from useEffect deps) | **P2** | 15 min | |
| T2.132 | Duplicate client phone check with override dialog | **P2** | 20 min | |
| T2.114 | Owner name: `fullName` fix in PatientDashboard | **P3** | 2 min | |
| T2.117 | Deduplicate `calculateAge` into shared util | **P3** | 10 min | |
| T2.118 | PatientDashboard dead buttons: wire or remove (3 buttons) | **P3** | 15 min | |
| T2.127 | PatientDirectory: empty state + null guard + React.memo | **P3** | 15 min | |
| T2.128 | Stale-data flash on client switch | **P3** | 15 min | |
| T2.129 | Replace 3 `alert()` calls with MUI Snackbar | **P3** | 15 min | |
| T2.130 | Expand search to include prescriptions, assessment, plan | **P3** | 10 min | |
| T2.131 | Remove dead code (4 items) | **P3** | 5 min | |

### From CRM Discussion

| ID | Name | Priority | Effort | Notes |
|---|---|---|---|---|
| T2.133 | Contact freshness prompt at check-in (>90 days since last visit) | P3 | 30 min | Verbal confirmation, `contactVerifiedAt` timestamp |
| T2.134 | Client-level engagement KPIs in ClientHeader: check-ins, records, last visit, lifetime spend, pet count | P3 | 45 min | Two new queries on client selection |
| T2.135 | Deceased pet status: "Mark as Deceased" + `dateOfDeath` + memorial indicator | P3 | 15 min | |
| T2.136 | Referral detail: "Referred by" text field when referralSource is Referral | P3 | 15 min | |

---

## Implementation Sketches for Key Tasks

### T2.112 — Sales ownerId Fix

**POSModal.jsx** — add `ownerId` to the sales doc creation at ~L342:
```js
transaction.set(saleRef, {
    appointmentId: patient.id,
    ownerId: patient.ownerId || null,  // ← ADD THIS
    petName: patient.petName,
    ownerName: patient.ownerName || 'Walk-In',
    // ... rest unchanged
});
```

**usePatientManager.js** — change the query at L153:
```js
// BEFORE:
query(collection(db, "sales"), where("ownerName", "==", selectedClient.fullName))

// AFTER:
query(collection(db, "sales"), where("ownerId", "==", selectedClient.id))
```

**Backfill script** (one-time, run from Firebase console or a temporary Cloud Function):
```js
const sales = await getDocs(collection(db, "sales"));
const users = await getDocs(query(collection(db, "users"), where("role", "==", "pet_owner")));
const nameToId = {};
users.docs.forEach(d => { nameToId[d.data().fullName] = d.id; });

const batch = writeBatch(db);
sales.docs.forEach(d => {
    const ownerId = nameToId[d.data().ownerName];
    if (ownerId) batch.update(d.ref, { ownerId });
});
await batch.commit();
```

### T2.125 — Staff Notes Atomic Operations

**usePatientManager.js** — replace read-modify-write with `arrayUnion` for adds:
```js
// BEFORE (L229-234):
const updatedNotes = [...(selectedClient.staffNotes || []), note];
await updateDoc(doc(db, "users", selectedClient.id), { staffNotes: updatedNotes });

// AFTER:
await updateDoc(doc(db, "users", selectedClient.id), {
    staffNotes: arrayUnion(note)
});
```

For deletes, `arrayRemove` requires exact object match. Use a transaction instead:
```js
const handleDeleteNote = async (noteId) => {
    if (!selectedClient) return;
    if (!window.confirm("Delete this note permanently?")) return;
    await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", selectedClient.id);
        const snap = await transaction.get(userRef);
        const currentNotes = snap.data().staffNotes || [];
        transaction.update(userRef, {
            staffNotes: currentNotes.filter(n => n.id !== noteId)
        });
    });
};
```

### T2.126 — PatientDashboard Double-Fetch Fix

**PatientDashboard.jsx** — remove `pet` from dependency, use ref:
```js
// BEFORE (L180):
}, [id, pet]);

// AFTER:
const petFetched = useRef(false);

useEffect(() => {
    petFetched.current = false;
    // ... existing fetch logic
}, [id]);  // Only id, not pet

// Inside fetchDashboardData, replace setPet with:
if (!currentPet) {
    const petSnap = await getDoc(doc(db, 'pets', id));
    if (petSnap.exists()) {
        currentPet = { id: petSnap.id, ...petSnap.data() };
        setPet(currentPet);  // Still set for rendering, but won't retrigger
    }
}
```

### T2.115 — WalkInModal Direct Integration

**WalkInModal.jsx** — add optional prefill props:
```js
export default function WalkInModal({ 
    open, onClose, servicesList, departments,
    prefillClient,  // ← NEW: pre-selected client object
    prefillPet,     // ← NEW: pre-selected pet object
}) {
    // In useEffect or initialization:
    useEffect(() => {
        if (prefillClient) {
            setSelectedClient(prefillClient);
            setIsExistingClient(true);
            // Fetch pets for this client
        }
        if (prefillPet) {
            setSelectedPet(prefillPet);
        }
    }, [prefillClient, prefillPet]);
```

**Patients.jsx** — replace QuickBookModal with WalkInModal:
```js
// Add listeners for services + departments (needed by WalkInModal):
const [servicesList, setServicesList] = useState([]);
const [departments, setDepartments] = useState([]);
useEffect(() => {
    const unsubSvc = onSnapshot(collection(db, "services"), snap =>
        setServicesList(snap.docs.map(d => ({id: d.id, ...d.data()})).filter(s => !s.isArchived)));
    const unsubDept = onSnapshot(collection(db, "departments"), snap =>
        setDepartments(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => { unsubSvc(); unsubDept(); };
}, []);

// Replace QuickBookModal render:
<WalkInModal
    open={openQuickBook}
    onClose={() => setOpenQuickBook(false)}
    servicesList={servicesList}
    departments={departments}
    prefillClient={selectedClient}
    prefillPet={selectedPet}
/>
```

Delete `QuickBookModal.jsx` entirely.

---

## Vaccination Tracker — Edge Cases & Coverage Gaps

### Location: `PatientDashboard.jsx:259-320`

**Dual-path matching architecture:**
1. **Structured path** (L271-298): Checks `r.vaccineData?.vaccineName` against keyword lists. Returns structured data including `lotNumber`, `manufacturer`, `routeOfAdmin`, and explicit `dueDate`.
2. **Keyword fallback** (L301-318): Scans `diagnosis`, `treatment`, `soap?.subjective`, `soap?.objectiveNotes` for keyword matches. Returns computed `daysUntilDue` from `intervalDays`.

### False Positive Scenarios

| Scenario | What Happens | Why It's Wrong |
|---|---|---|
| Diagnosis: "Kennel cough observation — no vaccination given" | Matches Bordetella (keyword `'kennel'`) | Observation ≠ vaccination. Pet is marked as vaccinated. |
| Diagnosis: "Parvovirus treatment — IV fluids + supportive care" | Matches DHPP (keyword `'parvo'`) | Treating active disease ≠ vaccination. Pet marked as DHPP current. |
| SOAP subjective: "Owner reports pet was vaccinated for rabies at another clinic" | Matches Rabies (keyword `'rabies'`) | Reported, not administered here. No lot/manufacturer/dose data. |
| Plan: "Recommend 5-in-1 booster at next visit" | Matches DHPP (keyword `'5-in-1'`) | Recommendation ≠ administration. Pet marked as vaccinated. |

### Coverage Gaps

**Fields NOT searched by keyword fallback:**
- `soap?.assessment` — where a vet might write "Administered rabies vaccine, patient tolerated well"
- `soap?.plan` — where a vet might write "Given DHPP booster today, next due in 12 months"
- `prescriptions[]` — where vaccine products would appear if added to the treatment cart

The structured `vaccineData` path doesn't have this problem — it reads a dedicated field. The keyword fallback is the issue.

### Multi-Vaccine Visit Handling

The structured path uses `records.find()` (L271), which returns the **first** matching record. Each vaccine definition scans independently, so a single record with `vaccineData.vaccineName: "DHPP"` would match DHPP but not Rabies. If both were administered in the same visit, they'd need separate medical records OR a multi-vaccine `vaccineAdministrations[]` array (T3.2).

Currently: one `vaccineData` object per medical record = one vaccine per visit max.

### Hardcoded Vaccine List

Only 4 vaccines tracked (L260-265):
- Rabies (365-day interval)
- DHPP (365-day interval)
- Bordetella (180-day interval)
- Leptospirosis (365-day interval)

Missing from PH vet practice: Feline Panleukopenia (FVRCP), Feline Leukemia (FeLV), Canine Influenza. The list is canine-biased — no feline-specific vaccines tracked.

---

## Per-Component Audit Details

### PatientDirectory.jsx (41 lines)

**Critical:** `owners.map()` at L19 has no null guard — crashes if `owners` is ever `undefined`. The parent currently always passes an array, but a refactor could break this.

**UX gaps:** No loading state while the initial Firestore snapshot loads (users see an empty list). No empty state when search yields zero results — blank white panel. No `React.memo` wrapper — re-renders on every parent state change (tab switch, modal open, any of the 19 useState changes).

**Search:** Pet name search at parent L54 (`p.name.includes(searchLower)`) works by accident — `p.name` is pre-lowercased at snapshot time (hook L92). If anyone removes the `.toLowerCase()` from the snapshot mapping, search silently breaks for uppercase input.

**Client tag badges:** Only VIP (star emoji) and Bad Payer (warning emoji) are rendered. Regular, New, and Rescue/Shelter tags show nothing — no visual indicator.

### ClientHeader.jsx (97 lines)

**Pure presentational component.** All state and logic lives in the parent. No internal state, no side effects.

**Balance source:** Uses the computed-from-sales `outstandingBalance` from usePatientManager (via `balance` prop from Patients.jsx L88). NOT the Firestore counter. Confirmed by tracing the prop chain.

**No unsaved-changes protection:** The cancel button resets `editForm` to `selectedClient`, but there's no dirty-checking or "discard changes?" prompt if the user navigates away mid-edit.

**`createdAt` handling** (L54): `new Date(client.createdAt.seconds * 1000)` — assumes Firestore Timestamp. Will produce NaN if `createdAt` is a JS Date or string.

### PetList.jsx (232 lines)

**`onViewChart` is dead code.** Declared in destructuring (L25), never referenced. The parent does NOT pass it (Patients.jsx L122). "View Chart" uses `navigate()` directly (L176).

**Archive is fire-and-forget:** The async `onArchive(selectedPet.id)` call at L206 is not awaited and has no error handling. A failed archive produces an unhandled promise rejection with no user feedback.

**Archived pets inconsistency:** `activePets` filter at L38 (`pets.filter(p => p.status !== 'archived')`) is case-sensitive. `'Archived'` (capitalized) would pass through. The per-client pets listener in usePatientManager does NOT filter by status, so archived pets appear in the client's pet list but vanish from the global pet search.

### BillingLedger.jsx (68 lines)

**Missing columns** the `sales` doc actually contains: `paymentMethod` (Cash/GCash/Card/Bank Transfer), `cashier` (staff name), `appointmentId` (link to visit), `items[]` (cart breakdown). These are written by POSModal but not displayed.

**Balance formula duplicated 3 times:** BillingLedger L19, BillingLedger L28, usePatientManager L165. Same `(total - depositPaid)` math. If the formula changes (e.g., to account for payments collection), three locations must update.

### InternalLogs.jsx (65 lines)

**XSS confirmed safe.** `note.text` is rendered inside JSX `{note.text}` with `whiteSpace: 'pre-wrap'`. React auto-escapes string interpolation. No `dangerouslySetInnerHTML` used.

**No edit capability.** Once a note is posted, the only option is delete. No inline editing, no "edit" icon, no version history.

**Category color mapping is complete** for all 4 categories (General→brown, Financial→green, Behavioral→orange, Medical→blue). No unmapped categories.

### ClientDetails.jsx (182 lines)

**DataField abstraction handles all types correctly.** `value || ''` fallback is safe for text/select/date. Switch type uses `!!value` which correctly handles undefined/null/false/0. Emergency contacts have proper null guards (`|| []`).

**Account Standing uses label-sniffing** (L37-38): `label === 'Account Standing'` triggers special color logic. Fragile — if the label text changes, the conditional breaks silently.

**Emergency contacts have no limit.** Users can add unlimited contacts. No maximum enforced.

### AddPetModal.jsx (92 lines)

**`required` prop on name field is cosmetic** (L21). Submit is triggered by a `<Button onClick={onSubmit}>`, not a form submit event. HTML5 validation never fires. The actual validation happens in `handleAdminAddPet` (hook L243-244).

**`lastWeight` not in initial state** (hook L39). The form reads/writes `newPetData.lastWeight`, but the initial state doesn't include it. Works because `...newPetData` spread adds it dynamically when the user types a weight. Reset at L248 drops it.

**Design token compliance is good** — zero hardcoded colors. All references use COLORS/FONT.

### EditPetModal.jsx (163 lines)

**`onClose(true)` parameter ignored by parent.** EditPetModal signals save vs cancel, but Patients.jsx L169 (`() => setOpenEditPet(false)`) discards the boolean.

**`useEffect` dependency on `pet` object reference** (L39). If `pet` is a new object reference on every render (e.g., from a map without stable keys), the effect re-fires and resets the form, losing unsaved edits. Latent risk, not currently triggered.

**Breed is free text** — no predefined list. Mobile has curated `BREED_DATA` with 16 canine + 10 feline breeds including PH-local breeds (Aspin, Puspin). Admin allows typos like "Golden Retreiver."

### NewClientModal.jsx (172 lines)

**12 fields in ClientDetails not initialized:** dob, gender, govIdType, govIdNumber, seniorId, secondaryPhone, referralSource, preferredComm, whatsappOptIn, allowPromos, dpaConsent, waiverSigned. All show "Not provided" in the detail view.

**Pet schema is minimal** — only name + species collected. Breed hardcoded to "Unknown Breed", gender to "Male", isNeutered to false, allergies to "None". Missing: dob, color, microchip, weight. Compare to AddPetModal which collects all of these.

**Non-transactional dual write** — owner doc and pet doc are separate `addDoc` calls (L54, L58). If pet write fails, orphan owner exists.

**Dialog dismissible during save** — clicking the backdrop via `onClose` at L82 dismisses the dialog even while `saving` is true. The save operation continues in the background, but the modal is gone.

### QuickBookModal.jsx (31 lines)

**Confirmed dead end.** Single call site: PetList "Book Visit" button. The modal says "Internal Scheduling Offline" — strongly suggests a planned admin booking system that was never built. `navigate('/queue')` passes zero state. Queue.jsx has no `location.state` consumption (grep confirmed).

**Decision locked:** Replace entirely with WalkInModal direct integration (T2.115).

---

## Decisions Locked During Deep Dive

| Decision | Choice | Rationale |
|---|---|---|
| Outstanding balance source | **Computed from sales only** (Option A) | Zero drift risk, always correct. Remove counter. |
| QuickBookModal replacement | **WalkInModal direct integration** (Option B) | One surface, no dead redirect, prefill support |
| Admin-created clients | **Document as guest** (Option A) + `accountStatus` flag | Deployable on Spark. Auth creation deferred to Blaze. |
| Duplicate client detection | **Phone check with override** (Option A) | Phone is more unique than name. Override for family/recycled numbers. |
| Pet edit propagation | **Don't propagate, except allergies** (Option A) | Allergies are the only safety-critical field. Everything else is cosmetic. |
| Client KPI "visits" label | **"check-ins"** | Counts arrived+ status appointments. Avoids terminology conflict with locked "visit" definition. |

---

## Files Fully Audited (11 sub-agent deep dives)

| File | Lines | Round | Key Findings |
|---|---|---|---|
| PatientDirectory.jsx | 41 | 1 | Crash on null owners, no empty state, no React.memo, 4 design violations, TYPE imported but unused |
| ClientHeader.jsx | 97 | 1 | Balance dual-source confirmed, phone no fallback, createdAt fragile, no unsaved-changes guard, 3 inline colors |
| PetList.jsx | 232 | 1 | Species filter bug, sort crash, archive no confirm, onViewChart dead prop, GLASS dead import, every element has rounded corners |
| BillingLedger.jsx | 68 | 1 | Date crash, missing columns (paymentMethod, cashier), no actions, balance formula duplicated 3x, 1 inline color |
| InternalLogs.jsx | 65 | 1 | Delete race condition, no confirmation, no edit capability, XSS confirmed safe (React auto-escapes) |
| ClientDetails.jsx | 182 | 1 | Zero validation, RA 10173 no audit trail, DataField abstraction handles null correctly, Account Standing uses label-sniffing |
| AddPetModal.jsx | 92 | 2 | Allergy field mismatch, weight as string, missing weight/isAgeExact, future DOB, `required` prop cosmetic (Button onClick not form submit), zero hardcoded colors (good) |
| EditPetModal.jsx | 163 | 2 | Allergy mismatch (read + write), no updatedAt, no appointment propagation, lastWeight zero bug, onClose boolean ignored by parent, useEffect pet dependency causes form reset risk |
| NewClientModal.jsx | 172 | 2 | No Auth account, no uid, no duplicate detection, 12 fields uninitialized, pet schema minimal (2 fields vs AddPetModal's 10), non-transactional dual write |
| QuickBookModal.jsx | 31 | 2 | Confirmed dead end, `navigate('/queue')` with zero state, WalkInModal is the real solution, single call site, hardcoded `#2E7D32` color |
| usePatientManager.js | 295 | 3 | Sales ownerName bug, balance dual-source, N+1 blast radius (30 reads/10 pets), notes race condition, 14 useState god-hook, handler functions not memoized, allergy field mismatch in initial state + addPet |
| PatientDashboard.jsx | 925 | 3 | Double-fetch (50 wasted reads), owner name "Unknown", allergy field mismatch in display, 3 dead buttons, 15+ inline colors, vaccination keyword false positives, search doesn't cover prescriptions/assessment/plan |
| Patients.jsx | 175 | 3 | fetchPetClinicalData unused, stale-data flash, 3 alert() calls, #FFE0B2 rogue gradient color, CloseIcon/SaveIcon dead imports, onViewChart not passed to PetList, tab reset intentional |
