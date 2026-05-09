---
name: Reference mockups from 2026-05-09 session — My Stats tabs, SuperCard/MyBookings cards, service progress patterns
description: ASCII mockups created during the May 9 advisory session for My Stats 5-tab redesign, SuperCard multi-day carry-over cards, AppointmentCardContent service progress, and per-service icon/phrasing decisions. These are APPROVED DESIGNS — use them as the reference when implementing T4.199 (My Stats) and any future service progress work.
type: reference
originSessionId: afefd8b6-5aac-42ec-9231-c662616b1f84
---
## My Stats 5-Tab Layout (T4.199)

### OVERVIEW Tab
```
[OVERVIEW] [VISITS] [SPENDING] [PETS] [HEALTH]
─────────

YOUR RELATIONSHIP
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Jan 2024 │  │    47    │  │  P48,350 │
│ CLIENT   │  │  TOTAL   │  │ LIFETIME │
│ SINCE    │  │  VISITS  │  │  SPEND   │
└──────────┘  └──────────┘  └──────────┘
┌──────────┐  ┌──────────┐  ┌──────────┐
│every 3   │  │   8/10   │  │    1     │
│weeks     │  │ FOLLOW-UP│  │ NO-SHOWS │
│FREQUENCY │  │80% attend│  │          │
└──────────┘  └──────────┘  └──────────┘
┌──────────┐
│  P1,028  │
│AVG PER   │
│VISIT     │
└──────────┘

UPCOMING APPOINTMENTS
┌─────────────────────────────────────────────┐
│        MAY 2026              < >            │
│  M    T    W    T    F    S    S            │
│                 1    2    3    4            │
│  5    6    7    8   [●]  10   11           │
│  12  [●]  14   15   16   17   18           │
│  19   20   21   22   23  [●●] 25           │
│  26   27   28   29   30   31               │
└─────────────────────────────────────────────┘
May 9 · Anti tick & flea + Grooming
  🐶 Bantay                      in 2 days
May 13 · Vaccination
  🐱 Mingming                    in 6 days

CONDITIONS OVERVIEW
┌──────────┐  ┌──────────┐  ┌──────────┐
│    3     │  │    2     │  │    1     │
│  ACTIVE  │  │ RESOLVED │  │MONITORING│
└──────────┘  └──────────┘  └──────────┘
Bantay: CKD (Stage III), Dental Disease
Mingming: Skin allergy (monitoring)
```

### VISITS Tab
```
[OVERVIEW] [VISITS] [SPENDING] [PETS] [HEALTH]
           ──────

VISIT TRENDS
[MONTHLY]  [WEEKLY]
[TOTAL] [BY PET] [BY SERVICE] [BY DEPARTMENT]

── TOTAL · MONTHLY → bar chart ──
┌─────────────────────────────────────────────┐
│  VISITS PER MONTH                           │
│              8                              │
│        6     █                              │
│  4     █  5  █  7                           │
│  █  3  █  █  █  █                           │
│ DEC JAN FEB MAR APR MAY                     │
└─────────────────────────────────────────────┘

── BY PET → pie chart ──
┌─────────────────────────────────────────────┐
│  VISITS BY PET                              │
│  🐶 Bantay      58% (27 visits)             │
│  🐱 Mingming    32% (15 visits)             │
│  🐱 Muning      10% (5 visits)              │
└─────────────────────────────────────────────┘

YEAR OVER YEAR
[VISITS]  [SPENDING]
┌─────────────────────────────────────────────┐
│  ██ 2026    ░░ 2025                         │
│  2026: 33 visits · 2025: 28 (+18%)          │
└─────────────────────────────────────────────┘

VISIT PATTERNS
- Visit frequency trend (line: days between visits)
- Visit outcomes (pie: completed 94% / cancelled 4% / no-show 2%)
- Preferred days (bar: Mon-Sun)
- Species distribution (pie: 67% feline / 33% canine)

SEASONAL PATTERNS
[ALL PETS]  [BANTAY]  [MINGMING]  [MUNING]
┌─────────────────────────────────────────────┐
│  ██ ██ ░░ ██ ██ ░░ ░░ ░░ ██ ░░ ░░ ██       │
│   8  7  2  9  8  3  1  2  7  3  2  6       │
│  J  F  M  A  M  J  J  A  S  O  N  D        │
│  Peak months: January, April, September     │
└─────────────────────────────────────────────┘
```

### SPENDING Tab
```
[OVERVIEW] [VISITS] [SPENDING] [PETS] [HEALTH]
                    ────────

SPENDING BREAKDOWN
[6 MONTHS]  [THIS YEAR]  [LAST YEAR]  [ALL]
[MONTHLY]  [WEEKLY]
[TOTAL] [BY PET] [BY SERVICE] [BY DEPARTMENT]

── TOTAL · MONTHLY → bars ──
┌─────────────────────────────────────────────┐
│  MONTHLY SPENDING                           │
│                    P12k                     │
│           P8k      █                        │
│  P5k      █  P7k   █  P9k                  │
│   █  P3k  █   █    █   █                   │
│  DEC JAN FEB MAR  APR MAY                  │
└─────────────────────────────────────────────┘

── BY PET → pie + drill-down ──
🐶 Bantay     P28,400 (62%)        ∨  (tap to expand)
  May 1   Anti tick & flea       P1,200
  Apr 24  Surgery                P8,500
  Apr 15  Vaccination              P800
🐱 Mingming   P14,200 (31%)        ∨
🐱 Muning      P3,150 (7%)         ∨

SPENDING PER VISIT (line chart)
Average: P1,028/visit

✅ P0 outstanding — all clear
```

