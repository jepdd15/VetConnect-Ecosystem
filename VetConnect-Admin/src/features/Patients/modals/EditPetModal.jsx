import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, FormControlLabel, Switch, Typography, Button, Grid, Box, InputAdornment, Autocomplete } from '@mui/material';
import { BREED_CATALOG } from '../../../constants/breedConstants';
import { doc, updateDoc, Timestamp, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

// Design Tokens
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';

// Icons
import PetsIcon from '@mui/icons-material/Pets';
import SaveIcon from '@mui/icons-material/Save';

export default function EditPetModal({ open, onClose, pet }) {
  const [form, setForm] = useState({
    name: '', breed: '', species: 'Canine', gender: 'Male',
    dob: '', color: '', isNeutered: false,
    allergies: 'None', microchip: '', lastWeight: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Pre-populate form when pet changes.
  // T2.119: Read allergies via normalized fallback — petAllergies (canonical) → allergies (legacy).
  useEffect(() => {
    if (pet) {
      setForm({
        name: pet.name || '',
        breed: pet.breed || '',
        species: pet.species || 'Canine',
        gender: pet.gender || 'Male',
        dob: pet.dob?.toDate ? pet.dob.toDate().toISOString().split('T')[0] : (pet.dob || ''),
        color: pet.color || '',
        isNeutered: pet.isNeutered || false,
        allergies: pet.petAllergies || pet.allergies || 'None',
        microchip: pet.microchip || '',
        lastWeight: pet.lastWeight || '',
      });
      setError('');
    }
  }, [pet]);

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Pet name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const resolvedAllergies = form.allergies.trim() || 'None';

      // T2.119: Write `petAllergies` as the canonical field name.
      // Retain `allergies` as a legacy alias so existing queries on the old field still resolve.
      const payload = {
        name: form.name.trim(),
        breed: form.breed.trim() || 'Unknown Breed',
        species: form.species,
        gender: form.gender,
        dob: form.dob ? Timestamp.fromDate(new Date(form.dob)) : null,
        color: form.color.trim(),
        isNeutered: form.isNeutered,
        petAllergies: resolvedAllergies,
        allergies: resolvedAllergies,
        microchip: form.microchip.trim(),
        weight: form.lastWeight ? parseFloat(form.lastWeight) : null,
        lastWeight: form.lastWeight ? parseFloat(form.lastWeight) : null,
        updatedAt: Timestamp.now(),
        isAgeExact: !!form.dob,
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
            <Grid item xs={12} md={8}>
              <TextField autoFocus label="Pet Name" fullWidth size="small" required
                value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
                error={!!error && !form.name.trim()} helperText={!form.name.trim() && error ? error : ''}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField select label="Species" fullWidth size="small"
                value={form.species} onChange={(e) => setForm({...form, species: e.target.value, breed: ''})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}>
                <MenuItem value="Canine">🐶 Canine</MenuItem>
                <MenuItem value="Feline">🐱 Feline</MenuItem>
              </TextField>
            </Grid>

            {/* Row 2: Breed + Color */}
            <Grid item xs={12} md={6}>
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
            <Grid item xs={12} md={6}>
              <TextField label="Color / Markings" fullWidth size="small"
                value={form.color} onChange={(e) => setForm({...form, color: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>

            {/* Row 3: Sex + DOB */}
            <Grid item xs={12} md={6}>
              <TextField select label="Sex" fullWidth size="small"
                value={form.gender} onChange={(e) => setForm({...form, gender: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}>
                <MenuItem value="Male">Male</MenuItem>
                <MenuItem value="Female">Female</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField type="date" label="Date of Birth" fullWidth size="small"
                InputLabelProps={{ shrink: true }}
                inputProps={{ max: new Date().toISOString().split('T')[0] }}
                value={form.dob} onChange={(e) => setForm({...form, dob: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>

            {/* Row 4: Weight + Microchip */}
            <Grid item xs={12} md={6}>
              <TextField label="Last Recorded Weight" fullWidth size="small" type="number"
                value={form.lastWeight} onChange={(e) => setForm({...form, lastWeight: e.target.value})}
                InputProps={{ endAdornment: <InputAdornment position="end"><Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textMuted }}>kg</Typography></InputAdornment> }}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Microchip Number" fullWidth size="small"
                value={form.microchip} onChange={(e) => setForm({...form, microchip: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>

            {/* Row 5: Allergies (full width) */}
            <Grid item xs={12}>
              <TextField label="Known Allergies" fullWidth size="small" placeholder="e.g., Chicken protein, Amoxicillin — or type 'None'"
                value={form.allergies} onChange={(e) => setForm({...form, allergies: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>

            {/* Row 6: Neutered toggle */}
            <Grid item xs={12}>
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
