# Mobile Client Screens Deep Dive

> **Target files:** 10 files in `VetConnect/src/` (total ~5,496 LOC, commit `9d1f662`)
> **Companion documents:** [MOBILE_BOOKING_DEEPDIVE.md](MOBILE_BOOKING_DEEPDIVE.md), [CLINICAL_WORKSPACE_DEEPDIVE.md](CLINICAL_WORKSPACE_DEEPDIVE.md), [ECOSYSTEM_ARCHITECTURE_REPORT.md](ECOSYSTEM_ARCHITECTURE_REPORT.md)
> **Audit method:** 10 parallel codebase-architecture-researcher sub-agents across 2 rounds, each performing forensic file-level analysis with cross-reference tracing against admin modules, Firestore rules, and Cloud Functions.

---

## Executive Summary

The mobile client screens are functional and real-time-reactive but contain **5 CRITICAL bugs**, **9 HIGH bugs**, **14 MEDIUM bugs**, and numerous LOW/polish issues across 10 files totaling 5,496 lines. The most severe findings: (1) client cancellation writes `rejectReason` but Firestore rules require `auditReason` — cancellations silently fail; (2) history tab ghost filter reads phantom field `cancelReason` instead of `auditReason`; (3) queue-ahead counter queries a nonexistent `date` field — completely non-functional; (4) SOAP subjective and treatment plan exposed to clients violating thesis privacy claims; (5) `emergencyName` flat field never written by profile save, trapping new users in a booking redirect loop. Three different fake phone numbers are hardcoded across three files pointing to different cities.

---

## Cross-Cutting Findings

### 1. Three Different Fake Phone Numbers Pointing to Different Cities

| File | Line | Hardcoded Phone | Hardcoded Location |
|---|---|---|---|
| SuperCard.js | L17 | `+639171234567` | "Metro Manila, Philippines" (L18) |
| ChatbotScreen.js | L28 | `09123456789` | "Santa Barbara, Pangasinan" (Google Maps URL L30) |
| PetHistoryScreen.js | L358 | `+639000000000` | (none) |

```js
// SuperCard.js:17-18
const CLINIC_PHONE = '+639171234567';
const CLINIC_ADDRESS = 'Starbarks Vet Clinic, Metro Manila, Philippines';

// ChatbotScreen.js:28-30
const CLINIC_PHONE = "09123456789";
const CLINIC_MAPS_URL = "https://maps.google.com/?q=Starbarks+Veterinary+Clinic+Malanay+Santa+Barbara+Pangasinan";

// PetHistoryScreen.js:358
onPress={() => Linking.openURL('tel:+639000000000')}
```

**Impact:** A client calling from SuperCard reaches a different fake number than one calling from the chatbot. The SuperCard address says Metro Manila; the chatbot points to Pangasinan. Fix: unified `useClinicContact()` hook reading from `clinic_settings/general` (T2.416).

### 2. `auth.currentUser.uid` Unguarded in 4 Files

```js
// QueueScreen.js:33
where("ownerId", "==", auth.currentUser.uid),

// MyPetsScreen.js:37
where("ownerId", "==", auth.currentUser.uid),

// ClientDashboard.js:69
const userRef = doc(db, "users", auth.currentUser.uid);

// UserProfileScreen.js:55
const userRef = doc(db, "users", auth.currentUser.uid);
```

All crash with `TypeError: Cannot read properties of null (reading 'uid')` if auth state is momentarily null during navigation transitions. The `useEffect` hooks have empty dependency arrays `[]`, so they run once on mount — if `auth.currentUser` is null at that moment, the listener is never established.

### 3. Q11 Visibility Violations (PetHistoryScreen)

Per CLINICAL_WORKSPACE_DEEPDIVE.md Q11, the following should be HIDDEN from the mobile client portal:

| Field | Q11 Verdict | Currently Shown in UI? | Currently in PDF? | Violation? |
|---|---|---|---|---|
| `soap.subjective` | HIDDEN | YES (L174-186) | YES (L79) | **YES** |
| `soap.objectiveNotes` | HIDDEN | No | YES (L80) | **YES (PDF)** |
| `treatment` (soap.plan) | HIDDEN | YES (L248-257) | YES (L87) | **YES** |
| vitals | VISIBLE | YES | YES | Compliant |
| vaccineData | VISIBLE | YES | No | Compliant |
| dischargeSummary | VISIBLE | YES | No | Compliant |
| prescriptions (no price) | VISIBLE (no price) | YES (no price rendered) | YES (no price) | Compliant |

### 4. Allergy Field Mismatch (P0)

```js
// MyPetsScreen.js:250-259 — READS wrong field
{item.allergies && item.allergies.trim() !== ""
  ? item.allergies
  : "None reported"}

// AddPetScreen.js:163 — WRITES different field
petAllergies: allergies.trim() || "None",

// EditPetScreen.js:68 — has the correct fallback
const initialAllergies = pet.petAllergies || pet.allergies || "";
```

Every mobile-created pet shows "None reported" for allergies on MyPetsScreen, even if the pet has `petAllergies: "Penicillin"` recorded. EditPetScreen correctly reads both fields; MyPetsScreen does not.

### 5. Deprecated Staff Screens Still Registered

`ManageQueueScreen.js` (135 lines) is still registered in `App.js:168` with unguarded Firestore writes to `queue/daily_queue`. Per the locked "mobile is client-only" decision, this must be deregistered.

### 6. Mobile Design System: Does NOT Follow Neubrutalism

Confirmed across all 8 files: `borderRadius: 10-30` on cards/chips/buttons, native `elevation`/`shadowRadius` blur shadows, rounded FABs. The neubrutalism design system targets the admin dashboard only. The mobile app has its own soft/rounded aesthetic. **Intentional divergence, not a bug.**

### 7. Lab Results Rendering EXISTS (Contradicts Q9)

`PetHistoryScreen.js:427-453` renders `labResults[]` with test name, result, and color-coded status pill. Q9 in CLINICAL_WORKSPACE_DEEPDIVE.md claimed labResults was "write-only from a rendering standpoint" — this was only true for the admin side.

---

## 1. QueueScreen.js (301 lines)

### File Metadata

| Property | Value |
|---|---|
| **Path** | `VetConnect/src/screens/QueueScreen.js` |
| **Lines** | 301 (107 logic + 194 styles) |
| **Route name** | `"QueueScreen"` (App.js:113) |
| **Entry point** | ClientDashboard.js:460 "LIVE QUEUE" card |

### Firestore Read/Write Paths

| # | Collection/Doc | Operation | Line(s) | Filter | Real-time? |
|---|---|---|---|---|---|
| 1 | `queue/daily_queue` | `onSnapshot` | L23 | None (single doc) | Yes |
| 2 | `appointments` | `onSnapshot` | L31-34 | `ownerId == uid`, `status in ["confirmed","arrived"]` | Yes |
| 3 | `appointments` | `onSnapshot` | L53-55 | `status in ["arrived","in-consult"]` — **NO OWNER FILTER** | Yes |

**Writes:** None. Read-only screen.

### State Inventory

| Variable | Type | Initial | Line | Purpose |
|---|---|---|---|---|
| `queueData` | object/null | `null` | L17 | Global queue doc |
| `myTicket` | object/null | `null` | L18 | User's earliest active appointment |
| `lobbyPatients` | array | `[]` | L19 | ALL arrived/in-consult appointments (privacy leak) |

### Data Flow

```
┌───────────────────────────┐      onSnapshot           ┌──────────────────────────┐
│     QueueScreen.js        │ ◄────────────────────────  │  queue/daily_queue        │
│                           │                            │  {currentServing,         │
│  queueData (global)       │                            │   currentPrefix, status}  │
│  myTicket  (personal)     │      onSnapshot (filtered) ├──────────────────────────┤
│  lobbyPatients (ALL!)     │ ◄────────────────────────  │  appointments/           │
│                           │   ownerId == me             │  (user's own)            │
│  Derived:                 │      onSnapshot (UNFILTERED)├──────────────────────────┤
│  ├─ peopleAhead           │ ◄────────────────────────  │  appointments/           │
│  ├─ estWaitTimeMins       │   status in [arrived,      │  (ALL patients — LEAK!)  │
│  └─ currentServingDisplay │    in-consult] NO OWNER    │                          │
└───────────────────────────┘                            └──────────────────────────┘
```

