import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, FormControlLabel, Switch, Typography, Button, Grid } from '@mui/material';

export default function AddPetModal({ open, onClose, ownerName, newPetData, setNewPetData, onSubmit }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#8B4513', color: 'white', fontWeight: 'bold' }}>Register Pet for {ownerName}</DialogTitle>
        <DialogContent dividers sx={{ bgcolor: '#FAFAFA', p: 3 }}>
            <Grid container spacing={2}>
                <Grid item xs={12} md={8}><TextField autoFocus label="Pet Name" fullWidth size="small" sx={{bgcolor: 'white'}} value={newPetData.name} onChange={(e)=>setNewPetData({...newPetData, name:e.target.value})} /></Grid>
                <Grid item xs={12} md={4}><TextField select label="Species" fullWidth size="small" sx={{bgcolor: 'white'}} value={newPetData.species} onChange={(e)=>setNewPetData({...newPetData, species:e.target.value})}><MenuItem value="Canine">🐶 Canine</MenuItem><MenuItem value="Feline">🐱 Feline</MenuItem></TextField></Grid>
                <Grid item xs={12} md={6}><TextField label="Breed" fullWidth size="small" sx={{bgcolor: 'white'}} value={newPetData.breed} onChange={(e)=>setNewPetData({...newPetData, breed:e.target.value})} /></Grid>
                <Grid item xs={12} md={6}><TextField label="Color" fullWidth size="small" sx={{bgcolor: 'white'}} value={newPetData.color} onChange={(e)=>setNewPetData({...newPetData, color:e.target.value})} /></Grid>
                <Grid item xs={12} md={6}><TextField select label="Sex" fullWidth size="small" sx={{bgcolor: 'white'}} value={newPetData.gender} onChange={(e)=>setNewPetData({...newPetData, gender:e.target.value})}><MenuItem value="Male">Male</MenuItem><MenuItem value="Female">Female</MenuItem></TextField></Grid>
                <Grid item xs={12} md={6}><TextField type="date" label="Birthday" fullWidth size="small" sx={{bgcolor: 'white'}} InputLabelProps={{shrink: true}} value={newPetData.dob} onChange={(e)=>setNewPetData({...newPetData, dob:e.target.value})} /></Grid>
                <Grid item xs={12}><FormControlLabel control={<Switch checked={newPetData.isNeutered} onChange={(e)=>setNewPetData({...newPetData, isNeutered:e.target.checked})} color="success"/>} label={<Typography fontWeight="bold" color="success.main">Spayed/Neutered</Typography>} /></Grid>
            </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#EFEBE9' }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button onClick={onSubmit} variant="contained" sx={{ bgcolor: '#8B4513' }}>Save Profile</Button>
        </DialogActions>
    </Dialog>
  );
}