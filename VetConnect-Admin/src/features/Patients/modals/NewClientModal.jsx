import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Button, Grid, Box, Typography, Divider } from '@mui/material';
import { collection, addDoc, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

// Design Tokens
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';

// Icons
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SaveIcon from '@mui/icons-material/Save';
import PetsIcon from '@mui/icons-material/Pets';

export default function NewClientModal({ open, onClose }) {
  const [form, setForm] = useState({
    fullName: '', phone: '', email: '',
    address: '', city: '',
    referredBy: '',  // T2.136
  });
  const [petForm, setPetForm] = useState({
    name: '', species: 'Canine',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState([]);
  const [showDupeWarning, setShowDupeWarning] = useState(false);

  const resetForms = () => {
    setForm({ fullName: '', phone: '', email: '', address: '', city: '', clientTag: 'Regular', referredBy: '' });
    setPetForm({ name: '', species: 'Canine' });
    setError('');
    setDuplicates([]);
    setShowDupeWarning(false);
  };

  const handleSave = async (forceCreate = false) => {
    // Validation
    if (!form.fullName.trim()) { setError('Client name is required.'); return; }
    if (!form.phone.trim()) { setError('Phone number is required.'); return; }

    // Duplicate phone check — skip if staff already confirmed via override
    if (!forceCreate) {
      setSaving(true);
      const phoneQ = query(
        collection(db, 'users'),
        where('phone', '==', form.phone.trim()),
        where('role', '==', 'pet_owner'),
      );
      const phoneSnap = await getDocs(phoneQ);
      if (!phoneSnap.empty) {
        setDuplicates(phoneSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setShowDupeWarning(true);
        setSaving(false);
        return;
      }
    }

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
        referredBy: form.referredBy.trim() || null,  // T2.136
        role: 'pet_owner',
        accountStatus: 'admin_registered',   // no Firebase Auth account — guest-client pattern
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
          petAllergies: 'None',   // canonical field
          allergies: 'None',      // legacy alias
          status: 'active',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
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
    <Dialog open={open} onClose={() => { resetForms(); onClose(false); }} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 0, overflow: 'hidden' } }}>
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
            <Grid item xs={12}>
              <TextField autoFocus label="Full Name" fullWidth size="small" required
                value={form.fullName} onChange={(e) => setForm({...form, fullName: e.target.value})}
                error={!!error && !form.fullName.trim()} helperText={!form.fullName.trim() && error ? 'Required' : ''}
                sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
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
            {/* T2.136: Referred by — who sent this client */}
            <Grid item xs={12}>
              <TextField label="Referred by (Optional)" fullWidth size="small" placeholder="Name of referring client or source"
                value={form.referredBy} onChange={(e) => setForm({...form, referredBy: e.target.value})}
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

          {/* Step 8.5 (T3.5): Remind staff that DPA consent is a separate step.
              Admin-registered clients have no mobile account and cannot self-consent via the app.
              The "Record Consent" button on the client profile is their only path. */}
          <Box sx={{ bgcolor: COLORS.warningSurface, border: `1px solid ${COLORS.warning}`, borderRadius: 0, px: 2, py: 1.25, mt: 2 }}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.warning }}>
              Note: DPA consent must be recorded separately after client creation.
              Use the "Record Consent" button on the client profile.
            </Typography>
          </Box>

          {error && form.fullName.trim() && form.phone.trim() && (
            <Typography sx={{ fontFamily: FONT, color: COLORS.danger, fontSize: '0.8rem', mt: 2, fontWeight: 600 }}>{error}</Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, bgcolor: COLORS.surfaceAlt, gap: 1 }}>
        <Button onClick={() => { resetForms(); onClose(false); }} sx={{ fontFamily: FONT, color: COLORS.textMuted }}>Cancel</Button>
        <Button onClick={() => handleSave(false)} variant="contained" disabled={saving} startIcon={<SaveIcon />}
          sx={{ fontFamily: FONT, bgcolor: COLORS.cta, fontWeight: 'bold', px: 3, '&:hover': { bgcolor: COLORS.ctaHover } }}>
          {saving ? 'Registering...' : 'Register Client'}
        </Button>
      </DialogActions>

      {/* Duplicate Phone Warning */}
      <Dialog open={showDupeWarning} onClose={() => setShowDupeWarning(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.warning }}>
          Possible Duplicate Client
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', mb: 2 }}>
            A client with phone number <strong>{form.phone}</strong> already exists:
          </Typography>
          {duplicates.map(d => (
            <Box key={d.id} sx={{ p: 1.5, mb: 1, bgcolor: COLORS.surfaceAlt, border: `1px solid ${COLORS.borderLight}` }}>
              <Typography sx={{ fontFamily: FONT, fontWeight: 700 }}>{d.fullName}</Typography>
              <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted }}>{d.phone}</Typography>
            </Box>
          ))}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setShowDupeWarning(false)} sx={{ fontFamily: FONT, color: COLORS.textMuted }}>
            Go Back
          </Button>
          <Button
            variant="contained"
            onClick={() => { setShowDupeWarning(false); handleSave(true); }}
            sx={{ fontFamily: FONT, bgcolor: COLORS.warning, fontWeight: 'bold', '&:hover': { bgcolor: COLORS.ctaHover } }}
          >
            Create Anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
