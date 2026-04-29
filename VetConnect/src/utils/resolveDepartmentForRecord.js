/**
 * Resolves the department name for a medical record.
 *
 * Strategy (in priority order):
 * 1. If the record has serviceNames[], find the first service name that
 *    case-insensitively includes a department name. This handles modern
 *    records written with multi-service support.
 * 2. If the record has serviceType, match it against department names
 *    using case-insensitive includes().
 * 3. Legacy normalizer: recordType 'medical' -> first department whose
 *    name contains 'vet', 'med', or 'clinical'; recordType 'grooming'
 *    -> first department whose name contains 'groom' or 'spa'.
 * 4. Fallback: return first department name, or 'General' if none.
 *
 * @param {object} record      - Firestore medical_record document
 * @param {Array}  departments - Array of department docs with { id, name, color }
 * @returns {string} Department name the record belongs to
 */
const LEGACY_MAP = [
  { recordType: 'medical',  keywords: ['vet', 'med', 'clinical'] },
  { recordType: 'grooming', keywords: ['groom', 'spa'] },
];

export function resolveDepartmentForRecord(record, departments) {
  if (!departments?.length) return record.recordType || 'medical';
  const deptNames = departments.map(d => d.name);

  // 1. serviceNames array (modern records with multi-service support)
  if (record.serviceNames?.length) {
    for (const svcName of record.serviceNames) {
      const sLower = svcName.toLowerCase();
      const match = deptNames.find(dn => sLower.includes(dn.toLowerCase()));
      if (match) return match;
    }
  }

  // 2. serviceType string (single-service records)
  if (record.serviceType) {
    const stLower = record.serviceType.toLowerCase();
    const match = deptNames.find(dn => stLower.includes(dn.toLowerCase()));
    if (match) return match;
  }

  // 3. Legacy recordType normalizer — ClinicalWorkspace writes 'medical' on every
  //    record regardless of department; this maps to the correct department via keywords.
  const rt = (record.recordType || 'medical').toLowerCase();
  const legacyEntry = LEGACY_MAP.find(lm => lm.recordType === rt);
  if (legacyEntry) {
    const match = deptNames.find(dn => {
      const dnLower = dn.toLowerCase();
      return legacyEntry.keywords.some(kw => dnLower.includes(kw));
    });
    if (match) return match;
  }

  // 4. Fallback: first department (most clinics have vet medicine first)
  return deptNames[0] || 'General';
}
