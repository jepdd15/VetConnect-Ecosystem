# Closed Dates — Implementation Plan

**Field:** `clinic_settings/general.closedDates: string[]` (ISO `YYYY-MM-DD`, sorted asc, default `[]`)
**Path:** B (surgical) — ship `closedDates` end-to-end without touching 4 pre-existing bugs. Unblocks B5 follow-up booking.
**Scope owner:** one implementer, one branch, 6 phases.

---

## 1. Data Contract

| Attribute | Value |
|---|---|
| Field path | `clinic_settings/general.closedDates` |
| Type | `string[]` |
| Element format | `"YYYY-MM-DD"` — local wall-clock date in Asia/Manila, no time, no timezone suffix |
| Default | `[]` (empty array, not `null`, not `undefined`) |
| Ordering | Sorted ascending at write time — Settings UI is responsible |
| Deduping | Settings UI rejects duplicates; readers should still `new Set()`-coerce defensively |
| Size cap | No hard cap. Warn (toast) if > 365 entries on save |
| Comparison | String equality — always pair writes and reads with `getLocalDateStr(d)` |

**Why strings over Timestamps:** zero serialization cost, no timezone ambiguity, direct equality via `.includes()`, trivially diffable in Firestore console. The precision of Firestore Timestamp is worse-than-useless here (introduces a time-of-day ambiguity where we want none).

---

## 2. Out of Scope — Do Not Touch

These are pre-existing bugs. We know about them. They are explicitly deferred to a separate plan so this PR stays reviewable.

1. `useBookingEngine.js` never consults `workingDays` — Sunday slots are bookable today. **Not fixing here.**
2. `Queue.jsx` carry-over computes "tomorrow" without consulting `workingDays`. **Not fixing the workingDays gap here — only the closedDates gap.**
3. `secureBookAppointment` has no general date validation (past-date, working-day, future-limit). Only **add** the `closedDates` check — do not restructure.
4. `midnightQueueSweep` runs unconditionally on closed days. **Not fixing here.**
5. B5 One-Tap Follow-Up Booking — depends on this plan but is its own feature.
6. `openingTime` vs `openHour` drift in `Queue.jsx` (`clinicSettings.openingTime` line 295, 347 vs `openHour` elsewhere). Noise, not ours.

---

## 3. File-by-File Change List

### 3.1 `VetConnect-Admin/src/hooks/useClinicSettings.js`

| Line | Change |
|---|---|
| 9–14 | Add `closedDates: []` to `DEFAULT_SETTINGS` |

**Before:**
```js
const DEFAULT_SETTINGS = {
  maxCages: 5,
  closeHour: 17,
  openHour: 8,
  workingDays: [0, 1, 2, 3, 4, 5, 6],
};
```

**After:**
```js
const DEFAULT_SETTINGS = {
  maxCages: 5,
  closeHour: 17,
  openHour: 8,
  workingDays: [0, 1, 2, 3, 4, 5, 6],
  closedDates: [], // ISO YYYY-MM-DD strings, sorted asc
};
```

No new imports. No listener changes — existing `onSnapshot` merge at line 34 will pick up the new field automatically.

---

### 3.2 `VetConnect-Admin/src/pages/Settings.jsx`

**Placement decision:** fold into existing Pillar 1 (Operating Hours) — closed dates are conceptually adjacent to working days, and Pillar 1 currently has vertical slack. Do **not** create a new Pillar 6; that adds noise for a 2-control feature.

**Location:** append a new `<Grid size={{ xs: 12 }}>` block inside Pillar 1's inner `<Grid container>` (Settings.jsx line ~322–388), **after** the Working Days selector (line ~379) and **before** the lunch break divider (line ~381).

| Concern | Decision |
|---|---|
| Date input control | `<TextField type="date">` — native HTML. **Do not** add `@mui/x-date-pickers` for this. One-dep delta is not worth it |
| Rendering selected closures | MUI `<Chip>` with `onDelete`, sorted ascending, human-readable label via `toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })` |
| Add-a-date flow | Local `newClosedDate` state → "Add" button → validates → calls `handleChange('closedDates', [...sorted unique])` |
| Duplicate protection | Reject silently (toast: "Date already in closures list") |
| Past-date protection | Allow — staff may backfill a closure audit trail. No validation |
| Delete flow | Chip `onDelete` handler filters array and calls `handleChange` |
| Warning threshold | If `closedDates.length > 365` on save, show warning toast but do not block |
| Save flow | Existing `handleSave` at line 185 already persists the whole `settings` object. Nothing new needed — but verify `closedDates` is included in `sanitizedSettings` spread (it is, via `...settings`) |

