import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Fetches recent no-show appointments for the given pet IDs.
 *
 * Firestore does not allow two inequality filters on different fields in the
 * same query. We filter by `status == 'no-show'` in Firestore and apply the
 * date-range check client-side after the snapshot arrives.
 *
 * Batches petIds in groups of 30 (Firestore `in` operator limit).
 *
 * @param {string[]} petIds     - Array of pet document IDs to check.
 * @param {number}   windowDays - Lookback window in days (default: 30).
 * @returns {Promise<{ count: number, mostRecent: object|null }>}
 */
export async function detectNoShows(petIds, windowDays = 30) {
  if (!petIds || petIds.length === 0) return { count: 0, mostRecent: null };

  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - windowDays);

  // Batch petIds to respect Firestore's 30-value `in` limit
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
      const data = { id: d.id, ...d.data() };

      // Client-side date filter: Firestore allows only one inequality per query
      const rawDate = data.scheduledDate;
      const apptDate = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate);
      if (!isNaN(apptDate.getTime()) && apptDate >= cutoff) {
        allNoShows.push(data);
      }
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
