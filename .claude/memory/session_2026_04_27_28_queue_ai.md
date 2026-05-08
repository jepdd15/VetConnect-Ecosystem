---
name: Session 2026-04-27/28 — Queue hardening, AI panel, check-in simplification
description: 14 tasks shipped (T3.111-T3.124) + 4 hotfixes. Queue action columns, self-check-in fix, Ask AI panel visibility, God View symmetry, shared AmendmentDialog, check-in simplification, statusHistory fixes, on-hold UI, sign-off guard, re-route button. Firestore rules deployed.
type: project
originSessionId: 960f407a-ec04-4799-a9e3-c4bf9a2260dd
---
## Tasks Shipped
- T3.111: Queue action column collapse — Check In button visible
- T3.112: Mobile booking INCEPTION pulse event
- T3.113-114: Self-check-in Firestore rule + pulse format + GPS timeout
- T3.115-116: Ask AI panel — loading spinner, auto-scroll, Strict Mode fix, Markdown rendering
- T3.117: God View quadrant symmetry — flex layout, scroll chain, borders
- T3.118: Shared AmendmentDialog — PatientDashboard button, CW refactor
- T3.119: EndOfDayModal services sort toggle, null guard, PULSE EVENTS cleanup
- T3.120: Check-in simplification — strip staff UI, remove Assign mode, statusHistory array-spread across 6 sites
- T3.121: Sign-off guard — auto-transition arrived/confirmed→in-consult
- T3.122: On-hold overflow menu — Put On Hold + Resume Consult
- T3.123: Service pulse event labels — serviceName on 3 display surfaces
- T3.124: RE-ROUTE TO CASHIER for reverted sealed records

## Key Decisions
- statusHistory: arrayUnion→array-spread at ALL 6 write sites (dedup corrupts revert chain)
- Check-in: staff assignment removed from AssignStaffModal, vets use CW "Performed By" only
- On-hold: overflow menu only (not CW button) — sufficient for solo-vet clinic
- T3.121 guard: inline updateDoc, not changeStatus import (avoids queue counter side effects)
- T3.124: lockedServices.has('medical') is the authority, not isRecordLocked state
- Ask AI: DiagnosticBridge is shared React.memo — fixes apply to all 3 views simultaneously

## Notable Bugs Found & Fixed
- React Strict Mode double-mount permanently sets llmAbortRef to true
- MUI Dialog fullScreen doesn't reliably set flex column on Paper
- Firestore arrayUnion deduplication corrupts statusHistory
- BookAppointment.js triageDate UTC vs local timezone
- AssignStaffModal missing statusHistory write on check-in
- CW sign-off on group-visit sibling bypasses in-consult transition

## Uncommitted Work
- T3.124 hotfix: lockedServices.has('medical') condition (needs commit + push)
- T3.120 manual tests 5-6 (simple revert + double revert) still pending
