import { describe, it, expect } from 'vitest';
import { serviceRequiresSOAP, isNonClinicalVisit } from '../visitClassification';

// Live catalog fixture
const CATALOG = [
  { id: 'svc-consult', name: 'Consultation', requiresSOAP: true },
  { id: 'svc-vax', name: 'Vaccination', requiresSOAP: true },
  { id: 'svc-groom', name: 'Full Grooming Package', requiresSOAP: false },
  { id: 'svc-nail', name: 'Nail Trim', requiresSOAP: false },
  { id: 'svc-board', name: 'Boarding' }, // missing flag → treated clinical (default true)
];

describe('serviceRequiresSOAP — per-service resolution', () => {
  it('honors an explicit snapshot flag over the catalog', () => {
    expect(serviceRequiresSOAP({ id: 'svc-consult', requiresSOAP: false }, CATALOG)).toBe(false);
    expect(serviceRequiresSOAP({ id: 'svc-groom', requiresSOAP: true }, CATALOG)).toBe(true);
  });

  it('resolves a clinical service from the catalog by id', () => {
    expect(serviceRequiresSOAP({ id: 'svc-consult', name: 'Consultation' }, CATALOG)).toBe(true);
  });

  it('resolves a non-clinical service from the catalog by id', () => {
    expect(serviceRequiresSOAP({ id: 'svc-groom', name: 'Full Grooming Package' }, CATALOG)).toBe(false);
  });

  it('falls back to case-insensitive name match when id differs', () => {
    expect(serviceRequiresSOAP({ id: 'stale-id', name: 'full grooming package' }, CATALOG)).toBe(false);
    expect(serviceRequiresSOAP({ id: 'stale-id', name: '  Consultation  ' }, CATALOG)).toBe(true);
  });

  it('SAFETY: treats a catalog service with a missing flag as clinical', () => {
    expect(serviceRequiresSOAP({ id: 'svc-board', name: 'Boarding' }, CATALOG)).toBe(true);
  });

  it('SAFETY: treats an unmatched service as clinical', () => {
    expect(serviceRequiresSOAP({ id: 'unknown', name: 'Mystery Service' }, CATALOG)).toBe(true);
  });

  it('SAFETY: treats a null/undefined service or empty catalog as clinical', () => {
    expect(serviceRequiresSOAP(null, CATALOG)).toBe(true);
    expect(serviceRequiresSOAP(undefined, CATALOG)).toBe(true);
    expect(serviceRequiresSOAP({ id: 'svc-groom' }, [])).toBe(true); // no catalog → unmatched → clinical
    expect(serviceRequiresSOAP({ id: 'svc-groom' }, null)).toBe(true);
  });
});

describe('isNonClinicalVisit — visit-level gate', () => {
  it('is true only when ALL services are non-clinical', () => {
    expect(isNonClinicalVisit([{ id: 'svc-groom' }, { id: 'svc-nail' }], CATALOG)).toBe(true);
  });

  it('SAFETY: is false for a mixed visit (any clinical service present)', () => {
    expect(isNonClinicalVisit([{ id: 'svc-groom' }, { id: 'svc-consult' }], CATALOG)).toBe(false);
    expect(isNonClinicalVisit([{ id: 'svc-consult' }, { id: 'svc-nail' }], CATALOG)).toBe(false);
  });

  it('SAFETY: is false for an all-clinical visit', () => {
    expect(isNonClinicalVisit([{ id: 'svc-consult' }, { id: 'svc-vax' }], CATALOG)).toBe(false);
  });

  it('SAFETY: is false for an empty / null / non-array services list', () => {
    expect(isNonClinicalVisit([], CATALOG)).toBe(false);
    expect(isNonClinicalVisit(null, CATALOG)).toBe(false);
    expect(isNonClinicalVisit(undefined, CATALOG)).toBe(false);
    expect(isNonClinicalVisit('grooming', CATALOG)).toBe(false);
  });

  it('SAFETY: a single unmatched service makes the visit clinical', () => {
    expect(isNonClinicalVisit([{ id: 'svc-groom' }, { id: 'unknown' }], CATALOG)).toBe(false);
  });

  it('SAFETY: a service with a missing catalog flag (Boarding) keeps the visit clinical', () => {
    expect(isNonClinicalVisit([{ id: 'svc-groom' }, { id: 'svc-board' }], CATALOG)).toBe(false);
  });

  it('honors snapshot flags for a fully non-clinical visit even without a catalog', () => {
    expect(isNonClinicalVisit([{ requiresSOAP: false }, { requiresSOAP: false }], [])).toBe(true);
  });

  it('SAFETY: empty catalog with no snapshot flags → clinical (unmatched)', () => {
    expect(isNonClinicalVisit([{ id: 'svc-groom' }, { id: 'svc-nail' }], [])).toBe(false);
  });
});
