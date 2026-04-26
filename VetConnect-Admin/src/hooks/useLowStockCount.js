import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Returns the real-time count of non-archived inventory items that are at or
 * below their minStock threshold (including completely out-of-stock items).
 *
 * Mirrors the KPI logic in Inventory.jsx: low stock = stock > 0 && stock <= min,
 * out of stock = stock <= 0. Both conditions warrant a reorder alert so this
 * hook returns their combined count.
 *
 * The hook lives at App level so the Sidebar badge is always active regardless
 * of which page is open, without duplicating the Firestore listener inside the
 * Sidebar component itself.
 *
 * @returns {number} Combined low-stock + out-of-stock count
 */
export function useLowStockCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventory'), (snap) => {
      let alertCount = 0;
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.isArchived) return;
        const stock = Number(data.stock) || 0;
        const min = Number(data.minStock) || 10;
        // stock <= min covers both low-stock (0 < stock <= min) and out-of-stock (stock <= 0)
        if (stock <= min) alertCount++;
      });
      setCount(alertCount);
    });

    return () => unsub();
  }, []);

  return count;
}
