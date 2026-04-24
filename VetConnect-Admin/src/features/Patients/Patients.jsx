import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Tabs, Tab, Typography, CircularProgress } from '@mui/material';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

// Design Tokens
import { FONT, TYPE, COLORS } from '../../theme/designTokens';

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
import WalkInModal from '../Queue/WalkInModal';
import EditPetModal from './modals/EditPetModal';
import NewClientModal from './modals/NewClientModal';

// Icons
import PetsIcon from '@mui/icons-material/Pets';

export default function Patients() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const df = location.state?.dashboardFilter;
    if (!df) return;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { 
    owners, allPetsSnapshot, searchText, setSearchText, selectedClient, 
    clientPets, clientTransactions, outstandingBalance, 
    handleSelectClient, calculatePetAge, isEditing, setIsEditing,
    editForm, setEditForm, handleSaveProfile,
    newNote, setNewNote, noteCategory, setNoteCategory, handleAddNote, handleDeleteNote,
    newPetData, setNewPetData, handleAdminAddPet,
    loading, loadingClientData, archivePet, restorePet
  } = usePatientManager(() => setActiveTab(0));

  // Modal States
  const [openAddPet, setOpenAddPet] = useState(false);
  const [openQuickBook, setOpenQuickBook] = useState(false);
  const [openNewClient, setOpenNewClient] = useState(false);
  const [openEditPet, setOpenEditPet] = useState(false);
  const [selectedPet, setSelectedPet] = useState(null);

  // Services & departments for WalkInModal (T2.115)
  const [servicesList, setServicesList] = useState([]);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    const unsubSvc = onSnapshot(collection(db, 'services'), (snap) => {
      setServicesList(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !s.isArchived));
    });
    const unsubDept = onSnapshot(collection(db, 'departments'), (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubSvc(); unsubDept(); };
  }, []);

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
    <Box sx={{ m: -4, display: 'flex', height: '100vh', width: 'calc(100% + 64px)', overflow: 'hidden', bgcolor: COLORS.surfaceAlt }}>
      
      <PatientDirectory 
        owners={filteredOwners} 
        selectedId={selectedClient?.id} 
        onSelect={handleSelectClient} 
        searchText={searchText}
        onSearchChange={(e) => setSearchText(e.target.value)}
        onNewClient={() => setOpenNewClient(true)} 
      />

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: `linear-gradient(160deg, ${COLORS.surface} 0%, #FFE0B2 100%)` }}>
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
            
            <Box sx={{ px: 4, pt: 1, borderBottom: `1px solid ${COLORS.border}`, bgcolor: COLORS.surfaceAlt }}>
              <Tabs 
                value={activeTab} 
                onChange={(e, v) => setActiveTab(v)} 
                sx={{ 
                  minHeight: 44, 
                  '& .MuiTabs-indicator': { height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, bgcolor: COLORS.cta },
                  '& .MuiTab-root': { fontFamily: FONT, fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', minHeight: 44, py: 1, px: 3, color: COLORS.textMuted },
                  '& .Mui-selected': { color: `${COLORS.cta} !important` },
                }}
              >
                <Tab label={`Pets (${clientPets.filter(p => p.status !== 'archived').length})`} />
                <Tab label="Owner Details" />
                <Tab label="Billing Ledger" />
                <Tab label="Internal Logs" />
              </Tabs>
            </Box>

            <Box sx={{ flexGrow: 1, overflowY: 'auto', bgcolor: COLORS.surface, position: 'relative' }}>
              {loadingClientData && (
                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.7)', zIndex: 10 }}>
                  <CircularProgress size={32} />
                </Box>
              )}
              {activeTab === 0 && <PetList pets={clientPets} calculatePetAge={calculatePetAge} onRegisterPet={() => setOpenAddPet(true)} onArchive={archivePet} onRestore={restorePet} onQuickBook={handleQuickBookOpen} onEditPet={(pet) => { setSelectedPet(pet); setOpenEditPet(true); }} />}
              {activeTab === 1 && <ClientDetails editForm={editForm} setEditForm={setEditForm} isEditing={isEditing} calculatePetAge={calculatePetAge} />}
              {activeTab === 2 && <BillingLedger transactions={clientTransactions} />}
              {activeTab === 3 && <InternalLogs notes={selectedClient.staffNotes || []} newNote={newNote} setNewNote={setNewNote} category={noteCategory} setCategory={setNoteCategory} onAdd={handleAddNote} onDelete={handleDeleteNote} />}
            </Box>
          </>
        ) : (
           <Box sx={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection: 'column', color: COLORS.textMuted }}>
             <PetsIcon sx={{ fontSize: 80, mb: 2, opacity: 0.15 }} />
             <Typography variant="h6" sx={{ fontFamily: FONT, color: COLORS.textMuted, fontWeight: 'bold' }}>No Client Selected</Typography>
             <Typography variant="body2" sx={{ fontFamily: FONT, color: COLORS.textMuted }}>Search or select a client from the directory to view their profile.</Typography>
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
        <WalkInModal
          open={openQuickBook}
          onClose={() => setOpenQuickBook(false)}
          servicesList={servicesList}
          departments={departments}
          prefillClient={selectedClient}
          prefillPet={selectedPet}
        />
      )}

      {openNewClient && (
        <NewClientModal 
          open={openNewClient} 
          onClose={() => setOpenNewClient(false)} 
        />
      )}

      {openEditPet && selectedPet && (
        <EditPetModal 
          open={openEditPet} 
          onClose={() => setOpenEditPet(false)} 
          pet={selectedPet} 
        />
      )}
    </Box>
  );
}