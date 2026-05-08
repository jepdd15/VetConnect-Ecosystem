---
name: T3.100+T3.101 PatientDashboard — Species Filter & Vaccine Exemption
description: T3.100 species filter on vaccinationStatus, T3.101 arrayUnion/arrayRemove exemption flow — one WARN (Dialog missing PaperProps borderRadius:0), all critical checks PASS
type: project
---

T3.100 (species filter) and T3.101 (vaccine exemption) implemented in PatientDashboard.jsx.

All logic correct. One design-token gap on the exemption Dialog.

**Why:** Exemption Dialog at line 2270 omits `PaperProps={{ sx: { borderRadius: 0 } }}`. MUI Dialog paper defaults to rounded corners, violating the zero-radius design rule.

**How to apply:** Add `PaperProps={{ sx: { borderRadius: 0 } }}` to the T3.101 exemption Dialog (same pattern as the sigViewDialog at line 2205).

Checklist results:
- T3.100: spKey derivation PASS, pet?.species dep PASS, species filter before .map() PASS, vaccineCompleteness simplified PASS, deps updated PASS
- T3.101: arrayUnion/arrayRemove PASS, BlockIcon/UndoIcon PASS, useUser/profile PASS, 4 state vars PASS, handleMarkExempt PASS (arrayUnion + re-fetch + reset), handleUndoExemption PASS (exact-object arrayRemove + re-fetch), exemptionMap useMemo PASS, completeness excludes exempted PASS, exempt row rendering PASS, unknown Mark N/A PASS, MUI Dialog (no alert/confirm/prompt) PASS, disabled when reason empty or saving PASS
- Dialog TextField borderRadius:0 PASS; Dialog Paper borderRadius NOT overridden (WARN)
- No console.log, no unused imports (ScienceIcon and AttachFileIcon both used), all tokens PASS
