/**
 * consentMigration — one-time admin utility for migrating legacy boolean
 * consent fields to the new versioned consent_records system.
 *
 * Background:
 *   Before T3.5, consent was tracked via bare booleans: `dpaConsent` and
 *   `waiverSigned` on user documents. The new system uses a `consent_records`
 *   sub-collection with full audit data. This utility backfills those records
 *   for users who consented under the old system.
 *
 * Safety:
 *   - Idempotent: checks for existing consent_records before writing. Safe
 *     to run multiple times without creating duplicate records.
 *   - Supports a dry-run mode that counts eligible users without writing.
 *   - Processes in batches of 100 users (up to 4 writes per user, staying
 *     well under Firestore's 500-operation batch limit).
 */

import {
  collection,
  doc,
  getDocs,
  writeBatch,
  Timestamp,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Version number assigned to all migrated consent records. */
const MIGRATION_VERSION_NUMBER = 1;

/** Max users per batch. Each user needs at most 4 writes (2 records + 2 updates),
 *  so 100 users = ≤400 operations — safely under the 500-operation batch limit. */
const USERS_PER_BATCH = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the user's `users/{uid}/consent_records` sub-collection
 * already contains at least one document. Used to skip already-migrated users.
 *
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function hasExistingConsentRecords(userId) {
  const recordsRef = collection(db, 'users', userId, 'consent_records');
  const checkQuery = query(recordsRef, limit(1));
  const snap = await getDocs(checkQuery);
  return !snap.empty;
}

/**
 * Resolves the `grantedAt` timestamp for a migrated record.
 * Uses the user's `createdAt` field if available, otherwise falls back to now.
 *
 * @param {object} userData - Raw Firestore document data
 * @returns {import('firebase/firestore').Timestamp}
 */
function resolveGrantedAt(userData) {
  if (userData.createdAt instanceof Object && typeof userData.createdAt.toDate === 'function') {
    return userData.createdAt;
  }
  return Timestamp.now();
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Migrates existing pet_owner users from legacy boolean consent fields
 * (`dpaConsent`, `waiverSigned`) to the new versioned `consent_records`
 * sub-collection system.
 *
 * Eligibility criteria for a user to be migrated:
 *   - role === 'pet_owner'
 *   - has no existing consent_records (idempotency check)
 *   - has dpaConsent === true OR waiverSigned === true
 *
 * For each eligible user, writes:
 *   - A consent_record per boolean that is true (up to 2 per user)
 *   - Updates consentVersion / waiverVersion + corresponding GrantedAt fields
 *   - Does NOT touch the existing dpaConsent / waiverSigned booleans
 *
 * @param {string} adminName - Full name or email of the admin running the migration.
 *   Stored in the `adminNote` field of each created consent_record.
 * @param {object} [options]
 * @param {boolean} [options.dryRun=false] - If true, counts eligible users without
 *   writing any documents. Use this to preview the migration before executing.
 *
 * @returns {Promise<{
 *   migrated: number,
 *   skipped:  number,
 *   errors:   Array<{ userId: string, error: string }>,
 * }>}
 *
 * - `migrated`: users where at least one consent_record was written
 * - `skipped`:  users who already had consent_records or didn't meet eligibility
 * - `errors`:   individual per-user failures (migration continues past these)
 */
export async function migrateExistingConsents(adminName, options = {}) {
  const { dryRun = false } = options;
  const who = adminName || 'Unknown Admin';

  let migrated = 0;
  let skipped  = 0;
  const errors = [];

  // ── 1. Fetch all pet_owner users ────────────────────────────────────────
  // No accountStatus filter — we want ALL pet_owners, including admin-registered
  // ones, so that no legacy consent is lost.
  const usersRef  = collection(db, 'users');
  const petOwners = query(usersRef, where('role', '==', 'pet_owner'));
  const snapshot  = await getDocs(petOwners);

  // Collect users who have at least one legacy boolean set to true but have
  // not yet been assigned a consentVersion (the migration target population).
  const candidates = snapshot.docs.filter((docSnap) => {
    const data = docSnap.data();
    const hasDpa    = data.dpaConsent === true;
    const hasWaiver = data.waiverSigned === true;
    const alreadyMigrated =
      data.consentVersion != null || data.waiverVersion != null;

    return (hasDpa || hasWaiver) && !alreadyMigrated;
  });

  if (dryRun) {
    // In dry-run mode we still need to check for existing records to give an
    // accurate "would be migrated" count. Run the checks but write nothing.
    for (const docSnap of candidates) {
      try {
        const alreadyHasRecords = await hasExistingConsentRecords(docSnap.id);
        if (alreadyHasRecords) {
          skipped += 1;
        } else {
          migrated += 1;
        }
      } catch (err) {
        errors.push({ userId: docSnap.id, error: err.message });
      }
    }
    return { migrated, skipped, errors };
  }

  // ── 2. Process in batches of USERS_PER_BATCH ────────────────────────────
  for (let i = 0; i < candidates.length; i += USERS_PER_BATCH) {
    const chunk = candidates.slice(i, i + USERS_PER_BATCH);
    const batch = writeBatch(db);
    let batchHasWrites = false;
    let chunkMigrated = 0;

    for (const docSnap of chunk) {
      const userId  = docSnap.id;
      const data    = docSnap.data();

      try {
        // Idempotency gate: skip users who already have consent_records
        const alreadyHasRecords = await hasExistingConsentRecords(userId);
        if (alreadyHasRecords) {
          skipped += 1;
          continue;
        }

        const grantedAt = resolveGrantedAt(data);
        const userRef   = doc(db, 'users', userId);
        const userUpdatePayload = {};
        let userNeedsWrite = false;

        // ── DPA consent migration ──────────────────────────────────────────
        if (data.dpaConsent === true) {
          const dpaRecordRef = doc(collection(db, 'users', userId, 'consent_records'));
          batch.set(dpaRecordRef, {
            consentType:   'dpa',
            versionNumber: MIGRATION_VERSION_NUMBER,
            versionDocId:  null,
            action:        'granted',
            signatureType: 'checkbox',
            signatureData: null,
            grantedAt,
            grantedVia:    'migration',
            deviceInfo:    'migration',
            adminNote:     `Migrated from legacy boolean by ${who}`,
            ipAddress:     null,
          });

          userUpdatePayload.consentVersion   = MIGRATION_VERSION_NUMBER;
          userUpdatePayload.consentGrantedAt = grantedAt;
          userNeedsWrite = true;
        }

        // ── Waiver consent migration ───────────────────────────────────────
        if (data.waiverSigned === true) {
          const waiverRecordRef = doc(collection(db, 'users', userId, 'consent_records'));
          batch.set(waiverRecordRef, {
            consentType:   'waiver',
            versionNumber: MIGRATION_VERSION_NUMBER,
            versionDocId:  null,
            action:        'granted',
            signatureType: 'checkbox',
            signatureData: null,
            grantedAt,
            grantedVia:    'migration',
            deviceInfo:    'migration',
            adminNote:     `Migrated from legacy boolean by ${who}`,
            ipAddress:     null,
          });

          userUpdatePayload.waiverVersion   = MIGRATION_VERSION_NUMBER;
          userUpdatePayload.waiverGrantedAt = grantedAt;
          userNeedsWrite = true;
        }

        if (userNeedsWrite) {
          batch.update(userRef, userUpdatePayload);
          batchHasWrites = true;
          chunkMigrated += 1;
        } else {
          skipped += 1;
        }
      } catch (err) {
        console.error('[consentMigration] User', userId, ':', err.message);
        errors.push({ userId, error: err.message });
      }
    }

    // Commit this chunk's batch (skip if nothing to write — avoids a no-op commit)
    if (batchHasWrites) {
      try {
        await batch.commit();
        migrated += chunkMigrated;
      } catch (err) {
        console.error('[consentMigration] Batch commit failed:', err.message);
        chunk.forEach((docSnap) => {
          errors.push({ userId: docSnap.id, error: `Batch commit failed: ${err.message}` });
        });
      }
    }
  }

  return { migrated, skipped, errors };
}
