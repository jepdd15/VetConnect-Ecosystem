---
name: Discovered gaps pending decision rounds — do NOT formalize without user input
description: Weaknesses and gaps identified during Apr 30 session assessments that have NOT been through a decision round. Each needs user discussion before becoming a task. Organized by source assessment. Check this list when the user asks "what should we work on next?" or when a related feature is being planned.
type: project
originSessionId: 6aabc38f-f3fb-4eb1-ab1e-bfea9783fc2e
---
## How to use this file

These are DISCOVERED GAPS, not approved tasks. Before formalizing any of these:
1. Present the gap to the user with context
2. Ask if they want a decision round
3. Run the decision round if yes
4. Then formalize with locked decisions

Do NOT silently formalize these as tasks — the user wants input on scope and approach.

---

## From: Real-World Suitability Assessment

1. **No Cloud Functions deployed (Spark plan)** — secureBookAppointment exists in source but isn't live. All booking validation is client-side. Blaze upgrade needed. *Severity: Security blocker for production.*
2. **No offline resilience** — Firestore persistence not enabled. Spotty PH mobile data = blank screen. T4.74 + T4.101 formalized but not through decision round.
3. **No server-authoritative timestamps** — clinicalPulse uses client Timestamp.now(). T4.99 formalized but needs decision round on implementation approach.
4. **No granular RBAC** — T4.100 formalized but needs decision round on permission matrix design.
5. **No backup or disaster recovery** — no Firestore export, no point-in-time recovery. Needs scoping.
6. **No payment gateway** — no GCash, no bank transfer. T4.20 exists but needs decision round on PH payment landscape.
7. **Single-tenant, single-location** — T4.56 exists but is P3 optional.

## From: Consent System Assessment

8. **No consent expiry** — versions never expire. GDPR-adjacent best practice is annual re-consent. Needs decision: should VetConnect enforce expiry? What interval?
9. **No per-client consent filtering** — admin can't query "all clients without v2 consent." Needed for compliance follow-up. Simple Firestore query but needs UI decision.
10. **No consent-linked push notification** — when admin publishes new policy, no push to clients. They only see the re-consent gate on next login. Needs decision: push on publish?
11. **Signature verification is visual only** — no cryptographic hash. Needs decision: is this worth the complexity for a capstone?
12. **No consent withdrawal without erasure** — RA 10173 §16(c) allows withdrawal without full data deletion. Needs decision: separate withdrawal flow?
13. **Staff consent** — staff are data subjects but never formally consent. Needs decision: is this in scope?
14. **No multi-language consent** — Filipino/Tagalog translation. Needs decision: is this in scope for PH target?

## From: Vaccine Passport Assessment

15. **Owner name hardcoded to "Pet Owner"** — PetHistoryScreen doesn't have owner profile in scope. Quick fix: one-shot getDoc on users collection. ~15 min.
16. **No pet details on passport cover** — species, breed, age, weight, microchip missing. petDoc has all fields. ~30 min.
17. **No clinic contact info** — certification block says "contact the clinic" but no phone/address/email. Read from clinic_settings. ~15 min.
18. **No QR code for verification** — T3.57 formalized as TODO. Needs decision round on verification endpoint design.
19. **No pet photo on passport** — T4.79 formalized as TODO. Depends on file upload infrastructure (T4.121).
20. **Blank signature lines** — no digital vet signature. T3.77 (scanned signature) formalized. Needs decision: auto-sign from vet profile?
21. **No recommended vaccine schedule** — passport shows administered but not what SHOULD be administered. Needs decision: include species-relevant schedule from catalog?

## From: WNL Template Assessment

22. **No weight in WNL template** — template sets temp/HR/RR/CRT/BCS/pain but not objWeight. Quick fix: add weight to the template. ~5 min.
23. **No confirmation before overwriting** — clicking WNL silently replaces existing objectiveExam data. Needs decision: MUI Dialog confirmation? Or undo?
24. **Only one template** — no Vaccination Visit, Post-Op Recheck, Dental Exam, Geriatric Screening templates. T4.11 (SOAP template library) formalized but needs decision round.
25. **No Subjective template** — WNL only fills Objective. "Routine wellness — owner reports no concerns" for S would help. Include in T4.11 scope?
26. **Hardcoded species detection** — line 942: non-dog defaults to cat. Rabbits, birds, hamsters get cat vitals. Needs decision: explicit feline check + generic fallback?
27. **CRT duplicated** — '<2s' in objectiveNotes text AND objCRT vitals field. After T4.115 structured exam, the text duplication is gone — but verify.

## From: Notification Log Assessment

28. **Notification log missing title/body** — T3.138 formalized as P1 TODO. Template resolution happens in Worker, admin app logs null. Quick fix + backfill utility.

## From: Prescriptions Sidebar Assessment

29. **No dosage differentiation on sidebar cards** — if Cephalexin was prescribed as 250mg in 2020 and 500mg in 2026, they're grouped by name as one entry. The Nx badge says "5x" but the dosing changed. The zoom modal shows full history, but the sidebar card itself gives no visual cue that the dose changed. Needs decision: is a "Dosage changed" chip worth the string comparison complexity?
30. **lastInstructions shows only most recent on sidebar** — the sidebar card shows the latest instructions, discarding all historical dosing. The zoom modal preserves full history, but at a glance the vet only sees the current instructions. Needs decision: show "Changed from: [old]" or just accept the zoom modal as the deep-dive?

## Quick wins (< 30 min, no decision round needed):

- #15: Owner name on passport (~15 min)
- #16: Pet details on passport cover (~30 min)
- #17: Clinic contact info on passport (~15 min)
- #22: Weight in WNL template (~5 min)
- #26: Species detection fallback (~10 min)
- #27: Verify CRT duplication resolved (~5 min)

These 6 could be batched into a single "Passport + WNL quick fixes" task without a decision round.