### Wait Time Calculation

```
For each patient ahead:
├─ If priority === "high" → +60 mins (hardcoded penalty)
├─ If serviceDuration exists → +parseInt(serviceDuration) mins
└─ Else → +30 mins (fallback)
```

### Bugs

#### BUG 1 (CRITICAL): `auth.currentUser` null dereference crash

**Location:** `QueueScreen.js:L33`
```js
where("ownerId", "==", auth.currentUser.uid),
```
Crashes if auth state not yet resolved. The `useEffect` has empty deps `[]` — runs once on mount, never retries.

#### BUG 2 (CRITICAL): `queueData.status.toUpperCase()` crash on missing field

**Location:** `QueueScreen.js:L122`
```js
{queueData.status.toUpperCase()}
```
If `queue/daily_queue` doc exists but `status` field is undefined, `.toUpperCase()` on undefined throws TypeError.

#### BUG 3 (HIGH): Lobby query fetches ALL patients' full appointment data — privacy leak

**Location:** `QueueScreen.js:L53-55`
```js
const qLobby = query(
  collection(db, "appointments"),
  where("status", "in", ["arrived", "in-consult"]),
);
```
No owner filter, no date filter. Every authenticated client receives full appointment documents (including `ownerId`, `ownerName`, `petName`, `notes`, `serviceDuration`) for ALL other clients currently at the clinic. Firestore rules only require `isAuth()` — no per-document access control.

#### BUG 4 (HIGH): Status filter misses active lifecycle stages

**Location:** `QueueScreen.js:L34, L55`
```js
// My-ticket query — misses pending, in-consult, dispensing, billing, on-hold
where("status", "in", ["confirmed", "arrived"]),

// Lobby query — misses dispensing, billing, on-hold
where("status", "in", ["arrived", "in-consult"]),
```
Once the vet starts consultation (`arrived` → `in-consult`), the user's ticket vanishes from this screen. The "IT'S YOUR TURN!" message at L149 becomes unreachable. Wait time estimate is too optimistic because it undercounts patients in dispensing/billing.

#### BUG 5 (MEDIUM): Ticket format inconsistent with SuperCard

**Location:** `QueueScreen.js:L104, L142-143`
```js
// QueueScreen — no hyphen, no padding
const currentServingDisplay = queueData.currentServing
  ? `${queueData.currentPrefix || ""}${queueData.currentServing}`
  : "0";

// SuperCard.js:88-90 — canonical format
`${appointment.ticketPrefix}-${String(appointment.queueNumber).padStart(3, '0')}`
```
QueueScreen shows `W5`, SuperCard shows `W-005`. Three different formats across the mobile app.

#### BUG 6 (MEDIUM): Emergency wait-time hardcoded at 60 min

**Location:** `QueueScreen.js:L89`
```js
if (p.priority === "high") {
  estWaitTimeMins += 60;
}
```
Ignores actual `serviceDuration`. A 15-minute wound dressing gets 60 minutes; a 3-hour surgery gets 60 minutes.

#### BUG 7 (MEDIUM): `parseInt(p.serviceDuration)` without radix and no NaN guard

**Location:** `QueueScreen.js:L94`
```js
estWaitTimeMins += parseInt(p.serviceDuration);
```
No radix parameter. If `serviceDuration` is a non-numeric string, `parseInt` returns `NaN`, propagating to the entire wait-time display.

### What the Screen Does Well

1. **Real-time architecture** — three `onSnapshot` listeners with proper cleanup
2. **Correctly displays ticket prefix** — unlike Monitor.jsx, reads `currentPrefix`
3. **Queue paused state handled** — status badge changes color between green/red
4. **Graceful "no ticket" state** — clear message when user has no active appointment
5. **Smart wait-time concept** — multi-factor approach (emergency penalty, per-service duration, fallback)

### Dead Code Discovery: ManageQueueScreen.js

`ManageQueueScreen.js` (135 lines) is a staff-facing queue control screen still registered in `App.js:168`. It writes to `queue/daily_queue` with no auth/role guard. Per the locked "mobile is client-only" decision, this is dead code with unguarded Firestore writes.

---

## 2. ChatbotScreen.js (446 lines)

### File Metadata

| Property | Value |
|---|---|
| **Path** | `VetConnect/src/screens/ChatbotScreen.js` |
| **Lines** | 446 |
| **Route name** | `"Chatbot"` (App.js:196) |
| **Entry point** | ClientDashboard.js:471 "HELP CENTER" card |

### Firestore Read/Write Paths

| # | Collection | Operation | Line(s) | Purpose |
|---|---|---|---|---|
| 1 | `services` | `getDocs` (one-shot) | L45-46 | Service catalog for "Services & Prices" intent |
| 2 | `clinic_settings/general` | `getDoc` (one-shot) | L48-52 | Operating hours for open/closed computation |

**Writes:** None. Read-only screen.

### State Inventory

| Variable | Type | Initial | Line | Purpose |
|---|---|---|---|---|
| `messages` | Array | `[]` | L20 | Chat message history |
| `servicesList` | Array | `[]` | L21 | Cached services collection |
| `clinicSettings` | Object | `{openHour: 8, closeHour: 17}` | L22-25 | Clinic hours (minimal schema) |
| `isTyping` | boolean | `false` | L26 | Typing indicator toggle |

### Intent / Rule Inventory

| # | Intent ID | Label | Dynamic? | Action Button |
|---|---|---|---|---|
| 1 | `hours` | Operating Hours | Partially — open/closed dynamic, days hardcoded | None |
| 2 | `location` | Clinic Location | No (static string) | Open Google Maps |
| 3 | `services` | Services & Prices | Partially (capped at 5) | None |
| 4 | `booking` | How to Book | No | Navigate to BookAppointment |
| 5 | `emergency` | EMERGENCY | No | Call clinic |
| 6 | `reset` | More questions | No | None |

6 intents + 1 default fallback. No free-text NLP. Selection-only interaction.

### Bugs

#### BUG 1 (MEDIUM): `workingDays` and `closedDates` completely ignored

**Location:** `ChatbotScreen.js:L22-25, L102-109`
```js
// L22-25 — only stores openHour/closeHour
const [clinicSettings, setClinicSettings] = useState({
  openHour: 8,
  closeHour: 17,
});

// L102-105 — only checks hour, not day
const isOpen =
  nowHour >= clinicSettings.openHour &&
  nowHour < clinicSettings.closeHour;

// L109 — hardcoded days
botResponse = `${statusText}\n\nOur regular operating hours are Monday to Saturday, from ${formatHour(clinicSettings.openHour)} to ${formatHour(clinicSettings.closeHour)}.\nWe are closed on Sundays.`;
```
Reports "OPEN" on a Sunday or a closed holiday if the time falls within business hours. "Monday to Saturday" is hardcoded — if the clinic operates Sunday through Friday, the response is wrong.

#### BUG 2 (MEDIUM): Services capped at 5, tiered-pricing shows ₱0

**Location:** `ChatbotScreen.js:L146`
```js
servicesList
  .slice(0, 5)
  .map((s) => `• ${s.name}: ₱${s.price}`)
```
If the clinic has 20+ services, clients only see the first 5 in arbitrary Firestore order. Services with `hasTieredPricing: true` have base `price` set to 0 — they display as "₱0".

#### BUG 3 (LOW): Archived services not filtered

**Location:** `ChatbotScreen.js:L45-46`
```js
const snap = await getDocs(collection(db, "services"));
setServicesList(snap.docs.map((d) => d.data()));
```
No filter for `isArchived`. Archived services appear in the chatbot response.

#### BUG 4 (LOW): Settings full-replace destroys defaults

**Location:** `ChatbotScreen.js:L50-52`
```js
if (settingsSnap.exists()) {
  setClinicSettings(settingsSnap.data());
}
```
Full replacement instead of merge. Compare to `useBookingEngine.js:L67`: `setClinicSettings((prev) => ({ ...prev, ...settingsSnap.data() }))`.

#### BUG 5 (LOW): Deceptive fake input bar

