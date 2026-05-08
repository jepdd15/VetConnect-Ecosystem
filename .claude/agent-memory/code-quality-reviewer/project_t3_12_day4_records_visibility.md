---
name: T3.12 Day 4 — Records Visit-Group Visibility
description: T3.12 Day 4 review: group badge in DataGrid identity column + sibling fetch panel in audit popover; all critical checks PASS, one actionable warning (redundant Firestore re-read on sibling nav)
type: project
---

Records.jsx — group badge in identity column and sibling fetch panel in audit popover.

**Why:** T3.12 Day 4 adds visit-group context to the Records ledger so staff can see all pets from the same multi-pet visit and navigate between their audit records.

**How to apply:** When reviewing future Records.jsx changes, note the sibling useEffect dep array pattern and the stale-anchor tradeoff.

## Critical Checklist — All PASS

- visitGroupId/groupIndex/groupSize read from DataGrid row data (useGlobalRecords already provides these)
- Group chip rendered only when visitGroupId is truthy; non-grouped records silent skip
- Position indicator "(1/3)" with "GROUP" fallback implemented correctly
- Tooltip: "Multi-pet visit — Pet N of M"
- getDocs (one-shot), NOT onSnapshot — confirmed correct
- Cancellation guard (cancelled flag) present and correctly placed
- handleCloseAudit clears groupSiblings and loadingGroupSiblings
- Missing visitGroupId: early return, no query, state cleared
- Loading/empty states present in sibling section
- Sibling cards: pet name, position badge, species, status
- In-window sibling: setActiveAuditRow(siblingRow); out-of-window: toast with guidance
- No N+1 queries — one getDocs per audit row open
- borderRadius: 0, COLORS tokens used throughout
- T3.12 marked DONE in MASTER_TASKLIST.md

## Issues Found

### Warning — Redundant Firestore Re-Read on Sibling Navigation
- Location: Records.jsx:178 — dep array `[activeAuditRow?.id, activeAuditRow?.visitGroupId]`
- Problem: When user clicks a sibling card, setActiveAuditRow fires, changing activeAuditRow.id but NOT visitGroupId. The useEffect re-runs anyway because id is in deps, triggering a second getDocs for the same visitGroupId (just filtering out the new current record). Results are identical; pure wasted read.
- Fix: Use only `[activeAuditRow?.visitGroupId]` as the dep. Capture the current activeAuditRow.id via a ref inside the async fetch to correctly exclude it from siblings at fetch time.

### Warning — Stale Popover Anchor on Sibling Switch (UX)
- Location: Records.jsx:1104-1106 — sibling onClick sets new activeAuditRow but anchorEl stays pointing at original row's button
- Problem: If the grid was scrolled, the anchor element is now off-screen while the popover stays open. Not a crash; a UX glitch. The popover content switches correctly.
- Fix: Low-priority. Could re-anchor to a stable center element. Acceptable for now as a known tradeoff.

### Suggestion — OpenInNewIcon misleading on sibling cards
- Location: Records.jsx:1144
- Problem: OpenInNewIcon conventionally means "open in new tab". Here it decorates "switch to this sibling's audit". ChevronRightIcon or SwapHorizIcon would communicate the intent more accurately.

### Suggestion — groupIndex 0-based assumption
- Location: Records.jsx:531, 1135 — both use groupIndex + 1 for display
- Confirm groupIndex is stored 0-based in Firestore (T2.78 booking engine write path). If stored 1-based this would render Pet 2 of 3 for the first pet.
