import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot, getDocs,
  updateDoc, doc, addDoc, Timestamp, orderBy, limit,
  arrayUnion, runTransaction
} from 'firebase/firestore';
import { db, auth } from '../../../firebaseConfig';
import { calculatePetAge } from '../../../utils/printUtils';

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
    gender: null,
    seniorId: '',
    clientTag: 'Regular',
    referralSource: '',
    allowPromos: false,
    preferredComm: 'SMS',
    whatsappOptIn: false,
    // New Fields
    email: '',
    secondaryPhone: '',
    govIdType: '',
    govIdNumber: '',
    dpaConsent: false,
    waiverSigned: false,
    accountStanding: 'Good Standing'
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
    const cleanClient = { 
      ...client, 
      dob: formatFirestoreDate(client.dob), 
      clientTag: client.clientTag || 'Regular', 
      accountStanding: client.accountStanding || 'Good Standing',
      dpaConsent: client.dpaConsent || false,
      waiverSigned: client.waiverSigned || false,
      emergencyContacts: reps 
    };
    
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
        email: editForm.email || null,
        secondaryPhone: editForm.secondaryPhone || null,
        address: editForm.address,
        city: editForm.city,
        dob: editForm.dob ? Timestamp.fromDate(new Date(editForm.dob)) : null,
        gender: editForm.gender,
        govIdType: editForm.govIdType || null,
        govIdNumber: editForm.govIdNumber || null,
        seniorId: editForm.seniorId,
        clientTag: editForm.clientTag,
        accountStanding: editForm.accountStanding || 'Good Standing',
        dpaConsent: editForm.dpaConsent || false,
        waiverSigned: editForm.waiverSigned || false,
        referralSource: editForm.referralSource,
        allowPromos: editForm.allowPromos,
        preferredComm: editForm.preferredComm,
        whatsappOptIn: editForm.whatsappOptIn,
        emergencyContacts: editForm.emergencyContacts,
    };

    await updateDoc(doc(db, "users", selectedClient.id), payload); 
    setIsEditing(false); 
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !selectedClient) return;
    const note = {
      id: Date.now().toString(),
      text: newNote,
      category: noteCategory,
      date: new Date().toISOString(),
      staff: auth.currentUser?.email || 'Admin',
    };
    await updateDoc(doc(db, 'users', selectedClient.id), {
      staffNotes: arrayUnion(note),
    });
    setNewNote('');
  };

  const handleDeleteNote = async (noteId) => {
    if (!selectedClient) return;
    if (!window.confirm('Delete this note permanently?')) return;
    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, 'users', selectedClient.id);
      const snap = await transaction.get(userRef);
      if (!snap.exists()) return;
      const currentNotes = snap.data().staffNotes || [];
      transaction.update(userRef, {
        staffNotes: currentNotes.filter(n => n.id !== noteId),
      });
    });
  };

  const handleAdminAddPet = async () => {
      if (!newPetData.name || !newPetData.breed) throw new Error("Pet Name and Breed are required.");
      if (!selectedClient) throw new Error("No client selected.");
      // T2.119: Write `petAllergies` as the canonical field; keep `allergies` as legacy alias.
      const resolvedAllergies = (newPetData.allergies || 'None').trim();
      const { allergies: _legacyField, ...restPetData } = newPetData;
      const payload = {
        ownerId: selectedClient.id,
        ...restPetData,
        petAllergies: resolvedAllergies,
        allergies: resolvedAllergies,
        dob: newPetData.dob ? Timestamp.fromDate(new Date(newPetData.dob)) : null,
        isAgeExact: !!newPetData.dob,
        weight: newPetData.lastWeight ? parseFloat(newPetData.lastWeight) : null,
        lastWeight: newPetData.lastWeight ? parseFloat(newPetData.lastWeight) : null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        status: 'active',
      };
      await addDoc(collection(db, "pets"), payload);
      setNewPetData({ name: '', species: 'Canine', breed: '', gender: 'Male', isNeutered: false, dob: '', color: '', allergies: 'None', microchip: '' });
      return true;
  };
  
  const archivePet = async (petId) => {
    if (!petId) throw new Error("No pet ID provided.");
    await updateDoc(doc(db, "pets", petId), { status: 'archived', archivedAt: Timestamp.now() });
  };

  return {
    owners, allPetsSnapshot, searchText, setSearchText, selectedClient, setSelectedClient,
    clientPets, clientTransactions, outstandingBalance,
    loading: loadingDirectory || loadingClientData,
    loadingClientData,
    handleSelectClient, calculatePetAge,
    isEditing, setIsEditing, editForm, setEditForm, handleSaveProfile,
    newNote, setNewNote, noteCategory, setNoteCategory, handleAddNote, handleDeleteNote,
    newPetData, setNewPetData, handleAdminAddPet, archivePet,
  };
}