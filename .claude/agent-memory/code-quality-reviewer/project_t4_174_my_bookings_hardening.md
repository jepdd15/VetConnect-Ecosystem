---
name: T4.174 My Bookings Hardening — Review Findings
description: Pull-to-refresh, offline banner, receipt fallback, dept queue label, pagination; one WARNING on cursor reset
type: project
---

T4.174 applied 5 fixes to ClientAppointments.js + SuperCard.js.

All 5 fixes implemented correctly at a structural level. One WARNING found.

**Why:** Pagination cursor (`lastDoc`) and `hasMore` are reset on every `onSnapshot` tick inside the page-1 listener. If the user has already loaded page 2+, any real-time update to a doc in the first 30 results resets the cursor back to page 1's last doc, orphaning page-2+ items in state and disabling further pagination.

**Fix pattern:** Gate cursor/hasMore updates on a `hasLoadedMoreRef` ref that is set to true after the first `loadMore()` call. Only update cursor when `!hasLoadedMoreRef.current`.

**All PASS items:**
- RefreshControl: cosmetic 1s spinner, does NOT detach listener. Correct.
- Offline banner: `!isConnected`, `wifi-off` icon, `borderRadius: 0`, all COLORS tokens. Correct.
- Receipt fallback: `isFallback` check correct, text "Estimated — final receipt available after checkout". Correct.
- Department label: `queueDepartment={activeArrivedCategory || 'General'}` passed from ClientAppointments:747; SuperCard accepts at line 56 with null default; both expanded body (lines 231-235) and mini header (lines 376-381) updated. Correct.
- Pagination: limit(PAGE_SIZE), startAfter cursor, getDocs for older pages, Set dedup, hasMore tracking, ListFooterComponent Load More. All correct.
- No duplicate imports (useCallback, MaterialIcons, RefreshControl). Clean.
- All new styles (offlineBanner, receiptFallbackBanner, loadMoreBtn): borderRadius: 0, all COLORS tokens. Clean.
- No window.alert()/prompt()/confirm() introduced.

**How to apply:** In future pagination implementations, always guard cursor-reset logic with a ref that tracks whether the user has paginated past page 1.
