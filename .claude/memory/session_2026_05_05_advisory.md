---
name: Session 2026-05-05 — Diagnosis system, POS professional, auth hardening, 3-tier classification, medical record redesigns, problem list
description: Massive advisory+implementation session. ~26 tasks shipped, ~8 formalized. POS Professional tier. 3-tier product classification designed. Medical record redesign for both surfaces. Structured problem list designed. Firestore rules Spark plan regression found and fixed. ~695 DONE / ~184 TODO.
type: project
originSessionId: 7d749ba2-7d18-4384-8779-7e3b0e93e286
---
## Tasks SHIPPED this session (~26):

### Multi-day builds:
| ID | Name | Days |
|---|---|---|
| T4.141 | Structured diagnosis system (452 entries, 10 severity scales, dual-write) | 3 |
| T4.147 | Partial payment follow-up (7 capabilities, Worker Cron balance reminders) | 2 |
| T4.155 | PetHistoryScreen full redesign (collapsible, month picker, dot timeline, neubrutalism, health snapshot, 7 display gaps) | 3 |

### POS Professional Upgrade (6 tasks):
T4.148 (cash change), T4.149 (custom discounts per-item + bill), T4.150 (split-tender), T4.151 (EOD Z-report), T4.152 (receipt PDF + email), T4.153 (sequential receipt OR-YYYYMMDD-NNNN)

### Auth hardening:
T4.136 (forgot password — marked DONE), T4.137 (blocking password change dialog), T4.138 (3-layer staff revocation), T4.154 (role simplification — isStaff()=isAuth())

### Clinical:
T4.127 (CW sidebar split — Services + Items panels), T4.158 (Subjective auto-populate), T4.159 (service-driven validation — REVERTED by T4.164), T4.160 (ServiceFormModal cleanup)

### Other:
T3.139 (carry-over data hygiene), T4.143-T4.145 (refund/void fixes), T4.156 (ClientDashboard stats), T4.157 (Settings tabs), T4.161 (chatbot keyboard), T4.162 (MyPetsScreen neubrutalism), T4.163 (WalkInModal 13-fix cleanup)

## Tasks FORMALIZED but NOT built (~8):
| ID | Name | Effort |
|---|---|---|
| T4.142 | 3-tier product classification + category manager redesign (20 changes, 10 files) | 6-8 hrs |
| T4.146 | Booking TOCTOU race fix | 1.5 hrs |
| T4.164 | Universal soft-warning dialog (reverts T4.159) | 1 hr |
| T4.165 | Vitals empty defaults + WNL→All Systems Normal | 30 min |
| T4.166 | Mobile record content redesign (15 changes) | 4-5 hrs |
| T4.167 | Admin record view redesign (13 changes) | 4-5 hrs |
| T4.13 | Structured problem list (5 UI locations) | 4-5 hrs |
| T4.168 | POS checkout transaction restructure (read-after-write fix) | 1.5-2 hrs |

## Critical bugs found and fixed:
1. Firestore rules getUserRole() get() fails on Spark plan → isStaff()=isAuth() workaround
2. StaffTable departments Array.isArray guard (admin account missing field)
3. ClientDashboard useMemo import crash
4. ServiceFormModal inventory bundle groupBy duplicate headers (sort by category first)
5. POSModal checkout read-after-write violation (formalized as T4.168, not yet fixed)

## Key decisions locked (carry to next session):
- 3-tier: Medicine/Medical Supply/Retail (replaces binary isMedicine)
- Discharge split: PLAN (internal) + Client Instructions (pet-owner facing, new field)
- "Going-Home Instructions" → "Discharge Notes"
- Universal soft warnings (no per-service validation gates)
- Vitals start empty, "not taken" for missing
- Mobile: diagnosis-first, white bg + cream discharge, global AI FAB, bottom sheet dept filter
- Admin: SOAP-order (S→O→A hero→P→Discharge), per-dx notes input, collapsible Objective
- "Dispensing Unit" (renamed from "Unit of Measure"), conditional on Medicine tier
- Problem list: pets/{petId}/problems sub-collection, 5 UI locations, sign-off integration

## Cloudflare Worker state:
- 3 Cron handlers: handleVaccineReminders + handleAppointmentReminders + handleBalanceReminders
- Balance reminders: snooze-aware, configurable interval, push + email
- ~1020 lines in reference copy

## Recommended next task priority:
1. T4.168 (POS checkout fix — P1, blocks all product checkouts)
2. T4.165 (vitals cleanup — 30 min quick win)
3. T4.164 (soft warnings — 1 hr, simplifies CW validation)
4. T4.142 (3-tier classification — 6-8 hrs, foundational)
5. T4.166 + T4.167 (record redesigns — depend on T4.142)
6. T4.13 (problem list — depends on T4.141 which is DONE)
7. T4.146 (TOCTOU — architectural, lower urgency)
