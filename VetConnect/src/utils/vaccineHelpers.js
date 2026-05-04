import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

// ---------------------------------------------------------------------------
// DEFAULT_VACCINE_CATALOG — hardcoded fallback
// Mirrors admin vaccineConstants.js DEFAULT_VACCINE_CATALOG.
// Used when the inventory collection has no vaccine products (empty clinic)
// or when the one-shot fetch fails.
// ---------------------------------------------------------------------------

export const DEFAULT_VACCINE_CATALOG = [
  {
    id: 'rabies',
    name: 'Rabies',
    species: ['dog', 'cat'],
    intervalDays: 365,
    keywords: ['rabies'],
    isActive: true,
  },
  {
    id: 'dhpp',
    name: 'DHPP (5-in-1)',
    species: ['dog'],
    intervalDays: 365,
    keywords: ['dhpp', 'da2pp', 'distemper', 'parvo', 'parvovirus', '5-in-1', '5 in 1'],
    isActive: true,
  },
  {
    id: 'bordetella',
    name: 'Bordetella',
    species: ['dog'],
    intervalDays: 180,
    keywords: ['bordetella', 'kennel cough', 'kennel'],
    isActive: true,
  },
  {
    id: 'leptospirosis',
    name: 'Leptospirosis',
    species: ['dog'],
    intervalDays: 365,
    keywords: ['lepto', 'leptospirosis'],
    isActive: true,
  },
  {
    id: 'fvrcp',
    name: 'FVRCP',
    species: ['cat'],
    intervalDays: 365,
    keywords: ['fvrcp', 'feline distemper', 'panleukopenia'],
    isActive: true,
  },
  {
    id: 'felv',
    name: 'FeLV',
    species: ['cat'],
    intervalDays: 365,
    keywords: ['felv', 'feline leukemia'],
    isActive: true,
  },
];

// Legacy keyword map — supplements inventory product names with historical
// synonyms so old records that embedded vaccine names in free-text SOAP notes
// still resolve correctly.
const LEGACY_KEYWORDS = {
  rabies:        ['rabies'],
  dhpp:          ['dhpp', 'da2pp', 'distemper', 'parvo', 'parvovirus', '5-in-1', '5 in 1'],
  bordetella:    ['bordetella', 'kennel cough', 'kennel'],
  leptospirosis: ['lepto', 'leptospirosis'],
  fvrcp:         ['fvrcp', 'feline distemper', 'panleukopenia'],
  felv:          ['felv', 'feline leukemia'],
};

// ---------------------------------------------------------------------------
// INTERNAL HELPERS
// ---------------------------------------------------------------------------

/**
 * Maps an inventory product (category === 'vaccine') into the vaccine catalog
 * entry shape consumed by buildVaccinationStatus and resolveVaccineFromName.
 * Mirrors admin useVaccineCatalog.js mapProductToCatalogEntry.
 *
 * @param {{ id: string, itemName: string, vaccineConfig?: Object, isArchived?: boolean }} product
 * @returns {{ id, name, species, intervalDays, isActive, keywords }}
 */
function mapProductToCatalogEntry(product) {
  const vc = product.vaccineConfig || {};
  const nameLower = (product.itemName || '').toLowerCase();

  const legacyKws = Object.entries(LEGACY_KEYWORDS).find(([key]) =>
    nameLower.includes(key),
  )?.[1] || [];

  return {
    id:           product.id,
    name:         product.itemName,
    species:      vc.species      || ['dog', 'cat'],
    intervalDays: vc.intervalDays || 365,
    isActive:     !product.isArchived,
    keywords:     [nameLower, ...legacyKws],
  };
}

// ---------------------------------------------------------------------------
// PUBLIC EXPORTS — catalog fetch
// ---------------------------------------------------------------------------

/**
 * One-shot fetch of the vaccine catalog from inventory products.
 * Filters client-side for category === 'vaccine' (case-insensitive).
 * Falls back to DEFAULT_VACCINE_CATALOG when:
 *   - No vaccine products exist in inventory
 *   - The fetch fails (permissions, network, etc.)
 *
 * Called once on mount — not a real-time listener.
 *
 * @returns {Promise<Array>} Catalog entries in the buildVaccinationStatus shape.
 */
