import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, increment } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

export function useInventory() {
  const [inventory, setInventory] = useState([]);
  const[loading, setLoading] = useState(true);

  // READ
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "inventory"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a,b) => (a.itemName || '').localeCompare(b.itemName || ''));
      setInventory(list);
      setLoading(false);
    });
    return () => unsub();
  },[]);

  // CREATE
  const createItem = async (data) => {
    await addDoc(collection(db, "inventory"), { ...data, stock: 0 });
  };

  // UPDATE
  const updateItem = async (id, data) => {
    await updateDoc(doc(db, "inventory", id), data);
  };

  // DELETE
  const deleteItem = async (id) => {
    await deleteDoc(doc(db, "inventory", id));
  };

  // ADJUST STOCK (+ or -)
  const adjustStock = async (id, amount) => {
    await updateDoc(doc(db, "inventory", id), {
      stock: increment(amount)
    });
  };

  return { inventory, loading, createItem, updateItem, deleteItem, adjustStock };
}