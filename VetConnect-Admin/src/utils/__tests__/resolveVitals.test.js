import { describe, it, expect } from 'vitest';
import { resolveVitals } from '../resolveVitals';

describe('resolveVitals — base behavior', () => {
  it('returns the body vitals when there are no amendments', () => {
    expect(resolveVitals({ vitals: { weight: 10, temp: 38 } })).toEqual({ weight: 10, temp: 38 });
  });
  it('guards null/empty records', () => {
    expect(resolveVitals(null)).toEqual({});
    expect(resolveVitals({})).toEqual({});
    expect(resolveVitals({ vitals: { hr: 80 }, amendments: [] })).toEqual({ hr: 80 });
  });
});

describe('resolveVitals — legacy overlay (no write-time revision)', () => {
  it('overlays legacy amendment vitals onto the body (old dialog did not materialize the body)', () => {
    const rec = {
      vitals: { weight: 10, temp: 38 },
      amendments: [{ type: 'structured', vitals: { weight: 11 } }],
    };
    expect(resolveVitals(rec)).toEqual({ weight: 11, temp: 38 });
  });
  it('applies later legacy entries last (cumulative overlay)', () => {
    const rec = {
      vitals: { weight: 10 },
      amendments: [
        { type: 'structured', vitals: { weight: 11 } },
        { type: 'structured', vitals: { weight: 12 } },
      ],
    };
    expect(resolveVitals(rec).weight).toBe(12);
  });
  it('ignores empty-string legacy vitals fields', () => {
    const rec = { vitals: { weight: 10 }, amendments: [{ type: 'structured', vitals: { weight: '' } }] };
    expect(resolveVitals(rec).weight).toBe(10);
  });
});

describe('resolveVitals — T4.243 write-time materialize trumps the overlay', () => {
  it('trusts the body when a new-shape revision entry exists (diff[])', () => {
    const rec = {
      vitals: { weight: 12 }, // already materialized to current
      amendments: [{ revisionNumber: 1, kind: 'correction', diff: [{ fieldKey: 'weight' }] }],
    };
    expect(resolveVitals(rec)).toEqual({ weight: 12 });
  });

  it('trusts the body when isAmended is set', () => {
    const rec = { vitals: { weight: 12 }, isAmended: true, amendments: [{ revisionNumber: 1, diff: [] }] };
    expect(resolveVitals(rec)).toEqual({ weight: 12 });
  });

  it('does NOT let a stale legacy entry clobber the materialized body on a MIXED record', () => {
    const rec = {
      vitals: { weight: 12 }, // current (materialized by the write-time revision)
      amendments: [
        { type: 'structured', vitals: { weight: 9 } },          // old legacy entry
        { revisionNumber: 1, kind: 'correction', diff: [{ fieldKey: 'weight' }] }, // newer write-time revision
      ],
    };
    // legacy overlay is suppressed → body wins
    expect(resolveVitals(rec).weight).toBe(12);
  });
});
