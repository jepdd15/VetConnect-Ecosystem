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

export default function Queue() {
  const [rows, setRows] = useState([]);
  const [vets, setVets] = useState([]); 
  const [inventoryList, setInventoryList] = useState([]); 
  const [servicesList, setServicesList] = useState([]); 
  const [departments, setDepartments] = useState([]);
  const [clinicSettings, setClinicSettings] = useState({ maxCages: 5, closeHour: 17 }); // Live Dynamic Configuration!
  const [tabValue, setTabValue] = useState(0); 
  const[filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const[currentTime, setCurrentTime] = useState(new Date());
  
  const { user, profile } = useUser(); // Forensic Attribution
  const { changeStatus, revertStatus, markNoShow, rejectAppointment, quickAdmitER } = useQueueActions();

  // THE FIX: isClosingTime now dynamically calculates against live clinicSettings!
  const isToday = new Date(filterDate).toDateString() === new Date().toDateString();
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
  const [isForcedCleanup, setIsForcedCleanup] = useState(false); // The Hostage Lock
  const [hasGhostPatients, setHasGhostPatients] = useState(false);

  const [openEdit, setOpenEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const[editPet, setEditPet] = useState('');
  const [openReschedule, setOpenReschedule] = useState(false);
  const [newDate, setNewDate] = useState('');
  const[openHistory, setOpenHistory] = useState(false);
  const [historyList, setHistoryList] = useState([]);

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

      // THE "RACE CONDITION" LOCK
      const queueSnap = await getDoc(doc(db, "queue", "daily_queue"));
      // BYPASS THE LOCK IF WE ARE IN GHOST HUNTER HOSTAGE MODE!
      if (queueSnap.exists() && queueSnap.data().lastResetDate === todayStr && !isSilent && !isForcedCleanup) {
         alert("Data Protected: Another staff member has already reset the queue for today.");
         setOpenEndDay(false);
         setHasGhostPatients(false);
         setIsForcedCleanup(false);
         return; // Abort the write!
      }

      const batch = writeBatch(db); 
      
      // If we are rebooking, we set the date to TODAY at 8:00 AM
      const targetDate = new Date(); 
      targetDate.setHours(8, 0, 0, 0); 

      leftoverPatients.forEach((patient) => { 
        const oldRef = doc(db, "appointments", patient.id); 
        const action = patient.status === 'confined' ? 'confined' : (targetDateMap[patient.id] ? 'rebook' : (patientResolutions[patient.id] || 'cancel'));
        const staffSignature = profile?.fullName || user?.email || "System Triage";

        if (action === 'rebook' || action === 'confined') { 
          // THE TEMPORAL BRIDGE: Convert manual string date to Date @ 08:00 AM
          const manualDate = targetDateMap[patient.id] ? new Date(`${targetDateMap[patient.id]}T08:00:00`) : targetDate;
          
          if (patient.status === 'carried-over') {
            batch.update(oldRef, { 
               scheduledDate: Timestamp.fromDate(manualDate),
               caseDay: (patient.caseDay || 1) + 1, // THE RE-INKING: Ensuring counts don't stop!
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
            // eslint-disable-next-line no-unused-vars
            const { id, jsScheduled, jsArrived, jsStarted, jsCompleted, queueNumber, ticketPrefix, timeArrived, timeStarted, timeCompleted, ...preservedData } = patient;
            
            batch.set(newDocRef, { 
               ...preservedData,
               status: action === 'confined' ? 'confined' : 'confirmed', 
               queueNumber: null, 
               ticketPrefix: null, 
               scheduledDate: Timestamp.fromDate(manualDate), 
               createdAt: Timestamp.now(), 
               originApptId: patient.id, // THE ANCESTRY LINK
               caseDay: (patient.caseDay || 1) + 1, // THE GENERATIONAL COUNTER
               notes: `[Triage Re-book] ${patient.notes || "No original notes."}`, 
               processedBy: staffSignature,
               assignedVet: action === 'confined' ? patient.assignedVet : "Unassigned" 
            }); 
          }
        } else if (action === 'no-show') { 
          batch.update(oldRef, { 
             status: 'no-show', 
             rejectReason: "Marked as No-Show during Triage",
             processedBy: staffSignature,
             processedAt: Timestamp.now()
          }); 
        } else {
          batch.update(oldRef, { 
             status: 'cancelled', 
             rejectReason: "Cancelled during Triage",
             processedBy: staffSignature,
             processedAt: Timestamp.now()
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
        where("createdAt", ">=", Timestamp.fromDate(startOfDay)),
        where("createdAt", "<=", Timestamp.fromDate(endOfDay))
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
        
        // Initialize default actions (Cancel for normal, Confined for hospitalized)
        const initialRes = {};
        enrichedPatients.forEach(p => initialRes[p.id] = p.status === 'confined' ? 'confined' : 'cancel');
        setPatientResolutions(initialRes);
        
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
  const confirmReject = async () => { if (!selectedId) return; try { await rejectAppointment(selectedId, rejectReason); setOpenReject(false); setRejectReason(''); } catch (err) { alert(err.message); } };

  // ======================================================================
  // DATA FETCHING & EFFECTS
  // ======================================================================
  
  // THE MORNING GATEKEEPER (Forces modal if ghosts exist - REAL-TIME SYNC!)
  useEffect(() => {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const qGhosts = query(
      collection(db, "appointments"),
      where("status", "in",["pending", "confirmed", "arrived", "in-consult", "confined", "on-hold", "dispensing", "billing"]),
      where("createdAt", "<", Timestamp.fromDate(todayStart))
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
            
            // Incrementally update resolutions, keeping existing ones in state
            setPatientResolutions(prev => {
              const updated = { ...prev };
              enrichedGhosts.forEach(p => {
                if (!updated[p.id]) {
                  updated[p.id] = p.status === 'confined' ? 'confined' : 'cancel';
                }
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
    const start = new Date(filterDate); start.setHours(0, 0, 0, 0);
    const end = new Date(filterDate); end.setHours(23, 59, 59, 999);
    
    const q = query(
      collection(db, "appointments"), 
      where("createdAt", ">=", Timestamp.fromDate(start)), 
      where("createdAt", "<=", Timestamp.fromDate(end))
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let list = snapshot.docs.map(doc => ({
        id: doc.id, ...doc.data(),
        jsScheduled: doc.data().scheduledDate?.toDate(), 
        jsArrived: doc.data().timeArrived?.toDate(),
        jsStarted: doc.data().timeStarted?.toDate(), 
        jsCompleted: doc.data().timeCompleted?.toDate(),
      }));

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
    switch (tabValue) {
      case 0: return rows.filter(r => r.status === 'pending');
      case 1: return rows.filter(r => r.status === 'confirmed');
      case 2: return rows.filter(r => r.status === 'arrived');
      case 3: return rows.filter(r => r.status === 'in-consult' || r.status === 'confined' || r.status === 'on-hold');
      case 4: return rows.filter(r => r.status === 'dispensing');
      case 5: return rows.filter(r => r.status === 'billing');
      case 6: return rows.filter(r => r.status === 'completed' || r.status === 'carried-over');
      case 7: return rows.filter(r => r.status === 'cancelled' || r.status === 'no-show');
      default: return rows; 
    }
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
    handleQuickNoShow: async (id) => { if(window.confirm("Mark as No-Show?")) await markNoShow(id); },
    handleRescheduleOpen: (row) => { setSelectedRow(row); setOpenReschedule(true); }
  }, isToday, departments);

  const isPastDate = new Date(filterDate) < new Date(new Date().setHours(0,0,0,0));
  const showClosingWarning = isClosingTime && isToday && unfinishedCount > 0;
  const showPastDueWarning = isPastDate && unfinishedCount > 0;

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
      {showPastDueWarning && (
        <Alert severity="error" variant="filled" sx={{ mb: 2, fontWeight: 'bold', boxShadow: 2 }}>
          ⚠️ ATTENTION: You have {unfinishedCount} unresolved patient(s) from this date. Please click "Clean Up Records" to carry them over or cancel them.
        </Alert>
      )}

      {showClosingWarning && !showPastDueWarning && (
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
        
        {/* LEFT SIDE: Title & Date Picker */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: '900', color: '#5D4037', textShadow: '0px 1px 2px rgba(255,255,255,0.8)' }}>
            Patient Queue
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.9)', p: 0.5, boxShadow: 1 }}>
             <Tooltip title="Previous Day"><IconButton onClick={() => {const d = new Date(filterDate); d.setDate(d.getDate() - 1); setFilterDate(d.toISOString().split('T')[0]);}} size="small"><ArrowBackIosNewIcon fontSize="small" sx={{ color: '#5D4037' }}/></IconButton></Tooltip>
             <TextField 
                type="date" 
                variant="standard"
                size="small" 
                value={filterDate} 
                onChange={(e) => setFilterDate(e.target.value)} 
                InputProps={{ disableUnderline: true, style: { fontWeight: 'bold', color: '#5D4037' } }}
                sx={{ width: 130, input: { textAlign: 'center' } }} 
             />
             <Tooltip title="Next Day"><IconButton onClick={() => {const d = new Date(filterDate); d.setDate(d.getDate() + 1); setFilterDate(d.toISOString().split('T')[0]);}} size="small"><ArrowForwardIosIcon fontSize="small" sx={{ color: '#5D4037' }}/></IconButton></Tooltip>
          </Box>
        </Box>
        
        {/* RIGHT SIDE: Counter & Action Buttons */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
           <Typography variant="body2" sx={{ color: '#5D4037', fontStyle: 'italic', fontWeight: '900', letterSpacing: 0.5, mr: 1 }}>
              {rows.length} {rows.length === 1 ? 'Record' : 'Records'}
           </Typography>


           {(isToday || (isPastDate && unfinishedCount > 0)) && (
             <Tooltip 
                title={
                  isPastDate 
                    ? "Opens the Triage Board to resolve abandoned patients (Re-book, No-Show, Cancel) from this date." 
                    : isClosingTime 
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

           {isToday && (
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

      {/* TABS (FLEX-SHRINK: 0) */}
      <Box sx={{ flexShrink: 0, mb: 2 }}>
        <Paper sx={{ ...clinicalFlatStyle, p: 0.5 }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} variant="fullWidth" scrollButtons="auto" TabIndicatorProps={{ style: { display: 'none' } }} sx={{ minHeight: 48, '& .MuiTab-root': { fontWeight: '800', fontSize: '0.85rem', textTransform: 'uppercase', minHeight: 40, py: 1, px: 2.5, m: 0.5, borderRadius: 8, color: '#757575', transition: 'all 0.2s ease', }, '& .Mui-selected': { bgcolor: '#5D4037', color: '#FFF !important', boxShadow: '0 4px 10px rgba(93, 64, 55, 0.3)' } }}>
          <Tab label={`🌐 Online (${countOnline})`} />
          <Tab label={`📅 Scheduled (${countScheduled})`} />
          <Tab label={`🏃 Arrived (${countArrived})`} />
          <Tab label={`▶️ Started (${countStarted})`} />
          <Tab label={`💊 Dispense (${countDispense})`} />
          <Tab label={`💰 Payment (${countPayment})`} />
          <Tab label={`✅ Done (${countDone})`} />
          <Tab label={`🚫 Cancelled (${countCancelled})`} /> 
        </Tabs>
      </Paper>
      </Box>

      {/* HISTORICAL ALERT BANNER (FLEX-SHRINK: 0) */}
      <Box sx={{ flexShrink: 0 }}>
      {!isToday && (
        <Alert 
            severity="warning" 
            icon={<WarningIcon sx={{ color: '#5D4037' }} />}
            sx={{ 
                mb: 2, bgcolor: '#FFFDE7', color: '#5D4037', border: '2px solid #5D4037', 
                fontWeight: '1000', letterSpacing: 1.5,
                '& .MuiAlert-message': { width: '100%', textAlign: 'center' }
            }}
        >
            FORENSIC ARCHIVE: VIEWING HISTORICAL RECORDS (READ-ONLY MODE)
        </Alert>
      )}
      </Box>

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
        onResolutionChange={(id, action) => setPatientResolutions(prev => ({ ...prev, [id]: action }))}
        onBulkResolution={handleBulkResolution}
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
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleCloseMenu}><MenuItem onClick={() => {revertStatus(selectedRow); handleCloseMenu();}}><ListItemIcon><UndoIcon fontSize="small" color="warning"/></ListItemIcon> <ListItemText sx={{color: '#E65100'}}>Revert Step (Undo)</ListItemText></MenuItem><Divider /><MenuItem onClick={() => handleOpenAssign(selectedRow)}><ListItemIcon><EditIcon fontSize="small"/></ListItemIcon> <ListItemText>Re-assign Staff</ListItemText></MenuItem><MenuItem onClick={handleEditOpen}><ListItemIcon><EditIcon fontSize="small"/></ListItemIcon> <ListItemText>Edit Details</ListItemText></MenuItem><MenuItem onClick={handleRescheduleOpen}><ListItemIcon><EventIcon fontSize="small"/></ListItemIcon> <ListItemText>Reschedule</ListItemText></MenuItem><MenuItem onClick={fetchHistory}><ListItemIcon><HistoryIcon fontSize="small"/></ListItemIcon> <ListItemText>History</ListItemText></MenuItem><Divider /><MenuItem onClick={() => { if(window.confirm("Mark as No-Show?")) { markNoShow(selectedRow?.id); handleCloseMenu(); } }} sx={{color:'error.main'}}><ListItemIcon><PersonOffIcon fontSize="small" color="error"/></ListItemIcon> <ListItemText>No Show</ListItemText></MenuItem></Menu>
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