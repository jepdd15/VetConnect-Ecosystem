/**
 * useDiagnosisCatalog.js
 * T4.141 — Structured Diagnosis System (Day 1)
 *
 * Singleton hook that merges the hardcoded DEFAULT_DIAGNOSIS_CATALOG with
 * custom diagnoses stored at `clinic_settings/diagnosis_catalog` in Firestore.
 * Custom entries with the same id as a default override the default — clinics
 * can extend or rename catalog conditions without losing their history.
 *
 * Clones the proven useSyncExternalStore singleton pattern from useLabTestCatalog:
 * one Firestore listener shared across all consumers, never torn down during
 * the page lifetime, and React 18 Strict Mode safe (no flicker on double-mount).
 */

import { useSyncExternalStore } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { DEFAULT_DIAGNOSIS_CATALOG } from '../utils/diagnosisConstants';

// ─── Module-level singleton store ────────────────────────────────────────────
// currentCatalog is mutated in-place by the Firestore listener so all consumers
// automatically see the latest state on re-render via useSyncExternalStore.
let currentCatalog = DEFAULT_DIAGNOSIS_CATALOG;
let listenerUnsub = null;
const subscribers = new Set();

function notifyAll() {
  subscribers.forEach((cb) => cb());
}

/**
 * Starts the singleton Firestore listener on clinic_settings/diagnosis_catalog.
 * Called lazily on first subscriber — never called again.
 */
function ensureListener() {
  if (listenerUnsub) return;

  listenerUnsub = onSnapshot(
    doc(db, 'clinic_settings', 'diagnosis_catalog'),
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const customTests = data.tests || [];

        // Build a map from the defaults, then overlay custom entries by id.
        // Custom entries can add new diagnoses or override the display name /
        // severityScale of an existing catalog condition.
        const mergedMap = new Map(DEFAULT_DIAGNOSIS_CATALOG.map((d) => [d.id, d]));
        customTests.forEach((ct) => mergedMap.set(ct.id, ct));

        currentCatalog = Array.from(mergedMap.values());
      }
      // If the doc doesn't exist yet, retain DEFAULT_DIAGNOSIS_CATALOG unchanged.
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
 * Returns the merged diagnosis catalog array. Entries from Firestore
 * (clinic_settings/diagnosis_catalog.tests) override defaults by id.
 * Falls back to DEFAULT_DIAGNOSIS_CATALOG if the Firestore doc doesn't exist.
 *
 * All callers share a single Firestore listener — no duplicate connections.
 *
 * @returns {Array<object>} Diagnosis catalog entries with id/name/category/species/hasSeverity/severityScale
 */
export function useDiagnosisCatalog() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export { DEFAULT_DIAGNOSIS_CATALOG };
