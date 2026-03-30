import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, MenuItem, Box, Typography, 
  FormControl, InputLabel, Select, RadioGroup, FormControlLabel, Radio, 
  Autocomplete, Alert, CircularProgress, Paper, Divider, Switch, Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import Grid from '@mui/material/Grid';

// Icons
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import WarningIcon from '@mui/icons-material/Warning';
import CircleIcon from '@mui/icons-material/Circle';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'; // Added for accordion functionality

import { collection, doc, runTransaction, Timestamp, query, where, getDocs, writeBatch, setDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function WalkInModal({ open, onClose, servicesList, departments }) {
  const [loading, setLoading] = useState(false);
  const [walkInType, setWalkInType] = useState('existing'); 
  
  // --- EXISTING CLIENT STATES ---
  const [clients, setClients] = useState([]);
  const[selectedClient, setSelectedClient] = useState(null);
  const [clientPets, setClientPets] = useState([]);
  const [selectedPet, setSelectedPet] = useState(null);
  const [fetchingPets, setFetchingPets] = useState(false);

  // --- GUEST CLIENT STATES (Now with Full Data Parity!) ---
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPetData, setGuestPetData] = useState({ name: '', species: 'Canine', breed: '', gender: 'Male', isNeutered: false, dob: '', color: '', microchip: '', allergies: '', weight: '' });
  const [isNewPet, setIsNewPet] = useState(false); // For existing clients adding a new pet

  const [service, setService] = useState('');
  const [triageNotes, setTriageNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [phoneCheckDone, setPhoneCheckDone] = useState(false);
  
  // --- PH PHONE VALIDATION ENGINE ---
  const isValidPHPhone = (number) => {
    const phRegex = /^09\d{9}$/; // Exactly 11 digits starting with 09
    return phRegex.test(number.trim());
  };

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
        setSelectedPet(null); setIsNewPet(false);
        try {
          const q = query(collection(db, "pets"), where("ownerId", "==", selectedClient.id));
          const snap = await getDocs(q);
          setClientPets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.error(e); }
        setFetchingPets(false);
      };
      fetchPets();
    } else {
      setClientPets([]); setSelectedPet(null); setIsNewPet(false);
    }
  }, [selectedClient]);

  const handleClose = () => {
    setErrorMsg(''); setWalkInType('existing'); setSelectedClient(null);
    setGuestName(''); setGuestPhone(''); setGuestEmail(''); setTriageNotes('');
    setGuestPetData({ name: '', species: 'Canine', breed: '', gender: 'Male', isNeutered: false, dob: '', color: '', microchip: '', allergies: '', weight: '' });
    setPhoneCheckDone(false);
    onClose();
  };

  const handleSubmit = async () => {
    setErrorMsg('');
    
    // VALIDATION
    if (walkInType === 'existing' && !selectedClient) return setErrorMsg("Please select an existing client.");
    if (walkInType === 'existing' && !selectedPet && !isNewPet) return setErrorMsg("Please select a pet or choose 'Register New Pet'.");
    if (walkInType === 'existing' && isNewPet && (!guestPetData.name || !guestPetData.breed)) return setErrorMsg("New pet name and breed are required.");
    if (walkInType === 'guest' && (!guestName || !guestPhone || !guestPetData.name || !guestPetData.breed)) return setErrorMsg("Owner Full Name, Contact Phone, Pet Name, and Breed are required.");
    if (!triageNotes) return setErrorMsg("Triage Notes are required.");
    if (!service) return setErrorMsg("Please select a service.");

    // Phone validation for new guests
    if (walkInType === 'guest' && !isValidPHPhone(guestPhone)) {
      return setErrorMsg("Contact Phone must be a valid Philippine number starting with 09 (e.g., 09123456789).");
    }

    // DUPLICATE PHONE DETECTION (Hard Block)
    if (walkInType === 'guest' && !phoneCheckDone) {
      try {
        const phoneQ = query(collection(db, 'users'), where('phone', '==', guestPhone.trim()));
        const phoneSnap = await getDocs(phoneQ);
        if (!phoneSnap.empty) {
          const existing = phoneSnap.docs[0].data();
          return setErrorMsg(`A client with this phone number already exists: "${existing.fullName || existing.displayName || 'Unknown'}". Please switch to Existing Client mode and search for them instead.`);
        }
        setPhoneCheckDone(true);
      } catch (e) { console.warn('Phone check skipped:', e); }
    }

    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        // 1. READS FIRST (Firestore Requirement)
        const queueRef = doc(db, "queue", "daily_queue");
        const queueDoc = await transaction.get(queueRef);
        const newNumber = queueDoc.exists() ? (queueDoc.data().lastNumberIssued || 0) + 1 : 1;

        let finalOwnerId, finalOwnerName, finalPetId, finalPetName, finalPetSpecies;

        if (walkInType === 'guest') {
          const newUserRef = doc(collection(db, "users"));
          transaction.set(newUserRef, { 
              fullName: guestName || 'Guest Client', 
              displayName: guestName || 'Guest Client', 
              name: guestName || 'Guest Client',
              phone: guestPhone, 
              email: guestEmail || null,
              role: 'pet_owner', 
              accountStatus: 'unclaimed_guest', 
              createdAt: Timestamp.now() 
          });
          finalOwnerId = newUserRef.id; finalOwnerName = guestName || 'Guest Client';
          
          const petPayload = { ...guestPetData };
          const weightVal = parseFloat(petPayload.weight);
          delete petPayload.weight;
          
          const newPetRef = doc(collection(db, "pets"));
          transaction.set(newPetRef, { 
              ownerId: finalOwnerId, ...petPayload, 
              lastWeight: weightVal > 0 ? weightVal : null,
              dob: guestPetData.dob ? Timestamp.fromDate(new Date(guestPetData.dob)) : null, 
              createdAt: Timestamp.now(), status: 'active' 
          });
          finalPetId = newPetRef.id; finalPetName = guestPetData.name; finalPetSpecies = guestPetData.species;
        } else { // Existing Client
          finalOwnerId = selectedClient.id; 
          finalOwnerName = selectedClient.fullName || selectedClient.displayName || 'Existing Client';
          
          if (isNewPet) {
             const petPayload = { ...guestPetData };
             const weightVal = parseFloat(petPayload.weight);
             delete petPayload.weight;
             
             const newPetRef = doc(collection(db, "pets"));
             transaction.set(newPetRef, { 
                 ownerId: finalOwnerId, ...petPayload,
                 lastWeight: weightVal > 0 ? weightVal : null,
                 dob: guestPetData.dob ? Timestamp.fromDate(new Date(guestPetData.dob)) : null, 
                 createdAt: Timestamp.now(), status: 'active' 
             });
             finalPetId = newPetRef.id; finalPetName = guestPetData.name; finalPetSpecies = guestPetData.species;
          } else {
             finalPetId = selectedPet.id; finalPetName = selectedPet.name; finalPetSpecies = selectedPet.species;
             const arrivalWeight = parseFloat(guestPetData.weight);
             if (arrivalWeight > 0) {
               transaction.update(doc(db, 'pets', selectedPet.id), { lastWeight: arrivalWeight });
             }
          }
        }
        
        // 2. UPDATES & WRITES
        transaction.set(queueRef, { lastNumberIssued: newNumber }, { merge: true });

        const selectedServiceObj = servicesList.find(s => s.name === service);
        const isEmergency = service === 'Emergency';
        const department = selectedServiceObj?.department || selectedServiceObj?.category || 'General';
        
        const resolvedBreed = (walkInType === 'guest' || isNewPet) ? guestPetData.breed : (selectedPet?.breed || '');
        const resolvedWeight = parseFloat(guestPetData.weight) || (selectedPet?.lastWeight ? parseFloat(selectedPet.lastWeight) : null);
        const resolvedAllergies = (walkInType === 'guest' || isNewPet) ? guestPetData.allergies : (selectedPet?.allergies || '');

        const appointmentPayload = {
          ownerId: finalOwnerId, ownerName: finalOwnerName, petId: finalPetId, petName: finalPetName, petSpecies: finalPetSpecies,
          petBreed: resolvedBreed || 'Mixed', petWeight: resolvedWeight || null, petAllergies: resolvedAllergies || '',
          serviceType: service, servicePrice: selectedServiceObj?.price || 0, serviceCategory: department, requiredRole: department,
          status: 'arrived', queueNumber: newNumber, ticketPrefix: isEmergency ? 'E' : 'W', priority: isEmergency ? 'high' : 'normal', 
          scheduledDate: Timestamp.now(), createdAt: Timestamp.now(), timeArrived: Timestamp.now(), 
          notes: isEmergency ? `🚨 EMERGENCY: ${triageNotes}` : triageNotes, 
          assignedVetId: null, assignedVet: 'Unassigned' 
        };

        const newApptRef = doc(collection(db, "appointments")); 
        transaction.set(newApptRef, appointmentPayload);
      });
      
      alert(`Walk-In Logged!`);
      handleClose();
    } catch (error) { 
      setErrorMsg("Error: " + error.message); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ 
          background: 'linear-gradient(135deg, #8B4513 0%, #5D4037 100%)', 
          color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 
      }}>
        <DirectionsWalkIcon /> Register Walk-In Patient
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 3, bgcolor: '#F5F5F5' }}>
        {errorMsg && <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>}
        
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <RadioGroup row value={walkInType} onChange={(e) => {
            setWalkInType(e.target.value);
            // Reset guest data when switching type
            setGuestName(''); setGuestPhone(''); setGuestEmail(''); setPhoneCheckDone(false);
            setGuestPetData({ name: '', species: 'Canine', breed: '', gender: 'Male', isNeutered: false, dob: '', color: '', microchip: '', allergies: '', weight: '' });
            setSelectedClient(null); setSelectedPet(null); setIsNewPet(false);
          }}>
            <FormControlLabel value="existing" control={<Radio />} label="Existing Client" />
            <FormControlLabel value="guest" control={<Radio />} label="Guest / New Client" />
          </RadioGroup>
        </Box>

        {walkInType === 'existing' ? (
            <Box sx={{ p: 3, mb: 3, borderRadius: 2, background: 'rgba(255, 255, 255, 0.6)', border: '1px solid rgba(0,0,0,0.08)' }}>
              <Typography variant="overline" color="primary" fontWeight="bold">Client & Pet Selection</Typography>
                <Autocomplete
                    options={clients}
                    getOptionLabel={(option) => `${option.fullName} (${option.phone || 'No phone'})`}
                    value={selectedClient}
                    onChange={(e, v) => setSelectedClient(v)}
                    renderInput={(params) => <TextField {...params} variant="filled" label="Search Client..." size="small" fullWidth sx={{mt: 2, mb: 2}} />}
                />
                {selectedClient && (
                    fetchingPets ? <CircularProgress size={24} /> : (
                      <>
                        <FormControl fullWidth size="small" variant="filled" sx={{mb: 2}}>
                            <InputLabel>Select Pet</InputLabel>
                            <Select value={selectedPet || ''} label="Select Pet" onChange={(e) => {setSelectedPet(e.target.value); setIsNewPet(false);}} disabled={isNewPet}>
                                {clientPets.map(p => <MenuItem key={p.id} value={p}>{(p.species === 'Dog' || p.species === 'Canine') ? '🐶' : '🐱'} {p.name}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <FormControlLabel control={<Switch checked={isNewPet} onChange={(e) => {setIsNewPet(e.target.checked); setSelectedPet(null); setGuestPetData({ name: '', species: 'Canine', breed: '', gender: 'Male', isNeutered: false, dob: '', color: '', microchip: '', allergies: '', weight: '' }); }} color="primary" />} label={<Typography fontWeight="bold" color="primary">Register New Pet for this Client</Typography>} />
                        {selectedPet && !isNewPet && (
                          <TextField 
                            label="Arrival Weight (kg)" variant="filled" size="small" type="number"
                            inputProps={{ step: '0.1', min: '0' }}
                            value={guestPetData.weight} 
                            onChange={e => setGuestPetData({...guestPetData, weight: e.target.value})}
                            helperText={selectedPet.lastWeight ? `Last recorded: ${selectedPet.lastWeight} kg` : 'No previous weight on file'}
                            sx={{ mt: 1.5 }}
                            fullWidth
                          />
                        )}
                      </>
                    )
                )}
            </Box>
        ) : null}

        {(walkInType === 'guest' || isNewPet) && (
            <Box sx={{ p: 3, mb: 3, borderRadius: 2, background: 'rgba(255, 255, 255, 0.6)', border: '1px solid rgba(0,0,0,0.08)' }}>
                <Typography variant="overline" color="primary" fontWeight="bold">
                    {walkInType === 'guest' ? 'Guest & Pet Information' : 'New Pet Information'}
                </Typography>
                
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                    {walkInType === 'guest' && (
                        <>
                           <Grid size={{ xs: 12, md: 5 }}><TextField label="Owner Full Name" variant="filled" size="small" fullWidth value={guestName} onChange={e => setGuestName(e.target.value)} /></Grid> 
                           <Grid size={{ xs: 12, md: 4 }}><TextField label="Contact Phone" variant="filled" size="small" fullWidth value={guestPhone} onChange={e => { setGuestPhone(e.target.value); setPhoneCheckDone(false); }} helperText="Must start with 09" /></Grid> 
                           <Grid size={{ xs: 12, md: 3 }}><TextField label="Email (Optional)" variant="filled" size="small" fullWidth value={guestEmail} onChange={e => setGuestEmail(e.target.value)} /></Grid>
                           <Grid size={{ xs: 12 }}><Divider sx={{ my: 1 }} /></Grid>
                        </>
                    )}
                <Grid size={{ xs: 12, md: 6 }}><TextField label="Pet Name" variant="filled" size="small" fullWidth value={guestPetData.name} onChange={e => setGuestPetData({...guestPetData, name: e.target.value})} /></Grid>
                <Grid size={{ xs: 12, md: 3 }}><TextField select label="Species" variant="filled" fullWidth size="small" value={guestPetData.species} onChange={e => setGuestPetData({...guestPetData, species: e.target.value})}><MenuItem value="Canine">Canine</MenuItem><MenuItem value="Feline">Feline</MenuItem></TextField></Grid>
                <Grid size={{ xs: 12, md: 3 }}><TextField label="Weight (kg)" variant="filled" size="small" fullWidth type="number" inputProps={{ step: '0.1', min: '0' }} value={guestPetData.weight} onChange={e => setGuestPetData({...guestPetData, weight: e.target.value})} /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><TextField label="Breed" variant="filled" size="small" fullWidth value={guestPetData.breed} onChange={e => setGuestPetData({...guestPetData, breed: e.target.value})} /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><TextField label="Color/Markings" variant="filled" size="small" fullWidth value={guestPetData.color} onChange={e => setGuestPetData({...guestPetData, color: e.target.value})} /></Grid>
                <Grid size={{ xs: 12, md: 4 }}><TextField type="date" label="Birthday" variant="filled" size="small" fullWidth InputLabelProps={{shrink:true}} value={guestPetData.dob} onChange={e => setGuestPetData({...guestPetData, dob: e.target.value})} /></Grid>
                <Grid size={{ xs: 12, md: 4 }}><TextField select label="Gender" variant="filled" fullWidth size="small" value={guestPetData.gender} onChange={e => setGuestPetData({...guestPetData, gender: e.target.value})}><MenuItem value="Male">Male</MenuItem><MenuItem value="Female">Female</MenuItem></TextField></Grid>
                <Grid size={{ xs: 12, md: 4 }}><TextField label="Microchip #" variant="filled" size="small" fullWidth value={guestPetData.microchip} onChange={e => setGuestPetData({...guestPetData, microchip: e.target.value})} /></Grid>
                <Grid size={{ xs: 12 }}><TextField label="Allergies" variant="filled" size="small" fullWidth placeholder="e.g. Chicken, Penicillin (leave blank if none)" value={guestPetData.allergies} onChange={e => setGuestPetData({...guestPetData, allergies: e.target.value})} /></Grid>
                <Grid size={{ xs: 12 }}><FormControlLabel control={<Switch checked={guestPetData.isNeutered} onChange={e => setGuestPetData({...guestPetData, isNeutered: e.target.checked})} color="success"/>} label="Spayed/Neutered" /></Grid>
            </Grid>
            </Box>
        )}

        <Box sx={{ p: 3, borderRadius: 2, background: 'rgba(255, 255, 255, 0.6)', border: '1px solid rgba(0,0,0,0.08)' }}>
            <Typography variant="overline" color="error" fontWeight="bold">Visit Details</Typography>
            <FormControl fullWidth size="small" variant="filled" sx={{ mt: 2, mb: 2 }}>
                <InputLabel>Service</InputLabel>
                <Select value={service} label="Service" onChange={e => setService(e.target.value)}>
                    {(servicesList ||[]).map((s) => {
                      const deptName = s.department || s.category || 'General';
                      const deptObj = (departments ||[]).find(d => d.name === deptName);
                      const badgeColor = deptObj ? deptObj.color : '#616161';
                      return ( <MenuItem key={s.id} value={s.name} disabled={!s.isWalkIn}> <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}> <CircleIcon sx={{ color: badgeColor, fontSize: 16 }} /> <Typography variant="body2" fontWeight="bold">{s.name} (₱{s.price})</Typography> </Box> </MenuItem> );
                    })}
                    <Divider />
                    <MenuItem value="Emergency" sx={{color:'red', fontWeight: 'bold'}}><WarningIcon fontSize="small" sx={{mr:1}}/> EMERGENCY</MenuItem>
                </Select>
            </FormControl>
            <TextField label="Triage Notes / Reason for Visit" multiline rows={3} fullWidth size="small" variant="filled" value={triageNotes} onChange={e => setTriageNotes(e.target.value)} />
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2.5, bgcolor: '#EFEBE9', borderTop: '1px solid #D7CCC8' }}>
        <Button onClick={handleClose} sx={{ fontWeight: 'bold', color: '#555' }}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading} color={service === 'Emergency' ? 'error' : 'success'} sx={{ px: 3, fontWeight: 'bold' }}>
          {loading ? "Processing..." : "Add to Queue"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}