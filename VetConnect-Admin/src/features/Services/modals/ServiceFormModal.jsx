import React, { useState } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, 
  Chip, Button, Box, Typography, Paper, InputAdornment, FormControlLabel, 
  Switch, Divider, Stack, FormControl, InputLabel, Select 
} from '@mui/material';
// THE FIX: Standard MUI v6 Grid (Grid2 engine)
import Grid from '@mui/material/Grid'; 
import CircleIcon from '@mui/icons-material/Circle';
import TimerIcon from '@mui/icons-material/Timer';
import DescriptionIcon from '@mui/icons-material/Description';

export default function ServiceFormModal({ open, onClose, item, inventory, onSave, showToast, departments }) {
  
  // THE FIX: Initialize state DIRECTLY from the 'item' prop.
  // Because we use the 'key' trick in the parent, this initializes perfectly every time.
  const [formData, setFormData] = useState({
    name: item?.name || '',
    category: item?.category || '', 
    price: item?.price?.toString() || '',
    duration: item?.duration?.toString() || '30',
    bufferTime: item?.bufferTime?.toString() || '5',
    color: item?.color || '#1976D2',
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
    // Convert strings to numbers for the Mobile App
    const finalData = {
        ...formData,
        price: parseFloat(formData.price) || 0,
        duration: parseInt(formData.duration) || 30,
        bufferTime: parseInt(formData.bufferTime) || 0
    };
    onSave(finalData);
  };

  const noExtensionProps = { spellCheck: 'false', 'data-gramm': 'false' };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 'bold', color: 'white', bgcolor: '#5D4037', px: 3 }}>
          {item ? "Edit Service Configuration" : "Create New Service"}
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 0, bgcolor: '#FAFAFA' }}>
        <Box sx={{ p: 4 }}>
          
          {/* SECTION 1: IDENTITY */}
          <Typography variant="overline" color="primary" fontWeight="bold" sx={{ mb: 2, display: 'block' }}>
            1. SERVICE IDENTITY & ROUTING
          </Typography>
          <Paper elevation={0} sx={{ p: 3, mb: 4, borderRadius: 2, border: '1px solid #e0e0e0' }}>
            <Grid container spacing={2}>
              
              {/* Name takes up more space now */}
              <Grid size={{ xs: 12, md: 8 }}>
                  <TextField label="Service Name" fullWidth size="small" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} sx={{bgcolor: 'white'}} inputProps={noExtensionProps}/>
              </Grid>
              
              {/* Species stays the same */}
              <Grid size={{ xs: 12, md: 4 }}>
                  <FormControl fullWidth size="small" sx={{bgcolor: 'white'}}>
                    <InputLabel>Target Species</InputLabel>
                    <Select value={formData.targetSpecies || 'Universal'} label="Target Species" onChange={(e) => setFormData({...formData, targetSpecies: e.target.value})}>
                        <MenuItem value="Universal">🐾 Universal</MenuItem>
                        <MenuItem value="Canine">🐶 Canine (Dog)</MenuItem>
                        <MenuItem value="Feline">🐱 Feline (Cat)</MenuItem>
                    </Select>
                  </FormControl>
              </Grid>
              
              {/* Department is now on its own full-width line for emphasis */}
              <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="small" sx={{bgcolor: 'white'}}>
                    <InputLabel>Target Department</InputLabel>
                    <Select 
                      value={formData.category || ''} 
                      label="Target Department" 
                      onChange={(e) => setFormData({...formData, category: e.target.value})}
                    >
                        <MenuItem value=""><em>None / General</em></MenuItem>
                        {(departments || []).map((dept) => (
                          <MenuItem key={dept.id} value={dept.name}>{dept.name}</MenuItem>
                        ))}
                    </Select>
                  </FormControl>
              </Grid>

            </Grid>
          </Paper>

          {/* SECTION 2: LOGISTICS */}
          <Typography variant="overline" color="primary" fontWeight="bold" sx={{ mb: 2, display: 'block' }}>
            2. LOGISTICS, TIME, & BILLING
          </Typography>
          <Paper elevation={0} sx={{ p: 3, mb: 4, bgcolor: '#F0F4F8', border: '1px solid #D1D9E6', borderRadius: 2 }}>
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

              <Grid size={{ xs: 12, md: 6 }}>
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: '#F9FBE7', borderRadius: 1, border: '1px dashed #A5D6A7', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <Typography variant="caption" fontWeight="bold" color="#2E7D32" sx={{display:'block', mb: 0.5}}>RESOURCE ROUTING</Typography>
                      {/* FIX:component="div" prevents the P-tag nesting error! */}
                      <Typography variant="body2" component="div" sx={{ lineHeight: 1.4, color: '#333' }}>
                          Mobile bookings for this service will automatically route to any staff member assigned to the <Chip label={formData.category || 'General'} size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 'bold', bgcolor: '#E3F2FD', color: '#1565C0' }} /> department.
                      </Typography>
                  </Paper>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <FormControl fullWidth size="small" sx={{bgcolor: 'white'}}>
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
                    sx={{bgcolor: 'white'}} 
                    InputProps={{ startAdornment: <InputAdornment position="start"><DescriptionIcon fontSize="small" sx={{color: '#aaa', mr: 1}}/></InputAdornment> }}
                    inputProps={noExtensionProps} 
                  />
              </Grid>
            </Grid>
          </Paper>
          
          <Typography variant="overline" color="textSecondary" fontWeight="bold" sx={{ display: 'block', mb: 2 }}>
            3. OPERATIONAL RULES
          </Typography>
          <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'white', borderRadius: 2 }}>
              <Stack direction="row" justifyContent="space-around" flexWrap="wrap" spacing={2}>
                  <FormControlLabel control={<Switch checked={formData.isWalkIn} onChange={(e) => setFormData({...formData, isWalkIn: e.target.checked})} color="primary" />} label={<Typography variant="body2" fontWeight="bold">Allow Walk-In</Typography>} />
                  <FormControlLabel control={<Switch checked={formData.isInpatient} onChange={(e) => setFormData({...formData, isInpatient: e.target.checked})} color="warning" />} label={<Typography variant="body2" fontWeight="bold">Req. Confinement</Typography>} />
                  <FormControlLabel control={<Switch checked={formData.isEmergency} onChange={(e) => setFormData({...formData, isEmergency: e.target.checked})} color="error" />} label={<Typography variant="body2" fontWeight="bold" color="error">Is Emergency</Typography>} />
              </Stack>
          </Paper>

        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2.5, bgcolor: '#EFEBE9', borderTop: '1px solid #D7CCC8' }}>
          <Button onClick={onClose} sx={{ fontWeight: 'bold', color: '#5D4037', px: 3 }}>CANCEL</Button>
          <Button onClick={handleSave} variant="contained" sx={{ bgcolor: '#2E7D32', fontWeight: 'bold', px: 4, py: 1 }}>
             SAVE CONFIGURATION
          </Button>
      </DialogActions>
    </Dialog>
  );
}