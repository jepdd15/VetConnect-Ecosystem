---
name: Session 2026-05-05/06 — Advisory continued (inventory, queuing, my bookings, dashboard)
description: Inventory reserved system assessment + 2 tasks (T4.169-T4.170). scrubDatabase + maxCages removed. Inventory KPI clickable filters. WalkInModal UI rewrite (T4.171 DONE). Multi-pet removal scoped (T4.172). Breed catalog (T4.173). My Bookings hardening (T4.174). SuperCard redesign (T4.175). My Bookings neubrutalism (T4.176). Card enrichment (T4.177). QueueScreen redesign with D/M/c model (T4.178). Lobby Monitor multi-lane (T4.179). Data parity (T4.180). CW patient editing (T4.181). Dashboard redesign 3-tab (T4.182). Registration fix (App.js race + Firestore rules). Outstanding balance query fix (ownerId). ~20 tasks formalized, 4 committed.
type: project
originSessionId: e1f4283a-5895-4f8c-bc88-392976574f04
---
## Key decisions locked this session

- Inventory: reserved is operational (not just informational), 5 gaps identified, 2 tasks formalized
- scrubDatabase removed (dead code), maxCages removed (incomplete enforcement, physical reality)
- Inventory KPI clickable filters replace toggle switches, Archived as 6th KPI
- WalkInModal: 3-section layout, multi-pet UI removed, data parity fixes (ownerPhone, statusHistory, timestamps)
- Multi-pet booking/visit support: decided to remove entirely (T4.172, 17 files, 250 refs)
- Breed catalog: 95 breeds (62 dog + 33 cat), shared constants, freeSolo Autocomplete
- My Bookings: bottom sheet filters (not horizontal chips), search bar, date-first cards
- SuperCard: 5 decisions locked (B collapsed content, A financial visibility, skip vaccine nudge, Call only, A encounter items)
- SuperCard: case day swipe added
- QueueScreen: D/M/c model — per-department "Now Serving" + multi-dept breakdown + two-row breadcrumb
- Monitor: multi-lane concurrent display matching D/M/c model
- Dashboard: 3 tabs (TODAY/ANALYTICS/FINANCIAL), drag-drop removed, quick nav removed, lab+vaccine+diagnosis stats added
- Data parity: B (skip owner dob/gender on registration), A (admin DOB 3-mode), A (admin allergy tag array)
- CW patient editing: all fields editable (name, species, breed, DOB, sex, neutered, allergies, microchip)
- Liability waiver: keep one-time (not per-booking)
- Registration fix: App.js onAuthStateChanged race condition + Firestore rules consent_policy public read
- Outstanding balance: query by ownerId not ownerName

## Commits this session

- `4e58953` — Inventory KPI clickable filters + scrubDatabase removal
- `9dd0097` — maxCages removal
- `27cba53` — WalkInModal UI rewrite (T4.171)
- `eeb5755` — Registration fix (App.js race + Firestore rules)
- `bbb01ea` — Outstanding balance query fix (ownerId)
