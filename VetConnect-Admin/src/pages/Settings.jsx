import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Paper, Button, FormControl, InputLabel, Select, MenuItem,
  Snackbar, Alert, InputAdornment, TextField, Switch, FormControlLabel, 
  Divider, Stack, Chip, ListItemText 
} from '@mui/material';
import Grid from '@mui/material/Grid';

import { doc, getDoc, setDoc, Timestamp, collection, onSnapshot, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Icons
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import SaveIcon from '@mui/icons-material/Save';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import DomainIcon from '@mui/icons-material/Domain';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CircleIcon from '@mui/icons-material/Circle';

// Standard Brand Colors for the Color Picker
const COLOR_PALETTE =[
  { label: 'Navy Blue', value: '#1565C0' },
  { label: 'Sky Blue', value: '#0288D1' },
  { label: 'Teal', value: '#00897B' },
  { label: 'Forest Green', value: '#2E7D32' },
  { label: 'Light Green', value: '#558B2F' },
  { label: 'Goldenrod', value: '#F9A825' },
  { label: 'Orange', value: '#E65100' },
  { label: 'Deep Orange', value: '#D84315' },
  { label: 'Crimson Red', value: '#C62828' },
  { label: 'Rose Pink', value: '#AD1457' },
  { label: 'Deep Purple', value: '#6A1B9A' },
  { label: 'Indigo', value: '#283593' },
  { label: 'Slate Grey', value: '#455A64' },
  { label: 'Charcoal', value: '#424242' },
  { label: 'Espresso Brown', value: '#4E342E' },
];

export default function Settings() {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  // --- CONFIGURATION STATE ---
  const [settings, setSettings] = useState({
    openHour: 8, closeHour: 17,
    lunchEnabled: true, lunchStart: 12, lunchEnd: 13,
    minSlotInterval: 30, advanceNoticeMins: 120, maxFutureBookingDays: 30, maxPetsPerBooking: 3,
    maxCages: 5, autoNoShowMins: 30, trafficModerate: 6, trafficHigh: 13
  });

  // --- DYNAMIC DEPARTMENTS STATE ---
  const [departments, setDepartments] = useState([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newDepartmentColor, setNewDepartmentColor] = useState('#616161');

  const glassStyle = {
    background: 'rgba(255, 255, 255, 0.55)', backdropFilter: 'blur(16px)', 
    border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 8px 32px 0 rgba(139, 69, 19, 0.08)', borderRadius: 3, 
  };

  useEffect(() => {
    // 1. Fetch Global Settings
    const unsubSettings = onSnapshot(doc(db, "clinic_settings", "general"), (docSnap) => {
      if (docSnap.exists()) setSettings(prev => ({ ...prev, ...docSnap.data() }));
    });

    // 2. Fetch Dynamic Departments
    const unsubDepts = onSnapshot(collection(db, "departments"), (snapshot) => {
      const depts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      depts.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
      setDepartments(depts);
    });

    return () => { unsubSettings(); unsubDepts(); };
  },[]);

  const handleChange = (field, value) => { setSettings(prev => ({ ...prev, [field]: value })); };

  // --- SAVE SETTINGS ---
  const handleSave = async () => {
    setLoading(true);
    try {
      const sanitizedSettings = {
        ...settings,
        minSlotInterval: parseInt(settings.minSlotInterval) || 30,
        advanceNoticeMins: parseInt(settings.advanceNoticeMins) || 120,
        maxFutureBookingDays: parseInt(settings.maxFutureBookingDays) || 30,
        maxPetsPerBooking: parseInt(settings.maxPetsPerBooking) || 3,
        maxCages: parseInt(settings.maxCages) || 5,
        autoNoShowMins: parseInt(settings.autoNoShowMins) || 30,
        trafficModerate: parseInt(settings.trafficModerate) || 6,
        trafficHigh: parseInt(settings.trafficHigh) || 13
      };
      await setDoc(doc(db, "clinic_settings", "general"), { ...sanitizedSettings, updatedAt: Timestamp.now(), updatedBy: "Admin" }, { merge: true });
      setToast({ open: true, message: 'Global Clinic Settings Updated Successfully!', severity: 'success' });
    } catch (error) { setToast({ open: true, message: error.message, severity: 'error' }); } 
    finally { setLoading(false); }
  };

  // --- DEPARTMENT CRUD ---
  const handleAddDepartment = async () => {
    if (!newDepartmentName.trim()) return setToast({ open: true, message: 'Department name is required.', severity: 'warning' });
    const isDuplicate = departments.some(d => d.name.toLowerCase() === newDepartmentName.trim().toLowerCase());
    if (isDuplicate) return setToast({ open: true, message: 'Department already exists!', severity: 'error' });
    try {
        await addDoc(collection(db, "departments"), { name: newDepartmentName.trim(), color: newDepartmentColor });
        setNewDepartmentName('');
        setToast({ open: true, message: 'Department Added.', severity: 'success' });
    } catch (e) { setToast({ open: true, message: e.message, severity: 'error' }); }
  };

  const handleDeleteDepartment = async (id, name) => {
    if (window.confirm(`Delete the "${name}" department? Make sure no staff or services are using it!`)) {
      try {
          await deleteDoc(doc(db, "departments", id));
          setToast({ open: true, message: 'Department Deleted.', severity: 'success' });
      } catch (e) { setToast({ open: true, message: e.message, severity: 'error' }); }
    }
  };

  const formatHour = (hour24) => {
    if (hour24 === 0) return '12:00 AM (Midnight)';
    if (hour24 === 12) return '12:00 PM (Noon)';
    return hour24 < 12 ? `${hour24}:00 AM` : `${hour24 - 12}:00 PM`;
  };
  const hoursArray = Array.from({ length: 24 }, (_, i) => i);

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, minHeight: 'calc(100vh - 64px)', bgcolor: 'transparent' }}>
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: '900', color: '#5D4037', display: 'flex', alignItems: 'center', gap: 1, textShadow: '0px 1px 2px rgba(255,255,255,0.8)' }}>
          <SettingsSuggestIcon fontSize="large" sx={{ color: '#8B4513' }} /> Clinic Configuration
        </Typography>
        <Button variant="contained" color="success" size="large" startIcon={<SaveIcon />} onClick={handleSave} disabled={loading} sx={{ fontWeight: '900', px: 4, py: 1.5, boxShadow: '0 4px 12px rgba(46, 125, 50, 0.3)', borderRadius: 2 }}>
          {loading ? "Saving..." : "Save Configuration"}
        </Button>
      </Box>

      <Grid container spacing={4}>
        
        {/* PILLAR 1: OPERATING HOURS */}
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ ...glassStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: 'rgba(21, 101, 192, 0.05)', px: 3, py: 2, borderBottom: '1px solid rgba(0,0,0,0.05)', borderLeft: '4px solid #1565C0' }}>
              <Typography variant="subtitle1" color="#1565C0" fontWeight="900" sx={{ display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}><AccessTimeIcon /> Operating Hours</Typography>
            </Box>
            <Box sx={{ p: 4, flexGrow: 1, bgcolor: 'rgba(255,255,255,0.6)' }}>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 4, fontWeight: '500' }}>Controls the mobile app's booking calendar boundaries.</Typography>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white', borderRadius: 1 }}><InputLabel>Clinic Opens</InputLabel><Select value={settings.openHour} label="Clinic Opens" onChange={(e) => handleChange('openHour', e.target.value)}>{hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}</Select></FormControl>
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white', borderRadius: 1 }}><InputLabel>Clinic Closes</InputLabel><Select value={settings.closeHour} label="Clinic Closes" onChange={(e) => handleChange('closeHour', e.target.value)}>{hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}</Select></FormControl>
                </Grid>
                <Grid item xs={12}><Divider sx={{ my: 1 }} /><FormControlLabel control={<Switch checked={settings.lunchEnabled} onChange={(e) => handleChange('lunchEnabled', e.target.checked)} color="primary" />} label={<Typography fontWeight="bold" color="primary">Enforce Lunch Break</Typography>} /></Grid>
                {settings.lunchEnabled && (
                    <>
                        <Grid item xs={6}><FormControl fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 1 }}><InputLabel>Start</InputLabel><Select value={settings.lunchStart} label="Start" onChange={(e) => handleChange('lunchStart', e.target.value)}>{hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}</Select></FormControl></Grid>
                        <Grid item xs={6}><FormControl fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 1 }}><InputLabel>End</InputLabel><Select value={settings.lunchEnd} label="End" onChange={(e) => handleChange('lunchEnd', e.target.value)}>{hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}</Select></FormControl></Grid>
                    </>
                )}
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 2: BOOKING ENGINE RULES */}
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ ...glassStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: 'rgba(230, 81, 0, 0.05)', px: 3, py: 2, borderBottom: '1px solid rgba(0,0,0,0.05)', borderLeft: '4px solid #E65100' }}>
              <Typography variant="subtitle1" color="#E65100" fontWeight="900" sx={{ display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}><EventBusyIcon /> Client Limitations</Typography>
            </Box>
            <Box sx={{ p: 4, flexGrow: 1, bgcolor: 'rgba(255,255,255,0.6)' }}>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 4, fontWeight: '500' }}>Protects the clinic from schedule hoarding and last-minute bookings.</Typography>
              <Grid container spacing={3}>
                <Grid item xs={12}><FormControl fullWidth size="medium" sx={{ bgcolor: 'white', borderRadius: 1 }}><InputLabel>Base Slot Interval</InputLabel><Select value={settings.minSlotInterval} label="Base Slot Interval" onChange={(e) => handleChange('minSlotInterval', e.target.value)}><MenuItem value={15}>15 Minutes</MenuItem><MenuItem value={30}>30 Minutes</MenuItem><MenuItem value={60}>60 Minutes</MenuItem></Select></FormControl></Grid>
                <Grid item xs={12}><FormControl fullWidth size="medium" sx={{ bgcolor: 'white', borderRadius: 1 }}><InputLabel>Advance Notice Buffer</InputLabel><Select value={settings.advanceNoticeMins} label="Advance Notice Buffer" onChange={(e) => handleChange('advanceNoticeMins', e.target.value)}><MenuItem value={30}>30 Minutes</MenuItem><MenuItem value={60}>1 Hour</MenuItem><MenuItem value={120}>2 Hours</MenuItem></Select></FormControl></Grid>
                <Grid item xs={6}><TextField fullWidth label="Future Limit" type="number" value={settings.maxFutureBookingDays} onChange={(e) => handleChange('maxFutureBookingDays', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">Days</InputAdornment> }} sx={{ bgcolor: 'white', borderRadius: 1 }} /></Grid>
                <Grid item xs={6}><TextField fullWidth label="Max Pets" type="number" value={settings.maxPetsPerBooking} onChange={(e) => handleChange('maxPetsPerBooking', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">Pets</InputAdornment> }} sx={{ bgcolor: 'white', borderRadius: 1 }} helperText="Per booking" /></Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 3: CAPACITY & TRIAGE */}
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ ...glassStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: 'rgba(46, 125, 50, 0.05)', px: 3, py: 2, borderBottom: '1px solid rgba(0,0,0,0.05)', borderLeft: '4px solid #2E7D32' }}>
              <Typography variant="subtitle1" color="#2E7D32" fontWeight="900" sx={{ display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}><LocalHospitalIcon /> Capacity & Triage</Typography>
            </Box>
            <Box sx={{ p: 4, flexGrow: 1, bgcolor: 'rgba(255,255,255,0.6)' }}>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 4, fontWeight: '500' }}>Controls physical clinic limits and algorithmic traffic warnings.</Typography>
              <Grid container spacing={3}>
                <Grid item xs={12}><TextField fullWidth label="Max Confinement Cages" type="number" value={settings.maxCages} onChange={(e) => handleChange('maxCages', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">Cages</InputAdornment> }} sx={{ bgcolor: 'white', borderRadius: 1 }} helperText="Blocks admission" /></Grid>
                <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                <Grid item xs={12}><TextField fullWidth label="Auto-No-Show Trigger" type="number" value={settings.autoNoShowMins} onChange={(e) => handleChange('autoNoShowMins', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">Mins Late</InputAdornment> }} sx={{ bgcolor: 'white', borderRadius: 1 }} /></Grid>
                <Grid item xs={6}><TextField fullWidth label="Moderate Traffic" type="number" value={settings.trafficModerate} onChange={(e) => handleChange('trafficModerate', e.target.value)} sx={{ bgcolor: 'white', borderRadius: 1 }} helperText="Patients" /></Grid>
                <Grid item xs={6}><TextField fullWidth label="High Traffic" type="number" value={settings.trafficHigh} onChange={(e) => handleChange('trafficHigh', e.target.value)} sx={{ bgcolor: 'white', borderRadius: 1 }} helperText="Patients" /></Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 4: DYNAMIC DEPARTMENTS (THE NEW ADDITION!) */}
        <Grid item xs={12}>
          <Paper elevation={0} sx={{ ...glassStyle, overflow: 'hidden' }}>
            <Box sx={{ bgcolor: 'rgba(93, 64, 55, 0.05)', px: 3, py: 2, borderBottom: '1px solid rgba(0,0,0,0.05)', borderLeft: '4px solid #5D4037' }}>
              <Typography variant="subtitle1" color="#5D4037" fontWeight="900" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <DomainIcon /> Clinic Departments / Categories
              </Typography>
            </Box>
            <Box sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.6)' }}>
              <Typography variant="body1" color="textSecondary" sx={{ mb: 3, fontWeight: '500' }}>
                These departments drive the Skill-Based Routing Engine and the color-coding system.
              </Typography>
              
              <Stack direction="row" spacing={2} sx={{ mb: 4, maxWidth: 700, alignItems: 'center' }}>
                <TextField label="New Department Name" size="small" value={newDepartmentName} onChange={(e) => setNewDepartmentName(e.target.value)} sx={{ flexGrow: 1, bgcolor: 'white', borderRadius: 1 }} inputProps={{ spellCheck: 'false' }}/>
                
                {/* THE NEW VISUAL COLOR PICKER */}
                <FormControl size="small" sx={{ minWidth: 200, bgcolor: 'white' }}>
                    <InputLabel>Color Tag</InputLabel>
                    <Select 
                      value={newDepartmentColor} 
                      label="Color Tag" 
                      onChange={(e) => setNewDepartmentColor(e.target.value)}
                      renderValue={(value) => (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CircleIcon sx={{ color: value, fontSize: 18 }} />
                          <Typography variant="body2" fontWeight="bold">{(COLOR_PALETTE.find(c => c.value === value) || {}).label}</Typography>
                        </Box>
                      )}
                    >
                      {COLOR_PALETTE.map(c => <MenuItem key={c.value} value={c.value}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <CircleIcon sx={{ color: c.value }} /> <ListItemText primary={c.label} />
                          </Box>
                      </MenuItem>)}
                    </Select>
                </FormControl>

                <Button variant="contained" onClick={handleAddDepartment} startIcon={<AddCircleOutlineIcon/>} sx={{ bgcolor: '#8B4513', fontWeight: 'bold', px: 4, py: 1 }}>Add</Button>
              </Stack>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, p: 2, bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 2, border: '1px dashed #ccc', minHeight: 80 }}>
                {departments.map(dept => (
                  <Chip 
                    key={dept.id} 
                    label={dept.name} 
                    onDelete={() => handleDeleteDepartment(dept.id, dept.name)}
                    sx={{ fontWeight: 'bold', color: 'white', bgcolor: dept.color, border: '2px solid rgba(0,0,0,0.1)', fontSize: '0.9rem', py: 2.5, px: 1, '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)', '&:hover': { color: 'white' } } }}
                  />
                ))}
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Snackbar open={toast.open} autoHideDuration={5000} onClose={() => setToast({...toast, open: false})} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setToast({...toast, open: false})} severity={toast.severity} sx={{ width: '100%', fontWeight: 'bold', boxShadow: 3, fontSize: '1rem' }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}