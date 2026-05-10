import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, FormControlLabel, Switch, Typography, Button, Grid, Box, InputAdornment, Autocomplete, ToggleButtonGroup, ToggleButton, Chip } from '@mui/material';
import { BREED_CATALOG } from '../../../constants/breedConstants';
import { doc, updateDoc, Timestamp, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

// Design Tokens
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';

// Icons
import PetsIcon from '@mui/icons-material/Pets';
import SaveIcon from '@mui/icons-material/Save';
import CakeIcon from '@mui/icons-material/Cake';
import WarningIcon from '@mui/icons-material/Warning';

export default function EditPetModal({ open, onClose, pet }) {
  const [form, setForm] = useState({
    name: '', breed: '', species: 'Canine', gender: 'Male',
    dob: '', color: '', isNeutered: false,
    allergies: 'None', microchip: '', lastWeight: '',
    // DOB 3-mode fields
    dobMode: 'exact', estYears: '', estMonths: '',
    // Allergy tag array fields
    showAllergyInput: false, allergyArray: [], currentAllergyInput: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Pre-populate form when pet changes.
  // T2.119: Read allergies via normalized fallback — petAllergies (canonical) → allergies (legacy).
  // Items 5+6: Pre-fill dobMode from isAgeExact flag; parse allergyArray from petAllergies string.
  useEffect(() => {
    if (pet) {
      // --- DOB MODE PRE-FILL ---
      let initialDobMode = 'unknown';
      let initialEstYears = '';
      let initialEstMonths = '';
      let initialDob = '';

      if (pet.dob) {
        const dobDate = pet.dob?.toDate ? pet.dob.toDate() : new Date(pet.dob);
        initialDob = dobDate.toISOString().split('T')[0];
        if (pet.isAgeExact === true || pet.isAgeExact === undefined) {
          // true → exact date known; undefined → legacy data entered as a date, treat as exact
          initialDobMode = 'exact';
        } else {
          // false → was stored as approximate (computed from estYears/estMonths at registration)
          initialDobMode = 'approximate';
          const now = new Date();
          const diffMs = now - dobDate;
          const totalMonths = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44));
          initialEstYears = String(Math.floor(totalMonths / 12));
          initialEstMonths = String(totalMonths % 12);
        }
      }

      // --- ALLERGY PRE-FILL ---
      const existingAllergies = pet.petAllergies || pet.allergies || 'None';
      const hasAllergies = existingAllergies.trim().toLowerCase() !== 'none' && existingAllergies.trim() !== '';
      const parsedAllergyArray = hasAllergies
        ? existingAllergies.split(',').map((a) => a.trim()).filter(Boolean)
        : [];

      setForm({
        name: pet.name || '',
        breed: pet.breed || '',
        species: pet.species || 'Canine',
        gender: pet.gender || 'Male',
        dob: initialDob,
        dobMode: initialDobMode,
        estYears: initialEstYears,
        estMonths: initialEstMonths,
        color: pet.color || '',
        isNeutered: pet.isNeutered || false,
        allergies: existingAllergies,
        showAllergyInput: hasAllergies,
        allergyArray: parsedAllergyArray,
        currentAllergyInput: '',
        microchip: pet.microchip || '',
        lastWeight: pet.lastWeight || '',
      });
      setError('');
    }
  }, [pet]);

  // --- DOB RESOLVER: converts dobMode form fields into Firestore-compatible values ---
  const resolveDob = () => {
    if (form.dobMode === 'exact') {
      return {
        dob: form.dob ? Timestamp.fromDate(new Date(form.dob)) : null,
        isAgeExact: true,
      };
    }
    if (form.dobMode === 'approximate') {
      const years = parseInt(form.estYears) || 0;
      const months = parseInt(form.estMonths) || 0;
      const d = new Date();
      d.setFullYear(d.getFullYear() - years);
      d.setMonth(d.getMonth() - months);
      d.setDate(1);  // anchor to 1st of month
      d.setHours(0, 0, 0, 0);
      return { dob: Timestamp.fromDate(d), isAgeExact: false };
    }
    return { dob: null, isAgeExact: false };
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Pet name is required.'); return; }
    if (form.showAllergyInput && form.allergyArray.length === 0) { setError('Allergy recording is enabled but no allergens were added. Add at least one or turn the toggle off.'); return; }
    setSaving(true);
    setError('');
    try {
      // Item 6: resolve from allergyArray when switch is ON
      const resolvedAllergies = form.showAllergyInput && form.allergyArray.length > 0
        ? form.allergyArray.join(', ')
        : 'None';

      // Item 5: use resolveDob for DOB + isAgeExact
      const { dob: resolvedDob, isAgeExact: resolvedIsAgeExact } = resolveDob();

      // T2.119: Write `petAllergies` as the canonical field name.
      // Retain `allergies` as a legacy alias so existing queries on the old field still resolve.
      const payload = {
        name: form.name.trim(),
        breed: form.breed.trim() || 'Unknown Breed',
        species: form.species,
        gender: form.gender,
        dob: resolvedDob,
        color: form.color.trim(),
        isNeutered: form.isNeutered,
        petAllergies: resolvedAllergies,
        allergies: resolvedAllergies,
        microchip: form.microchip.trim(),
        weight: form.lastWeight ? parseFloat(form.lastWeight) : null,
        lastWeight: form.lastWeight ? parseFloat(form.lastWeight) : null,
        updatedAt: Timestamp.now(),
        isAgeExact: resolvedIsAgeExact,
      };

      await updateDoc(doc(db, 'pets', pet.id), payload);

      // T2.119: Propagate updated petAllergies to all active appointments for this pet.
      // Active statuses are any stage before billing completion.
      const ACTIVE_STATUSES = ['pending', 'confirmed', 'arrived', 'in-consult', 'dispensing', 'billing'];
      const apptQuery = query(
        collection(db, 'appointments'),
        where('petId', '==', pet.id),
        where('status', 'in', ACTIVE_STATUSES),
      );
      const apptSnap = await getDocs(apptQuery);
      if (!apptSnap.empty) {
        const batch = writeBatch(db);
        apptSnap.docs.forEach(apptDoc => {
          batch.update(apptDoc.ref, { petAllergies: resolvedAllergies });
        });
        await batch.commit();
      }

      onClose(true); // true = saved successfully
    } catch (err) {
      console.error('[EditPetModal.handleSave]:', err);
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => onClose(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 0, overflow: 'hidden' } }}>
      <DialogTitle sx={{ bgcolor: COLORS.accent, color: 'white', fontFamily: FONT, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1 }}>
        <PetsIcon /> Edit Patient Profile
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: COLORS.surface, p: 3 }}>
        <Box sx={{ mt: 1 }}>
          <Grid container spacing={2}>
            {/* Row 1: Name + Species */}
            <Grid size={{ xs: 12, md: 8 }}>
              <TextField autoFocus label="Pet Name" fullWidth size="small" required
                value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
                error={!!error && !form.name.trim()} helperText={!form.name.trim() && error ? error : ''}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField select label="Species" fullWidth size="small"
                value={form.species} onChange={(e) => setForm({...form, species: e.target.value, breed: ''})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}>
                <MenuItem value="Canine">🐶 Canine</MenuItem>
                <MenuItem value="Feline">🐱 Feline</MenuItem>
              </TextField>
            </Grid>

            {/* Row 2: Breed + Color */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Autocomplete
                freeSolo
                options={BREED_CATALOG[form.species] || []}
                value={form.breed || ''}
                onChange={(_, v) => setForm({...form, breed: v || ''})}
                onInputChange={(_, v, reason) => { if (reason === 'input') setForm({...form, breed: v}); }}
                componentsProps={{ paper: { sx: { borderRadius: 0, border: `1px solid ${COLORS.accent}` } } }}
                renderInput={(params) => (
                  <TextField {...params} label="Breed" fullWidth size="small"
                    sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT, borderRadius: 0 } }} />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Color / Markings" fullWidth size="small"
                value={form.color} onChange={(e) => setForm({...form, color: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>

            {/* Row 3: Sex */}
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField select label="Sex" fullWidth size="small"
                value={form.gender} onChange={(e) => setForm({...form, gender: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}>
                <MenuItem value="Male">Male</MenuItem>
                <MenuItem value="Female">Female</MenuItem>
              </TextField>
            </Grid>

            {/* Row 3b: DOB 3-mode selector (Item 5) */}
            <Grid size={{ xs: 12 }}>
              <Box sx={{ p: 1, border: `1px dashed ${COLORS.borderLight}`, bgcolor: 'transparent' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
                  <CakeIcon sx={{ fontSize: 18, color: COLORS.accent }} />
                  <Typography sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.75rem', color: COLORS.accent }}>BIRTHDATE / AGE MODE</Typography>
                  <ToggleButtonGroup
                    size="small"
                    value={form.dobMode}
                    exclusive
                    onChange={(_, val) => val && setForm({ ...form, dobMode: val })}
                    sx={{ ml: 'auto', height: 26 }}
                  >
                    <ToggleButton value="exact" sx={{ fontSize: '0.65rem', fontWeight: 900, px: 2, borderRadius: 0 }}>EXACT</ToggleButton>
                    <ToggleButton value="approximate" sx={{ fontSize: '0.65rem', fontWeight: 900, px: 2, borderRadius: 0 }}>ESTIMATE</ToggleButton>
                    <ToggleButton value="unknown" sx={{ fontSize: '0.65rem', fontWeight: 900, px: 2, borderRadius: 0 }}>UNKNOWN</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                {form.dobMode === 'exact' && (
                  <TextField size="small" type="date" label="PET BIRTHDAY" fullWidth
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ max: new Date().toISOString().split('T')[0] }}
                    value={form.dob}
                    onChange={(e) => setForm({ ...form, dob: e.target.value })}
                    sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}
                  />
                )}
                {form.dobMode === 'approximate' && (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField size="small" label="YEARS" type="number" fullWidth
                      value={form.estYears}
                      onChange={(e) => setForm({ ...form, estYears: e.target.value })}
                      sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}
                    />
                    <TextField size="small" label="MONTHS" type="number" fullWidth
                      value={form.estMonths}
                      onChange={(e) => setForm({ ...form, estMonths: e.target.value })}
                      sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}
                    />
                  </Box>
                )}
                {form.dobMode === 'unknown' && (
                  <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted, fontStyle: 'italic', fontWeight: 700 }}>
                    Age will be determined by the veterinarian during the physical exam.
                  </Typography>
                )}
              </Box>
            </Grid>

            {/* Row 4: Weight + Microchip */}
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Last Recorded Weight" fullWidth size="small" type="number"
                value={form.lastWeight} onChange={(e) => setForm({...form, lastWeight: e.target.value})}
                InputProps={{ endAdornment: <InputAdornment position="end"><Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textMuted }}>kg</Typography></InputAdornment> }}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Microchip Number" fullWidth size="small"
                value={form.microchip} onChange={(e) => setForm({...form, microchip: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>

            {/* Row 5: Allergy tag array (Item 6) */}
            <Grid size={{ xs: 12 }}>
              <Box sx={{ p: 1, border: '1.2px solid', borderColor: form.showAllergyInput ? COLORS.danger : COLORS.borderLight, bgcolor: 'transparent' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: form.showAllergyInput ? 1.5 : 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningIcon sx={{ color: form.showAllergyInput ? COLORS.danger : COLORS.borderLight, fontSize: 18 }} />
                    <Typography sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.78rem', color: form.showAllergyInput ? COLORS.danger : COLORS.textMuted }}>
                      RECORD MEDICAL ALLERGIES?
                    </Typography>
                  </Box>
                  <Switch
                    size="small"
                    color="error"
                    checked={form.showAllergyInput}
                    onChange={(e) => setForm({
                      ...form,
                      showAllergyInput: e.target.checked,
                      allergyArray: e.target.checked ? form.allergyArray : [],
                    })}
                  />
                </Box>
                {form.showAllergyInput && (
                  <>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                      {form.allergyArray.map((allergy, i) => (
                        <Chip
                          key={i}
                          label={allergy.toUpperCase()}
                          onDelete={() => setForm({
                            ...form,
                            allergyArray: form.allergyArray.filter((_, idx) => idx !== i),
                          })}
                          sx={{ bgcolor: COLORS.danger, color: 'white', fontWeight: 900, fontSize: '0.7rem', borderRadius: 0, '& .MuiChip-deleteIcon': { color: 'white!important', opacity: 0.8 } }}
                        />
                      ))}
                      {form.allergyArray.length === 0 && (
                        <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.danger, fontStyle: 'italic', fontWeight: 800 }}>
                          No allergens added yet...
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <TextField
                        fullWidth size="small"
                        placeholder="Type allergy (e.g. Chicken, Amoxicillin)"
                        value={form.currentAllergyInput}
                        onChange={(e) => setForm({ ...form, currentAllergyInput: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && form.currentAllergyInput.trim()) {
                            e.preventDefault();
                            setForm({
                              ...form,
                              allergyArray: [...form.allergyArray, form.currentAllergyInput.trim()],
                              currentAllergyInput: '',
                            });
                          }
                        }}
                        sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}
                      />
                      <Button
                        variant="contained"
                        color="error"
                        disabled={!form.currentAllergyInput.trim()}
                        onClick={() => setForm({
                          ...form,
                          allergyArray: [...form.allergyArray, form.currentAllergyInput.trim()],
                          currentAllergyInput: '',
                        })}
                        sx={{ fontFamily: FONT, fontWeight: 900, minWidth: 40, borderRadius: 0 }}
                      >+</Button>
                    </Box>
                  </>
                )}
              </Box>
            </Grid>

            {/* Row 6: Neutered toggle */}
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={<Switch checked={form.isNeutered} onChange={(e) => setForm({...form, isNeutered: e.target.checked})} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.success }, '& .MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track': { bgcolor: COLORS.success } }} />}
                label={<Typography sx={{ fontFamily: FONT, fontWeight: 700, color: form.isNeutered ? COLORS.success : COLORS.textSecondary }}>{form.gender === 'Female' ? 'Spayed' : 'Neutered'}</Typography>}
              />
            </Grid>
          </Grid>

          {error && form.name.trim() && (
            <Typography sx={{ fontFamily: FONT, color: COLORS.danger, fontSize: '0.8rem', mt: 2, fontWeight: 600 }}>{error}</Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, bgcolor: COLORS.surfaceAlt, gap: 1 }}>
        <Button onClick={() => onClose(false)} sx={{ fontFamily: FONT, color: COLORS.textMuted }}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving} startIcon={<SaveIcon />}
          sx={{ fontFamily: FONT, bgcolor: COLORS.accent, fontWeight: 'bold', px: 3, '&:hover': { bgcolor: COLORS.brand } }}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
