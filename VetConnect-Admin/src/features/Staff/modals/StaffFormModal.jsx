import React, { useState } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  TextField, Button, MenuItem, Typography, Box, Paper, 
  FormControl, InputLabel, Select, OutlinedInput, Checkbox, ListItemText,
  Grid, Chip, Divider
} from '@mui/material';

import { useNavigate } from 'react-router-dom';
import { useUser } from '../../../context/UserContext'; 

// Icons
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import InfoIcon from '@mui/icons-material/Info';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CircleIcon from '@mui/icons-material/Circle';
import BadgeIcon from '@mui/icons-material/Badge';
import ContactEmergencyIcon from '@mui/icons-material/ContactEmergency';

export default function StaffFormModal({ open, onClose, item, showToast, dynamicDepartments, onSave }) {
  
  const { isAdmin } = useUser();
  const navigate = useNavigate();
  const isEditing = !!item;

  const [formData, setFormData] = useState({
    // Section 1: Identity (required)
    fullName:    item?.fullName || '',
    email:       item?.email || '',
    phone:       item?.phone || '',
    prcLicense:  item?.prcLicense || '',
    // Section 2: Access & Scheduling
    accessLevel: item?.accessLevel || (item?.role === 'admin' ? 'admin' : 'staff'),
    specialty:   item?.specialty || '',
    departments: item?.departments || [],
    employmentType: item?.employmentType || '',
    // Section 3: HR & Emergency (all optional)
    hireDate:         item?.hireDate || '',
    address:          item?.address || '',
    emergencyName:    item?.emergencyName || '',
    emergencyPhone:   item?.emergencyPhone || '',
    notes:            item?.notes || '',
  });

  const [errors, setErrors] = useState({});

  const noExtensionProps = { spellCheck: 'false', 'data-gramm': 'false' };

  // Helper: update field + clear its error
  const setField = (field) => (e) => {
    setFormData({ ...formData, [field]: e.target.value });
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleDepartmentChange = (event) => {
    const { target: { value } } = event;
    setFormData({ ...formData, departments: typeof value === 'string' ? value.split(',') : value });
  };

  const handleSave = () => {
    const newErrors = {};
    if (!formData.fullName.trim()) newErrors.fullName = 'Full name is required.';
    if (!formData.email.trim()) newErrors.email = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) newErrors.email = 'Enter a valid email address.';
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required.';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    const payload = { ...formData, role: formData.accessLevel };
    onSave(payload);
  };

  // ── Shared field styling ──
  const sxField = { bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 1.5 } };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          backgroundColor: 'rgba(255, 255, 255, 0.97)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 12px 40px rgba(93, 64, 55, 0.25)',
          maxHeight: '90vh',
        }
      }}
    > 
      {/* ── HEADER — VetConnect warm brown ── */}
      <DialogTitle sx={{ 
        background: 'linear-gradient(135deg, #4E342E 0%, #6D4C41 100%)', 
        color: 'white', fontWeight: '900', display: 'flex', alignItems: 'center', gap: 1.5, py: 2,
        borderBottom: '3px solid #D84315',
      }}>
        {isEditing ? <BadgeIcon /> : <AdminPanelSettingsIcon />}
        {isEditing ? 'Edit Staff Profile' : 'Authorize New Staff Member'}
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 0, bgcolor: '#FAF9F7' }}>
        <Box sx={{ p: { xs: 2.5, md: 4 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
          
          {/* ═══════════════════════════════════════════════════════════════
              SECTION 1: PERSONAL & PROFESSIONAL IDENTITY
              ═══════════════════════════════════════════════════════════════ */}
          <Box>
            <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: '#5D4037', letterSpacing: 1 }}>
              1. Personal &amp; Professional Identity
            </Typography>
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2, border: '1px solid #E0E0E0' }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 7 }}>
                  <TextField
                    label="Full Name *"
                    fullWidth size="small"
                    value={formData.fullName}
                    onChange={setField('fullName')}
                    error={!!errors.fullName}
                    helperText={errors.fullName}
                    inputProps={noExtensionProps}
                    sx={sxField}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 5 }}>
                  <TextField
                    label="Phone Number *"
                    fullWidth size="small"
                    value={formData.phone}
                    onChange={setField('phone')}
                    error={!!errors.phone}
                    helperText={errors.phone}
                    placeholder="e.g. 09171234567"
                    sx={sxField}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 8 }}>
                  <TextField 
                    label="Email Address *"
                    fullWidth size="small"
                    value={formData.email} 
                    onChange={setField('email')} 
                    disabled={isEditing}
                    error={!!errors.email}
                    helperText={errors.email || (!isEditing ? 'Used for Mobile App Login' : '')}
                    inputProps={noExtensionProps}
                    sx={sxField}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="PRC License"
                    fullWidth size="small"
                    value={formData.prcLicense}
                    onChange={setField('prcLicense')}
                    placeholder="Optional"
                    helperText="Veterinarians only"
                    inputProps={noExtensionProps}
                    sx={sxField}
                  />
                </Grid>
              </Grid>
            </Paper>
          </Box>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 2: ACCESS LEVEL & SCHEDULING
              ═══════════════════════════════════════════════════════════════ */}
          <Box>
            <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: '#5D4037', letterSpacing: 1 }}>
              2. Access Level &amp; Scheduling
            </Typography>
            <Paper elevation={0} sx={{ p: 2.5, bgcolor: '#EFEBE9', border: '1px solid #D7CCC8', borderRadius: 2 }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <FormControl fullWidth size="small" sx={sxField}>
                    <InputLabel>System Access *</InputLabel>
                    <Select value={formData.accessLevel} label="System Access *" onChange={setField('accessLevel')}>
                      <MenuItem value="staff">Standard Staff</MenuItem>
                      <MenuItem value="admin" sx={{ color: '#D32F2F', fontWeight: 'bold' }}>Administrator</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Specialty Tag"
                    fullWidth size="small"
                    value={formData.specialty}
                    onChange={setField('specialty')}
                    placeholder="e.g. Senior Surgeon"
                    sx={sxField}
                    inputProps={noExtensionProps}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <FormControl fullWidth size="small" sx={sxField}>
                    <InputLabel>Employment Type</InputLabel>
                    <Select value={formData.employmentType} label="Employment Type" onChange={setField('employmentType')}>
                      <MenuItem value=""><em>Not set</em></MenuItem>
                      <MenuItem value="Full-time">Full-time</MenuItem>
                      <MenuItem value="Part-time">Part-time</MenuItem>
                      <MenuItem value="Relief Vet">Relief / Locum Vet</MenuItem>
                      <MenuItem value="Intern">Intern / Trainee</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="small" sx={sxField}>
                    <InputLabel>Assigned Departments *</InputLabel>
                    <Select
                      multiple 
                      value={formData.departments} 
                      onChange={handleDepartmentChange}
                      input={<OutlinedInput label="Assigned Departments *" />}
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {selected.map((value) => {
                            const deptObj = (dynamicDepartments || []).find(d => d.name === value);
                            const color = deptObj ? deptObj.color : '#616161';
                            return (
                              <Chip key={value} label={value} size="small" 
                                sx={{ color: 'white', bgcolor: color, fontWeight: 'bold', height: 22 }} 
                              />
                            );
                          })}
                        </Box>
                      )}
                    >
                      {(dynamicDepartments || []).map((dept) => (
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
                      sx={{ color: '#8B4513', fontWeight: 'bold', cursor: 'pointer', mt: 1, display: 'flex', alignItems: 'center', gap: 0.5, '&:hover': { textDecoration: 'underline' } }}
                    >
                      <OpenInNewIcon sx={{ fontSize: 14 }} /> Manage Departments in Settings
                    </Typography>
                  )}
                </Grid>
              </Grid>
            </Paper>
          </Box>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 3: HR & EMERGENCY (ALL OPTIONAL)
              ═══════════════════════════════════════════════════════════════ */}
          <Box>
            <Typography variant="overline" fontWeight="900" display="block" mb={0.5} sx={{ color: '#5D4037', letterSpacing: 1 }}>
              3. Employment &amp; Emergency Contact
            </Typography>
            <Typography variant="caption" color="textSecondary" display="block" mb={1} sx={{ fontStyle: 'italic' }}>
              All fields below are optional — fill in during HR onboarding.
            </Typography>
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2, border: '1px dashed #BDBDBD' }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Hire Date"
                    type="date"
                    fullWidth size="small"
                    value={formData.hireDate}
                    onChange={setField('hireDate')}
                    InputLabelProps={{ shrink: true }}
                    sx={sxField}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 8 }}>
                  <TextField
                    label="Home Address"
                    fullWidth size="small"
                    value={formData.address}
                    onChange={setField('address')}
                    placeholder="Optional — for employment records"
                    inputProps={noExtensionProps}
                    sx={sxField}
                  />
                </Grid>

                <Grid size={{ xs: 12 }}>
                  <Divider sx={{ my: 0.5 }}>
                    <Chip icon={<ContactEmergencyIcon sx={{ fontSize: 14 }} />} label="Emergency Contact" size="small" sx={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#5D4037' }} />
                  </Divider>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    label="Emergency Contact Name"
                    fullWidth size="small"
                    value={formData.emergencyName}
                    onChange={setField('emergencyName')}
                    placeholder="e.g. Maria Capua"
                    inputProps={noExtensionProps}
                    sx={sxField}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    label="Emergency Contact Phone"
                    fullWidth size="small"
                    value={formData.emergencyPhone}
                    onChange={setField('emergencyPhone')}
                    placeholder="e.g. 09181234567"
                    sx={sxField}
                  />
                </Grid>

                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Internal Notes"
                    fullWidth size="small"
                    multiline
                    rows={2}
                    value={formData.notes}
                    onChange={setField('notes')}
                    placeholder="e.g. Prefers afternoon shifts, on probation until June 2026"
                    inputProps={noExtensionProps}
                    sx={sxField}
                  />
                </Grid>
              </Grid>
            </Paper>
          </Box>

          {/* ── INFO FOOTER ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5 }}>
            <InfoIcon sx={{ fontSize: 16, color: '#8B4513' }} />
            <Typography variant="caption" color="textSecondary" fontStyle="italic">
              Fields marked with * are required. All other fields can be filled in later.
            </Typography>
          </Box>

        </Box>
      </DialogContent>
      
      {/* ── ACTIONS — VetConnect deep orange ── */}
      <DialogActions sx={{ p: 2.5, bgcolor: 'white', borderTop: '1px solid #D7CCC8' }}>
        <Button onClick={onClose} sx={{ fontWeight: 'bold', color: '#5D4037', px: 3, mr: 1 }}>CANCEL</Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          sx={{ 
            bgcolor: '#D84315', fontWeight: '900', px: 4, py: 1.2, borderRadius: 2, 
            boxShadow: '0 4px 15px rgba(216,67,21,0.4)',
            '&:hover': { bgcolor: '#BF360C' },
          }}
        >
          {isEditing ? 'SAVE CHANGES' : 'AUTHORIZE STAFF'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}