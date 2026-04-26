import { useState } from 'react';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Splits an array into chunks of at most `size` elements.
 * Used to stay well under Firestore's 500-write-per-batch limit.
 *
 * @template T
 * @param {T[]} arr
 * @param {number} size
 * @returns {T[][]}
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

const BATCH_SIZE = 450; // Firestore max is 500 — stay safely under

// ---------------------------------------------------------------------------
// Anonymization payloads
// ---------------------------------------------------------------------------

/**
 * Builds the user-document anonymization payload.
 * Applied LAST so accountStatus:"erased" is only set after all downstream
 * documents have been anonymized — enables safe idempotent re-runs.
 *
 * @param {string} userId
 * @param {string} adminUid
 * @returns {object}
 */
function buildUserPayload(userId, adminUid) {
  return {
    fullName: 'Deleted User',
    email: `erased_${userId}@redacted.vc`,
    phone: '0900000XXXX',
    secondaryPhone: null,
    address: null,
    city: null,
    dob: null,
    gender: null,
    govIdType: null,
    govIdNumber: null,
    seniorId: null,
    emergencyContacts: [],
    emergencyName: null,
    emergencyPhone: null,
    expoPushToken: null,
    referredBy: null,
    referralSource: null,
    staffNotes: [],
    accountStatus: 'erased',
    deletionRequested: false,
    erasedAt: Timestamp.now(),
    erasedBy: adminUid,
  };
}

/** Payload applied to every pet doc owned by the user. */
const PET_PAYLOAD = {
  // NOTE: `microchip` is intentionally retained. RA 10173 §13(d) permits
  // processing of personal data for veterinary purposes — microchip numbers
  // are necessary for animal welfare continuity and must not be erased.
  name: '[Redacted Pet]',
};

/** Base payload applied to every appointment doc owned by the user. */
const APPOINTMENT_BASE_PAYLOAD = {
  ownerName: 'Deleted User',
  petName: '[Redacted Pet]',
  ownerPhone: '',
  ownerEmail: '',
};

/**
 * Extra fields applied to future non-terminal appointments per Amendment 3.
 * Only for appointments where scheduledDate > now AND status in
 * ['pending', 'confirmed'] — leaves arrived/in-consult/completed/cancelled
 * appointments status-untouched.
 */
const APPOINTMENT_CANCELLATION_PAYLOAD = {
  status: 'cancelled',
  auditReason: 'RA 10173 erasure',
};

/** Terminal and non-cancellable appointment statuses. */
const NON_CANCELLABLE_STATUSES = new Set([
  'arrived',
  'in-consult',
  'dispensing',
  'billing',
  'completed',
  'cancelled',
  'no-show',
]);

/**
 * Builds the medical record anonymization payload per Amendment 5.
 * Conditionally includes dischargeSummary dot-notation keys only when the
 * record already has a dischargeSummary object — prevents creating phantom
 * sub-objects on records that never had one.
 *
 * @param {object} recordData - The raw Firestore document data for the record
 * @returns {object}
 */
function buildMedicalRecordPayload(recordData) {
  const base = {
    ownerName: 'Deleted User',
    petName: '[Redacted Pet]',
    'legal.ownerSignature': '[Consent on file — redacted]',
  };

  if (recordData.dischargeSummary && typeof recordData.dischargeSummary === 'object') {
    base['dischargeSummary.patientName'] = '[Redacted Pet]';
    base['dischargeSummary.ownerName'] = 'Deleted User';
  }

  return base;
}

