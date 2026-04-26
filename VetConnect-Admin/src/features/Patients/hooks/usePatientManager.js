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
    referredBy: '',    // T2.136
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
    accountStanding: 'Good Standing',
    // Step 5.4 (T3.5): Versioned consent fields — display-only.
    // These are read from Firestore and surfaced in ClientDetails for the
    // consent status cards. They are NEVER written via handleSaveProfile;
    // consent records are written exclusively through ConsentRecordDialog.
    consentVersion: null,
    consentGrantedAt: null,
    waiverVersion: null,
    waiverGrantedAt: null,
  });
  // T2.134: Engagement KPIs — populated on client selection
  const [engagementKPIs, setEngagementKPIs] = useState({
    totalVisits: 0,
    lastVisitDate: null,
    noShowCount: 0,
    totalAppointments: 0,
    avgDaysBetween: null,
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
      // Step 3.1 (RA 10173): Erased users are hidden from the active directory.
      // Their Firestore docs are preserved for clinical/audit history references
      // but must not appear in searchable patient workflows.
      const list = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.accountStatus !== 'erased');
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
        
        // T2.113: Use balanceRemaining field — matches PatientDashboard's computation.
        // This eliminates divergence from the old total-depositPaid approach.
        const owed = sales
          .filter(s => s.status !== 'refunded' && s.status !== 'voided')
          .reduce((sum, s) => sum + (s.balanceRemaining || 0), 0);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOutstandingBalance(owed);
      }
    );
    
    // T2.134: Engagement KPIs — one-shot fetch of all appointments for this client
    (async () => {
      try {
        const apptQ = query(
          collection(db, 'appointments'),
          where('ownerId', '==', selectedClient.id),
        );
        const apptSnap = await getDocs(apptQ);
        const allAppts = apptSnap.docs.map(d => d.data());
        const completed = allAppts.filter(a => a.status === 'completed');
        const noShows = allAppts.filter(a => a.status === 'no-show');

        // Collect completed visit dates sorted newest-first
        const visitDates = completed
          .map(a => a.date?.toDate ? a.date.toDate() : (a.date?.seconds ? new Date(a.date.seconds * 1000) : null))
          .filter(Boolean)
          .sort((a, b) => b - a);

        const lastVisitDate = visitDates.length > 0 ? visitDates[0] : null;

        let avgDaysBetween = null;
        if (visitDates.length >= 2) {
          let totalGap = 0;
          for (let i = 0; i < visitDates.length - 1; i++) {
            totalGap += (visitDates[i] - visitDates[i + 1]) / 86400000;
          }
          avgDaysBetween = Math.round(totalGap / (visitDates.length - 1));
        }

        setEngagementKPIs({
          totalVisits: completed.length,
          lastVisitDate,
          noShowCount: noShows.length,
          totalAppointments: allAppts.length,
          avgDaysBetween,
        });
      } catch (e) {
        console.warn('[usePatientManager] Engagement KPIs fetch skipped:', e);
      }
    })();

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
      emergencyContacts: reps,
      // Step 5.4 (T3.5): Read versioned consent fields from Firestore.
      // Firestore Timestamps are preserved as-is so ClientDetails can format them.
      // null means the client has never consented under the versioned system.
      consentVersion: client.consentVersion ?? null,
      consentGrantedAt: client.consentGrantedAt ?? null,
      waiverVersion: client.waiverVersion ?? null,
      waiverGrantedAt: client.waiverGrantedAt ?? null,
    };
    
    setSelectedClient(cleanClient);
    setEditForm(cleanClient);
    setIsEditing(false);
    
    // THE FIX: Trigger the tab reset callback here!
    if (onClientSelected) onClientSelected();
  };
  
  const handleSaveProfile = async () => { 
    if (!selectedClient) throw new Error("No client selected.");
    
    // Step 5.4 (T3.5): Derive legacy consent booleans from versioned fields.
    // The authoritative source of truth is consentVersion / waiverVersion.
    // We write the booleans here for backward compatibility with any code that
    // still reads dpaConsent / waiverSigned directly.
    // consentVersion / waiverVersion themselves are NOT included in this payload —
    // they are only ever written through ConsentRecordDialog (admin portal) or
    // the mobile consent submission hook.
    const derivedDpaConsent = editForm.consentVersion != null;
    const derivedWaiverSigned = editForm.waiverVersion != null;

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
        dpaConsent: derivedDpaConsent,
        waiverSigned: derivedWaiverSigned,
        referralSource: editForm.referralSource,
        referredBy: editForm.referredBy || null,   // T2.136
        allowPromos: editForm.allowPromos,
        preferredComm: editForm.preferredComm,
        whatsappOptIn: editForm.whatsappOptIn,
        emergencyContacts: editForm.emergencyContacts,
        updatedAt: Timestamp.now(),                // T2.133: resets the freshness clock
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
    await updateDoc(doc(db, "pets", petId), {
      status: 'archived',
      archivedAt: Timestamp.now(),
      archivedBy: auth.currentUser?.email || 'Admin',
    });
  };

  const restorePet = async (petId) => {
    if (!petId) throw new Error("No pet ID provided.");
    await updateDoc(doc(db, "pets", petId), {
      status: 'active',
      archivedAt: null,
      archivedBy: null,
    });
  };

  return {
    owners, allPetsSnapshot, searchText, setSearchText, selectedClient, setSelectedClient,
    clientPets, clientTransactions, outstandingBalance,
    loading: loadingDirectory || loadingClientData,
    loadingClientData,
    handleSelectClient, calculatePetAge,
    isEditing, setIsEditing, editForm, setEditForm, handleSaveProfile,
    newNote, setNewNote, noteCategory, setNoteCategory, handleAddNote, handleDeleteNote,
    newPetData, setNewPetData, handleAdminAddPet, archivePet, restorePet,
    engagementKPIs,  // T2.134
  };
}