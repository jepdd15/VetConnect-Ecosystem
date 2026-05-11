import React, { useState, useEffect } from 'react';
import { resolveTieredPrice } from '../../utils/resolveTieredPrice';
import { normalizePhone, isValidPHPhone } from '../../utils/phoneValidation';
import { COLORS, FONT } from '../../theme/designTokens';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Box, Typography,
  FormControl, InputLabel, Select, RadioGroup, FormControlLabel, Radio,
  Autocomplete, Alert, CircularProgress, Paper, Switch, Chip, Stack,
  ToggleButton, ToggleButtonGroup, Collapse, Snackbar,
} from '@mui/material';
import Grid from '@mui/material/Grid';

// Icons
import WarningIcon from '@mui/icons-material/Warning';
import CircleIcon from '@mui/icons-material/Circle';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import CakeIcon from '@mui/icons-material/Cake';

import { BREED_CATALOG } from '../../constants/breedConstants';
import { collection, doc, runTransaction, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { makePulseEventId } from '../../utils/pulseUtils';
import { db } from '../../firebaseConfig';
import { useUser } from '../../context/UserContext';
import { detectNoShows } from '../../utils/noShowDetection';
import { useClinicSettings } from '../../hooks/useClinicSettings';
import { sendPushNotification } from '../../utils/sendPushNotification';

const sxField = {
  bgcolor: COLORS.cardBg,
  '& .MuiOutlinedInput-root': {
    borderRadius: 0,
    '& fieldset': { border: `2px solid ${COLORS.accent}` },
    '&:hover fieldset': { borderColor: COLORS.brand },
    '&.Mui-focused fieldset': { borderColor: COLORS.accent, borderWidth: '3px' },
  },
  '& .MuiInputLabel-root': { color: COLORS.accent, fontWeight: 'bold' },
};

const sxSelect = {
  fontWeight: 900,
  fontSize: '0.85rem',
  borderRadius: 0,
  '& .MuiOutlinedInput-notchedOutline': { border: `2px solid ${COLORS.accent}` },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.brand },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.accent, borderWidth: '3px' },
};

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

