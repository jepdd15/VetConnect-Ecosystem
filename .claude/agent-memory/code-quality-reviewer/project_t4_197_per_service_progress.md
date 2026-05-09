---
name: T4.197 Per-Service Progress Visibility — Review Findings
description: 6-phase per-service status feature across SuperCard, AppointmentCardContent, VisitTimeline, QueueScreen, Monitor, ClientDashboard
type: project
---

Spec item 7 FAIL: "confined warm overnight" message is present in SuperCard's getWhatsNext() but absent from AppointmentCardContent's confined case in the contextSection (line 290-293). The contextSection message reads "Your pet is staying overnight at the clinic. Call us anytime for updates." — matches intent but not the exact warm overnight framing, and critically there is no spec-mandated distinction between the SuperCard version and AppointmentCardContent version confirmed.

PRE_ARRIVAL_STATUSES and IN_CLINIC_STATUSES are defined as `const` Sets inside the ClientDashboard component body (lines 454-455), causing them to be recreated every render and referenced inside useMemo deps via closure capture. Low-risk (Set identity not used in deps), but should be hoisted to module scope.

4 inline hex clusters in SuperCard: #FFEBEE (emergencyBadge bg, allergyBadge bg), #FFF8E1 (notesEcho bg), #FFF3E0 (caseHeaderBar bg) — all have equivalent tokens (COLORS.dangerBg, COLORS.cream, COLORS.warningBg). Pre-existing from earlier sessions, not introduced by T4.197.

Extensive inline hex in ClientDashboard renderNotification(): status-specific bgColor/borderColor values hardcoded — pre-existing pattern, not introduced by T4.197.

QueueScreen serviceStrip (line 499) uses `s.serviceName || s.name` — inconsistent with line 486 which uses `s.serviceName || s.serviceType`. The strip falls back to 'Service' string rather than serviceType. Low-risk: serviceName is the canonical field, serviceType is a flat field on the appointment itself, not on service items.

All other spec items (1-6, 6b, 8-23) PASS.

**Why:** Design traceability for future session reviewers.
**How to apply:** If the confined overnight message wording becomes a spec point in a future task, the AppointmentCardContent version at line 290 is the relevant site.
