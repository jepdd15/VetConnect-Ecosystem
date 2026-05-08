---
name: T4.121 Day 2 — Clinical File Attachment System Display Consumers Review Findings
description: PatientDashboard.jsx, EMRDrawer.jsx, printVisitSummary.js, PetHistoryScreen.js — attachment rendering on 4 display surfaces
type: project
---

Day 2 of T4.121 wires attachment display into 4 consumer surfaces.

## Issues found

**ADVISORY — EMRDrawer thumbnail uses `file.url` bare (no legacy-string fallback) for img src**
Line 401: `src={file.url}` — the wrapping `href` correctly uses `file.url || file`, but the img thumb
does not. If a legacy plain-URL string entry somehow reaches this branch, `file.url` is undefined
and the thumbnail renders broken. Low-risk in practice (plain-string entries won't have mimeType
starting with "image/"), but inconsistent.

**ADVISORY — printVisitSummary.js renderAttachmentsSection uses `att.url` bare (no legacy fallback)**
Line 211: `href="${esc(att.url)}"` — plain-string legacy entries would render as `href=""`.
React display surfaces both use `file.url || file` consistently. Print is the odd one out.
Fix: `esc(att.url || (typeof att === 'string' ? att : ''))`.

## All other checks PASS

### Safety invariant (PetHistoryScreen.js — Task 9)
- Filter: `a.clientVisible === true` — strict equality, PASS
- undefined entries: excluded (undefined === true is false), PASS
- false entries: excluded (false === true is false), PASS
- Missing field: (item.attachments || []) guards the source array, PASS
- No clientVisible filter on any admin surface: PASS (PatientDashboard, EMRDrawer, printVisitSummary all show all)

### Admin shows all + Shared badge (Tasks 6, 7, 8)
- PatientDashboard: no filter, Shared badge on file.clientVisible: PASS
- EMRDrawer: no filter, Shared badge on file.clientVisible: PASS
- printVisitSummary: no filter, "[Shared with owner]" annotation: PASS

### XSS safety (Task 8 — printVisitSummary)
- att.url: esc(att.url) — PASS
- att.label: esc(att.label || att.fileName || 'Attachment') — PASS
- att.fileName: folded into the label expression — PASS
- att.type: esc(att.type || 'other') — PASS
- Shared badge string is hardcoded, not interpolated — PASS

### Dual-read fallback guards
- PatientDashboard: rec.attachments?.length > 0 — PASS
- EMRDrawer: record.attachments?.length > 0 — PASS
- printVisitSummary: !attachments?.length — PASS
- PetHistoryScreen: (item.attachments || []) — PASS
- `file.url || file` fallback on href in PatientDashboard and EMRDrawer — PASS

### Per-lab-test attachment link (Task 6 — PatientDashboard)
- lab.attachmentUrl guarded, rendered as clickable anchor, rel="noopener noreferrer" — PASS
- AttachFileIcon imported at line 53 — PASS
- PictureAsPdfIcon imported at line 54 — PASS

### EMRDrawer position and imports (Task 7)
- Attachments SectionBlock is after lab results (line 381), before amendments (line 418) — PASS
- PictureAsPdfIcon imported at line 6 — PASS
- Chip already in MUI import at line 3 — PASS

### PetHistoryScreen (Task 9)
- Title: "Documents & Photos:" — PASS
- attachmentChip borderRadius: 0 — PASS (line 1901)
- handleOpenAttachment uses Linking.openURL with .catch Alert.alert — no window.alert() — PASS

### No alert()/confirm()/prompt()
- PatientDashboard: zero — PASS
- EMRDrawer: zero — PASS
- printVisitSummary: zero — PASS
- PetHistoryScreen: Alert.alert (RN native, not window.alert) — PASS

### Design tokens
- PatientDashboard: COLORS/FONT/TYPE throughout, borderRadius: 0 on all new elements — PASS
- EMRDrawer: COLORS/FONT throughout, borderRadius: 0 on new containers — PASS
- PetHistoryScreen: COLORS.info for chip text, borderRadius: 0 on attachmentChip — PASS

**Why:** plain-string legacy fallback inconsistency between React surfaces and print utility.
**How to apply:** When reviewing new display consumers, verify `file.url || file` is applied
consistently across ALL surfaces including print/HTML generation utilities, not just JSX.