### PETS Tab
```
[OVERVIEW] [VISITS] [SPENDING] [PETS] [HEALTH]
                               ────

YOUR PETS (3)
┌─────────────────────────────────────────────┐
│  🐶 BANTAY                                  │
│  Canine · Labrador · 4 yrs 2 mo            │
│  WEIGHT    ╱‾╲___    12.5 kg  ▲ +0.3 kg    │
│  LAST VISIT     May 1, 2026 (8 days ago)   │
│  VACCINES       ◉ 4/5 current              │
│  MEDICATIONS    2 active                    │
│              [ VIEW CHART → ]               │
└─────────────────────────────────────────────┘
(repeat for each pet — compact, no clinical details)
```

### HEALTH Tab
```
[OVERVIEW] [VISITS] [SPENDING] [PETS] [HEALTH]
                                      ──────

PREVENTIVE CARE (3 items need attention)
┌─────────────────────────────────────────────┐
│█ 🐶 BANTAY                                  │
│█ Rabies vaccine overdue · 14 days overdue   │
│█ [████████ BOOK NOW ████████]               │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│█ 🐱 MINGMING                                │
│█ Recheck due · skin allergy · in 5 days     │
│█ [████████ BOOK RECHECK ████████]           │
└─────────────────────────────────────────────┘

VACCINATION STATUS
🐶 BANTAY    ████████████████░░░░  4/5 (80%)
  🔴 Rabies         OVERDUE (114 days)
  🟡 DHPP           ● ● ○ DOSE 3 in 12 days
  🟢 Bordetella     current
  ⚪ Leptospirosis  no record
  ⚪ Heartworm      no record

ALL PETS
┌──────────┐  ┌──────────┐  ┌──────────┐
│ 🐶 80%  │  │ 🐱 67%  │  │ 🐱  0%  │
│  Bantay  │  │ Mingming │  │  Muning  │
└──────────┘  └──────────┘  └──────────┘
Overall: 6/11 vaccines current (55%)
```

---

## SuperCard / My Bookings Card Mockups

### Single-service completed (no SERVICES section)
```
┌─────────────────────────────────────────────┐
│ 🐶 BANTAY                  ✅ VISIT COMPLETE▼│
│  Anti tick & flea                            │
│  🎫 A-005 · 🏥 Grooming · 👨‍⚕️ Dr. Capua      │
│  ▼ VISIT TIMELINE                            │
│  ENCOUNTER SUMMARY · 💊 Amoxicillin x14     │
│  Total: ₱800                                 │
└─────────────────────────────────────────────┘
```

### Multi-service completed (same day)
```
┌─────────────────────────────────────────────┐
│ 🐶 BANTAY                  ✅ VISIT COMPLETE▼│
│  Anti tick & flea + Vaccination              │
│  SERVICES                                    │
│  ✓ Anti tick & flea — done (40 min)          │
│    · Dr. Capua · P500                        │
│  ✓ Vaccination — done (15 min)               │
│    · Dr. Santos · P800                       │
│  ▼ VISIT TIMELINE (services nested under     │
│     "With the vet" node)                     │
│  ENCOUNTER SUMMARY · Total: ₱1,800          │
└─────────────────────────────────────────────┘
```

### Multi-service ACTIVE (live, at clinic now)
```
┌─────────────────────────────────────────────┐
│ 🐶 BANTAY  2 ahead in Vet Med ⏳ IN CONSULT▲│
│  Anti tick & flea + Vaccination + Consult    │
│  SERVICES                                    │
│  ✓ Anti tick & flea — done (40 min)          │
│    · Dr. Capua · P500                        │
│  ⏳ Vaccination — in progress                │
│    · Dr. Santos · P800                       │
│  ○ Consultation — waiting · ~25 min service  │
│    · P1,200                                  │
│                                 2/3 COMPLETE │
│  2 pets ahead in Veterinary Medicine         │
│  ▼ VISIT TIMELINE                            │
│  ● With the vet        9:20 AM              │
│  │   ✓ Anti tick & flea (40 min)             │
│  │   ⏳ Vaccination                           │
│  │   ○ Consultation                          │
└─────────────────────────────────────────────┘
```

