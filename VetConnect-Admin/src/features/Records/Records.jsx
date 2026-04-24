import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Typography, Paper, TextField, InputAdornment, Chip, Stack, Tooltip,
  IconButton, Popover, Divider, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Tabs, Tab, Drawer, FormControl, InputLabel, Select, MenuItem, RadioGroup, FormControlLabel, Radio,
  Snackbar, Alert
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';

// Icons
import SearchIcon from '@mui/icons-material/Search';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import HistoryIcon from '@mui/icons-material/History';
import InfoIcon from '@mui/icons-material/Info';
import TimelineIcon from '@mui/icons-material/Timeline';
import EditCalendarIcon from '@mui/icons-material/EditCalendar';
import CancelIcon from '@mui/icons-material/Cancel';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PetsIcon from '@mui/icons-material/Pets';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import LockIcon from '@mui/icons-material/Lock';
import ShieldIcon from '@mui/icons-material/Shield';
import FilterListIcon from '@mui/icons-material/FilterList';
import TuneIcon from '@mui/icons-material/Tune';
import CloseIcon from '@mui/icons-material/Close';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';

// Design Tokens
import { FONT, COLORS, TYPE } from '../../theme/designTokens';

// Logic
import { useGlobalRecords } from './hooks/useGlobalRecords';
import { useQueueActions } from '../Queue/useQueueActions';
import { ForensicMetricGrid } from '../Queue/ForensicMetricGrid';
import { useAncestorChain } from './hooks/useAncestorChain';
import { calculatePulseMetrics, makePulseEventId } from '../../utils/pulseUtils';
import { TERMINAL_STATUSES } from '../../utils/statusConstants';
import { query, collection, where, onSnapshot, arrayUnion, doc, updateDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useClinicSettings } from '../../hooks/useClinicSettings';
import { useUser } from '../../context/UserContext';
import { useSavedFilters } from './hooks/useSavedFilters';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PrintIcon from '@mui/icons-material/Print';
import { PRINT_STYLES, esc, openPrintWindow } from '../../utils/printUtils';

