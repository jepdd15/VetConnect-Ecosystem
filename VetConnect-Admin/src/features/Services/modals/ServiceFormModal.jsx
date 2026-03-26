import React, { useState } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, 
  Chip, Button, Box, Typography, Paper, InputAdornment, FormControlLabel, 
  Switch, Divider, FormControl, InputLabel, Select, Stack 
} from '@mui/material';
import Grid from '@mui/material/Grid'; // Standard MUI v6 Grid

import { useNavigate } from 'react-router-dom';
import { useUser } from '../../../context/UserContext'; 

// Icons
import TimerIcon from '@mui/icons-material/Timer';
import DescriptionIcon from '@mui/icons-material/Description';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CircleIcon from '@mui/icons-material/Circle';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';

export default function ServiceFormModal({ open, onClose, item, onSave, showToast, departments }) {
  
  const { isAdmin } = useUser();
  const navigate = useNavigate();

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
    isEmergency: item?.isEmergency || false
  });

  const handleSave = () => {
    if (!formData.name || formData.price === '') {
        return showToast("Service Name and Base Price are required.", "error");
    }
    onSave(formData);
  };

  const noExtensionProps = { spellCheck: 'false', 'data-gramm': 'false' };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.2)'
        }
      }}
    >
      <DialogTitle sx={{ 
        background: 'linear-gradient(135deg, #8B4513 0%, #5D4037 100%)', 
        color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1, py: 2 
      }}>
        <MedicalServicesIcon /> {item ? "Edit Service Configuration" : "Create New Service"}
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 0, bgcolor: 'rgba(250, 250, 250, 0.5)' }}>
        <Box sx={{ p: 4 }}>
          
          <Typography variant="overline" color="primary" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
            1. SERVICE IDENTITY & ROUTING
          </Typography>
          <Paper elevation={0} sx={{ p: 3, mb: 4, borderRadius: 2, border: '1px solid rgba(0,0,0,0.08)' }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 8 }}>
                  <TextField label="Service Name" fullWidth size="small" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} sx={{bgcolor: 'white'}} inputProps={noExtensionProps}/>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                  <FormControl fullWidth size="small" sx={{bgcolor: 'white'}}>
                    <InputLabel>Target Species</InputLabel>
                    <Select value={formData.targetSpecies || 'Universal'} label="Target Species" onChange={(e) => setFormData({...formData, targetSpecies: e.target.value})}>
                        <MenuItem value="Universal">🐾 Universal</MenuItem>
                        <MenuItem value="Canine">🐶 Canine</MenuItem>
                        <MenuItem value="Feline">🐱 Feline</MenuItem>
                    </Select>
                  </FormControl>
              </Grid>
              <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="small" sx={{bgcolor: 'white'}}>
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
                  
                  {isAdmin && (
                    <Typography 
                      variant="caption" 
                      onClick={() => { onClose(); navigate('/settings'); }} 
                      sx={{ color: 'primary.main', fontWeight: 'bold', cursor: 'pointer', mt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      <OpenInNewIcon sx={{ fontSize: 14 }} /> Manage Departments in Settings
                    </Typography>
                  )}
              </Grid>
            </Grid>
          </Paper>

          <Typography variant="overline" color="primary" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
            2. LOGISTICS, TIME, & BILLING
          </Typography>
          <Paper elevation={0} sx={{ p: 3, mb: 4, bgcolor: '#E3F2FD', border: '1px solid #BBDEFB', borderRadius: 2 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField label="Base Price" type="number" fullWidth size="small" value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }} sx={{bgcolor: 'white'}} />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <TextField label="Duration" type="number" fullWidth size="small" value={formData.duration} onChange={(e) => setFormData({...formData, duration: e.target.value})} InputProps={{ endAdornment: <InputAdornment position="end">Mins</InputAdornment> }} sx={{bgcolor: 'white'}} />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <TextField label="Cleanup Buffer" type="number" fullWidth size="small" value={formData.bufferTime} onChange={(e) => setFormData({...formData, bufferTime: e.target.value})} InputProps={{ startAdornment: <InputAdornment position="start"><TimerIcon fontSize="small" sx={{color:'#aaa'}}/></InputAdornment>, endAdornment: <InputAdornment position="end">Mins</InputAdornment> }} sx={{bgcolor: 'white'}} />
              </Grid>
              
              {/* THE MISSING FIELD: Restored the Description / SOP input box */}
              <Grid size={{ xs: 12 }}>
                  <TextField 
                    label="SOP / Description / Clinic Instructions" 
                    fullWidth multiline rows={3} size="small" 
                    value={formData.description} 
                    onChange={(e) => setFormData({...formData, description: e.target.value})} 
                    sx={{bgcolor: 'white', mt: 1}} 
                    InputProps={{ 
                        startAdornment: <InputAdornment position="start"><DescriptionIcon fontSize="small" sx={{color: '#aaa', mr: 1, mt: -4}}/></InputAdornment> 
                    }}
                    inputProps={{ spellCheck: 'false', 'data-gramm': 'false' }} 
                  />
              </Grid>

            </Grid>
          </Paper>
          
          <Typography variant="overline" color="textSecondary" fontWeight="bold" sx={{ display: 'block', mb: 1 }}>
            3. OPERATIONAL RULES
          </Typography>
          <Paper elevation={0} sx={{ p: 2.5, bgcolor: 'white', borderRadius: 2, border: '1px solid rgba(0,0,0,0.08)' }}>
              <Stack direction="row" justifyContent="space-around" flexWrap="wrap" spacing={2}>
                  <FormControlLabel control={<Switch checked={formData.isWalkIn} onChange={(e) => setFormData({...formData, isWalkIn: e.target.checked})} color="primary" />} label={<Typography variant="body2" fontWeight="bold">Allow Walk-In</Typography>} />
                  <FormControlLabel control={<Switch checked={formData.isInpatient} onChange={(e) => setFormData({...formData, isInpatient: e.target.checked})} color="warning" />} label={<Typography variant="body2" fontWeight="bold">Req. Confinement</Typography>} />
                  <FormControlLabel control={<Switch checked={formData.isEmergency} onChange={(e) => setFormData({...formData, isEmergency: e.target.checked})} color="error" />} label={<Typography variant="body2" fontWeight="bold" color="error">Is Emergency</Typography>} />
              </Stack>
          </Paper>

        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 2.5, bgcolor: 'white', borderTop: '1px solid #E0E0E0' }}>
          <Button onClick={onClose} sx={{ fontWeight: 'bold', color: '#5D4037', px: 3, mr: 1 }}>CANCEL</Button>
          <Button onClick={handleSave} variant="contained" sx={{ bgcolor: '#2E7D32', fontWeight: '900', px: 4, py: 1.2, borderRadius: 2, boxShadow: 3 }}>
             SAVE CONFIGURATION
          </Button>
      </DialogActions>
    </Dialog>
  );
}