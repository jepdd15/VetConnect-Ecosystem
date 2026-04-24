---
name: MOB-5 ChatbotScreen — Reviewed Patterns & Known Issues
description: T2.355-T2.362 review findings: followup intent never existed in original, getDoc still needed for clinic_settings, clinicName unused destructure
type: project
---

`followup` and `follow_up` intents are NOT and NEVER WERE in the original ChatbotScreen switch. The plan review item "verify followup intent exists" is based on a misread; original intents were: hours, location, services, booking, emergency, reset. All present after rewrite.

`getDoc` import is correctly retained — it is still used for the `clinic_settings/general` fetch inside `fetchEcosystem`.

`clinicName` is available from `useClinicContact()` but not destructured. The plan's import summary listed it; implementation correctly omits it since nothing uses it — not a bug.

`followUpDeptOptions ?? followUpOptions` pattern: the services case populates `followUpDeptOptions` for multi-dept; all other cases leave it `null`, falling through to `followUpOptions`. dept_ sub-intent sets `followUpOptions` directly. Pattern is correct.

Border-radius non-compliance (18, 20, 10, 22, 16) on chat bubbles/avatars/action buttons is pre-existing, not part of MOB-5 scope. `errorBanner` (new in T2.360) correctly uses `borderRadius: 0`.

`isArchived` field name matches admin-side convention (confirmed in useBookingEngine and InventoryManager).

**Why:** Noted to avoid re-raising the `followup` intent as missing in future reviews.
**How to apply:** Do not flag missing `followup` case as a regression — it never existed.