**State additions** (add near line 116, after the main `settings` useState):
```js
const [newClosedDate, setNewClosedDate] = useState('');
```

**Handler additions** (add near the department CRUD handlers, ~line 215):
```js
const handleAddClosedDate = () => {
  if (!newClosedDate) return;
  const existing = settings.closedDates || [];
  if (existing.includes(newClosedDate)) {
    return setToast({ open: true, message: 'Date already in closures list.', severity: 'warning' });
  }
  const next = [...existing, newClosedDate].sort();
  handleChange('closedDates', next);
  setNewClosedDate('');
};

const handleRemoveClosedDate = (dateStr) => {
  const next = (settings.closedDates || []).filter(d => d !== dateStr);
  handleChange('closedDates', next);
};
```

**Icon import** (top of file, ~line 20): add `import BlockIcon from '@mui/icons-material/Block';`

**JSX block** (insert as a new Grid size xs=12 in Pillar 1, after line 379 `</ToggleButtonGroup></Grid>`):
```jsx
<Grid size={{ xs: 12 }}>
  <Divider sx={{ my: 1 }} />
  <Typography variant="overline" sx={{ fontWeight: '1000', color: COLORS.accent, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
    <BlockIcon sx={{ fontSize: 16 }} /> Clinic Closures (Holidays, Maintenance)
  </Typography>
  <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 1.5 }}>
    Specific dates the clinic is closed. Blocks mobile booking and skips queue defer/carry-over targets.
  </Typography>
  <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
    <TextField
      type="date"
      size="small"
      value={newClosedDate}
      onChange={(e) => setNewClosedDate(e.target.value)}
      sx={{ flex: 1, bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `2px solid ${COLORS.accent}33` } }}
      inputProps={{ style: { fontWeight: 1000 } }}
    />
    <Button
      variant="contained"
      onClick={handleAddClosedDate}
      disabled={!newClosedDate}
      sx={{
        borderRadius: 0, fontWeight: 1000, px: 3,
        bgcolor: COLORS.accent, border: `2px solid ${COLORS.accent}`,
        boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
        '&:hover': { bgcolor: COLORS.brand }
      }}
    >
      Add
    </Button>
  </Stack>
  {(settings.closedDates || []).length === 0 ? (
    <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, fontStyle: 'italic' }}>
      No closures scheduled.
    </Typography>
  ) : (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
      {(settings.closedDates || []).map(dateStr => (
        <Chip
          key={dateStr}
          label={new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
          onDelete={() => handleRemoveClosedDate(dateStr)}
          sx={{
            borderRadius: 0,
            border: `2px solid ${COLORS.accent}`,
            bgcolor: '#FFF8E1',
            fontWeight: 1000,
            color: COLORS.accent,
            boxShadow: '2px 2px 0px rgba(93, 64, 55, 0.15)',
            '& .MuiChip-deleteIcon': { color: COLORS.accent }
          }}
        />
      ))}
    </Box>
  )}
</Grid>
```

**Critical label parsing note:** `new Date(dateStr + 'T00:00:00')` is used intentionally to avoid the UTC-shift bug where `new Date("2026-04-12")` parses as UTC midnight (= 8am Asia/Manila = correct day) but `new Date("2026-04-12")` in some browsers silently becomes previous day. The `T00:00:00` suffix forces local-time interpretation.

**Warning toast on oversized arrays** — add inside `handleSave` after validation, before `setDoc`:
```js
if ((settings.closedDates || []).length > 365) {
  setToast({ open: true, message: `Warning: ${settings.closedDates.length} closure dates configured. Consider auditing.`, severity: 'warning' });
}
```
(Non-blocking — the save proceeds.)

---

### 3.3 `VetConnect/src/hooks/useBookingEngine.js`

**Mobile date helper decision:** add an inline helper at the top of the file. Reason: the mobile side has no `dateUtils.js` equivalent (only `helpers.js` and `statusLabels.js`), and this is the only place that currently needs `getLocalDateStr`. If a second caller emerges, extract to `VetConnect/src/utils/dateHelpers.js` then. YAGNI for now.

