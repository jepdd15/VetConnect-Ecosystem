---
name: T4.78 Reschedule — Reviewed Patterns & Known Issues
description: T4.78 in-app rescheduling review: group update gap when rescheduleGroup.length===1, JIT capacity check uses rescheduleAppointment.services (single-pet) not group services, console.log in initializeUser pre-existing, #E3F2FD rescheduleBtn pre-existing
type: project
---

T4.78 mobile reschedule system (BookAppointment + ClientAppointments) is substantially correct. Two issues found in the new code:

1. **Group-but-length-1 gap (WARN)**: When `rescheduleGroup` is set but has exactly one member, `submitReschedule` falls to the `else` branch and uses `rescheduleAppointmentId` — consistent behavior but documents a subtle edge case in the branch predicate (`length > 1`).

2. **JIT capacity check uses single-pet services (WARN)**: `submitReschedule` iterates `rescheduleAppointment.services` (the first pet's services, from `rescheduleGroup[0]`) for capacity validation. For group reschedules where different pets have different services, the other pets' service departments are never validated. In practice multi-pet group bookings typically share the same services, but this is an unacknowledged assumption.

3. **#E3F2FD in rescheduleBtn** — pre-existing from T3.78 session, not newly introduced.

4. **console.log in initializeUser (line 412)** — pre-existing, not introduced by this PR.

5. All checklist items PASS: route params extracted correctly, useEffect seed + jump guards correct, renderRescheduleConfirm strikethrough + green new date present, red asterisk + helper text + disabled button all wired, updatePayload complete, Promise.all for group, handleBack step routing correct, wizard header labels correct, progress bar 50%/100% correct, no clinicalPulse writes, no alert()/confirm()/prompt().

**Why:** Document for future reschedule hardening that the JIT check only reads the first pet's services for group reschedules.
**How to apply:** If services diverge per pet in a group booking, the JIT check should iterate all unique departments across the whole group.
