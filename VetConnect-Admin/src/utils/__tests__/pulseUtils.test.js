/**
 * pulseUtils.test.js — Unit tests for the VetConnect Clinical Forensic Engine.
 *
 * 49 tests across 6 describe blocks covering all 5 exported functions.
 * The only mock is firebase/firestore Timestamp — all other imports (statusConstants,
 * dateUtils) run as real code because they are tiny pure modules.
 */

// Must be hoisted before any imports that touch firebase/firestore.
vi.mock('firebase/firestore', () => ({
  Timestamp: {
    now: () => ({ seconds: 1700000000, nanoseconds: 0, toDate: () => new Date(1700000000 * 1000) }),
  },
}));

import {
  formatDuration,
  makePulseEventId,
  createPulseEvent,
  getOperationalMinutes,
  calculatePulseMetrics,
  getSmartShiftDate,
} from '../pulseUtils';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const defaultSettings = { openHour: 8, closeHour: 17, workingDays: [0, 1, 2, 3, 4, 5, 6] };

// Wednesday April 15, 2026 (day-of-week = 3)
const wed7am   = new Date(2026, 3, 15,  7,  0,  0);
const wed8am   = new Date(2026, 3, 15,  8,  0,  0);
const wed830am = new Date(2026, 3, 15,  8, 30,  0);
const wed9am   = new Date(2026, 3, 15,  9,  0,  0);
const wed10am  = new Date(2026, 3, 15, 10,  0,  0);
const wed12pm  = new Date(2026, 3, 15, 12,  0,  0);
const wed2pm   = new Date(2026, 3, 15, 14,  0,  0);
const wed3pm   = new Date(2026, 3, 15, 15,  0,  0);
const wed5pm   = new Date(2026, 3, 15, 17,  0,  0);

// Thursday April 16, 2026 (day-of-week = 4)
const thu8am   = new Date(2026, 3, 16,  8,  0,  0);
const thu9am   = new Date(2026, 3, 16,  9,  0,  0);

// Helper: create a pulse event with a plain Date timestamp
const mkEvent = (toStatus, date, extra = {}) => ({
  eventId: `test_${toStatus}_${date.getTime()}`,
  type: 'STATUS_CHANGE',
  toStatus,
  timestamp: date,
  staffId: 'test',
  staffName: 'Test Staff',
  ...extra,
});

// ---------------------------------------------------------------------------
// Phase 2: formatDuration (13 tests)
// ---------------------------------------------------------------------------

