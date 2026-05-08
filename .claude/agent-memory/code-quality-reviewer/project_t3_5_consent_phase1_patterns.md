---
name: T3.5 Phase 1 — Consent System Review Findings
description: consentConstants.js, useConsentPolicy.js, Settings.jsx Pillar 10 — data-layer issues and design compliance
type: project
---

Module-level `doc()`/`collection()` calls in useConsentPolicy.js are safe because db is already initialized before the module executes (Firebase singleton pattern used consistently across the codebase).

**Key findings:**
- Global versionNumber counter (not per-type) is intentional per design — creates a single monotonic history table. No bug.
- Active Policy Summary only shows one `activeVersion` from `consent_policy` doc. Because DPA and Waiver are independent, only the last published type's metadata is shown (WARN — UX gap, not a data correctness bug).
- `updateDraft` accepts `type` in the fields object and passes it through to Firestore — this is technically allowed (you can reclassify a draft before publishing) but undocumented.
- `summary` is not required by the hook (no validation throw), but the UI does not warn either — empty summary stores `"".trim()` = `""` cleanly.
- `color: '#fff'` in the chip helper (lines 817/819/822) is pre-existing style pattern across the codebase — not a Pillar 10 introduction.
- `#757575` on line 2255 (Delete Confirm dialog Cancel button) is pre-existing, not Pillar 10 code.
- No `prompt()`/`alert()`/`confirm()` anywhere in Pillar 10.
- All listeners properly cleaned up in useEffect return.
- `seedDefaults` correctly re-fetches with `getDocs` before writing to avoid race condition on concurrent admin sessions.

**Why:** For future reviews, note that the single `consent_policy` summary doc will show whichever type was published last — the version history table is the authoritative view for per-type status.
**How to apply:** If Phase 2 adds per-type active tracking, recommend splitting `consent_policy` into `consent_policy/dpa` and `consent_policy/waiver` sub-docs rather than overloading the single doc.
