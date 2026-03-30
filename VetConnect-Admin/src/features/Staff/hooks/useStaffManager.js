// src/features/Staff/hooks/useStaffManager.js
import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, query, where, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, firebaseConfig } from '../../../firebaseConfig';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

// ── Staff Field Diff Engine ──────────────────────────────────────────────
const STAFF_LABELS = {
  fullName:       'Full Name',
  email:          'Email',
  phone:          'Phone',
  specialty:      'Specialty Tag',
  accessLevel:    'Access Level',
  prcLicense:     'PRC License',
  employmentType: 'Employment Type',
  hireDate:       'Hire Date',
  address:        'Address',
  emergencyName:  'Emergency Contact',
  emergencyPhone: 'Emergency Phone',
  notes:          'Internal Notes',
};
const diffStaffFields = (before, after) => {
  const changes = [];
  for (const [key, label] of Object.entries(STAFF_LABELS)) {
    const oldVal = String(before[key] ?? '').trim();
    const newVal = String(after[key]  ?? '').trim();
    if (oldVal !== newVal) changes.push(`${label}: "${oldVal || '(empty)'}" → "${newVal || '(empty)'}"`);
  }
  // Departments (array comparison)
  const oldDepts = (before.departments || []).sort().join(', ');
  const newDepts = (after.departments || []).sort().join(', ');
  if (oldDepts !== newDepts) changes.push(`Departments: [${oldDepts || 'none'}] → [${newDepts || 'none'}]`);
  return changes.length > 0 ? changes.join(' | ') : 'Minor profile update (no tracked field changed)';
};
// ─────────────────────────────────────────────────────────────────────────

export function useStaffManager() {
  const [staffList, setStaffList] = useState([]);
  const [activeAppointments, setActiveAppointments] = useState([]);
  const [departments, setDepartments] = useState([]); // Dynamic Departments!
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Fetch Staff
    const unsubStaff = onSnapshot(collection(db, "users"), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const filteredStaff = list.filter(u => !u.disabled && (['veterinarian', 'staff', 'admin', 'groomer'].includes(u.role) || u.accessLevel));
      filteredStaff.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
      setStaffList(filteredStaff);
      setLoading(false);
    });

    // 2. Fetch Active Appointments (For Workload)
    const qAppts = query(collection(db, "appointments"), where("status", "in",["arrived", "in-consult", "confined"]));
    const unsubAppts = onSnapshot(qAppts, (snapshot) => {
      setActiveAppointments(snapshot.docs.map(d => d.data()));
    });

    // 3. THE FIX: Fetch Dynamic Departments as a clean string array
    const unsubDepts = onSnapshot(collection(db, "departments"), (snapshot) => {
      const depts = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); // <--- Keep the full object!
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
    // THE FIX: Check for the existence of the email before trying to trim it!
    const email = formData.email ? formData.email.trim().toLowerCase() : '';
    
    if (!formData.fullName || !email) {
        throw new Error("Full Name and Email are required.");
    }
    
    const payload = {
      fullName: formData.fullName, 
      email: email, 
      phone: formData.phone || '', // Also add fallbacks for other fields
      specialty: formData.specialty || 'N/A', 
      accessLevel: formData.accessLevel, 
      departments: formData.departments || [],
      role: formData.accessLevel,
      prcLicense: formData.prcLicense || '',
      updatedAt: new Date()
    };

    if (editId) {
      // Find the current state for diffing
      const originalStaff = staffList.find(s => s.id === editId);
      await updateDoc(doc(db, "users", editId), payload);
      const diffMessage = originalStaff ? diffStaffFields(originalStaff, payload) : 'Profile updated';
      await logStaffEvent(editId, payload.fullName, 'UPDATED', diffMessage);
    } else {
      payload.createdAt = new Date();
      
      // SPANNING SECONDARY FIREBASE APP SO ADMIN DOESN'T GET LOGGED OUT!
      const tempAppName = 'SecondaryApp' + Date.now();
      const secondaryApp = initializeApp(firebaseConfig, tempAppName);
      const secondaryAuth = getAuth(secondaryApp);
      
      try {
        // Create user with default password
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, "vetconnect123!"); 
        const newUid = userCredential.user.uid;
        
        // Sync the UID with Firestore
        await setDoc(doc(db, "users", newUid), payload);
        await logStaffEvent(newUid, payload.fullName, 'CREATED', `New ${payload.accessLevel} account authorized (${email})`);
      } catch (error) {
         throw new Error("Auth Failed: " + error.message);
      } finally {
        // Always destroy the secondary session to prevent memory leaks/bugs
        secondaryAuth.signOut();
      }
    }
  };

  const removeStaff = async (id) => {
    // Instead of deleting, we flag the account as disabled to prevent Auth orphans
    const staff = staffList.find(s => s.id === id);
    await updateDoc(doc(db, "users", id), {
      disabled: true,
      disabledAt: new Date(),
      role: 'disabled',
      accessLevel: 'disabled',
    });
    await logStaffEvent(id, staff?.fullName || 'Unknown', 'ACCESS_REVOKED', 'System access revoked — account disabled');
  };

  return { staffList, activeAppointments, departments, loading, getWorkload, saveStaff, removeStaff };
}