---
name: T4.121 Day 1 — Clinical File Attachment System Review Findings
description: uploadAttachment.js + ClinicalWorkspace.jsx + storage.rules + firebase.json: stale-closure URL leak, size boundary off-by-one, alert() pre-existing, hardcoded chip color
type: project
---

Day 1 of T4.121 ships upload infrastructure (uploadAttachment.js), storage.rules, firebase.json wiring, and ClinicalWorkspace integration.

## Issues found

**ISSUE — Stale closure in unmount cleanup (ClinicalWorkspace.jsx line 581-588)**
`useEffect(() => { return () => { soapAttachments.forEach(...) }; }, [])` captures soapAttachments at mount (empty array). Any preview URLs added after mount are not revoked on unmount. handleRemoveAttachment correctly revokes on removal, so the only leak is "workspace closed with unsaved attachments still pending." Fix: ref pattern or `soapAttachments` in dep array (with appropriate comment explaining that the full array is intentional).

**ISSUE — Storage rule size boundary is strict-less-than but client is strict-greater-than**
storage.rules line 15: `request.resource.size < 5 * 1024 * 1024` blocks exactly 5242880 bytes.
uploadAttachment.js line 131: `file.size > MAX_FILE_BYTES` (5*1024*1024) allows exactly 5242880 bytes.
A file of exactly 5 MB passes client validation but is rejected by storage rules with no useful error. Fix: align both to `<= 5 * 1024 * 1024` (client) and `<= 5 * 1024 * 1024` (rules, use `<= 5242880` or `< 5242881`).

**ADVISORY — #E8F5E9 hardcoded in "Shared" chip (ClinicalWorkspace.jsx line 3934)**
New chip for clientVisible flag uses `bgcolor: '#E8F5E9'` directly. Pre-existing uses of this green exist (e.g., the RECORD SEALED box at 3953, lab statusChipBg at 2614) — not introduced by this PR, but the new chip is. Use `COLORS.kpiGreenBg` if that maps to the same value, or document the intentional gap.

**ADVISORY — alert() at line 1723 is pre-existing, NOT new T4.121 code**
The `alert()` in the in-consult guard transition block pre-dates this PR (confirmed via git). No new alert() calls introduced by T4.121.

## All other checks PASS
- savedAttachments state declared at line 549, before early return at 2383: PASS
- Hydration: setSavedAttachments(rec.attachments || []) at line 701: PASS
- Reset: setSavedAttachments([]) at line 687 on patient change: PASS
- Sealed JSX: all references use savedAttachments, zero references to patient?.attachments: PASS
- No hooks after early return at line 2383: PASS
- handleSaveConsult upload loop catches per-attachment, record saves even if all uploads fail: PASS
- clientVisible defaults to false in every new attachment object: PASS
- Double validation (utility + handler): PASS
- handleRemoveAttachment revokes preview URL: PASS
- Storage rules: anchored regex, auth-gated read/write: PASS
- attachmentUrl: null in initial lab result shape: PASS
- handleLabAttach validates and uploads eagerly: PASS
- attachmentUrl included in handleSaveConsult labResults write: PASS
- All new UI: borderRadius 0 or explicit token overrides: PASS
- No new alert()/confirm()/prompt(): PASS
- firebase.json storage rules reference added correctly: PASS
- ATTACHMENT_ALLOWED_TYPES/MAX_BYTES constants declared inside component (after hooks, before early return): fine as non-hook constants

**Why:** stale closure URL leak — soapAttachments captured at mount is always [].
**How to apply:** Flag stale closure in unmount cleanup whenever dep array is [] and the array reference is used inside the cleanup function.
