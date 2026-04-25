import { useSyncExternalStore } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Hardcoded fallback catalog. Mirrors vaccineConstants.js DEFAULT_VACCINE_CATALOG.
 * Used when clinic_settings/vaccine_catalog does not exist in Firestore yet.
 * Seeded into Firestore the first time an admin clicks "Seed Default Vaccines"
 * in Settings > Vaccine Catalog.
 */
const DEFAULT_VACCINES = [
  { id: 'rabies',        name: 'Rabies',        species: ['dog', 'cat'], intervalDays: 365, keywords: ['rabies'],                                                           isActive: true },
  { id: 'dhpp',          name: 'DHPP (5-in-1)', species: ['dog'],        intervalDays: 365, keywords: ['dhpp', 'da2pp', 'distemper', 'parvo', 'parvovirus', '5-in-1', '5 in 1'], isActive: true },
  { id: 'bordetella',    name: 'Bordetella',    species: ['dog'],        intervalDays: 180, keywords: ['bordetella', 'kennel cough', 'kennel'],                             isActive: true },
  { id: 'leptospirosis', name: 'Leptospirosis', species: ['dog'],        intervalDays: 365, keywords: ['lepto', 'leptospirosis'],                                           isActive: true },
  { id: 'fvrcp',         name: 'FVRCP',         species: ['cat'],        intervalDays: 365, keywords: ['fvrcp', 'feline distemper', 'panleukopenia'],                       isActive: true },
  { id: 'felv',          name: 'FeLV',          species: ['cat'],        intervalDays: 365, keywords: ['felv', 'feline leukemia'],                                          isActive: true },
];

// --- Module-level singleton store ---
// Mirrors the pattern in useClinicSettings.js: one listener, shared across all consumers.
let currentCatalog = DEFAULT_VACCINES;
let listenerUnsub = null;
const subscribers = new Set();

function notifyAll() {
  subscribers.forEach((cb) => cb());
}

/**
 * Ensures the Firestore listener is active. Called lazily on first subscribe.
 * The listener is never torn down — it lives for the lifetime of the page.
 * This eliminates Strict Mode double-mount flicker and prevents duplicate reads.
 */
function ensureListener() {
  if (listenerUnsub) return;
  listenerUnsub = onSnapshot(doc(db, 'clinic_settings', 'vaccine_catalog'), (docSnap) => {
    if (docSnap.exists() && Array.isArray(docSnap.data().vaccines)) {
      currentCatalog = docSnap.data().vaccines;
    }
    // If doc doesn't exist, retain the current fallback (DEFAULT_VACCINES).
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
 * Returns the full vaccine catalog array from Firestore (clinic_settings/vaccine_catalog).
 * Falls back to DEFAULT_VACCINES if the document hasn't been seeded yet.
 *
 * All callers across the component tree (ClinicalWorkspace, PatientDashboard, Settings)
 * share a single Firestore listener — no duplicate reads.
 *
 * Compatible with React Strict Mode (no flicker on double-mount).
 *
 * @returns {Array<object>} Vaccine catalog entries (includes inactive entries — filter by
 *   `isActive !== false` in form consumers; leave unfiltered in Settings UI).
 */
export function useVaccineCatalog() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * The hardcoded default catalog, exported for use as seed data in Settings.
 * This is the same array used as the module-level fallback.
 */
export { DEFAULT_VACCINES as DEFAULT_VACCINE_CATALOG };
