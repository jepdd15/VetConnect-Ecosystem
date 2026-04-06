import React, { useEffect, useState, useRef, useMemo } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { 
  Box, Typography, Paper, IconButton, Tooltip, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button,
  Tabs, Tab, Menu, MenuItem, ListItemIcon, ListItemText, Divider, List, ListItem, Alert,
  Popover, Chip, keyframes, FormControl, InputLabel, Select, Switch,
  ToggleButton, ToggleButtonGroup, FormControlLabel, Autocomplete
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, where, getDocs, writeBatch, getDoc, arrayUnion } from 'firebase/firestore';

// 1. BACKEND & BRAIN
import { db } from '../../firebaseConfig'; 
import { useQueueActions } from './useQueueActions';
import { getQueueColumns } from './queueColumns';
import { useUser } from '../../context/UserContext'; // THE SIGNATURE HOOK

// 2. SHARED COMPONENTS
import ClinicalWorkspace from '../../components/ClinicalWorkspace';
import POSModal from '../../components/POSModal'; 

// 3. FEATURE COMPONENTS
import WalkInModal from './WalkInModal';
import AssignStaffModal from './AssignStaffModal';
import EndOfDayModal from './EndOfDayModal';

// --- ICONS ---
import PersonAddIcon from '@mui/icons-material/PersonAdd'; 
import EditIcon from '@mui/icons-material/Edit';
import EventIcon from '@mui/icons-material/Event';
import HistoryIcon from '@mui/icons-material/History';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'; 
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'; 
import UndoIcon from '@mui/icons-material/Undo'; 
import LocalHospitalIcon from '@mui/icons-material/LocalHospital'; 
import HomeIcon from '@mui/icons-material/Home'; 
import WarningIcon from '@mui/icons-material/Warning';
import NightlightRoundIcon from '@mui/icons-material/NightlightRound';
import CloseIcon from '@mui/icons-material/Close';
import CakeIcon from '@mui/icons-material/Cake';
import MaleIcon from '@mui/icons-material/Male';
import FemaleIcon from '@mui/icons-material/Female';
import PetsIcon from '@mui/icons-material/Pets';

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

const formatDuration = (totalMinutes) => {
  const mins = Math.abs(Math.round(totalMinutes));
  
  if (mins >= 525600) {
      const years = Math.floor(mins / 525600);
      const remainingMonths = Math.floor((mins % 525600) / 43200);
      return remainingMonths > 0 ? `${years}y ${remainingMonths}mo` : `${years}y`;
  }
  if (mins >= 43200) return `${Math.floor(mins / 43200)}mo`;
  if (mins >= 10080) return `${Math.floor(mins / 10080)}w`;
  if (mins >= 1440) return `${Math.floor(mins / 1440)}d`;
  
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
};

// --- ðŸ“¡ FORENSIC TEMPORAL ENGINE (Local Timezone Guard) ---
const getLocalDateStr = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function Queue() {
  const [rows, setRows] = useState([]);
  const [vets, setVets] = useState([]); 
  const [inventoryList, setInventoryList] = useState([]); 
  const [servicesList, setServicesList] = useState([]); 
  const [departments, setDepartments] = useState([]);
  const [clinicSettings, setClinicSettings] = useState({ maxCages: 5, closeHour: 17 }); // Live Dynamic Configuration!
  const [tabValue, setTabValue] = useState(0); 
  const[filterDate, setFilterDate] = useState(getLocalDateStr());
  const[isTomorrowView, setIsTomorrowView] = useState(false);
  const[currentTime, setCurrentTime] = useState(new Date());
  
  const { user, profile } = useUser(); // Forensic Attribution
  const { changeStatus, revertStatus, markNoShow, rejectAppointment, quickAdmitER, deferAppointment } = useQueueActions();

  // THE FIX: Timezone-aware isToday logic targets local computer time instead of UTC toISOString.
  const isToday = filterDate === getLocalDateStr();

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
  const [isForcedCleanup, setIsForcedCleanup] = useState(false); // The Hostage Lock
  const [hasGhostPatients, setHasGhostPatients] = useState(false);
  const [openTriageShield, setOpenTriageShield] = useState(false); 
  const [triageMode, setTriageMode] = useState(null); // 'hospitalize' or 'rebook'
  const [triageDate, setTriageDate] = useState("");
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
  const [isAgeExact, setIsAgeExact] = useState(true);

  const [openReschedule, setOpenReschedule] = useState(false);
  const [openDefer, setOpenDefer] = useState(false);
  const [openNoShow, setOpenNoShow] = useState(false);
  const [auditReason, setAuditReason] = useState("");
  const [newDate, setNewDate] = useState('');
  const[openHistory, setOpenHistory] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [openRevert, setOpenRevert] = useState(false);
  const [revertReason, setRevertReason] = useState("");

  const [openConsult, setOpenConsult] = useState(false);
  const[openPOS, setOpenPOS] = useState(false); 
  const [openWalkIn, setOpenWalkIn] = useState(false);
  const [openAssign, setOpenAssign] = useState(false);
  const [assignMode, setAssignMode] = useState('check-in'); // 'check-in' or 'assign'
  const [lastCheckDate, setLastCheckDate] = useState(new Date().toDateString());



  // --- ðŸ›°ï¸ UNIVERSAL CLINICAL HOVER ENGINE ---
  const [hoverAnchor, setHoverAnchor] = useState(null);
  const [hoverMetadata, setHoverMetadata] = useState({ type: null, data: null });
  const [expandedPulseId, setExpandedPulseId] = useState(null);
  const [activeCaseDay, setActiveCaseDay] = useState(0); 
  const [isPinned, setIsPinned] = useState(false);
  const hoverTimer = useRef(null);
  const closeTimer = useRef(null);

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
        // RESET Temporal DeLorean to latest session
        setActiveCaseDay(0); 
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
  const hasCheckedAutoReset = useRef(false);

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
  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, "clinic_settings", "general"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setClinicSettings(prev => ({ ...prev, ...data }));
      }
    });
    return () => unsubSettings();
  }, []);

  // ======================================================================
  // LOGIC & HANDLERS
  // ======================================================================
  
