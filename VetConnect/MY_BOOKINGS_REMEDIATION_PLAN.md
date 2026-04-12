# My Bookings Remediation Plan
## VetConnect Mobile Client Portal — `ClientAppointments.js`

**Target:** `VetConnect/src/screens/ClientAppointments.js` (653 lines) and supporting utilities
**Date:** 2026-04-12
**Scope:** P0 bug fixes (5) + Live Super-Card + Full 12-status badge system
**Execution model:** 6 sequential phases, each independently shippable

---

## 0. Scope Guardrails — Re-state Before Every Phase

### In scope (ship in this pass)
1. Five P0 bug fixes (audit-reason mismatch, rebook prefill, carried-over color, sales join, midnight fallback)
2. Live Super-Card component pinned above the list when an appointment is actively in-clinic
3. 12-status badge system (label + color + icon + `sanitizeCancelReason` helper)

### Out of scope (explicit — do NOT scope-creep)
- SectionList date-grouping ("Today / This week / Next week")
- Per-status CTA matrix (Reschedule, Directions, Add to Calendar, etc. — beyond the Super-Card's two CTAs)
- Bottom-sheet filter collapse / redesign
- Search or date-range filter
- Pet photo upload flow — fall back to species emoji
- Backend migration to backfill `auditReason` → `rejectReason` (fix is a read-side union)
- Sidebar / header redesign, dark mode
- Any changes to Admin-side writer code — this is a client-read-side fix only

If a phase turns out to need any of the above, stop and escalate — do not silently expand scope.

---

## 1. Verified Facts (from source reading, not assumption)

| Fact | Evidence |
|---|---|
| `ClientAppointments.js` reads `item.rejectReason` | Line 286-287 |
| Admin `useQueueActions.js` writes `auditReason` (4 call sites) | Lines 199, 245, 344, 377 |
| `Queue.jsx` also writes `auditReason` on shift/defer/no-show | Lines 779, 798, 807 |
| Client-side self-cancel writes `rejectReason: "Cancelled by Pet Owner"` | Line 131 |
| `handleRebook` passes zero params | Line 113-115 |
| `BookAppointment.js` does NOT read `route.params` today | grep confirmed |
| `handleShowReceipt` fetches sales doc but card never renders paid total | Lines 85-111, 207-210 |
| Completed card has no price row (guarded by `!isHistory`) | Line 207 |
| `statusLabels.js` has `carried-over` label but NO color case | `getClientStatusColor` switch 41-66 — `carried-over` missing |
| `statusLabels.js` is imported by `ClientDashboard.js` (label only) | grep confirmed |
| Pets collection has `species` / `breed` fields but NO photo URL field used anywhere | grep on `photo|image|avatar|pic` returned 0 hits in mobile screens |
| `clinic_settings/general` doc exists but has NO `clinicPhone` / `clinicAddress` field | grep confirmed |
| `sales` doc uses field name `total` and is linked via `appointmentId` | `Sales.jsx:80-82, 154`; `ClientAppointments.js:91-92` |
| `ACTIVE_STATUSES` canonical set = `arrived, in-consult, on-hold, dispensing, billing, confined` | `statusConstants.js:30-37` — matches the Super-Card trigger set exactly |
| Appointment doc fields available for Super-Card: `queueNumber`, `ticketPrefix`, `timeArrived`, `timeStarted`, `assignedVet`, `assignedVetId` | `useQueueActions.js:84, 140, 151, 193, 279-284` |

---

## 2. File-by-File Change Map

### 2.1 `VetConnect/src/utils/statusLabels.js` — EXTEND, do not rewrite

**Current exports:** `getClientStatusLabel`, `getClientStatusColor`
**New exports:** `getClientStatusIcon`, `isActiveStatus`, `sanitizeCancelReason`

| Symbol | Action | Line range (approx.) |
|---|---|---|
| `STATUS_LABELS` map | Edit — update labels to match the 12-status table in section 3 | 7-20 |
| `getClientStatusLabel` | Keep — fallback-behavior preserved | 29-32 |
| `getClientStatusColor` | Edit — add `carried-over` case with warm brown palette; split `billing` (teal, not green); split `in-consult`/`on-hold` (purple vs slate) | 41-67 |
| `getClientStatusIcon` | New — return emoji per status (see table §3) | append after `getClientStatusColor` |
| `isActiveStatus` | New — boolean helper, returns true for `{arrived, in-consult, on-hold, dispensing, billing, confined}` | append |
| `sanitizeCancelReason` | New — regex-based sanitizer, see §4 for exact logic | append |

**Regression risk note:** `ClientDashboard.js` imports only `getClientStatusLabel`. Label text changes (e.g. `'Appointment Confirmed'` → `'Confirmed'`) will cascade to the dashboard card. This is acceptable — labels are meant to be shared. Verify visually in QA.

**Admin side is not affected.** `statusLabels.js` lives under `VetConnect/src/utils`, not `VetConnect-Admin`. Admin has its own `statusConstants.js`.

---

### 2.2 `VetConnect/src/screens/ClientAppointments.js` — SURGICAL EDITS

| # | Line(s) | Change |
|---|---|---|
| A | 29 | Import additions: `getClientStatusIcon, isActiveStatus, sanitizeCancelReason` from `../utils/statusLabels` |
| B | 29 | New import: `SuperCard` component (path defined in §2.4) |
| C | 29 | New import: `Image, Linking, Animated` from `react-native` |
| D | ~42 | New state: `const [salesByAppt, setSalesByAppt] = useState({});` — keyed by appointmentId |
| E | 61-77 | `useEffect` subscribing to appointments — after `setAppointments(list)`, extract IDs of completed appointments, fire a batched sales fetch (see §6) into `salesByAppt` |
| F | 113-115 | `handleRebook` — pass params: `navigation.navigate('BookAppointment', { prefillPetId: item.petId, prefillServiceType: item.serviceType })` |
| G | 189-292 | `renderItem`: surgical touch-ups (do NOT rewrite whole function) — see §2.2.1 below |
| H | ~294, just before `<View style={styles.container}>` return | Compute `activeAppointment` via `appointments.find(a => isActiveStatus(a.status))` and `queueAhead` count. Pass to `<SuperCard>` as first child inside container, above tabs. |
| I | 386-410 | `FlatList` receives an optional `ListHeaderComponent` ONLY IF Super-Card is NOT pinned elsewhere. (Decision: place Super-Card as a sibling ABOVE tabs, not as list header, so it persists while user switches tabs. See §5.5.) |
| J | styles (490+) | Add no new style; Super-Card owns its own stylesheet in its own file |

#### 2.2.1 renderItem surgical edits

**Edit 1 — Cancellation reason sanitizer (line 286-288):**

Current:
```jsx
{item.status === "cancelled" && item.rejectReason && (
  <Text style={styles.reasonText}>Reason: "{item.rejectReason}"</Text>
)}
```

After:
```jsx
{item.status === "cancelled" && (() => {
  const raw = item.auditReason || item.rejectReason;
  const clean = sanitizeCancelReason(raw);
  return clean ? <Text style={styles.reasonText}>{clean}</Text> : null;
})()}
```

Notes:
- Read `auditReason` first (admin-written), fall back to `rejectReason` (legacy self-cancel).
- Drop the literal `"Reason:"` prefix and surrounding quotes — the sanitizer already produces warm copy that stands on its own.
- If sanitizer returns empty string, render nothing (no reason row at all).

**Edit 2 — Status pill with icon (line 204-206):**

Current:
```jsx
<Text style={[styles.status, getClientStatusColor(item.status)]}>
  {getClientStatusLabel(item.status).toUpperCase()}
</Text>
```

After:
```jsx
<Text style={[styles.status, getClientStatusColor(item.status)]}>
  {getClientStatusIcon(item.status)} {getClientStatusLabel(item.status).toUpperCase()}
</Text>
```

**Edit 3 — Completed card price (replace the `!isHistory && item.servicePrice > 0` block, line 207-209):**

```jsx
{!isHistory && item.servicePrice > 0 && (
  <Text style={styles.price}>Est. ₱{item.servicePrice}</Text>
)}
{isHistory && item.status === "completed" && salesByAppt[item.id]?.total != null && (
  <Text style={styles.price}>Paid ₱{salesByAppt[item.id].total}</Text>
)}
```

Fallback behavior: if `salesByAppt[item.id]` is undefined (query still in flight or no sales doc), render nothing — do NOT fall back to `servicePrice` on the completed card to avoid showing a pre-discount estimate as a "paid" amount.

**Edit 4 — Midnight time fallback (line 219-224):**

Current:
```jsx
<Text style={styles.date}>
  ⏰{" "}
  {item.scheduledDate
    ?.toDate()
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
</Text>
```

After: extract a helper inline (or local function at top of file):
```jsx
const formatApptTime = (tsDate) => {
  if (!tsDate) return '';
  const d = tsDate.toDate();
  if (d.getHours() === 0 && d.getMinutes() === 0) return 'Walk-in';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
```

And in JSX:
```jsx
<Text style={styles.date}>
  ⏰ {formatApptTime(item.scheduledDate)}
</Text>
```

---

### 2.3 `VetConnect/src/screens/BookAppointment.js` — PREFILL RECEIVER

**Current state:** does NOT read `route.params`. Route object is never destructured.

**Change:** accept and consume `prefillPetId` and `prefillServiceType`.

| # | Line | Change |
|---|---|---|
| 1 | 34 | Function signature: `export default function BookAppointment({ navigation, route })` |
| 2 | ~36 | Extract params: `const prefillPetId = route?.params?.prefillPetId || null; const prefillServiceType = route?.params?.prefillServiceType || null;` |
| 3 | After `pets` and `services` arrive from `useBookingEngine` (around line 70-75, wrap in a `useEffect`) | Apply prefill: once `pets.length > 0` AND `prefillPetId` AND `selectedPets.length === 0`, find the pet by ID and call `setSelectedPets([matchingPet])`. Similarly for `services` + `prefillServiceType` + `setSelectedServices`. |

**Example useEffect:**
```jsx
useEffect(() => {
  if (prefillPetId && pets.length > 0 && selectedPets.length === 0) {
    const match = pets.find(p => p.id === prefillPetId);
    if (match) setSelectedPets([match]);
  }
}, [prefillPetId, pets]);

useEffect(() => {
  if (prefillServiceType && services.length > 0 && selectedServices.length === 0) {
    const match = services.find(s => s.name === prefillServiceType || s.serviceType === prefillServiceType);
    if (match) setSelectedServices([match]);
  }
}, [prefillServiceType, services]);
```

**Pitfall:** Rebook prefill must NOT auto-advance past step 1 — user must still see the wizard and confirm. Only pre-select the items, do not call `setStep`.

**Unknown to verify during implementation:** the exact field name used to match services — it may be `name` or `serviceType`. The rebook payload passes `item.serviceType` from the appointment, which is the human-readable string stored on the appointment. Check `useBookingEngine.js` service shape if the first match attempt fails.

---

### 2.4 New file — `VetConnect/src/components/SuperCard.js`

**Path:** `VetConnect/src/components/SuperCard.js` (create `components/` dir if it doesn't exist — it's a conventional location and mirrors admin `src/features/*/components/`)

**Why a separate file:** the SuperCard has its own stylesheet, its own conditional render, its own Animated pulse instance, and its own deep-link handlers. Keeping it colocated with `ClientAppointments.js` would balloon the already-653-line file.

**Component contract:**

```
<SuperCard
  appointment={activeAppointment}          // the single active appointment object
  queueAhead={number}                      // count of active appts with earlier timeArrived
  clinicPhone={string}                     // from env or hardcode with TODO
  clinicAddress={string}                   // from env or hardcode with TODO
/>
```

If `appointment` is null/undefined, return `null` — caller passes unconditionally and SuperCard decides to render or not.

**Visual spec (mobile-soft, NOT neubrutalism):**
- Outer wrapper: `marginBottom: 20`, `marginHorizontal: 0` (the parent container already has `padding: 20`)
- `borderRadius: 16`
- White background
- `elevation: 6`, `shadowOpacity: 0.15`, `shadowOffset: {w:0, h:3}`, `shadowRadius: 8`
- Left accent bar: `borderLeftWidth: 4, borderLeftColor: statusColor` where `statusColor` comes from `getClientStatusColor(appointment.status).color`
- Padding: `16px`

**Internal layout (top to bottom):**
1. Row — pet avatar (species emoji in 52x52 circle with 2px solid border in status color) + pet name + species/breed
2. Status pill row — emoji + status label using `getClientStatusIcon` + `getClientStatusLabel` + `getClientStatusColor`. Optional pulsing dot next to label (use `Animated.loop` + `Animated.sequence` on opacity 0.4 → 1.0, 1200ms cycle, from `react-native` core — no Reanimated dep).
3. Ticket row — `Ticket: {ticketPrefix}-{String(queueNumber).padStart(3,'0')}` (e.g. `E-003`). Hide if queueNumber is null.
4. Vet row — `👨‍⚕️ {assignedVet}` — hide if assignedVet is null/undefined/`'Unassigned'`.
5. Time started row — `started at {timeStarted || timeArrived formatted}` — human-readable `h:mm AM/PM`. If neither field set, hide.
6. Queue-ahead row — `{queueAhead} ahead of you` — only show if `queueAhead > 0` AND `appointment.status === 'arrived'` (once in-consult, it stops being meaningful).
7. CTA row — two buttons, equal width:
   - "📞 Call Clinic" → `Linking.openURL(`tel:${clinicPhone}`)`
   - "🗺️ Directions" → `Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clinicAddress)}`)`

**Species emoji fallback map (keep internal to SuperCard):**
```js
const SPECIES_EMOJI = {
  Dog: '🐶', Canine: '🐶',
  Cat: '🐱', Feline: '🐱',
  Default: '🐾',
};
```

**queueAhead derivation (passed in from parent, documented here for reference):**
```js
const activeStatuses = ['arrived', 'in-consult', 'on-hold', 'dispensing', 'billing', 'confined'];
const activeAppt = appointments.find(a => a.ownerId === auth.currentUser.uid && activeStatuses.includes(a.status));
const queueAhead = activeAppt?.timeArrived
  ? appointments.filter(a =>
      a.id !== activeAppt.id &&
      a.status === 'arrived' &&
      a.timeArrived &&
      a.timeArrived.toMillis() < activeAppt.timeArrived.toMillis()
    ).length
  : 0;
