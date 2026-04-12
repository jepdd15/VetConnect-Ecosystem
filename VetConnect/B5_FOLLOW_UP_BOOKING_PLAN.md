# B5 — One-Tap Follow-Up Booking — Implementation Plan

## Header

**Feature**: One-tap client-side follow-up booking on the mobile Upcoming tab, driven by vet-authored `nextVisit` recommendations that already auto-create "ghost" pending appointments.

**Effort estimate**: Large (~4-6 focused hours for a single session). Three files are changed non-trivially and one new helper is extracted.

**Core insight / through-line**: *A follow-up is just a pending appointment with extra emphasis.* B5 is NOT a new component — it is a styling variant of the existing appointment row inside `ClientAppointments.js`, plus a prefill date cascade inside `BookAppointment.js`. The ghost already exists in Firestore the moment the vet hits "Sign & Save" on the SOAP form. We are only polishing its presentation and making "Book this visit" one tap away.

### In scope

1. Visually distinct follow-up row inside the existing Upcoming list (warm amber accent, "FOLLOW-UP RECOMMENDED" ribbon, subtitle from parent diagnosis + vet name).
2. `handleBookFollowUp(item)` — computes target date via ±3 day tolerance window, navigates to BookAppointment with `{ prefillPetId, prefillServiceType, prefillDate, fromFollowUp: true }`.
3. `handleDismissFollowUp(item)` — confirm-gated cancel that stamps `cancelReason: 'client-dismissed-followup'` so the ghost disappears from Upcoming and is filtered out of History.
4. Stacked display when there are multiple follow-ups for one pet (sorted ascending by date).
5. ±3 day fallback cascade inside BookAppointment when `prefillDate` is passed.
6. On successful follow-up booking via deep link, cancel the original ghost with `cancelReason: 'client-booked-followup'`.
7. `sanitizeCancelReason()` support for both new reason codes.

### Out of scope

- New "Recheck" service category in the `services` catalog.
- Push notifications / SMS reminders for follow-ups (Spark plan, no Functions writes for notifications).
- PDF export of follow-up reminders.
- Admin Settings UI for follow-up default windows.
- Full B6 timeline integration (discharge, vaccine, lab blocks on `PetHistoryScreen` already render; B4 handles polish).
- Concurrent dismissal + regeneration guard in `ClinicalWorkspace.jsx`. See **Deferred** section.
- Fixing the fact that `ClinicalWorkspace.handleSaveConsult` hardcodes the follow-up `serviceType` to `'Follow-Up Visit'`. See **Deferred**.

---

## Prerequisites

- `clinic_settings/general.closedDates` must exist (already consumed by `useBookingEngine`). No new config required.
- No new Firestore fields on existing docs — the fields the ghost uses (`isFollowUp`, `parentAppointmentId`, `parentRecordId`, `status`, `date`, `scheduledDate`, `serviceType`, `petId`, `notes`) are already written today.
- No new indexes (the existing `appointments` query on `ownerId + createdAt desc` covers the new detection logic).

---

## Source-of-truth verification (read before coding)

These were verified against the current repo state. Line numbers are approximate anchors for a single-session implementer.

### 1. The ghost follow-up write (`VetConnect-Admin/src/components/ClinicalWorkspace.jsx` lines 978-1009)

```js
// B2: Auto-create follow-up appointment (1 conditional write)
if (soapData.nextVisit) {
    const followUpRef = doc(collection(db, "appointments"));
    const followUpDate = new Date(soapData.nextVisit);
    followUpDate.setHours(8, 0, 0, 0);
    batch.set(followUpRef, {
        petId: patient.petId || 'WALK_IN_PET',
        petName: patient.petName,
        // ...pet identity fields...
        ownerId: patient.ownerId || 'WALK_IN_USER',
        ownerName: patient.ownerName || 'Walk-In Client',
        serviceType: 'Follow-Up Visit',     // <-- HARDCODED (see Deferred)
        primaryService: 'Follow-Up Visit',
        services: [{ id: 'follow_up', name: 'Follow-Up Visit', price: 0 }],
        status: 'pending',
        date: Timestamp.fromDate(followUpDate),
        scheduledDate: Timestamp.fromDate(followUpDate),
        createdAt: commitTimestamp,
        notes: `Follow-up from visit on ${new Date().toLocaleDateString()}. Diagnosis: ${soapData.assessment || 'N/A'}. Recheck: ${soapData.recheckIn || 'N/A'}.`,
        isFollowUp: true,
        parentAppointmentId: patient.id,
        parentRecordId: recordRef.id,
        source: 'clinical_workspace',
    });
}
```