export default function WalkInModal({ open, onClose, servicesList, departments, prefillClient, prefillPet, prefillDate, prefillTime }) {
  const { profile } = useUser();
  const staffSignature = profile?.fullName || 'System/Admin';
  const clinicSettings = useClinicSettings();

  const [loading, setLoading] = useState(false);
  // Fix 8 — Replace double-click confirm patterns with a proper MUI Dialog
  const [showConfirmQueue, setShowConfirmQueue] = useState(false);
  const [walkInType, setWalkInType] = useState('existing');

  // --- EXISTING CLIENT STATES ---
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientPets, setClientPets] = useState([]);
  const [fetchingPets, setFetchingPets] = useState(false);

  // --- GUEST CLIENT STATES ---
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  // --- PET ENTRIES ---
  // Each entry represents one pet being registered in this walk-in.
  const [petEntries, setPetEntries] = useState([BLANK_PET_DATA()]);

  const [errorMsg, setErrorMsg] = useState('');

  // Fix 13 — Replace alert() with Snackbar toast
  const [successToast, setSuccessToast] = useState('');

  // No-show detection map: { petId -> noShowInfo }
  const [noShowMap, setNoShowMap] = useState({});

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

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
      detectNoShows([pid]).then(r => ({ pid, result: r }))
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
  ]);

  // --- PET ENTRY HELPERS ---
  const updateEntry = (index, patch) => {
    setPetEntries(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...patch };
      return updated;
    });
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
    setShowConfirmQueue(false);
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
    ownerId, ownerName, ownerPhone, ownerEmail, petId, petName, petSpecies, petBreed, petGender, petColor,
    petIsNeutered, petBirthdate, isAgeExact, petWeight, petAllergies,
    mappedServices, triageNotes, isEmergency, queueNumber, noShowData,
  }) => {
    const primaryDept = mappedServices[0]?.department || 'General';
    const resolvedWeight = petWeight || null;
    const now = Timestamp.now();

    // When called from Calendar's empty-slot click, prefillDate provides the
    // scheduled date and prefillTime provides the hour. Otherwise fall back to now.
    const scheduledTimestamp = prefillDate
      ? Timestamp.fromDate((() => {
          const d = new Date(prefillDate);
          d.setHours(prefillTime ?? new Date().getHours(), 0, 0, 0);
          return d;
        })())
      : now;

    return {
      ownerId, ownerName, ownerPhone, ownerEmail: ownerEmail || null,
      petId, petName, petSpecies,
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
      serviceType: mappedServices[0]?.name || 'Unknown',
      serviceCategory: primaryDept,
      serviceDuration: mappedServices.reduce((sum, s) => sum + (s.duration || 0), 0),
      serviceBuffer: mappedServices.reduce((sum, s) => sum + (s.bufferTime || 0), 0),
      servicePrice: mappedServices.reduce((sum, s) => sum + (s.price || 0), 0),
      scheduledDateStr: `${scheduledTimestamp.toDate().getFullYear()}-${String(scheduledTimestamp.toDate().getMonth() + 1).padStart(2, '0')}-${String(scheduledTimestamp.toDate().getDate()).padStart(2, '0')}`,
      triageDate: `${scheduledTimestamp.toDate().getFullYear()}-${String(scheduledTimestamp.toDate().getMonth() + 1).padStart(2, '0')}-${String(scheduledTimestamp.toDate().getDate()).padStart(2, '0')}`,
      status: 'arrived',
      caseDay: 1,
      statusHistory: [],
      queueNumber,
      ticketPrefix: isEmergency ? 'E' : 'W',
      priority: isEmergency ? 'high' : 'normal',
      scheduledDate: scheduledTimestamp,
      createdAt: now,
      timeArrived: scheduledTimestamp,
      staffNotes: triageNotes,
      systemChips: [
        ...(isEmergency ? ['EMERGENCY'] : []),
        ...(noShowData?.count > 0 ? [`NO-SHOW-HISTORY:${noShowData.count}`] : []),
      ],
      assignedVetId: null,
      assignedVet: 'Unassigned',
      ...(noShowData?.count > 0 ? {
        rebookedFromId: noShowData.mostRecent?.id || null,
        noShowCount: noShowData.count,
      } : {}),
      clinicalPulse: [
        {
          eventId: makePulseEventId('walkin'),
          type: 'INCEPTION',
          toStatus: 'arrived',
          timestamp: now,
          staffId: profile?.id || 'system_walkin',
          staffName: staffSignature,
          note: `Physical Intake [WT: ${resolvedWeight || 'N/A'}kg]:${isEmergency ? ' URGENT ER' : ''} ${triageNotes}`,
        },
      ],
    };
  };

  const handleSubmit = async () => {
    setErrorMsg('');
    setShowConfirmQueue(false);

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
      // Triage notes are optional — receptionist may relay context verbally.
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

        let finalOwnerId, finalOwnerName, finalOwnerPhone, finalOwnerEmail;

        // Shared timestamp for all writes within this transaction
        const txNow = Timestamp.now();

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
            createdAt: txNow,
          });
          finalOwnerId = newUserRef.id;
          finalOwnerName = guestName || 'Guest Client';
          finalOwnerPhone = normalizePhone(guestPhone) || guestPhone || 'No Contact';
          finalOwnerEmail = guestEmail || null;
        } else {
          finalOwnerId = selectedClient.id;
          finalOwnerName = selectedClient.fullName || selectedClient.displayName || 'Existing Client';
          finalOwnerPhone = selectedClient.phone || 'No Contact';
          finalOwnerEmail = selectedClient.email || null;
        }

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
              createdAt: txNow,
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

          // Map services — skip any that no longer exist in the catalog
          const mappedServices = entry.selectedServices.map(svcName => {
            const s = servicesList.find(item => item.name === svcName);
            if (!s) { console.warn(`[WalkInModal] Service "${svcName}" not found in catalog — skipped.`); return null; }
            return {
              id: s.id,
              name: svcName,
              price: resolveTieredPrice(s, petWeight),
              department: s.department || s.category || 'General',
              status: 'pending',
              staffId: null,
              staffName: 'Unassigned',
            };
          }).filter(Boolean);

          const isEmergency = entry.selectedServices.some(
            svcName => servicesList.find(s => s.name === svcName)?.isEmergency
          );

          const noShowData = noShowMap[petId] || null;

          const appointmentPayload = buildAppointmentPayload({
            ownerId: finalOwnerId,
            ownerName: finalOwnerName,
            ownerPhone: finalOwnerPhone,
            ownerEmail: finalOwnerEmail,
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
            sentBy: profile?.fullName || 'Staff',
          });
        }
      });

      const count = petEntries.length;
      // Fix 13 — Show Snackbar instead of browser alert()
      setSuccessToast(count > 1
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

  // Fix 8 — Discard is now a simple close, no double-click pattern
  const handleDiscardClick = () => {
    handleClose();
  };

  // --- PET ENTRY FORM: Renders the per-pet section (existing select or new pet genome) ---
  const renderPetEntryForm = (entry, index) => {
    const isNew = walkInType === 'guest' || entry.isNewPet;
    const noShowData = noShowMap[entry.selectedPet?.id];

    return (
      <Collapse key={index} in={entry.expanded !== false} timeout="auto">
        <Box>
          {/* Existing client pet selection */}
          {walkInType === 'existing' && (
            <Stack spacing={1.5} sx={{ mb: 1.5 }}>
              {fetchingPets ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                  <CircularProgress size={24} sx={{ color: COLORS.accent }} />
                </Box>
              ) : selectedClient ? (
                <>
                  <FormControl fullWidth size="small" variant="outlined">
                    <InputLabel sx={{ fontWeight: 900, color: COLORS.accent, fontSize: '0.8rem' }}>SELECT PET IDENTITY</InputLabel>
                    <Select
                      value={entry.selectedPet || ''}
                      onChange={(e) => updateEntry(index, { selectedPet: e.target.value, isNewPet: false })}
                      disabled={entry.isNewPet}
                      label="SELECT PET IDENTITY"
                      sx={sxSelect}
                    >
                      {clientPets.map(p => (
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
                    label={<Typography sx={{ fontWeight: 900, color: COLORS.accent, fontSize: '0.8rem' }}>REGISTER NEW PET</Typography>}
                  />

                </>
              ) : null}
            </Stack>
          )}

          {/* No-show warning for this pet */}
          {noShowData && noShowData.count > 0 && (
            <Alert
              severity="warning"
              icon={<WarningIcon fontSize="small" />}
              sx={{ mb: 1.5, fontWeight: 900, borderRadius: 0, border: `2px solid ${COLORS.warning}`, py: 0.5, fontSize: '0.8rem' }}
            >
              <Typography sx={{ fontWeight: 900, fontSize: '0.8rem' }}>
                NO-SHOW HISTORY: {noShowData.count} no-show{noShowData.count > 1 ? 's' : ''} on record.
              </Typography>
            </Alert>
          )}

          {/* New pet genome form */}
          {isNew && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField size="small" label="PET NAME" variant="outlined" fullWidth
                  value={entry.name}
                  onChange={e => updateEntry(index, { name: e.target.value })}
                  inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                  sx={sxField}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 2.5 }}>
                <FormControl fullWidth size="small" variant="outlined">
                  <InputLabel sx={{ fontWeight: 900, color: COLORS.accent, fontSize: '0.8rem' }}>SPECIES</InputLabel>
                  <Select label="SPECIES" value={entry.species}
                    onChange={e => updateEntry(index, { species: e.target.value, breed: '' })}
                    sx={sxSelect}>
                    <MenuItem value="Canine" sx={{ fontWeight: 800, fontSize: '0.85rem' }}>CANINE</MenuItem>
                    <MenuItem value="Feline" sx={{ fontWeight: 800, fontSize: '0.85rem' }}>FELINE</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, md: 2.5 }}>
                <TextField size="small" label="WEIGHT (KG)" variant="outlined" fullWidth type="number"
                  inputProps={{ step: '0.1', min: '0', style: { fontWeight: 900, color: COLORS.success, fontSize: '0.85rem' } }}
                  value={entry.weight}
                  onChange={e => updateEntry(index, { weight: e.target.value })}
                  sx={sxField}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Autocomplete
                  freeSolo
                  options={BREED_CATALOG[entry.species] || []}
                  value={entry.breed || ''}
                  onChange={(_, v) => updateEntry(index, { breed: v || '' })}
                  onInputChange={(_, v, reason) => { if (reason === 'input') updateEntry(index, { breed: v }); }}
                  componentsProps={{ paper: { sx: { borderRadius: 0, border: `1px solid ${COLORS.accent}` } } }}
                  renderInput={(params) => (
                    <TextField {...params} size="small" label="BREED / LINEAGE" variant="outlined" fullWidth
                      inputProps={{ ...params.inputProps, style: { fontWeight: 900, fontSize: '0.85rem' } }}
                      sx={sxField}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <TextField size="small" label="COLOR / MARKINGS" variant="outlined" fullWidth
                  value={entry.color}
                  onChange={e => updateEntry(index, { color: e.target.value })}
                  inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                  sx={sxField}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 9 }}>
                <Box sx={{ p: 1, border: `1px dashed ${COLORS.borderLight}`, bgcolor: 'transparent' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
                    <CakeIcon sx={{ fontSize: 18, color: COLORS.accentWarm }} />
                    <Typography sx={{ fontWeight: 900, fontSize: '0.75rem', color: COLORS.accent }}>BIRTHDATE / AGE MODE</Typography>
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
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                      value={entry.dob}
                      onChange={e => updateEntry(index, { dob: e.target.value })}
                      sx={sxField}
                    />
                  )}
                  {entry.dobMode === 'approximate' && (
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <TextField size="small" label="YEARS" type="number" fullWidth
                        value={entry.estYears}
                        onChange={e => updateEntry(index, { estYears: e.target.value })}
                        inputProps={{ style: { fontWeight: 900 } }}
                        sx={sxField}
                      />
                      <TextField size="small" label="MONTHS" type="number" fullWidth
                        value={entry.estMonths}
                        onChange={e => updateEntry(index, { estMonths: e.target.value })}
                        inputProps={{ style: { fontWeight: 900 } }}
                        sx={sxField}
                      />
                    </Box>
                  )}
                  {entry.dobMode === 'unknown' && (
                    <Typography variant="caption" sx={{ color: COLORS.accentWarm, fontStyle: 'italic', fontWeight: 800 }}>
                      Age will be determined by the veterinarian during the physical exam.
                    </Typography>
                  )}
                </Box>
              </Grid>
              <Grid size={{ xs: 12, md: 2.5 }}>
                <FormControl fullWidth size="small" variant="outlined">
                  <InputLabel sx={{ fontWeight: 900, color: COLORS.accent, fontSize: '0.8rem' }}>GENDER</InputLabel>
                  <Select label="GENDER" value={entry.gender}
                    onChange={e => updateEntry(index, { gender: e.target.value })}
                    sx={sxSelect}>
                    <MenuItem value="Male" sx={{ fontWeight: 800, fontSize: '0.85rem' }}>MALE</MenuItem>
                    <MenuItem value="Female" sx={{ fontWeight: 800, fontSize: '0.85rem' }}>FEMALE</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, md: 3.5 }}>
                <TextField size="small" label="MICROCHIP ID" variant="outlined" fullWidth
                  value={entry.microchip}
                  onChange={e => updateEntry(index, { microchip: e.target.value })}
                  inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                  sx={sxField}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Box sx={{ p: 1, border: '1.2px solid', borderColor: entry.showAllergyInput ? COLORS.danger : COLORS.borderInput, bgcolor: 'transparent' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: entry.showAllergyInput ? 1.5 : 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <WarningIcon sx={{ color: entry.showAllergyInput ? COLORS.danger : COLORS.border, fontSize: 18 }} />
                      <Typography sx={{ fontWeight: 900, fontSize: '0.78rem', color: entry.showAllergyInput ? COLORS.danger : COLORS.textMuted }}>
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
                            sx={{ bgcolor: COLORS.danger, color: 'white', fontWeight: 900, fontSize: '0.7rem', borderRadius: 0, '& .MuiChip-deleteIcon': { color: 'white!important', opacity: 0.8 } }}
                          />
                        ))}
                        {entry.allergyArray.length === 0 && (
                          <Typography variant="caption" sx={{ color: COLORS.danger, fontStyle: 'italic', fontWeight: 800 }}>No allergens added yet...</Typography>
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
                          sx={sxField}
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
                  label={<Typography sx={{ fontWeight: 900, fontSize: '0.75rem', color: COLORS.accent }}>SPAYED / NEUTERED</Typography>}
                />
              </Grid>
            </Grid>
          )}
        </Box>
      </Collapse>
    );
  };

  const hasEmergencyService = petEntries.some(e =>
    e.selectedServices.some(svcName => servicesList?.find(s => s.name === svcName)?.isEmergency)
  );

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 0,
            border: `2px solid ${COLORS.accent}`,
            backgroundColor: COLORS.cardBg,
            boxShadow: '8px 8px 0px rgba(93, 64, 55, 0.1)',
            maxHeight: '90vh',
          },
        }}
      >
        <DialogTitle sx={{
          bgcolor: COLORS.cream,
          color: COLORS.brand,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: 1,
          fontSize: '1.1rem',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          py: 2,
          borderBottom: `2px solid ${COLORS.accent}`,
          fontFamily: FONT,
        }}>
          <DirectionsWalkIcon sx={{ color: COLORS.accent, fontSize: 24 }} />
          Register Walk-In Patient
        </DialogTitle>

        <DialogContent sx={{ p: 0, bgcolor: COLORS.formBg, overflowY: 'auto' }}>
          <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {errorMsg && (
              <Alert severity="error" sx={{ fontWeight: 900, borderRadius: 0, border: `2px solid ${COLORS.danger}`, py: 0.5 }}>
                {errorMsg}
              </Alert>
            )}

            {/* Prefill banner — shown when opened from Calendar's empty-slot click */}
            {prefillDate && (
              <Alert severity="info" sx={{ borderRadius: 0, fontWeight: 900 }}>
                Scheduling for{' '}
                {new Date(prefillDate).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
                {prefillTime != null && ` at ${prefillTime}:00`}
              </Alert>
            )}

            {/* Walk-in type toggle */}
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <RadioGroup
                row
                value={walkInType}
                onChange={(e) => {
                  setWalkInType(e.target.value);
                  setErrorMsg('');
                  setGuestName(''); setGuestPhone(''); setGuestEmail('');
                  setSelectedClient(null);
                  setPetEntries([BLANK_PET_DATA()]);
                  setShowConfirmQueue(false);
                }}
              >
                <FormControlLabel
                  value="existing"
                  control={<Radio size="small" sx={{ color: COLORS.accent, '&.Mui-checked': { color: COLORS.accent } }} />}
                  label={<Typography sx={{ fontWeight: 900, fontSize: '0.8rem' }}>EXISTING CLIENT</Typography>}
                />
                <FormControlLabel
                  value="guest"
                  control={<Radio size="small" sx={{ color: COLORS.accent, '&.Mui-checked': { color: COLORS.accent } }} />}
                  label={<Typography sx={{ fontWeight: 900, fontSize: '0.8rem' }}>GUEST / NEW CLIENT</Typography>}
                />
              </RadioGroup>
            </Box>

            {/* ── Section 1: Owner Identity ── */}
            <Box>
              <Typography variant="overline" sx={{ color: COLORS.accent, fontWeight: 900, mb: 1, display: 'block', letterSpacing: 1 }}>
                1. OWNER IDENTITY
              </Typography>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 0, border: `2px solid ${COLORS.accent}`, bgcolor: COLORS.cardBg }}>
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
                        sx={sxField}
                      />
                    )}
                  />
                ) : (
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 5 }}>
                      <TextField size="small" label="OWNER FULL NAME" variant="outlined" fullWidth
                        value={guestName} onChange={e => setGuestName(e.target.value)}
                        inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                        sx={sxField}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <TextField size="small" label="CONTACT PHONE" variant="outlined" fullWidth
                        value={guestPhone} onChange={e => setGuestPhone(e.target.value)}
                        helperText="Must start with 09 (e.g., 09123456789)"
                        FormHelperTextProps={{ sx: { fontWeight: 900, fontSize: '0.7rem' } }}
                        inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                        sx={sxField}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 3 }}>
                      <TextField size="small" label="EMAIL (OPTIONAL)" variant="outlined" fullWidth
                        value={guestEmail} onChange={e => setGuestEmail(e.target.value)}
                        inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                        sx={sxField}
                      />
                    </Grid>
                  </Grid>
                )}
              </Paper>
            </Box>

            {/* ── Section 2: Pet Details ── */}
            <Box>
              <Typography variant="overline" sx={{ color: COLORS.accent, fontWeight: 900, mb: 1, display: 'block', letterSpacing: 1 }}>
                2. PET DETAILS
              </Typography>

              {walkInType === 'existing' && !selectedClient ? (
                <Typography sx={{
                  textAlign: 'center',
                  color: COLORS.textMuted,
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  py: 4,
                  fontStyle: 'italic',
                }}>
                  Select a client above to continue
                </Typography>
              ) : (
                renderPetEntryForm(petEntries[0], 0)
              )}
            </Box>

            {/* ── Section 3: Clinical Intake ── */}
            <Box>
              <Typography variant="overline" sx={{ color: COLORS.accent, fontWeight: 900, mb: 1, display: 'block', letterSpacing: 1 }}>
                3. CLINICAL INTAKE
              </Typography>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 0, border: `2px solid ${COLORS.accent}`, bgcolor: COLORS.cardBg }}>
                <Autocomplete
                  multiple
                  options={[...(servicesList || [])]
                    .filter(s => s.isWalkIn !== false)
                    .sort((a, b) => {
                      const deptA = (a.department || a.category || 'General').toUpperCase();
                      const deptB = (b.department || b.category || 'General').toUpperCase();
                      if (deptA !== deptB) return deptA.localeCompare(deptB);
                      return (a.name || '').localeCompare(b.name || '');
                    })
                  }
                  groupBy={(option) => (option.department || option.category || 'General').toUpperCase()}
                  getOptionLabel={(option) => option.name?.toUpperCase() || ''}
                  value={servicesList?.filter(s => petEntries[0].selectedServices.includes(s.name)) || []}
                  onChange={(_, newValue) => updateEntry(0, { selectedServices: newValue.map(v => v.name) })}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      size="small"
                      variant="outlined"
                      label="SEARCH & SELECT SERVICES"
                      inputProps={{ ...params.inputProps, style: { fontWeight: 900, fontSize: '0.85rem' } }}
                      sx={sxField}
                    />
                  )}
                  renderOption={(props, option) => {
                    const { key, ...optionProps } = props;
                    const deptName = option.department || option.category || 'General';
                    const deptObj = (departments || []).find(d => d.name === deptName);
                    const badgeColor = deptObj ? deptObj.color : COLORS.textMuted;
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
                        const badgeColor = deptObj ? deptObj.color : COLORS.textMuted;
                        return (
                          <Chip key={key} {...tagProps} label={option.name?.toUpperCase()} size="small"
                            sx={{ bgcolor: badgeColor, color: 'white', fontWeight: 900, fontSize: '0.6rem', height: '20px', borderRadius: 0 }}
                          />
                        );
                      })}
                    </Box>
                  )}
                  sx={{ mb: 1 }}
                />

                {petEntries[0].selectedServices.length > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, p: 1, bgcolor: COLORS.cream, border: `1px solid ${COLORS.borderLight}`, borderRadius: 0 }}>
                    <Typography sx={{ fontWeight: 900, fontSize: '0.75rem', color: COLORS.textMuted, textTransform: 'uppercase' }}>Estimated Total</Typography>
                    <Typography sx={{ fontWeight: 900, fontSize: '0.85rem', color: COLORS.brand }}>
                      ₱{petEntries[0].selectedServices.reduce((sum, svcName) => {
                        const s = servicesList?.find(item => item.name === svcName);
                        return sum + (resolveTieredPrice(s, parseFloat(petEntries[0].weight) || null) || 0);
                      }, 0).toLocaleString()}
                    </Typography>
                  </Box>
                )}

                <TextField
                  label="REASON FOR VISIT"
                  multiline
                  rows={3}
                  fullWidth
                  size="small"
                  variant="outlined"
                  value={petEntries[0].triageNotes}
                  onChange={e => updateEntry(0, { triageNotes: e.target.value })}
                  inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
                  sx={sxField}
                />
              </Paper>
            </Box>
          </Box>
        </DialogContent>

        <DialogActions sx={{
          p: 2.5,
          bgcolor: COLORS.cream,
          borderTop: `2px solid ${COLORS.accent}`,
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <Button
            onClick={handleDiscardClick}
            sx={{
              fontWeight: 900,
              color: COLORS.accent,
              px: 3,
              border: `2px solid ${COLORS.accent}`,
              borderRadius: 0,
              fontFamily: FONT,
              letterSpacing: 1,
              fontSize: '0.8rem',
              '&:hover': { bgcolor: 'rgba(93, 64, 55, 0.05)' },
            }}
          >
            CANCEL
          </Button>
          <Button
            onClick={() => setShowConfirmQueue(true)}
            variant="contained"
            disabled={loading}
            sx={{
              px: 4,
              py: 1.2,
              fontWeight: 900,
              borderRadius: 0,
              fontFamily: FONT,
              letterSpacing: 1,
              fontSize: '0.85rem',
              bgcolor: hasEmergencyService ? COLORS.danger : COLORS.cta,
              border: `2px solid ${hasEmergencyService ? COLORS.dangerHover : COLORS.ctaHover}`,
              boxShadow: hasEmergencyService
                ? '4px 4px 0px rgba(211,47,47,0.2)'
                : '4px 4px 0px rgba(216,67,21,0.2)',
              '&:hover': {
                bgcolor: hasEmergencyService ? COLORS.dangerHover : COLORS.ctaHover,
                boxShadow: hasEmergencyService
                  ? '2px 2px 0px rgba(211,47,47,0.2)'
                  : '2px 2px 0px rgba(216,67,21,0.2)',
              },
            }}
          >
            {loading
              ? "PROCESSING..."
              : petEntries.length > 1
              ? `ADD ${petEntries.length} PETS TO QUEUE`
              : "ADD TO QUEUE"
            }
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={showConfirmQueue}
        onClose={() => setShowConfirmQueue(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 0,
            border: `2px solid ${COLORS.accent}`,
            backgroundColor: COLORS.cardBg,
            boxShadow: '8px 8px 0px rgba(93, 64, 55, 0.1)',
          },
        }}
      >
        <DialogTitle sx={{
          bgcolor: COLORS.cream,
          color: COLORS.brand,
          fontWeight: 900,
          fontSize: '1rem',
          letterSpacing: 1,
          textTransform: 'uppercase',
          borderBottom: `2px solid ${COLORS.accent}`,
          fontFamily: FONT,
        }}>
          CONFIRM WALK-IN REGISTRATION
        </DialogTitle>
        <DialogContent sx={{ pt: 3, pb: 2, bgcolor: COLORS.formBg }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: COLORS.brand }}>
            {petEntries.length > 1
              ? `Add ${petEntries.length} pets to the queue with a shared ticket?`
              : 'Add this patient to the queue?'
            }
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: COLORS.textMuted, mt: 0.5 }}>
            This action will create a new queue entry and cannot be undone from this form.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.accent}` }}>
          <Button
            onClick={() => setShowConfirmQueue(false)}
            sx={{
              fontWeight: 900,
              color: COLORS.accent,
              border: `2px solid ${COLORS.accent}`,
              borderRadius: 0,
              fontFamily: FONT,
              px: 3,
              fontSize: '0.8rem',
              '&:hover': { bgcolor: 'rgba(93, 64, 55, 0.05)' },
            }}
          >
            CANCEL
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={loading}
            sx={{
              fontWeight: 900,
              borderRadius: 0,
              fontFamily: FONT,
              letterSpacing: 1,
              fontSize: '0.8rem',
              px: 4,
              py: 1,
              bgcolor: hasEmergencyService ? COLORS.danger : COLORS.cta,
              border: `2px solid ${hasEmergencyService ? COLORS.dangerHover : COLORS.ctaHover}`,
              boxShadow: hasEmergencyService
                ? '4px 4px 0px rgba(211,47,47,0.2)'
                : '4px 4px 0px rgba(216,67,21,0.2)',
              '&:hover': {
                bgcolor: hasEmergencyService ? COLORS.dangerHover : COLORS.ctaHover,
                boxShadow: hasEmergencyService
                  ? '2px 2px 0px rgba(211,47,47,0.2)'
                  : '2px 2px 0px rgba(216,67,21,0.2)',
              },
            }}
          >
            {loading ? 'PROCESSING...' : 'CONFIRM & ADD TO QUEUE'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Fix 13 — Success toast replaces browser alert() */}
      <Snackbar
        open={Boolean(successToast)}
        autoHideDuration={4000}
        onClose={() => setSuccessToast('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={successToast}
      />
    </>
  );
}
