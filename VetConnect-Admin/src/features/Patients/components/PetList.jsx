import React, { useState, useMemo } from 'react';
import { 
  Box, Typography, Grid, Card, Avatar, Chip, Button, 
  IconButton, Menu, MenuItem, ListItemIcon, Divider, Stack, 
  ToggleButton, ToggleButtonGroup, Popover, TextField, InputAdornment, 
  Paper // THE FATAL FIX: Paper is safely imported!
} from '@mui/material';

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

export default function PetList({ pets, onRegisterPet, onViewChart, onQuickBook, calculateAge, onArchive }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const[selectedPet, setSelectedPet] = useState(null);
  
  // --- ADVANCED SORT & FILTER STATE ---
  const [sort, setSort] = useState('name_asc');
  const [filter, setFilter] = useState({ species: 'all', sex: 'all', status: 'all' });
  const[filterAnchorEl, setFilterAnchorEl] = useState(null);

  const handleMenuClick = (event, pet) => { event.stopPropagation(); setSelectedPet(pet); setAnchorEl(event.currentTarget); };
  const handleMenuClose = () => { setAnchorEl(null); };

  const activePets = pets.filter(p => p.status !== 'archived');

  // --- MULTI-AXIAL SORT & FILTER ENGINE ---
  const processedPets = useMemo(() => {
    let list = [...activePets];

    // 1. FILTERING
    if (filter.species !== 'all') list = list.filter(p => (p.species || '').toLowerCase() === filter.species);
    if (filter.sex !== 'all') list = list.filter(p => (p.gender || '').toLowerCase() === filter.sex);
    if (filter.status === 'intact') list = list.filter(p => !p.isNeutered);
    if (filter.status === 'needs_vaccine') list = list.filter(p => {
        if (!p.lastVisit) return true;
        const daysSinceVisit = (new Date() - p.lastVisit.toDate()) / (1000 * 60 * 60 * 24);
        return daysSinceVisit > 365; 
    });
    if (filter.status === 'has_allergy') list = list.filter(p => p.allergies && p.allergies !== 'None' && p.allergies !== '');

    // 2. SORTING
    switch (sort) {
      case 'age_asc': list.sort((a,b) => (a.dob?.toDate() || 0) > (b.dob?.toDate() || 0) ? -1 : 1); break;
      case 'age_desc': list.sort((a,b) => (a.dob?.toDate() || 0) < (b.dob?.toDate() || 0) ? -1 : 1); break;
      case 'last_visit_asc': list.sort((a,b) => (a.lastVisit?.toDate() || 0) > (b.lastVisit?.toDate() || 0) ? -1 : 1); break;
      case 'last_visit_desc': list.sort((a,b) => (a.lastVisit?.toDate() || 0) < (b.lastVisit?.toDate() || 0) ? -1 : 1); break;
      default: list.sort((a,b) => (a.name || '').localeCompare(b.name || '')); break;
    }
    return list;
  }, [activePets, filter, sort]);

  return (
    <Box sx={{ p: 4, bgcolor: 'transparent', flexGrow: 1 }}>
      
      {/* COMMAND CENTER HEADER */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="h5" fontWeight="900" color="#5D4037" sx={{ display: 'flex', alignItems: 'center' }}>
            Registered Patients <Chip label={activePets.length} color="primary" sx={{ ml: 1.5, fontWeight: 'bold', bgcolor: '#8B4513' }} />
          </Typography>
          <Button 
            variant="contained" size="small" startIcon={<PetsIcon />} 
            onClick={onRegisterPet} 
            sx={{ bgcolor: '#FF9800', color: '#fff', fontWeight: 'bold', borderRadius: 2 }}
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
            sx={{ minWidth: 200, bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 1 }} 
            InputProps={{ startAdornment: <InputAdornment position="start"><SortIcon fontSize="small"/></InputAdornment> }}
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
            sx={{ color: '#5D4037', borderColor: '#D7CCC8', bgcolor: 'rgba(255,255,255,0.7)', fontWeight: 'bold', py: 0.8 }}
          >
            Filters
          </Button>
        </Stack>
      </Box>

      <Divider sx={{ mb: 3 }} />

      <Grid container spacing={3}>
        {processedPets.map(pet => {
          const rawAge = calculateAge(pet.dob);
          const displayAge = rawAge === 'Age TBD' || rawAge === '' ? 'Age Unknown' : rawAge;
          const hasAllergies = pet.allergies && pet.allergies !== 'None' && pet.allergies !== '';

          return (
            // THE FIX: Changed from `item xs={12}` to `size={{ xs: 12 }}` to clear the Yellow Console Warnings!
            <Grid size={{ xs: 12, md: 6, lg: 6, xl: 4 }} key={pet.id}>
              <Card sx={{ 
                borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)',
                bgcolor: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
                display: 'flex', flexDirection: 'column', height: '100%', transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }
              }}>
                
                <Box sx={{ p: 3, pb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                    <Avatar sx={{ width: 64, height: 64, bgcolor: '#FFF8E1', mr: 2, border: '2px solid #D7CCC8', fontSize: '2rem', boxShadow: 1 }}>
                      {(pet.species === 'Canine' || pet.species === 'Dog') ? '🐶' : '🐱'}
                    </Avatar>
                    
                    <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Typography variant="h5" fontWeight="900" color="#3E2723" noWrap>{pet.name}</Typography>
                          <IconButton size="small" onClick={(e) => handleMenuClick(e, pet)} sx={{ mt: -0.5, mr: -1 }}><MoreVertIcon /></IconButton>
                      </Box>
                      <Typography variant="body2" color="#555" fontWeight="700" noWrap>{pet.breed || 'Unknown Breed'}</Typography>
                      <Typography variant="caption" color="textSecondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }} noWrap>
                        {pet.gender || 'Unknown'} • {displayAge} 
                        {pet.lastWeight && <> • <ScaleIcon sx={{fontSize: 12}}/> {pet.lastWeight}kg</>}
                      </Typography>
                    </Box>
                  </Box>
                  
                  <Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, mb: 1.5 }}>
                      {hasAllergies && <Chip icon={<WarningAmberIcon fontSize="small" />} label={`Allergy: ${pet.allergies}`} size="small" sx={{ bgcolor: '#FFEBEE', color: '#D32F2F', fontWeight: 'bold', border: '1px solid #EF9A9A' }} />}
                      <Chip label={pet.isNeutered ? "Spayed/Neutered" : "Intact"} size="small" variant={pet.isNeutered ? "filled" : "outlined"} color={pet.isNeutered ? "success" : "default"} sx={{ fontWeight: 'bold', height: 24 }} />
                      {pet.microchip && <Chip label="Microchipped" size="small" sx={{ bgcolor: '#E3F2FD', color: '#1565C0', fontWeight: 'bold', height: 24 }} />}
                    </Box>
                    <Paper variant="outlined" sx={{ bgcolor: 'rgba(250,250,250,0.5)', p: 1, borderRadius: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <EventNoteIcon fontSize="small" sx={{ color: '#757575' }} />
                      <Typography variant="caption" fontWeight="bold" color="#555">
                        Last Visit: {pet.lastVisit ? pet.lastVisit.toDate().toLocaleDateString() : 'No history'}
                      </Typography>
                    </Paper>
                  </Box>
                </Box>

                <Box sx={{ p: 2, bgcolor: 'rgba(250,250,250,0.8)', borderTop: '1px solid rgba(0,0,0,0.05)', mt: 'auto' }}>
                  <Stack direction="row" spacing={2} justifyContent="center">
                    <Button variant="outlined" startIcon={<AssignmentIcon />} onClick={() => onViewChart(pet)} sx={{ color: '#1565C0', borderColor: '#1565C0', fontWeight: 'bold', borderRadius: 2, bgcolor: 'white', flex: 1 }}>
                      View Chart
                    </Button>
                    <Button variant="contained" startIcon={<EventAvailableIcon />} onClick={() => onQuickBook(pet)} sx={{ bgcolor: '#2E7D32', color: 'white', fontWeight: 'bold', borderRadius: 2, boxShadow: 0, '&:hover': {bgcolor: '#1B5E20'}, flex: 1 }}>
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
            <Box sx={{ width: '100%', textAlign: 'center', py: 10, color: '#888', bgcolor: 'rgba(255,255,255,0.5)', borderRadius: 3, border: '2px dashed #D7CCC8' }}>
              <PetsIcon sx={{ fontSize: 70, mb: 2, color: '#D7CCC8' }} />
              <Typography variant="h6" fontWeight="bold" color="#5D4037">No Pets Found</Typography>
              <Typography variant="body2" fontStyle="italic">Try adjusting your filters or register a new pet.</Typography>
            </Box>
          </Grid>
        )}
      </Grid>
      
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose} sx={{ '& .MuiPaper-root': { borderRadius: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}}>
        <MenuItem onClick={() => {onArchive(selectedPet.id); handleMenuClose();}} sx={{color:'error.main', py: 1.5, px: 2}}>
            <ListItemIcon><ArchiveIcon fontSize="small" color="error"/></ListItemIcon> 
            <Typography variant="body2" fontWeight="bold">Archive Patient</Typography>
        </MenuItem>
      </Menu>

      {/* FILTER POPOVER */}
      <Popover open={Boolean(filterAnchorEl)} anchorEl={filterAnchorEl} onClose={() => setFilterAnchorEl(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} PaperProps={{ sx: { borderRadius: 3, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', mt: 1 } }}>
        <Box sx={{ p: 3, width: 280 }}>
          <Typography variant="h6" fontWeight="900" color="#3E2723" sx={{ mb: 2, borderBottom: '1px solid #eee', pb: 1 }}>Filter Patients</Typography>
          <Typography variant="caption" fontWeight="bold" color="textSecondary" sx={{ mb: 1, display: 'block', textTransform: 'uppercase' }}>By Species</Typography>
          <ToggleButtonGroup value={filter.species} exclusive size="small" fullWidth onChange={(e,v)=>setFilter({...filter, species:v||'all'})} sx={{ mb: 3 }}><ToggleButton value="all" sx={{ fontWeight: 'bold' }}>All</ToggleButton><ToggleButton value="canine" sx={{ fontWeight: 'bold' }}>Canine</ToggleButton><ToggleButton value="feline" sx={{ fontWeight: 'bold' }}>Feline</ToggleButton></ToggleButtonGroup>
          <Typography variant="caption" fontWeight="bold" color="textSecondary" sx={{ mb: 1, display: 'block', textTransform: 'uppercase' }}>By Sex</Typography>
          <ToggleButtonGroup value={filter.sex} exclusive size="small" fullWidth onChange={(e,v)=>setFilter({...filter, sex:v||'all'})} sx={{ mb: 3 }}><ToggleButton value="all" sx={{ fontWeight: 'bold' }}>All</ToggleButton><ToggleButton value="male" sx={{ fontWeight: 'bold' }}>Male</ToggleButton><ToggleButton value="female" sx={{ fontWeight: 'bold' }}>Female</ToggleButton></ToggleButtonGroup>
          <Typography variant="caption" fontWeight="bold" color="textSecondary" sx={{ mb: 1, display: 'block', textTransform: 'uppercase' }}>By Medical Status</Typography>
          <ToggleButtonGroup orientation="vertical" value={filter.status} exclusive size="small" fullWidth onChange={(e,v)=>setFilter({...filter, status:v||'all'})}>
            <ToggleButton value="all" sx={{ fontWeight: 'bold' }}>All Statuses</ToggleButton>
            <ToggleButton value="intact" sx={{ fontWeight: 'bold', color: '#1565C0' }}>Intact (Not Neutered)</ToggleButton>
            <ToggleButton value="needs_vaccine" sx={{ fontWeight: 'bold', color: '#D32F2F' }}>No Recent Visits</ToggleButton>
            <ToggleButton value="has_allergy" sx={{ fontWeight: 'bold', color: '#E65100' }}>Has Listed Allergy</ToggleButton>
          </ToggleButtonGroup>
          <Button fullWidth variant="text" sx={{ mt: 2, color: '#888', fontWeight: 'bold' }} onClick={() => { setFilter({species: 'all', sex: 'all', status: 'all'}); setFilterAnchorEl(null); }}>Clear Filters</Button>
        </Box>
      </Popover>
    </Box>
  );
}