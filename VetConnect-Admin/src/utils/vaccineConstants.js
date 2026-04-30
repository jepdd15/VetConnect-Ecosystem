/**
 * Canonical vaccine catalog — hardcoded fallback.
 *
 * This is the compile-time default used when Firestore has not been seeded yet.
 * T3.51 moved the live catalog to clinic_settings/vaccine_catalog in Firestore,
 * accessed via useVaccineCatalog(). This constant remains as:
 *   1. The seed dataset written on "Seed Default Vaccines" in Settings.
 *   2. The fallback for useVaccineCatalog when the Firestore doc is absent.
 *
 * T4.117 (Day 3): Removed buildVaccineKeywords, VACCINE_KEYWORDS, and the
 * VACCINE_CATALOG re-export alias. Detection is now category-based
 * (category === 'vaccine' on inventory products), not keyword-based.
 *
 * Note: isActive defaults to true on all entries; the field is managed
 * exclusively via Firestore once the catalog is seeded.
 */
export const DEFAULT_VACCINE_CATALOG = [
  { id: 'rabies',        name: 'Rabies',        species: ['dog', 'cat'], intervalDays: 365, keywords: ['rabies'],                                                           isActive: true },
  { id: 'dhpp',          name: 'DHPP (5-in-1)', species: ['dog'],        intervalDays: 365, keywords: ['dhpp', 'da2pp', 'distemper', 'parvo', 'parvovirus', '5-in-1', '5 in 1'], isActive: true },
  { id: 'bordetella',    name: 'Bordetella',    species: ['dog'],        intervalDays: 180, keywords: ['bordetella', 'kennel cough', 'kennel'],                             isActive: true },
  { id: 'leptospirosis', name: 'Leptospirosis', species: ['dog'],        intervalDays: 365, keywords: ['lepto', 'leptospirosis'],                                           isActive: true },
  { id: 'fvrcp',         name: 'FVRCP',         species: ['cat'],        intervalDays: 365, keywords: ['fvrcp', 'feline distemper', 'panleukopenia'],                       isActive: true },
  { id: 'felv',          name: 'FeLV',          species: ['cat'],        intervalDays: 365, keywords: ['felv', 'feline leukemia'],                                          isActive: true },
];

/**
 * Resolve a catalog entry from a free-text vaccine name using name equality
 * or keyword substring matching.
 *
 * @param {string} name             Free-text vaccine name from a form field or record
 * @param {Array<object>} [catalog] Catalog to search — defaults to the hardcoded fallback
 *                                  for backward compat. Pass the live catalog from
 *                                  useVaccineCatalog() to respect admin edits.
 * @returns {object|null} Matching catalog entry, or null
 */
export function resolveVaccineFromName(name, catalog = DEFAULT_VACCINE_CATALOG) {
  if (!name) return null;
  const lower = name.toLowerCase();
  return (
    catalog.find(
      (v) =>
        v.name.toLowerCase() === lower ||
        (v.keywords || []).some((kw) => lower.includes(kw))
    ) || null
  );
}

/**
 * Normalizes a medical record's vaccine data into an array.
 * Handles both new `vaccineAdministrations[]` and legacy `vaccineData` formats,
 * ensuring all downstream readers work correctly regardless of record age.
 *
 * Unchanged by T3.51 — reads record data only, not the catalog.
 *
 * @param {object} record  A medical_records Firestore document
 * @returns {Array<object>} Array of vaccine administration objects (may be empty)
 */
export function getVaccineAdministrations(record) {
  if (record?.vaccineAdministrations?.length > 0) return record.vaccineAdministrations;
  if (record?.vaccineData?.vaccineName) return [record.vaccineData];
  return [];
}
