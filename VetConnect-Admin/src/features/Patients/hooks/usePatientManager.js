import { useState, useEffect, useCallback } from 'react';
import { 
  collection, query, where, onSnapshot, getDocs, 
  updateDoc, doc, addDoc, Timestamp, orderBy, limit
} from 'firebase/firestore';
import { db, auth } from '../../../firebaseConfig';

export function usePatientManager(onClientSelected) { // <-- Added callback prop
  const [owners, setOwners] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  
  const[clientPets, setClientPets] = useState([]);
  const [clientTransactions, setClientTransactions] = useState([]);
  const [outstandingBalance, setOutstandingBalance] = useState(0);
  
  const[isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ emergencyContacts: [] });
  const [newNote, setNewNote] = useState('');
  const[noteCategory, setNoteCategory] = useState('General');
  const [newPetData, setNewPetData] = useState({ name: '', species: 'Canine', breed: '', gender: 'Male', isNeutered: false, dob: '', color: '', allergies: 'None', microchip: '' });

  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [loadingClientData, setLoadingClientData] = useState(false);

  const formatFirestoreDate = (val) => { 
    if (!val) return ''; 
    if (val.toDate) return val.toDate().toISOString().split('T')[0]; 
    return val; 
  };
  
  const calculateAge = useCallback((dob) => { 
    if (!dob) return 'Age Unknown'; 
    const birthDate = dob.toDate ? dob.toDate() : new Date(dob);
    if(isNaN(birthDate.getTime())) return 'Age Unknown'; 
    const today = new Date(); 
    let age = today.getFullYear() - birthDate.getFullYear(); 
    const m = today.getMonth() - birthDate.getMonth(); 
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--; 
    return `${age} yrs`; 
  },[]);

  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "pet_owner"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a,b) => (a.fullName || '').localeCompare(b.fullName || ''));
      setOwners(list);
      setLoadingDirectory(false);
    });
    return () => unsubscribe();
  },[]);

  useEffect(() => {
    if (!selectedClient) {
      setClientPets([]);
      setClientTransactions([]);
      setOutstandingBalance(0);
      return;
    }
    
    setLoadingClientData(true);
    
    const unsubPets = onSnapshot(
      query(collection(db, "pets"), where("ownerId", "==", selectedClient.id)),
      async (petsSnapshot) => {
        const petsWithHistory = await Promise.all(
          petsSnapshot.docs.map(async (petDoc) => {
            const petData = { id: petDoc.id, ...petDoc.data() };
            
            // A. Fetch Last Visit & Weight
            const historyQuery = query(
              collection(db, "medical_records"),
              where("petId", "==", petData.id),
              orderBy("date", "desc"),
              limit(1)
            );
            const historySnap = await getDocs(historyQuery);
            if (!historySnap.empty) {
              const lastRecord = historySnap.docs[0].data();
              petData.lastVisit = lastRecord.date;
              petData.lastWeight = lastRecord.vitals?.weight || null; // Capture the weight!
            }

            // B. Fetch Upcoming Appointments (To prevent double-booking)
            const upcomingQuery = query(
              collection(db, "appointments"),
              where("petId", "==", petData.id),
              where("status", "in", ['pending', 'confirmed']),
              orderBy("scheduledDate", "asc"),
              limit(1)
            );
            const upcomingSnap = await getDocs(upcomingQuery);
            if (!upcomingSnap.empty) {
              petData.nextAppt = upcomingSnap.docs[0].data().scheduledDate;
            }

            return petData;
          })
        );
        setClientPets(petsWithHistory);
        setLoadingClientData(false);
      }
    );

    const unsubSales = onSnapshot(
      query(collection(db, "sales"), where("ownerName", "==", selectedClient.fullName)),
      (snap) => {
        const sales = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.date.seconds - a.date.seconds);
        setClientTransactions(sales);
        let owed = 0;
        sales.forEach(s => {
          const bal = (parseFloat(s.total) || 0) - (parseFloat(s.depositPaid) || 0);
          if (bal > 0) owed += bal;
        });
        setOutstandingBalance(owed);
      }
    );
    
    return () => { unsubPets(); unsubSales(); };
  }, [selectedClient]);

  const handleSelectClient = (client) => {
    let reps = client.emergencyContacts ||[];
    if (reps.length === 0 && (client.emergencyName || client.emergencyPhone)) reps =[{ name: client.emergencyName || '', phone: client.emergencyPhone || '', relation: 'Primary' }];
    const cleanClient = { ...client, dob: formatFirestoreDate(client.dob), clientTag: client.clientTag || 'Regular', emergencyContacts: reps };
    
    setSelectedClient(cleanClient);
    setEditForm(cleanClient);
    setIsEditing(false);
    
    // THE FIX: Trigger the tab reset callback here!
    if (onClientSelected) onClientSelected();
  };
  
  const handleSaveProfile = async () => { 
    if (!selectedClient) throw new Error("No client selected.");
    await updateDoc(doc(db, "users", selectedClient.id), editForm); 
    setIsEditing(false); 
  };

  const handleAddNote = async () => {
    if(!newNote || !selectedClient) return;
    const note = { id: Date.now().toString(), text: newNote, category: noteCategory, date: new Date().toISOString(), staff: auth.currentUser?.email || "Admin" };
    const updatedNotes = [...(selectedClient.staffNotes || []), note];
    await updateDoc(doc(db, "users", selectedClient.id), { staffNotes: updatedNotes });
    setNewNote('');
  };

  const handleAdminAddPet = async () => {
      if (!newPetData.name || !newPetData.breed) throw new Error("Pet Name and Breed are required.");
      if (!selectedClient) throw new Error("No client selected.");
      const payload = { ownerId: selectedClient.id, ...newPetData, dob: newPetData.dob ? Timestamp.fromDate(new Date(newPetData.dob)) : null, createdAt: Timestamp.now(), status: 'active' };
      await addDoc(collection(db, "pets"), payload);
      setNewPetData({ name: '', species: 'Canine', breed: '', gender: 'Male', isNeutered: false, dob: '', color: '', allergies: 'None', microchip: '' });
      return true; 
  };
  
  const fetchPetClinicalData = async (petId) => {
    if (!petId) return { history: [], vitals:[] };
    try {
      const q = query(collection(db, "medical_records"), where("petId", "==", petId), orderBy("date", "desc"));
      const snapshot = await getDocs(q);
      const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const vitals = history.map(rec => rec.vitals && rec.vitals.weight && rec.date ? { date: new Date(rec.date.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), weight: parseFloat(rec.vitals.weight) } : null).filter(Boolean).reverse(); 
      return { history, vitals };
    } catch (error) { console.error("Error fetching clinical data:", error); return { history: [], vitals:[] }; }
  };

  const archivePet = async (petId) => {
    if (!petId) throw new Error("No pet ID provided.");
    await updateDoc(doc(db, "pets", petId), { status: 'archived', archivedAt: Timestamp.now() });
  };

  return {
    owners, searchText, setSearchText, selectedClient, setSelectedClient, 
    clientPets, clientTransactions, outstandingBalance,
    loading: loadingDirectory || loadingClientData, 
    handleSelectClient, calculateAge,
    isEditing, setIsEditing, editForm, setEditForm, handleSaveProfile,
    newNote, setNewNote, noteCategory, setNoteCategory, handleAddNote,
    newPetData, setNewPetData, handleAdminAddPet, fetchPetClinicalData, archivePet 
  };
}