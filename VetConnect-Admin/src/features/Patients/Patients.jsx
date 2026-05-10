import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Tabs, Tab, Typography, CircularProgress, Snackbar, Alert, Button } from '@mui/material';
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
import ErasureConfirmationDialog from './modals/ErasureConfirmationDialog';

// Icons
import PetsIcon from '@mui/icons-material/Pets';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';

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
    loading, loadingClientData, archivePet, restorePet,
    engagementKPIs,
  } = usePatientManager(() => setActiveTab(0));

  // T2.129: Snackbar for save feedback
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  // Modal States
  const [openAddPet, setOpenAddPet] = useState(false);
  const [openQuickBook, setOpenQuickBook] = useState(false);
  const [openNewClient, setOpenNewClient] = useState(false);
  const [openEditPet, setOpenEditPet] = useState(false);
  const [selectedPet, setSelectedPet] = useState(null);

  // RA 10173 erasure dialog state
  const [erasureTarget, setErasureTarget] = useState(null); // { userId, userName, requestDate }

  const pendingDeletionRequests = useMemo(
    () => owners.filter((o) => o.deletionRequested === true),
    [owners]
  );

  const handleOpenErasure = (client) => {
    const requestDate = client.deletionRequestedAt?.seconds
      ? new Date(client.deletionRequestedAt.seconds * 1000)
      : null;
    setErasureTarget({ userId: client.id, userName: client.fullName, requestDate });
  };

  const handleCloseErasure = () => setErasureTarget(null);

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
      const matchesPet = allPetsSnapshot.some(p => p.ownerId === o.id && (p.name || '').toLowerCase().includes(searchLower));
      return matchesOwner || matchesPet;
    });
  }, [owners, allPetsSnapshot, searchText]);



  const handleQuickBookOpen = (pet) => {
    setSelectedPet(pet);
    setOpenQuickBook(true);
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', bgcolor: COLORS.surfaceAlt }}>
      
      <PatientDirectory 
        owners={filteredOwners} 
        selectedId={selectedClient?.id} 
        onSelect={handleSelectClient} 
        searchText={searchText}
        onSearchChange={(e) => setSearchText(e.target.value)}
        onNewClient={() => setOpenNewClient(true)} 
      />

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: `linear-gradient(160deg, ${COLORS.surface} 0%, ${COLORS.peach} 100%)` }}>

        {/* RA 10173 — Pending deletion requests banner */}
        {pendingDeletionRequests.length > 0 && (
          <Box
            sx={{
              bgcolor: COLORS.dangerSurface,
              borderBottom: `2px solid ${COLORS.danger}`,
              px: 3,
              py: 1.25,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: pendingDeletionRequests.length > 0 ? 0.75 : 0 }}>
              <WarningAmberIcon sx={{ color: COLORS.danger, fontSize: 18 }} />
              <Typography
                sx={{
                  fontFamily: FONT,
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  color: COLORS.danger,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                }}
              >
                {pendingDeletionRequests.length} client{pendingDeletionRequests.length !== 1 ? 's' : ''} have requested account erasure under RA 10173
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {pendingDeletionRequests.map((client) => (
                <Box
                  key={client.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    bgcolor: COLORS.cardBg,
                    border: `1px solid #EF9A9A`,
                    px: 1.5,
                    py: 0.5,
                  }}
                >
                  <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.8rem', color: COLORS.textPrimary }}>
                    {client.fullName}
                  </Typography>
                  {client.deletionRequestedAt?.seconds && (
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: COLORS.textMuted }}>
                      {new Date(client.deletionRequestedAt.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Typography>
                  )}
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<DeleteForeverIcon sx={{ fontSize: '14px !important' }} />}
                    onClick={() => handleOpenErasure(client)}
                    sx={{
                      fontFamily: FONT,
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      borderRadius: 0,
                      bgcolor: COLORS.danger,
                      color: '#fff',
                      py: 0.25,
                      px: 1,
                      minHeight: 0,
                      boxShadow: `2px 2px 0px ${COLORS.dangerHover}`,
                      '&:hover': { bgcolor: COLORS.dangerHover, boxShadow: 'none' },
                    }}
                  >
                    Process Erasure
                  </Button>
                </Box>
              ))}
            </Box>
          </Box>
        )}

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
              engagementKPIs={engagementKPIs}
              onProcessErasure={() => handleOpenErasure(selectedClient)}
              onSave={async () => {
                  try {
                      await handleSaveProfile();
                      setSnack({ open: true, message: 'Profile saved successfully.', severity: 'success' });
                      setIsEditing(false); // Make sure to exit edit mode
                  } catch(e) {
                      setSnack({ open: true, message: e.message, severity: 'error' });
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
                <Tab label={`Pets (${clientPets.filter(p => p.status !== 'archived' && p.status !== 'deceased').length})`} />
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
          onSubmit={async () => { try { const success = await handleAdminAddPet(); if(success) setOpenAddPet(false); } catch(e) { setSnack({ open: true, message: e.message, severity: 'error' }); } }}
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

      {/* RA 10173 erasure confirmation */}
      {erasureTarget && (
        <ErasureConfirmationDialog
          open={Boolean(erasureTarget)}
          onClose={handleCloseErasure}
          userId={erasureTarget.userId}
          userName={erasureTarget.userName}
          requestDate={erasureTarget.requestDate}
          onSuccess={(message) => {
            handleCloseErasure();
            setSnack({ open: true, message, severity: 'success' });
          }}
        />
      )}

      {/* T2.129: Save/error feedback */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack(s => ({ ...s, open: false }))}
          severity={snack.severity}
          variant="filled"
          sx={{ fontFamily: FONT, width: '100%' }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}