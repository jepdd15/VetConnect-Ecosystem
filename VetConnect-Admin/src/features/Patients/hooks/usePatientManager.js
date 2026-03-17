import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, updateDoc, doc, addDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../../../firebaseConfig';

export function usePatientManager() {
  const [owners, setOwners] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientPets, setClientPets] = useState([]);
  const [clientTransactions, setClientTransactions] = useState([]);
  const [outstandingBalance, setOutstandingBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  // Form States
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ emergencyContacts: [] });
  const [newNote, setNewNote] = useState('');
  const [noteCategory, setNoteCategory] = useState('General');
  const [newPetData, setNewPetData] = useState({ name: '', species: 'Canine', breed: '', gender: 'Male', isNeutered: false, dob: '', color: '', allergies: 'None', microchip: '' });

  const formatFirestoreDate = (val) => { if (!val) return ''; if (val.toDate) return val.toDate().toISOString().split('T')[0]; return val; };
  
  const calculateAge = (dob) => { 
    if (!dob) return ''; 
    const birthDate = dob.toDate ? dob.toDate() : new Date(dob);
    if(isNaN(birthDate.getTime())) return ''; 
    const today = new Date(); 
    let age = today.getFullYear() - birthDate.getFullYear(); 
    const m = today.getMonth() - birthDate.getMonth(); 
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--; 
    return `${age} yrs`; 
  };

  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "pet_owner"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOwners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => (a.fullName || '').localeCompare(b.fullName || '')));
      setLoading(false);
    });
    return () => unsubscribe();
  },[]);

  const handleSelectClient = async (client) => {
    let reps = client.emergencyContacts || [];
    if (reps.length === 0 && (client.emergencyName || client.emergencyPhone)) {
        reps = [{ name: client.emergencyName || '', phone: client.emergencyPhone || '', relation: 'Primary' }];
    }

    const cleanClient = { 
      ...client, 
      dob: formatFirestoreDate(client.dob), 
      clientTag: client.clientTag || 'Regular', 
      emergencyContacts: reps 
    };
    setSelectedClient(cleanClient);
    setEditForm(cleanClient);
    setIsEditing(false);

    try {
      const [petsSnap, salesSnap] = await Promise.all([
        getDocs(query(collection(db, "pets"), where("ownerId", "==", client.id))),
        getDocs(query(collection(db, "sales"), where("ownerName", "==", client.fullName)))
      ]);
      setClientPets(petsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const sales = salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => b.date.seconds - a.date.seconds);
      setClientTransactions(sales);

      let owed = 0;
      sales.forEach(s => {
        const bal = (parseFloat(s.total) || 0) - (parseFloat(s.depositPaid) || 0);
        if (bal > 0) owed += bal;
      });
      setOutstandingBalance(owed);
    } catch (e) { console.error(e); }
  };

  return {
    owners, searchText, setSearchText, selectedClient, clientPets, clientTransactions, outstandingBalance,
    loading, handleSelectClient, calculateAge, isEditing, setIsEditing, editForm, setEditForm,
    newNote, setNewNote, noteCategory, setNoteCategory, newPetData, setNewPetData
  };
}