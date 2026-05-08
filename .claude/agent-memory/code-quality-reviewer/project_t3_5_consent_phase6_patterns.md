---
name: T3.5 Phase 6 — Consent Withdrawal + Erasure Integration Review Findings
description: UserProfileScreen.js withdrawal flow, ClientHeader.jsx consent banner, useErasureEngine.js Phase G — findings from Phase 6 review
type: project
---

Phase 6 of T3.5 (consent withdrawal + erasure integration) reviewed across 3 files.

**Key issues found:**

- UserProfileScreen.js: Multiple pre-existing hardcoded hex values (#FAFAFA, #EFEBE9, #FFEBEE, #F5F5F5, #E0E0E0, #eee, #EEEEEE, #E3F2FD, #333333) — NONE introduced by Phase 6 code. Phase 6's own styles (withdrawConsentLink / withdrawConsentText) are fully token-compliant.
- UserProfileScreen.js: The `addDoc` import is unused — `executeWithdrawal` uses `batch.set(doc(consentRecordsRef))` not `addDoc`. Low-risk since it's tree-shaken in production, but it's dead import.
- UserProfileScreen.js: `grantedAt` field name in the withdrawal record should arguably be `withdrawnAt` for semantic clarity; `grantedAt: Timestamp.now()` on a withdrawal record is slightly confusing but matches the consent_records schema from earlier phases (action distinguishes meaning).
- useErasureEngine.js: Phase G queries `users/{userId}/consent_records` AFTER Phase E sets accountStatus:"erased" on the user doc — but the subcollection is not deleted by the erasure batch, so the query is still valid. The write target is also valid (addDoc to the subcollection still works post-erasure since Firestore doesn't cascade-delete subcollections on parent doc update).
- useErasureEngine.js: Phase G failure silently swallowed — the `catch` block at the bottom of executeErasure catches Phase G failures and re-throws them, which causes executeErasure to surface an error even though the actual erasure completed. The Phase G write is supposed to be fire-and-forget (spec says "failure does not roll back erasure") — but it's inside the shared try/catch so a Phase G addDoc error will surface as an erasure failure to the admin.
- ClientHeader.jsx: `color: '#fff'` on both "Process Erasure" buttons (line 184, 248) — hardcoded white instead of COLORS.cardBg or a named token. Minor but technically non-compliant.
- ClientHeader.jsx: banner body text says "Process data erasure within 30 days" but the spec said "Process erasure within 30 days" — minor wording inconsistency, not a defect.
- ClientHeader.jsx: design, logic, and token usage otherwise strong. Priority ordering (consent withdrawal banner suppresses generic deletion button) is correctly implemented.

**What to apply in future reviews:**
- When Phase G (or any post-commit cleanup write) is inside the shared try/catch, flag it as a potential false-positive error surface.
- addDoc import in UserProfileScreen.js is a dead import introduced by Phase 6.
