// Global config. Allows managers to dynamically alter clinic open/close times and booking buffer rules 
// without touching source code.

import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Paper, Button, FormControl, InputLabel, Select, MenuItem,
  Snackbar, Alert, InputAdornment, TextField, Grid
} from '@mui/material';

import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import SaveIcon from '@mui/icons-material/Save';

export default function Settings() {
  const[loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  // Default Fallbacks
  const [settings, setSettings] = useState({
    openHour: 8,
    closeHour: 17,
    advanceNoticeMins: 120,
    maxFutureBookingDays: 30
  });

  // --- GLASSMORPHISM STYLE ---
  const glassStyle = {
    background: 'rgba(255, 255, 255, 0.55)', 
    backdropFilter: 'blur(16px)', 
    WebkitBackdropFilter: 'blur(16px)', 
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
      const docRef = doc(db, "clinic_settings", "general");
      await setDoc(docRef, {
        ...settings,
        updatedAt: Timestamp.now(),
        updatedBy: "Admin"
      }, { merge: true });
      
      setToast({ open: true, message: 'Global Clinic Settings Updated Successfully!', severity: 'success' });
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
    <Box sx={{ p: { xs: 2, md: 4 }, minHeight: 'calc(100vh - 64px)' }}>
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#5D4037', display: 'flex', alignItems: 'center', gap: 1, textShadow: '0px 1px 2px rgba(255,255,255,0.8)' }}>
          <SettingsSuggestIcon fontSize="large" sx={{ color: '#8B4513' }} /> Global Configuration
        </Typography>
        <Button 
          variant="contained" color="success" size="large" 
          startIcon={<SaveIcon />} onClick={handleSave} disabled={loading}
          sx={{ fontWeight: 'bold', px: 4, boxShadow: '0 4px 12px rgba(46, 125, 50, 0.3)' }}
        >
          {loading ? "Saving..." : "Save Settings"}
        </Button>
      </Box>

      <Grid container spacing={4}>
        
        {/* CARD 1: CLINIC HOURS */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper elevation={0} sx={{ ...glassStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>

            <Box sx={{ bgcolor: 'rgba(255,255,255,0.7)', px: 3, py: 2, borderBottom: '1px solid rgba(255,255,255,0.5)', borderLeft: '4px solid #1565C0' }}>
              <Typography variant="subtitle1" color="#1565C0" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <AccessTimeIcon /> Clinic Operating Hours
              </Typography>
            </Box>

            <Box sx={{ p: 4, flexGrow: 1 }}>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 4 }}>
                These hours dictate the first and last available time slots on the Mobile App's booking calendar.
              </Typography>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white', borderRadius: 1 }}>
                    <InputLabel>Opening Time (First Slot)</InputLabel>
                    <Select value={settings.openHour} label="Opening Time (First Slot)" onChange={(e) => handleChange('openHour', e.target.value)}>
                      {hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white', borderRadius: 1 }}>
                    <InputLabel>Closing Time (Last Slot Finish)</InputLabel>
                    <Select value={settings.closeHour} label="Closing Time (Last Slot Finish)" onChange={(e) => handleChange('closeHour', e.target.value)}>
                      {hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* CARD 2: SCHEDULING RULES */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper elevation={0} sx={{ ...glassStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
 
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.7)', px: 3, py: 2, borderBottom: '1px solid rgba(255,255,255,0.5)', borderLeft: '4px solid #E65100' }}>
              <Typography variant="subtitle1" color="#E65100" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <EventBusyIcon /> Smart Routing Rules
              </Typography>
            </Box>

            <Box sx={{ p: 4, flexGrow: 1 }}>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 4 }}>
                Configure the anti-teleportation lead time and maximum future booking limits.
              </Typography>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white', borderRadius: 1 }}>
                    <InputLabel>Advance Notice Lead Time (Buffer)</InputLabel>
                    <Select value={settings.advanceNoticeMins} label="Advance Notice Lead Time (Buffer)" onChange={(e) => handleChange('advanceNoticeMins', e.target.value)}>
                      <MenuItem value={0}>0 Mins (Allow immediate walk-in bookings)</MenuItem>
                      <MenuItem value={15}>15 Minutes</MenuItem>
                      <MenuItem value={30}>30 Minutes</MenuItem>
                      <MenuItem value={60}>1 Hour</MenuItem>
                      <MenuItem value={120}>2 Hours</MenuItem>
                      <MenuItem value={1440}>24 Hours (Next-day only)</MenuItem>
                    </Select>
                  </FormControl>
                  <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5, display: 'block', fontStyle: 'italic' }}>
                    Prevents clients from booking a slot that is too close to the current time.
                  </Typography>
                </Grid>

                <Grid size={{ xs: 12 }}>
                  <TextField 
                    fullWidth label="Max Future Booking Window" type="number" 
                    value={settings.maxFutureBookingDays} onChange={(e) => handleChange('maxFutureBookingDays', parseInt(e.target.value))}
                    InputProps={{ endAdornment: <InputAdornment position="end">Days</InputAdornment> }}
                    sx={{ bgcolor: 'white', borderRadius: 1 }}
                  />
                  <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5, display: 'block', fontStyle: 'italic' }}>
                    How far in advance can clients schedule appointments? (e.g., 30 days).
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast({...toast, open: false})} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setToast({...toast, open: false})} severity={toast.severity} sx={{ width: '100%', fontWeight: 'bold', boxShadow: 3 }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}