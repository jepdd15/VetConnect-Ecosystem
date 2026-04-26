/**
 * useConsentSubmit — hook that atomically writes a consent record and
 * updates the user's consent version fields in a single Firestore batch.
 *
 * Both writes (consent_record + user doc update) commit in one batch so
 * there is no window where the record exists but the user doc is stale,
 * or vice versa.
 *
 * Returns:
 *   {
 *     submitConsent: (params) => Promise<void>,
 *     submitting: boolean,
 *     error: Error | null,
 *   }
 *
 * submitConsent params:
 *   {
 *     userId:        string,   // Firebase Auth UID
 *     consentType:   string,   // 'dpa' | 'waiver'
 *     versionNumber: number,
 *     versionDocId:  string,   // ID of the consent_versions document
 *     signatureType: string,   // 'drawn' | 'typed'
 *     signatureData: string,   // base64 PNG data URI or typed name string
 *   }
 */

import {
  collection,
  doc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { useState } from 'react';
import { db } from '../../firebaseConfig';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useConsentSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);

  /**
   * Write the consent record and update the user profile atomically.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {string} params.consentType    'dpa' | 'waiver'
   * @param {number} params.versionNumber
   * @param {string} params.versionDocId
   * @param {string} params.signatureType  'drawn' | 'typed'
   * @param {string} params.signatureData
   */
  async function submitConsent({
    userId,
    consentType,
    versionNumber,
    versionDocId,
    signatureType,
    signatureData,
  }) {
    setSubmitting(true);
    setError(null);

    try {
      const now   = Timestamp.now();
      const batch = writeBatch(db);

      // --- Write #1: new consent_records entry --------------------------------
      // Generate a new document reference with a Firestore-assigned ID inside
      // the user's sub-collection, then use batch.set() on that ref.
      const consentRecordRef = doc(
        collection(db, 'users', userId, 'consent_records'),
      );

      batch.set(consentRecordRef, {
        consentType,
        versionNumber,
        versionDocId,
        action:        'granted',
        signatureType,
        signatureData: signatureData ?? null,
        grantedAt:     now,
        grantedVia:    'mobile_app',
        deviceInfo:    'mobile',
        adminNote:     null,
      });

      // --- Write #2: update user profile fields --------------------------------
      // Write the new versioned fields AND keep legacy booleans in sync.
      const userRef     = doc(db, 'users', userId);
      const isDpa       = consentType === 'dpa';
      const isWaiver    = consentType === 'waiver';

      const profileUpdate = {};

      if (isDpa) {
        profileUpdate.consentVersion    = versionNumber;
        profileUpdate.consentGrantedAt  = now;
        profileUpdate.dpaConsent        = true;   // backward-compat boolean
      }

      if (isWaiver) {
        profileUpdate.waiverVersion     = versionNumber;
        profileUpdate.waiverGrantedAt   = now;
        profileUpdate.waiverSigned      = true;   // backward-compat boolean
      }

      batch.update(userRef, profileUpdate);

      await batch.commit();
    } catch (err) {
      console.error('[useConsentSubmit.submitConsent]:', err.message);
      setError(err);
      throw err; // re-throw so ConsentScreen can handle it
    } finally {
      setSubmitting(false);
    }
  }

  return { submitConsent, submitting, error };
}