export default function Records() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUser();

  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState({ start: null, end: null });

  // UI State for Search Mode
  const [searchMode, setSearchMode] = useState('petName'); // 'petName', 'ownerName', 'phone'

  // UI State for Silos
  const [activeTab, setActiveTab] = useState(0);
  const SILO_MAP = ['GLOBAL', 'TRIAGE', 'CLINICAL', 'IN-PATIENT', 'ARCHIVE', 'VOIDED'];

  // UI State for Filter Drawer
  const [openDrawer, setOpenDrawer] = useState(false);
  const [facets, setFacets] = useState({
    assignedVetId: '',
    serviceCategory: '',
    petSpecies: '',
    origin: '' // '', 'WALK_IN', 'ONLINE'
  });

  useEffect(() => {
    const df = location.state?.dashboardFilter;
    if (!df) return;
    if (df.searchText) setSearchText(df.searchText);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [vets, setVets] = useState([]);

  // UI State for Audit Popover
  const [anchorEl, setAnchorEl] = useState(null);
  const [activeAuditRow, setActiveAuditRow] = useState(null);

  // UI State for Reschedule Modal
  const [openReschedule, setOpenReschedule] = useState(false);
  const [rescheduleData, setRescheduleData] = useState({ newDate: '', reason: '' });
  const activeSilo = SILO_MAP[activeTab];

  // Toast / feedback
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });

  // Void dialog (replaces window.confirm + prompt)
  const [voidDialog, setVoidDialog] = useState({ open: false, reason: '' });

  // Addendum (sealed records)
  const [addendumText, setAddendumText] = useState('');
  const [addendumLoading, setAddendumLoading] = useState(false);

  // Identity edit
  const [editIdentity, setEditIdentity] = useState(null); // { petName, ownerName, ownerPhone }

  // Case-grouping view
  const [viewMode, setViewMode] = useState('visit'); // 'visit' | 'case'

  // Reschedule undo
  const [lastReschedule, setLastReschedule] = useState(null);

  // Bulk operations
  const [selectedRows, setSelectedRows] = useState([]);
  const [bulkReschedule, setBulkReschedule] = useState(false);
  const [bulkDate, setBulkDate] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkReassign, setBulkReassign] = useState(false);
  const [reassignVetId, setReassignVetId] = useState('');

  // Saved filter presets
  const { presets, savePreset, deletePreset } = useSavedFilters(user?.uid);
  const [presetName, setPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);

  const { records, loading } = useGlobalRecords(dateRange, searchText, searchMode, activeSilo, facets);
  const { rescheduleAppointment, rejectAppointment } = useQueueActions();
  
  // --- 🧬 ANCESTOR CHAIN ENGINE ---
  const { ancestors, combinedPulse, combinedServices, loading: loadingAncestors } = useAncestorChain(activeAuditRow);
  
  // Clinic settings — shared singleton via useClinicSettings hook
  const settings = useClinicSettings();

  // Departments live in the `departments` Firestore collection, not on clinic_settings
  const [departments, setDepartments] = useState([]);

  React.useEffect(() => {
    const unsubDepts = onSnapshot(collection(db, "departments"),
      (snapshot) => {
        const depts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        depts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setDepartments(depts);
      },
      (err) => console.error("Departments listener:", err)
    );
    return () => unsubDepts();
  }, []);

  // Fetch Vets (all staff roles that can be assigned to appointments)
  React.useEffect(() => {
    const vetsQuery = query(
      collection(db, "users"),
      where("role", "in", ["veterinarian", "staff", "admin", "groomer"])
    );
    const unsubVets = onSnapshot(vetsQuery,
      (s) => { setVets(s.docs.map(d => ({ id: d.id, ...d.data() }))); },
      (err) => console.error("Vets listener:", err)
    );
    return () => unsubVets();
  }, []);

  // Compute Cumulative Metrics
  const cumulativeTotals = useMemo(() => {
    if (!activeAuditRow) return null;
    let totalQueue = 0;
    let totalConsult = 0;
    let totalConfined = 0;

    const allRecords = [...ancestors, activeAuditRow];
    allRecords.forEach(r => {
      const p = r.clinicalPulse || [];
      const m = calculatePulseMetrics(p, settings, r.createdAt, r.jsScheduled || new Date());
      // metrics come back as strings like "10M", need to parse back or use a raw helper
      // Actually pulseUtils has calculatePulseMetrics which returns { raw: { shiftQueue: mins, ... } }
      if (m.raw) {
        totalQueue += (m.raw.shiftQueue || 0);
        totalConsult += (m.raw.shiftConsult || 0);
        totalConfined += (m.raw.shiftConfined || 0);
      }
    });

    return { totalQueue, totalConsult, totalConfined };
  }, [ancestors, activeAuditRow, settings]);

  // --- CLIENT-SIDE RENDERING (PRE-FLIGHT) ---
  const filteredRecords = records; // Now handled server-side for performance

  // --- CASE-GROUPING (T2.61) ---
  const groupedRecords = useMemo(() => {
    if (viewMode !== 'case') return filteredRecords;

    const byId = new Map(filteredRecords.map(r => [r.id, r]));
    const rootMap = new Map();

    const findRoot = (r) => {
      const visited = new Set();
      let current = r;
      while (current.originApptId && byId.has(current.originApptId) && !visited.has(current.originApptId)) {
        visited.add(current.id);
        current = byId.get(current.originApptId);
      }
      return current.id;
    };

    filteredRecords.forEach(r => {
      rootMap.set(r.id, findRoot(r));
    });

    const groups = new Map();
    filteredRecords.forEach(r => {
      const rootId = rootMap.get(r.id);
      if (!groups.has(rootId)) groups.set(rootId, []);
      groups.get(rootId).push(r);
    });

    const result = [];
    for (const [, visits] of groups) {
      visits.sort((a, b) => (a.jsCreatedAt || 0) - (b.jsCreatedAt || 0));
      visits.forEach((v, i) => {
        result.push({
          ...v,
          _caseGroupIndex: i + 1,
          _caseGroupSize: visits.length,
          _isCaseHeader: i === 0,
        });
      });
    }
    return result;
  }, [viewMode, filteredRecords]);

  // --- ACTIONS HANDLERS ---
  const handleOpenAudit = (event, row) => {
    setAnchorEl(event.currentTarget);
    setActiveAuditRow(row);
  };

  const handleCloseAudit = () => {
    setAnchorEl(null);
    setActiveAuditRow(null);
  };

  const handleReschedule = async () => {
    if (!rescheduleData.newDate || !rescheduleData.reason.trim()) return;
    try {
      const oldDate = activeAuditRow.jsScheduled;
      await rescheduleAppointment(activeAuditRow, rescheduleData.newDate, rescheduleData.reason, settings);

      setLastReschedule({
        appointmentId: activeAuditRow.id,
        oldDate: oldDate,
        newDate: rescheduleData.newDate,
      });

      setToast({
        open: true,
        message: `Visit rescheduled to ${new Date(rescheduleData.newDate).toLocaleString()}`,
        severity: 'success',
      });
      setOpenReschedule(false);
      setRescheduleData({ newDate: '', reason: '' });
      handleCloseAudit();
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };

  const handleUndoReschedule = async () => {
    if (!lastReschedule) return;
    try {
      const apptRef = doc(db, "appointments", lastReschedule.appointmentId);
      await updateDoc(apptRef, {
        scheduledDate: lastReschedule.oldDate instanceof Date
          ? Timestamp.fromDate(lastReschedule.oldDate)
          : lastReschedule.oldDate,
        clinicalPulse: arrayUnion({
          type: 'RESCHEDULE_UNDO',
          note: 'Reschedule reverted from Records ledger',
          staffName: user?.fullName || 'Unknown',
          staffId: user?.uid || '',
          timestamp: Timestamp.now(), // CLIENT-SIDE CLOCK — see W1 in pulseUtils.js
          eventId: makePulseEventId('resched-undo')
        })
      });
      setLastReschedule(null);
      setToast({ open: true, message: 'Reschedule undone', severity: 'info' });
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };

  const handleCancelAppt = () => {
    setVoidDialog({ open: true, reason: '' });
  };

  const confirmVoid = async () => {
    if (!voidDialog.reason.trim()) return;
    try {
      await rejectAppointment(activeAuditRow.id, voidDialog.reason, activeAuditRow.services, false, {}, activeAuditRow);
      setVoidDialog({ open: false, reason: '' });
      handleCloseAudit();
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };

  const handleAddAddendum = async () => {
    if (!addendumText.trim() || !activeAuditRow || !user) return;
    setAddendumLoading(true);
    try {
      const apptRef = doc(db, "appointments", activeAuditRow.id);
      await updateDoc(apptRef, {
        clinicalPulse: arrayUnion({
          type: 'AUDIT_ADDENDUM',
          note: addendumText.trim(),
          staffName: user?.fullName || user?.email || 'Unknown',
          staffId: user?.uid || '',
          timestamp: Timestamp.now(), // CLIENT-SIDE CLOCK — see W1 in pulseUtils.js
          eventId: makePulseEventId('addendum')
        })
      });
      setAddendumText('');
      setToast({ open: true, message: 'Addendum saved', severity: 'success' });
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setAddendumLoading(false);
    }
  };

  const handlePrintVisit = (row) => {
    const services = (row.services || []).map(s => esc(s.name || (typeof s === 'string' ? s : '—'))).join(', ') || esc(row.primaryService) || '—';
    const pulse = (row.clinicalPulse || [])
      .map(p => `<tr><td>${esc(p.type)}</td><td>${esc(p.timestamp?.toDate ? p.timestamp.toDate().toLocaleString('en-PH') : '—')}</td><td>${esc(p.staffName || '—')}</td><td>${esc(p.note || '')}</td></tr>`)
      .join('');
    const clinicName = settings?.clinicName || 'VetConnect Clinic';
    const clinicAddress = settings?.clinicAddress || '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Visit Summary</title><style>${PRINT_STYLES}</style></head><body>
      <div class="clinic-header">
        <p class="clinic-name">${esc(clinicName)}</p>
        ${clinicAddress ? `<p class="clinic-address">${esc(clinicAddress)}</p>` : ''}
        <p class="doc-title">Visit Summary</p>
      </div>
      <div class="info-grid">
        <div><span class="label">Patient:</span> <span class="value">${esc(row.petName || '—')}</span></div>
        <div><span class="label">Species:</span> <span class="value">${esc(row.petSpecies || '—')}</span></div>
        <div><span class="label">Breed:</span> <span class="value">${esc(row.petBreed || '—')}</span></div>
        <div><span class="label">Owner:</span> <span class="value">${esc(row.ownerName || '—')}</span></div>
        <div><span class="label">Phone:</span> <span class="value">${esc(row.ownerPhone || '—')}</span></div>
        <div><span class="label">Status:</span> <span class="value">${esc(row.status ? row.status.toUpperCase() : '—')}</span></div>
        <div><span class="label">Created:</span> <span class="value">${esc(row.jsCreatedAt ? row.jsCreatedAt.toLocaleString('en-PH') : '—')}</span></div>
        <div><span class="label">Scheduled:</span> <span class="value">${esc(row.jsScheduled ? row.jsScheduled.toLocaleString('en-PH') : '—')}</span></div>
        <div><span class="label">Assigned Vet:</span> <span class="value">${esc(row.assignedVetName || '—')}</span></div>
      </div>
      <h2>Services</h2>
      <p>${services}</p>
      ${row.caseDay > 1 ? `<h2>Case Info</h2><p>Day ${esc(String(row.caseDay))} of ongoing case</p>` : ''}
      ${pulse ? `<h2>Clinical Pulse (Audit Trail)</h2>
      <table><tr><th>Event</th><th>Time</th><th>Staff</th><th>Note</th></tr>${pulse}</table>` : ''}
      <div class="footer">
        <p>Generated ${new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })} — VetConnect Visit Ledger</p>
      </div>
    </body></html>`;

    openPrintWindow(html, () => setToast({ open: true, message: 'Pop-up blocked — allow pop-ups for this site', severity: 'warning' }));
  };

  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id).then(() => {
      setToast({ open: true, message: `Copied: ${id.slice(0, 12)}...`, severity: 'success' });
    }).catch(() => {
      setToast({ open: true, message: 'Copy failed', severity: 'error' });
    });
  };

  const handleBulkReschedule = async () => {
    if (!bulkDate || !bulkReason.trim()) return;
    let successCount = 0;
    const failures = [];
    for (const id of selectedRows) {
      const record = filteredRecords.find(r => r.id === id);
      if (record) {
        try {
          await rescheduleAppointment(record, bulkDate, bulkReason, settings);
          successCount++;
        } catch (e) {
          failures.push(id);
        }
      }
    }
    const msg = failures.length
      ? `${successCount} rescheduled, ${failures.length} failed`
      : `${successCount} visits rescheduled`;
    setToast({ open: true, message: msg, severity: failures.length ? 'warning' : 'success' });
    setBulkReschedule(false);
    setBulkDate('');
    setBulkReason('');
    setSelectedRows([]);
  };

  const handleBulkReassign = async () => {
    if (!reassignVetId) return;
    const vet = vets.find(v => v.id === reassignVetId);
    try {
      const batch = writeBatch(db);
      for (const id of selectedRows) {
        const ref = doc(db, "appointments", id);
        batch.update(ref, {
          assignedVetId: reassignVetId,
          assignedVetName: vet?.fullName || vet?.name || 'Unknown',
          clinicalPulse: arrayUnion({
            type: 'STAFF_REASSIGN',
            note: `Bulk reassigned to ${vet?.fullName || 'Unknown'} from Records`,
            staffName: user?.fullName || 'Unknown',
            staffId: user?.uid || '',
            timestamp: Timestamp.now(), // CLIENT-SIDE CLOCK — see W1 in pulseUtils.js
            eventId: makePulseEventId('reassign')
          })
        });
      }
      await batch.commit();
      setToast({ open: true, message: `${selectedRows.length} visits reassigned to ${vet?.fullName}`, severity: 'success' });
      setBulkReassign(false);
      setReassignVetId('');
      setSelectedRows([]);
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };

  const columns = [
    {
      field: 'lineage', headerName: 'Case', width: 80, align: 'center', headerAlign: 'center',
      renderCell: (p) => {
        const caseDay = p.row.caseDay || 1;
        const hasChain = p.row.originApptId || caseDay > 1;
        if (!hasChain && caseDay <= 1) return null;
        return (
          <Chip
            label={`Day ${caseDay}`}
            size="small"
            sx={{
              height: 20, fontSize: '0.6rem', fontWeight: '1000', borderRadius: 0,
              bgcolor: caseDay === 1 ? '#E3F2FD' : '#FFF3E0',
              color: caseDay === 1 ? COLORS.medical : COLORS.warning,
              border: `1px solid ${caseDay === 1 ? COLORS.medical : COLORS.warning}`,
            }}
          />
        );
      }
    },
    {
      field: 'jsCreatedAt', headerName: 'Created', width: 220,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ fontWeight: '1000', color: '#3E2723', lineHeight: 1.2 }}>
                {p.value ? p.value.toLocaleDateString() : 'N/A'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'textSecondary', fontWeight: '900', fontSize: '0.65rem' }}>
                LOGGED: {p.value ? p.value.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}
            </Typography>
        </Box>
      )
    },
    {
      field: 'identity', headerName: 'Patient', flex: 1.2, minWidth: 250,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
            <Typography sx={{ fontWeight: '1000', color: '#1A1A1A', lineHeight: 1.1 }}>
                {p.row.petName?.toUpperCase()}
            </Typography>
            <Typography variant="caption" sx={{ color: '#795548', fontWeight: '900', fontSize: '0.65rem' }}>
                {p.row.petSpecies} • {p.row.ownerName}
            </Typography>
        </Box>
      )
    },
    {
      field: 'jsScheduled', headerName: 'Scheduled', width: 180,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', gap: 1 }}>
            <CalendarMonthIcon sx={{ fontSize: 16, color: COLORS.accentLight }} />
            <Typography variant="body2" sx={{ fontWeight: '900', color: '#5D4037' }}>
                {p.value ? p.value.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'ASAP'}
            </Typography>
        </Box>
      )
    },
    {
      field: 'services', headerName: 'Services', flex: 1, minWidth: 200,
      renderCell: (p) => {
        const services = p.value || [];
        return (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', height: '100%' }}>
            {services.slice(0, 2).map((s, i) => (
              <Chip key={i} label={s.name} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem', fontWeight: '1000', borderRadius: 0, borderColor: '#D7CCC8' }} />
            ))}
            {services.length > 2 && <Typography variant="caption" sx={{ fontWeight: '1000', color: 'text.disabled' }}>+{services.length - 2}</Typography>}
          </Box>
        );
      }
    },
    {
       field: 'status', headerName: 'Status', width: 150, align: 'center', headerAlign: 'center',
       renderCell: (p) => {
         const s = String(p.value).toUpperCase();
         const isTerminal = TERMINAL_STATUSES.has(s.toLowerCase());
         
         let color = '#757575';
         if (['COMPLETED', 'CARRIED-OVER'].includes(s)) color = COLORS.success;
         if (['CANCELLED', 'NO-SHOW'].includes(s)) color = COLORS.danger;
         if (['IN-CONSULT', 'ARRIVED', 'DISPENSING', 'BILLING', 'ON-HOLD', 'CONFINED'].includes(s)) color = COLORS.medical;

         const amendCount = (p.row.clinicalPulse || []).filter(e => e.type === 'CLINICAL_AMENDMENT').length;
         return (
           <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
             <Box sx={{ border: `1.5px solid ${color}`, px: 1.5, py: 0.5, borderRadius: 0, bgcolor: 'white' }}>
               <Typography sx={{ color: color, fontWeight: '1000', fontSize: '0.65rem', letterSpacing: 0.5 }}>{s}</Typography>
             </Box>
             {isTerminal && (
               <Tooltip title="Visit sealed">
                 <ShieldIcon sx={{ fontSize: 14, color: COLORS.success, opacity: 0.8 }} />
               </Tooltip>
             )}
             {amendCount > 0 && (
               <Tooltip title={`${amendCount} amendment${amendCount > 1 ? 's' : ''}`}>
                 <Chip
                   label={`${amendCount}A`}
                   size="small"
                   sx={{
                     height: 18, fontSize: '0.55rem', fontWeight: 1000,
                     borderRadius: 0, ml: 0.5,
                     bgcolor: '#FFF3E0', color: '#E65100',
                     border: '1px solid #E65100',
                   }}
                 />
               </Tooltip>
             )}
           </Box>
         );
       }
    },
    {
      field: 'actions', headerName: 'Actions', width: 210, align: 'center', headerAlign: 'center',
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5} sx={{ height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <Tooltip title="Visit Audit">
            <IconButton size="small" onClick={(e) => handleOpenAudit(e, p.row)} sx={{ border: '1px solid #D7CCC8', color: COLORS.accent }}>
              <TimelineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="View File (CRM)">
            <IconButton size="small" onClick={() => navigate(`/patients/${p.row.petId}`)} sx={{ border: '1px solid #D7CCC8', color: COLORS.accent }}>
              <HistoryIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Copy Visit ID">
            <IconButton size="small" onClick={() => handleCopyId(p.row.id)} sx={{ border: '1px solid #D7CCC8', color: COLORS.accent }}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Print Visit Summary">
            <IconButton size="small" onClick={() => handlePrintVisit(p.row)}
              sx={{ border: '1px solid #D7CCC8', color: COLORS.accent }}>
              <PrintIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )
    }
  ];

  const canEdit = activeAuditRow && (
    (activeAuditRow.status === 'pending' || activeAuditRow.status === 'confirmed') && // Must be in a pre-clinical state
    (activeAuditRow.jsScheduled && activeAuditRow.jsScheduled > new Date(new Date().setHours(0,0,0,0))) // Must be for today or the future
  );

  const isHistorical = activeAuditRow && (
    ['completed', 'cancelled', 'no-show', 'carried-over'].includes(activeAuditRow.status?.toLowerCase()) ||
    (activeAuditRow.jsCreatedAt && activeAuditRow.jsCreatedAt < new Date(new Date().setHours(0,0,0,0)))
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', bgcolor: '#FFF8E1' }}>
      
      {/* 1. COMMAND STRIP HEADER */}
      <Box sx={{ flexShrink: 0, mb: 0 }}>
        <Paper elevation={0} sx={{ 
          p: 2.5, px: 4, display: 'flex', flexWrap: 'nowrap', gap: 3, alignItems: 'center',
          bgcolor: '#FFF8E1', borderBottom: '2px solid #5D4037', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: 0
        }}>
          <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: '1000', color: '#5D4037', textTransform: 'uppercase', letterSpacing: 1, flexShrink: 0, mr: 1, fontSize: '1.5rem', lineHeight: 1 }}>
            Visit Ledger
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ bgcolor: 'rgba(93, 64, 55, 0.05)', border: '2px solid #5D403733', px: 1, py: 0.5 }}>
            <TextField
              variant="standard" size="small" placeholder={`SEARCH BY ${searchMode.toUpperCase().replace('NAME', '')}...`}
              value={searchText} onChange={(e) => setSearchText(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{color: '#5D4037', opacity: 0.6}}/></InputAdornment>,
                endAdornment: searchText ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchText('')}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
                disableUnderline: true,
                style: { color: '#3E2723', fontWeight: '1000', fontSize: '0.85rem', fontFamily: 'Inter' }
              }}
              sx={{ width: 180 }}
            />
            <Divider orientation="vertical" flexItem sx={{ mx: 1, height: 20, borderColor: '#5D403733' }} />
            <ToggleButtonGroup
              value={searchMode}
              exclusive
              onChange={(e, next) => next && setSearchMode(next)}
              size="small"
              sx={{ 
                '& .MuiToggleButton-root': { 
                  border: 'none', px: 1, py: 0, color: '#A1887F',
                  '&.Mui-selected': { bgcolor: 'transparent', color: '#5D4037' }
                } 
              }}
            >
              <ToggleButton value="petName"><Tooltip title="Pet Name"><PetsIcon sx={{ fontSize: 16 }} /></Tooltip></ToggleButton>
              <ToggleButton value="ownerName"><Tooltip title="Owner Name"><PersonIcon sx={{ fontSize: 16 }} /></Tooltip></ToggleButton>
              <ToggleButton value="phone"><Tooltip title="Phone Number"><PhoneIcon sx={{ fontSize: 16 }} /></Tooltip></ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: '1000', fontSize: '0.65rem', color: '#A1887F' }}>FILTER ERA:</Typography>
            <TextField
              type="date" size="small"
              value={dateRange.start || ''}
              onChange={(e) => setDateRange(p => ({ ...p, start: e.target.value }))}
              sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733', borderRadius: 0 }, width: 140 }}
            />
            <Typography sx={{ fontWeight: '1000', color: '#5D4037' }}>→</Typography>
            <TextField
              type="date" size="small"
              value={dateRange.end || ''}
              onChange={(e) => setDateRange(p => ({ ...p, end: e.target.value }))}
              sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733', borderRadius: 0 }, width: 140 }}
            />
            <Stack direction="row" spacing={0.5} sx={{ ml: 1 }}>
              {[
                { label: 'Today', range: () => { const d = new Date(); const s = d.toISOString().split('T')[0]; return { start: s, end: s }; } },
                { label: '7d', range: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 7); return { start: s.toISOString().split('T')[0], end: e.toISOString().split('T')[0] }; } },
                { label: '30d', range: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 30); return { start: s.toISOString().split('T')[0], end: e.toISOString().split('T')[0] }; } },
                { label: 'This Month', range: () => { const now = new Date(); const s = new Date(now.getFullYear(), now.getMonth(), 1); return { start: s.toISOString().split('T')[0], end: now.toISOString().split('T')[0] }; } },
              ].map(q => (
                <Chip
                  key={q.label} label={q.label} size="small" clickable
                  onClick={() => setDateRange(q.range())}
                  sx={{ height: 22, fontSize: '0.6rem', fontWeight: '1000', borderRadius: 0, border: '1px solid #D7CCC8', bgcolor: 'white' }}
                />
              ))}
              {(dateRange.start || dateRange.end) && (
                <Chip
                  label="Clear" size="small" clickable
                  onDelete={() => setDateRange({ start: null, end: null })}
                  deleteIcon={<CloseIcon sx={{ fontSize: '12px !important' }} />}
                  onClick={() => setDateRange({ start: null, end: null })}
                  sx={{ height: 22, fontSize: '0.6rem', fontWeight: '1000', borderRadius: 0, border: `1px solid ${COLORS.danger}`, color: COLORS.danger, bgcolor: 'white' }}
                />
              )}
            </Stack>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          <Stack direction="row" spacing={2} alignItems="center">
            <ToggleButtonGroup
              value={viewMode} exclusive
              onChange={(e, v) => v && setViewMode(v)}
              size="small"
              sx={{ '& .MuiToggleButton-root': { borderRadius: 0, fontWeight: '1000', fontSize: '0.65rem', px: 1.5, border: '1px solid #D7CCC8' } }}
            >
              <ToggleButton value="visit">Visits</ToggleButton>
              <ToggleButton value="case">Cases</ToggleButton>
            </ToggleButtonGroup>

              <Tooltip title="Clinical Precision Filters">
                <IconButton
                  onClick={() => setOpenDrawer(true)}
                  sx={{
                    border: '2px solid #5D4037', borderRadius: 0,
                    bgcolor: Object.values(facets).some(v => v !== '') ? '#5D4037' : 'transparent',
                    color: Object.values(facets).some(v => v !== '') ? 'white' : '#5D4037'
                  }}
                >
                  <TuneIcon />
                </IconButton>
              </Tooltip>

              <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '1.2rem', lineHeight: 1 }}>{groupedRecords.length}</Typography>
                  <Typography variant="caption" sx={{ fontWeight: '1000', opacity: 0.6, fontSize: '0.62rem', display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {facets.petSpecies || ''} {activeSilo.replace('GLOBAL', 'TOTAL').replace('_', ' ')} VISITS
                    {facets.serviceCategory ? ` • ${facets.serviceCategory}` : ''}
                    {facets.assignedVetId ? ` • ${vets.find(v => v.id === facets.assignedVetId)?.fullName || 'VET'}` : ''}
                  </Typography>
              </Box>
              <InfoIcon sx={{ color: '#5D4037', opacity: 0.2 }} />
          </Stack>
        </Paper>

        {/* 1.1 SILO TABS (NEW) */}
        <Box sx={{ bgcolor: 'white', borderBottom: '2px solid #5D403733', px: 4 }}>
           <Tabs 
             value={activeTab} 
             onChange={(e, v) => setActiveTab(v)}
             variant="scrollable"
             scrollButtons="auto"
             sx={{ 
               minHeight: 45,
               '& .MuiTabs-indicator': { bgcolor: '#5D4037', height: 3 },
               '& .MuiTab-root': { 
                 fontFamily: 'Inter', fontWeight: '1000', fontSize: '0.65rem', color: '#A1887F', py: 1, minWidth: 100,
                 '&.Mui-selected': { color: '#5D4037' }
               }
             }}
           >
              <Tab label="📜 ALL VISITS" />
              <Tab label="⚡ TRIAGE" />
              <Tab label="🏥 CLINICAL" />
              <Tab label="🐾 IN-PATIENT" />
              <Tab label="🛡️ ARCHIVE" />
              <Tab label="🚫 VOIDED" />
           </Tabs>
        </Box>
      </Box>

      {/* 2. THE MASTER LEDGER GRID */}
      <Box sx={{ flexGrow: 1, minHeight: 0, width: '100%', overflow: 'hidden', bgcolor: 'white' }}>
        <DataGrid
          loading={loading} rows={groupedRecords}
          columns={columns.map(c => ({
            ...c,
            headerClassName: 'forensic-header',
            headerName: (c.headerName || '').toUpperCase()
          }))}
          disableRowSelectionOnClick rowHeight={70}
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
          checkboxSelection
          onRowSelectionModelChange={(newModel) => {
            const ids = newModel?.ids ? [...newModel.ids] : (Array.isArray(newModel) ? newModel : []);
            setSelectedRows(ids);
          }}
          isRowSelectable={(params) => ['pending', 'confirmed'].includes(params.row.status?.toLowerCase?.())}
          getRowClassName={(params) =>
            viewMode === 'case' && !params.row._isCaseHeader ? 'case-continuation' : ''
          }
          sx={{
            border: 'none',
            bgcolor: 'white',
            '& .forensic-header': {
              bgcolor: '#FFF8E1 !important',
              color: '#5D4037',
              fontWeight: '1000 !important',
              fontSize: '0.75rem',
              letterSpacing: 1,
              textTransform: 'uppercase',
              borderBottom: '2px solid #5D4037 !important',
            },
            '& .MuiDataGrid-columnSeparator': { display: 'none' },
            '& .MuiDataGrid-cell': {
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid rgba(93, 64, 55, 0.08)',
              fontFamily: 'Inter, sans-serif'
            },
            '& .MuiDataGrid-row:hover': { bgcolor: 'rgba(93, 64, 55, 0.04)' },
            ...(viewMode === 'case' ? {
              '& .case-continuation': {
                bgcolor: 'rgba(93, 64, 55, 0.02)',
                borderLeft: `3px solid ${COLORS.accentLight}`,
              }
            } : {}),
          }}
        />
      </Box>

      {/* --- 🧬 FORENSIC AUDIT POPOVER --- */}
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleCloseAudit}
        anchorOrigin={{ vertical: 'center', horizontal: 'left' }}
        transformOrigin={{ vertical: 'center', horizontal: 'right' }}
        PaperProps={{ sx: { width: 380, borderRadius: 0, border: '2px solid #5D4037', p: 0, overflow: 'hidden', boxShadow: '10px 10px 0px rgba(93, 64, 55, 0.1)' } }}
      >
        {activeAuditRow && (
          <Box>
            <Box sx={{ bgcolor: '#FFF8E1', p: 1.5, borderBottom: '1px solid #5D4037', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                <TimelineIcon fontSize="small" /> VISIT AUDIT: {activeAuditRow.id.slice(0, 8).toUpperCase()}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                {activeAuditRow.ownerPhone && (
                  <Chip
                    icon={<PhoneIcon sx={{ fontSize: '10px !important' }} />}
                    label={activeAuditRow.ownerPhone}
                    size="small"
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.6rem', fontWeight: 1000, color: '#5D4037', borderColor: '#D7CCC8' }}
                  />
                )}
                {ancestors.length > 0 && (
                  <Chip
                    label={`CASE DAY ${activeAuditRow.caseDay || ancestors.length + 1}`}
                    size="small"
                    sx={{ height: 18, fontSize: '0.6rem', fontWeight: 1000, bgcolor: '#E65100', color: 'white' }}
                  />
                )}
                {canEdit && (
                  <IconButton
                    size="small"
                    onClick={() => setEditIdentity({
                      petName: activeAuditRow.petName || '',
                      ownerName: activeAuditRow.ownerName || '',
                      ownerPhone: activeAuditRow.ownerPhone || ''
                    })}
                    sx={{ border: '1px solid #D7CCC8' }}
                  >
                    <EditCalendarIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                )}
              </Stack>
            </Box>
            
            <Box sx={{ p: 2, maxHeight: 400, overflowY: 'auto', bgcolor: 'white' }}>
              {/* IDENTITY EDIT FORM (T2.67) */}
              {editIdentity && canEdit && (
                <Box sx={{ mb: 2, p: 1.5, border: `1px solid ${COLORS.accent}`, bgcolor: '#FAF9F7' }}>
                  <Typography sx={{ fontWeight: '1000', fontSize: '0.6rem', color: COLORS.accent, mb: 1, textTransform: 'uppercase' }}>
                    Edit Visit Identity
                  </Typography>
                  <Stack spacing={1}>
                    <TextField size="small" label="Pet Name" value={editIdentity.petName}
                      onChange={(e) => setEditIdentity(p => ({ ...p, petName: e.target.value }))}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }} />
                    <TextField size="small" label="Owner Name" value={editIdentity.ownerName}
                      onChange={(e) => setEditIdentity(p => ({ ...p, ownerName: e.target.value }))}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }} />
                    <TextField size="small" label="Phone" value={editIdentity.ownerPhone}
                      onChange={(e) => setEditIdentity(p => ({ ...p, ownerPhone: e.target.value }))}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }} />
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="contained"
                        onClick={async () => {
                          if (!editIdentity.petName.trim() || !editIdentity.ownerName.trim()) {
                            setToast({ open: true, message: 'Pet name and owner name are required', severity: 'error' });
                            return;
                          }
                          if (!user) return;
                          try {
                            const apptRef = doc(db, "appointments", activeAuditRow.id);
                            await updateDoc(apptRef, {
                              petName: editIdentity.petName.trim(),
                              ownerName: editIdentity.ownerName.trim(),
                              ownerPhone: editIdentity.ownerPhone.trim(),
                              clinicalPulse: arrayUnion({
                                type: 'IDENTITY_EDIT',
                                note: 'Identity updated from Records ledger',
                                staffName: user?.fullName || 'Unknown',
                                staffId: user?.uid || '',
                                timestamp: Timestamp.now(), // CLIENT-SIDE CLOCK — see W1 in pulseUtils.js
                                eventId: makePulseEventId('id-edit')
                              })
                            });
                            setEditIdentity(null);
                            setToast({ open: true, message: 'Identity updated', severity: 'success' });
                          } catch (err) {
                            setToast({ open: true, message: err.message, severity: 'error' });
                          }
                        }}
                        sx={{ bgcolor: COLORS.accent, fontWeight: '1000', fontSize: '0.65rem', borderRadius: 0 }}
                      >
                        Save
                      </Button>
                      <Button size="small" onClick={() => setEditIdentity(null)}
                        sx={{ fontWeight: '1000', fontSize: '0.65rem' }}>
                        Cancel
                      </Button>
                    </Stack>
                  </Stack>
                </Box>
              )}

              {/* SECTION 1: CUMULATIVE TIMELINE */}
              <Typography variant="overline" sx={{ fontWeight: '1000', color: '#795548', mb: 1.5, display: 'block', letterSpacing: 1, fontSize: '0.6rem' }}>
                 🧬 CLINICAL PULSE (FULL CHAIN)
              </Typography>
              <Stack spacing={2} sx={{ position: 'relative', pl: 3, mb: 4 }}>
                   <Box sx={{ position: 'absolute', left: 8, top: 4, bottom: 4, width: '2px', borderLeft: '2px dashed #D7CCC8' }} />
                   {(combinedPulse.length > 0 ? combinedPulse : []).map((p, i) => (
                     <Box key={i} sx={{ position: 'relative' }}>
                        <Box sx={{ position: 'absolute', left: -26, top: 4, width: 8, height: 8, borderRadius: '50%', bgcolor: '#5D4037', border: '2px solid white' }} />
                        <Typography variant="caption" sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.62rem', display: 'block' }}>
                           {p.type}: {String(p.toStatus || 'EVENT').toUpperCase()}
                        </Typography>
                        <Typography sx={{ fontWeight: '900', fontSize: '0.75rem', color: '#1A1A1A' }}>
                           {p.timestamp?.toDate ? p.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                           <span style={{ opacity: 0.6, fontSize: '0.7rem', marginLeft: 4 }}>● {p.staffName}</span>
                        </Typography>
                        {p.note && <Typography variant="caption" sx={{ display: 'block', fontStyle: 'italic', fontSize: '0.65rem', mt: 0.5, color: '#795548', lineHeight: 1.2 }}>↳ {p.note}</Typography>}
                     </Box>
                   ))}
              </Stack>

              {/* SECTION 2: HISTORICAL SERVICE LEDGER */}
              <Typography variant="overline" sx={{ fontWeight: '1000', color: '#795548', mb: 1, display: 'block', letterSpacing: 1, fontSize: '0.6rem' }}>
                 🏥 SERVICE FOOTPRINT PER DAY
              </Typography>
              <Stack spacing={1} sx={{ mb: 2 }}>
                {combinedServices.map((day, idx) => (
                  <Box key={idx} sx={{ p: 1, bgcolor: '#F5F5F5', borderLeft: `3px solid ${idx === combinedServices.length - 1 ? '#2E7D32' : '#9E9E9E'}` }}>
                    <Typography sx={{ fontWeight: '1000', fontSize: '0.6rem', color: '#5D4037', mb: 0.5 }}>
                      DAY {idx + 1}: {day.date?.toDate ? day.date.toDate().toLocaleDateString() : 'Active'}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {day.services.map((s, si) => (
                        <Chip key={si} label={s.name} size="small" sx={{ height: 16, fontSize: '0.55rem', fontWeight: '800', borderRadius: 0, bgcolor: 'white', border: '1px solid #D7CCC8' }} />
                      ))}
                    </Box>
                  </Box>
                ))}
              </Stack>

              {/* SECTION 3: LINKED VISITS (T2.63) */}
              {(activeAuditRow.originApptId || activeAuditRow.followUpId) && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="overline" sx={{ fontWeight: '1000', color: '#795548', mb: 1, display: 'block', letterSpacing: 1, fontSize: '0.6rem' }}>
                    🔗 LINKED VISITS
                  </Typography>
                  <Stack spacing={0.5}>
                    {activeAuditRow.originApptId && (
                      <Button
                        size="small" variant="outlined" fullWidth
                        startIcon={<ChevronRightIcon sx={{ transform: 'rotate(180deg)' }} />}
                        onClick={() => {
                          handleCloseAudit();
                          setToast({ open: true, message: `Origin: ${activeAuditRow.originApptId.slice(0, 8)}`, severity: 'info' });
                        }}
                        sx={{ borderRadius: 0, fontWeight: '900', fontSize: '0.65rem', justifyContent: 'flex-start', borderColor: '#D7CCC8', textTransform: 'none' }}
                      >
                        ← Previous Visit (Day {(activeAuditRow.caseDay || 2) - 1})
                      </Button>
                    )}
                    {activeAuditRow.followUpId && (
                      <Button
                        size="small" variant="outlined" fullWidth
                        endIcon={<ChevronRightIcon />}
                        onClick={() => {
                          handleCloseAudit();
                          setToast({ open: true, message: `Follow-up: ${activeAuditRow.followUpId.slice(0, 8)}`, severity: 'info' });
                        }}
                        sx={{ borderRadius: 0, fontWeight: '900', fontSize: '0.65rem', justifyContent: 'flex-start', borderColor: '#D7CCC8', textTransform: 'none' }}
                      >
                        Next Visit → (Follow-up)
                      </Button>
                    )}
                  </Stack>
                </Box>
              )}
            </Box>

            <Box sx={{ p: 1.5, borderTop: '1px solid #D7CCC8' }}>
               <ForensicMetricGrid
                 pulse={activeAuditRow.clinicalPulse || []}
                 createdAt={activeAuditRow.createdAt}
                 targetDate={activeAuditRow.jsScheduled}
                 cumulativeTotals={cumulativeTotals}
                 liveAge={!activeAuditRow.forensicSeal && !TERMINAL_STATUSES.has(activeAuditRow.status?.toLowerCase())}
               />
            </Box>

            <Divider />

            <Box sx={{ p: 1, bgcolor: '#FAF9F7' }}>
              {canEdit ? (
                <Stack direction="row" spacing={1}>
                  <Button
                    fullWidth size="small" variant="contained"
                    startIcon={<EditCalendarIcon />}
                    sx={{ bgcolor: COLORS.accent, fontWeight: '1000', fontSize: '0.65rem', borderRadius: 0 }}
                    onClick={() => setOpenReschedule(true)}
                  >
                    Reschedule
                  </Button>
                  <Button
                    fullWidth size="small" variant="outlined"
                    startIcon={<LocalHospitalIcon />}
                    sx={{ fontWeight: '1000', fontSize: '0.65rem', borderColor: COLORS.warning, color: COLORS.warning, borderRadius: 0 }}
                    onClick={async () => {
                      if (!user) return;
                      try {
                        const apptRef = doc(db, "appointments", activeAuditRow.id);
                        await updateDoc(apptRef, {
                          isDeferred: true,
                          clinicalPulse: arrayUnion({
                            type: 'DEFERRED',
                            staffName: user?.fullName || 'Unknown',
                            staffId: user?.uid || '',
                            timestamp: Timestamp.now(), // CLIENT-SIDE CLOCK — see W1 in pulseUtils.js
                            eventId: makePulseEventId('defer')
                          })
                        });
                        setToast({ open: true, message: 'Visit deferred', severity: 'info' });
                        handleCloseAudit();
                      } catch (err) {
                        setToast({ open: true, message: err.message, severity: 'error' });
                      }
                    }}
                  >
                    Defer
                  </Button>
                  <Button
                    fullWidth size="small" variant="outlined" color="error"
                    startIcon={<CancelIcon />}
                    sx={{ fontWeight: '1000', fontSize: '0.65rem', borderColor: COLORS.danger, borderRadius: 0 }}
                    onClick={handleCancelAppt}
                  >
                    Void
                  </Button>
                </Stack>
              ) : (
                <Box sx={{ p: 1, border: '1px solid #D7CCC8', bgcolor: '#FFF8E1' }}>
                  {isHistorical ? (
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                        <LockIcon sx={{ fontSize: 16, color: '#5D4037' }} />
                        <Box>
                          <Typography variant="caption" sx={{ display: 'block', color: '#5D4037', fontWeight: '1000', fontSize: '0.6rem' }}>
                            VISIT SEALED
                          </Typography>
                          <Typography variant="caption" sx={{ display: 'block', color: '#A1887F', fontWeight: '800', lineHeight: 1 }}>
                            Medical data is locked. You may add audit addendums below.
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                        <TextField
                          size="small" fullWidth multiline maxRows={3}
                          placeholder="Add audit addendum..."
                          value={addendumText}
                          onChange={(e) => setAddendumText(e.target.value)}
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.75rem' } }}
                        />
                        <Button
                          variant="contained" size="small"
                          disabled={!addendumText.trim() || addendumLoading}
                          onClick={handleAddAddendum}
                          sx={{ bgcolor: COLORS.accent, fontWeight: '1000', fontSize: '0.6rem', borderRadius: 0, minWidth: 80, whiteSpace: 'nowrap' }}
                        >
                          {addendumLoading ? 'Saving...' : 'Add Note'}
                        </Button>
                      </Box>
                    </>
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <InfoIcon sx={{ fontSize: 16, color: COLORS.medical }} />
                      <Typography variant="caption" sx={{ color: '#5D4037', fontWeight: '900', fontSize: '0.65rem' }}>
                        ACTIVE TRIAGE: Actions restricted to Queue Dashboard.
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Popover>

      {/* --- 🧬 RESCHEDULE MODAL --- */}
      <Dialog open={openReschedule} onClose={() => setOpenReschedule(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 0, border: '4px solid #5D4037' } }}>
        <DialogTitle sx={{ bgcolor: '#FFF8E1', color: '#5D4037', fontWeight: '1000', borderBottom: '2px solid #5D4037' }}>
           RESCHEDULE VISIT
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
           <Typography variant="caption" sx={{ fontWeight: '1000', color: '#795548', mb: 2, display: 'block' }}>
              Rescheduling will update the visit timeline and log an audit event.
           </Typography>
           
           <TextField
             fullWidth type="datetime-local" label="NEW TARGET WINDOW"
             InputLabelProps={{ shrink: true, sx: { fontWeight: '1000', color: '#5D4037' } }}
             value={rescheduleData.newDate}
             onChange={(e) => setRescheduleData(prev => ({ ...prev, newDate: e.target.value }))}
             sx={{ mb: 3, '& .MuiOutlinedInput-root': { borderRadius: 0, borderColor: '#5D4037' } }}
           />

           <Typography variant="overline" sx={{ fontWeight: '1000', color: '#D32F2F', display: 'block', mb: 1 }}>
               REASON FOR RESCHEDULE
           </Typography>
           <TextField
             fullWidth multiline rows={3} placeholder="Provide justification for this shift..."
             value={rescheduleData.reason}
             onChange={(e) => setRescheduleData(prev => ({ ...prev, reason: e.target.value }))}
             sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
           />
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#FFF8E1', borderTop: '2px solid #5D4037' }}>
           <Button onClick={() => setOpenReschedule(false)} sx={{ fontWeight: '1000', color: '#757575' }}>Cancel</Button>
           <Button 
             variant="contained" 
             disabled={!rescheduleData.newDate || !rescheduleData.reason.trim()}
             sx={{ bgcolor: '#5D4037', fontWeight: '1000', px: 4, borderRadius: 0 }}
             onClick={handleReschedule}
           >
             Apply Shift
           </Button>
        </DialogActions>
      </Dialog>

      {/* VOID DIALOG (T2.59) */}
      <Dialog open={voidDialog.open} onClose={() => setVoidDialog({ open: false, reason: '' })} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `4px solid ${COLORS.danger}` } }}>
        <DialogTitle sx={{ bgcolor: COLORS.dangerSurface, color: COLORS.danger, fontWeight: '1000', borderBottom: `2px solid ${COLORS.danger}` }}>
          VOID VISIT
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 600 }}>
            This action will cancel the visit and log a void event. This cannot be undone.
          </Typography>
          <TextField
            fullWidth multiline rows={3} label="Reason for voiding"
            value={voidDialog.reason}
            onChange={(e) => setVoidDialog(prev => ({ ...prev, reason: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: COLORS.dangerSurface, borderTop: `2px solid ${COLORS.danger}` }}>
          <Button onClick={() => setVoidDialog({ open: false, reason: '' })} sx={{ fontWeight: '1000', color: '#757575' }}>Cancel</Button>
          <Button variant="contained" disabled={!voidDialog.reason.trim()} onClick={confirmVoid}
            sx={{ bgcolor: COLORS.danger, fontWeight: '1000', px: 4, borderRadius: 0 }}>
            Confirm Void
          </Button>
        </DialogActions>
      </Dialog>

      {/* BULK RESCHEDULE DIALOG (T2.73) */}
      <Dialog open={bulkReschedule} onClose={() => setBulkReschedule(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: '4px solid #5D4037' } }}>
        <DialogTitle sx={{ bgcolor: '#FFF8E1', color: '#5D4037', fontWeight: '1000', borderBottom: '2px solid #5D4037' }}>
          BULK RESCHEDULE ({selectedRows.length} VISITS)
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <TextField
            fullWidth type="datetime-local" label="New Date/Time"
            InputLabelProps={{ shrink: true }}
            value={bulkDate}
            onChange={(e) => setBulkDate(e.target.value)}
            sx={{ mb: 3, '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
          />
          <TextField
            fullWidth multiline rows={3} label="Reason"
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#FFF8E1', borderTop: '2px solid #5D4037' }}>
          <Button onClick={() => setBulkReschedule(false)} sx={{ fontWeight: '1000', color: '#757575' }}>Cancel</Button>
          <Button variant="contained" disabled={!bulkDate || !bulkReason.trim()} onClick={handleBulkReschedule}
            sx={{ bgcolor: '#5D4037', fontWeight: '1000', borderRadius: 0 }}>
            Reschedule All
          </Button>
        </DialogActions>
      </Dialog>

      {/* BULK REASSIGN DIALOG (T2.74) */}
      <Dialog open={bulkReassign} onClose={() => setBulkReassign(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `4px solid ${COLORS.medical}` } }}>
        <DialogTitle sx={{ bgcolor: '#E3F2FD', color: COLORS.medical, fontWeight: '1000', borderBottom: `2px solid ${COLORS.medical}` }}>
          REASSIGN {selectedRows.length} VISITS
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <FormControl fullWidth>
            <InputLabel>Assign to</InputLabel>
            <Select
              value={reassignVetId} label="Assign to"
              onChange={(e) => setReassignVetId(e.target.value)}
              sx={{ borderRadius: 0 }}
            >
              {vets.map(v => (
                <MenuItem key={v.id} value={v.id}>{v.fullName || v.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#E3F2FD', borderTop: `2px solid ${COLORS.medical}` }}>
          <Button onClick={() => setBulkReassign(false)} sx={{ fontWeight: '1000', color: '#757575' }}>Cancel</Button>
          <Button variant="contained" disabled={!reassignVetId} onClick={handleBulkReassign}
            sx={{ bgcolor: COLORS.medical, fontWeight: '1000', borderRadius: 0 }}>
            Reassign All
          </Button>
        </DialogActions>
      </Dialog>

      {/* BULK ACTION FLOATING BAR (T2.73 / T2.74) */}
      {selectedRows.length > 0 && (
        <Box sx={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          bgcolor: COLORS.brand, color: 'white', px: 3, py: 1.5,
          display: 'flex', alignItems: 'center', gap: 2,
          border: `2px solid ${COLORS.accent}`, boxShadow: '4px 4px 0px rgba(0,0,0,0.2)',
          zIndex: 1000,
        }}>
          <Typography sx={{ fontWeight: '1000', fontSize: '0.8rem' }}>
            {selectedRows.length} selected
          </Typography>
          <Button
            size="small" variant="contained"
            startIcon={<EditCalendarIcon />}
            onClick={() => setBulkReschedule(true)}
            sx={{ bgcolor: COLORS.accent, fontWeight: '1000', fontSize: '0.7rem', borderRadius: 0 }}
          >
            Bulk Reschedule
          </Button>
          <Button
            size="small" variant="contained"
            onClick={() => setBulkReassign(true)}
            sx={{ bgcolor: COLORS.medical, fontWeight: '1000', fontSize: '0.7rem', borderRadius: 0 }}
          >
            Reassign Staff
          </Button>
          <Button
            size="small" variant="outlined"
            onClick={() => setSelectedRows([])}
            sx={{ color: 'white', borderColor: 'white', fontWeight: '1000', fontSize: '0.7rem', borderRadius: 0 }}
          >
            Clear
          </Button>
        </Box>
      )}

      {/* TOAST SNACKBAR (T2.59) — center-bottom to avoid overlap with undo snackbar */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast(p => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} onClose={() => setToast(p => ({ ...p, open: false }))} sx={{ borderRadius: 0 }}>
          {toast.message}
        </Alert>
      </Snackbar>

      {/* UNDO RESCHEDULE SNACKBAR (T2.72) — left-bottom (T2.57a: separated from toast) */}
      {lastReschedule && (
        <Snackbar
          open={true}
          autoHideDuration={10000}
          onClose={() => setLastReschedule(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <Alert severity="info" action={
            <Button color="inherit" size="small" onClick={handleUndoReschedule} sx={{ fontWeight: '1000' }}>
              UNDO
            </Button>
          } sx={{ borderRadius: 0 }}>
            Visit rescheduled. Undo?
          </Alert>
        </Snackbar>
      )}

      <Drawer
        anchor="right"
        open={openDrawer}
        onClose={() => setOpenDrawer(false)}
        PaperProps={{ sx: { width: 350, p: 3, bgcolor: '#FFF8E1', borderLeft: '3px solid #5D4037', borderRadius: 0 } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: 1 }}>
            Filter Visits
          </Typography>
          <IconButton onClick={() => setOpenDrawer(false)}><CloseIcon /></IconButton>
        </Box>

        {/* SAVED PRESETS (T2.71) */}
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.65rem', mb: 1, textTransform: 'uppercase' }}>
            Saved Presets
          </Typography>
          {presets.length === 0 && (
            <Typography variant="caption" sx={{ color: '#A1887F', fontStyle: 'italic' }}>No saved presets yet.</Typography>
          )}
          <Stack spacing={0.5}>
            {presets.map(p => (
              <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button
                  size="small" fullWidth variant="outlined"
                  onClick={() => {
                    const fs = p.filterState;
                    if (fs.activeSilo !== undefined) setActiveTab(SILO_MAP.indexOf(fs.activeSilo));
                    if (fs.facets) setFacets(fs.facets);
                    if (fs.dateRange) setDateRange(fs.dateRange);
                    if (fs.searchMode) setSearchMode(fs.searchMode);
                    if (fs.searchText) setSearchText(fs.searchText);
                    setOpenDrawer(false);
                  }}
                  sx={{ borderRadius: 0, fontWeight: '900', fontSize: '0.7rem', justifyContent: 'flex-start', textTransform: 'none', borderColor: '#D7CCC8' }}
                >
                  {p.name}
                </Button>
                <IconButton size="small" onClick={() => deletePreset(p.id)}>
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            ))}
          </Stack>
          <Divider sx={{ my: 1.5 }} />
          {showSavePreset ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size="small" placeholder="Preset name..."
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.75rem' } }}
              />
              <Button
                size="small" variant="contained"
                disabled={!presetName.trim()}
                onClick={async () => {
                  await savePreset(presetName.trim(), {
                    activeSilo: SILO_MAP[activeTab],
                    facets,
                    dateRange,
                    searchMode,
                    searchText,
                  });
                  setPresetName('');
                  setShowSavePreset(false);
                }}
                sx={{ bgcolor: COLORS.accent, borderRadius: 0, fontWeight: '1000', fontSize: '0.65rem' }}
              >
                Save
              </Button>
            </Box>
          ) : (
            <Button
              size="small" fullWidth variant="outlined"
              onClick={() => setShowSavePreset(true)}
              sx={{ borderRadius: 0, fontWeight: '1000', fontSize: '0.65rem', borderColor: COLORS.accent, color: COLORS.accent }}
            >
              + Save Current Filters
            </Button>
          )}
        </Box>

        <Stack spacing={4}>
           <FormControl fullWidth variant="outlined">
              <InputLabel sx={{ fontWeight: '1000', color: '#5D4037' }}>ASSIGNED VET</InputLabel>
              <Select
                value={facets.assignedVetId}
                label="ASSIGNED VET"
                onChange={(e) => setFacets(prev => ({ ...prev, assignedVetId: e.target.value }))}
                sx={{ borderRadius: 0, bgcolor: 'white' }}
              >
                <MenuItem value=""><em>Any Veterinarian</em></MenuItem>
                {vets.map(v => (
                  <MenuItem key={v.id} value={v.id}>{v.fullName || v.name}</MenuItem>
                ))}
              </Select>
           </FormControl>

           <FormControl fullWidth variant="outlined">
              <InputLabel sx={{ fontWeight: '1000', color: '#5D4037' }}>CLINICAL DEPT</InputLabel>
              <Select
                value={facets.serviceCategory}
                label="CLINICAL DEPT"
                onChange={(e) => setFacets(prev => ({ ...prev, serviceCategory: e.target.value }))}
                sx={{ borderRadius: 0, bgcolor: 'white' }}
              >
                <MenuItem value=""><em>All Departments</em></MenuItem>
                {departments.map((d) => (
                  <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>
                ))}
              </Select>
           </FormControl>

           <FormControl fullWidth variant="outlined">
              <InputLabel sx={{ fontWeight: '1000', color: '#5D4037' }}>PATIENT SPECIES</InputLabel>
              <Select
                value={facets.petSpecies}
                label="PATIENT SPECIES"
                onChange={(e) => setFacets(prev => ({ ...prev, petSpecies: e.target.value }))}
                sx={{ borderRadius: 0, bgcolor: 'white' }}
              >
                <MenuItem value=""><em>All Species</em></MenuItem>
                <MenuItem value="Canine">Canine</MenuItem>
                <MenuItem value="Feline">Feline</MenuItem>
                <MenuItem value="Bird">Bird</MenuItem>
                <MenuItem value="Exotic">Exotic</MenuItem>
              </Select>
           </FormControl>

           <Box>
              <Typography sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.65rem', mb: 1, textTransform: 'uppercase' }}>
                 Admission Origin
              </Typography>
              <RadioGroup
                value={facets.origin}
                onChange={(e) => setFacets(prev => ({ ...prev, origin: e.target.value }))}
              >
                <FormControlLabel value="" control={<Radio size="small" />} label={<Typography sx={{ fontWeight: '900', fontSize: '0.75rem' }}>Global Flow (All)</Typography>} />
                <FormControlLabel value="ONLINE" control={<Radio size="small" />} label={<Typography sx={{ fontWeight: '900', fontSize: '0.75rem' }}>Online Bookings Only</Typography>} />
                <FormControlLabel value="WALK_IN" control={<Radio size="small" />} label={<Typography sx={{ fontWeight: '900', fontSize: '0.75rem' }}>Walk-in / ER Only</Typography>} />
              </RadioGroup>
           </Box>

           <Divider sx={{ my: 2 }} />

           <Button 
             fullWidth variant="outlined" 
             onClick={() => setFacets({ assignedVetId: '', serviceCategory: '', petSpecies: '', origin: '' })}
             sx={{ border: '2px solid #5D4037', color: '#5D4037', fontWeight: '1000', borderRadius: 0 }}
           >
              Clear All Facets
           </Button>
        </Stack>
      </Drawer>

    </Box>
  );
}
