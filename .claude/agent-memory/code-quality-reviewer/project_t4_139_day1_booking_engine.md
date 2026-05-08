---
name: T4.139 Day 1+2 — Booking Engine Intelligence Upgrade
description: petServiceMap migration + parallel-model slot generator + JIT capacity check — review findings across Day 1 and Day 2
type: project
---

## Day 1 Findings (original)

Per-pet service map refactor passes all 13 acceptance checks with 3 findings:

1. ISSUE (low-severity): `petMappedServices[0]` in the transaction forEach is unguarded — if a pet loses services between step 2 and step 4 (race condition or memory pressure) it crashes with `TypeError: Cannot read properties of undefined`. `allPetsHaveServices` only guards the wizard navigation, not the actual Firestore write. Add an early-continue guard inside the forEach.

2. ISSUE (low-severity): `Date.now()` called inside `forEach` inside `runTransaction` produces different timestamps for each pet's QR code and pulse eventId in the same booking. For multi-pet groups the QR format `VC-{uid5}-{ts}-{index}` is supposed to be unique by index, so the varying timestamp is benign for QR uniqueness but the pulse eventId collision risk is real if two Date.now() calls return the same ms. Cap `Date.now()` once before the forEach.

3. ADVISORY: `totalBundleDuration` in the Scheduling Insight box (Step 3) sums ALL services across ALL pets (flat union via `allSelectedServices`), while the actual slot engine staggering uses the MAX single-pet duration. For multi-pet bookings with different service sets, the displayed "X minute visit" will overstate the actual block. Low UX impact but could confuse users.

## Day 2 Findings

13-point checklist result: 12 PASS, 1 ISSUE (Point 9), plus 2 additional findings.

**PASS items (12/13):**
- Point 1: virtualBookings resets per-slot (declared inside slot loop, outside pet loop) — PASS
- Point 2: petServiceDetails shape correct (parallelDuration, sequentialDuration, deptGroups, depts) — PASS
- Point 3: parallelDuration = max(deptGroups values), not sum — PASS
- Point 4: same-dept services summed with += in deptGroups — PASS
- Point 5: maxPetParallelDuration = Math.max across all pets — PASS
- Point 6: per-dept capacity check uses independent time windows — PASS
- Point 7: virtual bookings recorded per-dept all at petStartTime — PASS
- Point 8: OVERFLOW/LUNCH checks use parallelDuration (petEndTime = petStartTime + parallelDuration) — PASS
- Point 10: BookAppointment stagger = index * maxParallelDuration — matches slot generator — PASS
- Point 11: serviceDuration written to Firestore = per-pet parallelDuration — PASS
- Point 12: all dept names .toLowerCase() consistent across all sites — PASS
- Point 13: no hooks after conditional returns — PASS

**ISSUE (Point 9): JIT pre-flight is more restrictive than the slot generator for multi-pet same-dept**
- submitBooking JIT (lines 746-796) collapses pets into jitDeptGroups with Math.max across pets, then adds `virtualOverlaps = petsNeedingDept - 1` unconditionally. But the slot generator staggers pets, so two pets needing the same dept may NOT overlap if stagger >= dept duration. JIT always assumes overlap → can fire a false-positive "Slot Taken" alert for a slot the slot grid showed AVAILABLE.
- Risk level: UX degradation (false rejections), not data corruption. Conservative is safer than permissive.

**ISSUE: submitReschedule JIT uses old sequential serviceOffset model**
- Lines 570-608: loops services with `serviceOffset += (dur + buff)`, testing each dept at T+serviceOffset. The parallel model (all depts at petStartTime) was introduced in submitBooking but NOT backported to submitReschedule. For multi-service reschedules, JIT checks Vaccination at T+30 but actual appointment places it at T+0 — false negative allows double-booking on reschedule.
- Fix: replace serviceOffset loop in submitReschedule with the same jitDeptGroups + virtualOverlaps pattern from submitBooking (lines 746-796).

**ADVISORY: petServiceBuffer may double-count buffer already embedded in petServiceDuration**
- Lines 829-835: petServiceBuffer = sum of bufferTime for services in the longestDept. petServiceDuration (line 825) already includes (dur + buff) per service via petDeptGroups accumulation. Consumers that compute end = scheduledDate + (serviceDuration + serviceBuffer) * 60000 (pattern at bookedRangesByDept line 279 and JIT line 774) will overstate the block window. Verify whether serviceDuration is duration-only or duration+buffer.

**Why:** The parallel-model upgrade in Day 2 introduced a model divergence between the new submitBooking JIT and the old submitReschedule JIT. The petServiceBuffer accounting ambiguity was pre-existing but becomes more impactful now that serviceDuration encodes parallelDuration which already includes buffers.
**How to apply:** In any future booking/reschedule change, always verify the JIT check in submitReschedule is kept in sync with the slot generator's model. It is a known lag-behind point.

## Day 3 Findings

Day 3 resolves the Day 2 Point 9 ISSUE (flat virtualOverlaps) and the submitReschedule sequential-model ISSUE. 7-point checklist result: all PASS with 1 ADVISORY.

**Fixed from Day 2:**
- submitBooking JIT now uses time-based virtualOverlaps (Option A): petStart/petEnd computed from originalIdx * maxParallelDuration, overlap tested against svcStart/svcEnd. The flat `petsNeedingDept - 1` conservatism is gone.
- submitReschedule JIT now uses parallel dept model (reschDeptGroups) — no longer uses sequential serviceOffset loop.

**PASS items:**
- 0-pet guard: `Object.keys(petServiceMap).length === 0 || selectedPets.length === 0` early exit — PASS
- 0-service guard: `anyPetHasServices` check prevents slot computation — PASS
- allPetsHaveServices: blocks Step 2 → 3 advance, correct per-pet predicate — PASS
- originalIdx = `selectedPets.findIndex` gives position in full array, not filtered subset — PASS (consistent with stagger model)
- Single-pet flow: `petsNeedingDept` has 1 entry, petIdx=0 skipped → virtualOverlaps=0 → unchanged behavior — PASS
- Scenario 7 trace: 2 dogs same dept capacity=1; pet1 petStart=base+30; `base+30 < base+30` → false → no overlap → AVAILABLE — PASS
- Scenario 14 trace: 3 pets 1 surgeon; pets 2 and 3 start at base+60 and base+120 respectively; neither overlaps [base, base+60] → all AVAILABLE until external bookings fill surgeon — PASS
- 14-scenario block comment: scenarios 2, 3, 7, 8, 14 correctly documented against code behavior — PASS

**ADVISORY: petIdx===0 skip is anchored to petsNeedingDept order, not selectedPets order**
- `petsNeedingDept.forEach((pet, petIdx) => { if (petIdx === 0) return; ... })` treats the first pet NEEDING this dept as the reference window `[svcStart=baseDateTime, svcEnd=baseDateTime+duration]`. If that pet's `originalIdx > 0` in selectedPets (e.g., only pet B at idx=1 needs Surgery), the code skips it (petIdx=0) and checks no virtual overlaps, but `svcStart=baseDateTime` represents pet A's time window — NOT pet B's actual window `[base+maxPar, base+maxPar+dur]`. This is a pre-existing Day 2 asymmetry, not introduced in Day 3. Impact: for single-pet-per-dept scenarios where that pet is not idx=0, JIT checks the wrong time window. The asymmetry only bites when a dept is needed by exactly one pet AND that pet is not the first in selectedPets. In practice most users pick the same services for all pets, and the slot generator would show it AVAILABLE at baseDateTime regardless, so false positives are rare.
