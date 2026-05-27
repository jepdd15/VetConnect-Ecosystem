import { describe, it, expect } from 'vitest';
import {
  CHANGE_META,
  isOriginalEntry,
  isNewEntry,
  isLegacyEntry,
  tsToMillis,
  entryMillis,
  amendmentAuthorName,
  kindChipLabel,
  formatDiffValue,
  classifyAmendments,
  snapshotSummary,
} from '../amendmentDisplay';

const newEntry = (over = {}) => ({
  revisionNumber: 1,
  kind: 'correction',
  reason: 'Re-examined ears',
  author: { uid: 'u1', name: 'Dr. Cruz' },
  timestamp: { seconds: 2000, toMillis: () => 2000 * 1000 },
  diff: [{ fieldKey: 'diagnoses', fieldLabel: 'Diagnosis', changeType: 'changed', before: 'Ear infection', after: 'Otitis externa' }],
  snapshot: {},
  ...over,
});

const originalEntry = (over = {}) => ({
  kind: 'original',
  snapshot: { diagnoses: [{ name: 'Ear infection' }], plan: 'recheck 1 week' },
  signedBy: { uid: 'u1', name: 'Dr. Cruz' },
  lockedAt: { seconds: 1000, toMillis: () => 1000 * 1000 },
  ...over,
});

const legacyEntry = (over = {}) => ({
  reason: 'Added note',
  soap: { subjective: 'extra note' },
  type: 'structured',
  by: 'Old Vet',
  timestamp: { seconds: 1500, toMillis: () => 1500 * 1000 },
  ...over,
});

describe('amendmentDisplay — entry shape detection', () => {
  it('classifies original, new, and legacy entries by shape', () => {
    expect(isOriginalEntry(originalEntry())).toBe(true);
    expect(isNewEntry(originalEntry())).toBe(false);

    expect(isNewEntry(newEntry())).toBe(true);
    expect(isOriginalEntry(newEntry())).toBe(false);
    expect(isLegacyEntry(newEntry())).toBe(false);

    expect(isLegacyEntry(legacyEntry())).toBe(true);
    expect(isNewEntry(legacyEntry())).toBe(false);
  });

  it('treats a new entry with an empty diff array as new (not legacy)', () => {
    expect(isNewEntry({ revisionNumber: 2, diff: [] })).toBe(true);
    expect(isNewEntry({ revisionNumber: 3 })).toBe(true); // diff omitted but revisionNumber present
  });

  it('guards against null/undefined entries', () => {
    expect(isOriginalEntry(null)).toBe(false);
    expect(isNewEntry(undefined)).toBe(false);
    expect(isLegacyEntry(null)).toBe(false);
  });
});

describe('amendmentDisplay — timestamps', () => {
  it('normalizes Timestamp, {seconds}, millis, Date, and ISO string to millis', () => {
    expect(tsToMillis({ toMillis: () => 5000 })).toBe(5000);
    expect(tsToMillis({ seconds: 7 })).toBe(7000);
    expect(tsToMillis(1234)).toBe(1234);
    expect(tsToMillis(new Date(0))).toBe(0);
    expect(tsToMillis('2026-01-01T00:00:00Z')).toBe(Date.parse('2026-01-01T00:00:00Z'));
    expect(tsToMillis(null)).toBe(0);
    expect(tsToMillis('not-a-date')).toBe(0);
  });

  it('reads timestamp for revisions and lockedAt for the original baseline', () => {
    expect(entryMillis(newEntry())).toBe(2000 * 1000);
    expect(entryMillis(originalEntry())).toBe(1000 * 1000);
  });
});