**Confirmed behaviors the implementer can rely on:**

- `isFollowUp === true` is present on every follow-up ghost.
- `status: 'pending'` and `scheduledDate` are always set (8:00 AM Asia/Manila local on `nextVisit` date).
- `parentAppointmentId` and `parentRecordId` are always populated — safe to join.
- `petId` will be `'WALK_IN_PET'` for walk-in ghosts. B5 must NOT offer the book-followup CTA on those rows (no usable owner account).

**Confirmed surprises** (must be worked around, NOT trusted from prior design notes):

- `serviceType` is NOT inherited from the parent — it is literally the string `'Follow-Up Visit'`. The earlier architect note said "inherit parent record's serviceType verbatim." That note was a design intent, not present code. See **Data enrichment strategy** below for the join path that recovers the true parent service.
- The follow-up row has NO `vetName` field. The vet name is stored on the medical record at `medical_records/<parentRecordId>.dischargeSummary.vetName`. The banner subtitle needs a join.
- `diagnosis` for the banner subtitle lives at `medical_records/<parentRecordId>.dischargeSummary.diagnosis` (client-safe copy) OR `medical_records/<parentRecordId>.soap.assessment` (raw). Prefer `dischargeSummary.diagnosis`.
- The ghost's `notes` field already contains `"Diagnosis: <assessment>"` — a fallback if the join fails.

### 2. Upcoming tab filter (`VetConnect/src/screens/ClientAppointments.js` lines 218-246)

The "upcoming" tab currently includes `'pending'` in its valid-status set. Follow-up ghosts will appear in the list by default. No changes to the filter set itself — the follow-up treatment is a per-row render branch.

### 3. History tab filter (same file, same block)

Currently: `["completed", "cancelled", "no-show", "carried-over"].includes(item.status)`. A dismissed follow-up ghost becomes `status: 'cancelled'` and would appear here. We add a secondary filter for `cancelReason === 'client-dismissed-followup'` to keep the history clean.

### 4. Prefill path (`VetConnect/src/screens/BookAppointment.js` lines 37-38, 83-99)

```js
const prefillPetId = route?.params?.prefillPetId || null;
const prefillServiceType = route?.params?.prefillServiceType || null;

useEffect(() => {
  if (prefillPetId && pets.length > 0 && selectedPets.length === 0) {
    const match = pets.find(p => p.id === prefillPetId);
    if (match) setSelectedPets([match]);
  }
}, [prefillPetId, pets]);

useEffect(() => {
  if (prefillServiceType && services.length > 0 && selectedServices.length === 0) {
    const match = services.find(
      s => s.serviceType === prefillServiceType || s.name === prefillServiceType,
    );
    if (match) setSelectedServices([match]);
  }
}, [prefillServiceType, services]);
```

These two effects are idempotent and warm. The third effect B5 adds follows the same pattern.

### 5. Closed-date guard (`VetConnect/src/hooks/useBookingEngine.js` lines 162-168)

```js
const dateStr = getLocalDateStrMobile(date);
if ((clinicSettings.closedDates ?? []).includes(dateStr)) {
  setAvailableSlots([]);
  setLoadingSlots(false);
  return;
}
```

`clinicSettings.closedDates` is already an array of ISO `YYYY-MM-DD` strings. Reuse this list in the new fallback helper. Do NOT add a second copy of the normalizer — export `getLocalDateStrMobile` from the hook file instead (see Phase 3).

### 6. `sanitizeCancelReason` (`VetConnect/src/utils/statusLabels.js` lines 168-181)

Current rules short-circuit on specific tokens and fall through to the trimmed raw string. `'client-dismissed-followup'` and `'client-booked-followup'` currently fall through to the raw string, which would appear as user-facing text on the History cards. Both must return `''` (empty) so the `reasonText` block in `ClientAppointments.js` line 345-349 is suppressed entirely.

### 7. Active in-clinic appointment pin-up (`VetConnect/src/screens/ClientAppointments.js` lines 355-358, 456)

SuperCard filters out the active appointment from the main FlatList. Follow-up ghosts are `pending` and NEVER `active` per `statusLabels.STATUS_META.pending.active === false`, so they will not be swallowed by the SuperCard — safe.

---

## File-by-file change list

