/**
 * useClosingStatus.js — Lightweight hook for components that render POSModal
 * but don't have access to the full useSalesData hook (T4.151).
 *
 * Subscribes to a single daily_closings/{dateStr} doc and exposes
 * isDayClosed + closingData so POSModal can tag post-close sales.
 */
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

/**
 * @param {string} dateStr - ISO date string in YYYY-MM-DD format (e.g. '2026-05-04').
 * @returns {{ isDayClosed: boolean, closingData: object|null }}
 */
export function useClosingStatus(dateStr) {
  const [closingData, setClosingData] = useState(null);

  useEffect(() => {
    if (!dateStr) return;
    const unsub = onSnapshot(
      doc(db, 'daily_closings', dateStr),
      (snap) => {
        setClosingData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      },
      (err) => {
        console.error('[useClosingStatus]:', err);
      },
    );
    return unsub;
  }, [dateStr]);

  // isDayClosed is false when there's no closing doc, or when the day was reopened.
  const isDayClosed = closingData !== null && !closingData.reopenedAt;
  return { isDayClosed, closingData };
}