**Change 1 — add helper at line ~13 (before `export function useBookingEngine`):**
```js
// Local-time YYYY-MM-DD (Asia/Manila expected). Matches admin's getLocalDateStr.
const getLocalDateStr = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
```

**Change 2 — add `closedDates: []` to the default `clinicSettings` state at line 21–32:**
```js
const [clinicSettings, setClinicSettings] = useState({
  openHour: 8,
  closeHour: 17,
  advanceNoticeMins: 120,
  minSlotInterval: 30,
  lunchEnabled: true,
  lunchStart: 12,
  lunchEnd: 13,
  trafficModerate: 6,
  trafficHigh: 13,
  maxPetsPerBooking: 3,
  closedDates: [], // NEW
});
```

**Change 3 — block slot generation on closed dates.** Insert a guard at the top of `generateSlots` inside the `useEffect` at line 152, **before** the `if (!selectedServices...)` check at line 154:

```js
const generateSlots = async () => {
  // NEW: Closed-date guard — skip generation entirely if clinic is closed on this date
  const dateStr = getLocalDateStr(date);
  if ((clinicSettings.closedDates || []).includes(dateStr)) {
    setAvailableSlots([]);
    setLoadingSlots(false);
    return;
  }

  if (!selectedServices || selectedServices.length === 0 || selectedPets.length === 0) {
    setAvailableSlots([]);
    return;
  }
  // ... rest unchanged
};
```

**UI consideration (out of this file, but flag for mobile booking screen):** the BookAppointment screen currently shows an empty slot grid on a fully-booked day. On a closed day, an empty grid is ambiguous. Recommend the booking screen display a "Clinic Closed" notice when `availableSlots.length === 0 && !loadingSlots && date is in closedDates`. **However**, that UX polish is NOT in this plan's file list — noted as a follow-up. The engine contract here is "empty slot list"; whoever picks up B5 can layer the messaging.

---

### 3.4 `VetConnect-Backend/functions/index.js`

**Finding:** `secureBookAppointment` (line 116–187) currently does **not** read `clinic_settings/general`. We will add the read inline, not refactor.

**Change 1 — add clinic_settings read and closedDates check.** Insert after line 135 (after the advance-notice check) and before line 138 (the activeApptsQuery):

```js
  // CLOSED-DATE VALIDATION — block bookings on days the clinic is explicitly closed
  const settingsDoc = await db.collection('clinic_settings').doc('general').get();
  const closedDates = settingsDoc.exists ? (settingsDoc.data().closedDates || []) : [];

  // Normalize requested date to YYYY-MM-DD in Asia/Manila (UTC+8)
  // Use Intl for TZ correctness — the function runs in UTC, not Manila
  const manilaDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(requestedDate); // 'en-CA' locale = YYYY-MM-DD format

  if (closedDates.includes(manilaDateStr)) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'The clinic is closed on the selected date. Please choose another day.'
    );
  }
```

**Critical:** `getLocalDateStr` from the admin is wall-clock based and will **mis-format** inside a Cloud Function (which runs in UTC). We must use `Intl.DateTimeFormat` with `timeZone: 'Asia/Manila'` and `en-CA` locale (which outputs `YYYY-MM-DD` natively). Do not copy the client helper here.

**Change 2 — error code & message contract:** `'failed-precondition'` + message `"The clinic is closed on the selected date. Please choose another day."` Mobile client should surface this verbatim in the error alert. No message-parsing required — existing Expo error display chains should already forward `error.message`.

---

### 3.5 `VetConnect-Admin/src/features/Queue/Queue.jsx`

**This is the tricky one.** Carry-over currently computes `calculatedDefault` (line 350) and `manualDate` (line 360) without any closed-date awareness.

**Decisions:**

| Question | Decision | Justification |
|---|---|---|
| Max lookahead | **14 days** | Matches clinic-planning horizon. 7 is too tight (long holiday breaks); 30 is absurd for a vet clinic |
| All-closed failure mode | **Block the batch action + staff alert** | Silent skip corrupts the audit trail. Better to stop and force the staff to pick a manual date via EndOfDayModal's existing date picker |
| Scope | Only skip `closedDates`, NOT `workingDays` | Per out-of-scope exclusion #2. Surgical |

