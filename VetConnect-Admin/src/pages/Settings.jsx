import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, FormControl, InputLabel, Select, MenuItem,
  Snackbar, Alert, InputAdornment, TextField, Switch, FormControlLabel,
  Divider, Stack, Chip, ListItemText, ToggleButton, ToggleButtonGroup,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import Grid from '@mui/material/Grid'; // MUI v6 Standard
import { styled } from '@mui/material/styles';

import { doc, setDoc, Timestamp, collection, onSnapshot, addDoc, deleteDoc, getDocs } from 'firebase/firestore';
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
import SortIcon from '@mui/icons-material/Sort'; 
import MedicationIcon from '@mui/icons-material/Medication';
import MedicationLiquidIcon from '@mui/icons-material/MedicationLiquid';
import BlockIcon from '@mui/icons-material/Block';

// Design Tokens
import { FONT, TYPE, COLORS } from '../theme/designTokens';
import { useUser } from '../context/UserContext';

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

// 💊 THE BE-SPOKE MEDICINE PILL SWITCH
const MedicinePillSwitch = styled(Switch)(({ theme }) => ({
  width: 62, height: 34, padding: 7,
  '& .MuiSwitch-switchBase': {
    margin: 1, padding: 0,
    transform: 'translateX(6px)',
    '&.Mui-checked': {
      color: '#fff',
      transform: 'translateX(22px)',
      '& .MuiSwitch-thumb:before': {
        background: 'linear-gradient(180deg, #D32F2F 50%, #FFFFFF 50%)', // Red/White Pill
      },
      '& + .MuiSwitch-track': {
        opacity: 1,
        backgroundColor: '#D32F2F20',
        border: '2px solid #D32F2F',
      },
    },
  },
  '& .MuiSwitch-thumb': {
    backgroundColor: '#fff',
    width: 32, height: 32,
    '&:before': {
      content: "''",
      position: 'absolute',
      width: '100%', height: '100%',
      left: 0, top: 0,
      background: 'linear-gradient(180deg, #9E9E9E 50%, #E0E0E0 50%)',
      borderRadius: '50%',
    },
  },
  '& .MuiSwitch-track': {
    opacity: 1,
    backgroundColor: '#00000010',
    borderRadius: 20,
    border: '2px solid #9E9E9E',
  },
}));

