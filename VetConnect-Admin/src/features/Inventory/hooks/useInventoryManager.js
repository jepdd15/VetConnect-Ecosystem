import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, runTransaction, Timestamp, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

export function useInventoryManager() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. REAL-TIME INVENTORY SYNC
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "inventory"), (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a,b) => (a.itemName || '').localeCompare(b.itemName || ''));
      setProducts(list);
      setLoading(false);
    });
    return () => unsubscribe();
  },[]);

  // 2. SMART STOCK CALCULATOR
  const getStockDetails = (item) => {
    if (!item.batches || item.batches.length === 0) return { active: item.stock || 0, expired: 0 };
    let active = 0; let expired = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    item.batches.forEach(b => {
      if (b.qty > 0) {
          const expDate = new Date(b.expiryDate);
          if (expDate < today) expired += b.qty;
          else active += b.qty;
      }
    });
    return { active, expired };
  };

  // 3. FETCH AUDIT LOGS
  const fetchItemHistory = async (itemId) => {
    const q = query(collection(db, "inventory_logs"), where("itemId", "==", itemId), orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  };

  // 4. TRANSACTION ENGINE (FIFO & RECONCILIATION)
  const executeAdjustment = async (item, type, qtyInput, reason, batchNum, expDate, uomType, selectedBatchOverride) => {
    const inputQty = parseInt(qtyInput);
    if (isNaN(inputQty)) throw new Error("Invalid quantity.");

    await runTransaction(db, async (transaction) => {
      const itemRef = doc(db, "inventory", item.id);
      const itemDoc = await transaction.get(itemRef);
      if (!itemDoc.exists()) throw new Error("Item not found");

      const data = itemDoc.data();
      let currentStock = data.stock || 0;
      let batches =[...(data.batches || [])];
      let finalQtyLog = inputQty;
      let logNote = "";
      let batchInfo = "FIFO Deduction";

      // --- RECONCILE (AUDIT) ---
      if (type === 'reconcile') {
        const variance = inputQty - currentStock;
        if (variance === 0) throw new Error("Match! No adjustment needed.");
        if (variance > 0) {
            if (!batchNum || !expDate) throw new Error("Batch info required for found stock.");
            batches.push({ batchNumber: batchNum, expiryDate: expDate, qty: variance, dateAdded: new Date().toISOString() });
            currentStock += variance;
            batchInfo = `Found Batch: ${batchNum}`;
        } else {
            const missing = Math.abs(variance);
            batches = deductFromBatches(batches, missing, selectedBatchOverride);
            currentStock -= missing;
        }
        finalQtyLog = variance;
      } 
      // --- RESTOCK ---
      else if (type === 'restock') {
        let added = inputQty;
        if (uomType === 'purchase') {
            added = inputQty * (data.conversionFactor || 1);
            logNote = `(Bulk: ${inputQty} ${data.uomPurchase})`;
        }
        if (!batchNum || !expDate) throw new Error("Batch info required.");
        batches.push({ batchNumber: batchNum, expiryDate: expDate, qty: added, dateAdded: new Date().toISOString() });
        currentStock += added;
        finalQtyLog = added;
        batchInfo = `Batch: ${batchNum}`;
      } 
      // --- WASTAGE / INTERNAL USE ---
      else {
        batches = deductFromBatches(batches, inputQty, selectedBatchOverride);
        currentStock -= inputQty;
      }

      // Commit update
      transaction.update(itemRef, { stock: currentStock, batches });

      // Write Log
      const logRef = doc(collection(db, "inventory_logs"));
      transaction.set(logRef, {
        itemId: item.id, itemName: data.itemName, type, quantity: finalQtyLog,
        reason: `${reason} ${logNote}`.trim(), oldStock: data.stock, newStock: currentStock,
        batchInfo, user: "Admin", timestamp: Timestamp.now()
      });
    });
  };

  const deductFromBatches = (batches, qtyToRemove, overrideNum) => {
    let remaining = qtyToRemove;
    if (overrideNum && overrideNum !== 'auto') {
        const idx = batches.findIndex(b => b.batchNumber === overrideNum);
        if (idx === -1 || batches[idx].qty < qtyToRemove) throw new Error("Selected batch insufficient.");
        batches[idx].qty -= qtyToRemove;
        return batches;
    }
    return batches.sort((a,b) => new Date(a.expiryDate) - new Date(b.expiryDate)).map(b => {
      if (remaining <= 0 || b.qty <= 0) return b;
      const take = Math.min(b.qty, remaining);
      b.qty -= take;
      remaining -= take;
      return b;
    });
  };

  return { products, loading, getStockDetails, executeAdjustment, fetchItemHistory };
}