const VITALS_FIELDS = ['weight', 'temp', 'hr', 'rr', 'crt', 'bcs', 'pain'];

export function resolveVitals(record) {
  const base = { ...(record?.vitals || {}) };

  const amendments = record?.amendments;
  if (!Array.isArray(amendments) || amendments.length === 0) return base;

  for (const am of amendments) {
    if (!am.vitals || typeof am.vitals !== 'object') continue;
    for (const field of VITALS_FIELDS) {
      if (am.vitals[field] != null && am.vitals[field] !== '') {
        base[field] = am.vitals[field];
      }
    }
  }

  return base;
}