```

Note: since `ClientAppointments.js` only subscribes to appointments *owned by the current user*, the "queue ahead" count will UNDERESTIMATE — it only sees this user's own ahead-of-them appointments (usually zero). This is an acceptable limitation for this pass. Document with a `// TODO: queue-ahead needs clinic-wide feed` comment. Do NOT add a new clinic-wide Firestore listener — out of scope.

**Alternative if product team rejects underestimate:** Hide the queue-ahead row entirely for this pass. Recommended default: **hide it**. Only show the started-at timestamp, which is unambiguous and useful.

**Clinic contact values for this pass:**
```js
// TODO: read from clinic_settings/general once fields are added (see plan §2.5)
const CLINIC_PHONE = '+639171234567';
const CLINIC_ADDRESS = 'Starbarks Vet Clinic, Metro Manila, Philippines';
```
Place these as module-level constants at the top of `SuperCard.js`.

---

### 2.5 `clinic_settings/general` — NO CHANGES THIS PASS

Do not add `clinicPhone` / `clinicAddress` fields to the settings doc. Hardcode with a `TODO` comment. Backfilling the settings doc is out of scope; it would require admin-side UI changes to Settings page which are not in this plan.

---

## 3. Full 12-Status Badge Table (single source of truth)

Copy this table verbatim into `statusLabels.js` as inline data for all three new functions.

