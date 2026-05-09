---
name: T4.200 Day 4 — dueDate Normalization + Worker Preference Filter + Mobile Toggle + Firestore Rules
description: Review findings for T4.200 Day 4: SPEC FAILURE root-vs-subcollection path (all 3 locations fixed); Switch onValueChange present; 20/22 checklist items PASS before fix, 22/22 after
type: project
---

## CRITICAL Finding: vaccine_preferences Subcollection vs ROOT (FIXED)

The execute prompt specified `vaccine_preferences` as a ROOT collection (`vaccine_preferences/{petId}`).
The engineer instead used a user subcollection (`users/{ownerId}/vaccine_preferences/{petId}`) in all three locations.

**Why it matters**: The Cloudflare Worker reads Firestore via unauthenticated REST API with an API key. Subcollection rules under `users/{userId}` reference `isOwner(userId)` — which requires `request.auth != null`. An unauthenticated request always fails this check, meaning the Worker would never successfully read preferences (the catch block would silently send all reminders anyway, but the preference system would be functionally dead).

**Locations fixed:**

1. **worker.js line 458** — URL changed from `documents/users/${ownerId}/vaccine_preferences/${petId}` to `documents/vaccine_preferences/${petId}`. Guard changed from `if (ownerId && petId)` to `if (petId)`.

2. **PetHistoryScreen.js line 1241** — `doc(db, 'users', uid, 'vaccine_preferences', petId)` → `doc(db, 'vaccine_preferences', petId)`. Also removed the `uid` guard from the useEffect (uid no longer needed for the read path).

3. **PetHistoryScreen.js line 1825** — `doc(db, 'users', uid, 'vaccine_preferences', petId)` → `doc(db, 'vaccine_preferences', petId)`. Removed `uid &&` guard from the write-path conditional.

4. **firestore.rules** — Removed `match /vaccine_preferences/{petId}` block from inside `match /users/{userId}`. Added it as a ROOT-level collection rule with `allow read: if true` and `allow write: if isAuth()`. Comment explains the Worker constraint explicitly.

## Pattern to Watch

When the Worker must read a collection without Auth JWT, that collection MUST be at ROOT level with `allow read: if true`. Never nest it under a user doc, even with the intention of restricting writes to the owner — the Worker's read will silently fall to the catch block and degrade gracefully (non-blocking), hiding the bug.

## Checklist Results (22 items)

Items 7, 13, 17, 18 all FAILed before fix; all PASS after fix.

- Items 1-3: CW dueDate → Timestamp.fromDate with T00:00:00 guard — PASS (lines 2389-2409)
- Items 4-5: vaccineHelpers.js parseDueDate — N/A; vaccineHelpers uses inline dual-read (pre-existing, unchanged)
- Item 6: vaccineReminderQueue.js parseDueDate helper — PASS (lines 99-103)
- Item 7: Worker ROOT path — FAIL before fix, PASS after
- Item 8: Worker filters by catalogId — PASS
- Item 9: Worker catch → empty disabledVaccines (non-blocking) — PASS
- Items 10-12: Worker dose placeholders + cleanup regex — PASS
- Item 13: PetHistoryScreen read via ROOT path — FAIL before fix, PASS after
- Items 14-15: Toggle writes array (not arrayUnion/arrayRemove), uses vax.id = catalogId key — PASS (vax.id and catalogId both equal the catalog key e.g. 'dhpp')
- Item 16: merge:true on first write — PASS
- Items 17-18: firestore.rules ROOT level — FAIL before fix, PASS after
- Item 19: catalogId present on queue entries (Day 3 scope) — PASS
- Item 20: MASTER_TASKLIST T4.200 DONE — PASS
- Item 21: MANUAL DEPLOY note in worker.js — PASS (lines 374, 453)
- Item 22: No alert()/confirm()/prompt() in Day 4 changed files — PASS (pre-existing alert() in CW is out of scope)

## Additional Notes

- Switch onValueChange at VaccinationStatusCard.js line 260 is correctly wired — `onValueChange={(val) => onToggleReminder(vax.id, val)}`. Earlier grep was misleading (the line appeared after the visible output truncation).
- vax.id equals catalogId key (e.g. 'rabies', 'dhpp') — confirmed by tracing buildVaccinationStatus output. The disabledVaccines set written by mobile toggle and the catalogId filter in the Worker use the same key space.
- parseDueDate handles all 3 formats: Firestore Timestamp (.toDate), seconds-object (.seconds * 1000), ISO string (new Date(str)).
- Stale comment at PetHistoryScreen.js line 1131 also updated to reflect ROOT path.
