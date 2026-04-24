# Mobile Booking Flow Deep Dive

## Executive Summary

The BookAppointment wizard is a 4-step flow (Pet Selection -> Service Bundle -> Date/Slot -> Review/Submit) backed by `useBookingEngine.js`, a department-capacity-aware slot computation engine. Services are selected ONCE and applied identically to ALL selected pets -- there is no per-pet service differentiation. The writeBatch creates one appointment doc per pet with identical `services[]` arrays but staggered `scheduledDate` timestamps. There is currently NO `visitGroupId` linking multi-pet bookings. Several bugs were found: a tiered-pricing bug using only the first pet's weight for all pets, a phantom `advanceNoticeBuffer` field in the UI that never resolves from settings, and a POSModal data contract mismatch where the POS reads `serviceType`/`servicePrice` scalars but ignores the `services[]` array for its initial cart.

## Scope & Methodology

- **Sub-projects examined**: VetConnect (mobile), VetConnect-Admin (for data contract verification), VetConnect-Backend (Firestore rules)
- **Depth level**: Deep forensic analysis
- **Files inspected**: 10 files read/searched in detail
  - `VetConnect/src/hooks/useBookingEngine.js` (383 lines, full read)
  - `VetConnect/src/screens/BookAppointment.js` (~1200 lines, full read)
  - `VetConnect/src/screens/ClientAppointments.js` (partial, follow-up flow)
  - `VetConnect-Admin/src/components/POSModal.jsx` (partial, data contract)
  - `VetConnect-Admin/src/components/ClinicalWorkspace.jsx` (grep, field usage)
  - `VetConnect-Admin/src/features/Queue/Queue.jsx` (grep, field usage)
  - `VetConnect-Admin/src/features/Queue/EndOfDayModal.jsx` (grep, clinical passport fields)
  - `VetConnect-Admin/src/features/Queue/WalkInModal.jsx` (grep, schema parity)
  - `VetConnect-Admin/src/features/Queue/DispensingVerificationDialog.jsx` (grep, allergy field)
  - `VetConnect-Backend/firestore.rules` (partial, appointment create rules)

---

## Q1 -- Service-to-Pet Granularity

### Answer: ALL selected pets get the SAME services. No per-pet differentiation.

**Evidence:**

1. **Step 1** (Pet Selection) and **Step 2** (Service Selection) are completely separate wizard steps. The user selects pets first, then services. There is one shared `selectedServices` state array for the entire booking.

2. **`toggleServiceSelection`** at `BookAppointment.js:279-286` operates on a single global array:
   ```js
   const toggleServiceSelection = (srv) => {
     if (selectedServices.find(s => s.id === srv.id)) {
         setSelectedServices(selectedServices.filter(s => s.id !== srv.id));
     } else {
         setSelectedServices([...selectedServices, srv]);
     }
     setSelectedSlot(null);
   };
   ```

3. **The writeBatch** at `BookAppointment.js:391-428` iterates over `selectedPets` and writes the SAME `mappedServices` array to every appointment doc:
   ```js
   selectedPets.forEach((pet, index) => {
     // ...
     batch.set(newApptRef, {
       // ...
       services: mappedServices,  // <-- identical for all pets
       primaryService: mappedServices[0].name,
       serviceType: mappedServices[0].name,
       // ...
     });
   });
   ```

4. **Species-aware filtering** at `BookAppointment.js:176-208` is the only interaction between pet selection and services: when multiple pets of different species are selected, only "Universal" services are shown. This means mixed-species multi-pet bookings have a reduced service catalog.

**Confirmed**: No per-pet service customization exists. Every pet in a multi-pet booking receives an identical service bundle.

**Recommendation**: This is a design limitation, not a bug. If per-pet service assignment is desired (e.g., dog gets grooming, cat gets vaccination), it would require restructuring step 2 into a per-pet sub-wizard. For now, document that multi-pet bookings are "same visit type" only and advise users to book separately for different service needs.

---

## Q2 -- Full Booking Wizard Flow

### 4-Step Wizard

| Step | Header Text | Collects | Validation |
|------|------------|----------|------------|
| 1 | "Who is visiting?" | Pet selection (multi-select, max from `clinicSettings.maxPetsPerBooking`, default 3) | At least 1 pet required |
| 2 | "What do they need?" | Service bundle selection (multi-select, filtered by species + department + search) | At least 1 service required |
| 3 | "When should we expect you?" | Date (DateTimePicker) + time slot (grid) | Slot must be selected |
| 4 | "Final Details" | Notes/special instructions (free text), review summary | High-demand warning if busyness is "high" |

### State Accumulated Across Steps

All state is held in `BookAppointment` component-level `useState` hooks (`BookAppointment.js:50-70`):

