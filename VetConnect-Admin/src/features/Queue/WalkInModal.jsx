import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, MenuItem, Box, Typography, 
  FormControl, InputLabel, Select, RadioGroup, FormControlLabel, Radio, 
  Autocomplete, Alert, CircularProgress, Paper, Divider, Switch, Accordion, AccordionSummary, AccordionDetails, Chip, Stack,
  ToggleButton, ToggleButtonGroup
} from '@mui/material';
import Grid from '@mui/material/Grid';

// Icons
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import WarningIcon from '@mui/icons-material/Warning';
import CircleIcon from '@mui/icons-material/Circle';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import AccessTimeIcon from '@mui/icons-material/AccessTime'; 
import CakeIcon from '@mui/icons-material/Cake';

import { collection, doc, runTransaction, Timestamp, query, where, getDocs, writeBatch, setDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useUser } from '../../context/UserContext';

export default function WalkInModal({ open, onClose, servicesList, departments }) {
  const { profile } = useUser();
  const staffSignature = profile?.fullName || 'System/Admin';
  
  const [loading, setLoading] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
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
  const [guestPetData, setGuestPetData] = useState({ name: '', species: 'Canine', breed: '', gender: 'Male', isNeutered: false, dob: '', color: '', microchip: '', petAllergies: '', weight: '' });
  const [triageNotes, setTriageNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isNewPet, setIsNewPet] = useState(false); // For existing clients adding a new pet
  const [selectedServices, setSelectedServices] = useState([]); // THE FIX: Changed to Array for Multi-Service support
  const [phoneCheckDone, setPhoneCheckDone] = useState(false);
  const [dobMode, setDobMode] = useState('exact'); // 'exact', 'approximate', 'unknown'
  const [estYears, setEstYears] = useState('');
  const [estMonths, setEstMonths] = useState('');
  const [showAllergyInput, setShowAllergyInput] = useState(false);
  const [allergyArray, setAllergyArray] = useState([]);
  const [currentAllergyInput, setCurrentAllergyInput] = useState('');
  
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
    setGuestPetData({ name: '', species: 'Canine', breed: '', gender: 'Male', isNeutered: false, dob: '', color: '', microchip: '', petAllergies: '', weight: '' });
    setPhoneCheckDone(false);
    setSelectedServices([]); 
    setConfirmDiscard(false);
    setConfirmSubmit(false);
    onClose();
  };

  const handleSubmit = async () => {
    setErrorMsg('');
    
    // VALIDATION
    if (walkInType === 'existing' && !selectedClient) return setErrorMsg("Please select an existing client.");
    if (walkInType === 'existing' && !selectedPet && !isNewPet) return setErrorMsg("Please select a pet or choose 'Register New Pet'.");
    
    // Alphabetical Synthesis Sorting
    const sortedServices = [...(servicesList || [])].sort((a,b) => (a.name || '').localeCompare(b.name || ''));
    if (walkInType === 'existing' && isNewPet && (!guestPetData.name || !guestPetData.breed || !guestPetData.gender || !guestPetData.species)) return setErrorMsg("New pet name, species, breed, and gender are required.");
    if (walkInType === 'guest' && (!guestName || !guestPhone || !guestPetData.name || !guestPetData.breed || !guestPetData.gender || !guestPetData.species)) return setErrorMsg("Owner Full Name, Phone, and all Pet Biometrics (Name, Species, Breed, Gender) are required.");
    if (!triageNotes) return setErrorMsg("Triage Notes are required.");
    if (selectedServices.length === 0) return setErrorMsg("Please select at least one service.");

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

        let finalOwnerId, finalOwnerName, finalOwnerPhone, finalPetId, finalPetName, finalPetSpecies;

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
          finalOwnerPhone = guestPhone || 'No Contact';
          
          // --- 🗓️ TEMPORAL ALIGNMENT ENGINE (CHRONOS) ---
          let finalDOB = null;
          let finalIsAgeExact = true;

          if (dobMode === 'exact') {
              finalDOB = guestPetData.dob ? Timestamp.fromDate(new Date(guestPetData.dob)) : null;
              finalIsAgeExact = true;
          } else if (dobMode === 'approximate') {
              const years = parseInt(estYears) || 0;
              const months = parseInt(estMonths) || 0;
              const d = new Date();
              d.setFullYear(d.getFullYear() - years);
              d.setMonth(d.getMonth() - months);
              d.setDate(1); // CLINICAL ANCHOR
              d.setHours(0, 0, 0, 0);
              finalDOB = Timestamp.fromDate(d);
              finalIsAgeExact = false;
          } else {
              finalDOB = null;
              finalIsAgeExact = false;
          }

          const petPayload = { 
              ...guestPetData,
              breed: guestPetData.breed === 'Mixed' ? 'Mixed Breed' : guestPetData.breed,
              microchip: guestPetData.microchip ? guestPetData.microchip.trim() : 'N/A'
          };
          const weightVal = parseFloat(petPayload.weight);
          delete petPayload.weight;
          
          const newPetRef = doc(collection(db, "pets"));
          transaction.set(newPetRef, { 
              ownerId: finalOwnerId, ...petPayload, 
              weight: weightVal > 0 ? weightVal : null,
              lastWeight: weightVal > 0 ? weightVal : null,
              dob: finalDOB,
              isAgeExact: finalIsAgeExact,
              createdAt: Timestamp.now(), status: 'active' 
          });
          finalPetId = newPetRef.id; finalPetName = guestPetData.name; finalPetSpecies = guestPetData.species;
        } else { // Existing Client
          finalOwnerId = selectedClient.id; 
          finalOwnerName = selectedClient.fullName || selectedClient.displayName || 'Existing Client';
          finalOwnerPhone = selectedClient.phone || 'No Contact';
          
          if (isNewPet) {
              // --- 🗓️ TEMPORAL ALIGNMENT ENGINE (CHRONOS) ---
              let mFinalDOB = null;
              let mFinalIsAgeExact = true;

              if (dobMode === 'exact') {
                  mFinalDOB = guestPetData.dob ? Timestamp.fromDate(new Date(guestPetData.dob)) : null;
                  mFinalIsAgeExact = true;
              } else if (dobMode === 'approximate') {
                  const years = parseInt(estYears) || 0;
                  const months = parseInt(estMonths) || 0;
                  const d = new Date();
                  d.setFullYear(d.getFullYear() - years);
                  d.setMonth(d.getMonth() - months);
                  d.setDate(1); // CLINICAL ANCHOR
                  d.setHours(0, 0, 0, 0);
                  mFinalDOB = Timestamp.fromDate(d);
                  mFinalIsAgeExact = false;
              } else {
                  mFinalDOB = null;
                  mFinalIsAgeExact = false;
              }

              const petPayload = { 
                  ...guestPetData,
                  breed: guestPetData.breed === 'Mixed' ? 'Mixed Breed' : guestPetData.breed,
                  microchip: guestPetData.microchip ? guestPetData.microchip.trim() : 'N/A'
              };
              const weightVal = parseFloat(petPayload.weight);
              delete petPayload.weight;
              
              const newPetRef = doc(collection(db, "pets"));
              transaction.set(newPetRef, { 
                  ownerId: finalOwnerId, ...petPayload,
                  weight: weightVal > 0 ? weightVal : null,
                  lastWeight: weightVal > 0 ? weightVal : null,
                  dob: mFinalDOB,
                  isAgeExact: mFinalIsAgeExact,
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

        // --- 🧬 MULTI-SERVICE MAPPING ENGINE ---
        const mappedServices = selectedServices.map(svcName => {
           const s = servicesList.find(item => item.name === svcName);
           const dept = s?.department || s?.category || 'General';
           return {
              id: s?.id || Math.random().toString(36).substr(2, 9),
              name: svcName,
              price: s?.price || 0,
              department: dept,
              status: 'pending', // Independent Status!
              workflowType: (dept === 'Grooming' || dept === 'Aesthetic') ? 'AESTHETIC' : 'MEDICAL',
              staffId: null,
              staffName: 'Unassigned'
           };
        });

        const isEmergency = selectedServices.includes('Emergency');
        const primaryDept = mappedServices[0]?.department || 'General';
        
        const rawBreed = (walkInType === 'guest' || isNewPet) ? guestPetData.breed : (guestPetData.breed || selectedPet?.breed || '');
        const resolvedBreed = rawBreed === 'Mixed' ? 'Mixed Breed' : (rawBreed || 'Mixed Breed');
        
        const resolvedGender = (walkInType === 'guest' || isNewPet) ? guestPetData.gender : (guestPetData.gender || selectedPet?.gender || 'Unknown');
        const resolvedColor = (walkInType === 'guest' || isNewPet) ? guestPetData.color : (guestPetData.color || selectedPet?.color || 'N/A');
        const resolvedIsNeutered = (walkInType === 'guest' || isNewPet) ? guestPetData.isNeutered : (guestPetData.isNeutered !== undefined ? guestPetData.isNeutered : (selectedPet?.isNeutered || false));
        
        // --- 🗓️ TEMPORAL ALIGNMENT ENGINE (CHRONOS) - APPOINTMENT SNAPSHOT ---
        let finalDOB = null;
        let finalIsAgeExact = true;

        if (walkInType === 'existing' && !isNewPet) {
            finalDOB = selectedPet?.dob || null;
            finalIsAgeExact = selectedPet?.isAgeExact !== false;
        } else {
            // Re-calculate for the appointment snapshot (redundant but safe for the closure)
            if (dobMode === 'exact') {
                finalDOB = guestPetData.dob ? Timestamp.fromDate(new Date(guestPetData.dob)) : null;
                finalIsAgeExact = true;
            } else if (dobMode === 'approximate') {
                const years = parseInt(estYears) || 0;
                const months = parseInt(estMonths) || 0;
                const d = new Date();
                d.setFullYear(d.getFullYear() - years);
                d.setMonth(d.getMonth() - months);
                d.setDate(1); // CLINICAL ANCHOR
                d.setHours(0, 0, 0, 0);
                finalDOB = Timestamp.fromDate(d);
                finalIsAgeExact = false;
            } else {
                finalDOB = null;
                finalIsAgeExact = false;
            }
        }

        const resolvedWeight = parseFloat(guestPetData.weight) || (selectedPet?.lastWeight ? parseFloat(selectedPet.lastWeight) : null);
        const resolvedAllergies = showAllergyInput && allergyArray.length > 0 ? allergyArray.join(', ') : 'None';

         const appointmentPayload = {
          ownerId: finalOwnerId, ownerName: finalOwnerName, petId: finalPetId, petName: finalPetName, petSpecies: finalPetSpecies,
          petBreed: resolvedBreed || 'Mixed Breed', 
          petGender: resolvedGender,
          petColor: resolvedColor,
           petIsNeutered: resolvedIsNeutered,
           petBirthdate: finalDOB,
           isAgeExact: finalIsAgeExact,
           petWeight: resolvedWeight || null, 
          petAllergies: resolvedAllergies,
          
          // Evolved Schema
          services: mappedServices, 
          primaryService: mappedServices[0]?.name || 'Unknown', 
          serviceCategory: primaryDept, // For legacy queue tabs
          
          status: 'arrived', // Overall context
          caseDay: 1, // THE INITIAL PULSE
          queueNumber: newNumber, ticketPrefix: isEmergency ? 'E' : 'W', priority: isEmergency ? 'high' : 'normal', 
          scheduledDate: Timestamp.now(), createdAt: Timestamp.now(), timeArrived: Timestamp.now(), 
          notes: isEmergency ? `🚨 EMERGENCY: ${triageNotes}` : triageNotes, 
          assignedVetId: null, assignedVet: 'Unassigned',
          clinicalPulse: [
            {
              eventId: `pulse_walkin_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              type: 'INCEPTION',
              toStatus: 'arrived',
              timestamp: Timestamp.now(),
              staffId: profile?.id || 'system_walkin', 
              staffName: staffSignature,
              note: `Physical Intake [WT: ${resolvedWeight || 'N/A'}kg]: ${isEmergency ? '🚨 URGENT ER ' : ''}${triageNotes}`
            }
          ]
        };

        const newApptRef = doc(collection(db, "appointments")); 
        transaction.set(newApptRef, appointmentPayload);
      });
      
      alert(`Patient successfully added to queue.`);
      handleClose();
    } catch (error) { 
      setErrorMsg("Error: " + error.message); 
    } finally { 
      setLoading(false); 
    }
  };


  const handleDiscardClick = () => {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      setTimeout(() => setConfirmDiscard(false), 3000);
    } else {
      handleClose();
    }
  };

  const handleQueueClick = () => {
     if (!confirmSubmit) {
        setConfirmSubmit(true);
        setTimeout(() => setConfirmSubmit(false), 3000);
     } else {
        handleSubmit();
     }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="md" 
      fullWidth
    >
      <DialogTitle sx={{ 
          bgcolor: '#5D4037', 
          color: 'white', 
          fontWeight: '1000', 
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          fontSize: '1.1rem',
          display: 'flex', 
          alignItems: 'center', 
          gap: 1.5,
          p: 2,
          borderBottom: '2px solid rgba(0,0,0,0.1)'
      }}>
        <DirectionsWalkIcon sx={{ fontSize: 24 }} /> Register Walk-In Patient
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 2, bgcolor: '#F5F5F5', minHeight: '520px', display: 'flex', flexDirection: 'column' }}>
        {errorMsg && <Alert severity="error" sx={{ mb: 2, fontWeight: '1000', borderRadius: 1, border: '2px solid #D32F2F', py: 0.5 }}>{errorMsg}</Alert>}
        
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <RadioGroup 
            row 
            value={walkInType} 
            onChange={(e) => {
              setWalkInType(e.target.value);
              setGuestName(''); setGuestPhone(''); setGuestEmail(''); setPhoneCheckDone(false);
              setGuestPetData({ name: '', species: 'Canine', breed: '', gender: 'Male', isNeutered: false, dob: '', color: '', microchip: '', petAllergies: '', weight: '' });
              setSelectedClient(null); setSelectedPet(null); setIsNewPet(false);
              setConfirmDiscard(false); setConfirmSubmit(false);
            }}
          >
            <FormControlLabel value="existing" control={<Radio size="small" sx={{ color: '#5D4037', '&.Mui-checked': { color: '#5D4037' } }} />} label={<Typography sx={{ fontWeight: '1000', fontSize: '0.8rem' }}>EXISTING CLIENT</Typography>} />
            <FormControlLabel value="guest" control={<Radio size="small" sx={{ color: '#5D4037', '&.Mui-checked': { color: '#5D4037' } }} />} label={<Typography sx={{ fontWeight: '1000', fontSize: '0.8rem' }}>GUEST / NEW CLIENT</Typography>} />
          </RadioGroup>
        </Box>

        {walkInType === 'existing' ? (
            <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 1, border: '1px solid #D7CCC8', bgcolor: '#FFF' }}>
              <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 1, fontSize: '0.65rem', display: 'block', mb: 1 }}>
                  IDENTITY RECONCILIATION
              </Typography>
              
                <Autocomplete
                    options={clients}
                    getOptionLabel={(option) => `${option.fullName?.toUpperCase()} (${option.phone || 'NO PHONE'})`}
                    value={selectedClient}
                    onChange={(e, v) => setSelectedClient(v)}
                    renderInput={(params) => (
                      <TextField 
                        {...params} 
                        size="small"
                        variant="outlined" 
                        label="SEARCH CLIENT DATABASE..." 
                        fullWidth 
                        inputProps={{ ...params.inputProps, style: { fontWeight: '1000', fontSize: '0.85rem' } }}
                        InputLabelProps={{ sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' } }}
                        sx={{ mb: 1.5 }} 
                      />
                    )}
                />
                
                {selectedClient && (
                    fetchingPets ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}><CircularProgress size={24} sx={{ color: '#5D4037' }} /></Box> : (
                      <Stack spacing={1.5}>
                        <FormControl fullWidth size="small" variant="outlined">
                            <InputLabel sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' }}>SELECT PET IDENTITY</InputLabel>
                            <Select 
                              value={selectedPet || ''} 
                              onChange={(e) => {setSelectedPet(e.target.value); setIsNewPet(false);}} 
                              disabled={isNewPet}
                              label="SELECT PET IDENTITY"
                              sx={{ fontWeight: '1000', fontSize: '0.85rem' }}
                            >
                                {clientPets.map(p => <MenuItem key={p.id} value={p} sx={{ fontWeight: '800', fontSize: '0.85rem' }}>{(p.species === 'Dog' || p.species === 'Canine') ? '🐶' : '🐱'} {p.name?.toUpperCase()}</MenuItem>)}
                            </Select>
                        </FormControl>
                        
                        <FormControlLabel 
                          control={<Switch size="small" checked={isNewPet} onChange={(e) => {setIsNewPet(e.target.checked); setSelectedPet(null); setGuestPetData({ name: '', species: 'Canine', breed: '', gender: 'Male', isNeutered: false, dob: '', color: '', microchip: '', petAllergies: '', weight: '' }); }} />} 
                          label={<Typography sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' }}>REGISTER NEW PET</Typography>} 
                        />
                        
                        {selectedPet && !isNewPet && (
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField 
                              label="ARRIVAL WEIGHT (KG)" 
                              size="small"
                              variant="outlined" 
                              type="number"
                              inputProps={{ step: '0.1', min: '0', style: { fontWeight: '1000', fontSize: '1rem', color: '#1B5E20' } }}
                              InputLabelProps={{ sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' } }}
                              value={guestPetData.weight} 
                              onChange={e => setGuestPetData({...guestPetData, weight: e.target.value})}
                              helperText={selectedPet.lastWeight ? `LAST WEIGHT: ${selectedPet.lastWeight} KG` : 'NO PREVIOUS WEIGHT'}
                              FormHelperTextProps={{ sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.7rem' } }}
                              fullWidth
                            />
                            <TextField 
                              label="COLOR / MARKINGS" 
                              size="small"
                              variant="outlined" 
                              sx={{ flex: 1.5 }}
                              inputProps={{ style: { fontWeight: '1000', fontSize: '0.85rem' } }}
                              InputLabelProps={{ sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' } }}
                              value={guestPetData.color || selectedPet.color || ''} 
                              onChange={e => setGuestPetData({...guestPetData, color: e.target.value})}
                              helperText="VERIFY IDENTITY"
                              FormHelperTextProps={{ sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.7rem' } }}
                            />
                          </Box>
                        )}
                      </Stack>
                    )
                )}
            </Paper>
        ) : null}

        {(walkInType === 'guest' || isNewPet) && (
            <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 1, border: '1px solid #D7CCC8', bgcolor: '#FFF' }}>
                <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 1, fontSize: '0.65rem', display: 'block', mb: 1.5 }}>
                    {walkInType === 'guest' ? 'GUEST & PATIENT GENOME' : 'NEW PATIENT DNA LOG'}
                </Typography>
                
                <Grid container spacing={2}>
                    {walkInType === 'guest' && (
                        <>
                           <Grid size={{ xs: 12, md: 5 }}><TextField size="small" label="OWNER FULL NAME" variant="outlined" fullWidth value={guestName} onChange={e => setGuestName(e.target.value)} InputLabelProps={{ sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' } }} inputProps={{ style: { fontWeight: '1000', fontSize: '0.85rem' } }} /></Grid> 
                           <Grid size={{ xs: 12, md: 4 }}><TextField size="small" label="CONTACT PHONE" variant="outlined" fullWidth value={guestPhone} onChange={e => { setGuestPhone(e.target.value); setPhoneCheckDone(false); }} helperText="MUST START WITH 09" FormHelperTextProps={{sx:{fontWeight:1000, fontSize:'0.7rem'}}} InputLabelProps={{ sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' } }} inputProps={{ style: { fontWeight: '1000', fontSize: '0.85rem' } }} /></Grid> 
                           <Grid size={{ xs: 12, md: 3 }}><TextField size="small" label="EMAIL (OPTIONAL)" variant="outlined" fullWidth value={guestEmail} onChange={e => setGuestEmail(e.target.value)} InputLabelProps={{ sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' } }} inputProps={{ style: { fontWeight: '1000', fontSize: '0.85rem' } }} /></Grid>
                           <Grid size={{ xs: 12 }}><Divider sx={{ my: 0.5, borderStyle: 'dashed' }} /></Grid>
                        </>
                    )}
                    <Grid size={{ xs: 12, md: 4 }}><TextField size="small" label="PET NAME" variant="outlined" fullWidth value={guestPetData.name} onChange={e => setGuestPetData({...guestPetData, name: e.target.value})} InputLabelProps={{ sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' } }} inputProps={{ style: { fontWeight: '1000', fontSize: '0.85rem' } }} /></Grid>
                    <Grid size={{ xs: 12, md: 2.5 }}>
                      <FormControl fullWidth size="small" variant="outlined">
                        <InputLabel sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' }}>SPECIES</InputLabel>
                        <Select label="SPECIES" value={guestPetData.species} onChange={e => setGuestPetData({...guestPetData, species: e.target.value})} sx={{ fontWeight: '1000', fontSize: '0.85rem' }}><MenuItem value="Canine" sx={{fontWeight:800, fontSize:'0.85rem'}}>CANINE 🐶</MenuItem><MenuItem value="Feline" sx={{fontWeight:800, fontSize:'0.85rem'}}>FELINE 🐱</MenuItem></Select>
                      </FormControl>
                    </Grid>
                    <Grid size={{ xs: 12, md: 2.5 }}><TextField size="small" label="WEIGHT (KG)" variant="outlined" fullWidth type="number" inputProps={{ step: '0.1', min: '0', style: { fontWeight: '1000', color: '#1B5E20', fontSize: '0.85rem' } }} InputLabelProps={{ sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' } }} value={guestPetData.weight} onChange={e => setGuestPetData({...guestPetData, weight: e.target.value})} /></Grid>
                    <Grid size={{ xs: 12, md: 3 }}><TextField size="small" label="BREED / LINEAGE" variant="outlined" fullWidth value={guestPetData.breed} onChange={e => setGuestPetData({...guestPetData, breed: e.target.value})} InputLabelProps={{ sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' } }} inputProps={{ style: { fontWeight: '1000', fontSize: '0.85rem' } }} /></Grid>
                    
                    <Grid size={{ xs: 12, md: 3 }}><TextField size="small" label="COLOR / MARKINGS" variant="outlined" fullWidth value={guestPetData.color} onChange={e => setGuestPetData({...guestPetData, color: e.target.value})} InputLabelProps={{ sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' } }} inputProps={{ style: { fontWeight: '1000', fontSize: '0.85rem' } }} /></Grid>
                    
                    <Grid size={{ xs: 12, md: 9 }}>
                        <Box sx={{ p: 1.5, border: '1px solid #D7CCC8', borderRadius: 1.5, bgcolor: '#FAFAFA' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
                                <CakeIcon sx={{ fontSize: 18, color: '#8B4513' }} />
                                <Typography sx={{ fontWeight: '1000', fontSize: '0.75rem', color: '#5D4037' }}>PROBABLE BIRTHDATE / AGE MODE</Typography>
                                <ToggleButtonGroup
                                    size="small"
                                    value={dobMode}
                                    exclusive
                                    onChange={(e, val) => val && setDobMode(val)}
                                    sx={{ ml: 'auto', height: 26 }}
                                >
                                    <ToggleButton value="exact" sx={{ fontSize: '0.65rem', fontWeight: 1000, px: 2 }}>EXACT</ToggleButton>
                                    <ToggleButton value="approximate" sx={{ fontSize: '0.65rem', fontWeight: 1000, px: 2 }}>ESTIMATE</ToggleButton>
                                    <ToggleButton value="unknown" sx={{ fontSize: '0.65rem', fontWeight: 1000, px: 2 }}>UNKNOWN</ToggleButton>
                                </ToggleButtonGroup>
                            </Box>

                            {dobMode === 'exact' && (
                                <TextField size="small" type="date" label="PET BIRTHDAY" variant="outlined" fullWidth InputLabelProps={{shrink:true, sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' }}} inputProps={{ style: { fontWeight: '1000', fontSize: '0.85rem' } }} value={guestPetData.dob} onChange={e => setGuestPetData({...guestPetData, dob: e.target.value})} />
                            )}
                            {dobMode === 'approximate' && (
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <TextField size="small" placeholder="YEARS" type="number" label="YEARS" fullWidth value={estYears} onChange={e => setEstYears(e.target.value)} InputLabelProps={{ sx: { fontWeight: '1000', fontSize: '0.75rem' } }} inputProps={{ style: { fontWeight: '1000' } }} />
                                    <TextField size="small" placeholder="MONTHS" type="number" label="MONTHS" fullWidth value={estMonths} onChange={e => setEstMonths(e.target.value)} InputLabelProps={{ sx: { fontWeight: '1000', fontSize: '0.75rem' } }} inputProps={{ style: { fontWeight: '1000' } }} />
                                </Box>
                            )}
                            {dobMode === 'unknown' && (
                                <Typography variant="caption" sx={{ color: '#8B4513', fontStyle: 'italic', fontWeight: '800' }}>Age will be determined by the veterinarian during the physical exam.</Typography>
                            )}
                        </Box>
                    </Grid>
                    <Grid size={{ xs: 12, md: 2.5 }}>
                      <FormControl fullWidth size="small" variant="outlined">
                        <InputLabel sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' }}>GENDER</InputLabel>
                        <Select label="GENDER" value={guestPetData.gender} onChange={e => setGuestPetData({...guestPetData, gender: e.target.value})} sx={{ fontWeight: '1000', fontSize: '0.85rem' }}><MenuItem value="Male" sx={{fontWeight:800, fontSize:'0.85rem'}}>MALE</MenuItem><MenuItem value="Female" sx={{fontWeight:800, fontSize:'0.85rem'}}>FEMALE</MenuItem></Select>
                      </FormControl>
                    </Grid>
                    <Grid size={{ xs: 12, md: 3.5 }}><TextField size="small" label="MICROCHIP ID" variant="outlined" fullWidth value={guestPetData.microchip} onChange={e => setGuestPetData({...guestPetData, microchip: e.target.value})} InputLabelProps={{ sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' } }} inputProps={{ style: { fontWeight: '1000', fontSize: '0.85rem' } }} /></Grid>
                    
                    
                    <Grid size={{ xs: 12 }}>
                        <Box sx={{ p: 2, borderRadius: 1.5, border: '1.2px solid', borderColor: showAllergyInput ? '#D32F2F' : '#E0E0E0', bgcolor: showAllergyInput ? 'rgba(211, 47, 47, 0.02)' : '#FAFAFA', transition: '0.2s all' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: showAllergyInput ? 1.5 : 0 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <WarningIcon sx={{ color: showAllergyInput ? '#D32F2F' : '#BDBDBD', fontSize: 20 }} />
                                    <Typography sx={{ fontWeight: '1000', fontSize: '0.85rem', color: showAllergyInput ? '#D32F2F' : '#757575' }}>
                                        RECORD MEDICAL ALLERGIES?
                                    </Typography>
                                </Box>
                                <Switch 
                                    size="small" 
                                    color="error" 
                                    checked={showAllergyInput} 
                                    onChange={(e) => {
                                        setShowAllergyInput(e.target.checked);
                                        if (!e.target.checked) setAllergyArray([]); // Reset on OFF
                                    }} 
                                />
                            </Box>

                            {showAllergyInput && (
                                <>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                                        {allergyArray.map((allergy, index) => (
                                            <Chip 
                                                key={index}
                                                label={allergy.toUpperCase()}
                                                onDelete={() => setAllergyArray(prev => prev.filter((_, i) => i !== index))}
                                                sx={{ bgcolor: '#D32F2F', color: 'white', fontWeight: '1000', fontSize: '0.7rem', borderRadius: '4px', '& .MuiChip-deleteIcon': { color: 'white!important', opacity: 0.8 } }}
                                            />
                                        ))}
                                        {allergyArray.length === 0 && (
                                            <Typography variant="caption" sx={{ color: '#D32F2F', fontStyle: 'italic', fontWeight: '800' }}>
                                                No allergens added yet...
                                            </Typography>
                                        )}
                                    </Box>
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <TextField 
                                            fullWidth 
                                            size="small" 
                                            placeholder="Type allergy (e.g. Peanuts, Chicken)" 
                                            value={currentAllergyInput}
                                            onChange={(e) => setCurrentAllergyInput(e.target.value)}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter' && currentAllergyInput.trim()) {
                                                    e.preventDefault();
                                                    setAllergyArray(prev => [...prev, currentAllergyInput.trim()]);
                                                    setCurrentAllergyInput('');
                                                }
                                            }}
                                            inputProps={{ style: { fontWeight: '900', fontSize: '0.85rem' } }}
                                        />
                                        <Button 
                                            variant="contained" 
                                            color="error" 
                                            disabled={!currentAllergyInput.trim()}
                                            onClick={() => {
                                                setAllergyArray(prev => [...prev, currentAllergyInput.trim()]);
                                                setCurrentAllergyInput('');
                                            }}
                                            sx={{ fontWeight: '1000', minWidth: 40 }}
                                        >
                                            +
                                        </Button>
                                    </Box>
                                </>
                            )}
                        </Box>
                    </Grid>
                    <Grid size={{ xs: 12 }}><FormControlLabel control={<Switch size="small" checked={guestPetData.isNeutered} onChange={e => setGuestPetData({...guestPetData, isNeutered: e.target.checked})} color="success"/>} label={<Typography sx={{ fontWeight: '1000', fontSize: '0.75rem', color: '#5D4037' }}>SPAYED / NEUTERED</Typography>} /></Grid>
                </Grid>
            </Paper>
        )}

        <Paper elevation={0} sx={{ p: 2, borderRadius: 1, border: '1px solid #D7CCC8', bgcolor: '#FFF' }}>
            <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 1, fontSize: '0.65rem', display: 'block', mb: 1.2 }}>
                VISIT LOGISTICS (TYPABLE / SEARCHABLE)
            </Typography>
            
            <Autocomplete
                multiple
                options={[...(servicesList || [])].sort((a,b) => (a.name || '').localeCompare(b.name || ''))}
                getOptionLabel={(option) => option.name?.toUpperCase() || ''}
                value={servicesList?.filter(s => selectedServices.includes(s.name)) || []}
                onChange={(e, newValue) => {
                    setSelectedServices(newValue.map(v => v.name));
                }}
                renderInput={(params) => (
                    <TextField 
                      {...params} 
                      size="small"
                      variant="outlined" 
                      label="SEARCH & SELECT BUNDLED SERVICES" 
                      InputLabelProps={{ sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' } }} 
                      inputProps={{ ...params.inputProps, style: { fontWeight: '1000', fontSize: '0.85rem' } }}
                    />
                )}
                renderOption={(props, option) => {
                    const { key, ...optionProps } = props;
                    const deptName = option.department || option.category || 'General';
                    const deptObj = (departments || []).find(d => d.name === deptName);
                    const badgeColor = deptObj ? deptObj.color : '#616161';
                    return (
                        <li key={key} {...optionProps} style={{ fontWeight: 800, fontSize: '0.85rem' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <CircleIcon sx={{ color: badgeColor, fontSize: 14 }} />
                                <Typography variant="caption" sx={{ fontWeight: 1000 }}>
                                    {option.name?.toUpperCase()} (₱{option.price?.toLocaleString()})
                                </Typography>
                            </Box>
                        </li>
                    );
                }}
                renderTags={(selected, getTagProps) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((option, index) => {
                            const { key, ...tagProps } = getTagProps({ index });
                            const deptName = option.department || option.category || 'General';
                            const deptObj = (departments || []).find(d => d.name === deptName);
                            const badgeColor = deptObj ? deptObj.color : '#616161';
                            return (
                                <Chip 
                                    key={key}
                                    {...tagProps}
                                    label={option.name?.toUpperCase()} 
                                    size="small" 
                                    sx={{ bgcolor: badgeColor, color: 'white', fontWeight: '1000', fontSize: '0.6rem', height: '20px', borderRadius: 0.5 }} 
                                />
                            );
                        })}
                    </Box>
                )}
                sx={{ mb: 1.5 }}
            />
            <TextField 
              label="TRIAGE NOTES / CHIEF COMPLAINT" 
              multiline 
              rows={2} 
              fullWidth 
              size="small"
              variant="outlined" 
              value={triageNotes} 
              onChange={e => setTriageNotes(e.target.value)} 
              InputLabelProps={{ sx: { fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' } }} 
              inputProps={{ style: { fontWeight: '1000', fontSize: '0.85rem' } }}
            />
        </Paper>
      </DialogContent>
      
      <DialogActions sx={{ p: 2, bgcolor: '#FFF', borderTop: '1px solid #D7CCC8', display: 'flex', justifyContent: 'space-between' }}>
        <Button 
          onClick={handleDiscardClick} 
          variant={confirmDiscard ? "contained" : "text"}
          sx={{ 
            fontWeight: '1000', 
            color: confirmDiscard ? 'white' : '#9E9E9E', 
            letterSpacing: 1, 
            fontSize: '0.75rem',
            bgcolor: confirmDiscard ? '#D32F2F' : 'transparent',
            '&:hover': { bgcolor: confirmDiscard ? '#B71C1C' : 'rgba(0,0,0,0.04)' }
          }}
        >
          {confirmDiscard ? "⚠️ CONFIRM DISCARD?" : "DISCARD REGISTRATION"}
        </Button>
        <Button 
          onClick={handleQueueClick} 
          variant="contained" 
          disabled={loading} 
          sx={{ 
            px: 4, 
            py: 1,
            fontWeight: '1000', 
            bgcolor: confirmSubmit ? '#E65100' : (selectedServices?.includes('Emergency') ? '#D32F2F' : '#5D4037'),
            borderRadius: 1,
            letterSpacing: 1.2,
            fontSize: '0.85rem',
            '&:hover': { bgcolor: confirmSubmit ? '#BF360C' : (selectedServices?.includes('Emergency') ? '#B71C1C' : '#3E2723') },
            boxShadow: '0 4px 12px rgba(93, 64, 55, 0.2)'
          }}
        >
          {loading ? "PROCESSING..." : (confirmSubmit ? "⚠️ CLICK TO CONFIRM ENTRY" : "OFFICIALLY ADD TO QUEUE")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}