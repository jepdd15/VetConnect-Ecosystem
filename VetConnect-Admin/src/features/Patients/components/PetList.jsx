import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Grid, Card, Avatar, Chip, Button,
  IconButton, Menu, MenuItem, ListItemIcon, Divider, Stack,
  ToggleButton, ToggleButtonGroup, Popover, TextField, InputAdornment,
  Paper, Collapse,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

// Design Tokens
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';

import PetsIcon from '@mui/icons-material/Pets';
import AssignmentIcon from '@mui/icons-material/Assignment';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ArchiveIcon from '@mui/icons-material/Archive';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EventNoteIcon from '@mui/icons-material/EventNote';
import FilterListIcon from '@mui/icons-material/FilterList';
import SortIcon from '@mui/icons-material/Sort';
import ScaleIcon from '@mui/icons-material/Scale';
import EditIcon from '@mui/icons-material/Edit';
import FavoriteIcon from '@mui/icons-material/Favorite';

export default function PetList({ pets, onRegisterPet, onQuickBook, calculatePetAge, onArchive, onEditPet, onRestore }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedPet, setSelectedPet] = useState(null);
  const navigate = useNavigate();

  // --- ADVANCED SORT & FILTER STATE ---
  const [sort, setSort] = useState('name_asc');
  const [filter, setFilter] = useState({ species: 'all', sex: 'all', status: 'all' });
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);

  // Archive confirmation dialog (T2.116)
  const [archiveConfirm, setArchiveConfirm] = useState(null); // pet object or null
  const [showArchived, setShowArchived] = useState(false);
  // T2.135: Deceased pet confirmation dialog
  const [deceasedConfirm, setDeceasedConfirm] = useState(null);

  const handleMenuClick = (event, pet) => { event.stopPropagation(); setSelectedPet(pet); setAnchorEl(event.currentTarget); };
  const handleMenuClose = () => { setAnchorEl(null); };

  // T2.135: Partition pets by status — deceased are memorial-only, not archived
  const activePets = pets.filter(p => p.status !== 'archived' && p.status !== 'deceased');
  const archivedPets = pets.filter(p => p.status === 'archived');
  const deceasedPets = pets.filter(p => p.status === 'deceased');

  // --- MULTI-AXIAL SORT & FILTER ENGINE ---
  const processedPets = useMemo(() => {
    let list = [...activePets];

    // 1. FILTERING
    if (filter.species !== 'all') {
      const SPECIES_ALIASES = { canine: ['canine', 'dog'], feline: ['feline', 'cat'] };
      const matches = SPECIES_ALIASES[filter.species] || [filter.species];
      list = list.filter(p => matches.includes((p.species || '').toLowerCase()));
    }
    if (filter.sex !== 'all') list = list.filter(p => (p.gender || '').toLowerCase() === filter.sex);
    if (filter.status === 'intact') list = list.filter(p => !p.isNeutered);
    if (filter.status === 'needs_vaccine') list = list.filter(p => {
        if (!p.lastVisit) return true;
        const daysSinceVisit = (new Date() - (p.lastVisit?.toDate?.() ?? new Date(p.lastVisit))) / (1000 * 60 * 60 * 24);
        return daysSinceVisit > 365; 
    });
    // T2.119: Filter using normalized allergy field (petAllergies canonical, allergies legacy).
    if (filter.status === 'has_allergy') list = list.filter(p => {
      const a = (p.petAllergies || p.allergies || '').trim();
      return a.length > 0 && !['None', 'none', 'None recorded'].includes(a);
    });

    // 2. SORTING
    switch (sort) {
      case 'age_asc': list.sort((a,b) => (a.dob?.toDate?.() ?? new Date(a.dob || 0)) > (b.dob?.toDate?.() ?? new Date(b.dob || 0)) ? -1 : 1); break;
      case 'age_desc': list.sort((a,b) => (a.dob?.toDate?.() ?? new Date(a.dob || 0)) < (b.dob?.toDate?.() ?? new Date(b.dob || 0)) ? -1 : 1); break;
      case 'last_visit_asc': list.sort((a,b) => (a.lastVisit?.toDate?.() ?? new Date(a.lastVisit || 0)) > (b.lastVisit?.toDate?.() ?? new Date(b.lastVisit || 0)) ? -1 : 1); break;
      case 'last_visit_desc': list.sort((a,b) => (a.lastVisit?.toDate?.() ?? new Date(a.lastVisit || 0)) < (b.lastVisit?.toDate?.() ?? new Date(b.lastVisit || 0)) ? -1 : 1); break;
      default: list.sort((a,b) => (a.name || '').localeCompare(b.name || '')); break;
    }
    return list;
  }, [activePets, filter, sort]);

  return (
    <Box sx={{ p: 4, bgcolor: 'transparent', flexGrow: 1 }}>
      
      {/* COMMAND CENTER HEADER */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="h5" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.textPrimary, display: 'flex', alignItems: 'center' }}>
            Registered Patients <Chip label={activePets.length} sx={{ ml: 1.5, fontFamily: FONT, fontWeight: 'bold', bgcolor: COLORS.cta, color: '#fff' }} />
          </Typography>
          <Button 
            variant="contained" size="small" startIcon={<PetsIcon />} 
            onClick={onRegisterPet} 
            sx={{ bgcolor: COLORS.cta, color: '#fff', fontFamily: FONT, fontWeight: 'bold', borderRadius: 2, boxShadow: `0 4px 12px ${COLORS.cta}33`, '&:hover': {bgcolor: COLORS.ctaHover} }}
          >
            Register Pet
          </Button>
        </Stack>

        <Stack direction="row" spacing={1.5} alignItems="center">
          {/* SORT DROPDOWN */}
          <TextField 
            select 
            value={sort} 
            onChange={(e) => setSort(e.target.value)} 
            size="small" 
            sx={{ minWidth: 200, fontFamily: FONT, bgcolor: COLORS.cardBg, borderRadius: 1, '& fieldset': { borderColor: COLORS.borderInput } }} 
            InputProps={{ startAdornment: <InputAdornment position="start"><SortIcon fontSize="small" sx={{ color: COLORS.textMuted }}/></InputAdornment> }}
          >
            <MenuItem value="name_asc">Sort: Name (A-Z)</MenuItem>
            <MenuItem value="age_desc">Sort: Age (Oldest First)</MenuItem>
            <MenuItem value="age_asc">Sort: Age (Youngest First)</MenuItem>
            <MenuItem value="last_visit_desc">Sort: Last Visit (Longest Ago)</MenuItem>
            <MenuItem value="last_visit_asc">Sort: Last Visit (Most Recent)</MenuItem>
          </TextField>
          
          {/* FILTER POPOVER BUTTON */}
          <Button 
            variant="outlined" 
            startIcon={<FilterListIcon/>} 
            onClick={(e) => setFilterAnchorEl(e.currentTarget)} 
            sx={{ fontFamily: FONT, color: COLORS.accent, borderColor: COLORS.timelineRail, bgcolor: COLORS.cardBg, fontWeight: 'bold', py: 0.8 }}
          >
            Filters
          </Button>
        </Stack>
      </Box>

      <Divider sx={{ mb: 3, borderColor: COLORS.borderLight }} />

      <Grid container spacing={3}>
        {processedPets.map(pet => {
          const rawAge = calculatePetAge(pet.dob);
          const displayAge = rawAge === 'Age TBD' || rawAge === '' ? 'Age Unknown' : rawAge;
          // T2.119: Normalize allergy reads — petAllergies (canonical) falls back to allergies (legacy).
          const resolvedAllergies = pet.petAllergies || pet.allergies || '';
          const hasAllergies = resolvedAllergies.trim().length > 0
            && !['None', 'None recorded', 'none'].includes(resolvedAllergies.trim());

          return (
            <Grid size={{ xs: 12, md: 6, lg: 6, xl: 4 }} key={pet.id}>
              <Card sx={{ 
                borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: `1px solid ${COLORS.borderLight}`,
                bgcolor: COLORS.cardBg,
                display: 'flex', flexDirection: 'column', height: '100%', transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }
              }}>
                
                {hasAllergies && (
                  <Box sx={{ bgcolor: COLORS.kpiRedBg, color: COLORS.danger, py: 0.5, px: 3, display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${COLORS.kpiRedBorder}` }}>
                    <WarningAmberIcon fontSize="small" />
                    <Typography variant="caption" sx={{ fontFamily: FONT, ...TYPE.label, letterSpacing: '0.05em' }}>Allergy: {resolvedAllergies}</Typography>
                  </Box>
                )}

                <Box sx={{ p: 3, pb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                    <Avatar sx={{ width: 64, height: 64, bgcolor: COLORS.panelBg, mr: 2, border: `2px solid ${COLORS.borderInput}`, fontSize: '2rem', boxShadow: 1 }}>
                      {(pet.species === 'Canine' || pet.species === 'Dog') ? '🐶' : '🐱'}
                    </Avatar>
                    
                    <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Typography variant="h5" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.textPrimary, textTransform: 'capitalize' }} noWrap>{pet.name}</Typography>
                          <IconButton size="small" onClick={(e) => handleMenuClick(e, pet)} sx={{ mt: -0.5, mr: -1 }}><MoreVertIcon /></IconButton>
                      </Box>
                      {(pet.breed && pet.breed !== 'Unknown Breed') ? (
                          <Typography variant="body2" sx={{ fontFamily: FONT, color: COLORS.textSecondary, fontWeight: 700 }} noWrap>{pet.breed}</Typography>
                      ) : (
                          <Typography variant="body2" sx={{ fontFamily: FONT, color: COLORS.cta, cursor: 'pointer', fontWeight: 'bold' }} onClick={() => onEditPet(pet)}>+ Add Breed</Typography>
                      )}
                      <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                        {pet.gender === 'Male' ? (pet.isNeutered ? 'Male (Neutered)' : 'Male (Intact)') : (pet.gender === 'Female' ? (pet.isNeutered ? 'Female (Spayed)' : 'Female (Intact)') : 'Unknown Sex')} 
                        {displayAge !== 'Age Unknown' ? ` • ${displayAge}` : <span style={{color: COLORS.cta, cursor:'pointer', fontWeight:'bold'}} onClick={() => onEditPet(pet)}> • + Add Age</span>}
                      </Typography>
                    </Box>
                  </Box>
                  
                  <Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, mb: 1.5 }}>
                      {pet.lastWeight && <Chip icon={<ScaleIcon fontSize="small"/>} label={`${pet.lastWeight} kg`} size="small" sx={{ fontFamily: FONT, bgcolor: COLORS.kpiOrangeBg, color: COLORS.warning, fontWeight: 'bold', border: `1px solid ${COLORS.kpiOrangeBorder}` }} />}
                      {pet.microchip && <Chip label="Microchipped" size="small" sx={{ fontFamily: FONT, bgcolor: COLORS.kpiBlueBg, color: COLORS.medical, fontWeight: 'bold', height: 24 }} />}
                    </Box>
                    <Paper variant="outlined" sx={{ bgcolor: COLORS.surfaceAlt, p: 1, borderRadius: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderColor: COLORS.borderLight }}>
                      <EventNoteIcon fontSize="small" sx={{ color: COLORS.textMuted }} />
                      <Typography variant="caption" sx={{ fontFamily: FONT, fontWeight: 'bold', color: COLORS.textSecondary }}>
                        Last Visit: {pet.lastVisit ? (pet.lastVisit?.toDate?.() ?? new Date(pet.lastVisit)).toLocaleDateString() : 'No history'}
                      </Typography>
                    </Paper>
                  </Box>
                </Box>

                <Box sx={{ p: 2, bgcolor: COLORS.surfaceAlt, borderTop: `1px solid ${COLORS.borderLight}`, mt: 'auto' }}>
                  <Stack direction="row" spacing={2} justifyContent="center">
                    <Button variant="contained" startIcon={<AssignmentIcon />} onClick={() => navigate(`/patients/${pet.id}`, { state: { pet } })} sx={{ bgcolor: COLORS.accent, fontFamily: FONT, color: 'white', fontWeight: 'bold', borderRadius: 2, boxShadow: 0, '&:hover': {bgcolor: COLORS.brand}, flex: 1 }}>
                      View Chart
                    </Button>
                    <Button variant="outlined" startIcon={<EventAvailableIcon />} onClick={() => onQuickBook(pet)} sx={{ fontFamily: FONT, color: COLORS.success, borderColor: COLORS.success, fontWeight: 'bold', borderRadius: 2, bgcolor: COLORS.cardBg, flex: 1 }}>
                      Book Visit
                    </Button>
                  </Stack>
                </Box>

              </Card>
            </Grid>
          );
        })}

        {processedPets.length === 0 && (
          <Grid size={{ xs: 12 }}>
            <Box sx={{ width: '100%', textAlign: 'center', py: 10, color: COLORS.textMuted, bgcolor: 'rgba(255,255,255,0.5)', borderRadius: 3, border: `2px dashed ${COLORS.timelineRail}` }}>
              <PetsIcon sx={{ fontSize: 70, mb: 2, color: COLORS.timelineRail }} />
              <Typography variant="h6" sx={{ fontFamily: FONT, fontWeight: 'bold', color: COLORS.accent }}>No Pets Found</Typography>
              <Typography variant="body2" sx={{ fontFamily: FONT, fontStyle: 'italic', color: COLORS.textMuted }}>Try adjusting your filters or register a new pet.</Typography>
            </Box>
          </Grid>
        )}
      </Grid>
      
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose} sx={{ '& .MuiPaper-root': { borderRadius: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}}>
        <MenuItem onClick={() => { onEditPet(selectedPet); handleMenuClose(); }} sx={{ py: 1.5, px: 2 }}>
            <ListItemIcon><EditIcon fontSize="small" sx={{ color: COLORS.textSecondary }}/></ListItemIcon>
            <Typography variant="body2" sx={{ fontFamily: FONT, fontWeight: 'bold' }}>Edit Pet Profile</Typography>
        </MenuItem>
        {/* T2.135: Mark as Deceased */}
        <MenuItem onClick={() => { setDeceasedConfirm(selectedPet); handleMenuClose(); }} sx={{ color: COLORS.textMuted, py: 1.5, px: 2 }}>
            <ListItemIcon><FavoriteIcon fontSize="small" sx={{ color: COLORS.textMuted }}/></ListItemIcon>
            <Typography variant="body2" sx={{ fontFamily: FONT, fontWeight: 'bold' }}>Mark as Deceased</Typography>
        </MenuItem>
        <MenuItem onClick={() => { setArchiveConfirm(selectedPet); handleMenuClose(); }} sx={{color: COLORS.danger, py: 1.5, px: 2}}>
            <ListItemIcon><ArchiveIcon fontSize="small" sx={{ color: COLORS.danger }}/></ListItemIcon>
            <Typography variant="body2" sx={{ fontFamily: FONT, fontWeight: 'bold' }}>Archive Patient</Typography>
        </MenuItem>
      </Menu>

      {/* FILTER POPOVER */}
      <Popover open={Boolean(filterAnchorEl)} anchorEl={filterAnchorEl} onClose={() => setFilterAnchorEl(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} PaperProps={{ sx: { borderRadius: 3, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', mt: 1 } }}>
        <Box sx={{ p: 3, width: 280 }}>
          <Typography variant="h6" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.textPrimary, mb: 2, borderBottom: `1px solid ${COLORS.borderLight}`, pb: 1 }}>Filter Patients</Typography>
          <Typography variant="caption" sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 1, display: 'block' }}>By Species</Typography>
          <ToggleButtonGroup value={filter.species} exclusive size="small" fullWidth onChange={(e,v)=>setFilter({...filter, species:v||'all'})} sx={{ mb: 3 }}><ToggleButton value="all" sx={{ fontFamily: FONT, fontWeight: 'bold' }}>All</ToggleButton><ToggleButton value="canine" sx={{ fontFamily: FONT, fontWeight: 'bold' }}>Canine</ToggleButton><ToggleButton value="feline" sx={{ fontFamily: FONT, fontWeight: 'bold' }}>Feline</ToggleButton></ToggleButtonGroup>
          <Typography variant="caption" sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 1, display: 'block' }}>By Sex</Typography>
          <ToggleButtonGroup value={filter.sex} exclusive size="small" fullWidth onChange={(e,v)=>setFilter({...filter, sex:v||'all'})} sx={{ mb: 3 }}><ToggleButton value="all" sx={{ fontFamily: FONT, fontWeight: 'bold' }}>All</ToggleButton><ToggleButton value="male" sx={{ fontFamily: FONT, fontWeight: 'bold' }}>Male</ToggleButton><ToggleButton value="female" sx={{ fontFamily: FONT, fontWeight: 'bold' }}>Female</ToggleButton></ToggleButtonGroup>
          <Typography variant="caption" sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 1, display: 'block' }}>By Medical Status</Typography>
          <ToggleButtonGroup orientation="vertical" value={filter.status} exclusive size="small" fullWidth onChange={(e,v)=>setFilter({...filter, status:v||'all'})}>
            <ToggleButton value="all" sx={{ fontFamily: FONT, fontWeight: 'bold' }}>All Statuses</ToggleButton>
            <ToggleButton value="intact" sx={{ fontFamily: FONT, fontWeight: 'bold', color: COLORS.medical }}>Intact (Not Neutered)</ToggleButton>
            <ToggleButton value="needs_vaccine" sx={{ fontFamily: FONT, fontWeight: 'bold', color: COLORS.danger }}>No Recent Visits</ToggleButton>
            <ToggleButton value="has_allergy" sx={{ fontFamily: FONT, fontWeight: 'bold', color: COLORS.warning }}>Has Listed Allergy</ToggleButton>
          </ToggleButtonGroup>
          <Button fullWidth variant="text" sx={{ mt: 2, fontFamily: FONT, color: COLORS.textMuted, fontWeight: 'bold' }} onClick={() => { setFilter({species: 'all', sex: 'all', status: 'all'}); setFilterAnchorEl(null); }}>Clear Filters</Button>
        </Box>
      </Popover>

      {/* Archived Patients section (T2.116) */}
      {archivedPets.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Button
            size="small"
            onClick={() => setShowArchived(prev => !prev)}
            startIcon={<ArchiveIcon />}
            sx={{ fontFamily: FONT, color: COLORS.textMuted, fontWeight: 'bold', mb: 1 }}
          >
            Archived Patients ({archivedPets.length}) {showArchived ? '▲' : '▼'}
          </Button>
          <Collapse in={showArchived}>
            <Grid container spacing={2}>
              {archivedPets.map(pet => (
                <Grid size={{ xs: 12, md: 6, lg: 4 }} key={pet.id}>
                  <Card sx={{ borderRadius: 3, border: `1px dashed ${COLORS.textMuted}`, opacity: 0.7, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ width: 36, height: 36, bgcolor: COLORS.panelBg, fontSize: '1.2rem' }}>
                        {(pet.species === 'Canine' || pet.species === 'Dog') ? '🐶' : '🐱'}
                      </Avatar>
                      <Box>
                        <Typography sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textMuted }}>{pet.name}</Typography>
                        <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted }}>
                          Archived {pet.archivedAt ? new Date(pet.archivedAt.seconds * 1000).toLocaleDateString() : ''}
                        </Typography>
                      </Box>
                    </Box>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => onRestore(pet.id)}
                      sx={{ fontFamily: FONT, fontWeight: 'bold', color: COLORS.success, borderColor: COLORS.success, fontSize: '0.72rem' }}
                    >
                      Restore
                    </Button>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Collapse>
        </Box>
      )}

      {/* T2.135: In Memoriam section — deceased pets */}
      {deceasedPets.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography sx={{ fontFamily: FONT, color: COLORS.textMuted, fontWeight: 'bold', mb: 1, fontSize: '0.85rem' }}>
            In Memoriam ({deceasedPets.length})
          </Typography>
          <Grid container spacing={2}>
            {deceasedPets.map(pet => (
              <Grid size={{ xs: 12, md: 6, lg: 4 }} key={pet.id}>
                <Card sx={{ borderRadius: 3, border: `1px solid ${COLORS.borderLight}`, opacity: 0.65, p: 2, display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: '#F3E5F5' }}>
                  <Avatar sx={{ width: 36, height: 36, bgcolor: '#CE93D8', fontSize: '1.2rem' }}>
                    🕊️
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary }}>{pet.name}</Typography>
                    <Typography variant="caption" sx={{ fontFamily: FONT, color: COLORS.textMuted }}>
                      {pet.dateOfDeath
                        ? `Passed ${new Date(pet.dateOfDeath.seconds * 1000).toLocaleDateString()}`
                        : 'Deceased'}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => navigate(`/patients/${pet.id}`, { state: { pet } })}
                    sx={{ fontFamily: FONT, fontWeight: 'bold', color: COLORS.textMuted, borderColor: COLORS.border, fontSize: '0.72rem', ml: 'auto', flexShrink: 0 }}
                  >
                    View Chart
                  </Button>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* T2.135: Deceased confirmation dialog */}
      <Dialog open={Boolean(deceasedConfirm)} onClose={() => setDeceasedConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.textMuted }}>
          Mark as Deceased?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.9rem', color: COLORS.textSecondary }}>
            Mark <strong>{deceasedConfirm?.name}</strong> as deceased. This will move the pet to the "In Memoriam" section.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setDeceasedConfirm(null)} sx={{ fontFamily: FONT, color: COLORS.textMuted, borderRadius: 0 }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              try {
                await updateDoc(doc(db, 'pets', deceasedConfirm.id), {
                  status: 'deceased',
                  dateOfDeath: Timestamp.now(),
                });
              } catch (e) {
                console.warn('[PetList] Mark deceased failed:', e);
              } finally {
                setDeceasedConfirm(null);
              }
            }}
            sx={{ fontFamily: FONT, fontWeight: 'bold', bgcolor: COLORS.textMuted, '&:hover': { bgcolor: '#78909C' }, borderRadius: 0 }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Archive confirmation dialog (T2.116) */}
      <Dialog open={Boolean(archiveConfirm)} onClose={() => setArchiveConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.danger }}>
          Archive Patient?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.9rem', color: COLORS.textSecondary }}>
            Are you sure you want to archive <strong>{archiveConfirm?.name}</strong>? This will hide the pet from the active list. You can restore it later.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={() => setArchiveConfirm(null)} sx={{ fontFamily: FONT, color: COLORS.textMuted, borderRadius: 0 }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => { onArchive(archiveConfirm.id); setArchiveConfirm(null); }}
            sx={{ fontFamily: FONT, fontWeight: 'bold', bgcolor: COLORS.danger, '&:hover': { bgcolor: '#B71C1C' }, borderRadius: 0 }}
          >
            Archive
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}