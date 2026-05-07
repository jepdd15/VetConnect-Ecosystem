import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Fetches ALL no-show appointments for the given pet IDs (full history).
 *
 * Batches petIds in groups of 30 (Firestore `in` operator limit).
 *
 * @param {string[]} petIds - Array of pet document IDs to check.
 * @returns {Promise<{ count: number, mostRecent: object|null }>}
 */
export async function detectNoShows(petIds) {
  if (!petIds || petIds.length === 0) return { count: 0, mostRecent: null };

  const batches = [];
  for (let i = 0; i < petIds.length; i += 30) {
    batches.push(petIds.slice(i, i + 30));
  }

  const allNoShows = [];

  for (const batch of batches) {
    const q = query(
      collection(db, 'appointments'),
      where('petId', 'in', batch),
      where('status', '==', 'no-show'),
    );
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      allNoShows.push({ id: d.id, ...d.data() });
    });
  }

  if (allNoShows.length === 0) return { count: 0, mostRecent: null };

  // Sort descending by scheduled date to surface the most recent no-show first
  allNoShows.sort((a, b) => {
    const toMs = (d) => {
      const raw = d.scheduledDate;
      const date = raw?.toDate ? raw.toDate() : new Date(raw);
      return date.getTime();
    };
    return toMs(b) - toMs(a);
  });

  return { count: allNoShows.length, mostRecent: allNoShows[0] };
}
