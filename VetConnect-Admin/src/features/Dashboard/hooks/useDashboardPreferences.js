/**
 * useDashboardPreferences — Per-user KPI layout persistence hook (T4.2).
 *
 * Reads and writes dashboard layout preferences from/to the user's Firestore
 * document at `users/{uid}` under the `dashboardPreferences.layouts` field.
 * New or missing tabs fall back to DEFAULT_LAYOUTS so adding KPI cards in
 * future sessions is always backward-compatible.
 *
 * Returns:
 *   layouts      — merged layout object (saved tabs override defaults)
 *   saveLayout   — (tabKey, layout) => void  — persists one tab's layout
 *   resetLayouts — () => void  — restores all tabs to DEFAULT_LAYOUTS
 *   loading      — true until the first Firestore snapshot resolves
 */

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { useUser } from '../../../context/UserContext';
import { DEFAULT_LAYOUTS } from '../utils/defaultLayouts';

export function useDashboardPreferences() {
  const { user } = useUser();
  const [layouts, setLayouts] = useState(DEFAULT_LAYOUTS);
  const [loading, setLoading] = useState(true);

  // Listen for saved preferences on the user document.
  // Merges saved per-tab layouts with DEFAULT_LAYOUTS so any future tabs
  // added to DEFAULT_LAYOUTS will still appear for existing users.
  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const savedLayouts = snap.data()?.dashboardPreferences?.layouts;
        if (savedLayouts) {
          setLayouts({ ...DEFAULT_LAYOUTS, ...savedLayouts });
        }
        setLoading(false);
      },
      (err) => {
        console.error('[useDashboardPreferences]', err.message);
        setLoading(false);
      },
    );

    return unsub;
  }, [user?.uid]);

  // Persist one tab's layout to Firestore using merge:true so the rest
  // of the user document is not overwritten.
  const saveLayout = useCallback(async (tabKey, layout) => {
    if (!user?.uid) return;
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        { dashboardPreferences: { layouts: { [tabKey]: layout } } },
        { merge: true },
      );
    } catch (err) {
      console.error('[useDashboardPreferences] saveLayout:', err.message);
    }
  }, [user?.uid]);

  // Reset all layouts to defaults: apply optimistically in state first,
  // then persist to Firestore so the UI is immediately responsive.
  const resetLayouts = useCallback(async () => {
    if (!user?.uid) return;
    setLayouts(DEFAULT_LAYOUTS);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        { dashboardPreferences: { layouts: DEFAULT_LAYOUTS } },
        { merge: true },
      );
    } catch (err) {
      console.error('[useDashboardPreferences] resetLayouts:', err.message);
    }
  }, [user?.uid]);

  return { layouts, saveLayout, resetLayouts, loading };
}