export default function Settings() {
  const { profile, isAdmin } = useUser();
  const [loading, setLoading] = useState(false);
  const[toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  // --- STYLING MACROS ---
  const forensicHeaderStyle = {
    bgcolor: '#FFF8E1', 
    border: `2px solid ${COLORS.accent}`,
    borderRadius: 0,
    boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
  };

  const clinicalFlatStyle = {
    bgcolor: 'white',
    border: `2px solid ${COLORS.accent}`,
    borderRadius: 0,
    boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
  };

  // --- CONFIGURATION STATE ---
  const [settings, setSettings] = useState({
    openHour: 8, closeHour: 17,
    lunchEnabled: true, lunchStart: 12, lunchEnd: 13,
    minSlotInterval: 30, advanceNoticeMins: 120, maxFutureBookingDays: 30, maxPetsPerBooking: 3,
    maxCages: 5, autoNoShowMins: 30, trafficModerate: 6, trafficHigh: 13,
    clinicPhone: '',
    workingDays: [1, 2, 3, 4, 5, 6, 0] // [0:Sun, 1:Mon... 6:Sat]
  });

  // --- DYNAMIC STATES ---
  const [departments, setDepartments] = useState([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newDepartmentColor, setNewDepartmentColor] = useState('#1565C0'); // Valid default
  const [deptSearch, setDeptSearch] = useState('');
  const[deptSort, setDeptSort] = useState('asc'); // THE FIX: Sort state for Departments

  const [invCategories, setInvCategories] = useState([]);
  const [newInvCatName, setNewInvCatName] = useState('');
  const [newInvCatIsMedicine, setNewInvCatIsMedicine] = useState(false); // 🧪 NEW: The Medicine Toggle
  const[invCatSearch, setInvCatSearch] = useState('');
  const [invCatSort, setInvCatSort] = useState('asc'); // THE FIX: Sort state for Inventory

  // --- CLOSED DATES STATE ---
  const [newClosedDate, setNewClosedDate] = useState('');

  // --- DIRTY TRACKING: Baseline for unsaved-changes detection ---
  const [lastSavedSettings, setLastSavedSettings] = useState(null);

  // --- CONFIRM DIALOG STATE ---
  const [confirmDelete, setConfirmDelete] = useState({ open: false, type: '', id: '', name: '' });

  // --- DEPENDENCY STATES (For Usage Shield) ---
  const [allServices, setAllServices] = useState([]);
  const [allStaff, setAllStaff] = useState([]);

  useEffect(() => {
    // 1. Fetch Global Settings
    const unsubSettings = onSnapshot(doc(db, "clinic_settings", "general"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings(prev => ({ ...prev, ...data }));
        // Seed the baseline only on first load — subsequent saves update it explicitly
        setLastSavedSettings(prev => prev === null ? {
          ...data,
          minSlotInterval: parseInt(data.minSlotInterval) || 30,
          maxPetsPerBooking: parseInt(data.maxPetsPerBooking) || 3,
          trafficModerate: parseInt(data.trafficModerate) || 5,
          trafficHigh: parseInt(data.trafficHigh) || 10,
          maxCages: parseInt(data.maxCages) || 5,
          advanceNoticeHours: parseInt(data.advanceNoticeHours) || 2,
          maxFutureBookingDays: parseInt(data.maxFutureBookingDays) || 30,
          autoNoShowMins: parseInt(data.autoNoShowMins) || 30,
        } : prev);
      }
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

    // 4. One-shot fetch for department usage counts (services + staff) —
    //    real-time updates are unnecessary here; refreshUsageCounts() re-fetches after mutations
    const fetchUsageCounts = async () => {
      const [servicesSnap, staffSnap] = await Promise.all([
        getDocs(collection(db, "services")),
        getDocs(collection(db, "users"))
      ]);
      setAllServices(servicesSnap.docs.map(d => d.data()));
      setAllStaff(staffSnap.docs.map(d => d.data()));
    };
    fetchUsageCounts();

    return () => { unsubSettings(); unsubDepts(); unsubInvCats(); };
  },[]);

  // --- NAVIGATION GUARD: Warn on unsaved changes to form fields ---
  const hasUnsavedChanges = React.useMemo(() => {
    if (!lastSavedSettings) return false;
    const tracked = ['openHour', 'closeHour', 'lunchEnabled', 'lunchStart', 'lunchEnd',
      'minSlotInterval', 'advanceNoticeMins', 'maxFutureBookingDays', 'maxPetsPerBooking',
      'maxCages', 'autoNoShowMins', 'trafficModerate', 'trafficHigh', 'workingDays', 'clinicPhone'];
    return tracked.some(key => JSON.stringify(settings[key]) !== JSON.stringify(lastSavedSettings[key]));
  }, [settings, lastSavedSettings]);

  useEffect(() => {
    const handler = (e) => {
      if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // --- ONE-SHOT USAGE COUNT REFRESH (called after dept add/delete) ---
  const refreshUsageCounts = async () => {
    try {
      const [servicesSnap, staffSnap] = await Promise.all([
        getDocs(collection(db, "services")),
        getDocs(collection(db, "users"))
      ]);
      setAllServices(servicesSnap.docs.map(d => d.data()));
      setAllStaff(staffSnap.docs.map(d => d.data()));
    } catch (e) {
      console.error('[Settings.refreshUsageCounts]:', e.message);
    }
  };

  const handleChange = (field, value) => { setSettings(prev => ({ ...prev, [field]: value })); };

  // --- SETTINGS AUDIT LOGGER ---
  const logSettingsEvent = async (action, entityType, entityName, details = {}) => {
    try {
      const who = profile?.fullName || profile?.email || 'Unknown Admin';
      await addDoc(collection(db, "settings_logs"), {
        action,       // 'CREATE' | 'DELETE' | 'UPDATE'
        entityType,   // 'department' | 'inventory_category' | 'clinic_settings'
        entityName,   // e.g. "Veterinary Medicine", "Oral Care"
        performedBy: who,
        performedAt: Timestamp.now(),
        ...details
      });
    } catch (e) {
      console.error('[Settings.logSettingsEvent]:', e.message);
    }
  };

  // --- VALIDATION ENGINE ---
  const validateSettings = () => {
    if (settings.openHour >= settings.closeHour) {
      return "Clinic Opening time must be earlier than the Closing time.";
    }
    if (settings.lunchEnabled) {
      if (settings.lunchStart >= settings.lunchEnd) {
        return "Lunch Start must be earlier than the Lunch End.";
      }
      if (settings.lunchStart < settings.openHour || settings.lunchEnd > settings.closeHour) {
        return "Lunch break must fall within clinic operating hours.";
      }
    }
    // Numeric bounds validation
    const slot = parseInt(settings.minSlotInterval);
    if (!slot || slot <= 0) {
      return "Base Slot Interval must be greater than 0.";
    }
    const maxPets = parseInt(settings.maxPetsPerBooking);
    if (!maxPets || maxPets < 1 || maxPets > 10) {
      return "Max Pets per Booking must be between 1 and 10.";
    }
    const modThresh = parseInt(settings.trafficModerate);
    const highThresh = parseInt(settings.trafficHigh);
    if (isNaN(modThresh) || isNaN(highThresh) || modThresh >= highThresh) {
      return "Moderate Traffic threshold must be less than High Traffic threshold.";
    }
    const cages = parseInt(settings.maxCages);
    if (isNaN(cages) || cages < 0) {
      return "Max Confinement Cages cannot be negative.";
    }
    const notice = parseInt(settings.advanceNoticeMins);
    if (isNaN(notice) || notice < 0) {
      return "Advance Notice Buffer cannot be negative.";
    }
    const futureDays = parseInt(settings.maxFutureBookingDays);
    if (!futureDays || futureDays < 1) {
      return "Future Booking Limit must be at least 1 day.";
    }
    const noShow = parseInt(settings.autoNoShowMins);
    if (!noShow || noShow < 1) {
      return "Auto No-Show Trigger must be at least 1 minute.";
    }
    if ((settings.workingDays || []).length === 0) {
      return "At least one working day must be selected.";
    }
    return null; // All systems go!
  };

  // --- SAVE SETTINGS ---
  const handleSave = async () => {
    const error = validateSettings();
    if (error) return setToast({ open: true, message: error, severity: 'error' });

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
      
      if ((settings.closedDates || []).length > 365) {
        setToast({ open: true, message: `Warning: ${settings.closedDates.length} closure dates configured. Consider auditing.`, severity: 'warning' });
      }

      const adminIdentity = profile?.fullName || profile?.email || "Unknown Admin";
      await setDoc(doc(db, "clinic_settings", "general"), {
          ...sanitizedSettings,
          updatedAt: Timestamp.now(),
          updatedBy: adminIdentity
      }, { merge: true });

      // Field-level diff for audit trail
      if (lastSavedSettings) {
        const tracked = ['openHour', 'closeHour', 'lunchEnabled', 'lunchStart', 'lunchEnd',
          'minSlotInterval', 'advanceNoticeMins', 'maxFutureBookingDays', 'maxPetsPerBooking',
          'maxCages', 'autoNoShowMins', 'trafficModerate', 'trafficHigh', 'workingDays', 'clinicPhone'];
        const changedFields = {};
        tracked.forEach(key => {
          if (JSON.stringify(sanitizedSettings[key]) !== JSON.stringify(lastSavedSettings[key])) {
            changedFields[key] = { from: lastSavedSettings[key], to: sanitizedSettings[key] };
          }
        });
        if (Object.keys(changedFields).length > 0) {
          await logSettingsEvent('UPDATE', 'clinic_settings', 'general', { changedFields });
        }
      }

      setLastSavedSettings({ ...sanitizedSettings });
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
        await logSettingsEvent('CREATE', 'department', newDepartmentName.trim(), { color: newDepartmentColor });
        await refreshUsageCounts();
        setNewDepartmentName('');
        setToast({ open: true, message: 'Department Added.', severity: 'success' });
    } catch (e) { setToast({ open: true, message: e.message, severity: 'error' }); }
  };

  const handleDeleteDepartment = async (id, name) => {
    // --- 🧬 THE USAGE SHIELD (Dependency Check) ---
    const staffCount = allStaff.filter(u => 
        u.role === 'staff' && 
        (Array.isArray(u.departments) ? u.departments.includes(name) : u.department === name)
    ).length;
    
    const serviceCount = allServices.filter(s => !s.isArchived && (s.department || s.category) === name).length;

    if (staffCount > 0 || serviceCount > 0) {
        return setToast({ 
            open: true, 
            message: `Department In Use: Assigned to ${staffCount} staff and ${serviceCount} services. Re-assign them first.`, 
            severity: 'error' 
        });
    }

    setConfirmDelete({ open: true, type: 'department', id, name });
  };

  // --- CLOSED DATES HANDLERS ---
  // Auto-persist on every add/remove — no Save button needed for closure dates
  const handleAddClosedDate = async () => {
    if (!newClosedDate) return;
    const existing = settings.closedDates || [];
    if (existing.includes(newClosedDate)) {
      return setToast({ open: true, message: 'Date already in closures list.', severity: 'warning' });
    }
    const next = [...existing, newClosedDate].sort();
    try {
      await setDoc(doc(db, "clinic_settings", "general"), { closedDates: next }, { merge: true });
      setNewClosedDate('');
      setToast({ open: true, message: 'Closure date added.', severity: 'success' });
    } catch (e) {
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  const handleRemoveClosedDate = async (dateStr) => {
    const next = (settings.closedDates || []).filter(d => d !== dateStr);
    try {
      await setDoc(doc(db, "clinic_settings", "general"), { closedDates: next }, { merge: true });
      setToast({ open: true, message: 'Closure date removed.', severity: 'success' });
    } catch (e) {
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  // --- INVENTORY CATEGORY CRUD ---
  const handleAddInvCategory = async () => {
    if (!newInvCatName.trim()) return setToast({ open: true, message: 'Category name is required.', severity: 'warning' });
    const isDuplicate = invCategories.some(d => d.name.toLowerCase() === newInvCatName.trim().toLowerCase());
    if (isDuplicate) return setToast({ open: true, message: 'Category already exists!', severity: 'error' });
    try {
        await addDoc(collection(db, "inventory_categories"), {
            name: newInvCatName.trim(),
            isMedicine: newInvCatIsMedicine
        });
        await logSettingsEvent('CREATE', 'inventory_category', newInvCatName.trim(), { isMedicine: newInvCatIsMedicine });
        setNewInvCatName('');
        setNewInvCatIsMedicine(false);
        setToast({ open: true, message: 'Category Added.', severity: 'success' });
    } catch (e) { setToast({ open: true, message: e.message, severity: 'error' }); }
  };

  const handleDeleteInvCategory = async (id, name) => {
    // T2.31: Default categories cannot be deleted — protected both here and in Firestore rules
    if (id.startsWith('default_')) {
      return setToast({ open: true, message: `"${name}" is a system default category and cannot be deleted.`, severity: 'warning' });
    }
    // Usage shield: block delete if active inventory items reference this category
    try {
      const invSnap = await getDocs(collection(db, "inventory"));
      const itemCount = invSnap.docs.filter(d => {
        const data = d.data();
        return !data.isArchived && data.category?.toLowerCase() === name.toLowerCase();
      }).length;

      if (itemCount > 0) {
        return setToast({
          open: true,
          message: `Category In Use: ${itemCount} inventory item${itemCount > 1 ? 's' : ''} assigned to "${name}". Re-assign or archive them first.`,
          severity: 'error'
        });
      }

      setConfirmDelete({ open: true, type: 'category', id, name });
    } catch (e) {
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  // --- CONFIRM DELETE HANDLER (used by MUI dialog for dept + category deletes) ---
  const handleConfirmDelete = async () => {
    const { type, id, name } = confirmDelete;
    setConfirmDelete({ open: false, type: '', id: '', name: '' });
    try {
      if (type === 'department') {
        await deleteDoc(doc(db, "departments", id));
        await logSettingsEvent('DELETE', 'department', name);
        await refreshUsageCounts();
        setToast({ open: true, message: 'Department Deleted.', severity: 'success' });
      } else if (type === 'category') {
        await deleteDoc(doc(db, "inventory_categories", id));
        await logSettingsEvent('DELETE', 'inventory_category', name);
        setToast({ open: true, message: 'Category Deleted.', severity: 'success' });
      }
    } catch (e) {
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  const formatHour = (hour24) => {
    if (hour24 === 0) return '12:00 AM (Midnight)';
    if (hour24 === 12) return '12:00 PM (Noon)';
    return hour24 < 12 ? `${hour24}:00 AM` : `${hour24 - 12}:00 PM`;
  };
  const hoursArray = Array.from({ length: 24 }, (_, i) => i);

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, minHeight: 'calc(100vh - 64px)', bgcolor: 'transparent', overflowX: 'hidden' }}>
      
      {/* 1. BOXED FORENSIC HEADER */}
      <Box sx={{ flexShrink: 0, mb: 4 }}>
        <Paper sx={{ 
          ...forensicHeaderStyle, p: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <Typography variant="h4" sx={{ fontWeight: '1000', color: COLORS.accent, display: 'flex', alignItems: 'center', gap: 1.5, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '1.5rem' }}>
            <SettingsSuggestIcon fontSize="large" /> Clinic Configuration
          </Typography>
          <Button 
            variant="contained" color="success" size="large" startIcon={<SaveIcon />} 
            onClick={handleSave} disabled={loading} 
            sx={{ 
                fontWeight: '1000', px: 4, py: 1.5, borderRadius: 0,
                bgcolor: COLORS.success, border: `2px solid ${COLORS.brand}`,
                boxShadow: '4px 4px 0px rgba(46, 125, 50, 0.1)',
                '&:hover': { bgcolor: COLORS.brand }
            }}
          >
            {loading ? "Saving..." : hasUnsavedChanges ? "Save Configuration *" : "Save Configuration"}
          </Button>
        </Paper>
      </Box>

      {/* THE FIX: Replaced old Grid syntax and removed the broken wrapper */}
      <Grid container spacing={4}>
        
        {/* PILLAR 1: OPERATING HOURS */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: '#FFF8E1', px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: "1000", display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <AccessTimeIcon /> Operating Hours
              </Typography>
            </Box>
            <Box sx={{ p: 3, flexGrow: 1, bgcolor: '#FFF' }}>
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 3 }}>Controls the mobile app's booking calendar boundaries.</Typography>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white' }}>
                    <InputLabel sx={{ fontWeight: 1000, color: COLORS.accent }}>Clinic Opens</InputLabel>
                    <Select 
                      value={settings.openHour} label="Clinic Opens" 
                      onChange={(e) => handleChange('openHour', e.target.value)}
                      sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `2px solid ${COLORS.accent}33` }, fontWeight: 1000 }}
                    >
                      {hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white' }}>
                    <InputLabel sx={{ fontWeight: 1000, color: COLORS.accent }}>Clinic Closes</InputLabel>
                    <Select 
                      value={settings.closeHour} label="Clinic Closes" 
                      onChange={(e) => handleChange('closeHour', e.target.value)}
                      sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `2px solid ${COLORS.accent}33` }, fontWeight: 1000 }}
                    >
                      {hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                
                {/* Clinic Phone — configurable, displayed to clients via useClinicSettings */}
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth size="medium"
                    label="Clinic Phone Number"
                    placeholder="e.g. 09171234567"
                    value={settings.clinicPhone || ''}
                    onChange={(e) => handleChange('clinicPhone', e.target.value)}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0, '& fieldset': { border: `2px solid ${COLORS.accent}33` } } }}
                    helperText="Shown to clients in the mobile app. Leave empty to hide the Call Clinic button."
                  />
                </Grid>

                {/* 🧬 CLINIC WORKING DAYS SELECTOR (Phase 4 Polish) */}
                <Grid size={{ xs: 12 }}>
                    <Typography variant="overline" sx={{ fontWeight: '1000', color: COLORS.accent, letterSpacing: 1, display: 'block', mb: 1 }}>
                        Clinic Working Days
                    </Typography>
                    <ToggleButtonGroup
                        value={settings.workingDays || []}
                        onChange={(e, val) => { if (val.length === 0) return; handleChange('workingDays', val); }}
                        fullWidth
                        size="small"
                        sx={{ 
                            gap: 0.5, 
                            '& .MuiToggleButton-root': {
                                border: `2px solid ${COLORS.accent}33 !important`,
                                borderRadius: '0 !important',
                                width: 32, height: 32, minWidth: 32,
                                fontWeight: '1000', fontSize: '0.65rem', color: COLORS.accent,
                                '&.Mui-selected': {
                                    bgcolor: `${COLORS.accent} !important`,
                                    color: '#FFF !important',
                                    boxShadow: '2px 2px 0px rgba(93, 64, 55, 0.2)'
                                }
                            }
                        }}
                    >
                        {['S','M','T','W','T','F','S'].map((day, i) => (
                            <ToggleButton key={i} value={i} title={['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][i]}>
                                {day}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                </Grid>

                {/* CLOSED DATES */}
                <Grid size={{ xs: 12 }}>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="overline" sx={{ fontWeight: '1000', color: COLORS.accent, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <BlockIcon sx={{ fontSize: 16 }} /> Clinic Closures (Holidays, Maintenance)
                  </Typography>
                  <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 1.5 }}>
                    Specific dates the clinic is closed. Blocks mobile booking and skips queue carry-over targets.
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                    <TextField
                      type="date"
                      size="small"
                      value={newClosedDate}
                      onChange={(e) => setNewClosedDate(e.target.value)}
                      sx={{ flex: 1, bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `2px solid ${COLORS.accent}33` } }}
                      inputProps={{ style: { fontWeight: 1000 } }}
                    />
                    <Button
                      variant="contained"
                      onClick={handleAddClosedDate}
                      disabled={!newClosedDate}
                      sx={{
                        borderRadius: 0, fontWeight: 1000, px: 3,
                        bgcolor: COLORS.accent, border: `2px solid ${COLORS.accent}`,
                        boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
                        '&:hover': { bgcolor: COLORS.brand }
                      }}
                    >
                      Add
                    </Button>
                  </Stack>
                  {(settings.closedDates || []).length === 0 ? (
                    <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, fontStyle: 'italic' }}>
                      No closures scheduled.
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                      {(settings.closedDates || []).map(dateStr => (
                        <Chip
                          key={dateStr}
                          label={new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                          onDelete={() => handleRemoveClosedDate(dateStr)}
                          sx={{
                            borderRadius: 0,
                            border: `2px solid ${COLORS.accent}`,
                            bgcolor: '#FFF8E1',
                            fontWeight: 1000,
                            color: COLORS.accent,
                            boxShadow: '2px 2px 0px rgba(93, 64, 55, 0.15)',
                            '& .MuiChip-deleteIcon': { color: COLORS.accent }
                          }}
                        />
                      ))}
                    </Box>
                  )}
                </Grid>

                <Grid size={{ xs: 12 }}><Divider sx={{ my: 1 }} /><FormControlLabel control={<Switch checked={settings.lunchEnabled} onChange={(e) => handleChange('lunchEnabled', e.target.checked)} color="primary" />} label={<Typography sx={{ fontWeight: 1000, color: COLORS.accent }}>Enforce Lunch Break</Typography>} /></Grid>
                {settings.lunchEnabled && (
                    <React.Fragment>
                        <Grid size={{ xs: 6 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel sx={{ fontWeight: 1000 }}>Start</InputLabel><Select value={settings.lunchStart} label="Start" onChange={(e) => handleChange('lunchStart', e.target.value)} sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}>{hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}</Select></FormControl></Grid>
                        <Grid size={{ xs: 6 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel sx={{ fontWeight: 1000 }}>End</InputLabel><Select value={settings.lunchEnd} label="End" onChange={(e) => handleChange('lunchEnd', e.target.value)} sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}>{hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}</Select></FormControl></Grid>
                    </React.Fragment>
                )}
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 2: BOOKING ENGINE RULES */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: '#FFF8E1', px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: "1000", display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <EventBusyIcon /> Client Limitations
              </Typography>
            </Box>
            <Box sx={{ p: 3, flexGrow: 1, bgcolor: '#FFF' }}>
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 3 }}>Protects the clinic from schedule hoarding and last-minute bookings.</Typography>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12 }}><FormControl fullWidth size="medium" sx={{ bgcolor: 'white' }}><InputLabel sx={{ fontWeight: 1000 }}>Base Slot Interval</InputLabel><Select value={settings.minSlotInterval} label="Base Slot Interval" onChange={(e) => handleChange('minSlotInterval', e.target.value)} sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `2px solid ${COLORS.accent}33` }, fontWeight: 1000 }}><MenuItem value={15}>15 Minutes</MenuItem><MenuItem value={30}>30 Minutes</MenuItem><MenuItem value={45}>45 Minutes</MenuItem><MenuItem value={60}>60 Minutes</MenuItem></Select></FormControl></Grid>
                <Grid size={{ xs: 12 }}><FormControl fullWidth size="medium" sx={{ bgcolor: 'white' }}><InputLabel sx={{ fontWeight: 1000 }}>Advance Notice Buffer</InputLabel><Select value={settings.advanceNoticeMins} label="Advance Notice Buffer" onChange={(e) => handleChange('advanceNoticeMins', e.target.value)} sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `2px solid ${COLORS.accent}33` }, fontWeight: 1000 }}><MenuItem value={0}>0 Mins (Allow immediate walk-ins)</MenuItem><MenuItem value={30}>30 Minutes</MenuItem><MenuItem value={60}>1 Hour</MenuItem><MenuItem value={120}>2 Hours</MenuItem><MenuItem value={1440}>24 Hours (Next-day only)</MenuItem></Select></FormControl></Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth label="Future Limit" type="number" value={settings.maxFutureBookingDays} onChange={(e) => handleChange('maxFutureBookingDays', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">Days</InputAdornment> }} sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }} inputProps={{ style: { fontWeight: 1000 } }} /></Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth label="Max Pets" type="number" value={settings.maxPetsPerBooking} onChange={(e) => handleChange('maxPetsPerBooking', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">Pets</InputAdornment> }} sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }} inputProps={{ style: { fontWeight: 1000 } }} helperText="Per booking" /></Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 3: CAPACITY & TRIAGE */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: '#FFF8E1', px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: "1000", display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <LocalHospitalIcon /> Capacity & Triage
              </Typography>
            </Box>
            <Box sx={{ p: 3, flexGrow: 1, bgcolor: '#FFF' }}>
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 3 }}>Controls physical clinic limits and algorithmic traffic warnings.</Typography>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12 }}><TextField fullWidth label="Max Confinement Cages" type="number" value={settings.maxCages} onChange={(e) => handleChange('maxCages', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end" sx={{ fontWeight: 1000 }}>Cages</InputAdornment> }} sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }} inputProps={{ style: { fontWeight: 1000 } }} helperText="Blocks admission" /></Grid>
                <Grid size={{ xs: 12 }}><Divider sx={{ my: 1 }} /></Grid>
                <Grid size={{ xs: 12 }}><TextField fullWidth label="Auto-No-Show Trigger" type="number" value={settings.autoNoShowMins} onChange={(e) => handleChange('autoNoShowMins', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end" sx={{ fontWeight: 1000 }}>Mins Late</InputAdornment> }} sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }} inputProps={{ style: { fontWeight: 1000 } }} helperText="Mins late before Queue displays No-Show button." /></Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth label="Moderate Traffic" type="number" value={settings.trafficModerate} onChange={(e) => handleChange('trafficModerate', e.target.value)} sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }} inputProps={{ style: { fontWeight: 1000 } }} helperText="Patients" /></Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth label="High Traffic" type="number" value={settings.trafficHigh} onChange={(e) => handleChange('trafficHigh', e.target.value)} sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }} inputProps={{ style: { fontWeight: 1000 } }} helperText="Patients" /></Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 4: DYNAMIC DEPARTMENTS */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: '#FFF8E1', px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: "1000", display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <DomainIcon /> Clinic Departments / Categories
              </Typography>
            </Box>
            <Box sx={{ p: 3, bgcolor: '#FFF', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              
              {/* THE FIX: Fixed minHeight on description creates perfect alignment with the Inventory Card */}
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 2.5, minHeight: 40 }}>
                These departments drive the Skill-Based Routing Engine and the color-coding system.
              </Typography>
              
              <Stack direction="row" spacing={2} sx={{ mb: 4, alignItems: 'center' }}>
                <TextField 
                  label="New Department Name" size="small" value={newDepartmentName} 
                  onChange={(e) => setNewDepartmentName(e.target.value)} 
                  sx={{ flexGrow: 1, bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }} 
                  inputProps={{ spellCheck: 'false', style: { fontWeight: 1000 } }}
                />
                
                <FormControl size="small" sx={{ minWidth: 200, bgcolor: 'white' }}>
                    <InputLabel sx={{ fontWeight: 1000 }}>Color Tag</InputLabel>
                    <Select 
                      value={newDepartmentColor} 
                      label="Color Tag" 
                      onChange={(e) => setNewDepartmentColor(e.target.value)}
                      sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
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

                <Button 
                  variant="contained" onClick={handleAddDepartment} 
                  startIcon={<AddCircleOutlineIcon/>} 
                  sx={{ 
                      bgcolor: COLORS.accent, fontWeight: '1000', px: 4, py: 1, 
                      borderRadius: 0, border: `2px solid ${COLORS.brand}`,
                      boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
                      '&:hover': { bgcolor: COLORS.brand }
                  }}
                >
                  Add
                </Button>
              </Stack>

              {/* THE FIX: Added Sort Dropdown next to Quick Find */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField 
                  placeholder="🔍 Quick find department..." size="small" fullWidth
                  value={deptSearch} onChange={(e) => setDeptSearch(e.target.value)}
                  sx={{ bgcolor: 'rgba(255,255,255,0.9)', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, borderColor: '#E0E0E0' } }}
                  inputProps={{ style: { fontWeight: 1000 } }}
                />
                <FormControl size="small" sx={{ width: 140, bgcolor: 'rgba(255,255,255,0.9)' }}>
                  <Select 
                    value={deptSort} onChange={e => setDeptSort(e.target.value)} 
                    displayEmpty sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: '1px solid #E0E0E0' }, fontWeight: '1000', color: '#555' }}
                  >
                    <MenuItem value="asc">A - Z</MenuItem>
                    <MenuItem value="desc">Z - A</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, p: 2.5, bgcolor: 'rgba(250,250,250,0.8)', borderRadius: 0, border: '1px inset rgba(0,0,0,0.1)', flexGrow: 1, height: 180, overflowY: 'auto', alignContent: 'flex-start' }}>
                {/* THE FIX: Sorts the array dynamically before mapping! */}
                {[...departments]
                  .sort((a, b) => deptSort === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))
                  .filter(d => d.name.toLowerCase().includes(deptSearch.toLowerCase()))
                  .map(dept => {
                    // Calculate real-time usage for the UI Chip
                    const staffU = allStaff.filter(u => u.role === 'staff' && (Array.isArray(u.departments) ? u.departments.includes(dept.name) : u.department === dept.name)).length;
                    const serviceU = allServices.filter(s => !s.isArchived && (s.department || s.category) === dept.name).length;
                    const totalU = staffU + serviceU;

                    return (
                        <Chip 
                          key={dept.id} 
                          label={`${dept.name} (${totalU})`} 
                          onDelete={() => handleDeleteDepartment(dept.id, dept.name)}
                          sx={{ 
                              fontWeight: '1000', color: 'white', bgcolor: dept.color || '#616161', 
                              borderRadius: 0,
                              border: totalU > 0 ? '2px solid rgba(255,255,255,0.4)' : '1px solid rgba(0,0,0,0.1)', 
                              fontSize: '0.75rem', py: 2.2, px: 1, 
                              '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)', '&:hover': { color: 'white' } } 
                          }}
                          title={`Assigned to ${staffU} staff and ${serviceU} services`}
                        />
                    );
                })}
                {departments.filter(d => d.name.toLowerCase().includes(deptSearch.toLowerCase())).length === 0 && (<Typography variant="body2" color="textSecondary" sx={{ width: '100%', textAlign: 'center', mt: 4, fontStyle: 'italic' }}>No departments match your search.</Typography>)}
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 5: INVENTORY CATEGORIES */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: '#FFF8E1', px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: "1000", display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <InventoryIcon /> Inventory Categories
              </Typography>
            </Box>
            <Box sx={{ p: 3, bgcolor: '#FFF', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              
              {/* THE FIX: Fixed minHeight enforces bottom alignment! */}
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 2.5, minHeight: 40 }}>
                Manage the taxonomy of your pharmacy and retail shop. These categories organize your search filters and financial reports.
              </Typography>
              
              <Stack direction="row" spacing={2} sx={{ mb: 4, alignItems: 'center' }}>
                <TextField 
                  label="New Category Name" size="small" value={newInvCatName} 
                  onChange={(e) => setNewInvCatName(e.target.value)} 
                  sx={{ flexGrow: 1, bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                  inputProps={{ spellCheck: 'false', style: { fontWeight: 1000 } }}
                />
                
                {/* 💊 THE PILL TOGGLE UI */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.5, bgcolor: 'white', border: `1px solid ${COLORS.accent}33`, borderRadius: 0 }}>
                    <Typography variant="caption" sx={{ fontWeight: 1000, color: newInvCatIsMedicine ? '#B71C1C' : '#757575', fontSize: '0.65rem' }}>
                        {newInvCatIsMedicine ? "MEDICINE" : "RETAIL"}
                    </Typography>
                    <MedicinePillSwitch 
                        checked={newInvCatIsMedicine}
                        onChange={(e) => setNewInvCatIsMedicine(e.target.checked)}
                    />
                </Box>

                <Button 
                  variant="contained" 
                  onClick={handleAddInvCategory} 
                  startIcon={<AddCircleOutlineIcon/>}
                  sx={{ 
                      bgcolor: COLORS.accent, fontWeight: '1000', px: 4, py: 1, 
                      borderRadius: 0, border: `2px solid ${COLORS.brand}`,
                      boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
                      '&:hover': { bgcolor: COLORS.brand }
                  }}
                >
                  Add
                </Button>
              </Stack>

              {/* THE FIX: Added Sort Dropdown next to Quick Find */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField 
                  placeholder="🔍 Quick find category..." size="small" fullWidth
                  value={invCatSearch} onChange={(e) => setInvCatSearch(e.target.value)}
                  sx={{ bgcolor: 'rgba(255,255,255,0.9)', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, borderColor: '#E0E0E0' } }}
                  inputProps={{ style: { fontWeight: 1000 } }}
                />
                <FormControl size="small" sx={{ width: 140, bgcolor: 'rgba(255,255,255,0.9)' }}>
                  <Select 
                    value={invCatSort} onChange={e => setInvCatSort(e.target.value)} 
                    displayEmpty sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: '1px solid #E0E0E0' }, fontWeight: '1000', color: '#555' }}
                  >
                    <MenuItem value="asc">A - Z</MenuItem>
                    <MenuItem value="desc">Z - A</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, p: 2.5, bgcolor: 'rgba(250,250,250,0.8)', borderRadius: 0, border: '1px inset rgba(0,0,0,0.1)', flexGrow: 1, height: 180, overflowY: 'auto', alignContent: 'flex-start' }}>
                {/* THE FIX: Sorts the array dynamically before mapping! */}
                {[...invCategories]
                  .sort((a, b) => invCatSort === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))
                  .filter(c => c.name.toLowerCase().includes(invCatSearch.toLowerCase()))
                  .map(cat => (
                  <Chip 
                    key={cat.id} 
                    label={cat.name} 
                    icon={cat.isMedicine ? <MedicationIcon sx={{ fontSize: '1rem !important', color: '#D32F2F !important' }} /> : null}
                    onDelete={cat.id.startsWith('default_') ? undefined : () => handleDeleteInvCategory(cat.id, cat.name)}
                    sx={{ 
                      fontWeight: '1000', 
                      bgcolor: 'white', 
                      borderRadius: 0,
                      border: cat.isMedicine ? '2px solid #D32F2F' : '1px solid #ccc', 
                      fontSize: '0.75rem', py: 2.2,
                      '& .MuiChip-label': { color: cat.isMedicine ? '#D32F2F' : 'inherit' }
                    }}
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

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog
        open={confirmDelete.open}
        onClose={() => setConfirmDelete({ open: false, type: '', id: '', name: '' })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: '1000', color: COLORS.danger, pb: 1 }}>
          Confirm Delete
        </DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the{' '}
            {confirmDelete.type === 'department' ? 'department' : 'category'}{' '}
            <strong>"{confirmDelete.name}"</strong>?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button
            onClick={() => setConfirmDelete({ open: false, type: '', id: '', name: '' })}
            sx={{ fontWeight: 'bold', color: '#757575', borderRadius: 0 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            variant="contained"
            sx={{ bgcolor: COLORS.danger, fontWeight: 'bold', borderRadius: 0, '&:hover': { bgcolor: COLORS.danger } }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={5000} onClose={() => setToast({...toast, open: false})} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setToast({...toast, open: false})} severity={toast.severity} sx={{ width: '100%', fontWeight: 'bold', boxShadow: 3, fontSize: '1rem' }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}