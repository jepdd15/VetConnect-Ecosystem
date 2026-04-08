import React, { useState } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, 
  Chip, Button, Box, Typography, Paper, InputAdornment, FormControlLabel, 
  Switch, FormControl, InputLabel, Select, Stack, Grid // Standard MUI v6 Grid
} from '@mui/material';

import { useNavigate } from 'react-router-dom';
import { useUser } from '../../../context/UserContext'; 

// Icons
import TimerIcon from '@mui/icons-material/Timer';
import DescriptionIcon from '@mui/icons-material/Description';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CircleIcon from '@mui/icons-material/Circle';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';

export default function ServiceFormModal({ open, onClose, item, inventory, onSave, showToast, departments }) {
  
  const { isAdmin } = useUser();
  const navigate = useNavigate();

  // THE FIX: Initialize state DIRECTLY. No useEffect needed.
  const [formData, setFormData] = useState({
    name: item?.name || '',
    department: item?.department || item?.category || '',
    price: item?.price?.toString() || '',
    duration: item?.duration?.toString() || '30',
    bufferTime: item?.bufferTime?.toString() || '5',
    description: item?.description || '',
    targetSpecies: item?.targetSpecies || 'Universal',
    linkedProduct: item?.linkedProduct || '',
    isWalkIn: item ? item.isWalkIn : true,
    isInpatient: item?.isInpatient || false,
    isEmergency: item?.isEmergency || false,
  });

  const handleSave = () => {
    if (!formData.name || formData.price === '') {
        return showToast("Service Name and Base Price are required.", "error");
    }
    const finalData = {
        ...formData,
        price: parseFloat(formData.price) || 0,
        duration: parseInt(formData.duration) || 30,
        bufferTime: parseInt(formData.bufferTime) || 0
    };
    onSave(finalData);
  };

  const noExtensionProps = { spellCheck: 'false', 'data-gramm': 'false' };
  const sxField = { 
    bgcolor: 'white', 
    '& .MuiOutlinedInput-root': { 
      borderRadius: 0, 
      '& fieldset': { border: '2px solid #5D4037' },
      '&:hover fieldset': { borderColor: '#3E2723' },
      '&.Mui-focused fieldset': { borderColor: '#5D4037', borderSize: '3px' }
    },
    '& .MuiInputLabel-root': { color: '#5D4037', fontWeight: 'bold' }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 0,
          border: '2px solid #5D4037',
          backgroundColor: '#FFF',
          boxShadow: '8px 8px 0px rgba(93, 64, 55, 0.1)',
          maxHeight: '90vh',
        }
      }}
    >
      <DialogTitle sx={{ 
        bgcolor: '#FFF8E1', 
        color: '#3E2723', 
        fontWeight: '1000', 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1.5, 
        py: 2,
        borderBottom: '2px solid #5D4037',
        fontFamily: 'Inter, sans-serif',
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontSize: '1.1rem'
      }}>
        <MedicalServicesIcon sx={{ color: '#5D4037' }} /> 
        {item ? "Edit Service Configuration" : "Create New Service"}
      </DialogTitle>
      
      <DialogContent sx={{ p: 0, bgcolor: '#FAF9F7' }}>
        <Box sx={{ p: 3 }}>
          
          <Typography variant="overline" sx={{ color: '#5D4037', fontWeight: '1000', mb: 1, display: 'block', letterSpacing: 1 }}>
            1. SERVICE IDENTITY & ROUTING
          </Typography>
          <Paper sx={{ p: 3, mb: 4, borderRadius: 0, border: '2px solid #5D4037', bgcolor: 'white', boxShadow: 'none' }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 8 }}>
                  <TextField label="Service Name" fullWidth size="small" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} sx={sxField} inputProps={noExtensionProps}/>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                  <FormControl fullWidth size="small" sx={sxField}>
                    <InputLabel>Target Species</InputLabel>
                    <Select value={formData.targetSpecies || 'Universal'} label="Target Species" onChange={(e) => setFormData({...formData, targetSpecies: e.target.value})}>
                        <MenuItem value="Universal">🐾 Universal</MenuItem>
                        <MenuItem value="Canine">🐶 Canine</MenuItem>
                        <MenuItem value="Feline">🐱 Feline</MenuItem>
                    </Select>
                  </FormControl>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth size="small" sx={sxField}>
                    <InputLabel>Target Department</InputLabel>
                    <Select 
                      value={formData.department || ''} 
                      label="Target Department" 
                      onChange={(e) => setFormData({...formData, department: e.target.value})}
                    >
                        <MenuItem value=""><em>None / General</em></MenuItem>
                        {(departments ||[]).map((dept) => (
                          <MenuItem key={dept.id} value={dept.name}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <CircleIcon sx={{ color: dept.color || '#616161', fontSize: 16 }} />
                              <Typography variant="body2" fontWeight="bold">{dept.name}</Typography>
                            </Box>
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
              </Grid>
            </Grid>
          </Paper>

          <Typography variant="overline" sx={{ color: '#5D4037', fontWeight: '1000', mb: 1, display: 'block', letterSpacing: 1 }}>
            2. LOGISTICS, TIME, & BILLING
          </Typography>
          <Paper sx={{ p: 3, mb: 4, bgcolor: 'white', border: '2px solid #5D4037', borderRadius: 0, boxShadow: 'none' }}>
            <Grid container spacing={2}>
               <Grid size={{ xs: 12, md: 4 }}>
                <TextField label="Base Price" type="number" fullWidth size="small" value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }} sx={sxField} />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <TextField label="Duration" type="number" fullWidth size="small" value={formData.duration} onChange={(e) => setFormData({...formData, duration: e.target.value})} InputProps={{ endAdornment: <InputAdornment position="end">Mins</InputAdornment> }} sx={sxField} />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <TextField label="Cleanup Buffer" type="number" fullWidth size="small" value={formData.bufferTime} onChange={(e) => setFormData({...formData, bufferTime: e.target.value})} InputProps={{ startAdornment: <InputAdornment position="start"><TimerIcon fontSize="small" sx={{color:'#5D4037'}}/></InputAdornment>, endAdornment: <InputAdornment position="end">Mins</InputAdornment> }} sx={sxField} />
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2, bgcolor: '#F1F8E9', borderRadius: 0, border: '2px solid #5D4037', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: 'none' }}>
                      <Typography variant="caption" sx={{ display:'block', mb: 0.5, fontWeight: '1000', color: '#5D4037', textTransform: 'uppercase', letterSpacing: 1 }}>RESOURCE ROUTING</Typography>
                      <Typography variant="body2" component="div" sx={{ lineHeight: 1.4, color: '#3E2723', fontWeight: 'bold' }}>
                          Mobile bookings will automatically route to any staff assigned to the <Chip label={formData.department || 'General'} size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: '1000', borderRadius: 0, border: '1px solid #5D4037', bgcolor: '#E3F2FD', color: '#1565C0' }} /> department.
                      </Typography>
                  </Paper>
              </Grid>
              
              <Grid size={{ xs: 12, md: 6 }}>
                <FormControl fullWidth size="small" sx={{...sxField, height: '100%', '& .MuiInputBase-root': {height: '100%'} }}>
                    <InputLabel>Auto-Deduct Inventory (Bundle)</InputLabel>
                    <Select value={formData.linkedProduct || ''} label="Auto-Deduct Inventory (Bundle)" onChange={(e) => setFormData({...formData, linkedProduct: e.target.value})}>
                        <MenuItem value=""><em>None (Service Only)</em></MenuItem>
                        {(inventory || []).map(i => (<MenuItem key={i.id} value={i.id}>{i.itemName}</MenuItem>))}
                    </Select>
                </FormControl>
              </Grid>
              
              <Grid size={{ xs: 12 }}>
                  <TextField 
                    label="SOP / Description / Clinic Instructions" 
                    fullWidth multiline rows={3} size="small" 
                    value={formData.description} 
                    onChange={(e) => setFormData({...formData, description: e.target.value})} 
                    sx={{...sxField, mt: 1}} 
                    InputProps={{ 
                        startAdornment: <InputAdornment position="start"><DescriptionIcon fontSize="small" sx={{color: '#5D4037', mr: 1, mt: -4}}/></InputAdornment> 
                    }}
                    inputProps={noExtensionProps} 
                  />
              </Grid>
            </Grid>
          </Paper>
          
          <Typography variant="overline" sx={{ color: '#5D4037', fontWeight: '1000', display: 'block', mb: 1, letterSpacing: 1 }}>
            3. OPERATIONAL RULES
          </Typography>
          <Paper sx={{ p: 2.5, bgcolor: 'white', borderRadius: 0, border: '2px solid #5D4037', boxShadow: 'none' }}>
              <Stack direction="row" justifyContent="space-around" flexWrap="wrap" spacing={2}>
                  <FormControlLabel control={<Switch checked={formData.isWalkIn} onChange={(e) => setFormData({...formData, isWalkIn: e.target.checked})} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#5D4037' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#5D4037' } }} />} label={<Typography variant="body2" sx={{fontWeight: '1000', color: '#5D4037'}}>ALLOW WALK-IN</Typography>} />
                  <FormControlLabel control={<Switch checked={formData.isInpatient} onChange={(e) => setFormData({...formData, isInpatient: e.target.checked})} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#5D4037' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#5D4037' } }} />} label={<Typography variant="body2" sx={{fontWeight: '1000', color: '#5D4037'}}>REQ. CONFINEMENT</Typography>} />
                  <FormControlLabel control={<Switch checked={formData.isEmergency} onChange={(e) => setFormData({...formData, isEmergency: e.target.checked})} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#D32F2F' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#D32F2F' } }} />} label={<Typography variant="body2" sx={{fontWeight: '1000', color: '#D32F2F'}}>IS EMERGENCY</Typography>} />
              </Stack>
          </Paper>

        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 2.5, bgcolor: '#FFF8E1', borderTop: '2px solid #5D4037', borderRadius: 0 }}>
          <Button onClick={onClose} sx={{ fontWeight: '1000', color: '#5D4037', px: 3, border: '2px solid #5D4037', borderRadius: 0, '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' } }}>CANCEL</Button>
          <Button onClick={handleSave} variant="contained" sx={{ bgcolor: '#2E7D32', color: 'white', fontWeight: '1000', px: 4, py: 1, borderRadius: 0, border: '2px solid #5D4037', boxShadow: '4px 4px 0px rgba(0,0,0,0.1)', '&:hover': { bgcolor: '#1B5E20', transform: 'translate(-2px, -2px)', boxShadow: '6px 6px 0px rgba(0,0,0,0.1)' } }}>
             SAVE CONFIGURATION
          </Button>
      </DialogActions>
    </Dialog>
  );
}