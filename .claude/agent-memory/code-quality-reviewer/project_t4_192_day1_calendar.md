---
name: T4.192 Day 1 — Calendar Page
description: useCalendarData + Calendar.jsx + App.jsx + Sidebar.jsx — initial calendar page with month/week views
type: project
---

Day 1 of /calendar route. 4 files, all spec items pass.

Key findings:
- AppointmentBlock has `cursor:pointer` + hover/transform wired (Day 2 scope bleed — WARNING, but purely cosmetic since no onClick handler)
- STATUS_COLORS is a local duplicate; same pattern exists in TodayTab.jsx — cosmetic but worth extracting eventually
- lunchEnabled/lunchStart/lunchEnd/minSlotInterval are NOT in DEFAULT_SETTINGS of useClinicSettings — hook returns undefined for those keys until Firestore loads (safe because all callers guard with ?? or ||)
- useClinicSettings called twice in Calendar.jsx (line 780) and passed to WeekView/MonthView as prop — settings object comes from singleton useSyncExternalStore so no functional issue, but the prop-threading is redundant
- Snackbar/toast state is declared and wired but toast is never SET anywhere in Day 1 — dead state for now, will activate in Day 2
- `#fff` hardcoded on line 1029 (dept chip label color when All selected) — minor token gap
- Soft rgba values (heatmap bg, lunch overlay, closed overlay, today highlight) are all reasonable derivations from design tokens — acceptable advisory-level note

**Why:** All 14 spec items PASS. Verdict: Needs Minor Fixes.
**How to apply:** AppointmentBlock hover/cursor is the only actionable warning — can defer to Day 2 or strip now.