- `selectedPets: []` -- array of full pet objects
- `selectedServices: []` -- array of full service objects
- `date: Date` -- selected calendar date
- `selectedSlot: string|null` -- time string like "09:00"
- `notes: string` -- free-text notes

**Downstream reset chain**: Changing pets resets services AND slot (`togglePetSelection:275-276`). Changing services resets slot (`toggleServiceSelection:285`). Changing date resets slot (`handleDateChange:293`).

### Initialization Effects

1. **Profile completeness check** (`BookAppointment.js:221-252`): On mount, fetches the user doc and checks for `address` and `emergencyName`. If missing, shows an Alert redirecting to UserProfile. This is non-blocking -- the user can dismiss it.

2. **Auto-advance for late hours** (`BookAppointment.js:214-219`): If current hour >= closeHour, bumps the date to tomorrow.

3. **Follow-up prefill** (3 effects at lines 92-124): Pre-selects pet, service, and jumps to step 3 when arriving from a follow-up deep-link.

### Final Submission (`submitBooking`, lines 297-456)

The submission is a multi-phase process:

```
Phase 1: Calculate bundle parameters (duration, price, mapped services)
Phase 2: JIT concurrency check (re-query appointments for the day)
Phase 3: Per-service department capacity verification
Phase 4: Atomic writeBatch (one doc per pet)
Phase 5: Ghost appointment cancellation (if follow-up)
Phase 6: Success alert + navigation.goBack()
```

**Confirmed**: The submission uses `writeBatch` for atomicity across multiple pet appointments but performs the JIT check outside the batch (not a transaction). This creates a TOCTOU race window.

---

## Q3 -- The Enterprise Tetris Slot Algorithm

### Location: `useBookingEngine.js:159-307`

### Algorithm Overview

```
┌─────────────────────────┐
│  Inputs:                │
│  - date                 │
│  - selectedServices[]   │
│  - selectedPets[]       │
│  - clinicSettings       │
│  - departmentCapacity   │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  1. Closed-date guard   │  ← clinicSettings.closedDates
│     (bail immediately)  │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  2. Fetch existing      │  ← getDocs(appointments) for the day
│     appointments        │     status in [pending, confirmed]
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  3. Calculate bundle:   │
│  - bundleTotalMinutes   │  ← sum(duration + buffer) for all services
│  - requiredDepts[]      │  ← department + duration per service
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  4. Build booked ranges │  ← existing appointments bucketed by
│     by department       │     department, with start/end times
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  5. Generate time grid  │  ← openHour to closeHour, step by
│     (skip lunch hours)  │     minSlotInterval (default 30)
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  6. For each slot:      │
│   For each pet (seq):   │  ← pets are SEQUENTIAL (staggered)
│    For each service:    │  ← services are SEQUENTIAL within pet
│     Check dept capacity │
└─────────────────────────┘
```

### Department-Based Capacity

**How capacity is computed** (`useBookingEngine.js:83-102`): On mount, fetches all staff docs with `accessLevel in [admin, staff]`, then counts how many staff members are assigned to each department via their `departments[]` array. This gives `departmentCapacity = { veterinary: 3, grooming: 2, ... }`.

**How capacity is checked per slot** (`useBookingEngine.js:270-289`):
For each required department in the service bundle, the algorithm counts how many existing appointments overlap with the proposed service time window in that department. If `overlaps >= capacity`, the slot is marked TAKEN.

**Critical detail**: If `departmentCapacity[dept]` is 0 (no staff in that department), the slot is blocked (`capacity === 0 || overlaps >= capacity`). This is correct.

### Multi-Pet: SEQUENTIAL, Not Parallel

**Evidence** (`useBookingEngine.js:255-258`):
```js
for (let i = 0; i < selectedPets.length; i++) {
    const petStartOffset = i * totalDurationPerPet * 60000;
    const petStartTime = new Date(slotStart.getTime() + petStartOffset);
```

Pets are scheduled back-to-back. If the bundle is 60 minutes and there are 2 pets, the total booking window is 120 minutes. Pet 1 starts at the slot time, Pet 2 starts 60 minutes later.

### Multi-Service: SEQUENTIAL Within Each Pet

**Evidence** (`useBookingEngine.js:271-289`):
```js
let serviceOffset = 0;
for (let rd of requiredDepts) {
    const svcStart = new Date(petStartTime.getTime() + serviceOffset);
    // ...
    serviceOffset += rd.duration * 60000;
}
```

Services within a pet's bundle are also sequential. If a pet has Vaccination (30 min) + Grooming (45 min), the capacity check verifies the Veterinary department is free for the first 30 min AND the Grooming department is free for the next 45 min.

### Cross-Department Services

