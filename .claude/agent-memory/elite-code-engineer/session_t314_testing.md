---
name: T3.14 Testing Foundation Session
description: First test suite in the project — 50 vitest unit tests for pulseUtils.js forensic engine, all passing on first run
type: project
---

T3.14 is DONE. Vitest framework bootstrapped and 50 unit tests written for `pulseUtils.js`.

**Why:** First and only test suite in the VetConnect project; covers the Clinical Forensic Engine that drives every duration metric in Queue, ClinicalWorkspace, EndOfDayModal, ForensicMetricGrid, and Records.

**How to apply:** When touching pulseUtils.js in future tasks, run `npm test` from `VetConnect-Admin/` to verify no regressions. The test file is the source of truth for the engine's exact arithmetic behavior.

## What was set up

- `vitest` installed as devDependency (`"vitest": "^4.1.5"`)
- `vite.config.js` — added `test: { globals: true, environment: 'node', include: ['src/**/*.test.{js,jsx}'] }`
- `package.json` — added `"test": "vitest run"` and `"test:watch": "vitest"` scripts
- `eslint.config.js` — added scoped test-globals block for `describe/it/expect/vi/beforeEach/afterEach/beforeAll/afterAll`
- `src/utils/__tests__/pulseUtils.test.js` — 50 tests, 0 failures

## Test breakdown

| Describe block | Tests | Notes |
|---|---|---|
| formatDuration | 13 | All edge cases: 0, null, NaN, negative, Y/MO/W/D/H/M boundaries |
| makePulseEventId | 3 | Regex format, default type, uniqueness |
| createPulseEvent | 6 | Shape, uppercase type, staffId defaults, extra field spread, fromStatus/toStatus absent |
| getOperationalMinutes | 8 | Same-day, overnight, gate, workingDays filter, absolute mode, reversed |
| calculatePulseMetrics | 15 | Shape, empty, queue/consult/confined accumulation, discharge anchor, auditEnd fallback, voided events, ghost gating, shift overlap, sort, .toDate duck-typing |
| getSmartShiftDate | 5 | Fake timers for each: afternoon TOMO, +2D, +1W, early-morning TODAY, custom openHour |

## Key mock

`vi.mock('firebase/firestore', ...)` stubs `Timestamp.now()` returning `{ seconds: 1700000000, nanoseconds: 0, toDate: () => new Date(1700000000000) }`. All other imports (statusConstants, dateUtils) run as real code.

## Behavioral notes captured in tests

- `getOperationalMinutes` in business mode does NOT clip to openHour/closeHour — it counts all minutes on working days from event time. `openHour` is used only by `getSmartShiftDate` for the shift anchor, not for operational minute clipping.
- Ghost gating (`shouldGate=true`) applies when `startTime.toDateString() !== now.toDateString()` for open-ended QUEUE or CONSULT segments.
- Confined segments always use `absolute` clock mode, ignoring `workingDays`.
