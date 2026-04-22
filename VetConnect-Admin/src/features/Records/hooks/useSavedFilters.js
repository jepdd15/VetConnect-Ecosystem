import { useState, useEffect } from 'react';
import { collection, doc, addDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

export function useSavedFilters(userId) {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setPresets([]); setLoading(false); return; }

    const presetsRef = collection(db, "users", userId, "recordFilterPresets");
    const unsub = onSnapshot(presetsRef, (snap) => {
      setPresets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [userId]);

  const savePreset = async (name, filterState) => {
    if (!userId) return;
    const presetsRef = collection(db, "users", userId, "recordFilterPresets");
    await addDoc(presetsRef, {
      name,
      filterState,
      createdAt: serverTimestamp(),
    });
  };

  const deletePreset = async (presetId) => {
    if (!userId) return;
    await deleteDoc(doc(db, "users", userId, "recordFilterPresets", presetId));
  };

  return { presets, loading, savePreset, deletePreset };
}
