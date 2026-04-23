import { useSyncExternalStore } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

/**
 * Default contact info fallbacks.
 * clinicPhone defaults to '' so Call buttons disable gracefully.
 * clinicAddress defaults to the real clinic location.
 */
const DEFAULTS = {
  clinicPhone: '',
  clinicAddress: 'Starbarks Veterinary Clinic, Santa Barbara, Pangasinan',
  clinicName: 'Starbarks Veterinary Clinic',
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
 * Returns { clinicPhone, clinicAddress, clinicName } from clinic_settings/general.
 * Singleton Firestore listener shared across all consumers.
 * Compatible with React 19 Strict Mode.
 *
 * @returns {{ clinicPhone: string, clinicAddress: string, clinicName: string }}
 */
export function useClinicContact() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