**Change 1 — add a helper at the top of Queue.jsx** (around line 66, after the `BREED_DATA` constant):
```js
/**
 * Given a target Date, return the next date (including target itself) that is
 * NOT in closedDates. Caps at maxLookahead days; throws if exceeded.
 * Ignores workingDays by design (pre-existing scope boundary).
 */
const advancePastClosedDates = (targetDate, closedDates = [], maxLookahead = 14) => {
  const set = new Set(closedDates);
  const cursor = new Date(targetDate);
  for (let i = 0; i <= maxLookahead; i++) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    if (!set.has(`${y}-${m}-${d}`)) return cursor;
    cursor.setDate(cursor.getDate() + 1);
  }
  throw new Error(
    `❌ CARRY-OVER BLOCKED: Next ${maxLookahead} days are all marked as clinic closures. Please pick a manual target date from the date picker.`
  );
};
```

**Change 2 — apply the helper in the shift-cleanup forEach loop** (Queue.jsx line 333–362).

Inside the `if (action === 'rebook' || ...)` block, modify the `calculatedDefault` computation at line 350–358 so that **after** the existing logic builds `calculatedDefault`, we push it forward past any closures:

**Before (line 350–362):**
```js
const calculatedDefault = new Date();
if (isFromPast && !isAfterHours) {
  calculatedDefault.setHours(pH, pM, 0, 0);
} else {
  calculatedDefault.setDate(calculatedDefault.getDate() + 1); 
  calculatedDefault.setHours(pH, pM, 0, 0);
}

const manualDate = targetDateMap[patient.id] 
  ? new Date(`${targetDateMap[patient.id]}T${precisionTime}:00`) 
  : calculatedDefault;
```

**After:**
```js
const calculatedDefault = new Date();
if (isFromPast && !isAfterHours) {
  calculatedDefault.setHours(pH, pM, 0, 0);
} else {
  calculatedDefault.setDate(calculatedDefault.getDate() + 1); 
  calculatedDefault.setHours(pH, pM, 0, 0);
}

// NEW: skip past clinic closures (but preserve staff's manual override)
const closedDates = clinicSettings.closedDates || [];
if (targetDateMap[patient.id]) {
  // Staff explicitly picked a date. Honor it even if closed (staff override).
  // If it's closed, they'll see the consequences — EndOfDayModal could warn.
} else {
  const advanced = advancePastClosedDates(calculatedDefault, closedDates, 14);
  calculatedDefault.setTime(advanced.getTime());
  calculatedDefault.setHours(pH, pM, 0, 0); // Re-apply precision time after date shift
}

const manualDate = targetDateMap[patient.id] 
  ? new Date(`${targetDateMap[patient.id]}T${precisionTime}:00`) 
  : calculatedDefault;
```

**Critical nuance:** if `advancePastClosedDates` throws (all 14 days closed), the current `forEach` will bubble the error up to the outer `try/catch` at Queue.jsx line ~482, which already shows `alert("Error: " + error.message)`. Good — the whole batch is aborted, no partial writes, staff sees the message. **Verify no writes have happened yet** — in the current code, `batch.update`/`batch.set` queue writes but do not commit until line 470 `await batch.commit()`. So throwing mid-loop is safe.

**Change 3 — staff-override warning (optional, nice-to-have).** If `targetDateMap[patient.id]` is set AND the picked date is in `closedDates`, append a warning to `targetReasonMap[patient.id]`. Defer this polish — not blocking.

---

### 3.6 `VetConnect-Admin/src/features/Queue/useQueueActions.js`

**Target:** `deferAppointment` (line 301–348) — currently sets `triageKey = getLocalDateStr(tomorrow)` without consulting `closedDates`.

**Change 1 — signature update.** `deferAppointment` already accepts `settings` as its 4th arg (line 301). Settings already contains `closedDates`. No signature change needed.

**Change 2 — import the helper.** Add at the top of useQueueActions.js:
```js
// Inline helper (duplicated from Queue.jsx advancePastClosedDates)
const advancePastClosedDates = (targetDate, closedDates = [], maxLookahead = 14) => {
  const set = new Set(closedDates);
  const cursor = new Date(targetDate);
  for (let i = 0; i <= maxLookahead; i++) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    if (!set.has(`${y}-${m}-${d}`)) return cursor;
    cursor.setDate(cursor.getDate() + 1);
  }
  throw new Error(
    `❌ DEFER BLOCKED: Next ${maxLookahead} days are all marked as clinic closures. Please reschedule manually.`
  );
};
```

