import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Paper, Button, FormControl, InputLabel, Select, MenuItem,
  Snackbar, Alert, InputAdornment, TextField, Switch, FormControlLabel,
  Divider, Stack, Chip, ListItemText, ToggleButton, ToggleButtonGroup,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  LinearProgress, CircularProgress, Tooltip, Tabs, Tab, Slider,
  TableContainer, Table, TableHead, TableBody, TableRow, TableCell,
} from '@mui/material';
import Grid from '@mui/material/Grid'; // MUI v6 Standard

import { doc, setDoc, Timestamp, collection, onSnapshot, addDoc, deleteDoc, getDocs, getDoc, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Icons
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import SaveIcon from '@mui/icons-material/Save';
import DomainIcon from '@mui/icons-material/Domain';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CircleIcon from '@mui/icons-material/Circle';
import BlockIcon from '@mui/icons-material/Block';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import FlagIcon from '@mui/icons-material/Flag';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import QRCode from 'react-qr-code';
import GavelIcon from '@mui/icons-material/Gavel';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PublishIcon from '@mui/icons-material/Publish';
import RefreshIcon from '@mui/icons-material/Refresh';
import GroupIcon from '@mui/icons-material/Group';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { FAQ_CATEGORIES } from '../utils/faqConstants';
import {
  DEFAULT_TEMPLATES, TEMPLATE_GROUPS, STATUS_LABELS,
  STATUS_CHIP_COLORS, PLACEHOLDER_REFERENCE,
} from '../utils/notificationTemplateConstants';
import { invalidateTemplateCache, invalidateChannelSettingsCache } from '../utils/sendPushNotification';
import { testLlmConnection, DEFAULT_CLINICAL_SYSTEM_PROMPT, DEFAULT_CALENDAR_AI_PROMPT } from '../utils/llmService';
import { useConsentPolicy } from '../hooks/useConsentPolicy';
import { CONSENT_TYPES } from '../utils/consentConstants';

// Design Tokens
import { FONT, TYPE, COLORS } from '../theme/designTokens';
import { useUser } from '../context/UserContext';
import MedicinePillSwitch from '../components/MedicinePillSwitch';
import LocationPicker from '../components/LocationPicker';

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
  const { profile } = useUser();
  const [loading, setLoading] = useState(false);
  const[toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [activeTab, setActiveTab] = useState(0);

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
    clinicName: '',
    clinicAddress: '',
    openHour: 8, closeHour: 17,
    lunchEnabled: true, lunchStart: 12, lunchEnd: 13,
    minSlotInterval: 30, maxFutureBookingDays: 30,
    clinicPhone: '',
    clinicEmail: '',
    clinicTIN: '',
    baiRegistrationNumber: '',
    workingDays: [1, 2, 3, 4, 5, 6, 0], // [0:Sun, 1:Mon... 6:Sat]
    clinicLat: 16.0389, clinicLng: 120.3977, geofenceRadiusM: 150,
  });

  // --- DYNAMIC STATES ---
  const [departments, setDepartments] = useState([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newDepartmentColor, setNewDepartmentColor] = useState('#1565C0'); // Valid default
  const [deptSearch, setDeptSearch] = useState('');
  const [deptSort, setDeptSort] = useState({ key: 'name', dir: 'asc' });
  const [isAddDeptModalOpen, setIsAddDeptModalOpen] = useState(false);

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

  // --- PILLAR 11B: CALENDAR AI ASSISTANT STATE ---
  const [calendarAIPrompt, setCalendarAIPrompt] = useState('');
  const [calendarAISaving, setCalendarAISaving] = useState(false);

  // --- PILLAR 12: FAQ MANAGEMENT STATE ---
  const [faqList, setFaqList] = useState([]);
  const [faqDialogOpen, setFaqDialogOpen] = useState(false);
  const [faqForm, setFaqForm] = useState({
    question: '', answer: '', category: 'General', isActive: true,
  });
  const [editingFaqId, setEditingFaqId] = useState(null); // null = creating, string = editing
  const [faqDeleteConfirm, setFaqDeleteConfirm] = useState({ open: false, id: '', question: '' });
  const [faqActiveTab, setFaqActiveTab] = useState('All');
  const [faqSearchQuery, setFaqSearchQuery] = useState('');
  const [faqSaving, setFaqSaving] = useState(false);

  // --- PILLAR 13: NOTIFICATION TEMPLATES STATE ---
  const [notifTemplates, setNotifTemplates] = useState({}); // { [statusKey]: { title, body, isCustom } }
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifResetConfirm, setNotifResetConfirm] = useState({ open: false, key: null }); // key = null => reset all
  const [expandedGroups, setExpandedGroups] = useState({});
  const toggleGroup = (label) => setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }));

  // AI & Chatbot tab — Advanced settings collapse state
  const [advancedClinicalOpen, setAdvancedClinicalOpen] = useState(false);
  const [advancedCalendarOpen, setAdvancedCalendarOpen] = useState(false);

  useEffect(() => {
    // 1. Fetch Global Settings
    const onErr = (err) => console.warn('[Settings] Listener error:', err.message);
    const unsubSettings = onSnapshot(doc(db, "clinic_settings", "general"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (!isDirtyRef.current) {
          setSettings(prev => ({ ...prev, ...data }));
        }
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
          maxFutureBookingDays: parseInt(data.maxFutureBookingDays) || 30,
        } : prev);
      }
    }, onErr);

    // 2. Fetch Dynamic Departments
    const unsubDepts = onSnapshot(collection(db, "departments"), (snapshot) => {
      const depts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setDepartments(depts);
    }, onErr);

    // 3. One-shot fetch for department usage counts (services + staff) —
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
    }, onErr);

    // 6b. Fetch Calendar AI system prompt (Pillar 11B)
    getDoc(doc(db, 'system_prompts', 'calendar_assistant')).then((calSnap) => {
      if (calSnap.exists()) {
        setCalendarAIPrompt(calSnap.data().prompt || '');
      }
    }).catch((err) => {
      console.error('[Settings] Failed to fetch calendar AI prompt:', err.message);
    });

    // 7. Fetch FAQs (Pillar 12)
    const unsubFaqs = onSnapshot(collection(db, 'faqs'), (snapshot) => {
      const entries = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
      setFaqList(entries);
    }, onErr);

    // 8. Fetch Notification Templates (Pillar 13)
    const unsubNotifTemplates = onSnapshot(collection(db, 'notification_templates'), (snapshot) => {
      const custom = {};
      snapshot.docs.forEach((d) => {
        custom[d.id] = { title: d.data().title || '', body: d.data().body || '' };
      });
      // Merge: start from defaults, overlay any Firestore overrides
      const merged = {};
      Object.keys(DEFAULT_TEMPLATES).forEach((key) => {
        merged[key] = custom[key]
          ? { title: custom[key].title, body: custom[key].body, isCustom: true }
          : { title: DEFAULT_TEMPLATES[key].title, body: DEFAULT_TEMPLATES[key].body, isCustom: false };
      });
      setNotifTemplates(merged);
    }, onErr);

    return () => { unsubSettings(); unsubDepts(); unsubLlm(); unsubFaqs(); unsubNotifTemplates(); };
  },[]);

  // --- NAVIGATION GUARD: Warn on unsaved changes to form fields ---
  const hasUnsavedChanges = React.useMemo(() => {
    if (!lastSavedSettings) return false;
    const tracked = ['openHour', 'closeHour', 'lunchEnabled', 'lunchStart', 'lunchEnd',
      'minSlotInterval', 'maxFutureBookingDays',
      'workingDays', 'clinicPhone', 'baiRegistrationNumber', 'dashboardAlerts', 'dashboardGoals',
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

  const isDirtyRef = React.useRef(false);
  const handleChange = (field, value) => { isDirtyRef.current = true; setSettings(prev => ({ ...prev, [field]: value })); };

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
    const futureDays = parseInt(settings.maxFutureBookingDays);
    if (!futureDays || futureDays < 1) {
      return "Future Booking Limit must be at least 1 day.";
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
        maxFutureBookingDays: parseInt(settings.maxFutureBookingDays) || 30,
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
        const tracked = ['clinicName', 'clinicAddress', 'openHour', 'closeHour', 'lunchEnabled', 'lunchStart', 'lunchEnd',
          'minSlotInterval', 'maxFutureBookingDays',
          'workingDays', 'clinicPhone', 'clinicEmail', 'clinicTIN', 'baiRegistrationNumber', 'dashboardAlerts', 'dashboardGoals',
          'clinicLat', 'clinicLng', 'geofenceRadiusM', 'enableAppointmentReminders',
          'enableVaccineReminders', 'vaccineReminderWindowDays', 'vaccineReminderCooldownDays',
          'enableAutoAppointmentReminders', 'appointmentReminderHeadsUpDays'];
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

      isDirtyRef.current = false;
      setLastSavedSettings({ ...sanitizedSettings });
      setToast({ open: true, message: 'Global Clinic Settings Updated Successfully!', severity: 'success' });
    } catch (error) { setToast({ open: true, message: error.message, severity: 'error' }); } 
    finally { setLoading(false); }
  };

  const handleDeptSort = (key) => {
    setDeptSort(prev => {
        if (prev.key === key) {
            return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
        }
        return { key, dir: 'asc' };
    });
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
        setIsAddDeptModalOpen(false);
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

  // --- CONFIRM DELETE HANDLER (departments only — categories moved to InventoryCategoryManager) ---
  const handleConfirmDelete = async () => {
    const { type, id, name } = confirmDelete;
    setConfirmDelete({ open: false, type: '', id: '', name: '' });
    try {
      if (type === 'department') {
        await deleteDoc(doc(db, "departments", id));
        await logSettingsEvent('DELETE', 'department', name);
        await refreshUsageCounts();
        setToast({ open: true, message: 'Department Deleted.', severity: 'success' });
      }
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
      // Single-field Firestore query — combining `!=` with `==` on different
      // fields requires a composite index AND excludes docs where the field
      // is missing. Filter `accountStatus !== 'erased'` in memory instead,
      // matching the pattern used in usePatientManager.js.
      const usersRef = collection(db, 'users');
      const petOwnersQuery = query(usersRef, where('role', '==', 'pet_owner'));
      const snapshot = await getDocs(petOwnersQuery);

      let total = 0;
      let consented = 0;

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.accountStatus === 'erased') return; // skip soft-deleted accounts
        total += 1;
        if (data.consentVersion != null && Number(data.consentVersion) >= Number(consentActiveVersion)) {
          consented += 1;
        }
      });

      setReconsentProgress({ consented, total, loading: false, queried: true });
    } catch (err) {
      console.error('[Settings.handleRefreshReconsentProgress]:', err.message);
      setToast({ open: true, message: 'Failed to load client acceptance progress.', severity: 'error' });
      setReconsentProgress((prev) => ({ ...prev, loading: false, queried: true }));
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

  // --- PILLAR 11B: CALENDAR AI ASSISTANT HANDLER ---

  /**
   * Saves the Calendar AI system prompt to system_prompts/calendar_assistant.
   * Falls back to DEFAULT_CALENDAR_AI_PROMPT when the field is empty (reset).
   */
  const handleSaveCalendarAIConfig = async () => {
    setCalendarAISaving(true);
    try {
      const effectivePrompt = calendarAIPrompt.trim() || DEFAULT_CALENDAR_AI_PROMPT;
      await setDoc(doc(db, 'system_prompts', 'calendar_assistant'), {
        prompt:    effectivePrompt,
        updatedAt: Timestamp.now(),
        updatedBy: profile?.fullName || profile?.email || 'Unknown Admin',
      });
      await logSettingsEvent('UPDATE', 'system_prompts', 'calendar_assistant', {});
      setToast({ open: true, message: 'Calendar AI prompt saved.', severity: 'success' });
    } catch (err) {
      console.error('[Settings.handleSaveCalendarAIConfig]:', err.message);
      setToast({ open: true, message: `Failed to save: ${err.message}`, severity: 'error' });
    } finally {
      setCalendarAISaving(false);
    }
  };

  // --- PILLAR 12: FAQ MANAGEMENT HANDLERS ---

  const handleOpenFaqDialog = (faq = null) => {
    if (faq) {
      setEditingFaqId(faq.id);
      setFaqForm({
        question: faq.question || '',
        answer: faq.answer || '',
        category: faq.category || 'General',
        isActive: faq.isActive ?? true,
      });
    } else {
      setEditingFaqId(null);
      setFaqForm({ question: '', answer: '', category: 'General', isActive: true });
    }
    setFaqDialogOpen(true);
  };

  const handleSaveFaq = async () => {
    if (!faqForm.question.trim()) {
      return setToast({ open: true, message: 'Question is required.', severity: 'warning' });
    }
    if (!faqForm.answer.trim()) {
      return setToast({ open: true, message: 'Answer is required.', severity: 'warning' });
    }
    setFaqSaving(true);
    try {
      const who = profile?.fullName || profile?.email || 'Unknown Admin';
      if (editingFaqId) {
        await setDoc(doc(db, 'faqs', editingFaqId), {
          question:  faqForm.question.trim(),
          answer:    faqForm.answer.trim(),
          category:  faqForm.category,
          isActive:  faqForm.isActive,
          updatedAt: Timestamp.now(),
          updatedBy: who,
        }, { merge: true });
        await logSettingsEvent('UPDATE', 'faq', faqForm.question.trim().slice(0, 50), {});
        setToast({ open: true, message: 'FAQ updated.', severity: 'success' });
      } else {
        const sortOrder = faqList.filter((f) => f.category === faqForm.category).length;
        await addDoc(collection(db, 'faqs'), {
          question:  faqForm.question.trim(),
          answer:    faqForm.answer.trim(),
          category:  faqForm.category,
          isActive:  faqForm.isActive,
          sortOrder,
          createdAt: Timestamp.now(),
          createdBy: who,
          updatedAt: Timestamp.now(),
          updatedBy: who,
        });
        await logSettingsEvent('CREATE', 'faq', faqForm.question.trim().slice(0, 50), {});
        setToast({ open: true, message: 'FAQ created.', severity: 'success' });
      }
      setFaqDialogOpen(false);
    } catch (e) {
      console.error('[Settings.handleSaveFaq]:', e.message);
      setToast({ open: true, message: e.message, severity: 'error' });
    } finally {
      setFaqSaving(false);
    }
  };

  const handleDeleteFaq = async () => {
    try {
      await deleteDoc(doc(db, 'faqs', faqDeleteConfirm.id));
      await logSettingsEvent('DELETE', 'faq', faqDeleteConfirm.question.slice(0, 50), {});
      setFaqDeleteConfirm({ open: false, id: '', question: '' });
      setToast({ open: true, message: 'FAQ deleted.', severity: 'success' });
    } catch (e) {
      console.error('[Settings.handleDeleteFaq]:', e.message);
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  const handleToggleFaqActive = async (faq) => {
    try {
      const who = profile?.fullName || profile?.email || 'Unknown Admin';
      await setDoc(doc(db, 'faqs', faq.id), {
        isActive:  !faq.isActive,
        updatedAt: Timestamp.now(),
        updatedBy: who,
      }, { merge: true });
    } catch (e) {
      console.error('[Settings.handleToggleFaqActive]:', e.message);
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  // --- PILLAR 13: NOTIFICATION TEMPLATES HANDLERS ---

  const handleNotifTemplateChange = (statusKey, field, value) => {
    setNotifTemplates((prev) => {
      const updated = { ...prev[statusKey], [field]: value };
      const def = DEFAULT_TEMPLATES[statusKey];
      const isCustom = updated.title !== def.title || updated.body !== def.body;
      return { ...prev, [statusKey]: { ...updated, isCustom } };
    });
  };

  const handleSaveNotifTemplates = async () => {
    setNotifSaving(true);
    try {
      const who = profile?.fullName || profile?.email || 'Unknown Admin';
      const ops = [];
      let customCount = 0;

      Object.keys(DEFAULT_TEMPLATES).forEach((key) => {
        const current = notifTemplates[key];
        const def = DEFAULT_TEMPLATES[key];
        const isDefault = current.title === def.title && current.body === def.body;

        if (isDefault) {
          // Matches default — delete any Firestore override to keep the collection lean
          ops.push(deleteDoc(doc(db, 'notification_templates', key)).catch(() => {}));
        } else {
          customCount += 1;
          ops.push(
            setDoc(doc(db, 'notification_templates', key), {
              title:     current.title,
              body:      current.body,
              updatedAt: Timestamp.now(),
              updatedBy: who,
            })
          );
        }
      });

      await Promise.all(ops);
      invalidateTemplateCache();
      invalidateChannelSettingsCache();
      await logSettingsEvent('UPDATE', 'notification_templates', 'bulk_save', { customCount });
      setToast({ open: true, message: 'Notification templates saved.', severity: 'success' });
    } catch (e) {
      console.error('[Settings.handleSaveNotifTemplates]:', e.message);
      setToast({ open: true, message: e.message, severity: 'error' });
    } finally {
      setNotifSaving(false);
    }
  };

  const handleResetNotifTemplate = (statusKey) => {
    const def = DEFAULT_TEMPLATES[statusKey];
    if (!def) return;
    setNotifTemplates((prev) => ({
      ...prev,
      [statusKey]: { title: def.title, body: def.body, isCustom: false },
    }));
    setNotifResetConfirm({ open: false, key: null });
    setToast({ open: true, message: `"${STATUS_LABELS[statusKey]}" reset to default. Save to apply.`, severity: 'info' });
  };

  const handleResetAllNotifTemplates = () => {
    const reset = {};
    Object.keys(DEFAULT_TEMPLATES).forEach((key) => {
      reset[key] = { title: DEFAULT_TEMPLATES[key].title, body: DEFAULT_TEMPLATES[key].body, isCustom: false };
    });
    setNotifTemplates(reset);
    setNotifResetConfirm({ open: false, key: null });
    setToast({ open: true, message: 'All templates reset to defaults. Save to apply.', severity: 'info' });
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
            <div class="clinic-name">Your Clinic Name</div>
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
          ...forensicHeaderStyle, p: 2.5, display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', alignItems: 'center'
        }}>
          <Typography variant="h4" sx={{ fontWeight: 1000, color: COLORS.brand, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '1.5rem' }}>
            Settings
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

      {/* TAB NAV — T4.157 */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          borderBottom: `2px solid ${COLORS.accent}`,
          mb: 3,
          '& .MuiTab-root': {
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: 1,
            minHeight: 48,
          },
          '& .Mui-selected': { color: COLORS.sky },
          '& .MuiTabs-indicator': { backgroundColor: COLORS.sky, height: 3 },
        }}
      >
        <Tab label="Clinic" />
        <Tab label="Notifications" />
        <Tab label="AI & Chatbot" />
        <Tab label="Compliance" />
        <Tab label="Departments" />
      </Tabs>

      {/* TAB 0 — CLINIC */}
      {activeTab === 0 && (
      <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden' }}>

        {/* ── SECTION 1: CLINIC IDENTITY ──────────────────────────── */}
        <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
          <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
            <DomainIcon /> Clinic Identity
          </Typography>
          <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mt: 0.5 }}>
            Basic clinic details shown to pet owners and printed on official documents.
          </Typography>
        </Box>
        <Box sx={{ p: 3, bgcolor: COLORS.cardBg }}>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth size="medium"
                    label="Clinic Official Name"
                    placeholder="e.g. My Veterinary Clinic"
                    value={settings.clinicName || ''}
                    onChange={(e) => handleChange('clinicName', e.target.value)}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0, '& fieldset': { border: `2px solid ${COLORS.accent}33` } } }}
                    helperText="Used on all receipts and reports."
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth size="medium"
                    label="Clinic Physical Address"
                    placeholder="Street, Barangay, City, Province"
                    value={settings.clinicAddress || ''}
                    onChange={(e) => handleChange('clinicAddress', e.target.value)}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0, '& fieldset': { border: `2px solid ${COLORS.accent}33` } } }}
                    helperText="Displayed in the mobile app and document headers."
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth size="medium"
                    label="Clinic Phone Number"
                    placeholder="e.g. 09171234567"
                    value={settings.clinicPhone || ''}
                    onChange={(e) => handleChange('clinicPhone', e.target.value)}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0, '& fieldset': { border: `2px solid ${COLORS.accent}33` } } }}
                    helperText="Shown to clients in the mobile app."
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth size="medium"
                    label="Clinic Official Email"
                    placeholder="e.g. contact@myclinic.com"
                    value={settings.clinicEmail || ''}
                    onChange={(e) => handleChange('clinicEmail', e.target.value)}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0, '& fieldset': { border: `2px solid ${COLORS.accent}33` } } }}
                    helperText="Used for official records and headers."
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth size="medium"
                    label="Clinic TIN"
                    placeholder="Tax Identification Number"
                    value={settings.clinicTIN || ''}
                    onChange={(e) => handleChange('clinicTIN', e.target.value)}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0, '& fieldset': { border: `2px solid ${COLORS.accent}33` } } }}
                    helperText="Printed on official receipts for transparency."
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth size="medium"
                    label="BAI Reg. #"
                    placeholder="BAI clinic registration"
                    value={settings.baiRegistrationNumber || ''}
                    onChange={(e) => handleChange('baiRegistrationNumber', e.target.value)}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0, '& fieldset': { border: `2px solid ${COLORS.accent}33` } } }}
                    helperText="Printed on vaccination records."
                  />
                </Grid>

                <Grid size={{ xs: 12 }}>
                  <Typography variant="overline" sx={{ fontWeight: 900, color: COLORS.accent, letterSpacing: 1, display: 'block', mb: 1 }}>
                    Clinic Working Days
                  </Typography>
                  <ToggleButtonGroup
                    value={settings.workingDays || []}
                    onChange={(e, val) => { if (val.length === 0) return; handleChange('workingDays', val); }}
                    size="small"
                    sx={{
                      gap: 0.5,
                      '& .MuiToggleButton-root': {
                        border: `2px solid ${COLORS.accent}33 !important`,
                        borderRadius: '0 !important',
                        width: 36, height: 36, minWidth: 36,
                        fontWeight: 900, fontSize: '0.7rem', color: COLORS.accent,
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
              </Grid>
            </Box>

        {/* ── SECTION 2: OPERATING SCHEDULE ──────────────────────────── */}
        <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderTop: `2px solid ${COLORS.accent}`, borderBottom: `2px solid ${COLORS.accent}` }}>
          <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
            <AccessTimeIcon /> Operating Schedule
          </Typography>
          <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mt: 0.5 }}>
            Daily hours and break times. Controls the mobile booking calendar boundaries.
          </Typography>
        </Box>
        <Box sx={{ p: 3, bgcolor: COLORS.cardBg }}>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, md: 6 }}>
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
                <Grid size={{ xs: 12, md: 6 }}>
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

                <Grid size={{ xs: 12 }}>
                  <Divider sx={{ my: 0.5, borderColor: COLORS.border }} />
                  <FormControlLabel
                    control={<Switch checked={settings.lunchEnabled} onChange={(e) => handleChange('lunchEnabled', e.target.checked)} color="primary" />}
                    label={<Typography sx={{ fontWeight: 900, color: COLORS.accent }}>Enforce Lunch Break</Typography>}
                  />
                </Grid>
                {settings.lunchEnabled && (
                  <React.Fragment>
                    <Grid size={{ xs: 6, md: 6 }}>
                      <FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}>
                        <InputLabel sx={{ fontWeight: 900 }}>Start</InputLabel>
                        <Select value={settings.lunchStart} label="Start" onChange={(e) => handleChange('lunchStart', e.target.value)} sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}>
                          {hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid size={{ xs: 6, md: 6 }}>
                      <FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}>
                        <InputLabel sx={{ fontWeight: 900 }}>End</InputLabel>
                        <Select value={settings.lunchEnd} label="End" onChange={(e) => handleChange('lunchEnd', e.target.value)} sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}>
                          {hoursArray.map(h => <MenuItem key={h} value={h}>{formatHour(h)}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                  </React.Fragment>
                )}
              </Grid>
            </Box>

        {/* ── SECTION 3: BOOKING RULES ──────────────────────────── */}
        <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderTop: `2px solid ${COLORS.accent}`, borderBottom: `2px solid ${COLORS.accent}` }}>
          <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
            <EventBusyIcon /> Booking Rules
          </Typography>
          <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mt: 0.5 }}>
            Sets appointment slot spacing and how far ahead pet owners can book.
          </Typography>
        </Box>
        <Box sx={{ p: 3, bgcolor: COLORS.cardBg }}>
              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth size="medium" sx={{ bgcolor: 'white' }}>
                    <InputLabel sx={{ fontWeight: 900 }}>Base Slot Interval</InputLabel>
                    <Select value={settings.minSlotInterval} label="Base Slot Interval" onChange={(e) => handleChange('minSlotInterval', e.target.value)} sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `2px solid ${COLORS.accent}33` }, fontWeight: 900 }}>
                      <MenuItem value={15}>15 Minutes</MenuItem>
                      <MenuItem value={30}>30 Minutes</MenuItem>
                      <MenuItem value={45}>45 Minutes</MenuItem>
                      <MenuItem value={60}>60 Minutes</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth label="Future Limit" type="number"
                    value={settings.maxFutureBookingDays}
                    onChange={(e) => handleChange('maxFutureBookingDays', e.target.value)}
                    InputProps={{ endAdornment: <InputAdornment position="end">Days</InputAdornment> }}
                    sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                    inputProps={{ style: { fontWeight: 900 } }}
                    helperText="How far ahead pet owners can book appointments."
                  />
                </Grid>
              </Grid>
            </Box>

        {/* ── SECTION 4: CLINIC CLOSURES ──────────────────────────── */}
        <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderTop: `2px solid ${COLORS.accent}`, borderBottom: `2px solid ${COLORS.accent}` }}>
          <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
            <BlockIcon /> Clinic Closures
          </Typography>
          <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mt: 0.5 }}>
            Holidays, maintenance, or any specific dates the clinic is closed. Blocks mobile booking and skips queue carry-over targets.
          </Typography>
        </Box>
        <Box sx={{ p: 3, bgcolor: COLORS.cardBg }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5, alignItems: { xs: 'stretch', sm: 'center' } }}>
                <TextField
                  type="date"
                  size="medium"
                  value={newClosedDate}
                  onChange={(e) => setNewClosedDate(e.target.value)}
                  sx={{ flex: 1, maxWidth: { sm: 320 }, bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `2px solid ${COLORS.accent}33` } }}
                  inputProps={{ style: { fontWeight: 900 } }}
                />
                <Button
                  variant="contained"
                  onClick={handleAddClosedDate}
                  disabled={!newClosedDate}
                  startIcon={<AddCircleOutlineIcon />}
                  sx={{
                    borderRadius: 0, fontWeight: 900, px: 4, py: 1,
                    bgcolor: COLORS.accent, border: `2px solid ${COLORS.accent}`,
                    boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
                    '&:hover': { bgcolor: COLORS.brand }
                  }}
                >
                  Add Closure
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
            </Box>

      </Paper>
      )} {/* end Tab 0 — Clinic */}

      {/* TAB 4 — DEPARTMENTS */}
      {activeTab === 4 && (
      <Grid container spacing={4}>
        <Grid size={{ xs: 12 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden' }}>
            <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                  <DomainIcon /> Clinic Departments / Categories
                </Typography>
              </Box>
              <Button
                variant="contained"
                onClick={() => setIsAddDeptModalOpen(true)}
                startIcon={<AddCircleOutlineIcon />}
                sx={{
                  bgcolor: COLORS.accent, fontWeight: 900, px: 3, py: 1, borderRadius: 0,
                  border: `2px solid ${COLORS.brand}`,
                  boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
                  '&:hover': { bgcolor: COLORS.brand }
                }}
              >
                Add Department
              </Button>
            </Box>

            {/* Add Department Modal */}
            <Dialog 
              open={isAddDeptModalOpen} 
              onClose={() => setIsAddDeptModalOpen(false)}
              maxWidth="xs"
              fullWidth
              PaperProps={{ sx: { borderRadius: 0, border: `4px solid ${COLORS.accent}`, boxShadow: '8px 8px 0px rgba(0,0,0,0.1)' } }}
            >
              <Box sx={{ bgcolor: COLORS.cream, p: 2, borderBottom: `2px solid ${COLORS.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography sx={{ fontWeight: 900, color: COLORS.accent, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AddCircleOutlineIcon /> NEW DEPARTMENT
                </Typography>
                <IconButton size="small" onClick={() => setIsAddDeptModalOpen(false)} sx={{ color: COLORS.accent }}>
                  <CloseIcon />
                </IconButton>
              </Box>
              <DialogContent sx={{ p: 3, pt: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <TextField
                  label="Department Name" fullWidth autoFocus
                  value={newDepartmentName}
                  onChange={(e) => setNewDepartmentName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddDepartment()}
                  sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` } }}
                  inputProps={{ spellCheck: 'false', style: { fontWeight: 900 } }}
                />

                <FormControl fullWidth>
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
                    {COLOR_PALETTE.map(c => (
                      <MenuItem key={c.value} value={c.value}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <CircleIcon sx={{ color: c.value }} /> <ListItemText primary={c.label} />
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </DialogContent>
              <DialogActions sx={{ p: 3, pt: 1 }}>
                <Button onClick={() => setIsAddDeptModalOpen(false)} sx={{ fontWeight: 900, color: COLORS.textMuted }}>CANCEL</Button>
                <Button 
                  variant="contained" onClick={handleAddDepartment}
                  sx={{ bgcolor: COLORS.accent, fontWeight: 900, borderRadius: 0, px: 4, '&:hover': { bgcolor: COLORS.brand } }}
                >
                  CREATE DEPARTMENT
                </Button>
              </DialogActions>
            </Dialog>

            <Box sx={{ p: 3, bgcolor: COLORS.cardBg }}>

              <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                <TextField
                  placeholder="🔍 Quick find department..." size="small" fullWidth
                  value={deptSearch} onChange={(e) => setDeptSearch(e.target.value)}
                  sx={{ bgcolor: 'rgba(255,255,255,0.9)', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, borderColor: COLORS.borderInput } }}
                  inputProps={{ style: { fontWeight: 900 } }}
                />
                <Stack direction="row" spacing={1} sx={{ bgcolor: COLORS.cream, p: 0.5, border: `1px solid ${COLORS.accent}22` }}>
                  <Button
                    size="small"
                    variant={deptSort.key === 'name' ? 'contained' : 'text'}
                    onClick={() => handleDeptSort('name')}
                    startIcon={deptSort.key === 'name' ? (deptSort.dir === 'asc' ? <ArrowUpwardIcon sx={{ fontSize: '14px !important' }} /> : <ArrowDownwardIcon sx={{ fontSize: '14px !important' }} />) : null}
                    sx={{
                      borderRadius: 0, fontWeight: 900, fontSize: '0.7rem', letterSpacing: 1, px: 2,
                      bgcolor: deptSort.key === 'name' ? COLORS.accent : 'transparent',
                      color: deptSort.key === 'name' ? 'white' : COLORS.textMuted,
                      '&:hover': { bgcolor: deptSort.key === 'name' ? COLORS.brand : 'rgba(0,0,0,0.05)' }
                    }}
                  >
                    Name
                  </Button>
                  <Button
                    size="small"
                    variant={deptSort.key === 'staff' ? 'contained' : 'text'}
                    onClick={() => handleDeptSort('staff')}
                    startIcon={deptSort.key === 'staff' ? (deptSort.dir === 'asc' ? <ArrowUpwardIcon sx={{ fontSize: '14px !important' }} /> : <ArrowDownwardIcon sx={{ fontSize: '14px !important' }} />) : null}
                    sx={{
                      borderRadius: 0, fontWeight: 900, fontSize: '0.7rem', letterSpacing: 1, px: 2,
                      bgcolor: deptSort.key === 'staff' ? COLORS.accent : 'transparent',
                      color: deptSort.key === 'staff' ? 'white' : COLORS.textMuted,
                      '&:hover': { bgcolor: deptSort.key === 'staff' ? COLORS.brand : 'rgba(0,0,0,0.05)' }
                    }}
                  >
                    Staff
                  </Button>
                  <Button
                    size="small"
                    variant={deptSort.key === 'services' ? 'contained' : 'text'}
                    onClick={() => handleDeptSort('services')}
                    startIcon={deptSort.key === 'services' ? (deptSort.dir === 'asc' ? <ArrowUpwardIcon sx={{ fontSize: '14px !important' }} /> : <ArrowDownwardIcon sx={{ fontSize: '14px !important' }} />) : null}
                    sx={{
                      borderRadius: 0, fontWeight: 900, fontSize: '0.7rem', letterSpacing: 1, px: 2,
                      bgcolor: deptSort.key === 'services' ? COLORS.accent : 'transparent',
                      color: deptSort.key === 'services' ? 'white' : COLORS.textMuted,
                      '&:hover': { bgcolor: deptSort.key === 'services' ? COLORS.brand : 'rgba(0,0,0,0.05)' }
                    }}
                  >
                    Services
                  </Button>
                </Stack>
              </Box>

              <TableContainer sx={{ maxHeight: 400, border: `1px solid ${COLORS.accent}22` }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ bgcolor: COLORS.cream, fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', color: COLORS.accent, borderBottom: `2px solid ${COLORS.accent}`, width: 60 }}>Color</TableCell>
                      <TableCell sx={{ bgcolor: COLORS.cream, fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', color: COLORS.accent, borderBottom: `2px solid ${COLORS.accent}` }}>Department Name</TableCell>
                      <TableCell align="center" sx={{ bgcolor: COLORS.cream, fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', color: COLORS.accent, borderBottom: `2px solid ${COLORS.accent}` }}>Staff</TableCell>
                      <TableCell align="center" sx={{ bgcolor: COLORS.cream, fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', color: COLORS.accent, borderBottom: `2px solid ${COLORS.accent}` }}>Services</TableCell>
                      <TableCell align="right" sx={{ bgcolor: COLORS.cream, fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', color: COLORS.accent, borderBottom: `2px solid ${COLORS.accent}`, width: 100 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...departments]
                      .sort((a, b) => {
                        const dir = deptSort.dir === 'asc' ? 1 : -1;
                        if (deptSort.key === 'name') {
                          return dir * a.name.localeCompare(b.name);
                        } else if (deptSort.key === 'staff') {
                          const staffA = allStaff.filter(u => u.role === 'staff' && (Array.isArray(u.departments) ? u.departments.includes(a.name) : u.department === a.name)).length;
                          const staffB = allStaff.filter(u => u.role === 'staff' && (Array.isArray(u.departments) ? u.departments.includes(b.name) : u.department === b.name)).length;
                          return dir * (staffA - staffB);
                        } else {
                          // Sort by services
                          const serviceA = allServices.filter(s => !s.isArchived && (s.department || s.category) === a.name).length;
                          const serviceB = allServices.filter(s => !s.isArchived && (s.department || s.category) === b.name).length;
                          return dir * (serviceA - serviceB);
                        }
                      })
                      .filter(d => d.name.toLowerCase().includes(deptSearch.toLowerCase()))
                      .map(dept => {
                        const staffU = allStaff.filter(u => u.role === 'staff' && (Array.isArray(u.departments) ? u.departments.includes(dept.name) : u.department === dept.name)).length;
                        const serviceU = allServices.filter(s => !s.isArchived && (s.department || s.category) === dept.name).length;
                        const totalU = staffU + serviceU;

                        return (
                          <TableRow key={dept.id} hover sx={{ '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' } }}>
                            <TableCell>
                              <CircleIcon sx={{ color: dept.color || '#616161', fontSize: 20 }} />
                            </TableCell>
                            <TableCell sx={{ fontWeight: 900, color: COLORS.textPrimary }}>
                              {dept.name}
                            </TableCell>
                            <TableCell align="center" sx={{ fontWeight: 700, color: staffU > 0 ? COLORS.accent : COLORS.textMuted }}>
                              {staffU}
                            </TableCell>
                            <TableCell align="center" sx={{ fontWeight: 700, color: serviceU > 0 ? COLORS.accent : COLORS.textMuted }}>
                              {serviceU}
                            </TableCell>
                            <TableCell align="right">
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteDepartment(dept.id, dept.name)}
                                sx={{ color: totalU > 0 ? COLORS.textMuted : COLORS.danger }}
                                title={totalU > 0 ? `In use by ${totalU} entities` : 'Delete Department'}
                              >
                                <DeleteIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    {departments.filter(d => d.name.toLowerCase().includes(deptSearch.toLowerCase())).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 4, fontStyle: 'italic', color: COLORS.textMuted }}>
                          No departments match your search.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Paper>
        </Grid>
      </Grid>
      )} {/* end Tab 5 — Departments */}



      {/* TAB 3 — COMPLIANCE */}
      {activeTab === 3 && (
      <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden' }}>

        {/* ── SECTION 1: SELF-CHECK-IN QR CODE ─────────────────────────── */}
        <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
          <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
            <QrCodeScannerIcon /> Self-Check-In QR Code
          </Typography>
          <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mt: 0.5 }}>
            Print this QR code and put it up in the lobby. Pet owners scan it with the app when they arrive to check themselves in.
          </Typography>
        </Box>
        <Box sx={{ p: 3, bgcolor: COLORS.cardBg }}>
          <Grid container spacing={3}>

            {/* LEFT: QR code + print */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                <Box ref={qrRef} sx={{ p: 3, border: `3px solid ${COLORS.accent}`, borderRadius: 0, bgcolor: 'white' }}>
                  <QRCode value="CLINIC-CHECKIN-starbarks-vetconnect-f6443" size={180} />
                </Box>
              </Box>
              <Button
                variant="contained" fullWidth
                onClick={handlePrintQR}
                sx={{
                  fontWeight: 900, borderRadius: 0, bgcolor: COLORS.accent,
                  border: `2px solid ${COLORS.brand}`,
                  boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
                  '&:hover': { bgcolor: COLORS.brand }
                }}
              >
                Print QR Poster
              </Button>
            </Grid>

            {/* RIGHT: Check-In Zone (map + slider) */}
            <Grid size={{ xs: 12, md: 7 }}>
              <Typography variant="overline" sx={{ fontWeight: 900, color: COLORS.accent, letterSpacing: 1, display: 'block', mb: 0.5 }}>
                Check-In Zone
              </Typography>
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 2, fontSize: '0.8rem' }}>
                Only allow self-check-in when the pet owner is physically near the clinic. Set the clinic's location, then how close they need to be.
              </Typography>

              <LocationPicker
                latitude={settings.clinicLat}
                longitude={settings.clinicLng}
                radius={settings.geofenceRadiusM}
                onChange={({ latitude, longitude }) => {
                  handleChange('clinicLat', latitude);
                  handleChange('clinicLng', longitude);
                }}
              />

              {/* Radius slider */}
              <Box sx={{ mt: 3 }}>
                <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }}>
                  <Typography variant="overline" sx={{ fontWeight: 900, color: COLORS.accent, letterSpacing: 1 }}>
                    Check-In Radius
                  </Typography>
                  <Typography sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.brand, fontSize: '1rem' }}>
                    {(settings.geofenceRadiusM || 500) >= 1000
                      ? `${(settings.geofenceRadiusM / 1000).toFixed(settings.geofenceRadiusM % 1000 === 0 ? 0 : 1)} km`
                      : `${settings.geofenceRadiusM || 500} m`}
                  </Typography>
                </Stack>
                <Box sx={{ px: 1.5 }}>
                  <Slider
                    value={Math.min(settings.geofenceRadiusM || 500, 1000)}
                    onChange={(_, value) => handleChange('geofenceRadiusM', value)}
                    step={null}
                    min={100}
                    max={1000}
                    marks={[
                      { value: 100, label: '100m' },
                      { value: 250, label: '250m' },
                      { value: 500, label: '500m' },
                      { value: 1000, label: '1km' },
                    ]}
                    sx={{
                      color: COLORS.brand,
                      '& .MuiSlider-thumb': {
                        borderRadius: 0,
                        bgcolor: '#FFF8E1',
                        border: `2px solid ${COLORS.brand}`,
                        width: 20,
                        height: 20,
                        '&:hover, &.Mui-focusVisible, &.Mui-active': {
                          boxShadow: `0 0 0 8px ${COLORS.brand}22`,
                        },
                      },
                      '& .MuiSlider-track': { bgcolor: COLORS.brand, border: 'none', height: 4 },
                      '& .MuiSlider-rail': { bgcolor: COLORS.borderLight, opacity: 1, height: 4 },
                      '& .MuiSlider-mark': { bgcolor: COLORS.accent, height: 8, width: 2 },
                      '& .MuiSlider-markActive': { bgcolor: COLORS.brand },
                      '& .MuiSlider-markLabel': {
                        fontFamily: FONT,
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        color: COLORS.textSecondary,
                      },
                      '& .MuiSlider-markLabelActive': { color: COLORS.brand },
                    }}
                  />
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Box>

        {/* ── SECTION 2: PRIVACY & CONSENT POLICIES ────────────────────── */}
        <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderTop: `2px solid ${COLORS.accent}`, borderBottom: `2px solid ${COLORS.accent}` }}>
          <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
            <GavelIcon /> Privacy & Consent Policies
          </Typography>
          <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mt: 0.5 }}>
            Versioned consent policies under Republic Act No. 10173 (Data Privacy Act of 2012). When you publish a new version, all pet owners must agree to it the next time they open the app.
          </Typography>
        </Box>
        <Box sx={{ p: 3, bgcolor: COLORS.cardBg }}>

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

              {/* RE-CONSENT PROGRESS COUNTER — now labeled "Client Acceptance" */}
              {consentActiveVersion !== null && (
                <Box sx={{ mb: 3, p: 2, border: `2px solid ${COLORS.border}`, bgcolor: COLORS.cardBg }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <GroupIcon sx={{ fontSize: 18, color: COLORS.accent }} />
                      <Typography sx={{ ...TYPE.label, color: COLORS.accent }}>
                        Client Acceptance — Version {consentActiveVersion}
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
                        {reconsentProgress.consented} of {reconsentProgress.total} pet owners have accepted
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
                          {reconsentProgress.total - reconsentProgress.consented} pet owner(s) haven't accepted the current version yet.
                        </Typography>
                      )}
                      {reconsentProgress.consented === reconsentProgress.total && (
                        <Typography sx={{ ...TYPE.meta, color: COLORS.success, mt: 1 }}>
                          All pet owners have accepted the current version.
                        </Typography>
                      )}
                    </>
                  ) : reconsentProgress.queried && reconsentProgress.total === 0 ? (
                    <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, fontStyle: 'italic' }}>
                      No pet owners on record yet.
                    </Typography>
                  ) : !reconsentProgress.queried && !reconsentProgress.loading ? (
                    <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, fontStyle: 'italic' }}>
                      Tap Refresh to see how many pet owners have accepted the current version.
                    </Typography>
                  ) : null}
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
                    Draft New Version
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
                            label={(v.status || 'draft').toUpperCase()}
                            size="small"
                            sx={getConsentStatusChipSx(v.status)}
                          />
                        </Box>

                        {/* Version number */}
                        <Typography sx={{ ...TYPE.bodyBold, color: COLORS.textPrimary }}>
                          v{v.versionNumber}
                        </Typography>

                        {/* Type — human label */}
                        <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, fontWeight: 700 }}>
                          {v.type === CONSENT_TYPES.DPA ? 'Privacy Policy' : 'Liability Waiver'}
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
      )} {/* end Tab 3 — Compliance */}

      {/* TAB 2 — AI & CHATBOT */}
      {activeTab === 2 && (
      <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden' }}>

        {/* ── SECTION 1: AI DIAGNOSIS HELPER ──────────────────────── */}
        <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
          <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
            <AutoFixHighIcon /> AI Diagnosis Helper
          </Typography>
          <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mt: 0.5 }}>
            Suggests possible diagnoses based on the pet's symptoms and vitals during a visit. The vet always makes the final call — this is just a second pair of eyes.
          </Typography>
        </Box>
        <Box sx={{ p: 3, bgcolor: COLORS.cardBg }}>

          {/* Enable toggle */}
          <Box sx={{ mb: 2 }}>
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
                  Enable AI Diagnosis Helper
                </Typography>
              }
            />
          </Box>

          <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, fontSize: '0.78rem', mb: 2.5 }}>
            Powered by Claude AI. Typical monthly cost: ₱30–₱150 for a small clinic.
          </Typography>

          {/* Advanced Settings — collapsible */}
          <Box
            onClick={() => setAdvancedClinicalOpen(o => !o)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 2,
              py: 1.5,
              bgcolor: advancedClinicalOpen ? COLORS.cream : 'white',
              border: `2px solid ${COLORS.accent}33`,
              cursor: 'pointer',
              userSelect: 'none',
              '&:hover': { bgcolor: COLORS.cream },
            }}
          >
            <Typography sx={{ ...TYPE.label, color: COLORS.accent, fontSize: '0.8rem' }}>
              Advanced Settings
            </Typography>
            <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, fontSize: '0.72rem' }}>
              For troubleshooting and customizing AI behavior
            </Typography>
            <Box sx={{ ml: 'auto', color: COLORS.textSecondary, display: 'flex', alignItems: 'center' }}>
              {advancedClinicalOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </Box>
          </Box>

          {advancedClinicalOpen && (
            <Box sx={{ border: `2px solid ${COLORS.accent}33`, borderTop: 'none', p: 2.5, bgcolor: COLORS.cardBg }}>

              {/* Worker URL + Test button */}
              <Box sx={{ mb: 1 }}>
                <TextField
                  fullWidth
                  label="AI Service Connection (Worker URL)"
                  placeholder="https://vetconnect-ai.your-name.workers.dev"
                  value={llmConfig.workerUrl}
                  onChange={(e) => {
                    setLlmConfig(prev => ({ ...prev, workerUrl: e.target.value }));
                    setLlmTestResult(null);
                  }}
                  helperText="The connection address for the AI service. Set during initial setup — staff usually don't need to change this."
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

              {/* AI Instructions */}
              <Box sx={{ mb: 1, mt: 3 }}>
                <Typography sx={{ ...TYPE.label, color: COLORS.accent, mb: 1 }}>
                  AI Instructions (Diagnosis)
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={8}
                  maxRows={16}
                  value={llmConfig.systemPrompt || DEFAULT_CLINICAL_SYSTEM_PROMPT}
                  onChange={(e) => setLlmConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                  helperText="The rules the AI follows when suggesting diagnoses. The default works well for most clinics — only edit if you understand prompt engineering."
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
                  Reset to Default Instructions
                </Button>
              </Box>

              {/* Billing guidance — simplified */}
              <Box sx={{ p: 2, bgcolor: COLORS.warningSurface, border: `2px solid ${COLORS.warning}` }}>
                <Typography sx={{ ...TYPE.label, color: COLORS.warning, mb: 0.5 }}>
                  Cost Estimate
                </Typography>
                <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary }}>
                  Typical monthly cost is ₱30 to ₱150 for a small clinic. Each diagnosis suggestion costs only a few centavos. You can set a billing cap with your AI provider to avoid surprises.
                </Typography>
              </Box>

            </Box>
          )}

          {/* Save button (always visible) */}
          <Box sx={{ mt: 3 }}>
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
              {llmSaving ? 'Saving...' : 'Save Diagnosis Helper Settings'}
            </Button>
          </Box>

        </Box>

        {/* ── SECTION 2: AI SCHEDULING HELPER ──────────────────────── */}
        <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderTop: `2px solid ${COLORS.accent}`, borderBottom: `2px solid ${COLORS.accent}` }}>
          <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
            <CalendarMonthIcon /> AI Scheduling Helper
          </Typography>
          <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mt: 0.5 }}>
            Helps you find open time slots, spot booking conflicts, and plan staff coverage from the Calendar page.
          </Typography>
        </Box>
        <Box sx={{ p: 3, bgcolor: COLORS.cardBg }}>

          <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, fontSize: '0.78rem', mb: 2.5 }}>
            Uses the same AI service as the diagnosis helper above. Enable that one to activate scheduling support.
          </Typography>

          {/* Advanced Settings — collapsible */}
          <Box
            onClick={() => setAdvancedCalendarOpen(o => !o)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 2,
              py: 1.5,
              bgcolor: advancedCalendarOpen ? COLORS.cream : 'white',
              border: `2px solid ${COLORS.accent}33`,
              cursor: 'pointer',
              userSelect: 'none',
              '&:hover': { bgcolor: COLORS.cream },
            }}
          >
            <Typography sx={{ ...TYPE.label, color: COLORS.accent, fontSize: '0.8rem' }}>
              Advanced Settings
            </Typography>
            <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, fontSize: '0.72rem' }}>
              Customize how the scheduling AI thinks about your calendar
            </Typography>
            <Box sx={{ ml: 'auto', color: COLORS.textSecondary, display: 'flex', alignItems: 'center' }}>
              {advancedCalendarOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </Box>
          </Box>

          {advancedCalendarOpen && (
            <Box sx={{ border: `2px solid ${COLORS.accent}33`, borderTop: 'none', p: 2.5, bgcolor: COLORS.cardBg }}>

              <Box sx={{ mb: 1 }}>
                <Typography sx={{ ...TYPE.label, color: COLORS.accent, mb: 1 }}>
                  AI Instructions (Scheduling)
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={6}
                  maxRows={14}
                  value={calendarAIPrompt || DEFAULT_CALENDAR_AI_PROMPT}
                  onChange={(e) => setCalendarAIPrompt(e.target.value)}
                  helperText="The rules the scheduling AI follows. Live calendar data is added automatically when staff ask a question. The default is well-tuned — only edit if you understand prompt engineering."
                  sx={{
                    bgcolor: 'white',
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 0,
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      lineHeight: 1.6,
                      '& fieldset': { border: `2px solid ${COLORS.accent}33` },
                    },
                  }}
                />
              </Box>

              <Box sx={{ mt: 2 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={() => setCalendarAIPrompt('')}
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
                  Reset to Default Instructions
                </Button>
              </Box>

            </Box>
          )}

          <Box sx={{ mt: 3 }}>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSaveCalendarAIConfig}
              disabled={calendarAISaving}
              sx={{
                fontWeight: 900,
                px: 4,
                py: 1,
                borderRadius: 0,
                bgcolor: COLORS.accent,
                border: `2px solid ${COLORS.brand}`,
                boxShadow: '4px 4px 0px rgba(93,64,55,0.1)',
                '&:hover': { bgcolor: COLORS.brand },
                '&.Mui-disabled': { bgcolor: COLORS.textMuted, color: '#fff' },
              }}
            >
              {calendarAISaving ? 'Saving...' : 'Save Scheduling Helper Settings'}
            </Button>
          </Box>

        </Box>

        {/* ── SECTION 3: CHATBOT KNOWLEDGE BASE ──────────────────────── */}
        <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderTop: `2px solid ${COLORS.accent}`, borderBottom: `2px solid ${COLORS.accent}` }}>
          <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
            <HelpOutlineIcon /> Chatbot Knowledge Base
          </Typography>
          <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mt: 0.5 }}>
            Common questions the chatbot answers for pet owners on the mobile app. Keep answers short — 1 to 3 sentences works best.
          </Typography>
        </Box>
        <Box sx={{ p: 3, bgcolor: COLORS.cardBg }}>

              {/* Soft warning: approaching the chatbot's instruction budget */}
              {faqList.length >= 40 && (
                <Box sx={{ mb: 2.5, p: 2, bgcolor: COLORS.warningSurface, border: `2px solid ${COLORS.warning}`, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <WarningAmberIcon sx={{ color: COLORS.warning, mt: 0.25 }} />
                  <Box>
                    <Typography sx={{ ...TYPE.label, color: COLORS.warning, mb: 0.5 }}>
                      Approaching the chatbot's instruction budget
                    </Typography>
                    <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary }}>
                      You have {faqList.length} FAQs. The chatbot reads every active FAQ each time a pet owner asks a question — too many can slow responses and increase costs. Consider consolidating similar questions or turning off the ones that are rarely asked.
                    </Typography>
                  </Box>
                </Box>
              )}

              {/* Search box — filters by question, answer, or category */}
              <Box sx={{ mb: 2 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Search FAQs by question, answer, or category…"
                  value={faqSearchQuery}
                  onChange={(e) => setFaqSearchQuery(e.target.value)}
                  sx={{
                    bgcolor: 'white',
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 0,
                      '& fieldset': { border: `2px solid ${COLORS.accent}33` },
                    },
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ color: COLORS.textMuted, fontSize: 20 }} />
                      </InputAdornment>
                    ),
                    endAdornment: faqSearchQuery ? (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setFaqSearchQuery('')} sx={{ borderRadius: 0 }}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : null,
                  }}
                />
              </Box>

              {/* Category filter tabs — labels show per-category counts */}
              <Box sx={{ mb: 3 }}>
                <ToggleButtonGroup
                  exclusive
                  value={faqActiveTab}
                  onChange={(_, val) => { if (val !== null) setFaqActiveTab(val); }}
                  size="small"
                  sx={{
                    flexWrap: 'wrap',
                    gap: 0.5,
                    '& .MuiToggleButton-root': {
                      border: `2px solid ${COLORS.accent}33 !important`,
                      borderRadius: '0 !important',
                      fontWeight: 900,
                      fontSize: '0.72rem',
                      color: COLORS.accent,
                      px: 2,
                      py: 0.5,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      '&.Mui-selected': {
                        bgcolor: `${COLORS.accent} !important`,
                        color: `${COLORS.cardBg} !important`,
                      },
                    },
                  }}
                >
                  <ToggleButton value="All">All ({faqList.length})</ToggleButton>
                  {FAQ_CATEGORIES.map((cat) => {
                    const count = faqList.filter((f) => f.category === cat).length;
                    return (
                      <ToggleButton key={cat} value={cat}>{cat} ({count})</ToggleButton>
                    );
                  })}
                </ToggleButtonGroup>
              </Box>

              {/* FAQ list */}
              {(() => {
                const byCategory = faqActiveTab === 'All'
                  ? faqList
                  : faqList.filter((f) => f.category === faqActiveTab);
                const q = faqSearchQuery.trim().toLowerCase();
                const filteredFaqs = q
                  ? byCategory.filter((f) =>
                      (f.question || '').toLowerCase().includes(q) ||
                      (f.answer || '').toLowerCase().includes(q) ||
                      (f.category || '').toLowerCase().includes(q)
                    )
                  : byCategory;

                if (filteredFaqs.length === 0) {
                  // Search returned nothing
                  if (q) {
                    return (
                      <Box sx={{ py: 4, textAlign: 'center', border: `2px dashed ${COLORS.accent}33` }}>
                        <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted }}>
                          No FAQs match "{faqSearchQuery}"{faqActiveTab !== 'All' ? ` in the "${faqActiveTab}" category` : ''}.
                        </Typography>
                      </Box>
                    );
                  }
                  if (faqActiveTab !== 'All') {
                    return (
                      <Box sx={{ py: 4, textAlign: 'center', border: `2px dashed ${COLORS.accent}33` }}>
                        <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted }}>
                          No FAQs in the "{faqActiveTab}" category.
                        </Typography>
                      </Box>
                    );
                  }
                  // All-tab empty state: helpful nudge instead of generic message
                  return (
                    <Box sx={{ py: 4, px: 3, textAlign: 'center', border: `2px dashed ${COLORS.accent}55`, bgcolor: 'white' }}>
                      <Typography sx={{ fontSize: '2.5rem', mb: 1 }}>📭</Typography>
                      <Typography sx={{ fontWeight: 900, color: COLORS.accent, fontSize: '1rem', mb: 1.5 }}>
                        No FAQs yet
                      </Typography>
                      <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 2, maxWidth: 560, mx: 'auto' }}>
                        The chatbot already knows your hours, location, services, prices, and emergency contact from your clinic settings. Add FAQs for things it can't figure out on its own, like:
                      </Typography>
                      <Box sx={{ display: 'inline-block', textAlign: 'left', mb: 2.5 }}>
                        {[
                          'Cancellation and rebooking policy',
                          'Accepted payment methods',
                          'Data privacy practices',
                          'Vaccination schedules and recommendations',
                          'What to bring to your first visit',
                        ].map((topic) => (
                          <Typography key={topic} sx={{ ...TYPE.meta, color: COLORS.textSecondary, fontSize: '0.82rem', lineHeight: 1.9 }}>
                            • {topic}
                          </Typography>
                        ))}
                      </Box>
                      <Box>
                        <Button
                          variant="contained"
                          startIcon={<AddCircleOutlineIcon />}
                          onClick={() => handleOpenFaqDialog()}
                          sx={{
                            fontWeight: 900,
                            borderRadius: 0,
                            bgcolor: COLORS.accent,
                            border: `2px solid ${COLORS.brand}`,
                            boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.15)',
                            '&:hover': { bgcolor: COLORS.brand },
                          }}
                        >
                          Add Your First FAQ
                        </Button>
                      </Box>
                    </Box>
                  );
                }

                return (
                  <Stack spacing={1.5} sx={{ mb: 2 }}>
                    {filteredFaqs.map((faq) => (
                      <Box
                        key={faq.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 2,
                          p: 2,
                          bgcolor: faq.isActive ? 'white' : COLORS.formBg,
                          border: `2px solid ${faq.isActive ? COLORS.accent + '33' : COLORS.border}`,
                          opacity: faq.isActive ? 1 : 0.65,
                        }}
                      >
                        {/* Text content */}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 900, color: COLORS.accent, fontSize: '0.9rem', mb: 0.5 }}>
                            {faq.question}
                          </Typography>
                          <Typography
                            sx={{
                              ...TYPE.meta,
                              color: COLORS.textSecondary,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              mb: 1,
                            }}
                          >
                            {faq.answer}
                          </Typography>
                          <Chip
                            label={faq.category}
                            size="small"
                            sx={{
                              fontWeight: 900,
                              fontSize: '0.65rem',
                              borderRadius: 0,
                              bgcolor: COLORS.cream,
                              border: `1px solid ${COLORS.accent}33`,
                              color: COLORS.accent,
                              letterSpacing: '0.04em',
                            }}
                          />
                        </Box>

                        {/* Controls */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                          <FormControlLabel
                            control={
                              <Switch
                                size="small"
                                checked={faq.isActive}
                                onChange={() => handleToggleFaqActive(faq)}
                                sx={{ '& .MuiSwitch-thumb': { borderRadius: 0 }, '& .MuiSwitch-track': { borderRadius: 0 } }}
                              />
                            }
                            label={
                              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, fontSize: '0.7rem' }}>
                                {faq.isActive ? 'Active' : 'Off'}
                              </Typography>
                            }
                            sx={{ mr: 0 }}
                          />
                          <IconButton
                            size="small"
                            onClick={() => handleOpenFaqDialog(faq)}
                            sx={{ color: COLORS.accent, borderRadius: 0, '&:hover': { bgcolor: COLORS.cream } }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => setFaqDeleteConfirm({ open: true, id: faq.id, question: faq.question })}
                            sx={{ color: COLORS.danger, borderRadius: 0, '&:hover': { bgcolor: '#FFEBEE' } }}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                );
              })()}

              {/* Footer actions — only when the list has content; empty state has its own CTA */}
              {faqList.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    startIcon={<AddCircleOutlineIcon />}
                    onClick={() => handleOpenFaqDialog()}
                    sx={{
                      fontWeight: 900,
                      borderRadius: 0,
                      bgcolor: COLORS.accent,
                      border: `2px solid ${COLORS.brand}`,
                      boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
                      '&:hover': { bgcolor: COLORS.brand },
                    }}
                  >
                    Add FAQ
                  </Button>
                  <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, ml: 'auto' }}>
                    {faqList.filter((f) => f.isActive).length} of {faqList.length} FAQs active
                  </Typography>
                </Box>
              )}
            </Box>

      </Paper>
      )} {/* end Tab 2 — AI & Chatbot */}

      {/* TAB 1 — NOTIFICATIONS */}
      {activeTab === 1 && (
      <Grid container spacing={4}>

        {/* ── SECTION 1: NOTIFICATION CHANNELS ────────────────────────────── */}
        <Grid size={{ xs: 12 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden' }}>

            <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <NotificationsActiveIcon /> Notification Channels
              </Typography>
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mt: 0.5 }}>
                Control what gets sent to pet owners, and how. Saved with "Save Configuration" above.
              </Typography>
            </Box>

            <Box
              sx={{
                p: 3,
                bgcolor: COLORS.cardBg,
                '& .MuiFormControlLabel-root': { alignItems: 'flex-start', ml: 0, mr: 0 },
                '& .MuiFormControlLabel-label': { ml: 2.5, mt: 0.25 },
              }}
            >

              {/* ─── SUB-SECTION: AUTOMATIC REMINDERS ─── */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Typography sx={{ ...TYPE.label, color: COLORS.accent, fontSize: '0.78rem', letterSpacing: '0.08em' }}>
                  AUTOMATIC REMINDERS
                </Typography>
                <Divider sx={{ flex: 1, borderColor: COLORS.border }} />
              </Box>

              {/* Manual Appointment Reminders (T4.93) */}
              <Box sx={{ mb: 1.5, p: 2, bgcolor: '#FFFFFF', border: `2px solid ${COLORS.brand}`, borderRadius: 0, boxShadow: '4px 4px 0px rgba(62, 39, 35, 0.18)' }}>
                <FormControlLabel
                  control={
                    <MedicinePillSwitch
                      checked={settings.enableAppointmentReminders !== false}
                      onChange={(e) => handleChange('enableAppointmentReminders', e.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.brand, fontSize: '0.9rem' }}>
                        Manual Appointment Reminders
                      </Typography>
                      <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                        Shows a "Send Reminders" button on the Dashboard so you can remind tomorrow's clients with one click.
                      </Typography>
                    </Box>
                  }
                />
              </Box>

              {/* Automatic Appointment Reminders (T4.126) */}
              <Box sx={{ mb: 1.5, p: 2, bgcolor: '#FFFFFF', border: `2px solid ${COLORS.brand}`, borderRadius: 0, boxShadow: '4px 4px 0px rgba(62, 39, 35, 0.18)' }}>
                <FormControlLabel
                  control={
                    <MedicinePillSwitch
                      checked={settings.enableAutoAppointmentReminders === true}
                      onChange={(e) => handleChange('enableAutoAppointmentReminders', e.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.brand, fontSize: '0.9rem' }}>
                        Automatic Appointment Reminders
                      </Typography>
                      <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                        Reminds clients automatically 3 times: a few days ahead, the day before, and the morning of their appointment. Sent every day at 7 AM.
                      </Typography>
                    </Box>
                  }
                />

                {settings.enableAutoAppointmentReminders === true && (
                  <Box sx={{ mt: 2, pl: { xs: 0, sm: 6 } }}>
                    <TextField
                      type="number"
                      label="First reminder sent how many days ahead?"
                      value={settings.appointmentReminderHeadsUpDays ?? 3}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) || 3;
                        handleChange('appointmentReminderHeadsUpDays', Math.max(2, Math.min(14, v)));
                      }}
                      inputProps={{ min: 2, max: 14 }}
                      size="small"
                      helperText="Between 2 and 14 days"
                      sx={{ width: 360, bgcolor: 'white', boxShadow: '3px 3px 0px rgba(62, 39, 35, 0.18)', '& .MuiOutlinedInput-root': { borderRadius: 0, '& fieldset': { borderColor: COLORS.brand, borderWidth: 2 }, '&:hover fieldset': { borderColor: COLORS.brand }, '&.Mui-focused fieldset': { borderColor: COLORS.brand, borderWidth: 2 } }, '& input': { color: COLORS.brand, fontWeight: 700, fontSize: '1.05rem' }, '& .MuiInputLabel-root.Mui-focused': { color: COLORS.brand, fontWeight: 700 } }}
                      InputLabelProps={{ sx: { fontFamily: FONT, fontSize: '0.82rem', color: COLORS.accent, fontWeight: 700 } }}
                      FormHelperTextProps={{ sx: { fontFamily: FONT, fontSize: '0.78rem', color: COLORS.accent, fontWeight: 600, mt: 1, ml: 0 } }}
                    />
                  </Box>
                )}
              </Box>

              {/* Vaccine Due Reminders (T3.55) */}
              <Box sx={{ mb: 3, p: 2, bgcolor: '#FFFFFF', border: `2px solid ${COLORS.brand}`, borderRadius: 0, boxShadow: '4px 4px 0px rgba(62, 39, 35, 0.18)' }}>
                <FormControlLabel
                  control={
                    <MedicinePillSwitch
                      checked={settings.enableVaccineReminders !== false}
                      onChange={(e) => handleChange('enableVaccineReminders', e.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.brand, fontSize: '0.9rem' }}>
                        Vaccine Due Reminders
                      </Typography>
                      <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                        Notifies pet owners when their pet's vaccines are due or overdue. Sent automatically every morning at 9 AM.
                      </Typography>
                    </Box>
                  }
                />

                {settings.enableVaccineReminders !== false && (
                  <Box sx={{ display: 'flex', gap: 2, mt: 2, pl: { xs: 0, sm: 6 }, flexWrap: 'wrap' }}>
                    <TextField
                      type="number"
                      label="Start reminding how many days before due?"
                      value={settings.vaccineReminderWindowDays ?? 30}
                      onChange={(e) => handleChange('vaccineReminderWindowDays', parseInt(e.target.value) || 30)}
                      inputProps={{ min: 7, max: 90 }}
                      size="small"
                      helperText="Between 7 and 90 days"
                      sx={{ flex: 1, minWidth: 280, bgcolor: 'white', boxShadow: '3px 3px 0px rgba(62, 39, 35, 0.18)', '& .MuiOutlinedInput-root': { borderRadius: 0, '& fieldset': { borderColor: COLORS.brand, borderWidth: 2 }, '&:hover fieldset': { borderColor: COLORS.brand }, '&.Mui-focused fieldset': { borderColor: COLORS.brand, borderWidth: 2 } }, '& input': { color: COLORS.brand, fontWeight: 700, fontSize: '1.05rem' }, '& .MuiInputLabel-root.Mui-focused': { color: COLORS.brand, fontWeight: 700 } }}
                      InputLabelProps={{ sx: { fontFamily: FONT, fontSize: '0.82rem', color: COLORS.accent, fontWeight: 700 } }}
                      FormHelperTextProps={{ sx: { fontFamily: FONT, fontSize: '0.78rem', color: COLORS.accent, fontWeight: 600, mt: 1, ml: 0 } }}
                    />
                    <TextField
                      type="number"
                      label="Wait how many days before reminding again?"
                      value={settings.vaccineReminderCooldownDays ?? 7}
                      onChange={(e) => handleChange('vaccineReminderCooldownDays', parseInt(e.target.value) || 7)}
                      inputProps={{ min: 1, max: 30 }}
                      size="small"
                      helperText="Between 1 and 30 days"
                      sx={{ flex: 1, minWidth: 280, bgcolor: 'white', boxShadow: '3px 3px 0px rgba(62, 39, 35, 0.18)', '& .MuiOutlinedInput-root': { borderRadius: 0, '& fieldset': { borderColor: COLORS.brand, borderWidth: 2 }, '&:hover fieldset': { borderColor: COLORS.brand }, '&.Mui-focused fieldset': { borderColor: COLORS.brand, borderWidth: 2 } }, '& input': { color: COLORS.brand, fontWeight: 700, fontSize: '1.05rem' }, '& .MuiInputLabel-root.Mui-focused': { color: COLORS.brand, fontWeight: 700 } }}
                      InputLabelProps={{ sx: { fontFamily: FONT, fontSize: '0.82rem', color: COLORS.accent, fontWeight: 700 } }}
                      FormHelperTextProps={{ sx: { fontFamily: FONT, fontSize: '0.78rem', color: COLORS.accent, fontWeight: 600, mt: 1, ml: 0 } }}
                    />
                  </Box>
                )}
              </Box>

              {/* ─── SUB-SECTION: EXTRA DELIVERY CHANNELS ─── */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Typography sx={{ ...TYPE.label, color: COLORS.accent, fontSize: '0.78rem', letterSpacing: '0.08em' }}>
                  EXTRA DELIVERY CHANNELS
                </Typography>
                <Divider sx={{ flex: 1, borderColor: COLORS.border }} />
                <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, fontSize: '0.7rem' }}>
                  Push notifications are always on
                </Typography>
              </Box>

              {/* Also Send by Email (T4.135) */}
              <Box sx={{ mb: 1.5, p: 2, bgcolor: '#FFFFFF', border: `2px solid ${COLORS.brand}`, borderRadius: 0, boxShadow: '4px 4px 0px rgba(62, 39, 35, 0.18)' }}>
                <FormControlLabel
                  control={
                    <MedicinePillSwitch
                      checked={settings.enableEmailNotifications !== false}
                      onChange={(e) => handleChange('enableEmailNotifications', e.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.brand, fontSize: '0.9rem' }}>
                        Also Send by Email
                      </Typography>
                      <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                        Sends a copy of every notification to the pet owner's email address.
                      </Typography>
                    </Box>
                  }
                />
              </Box>

              {/* Also Send by SMS (T4.135) */}
              <Box sx={{ p: 2, bgcolor: '#FFFFFF', border: `2px solid ${COLORS.brand}`, borderRadius: 0, boxShadow: '4px 4px 0px rgba(62, 39, 35, 0.18)' }}>
                <FormControlLabel
                  control={
                    <MedicinePillSwitch
                      checked={settings.enableSmsNotifications === true}
                      onChange={(e) => handleChange('enableSmsNotifications', e.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.brand, fontSize: '0.9rem' }}>
                        Also Send by SMS (Critical Only)
                      </Typography>
                      <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                        Sends text messages for the most important notifications: booking confirmations, day-before, and same-day reminders. Costs roughly ₱0.40 per message.
                      </Typography>
                    </Box>
                  }
                />
              </Box>

            </Box>
          </Paper>
        </Grid>

        {/* ── SECTION 2: MESSAGE TEMPLATES ─────────────────────────────────── */}
        <Grid size={{ xs: 12 }}>
          <Paper elevation={0} sx={{ ...clinicalFlatStyle, overflow: 'hidden' }}>

            <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.accent, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, textTransform: 'uppercase', letterSpacing: 1 }}>
                <EditIcon /> Message Templates
              </Typography>
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mt: 0.5 }}>
                Customize the push notification messages sent to pet owners at each stage of their visit.
                Placeholders like <strong>{'{petName}'}</strong> are replaced with real values when the notification is sent.
              </Typography>
            </Box>

            <Box sx={{ p: 3, bgcolor: COLORS.cardBg }}>

              {/* Placeholder reference guide */}
              <Box sx={{ mb: 3, p: 2, bgcolor: COLORS.kpiBlueBg, border: `2px solid ${COLORS.kpiBlueBorder}` }}>
                <Typography sx={{ ...TYPE.label, color: COLORS.info, mb: 1 }}>
                  Available Placeholders
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                  {PLACEHOLDER_REFERENCE.map((ph) => (
                    <Tooltip key={ph.token} title={ph.description} arrow>
                      <Chip
                        label={ph.token}
                        size="small"
                        sx={{
                          fontWeight: 900,
                          fontSize: '0.72rem',
                          fontFamily: "'Inter', 'Roboto', monospace",
                          borderRadius: 0,
                          bgcolor: 'white',
                          border: `1px solid ${COLORS.kpiBlueBorder}`,
                          color: COLORS.info,
                          cursor: 'help',
                        }}
                      />
                    </Tooltip>
                  ))}
                </Box>
              </Box>

              {/* Collapsible template groups */}
              {TEMPLATE_GROUPS.map((group) => {
                const isOpen = !!expandedGroups[group.label];
                const customizedCount = group.keys.filter((key) => {
                  const tpl = notifTemplates[key];
                  return tpl && (tpl.title !== DEFAULT_TEMPLATES[key]?.title || tpl.body !== DEFAULT_TEMPLATES[key]?.body);
                }).length;

                return (
                  <Box key={group.label} sx={{ mb: 2 }}>

                    {/* Accordion header — click to expand/collapse */}
                    <Box
                      onClick={() => toggleGroup(group.label)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        px: 2,
                        py: 1.5,
                        bgcolor: isOpen ? COLORS.cream : 'white',
                        border: `2px solid ${COLORS.accent}33`,
                        cursor: 'pointer',
                        userSelect: 'none',
                        '&:hover': { bgcolor: COLORS.cream },
                      }}
                    >
                      <Typography sx={{ ...TYPE.label, color: COLORS.accent, fontSize: '0.8rem' }}>
                        {group.label}
                      </Typography>
                      <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, fontSize: '0.72rem' }}>
                        {group.keys.length} templates{customizedCount > 0 ? ` · ${customizedCount} customized` : ''}
                      </Typography>
                      <Box sx={{ ml: 'auto', color: COLORS.textSecondary, display: 'flex', alignItems: 'center' }}>
                        {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      </Box>
                    </Box>

                    {/* Accordion body */}
                    {isOpen && (
                      <Box sx={{ border: `2px solid ${COLORS.accent}33`, borderTop: 'none', p: 2, bgcolor: COLORS.cardBg }}>
                        <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, mb: 2, fontSize: '0.75rem' }}>
                          {group.description}
                        </Typography>

                        <Stack spacing={2}>
                          {group.keys.map((statusKey) => {
                            const tpl = notifTemplates[statusKey];
                            if (!tpl) return null;
                            const chipColor = STATUS_CHIP_COLORS[statusKey] || STATUS_CHIP_COLORS.confirmed;
                            const isDefault = tpl.title === DEFAULT_TEMPLATES[statusKey]?.title
                                           && tpl.body  === DEFAULT_TEMPLATES[statusKey]?.body;

                            return (
                              <Box
                                key={statusKey}
                                sx={{
                                  p: 2.5,
                                  bgcolor: isDefault ? 'white' : COLORS.warningSurface,
                                  border: `2px solid ${isDefault ? COLORS.accent + '22' : COLORS.warning + '44'}`,
                                }}
                              >
                                {/* Status chip + customized indicator + reset button */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                                  <Chip
                                    label={STATUS_LABELS[statusKey]}
                                    size="small"
                                    sx={{
                                      fontWeight: 900,
                                      fontSize: '0.68rem',
                                      letterSpacing: '0.04em',
                                      borderRadius: 0,
                                      bgcolor: chipColor.bg,
                                      color: chipColor.text,
                                      border: `1px solid ${chipColor.border}`,
                                    }}
                                  />
                                  {!isDefault && (
                                    <Chip
                                      label="CUSTOMIZED"
                                      size="small"
                                      sx={{
                                        fontWeight: 900,
                                        fontSize: '0.6rem',
                                        borderRadius: 0,
                                        bgcolor: COLORS.warningSurface,
                                        color: COLORS.warning,
                                        border: `1px solid ${COLORS.warning}`,
                                      }}
                                    />
                                  )}
                                  {!isDefault && (
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      startIcon={<RefreshIcon sx={{ fontSize: '0.85rem' }} />}
                                      onClick={() => setNotifResetConfirm({ open: true, key: statusKey })}
                                      sx={{
                                        ml: 'auto',
                                        fontWeight: 900,
                                        fontSize: '0.65rem',
                                        borderRadius: 0,
                                        textTransform: 'uppercase',
                                        letterSpacing: 0.5,
                                        borderColor: COLORS.accentLight,
                                        color: COLORS.textSecondary,
                                        py: 0.25,
                                        '&:hover': { bgcolor: COLORS.cream },
                                      }}
                                    >
                                      Reset
                                    </Button>
                                  )}
                                </Box>

                                {/* Title field */}
                                <TextField
                                  fullWidth
                                  label="Title"
                                  size="small"
                                  value={tpl.title}
                                  onChange={(e) => handleNotifTemplateChange(statusKey, 'title', e.target.value)}
                                  sx={{
                                    mb: 1.5,
                                    bgcolor: 'white',
                                    '& .MuiOutlinedInput-root': {
                                      borderRadius: 0,
                                      '& fieldset': { border: `2px solid ${COLORS.accent}33` },
                                    },
                                  }}
                                  inputProps={{ style: { fontWeight: 700 } }}
                                />

                                {/* Body field */}
                                <TextField
                                  fullWidth
                                  label="Body"
                                  size="small"
                                  multiline
                                  minRows={2}
                                  maxRows={4}
                                  value={tpl.body}
                                  onChange={(e) => handleNotifTemplateChange(statusKey, 'body', e.target.value)}
                                  sx={{
                                    bgcolor: 'white',
                                    '& .MuiOutlinedInput-root': {
                                      borderRadius: 0,
                                      '& fieldset': { border: `2px solid ${COLORS.accent}33` },
                                    },
                                  }}
                                  helperText={
                                    isDefault
                                      ? 'Default template — edit to customize.'
                                      : 'Customized — will override the default notification.'
                                  }
                                />
                              </Box>
                            );
                          })}
                        </Stack>
                      </Box>
                    )}
                  </Box>
                );
              })}

              {/* Footer actions */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 3, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={handleSaveNotifTemplates}
                  disabled={notifSaving}
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
                  {notifSaving ? 'Saving...' : 'Save All Templates'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={() => setNotifResetConfirm({ open: true, key: null })}
                  sx={{
                    fontWeight: 900,
                    borderRadius: 0,
                    borderColor: COLORS.danger,
                    color: COLORS.danger,
                    '&:hover': { bgcolor: COLORS.dangerSurface },
                  }}
                >
                  Reset All to Defaults
                </Button>
                <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, ml: 'auto' }}>
                  {Object.entries(notifTemplates).filter(([key, tpl]) =>
                    tpl.title !== DEFAULT_TEMPLATES[key]?.title || tpl.body !== DEFAULT_TEMPLATES[key]?.body
                  ).length} of {Object.keys(DEFAULT_TEMPLATES).length} templates customized
                </Typography>
              </Box>

            </Box>
          </Paper>
        </Grid>

      </Grid>
      )} {/* end Tab 1 — Notifications */}

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
            Are you sure you want to delete the department{' '}
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

      {/* ── FAQ ADD / EDIT DIALOG (T3.108) ────────────────────────────── */}
      <Dialog open={faqDialogOpen} onClose={() => setFaqDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 0 } }}>
        <DialogTitle
          sx={{
            fontWeight: 900,
            color: COLORS.accent,
            bgcolor: COLORS.cream,
            borderBottom: `2px solid ${COLORS.accent}`,
            borderRadius: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <HelpOutlineIcon /> {editingFaqId ? 'Edit FAQ' : 'Add FAQ'}
        </DialogTitle>
        <DialogContent sx={{ pt: 3, bgcolor: COLORS.formBg }}>
          <Stack spacing={2.5}>
            {/* Category */}
            <FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}>
              <InputLabel sx={{ fontWeight: 900, color: COLORS.accent }}>Category</InputLabel>
              <Select
                value={faqForm.category}
                label="Category"
                onChange={(e) => setFaqForm((prev) => ({ ...prev, category: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 }, fontWeight: 700 }}
              >
                {FAQ_CATEGORIES.map((cat) => (
                  <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Question */}
            <TextField
              fullWidth
              label="Question"
              size="small"
              required
              value={faqForm.question}
              onChange={(e) => setFaqForm((prev) => ({ ...prev, question: e.target.value }))}
              placeholder="e.g. Do you accept walk-ins?"
              sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 } }}
              inputProps={{ style: { fontWeight: 700 } }}
            />

            {/* Answer */}
            <TextField
              fullWidth
              label="Answer"
              multiline
              minRows={3}
              maxRows={6}
              required
              value={faqForm.answer}
              onChange={(e) => setFaqForm((prev) => ({ ...prev, answer: e.target.value }))}
              placeholder="Keep answers concise — 1 to 3 sentences is ideal."
              sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 } }}
              helperText="This text is injected directly into the chatbot's prompt. Keep it concise."
            />

            {/* Active toggle */}
            <FormControlLabel
              control={
                <Switch
                  checked={faqForm.isActive}
                  onChange={(e) => setFaqForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                  sx={{ '& .MuiSwitch-thumb': { borderRadius: 0 }, '& .MuiSwitch-track': { borderRadius: 0 } }}
                />
              }
              label={
                <Typography sx={{ fontWeight: 700, color: COLORS.accent }}>
                  Active (visible to chatbot)
                </Typography>
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.border}` }}>
          <Button
            onClick={() => setFaqDialogOpen(false)}
            sx={{ fontWeight: 'bold', color: COLORS.textSecondary, borderRadius: 0 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveFaq}
            variant="contained"
            disabled={faqSaving}
            sx={{
              fontWeight: 900,
              borderRadius: 0,
              bgcolor: COLORS.accent,
              border: `2px solid ${COLORS.brand}`,
              '&:hover': { bgcolor: COLORS.brand },
              '&.Mui-disabled': { bgcolor: COLORS.textMuted, color: '#fff' },
            }}
          >
            {faqSaving ? 'Saving...' : editingFaqId ? 'Update FAQ' : 'Create FAQ'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── FAQ DELETE CONFIRMATION DIALOG (T3.108) ─────────────────────── */}
      <Dialog
        open={faqDeleteConfirm.open}
        onClose={() => setFaqDeleteConfirm({ open: false, id: '', question: '' })}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0 } }}
      >
        <DialogTitle sx={{ fontWeight: 900, color: COLORS.danger, pb: 1 }}>
          Delete FAQ
        </DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this FAQ?
          </Typography>
          <Typography sx={{ fontWeight: 700, color: COLORS.accent, mt: 1 }}>
            "{faqDeleteConfirm.question}"
          </Typography>
          <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, mt: 1 }}>
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button
            onClick={() => setFaqDeleteConfirm({ open: false, id: '', question: '' })}
            sx={{ fontWeight: 'bold', color: COLORS.textSecondary, borderRadius: 0 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteFaq}
            variant="contained"
            sx={{
              fontWeight: 900,
              borderRadius: 0,
              bgcolor: COLORS.danger,
              '&:hover': { bgcolor: COLORS.danger },
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── NOTIFICATION TEMPLATE RESET CONFIRMATION (T4.91) ────────────── */}
      <Dialog
        open={notifResetConfirm.open}
        onClose={() => setNotifResetConfirm({ open: false, key: null })}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0 } }}
      >
        <DialogTitle sx={{ fontWeight: 900, color: COLORS.danger, pb: 1 }}>
          {notifResetConfirm.key ? 'Reset Template' : 'Reset All Templates'}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {notifResetConfirm.key
              ? <>Reset <strong>"{STATUS_LABELS[notifResetConfirm.key]}"</strong> to its default wording?</>
              : 'Reset all 12 notification templates to their default wording?'
            }
          </Typography>
          <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, mt: 1 }}>
            Click "Save All Templates" after resetting to persist the change.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button
            onClick={() => setNotifResetConfirm({ open: false, key: null })}
            sx={{ fontWeight: 900, color: COLORS.textSecondary, borderRadius: 0 }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => notifResetConfirm.key
              ? handleResetNotifTemplate(notifResetConfirm.key)
              : handleResetAllNotifTemplates()
            }
            variant="contained"
            sx={{
              fontWeight: 900,
              borderRadius: 0,
              bgcolor: COLORS.danger,
              '&:hover': { bgcolor: COLORS.dangerHover },
            }}
          >
            {notifResetConfirm.key ? 'Reset' : 'Reset All'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={5000} onClose={() => setToast({...toast, open: false})} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setToast({...toast, open: false})} severity={toast.severity} sx={{ width: '100%', fontWeight: 'bold', boxShadow: 3, fontSize: '1rem' }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}