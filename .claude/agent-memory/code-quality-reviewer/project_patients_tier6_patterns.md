---
name: Patients Tier 6 — Reviewed Patterns & Known Issues
description: T2.118/T2.458/T2.461/T2.464/T2.465/T2.129/T2.133/T2.134/T2.135/T2.136/T2.463: WalkInModal duplication, deceased unsaved-close crash, engagement KPI totalAppointments=0 division, prescriptionFrequency "most recent" date sort flaw, temp chart hardcoded domain misses feline
type: project
---

T2.118+T2.458: Two WalkInModal instances now exist — one in Patients.jsx (openQuickBook state, line 55), one in PatientDashboard.jsx (quickBookOpen state, line 133). They are independent component mounts, no shared state, no conflict confirmed.

T2.135 (PetList deceased flow): Confirmation dialog confirm handler has no try/catch. If updateDoc throws, deceasedConfirm state stays non-null but dialog body crashes on next render because deceasedConfirm?.name is stale. Low-risk in practice but worth noting.

T2.129: alert() fully eliminated from Patients module. window.confirm() still present in handleDeleteNote (line 265 of usePatientManager.js) — this was pre-existing and out of scope for T2.129.

T2.134 engagement KPIs: When totalAppointments === 0 and noShowCount > 0 (logically impossible but a guard worth knowing), the noShow chip would render NaN%. The data flow makes this unreachable; Math.round safe.

T2.464 prescriptionFrequency: "Most recent date" update logic iterates history in the forEach order, which is desc (newest first). Because the existing entry's lastDate is overwritten on each subsequent match, the last match written will be the OLDEST record's date — not the newest. Bug: lastDate ends up showing the oldest occurrence, not the most recent. Only affects display, not count.

T2.461 temperature chart: YAxis domain is hardcoded `[37, 41]` which covers canine range (38.0–39.2) and feline (38.1–39.2) fine. No issue there. RR chart domain is hardcoded `[10, 40]` — feline high is 42 br/min; feline animals with RR 41-42 would be clipped at the top of the chart.

T2.465 vaccineCompleteness: Correctly uses `v.id` for VACCINE_CATALOG lookup. null-guard on relevant.length === 0 present. Logic sound.

T2.463 print CSS: `overflow: visible !important` on `*` (rule 3) conflicts with recharts ResponsiveContainer which uses overflow:hidden internally — chart SVGs may bleed during print. Low impact since charts are typically not the goal of a printed chart note.

T2.133 freshness banner: Falls back to createdAt when updatedAt absent. Correct pattern. Banner correctly suppressed in edit mode.

T2.136 referredBy: Properly wired through NewClientModal → Firestore payload, usePatientManager editForm defaults, handleSaveProfile payload, ClientDetails DataField, ClientHeader chip. Complete end-to-end.

T2.458 WalkInModal in PatientDashboard: `deptsList` state used (not `departments`), correctly passed as `departments` prop to WalkInModal.
