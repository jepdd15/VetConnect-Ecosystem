import { describe, it, expect } from 'vitest';
import { cycleServiceStatus, buildServiceList } from '../serviceProgressWriter';

describe('cycleServiceStatus — progression', () => {
  it('advances pending → in-progress', () => {
    expect(cycleServiceStatus('pending')).toBe('in-progress');
  });
  it('advances in-progress → completed', () => {
    expect(cycleServiceStatus('in-progress')).toBe('completed');
  });
  it('keeps completed terminal', () => {
    expect(cycleServiceStatus('completed')).toBe('completed');
  });
  it('treats undefined/unknown as pending → in-progress', () => {
    expect(cycleServiceStatus(undefined)).toBe('in-progress');
    expect(cycleServiceStatus(null)).toBe('in-progress');
    expect(cycleServiceStatus('weird')).toBe('in-progress');
  });
});

describe('buildServiceList — per-service update', () => {
  const NOW = { __ts: 123 };
  const base = () => [
    { id: 'a', name: 'Grooming' },
    { id: 'b', name: 'Nail Trim', serviceStatus: 'completed' },
  ];

  it('sets the target to in-progress and stamps serviceStartedAt only', () => {
    const out = buildServiceList(base(), 'a', 'in-progress', NOW);
    const a = out.find((s) => s.id === 'a');
    expect(a.serviceStatus).toBe('in-progress');
    expect(a.serviceStartedAt).toBe(NOW);
    expect(a.serviceCompletedAt).toBeUndefined();
  });

  it('sets the target to completed and stamps serviceCompletedAt only', () => {
    const out = buildServiceList(base(), 'a', 'completed', NOW);
    const a = out.find((s) => s.id === 'a');
    expect(a.serviceStatus).toBe('completed');
    expect(a.serviceCompletedAt).toBe(NOW);
    expect(a.serviceStartedAt).toBeUndefined();
  });

  it('preserves other services and normalizes missing status to pending', () => {
    const out = buildServiceList(base(), 'a', 'completed', NOW);
    const b = out.find((s) => s.id === 'b');
    expect(b.serviceStatus).toBe('completed'); // untouched, preserved
    // the target 'a' had no prior status → normalized only via the target branch
    const a2 = buildServiceList([{ id: 'a', name: 'X' }], 'zzz', 'completed', NOW)[0];
    expect(a2.serviceStatus).toBe('pending'); // non-target with missing status normalized
  });

  it('does not mutate the input array or objects', () => {
    const input = base();
    const snapshot = JSON.stringify(input);
    buildServiceList(input, 'a', 'completed', NOW);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('guards empty/missing services', () => {
    expect(buildServiceList(undefined, 'a', 'completed', NOW)).toEqual([]);
    expect(buildServiceList([], 'a', 'completed', NOW)).toEqual([]);
  });
});
