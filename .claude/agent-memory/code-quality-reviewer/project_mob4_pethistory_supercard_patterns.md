---
name: MOB-4 PetHistoryScreen + SuperCard + useClinicContact — Review Findings
description: T2.402-T2.416 review: XSS gap in discharge nextVisit date, residual getDoc in handleBookFollowUp, singleton listener leak, inline coerceVital pattern
type: project
---

T2.404 generatePDF XSS is solid — esc() applied everywhere in the template. All 3 hidden SOAP fields are absent from the PDF.

T2.403 grooming branch correctly reads item.treatment; clinical fallback shows neutral message.

T2.416 useClinicContact singleton never unsubscribes the Firestore listener when the subs Set drains to zero — it leaks if the app ever reaches a state where no component uses the hook. Low severity in a mobile client app but worth noting.

T2.414 queue-ahead useEffect runs every time the `appointments` array reference changes (onSnapshot emits new array each time), so it tears down and re-subscribes the queue listener on every appointment snapshot. Should depend on the active appointment's id, not the whole array.

Residual getDoc at ClientAppointments L330 — inside handleBookFollowUp() which needs closedDates for the date cascade. This is intentional (different data need from what useClinicContact exposes), not a missed cleanup. It is a one-shot fetch of the full settings doc; not a duplicate of the clinicPhone fetch.

Discharge card nextVisit date parse (L319 in renderRecord) uses `.seconds * 1000` pattern — same unsafe pattern that T2.405 fixed in the reminder banner, but inside the IIFE that renders the dischargeCard. safeDate() was NOT applied here. This is a residual crash risk.

T2.402 dead styles (subjectiveBox/Label/Text) were fully removed — grep confirms zero matches.

**Why:** These patterns affect crash safety (nextVisit parse) and resource hygiene (listener leak, queue listener churn).
**How to apply:** Flag nextVisit crash pattern in any future discharge card rendering code. Flag useEffect([array]) anti-pattern when the real dependency is array[n].id.
