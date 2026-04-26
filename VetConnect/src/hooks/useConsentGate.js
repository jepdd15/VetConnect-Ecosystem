/**
 * useConsentGate — one-shot hook that checks whether the current user
 * needs to consent (first time) or re-consent (policy version updated).
 *
 * Reads:
 *   clinic_settings/consent_policy         → activeVersion
 *   users/{uid}                            → consentVersion, waiverVersion, role
 *   consent_versions (query by type+status) → active DPA + active Waiver policy docs
 *
 * Staff roles (admin, staff, veterinarian, groomer) bypass the gate entirely.
 * If the clinic has not yet configured consent policies the hook returns
 * needsConsent: false so the app is never hard-locked during initial setup.
 *
 * Returns:
 *   {
 *     loading:           boolean,
 *     needsConsent:      boolean,   // DPA consent required
 *     needsWaiver:       boolean,   // Waiver consent required
 *     activeDpaPolicy:   PolicyDoc | null,
 *     activeWaiverPolicy: PolicyDoc | null,
 *     error:             Error | null,
 *   }
 *
 * PolicyDoc shape:
 *   { versionNumber, versionDocId, title, bodyText, summary }
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '../../firebaseConfig';

// ---------------------------------------------------------------------------
// Roles that are not data subjects — they bypass the consent gate.
// ---------------------------------------------------------------------------

const STAFF_ROLES = new Set(['admin', 'staff', 'veterinarian', 'groomer']);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @param {string} userId — Firebase Auth UID of the logged-in user
 */
export function useConsentGate(userId) {
  const [loading, setLoading]                     = useState(true);
  const [needsConsent, setNeedsConsent]           = useState(false);
  const [needsWaiver, setNeedsWaiver]             = useState(false);
  const [activeDpaPolicy, setActiveDpaPolicy]     = useState(null);
  const [activeWaiverPolicy, setActiveWaiverPolicy] = useState(null);
  const [error, setError]                         = useState(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function checkConsent() {
      try {
        // --- 1. Read the active consent policy version number --------------------
        const policySnap = await getDoc(
          doc(db, 'clinic_settings', 'consent_policy'),
        );

        if (!policySnap.exists() || !policySnap.data()?.activeVersion) {
          console.warn('[useConsentGate] No active consent policy configured');
          if (!cancelled) setLoading(false);
          return;
        }

        const activeVersion = policySnap.data().activeVersion;

        // --- 2. Read the current user's profile ---------------------------------
        const userSnap = await getDoc(doc(db, 'users', userId));

        if (!userSnap.exists()) {
          if (!cancelled) setLoading(false);
          return;
        }

        const userData = userSnap.data();

        // --- 3. Staff bypass ----------------------------------------------------
        if (STAFF_ROLES.has(userData.role) || STAFF_ROLES.has(userData.accessLevel)) {
          if (!cancelled) setLoading(false);
          return;
        }

        // --- 4. Compare DPA consent version -------------------------------------
        const userConsentVersion = userData.consentVersion ?? null;
        const dpaRequired =
          userConsentVersion === null ||
          Number(userConsentVersion) !== Number(activeVersion);

        // --- 5. Compare Waiver consent version ----------------------------------
        const userWaiverVersion = userData.waiverVersion ?? null;
        const waiverRequired =
          userWaiverVersion === null ||
          Number(userWaiverVersion) !== Number(activeVersion);

        // --- 6. Fetch the active DPA policy doc (only if needed) ----------------
        let dpaPolicy = null;
        if (dpaRequired) {
          const dpaQuery = query(
            collection(db, 'consent_versions'),
            where('type', '==', 'dpa'),
            where('status', '==', 'active'),
            limit(1),
          );
          const dpaSnap = await getDocs(dpaQuery);
          if (!dpaSnap.empty) {
            const d = dpaSnap.docs[0];
            dpaPolicy = {
              versionNumber: d.data().versionNumber,
              versionDocId:  d.id,
              title:         d.data().title,
              bodyText:      d.data().bodyText,
              summary:       d.data().summary ?? null,
            };
          }
        }

        // --- 7. Fetch the active Waiver policy doc (only if needed) -------------
        let waiverPolicy = null;
        if (waiverRequired) {
          const waiverQuery = query(
            collection(db, 'consent_versions'),
            where('type', '==', 'waiver'),
            where('status', '==', 'active'),
            limit(1),
          );
          const waiverSnap = await getDocs(waiverQuery);
          if (!waiverSnap.empty) {
            const d = waiverSnap.docs[0];
            waiverPolicy = {
              versionNumber: d.data().versionNumber,
              versionDocId:  d.id,
              title:         d.data().title,
              bodyText:      d.data().bodyText,
              summary:       d.data().summary ?? null,
            };
          }
        }

        if (!cancelled) {
          setNeedsConsent(dpaRequired && dpaPolicy !== null);
          setNeedsWaiver(waiverRequired && waiverPolicy !== null);
          setActiveDpaPolicy(dpaPolicy);
          setActiveWaiverPolicy(waiverPolicy);
        }
      } catch (err) {
        console.error('[useConsentGate.checkConsent]:', err.message);
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    checkConsent();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return {
    loading,
    needsConsent,
    needsWaiver,
    activeDpaPolicy,
    activeWaiverPolicy,
    error,
  };
}
