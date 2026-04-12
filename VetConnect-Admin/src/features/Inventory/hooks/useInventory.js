import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, increment, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { useUser } from '../../../context/UserContext';

// ── Field Diff Engine ────────────────────────────────────────────────────
// Compares before/after snapshots of a product and returns a human-readable
// summary of exactly what changed, e.g. "Retail Price: ₱50.00 → ₱500.00 | Category: vaccine → medicine"
const FIELD_LABELS = {
  itemName:   'Product Name',
  category:   'Category',
  price:      'Retail Price',
  costPrice:  'Cost Price',
  minStock:   'Min Stock Threshold',
  sku:        'SKU',
  dosage:     'Dosage',
  unit:       'Unit',
  location:   'Storage Location',
  supplier:   'Supplier',
  lotNumber:  'Lot / Batch Number',
  expiryDate: 'Expiry Date',
};
const MONEY_FIELDS = new Set(['price', 'costPrice']);

const diffFields = (before, after) => {
  const changes = [];
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const oldVal = String(before[key] ?? '').trim();
    const newVal = String(after[key]  ?? '').trim();
    if (oldVal === newVal) continue;
    if (MONEY_FIELDS.has(key)) {
      changes.push(`${label}: ₱${Number(before[key] || 0).toFixed(2)} → ₱${Number(after[key] || 0).toFixed(2)}`);
    } else {
      const o = oldVal || '(empty)';
      const n = newVal || '(empty)';
      changes.push(`${label}: "${o}" → "${n}"`);
    }
  }
  return changes.length > 0 ? changes.join(' | ') : 'Minor details updated (no tracked field changed)';
};
// ───────────────────────────────────────────────────────────────────────────────