export async function fetchVaccineCatalog() {
  try {
    const snap = await getDocs(collection(db, 'inventory'));
    const vaccineProducts = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => (p.category || '').toLowerCase() === 'vaccine' && !p.isArchived);

    if (vaccineProducts.length > 0) {
      return vaccineProducts.map(mapProductToCatalogEntry);
    }
  } catch (err) {
    // Inventory is staff-only — mobile clients use the default vaccine catalog
    if (__DEV__) console.debug('[vaccineHelpers] Using default catalog (expected for mobile clients)');
  }
  return DEFAULT_VACCINE_CATALOG;
}

// ---------------------------------------------------------------------------
// PUBLIC EXPORTS — pure helpers (ported from admin vaccineConstants.js)
// ---------------------------------------------------------------------------

/**
 * Resolves a catalog entry from a free-text vaccine name using exact name
 * equality or keyword substring matching.
 *
 * @param {string|null} name     - Free-text vaccine name from a medical record.
 * @param {Array}       catalog  - Vaccine catalog to search.
 * @returns {Object|null} Matching catalog entry, or null if no match.
 */
export function resolveVaccineFromName(name, catalog = DEFAULT_VACCINE_CATALOG) {
  if (!name) return null;
  const lower = name.toLowerCase();
  return (
    catalog.find(
      v =>
        v.name.toLowerCase() === lower ||
        (v.keywords || []).some(kw => lower.includes(kw)),
    ) || null
  );
}

/**
 * Normalizes a medical record's vaccine data into a flat array.
 * Handles both structured vaccineAdministrations[] (new format) and the
 * legacy vaccineData singular object (older records).
 *
 * @param {Object} record - A medical_records document.
 * @returns {Array} Array of vaccine administration objects.
 */
export function getVaccineAdministrations(record) {
  if (record?.vaccineAdministrations?.length > 0) return record.vaccineAdministrations;
  if (record?.vaccineData?.vaccineName) return [record.vaccineData];
  return [];
}

// ---------------------------------------------------------------------------
// PUBLIC EXPORTS — status calculation
// ---------------------------------------------------------------------------

/**
 * Builds the vaccination status array for a pet, filtered to species-relevant
 * vaccines. For each catalog vaccine, attempts two resolution paths in order:
 *   1. Structured: vaccineAdministrations[] / vaccineData fields
 *   2. Legacy fallback: keyword match against SOAP / diagnosis free text
 *
 * Port of admin PatientDashboard.jsx vaccinationStatus useMemo (lines 633-712)
 * and vaccineCompleteness useMemo (lines 724-733).
 *
 * @param {Array}  records    - Full medical_records array (PetHistoryScreen history).
 * @param {Array}  catalog    - Vaccine catalog from fetchVaccineCatalog().
 * @param {string} petSpecies - Pet species string (e.g. 'Canine', 'Feline', 'Dog').
 * @returns {{ statuses: Array, completeness: Object|null }}
 */
