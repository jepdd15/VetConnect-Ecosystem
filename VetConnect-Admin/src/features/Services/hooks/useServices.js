import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { useUser } from '../../../context/UserContext';

// ── Field Diff Engine ────────────────────────────────────────────────────
const FIELD_LABELS = {
  name:         'Service Name',
  department:   'Department',
  price:        'Base Price',
  duration:     'Duration (mins)',
  bufferTime:   'Buffer Time (mins)',
  targetSpecies:'Target Species',
  description:  'SOP / Description',
  isWalkIn:     'Allow Walk-In',
  isInpatient:  'Req. Confinement',
  isEmergency:  'Is Emergency',
};
const MONEY_FIELDS = new Set(['price']);

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
  // Linked products diff
  const oldProducts = (before.linkedProducts || (before.linkedProduct ? [before.linkedProduct] : [])).join(',');
  const newProducts = (after.linkedProducts  || (after.linkedProduct  ? [after.linkedProduct]  : [])).join(',');
  if (oldProducts !== newProducts) {
    changes.push(`Linked Products: [${oldProducts || 'none'}] → [${newProducts || 'none'}]`);
  }
  // Pricing tiers diff
  if (Boolean(before.hasTieredPricing) !== Boolean(after.hasTieredPricing)) {
    changes.push(`Tiered Pricing: "${before.hasTieredPricing ? 'ON' : 'OFF'}" → "${after.hasTieredPricing ? 'ON' : 'OFF'}"`);
  }
  return changes.length > 0 ? changes.join(' | ') : 'Minor details updated (no tracked field changed)';
};
// ────────────────────────────────────────────────────────────────────────

export function useServices() {
  const [services, setServices] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const { profile } = useUser();

  useEffect(() => {
    const unsubServices = onSnapshot(collection(db, "services"), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setServices(list);
      setLoading(false);
    });

    const unsubInventory = onSnapshot(collection(db, "inventory"), (snapshot) => {
      setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubDepts = onSnapshot(collection(db, "departments"), (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setDepartments(list);
    });

    return () => { unsubServices(); unsubInventory(); unsubDepts(); };
  }, []);

  // ── Audit Ledger Engine ──────────────────────────────────────────────
  const logServiceEvent = async (serviceId, serviceName, action, reason = "System Action", changes = "") => {
    try {
      await addDoc(collection(db, "service_logs"), {
        serviceId,
        serviceName,
        action, // "CREATED", "UPDATED", "ARCHIVED", "RESTORED", "DELETED"
        reason,
        changes,
        userId:   profile?.id       || "unknown",
        userName: profile?.fullName || "System Admin",
        timestamp: serverTimestamp(),
      });
    } catch (e) {
      console.error("Service audit ledger failed to write:", e);
    }
  };
  // ────────────────────────────────────────────────────────────────────

  const saveService = async (editId, formData) => {
    const departmentName = formData.department || 'General';

    // linkedProducts: persist array + keep backward-compat singular key
    const linkedProducts = formData.linkedProducts || (formData.linkedProduct ? [formData.linkedProduct] : []);

    const payload = {
      ...formData,
      price:        Number(formData.price)       || 0,
      duration:     Number(formData.duration)    || 30,
      bufferTime:   Number(formData.bufferTime)  || 0,
      department:   departmentName,
      category:     departmentName, // legacy key
      linkedProducts,
      linkedProduct: linkedProducts[0] || '', // backward compat
      hasTieredPricing: Boolean(formData.hasTieredPricing),
      pricingTiers:    formData.pricingTiers || [],
    };

    if (editId) {
      // Grab snapshot before update for diff
      const before = services.find(s => s.id === editId) || {};
      await updateDoc(doc(db, "services", editId), payload);
      const changesSummary = diffFields(before, payload);
      await logServiceEvent(editId, payload.name, "UPDATED", "Service configuration updated", changesSummary);
    } else {
      const docRef = await addDoc(collection(db, "services"), payload);
      await logServiceEvent(docRef.id, payload.name, "CREATED", "New service created", "");
    }
  };

  const archiveService = async (id) => {
    const svc = services.find(s => s.id === id);
    await updateDoc(doc(db, "services", id), {
      isArchived:  true,
      archivedAt:  Timestamp.now(),
    });
    await logServiceEvent(id, svc?.name || id, "ARCHIVED", "Service archived by admin", "");
  };

  const restoreService = async (id) => {
    const svc = services.find(s => s.id === id);
    await updateDoc(doc(db, "services", id), {
      isArchived:  false,
      restoredAt:  Timestamp.now(),
    });
    await logServiceEvent(id, svc?.name || id, "RESTORED", "Service restored by admin", "");
  };

  // Hard-delete kept for admin emergency use (bypasses soft-delete)
  const removeService = async (id) => {
    const svc = services.find(s => s.id === id);
    await logServiceEvent(id, svc?.name || id, "DELETED", "Service permanently deleted", "");
    await deleteDoc(doc(db, "services", id));
  };

  return {
    services,
    inventory,
    departments,
    loading,
    saveService,
    archiveService,
    restoreService,
    removeService,
  };
}
