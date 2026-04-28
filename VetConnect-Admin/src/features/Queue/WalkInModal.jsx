import React, { useState, useEffect } from 'react';
import { resolveTieredPrice } from '../../utils/resolveTieredPrice';
import { normalizePhone } from '../../utils/phoneValidation';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Box, Typography,
  FormControl, InputLabel, Select, RadioGroup, FormControlLabel, Radio,
  Autocomplete, Alert, CircularProgress, Paper, Divider, Switch, Chip, Stack,
  ToggleButton, ToggleButtonGroup, Checkbox, List, ListItem, ListItemButton,
  ListItemText, ListItemAvatar, Avatar, Collapse, IconButton
} from '@mui/material';
import Grid from '@mui/material/Grid';

// Icons
import WarningIcon from '@mui/icons-material/Warning';
import CircleIcon from '@mui/icons-material/Circle';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import CakeIcon from '@mui/icons-material/Cake';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PetsIcon from '@mui/icons-material/Pets';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import { collection, doc, runTransaction, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { makePulseEventId } from '../../utils/pulseUtils';
import { db } from '../../firebaseConfig';
import { useUser } from '../../context/UserContext';
import { detectNoShows } from '../../utils/noShowDetection';
import { useClinicSettings } from '../../hooks/useClinicSettings';
import { sendPushNotification } from '../../utils/sendPushNotification';

// --- BLANK PET TEMPLATE ---
const BLANK_PET_DATA = () => ({
  name: '', species: 'Canine', breed: '', gender: 'Male',
  isNeutered: false, dob: '', color: '', microchip: '', petAllergies: '', weight: '',
  dobMode: 'exact', estYears: '', estMonths: '',
  showAllergyInput: false, allergyArray: [], currentAllergyInput: '',
  selectedServices: [], triageNotes: '',
  // For existing client flow: which existing pet is selected, or isNewPet flag
  selectedPet: null, isNewPet: false,
  expanded: true,
});

export default function WalkInModal({ open, onClose, servicesList, departments, prefillClient, prefillPet }) {
  const { profile } = useUser();
  const staffSignature = profile?.fullName || 'System/Admin';
  const clinicSettings = useClinicSettings();
  const noShowWindowDays = clinicSettings.noShowLinkWindowDays || 30;

  const [loading, setLoading] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [walkInType, setWalkInType] = useState('existing');

  // --- EXISTING CLIENT STATES ---
  const [clients, setClients] = useState([]);
  const[selectedClient, setSelectedClient] = useState(null);
  const [clientPets, setClientPets] = useState([]);
  const [fetchingPets, setFetchingPets] = useState(false);

  // --- GUEST CLIENT STATES ---
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  // --- MULTI-PET ENTRIES ---
  // Each entry represents one pet being registered in this walk-in.
  // Single-pet walk-ins use petEntries[0] only (no visitGroupId).
  const [petEntries, setPetEntries] = useState([BLANK_PET_DATA()]);

  const [errorMsg, setErrorMsg] = useState('');

  // No-show detection map: { petId -> noShowInfo }
  const [noShowMap, setNoShowMap] = useState({});
  
  // --- PH PHONE VALIDATION ENGINE ---
  const isValidPHPhone = (number) => /^09\d{9}$/.test(number.trim());

  useEffect(() => {
    if (open && clients.length === 0) {
      const fetchClients = async () => {
        try {
          const q = query(collection(db, "users"), where("role", "==", "pet_owner"));
          const snap = await getDocs(q);
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
          setClients(list);
        } catch (e) { console.error(e); }
      };
      fetchClients();
    }
  }, [open, clients]);

  // Prefill from Patients CRM (T2.115)
  useEffect(() => {
    if (!open || !prefillClient) return;
    setWalkInType('existing');
    setSelectedClient(prefillClient);
  }, [open, prefillClient]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedClient) {
      const fetchPets = async () => {
        setFetchingPets(true);
        setPetEntries([BLANK_PET_DATA()]);
        try {
          const q = query(collection(db, "pets"), where("ownerId", "==", selectedClient.id));
          const snap = await getDocs(q);
          const petList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setClientPets(petList);
        } catch (e) { console.error(e); }
        setFetchingPets(false);
      };
      fetchPets();
    } else {
      setClientPets([]);
      setPetEntries([BLANK_PET_DATA()]);
    }
  }, [selectedClient]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill first pet entry when prefillPet is provided
  useEffect(() => {
    if (!prefillPet || clientPets.length === 0) return;
    const matched = clientPets.find(p => p.id === prefillPet.id);
    if (matched) {
      setPetEntries(prev => {
        const updated = [...prev];
        updated[0] = { ...updated[0], selectedPet: matched, isNewPet: false };
        return updated;
      });
    }
  }, [prefillPet, clientPets]);

  // No-show detection: fire for any selected existing pets across all entries
  useEffect(() => {
    const petIds = petEntries
      .map(e => e.selectedPet?.id)
      .filter(Boolean);
    if (petIds.length === 0) {
      setNoShowMap({});
      return;
    }
    let cancelled = false;
    Promise.all(petIds.map(pid =>
      detectNoShows([pid], noShowWindowDays).then(r => ({ pid, result: r }))
    )).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach(({ pid, result }) => {
        if (result.count > 0) map[pid] = result;
      });
      setNoShowMap(map);
    }).catch(() => {
      if (!cancelled) setNoShowMap({});
    });
    return () => { cancelled = true; };
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    petEntries.map(e => e.selectedPet?.id).join(','),
    noShowWindowDays,
  ]);

  // --- PET ENTRY HELPERS ---
  const updateEntry = (index, patch) => {
    setPetEntries(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...patch };
      return updated;
    });
  };

  const addPetEntry = () => {
    setPetEntries(prev => [...prev, BLANK_PET_DATA()]);
  };

  const removePetEntry = (index) => {
    setPetEntries(prev => prev.filter((_, i) => i !== index));
  };

  const toggleEntryExpand = (index) => {
    updateEntry(index, { expanded: !petEntries[index].expanded });
  };

  const handleClose = () => {
    setErrorMsg('');
    setWalkInType('existing');
    setSelectedClient(null);
    setGuestName('');
    setGuestPhone('');
    setGuestEmail('');
    setPetEntries([BLANK_PET_DATA()]);
    setNoShowMap({});
    setConfirmDiscard(false);
    setConfirmSubmit(false);
    onClose();
  };

  // --- DOB RESOLVER: Converts a pet entry's DOB mode fields into a Timestamp + exactness flag ---
  const resolveDob = (entry) => {
    if (entry.dobMode === 'exact') {
      return {
        finalDOB: entry.dob ? Timestamp.fromDate(new Date(entry.dob)) : null,
        finalIsAgeExact: true,
      };
    }
    if (entry.dobMode === 'approximate') {
      const years = parseInt(entry.estYears) || 0;
      const months = parseInt(entry.estMonths) || 0;
      const d = new Date();
      d.setFullYear(d.getFullYear() - years);
      d.setMonth(d.getMonth() - months);
      d.setDate(1); // CLINICAL ANCHOR
      d.setHours(0, 0, 0, 0);
      return { finalDOB: Timestamp.fromDate(d), finalIsAgeExact: false };
    }
    return { finalDOB: null, finalIsAgeExact: false };
  };

  // --- APPOINTMENT PAYLOAD BUILDER: Pure function, no side effects ---
  const buildAppointmentPayload = ({
    ownerId, ownerName, petId, petName, petSpecies, petBreed, petGender, petColor,
    petIsNeutered, petBirthdate, isAgeExact, petWeight, petAllergies,
    mappedServices, triageNotes, isEmergency, queueNumber, noShowData,
    visitGroupId, groupSize, groupIndex,
  }) => {
    const primaryDept = mappedServices[0]?.department || 'General';
    const resolvedWeight = petWeight || null;
    return {
      ownerId, ownerName, petId, petName, petSpecies,
      petBreed: petBreed || 'Mixed Breed',
      petGender,
      petColor,
      petIsNeutered,
      petBirthdate,
      isAgeExact,
      petWeight: resolvedWeight,
      petAllergies,
      services: mappedServices,
      primaryService: mappedServices[0]?.name || 'Unknown',
      serviceCategory: primaryDept,
      status: 'arrived',
      caseDay: 1,
      queueNumber,
      ticketPrefix: isEmergency ? 'E' : 'W',
      priority: isEmergency ? 'high' : 'normal',
      scheduledDate: Timestamp.now(),
      createdAt: Timestamp.now(),
      timeArrived: Timestamp.now(),
      staffNotes: triageNotes,
      systemChips: [
        ...(isEmergency ? ['EMERGENCY'] : []),
        ...(noShowData?.count > 0 ? [`NO-SHOW-HISTORY:${noShowData.count}`] : []),
        ...(visitGroupId ? [`GROUP-BOOKING:${groupIndex + 1}/${groupSize}`] : []),
      ],
      assignedVetId: null,
      assignedVet: 'Unassigned',
      // visitGroupId fields — only present for multi-pet walk-ins
      ...(visitGroupId ? { visitGroupId, groupSize, groupIndex } : {}),
      ...(noShowData?.count > 0 ? {
        rebookedFromId: noShowData.mostRecent?.id || null,
        noShowCount: noShowData.count,
      } : {}),
      clinicalPulse: [
        {
          eventId: makePulseEventId('walkin'),
          type: 'INCEPTION',
          toStatus: 'arrived',
          timestamp: Timestamp.now(),
          staffId: profile?.id || 'system_walkin',
          staffName: staffSignature,
          note: `Physical Intake [WT: ${resolvedWeight || 'N/A'}kg]:${isEmergency ? ' URGENT ER' : ''} ${triageNotes}${visitGroupId ? ` [Group ${groupIndex + 1}/${groupSize}]` : ''}`,
        },
      ],
    };
  };

  const handleSubmit = async () => {
    setErrorMsg('');

    // --- VALIDATION ---
    if (walkInType === 'guest') {
      if (!guestName || !guestPhone) return setErrorMsg("Owner Full Name and Phone are required.");
      if (!isValidPHPhone(guestPhone)) return setErrorMsg("Contact Phone must be a valid Philippine number starting with 09 (e.g., 09123456789).");
    } else {
      if (!selectedClient) return setErrorMsg("Please select an existing client.");
    }

    for (let i = 0; i < petEntries.length; i++) {
      const entry = petEntries[i];
      const label = petEntries.length > 1 ? ` (Pet ${i + 1})` : '';
      const isNew = walkInType === 'guest' || entry.isNewPet;
      if (walkInType === 'existing' && !entry.selectedPet && !entry.isNewPet) {
        return setErrorMsg(`Pet ${i + 1}: Please select a pet or choose Register New Pet.`);
      }
      if (isNew && (!entry.name || !entry.breed || !entry.gender || !entry.species)) {
        return setErrorMsg(`Pet biometrics (Name, Species, Breed, Gender) are required${label}.`);
      }
      if (!entry.triageNotes) return setErrorMsg(`Triage Notes are required${label}.`);
      if (entry.selectedServices.length === 0) return setErrorMsg(`Please select at least one service${label}.`);
    }

    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        // ALL READS FIRST (Firestore transaction requirement)
        const queueRef = doc(db, "queue", "daily_queue");
        const queueDoc = await transaction.get(queueRef);
        // ONE queue number for the entire group (shared ticket — Option C)
        const sharedNumber = queueDoc.exists() ? (queueDoc.data().lastNumberIssued || 0) + 1 : 1;

        let finalOwnerId, finalOwnerName, finalOwnerPhone;

        if (walkInType === 'guest') {
          const phoneKey = `GUEST_PH_${guestPhone.trim()}`;
          const newUserRef = doc(db, "users", phoneKey);
          const existingUserDoc = await transaction.get(newUserRef);
          if (existingUserDoc.exists()) {
            const existingData = existingUserDoc.data();
            const existingName = existingData.fullName || existingData.displayName || 'Unknown';
            throw new Error(
              `A client with phone ${guestPhone.trim()} already exists: '${existingName}'. Use Existing Client mode.`
            );
          }
          transaction.set(newUserRef, {
            fullName: guestName || 'Guest Client',
            displayName: guestName || 'Guest Client',
            name: guestName || 'Guest Client',
            phone: normalizePhone(guestPhone) || guestPhone,
            email: guestEmail || null,
            role: 'pet_owner',
            accountStatus: 'unclaimed_guest',
            createdAt: Timestamp.now(),
          });
          finalOwnerId = newUserRef.id;
          finalOwnerName = guestName || 'Guest Client';
          finalOwnerPhone = normalizePhone(guestPhone) || guestPhone || 'No Contact';
        } else {
          finalOwnerId = selectedClient.id;
          finalOwnerName = selectedClient.fullName || selectedClient.displayName || 'Existing Client';
          finalOwnerPhone = selectedClient.phone || 'No Contact';
        }

        // Determine visitGroupId: only set for multi-pet walk-ins
        const isMultiPet = petEntries.length > 1;
        const visitGroupId = isMultiPet
          ? `VG-${finalOwnerId.slice(0, 5)}-${Date.now()}`
          : null;

        // Increment the queue counter once (shared number)
        transaction.set(queueRef, { lastNumberIssued: sharedNumber }, { merge: true });

        // Create appointment for each pet entry
        for (let i = 0; i < petEntries.length; i++) {
          const entry = petEntries[i];
          const isNew = walkInType === 'guest' || entry.isNewPet;

          let petId, petName, petSpecies, petBreed, petGender, petColor, petIsNeutered, petBirthdate, isAgeExact, petWeight, petAllergies;

          if (isNew) {
            const { finalDOB, finalIsAgeExact } = resolveDob(entry);
            const resolvedAllergies = entry.showAllergyInput && entry.allergyArray.length > 0
              ? entry.allergyArray.join(', ')
              : 'None';
            const petPayload = {
              ownerId: finalOwnerId,
              name: entry.name,
              species: entry.species,
              breed: entry.breed === 'Mixed' ? 'Mixed Breed' : (entry.breed || 'Mixed Breed'),
              gender: entry.gender,
              isNeutered: entry.isNeutered || false,
              color: entry.color || '',
              microchip: entry.microchip ? entry.microchip.trim() : 'N/A',
              petAllergies: resolvedAllergies,
              dob: finalDOB,
              isAgeExact: finalIsAgeExact,
              createdAt: Timestamp.now(),
              status: 'active',
            };
            const weightVal = parseFloat(entry.weight);
            if (weightVal > 0) {
              petPayload.weight = weightVal;
              petPayload.lastWeight = weightVal;
            }
            const newPetRef = doc(collection(db, "pets"));
            transaction.set(newPetRef, petPayload);

            petId = newPetRef.id;
            petName = entry.name;
            petSpecies = entry.species;
            petBreed = petPayload.breed;
            petGender = entry.gender;
            petColor = entry.color || '';
            petIsNeutered = entry.isNeutered || false;
            petBirthdate = finalDOB;
            isAgeExact = finalIsAgeExact;
            petWeight = weightVal > 0 ? weightVal : null;
            petAllergies = resolvedAllergies;
          } else {
            const pet = entry.selectedPet;
            const arrivalWeight = parseFloat(entry.weight);
            if (arrivalWeight > 0) {
              transaction.update(doc(db, 'pets', pet.id), { lastWeight: arrivalWeight });
            }
            petId = pet.id;
            petName = pet.name;
            petSpecies = pet.species;
            petBreed = pet.breed || 'Mixed Breed';
            petGender = pet.gender || 'Unknown';
            petColor = pet.color || 'N/A';
            petIsNeutered = pet.isNeutered || false;
            petBirthdate = pet.dob || null;
            isAgeExact = pet.isAgeExact !== false;
            petWeight = arrivalWeight > 0 ? arrivalWeight : (pet.lastWeight ? parseFloat(pet.lastWeight) : null);
            petAllergies = pet.petAllergies || 'None';
          }

          // Map services
          const mappedServices = entry.selectedServices.map(svcName => {
            const s = servicesList.find(item => item.name === svcName);
            const dept = s?.department || s?.category || 'General';
            return {
              id: s?.id || Math.random().toString(36).substr(2, 9),
              name: svcName,
              price: resolveTieredPrice(s, petWeight),
              department: dept,
              status: 'pending',
              staffId: null,
              staffName: 'Unassigned',
            };
          });

          const isEmergency = entry.selectedServices.some(
            svcName => servicesList.find(s => s.name === svcName)?.isEmergency
          );

          const noShowData = noShowMap[petId] || null;

          const appointmentPayload = buildAppointmentPayload({
            ownerId: finalOwnerId,
            ownerName: finalOwnerName,
            petId,
            petName,
            petSpecies,
            petBreed,
            petGender,
            petColor,
            petIsNeutered,
            petBirthdate,
            isAgeExact,
            petWeight,
            petAllergies,
            mappedServices,
            triageNotes: entry.triageNotes,
            isEmergency,
            queueNumber: sharedNumber,
            noShowData,
            visitGroupId,
            groupSize: petEntries.length,
            groupIndex: i,
          });

          const newApptRef = doc(collection(db, "appointments"));
          transaction.set(newApptRef, appointmentPayload);
        }
      });

      // T4.90: Push notification — walk-in arrived (existing clients only; guests no-op via guard)
      petEntries.forEach((entry) => {
        const resolvedOwnerId = walkInType === 'guest' ? null : selectedClient?.id;
        if (resolvedOwnerId) {
          sendPushNotification({
            ownerId: resolvedOwnerId,
            status: 'arrived',
            petName: entry.isNewPet || walkInType === 'guest' ? entry.name : entry.selectedPet?.name,
          });
        }
      });

      const count = petEntries.length;
      alert(count > 1
        ? `${count} patients successfully added to queue with shared ticket.`
        : `Patient successfully added to queue.`
      );
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

  // --- PET ENTRY FORM: Renders the per-pet section (existing select or new pet genome) ---
  const renderPetEntryForm = (entry, index) => {
    const isNew = walkInType === 'guest' || entry.isNewPet;
    const noShowData = noShowMap[entry.selectedPet?.id];
    const isMultiPet = petEntries.length > 1;

    return (
      <Paper
        key={index}
        elevation={0}
        sx={{
          mb: 2,
          border: isMultiPet ? '2px solid #5D4037' : '1px solid #D7CCC8',
          borderRadius: 0,
          bgcolor: '#FFF',
          overflow: 'hidden',
        }}
      >
        {/* Card header — only shown for multi-pet entries */}
        {isMultiPet && (
          <Box
            sx={{
              bgcolor: '#5D4037',
              px: 2,
              py: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PetsIcon sx={{ color: 'white', fontSize: 18 }} />
              <Typography sx={{ fontWeight: 900, color: 'white', fontSize: '0.8rem', letterSpacing: 1 }}>
                PET {index + 1} OF {petEntries.length}
              </Typography>
              {entry.selectedPet && (
                <Chip
                  label={entry.selectedPet.name?.toUpperCase()}
                  size="small"
                  sx={{ bgcolor: '#FFF8E1', color: '#5D4037', fontWeight: 900, fontSize: '0.65rem', borderRadius: 0 }}
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <IconButton size="small" onClick={() => toggleEntryExpand(index)} sx={{ color: 'white' }}>
                {entry.expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
              {index > 0 && (
                <IconButton
                  size="small"
                  onClick={() => removePetEntry(index)}
                  sx={{ color: '#FFCDD2', '&:hover': { color: '#F44336' } }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          </Box>
        )}

        <Collapse in={entry.expanded !== false} timeout="auto">
          <Box sx={{ p: 2 }}>
            {/* Existing client pet selection */}
            {walkInType === 'existing' && (
              <Stack spacing={1.5} sx={{ mb: 1.5 }}>
                {fetchingPets ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                    <CircularProgress size={24} sx={{ color: '#5D4037' }} />
                  </Box>
                ) : selectedClient ? (
                  <>
                    <FormControl fullWidth size="small" variant="outlined">
                      <InputLabel sx={{ fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' }}>SELECT PET IDENTITY</InputLabel>
                      <Select
                        value={entry.selectedPet || ''}
                        onChange={(e) => updateEntry(index, { selectedPet: e.target.value, isNewPet: false })}
                        disabled={entry.isNewPet}
                        label="SELECT PET IDENTITY"
                        sx={{ fontWeight: 900, fontSize: '0.85rem', borderRadius: 0 }}
                      >
                        {clientPets
                          .filter(p => {
                            // Prevent duplicate pet selection across entries
                            const selectedElsewhere = petEntries
                              .filter((_, i) => i !== index)
                              .map(e => e.selectedPet?.id)
                              .filter(Boolean);
                            return !selectedElsewhere.includes(p.id);
                          })
                          .map(p => (
                            <MenuItem key={p.id} value={p} sx={{ fontWeight: 800, fontSize: '0.85rem' }}>
                              {(p.species === 'Dog' || p.species === 'Canine') ? 'DOG' : 'CAT'} — {p.name?.toUpperCase()}
                            </MenuItem>
                          ))}
                      </Select>
                    </FormControl>

                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={entry.isNewPet}
                          onChange={(e) => updateEntry(index, { isNewPet: e.target.checked, selectedPet: null })}
                        />
                      }
                      label={<Typography sx={{ fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' }}>REGISTER NEW PET</Typography>}
                    />

                    {entry.selectedPet && !entry.isNewPet && (
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                          label="ARRIVAL WEIGHT (KG)"
                          size="small"
                          variant="outlined"
                          type="number"
                          inputProps={{ step: '0.1', min: '0', style: { fontWeight: 900, fontSize: '1rem', color: '#1B5E20' } }}
                          InputLabelProps={{ sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' } }}
                          value={entry.weight}
                          onChange={e => updateEntry(index, { weight: e.target.value })}
                          helperText={entry.selectedPet.lastWeight ? `LAST WEIGHT: ${entry.selectedPet.lastWeight} KG` : 'NO PREVIOUS WEIGHT'}
                          FormHelperTextProps={{ sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.7rem' } }}
                          fullWidth
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                        />
                        <TextField
                          label="COLOR / MARKINGS"
                          size="small"
                          variant="outlined"
                          sx={{ flex: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                          inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                          InputLabelProps={{ sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' } }}
                          value={entry.color || entry.selectedPet.color || ''}
                          onChange={e => updateEntry(index, { color: e.target.value })}
                          helperText="VERIFY IDENTITY"
                          FormHelperTextProps={{ sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.7rem' } }}
                        />
                      </Box>
                    )}
                  </>
                ) : null}
              </Stack>
            )}

            {/* No-show warning for this pet */}
            {noShowData && noShowData.count > 0 && (
              <Alert
                severity="warning"
                icon={<WarningIcon fontSize="small" />}
                sx={{ mb: 1.5, fontWeight: 900, borderRadius: 0, border: '2px solid #F57C00', py: 0.5, fontSize: '0.8rem' }}
              >
                <Typography sx={{ fontWeight: 900, fontSize: '0.8rem' }}>
                  NO-SHOW HISTORY: {noShowData.count} no-show{noShowData.count > 1 ? 's' : ''} in the last {noShowWindowDays} days.
                </Typography>
              </Alert>
            )}

            {/* New pet genome form */}
            {isNew && (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="overline" sx={{ fontWeight: 900, color: '#5D4037', letterSpacing: 1, fontSize: '0.65rem', display: 'block', mb: 1.5 }}>
                  {walkInType === 'guest' ? 'GUEST PATIENT GENOME' : 'NEW PATIENT DNA LOG'}
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField size="small" label="PET NAME" variant="outlined" fullWidth
                      value={entry.name}
                      onChange={e => updateEntry(index, { name: e.target.value })}
                      InputLabelProps={{ sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' } }}
                      inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 2.5 }}>
                    <FormControl fullWidth size="small" variant="outlined">
                      <InputLabel sx={{ fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' }}>SPECIES</InputLabel>
                      <Select label="SPECIES" value={entry.species}
                        onChange={e => updateEntry(index, { species: e.target.value })}
                        sx={{ fontWeight: 900, fontSize: '0.85rem', borderRadius: 0 }}>
                        <MenuItem value="Canine" sx={{ fontWeight: 800, fontSize: '0.85rem' }}>CANINE</MenuItem>
                        <MenuItem value="Feline" sx={{ fontWeight: 800, fontSize: '0.85rem' }}>FELINE</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, md: 2.5 }}>
                    <TextField size="small" label="WEIGHT (KG)" variant="outlined" fullWidth type="number"
                      inputProps={{ step: '0.1', min: '0', style: { fontWeight: 900, color: '#1B5E20', fontSize: '0.85rem' } }}
                      InputLabelProps={{ sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' } }}
                      value={entry.weight}
                      onChange={e => updateEntry(index, { weight: e.target.value })}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField size="small" label="BREED / LINEAGE" variant="outlined" fullWidth
                      value={entry.breed}
                      onChange={e => updateEntry(index, { breed: e.target.value })}
                      InputLabelProps={{ sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' } }}
                      inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField size="small" label="COLOR / MARKINGS" variant="outlined" fullWidth
                      value={entry.color}
                      onChange={e => updateEntry(index, { color: e.target.value })}
                      InputLabelProps={{ sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' } }}
                      inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 9 }}>
                    <Box sx={{ p: 1.5, border: '1px solid #D7CCC8', bgcolor: '#FAFAFA' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
                        <CakeIcon sx={{ fontSize: 18, color: '#8B4513' }} />
                        <Typography sx={{ fontWeight: 900, fontSize: '0.75rem', color: '#5D4037' }}>BIRTHDATE / AGE MODE</Typography>
                        <ToggleButtonGroup
                          size="small"
                          value={entry.dobMode}
                          exclusive
                          onChange={(_, val) => val && updateEntry(index, { dobMode: val })}
                          sx={{ ml: 'auto', height: 26 }}
                        >
                          <ToggleButton value="exact" sx={{ fontSize: '0.65rem', fontWeight: 900, px: 2, borderRadius: 0 }}>EXACT</ToggleButton>
                          <ToggleButton value="approximate" sx={{ fontSize: '0.65rem', fontWeight: 900, px: 2, borderRadius: 0 }}>ESTIMATE</ToggleButton>
                          <ToggleButton value="unknown" sx={{ fontSize: '0.65rem', fontWeight: 900, px: 2, borderRadius: 0 }}>UNKNOWN</ToggleButton>
                        </ToggleButtonGroup>
                      </Box>
                      {entry.dobMode === 'exact' && (
                        <TextField size="small" type="date" label="PET BIRTHDAY" variant="outlined" fullWidth
                          InputLabelProps={{ shrink: true, sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' } }}
                          inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                          value={entry.dob}
                          onChange={e => updateEntry(index, { dob: e.target.value })}
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                        />
                      )}
                      {entry.dobMode === 'approximate' && (
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <TextField size="small" label="YEARS" type="number" fullWidth
                            value={entry.estYears}
                            onChange={e => updateEntry(index, { estYears: e.target.value })}
                            InputLabelProps={{ sx: { fontWeight: 900, fontSize: '0.75rem' } }}
                            inputProps={{ style: { fontWeight: 900 } }}
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                          />
                          <TextField size="small" label="MONTHS" type="number" fullWidth
                            value={entry.estMonths}
                            onChange={e => updateEntry(index, { estMonths: e.target.value })}
                            InputLabelProps={{ sx: { fontWeight: 900, fontSize: '0.75rem' } }}
                            inputProps={{ style: { fontWeight: 900 } }}
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                          />
                        </Box>
                      )}
                      {entry.dobMode === 'unknown' && (
                        <Typography variant="caption" sx={{ color: '#8B4513', fontStyle: 'italic', fontWeight: 800 }}>
                          Age will be determined by the veterinarian during the physical exam.
                        </Typography>
                      )}
                    </Box>
                  </Grid>
                  <Grid size={{ xs: 12, md: 2.5 }}>
                    <FormControl fullWidth size="small" variant="outlined">
                      <InputLabel sx={{ fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' }}>GENDER</InputLabel>
                      <Select label="GENDER" value={entry.gender}
                        onChange={e => updateEntry(index, { gender: e.target.value })}
                        sx={{ fontWeight: 900, fontSize: '0.85rem', borderRadius: 0 }}>
                        <MenuItem value="Male" sx={{ fontWeight: 800, fontSize: '0.85rem' }}>MALE</MenuItem>
                        <MenuItem value="Female" sx={{ fontWeight: 800, fontSize: '0.85rem' }}>FEMALE</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, md: 3.5 }}>
                    <TextField size="small" label="MICROCHIP ID" variant="outlined" fullWidth
                      value={entry.microchip}
                      onChange={e => updateEntry(index, { microchip: e.target.value })}
                      InputLabelProps={{ sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' } }}
                      inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <Box sx={{ p: 1.5, border: '1.2px solid', borderColor: entry.showAllergyInput ? '#D32F2F' : '#E0E0E0', bgcolor: '#FAFAFA' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: entry.showAllergyInput ? 1.5 : 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <WarningIcon sx={{ color: entry.showAllergyInput ? '#D32F2F' : '#BDBDBD', fontSize: 20 }} />
                          <Typography sx={{ fontWeight: 900, fontSize: '0.85rem', color: entry.showAllergyInput ? '#D32F2F' : '#757575' }}>
                            RECORD MEDICAL ALLERGIES?
                          </Typography>
                        </Box>
                        <Switch size="small" color="error" checked={entry.showAllergyInput}
                          onChange={e => updateEntry(index, { showAllergyInput: e.target.checked, allergyArray: e.target.checked ? entry.allergyArray : [] })}
                        />
                      </Box>
                      {entry.showAllergyInput && (
                        <>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                            {entry.allergyArray.map((allergy, ai) => (
                              <Chip key={ai} label={allergy.toUpperCase()}
                                onDelete={() => updateEntry(index, { allergyArray: entry.allergyArray.filter((_, i) => i !== ai) })}
                                sx={{ bgcolor: '#D32F2F', color: 'white', fontWeight: 900, fontSize: '0.7rem', borderRadius: 0, '& .MuiChip-deleteIcon': { color: 'white!important', opacity: 0.8 } }}
                              />
                            ))}
                            {entry.allergyArray.length === 0 && (
                              <Typography variant="caption" sx={{ color: '#D32F2F', fontStyle: 'italic', fontWeight: 800 }}>No allergens added yet...</Typography>
                            )}
                          </Box>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField fullWidth size="small" placeholder="Type allergy (e.g. Peanuts, Chicken)"
                              value={entry.currentAllergyInput}
                              onChange={e => updateEntry(index, { currentAllergyInput: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && entry.currentAllergyInput.trim()) {
                                  e.preventDefault();
                                  updateEntry(index, {
                                    allergyArray: [...entry.allergyArray, entry.currentAllergyInput.trim()],
                                    currentAllergyInput: '',
                                  });
                                }
                              }}
                              inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                            />
                            <Button variant="contained" color="error"
                              disabled={!entry.currentAllergyInput.trim()}
                              onClick={() => updateEntry(index, {
                                allergyArray: [...entry.allergyArray, entry.currentAllergyInput.trim()],
                                currentAllergyInput: '',
                              })}
                              sx={{ fontWeight: 900, minWidth: 40, borderRadius: 0 }}
                            >+</Button>
                          </Box>
                        </>
                      )}
                    </Box>
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <FormControlLabel
                      control={<Switch size="small" checked={entry.isNeutered} onChange={e => updateEntry(index, { isNeutered: e.target.checked })} color="success" />}
                      label={<Typography sx={{ fontWeight: 900, fontSize: '0.75rem', color: '#5D4037' }}>SPAYED / NEUTERED</Typography>}
                    />
                  </Grid>
                </Grid>
              </Box>
            )}

            {/* Per-pet visit logistics: services + triage notes */}
            <Box sx={{ borderTop: isNew ? '1px dashed #D7CCC8' : 'none', pt: isNew ? 1.5 : 0 }}>
              <Typography variant="overline" sx={{ fontWeight: 900, color: '#5D4037', letterSpacing: 1, fontSize: '0.65rem', display: 'block', mb: 1.2 }}>
                VISIT LOGISTICS
              </Typography>
              <Autocomplete
                multiple
                options={[...(servicesList || [])].filter(s => s.isWalkIn !== false).sort((a, b) => (a.name || '').localeCompare(b.name || ''))}
                getOptionLabel={(option) => option.name?.toUpperCase() || ''}
                value={servicesList?.filter(s => entry.selectedServices.includes(s.name)) || []}
                onChange={(_, newValue) => updateEntry(index, { selectedServices: newValue.map(v => v.name) })}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size="small"
                    variant="outlined"
                    label="SEARCH & SELECT SERVICES"
                    InputLabelProps={{ sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' } }}
                    inputProps={{ ...params.inputProps, style: { fontWeight: 900, fontSize: '0.85rem' } }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
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
                        <Typography variant="caption" sx={{ fontWeight: 900 }}>
                          {option.name?.toUpperCase()} ({option.price?.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })})
                        </Typography>
                      </Box>
                    </li>
                  );
                }}
                renderTags={(selected, getTagProps) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((option, i) => {
                      const { key, ...tagProps } = getTagProps({ index: i });
                      const deptName = option.department || option.category || 'General';
                      const deptObj = (departments || []).find(d => d.name === deptName);
                      const badgeColor = deptObj ? deptObj.color : '#616161';
                      return (
                        <Chip key={key} {...tagProps} label={option.name?.toUpperCase()} size="small"
                          sx={{ bgcolor: badgeColor, color: 'white', fontWeight: 900, fontSize: '0.6rem', height: '20px', borderRadius: 0 }}
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
                value={entry.triageNotes}
                onChange={e => updateEntry(index, { triageNotes: e.target.value })}
                InputLabelProps={{ sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' } }}
                inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
              />
            </Box>
          </Box>
        </Collapse>
      </Paper>
    );
  };

  const hasEmergencyService = petEntries.some(e =>
    e.selectedServices.some(svcName => servicesList?.find(s => s.name === svcName)?.isEmergency)
  );

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{
        bgcolor: '#5D4037',
        color: 'white',
        fontWeight: 900,
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        fontSize: '1.1rem',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 2,
        borderBottom: '2px solid rgba(0,0,0,0.1)',
      }}>
        <DirectionsWalkIcon sx={{ fontSize: 24 }} />
        Register Walk-In Patient{petEntries.length > 1 && ` (${petEntries.length} PETS)`}
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2, bgcolor: '#F5F5F5', minHeight: '520px', display: 'flex', flexDirection: 'column' }}>
        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2, fontWeight: 900, borderRadius: 0, border: '2px solid #D32F2F', py: 0.5 }}>
            {errorMsg}
          </Alert>
        )}

        {/* Walk-in type selector */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <RadioGroup
            row
            value={walkInType}
            onChange={(e) => {
              setWalkInType(e.target.value);
              setErrorMsg('');
              setGuestName(''); setGuestPhone(''); setGuestEmail('');
              setSelectedClient(null);
              setPetEntries([BLANK_PET_DATA()]);
              setConfirmDiscard(false); setConfirmSubmit(false);
            }}
          >
            <FormControlLabel
              value="existing"
              control={<Radio size="small" sx={{ color: '#5D4037', '&.Mui-checked': { color: '#5D4037' } }} />}
              label={<Typography sx={{ fontWeight: 900, fontSize: '0.8rem' }}>EXISTING CLIENT</Typography>}
            />
            <FormControlLabel
              value="guest"
              control={<Radio size="small" sx={{ color: '#5D4037', '&.Mui-checked': { color: '#5D4037' } }} />}
              label={<Typography sx={{ fontWeight: 900, fontSize: '0.8rem' }}>GUEST / NEW CLIENT</Typography>}
            />
          </RadioGroup>
        </Box>

        {/* Owner identity section */}
        <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid #D7CCC8', borderRadius: 0, bgcolor: '#FFF' }}>
          <Typography variant="overline" sx={{ fontWeight: 900, color: '#5D4037', letterSpacing: 1, fontSize: '0.65rem', display: 'block', mb: 1 }}>
            OWNER IDENTITY
          </Typography>

          {walkInType === 'existing' ? (
            <Autocomplete
              options={clients}
              getOptionLabel={(option) => `${option.fullName?.toUpperCase()} (${option.phone || 'NO PHONE'})`}
              value={selectedClient}
              onChange={(_, v) => setSelectedClient(v)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  variant="outlined"
                  label="SEARCH CLIENT DATABASE..."
                  fullWidth
                  inputProps={{ ...params.inputProps, style: { fontWeight: 900, fontSize: '0.85rem' } }}
                  InputLabelProps={{ sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                />
              )}
            />
          ) : (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 5 }}>
                <TextField size="small" label="OWNER FULL NAME" variant="outlined" fullWidth
                  value={guestName} onChange={e => setGuestName(e.target.value)}
                  InputLabelProps={{ sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' } }}
                  inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField size="small" label="CONTACT PHONE" variant="outlined" fullWidth
                  value={guestPhone} onChange={e => setGuestPhone(e.target.value)}
                  helperText="MUST START WITH 09"
                  FormHelperTextProps={{ sx: { fontWeight: 900, fontSize: '0.7rem' } }}
                  InputLabelProps={{ sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' } }}
                  inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <TextField size="small" label="EMAIL (OPTIONAL)" variant="outlined" fullWidth
                  value={guestEmail} onChange={e => setGuestEmail(e.target.value)}
                  InputLabelProps={{ sx: { fontWeight: 900, color: '#5D4037', fontSize: '0.8rem' } }}
                  inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                />
              </Grid>
            </Grid>
          )}
        </Paper>

        {/* Multi-pet group indicator */}
        {petEntries.length > 1 && (
          <Alert
            severity="info"
            sx={{ mb: 2, fontWeight: 900, borderRadius: 0, border: '2px solid #1565C0', py: 0.5, bgcolor: '#E3F2FD' }}
          >
            <Typography sx={{ fontWeight: 900, fontSize: '0.8rem', color: '#1565C0' }}>
              MULTI-PET VISIT — {petEntries.length} pets will share one queue number and one visit group ID.
            </Typography>
          </Alert>
        )}

        {/* Pet entry cards */}
        {petEntries.map((entry, index) => renderPetEntryForm(entry, index))}

        {/* ADD ANOTHER PET button */}
        {(walkInType === 'existing' ? selectedClient : true) && (
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={addPetEntry}
            sx={{
              mb: 2,
              fontWeight: 900,
              color: '#5D4037',
              borderColor: '#5D4037',
              borderRadius: 0,
              borderStyle: 'dashed',
              letterSpacing: 1,
              fontSize: '0.8rem',
              width: '100%',
              '&:hover': { bgcolor: '#FFF8E1', borderColor: '#3E2723', borderStyle: 'solid' },
            }}
          >
            ADD ANOTHER PET
          </Button>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, bgcolor: '#FFF', borderTop: '1px solid #D7CCC8', display: 'flex', justifyContent: 'space-between' }}>
        <Button
          onClick={handleDiscardClick}
          variant={confirmDiscard ? "contained" : "text"}
          sx={{
            fontWeight: 900,
            color: confirmDiscard ? 'white' : '#9E9E9E',
            letterSpacing: 1,
            fontSize: '0.75rem',
            borderRadius: 0,
            bgcolor: confirmDiscard ? '#D32F2F' : 'transparent',
            '&:hover': { bgcolor: confirmDiscard ? '#B71C1C' : 'rgba(0,0,0,0.04)' },
          }}
        >
          {confirmDiscard ? "CONFIRM DISCARD?" : "DISCARD REGISTRATION"}
        </Button>
        <Button
          onClick={handleQueueClick}
          variant="contained"
          disabled={loading}
          sx={{
            px: 4,
            py: 1,
            fontWeight: 900,
            borderRadius: 0,
            bgcolor: confirmSubmit ? '#E65100' : (hasEmergencyService ? '#D32F2F' : '#5D4037'),
            letterSpacing: 1.2,
            fontSize: '0.85rem',
            '&:hover': { bgcolor: confirmSubmit ? '#BF360C' : (hasEmergencyService ? '#B71C1C' : '#3E2723') },
            boxShadow: '0 4px 12px rgba(93, 64, 55, 0.2)',
          }}
        >
          {loading
            ? "PROCESSING..."
            : confirmSubmit
            ? "CLICK TO CONFIRM ENTRY"
            : petEntries.length > 1
            ? `ADD ${petEntries.length} PETS TO QUEUE`
            : "OFFICIALLY ADD TO QUEUE"
          }
        </Button>
      </DialogActions>
    </Dialog>
  );
}