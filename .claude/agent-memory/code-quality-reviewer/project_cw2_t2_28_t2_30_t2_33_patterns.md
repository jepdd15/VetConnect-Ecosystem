---
name: CW2 T2.28-expanded + T2.30 + T2.33 — Follow-Up Chain, Staff Attribution, dischargePolicy
description: Review findings for ClinicalWorkspace follow-up UI wiring, per-service staff attribution, and discharge policy enforcement
type: project
---

T2.28-expanded (follow-up UI + 5 bugs):
- followUpJSX correctly gated on !lockedServices.has('medical') — locked records show no follow-up UI
- nextVisit date picker has `min` attribute set to today — past-date entry prevented client-side
- `new Date(soapData.nextVisit)` construction from a date-only string (YYYY-MM-DD) is timezone-unsafe: parsed in local time on most browsers but may shift by ±1 day in UTC-ahead or UTC-behind environments. The Manila (UTC+8) server never sees this, but if a vet runs the admin app through a VPN or testing env set to UTC, the followUpDate could be one day earlier than selected. LOW risk for production PH deployment.
- INCEPTION pulse uses makePulseEventId('inception') — correct, consistent with other pulse events
- followUpNode is passed to main SoapGrid but NOT to God-View SoapGrid — correct per plan (God-View omits Plan extras)
- draft save (handleSaveDraft) already persists nextVisit/recheckIn/patientStatus — no gap there
- The dischargeRequired check at line 921 is a dead branch: it fires only when `!soapData.plan || soapData.plan.trim().length === 0`, but the general guard at line 907 already blocks sign-off when `!soapData.plan`. The dischargeRequired block can only ever execute when `soapData.plan` is a non-empty string, meaning the `!soapData.plan` arm inside that second condition is unreachable. The `.trim().length === 0` arm (whitespace-only Plan) IS reachable and saves the check, so the feature works in practice — but the logic is misleadingly redundant.

T2.30 (staff attribution):
- serviceAttribution state initialized correctly from patient.services inside fetchPatientContext
- Dropdown correctly placed inside the rx.isBase guard in the Treatment Plan sidebar
- updatedServices merge correctly applies override → preserves all other service fields via spread
- serviceAttribution written to medical_records — correct
- vetsList guards with `(vetsList || [])` — empty list shows no dropdown options, not a crash
- No "empty" placeholder MenuItem added to the Performed By dropdown: if vetsList is empty or if triage didn't assign a staff, the select renders with value='' and no options, which is a blank but non-crashing state. A placeholder "Unassigned" option would improve UX.

T2.33 (dischargePolicy):
- ServiceFormModal initializes dischargePolicy from item?.dischargePolicy || 'optional' — backward compat correct
- useServices.js saveService payload includes `dischargePolicy: formData.dischargePolicy || 'optional'` — persists correctly
- dischargePolicy NOT added to FIELD_LABELS in useServices.js diffFields — audit log won't show changes to this field. Minor gap.
- Sign-off enforcement looks up svcDef by id (item.id), where item is a cart entry. Cart base services come from patient.services[], which carry the service id from when the appointment was booked. If a service was deleted from the catalog after booking (soft-archived but still in the appointment), `servicesList.find(s => s.id === item.id)` returns undefined and svcDef is undefined — `svcDef?.dischargePolicy === 'required'` safely returns false (no block). This is the correct safe-default behavior.
