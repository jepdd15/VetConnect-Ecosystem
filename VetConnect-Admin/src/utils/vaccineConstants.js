/**
 * Canonical vaccine catalog. Each entry carries a stable `id` for matching
 * across records (T2.478), species targeting for form filtering (T2.477),
 * default re-vaccination interval, and keyword aliases for legacy fallback.
 */
export const VACCINE_CATALOG = [
  { id: 'rabies',        name: 'Rabies',         species: ['dog', 'cat'], intervalDays: 365, keywords: ['rabies'] },
  { id: 'dhpp',          name: 'DHPP (5-in-1)',  species: ['dog'],        intervalDays: 365, keywords: ['dhpp', 'da2pp', 'distemper', 'parvo', 'parvovirus', '5-in-1', '5 in 1'] },
  { id: 'bordetella',    name: 'Bordetella',     species: ['dog'],        intervalDays: 180, keywords: ['bordetella', 'kennel cough', 'kennel'] },
  { id: 'leptospirosis', name: 'Leptospirosis',  species: ['dog'],        intervalDays: 365, keywords: ['lepto', 'leptospirosis'] },
  { id: 'fvrcp',         name: 'FVRCP',          species: ['cat'],        intervalDays: 365, keywords: ['fvrcp', 'feline distemper', 'panleukopenia'] },
  { id: 'felv',          name: 'FeLV',           species: ['cat'],        intervalDays: 365, keywords: ['felv', 'feline leukemia'] },
];

/**
 * The keywords used by isVaccinationVisit to detect vaccine-related appointments.
 * Single source of truth — do not duplicate this array elsewhere.
 */
export const VACCINE_KEYWORDS = [
  'vaccine', 'vaccination',
  ...VACCINE_CATALOG.flatMap(v => v.keywords),
];

/**
 * Resolve a VACCINE_CATALOG entry from a free-text vaccine name.
 * Returns the catalog entry or null. Used for vaccineId matching (T2.478)
 * and legacy backward-compat.
 *
 * @param {string} name  Free-text vaccine name from a form field or record
 * @returns {object|null} Matching VACCINE_CATALOG entry, or null
 */
export function resolveVaccineFromName(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  return VACCINE_CATALOG.find(v =>
    v.name.toLowerCase() === lower || v.keywords.some(kw => lower.includes(kw))
  ) || null;
}

/**
 * Normalizes a medical record's vaccine data into an array.
 * Handles both new `vaccineAdministrations[]` and legacy `vaccineData` formats,
 * ensuring all downstream readers work correctly regardless of record age.
 *
 * @param {object} record  A medical_records Firestore document
 * @returns {Array<object>} Array of vaccine administration objects (may be empty)
 */
export function getVaccineAdministrations(record) {
  if (record?.vaccineAdministrations?.length > 0) return record.vaccineAdministrations;
  if (record?.vaccineData?.vaccineName) return [record.vaccineData];
  return [];
}