export function buildVaccinationStatus(records, catalog, petSpecies) {
  const sp = (petSpecies || '').toLowerCase();
  const spKey = sp.includes('cat') || sp.includes('feline') ? 'cat' : 'dog';

  const statuses = catalog
    .filter(v => v.species?.includes(spKey))
    .map(catalogVax => {
      // ------------------------------------------------------------------
      // Path 1: Structured — find the most recent vaccineAdministration
      // entry that resolves to this catalog entry.
      // ------------------------------------------------------------------
      let structuredRecord = null;
      let matchedAdmin = null;
      let bestTime = 0;

      for (const r of records) {
        const admins = getVaccineAdministrations(r);
        const admin = admins.find(a => {
          const resolved = resolveVaccineFromName(a.vaccineName, catalog);
          return resolved?.id === catalogVax.id;
        });
        if (admin) {
          const rTime = r.date?.toDate
            ? r.date.toDate().getTime()
            : (r.date?.seconds ? r.date.seconds * 1000 : 0);
          if (rTime >= bestTime) {
            structuredRecord = r;
            matchedAdmin    = admin;
            bestTime        = rTime;
          }
        }
      }

      if (structuredRecord && matchedAdmin) {
        const lastDate = structuredRecord.date?.toDate
          ? structuredRecord.date.toDate()
          : structuredRecord.date?.seconds
            ? new Date(structuredRecord.date.seconds * 1000)
            : null;

        if (!lastDate) {
          return {
            name: catalogVax.name, id: catalogVax.id,
            intervalDays: catalogVax.intervalDays,
            status: 'unknown', lastDate: null, daysUntilDue: null,
            lotNumber:    matchedAdmin.lotNumber    || null,
            manufacturer: matchedAdmin.manufacturer || null,
            vetName:      structuredRecord.vetName  || null,
          };
        }

        const explicitDue  = matchedAdmin.dueDate ? new Date(matchedAdmin.dueDate) : null;
        const intervalDays = matchedAdmin.intervalDays || catalogVax.intervalDays;
        const daysUntilDue = explicitDue
          ? Math.floor((explicitDue.getTime() - Date.now()) / 86400000)
          : intervalDays - Math.floor((Date.now() - lastDate.getTime()) / 86400000);

        const status = daysUntilDue < 0   ? 'overdue'
          : daysUntilDue <= 30            ? 'due_soon'
          : 'current';

        return {
          name: catalogVax.name, id: catalogVax.id,
          intervalDays: catalogVax.intervalDays,
          status, lastDate, daysUntilDue,
          lotNumber:     matchedAdmin.lotNumber     || null,
          manufacturer:  matchedAdmin.manufacturer  || null,
          routeOfAdmin:  matchedAdmin.routeOfAdmin  || null,
          vetName:       structuredRecord.vetName   || null,
        };
      }

      // ------------------------------------------------------------------
      // Path 2: Legacy — keyword match against SOAP/diagnosis free text.
      // ------------------------------------------------------------------
      const keywordMatches = records.filter(r => {
        const text = [
          r.diagnosis,
          r.treatment,
          r.soap?.subjective,
          r.soap?.objective || r.objectiveNotes || '',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return (catalogVax.keywords || []).some(kw => text.includes(kw));
      });

      if (keywordMatches.length === 0) {
        return {
          name: catalogVax.name, id: catalogVax.id,
          intervalDays: catalogVax.intervalDays,
          status: 'unknown', lastDate: null, daysUntilDue: null,
        };
      }

      const latest = keywordMatches.reduce((a, b) => {
        const aTime = a.date?.toDate ? a.date.toDate().getTime()
          : (a.date?.seconds ? a.date.seconds * 1000 : 0);
        const bTime = b.date?.toDate ? b.date.toDate().getTime()
          : (b.date?.seconds ? b.date.seconds * 1000 : 0);
        return aTime >= bTime ? a : b;
      });

      const lastDate = latest.date?.toDate
        ? latest.date.toDate()
        : latest.date?.seconds
          ? new Date(latest.date.seconds * 1000)
          : null;

      if (!lastDate) {
        return {
          name: catalogVax.name, id: catalogVax.id,
          intervalDays: catalogVax.intervalDays,
          status: 'unknown', lastDate: null, daysUntilDue: null,
        };
      }

      const daysSince    = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
      const daysUntilDue = catalogVax.intervalDays - daysSince;
      const status       = daysUntilDue < 0   ? 'overdue'
        : daysUntilDue <= 30                  ? 'due_soon'
        : 'current';

      return {
        name: catalogVax.name, id: catalogVax.id,
        intervalDays: catalogVax.intervalDays,
        status, lastDate, daysUntilDue,
        vetName: latest.vetName || null,
      };
    });

  if (statuses.length === 0) {
    return { statuses, completeness: null };
  }

  const administered = statuses.filter(v => v.status !== 'unknown').length;
  return {
    statuses,
    completeness: {
      administered,
      total:      statuses.length,
      percentage: Math.round((administered / statuses.length) * 100),
    },
  };
}

/**
 * Builds the full administration history for a specific vaccine across all
 * records. Used by the tap-to-expand detail view in VaccinationStatusCard.
 * Returns entries sorted newest-first.
 *
 * @param {string} vaccineId - Catalog vaccine ID to filter by.
 * @param {Array}  records   - Full medical_records array.
 * @param {Array}  catalog   - Vaccine catalog.
 * @returns {Array<{ date: Date|null, vaccineName: string, lotNumber: string, manufacturer: string, routeOfAdmin: string, vetName: string }>}
 */
export function getVaccineHistory(vaccineId, records, catalog) {
  const results = [];

  for (const r of records) {
    const admins = getVaccineAdministrations(r);
    for (const a of admins) {
      const resolved = resolveVaccineFromName(a.vaccineName, catalog);
      if (resolved?.id === vaccineId) {
        const date = r.date?.toDate
          ? r.date.toDate()
          : r.date?.seconds
            ? new Date(r.date.seconds * 1000)
            : null;
        results.push({
          date,
          vaccineName:  a.vaccineName  || resolved.name,
          lotNumber:    a.lotNumber    || '',
          manufacturer: a.manufacturer || '',
          routeOfAdmin: a.routeOfAdmin || '',
          vetName:      r.vetName      || 'Clinic Staff',
        });
      }
    }
  }

  return results.sort(
    (a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0),
  );
}
