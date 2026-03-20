import React, { useState } from 'react';
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
import Patient360Modal from './modals/Patient360Modal';
import AddPetModal from './modals/AddPetModal';

// Icons
import PetsIcon from '@mui/icons-material/Pets';

export default function Patients() {
  const [activeTab, setActiveTab] = useState(0);

  // THE FIX: We pass a callback function directly into the hook.
  // This tells the hook: "Hey, whenever you finish selecting a new client,
  // run this function for me to reset the tab!"
  const { 
    searchText, setSearchText, owners, selectedClient, 
    clientPets, clientTransactions, outstandingBalance, 
    handleSelectClient, calculateAge, isEditing, setIsEditing, 
    editForm, setEditForm, handleSaveProfile,
    newNote, setNewNote, noteCategory, setNoteCategory, handleAddNote,
    newPetData, setNewPetData, handleAdminAddPet,
    loading, fetchPetClinicalData, archivePet 
  } = usePatientManager(() => setActiveTab(0)); 

  // Modal States
  const [openAddPet, setOpenAddPet] = useState(false);
  const[openPet360, setOpenPet360] = useState(false);
  const [selectedPet, setSelectedPet] = useState(null);
  const [petHistory, setPetHistory] = useState([]);
  const[vitalsTrend, setVitalsTrend] = useState([]);
  const [loadingChart, setLoadingChart] = useState(false);

  const filteredOwners = owners.filter(o => 
    (o.fullName || '').toLowerCase().includes(searchText.toLowerCase()) || 
    (o.phone || '').includes(searchText)
  );

  // NOTE: The inefficient useEffect tab reset has been deleted!

  const openPetChart = async (pet) => {
    setSelectedPet(pet);
    setLoadingChart(true);
    setOpenPet360(true);
    const { history, vitals } = await fetchPetClinicalData(pet.id);
    setPetHistory(history);
    setVitalsTrend(vitals);
    setLoadingChart(false);
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', m: -4, bgcolor: '#FFF8E1', overflow: 'hidden' }}>
      
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
              onSave={async () => { try { await handleSaveProfile(); alert("Profile Saved!"); } catch(e) { alert(e.message) } }}
            />
            
            <Box sx={{ px: 3, pt: 0, pb: 0, borderBottom: '1px solid rgba(0,0,0,0.08)', bgcolor: 'rgba(255,255,255,0.4)' }}>
              <Tabs 
                value={activeTab} 
                onChange={(e, v) => setActiveTab(v)} 
                sx={{ minHeight: 40, '& .MuiTab-root': { fontWeight: '800', textTransform: 'uppercase', fontSize: '0.75rem', minHeight: 40, py: 0 } }}
              >
                <Tab label={`Pets (${clientPets.filter(p => p.status !== 'archived').length})`} />
                <Tab label="Owner Details" />
                <Tab label="Billing Ledger" />
                <Tab label="Internal Logs" />
              </Tabs>
            </Box>

            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {activeTab === 0 && <PetList pets={clientPets} calculateAge={calculateAge} onRegisterPet={() => setOpenAddPet(true)} onViewChart={openPetChart} onArchive={archivePet} onQuickBook={(pet) => alert(`Quick booking for ${pet.name}...`)} />}
                {activeTab === 1 && <ClientDetails editForm={editForm} setEditForm={setEditForm} isEditing={isEditing} calculateAge={calculateAge} />}
                {activeTab === 2 && <BillingLedger transactions={clientTransactions} />}
                {activeTab === 3 && <InternalLogs notes={selectedClient.staffNotes || []} newNote={newNote} setNewNote={setNewNote} category={noteCategory} setCategory={setNoteCategory} onAdd={handleAddNote} />}
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
      
      {openPet360 && selectedPet && (
        <Patient360Modal 
            open={openPet360} 
            onClose={() => setOpenPet360(false)} 
            pet={selectedPet}
            history={petHistory}
            vitalsData={vitalsTrend}
            loading={loadingChart}
            onQuickBook={() => alert(`Booking for ${selectedPet.name}...`)}
        />
      )}
    </Box>
  );
}