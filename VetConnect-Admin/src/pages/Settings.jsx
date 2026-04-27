import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Paper, Button, FormControl, InputLabel, Select, MenuItem,
  Snackbar, Alert, InputAdornment, TextField, Switch, FormControlLabel,
  Divider, Stack, Chip, ListItemText, ToggleButton, ToggleButtonGroup,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  LinearProgress, CircularProgress,
} from '@mui/material';
import Grid from '@mui/material/Grid'; // MUI v6 Standard
import { styled } from '@mui/material/styles';

import { doc, setDoc, Timestamp, collection, onSnapshot, addDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';
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
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import FlagIcon from '@mui/icons-material/Flag';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import VaccinesIcon from '@mui/icons-material/Vaccines';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import QRCode from 'react-qr-code';
import GavelIcon from '@mui/icons-material/Gavel';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PublishIcon from '@mui/icons-material/Publish';
import RefreshIcon from '@mui/icons-material/Refresh';
import GroupIcon from '@mui/icons-material/Group';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';

import { DEFAULT_VACCINE_CATALOG } from '../hooks/useVaccineCatalog';
import { testLlmConnection, DEFAULT_CLINICAL_SYSTEM_PROMPT } from '../utils/llmService';
import { useConsentPolicy } from '../hooks/useConsentPolicy';
import { CONSENT_TYPES } from '../utils/consentConstants';
import { migrateExistingConsents } from '../utils/consentMigration';

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
    bgcolor: COLORS.cream,
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
    maxCages: 5, autoNoShowMins: 30, noShowLinkWindowDays: 30, trafficModerate: 6, trafficHigh: 13,
    clinicPhone: '',
    workingDays: [1, 2, 3, 4, 5, 6, 0], // [0:Sun, 1:Mon... 6:Sat]
    clinicLat: 16.0389, clinicLng: 120.3977, geofenceRadiusM: 150,
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

  // --- DASHBOARD ALERT THRESHOLDS (T2.331) ---
  const [dashboardAlerts, setDashboardAlerts] = useState({
    avgWaitMax: 30,
    longestWaitMax: 45,
    noShowMin: 3,
    emergencyMin: 2,
    queueDepthMax: 8,
  });

  // --- MONTHLY GOALS (T2.336) ---
  const [dashboardGoals, setDashboardGoals] = useState({
    monthlyRevenue: 0,
    monthlyNewClients: 0,
    monthlyRecordsSigned: 0,
    monthlyAppointments: 0,
  });

  // --- CONFIRM DIALOG STATE ---
  const [confirmDelete, setConfirmDelete] = useState({ open: false, type: '', id: '', name: '' });

  // --- DEPENDENCY STATES (For Usage Shield) ---
  const [allServices, setAllServices] = useState([]);
  const [allStaff, setAllStaff] = useState([]);

  // --- PILLAR 9: VACCINE CATALOG STATE ---
  const [vaccineList, setVaccineList] = useState([]);
  const [editingVaccine, setEditingVaccine] = useState(null); // null = no edit, object = editing row
  const [newVaccine, setNewVaccine] = useState({
    name: '', species: ['dog'], intervalDays: 365, keywords: '', isActive: true,
  });

  // --- PILLAR 10: CONSENT POLICY STATE ---
  const {
    activeVersion: consentActiveVersion,
    activatedAt: consentActivatedAt,
    activatedBy: consentActivatedBy,
    versions: consentVersions,
    loading: consentLoading,
    publishVersion: publishConsentVersion,
    createDraft: createConsentDraft,
    updateDraft: updateConsentDraft,
    seedDefaults: seedConsentDefaults,
  } = useConsentPolicy();

  // Dialog: Create new draft
  const [createDraftOpen, setCreateDraftOpen] = useState(false);
  const [draftForm, setDraftForm] = useState({
    type: CONSENT_TYPES.DPA,
    title: '',
    bodyText: '',
    summary: '',
  });

  // Dialog: Edit existing draft
  const [editDraftOpen, setEditDraftOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState(null); // full version object being edited

  // Dialog: Publish confirmation
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [pendingPublishId, setPendingPublishId] = useState(null);

  // Dialog: View full policy text
  const [viewPolicyOpen, setViewPolicyOpen] = useState(false);
  const [viewingPolicy, setViewingPolicy] = useState(null); // version object to display

  // Re-consent progress counter — one-shot query, triggered by button
  const [reconsentProgress, setReconsentProgress] = useState({ consented: 0, total: 0, loading: false, queried: false });

  useEffect(() => {
    setReconsentProgress({ consented: 0, total: 0, loading: false, queried: false });
  }, [consentActiveVersion]);

  // --- PILLAR 11: AI CLINICAL REASONING STATE ---
  const [llmConfig, setLlmConfig] = useState({
    enabled: false,
    workerUrl: '',      // Cloudflare Worker URL — API key lives in Worker env, never here
    systemPrompt: '',   // Loaded from Firestore; falls back to DEFAULT_CLINICAL_SYSTEM_PROMPT
  });
  const [llmTestResult, setLlmTestResult] = useState(null); // { ok, message } | null
  const [llmTestLoading, setLlmTestLoading] = useState(false);
  const [llmSaving, setLlmSaving] = useState(false);

  // Legacy data migration — Step 7.2 (T3.5 Phase 7)
  const [migrationResult, setMigrationResult] = useState({
    migrated: 0,
    skipped: 0,
    errors: [],
    loading: false,
    previewed: false,
    executed: false,
  });

  useEffect(() => {
    // 1. Fetch Global Settings
    const unsubSettings = onSnapshot(doc(db, "clinic_settings", "general"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings(prev => ({ ...prev, ...data }));
        if (data.dashboardAlerts) {
          setDashboardAlerts(prev => ({ ...prev, ...data.dashboardAlerts }));
        }
        if (data.dashboardGoals) {
          setDashboardGoals(prev => ({ ...prev, ...data.dashboardGoals }));
        }
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
          noShowLinkWindowDays: parseInt(data.noShowLinkWindowDays) || 30,
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

    // 5. Fetch Vaccine Catalog (Pillar 9)
    const unsubVaxCatalog = onSnapshot(doc(db, 'clinic_settings', 'vaccine_catalog'), (docSnap) => {
      if (docSnap.exists() && Array.isArray(docSnap.data().vaccines)) {
        setVaccineList(docSnap.data().vaccines);
      } else {
        setVaccineList([]);
      }
    });

    // 6. Fetch LLM Config (Pillar 11)
    const unsubLlm = onSnapshot(doc(db, 'clinic_settings', 'llm_config'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLlmConfig(prev => ({
          ...prev,
          enabled:      data.enabled      ?? false,
          workerUrl:    data.workerUrl    ?? '',
          systemPrompt: data.systemPrompt ?? '',
        }));
      }
    });

    return () => { unsubSettings(); unsubDepts(); unsubInvCats(); unsubVaxCatalog(); unsubLlm(); };
  },[]);

  // --- NAVIGATION GUARD: Warn on unsaved changes to form fields ---
  const hasUnsavedChanges = React.useMemo(() => {
    if (!lastSavedSettings) return false;
    const tracked = ['openHour', 'closeHour', 'lunchEnabled', 'lunchStart', 'lunchEnd',
      'minSlotInterval', 'advanceNoticeMins', 'maxFutureBookingDays', 'maxPetsPerBooking',
      'maxCages', 'autoNoShowMins', 'noShowLinkWindowDays', 'trafficModerate', 'trafficHigh',
      'workingDays', 'clinicPhone', 'dashboardAlerts', 'dashboardGoals',
      'clinicLat', 'clinicLng', 'geofenceRadiusM'];
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
    const linkWindow = parseInt(settings.noShowLinkWindowDays);
    if (!linkWindow || linkWindow < 1 || linkWindow > 365) {
      return "No-Show Lookback Window must be between 1 and 365 days.";
    }
    if ((settings.workingDays || []).length === 0) {
      return "At least one working day must be selected.";
    }
    const lat = parseFloat(settings.clinicLat);
    const lng = parseFloat(settings.clinicLng);
    const radius = parseInt(settings.geofenceRadiusM);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      return "Clinic Latitude must be between -90 and 90.";
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      return "Clinic Longitude must be between -180 and 180.";
    }
    if (isNaN(radius) || radius < 50 || radius > 1000) {
      return "Geofence Radius must be between 50 and 1000 meters.";
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
        noShowLinkWindowDays: parseInt(settings.noShowLinkWindowDays) || 30,
        trafficModerate: parseInt(settings.trafficModerate) || 6,
        trafficHigh: parseInt(settings.trafficHigh) || 13
      };
      
      if ((settings.closedDates || []).length > 365) {
        setToast({ open: true, message: `Warning: ${settings.closedDates.length} closure dates configured. Consider auditing.`, severity: 'warning' });
      }

      const adminIdentity = profile?.fullName || profile?.email || "Unknown Admin";
      await setDoc(doc(db, "clinic_settings", "general"), {
          ...sanitizedSettings,
          dashboardAlerts,
          dashboardGoals,
          updatedAt: Timestamp.now(),
          updatedBy: adminIdentity
      }, { merge: true });

      // Field-level diff for audit trail
      if (lastSavedSettings) {
        const tracked = ['openHour', 'closeHour', 'lunchEnabled', 'lunchStart', 'lunchEnd',
          'minSlotInterval', 'advanceNoticeMins', 'maxFutureBookingDays', 'maxPetsPerBooking',
          'maxCages', 'autoNoShowMins', 'noShowLinkWindowDays', 'trafficModerate', 'trafficHigh',
          'workingDays', 'clinicPhone', 'dashboardAlerts', 'dashboardGoals',
          'clinicLat', 'clinicLng', 'geofenceRadiusM'];
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

  // --- VACCINE CATALOG CRUD (Pillar 9) ---

  const handleAddVaccine = async () => {
    const trimmedName = newVaccine.name.trim();
    if (!trimmedName) {
      return setToast({ open: true, message: 'Vaccine name is required.', severity: 'warning' });
    }
    const isDuplicate = vaccineList.some(
      (v) => v.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      return setToast({ open: true, message: 'A vaccine with that name already exists.', severity: 'error' });
    }
    if (newVaccine.species.length === 0) {
      return setToast({ open: true, message: 'Select at least one species.', severity: 'warning' });
    }

    const id = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    if (vaccineList.some((v) => v.id === id)) {
      return setToast({ open: true, message: 'A vaccine with an equivalent identifier already exists.', severity: 'error' });
    }
    const keywords = newVaccine.keywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    const entry = {
      id,
      name: trimmedName,
      species: newVaccine.species,
      intervalDays: parseInt(newVaccine.intervalDays) || 365,
      keywords,
      isActive: true,
    };

    const updatedList = [...vaccineList, entry];
    try {
      const who = profile?.fullName || profile?.email || 'Unknown Admin';
      await setDoc(
        doc(db, 'clinic_settings', 'vaccine_catalog'),
        { vaccines: updatedList, updatedAt: Timestamp.now(), updatedBy: who },
        { merge: true }
      );
      await logSettingsEvent('CREATE', 'vaccine_catalog', trimmedName);
      setNewVaccine({ name: '', species: ['dog'], intervalDays: 365, keywords: '', isActive: true });
      setToast({ open: true, message: `Vaccine "${trimmedName}" added.`, severity: 'success' });
    } catch (e) {
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  const handleUpdateVaccine = async () => {
    if (!editingVaccine) return;
    const trimmedName = editingVaccine.name.trim();
    if (!trimmedName) {
      return setToast({ open: true, message: 'Vaccine name is required.', severity: 'warning' });
    }
    const isDuplicate = vaccineList.some(
      (v) => v.id !== editingVaccine.id && v.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      return setToast({ open: true, message: 'Another vaccine with that name already exists.', severity: 'error' });
    }

    const keywords = typeof editingVaccine.keywords === 'string'
      ? editingVaccine.keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean)
      : editingVaccine.keywords;

    const updatedEntry = {
      ...editingVaccine,
      name: trimmedName,
      intervalDays: parseInt(editingVaccine.intervalDays) || 365,
      keywords,
    };

    const updatedList = vaccineList.map((v) => (v.id === editingVaccine.id ? updatedEntry : v));
    try {
      const who = profile?.fullName || profile?.email || 'Unknown Admin';
      await setDoc(
        doc(db, 'clinic_settings', 'vaccine_catalog'),
        { vaccines: updatedList, updatedAt: Timestamp.now(), updatedBy: who },
        { merge: true }
      );
      await logSettingsEvent('UPDATE', 'vaccine_catalog', trimmedName);
      setEditingVaccine(null);
      setToast({ open: true, message: `Vaccine "${trimmedName}" updated.`, severity: 'success' });
    } catch (e) {
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  /** Toggles isActive — never hard-deletes so historical record references remain resolvable. */
  const handleToggleVaccine = async (id) => {
    const updatedList = vaccineList.map((v) =>
      v.id === id ? { ...v, isActive: !v.isActive } : v
    );
    const toggled = updatedList.find((v) => v.id === id);
    try {
      const who = profile?.fullName || profile?.email || 'Unknown Admin';
      await setDoc(
        doc(db, 'clinic_settings', 'vaccine_catalog'),
        { vaccines: updatedList, updatedAt: Timestamp.now(), updatedBy: who },
        { merge: true }
      );
      await logSettingsEvent('UPDATE', 'vaccine_catalog', toggled?.name || id, {
        isActive: toggled?.isActive,
      });
    } catch (e) {
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  const handleSeedVaccineCatalog = async () => {
    try {
      const who = profile?.fullName || profile?.email || 'Unknown Admin';
      await setDoc(
        doc(db, 'clinic_settings', 'vaccine_catalog'),
        { vaccines: DEFAULT_VACCINE_CATALOG, updatedAt: Timestamp.now(), updatedBy: who },
        { merge: true }
      );
      await logSettingsEvent('CREATE', 'vaccine_catalog', 'seed_defaults');
      setToast({ open: true, message: '6 default vaccines seeded successfully.', severity: 'success' });
    } catch (e) {
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  // --- CONSENT POLICY HANDLERS (Pillar 10) ---

  const handleSeedConsentPolicies = async () => {
    try {
      const who = profile?.fullName || profile?.email || 'Unknown Admin';
      await seedConsentDefaults(who);
      setToast({ open: true, message: 'Default DPA and Waiver policies created (v1).', severity: 'success' });
    } catch (e) {
      console.error('[Settings.handleSeedConsentPolicies]:', e.message);
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  const handleOpenCreateDraft = () => {
    setDraftForm({ type: CONSENT_TYPES.DPA, title: '', bodyText: '', summary: '' });
    setCreateDraftOpen(true);
  };

  const handleSaveNewDraft = async () => {
    const { type, title, bodyText, summary } = draftForm;
    if (!title.trim()) {
      return setToast({ open: true, message: 'Title is required.', severity: 'warning' });
    }
    if (!bodyText.trim()) {
      return setToast({ open: true, message: 'Body text is required.', severity: 'warning' });
    }
    try {
      const who = profile?.fullName || profile?.email || 'Unknown Admin';
      await createConsentDraft(type, title, bodyText, summary, who);
      setCreateDraftOpen(false);
      setDraftForm({ type: CONSENT_TYPES.DPA, title: '', bodyText: '', summary: '' });
      setToast({ open: true, message: 'Draft policy saved.', severity: 'success' });
    } catch (e) {
      console.error('[Settings.handleSaveNewDraft]:', e.message);
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  const handleOpenEditDraft = (versionDoc) => {
    setEditingDraft({ ...versionDoc });
    setEditDraftOpen(true);
  };

  const handleSaveEditedDraft = async () => {
    if (!editingDraft) return;
    if (!editingDraft.title?.trim()) {
      return setToast({ open: true, message: 'Title is required.', severity: 'warning' });
    }
    if (!editingDraft.bodyText?.trim()) {
      return setToast({ open: true, message: 'Body text is required.', severity: 'warning' });
    }
    try {
      await updateConsentDraft(editingDraft.id, {
        title:    editingDraft.title.trim(),
        bodyText: editingDraft.bodyText.trim(),
        summary:  (editingDraft.summary || '').trim(),
        type:     editingDraft.type,
      });
      setEditDraftOpen(false);
      setEditingDraft(null);
      setToast({ open: true, message: 'Draft updated.', severity: 'success' });
    } catch (e) {
      console.error('[Settings.handleSaveEditedDraft]:', e.message);
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  const handleRequestPublish = (versionDocId) => {
    setPendingPublishId(versionDocId);
    setPublishConfirmOpen(true);
  };

  const handleConfirmPublish = async () => {
    if (!pendingPublishId) return;
    try {
      const who = profile?.fullName || profile?.email || 'Unknown Admin';
      await publishConsentVersion(pendingPublishId, who);
      setPublishConfirmOpen(false);
      setPendingPublishId(null);
      setToast({ open: true, message: 'Policy version published. Clients will be prompted to re-consent on their next login.', severity: 'success' });
    } catch (e) {
      console.error('[Settings.handleConfirmPublish]:', e.message);
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  const handleViewPolicy = (versionDoc) => {
    setViewingPolicy(versionDoc);
    setViewPolicyOpen(true);
  };

  /**
   * One-shot query: counts pet_owner users and how many have re-consented
   * to the current active version. Triggered manually — not a real-time listener.
   */
  const handleRefreshReconsentProgress = async () => {
    if (!consentActiveVersion) return;

    setReconsentProgress((prev) => ({ ...prev, loading: true }));

    try {
      const usersRef = collection(db, 'users');
      const activeClientsQuery = query(
        usersRef,
        where('role', '==', 'pet_owner'),
        where('accountStatus', '!=', 'erased'),
      );
      const snapshot = await getDocs(activeClientsQuery);

      let total = 0;
      let consented = 0;

      snapshot.forEach((docSnap) => {
        total += 1;
        const { consentVersion } = docSnap.data();
        if (consentVersion != null && Number(consentVersion) >= Number(consentActiveVersion)) {
          consented += 1;
        }
      });

      setReconsentProgress({ consented, total, loading: false, queried: true });
    } catch (err) {
      console.error('[Settings.handleRefreshReconsentProgress]:', err.message);
      setToast({ open: true, message: 'Failed to load re-consent progress.', severity: 'error' });
      setReconsentProgress((prev) => ({ ...prev, loading: false, queried: true }));
    }
  };

  // --- MIGRATION HANDLERS (Step 7.2, T3.5 Phase 7) ---

  /**
   * Dry-run the migration to count how many users would be affected.
   * Does not write any Firestore documents.
   */
  const handleMigrationPreview = async () => {
    setMigrationResult((prev) => ({ ...prev, loading: true }));
    try {
      const adminName = profile?.fullName || profile?.email || 'Unknown Admin';
      const result = await migrateExistingConsents(adminName, { dryRun: true });
      setMigrationResult({
        ...result,
        loading: false,
        previewed: true,
        executed: false,
      });
    } catch (err) {
      console.error('[Settings.handleMigrationPreview]:', err.message);
      setToast({ open: true, message: 'Preview failed: ' + err.message, severity: 'error' });
      setMigrationResult((prev) => ({ ...prev, loading: false }));
    }
  };

  /**
   * Execute the migration — writes consent_records for all eligible users.
   * Only enabled after a successful preview that found at least one eligible user.
   */
  const handleMigrationExecute = async () => {
    setMigrationResult((prev) => ({ ...prev, loading: true }));
    try {
      const adminName = profile?.fullName || profile?.email || 'Unknown Admin';
      const result = await migrateExistingConsents(adminName);
      setMigrationResult({
        ...result,
        loading: false,
        previewed: true,
        executed: true,
      });
      const errorSuffix = result.errors.length > 0
        ? ` ${result.errors.length} error(s) — check console.`
        : '';
      setToast({
        open: true,
        message: `Migrated ${result.migrated} clients, skipped ${result.skipped}.${errorSuffix}`,
        severity: result.errors.length > 0 ? 'warning' : 'success',
      });
    } catch (err) {
      console.error('[Settings.handleMigrationExecute]:', err.message);
      setToast({ open: true, message: 'Migration failed: ' + err.message, severity: 'error' });
      setMigrationResult((prev) => ({ ...prev, loading: false }));
    }
  };

  // --- PILLAR 11: AI CLINICAL REASONING HANDLERS ---

  /**
   * Saves LLM configuration to Firestore.
   * Worker URL is required when the feature is enabled.
   * The system prompt is also written to system_prompts/clinical_reasoning
   * so ClinicalWorkspace can fetch it independently.
   */
  const handleSaveLlmConfig = async () => {
    const url = llmConfig.workerUrl.trim();
    if (llmConfig.enabled && !url) {
      return setToast({
        open: true,
        message: 'Worker URL is required when AI Clinical Reasoning is enabled.',
        severity: 'warning',
      });
    }
    if (url && !url.startsWith('https://')) {
      return setToast({
        open: true,
        message: 'Worker URL must start with https://',
        severity: 'warning',
      });
    }

    setLlmSaving(true);
    try {
      const adminIdentity = profile?.fullName || profile?.email || 'Unknown Admin';
      const effectivePrompt = llmConfig.systemPrompt || DEFAULT_CLINICAL_SYSTEM_PROMPT;

      await setDoc(
        doc(db, 'clinic_settings', 'llm_config'),
        {
          enabled:      llmConfig.enabled,
          workerUrl:    llmConfig.workerUrl.trim(),
          systemPrompt: effectivePrompt,
          updatedAt:    Timestamp.now(),
          updatedBy:    adminIdentity,
        },
        { merge: true },
      );

      // Mirror the system prompt to its own collection so ClinicalWorkspace
      // can fetch it with a single getDoc without reading all of clinic_settings.
      await setDoc(
        doc(db, 'system_prompts', 'clinical_reasoning'),
        {
          prompt:    effectivePrompt,
          updatedAt: Timestamp.now(),
          updatedBy: adminIdentity,
        },
      );

      await logSettingsEvent('UPDATE', 'llm_config', 'ai_clinical_reasoning', {
        enabled: llmConfig.enabled,
      });

      setToast({ open: true, message: 'AI configuration saved.', severity: 'success' });
    } catch (e) {
      console.error('[Settings.handleSaveLlmConfig]:', e.message);
      setToast({ open: true, message: e.message, severity: 'error' });
    } finally {
      setLlmSaving(false);
    }
  };

  /**
   * Sends a minimal test request to the configured Worker URL
   * and shows the result as a Chip below the URL field.
   */
  const handleTestLlm = async () => {
    setLlmTestLoading(true);
    setLlmTestResult(null);
    try {
      const result = await testLlmConnection({ workerUrl: llmConfig.workerUrl });
      setLlmTestResult(result);
    } catch (e) {
      setLlmTestResult({ ok: false, message: e.message || 'Test failed.' });
    } finally {
      setLlmTestLoading(false);
    }
  };

  const formatConsentDate = (timestamp) => {
    if (!timestamp) return '—';
    try {
      return timestamp.toDate().toLocaleDateString('en-PH', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  const getConsentStatusChipSx = (status) => {
    switch (status) {
      case 'active':
        return { bgcolor: COLORS.success, color: '#fff', fontWeight: 900, borderRadius: 0, fontSize: '0.65rem', letterSpacing: '0.04em' };
      case 'draft':
        return { bgcolor: COLORS.warning, color: '#fff', fontWeight: 900, borderRadius: 0, fontSize: '0.65rem', letterSpacing: '0.04em' };
      case 'superseded':
      default:
        return { bgcolor: COLORS.textMuted, color: '#fff', fontWeight: 900, borderRadius: 0, fontSize: '0.65rem', letterSpacing: '0.04em' };
    }
  };

  const pendingPublishVersion = consentVersions.find((v) => v.id === pendingPublishId);

  const formatHour = (hour24) => {
    if (hour24 === 0) return '12:00 AM (Midnight)';
    if (hour24 === 12) return '12:00 PM (Noon)';
    return hour24 < 12 ? `${hour24}:00 AM` : `${hour24 - 12}:00 PM`;
  };
  const hoursArray = Array.from({ length: 24 }, (_, i) => i);

  const qrRef = useRef(null);
  const handlePrintQR = () => {
    const svgEl = qrRef.current?.querySelector('svg');
    const qrSvgHtml = svgEl ? svgEl.outerHTML : '<p>QR code unavailable</p>';
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>VetConnect Check-In QR</title>
          <style>
            body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #FFF8E1; font-family: sans-serif; }
            .poster { text-align: center; padding: 48px; border: 4px solid #3E2723; background: white; max-width: 480px; }
            .clinic-name { font-size: 2rem; font-weight: 900; color: #3E2723; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; }
            .instruction { font-size: 1rem; color: #5D4037; margin-bottom: 32px; font-weight: 600; }
            .qr-box { display: inline-block; padding: 24px; border: 3px solid #3E2723; margin-bottom: 32px; }
            .qr-box svg { width: 220px; height: 220px; }
            .footer { font-size: 0.8rem; color: #9E9E9E; }
            @media print { body { background: white; } }
          </style>
        </head>
        <body>
          <div class="poster">
            <div class="clinic-name">Starbarks Veterinary Clinic</div>
            <div class="instruction">Scan with the VetConnect app to check in</div>
            <div class="qr-box">${qrSvgHtml}</div>
            <div class="footer">VetConnect Self Check-In System</div>
          </div>
          <script>
            setTimeout(() => { window.print(); }, 300);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, minHeight: 'calc(100vh - 64px)', bgcolor: 'transparent', overflowX: 'hidden' }}>
      
      {/* 1. BOXED FORENSIC HEADER */}
      <Box sx={{ flexShrink: 0, mb: 4 }}>
        <Paper sx={{ 
          ...forensicHeaderStyle, p: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: COLORS.accent, display: 'flex', alignItems: 'center', gap: 1.5, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '1.5rem' }}>
            <SettingsSuggestIcon fontSize="large" /> Clinic Configuration
          </Typography>
          <Button 
            variant="contained" color="success" size="large" startIcon={<SaveIcon />} 
            onClick={handleSave} disabled={loading} 
            sx={{ 
                fontWeight: 900, px: 4, py: 1.5, borderRadius: 0,
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
            <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <AccessTimeIcon /> Operating Hours
              </Typography>
            </Box>
            <Box sx={{ p: 3, flexGrow: 1, bgcolor: COLORS.cardBg }}>
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 3 }}>Controls the mobile app's booking calendar boundaries.</Typography>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white' }}>
                    <InputLabel sx={{ fontWeight: 900, color: COLORS.accent }}>Clinic Opens</InputLabel>
                    <Select 
                      value={settings.openHour} label="Clinic Opens" 
                      onChange={(e) => handleChange('openHour', e.target.value)}
                      sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `2px solid ${COLORS.accent}33` }, fontWeight: 900 }}
                    >
                      {hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white' }}>
                    <InputLabel sx={{ fontWeight: 900, color: COLORS.accent }}>Clinic Closes</InputLabel>
                    <Select 
                      value={settings.closeHour} label="Clinic Closes" 
                      onChange={(e) => handleChange('closeHour', e.target.value)}
                      sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `2px solid ${COLORS.accent}33` }, fontWeight: 900 }}
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
                    <Typography variant="overline" sx={{ fontWeight: 900, color: COLORS.accent, letterSpacing: 1, display: 'block', mb: 1 }}>
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
                                fontWeight: 900, fontSize: '0.65rem', color: COLORS.accent,
                                '&.Mui-selected': {
                                    bgcolor: `${COLORS.accent} !important`,
                                    color: `${COLORS.cardBg} !important`,
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
                  <Typography variant="overline" sx={{ fontWeight: 900, color: COLORS.accent, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
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
                      inputProps={{ style: { fontWeight: 900 } }}
                    />
                    <Button
                      variant="contained"
                      onClick={handleAddClosedDate}
                      disabled={!newClosedDate}
                      sx={{
                        borderRadius: 0, fontWeight: 900, px: 3,
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
                            bgcolor: COLORS.cream,
                            fontWeight: 900,
                            color: COLORS.accent,
                            boxShadow: '2px 2px 0px rgba(93, 64, 55, 0.15)',
                            '& .MuiChip-deleteIcon': { color: COLORS.accent }
                          }}
                        />
                      ))}
                    </Box>
                  )}
                </Grid>

                <Grid size={{ xs: 12 }}><Divider sx={{ my: 1 }} /><FormControlLabel control={<Switch checked={settings.lunchEnabled} onChange={(e) => handleChange('lunchEnabled', e.target.checked)} color="primary" />} label={<Typography sx={{ fontWeight: 900, color: COLORS.accent }}>Enforce Lunch Break</Typography>} /></Grid>
                {settings.lunchEnabled && (
                    <React.Fragment>
                        <Grid size={{ xs: 6 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel sx={{ fontWeight: 900 }}>Start</InputLabel><Select value={settings.lunchStart} label="Start" onChange={(e) => handleChange('lunchStart', e.target.value)} sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}>{hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}</Select></FormControl></Grid>
                        <Grid size={{ xs: 6 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel sx={{ fontWeight: 900 }}>End</InputLabel><Select value={settings.lunchEnd} label="End" onChange={(e) => handleChange('lunchEnd', e.target.value)} sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}>{hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}</Select></FormControl></Grid>
                    </React.Fragment>
                )}
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 2: BOOKING ENGINE RULES */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <EventBusyIcon /> Client Limitations
              </Typography>
            </Box>
            <Box sx={{ p: 3, flexGrow: 1, bgcolor: COLORS.cardBg }}>
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 3 }}>Protects the clinic from schedule hoarding and last-minute bookings.</Typography>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12 }}><FormControl fullWidth size="medium" sx={{ bgcolor: 'white' }}><InputLabel sx={{ fontWeight: 900 }}>Base Slot Interval</InputLabel><Select value={settings.minSlotInterval} label="Base Slot Interval" onChange={(e) => handleChange('minSlotInterval', e.target.value)} sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `2px solid ${COLORS.accent}33` }, fontWeight: 900 }}><MenuItem value={15}>15 Minutes</MenuItem><MenuItem value={30}>30 Minutes</MenuItem><MenuItem value={45}>45 Minutes</MenuItem><MenuItem value={60}>60 Minutes</MenuItem></Select></FormControl></Grid>
                <Grid size={{ xs: 12 }}><FormControl fullWidth size="medium" sx={{ bgcolor: 'white' }}><InputLabel sx={{ fontWeight: 900 }}>Advance Notice Buffer</InputLabel><Select value={settings.advanceNoticeMins} label="Advance Notice Buffer" onChange={(e) => handleChange('advanceNoticeMins', e.target.value)} sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `2px solid ${COLORS.accent}33` }, fontWeight: 900 }}><MenuItem value={0}>0 Mins (Allow immediate walk-ins)</MenuItem><MenuItem value={30}>30 Minutes</MenuItem><MenuItem value={60}>1 Hour</MenuItem><MenuItem value={120}>2 Hours</MenuItem><MenuItem value={1440}>24 Hours (Next-day only)</MenuItem></Select></FormControl></Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth label="Future Limit" type="number" value={settings.maxFutureBookingDays} onChange={(e) => handleChange('maxFutureBookingDays', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">Days</InputAdornment> }} sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }} inputProps={{ style: { fontWeight: 900 } }} /></Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth label="Max Pets" type="number" value={settings.maxPetsPerBooking} onChange={(e) => handleChange('maxPetsPerBooking', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end">Pets</InputAdornment> }} sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }} inputProps={{ style: { fontWeight: 900 } }} helperText="Per booking" /></Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 3: CAPACITY & TRIAGE */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <LocalHospitalIcon /> Capacity & Triage
              </Typography>
            </Box>
            <Box sx={{ p: 3, flexGrow: 1, bgcolor: COLORS.cardBg }}>
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 3 }}>Controls physical clinic limits and algorithmic traffic warnings.</Typography>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12 }}><TextField fullWidth label="Max Confinement Cages" type="number" value={settings.maxCages} onChange={(e) => handleChange('maxCages', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end" sx={{ fontWeight: 900 }}>Cages</InputAdornment> }} sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }} inputProps={{ style: { fontWeight: 900 } }} helperText="Blocks admission" /></Grid>
                <Grid size={{ xs: 12 }}><Divider sx={{ my: 1 }} /></Grid>
                <Grid size={{ xs: 12 }}><TextField fullWidth label="Auto-No-Show Trigger" type="number" value={settings.autoNoShowMins} onChange={(e) => handleChange('autoNoShowMins', e.target.value)} InputProps={{ endAdornment: <InputAdornment position="end" sx={{ fontWeight: 900 }}>Mins Late</InputAdornment> }} sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }} inputProps={{ style: { fontWeight: 900 } }} helperText="Mins late before Queue displays No-Show button." /></Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="No-Show Lookback Window"
                    type="number"
                    value={settings.noShowLinkWindowDays}
                    onChange={(e) => handleChange('noShowLinkWindowDays', e.target.value)}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end" sx={{ fontWeight: 900 }}>Days</InputAdornment>
                      ),
                    }}
                    sx={{
                      bgcolor: 'white',
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderRadius: 0,
                        border: `1px solid ${COLORS.accent}33`,
                      },
                    }}
                    inputProps={{ style: { fontWeight: 900 }, min: 1, max: 365 }}
                    helperText="Days to look back when detecting no-show history on booking."
                  />
                </Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth label="Moderate Traffic" type="number" value={settings.trafficModerate} onChange={(e) => handleChange('trafficModerate', e.target.value)} sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }} inputProps={{ style: { fontWeight: 900 } }} helperText="Patients" /></Grid>
                <Grid size={{ xs: 6 }}><TextField fullWidth label="High Traffic" type="number" value={settings.trafficHigh} onChange={(e) => handleChange('trafficHigh', e.target.value)} sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }} inputProps={{ style: { fontWeight: 900 } }} helperText="Patients" /></Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 4: DYNAMIC DEPARTMENTS */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <DomainIcon /> Clinic Departments / Categories
              </Typography>
            </Box>
            <Box sx={{ p: 3, bgcolor: COLORS.cardBg, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              
              {/* THE FIX: Fixed minHeight on description creates perfect alignment with the Inventory Card */}
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 2.5, minHeight: 40 }}>
                These departments drive the Skill-Based Routing Engine and the color-coding system.
              </Typography>
              
              <Stack direction="row" spacing={2} sx={{ mb: 4, alignItems: 'center' }}>
                <TextField 
                  label="New Department Name" size="small" value={newDepartmentName} 
                  onChange={(e) => setNewDepartmentName(e.target.value)} 
                  sx={{ flexGrow: 1, bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }} 
                  inputProps={{ spellCheck: 'false', style: { fontWeight: 900 } }}
                />
                
                <FormControl size="small" sx={{ minWidth: 200, bgcolor: 'white' }}>
                    <InputLabel sx={{ fontWeight: 900 }}>Color Tag</InputLabel>
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
                      bgcolor: COLORS.accent, fontWeight: 900, px: 4, py: 1, 
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
                  sx={{ bgcolor: 'rgba(255,255,255,0.9)', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, borderColor: COLORS.borderInput } }}
                  inputProps={{ style: { fontWeight: 900 } }}
                />
                <FormControl size="small" sx={{ width: 140, bgcolor: 'rgba(255,255,255,0.9)' }}>
                  <Select
                    value={deptSort} onChange={e => setDeptSort(e.target.value)}
                    displayEmpty sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.borderInput}` }, fontWeight: 900, color: '#555' }}
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
                              fontWeight: 900, color: 'white', bgcolor: dept.color || '#616161', 
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
            <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <InventoryIcon /> Inventory Categories
              </Typography>
            </Box>
            <Box sx={{ p: 3, bgcolor: COLORS.cardBg, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              
              {/* THE FIX: Fixed minHeight enforces bottom alignment! */}
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 2.5, minHeight: 40 }}>
                Manage the taxonomy of your pharmacy and retail shop. These categories organize your search filters and financial reports.
              </Typography>
              
              <Stack direction="row" spacing={2} sx={{ mb: 4, alignItems: 'center' }}>
                <TextField 
                  label="New Category Name" size="small" value={newInvCatName} 
                  onChange={(e) => setNewInvCatName(e.target.value)} 
                  sx={{ flexGrow: 1, bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                  inputProps={{ spellCheck: 'false', style: { fontWeight: 900 } }}
                />
                
                {/* 💊 THE PILL TOGGLE UI */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.5, bgcolor: 'white', border: `1px solid ${COLORS.accent}33`, borderRadius: 0 }}>
                    <Typography variant="caption" sx={{ fontWeight: 900, color: newInvCatIsMedicine ? COLORS.dangerHover : '#757575', fontSize: '0.65rem' }}>
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
                      bgcolor: COLORS.accent, fontWeight: 900, px: 4, py: 1, 
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
                  sx={{ bgcolor: 'rgba(255,255,255,0.9)', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, borderColor: COLORS.borderInput } }}
                  inputProps={{ style: { fontWeight: 900 } }}
                />
                <FormControl size="small" sx={{ width: 140, bgcolor: 'rgba(255,255,255,0.9)' }}>
                  <Select
                    value={invCatSort} onChange={e => setInvCatSort(e.target.value)}
                    displayEmpty sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.borderInput}` }, fontWeight: 900, color: '#555' }}
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
                    icon={cat.isMedicine ? <MedicationIcon sx={{ fontSize: '1rem !important', color: `${COLORS.danger} !important` }} /> : null}
                    onDelete={cat.id.startsWith('default_') ? undefined : () => handleDeleteInvCategory(cat.id, cat.name)}
                    sx={{ 
                      fontWeight: 900, 
                      bgcolor: 'white', 
                      borderRadius: 0,
                      border: cat.isMedicine ? `2px solid ${COLORS.danger}` : '1px solid #ccc',
                      fontSize: '0.75rem', py: 2.2,
                      '& .MuiChip-label': { color: cat.isMedicine ? COLORS.danger : 'inherit' }
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

        {/* PILLAR 6: DASHBOARD ALERT THRESHOLDS (T2.331) */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{
                color: COLORS.accent, fontWeight: 900,
                display: 'flex', alignItems: 'center', gap: 1,
                textTransform: 'uppercase', letterSpacing: 1,
              }}>
                <NotificationsActiveIcon /> Dashboard Alert Thresholds
              </Typography>
            </Box>
            <Box sx={{ p: 3, flexGrow: 1, bgcolor: COLORS.cardBg }}>
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 3 }}>
                Triggers visual alerts on the Dashboard Operations tab when metrics exceed these limits.
              </Typography>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    fullWidth label="Max Avg Wait" type="number"
                    value={dashboardAlerts.avgWaitMax}
                    onChange={(e) => setDashboardAlerts(prev => ({ ...prev, avgWaitMax: parseInt(e.target.value) || 0 }))}
                    InputProps={{ endAdornment: <InputAdornment position="end">min</InputAdornment> }}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                    inputProps={{ style: { fontWeight: 900 } }}
                    helperText="Alert when avg wait exceeds this"
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    fullWidth label="Max Longest Wait" type="number"
                    value={dashboardAlerts.longestWaitMax}
                    onChange={(e) => setDashboardAlerts(prev => ({ ...prev, longestWaitMax: parseInt(e.target.value) || 0 }))}
                    InputProps={{ endAdornment: <InputAdornment position="end">min</InputAdornment> }}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                    inputProps={{ style: { fontWeight: 900 } }}
                    helperText="Alert when any patient waits this long"
                  />
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <TextField
                    fullWidth label="No-Show Alert" type="number"
                    value={dashboardAlerts.noShowMin}
                    onChange={(e) => setDashboardAlerts(prev => ({ ...prev, noShowMin: parseInt(e.target.value) || 0 }))}
                    InputProps={{ endAdornment: <InputAdornment position="end">count</InputAdornment> }}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                    inputProps={{ style: { fontWeight: 900 } }}
                  />
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <TextField
                    fullWidth label="Emergency Alert" type="number"
                    value={dashboardAlerts.emergencyMin}
                    onChange={(e) => setDashboardAlerts(prev => ({ ...prev, emergencyMin: parseInt(e.target.value) || 0 }))}
                    InputProps={{ endAdornment: <InputAdornment position="end">count</InputAdornment> }}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                    inputProps={{ style: { fontWeight: 900 } }}
                  />
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <TextField
                    fullWidth label="Queue Depth Alert" type="number"
                    value={dashboardAlerts.queueDepthMax}
                    onChange={(e) => setDashboardAlerts(prev => ({ ...prev, queueDepthMax: parseInt(e.target.value) || 0 }))}
                    InputProps={{ endAdornment: <InputAdornment position="end">patients</InputAdornment> }}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                    inputProps={{ style: { fontWeight: 900 } }}
                  />
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 7: MONTHLY GOALS (T2.336) */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{
                color: COLORS.accent, fontWeight: 900,
                display: 'flex', alignItems: 'center', gap: 1,
                textTransform: 'uppercase', letterSpacing: 1,
              }}>
                <FlagIcon /> Monthly Goals
              </Typography>
            </Box>
            <Box sx={{ p: 3, flexGrow: 1, bgcolor: COLORS.cardBg }}>
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 3 }}>
                Set monthly targets. Progress bars appear on the Dashboard Growth and Financial tabs when goals are configured.
              </Typography>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    fullWidth label="Target Revenue" type="number"
                    value={dashboardGoals.monthlyRevenue || ''}
                    onChange={(e) => setDashboardGoals(prev => ({ ...prev, monthlyRevenue: parseInt(e.target.value) || 0 }))}
                    InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                    inputProps={{ style: { fontWeight: 900 } }}
                    helperText="Monthly revenue goal"
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    fullWidth label="Target Appointments" type="number"
                    value={dashboardGoals.monthlyAppointments || ''}
                    onChange={(e) => setDashboardGoals(prev => ({ ...prev, monthlyAppointments: parseInt(e.target.value) || 0 }))}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                    inputProps={{ style: { fontWeight: 900 } }}
                    helperText="Monthly appointment count goal"
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    fullWidth label="Target New Clients" type="number"
                    value={dashboardGoals.monthlyNewClients || ''}
                    onChange={(e) => setDashboardGoals(prev => ({ ...prev, monthlyNewClients: parseInt(e.target.value) || 0 }))}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                    inputProps={{ style: { fontWeight: 900 } }}
                    helperText="Monthly new registrations goal"
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    fullWidth label="Target Records Signed" type="number"
                    value={dashboardGoals.monthlyRecordsSigned || ''}
                    onChange={(e) => setDashboardGoals(prev => ({ ...prev, monthlyRecordsSigned: parseInt(e.target.value) || 0 }))}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                    inputProps={{ style: { fontWeight: 900 } }}
                    helperText="Monthly medical records goal"
                  />
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 8: CLIENT SELF-CHECK-IN QR */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden' }}>
            <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{
                color: COLORS.accent, fontWeight: 900,
                display: 'flex', alignItems: 'center', gap: 1,
                textTransform: 'uppercase', letterSpacing: 1,
              }}>
                <QrCodeScannerIcon /> Client Self-Check-In QR
              </Typography>
            </Box>
            <Box sx={{ p: 3, bgcolor: COLORS.cardBg }}>
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 3 }}>
                Print and display this QR code in the clinic lobby. Clients scan it with the VetConnect app to self-check-in.
              </Typography>

              {/* QR code centered */}
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                <Box ref={qrRef} sx={{ p: 3, border: `3px solid ${COLORS.accent}`, borderRadius: 0, bgcolor: 'white' }}>
                  <QRCode value="STARBARKS-CHECKIN-starbarks-vetconnect-f6443" size={180} />
                </Box>
              </Box>

              {/* Print button */}
              <Button
                variant="contained" fullWidth
                onClick={handlePrintQR}
                sx={{
                  fontWeight: 900, borderRadius: 0, bgcolor: COLORS.accent,
                  border: `2px solid ${COLORS.brand}`, mb: 3,
                  boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
                  '&:hover': { bgcolor: COLORS.brand }
                }}
              >
                Print QR Poster
              </Button>

              {/* Geofence settings */}
              <Divider sx={{ my: 2 }} />
              <Typography variant="overline" sx={{ fontWeight: 900, color: COLORS.accent, letterSpacing: 1, display: 'block', mb: 1 }}>
                GPS Geofence (Check-In Radius)
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 4 }}>
                  <TextField fullWidth label="Latitude" type="number"
                    value={settings.clinicLat ?? ''}
                    onChange={(e) => handleChange('clinicLat', parseFloat(e.target.value) || 0)}
                    inputProps={{ step: 0.0001, style: { fontWeight: 900 } }}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                  />
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <TextField fullWidth label="Longitude" type="number"
                    value={settings.clinicLng ?? ''}
                    onChange={(e) => handleChange('clinicLng', parseFloat(e.target.value) || 0)}
                    inputProps={{ step: 0.0001, style: { fontWeight: 900 } }}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                  />
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <TextField fullWidth label="Radius" type="number"
                    value={settings.geofenceRadiusM ?? ''}
                    onChange={(e) => handleChange('geofenceRadiusM', parseInt(e.target.value) || 0)}
                    InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }}
                    inputProps={{ style: { fontWeight: 900 } }}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                  />
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 9: VACCINE CATALOG */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <VaccinesIcon /> Vaccine Catalog
              </Typography>
            </Box>
            <Box sx={{ p: 3, bgcolor: COLORS.cardBg, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>

              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 2.5 }}>
                Manage the clinic's vaccine catalog. Active vaccines appear in the ClinicalWorkspace form dropdown. Deactivated vaccines are preserved for historical record matching.
              </Typography>

              {/* ADD FORM — only shown when not editing */}
              {!editingVaccine && (
                <Box sx={{ mb: 3 }}>
                  <Grid container spacing={1.5} alignItems="flex-end">
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <TextField
                        fullWidth label="Vaccine Name" size="small"
                        value={newVaccine.name}
                        onChange={(e) => setNewVaccine((prev) => ({ ...prev, name: e.target.value }))}
                        sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                        inputProps={{ spellCheck: 'false', style: { fontWeight: 900 } }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Typography variant="caption" sx={{ fontWeight: 900, color: COLORS.accent, display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Species
                      </Typography>
                      <ToggleButtonGroup
                        multiple
                        value={newVaccine.species}
                        onChange={(_, val) => { if (val.length > 0) setNewVaccine((prev) => ({ ...prev, species: val })); }}
                        size="small"
                        sx={{
                          gap: 0.5,
                          '& .MuiToggleButton-root': {
                            border: `2px solid ${COLORS.accent}33 !important`,
                            borderRadius: '0 !important',
                            fontWeight: 900, fontSize: '0.65rem', color: COLORS.accent, px: 1.5, py: 0.5,
                            '&.Mui-selected': {
                              bgcolor: `${COLORS.accent} !important`,
                              color: `${COLORS.cardBg} !important`,
                            },
                          },
                        }}
                      >
                        <ToggleButton value="dog">Dog</ToggleButton>
                        <ToggleButton value="cat">Cat</ToggleButton>
                      </ToggleButtonGroup>
                    </Grid>
                    <Grid size={{ xs: 6, sm: 2 }}>
                      <TextField
                        fullWidth label="Interval (days)" size="small" type="number"
                        value={newVaccine.intervalDays}
                        onChange={(e) => setNewVaccine((prev) => ({ ...prev, intervalDays: e.target.value }))}
                        sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                        inputProps={{ style: { fontWeight: 900 } }}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 2 }}>
                      <Button
                        variant="contained" fullWidth onClick={handleAddVaccine}
                        startIcon={<AddCircleOutlineIcon />}
                        sx={{
                          bgcolor: COLORS.accent, fontWeight: 900, borderRadius: 0,
                          border: `2px solid ${COLORS.brand}`,
                          boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
                          '&:hover': { bgcolor: COLORS.brand },
                        }}
                      >
                        Add
                      </Button>
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth label="Keywords (comma-separated)" size="small"
                        placeholder="e.g. rabies, rage virus"
                        value={newVaccine.keywords}
                        onChange={(e) => setNewVaccine((prev) => ({ ...prev, keywords: e.target.value }))}
                        sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                        inputProps={{ spellCheck: 'false', style: { fontWeight: 900 } }}
                        helperText="Used to auto-detect vaccine type from medical record notes"
                      />
                    </Grid>
                  </Grid>
                </Box>
              )}

              {/* SEED BUTTON — shown only when list is empty */}
              {vaccineList.length === 0 && (
                <Button
                  variant="outlined" onClick={handleSeedVaccineCatalog}
                  sx={{
                    mb: 2, fontWeight: 900, borderRadius: 0,
                    border: `2px solid ${COLORS.accent}`,
                    color: COLORS.accent,
                    '&:hover': { bgcolor: COLORS.cream },
                  }}
                >
                  Seed Default Vaccines (6 entries)
                </Button>
              )}

              {/* VACCINE LIST */}
              <Box sx={{ flexGrow: 1, overflowY: 'auto', maxHeight: 340 }}>
                {vaccineList.length === 0 ? (
                  <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, fontStyle: 'italic', mt: 1 }}>
                    No vaccines configured. Click "Seed Default Vaccines" or add entries above.
                  </Typography>
                ) : (
                  vaccineList.map((vaccine) => (
                    <Box key={vaccine.id}>
                      {editingVaccine?.id === vaccine.id ? (
                        /* INLINE EDIT ROW */
                        <Box sx={{
                          p: 1.5, mb: 1, bgcolor: 'white',
                          border: `2px solid ${COLORS.accent}`,
                          display: 'flex', flexDirection: 'column', gap: 1,
                        }}>
                          <Grid container spacing={1} alignItems="center">
                            <Grid size={{ xs: 12, sm: 4 }}>
                              <TextField
                                fullWidth size="small" label="Name"
                                value={editingVaccine.name}
                                onChange={(e) => setEditingVaccine((prev) => ({ ...prev, name: e.target.value }))}
                                sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 } }}
                                inputProps={{ style: { fontWeight: 900 } }}
                              />
                            </Grid>
                            <Grid size={{ xs: 8, sm: 4 }}>
                              <ToggleButtonGroup
                                multiple
                                value={editingVaccine.species}
                                onChange={(_, val) => { if (val.length > 0) setEditingVaccine((prev) => ({ ...prev, species: val })); }}
                                size="small"
                                sx={{
                                  gap: 0.5,
                                  '& .MuiToggleButton-root': {
                                    border: `2px solid ${COLORS.accent}33 !important`,
                                    borderRadius: '0 !important',
                                    fontWeight: 900, fontSize: '0.65rem', color: COLORS.accent, px: 1.5, py: 0.5,
                                    '&.Mui-selected': {
                                      bgcolor: `${COLORS.accent} !important`,
                                      color: `${COLORS.cardBg} !important`,
                                    },
                                  },
                                }}
                              >
                                <ToggleButton value="dog">Dog</ToggleButton>
                                <ToggleButton value="cat">Cat</ToggleButton>
                              </ToggleButtonGroup>
                            </Grid>
                            <Grid size={{ xs: 4, sm: 2 }}>
                              <TextField
                                fullWidth size="small" label="Days" type="number"
                                value={editingVaccine.intervalDays}
                                onChange={(e) => setEditingVaccine((prev) => ({ ...prev, intervalDays: e.target.value }))}
                                sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 } }}
                                inputProps={{ style: { fontWeight: 900 } }}
                              />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 2 }} sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                              <IconButton size="small" onClick={handleUpdateVaccine} sx={{ borderRadius: 0, bgcolor: COLORS.success, color: 'white', '&:hover': { bgcolor: COLORS.brand } }}>
                                <CheckIcon fontSize="small" />
                              </IconButton>
                              <IconButton size="small" onClick={() => setEditingVaccine(null)} sx={{ borderRadius: 0, bgcolor: '#9E9E9E', color: 'white', '&:hover': { bgcolor: '#757575' } }}>
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </Grid>
                            <Grid size={{ xs: 12 }}>
                              <TextField
                                fullWidth size="small" label="Keywords (comma-separated)"
                                value={
                                  Array.isArray(editingVaccine.keywords)
                                    ? editingVaccine.keywords.join(', ')
                                    : editingVaccine.keywords
                                }
                                onChange={(e) => setEditingVaccine((prev) => ({ ...prev, keywords: e.target.value }))}
                                sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 } }}
                                inputProps={{ spellCheck: 'false', style: { fontWeight: 900 } }}
                              />
                            </Grid>
                          </Grid>
                        </Box>
                      ) : (
                        /* READ-ONLY ROW */
                        <Box sx={{
                          display: 'flex', alignItems: 'center', gap: 1,
                          px: 1.5, py: 1, mb: 0.75,
                          bgcolor: vaccine.isActive ? 'white' : 'rgba(0,0,0,0.04)',
                          border: `1px solid ${vaccine.isActive ? COLORS.accent + '33' : '#ccc'}`,
                          opacity: vaccine.isActive ? 1 : 0.65,
                        }}>
                          {/* Name + species chips */}
                          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography sx={{
                              fontWeight: 900, fontSize: '0.8rem', color: COLORS.accent,
                              textDecoration: vaccine.isActive ? 'none' : 'line-through',
                            }}>
                              {vaccine.name}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
                              {(vaccine.species || []).map((sp) => (
                                <Chip
                                  key={sp}
                                  label={sp.charAt(0).toUpperCase() + sp.slice(1)}
                                  size="small"
                                  sx={{
                                    fontWeight: 900, fontSize: '0.6rem', height: 16, borderRadius: 0,
                                    bgcolor: sp === 'dog' ? '#E3F2FD' : '#FCE4EC',
                                    border: `1px solid ${sp === 'dog' ? '#90CAF9' : '#F48FB1'}`,
                                    color: sp === 'dog' ? '#1565C0' : '#880E4F',
                                  }}
                                />
                              ))}
                              <Typography sx={{ fontSize: '0.65rem', color: COLORS.textSecondary, alignSelf: 'center' }}>
                                {vaccine.intervalDays}d interval
                              </Typography>
                            </Box>
                          </Box>

                          {/* Active toggle */}
                          <Switch
                            checked={vaccine.isActive !== false}
                            onChange={() => handleToggleVaccine(vaccine.id)}
                            size="small"
                            color="success"
                          />

                          {/* Edit button */}
                          <IconButton
                            size="small"
                            onClick={() => setEditingVaccine({
                              ...vaccine,
                              keywords: Array.isArray(vaccine.keywords)
                                ? vaccine.keywords.join(', ')
                                : (vaccine.keywords || ''),
                            })}
                            sx={{ borderRadius: 0, color: COLORS.accent, '&:hover': { bgcolor: COLORS.cream } }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      )}
                    </Box>
                  ))
                )}
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 10: DATA PRIVACY & CONSENT POLICIES */}
        <Grid size={{ xs: 12 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden' }}>
            <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <GavelIcon /> Data Privacy & Consent Policies
              </Typography>
            </Box>
            <Box sx={{ p: 3, bgcolor: COLORS.cardBg }}>

              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 3 }}>
                Manage versioned consent policies under Republic Act No. 10173 (Data Privacy Act of 2012). Publishing a new version requires all clients to re-consent on their next login.
              </Typography>

              {/* SEED BUTTON — visible only when zero versions exist */}
              {!consentLoading && consentVersions.length === 0 && (
                <Box sx={{ mb: 3, p: 2.5, border: `2px dashed ${COLORS.accent}`, bgcolor: COLORS.warningSurface }}>
                  <Typography sx={{ ...TYPE.bodyBold, color: COLORS.accent, mb: 1 }}>
                    No consent policies configured
                  </Typography>
                  <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 2 }}>
                    Seed the default RA 10173 DPA consent form and veterinary liability waiver (both v1) to get started.
                  </Typography>
                  <Button
                    variant="outlined"
                    onClick={handleSeedConsentPolicies}
                    startIcon={<GavelIcon />}
                    sx={{
                      fontWeight: 900, borderRadius: 0,
                      border: `2px solid ${COLORS.accent}`,
                      color: COLORS.accent,
                      '&:hover': { bgcolor: COLORS.cream },
                    }}
                  >
                    Seed Default Policies
                  </Button>
                </Box>
              )}

              {/* ACTIVE POLICY SUMMARY */}
              {consentActiveVersion !== null && (
                <Box sx={{ mb: 3, p: 2, border: `2px solid ${COLORS.success}`, bgcolor: COLORS.kpiGreenBg }}>
                  <Typography sx={{ ...TYPE.label, color: COLORS.success, mb: 0.5 }}>Active Policy</Typography>
                  <Typography sx={{ ...TYPE.bodyBold, color: COLORS.textPrimary }}>
                    Version {consentActiveVersion}
                  </Typography>
                  <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary }}>
                    Effective {formatConsentDate(consentActivatedAt)} &mdash; Published by {consentActivatedBy || '—'}
                  </Typography>
                </Box>
              )}

              {/* RE-CONSENT PROGRESS COUNTER */}
              {consentActiveVersion !== null && (
                <Box sx={{ mb: 3, p: 2, border: `2px solid ${COLORS.border}`, bgcolor: COLORS.cardBg }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <GroupIcon sx={{ fontSize: 18, color: COLORS.accent }} />
                      <Typography sx={{ ...TYPE.label, color: COLORS.accent }}>
                        Re-consent Progress — Version {consentActiveVersion}
                      </Typography>
                    </Stack>
                    <Button
                      size="small"
                      startIcon={
                        reconsentProgress.loading
                          ? <CircularProgress size={14} sx={{ color: COLORS.accent }} />
                          : <RefreshIcon fontSize="small" />
                      }
                      onClick={handleRefreshReconsentProgress}
                      disabled={reconsentProgress.loading}
                      sx={{
                        borderRadius: 0,
                        border: `1px solid ${COLORS.border}`,
                        color: COLORS.accent,
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        px: 1.5,
                        '&:hover': { bgcolor: COLORS.cream },
                        '&.Mui-disabled': { opacity: 0.5 },
                      }}
                    >
                      {reconsentProgress.loading ? 'Loading...' : 'Refresh'}
                    </Button>
                  </Stack>

                  {reconsentProgress.total > 0 ? (
                    <>
                      <Typography sx={{ ...TYPE.bodyBold, color: COLORS.textPrimary, mb: 1 }}>
                        {reconsentProgress.consented} / {reconsentProgress.total} clients consented
                        {' '}
                        <Typography component="span" sx={{ ...TYPE.meta, color: COLORS.textMuted }}>
                          ({Math.round((reconsentProgress.consented / reconsentProgress.total) * 100)}%)
                        </Typography>
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={(reconsentProgress.consented / reconsentProgress.total) * 100}
                        sx={{
                          height: 10,
                          borderRadius: 0,
                          border: `1px solid ${COLORS.border}`,
                          bgcolor: COLORS.borderLight,
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 0,
                            bgcolor: reconsentProgress.consented === reconsentProgress.total
                              ? COLORS.success
                              : COLORS.accent,
                          },
                        }}
                      />
                      {reconsentProgress.consented < reconsentProgress.total && (
                        <Typography sx={{ ...TYPE.meta, color: COLORS.warning, mt: 1 }}>
                          {reconsentProgress.total - reconsentProgress.consented} client(s) have not yet re-consented.
                        </Typography>
                      )}
                      {reconsentProgress.consented === reconsentProgress.total && (
                        <Typography sx={{ ...TYPE.meta, color: COLORS.success, mt: 1 }}>
                          All active clients have re-consented.
                        </Typography>
                      )}
                    </>
                  ) : reconsentProgress.queried && reconsentProgress.total === 0 ? (
                    <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, fontStyle: 'italic' }}>
                      No active clients found.
                    </Typography>
                  ) : !reconsentProgress.queried && !reconsentProgress.loading ? (
                    <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, fontStyle: 'italic' }}>
                      Press Refresh to load re-consent progress.
                    </Typography>
                  ) : null}
                </Box>
              )}

              {/* LEGACY DATA MIGRATION — Step 7.2 (T3.5 Phase 7) */}
              {consentVersions.length > 0 && (
                <Box sx={{ mb: 3, p: 2.5, border: `2px solid ${COLORS.border}`, bgcolor: COLORS.cardBg }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <GavelIcon sx={{ fontSize: 18, color: COLORS.accent }} />
                    <Typography sx={{ ...TYPE.label, color: COLORS.accent }}>
                      Legacy Data Migration
                    </Typography>
                  </Stack>

                  <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 2 }}>
                    Migrate existing clients who consented under the old boolean system to the new versioned consent records.
                    This is a one-time operation and is safe to preview before running.
                  </Typography>

                  {/* Preview result */}
                  {migrationResult.previewed && !migrationResult.executed && (
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: COLORS.warningSurface, border: `1px solid ${COLORS.border}` }}>
                      <Typography sx={{ ...TYPE.bodyBold, color: COLORS.textPrimary }}>
                        Found {migrationResult.migrated} client(s) eligible for migration
                        {migrationResult.skipped > 0 && ` (${migrationResult.skipped} already migrated or ineligible)`}
                      </Typography>
                      {migrationResult.errors.length > 0 && (
                        <Typography sx={{ ...TYPE.meta, color: COLORS.danger, mt: 0.5 }}>
                          {migrationResult.errors.length} error(s) encountered during preview — check console.
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* Post-execution result */}
                  {migrationResult.executed && (
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: COLORS.kpiGreenBg, border: `1px solid ${COLORS.kpiGreenBorder}` }}>
                      <Typography sx={{ ...TYPE.bodyBold, color: COLORS.success }}>
                        Migration complete — migrated {migrationResult.migrated}, skipped {migrationResult.skipped}.
                        {migrationResult.errors.length > 0 && ` ${migrationResult.errors.length} error(s) — check console.`}
                      </Typography>
                    </Box>
                  )}

                  <Stack direction="row" spacing={1.5}>
                    {/* Preview button */}
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={
                        migrationResult.loading && !migrationResult.previewed
                          ? <CircularProgress size={14} sx={{ color: COLORS.accent }} />
                          : <RefreshIcon fontSize="small" />
                      }
                      onClick={handleMigrationPreview}
                      disabled={migrationResult.loading || migrationResult.executed}
                      sx={{
                        fontFamily: FONT,
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        textTransform: 'none',
                        borderRadius: 0,
                        borderColor: COLORS.border,
                        color: COLORS.textSecondary,
                        '&:hover': { borderColor: COLORS.accent, color: COLORS.accent },
                        '&.Mui-disabled': { opacity: 0.5 },
                      }}
                    >
                      {migrationResult.loading && !migrationResult.previewed ? 'Previewing...' : 'Preview'}
                    </Button>

                    {/* Execute button */}
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={
                        migrationResult.loading && migrationResult.previewed
                          ? <CircularProgress size={14} sx={{ color: COLORS.cardBg }} />
                          : null
                      }
                      onClick={handleMigrationExecute}
                      disabled={
                        !migrationResult.previewed ||
                        migrationResult.migrated === 0 ||
                        migrationResult.loading ||
                        migrationResult.executed
                      }
                      sx={{
                        fontFamily: FONT,
                        fontWeight: 900,
                        fontSize: '0.8rem',
                        textTransform: 'none',
                        borderRadius: 0,
                        bgcolor: COLORS.accent,
                        boxShadow: 'none',
                        '&:hover': { bgcolor: COLORS.brand, boxShadow: 'none' },
                        '&.Mui-disabled': { bgcolor: COLORS.borderLight, boxShadow: 'none' },
                      }}
                    >
                      {migrationResult.loading && migrationResult.previewed ? 'Migrating...' : 'Run Migration'}
                    </Button>
                  </Stack>
                </Box>
              )}

              {/* CREATE NEW DRAFT BUTTON */}
              {consentVersions.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Button
                    variant="contained"
                    startIcon={<AddCircleOutlineIcon />}
                    onClick={handleOpenCreateDraft}
                    sx={{
                      bgcolor: COLORS.accent, fontWeight: 900, borderRadius: 0,
                      border: `2px solid ${COLORS.brand}`,
                      boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
                      '&:hover': { bgcolor: COLORS.brand },
                    }}
                  >
                    Create New Version
                  </Button>
                </Box>
              )}

              {/* VERSION HISTORY TABLE */}
              {consentVersions.length > 0 && (
                <Box>
                  <Typography sx={{ ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>Version History</Typography>
                  <Box sx={{ border: `2px solid ${COLORS.border}`, overflow: 'hidden' }}>

                    {/* Table header */}
                    <Box sx={{
                      display: 'grid',
                      gridTemplateColumns: '100px 80px 120px 1fr 180px',
                      gap: 0,
                      bgcolor: COLORS.tableHeaderBg,
                      borderBottom: `2px solid ${COLORS.border}`,
                      px: 2, py: 1,
                    }}>
                      {['Status', 'Version', 'Type', 'Summary', 'Actions'].map((header) => (
                        <Typography key={header} sx={{ ...TYPE.label, color: COLORS.textSecondary, fontSize: '0.65rem' }}>
                          {header}
                        </Typography>
                      ))}
                    </Box>

                    {/* Table rows */}
                    {consentVersions.map((v, index) => (
                      <Box
                        key={v.id}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: '100px 80px 120px 1fr 180px',
                          gap: 0,
                          alignItems: 'center',
                          px: 2, py: 1.5,
                          borderBottom: index < consentVersions.length - 1 ? `1px solid ${COLORS.borderLight}` : 'none',
                          bgcolor: v.status === 'active' ? COLORS.kpiGreenBg : 'transparent',
                        }}
                      >
                        {/* Status chip */}
                        <Box>
                          <Chip
                            label={v.status.toUpperCase()}
                            size="small"
                            sx={getConsentStatusChipSx(v.status)}
                          />
                        </Box>

                        {/* Version number */}
                        <Typography sx={{ ...TYPE.bodyBold, color: COLORS.textPrimary }}>
                          v{v.versionNumber}
                        </Typography>

                        {/* Type */}
                        <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {v.type === CONSENT_TYPES.DPA ? 'DPA' : 'Waiver'}
                        </Typography>

                        {/* Summary + created date */}
                        <Box>
                          <Typography sx={{ ...TYPE.body, color: COLORS.textPrimary }}>
                            {v.summary || v.title || '—'}
                          </Typography>
                          <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted }}>
                            Created {formatConsentDate(v.createdAt)} by {v.createdBy || '—'}
                          </Typography>
                        </Box>

                        {/* Action buttons */}
                        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                          {/* View full text — available for all statuses */}
                          <IconButton
                            size="small"
                            onClick={() => handleViewPolicy(v)}
                            title="View full policy text"
                            sx={{ borderRadius: 0, color: COLORS.info, '&:hover': { bgcolor: COLORS.chipBlueBg } }}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>

                          {/* Edit — draft only */}
                          {v.status === 'draft' && (
                            <IconButton
                              size="small"
                              onClick={() => handleOpenEditDraft(v)}
                              title="Edit draft"
                              sx={{ borderRadius: 0, color: COLORS.accent, '&:hover': { bgcolor: COLORS.cream } }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          )}

                          {/* Publish — draft only */}
                          {v.status === 'draft' && (
                            <IconButton
                              size="small"
                              onClick={() => handleRequestPublish(v.id)}
                              title="Publish this version"
                              sx={{ borderRadius: 0, color: COLORS.success, '&:hover': { bgcolor: COLORS.kpiGreenBg } }}
                            >
                              <PublishIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Stack>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

            </Box>
          </Paper>
        </Grid>

        {/* PILLAR 11: AI CLINICAL REASONING */}
        <Grid size={{ xs: 12 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden' }}>

            {/* Header */}
            <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <AutoFixHighIcon /> AI Clinical Reasoning
              </Typography>
            </Box>

            <Box sx={{ p: 3, bgcolor: COLORS.cardBg }}>

              {/* Description */}
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 3 }}>
                Enable AI-powered differential diagnosis suggestions in the Clinical Workspace. The LLM analysis is additive — the existing rule-based engine continues to run. This feature is advisory only; the attending veterinarian makes all clinical decisions.
              </Typography>

              {/* Provider notice */}
              <Box sx={{ mb: 3, p: 2, bgcolor: COLORS.kpiBlueBg, border: `2px solid ${COLORS.kpiBlueBorder}` }}>
                <Typography sx={{ ...TYPE.label, color: COLORS.info, mb: 0.5 }}>
                  Provider: Anthropic Claude Haiku 4.5 via Cloudflare Worker
                </Typography>
                <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary }}>
                  Requests are proxied through a Cloudflare Worker. The API key lives in the
                  Worker's environment variable — it never touches the browser or Firestore.
                  Deploy a Worker using the instructions in PHASE3_LLM_CLINICAL_REASONING_PLAN.md Phase 0.
                </Typography>
              </Box>

              {/* Enable toggle */}
              <Box sx={{ mb: 3 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={llmConfig.enabled}
                      onChange={(e) => setLlmConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.info },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: COLORS.info },
                      }}
                    />
                  }
                  label={
                    <Typography sx={{ ...TYPE.bodyBold, color: COLORS.textPrimary }}>
                      Enable AI Clinical Reasoning
                    </Typography>
                  }
                />
              </Box>

              {/* Worker URL + Test button */}
              <Box sx={{ mb: 1 }}>
                <TextField
                  fullWidth
                  label="Cloudflare Worker URL"
                  placeholder="https://vetconnect-ai.your-name.workers.dev"
                  value={llmConfig.workerUrl}
                  onChange={(e) => {
                    setLlmConfig(prev => ({ ...prev, workerUrl: e.target.value }));
                    setLlmTestResult(null);
                  }}
                  helperText="The URL of your deployed Cloudflare Worker proxy. The API key is not entered here."
                  sx={{
                    bgcolor: 'white',
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 0,
                      '& fieldset': { border: `2px solid ${COLORS.accent}33` },
                    },
                  }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={handleTestLlm}
                          disabled={llmTestLoading || !llmConfig.workerUrl.trim()}
                          startIcon={llmTestLoading ? <CircularProgress size={14} /> : null}
                          sx={{
                            fontWeight: 900,
                            fontSize: '0.7rem',
                            borderRadius: 0,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            borderColor: COLORS.accent,
                            color: COLORS.accent,
                            whiteSpace: 'nowrap',
                            '&:hover': { bgcolor: COLORS.cream },
                          }}
                        >
                          {llmTestLoading ? 'Testing...' : 'Test Connection'}
                        </Button>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>

              {/* Test result chip */}
              {llmTestResult && (
                <Box sx={{ mb: 3 }}>
                  <Chip
                    label={llmTestResult.message}
                    size="small"
                    sx={{
                      borderRadius: 0,
                      fontWeight: 900,
                      fontSize: '0.7rem',
                      bgcolor: llmTestResult.ok ? COLORS.kpiGreenBg : COLORS.kpiRedBg,
                      color: llmTestResult.ok ? COLORS.success : COLORS.danger,
                      border: `1px solid ${llmTestResult.ok ? COLORS.kpiGreenBorder : COLORS.kpiRedBorder}`,
                    }}
                  />
                </Box>
              )}

              {/* System prompt */}
              <Box sx={{ mb: 1, mt: 3 }}>
                <Typography sx={{ ...TYPE.label, color: COLORS.accent, mb: 1 }}>
                  System Prompt
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={8}
                  maxRows={16}
                  value={llmConfig.systemPrompt || DEFAULT_CLINICAL_SYSTEM_PROMPT}
                  onChange={(e) => setLlmConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                  helperText="Customize the AI's clinical reasoning instructions. Changes take effect after saving."
                  sx={{
                    bgcolor: 'white',
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 0,
                      fontFamily: "'Inter', 'Roboto', monospace",
                      fontSize: '0.8rem',
                      lineHeight: 1.6,
                      '& fieldset': { border: `2px solid ${COLORS.accent}33` },
                    },
                  }}
                />
              </Box>

              {/* Reset to default prompt */}
              <Box sx={{ mb: 3 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={() => setLlmConfig(prev => ({ ...prev, systemPrompt: DEFAULT_CLINICAL_SYSTEM_PROMPT }))}
                  sx={{
                    fontWeight: 900,
                    fontSize: '0.7rem',
                    borderRadius: 0,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    borderColor: COLORS.accentLight,
                    color: COLORS.textSecondary,
                    '&:hover': { bgcolor: COLORS.cream },
                  }}
                >
                  Reset to Default Prompt
                </Button>
              </Box>

              {/* Billing guidance */}
              <Box sx={{ mb: 3, p: 2, bgcolor: COLORS.warningSurface, border: `2px solid ${COLORS.warning}` }}>
                <Typography sx={{ ...TYPE.label, color: COLORS.warning, mb: 0.5 }}>
                  Billing Notice
                </Typography>
                <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary }}>
                  Claude Haiku 4.5: approximately $0.55–$2.76/month for typical clinic volume.
                  Each clinical reasoning call uses approximately 500–2,000 tokens.
                  Set billing limits at console.anthropic.com to prevent unexpected charges.
                  Cloudflare Worker free tier: 100,000 requests/day.
                </Typography>
              </Box>

              {/* Save button */}
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveLlmConfig}
                disabled={llmSaving}
                sx={{
                  fontWeight: 900,
                  px: 4,
                  py: 1,
                  borderRadius: 0,
                  bgcolor: COLORS.accent,
                  border: `2px solid ${COLORS.brand}`,
                  boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
                  '&:hover': { bgcolor: COLORS.brand },
                  '&.Mui-disabled': { bgcolor: COLORS.textMuted, color: '#fff' },
                }}
              >
                {llmSaving ? 'Saving...' : 'Save AI Configuration'}
              </Button>

            </Box>
          </Paper>
        </Grid>

      </Grid>

      {/* ── PILLAR 10 DIALOGS ────────────────────────────────────────────── */}

      {/* CREATE DRAFT DIALOG */}
      <Dialog open={createDraftOpen} onClose={() => setCreateDraftOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 900, color: COLORS.accent, bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.accent}`, borderRadius: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
          <GavelIcon /> Create New Policy Version
        </DialogTitle>
        <DialogContent sx={{ pt: 3, bgcolor: COLORS.formBg }}>
          <Stack spacing={2.5}>
            {/* Type selector */}
            <Box>
              <Typography sx={{ ...TYPE.label, color: COLORS.accent, mb: 1 }}>Policy Type</Typography>
              <ToggleButtonGroup
                exclusive
                value={draftForm.type}
                onChange={(_, val) => { if (val) setDraftForm((prev) => ({ ...prev, type: val })); }}
                size="small"
                sx={{
                  '& .MuiToggleButton-root': {
                    border: `2px solid ${COLORS.accent}33 !important`,
                    borderRadius: '0 !important',
                    fontWeight: 900, fontSize: '0.75rem', color: COLORS.accent, px: 2.5, py: 0.75,
                    '&.Mui-selected': {
                      bgcolor: `${COLORS.accent} !important`,
                      color: `${COLORS.cardBg} !important`,
                    },
                  },
                }}
              >
                <ToggleButton value={CONSENT_TYPES.DPA}>DPA Consent (RA 10173)</ToggleButton>
                <ToggleButton value={CONSENT_TYPES.WAIVER}>Liability Waiver</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Title */}
            <TextField
              fullWidth label="Policy Title" size="small"
              value={draftForm.title}
              onChange={(e) => setDraftForm((prev) => ({ ...prev, title: e.target.value }))}
              sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 } }}
              inputProps={{ style: { fontWeight: 700 } }}
              placeholder="e.g. Data Privacy Act Consent (RA 10173) — Version 2"
            />

            {/* Summary */}
            <TextField
              fullWidth label="Summary (what changed from the previous version)" size="small"
              value={draftForm.summary}
              onChange={(e) => setDraftForm((prev) => ({ ...prev, summary: e.target.value }))}
              sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 } }}
              inputProps={{ style: { fontWeight: 400 } }}
              placeholder="e.g. Added data portability section per NPC Circular 23-01"
            />

            {/* Body text */}
            <TextField
              fullWidth label="Policy Body Text" multiline minRows={12}
              value={draftForm.bodyText}
              onChange={(e) => setDraftForm((prev) => ({ ...prev, bodyText: e.target.value }))}
              sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 } }}
              inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.6 } }}
              helperText="Enter the full policy text. This is what clients will read before signing."
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.border}` }}>
          <Button
            onClick={() => setCreateDraftOpen(false)}
            sx={{ fontWeight: 900, color: COLORS.textSecondary, borderRadius: 0 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveNewDraft}
            sx={{ fontWeight: 900, borderRadius: 0, bgcolor: COLORS.accent, '&:hover': { bgcolor: COLORS.brand } }}
          >
            Save as Draft
          </Button>
        </DialogActions>
      </Dialog>

      {/* EDIT DRAFT DIALOG */}
      <Dialog open={editDraftOpen} onClose={() => setEditDraftOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 900, color: COLORS.accent, bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.accent}`, borderRadius: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
          <EditIcon /> Edit Draft Policy
        </DialogTitle>
        <DialogContent sx={{ pt: 3, bgcolor: COLORS.formBg }}>
          {editingDraft && (
            <Stack spacing={2.5}>
              {/* Type selector */}
              <Box>
                <Typography sx={{ ...TYPE.label, color: COLORS.accent, mb: 1 }}>Policy Type</Typography>
                <ToggleButtonGroup
                  exclusive
                  value={editingDraft.type}
                  onChange={(_, val) => { if (val) setEditingDraft((prev) => ({ ...prev, type: val })); }}
                  size="small"
                  sx={{
                    '& .MuiToggleButton-root': {
                      border: `2px solid ${COLORS.accent}33 !important`,
                      borderRadius: '0 !important',
                      fontWeight: 900, fontSize: '0.75rem', color: COLORS.accent, px: 2.5, py: 0.75,
                      '&.Mui-selected': {
                        bgcolor: `${COLORS.accent} !important`,
                        color: `${COLORS.cardBg} !important`,
                      },
                    },
                  }}
                >
                  <ToggleButton value={CONSENT_TYPES.DPA}>DPA Consent (RA 10173)</ToggleButton>
                  <ToggleButton value={CONSENT_TYPES.WAIVER}>Liability Waiver</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {/* Title */}
              <TextField
                fullWidth label="Policy Title" size="small"
                value={editingDraft.title || ''}
                onChange={(e) => setEditingDraft((prev) => ({ ...prev, title: e.target.value }))}
                sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 } }}
                inputProps={{ style: { fontWeight: 700 } }}
              />

              {/* Summary */}
              <TextField
                fullWidth label="Summary (what changed from the previous version)" size="small"
                value={editingDraft.summary || ''}
                onChange={(e) => setEditingDraft((prev) => ({ ...prev, summary: e.target.value }))}
                sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 } }}
              />

              {/* Body text */}
              <TextField
                fullWidth label="Policy Body Text" multiline minRows={12}
                value={editingDraft.bodyText || ''}
                onChange={(e) => setEditingDraft((prev) => ({ ...prev, bodyText: e.target.value }))}
                sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 } }}
                inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.6 } }}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.border}` }}>
          <Button
            onClick={() => setEditDraftOpen(false)}
            sx={{ fontWeight: 900, color: COLORS.textSecondary, borderRadius: 0 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveEditedDraft}
            sx={{ fontWeight: 900, borderRadius: 0, bgcolor: COLORS.accent, '&:hover': { bgcolor: COLORS.brand } }}
          >
            Save Draft
          </Button>
        </DialogActions>
      </Dialog>

      {/* PUBLISH CONFIRMATION DIALOG */}
      <Dialog open={publishConfirmOpen} onClose={() => setPublishConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 900, color: COLORS.accent, bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.accent}`, borderRadius: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PublishIcon /> Publish Policy Version
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography sx={{ ...TYPE.body, color: COLORS.textPrimary, mb: 1.5 }}>
            Publishing{' '}
            <strong>
              {pendingPublishVersion
                ? `"${pendingPublishVersion.title}" (v${pendingPublishVersion.versionNumber})`
                : 'this version'}
            </strong>{' '}
            will:
          </Typography>
          <Box component="ul" sx={{ pl: 2.5, ...TYPE.body, color: COLORS.textPrimary }}>
            <li>Make this the active policy version</li>
            <li>Require all existing clients to re-consent on their next login</li>
            <li>Mark all previously active versions as "superseded"</li>
          </Box>
          <Box sx={{ mt: 2, p: 2, bgcolor: COLORS.dangerSurface, border: `2px solid ${COLORS.danger}` }}>
            <Typography sx={{ ...TYPE.bodyBold, color: COLORS.danger }}>
              This action cannot be undone.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.border}` }}>
          <Button
            onClick={() => setPublishConfirmOpen(false)}
            sx={{ fontWeight: 900, color: COLORS.textSecondary, borderRadius: 0 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmPublish}
            startIcon={<PublishIcon />}
            sx={{ fontWeight: 900, borderRadius: 0, bgcolor: COLORS.success, '&:hover': { bgcolor: COLORS.brand } }}
          >
            Publish Version
          </Button>
        </DialogActions>
      </Dialog>

      {/* VIEW FULL TEXT DIALOG */}
      <Dialog open={viewPolicyOpen} onClose={() => setViewPolicyOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{
          fontWeight: 900, color: COLORS.accent, bgcolor: COLORS.cream,
          borderBottom: `2px solid ${COLORS.accent}`, borderRadius: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VisibilityIcon />
            {viewingPolicy?.title || 'Policy Text'}
          </Box>
          {viewingPolicy && (
            <Chip
              label={viewingPolicy.status.toUpperCase()}
              size="small"
              sx={getConsentStatusChipSx(viewingPolicy.status)}
            />
          )}
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ p: 3, maxHeight: '60vh', overflowY: 'auto', bgcolor: COLORS.formBg }}>
            {viewingPolicy?.summary && (
              <Box sx={{ mb: 2, p: 1.5, bgcolor: COLORS.warningSurface, border: `1px solid ${COLORS.border}` }}>
                <Typography sx={{ ...TYPE.label, color: COLORS.accent, mb: 0.5 }}>Summary</Typography>
                <Typography sx={{ ...TYPE.body, color: COLORS.textSecondary }}>{viewingPolicy.summary}</Typography>
              </Box>
            )}
            <Typography
              component="pre"
              sx={{
                ...TYPE.body,
                color: COLORS.textPrimary,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: "'Inter', 'Roboto', sans-serif",
                lineHeight: 1.8,
              }}
            >
              {viewingPolicy?.bodyText || ''}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.border}` }}>
          <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, flexGrow: 1 }}>
            {viewingPolicy && `v${viewingPolicy.versionNumber} — Created ${formatConsentDate(viewingPolicy.createdAt)}`}
          </Typography>
          <Button
            onClick={() => setViewPolicyOpen(false)}
            sx={{ fontWeight: 900, color: COLORS.textSecondary, borderRadius: 0 }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog
        open={confirmDelete.open}
        onClose={() => setConfirmDelete({ open: false, type: '', id: '', name: '' })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 900, color: COLORS.danger, pb: 1 }}>
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