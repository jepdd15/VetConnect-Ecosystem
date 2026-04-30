import { useSyncExternalStore } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Hardcoded fallback catalog — used only when no vaccine-category inventory
 * products exist yet (pre-migration). After migration, inventory is the source
 * of truth.
 *
 * T4.117: The live catalog is now served by reading inventory products with
 * category === 'vaccine'. This fallback preserves continuity during the
 * transition period before migration is performed.
 */
const DEFAULT_VACCINES = [
  { id: 'rabies',        name: 'Rabies',        species: ['dog', 'cat'], intervalDays: 365, keywords: ['rabies'],                                                               isActive: true },
  { id: 'dhpp',          name: 'DHPP (5-in-1)', species: ['dog'],        intervalDays: 365, keywords: ['dhpp', 'da2pp', 'distemper', 'parvo', 'parvovirus', '5-in-1', '5 in 1'], isActive: true },
  { id: 'bordetella',    name: 'Bordetella',    species: ['dog'],        intervalDays: 180, keywords: ['bordetella', 'kennel cough', 'kennel'],                                 isActive: true },
  { id: 'leptospirosis', name: 'Leptospirosis', species: ['dog'],        intervalDays: 365, keywords: ['lepto', 'leptospirosis'],                                               isActive: true },
  { id: 'fvrcp',         name: 'FVRCP',         species: ['cat'],        intervalDays: 365, keywords: ['fvrcp', 'feline distemper', 'panleukopenia'],                           isActive: true },
  { id: 'felv',          name: 'FeLV',          species: ['cat'],        intervalDays: 365, keywords: ['felv', 'feline leukemia'],                                              isActive: true },
];

/**
 * Legacy keyword map — ensures backward compatibility for PatientDashboard's
 * SOAP text matching path. Inventory-sourced products get their name-derived
 * keyword supplemented with these well-known synonyms so that old records
 * (which embedded vaccine names in free-text SOAP notes) still resolve correctly.
 *
 * Key: substring that may appear in the inventory product's itemName (lowercased)
 * Value: additional keyword array to include on the catalog entry
 */
const LEGACY_KEYWORDS = {
  'rabies':        ['rabies'],
  'dhpp':          ['dhpp', 'da2pp', 'distemper', 'parvo', 'parvovirus', '5-in-1', '5 in 1'],
  'bordetella':    ['bordetella', 'kennel cough', 'kennel'],
  'leptospirosis': ['lepto', 'leptospirosis'],
  'fvrcp':         ['fvrcp', 'feline distemper', 'panleukopenia'],
  'felv':          ['felv', 'feline leukemia'],
};

// --- Module-level singleton store ---
// Same singleton pattern as useClinicSettings — one Firestore listener shared
// across all consumers, never torn down during the page lifetime.
let currentCatalog = DEFAULT_VACCINES;
let listenerUnsub = null;
const subscribers = new Set();

function notifyAll() {
  subscribers.forEach((cb) => cb());
}

/**
 * Maps an inventory product document (with category === 'vaccine') into the
 * vaccine catalog entry shape consumed by ClinicalWorkspace, PatientDashboard,
 * and printVaccinationRecord.
 *
 * The _product field carries the full inventory document for cart/batch operations
 * in Day 2+.
 *
 * @param {object} product - Inventory document data with id attached
 * @returns {object} Catalog entry in the canonical vaccine catalog shape
 */
function mapProductToCatalogEntry(product) {
  const vc = product.vaccineConfig || {};
  const nameLower = (product.itemName || '').toLowerCase();

  // Supplement with legacy synonyms so old SOAP text records still resolve
  const legacyKws = Object.entries(LEGACY_KEYWORDS)
    .find(([key]) => nameLower.includes(key))?.[1] || [];

  return {
    id:                  product.id,
    name:                product.itemName,
    species:             vc.species             || ['dog', 'cat'],
    intervalDays:        vc.intervalDays        || 365,
    defaultRoute:        vc.defaultRoute        || 'SQ',
    defaultSite:         vc.defaultSite         || 'Right Scruff',
    defaultManufacturer: vc.defaultManufacturer || '',
    isActive:            !product.isArchived,
    // Full inventory doc — available for cart/batch operations (Day 2)
    _product: product,
    // Legacy keyword compat: name-derived keyword + known synonyms
    keywords: [nameLower, ...legacyKws],
  };
}

/**
 * Starts the singleton Firestore listener on the inventory collection.
 * Client-side filter isolates vaccine-category products.
 * Called lazily on first subscriber — never called again.
 */
function ensureListener() {
  if (listenerUnsub) return;
  listenerUnsub = onSnapshot(collection(db, 'inventory'), (snap) => {
    const vaccineProducts = snap.docs
      .map(d => ({ id: d.id, ...d.data(), reserved: d.data().reserved ?? 0 }))
      .filter(p => (p.category || '').toLowerCase() === 'vaccine');

    if (vaccineProducts.length > 0) {
      currentCatalog = vaccineProducts.map(mapProductToCatalogEntry);
    }
    // If no vaccine-category products exist yet (pre-migration), retain DEFAULT_VACCINES
    // so all downstream consumers continue to work without changes.
    notifyAll();
  });
}

function subscribe(callback) {
  ensureListener();
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function getSnapshot() {
  return currentCatalog;
}

/**
 * Returns the vaccine catalog array derived from inventory products with
 * category === 'vaccine'. Falls back to DEFAULT_VACCINES if no vaccine
 * products exist yet (pre-migration state).
 *
 * Each entry includes: id, name, species, intervalDays, defaultRoute,
 * defaultSite, defaultManufacturer, isActive, keywords, _product (full
 * inventory document for cart/batch operations).
 *
 * All callers share a single Firestore listener on the inventory collection.
 * The Firestore SDK deduplicates the underlying WebSocket connection with any
 * concurrent useInventory listener on the same collection.
 *
 * Compatible with React Strict Mode (no flicker on double-mount).
 *
 * @returns {Array<object>} Vaccine catalog entries
 */
export function useVaccineCatalog() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * The hardcoded default catalog, exported for use as seed data in Settings
 * and as the migration source in the Day 3 migration button.
 */
export { DEFAULT_VACCINES as DEFAULT_VACCINE_CATALOG };
