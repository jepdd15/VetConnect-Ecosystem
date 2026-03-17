import React, { useEffect, useState, useRef } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { 
  Box, Typography, Paper, IconButton, Tooltip, 
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button,
  Tabs, Tab, Menu, MenuItem, ListItemIcon, ListItemText, Divider, List, Alert
} from '@mui/material';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, where, getDocs, writeBatch, getDoc } from 'firebase/firestore';

import { db } from '../../firebaseConfig'; 
import { useQueueActions } from './useQueueActions';
import { getQueueColumns } from './queueColumns';
import ClinicalWorkspace from '../../components/ClinicalWorkspace';
import POSModal from '../../components/POSModal'; 
import WalkInModal from './WalkInModal';
import AssignStaffModal from './AssignStaffModal';
import EndOfDayModal from './EndOfDayModal';

import PersonAddIcon from '@mui/icons-material/PersonAdd'; 
import EditIcon from '@mui/icons-material/Edit';
import EventIcon from '@mui/icons-material/Event';
import HistoryIcon from '@mui/icons-material/History';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'; 
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'; 
import UndoIcon from '@mui/icons-material/Undo'; 

const MAX_CAGES = 5;

export default function Queue() {
  const [rows, setRows] = useState([]);
  const [vets, setVets] = useState([]); 
  const [inventoryList, setInventoryList] = useState([]); 
  const [servicesList, setServicesList] = useState([]); 
  const [tabValue, setTabValue] = useState(0); 
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [isClosingTime, setIsClosingTime] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedId, setSelectedId] = useState(null); 
  const [openReject, setOpenReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [openEndDay, setOpenEndDay] = useState(false);
  const [leftoverPatients, setLeftoverPatients] = useState([]);
  const [carryOverSelection, setCarryOverSelection] = useState([]);
  const [openEdit, setOpenEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPet, setEditPet] = useState('');
  const [openReschedule, setOpenReschedule] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [openHistory, setOpenHistory] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [openConsult, setOpenConsult] = useState(false);
  const [openPOS, setOpenPOS] = useState(false); 
  const [openWalkIn, setOpenWalkIn] = useState(false);
  const [openAssign, setOpenAssign] = useState(false);

  const isToday = new Date(filterDate).toDateString() === new Date().toDateString();
  const hasCheckedAutoReset = useRef(false);

  const { changeStatus, revertStatus, markNoShow, rejectAppointment } = useQueueActions();

  useEffect(() => {
    const start = new Date(filterDate); start.setHours(0, 0, 0, 0);
    const end = new Date(filterDate); end.setHours(23, 59, 59, 999);
    const q = query(collection(db, "appointments"), where("createdAt", ">=", Timestamp.fromDate(start)), where("createdAt", "<=", Timestamp.fromDate(end)), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id, ...doc.data(),
        jsScheduled: doc.data().scheduledDate?.toDate(), jsArrived: doc.data().timeArrived?.toDate(),
        jsStarted: doc.data().timeStarted?.toDate(), jsCompleted: doc.data().timeCompleted?.toDate(),
      }));
      list.sort((a, b) => {
        if (a.priority === 'high' && b.priority !== 'high') return -1;
        if (a.priority !== 'high' && b.priority === 'high') return 1;
        return 0; 
      });
      setRows(list);
    });
    return () => unsubscribe();
  }, [filterDate]);

  useEffect(() => {
    const unsubVets = onSnapshot(collection(db, "users"), (snapshot) => setVets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(u => u.role === 'veterinarian' || u.role === 'groomer' || u.accessLevel)));
    const unsubInv = onSnapshot(collection(db, "inventory"), (snapshot) => setInventoryList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const unsubServ = onSnapshot(collection(db, "services"), (snapshot) => setServicesList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    return () => { unsubVets(); unsubInv(); unsubServ(); };
  },[]);

  useEffect(() => {
    const interval = setInterval(() => { setCurrentTime(new Date()); setIsClosingTime(new Date().getHours() >= 17); }, 60000);
    return () => clearInterval(interval);
  },[]);

  useEffect(() => {
    const checkDailyReset = async () => {
      if (!isToday || hasCheckedAutoReset.current) return;
      hasCheckedAutoReset.current = true;
      try {
        const queueSnap = await getDoc(doc(db, "queue", "daily_queue"));
        const todayStr = new Date().toISOString().split('T')[0];
        if (!queueSnap.exists() || queueSnap.data().lastResetDate !== todayStr) initiateResetDay(true); 
      } catch (error) { console.error(error); }
    };
    checkDailyReset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[isToday]);

  const countOnline = rows.filter(r => r.status === 'pending').length;
  const countScheduled = rows.filter(r => r.status === 'confirmed').length;
  const countArrived = rows.filter(r => r.status === 'arrived').length;
  const countStarted = rows.filter(r => r.status === 'in-consult' || r.status === 'confined' || r.status === 'on-hold').length;
  const countDispense = rows.filter(r => r.status === 'dispensing').length;
  const countPayment = rows.filter(r => r.status === 'billing').length;
  const countDone = rows.filter(r => r.status === 'completed' || r.status === 'carried-over').length;
  const countCancelled = rows.filter(r => r.status === 'cancelled' || r.status === 'no-show').length;

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

  const initiateResetDay = async (isAuto = false) => { 
    try { 
      const startOfToday = new Date(); startOfToday.setHours(0,0,0,0); 
      const qLeftovers = query(collection(db, "appointments"), where("status", "in",["arrived", "in-consult", "confined", "on-hold"]), where("createdAt", ">=", Timestamp.fromDate(startOfToday))); 
      const snapshot = await getDocs(qLeftovers); 
      if (snapshot.size > 0) { 
        const patients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
        setLeftoverPatients(patients); setCarryOverSelection(patients.map(p => p.id)); setOpenEndDay(true); 
      } else { 
        if (isAuto) confirmResetDay(true); 
        else if(window.confirm("No active patients found. Reset queue?")) confirmResetDay(); 
      } 
    } catch (error) { console.log(error); } 
  };

  const confirmResetDay = async (isSilent = false) => { 
    try { 
      const batch = writeBatch(db); 
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(8, 0, 0, 0); 
      const todayStr = new Date().toISOString().split('T')[0];

      leftoverPatients.forEach((patient) => { 
        const oldRef = doc(db, "appointments", patient.id); 
        if (carryOverSelection.includes(patient.id)) { 
          batch.update(oldRef, { status: 'carried-over', notes: `(Re-booked) ${patient.notes || ""}` }); 
          const newDocRef = doc(collection(db, "appointments")); 
          batch.set(newDocRef, { ownerId: patient.ownerId, ownerName: patient.ownerName, petId: patient.petId, petName: patient.petName, petSpecies: patient.petSpecies, serviceType: patient.serviceType, servicePrice: patient.servicePrice, status: 'confirmed', scheduledDate: Timestamp.fromDate(tomorrow), createdAt: Timestamp.now(), notes: `(Carried Over) ${patient.notes || ""}`, assignedVet: "Unassigned" }); 
        } else { batch.update(oldRef, { status: 'cancelled', rejectReason: "End of Day - Did not reschedule" }); } 
      }); 

      const queueRef = doc(db, "queue", "daily_queue"); 
      batch.update(queueRef, { currentServing: 0, currentPrefix: '', lastNumberIssued: 0, status: 'active', lastResetDate: todayStr }); 
      await batch.commit(); 
      setOpenEndDay(false); 
      if (!isSilent) alert("Clinic closed."); 
    } catch (error) { alert("Error: " + error.message); } 
  };

  const tableColumns = getQueueColumns(tabValue, currentTime, {
    handleStatusChange: (row, newStatus) => changeStatus(row, newStatus, rows.filter(r => r.status === 'confined').length, MAX_CAGES).catch(e => alert(e.message)),
    handleOpenAssign: (row) => { setSelectedRow(row); setOpenAssign(true); },
    handleQuickNoShow, setSelectedId, setOpenReject,
    handleOpenConsult, handleOpenPOS,
    handleMenuClick: (e, row) => { setAnchorEl(e.currentTarget); setSelectedRow(row); }
  });

  return (
    <Box>
      {isClosingTime && isToday && ((countArrived + countStarted) > 0) && (
        <Alert severity="warning" variant="filled" sx={{ mb: 2, fontWeight: 'bold' }}>Closing time. Process active patients or Start New Day.</Alert>
      )}

      <Paper sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(10px)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#5D4037' }}>Patient Queue</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 2 }}>
             <IconButton onClick={() => {const d = new Date(filterDate); d.setDate(d.getDate() - 1); setFilterDate(d.toISOString().split('T')[0]);}} size="small"><ArrowBackIosNewIcon fontSize="small"/></IconButton>
             <TextField type="date" size="small" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} sx={{ width: 140, '& fieldset': { border: 'none' } }} />
             <IconButton onClick={() => {const d = new Date(filterDate); d.setDate(d.getDate() + 1); setFilterDate(d.toISOString().split('T')[0]);}} size="small"><ArrowForwardIosIcon fontSize="small"/></IconButton>
          </Box>
        </Box>
        
        {isToday && <Box sx={{ display: 'flex', gap: 2 }}>
           <Button variant="outlined" color="error" onClick={() => initiateResetDay(false)}>Start New Day</Button>
           <Button variant="contained" startIcon={<PersonAddIcon />} sx={{ bgcolor: '#FF9800' }} onClick={() => setOpenWalkIn(true)}>+ Walk-In</Button>
        </Box>}
      </Paper>

      <Paper sx={{ mb: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(10px)' }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} indicatorColor="primary" textColor="primary" variant="scrollable">
          <Tab label={`Online (${countOnline})`} /><Tab label={`Scheduled (${countScheduled})`} /><Tab label={`Arrived (${countArrived})`} /><Tab label={`Started (${countStarted})`} /><Tab label={`Dispense (${countDispense})`} /><Tab label={`Payment (${countPayment})`} /><Tab label={`Done (${countDone})`} /><Tab label={`Cancelled (${countCancelled})`} /> 
        </Tabs>
      </Paper>

      <Paper sx={{ height: 'calc(100vh - 240px)', width: '100%', borderRadius: 3, bgcolor: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(10px)', overflow: 'hidden' }}>
        <DataGrid rows={getFilteredRows()} columns={tableColumns} rowHeight={70} />
      </Paper>

      <ClinicalWorkspace open={openConsult} onClose={() => setOpenConsult(false)} patient={selectedRow} inventoryList={inventoryList} servicesList={servicesList} />
      <POSModal open={openPOS} onClose={() => setOpenPOS(false)} patient={selectedRow} inventoryList={inventoryList} servicesList={servicesList} />
      <WalkInModal open={openWalkIn} onClose={() => setOpenWalkIn(false)} servicesList={servicesList} />
      <AssignStaffModal open={openAssign} onClose={() => setOpenAssign(false)} patient={selectedRow} vetsList={vets} activeAppointments={rows.filter(r =>['arrived', 'in-consult', 'confined'].includes(r.status))} />
      <EndOfDayModal open={openEndDay} onClose={() => setOpenEndDay(false)} leftoverPatients={leftoverPatients} carryOverSelection={carryOverSelection} onToggleCarryOver={(id) => setCarryOverSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) :[...prev, id])} onConfirmReset={() => confirmResetDay(false)} />
      
      <Dialog open={openReject} onClose={() => setOpenReject(false)}><DialogTitle>Reject Appointment</DialogTitle><DialogContent><TextField label="Reason" fullWidth value={rejectReason} onChange={e=>setRejectReason(e.target.value)} /></DialogContent><DialogActions><Button onClick={()=>setOpenReject(false)}>Cancel</Button><Button onClick={confirmReject}>Confirm</Button></DialogActions></Dialog>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}><MenuItem onClick={() => revertStatus(selectedRow)}><ListItemIcon><UndoIcon fontSize="small"/></ListItemIcon>Revert Step</MenuItem><Divider /><MenuItem onClick={() => handleOpenAssign(selectedRow)}><ListItemIcon><EditIcon fontSize="small"/></ListItemIcon>Re-assign</MenuItem></Menu>
    </Box>
  );
}