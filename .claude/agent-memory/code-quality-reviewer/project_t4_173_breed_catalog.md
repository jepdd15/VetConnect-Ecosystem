---
name: T4.173 Breed Catalog — Review Findings
description: T4.173: 95-breed constant + 5 wired surfaces. Autocomplete dropdown Paper radius gap, species-change breed-not-reset on 3 surfaces.
type: project
---

T4.173 shipped breedConstants.js (95 breeds, PH sentinels, alphabetical) and wired it into WalkInModal, AddPetModal, EditPetModal (admin Autocomplete freeSolo) and AddPetScreen/EditPetScreen (mobile Modal picker).

Key findings:
- WARN: Species change in WalkInModal does NOT reset breed field on the pet entry — stale Canine breed can persist on Feline patient.
- WARN: Same species-change/no-breed-reset gap in AddPetModal (parent manages newPetData state, species Select has no breed reset).
- SUGGESTION: Admin Autocomplete dropdown popup Paper has no borderRadius:0 override (componentsProps/slotProps.paper missing on all 3 surfaces) — floating dropdown inherits MUI default 4px radius, violating design system.
- All other checks PASS: identical admin/mobile catalogs, correct counts (62 Canine + 33 Feline), triple-bind pattern correct, filteredBreeds uses || [], no duplicate import, no prompt/alert/confirm in admin, label renamed to "REASON FOR VISIT".
