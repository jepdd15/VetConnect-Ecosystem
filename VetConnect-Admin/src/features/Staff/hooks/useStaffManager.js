// src/features/Staff/hooks/useStaffManager.js
import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

export function useStaffManager() {
  const [staffList, setStaffList] = useState([]);
  const [activeAppointments, setActiveAppointments] = useState([]);
  const [departments, setDepartments] = useState([]); // Dynamic Departments!
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Fetch Staff
    const unsubStaff = onSnapshot(collection(db, "users"), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const filteredStaff = list.filter(u => ['veterinarian', 'staff', 'admin', 'groomer'].includes(u.role) || u.accessLevel);
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

  const saveStaff = async (editId, formData) => {
    const payload = {
      fullName: formData.fullName, 
      email: formData.email.trim().toLowerCase(), 
      phone: formData.phone, 
      specialty: formData.specialty || 'N/A', 
      accessLevel: formData.accessLevel, 
      departments: formData.departments, 
      role: formData.accessLevel,
      prcLicense: formData.prcLicense,
      updatedAt: new Date()
    };

    if (editId) {
      await updateDoc(doc(db, "users", editId), payload);
    } else {
      payload.createdAt = new Date();
      await addDoc(collection(db, "users"), payload);
    }
  };

  const removeStaff = async (id) => {
    await deleteDoc(doc(db, "users", id));
  };

  return { staffList, activeAppointments, departments, loading, getWorkload, saveStaff, removeStaff };
}