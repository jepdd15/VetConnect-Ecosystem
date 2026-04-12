/**
 * ONE-TIME MIGRATION: Normalize legacy status aliases in the appointments collection.
 *
 * Run this from the admin dashboard's browser console:
 *   import { runStatusMigration } from './migrations/normalizeStatuses';
 *   runStatusMigration();
 *
 * Or wire it to a hidden admin button.
 *
 * SAFE TO RUN MULTIPLE TIMES — idempotent (only updates docs that match legacy aliases).
 *
 * Legacy aliases and their canonical replacements:
 *   "scheduled" -> "confirmed"
 *   "done"      -> "completed"
 *   "pharmacy"  -> "dispensing"
 *   "dispense"  -> "dispensing"
 *   "payment"   -> "billing"
 *   "admitted"  -> "confined"
 */
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const ALIAS_MAP = {
  'scheduled': 'confirmed',
  'done':      'completed',
  'pharmacy':  'dispensing',
  'dispense':  'dispensing',
  'payment':   'billing',
  'admitted':  'confined',
};

export async function runStatusMigration() {
  const aliases = Object.keys(ALIAS_MAP);
  let totalUpdated = 0;

  console.log('[Migration] Starting legacy status normalization...');

  for (const alias of aliases) {
    const canonical = ALIAS_MAP[alias];
    const q = query(collection(db, 'appointments'), where('status', '==', alias));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log(`[Migration] No documents with status="${alias}". Skipping.`);
      continue;
    }

    // Firestore batches support max 500 writes
    const batches = [];
    let currentBatch = writeBatch(db);
    let count = 0;

    snapshot.docs.forEach((docSnap) => {
      currentBatch.update(doc(db, 'appointments', docSnap.id), { status: canonical });
      count++;
      if (count % 500 === 0) {
        batches.push(currentBatch);
        currentBatch = writeBatch(db);
      }
    });
    batches.push(currentBatch);

    for (const batch of batches) {
      await batch.commit();
    }

    console.log(`[Migration] Updated ${snapshot.size} documents: "${alias}" -> "${canonical}"`);
    totalUpdated += snapshot.size;
  }

  console.log(`[Migration] COMPLETE. Total documents updated: ${totalUpdated}`);
  return totalUpdated;
}
