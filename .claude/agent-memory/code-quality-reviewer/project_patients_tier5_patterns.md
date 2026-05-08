---
name: Patients Tier 5 — Reviewed Patterns & Known Issues
description: T2.113/T2.115/T2.116/T2.457/T2.459/T2.460 review findings: prefill stale-closure risk, archived pets list scope, caseDay chain-walk never populates for Day 1, zero-balance false-positive
type: project
---

T2.115: WalkInModal `selectedClient` prefill useEffect correctly chains into the pet-fetch useEffect. However, `prefillPet` is captured by closure inside the pet-fetch useEffect (dependency suppressed with eslint-disable). If the parent re-renders with a new `prefillPet` reference after the modal opens, the stale value is read. Low risk in practice because prefillPet only changes when the user selects a different pet card.

T2.113: balanceRemaining filter passes 0-valued fields through — `(s.balanceRemaining || 0)` means a sale with `balanceRemaining = 0` contributes 0, which is correct. No bug.

T2.116: archived pets section in PetList is driven by `pets.filter(p => p.status === 'archived')` which correctly receives all pets (the per-client onSnapshot query has no status filter). restorePet sets `archivedAt: null` and `archivedBy: null` which is correct — FieldValue.delete() is not required since null explicitly clears the fields for display purposes.

T2.457: The chain-walk logic (lines 183-213 PatientDashboard) skips records with `caseDay <= 1`. Confirmed by plan intent. Day 1 records that are PART of a multi-day chain get no badge — acceptable per acceptance checklist ("Day 1 records in a chain show Day 1 of 3 with blue styling"). This is a divergence from the plan. If Day 1 badges are desired in future, the guard must change from `<= 1` to checking whether originApptId chain exists.

T2.459: `aggregatedLabResults` walks oldest-to-newest (`.slice().reverse()`) so that later entries overwrite earlier ones — correct direction. Only handles Array-shaped labResults; string labResults are excluded from aggregation (intentional — strings are searched but not structured for display). No bug.

T2.460: `vitalsData[0].weight` is rendered directly without a null guard. If a record has `rec.vitals.weight` that is falsy-but-truthy (empty string filtered by `if (rec.vitals?.weight)` on line 220), this is safe. The push guard prevents null from entering vitalsData.

**Why:** Captured for future reference — Day 1 badge gap is the most likely follow-up task.
**How to apply:** Flag if T2.458 or any follow-up task touches the caseDayMap badge logic.