### Day 2 active carry-over (with "prev. day")
```
┌─────────────────────────────────────────────┐
│ 🐶 BANTAY  2 ahead in Vet Med ⏳ IN CONSULT▲│
│  CASE: 2 DAYS                                │
│  📅 Day 2 of care                            │
│  SERVICES                                    │
│  ✓ Anti tick & flea — done (40 min)          │
│    · prev. day · Dr. Capua · P500            │
│  ⏳ Vaccination — in progress                │
│    · Dr. Santos · P800                       │
│  ○ Consultation — waiting · ~25 min service  │
│    · P1,200                                  │
│                                 1/3 COMPLETE │
│  ▼ VISIT TIMELINE                            │
│  ● With the vet        9:35 AM              │
│  │   ✓ Anti tick & flea (40 min · prev. day) │
│  │   ⏳ Vaccination                           │
│  │   ○ Consultation                          │
│                     ● ◉                      │
│                  Day 1  Day 2  ← swipe →     │
└─────────────────────────────────────────────┘
```

### Day 1 past card (swipe left — full read-only)
```
┌─────────────────────────────────────────────┐
│  DAY 1 · May 8, 2026                        │
│  🔄 CARRIED OVER                             │
│  👨‍⚕️ Dr. Capua · 🕐 Started 9:20 AM          │
│  SERVICES                                    │
│  ✓ Anti tick & flea — done (40 min)          │
│    · Dr. Capua · P500                        │
│  ✗ Vaccination — not completed               │
│  ✗ Consultation — not started                │
│                                 1/3 COMPLETE │
│  TIMELINE (full, not truncated)              │
│  ● Booked → Checked in → With vet →         │
│    Continued next day                        │
│  ENCOUNTER SUMMARY · Paid: ₱800             │
│                     ◉ ●                      │
│                  Day 1  Day 2  ← swipe →     │
└─────────────────────────────────────────────┘
```

### Confined pet (hospitalized overnight)
```
┌─────────────────────────────────────────────┐
│ 🐶 BANTAY                   🏥 CONFINED    ▲│
│  CASE: 2 DAYS · Day 1 of care               │
│  SERVICES                                    │
│  ✓ Surgery — done (2 hrs 10 min)             │
│    · Dr. Capua · P8,500                      │
│  ⏳ Post-Op Monitoring — overnight           │
│    · P1,200                                  │
│  Your pet is resting comfortably under our   │
│  care. Call us anytime for updates.          │
│                     ◉ ●                      │
│                  Day 1  Day 2  ← swipe →     │
└─────────────────────────────────────────────┘
```

### Pending (pre-arrival — thin card on Dashboard)
```
┌─────────────────────────────────────────────┐
│ 🐶 BANTAY                  ⏳ AWAITING     ▼│
│  Anti tick & flea + Vaccination              │
│  Scheduled: May 12, 2026 · 9:00 AM          │
│  [CONFIRM I'M COMING]                        │
└─────────────────────────────────────────────┘
```

---

## Service Icon System (locked)

| Icon | Meaning | Used on |
|---|---|---|
| ✓ | Completed service | Any card state |
| ⏳ | In progress | Active cards (pet at clinic) |
| ○ | Waiting (will be done) | Active cards |
| ✗ | Not completed (won't be done this visit) | Terminal/carried-over cards |

## Estimated Time Phrasing (locked)

- "waiting · ~25 min" → rejected (sounds like wait time)
- "waiting (~25 min)" → rejected (still vague)
- "waiting · est. duration: 25 min" → rejected (too wordy)
- **"waiting · ~25 min service"** → CHOSEN ("service" clarifies it's service length)

## "prev. day" Detection Method (locked)

- `(appointment.caseDay || 1) > 1` → WRONG (blanket, marks all services on Day 2+)
- **`serviceCompletedAt < scheduledDate`** → CORRECT (timestamp comparison, only marks services actually completed on prior day)

## Vaccine Multi-Dose Series UI (T4.200, locked)

```
CW Vaccine Form:
DOSE NUMBER
[● Dose 1]  [○ Dose 2]  [○ Dose 3]  ← auto-selected
Due Date: Jun 5, 2026  ← auto: today + doseIntervalDays

PetHistoryScreen VACCINES tab:
┌─────────────────────────────────────────────┐
│█ DHPP                                       │
│█ CORE · INCOMPLETE                          │
│█ Series Progress                            │
│█ ● Dose 1 — May 9, 2026 (Dr. Santos)       │
│█ ● Dose 2 — Jun 5, 2026 (Dr. Santos)       │
│█ ○ Dose 3 — due Jul 3, 2026                │
│█ Next: Dose 3 in 12 days                   │
│█ [████ SCHEDULE DOSE 3 ████]               │
└─────────────────────────────────────────────┘

My Stats HEALTH tab:
┌─────────────────────────────────────────────┐
│▓ 🐶 BANTAY                                  │
│▓ DHPP Dose 3 due · ● ● ○ · in 12 days      │
│▓ [████████ BOOK DOSE 3 ████████]            │
└─────────────────────────────────────────────┘

Vaccination Passport PDF:
┌──────────┬────────┬────────────┬───────────┐
│ Dose     │ Date   │ Lot        │ Vet       │
│ Dose 1/3 │ May 9  │ LOT-26-D1  │ Dr.Santos │
│ Dose 2/3 │ Jun 5  │ LOT-26-D2  │ Dr.Santos │
│ Dose 3/3 │  —     │  pending   │     —     │
└──────────┴────────┴────────────┴───────────┘
```