describe('amendmentDisplay — author name', () => {
  it('reads author.name for new entries (the field the legacy renderer missed)', () => {
    expect(amendmentAuthorName(newEntry())).toBe('Dr. Cruz');
  });
  it('falls back across by / vetName / signedBy / default', () => {
    expect(amendmentAuthorName(legacyEntry())).toBe('Old Vet');
    expect(amendmentAuthorName({ vetName: 'Dr. Reyes' })).toBe('Dr. Reyes');
    expect(amendmentAuthorName(originalEntry())).toBe('Dr. Cruz');
    expect(amendmentAuthorName({ signedBy: 'Plain Name' })).toBe('Plain Name');
    expect(amendmentAuthorName({})).toBe('Clinician');
    expect(amendmentAuthorName(null)).toBe('Clinician');
  });
});

describe('amendmentDisplay — kind chip', () => {
  it('returns ADDITION/CORRECTION only for new entries', () => {
    expect(kindChipLabel(newEntry({ kind: 'addition' }))).toBe('ADDITION');
    expect(kindChipLabel(newEntry({ kind: 'correction' }))).toBe('CORRECTION');
    expect(kindChipLabel(legacyEntry())).toBeNull();
    expect(kindChipLabel(originalEntry())).toBeNull();
  });
});

describe('amendmentDisplay — formatDiffValue', () => {
  it('renders blanks as an em dash', () => {
    expect(formatDiffValue('plan', null)).toBe('—');
    expect(formatDiffValue('plan', '')).toBe('—');
  });
  it('formats date fields (stored as millis) to a readable date', () => {
    const ms = new Date(2026, 0, 15).getTime();
    expect(formatDiffValue('nextVisit', ms)).toMatch(/Jan 15, 2026/);
  });
  it('passes through ordinary scalar values', () => {
    expect(formatDiffValue('weight', 12.4)).toBe('12.4');
    expect(formatDiffValue('plan', 'Recheck 1 week')).toBe('Recheck 1 week');
  });
  it('CHANGE_META covers all three change types', () => {
    expect(CHANGE_META.added.tone).toBe('added');
    expect(CHANGE_META.changed.symbol).toBe('✎');
    expect(CHANGE_META.removed.label).toBe('Removed');
  });
});

describe('amendmentDisplay — classifyAmendments', () => {
  it('splits original from trail and sorts trail newest-first', () => {
    const amendments = [
      originalEntry(),                                  // lockedAt 1000s
      legacyEntry({ timestamp: { seconds: 1500 } }),    // 1500s
      newEntry({ revisionNumber: 2, timestamp: { seconds: 3000 } }), // 3000s
      newEntry({ revisionNumber: 1, timestamp: { seconds: 2000 } }), // 2000s
    ];
    const { original, trail, count } = classifyAmendments(amendments);
    expect(isOriginalEntry(original)).toBe(true);
    expect(count).toBe(3); // excludes the original baseline
    // newest-first: 3000 → 2000 → 1500
    expect(trail.map((e) => entryMillis(e))).toEqual([3000000, 2000000, 1500000]);
  });

  it('handles a legacy-only record (no original baseline): count = all entries', () => {
    const { original, count } = classifyAmendments([legacyEntry(), legacyEntry()]);
    expect(original).toBeNull();
    expect(count).toBe(2);
  });

  it('handles empty / missing input', () => {
    expect(classifyAmendments(undefined)).toEqual({ original: null, trail: [], count: 0 });
    expect(classifyAmendments([])).toEqual({ original: null, trail: [], count: 0 });
  });
});

describe('amendmentDisplay — snapshotSummary', () => {
  it('summarizes diagnosis / assessment / plan from a snapshot', () => {
    const summary = snapshotSummary({
      diagnoses: [{ name: 'Ear infection' }, { name: 'Dermatitis' }],
      assessment: 'Worsening',
      plan: 'recheck 1 week',
    });
    expect(summary).toEqual([
      { label: 'Diagnosis', value: 'Ear infection, Dermatitis' },
      { label: 'Assessment', value: 'Worsening' },
      { label: 'Plan', value: 'recheck 1 week' },
    ]);
  });
  it('omits empty fields and guards null', () => {
    expect(snapshotSummary({ plan: 'x' })).toEqual([{ label: 'Plan', value: 'x' }]);
    expect(snapshotSummary(null)).toEqual([]);
  });
});