| # | File | Lines (approx) | Change |
|---|---|---|---|
| 1 | `VetConnect/src/screens/ClientAppointments.js` | +150 lines added, touches 78-96, 218-246, 248-353, 559-720 | Add `parentRecordJoin` state + fetcher, add `handleBookFollowUp`, `handleDismissFollowUp`, split render into `renderFollowUpRow` vs regular row, filter dismissed rows from History, append styles for follow-up treatment. |
| 2 | `VetConnect/src/screens/BookAppointment.js` | +50 lines, touches 37-38 and the initialization block around 186-229 | Add `prefillDate` and `fromFollowUp` param destructuring. Add third `useEffect` that runs `findFirstBookableDate` and advances the wizard to step 3. On `submitBooking` success, if `fromFollowUp` was passed, `updateDoc` the original ghost to cancelled. |
| 3 | `VetConnect/src/hooks/useBookingEngine.js` | +40 lines appended, touches lines 14-18 | Export `getLocalDateStrMobile`. Add a new named export `findFirstBookableDate(targetDate, toleranceDays, clinicSettings)` — pure function, reuses the same closed-dates guard. Returns `{ date: Date, matchType: 'exact' \| 'tolerance' \| 'scan' \| 'none' }`. |
| 4 | `VetConnect/src/utils/statusLabels.js` | +4 lines | Add two new priority rules to `sanitizeCancelReason` that return `''` for the two new machine reason codes. |

No schema changes. No Cloud Function changes. No new files.

---

## Data contract

### Fields the feature READS

| Collection | Field | Source | Purpose |
|---|---|---|---|
| `appointments` | `isFollowUp` | Already written by `ClinicalWorkspace` | Row type discriminator |
| `appointments` | `status` | Already written | `'pending'` gate |
| `appointments` | `parentAppointmentId` | Already written | (optional) trace back to parent visit |
| `appointments` | `parentRecordId` | Already written | Join key to fetch diagnosis + vetName |
| `appointments` | `scheduledDate` | Already written | Recommended follow-up date (8:00 AM Manila) |
| `appointments` | `notes` | Already written | Fallback source of diagnosis text if join fails |
| `appointments` | `petId` | Already written | Guard against `'WALK_IN_PET'` |
| `appointments` | `petName` | Already written | Banner subtitle |
| `appointments` | `serviceType` | Already written (value is always `'Follow-Up Visit'`) | **Do NOT use for prefill** — see below |
| `medical_records` | `dischargeSummary.diagnosis` | Already written | Banner subtitle primary source |
| `medical_records` | `dischargeSummary.vetName` | Already written | Banner subtitle vet name |
| `medical_records` | `serviceType` | Already written | **THE value to use for `prefillServiceType`** — this is the parent visit's true service |

### Fields the feature WRITES

| Collection | Field | Value | When |
|---|---|---|---|
| `appointments/<ghostId>` | `status` | `'cancelled'` | Dismiss OR successful booking via deep link |
| `appointments/<ghostId>` | `cancelReason` | `'client-dismissed-followup'` OR `'client-booked-followup'` | Matches the trigger |
| `appointments/<ghostId>` | `cancelledAt` | `Timestamp.now()` | Both cases |

**Nothing else is written.** The `medical_records.nextVisit` stays intact so the vet's recommendation is preserved even on dismissal.

---

## Phase breakdown

### Phase 0 — Setup verification (5 min)

Before writing any code, verify on device or with a quick Firestore console query that at least one `appointments` doc exists where `isFollowUp === true`. If none exist, complete a throwaway SOAP encounter in `ClinicalWorkspace` with a `nextVisit` date set to seed test data. This is a prerequisite for Phase 2 visual verification.

**Checkpoint**: `appointments` collection shows at least one doc with `{ isFollowUp: true, status: 'pending', parentRecordId: <id> }`.

### Phase 1 — Helper extraction in `useBookingEngine.js`

**Goal**: Expose a pure, testable date-cascade function that `BookAppointment` can call without duplicating closed-date logic.

**Steps**:

1. At line 14-18 (the existing `getLocalDateStrMobile`), change from `const` to `export const`.
2. At the bottom of the file (after the hook's `export function`, before or after it — either works since it's a separate export), add a new named export:

