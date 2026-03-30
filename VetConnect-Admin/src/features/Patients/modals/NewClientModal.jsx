import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Button, Grid, Box, Typography, Divider } from '@mui/material';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

// Design Tokens
import { FONT, COLORS } from '../../../theme/designTokens';

// Icons
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SaveIcon from '@mui/icons-material/Save';
import PetsIcon from '@mui/icons-material/Pets';

export default function NewClientModal({ open, onClose }) {
  const [form, setForm] = useState({
    fullName: '', phone: '', email: '',
    address: '', city: '',
    clientTag: 'Regular',
  });
  const [petForm, setPetForm] = useState({
    name: '', species: 'Canine',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const resetForms = () => {
    setForm({ fullName: '', phone: '', email: '', address: '', city: '', clientTag: 'Regular' });
    setPetForm({ name: '', species: 'Canine' });
    setError('');
  };

  const handleSave = async () => {
    // Validation
    if (!form.fullName.trim()) { setError('Client name is required.'); return; }
    if (!form.phone.trim()) { setError('Phone number is required.'); return; }

    setSaving(true);
    setError('');
    try {
      // 1. Create the owner document
      const ownerPayload = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        clientTag: form.clientTag,
        role: 'pet_owner',
        accountStanding: 'Good Standing',
        staffNotes: [],
        emergencyContacts: [],
        createdAt: Timestamp.now(),
      };
      const ownerRef = await addDoc(collection(db, 'users'), ownerPayload);

      // 2. If pet name is provided, create pet document
      if (petForm.name.trim()) {
        await addDoc(collection(db, 'pets'), {
          name: petForm.name.trim(),
          species: petForm.species,
          ownerId: ownerRef.id,
          breed: 'Unknown Breed',
          gender: 'Male',
          isNeutered: false,
          allergies: 'None',
          status: 'active',
          createdAt: Timestamp.now(),
        });
      }

      resetForms();
      onClose(true); // true = saved
    } catch (err) {
      console.error('Error creating client:', err);
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => { resetForms(); onClose(false); }} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}>
      <DialogTitle sx={{ bgcolor: COLORS.cta, color: 'white', fontFamily: FONT, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1 }}>
        <PersonAddIcon /> Register New Client
      </DialogTitle>
      <DialogContent sx={{ bgcolor: COLORS.surface, p: 3 }}>
        <Box sx={{ mt: 1 }}>
          {/* OWNER INFO */}
          <Typography sx={{ fontFamily: FONT, fontWeight: 800, color: COLORS.accent, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1.5 }}>
            Client Information
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <TextField autoFocus label="Full Name" fullWidth size="small" required
                value={form.fullName} onChange={(e) => setForm({...form, fullName: e.target.value})}
                error={!!error && !form.fullName.trim()} helperText={!form.fullName.trim() && error ? 'Required' : ''}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField select label="Client Tag" fullWidth size="small"
                value={form.clientTag} onChange={(e) => setForm({...form, clientTag: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}>
                <MenuItem value="Regular">Regular</MenuItem>
                <MenuItem value="VIP">VIP</MenuItem>
                <MenuItem value="New">New</MenuItem>
                <MenuItem value="Rescue/Shelter">Rescue / Shelter</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Phone Number" fullWidth size="small" required
                value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})}
                error={!!error && !form.phone.trim()} helperText={!form.phone.trim() && error ? 'Required' : ''}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Email (Optional)" fullWidth size="small"
                value={form.email} onChange={(e) => setForm({...form, email: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Street / Barangay (Optional)" fullWidth size="small"
                value={form.address} onChange={(e) => setForm({...form, address: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="City / Municipality (Optional)" fullWidth size="small"
                value={form.city} onChange={(e) => setForm({...form, city: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>
          </Grid>

          {/* PET INFO (Optional) */}
          <Divider sx={{ my: 3, borderColor: COLORS.border }} />
          <Typography sx={{ fontFamily: FONT, fontWeight: 800, color: COLORS.accent, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5 }}>
            First Pet (Optional)
          </Typography>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, mb: 1.5, fontStyle: 'italic' }}>
            You can register the client's first pet now. Additional details can be filled in later.
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <TextField label="Pet Name" fullWidth size="small" placeholder="Leave blank to skip"
                value={petForm.name} onChange={(e) => setPetForm({...petForm, name: e.target.value})}
                InputProps={{ startAdornment: <PetsIcon sx={{ mr: 1, color: COLORS.textMuted, fontSize: 18 }} /> }}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField select label="Species" fullWidth size="small"
                value={petForm.species} onChange={(e) => setPetForm({...petForm, species: e.target.value})}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}>
                <MenuItem value="Canine">🐶 Canine</MenuItem>
                <MenuItem value="Feline">🐱 Feline</MenuItem>
              </TextField>
            </Grid>
          </Grid>

          {error && form.fullName.trim() && form.phone.trim() && (
            <Typography sx={{ fontFamily: FONT, color: COLORS.danger, fontSize: '0.8rem', mt: 2, fontWeight: 600 }}>{error}</Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, bgcolor: COLORS.surfaceAlt, gap: 1 }}>
        <Button onClick={() => { resetForms(); onClose(false); }} sx={{ fontFamily: FONT, color: COLORS.textMuted }}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving} startIcon={<SaveIcon />}
          sx={{ fontFamily: FONT, bgcolor: COLORS.cta, fontWeight: 'bold', px: 3, '&:hover': { bgcolor: COLORS.ctaHover } }}>
          {saving ? 'Registering...' : 'Register Client'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
