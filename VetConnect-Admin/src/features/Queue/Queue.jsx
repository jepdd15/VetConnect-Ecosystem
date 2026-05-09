import React, { useEffect, useState, useRef, useMemo } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import {
  Box, Typography, Paper, IconButton, Tooltip, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button,
  Tabs, Tab, Menu, MenuItem, ListItemIcon, ListItemText, Divider, List, ListItem, Alert,
  Popover, Chip, keyframes, FormControl, InputLabel, Select, Switch,
  ToggleButton, ToggleButtonGroup, Autocomplete, InputAdornment, Snackbar,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, where, getDocs, writeBatch, getDoc, arrayUnion, runTransaction, deleteField } from 'firebase/firestore';

// 1. BACKEND & BRAIN
import { db } from '../../firebaseConfig'; 
import { useQueueActions } from './useQueueActions';
import { getQueueColumns } from './queueColumns';
import { useUser } from '../../context/UserContext'; // THE SIGNATURE HOOK

// 2. SHARED COMPONENTS
import ClinicalWorkspace from '../../components/ClinicalWorkspace';
import POSModal from '../../components/POSModal';
import { useClosingStatus } from '../Sales/hooks/useClosingStatus';

// 3. FEATURE COMPONENTS
import EMRDrawer from '../../components/EMRDrawer';
import WalkInModal from './WalkInModal';
import AssignStaffModal from './AssignStaffModal';
import EndOfDayModal from './EndOfDayModal';
import DispensingVerificationDialog from './DispensingVerificationDialog';

// --- ICONS ---
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import EditIcon from '@mui/icons-material/Edit';
import EventIcon from '@mui/icons-material/Event';
import HistoryIcon from '@mui/icons-material/History';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'; 
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'; 

// 🧬 PHASE 6 COMPONENTS
import { calculatePulseMetrics, getSmartShiftDate, makePulseEventId, createPulseEvent } from '../../utils/pulseUtils';
import { sendPushNotification } from '../../utils/sendPushNotification';
import {
  writeAppointmentQueueDoc,
  removeAppointmentQueueDoc,
  updateAppointmentQueueDate,
} from '../../utils/appointmentReminderQueue';
import { COLORS, FONT } from '../../theme/designTokens';
import { HIGH_STAKES_STATUSES, ACTIVE_STATUSES, normalizeStatus, TERMINAL_STATUSES } from '../../utils/statusConstants';
import { getLocalDateStr } from '../../utils/dateUtils';
import { useClinicSettings } from '../../hooks/useClinicSettings';
import { useNavigate, useLocation } from 'react-router-dom';
import { ForensicMetricGrid } from './ForensicMetricGrid'; 
import UndoIcon from '@mui/icons-material/Undo';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import HomeIcon from '@mui/icons-material/Home';
import WarningIcon from '@mui/icons-material/Warning';
import NightlightRoundIcon from '@mui/icons-material/NightlightRound';
import CloseIcon from '@mui/icons-material/Close';
import CakeIcon from '@mui/icons-material/Cake';
import AssignmentIcon from '@mui/icons-material/Assignment';
import SearchIcon from '@mui/icons-material/Search';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleFilledWhiteIcon from '@mui/icons-material/PlayCircleFilledWhite';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';

// T4.92: Custom notification dialog
import SendNotificationDialog from '../../components/SendNotificationDialog';

const BREED_DATA = {
  Canine: [
    "Aspin (Asong Pinoy)", "Shih Tzu", "Pomeranian", "Golden Retriever", "Labrador", 
    "Poodle", "Chihuahua", "Husky", "Beagle", "Pug", "Bulldog", "German Shepherd", 
    "Mixed Breed", "Unknown", "Other",
  ],
  Feline: [
    "Puspin (Pusang Pinoy)", "Persian", "Siamese", "British Shorthair", "Maine Coon", 
    "Bengal", "Mixed Breed", "Unknown", "Other",
  ],
};

export default function Queue() {
  const [rows, setRows] = useState([]);
  const [vets, setVets] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [inventoryCategories, setInventoryCategories] = useState([]); // TAXONOMY SYNC
  const [servicesList, setServicesList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const clinicSettings = useClinicSettings(); // Shared singleton — no local listener needed
  const [tabValue, setTabValue] = useState(0);
  const[filterDate, setFilterDate] = useState(getLocalDateStr());
  const[isTomorrowView, setIsTomorrowView] = useState(false);
  const[currentTime, setCurrentTime] = useState(new Date());

  // T4.151: EOD close status — passed to POSModal so it can tag post-close sales.
  const todayStr = new Date().toISOString().split('T')[0];
  const { isDayClosed, closingData } = useClosingStatus(todayStr);
  
  const { user, profile, isAdmin } = useUser(); // Forensic Attribution
  const { changeStatus, revertStatus, markNoShow, rejectAppointment, quickAdmitER, deferAppointment } = useQueueActions();

  // THE FIX: Timezone-aware isToday logic targets local computer time instead of UTC toISOString.
  const isToday = filterDate === getLocalDateStr();

  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const df = location.state?.dashboardFilter;
    if (!df) return;
    // 'active' is intentionally absent: "ACTIVE IN FACILITY" spans arrived + in-consult +
    // dispensing + billing + confined + on-hold (6 statuses), which no single tab captures.
    // Dropping it here causes the queue to open on the default view, which is honest
    // about the scope rather than misleadingly showing only tab 3 (Started).
    const tabMap = {
      'no-show': 7, cancelled: 7, completed: 6,
      confined: 3, emergency: 3,
    };
    if (df.status && tabMap[df.status] !== undefined) setTabValue(tabMap[df.status]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // THE RE-CALIBRATION: Update filterDate whenever the Toggle shifts
  useEffect(() => {
    if (isTomorrowView) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setFilterDate(getLocalDateStr(tomorrow));
      setTabValue(1); // Force to 'Scheduled' silo for Tomorrow
    } else {
      setFilterDate(getLocalDateStr());
      setTabValue(0); 
    }
  }, [isTomorrowView]);
  const isClosingTime = useMemo(() => {
    if (!isToday) return false;
    return currentTime.getHours() >= (clinicSettings.closeHour || 17);
  }, [currentTime, clinicSettings, isToday]);

  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const[selectedId, setSelectedId] = useState(null); 
  
  const [openReject, setOpenReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  
  // THE NEW TRIAGE STATES
  const[openEndDay, setOpenEndDay] = useState(false);
  const[leftoverPatients, setLeftoverPatients] = useState([]);
  const [patientResolutions, setPatientResolutions] = useState({}); // Stores the action for EACH patient
  const [touchedPatients, setTouchedPatients] = useState(new Set()); // PHASE 3: THE HARD-GATE
  const [auditReasons, setAuditReasons] = useState({}); // PHASE 4: FORENSIC JUSTIFICATIONS
  const [targetDates, setTargetDates] = useState({}); // PHASE 2/3: RESCHEDULING WINDOWS
  const [targetTimes, setTargetTimes] = useState({}); // PHASE 5.5: TEMPORAL PRECISION
  const [isForcedCleanup, setIsForcedCleanup] = useState(false); // The Hostage Lock
  const [hasGhostPatients, setHasGhostPatients] = useState(false);
  const [openTriageShield, setOpenTriageShield] = useState(false); 
  const [triageMode, setTriageMode] = useState(null); // 'hospitalize' | 'reschedule' | 'carryover'
  const [triageDate, setTriageDate] = useState("");
  const [triageTime, setTriageTime] = useState("08:00");
  const [triageReason, setTriageReason] = useState("");

  const [openEdit, setOpenEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPet, setEditPet] = useState('');
  const [editSpecies, setEditSpecies] = useState('Canine');
  const [editBreed, setEditBreed] = useState('');
  const [editGender, setEditGender] = useState('Male');
  const [editIsNeutered, setEditIsNeutered] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editDobMode, setEditDobMode] = useState('exact');
  const [editDob, setEditDob] = useState('');
  const [editEstYears, setEditEstYears] = useState('');
  const [editEstMonths, setEditEstMonths] = useState('');
  const [editColor, setEditColor] = useState('');

  const [openReschedule, setOpenReschedule] = useState(false);
  const [openDefer, setOpenDefer] = useState(false);
  const [openNoShow, setOpenNoShow] = useState(false);
  const [auditReason, setAuditReason] = useState("");
  const [newDate, setNewDate] = useState('');
  const [emrDrawerOpen, setEmrDrawerOpen] = useState(false);
  const [emrPetId, setEmrPetId] = useState(null);
  const [emrPetName, setEmrPetName] = useState('');
  const [emrPetSpecies, setEmrPetSpecies] = useState('');
  const [openRevert, setOpenRevert] = useState(false);
  const [revertReason, setRevertReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // T3.10b — Recently Resolved panel visibility toggle
  const [showResolved, setShowResolved] = useState(false);

  // T3.10d — Global patient search across all queue tabs
  const [queueSearchText, setQueueSearchText] = useState('');

  const [openConsult, setOpenConsult] = useState(false);
  const[openPOS, setOpenPOS] = useState(false);
  const [openRetailPOS, setOpenRetailPOS] = useState(false);
  const [openDispenseVerify, setOpenDispenseVerify] = useState(false);
  const [dispenseRow, setDispenseRow] = useState(null);

  // T3.36 — Hold for Vet Review: dialog state and target row
  const [dispenseFlagDialogOpen, setDispenseFlagDialogOpen] = useState(false);
  const [dispenseResolveDialogOpen, setDispenseResolveDialogOpen] = useState(false);
  const [dispenseReasonText, setDispenseReasonText] = useState('');
  const [dispenseFlagTarget, setDispenseFlagTarget] = useState(null);

  // Lightweight Snackbar for dispense-hold operation errors
  const [dispenseHoldToast, setDispenseHoldToast] = useState({ open: false, message: '', severity: 'error' });

  // T4.92: Custom notification dialog
  const [notifDialogOpen, setNotifDialogOpen] = useState(false);

  // T4.111: Staffing gap dialog
  const [staffGapDialogOpen, setStaffGapDialogOpen] = useState(false);
  const [staffGapDepts, setStaffGapDepts] = useState([]);

  const [openWalkIn, setOpenWalkIn] = useState(false);
  const [openAssign, setOpenAssign] = useState(false);

  // --- ðŸ›°ï¸ UNIVERSAL CLINICAL HOVER ENGINE ---
  const [hoverAnchor, setHoverAnchor] = useState(null);
  const [hoverMetadata, setHoverMetadata] = useState({ type: null, data: null });
  const [expandedPulseId, setExpandedPulseId] = useState(null);
  const [activeCaseDay, setActiveCaseDay] = useState(0);
  const [isPinned, setIsPinned] = useState(false);
  // T3.70: Active tab index for the tabbed notes popover (kept for backward compat reset logic)
  const [notesTab, setNotesTab] = useState(0);

  // Fix 9: Inline staff notes editing state
  const [editingStaffNotes, setEditingStaffNotes] = useState(false);
  const [editStaffNotesValue, setEditStaffNotesValue] = useState('');
  const [editStaffNotesLoading, setEditStaffNotesLoading] = useState(false);
  const [editStaffNotesRowId, setEditStaffNotesRowId] = useState(null);

  const hoverTimer = useRef(null);
  const closeTimer = useRef(null);

  // T3.68: Sort mode for the services popover — resets to insertion order on each open.
  const [servicesSortMode, setServicesSortMode] = useState('booking'); // 'booking' | 'status' | 'department'

  // 🧬 ANCESTOR CHAIN CACHE FOR POPOVER (Session-cached, keyed by record ID)
  const [popoverAncestorCache, setPopoverAncestorCache] = useState({});

  // Auto-resolve ancestor chain when timing popover opens on a carry-over record
  useEffect(() => {
    if (!hoverAnchor || hoverMetadata.type !== 'timing' || !hoverMetadata.data) return;
    const record = hoverMetadata.data;
    const recordId = record.id;
    if (!record.originApptId || popoverAncestorCache[recordId]) return;

    const resolveChain = async () => {
      const chain = [];
      let currentOriginId = record.originApptId;
      let depth = 0;
      const MAX_DEPTH = 10;

      while (currentOriginId && depth < MAX_DEPTH) {
        try {
          const snap = await getDoc(doc(db, 'appointments', currentOriginId));
          if (!snap.exists()) break;
          const ancestor = { id: snap.id, ...snap.data() };
          chain.unshift(ancestor);
          currentOriginId = ancestor.originApptId;
        } catch (e) {
          console.error(`[Popover] Ancestor chain fetch failed at depth ${depth}:`, e);
          break;
        }
        depth++;
      }

      if (chain.length > 0) {
        setPopoverAncestorCache(prev => ({ ...prev, [recordId]: chain }));
      }
    };

    resolveChain();
  }, [hoverAnchor, hoverMetadata]);

  const handleHoverStart = (event, type, data) => {
    if (!data) return;
    
    // INDUSTRIAL FIX: Cancel any pending close timers (Safe Passage Hand-off)
    if (closeTimer.current) clearTimeout(closeTimer.current);

    // If already pinned, don't trigger new hover changes unless we are moving to a different category
    if (isPinned) return;

    const target = event.currentTarget;
    
    // INTENT DEBOUNCE (200ms): Only show if the user 'stops' on the cell
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
        setHoverAnchor(target);
        setHoverMetadata({ type, data });
        // RESET Temporal DeLorean to latest day (clamped by safeActiveDay)
        setActiveCaseDay(Infinity);
        // T3.68: Reset services sort to insertion order on each new popover open.
        if (type === 'services') setServicesSortMode('booking');
        // T3.70: Reset notes tab to first available tab on each new popover open.
        if (type === 'notes') setNotesTab(0);
    }, 200); 
  };

  const handleHoverEnd = () => {
    // INDUSTRIAL FIX: Cancel any pending open timers (Gliding Filtering)
    if (hoverTimer.current) clearTimeout(hoverTimer.current);

    // If pinned, we ignore the hover-leave entirely
    if (isPinned) return;

    // GRACE PERIOD (150ms): Allow the cursor time to travel into the popup
    closeTimer.current = setTimeout(() => {
        if (!isPinned) {
            setHoverAnchor(null);
            setHoverMetadata({ type: null, data: null });
            setExpandedPulseId(null);
        }
    }, 150);
  };
  const clinicalFlatStyle = {
    background: '#FFF', 
    border: '2px solid #5D4037',
    boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)', 
    borderRadius: 0, 
  };

  const headerFlatStyle = {
    background: '#FFF8E1', 
    border: '2px solid #5D4037',
    boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)', 
    borderRadius: 0, 
  };

  // --- ðŸ›°ï¸ SYNC CLINIC CONFIGURATION (CLOSING HOURS & CAPACITY) ---
  // clinic_settings is now served by useClinicSettings() above — no separate listener needed.

  // ======================================================================
  // LOGIC & HANDLERS
  // ======================================================================
  
