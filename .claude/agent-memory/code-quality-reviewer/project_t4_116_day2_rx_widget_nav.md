---
name: T4.116 Day 2 — RX fix, widget cleanup, nav fix (Items 4-7)
description: PatientDashboard.jsx Items 4-7: inline RX split, widget removals, Other Pets collapse, owner header, back-nav; Records.jsx navigate state
type: project
---

Items 4-7 review. One WARNING found.

**Confirmed PASS:**
- Item 4: Inventory2Icon imported; drugs section uses rxBg + MedicationIcon; nonDrugs uses formBg + Inventory2Icon; rx.qty shown on both (lines 1532, 1549); conditional rendering means only-drugs or only-nonDrugs shows only the relevant section
- Item 6.1 (Next Appointment widget removed): No Widget renders nextAppointment. No "Next Appointment" or "Upcoming Appointment" text anywhere
- Item 6.2 (Consent Audit Log removed): Zero occurrences of auditLogExpanded, consentRecords, consentRecordsLoading, sigViewDialogOpen, sigViewData, CONSENT_ACTIONS, SIGNATURE_TYPES, GavelIcon, "Consent Audit" text
- Item 6.3 (Lab Results conditional): Wrapped in `aggregatedLabResults.length > 0` at line 2338; "No lab results on file" text absent
- Item 6.4 (Other Pets collapsed): siblingExpanded state at line 231 (default false); Collapse in={siblingExpanded} at line 2423
- Item 6.5 (Owner contact in header): Lines 988-1005 — fullName||displayName||name, phone||contactNumber, email, all in compact inline box below pet vitals row; no separate Pet Owner Widget in sidebar
- Item 7 (Back-nav): PatientDashboard checks location.state?.from === 'records' at line 935, navigates to /records else /patients; Records.jsx passes { state: { from: 'records' } } at line 634

**WARNING — Orphaned state + dead fetch (nextAppointment):**
- `nextAppointment` state (line 177) and `setNextAppointment` (line 412) both remain. The appointment fetch query (lines 398-413) still runs on every dashboard load but the result is never consumed in JSX. The widget was removed but the state declaration and its fetch block were not cleaned up. Not a runtime error, but it is a wasted Firestore query on every patient open.
- Fix: Remove `const [nextAppointment, setNextAppointment] = useState(null);` and the entire "Fetch upcoming appointment" try/catch block (lines 397-413).

**Cross-cutting:**
- Zero alert()/confirm()/prompt() calls in new code
- All borderRadius: 0 on new containers
- No orphaned consent/audit-log imports