The algorithm handles this correctly. Each service's department is checked independently at its specific time offset. A bundle of [Veterinary consultation, Grooming] checks veterinary capacity for the first window and grooming capacity for the second window.

### Closed-Dates Guard (`useBookingEngine.js:162-168`)

```js
const dateStr = getLocalDateStrMobile(date);
if ((clinicSettings.closedDates ?? []).includes(dateStr)) {
    setAvailableSlots([]);
    setLoadingSlots(false);
    return;
}
```

Returns empty slots immediately. No Firestore read needed. **Known issue**: `closedDates` is fetched via `getDoc()` (line 65), not `onSnapshot()`, so changes to closed dates won't reflect until the user remounts the screen (T2.5).

### Advance-Notice Guard (`useBookingEngine.js:230, 246-249`)

```js
const advanceNoticeTime = new Date(now.getTime() + (clinicSettings.advanceNoticeMins || 0) * 60000);
// ...
if (slotStart < advanceNoticeTime) {
    slotStatus = "TOO_SOON";
}
```

Uses `advanceNoticeMins` from clinic_settings (default 120 = 2 hours). Slots within the advance notice window are displayed but grayed out with "TOO SOON" label.

### Lunch-Break Guard (`useBookingEngine.js:239, 266-268`)

Two levels:
1. **Hour-level skip** (line 239): `if (lEnabled && h >= lStart && h < lEnd) continue;` -- skips entire lunch hours in the grid
2. **Pet-level overlap check** (line 266): Verifies a pet's service window doesn't overlap into lunch, even if it starts before lunch

**Recommendation**: The lunch overlap check on line 266 is a single dense conditional that is hard to read. Consider extracting it to a helper function for maintainability.

---

## Q4 -- The writeBatch Structure

### Documents Created

**One appointment document per selected pet.** A booking of 2 pets with 3 services creates 2 appointment docs (not 6).

### Full Field List Per Appointment Doc

Written at `BookAppointment.js:396-427`:

| Field | Value | Source |
|-------|-------|--------|
| `ownerId` | `auth.currentUser.uid` | Firebase Auth |
| `ownerName` | User's fullName or email | Fetched from users/{uid} |
| `petId` | `pet.id` | Selected pet |
| `petName` | `pet.name` | Selected pet |
| `petSpecies` | `pet.species` | Selected pet |
| `petBreed` | Normalized breed string | Selected pet (with "Mixed/Unknown" -> "Mixed Breed" mapping) |
| `petGender` | Normalized gender | Selected pet (with "UNK" -> "Unknown" mapping) |
| `petColor` | `pet.color \|\| "N/A"` | Selected pet |
| `petIsNeutered` | `pet.isNeutered \|\| false` | Selected pet |
| `petBirthdate` | `pet.dob \|\| null` | Selected pet |
| `petWeight` | `pet.weight \|\| pet.lastWeight \|\| null` | Selected pet |
| `petAllergies` | `pet.allergies \|\| "None"` | Selected pet |
| `services` | Full mapped services array | Computed from selectedServices |
| `primaryService` | `mappedServices[0].name` | First service in bundle |
| `serviceType` | `mappedServices[0].name` | First service (DUPLICATE of primaryService) |
| `serviceCategory` | `mappedServices[0].department` | First service's department |
| `serviceDuration` | `bundleTotalMinutes` | Sum of all service durations + buffers |
| `servicePrice` | `bundleTotalPrice` | Sum of all service prices |
| `status` | `"pending"` | Hardcoded initial status |
| `caseDay` | `1` | Hardcoded initial pulse |
| `scheduledDate` | `Timestamp.fromDate(petDateTime)` | Staggered per pet |
| `scheduledDateStr` | `YYYY-MM-DD` string | For Firestore rule validation |
| `triageDate` | Today's ISO date string | For admin queue routing |
| `createdAt` | `Timestamp.now()` | Server-proximate timestamp |
| `qrCode` | `VC-{uid5}-{timestamp}-{index}` | Generated per pet |
| `notes` | User notes (with group prefix for multi-pet) | User input |

### `services[]` Array Item Schema

Each item in `mappedServices` (`BookAppointment.js:327-338`):

| Field | Value |
|-------|-------|
| `id` | Service doc ID or random fallback |
| `name` | Service name |
| `price` | Resolved price (tiered or base) |
| `department` | Department string |
| `status` | `"pending"` |
| `workflowType` | `"AESTHETIC"` for Grooming, `"MEDICAL"` otherwise |
| `staffId` | `null` |
| `staffName` | `"Unassigned"` |
| `duration` | Parsed integer minutes |
| `buffer` | Parsed integer buffer minutes |

### visitGroupId: ABSENT

**Confirmed**: There is no `visitGroupId` field anywhere in the writeBatch. Multi-pet bookings produce completely independent appointment documents. The only linking signal is the `notes` field prefix: `[Group Booking 1/2]`, `[Group Booking 2/2]`.

