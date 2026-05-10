import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Typography, Paper, TextField, InputAdornment, Chip, Stack, Tooltip,
  IconButton, Popover, Divider, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Tabs, Tab, FormControl, InputLabel, Select, MenuItem, Menu, ListItemIcon, ListItemText,
  Snackbar, Alert
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';

// Icons
import SearchIcon from '@mui/icons-material/Search';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import InfoIcon from '@mui/icons-material/Info';
import TimelineIcon from '@mui/icons-material/Timeline';
import EditCalendarIcon from '@mui/icons-material/EditCalendar';
import CancelIcon from '@mui/icons-material/Cancel';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import LockIcon from '@mui/icons-material/Lock';
import ShieldIcon from '@mui/icons-material/Shield';
import FilterListIcon from '@mui/icons-material/FilterList';
import CloseIcon from '@mui/icons-material/Close';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import PaidIcon from '@mui/icons-material/Paid';
import UndoIcon from '@mui/icons-material/Undo';
import FlagIcon from '@mui/icons-material/Flag';
import EventIcon from '@mui/icons-material/Event';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleFilledWhiteIcon from '@mui/icons-material/PlayCircleFilledWhite';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';

// Design Tokens
import { FONT, COLORS, TYPE, STATUS_COLORS } from '../../theme/designTokens';

// Logic
import { useGlobalRecords } from './hooks/useGlobalRecords';
import { useQueueActions } from '../Queue/useQueueActions';
import { ForensicMetricGrid } from '../Queue/ForensicMetricGrid';
import { useAncestorChain } from './hooks/useAncestorChain';
import { calculatePulseMetrics, makePulseEventId } from '../../utils/pulseUtils';
import { TERMINAL_STATUSES } from '../../utils/statusConstants';
import { query, collection, where, onSnapshot, arrayUnion, doc, updateDoc, Timestamp, writeBatch, getDocs, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useClinicSettings } from '../../hooks/useClinicSettings';
import { useUser } from '../../context/UserContext';
import { useSavedFilters } from './hooks/useSavedFilters';
import { useClosingStatus } from '../Sales/hooks/useClosingStatus';
import { getLocalDateStr } from '../../utils/dateUtils';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import PrintIcon from '@mui/icons-material/Print';
import { PRINT_STYLES, esc, openPrintWindow } from '../../utils/printUtils';
import ClinicalWorkspace from '../../components/ClinicalWorkspace';
import POSModal from '../../components/POSModal';
import AssignStaffModal from '../Queue/AssignStaffModal';
import DispensingVerificationDialog from '../Queue/DispensingVerificationDialog';