const confirmResetDay = async (isSilent = false, targetDateMap = {}) => { 
    try { 
      const todayStr = new Date().toISOString().split('T')[0];

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

      leftoverPatients.forEach((patient) => { 
        const oldRef = doc(db, "appointments", patient.id); 
        const currentStatus = (freshStatuses[patient.id] || patient.status || 'unknown').toLowerCase();
        
        // Skip records already resolved remotely while wizard was open
        if (['completed', 'done', 'cancelled', 'no-show', 'carried-over'].includes(currentStatus)) return;

        const rawStatus = (patient.status || 'unknown').toLowerCase();
        const action = (patientResolutions[patient.id] || (patient.status === 'pending' ? 'defer' : 'cancel'));
        const staffSignature = profile?.fullName || user?.email || "System Triage";
        const forensicNote = auditReasons[patient.id] || "No reason provided in triage.";
        const isHighStakes = ['arrived', 'in-consult', 'dispensing', 'billing', 'confirmed', 'scheduled', 'payment', 'on-hold'].includes(rawStatus);

        // --- 🧬 FORENSIC COMMIT ENGINE: TRIAGE DYNAMICS ---
        if (action === 'rebook' || action === 'confined' || action === 'carry-over' || action === 'defer') { 
          // --- 🧬 SMART-SHIFT CALCULATION ---
          // Determine if we are CLOSING today's shift or RECOVERING yesterday's ghosts
          let recordDateObj;
          if (patient.scheduledDate?.toDate) recordDateObj = patient.scheduledDate.toDate();
          else if (patient.scheduledDate) recordDateObj = new Date(patient.scheduledDate);
          else recordDateObj = patient.createdAt?.toDate ? patient.createdAt.toDate() : new Date();

          const recordDayStr = recordDateObj.toISOString().split('T')[0];
          const isFromPast = recordDayStr < todayStr;

          // LOGIC: If a Friday ghost is processed on Sunday, "Defer" targets Sunday (Today).
          // If a Friday record is processed on Friday night, "Defer" targets Saturday (Tomorrow).
          const calculatedDefault = new Date();
          if (isFromPast && !isAfterHours) {
            // Recovery Mode (During Shift): Pull to Today at Opening Time
            calculatedDefault.setHours(openH, openM, 0, 0);
          } else {
            // Maintenance Mode OR Recovery Mode (After-Hours): Push to Tomorrow at Opening Time
            calculatedDefault.setDate(calculatedDefault.getDate() + 1); 
            calculatedDefault.setHours(openH, openM, 0, 0);
          }

          // PHASE 5.6.20: DYNAMIC MANUAL TIME ATTACHMENT
          const openStr = `${String(openH).padStart(2, '0')}:${String(openM).padStart(2, '0')}:00`;
          const manualDate = targetDateMap[patient.id] ? new Date(`${targetDateMap[patient.id]}T${openStr}`) : calculatedDefault;
          const pulseType = (action === 'defer') ? 'TRIAGE_DEFER' : ((action === 'hospitalize') ? 'TRIAGE_CONFINE' : 'TRIAGE_REBOOK');

          // PHASE 5.6.20: THE FORENSIC ACTION TRANSLATOR
          const actionLabel = action === 'hospitalize' ? 'CONFINE' : (action === 'rebook' ? 'REBOOK' : (action === 'defer' ? 'DEFER' : 'CARRY-OVER'));
          const triagePrefix = `[Clinical Triage: ${actionLabel}]`;

          if (patient.status === 'carried-over') {
            batch.update(oldRef, { 
               scheduledDate: Timestamp.fromDate(manualDate),
               caseDay: (patient.caseDay || 1) + 1,
               processedBy: staffSignature,
               processedAt: Timestamp.now(),
               clinicalPulse: arrayUnion({
                  eventId: `pulse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  type: pulseType,
                  fromStatus: rawStatus,
                  toStatus: 'carried-over',
                  timestamp: Timestamp.now(),
                  staffId: user?.uid || 'system',
                  staffName: staffSignature,
                  note: `Shift Cleanup: ${actionLabel} to ${manualDate.toDateString()}. Justification: ${forensicNote}`
               }),
               isTriaged: true // THE FORENSIC SHIELD STAMP
            });
          } else {
            // Avoid stacking duplicate prefixes
            const cleanNotes = patient.notes?.startsWith('[Clinical Triage:') 
              ? patient.notes 
              : `${triagePrefix} ${patient.notes || ""}`;
 
             batch.update(oldRef, { 
                status: 'carried-over', 
                isTriaged: true, // THE FORENSIC SHIELD STAMP
                notes: cleanNotes,
                processedBy: staffSignature,
                processedAt: Timestamp.now(),
                clinicalPulse: arrayUnion({
                   eventId: `pulse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                   type: pulseType,
                   fromStatus: rawStatus,
                   toStatus: 'carried-over',
                   timestamp: Timestamp.now(),
                   staffId: user?.uid || 'system',
                   staffName: staffSignature,
                   note: `Shift Cleanup: ${actionLabel} to ${manualDate.toDateString()}. Justification: ${forensicNote}`
                })
             }); 
             
             const newDocRef = doc(collection(db, "appointments")); 
             const { id, jsScheduled, jsArrived, jsStarted, jsCompleted, queueNumber, ticketPrefix, timeArrived, timeStarted, timeCompleted, isTriaged: oldIsTriaged, ...preservedData } = patient;
             
             batch.set(newDocRef, { 
                ...preservedData,
                status: action === 'hospitalize' ? 'confined' : 'confirmed', 
                queueNumber: null, 
                ticketPrefix: null, 
                scheduledDate: Timestamp.fromDate(manualDate), 
                createdAt: patient.createdAt || Timestamp.now(),
                originApptId: patient.id,
                caseDay: (patient.caseDay || 1) + 1,
                notes: cleanNotes, 
                processedBy: staffSignature,
                assignedVet: action === 'hospitalize' ? (patient.assignedVet || "Unassigned") : "Unassigned",
                clinicalPulse: [
                   {
                     eventId: `pulse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                     type: 'INCEPTION',
                     toStatus: action === 'hospitalize' ? 'confined' : 'confirmed',
                     timestamp: Timestamp.now(),
                     staffId: user?.uid || 'system',
                     staffName: staffSignature,
                     note: `Generated via Triage ${actionLabel} from Appt ${patient.id}`
                   }
                ]
             }); 
           }
        } else if (action === 'defer') {
          // PHASE 4.4.3: Support dynamic deferral windows instead of hardcoded tomorrow
          const triageKey = targetDateMap[patient.id] || new Date(Date.now() + 86400000).toISOString().split('T')[0];
          
          batch.update(oldRef, {
             triageDate: triageKey,
             notes: `(Deferred to ${triageKey} by ${staffSignature}) ${patient.notes || ""}`,
             processedBy: staffSignature,
             processedAt: Timestamp.now(),
             lastTriagedAt: Timestamp.now(),
             clinicalPulse: arrayUnion({
                eventId: `pulse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'TRIAGE_DEFERRED',
                fromStatus: rawStatus,
                toStatus: rawStatus,
                timestamp: Timestamp.now(),
                staffId: user?.uid || 'system',
                staffName: staffSignature,
                note: `Shift Triage: Deferred to ${triageKey}. Justification: ${forensicNote}`
             })
          });
        } else {
          // TERMINAL AUDIT (Cancel or No-Show)
          const finalStatus = action === 'no-show' ? 'no-show' : 'cancelled';
          const defaultReason = action === 'no-show' ? "Client failed to arrive" : "Appointment cancelled during triage";

          batch.update(oldRef, { 
             status: finalStatus, 
             rejectReason: `[Triage Audit] ${forensicNote}`,
             processedBy: staffSignature,
             processedAt: Timestamp.now(),
             isForensicAudit: isHighStakes,
             auditReason: forensicNote || defaultReason,
             clinicalPulse: arrayUnion({
                eventId: `pulse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: action === 'no-show' ? 'TRIAGE_NO_SHOW' : 'TRIAGE_CANCELLED',
                fromStatus: rawStatus,
                toStatus: finalStatus,
                timestamp: Timestamp.now(),
                staffId: user?.uid || 'system',
                staffName: staffSignature,
                note: `Shift Cleanup Sign-off: ${forensicNote || defaultReason}`
             })
          }); 
        }
      }); 

      const queueRef = doc(db, "queue", "daily_queue"); 
      batch.update(queueRef, { currentServing: 0, currentPrefix: '', lastNumberIssued: 0, status: 'active', lastResetDate: todayStr }); 
      await batch.commit(); 
      
      setOpenEndDay(false); 
      setIsForcedCleanup(false);
      setHasGhostPatients(false); 
      if (!isSilent) alert("Cleanup Complete."); 
    } catch (error) { alert("Error: " + error.message); } 
  };

  const initiateResetDay = async (isAuto = false) => { 
    try { 
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
          // THE FORENSIC GUARD: Arrived, In-Consult, Dispensing, Billing, Payment, AND Scheduled/Confirmed are High-Stakes
          const isHighStakes = ['arrived', 'in-consult', 'dispensing', 'billing', 'confirmed', 'scheduled', 'payment'].includes(rawStatus);

          if (rawStatus === 'confined') initialRes[p.id] = 'confined';
          else if (rawStatus === 'pending') { 
            initialRes[p.id] = 'defer'; 
            initialTouched.add(p.id); // AUTO-PASS FOR ONLINE
          }
          else if (isHighStakes) {
            initialRes[p.id] = null; // FORCE MANUAL CHOICE (CLEAN SLATE)
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

  const handleBulkResolution = (action) => {
    setPatientResolutions(prev => {
      const updated = { ...prev };
      leftoverPatients.forEach(p => {
        // THE VETERINARIAN'S RULE: Never bulk-override confined patients!
        if (p.status !== 'confined') {
          updated[p.id] = action;
        }
      });
      return updated;
    });
  };

  const handleQuickAdmit = async () => {
    try { await quickAdmitER(); } 
    catch (error) { alert("Error admitting ER patient: " + error.message); }
  };

  const handleMenuClick = (e, row) => { setAnchorEl(e.currentTarget); setSelectedRow(row); };
  const handleCloseMenu = () => { setAnchorEl(null); };
  const handleOpenAssign = (row, mode = 'check-in') => { 
    setSelectedRow(row); 
    setAssignMode(mode);
    setOpenAssign(true); 
    handleCloseMenu(); 
  };
  const handleOpenConsult = (row) => { setSelectedRow(row); setOpenConsult(true); };
  const handleOpenPOS = (row) => { setSelectedRow(row); setOpenPOS(true); };
  const handleStatusChange = async (row, newStatus) => { 
    try { 
      // --- ðŸ›¡ï¸ CLINICAL REALITY PRE-CHECK ---
      if (newStatus === 'confirmed') {
        const services = row.services || [];
        const missingDepts = [];
        
        services.forEach(svc => {
          const dept = svc.department || 'General';
          const hasStaff = vets.some(v => v.departments?.includes(dept) || v.role?.toLowerCase() === dept.toLowerCase());
          if (!hasStaff) missingDepts.push(dept);
        });

        if (missingDepts.length > 0) {
          alert(
            `âŒ STAFFING GAP DETECTED\n\nCannot accept this appointment. There are currently no staff members assigned to the following departments: ${missingDepts.join(", ")}.\n\nPlease assign staff to these departments in the Staff module before accepting.`
          );
          return;
        }
      }

      const confinedCount = rows.filter(r => r.status === 'confined').length; 
      await changeStatus(row, newStatus, confinedCount, clinicSettings.maxCages || 5); 
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
      setIsAgeExact(selectedRow.isAgeExact !== false);
      setEditEstYears('');
      setEditEstMonths('');
      
      setOpenEdit(true);
      handleCloseMenu();
    }
  };

  const saveEdit = async () => {
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
        isAgeExact: finalIsAgeExact
      });
      setOpenEdit(false);
    } catch (e) { console.error(e); }
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
    if (!revertReason.trim()) return;
    try {
      await revertStatus({ ...selectedRow, revertReason: revertReason });
      setOpenRevert(false);
      handleCloseMenu();
    } catch (e) { alert(e.message); }
  };

  const saveReschedule = async () => { 
    if(!newDate || !auditReason.trim()) return; 

    try {
        const currentSchDate = selectedRow.scheduledDate ? selectedRow.scheduledDate.toDate() : (selectedRow.createdAt?.toDate() || new Date());
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
            eventId: `pulse_shift_${Date.now()}`,
            type: 'STATUS_CHANGE',
            toStatus: isCarryOver ? 'carried-over (shifted)' : 'confirmed (shifted)',
            timestamp: Timestamp.now(),
            staffId: profile?.id || 'unknown',
            staffName: staffSignature,
            note: isCarryOver 
                  ? `CLINICAL CARRY-OVER to ${updatedDayStr} [Wait: ${additionalWaitMins}m] (Reason: ${auditReason})`
                  : `Manual Clinical Shift to ${updatedDayStr} (Reason: ${auditReason})`
        };

        let updateData = { 
            scheduledDate: Timestamp.fromDate(updatedSchDate), 
            status: 'confirmed',
            rescheduledBy: staffSignature,
            clinicalPulse: arrayUnion(pulseEvent),
            auditReason: auditReason,
            accumulatedWaitMins: (selectedRow.accumulatedWaitMins || 0) + additionalWaitMins
        };

        if (currentDayStr !== updatedDayStr) {
            updateData.caseDay = (selectedRow.caseDay || 1) + 1;
        }

        await updateDoc(doc(db, "appointments", selectedRow.id), updateData);
        setOpenReschedule(false); 
        setAuditReason("");
    } catch (e) {
        alert("Reschedule failed: " + e.message);
    }
  };

  const saveDefer = async () => {
    if (!auditReason.trim()) return;
    try {
        await deferAppointment(selectedRow.id, auditReason);
        setOpenDefer(false);
        setAuditReason("");
    } catch (e) { alert(e.message); }
  };

  const saveNoShow = async () => {
    if (!auditReason.trim()) return;
    try {
        await markNoShow(selectedRow, auditReason);
        setOpenNoShow(false);
        setAuditReason("");
    } catch (e) { alert(e.message); }
  };
  const fetchHistory = async () => { if (!selectedRow.petId) return alert("Walk-In Account Required"); const q = query(collection(db, "medical_records"), where("petId", "==", selectedRow.petId), orderBy("date", "desc")); const s = await getDocs(q); setHistoryList(s.docs.map(d => d.data())); setOpenHistory(true); handleCloseMenu(); };
  const confirmReject = async () => { 
    if (!selectedRow) return; 
    try { 
      const rawStatus = (selectedRow.status || 'unknown').toLowerCase();
      const isHighStakes = ['arrived', 'in-consult', 'dispensing', 'billing', 'confirmed', 'scheduled', 'payment'].includes(rawStatus);
      
      await rejectAppointment(selectedRow.id, rejectReason, selectedRow.services, isHighStakes); 
      setOpenReject(false); 
      setRejectReason(''); 
    } catch (err) { alert(err.message); } 
  };

  // ======================================================================
  // DATA FETCHING & EFFECTS
  // ======================================================================
  
  // THE MORNING GATEKEEPER (Forces modal if ghosts exist - REAL-TIME SYNC!)
  useEffect(() => {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayStr = getLocalDateStr();

    const qGhosts = query(
      collection(db, "appointments"),
      where("status", "in",["pending", "confirmed", "arrived", "in-consult", "confined", "on-hold", "dispensing", "billing", "scheduled"])
    );

    const unsubGhosts = onSnapshot(qGhosts, async (snapshot) => {
      // 🧬 FORENSIC FILTER: Only flag records that AREN'T triaged and ARE from the past.
      const rawGhosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const ghosts = rawGhosts.filter(appt => {
          // SHIELD 1: THE FORENSIC STAMP
          if (appt.isTriaged === true) return false;
          
          // SHIELD 2: THE DEFERRAL GATE
          if (appt.triageDate && appt.triageDate >= todayStr) return false;

          // SHIELD 3: THE NOTES CHECK
          if (appt.notes?.includes('[Clinical Triage:')) return false;

          // DETERMINATION: Is it actually a ghost?
          let checkDate;
          if (appt.scheduledDate?.toDate) checkDate = appt.scheduledDate.toDate();
          else if (appt.scheduledDate) checkDate = new Date(appt.scheduledDate);
          else checkDate = appt.createdAt?.toDate ? appt.createdAt.toDate() : new Date();
          
          const finalCheck = new Date(checkDate);
          finalCheck.setHours(0,0,0,0);
          return finalCheck < todayStart;
      });

      if (ghosts.length === 0) {
        setHasGhostPatients(false);
        setOpenEndDay(false);
        setIsForcedCleanup(false);
        setLeftoverPatients([]);
      } else {
        setHasGhostPatients(true);
        if (isToday) {
            // THE FIX: "Live Identity Healing" inside the sync loop!
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
              } catch (e) { console.error('Ghost Identity Restoration failed:', p.id, e); }
              return p;
            }));

            // --- 🧬 MASTER REGISTRY CONSOLIDATION ---
            // Combine Today's Unfinished Rows + Historical Ghosts
            const unfinishedRows = rows.filter(r => ['pending', 'confirmed', 'arrived', 'in-consult', 'dispensing', 'billing', 'scheduled', 'on-hold', 'confined'].includes(r.status));
            
            // Forensic Unique Merge (Deduplication by ID)
            const masterMap = new Map();
            enrichedGhosts.forEach(p => masterMap.set(p.id, p));
            unfinishedRows.forEach(p => {
               if (!masterMap.has(p.id)) masterMap.set(p.id, p);
            });

            const unifiedList = Array.from(masterMap.values());
            setLeftoverPatients(unifiedList);
            
            setPatientResolutions(prev => {
              const updated = { ...prev };
              unifiedList.forEach(p => {
                if (!updated[p.id]) {
                  const rawStatus = (p.status || 'unknown').toLowerCase();
                  const isHighStakes = ['arrived', 'in-consult', 'dispensing', 'billing', 'confirmed', 'scheduled', 'payment', 'on-hold', 'confined'].includes(rawStatus);

                  if (rawStatus === 'pending') updated[p.id] = 'defer';
                  else if (isHighStakes) updated[p.id] = null; // FORCE MANUAL CHOICE
                  else updated[p.id] = 'cancel';
                }
              });
              return updated;
            });

            setTouchedPatients(prev => {
              const updated = new Set(prev);
              unifiedList.forEach(p => {
                const rawStatus = (p.status || 'unknown').toLowerCase();
                if (rawStatus === 'pending') updated.add(p.id);
              });
              return updated;
            });
            
            setIsForcedCleanup(true);
            setOpenEndDay(true);
        }
      }
    }, (error) => {
      console.error("Ghost Listener Error:", error);
    });

    return () => unsubGhosts();
  }, [filterDate, isToday]);

  // THE MAIN BOARD QUERY
  useEffect(() => {
    // THE NEW TRIAGE INBOX QUERY:
    // Online requests (pending) are visible based on triageDate, ignoring scheduledDate filter.
    // Scheduled/Arrived/etc. remain date-locked.
    const q = query(collection(db, "appointments"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let allAppts = snapshot.docs.map(doc => ({
        id: doc.id, ...doc.data(),
        jsScheduled: doc.data().scheduledDate?.toDate(), 
        jsArrived: doc.data().timeArrived?.toDate(),
        jsStarted: doc.data().timeStarted?.toDate(), 
        jsCompleted: doc.data().timeCompleted?.toDate(),
      }));

      // Filter for the current shift date context
      const start = new Date(filterDate); start.setHours(0, 0, 0, 0);
      const end = new Date(filterDate); end.setHours(23, 59, 59, 999);
      const filterDateStr = filterDate; // e.g. "2026-04-02"

      const list = allAppts.filter(appt => {
        const isPending = appt.status === 'pending';
        
        if (isPending) {
           const triageDate = appt.triageDate || appt.createdAt?.toDate()?.toISOString().split('T')[0] || filterDateStr;
           return triageDate === filterDateStr;
        }

        // For all non-pending statuses, keep the strict scheduledDate pulse
        // PHASE 4.4.4: THE TEMPORAL HEALER - Hide rescheduled records from 'Today' if they were accidentally created for the past
        // PHASE 4.4.10: DEEP CLEAN - Also hide legacy triage notes to clear 'Old Ghosts'
        const isTriagedRecord = 
          appt.isTriaged === true || 
          appt.notes?.includes('[Triage Reschedule]') || 
          appt.notes?.includes('[Clinical Triage:');
        
        if (isTriagedRecord) {
          // 🛡️ THE IDENTITY RESURRECTION:
          // If the record is scheduled for the dashboard's current shift or the future, 
          // we MUST show it even if it has triage stamps from its history.
          const apptDate = appt.jsScheduled || (appt.createdAt?.toDate ? appt.createdAt.toDate() : new Date());
          const today = new Date(); today.setHours(0,0,0,0);
          
          if (apptDate < today) return false; 
        }

        return appt.jsScheduled >= start && appt.jsScheduled <= end;
      });

      // --- ðŸ¦´ PRIMARY SORT (Priority -> Time -> Owner) ---
      list.sort((a, b) => {
        const priorityA = a.priority === 'high' ? 0 : 1;
        const priorityB = b.priority === 'high' ? 0 : 1;
        if (priorityA !== priorityB) return priorityA - priorityB;

        const timeA = a.jsScheduled ? a.jsScheduled.getTime() : (a.createdAt?.toDate().getTime() || 0);
        const timeB = b.jsScheduled ? b.jsScheduled.getTime() : (b.createdAt?.toDate().getTime() || 0);
        if (timeA !== timeB) return timeA - timeB;

        return (a.ownerId || '').localeCompare(b.ownerId || '');
      });

      // --- ðŸ¾ THE BOOKING BRIDGE (Grouping Detection) ---
      const processedList = list.map((item, idx) => {
        const prev = list[idx - 1];
        const next = list[idx + 1];
        
        const isWithPrev = prev && prev.ownerId === item.ownerId && Math.abs((prev.jsScheduled || prev.createdAt?.toDate()) - (item.jsScheduled || item.createdAt?.toDate())) < 120000;
        const isWithNext = next && next.ownerId === item.ownerId && Math.abs((next.jsScheduled || next.createdAt?.toDate()) - (item.jsScheduled || item.createdAt?.toDate())) < 120000;

        return {
          ...item,
          isGroupHeader: isWithNext && !isWithPrev,
          isGroupMid: isWithNext && isWithPrev,
          isGroupTail: !isWithNext && isWithPrev,
          isStandalone: !isWithNext && !isWithPrev
        };
      });

      setRows(processedList);
    });

    return () => unsubscribe();
  }, [filterDate]);

  // --- THE MIDNIGHT HEARTBEAT ---
  useEffect(() => {
    const heartbeat = setInterval(() => {
      const today = new Date().toDateString();
      if (today !== lastCheckDate) {
        setLastCheckDate(today);
        setOpenEndDay(true); // Force cleanup modal on day change
        console.log("Day change detected! Triggering triage board cleanup.");
      }
    }, 15 * 60 * 1000); // 15 Minutes
    return () => clearInterval(heartbeat);
  }, [lastCheckDate]);

  useEffect(() => {
    const unsubVets = onSnapshot(collection(db, "users"), (snapshot) => setVets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(u => u.role === 'veterinarian' || u.role === 'groomer' || u.accessLevel)));
    const unsubInv = onSnapshot(collection(db, "inventory"), (snapshot) => setInventoryList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const unsubServ = onSnapshot(collection(db, "services"), (snapshot) => setServicesList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const unsubDepts = onSnapshot(collection(db, "departments"), (snapshot) => setDepartments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const unsubSettings = onSnapshot(doc(db, "clinic_settings", "general"), (docSnap) => {
        if (docSnap.exists()) setClinicSettings(prev => ({ ...prev, ...docSnap.data() }));
    });
    return () => { unsubVets(); unsubInv(); unsubServ(); unsubDepts(); unsubSettings(); };
  },[]);

  // --- 🧬 FORENSIC GHOST SCANNER (Detecting Stranded Patients) ---
  useEffect(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayStr = getLocalDateStr();

    // Query for any unresolved record
    const qGhost = query(
      collection(db, "appointments"),
      where("status", "in", ['pending', 'confirmed', 'arrived', 'in-consult', 'dispensing', 'billing', 'scheduled'])
    );

    const unsubscribeGhosts = onSnapshot(qGhost, (snapshot) => {
      const ghosts = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(appt => {
          // SHIELD 1: THE FORENSIC STAMP - If it was triaged today, it's NOT a ghost.
          if (appt.isTriaged === true) return false;
          
          // SHIELD 2: THE TEMPORAL RESET - If it has triage notes, it's NOT a past ghost.
          if (appt.notes?.includes('[Triage Reschedule]') || appt.notes?.includes('[Clinical Triage:')) return false;

          // SHIELD 3: THE DEFERRAL GATE - If it has a future triageDate, it's safe.
          const apptTriageDate = appt.triageDate;
          if (apptTriageDate && apptTriageDate >= todayStr) return false;

          // DETERMINATION: Check scheduling context
          let checkDate;
          if (appt.scheduledDate?.toDate) {
            checkDate = appt.scheduledDate.toDate();
          } else if (appt.scheduledDate) {
            checkDate = new Date(appt.scheduledDate);
          } else {
            checkDate = appt.createdAt?.toDate ? appt.createdAt.toDate() : new Date();
          }
          
          const finalCheck = new Date(checkDate);
          finalCheck.setHours(0,0,0,0);

          return finalCheck < today;
        });

      if (ghosts.length > 0) {
        setLeftoverPatients(ghosts);
        setHasGhostPatients(true);
        // FORCE-OPEN the cleanup wizard if we have historical debris
        setOpenEndDay(true); 
        setIsForcedCleanup(true);
      } else {
        setHasGhostPatients(false);
      }
    });

    return () => unsubscribeGhosts();
  }, []);

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

    // FIXED CLINICAL SORTING: Online tab always sorts by Intake Age (Oldest First)
    if (tabValue === 0) {
      return [...filtered].sort((a, b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return da - db; // Ascending = Oldest at the top
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
    handleDefer: (row) => handleDeferOpen(row)
  }, isToday, departments, isTomorrowView);

  const showClosingWarning = isClosingTime && isToday && unfinishedCount > 0;

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

      </Box>

      {/* HEADER CONTROLS (FLEX-SHRINK: 0) */}
      <Box sx={{ flexShrink: 0, mb: 3 }}>
        <Paper sx={{ ...headerFlatStyle, p: 2, display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'center' }}>
        
        {/* LEFT SIDE: Title & Shift Toggle */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', flexGrow: 1 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: '900', color: '#5D4037', textShadow: '0px 1px 2px rgba(255,255,255,0.8)', lineHeight: 1.1 }}>
              Patient Queue
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: '1000', color: isTomorrowView ? '#1976D2' : '#5D4037', letterSpacing: 1 }}>
              {isTomorrowView ? '🚀 NEXT-DAY PREVIEW' : '🩺 ACTIVE CLINICAL SHIFT'}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#EFEBE9', borderRadius: '12px', border: '2px solid #5D4037', p: 0.5, boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)' }}>
             <Button 
                onClick={() => setIsTomorrowView(false)} 
                sx={{ 
                    fontWeight: '900', color: !isTomorrowView ? '#FFF' : '#5D4037',
                    bgcolor: !isTomorrowView ? '#5D4037' : 'transparent',
                    '&:hover': { bgcolor: !isTomorrowView ? '#3E2723' : 'rgba(0,0,0,0.04)' },
                    borderRadius: '8px', px: 2
                }}
             >
                TODAY
             </Button>
             <Button 
                onClick={() => setIsTomorrowView(true)} 
                sx={{ 
                    fontWeight: '900', color: isTomorrowView ? '#FFF' : '#5D4037',
                    bgcolor: isTomorrowView ? '#1976D2' : 'transparent',
                    '&:hover': { bgcolor: isTomorrowView ? '#1565C0' : 'rgba(0,0,0,0.04)' },
                    borderRadius: '8px', px: 2
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
           <Typography variant="body2" sx={{ color: '#5D4037', fontStyle: 'italic', fontWeight: '900', letterSpacing: 0.5, mr: 1 }}>
              {rows.length} {rows.length === 1 ? 'Record' : 'Records'}
           </Typography>


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
                    sx={(isClosingTime && isToday) ? {animation: 'pulse 1.5s infinite', fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5} : { fontWeight: '900', boxShadow: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}
                 >
                    CLEAR AND RESET QUEUE
                 </Button>
               </Box>
             </Tooltip>
           )}

           {isToday && !isTomorrowView && (
             <Button 
                variant="contained" startIcon={<PersonAddIcon />} 
                sx={{ bgcolor: '#FF9800', fontWeight: '900', boxShadow: '0 4px 15px rgba(255, 152, 0, 0.4)', textTransform: 'uppercase', letterSpacing: 0.5, px: 3 }} 
                onClick={() => setOpenWalkIn(true)}
             >
                Add Walk-In
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


      {/* DATA GRID (FLEX: 1 - THE FILLER) */}
      <Paper sx={{ ...clinicalFlatStyle, flex: 1, minHeight: 0, width: '100%', overflow: 'hidden' }}>
        <DataGrid 
          rows={getFilteredRows()} 
          columns={tableColumns} 
          hideFooter
          disableSelectionOnClick 
          disableColumnResize
          disableColumnReorder
          disableColumnMenu
          rowHeight={110} 
          columnHeaderHeight={48}
          getRowClassName={(params) => {
            const classes = [];
            if (params.row.priority === 'high') classes.push('emergency-row');
            if (params.row.isGroupHeader) classes.push('group-header');
            if (params.row.isGroupMid) classes.push('group-mid');
            if (params.row.isGroupTail) classes.push('group-tail');
            return classes.join(' ');
          }} 
          sx={{ 
            border: 'none', 
            bgcolor: 'transparent', 
            '& .MuiDataGrid-columnHeaders': { bgcolor: 'rgba(255, 255, 255, 0.4)', color: '#5D4037', fontWeight: 'bold', fontSize: '1.05rem', borderBottom: '1px solid rgba(255, 255, 255, 0.5)'}, 
            '& .emergency-row': { bgcolor: 'rgba(255, 235, 238, 0.8)' }, 
            '& .group-header': { borderTop: '2.5px solid #8B4513 !important', bgcolor: 'rgba(255, 255, 255, 0.45)' },
            '& .group-mid': { borderLeft: '5px solid #8B4513 !important', bgcolor: 'rgba(255, 255, 255, 0.45)' },
            '& .group-tail': { borderLeft: '5px solid #8B4513 !important', borderBottom: '2.5px solid #8B4513 !important', bgcolor: 'rgba(255, 255, 255, 0.45)' },
            '& .super-late-row': { bgcolor: 'rgba(255, 243, 224, 0.8)' }, 
            '& .MuiDataGrid-row:hover': { bgcolor: 'rgba(255, 255, 255, 0.6)' }, 
            '& .MuiDataGrid-cell': { borderBottom: '1px solid rgba(255, 255, 255, 0.2)' },
            '& .MuiDataGrid-cell[data-field="timing"]': { padding: 0 }
          }} 
        />
      </Paper>

      {/* EXTERNAL MODULES */}
      <ClinicalWorkspace open={openConsult} onClose={() => setOpenConsult(false)} patient={selectedRow} inventoryList={inventoryList} servicesList={servicesList} departments={departments}/>
      <POSModal open={openPOS} onClose={() => setOpenPOS(false)} patient={selectedRow} inventoryList={inventoryList} servicesList={servicesList} />
      <WalkInModal open={openWalkIn} onClose={() => setOpenWalkIn(false)} servicesList={servicesList} departments={departments}/>
      
      <AssignStaffModal 
        open={openAssign} 
        onClose={() => setOpenAssign(false)} 
        patient={selectedRow} 
        vetsList={vets} 
        activeAppointments={rows.filter(r =>['arrived', 'in-consult', 'confined'].includes(r.status))} 
        departments={departments} 
        mode={assignMode}
      />
      
      {/* THE NEW TRIAGE WIZARD SHIELD (PAGE-LEVEL OVERLAY) */}
      <EndOfDayModal 
        open={openEndDay} 
        leftoverPatients={leftoverPatients} 
        patientResolutions={patientResolutions} 
        auditReasons={auditReasons}
        targetDates={targetDates}
        onResolutionChange={React.useCallback((id, action, targetDate) => {
          setPatientResolutions(prev => ({ ...prev, [id]: action }));
          if (targetDate) {
            setTargetDates(prev => ({ ...prev, [id]: targetDate }));
          }
        }, [])}
        onAuditReasonChange={React.useCallback((id, reason) => {
          setAuditReasons(prev => ({ ...prev, [id]: reason }));
        }, [])}
        onBulkResolution={React.useCallback((action, reason) => {
           // PHASE 4.4.1: UNIVERSAL SILO-AWARE BATCH PROCESSING (Functional Update - NO DEPS)
           setPatientResolutions(prevRes => {
                const newRes = { ...prevRes };
                setAuditReasons(prevReasons => {
                    const newReasons = { ...prevReasons };
                    
                    leftoverPatients.forEach(p => {
                        const rtStatus = (p.status || "").toLowerCase();
                        const isOnline = rtStatus === 'pending';
                        const isScheduled = ['confirmed', 'scheduled'].includes(rtStatus);
                        const isActive = ['arrived', 'in-consult', 'dispensing', 'billing', 'payment', 'confined'].includes(rtStatus);

                        if ((action === 'defer' || action === 'cancel' || action === 'rebook') && isOnline) {
                            newRes[p.id] = action;
                            newReasons[p.id] = reason || "";
                        } else if ((action === 'no-show' || action === 'rebook' || action === 'cancel') && isScheduled) {
                            newRes[p.id] = action;
                            newReasons[p.id] = reason || "";
                        } else if ((action === 'carry-over' || action === 'cancel') && isActive) {
                            newRes[p.id] = action;
                            newReasons[p.id] = reason || "";
                        }
                    });
                    return newReasons;
                });
                return newRes;
           });
        }, [leftoverPatients])}
        onConfirmReset={(targetDates) => { confirmResetDay(false, targetDates); setIsForcedCleanup(false); }} 
        isForced={isForcedCleanup}
        departments={departments}
        onClose={React.useCallback(() => { setOpenEndDay(false); setIsForcedCleanup(false); }, [])} 
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
            disabled={!rejectReason.trim()}
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
                <ListItemText primary="🏥 Confine (Hospitalize)" sx={{ color: '#E65100' }} />
              </MenuItem>
              <MenuItem onClick={() => { 
                setTriageMode('rebook');
                setTriageDate(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
                setOpenTriageShield(true); 
                handleCloseMenu(); 
              }}>
                <ListItemIcon><HomeIcon fontSize="small" sx={{ color: '#E65100' }} /></ListItemIcon>
                <ListItemText primary="🏠 Rebook (Home Return)" sx={{ color: '#E65100' }} />
              </MenuItem>
           </>
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
        <MenuItem onClick={fetchHistory}>
           <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
           <ListItemText primary="View Medical History" />
        </MenuItem>

        {selectedRow?.statusHistory && selectedRow.statusHistory.length > 0 && (
          <MenuItem onClick={() => revertStatusWithReason(selectedRow)}>
             <ListItemIcon><UndoIcon fontSize="small" sx={{ color: '#E65100' }} /></ListItemIcon>
             <ListItemText primary="Revert Status (Undo)" sx={{ color: '#E65100' }} />
          </MenuItem>
        )}
        
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
            ml: 0, // Absolute Centered Overlay
            width: hoverMetadata.type === 'timing' ? 300 : 480,
            maxHeight: 600,
            overflowX: 'hidden',
            overflowY: 'auto',
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

                {hoverMetadata.type === 'notes' && (
                  <Box>
                    <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 2, display: 'block', mb: 1.5, opacity: 0.8 }}>
                      CLINICAL INTAKE / NOTES
                    </Typography>
                    <Typography sx={{ 
                      fontSize: '1.05rem', lineHeight: 1.6, color: '#3E2723', fontStyle: 'italic', whiteSpace: 'pre-wrap', 
                      fontFamily: '"Merriweather", serif',
                      fontWeight: 700,
                      letterSpacing: '-0.01rem'
                    }}>
                      "{hoverMetadata.data}"
                    </Typography>
                  </Box>
                )}

                {hoverMetadata.type === 'services' && (
                  <Box>
                    <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 1.5, display: 'block', mb: 1.5 }}>
                      SERVICE BUNDLE SUMMARY ({hoverMetadata.data?.length})
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, mb: 2, pb: 1, borderBottom: '1px dashed #eee' }}>
                        <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                            TOTAL TIME: {hoverMetadata.data?.reduce((acc, s) => acc + (s.duration || 0), 0)}m
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                            EST: ₱{hoverMetadata.data?.reduce((acc, s) => acc + (s.price || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Typography>
                    </Box>
                    <List sx={{ p: 0 }}>
                      {([...(hoverMetadata.data || [])].sort((a,b) => a.name.localeCompare(b.name))).map((svc, i) => {
                        const deptObj = (departments || []).find(d => d.name === svc.department);
                        const bColor = deptObj ? deptObj.color : '#616161';
                        return (
                          <ListItem key={i} sx={{ px: 1.5, py: 0.8, mb: 1, borderLeft: `6px solid ${bColor}`, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: '0 4px 4px 0' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{svc.name}</Typography>
                                <Typography variant="caption" sx={{ display: 'block', color: svc.staffName ? '#5D4037' : '#D32F2F', fontWeight: '900', fontSize: '0.65rem' }}>
                                  {svc.staffName ? `👤 ${svc.staffName}` : '❌ UNASSIGNED'}
                                </Typography>
                              </Box>
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="caption" sx={{ display: 'block', fontSize: '0.6rem', fontWeight: 'bold' }}>
                                  ₱{svc.price?.toLocaleString()}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', fontSize: '0.55rem', color: bColor, fontWeight: '900' }}>
                                  {svc.department?.toUpperCase()}
                                </Typography>
                              </Box>
                            </Box>
                          </ListItem>
                        );
                      })}
                    </List>
                  </Box>
                )}

                {hoverMetadata.type === 'identity' && hoverMetadata.data}

                {hoverMetadata.type === 'timing' && hoverMetadata.data && (
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 1.5 }}>
                        ⌛ CLINICAL TEMPORAL AUDIT
                        </Typography>
                        
                        {(() => {
                            const pulse = hoverMetadata.data.clinicalPulse || [];
                            const dates = [...new Set(pulse.map(p => {
                                const d = p.timestamp?.toDate ? p.timestamp.toDate() : new Date(p.timestamp);
                                return d.toDateString();
                            }))].sort((a,b) => new Date(a) - new Date(b));
                            
                            if (dates.length <= 1) return null;

                            return (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: '#F5F5F5', px: 1, borderRadius: 1 }}>
                                    <IconButton 
                                        size="small" 
                                        disabled={activeCaseDay === 0} 
                                        onClick={() => setActiveCaseDay(prev => Math.max(0, prev - 1))}
                                        sx={{ p: 0.2, color: '#5D4037' }}
                                    >
                                        <ArrowBackIosNewIcon sx={{ fontSize: 10 }} />
                                    </IconButton>
                                    <Typography sx={{ fontSize: '0.6rem', fontWeight: '1000', color: '#5D4037', minWidth: 50, textAlign: 'center' }}>
                                        DAY {activeCaseDay + 1} OF {dates.length}
                                    </Typography>
                                    <IconButton 
                                        size="small" 
                                        disabled={activeCaseDay === dates.length - 1} 
                                        onClick={() => setActiveCaseDay(prev => Math.min(dates.length - 1, prev + 1))}
                                        sx={{ p: 0.2, color: '#5D4037' }}
                                    >
                                        <ArrowForwardIosIcon sx={{ fontSize: 10 }} />
                                    </IconButton>
                                </Box>
                            );
                        })()}
                    </Box>

                    <Stack spacing={2} sx={{ position: 'relative', pl: 3 }}>
                        <Box sx={{ position: 'absolute', left: 8, top: 8, bottom: 8, width: '2px', borderLeft: '2px dashed #D7CCC8' }} />
                        
                        {(() => {
                            const pulse = hoverMetadata.data.clinicalPulse || [];
                            const dates = [...new Set(pulse.map(p => {
                                const d = p.timestamp?.toDate ? p.timestamp.toDate() : new Date(p.timestamp);
                                return d.toDateString();
                            }))].sort((a,b) => new Date(a) - new Date(b));

                            const targetDateStr = dates[activeCaseDay] || dates[dates.length - 1];
                            const filteredPulse = pulse.filter(p => {
                                const d = p.timestamp?.toDate ? p.timestamp.toDate() : new Date(p.timestamp);
                                return d.toDateString() === targetDateStr;
                            });

                            let events = [];
                            if (filteredPulse.length > 0) {
                                const voidedIds = new Set(pulse.filter(p => p.correctedEventId).map(p => p.correctedEventId));

                                events = filteredPulse.map(p => ({
                                    id: p.eventId,
                                    label: p.toStatus ? p.toStatus.toUpperCase() : 'EVENT',
                                    val: p.timestamp,
                                    by: p.staffName,
                                    note: p.note,
                                    type: p.type,
                                    isCorrection: p.isCorrection || p.type === 'CORRECTION',
                                    isVoided: voidedIds.has(p.eventId) 
                                }));
                            } else {
                                events = [
                                  { id: 'booked', label: hoverMetadata.data.ticketPrefix ? 'INTAKE CREATED' : 'BOOKED (ONLINE)', val: hoverMetadata.data.createdAt },
                                  { id: 'scheduled', label: hoverMetadata.data.ticketPrefix ? 'QUEUE POSITION' : 'APPOINTMENT SLOT', val: hoverMetadata.data.jsScheduled },
                                  { id: 'arrived', label: 'ARRIVED (CHECK-IN)', val: hoverMetadata.data.timeArrived, by: hoverMetadata.data.arrivedBy },
                                  { id: 'started', label: 'CONSULT STARTED', val: hoverMetadata.data.timeStarted, by: hoverMetadata.data.startedBy }
                                ].filter(i => i.val);
                            }

                            return events
                            .sort((a,b) => {
                                const da = a.val && a.val.toDate ? a.val.toDate() : new Date(a.val || 0);
                                const db = b.val && b.val.toDate ? b.val.toDate() : new Date(b.val || 0);
                                return da - db;
                            })
                            .map((item, idx, filteredArray) => {
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

                    <Box sx={{ mt: 2, pt: 1.5, borderTop: "1px solid #D7CCC8" }}>
                        {(() => {
                            const resolveDate = (d) => {
                               if (!d) return null;
                               if (d.toDate) return d.toDate();
                               const parsed = new Date(d);
                               return isNaN(parsed.getTime()) ? null : parsed;
                            };

                            const sch = resolveDate(hoverMetadata.data.jsScheduled);
                            const arr = resolveDate(hoverMetadata.data.timeArrived);
                            const booked = resolveDate(hoverMetadata.data.createdAt);
                            const completed = resolveDate(hoverMetadata.data.timeCompleted);
                            
                            const puncDiff = arr && sch ? Math.round((arr - sch) / 60000) 
                                           : (!arr && sch) ? Math.round((currentTime - sch) / 60000)
                                           : 0;
                            
                            const isFinished = ["done", "cancelled"].includes(hoverMetadata.data.status);
                            const waitEnd = isFinished && completed ? completed : currentTime;
                            
                            const waitStart = arr || (hoverMetadata.data.status === "pending" ? booked : sch) || currentTime;
                            const totalWaitDiff = Math.round((waitEnd - (waitStart || currentTime)) / 60000);

                            const puncColor = puncDiff > 15 ? "#D32F2F" : "#2E7D32";
                            const waitColor = totalWaitDiff > 60 ? "#D32F2F" : "#5D4037";

                            return (
                                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                    <Box>
                                        <Typography variant="caption" sx={{ fontWeight: "1000", color: "#5D4037", letterSpacing: 0.5, display: "block", fontSize: "0.6rem" }}>PUNCTUALITY</Typography>
                                        <Typography sx={{ fontWeight: "1000", color: puncColor, fontSize: "0.8rem" }}>
                                            {!arr 
                                                ? (puncDiff > 1 ? "LATE (" + formatDuration(puncDiff) + ")" : "PENDING")
                                                : (Math.abs(puncDiff) <= 5 ? "ON-TIME" : formatDuration(Math.abs(puncDiff)) + " " + (puncDiff > 0 ? "LATE" : "EARLY"))
                                            }
                                        </Typography>
                                    </Box>
                                    <Box sx={{ textAlign: "right" }}>
                                        <Typography variant="caption" sx={{ fontWeight: "1000", color: "#5D4037", letterSpacing: 0.5, display: "block", fontSize: "0.6rem" }}>TOTAL WAIT</Typography>
                                        <Typography sx={{ fontWeight: "1000", color: waitColor, fontSize: "0.8rem" }}>
                                            {formatDuration(totalWaitDiff)}
                                        </Typography>
                                        <Typography variant="caption" sx={{ fontWeight: "1000", color: "#1A1A1A", letterSpacing: 0.5, display: "block", fontSize: "0.6rem", mt: 0.5 }}>TOTAL TENURE</Typography>
                                        <Typography sx={{ fontWeight: "1000", color: "#5D4037", fontSize: "0.75rem" }}>
                                            {booked ? formatTenure(Math.round((currentTime - booked) / 60000)) : "NEW"}
                                        </Typography>
                                    </Box>
                                </Box>
                            );
                        })()}
                    </Box>
                  </Box>
                )}
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

            <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>

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
          <Button onClick={saveEdit} variant="contained" sx={{ bgcolor: '#5D4037', fontWeight: '1000', px: 4 }}>SAVE CLINICAL IDENTITY</Button>
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
            disabled={!newDate || !auditReason.trim()}
            sx={{ bgcolor: '#1976D2', fontWeight: 'bold', '&.Mui-disabled': { bgcolor: '#e0e0e0' } }}
          >
            Update Schedule
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openHistory} onClose={() => setOpenHistory(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: '1000', color: '#5D4037' }}>Patient Medical History</DialogTitle>
        <DialogContent>
          <List>
            {historyList.length === 0 ? <Typography sx={{ fontStyle: 'italic', color: '#9E9E9E', p: 3, textAlign: 'center' }}>No historical records found for this patient.</Typography> : 
              historyList.map((h, i) => (
                <Paper key={i} sx={{ p: 2, mb: 2, bgcolor: '#F5F5F5', borderLeft: '5px solid #5D4037' }}>
                   <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#757575' }}>{h.date?.toDate().toLocaleDateString()} ● {h.type || 'Clinical Record'}</Typography>
                   <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>{h.notes}</Typography>
                </Paper>
              ))
            }
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenHistory(false)} sx={{ fontWeight: 'bold' }}>Close</Button>
        </DialogActions>
      </Dialog>


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
            disabled={!revertReason.trim()}
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
            disabled={!auditReason.trim()}
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
                      '& fieldset': { borderColor: !auditReason.trim() ? '#D32F2F' : '#D32F2F' }
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
            disabled={!auditReason.trim()}
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
          {triageMode === 'hospitalize' ? 'PATIENT HOSPITALIZATION' : 'PATIENT REBOOKING'}
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
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            {[
              { label: 'TOMO', val: new Date(Date.now() + 86400000).toISOString().split('T')[0] },
              { label: '+1D', val: new Date(Date.now() + 172800000).toISOString().split('T')[0] },
              { label: '+1W', val: new Date(Date.now() + 604800000).toISOString().split('T')[0] },
            ].map(btn => (
              <Button 
                key={btn.label}
                variant={triageDate === btn.val ? "contained" : "outlined"}
                size="small"
                onClick={() => setTriageDate(btn.val)}
                sx={{ 
                  fontWeight: '1000', 
                  borderRadius: 1,
                  bgcolor: triageDate === btn.val ? '#E65100' : 'transparent',
                  color: triageDate === btn.val ? '#FFF' : '#E65100',
                  borderColor: '#E65100'
                }}
              >
                {btn.label}
              </Button>
            ))}
            <TextField 
              type="date" 
              size="small" 
              value={triageDate} 
              onChange={(e) => setTriageDate(e.target.value)} 
              sx={{ flexGrow: 1, '& .MuiInputBase-input': { fontWeight: '1000', fontSize: '0.75rem' } }}
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
            onClick={() => {
              // EXECUTION: Re-using the core rollover batch logic with a 1-patient array
              confirmResetDay(false, { [selectedRow.id]: triageDate }, { [selectedRow.id]: triageMode }, { [selectedRow.id]: triageReason });
              setOpenTriageShield(false);
              setTriageReason("");
            }} 
            variant="contained" 
            disabled={!triageReason.trim()}
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
    </Box>
  );
}

// THE CLINICAL PULSE EFFECT
const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0.7); }
  70% { box-shadow: 0 0 0 10px rgba(211, 47, 47, 0); }
  100% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0); }
`;
