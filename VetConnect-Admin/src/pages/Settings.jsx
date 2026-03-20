import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Paper, Button, FormControl, InputLabel, Select, MenuItem,
  Snackbar, Alert, InputAdornment, TextField, Grid, Switch, FormControlLabel, Divider
} from '@mui/material';

import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import SaveIcon from '@mui/icons-material/Save';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';

export default function Settings() {
  const [loading, setLoading] = useState(false);
  const[toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  // --- THE ULTIMATE CONFIGURATION STATE ---
  const [settings, setSettings] = useState({
    // 1. Operating Hours
    openHour: 8,
    closeHour: 17,
    lunchEnabled: true,
    lunchStart: 12,
    lunchEnd: 13,
    
    // 2. Booking Engine
    minSlotInterval: 30,
    advanceNoticeMins: 120,
    maxFutureBookingDays: 30,
    maxPetsPerBooking: 3,
    
    // 3. Clinic Capacity
    maxCages: 5,
    autoNoShowMins: 30,
    trafficModerate: 6,
    trafficHigh: 13
  });

  const glassStyle = {
    background: 'rgba(255, 255, 255, 0.55)', 
    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', 
    border: '1px solid rgba(255, 255, 255, 0.8)', 
    boxShadow: '0 8px 32px 0 rgba(139, 69, 19, 0.08)', 
    borderRadius: 3, 
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "clinic_settings", "general");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSettings(prev => ({ ...prev, ...docSnap.data() }));
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      }
    };
    fetchSettings();
  },[]);

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Data Sanitization: Ensure all number fields are actually numbers!
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

      const docRef = doc(db, "clinic_settings", "general");
      await setDoc(docRef, {
        ...sanitizedSettings,
        updatedAt: Timestamp.now(),
        updatedBy: "Admin"
      }, { merge: true });
      
      setToast({ open: true, message: 'Global Clinic Settings Updated Successfully! Mobile App will adapt instantly.', severity: 'success' });
    } catch (error) {
      setToast({ open: true, message: error.message, severity: 'error' });
    } finally {
      setLoading(false);
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
        <Button 
          variant="contained" color="success" size="large" 
          startIcon={<SaveIcon />} onClick={handleSave} disabled={loading}
          sx={{ fontWeight: '900', px: 4, py: 1.5, boxShadow: '0 4px 12px rgba(46, 125, 50, 0.3)', borderRadius: 2 }}
        >
          {loading ? "Saving System Variables..." : "Save Configuration"}
        </Button>
      </Box>

      {/* USING STANDARD MUI GRID FOR NO CONSOLE WARNINGS */}
      <Grid container spacing={4}>
        
        {/* PILLAR 1: OPERATING HOURS */}
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ ...glassStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: 'rgba(21, 101, 192, 0.05)', px: 3, py: 2, borderBottom: '1px solid rgba(0,0,0,0.05)', borderLeft: '4px solid #1565C0' }}>
              <Typography variant="subtitle1" color="#1565C0" fontWeight="900" sx={{ display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <AccessTimeIcon /> Operating Hours
              </Typography>
            </Box>
            <Box sx={{ p: 4, flexGrow: 1, bgcolor: 'rgba(255,255,255,0.6)' }}>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 4, fontWeight: '500' }}>
                Defines the absolute boundaries of the Tetris Scheduling Algorithm on the Mobile App.
              </Typography>

              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white', borderRadius: 1 }}>
                    <InputLabel>Clinic Opens</InputLabel>
                    <Select value={settings.openHour} label="Clinic Opens" onChange={(e) => handleChange('openHour', e.target.value)}>
                      {hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white', borderRadius: 1 }}>
                    <InputLabel>Clinic Closes (Last Slot Finish)</InputLabel>
                    <Select value={settings.closeHour} label="Clinic Closes (Last Slot Finish)" onChange={(e) => handleChange('closeHour', e.target.value)}>
                      {hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                    <FormControlLabel 
                        control={<Switch checked={settings.lunchEnabled} onChange={(e) => handleChange('lunchEnabled', e.target.checked)} color="primary" />} 
                        label={<Typography fontWeight="bold" color="primary">Enforce Staff Lunch Break</Typography>} 
                    />
                </Grid>

                {settings.lunchEnabled && (
                    <>
                        <Grid item xs={6}>
                            <FormControl fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 1 }}>
                                <InputLabel>Lunch Start</InputLabel>
                                <Select value={settings.lunchStart} label="Lunch Start" onChange={(e) => handleChange('lunchStart', e.target.value)}>
                                    {hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={6}>
                            <FormControl fullWidth size="small" sx={{ bgcolor: 'white', borderRadius: 1 }}>
                                <InputLabel>Lunch End</InputLabel>
                                <Select value={settings.lunchEnd} label="Lunch End" onChange={(e) => handleChange('lunchEnd', e.target.value)}>
                                    {hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
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
              <Typography variant="subtitle1" color="#E65100" fontWeight="900" sx={{ display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <EventBusyIcon /> Client Limitations
              </Typography>
            </Box>

            <Box sx={{ p: 4, flexGrow: 1, bgcolor: 'rgba(255,255,255,0.6)' }}>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 4, fontWeight: '500' }}>
                Protects the clinic from schedule hoarding and impossible last-minute bookings.
              </Typography>

              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white', borderRadius: 1 }}>
                    <InputLabel>Base Slot Interval</InputLabel>
                    <Select value={settings.minSlotInterval} label="Base Slot Interval" onChange={(e) => handleChange('minSlotInterval', e.target.value)}>
                      <MenuItem value={15}>15 Minutes (High Volume)</MenuItem>
                      <MenuItem value={30}>30 Minutes (Standard)</MenuItem>
                      <MenuItem value={45}>45 Minutes (Extended)</MenuItem>
                      <MenuItem value={60}>60 Minutes (Specialist)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white', borderRadius: 1 }}>
                    <InputLabel>Anti-Teleportation Buffer</InputLabel>
                    <Select value={settings.advanceNoticeMins} label="Anti-Teleportation Buffer" onChange={(e) => handleChange('advanceNoticeMins', e.target.value)}>
                      <MenuItem value={0}>0 Mins (Allow immediate walk-in app bookings)</MenuItem>
                      <MenuItem value={30}>30 Minutes</MenuItem>
                      <MenuItem value={60}>1 Hour</MenuItem>
                      <MenuItem value={120}>2 Hours</MenuItem>
                      <MenuItem value={1440}>24 Hours (Next-day only)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={6}>
                  <TextField 
                    fullWidth label="Future Limit" type="number" 
                    value={settings.maxFutureBookingDays} onChange={(e) => handleChange('maxFutureBookingDays', e.target.value)}
                    InputProps={{ endAdornment: <InputAdornment position="end">Days</InputAdornment> }}
                    sx={{ bgcolor: 'white', borderRadius: 1 }}
                  />
                </Grid>

                <Grid item xs={6}>
                  <TextField 
                    fullWidth label="Max Pets" type="number" 
                    value={settings.maxPetsPerBooking} onChange={(e) => handleChange('maxPetsPerBooking', e.target.value)}
                    InputProps={{ endAdornment: <InputAdornment position="end">Pets</InputAdornment> }}
                    sx={{ bgcolor: 'white', borderRadius: 1 }}
                    helperText="Per booking limit"
                  />
                </Grid>

              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 3: CAPACITY & TRIAGE */}
        <Grid item xs={12} md={4}>
          <Paper elevation={0} sx={{ ...glassStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: 'rgba(46, 125, 50, 0.05)', px: 3, py: 2, borderBottom: '1px solid rgba(0,0,0,0.05)', borderLeft: '4px solid #2E7D32' }}>
              <Typography variant="subtitle1" color="#2E7D32" fontWeight="900" sx={{ display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <LocalHospitalIcon /> Capacity & Triage
              </Typography>
            </Box>

            <Box sx={{ p: 4, flexGrow: 1, bgcolor: 'rgba(255,255,255,0.6)' }}>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 4, fontWeight: '500' }}>
                Controls physical clinic limits and the algorithmic traffic warning thresholds.
              </Typography>

              <Grid container spacing={3}>
                
                <Grid item xs={12}>
                  <TextField 
                    fullWidth label="Maximum Confinement Cages" type="number" 
                    value={settings.maxCages} onChange={(e) => handleChange('maxCages', e.target.value)}
                    InputProps={{ endAdornment: <InputAdornment position="end">Cages</InputAdornment> }}
                    sx={{ bgcolor: 'white', borderRadius: 1 }}
                    helperText="Blocks admission when clinic hits this number."
                  />
                </Grid>

                <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                </Grid>

                <Grid item xs={12}>
                  <TextField 
                    fullWidth label="Auto-No-Show Trigger" type="number" 
                    value={settings.autoNoShowMins} onChange={(e) => handleChange('autoNoShowMins', e.target.value)}
                    InputProps={{ endAdornment: <InputAdornment position="end">Mins</InputAdornment> }}
                    sx={{ bgcolor: 'white', borderRadius: 1 }}
                    helperText="Mins late before Queue displays No-Show button."
                  />
                </Grid>

                <Grid item xs={6}>
                  <TextField 
                    fullWidth label="Moderate Traffic" type="number" 
                    value={settings.trafficModerate} onChange={(e) => handleChange('trafficModerate', e.target.value)}
                    sx={{ bgcolor: 'white', borderRadius: 1 }}
                    helperText="Patients active"
                  />
                </Grid>
                
                <Grid item xs={6}>
                  <TextField 
                    fullWidth label="High Traffic" type="number" 
                    value={settings.trafficHigh} onChange={(e) => handleChange('trafficHigh', e.target.value)}
                    sx={{ bgcolor: 'white', borderRadius: 1 }}
                    helperText="Patients active"
                  />
                </Grid>

              </Grid>
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