export default function Records() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useUser();

  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState({ start: null, end: null });

  // UI State for Silos
  const [activeTab, setActiveTab] = useState(0);
  const SILO_MAP = ['PENDING', 'ACTIVE', 'COMPLETED'];

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

  const [actionRow, setActionRow] = useState(null);
  const [openCW, setOpenCW] = useState(false);
  const [openPOS, setOpenPOS] = useState(false);
  const [openAssign, setOpenAssign] = useState(false);
  const [openDispenseVerify, setOpenDispenseVerify] = useState(false);
  const [dispenseRow, setDispenseRow] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [openRevert, setOpenRevert] = useState(false);
  const [revertReason, setRevertReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [noShowDialog, setNoShowDialog] = useState({ open: false, reason: '' });
  const [deferDialog, setDeferDialog] = useState({ open: false, reason: '' });

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

  const { records, loading } = useGlobalRecords(dateRange, searchText, 'petName', activeSilo, facets);
  const { changeStatus, revertStatus, markNoShow, rejectAppointment, rescheduleAppointment, deferAppointment } = useQueueActions();
  
  // --- 🧬 ANCESTOR CHAIN ENGINE ---
  const { ancestors, combinedPulse, combinedServices, loading: loadingAncestors } = useAncestorChain(activeAuditRow);

  // Clinic settings — shared singleton via useClinicSettings hook
  const settings = useClinicSettings();

  const todayStr = getLocalDateStr();
  const { isDayClosed, closingData } = useClosingStatus(todayStr);

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

  const [inventoryList, setInventoryList] = useState([]);
  const [inventoryCategories, setInventoryCategories] = useState([]);
  const [servicesList, setServicesList] = useState([]);

  React.useEffect(() => {
    const unsubInv = onSnapshot(collection(db, 'inventory'), (snap) =>
      setInventoryList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubCat = onSnapshot(collection(db, 'inventory_categories'), (snap) =>
      setInventoryCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubSvc = onSnapshot(collection(db, 'services'), (snap) =>
      setServicesList(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !s.isArchived))
    );
    return () => { unsubInv(); unsubCat(); unsubSvc(); };
  }, []);

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
      const firstVisit = visits[0];
      const lastVisit = visits[visits.length - 1];
      visits.forEach((v, i) => {
        const allCaseServices = [...new Set(visits.flatMap(vis => (vis.services || []).map(s => s.name)).filter(Boolean))].join(', ')
          || v.serviceType || 'Visit';
        const caseLabel = visits.length > 1
          ? `${v.petName || 'Unknown'} — ${allCaseServices} — Day 1–${visits.length} — ${firstVisit.jsCreatedAt?.toLocaleDateString() || '?'} to ${lastVisit.jsCreatedAt?.toLocaleDateString() || '?'}`
          : null;
        result.push({
          ...v,
          _caseGroupIndex: i + 1,
          _caseGroupSize: visits.length,
          _isCaseHeader: i === 0,
          _caseLabel: i === 0 ? caseLabel : null,
        });
      });
    }
    return result;
  }, [viewMode, filteredRecords]);

  // --- DATE-SECTION HEADERS (Task 9) ---
  const displayRecords = useMemo(() => {
    if (viewMode === 'case') return groupedRecords;

    const result = [];
    let lastDateStr = null;

    groupedRecords.forEach(r => {
      const dateStr = r.jsCreatedAt
        ? r.jsCreatedAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()
        : 'UNKNOWN DATE';

      if (dateStr !== lastDateStr) {
        result.push({
          id: `date-header-${dateStr}-${r.id}`,
          _isDateHeader: true,
          _dateLabel: dateStr,
          petName: '', ownerName: '', ownerPhone: '', status: '', services: [],
          serviceType: '', assignedVetName: '', department: '',
        });
        lastDateStr = dateStr;
      }
      result.push(r);
    });

    return result;
  }, [groupedRecords, viewMode]);

  // --- PER-TAB KPI COUNTS (Task 7) ---
  const tabStatusCounts = useMemo(() => {
    const counts = {};
    (filteredRecords || []).forEach(r => {
      const s = (r.status || '').toLowerCase();
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [filteredRecords]);

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

  const handlePrintVisit = async (row) => {
    let vetStaff = null;
    const vetUid = row.assignedVetId;
    const vetName = row.assignedVetName;
    try {
      if (vetUid) {
        const staffDoc = await getDoc(doc(db, 'users', vetUid));
        if (staffDoc.exists()) vetStaff = staffDoc.data();
      } else if (vetName) {
        const snap = await getDocs(query(collection(db, 'users'), where('fullName', '==', vetName)));
        if (!snap.empty) vetStaff = snap.docs[0].data();
      }
    } catch { /* graceful fallback */ }

    const services = (row.services || []).map(s => esc(s.name || (typeof s === 'string' ? s : '—'))).join(', ') || esc(row.primaryService) || '—';
    const pulse = (row.clinicalPulse || [])
      .map(p => `<tr><td>${esc(p.type)}</td><td>${esc(p.timestamp?.toDate ? p.timestamp.toDate().toLocaleString('en-PH') : '—')}</td><td>${esc(p.staffName || '—')}</td><td>${esc(p.note || '')}</td></tr>`)
      .join('');
    const clinicName = settings?.clinicName || 'VetConnect Clinic';
    const clinicAddress = settings?.clinicAddress || '';
    const clinicPhone = settings?.clinicPhone || '';
    const clinicBAI = settings?.baiRegistrationNumber || '';
    const vetPRC = esc(vetStaff?.prcLicense || '');
    const vetPTR = esc(vetStaff?.ptrNumber || '');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Visit Summary</title><style>${PRINT_STYLES}</style></head><body>
      <div class="clinic-header">
        <p class="clinic-name">${esc(clinicName)}</p>
        ${clinicAddress ? `<p class="clinic-address">${esc(clinicAddress)}</p>` : ''}
        ${clinicPhone ? `<p class="clinic-address">${esc(clinicPhone)}</p>` : ''}
        ${clinicBAI ? `<p class="clinic-address">BAI Reg. No. ${esc(clinicBAI)}</p>` : ''}
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
        ${vetPRC ? `<div><span class="label">PRC License:</span> <span class="value">${vetPRC}</span></div>` : ''}
        ${vetPTR ? `<div><span class="label">PTR:</span> <span class="value">${vetPTR}</span></div>` : ''}
      </div>
      <h2>Services</h2>
      <p>${services}</p>
      ${row.caseDay > 1 ? `<h2>Case Info</h2><p>Day ${esc(String(row.caseDay))} of ongoing case</p>` : ''}
      ${pulse ? `<h2>Clinical Pulse (Audit Trail)</h2>
      <table><tr><th>Event</th><th>Time</th><th>Staff</th><th>Note</th></tr>${pulse}</table>` : ''}
      <div class="footer">
        <p>Generated ${new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })} — VetConnect Visit Log</p>
      </div>
    </body></html>`;

    openPrintWindow(html, () => setToast({ open: true, message: 'Pop-up blocked — allow pop-ups for this site', severity: 'warning' }));
  };

  const handleActionMenuOpen = (e, row) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    setActionRow(row);
  };
  const handleActionMenuClose = () => { setMenuAnchor(null); };

  const handleActionStatusChange = async (row, newStatus) => {
    try {
      await changeStatus(row, newStatus, settings);
      setToast({ open: true, message: `Status changed to ${newStatus}`, severity: 'success' });
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };

  const handleActionOpenAssign = (row) => {
    setActionRow(row);
    setOpenAssign(true);
  };

  const handleActionOpenConsult = (row) => {
    const allowed = ['in-consult', 'confined', 'on-hold'];
    if (!allowed.includes(row?.status)) {
      setToast({ open: true, message: `Cannot open workspace for status "${row?.status}"`, severity: 'warning' });
      return;
    }
    setActionRow(row);
    setOpenCW(true);
  };

  const handleActionOpenPOS = (row) => {
    setActionRow(row);
    setOpenPOS(true);
  };

  const handleActionOpenDispenseVerify = (row) => {
    setDispenseRow(row);
    setOpenDispenseVerify(true);
  };

  const handleActionFlagDispensing = async (row) => {
    try {
      await updateDoc(doc(db, 'appointments', row.id), {
        dispensingHold: true,
        clinicalPulse: arrayUnion({
          eventId: makePulseEventId('dispense-flag'),
          type: 'DISPENSING_HOLD',
          timestamp: Timestamp.now(),
          staffId: user?.uid || '',
          staffName: profile?.fullName || user?.email || 'System',
          note: 'Flagged for vet review from Visit Log',
        }),
      });
      setToast({ open: true, message: 'Flagged for vet review', severity: 'warning' });
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };

  const handleActionDispenseVerified = async (dispensingData) => {
    try {
      await runTransaction(db, async (transaction) => {
        const apptRef = doc(db, 'appointments', dispenseRow.id);
        const apptDoc = await transaction.get(apptRef);
        if (!apptDoc.exists()) throw new Error('Appointment not found.');
        if (apptDoc.data().dispensingHold) throw new Error('Dispensing was placed on hold. Refresh and try again.');
        const freshData = apptDoc.data();
        transaction.update(apptRef, {
          ...dispensingData,
          status: 'billing',
          timePaymentStarted: Timestamp.now(),
          statusHistory: [...(freshData.statusHistory || []), dispenseRow.status || 'dispensing'],
          clinicalPulse: arrayUnion({
            eventId: makePulseEventId('status'),
            type: 'STATUS_CHANGE',
            from: 'dispensing',
            to: 'billing',
            timestamp: Timestamp.now(),
            staffId: user?.uid || '',
            staffName: profile?.fullName || user?.email || 'System',
            note: 'Dispensing verified — advanced to billing (from Visit Log)',
          }),
        });
      });
      setOpenDispenseVerify(false);
      setDispenseRow(null);
      setToast({ open: true, message: 'Dispensing verified — moved to billing', severity: 'success' });
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };

  const handleActionRevertOpen = (row) => {
    setActionRow(row);
    setRevertReason('');
    setOpenRevert(true);
    handleActionMenuClose();
  };

  const handleActionRevertConfirm = async () => {
    if (!revertReason.trim() || submittingAction) return;
    setSubmittingAction(true);
    try {
      await revertStatus({ ...actionRow, revertReason });
      setOpenRevert(false);
      setToast({ open: true, message: 'Status reverted', severity: 'info' });
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleActionNoShowOpen = (row) => {
    setActionRow(row);
    setNoShowDialog({ open: true, reason: '' });
    handleActionMenuClose();
  };

  const handleActionNoShowConfirm = async () => {
    if (!noShowDialog.reason.trim() || submittingAction) return;
    setSubmittingAction(true);
    try {
      await markNoShow(actionRow, noShowDialog.reason, settings);
      setNoShowDialog({ open: false, reason: '' });
      setToast({ open: true, message: 'Marked as no-show', severity: 'info' });
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleActionDeferOpen = (row) => {
    setActionRow(row);
    setDeferDialog({ open: true, reason: '' });
    handleActionMenuClose();
  };

  const handleActionDeferConfirm = async () => {
    if (!deferDialog.reason.trim() || submittingAction) return;
    setSubmittingAction(true);
    try {
      await deferAppointment(actionRow.id, deferDialog.reason, profile?.fullName || user?.email || 'Staff', settings);
      setDeferDialog({ open: false, reason: '' });
      setToast({ open: true, message: 'Appointment deferred', severity: 'info' });
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setSubmittingAction(false);
    }
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
        if (p.row._isDateHeader) return null;
        if (p.row._isCaseHeader && p.row._caseLabel) {
          return (
            <Typography sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.6rem', color: COLORS.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              CASE: {p.row._caseGroupSize} DAYS
            </Typography>
          );
        }
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
      field: 'jsCreatedAt', headerName: 'Created', width: 160,
      renderCell: (p) => {
        if (p.row._isDateHeader) {
          return (
            <Typography sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.75rem', color: COLORS.accent, letterSpacing: 1 }}>
              {p.row._dateLabel}
            </Typography>
          );
        }
        if (p.row._isCaseHeader && p.row._caseLabel) {
          return (
            <Tooltip title={p.row._caseLabel} placement="top-start">
              <Typography sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.8rem', color: COLORS.brand, overflow: 'visible', whiteSpace: 'nowrap', position: 'relative', zIndex: 1 }}>
                {p.row._caseLabel}
              </Typography>
            </Tooltip>
          );
        }
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
              <Typography variant="body2" sx={{ fontWeight: '1000', color: '#3E2723', lineHeight: 1.2 }}>
                  {p.value ? p.value.toLocaleDateString() : 'N/A'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'textSecondary', fontWeight: '900', fontSize: '0.65rem' }}>
                  LOGGED: {p.value ? p.value.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}
              </Typography>
          </Box>
        );
      }
    },
    {
      field: 'identity', headerName: 'Patient', flex: 0.8, minWidth: 150,
      renderCell: (p) => {
        if (p.row._isDateHeader) return null;
        if (p.row._isCaseHeader) return null;
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
            <Typography sx={{ fontWeight: '1000', color: '#1A1A1A', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.row.petName?.toUpperCase()}{p.row.ownerName ? ` (${p.row.ownerName})` : ''}
            </Typography>
            <Typography variant="caption" sx={{ color: '#795548', fontWeight: '900', fontSize: '0.65rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[p.row.petSpecies, p.row.petBreed, p.row.petGender].filter(Boolean).join(' • ')}
            </Typography>
          </Box>
        );
      }
    },
    {
      field: 'jsScheduled', headerName: 'Scheduled', width: 150,
      renderCell: (p) => {
        if (p.row._isDateHeader) return null;
        if (p.row._isCaseHeader) return null;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', gap: 1 }}>
              <CalendarMonthIcon sx={{ fontSize: 16, color: COLORS.accentLight }} />
              <Typography variant="body2" sx={{ fontWeight: '900', color: '#5D4037' }}>
                  {p.value ? p.value.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'ASAP'}
              </Typography>
          </Box>
        );
      }
    },
    {
      field: 'services', headerName: 'Services', flex: 0.7, minWidth: 140,
      renderCell: (p) => {
        if (p.row._isDateHeader) return null;
        if (p.row._isCaseHeader) return null;
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
         if (p.row._isDateHeader) return null;
         if (p.row._isCaseHeader) return null;
         const s = String(p.value).toUpperCase();
         const isTerminal = TERMINAL_STATUSES.has(s.toLowerCase());

         const color = STATUS_COLORS[s.toLowerCase()] || '#757575';

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
      field: 'actions', headerName: 'Actions', width: 280, align: 'center', headerAlign: 'center',
      renderCell: (p) => {
        if (p.row._isDateHeader) return null;
        if (p.row._isCaseHeader) return null;

        const row = p.row;
        const status = (row.status || '').toLowerCase();
        const btnStyle = {
          textTransform: 'uppercase', fontWeight: '1000', fontSize: '0.65rem',
          height: 28, borderRadius: 0, letterSpacing: 0.5, px: 1.5,
        };

        let primaryButton = null;

        if (status === 'pending') {
          primaryButton = (
            <>
              <Button variant="contained" size="small"
                startIcon={<CheckCircleIcon sx={{ fontSize: '12px !important' }} />}
                sx={{ ...btnStyle, flex: 1, bgcolor: '#2E7D32' }}
                onClick={(e) => { e.stopPropagation(); handleActionStatusChange(row, 'confirmed'); }}
              >Accept</Button>
              <Button variant="outlined" size="small"
                sx={{ ...btnStyle, minWidth: 'auto', px: 1, color: COLORS.accent, borderColor: '#D7CCC8' }}
                onClick={(e) => { e.stopPropagation(); handleActionDeferOpen(row); }}
              >Defer</Button>
            </>
          );
        } else if (status === 'confirmed') {
          primaryButton = (
            <Button variant="contained" size="small"
              startIcon={<HowToRegIcon sx={{ fontSize: '12px !important' }} />}
              sx={{ ...btnStyle, flex: 1, bgcolor: row.caseDay > 1 ? '#E65100' : '#1976D2' }}
              onClick={(e) => { e.stopPropagation(); handleActionOpenAssign(row); }}
            >{row.caseDay > 1 ? 'RE-ARRIVE' : 'Check In'}</Button>
          );
        } else if (status === 'arrived') {
          primaryButton = (
            <Button variant="contained" size="small"
              sx={{ ...btnStyle, flex: 1, bgcolor: row.caseDay > 1 ? '#E65100' : COLORS.accent }}
              onClick={(e) => { e.stopPropagation(); handleActionStatusChange(row, 'in-consult'); }}
            >{row.caseDay > 1 ? 'RESUME' : 'START CONSULT'}</Button>
          );
        } else if (['in-consult', 'confined', 'on-hold'].includes(status)) {
          primaryButton = (
            <Button variant="contained" size="small"
              startIcon={<AutoFixHighIcon sx={{ fontSize: '12px !important' }} />}
              sx={{ ...btnStyle, flex: 1, bgcolor: row.caseDay > 1 ? '#E65100' : '#006064' }}
              onClick={(e) => { e.stopPropagation(); handleActionOpenConsult(row); }}
            >{row.caseDay > 1 ? 'RESUME' : 'WORKSPACE'}</Button>
          );
        } else if (status === 'dispensing') {
          const isHeld = !!row.dispensingHold;
          primaryButton = isHeld ? (
            <Chip label="ON HOLD" size="small"
              sx={{ bgcolor: '#FF9800', color: 'white', fontWeight: 900, fontSize: '0.6rem', height: 20, borderRadius: 0 }}
            />
          ) : (
            <>
              <Button variant="contained" size="small"
                startIcon={<LocalHospitalIcon sx={{ fontSize: '12px !important' }} />}
                sx={{ ...btnStyle, flex: 1, bgcolor: '#C62828' }}
                onClick={(e) => { e.stopPropagation(); handleActionOpenDispenseVerify(row); }}
              >VERIFY</Button>
              <Tooltip title="Flag for vet review">
                <IconButton size="small"
                  onClick={(e) => { e.stopPropagation(); handleActionFlagDispensing(row); }}
                  sx={{ color: '#FF9800', flexShrink: 0 }}
                >
                  <FlagIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          );
        } else if (status === 'billing') {
          primaryButton = (
            <Button variant="contained" size="small"
              startIcon={<PaidIcon sx={{ fontSize: '12px !important' }} />}
              sx={{ ...btnStyle, flex: 1, bgcolor: '#FF8F00' }}
              onClick={(e) => { e.stopPropagation(); handleActionOpenPOS(row); }}
            >CHECKOUT</Button>
          );
        } else if (TERMINAL_STATUSES.has(status)) {
          primaryButton = row.statusHistory?.length > 0 ? (
            <Button variant="outlined" size="small"
              startIcon={<UndoIcon sx={{ fontSize: '12px !important' }} />}
              sx={{ ...btnStyle, flex: 1, color: '#D32F2F', borderColor: '#D32F2F' }}
              onClick={(e) => { e.stopPropagation(); handleActionRevertOpen(row); }}
            >Revert</Button>
          ) : null;
        }

        return (
          <Stack direction="row" spacing={0.5} sx={{ height: '100%', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            {primaryButton}
            {!TERMINAL_STATUSES.has(status) && (
              <IconButton size="small"
                onClick={(e) => handleActionMenuOpen(e, row)}
                sx={{ border: '1px solid rgba(0,0,0,0.1)', color: COLORS.accent, flexShrink: 0 }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            )}
            <Tooltip title="Visit Audit">
              <IconButton size="small"
                onClick={(e) => { e.stopPropagation(); handleOpenAudit(e, row); }}
                sx={{ border: '1px solid #D7CCC8', color: COLORS.accent }}
              >
                <TimelineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="View in Patient CRM">
              <IconButton size="small"
                onClick={(e) => { e.stopPropagation(); navigate(`/patients/${row.petId}`, { state: { from: 'records' } }); }}
                sx={{ border: '1px solid #D7CCC8', color: COLORS.accent }}
              >
                <PersonIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Print Visit Summary">
              <IconButton size="small"
                onClick={async (e) => { e.stopPropagation(); await handlePrintVisit(row); }}
                sx={{ border: '1px solid #D7CCC8', color: COLORS.accent }}
              >
                <PrintIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        );
      }
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
          p: 2.5, px: 4, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center',
          bgcolor: '#FFF8E1', borderBottom: '2px solid #5D4037', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: 0
        }}>
          <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: 1000, color: COLORS.brand, textTransform: 'uppercase', letterSpacing: 1, flexShrink: 0, mr: 1, fontSize: '1.5rem', lineHeight: 1 }}>
            VISIT LOG
          </Typography>

          <TextField
            variant="outlined" size="small"
            placeholder="Search pet name..."
            value={searchText} onChange={(e) => setSearchText(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: COLORS.textMuted }} /></InputAdornment>,
              endAdornment: searchText ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchText('')}>
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </InputAdornment>
              ) : null,
              style: { color: COLORS.textPrimary, fontWeight: '1000', fontSize: '0.85rem', fontFamily: 'Inter' }
            }}
            sx={{
              flex: 1, maxWidth: 350, minWidth: 180,
              '& .MuiOutlinedInput-root': {
                borderRadius: 0, bgcolor: COLORS.formBg,
                '& fieldset': { borderColor: COLORS.border },
                '&:hover fieldset': { borderColor: COLORS.accent },
                '&.Mui-focused fieldset': { borderColor: COLORS.accent },
              },
            }}
          />

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

              <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '1.2rem', lineHeight: 1 }}>{groupedRecords.length}</Typography>
                  <Typography variant="caption" sx={{ fontWeight: '1000', opacity: 0.6, fontSize: '0.62rem', display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {facets.petSpecies || ''} {activeSilo} VISITS
                    {facets.serviceCategory ? ` • ${facets.serviceCategory}` : ''}
                    {facets.assignedVetId ? ` • ${vets.find(v => v.id === facets.assignedVetId)?.fullName || 'VET'}` : ''}
                  </Typography>
              </Box>
              <InfoIcon sx={{ color: '#5D4037', opacity: 0.2 }} />
          </Stack>
        </Paper>

        {/* Row 2: Facet filters */}
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', px: 4, pb: 1.5, pt: 1.5, bgcolor: '#FFF8E1', borderBottom: '1px solid #5D403733' }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <Select
              value={facets.assignedVetId}
              onChange={(e) => setFacets(prev => ({ ...prev, assignedVetId: e.target.value }))}
              displayEmpty
              sx={{ fontWeight: 800, fontSize: '0.75rem', color: COLORS.accent, bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-notchedOutline': { borderColor: `${COLORS.accent}33`, borderRadius: 0 }, borderRadius: 0 }}
            >
              <MenuItem value="">All Vets</MenuItem>
              {vets.map(v => (
                <MenuItem key={v.id} value={v.id}>{v.fullName || v.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <Select
              value={facets.serviceCategory}
              onChange={(e) => setFacets(prev => ({ ...prev, serviceCategory: e.target.value }))}
              displayEmpty
              sx={{ fontWeight: 800, fontSize: '0.75rem', color: COLORS.accent, bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-notchedOutline': { borderColor: `${COLORS.accent}33`, borderRadius: 0 }, borderRadius: 0 }}
            >
              <MenuItem value="">All Departments</MenuItem>
              {departments.map((d) => (
                <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 130 }}>
            <Select
              value={facets.petSpecies}
              onChange={(e) => setFacets(prev => ({ ...prev, petSpecies: e.target.value }))}
              displayEmpty
              sx={{ fontWeight: 800, fontSize: '0.75rem', color: COLORS.accent, bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-notchedOutline': { borderColor: `${COLORS.accent}33`, borderRadius: 0 }, borderRadius: 0 }}
            >
              <MenuItem value="">All Species</MenuItem>
              <MenuItem value="Canine">Canine</MenuItem>
              <MenuItem value="Feline">Feline</MenuItem>
              <MenuItem value="Bird">Bird</MenuItem>
              <MenuItem value="Exotic">Exotic</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={facets.origin}
              onChange={(e) => setFacets(prev => ({ ...prev, origin: e.target.value }))}
              displayEmpty
              sx={{ fontWeight: 800, fontSize: '0.75rem', color: COLORS.accent, bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-notchedOutline': { borderColor: `${COLORS.accent}33`, borderRadius: 0 }, borderRadius: 0 }}
            >
              <MenuItem value="">All Origins</MenuItem>
              <MenuItem value="ONLINE">Online Bookings</MenuItem>
              <MenuItem value="WALK_IN">Walk-in / ER</MenuItem>
            </Select>
          </FormControl>

          {/* Date range filter */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: '1000', fontSize: '0.65rem', color: '#A1887F' }}>FILTER TIMELINE:</Typography>
            <TextField
              type="date" size="small"
              value={dateRange.start || ''}
              onChange={(e) => setDateRange(p => ({ ...p, start: e.target.value }))}
              sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733', borderRadius: 0 }, '& .MuiOutlinedInput-root': { borderRadius: 0 }, width: 130 }}
            />
            <Typography sx={{ fontWeight: '1000', color: '#5D4037' }}>→</Typography>
            <TextField
              type="date" size="small"
              value={dateRange.end || ''}
              onChange={(e) => setDateRange(p => ({ ...p, end: e.target.value }))}
              sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733', borderRadius: 0 }, '& .MuiOutlinedInput-root': { borderRadius: 0 }, width: 130 }}
            />
            <Stack direction="row" spacing={0.5}>
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

          {Object.values(facets).some(v => v !== '') && (
            <Chip
              label="Clear Filters"
              size="small"
              onDelete={() => setFacets({ assignedVetId: '', serviceCategory: '', petSpecies: '', origin: '' })}
              deleteIcon={<CloseIcon sx={{ fontSize: '12px !important' }} />}
              onClick={() => setFacets({ assignedVetId: '', serviceCategory: '', petSpecies: '', origin: '' })}
              sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, border: `1px solid ${COLORS.danger}`, color: COLORS.danger, bgcolor: 'white' }}
            />
          )}

          <Box sx={{ flexGrow: 1 }} />

          {/* Saved presets dropdown */}
          {presets.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <Select
                value=""
                onChange={(e) => {
                  const preset = presets.find(p => p.id === e.target.value);
                  if (!preset) return;
                  const fs = preset.filterState;
                  if (fs.activeSilo !== undefined) {
                    const idx = SILO_MAP.indexOf(fs.activeSilo);
                    setActiveTab(idx >= 0 ? idx : 0);
                  }
                  if (fs.facets) setFacets(fs.facets);
                  if (fs.dateRange) setDateRange(fs.dateRange);
                  if (fs.searchText) setSearchText(fs.searchText);
                }}
                displayEmpty
                sx={{ fontWeight: 800, fontSize: '0.75rem', color: COLORS.accent, bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-notchedOutline': { borderColor: `${COLORS.accent}33`, borderRadius: 0 }, borderRadius: 0 }}
              >
                <MenuItem value="" disabled>Saved Presets</MenuItem>
                {presets.map(p => (
                  <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Save current filters inline */}
          {showSavePreset ? (
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <TextField
                size="small" placeholder="Preset name..."
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                sx={{ width: 130, '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.7rem' } }}
              />
              <Button
                size="small" variant="contained"
                disabled={!presetName.trim()}
                onClick={async () => {
                  await savePreset(presetName.trim(), {
                    activeSilo: SILO_MAP[activeTab],
                    facets,
                    dateRange,
                    searchText,
                  });
                  setPresetName('');
                  setShowSavePreset(false);
                }}
                sx={{ bgcolor: COLORS.accent, borderRadius: 0, fontWeight: 1000, fontSize: '0.6rem', minWidth: 0, px: 1.5 }}
              >
                Save
              </Button>
              <IconButton size="small" onClick={() => setShowSavePreset(false)}>
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          ) : (
            <Button
              size="small" variant="outlined"
              onClick={() => setShowSavePreset(true)}
              sx={{ borderRadius: 0, fontWeight: 1000, fontSize: '0.6rem', borderColor: COLORS.accent, color: COLORS.accent, textTransform: 'none' }}
            >
              + Save Filters
            </Button>
          )}
        </Box>

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
              <Tab label="PENDING" />
              <Tab label="ACTIVE" />
              <Tab label="COMPLETED" />
           </Tabs>
        </Box>

        {/* 1.2 PER-TAB KPI STRIP */}
        <Box sx={{ px: 4, py: 0.75, bgcolor: COLORS.formBg, borderBottom: `1px solid ${COLORS.borderLight}`, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          {activeTab === 0 && (
            <>
              <Chip label={`${tabStatusCounts['pending'] || 0} pending`} size="small" sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiOrangeBg, border: `1px solid ${COLORS.kpiOrangeBorder}`, color: COLORS.warning }} />
              <Chip label={`${tabStatusCounts['confirmed'] || 0} confirmed`} size="small" sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiGreenBg, border: `1px solid ${COLORS.kpiGreenBorder}`, color: COLORS.success }} />
            </>
          )}
          {activeTab === 1 && (
            <>
              <Chip label={`${tabStatusCounts['arrived'] || 0} arrived`} size="small" sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiBlueBg, border: `1px solid ${COLORS.kpiBlueBorder}`, color: COLORS.medical }} />
              <Chip label={`${tabStatusCounts['in-consult'] || 0} in-consult`} size="small" sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiBlueBg, border: `1px solid ${COLORS.kpiBlueBorder}`, color: COLORS.medical }} />
              <Chip label={`${tabStatusCounts['dispensing'] || 0} dispensing`} size="small" sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiPurpleBg, border: `1px solid ${COLORS.kpiPurpleBorder}`, color: COLORS.kpiPurpleText }} />
              <Chip label={`${tabStatusCounts['billing'] || 0} billing`} size="small" sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiOrangeBg, border: `1px solid ${COLORS.kpiOrangeBorder}`, color: COLORS.warning }} />
              <Chip label={`${tabStatusCounts['confined'] || 0} confined`} size="small" sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiRedBg, border: `1px solid ${COLORS.kpiRedBorder}`, color: COLORS.danger }} />
              <Chip label={`${tabStatusCounts['on-hold'] || 0} on-hold`} size="small" sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: '#FFF8E1', border: `1px solid ${COLORS.accentLight}`, color: COLORS.accent }} />
            </>
          )}
          {activeTab === 2 && (
            <>
              <Chip label={`${tabStatusCounts['completed'] || 0} completed`} size="small" sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiGreenBg, border: `1px solid ${COLORS.kpiGreenBorder}`, color: COLORS.success }} />
              <Chip label={`${tabStatusCounts['carried-over'] || 0} carried-over`} size="small" sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiOrangeBg, border: `1px solid ${COLORS.kpiOrangeBorder}`, color: COLORS.warning }} />
              <Chip label={`${tabStatusCounts['cancelled'] || 0} cancelled`} size="small" sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiRedBg, border: `1px solid ${COLORS.kpiRedBorder}`, color: COLORS.danger }} />
              <Chip label={`${tabStatusCounts['no-show'] || 0} no-show`} size="small" sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiRedBg, border: `1px solid ${COLORS.kpiRedBorder}`, color: COLORS.danger }} />
            </>
          )}
        </Box>
      </Box>

      {/* 2. THE MASTER LEDGER GRID */}
      <Box sx={{ flexGrow: 1, minHeight: 0, width: '100%', overflow: 'hidden', bgcolor: 'white' }}>
        <DataGrid
          loading={loading} rows={displayRecords}
          columns={columns.map(c => ({
            ...c,
            headerClassName: 'forensic-header',
            headerName: (c.headerName || '').toUpperCase()
          }))}
          disableRowSelectionOnClick={activeTab !== 0}
          rowHeight={70}
          getRowHeight={(params) => params.row?._isDateHeader ? 32 : undefined}
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
          checkboxSelection={activeTab === 0}
          onRowSelectionModelChange={(newModel) => {
            const ids = newModel?.ids ? [...newModel.ids] : (Array.isArray(newModel) ? newModel : []);
            setSelectedRows(ids.filter(id => !String(id).startsWith('date-header-')));
          }}
          isRowSelectable={(params) => !params.row?._isDateHeader && !params.row?._isCaseHeader && ['pending', 'confirmed'].includes(params.row?.status?.toLowerCase?.())}
          onRowClick={(params, event) => {
            if (activeTab === 0) return;
            if (params.row?._isDateHeader || params.row?._isCaseHeader) return;
            handleOpenAudit(event, params.row);
          }}
          getRowClassName={(params) => {
            if (params.row?._isDateHeader) return 'date-header-row';
            if (viewMode === 'case' && params.row?._isCaseHeader && params.row?._caseLabel) return 'case-header';
            if (viewMode === 'case' && !params.row?._isCaseHeader) return 'case-continuation';
            return '';
          }}
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
            '& .date-header-row': {
              bgcolor: '#FFF8E1 !important',
              borderTop: `2px solid ${COLORS.accentLight}`,
              pointerEvents: 'none',
              '& .MuiDataGrid-cell': { borderBottom: 'none' },
            },
            '& .case-header': {
              bgcolor: '#FFF8E1 !important',
              borderTop: `2px solid ${COLORS.accent}`,
              fontWeight: 1000,
              '& .MuiDataGrid-cell': { overflow: 'visible !important' },
            },
            ...(viewMode === 'case' ? {
              '& .case-continuation': {
                bgcolor: 'rgba(93, 64, 55, 0.02)',
                borderLeft: `3px solid ${COLORS.accentLight}`,
              }
            } : {}),
            ...(activeTab !== 0 ? {
              '& .MuiDataGrid-row': { cursor: 'pointer' },
            } : {}),
          }}
        />
      </Box>

      {/* --- 🧬 FORENSIC AUDIT POPOVER --- */}
      <Dialog
        open={Boolean(anchorEl)}
        onClose={handleCloseAudit}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: '2px solid #5D4037', p: 0, overflow: 'hidden', boxShadow: '10px 10px 0px rgba(93, 64, 55, 0.1)', maxHeight: '80vh' } }}
      >
        {activeAuditRow && (
          <Box>
            <Box sx={{ bgcolor: '#FFF8E1', p: 1.5, borderBottom: '1px solid #5D4037', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                <TimelineIcon fontSize="small" /> {activeAuditRow.petName || 'Unknown'} — {(() => { const svcNames = (activeAuditRow.services || []).map(s => s.name).filter(Boolean); if (svcNames.length === 0) return activeAuditRow.serviceType || 'Visit'; if (svcNames.length <= 2) return svcNames.join(', '); return `${svcNames.slice(0, 2).join(', ')} +${svcNames.length - 2} more`; })()}
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
                           {(() => {
                              const labels = {
                                'INCEPTION': 'Booked',
                                'STATUS_CHANGE': p.toStatus ? `${(p.fromStatus || '').replace(/-/g,' ')} → ${p.toStatus.replace(/-/g,' ')}` : 'Status updated',
                                'SERVICE_STARTED': `${p.serviceName || 'Service'} started`,
                                'SERVICE_COMPLETED': `${p.serviceName || 'Service'} completed`,
                                'IDENTITY_EDIT': 'Patient identity updated',
                                'IDENTITY_HEALING': 'Patient identity corrected',
                                'CLINICAL_AMENDMENT': 'Record amended',
                                'TRIAGE_DEFER': 'Deferred',
                                'TRIAGE_RESCHEDULE': 'Rescheduled',
                                'TRIAGE_CARRYOVER': 'Carried over',
                                'TRIAGE_NO_SHOW': 'Marked no-show',
                                'TRIAGE_CANCELLED': 'Cancelled',
                                'DISPENSING_HOLD': 'Dispensing flagged',
                                'NOTIFICATION': 'Notification sent',
                                'AUDIT_ADDENDUM': 'Audit note added',
                              };
                              return labels[p.type] || p.type?.replace(/_/g, ' ') || 'Event';
                           })()}
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
      </Dialog>

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

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleActionMenuClose}
        PaperProps={{
          sx: {
            border: `2px solid ${COLORS.accent}`,
            boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.15)',
            borderRadius: 0,
            '& .MuiMenuItem-root': { fontWeight: '1000', py: 1.5, fontSize: '0.85rem' },
          }
        }}
      >
        {['in-consult', 'arrived'].includes(actionRow?.status) && (
          <MenuItem onClick={() => { handleActionStatusChange(actionRow, 'on-hold'); handleActionMenuClose(); }}>
            <ListItemIcon><PauseCircleIcon fontSize="small" sx={{ color: '#FF9800' }} /></ListItemIcon>
            <ListItemText primary="Put On Hold" sx={{ color: '#FF9800' }} />
          </MenuItem>
        )}
        {actionRow?.status === 'on-hold' && (
          <MenuItem onClick={() => { handleActionStatusChange(actionRow, 'in-consult'); handleActionMenuClose(); }}>
            <ListItemIcon><PlayCircleFilledWhiteIcon fontSize="small" sx={{ color: '#2E7D32' }} /></ListItemIcon>
            <ListItemText primary="Resume Consult" sx={{ color: '#2E7D32' }} />
          </MenuItem>
        )}
        {(actionRow?.status === 'confirmed' || actionRow?.status === 'pending') && (
          <MenuItem onClick={() => handleActionNoShowOpen(actionRow)}>
            <ListItemIcon><PersonOffIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Flag as No-Show" />
          </MenuItem>
        )}
        {(actionRow?.status === 'pending' || actionRow?.status === 'confirmed') && (
          <MenuItem onClick={() => {
            setActiveAuditRow(actionRow);
            handleCancelAppt();
            handleActionMenuClose();
          }} sx={{ color: '#D32F2F' }}>
            <ListItemIcon><CancelIcon fontSize="small" sx={{ color: '#D32F2F' }} /></ListItemIcon>
            <ListItemText primary="Cancel Appointment" sx={{ color: '#D32F2F' }} />
          </MenuItem>
        )}
        {actionRow && !TERMINAL_STATUSES.has(actionRow.status) && (
          <MenuItem onClick={() => {
            setActiveAuditRow(actionRow);
            setRescheduleData({ newDate: '', reason: '' });
            setOpenReschedule(true);
            handleActionMenuClose();
          }}>
            <ListItemIcon><EventIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Reschedule" />
          </MenuItem>
        )}
        {actionRow?.statusHistory?.length > 0 && (
          <MenuItem onClick={() => handleActionRevertOpen(actionRow)}>
            <ListItemIcon>
              <UndoIcon fontSize="small" sx={{ color: TERMINAL_STATUSES.has(actionRow?.status) ? '#D32F2F' : '#E65100' }} />
            </ListItemIcon>
            <ListItemText
              primary={TERMINAL_STATUSES.has(actionRow?.status) ? 'Revert Terminal State' : 'Revert Status (Undo)'}
              sx={{ color: TERMINAL_STATUSES.has(actionRow?.status) ? '#D32F2F' : '#E65100' }}
            />
          </MenuItem>
        )}
        {actionRow && !['pending', 'confirmed'].includes(actionRow.status) && !TERMINAL_STATUSES.has(actionRow.status) && (
          <>
            <Divider />
            <MenuItem onClick={() => {
              setActiveAuditRow(actionRow);
              handleCancelAppt();
              handleActionMenuClose();
            }} sx={{ color: '#D32F2F' }}>
              <ListItemIcon><CancelIcon fontSize="small" sx={{ color: '#D32F2F' }} /></ListItemIcon>
              <ListItemText primary="Cancel / Void Record" />
            </MenuItem>
          </>
        )}
      </Menu>

      <Dialog
        open={openRevert}
        onClose={() => setOpenRevert(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: '4px solid #D32F2F' } }}
      >
        <DialogTitle sx={{ bgcolor: '#FFEBEE', color: '#D32F2F', fontWeight: '1000', borderBottom: '2px solid #D32F2F' }}>
          REVERT STATUS
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body2" sx={{ mb: 2, color: COLORS.accent }}>
            Reverting <strong>{actionRow?.petName || '—'}</strong> from <strong>{actionRow?.status?.toUpperCase()}</strong> to its previous state.
            This action is audited.
          </Typography>
          <TextField
            fullWidth multiline rows={3} autoFocus
            label="Reason for revert (required)"
            placeholder="e.g., Billing error — need to re-verify dispensing"
            value={revertReason}
            onChange={(e) => setRevertReason(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, fontWeight: 900, fontSize: '0.85rem' } }}
          />
          {!revertReason.trim() && (
            <Typography variant="caption" sx={{ color: '#D32F2F', fontWeight: '1000', fontSize: '0.6rem', mt: 0.5, display: 'block' }}>
              A forensic audit reason is mandatory for status reversals.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#FFEBEE', borderTop: '2px solid #D32F2F' }}>
          <Button onClick={() => { setOpenRevert(false); setRevertReason(''); }} sx={{ fontWeight: '1000', color: '#757575' }}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!revertReason.trim() || submittingAction}
            onClick={handleActionRevertConfirm}
            sx={{ bgcolor: '#D32F2F', fontWeight: '1000', borderRadius: 0 }}
          >
            {submittingAction ? 'Reverting...' : 'Confirm Revert'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={noShowDialog.open}
        onClose={() => setNoShowDialog({ open: false, reason: '' })}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `4px solid ${COLORS.danger}` } }}
      >
        <DialogTitle sx={{ bgcolor: COLORS.dangerSurface, color: COLORS.danger, fontWeight: '1000', borderBottom: `2px solid ${COLORS.danger}` }}>
          MARK AS NO-SHOW
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 600 }}>
            Flag <strong>{actionRow?.petName || '—'}</strong> as a no-show. A mandatory reason is required for audit compliance.
          </Typography>
          <TextField
            fullWidth multiline rows={3} autoFocus
            label="Reason (required)"
            value={noShowDialog.reason}
            onChange={(e) => setNoShowDialog(prev => ({ ...prev, reason: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: COLORS.dangerSurface, borderTop: `2px solid ${COLORS.danger}` }}>
          <Button onClick={() => setNoShowDialog({ open: false, reason: '' })} sx={{ fontWeight: '1000', color: '#757575' }}>Cancel</Button>
          <Button variant="contained" disabled={!noShowDialog.reason.trim() || submittingAction} onClick={handleActionNoShowConfirm}
            sx={{ bgcolor: COLORS.danger, fontWeight: '1000', borderRadius: 0 }}>
            Confirm No-Show
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deferDialog.open}
        onClose={() => setDeferDialog({ open: false, reason: '' })}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `4px solid #E65100` } }}
      >
        <DialogTitle sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontWeight: '1000', borderBottom: '2px solid #E65100' }}>
          DEFER CLINICAL INTAKE
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 600 }}>
            Postponing intake decision for <strong>{actionRow?.petName || '—'}</strong>. A mandatory reason is required for audit compliance.
          </Typography>
          <TextField
            fullWidth multiline rows={3} autoFocus
            label="Reason (required)"
            value={deferDialog.reason}
            onChange={(e) => setDeferDialog(prev => ({ ...prev, reason: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#FFF3E0', borderTop: '2px solid #E65100' }}>
          <Button onClick={() => setDeferDialog({ open: false, reason: '' })} sx={{ fontWeight: '1000', color: '#757575' }}>Cancel</Button>
          <Button variant="contained" disabled={!deferDialog.reason.trim() || submittingAction} onClick={handleActionDeferConfirm}
            sx={{ bgcolor: '#E65100', fontWeight: '1000', borderRadius: 0 }}>
            Confirm Defer
          </Button>
        </DialogActions>
      </Dialog>

      <AssignStaffModal
        open={openAssign}
        onClose={() => { setOpenAssign(false); setActionRow(null); }}
        patient={actionRow}
      />

      {openCW && actionRow && (
        <ClinicalWorkspace
          open={openCW}
          onClose={() => { setOpenCW(false); setActionRow(null); }}
          patient={actionRow}
          inventoryList={joinedInventory}
          servicesList={servicesList}
          departments={departments}
          vetsList={vets}
        />
      )}

      <POSModal
        open={openPOS}
        onClose={() => { setOpenPOS(false); setActionRow(null); }}
        patient={actionRow}
        inventoryList={joinedInventory}
        servicesList={servicesList}
        isDayClosed={isDayClosed}
        closingData={closingData}
      />

      <DispensingVerificationDialog
        open={openDispenseVerify}
        onClose={() => { setOpenDispenseVerify(false); setDispenseRow(null); }}
        patient={dispenseRow}
        onVerified={handleActionDispenseVerified}
        staffProfile={profile}
        clinicSettings={settings}
        inventoryList={joinedInventory}
      />

    </Box>
  );
}
