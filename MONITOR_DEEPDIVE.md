# Monitor.jsx Deep Dive

> **Target file:** `VetConnect-Admin/src/pages/Monitor.jsx` (125 lines, commit `9d1f662`)
> **Companion documents:** [ECOSYSTEM_ARCHITECTURE_REPORT.md](ECOSYSTEM_ARCHITECTURE_REPORT.md)
> **Audit method:** codebase-architecture-researcher sub-agent, forensic file-level analysis with cross-reference against Queue.jsx, useQueueActions.js, AssignStaffModal.jsx, WalkInModal.jsx, mobile QueueScreen.js, and designTokens.js.

---

## Executive Summary

`Monitor.jsx` is a 125-line, single-purpose lobby TV display that shows the currently-serving queue number and basic ticket context. It subscribes to the `queue/daily_queue` Firestore document via `onSnapshot` and performs a secondary one-shot query to `appointments` to fetch ticket metadata. The file has **13 bugs** including a P0 race condition in `fetchTicketDetails`, complete absence of the ticket prefix system, semantically inverted priority logic, missing queue-status handling, and wholesale design token violations. The component appears to be an early prototype that was never revisited after the queue system matured.

---

## File Metadata

| Property | Value |
|---|---|
| **Path** | `VetConnect-Admin/src/pages/Monitor.jsx` |
| **Lines** | 125 |
| **Imports (MUI)** | `Box`, `Typography`, `Card`, `Chip`, `Grid`, `CircularProgress` |
| **Imports (Firestore)** | `doc`, `onSnapshot`, `collection`, `query`, `where`, `getDocs` |
| **Imports (Icons)** | `PetsIcon`, `CampaignIcon` |
| **Unused imports** | `Grid` (never used in JSX) |
| **Design token imports** | **NONE** |

---

## Firestore Read/Write Paths

| Line(s) | Collection/Doc | Operation | Method | Real-time? |
|---|---|---|---|---|
| L18 | `queue/daily_queue` | Read | `onSnapshot` | Yes |
| L34 | `appointments` (where `queueNumber == number`) | Read | `getDocs` (one-shot) | No |

Write paths: None. This component is read-only.

---

## State Inventory

| State Variable | Type | Initial | Line | Purpose |
|---|---|---|---|---|
| `queueData` | `object|null` | `null` | L13 | Full `daily_queue` document data |
| `currentTicket` | `object|null` | `null` | L14 | Appointment doc for currently-serving ticket |

---

## Data Flow Diagram

```
┌────────────────────────────────┐
│   Firestore: queue/daily_queue │
│   {currentServing, currentPrefix, lastNumberIssued, status}
└────────────┬───────────────────┘
             │ onSnapshot (L18)
             ▼
┌────────────────────────────────┐
│   Monitor.jsx                  │
│   setQueueData(data)           │──── renders queueData.currentServing (L85)
│                                │
│   fetchTicketDetails(          │
│     data.currentServing)       │     ← NOTE: ignores data.currentPrefix
└────────────┬───────────────────┘
             │ getDocs query (L34)
             │ where("queueNumber", "==", number)
             ▼
┌────────────────────────────────┐
│   Firestore: appointments/     │
│   (finds first doc with        │
│    matching queueNumber)       │
└────────────┬───────────────────┘
             │ snap.docs[0].data() (L37)
             ▼
┌────────────────────────────────┐
│   setCurrentTicket(data)       │
│   Renders:                     │
│   - currentTicket.serviceType  │ ← STALE: walk-ins use .primaryService
│   - isPriority logic (L46)     │ ← INVERTED semantics
│   - Chip label                 │
└────────────────────────────────┘
```

### Comparison: Mobile QueueScreen Displays Prefix Correctly

```
Mobile QueueScreen.js L103-105:
  currentServingDisplay = `${queueData.currentPrefix || ""} ${queueData.currentServing}`
  Renders: "W5", "E3", "A7"  ← CORRECT

Admin Monitor.jsx L85:
  {queueData.currentServing}
  Renders: "5", "3", "7"     ← MISSING PREFIX
```

---

## Bugs Found

### P0 — Race Condition in `fetchTicketDetails`

**Location:** `Monitor.jsx:L17-26, L29-41`

```js
// L17-26
useEffect(() => {
    const unsub = onSnapshot(doc(db, "queue", "daily_queue"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setQueueData(data);
        fetchTicketDetails(data.currentServing);  // async, no cancellation
      }
    });
    return () => unsub();
  }, []);
```

