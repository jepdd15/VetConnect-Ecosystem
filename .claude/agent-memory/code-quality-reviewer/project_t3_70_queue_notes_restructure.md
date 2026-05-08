---
name: T3.70 Queue Notes Column Restructure — Review Findings
description: 11-file review: clientNotes/staffNotes/systemChips schema migration, EOD carry-over, tabbed popover, intakeContext on medical_records
type: project
---

All 4 locked decisions honored. One WARN on clientNotes empty-string leakage in BookAppointment multi-pet path, one WARN on WalkInModal alert() (pre-existing pattern in Queue.jsx), one WARN on EOD carry-over not writing staffNotes back to the OLD doc. All critical checks pass.

**Why:** Tracks non-obvious review findings for future sessions so they are not re-discovered.
**How to apply:** When revisiting Queue notes, check the multi-pet clientNotes "" prefix bug and the staffNotes-on-old-doc gap.
