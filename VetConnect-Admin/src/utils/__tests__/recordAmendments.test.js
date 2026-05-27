import { describe, it, expect } from 'vitest';
import {
  buildSnapshot,
  diffSnapshots,
  deriveKind,
  buildAmendmentUpdate,
} from '../recordAmendments';

// A record-shaped fixture (mirrors the medical_records clinical subset).
const baseRecord = () => ({
  soap: {
    subjective: 'Owner reports itching',
    objectiveNotes: 'Ears erythematous',
    assessment: 'Suspected infection',
    plan: 'Recheck 1 week',
    prognosis: 'Good',
    clientInstructions: 'Keep ears dry',
    recheckIn: '1 Week',
  },
  vitals: { weight: 12.4, temp: 38.9, hr: 88, rr: 20, crt: '<2s', bcs: 5, pain: 1 },
  patientStatus: 'Stable',
  diagnoses: [{ name: 'Ear infection', catalogId: 'dx1', severity: 'mild' }],
  dispensedProducts: [{ name: 'Otibiotic drops', qty: 1, instructions: 'BID' }],
  vaccineAdministrations: [],
  labResults: [],
});

describe('buildSnapshot', () => {
  it('extracts scalar SOAP + vitals fields', () => {
    const s = buildSnapshot(baseRecord());
    expect(s.subjective).toBe('Owner reports itching');
    expect(s.objective).toBe('Ears erythematous');
    expect(s.plan).toBe('Recheck 1 week');
    expect(s.weight).toBe(12.4);
    expect(s.pain).toBe(1);
  });

  it('extracts list fields as arrays', () => {
    const s = buildSnapshot(baseRecord());
    expect(Array.isArray(s.diagnoses)).toBe(true);
    expect(s.diagnoses).toHaveLength(1);
    expect(s.dispensedProducts).toHaveLength(1);
  });

  it('trims string scalars and normalizes Timestamp via toMillis', () => {
    const s = buildSnapshot({ soap: { subjective: '  spaced  ' }, nextVisit: { toMillis: () => 1717000000000 } });
    expect(s.subjective).toBe('spaced');
    expect(s.nextVisit).toBe(1717000000000);
  });

  it('tolerates a missing/empty record', () => {
    expect(() => buildSnapshot(undefined)).not.toThrow();
    const s = buildSnapshot({});
    expect(s.subjective).toBeUndefined();
    expect(s.diagnoses).toEqual([]);
  });
});

describe('diffSnapshots — scalars', () => {
  it('returns empty diff for identical snapshots', () => {
    const r = baseRecord();
    expect(diffSnapshots(buildSnapshot(r), buildSnapshot(r))).toEqual([]);
  });

  it('detects a changed scalar (before→after)', () => {
    const prev = buildSnapshot(baseRecord());
    const next = buildSnapshot({ ...baseRecord(), soap: { ...baseRecord().soap, plan: 'Recheck 3 days' } });
    const d = diffSnapshots(prev, next);
    expect(d).toContainEqual({ fieldKey: 'plan', fieldLabel: 'Plan', changeType: 'changed', before: 'Recheck 1 week', after: 'Recheck 3 days' });
  });

  it('detects an added scalar (empty→value)', () => {
    const prev = buildSnapshot({ soap: {} });
    const next = buildSnapshot({ soap: { prognosis: 'Guarded' } });
    const d = diffSnapshots(prev, next);
    expect(d).toContainEqual({ fieldKey: 'prognosis', fieldLabel: 'Prognosis', changeType: 'added', before: null, after: 'Guarded' });
  });

  it('detects a removed scalar (value→empty)', () => {
    const prev = buildSnapshot({ soap: { clientInstructions: 'Keep dry' } });
    const next = buildSnapshot({ soap: { clientInstructions: '' } });
    const d = diffSnapshots(prev, next);
    expect(d).toContainEqual({ fieldKey: 'clientInstructions', fieldLabel: 'Client Instructions', changeType: 'removed', before: 'Keep dry', after: null });
  });

  it('detects a numeric vital change', () => {
    const prev = buildSnapshot({ vitals: { temp: 38.9 } });
    const next = buildSnapshot({ vitals: { temp: 39.6 } });
    expect(diffSnapshots(prev, next)).toContainEqual({ fieldKey: 'temp', fieldLabel: 'Temperature', changeType: 'changed', before: 38.9, after: 39.6 });
  });

  it('treats a numeric 0 vital as a valid value (not empty)', () => {
    const prev = buildSnapshot({ vitals: { pain: 1 } });
    const next = buildSnapshot({ vitals: { pain: 0 } });
    expect(diffSnapshots(prev, next)).toContainEqual({ fieldKey: 'pain', fieldLabel: 'Pain Score', changeType: 'changed', before: 1, after: 0 });
  });
});