### QR Code Generation

`BookAppointment.js:393`:
```js
const qrData = `VC-${auth.currentUser.uid.slice(0, 5)}-${Date.now()}-${index}`;
```

Format: `VC-{first 5 chars of uid}-{epoch millis}-{pet index}`. Each pet gets a unique QR. **Note**: `Date.now()` is called inside the forEach loop, so rapid iteration could produce identical timestamps for pets 0 and 1 if the loop completes within 1ms. The `index` suffix differentiates them.

### scheduledDateStr

`BookAppointment.js:422`:
```js
scheduledDateStr: `${petDateTime.getFullYear()}-${String(petDateTime.getMonth() + 1).padStart(2, '0')}-${String(petDateTime.getDate()).padStart(2, '0')}`,
```

This matches the format expected by the Firestore security rule at `firestore.rules:14-18`, which rejects creates where `scheduledDateStr` is in `clinic_settings/general.closedDates[]`.

**Recommendation**: Extract this date formatting to `getLocalDateStrMobile()` (already exported from useBookingEngine) instead of duplicating the logic inline.

---

## Q5 -- B5 Follow-Up Deep-Link Handling

### Flow Diagram

```
┌──────────────────────┐
│ ClientAppointments.js│
│ (ghost follow-up row)│
└──────────┬───────────┘
           │ handleBookFollowUp()
           │
           ▼
┌──────────────────────┐     getDoc()     ┌───────────────────┐
│ Fetch clinic_settings│ ────────────────► │ clinic_settings/  │
│ for closedDates      │                   │ general           │
└──────────┬───────────┘                   └───────────────────┘
           │
           ▼
┌──────────────────────┐
│ findFirstBookableDate│
│ (target, 3, settings)│
│ tolerance: +/-3 days │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐     navigate()    ┌───────────────────┐
│ Build route params:  │ ────────────────► │ BookAppointment   │
│ - prefillPetId       │                   │ (auto-prefill)    │
│ - prefillServiceType │                   │                   │
│ - prefillDate        │                   │ Steps 1+2 auto    │
│ - prefillDateMatchType                   │ Jump to step 3    │
│ - prefillTargetDate  │                   │                   │
│ - fromFollowUp: true │                   │                   │
│ - ghostAppointmentId │                   │                   │
└──────────────────────┘                   └───────────────────┘
```

### Route Params Received

From `ClientAppointments.js:300-308`:
- `prefillPetId` -- the ghost appointment's `petId`
- `prefillServiceType` -- resolved from parent medical record's `serviceType` (falls back to ghost's `serviceType` which is always "Follow-Up Visit")
- `prefillDate` -- ISO string from `findFirstBookableDate` result
- `prefillDateMatchType` -- `'exact'`, `'tolerance'`, or `'scan'`
- `prefillTargetDate` -- the original vet-recommended date (ISO string)
- `fromFollowUp` -- `true`
- `ghostAppointmentId` -- the ghost appointment's doc ID

### Prefill Mechanics in BookAppointment

Three `useEffect` hooks handle prefill (`BookAppointment.js:92-124`):

1. **Pet prefill** (lines 92-97): When `prefillPetId` matches a pet in the loaded list, auto-selects it. Fires when pets load.
2. **Service prefill** (lines 101-108): Matches `prefillServiceType` against service names. Fires when services load.
3. **Step jump** (lines 113-124): Once both pet and service are selected AND `prefillDate` is present, parses the date, sets it, and jumps to step 3. Uses a `useRef` guard (`prefillApplied`) to ensure this fires only once.

### Follow-Up Date Hint UI

`BookAppointment.js:720-727`: If the date was shifted (matchType !== 'exact'), a hint banner shows:
> "Your vet recommended [original date] -- showing [shifted date] (nearest available)."

### Ghost Cancellation After Booking

`BookAppointment.js:434-444`: After the batch commit succeeds, if `fromFollowUp && ghostAppointmentId`, the ghost appointment is updated to:
```js
{
  status: 'cancelled',
  auditReason: 'client-booked-followup',
  cancelledAt: Timestamp.now(),
}
```

This is a separate `updateDoc` call (not in the batch), wrapped in try/catch. **Non-fatal**: if it fails, the booking still succeeded. The ghost will remain visible in the client's upcoming list until manually cleaned.

### `findFirstBookableDate` Algorithm

`useBookingEngine.js:340-382`:

1. **Exact match**: Try the target date itself (skip if closed or in the past)
2. **Tolerance window**: Expand +/-1, +/-2, +/-3 days (before then after for each delta)
3. **Linear scan**: From today forward, up to 14 days
4. **Failure**: Returns `{ date: null, matchType: 'none' }`