**Location:** `ChatbotScreen.js:L311-323`
```js
<TouchableOpacity style={styles.attachBtn}>
  <Text style={{ fontSize: 22, color: "#888" }}>+</Text>
</TouchableOpacity>
<View style={styles.fakeInput}>
  <Text style={styles.fakeInputText}>
    Tap an option above to reply...
  </Text>
</View>
```
The "+" button is a `TouchableOpacity` with **no `onPress` handler**. The input area mimics a real chat input too closely.

### Thesis Alignment

| Claim | Verdict | Evidence |
|---|---|---|
| "Rule-based" | Confirmed | `switch` on `option.id` with 6 cases |
| "FAQ chatbot" | Confirmed | Covers 5 common client inquiries |
| "Non-clinical" | Confirmed | No medical advice, no diagnosis |
| "Informational" | Confirmed | Read-only, no Firestore writes |

### What the Screen Does Well

1. **Time-aware greeting** — adjusts based on current hour
2. **Live open/closed computation** — reads `openHour`/`closeHour` from Firestore
3. **Action buttons with deep links** — Maps, phone, in-app navigation
4. **Emergency prioritization** — visually distinct red styling + direct call
5. **Option scoping to last message** — prevents interaction with stale options
6. **Typing indicator** — cosmetic but polished, creates conversational feel

---

## 3. UserProfileScreen.js (734 lines)

### File Metadata

| Property | Value |
|---|---|
| **Path** | `VetConnect/src/screens/UserProfileScreen.js` |
| **Lines** | 734 |
| **Route name** | `"UserProfile"` |
| **Entry points** | ClientDashboard.js:359/380, BookAppointment.js:236 (booking redirect) |

### Firestore Read/Write Paths

| # | Collection | Operation | Line(s) | Purpose |
|---|---|---|---|---|
| 1 | `users/{uid}` | `getDoc` (one-shot) | L55-56 | Load profile on mount |
| 2 | `users/{uid}` | `updateDoc` | L149-165 | Save profile changes |

### State Inventory (13 variables)

| Variable | Type | Init | Purpose |
|---|---|---|---|
| `loading` | boolean | `true` | Initial load gate |
| `saving` | boolean | `false` | Save button state |
| `fullName` | string | `""` | Name input |
| `phone` | string | `""` | Phone input |
| `address` | string | `""` | Address input |
| `city` | string | `""` | City input |
| `dob` | Date/null | `null` | Date of birth |
| `seniorId` | string | `""` | Senior citizen ID |
| `emergencyContacts` | array | `[{name:"",phone:"",relation:""}]` | Emergency contacts |
| `dpaConsent` | boolean | `false` | Privacy consent |
| `allowPromos` | boolean | `false` | Marketing consent |
| `gender` | string/null | `null` | Gender selection |
| `showDatePicker` | boolean | `false` | DatePicker visibility |

### Field Parity: Mobile vs Admin

| Field | Mobile Reads | Mobile Writes | Admin Writes | Parity |
|---|---|---|---|---|
| fullName | L60 | L151 | L203 | MATCH |
| phone | L61 | L152 | L204 | MATCH |
| email | -- | -- | L205 | **MOBILE MISSING** |
| address | L62 | L153 | L207 | MATCH |
| emergencyContacts | L70-80 | L157 | L222 | MATCH |
| dpaConsent | L67 | L158 | L216 | MATCH |
| govIdType | -- | -- | L211 | **MOBILE MISSING** |
| govIdNumber | -- | -- | L212 | **MOBILE MISSING** |
| waiverSigned | -- | -- | L217 | **MOBILE MISSING** |
| referralSource | -- | -- | L218 | **MOBILE MISSING** |
| secondaryPhone | -- | -- | L206 | **MOBILE MISSING** |
| preferredComm | -- | -- | L220 | **MOBILE MISSING** |
| whatsappOptIn | -- | -- | L221 | **MOBILE MISSING** |

**12 admin-writable fields invisible to mobile users.**

### Bugs

#### BUG 1 (CRITICAL): `emergencyName` never written — breaks BookAppointment

**Location:** `UserProfileScreen.js:L150-161` vs `BookAppointment.js:L228`

```js
// UserProfileScreen.js L150-161 — writes ONLY the array
const payload = {
  fullName: fullName.trim(),
  phone: phone.trim(),
  address: address.trim(),
  city: city.trim(),
  gender,
  seniorId: seniorId.trim(),
  emergencyContacts, // Array only!
  dpaConsent,
  allowPromos,
  profileComplete: true,
};

// BookAppointment.js L228 — checks legacy flat field
if (!userData.address || !userData.emergencyName) {
```

A new user who completes their profile through UserProfileScreen will have `emergencyContacts: [{name:"Maria",...}]` but **no `emergencyName` field**. BookAppointment perpetually flags the profile as incomplete → redirect loop.

#### BUG 2 (MEDIUM): Phone validation blocks save on empty optional contacts

