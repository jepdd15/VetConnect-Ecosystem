import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, MenuItem, Box, Typography, 
  FormControl, InputLabel, Select, RadioGroup, FormControlLabel, Radio, 
  Autocomplete, Alert, CircularProgress, Paper, Divider
} from '@mui/material';

import PersonAddIcon from '@mui/icons-material/PersonAdd';
import WarningIcon from '@mui/icons-material/Warning';

import { collection, doc, getDoc, Timestamp, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function WalkInModal({ open, onClose, servicesList }) {
  const [loading, setLoading] = useState(false);
  const[walkInType, setWalkInType] = useState('existing'); 
  
  const [clients, setClients] = useState([]);
  const[selectedClient, setSelectedClient] = useState(null);
  const [clientPets, setClientPets] = useState([]);
  const [selectedPet, setSelectedPet] = useState('');
  const[fetchingPets, setFetchingPets] = useState(false);

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const[guestPetName, setGuestPetName] = useState('');
  const [guestSpecies, setGuestSpecies] = useState('Canine');

  const [service, setService] = useState('');
  const [triageNotes, setTriageNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (servicesList.length > 0 && !service) setService(servicesList[0].name);
  }, [servicesList, service]);

  useEffect(() => {
    if (open && clients.length === 0) {
      const fetchClients = async () => {
        try {
          const q = query(collection(db, "users"), where("role", "==", "pet_owner"));
          const snap = await getDocs(q);
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          list.sort((a,b) => (a.fullName || '').localeCompare(b.fullName || ''));
          setClients(list);
        } catch (e) { console.error(e); }
      };
      fetchClients();
    }
  }, [open, clients]);

  useEffect(() => {
    if (selectedClient) {
      const fetchPets = async () => {
        setFetchingPets(true);
        setSelectedPet('');
        try {
          const q = query(collection(db, "pets"), where("ownerId", "==", selectedClient.id));
          const snap = await getDocs(q);
          setClientPets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.error(e); }
        setFetchingPets(false);
      };
      fetchPets();
    } else {
      setClientPets([]);
      setSelectedPet('');
    }
  }, [selectedClient]);

  const handleClose = () => {
    setErrorMsg('');
    setWalkInType('existing');
    setSelectedClient(null);
    setGuestName(''); setGuestPhone(''); setGuestPetName(''); setTriageNotes('');
    if (servicesList.length > 0) setService(servicesList[0].name);
    onClose();
  };

  // --- THE SHADOW PROFILE ENGINE ---
  const handleSubmit = async () => {
    setErrorMsg('');
    if (walkInType === 'guest' && (!guestName || !guestPhone || !guestPetName)) return setErrorMsg("Guest details are required.");
    if (walkInType === 'existing' && (!selectedClient || !selectedPet)) return setErrorMsg("Please select an existing client and pet.");
    if (!triageNotes) return setErrorMsg("Triage Notes are required.");
    if (!service) return setErrorMsg("Please select a service.");

    setLoading(true);
    try {
      // Create a writeBatch for atomicity
      const batch = writeBatch(db);

      // STEP 1: Create or Get User/Pet IDs
      let finalOwnerId, finalOwnerName, finalPetId, finalPetName, finalPetSpecies;

      if (walkInType === 'guest') {
        // --- Create a REAL user and pet document ---
        const newUserRef = doc(collection(db, "users"));
        batch.set(newUserRef, {
          fullName: guestName,
          phone: guestPhone,
          role: 'pet_owner',
          accountStatus: 'unclaimed_guest', // The Magic Flag!
          createdAt: Timestamp.now()
        });

        const newPetRef = doc(collection(db, "pets"));
        batch.set(newPetRef, {
          ownerId: newUserRef.id,
          name: guestPetName,
          species: guestSpecies,
          createdAt: Timestamp.now()
        });

        finalOwnerId = newUserRef.id;
        finalOwnerName = guestName;
        finalPetId = newPetRef.id;
        finalPetName = guestPetName;
        finalPetSpecies = guestSpecies;
      } else {
        // Use existing IDs
        finalOwnerId = selectedClient.id;
        finalOwnerName = selectedClient.fullName;
        finalPetId = selectedPet.id;
        finalPetName = selectedPet.name;
        finalPetSpecies = selectedPet.species;
      }

      // STEP 2: Handle Queue Counter
      const queueRef = doc(db, "queue", "daily_queue");
      const queueDoc = await getDoc(queueRef); // Use getDoc because it's not part of a transaction loop
      const newNumber = queueDoc.exists() ? (queueDoc.data().lastNumberIssued || 0) + 1 : 1;
      
      batch.set(queueRef, { 
        lastNumberIssued: newNumber, 
        lastResetDate: new Date().toISOString().split('T')[0] 
      }, { merge: true });

      // STEP 3: Create Appointment Payload
      const selectedServiceObj = servicesList.find(s => s.name === service);
      const isEmergency = service === 'Emergency';
      
      const appointmentPayload = {
        ownerId: finalOwnerId,
        ownerName: finalOwnerName,
        petId: finalPetId,
        petName: finalPetName, 
        petSpecies: finalPetSpecies,
        serviceType: service, 
        servicePrice: selectedServiceObj?.price || 0, 
        requiredRole: selectedServiceObj?.requiredRole || 'veterinarian',
        status: 'arrived', 
        queueNumber: newNumber, 
        ticketPrefix: isEmergency ? 'E' : 'W', 
        priority: isEmergency ? 'high' : 'normal', 
        scheduledDate: Timestamp.now(), 
        createdAt: Timestamp.now(), 
        timeArrived: Timestamp.now(), 
        notes: isEmergency ? `🚨 EMERGENCY: ${triageNotes}` : triageNotes, 
        assignedVet: 'Unassigned' 
      };

      const newApptRef = doc(collection(db, "appointments")); 
      batch.set(newApptRef, appointmentPayload);

      // STEP 4: Commit everything at once!
      await batch.commit();
      
      alert(`Walk-In Logged! Ticket: ${isEmergency ? 'E' : 'W'}-${newNumber}`);
      handleClose();
    } catch (error) { 
      setErrorMsg("Error: " + error.message); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: '#FF9800', color: 'white', fontWeight: 'bold' }}>
        Register Walk-In Patient
      </DialogTitle>
      <DialogContent dividers sx={{ p: 3, bgcolor: '#FAFAFA' }}>
        {errorMsg && <Alert severity="error" sx={{ mb: 3 }}>{errorMsg}</Alert>}
        
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <RadioGroup row value={walkInType} onChange={(e) => setWalkInType(e.target.value)}>
            <FormControlLabel value="existing" control={<Radio />} label="Existing Client" />
            <FormControlLabel value="guest" control={<Radio />} label="Guest Client" />
          </RadioGroup>
        </Box>

        <Paper variant="outlined" sx={{ p: 2.5, mb: 3, bgcolor: 'white', borderRadius: 2 }}>
            <Typography variant="overline" color="primary" fontWeight="bold">Client & Patient Info</Typography>
            {walkInType === 'existing' ? (
                <>
                    <Autocomplete
                        options={clients}
                        getOptionLabel={(option) => `${option.fullName} (${option.phone || 'No phone'})`}
                        value={selectedClient}
                        onChange={(e, v) => setSelectedClient(v)}
                        renderInput={(params) => <TextField {...params} label="Search Client by Name or Phone" size="small" fullWidth sx={{mt: 2, mb: 2}} />}
                    />
                    {selectedClient && (
                        fetchingPets ? <CircularProgress size={24} /> :
                        <FormControl fullWidth size="small">
                            <InputLabel>Select Pet</InputLabel>
                            <Select value={selectedPet || ''} label="Select Pet" onChange={(e) => setSelectedPet(e.target.value)}>
                                {clientPets.map(p => <MenuItem key={p.id} value={p}>🐶 {p.name}</MenuItem>)}
                            </Select>
                        </FormControl>
                    )}
                </>
            ) : (
                <>
                    <TextField label="Owner Full Name" size="small" fullWidth value={guestName} onChange={e => setGuestName(e.target.value)} sx={{mt: 2, mb: 2}} />
                    <TextField label="Contact Phone" size="small" fullWidth value={guestPhone} onChange={e => setGuestPhone(e.target.value)} sx={{mb: 2}} />
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField label="Pet Name" size="small" fullWidth value={guestPetName} onChange={e => setGuestPetName(e.target.value)} sx={{flex: 2}} />
                        <FormControl size="small" sx={{flex: 1}}>
                            <InputLabel>Species</InputLabel>
                            <Select value={guestSpecies} label="Species" onChange={e => setGuestSpecies(e.target.value)}>
                                <MenuItem value="Canine">Canine</MenuItem>
                                <MenuItem value="Feline">Feline</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                </>
            )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'white', borderRadius: 2 }}>
            <Typography variant="overline" color="error" fontWeight="bold">Visit Details</Typography>
            <FormControl fullWidth size="small" sx={{ mt: 2, mb: 2 }}>
                <InputLabel>Service</InputLabel>
                <Select value={service} label="Service" onChange={e => setService(e.target.value)}>
                    {(servicesList ||[]).map(s => <MenuItem key={s.id} value={s.name}>{s.name} (₱{s.price})</MenuItem>)}
                    <Divider />
                    <MenuItem value="Emergency" sx={{color:'red', fontWeight: 'bold'}}><WarningIcon fontSize="small" sx={{mr:1}}/> EMERGENCY</MenuItem>
                </Select>
            </FormControl>
            <TextField label="Triage Notes / Reason for Visit" multiline rows={3} fullWidth size="small" value={triageNotes} onChange={e => setTriageNotes(e.target.value)} />
        </Paper>
      </DialogContent>
      <DialogActions sx={{ p: 2, bgcolor: '#EFEBE9' }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading} color={service === 'Emergency' ? 'error' : 'success'}>
          {loading ? "Processing..." : "Add to Queue"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}