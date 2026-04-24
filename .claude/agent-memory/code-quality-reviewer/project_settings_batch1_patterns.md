---
name: Settings Batch 1 — Reviewed Patterns & Known Issues
description: T2.177-T2.187 review findings: onSnapshot/settings race on baseline seed, service-field clobber risk, workingDays empty-array edge, department usage-shield field mismatch
type: project
---

Settings.jsx batch 1 (T2.177-T2.187) — key findings:

**Race condition in lastSavedSettings seeding (line 153)**: onSnapshot fires on every remote write (including the save itself). The `prev === null` guard prevents re-seeding after first load, but if the snapshot fires between user edits and the `setLastSavedSettings({ ...sanitizedSettings })` call in handleSave (line 329), hasUnsavedChanges could briefly show stale state. Low probability, non-data-corrupting.

**workingDays ToggleButtonGroup allows empty selection (line 537)**: MUI ToggleButtonGroup with no `exclusive` prop lets users deselect all values, producing an empty array. validateSettings catches this (line 277) but only at Save time — no inline feedback as the user deselects all days. Also, if Firestore returns `workingDays: []`, the component renders fine but Save is blocked, giving no indicator to the user why.

**Department usage shield field mismatch (line 356)**: `serviceCount` check uses `(s.department || s.category) === name` — the `|| s.category` fallback is unconventional and may miss services that store department info differently. The chip's inline count (line 759) uses the same expression so the shield and the chip agree, but the expression needs careful validation against actual Firestore service document schema.

**handleSave does not block on closedDates warning (line 302)**: the `> 365` warning shows a toast but does NOT return early — save proceeds regardless. This is likely intentional (warn-only), but worth confirming.

**Import hygiene**: `deleteDoc` is imported (line 11) and used. `getDocs`, `addDoc`, `setDoc`, `onSnapshot`, `collection`, `doc`, `Timestamp` — all imported and used. No unused Firestore imports. `auth` import fully removed. `query` and `where` were NOT imported (confirmed by grep) — the category usage check (T2.179) uses a client-side filter on a full getDocs scan, not a Firestore query, which is acceptable for small inventories but will not scale.

**Design token gap**: `COLORS.success` is used on the Save button (line 480) but is defined as `'#2E7D32'` in tokens — correct. `COLORS.danger` used in Dialog — correct. The Dialog cancel/confirm buttons lack `borderRadius: 0` on the Cancel button (line 904), which has no `sx.borderRadius` override. Minor neubrutalism inconsistency.

**No-op refreshUsageCounts after addDoc department (line 343)**: Called after addDoc but the new department has no services or staff yet — count will always be 0. Harmless but wasteful read.