```js
// L29-41
const fetchTicketDetails = async (number) => {
    if (number === 0) {
      setCurrentTicket(null);
      return;
    }
    const q = query(collection(db, "appointments"), where("queueNumber", "==", number));
    const snap = await getDocs(q);
    if (!snap.empty) {
      setCurrentTicket(snap.docs[0].data());
    } else {
      setCurrentTicket(null);
    }
  };
```

Every `onSnapshot` fire calls `fetchTicketDetails` which is `async`. If `currentServing` changes from 5 to 6 rapidly, both fetches run concurrently. If ticket 5's fetch resolves AFTER ticket 6's, the display shows ticket 5's metadata with ticket 6's number. No abort controller, no sequence counter, no staleness check.

### P0 — Ticket Prefix Completely Missing from Display

**Location:** `Monitor.jsx:L85`

```js
<Typography variant="h1" sx={{ fontSize: '12rem', fontWeight: 'bold', color: '#BF360C', lineHeight: 1 }}>
  {queueData.currentServing}
</Typography>
```

The queue system writes `currentPrefix` to `queue/daily_queue` (confirmed at `useQueueActions.js:88`) and the mobile QueueScreen correctly concatenates prefix + number. Monitor.jsx reads `queueData` which INCLUDES `currentPrefix` but never renders it. Tickets display as "5" instead of "W-005".

### P1 — `isPriority` Logic is Semantically Inverted

**Location:** `Monitor.jsx:L46`

```js
const isPriority = currentTicket && currentTicket.ownerId !== 'WALK_IN_USER';
```

This treats ALL pre-booked appointments as "priority" (blue tint) and ALL walk-ins as non-priority (grey). But:
- **Emergency walk-ins** (`ticketPrefix: 'E'`, `priority: 'high'`) are the TRUE priority patients
- **Pre-booked appointments** (`ticketPrefix: 'A'`) are normal scheduled visits

A pre-booked wellness check gets blue "priority" styling while an emergency ER admission gets grey "walk-in" styling.

Correct logic should check: `currentTicket.priority === 'high'` or `currentTicket.ticketPrefix === 'E'`

### P1 — `serviceType` Missing for Walk-ins

**Location:** `Monitor.jsx:L92`

```js
<Typography variant="h3" sx={{ mt: 2, mb: 2, fontWeight: 'bold', color: textColor }}>
  {currentTicket.serviceType}
</Typography>
```

Walk-in appointments created via `WalkInModal.jsx` do NOT set a `serviceType` field. They use `services[]` array and `primaryService` field. For walk-ins, `currentTicket.serviceType` will be `undefined`, rendering nothing.

### P1 — No Queue Status Handling (Paused/Closed)

Monitor.jsx reads `queueData` which contains `status` field (values: `'active'`, `'paused'`). Mobile QueueScreen renders the queue status. Monitor.jsx never reads `queueData.status`. When queue is paused or clinic is closed, the lobby TV still shows "NOW SERVING" with stale data.

### P1 — 12+ Hardcoded Colors, Zero Design Token Imports

| Line | Hardcoded Value | Should Be |
|---|---|---|
| L47 | `'#E3F2FD'` | Design token |
| L48 | `'#1565C0'` | `COLORS.medical` |
| L54 | `'#212121'` | Needs monitor-specific token |
| L64 | `'#FFB74D'` | No matching token |
| L79 | `borderRadius: 8` | `borderRadius: 0` per design system |
| L80 | `boxShadow: '0px 0px 50px rgba(...)'` | Solid offset shadow per design system |
| L84 | `'#BF360C'` | `COLORS.ctaHover` |
| L119 | `'#aaa'` | `COLORS.textMuted` |

### P1 — `borderRadius: 8` + Blur Shadow

**Location:** `Monitor.jsx:L79-80`

```js
borderRadius: 8,
boxShadow: '0px 0px 50px rgba(255, 183, 77, 0.3)'
```

Design system mandates `borderRadius: 0` and solid offset shadows.

### P2 — Query Returns First Doc — Possible Wrong Match Across Days

**Location:** `Monitor.jsx:L34-37`

```js
const q = query(collection(db, "appointments"), where("queueNumber", "==", number));
const snap = await getDocs(q);
if (!snap.empty) {
    setCurrentTicket(snap.docs[0].data());
```

Queue numbers reset daily (`midnightQueueSweep`). Old appointments retain their `queueNumber`. The query has no date filter — could return yesterday's ticket #3 instead of today's.

### P2 — `currentServing === 0` Check Misses `null`/`undefined`

**Location:** `Monitor.jsx:L30`

```js
if (number === 0) {
```