```js
/**
 * Walks candidate dates around a target and returns the first one that is
 * NOT in clinicSettings.closedDates and NOT in the past.
 *
 * Cascade:
 *   1. Exact target date (if not closed and not past)
 *   2. target ± 1, ± 2, ..., ± toleranceDays (prefer before, then after)
 *   3. If nothing in tolerance, linear scan forward up to 14 days from today
 *   4. If still nothing, return { matchType: 'none' }
 *
 * Does NOT check department capacity — that is handled by generateSlots
 * once the wizard lands on step 3. This helper only answers "is the clinic
 * open on day X".
 */
export const findFirstBookableDate = (targetDate, toleranceDays, clinicSettings) => {
  const closed = new Set(clinicSettings?.closedDates ?? []);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isBookable = (d) => {
    const normalized = new Date(d);
    normalized.setHours(0, 0, 0, 0);
    if (normalized < today) return false;
    return !closed.has(getLocalDateStrMobile(normalized));
  };

  // 1. Exact
  const exact = new Date(targetDate);
  exact.setHours(8, 0, 0, 0);
  if (isBookable(exact)) {
    return { date: exact, matchType: 'exact' };
  }

  // 2. Tolerance window — symmetric expand
  for (let delta = 1; delta <= toleranceDays; delta++) {
    for (const sign of [-1, 1]) {
      const candidate = new Date(exact);
      candidate.setDate(candidate.getDate() + (sign * delta));
      if (isBookable(candidate)) {
        return { date: candidate, matchType: 'tolerance' };
      }
    }
  }

  // 3. Linear scan from today forward, cap 14 days
  const scanStart = new Date(today);
  for (let i = 0; i <= 14; i++) {
    const candidate = new Date(scanStart);
    candidate.setDate(candidate.getDate() + i);
    candidate.setHours(8, 0, 0, 0);
    if (isBookable(candidate)) {
      return { date: candidate, matchType: 'scan' };
    }
  }

  return { date: null, matchType: 'none' };
};
```

3. Do NOT touch the existing `useBookingEngine` function body. The helper is a sibling, not an internal.

**Checkpoint**: `npm start` runs clean. `import { findFirstBookableDate, getLocalDateStrMobile } from '../hooks/useBookingEngine'` resolves without errors.

### Phase 2 — `statusLabels` sanitizer support

**Goal**: Prevent the two new internal cancel reason codes from leaking to UI.

**Steps**:

1. In `VetConnect/src/utils/statusLabels.js`, inside `sanitizeCancelReason` between the existing `lower.startsWith('shift cleanup:')` rule and the `lower.startsWith('forensic')` rule, add:

```js
if (lower === 'client-dismissed-followup') return '';
if (lower === 'client-booked-followup') return '';
```

The priority order matters: both must return `''` before the fallthrough to trimmed raw string. Because these are exact-match lowercase tokens, they can also live at the top — either works.

**Checkpoint**: Manual test — pass `sanitizeCancelReason('client-dismissed-followup')` from a dev console, confirm it returns `''`.

### Phase 3 — `ClientAppointments.js` — follow-up row treatment

**Goal**: Render follow-up ghosts with banner emphasis and action buttons. This is the largest phase.

**Sub-step 3.1 — Parent record join fetcher**

After the existing `fetchSalesForCompleted` function (around line 132), add:

```js
const [parentRecords, setParentRecords] = useState({}); // keyed by parentRecordId

const fetchParentRecords = async (appointmentList) => {
  const recordIds = [...new Set(
    appointmentList
      .filter(a => a.isFollowUp && a.status === 'pending' && a.parentRecordId)
      .map(a => a.parentRecordId)
  )];

  if (recordIds.length === 0) {
    setParentRecords({});
    return;
  }

  // Chunked 10-at-a-time (Firestore 'in' limit) — same pattern as fetchSalesForCompleted
  const chunks = [];
  for (let i = 0; i < recordIds.length; i += 10) {
    chunks.push(recordIds.slice(i, i + 10));
  }

  try {
    const results = {};
    for (const chunk of chunks) {
      const q = query(
        collection(db, 'medical_records'),
        where(documentId(), 'in', chunk),
      );
      const snap = await getDocs(q);
      snap.forEach(docSnap => {
        results[docSnap.id] = docSnap.data();
      });
    }
    setParentRecords(results);
  } catch (error) {
    console.error('[ClientAppointments.fetchParentRecords]:', error.message);
  }
};
```

Add `documentId` to the `firebase/firestore` import at the top of the file.

Call `fetchParentRecords(list)` in the existing `onSnapshot` callback right next to `fetchSalesForCompleted(list)` at line 93.

**Sub-step 3.2 — Dismissed-from-history filter**

In the existing `filteredData` block (around line 218), extend the history-tab predicate to exclude dismissed follow-ups. Replace the `isValidStatus` computation with:

```js
const isValidStatus = isUpcomingTab
  ? [
      "pending",
      "confirmed",
      "arrived",
      "in-consult",
      "billing",
      "confined",
      "dispensing",
      "on-hold",
    ].includes(item.status)
  : (
      ["completed", "cancelled", "no-show", "carried-over"].includes(item.status)
      && item.cancelReason !== 'client-dismissed-followup'
      && item.cancelReason !== 'client-booked-followup'
    );
```

Both reason codes are excluded from history. The dismissed ghost is "as if it never existed" from the client's perspective.

