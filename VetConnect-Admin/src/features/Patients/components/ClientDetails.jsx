import React from 'react';
import { Box, Typography, Paper, Grid, MenuItem, IconButton, Button, TextField } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import CakeIcon from '@mui/icons-material/Cake';
import WcIcon from '@mui/icons-material/Wc';
import WorkIcon from '@mui/icons-material/Work';
import HomeIcon from '@mui/icons-material/Home';
import BadgeIcon from '@mui/icons-material/Badge';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import GroupIcon from '@mui/icons-material/Group';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';

const ProfileField = ({ label, value, icon, isEditing, onChange, select, children, type="text", extra }) => (
  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: isEditing ? 0 : 1.5, borderRadius: 2, bgcolor: isEditing ? 'transparent' : '#FAFAFA', border: isEditing ? 'none' : '1px solid #F0F0F0', height: '100%' }}>
    {!isEditing && <Box sx={{ color: '#8B4513', bgcolor: '#EFEBE9', p: 1, borderRadius: 1.5, display: 'flex' }}>{React.cloneElement(icon, { fontSize: 'small' })}</Box>}
    <Box sx={{ flex: 1 }}>
      <Typography variant="caption" sx={{ color: '#888', fontWeight: 'bold', display: 'block', mb: 0.5, textTransform: 'uppercase' }}>{label}</Typography>
      {isEditing ? (
        <TextField select={select} fullWidth size="small" value={value || ''} onChange={onChange} type={type} variant="outlined">{children}</TextField>
      ) : (
        <Typography variant="body2" sx={{ color: '#212121', fontWeight: '600' }}>{value || 'Not provided'} {extra && `(${extra})`}</Typography>
      )}
    </Box>
  </Box>
);

export default function ClientDetails({ editForm, setEditForm, isEditing, calculateAge }) {
  const handleRepChange = (idx, field, val) => {
    const reps = [...editForm.emergencyContacts];
    reps[idx][field] = val;
    setEditForm({ ...editForm, emergencyContacts: reps });
  };

  return (
    <Box sx={{ p: 4 }}>
      <Paper elevation={0} sx={{ mb: 4, borderRadius: 2, border: '1px solid #E0E0E0', overflow: 'hidden' }}>
        <Box sx={{ bgcolor: '#F5F5F5', px: 3, py: 1.5, borderLeft: '4px solid #1565C0' }}><Typography variant="subtitle2" color="#1565C0" fontWeight="bold">Demographics</Typography></Box>
        <Box sx={{ p: 3 }}><Grid container spacing={2}>
          <Grid item xs={12} md={4}><ProfileField label="Full Name" value={editForm.fullName} isEditing={isEditing} onChange={(e)=>setEditForm({...editForm, fullName:e.target.value})} icon={<PersonIcon/>} /></Grid>
          <Grid item xs={12} md={4}><ProfileField label="Date of Birth" type="date" value={editForm.dob} isEditing={isEditing} onChange={(e)=>setEditForm({...editForm, dob:e.target.value})} icon={<CakeIcon/>} extra={!isEditing && calculateAge(editForm.dob)} /></Grid>
          <Grid item xs={12} md={4}><ProfileField label="Sex" select value={editForm.gender} isEditing={isEditing} onChange={(e)=>setEditForm({...editForm, gender:e.target.value})} icon={<WcIcon/>}><MenuItem value="Male">Male</MenuItem><MenuItem value="Female">Female</MenuItem></ProfileField></Grid>
        </Grid></Box>
      </Paper>

      <Paper elevation={0} sx={{ mb: 4, borderRadius: 2, border: '1px solid #E0E0E0', overflow: 'hidden' }}>
        <Box sx={{ bgcolor: '#F5F5F5', px: 3, py: 1.5, borderLeft: '4px solid #D32F2F' }}><Typography variant="subtitle2" color="#D32F2F" fontWeight="bold">Authorized Representatives</Typography></Box>
        <Box sx={{ p: 3 }}>
          {editForm.emergencyContacts?.map((rep, i) => (
            <Grid container spacing={2} key={i} sx={{ mb: 2 }}>
              <Grid item xs={12} md={4}><ProfileField label="Name" value={rep.name} isEditing={isEditing} onChange={(e)=>handleRepChange(i, 'name', e.target.value)} icon={<PersonIcon/>} /></Grid>
              <Grid item xs={12} md={4}><ProfileField label="Phone" value={rep.phone} isEditing={isEditing} onChange={(e)=>handleRepChange(i, 'phone', e.target.value)} icon={<PhoneIcon/>} /></Grid>
              <Grid item xs={12} md={isEditing ? 3 : 4}><ProfileField label="Relation" value={rep.relation} isEditing={isEditing} onChange={(e)=>handleRepChange(i, 'relation', e.target.value)} icon={<GroupIcon/>} /></Grid>
              {isEditing && <Grid item xs={1}><IconButton color="error" onClick={()=>{const r=[...editForm.emergencyContacts]; r.splice(i,1); setEditForm({...editForm, emergencyContacts:r})}}><DeleteIcon/></IconButton></Grid>}
            </Grid>
          ))}
          {isEditing && <Button startIcon={<AddCircleOutlineIcon/>} onClick={()=>setEditForm({...editForm, emergencyContacts:[...editForm.emergencyContacts, {name:'', phone:'', relation:''}]})}>Add Representative</Button>}
        </Box>
      </Paper>
    </Box>
  );
}