export function useInventory() {
  const [inventory, setInventory] = useState([]);
  const[loading, setLoading] = useState(true);

  // READ
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "inventory"), (snap) => {
      const list = snap.docs.map(d => {
        const data = d.data();
        // SELF-HEALING: Ensure 'reserved' exists for every item
        return { 
          id: d.id, 
          ...data, 
          reserved: data.reserved ?? 0 
        };
      });
      list.sort((a,b) => (a.itemName || '').localeCompare(b.itemName || ''));
      setInventory(list);
      setLoading(false);
    });
    return () => unsub();
  },[]);

  const { profile } = useUser();

  // --- THE AUDIT LEDGER ENGINE ---
  const logEvent = async (itemId, itemName, action, amountChange, reason = "System Action") => {
    try {
      await addDoc(collection(db, "inventory_logs"), {
        itemId,
        itemName,
        action, // "CREATED", "UPDATED", "DELETED", "ADJUSTED"
        amountChange,
        reason,
        userId: profile?.id || "unknown",
        userName: profile?.fullName || "System Admin",
        timestamp: serverTimestamp()
      });
    } catch(e) { console.error("Audit Ledger failed to securely write event:", e); }
  };

  // CREATE
  const createItem = async (data) => {
    const { openingStock, ...itemData } = data;
    const initialStock = Number(openingStock) || 0;
    const cleanData = { ...itemData, category: (itemData.category || '').trim().toLowerCase() };
    if (cleanData.lotNumber && cleanData.expiryDate && initialStock > 0) {
      cleanData.batches = [{
        batchNumber: cleanData.lotNumber,
        expiryDate: cleanData.expiryDate,
        qty: initialStock
      }];
    }
    const docRef = await addDoc(collection(db, "inventory"), { ...cleanData, stock: initialStock, reserved: 0 });
    await logEvent(docRef.id, itemData.itemName, "CREATED", 0, "Initial Product Entry");
    if (initialStock > 0) {
      await logEvent(docRef.id, itemData.itemName, "ADJUSTED", initialStock, `Opening stock: ${initialStock} unit(s) set at creation`);
    }
  };

  // UPDATE — diffs before/after and logs exactly what changed
  const updateItem = async (id, data, originalItem = null) => {
    const cleanData = { ...data };
    if (cleanData.category) cleanData.category = cleanData.category.trim().toLowerCase();
    await updateDoc(doc(db, "inventory", id), cleanData);
    const logMessage = originalItem
      ? diffFields(originalItem, cleanData)
      : 'Details modified (no before-state provided)';
    await logEvent(id, cleanData.itemName || originalItem?.itemName || 'Unknown Product', "UPDATED", 0, logMessage);
  };

  // DELETE
  const deleteItem = async (id, itemName) => {
    await deleteDoc(doc(db, "inventory", id));
    await logEvent(id, itemName || "Unknown", "DELETED", 0, "Permanently Removed from Database");
  };

  // ARCHIVE (SOFT-DELETE)
  const archiveItem = async (id, itemName) => {
    await updateDoc(doc(db, "inventory", id), {
      isArchived: true,
      archivedAt: serverTimestamp(),
    });
    await logEvent(id, itemName || "Unknown", "ARCHIVED", 0, "Product archived (soft-deleted)");
  };

  // RESTORE
  const restoreItem = async (id, itemName) => {
    await updateDoc(doc(db, "inventory", id), {
      isArchived: false,
      restoredAt: serverTimestamp(),
    });
    await logEvent(id, itemName || "Unknown", "RESTORED", 0, "Product restored from archive");
  };

  // ADJUST STOCK (+ or -)
  const adjustStock = async (id, itemName, amount, reason) => {
    if(!amount) throw new Error("Amount must be non-zero");
    if(!reason) throw new Error("A Medical Reason must be provided to adjust stock.");
    
    await updateDoc(doc(db, "inventory", id), {
      stock: increment(amount)
    });
    
    await logEvent(id, itemName, "ADJUSTED", amount, reason);
  };

  // --- THE SOFT-RESERVE ENGINE ---
  const reserveStock = async (id, qty) => {
    if (!qty || qty <= 0) return;
    await updateDoc(doc(db, "inventory", id), {
      reserved: increment(qty)
    });
  };

  const releaseStock = async (id, qty) => {
    if (!qty || qty <= 0) return;
    await updateDoc(doc(db, "inventory", id), {
      reserved: increment(-qty)
    });
  };

  // SCRUB DATABASE
  const scrubDatabase = async () => {
    try {
      const catsSnap = await getDocs(collection(db, "inventory_categories"));
      const invSnap = await getDocs(collection(db, "inventory"));
      const batch = writeBatch(db);
      
      const catMap = new Map(); // lowercase -> first seen ID
      let modifications = 0;

      const medicalKeywords = ['medicine', 'vaccine', 'drug', 'pharmaceutical', 'medication'];
      
      catsSnap.forEach(doc => {
        const data = doc.data();
        const name = data.name || '';
        const lowerName = name.trim().toLowerCase();
        const isMedicine = medicalKeywords.includes(lowerName);

        if (!catMap.has(lowerName)) {
           catMap.set(lowerName, doc.id);
           
           // Migration Logic: Fix name and/or add missing isMedicine flag
           if (name !== lowerName || data.isMedicine === undefined) {
             batch.update(doc.ref, { 
               name: lowerName,
               isMedicine: data.isMedicine ?? isMedicine // Default if missing
             });
             modifications++;
           }
        } else {
           // Duplicate! Delete the orphaned duplicate category
           batch.delete(doc.ref);
           modifications++;
        }
      });

      // Update all items to use lowercase
      invSnap.forEach(doc => {
        const cat = doc.data().category || '';
        const lowerCat = cat.trim().toLowerCase();
        if (cat !== lowerCat) {
          batch.update(doc.ref, { category: lowerCat });
          modifications++;
        }
      });

      if (modifications > 0) {
        await batch.commit();
        await logEvent("SYSTEM", "Database Scrub", "ADJUSTED", 0, `Scrub normalized ${modifications} record(s): duplicates removed, category casing fixed`);
        console.log(`Scrubbed ${modifications} duplicate/uppercase records!`);
      }
      return modifications;
    } catch(e) {
      console.error("Scrub error", e);
      throw e;
    }
  };

  return { inventory, loading, createItem, updateItem, deleteItem: archiveItem, permanentlyDeleteItem: deleteItem, restoreItem, adjustStock, scrubDatabase, reserveStock, releaseStock };
}