| Key | Label | Icon | Foreground | Background | Active? |
|---|---|---|---|---|---|
| `pending` | Awaiting Confirmation | ⏳ | `#ED6C02` | `#FFF3E0` | no |
| `confirmed` | Confirmed | ✓ | `#2E7D32` | `#E8F5E9` | no |
| `arrived` | Checked In | 📍 | `#1565C0` | `#E3F2FD` | **yes** |
| `in-consult` | With the Vet | 🩺 | `#6A1B9A` | `#F3E5F5` | **yes** |
| `dispensing` | Preparing Meds | 💊 | `#E65100` | `#FFF3E0` | **yes** |
| `billing` | Ready for Checkout | 🧾 | `#00695C` | `#E0F2F1` | **yes** |
| `on-hold` | On Hold | ⏸ | `#455A64` | `#ECEFF1` | **yes** |
| `confined` | Admitted to Clinic | 🏥 | `#6A1B9A` | `#F3E5F5` | **yes** |
| `completed` | Visit Complete | ✔ | `#1976D2` | `#E3F2FD` | no |
| `cancelled` | Cancelled | ✕ | `#D32F2F` | `#FFEBEE` | no |
| `no-show` | Missed | ⚠ | `#D32F2F` | `#FFEBEE` | no |
| `carried-over` | Rescheduled by Clinic | ↻ | `#6D4C41` | `#EFEBE9` | no |

