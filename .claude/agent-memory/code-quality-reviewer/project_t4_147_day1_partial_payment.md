---
name: T4.147 — Partial Payment Follow-Up System (Day 1 + Day 2)
description: Day 1: queueColumns, PatientDashboard, PatientDirectory, POSModal. Day 2: ClientDashboard onSnapshot, BookAppointment getDocs, Worker handleBalanceReminders. Key: cooldown not written when no pushToken, Expo push response not checked, enableBalanceReminders=== false toggle direction inconsistent with other handlers.
type: project
---

T4.147 Day 1 adds partial-payment follow-up surfaces: BALANCE DUE chip in queue PassportCard, Mark as Settled + Snooze UI in PatientDashboard, denormalized ₱ badge in PatientDirectory, and fire-and-forget hasOutstandingBalance write in POSModal.

**Why:** Tracks outstanding balances after partial-payment checkouts so staff can follow up.
**How to apply:** When reviewing T4.147 Day 2+, note these existing patterns and gaps.

## Findings

### WARNING: Stale closure in handleMarkSettled and handleRecordPayment
Both handlers read `ownerSales` from closure, not from a state-updater callback. After the `await updateDoc()` resolves, a concurrent re-render could have updated `ownerSales` state, meaning `ownerSales.map(...)` on the next line operates on old data. The computed `remainingDebt` and `hasOutstandingBalance` write could reflect stale values.
- Fix: use `setOwnerSales(prev => { ... })` updater form and derive `updatedSales` inside the callback, then compute `remainingDebt` from it.

### WARNING: Queue balance badge not status-gated
The BALANCE DUE chip in PassportCard renders for any row where `balanceRemaining > 0`, with no `p.row.status === 'completed'` guard. In practice `balanceRemaining` is only written at checkout, but if a bug writes it earlier the badge will appear on active queue rows.
- Fix: add `&& p.row.status === 'completed'` to the condition at queueColumns.jsx:93.

### WARNING: handleMarkSettled local state does not mirror audit fields
The Firestore write includes `settledBy`, `settledAt`, and `settledExternally`. The local state update (line 878) only mirrors `balanceRemaining: 0` and `settledExternally: true` — omits `settledBy` and `settledAt`. If any UI element later reads these from local state (e.g. a tooltip), it will see undefined.
- Fix: also spread `settledBy` and `settledAt` into the local state object.

### ADVISORY: Record Payment Dialog missing PaperProps borderRadius: 0
The pre-existing Record Payment Dialog at line 2680 has no `PaperProps={{ sx: { borderRadius: 0 } }}`, while the new Mark as Settled Dialog at line 2712 correctly has it. Out of scope for T4.147 but should be fixed in a cleanup pass.

### ADVISORY: handleRecordPayment missing success snack
handleSnoozeReminders shows a success snack on completion. handleRecordPayment does not. Minor UX inconsistency.

### ADVISORY: balanceReminderSnoozedUntil not cleared on settle
handleMarkSettled zeros the balance but does not clear `balanceReminderSnoozedUntil`. If a client pays and the Worker later checks snooze, it won't resend a reminder that's not needed. Harmless given hasOutstandingBalance is also checked, but worth cleaning up.

## Day 2 Findings

### WARNING: handleBalanceReminders — cooldown timestamp not written when user has no push token
When `pushToken` is absent, the outer `if (pushToken)` block is skipped entirely. The email fallback fires below, but `lastBalanceReminderSentAt` is never updated. On the next cron run, the same email-only user will always pass the interval check and be emailed again every day.
- Fix: move the `lastBalanceReminderSentAt` PATCH write (and `sent++`) outside the `if (pushToken)` block, or add a parallel write path for token-less users after the email fires.

### WARNING: handleBalanceReminders — Expo push response not checked
The fetch to `exp.host` is awaited but its `.ok` is never inspected. A 400/5xx from Expo (invalid token, rate limit) silently counts as `sent++`. Compare to `handleAppointmentReminders` which checks `pushRes.ok` and logs + continues on failure.
- Fix: add `if (!pushRes.ok) { failed++; continue; }` after awaiting the Expo fetch, same as the appointment reminder pattern.

### ADVISORY: enableBalanceReminders toggle uses `=== false` (opt-out default), while handleAppointmentReminders uses `!== true` (opt-in default)
`handleBalanceReminders` runs even if the setting is absent (undefined). `handleAppointmentReminders` requires explicit `true`. This is intentional per the comment ("enableBalanceReminders=== false" = only skip if explicitly disabled), but it means balance reminders are ON by default for clinics that haven't set this toggle yet — could surprise them on first deploy.

### ADVISORY: BookAppointment balance banner — inline style, no borderWidth/borderColor border at top
The amber banner uses only `borderBottomWidth: 2`. In the neubrutalist system, borders are usually on all sides or use the offset-shadow component pattern. This is technically fine (it's a strip banner, not a card), but it's the only non-card surface in BookAppointment that omits a full border.

### Items that PASS (Day 2)
- ClientDashboard onSnapshot: returns unsub, uses `auth.currentUser.uid`, client-side `bal > 0` filter correct, error handler present — PASS
- ClientDashboard balance banner: computed from live appointments (not dead userProfile field), pulseAnim applied, `borderRadius` absent (RN default = 0), design tokens (D32F2F red, 3E2723 border, white text) — PASS
- BookAppointment getDocs (not onSnapshot) — correct choice for one-shot; IIFE pattern with try/catch — PASS
- BookAppointment auth guard (`if (!auth.currentUser) return`) — PASS
- BookAppointment rescheduleMode gate — PASS
- BookAppointment banner `backgroundColor: '#FFF3E0'` — this is COLORS.warningSurface equivalent, matches design system amber — PASS
- No `borderRadius` set on the banner View (RN default = 0, compliant) — PASS
- No prompt()/alert()/window.confirm() in any of the 3 files — PASS
- Worker scheduled(): `Promise.allSettled([handleVaccineReminders, handleAppointmentReminders, handleBalanceReminders])` — all 3 handlers present — PASS
- BALANCE_TEMPLATES defined separately from DEFAULT_TEMPLATES (no conflict) but also registered in DEFAULT_TEMPLATES.balance-reminder — PASS (dual registration is intentional for /push endpoint compatibility)
- ownerName grouping limitation is documented in comment — PASS
- snooze check (`snoozedUntil > Date.now()`) and interval check (`lastSent + intervalMs < now`) — logic correct — PASS
- email log fires inside `.then()` after Resend succeeds — PASS

## Items that PASS

- POSModal fire-and-forget write correctly guards walk-in/guest owners, fires after transaction commits, no state mutation after onClose
- PatientDirectory badge reads denormalized flag without extra queries — correct
- Queue chip styling: borderRadius:0, COLORS.warningSurface bg, COLORS.warning text/border, fontWeight:900 — all PASS
- Mark as Settled Dialog: PaperProps borderRadius:0, correct amount display, cancel/confirm wired — PASS
- handleSnoozeReminders: writes Timestamp.fromDate to correct user doc, success snack wired — PASS
- hasOutstandingBalance flag sync in both handleMarkSettled and handleRecordPayment computes from updatedSales (after local update), not stale ownerSales — correct in principle but stale-closure risk exists
- No prompt()/alert()/window.confirm() introduced in new T4.147 code
- COLORS.warning (#E65100) and COLORS.warningSurface (#FFF3E0) are valid design tokens
- Snooze Select uses value="" + renderValue pattern correctly — no spurious 0-day snooze possible