**DRY note:** we are duplicating the helper rather than extracting to a shared util. Reason: two callers, simple 10-line function, extraction would require a new file + 2 imports. Extract later if a 3rd caller appears. **Flag for review** — if the reviewer prefers extraction, create `VetConnect-Admin/src/features/Queue/queueDateHelpers.js` and import from both.

**Change 3 — modify `deferAppointment` at line 313–316:**

**Before:**
```js
// CALCULATION: Shift the administrative triage focus to tomorrow
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const triageKey = getLocalDateStr(tomorrow);
```

**After:**
```js
// CALCULATION: Shift to tomorrow, skipping any clinic closures
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const targetDate = advancePastClosedDates(tomorrow, settings?.closedDates || [], 14);
const triageKey = getLocalDateStr(targetDate);
```

Note: `getLocalDateStr` is already imported at line 6. No new imports.

**Change 4 — `rescheduleAppointment` (line 350)** — **no change needed.** This function accepts an explicit `newDate` from the caller. It is up to the caller to pass a valid date. Do not add validation here; if a caller passes a closed date, that's the caller's bug to catch.

---

## 4. Phase Breakdown

Seven phases, each independently committable and deployable.

| # | Phase | Files | Effort | Blocking? |
|---|---|---|---|---|
| **1** | Schema foundation | `useClinicSettings.js` | S (15 min) | Blocks all others |
| **2** | Admin Settings UI | `Settings.jsx` | M (1–1.5 h) | Needs Phase 1 |
| **3** | Mobile booking guard | `useBookingEngine.js` | S (30 min) | Needs Phase 1 (reads field) |
| **4** | Cloud Function validation | `functions/index.js` + deploy | S (45 min + deploy) | Independent of 2/3 — can parallelize |
| **5** | Queue carry-over loop | `Queue.jsx` + `useQueueActions.js` | M (1.5 h) | Needs Phase 1 |
| **6** | P1 polish (optional) | Queue board guard, `pulseUtils.js` | S–M | Deferrable |
| **7** | Integration QA | (testing) | M (1 h) | Needs 1–5 deployed |

**Dependency graph:**
```
Phase 1 (schema)
   ├──> Phase 2 (Settings UI)  ──┐
   ├──> Phase 3 (Booking engine) ├──> Phase 7 (QA)
   ├──> Phase 5 (Queue loop)     │
   └──> Phase 4 (Cloud Function) ┘
              [must firebase deploy --only functions]
```

**Phases 2, 3, 4, 5 can run in parallel** after Phase 1 lands.

**Critical deploy step:** Phase 4 requires `cd VetConnect-Backend/functions && npm run deploy` (or `firebase deploy --only functions:secureBookAppointment`). Until the Cloud Function is redeployed, a malicious/stale client can bypass the closed-date check. **Sequence Phase 4 deploy BEFORE enabling the UI for real users** — deploy function first, merge UI second.

---

## 5. Testing Plan per Phase

### Phase 1 (schema)
- [ ] Load admin dashboard. Open console. Verify `useClinicSettings()` returns an object with `closedDates: []` on fresh load.
- [ ] Open Firestore console, delete `closedDates` field from `clinic_settings/general`. Reload admin. Verify no crash, default empty array applied.

### Phase 2 (Settings UI)
- [ ] Open Settings → Pillar 1. New "Clinic Closures" section visible below Working Days.
- [ ] Type date `2026-04-15` (or any near future) → Add → chip appears.
- [ ] Try to add the same date again → toast "already in closures list".
- [ ] Add 3 dates out of order → verify chips render sorted ascending.
- [ ] Delete a chip → array shrinks.
- [ ] Click "Save Configuration" → Firestore doc has `closedDates: ["2026-04-15", ...]`.
- [ ] Add 366 dates (via console seeding) → save → warning toast shows but save succeeds.
- [ ] Past-date (e.g. `2020-01-01`) → allow (no block).
- [ ] Add a date, do NOT save, reload page → fresh Firestore state wins.

### Phase 3 (Mobile booking guard)
- [ ] Seed `closedDates: ["<tomorrow's date>"]` via Settings UI.
- [ ] Open mobile BookAppointment, select pet + service, pick tomorrow's date.
- [ ] Verify `availableSlots.length === 0` and `loadingSlots === false`.
- [ ] Pick the day after → slots return normally.
- [ ] Remove the date from Settings → within seconds (listener), mobile date re-opens.
  - **CAVEAT:** `useBookingEngine` fetches `clinic_settings` via `getDoc` (one-shot, line 58) not `onSnapshot`. It will NOT auto-refresh until the hook remounts. Document this as a known limitation — do not attempt to fix in this plan. Staff guidance: "edit closures during off-hours; mobile clients pick up changes on next screen navigation."

