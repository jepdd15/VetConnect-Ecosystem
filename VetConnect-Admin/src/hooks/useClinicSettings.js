import { useSyncExternalStore } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Default fallback values used when no Firestore document exists
 * or while the first snapshot is still in-flight.
 */
const DEFAULT_SETTINGS = {
  closeHour: 17,
  openHour: 8,
  workingDays: [0, 1, 2, 3, 4, 5, 6],
  closedDates: [], // ISO YYYY-MM-DD strings, sorted asc
  clinicName: 'Starbarks Veterinary Clinic',
  clinicAddress: 'Santa Barbara, Pangasinan',
  clinicPhone: '', // Configurable via Settings > General — displayed to clients
  clinicLat: 16.0389,    // GPS latitude for geofence center (Starbarks, Santa Barbara, Pangasinan)
  clinicLng: 120.3977,   // GPS longitude for geofence center
  geofenceRadiusM: 150,  // Geofence radius in meters for client self-check-in
  noShowLinkWindowDays: 30,  // Default no-show lookback window in days
};

// --- Module-level singleton store ---
let currentSettings = { ...DEFAULT_SETTINGS };
let listenerUnsub = null;
const subscribers = new Set();

function notifyAll() {
  subscribers.forEach((cb) => cb());
}

/**
 * Ensures the Firestore listener is active. Called lazily on first subscribe.
 * The listener is never torn down — it lives for the lifetime of the page.
 * This eliminates the Strict Mode double-mount flicker entirely.
 */
function ensureListener() {
  if (listenerUnsub) return;
  listenerUnsub = onSnapshot(doc(db, 'clinic_settings', 'general'), (docSnap) => {
    if (docSnap.exists()) {
      currentSettings = { ...DEFAULT_SETTINGS, ...docSnap.data() };
    }
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
  return currentSettings;
}

/**
 * Returns the current `clinic_settings/general` document as a plain object.
 * All callers across the component tree share a single Firestore listener.
 *
 * Compatible with React Strict Mode (no flicker on double-mount).
 *
 * @returns {object} Merged settings: DEFAULT_SETTINGS + Firestore data
 */
export function useClinicSettings() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
