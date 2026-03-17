// The master edge-to-edge CRM controller.
// Orchestrates the multi-tab layout (Pets, Details, Ledger, Logs) and intercepts the user if the 
// client has an outstanding financial balance.

import React, { useState } from 'react';
import { Box, Tabs, Tab, Typography, CircularProgress } from '@mui/material';
import { doc, updateDoc, addDoc, collection, Timestamp } from 'firebase/firestore';
import { db, auth } from '../../firebaseConfig';

import { usePatientManager } from './hooks/usePatientManager';
import PatientDirectory from './components/PatientDirectory';
import ClientHeader from './components/ClientHeader';
import PetList from './components/PetList';
import ClientDetails from './components/ClientDetails';
import BillingLedger from './components/BillingLedger';
import InternalLogs from './components/InternalLogs';
import AddPetModal from './modals/AddPetModal';
import Patient360Modal from './modals/Patient360Modal';
import PersonIcon from '@mui/icons-material/Person';

export default function Patients() {
  const { 
    searchText, setSearchText, owners, selectedClient, clientPets, clientTransactions, 
    outstandingBalance, handleSelectClient, calculateAge, isEditing, setIsEditing, 
    editForm, setEditForm, newNote, setNewNote, noteCategory, setNoteCategory,
    newPetData, setNewPetData, loading 
  } = usePatientManager();

  const [activeTab, setActiveTab] = useState(0);
  const [openAddPet, setOpenAddPet] = useState(false);
  const [openPet360, setOpenPet360] = useState(false);
  const [selectedPet, setSelectedPet] = useState(null);

  const filteredOwners = owners.filter(o => (o.fullName || '').toLowerCase().includes(searchText.toLowerCase()) || (o.phone || '').includes(searchText));

  const handleSaveProfile = async () => {
    try { await updateDoc(doc(db, "users", selectedClient.id), editForm); setIsEditing(false); } 
    catch (e) { alert(e.message); }
  };

  const handleAddNote = async () => {
    const note = { id: Date.now().toString(), text: newNote, category: noteCategory, date: new Date().toISOString(), staff: auth.currentUser?.email || "Admin" };
    const updated = [...(selectedClient.staffNotes || []), note];
    await updateDoc(doc(db, "users", selectedClient.id), { staffNotes: updated });
    setNewNote('');
  };

  const handleAdminAddPet = async () => {
    const payload = { ownerId: selectedClient.id, ...newPetData, dob: newPetData.dob ? Timestamp.fromDate(new Date(newPetData.dob)) : null, createdAt: Timestamp.now() };
    await addDoc(collection(db, "pets"), payload);
    setOpenAddPet(false);
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', m: -4, bgcolor: 'white', overflow: 'hidden' }}>
      <PatientDirectory owners={filteredOwners} selectedId={selectedClient?.id} onSelect={handleSelectClient} searchText={searchText} onSearchChange={(e)=>setSearchText(e.target.value)} />
      
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedClient ? (
          <>
            <ClientHeader client={selectedClient} balance={outstandingBalance} isEditing={isEditing} onEdit={()=>setIsEditing(true)} onCancel={()=>setIsEditing(false)} onSave={handleSaveProfile} />
            <Box sx={{ px: 3, borderBottom: '1px solid #E0E0E0' }}>
              <Tabs value={activeTab} onChange={(e,v)=>setActiveTab(v)}>
                <Tab label="Pets" /><Tab label="Details" /><Tab label="Ledger" /><Tab label="Logs" />
              </Tabs>
            </Box>
            <Box sx={{ flexGrow: 1, overflowY: 'auto', bgcolor: '#FAFAFA' }}>
                {activeTab === 0 && <PetList pets={clientPets} calculateAge={calculateAge} onRegisterPet={()=>setOpenAddPet(true)} onViewChart={(p)=>{setSelectedPet(p); setOpenPet360(true);}} />}
                {activeTab === 1 && <ClientDetails editForm={editForm} setEditForm={setEditForm} isEditing={isEditing} calculateAge={calculateAge} />}
                {activeTab === 2 && <BillingLedger transactions={clientTransactions} />}
                {activeTab === 3 && <InternalLogs notes={selectedClient.staffNotes || []} newNote={newNote} setNewNote={setNewNote} category={noteCategory} setCategory={setNoteCategory} onAdd={handleAddNote} />}
            </Box>
          </>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#ccc' }}>
            <PersonIcon sx={{ fontSize: 100, opacity: 0.2 }} /><Typography>Select a client</Typography>
          </Box>
        )}
      </Box>

      {openAddPet && <AddPetModal open={openAddPet} onClose={()=>setOpenAddPet(false)} ownerName={selectedClient?.fullName} newPetData={newPetData} setNewPetData={setNewPetData} onSubmit={handleAdminAddPet} />}
      {openPet360 && <Patient360Modal open={openPet360} onClose={()=>setOpenPet360(false)} pet={selectedPet} history={[]} vitalsData={[]} />}
    </Box>
  );
}