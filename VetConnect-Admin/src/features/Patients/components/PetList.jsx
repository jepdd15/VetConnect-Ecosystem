import React from 'react';
import { Box, Typography, Grid, Card, Avatar, Chip, Button } from '@mui/material';
import PetsIcon from '@mui/icons-material/Pets';
import AssignmentIcon from '@mui/icons-material/Assignment';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';

export default function PetList({ pets, onRegisterPet, onViewChart, onQuickBook, calculateAge }) {
  return (
    <Box sx={{ p: 4, bgcolor: 'white', flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6" fontWeight="bold" color="#5D4037">Registered Patients ({pets.length})</Typography>
        <Button variant="contained" size="small" startIcon={<PetsIcon />} onClick={onRegisterPet} sx={{ bgcolor: '#8B4513', '&:hover': { bgcolor: '#5D4037' }, fontWeight: 'bold' }}>
          Register New Pet
        </Button>
      </Box>
      <Grid container spacing={3}>
        {pets.map(pet => (
          <Grid item xs={12} lg={4} xl={3} key={pet.id}>
            <Card sx={{ display: 'flex', flexDirection: 'column', borderRadius: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '1px solid #E0E0E0' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', p: 2, borderBottom: '1px solid #F5F5F5' }}>
                <Avatar sx={{ width: 50, height: 50, bgcolor: '#FFF8E1', mr: 2, border: '1px solid #D7CCC8' }}>
                  {(pet.species === 'Canine' || pet.species === 'Dog') ? '🐶' : '🐱'}
                </Avatar>
                <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                  <Typography variant="h6" fontWeight="bold" color="#3E2723" noWrap>{pet.name}</Typography>
                  <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }} noWrap>
                    {pet.breed} • {pet.gender} {calculateAge(pet.dob) && `• ${calculateAge(pet.dob)}`}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                    {pet.isNeutered && <Chip label="Fixed" size="small" color="success" variant="outlined" sx={{ height: 16, fontSize: '0.6rem' }} />}
                    {pet.allergies && pet.allergies !== 'None' && <Chip label="Allergy" size="small" color="error" sx={{ height: 16, fontSize: '0.6rem' }} />}
                  </Box>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', bgcolor: '#FAFAFA' }}>
                <Button fullWidth size="small" startIcon={<AssignmentIcon />} onClick={() => onViewChart(pet)} sx={{ color: '#1565C0', fontWeight: 'bold', py: 1.5, borderRight: '1px solid #eee', borderRadius: 0 }}>Chart</Button>
                <Button fullWidth size="small" startIcon={<EventAvailableIcon />} onClick={() => onQuickBook(pet)} sx={{ color: '#2E7D32', fontWeight: 'bold', py: 1.5, borderRadius: 0 }}>Book</Button>
              </Box>
            </Card>
          </Grid>
        ))}
        {pets.length === 0 && (
          <Box sx={{ width: '100%', textAlign: 'center', py: 8, color: '#aaa', bgcolor: '#FAFAFA', borderRadius: 2, border: '1px dashed #ccc' }}>
            <PetsIcon sx={{ fontSize: 60, mb: 1, opacity: 0.5 }} />
            <Typography fontStyle="italic">No pets registered to this owner.</Typography>
          </Box>
        )}
      </Grid>
    </Box>
  );
}