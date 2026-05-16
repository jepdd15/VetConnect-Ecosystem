import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, FormControlLabel, Switch, Typography, Button, Grid, Box, InputAdornment, Autocomplete, ToggleButtonGroup, ToggleButton, Chip } from '@mui/material';
import { BREED_CATALOG } from '../../../constants/breedConstants';
import { doc, updateDoc, Timestamp, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

// Design Tokens
import { FONT, COLORS } from '../../../theme/designTokens';

// Icons
import PetsIcon from '@mui/icons-material/Pets';
import SaveIcon from '@mui/icons-material/Save';
import CakeIcon from '@mui/icons-material/Cake';
import WarningIcon from '@mui/icons-material/Warning';

export default function EditPetModal({ open, onClose, pet }) {
  const [form, setForm] = useState({
    name: '', breed: '', species: 'Canine', gender: 'Male',
    dob: '', color: '', isNeutered: false,
    allergies: 'None', lastWeight: '',
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
        lastWeight: pet.lastWeight || '',
      });
      setError('');
    }
  }, [pet?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <Dialog 
      open={open} 
      onClose={() => onClose(false)} 
      maxWidth="sm" 
      fullWidth 
      PaperProps={{ 
        sx: { 
          borderRadius: 0, 
          overflow: 'hidden', 
          border: `2px solid ${COLORS.textPrimary}`,
          bgcolor: '#F5F5F5', 
          boxShadow: `4px 4px 0px #000, 8px 8px 0px #FFF, 12px 12px 0px #000`
        } 
      }}
    >
      <DialogTitle sx={{ bgcolor: COLORS.accent, color: 'white', fontFamily: FONT, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: `2px solid ${COLORS.textPrimary}`, py: 2.5 }}>
        <PetsIcon /> EDIT PATIENT PROFILE: {form.name.toUpperCase()}
      </DialogTitle>
      
      <DialogContent sx={{ p: 4 }}>
        <Box sx={{ mt: 1 }}>
          <Grid container spacing={4}>
            {/* IDENTITY BLOCK */}
            <Grid size={{ xs: 12 }}>
              <Box sx={{ 
                p: 3, 
                border: `2px solid ${COLORS.textPrimary}`, 
                bgcolor: '#FDFCF0', 
                transform: 'rotate(-0.4deg)', 
                position: 'relative',
                boxShadow: `4px 4px 0px ${COLORS.borderInput}`
              }}>
                <Box sx={{ position: 'absolute', top: 12, left: 12, width: 8, height: 8, borderRadius: '50%', border: `1.5px solid ${COLORS.textPrimary}`, bgcolor: '#F5F5F5' }} />
                
                <Box sx={{ 
                  display: 'inline-block', 
                  bgcolor: COLORS.textPrimary, 
                  color: 'white', 
                  px: 1.5, 
                  py: 0.25, 
                  mb: 2, 
                  ml: -3.2,
                  border: `2px solid ${COLORS.textPrimary}`,
                  borderLeft: 'none'
                }}>
                  <Typography variant="caption" sx={{ fontFamily: FONT, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>
                    01 IDENTITY
                  </Typography>
                </Box>
                
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12 }}>
                    <TextField 
                      autoFocus 
                      label="PET NAME" 
                      fullWidth 
                      size="small" 
                      required
                      value={form.name} 
                      onChange={(e) => setForm({...form, name: e.target.value})}
                      error={!!error && !form.name.trim()}
                      sx={{ 
                        bgcolor: 'white', 
                        '& .MuiOutlinedInput-root': { 
                          fontFamily: FONT, borderRadius: 0, fontWeight: 900,
                          '& fieldset': { border: `2px solid ${COLORS.textPrimary}` },
                          '&:hover fieldset': { borderColor: COLORS.textPrimary },
                          '&.Mui-focused fieldset': { borderColor: COLORS.textPrimary, boxShadow: `4px 4px 0px ${COLORS.textPrimary}` },
                          transition: 'all 0.1s'
                        } 
                      }} 
                    />
                  </Grid>
                  
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="caption" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.textPrimary, mb: 0.5, display: 'block' }}>SPECIES</Typography>
                    <ToggleButtonGroup
                      value={form.species}
                      exclusive
                      fullWidth
                      size="small"
                      onChange={(e, v) => v && setForm({...form, species: v, breed: ''})}
                      sx={{
                        '& .MuiToggleButton-root': {
                          borderRadius: 0,
                          border: `2px solid ${COLORS.textPrimary}`,
                          fontFamily: FONT,
                          fontWeight: 900,
                          height: 40,
                          bgcolor: 'white',
                          '&.Mui-selected': { bgcolor: '#FF9100', color: COLORS.textPrimary, '&:hover': { bgcolor: '#FFAB40' } }
                        }
                      }}
                    >
                      <ToggleButton value="Canine">DOG</ToggleButton>
                      <ToggleButton value="Feline">CAT</ToggleButton>
                    </ToggleButtonGroup>
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="caption" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.textPrimary, mb: 0.5, display: 'block' }}>BREED</Typography>
                    <Autocomplete
                      freeSolo
                      options={BREED_CATALOG[form.species] || []}
                      value={form.breed || ''}
                      onChange={(_, v) => setForm({...form, breed: v || ''})}
                      onInputChange={(_, v, reason) => { if (reason === 'input') setForm({...form, breed: v}); }}
                      componentsProps={{ paper: { sx: { borderRadius: 0, border: `2px solid ${COLORS.textPrimary}`, boxShadow: `6px 6px 0px ${COLORS.borderInput}` } } }}
                      renderInput={(params) => (
                        <TextField 
                          {...params} 
                          label="" 
                          placeholder="Select or type breed"
                          fullWidth 
                          size="small"
                          sx={{ 
                            bgcolor: 'white', 
                            '& .MuiOutlinedInput-root': { 
                              fontFamily: FONT, borderRadius: 0, fontWeight: 900, height: 40,
                              '& fieldset': { border: `2px solid ${COLORS.textPrimary}` }
                            } 
                          }} 
                        />
                      )}
                    />
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <TextField 
                      label="COLOR / MARKINGS" 
                      fullWidth 
                      size="small"
                      value={form.color} 
                      onChange={(e) => setForm({...form, color: e.target.value})}
                      sx={{ 
                        bgcolor: 'white', 
                        '& .MuiOutlinedInput-root': { 
                          fontFamily: FONT, borderRadius: 0, fontWeight: 900,
                          '& fieldset': { border: `2px solid ${COLORS.textPrimary}` }
                        } 
                      }} 
                    />
                  </Grid>
                  
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="caption" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.textPrimary, mb: 0.5, display: 'block' }}>SEX</Typography>
                    <ToggleButtonGroup
                      value={form.gender}
                      exclusive
                      fullWidth
                      size="small"
                      onChange={(e, v) => v && setForm({...form, gender: v})}
                      sx={{
                        '& .MuiToggleButton-root': {
                          borderRadius: 0,
                          border: `2px solid ${COLORS.textPrimary}`,
                          fontFamily: FONT,
                          fontWeight: 900,
                          bgcolor: 'white',
                          color: COLORS.textPrimary,
                          '&.Mui-selected': { 
                            color: 'white',
                            boxShadow: 'inset 4px 4px 0px rgba(0,0,0,0.1)',
                          }
                        }
                      }}
                    >
                      <ToggleButton 
                        value="Male"
                        sx={{ 
                          '&.Mui-selected': { 
                            bgcolor: '#90CAF9!important', 
                            '&:hover': { bgcolor: '#42A5F5!important' } 
                          } 
                        }}
                      >
                        MALE
                      </ToggleButton>
                      <ToggleButton 
                        value="Female"
                        sx={{ 
                          '&.Mui-selected': { 
                            bgcolor: '#F48FB1!important', 
                            '&:hover': { bgcolor: '#EC407A!important' } 
                          } 
                        }}
                      >
                        FEMALE
                      </ToggleButton>
                    </ToggleButtonGroup>

                    <Box sx={{ mt: 1.5, p: 1, border: `2px solid ${COLORS.textPrimary}`, display: 'inline-flex', alignItems: 'center', bgcolor: form.isNeutered ? `${COLORS.success}22` : 'white', width: '100%' }}>
                      <FormControlLabel
                        control={<Switch size="small" checked={form.isNeutered} onChange={(e) => setForm({...form, isNeutered: e.target.checked})} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.success }, '& .MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track': { bgcolor: COLORS.success } }} />}
                        label={
                          <Typography sx={{ fontFamily: FONT, fontWeight: 900, textTransform: 'uppercase', fontSize: '0.75rem', color: form.isNeutered ? COLORS.success : COLORS.textPrimary }}>
                            {form.gender === 'Female' ? 'SPAYED STATUS' : 'NEUTERED STATUS'}
                          </Typography>
                        }
                        sx={{ ml: 0 }}
                      />
                    </Box>

                    <Box sx={{ mt: 1.5 }}>
                      <TextField 
                        label="BODY WEIGHT" 
                        fullWidth size="small" type="number"
                        value={form.lastWeight || ''} 
                        onChange={(e) => setForm({...form, lastWeight: e.target.value})}
                        InputProps={{ 
                          endAdornment: <InputAdornment position="end"><Typography sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.8rem', color: COLORS.textPrimary }}>KG</Typography></InputAdornment> 
                        }}
                        sx={{ 
                          bgcolor: 'white', 
                          '& .MuiOutlinedInput-root': { 
                            fontFamily: FONT, borderRadius: 0, fontWeight: 900,
                            '& fieldset': { border: `2px solid ${COLORS.textPrimary}` }
                          } 
                        }} 
                      />
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            </Grid>

            {/* TEMPORAL BLOCK */}
            <Grid size={{ xs: 12 }}>
              <Box sx={{ 
                p: 3, 
                border: `2px solid ${COLORS.textPrimary}`, 
                bgcolor: '#FDFCF0', 
                transform: 'rotate(0.3deg)', 
                position: 'relative',
                boxShadow: `4px 4px 0px ${COLORS.borderInput}`
              }}>
                <Box sx={{ position: 'absolute', top: 12, left: 12, width: 8, height: 8, borderRadius: '50%', border: `1.5px solid ${COLORS.textPrimary}`, bgcolor: '#F5F5F5' }} />
                
                <Box sx={{ 
                  display: 'inline-block', 
                  bgcolor: COLORS.accent, 
                  color: 'white', 
                  px: 1.5, 
                  py: 0.25, 
                  mb: 2, 
                  ml: -3.2,
                  border: `2px solid ${COLORS.textPrimary}`,
                  borderLeft: 'none'
                }}>
                  <Typography variant="caption" sx={{ fontFamily: FONT, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>
                    02 AGE
                  </Typography>
                </Box>
                
                <Box sx={{ mb: 2 }}>
                  <ToggleButtonGroup
                    size="small"
                    value={form.dobMode}
                    exclusive
                    fullWidth
                    onChange={(_, val) => val && setForm({ ...form, dobMode: val })}
                    sx={{ 
                      height: 40,
                      '& .MuiToggleButton-root': {
                        borderRadius: 0,
                        border: `2px solid ${COLORS.textPrimary}`,
                        fontFamily: FONT,
                        fontWeight: 900,
                        px: 2,
                        bgcolor: 'white',
                        '&.Mui-selected': { bgcolor: '#FF9100', color: COLORS.textPrimary, '&:hover': { bgcolor: '#FFAB40' } }
                      }
                    }}
                  >
                    <ToggleButton value="exact">EXACT</ToggleButton>
                    <ToggleButton value="approximate">ESTIMATE</ToggleButton>
                    <ToggleButton value="unknown">UNKNOWN</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                
                {form.dobMode === 'exact' && (
                  <TextField 
                    size="small" type="date" label="PET BIRTHDAY" fullWidth
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ max: new Date().toISOString().split('T')[0] }}
                    value={form.dob}
                    onChange={(e) => setForm({ ...form, dob: e.target.value })}
                    sx={{ 
                      bgcolor: 'white', 
                      '& .MuiOutlinedInput-root': { 
                        fontFamily: FONT, borderRadius: 0, fontWeight: 900,
                        '& fieldset': { border: `2px solid ${COLORS.textPrimary}` }
                      } 
                    }}
                  />
                )}
                
                {form.dobMode === 'approximate' && (
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField 
                      size="small" label="YEARS" type="number" fullWidth
                      value={form.estYears}
                      onChange={(e) => setForm({ ...form, estYears: e.target.value })}
                      sx={{ 
                        bgcolor: 'white', 
                        '& .MuiOutlinedInput-root': { 
                          fontFamily: FONT, borderRadius: 0, fontWeight: 900,
                          '& fieldset': { border: `2px solid ${COLORS.textPrimary}` }
                        } 
                      }}
                    />
                    <TextField 
                      size="small" label="MONTHS" type="number" fullWidth
                      value={form.estMonths}
                      onChange={(e) => setForm({ ...form, estMonths: e.target.value })}
                      sx={{ 
                        bgcolor: 'white', 
                        '& .MuiOutlinedInput-root': { 
                          fontFamily: FONT, borderRadius: 0, fontWeight: 900,
                          '& fieldset': { border: `2px solid ${COLORS.textPrimary}` }
                        } 
                      }}
                    />
                  </Box>
                )}
                
                {form.dobMode === 'unknown' && (
                  <Box sx={{ p: 1.5, border: `2px dashed ${COLORS.textMuted}`, bgcolor: 'white' }}>
                    <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textPrimary, fontWeight: 900, textTransform: 'uppercase' }}>
                      Clinical verification required during physical examination.
                    </Typography>
                  </Box>
                )}
              </Box>
            </Grid>

            {/* VITALS & RISK BLOCK */}
            <Grid size={{ xs: 12 }}>
              <Box sx={{ 
                p: 3, 
                border: `2px solid ${COLORS.textPrimary}`, 
                bgcolor: '#FDFCF0', 
                transform: 'rotate(-0.2deg)', 
                position: 'relative',
                boxShadow: `4px 4px 0px ${COLORS.borderInput}`
              }}>
                <Box sx={{ position: 'absolute', top: 12, left: 12, width: 8, height: 8, borderRadius: '50%', border: `1.5px solid ${COLORS.textPrimary}`, bgcolor: '#F5F5F5' }} />
                
                <Box sx={{ 
                  display: 'inline-block', 
                  bgcolor: COLORS.brand, 
                  color: 'white', 
                  px: 1.5, 
                  py: 0.25, 
                  mb: 2, 
                  ml: -3.2,
                  border: `2px solid ${COLORS.textPrimary}`,
                  borderLeft: 'none'
                }}>
                  <Typography variant="caption" sx={{ fontFamily: FONT, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>
                    03 MEDICAL ALLERGIES
                  </Typography>
                </Box>
                
                <Grid container spacing={2}>
                  {/* DANGER ZONE: ALLERGIES */}
                  <Grid size={{ xs: 12 }}>
                    <Box sx={{ 
                      p: 2, 
                      border: `2px solid ${form.showAllergyInput ? COLORS.danger : COLORS.textPrimary}`, 
                      bgcolor: form.showAllergyInput ? COLORS.dangerSurface : 'white',
                      transition: 'all 0.2s'
                    }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: form.showAllergyInput ? 2 : 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <WarningIcon sx={{ color: form.showAllergyInput ? COLORS.danger : COLORS.textPrimary, fontSize: 18 }} />
                          <Typography sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.8rem', color: form.showAllergyInput ? COLORS.danger : COLORS.textPrimary, textTransform: 'uppercase' }}>
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
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                            {form.allergyArray.map((allergy, i) => (
                              <Chip
                                key={i}
                                label={allergy.toUpperCase()}
                                onDelete={() => setForm({
                                  ...form,
                                  allergyArray: form.allergyArray.filter((_, idx) => idx !== i),
                                })}
                                sx={{ 
                                  bgcolor: COLORS.danger, 
                                  color: 'white', 
                                  fontWeight: 900, 
                                  fontSize: '0.75rem', 
                                  borderRadius: 0, 
                                  border: `2px solid ${COLORS.textPrimary}`,
                                  '& .MuiChip-deleteIcon': { color: 'white!important', opacity: 1 } 
                                }}
                              />
                            ))}
                            {form.allergyArray.length === 0 && (
                              <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.danger, fontWeight: 900, textTransform: 'uppercase' }}>
                                NO ALLERGENS RECORDED
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
                              sx={{ 
                                bgcolor: 'white', 
                                '& .MuiOutlinedInput-root': { 
                                  fontFamily: FONT, borderRadius: 0, fontWeight: 900,
                                  '& fieldset': { border: `2px solid ${COLORS.textPrimary}` }
                                } 
                              }}
                            />
                            <Button
                              variant="contained"
                              disabled={!form.currentAllergyInput.trim()}
                              onClick={() => setForm({
                                ...form,
                                allergyArray: [...form.allergyArray, form.currentAllergyInput.trim()],
                                currentAllergyInput: '',
                              })}
                              sx={{ 
                                fontFamily: FONT, fontWeight: 900, minWidth: 48, borderRadius: 0, 
                                bgcolor: COLORS.danger, border: `2px solid ${COLORS.textPrimary}`,
                                boxShadow: `3px 3px 0px ${COLORS.textPrimary}`,
                                '&:hover': { bgcolor: COLORS.dangerHover, transform: 'translate(-1px, -1px)', boxShadow: `4px 4px 0px ${COLORS.textPrimary}` }
                              }}
                            >+</Button>
                          </Box>
                        </>
                      )}
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 3, bgcolor: COLORS.surfaceAlt, gap: 2, borderTop: `2px solid ${COLORS.textPrimary}` }}>
          <Button 
            onClick={() => onClose(false)} 
            sx={{ 
              fontFamily: FONT, 
              color: COLORS.textPrimary, 
              fontWeight: 900,
              borderRadius: 0,
              border: `2px solid ${COLORS.textPrimary}`,
              px: 3,
              '&:hover': { bgcolor: COLORS.borderLight }
            }}
          >
            CANCEL
          </Button>
          <Button 
            onClick={handleSave} 
            variant="contained" 
            disabled={saving}
            startIcon={<SaveIcon />}
            sx={{ 
              fontFamily: FONT, 
              bgcolor: '#FF9100', 
              color: COLORS.textPrimary,
              fontWeight: 900, 
              px: 4, 
              borderRadius: 0,
              border: `2px solid ${COLORS.textPrimary}`,
              boxShadow: `4px 4px 0px ${COLORS.textPrimary}`,
              '&:hover': { bgcolor: '#FFAB40', transform: 'translate(-1px, -1px)', boxShadow: `6px 6px 0px ${COLORS.textPrimary}` } 
            }}
          >
            {saving ? 'SAVING...' : 'SAVE CHANGES'}
          </Button>
      </DialogActions>
    </Dialog>
  );
}
