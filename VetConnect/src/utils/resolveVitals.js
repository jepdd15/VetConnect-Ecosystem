const VITALS_FIELDS = ['weight', 'temp', 'hr', 'rr', 'crt', 'bcs', 'pain'];

export function resolveVitals(record) {
  const base = { ...(record?.vitals || {}) };

  const amendments = record?.amendments;
  if (!Array.isArray(amendments) || amendments.length === 0) return base;

  // T4.243: write-time amendments materialize corrected vitals onto record.vitals, so the body
  // IS current — return it as-is. Overlaying here would let a stale legacy entry clobber a newer
  // materialized value on a record that carries BOTH a legacy entry and a write-time revision.
  // Detect a write-time revision by the new entry shape (diff[]/revisionNumber) or isAmended.
  const hasWriteTimeRevision =
    record?.isAmended === true ||
    amendments.some((a) => Array.isArray(a?.diff) || a?.revisionNumber != null);
  if (hasWriteTimeRevision) return base;

  // Legacy-only record: the retired AmendmentDialog appended vitals to amendments[] WITHOUT
  // updating the body, so overlay the legacy amendment vitals (read-time resolution).
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
