import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, FormControlLabel, Switch, Typography, Button, Grid, Box, InputAdornment, Autocomplete, ToggleButtonGroup, ToggleButton, Chip } from '@mui/material';
import { BREED_CATALOG } from '../../../constants/breedConstants';

// Design Tokens
import { FONT, COLORS } from '../../../theme/designTokens';

// Icons
import PetsIcon from '@mui/icons-material/Pets';
import SaveIcon from '@mui/icons-material/Save';
import CakeIcon from '@mui/icons-material/Cake';
import WarningIcon from '@mui/icons-material/Warning';

export default function AddPetModal({ open, onClose, ownerName, newPetData, setNewPetData, onSubmit }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 0, overflow: 'hidden' } }}>
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
                      value={newPetData.species} onChange={(e)=>setNewPetData({...newPetData, species:e.target.value, breed:''})}
                      sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}>
                      <MenuItem value="Canine">🐶 Canine</MenuItem>
                      <MenuItem value="Feline">🐱 Feline</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Autocomplete
                      freeSolo
                      options={BREED_CATALOG[newPetData.species] || []}
                      value={newPetData.breed || ''}
                      onChange={(_, v) => setNewPetData({...newPetData, breed: v || ''})}
                      onInputChange={(_, v, reason) => { if (reason === 'input') setNewPetData({...newPetData, breed: v}); }}
                      componentsProps={{ paper: { sx: { borderRadius: 0, border: `1px solid ${COLORS.accent}` } } }}
                      renderInput={(params) => (
                        <TextField {...params} label="Breed" fullWidth size="small"
                          sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT, borderRadius: 0 } }} />
                      )}
                    />
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
                  <Grid item xs={12}>
                    <Box sx={{ p: 1, border: `1px dashed ${COLORS.borderLight}`, bgcolor: 'transparent' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
                        <CakeIcon sx={{ fontSize: 18, color: COLORS.accent }} />
                        <Typography sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.75rem', color: COLORS.accent }}>BIRTHDATE / AGE MODE</Typography>
                        <ToggleButtonGroup
                          size="small"
                          value={newPetData.dobMode}
                          exclusive
                          onChange={(_, val) => val && setNewPetData({ ...newPetData, dobMode: val })}
                          sx={{ ml: 'auto', height: 26 }}
                        >
                          <ToggleButton value="exact" sx={{ fontSize: '0.65rem', fontWeight: 900, px: 2, borderRadius: 0 }}>EXACT</ToggleButton>
                          <ToggleButton value="approximate" sx={{ fontSize: '0.65rem', fontWeight: 900, px: 2, borderRadius: 0 }}>ESTIMATE</ToggleButton>
                          <ToggleButton value="unknown" sx={{ fontSize: '0.65rem', fontWeight: 900, px: 2, borderRadius: 0 }}>UNKNOWN</ToggleButton>
                        </ToggleButtonGroup>
                      </Box>
                      {newPetData.dobMode === 'exact' && (
                        <TextField size="small" type="date" label="PET BIRTHDAY" fullWidth
                          InputLabelProps={{ shrink: true }}
                          inputProps={{ max: new Date().toISOString().split('T')[0] }}
                          value={newPetData.dob}
                          onChange={(e) => setNewPetData({ ...newPetData, dob: e.target.value })}
                          sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}
                        />
                      )}
                      {newPetData.dobMode === 'approximate' && (
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <TextField size="small" label="YEARS" type="number" fullWidth
                            value={newPetData.estYears}
                            onChange={(e) => setNewPetData({ ...newPetData, estYears: e.target.value })}
                            sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}
                          />
                          <TextField size="small" label="MONTHS" type="number" fullWidth
                            value={newPetData.estMonths}
                            onChange={(e) => setNewPetData({ ...newPetData, estMonths: e.target.value })}
                            sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}
                          />
                        </Box>
                      )}
                      {newPetData.dobMode === 'unknown' && (
                        <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted, fontStyle: 'italic', fontWeight: 700 }}>
                          Age will be determined by the veterinarian during the physical exam.
                        </Typography>
                      )}
                    </Box>
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
                    <Box sx={{ p: 1, border: '1.2px solid', borderColor: newPetData.showAllergyInput ? COLORS.danger : COLORS.borderLight, bgcolor: 'transparent' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: newPetData.showAllergyInput ? 1.5 : 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <WarningIcon sx={{ color: newPetData.showAllergyInput ? COLORS.danger : COLORS.borderLight, fontSize: 18 }} />
                          <Typography sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.78rem', color: newPetData.showAllergyInput ? COLORS.danger : COLORS.textMuted }}>
                            RECORD MEDICAL ALLERGIES?
                          </Typography>
                        </Box>
                        <Switch
                          size="small"
                          color="error"
                          checked={newPetData.showAllergyInput}
                          onChange={(e) => setNewPetData({
                            ...newPetData,
                            showAllergyInput: e.target.checked,
                            allergyArray: e.target.checked ? newPetData.allergyArray : [],
                          })}
                        />
                      </Box>
                      {newPetData.showAllergyInput && (
                        <>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                            {newPetData.allergyArray.map((allergy, i) => (
                              <Chip
                                key={i}
                                label={allergy.toUpperCase()}
                                onDelete={() => setNewPetData({
                                  ...newPetData,
                                  allergyArray: newPetData.allergyArray.filter((_, idx) => idx !== i),
                                })}
                                sx={{ bgcolor: COLORS.danger, color: 'white', fontWeight: 900, fontSize: '0.7rem', borderRadius: 0, '& .MuiChip-deleteIcon': { color: 'white!important', opacity: 0.8 } }}
                              />
                            ))}
                            {newPetData.allergyArray.length === 0 && (
                              <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.danger, fontStyle: 'italic', fontWeight: 800 }}>
                                No allergens added yet...
                              </Typography>
                            )}
                          </Box>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField
                              fullWidth size="small"
                              placeholder="Type allergy (e.g. Chicken, Amoxicillin)"
                              value={newPetData.currentAllergyInput}
                              onChange={(e) => setNewPetData({ ...newPetData, currentAllergyInput: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newPetData.currentAllergyInput.trim()) {
                                  e.preventDefault();
                                  setNewPetData({
                                    ...newPetData,
                                    allergyArray: [...newPetData.allergyArray, newPetData.currentAllergyInput.trim()],
                                    currentAllergyInput: '',
                                  });
                                }
                              }}
                              sx={{ bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { fontFamily: FONT } }}
                            />
                            <Button
                              variant="contained"
                              color="error"
                              disabled={!newPetData.currentAllergyInput.trim()}
                              onClick={() => setNewPetData({
                                ...newPetData,
                                allergyArray: [...newPetData.allergyArray, newPetData.currentAllergyInput.trim()],
                                currentAllergyInput: '',
                              })}
                              sx={{ fontFamily: FONT, fontWeight: 900, minWidth: 40, borderRadius: 0 }}
                            >+</Button>
                          </Box>
                        </>
                      )}
                    </Box>
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