import { useSyncExternalStore } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

/**
 * Default contact info fallbacks.
 * clinicPhone defaults to '' so Call buttons disable gracefully.
 * clinicAddress defaults to the real clinic location.
 * Geofence defaults match the clinic's GPS coordinates (Starbarks, Santa Barbara, Pangasinan).
 */
const DEFAULTS = {
  clinicPhone: '',
  clinicAddress: 'Starbarks Veterinary Clinic, Santa Barbara, Pangasinan',
  clinicName: 'Starbarks Veterinary Clinic',
  clinicTIN: '',
  baiRegistrationNumber: '',
  clinicLat: 16.0389,
  clinicLng: 120.3977,
  geofenceRadiusM: 150,
};

// --- Singleton store (module-level) ---
let current = { ...DEFAULTS };
let unsub = null;
const subs = new Set();

function notifyAll() {
  subs.forEach((cb) => cb());
}

function ensureListener() {
  if (unsub) return;
  unsub = onSnapshot(doc(db, 'clinic_settings', 'general'), (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      current = {
        clinicPhone: data.clinicPhone || DEFAULTS.clinicPhone,
        clinicAddress: data.clinicAddress || DEFAULTS.clinicAddress,
        clinicName: data.clinicName || DEFAULTS.clinicName,
        clinicTIN: data.clinicTIN || DEFAULTS.clinicTIN,
        baiRegistrationNumber: data.baiRegistrationNumber || DEFAULTS.baiRegistrationNumber,
        clinicLat: data.clinicLat ?? DEFAULTS.clinicLat,
        clinicLng: data.clinicLng ?? DEFAULTS.clinicLng,
        geofenceRadiusM: data.geofenceRadiusM ?? DEFAULTS.geofenceRadiusM,
      };
    }
    notifyAll();
  });
}

function subscribe(callback) {
  ensureListener();
  subs.add(callback);
  return () => { subs.delete(callback); };
}

function getSnapshot() {
  return current;
}

/**
 * Returns clinic contact info and geofence configuration from clinic_settings/general.
 * Singleton Firestore listener shared across all consumers.
 * Compatible with React 19 Strict Mode.
 *
 * @returns {{
 *   clinicPhone: string,
 *   clinicAddress: string,
 *   clinicName: string,
 *   clinicTIN: string,
 *   baiRegistrationNumber: string,
 *   clinicLat: number,
 *   clinicLng: number,
 *   geofenceRadiusM: number,
 * }}
 */
export function useClinicContact() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
