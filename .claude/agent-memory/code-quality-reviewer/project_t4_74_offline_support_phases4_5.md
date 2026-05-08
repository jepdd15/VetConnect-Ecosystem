---
name: T4.74 Phases 4-5 — Mobile Offline Support (Error Callbacks + Offline UI)
description: Phases 4-5 review findings: onSnapshot error callbacks across 4 screens, 10s timeout, offline UI states, useBookingEngine try/catch; 2 ISSUEs and 3 ADVISORIEs
type: project
---

## Key Findings

**ISSUE: useBookingEngine — 2 onSnapshot calls missing error callbacks (pets + settings)**
- `onSnapshot(qPets, ...)` and `onSnapshot(settingsRef, ...)` both use 2-argument form — no error callback on either.
- If Firestore rejects these (offline or permission error), fetching stays true indefinitely, BookAppointment shows ActivityIndicator forever.
- Fix: add `(error) => { console.warn('[useBookingEngine] pets/settings error:', error.message); setFetching(false); }` to both.

**ISSUE: PetHistoryScreen — useNetwork not imported; no offline UI state**
- No import of `useNetwork` / `NetworkContext`. The screen has correct error callback on its records listener (calls setLoading(false)), so no infinite spinner. But there is no offline empty-state differentiation — offline users see the generic loading indicator rather than a "you're offline" message.
- Not a spinner-lock bug, but the UI contract the task specifies (offline empty state) is unmet for this screen.

**ADVISORY: QueueScreen — no offline empty state for the pre-data loading phase**
- When queueData is null (before first snapshot fires), the screen renders `<ActivityIndicator>` unconditionally (line 287). If offline and Firestore serves nothing from cache, this spinner persists. The `lastUpdated` stale note (correct) only renders after queueData exists. The 10s timeout present in ClientDashboard is absent here — low risk because Firestore persistence will normally serve cached data, but worth noting.

**ADVISORY: BookAppointment — offline guard applies to step 4 booking only, not reschedule**
- `submitReschedule` has no isConnected check at its entry point. The button is also not visually disabled during reschedule + offline (the `!isConnected && step === 4 && !rescheduleMode` condition explicitly excludes reschedule). Reschedule will proceed to getDocs + Promise.all and fail with a Firestore error, then show Alert("Error", "Could not reschedule"). This is acceptable (the error is caught), but could be improved with an upfront guard.

**ADVISORY: ClientDashboard offline state shows when loading=true AND !isConnected**
- This is correct by design, but the timeout (10s) will force loading=false even offline, which hides the wifi-off icon after 10 seconds and shows the (empty) dashboard grid. That is the intended behaviour — no issue, just worth documenting.

## What Passes

- All 4 onSnapshot calls in ClientDashboard (profile, active appts, queue-ahead, reminders, vaccine-alerts) have 3-arg error callbacks — PASS
- All 2 onSnapshot calls in ClientAppointments (main appts, queue-ahead) have 3-arg error callbacks — PASS
- PetHistoryScreen records listener has correct 3-arg form with setLoading(false) in error path — PASS
- All 3 onSnapshot calls in QueueScreen (daily_queue, my-ticket, lobby) have 3-arg error callbacks — PASS
- 10s loading timeout in ClientDashboard uses functional setState to avoid suppressing false — PASS
- BookAppointment submitBooking has upfront isConnected guard with Alert.alert — PASS
- Button at step 4 (non-reschedule) is visually disabled + text "OFFLINE — CONNECT TO BOOK" — PASS
- useBookingEngine getDocs calls in fetchDayAppts and fetchEcosystem are try/caught with fallback state — PASS
- No window.alert/confirm/prompt usage anywhere — PASS
- QueueScreen lastUpdated stale note correct: only shown when !isConnected && lastUpdated — PASS
- ClientAppointments offline ListEmptyComponent branch correct — PASS
- COLORS/FONTS tokens used for offline UI elements; #9E9E9E muted grey acceptable — PASS

**Why:** Phases 4-5 are 90% correct. The two shipping issues are the missing error callbacks on the pets/settings listeners in useBookingEngine (could leave BookAppointment frozen) and the missing useNetwork import in PetHistoryScreen (offline state contract unmet for that screen).