**Sub-step 3.3 — Handlers**

Add two new handlers next to `handleCancelAppointment` (after line 205):

```js
const handleBookFollowUp = (item) => {
  // Walk-in ghosts have no client account — cannot deep-link
  if (!item.petId || item.petId === 'WALK_IN_PET') {
    Alert.alert('Call the clinic', 'Please call to schedule this follow-up — your visit was a walk-in.');
    return;
  }

  // Resolve the true parent service from the joined medical record.
  // Fallback to item.serviceType (which is literally 'Follow-Up Visit' — still
  // valid as a service catalog match, just less specific).
  const parent = parentRecords[item.parentRecordId];
  const resolvedServiceType = parent?.serviceType || item.serviceType || 'Follow-Up Visit';

  // Resolve the target date via the cascade helper.
  // Uses clinicSettings.closedDates and ±3 day tolerance.
  // NOTE: clinicSettings is NOT available on this screen — we need to read it
  // lazily via one getDoc call. See inline implementation below.
  (async () => {
    let clinicSettings = { closedDates: [] };
    try {
      const snap = await getDoc(doc(db, 'clinic_settings', 'general'));
      if (snap.exists()) clinicSettings = snap.data();
    } catch (e) {
      console.warn('[handleBookFollowUp] clinic_settings fetch failed, using empty closedDates');
    }

    const target = item.scheduledDate?.toDate() || new Date();
    const result = findFirstBookableDate(target, 3, clinicSettings);

    if (result.matchType === 'none') {
      Alert.alert(
        "Couldn't find an open day",
        `We couldn't find an open slot near ${target.toLocaleDateString()}. Please pick a date manually.`,
        [{ text: 'Continue anyway', onPress: () => navigation.navigate('BookAppointment', {
          prefillPetId: item.petId,
          prefillServiceType: resolvedServiceType,
          fromFollowUp: true,
          ghostAppointmentId: item.id,
        }) }],
      );
      return;
    }

    navigation.navigate('BookAppointment', {
      prefillPetId: item.petId,
      prefillServiceType: resolvedServiceType,
      prefillDate: result.date.toISOString(),
      prefillDateMatchType: result.matchType,       // 'exact' | 'tolerance' | 'scan'
      prefillTargetDate: target.toISOString(),       // For the "Recommended X · Showing Y" hint
      fromFollowUp: true,
      ghostAppointmentId: item.id,
    });
  })();
};

