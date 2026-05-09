---
name: T4.196 Queue Intake Notes & Visit Status Flags Cleanup
description: Review findings for T4.196 — 9 fixes across queueColumns.jsx, Queue.jsx, useQueueActions.js
type: project
---

All 22 spec items PASS.

**Why:** Notes column rewrite (Owner:/Staff: prefixed text, no tabs), systemChips relocated to identity column, QUICK-ADMIT filtered, CONFINED red chip, row accent borders (red/orange), EOD CONFINED write, stale-date prefix with same-day skip, inline staff note editing with Save/Cancel, metadata enrichment.

**Issues found:**

- WARN: `editStaffNotesValue` not cleared after successful Save (both save handlers in Queue.jsx ~2634, ~2694 — omit `setEditStaffNotesValue('')`; `onClose` clears it so low impact today, but latent stale-state risk)
- WARN: Staff block renders even when all three note fields are empty, causing "No notes recorded." + Staff placeholder double-message conflict (Queue.jsx line 2581 condition: `staffNotes || (!clientNotes && !legacyNotes)` — fix to `staffNotes || clientNotes || (isLegacy && legacyNotes)`)
- SUGGESTION: `notesTab` useState at Queue.jsx line 227 is now dead code — state is set but never read since tabs were removed; safe to delete
- SUGGESTION: Pre-existing SURGICAL chip `borderRadius: '4px'` in identity column PassportCard (queueColumns.jsx line 126) is out of scope but inconsistent with new chips at borderRadius: 0

**How to apply:** On future Queue.jsx edits, check the Staff block render condition and the edit state clear-on-save pattern.
