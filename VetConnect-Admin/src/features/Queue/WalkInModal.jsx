// On-site patient registration.
// Utilizes a smart autocomplete field to rapidly pull existing clients, or swaps to a 
// Guest Intake form for new walk-ins, automatically capturing triage notes.

import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, MenuItem, Box, Typography, 
  FormControl, InputLabel, Select, RadioGroup, FormControlLabel, Radio, 
  Autocomplete, Alert, CircularProgress, Paper, Divider // Paper added to imports!
} from '@mui/material';

import PersonAddIcon from '@mui/icons-material/PersonAdd';
import WarningIcon from '@mui/icons-material/Warning';

import { collection, doc, runTransaction, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function WalkInModal({ open, onClose, servicesList }) {
  const [loading, setLoading] = useState(false);
  const [walkInType, setWalkInType] = useState('existing'); 
  
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientPets, setClientPets] = useState([]);
  const [selectedPet, setSelectedPet] = useState('');
  const [fetchingPets, setFetchingPets] = useState(false);

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestPetName, setGuestPetName] = useState('');
  const [guestSpecies, setGuestSpecies] = useState('Canine');

  const [service, setService] = useState('');
  const [triageNotes, setTriageNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Auto-select first service
  useEffect(() => {
    if (servicesList.length > 0 && !service) {
      setService(servicesList[0].name);
    }
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

  const handleSubmit = async () => {
    setErrorMsg('');
    if (walkInType === 'guest') {
        if (!guestName || !guestPhone || !guestPetName) return setErrorMsg("Owner Name, Phone, and Pet Name are required.");
    } else {
        if (!selectedClient || !selectedPet) return setErrorMsg("Please select an existing client and their pet.");
    }
    if (!triageNotes) return setErrorMsg("Triage Notes are required.");
    if (!service) return setErrorMsg("Please select a service.");

    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const queueRef = doc(db, "queue", "daily_queue");
        const queueDoc = await transaction.get(queueRef);
        const newNumber = queueDoc.exists() ? (queueDoc.data().lastNumberIssued || 0) + 1 : 1;
        
        transaction.set(queueRef, { 
            currentServing: queueDoc.data()?.currentServing || 0,
            currentPrefix: queueDoc.data()?.currentPrefix || '',
            lastNumberIssued: newNumber, 
            status: 'active', 
            lastResetDate: new Date().toISOString().split('T')[0] 
        }, { merge: true });

        const selectedServiceObj = servicesList.find(s => s.name === service);
        const price = selectedServiceObj ? selectedServiceObj.price : 0;
        const requiredRole = selectedServiceObj ? selectedServiceObj.requiredRole : 'veterinarian';
        const isEmergency = service === 'Emergency';

        let payload = {
          serviceType: service, servicePrice: price, requiredRole: requiredRole,
          status: 'arrived', queueNumber: newNumber, ticketPrefix: isEmergency ? 'E' : 'W', 
          priority: isEmergency ? 'high' : 'normal', scheduledDate: Timestamp.now(), 
          createdAt: Timestamp.now(), timeArrived: Timestamp.now(), 
          notes: isEmergency ? `🚨 EMERGENCY: ${triageNotes}` : triageNotes, 
          assignedVet: 'Unassigned' 
        };

        if (walkInType === 'guest') {
            payload = {
                ...payload,
                ownerId: `GUEST_${Date.now()}`,
                ownerName: `${guestName} (Guest)`,
                ownerPhone: guestPhone,
                petId: `GUEST_PET_${Date.now()}`,
                petName: guestPetName, 
                petSpecies: guestSpecies, 
            };
        } else {
            payload = {
                ...payload,
                ownerId: selectedClient.id,
                ownerName: selectedClient.fullName,
                petId: selectedPet.id,
                petName: selectedPet.name, 
                petSpecies: selectedPet.species || 'Unknown', 
            };
        }

        const newDocRef = doc(collection(db, "appointments")); 
        transaction.set(newDocRef, payload);
      });
      
      alert("Walk-In Logged Successfully!");
      handleClose();
    } catch (error) { 
      setErrorMsg("Error: " + error.message); 
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: '#FF9800', color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
        <PersonAddIcon /> Register Walk-In Patient
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 3, bgcolor: '#FAFAFA' }}>
        {errorMsg ? <Alert severity="error" sx={{ mb: 3, fontWeight: 'bold' }}>{errorMsg}</Alert> : null}

        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
          <RadioGroup row value={walkInType} onChange={(e) => setWalkInType(e.target.value)}>
            <FormControlLabel value="existing" control={<Radio />} label="Existing Client" />
            <FormControlLabel value="guest" control={<Radio />} label="Guest Client" />
          </RadioGroup>
        </Box>

        <Paper variant="outlined" sx={{ p: 2.5, mb: 3, bgcolor: 'white', borderRadius: 2 }}>
            <Typography variant="overline" color="primary" fontWeight="bold" sx={{display:'block', mb: 1}}>Client & Patient Info</Typography>
            
            {walkInType === 'existing' ? (
                <>
                    <Autocomplete
                        options={clients}
                        getOptionLabel={(option) => `${option.fullName} (${option.phone || 'No phone'})`}
                        value={selectedClient}
                        onChange={(e, v) => setSelectedClient(v)}
                        renderInput={(params) => <TextField {...params} label="Search Existing Client" size="small" fullWidth sx={{mb: 2}} />}
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
                    <TextField label="Owner Name" size="small" fullWidth value={guestName} onChange={e => setGuestName(e.target.value)} sx={{mb: 2}} />
                    <TextField label="Phone Number" size="small" fullWidth value={guestPhone} onChange={e => setGuestPhone(e.target.value)} sx={{mb: 2}} />
                    <TextField label="Pet Name" size="small" fullWidth value={guestPetName} onChange={e => setGuestPetName(e.target.value)} sx={{mb: 2}} />
                    <TextField select label="Species" size="small" fullWidth value={guestSpecies} onChange={e => setGuestSpecies(e.target.value)}><MenuItem value="Canine">Canine</MenuItem><MenuItem value="Feline">Feline</MenuItem></TextField>
                </>
            )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'white', borderRadius: 2 }}>
            <Typography variant="overline" color="error" fontWeight="bold" sx={{display:'block', mb: 1}}>Visit Details</Typography>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Service</InputLabel>
                <Select value={service} label="Service" onChange={e => setService(e.target.value)}>
                    {servicesList.map(s => <MenuItem key={s.id} value={s.name}>{s.name} (₱{s.price})</MenuItem>)}
                    <MenuItem value="Emergency" sx={{color:'red', fontWeight: 'bold'}}>🚨 EMERGENCY</MenuItem>
                </Select>
            </FormControl>
            <TextField label="Triage Notes" multiline rows={3} fullWidth size="small" value={triageNotes} onChange={e => setTriageNotes(e.target.value)} />
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