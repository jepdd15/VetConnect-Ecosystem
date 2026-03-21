import React, { useState } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  TextField, Button, MenuItem, Switch, FormControlLabel, 
  Typography, Box, Paper, Divider, InputAdornment, Stack,
  FormControl, InputLabel, Select, OutlinedInput, Checkbox, ListItemText,
  Alert, Grid // Standard MUI v6 Grid
} from '@mui/material';

// Icons
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import InfoIcon from '@mui/icons-material/Info';

export default function StaffFormModal({ open, onClose, item, showToast, dynamicDepartments, onSave }) {
  
  // THE FIX: State initializes ONCE directly from the 'item' prop.
  // The parent's 'key' prop ensures this is a fresh state every time the modal opens.
  const [formData, setFormData] = useState({
    fullName: item?.fullName || '',
    email: item?.email || '',
    phone: item?.phone || '',
    specialty: item?.specialty || '',
    accessLevel: item?.accessLevel || (item?.role === 'admin' ? 'admin' : 'staff'),
    departments: item?.departments || [],
    prcLicense: item?.prcLicense || ''
  });

  const noExtensionProps = { spellCheck: 'false', 'data-gramm': 'false' };

  const handleDepartmentChange = (event) => {
    const { target: { value } } = event;
    setFormData({ ...formData, departments: typeof value === 'string' ? value.split(',') : value });
  };

  const handleSave = async () => {
    if (!formData.fullName || !formData.email) {
      return showToast("Name and Email are required.", "error");
    }
    onSave(formData);
  };

  return (
    // THE FIX: Upgraded to maxWidth="md" for a wider, more professional layout
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth> 
      <DialogTitle sx={{ bgcolor: '#1565C0', color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
        <AdminPanelSettingsIcon /> {item ? 'Edit Staff Profile' : 'Authorize New Staff Member'}
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 0, bgcolor: '#F5F5F5' }}>
        <Box sx={{ p: 4 }}>
          
          <Typography variant="overline" color="primary" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
            1. Personal & Professional Identity
          </Typography>
          <Paper elevation={0} sx={{ p: 3, mb: 4, borderRadius: 2, border: '1px solid rgba(0,0,0,0.08)' }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 7 }}>
                <TextField label="Full Name" fullWidth size="small" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} inputProps={noExtensionProps} />
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <TextField label="Phone Number" fullWidth size="small" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              </Grid>
              <Grid size={{ xs: 12, md: 8 }}>
                <TextField 
                  label="Email Address" fullWidth size="small" value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                  disabled={!!item} 
                  helperText={!item ? "Used for Mobile App Login" : ""}
                  inputProps={noExtensionProps}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField label="PRC License" fullWidth size="small" value={formData.prcLicense} onChange={e => setFormData({...formData, prcLicense: e.target.value})} placeholder="Optional" inputProps={noExtensionProps} />
              </Grid>
            </Grid>
          </Paper>

          <Typography variant="overline" color="primary" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
            2. Access Level & Scheduling
          </Typography>
          <Paper elevation={0} sx={{ p: 3, mb: 2, bgcolor: '#E3F2FD', border: '1px solid #BBDEFB', borderRadius: 2 }}>
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}>
                    <InputLabel>System Access Level</InputLabel>
                    <Select value={formData.accessLevel} label="System Access Level" onChange={e => setFormData({...formData, accessLevel: e.target.value})}>
                      <MenuItem value="staff">Standard Staff (Clinical/Operational)</MenuItem>
                      <MenuItem value="admin" sx={{ color: '#D32F2F', fontWeight: 'bold' }}>Administrator (Full Access)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField label="Specialty Tag" fullWidth size="small" value={formData.specialty} onChange={e => setFormData({...formData, specialty: e.target.value})} placeholder="e.g. Senior Surgeon" sx={{ bgcolor: 'white' }} inputProps={noExtensionProps} />
                </Grid>
                
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="small" sx={{ bgcolor: 'white', mt: 1 }}>
                    <InputLabel>Assigned Departments</InputLabel>
                    <Select
                      multiple value={formData.departments} onChange={handleDepartmentChange}
                      input={<OutlinedInput label="Assigned Departments" />}
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {selected.map((value) => <Chip key={value} label={value} size="small" color="primary" sx={{ fontWeight: 'bold', height: 22 }} />)}
                        </Box>
                      )}
                    >
                      {/* THE FIX: Dynamic rendering from props, not a hardcoded array! */}
                      {(dynamicDepartments || []).map((dept) => (
                        <MenuItem key={dept} value={dept}>
                          <Checkbox checked={formData.departments.indexOf(dept) > -1} size="small" />
                          <ListItemText primary={dept} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
            </Grid>
          </Paper>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, px: 1 }}>
            <InfoIcon sx={{ fontSize: 16, color: '#1565C0' }} />
            <Typography variant="caption" color="textSecondary" fontStyle="italic">
                Departments determine which service types this staff member can fulfill.
            </Typography>
          </Box>

        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 2.5, bgcolor: '#EFEBE9', borderTop: '1px solid #D7CCC8' }}>
        <Button onClick={onClose} sx={{ fontWeight: 'bold', color: '#5D4037', px: 3 }}>CANCEL</Button>
        <Button onClick={handleSave} variant="contained" sx={{ bgcolor: '#2E7D32', fontWeight: 'bold', px: 4 }}>
          {item ? 'SAVE CHANGES' : 'AUTHORIZE STAFF'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}