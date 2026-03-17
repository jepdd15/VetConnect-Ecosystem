import React, { useEffect, useState, useRef } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { 
  Box, Typography, Paper, IconButton, Tooltip, 
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button,
  Tabs, Tab, Menu, MenuItem, ListItemIcon, ListItemText, Divider, List, ListItem, Alert, Checkbox, DialogContentText
} from '@mui/material';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, where, getDocs, writeBatch, getDoc } from 'firebase/firestore';

// 1. BACKEND & BRAIN
import { db } from '../../firebaseConfig'; 
import { useQueueActions } from './useQueueActions';
import { getQueueColumns } from './queueColumns';

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

const MAX_CAGES = 5;

export default function Queue() {
  const [rows, setRows] = useState([]);
  const[vets, setVets] = useState([]); 
  const [inventoryList, setInventoryList] = useState([]); 
  const [servicesList, setServicesList] = useState([]); 
  
  const[tabValue, setTabValue] = useState(0); 
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isClosingTime, setIsClosingTime] = useState(new Date().getHours() >= 17);

  const [anchorEl, setAnchorEl] = useState(null);
  const[selectedRow, setSelectedRow] = useState(null);
  const [selectedId, setSelectedId] = useState(null); 
  
  const [openReject, setOpenReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [openEndDay, setOpenEndDay] = useState(false);
  const [leftoverPatients, setLeftoverPatients] = useState([]);
  const[carryOverSelection, setCarryOverSelection] = useState([]);

  const [openEdit, setOpenEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPet, setEditPet] = useState('');
  const[openReschedule, setOpenReschedule] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [openHistory, setOpenHistory] = useState(false);
  const [historyList, setHistoryList] = useState([]);

  const [openConsult, setOpenConsult] = useState(false);
  const[openPOS, setOpenPOS] = useState(false); 
  const [openWalkIn, setOpenWalkIn] = useState(false);
  const [openAssign, setOpenAssign] = useState(false);

  const { changeStatus, revertStatus, markNoShow, rejectAppointment } = useQueueActions();
  const hasCheckedAutoReset = useRef(false);
  const isToday = new Date(filterDate).toDateString() === new Date().toDateString();

  const glassStyle = {
    background: 'rgba(255, 255, 255, 0.55)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', 
    border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 8px 32px 0 rgba(139, 69, 19, 0.08)', borderRadius: 3, 
  };

  // ======================================================================
  // LOGIC & HANDLERS
  // ======================================================================
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
        } else { batch.update(oldRef, { status: 'cancelled', rejectReason: "End of Day Cleanup" }); } 
      }); 

      const queueRef = doc(db, "queue", "daily_queue"); 
      batch.update(queueRef, { currentServing: 0, currentPrefix: '', lastNumberIssued: 0, status: 'active', lastResetDate: todayStr }); 
      await batch.commit(); 
      setOpenEndDay(false); 
      if (!isSilent) alert("Clinic Closed: Queue reset for tomorrow."); 
    } catch (error) { alert("Error: " + error.message); } 
  };

  const initiateResetDay = async (isAuto = false) => { 
    try { 
      const startOfToday = new Date(); startOfToday.setHours(0,0,0,0); 
      const qLeftovers = query(collection(db, "appointments"), where("status", "in",["pending", "confirmed", "arrived", "in-consult", "confined", "on-hold", "dispensing", "billing"]), where("createdAt", ">=", Timestamp.fromDate(startOfToday))); 
      const snapshot = await getDocs(qLeftovers); 
      if (snapshot.size > 0) { 
        const patients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
        setLeftoverPatients(patients); 
        setCarryOverSelection(patients.map(p => p.id)); 
        setOpenEndDay(true); 
      } else { 
        if (isAuto) confirmResetDay(true); 
        else if(window.confirm("No active patients. Reset queue?")) confirmResetDay(); 
      } 
    } catch (error) { console.log(error); } 
  };

  
  const handleMenuClick = (e, row) => { setAnchorEl(e.currentTarget); setSelectedRow(row); };
  const handleCloseMenu = () => { setAnchorEl(null); };
  const handleOpenAssign = (row) => { setSelectedRow(row); setOpenAssign(true); handleCloseMenu(); };
  const handleOpenConsult = (row) => { setSelectedRow(row); setOpenConsult(true); };
  const handleOpenPOS = (row) => { setSelectedRow(row); setOpenPOS(true); };

  const handleStatusChange = async (row, newStatus) => {
    try {
      const confinedCount = rows.filter(r => r.status === 'confined').length;
      await changeStatus(row, newStatus, confinedCount, MAX_CAGES);
    } catch (e) { alert(e.message); }
  };

  const handleEditOpen = () => { setEditName(selectedRow.ownerName||''); setEditPet(selectedRow.petName); setOpenEdit(true); handleCloseMenu(); };
  const saveEdit = async () => { await updateDoc(doc(db, "appointments", selectedRow.id), { ownerName: editName, petName: editPet }); setOpenEdit(false); };
  const handleRescheduleOpen = () => { setOpenReschedule(true); handleCloseMenu(); };
  const saveReschedule = async () => { if(!newDate) return; await updateDoc(doc(db, "appointments", selectedRow.id), { scheduledDate: Timestamp.fromDate(new Date(newDate)), status: 'confirmed' }); setOpenReschedule(false); };
  const fetchHistory = async () => { if (!selectedRow.petId) return alert("Walk-In Account Required"); const q = query(collection(db, "medical_records"), where("petId", "==", selectedRow.petId), orderBy("date", "desc")); const s = await getDocs(q); setHistoryList(s.docs.map(d => d.data())); setOpenHistory(true); handleCloseMenu(); };
  const confirmReject = async () => { if (!selectedId) return; try { await rejectAppointment(selectedId, rejectReason); setOpenReject(false); setRejectReason(''); } catch (err) { alert(err.message); } };

  
  useEffect(() => {
    const start = new Date(filterDate); start.setHours(0, 0, 0, 0);
    const end = new Date(filterDate); end.setHours(23, 59, 59, 999);
    
    
    const q = query(
      collection(db, "appointments"), 
      where("createdAt", ">=", Timestamp.fromDate(start)), 
      where("createdAt", "<=", Timestamp.fromDate(end)), 
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id, ...doc.data(),
        jsScheduled: doc.data().scheduledDate?.toDate(), 
        jsArrived: doc.data().timeArrived?.toDate(),
      }));

      
      list.sort((a, b) => {
        
        const priorityA = a.priority === 'high' ? 0 : 1;
        const priorityB = b.priority === 'high' ? 0 : 1;
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        
        const timeA = a.jsScheduled ? a.jsScheduled.getTime() : Date.now();
        const timeB = b.jsScheduled ? b.jsScheduled.getTime() : Date.now();
        if (timeA !== timeB) {
          return timeA - timeB;
        }

        
        return (a.ownerName || '').localeCompare(b.ownerName || '');
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
    
  }, [isToday]);

  const countOnline = rows.filter(r => r.status === 'pending').length;
  const countScheduled = rows.filter(r => r.status === 'confirmed').length;
  const countArrived = rows.filter(r => r.status === 'arrived').length;
  const countStarted = rows.filter(r => r.status === 'in-consult' || r.status === 'confined' || r.status === 'on-hold').length;
  const countDispense = rows.filter(r => r.status === 'dispensing').length;
  const countPayment = rows.filter(r => r.status === 'billing').length;
  const countDone = rows.filter(r => r.status === 'completed' || r.status === 'carried-over').length;
  const countCancelled = rows.filter(r => r.status === 'cancelled' || r.status === 'no-show').length;
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
    handleStatusChange, handleOpenAssign, setSelectedId, setOpenReject, handleOpenConsult, handleOpenPOS, handleMenuClick,
    handleQuickNoShow: async (id) => { if(window.confirm("Mark as No-Show?")) await markNoShow(id); }
  });

  return (
    <Box>
      {isClosingTime && isToday && (unfinishedCount > 0) && (
        <Alert severity="warning" variant="filled" sx={{ mb: 2, fontWeight: 'bold' }}>
          Clinic hours have ended. You have {unfinishedCount} unfinished patient(s). Please process them or click "Close Clinic" to carry over.
        </Alert>
      )}

      <Paper sx={{ ...glassStyle, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#5D4037', textShadow: '0px 1px 2px rgba(255,255,255,0.8)' }}>Patient Queue</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.9)' }}>
             <Tooltip title="Previous Day"><IconButton onClick={() => {const d = new Date(filterDate); d.setDate(d.getDate() - 1); setFilterDate(d.toISOString().split('T')[0]);}} size="small"><ArrowBackIosNewIcon fontSize="small" color="primary"/></IconButton></Tooltip>
             <TextField type="date" size="small" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} sx={{ width: 140, '& fieldset': { border: 'none' } }} />
             <Tooltip title="Next Day"><IconButton onClick={() => {const d = new Date(filterDate); d.setDate(d.getDate() + 1); setFilterDate(d.toISOString().split('T')[0]);}} size="small"><ArrowForwardIosIcon fontSize="small" color="primary"/></IconButton></Tooltip>
          </Box>
          <Typography variant="caption" sx={{ color: '#888', ml: 1, fontStyle: 'italic', fontWeight: 'bold' }}>{rows.length} {rows.length === 1 ? 'Record' : 'Records'}</Typography>
        </Box>
        
        {isToday && <Box sx={{ display: 'flex', gap: 2 }}>
           <Button variant="contained" color={isClosingTime ? "error" : "inherit"} onClick={() => initiateResetDay(false)} sx={isClosingTime ? {animation: 'pulse 1.5s infinite'} : { color: '#D32F2F', border: '1px solid #D32F2F', bgcolor: 'transparent' }}>{isClosingTime ? "Close Clinic" : "Start New Day"}</Button>
           <Button variant="contained" startIcon={<PersonAddIcon />} sx={{ bgcolor: '#FF9800', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(255, 152, 0, 0.4)' }} onClick={() => setOpenWalkIn(true)}>+ Walk-In</Button>
        </Box>}
      </Paper>

      <Paper sx={{ ...glassStyle, mb: 2, p: 0.5 }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} indicatorColor="primary" textColor="primary" variant="scrollable" sx={{'& .MuiTab-root': { fontWeight: 'bold', fontSize: '0.95rem' }}}>
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

      <Paper sx={{ ...glassStyle, height: 'calc(100vh - 240px)', minHeight: 400, width: '100%', overflow: 'hidden' }}>
        <DataGrid rows={getFilteredRows()} columns={tableColumns} pageSize={10} disableSelectionOnClick rowHeight={70} getRowClassName={(params) => params.row.priority === 'high' ? 'emergency-row' : ''} sx={{ border: 'none', bgcolor: 'transparent', '& .MuiDataGrid-columnHeaders': { bgcolor: 'rgba(255, 255, 255, 0.4)', color: '#5D4037', fontWeight: 'bold', fontSize: '1.05rem', borderBottom: '1px solid rgba(255, 255, 255, 0.5)'}, '& .emergency-row': { bgcolor: 'rgba(255, 235, 238, 0.8)' }, '& .super-late-row': { bgcolor: 'rgba(255, 243, 224, 0.8)' }, '& .MuiDataGrid-row:hover': { bgcolor: 'rgba(255, 255, 255, 0.4)' }, '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' } }} />
      </Paper>

      {/* EXTERNAL MODULES */}
      <ClinicalWorkspace open={openConsult} onClose={() => setOpenConsult(false)} patient={selectedRow} inventoryList={inventoryList} servicesList={servicesList} />
      <POSModal open={openPOS} onClose={() => setOpenPOS(false)} patient={selectedRow} inventoryList={inventoryList} servicesList={servicesList} />
      <WalkInModal open={openWalkIn} onClose={() => setOpenWalkIn(false)} servicesList={servicesList} />
      <AssignStaffModal open={openAssign} onClose={() => setOpenAssign(false)} patient={selectedRow} vetsList={vets} activeAppointments={rows.filter(r =>['arrived', 'in-consult', 'confined'].includes(r.status))} />
      <EndOfDayModal open={openEndDay} onClose={() => setOpenEndDay(false)} leftoverPatients={leftoverPatients} carryOverSelection={carryOverSelection} onToggleCarryOver={(id) => setCarryOverSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) :[...prev, id])} onConfirmReset={() => confirmResetDay(false)} />
      
      {/* INTERNAL MODALS */}
      <Dialog open={openReject} onClose={() => setOpenReject(false)}><DialogTitle sx={{color:'#d32f2f'}}>Reject</DialogTitle><DialogContent><TextField autoFocus margin="dense" label="Reason" fullWidth value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} /></DialogContent><DialogActions><Button onClick={() => setOpenReject(false)}>Cancel</Button><Button onClick={confirmReject} variant="contained" color="error">Confirm</Button></DialogActions></Dialog>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleCloseMenu}><MenuItem onClick={() => {revertStatus(selectedRow); handleCloseMenu();}}><ListItemIcon><UndoIcon fontSize="small" color="warning"/></ListItemIcon> <ListItemText sx={{color: '#E65100'}}>Revert Step (Undo)</ListItemText></MenuItem><Divider /><MenuItem onClick={() => handleOpenAssign(selectedRow)}><ListItemIcon><EditIcon fontSize="small"/></ListItemIcon> <ListItemText>Re-assign Staff</ListItemText></MenuItem><MenuItem onClick={handleEditOpen}><ListItemIcon><EditIcon fontSize="small"/></ListItemIcon> <ListItemText>Edit Details</ListItemText></MenuItem><MenuItem onClick={handleRescheduleOpen}><ListItemIcon><EventIcon fontSize="small"/></ListItemIcon> <ListItemText>Reschedule</ListItemText></MenuItem><MenuItem onClick={fetchHistory}><ListItemIcon><HistoryIcon fontSize="small"/></ListItemIcon> <ListItemText>History</ListItemText></MenuItem><Divider /><MenuItem onClick={() => { if(window.confirm("Mark as No-Show?")) { markNoShow(selectedRow?.id); handleCloseMenu(); } }} sx={{color:'error.main'}}><ListItemIcon><PersonOffIcon fontSize="small" color="error"/></ListItemIcon> <ListItemText>No Show</ListItemText></MenuItem></Menu>
      <Dialog open={openEdit} onClose={() => setOpenEdit(false)}><DialogTitle>Edit</DialogTitle><DialogContent><TextField margin="dense" label="Owner" fullWidth value={editName} onChange={(e) => setEditName(e.target.value)} /><TextField margin="dense" label="Pet" fullWidth value={editPet} onChange={(e) => setEditPet(e.target.value)} /></DialogContent><DialogActions><Button onClick={() => setOpenEdit(false)}>Cancel</Button><Button onClick={saveEdit} variant="contained">Save</Button></DialogActions></Dialog>
      <Dialog open={openReschedule} onClose={() => setOpenReschedule(false)}><DialogTitle>Reschedule</DialogTitle><DialogContent><TextField type="datetime-local" fullWidth value={newDate} onChange={(e) => setNewDate(e.target.value)} /></DialogContent><DialogActions><Button onClick={() => setOpenReschedule(false)}>Cancel</Button><Button onClick={saveReschedule} variant="contained">Update</Button></DialogActions></Dialog>
      <Dialog open={openHistory} onClose={() => setOpenHistory(false)} maxWidth="sm" fullWidth><DialogTitle>Medical History</DialogTitle><DialogContent dividers>{historyList.length === 0 ? <Typography>No records.</Typography> : <List>{historyList.map((rec,i) => <ListItem key={i} divider><ListItemText primary={rec.diagnosis} secondary={rec.treatment}/></ListItem>)}</List>}</DialogContent><DialogActions><Button onClick={() => setOpenHistory(false)}>Close</Button></DialogActions></Dialog>
    </Box>
  );
}