import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, FormControlLabel, Switch, Typography, Button, Grid, Box, InputAdornment } from '@mui/material';

// Design Tokens
import { FONT, COLORS } from '../../../theme/designTokens';

// Icons
import PetsIcon from '@mui/icons-material/Pets';
import SaveIcon from '@mui/icons-material/Save';

export default function AddPetModal({ open, onClose, ownerName, newPetData, setNewPetData, onSubmit }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}>
        <DialogTitle sx={{ bgcolor: COLORS.accent, color: 'white', fontFamily: FONT, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PetsIcon /> Register Pet for {ownerName}
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: COLORS.surface, p: 3 }}>
            <Box sx={{ mt: 1 }}>
              <Grid container spacing={2}>
                  <Grid item xs={12} md={8}>
                    <TextField autoFocus label="Pet Name" fullWidth size="small" required
                      value={newPetData.name} onChange={(e)=>setNewPetData({...newPetData, name:e.target.value})}
                      sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField select label="Species" fullWidth size="small"
                      value={newPetData.species} onChange={(e)=>setNewPetData({...newPetData, species:e.target.value})}
                      sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}>
                      <MenuItem value="Canine">🐶 Canine</MenuItem>
                      <MenuItem value="Feline">🐱 Feline</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField label="Breed" fullWidth size="small"
                      value={newPetData.breed} onChange={(e)=>setNewPetData({...newPetData, breed:e.target.value})}
                      sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField label="Color / Markings" fullWidth size="small"
                      value={newPetData.color} onChange={(e)=>setNewPetData({...newPetData, color:e.target.value})}
                      sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField select label="Sex" fullWidth size="small"
                      value={newPetData.gender} onChange={(e)=>setNewPetData({...newPetData, gender:e.target.value})}
                      sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}>
                      <MenuItem value="Male">Male</MenuItem>
                      <MenuItem value="Female">Female</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField type="date" label="Birthday" fullWidth size="small"
                      InputLabelProps={{shrink: true}}
                      value={newPetData.dob} onChange={(e)=>setNewPetData({...newPetData, dob:e.target.value})}
                      sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
                  </Grid>
                  {/* --- NEW FIELDS --- */}
                  <Grid item xs={12} md={6}>
                    <TextField label="Weight" fullWidth size="small" type="number"
                      value={newPetData.lastWeight || ''} onChange={(e)=>setNewPetData({...newPetData, lastWeight: e.target.value})}
                      InputProps={{ endAdornment: <InputAdornment position="end"><Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textMuted }}>kg</Typography></InputAdornment> }}
                      sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField label="Microchip Number" fullWidth size="small"
                      value={newPetData.microchip} onChange={(e)=>setNewPetData({...newPetData, microchip:e.target.value})}
                      sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField label="Known Allergies" fullWidth size="small" placeholder="e.g., Chicken protein, Amoxicillin — or type 'None'"
                      value={newPetData.allergies} onChange={(e)=>setNewPetData({...newPetData, allergies:e.target.value})}
                      sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }} />
                  </Grid>
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={<Switch checked={newPetData.isNeutered} onChange={(e)=>setNewPetData({...newPetData, isNeutered:e.target.checked})} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.success }, '& .MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track': { bgcolor: COLORS.success } }} />}
                      label={<Typography sx={{ fontFamily: FONT, fontWeight: 700, color: newPetData.isNeutered ? COLORS.success : COLORS.textSecondary }}>{newPetData.gender === 'Female' ? 'Spayed' : 'Neutered'}</Typography>}
                    />
                  </Grid>
              </Grid>
            </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: COLORS.surfaceAlt, gap: 1 }}>
            <Button onClick={onClose} sx={{ fontFamily: FONT, color: COLORS.textMuted }}>Cancel</Button>
            <Button onClick={onSubmit} variant="contained" startIcon={<SaveIcon />}
              sx={{ fontFamily: FONT, bgcolor: COLORS.accent, fontWeight: 'bold', px: 3, '&:hover': { bgcolor: COLORS.brand } }}>
              Save Profile
            </Button>
        </DialogActions>
    </Dialog>
  );
}