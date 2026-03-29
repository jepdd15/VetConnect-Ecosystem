import React, { useState, useMemo } from 'react';
import { Box, Tabs, Tab, Typography, CircularProgress } from '@mui/material';

// 1. Logic (The Brain)
import { usePatientManager } from './hooks/usePatientManager';

// 2. Local Components
import PatientDirectory from './components/PatientDirectory';
import ClientHeader from './components/ClientHeader';
import PetList from './components/PetList';
import ClientDetails from './components/ClientDetails';
import BillingLedger from './components/BillingLedger';
import InternalLogs from './components/InternalLogs';

// 3. Modals
import AddPetModal from './modals/AddPetModal';
import QuickBookModal from './modals/QuickBookModal'; // The new modal

// Icons
import PetsIcon from '@mui/icons-material/Pets';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';

export default function Patients() {
  const [activeTab, setActiveTab] = useState(0);

  const { 
    owners, allPetsSnapshot, searchText, setSearchText, selectedClient, 
    clientPets, clientTransactions, outstandingBalance, 
    handleSelectClient, calculateAge, isEditing, setIsEditing, 
    editForm, setEditForm, handleSaveProfile,
    newNote, setNewNote, noteCategory, setNoteCategory, handleAddNote,
    newPetData, setNewPetData, handleAdminAddPet,
    loading, fetchPetClinicalData, archivePet 
  } = usePatientManager(() => setActiveTab(0)); 

  // Modal States
  const [openAddPet, setOpenAddPet] = useState(false);
  const [openQuickBook, setOpenQuickBook] = useState(false); // For the new feature
  const [selectedPet, setSelectedPet] = useState(null);

  const filteredOwners = useMemo(() => {
    if (!searchText) return owners;
    const searchLower = searchText.toLowerCase();
    return owners.filter(o => {
      const matchesOwner = (o.fullName || '').toLowerCase().includes(searchLower) || (o.phone || '').includes(searchLower);
      const matchesPet = allPetsSnapshot.some(p => p.ownerId === o.id && p.name.includes(searchLower));
      return matchesOwner || matchesPet;
    });
  }, [owners, allPetsSnapshot, searchText]);



  const handleQuickBookOpen = (pet) => {
    setSelectedPet(pet);
    setOpenQuickBook(true);
  };

  return (
    // THE FIX: m: -4 pulls the container to the absolute edges, filling the screen!
    <Box sx={{ m: -4, display: 'flex', height: '100vh', width: 'calc(100% + 64px)', overflow: 'hidden', bgcolor: '#FAFAFA' }}>
      
      <PatientDirectory 
        owners={filteredOwners} 
        selectedId={selectedClient?.id} 
        onSelect={handleSelectClient} 
        searchText={searchText}
        onSearchChange={(e) => setSearchText(e.target.value)}
        onNewClient={() => alert("New Client Modal coming soon!")} 
      />

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'linear-gradient(135deg, #FFF8E1 0%, #FFE0B2 100%)' }}>
        {loading && !selectedClient ? (
           <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <CircularProgress />
           </Box>
        ) : selectedClient ? (
          <>
            <ClientHeader 
              client={selectedClient} 
              balance={outstandingBalance} 
              isEditing={isEditing} 
              onEdit={() => setIsEditing(true)}
              onCancel={() => { setEditForm(selectedClient); setIsEditing(false); }}
              onSave={async () => { 
                  try { 
                      await handleSaveProfile(); 
                      alert("Profile Saved!");
                      setIsEditing(false); // Make sure to exit edit mode
                  } catch(e) { 
                      alert(e.message) 
                  } 
              }}
            />
            
            <Box sx={{ px: 4, pt: 1, borderBottom: '1px solid #E0E0E0', bgcolor: '#FAFAFA' }}>
              <Tabs 
                value={activeTab} 
                onChange={(e, v) => setActiveTab(v)} 
                sx={{ 
                  minHeight: 44, 
                  '& .MuiTabs-indicator': { height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
                  '& .MuiTab-root': { fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', minHeight: 44, py: 1, px: 3 } 
                }}
              >
                <Tab label={`Pets (${clientPets.filter(p => p.status !== 'archived').length})`} />
                <Tab label="Owner Details" />
                <Tab label="Billing Ledger" />
                <Tab label="Internal Logs" />
              </Tabs>
            </Box>

            <Box sx={{ flexGrow: 1, overflowY: 'auto', bgcolor: '#F5F5F5' }}>
                {activeTab === 0 && <PetList pets={clientPets} calculateAge={calculateAge} onRegisterPet={() => setOpenAddPet(true)} onArchive={archivePet} onQuickBook={handleQuickBookOpen} />}
                {activeTab === 1 && <ClientDetails editForm={editForm} setEditForm={setEditForm} isEditing={isEditing} calculateAge={calculateAge} />}
                {activeTab === 2 && <BillingLedger transactions={clientTransactions} />}
                {activeTab === 3 && <InternalLogs notes={selectedClient.staffNotes || []} newNote={newNote} setNewNote={setNewNote} category={noteCategory} setCategory={setNoteCategory} onAdd={handleAddNote} onDelete={(noteId) => alert(`Deleting note ${noteId}`)} />}
            </Box>
          </>
        ) : (
           <Box sx={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection: 'column', color: '#aaa' }}>
             <PetsIcon sx={{ fontSize: 80, mb: 2, opacity: 0.15 }} />
             <Typography variant="h6" color="textSecondary" fontWeight="bold">No Client Selected</Typography>
             <Typography variant="body2">Search or select a client from the directory to view their profile.</Typography>
           </Box>
        )}
      </Box>

      {/* --- MODALS --- */}
      {openAddPet && selectedClient && (
        <AddPetModal 
          open={openAddPet} 
          onClose={() => setOpenAddPet(false)} 
          ownerName={selectedClient.fullName}
          newPetData={newPetData}
          setNewPetData={setNewPetData}
          onSubmit={async () => { try { const success = await handleAdminAddPet(); if(success) setOpenAddPet(false); } catch(e) { alert(e.message) } }}
        />
      )}
      


      {openQuickBook && selectedPet && (
        <QuickBookModal 
          open={openQuickBook} 
          onClose={() => setOpenQuickBook(false)} 
          pet={selectedPet} 
        />
      )}
    </Box>
  );
}