describe('diffSnapshots — lists', () => {
  it('detects an added list item', () => {
    const prev = buildSnapshot(baseRecord());
    const next = buildSnapshot({ ...baseRecord(), diagnoses: [
      { name: 'Ear infection', catalogId: 'dx1', severity: 'mild' },
      { name: 'Ear mites', catalogId: 'dx2' },
    ] });
    expect(diffSnapshots(prev, next)).toContainEqual({ fieldKey: 'diagnoses', fieldLabel: 'Diagnosis', changeType: 'added', before: null, after: 'Ear mites' });
  });

  it('detects a removed list item', () => {
    const prev = buildSnapshot(baseRecord());
    const next = buildSnapshot({ ...baseRecord(), dispensedProducts: [] });
    expect(diffSnapshots(prev, next)).toContainEqual({ fieldKey: 'dispensedProducts', fieldLabel: 'Medication / Product', changeType: 'removed', before: 'Otibiotic drops ×1', after: null });
  });

  it('detects a changed list item via signature (severity)', () => {
    const prev = buildSnapshot(baseRecord());
    const next = buildSnapshot({ ...baseRecord(), diagnoses: [{ name: 'Ear infection', catalogId: 'dx1', severity: 'severe' }] });
    expect(diffSnapshots(prev, next)).toContainEqual({ fieldKey: 'diagnoses', fieldLabel: 'Diagnosis', changeType: 'changed', before: 'Ear infection', after: 'Ear infection' });
  });

  it('detects a changed product via qty signature', () => {
    const prev = buildSnapshot(baseRecord());
    const next = buildSnapshot({ ...baseRecord(), dispensedProducts: [{ name: 'Otibiotic drops', qty: 2, instructions: 'BID' }] });
    expect(diffSnapshots(prev, next)).toContainEqual({ fieldKey: 'dispensedProducts', fieldLabel: 'Medication / Product', changeType: 'changed', before: 'Otibiotic drops ×1', after: 'Otibiotic drops ×2' });
  });

  it('omits unchanged list items', () => {
    const r = baseRecord();
    expect(diffSnapshots(buildSnapshot(r), buildSnapshot(r))).toEqual([]);
  });
});

describe('deriveKind', () => {
  it('all-added → addition', () => {
    expect(deriveKind([{ changeType: 'added' }, { changeType: 'added' }])).toBe('addition');
  });
  it('any changed → correction', () => {
    expect(deriveKind([{ changeType: 'added' }, { changeType: 'changed' }])).toBe('correction');
  });
  it('any removed → correction', () => {
    expect(deriveKind([{ changeType: 'removed' }])).toBe('correction');
  });
  it('empty diff → addition', () => {
    expect(deriveKind([])).toBe('addition');
    expect(deriveKind(undefined)).toBe('addition');
  });
});

describe('buildAmendmentUpdate', () => {
  const meta = { reason: '  Re-examined ears  ', author: { uid: 'v1', name: 'Dr. Cruz' }, now: 1000 };

  it('returns null update when nothing changed', () => {
    const r = baseRecord();
    const res = buildAmendmentUpdate(r, baseRecord(), meta);
    expect(res.update).toBeNull();
    expect(res.diff).toEqual([]);
  });

  it('first revision archives the original baseline + appends entry #1', () => {
    const r = { ...baseRecord(), signedBy: { uid: 'v1', name: 'Dr. Cruz' }, date: 5 };
    const next = { ...baseRecord(), soap: { ...baseRecord().soap, plan: 'Recheck 3 days' } };
    const res = buildAmendmentUpdate(r, next, meta);

    expect(res.update).not.toBeNull();
    expect(res.update.amendments).toHaveLength(2); // original baseline + revision 1
    expect(res.update.amendments[0].kind).toBe('original');
    expect(res.update.amendments[0].signedBy).toEqual({ uid: 'v1', name: 'Dr. Cruz' });
    expect(res.update.amendments[1].revisionNumber).toBe(1);
    expect(res.update.amendments[1].reason).toBe('Re-examined ears'); // trimmed
    expect(res.update.amendments[1].author).toEqual({ uid: 'v1', name: 'Dr. Cruz' });
    expect(res.update.amendments[1].kind).toBe('correction');
    expect(res.update.isAmended).toBe(true);
    expect(res.update.amendmentCount).toBe(1);
    expect(res.update.lastAmendedAt).toBe(1000);
  });

  it('materializes the corrected body fields onto the update', () => {
    const r = baseRecord();
    const next = { ...baseRecord(), soap: { ...baseRecord().soap, plan: 'Recheck 3 days' } };
    const res = buildAmendmentUpdate(r, next, meta);
    expect(res.update.soap.plan).toBe('Recheck 3 days');
  });

  it('second revision appends without a new original baseline', () => {
    const withOne = {
      ...baseRecord(),
      amendments: [
        { kind: 'original', snapshot: {} },
        { kind: 'correction', revisionNumber: 1, diff: [] },
      ],
    };
    const next = { ...baseRecord(), patientStatus: 'Improving' };
    const res = buildAmendmentUpdate(withOne, next, { ...meta, now: 2000 });

    expect(res.update.amendments).toHaveLength(3); // no new baseline
    expect(res.update.amendments.filter((e) => e.kind === 'original')).toHaveLength(1);
    expect(res.update.amendments[2].revisionNumber).toBe(2);
    expect(res.update.amendmentCount).toBe(2);
  });

  it('pure addition entry is tagged addition', () => {
    const r = { soap: { subjective: 'x' } };
    const next = { soap: { subjective: 'x', prognosis: 'Good' } };
    const res = buildAmendmentUpdate(r, next, meta);
    expect(res.kind).toBe('addition');
    expect(res.update.amendments.find((e) => e.kind !== 'original').kind).toBe('addition');
  });
});