### Phase 4 (Cloud Function)
- [ ] Deploy function: `firebase deploy --only functions:secureBookAppointment`.
- [ ] From mobile app (with Phase 3 guard temporarily bypassed by hardcoding a closed date), invoke booking → expect `failed-precondition` error with the exact message.
- [ ] Alternate: use Firebase emulator + `curl` to POST to the function directly with a `baseDateTime` on a closed day → expect same error.
- [ ] Verify normal bookings on non-closed days still work (regression check).
- [ ] Verify the new `db.collection('clinic_settings').doc('general').get()` read does not inflate cold-start latency unacceptably (<100 ms additional; one doc read).

### Phase 5 (Queue carry-over loop)
- [ ] Seed `closedDates` with tomorrow + day-after-tomorrow.
- [ ] Open Queue, leave a patient in `confirmed` status, trigger End-of-Day modal, select "Defer".
- [ ] Verify `manualDate` lands on day+3 (skipping both closures).
- [ ] Inspect written `scheduledDate` in Firestore: should be day+3 at `precisionTime`.
- [ ] Test the direct `deferAppointment` path (inbox triage on a pending appointment) → `triageDate` should equal day+3 ISO string.
- [ ] **Edge case — all 14 days closed:** seed `closedDates` with the next 15 days. Attempt to defer. Expect `alert("Error: ❌ CARRY-OVER BLOCKED: ...")`. Verify NO Firestore writes occurred (check patient's `scheduledDate` unchanged, batch aborted).
- [ ] **Edge case — staff override:** seed closure for tomorrow. Use the EndOfDayModal date picker to explicitly pick tomorrow → verify override honored (date lands on tomorrow despite closure, per "staff override" decision).
- [ ] **Regression — no closedDates set:** empty array → behavior identical to pre-change (defer lands on tomorrow exactly).

### Phase 6 (P1 polish — optional)
**Queue board navigation guard:** When `filterDate` is in `closedDates`, show a yellow alert banner above the DataGrid: `"⚠️ Clinic is closed on this date. Ticketing & carry-over defaulted elsewhere."`

- Location: Queue.jsx around line 1346 (near the existing `isTomorrowView && hasGhostPatients` alert).
- Trigger: `clinicSettings.closedDates?.includes(filterDate)`.
- Non-blocking — staff can still view/edit for audit purposes.

**Metrics engine closed-date handling (`pulseUtils.js` `getOperationalMinutes`):** Currently `workingDays.includes(curr.getDay())` at line 66 excludes non-working days from business-hour math. Analogously, closedDates should be excluded.

- Add `const closedDates = settings.closedDates || [];` at line ~30.
- Inside the `while` loop at line ~58, add: `const currStr = ${y}-${m}-${d}`; if (closedDates.includes(currStr)) { curr = <advance day>; continue; }`
- **Why P1:** pulse metrics drive the forensic audit grid. If the clinic is closed on a day and a record's timer spans it, those minutes should NOT count toward operational duration (same logic as workingDays exclusion).
- **Scope risk:** this touches the "temporal engine" — a change here can shift every historical metric. Gate behind a careful regression of the ForensicMetricGrid. If unsure, defer to a separate plan.

### Phase 7 (End-to-end integration)
- [ ] Full flow: admin adds closure for tomorrow → mobile client opens booking for tomorrow → sees no slots → picks day after → books successfully → Cloud Function accepts → staff sees booking in Queue tomorrow view (sees board guard banner) → staff end-of-days today → deferred patients skip tomorrow and land on day after tomorrow.
- [ ] Remove closure → verify tomorrow's slots re-open (after mobile screen remount).
- [ ] Cross-tab: two admins — one adds a closure, the other has Queue open. Second admin's `useClinicSettings` updates via onSnapshot, subsequent defers use new closures.

---

## 6. Regression Risks

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Empty `closedDates` breaks carry-over | Low | High | `advancePastClosedDates([], ..., 14)` is a no-op loop that returns `targetDate` on iteration 0. Test explicitly (Phase 5 regression) |
| `setDoc(..., { merge: true })` strips `closedDates` because some code path re-writes without it | Medium | High | Grep all `setDoc.*clinic_settings/general`. There is one — `Settings.jsx` `handleSave` — and it spreads `...settings` so `closedDates` round-trips. Verify no secondary writers exist |
| Cloud Function deploys after UI — stale backend accepts closed-date bookings | High | Medium | Deploy backend FIRST (Phase 4), then merge frontend. Document in release checklist |
| `useBookingEngine` uses `getDoc` not `onSnapshot` for settings — mobile clients see stale closures | High | Low | Document limitation. Users re-navigating the screen will pick up changes. Full fix = convert to listener, out of scope |
| Pre-existing `openingTime` vs `openHour` drift in Queue.jsx line 295 poisons the `precisionTime` calculation | Low | Medium | Pre-existing. Not our bug. Do not touch |
| `new Date('2026-04-15')` parses as UTC in some browsers, skewing chip labels by a day | Medium | Low | Use `new Date(dateStr + 'T00:00:00')` in chip labels (already specified in 3.2) |
| Staff overrides closed date via EndOfDayModal date picker → lands patient on closed day | Low | Low | Intentional override. No-op or append warning to audit reason (Phase 6 polish) |
| Cloud Function doc read adds ~50 ms cold-start latency per booking | Low | Low | Single doc read is negligible. If it matters, cache in module scope with short TTL |
| `advancePastClosedDates` throwing mid-`forEach` aborts the batch — but some patients may have already had `batch.update` queued | Low | Low | `batch.commit()` is atomic. Uncommitted queued ops are discarded on throw. Verify by walking code path |
| Closed-dates array exceeds Firestore field size (1 MiB) | Very Low | Low | 365 entries × ~11 bytes/string = 4 KiB. Not a concern unless someone seeds 50 years of closures |

---

## 7. Effort Estimate

| Phase | Estimate | Risk Multiplier |
|---|---|---|
| 1. Schema | 15 min | 1× |
| 2. Settings UI | 1.5 h | 1.3× (styling tweaks) |
| 3. Booking engine | 30 min | 1× |
| 4. Cloud Function + deploy | 45 min + 10 min deploy wait | 1.2× (TZ edge cases) |
| 5. Queue carry-over | 1.5 h | 1.5× (trickiest; two files, edge cases) |
| 6. P1 polish (if bundled) | 1 h | 1.5× (pulseUtils risk) |
| 7. Integration QA | 1 h | 1× |
| **Subtotal (no P1)** | **~5.5 h** | |
| **Subtotal (with P1)** | **~6.5 h** | |

**Realistic full day of focused work.** Add 50% for context switching, PR review, and the inevitable "oh wait, the mobile app fetches settings one-shot" rediscovery → **~8–10 hours wall-clock.**

**Parallelization:** if a second dev is available, Phase 4 can run in parallel with Phases 2/3/5 after Phase 1 lands. Shaves ~1 hour.

---

## 8. Rollback

- Phase 1 (schema): revert = delete field from `DEFAULT_SETTINGS`. No data migration needed — Firestore docs happily have or lack the field.
- Phase 2 (Settings UI): revert = remove the UI block. Existing `closedDates` in Firestore are harmless orphans.
- Phase 3 (Booking engine): revert = remove the guard. Bookings on closed dates work again (the undesired state, but not broken).
- Phase 4 (Cloud Function): revert = redeploy previous version. `firebase deploy --only functions:secureBookAppointment`.
- Phase 5 (Queue loop): revert = remove helper + restore the 4-line calculatedDefault block. Carry-over returns to prior (closed-date-ignorant) behavior.

No schema migration. No destructive writes. Full reversibility.

---

## 9. Open Questions for the Implementer

1. **P1 scope**: bundle Phase 6 with this PR, or split? Recommendation: **split** — the metrics engine change is risky enough to warrant its own review pass.
2. **Staff override warning**: add the "you picked a closed date" toast in EndOfDayModal, or skip? Recommendation: **skip** for v1, revisit when QA surfaces confusion.
3. **Mobile BookAppointment UX**: add a "Clinic Closed" banner when slots array is empty on a closed day? Recommendation: **yes, but in a separate mobile-UX PR** — keep this plan's mobile touchpoint confined to `useBookingEngine.js`.
4. **Unified helper file**: extract `advancePastClosedDates` to a shared util or keep duplicated in 2 files? Recommendation: **duplicate now, extract when the 3rd caller lands** (probably B5 follow-up booking).
