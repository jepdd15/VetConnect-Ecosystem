---
name: T3.12 Day 1 — Multi-Pet Visit Queue Grouping + Batch Check-In
description: Review findings for Queue.jsx flushToRows rewrite, queueColumns group badges, and AssignStaffModal batch check-in
type: project
---

Key findings from T3.12 Day 1 review (Queue.jsx, queueColumns.jsx, AssignStaffModal.jsx):

**Bug confirmed — prop mutation in AssignStaffModal useEffect (line 46):**
`patient.services.sort()` mutates the original prop array. Sibling services correctly use spread `[...sib.services]` but primary does not. Fix: `[...(patient.services || [])].sort(...)`.

**Why:** Inconsistency with the sibling initialization on the next line; mutating Firestore-derived prop data can cause subtle stale-data bugs if the component re-renders with the same patient reference.

**Design token deviations in AssignStaffModal (pre-existing pattern, not new):**
`borderRadius: 3` on Dialog PaperProps, `borderRadius: 1.5` on service pills and submit button, `borderRadius: 2` on dropdown menu. These match the existing AssignStaffModal style pre-rewrite. The new group-specific elements (group banner box, toggle button) correctly use `borderRadius: 0`.

**All critical checks PASS:**
- Queue counter incremented by 1 (not N) — sharedNumber assigned once, written to all siblings
- Transaction atomicity — all reads in one Promise.all, all writes in same transaction
- Emergency priority preserved — isEmergency checks ticketPrefix==='E' || priority==='emergency' || priority==='high'; hasEmergency flag bubbles up from any group member
- Concurrent conflict guard — transaction re-reads primary AND all siblings, validates all are still 'confirmed'
- siblingAppts reset on modal close — `onClose={() => { setOpenAssign(false); setSiblingAppts([]); }}` correct
- Group annotation flags — isGroupHeader/isGroupMid/isGroupTail/isStandalone correctly exclusive; 2-pet group verified correct
- Context menu "Check In Group" correctly shown only when selectedRow is confirmed AND has confirmed siblings
- handleOpenAssign correctly collects confirmed siblings from rows state (same filter used in both button and context menu paths)
- flushToRows uses visitGroupId as authoritative grouping signal; legacy appointments without visitGroupId fall to standalone
- Groups internally sorted by groupIndex before representative selection