Implementation hint: define a single `STATUS_META` object of shape `{ key: { label, icon, color, bg, active } }` and have all four functions read from it. This is cleaner than parallel switches. Keep `getClientStatusLabel` and `getClientStatusColor` names/signatures unchanged for backward compatibility — their internals just delegate to `STATUS_META`.

---

## 4. `sanitizeCancelReason` — Exact Logic

**Location decision:** live in `statusLabels.js`.

**Rationale:** the sanitizer is tightly coupled to status display (only called for `status === 'cancelled'`). It has no other consumers in the codebase. A dedicated file would be overengineered for a single ~20-line pure function. If the sanitizer grows a second consumer later, promote it to `src/utils/reasonSanitizer.js` in a follow-up.

**Function signature:**
```js
export const sanitizeCancelReason = (rawReason) => string
```

**Return value:** a warm, pet-owner-friendly string, OR `''` (empty) if the raw input is null/undefined/empty/whitespace-only.

**Processing rules (apply in order, short-circuit on first match):**

| Priority | Pattern | Output |
|---|---|---|
| 1 | `null`, `undefined`, `''`, or whitespace-only | `''` (render nothing) |
| 2 | Starts with `[Triage Audit]` (case-insensitive) | `'Rescheduled by the clinic'` |
| 3 | Matches `/\[Clinical Triage:.*?\]/i` anywhere | `'Rescheduled by the clinic'` |
| 4 | Starts with `Shift Cleanup:` (case-insensitive) | `'Rescheduled by the clinic'` |
| 5 | Contains `forensic` or `audit` (case-insensitive, word boundary) | `'Cancelled by the clinic'` |
| 6 | Exactly `Cancelled by Pet Owner` (case-insensitive trimmed) | `'You cancelled this booking'` |
| 7 | Anything else | The raw string, trimmed (honor free-form admin reason) |

**Implementation sketch:**
```js
export const sanitizeCancelReason = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('[triage audit]')) return 'Rescheduled by the clinic';
  if (/\[clinical triage:.*?\]/i.test(trimmed)) return 'Rescheduled by the clinic';
  if (lower.startsWith('shift cleanup:')) return 'Rescheduled by the clinic';
  if (/\b(forensic|audit)\b/i.test(trimmed)) return 'Cancelled by the clinic';
  if (lower === 'cancelled by pet owner') return 'You cancelled this booking';

  return trimmed;
};
```

