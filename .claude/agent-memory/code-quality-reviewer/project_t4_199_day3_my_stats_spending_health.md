---
name: T4.199 Day 3 — My Stats SPENDING + HEALTH tabs + per-tab PDF export
description: Review findings for Day 3 of T4.199: spending toggle chips, SpendingPieChart, spendingPerVisit SparkLine, VACCINATION STATUS section, ALL PETS gauge strip, per-tab PDF export via expo-print/expo-sharing. 21/21 spec items PASS. Two WARNs and one ADVISORY.
type: project
---

All 21 spec items PASS. Two functional warnings and one advisory found.

**WARNING 1 — weeklySpendingData and spendingByDepartment ignore spendingRange**

`weeklySpendingData` (useMyStats.js:1207) iterates raw `salesData` without applying the `spendingRange` date filter. The WEEKLY view of the SPENDING tab therefore always shows all-time weekly data regardless of whether the user has selected "6 MONTHS", "THIS YEAR", "LAST YEAR", or "ALL TIME". Same issue in `spendingByDepartment` (line 1246): also iterates raw `salesData` without range filtering. In contrast, the MONTHLY bar correctly uses `spendingBreakdown.spendingBarData` which is already range-filtered inside `spendingBreakdown`.

Impact: switching to WEEKLY grouping while "LAST YEAR" range is selected shows a bar chart that disagrees with the period label. Confusing but not data-corrupting.

Fix path: pass `spendingRange` to both useMemos and apply the same rangeStart/rangeEnd logic from `spendingBreakdown`. Both useMemos currently only take `[salesData, activeTab]` in their dep arrays.

**WARNING 2 — HTML export injects unsanitized user-controlled content**

`handleExportTab` (MyStatsScreen.js:431) builds HTML by template-literal-interpolating pet names, service names, condition names, and appointment countdowns directly into HTML strings (e.g. lines 459-464, 559-564, 588-603). In a mobile WebView context these are rendered as PDF via expo-print. A pet named `<script>alert(1)</script>` or a diagnosis containing `</td><tr>` would break table structure. While this is a mobile PDF export (not a web attack vector), malformed HTML can crash expo-print or produce corrupted/blank PDFs on some PDF renderers.

Fix: apply a minimal HTML-escape before interpolation. A one-liner is sufficient for this use case:

```js
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
```

Then use `escHtml(a.petName)`, `escHtml(c.name)`, etc. at all interpolation sites.

**ADVISORY — PDF URI not deleted after shareAsync**

`Print.printToFileAsync` writes a temporary PDF to the device filesystem at a path like `file:///tmp/...`. After `Sharing.shareAsync(uri)` completes, the file is never deleted, leaving orphaned files in the temp directory. Not a crash risk (OS will eventually reclaim temp space) but can accumulate large PDFs if the user exports frequently.

Fix: wrap in try/finally and call `FileSystem.deleteAsync(uri, { idempotent: true })` from `expo-file-system` after sharing completes.

**Hex colors in HTML baseStyle (not a violation)**

The hardcoded hex values in the `baseStyle` CSS string (#3E2723, #5D4037, #FFF8E1, #D32F2F, etc.) are intentional — they exist inside a string template, not in StyleSheet.create(). The mobileTokens system only governs native RN styles. These match the correct design palette values. Not flagged as a violation.

**Spec items verified:**

1. PASS — spendingTimeGrouping + spendingBreakdownMode state declared at lines 372-373
2. PASS — 3 rows of toggle chips render in SPENDING tab (lines 1240-1295)
3. PASS — spendingBreakdownMode === 'total' conditional at line 1303
4. PASS — per-pet drill-down preserved under BY PET mode (lines 1380-1429)
5. PASS — weeklySpendingData gated on activeTab !== 'spending' (line 1208)
6. PASS — spendingByDepartment useMemo exists (line 1246)
7. PASS — spendingPerVisit useMemo exists (line 1271)
8. PASS — SPENDING PER VISIT SparkLine renders with average label (lines 1433-1453)
9. PASS — VACCINATION STATUS SectionHeader in HEALTH tab (line 1559)
10. PASS — vacStatusBarTrack/vacStatusBarFill styles and fill render per-pet (lines 1573-1578)
11. PASS — vacStatusLine per-vaccine with colored indicators (lines 1588-1610)
12. PASS — ALL PETS SectionHeader + CircularGauge map (lines 1621-1635)
13. PASS — allPetsOverall aggregate text (lines 1638-1643)
14. PASS — expo-print and expo-sharing imported (lines 30-31)
15. PASS — handleExportTab async function exists (line 431)
16. PASS — share icon + exportButton TouchableOpacity on all 5 tabs
17. PASS — printToFileAsync + shareAsync called inside handleExportTab (lines 623-624)
18. PASS — "ios-share" does NOT appear anywhere in the file
19. PASS — all 3 new useMemos gate on activeTab !== 'spending' (lines 1208, 1247, 1272)
20. PASS — T4.199 marked DONE in MASTER_TASKLIST.md (line 1325)
21. PASS — zero inline hex colors in new RN StyleSheet code; hex values only in HTML export string (expected)
