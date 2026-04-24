---
name: MOB-8 MyPetsScreen — Reviewed Patterns & Known Issues
description: T2.480-T2.483 review findings: plain-object dueDate gap, design token non-compliance, N+1 query pattern, QueueScreen T2.487+T2.490 confirmed done
type: project
---

T2.480-T2.483 implemented in MyPetsScreen.js (~836 lines). QueueScreen T2.487 (vibration) and T2.490 (Running Late) confirmed present.

**Key finding — dueDate plain-object gap (Warning, not Critical):**
`getVaccineStatus` handles string, Firestore Timestamp (`.toDate()`), but falls through to `new Date(d)` for plain `{seconds, nanoseconds}` objects — which produces `Invalid Date`. The `isNaN` guard causes these to be silently skipped rather than crashing, so the badge may show "Current" instead of the correct status when Firestore returns deserialized objects without the Timestamp prototype. Fix: add `d?.seconds ? new Date(d.seconds * 1000) :` branch.

**T2.483 query regression risk — confirmed safe:**
Old query had `where("recordType", "==", "medical")`. New query removes that filter and does `limit(20)` + client-side `.find()` for lastVisit. The `lastVisit` is correctly extracted from the first doc where `recordType === 'medical'` (line 63-67), not blindly from `docs[0]`. No regression.

**Design token non-compliance (Suggestion):**
MyPetsScreen uses `borderRadius: 14` (search container, line 598), `borderRadius: 24` (card, line 659), `borderRadius: 20` (chips, line 621), `borderRadius: 12` (icon buttons, sort button), `borderRadius: 16` (action buttons), `borderRadius: 30` (FAB). The neubrutalism design guide requires `borderRadius: 0` everywhere. This is pervasive pre-existing state, not a MOB-8 regression.

**N+1 query pattern (Warning, pre-existing):**
Each pet triggers a separate `getDocs` inside `onSnapshot`. For a user with 10 pets this is 10 parallel Firestore reads per snapshot event. Acceptable for current scale but worth noting for future batching.

**Import hygiene — clean:**
`Timestamp` is used (archive handler), all other imports are consumed. No dead imports introduced.

**Filter correctness — confirmed:**
`processedPets` useMemo deps array includes `genderFilter` and `healthFilter` (line 237). Sequential filter application is correct. `getHealthStatus` extracted and used in both filter and renderPetCard.

**Sort correctness — confirmed:**
All 4 sort branches handle null/missing fields by falling back to 0 (sorts nulls last). Cycle wraps correctly via modulo. `age` sort uses `toMillis()` but dob fields may be stored as plain Timestamp objects — handled by the `dob?.toMillis ? ... : new Date(dob).getTime()` pattern.

**Navigation — confirmed:**
Route name `'BookAppointment'` exists in App.js (line 118). `prefillPetId` consumed at BookAppointment line 39. No crash risk.

**QueueScreen spot-check confirmed:**
- T2.487 vibration: line 207 `Vibration.vibrate([0, 400, 200, 400])` + turnAlert banner (lines 263-267).
- T2.490 Running Late: `handleRunningLate` at lines 233-245, button UI at lines 366-376 (confirmed-only gate).
