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
    doses: 1,
  },
  {
    id: 'dhpp',
    name: 'DHPP (5-in-1)',
    species: ['dog'],
    intervalDays: 365,
    keywords: ['dhpp', 'da2pp', 'distemper', 'parvo', 'parvovirus', '5-in-1', '5 in 1'],
    isActive: true,
    doses: 3,
    doseIntervalDays: [21, 21],
    startAgeWeeks: 6,
  },
  {
    id: 'bordetella',
    name: 'Bordetella',
    species: ['dog'],
    intervalDays: 180,
    keywords: ['bordetella', 'kennel cough', 'kennel'],
    isActive: true,
    doses: 2,
    doseIntervalDays: [28],
  },
  {
    id: 'leptospirosis',
    name: 'Leptospirosis',
    species: ['dog'],
    intervalDays: 365,
    keywords: ['lepto', 'leptospirosis'],
    isActive: true,
    doses: 2,
    doseIntervalDays: [21],
  },
  {
    id: 'fvrcp',
    name: 'FVRCP',
    species: ['cat'],
    intervalDays: 365,
    keywords: ['fvrcp', 'feline distemper', 'panleukopenia'],
    isActive: true,
    doses: 3,
    doseIntervalDays: [21, 21],
    startAgeWeeks: 6,
  },
  {
    id: 'felv',
    name: 'FeLV',
    species: ['cat'],
    intervalDays: 365,
    keywords: ['felv', 'feline leukemia'],
    isActive: true,
    doses: 2,
    doseIntervalDays: [21],
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
    id:              product.id,
    name:            product.itemName,
    species:         vc.species      || ['dog', 'cat'],
    intervalDays:    vc.intervalDays || 365,
    isActive:        !product.isArchived,
    keywords:        [nameLower, ...legacyKws],
    // Multi-dose series fields — dual-read fallback for legacy products
    doses:           vc.doses            || 1,
    doseIntervalDays: vc.doseIntervalDays || [],
    startAgeWeeks:   vc.startAgeWeeks    || null,
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
 * Parses a dueDate field from a vaccineAdministrations entry.
 * Handles Firestore Timestamp (new), Timestamp-like {seconds}, and ISO string (legacy).
 *
 * @param {*} dueDate - Raw dueDate value from Firestore
 * @returns {Date|null}
 */
function parseDueDate(dueDate) {
  if (!dueDate) return null;
  if (dueDate.toDate) return dueDate.toDate();                   // Firestore Timestamp
  if (dueDate.seconds) return new Date(dueDate.seconds * 1000); // Timestamp-like object
  if (typeof dueDate === 'string') return new Date(dueDate);     // ISO string (legacy)
  return null;
}

/**
 * Builds the vaccination status array for a pet, filtered to species-relevant
 * vaccines. For each catalog vaccine, attempts two resolution paths in order:
 *   1. Structured: vaccineAdministrations[] / vaccineData fields (all doses)
 *   2. Legacy fallback: keyword match against SOAP / diagnosis free text
 *
 * T4.200: Rewritten to track ALL doses per vaccine (not just the most recent),
 * implementing full multi-dose series support with binary completeness (Decision 4).
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
      const totalDoses = catalogVax.doses || 1;

      // -----------------------------------------------------------------------
      // Path 1: Structured — collect ALL matching administrations across ALL
      // records, then build series progress with explicit dose tracking.
      // T4.200: Multi-dose aware rewrite.
      // -----------------------------------------------------------------------
      const allAdmins = [];
      for (const r of records) {
        const admins = getVaccineAdministrations(r);
        for (const admin of admins) {
          const resolved = resolveVaccineFromName(admin.vaccineName, catalog);
          if (resolved?.id === catalogVax.id) {
            const rDate = r.date?.toDate
              ? r.date.toDate()
              : r.date?.seconds
                ? new Date(r.date.seconds * 1000)
                : null;
            allAdmins.push({
              ...admin,
              date: rDate,
              vetName:  r.vetName || null,
              recordId: r.id,
            });
          }
        }
      }

      if (allAdmins.length > 0) {
        // Sort chronologically ascending (oldest first) so dose numbering is stable
        allAdmins.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

        // Deduplicate by doseNumber.
        // Explicit doseNumber (new records): use as-is.
        // Absent doseNumber (legacy records): assign sequential numbers by chronological order.
        const doseMap = new Map(); // doseNumber → admin entry
        for (const admin of allAdmins) {
          const dn = admin.doseNumber || (doseMap.size + 1);
          if (!doseMap.has(dn)) {
            doseMap.set(dn, admin);
          }
        }

        const dosesGiven = Math.min(doseMap.size, totalDoses);
        const seriesComplete = dosesGiven >= totalDoses;
        const firstMissing = seriesComplete ? null
          : Array.from({ length: totalDoses }, (_, i) => i + 1).find(n => !doseMap.has(n));
        const nextDoseNumber = seriesComplete ? null : (firstMissing ?? dosesGiven + 1);

        const lastAdmin = allAdmins[allAdmins.length - 1];
        const lastDate = lastAdmin.date;

        if (!lastDate) {
          return {
            name: catalogVax.name, id: catalogVax.id,
            intervalDays: catalogVax.intervalDays,
            status: 'unknown', lastDate: null, daysUntilDue: null,
            lotNumber:     lastAdmin.lotNumber     || null,
            manufacturer:  lastAdmin.manufacturer  || null,
            vetName:       lastAdmin.vetName       || null,
            dosesRequired: totalDoses,
            dosesGiven,
            nextDoseNumber,
            doseHistory:   [],
          };
        }

        let daysUntilDue;
        if (seriesComplete) {
          // Annual booster timing from the LAST dose in series
          const explicitDue = parseDueDate(lastAdmin.dueDate);
          daysUntilDue = explicitDue
            ? Math.floor((explicitDue.getTime() - Date.now()) / 86400000)
            : (lastAdmin.intervalDays || catalogVax.intervalDays) -
              Math.floor((Date.now() - lastDate.getTime()) / 86400000);
        } else {
          // Next dose timing — use doseIntervalDays for the interval AFTER the last given dose
          const doseIntervals = catalogVax.doseIntervalDays || [];
          const intervalForNextDose = doseIntervals[dosesGiven - 1] ?? 21; // default 21 days
          const nextDoseDate = new Date(lastDate.getTime() + intervalForNextDose * 86400000);
          daysUntilDue = Math.floor((nextDoseDate.getTime() - Date.now()) / 86400000);
        }

        // Status logic:
        // - seriesComplete: current / due_soon / overdue (annual booster)
        // - incomplete series: overdue / due_soon / incomplete
        const status = seriesComplete
          ? (daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 30 ? 'due_soon' : 'current')
          : (daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 30 ? 'due_soon' : 'incomplete');

        const doseHistory = Array.from(doseMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([dn, admin]) => ({
            doseNumber:   dn,
            date:         admin.date,
            vetName:      admin.vetName      || null,
            lotNumber:    admin.lotNumber    || null,
            manufacturer: admin.manufacturer || null,
          }));

        return {
          name: catalogVax.name, id: catalogVax.id,
          intervalDays: catalogVax.intervalDays,
          status, lastDate, daysUntilDue,
          lotNumber:     lastAdmin.lotNumber     || null,
          manufacturer:  lastAdmin.manufacturer  || null,
          routeOfAdmin:  lastAdmin.routeOfAdmin  || null,
          vetName:       lastAdmin.vetName       || null,
          // T4.200: Multi-dose fields (additive — backward compatible)
          dosesRequired: totalDoses,
          dosesGiven,
          nextDoseNumber,
          doseHistory,
        };
      }

      // -----------------------------------------------------------------------
      // Path 2: Legacy — keyword match against SOAP/diagnosis free text.
      // Preserves existing behavior; adds multi-dose fields with safe defaults.
      // -----------------------------------------------------------------------
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
          dosesRequired: totalDoses,
          dosesGiven:    0,
          nextDoseNumber: totalDoses > 1 ? 1 : null,
          doseHistory:   [],
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
          dosesRequired: totalDoses,
          dosesGiven:    0,
          nextDoseNumber: totalDoses > 1 ? 1 : null,
          doseHistory:   [],
        };
      }

      const daysSince    = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
      const daysUntilDue = catalogVax.intervalDays - daysSince;
      const status       = daysUntilDue < 0 ? 'overdue'
        : daysUntilDue <= 30               ? 'due_soon'
        : 'current';

      return {
        name: catalogVax.name, id: catalogVax.id,
        intervalDays: catalogVax.intervalDays,
        status, lastDate, daysUntilDue,
        vetName:       latest.vetName || null,
        // T4.200: Legacy path — assume 1 dose given (we found a keyword match)
        dosesRequired:  totalDoses,
        dosesGiven:     1,
        nextDoseNumber: totalDoses > 1 ? 2 : null,
        doseHistory:    [],
      };
    });

  if (statuses.length === 0) {
    return { statuses, completeness: null };
  }

  // T4.200: Binary completeness — Decision 4.
  // A vaccine counts as "administered" only when ALL doses are given AND status is not 'overdue'.
  // 2/3 doses = incomplete (NOT 67%). 'unknown' = not administered.
  const complete = statuses.filter(v =>
    v.status !== 'unknown' && v.dosesGiven >= v.dosesRequired && v.status !== 'overdue',
  ).length;

  return {
    statuses,
    completeness: {
      administered: complete,
      total:        statuses.length,
      percentage:   Math.round((complete / statuses.length) * 100),
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
          // T4.200: Explicit dose number; null for legacy records without this field
          doseNumber:   a.doseNumber   || null,
        });
      }
    }
  }

  return results.sort(
    (a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0),
  );
}
