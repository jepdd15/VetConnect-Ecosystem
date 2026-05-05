import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, MenuItem, Typography, Box, Paper,
  FormControl, InputLabel, Select, OutlinedInput, Checkbox, ListItemText,
  Grid, Chip, Divider, FormHelperText
} from '@mui/material';

import { useNavigate } from 'react-router-dom';
import { isValidPHPhone } from '../../../utils/phoneValidation';
import { COLORS, FONT } from '../../../theme/designTokens';

// Icons
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import InfoIcon from '@mui/icons-material/Info';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CircleIcon from '@mui/icons-material/Circle';
import BadgeIcon from '@mui/icons-material/Badge';
import ContactEmergencyIcon from '@mui/icons-material/ContactEmergency';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

export default function StaffFormModal({ open, onClose, item, dynamicDepartments, onSave }) {

  const navigate = useNavigate();
  const isEditing = !!item;

  const [formData, setFormData] = useState({
    // Section 1: Identity (required)
    fullName:    item?.fullName || '',
    email:       item?.email || '',
    phone:       item?.phone || '',
    prcLicense:  item?.prcLicense || '',
    ptrNumber:   item?.ptrNumber || '',
    // Section 2: Access & Scheduling (T4.154: accessLevel always defaults to 'staff')
    accessLevel: item?.accessLevel || 'staff',
    departments: item?.departments || [],
    // Section 3: HR & Emergency (all optional)
    address:          item?.address || '',
    emergencyContacts: item?.emergencyContacts || (
      item?.emergencyName ? [{ name: item.emergencyName, kinship: item.emergencyKinship || '', phone: item.emergencyPhone || '' }] : []
    ),
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
    if (errors.departments) setErrors(prev => ({ ...prev, departments: '' }));
  };

  // Dynamic Contact Handlers
  const handleAddContact = () => {
    setFormData(prev => ({
      ...prev,
      emergencyContacts: [...prev.emergencyContacts, { name: '', kinship: '', phone: '' }]
    }));
  };

  const handleRemoveContact = (index) => {
    setFormData(prev => ({
      ...prev,
      emergencyContacts: prev.emergencyContacts.filter((_, i) => i !== index)
    }));
  };

  // Deep-copy each contact to avoid mutating state directly (T2.219)
  const handleContactChange = (index, field, value) => {
    const updated = formData.emergencyContacts.map((c, i) =>
      i === index ? { ...c, [field]: value } : c
    );
    setFormData(prev => ({ ...prev, emergencyContacts: updated }));
  };

  const handleSave = () => {
    const newErrors = {};
    if (!formData.fullName.trim()) newErrors.fullName = 'Full name is required.';
    if (!formData.email.trim()) newErrors.email = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) newErrors.email = 'Enter a valid email address.';
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required.';
    else if (!isValidPHPhone(formData.phone)) newErrors.phone = 'Must be a valid PH number (e.g. 09171234567).';
    if (formData.departments.length === 0) newErrors.departments = 'At least one department is required.';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    const payload = { ...formData, role: formData.accessLevel };
    onSave(payload);
  };

  // ── Shared field styling ──
  const sxField = {
    bgcolor: 'white',
    '& .MuiOutlinedInput-root': {
      borderRadius: 0,
      '& fieldset': { border: `2px solid ${COLORS.accent}` },
      '&:hover fieldset': { borderColor: COLORS.brand },
      '&.Mui-focused fieldset': { borderColor: COLORS.accent, borderSize: '3px' }
    },
    '& .MuiInputLabel-root': { color: COLORS.accent, fontWeight: 'bold' }
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
          border: `2px solid ${COLORS.accent}`,
          backgroundColor: COLORS.cardBg,
          boxShadow: '8px 8px 0px rgba(93, 64, 55, 0.1)',
          maxHeight: '90vh',
        }
      }}
    >
      {/* ── HEADER — VetConnect warm brown ── */}
      <DialogTitle sx={{
        bgcolor: COLORS.cream,
        color: COLORS.brand, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1.5, py: 2,
        borderBottom: `2px solid ${COLORS.accent}`,
        fontFamily: FONT,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontSize: '1.1rem'
      }}>
        {isEditing ? <BadgeIcon sx={{ color: COLORS.accent }} /> : <AdminPanelSettingsIcon sx={{ color: COLORS.accent }} />}
        {isEditing ? 'Edit Staff Profile' : 'Authorize New Staff Member'}
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, bgcolor: COLORS.formBg }}>
        <Box sx={{ p: { xs: 2.5, md: 4 }, display: 'flex', flexDirection: 'column', gap: 3 }}>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 1: PERSONAL & PROFESSIONAL IDENTITY
              ═══════════════════════════════════════════════════════════════ */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: COLORS.accent, letterSpacing: 1 }}>
              1. PERSONAL &amp; PROFESSIONAL IDENTITY
            </Typography>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 0, border: `2px solid ${COLORS.accent}`, bgcolor: COLORS.cardBg }}>
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
                    helperText={errors.email}
                    inputProps={noExtensionProps}
                    sx={sxField}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
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
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    label="PTR Number"
                    fullWidth size="small"
                    value={formData.ptrNumber}
                    onChange={setField('ptrNumber')}
                    placeholder="Optional"
                    helperText="Professional Tax Receipt — renewed annually"
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
          <Box sx={{ mb: 4 }}>
            <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: COLORS.accent, letterSpacing: 1 }}>
              2. ACCESS LEVEL &amp; SCHEDULING
            </Typography>
            <Paper elevation={0} sx={{ p: 3, bgcolor: COLORS.panelBg, border: `2px solid ${COLORS.accent}`, borderRadius: 0 }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="small" sx={sxField} error={!!errors.departments}>
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
                    {errors.departments && (
                      <FormHelperText error sx={{ fontWeight: 'bold' }}>{errors.departments}</FormHelperText>
                    )}
                  </FormControl>

                  <Typography
                    variant="caption"
                    onClick={() => { onClose(); navigate('/settings'); }}
                    sx={{ color: COLORS.accentWarm, fontWeight: 'bold', cursor: 'pointer', mt: 1, display: 'flex', alignItems: 'center', gap: 0.5, '&:hover': { textDecoration: 'underline' } }}
                  >
                    <OpenInNewIcon sx={{ fontSize: 14 }} /> Manage Departments in Settings
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          </Box>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 3: HR & EMERGENCY (ALL OPTIONAL)
              ═══════════════════════════════════════════════════════════════ */}
          <Box>
            <Typography variant="overline" fontWeight="900" display="block" mb={0.5} sx={{ color: COLORS.accent, letterSpacing: 1 }}>
              3. EMPLOYMENT &amp; EMERGENCY CONTACT
            </Typography>
            <Typography variant="caption" color="textSecondary" display="block" mb={1} sx={{ fontStyle: 'italic' }}>
              All fields below are optional — fill in during HR onboarding.
            </Typography>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 0, border: `2px solid ${COLORS.accent}`, bgcolor: COLORS.cardBg }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
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
                    <Chip icon={<ContactEmergencyIcon sx={{ fontSize: 14 }} />} label="Emergency Contact" size="small" sx={{ fontSize: '0.65rem', fontWeight: 'bold', color: COLORS.accent }} />
                  </Divider>
                </Grid>

                {formData.emergencyContacts.map((contact, index) => (
                  <React.Fragment key={index}>
                    <Grid size={{ xs: 12, md: 4.5 }}>
                      <TextField
                        label="Emergency Contact Name"
                        fullWidth size="small"
                        value={contact.name}
                        onChange={(e) => handleContactChange(index, 'name', e.target.value)}
                        placeholder="e.g. Maria Capua"
                        inputProps={noExtensionProps}
                        sx={sxField}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 3 }}>
                      <TextField
                        label="Kinship / Affiliation"
                        fullWidth size="small"
                        value={contact.kinship}
                        onChange={(e) => handleContactChange(index, 'kinship', e.target.value)}
                        placeholder="e.g. Spouse"
                        inputProps={noExtensionProps}
                        sx={sxField}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 3.5 }} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <TextField
                        label="Phone Number"
                        fullWidth size="small"
                        value={contact.phone}
                        onChange={(e) => handleContactChange(index, 'phone', e.target.value)}
                        placeholder="e.g. 09181234567"
                        sx={sxField}
                      />
                      <Button
                        disabled={formData.emergencyContacts.length === 1}
                        onClick={() => handleRemoveContact(index)}
                        sx={{ minWidth: 40, color: COLORS.danger, p: 0 }}
                      >
                        <DeleteIcon />
                      </Button>
                    </Grid>
                  </React.Fragment>
                ))}

                <Grid size={{ xs: 12 }}>
                  <Button
                    startIcon={<AddIcon />}
                    onClick={handleAddContact}
                    variant="outlined"
                    sx={{
                      borderRadius: 0, border: `2px solid ${COLORS.accent}`, color: COLORS.accent,
                      fontWeight: 900, fontFamily: FONT, fontSize: '0.75rem',
                      mt: 1,
                      '&:hover': { border: `2px solid ${COLORS.brand}`, bgcolor: 'rgba(93, 64, 55, 0.05)' }
                    }}
                  >
                    ADD EMERGENCY CONTACT
                  </Button>
                </Grid>
              </Grid>
            </Paper>
          </Box>

          {/* ── INFO FOOTER AREA ── */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5,
            bgcolor: COLORS.cream, border: `2px solid ${COLORS.accent}`, mt: 1
          }}>
            <InfoIcon sx={{ fontSize: 18, color: COLORS.accent }} />
            <Typography variant="caption" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              NOTICE: Fields marked with * are mandatory for clinical authorization.
            </Typography>
          </Box>

        </Box>
      </DialogContent>

      {/* ── ACTIONS — VetConnect deep orange ── */}
      <DialogActions sx={{ p: 2.5, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.accent}` }}>
        <Button
          onClick={onClose}
          sx={{
            fontWeight: 900, color: COLORS.accent, px: 3, mr: 1,
            fontFamily: FONT, borderRadius: 0,
            border: `2px solid ${COLORS.accent}`,
            '&:hover': { bgcolor: 'rgba(93, 64, 55, 0.05)' }
          }}
        >
          CANCEL
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          sx={{
            bgcolor: COLORS.cta, fontWeight: 900, px: 4, py: 1.2, borderRadius: 0,
            boxShadow: '4px 4px 0px rgba(216,67,21,0.2)',
            border: `2px solid ${COLORS.ctaHover}`,
            '&:hover': { bgcolor: COLORS.ctaHover, boxShadow: '2px 2px 0px rgba(216,67,21,0.2)' },
            fontFamily: FONT
          }}
        >
          {isEditing ? 'SAVE CHANGES' : 'AUTHORIZE STAFF'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
