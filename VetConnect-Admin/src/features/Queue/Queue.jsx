import React, { useEffect, useState, useRef, useMemo } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { 
  Box, Typography, Paper, IconButton, Tooltip, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button,
  Tabs, Tab, Menu, MenuItem, ListItemIcon, ListItemText, Divider, List, ListItem, Alert,
  Popover, Chip
} from '@mui/material';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, where, getDocs, writeBatch, getDoc } from 'firebase/firestore';

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
import WarningIcon from '@mui/icons-material/Warning';
import NightlightRoundIcon from '@mui/icons-material/NightlightRound';

// THE FIX: Removed static MAX_CAGES constant. Pulled from clinic_settings/general instead.
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

// --- 📡 FORENSIC TEMPORAL ENGINE (Local Timezone Guard) ---
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
  const { changeStatus, revertStatus, markNoShow, rejectAppointment, quickAdmitER } = useQueueActions();

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
  const [targetDates, setTargetDates] = useState({}); // PHASE 2/3: RE-BOOKING WINDOWS
  const [isForcedCleanup, setIsForcedCleanup] = useState(false); // The Hostage Lock
  const [hasGhostPatients, setHasGhostPatients] = useState(false);

  const [openEdit, setOpenEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const[editPet, setEditPet] = useState('');
  const [openReschedule, setOpenReschedule] = useState(false);
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



  // --- 🛰️ UNIVERSAL CLINICAL HOVER ENGINE ---
  const [hoverAnchor, setHoverAnchor] = useState(null);
  const [hoverMetadata, setHoverMetadata] = useState({ type: null, data: null });

  const handleHoverStart = (event, type, data) => {
    if (!data) return;
    setHoverAnchor(event.currentTarget);
    setHoverMetadata({ type, data });
  };

  const handleHoverEnd = () => {
    setHoverAnchor(null);
    setHoverMetadata({ type: null, data: null });
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

  // --- 🛰️ SYNC CLINIC CONFIGURATION (CLOSING HOURS & CAPACITY) ---
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

      // TIER 2: THE FINAL PULSE CHECK (ZOMBIE PREVENTION)
      // We fetch a fresh snapshot of all audited IDs to ensure they haven't been resolved remotely.
      const freshSnap = await getDocs(query(collection(db, "appointments"), where("__name__", "in", leftoverPatients.map(p => p.id))));
      const freshStatuses = {};
      freshSnap.docs.forEach(doc => { freshStatuses[doc.id] = doc.data().status; });

      // THE "RACE CONDITION" LOCK (System Table Check)
      const queueSnap = await getDoc(doc(db, "queue", "daily_queue"));
      if (queueSnap.exists() && queueSnap.data().lastResetDate === todayStr && !isSilent && !isForcedCleanup) {
         alert("Data Protected: Another staff member has already reset the queue for today.");
         setOpenEndDay(false);
         setHasGhostPatients(false);
         setIsForcedCleanup(false);
         return;
      }

      const batch = writeBatch(db); 
      const targetDate = new Date(); 
      targetDate.setHours(8, 0, 0, 0); 

      leftoverPatients.forEach((patient) => { 
        const oldRef = doc(db, "appointments", patient.id); 
        const currentStatus = (freshStatuses[patient.id] || patient.status || 'unknown').toLowerCase();
        
        // --- 🧊 THE ZOMBIE BYPASS: If they were resolved remotely, WE SKIP THEM! ---
        const isResolvedRemotely = ['completed', 'done', 'cancelled', 'no-show', 'carried-over'].includes(currentStatus);
        if (isResolvedRemotely) {
           console.log(`[Forensic Guard] Skipping Zombie Update for ${patient.petName} (Already Resolved: ${currentStatus})`);
           return; 
        }

        const rawStatus = (patient.status || 'unknown').toLowerCase();
        const action = patient.status === 'confined' ? 'confined' : (patientResolutions[patient.id] || (patient.status === 'pending' ? 'defer' : 'cancel'));
        const staffSignature = profile?.fullName || user?.email || "System Triage";
        const forensicNote = auditReasons[patient.id] || "No reason provided in triage.";
        const isHighStakes = ['arrived', 'in-consult', 'dispensing', 'billing', 'confirmed', 'scheduled', 'payment'].includes(rawStatus);

        // --- 🧬 THE BIOMETRIC HEAL: Save Wizard corrections to the Master Pet Record! ---
        const currentGender = String(patient.petGender || '').toUpperCase();
        const isHealedGender = patient.petGender && currentGender !== 'UNKNOWN' && currentGender !== 'SEX UNK' && currentGender !== '???';
        if (patient.petId && isHealedGender) {
           const petRef = doc(db, "pets", patient.petId);
           batch.update(petRef, { 
              gender: patient.petGender, // Sync master biometrics
              breed: patient.petBreed,
              isNeutered: patient.petIsNeutered 
           });
        }

        if (action === 'rebook' || action === 'confined') { 
          const manualDate = targetDateMap[patient.id] ? new Date(`${targetDateMap[patient.id]}T08:00:00`) : targetDate;
          
          if (patient.status === 'carried-over') {
            batch.update(oldRef, { 
               scheduledDate: Timestamp.fromDate(manualDate),
               caseDay: (patient.caseDay || 1) + 1,
               processedBy: staffSignature,
               processedAt: Timestamp.now()
            });
          } else {
            batch.update(oldRef, { 
               status: 'carried-over', 
               notes: `(Re-booked by ${staffSignature}) ${patient.notes || ""}`,
               processedBy: staffSignature,
               processedAt: Timestamp.now()
            }); 
            
            const newDocRef = doc(collection(db, "appointments")); 
            const { id, jsScheduled, jsArrived, jsStarted, jsCompleted, queueNumber, ticketPrefix, timeArrived, timeStarted, timeCompleted, ...preservedData } = patient;
            
            // THE ANCESTRY LOCK: Ensure original createdAt is NEVER lost during generation transfer!
            batch.set(newDocRef, { 
               ...preservedData,
               status: action === 'confined' ? 'confined' : 'confirmed', 
               queueNumber: null, 
               ticketPrefix: null, 
               scheduledDate: Timestamp.fromDate(manualDate), 
               createdAt: patient.createdAt || Timestamp.now(), // THE HEALING FIX: Preserve Original Birth Date
               originApptId: patient.id,
               caseDay: (patient.caseDay || 1) + 1,
               notes: `[Triage Re-book] ${patient.notes || "No original notes."}`, 
               processedBy: staffSignature,
               assignedVet: action === 'confined' ? patient.assignedVet : "Unassigned" 
            }); 
          }
        } else if (action === 'defer') {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const triageKey = tomorrow.toISOString().split('T')[0];
          
          batch.update(oldRef, {
             triageDate: triageKey,
             notes: `(Deferred to next shift by ${staffSignature}) ${patient.notes || ""}`,
             processedBy: staffSignature,
             processedAt: Timestamp.now(),
             lastTriagedAt: Timestamp.now()
          });
        } else {
          // --- ⚖️ THE FORENSIC TRIAGE: Map the terminal status correctly! ---
          const finalStatus = action === 'no-show' ? 'no-show' : 'cancelled';
          const defaultReason = action === 'no-show' ? "Client failed to arrive" : "Appointment cancelled during triage";

          batch.update(oldRef, { 
             status: finalStatus, 
             rejectReason: `[Triage Audit] ${forensicNote}`,
             processedBy: staffSignature,
             processedAt: Timestamp.now(),
             isForensicAudit: isHighStakes, // BOTH Cancel and No-Show are High-Stakes Audit
             auditReason: forensicNote || defaultReason
          }); 
        }
      }); 

      const queueRef = doc(db, "queue", "daily_queue"); 
      batch.update(queueRef, { currentServing: 0, currentPrefix: '', lastNumberIssued: 0, status: 'active', lastResetDate: todayStr }); 
      await batch.commit(); 
      
      setOpenEndDay(false); 
      setIsForcedCleanup(false);
      setHasGhostPatients(false); 
      if (!isSilent) alert("Cleanup Complete: Board is ready."); 
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

        // THE FIX: "Live Identity Healing" — Restore missing biometrics from the CRM master record (Resilience Patch)
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
        setTargetDates({}); // Reset re-booking windows
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
      // --- 🛡️ CLINICAL REALITY PRE-CHECK ---
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
            `❌ STAFFING GAP DETECTED\n\nCannot accept this appointment. There are currently no staff members assigned to the following departments: ${missingDepts.join(", ")}.\n\nPlease assign staff to these departments in the Staff module before accepting.`
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
  const handleEditOpen = () => { setEditName(selectedRow.ownerName||''); setEditPet(selectedRow.petName); setOpenEdit(true); handleCloseMenu(); };
  const saveEdit = async () => { await updateDoc(doc(db, "appointments", selectedRow.id), { ownerName: editName, petName: editPet }); setOpenEdit(false); };
  const handleRescheduleOpen = () => { setOpenReschedule(true); handleCloseMenu(); };
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
    if(!newDate) return; 

    try {
        const currentSchDate = selectedRow.scheduledDate ? selectedRow.scheduledDate.toDate() : (selectedRow.createdAt?.toDate() || new Date());
        const updatedSchDate = new Date(newDate);

        // GAP B FIX: The Reliability Highlight (Day-Slip Detection)
        const currentDayStr = currentSchDate.toISOString().split('T')[0];
        const updatedDayStr = updatedSchDate.toISOString().split('T')[0];
        
        let updateData = { 
            scheduledDate: Timestamp.fromDate(updatedSchDate), 
            status: 'confirmed',
            rescheduledBy: profile?.fullName || 'System/Admin'
        };

        if (currentDayStr !== updatedDayStr) {
            updateData.caseDay = (selectedRow.caseDay || 1) + 1;
        }

        await updateDoc(doc(db, "appointments", selectedRow.id), updateData);
        setOpenReschedule(false); 
    } catch (e) {
        alert("Reschedule failed: " + e.message);
    }
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
    const qGhosts = query(
      collection(db, "appointments"),
      where("status", "in",["pending", "confirmed", "arrived", "in-consult", "confined", "on-hold", "dispensing", "billing"]),
      where("scheduledDate", "<", Timestamp.fromDate(todayStart))
    );

    const unsubGhosts = onSnapshot(qGhosts, async (snapshot) => {
      if (snapshot.empty) {
        setHasGhostPatients(false);
        setOpenEndDay(false);
        setIsForcedCleanup(false);
        setLeftoverPatients([]);
      } else {
        setHasGhostPatients(true);
        if (isToday) {
            const ghosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
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

            setLeftoverPatients(enrichedGhosts);
            
            // PHASE 3: THE HARD-GATE GHOST HUNTER
            // Ensure Legacy records (Ghosts) follow the Clean-Slate security rules
            setPatientResolutions(prev => {
              const updated = { ...prev };
              enrichedGhosts.forEach(p => {
                if (!updated[p.id]) {
                  const rawStatus = (p.status || 'unknown').toLowerCase();
                  const isHighStakes = ['arrived', 'in-consult', 'dispensing', 'billing', 'confirmed', 'scheduled', 'payment'].includes(rawStatus);

                  if (rawStatus === 'confined') updated[p.id] = 'confined';
                  else if (rawStatus === 'pending') updated[p.id] = 'defer';
                  else if (isHighStakes) updated[p.id] = null; // FORCE MANUAL CHOICE
                  else updated[p.id] = 'cancel';
                }
              });
              return updated;
            });

            // PHASE 3: Update touched set for ghosts (Online are auto-passed)
            setTouchedPatients(prev => {
              const updated = new Set(prev);
              enrichedGhosts.forEach(p => {
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
        return appt.jsScheduled >= start && appt.jsScheduled <= end;
      });

      // --- 🦴 PRIMARY SORT (Priority -> Time -> Owner) ---
      list.sort((a, b) => {
        const priorityA = a.priority === 'high' ? 0 : 1;
        const priorityB = b.priority === 'high' ? 0 : 1;
        if (priorityA !== priorityB) return priorityA - priorityB;

        const timeA = a.jsScheduled ? a.jsScheduled.getTime() : (a.createdAt?.toDate().getTime() || 0);
        const timeB = b.jsScheduled ? b.jsScheduled.getTime() : (b.createdAt?.toDate().getTime() || 0);
        if (timeA !== timeB) return timeA - timeB;

        return (a.ownerId || '').localeCompare(b.ownerId || '');
      });

      // --- 🐾 THE BOOKING BRIDGE (Grouping Detection) ---
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

    const qGhost = query(
      collection(db, "appointments"),
      where("status", "in", ['pending', 'confirmed', 'arrived', 'in-consult', 'dispensing', 'billing', 'scheduled']),
      where("scheduledDate", "<", Timestamp.fromDate(today))
    );

    const unsubscribeGhosts = onSnapshot(qGhost, (snapshot) => {
      if (!snapshot.empty) {
        setLeftoverPatients(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
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
      countOnline: rows.filter(r => r.status === 'pending').length,
      countScheduled: rows.filter(r => r.status === 'confirmed').length,
      countArrived: rows.filter(r => r.status === 'arrived').length,
      countStarted: rows.filter(r => r.status === 'in-consult' || r.status === 'confined' || r.status === 'on-hold').length,
      countDispense: rows.filter(r => r.status === 'dispensing').length,
      countPayment: rows.filter(r => r.status === 'billing').length,
      countDone: rows.filter(r => r.status === 'completed' || r.status === 'carried-over').length,
      countCancelled: rows.filter(r => r.status === 'cancelled' || r.status === 'no-show').length,
    };
  }, [rows]);

  const unfinishedCount = countOnline + countScheduled + countArrived + countStarted + countDispense + countPayment;

  const getFilteredRows = () => {
    let filtered = [];
    switch (tabValue) {
      case 0: filtered = rows.filter(r => r.status === 'pending'); break;
      case 1: filtered = rows.filter(r => r.status === 'confirmed'); break;
      case 2: filtered = rows.filter(r => r.status === 'arrived'); break;
      case 3: filtered = rows.filter(r => r.status === 'in-consult' || r.status === 'confined' || r.status === 'on-hold'); break;
      case 4: filtered = rows.filter(r => r.status === 'dispensing'); break;
      case 5: filtered = rows.filter(r => r.status === 'billing'); break;
      case 6: filtered = rows.filter(r => r.status === 'completed' || r.status === 'carried-over'); break;
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
    handleQuickNoShow: async (row) => { 
      try {
        await markNoShow(row); 
      } catch (e) {
        alert(e.message); // Catching the "Integrity Refusal"
      }
      }
    },
    handleRescheduleOpen: (row) => { setSelectedRow(row); setOpenReschedule(true); },
    handleDefer: async (row) => {
      try {
        await deferAppointment(row.id, profile?.fullName);
      } catch (e) {
        alert("Deferral failed: " + e.message);
      }
    }
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
        onResolutionChange={(id, action) => {
          setPatientResolutions(prev => ({ ...prev, [id]: action }));
          // CLEAR REASON IF NO LONGER A TERMINAL ACTION (CANCEL/NO-SHOW)
          if (action !== 'cancel' && action !== 'no-show') {
            setAuditReasons(prev => { const upd = {...prev}; delete upd[id]; return upd; });
          }
        }}
        onAuditReasonChange={(id, reason) => {
          setAuditReasons(prev => ({ ...prev, [id]: reason }));
        }}
        onBulkResolution={(action, reason) => {
           // PHASE 6: SILO-AWARE BATCH PROCESSING
           const newRes = { ...patientResolutions };
           const newReasons = { ...auditReasons };

           leftoverPatients.forEach(p => {
             const rtStatus = (p.status || "").toLowerCase();
             
             // SILO MAPPING: 
             // If action is Defer/Cancel -> Target Pending
             // If action is No-Show -> Target Scheduled/Confirmed
             const isOnline = rtStatus === 'pending';
             const isScheduled = ['confirmed', 'scheduled'].includes(rtStatus);

             if ((action === 'defer' || action === 'cancel') && isOnline) {
               newRes[p.id] = action;
               newReasons[p.id] = reason || "";
             } else if (action === 'no-show' && isScheduled) {
               newRes[p.id] = action;
               newReasons[p.id] = reason || "";
             }
           });
           setPatientResolutions(newRes);
           setAuditReasons(newReasons);
        }}
        onConfirmReset={(targetDates) => { confirmResetDay(false, targetDates); setIsForcedCleanup(false); }} 
        isForced={isForcedCleanup}
        departments={departments}
        onClose={() => { setOpenEndDay(false); setIsForcedCleanup(false); }} 
      />
      
      {/* INTERNAL MODALS */}
      <Dialog 
        open={openReject} 
        onClose={() => setOpenReject(false)}
        PaperProps={{ 
          sx: { 
            border: '2px solid #5D4037', borderRadius: 1, p: 1,
            boxShadow: '8px 8px 0px rgba(93, 64, 55, 0.1)'
          } 
        }}
      >
        <DialogTitle sx={{ 
            bgcolor: '#FFF8E1', color: '#5D4037', fontWeight: '1000', borderBottom: '1px solid #D7CCC8',
            display: 'flex', alignItems: 'center', gap: 1, py: 2
        }}>
          <PersonOffIcon /> CANCEL APPOINTMENT
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Typography variant="overline" sx={{ fontWeight: '1000', color: '#9E9E9E', letterSpacing: 1.5 }}>
            QUICK CHOICE REASON
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1, mb: 3 }}>
            {['CLIENT REQUEST', 'VET UNAVAILABLE', 'EMERGENCY', 'DUPLICATE', 'WRONG DATE'].map((reason) => (
              <Chip 
                key={reason} 
                label={reason} 
                onClick={() => setRejectReason(reason)}
                sx={{ 
                    fontWeight: '900', fontSize: '0.65rem', 
                    border: '1.5px solid #5D4037',
                    bgcolor: rejectReason === reason ? '#5D4037' : 'transparent',
                    color: rejectReason === reason ? '#FFF' : '#5D4037',
                    '&:hover': { bgcolor: rejectReason === reason ? '#3E2723' : '#F5F5F5' }
                }}
              />
            ))}
          </Box>
          <TextField 
            autoFocus 
            margin="dense" 
            label="Manual Details / Notes" 
            fullWidth 
            multiline
            rows={2}
            value={rejectReason} 
            onChange={(e) => setRejectReason(e.target.value)} 
            sx={{ 
                '& .MuiOutlinedInput-root': { fontWeight: '900', bgcolor: '#F9FBE7' }
            }} 
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#F5F5F5', borderTop: '1px solid #D7CCC8' }}>
          <Button onClick={() => setOpenReject(false)} sx={{ fontWeight: 'bold', color: '#5D4037' }}>Go Back</Button>
          <Button 
            onClick={confirmReject} 
            variant="contained" 
            sx={{ 
                bgcolor: '#5D4037', fontWeight: '1000', px: 4,
                '&:hover': { bgcolor: '#3E2723' }
            }}
          >
            Confirm Cancellation
          </Button>
        </DialogActions>
      </Dialog>

      {/* 🛡️ THE FORENSIC REVERT OVERLAY (UNDO ACCOUNTABILITY) */}
      <Dialog 
        open={openRevert} 
        onClose={() => setOpenRevert(false)}
        PaperProps={{ 
          sx: { 
            border: '2px solid #E65100', borderRadius: 1.5, p: 0.5,
            boxShadow: '12px 12px 0px rgba(230, 81, 0, 0.1)'
          } 
        }}
      >
        <DialogTitle sx={{ 
            bgcolor: '#FFF3E0', color: '#E65100', fontWeight: '1000', borderBottom: '1px solid #FFE0B2',
            display: 'flex', alignItems: 'center', gap: 1.5, py: 2
        }}>
          <UndoIcon /> REVERT FORENSIC STATUS
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: '800', color: '#5D4037', mb: 2 }}>
            You are backtracking clinical progress for <strong>{selectedRow?.petName}</strong>. This action is audited.
          </Typography>
          <Typography variant="overline" sx={{ fontWeight: '1000', color: '#9E9E9E', letterSpacing: 1.5 }}>
            QUICK CHOICE REASON
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1, mb: 3 }}>
            {['MISCLICK', 'PROTOCOL CHANGE', 'RESUMING CONSULT', 'DATA CORRECTION'].map((reason) => (
              <Chip 
                key={reason} 
                label={reason} 
                onClick={() => setRevertReason(reason)}
                sx={{ 
                    fontWeight: '900', fontSize: '0.65rem', 
                    border: '1.5px solid #E65100',
                    bgcolor: revertReason === reason ? '#E65100' : 'transparent',
                    color: revertReason === reason ? '#FFF' : '#E65100',
                    '&:hover': { bgcolor: revertReason === reason ? '#BF360C' : '#FFF9F1' }
                }}
              />
            ))}
          </Box>
          <TextField 
            autoFocus 
            margin="dense" 
            label="Provide Forensic Justification" 
            fullWidth 
            multiline
            rows={2}
            value={revertReason} 
            onChange={(e) => setRevertReason(e.target.value)} 
            placeholder="e.g., Accidental check-out, staff corrected medical record..."
            sx={{ 
                '& .MuiOutlinedInput-root': { fontWeight: '900', bgcolor: '#FFF9F1' }
            }} 
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#F5F5F5', borderTop: '1px solid #DDD' }}>
          <Button onClick={() => setOpenRevert(false)} sx={{ fontWeight: 'bold', color: '#757575' }}>Go Back</Button>
          <Button 
            onClick={confirmRevert} 
            variant="contained" 
            disabled={!revertReason.trim()}
            sx={{ 
                bgcolor: '#E65100', fontWeight: '1000', px: 4,
                '&:hover': { bgcolor: '#BF360C' },
                '&.Mui-disabled': { bgcolor: '#BDBDBD', opacity: 0.5 }
            }}
          >
            CONFIRM REVERT
          </Button>
        </DialogActions>
      </Dialog>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleCloseMenu}>
        <MenuItem onClick={() => { revertStatusWithReason(selectedRow); handleCloseMenu(); }}>
          <ListItemIcon><UndoIcon fontSize="small" color="warning"/></ListItemIcon> 
          <ListItemText sx={{color: '#E65100'}}>Revert Step (Undo)</ListItemText>
        </MenuItem>
        
        <Divider />
        
        {!['completed', 'carried-over', 'cancelled', 'payment'].includes(selectedRow?.status) && (
          <MenuItem onClick={() => handleOpenAssign(selectedRow)}>
            <ListItemIcon><EditIcon fontSize="small"/></ListItemIcon> 
            <ListItemText>Re-assign Staff</ListItemText>
          </MenuItem>
        )}

        <MenuItem onClick={handleEditOpen}>
          <ListItemIcon><EditIcon fontSize="small"/></ListItemIcon> 
          <ListItemText>Edit Details</ListItemText>
        </MenuItem>
        
        {['confirmed', 'pending'].includes(selectedRow?.status) && (
          <MenuItem onClick={handleRescheduleOpen}>
            <ListItemIcon><EventIcon fontSize="small"/></ListItemIcon> 
            <ListItemText>Reschedule</ListItemText>
          </MenuItem>
        )}
        
        <MenuItem onClick={fetchHistory}>
          <ListItemIcon><HistoryIcon fontSize="small"/></ListItemIcon> 
          <ListItemText>History</ListItemText>
        </MenuItem>
        
        <Divider />
        
        {['confirmed', 'pending', 'arrived'].includes(selectedRow?.status) && (
          <MenuItem 
            onClick={async () => { 
                await actions.handleQuickNoShow(selectedRow); 
                handleCloseMenu(); 
            }} 
            sx={{color:'error.main'}}
          >
            <ListItemIcon><PersonOffIcon fontSize="small" color="error"/></ListItemIcon> 
            <ListItemText>No Show</ListItemText>
          </MenuItem>
        )}

        <MenuItem onClick={() => {
            setSelectedId(selectedRow?.id);
            setOpenReject(true);
            handleCloseMenu();
          }} sx={{color:'error.main'}}>
          <ListItemIcon><PersonOffIcon fontSize="small" color="error"/></ListItemIcon> 
          <ListItemText>Cancel Appointment</ListItemText>
        </MenuItem>
      </Menu>
      <Dialog open={openEdit} onClose={() => setOpenEdit(false)}><DialogTitle>Edit</DialogTitle><DialogContent><TextField margin="dense" label="Owner" fullWidth value={editName} onChange={(e) => setEditName(e.target.value)} /><TextField margin="dense" label="Pet" fullWidth value={editPet} onChange={(e) => setEditPet(e.target.value)} /></DialogContent><DialogActions><Button onClick={() => setOpenEdit(false)}>Cancel</Button><Button onClick={saveEdit} variant="contained">Save</Button></DialogActions></Dialog>
      <Dialog open={openReschedule} onClose={() => setOpenReschedule(false)}><DialogTitle>Reschedule</DialogTitle><DialogContent><TextField type="datetime-local" fullWidth value={newDate} onChange={(e) => setNewDate(e.target.value)} /></DialogContent><DialogActions><Button onClick={() => setOpenReschedule(false)}>Cancel</Button><Button onClick={saveReschedule} variant="contained">Update</Button></DialogActions></Dialog>
      <Dialog open={openHistory} onClose={() => setOpenHistory(false)} maxWidth="sm" fullWidth><DialogTitle>Medical History</DialogTitle><DialogContent dividers>{historyList.length === 0 ? <Typography>No records.</Typography> : <List>{historyList.map((rec,i) => <ListItem key={i} divider><ListItemText primary={rec.diagnosis} secondary={rec.treatment}/></ListItem>)}</List>}</DialogContent><DialogActions><Button onClick={() => setOpenHistory(false)}>Close</Button></DialogActions></Dialog>
      
      {/* 📡 UNIVERSAL CLINICAL HUD (NOTES & SERVICES) */}
      <Popover
        id="clinical-hover-popover"
        sx={{ pointerEvents: 'none' }}
        open={Boolean(hoverAnchor)}
        anchorEl={hoverAnchor}
        anchorOrigin={{ vertical: 'center', horizontal: 'center' }}
        transformOrigin={{ vertical: 'center', horizontal: 'center' }}
        onClose={handleHoverEnd}
        disableRestoreFocus
        PaperProps={{
          sx: {
            p: 3, 
            width: hoverMetadata.type === 'timing' ? 260 : 440,
            maxHeight: 520,
            overflow: 'hidden',
            pointerEvents: 'none',
            bgcolor: '#FFF', 
            border: '2px solid #5D4037',
            boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
            borderRadius: 2
          }
        }}
      >
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

        {hoverMetadata.type === 'timing' && hoverMetadata.data && (
          <Box>
            <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 1.5, display: 'block', mb: 2 }}>
              ⌛ CLINICAL TEMPORAL AUDIT
            </Typography>
            <Stack spacing={2} sx={{ position: 'relative', pl: 3 }}>
                <Box sx={{ position: 'absolute', left: 8, top: 8, bottom: 8, width: '2px', borderLeft: '2px dashed #D7CCC8' }} />
                {[
                  { id: 'booked', label: 'BOOKED (ONLINE)', val: hoverMetadata.data.createdAt },
                  { id: 'scheduled', label: 'APPOINTMENT SLOT', val: hoverMetadata.data.jsScheduled },
                  { id: 'arrived', label: 'ARRIVED (CHECK-IN)', val: hoverMetadata.data.timeArrived, by: hoverMetadata.data.arrivedBy },
                  { id: 'started', label: 'CONSULT STARTED', val: hoverMetadata.data.timeStarted, by: hoverMetadata.data.startedBy }
                ]
                .filter(i => i.val)
                .sort((a,b) => {
                    const da = a.val.toDate ? a.val.toDate() : new Date(a.val);
                    const db = b.val.toDate ? b.val.toDate() : new Date(b.val);
                    return da - db;
                })
                .map((item, idx, filteredArray) => {
                  const isLast = idx === filteredArray.length - 1;
                  const date = item.val.toDate ? item.val.toDate() : new Date(item.val);
                  const color = isLast ? '#2E7D32' : '#9E9E9E';
                  let deltaLabel = null;
                  let deltaColor = '#5D4037';
                  
                  if (item.id === 'arrived') {
                    // PUNCTUALITY: Arrived vs. Scheduled
                    const schItem = filteredArray.find(i => i.id === 'scheduled');
                    if (schItem) {
                      const schDate = schItem.val.toDate ? schItem.val.toDate() : new Date(schItem.val);
                      const diff = Math.round((date - schDate) / 60000);
                      deltaLabel = diff > 0 ? `Punctuality: ${formatDuration(diff)} Late` : `Punctuality: ${formatDuration(diff)} Early`;
                    }
                  } else if (item.id === 'started') {
                    // LOBBY WAIT: Started vs. Arrived
                    const arrItem = filteredArray.find(i => i.id === 'arrived');
                    if (arrItem) {
                      const arrDate = arrItem.val.toDate ? arrItem.val.toDate() : new Date(arrItem.val);
                      const waitDiff = Math.round((date - arrDate) / 60000);
                      deltaLabel = `Lobby Wait: ${formatDuration(waitDiff)}`;
                      if (waitDiff >= 30) deltaColor = '#D32F2F';
                    }
                  }
                  
                  // LIVE DYNAMIC UPDATES (If it is the LAST element, we show the ticking clock)
                  if (isLast) {
                    if (item.id === 'started' && !['done', 'cancelled'].includes(hoverMetadata.data.status)) {
                      const consultDiff = Math.round((currentTime - date) / 60000);
                      deltaLabel = (deltaLabel ? deltaLabel + " | " : "") + `ACTIVE: ${formatDuration(consultDiff)} so far`;
                    } else if (item.id === 'arrived' && hoverMetadata.data.status === 'arrived') {
                       const lobbyWait = Math.round((currentTime - date) / 60000);
                       deltaLabel = `CURRENT LOBBY WAIT: ${formatDuration(lobbyWait)}`;
                       if (lobbyWait >= 20) deltaColor = '#D32F2F';
                    }
                  }

                  return (
                    <Box key={idx} sx={{ position: 'relative', mb: 0.5 }}>
                      <Box sx={{ position: 'absolute', left: -26, top: 4, width: 8, height: 8, borderRadius: '50%', bgcolor: color, zIndex: 5 }} />
                      <Typography variant="caption" sx={{ fontWeight: '1000', color: color, letterSpacing: 0.5, display: 'block', fontSize: '0.65rem' }}>{item.label}</Typography>
                      <Typography sx={{ fontWeight: '1000', color: isLast ? '#1A1A1A' : '#9E9E9E', fontSize: '0.85rem' }}>
                        {date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }).toUpperCase()} ● {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        {item.by && <span style={{ opacity: 0.6, fontWeight: '700', marginLeft: '6px' }}>● {item.by}</span>}
                      </Typography>
                      {deltaLabel && (
                        <Typography variant="caption" sx={{ fontStyle: 'italic', color: deltaColor, fontWeight: '800', fontSize: '0.62rem', display: 'block', mt: 0.2 }}>
                            ↳ {deltaLabel.toUpperCase()}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
            </Stack>
            <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid #D7CCC8' }}>
                {(() => {
                    const resolveDate = (d) => {
                       if (!d) return null;
                       if (d.toDate) return d.toDate();
                       const parsed = new Date(d);
                       return isNaN(parsed.getTime()) ? null : parsed;
                    };

                    const sch = resolveDate(hoverMetadata.data.jsScheduled);
                    const arr = resolveDate(hoverMetadata.data.timeArrived);
                    const completed = resolveDate(hoverMetadata.data.timeCompleted);
                    
                    // Punctuality Delta
                    const puncDiff = arr && sch ? Math.round((arr - sch) / 60000) 
                                   : (!arr && sch) ? Math.round((currentTime - sch) / 60000)
                                   : 0;
                    
                    const isFinished = ['done', 'cancelled'].includes(hoverMetadata.data.status);
                    const waitEnd = isFinished && completed ? completed : currentTime;
                    const totalWaitDiff = Math.round((waitEnd - (arr || sch || currentTime)) / 60000);

                    const severityColor = (puncDiff > 15 || totalWaitDiff > 60) ? '#D32F2F' : '#2E7D32';

                    return (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Box>
                                <Typography variant="caption" sx={{ fontWeight: '1000', color: '#9E9E9E', letterSpacing: 0.5, display: 'block', fontSize: '0.6rem' }}>PUNCTUALITY</Typography>
                                <Typography sx={{ fontWeight: '1000', color: severityColor, fontSize: '0.8rem' }}>
                                    {!arr 
                                        ? (puncDiff > 1 ? `LATE (${formatDuration(puncDiff)})` : 'PENDING')
                                        : (Math.abs(puncDiff) <= 5 ? 'ON-TIME' : `${formatDuration(Math.abs(puncDiff))} ${puncDiff > 0 ? 'LATE' : 'EARLY'}`)
                                    }
                                </Typography>
                            </Box>
                            <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="caption" sx={{ fontWeight: '1000', color: '#9E9E9E', letterSpacing: 0.5, display: 'block', fontSize: '0.6rem' }}>TOTAL WAIT</Typography>
                                <Typography sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.8rem' }}>
                                    {formatDuration(totalWaitDiff)}
                                </Typography>
                            </Box>
                        </Box>
                    );
                })()}
            </Box>
          </Box>
        )}
      </Popover>
    </Box>
  );
}