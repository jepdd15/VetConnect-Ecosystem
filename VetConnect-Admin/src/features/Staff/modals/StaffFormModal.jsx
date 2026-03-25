import React, { useState } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  TextField, Button, MenuItem, Typography, Box, Paper, 
  FormControl, InputLabel, Select, OutlinedInput, Checkbox, ListItemText,
  Alert, Grid, Chip 
} from '@mui/material';

import { useNavigate } from 'react-router-dom';
import { useUser } from '../../../context/UserContext'; 

// Icons
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import InfoIcon from '@mui/icons-material/Info';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CircleIcon from '@mui/icons-material/Circle';

export default function StaffFormModal({ open, onClose, item, showToast, dynamicDepartments, onSave }) {
  
  const { isAdmin } = useUser();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    fullName: item?.fullName || '',
    email: item?.email || '',
    phone: item?.phone || '',
    specialty: item?.specialty || '',
    accessLevel: item?.accessLevel || (item?.role === 'admin' ? 'admin' : 'staff'),
    departments: item?.departments ||[],
    prcLicense: item?.prcLicense || ''
  });

  const noExtensionProps = { spellCheck: 'false', 'data-gramm': 'false' };

  const handleDepartmentChange = (event) => {
    const { target: { value } } = event;
    setFormData({ ...formData, departments: typeof value === 'string' ? value.split(',') : value });
  };

  const handleSave = () => {
    if (!formData.fullName || !formData.email) return showToast("Name and Email are required.", "error");
    onSave(formData);
  };

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
        background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)', 
        color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1, py: 2 
      }}>
        <AdminPanelSettingsIcon /> {item ? 'Edit Staff Profile' : 'Authorize New Staff Member'}
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 0, bgcolor: 'rgba(250, 250, 250, 0.5)' }}>
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
                    <InputLabel>System Access</InputLabel>
                    <Select value={formData.accessLevel} label="System Access" onChange={e => setFormData({...formData, accessLevel: e.target.value})}>
                      <MenuItem value="staff">Standard Staff (Clinical)</MenuItem>
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
                      multiple 
                      value={formData.departments} 
                      onChange={handleDepartmentChange}
                      input={<OutlinedInput label="Assigned Departments" />}
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {selected.map((value) => {
                            const deptObj = (dynamicDepartments || []).find(d => d.name === value);
                            const color = deptObj ? deptObj.color : '#616161';
                            return (
                                <Chip 
                                  key={value} 
                                  label={value} 
                                  size="small" 
                                  sx={{ color: 'white', bgcolor: color, fontWeight: 'bold', height: 22 }} 
                                />
                            );
                          })}
                        </Box>
                      )}
                    >
                      {(dynamicDepartments ||[]).map((dept) => (
                        <MenuItem key={dept.id} value={dept.name}>
                          <Checkbox checked={formData.departments.indexOf(dept.name) > -1} size="small" />
                          <CircleIcon sx={{ color: dept.color || '#616161', mr: 1, fontSize: 16 }} />
                          <ListItemText primary={dept.name} />
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
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, px: 1 }}>
            <InfoIcon sx={{ fontSize: 16, color: '#1565C0' }} />
            <Typography variant="caption" color="textSecondary" fontStyle="italic">
                Departments determine which service types this staff member can fulfill.
            </Typography>
          </Box>

        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 2.5, bgcolor: 'white', borderTop: '1px solid #E0E0E0' }}>
        <Button onClick={onClose} sx={{ fontWeight: 'bold', color: '#5D4037', px: 3, mr: 1 }}>CANCEL</Button>
        <Button onClick={handleSave} variant="contained" sx={{ bgcolor: '#2E7D32', fontWeight: '900', px: 4, py: 1.2, borderRadius: 2, boxShadow: 3 }}>
          {item ? 'SAVE CHANGES' : 'AUTHORIZE STAFF'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}