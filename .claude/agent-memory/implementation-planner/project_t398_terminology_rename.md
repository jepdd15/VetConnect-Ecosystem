---
name: T3.98 Terminology Rename Plan
description: 11-file plan for rxCart/prescriptions/prescribedItems rename with dual-read backward compat, zero logic changes
type: project
---

T3.98 terminology rename plan produced and saved as PHASE3_TERMINOLOGY_RENAME_PLAN.md.

Covers 11 files, ~105 occurrences across 3 categories (Firestore writes, Firestore reads with dual-read fallback, internal variable renames). Rename mapping: rxCart->treatmentCart, prescriptions->dispensedProducts, prescribedItems->encounterItems. No migration script — dual-read fallback pattern at every read site.

**Why:** The old names (rxCart, prescriptions, prescribedItems) conflate prescriptions with general encounter items. The cart holds services AND products, not just prescriptions. The rename aligns terminology with actual semantics.

**How to apply:** When implementing T3.98, follow the 11-step execution order in the plan. Each step is independently committable. Verify with the grep checklist at the end.
