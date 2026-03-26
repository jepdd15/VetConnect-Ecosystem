import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

export function useServices() {
  const [services, setServices] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [departments, setDepartments] = useState([]); // Dynamic State
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Listen for Services
    const unsubServices = onSnapshot(collection(db, "services"), (snapshot) => { 
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setServices(list);
      setLoading(false);
    });

    // 2. Listen for Inventory (for product bundling)
    const unsubInventory = onSnapshot(collection(db, "inventory"), (snapshot) => { 
      setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); 
    });

    // 3. Listen for Dynamic Departments
    const unsubDepts = onSnapshot(collection(db, "departments"), (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
      setDepartments(list);
    });

    return () => { unsubServices(); unsubInventory(); unsubDepts(); };
  },[]);

  const saveService = async (editId, formData) => {
    // THE FIX: Save to BOTH fields for perfect backward compatibility
    const departmentName = formData.department || 'General';

    const payload = {
      ...formData,
      price: Number(formData.price) || 0,
      duration: Number(formData.duration) || 30,
      bufferTime: Number(formData.bufferTime) || 0,
      department: departmentName, // The NEW official key
      category: departmentName,   // The OLD legacy key
    };

    if (editId) {
      await updateDoc(doc(db, "services", editId), payload);
    } else {
      await addDoc(collection(db, "services"), payload);
    }
  };

  const removeService = async (id) => {
    await deleteDoc(doc(db, "services", id));
  };

  return { services, inventory, departments, loading, saveService, removeService };
}