// T2.102: depositDataMap is { [patientId]: { amount: number, method: string } }
// Written to new carry-over appointments so POSModal can deduct it as "Less Deposit".
const confirmResetDay = async (isSilent = false, targetDateMap = {}, targetModeMap = {}, targetReasonMap = {}, targetTimeMap = {}, depositDataMap = {}) => {
    try { 
      const todayStr = getLocalDateStr();

      // STEP 5.1: Guard against empty array — Firestore throws on "in" queries with zero elements.
      if (leftoverPatients.length === 0) {
        const queueRef = doc(db, "queue", "daily_queue");
        const queueSnap = await getDoc(queueRef);
        if (queueSnap.exists()) {
          await updateDoc(queueRef, { currentServing: 0, currentPrefix: '', lastNumberIssued: 0, status: 'active', lastResetDate: getLocalDateStr() });
        }
        setOpenEndDay(false);
        if (!isSilent) alert("Cleanup Complete (no patients to process).");
        return;
      }

      // TIER 2: THE FINAL PULSE CHECK (ZOMBIE PREVENTION - IDs verified in real-time)
      const freshSnap = await getDocs(query(collection(db, "appointments"), where("__name__", "in", leftoverPatients.map(p => p.id))));
      const freshStatuses = {};
      freshSnap.docs.forEach(doc => { freshStatuses[doc.id] = doc.data().status; });

      const queueSnap = await getDoc(doc(db, "queue", "daily_queue"));
      if (queueSnap.exists() && queueSnap.data().lastResetDate === todayStr && !isSilent && !isForcedCleanup) {
         alert("Data Protected: Another staff member has already reset the queue for today.");
         setOpenEndDay(false);
         return;
      }

      const batch = writeBatch(db); 
      
      // PHASE 5.6.20: DYNAMIC SHIFT BOUNDARIES (Universal Precision)
      const [openH, openM = 0] = (clinicSettings.openingTime || "08:00").split(':').map(Number);
      const [closeH, closeM = 0] = (clinicSettings.closingTime || "17:00").split(':').map(Number);
      
      const now = new Date();
      const closingToday = new Date();
      closingToday.setHours(closeH, closeM, 0, 0);
      const isAfterHours = now > closingToday;

      // Default Target: If closing today, target Tomorrow at OpeningTime. 
      // If recovering yesterday, target Today at OpeningTime (Unless it's after hours).
      const defaultTargetDate = new Date(); 
      if (isAfterHours) {
        defaultTargetDate.setDate(defaultTargetDate.getDate() + 1);
      }
      defaultTargetDate.setHours(openH, openM, 0, 0); 

      // T4.126: Track new clone doc IDs so we can write queue docs after batch.commit()
      // Structure: { [oldPatientId]: { newId, date, patient } }
      const cloneIdMap = {};

      leftoverPatients.forEach((patient) => {
        const oldRef = doc(db, "appointments", patient.id);
        const currentStatus = (freshStatuses[patient.id] || patient.status || 'unknown').toLowerCase();
        
        // Skip records already resolved remotely while wizard was open
        if (['completed', 'cancelled', 'no-show', 'carried-over'].includes(currentStatus)) return;

        const rawStatus = (patient.status || 'unknown').toLowerCase();
        const action = (patientResolutions[patient.id] || (patient.status === 'pending' ? 'defer' : 'cancel'));
        const staffSignature = profile?.fullName || user?.email || "System Triage";
        const isHighStakes = HIGH_STAKES_STATUSES.has(rawStatus);

        // --- 🧬 SUB-PHASE 4.1: THE FORENSIC CALCULATION HOOK ---
        // We mathematically seal the record's performance at the exact moment of sign-off.
        const forensicSeal = calculatePulseMetrics(
          patient.clinicalPulse || [], 
          clinicSettings, 
          patient.createdAt, 
          new Date()
        );

        // --- 🧬 FORENSIC COMMIT ENGINE: TRIAGE DYNAMICS ---
        if (action === 'reschedule' || action === 'carryover' || action === 'confined' || action === 'carry-over' || action === 'defer') {
          // --- 🧬 SMART-SHIFT CALCULATION ---
          // Determine if we are CLOSING today's shift or RECOVERING yesterday's ghosts
          let recordDateObj;
          if (patient.scheduledDate?.toDate) recordDateObj = patient.scheduledDate.toDate();
          else if (patient.scheduledDate) recordDateObj = new Date(patient.scheduledDate);
          else recordDateObj = patient.createdAt?.toDate ? patient.createdAt.toDate() : new Date();

          const recordDayStr = getLocalDateStr(recordDateObj);
          const isFromPast = recordDayStr < todayStr;

          // LOGIC: If a Friday ghost is processed on Sunday, "Defer" targets Sunday (Today).
          // If a Friday record is processed on Friday night, "Defer" targets Saturday (Tomorrow).
          // PHASE 5.6.20: DYNAMIC MANUAL TIME ATTACHMENT
          const precisionTime = targetTimeMap[patient.id] || (clinicSettings.openingTime || "08:00");
          const [pH, pM] = precisionTime.split(':').map(Number);

          const calculatedDefault = new Date();
          if (isFromPast && !isAfterHours) {
            // Recovery Mode (During Shift): Pull to Today at specific time
            calculatedDefault.setHours(pH, pM, 0, 0);
          } else {
            // Maintenance Mode OR Recovery Mode (After-Hours): Push to Tomorrow at specific time
            calculatedDefault.setDate(calculatedDefault.getDate() + 1); 
            calculatedDefault.setHours(pH, pM, 0, 0);
          }

          const manualDate = targetDateMap[patient.id] 
            ? new Date(`${targetDateMap[patient.id]}T${precisionTime}:00`) 
            : calculatedDefault;
          const pulseType = action === 'defer' ? 'TRIAGE_DEFER'
            : action === 'hospitalize' ? 'TRIAGE_CONFINE'
            : action === 'carryover' ? 'TRIAGE_CARRYOVER'
            : 'TRIAGE_RESCHEDULE';

          // PHASE 5.6.20: THE FORENSIC ACTION TRANSLATOR
          const actionLabel = action === 'hospitalize' ? 'CONFINE' : (action === 'reschedule' ? 'RESCHEDULE' : (action === 'carryover' ? 'CARRY-OVER' : (action === 'defer' ? 'DEFER' : 'CARRY-OVER')));
          const triagePrefix = `[Clinical Triage: ${actionLabel}]`;

          if (patient.status === 'carried-over') {
            batch.update(oldRef, {
               scheduledDate: Timestamp.fromDate(manualDate),
               caseDay: (patient.caseDay || 1) + 1,
               processedBy: staffSignature,
               processedAt: Timestamp.now(),
               forensicSeal, // THE 8-METRIC AUDIT SEAL
               auditReason: targetReasonMap[patient.id],
               auditReasons: arrayUnion({ reason: targetReasonMap[patient.id], action: `eod-${action}`, staffName: staffSignature, timestamp: Timestamp.now() }),
               clinicalPulse: arrayUnion({
                  eventId: makePulseEventId('carryover'),
                  type: pulseType,
                  fromStatus: rawStatus,
                  toStatus: 'carried-over',
                  timestamp: Timestamp.now(), // CLIENT-SIDE CLOCK — see W1 in pulseUtils.js
                  staffId: user?.uid || 'system',
                  staffName: staffSignature,
                  note: `Shift Cleanup: ${actionLabel} to ${manualDate.toDateString()}. Justification: ${targetReasonMap[patient.id]}`
               }),
               isTriaged: true // THE FORENSIC SHIELD STAMP
            });
          } else {
            // T3.70: Propagate structured fields. Dual-read from new or legacy `notes`.
            const carryStaffNotes = patient.staffNotes || patient.notes || "";
            const carryClientNotes = patient.clientNotes || "";
            const existingChips = patient.systemChips || [];

             batch.update(oldRef, {
                status: 'carried-over',
                statusHistory: [...(patient.statusHistory || []), rawStatus],
                isTriaged: true, // THE FORENSIC SHIELD STAMP
                staffNotes: carryStaffNotes,
                systemChips: action === 'hospitalize'
                  ? arrayUnion('CARRY-OVER', 'CONFINED')
                  : arrayUnion('CARRY-OVER'),
                processedBy: staffSignature,
                processedAt: Timestamp.now(),
                forensicSeal, // THE 8-METRIC AUDIT SEAL
                auditReason: targetReasonMap[patient.id],
                auditReasons: arrayUnion({ reason: targetReasonMap[patient.id], action: `eod-${action}`, staffName: staffSignature, timestamp: Timestamp.now() }),
                clinicalPulse: arrayUnion({
                   eventId: makePulseEventId('carryover'),
                   type: pulseType,
                   fromStatus: rawStatus,
                   toStatus: 'carried-over',
                   timestamp: Timestamp.now(), // CLIENT-SIDE CLOCK — see W1 in pulseUtils.js
                   staffId: user?.uid || 'system',
                   staffName: staffSignature,
                   note: `Shift Cleanup: ${actionLabel} to ${manualDate.toDateString()}. Justification: ${targetReasonMap[patient.id]}`
                })
             }); 
             
             const newDocRef = doc(collection(db, "appointments")); 
             // T3.70: Destructure `notes` out so it does not leak onto the new structured doc.
             const { id, jsScheduled, jsArrived, jsStarted, jsCompleted, queueNumber, ticketPrefix, timeArrived, timeStarted, timeCompleted, isTriaged: oldIsTriaged, notes: _legacyNotes, signedOffAt: _oldSignedOffAt, statusHistory: _oldHistory, forensicSeal: _oldSeal, processedAt: _oldProcessedAt, auditReason: _oldAuditReason, auditReasons: _oldAuditReasons, rescheduledBy: _oldRescheduledBy, accumulatedWaitMins: _oldAccum, assignedVetId: _oldAssignedVetId, encounterItems: _oldEncounterItems, encounterItemsVersion: _oldEncounterItemsVersion, finalTotal: _oldFinalTotal, ...preservedData } = patient;
             
             // T2.102: Attach deposit if one was collected during EOD wizard.
             const depositEntry = depositDataMap[patient.id];

             batch.set(newDocRef, {
                ...preservedData,
                status: action === 'hospitalize' ? 'confined' : 'confirmed',
                queueNumber: null,
                ticketPrefix: null,
                scheduledDate: Timestamp.fromDate(manualDate),
                createdAt: patient.createdAt || Timestamp.now(),
                originApptId: patient.id,
                caseDay: (patient.caseDay || 1) + 1,
                // T3.70: Structured notes propagation — legacy `notes` excluded via destructure above.
                clientNotes: carryClientNotes,
                staffNotes: carryStaffNotes,
                systemChips: action === 'hospitalize'
                  ? [...existingChips.filter(c => c !== 'CARRY-OVER' && c !== 'CONFINED'), 'CARRY-OVER', 'CONFINED']
                  : [...existingChips.filter(c => c !== 'CARRY-OVER'), 'CARRY-OVER'],
                processedBy: staffSignature,
                assignedVet: action === 'hospitalize' ? (patient.assignedVet || "Unassigned") : "Unassigned",
                assignedVetId: null,
                ...(depositEntry ? {
                    depositPaid: depositEntry.amount,
                    depositMethod: depositEntry.method,
                    depositCollectedAt: Timestamp.now(),
                    depositCollectedBy: staffSignature,
                } : {}),
                clinicalPulse: [
                   {
                     eventId: makePulseEventId('inception'),
                     type: 'INCEPTION',
                     toStatus: action === 'hospitalize' ? 'confined' : 'confirmed',
                     timestamp: Timestamp.now(), // CLIENT-SIDE CLOCK — see W1 in pulseUtils.js
                     staffId: user?.uid || 'system',
                     staffName: staffSignature,
                     note: `Generated via Triage ${actionLabel} from Appt ${patient.id}${depositEntry ? ` — Deposit: ₱${depositEntry.amount} (${depositEntry.method})` : ''}`
                   }
                ]
             });
             // T4.126: Record clone mapping for post-commit queue writes
             cloneIdMap[patient.id] = { newId: newDocRef.id, date: manualDate, patient };
           }
        } else {
          // TERMINAL AUDIT (Cancel or No-Show)
          const finalStatus = action === 'no-show' ? 'no-show' : 'cancelled';

          batch.update(oldRef, {
             status: finalStatus,
             statusHistory: [...(patient.statusHistory || []), rawStatus],
             processedBy: staffSignature,
             processedAt: Timestamp.now(),
             isForensicAudit: isHighStakes,
             auditReason: targetReasonMap[patient.id],
             auditReasons: arrayUnion({ reason: targetReasonMap[patient.id], action: `eod-${action}`, staffName: staffSignature, timestamp: Timestamp.now() }),
             forensicSeal,
             clinicalPulse: arrayUnion({
                eventId: makePulseEventId('triage'),
                type: action === 'no-show' ? 'TRIAGE_NO_SHOW' : 'TRIAGE_CANCELLED',
                fromStatus: rawStatus,
                toStatus: finalStatus,
                timestamp: Timestamp.now(), // CLIENT-SIDE CLOCK — see W1 in pulseUtils.js
                staffId: user?.uid || 'system',
                staffName: staffSignature,
                note: `Shift Cleanup Sign-off: ${targetReasonMap[patient.id]}`
             })
          });
        }
      }); 

      const queueRef = doc(db, "queue", "daily_queue");
      batch.update(queueRef, { currentServing: 0, currentPrefix: '', lastNumberIssued: 0, status: 'active', lastResetDate: todayStr });
      await batch.commit();

      // T4.90: Push notifications for EOD batch (fire-and-forget, non-blocking)
      leftoverPatients.forEach((patient) => {
        const action = patientResolutions[patient.id] || (patient.status === 'pending' ? 'defer' : 'cancel');
        let pushStatus;
        if (action === 'reschedule' || action === 'carryover' || action === 'carry-over' || action === 'defer' || action === 'confined' || action === 'hospitalize') {
          pushStatus = 'carried-over';
        } else if (action === 'no-show') {
          pushStatus = 'no-show';
        } else {
          pushStatus = 'cancelled';
        }
        sendPushNotification({
          ownerId: patient.ownerId,
          status: pushStatus,
          petName: patient.petName,
          vetName: profile?.fullName || 'Staff',
          appointmentId: patient.id,
          sentBy: profile?.fullName || 'Staff',
        });
      });

      // T4.126: Appointment reminder queue cleanup for EOD — fire-and-forget, never blocks EOD
      leftoverPatients.forEach((patient) => {
        const currentStatus = (patient.status || 'unknown').toLowerCase();
        // Skip records that were already resolved before the batch (guard matches forEach above)
        if (['completed', 'cancelled', 'no-show', 'carried-over'].includes(currentStatus)) return;

        const action = patientResolutions[patient.id] || (patient.status === 'pending' ? 'defer' : 'cancel');

        if (['cancel', 'no-show'].includes(action)) {
          // Terminal — remove the old record from the queue
          removeAppointmentQueueDoc(patient.id).catch(() => {});
        } else if (['reschedule', 'carryover', 'carry-over', 'defer', 'confined', 'hospitalize'].includes(action)) {
          // Carry-over — old record is sealed; write queue doc for the new clone if it exists
          removeAppointmentQueueDoc(patient.id).catch(() => {});
          const cloneEntry = cloneIdMap[patient.id];
          if (cloneEntry) {
            writeAppointmentQueueDoc({
              id:            cloneEntry.newId,
              petName:       cloneEntry.patient.petName,
              ownerName:     cloneEntry.patient.ownerName,
              ownerId:       cloneEntry.patient.ownerId,
              scheduledDate: Timestamp.fromDate(cloneEntry.date),
            }).catch(() => {});
          }
        }
      });

      setOpenEndDay(false);
      setIsForcedCleanup(false);
      setHasGhostPatients(false);
      setLeftoverPatients([]);
      setPatientResolutions({});
      setTouchedPatients(new Set());
      setAuditReasons({});
      setTargetDates({});
      setTargetTimes({});
      if (!isSilent) alert("Cleanup Complete.");
    } catch (error) { alert("Error: " + error.message); } 
  };

  const initiateResetDay = async (isAuto = false) => {
    try {
      // Guard: Don't override forced ghost cleanup with a manual reset
      if (isForcedCleanup) {
        alert("A mandatory ghost cleanup is in progress. Please resolve all unresolved past-day cases first.");
        return;
      }
      const startOfDay = new Date(filterDate); startOfDay.setHours(0,0,0,0); 
      const endOfDay = new Date(filterDate); endOfDay.setHours(23,59,59,999);

      const qLeftovers = query(
        collection(db, "appointments"), 
        where("status", "in",["pending", "confirmed", "arrived", "in-consult", "confined", "on-hold", "dispensing", "billing"]), 
        where("scheduledDate", ">=", Timestamp.fromDate(startOfDay)),
        where("scheduledDate", "<=", Timestamp.fromDate(endOfDay))
      ); 

      const snapshot = await getDocs(qLeftovers); 
      if (snapshot.size > 0) { 
        const rawPatients = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(), 
          services: doc.data().services || [] 
        })); 

        // THE FIX: "Live Identity Healing" â€” Restore missing biometrics from the CRM master record (Resilience Patch)
        const enrichedPatients = await Promise.all(rawPatients.map(async (p) => {
           try {
              const currentGender = String(p.petGender || p.gender || '').toUpperCase();
              const isMissingBio = !p.petGender || currentGender === 'UNKNOWN' || currentGender === 'SEX UNK' || currentGender === '???';

              if (p.petId && isMissingBio) {
                 const petSnap = await getDoc(doc(db, 'pets', p.petId));
                 if (petSnap.exists()) {
                    const petData = petSnap.data();
                    const recoveredGender = petData.gender || petData.sex || petData.petSex || petData.petGender;
                    const genderIsReal = recoveredGender && String(recoveredGender).toLowerCase() !== 'unknown';

                    return {
                       ...p,
                       petGender: genderIsReal ? recoveredGender : p.petGender, 
                       petBreed: petData.breed || petData.petBreed || p.petBreed,
                       petIsNeutered: petData.isNeutered ?? petData.petIsNeutered ?? p.petIsNeutered
                    };
                 }
              }
           } catch (e) { console.error('Triage Identity Restoration failed for record:', p.id, e); }
           return p;
        }));

        setLeftoverPatients(enrichedPatients); 
        
        // PHASE 3: Initialize default actions (Defer for Online, NULL for High-Stakes)
        const initialRes = {};
        const initialTouched = new Set();
        enrichedPatients.forEach(p => {
          const rawStatus = (p.status || 'unknown').toLowerCase();
          // THE FORENSIC GUARD: Arrived, In-Consult, Dispensing, Billing, AND Confirmed are High-Stakes
          const isHighStakes = HIGH_STAKES_STATUSES.has(rawStatus);

          if (rawStatus === 'confined') initialRes[p.id] = 'confined';
          else if (rawStatus === 'pending') {
            initialRes[p.id] = 'defer';
            initialTouched.add(p.id); // AUTO-PASS FOR ONLINE
          }
          else if (isHighStakes) {
            // Auto-suggest CONFINE if the patient's primary service requires inpatient stay
            const primarySvc = servicesList.find(s => s.name === p.primaryService);
            initialRes[p.id] = primarySvc?.isInpatient ? 'hospitalize' : null; // null = FORCE MANUAL CHOICE
          }
          else initialRes[p.id] = 'cancel'; // Low-Stakes fallback
        });
        setPatientResolutions(initialRes);
        setTouchedPatients(initialTouched);
        setAuditReasons({}); // Reset justifications
        setTargetDates({}); // Reset rescheduling windows
        setOpenEndDay(true); 
      } else { 
        if (isAuto) confirmResetDay(true); 
        else if(window.confirm("No active patients on this date. Reset queue?")) confirmResetDay(); 
      } 
    } catch (error) { console.log(error); } 
  };

  const handleQuickAdmit = async () => {
    try { await quickAdmitER(); } 
    catch (error) { alert("Error admitting ER patient: " + error.message); }
  };

  const handleMenuClick = (e, row) => { setAnchorEl(e.currentTarget); setSelectedRow(row); };
  const handleCloseMenu = () => { setAnchorEl(null); };
  const handleOpenAssign = (row) => {
    setSelectedRow(row);
    setOpenAssign(true);
    handleCloseMenu();
  };
  const handleOpenConsult = (row) => {
    const allowed = ['in-consult', 'confined', 'on-hold'];
    if (!allowed.includes(row?.status)) {
      console.warn(`[Queue] Blocked workspace open for status="${row?.status}". Allowed: ${allowed.join(', ')}`);
      return;
    }
    setSelectedRow(row);
    setOpenConsult(true);
  };
  const handleOpenPOS = (row) => { setSelectedRow(row); setOpenPOS(true); };

  const handleOpenDispenseVerify = (row) => {
    setDispenseRow(row);
    setOpenDispenseVerify(true);
  };

  // T2.52: Atomic dispense verification — both the dispensing data write and the
  // status advance to billing happen in a single Firestore transaction.
  const handleDispenseVerified = async (dispensingData) => {
    try {
      await runTransaction(db, async (transaction) => {
        const apptRef = doc(db, "appointments", dispenseRow.id);
        const apptDoc = await transaction.get(apptRef);
        if (!apptDoc.exists()) throw new Error("Appointment not found.");
        if (apptDoc.data().dispensingHold) throw new Error("This dispensing was placed on hold while you were reviewing. Refresh and try again.");
        const freshApptData = apptDoc.data();
        transaction.update(apptRef, {
          ...dispensingData,
          status: 'billing',
          timePaymentStarted: Timestamp.now(),
          statusHistory: [...(freshApptData.statusHistory || []), dispenseRow.status || 'dispensing'],
          clinicalPulse: arrayUnion({
            eventId: makePulseEventId('status'),
            type: 'STATUS_CHANGE',
            fromStatus: 'dispensing',
            toStatus: 'billing',
            timestamp: Timestamp.now(),
            staffId: profile?.id || 'unknown',
            staffName: profile?.fullName || 'System',
            note: 'Dispensing verified, moved to billing.',
          }),
        });
      });

      // T4.90: Push notification — billing ready
      sendPushNotification({
        ownerId: dispenseRow.ownerId,
        status: 'billing',
        petName: dispenseRow.petName,
        vetName: profile?.fullName || 'Pharmacy',
        appointmentId: dispenseRow.id,
        sentBy: profile?.fullName || 'Staff',
      });

      setOpenDispenseVerify(false);
      setDispenseRow(null);
    } catch (e) {
      setDispenseHoldToast({ open: true, message: `Dispensing Error: ${e.message}`, severity: 'error' });
    }
  };
  // T3.36 — Flag an appointment for vet re-review. Writes dispensingHold to the doc
  // and emits a DISPENSING_FLAGGED pulse event. Uses a transaction for safety.
  const handleDispenseFlag = async (row, reason) => {
    try {
      await runTransaction(db, async (transaction) => {
        const apptRef = doc(db, 'appointments', row.id);
        const apptDoc = await transaction.get(apptRef);
        if (!apptDoc.exists()) throw new Error('Appointment not found.');
        transaction.update(apptRef, {
          dispensingHold: {
            flaggedBy: profile?.id || 'unknown',
            flaggedByName: profile?.fullName || 'System',
            flaggedAt: Timestamp.now(),
            reason: reason || 'Flagged for vet review',
          },
          clinicalPulse: arrayUnion(
            createPulseEvent('DISPENSING_FLAGGED', {
              staffId: profile?.id,
              staffName: profile?.fullName,
              note: reason || 'Flagged for vet review',
            })
          ),
        });
      });
    } catch (e) {
      setDispenseHoldToast({ open: true, message: `Flag Error: ${e.message}`, severity: 'error' });
    }
  };

  // T3.36 — Resolve an existing dispensingHold. Removes the hold field and emits
  // a FLAG_RESOLVED pulse event, restoring the normal VERIFY ITEMS flow.
  const handleDispenseResolve = async (row, note) => {
    try {
      await runTransaction(db, async (transaction) => {
        const apptRef = doc(db, 'appointments', row.id);
        const apptDoc = await transaction.get(apptRef);
        if (!apptDoc.exists()) throw new Error('Appointment not found.');
        transaction.update(apptRef, {
          dispensingHold: deleteField(),
          clinicalPulse: arrayUnion(
            createPulseEvent('FLAG_RESOLVED', {
              staffId: profile?.id,
              staffName: profile?.fullName,
              note: note || 'Hold resolved',
            })
          ),
        });
      });
    } catch (e) {
      setDispenseHoldToast({ open: true, message: `Resolve Error: ${e.message}`, severity: 'error' });
    }
  };

  // Openers passed through the actions object to queueColumns
  const openDispenseFlagDialog = (row) => {
    setDispenseFlagTarget(row);
    setDispenseReasonText('');
    setDispenseFlagDialogOpen(true);
  };

  const openDispenseResolveDialog = (row) => {
    setDispenseFlagTarget(row);
    setDispenseReasonText('');
    setDispenseResolveDialogOpen(true);
  };

  const handleStatusChange = async (row, newStatus) => {
    try { 
      // --- ðŸ›¡ï¸ CLINICAL REALITY PRE-CHECK ---
      if (newStatus === 'confirmed') {
        const services = row.services || [];
        const missingDepts = [...new Set(
          services
            .map(svc => svc.department || 'General')
            .filter(dept => !vets.some(v => v.departments?.includes(dept) || v.role?.toLowerCase() === dept.toLowerCase()))
        )];

        if (missingDepts.length > 0) {
          setStaffGapDepts(missingDepts);
          setStaffGapDialogOpen(true);
          return;
        }
      }

      await changeStatus(row, newStatus, clinicSettings);
    } catch (e) { 
      alert(e.message); 
    } 
  };
  const handleEditOpen = () => {
    if (selectedRow) {
      setEditName(selectedRow.ownerName || '');
      setEditPet(selectedRow.petName || '');
      setEditSpecies(selectedRow.petSpecies || 'Canine');
      setEditBreed(selectedRow.petBreed || '');
      setEditGender(selectedRow.petGender || 'Male');
      setEditIsNeutered(selectedRow.petIsNeutered || false);
      setEditPhone(selectedRow.ownerPhone || '');
      setEditColor(selectedRow.color || selectedRow.petColor || '');
      
      const rawDob = selectedRow.petBirthdate;
      if (rawDob) {
        const d = rawDob.toDate();
        setEditDob(d.toISOString().split('T')[0]);
      } else {
        setEditDob('');
      }
      
      setEditDobMode(selectedRow.isAgeExact === false ? 'approximate' : (rawDob ? 'exact' : 'unknown'));
      setEditEstYears('');
      setEditEstMonths('');
      
      setOpenEdit(true);
      handleCloseMenu();
    }
  };

  const saveEdit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      let finalDob = null;
      let finalIsAgeExact = true;

      if (editDobMode === 'exact') {
        finalDob = editDob ? Timestamp.fromDate(new Date(editDob)) : null;
        finalIsAgeExact = true;
      } else if (editDobMode === 'approximate') {
        const years = parseInt(editEstYears) || 0;
        const months = parseInt(editEstMonths) || 0;
        const d = new Date();
        d.setFullYear(d.getFullYear() - years);
        d.setMonth(d.getMonth() - months);
        d.setDate(1); 
        d.setHours(0, 0, 0, 0);
        finalDob = Timestamp.fromDate(d);
        finalIsAgeExact = false;
      } else {
        finalDob = null;
        finalIsAgeExact = false;
      }

      // T2.51: Build changedFields by comparing current vs new values for the pulse note.
      const changedFields = [];
      if (editName !== selectedRow.ownerName) changedFields.push('ownerName');
      if (editPet !== selectedRow.petName) changedFields.push('petName');
      if (editSpecies !== selectedRow.petSpecies) changedFields.push('petSpecies');
      if (editBreed !== selectedRow.petBreed) changedFields.push('petBreed');
      if (editGender !== selectedRow.petGender) changedFields.push('petGender');
      if (editIsNeutered !== selectedRow.petIsNeutered) changedFields.push('petIsNeutered');
      if (editPhone !== selectedRow.ownerPhone) changedFields.push('ownerPhone');
      if (editColor !== (selectedRow.color || selectedRow.petColor || '')) changedFields.push('color');

      await updateDoc(doc(db, "appointments", selectedRow.id), {
        ownerName: editName,
        petName: editPet,
        petSpecies: editSpecies,
        petBreed: editBreed,
        petGender: editGender,
        petIsNeutered: editIsNeutered,
        ownerPhone: editPhone,
        color: editColor,
        petBirthdate: finalDob,
        isAgeExact: finalIsAgeExact,
        clinicalPulse: arrayUnion({
          // T2.54: IDENTITY_HEALING distinguishes quick-admit ER corrections (placeholder
          // name → real patient) from routine edits, for audit trail clarity.
          // T3.70: Check systemChips first (new), fall back to legacy string parse.
          eventId: makePulseEventId(
            (selectedRow.systemChips || []).includes('QUICK-ADMIT') || selectedRow.notes?.includes('QUICK ADMIT')
              ? 'identity-healing'
              : 'identity-edit'
          ),
          type: (selectedRow.systemChips || []).includes('QUICK-ADMIT') || selectedRow.notes?.includes('QUICK ADMIT')
            ? 'IDENTITY_HEALING'
            : 'IDENTITY_EDIT',
          timestamp: Timestamp.now(),
          staffId: profile?.id || 'unknown',
          staffName: profile?.fullName || 'System',
          note: changedFields.length > 0
            ? `Identity fields edited: ${changedFields.join(', ')}`
            : 'Identity record accessed (no changes detected)',
        }),
      });
      setOpenEdit(false);
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  };
  const handleRescheduleOpen = () => { 
    setAuditReason(""); // RESET FOR NEW ACTION
    setOpenReschedule(true); 
    handleCloseMenu(); 
  };
  const handleDeferOpen = (row) => {
    setSelectedRow(row || selectedRow);
    setAuditReason("");
    setOpenDefer(true);
    handleCloseMenu();
  };
  const handleNoShowOpen = (row) => {
    setSelectedRow(row || selectedRow);
    setAuditReason("");
    setOpenNoShow(true);
    handleCloseMenu();
  };
  const revertStatusWithReason = async (row) => {
    setSelectedRow(row);
    setRevertReason(""); // Reset for new forensic session
    setOpenRevert(true);
  };

  const confirmRevert = async () => {
    if (!revertReason.trim() || submitting) return;
    setSubmitting(true);
    try {
      await revertStatus({ ...selectedRow, revertReason: revertReason });
      setOpenRevert(false);
      handleCloseMenu();
    } catch (e) { alert(e.message); }
    finally { setSubmitting(false); }
  };

  const saveReschedule = async () => {
    if (!newDate || !auditReason.trim() || submitting) return;
    setSubmitting(true);
    const staffSignature = profile?.fullName || user?.email || 'System Triage';

    try {
      const currentSchDate = selectedRow.scheduledDate
        ? selectedRow.scheduledDate.toDate()
        : (selectedRow.createdAt?.toDate() || new Date());
      const updatedSchDate = new Date(newDate);

      // GAP B FIX: The Reliability Highlight (Day-Slip Detection)
      const currentDayStr = currentSchDate.toISOString().split('T')[0];
      const updatedDayStr = updatedSchDate.toISOString().split('T')[0];

      const isCarryOver = selectedRow.status === 'arrived' ||
                          selectedRow.status === 'in-consult' ||
                          selectedRow.status === 'confined' ||
                          selectedRow.status === 'on-hold' ||
                          selectedRow.status === 'dispensing' ||
                          selectedRow.status === 'billing';

      let additionalWaitMins = 0;
      if (isCarryOver) {
        const arr = selectedRow.timeArrived?.toDate() || selectedRow.jsScheduled?.toDate() || new Date();
        additionalWaitMins = Math.round((new Date() - arr) / 60000);
      }

      const pulseEvent = {
        eventId: makePulseEventId('shift'),
        type: 'STATUS_CHANGE',
        toStatus: isCarryOver ? 'carried-over' : 'confirmed',
        shiftNote: 'shifted',
        timestamp: Timestamp.now(), // CLIENT-SIDE CLOCK — see W1 in pulseUtils.js
        staffId: profile?.id || 'unknown',
        staffName: staffSignature,
        note: isCarryOver
          ? `CLINICAL CARRY-OVER to ${updatedDayStr} [Wait: ${additionalWaitMins}m] (Reason: ${auditReason})`
          : `Manual Clinical Shift to ${updatedDayStr} (Reason: ${auditReason})`
      };

      if (!isCarryOver) {
        // === BRANCH 1: SIMPLE RESCHEDULE (pending/confirmed) ===
        // Wraps in a transaction for fresh-read terminal guard — prevents double-reschedule
        // or reschedule of a record resolved between dialog open and submit.
        const apptRef = doc(db, "appointments", selectedRow.id);

        await runTransaction(db, async (transaction) => {
          const freshSnap = await transaction.get(apptRef);
          if (!freshSnap.exists()) throw new Error("Appointment not found.");
          const freshData = freshSnap.data();
          const freshStatus = (freshData.status || '').toLowerCase();

          if (TERMINAL_STATUSES.has(freshStatus)) {
            throw new Error(`Record already resolved (status: ${freshStatus}). Cannot reschedule.`);
          }

          transaction.update(apptRef, {
            scheduledDate: Timestamp.fromDate(updatedSchDate),
            status: 'confirmed',
            statusHistory: [...(freshData.statusHistory || []), freshData.status],
            rescheduledBy: staffSignature,
            clinicalPulse: arrayUnion(pulseEvent),
            auditReason: auditReason,
            auditReasons: arrayUnion({
              reason: auditReason,
              action: 'reschedule',
              staffName: staffSignature,
              timestamp: Timestamp.now()
            }),
            accumulatedWaitMins: (selectedRow.accumulatedWaitMins || 0) + additionalWaitMins,
          });
        });

        // T4.90: Push notification — rescheduled (simple)
        sendPushNotification({
          ownerId: selectedRow.ownerId,
          status: 'confirmed',
          petName: selectedRow.petName,
          vetName: profile?.fullName || 'Staff',
          appointmentId: selectedRow.id,
          customTitle: 'Appointment Rescheduled',
          customBody: `Your appointment for ${selectedRow.petName || 'your pet'} has been rescheduled to ${updatedSchDate.toLocaleDateString()}.`,
          sentBy: profile?.fullName || 'Staff',
        });

        // T4.126: Update appointment reminder queue with new date — fire-and-forget
        updateAppointmentQueueDate(
          selectedRow.id,
          Timestamp.fromDate(updatedSchDate),
          selectedRow,
        ).catch(() => {});

      } else {
        // === BRANCH 2: FULL CLINICAL CARRY-OVER (active patients) ===
        // Replicates EOD carry-over pattern: old record is sealed and terminated;
        // a new clone document is created for the rescheduled date with a fresh pulse chain.
        const apptRef = doc(db, "appointments", selectedRow.id);

        const freshSnap = await getDoc(apptRef);
        if (!freshSnap.exists()) throw new Error("Appointment not found.");
        const freshData = freshSnap.data();
        const freshStatus = (freshData.status || '').toLowerCase();

        if (TERMINAL_STATUSES.has(freshStatus)) {
          throw new Error(`Record already resolved (status: ${freshStatus}). Cannot carry over.`);
        }

        // Forensic seal — freeze metrics at the exact moment of carry-over
        const forensicSeal = calculatePulseMetrics(
          freshData.clinicalPulse || [],
          clinicSettings,
          freshData.createdAt,
          new Date()
        );

        // T3.70: Structured notes propagation — dual-read from new or legacy `notes`
        const carryStaffNotes = freshData.staffNotes || freshData.notes || "";
        const carryClientNotes = freshData.clientNotes || "";
        const existingChips = freshData.systemChips || [];
        const triagePrefix = '[Clinical Triage: CARRY-OVER]';

        // Strip all temporal, forensic, and attribution fields from the clone.
        // Explicit overrides below further ensure correctness (spread-then-override).
        const {
          id: _id,
          jsScheduled, jsArrived, jsStarted, jsCompleted,
          queueNumber: _qn, ticketPrefix: _tp,
          timeArrived, timeStarted, timeCompleted,
          isTriaged: _oldIsTriaged,
          notes: _legacyNotes,
          status: _oldStatus,
          statusHistory: _oldHistory,
          clinicalPulse: _oldPulse,
          forensicSeal: _oldSeal,
          processedBy: _oldProcessedBy,
          processedAt: _oldProcessedAt,
          auditReason: _oldAuditReason,
          auditReasons: _oldAuditReasons,
          rescheduledBy: _oldRescheduledBy,
          accumulatedWaitMins: _oldAccum,
          assignedVet: _oldAssignedVet,
          assignedVetId: _oldAssignedVetId,
          signedOffAt: _oldSignedOffAt,
          encounterItems: _oldEncounterItems,
          encounterItemsVersion: _oldEncounterItemsVersion,
          finalTotal: _oldFinalTotal,
          ...preservedData
        } = freshData;

        const batch = writeBatch(db);

        // OLD RECORD: Seal and terminate with forensic stamp
        batch.update(apptRef, {
          status: 'carried-over',
          statusHistory: [...(freshData.statusHistory || []), freshData.status],
          forensicSeal,
          isTriaged: true,
          systemChips: arrayUnion('CARRY-OVER'),
          processedBy: staffSignature,
          processedAt: Timestamp.now(),
          auditReason: auditReason,
          auditReasons: arrayUnion({
            reason: auditReason,
            action: 'inline-carryover',
            staffName: staffSignature,
            timestamp: Timestamp.now()
          }),
          clinicalPulse: arrayUnion(pulseEvent), // pulse with toStatus: 'carried-over'
          rescheduledBy: staffSignature,
        });

        // NEW CLONE: Fresh record for the rescheduled date
        const newDocRef = doc(collection(db, "appointments"));

        batch.set(newDocRef, {
          ...preservedData,
          status: 'confirmed',
          scheduledDate: Timestamp.fromDate(updatedSchDate),
          createdAt: freshData.createdAt || Timestamp.now(),
          originApptId: selectedRow.id,
          caseDay: (selectedRow.caseDay || 1) + 1,
          queueNumber: null,
          ticketPrefix: null,
          clientNotes: carryClientNotes,
          staffNotes: carryStaffNotes,
          systemChips: [...existingChips.filter(c => c !== 'CARRY-OVER'), 'CARRY-OVER'],
          assignedVet: 'Unassigned',
          assignedVetId: null,
          processedBy: staffSignature,
          rescheduledBy: staffSignature,
          accumulatedWaitMins: (selectedRow.accumulatedWaitMins || 0) + additionalWaitMins,
          auditReason: auditReason,
          auditReasons: [{
            reason: auditReason,
            action: 'inline-carryover-clone',
            staffName: staffSignature,
            timestamp: Timestamp.now()
          }],
          clinicalPulse: [
            {
              eventId: makePulseEventId('inception'),
              type: 'INCEPTION',
              toStatus: 'confirmed',
              timestamp: Timestamp.now(), // CLIENT-SIDE CLOCK — see W1 in pulseUtils.js
              staffId: profile?.id || user?.uid || 'unknown',
              staffName: staffSignature,
              note: `Generated via Inline Carry-Over from Appt ${selectedRow.id} — Wait: ${additionalWaitMins}m (Reason: ${auditReason})`
            }
          ],
        });

        await batch.commit();

        // T4.90: Push notification — carry-over (active patient rescheduled)
        sendPushNotification({
          ownerId: selectedRow.ownerId,
          status: 'carried-over',
          petName: selectedRow.petName,
          vetName: profile?.fullName || 'Staff',
          appointmentId: selectedRow.id,
          customTitle: 'Visit Carried Over',
          customBody: `${selectedRow.petName || 'Your pet'}'s visit has been rescheduled to ${updatedSchDate.toLocaleDateString()}. Your progress is preserved.`,
          sentBy: profile?.fullName || 'Staff',
        });

        // T4.126: Remove old record from queue; add clone — fire-and-forget
        removeAppointmentQueueDoc(selectedRow.id).catch(() => {});
        writeAppointmentQueueDoc({
          id:            newDocRef.id,
          petName:       selectedRow.petName,
          ownerName:     selectedRow.ownerName,
          ownerId:       selectedRow.ownerId,
          scheduledDate: Timestamp.fromDate(updatedSchDate),
        }).catch(() => {});
      }

      setOpenReschedule(false);
      setAuditReason("");
    } catch (e) {
      alert("Reschedule failed: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const saveDefer = async () => {
    if (!auditReason.trim() || submitting) return;
    setSubmitting(true);
    try {
        await deferAppointment(selectedRow.id, auditReason, undefined, clinicSettings);
        setOpenDefer(false);
        setAuditReason("");
    } catch (e) { alert(e.message); }
    finally { setSubmitting(false); }
  };

  const saveNoShow = async () => {
    if (!auditReason.trim() || submitting) return;
    setSubmitting(true);
    try {
        await markNoShow(selectedRow, auditReason, clinicSettings);
        setOpenNoShow(false);
        setAuditReason("");
    } catch (e) { alert(e.message); }
    finally { setSubmitting(false); }
  };
  const handleOpenEMR = () => {
    if (!selectedRow?.petId) {
      setDispenseHoldToast({ open: true, message: 'Walk-in account required — no pet history available', severity: 'info' });
      handleCloseMenu();
      return;
    }
    setEmrPetId(selectedRow.petId);
    setEmrPetName(selectedRow.petName || '');
    setEmrPetSpecies(selectedRow.petSpecies || '');
    setEmrDrawerOpen(true);
    handleCloseMenu();
  };
  const confirmReject = async () => {
    if (!selectedRow || submitting) return;
    setSubmitting(true);
    try {
      const rawStatus = (selectedRow.status || 'unknown').toLowerCase();
      const isHighStakes = HIGH_STAKES_STATUSES.has(rawStatus);

      await rejectAppointment(selectedRow.id, rejectReason, selectedRow.services, isHighStakes, clinicSettings, selectedRow);
      setOpenReject(false);
      setRejectReason('');
    } catch (err) { alert(err.message); }
    finally { setSubmitting(false); }
  };

  // ======================================================================
  // DATA FETCHING & EFFECTS
  // ======================================================================
  
  // ======================================================================
  // UNIFIED GHOST DETECTOR (Consolidated from 3 former hooks)
  // Detects past-day unresolved appointments and triggers the Triage Wizard.
  // Ghost-Only Mode: Does NOT merge with today's active rows.
  // Hybrid Banner: Auto-opens modal only when isToday; sets hasGhostPatients
  //   for the tomorrow-view warning banner.
  // ======================================================================
  useEffect(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = getLocalDateStr();

    const qGhosts = query(
      collection(db, "appointments"),
      where("status", "in", [
        "pending", "confirmed", "arrived", "in-consult",
        "confined", "on-hold", "dispensing", "billing"
      ])
    );

    const unsubGhosts = onSnapshot(qGhosts, async (snapshot) => {
      const rawGhosts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const ghosts = rawGhosts.filter(appt => {
        if (appt.isTriaged === true) return false;
        if (appt.triageDate && appt.triageDate >= todayStr) return false;

        let checkDate;
        if (appt.scheduledDate?.toDate) checkDate = appt.scheduledDate.toDate();
        else if (appt.scheduledDate) checkDate = new Date(appt.scheduledDate);
        else checkDate = appt.createdAt?.toDate ? appt.createdAt.toDate() : new Date();

        const finalCheck = new Date(checkDate);
        finalCheck.setHours(0, 0, 0, 0);
        return finalCheck < todayStart;
      });

      if (ghosts.length === 0) {
        setHasGhostPatients(false);
        setOpenEndDay(false);
        setIsForcedCleanup(false);
        setLeftoverPatients([]);
        setPatientResolutions({});
        setTouchedPatients(new Set());
        setAuditReasons({});
        setTargetDates({});
        setTargetTimes({});
        return;
      }

      // Always flag for the tomorrow-view banner
      setHasGhostPatients(true);

      // Only open the modal when viewing today's shift
      if (!isToday) return;

      // Identity healing: enrich ghost records with pet metadata
      const enrichedGhosts = await Promise.all(ghosts.map(async (p) => {
        try {
          if (p.petId && (!p.petGender || p.petGender === 'Unknown' || p.petGender === '???')) {
            const petSnap = await getDoc(doc(db, 'pets', p.petId));
            if (petSnap.exists()) {
              const petData = petSnap.data();
              return {
                ...p,
                petGender: petData.gender || petData.sex || p.petGender,
                petBreed: petData.breed || p.petBreed,
                petIsNeutered: petData.isNeutered ?? p.petIsNeutered
              };
            }
          }
        } catch (e) {
          console.error('Ghost Identity Restoration failed:', p.id, e);
        }
        return p;
      }));

      // Ghost-Only: no merge with today's rows
      setLeftoverPatients(enrichedGhosts);

      // Initialize default resolutions
      setPatientResolutions(prev => {
        const updated = { ...prev };
        enrichedGhosts.forEach(p => {
          if (!updated[p.id]) {
            const rawStatus = (p.status || 'unknown').toLowerCase();
            const isHighStakes = HIGH_STAKES_STATUSES.has(rawStatus);

            if (rawStatus === 'pending') updated[p.id] = 'defer';
            else if (isHighStakes) updated[p.id] = null;
            else updated[p.id] = 'cancel';
          }
        });
        return updated;
      });

      setTouchedPatients(prev => {
        const updated = new Set(prev);
        enrichedGhosts.forEach(p => {
          if ((p.status || '').toLowerCase() === 'pending') updated.add(p.id);
        });
        return updated;
      });

      setAuditReasons({});
      setTargetDates({});
      setTargetTimes({});

      setIsForcedCleanup(true);
      setOpenEndDay(true);
    }, (error) => {
      console.error("Unified Ghost Listener Error:", error);
    });

    return () => unsubGhosts();
  }, [isToday]);

  // THE MAIN BOARD QUERY
  // Two scoped Firestore queries replace the former unbounded collection scan:
  //   1. scheduledQuery — date-window query for all appointments on filterDate
  //   2. pendingQuery   — pending-only query; client-filtered by triageDate so
  //      online inbox requests appear in the right shift silo.
  // Both listeners write into a shared Map keyed by appointment ID so there
  // are no duplicates when an appointment appears in both result sets.
  useEffect(() => {
    const startOfDay = new Date(filterDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(filterDate);
    endOfDay.setHours(23, 59, 59, 999);
    const filterDateStr = filterDate; // e.g. "2026-04-02"

    // Shared accumulator — lets both listeners commit their slice and
    // trigger a single merged render each time either one fires.
    const apptMap = new Map();

    /**
     * Normalizes a raw Firestore document into the shape the board expects.
     * Preserves ALL enrichment logic from the former single-listener approach.
     */
    const enrichDoc = (docSnapshot) => {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        ...data,
        // Normalize legacy status aliases (e.g. 'dispense' -> 'dispensing') for
        // backward compatibility with old Firestore documents.
        status: normalizeStatus(data.status),
        jsScheduled: data.scheduledDate?.toDate(),
        jsArrived: data.timeArrived?.toDate(),
        jsStarted: data.timeStarted?.toDate(),
        jsCompleted: data.timeCompleted?.toDate(),
      };
    };

    /**
     * Client-side filter applied after both queries deliver their data.
     * Identical logic to the former single-listener filter.
     */
    const passesFilter = (appt) => {
      const start = startOfDay;
      const end = endOfDay;

      // Pending appointments: route by triageDate (not scheduledDate) so
      // online inbox requests always land in the correct shift silo.
      if (appt.status === 'pending') {
        const triageDate = appt.triageDate || appt.createdAt?.toDate()?.toISOString().split('T')[0] || filterDateStr;
        return triageDate === filterDateStr;
      }

      // For all non-pending statuses, keep the strict scheduledDate pulse.
      // PHASE 4.4.4: THE TEMPORAL HEALER - Hide rescheduled records from 'Today'
      // if they were accidentally created for the past.
      // PHASE 4.4.10: DEEP CLEAN - Also hide legacy triage notes to clear 'Old Ghosts'.
      // T3.70: Check systemChips (new) first, then legacy notes string parse.
      const isTriagedRecord =
        appt.isTriaged === true ||
        (appt.systemChips || []).some(c => c === 'CARRY-OVER' || c === 'DEFERRED') ||
        appt.notes?.includes('[Triage Reschedule]') ||
        appt.notes?.includes('[Clinical Triage:');

      if (isTriagedRecord) {
        // THE IDENTITY RESURRECTION: If the record is scheduled for the
        // dashboard's current shift or the future, show it even if it has
        // triage stamps from its history.
        const apptDate = appt.jsScheduled || (appt.createdAt?.toDate ? appt.createdAt.toDate() : new Date());
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (apptDate < today) return false;
      }

      return appt.jsScheduled >= start && appt.jsScheduled <= end;
    };

    /**
     * Builds the sorted, grouped row list from the current Map contents
     * and commits it to state. Called by both listener callbacks so the
     * board re-renders whenever either query delivers new data.
     */
    const flushToRows = () => {
      const list = Array.from(apptMap.values()).filter(passesFilter);

      const isEmergency = (item) =>
        item.ticketPrefix === 'E' || item.priority === 'emergency' || item.priority === 'high';

      list.sort((a, b) => {
        if (isEmergency(a) && !isEmergency(b)) return -1;
        if (!isEmergency(a) && isEmergency(b)) return 1;
        const priorityA = a.priority === 'high' ? 0 : 1;
        const priorityB = b.priority === 'high' ? 0 : 1;
        if (priorityA !== priorityB) return priorityA - priorityB;
        const timeA = a.jsScheduled ? a.jsScheduled.getTime() : (a.createdAt?.toDate().getTime() || 0);
        const timeB = b.jsScheduled ? b.jsScheduled.getTime() : (b.createdAt?.toDate().getTime() || 0);
        if (timeA !== timeB) return timeA - timeB;
        return (a.ownerId || '').localeCompare(b.ownerId || '');
      });

      const processedList = list.map(item => ({ ...item, isStandalone: true }));

      setRows(processedList);
    };

    // --- LISTENER 1: Date-scoped query for scheduled/active appointments ---
    // Covers every status that carries a meaningful scheduledDate (confirmed,
    // arrived, in-consult, dispensing, billing, completed, carried-over, etc.)
    const scheduledQuery = query(
      collection(db, 'appointments'),
      where('scheduledDate', '>=', Timestamp.fromDate(startOfDay)),
      where('scheduledDate', '<=', Timestamp.fromDate(endOfDay))
    );

    const unsubScheduled = onSnapshot(scheduledQuery, (snapshot) => {
      snapshot.docs.forEach((docSnapshot) => {
        apptMap.set(docSnapshot.id, enrichDoc(docSnapshot));
      });
      // Remove any IDs that are no longer in this query result
      // (e.g. appointment was rescheduled out of today's window).
      const currentIds = new Set(snapshot.docs.map((d) => d.id));
      for (const id of apptMap.keys()) {
        const entry = apptMap.get(id);
        if (entry.status !== 'pending' && !currentIds.has(id)) {
          apptMap.delete(id);
        }
      }
      flushToRows();
    });

    // --- LISTENER 2: Pending-only query scoped to the triage inbox ---
    // Online appointment requests do not always have a scheduledDate matching
    // today; they are routed by triageDate instead. The passesFilter() function
    // handles the final date-match check client-side.
    const pendingQuery = query(
      collection(db, 'appointments'),
      where('status', '==', 'pending')
    );

    const unsubPending = onSnapshot(pendingQuery, (snapshot) => {
      // Track which IDs this query owns so we can evict stale entries.
      const pendingIds = new Set(snapshot.docs.map((d) => d.id));

      snapshot.docs.forEach((docSnapshot) => {
        apptMap.set(docSnapshot.id, enrichDoc(docSnapshot));
      });

      // Evict pending entries that have since transitioned to another status
      // (they will now appear via the scheduledQuery instead).
      for (const id of apptMap.keys()) {
        const entry = apptMap.get(id);
        if (entry.status === 'pending' && !pendingIds.has(id)) {
          apptMap.delete(id);
        }
      }

      flushToRows();
    });

    return () => {
      unsubScheduled();
      unsubPending();
    };
  }, [filterDate]);
  


  useEffect(() => {
    const unsubVets = onSnapshot(collection(db, "users"), (snapshot) => setVets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(u => !u.disabled && ['admin', 'staff', 'veterinarian', 'groomer'].includes(u.accessLevel))));
    const unsubInv = onSnapshot(collection(db, "inventory"), (snapshot) => setInventoryList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const unsubCat = onSnapshot(collection(db, "inventory_categories"), (snapshot) => setInventoryCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const unsubServ = onSnapshot(collection(db, "services"), (snapshot) => setServicesList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(s => !s.isArchived)));
    const unsubDepts = onSnapshot(collection(db, "departments"), (snapshot) => setDepartments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    return () => { unsubVets(); unsubInv(); unsubCat(); unsubServ(); unsubDepts(); };
  },[]);

  // 🧬 THE FORENSIC INVENTORY JOIN
  // Attaches the 'isMedicine' flag to each product based on its category taxonomy.
  const joinedInventory = useMemo(() => {
    return inventoryList
      .filter(item => !item.isArchived)
      .map(item => {
        const catObj = inventoryCategories.find(c => c.name?.toLowerCase() === item.category?.toLowerCase());
        return {
          ...item,
          isMedicine: catObj ? !!catObj.isMedicine : false,
          productClass: catObj?.productClass || (catObj?.isMedicine ? 'medicine' : 'retail'),
        };
      });
  }, [inventoryList, inventoryCategories]);

  useEffect(() => {
    const interval = setInterval(() => { 
      setCurrentTime(new Date()); 
    }, 60000);
    return () => clearInterval(interval);
  },[]);

  // ======================================================================
  // RENDER & UI CALCULATIONS
  // ======================================================================
  const { countOnline, countScheduled, countArrived, countStarted, countDispense, countPayment, countDone, countCancelled } = useMemo(() => {
    return {
      countOnline: rows.filter(r => r.status === 'pending' && (isToday ? !r.isTriaged : true)).length,
      countScheduled: rows.filter(r => r.status === 'confirmed' && r.status !== 'carried-over' && (isToday ? !r.isTriaged : true)).length,
      countArrived: rows.filter(r => r.status === 'arrived' && r.status !== 'carried-over' && (isToday ? !r.isTriaged : true)).length,
      countStarted: rows.filter(r => (r.status === 'in-consult' || r.status === 'confined' || r.status === 'on-hold') && r.status !== 'carried-over' && (isToday ? !r.isTriaged : true)).length,
      countDispense: rows.filter(r => r.status === 'dispensing' && r.status !== 'carried-over' && (isToday ? !r.isTriaged : true)).length,
      countPayment: rows.filter(r => r.status === 'billing' && r.status !== 'carried-over' && (isToday ? !r.isTriaged : true)).length,
      countDone: rows.filter(r => r.status === 'completed' || r.status === 'carried-over' || (r.isTriaged && r.status === 'pending')).length,
      countCancelled: rows.filter(r => r.status === 'cancelled' || r.status === 'no-show').length,
    };
  }, [rows]);

  // T3.10b — Derive recently resolved rows from the already-loaded dataset, sorted most-recent first
  const recentlyResolved = useMemo(() => {
    return rows
      .filter(r => ['completed', 'cancelled', 'no-show'].includes(r.status))
      .sort((a, b) => {
        const aTime = a.timeCompleted?.toDate?.() || a.timeRejected?.toDate?.() || a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.timeCompleted?.toDate?.() || b.timeRejected?.toDate?.() || b.createdAt?.toDate?.() || new Date(0);
        return bTime - aTime;
      });
  }, [rows]);

  const unfinishedCount = countOnline + countScheduled + countArrived + countStarted + countDispense + countPayment;

  const getFilteredRows = () => {
    let filtered = [];
    switch (tabValue) {
      case 0: filtered = rows.filter(r => r.status === 'pending' && (isToday ? !r.isTriaged : true)); break;
      case 1: filtered = rows.filter(r => r.status === 'confirmed' && r.status !== 'carried-over' && (isToday ? !r.isTriaged : true)); break;
      case 2: filtered = rows.filter(r => r.status === 'arrived' && r.status !== 'carried-over' && (isToday ? !r.isTriaged : true)); break;
      case 3: filtered = rows.filter(r => (r.status === 'in-consult' || r.status === 'confined' || r.status === 'on-hold') && r.status !== 'carried-over' && (isToday ? !r.isTriaged : true)); break;
      case 4: filtered = rows.filter(r => r.status === 'dispensing' && r.status !== 'carried-over' && (isToday ? !r.isTriaged : true)); break;
      case 5: filtered = rows.filter(r => r.status === 'billing' && r.status !== 'carried-over' && (isToday ? !r.isTriaged : true)); break;
      case 6: filtered = rows.filter(r => r.status === 'completed' || r.status === 'carried-over' || (r.isTriaged && r.status === 'pending')); break;
      case 7: filtered = rows.filter(r => r.status === 'cancelled' || r.status === 'no-show'); break;
      default: filtered = rows;
    }

    // GLOBAL PATIENT SEARCH (T3.10d) — client-side, 2-char minimum, all tabs
    if (queueSearchText.trim().length >= 2) {
      const q = queueSearchText.trim().toLowerCase();
      filtered = filtered.filter(r =>
        (r.petName || '').toLowerCase().includes(q) ||
        (r.ownerName || '').toLowerCase().includes(q) ||
        (r.ownerPhone || '').includes(q)
      );
    }

    // --- 🧬 FORENSIC SORTING ENGINE (PHASE 5.5) ---
    if (tabValue === 0) {
      // 0: ONLINE - Strictly FCFS (Oldest Intake First)
      return [...filtered].sort((a, b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return da - db;
      });
    }

    if (tabValue === 1) {
      // 1: SCHEDULED - Strictly Chronological by Precision Slot (Ignoring Priority)
      return [...filtered].sort((a, b) => {
        const timeA = a.jsScheduled?.getTime?.() || a.jsScheduled?.seconds * 1000 || 0;
        const timeB = b.jsScheduled?.getTime?.() || b.jsScheduled?.seconds * 1000 || 0;
        return timeA - timeB;
      });
    }

    if (tabValue === 2) {
      // 2: ARRIVED - Priority First, then Arrival Time
      return [...filtered].sort((a, b) => {
        const pA = a.priority === 'high' ? 0 : 1;
        const pB = b.priority === 'high' ? 0 : 1;
        if (pA !== pB) return pA - pB;
        const timeA = a.jsArrived?.getTime?.() || a.jsArrived?.seconds * 1000 || (a.createdAt?.toDate?.() || new Date()).getTime();
        const timeB = b.jsArrived?.getTime?.() || b.jsArrived?.seconds * 1000 || (b.createdAt?.toDate?.() || new Date()).getTime();
        return timeA - timeB;
      });
    }

    if (tabValue === 3) {
      // 3: ACTIVE (Confined/Consult) - Priority First, then Start/Inception Time
      return [...filtered].sort((a, b) => {
        const pA = a.priority === 'high' ? 0 : 1;
        const pB = b.priority === 'high' ? 0 : 1;
        if (pA !== pB) return pA - pB;
        const timeA = a.jsStarted?.getTime?.() || a.jsStarted?.seconds * 1000 || (a.createdAt?.toDate?.() || new Date()).getTime();
        const timeB = b.jsStarted?.getTime?.() || b.jsStarted?.seconds * 1000 || (b.createdAt?.toDate?.() || new Date()).getTime();
        return timeA - timeB;
      });
    }

    return filtered;
  };

  const tableColumns = getQueueColumns(tabValue, currentTime, {
    handleStatusChange,
    handleOpenAssign,
    setSelectedId,
    setOpenReject,
    handleOpenConsult,
    handleOpenPOS,
    handleMenuClick,
    handleHoverStart,
    handleHoverEnd,
    handleQuickNoShow: (row) => handleNoShowOpen(row),
    handleRescheduleOpen: (row) => { setSelectedRow(row); handleRescheduleOpen(); },
    handleDefer: (row) => handleDeferOpen(row),
    handleOpenDispenseVerify,
    openDispenseFlagDialog,
    openDispenseResolveDialog,
  }, isToday, departments, isTomorrowView, clinicSettings);

  const showClosingWarning = isClosingTime && isToday && unfinishedCount > 0;

  // ======================================================================
  // END-OF-DAY MODAL CALLBACKS (hoisted — hooks must not be inlined in JSX)
  // ======================================================================
  const handleResolutionChange = React.useCallback((id, action, targetDate, targetTime) => {
    setPatientResolutions(prev => ({ ...prev, [id]: action }));
    setTouchedPatients(prev => new Set([...prev, id]));
    if (targetDate) {
      setTargetDates(prev => ({ ...prev, [id]: targetDate }));
    }
    if (targetTime) {
      setTargetTimes(prev => ({ ...prev, [id]: targetTime }));
    }
  }, []);

  const handleAuditReasonChange = React.useCallback((id, reason) => {
    setAuditReasons(prev => ({ ...prev, [id]: reason }));
  }, []);

  const handleBulkResolutionEOD = React.useCallback((action, reason, targetDate, targetTime, siloPatientIds) => {
    // PHASE 4.4.1: UNIVERSAL SILO-AWARE BATCH PROCESSING (Functional Update - NO DEPS)
    setPatientResolutions(prevRes => {
      const newRes = { ...prevRes };
      setAuditReasons(prevReasons => {
        const newReasons = { ...prevReasons };
        setTargetDates(prevDates => {
          const newDates = { ...prevDates };
          setTargetTimes(prevTimes => {
            const newTimes = { ...prevTimes };
            setTouchedPatients(prevTouched => {
              const newTouched = new Set(prevTouched);
              const siloIdSet = siloPatientIds ? new Set(siloPatientIds) : null;

              leftoverPatients.forEach(p => {
                // Scope batch action strictly to the silo it was triggered from
                if (siloIdSet && !siloIdSet.has(p.id)) return;

                const rtStatus = (p.status || "").toLowerCase();
                const isOnline = rtStatus === 'pending';
                const isScheduled = rtStatus === 'confirmed';
                const isActive = ACTIVE_STATUSES.has(rtStatus);

                if (((action === 'defer' || action === 'cancel' || action === 'reschedule') && isOnline) ||
                    ((action === 'no-show' || action === 'reschedule' || action === 'cancel') && isScheduled) ||
                    ((action === 'hospitalize' || action === 'carryover' || action === 'cancel') && isActive)) {
                    newRes[p.id] = action;
                    newReasons[p.id] = reason || "";
                    if (targetDate) newDates[p.id] = targetDate;
                    if (targetTime) newTimes[p.id] = targetTime;
                    newTouched.add(p.id);
                }
              });
              return newTouched;
            });
            return newTimes;
          });
          return newDates;
        });
        return newReasons;
      });
      return newRes;
    });
  }, [leftoverPatients]);

  const handleEndOfDayClose = React.useCallback(() => {
    setOpenEndDay(false);
    setIsForcedCleanup(false);
    setLeftoverPatients([]);
    setPatientResolutions({});
    setTouchedPatients(new Set());
    setAuditReasons({});
    setTargetDates({});
    setTargetTimes({});
  }, []);

  return (
    <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: 'calc(100vh - 24px)', 
        gap: 0, 
        overflow: 'hidden' 
    }}>
      {/* WARNING BANNERS (FLEX-SHRINK: 0) */}
      <Box sx={{ flexShrink: 0 }}>
      {showClosingWarning && (
        <Alert 
          icon={<NightlightRoundIcon sx={{ color: '#FFF' }} />}
          severity="info" 
          variant="filled" 
          sx={{ 
            mb: 2, 
            fontWeight: 'bold', 
            boxShadow: 2, 
            bgcolor: '#1A237E', // The Midnight Clinical Baseline
            '& .MuiAlert-icon': { color: '#FFF' }
          }}
        >
           AFTER-HOURS MODE: You have {unfinishedCount} unresolved clinical record(s) remaining for today's final audit. 🧴✨
        </Alert>
      )}

      {isTomorrowView && hasGhostPatients && (
        <Alert
          icon={<WarningIcon sx={{ color: '#FFF' }} />}
          severity="warning"
          variant="filled"
          sx={{
            mb: 2,
            fontWeight: 'bold',
            boxShadow: 2,
            bgcolor: '#E65100',
            '& .MuiAlert-icon': { color: '#FFF' }
          }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setIsTomorrowView(false)}
              sx={{ fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              SWITCH TO TODAY
            </Button>
          }
        >
          UNRESOLVED CASES DETECTED: There are patients from previous shifts that require clinical triage before starting a new shift.
        </Alert>
      )}

      </Box>

      {/* HEADER CONTROLS (FLEX-SHRINK: 0) */}
      <Box sx={{ flexShrink: 0, mb: 3 }}>
        <Paper sx={{ ...headerFlatStyle, p: 2, display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'center' }}>
        
        {/* LEFT SIDE: Title & Shift Toggle */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', flexGrow: 1 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 1000, color: COLORS.brand, lineHeight: 1.1, textTransform: 'uppercase', letterSpacing: 1 }}>
              QUEUE
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 800, color: isTomorrowView ? COLORS.info : COLORS.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
              {isTomorrowView ? 'NEXT-DAY PREVIEW' : 'ACTIVE CLINICAL SHIFT'}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: COLORS.panelBg, borderRadius: 0, border: `2px solid ${COLORS.accent}`, p: 0.5, boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)' }}>
             <Button
                onClick={() => setIsTomorrowView(false)}
                sx={{
                    fontWeight: '900', color: !isTomorrowView ? '#FFF' : COLORS.accent,
                    bgcolor: !isTomorrowView ? COLORS.accent : 'transparent',
                    '&:hover': { bgcolor: !isTomorrowView ? COLORS.brand : 'rgba(0,0,0,0.04)' },
                    borderRadius: 0, px: 2
                }}
             >
                TODAY
             </Button>
             <Button
                onClick={() => setIsTomorrowView(true)}
                sx={{
                    fontWeight: '900', color: isTomorrowView ? '#FFF' : COLORS.accent,
                    bgcolor: isTomorrowView ? COLORS.info : 'transparent',
                    '&:hover': { bgcolor: isTomorrowView ? '#1565C0' : 'rgba(0,0,0,0.04)' },
                    borderRadius: 0, px: 2
                }}
             >
                TOMORROW
             </Button>
          </Box>

          <Box sx={{ ml: 1 }}>
            <Typography sx={{ fontWeight: '900', color: '#5D4037', fontSize: '1.1rem' }}>
              {new Date(filterDate).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}
            </Typography>
          </Box>
        </Box>
        
        {/* RIGHT SIDE: Counter & Action Buttons */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {/* T3.10d — Global patient search */}
          <TextField
            variant="outlined"
            size="small"
            placeholder="Search patients..."
            value={queueSearchText}
            onChange={(e) => setQueueSearchText(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: COLORS.textMuted }} />
                </InputAdornment>
              ),
              ...(queueSearchText && {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setQueueSearchText('')}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </InputAdornment>
                ),
              }),
            }}
            sx={{
              flex: 1, maxWidth: 350, minWidth: 180,
              '& .MuiOutlinedInput-root': {
                fontWeight: 900,
                fontSize: '0.85rem',
                bgcolor: '#FFF',
                borderRadius: 0,
                '& fieldset': { borderColor: COLORS.border, borderWidth: 2 },
                '&:hover fieldset': { borderColor: COLORS.accent },
                '&.Mui-focused fieldset': { borderColor: COLORS.accent },
              },
            }}
          />
           <Typography variant="body2" sx={{ color: '#5D4037', fontStyle: 'italic', fontWeight: '900', letterSpacing: 0.5, mr: 1 }}>
              {rows.length} {rows.length === 1 ? 'Record' : 'Records'}
           </Typography>

           {/* T3.10b — Recently Resolved toggle chip */}
           {recentlyResolved.length > 0 && (
             <Chip
               icon={<HistoryIcon sx={{ fontSize: 16 }} />}
               label={`${recentlyResolved.length} Resolved`}
               onClick={() => setShowResolved(prev => !prev)}
               variant={showResolved ? 'filled' : 'outlined'}
               sx={{
                 fontWeight: 900,
                 fontSize: '0.75rem',
                 borderColor: '#5D4037',
                 color: showResolved ? '#FFF' : '#5D4037',
                 bgcolor: showResolved ? '#5D4037' : 'transparent',
                 '&:hover': { bgcolor: showResolved ? '#3E2723' : 'rgba(93,64,55,0.08)' },
                 borderRadius: 0,
                 border: '2px solid #5D4037',
                 cursor: 'pointer',
                 height: 32,
               }}
             />
           )}

           {isToday && !isTomorrowView && (
             <Tooltip 
                title={
                  isClosingTime 
                    ? (unfinishedCount > 0 
                        ? "End-of-Day: Opens the Triage Board to resolve remaining patients before closing." 
                        : "End-of-Day: Board is empty. Instantly resets ticket counters for tomorrow.")
                    : (unfinishedCount > 0 
                        ? "Manual Reset: Opens the Triage Board to clear current patients before restarting the queue." 
                        : "Manual Reset: Instantly resets ticket counters to zero (useful for half-days or clearing test data).")
                }
                arrow
                placement="bottom"
             >
               <Box>
                 <Button
                    variant="contained" color="error"
                    onClick={() => initiateResetDay(false)}
                    sx={(isClosingTime && isToday) ? {animation: 'pulse 1.5s infinite', fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5, borderRadius: 0} : { fontWeight: '900', boxShadow: 3, letterSpacing: 0.5, textTransform: 'uppercase', borderRadius: 0 }}
                 >
                    CLEAR AND RESET QUEUE
                 </Button>
               </Box>
             </Tooltip>
           )}

           {isToday && !isTomorrowView && (
             <Button
                variant="contained" startIcon={<PersonAddIcon />}
                sx={{ bgcolor: COLORS.sky, fontWeight: '900', boxShadow: '4px 4px 0px rgba(58, 190, 249, 0.15)', textTransform: 'uppercase', letterSpacing: 0.5, px: 3, borderRadius: 0, border: `2px solid ${COLORS.skyHover}`, '&:hover': { bgcolor: COLORS.skyHover } }}
                onClick={() => setOpenWalkIn(true)}
             >
                Add Walk-In
             </Button>
           )}
           {isToday && !isTomorrowView && (
             <Button
               variant="outlined"
               startIcon={<ShoppingCartIcon />}
               sx={{
                 borderColor: COLORS.sky, color: COLORS.sky, fontWeight: '900',
                 textTransform: 'uppercase', letterSpacing: 0.5, px: 3, borderRadius: 0,
                 borderWidth: 2,
                 '&:hover': { bgcolor: COLORS.chipBlueBg, borderColor: COLORS.skyHover || COLORS.sky },
               }}
               onClick={() => setOpenRetailPOS(true)}
             >
               RETAIL SALE
             </Button>
           )}
        </Box>
      </Paper>
      </Box>

      {/* TABS (FLEX-SHRINK: 0) - ONLY SHOW FOR TODAY */}
      {!isTomorrowView && (
        <Box sx={{ flexShrink: 0, mb: 2 }}>
          <Paper sx={{ ...clinicalFlatStyle, p: 0.5 }}>
            <Tabs 
              value={tabValue} 
              onChange={(e, v) => setTabValue(v)} 
              variant="fullWidth" 
              scrollButtons="auto" 
              TabIndicatorProps={{ style: { display: 'none' } }} 
              sx={{ 
                minHeight: 48, 
                '& .MuiTab-root': { fontWeight: '800', fontSize: '0.85rem', textTransform: 'uppercase', minHeight: 40, py: 1, px: 2.5, m: 0.5, borderRadius: 8, color: '#757575', transition: 'all 0.2s ease', }, 
                '& .Mui-selected': { bgcolor: '#5D4037', color: '#FFF !important', boxShadow: '0 4px 10px rgba(93, 64, 55, 0.3)' } 
              }}
            >
              {[
                <Tab key="online" label={`🌐 Online (${countOnline})`} />,
                <Tab key="scheduled" label={`📅 Scheduled (${countScheduled})`} />,
                <Tab key="arrived" label={`🏃 Arrived (${countArrived})`} />,
                <Tab key="started" label={`▶️ Started (${countStarted})`} />,
                <Tab key="dispense" label={`💊 Dispense (${countDispense})`} />,
                <Tab key="payment" label={`💰 Payment (${countPayment})`} />,
                <Tab key="done" label={`✅ Done (${countDone})`} />,
                <Tab key="cancelled" label={`🚫 Cancelled (${countCancelled})`} />
              ]}
            </Tabs>
          </Paper>
        </Box>
      )}


      {/* RECENTLY RESOLVED PANEL (T3.10b) */}
      {showResolved && recentlyResolved.length > 0 && (
        <Paper sx={{
          ...clinicalFlatStyle,
          p: 2,
          mb: 2,
          flexShrink: 0,
          maxHeight: 280,
          overflow: 'auto',
          border: '2px solid #D7CCC8',
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="overline" sx={{ fontWeight: 900, color: '#5D4037', letterSpacing: 1.5, fontSize: '0.7rem' }}>
              RECENTLY RESOLVED ({recentlyResolved.length})
            </Typography>
            <IconButton size="small" onClick={() => setShowResolved(false)}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>

          <Stack spacing={1}>
            {recentlyResolved.slice(0, 10).map(row => {
              const statusColor = row.status === 'completed' ? '#2E7D32'
                : row.status === 'no-show' ? '#E65100' : '#D32F2F';
              const canUndo = row.statusHistory && row.statusHistory.length > 0
                && (isAdmin || !TERMINAL_STATUSES.has(row.status));
              const resolvedTime = row.timeCompleted?.toDate?.() || row.timeRejected?.toDate?.() || null;

              return (
                <Box
                  key={row.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 1.5,
                    bgcolor: '#FAFAFA',
                    border: '1px solid #EEEEEE',
                    borderRadius: 0,
                    '&:hover': { bgcolor: '#F5F5F5' },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
                    <Chip
                      label={row.status.toUpperCase()}
                      size="small"
                      sx={{
                        fontWeight: 900,
                        fontSize: '0.6rem',
                        height: 20,
                        bgcolor: statusColor,
                        color: '#FFF',
                        borderRadius: 0,
                        minWidth: 80,
                      }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 900, fontSize: '0.85rem', color: '#3E2723' }} noWrap>
                        {row.petName}
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: '#795548', fontSize: '0.7rem' }}>
                        {row.ownerName}{resolvedTime ? ` • ${resolvedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                    <Tooltip title="View in Records">
                      <IconButton
                        size="small"
                        onClick={() => navigate('/records', { state: { dashboardFilter: { searchText: row.petName || '' } } })}
                        sx={{ border: '1px solid #D7CCC8', borderRadius: 0, color: '#1565C0' }}
                      >
                        <AssignmentIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    {canUndo && (
                      <Tooltip title={TERMINAL_STATUSES.has(row.status) ? 'Revert Terminal State (Admin)' : 'Undo Last Status Change'}>
                        <IconButton
                          size="small"
                          onClick={() => revertStatusWithReason(row)}
                          sx={{
                            border: `1px solid ${TERMINAL_STATUSES.has(row.status) ? '#D32F2F' : '#E65100'}`,
                            borderRadius: 0,
                            color: TERMINAL_STATUSES.has(row.status) ? '#D32F2F' : '#E65100',
                          }}
                        >
                          <UndoIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              );
            })}
            {recentlyResolved.length > 10 && (
              <Typography variant="caption" sx={{ fontWeight: 800, color: '#795548', textAlign: 'center', py: 1 }}>
                +{recentlyResolved.length - 10} more resolved records (view in Done / Cancelled tabs)
              </Typography>
            )}
          </Stack>
        </Paper>
      )}

      {/* DATA GRID (FLEX: 1 - THE FILLER) */}
      <Paper sx={{ ...clinicalFlatStyle, flex: 1, minHeight: 0, width: '100%', overflow: 'hidden' }}>
        <DataGrid 
          rows={getFilteredRows()} 
          columns={tableColumns} 
          hideFooter
          disableRowSelectionOnClick
          disableColumnResize
          disableColumnReorder
          disableColumnMenu
          rowHeight={110} 
          columnHeaderHeight={48}
          getRowClassName={(params) => {
            const classes = [];
            const chips = params.row.systemChips || [];
            if (params.row.priority === 'high' || chips.includes('EMERGENCY') || chips.includes('CONFINED')) {
              classes.push('emergency-row');
            } else if (chips.includes('CARRY-OVER') || chips.includes('DEFERRED')) {
              classes.push('carryover-row');
            }
            return classes.join(' ');
          }}
          sx={{
            border: 'none',
            bgcolor: 'transparent',
            '& .MuiDataGrid-columnHeaders': { bgcolor: 'rgba(255, 255, 255, 0.4)', color: '#5D4037', fontWeight: 'bold', fontSize: '1.05rem', borderBottom: '1px solid rgba(255, 255, 255, 0.5)'},
            '& .emergency-row': { bgcolor: 'rgba(255, 235, 238, 0.8)', borderLeft: `4px solid ${COLORS.danger}` },
            '& .carryover-row': { borderLeft: `4px solid ${COLORS.warning}` },
            '& .super-late-row': { bgcolor: 'rgba(255, 243, 224, 0.8)' },
            '& .MuiDataGrid-row:hover': { bgcolor: 'rgba(255, 255, 255, 0.6)' },
            '& .MuiDataGrid-cell': { borderBottom: '1px solid rgba(255, 255, 255, 0.2)' },
            '& .MuiDataGrid-cell[data-field="timing"]': { padding: 0 }
          }} 
        />
      </Paper>

      {/* EXTERNAL MODULES */}
      <ClinicalWorkspace
        open={openConsult}
        onClose={() => setOpenConsult(false)}
        patient={selectedRow}
        inventoryList={joinedInventory}
        servicesList={servicesList}
        departments={departments}
        vetsList={vets}
      />
      <POSModal
        open={openPOS}
        onClose={() => setOpenPOS(false)}
        patient={selectedRow}
        inventoryList={joinedInventory}
        servicesList={servicesList}
        isDayClosed={isDayClosed}
        closingData={closingData}
      />
      <POSModal
        open={openRetailPOS}
        onClose={() => setOpenRetailPOS(false)}
        patient={null}
        inventoryList={joinedInventory}
        servicesList={servicesList}
        isDayClosed={isDayClosed}
        closingData={closingData}
      />
      <DispensingVerificationDialog
        open={openDispenseVerify}
        onClose={() => { setOpenDispenseVerify(false); setDispenseRow(null); }}
        patient={dispenseRow}
        onVerified={handleDispenseVerified}
        staffProfile={profile}
        clinicSettings={clinicSettings}
        inventoryList={joinedInventory}
      />
      <WalkInModal open={openWalkIn} onClose={() => setOpenWalkIn(false)} servicesList={servicesList} departments={departments}/>
      
      <AssignStaffModal
        open={openAssign}
        onClose={() => setOpenAssign(false)}
        patient={selectedRow}
      />
      
      {/* THE NEW TRIAGE WIZARD SHIELD (PAGE-LEVEL OVERLAY) */}
      <EndOfDayModal 
        open={openEndDay} 
        leftoverPatients={leftoverPatients} 
        patientResolutions={patientResolutions} 
        auditReasons={auditReasons}
        targetDates={targetDates}
        targetTimes={targetTimes}
        touchedPatients={touchedPatients}
        onResolutionChange={handleResolutionChange}
        onAuditReasonChange={handleAuditReasonChange}
        onBulkResolution={handleBulkResolutionEOD}
        onConfirmReset={(dates, times, depositData) => {
          // T2.102: depositData = { [patientId]: { amount, method } } — written to carry-over appointments
          confirmResetDay(false, dates, patientResolutions, auditReasons, times, depositData);
          setIsForcedCleanup(false);
        }}
        isForced={isForcedCleanup}
        departments={departments}
        onPatientUpdate={(patientId, updates) => {
          setLeftoverPatients(prev => prev.map(p =>
            p.id === patientId ? { ...p, ...updates } : p
          ));
        }}
        onClose={handleEndOfDayClose}
      />
      
      {/* INTERNAL MODALS */}
      <Dialog 
        open={openReject} 
        onClose={() => setOpenReject(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, border: '2px solid #D32F2F', boxShadow: '0 12px 32px rgba(211, 47, 47, 0.25)' } }}
      >
        <DialogTitle sx={{ 
          bgcolor: '#FFEBEE', 
          color: '#D32F2F', 
          fontWeight: '1000', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1.5,
          borderBottom: '1px solid #FFCDD2'
        }}>
          <PersonOffIcon /> TERMINAL CLINICAL VOID
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box sx={{ p: 1.5, bgcolor: '#FFF', border: '1px dashed #FFCDD2', borderRadius: 2, mb: 3 }}>
            <Typography variant="body2" sx={{ fontWeight: '800', color: '#5D4037', lineHeight: 1.5 }}>
              🚩 <strong>Warning:</strong> You are archiving this clinical record as a <strong>Void/Cancellation</strong>. This action is audited and permanently removes the patient from the active queue.
            </Typography>
          </Box>

          <Typography variant="overline" sx={{ fontWeight: '1000', color: '#D32F2F', display: 'block', mb: 1, fontSize: '0.65rem', letterSpacing: 1 }}>
              ✍️ MANDATORY VOID JUSTIFICATION
          </Typography>
          <TextField
              fullWidth
              multiline
              rows={3}
              autoFocus
              placeholder="e.g., Client cancelled via phone, duplicate triage record, patient seen elsewhere (Required)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              sx={{
                  '& .MuiOutlinedInput-root': {
                      fontWeight: '900', fontSize: '0.85rem', bgcolor: '#FAFAFA',
                      '& fieldset': { borderColor: !rejectReason.trim() ? '#B71C1C' : '#D32F2F' }
                  }
              }}
          />
          {!rejectReason.trim() && (
              <Typography variant="caption" sx={{ color: '#D32F2F', fontWeight: '1000', fontSize: '0.55rem', mt: 0.5, display: 'block' }}>
                  🛑 LOCK ACTIVE: Terminal voids require a mandatory forensic audit justification.
              </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1, borderTop: '1px solid #FFCDD2' }}>
          <Button onClick={() => setOpenReject(false)} sx={{ fontWeight: 'bold', color: '#757575' }}>Cancel</Button>
          <Button
            onClick={confirmReject}
            variant="contained"
            disabled={!rejectReason.trim() || submitting}
            sx={{ 
                bgcolor: '#D32F2F', 
                fontWeight: '1000', 
                px: 3,
                '&.Mui-disabled': { bgcolor: '#e0e0e0' },
                '&:hover': { bgcolor: '#B71C1C' }
            }}
          >
            CONFIRM CANCELLATION
          </Button>
        </DialogActions>
      </Dialog>


      
      {/* 📡 THE COMMAND MENU (GAP 2 FIX) */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
        PaperProps={{
          sx: {
            minWidth: 220,
            border: '2px solid #5D4037',
            boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.15)',
            borderRadius: 0,
            '& .MuiMenuItem-root': { fontWeight: '1000', py: 1.5, fontSize: '0.85rem' },
            '& .MuiListItemIcon-root': { color: '#5D4037' }
          }
        }}
      >
         {['arrived', 'in-consult', 'dispensing', 'billing', 'on-hold', 'confined'].includes(selectedRow?.status) && (
           <>
              <MenuItem onClick={() => { 
                setTriageMode('hospitalize');
                setTriageDate(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
                setOpenTriageShield(true); 
                handleCloseMenu(); 
              }}>
                <ListItemIcon><LocalHospitalIcon fontSize="small" sx={{ color: '#E65100' }} /></ListItemIcon>
                <ListItemText primary="🏥 Confine Patient" sx={{ color: '#E65100' }} />
              </MenuItem>
              <MenuItem onClick={() => { 
                setTriageMode('carryover');
                setTriageDate(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
                setOpenTriageShield(true); 
                handleCloseMenu(); 
              }}>
                <ListItemIcon><HomeIcon fontSize="small" sx={{ color: '#E65100' }} /></ListItemIcon>
                <ListItemText primary="🏠 Rebook (Home Return)" sx={{ color: '#E65100' }} />
              </MenuItem>
           </>
         )}

         {/* T3.122: On-hold controls */}
         {selectedRow?.status === 'in-consult' && (
           <MenuItem onClick={() => { handleStatusChange(selectedRow, 'on-hold'); handleCloseMenu(); }}>
             <PauseCircleIcon sx={{ mr: 1, fontSize: 18, color: COLORS.warning }} />
             <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 700, color: COLORS.warning }}>
               Put On Hold
             </Typography>
           </MenuItem>
         )}
         {selectedRow?.status === 'on-hold' && (
           <MenuItem onClick={() => { handleStatusChange(selectedRow, 'in-consult'); handleCloseMenu(); }}>
             <PlayCircleFilledWhiteIcon sx={{ mr: 1, fontSize: 18, color: COLORS.success }} />
             <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 700, color: COLORS.success }}>
               Resume Consult
             </Typography>
           </MenuItem>
         )}

         <MenuItem onClick={handleEditOpen}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Edit Patient Identity" />
         </MenuItem>

         {selectedRow?.status === 'confirmed' && (
          <MenuItem onClick={() => handleNoShowOpen()}>
             <ListItemIcon><PersonOffIcon fontSize="small" /></ListItemIcon>
             <ListItemText primary="Flag as No-Show" />
          </MenuItem>
        )}

        {selectedRow?.status !== 'pending' && (
          <MenuItem onClick={handleRescheduleOpen}>
             <ListItemIcon><EventIcon fontSize="small" /></ListItemIcon>
             <ListItemText primary="Reschedule / Shift" />
          </MenuItem>
        )}
        <MenuItem onClick={handleOpenEMR}>
           <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
           <ListItemText primary="View Medical History" />
        </MenuItem>
        <MenuItem onClick={() => {
          navigate('/records', { state: { dashboardFilter: { searchText: selectedRow?.petName || '' } } });
          handleCloseMenu();
        }}>
          <ListItemIcon><AssignmentIcon fontSize="small" sx={{ color: '#1565C0' }} /></ListItemIcon>
          <ListItemText primary="View in Records" sx={{ color: '#1565C0' }} />
        </MenuItem>

        {/* T4.92: Send a custom free-text push notification to the owner */}
        <MenuItem onClick={() => { setNotifDialogOpen(true); handleCloseMenu(); }}>
          <ListItemIcon><NotificationsActiveIcon fontSize="small" sx={{ color: COLORS.medical }} /></ListItemIcon>
          <ListItemText primary="Send Notification" sx={{ color: COLORS.medical }} />
        </MenuItem>

        {selectedRow?.statusHistory && selectedRow.statusHistory.length > 0 && (() => {
          const isTerminal = TERMINAL_STATUSES.has(selectedRow?.status);
          if (isTerminal && !isAdmin) return null;
          return (
            <MenuItem onClick={() => revertStatusWithReason(selectedRow)}>
               <ListItemIcon><UndoIcon fontSize="small" sx={{ color: isTerminal ? '#D32F2F' : '#E65100' }} /></ListItemIcon>
               <ListItemText
                 primary={isTerminal ? 'Revert Terminal State (Admin)' : 'Revert Status (Undo)'}
                 sx={{ color: isTerminal ? '#D32F2F' : '#E65100' }}
               />
            </MenuItem>
          );
        })()}
        
        {/* CONTEXTUAL REDUNDANCY SHIELD: Hide Void for Online Requests */}
        {selectedRow?.status !== 'pending' && <Divider />}
        {selectedRow?.status !== 'pending' && (
          <MenuItem onClick={() => { setOpenReject(true); handleCloseMenu(); }} sx={{ color: '#D32F2F' }}>
             <ListItemIcon><PersonOffIcon fontSize="small" sx={{ color: '#D32F2F' }} /></ListItemIcon>
             <ListItemText primary="Cancel / Void Record" />
          </MenuItem>
        )}
      </Menu>

      {/* 📡 UNIVERSAL CLINICAL HUD (NOTES & SERVICES) */}
      <Popover
        id="clinical-hover-popover"
        sx={{ 
            pointerEvents: 'none', 
            '& .MuiBackdrop-root': { pointerEvents: 'none' } 
        }}
        open={Boolean(hoverAnchor)}
        anchorEl={hoverAnchor}
        anchorOrigin={{ 
            vertical: 'center', 
            horizontal: 'center' 
        }}
        transformOrigin={{ 
            vertical: 'center', 
            horizontal: 'center' 
        }}
        onClose={() => {
            handleHoverEnd();
            setIsPinned(false);
            setEditingStaffNotes(false);
            setEditStaffNotesValue('');
            setEditStaffNotesRowId(null);
        }}
        disableRestoreFocus
        PaperProps={{
          onMouseEnter: () => { 
            if (closeTimer.current) clearTimeout(closeTimer.current); 
            // Allow clicking into the popup
          },
          onMouseLeave: () => { if (!isPinned) handleHoverEnd(); },
          sx: {
            p: 3, 
            ml: 0, 
            width: hoverMetadata.type === 'timing' ? 420 : 480,
            maxHeight: 600,
            overflow: 'hidden', // Contain the forensic layout
            pointerEvents: 'auto', 
            bgcolor: '#FFF', 
            border: '3px solid #5D4037',
            boxShadow: '0 32px 64px rgba(93, 64, 55, 0.45)',
            borderRadius: 0,
            zIndex: 10000,
            '&::before': { display: 'none' } 
          }
        }}
      >
        {hoverMetadata.data && (
            <Box sx={{ position: 'relative' }}>
                {isPinned && (
                    <IconButton 
                        size="small" 
                        onClick={() => {
                            setIsPinned(false);
                            handleHoverEnd();
                        }}
                        sx={{ position: 'absolute', top: -16, right: -16, color: '#5D4037', zIndex: 10 }}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                )}

                {hoverMetadata.type === 'notes' && (() => {
                  // Unified notes popover — Owner / Staff / Legacy stacked (no tabs)
                  const d = hoverMetadata.data || {};
                  const isStructured = typeof d === 'object' && d !== null;
                  const clientNotes = isStructured ? (d.clientNotes || '') : '';
                  const staffNotes = isStructured ? (d.staffNotes || '') : '';
                  const legacyNotes = isStructured ? (d.legacyNotes || '') : (typeof d === 'string' ? d : '');
                  const isLegacy = isStructured ? d.isLegacy : true;
                  const record = isStructured ? d : {};

                  const noteTextSx = {
                    fontSize: '1.0rem', lineHeight: 1.6, color: COLORS.brand, fontStyle: 'italic',
                    whiteSpace: 'pre-wrap', fontFamily: '"Merriweather", serif', fontWeight: 700, letterSpacing: '-0.01rem',
                  };

                  const hasAnyNote = clientNotes || staffNotes || (isLegacy && legacyNotes);

                  return (
                    <Box>
                      <Typography variant="overline" sx={{ fontWeight: '1000', color: COLORS.accent, letterSpacing: 2, display: 'block', mb: 1.5 }}>
                        CONTEXT / NOTES
                      </Typography>

                      {!hasAnyNote && (
                        <Typography sx={{ fontSize: '0.9rem', color: COLORS.textMuted, fontStyle: 'italic' }}>
                          No notes recorded.
                        </Typography>
                      )}

                      {/* Owner block — read-only */}
                      {clientNotes && (
                        <Box sx={{ mb: 1.5 }}>
                          <Typography sx={{ fontWeight: 900, fontSize: '0.7rem', color: COLORS.medical, letterSpacing: 0.5, mb: 0.5 }}>
                            OWNER:
                          </Typography>
                          <Typography sx={noteTextSx}>"{clientNotes}"</Typography>
                        </Box>
                      )}

                      {/* Staff block — editable via Fix 9 */}
                      {(staffNotes || clientNotes || (isLegacy && legacyNotes)) && (
                        <Box sx={{ mb: 1.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                            <Typography sx={{ fontWeight: 900, fontSize: '0.7rem', color: COLORS.warning, letterSpacing: 0.5 }}>
                              STAFF:
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => {
                                setEditingStaffNotes(true);
                                setEditStaffNotesValue(staffNotes);
                                setEditStaffNotesRowId(record.rowId || null);
                                setIsPinned(true);
                              }}
                              sx={{ p: 0.25, pointerEvents: 'auto' }}
                            >
                              <EditIcon sx={{ fontSize: 14, color: COLORS.textMuted }} />
                            </IconButton>
                          </Box>

                          {editingStaffNotes && editStaffNotesRowId === record.rowId ? (
                            <Box sx={{ mt: 0.5 }}>
                              <TextField
                                fullWidth
                                multiline
                                rows={3}
                                size="small"
                                value={editStaffNotesValue}
                                onChange={(e) => setEditStaffNotesValue(e.target.value)}
                                disabled={editStaffNotesLoading}
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.85rem' } }}
                              />
                              <Box sx={{ display: 'flex', gap: 1, mt: 1, justifyContent: 'flex-end' }}>
                                <Button
                                  size="small"
                                  onClick={() => {
                                    setEditingStaffNotes(false);
                                    setEditStaffNotesValue('');
                                    setEditStaffNotesRowId(null);
                                  }}
                                  disabled={editStaffNotesLoading}
                                  sx={{ fontSize: '0.7rem', fontWeight: 900, borderRadius: 0, color: COLORS.textMuted }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="small"
                                  variant="contained"
                                  disabled={editStaffNotesLoading}
                                  onClick={async () => {
                                    setEditStaffNotesLoading(true);
                                    try {
                                      await updateDoc(doc(db, 'appointments', editStaffNotesRowId), { staffNotes: editStaffNotesValue });
                                      setEditingStaffNotes(false);
                                      setEditStaffNotesValue('');
                                      setEditStaffNotesRowId(null);
                                    } catch (err) {
                                      console.error('[StaffNotes] Save failed:', err);
                                    } finally {
                                      setEditStaffNotesLoading(false);
                                    }
                                  }}
                                  sx={{
                                    fontSize: '0.7rem', fontWeight: 900, borderRadius: 0,
                                    bgcolor: COLORS.sky, '&:hover': { bgcolor: COLORS.skyHover },
                                  }}
                                >
                                  {editStaffNotesLoading ? 'Saving...' : 'Save'}
                                </Button>
                              </Box>
                            </Box>
                          ) : staffNotes ? (
                            <Typography sx={noteTextSx}>"{staffNotes}"</Typography>
                          ) : (
                            <Typography sx={{ fontSize: '0.85rem', color: COLORS.textMuted, fontStyle: 'italic' }}>
                              No staff note — click the edit icon to add one.
                            </Typography>
                          )}
                        </Box>
                      )}

                      {/* Add Staff Note button when no staff note and clientNotes or legacyNotes exist */}
                      {!staffNotes && (clientNotes || (isLegacy && legacyNotes)) && (
                        <Box sx={{ mb: 1.5 }}>
                          {editingStaffNotes && editStaffNotesRowId === record.rowId ? (
                            <Box>
                              <TextField
                                fullWidth
                                multiline
                                rows={3}
                                size="small"
                                value={editStaffNotesValue}
                                onChange={(e) => setEditStaffNotesValue(e.target.value)}
                                disabled={editStaffNotesLoading}
                                placeholder="Enter staff observation..."
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.85rem' } }}
                              />
                              <Box sx={{ display: 'flex', gap: 1, mt: 1, justifyContent: 'flex-end' }}>
                                <Button
                                  size="small"
                                  onClick={() => { setEditingStaffNotes(false); setEditStaffNotesValue(''); setEditStaffNotesRowId(null); }}
                                  disabled={editStaffNotesLoading}
                                  sx={{ fontSize: '0.7rem', fontWeight: 900, borderRadius: 0, color: COLORS.textMuted }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="small"
                                  variant="contained"
                                  disabled={editStaffNotesLoading}
                                  onClick={async () => {
                                    setEditStaffNotesLoading(true);
                                    try {
                                      await updateDoc(doc(db, 'appointments', editStaffNotesRowId), { staffNotes: editStaffNotesValue });
                                      setEditingStaffNotes(false);
                                      setEditStaffNotesValue('');
                                      setEditStaffNotesRowId(null);
                                    } catch (err) {
                                      console.error('[StaffNotes] Save failed:', err);
                                    } finally {
                                      setEditStaffNotesLoading(false);
                                    }
                                  }}
                                  sx={{ fontSize: '0.7rem', fontWeight: 900, borderRadius: 0, bgcolor: COLORS.sky, '&:hover': { bgcolor: COLORS.skyHover } }}
                                >
                                  {editStaffNotesLoading ? 'Saving...' : 'Save'}
                                </Button>
                              </Box>
                            </Box>
                          ) : (
                            <Button
                              size="small"
                              startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                              onClick={() => {
                                setEditingStaffNotes(true);
                                setEditStaffNotesValue('');
                                setEditStaffNotesRowId(record.rowId || null);
                                setIsPinned(true);
                              }}
                              sx={{ fontSize: '0.7rem', fontWeight: 900, borderRadius: 0, color: COLORS.warning, borderColor: COLORS.warning, border: `1px solid ${COLORS.warning}`, pointerEvents: 'auto' }}
                            >
                              Add Staff Note
                            </Button>
                          )}
                        </Box>
                      )}

                      {/* Legacy block */}
                      {isLegacy && legacyNotes && (
                        <Box sx={{ mb: 0.5 }}>
                          <Typography sx={{ fontWeight: 900, fontSize: '0.7rem', color: COLORS.textMuted, letterSpacing: 0.5, mb: 0.5 }}>
                            LEGACY:
                          </Typography>
                          <Typography sx={{ ...noteTextSx, color: COLORS.textMuted }}>"{legacyNotes}"</Typography>
                        </Box>
                      )}
                    </Box>
                  );
                })()}

                {hoverMetadata.type === 'services' && (() => {
                  // T3.68: Backward-compat guard — old callers passed a plain array.
                  const rawData = hoverMetadata.data;
                  const svcData = Array.isArray(rawData) ? { services: rawData } : (rawData || {});
                  const { services: svcList = [] } = svcData;

                  // STATUS_ORDER is used for grouping when sort mode is 'status'.
                  const STATUS_ORDER = { 'completed': 0, 'in-progress': 1, 'pending': 2 };

                  const sortedServices = (() => {
                    const copy = [...svcList];
                    if (servicesSortMode === 'status') {
                      return copy.sort((a, b) => {
                        const aRank = STATUS_ORDER[a.serviceStatus || 'pending'] ?? 2;
                        const bRank = STATUS_ORDER[b.serviceStatus || 'pending'] ?? 2;
                        return aRank - bRank;
                      });
                    }
                    if (servicesSortMode === 'department') {
                      return copy.sort((a, b) => (a.department || '').localeCompare(b.department || ''));
                    }
                    // 'booking' — preserve insertion order (no sort).
                    return copy;
                  })();

                  const completedCount = svcList.filter(s => s.serviceStatus === 'completed').length;
                  const totalCount = svcList.length;
                  const scheduledDate = svcData.scheduledDate;
                  const apptCaseDay = svcData.caseDay || 1;
                  const scheduledMs = scheduledDate?.toDate ? scheduledDate.toDate().getTime() : (scheduledDate ? new Date(scheduledDate).getTime() : null);
                  const totalActualMins = svcList.reduce((acc, s) => {
                    if (s.serviceStatus !== 'completed' || !s.serviceStartedAt || !s.serviceCompletedAt) return acc;
                    const startMs = typeof s.serviceStartedAt.toDate === 'function' ? s.serviceStartedAt.toDate().getTime() : new Date(s.serviceStartedAt).getTime();
                    const endMs = typeof s.serviceCompletedAt.toDate === 'function' ? s.serviceCompletedAt.toDate().getTime() : new Date(s.serviceCompletedAt).getTime();
                    const mins = Math.round((endMs - startMs) / 60000);
                    return acc + (Number.isFinite(mins) && mins > 0 ? mins : 0);
                  }, 0);
                  const totalEstMins = svcList.reduce((acc, s) => acc + (s.duration || 0), 0);
                  const totalPrice = svcList.reduce((acc, s) => acc + (s.price || 0), 0);

                  const statusChipSx = (status) => {
                    if (status === 'completed') return { bgcolor: COLORS.kpiGreenBg, border: `1px solid ${COLORS.success}`, color: COLORS.success };
                    if (status === 'in-progress') return { bgcolor: COLORS.chipBlueBg, border: `1px solid ${COLORS.medical}`, color: COLORS.medical };
                    return { bgcolor: COLORS.cream, border: `1px solid ${COLORS.warning}`, color: COLORS.warning };
                  };

                  const statusLabel = (status) => {
                    if (status === 'completed') return 'COMPLETED';
                    if (status === 'in-progress') return 'IN PROGRESS';
                    return 'PENDING';
                  };

                  return (
                    <Box>
                      {/* Header */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="overline" sx={{ fontWeight: 900, color: COLORS.accent, letterSpacing: 1.5 }}>
                          SERVICES ({totalCount})
                        </Typography>
                      </Box>

                      {/* Summary bar */}
                      <Box sx={{ display: 'flex', gap: 2, mb: 1.5, pb: 1, borderBottom: `1px dashed ${COLORS.borderLight}` }}>
                        <Typography variant="caption" sx={{ fontWeight: 900 }}>
                          {totalActualMins > 0 ? `ACTUAL: ${totalActualMins}m` : `EST: ${totalEstMins}m`}
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 900, color: COLORS.success }}>
                          EST: ₱{totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Typography>
                      </Box>

                      {/* Sort toggle */}
                      <ToggleButtonGroup
                        value={servicesSortMode}
                        exclusive
                        onChange={(_e, val) => { if (val) setServicesSortMode(val); }}
                        size="small"
                        sx={{ mb: 1.5, display: 'flex' }}
                      >
                        {[
                          { value: 'booking', label: 'BOOKING ORDER' },
                          { value: 'status', label: 'STATUS' },
                          { value: 'department', label: 'DEPT' },
                        ].map(({ value, label }) => (
                          <ToggleButton
                            key={value}
                            value={value}
                            sx={{
                              flex: 1,
                              borderRadius: 0,
                              fontWeight: 900,
                              fontSize: '0.55rem',
                              letterSpacing: 0.5,
                              py: 0.3,
                            }}
                          >
                            {label}
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>

                      {/* Service list */}
                      <List sx={{ p: 0 }}>
                        {sortedServices.map((svc, i) => {
                          const deptObj = (departments || []).find(d => d.name === svc.department);
                          const bColor = deptObj ? deptObj.color : COLORS.textMuted;
                          const svcStatus = svc.serviceStatus || 'pending';
                          const isCompleted = svcStatus === 'completed';
                          const svcDuration = (() => {
                            if (!isCompleted || !svc.serviceStartedAt || !svc.serviceCompletedAt) return null;
                            const startMs = typeof svc.serviceStartedAt.toDate === 'function' ? svc.serviceStartedAt.toDate().getTime() : new Date(svc.serviceStartedAt).getTime();
                            const endMs = typeof svc.serviceCompletedAt.toDate === 'function' ? svc.serviceCompletedAt.toDate().getTime() : new Date(svc.serviceCompletedAt).getTime();
                            const mins = Math.round((endMs - startMs) / 60000);
                            return Number.isFinite(mins) && mins > 0 ? `${mins} min` : null;
                          })();
                          const isAdded = svc.addedDuringConsult === true;
                          const isPriorDay = (() => {
                            if (!isCompleted || !svc.serviceCompletedAt || !scheduledMs || apptCaseDay <= 1) return false;
                            const completedMs = typeof svc.serviceCompletedAt.toDate === 'function' ? svc.serviceCompletedAt.toDate().getTime() : new Date(svc.serviceCompletedAt).getTime();
                            return completedMs < scheduledMs;
                          })();
                          return (
                            <ListItem key={i} sx={{ px: 1.5, py: 0.8, mb: 0.5, borderLeft: `6px solid ${bColor}`, bgcolor: COLORS.panelBg }}>
                              <Box sx={{ width: '100%' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <Box sx={{ flex: 1, pr: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                                      <Typography variant="body2" sx={{ fontWeight: 900 }}>{svc.name}</Typography>
                                      {isAdded && (
                                        <Typography variant="caption" sx={{ fontSize: '0.55rem', color: COLORS.textMuted, fontStyle: 'italic' }}>(added)</Typography>
                                      )}
                                    </Box>
                                    <Typography variant="caption" sx={{ display: 'block', color: svc.staffName ? COLORS.accent : COLORS.textMuted, fontWeight: 900, fontSize: '0.65rem' }}>
                                      {svc.staffName ? `👤 ${svc.staffName}` : 'Unassigned'}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ textAlign: 'right' }}>
                                    <Typography variant="caption" sx={{ display: 'block', fontSize: '0.6rem', fontWeight: 900 }}>
                                      ₱{svc.price?.toLocaleString()}
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: 'block', fontSize: '0.55rem', color: bColor, fontWeight: 900 }}>
                                      {svc.department?.toUpperCase()}
                                    </Typography>
                                    {(svcDuration || isPriorDay) && (
                                      <Typography variant="caption" sx={{ display: 'block', fontSize: '0.55rem', color: isPriorDay ? COLORS.warning : COLORS.success, fontWeight: 900 }}>
                                        {svcDuration ? `${svcDuration}${isPriorDay ? ' · Day 1' : ''}` : 'Day 1'}
                                      </Typography>
                                    )}
                                  </Box>
                                </Box>
                                {/* Per-service status chip */}
                                <Chip
                                  label={statusLabel(svcStatus)}
                                  size="small"
                                  sx={{
                                    mt: 0.5,
                                    height: 16,
                                    fontSize: '0.5rem',
                                    fontWeight: 900,
                                    borderRadius: 0,
                                    ...statusChipSx(svcStatus),
                                  }}
                                />
                              </Box>
                            </ListItem>
                          );
                        })}
                      </List>

                      {/* Footer: completion summary */}
                      <Box sx={{ mt: 1, pt: 1, borderTop: `1px dashed ${COLORS.borderLight}`, display: 'flex', justifyContent: 'flex-end' }}>
                        <Typography variant="caption" sx={{
                          fontWeight: 900,
                          fontSize: '0.6rem',
                          color: completedCount === totalCount ? COLORS.success : COLORS.accent,
                        }}>
                          {completedCount}/{totalCount} COMPLETE
                        </Typography>
                      </Box>
                    </Box>
                  );
                })()}

                {hoverMetadata.type === 'identity' && hoverMetadata.data}

                {hoverMetadata.type === 'timing' && hoverMetadata.data && (() => {
                  // 🧬 ANCESTOR-AWARE POPOVER CALCULATIONS
                  const record = hoverMetadata.data;
                  const ancestorChain = popoverAncestorCache[record.id] || [];
                  const ancestorPulses = ancestorChain.flatMap(a => a.clinicalPulse || []);
                  const combinedPulse = [...ancestorPulses, ...(record.clinicalPulse || [])];

                  const allDates = combinedPulse.length > 0
                    ? [...new Set(combinedPulse.map(p => {
                        const d = p.timestamp?.toDate ? p.timestamp.toDate() : new Date(p.timestamp);
                        return d.toDateString();
                      }))].sort((a,b) => new Date(a) - new Date(b))
                    : [new Date().toDateString()];

                  const safeActiveDay = Math.min(activeCaseDay, allDates.length - 1);
                  const targetDateStr = allDates[safeActiveDay] || allDates[allDates.length - 1];

                  // PULSE ROUTER: current record first, ancestors second
                  const currentPulse = record.clinicalPulse || [];
                  const currentHasEvents = currentPulse.some(p => {
                    const d = p.timestamp?.toDate ? p.timestamp.toDate() : new Date(p.timestamp);
                    return d.toDateString() === targetDateStr;
                  });
                  let routedPulse = currentPulse;
                  let routedCreatedAt = record.createdAt;
                  if (!currentHasEvents) {
                    for (const ancestor of ancestorChain) {
                      const aPulse = ancestor.clinicalPulse || [];
                      if (aPulse.some(p => {
                        const d = p.timestamp?.toDate ? p.timestamp.toDate() : new Date(p.timestamp);
                        return d.toDateString() === targetDateStr;
                      })) {
                        routedPulse = aPulse;
                        routedCreatedAt = ancestor.createdAt;
                        break;
                      }
                    }
                  }

                  // CUMULATIVE TOTALS: sum of shift values across all records
                  // SORT FIRST — arrayUnion preserves insertion order, not chronological.
                  const getPrimaryDate = (pulse) => {
                    if (!pulse || pulse.length === 0) return new Date();
                    const sorted = [...pulse].sort((a, b) => {
                      const da = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp ?? Infinity);
                      const db = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp ?? Infinity);
                      return da - db;
                    });
                    const firstTs = sorted[0].timestamp;
                    const d = firstTs?.toDate ? firstTs.toDate() : new Date(firstTs);
                    return isNaN(d.getTime()) ? new Date() : d;
                  };
                  let cumTotalQueue = 0, cumTotalConsult = 0, cumTotalConfined = 0;
                  ancestorChain.forEach(ancestor => {
                    const aPulse = ancestor.clinicalPulse || [];
                    if (aPulse.length === 0) return;
                    const m = calculatePulseMetrics(aPulse, clinicSettings, ancestor.createdAt, getPrimaryDate(aPulse));
                    cumTotalQueue += m.raw.shiftQueue;
                    cumTotalConsult += m.raw.shiftConsult;
                    cumTotalConfined += m.raw.shiftConfined;
                  });
                  if (currentPulse.length > 0) {
                    const m = calculatePulseMetrics(currentPulse, clinicSettings, record.createdAt, getPrimaryDate(currentPulse));
                    cumTotalQueue += m.raw.shiftQueue;
                    cumTotalConsult += m.raw.shiftConsult;
                    cumTotalConfined += m.raw.shiftConfined;
                  }
                  const cumulativeTotals = ancestorChain.length > 0
                    ? { totalQueue: cumTotalQueue, totalConsult: cumTotalConsult, totalConfined: cumTotalConfined }
                    : null;

                  // FILTERED PULSE: from combinedPulse for the selected day
                  const filteredPulse = combinedPulse.filter(p => {
                    const d = p.timestamp?.toDate ? p.timestamp.toDate() : new Date(p.timestamp);
                    return d.toDateString() === targetDateStr;
                  });

                  return (
                  <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 540 }}>
                    {/* 🧬 STICKY HEADER: NAVIGATION */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexShrink: 0 }}>
                        <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 1.5 }}>
                        ⌛ CLINICAL TEMPORAL AUDIT
                        </Typography>
                        
                        {allDates.length > 1 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: '#F5F5F5', px: 1, borderRadius: 1 }}>
                                <IconButton 
                                    size="small" 
                                    disabled={safeActiveDay === 0} 
                                    onClick={() => setActiveCaseDay(prev => Math.max(0, prev - 1))}
                                    sx={{ p: 0.2, color: '#5D4037' }}
                                >
                                    <ArrowBackIosNewIcon sx={{ fontSize: 10 }} />
                                </IconButton>
                                <Typography sx={{ fontSize: '0.6rem', fontWeight: '1000', color: '#5D4037', minWidth: 50, textAlign: 'center' }}>
                                    DAY {safeActiveDay + 1} OF {allDates.length}
                                </Typography>
                                <IconButton 
                                    size="small" 
                                    disabled={safeActiveDay === allDates.length - 1} 
                                    onClick={() => setActiveCaseDay(prev => Math.min(allDates.length - 1, prev + 1))}
                                    sx={{ p: 0.2, color: '#5D4037' }}
                                >
                                    <ArrowForwardIosIcon sx={{ fontSize: 10 }} />
                                </IconButton>
                            </Box>
                        )}
                    </Box>

                    {/* 🧬 SCROLLABLE CONTENT: TIMELINE */}
                    <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: 1, mb: 2, '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { bgcolor: '#D7CCC8', borderRadius: '4px' } }}>
                        <Stack spacing={2} sx={{ position: 'relative', pl: 3 }}>
                            <Box sx={{ position: 'absolute', left: 8, top: 8, bottom: 8, width: '2px', borderLeft: '2px dashed #D7CCC8' }} />
                            
                            {(() => {
                                const voidedIds = new Set(combinedPulse.filter(p => p.correctedEventId).map(p => p.correctedEventId));

                                let events = [];
                                if (filteredPulse.length > 0) {
                                    events = filteredPulse.map(p => ({
                                        id: p.eventId,
                                        label: p.toStatus ? p.toStatus.toUpperCase()
                                            : (p.serviceName && (p.type === 'SERVICE_STARTED' || p.type === 'SERVICE_COMPLETED'))
                                              ? `${p.serviceName}: ${p.type === 'SERVICE_STARTED' ? 'STARTED' : 'COMPLETED'}`
                                              : (p.type || 'EVENT'),
                                        val: p.timestamp,
                                        by: p.staffName,
                                        note: p.note,
                                        type: p.type,
                                        serviceName: p.serviceName,
                                        isCorrection: p.isCorrection || p.type === 'CORRECTION',
                                        isVoided: voidedIds.has(p.eventId)
                                    }));
                                } else {
                                    events = [
                                    { id: 'booked', label: record.ticketPrefix ? 'INTAKE CREATED' : 'BOOKED (ONLINE)', val: record.createdAt },
                                    { id: 'scheduled', label: record.ticketPrefix ? 'QUEUE POSITION' : 'APPOINTMENT SLOT', val: record.jsScheduled },
                                    { id: 'arrived', label: 'ARRIVED (CHECK-IN)', val: record.timeArrived, by: record.arrivedBy },
                                    { id: 'started', label: 'CONSULT STARTED', val: record.timeStarted, by: record.startedBy }
                                    ].filter(i => i.val);
                                }

                                return events
                                .sort((a,b) => {
                                    const da = a.val && a.val.toDate ? a.val.toDate() : new Date(a.val || 0);
                                    const db = b.val && b.val.toDate ? b.val.toDate() : new Date(b.val || 0);
                                    return da - db;
                                })
                                .map((item, idx) => {
                                    const isLatestTotal = item.id === events[events.length - 1]?.id;
                                    const date = item.val && item.val.toDate ? item.val.toDate() : new Date(item.val || 0);
                                    const color = item.isCorrection ? '#1976D2' : (item.isVoided ? '#BDBDBD' : (isLatestTotal ? '#2E7D32' : '#9E9E9E'));
                                    const isExpanded = expandedPulseId === item.id;
                                    
                                    return (
                                        <Box 
                                            key={item.id || idx} 
                                            sx={{ position: 'relative', mb: 0.5, cursor: item.note ? 'pointer' : 'default', pointerEvents: 'auto' }} 
                                            onClick={() => {
                                                if (item.note) {
                                                    setExpandedPulseId(isExpanded ? null : item.id);
                                                    setIsPinned(true); 
                                                }
                                            }}
                                        >
                                            <Box sx={{ position: 'absolute', left: -26, top: 4, width: 8, height: 8, borderRadius: '50%', bgcolor: color, zIndex: 5, border: item.isCorrection ? '2px solid #BBDEFB' : 'none' }} />
                                            <Typography variant="caption" sx={{ fontWeight: '1000', color: color, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.65rem' }}>
                                                {item.isCorrection ? '↺ CLINICAL CORRECTION' : item.label}
                                                {item.isCorrection && <Chip label="CORRECTION" size="small" sx={{ height: 14, fontSize: '0.5rem', fontWeight: 1000, bgcolor: '#C8E6C9', color: '#2E7D32' }} />}
                                                {item.isVoided && <Chip label="REVERTED" size="small" sx={{ height: 14, fontSize: '0.5rem', fontWeight: 1000, bgcolor: '#FFEBEE', color: '#D32F2F' }} />}
                                            </Typography>
                                            <Typography sx={{ 
                                                fontWeight: '1000', 
                                                color: (isLatestTotal && !item.isVoided) ? '#1A1A1A' : '#9E9E9E', 
                                                fontSize: '0.85rem',
                                                textDecoration: item.isVoided ? 'line-through' : 'none',
                                                opacity: item.isVoided ? 0.4 : 1
                                            }}>
                                                {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                {(item.by || item.staffName) && <span style={{ opacity: 0.6, fontWeight: '700', marginLeft: '6px' }}>● {item.by || item.staffName}</span>}
                                            </Typography>
                                            
                                            {item.note && (
                                                <Box sx={{ mt: 0.5 }}>
                                                    <Typography variant="caption" sx={{ 
                                                        fontStyle: 'italic', 
                                                        color: '#5D4037', 
                                                        fontWeight: '800', 
                                                        fontSize: '0.62rem',
                                                        lineHeight: 1.3,
                                                        display: 'block',
                                                        textDecoration: item.isVoided ? 'line-through' : 'none',
                                                        opacity: item.isVoided ? 0.6 : 1,
                                                        whiteSpace: 'pre-wrap'
                                                    }}>
                                                        ↳ {(!isExpanded && item.note.length > 50) 
                                                            ? `${item.note.substring(0, 47)}...` 
                                                            : item.note}
                                                        {!isExpanded && item.note.length > 50 && (
                                                            <span style={{ color: "#1976D2", marginLeft: "4px", fontWeight: "1000", cursor: "pointer" }}>
                                                                [MORE]
                                                            </span>
                                                        )}
                                                    </Typography>
                                                </Box>
                                            )}
                                        </Box>
                                    );
                                });
                            })()}
                        </Stack>
                    </Box>

                    <Box sx={{ flexShrink: 0 }}>
                        {(() => {
                          const todayStr = new Date().toDateString();
                          const popoverAuditEnd = targetDateStr === todayStr
                            ? new Date()
                            : (() => { const d = new Date(targetDateStr); d.setHours(23, 59, 59, 999); return d; })();
                          return (
                            <ForensicMetricGrid
                                pulse={routedPulse}
                                settings={clinicSettings}
                                createdAt={routedCreatedAt}
                                sealedMetrics={record.forensicSeal}
                                targetDate={new Date(targetDateStr)}
                                cumulativeTotals={cumulativeTotals}
                                auditEnd={popoverAuditEnd}
                                liveAge={!record.forensicSeal && targetDateStr === new Date().toDateString()}
                            />
                          );
                        })()}
                    </Box>
                  </Box>
                  );
                })()}
            </Box>
        )}
      </Popover>
      {/* INTERNAL ADMINISTRATIVE MODALS (RESTORED) */}
      <Dialog open={openEdit} onClose={() => setOpenEdit(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ 
          bgcolor: '#5D4037', 
          color: 'white', 
          fontWeight: '1000', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1.5,
          py: 1.5
        }}>
          <EditIcon /> EDIT CLINICAL IDENTITY
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: '#F5F5F5' }}>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 1 }}>OWNER & CONTACT</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 7 }}>
              <TextField label="OWNER FULL NAME" fullWidth variant="outlined" size="small" value={editName} onChange={(e) => setEditName(e.target.value)} InputLabelProps={{ sx: { fontWeight: '1000', fontSize: '0.75rem' } }} inputProps={{ style: { fontWeight: '1000' } }} />
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <TextField label="OWNER PHONE" fullWidth variant="outlined" size="small" placeholder="09xxxxxxxxx" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} InputLabelProps={{ sx: { fontWeight: '1000', fontSize: '0.75rem' } }} inputProps={{ style: { fontWeight: '1000' } }} />
            </Grid>

            <Grid size={{ xs: 12 }}><Divider sx={{ my: 1 }} /></Grid>

            <Grid size={{ xs: 12 }}>
              <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 1 }}>PATIENT BIOMETRICS</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="PATIENT NAME" fullWidth variant="outlined" size="small" value={editPet} onChange={(e) => setEditPet(e.target.value)} InputLabelProps={{ sx: { fontWeight: '1000', fontSize: '0.75rem' } }} inputProps={{ style: { fontWeight: '1000' } }} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontWeight: '1000', fontSize: '0.75rem' }}>SPECIES</InputLabel>
                <Select label="SPECIES" value={editSpecies} onChange={(e) => setEditSpecies(e.target.value)} sx={{ fontWeight: '1000' }}>
                  <MenuItem value="Canine" sx={{ fontWeight: '800' }}>CANINE 🐶</MenuItem>
                  <MenuItem value="Feline" sx={{ fontWeight: '800' }}>FELINE 🐱</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontWeight: '1000', fontSize: '0.75rem' }}>GENDER</InputLabel>
                <Select label="GENDER" value={editGender} onChange={(e) => setEditGender(e.target.value)} sx={{ fontWeight: '1000' }}>
                  <MenuItem value="Male" sx={{ fontWeight: '800' }}>MALE</MenuItem>
                  <MenuItem value="Female" sx={{ fontWeight: '800' }}>FEMALE</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 7 }}>
              <Autocomplete
                freeSolo
                size="small"
                options={BREED_DATA[editSpecies] || []}
                value={editBreed}
                onInputChange={(event, newValue) => setEditBreed(newValue)}
                renderInput={(params) => (
                  <TextField 
                    {...params} 
                    label="BREED / LINEAGE" 
                    variant="outlined" 
                    InputLabelProps={{ sx: { fontWeight: '1000', fontSize: '0.75rem' } }} 
                    inputProps={{ ...params.inputProps, style: { fontWeight: '1000' } }} 
                  />
                )}
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 5 }}>
               <Box sx={{ p: 1, border: '1px solid #E0E0E0', borderRadius: 1.5, bgcolor: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="caption" sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.7rem' }}>SPAYED / NEUTERED</Typography>
                  <Switch size="small" checked={editIsNeutered} onChange={(e) => setEditIsNeutered(e.target.checked)} color="success" />
               </Box>
            </Grid>

            <Grid size={{ xs: 12 }}>
                <TextField 
                    label="COLOR / MARKINGS" 
                    fullWidth 
                    variant="outlined" 
                    size="small" 
                    placeholder="e.g. Black/White, Tabby, Spotted" 
                    value={editColor} 
                    onChange={(e) => setEditColor(e.target.value)} 
                    InputLabelProps={{ sx: { fontWeight: '1000', fontSize: '0.75rem' } }} 
                    inputProps={{ style: { fontWeight: '1000' } }} 
                />
            </Grid>

            <Grid size={{ xs: 12 }}><Divider sx={{ my: 1 }} /></Grid>

            <Grid size={{ xs: 12 }}>
              <Box sx={{ p: 1.5, border: '1px solid #D7CCC8', borderRadius: 1.5, bgcolor: '#FFF8F1' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, gap: 1 }}>
                  <CakeIcon sx={{ fontSize: 18, color: '#8B4513' }} />
                  <Typography sx={{ fontWeight: '1000', fontSize: '0.7rem', color: '#5D4037' }}>PROBABLE BIRTHDATE / AGE MODE</Typography>
                  <ToggleButtonGroup
                    size="small"
                    value={editDobMode}
                    exclusive
                    onChange={(e, val) => val && setEditDobMode(val)}
                    sx={{ ml: 'auto', height: 24 }}
                  >
                    <ToggleButton value="exact" sx={{ fontSize: '0.6rem', fontWeight: 1000, px: 1.5 }}>EXACT</ToggleButton>
                    <ToggleButton value="approximate" sx={{ fontSize: '0.6rem', fontWeight: 1000, px: 1.5 }}>ESTIMATE</ToggleButton>
                    <ToggleButton value="unknown" sx={{ fontSize: '0.6rem', fontWeight: 1000, px: 1.5 }}>UNKNOWN</ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                {editDobMode === 'exact' && (
                  <TextField size="small" type="date" label="PET BIRTHDAY" variant="outlined" fullWidth InputLabelProps={{shrink:true, sx: { fontWeight: '1000', fontSize: '0.75rem' }}} inputProps={{ style: { fontWeight: '1000' } }} value={editDob} onChange={e => setEditDob(e.target.value)} />
                )}
                {editDobMode === 'approximate' && (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField size="small" placeholder="YEARS" type="number" label="YEARS" fullWidth value={editEstYears} onChange={e => setEditEstYears(e.target.value)} InputLabelProps={{ sx: { fontWeight: '1000', fontSize: '0.75rem' } }} inputProps={{ style: { fontWeight: '1000' } }} />
                    <TextField size="small" placeholder="MONTHS" type="number" label="MONTHS" fullWidth value={editEstMonths} onChange={e => setEditEstMonths(e.target.value)} InputLabelProps={{ sx: { fontWeight: '1000', fontSize: '0.75rem' } }} inputProps={{ style: { fontWeight: '1000' } }} />
                  </Box>
                )}
                {editDobMode === 'unknown' && (
                  <Typography variant="caption" sx={{ color: '#8B4513', fontStyle: 'italic', fontWeight: '800' }}>Age to be manually verified during clinical consultation.</Typography>
                )}
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#FFF' }}>
          <Button onClick={() => setOpenEdit(false)} sx={{ fontWeight: '1000', color: '#757575' }}>DISCARD CHANGES</Button>
          <Button onClick={saveEdit} variant="contained" disabled={submitting} sx={{ bgcolor: '#5D4037', fontWeight: '1000', px: 4 }}>SAVE CLINICAL IDENTITY</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openReschedule} onClose={() => setOpenReschedule(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: '1000', color: (selectedRow?.status === 'arrived' || selectedRow?.status === 'in-consult' || selectedRow?.status === 'confined' || selectedRow?.status === 'on-hold' || selectedRow?.status === 'dispensing' || selectedRow?.status === 'billing') ? '#D32F2F' : '#5D4037', pb: 1 }}>
          {(selectedRow?.status === 'arrived' || selectedRow?.status === 'in-consult' || selectedRow?.status === 'confined' || selectedRow?.status === 'on-hold' || selectedRow?.status === 'dispensing' || selectedRow?.status === 'billing') ? 'CLINICAL CARRY-OVER' : 'Reschedule Appointment'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="caption" sx={{ display: 'block', mb: 2, color: '#5D4037', fontStyle: 'italic', lineHeight: 1.4 }}>
            { (selectedRow?.status === 'arrived' || selectedRow?.status === 'in-consult' || selectedRow?.status === 'confined' || selectedRow?.status === 'on-hold' || selectedRow?.status === 'dispensing' || selectedRow?.status === 'billing') 
              ? "This patient has already entered the clinical or financial pipeline. Shifting this record will preserve their existing wait-time and increment their Case Day status."
              : "Performing a Manual Schedule Shift authorizes this visit and sets a new temporal baseline."
            }
          </Typography>

          <TextField
              label="New Date/Time"
              type="datetime-local"
              fullWidth
              size="small"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              InputLabelProps={{ shrink: true, sx: { fontWeight: 'bold' } }}
              sx={{ mb: 3 }}
          />

          <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', display: 'block', mb: 1, fontSize: '0.65rem', letterSpacing: 1 }}>
              ✍️ MANDATORY FORENSIC JUSTIFICATION
          </Typography>
          <TextField
              fullWidth
              multiline
              rows={2}
              placeholder="Provide clinical justification for this shift (Required)"
              value={auditReason}
              onChange={(e) => setAuditReason(e.target.value)}
              sx={{
                  '& .MuiOutlinedInput-root': {
                      fontWeight: '900', fontSize: '0.75rem', bgcolor: '#FAFAFA',
                      '& fieldset': { borderColor: !auditReason.trim() ? '#D32F2F' : '#5D4037' }
                  }
              }}
          />
          {!auditReason.trim() && (
              <Typography variant="caption" sx={{ color: '#D32F2F', fontWeight: '1000', fontSize: '0.55rem', mt: 0.5, display: 'block' }}>
                  🛑 LOCK ACTIVE: Every shift requires a forensic justification.
              </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setOpenReschedule(false)} sx={{ fontWeight: 'bold', color: '#757575' }}>Cancel</Button>
          <Button
            onClick={saveReschedule}
            variant="contained"
            disabled={!newDate || !auditReason.trim() || submitting}
            sx={{ bgcolor: '#1976D2', fontWeight: 'bold', '&.Mui-disabled': { bgcolor: '#e0e0e0' } }}
          >
            Update Schedule
          </Button>
        </DialogActions>
      </Dialog>

      <EMRDrawer
        open={emrDrawerOpen}
        onClose={() => setEmrDrawerOpen(false)}
        petId={emrPetId}
        petName={emrPetName}
        petSpecies={emrPetSpecies}
      />


      <Dialog 
        open={openRevert} 
        onClose={() => setOpenRevert(false)} 
        maxWidth="xs" 
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, border: '2px solid #E65100', boxShadow: '0 12px 32px rgba(230, 81, 0, 0.25)' } }}
      >
        <DialogTitle sx={{ 
          bgcolor: '#FFF3E0', 
          color: '#E65100', 
          fontWeight: '1000', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1.5,
          borderBottom: '1px solid #FFE0B2'
        }}>
          <UndoIcon /> TIMELINE CORRECTION
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box sx={{ p: 1.5, bgcolor: '#FFF', border: '1px dashed #FFE0B2', borderRadius: 2, mb: 3 }}>
            <Typography variant="body2" sx={{ fontWeight: '800', color: '#5D4037', lineHeight: 1.5 }}>
              🚩 <strong>Warning:</strong> You are reverting a clinical status change. This action is audited and will appear in the patient's Forensic Pulse.
            </Typography>
          </Box>

          {TERMINAL_STATUSES.has(selectedRow?.status) && (
            <Box sx={{ p: 1.5, bgcolor: '#FFEBEE', border: '1px solid #D32F2F', borderRadius: 0, mb: 3 }}>
              <Typography variant="body2" sx={{ fontWeight: 900, color: '#D32F2F', lineHeight: 1.5 }}>
                TERMINAL REVERSAL: You are undoing a completed/cancelled/no-show/carried-over resolution.
                If a medical record or sale was created during this visit, those records will NOT
                be automatically removed. Manual cleanup may be required.
              </Typography>
              {selectedRow?.status === 'carried-over' && (
                <Typography variant="body2" sx={{ fontWeight: 900, color: '#D32F2F', lineHeight: 1.5, mt: 1 }}>
                  A cloned next-day record may still exist. Manual cleanup of the duplicate is required after this revert.
                </Typography>
              )}
            </Box>
          )}

          <Typography variant="overline" sx={{ fontWeight: '1000', color: '#E65100', display: 'block', mb: 1, fontSize: '0.65rem', letterSpacing: 1 }}>
              ✍️ MANDATORY REVERSION JUSTIFICATION
          </Typography>
          <TextField
              fullWidth
              multiline
              rows={3}
              autoFocus
              placeholder="e.g., Accidental status click, patient is still in triage (Required)"
              value={revertReason}
              onChange={(e) => setRevertReason(e.target.value)}
              sx={{
                  '& .MuiOutlinedInput-root': {
                      fontWeight: '900', fontSize: '0.85rem', bgcolor: '#FAFAFA',
                      '& fieldset': { borderColor: !revertReason.trim() ? '#D32F2F' : '#E65100' }
                  }
              }}
          />
          {!revertReason.trim() && (
              <Typography variant="caption" sx={{ color: '#D32F2F', fontWeight: '1000', fontSize: '0.55rem', mt: 0.5, display: 'block' }}>
                  🛑 LOCK ACTIVE: This timeline correction requires a forensic audit justification.
              </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1, borderTop: '1px solid #FFE0B2' }}>
          <Button onClick={() => setOpenRevert(false)} sx={{ fontWeight: 'bold', color: '#757575' }}>Cancel</Button>
          <Button
            onClick={confirmRevert}
            variant="contained"
            disabled={!revertReason.trim() || submitting}
            sx={{
                bgcolor: '#E65100',
                fontWeight: '1000',
                px: 3,
                '&.Mui-disabled': { bgcolor: '#e0e0e0' },
                '&:hover': { bgcolor: '#BF360C' }
            }}
          >
            CONFIRM REVERSION
          </Button>
        </DialogActions>
      </Dialog>

      {/* DEFER CONFIRMATION DIALOG */}
      <Dialog open={openDefer} onClose={() => setOpenDefer(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: '1000', color: '#E65100', pb: 1 }}>Defer Clinical Intake</DialogTitle>
        <DialogContent>
          <Typography variant="caption" sx={{ display: 'block', mb: 2, color: '#5D4037', fontStyle: 'italic', lineHeight: 1.4 }}>
            Postponing intake decision.
          </Typography>

          <Typography variant="overline" sx={{ fontWeight: '1000', color: '#E65100', display: 'block', mb: 1, fontSize: '0.65rem', letterSpacing: 1 }}>
              ✍️ MANDATORY FORENSIC JUSTIFICATION
          </Typography>
          <TextField
              fullWidth
              multiline
              rows={2}
              placeholder="e.g., Clinic at capacity, Vet unavailable today"
              value={auditReason}
              onChange={(e) => setAuditReason(e.target.value)}
              sx={{
                  '& .MuiOutlinedInput-root': {
                      fontWeight: '900', fontSize: '0.75rem', bgcolor: '#FAFAFA',
                      '& fieldset': { borderColor: !auditReason.trim() ? '#D32F2F' : '#E65100' }
                  }
              }}
          />
          {!auditReason.trim() && (
              <Typography variant="caption" sx={{ color: '#D32F2F', fontWeight: '1000', fontSize: '0.55rem', mt: 0.5, display: 'block' }}>
                  🛑 LOCK ACTIVE: Deferral requires a forensic justification.
              </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setOpenDefer(false)} sx={{ fontWeight: 'bold', color: '#757575' }}>Cancel</Button>
          <Button
            onClick={saveDefer}
            variant="contained"
            disabled={!auditReason.trim() || submitting}
            sx={{ bgcolor: '#E65100', fontWeight: 'bold', '&.Mui-disabled': { bgcolor: '#e0e0e0' } }}
          >
            Confirm Deferral
          </Button>
        </DialogActions>
      </Dialog>

      {/* NO-SHOW CONFIRMATION DIALOG */}
      <Dialog open={openNoShow} onClose={() => setOpenNoShow(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: '1000', color: '#D32F2F', pb: 1 }}>Flag as No-Show</DialogTitle>
        <DialogContent>
          <Typography variant="caption" sx={{ display: 'block', mb: 2, color: '#5D4037', fontStyle: 'italic', lineHeight: 1.4 }}>
            Flagging a patient as <strong>No-Show</strong> closes the slot and impacts the client's reliability score. 
            This action is permanent for the today's audit.
          </Typography>

          <Typography variant="overline" sx={{ fontWeight: '1000', color: '#D32F2F', display: 'block', mb: 1, fontSize: '0.65rem', letterSpacing: 1 }}>
              ✍️ MANDATORY FORENSIC JUSTIFICATION
          </Typography>
          <TextField
              fullWidth
              multiline
              rows={2}
              placeholder="e.g., Patient failed to arrive after 30 mins"
              value={auditReason}
              onChange={(e) => setAuditReason(e.target.value)}
              sx={{
                  '& .MuiOutlinedInput-root': {
                      fontWeight: '900', fontSize: '0.75rem', bgcolor: '#FAFAFA',
                      '& fieldset': { borderColor: !auditReason.trim() ? '#D32F2F' : '#5D4037' }
                  }
              }}
          />
          {!auditReason.trim() && (
              <Typography variant="caption" sx={{ color: '#D32F2F', fontWeight: '1000', fontSize: '0.55rem', mt: 0.5, display: 'block' }}>
                  🛑 LOCK ACTIVE: This audit action requires a reason.
              </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setOpenNoShow(false)} sx={{ fontWeight: 'bold', color: '#757575' }}>Cancel</Button>
          <Button
            onClick={saveNoShow}
            variant="contained"
            disabled={!auditReason.trim() || submitting}
            sx={{ bgcolor: '#D32F2F', fontWeight: 'bold', '&.Mui-disabled': { bgcolor: '#e0e0e0' } }}
          >
            Confirm No-Show
          </Button>
        </DialogActions>
      </Dialog>
 
      {/* 🧬 PHASE 5.8.1: THE CLINICAL TRIAGE FLASH-SHIELD */}
      <Dialog 
        open={openTriageShield} 
        onClose={() => setOpenTriageShield(false)} 
        maxWidth="xs" 
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, border: '2px solid #E65100', boxShadow: '0 12px 32px rgba(230, 81, 0, 0.25)' } }}
      >
        <DialogTitle sx={{ 
          bgcolor: '#FFF3E0', 
          color: '#E65100', 
          fontWeight: '1000', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1.5,
          borderBottom: '1px solid #FFE0B2'
        }}>
          {triageMode === 'hospitalize' ? <LocalHospitalIcon /> : <HomeIcon />}
          {triageMode === 'hospitalize' ? 'PATIENT CONFINEMENT' : 'PATIENT CARRY-OVER'}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box sx={{ p: 1.5, bgcolor: '#FFF', border: '1px dashed #FFE0B2', borderRadius: 2, mb: 3 }}>
            <Typography variant="body2" sx={{ fontWeight: '800', color: '#5D4037', lineHeight: 1.5 }}>
              {triageMode === 'hospitalize' ? (
                <>🏥 <strong>Action:</strong> Patient stays overnight in the ward. Case status remains <strong>ACTIVE</strong> for continued medical rounds.</>
              ) : (
                <>🏠 <strong>Action:</strong> Patient leaves the clinic and returns home. Case status reverts to <strong>SCHEDULED</strong> for their next clinical visit.</>
              )}
            </Typography>
          </Box>

          <Typography variant="overline" sx={{ fontWeight: '1000', color: '#E65100', letterSpacing: 1, mb: 1, display: 'block' }}>
            📅 TARGET CLINICAL WINDOW
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
            {[0, 1, 2].map(idx => {
                const { dateStr, label } = getSmartShiftDate(idx, clinicSettings?.openHour || 8);
                return { label, val: dateStr };
            }).map(btn => (
              <Button 
                key={btn.label}
                variant={triageDate === btn.val ? "contained" : "outlined"}
                size="small"
                onClick={() => {
                   setTriageDate(btn.val);
                   setTriageTime(clinicSettings.openingTime || "08:00");
                }}
                sx={{ 
                  fontWeight: '1000', 
                  borderRadius: 1,
                  bgcolor: triageDate === btn.val ? '#E65100' : 'transparent',
                  color: triageDate === btn.val ? '#FFF' : '#E65100',
                  borderColor: '#E65100',
                  fontSize: '0.65rem'
                }}
              >
                {btn.label}
              </Button>
            ))}
          </Box>
          
          <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
            <TextField 
              type="date" 
              size="small" 
              label="TARGET DATE"
              InputLabelProps={{ shrink: true, sx: { fontWeight: '1000', color: '#E65100', fontSize: '0.65rem' } }}
              value={triageDate} 
              onChange={(e) => setTriageDate(e.target.value)} 
              sx={{ flex: 1, '& .MuiInputBase-input': { fontWeight: '1000', fontSize: '0.75rem' } }}
            />
            <TextField 
              type="time" 
              size="small" 
              label="TARGET TIME"
              InputLabelProps={{ shrink: true, sx: { fontWeight: '1000', color: '#E65100', fontSize: '0.65rem' } }}
              value={triageTime} 
              onChange={(e) => setTriageTime(e.target.value)} 
              sx={{ flex: 1, '& .MuiInputBase-input': { fontWeight: '1000', fontSize: '0.75rem' } }}
            />
          </Box>

          <Typography variant="overline" sx={{ fontWeight: '1000', color: '#E65100', display: 'block', mb: 1, fontSize: '0.65rem', letterSpacing: 1 }}>
              ✍️ MANDATORY FORENSIC JUSTIFICATION
          </Typography>
          <TextField
              fullWidth
              multiline
              rows={3}
              autoFocus
              placeholder={triageMode === 'hospitalize' ? "e.g., Clinical stabilization required (Required)" : "e.g., Client requested home return (Required)"}
              value={triageReason}
              onChange={(e) => setTriageReason(e.target.value)}
              sx={{
                  '& .MuiOutlinedInput-root': {
                      fontWeight: '900', fontSize: '0.85rem', bgcolor: '#FAFAFA',
                      '& fieldset': { borderColor: !triageReason.trim() ? '#D32F2F' : '#E65100' }
                  }
              }}
          />
          {!triageReason.trim() && (
              <Typography variant="caption" sx={{ color: '#D32F2F', fontWeight: '1000', fontSize: '0.55rem', mt: 0.5, display: 'block' }}>
                  🛑 LOCK ACTIVE: This mid-shift transfer requires a forensic audit justification.
              </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1, borderTop: '1px solid #FFE0B2' }}>
          <Button onClick={() => setOpenTriageShield(false)} sx={{ fontWeight: 'bold', color: '#757575' }}>Cancel</Button>
          <Button
            onClick={async () => {
              if (submitting) return;
              setSubmitting(true);
              try {
                await confirmResetDay(false, { [selectedRow.id]: triageDate }, { [selectedRow.id]: triageMode }, { [selectedRow.id]: triageReason }, { [selectedRow.id]: triageTime });
              } finally {
                setOpenTriageShield(false);
                setTriageReason("");
                setTriageTime(clinicSettings.openingTime || "08:00");
                setSubmitting(false);
              }
            }}
            variant="contained"
            disabled={!triageReason.trim() || submitting}
            sx={{ 
                bgcolor: '#E65100', 
                fontWeight: '1000', 
                px: 3,
                '&.Mui-disabled': { bgcolor: '#e0e0e0' },
                '&:hover': { bgcolor: '#BF360C' }
            }}
          >
            AUTHORIZE TRIAGE
          </Button>
        </DialogActions>
      </Dialog>

      {/* T3.36 — FLAG FOR VET REVIEW DIALOG */}
      <Dialog
        open={dispenseFlagDialogOpen}
        onClose={() => setDispenseFlagDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: '2px solid #5D4037' } }}
      >
        <DialogTitle sx={{
          fontWeight: 900, bgcolor: '#FFF3E0', color: '#E65100',
          borderBottom: '2px solid #5D4037', letterSpacing: 0.5,
        }}>
          FLAG FOR VET REVIEW
        </DialogTitle>
        <DialogContent sx={{ pt: 2, bgcolor: '#FFF8E1' }}>
          <Typography variant="body2" fontWeight="700" sx={{ mb: 1.5, color: '#5D4037' }}>
            This will pause dispensing for {dispenseFlagTarget?.petName} until a veterinarian resolves the hold.
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={2}
            placeholder="Reason for hold (optional)"
            value={dispenseReasonText}
            onChange={(e) => setDispenseReasonText(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, fontWeight: 900 } }}
          />
        </DialogContent>
        <DialogActions sx={{ bgcolor: '#FFF8E1', borderTop: '2px solid #5D4037', p: 2, gap: 1 }}>
          <Button
            onClick={() => setDispenseFlagDialogOpen(false)}
            sx={{ fontWeight: 900, borderRadius: 0, color: '#5D4037' }}
          >
            CANCEL
          </Button>
          <Button
            variant="contained"
            sx={{ fontWeight: 900, borderRadius: 0, bgcolor: '#E65100', '&:hover': { bgcolor: '#BF360C' } }}
            onClick={() => {
              handleDispenseFlag(dispenseFlagTarget, dispenseReasonText);
              setDispenseFlagDialogOpen(false);
            }}
          >
            FLAG
          </Button>
        </DialogActions>
      </Dialog>

      {/* T3.36 — RESOLVE HOLD DIALOG */}
      <Dialog
        open={dispenseResolveDialogOpen}
        onClose={() => setDispenseResolveDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: '2px solid #5D4037' } }}
      >
        <DialogTitle sx={{
          fontWeight: 900, bgcolor: '#E8F5E9', color: '#2E7D32',
          borderBottom: '2px solid #5D4037', letterSpacing: 0.5,
        }}>
          RESOLVE HOLD
        </DialogTitle>
        <DialogContent sx={{ pt: 2, bgcolor: '#FFF8E1' }}>
          <Typography variant="body2" fontWeight="700" sx={{ mb: 1.5, color: '#5D4037' }}>
            This will clear the hold on {dispenseFlagTarget?.petName} and restore the VERIFY ITEMS action.
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={2}
            placeholder="Resolution note (optional)"
            value={dispenseReasonText}
            onChange={(e) => setDispenseReasonText(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, fontWeight: 900 } }}
          />
        </DialogContent>
        <DialogActions sx={{ bgcolor: '#FFF8E1', borderTop: '2px solid #5D4037', p: 2, gap: 1 }}>
          <Button
            onClick={() => setDispenseResolveDialogOpen(false)}
            sx={{ fontWeight: 900, borderRadius: 0, color: '#5D4037' }}
          >
            CANCEL
          </Button>
          <Button
            variant="contained"
            sx={{ fontWeight: 900, borderRadius: 0, bgcolor: '#2E7D32', '&:hover': { bgcolor: '#1B5E20' } }}
            onClick={() => {
              handleDispenseResolve(dispenseFlagTarget, dispenseReasonText);
              setDispenseResolveDialogOpen(false);
            }}
          >
            RESOLVE
          </Button>
        </DialogActions>
      </Dialog>

      {/* T3.36 — Dispense hold operation error toast */}
      <Snackbar
        open={dispenseHoldToast.open}
        autoHideDuration={4000}
        onClose={() => setDispenseHoldToast(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={dispenseHoldToast.severity}
          onClose={() => setDispenseHoldToast(prev => ({ ...prev, open: false }))}
          sx={{ width: '100%', fontWeight: 'bold' }}
        >
          {dispenseHoldToast.message}
        </Alert>
      </Snackbar>

      <Dialog open={staffGapDialogOpen} onClose={() => setStaffGapDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 900, fontSize: '1rem' }}>
          Staffing Gap Detected
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Cannot accept this appointment. No staff members are assigned to the following departments:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {staffGapDepts.map(dept => {
              const deptObj = (departments || []).find(d => d.name === dept);
              return (
                <Chip
                  key={dept}
                  label={dept}
                  size="small"
                  sx={{
                    fontWeight: 800,
                    bgcolor: deptObj?.color || '#9E9E9E',
                    color: '#fff',
                    borderRadius: 0,
                  }}
                />
              );
            })}
          </Box>
          <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
            Assign staff to these departments in the Staff module before accepting.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStaffGapDialogOpen(false)} variant="contained" sx={{ borderRadius: 0, fontWeight: 800 }}>
            Understood
          </Button>
        </DialogActions>
      </Dialog>

      {/* T4.92: Custom notification dialog with clinicalPulse audit trail */}
      <SendNotificationDialog
        open={notifDialogOpen}
        onClose={() => setNotifDialogOpen(false)}
        recipientName={selectedRow?.ownerName || 'Client'}
        ownerId={selectedRow?.ownerId}
        petName={selectedRow?.petName}
        onSent={async ({ title, body }) => {
          if (!selectedRow?.id) return;
          try {
            const pulseEvent = createPulseEvent('NOTIFICATION', {
              staffId: profile?.id || user?.uid || 'unknown',
              staffName: profile?.fullName || profile?.displayName || 'Staff',
              note: `Custom notification — "${title}": ${body}`,
            });
            await updateDoc(doc(db, 'appointments', selectedRow.id), {
              clinicalPulse: arrayUnion(pulseEvent),
            });
          } catch (err) {
            console.error('[Queue] Notification audit write failed:', err);
          }
        }}
      />

    </Box>
  );
}

// THE CLINICAL PULSE EFFECT
const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0.7); }
  70% { box-shadow: 0 0 0 10px rgba(211, 47, 47, 0); }
  100% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0); }
`;