const handleDismissFollowUp = (item) => {
  Alert.alert(
    'Dismiss follow-up?',
    `Your vet recommended a visit on ${item.scheduledDate?.toDate().toLocaleDateString()}. You can still book manually from your pet's history later.`,
    [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Yes, dismiss',
        style: 'destructive',
        onPress: async () => {
          try {
            await updateDoc(doc(db, 'appointments', item.id), {
              status: 'cancelled',
              cancelReason: 'client-dismissed-followup',
              cancelledAt: Timestamp.now(),
            });
          } catch (error) {
            Alert.alert('Error', 'Could not dismiss. Please try again.');
          }
        },
      },
    ],
  );
};
```

Required imports: add `Timestamp`, `getDoc`, `documentId` to the `firebase/firestore` import block; add `findFirstBookableDate` from `../hooks/useBookingEngine`.

**Sub-step 3.4 — Rendering branch**

At the top of `renderItem` (line 248), detect follow-up rows and short-circuit to a specialized render:

```js
const renderItem = ({ item }) => {
  const isFollowUp = item.isFollowUp === true && item.status === 'pending';
  if (isFollowUp) return renderFollowUpRow(item);

  // ...existing regular-row render body unchanged...
};
```

Then add `renderFollowUpRow(item)` above `renderItem`:

```js
const renderFollowUpRow = (item) => {
  const parent = parentRecords[item.parentRecordId];
  const vetName = parent?.dischargeSummary?.vetName || 'Your veterinarian';
  const diagnosis = parent?.dischargeSummary?.diagnosis || parent?.diagnosis || 'a recheck';
  const recommendedDate = item.scheduledDate?.toDate();
  const dateStr = recommendedDate?.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }) || 'soon';
  const isWalkIn = !item.petId || item.petId === 'WALK_IN_PET';

  return (
    <View style={styles.followUpCard}>
      <View style={styles.followUpAccent} />
      <View style={{ flex: 1 }}>
        <Text style={styles.followUpRibbon}>FOLLOW-UP RECOMMENDED</Text>
        <Text style={styles.followUpTitle}>{item.petName}</Text>
        <Text style={styles.followUpSubtitle}>
          {vetName} recommends a recheck for {diagnosis}
        </Text>
        <Text style={styles.followUpDate}>📅 Suggested: {dateStr}</Text>
        <View style={styles.followUpActionRow}>
          <TouchableOpacity
            style={[styles.followUpBtn, styles.followUpBtnSecondary]}
            onPress={() => handleDismissFollowUp(item)}
          >
            <Text style={styles.followUpBtnSecondaryText}>Not now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.followUpBtn, styles.followUpBtnPrimary]}
            onPress={() => handleBookFollowUp(item)}
          >
            <Text style={styles.followUpBtnPrimaryText}>
              {isWalkIn ? 'Call clinic' : 'Book this visit'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
```

**Sub-step 3.5 — Sorting**

Follow-up ghosts should cluster together at the top of the upcoming list, sorted by `scheduledDate` ascending. Inside the `FlatList`'s `data` prop (line 456), replace:

```js
data={activeAppointment ? filteredData.filter(a => a.id !== activeAppointment.id) : filteredData}
```

with:

```js
data={(() => {
  const base = activeAppointment
    ? filteredData.filter(a => a.id !== activeAppointment.id)
    : filteredData;
  // Follow-ups float to the top when on Upcoming tab, sorted by scheduledDate asc.
  if (tab !== 'upcoming') return base;
  const followUps = base
    .filter(a => a.isFollowUp && a.status === 'pending')
    .sort((a, b) => (a.scheduledDate?.toMillis() || 0) - (b.scheduledDate?.toMillis() || 0));
  const rest = base.filter(a => !(a.isFollowUp && a.status === 'pending'));
  return [...followUps, ...rest];
})()}
```

**Sub-step 3.6 — Styles**

Append to the `StyleSheet.create` block (line 559):

```js
followUpCard: {
  flexDirection: 'row',
  backgroundColor: '#FFF3E0',
  borderRadius: 16,
  padding: 15,
  marginBottom: 15,
  elevation: 4,
  shadowColor: '#E65100',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.15,
  shadowRadius: 6,
  borderWidth: 1,
  borderColor: '#FFCC80',
  overflow: 'hidden',
},
followUpAccent: {
  width: 4,
  backgroundColor: '#E65100',
  marginRight: 12,
  borderRadius: 2,
},
followUpRibbon: {
  fontSize: 10,
  fontWeight: '900',
  letterSpacing: 1,
  color: '#E65100',
  marginBottom: 6,
},
followUpTitle: {
  fontSize: 18,
  fontWeight: '900',
  color: '#3E2723',
  marginBottom: 2,
},
followUpSubtitle: {
  fontSize: 13,
  color: '#5D4037',
  lineHeight: 18,
  marginBottom: 6,
},
followUpDate: {
  fontSize: 13,
  color: '#8B4513',
  fontWeight: '700',
  marginBottom: 10,
},
followUpActionRow: {
  flexDirection: 'row',
  justifyContent: 'flex-end',
  gap: 10,
},
followUpBtn: {
  paddingVertical: 10,
  paddingHorizontal: 16,
  borderRadius: 10,
},
followUpBtnPrimary: {
  backgroundColor: '#E65100',
},
followUpBtnPrimaryText: {
  color: 'white',
  fontWeight: '900',
  fontSize: 13,
},
followUpBtnSecondary: {
  backgroundColor: 'transparent',
  borderWidth: 1,
  borderColor: '#8D6E63',
},
followUpBtnSecondaryText: {
  color: '#5D4037',
  fontWeight: '700',
  fontSize: 13,
},
```

**Checkpoint**:

- Follow-up rows show amber ribbon, left accent, and two buttons.
- Tapping "Not now" shows the confirmation dialog and, on confirm, removes the row from Upcoming (and it does NOT appear in History).
- Tapping "Book this visit" navigates to BookAppointment. (Behavior of the prefill is wired in Phase 4.)

### Phase 4 — `BookAppointment.js` — prefillDate + fromFollowUp

**Goal**: Accept `prefillDate`, advance the wizard, and cancel the ghost on success.

**Sub-step 4.1 — Destructure new params**

At line 37-38, add:

```js
const prefillDate = route?.params?.prefillDate || null;
const prefillDateMatchType = route?.params?.prefillDateMatchType || null;
const prefillTargetDate = route?.params?.prefillTargetDate || null;
const fromFollowUp = route?.params?.fromFollowUp === true;
const ghostAppointmentId = route?.params?.ghostAppointmentId || null;
```

**Sub-step 4.2 — Prefill date effect**

Add a new `useEffect` below the existing prefill effects (after line 99):

```js
useEffect(() => {
  if (prefillDate && !fetching && selectedPets.length > 0 && selectedServices.length > 0) {
    const parsed = new Date(prefillDate);
    if (!isNaN(parsed.getTime())) {
      setDate(parsed);
      setStep(3); // Jump straight to the slot-picker
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [prefillDate, fetching, selectedPets.length, selectedServices.length]);
```

**Dependency gate**: this only fires once both `selectedPets` and `selectedServices` have been populated by the two existing prefill effects. Firing before that would land on step 3 with no service selected and show an empty slot list.

**Sub-step 4.3 — "Recommended X · Showing Y" banner**

Inside the step-3 render (the slot picker — find it by searching for `renderStep3` or the step 3 conditional block), add at the top of that view a small inline notice that appears only when `prefillDateMatchType` is `'tolerance'` or `'scan'`:

```js
{fromFollowUp && prefillDateMatchType && prefillDateMatchType !== 'exact' && (
  <View style={styles.followUpHint}>
    <Text style={styles.followUpHintText}>
      Your vet recommended {new Date(prefillTargetDate).toLocaleDateString()} —
      showing {new Date(prefillDate).toLocaleDateString()} (nearest available).
    </Text>
  </View>
)}
```

Add styles:

```js
followUpHint: {
  backgroundColor: '#FFF3E0',
  borderLeftWidth: 3,
  borderLeftColor: '#E65100',
  padding: 10,
  marginBottom: 10,
  borderRadius: 6,
},
followUpHintText: {
  fontSize: 12,
  color: '#8B4513',
  fontStyle: 'italic',
},
```

**Sub-step 4.4 — Cancel ghost on successful booking**

Inside `submitBooking` after `await batch.commit();` (around line 405), before the success Alert, add:

```js
if (fromFollowUp && ghostAppointmentId) {
  try {
    await updateDoc(doc(db, 'appointments', ghostAppointmentId), {
      status: 'cancelled',
      cancelReason: 'client-booked-followup',
      cancelledAt: Timestamp.now(),
    });
  } catch (e) {
    // Non-fatal — the new booking succeeded, the ghost just lingers.
    // The user will see both rows until the ghost is manually dismissed.
    console.warn('[BookAppointment] Failed to cancel ghost follow-up:', e.message);
  }
}
```

**Checkpoint**:

- From a follow-up row, tap "Book this visit" → BookAppointment opens on step 3 with pet, service, and date pre-filled.
- Complete the booking → original ghost disappears (now cancelled with `client-booked-followup`) AND new pending appointment appears in Upcoming.

### Phase 5 — Smoke test matrix

Run each case on an Expo device or simulator:

1. **Happy path exact date**: Vet sets nextVisit to 5 days out on a non-closed day → banner appears → Book → lands on step 3 with date = 5 days out, match type `exact`, no hint. Complete booking → ghost cancels, new pending appears.
2. **Tolerance fallback**: Vet sets nextVisit to a clinic-closed day → banner appears → Book → lands on step 3 on day `target ± 1` or similar, hint visible with both dates.
3. **Dismissal**: Tap "Not now" → confirm → row disappears from Upcoming. Switch to History → dismissed row NOT present.
4. **Dismissal then regen**: Vet re-triggers `handleSaveConsult` on the parent with a new `nextVisit` in admin → a SECOND ghost appears in Upcoming (expected current behavior — see Deferred). The original stays dismissed.
5. **Walk-in guard**: Create a walk-in parent, sign consult with `nextVisit` → ghost has `petId: 'WALK_IN_PET'` → row shows "Call clinic" button instead of "Book this visit" → tapping it opens the "please call" alert, no navigation.
6. **Multiple follow-ups**: Two pets in household, both with follow-ups → both rows appear at top of Upcoming, sorted ascending by date.
7. **Service no longer in catalog**: In admin, archive the parent service → open Upcoming → follow-up row still shows (because the ghost still exists) → tap Book → `selectedServices` effect fails to find a match → BookAppointment lands on step 3 with NO service selected → user must pick manually. Accept this graceful degradation.
8. **History hygiene**: Dismiss one follow-up and have another one successfully booked → switch to History → neither appears.
9. **Closed-dates not loaded**: Force `clinic_settings` read to fail (airplane mode briefly at tap time) → cascade falls back to `closedDates: []` → always returns exact date → booking flow still works.
10. **Prefill race**: Fast taps on Book button before the `getDoc('clinic_settings')` resolves → only first tap triggers the navigation (React Navigation dedupes identical routes). Document this but do not guard against it — acceptable.

---

## Edge case handling

| Case | Decision | Where enforced |
|---|---|---|
| Walk-in ghost with no real `ownerId` | Show "Call clinic" button, no navigation | `handleBookFollowUp` early return + `renderFollowUpRow` button label |
| Parent record deleted between ghost creation and row render | `parentRecords[parentRecordId]` is undefined → fall back to "Your veterinarian recommends a recheck" | `renderFollowUpRow` defaults |
| Parent service archived in catalog | `selectedServices` effect silently no-ops → user sees empty service slot on step 3 | Existing behavior, no new code |
| Multiple follow-ups same pet | Sorted ascending by `scheduledDate`, stacked as separate rows | Phase 3.5 sort block |
| Dismissed ghost in History tab | Filtered out by secondary `cancelReason` check | Phase 3.2 filter |
| Nothing bookable in ±3 window | Cascade falls back to 14-day scan; if still nothing, `matchType: 'none'` triggers Alert with manual-pick path | `findFirstBookableDate` + `handleBookFollowUp` |
| Concurrent client books + dismisses at same time (double-tap) | Both writes target the same ghost with the same `status: 'cancelled'`. Last writer wins. No data corruption. | Firestore update semantics |
| Ghost has `scheduledDate: null` | `target` falls back to `new Date()` → cascade returns today or tomorrow | `handleBookFollowUp` `const target = item.scheduledDate?.toDate() \|\| new Date()` |
| User backs out of BookAppointment without booking | Ghost stays intact, `fromFollowUp` flag has no side effect | `submitBooking` is the only place that cancels the ghost |
| Vet re-recommends after dismissal (regen conflict) | Current behavior: a second ghost is written. B5 does NOT solve this. Documented in Deferred. | N/A |

---

## Deferred (flag but do NOT implement in B5)

1. **Admin-side inheritance of parent `serviceType` on the ghost.** Today `ClinicalWorkspace.handleSaveConsult` hardcodes `serviceType: 'Follow-Up Visit'`. B5 works around this with a `parentRecords[parentRecordId].serviceType` join. A cleaner fix is a one-line admin change:
   ```js
   serviceType: patient.primaryService || patient.serviceType || 'Follow-Up Visit',
   ```
   **Defer because**: (a) touches admin code outside B5 scope, (b) affects existing ghosts in the database that already have the hardcoded value, (c) B5 works correctly without it.

2. **Concurrent dismissal + regeneration guard.** Needs `medical_records.followupDismissedAt` stamp on dismissal and an admin check before writing a new ghost. Requires coordinated client+admin work.

3. **Coalescing duplicate follow-ups for the same pet when vet signs multiple consults in one day.** Non-issue in practice; defer.

---

## Rollback plan

All B5 changes are additive. If the feature regresses production:

1. **Fastest rollback**: git revert the single commit that ships B5. The auto-ghost creation in admin predates B5 and continues working — the rows will simply render as regular pending appointments again.
2. **Soft rollback** (keep code, disable UI): Change the `isFollowUp` detection in `renderItem` to `const isFollowUp = false;`. This bypasses the banner render and falls through to the normal row treatment. Deploy as a hotfix.
3. **Data rollback**: If a bad sanitizer rule leaks text to users, re-deploy the admin build with the sanitizer fix. No Firestore migration needed.

**What is NOT rollback-safe**: any ghost that was already cancelled via "Not now" stays cancelled. Reversing the UI does not undo the Firestore writes. This is acceptable — a vet can always re-set `nextVisit` on a follow-up consult to regenerate.

---

## Appendix — copy/text strings (for consistency review)

- Ribbon label: `FOLLOW-UP RECOMMENDED`
- Subtitle template: `<vetName> recommends a recheck for <diagnosis>`
- Subtitle fallback: `Your veterinarian recommends a recheck for a recheck` (awkward — prefer `Your veterinarian recommends a recheck`)
- Primary CTA: `Book this visit`
- Walk-in CTA: `Call clinic`
- Secondary CTA: `Not now`
- Dismiss dialog title: `Dismiss follow-up?`
- Dismiss dialog body: `Your vet recommended a visit on <date>. You can still book manually from your pet's history later.`
- Dismiss dialog buttons: `Keep it`, `Yes, dismiss`
- Cascade-fail alert title: `Couldn't find an open day`
- Cascade-fail alert body: `We couldn't find an open slot near <date>. Please pick a date manually.`
- Cascade-fail button: `Continue anyway`
- Step-3 tolerance hint: `Your vet recommended <target> — showing <resolved> (nearest available).`
- Walk-in block alert: `Call the clinic — Please call to schedule this follow-up — your visit was a walk-in.`
