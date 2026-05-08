---
name: T4.87 Encounter Summary — Review Findings
description: EncounterSummary.js (new), ClientAppointments.js + CaseDayCard.js (modified) — lazy-loaded medical record expand/collapse for completed visit cards
type: project
---

All three files reviewed. One WARNING (onRebook prop contract mismatch at ClientAppointments.js:831), one SUGGESTION (paidText duplication in CaseDayCard when EncounterSummary also shows Paid line). All critical, security, performance, and design checks PASS.

**Why:** Lazy getDocs fires only on first expand (medRecordFetched flag). Gate correctly requires BOTH status === 'completed' AND encounterItems?.length > 0. No staff notes exposed. hideViewRecord={true} in CaseDayCard. Expand All / Collapse All correctly skips group/case wrappers.

**How to apply:** In future EncounterSummary integrations, always pass `onRebook={appt => handleRebook(appt)}` rather than a zero-arg wrapper, to honor the prop contract. Avoid showing the standalone paidText in CaseDayCard when EncounterSummary is rendered (it already shows Total + Paid inside the summary).
