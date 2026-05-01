/**
 * useLabTestCatalog.js
 * T4.120 — Lab Results System Redesign (Day 1)
 *
 * Singleton hook that merges the hardcoded DEFAULT_LAB_TEST_CATALOG with custom
 * tests stored at `clinic_settings/lab_test_catalog` in Firestore. Custom tests
 * with the same id as a default override the default — clinics can customize
 * reference ranges for their lab equipment calibration.
 *
 * Uses the same useSyncExternalStore singleton pattern as useVaccineCatalog:
 * one Firestore listener is shared across all consumers, never torn down during
 * the page lifetime, and React 18 Strict Mode safe (no flicker on double-mount).
 */

import { useSyncExternalStore } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { DEFAULT_LAB_TEST_CATALOG } from '../utils/labTestConstants';

// ─── Module-level singleton store ────────────────────────────────────────────
// currentCatalog is mutated in-place by the Firestore listener so all consumers
// automatically see the latest state on re-render via useSyncExternalStore.
let currentCatalog = DEFAULT_LAB_TEST_CATALOG;
let listenerUnsub = null;
const subscribers = new Set();

function notifyAll() {
  subscribers.forEach((cb) => cb());
}

/**
 * Starts the singleton Firestore listener on clinic_settings/lab_test_catalog.
 * Called lazily on first subscriber — never called again.
 */
function ensureListener() {
  if (listenerUnsub) return;

  listenerUnsub = onSnapshot(
    doc(db, 'clinic_settings', 'lab_test_catalog'),
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const customTests = data.tests || [];

        // Build a map from the defaults, then overlay custom tests by id.
        // This allows clinics to override reference ranges for specific tests
        // (e.g., if their analyzer is calibrated differently from the defaults).
        const mergedMap = new Map(DEFAULT_LAB_TEST_CATALOG.map((t) => [t.id, t]));
        customTests.forEach((ct) => mergedMap.set(ct.id, ct));

        currentCatalog = Array.from(mergedMap.values());
      }
      // If the doc doesn't exist yet, retain DEFAULT_LAB_TEST_CATALOG unchanged.
      notifyAll();
    },
  );
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
 * Returns the merged lab test catalog array. Entries from Firestore
 * (clinic_settings/lab_test_catalog.tests) override defaults by id.
 * Falls back to DEFAULT_LAB_TEST_CATALOG if the Firestore doc doesn't exist.
 *
 * All callers share a single Firestore listener — no duplicate connections.
 *
 * @returns {Array<object>} Lab test catalog entries with id/name/category/unit/referenceRange/resultType
 */
export function useLabTestCatalog() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export { DEFAULT_LAB_TEST_CATALOG };
