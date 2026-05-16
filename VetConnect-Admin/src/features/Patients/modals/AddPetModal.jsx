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
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="sm" 
      fullWidth 
      PaperProps={{ 
        sx: { 
          borderRadius: 0, 
          overflow: 'hidden', 
          border: `2px solid ${COLORS.textPrimary}`,
          bgcolor: '#F5F5F5', // The "Desk" background
          boxShadow: `4px 4px 0px #000, 8px 8px 0px #FFF, 12px 12px 0px #000` // Stacked paper effect
        } 
      }}
    >
        <DialogTitle sx={{ bgcolor: COLORS.accent, color: 'white', fontFamily: FONT, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: `2px solid ${COLORS.textPrimary}`, py: 2.5 }}>
          <PetsIcon /> REGISTER PET FOR {ownerName.toUpperCase()}
        </DialogTitle>
        
        <DialogContent sx={{ p: 4 }}>
            <Box sx={{ mt: 1 }}>
              <Grid container spacing={4}>
                  {/* IDENTITY BLOCK */}
                  <Grid size={{ xs: 12 }}>
                    <Box sx={{ 
                      p: 3, 
                      border: `2px solid ${COLORS.textPrimary}`, 
                      bgcolor: '#FDFCF0', // Aged Paper
                      transform: 'rotate(-0.4deg)', // Organic Tilt
                      position: 'relative',
                      boxShadow: `4px 4px 0px ${COLORS.borderInput}`
                    }}>
                      {/* Punched Hole */}
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
                            id="pet-name-input"
                            name="petName"
                            label="PET NAME" 
                            fullWidth 
                            size="small" 
                            required
                            value={newPetData.name} onChange={(e)=>setNewPetData({...newPetData, name:e.target.value})}
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
                            id="species-select"
                            value={newPetData.species}
                            exclusive
                            fullWidth
                            size="small"
                            onChange={(e, v) => v && setNewPetData({...newPetData, species: v, breed: ''})}
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
                            options={BREED_CATALOG[newPetData.species] || []}
                            value={newPetData.breed || ''}
                            onChange={(_, v) => setNewPetData({...newPetData, breed: v || ''})}
                            onInputChange={(_, v, reason) => { if (reason === 'input') setNewPetData({...newPetData, breed: v}); }}
                            componentsProps={{ paper: { sx: { borderRadius: 0, border: `2px solid ${COLORS.textPrimary}`, boxShadow: `6px 6px 0px ${COLORS.borderInput}` } } }}
                            renderInput={(params) => (
                              <TextField 
                                {...params} 
                                id="breed-autocomplete-input"
                                name="breed"
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
                            id="color-markings-input"
                            name="color"
                            label="COLOR / MARKINGS" 
                            fullWidth 
                            size="small"
                            value={newPetData.color} onChange={(e)=>setNewPetData({...newPetData, color:e.target.value})}
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
                            id="sex-select"
                            value={newPetData.gender}
                            exclusive
                            fullWidth
                            size="small"
                            onChange={(e, v) => v && setNewPetData({...newPetData, gender: v})}
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

                          <Box sx={{ mt: 1.5, p: 1, border: `2px solid ${COLORS.textPrimary}`, display: 'inline-flex', alignItems: 'center', bgcolor: newPetData.isNeutered ? `${COLORS.success}22` : 'white', width: '100%' }}>
                            <FormControlLabel
                              control={<Switch size="small" checked={newPetData.isNeutered} onChange={(e)=>setNewPetData({...newPetData, isNeutered:e.target.checked})} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.success }, '& .MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track': { bgcolor: COLORS.success } }} />}
                              label={
                                <Typography sx={{ fontFamily: FONT, fontWeight: 900, textTransform: 'uppercase', fontSize: '0.75rem', color: newPetData.isNeutered ? COLORS.success : COLORS.textPrimary }}>
                                  {newPetData.gender === 'Female' ? 'SPAYED STATUS' : 'NEUTERED STATUS'}
                                </Typography>
                              }
                              sx={{ ml: 0 }}
                            />
                          </Box>

                          <Box sx={{ mt: 1.5 }}>
                            <TextField 
                              id="weight-input"
                              name="lastWeight"
                              label="BODY WEIGHT" fullWidth size="small" type="number"
                              value={newPetData.lastWeight || ''} onChange={(e)=>setNewPetData({...newPetData, lastWeight: e.target.value})}
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
                          value={newPetData.dobMode}
                          exclusive
                          fullWidth
                          onChange={(_, val) => val && setNewPetData({ ...newPetData, dobMode: val })}
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
                      
                      {newPetData.dobMode === 'exact' && (
                        <TextField 
                          id="pet-birthday-input"
                          name="dob"
                          size="small" type="date" label="PET BIRTHDAY" fullWidth
                          InputLabelProps={{ shrink: true }}
                          inputProps={{ max: new Date().toISOString().split('T')[0] }}
                          value={newPetData.dob}
                          onChange={(e) => setNewPetData({ ...newPetData, dob: e.target.value })}
                          sx={{ 
                            bgcolor: 'white', 
                            '& .MuiOutlinedInput-root': { 
                              fontFamily: FONT, borderRadius: 0, fontWeight: 900,
                              '& fieldset': { border: `2px solid ${COLORS.textPrimary}` }
                            } 
                          }}
                        />
                      )}
                      
                      {newPetData.dobMode === 'approximate' && (
                        <Box sx={{ display: 'flex', gap: 2 }}>
                          <TextField 
                            id="est-years-input"
                            name="estYears"
                            size="small" label="YEARS" type="number" fullWidth
                            value={newPetData.estYears}
                            onChange={(e) => setNewPetData({ ...newPetData, estYears: e.target.value })}
                            sx={{ 
                              bgcolor: 'white', 
                              '& .MuiOutlinedInput-root': { 
                                fontFamily: FONT, borderRadius: 0, fontWeight: 900,
                                '& fieldset': { border: `2px solid ${COLORS.textPrimary}` }
                              } 
                            }}
                          />
                          <TextField 
                            id="est-months-input"
                            name="estMonths"
                            size="small" label="MONTHS" type="number" fullWidth
                            value={newPetData.estMonths}
                            onChange={(e) => setNewPetData({ ...newPetData, estMonths: e.target.value })}
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
                      
                      {newPetData.dobMode === 'unknown' && (
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
                            border: `2px solid ${newPetData.showAllergyInput ? COLORS.danger : COLORS.textPrimary}`, 
                            bgcolor: newPetData.showAllergyInput ? COLORS.dangerSurface : 'white',
                            transition: 'all 0.2s'
                          }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: newPetData.showAllergyInput ? 2 : 0 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <WarningIcon sx={{ color: newPetData.showAllergyInput ? COLORS.danger : COLORS.textPrimary, fontSize: 18 }} />
                                <Typography sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.8rem', color: newPetData.showAllergyInput ? COLORS.danger : COLORS.textPrimary, textTransform: 'uppercase' }}>
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
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                                  {newPetData.allergyArray.map((allergy, i) => (
                                    <Chip
                                      key={i}
                                      label={allergy.toUpperCase()}
                                      onDelete={() => setNewPetData({
                                        ...newPetData,
                                        allergyArray: newPetData.allergyArray.filter((_, idx) => idx !== i),
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
                                  {newPetData.allergyArray.length === 0 && (
                                    <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.danger, fontWeight: 900, textTransform: 'uppercase' }}>
                                      NO ALLERGENS RECORDED
                                    </Typography>
                                  )}
                                </Box>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                  <TextField
                                    id="allergy-entry-input"
                                    name="currentAllergy"
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
                                    disabled={!newPetData.currentAllergyInput.trim()}
                                    onClick={() => setNewPetData({
                                      ...newPetData,
                                      allergyArray: [...newPetData.allergyArray, newPetData.currentAllergyInput.trim()],
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
              onClick={onClose} 
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
              onClick={onSubmit} 
              variant="contained" 
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
              SAVE PROFILE
            </Button>
        </DialogActions>
    </Dialog>
  );
}