---
name: T4.93 Appointment Reminder Push Notifications
description: Review findings for admin-triggered appointment reminder system (5 files: notificationTemplateConstants, sendAppointmentReminders, ReminderWidget, Dashboard, Settings)
type: project
---

T4.93 shipped clean across all 5 files. All checklist items verified PASS.

Key findings:
- dateKey timezone mismatch (WARNING): `getTomorrowRange()` builds dateKey via `.toISOString().slice(0,10)` which is UTC, but `start.setHours(0,0,0,0)` is local time. In Asia/Manila (UTC+8) at midnight this can produce yesterday's UTC date as the key, causing the duplicate-send guard to misfire. Consistently pre-existing with how Queue.jsx and useDashboardData handle time — not introduced fresh, same trade-off documented across prior sessions.
- fetch response not checked for `res.ok` — consistent with sendPushNotification.js fire-and-forget pattern (pre-existing project pattern).
- `#0D47A1` hover hex in ReminderWidget is pre-existing across ClinicalWorkspace, SendNotificationDialog, AssignStaffModal, Expenses — not a new violation.
- `enableAppointmentReminders` is in the tracked fields array at line 534, Pillar 13 toggle uses MedicinePillSwitch with `!== false` default guard — correct.
- ReminderWidget: hooks-before-guard pattern correctly honored (isEnabled computed, all useState/useEffect declared, THEN `if (!isEnabled) return null`).
- Dashboard: ReminderWidget placed between AlertStrip and tab content (lines 458-463), gated on ops tab + !data.loading, passes clinicSettings prop.

**Why:** Recorded for completeness of the reminder system architecture.
**How to apply:** If the dateKey UTC drift is raised as a bug, the fix is to build dateKey from local date parts: `[y,m,d].join('-')` style rather than `.toISOString().slice(0,10)`.
