---
name: T4.120 Day 3 — Lab Results Consumer Updates
description: Review findings for 5 files updating downstream consumers to display structured lab fields (unit, referenceRange, resultType)
type: project
---

All 5 consumer files reviewed. Summary of findings:

**PASS items (all critical checks):**
- Amendment 1 chip derivation is identical and correct in both EMRDrawer and PetHistoryScreen: normal→NEGATIVE, critical→CRITICAL, abnormal→POSITIVE; no "ABNORMAL" label shown for positive-negative tests
- Dual-read fallback present everywhere: `lab.unit || ''`, `lab.referenceRange || null` guards consistent across all 5 files
- XSS in printVisitSummary: resultWithUnit assembled from `esc(lr.result)` + `esc(lr.unit)`, refDisplay goes through `esc()` at the call site — all dynamic values escaped
- borderRadius 0 confirmed on labCard, labRow, labStatusPill in PetHistoryScreen; labRefRange style exists with fontSize 10 + muted color + marginTop 1
- PatientDashboard search: `lr.unit` added to the concatenation at the array branch
- No alert()/confirm()/window.alert in any of the 5 files
- resolveRefRangeForPrint handles species-keyed objects, legacy arrays, and null; string-indexing on array is harmless for legacy shape

**WARNING:**
- buildPetOwnerPrompt (mobile AI prompt) does NOT resolve reference range by species despite `pet` being available as a parameter. It shows both canine+feline ranges. buildPetHistoryPrompt (admin AI) correctly uses `speciesKey` from `pet?.species`. Inconsistency — sub-optimal but not a crash or correctness error; AI receives extra context rather than wrong context.

**Architecture notes:**
- EMRDrawer receives `petSpecies` prop but intentionally does NOT pass it to RecordCard — documented comment says "species not available" which is accurate at the RecordCard scope since the prop is not forwarded. Design decision: show both ranges in EMRDrawer, show species-resolved in PetHistoryScreen (where petSpecies IS in component scope). This is consistent with the review brief.
- PetHistoryScreen `resolved = range[speciesKey] || range` fallback is correct: for species-keyed object, picks the matching sub-array; for legacy array, `range[speciesKey]` is undefined so falls back to the full array, which then passes the `Array.isArray` check.
- Remaining borderRadius non-zero values in PetHistoryScreen (discharge, vaccine, amendment sections — lines 1728, 1751, 1955, 1983, 2026, 2107, 2132, 2154) are pre-existing out-of-scope issues, not introduced by Day 3.

**Why:** buildPetOwnerPrompt species inconsistency is worth tracking for a follow-up fix — the AI will give slightly less precise context for species-keyed ranges on mobile than on admin.
**How to apply:** If a follow-up task touches buildPetOwnerPrompt, add `const speciesKey = (pet?.species || '').toLowerCase().includes('cat') ? 'feline' : 'canine';` and prefer `range[speciesKey]` before falling back to both.
