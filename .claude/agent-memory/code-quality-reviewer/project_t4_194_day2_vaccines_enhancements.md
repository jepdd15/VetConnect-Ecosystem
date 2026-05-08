---
name: T4.194 Day 2 — Vaccines Enhancements + Overview Tab
description: VaccinationStatusCard 10 enhancements + OVERVIEW tab; Day 2 of PetHistoryScreen tabbed restructure
type: project
---

All 18 spec items PASS. Two advisory-level token gaps noted (STATUS_STYLES inline hex), scheduleDot borderRadius:4 intentional for circular dot.

**Key patterns:**
- servicesPriceMap lookup uses `vax.name?.toLowerCase()` — correct match against `data.name.toLowerCase()` in fetch
- handleToggleReminder runs Firestore setDoc inside setDisabledVaccines updater — Firestore call is side-effect inside a state updater (smell, but not a bug since `next` is captured correctly before the call and the state still updates atomically)
- STATUS_STYLES uses `#E8F5E9` (should be COLORS.successBg) and `#FFF3E0` (should be COLORS.warningBg) inline
- unknown status uses `#9E9E9E`, `#F5F5F5`, `#616161` — no token equivalents exist in mobileTokens.js
- VaccinationStatusCard has no `onDownloadPassport` prop (correctly removed — passport button lives in PetHistoryScreen VACCINES tab)
- formatDueLabel correctly guards null with `days == null` (uses loose equality, catches undefined too)
- scheduleDot borderRadius:4 intentional for circular dot — neubrutalism exception for dot indicators is an accepted pattern

**Why:** setDoc inside setState updater is a React anti-pattern but works because the closure captures `next` before the Firestore call. If React ever batches this differently it could cause an issue, but it's stable in current RN.
**How to apply:** Flag future setDoc/async calls inside setState updaters in this codebase.