describe('formatDuration', () => {
  it('2.1 returns "0M" for zero minutes', () => {
    expect(formatDuration(0)).toBe('0M');
  });

  it('2.2 formats minutes under an hour', () => {
    expect(formatDuration(45)).toBe('45M');
  });

  it('2.3 formats exact hours with no minute remainder', () => {
    expect(formatDuration(120)).toBe('2H');
  });

  it('2.4 formats hours and minutes', () => {
    expect(formatDuration(90)).toBe('1H 30M');
  });

  it('2.5 formats days and hours (1500 mins = 1D 1H)', () => {
    // 1500 / 1440 = 1 day, remainder = 60 min = 1H
    expect(formatDuration(1500)).toBe('1D 1H');
  });

  it('2.6 formats exact days with no hour remainder', () => {
    // 2880 / 1440 = 2, remainder = 0H
    expect(formatDuration(2880)).toBe('2D');
  });

  it('2.7 formats exact weeks', () => {
    expect(formatDuration(10080)).toBe('1W');
  });

  it('2.8 formats months', () => {
    expect(formatDuration(43200)).toBe('1MO');
  });

  it('2.9 formats years with month remainder', () => {
    // 568800 / 525600 = 1Y, remainder = 43200 = 1MO
    expect(formatDuration(568800)).toBe('1Y 1MO');
  });

  it('2.10 returns em-dash for null', () => {
    expect(formatDuration(null)).toBe('—');
  });

  it('2.11 returns em-dash for undefined', () => {
    expect(formatDuration(undefined)).toBe('—');
  });

  it('2.12 returns em-dash for NaN', () => {
    expect(formatDuration(NaN)).toBe('—');
  });

  it('2.13 returns em-dash for negative values and logs a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = formatDuration(-10);
    expect(result).toBe('—');
    expect(warnSpy).toHaveBeenCalledWith(
      '[pulseUtils] formatDuration received negative value:',
      -10,
      '— returning placeholder'
    );
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Phase 3: makePulseEventId (3 tests)
// ---------------------------------------------------------------------------

describe('makePulseEventId', () => {
  it('3.1 returns string matching pulse_{type}_{timestamp}_{random} format', () => {
    const id = makePulseEventId('status');
    expect(id).toMatch(/^pulse_status_\d+_[a-z0-9]{7}$/);
  });

  it('3.2 defaults to "event" when no type is provided', () => {
    const id = makePulseEventId();
    expect(id).toMatch(/^pulse_event_\d+_/);
  });

  it('3.3 produces unique IDs across sequential calls', () => {
    const id1 = makePulseEventId('test');
    const id2 = makePulseEventId('test');
    expect(id1).not.toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// Phase 4: createPulseEvent (5 tests)
// ---------------------------------------------------------------------------

describe('createPulseEvent', () => {
  it('4.1 returns object with required fields: eventId, type, timestamp, staffId, staffName, note', () => {
    const event = createPulseEvent('STATUS_CHANGE');
    expect(event).toHaveProperty('eventId');
    expect(event).toHaveProperty('type');
    expect(event).toHaveProperty('timestamp');
    expect(event).toHaveProperty('staffId');
    expect(event).toHaveProperty('staffName');
    expect(event).toHaveProperty('note');
    // eventId starts with the pulse_ prefix
    expect(event.eventId).toMatch(/^pulse_/);
    // timestamp is the mocked Firestore object
    expect(event.timestamp.seconds).toBe(1700000000);
  });

  it('4.2 uppercases the type parameter', () => {
    const event = createPulseEvent('status_change');
    expect(event.type).toBe('STATUS_CHANGE');
  });

  it('4.3 uses provided staffId and staffName', () => {
    const event = createPulseEvent('STATUS_CHANGE', { staffId: 'doc1', staffName: 'Dr. Smith' });
    expect(event.staffId).toBe('doc1');
    expect(event.staffName).toBe('Dr. Smith');
  });

  it('4.4 defaults staffId to "unknown" and staffName to "System" when not provided', () => {
    const event = createPulseEvent('STATUS_CHANGE', {});
    expect(event.staffId).toBe('unknown');
    expect(event.staffName).toBe('System');
  });

  it('4.5 spreads extra fields into the event object', () => {
    const event = createPulseEvent('SERVICE_STARTED', { serviceId: 'svc-1', customField: 42 });
    expect(event.serviceId).toBe('svc-1');
    expect(event.customField).toBe(42);
  });

  it('4.6 fromStatus and toStatus are absent when not provided', () => {
    const event = createPulseEvent('STATUS_CHANGE', {});
    expect(event).not.toHaveProperty('fromStatus');
    expect(event).not.toHaveProperty('toStatus');
  });
});

// ---------------------------------------------------------------------------
// Phase 5: getOperationalMinutes (8 tests)
// ---------------------------------------------------------------------------

describe('getOperationalMinutes', () => {
  it('5.1 same-day business hours, 2 hours', () => {
    const result = getOperationalMinutes(wed8am, wed10am, defaultSettings);
    expect(result).toBe(120);
  });

  it('5.2 same-day absolute mode, 2 hours', () => {
    const result = getOperationalMinutes(wed8am, wed10am, defaultSettings, false, wed8am, 'absolute');
    expect(result).toBe(120);
  });

  it('5.3 returns 0 when start equals end', () => {
    const result = getOperationalMinutes(wed8am, wed8am, defaultSettings);
    expect(result).toBe(0);
  });

  it('5.4 spans overnight in business mode — all days working', () => {
    // Wed 5pm to Thu 8am: business mode counts all minutes on working days.
    // Wed segment: 5pm to midnight = 7h = 420 min
    // Thu segment: midnight to 8am = 8h = 480 min
    // Total = 900
    const result = getOperationalMinutes(wed5pm, thu8am, defaultSettings);
    expect(result).toBe(900);
  });

  it('5.5 midnight gate caps at day boundary when shouldGate=true', () => {
    // Wed 10am to Thu 8am, but shouldGate=true — stops at Wed midnight.
    // Wed segment: 10am to midnight = 14h = 840 min
    const result = getOperationalMinutes(wed10am, thu8am, defaultSettings, true, wed10am);
    expect(result).toBe(840);
  });

  it('5.6 skips non-working days in business mode', () => {
    // Only Wednesday (day 3) is a working day.
    // Wed 8am to Thu 8am: Thu is skipped → only Wed 8am to midnight = 16h = 960
    const wednesdayOnlySettings = { openHour: 8, closeHour: 17, workingDays: [3] };
    const result = getOperationalMinutes(wed8am, thu8am, wednesdayOnlySettings);
    expect(result).toBe(960);
  });

  it('5.7 absolute mode ignores workingDays filter', () => {
    // Only Wednesday is a working day, but absolute mode counts all wall-clock time.
    // Wed 8am to Thu 8am = 24h = 1440 min in absolute mode.
    const wednesdayOnlySettings = { openHour: 8, closeHour: 17, workingDays: [3] };
    const result = getOperationalMinutes(wed8am, thu8am, wednesdayOnlySettings, false, wed8am, 'absolute');
    expect(result).toBe(1440);
  });

  it('5.8 handles reversed start/end gracefully (returns 0)', () => {
    // while (curr < end) never executes when start > end
    const result = getOperationalMinutes(wed10am, wed8am, defaultSettings);
    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 6: calculatePulseMetrics (15 tests)
// ---------------------------------------------------------------------------

describe('calculatePulseMetrics', () => {
  it('6.1 returns 8-metric shape with display strings and raw object', () => {
    const result = calculatePulseMetrics([], defaultSettings, wed8am, wed8am, wed8am);
    // Display fields
    expect(result).toHaveProperty('recordAge');
    expect(result).toHaveProperty('opHoursAge');
    expect(result).toHaveProperty('shiftQueue');
    expect(result).toHaveProperty('totalQueue');
    expect(result).toHaveProperty('shiftConsult');
    expect(result).toHaveProperty('totalConsult');
    expect(result).toHaveProperty('shiftConfined');
    expect(result).toHaveProperty('totalConfined');
    // Raw numeric object
    expect(result).toHaveProperty('raw');
    expect(result.raw).toHaveProperty('recordAgeMins');
    expect(result.raw).toHaveProperty('opHoursMins');
    expect(result.raw).toHaveProperty('shiftQueue');
    expect(result.raw).toHaveProperty('totalQueue');
    expect(result.raw).toHaveProperty('shiftConsult');
    expect(result.raw).toHaveProperty('totalConsult');
    expect(result.raw).toHaveProperty('shiftConfined');
    expect(result.raw).toHaveProperty('totalConfined');
  });

  it('6.2 empty pulse returns zero for all shift/total metrics', () => {
    const result = calculatePulseMetrics([], defaultSettings, wed8am, wed8am, wed8am);
    expect(result.raw.shiftQueue).toBe(0);
    expect(result.raw.totalQueue).toBe(0);
    expect(result.raw.shiftConsult).toBe(0);
    expect(result.raw.totalConsult).toBe(0);
    expect(result.raw.shiftConfined).toBe(0);
    expect(result.raw.totalConfined).toBe(0);
  });

  it('6.3 single arrived event accumulates 60 min of queue time', () => {
    // arrived@8am, auditEnd=9am → queue for 60 min
    const pulse = [mkEvent('arrived', wed8am)];
    const result = calculatePulseMetrics(pulse, defaultSettings, wed8am, wed8am, wed9am);
    expect(result.raw.totalQueue).toBe(60);
    expect(result.raw.shiftQueue).toBe(60);
  });

  it('6.4 full lifecycle accumulates queue and consult time', () => {
    // arrived@8am → in-consult@8:30 → dispensing@9am → billing@9:30am → completed@10am
    const wed930  = new Date(2026, 3, 15,  9, 30, 0);
    const pulse = [
      mkEvent('arrived',    wed8am),
      mkEvent('in-consult', wed830am),
      mkEvent('dispensing', wed9am),
      mkEvent('billing',    wed930),
      mkEvent('completed',  wed10am),
    ];
    const result = calculatePulseMetrics(pulse, defaultSettings, wed8am, wed8am);
    // arrived → in-consult = 30 min queue
    expect(result.raw.totalQueue).toBe(30);
    // in-consult + dispensing + billing = 30+30+30 = 90 min consult
    expect(result.raw.totalConsult).toBe(90);
    // No confined activity
    expect(result.raw.totalConfined).toBe(0);
  });

  it('6.5 terminal status freezes the clock at the discharge anchor', () => {
    // completed@12pm. Even though auditEnd=3pm, clock should freeze at 12pm.
    // recordAgeMins = (12pm - 8am) = 240 min
    const pulse = [
      mkEvent('arrived',   wed8am),
      mkEvent('in-consult', wed9am),
      mkEvent('completed', wed12pm),
    ];
    const result = calculatePulseMetrics(pulse, defaultSettings, wed8am, wed8am, wed3pm);
    expect(result.raw.recordAgeMins).toBe(240); // 8am to 12pm = 4h = 240 min
  });

  it('6.6 non-terminal record uses auditEnd as clock endpoint', () => {
    // in-consult still active, auditEnd=2pm → recordAgeMins = (2pm - 8am) = 360
    const pulse = [
      mkEvent('arrived',    wed8am),
      mkEvent('in-consult', wed9am),
    ];
    const result = calculatePulseMetrics(pulse, defaultSettings, wed8am, wed8am, wed2pm);
    expect(result.raw.recordAgeMins).toBe(360); // 8am to 2pm = 6h = 360 min
  });

  it('6.7 non-terminal record with no auditEnd uses current time (recordAgeMins > 0)', () => {
    // No auditEnd, no terminal event → falls back to new Date()
    // We just assert recordAgeMins is positive (we cannot know exact current time)
    const pulse = [mkEvent('arrived', wed8am)];
    const result = calculatePulseMetrics(pulse, defaultSettings, wed8am, wed8am);
    expect(result.raw.recordAgeMins).toBeGreaterThan(0);
  });

  it('6.8 voided events are skipped via correctedEventId (DNA-link correction)', () => {
    // arrived@8am (eventId: 'test_arrived_...')
    // in-consult@9am (eventId: 'evt-2') — will be voided
    // CORRECTION@9:05am with correctedEventId='evt-2'
    // With evt-2 voided, the in-consult segment uses lastValidStatus='arrived'.
    // So the 9am-onwards segment counts as queue, not consult.
    const wed905 = new Date(2026, 3, 15, 9, 5, 0);
    const pulse = [
      mkEvent('arrived',    wed8am,  { eventId: 'evt-1' }),
      mkEvent('in-consult', wed9am,  { eventId: 'evt-2' }),
      // A correction event that voids evt-2; its own toStatus is irrelevant
      mkEvent('arrived',    wed905,  { eventId: 'evt-3', correctedEventId: 'evt-2' }),
    ];
    const result = calculatePulseMetrics(pulse, defaultSettings, wed8am, wed8am, wed10am);
    // Because evt-2 is voided and the correction's status also becomes 'arrived'
    // (via lastValidStatus), all time should count as queue
    expect(result.raw.totalConsult).toBe(0);
    expect(result.raw.totalQueue).toBeGreaterThan(0);
  });

  it('6.9 confined status uses absolute clock mode regardless of workingDays', () => {
    // Only Wednesday is a working day.
    // arrived@Wed9am, confined@Wed10am, auditEnd=Thu10am (24h later)
    // confined segment = Wed10am → Thu10am = 1440 min (absolute, ignores workingDays)
    const wednesdayOnlySettings = { openHour: 8, closeHour: 17, workingDays: [3] };
    const pulse = [
      mkEvent('arrived',  wed9am),
      mkEvent('confined', wed10am),
    ];
    const result = calculatePulseMetrics(pulse, wednesdayOnlySettings, wed9am, wed9am, thu9am);
    // 23 hours of confined time (Wed 10am to Thu 9am = 23h = 1380 min absolute)
    expect(result.raw.totalConfined).toBe(1380);
  });

  it('6.10 shift overlap only counts time within targetDate for shiftQueue', () => {
    // arrived@Wed8am, in-consult@Thu8am.
    // targetDate = Wed → shiftQueue counts only Wed portion (8am to midnight = 16h = 960)
    // totalQueue counts full Wed (8am to midnight = 960) since Thursday is a different day
    const pulse = [
      mkEvent('arrived', wed8am),
      mkEvent('in-consult', thu8am),
    ];
    const result = calculatePulseMetrics(pulse, defaultSettings, wed8am, wed8am, thu9am);
    // The arrived segment runs from Wed8am to Thu8am (business mode, 2 days) = 24h = 1440
    expect(result.raw.totalQueue).toBe(1440);
    // shiftQueue only includes Wed portion: Wed 8am to end of Wed = 16h = 960
    expect(result.raw.shiftQueue).toBe(960);
    expect(result.raw.shiftQueue).toBeLessThan(result.raw.totalQueue);
  });

  it('6.11 out-of-order pulse events are sorted by timestamp', () => {
    // Add events in reverse chronological order
    const pulseReversed = [
      mkEvent('in-consult', wed9am),
      mkEvent('arrived',    wed8am),
    ];
    const pulseSorted = [
      mkEvent('arrived',    wed8am),
      mkEvent('in-consult', wed9am),
    ];
    const r1 = calculatePulseMetrics(pulseReversed, defaultSettings, wed8am, wed8am, wed10am);
    const r2 = calculatePulseMetrics(pulseSorted,   defaultSettings, wed8am, wed8am, wed10am);
    expect(r1.raw.totalQueue).toBe(r2.raw.totalQueue);
    expect(r1.raw.totalConsult).toBe(r2.raw.totalConsult);
  });

  it('6.12 events with Firestore-like timestamp objects (.toDate method) are handled', () => {
    // Wrap dates in objects with .toDate() — simulating Firestore Timestamp shape
    const fsTs = (d) => ({ toDate: () => d });
    const pulse = [
      { ...mkEvent('arrived', wed8am), timestamp: fsTs(wed8am) },
      { ...mkEvent('in-consult', wed9am), timestamp: fsTs(wed9am) },
    ];
    const auditEndFs = wed10am;
    const result = calculatePulseMetrics(pulse, defaultSettings, wed8am, wed8am, auditEndFs);
    // arrived@8am → in-consult@9am = 60 min queue; in-consult@9am → 10am = 60 min consult
    expect(result.raw.totalQueue).toBe(60);
    expect(result.raw.totalConsult).toBe(60);
  });

  it('6.13 createdAt with .toDate method is handled', () => {
    // createdAt as Firestore Timestamp-like object
    const fsCreatedAt = { toDate: () => wed7am };
    const result = calculatePulseMetrics([], defaultSettings, fsCreatedAt, wed8am, wed8am);
    // recordAgeMins = (wed8am - wed7am) = 60 min
    expect(result.raw.recordAgeMins).toBe(60);
  });

  it('6.14 ghost gating caps abandoned queue segments at day boundary', () => {
    // arrived@Wed10am with NO subsequent event.
    // auditEnd = Thu8am (different day than startTime).
    // isGhostSegment = true → shouldGate caps at Wed midnight.
    // Wed10am to midnight = 14h = 840 min (business mode, all days working)
    const pulse = [mkEvent('arrived', wed10am)];
    const result = calculatePulseMetrics(pulse, defaultSettings, wed10am, wed8am, thu8am);
    // Ghost-gated: only Wed10am to midnight counts, not all the way to Thu8am
    expect(result.raw.totalQueue).toBe(840);
  });

  it('6.15 on-hold status accumulates as consult time', () => {
    // arrived@8am → on-hold@9am. on-hold is in CONSULT_STATES.
    const pulse = [
      mkEvent('arrived', wed8am),
      mkEvent('on-hold', wed9am),
    ];
    const result = calculatePulseMetrics(pulse, defaultSettings, wed8am, wed8am, wed10am);
    expect(result.raw.totalQueue).toBe(60);   // arrived@8am → on-hold@9am = 60min queue
    expect(result.raw.totalConsult).toBe(60); // on-hold@9am → auditEnd@10am = 60min consult
  });
});

// ---------------------------------------------------------------------------
// Phase 7: getSmartShiftDate (5 tests)
// ---------------------------------------------------------------------------

describe('getSmartShiftDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('7.1 afternoon: offset 0 returns tomorrow with label "TOMO"', () => {
    // Pin clock to Wed April 15, 2026 at 2pm
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 15, 14, 0, 0));

    const { dateStr, label } = getSmartShiftDate(0, 8);

    // anchor = Wed (2pm >= 8am so isEarlyMorning=false). offset 0 adds 1 → Thu
    const expected = new Date(2026, 3, 16); // Thu April 16
    const expectedStr = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`;
    expect(dateStr).toBe(expectedStr);
    expect(label).toBe('TOMO');
  });

  it('7.2 afternoon: offset 1 returns day-after-tomorrow with label "+2D"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 15, 14, 0, 0));

    const { dateStr, label } = getSmartShiftDate(1, 8);

    // anchor = Wed, offset 1 adds 2 days → Fri April 17
    const expected = new Date(2026, 3, 17);
    const expectedStr = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`;
    expect(dateStr).toBe(expectedStr);
    expect(label).toBe('+2D');
  });

  it('7.3 afternoon: offset 2 returns +7 days with label "+1W"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 15, 14, 0, 0));

    const { dateStr, label } = getSmartShiftDate(2, 8);

    // anchor = Wed, offset 2 adds 7 days → Wed April 22
    const expected = new Date(2026, 3, 22);
    const expectedStr = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`;
    expect(dateStr).toBe(expectedStr);
    expect(label).toBe('+1W');
  });

  it('7.4 early morning (before openHour): anchor shifts back one day, offset 0 returns today with label "TODAY"', () => {
    // Thu 3am. isEarlyMorning=true. anchor shifts back to Wed.
    // offset 0 adds 1 day → Thu. "today" is also Thu → label "TODAY"
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 16, 3, 0, 0)); // Thu April 16 at 3am

    const { dateStr, label } = getSmartShiftDate(0, 8);

    // Expected dateStr = Thu April 16
    const expected = new Date(2026, 3, 16);
    const expectedStr = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`;
    expect(dateStr).toBe(expectedStr);
    expect(label).toBe('TODAY');
  });

  it('7.5 custom openHour affects early-morning threshold (offset 0 returns today)', () => {
    // Wed 11am, openHour=12. currentHour(11) < openHour(12) → isEarlyMorning=true.
    // anchor = Tue April 14. offset 0 adds 1 → Wed April 15.
    // "today" is also Wed April 15 → label "TODAY"
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 15, 11, 0, 0)); // Wed April 15 at 11am

    const { dateStr, label } = getSmartShiftDate(0, 12);

    const expected = new Date(2026, 3, 15);
    const expectedStr = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`;
    expect(dateStr).toBe(expectedStr);
    expect(label).toBe('TODAY');
  });
});
