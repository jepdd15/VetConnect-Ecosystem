import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, MenuItem, Box, Typography, 
  FormControl, InputLabel, Select, RadioGroup, FormControlLabel, Radio, 
  Autocomplete, Alert, CircularProgress, Paper, Divider
} from '@mui/material';

import PersonAddIcon from '@mui/icons-material/PersonAdd';
import WarningIcon from '@mui/icons-material/Warning';

import { collection, doc, runTransaction, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function WalkInModal({ open, onClose, servicesList }) {
  // --- CORE STATES ---
  const [loading, setLoading] = useState(false);
  const [walkInType, setWalkInType] = useState('existing'); // 'existing' or 'guest'
  
  // --- EXISTING CLIENT STATES ---
  const[clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientPets, setClientPets] = useState([]);
  const [selectedPet, setSelectedPet] = useState(null);
  const [fetchingPets, setFetchingPets] = useState(false);

  // --- GUEST STATES ---
  const[guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestPetName, setGuestPetName] = useState('');
  const [guestSpecies, setGuestSpecies] = useState('Canine');

  // --- COMMON VISIT STATES ---
  const [service, setService] = useState('Consultation');
  const[triageNotes, setTriageNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Fetch Clients for the Autocomplete Search
  useEffect(() => {
    if (open && clients.length === 0) {
      const fetchClients = async () => {
        try {
          const q = query(collection(db, "users"), where("role", "==", "pet_owner"));
          const snap = await getDocs(q);
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          list.sort((a,b) => (a.fullName || '').localeCompare(b.fullName || ''));
          setClients(list);
        } catch (e) { console.error("Error fetching clients:", e); }
      };
      fetchClients();
    }
  }, [open]);

  // 2. Fetch Pets dynamically when a Client is selected
  useEffect(() => {
    if (selectedClient) {
      const fetchPets = async () => {
        setFetchingPets(true);
        setSelectedPet(null);
        try {
          const q = query(collection(db, "pets"), where("ownerId", "==", selectedClient.id));
          const snap = await getDocs(q);
          setClientPets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.error("Error fetching pets:", e); }
        setFetchingPets(false);
      };
      fetchPets();
    } else {
      setClientPets([]);
      setSelectedPet(null);
    }
  }, [selectedClient]);

  // 3. Reset Form on Close
  const handleClose = () => {
    setErrorMsg('');
    setWalkInType('existing');
    setSelectedClient(null);
    setGuestName(''); setGuestPhone(''); setGuestPetName(''); setTriageNotes('');
    setService('Consultation');
    onClose();
  };

  // --- SUBMIT TRANSACTION ---
  const handleSubmit = async () => {
    setErrorMsg('');
    
    // Validations
    if (walkInType === 'existing') {
        if (!selectedClient || !selectedPet) return setErrorMsg("Please select an existing client and their pet.");
    } else {
        if (!guestName || !guestPhone || !guestPetName) return setErrorMsg("Guest Owner Name, Phone, and Pet Name are required.");
    }
    if (!triageNotes) return setErrorMsg("Triage Notes are required. Please ask the owner why they are here.");

    setLoading(true);

    try {
      await runTransaction(db, async (transaction) => {
        // A. Handle Queue Counter safely
        const queueRef = doc(db, "queue", "daily_queue");
        const queueDoc = await transaction.get(queueRef);
        const newNumber = queueDoc.exists() ? (queueDoc.data().lastNumberIssued || 0) + 1 : 1;
        
        if (queueDoc.exists()) {
            transaction.update(queueRef, { lastNumberIssued: newNumber });
        } else {
            transaction.set(queueRef, { currentServing: 0, currentPrefix: '', lastNumberIssued: newNumber, status: 'active', lastResetDate: new Date().toISOString().split('T')[0] });
        }

        // B. Determine Service Pricing & Emergency status
        const selectedServiceObj = servicesList.find(s => s.name === service);
        const price = selectedServiceObj ? selectedServiceObj.price : 0;
        const requiredRole = selectedServiceObj ? selectedServiceObj.requiredRole : 'veterinarian';
        const isEmergency = service === 'Emergency';

        // C. Build the Dynamic Payload
        let payload = {
          serviceType: service, 
          servicePrice: price, 
          requiredRole: requiredRole,
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

        // D. Save Appointment
        const newDocRef = doc(collection(db, "appointments")); 
        transaction.set(newDocRef, payload);
      });
      
      alert(`Walk-In Logged Successfully! (Ticket ${service === 'Emergency' ? 'E' : 'W'}-#)`);
      handleClose();
    } catch (error) { 
      setErrorMsg("Error saving walk-in: " + error.message); 
    } finally {
      setLoading(false);
    }
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
            <FormControlLabel value="existing" control={<Radio color="primary" />} label={<Typography fontWeight="bold">Existing Client</Typography>} />
            <FormControlLabel value="guest" control={<Radio color="primary" />} label={<Typography fontWeight="bold">New / Guest Client</Typography>} />
          </RadioGroup>
        </Box>

        <Paper variant="outlined" sx={{ p: 2.5, mb: 3, bgcolor: 'white', borderRadius: 2 }}>
            <Typography variant="overline" color="primary" fontWeight="bold" sx={{display:'block', mb: 1}}>Client & Patient Info</Typography>
            
            {walkInType === 'existing' ? (
                // EXISTING CLIENT UI (Smart Autocomplete)
                <>
                    <Autocomplete
                        options={clients}
                        getOptionLabel={(option) => `${option.fullName} (${option.phone || 'No phone'})`}
                        value={selectedClient}
                        onChange={(event, newValue) => setSelectedClient(newValue)}
                        renderInput={(params) => <TextField {...params} label="Search Existing Client" size="small" fullWidth sx={{mb: 2}} autoFocus/>}
                    />
                    
                    {selectedClient && (
                        fetchingPets ? <CircularProgress size={24} sx={{ mt: 1, ml: 1 }} /> :
                        clientPets.length === 0 ? (
                            <Alert severity="warning" sx={{mt: 1}}>No pets registered to this owner. Please use Guest mode or register a pet in the CRM.</Alert>
                        ) : (
                            <FormControl fullWidth size="small">
                                <InputLabel>Select Pet</InputLabel>
                                <Select value={selectedPet || ''} label="Select Pet" onChange={(e) => setSelectedPet(e.target.value)}>
                                    {clientPets.map(p => (
                                        <MenuItem key={p.id} value={p}>
                                            {(p.species === 'Canine' || p.species === 'Dog') ? '🐶 ' : '🐱 '} 
                                            {p.name} ({p.breed || 'Unknown Breed'})
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )
                    )}
                </>
            ) : (
                // GUEST CLIENT UI
                <>
                    <TextField label="Owner Full Name" size="small" fullWidth value={guestName} onChange={(e) => setGuestName(e.target.value)} sx={{mb: 2}} autoFocus />
                    <TextField label="Contact Phone Number" size="small" fullWidth value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} sx={{mb: 2}} />
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField label="Pet Name" size="small" fullWidth value={guestPetName} onChange={(e) => setGuestPetName(e.target.value)} sx={{flex: 2}} />
                        <FormControl size="small" sx={{flex: 1}}>
                            <InputLabel>Species</InputLabel>
                            <Select value={guestSpecies} label="Species" onChange={(e) => setGuestSpecies(e.target.value)}>
                                <MenuItem value="Canine">Canine</MenuItem>
                                <MenuItem value="Feline">Feline</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                </>
            )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'white', borderRadius: 2 }}>
            <Typography variant="overline" color="error" fontWeight="bold" sx={{display:'block', mb: 1}}>Visit Details & Triage</Typography>
            
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Initial Service Needed</InputLabel>
                <Select value={service} label="Initial Service Needed" onChange={(e) => setService(e.target.value)}>
                    {servicesList.map(s => <MenuItem key={s.id} value={s.name}>{s.name} (₱{s.price})</MenuItem>)}
                    <Divider />
                    <MenuItem value="Emergency" sx={{color:'red', fontWeight: 'bold'}}><WarningIcon fontSize="small" sx={{mr:1}}/> EMERGENCY</MenuItem>
                </Select>
            </FormControl>

            <TextField 
                label="Triage Notes / Reason for Visit" 
                placeholder="e.g. Vomiting since yesterday, lethargic..."
                multiline rows={3} fullWidth size="small" 
                value={triageNotes} onChange={(e) => setTriageNotes(e.target.value)} 
                helperText="Required: Helps the doctor prepare for the consultation."
            />
        </Paper>

      </DialogContent>
      <DialogActions sx={{ p: 2, bgcolor: '#EFEBE9' }}>
        <Button onClick={handleClose} sx={{ color: '#5D4037', fontWeight: 'bold' }}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading} color={service === 'Emergency' ? 'error' : 'warning'} sx={{ fontWeight: 'bold', px: 3 }}>
          {loading ? "Processing..." : (service === 'Emergency' ? "Declare Emergency" : "Send to Queue")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}