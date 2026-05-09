---
name: T4.199 Day 1 — My Stats 5-Tab Redesign (Tab Bar + OVERVIEW + PETS)
description: Review findings for MyStatsScreen.js 5-tab restructure and useMyStats conditionsOverview + calendarDots additions
type: project
---

All 22 spec items PASS.

Issues found:

WARNING — diagnosisHistory gated on `activeTab !== 'overview'` but the section is never rendered anywhere in the screen render tree (neither in overview tab nor elsewhere). The gate returns dead data. Harmless but misleading; the useMemo waste on 'overview' tab is small.

WARNING — conditionsOverview useEffect deps on `userPets` array reference. Since `userPets` is destructured from `route.params` on every render, each render re-creates the array reference, causing the effect to fire on every parent re-render that passes a new route.params object. In practice route.params is stable once the screen mounts, but this is fragile.

WARNING — `TAB_CONFIG` array defined inside the component body (not hoisted to module scope). Recreated on every render. Low-risk since it's only used in the tab bar render, but creates a new array reference every render. Same pattern flagged in T4.194 Day 1 PetHistoryScreen.

ADVISORY — `upcomingAppointments` and `petCards` useMemos are not gated on activeTab. `petCards` is the most expensive memo (full pet iteration + vitals + meds + diagnoses per pet). They are used on 3 different tabs (overview, pets, health), so gating is non-trivial — acceptable as-is.

ADVISORY — 'transparent' string used in `tabItem.borderBottomColor` style. This is a named CSS color React Native accepts, not a design token. Minor — it's an invisible state so no visual impact, but ideally replaced with `COLORS.transparent` or `'rgba(0,0,0,0)'`.

ADVISORY — `PetHealthCard` component (~290 lines) is defined in the file but never instantiated in the render tree. It is dead code from the pre-tab-redesign architecture. Should be removed in a follow-up to reduce bundle size and confusion.

Design system compliance: zero inline hex colors in new sections (tab bar, conditions overview, calendar, PetCardSlim). `borderRadius: 2` on calendarDot is documented approved exception.

**Why:** Recorded for continuity across sessions.
**How to apply:** Flag diagnosisHistory gate inversion if refactoring that memo; flag PetHealthCard dead code for cleanup task.