**Important**: This does NOT check department capacity or slot availability. It only checks if the clinic is open (not in `closedDates` and not in the past). A date may be returned that has zero available slots.

**Recommendation**: The fallback in `ClientAppointments.js:286-296` when `matchType === 'none'` still navigates to BookAppointment without a `prefillDate`, which means the step-3 jump won't fire and the user starts at step 1. This is acceptable but could be documented.

---

## Q6 -- Multi-Pet Gaps and Issues

### Can a user book 2 pets with DIFFERENT services?

**No.** Service selection is global. All pets receive the same `mappedServices` array. The species filter at step 2 restricts the service catalog to the intersection of species-compatible services, but the selection itself is uniform.

### Can a user book 2 pets for DIFFERENT dates?

**No.** There is one shared `date` state. All pets are booked on the same date, with staggered times within that date.

### What happens if one pet's service requires a department with zero capacity?

The slot algorithm correctly blocks this. At `useBookingEngine.js:282-283`:
```js
const capacity = departmentCapacity[rd.name] || 0;
if (capacity === 0 || overlaps >= capacity) { canFitAll = false; ... }
```
If ANY service in the bundle requires an unstaffed department, ALL slots show as TAKEN. The user cannot proceed. **However**, there is no explicit error message explaining WHY no slots are available -- the user just sees an empty slot grid with the message "No available slots remaining for this date."

**Recommendation**: Add diagnostic messaging when all slots are blocked due to a zero-capacity department, e.g., "The [department] department has no staff assigned. Please contact the clinic."

### Race Conditions in the writeBatch

**Yes, there is a TOCTOU race.** The JIT concurrency check at `BookAppointment.js:347-387` queries existing appointments and checks capacity OUTSIDE the batch transaction. Between the check and the `batch.commit()`, another client could book the same slot. This is mitigated by:
1. The check being close in time to the commit
2. The server-side `secureBookAppointment` Cloud Function (if used) provides additional validation

However, the mobile client does NOT use `secureBookAppointment` -- it writes directly via `writeBatch`. The Cloud Function exists but is not called from BookAppointment.js.

**Confirmed**: The race window is real but narrow. For a low-traffic vet clinic this is unlikely to cause issues, but it's architecturally unsound.

**Recommendation**: Either (a) switch to `runTransaction` which retries on contention, or (b) route all bookings through `secureBookAppointment` Cloud Function which can enforce server-side serialization.

### Validation Before Submission

| Check | Location | Type |
|-------|----------|------|
| Pet selected | `handleNext:460` | UI gate |
| Service selected | `handleNext:462` | UI gate |
| Slot selected | `handleNext:464` | UI gate |
| Profile complete (address, emergency) | `initializeUser:228` | Alert on mount (non-blocking) |
| JIT department capacity | `submitBooking:358-387` | Pre-flight Firestore query |
| Closed date | Firestore security rule | Server-side reject |
| High-demand warning | `handleNext:467-478` | Confirmation dialog |

**Missing validations**:
- No check that the selected date is not in the past at submission time (only the slot algorithm filters past slots)
- No check for `maxPetsPerBooking` at submit time (only enforced in `togglePetSelection`)
- No validation that the user hasn't been banned or suspended

### Error Handling if Batch Fails

`BookAppointment.js:451-454`:
```js
} catch (error) {
    Alert.alert("Error", error.message);
} finally {
    setLoading(false);
}
```

