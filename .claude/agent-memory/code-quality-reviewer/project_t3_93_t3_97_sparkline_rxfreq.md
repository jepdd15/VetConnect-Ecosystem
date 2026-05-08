---
name: T3.93 + T3.97 — SparkLine Component & Rx Frequency Review Findings
description: SparkLine.js (new SVG mini-chart) + PetHistoryScreen vitals trends + prescription frequency: unmemoized ListHeaderComponent is the key issue
type: project
---

T3.93 + T3.97 implemented SparkLine.js (reusable SVG chart) and PetHistoryScreen additions (vitals trends collapsible + prescription frequency collapsible).

Critical finding: ListHeaderComponent passed as inline JSX expression inside FlatList — remounts header on every expand/collapse toggle (trendsExpanded / rxFreqExpanded state changes). Must be wrapped in useMemo or extracted as a stable component.

**Why:** FlatList treats a new object reference on ListHeaderComponent as a full remount; toggling expand state triggers this on every tap, causing SVG re-render jank.

**How to apply:** Flag any ListHeaderComponent / ListFooterComponent defined as an inline JSX expression inside render — always requires useMemo or extraction.

Other findings:
- SparkLine.js default lineColor is COLORS.accent (espresso brown) — low contrast on white; callers always override it so not a runtime bug.
- rxFreqCountBadge uses ad-hoc hex #FFF3E0 / #FFE0B2 instead of tokens (acceptable: mobile tokens have no warning surface variants yet).
- Pre-existing borderRadius: 16/12 on recordCard, dischargeCard, vitalsBox etc. — not introduced by this PR.
- COLORS.info (#1565C0, dark navy) correctly used for weight chart line; distinct from COLORS.sky (#3ABEF9) CTA blue.
- All new container styles: borderRadius: 0. All Firestore listener cleanup correct. No console.log. No alert()/confirm().
