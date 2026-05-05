import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, Timestamp, getDocs, query, where, deleteField, limit } from 'firebase/firestore';
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
  dischargePolicy:   'Discharge Policy',
  requiresDiagnosis: 'Diagnosis Requirement',
  isScPwdEligible:   'SC/PWD Eligible',
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
  // Pricing tiers diff — toggle
  if (Boolean(before.hasTieredPricing) !== Boolean(after.hasTieredPricing)) {
    changes.push(`Tiered Pricing: "${before.hasTieredPricing ? 'ON' : 'OFF'}" → "${after.hasTieredPricing ? 'ON' : 'OFF'}"`);
  }
  // Pricing tiers diff — individual tier content
  if (after.hasTieredPricing || before.hasTieredPricing) {
    const oldTiers = before.pricingTiers || [];
    const newTiers = after.pricingTiers  || [];
    const maxLen = Math.max(oldTiers.length, newTiers.length);
    for (let i = 0; i < maxLen; i++) {
      const ot = oldTiers[i];
      const nt = newTiers[i];
      if (!ot && nt) {
        changes.push(`Tier ${i + 1} added: ${nt.minWeight}-${nt.maxWeight || '∞'}kg @ ₱${Number(nt.price || 0).toFixed(2)}`);
      } else if (ot && !nt) {
        changes.push(`Tier ${i + 1} removed: ${ot.minWeight}-${ot.maxWeight || '∞'}kg @ ₱${Number(ot.price || 0).toFixed(2)}`);
      } else if (ot && nt) {
        const diffs = [];
        if (Number(ot.minWeight) !== Number(nt.minWeight)) diffs.push(`Min: ${ot.minWeight}→${nt.minWeight}kg`);
        if (Number(ot.maxWeight) !== Number(nt.maxWeight)) diffs.push(`Max: ${ot.maxWeight}→${nt.maxWeight}kg`);
        if (Number(ot.price) !== Number(nt.price)) diffs.push(`₱${Number(ot.price || 0).toFixed(2)}→₱${Number(nt.price || 0).toFixed(2)}`);
        if (diffs.length > 0) changes.push(`Tier ${i + 1}: ${diffs.join(', ')}`);
      }
    }
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
      dischargePolicy:   formData.dischargePolicy   || 'optional',
      requiresDiagnosis: formData.requiresDiagnosis || 'required',
      isScPwdEligible:   formData.isScPwdEligible !== false,
    };

    if (editId) {
      // Grab snapshot before update for diff
      const before = services.find(s => s.id === editId) || {};
      await updateDoc(doc(db, "services", editId), { ...payload, updatedAt: serverTimestamp() });
      const changesSummary = diffFields(before, payload);
      await logServiceEvent(editId, payload.name, "UPDATED", "Service configuration updated", changesSummary);
    } else {
      const docRef = await addDoc(collection(db, "services"), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await logServiceEvent(docRef.id, payload.name, "CREATED", "New service created", "");
    }
  };

  // ── Active-Appointment Guard ──────────────────────────────────
  const NON_TERMINAL_STATUSES = ['pending', 'confirmed', 'arrived', 'in-consult', 'dispensing', 'billing'];

  const checkActiveAppointments = async (serviceName) => {
    const q = query(
      collection(db, "appointments"),
      where("status", "in", NON_TERMINAL_STATUSES),
      limit(500)
    );
    const snap = await getDocs(q);
    const matches = snap.docs.filter(d => {
      const data = d.data();
      const svcList = Array.isArray(data.services) ? data.services : [];
      return svcList.some(s => s?.name === serviceName)
        || data.primaryService === serviceName
        || data.serviceType === serviceName;
    });
    return matches.length;
  };
  // ──────────────────────────────────────────────────────────────

  const archiveService = async (id) => {
    const svc = services.find(s => s.id === id);
    const name = svc?.name || id;
    const activeCount = await checkActiveAppointments(name);
    if (activeCount > 0) {
      throw new Error(`Cannot archive "${name}" — ${activeCount} active appointment(s) reference this service. Complete or cancel them first.`);
    }
    await updateDoc(doc(db, "services", id), {
      isArchived:  true,
      archivedAt:  Timestamp.now(),
    });
    await logServiceEvent(id, name, "ARCHIVED", "Service archived by admin", "");
  };

  const restoreService = async (id) => {
    const svc = services.find(s => s.id === id);
    await updateDoc(doc(db, "services", id), {
      isArchived:  false,
      restoredAt:  Timestamp.now(),
      archivedAt:  deleteField(),
    });
    await logServiceEvent(id, svc?.name || id, "RESTORED", "Service restored by admin", "");
  };

  // Hard-delete kept for admin emergency use (bypasses soft-delete)
  const removeService = async (id) => {
    const svc = services.find(s => s.id === id);
    const name = svc?.name || id;
    const activeCount = await checkActiveAppointments(name);
    if (activeCount > 0) {
      throw new Error(`Cannot delete "${name}" — ${activeCount} active appointment(s) reference this service. Complete or cancel them first.`);
    }
    await deleteDoc(doc(db, "services", id));
    await logServiceEvent(id, name, "DELETED", "Service permanently deleted", "");
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
