import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Paper, Button, FormControl, InputLabel, Select, MenuItem,
  Snackbar, Alert, InputAdornment, TextField, Switch, FormControlLabel, 
  Divider, Stack, Chip, ListItemText 
} from '@mui/material';
import Grid from '@mui/material/Grid'; // MUI v6 Standard

import { doc, setDoc, Timestamp, collection, onSnapshot, addDoc, deleteDoc } from 'firebase/firestore';
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
import InventoryIcon from '@mui/icons-material/Inventory';
import SortIcon from '@mui/icons-material/Sort'; // THE FIX: New Icon for Sorting

// Expanded, Neutral Brand Colors for the Color Picker
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
  const[toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  // --- CONFIGURATION STATE ---
  const [settings, setSettings] = useState({
    openHour: 8, closeHour: 17,
    lunchEnabled: true, lunchStart: 12, lunchEnd: 13,
    minSlotInterval: 30, advanceNoticeMins: 120, maxFutureBookingDays: 30, maxPetsPerBooking: 3,
    maxCages: 5, autoNoShowMins: 30, trafficModerate: 6, trafficHigh: 13
  });

  // --- DYNAMIC STATES ---
  const [departments, setDepartments] = useState([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newDepartmentColor, setNewDepartmentColor] = useState('#1565C0'); // Valid default
  const [deptSearch, setDeptSearch] = useState('');
  const[deptSort, setDeptSort] = useState('asc'); // THE FIX: Sort state for Departments

  const [invCategories, setInvCategories] = useState([]);
  const [newInvCatName, setNewInvCatName] = useState('');
  const[invCatSearch, setInvCatSearch] = useState('');
  const [invCatSort, setInvCatSort] = useState('asc'); // THE FIX: Sort state for Inventory

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
      setDepartments(depts);
    });

    // 3. Fetch Inventory Categories
    const unsubInvCats = onSnapshot(collection(db, "inventory_categories"), (snapshot) => {
      const cats = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setInvCategories(cats);
    });

    return () => { unsubSettings(); unsubDepts(); unsubInvCats(); };
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

  // --- INVENTORY CATEGORY CRUD ---
  const handleAddInvCategory = async () => {
    if (!newInvCatName.trim()) return setToast({ open: true, message: 'Category name is required.', severity: 'warning' });
    const isDuplicate = invCategories.some(d => d.name.toLowerCase() === newInvCatName.trim().toLowerCase());
    if (isDuplicate) return setToast({ open: true, message: 'Category already exists!', severity: 'error' });
    try {
        await addDoc(collection(db, "inventory_categories"), { name: newInvCatName.trim() });
        setNewInvCatName('');
        setToast({ open: true, message: 'Category Added.', severity: 'success' });
    } catch (e) { setToast({ open: true, message: e.message, severity: 'error' }); }
  };

  const handleDeleteInvCategory = async (id, name) => {
    if (window.confirm(`Delete the "${name}" category?`)) {
      try {
          await deleteDoc(doc(db, "inventory_categories", id));
          setToast({ open: true, message: 'Category Deleted.', severity: 'success' });
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
    // THE FIX: Applying overflowX: 'hidden' at the topmost level of this specific page, clipping the Windows 100vw bug!
    <Box sx={{ p: { xs: 2, md: 4 }, minHeight: 'calc(100vh - 64px)', bgcolor: 'transparent', overflowX: 'hidden' }}>
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: '900', color: '#5D4037', display: 'flex', alignItems: 'center', gap: 1, textShadow: '0px 1px 2px rgba(255,255,255,0.8)' }}>
          <SettingsSuggestIcon fontSize="large" sx={{ color: '#8B4513' }} /> Clinic Configuration
        </Typography>
        <Button variant="contained" color="success" size="large" startIcon={<SaveIcon />} onClick={handleSave} disabled={loading} sx={{ fontWeight: '900', px: 4, py: 1.5, boxShadow: '0 4px 12px rgba(46, 125, 50, 0.3)', borderRadius: 2 }}>
          {loading ? "Saving..." : "Save Configuration"}
        </Button>
      </Box>

      {/* THE FIX: Replaced old Grid syntax and removed the broken wrapper */}
      <Grid container spacing={4}>
        
        {/* PILLAR 1: OPERATING HOURS */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper elevation={0} sx={{ ...glassStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: 'rgba(21, 101, 192, 0.05)', px: 3, py: 2, borderBottom: '1px solid rgba(0,0,0,0.05)', borderLeft: '4px solid #1565C0' }}>
              <Typography variant="subtitle1" color="#1565C0" fontWeight="900" sx={{ display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}><AccessTimeIcon /> Operating Hours</Typography>
            </Box>
            <Box sx={{ p: 4, flexGrow: 1, bgcolor: 'rgba(255,255,255,0.6)' }}>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 4, fontWeight: '500' }}>Controls the mobile app's booking calendar boundaries.</Typography>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white', borderRadius: 1 }}><InputLabel>Clinic Opens</InputLabel><Select value={settings.openHour} label="Clinic Opens" onChange={(e) => handleChange('openHour', e.target.value)}>{hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}</Select></FormControl>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white', borderRadius: 1 }}><InputLabel>Clinic Closes</InputLabel><Select value={settings.closeHour} label="Clinic Closes" onChange={(e) => handleChange('closeHour', e.target.value)}>{hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}</Select></FormControl>
                </Grid>
                <Grid size={{ xs: 12 }}><Divider sx={{ my: 1 }} /><FormControlLabel control={<Switch checked={settings.lunchEnabled} onChange={(e) => handleChange('lunchEnabled', e.target.checked)} color="primary" />} label={<Typography fontWeight="bold" color="primary">Enforce Lunch Break</Typography>} /></Grid>
                {settings.lunchEnabled && (
                    <>
                        <Grid size={{ xs: 6 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 1 }}><InputLabel>Start</InputLabel><Select value={settings.lunchStart} label="Start" onChange={(e) => handleChange('lunchStart', e.target.value)}>{hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}</Select></FormControl></Grid>
                        <Grid size={{ xs: 6 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 1 }}><InputLabel>End</InputLabel><Select value={settings.lunchEnd} label="End" onChange={(e) => handleChange('lunchEnd', e.target.value)}>{hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}</Select></FormControl></Grid>
                    </>
                )}
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 2: BOOKING ENGINE RULES */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper elevation={0} sx={{ ...glassStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: 'rgba(230, 81, 0, 0.05)', px: 3, py: 2, borderBottom: '1px solid rgba(0,0,0,0.05)', borderLeft: '4px solid #E65100' }}>
              <Typography variant="subtitle1" color="#E65100" fontWeight="900" sx={{ display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}><EventBusyIcon /> Client Limitations</Typography>
            </Box>
            <Box sx={{ p: 4, flexGrow: 1, bgcolor: 'rgba(255,255,255,0.6)' }}>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 4, fontWeight: '500' }}>Protects the clinic from schedule hoarding and last-minute bookings.</Typography>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}><FormControl fullWidth size="medium" sx={{ bgcolor: 'white', borderRadius: 1 }}><InputLabel>Base Slot Interval</InputLabel><Select value={settings.minSlotInterval} label="Base Slot Interval" onChange={(e) => handleChange('minSlotInterval', e.target.value)}><MenuItem value={15}>15 Minutes</MenuItem><MenuItem value={30}>30 Minutes</MenuItem><MenuItem value={45}>45 Minutes</MenuItem><MenuItem value={60}>60 Minutes</MenuItem></Select></FormControl></Grid>
                <Grid size={{ xs: 12 }}><FormControl fullWidth size="medium" sx={{ bgcolor: 'white', borderRadius: 1 }}><InputLabel>Advance Notice Buffer</InputLabel><Select value={settings.advanceNoticeMins} label="Advance Notice Buffer" onChange={(e) => handleChange('advanceNoticeMins', e.target.value)}><MenuItem value={0}>0 Mins (Allow immediate walk-ins)</MenuItem><MenuItem value={30}>30 Minutes</MenuItem><MenuItem value={60}>1 Hour</MenuItem><MenuItem value={120}>2 Hours</MenuItem><MenuItem value={1440}>24 Hours (Next-day only)</MenuItem></Select></FormControl></Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth label="Future Limit" type="number" value={settings.maxFutureBookingDays} onChange={(e) => handleChange('maxFutureBookingDays', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">Days</InputAdornment> }} sx={{ bgcolor: 'white', borderRadius: 1 }} /></Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth label="Max Pets" type="number" value={settings.maxPetsPerBooking} onChange={(e) => handleChange('maxPetsPerBooking', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">Pets</InputAdornment> }} sx={{ bgcolor: 'white', borderRadius: 1 }} helperText="Per booking" /></Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 3: CAPACITY & TRIAGE */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper elevation={0} sx={{ ...glassStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: 'rgba(46, 125, 50, 0.05)', px: 3, py: 2, borderBottom: '1px solid rgba(0,0,0,0.05)', borderLeft: '4px solid #2E7D32' }}>
              <Typography variant="subtitle1" color="#2E7D32" fontWeight="900" sx={{ display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}><LocalHospitalIcon /> Capacity & Triage</Typography>
            </Box>
            <Box sx={{ p: 4, flexGrow: 1, bgcolor: 'rgba(255,255,255,0.6)' }}>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 4, fontWeight: '500' }}>Controls physical clinic limits and algorithmic traffic warnings.</Typography>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}><TextField fullWidth label="Max Confinement Cages" type="number" value={settings.maxCages} onChange={(e) => handleChange('maxCages', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">Cages</InputAdornment> }} sx={{ bgcolor: 'white', borderRadius: 1 }} helperText="Blocks admission" /></Grid>
                <Grid size={{ xs: 12 }}><Divider sx={{ my: 1 }} /></Grid>
                <Grid size={{ xs: 12 }}><TextField fullWidth label="Auto-No-Show Trigger" type="number" value={settings.autoNoShowMins} onChange={(e) => handleChange('autoNoShowMins', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">Mins Late</InputAdornment> }} sx={{ bgcolor: 'white', borderRadius: 1 }} helperText="Mins late before Queue displays No-Show button." /></Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth label="Moderate Traffic" type="number" value={settings.trafficModerate} onChange={(e) => handleChange('trafficModerate', e.target.value)} sx={{ bgcolor: 'white', borderRadius: 1 }} helperText="Patients" /></Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth label="High Traffic" type="number" value={settings.trafficHigh} onChange={(e) => handleChange('trafficHigh', e.target.value)} sx={{ bgcolor: 'white', borderRadius: 1 }} helperText="Patients" /></Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 4: DYNAMIC DEPARTMENTS */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper elevation={0} sx={{ ...glassStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: 'rgba(93, 64, 55, 0.05)', px: 3, py: 2, borderBottom: '1px solid rgba(0,0,0,0.05)', borderLeft: '4px solid #5D4037' }}>
              <Typography variant="subtitle1" color="#5D4037" fontWeight="900" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <DomainIcon /> Clinic Departments / Categories
              </Typography>
            </Box>
            <Box sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.6)', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              
              {/* THE FIX: Fixed minHeight on description creates perfect alignment with the Inventory Card */}
              <Typography variant="body2" color="textSecondary" sx={{ mb: 3, fontWeight: '500', minHeight: 40 }}>
                These departments drive the Skill-Based Routing Engine and the color-coding system.
              </Typography>
              
              <Stack direction="row" spacing={2} sx={{ mb: 4, alignItems: 'center' }}>
                <TextField label="New Department Name" size="small" value={newDepartmentName} onChange={(e) => setNewDepartmentName(e.target.value)} sx={{ flexGrow: 1, bgcolor: 'white', borderRadius: 1 }} inputProps={{ spellCheck: 'false' }}/>
                
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

              {/* THE FIX: Added Sort Dropdown next to Quick Find */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField 
                  placeholder="🔍 Quick find department..." size="small" fullWidth
                  value={deptSearch} onChange={(e) => setDeptSearch(e.target.value)}
                  sx={{ bgcolor: 'rgba(255,255,255,0.9)', borderRadius: 1, '& fieldset': { borderColor: '#E0E0E0' } }}
                />
                <FormControl size="small" sx={{ width: 140, bgcolor: 'rgba(255,255,255,0.9)', borderRadius: 1 }}>
                  <Select value={deptSort} onChange={e => setDeptSort(e.target.value)} displayEmpty sx={{ '& fieldset': { border: 'none' }, fontWeight: 'bold', color: '#555' }}>
                    <MenuItem value="asc">A - Z</MenuItem>
                    <MenuItem value="desc">Z - A</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, p: 2.5, bgcolor: 'rgba(250,250,250,0.8)', borderRadius: 2, border: '1px inset rgba(0,0,0,0.1)', flexGrow: 1, height: 180, overflowY: 'auto', alignContent: 'flex-start' }}>
                {/* THE FIX: Sorts the array dynamically before mapping! */}
                {[...departments]
                  .sort((a, b) => deptSort === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))
                  .filter(d => d.name.toLowerCase().includes(deptSearch.toLowerCase()))
                  .map(dept => (
                    <Chip 
                      key={dept.id} 
                      label={dept.name} 
                      onDelete={() => handleDeleteDepartment(dept.id, dept.name)}
                      sx={{ fontWeight: 'bold', color: 'white', bgcolor: dept.color || '#616161', border: '2px solid rgba(0,0,0,0.1)', fontSize: '0.9rem', py: 2.5, px: 1, '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)', '&:hover': { color: 'white' } } }}
                    />
                ))}
                {departments.filter(d => d.name.toLowerCase().includes(deptSearch.toLowerCase())).length === 0 && (<Typography variant="body2" color="textSecondary" sx={{ width: '100%', textAlign: 'center', mt: 4, fontStyle: 'italic' }}>No departments match your search.</Typography>)}
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 5: INVENTORY CATEGORIES */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper elevation={0} sx={{ ...glassStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: 'rgba(139, 69, 19, 0.05)', px: 3, py: 2, borderBottom: '1px solid rgba(0,0,0,0.05)', borderLeft: '4px solid #8B4513' }}>
              <Typography variant="subtitle1" color="#8B4513" fontWeight="900" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <InventoryIcon /> Inventory Categories
              </Typography>
            </Box>
            <Box sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.6)', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              
              {/* THE FIX: Fixed minHeight enforces bottom alignment! */}
              <Typography variant="body2" color="textSecondary" sx={{ mb: 3, fontWeight: '500', minHeight: 40 }}>
                Manage the taxonomy of your pharmacy and retail shop. These categories organize your search filters and financial reports.
              </Typography>
              
              <Stack direction="row" spacing={2} sx={{ mb: 4, alignItems: 'center' }}>
                <TextField 
                  label="New Category Name" size="small" value={newInvCatName} 
                  onChange={(e) => setNewInvCatName(e.target.value)} 
                  sx={{ flexGrow: 1, bgcolor: 'white', borderRadius: 1 }}
                  inputProps={{ spellCheck: 'false' }}
                />
                <Button 
                  variant="contained" 
                  onClick={handleAddInvCategory} 
                  startIcon={<AddCircleOutlineIcon/>}
                  sx={{ bgcolor: '#8B4513', fontWeight: 'bold', px: 4, py: 1 }}
                >
                  Add
                </Button>
              </Stack>

              {/* THE FIX: Added Sort Dropdown next to Quick Find */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField 
                  placeholder="🔍 Quick find category..." size="small" fullWidth
                  value={invCatSearch} onChange={(e) => setInvCatSearch(e.target.value)}
                  sx={{ bgcolor: 'rgba(255,255,255,0.9)', borderRadius: 1, '& fieldset': { borderColor: '#E0E0E0' } }}
                />
                <FormControl size="small" sx={{ width: 140, bgcolor: 'rgba(255,255,255,0.9)', borderRadius: 1 }}>
                  <Select value={invCatSort} onChange={e => setInvCatSort(e.target.value)} displayEmpty sx={{ '& fieldset': { border: 'none' }, fontWeight: 'bold', color: '#555' }}>
                    <MenuItem value="asc">A - Z</MenuItem>
                    <MenuItem value="desc">Z - A</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, p: 2.5, bgcolor: 'rgba(250,250,250,0.8)', borderRadius: 2, border: '1px inset rgba(0,0,0,0.1)', flexGrow: 1, height: 180, overflowY: 'auto', alignContent: 'flex-start' }}>
                {/* THE FIX: Sorts the array dynamically before mapping! */}
                {[...invCategories]
                  .sort((a, b) => invCatSort === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))
                  .filter(c => c.name.toLowerCase().includes(invCatSearch.toLowerCase()))
                  .map(cat => (
                  <Chip 
                    key={cat.id} label={cat.name} 
                    onDelete={() => handleDeleteInvCategory(cat.id, cat.name)}
                    sx={{ fontWeight: 'bold', bgcolor: 'white', border: '1px solid #ccc', fontSize: '0.85rem', py: 2 }}
                  />
                ))}
                {invCategories.filter(c => c.name.toLowerCase().includes(invCatSearch.toLowerCase())).length === 0 && (
                  <Typography variant="body2" color="textSecondary" sx={{ width: '100%', textAlign: 'center', mt: 4, fontStyle: 'italic' }}>No categories match your search.</Typography>
                )}
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