**Location:** `UserProfileScreen.js:L126-134`
```js
for (let i = 0; i < emergencyContacts.length; i++) {
  if (!isValidPHPhone(emergencyContacts[i].phone)) {
    Alert.alert("Invalid Number", `Emergency Contact #${i + 1} has an invalid phone number.`);
    return;
  }
}
```
If user taps "Add Another Contact" then decides not to fill it, the empty phone `""` fails `/^09\d{9}$/`. No skip-if-empty logic for contacts beyond index 0.

#### BUG 3 (MEDIUM): `getHighlightStyle` crashes on null values

**Location:** `UserProfileScreen.js:L203-205`
```js
const getHighlightStyle = (val) => {
  return isBookingRedirect && !val.trim() ? styles.missingFieldHighlight : {};
};
```
Calls `.trim()` without null-checking. If Firestore data includes a contact with null `name`/`phone`, crashes with TypeError.

#### BUG 4 (MEDIUM): `handleDeleteAccount` is a stub

**Location:** `UserProfileScreen.js:L207-209`
```js
const handleDeleteAccount = () => {
  /* ... existing delete logic ... */
};
```
Button at L536-541 renders "Request Account Deletion" and calls this empty function. DPA compliance gap.

#### BUG 5 (LOW): Gender stores `null` for "Decline", admin stores `"Decline"` string

Mobile L506 stores `null`; admin ClientDetails.jsx L78 stores `"Decline"`. Admin dropdown shows blank instead of "Decline to state" for mobile-saved profiles.

### What the Screen Does Well

1. **PH phone validation** — correctly implements `/^09\d{9}$/` per CLAUDE.md
2. **Legacy emergency contact migration** — handles both flat and array formats
3. **Booking redirect UX** — warning banner + field highlighting when `isBookingRedirect`
4. **DPA consent gate** — save button both visually and functionally disabled when `dpaConsent` false
5. **Firestore Timestamp handling** — correctly checks `typeof data.dob.toDate === "function"`

---

## 4. MyPetsScreen.js (630 lines)

### File Metadata

| Property | Value |
|---|---|
| **Path** | `VetConnect/src/screens/MyPetsScreen.js` |
| **Lines** | 630 |
| **Route name** | `"MyPets"` |
| **Entry point** | ClientDashboard.js "MY PETS" quick action |

### Firestore Read/Write Paths

| # | Collection | Operation | Line(s) | Filter | Purpose |
|---|---|---|---|---|---|
| 1 | `pets` | `onSnapshot` | L36-38 | `ownerId == uid` | Pet list (real-time) |
| 2 | `medical_records` | `getDocs` (per pet, serial) | L44-49 | `petId == petId`, `recordType == "medical"` | Last visit date for health status |
| 3 | `medical_records` | `getDocs` | L103-105 | `petId == petId` | Guard check before delete |
| 4 | `pets/{id}` | `deleteDoc` | L115 | — | **Hard delete** (should be soft archive) |

### N+1 Query Pattern

```js
// L39-58 — serial loop inside onSnapshot callback
const unsubscribe = onSnapshot(q, async (snapshot) => {
  const petList = [];
  for (const petDoc of snapshot.docs) {
    const petData = { id: petDoc.id, ...petDoc.data() };
    try {
      const medQ = query(
        collection(db, "medical_records"),
        where("petId", "==", petData.id),
        where("recordType", "==", "medical"),
      );
      const medSnap = await getDocs(medQ);
      // fetches ALL records, then sorts client-side
      // no orderBy/limit(1) optimization
```

For 5 pets: 5 serial Firestore reads **every time any pet doc changes** (onSnapshot fires for entire collection).

### Bugs

#### BUG 1 (P0): Allergy field read uses wrong field name

**Location:** `MyPetsScreen.js:L250-259`
```js
{item.allergies && item.allergies.trim() !== ""
  ? item.allergies
  : "None reported"}
```
Mobile writes `petAllergies` (AddPetScreen:L163). Admin AddPetModal writes `allergies`. MyPetsScreen reads only `allergies` — every mobile-created pet shows "None reported."

#### BUG 2 (P1): Hard delete without server-side protection

**Location:** `MyPetsScreen.js:L92-122`
```js
const handleDelete = async (petId, petName) => {
  Alert.alert("Remove Pet?", `...This action cannot be undone.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: async () => {
      // client-side medical record check
      const recordsSnap = await getDocs(recordsQuery);
      if (!recordsSnap.empty) {
        Alert.alert("Action Blocked", "This pet has existing medical records...");
        return;
      }
      await deleteDoc(doc(db, "pets", petId));  // HARD DELETE
```
The medical-record guard is client-side only. Firestore rules allow any authenticated user to `deleteDoc` any pet. Admin uses `archivePet` (soft delete) instead.

#### BUG 3 (P1): `auth.currentUser.uid` unguarded

**Location:** `MyPetsScreen.js:L37`
```js
where("ownerId", "==", auth.currentUser.uid),
```

#### BUG 4 (P2): `lastVisit.toDate()` crash on non-Timestamp

**Location:** `MyPetsScreen.js:L161-163`
```js
const daysSinceVisit =
  (new Date() - item.lastVisit.toDate()) / (1000 * 60 * 60 * 24);
```
If `records[0].date` is stored as an ISO string, `.toDate()` throws.

### Positive Finding: Species Filter Handles Duality Correctly

```js
// MyPetsScreen.js:L136-139 — CORRECT
if (speciesFilter === "Canine")
  return p.species === "Dog" || p.species === "Canine";

// Admin PetList.jsx:L45 — BUG (T2.120)
list = list.filter(p => (p.species || '').toLowerCase() === filter.species);
// 'dog' !== 'canine' → dogs disappear
```
Mobile handles Dog/Canine duality; admin doesn't.

### What the Screen Does Well

1. **Archived pet filtering** — correctly hides `status === 'archived'`
2. **Health status banner** — "Up to Date", "Needs Initial Checkup", "Overdue for Annual Exam"
3. **Deletion shield** — prevents deletion of pets with medical records (client-side)
4. **Empty state UX** — contextual message changes based on active filters
5. **`calculateAge` utility** — robust, handles Timestamps, ISO strings, invalid dates

---

## 5. ClientDashboard.js (670 lines)

### File Metadata

| Property | Value |
|---|---|
| **Path** | `VetConnect/src/screens/ClientDashboard.js` |
| **Lines** | 670 |
| **Route name** | `"ClientDashboard"` (App.js:87) |
| **Header** | Hidden (`headerShown: false`) |

### Firestore Read/Write Paths

| # | Collection | Operation | Line(s) | Purpose |
|---|---|---|---|---|
| F1 | `users/{uid}` | `updateDoc` | L69-71 | Push token registration |
| F2 | `users/{uid}` | `onSnapshot` | L121-124 | Profile (name, balance) |
| F3 | `appointments` | `onSnapshot` | L131-180 | Active appointments (top 2) |
| F4 | `appointments` | `onSnapshot` | L193-207 | Queue-ahead counter — **BROKEN** |
| F5 | `medical_records` | `onSnapshot` | L215-246 | Health reminders (nextVisit) |

### Queue-Ahead Data Flow (Broken)

```
Listener F4 fires when activeAppointments changes:
  │
  ├── Finds first appointment with status === "arrived"
  │
  └── Queries: appointments WHERE status == "arrived"
                              AND date == arrivedAppt.date  ← NONEXISTENT FIELD
      │
      └── arrivedAppt.date is UNDEFINED
          → query becomes WHERE date == undefined
          → returns 0 results
          → queueAhead always 0
          → "YOU'RE NEXT IN LINE!" always shown
```

### Bugs

#### BUG 1 (CRITICAL): Queue-ahead counter queries nonexistent `date` field

**Location:** `ClientDashboard.js:L193-207`
```js
const q = query(
  collection(db, "appointments"),
  where("status", "==", "arrived"),
  where("date", "==", arrivedAppt.date) // "date" field DOES NOT EXIST
);
```
No write path in the entire codebase sets a `date` field on appointment documents. The actual fields are `scheduledDate` (Timestamp), `scheduledDateStr` (YYYY-MM-DD), or `triageDate`. Since `arrivedAppt.date` is `undefined`, the query returns 0 results always.

#### BUG 2 (HIGH): Crash on `rec.petName.toUpperCase()` when null

**Location:** `ClientDashboard.js:L407`
```js
<Text style={[styles.notifTitle, { color: "#3E2723" }]}>
  💉 DUE: {rec.petName.toUpperCase()}
</Text>
```
No null guard. Legacy records without `petName` crash the component.

#### BUG 3 (HIGH): Incomplete optional chaining crash

**Location:** `ClientDashboard.js:L262`
```js
msg = `${appt.petName} is scheduled for ${appt.scheduledDate?.toDate().toLocaleDateString()}.`;
```
If `scheduledDate` is null, `?.toDate()` returns `undefined`, then `.toLocaleDateString()` is called on `undefined` → TypeError.

#### BUG 4 (MEDIUM): `on-hold` status missing from query

**Location:** `ClientDashboard.js:L134-141`
```js
where("status", "in", [
  "confirmed", "arrived", "in-consult",
  "confined", "billing", "dispensing",
  // MISSING: "on-hold"
]),
```
A pet placed on-hold disappears from the dashboard.

#### BUG 5 (MEDIUM): Reminder listener fragile try/catch pattern

**Location:** `ClientDashboard.js:L213-246`
```js
useEffect(() => {
  try {
    const qReminders = query(/* ... */);
    const unsubReminders = onSnapshot(/* ... */);
    return () => unsubReminders();  // Only returned if try succeeds
  } catch (e) {
    console.log("Index missing for reminders");
    // No cleanup returned
  }
}, []);
```

#### BUG 6 (LOW): Queue progress bar width hardcoded at 60%

**Location:** `ClientDashboard.js:L333`
```js
<View style={[styles.queueProgressFill, { 
  width: queueAhead === 0 ? '100%' : '60%', 
  backgroundColor: '#3ABEF9' 
}]} />
```
Combined with Bug 1 (queueAhead always 0), users always see 100% "YOU'RE NEXT."

#### BUG 7 (LOW): Dead imports

```js
TouchableWithoutFeedback,  // L22 — never used
import { LinearGradient } from "expo-linear-gradient";  // L26 — never used
```

### Thesis D3 Confirmation

**Confirmed:** The "automated reminders" are purely in-app `onSnapshot` listeners on `medical_records` filtered by future `nextVisit` dates. No cron, no push, no Cloud Function involvement. Only the top 1 reminder is displayed (`reminders.slice(0, 1)`). A pet owner who doesn't open the app never sees any reminder.

### What the Screen Does Well

1. **Strong neubrutalism compliance** — zero radius, offset shadows, uppercase headers
2. **Real-time reactivity** — all 4 listeners with proper cleanup
3. **Sort-then-cap strategy** — in-clinic statuses sorted to top before capping at 2
4. **Push token registration** — clean Expo best practices implementation
5. **Outstanding balance banner** — pulsing animation draws attention

---

## 6. ClientAppointments.js (994 lines)

### File Metadata

| Property | Value |
|---|---|
| **Path** | `VetConnect/src/screens/ClientAppointments.js` |
| **Lines** | 994 |
| **Route name** | `"ClientAppointments"` |
| **Entry point** | ClientDashboard.js "MY BOOKINGS" quick action |

### Firestore Read/Write Paths

| # | Collection | Operation | Line(s) | Purpose |
|---|---|---|---|---|
| R1 | `appointments` | `onSnapshot` | L88-104 | All owner appointments (real-time) |
| R2 | `sales` | `getDocs` (batch) | L127-136 | Billing status for completed appts |
| R3 | `medical_records` | `getDocs` (batch) | L166-174 | Parent records for follow-up ghosts |
| R4 | `sales` | `getDocs` (on-demand) | L192-196 | E-Receipt for specific appointment |
| R5 | `clinic_settings/general` | `getDoc` | L277-280 | closedDates for follow-up booking |
| W1 | `appointments` | `updateDoc` | L234-237 | Client cancellation — **BROKEN** |
| W2 | `appointments` | `updateDoc` | L326-330 | Follow-up ghost dismissal |

### Tab Structure

| Tab | Statuses | Exclusions |
|---|---|---|
| Upcoming | pending, confirmed, arrived, in-consult, billing, confined, dispensing, on-hold | Active statuses deduped to SuperCard |
| History | completed, cancelled, no-show, carried-over | Ghost filter on `cancelReason` — **BROKEN** |

### Bugs

#### BUG 1 (CRITICAL): History tab ghost filter reads phantom field

**Location:** `ClientAppointments.js:L367-368`
```js
&& item.cancelReason !== 'client-dismissed-followup'
&& item.cancelReason !== 'client-booked-followup'
```
The field `cancelReason` is never written. The actual writes use `auditReason`:
```js
// L328 — writes auditReason
auditReason: 'client-dismissed-followup'

// BookAppointment.js:L438 — writes auditReason
auditReason: 'client-booked-followup'
```
`item.cancelReason` is always `undefined`, so `undefined !== 'client-dismissed-followup'` is always `true`. The exclusion filter never excludes anything. Every dismissed follow-up ghost leaks into History as a "Cancelled" row.

#### BUG 2 (CRITICAL): Client cancel writes `rejectReason`, rules require `auditReason`

**Location:** `ClientAppointments.js:L234-237`
```js
await updateDoc(doc(db, "appointments", id), {
  status: "cancelled",
  rejectReason: "Cancelled by Pet Owner",
});
```
Firestore rule (`firestore.rules:L32-38`):
```
&& (
  !(request.resource.data.status in ['cancelled', 'no-show'])
  || (
    'auditReason' in request.resource.data
    && request.resource.data.auditReason is string
    && request.resource.data.auditReason.size() > 0
  )
)
```
The rule requires `auditReason` in the merged document for any write setting status to `cancelled`. Fresh pending appointments (never triaged) have no existing `auditReason` — the write is rejected. Cancellations silently fail.

#### BUG 3 (MEDIUM): Cancel reason only shown for `cancelled` status

**Location:** `ClientAppointments.js:L531`
```js
{item.status === "cancelled" && (() => {
  const raw = item.auditReason || item.rejectReason;
  const clean = sanitizeCancelReason(raw);
  return clean ? <Text style={styles.reasonText}>{clean}</Text> : null;
})()}
```
No-show appointments with `auditReason: 'No arrival within 30 minutes'` show no reason. Carried-over appointments show no explanation.

#### BUG 4 (MEDIUM): Invalid CSS property `my`

**Location:** `ClientAppointments.js:L704`
```js
<ActivityIndicator color="#8B4513" style={{ my: 20 }} />
```
`my` is MUI shorthand, not React Native. Should be `marginVertical: 20`. React Native silently ignores it — zero vertical margin.

### Billing Information: Correct Pattern

```js
// L128-129 — ID-based join (CORRECT)
where('appointmentId', 'in', chunk)

// Compare to admin usePatientManager.js:L153 — string-based join (BUG T2.112)
where("ownerName", "==", selectedClient.fullName)
```
The mobile client uses `appointmentId` (doc ID match) for the sales join, NOT the fragile `ownerName` string match. This is structurally sound.

### What the Screen Does Well

1. **Correct ID-based sales join** — avoids the admin's T2.112 bug
2. **Chunked batch fetching** — properly chunks at 10 for Firestore `in` limit
3. **SuperCard deduplication** — active appointment excluded from FlatList
4. **Follow-up ghost UX** — rich banner with vet name, diagnosis, suggested date
5. **Walk-in guard** — detects walk-in ghosts, redirects to phone call
6. **Sanitized cancel reasons** — strips forensic/audit prefixes before showing to clients
7. **Follow-up sort** — ghosts float to top of Upcoming tab by date

---

## 7. PetHistoryScreen.js (1,066 lines)

### File Metadata

| Property | Value |
|---|---|
| **Path** | `VetConnect/src/screens/PetHistoryScreen.js` |
| **Lines** | 1,066 (~480 logic, ~586 styles) |
| **Route name** | `"PetHistory"` (App.js:150) |
| **Entry point** | MyPetsScreen.js:267 with params `{ petId, petName }` |

### Firestore Read/Write Paths

| # | Collection | Operation | Line(s) | Filter | Purpose |
|---|---|---|---|---|---|
| 1 | `medical_records` | `onSnapshot` | L31-54 | `petId == param`, `orderBy date desc` | All medical records for pet |

**Single listener, properly unsubscribed at L56. No N+1 queries.**

### Bugs

#### BUG 1 (HIGH): SOAP subjective exposed to client

**Location:** `PetHistoryScreen.js:L174-186`
```js
{item.soap?.subjective && item.soap.subjective.trim() !== "" && (
  <View style={styles.subjectiveBox}>
    <Text style={styles.subjectiveLabel}>REPORTED SYMPTOMS / HISTORY:</Text>
    <Text style={styles.subjectiveText}>
      "{item.soap.subjective
        .replace('Client noted: "', "")
        .replace('"\n\n', "")}"
    </Text>
  </View>
)}
```
Q11 says HIDDEN. The fragile strip logic assumes `'Client noted: "...'` format — if vet edits the prefix, strip fails silently.

#### BUG 2 (HIGH): Treatment plan (soap.plan) exposed to client

**Location:** `PetHistoryScreen.js:L243-257`
```js
<Text style={[styles.planLabel, { color: themeColor }]}>
  {isGrooming ? "GROOMING NOTES:" : "TREATMENT PLAN & INSTRUCTIONS:"}
</Text>
<Text style={styles.planText}>
  {item.treatment || "No specific instructions."}
</Text>
```
`item.treatment` is `soap.plan` (confirmed: `ClinicalWorkspace.jsx:882`). Q11 says HIDDEN — use `dischargeSummary.instructions` instead. The discharge card (L295-385) already renders `ds.instructions` correctly, creating a **double-render** where the owner sees both.

#### BUG 3 (HIGH): PDF generates full SOAP note

**Location:** `PetHistoryScreen.js:L69-94`
```html
<p><b>Owner Reported:</b> ${record.soap?.subjective || "None recorded."}</p>
<p><b>Physical Exam:</b> ${record.soap?.objectiveNotes || "None recorded."}</p>
...
<p>${record.treatment || "None recorded."}</p>
```
The downloadable PDF includes `soap.subjective`, `soap.objectiveNotes`, and `treatment` — all should be HIDDEN per Q11.

#### BUG 4 (MEDIUM): T2.6 reminder banner crash on non-Timestamp

**Location:** `PetHistoryScreen.js:L456-466`
```js
{item.nextVisit && (
  <Text style={styles.reminderText}>
    NEXT VISIT DUE:{" "}
    {new Date(item.nextVisit.seconds * 1000).toLocaleDateString(
      "en-US", { month: "long", day: "numeric", year: "numeric" }
    )}
  </Text>
)}
```
Assumes `nextVisit` is always a Firestore Timestamp with `.seconds`. But `dischargeSummary.nextVisit` is written as a raw date string. The discharge card (L301-302) has the defensive pattern:
```js
const nextVisitDate = ds.nextVisit
  ? new Date(ds.nextVisit?.seconds ? ds.nextVisit.seconds * 1000 : ds.nextVisit)
  : null;
```
The reminder banner does NOT have this guard.

#### BUG 5 (LOW): Prescription price accessible in Firestore document

The prescriptions array in `medical_records` includes `price` per item (`ClinicalWorkspace.jsx:909`). PetHistoryScreen correctly does NOT render `rx.price`, but the data IS in the Firestore document the client's device fetches.

#### BUG 6 (LOW): Hardcoded phone `+639000000000`

**Location:** `PetHistoryScreen.js:L358`
```js
onPress={() => Linking.openURL('tel:+639000000000')}
```

### Book Follow-Up CTA Exists

**Location:** `PetHistoryScreen.js:L364-378`
```js
{nextVisitDate && (
  <TouchableOpacity
    style={styles.dischargeFollowUpBtn}
    onPress={() => navigation.navigate('BookAppointment', {
      prefillPetId: petId,
      prefillServiceType: item.serviceType || null,
      prefillDate: nextVisitDate.toISOString(),
      prefillDateMatchType: 'exact',
      prefillTargetDate: nextVisitDate.toISOString(),
      fromFollowUp: true,
    })}
  >
```
The B5 one-tap follow-up feature works from PetHistoryScreen's discharge card.

### What the Screen Does Well

1. **Single-listener architecture** — one `onSnapshot`, no N+1
2. **Rich discharge card** — TL;DR, instructions, medications, next visit, call button, follow-up CTA
3. **Vaccination card** — MFR, LOT, route, site, next due date
4. **Lab results rendering** — EXISTS (contradicts Q9)
5. **PDF generation** — `expo-print` + `expo-sharing`, shareable visit summary
6. **Timeline visual** — dot-and-line UI gives professional medical chart feel
7. **Defensive date rendering** — L124-132 handles both Timestamp and non-Timestamp

---

## 8. SuperCard.js (241 lines)

### File Metadata

| Property | Value |
|---|---|
| **Path** | `VetConnect/src/components/SuperCard.js` |
| **Lines** | 241 |
| **Props** | `{ appointment }` — single object, null-safe |
| **Firestore reads** | **None** — purely prop-driven |

### Data Flow

```
ClientAppointments.js
  onSnapshot(appointments, where ownerId == uid)
    │
    ├── .find(isActiveStatus) → activeAppointment
    │                              │
    │                              ▼
    │                     ┌────────────────┐
    │                     │   SuperCard    │
    │                     │ (stateless)    │
    │                     └────────────────┘
    │
    └── .filter(tab/pet/service) → FlatList
```

### Fields Consumed from `appointment` Prop

| Field | Used At | Null-Safe? |
|---|---|---|
| `status` | L82-84 | Yes (statusLabels fallback) |
| `petName` | L108 | **No guard** |
| `petSpecies` | L85, L109 | Yes (conditional) |
| `ticketPrefix` | L88-89 | Yes (null check) |
| `queueNumber` | L88-90 | Yes (null check) |
| `assignedVet` | L93-94 | Yes (truthy + !== 'Unassigned') |
| `timeStarted` | L97 | Yes (formatTimestamp handles null) |
| `timeArrived` | L98 | Yes (formatTimestamp handles null) |

### Status Rendering (6 of 12 visible via `isActiveStatus` gate)

| Status | Label | Icon | Color |
|---|---|---|---|
| arrived | CHECKED IN | pin | #1565C0 |
| in-consult | WITH THE VET | stethoscope | #6A1B9A |
| dispensing | PREPARING MEDS | pill | #E65100 |
| billing | READY FOR CHECKOUT | receipt | #00695C |
| on-hold | ON HOLD | pause | #455A64 |
| confined | ADMITTED TO CLINIC | hospital | #6A1B9A |

### Information Displayed

| Row | What | Condition |
|---|---|---|
| 1 | Pet avatar + name + species | Always |
| 2 | Status pill with pulsing dot | Always |
| 3 | Ticket number (e.g., "E-003") | If ticketPrefix + queueNumber non-null |
| 4 | Assigned vet | If assignedVet exists and !== "Unassigned" |
| 5 | Start/arrival time | If timeStarted or timeArrived exists |
| 6 | Queue-ahead count | **Commented out** (L138-139) |
| 7 | "Call Clinic" + "Directions" CTAs | Always |

**Missing:** Service type (serviceType/primaryService) — the most prominent card omits what the visit is for.

### Bugs

#### BUG 1 (P3): Hardcoded phone + wrong city address

```js
// L17-18
const CLINIC_PHONE = '+639171234567';
const CLINIC_ADDRESS = 'Starbarks Vet Clinic, Metro Manila, Philippines';
```
ChatbotScreen points to Pangasinan. SuperCard points to Metro Manila. Different cities.

#### BUG 2 (P3): Missing service type display

No references to `serviceType`, `primaryService`, or `serviceName` anywhere in the file.

#### BUG 3 (P4): `petName` no null guard

```js
// L108
<Text style={styles.petName}>{appointment.petName}</Text>
```
Renders "undefined" for edge-case data.

#### BUG 4 (P4): Queue-ahead permanently disabled

```js
// L138-139
{/* Row 6 — Queue-ahead is hidden this pass (client-scope listener underestimates).
    TODO: queue-ahead needs clinic-wide feed before this row is meaningful. */}
```

### What the Component Does Well

1. **Clean null guard** at L80 — returns null when no active appointment
2. **Proper animation lifecycle** — `loop.stop()` in cleanup
3. **Correct delegation to statusLabels.js** — no inline status mapping
4. **Conditional row rendering** — ticket, vet, time rows gracefully hide when absent
5. **Defensive `formatTimestamp`** — try/catch for non-Timestamp objects
6. **Two-tier time fallback** — `timeStarted || timeArrived`

---

## Proposed Tasks (Renumbered, No Collisions)

### QueueScreen (T2.343-T2.354)

| ID | Name | Priority | Effort |
|---|---|---|---|
| T2.343 | Guard `auth.currentUser` null at QueueScreen L33 | **P0** | 15 min |
| T2.344 | Guard `queueData.status` null at L122 | **P0** | 5 min |
| T2.345 | Scope lobby query — add date filter, return count not full docs | **P1** | 45 min |
| T2.346 | Expand my-ticket status filter to full active lifecycle | **P1** | 15 min |
| T2.347 | Expand lobby status filter to include dispensing/billing/on-hold | **P1** | 10 min |
| T2.348 | Standardize ticket format to `{prefix}-{padStart(3,'0')}` | **P2** | 15 min |
| T2.349 | Replace hardcoded 60-min emergency penalty with actual serviceDuration | **P2** | 15 min |
| T2.350 | Add parseInt radix + NaN guard on serviceDuration | **P2** | 5 min |
| T2.351 | Apply neubrutalism design tokens | **P2** | 30 min |
| T2.352 | Memoize patientsAhead/estWaitTimeMins | **P3** | 10 min |
| T2.353 | Remove/deregister ManageQueueScreen.js from App.js | **P1** | 10 min |
| T2.354 | Import and use statusLabels.js for human-friendly status text | **P3** | 15 min |

### ChatbotScreen (T2.355-T2.362)

| ID | Name | Priority | Effort |
|---|---|---|---|
| T2.355 | Respect `workingDays`/`closedDates` in open/closed computation | **P1** | 30 min |
| T2.356 | Merge Firestore settings with defaults instead of full replace | **P3** | 5 min |
| T2.357 | Show full services catalog grouped by department, fix tiered ₱0 | **P1** | 30 min |
| T2.358 | Filter out archived services | **P3** | 5 min |
| T2.359 | Remove/restyle deceptive fake input bar | **P3** | 10 min |
| T2.360 | Add error state feedback on Firestore fetch failure | **P3** | 10 min |
| T2.361 | Add sub-intents by department for services drill-down | **P3** | 30 min |
| T2.362 | Read clinic contact info from Firestore when available | **P3** | 10 min |

### UserProfileScreen (T2.363-T2.372)

| ID | Name | Priority | Effort |
|---|---|---|---|
| T2.363 | Write `emergencyName` flat field for BookAppointment compat | **CRITICAL** | 10 min |
| T2.364 | Skip phone validation on empty optional emergency contacts | **P1** | 10 min |
| T2.365 | Add null guard to `getHighlightStyle` | **P1** | 5 min |
| T2.366 | Implement `handleDeleteAccount` or remove the button | **P2** | 30 min |
| T2.367 | Add `email` field to mobile profile editor | **P2** | 15 min |
| T2.368 | Add missing admin-parity fields | **P3** | 30 min |
| T2.369 | Add `auth.currentUser` null guard | **P3** | 5 min |
| T2.370 | Remove empty contacts from array before saving | **P3** | 5 min |
| T2.371 | Add `dob` null write on save | **P3** | 5 min |
| T2.372 | Fix gender null vs "Decline" inconsistency | **P3** | 5 min |

### MyPetsScreen (T2.373-T2.383)

| ID | Name | Priority | Effort |
|---|---|---|---|
| T2.373 | Fix allergy field read: `item.petAllergies \|\| item.allergies` | **P0** | 5 min |
| T2.374 | Optimize medical_records query with orderBy + limit(1) | **P1** | 15 min |
| T2.375 | Parallelize N+1 queries with Promise.all | **P1** | 15 min |
| T2.376 | Replace hard delete with soft archive | **P1** | 15 min |
| T2.377 | Add null guard for `auth.currentUser` | **P1** | 5 min |
| T2.378 | Guard `lastVisit.toDate()` against non-Timestamp | **P2** | 10 min |
| T2.379 | Add weight display to pet card | **P2** | 10 min |
| T2.380 | Add microchip badge to pet card | **P3** | 10 min |
| T2.381 | Memoize processedPets with useMemo | **P2** | 10 min |
| T2.382 | Add Firestore rule to prevent client pet hard-deletion | **P2** | 10 min |
| T2.383 | Apply neubrutalism design tokens | **P3** | 30 min |

### ClientDashboard (T2.384-T2.393)

| ID | Name | Priority | Effort |
|---|---|---|---|
| T2.384 | Fix queue-ahead query: `arrivedAppt.date` → `scheduledDateStr` | **CRITICAL** | 15 min |
| T2.385 | Guard `rec.petName.toUpperCase()` against null | **P1** | 5 min |
| T2.386 | Fix incomplete optional chaining on scheduledDate | **P1** | 5 min |
| T2.387 | Add `on-hold` to appointment status query filter | **P1** | 10 min |
| T2.388 | Restructure reminders useEffect try/catch pattern | **P2** | 10 min |
| T2.389 | Remove dead imports (TouchableWithoutFeedback, LinearGradient) | **P3** | 2 min |
| T2.390 | Add auth guard to all useEffect hooks | **P3** | 10 min |
| T2.391 | Make queue progress bar width dynamic | **P3** | 10 min |
| T2.392 | Consider showing pending appointments on dashboard | **P3** | 15 min |
| T2.393 | Add first-time user empty state guidance | **P3** | 15 min |

### ClientAppointments (T2.394-T2.401)

| ID | Name | Priority | Effort |
|---|---|---|---|
| T2.394 | Fix history-tab ghost filter: `cancelReason` → `auditReason` | **CRITICAL** | 5 min |
| T2.395 | Fix client cancel to include `auditReason` for Firestore rules | **CRITICAL** | 5 min |
| T2.396 | Show reason text for no-show and carried-over statuses | **P2** | 10 min |
| T2.397 | Fix invalid `my` CSS property → `marginVertical` | **P2** | 2 min |
| T2.398 | Add re-book button for no-show and carried-over | **P2** | 15 min |
| T2.399 | Show refund indicator in receipt modal | **P3** | 15 min |
| T2.400 | Debounce sales/parentRecords re-fetch on snapshot | **P3** | 20 min |
| T2.401 | Audit mobile borderRadius against design system | **P3** | 15 min |

### PetHistoryScreen (T2.402-T2.409)

| ID | Name | Priority | Effort |
|---|---|---|---|
| T2.402 | Remove `soap.subjective` render block per Q11 | **HIGH** | 10 min |
| T2.403 | Replace `item.treatment` with `dischargeSummary.instructions` per Q11 | **HIGH** | 15 min |
| T2.404 | Rewrite `generatePDF()` to use only client-safe fields | **HIGH** | 30 min |
| T2.405 | Guard `nextVisit` renders against non-Timestamp (T2.6 fix) | **P1** | 10 min |
| T2.406 | Strip `price` from prescriptions at write time or via rules | **P3** | 20 min |
| T2.407 | Add defensive coercion for vitals rendering | **P3** | 5 min |
| T2.408 | Replace hardcoded phone with clinic_settings lookup | **P3** | 10 min |
| T2.409 | Align card styles to neubrutalism design system | **P3** | 30 min |

### SuperCard (T2.410-T2.416)

| ID | Name | Priority | Effort |
|---|---|---|---|
| T2.410 | Replace hardcoded CLINIC_PHONE | **P2** | 10 min |
| T2.411 | Replace hardcoded CLINIC_ADDRESS (wrong city) | **P2** | 10 min |
| T2.412 | Add service type display | **P2** | 10 min |
| T2.413 | Add petName null guard | **P3** | 5 min |
| T2.414 | Implement queue-ahead count | **P3** | 30 min |
| T2.415 | Reset pulseAnim on appointment change | **P3** | 5 min |
| T2.416 | Create unified `useClinicContact()` hook for all hardcoded clinic info | **P2** | 20 min |

---

## Task Count Summary

| Priority | Count |
|---|---|
| CRITICAL | 5 |
| P0 | 3 |
| HIGH | 3 |
| P1 | 15 |
| P2 | 18 |
| P3 | 30 |
| **Total** | **74** |

Task ID range: T2.343-T2.433

---

## 9. RegisterScreen.js (414 lines)

### File Metadata

| Property | Value |
|---|---|
| **Path** | `VetConnect/src/screens/RegisterScreen.js` |
| **Lines** | 414 (153 logic + 261 styles) |
| **Route name** | `"Register"` |
| **Design system** | 100% neubrutalism compliant |

### Firestore Read/Write Paths

| # | Collection | Operation | Line(s) | Purpose |
|---|---|---|---|---|
| 1 | `users` | `getDocs` (query) | L84-89 | Guest lookup: `phone == input AND accountStatus == "unclaimed_guest"` |
| 2 | `users/{uid}` | `setDoc` | L131-138 | Standard registration (Auth UID as doc ID) |
| 3 | `users/{uid}` | `batch.set` | L97-106 | Merge: create new doc at Auth UID |
| 4 | `users/{guestId}` | `batch.delete` | L108 | Merge: remove old guest doc |
| 5 | `pets` | `getDocs` + `batch.update` | L110-114 | Merge: re-point ownerId |
| 6 | `appointments` | `getDocs` + `batch.update` | L117-124 | Merge: re-point ownerId |

### Registration Flow

```
User fills form (fullName, phone, email, password)
  │
  ├── Validate: non-empty, PH phone regex, password >= 6 chars
  │
  ├── createUserWithEmailAndPassword(auth, email, password)
  │     └── Returns uid
  │
  ├── Query: users WHERE phone == input AND accountStatus == "unclaimed_guest"
  │     │
  │     ├── FOUND → MERGE PATH (writeBatch):
  │     │     1. batch.set(users/{uid}) — new doc with registration data
  │     │     2. batch.delete(users/{guestId}) — remove old guest doc
  │     │     3. batch.update(pets) — re-point ownerId
  │     │     4. batch.update(appointments) — re-point ownerId
  │     │     ⚠ medical_records NOT migrated
  │     │
  │     └── NOT FOUND → STANDARD PATH:
  │           setDoc(users/{uid}, { uid, fullName, email, phone, role: "pet_owner", createdAt })
  │
  └── navigation.replace("ClientDashboard")
```

### Standard Registration Schema (6 fields)

```js
// L131-138
await setDoc(doc(db, "users", uid), {
  uid: uid,
  fullName: fullName.trim(),
  email: email.trim().toLowerCase(),
  phone: phone.trim(),
  role: "pet_owner",
  createdAt: Timestamp.now(),
});
```

**Missing fields that block booking:** `address`, `emergencyName` (BookAppointment.js:L228 checks both). Every new user is immediately blocked from booking until they complete their profile.

### Bugs

#### BUG 1 (HIGH): Booking blocked after registration — triple field mismatch

RegisterScreen writes neither `address` nor `emergencyName`. BookAppointment checks `emergencyName` (legacy flat field). UserProfileScreen writes `emergencyContacts[]` (array). A new user who registers → completes profile → tries to book is still blocked because `emergencyName` is never written by any path.

#### BUG 2 (MEDIUM): Auth-Firestore orphan on write failure

```js
// L74 — Auth succeeds
const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
// L131 — Firestore could fail
await setDoc(doc(db, "users", uid), { ... });
// L143 — catch shows alert but does NOT delete Auth account
```
If Auth succeeds but Firestore fails, user has Auth account with no profile. Can't register again (email in use), can't log in (no profile doc). Permanently stuck.

#### BUG 3 (MEDIUM): Merge doesn't migrate `medical_records`

L110-124 migrates `pets` and `appointments` ownerId but NOT `medical_records.ownerId`. Walk-in guest's clinical records become orphaned after merge.

#### BUG 4 (LOW): Merge destroys guest's `createdAt`

```js
// L105 — overwrites with registration time
createdAt: Timestamp.now(),
```
Guest doc (which held original walk-in date) is deleted. "Client Since" date lost.

#### BUG 5 (LOW): Merge doesn't preserve guest-specific fields

`batch.set` overwrites entirely. Guest's `displayName`, `name`, `clientTag`, `staffNotes`, `accountStanding` are lost.

#### BUG 6 (TECH DEBT): Dormant Cloud Function with contradictory merge strategy

`mergeGuestAccount` (functions/index.js:L329) fires on `auth.user().onCreate` but exits early because email/password registration doesn't set `phoneNumber`. If phone auth is ever added, the Cloud Function activates and conflicts with client-side merge — one deletes the guest doc, the other deletes the new doc.

### What the Screen Does Well

1. **Correct doc ID strategy** — `setDoc(doc(db, "users", uid))` with Auth UID
2. **Atomic guest merge** — `writeBatch` ensures all-or-nothing for the 4-step migration
3. **PH phone validation** — strict `/^09\d{9}$/` regex
4. **Email normalization** — `trim().toLowerCase()`
5. **100% neubrutalism design compliance** — borderRadius:0, solid offset shadows, correct palette

---

## 10. helpers.js (0 bytes)

### File Metadata

| Property | Value |
|---|---|
| **Path** | `VetConnect/src/utils/helpers.js` |
| **Lines** | 0 (empty file) |
| **Consumers** | None — zero imports across entire mobile codebase |

### Finding: 7 Inline Utility Functions Scattered Across 6 Files

| Function | Location(s) | Duplicated? |
|---|---|---|
| `isValidPHPhone` | RegisterScreen.js:L42 + UserProfileScreen.js:L97 | **YES — identical copy-paste** |
| `formatHour` | ChatbotScreen.js:L84 | No |
| `calculateAge` | MyPetsScreen.js:L66 | No |
| `resolveTieredPrice` | BookAppointment.js:L309 | **YES — diverged from admin (missing NaN guard)** |
| `formatApptTime` | ClientAppointments.js:L52 | Near-duplicate of SuperCard's `formatTimestamp` |
| `formatTimestamp` | SuperCard.js:L29 | Near-duplicate of above |
| `getLocalDateStrMobile` | useBookingEngine.js:L16 | Exported but zero external consumers |

### Key Bug: Mobile `resolveTieredPrice` Missing NaN Guard

```js
// BookAppointment.js:L309 — MOBILE (no NaN guard)
const resolveTieredPrice = (svc, weight) => {
    if (!svc?.hasTieredPricing || !svc?.pricingTiers?.length || weight == null) return parseFloat(svc?.price) || 0;

// Admin resolveTieredPrice.js:L18 — ADMIN (has NaN guard)
if (petWeight == null || isNaN(Number(petWeight))) {
  return service.price || 0;
}
```

If `petWeight` is a non-numeric string like `"heavy"`, the mobile version proceeds into tier matching with NaN comparisons.

### 5 Different Date Formatting Approaches (No Centralization)

1. `.toLocaleDateString("en-US", { weekday, month, day })` — PetHistoryScreen, BookAppointment
2. `.toLocaleDateString()` (no locale) — UserProfileScreen, ClientDashboard
3. `.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })` — ClientAppointments, SuperCard
4. `formatHour()` custom function — ChatbotScreen
5. `getLocalDateStrMobile()` YYYY-MM-DD — useBookingEngine

---

### RegisterScreen Tasks (T2.417-T2.426)

| ID | Name | Priority | Effort |
|---|---|---|---|
| T2.417 | Fix BookAppointment profile check: `emergencyContacts?.[0]?.name` instead of `emergencyName` | **HIGH** | 15 min |
| T2.418 | Add Auth rollback on Firestore write failure: `userCredential.user.delete()` in catch | **P1** | 20 min |
| T2.419 | Merge: migrate `medical_records` where `ownerId == guestId` | **P1** | 15 min |
| T2.420 | Merge: preserve guest's original `createdAt` | **P2** | 10 min |
| T2.421 | Merge: carry forward `displayName`, `name`, `clientTag`, `staffNotes` from guest doc | **P2** | 15 min |
| T2.422 | Standard path: add `accountStatus: "active"` for schema consistency | **P3** | 5 min |
| T2.423 | Add friendly error messages for `auth/weak-password`, `auth/network-request-failed` | **P3** | 10 min |
| T2.424 | Document/remove dormant `mergeGuestAccount` Cloud Function | **P3** | 15 min |
| T2.425 | Remove duplicate `label` style definition (L312 vs L338) | **P3** | 5 min |
| T2.426 | Add `profileComplete: false` to registration payload | **P3** | 5 min |

### helpers.js Extraction Tasks (T2.427-T2.433)

| ID | Name | Priority | Effort |
|---|---|---|---|
| T2.427 | Extract `isValidPHPhone` into helpers.js, eliminate duplicates in RegisterScreen + UserProfileScreen | **P1** | 10 min |
| T2.428 | Extract `resolveTieredPrice` into helpers.js, port admin's NaN guard | **P1** | 15 min |
| T2.429 | Extract `calculateAge` into helpers.js with future-DOB guard | **P2** | 10 min |
| T2.430 | Extract unified `formatFirestoreTime` into helpers.js (merge formatApptTime + formatTimestamp) | **P2** | 15 min |
| T2.431 | Move `getLocalDateStrMobile` from useBookingEngine to helpers.js, add default parameter | **P2** | 10 min |
| T2.432 | Extract `formatHour` into helpers.js | **P3** | 5 min |
| T2.433 | Create `formatDisplayDate` + `formatDisplayTime` wrappers to standardize 5 date formatting approaches | **P3** | 20 min |

---

## Updated Task Count Summary

| Priority | Count |
|---|---|
| CRITICAL | 5 |
| P0 | 3 |
| HIGH | 4 |
| P1 | 19 |
| P2 | 22 |
| P3 | 38 |
| **Total** | **91** |

Task ID range: T2.343-T2.433

---

## Files Fully Audited

| File | Lines | Grade | Key Findings |
|---|---|---|---|
| QueueScreen.js | 301 | C | 2 crash bugs, privacy leak (all patients' data), status filter gaps, ManageQueueScreen dead code |
| ChatbotScreen.js | 446 | B- | Ignores workingDays/closedDates, services capped at 5 with ₱0 tiered, fake input bar |
| UserProfileScreen.js | 734 | C+ | emergencyName loop trap, stub delete handler, 12 field parity gaps, gender null/string mismatch |
| MyPetsScreen.js | 630 | C+ | P0 allergy mismatch, hard delete, N+1 serial queries, correct species duality (admin has bug) |
| ClientDashboard.js | 670 | B- | Queue-ahead completely broken (wrong field), 2 crash paths, strong neubrutalism, D3 confirmed |
| ClientAppointments.js | 994 | B | 2 critical field-name bugs, correct ID-based sales join, chunked batch fetching, sanitized reasons |
| PetHistoryScreen.js | 1,066 | B- | 3 Q11 privacy violations, lab results EXISTS (contradicts Q9), rich discharge card, single-listener |
| SuperCard.js | 241 | B+ | Clean stateless design, 3 fake phones across app, missing service type, correct status delegation |
| RegisterScreen.js | 414 | B | Auth-Firestore orphan risk, merge misses medical_records, correct doc ID, 100% neubrutalism |
| helpers.js | 0 | F | Empty file. 7 inline utilities should be centralized here. resolveTieredPrice diverged from admin. |