**Over-strip safety:** the `\b(forensic|audit)\b` regex uses word boundaries to avoid matching substrings (e.g. wouldn't match "auditory" if such a thing ever appeared). Priority ordering ensures bracketed prefixes are handled by rules 2-4 BEFORE the generic audit-word rule 5.

**Unit test inputs (for Phase 6 QA):**

| Input | Expected |
|---|---|
| `'[Triage Audit] No clinical justification provided'` | `'Rescheduled by the clinic'` |
| `'[Triage Audit] Vet no-show'` | `'Rescheduled by the clinic'` |
| `'[Clinical Triage: Equipment Failure]'` | `'Rescheduled by the clinic'` |
| `'Shift Cleanup: End of day purge'` | `'Rescheduled by the clinic'` |
| `'forensicSeal triggered'` | `'Cancelled by the clinic'` |
| `'Cancelled by Pet Owner'` | `'You cancelled this booking'` |
| `'cancelled by pet owner'` | `'You cancelled this booking'` |
| `'Pet owner requested cancellation'` | `'Pet owner requested cancellation'` (pass-through) |
| `null` | `''` |
| `'   '` | `''` |
| `undefined` | `''` |
| `''` | `''` |

---

## 5. Phase Breakdown

Each phase is independently committable. The repo is expected to be functional after each phase.

### Phase 1 — `statusLabels.js` extension (pure function, zero integration risk)

**Goal:** ship the new data layer. No UI changes yet.

**Steps:**
1. Edit `VetConnect/src/utils/statusLabels.js`
2. Introduce `STATUS_META` object per §3
3. Refactor `getClientStatusLabel` and `getClientStatusColor` to read from `STATUS_META` (no behavioral change for existing callers)
4. Add exports: `getClientStatusIcon`, `isActiveStatus`, `sanitizeCancelReason`
5. No other file touched this phase

**Verification checkpoint:**
- Run `npm run lint` in `VetConnect/` — zero new warnings
- Boot Expo (`npm start`), navigate to My Bookings, confirm existing status pills render identically (label text and colors may change slightly per §3 — that is intended, verify visually they still look correct)
- Navigate to Client Dashboard — the upcoming-appointment card (which uses `getClientStatusLabel`) still renders

**Regression risk:** `ClientDashboard.js` uses `getClientStatusLabel('confirmed')`. Current label = `'Appointment Confirmed'`. New label = `'Confirmed'`. Visual regression expected but acceptable. Verify and screenshot.

**Rollback:** revert the single file.

**Effort:** small (1-2 hours).

---

### Phase 2 — Bug 1: audit-reason read-side fix + sanitizer integration

**Goal:** surface admin cancellations with warm copy.

**Depends on:** Phase 1 (needs `sanitizeCancelReason`)

**Steps:**
1. Edit `ClientAppointments.js` line 29: add `sanitizeCancelReason` to existing statusLabels import
2. Edit lines 286-288 per §2.2.1 Edit 1
3. No other changes this phase

**Verification checkpoint:**
- In Firestore, manually set `status: 'cancelled'` and `auditReason: '[Triage Audit] No clinical justification provided'` on a test appointment — card shows `'Rescheduled by the clinic'`
- Set `auditReason: 'Pet owner requested reschedule'` — card shows the raw string (pass-through)
- Set `rejectReason: 'Cancelled by Pet Owner'` (legacy self-cancel) — card shows `'You cancelled this booking'`
- Null `auditReason`/`rejectReason` on a cancelled appointment — no reason row renders at all
- Regression: other statuses unaffected

**Rollback:** revert the renderItem block; the sanitizer stays (harmless dead code for 1 commit).

**Effort:** small (1 hour).

---

### Phase 3 — Bug 2: rebook prefill + Bug 5: midnight time fallback

**Goal:** fix the two smallest interaction bugs.

**Depends on:** nothing (can run parallel with Phase 2)

**Steps:**
1. Edit `ClientAppointments.js` `handleRebook` (line 113-115) per §2.2 row F
2. Edit `ClientAppointments.js` time render (line 219-224) per §2.2.1 Edit 4 — define `formatApptTime` near the top of the component or as a module-level helper
3. Edit `BookAppointment.js` per §2.3: accept `route` prop, add two prefill `useEffect` hooks

**Verification checkpoint:**
- Complete an appointment, then tap Re-Book on its history card → BookAppointment loads with the same pet pre-selected and the same service pre-selected, user still has to pick a date and time
- Rebook a walk-in (which has `serviceType: 'Consultation'` typically) → service prefill works
- Navigate to BookAppointment from Dashboard (no params) → prefill useEffects do nothing, normal flow works
- Seed a Firestore appointment with `scheduledDate` at midnight → card shows `⏰ Walk-in` not `⏰ 12:00 AM`
- Normal scheduled appointments still show their actual time

**Rollback:** both edits are isolated and revertible independently.

**Effort:** small-medium (1-2 hours — BookAppointment prefill matching may need adjustment based on actual service shape).

---

### Phase 4 — Bug 4: sales join for completed cards

**Goal:** show real paid totals on history cards.

**Depends on:** nothing (can run parallel with Phases 2 & 3)

**Steps:**
1. Edit `ClientAppointments.js`: add `salesByAppt` state (line ~42)
2. Inside the existing appointments `onSnapshot` callback, after `setAppointments(list)`, spawn a sales fetcher (details §6)
3. Edit renderItem price block (line 207-209) per §2.2.1 Edit 3

**Verification checkpoint:**
- Complete a booking all the way through billing → POS → payment. Navigate to My Bookings → History tab → the card shows `Paid ₱X` matching the actual POS total (not the estimated service price)
- Legacy completed appointments without a sales doc → card shows no price row (acceptable — no misleading estimate)
- Tap E-Receipt on a completed card → receipt modal still works (unchanged)

**Rollback:** revert the state + effect + renderItem block.

**Effort:** medium (2-3 hours — includes the batched query chunking logic).

---

### Phase 5 — Live Super-Card component

**Goal:** pinned hero card above the list when patient is in-clinic.

**Depends on:** Phase 1 (uses `getClientStatusIcon`, `getClientStatusColor`, `isActiveStatus`)

**Steps:**
1. Create `VetConnect/src/components/SuperCard.js` per §2.4 — full implementation with styles, Animated pulse, Linking deep-links, species emoji fallback, hardcoded clinic contact constants
2. Edit `ClientAppointments.js`:
   - Add import for `SuperCard`
   - Add derivation of `activeAppointment` near the top of the component body (after `filteredData` is fine, keep it above the return)
   - Compute `queueAhead` (recommended: default to 0 and hide the row — see §2.4 note)
   - Render `<SuperCard ... />` directly inside `<View style={styles.container}>`, as the FIRST child before the tabs row
3. Do NOT touch FlatList — Super-Card lives outside it and remains pinned across tab switches

**Verification checkpoint:**
- Book an appointment as client, arrive for it (admin marks it `arrived`) → Super-Card appears at top of My Bookings
- Admin moves it to `in-consult` → Super-Card status pill updates in real time via existing onSnapshot
- Admin moves it to `completed` → Super-Card disappears, the appointment moves to History tab with `Paid ₱X`
- Tap "Call Clinic" → triggers OS dialer with hardcoded number
- Tap "Directions" → opens Google Maps with hardcoded address
- No active appointment → no Super-Card, nothing visible above tabs (zero height, no gap)
- Switch to History tab → Super-Card still pinned (because it's outside FlatList)

**Regression risk:**
- Animated.loop not cleaned up on unmount → memory leak. Use `useEffect` with cleanup that calls `anim.stop()`
- Linking.openURL fails silently on iOS simulator (no dialer) — wrap in try/catch and log
- Emoji rendering differs cross-platform — acceptable

**Rollback:** delete `SuperCard.js`, revert the 4-line edit in `ClientAppointments.js`.

**Effort:** medium-large (3-4 hours — most of the time is visual polish).

---

### Phase 6 — Integration + QA

**Goal:** end-to-end smoke, regression testing, polish.

**Depends on:** Phases 1-5.

**Steps:**
1. Hard-reload Expo, log in as a client with multiple pets and a mix of pending/confirmed/cancelled/completed/in-flight appointments
2. Walk through the full QA checklist (§9)
3. Fix any visual regressions discovered
4. Verify no new lint warnings
5. Verify no console errors during normal operation

**Effort:** small-medium (1-2 hours).

---

## 6. Sales Batch Fetch — Structure

**Question:** N queries vs one `where('appointmentId', 'in', [...])`?

**Answer:** Use the `in` operator with **chunking at 10 IDs per query** (Firestore's `in` operator limit). This is better than N single-get queries for mid-sized history lists (typical client has 5-30 completed appointments).

**Implementation sketch (inside the appointments snapshot callback):**

```js
// after setAppointments(list)
const completedIds = list
  .filter(a => a.status === 'completed')
  .map(a => a.id);

if (completedIds.length === 0) {
  setSalesByAppt({});
  return;
}

// chunk into groups of 10 (Firestore 'in' limit)
const chunks = [];
for (let i = 0; i < completedIds.length; i += 10) {
  chunks.push(completedIds.slice(i, i + 10));
}

(async () => {
  const results = {};
  for (const chunk of chunks) {
    const salesQ = query(
      collection(db, 'sales'),
      where('appointmentId', 'in', chunk)
    );
    const snap = await getDocs(salesQ);
    snap.forEach(doc => {
      const d = doc.data();
      if (d.appointmentId) results[d.appointmentId] = d;
    });
  }
  setSalesByAppt(results);
})();
```

**Edge cases:**
- Empty completed list → set `{}` and return early, skip all queries
- Sales query throws → swallow and log; render without paid-total row (acceptable fallback)
- Multiple sales docs per appointmentId (shouldn't happen but defensive) → last-write-wins in the loop

**Performance:** for a typical user with <30 completed visits, this is 3 queries max. Runs once per appointment-snapshot update. Acceptable.

**Alternative considered:** add a `lastSaleTotal` denormalized field to appointment doc at billing time. Rejected — requires admin-side writer change and backfill. Out of scope.

---

## 7. Dependency Graph

```
Phase 1 (statusLabels)
  ├─> Phase 2 (sanitizer integration — needs sanitizeCancelReason)
  └─> Phase 5 (Super-Card — needs getClientStatusIcon, isActiveStatus)

Phase 3 (rebook + midnight) — independent, can run parallel with Phase 1/2
Phase 4 (sales join) — independent, can run parallel with Phase 1/2/3

Phase 6 (QA) depends on ALL previous phases
```

**Recommended execution order** for a single developer: 1 → 2 → 3 → 4 → 5 → 6. Phases 2, 3, 4 are short; batch them if desired, but ship Phase 1 first so label/color changes get a clean commit.

**Parallelizable for two devs:**
- Dev A: Phase 1 → Phase 2 → Phase 5
- Dev B: Phase 3 → Phase 4
- Join at Phase 6

---

## 8. Data Dependencies Confirmed

| Resource | Status | Notes |
|---|---|---|
| `pets.photoUrl` | **Does NOT exist** | Mobile-side grep returned 0 hits. Super-Card falls back to species emoji. No backfill required. |
| `clinic_settings/general.clinicPhone` | **Does NOT exist** | Hardcode in SuperCard.js with `// TODO` comment. Do not add Firestore fields this pass. |
| `clinic_settings/general.clinicAddress` | **Does NOT exist** | Same as above. |
| `sales.total` (field name) | **Confirmed** | Used throughout `Sales.jsx` |
| `sales.appointmentId` (join key) | **Confirmed** | Already used at line 92 of `ClientAppointments.js` |
| `appointments.auditReason` | **Confirmed** | Written by admin at 4 sites in `useQueueActions.js` + 3 sites in `Queue.jsx` |
| `appointments.rejectReason` | **Exists — legacy + self-cancel** | Written by mobile self-cancel flow at `ClientAppointments.js:131` |
| `appointments.ticketPrefix`, `.queueNumber`, `.assignedVet`, `.timeArrived`, `.timeStarted` | **Confirmed** | All written by `useQueueActions.js` on status transitions |

---

## 9. Testing Strategy

### Unit tests (manual — no test runner set up for mobile)
Run the `sanitizeCancelReason` test inputs from §4 manually in a scratch file or `console.log` block. Every input should match the expected output.

### Manual QA checklist — run at end of Phase 6

**Phase 1 — labels & colors**
- [ ] Boot app, log in as client, open My Bookings. All pills render with expected icon + label + color per §3 table
- [ ] Open Client Dashboard. Upcoming appointment card still renders (label text may have changed — verify)

**Phase 2 — audit reason sanitizer**
- [ ] Test appointment with `auditReason: '[Triage Audit] No clinical justification provided'` → card shows "Rescheduled by the clinic"
- [ ] Test appointment with raw `auditReason: 'Pet allergic to anesthetic — rescheduled for next week'` → card shows the raw text (pass-through)
- [ ] Test appointment with legacy `rejectReason: 'Cancelled by Pet Owner'` → card shows "You cancelled this booking"
- [ ] Test appointment with null reason → no reason row

**Phase 3 — rebook + midnight**
- [ ] Tap Re-Book on a completed appointment → BookAppointment opens with pet and service pre-selected. User can still choose a new date and time.
- [ ] Open BookAppointment from Dashboard → normal empty flow
- [ ] Create a seed appointment with midnight `scheduledDate` → card shows "Walk-in" not "12:00 AM"
- [ ] Normal scheduled appointments show correct time

**Phase 4 — sales join**
- [ ] Find a completed appointment with a sales doc → card shows "Paid ₱X" matching sales doc total
- [ ] Find a legacy completed appointment with no sales doc → card shows no price (not `servicePrice` estimate)
- [ ] E-Receipt modal still opens and displays correctly

**Phase 5 — Super-Card**
- [ ] With zero active appointments → no Super-Card, no empty space above tabs
- [ ] Admin marks an appointment `arrived` → Super-Card appears in real time with status "Checked In"
- [ ] Admin transitions to `in-consult` → Super-Card updates label/color/icon live
- [ ] Admin transitions to `completed` → Super-Card disappears, appointment moves to History tab with "Paid ₱X"
- [ ] Tap "Call Clinic" → OS dialer opens with hardcoded number (may fail on simulator — test on device)
- [ ] Tap "Directions" → Google Maps opens with clinic address
- [ ] Species emoji fallback shows correctly for Dog and Cat pets
- [ ] Super-Card remains pinned when switching between Upcoming / History tabs
- [ ] Kill app, reopen → Super-Card re-appears when listener hydrates
- [ ] If Animated pulse is implemented, verify status dot fades smoothly; unmount the screen and confirm no crash / no console warning about leaked animation

**Cross-cutting regression**
- [ ] Existing QR modal still works
- [ ] Existing Receipt modal still works
- [ ] Filters (pet, service) still work
- [ ] Empty-state messaging still works
- [ ] Self-cancel flow still works end-to-end (`'cancelled'` status + reason row)
- [ ] No new console errors or warnings
- [ ] No new lint warnings

---

## 10. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Sanitizer over-strips a legitimate free-form reason containing the word "audit" | Medium | Use `\b(forensic|audit)\b` word boundaries; priority order ensures bracketed prefixes are handled first. Escalate after QA if product wants a stricter allowlist. |
| Sales batch query fires on every snapshot update, burning Firestore reads | Low-Medium | Cache `salesByAppt` keyed by appointment ID; only fetch missing IDs on re-run. If this matters, add a `Set` of already-fetched IDs. For now, accept the re-fetch — completed appointments are immutable so this is cheap anyway. |
| `ClientDashboard.js` label changes cause visual regression | Low | Accepted regression; the dashboard is designed to reuse the same helper. Screenshot before/after. |
| BookAppointment prefill matches by wrong field (`name` vs `serviceType`) | Medium | Prefill effect is idempotent and gated by `selectedServices.length === 0` — worst case it silently does nothing. Test both matchers in QA. |
| Super-Card Animated.loop leaks on unmount | Medium | `useEffect` cleanup must call `anim.stop()`. Document in SuperCard.js. Or skip the pulse for v1 (acceptable — just use static dot). |
| `Linking.openURL('tel:...')` fails on iOS simulator | Low | Wrap in try/catch, log failure, no user-facing error. Test on physical device. |
| Queue-ahead count is inaccurate (client only sees own appointments) | Medium | Recommended: **hide the row this pass**. Document `TODO` for follow-up that introduces a clinic-wide listener. |
| `auditReason` field name change on admin side in the future | Low | Read-side union handles both; continues to work. |
| FlatList ListHeaderComponent pattern rejected in favor of sibling-above-FlatList | Low | SuperCard as sibling keeps it pinned across tab switches. Document the choice in the file comment. |

---

## 11. Effort Estimate (single developer)

| Phase | Effort | Notes |
|---|---|---|
| Phase 1 | 1-2h | Pure function extension |
| Phase 2 | 1h | Two-line read-side fix |
| Phase 3 | 1-2h | Rebook + midnight; BookAppointment prefill is the bulk |
| Phase 4 | 2-3h | Batch query chunking + state integration |
| Phase 5 | 3-4h | New component, animations, deep links, visual polish |
| Phase 6 | 1-2h | QA walkthrough |
| **Total** | **9-14h** | One focused day + QA the next morning |

---

## 12. Files Touched Summary

| File | Type | Phases |
|---|---|---|
| `VetConnect/src/utils/statusLabels.js` | Edit (extend) | 1 |
| `VetConnect/src/screens/ClientAppointments.js` | Edit (surgical) | 2, 3, 4, 5 |
| `VetConnect/src/screens/BookAppointment.js` | Edit (add prefill) | 3 |
| `VetConnect/src/components/SuperCard.js` | **New file** | 5 |

No backend changes. No Firestore schema changes. No Admin-side changes.

---

## 13. Commit Message Suggestions

- Phase 1: `feat(mobile): extend statusLabels with 12-status icons, sanitizer, and active-status helper`
- Phase 2: `fix(mobile): read auditReason on cancelled appointments and sanitize admin prefixes`
- Phase 3: `fix(mobile): pass rebook prefill params and graceful midnight time fallback`
- Phase 4: `feat(mobile): join sales collection to display paid totals on completed bookings`
- Phase 5: `feat(mobile): add pinned Super-Card for in-clinic appointments with live status`
- Phase 6: `chore(mobile): My Bookings QA polish`

---

## 14. Do-Not-Do List (out of scope reminders)

- Do NOT introduce `SectionList` — keep `FlatList`
- Do NOT add per-status CTA matrix beyond the Super-Card's two buttons
- Do NOT redesign filters or add search
- Do NOT touch Admin side writers — read-side union only
- Do NOT add Firestore clinic contact fields — hardcode with TODO
- Do NOT add a clinic-wide appointments listener for queue-ahead — hide the row instead
- Do NOT migrate legacy `rejectReason` → `auditReason` data — read-union handles it
- Do NOT add Reanimated or any new dependency — use RN core `Animated` if pulse is implemented
- Do NOT refactor `renderItem` into a separate component — surgical edits only this pass
- Do NOT auto-advance BookAppointment past step 1 on prefill — pre-select only