Generic error alert with the raw error message. No retry logic, no partial rollback (the batch is atomic so partial writes aren't an issue), no analytics/logging. The `finally` block properly clears the loading state.

---

## Q7 -- Data Contract with Admin Dashboard

### Fields Written by Mobile, Read by Admin

| Mobile Field | Admin Consumer | How Used |
|---|---|---|
| `services[]` | Queue.jsx:507, queueColumns.jsx:327, EndOfDayModal.jsx:226-371, AssignStaffModal.jsx:36, ClinicalWorkspace.jsx:374-415 | Service list display, staff assignment, workflow completion tracking |
| `primaryService` | Queue.jsx:552, ClinicalWorkspace.jsx:494,836 | Queue sorting, base service lookup |
| `serviceType` | POSModal.jsx:52-53, ClinicalWorkspace.jsx:912, PatientDashboard.jsx:123,852, Monitor.jsx:92 | POS initial cart, medical record creation, patient timeline display |
| `serviceCategory` | useGlobalRecords.js:39, Records.jsx facets | Record filtering by department |
| `servicePrice` | POSModal.jsx:53 | POS base service fee |
| `serviceDuration` | EndOfDayModal.jsx:226 (via services[].duration) | Duration estimates |
| `petBreed`, `petGender`, `petColor`, `petIsNeutered`, `petWeight`, `petAllergies` | EndOfDayModal.jsx:229-303, AssignStaffModal.jsx:250-256, DispensingVerificationDialog.jsx:30-32 | Clinical passport display, allergy alerts |
| `caseDay` | Queue.jsx:372,426,784, EndOfDayModal.jsx:921,998, Records.jsx:434 | Case day tracking, carry-over logic |
| `triageDate` | Queue.jsx:853,990-994 | Pending appointment routing to correct day |
| `scheduledDateStr` | Firestore rules only | Closed-date enforcement |
| `qrCode` | Not found in admin grep | Mobile-only (QR display on client side) |

### Critical Mismatches

#### 1. POSModal uses `serviceType`/`servicePrice` scalars, ignoring `services[]`

**Evidence**: `POSModal.jsx:52-53`:
```js
const baseService = servicesList.find(s => s.name === patient.serviceType);
initialCart.push({ ..., name: patient.serviceType, price: patient.servicePrice || 0, ... });
```

The POS builds its initial cart from the SCALAR `serviceType` and `servicePrice` fields. For a single-service booking this works fine. For a multi-service bundle, `serviceType` is only the FIRST service's name and `servicePrice` is the TOTAL price of all services combined. This means:
- The POS shows one line item at the total bundle price instead of itemized services
- The POS does not know about the 2nd, 3rd, etc. services in the bundle

**Recommendation**: POSModal should iterate `patient.services[]` to build individual cart line items instead of relying on the scalar summary fields. This is a significant billing accuracy issue for multi-service bookings.

#### 2. `serviceBuffer` is NOT written to the appointment root

The appointment doc has `serviceDuration` (total including buffers) but no standalone `serviceBuffer` field at the root level. The buffer IS present inside each `services[]` item as the `buffer` field. The admin's `EndOfDayModal.jsx:226` reads duration from `services[].duration`, which is correct. But the `checkClinicLoad` busyness calculator (`useBookingEngine.js:139`) reads `data.serviceDuration || 30` and `data.serviceBuffer || 0` -- the `serviceBuffer` root field doesn't exist, so it always gets 0. This means the busyness calculator underestimates appointment lengths for bookings with buffer time.

**Recommendation**: Either write `serviceBuffer: totalBufferMinutes` to the appointment root, or fix the busyness calculator to derive buffer from `services[].buffer`.

#### 3. Fields the admin writes that mobile doesn't

The admin's WalkInModal writes additional fields not present in mobile bookings:
- `reproductiveStatus` -- WalkInModal resolves this; mobile writes `petIsNeutered` instead
- `petMarkings` -- WalkInModal writes this; mobile doesn't
- `petMicrochip` -- WalkInModal writes this; mobile doesn't

These aren't mismatches per se (the admin gracefully handles missing fields with fallbacks), but they do mean walk-in appointments have richer clinical passports than mobile bookings.

---

## Q8 -- Other Issues Found

### BUG: Tiered Pricing Uses Only First Pet's Weight

**Evidence** (`BookAppointment.js:308`):
```js
const primaryPetWeight = selectedPets[0]?.lastWeight ? parseFloat(selectedPets[0].lastWeight) : null;
```

Then at line 322: `const price = resolveTieredPrice(s, primaryPetWeight);`

For a multi-pet booking of a 5kg Chihuahua and a 40kg Labrador, BOTH appointment docs get the Chihuahua's tiered price. This is a billing accuracy bug.

**Recommendation**: Move the `resolveTieredPrice` call inside the `selectedPets.forEach` loop and use each pet's own weight. The `mappedServices` array should be rebuilt per pet. Severity: HIGH for clinics using weight-based pricing.

### BUG: `advanceNoticeBuffer` vs `advanceNoticeMins` Field Name Mismatch

**Evidence** (`BookAppointment.js:701`):
```js
const leadHours = clinicSettings?.advanceNoticeBuffer || 2;
```

The field `advanceNoticeBuffer` does not exist in `clinic_settings/general`. The actual field is `advanceNoticeMins` (used correctly in `useBookingEngine.js:230`). This means the "Scheduling Insight" UI text always shows "2 hour notice" regardless of the actual setting. The slot algorithm itself uses the correct field -- only the display text is wrong.

**Recommendation**: Change to `const leadHours = (clinicSettings?.advanceNoticeMins || 120) / 60;`

### BUG: `resolveTieredPrice` is Duplicated Between Mobile and Admin

**Evidence**: `BookAppointment.js:310-315` contains a local copy of tiered pricing logic. The admin has `VetConnect-Admin/src/utils/resolveTieredPrice.js`. These could diverge.

**Recommendation**: Not directly fixable (separate packages), but worth noting. At minimum, keep the logic identical.

### ISSUE: `scheduledDateStr` Inline Formatting

**Evidence** (`BookAppointment.js:422`): The date-to-string logic is written inline instead of using `getLocalDateStrMobile()` which is already exported from useBookingEngine.js and does the exact same formatting.

**Recommendation**: Replace with `scheduledDateStr: getLocalDateStrMobile(petDateTime)`.

### ISSUE: No Loading State for Initial User Fetch

The `initializeUser` async call at line 221 runs in the background. If the user proceeds quickly through step 1, they could attempt to submit before `ownerName` is populated. The `ownerName` field would default to `""`.

### UX CONCERN: Mixed-Species Service Catalog Collapse

When a user selects both a Dog and a Cat, `displayedServices` filters to only "Universal" services (`BookAppointment.js:187`). If the user doesn't notice this filtering, they might be confused about why certain services disappeared. There's no explicit warning about this.

**Recommendation**: Show a banner in step 2: "You selected mixed species -- only services compatible with both dogs and cats are shown."

### PERFORMANCE: Slot Generation Re-queries Appointments on Every Dependency Change

`useBookingEngine.js:307` has a dependency array `[date, selectedServices, selectedPets, clinicSettings, departmentCapacity]`. Every time the user toggles a service, the entire `generateSlots` function runs, which includes a `getDocs` call to Firestore. For rapid service toggling, this could produce many queries.

**Recommendation**: Consider debouncing the slot generation, or caching the day's appointments and only re-running the computation (not the query) when services/pets change but the date hasn't.

### DEAD CODE: None Found

The codebase is relatively clean of dead code in these two files.

### TODO/FIXME Comments: None Found

No TODO or FIXME comments in either file.

---

## Component Connection Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    BookAppointment.js                            │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────┐ │
│  │ Step 1   │  │ Step 2   │  │ Step 3   │  │ Step 4          │ │
│  │ Pet      │→ │ Service  │→ │ Date/Slot│→ │ Review/Submit   │ │
│  │ Select   │  │ Bundle   │  │ Picker   │  │ writeBatch()    │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬────────┘ │
│       │              │             │                  │          │
│  selectedPets  selectedServices  date+slot    submitBooking()   │
│       │              │             │                  │          │
│       └──────────────┴─────────────┘                  │          │
│                      │                                │          │
│              useBookingEngine(date, services, pets)    │          │
│              ┌───────┴──────────┐                     │          │
│              │ Returns:          │                     │          │
│              │ - pets (onSnap)   │                     │          │
│              │ - services        │                     │          │
│              │ - availableSlots  │                     │          │
│              │ - busynessLevel   │                     │          │
│              │ - clinicSettings  │                     │          │
│              │ - deptCapacity    │                     │          │
│              └───────────────────┘                     │          │
└───────────────────────────────────────────────────────┼──────────┘
                                                        │
                          ┌─────────────────────────────┘
                          │
                          ▼ writeBatch
                ┌─────────────────────┐
                │ Firestore:          │
                │ appointments/       │
                │ (1 doc per pet)     │
                │                     │
                │ Security rule:      │
                │ scheduledDateStr    │
                │ NOT in closedDates  │
                └─────────┬───────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
   ┌──────────┐   ┌──────────────┐  ┌──────────┐
   │ Queue.jsx│   │ Clinical     │  │ POSModal │
   │ reads:   │   │ Workspace    │  │ reads:   │
   │ services │   │ reads:       │  │ service  │
   │ primary  │   │ services[]   │  │ Type ⚠️  │
   │ Service  │   │ primarySvc   │  │ service  │
   │ triageD  │   │ workflowType │  │ Price ⚠️ │
   └──────────┘   └──────────────┘  └──────────┘
```

---

## Data Flow: End-to-End Booking

```
1. User opens BookAppointment
   │
   ├─→ useBookingEngine mount effect fires
   │   ├─→ onSnapshot(pets where ownerId == uid)     [REAL-TIME]
   │   ├─→ getDoc(clinic_settings/general)            [ONE-SHOT]
   │   ├─→ getDocs(services)                          [ONE-SHOT]
   │   └─→ getDocs(users where accessLevel in [admin,staff])  [ONE-SHOT]
   │
   ├─→ initializeUser: getDoc(users/{uid}) → profile check
   │
2. User selects pets (step 1)
   │   └─→ Species filter computed for step 2
   │
3. User selects services (step 2)
   │   └─→ Triggers useBookingEngine slot regeneration
   │       └─→ getDocs(appointments for selected date)
   │           └─→ Enterprise Tetris algorithm runs
   │               └─→ availableSlots state updated
   │
4. User picks date + slot (step 3)
   │
5. User reviews + submits (step 4)
   │
   ├─→ JIT concurrency check: getDocs(appointments for day)
   │   └─→ Per-service department overlap counting
   │       └─→ If capacity exceeded → Alert + revert to step 3
   │
   ├─→ writeBatch.set() × selectedPets.length
   │   └─→ batch.commit()
   │       └─→ Firestore security rule: isScheduledDateClosed()
   │
   ├─→ If follow-up: updateDoc(ghost appointment → cancelled)
   │
   └─→ Alert("Success") → navigation.goBack()
```

---

## Historical Design Decisions

1. **Multi-service was retrofitted**: The comment at line 54 ("THE FIX: Moving to Array for Bundles!") and the dual `serviceType`/`primaryService`/`services[]` fields suggest the system originally supported only one service per appointment. The array was added later, but the scalar fields were kept for backward compatibility.

2. **Department routing replaced role routing**: Comments at `useBookingEngine.js:24` ("We renamed 'roleCounts' to 'departmentCapacity' because we now use Skill-Based Routing!") indicate a shift from role-based to department-based capacity tracking. Legacy fallback code at line 95-98 handles old staff records.

3. **JIT concurrency check was a "Fatal Flaw Fix"**: The comment at line 296 ("THE FATAL FLAW FIX: JIT CONCURRENCY CHECK") suggests there was a period where the booking had no server-side validation at all -- the client would book blind based on stale slot data.

4. **Clinical Passport denormalization was intentional**: The explicit "EVOLVED SCHEMA: The Clinical Passport" comment at line 403 suggests these denormalized pet fields were added deliberately so the admin queue can display pet details without joining to the pets collection.

---

## Open Questions / Areas of Uncertainty

1. **Is `secureBookAppointment` Cloud Function still active?** The mobile client bypasses it entirely, writing directly via `writeBatch`. Is the CF dead code, or is it used by another path?

2. **Does the admin's WalkInModal produce appointment docs with the same schema?** Grep evidence suggests high overlap but I did not do a full field-by-field comparison.

3. **What happens to `serviceBuffer` in the busyness calculator?** The root-level `serviceBuffer` field is never written by BookAppointment. The busyness check reads it and gets 0. Does this cause meaningful inaccuracy?

4. **Are there any appointments in Firestore that lack `scheduledDateStr`?** Pre-B5 appointments may not have this field, which would bypass the security rule (the rule only enforces when the field is present).

---

## Appendix: File Inventory

| File | Lines Read | Purpose |
|------|-----------|---------|
| `VetConnect/src/hooks/useBookingEngine.js` | 1-383 (full) | Slot computation engine |
| `VetConnect/src/screens/BookAppointment.js` | 1-1200 (full) | Booking wizard UI |
| `VetConnect/src/screens/ClientAppointments.js` | 260-320 | Follow-up deep-link |
| `VetConnect-Admin/src/components/POSModal.jsx` | 40-70 | POS data contract |
| `VetConnect-Admin/src/components/ClinicalWorkspace.jsx` | grep | Field usage |
| `VetConnect-Admin/src/features/Queue/Queue.jsx` | grep | Field usage |
| `VetConnect-Admin/src/features/Queue/EndOfDayModal.jsx` | grep | Clinical passport |
| `VetConnect-Admin/src/features/Queue/WalkInModal.jsx` | grep | Schema parity |
| `VetConnect-Admin/src/features/Queue/AssignStaffModal.jsx` | grep | Field usage |
| `VetConnect-Admin/src/features/Queue/DispensingVerificationDialog.jsx` | grep | Allergy field |
| `VetConnect-Backend/firestore.rules` | 1-40 | Appointment create rules |

---

## Summary of Actionable Findings

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 1 | No `visitGroupId` for multi-pet bookings | Medium | T2.78 (already planned) |
| 2 | Tiered pricing uses first pet's weight for all pets | **HIGH** | Move `resolveTieredPrice` inside per-pet loop |
| 3 | `advanceNoticeBuffer` phantom field in UI display | Low | Change to `advanceNoticeMins / 60` |
| 4 | POSModal reads scalar `serviceType`/`servicePrice`, not `services[]` | **HIGH** | Refactor POSModal to iterate `services[]` for multi-service bookings |
| 5 | TOCTOU race in JIT check vs batch commit | Medium | Use `runTransaction` or route through CF |
| 6 | `serviceBuffer` never written to appointment root | Low | Write it, or fix busyness calc to read from `services[]` |
| 7 | `scheduledDateStr` formatting duplicated inline | Low | Use `getLocalDateStrMobile()` |
| 8 | No diagnostic message when zero-capacity dept blocks all slots | Medium | Add department-specific error messaging |
| 9 | No mixed-species service filter warning | Low | Add banner in step 2 |
| 10 | Slot generation re-queries Firestore on every service toggle | Low | Debounce or cache day's appointments |