/** Payload applied to every sales doc owned by the user. */
const SALE_PAYLOAD = {
  ownerName: 'Deleted User',
  petName: '[Redacted Pet]',
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useErasureEngine
 *
 * Encapsulates the RA 10173 right-to-erasure anonymization workflow for a
 * single client user. Exports two callable functions:
 *
 *   - `scanForErasure(userId)` — one-shot getDocs across 5 collections,
 *     returns document counts and snapshots for reuse in executeErasure.
 *
 *   - `executeErasure(userId, adminUid, scanResult, adminName)` — executes
 *     anonymization in batches of 450. User doc is updated LAST so that
 *     accountStatus:"erased" is only committed after all downstream docs
 *     are anonymized — enabling safe idempotent re-runs if a batch fails.
 *
 * @returns {{
 *   scanForErasure: Function,
 *   executeErasure: Function,
 *   scanning: boolean,
 *   executing: boolean,
 *   counts: object|null,
 *   error: string|null,
 * }}
 */
export function useErasureEngine() {
  const [scanning, setScanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState(null);

  // -------------------------------------------------------------------------
  // scanForErasure
  // -------------------------------------------------------------------------

  /**
   * Queries all 5 collections for documents owned by the given userId.
   * Returns document counts alongside the raw snapshots so that
   * executeErasure can reuse them without re-querying Firestore.
   *
   * @param {string} userId
   * @returns {Promise<{
   *   userDoc: import('firebase/firestore').DocumentSnapshot,
   *   petDocs: import('firebase/firestore').QuerySnapshot,
   *   appointmentDocs: import('firebase/firestore').QuerySnapshot,
   *   recordDocs: import('firebase/firestore').QuerySnapshot,
   *   saleDocs: import('firebase/firestore').QuerySnapshot,
   *   petCount: number,
   *   appointmentCount: number,
   *   recordCount: number,
   *   saleCount: number,
   *   totalDocuments: number,
   * }>}
   */
  async function scanForErasure(userId) {
    setScanning(true);
    setError(null);
    setCounts(null);

    try {
      const [userDoc, petDocs, appointmentDocs, recordDocs, saleDocs] = await Promise.all([
        getDoc(doc(db, 'users', userId)),
        getDocs(query(collection(db, 'pets'), where('ownerId', '==', userId))),
        getDocs(query(collection(db, 'appointments'), where('ownerId', '==', userId))),
        getDocs(query(collection(db, 'medical_records'), where('ownerId', '==', userId))),
        getDocs(query(collection(db, 'sales'), where('ownerId', '==', userId))),
      ]);

      const petCount = petDocs.size;
      const appointmentCount = appointmentDocs.size;
      const recordCount = recordDocs.size;
      const saleCount = saleDocs.size;
      // +1 for the user doc itself
      const totalDocuments = 1 + petCount + appointmentCount + recordCount + saleCount;

      const result = {
        userDoc,
        petDocs,
        appointmentDocs,
        recordDocs,
        saleDocs,
        petCount,
        appointmentCount,
        recordCount,
        saleCount,
        totalDocuments,
      };

      setCounts({
        petCount,
        appointmentCount,
        recordCount,
        saleCount,
        totalDocuments,
      });

      return result;
    } catch (err) {
      const message = `[useErasureEngine.scanForErasure]: ${err.message}`;
      console.error(message, err);
      setError(message);
      throw err;
    } finally {
      setScanning(false);
    }
  }

  // -------------------------------------------------------------------------
  // executeErasure
  // -------------------------------------------------------------------------

  /**
   * Executes irreversible anonymization across all collections for the user.
   *
   * Batching strategy:
   *   1. Pets (batch with user doc at the end — never first)
   *   2. Appointments (one or more batches of 450)
   *   3. Medical records (one or more batches of 450)
   *   4. Sales (one or more batches of 450)
   *   5. User doc (final write — accountStatus:"erased" set LAST)
   *
   * If any batch commit throws, execution halts and the error is surfaced
   * so the admin can investigate and re-run. Prior batches are already
   * committed (partial erasure). Because the user doc is updated last,
   * any re-run will still find accountStatus !== "erased" and can safely
   * re-apply all payloads idempotently.
   *
   * After all batches succeed, writes an audit entry to settings_logs.
   *
   * @param {string} userId
   * @param {string} adminUid
   * @param {object} scanResult - The object returned by scanForErasure
   * @param {string} adminName - Display name for the audit log entry
   * @returns {Promise<void>}
   */
  async function executeErasure(userId, adminUid, scanResult, adminName) {
    setExecuting(true);
    setError(null);

    const { userDoc, petDocs, appointmentDocs, recordDocs, saleDocs } = scanResult;
    const now = Timestamp.now();

    try {
      // --- Phase A: Pets -------------------------------------------------------
      // Pets are small in number — process in a single batch alongside a
      // placeholder so we can reserve the user doc for the very last batch.
      const petSnapshots = petDocs.docs;
      const petChunks = chunkArray(petSnapshots, BATCH_SIZE);

      for (const chunk of petChunks) {
        const batch = writeBatch(db);
        for (const petSnap of chunk) {
          batch.update(petSnap.ref, PET_PAYLOAD);
        }
        await batch.commit();
      }

      // --- Phase B: Appointments -----------------------------------------------
      // Amendment 3: future non-terminal appointments are also cancelled.
      const nowMillis = now.toMillis();
      const appointmentChunks = chunkArray(appointmentDocs.docs, BATCH_SIZE);

      for (const chunk of appointmentChunks) {
        const batch = writeBatch(db);
        for (const apptSnap of chunk) {
          const data = apptSnap.data();
          const payload = { ...APPOINTMENT_BASE_PAYLOAD };

          const isFuture =
            data.scheduledDate &&
            data.scheduledDate.toMillis &&
            data.scheduledDate.toMillis() > nowMillis;

          const isCancellable =
            data.status && !NON_CANCELLABLE_STATUSES.has(data.status);

          if (isFuture && isCancellable) {
            Object.assign(payload, APPOINTMENT_CANCELLATION_PAYLOAD);
            payload.auditReasons = arrayUnion({ reason: 'RA 10173 erasure', action: 'erasure', staffName: 'System/Erasure', timestamp: Timestamp.now() });
          }

          batch.update(apptSnap.ref, payload);
        }
        await batch.commit();
      }

      // --- Phase C: Medical records --------------------------------------------
      // Amendment 5: dischargeSummary fields are only included when the record
      // already has a dischargeSummary object (prevents phantom sub-object creation).
      const recordChunks = chunkArray(recordDocs.docs, BATCH_SIZE);

      for (const chunk of recordChunks) {
        const batch = writeBatch(db);
        for (const recordSnap of chunk) {
          const payload = buildMedicalRecordPayload(recordSnap.data());
          batch.update(recordSnap.ref, payload);
        }
        await batch.commit();
      }

      // --- Phase D: Sales -------------------------------------------------------
      const saleChunks = chunkArray(saleDocs.docs, BATCH_SIZE);

      for (const chunk of saleChunks) {
        const batch = writeBatch(db);
        for (const saleSnap of chunk) {
          batch.update(saleSnap.ref, SALE_PAYLOAD);
        }
        await batch.commit();
      }

      // --- Phase E: User doc (LAST) ---------------------------------------------
      // accountStatus:"erased" is written here, after all downstream docs are done.
      // This guarantees that any interrupted run can be safely re-run by
      // checking accountStatus !== "erased" before executing.
      const userPayload = buildUserPayload(userId, adminUid);
      const finalBatch = writeBatch(db);
      finalBatch.update(userDoc.ref, userPayload);
      await finalBatch.commit();

      // --- Phase F: Audit log ---------------------------------------------------
      // Written via addDoc after all batch commits succeed.
      // entityName uses the anonymized ID — no original PII stored in the log.
      await addDoc(collection(db, 'settings_logs'), {
        action: 'ERASURE',
        entityType: 'user',
        entityName: `erased_${userId}`,
        performedBy: adminName,
        performedAt: Timestamp.now(),
        details: {
          affectedPets: scanResult.petCount,
          affectedAppointments: scanResult.appointmentCount,
          affectedRecords: scanResult.recordCount,
          affectedSales: scanResult.saleCount,
          totalDocuments: scanResult.totalDocuments,
        },
      });

      // --- Phase G: Consent withdrawal record (Step 6.3) ------------------------
      // Non-fatal: erasure is already complete at this point. A failure here
      // must not surface as an erasure failure to the admin.
      try {
        const existingWithdrawalSnap = await getDocs(
          query(
            collection(db, 'users', userId, 'consent_records'),
            where('action', '==', 'withdrawn'),
            limit(1),
          ),
        );

        if (existingWithdrawalSnap.empty) {
          await addDoc(collection(db, 'users', userId, 'consent_records'), {
            consentType: 'dpa',
            versionNumber: null,
            versionDocId: null,
            action: 'withdrawn',
            signatureType: null,
            signatureData: null,
            grantedAt: Timestamp.now(),
            grantedVia: 'admin_portal',
            deviceInfo: 'admin',
            adminNote: 'Withdrawal recorded as part of RA 10173 erasure',
          });
        }
      } catch (phaseGErr) {
        console.error('[useErasureEngine.executeErasure Phase G]:', phaseGErr.message);
      }
    } catch (err) {
      const message = `[useErasureEngine.executeErasure]: ${err.message}`;
      console.error(message, err);
      setError(message);
      throw err;
    } finally {
      setExecuting(false);
    }
  }

  return { scanForErasure, executeErasure, scanning, executing, counts, error };
}
