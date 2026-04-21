// src/features/Staff/hooks/useStaffManager.js
import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, query, where, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, firebaseConfig } from '../../../firebaseConfig';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

// ── Staff Field Diff Engine ──────────────────────────────────────────────
const STAFF_LABELS = {
  fullName:       'Full Name',
  email:          'Email',
  phone:          'Phone',
  accessLevel:    'Access Level',
  prcLicense:     'PRC License',
  address:        'Address',
  emergencyContacts: 'Emergency Registry',
};

const diffStaffFields = (before, after) => {
  const changes = [];

  // 1. Scalar Fields
  for (const [key, label] of Object.entries(STAFF_LABELS)) {
    if (key === 'emergencyContacts') continue; // Handle separately
    const oldVal = String(before[key] ?? '').trim();
    const newVal = String(after[key]  ?? '').trim();
    if (oldVal !== newVal) changes.push(`${label}: "${oldVal || '(empty)'}" → "${newVal || '(empty)'}"`);
  }

  // 2. Departments (array comparison)
  const oldDepts = (before.departments || []).sort().join(', ');
  const newDepts = (after.departments || []).sort().join(', ');
  if (oldDepts !== newDepts) changes.push(`Departments: [${oldDepts || 'none'}] → [${newDepts || 'none'}]`);

  // 3. Emergency Contacts (Deep Diff)
  const oldContacts = before.emergencyContacts || [];
  const newContacts = (after.emergencyContacts || []).map(c => ({
    name: (c.name || '').trim(),
    kinship: (c.kinship || '').trim(),
    phone: (c.phone || '').trim()
  }));

  if (JSON.stringify(oldContacts) !== JSON.stringify(newContacts)) {
    changes.push(`Emergency Registry: Update detected in ${newContacts.length} record(s).`);
  }

  return changes.length > 0 ? changes.join(' | ') : 'Minor profile update (no tracked field changed)';
};
// ─────────────────────────────────────────────────────────────────────────

// ── Temporary Password Generator ────────────────────────────────────────
const secureRandom = (max) => {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
};

const generateTempPassword = () => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;

  let pwd = [
    upper[secureRandom(upper.length)],
    lower[secureRandom(lower.length)],
    digits[secureRandom(digits.length)],
    special[secureRandom(special.length)],
  ];

  for (let i = 0; i < 8; i++) {
    pwd.push(all[secureRandom(all.length)]);
  }

  // Shuffle (Fisher-Yates)
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = secureRandom(i + 1);
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join('');
};

export function useStaffManager() {
  const [staffList, setStaffList] = useState([]);
  const [activeAppointments, setActiveAppointments] = useState([]);
  const [departments, setDepartments] = useState([]); // Dynamic Departments!
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Fetch Staff — server-side filter to avoid reading pet-owner documents (T2.218)
    const staffQuery = query(
      collection(db, "users"),
      where("role", "in", ["veterinarian", "staff", "admin", "groomer"])
    );
    const unsubStaff = onSnapshot(staffQuery, (snapshot) => {
      const list = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => !u.disabled);
      list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
      setStaffList(list);
      setLoading(false);
    });

    // 2. Fetch Active Appointments (For Workload) — include all active statuses (T2.214)
    const qAppts = query(collection(db, "appointments"), where("status", "in", ["arrived", "in-consult", "on-hold", "dispensing", "billing", "confined"]));
    const unsubAppts = onSnapshot(qAppts, (snapshot) => {
      // Include doc ID for consistent shape with other collections (T2.220)
      setActiveAppointments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 3. Fetch Dynamic Departments as a clean string array
    const unsubDepts = onSnapshot(collection(db, "departments"), (snapshot) => {
      const depts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      depts.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
      setDepartments(depts);
    });

    return () => { unsubStaff(); unsubAppts(); unsubDepts(); };
  },[]);

  const getWorkload = (vetId) => {
    return activeAppointments.filter(a => a.assignedVetId === vetId).length;
  };

  // ── Audit Ledger ─────────────────────────────────────────────────────────
  const logStaffEvent = async (staffId, staffName, action, details = '') => {
    try {
      await addDoc(collection(db, 'staff_logs'), {
        staffId,
        staffName,
        action,    // CREATED | UPDATED | ACCESS_REVOKED
        details,
        timestamp: serverTimestamp(),
      });
    } catch (e) { console.error('Staff audit log write failed:', e); }
  };

  const saveStaff = async (editId, formData) => {
    // Check for the existence of the email before trying to trim it
    const email = formData.email ? formData.email.trim().toLowerCase() : '';

    if (!formData.fullName || !email) {
        throw new Error("Full Name and Email are required.");
    }

    // role is intentionally excluded — it is set only on create (T2.213)
    const payload = {
      fullName: formData.fullName,
      email: email,
      phone: formData.phone || '',
      accessLevel: formData.accessLevel,
      departments: formData.departments || [],
      prcLicense: formData.prcLicense || '',
      address: formData.address || '',
      emergencyContacts: formData.emergencyContacts || [],
      updatedAt: serverTimestamp(),
    };

    if (editId) {
      // Preserve existing role on edit — never overwrite veterinarian/groomer (T2.213)
      const originalStaff = staffList.find(s => s.id === editId);
      await updateDoc(doc(db, "users", editId), payload);
      const diffMessage = originalStaff ? diffStaffFields(originalStaff, payload) : 'Profile updated';
      await logStaffEvent(editId, payload.fullName, 'UPDATED', diffMessage);
    } else {
      payload.createdAt = serverTimestamp();

      // Secondary Firebase App so the admin doesn't get logged out
      const tempAppName = 'SecondaryApp' + Date.now();
      const secondaryApp = initializeApp(firebaseConfig, tempAppName);
      const secondaryAuth = getAuth(secondaryApp);

      try {
        const tempPassword = generateTempPassword();
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
        const newUid = userCredential.user.uid;

        // Set role only on create + mustChangePassword flag for T2.278
        await setDoc(doc(db, "users", newUid), { ...payload, role: formData.accessLevel, mustChangePassword: true });
        await logStaffEvent(newUid, payload.fullName, 'CREATED', `New ${payload.accessLevel} account authorized (${email})`);

        // Return the temp password so the caller can display it (T2.208)
        return { tempPassword, email };
      } catch (error) {
         throw new Error("Auth Failed: " + error.message);
      } finally {
        // Destroy the secondary session and app instance to prevent memory leaks (T2.210)
        await secondaryAuth.signOut();
        await deleteApp(secondaryApp);
      }
    }
  };

  const removeStaff = async (id) => {
    const staff = staffList.find(s => s.id === id);

    // Guard: check for active appointments assigned to this staff member (T2.211)
    const activeForStaff = activeAppointments.filter(a => a.assignedVetId === id);
    if (activeForStaff.length > 0) {
      throw new Error(
        `Cannot revoke: ${staff?.fullName || 'This staff member'} has ${activeForStaff.length} active patient(s). ` +
        `Reassign or complete their appointments first.`
      );
    }

    // Instead of deleting, flag the account as disabled to prevent Auth orphans
    await updateDoc(doc(db, "users", id), {
      disabled: true,
      disabledAt: serverTimestamp(),
      role: 'disabled',
      accessLevel: 'disabled',
    });
    await logStaffEvent(id, staff?.fullName || 'Unknown', 'ACCESS_REVOKED', 'System access revoked — account disabled');
  };

  return { staffList, activeAppointments, departments, loading, getWorkload, saveStaff, removeStaff };
}
