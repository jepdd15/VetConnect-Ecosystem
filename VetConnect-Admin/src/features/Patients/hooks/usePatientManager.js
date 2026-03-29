import { useState, useEffect, useCallback } from 'react';
import { 
  collection, query, where, onSnapshot, getDocs, getDoc,
  updateDoc, doc, addDoc, Timestamp, orderBy, limit
} from 'firebase/firestore';
import { db, auth } from '../../../firebaseConfig';

export function usePatientManager(onClientSelected) { // <-- Added callback prop
  const [owners, setOwners] = useState([]);
  const [allPetsSnapshot, setAllPetsSnapshot] = useState([]); // Global lightweight array for pet search
  const [searchText, setSearchText] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  
  const[clientPets, setClientPets] = useState([]);
  const [clientTransactions, setClientTransactions] = useState([]);
  const [outstandingBalance, setOutstandingBalance] = useState(0);
  
  const[isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ 
    emergencyContacts: [], 
    gender: null, // Re-introduce for data capture
    seniorId: '',
    clientTag: 'Regular', // Default for new clients
    referralSource: '',
    allowPromos: false,
    preferredComm: 'SMS',
    whatsappOptIn: false
  });
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
    // THE FIX: It now handles null, timestamps, and old string data
    if (!dob) return 'Age TBD'; // "To Be Determined" is more professional
    
    let birthDate;
    try {
      if (dob.toDate) { // Check if it's a Firestore Timestamp
        birthDate = dob.toDate();
      } else {
        birthDate = new Date(dob); // Try to parse it as a string
      }
      
      if (isNaN(birthDate.getTime())) return 'Age TBD'; // If parsing fails, give up

      const today = new Date(); 
      let age = today.getFullYear() - birthDate.getFullYear(); 
      const m = today.getMonth() - birthDate.getMonth(); 
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--; 
      
      if (age < 0) return 'Age TBD'; // Handle future dates
      if (age === 0) {
        const months = Math.floor((today - birthDate) / (1000 * 60 * 60 * 24 * 30.44));
        return months > 0 ? `${months} mo` : 'Newborn';
      }

      return `${age} yrs`;
    } catch (e) {
      return 'Age TBD';
    }
  },[]);

  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "pet_owner"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a,b) => (a.fullName || '').localeCompare(b.fullName || ''));
      setOwners(list);
      setLoadingDirectory(false);
    });

    const petsQ = query(collection(db, "pets"), where("status", "==", "active"));
    const unsubPets = onSnapshot(petsQ, (snap) => {
        setAllPetsSnapshot(snap.docs.map(d => ({ ownerId: d.data().ownerId, name: (d.data().name || '').toLowerCase() })));
    });

    return () => { unsubscribe(); unsubPets(); };
  },[]);

  useEffect(() => {
    if (!selectedClient) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setClientPets(petsWithHistory);
        setLoadingClientData(false);
      }
    );

    const unsubSales = onSnapshot(
      query(collection(db, "sales"), where("ownerName", "==", selectedClient.fullName)),
      (snap) => {
        const sales = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.date.seconds - a.date.seconds);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setClientTransactions(sales);
        
        // --- THE FINANCIAL FIX ---
        let owed = 0;
        sales.forEach(s => {
          const status = s.status || 'paid';
          // Only calculate balance if the invoice is NOT fully paid and NOT refunded
          if (status !== 'paid' && status !== 'refunded') {
            const bal = (parseFloat(s.total) || 0) - (parseFloat(s.depositPaid) || 0);
            if (bal > 0) owed += bal;
          }
        });
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
    
    // THE FIX: Add the new fields to the payload!
    const payload = {
        fullName: editForm.fullName,
        phone: editForm.phone,
        address: editForm.address,
        city: editForm.city,
        dob: editForm.dob ? Timestamp.fromDate(new Date(editForm.dob)) : null,
        gender: editForm.gender, // Now saves gender!
        seniorId: editForm.seniorId,
        clientTag: editForm.clientTag, // Now saves client tag!
        referralSource: editForm.referralSource, // Now saves referral source!
        allowPromos: editForm.allowPromos, // Now saves promo opt-in!
        preferredComm: editForm.preferredComm, // Now saves preferred comm channel!
        whatsappOptIn: editForm.whatsappOptIn, // Now saves WhatsApp consent!
        emergencyContacts: editForm.emergencyContacts,
    };

    await updateDoc(doc(db, "users", selectedClient.id), payload); 
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
      
      // THE FIX: We now do a deep fetch to get the Service Name and Prescriptions!
      const history = await Promise.all(snapshot.docs.map(async (docSnap) => {
          const rec = { id: docSnap.id, ...docSnap.data() };

          if (rec.appointmentId) {
              const apptDoc = await getDoc(doc(db, "appointments", rec.appointmentId));
              if (apptDoc.exists()) {
                  const apptData = apptDoc.data();
                  rec.serviceType = apptData.serviceType;
                  rec.prescriptions = apptData.prescribedItems || [];
              }
          }
          return rec;
      }));

      const vitals = history.map(rec => rec.vitals && rec.vitals.weight && rec.date ? { date: new Date(rec.date.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), weight: parseFloat(rec.vitals.weight) } : null).filter(Boolean).reverse(); 
      return { history, vitals };
    } catch (error) { 
      console.error("Error fetching clinical data:", error); 
      return { history: [], vitals:[] }; 
    }
  };

  const archivePet = async (petId) => {
    if (!petId) throw new Error("No pet ID provided.");
    await updateDoc(doc(db, "pets", petId), { status: 'archived', archivedAt: Timestamp.now() });
  };

  return {
    owners, allPetsSnapshot, searchText, setSearchText, selectedClient, setSelectedClient, 
    clientPets, clientTransactions, outstandingBalance,
    loading: loadingDirectory || loadingClientData, 
    handleSelectClient, calculateAge,
    isEditing, setIsEditing, editForm, setEditForm, handleSaveProfile,
    newNote, setNewNote, noteCategory, setNoteCategory, handleAddNote,
    newPetData, setNewPetData, handleAdminAddPet, fetchPetClinicalData, archivePet 
  };
}