If `currentServing` is `undefined` (corrupted doc), `undefined === 0` is false. The function proceeds to query with `undefined`, failing silently. Display renders `undefined` as text.

### P2 — Unused `Grid` Import

**Location:** `Monitor.jsx:L4`

```js
import { Box, Typography, Card, Chip, Grid, CircularProgress } from '@mui/material';
```

`Grid` never used in JSX.

### P2 — Hardcoded Clinic Name

**Location:** `Monitor.jsx:L120`

```js
Starbarks Veterinary Clinic • Please wait for your number
```

Should come from `clinic_settings` or a constant.

### P2 — No Error Handling on Firestore Calls

The `onSnapshot` at L18 has no error callback. The `getDocs` at L35 has no try/catch. If Firestore connectivity drops, the TV silently freezes on last known state.

### P3 — No Multi-Service Awareness

L92 renders only `currentTicket.serviceType` — a single string. Walk-ins can have multiple services in `services[]`.

---

## TV Accessibility Assessment

| Criterion | Status | Notes |
|---|---|---|
| Large number display | **GOOD** | `fontSize: '12rem'` — extremely readable |
| High contrast | **PARTIAL** | Dark bg with white text — good. Card uses light pastels with medium text — lower contrast |
| Service type readability | **POOR** | MUI h3 default ~3rem — adequate but not TV-optimized |
| Chip readability | **POOR** | `fontSize: '1.5rem'` — too small for TV at distance |
| Footer readability | **POOR** | `#aaa` on `#212121` — very low contrast |
| Animation/attention | **NONE** | No pulsing, transitions, or sound on number change |
| Queue position context | **NONE** | No "X people ahead" or upcoming queue display |

---

## Cross-Cutting Finding: AssignStaffModal Ticket Prefix Bug

While tracing how tickets are assigned, the agent found that `AssignStaffModal.jsx:147` assigns ticket prefix `'W'` (walk-in) to ALL check-ins:

```js
ticketPrefix: patient.priority === 'high' ? 'E' : 'W',
```

Pre-booked appointments should get prefix `'A'`, not `'W'`. The prefix system is broken at the source — Monitor.jsx couldn't display correct prefixes even if it tried. (This is a bug in AssignStaffModal, not Monitor.jsx itself.)

---

## What the Page Does Well

1. **Real-time listener** on queue doc with proper cleanup
2. **Loading state** — spinner while `queueData` is null
3. **Fullscreen layout** — `MainLayout` correctly suppresses sidebar for `/monitor`
4. **Clear visual hierarchy** — giant 12rem number is immediately readable
5. **Dark background** — appropriate for always-on lobby display (reduces burn-in risk)

---

## Proposed Tasks

| ID | Name | Priority | Effort | Notes |
|---|---|---|---|---|
| T2.231 | Fix race condition: add sequence counter or convert to `onSnapshot` listener for ticket details | **P0** | 30 min | Stale ticket metadata display |
| T2.232 | Display ticket prefix alongside number (`W-005`, `E-003`) | **P0** | 15 min | Parity with mobile QueueScreen |
| T2.233 | Fix `isPriority` to check `priority === 'high'` or `ticketPrefix === 'E'` | **P1** | 10 min | Emergency walk-ins get wrong styling |
| T2.234 | Fix service display: use `primaryService || serviceType || 'General Visit'` | **P1** | 10 min | Walk-ins render blank service |
| T2.235 | Add queue status handling — show "QUEUE PAUSED" / welcome message when inactive | **P1** | 30 min | TV shows stale "NOW SERVING" when clinic closed |
| T2.236 | Add date filter to appointments query (prevent matching stale tickets from previous days) | **P2** | 15 min | Cross-day queue number collision |
| T2.237 | Replace hardcoded colors with design tokens + fix borderRadius/shadow | **P2** | 30 min | 12+ violations |
| T2.238 | Add error handling to Firestore calls (onSnapshot error callback + getDocs try/catch) | **P2** | 15 min | Silent failures |
| T2.239 | Replace hardcoded clinic name with `clinic_settings` read | **P2** | 10 min | Same issue as Sales receipts (T2.148) |
| T2.240 | Remove unused `Grid` import | **P3** | 1 min | Dead code |
| T2.241 | Fix `currentServing` null/undefined guard (change `=== 0` to `!number`) | **P2** | 5 min | Edge case crash |

**Cross-reference task (discovered here, lives in AssignStaffModal):**

| ID | Name | Priority | Effort | Notes |
|---|---|---|---|---|
| T2.242 | Fix AssignStaffModal ticket prefix: pre-booked should get `'A'`, not `'W'` | **P1** | 10 min | Prefix system broken at source |
