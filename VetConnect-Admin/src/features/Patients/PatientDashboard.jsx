import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Chip, Paper,
  Stack, Button, CircularProgress, Divider,
  IconButton, Avatar, TextField, InputAdornment,
  FormControl, Select, MenuItem, Menu, Popover, Collapse, Tooltip,
  Snackbar, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import Grid from '@mui/material/Grid';

import { db } from '../../firebaseConfig';
import { doc, getDoc, collection, query, where, orderBy, getDocs, Timestamp, updateDoc, setDoc, onSnapshot, arrayUnion, arrayRemove } from 'firebase/firestore';
import { resolveVitals } from '../../utils/resolveVitals';
import { resolveObjectiveText, hasExamData, examSummaryLine } from '../../utils/examUtils';

// Icons
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FemaleIcon from '@mui/icons-material/Female';
import MaleIcon from '@mui/icons-material/Male';
import ScaleIcon from '@mui/icons-material/Scale';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import MedicationIcon from '@mui/icons-material/Medication';
import AssignmentIcon from '@mui/icons-material/Assignment';
import SearchIcon from '@mui/icons-material/Search';
import SortIcon from '@mui/icons-material/Sort';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import PetsIcon from '@mui/icons-material/Pets';
import VaccinesIcon from '@mui/icons-material/Vaccines';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import PrintIcon from '@mui/icons-material/Print';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import ShieldIcon from '@mui/icons-material/Shield';
import ScienceIcon from '@mui/icons-material/Science';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import BlockIcon from '@mui/icons-material/Block';
import UndoIcon from '@mui/icons-material/Undo';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import PushPinIcon from '@mui/icons-material/PushPin';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import FilterListIcon from '@mui/icons-material/FilterList';
import FilterListOffIcon from '@mui/icons-material/FilterListOff';
import TodayIcon from '@mui/icons-material/Today';
import BiotechIcon from '@mui/icons-material/Biotech';
import InventoryIcon from '@mui/icons-material/Inventory';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import Checkbox from '@mui/material/Checkbox';
import Badge from '@mui/material/Badge';

// Charting
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// ── Design Tokens (shared across all VetConnect pages) ─────────
import { FONT, TYPE, COLORS, getRecordColor, getInitialColor } from '../../theme/designTokens';

// ── Auth / User Context ──────────────────────────────────────────
import { useUser } from '../../context/UserContext';

// ── Clinic Settings ─────────────────────────────────────────────
import { useClinicSettings } from '../../hooks/useClinicSettings';

// ── Printable Document Generators ──────────────────────────────
import { openPrintWindow, calculatePetAge } from '../../utils/printUtils';
import { generateVisitSummaryHTML } from '../../utils/printVisitSummary';
import { generateVaccinationRecordHTML } from '../../utils/printVaccinationRecord';
import { generateInternalRecordHTML, generateCombinedPrintHTML } from '../../utils/printInternalRecord';

// ── Vaccine Catalog & Helpers ────────────────────────────────────
import { getVaccineAdministrations, resolveVaccineFromName } from '../../utils/vaccineConstants';
import { useVaccineCatalog } from '../../hooks/useVaccineCatalog';

// ── Problem List Hook ────────────────────────────────────────────
// T4.13: Real-time problem list for persistent condition tracking.
import { useProblemList } from '../../hooks/useProblemList';

// ── Modals ──────────────────────────────────────────────────────
import ReferralModal from './components/ReferralModal';
import WalkInModal from '../Queue/WalkInModal';
import AmendmentDialog from '../../components/AmendmentDialog';
import SendNotificationDialog from '../../components/SendNotificationDialog';
import PetHistoryAIDrawer from './components/PetHistoryAIDrawer';
import { resolveDepartmentForRecord } from '../../utils/resolveDepartmentForRecord';
import { computeSingleOwnerBalanceReminder } from '../../utils/computeBalanceReminderQueue';

// ── Species-normal vital reference ranges ────────────────────────
// Sourced from standard veterinary references.
// Each key maps to { canine: [low, high], feline: [low, high] }.
const SPECIES_VITAL_RANGES = {
  temp: { canine: [38.0, 39.2], feline: [38.1, 39.2] },
  hr:   { canine: [60, 140],    feline: [120, 240]    },
  rr:   { canine: [10, 30],     feline: [20, 42]      },
  crt:  { canine: [1.0, 2.0],   feline: [1.0, 2.0]    },
  bcs:  { canine: [4, 5],       feline: [4, 5]         },
};

// Internal utility for classification resolution
const resolveProductClass = (rx) => {
  return rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : rx.productClassOverride || 'retail');
};

const resolveRecordDate = (record) => {
  const raw = record.createdAt || record.date;
  if (!raw) return new Date(NaN);
  return raw?.toDate ? raw.toDate() : new Date(raw);
};

// T4.112: Chart configuration registry for 7 vitals — drives sidebar widgets + zoom dialog.
// stroke: null means the render site resolves the color from runtime design tokens.
// refLines: false = no reference lines; string = key into SPECIES_VITAL_RANGES.
const VITALS_CHART_CONFIG = {
  weight: { label: 'Weight Trend',         dataKey: 'weight', unit: 'kg',   stroke: null,      yDomain: ['dataMin - 1', 'dataMax + 1'], refLines: false },
  temp:   { label: 'Temperature',          dataKey: 'temp',   unit: '°C',   stroke: '#EF6C00', yDomain: [37, 41],                      refLines: 'temp' },
  hr:     { label: 'Heart Rate',           dataKey: 'hr',     unit: 'bpm',  stroke: '#E53935', yDomain: ['dataMin - 10', 'dataMax + 10'], refLines: 'hr' },
  rr:     { label: 'Resp. Rate',           dataKey: 'rr',     unit: 'bpm',  stroke: '#0288D1', yDomain: [10, 50],                      refLines: 'rr' },
  crt:    { label: 'Cap. Refill Time',     dataKey: 'crt',    unit: 's',    stroke: '#00838F', yDomain: [0, 5],                        refLines: 'crt' },
  bcs:    { label: 'Body Condition Score', dataKey: 'bcs',    unit: '/9',   stroke: null,      yDomain: [1, 9],  yTicks: [1, 3, 5, 7, 9], refLines: 'bcs' },
  pain:   { label: 'Pain Scale',           dataKey: 'pain',   unit: '/10',  stroke: '#D84315', yDomain: [0, 10], yTicks: [0, 2, 4, 6, 8, 10], refLines: false },
};

/**
 * T4.112: Render a delta annotation between the last two readings of a vitals array.
 * Returns JSX showing "↑/↓ ±X.X unit since last visit", or null if insufficient data.
 * Color is always neutral (textMuted) — clinical interpretation is context-dependent.
 * Weight keeps its own inline green/red delta and does NOT use this function.
 */
const renderVitalsDelta = (data, dataKey, unit) => {
  if (!data || data.length < 2) return null;
  const last = data[data.length - 1]?.[dataKey];
  const prev = data[data.length - 2]?.[dataKey];
  if (last == null || prev == null) return null;
  const delta = last - prev;
  if (delta === 0) return null;
  const arrow = delta > 0 ? '↑' : '↓';
  const sign = delta > 0 ? '+' : '';
  const decimals = Number.isInteger(last) && Number.isInteger(prev) ? 0 : 1;
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
      <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', fontWeight: 700, color: COLORS.textMuted }}>
        {arrow} {sign}{delta.toFixed(decimals)} {unit} since last visit
      </Typography>
    </Box>
  );
};

// ── Analytics Widget Shell ──
// T4.112: onExpand — optional callback; when provided, renders an OpenInFull icon button (right-aligned in header).
const Widget = ({ title, icon, children, onExpand }) => (
  <Box sx={{ bgcolor: COLORS.cardBg, borderRadius: 0, border: `1px solid ${COLORS.borderLight}`, mb: 2, overflow: 'hidden' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: `1px solid ${COLORS.borderLight}`, bgcolor: COLORS.surfaceAlt }}>
      {icon}
      <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textSecondary, letterSpacing: '0.05em', flex: 1 }}>{title}</Typography>
      {onExpand && (
        <IconButton size="small" onClick={onExpand} sx={{ p: 0.25, color: COLORS.textMuted, '&:hover': { color: COLORS.brand } }}>
          <OpenInFullIcon sx={{ fontSize: 13 }} />
        </IconButton>
      )}
    </Box>
    <Box sx={{ px: 2, py: 1.5 }}>
      {children}
    </Box>
  </Box>
);

export default function PatientDashboard() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const vaccineCatalog = useVaccineCatalog();
  const { profile } = useUser();

  const [pet, setPet] = useState(location.state?.pet || null);
  const [history, setHistory] = useState([]);
  const [vitalsData, setVitalsData] = useState([]);
  const [tempData, setTempData] = useState([]);
  const [hrData, setHrData] = useState([]);
  const [rrData, setRrData] = useState([]);
  const [crtData, setCrtData] = useState([]);
  const [bcsData, setBcsData] = useState([]);
  const [painData, setPainData] = useState([]);
  const [owner, setOwner] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [loading, setLoading] = useState(true);

  const [expandedRecords, setExpandedRecords] = useState(new Set([0]));
  const [expandedObjectives, setExpandedObjectives] = useState(new Set());
  const [expandedServiceChips, setExpandedServiceChips] = useState(new Set());
  const [timelineSearch, setTimelineSearch] = useState('');
  const [timelineSort, setTimelineSort] = useState('newest');

  // --- CLINICAL FILTER RIBBON STATE ---
  const [showFilterRibbon, setShowFilterRibbon] = useState(true);
  const [deptFilters, setDeptFilters] = useState(['all']);
  const [staffFilters, setStaffFilters] = useState(['all']);
  const [medFilters, setMedFilters] = useState(['all']);
  const [supplyFilters, setSupplyFilters] = useState(['all']);
  const [retailFilters, setRetailFilters] = useState(['all']);
  const [diagnosisFilters, setDiagnosisFilters] = useState(['all']);
  const [labFilters, setLabFilters] = useState(['all']);

  // Temporal Hub State
  const [dateRangeType, setDateRangeType] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Anchor Els for Ribbon Menus
  const [deptAnchor, setDeptAnchor] = useState(null);
  const [staffAnchor, setStaffAnchor] = useState(null);
  const [medAnchor, setMedAnchor] = useState(null);
  const [supplyAnchor, setSupplyAnchor] = useState(null);
  const [retailAnchor, setRetailAnchor] = useState(null);
  const [diagAnchor, setDiagAnchor] = useState(null);
  const [labAnchor, setLabAnchor] = useState(null);
  const [dateAnchor, setDateAnchor] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeRecordIndex, setActiveRecordIndex] = useState(0);
  const [collapsedYears, setCollapsedYears] = useState(new Set());
  const [referralOpen, setReferralOpen] = useState(false);
  const [printBlockedToast, setPrintBlockedToast] = useState(false);
  const [printMenuAnchor, setPrintMenuAnchor] = useState(null);
  const [actionMenuAnchor, setActionMenuAnchor] = useState(null);
  const [printMenuRecord, setPrintMenuRecord] = useState(null);
  // T2.101: Owner sales for computed outstanding balance
  const [ownerSales, setOwnerSales] = useState([]);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  // T2.457: Case-day linkage map — recordId -> { caseDay, totalDays }
  const [caseDayMap, setCaseDayMap] = useState({});
  const [recordPaymentTarget, setRecordPaymentTarget] = useState(null);
  const [recordPaymentAmount, setRecordPaymentAmount] = useState('');
  // T2.458: Quick-book (WalkIn) modal state
  const [quickBookOpen, setQuickBookOpen] = useState(false);
  const [servicesList, setServicesList] = useState([]);
  const [deptsList, setDeptsList] = useState([]);
  // T2.129: Generic error snackbar
  const [errorSnack, setErrorSnack] = useState('');
  // T4.147: Generic success snackbar (snooze confirmation, etc.)
  const [successSnack, setSuccessSnack] = useState('');
  // T4.147: Mark as Settled dialog target — the sale object to settle
  const [settleTarget, setSettleTarget] = useState(null);


  // T3.101: Vaccine exemption dialog
  const [exemptionDialogOpen, setExemptionDialogOpen] = useState(false);
  const [exemptionTarget, setExemptionTarget] = useState(null); // { vaccineId, vaccineName }
  const [exemptionReason, setExemptionReason] = useState('');
  const [exemptionSaving, setExemptionSaving] = useState(false);

  // T3.118: Amendment dialog — single instance shared across all sealed record cards
  const [amendDialogOpen, setAmendDialogOpen] = useState(false);
  const [amendTargetApptId, setAmendTargetApptId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // T4.13: Problem list — real-time active/resolved conditions for this pet.
  // id comes from useParams() above and is the Firestore pet document ID.
  const { activeProblems: petActiveProblems, resolvedProblems: petResolvedProblems } = useProblemList(id);
  const [showProblemHistory, setShowProblemHistory] = useState(false);

  // T4.92: Custom notification dialog
  const [notifDialogOpen, setNotifDialogOpen] = useState(false);

  // T4.112: Vitals zoom dialog — shared across all 7 vitals widgets
  const [vitalsZoom, setVitalsZoom] = useState({ open: false, key: null });

  // T4.116: Prescription sidebar — historical section toggle + pin Snackbar
  const [showHistoricalRx, setShowHistoricalRx] = useState(false);
  const [rxPinSnack, setRxPinSnack] = useState('');

  // T4.116: Prescription zoom dialog
  const [rxZoom, setRxZoom] = useState(false);
  const [rxZoomFilter, setRxZoomFilter] = useState('All');
  const [rxZoomSearch, setRxZoomSearch] = useState('');

  // T4.120: Lab results zoom dialog
  const [labZoom, setLabZoom] = useState(false);
  const [labZoomFilter, setLabZoomFilter] = useState('All');

  // T4.116: Other Pets widget — collapsed by default
  const [siblingExpanded, setSiblingExpanded] = useState(false);

  // T4.96: AI History Assistant
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [llmConfig, setLlmConfig] = useState({ enabled: false, workerUrl: '' });

  const clinicSettings = useClinicSettings();

  const buildStaffLookup = async (records) => {
    const lookup = new Map();
    const seen = new Set();
    for (const r of records) {
      const uid = r.vetId || r.signedBy?.uid;
      const name = r.vetName;
      const seenKey = uid || name;
      if (!name || seen.has(seenKey)) continue;
      seen.add(seenKey);
      try {
        if (uid) {
          const staffDoc = await getDoc(doc(db, 'users', uid));
          if (staffDoc.exists()) { lookup.set(name, staffDoc.data()); continue; }
        }
        const snap = await getDocs(query(collection(db, 'users'), where('fullName', '==', name)));
        if (!snap.empty) lookup.set(name, snap.docs[0].data());
      } catch { /* skip */ }
    }
    return lookup;
  };

  const handlePrint = async (mode) => {
    const rec = printMenuRecord;
    if (!rec) return;
    setPrintMenuAnchor(null);
    setPrintMenuRecord(null);

    let vetStaff = null;
    const vetUid = rec.vetId || rec.signedBy?.uid;
    try {
      if (vetUid) {
        const staffDoc = await getDoc(doc(db, 'users', vetUid));
        if (staffDoc.exists()) vetStaff = staffDoc.data();
      } else if (rec.vetName) {
        const snap = await getDocs(query(collection(db, 'users'), where('fullName', '==', rec.vetName)));
        if (!snap.empty) vetStaff = snap.docs[0].data();
      }
    } catch { /* graceful fallback */ }

    const commonParams = {
      record: rec,
      pet,
      owner,
      clinicName: clinicSettings.clinicName,
      clinicAddress: clinicSettings.clinicAddress,
      clinicPhone: clinicSettings.clinicPhone,
      clinicEmail: clinicSettings.clinicEmail,
      clinicTIN: clinicSettings.clinicTIN,
      clinicBAI: clinicSettings.baiRegistrationNumber,
      vetStaff,
    };

    if (mode === 'client') {
      openPrintWindow(generateVisitSummaryHTML(commonParams), () => setPrintBlockedToast(true));
    } else if (mode === 'internal') {
      openPrintWindow(generateInternalRecordHTML(commonParams), () => setPrintBlockedToast(true));
    } else {
      const clientHTML = generateVisitSummaryHTML(commonParams);
      const internalHTML = generateInternalRecordHTML(commonParams);
      openPrintWindow(generateCombinedPrintHTML(clientHTML, internalHTML), () => setPrintBlockedToast(true));
    }
  };

  // T2.458: Load services + departments for WalkInModal
  useEffect(() => {
    const unsubSvc = onSnapshot(collection(db, 'services'), (snap) => {
      setServicesList(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !s.isArchived));
    });
    const unsubDept = onSnapshot(collection(db, 'departments'), (snap) => {
      setDeptsList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubSvc(); unsubDept(); };
  }, []);

  // T4.96: LLM config fetch — one-shot, no listener needed
  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, 'clinic_settings', 'llm_config'))
      .then(snap => {
        if (!cancelled && snap.exists()) {
          const d = snap.data();
          setLlmConfig({ enabled: d.enabled ?? false, workerUrl: d.workerUrl ?? '' });
        }
      })
      .catch(e => console.warn('[PatientDashboard] LLM config fetch skipped:', e.message));
    return () => { cancelled = true; };
  }, []);

  const recordRefs = useRef({});
  const timelineScrollRef = useRef(null);

  // ── Data Fetch ──
  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true);
      try {
        let currentPet = pet;
        if (!currentPet) {
          const petSnap = await getDoc(doc(db, 'pets', id));
          if (petSnap.exists()) {
            currentPet = { id: petSnap.id, ...petSnap.data() };
            setPet(currentPet);
          } else { setLoading(false); return; }
        }

        // Fetch owner
        if (currentPet?.ownerId) {
          const ownerSnap = await getDoc(doc(db, 'users', currentPet.ownerId));
          if (ownerSnap.exists()) setOwner({ id: ownerSnap.id, ...ownerSnap.data() });
        }

        const q = query(collection(db, "medical_records"), where("petId", "==", id), orderBy("date", "desc"));
        const snapshot = await getDocs(q);

        // T2.457: Appointment cache — built during the per-record fetch to avoid N+1 passes.
        // Captures dispensedProducts (existing join) and caseDay/originApptId (new) in one pass.
        const apptCache = {}; // appointmentId -> { caseDay, originApptId }

        const historyData = await Promise.all(snapshot.docs.map(async (docSnap) => {
          const rec = { id: docSnap.id, ...docSnap.data() };
          // Fetch appointment doc when available — captures both legacy dispensedProducts and caseDay.
          if (rec.appointmentId) {
            try {
              const apptDoc = await getDoc(doc(db, "appointments", rec.appointmentId));
              if (apptDoc.exists()) {
                const apptData = apptDoc.data();
                // D5: legacy dispensed products join — dual-read from both old and new field names
                if (!rec.dispensedProducts && !rec.prescriptions) {
                  rec.serviceType = rec.serviceType || apptData.serviceType;
                  rec.dispensedProducts = apptData.encounterItems || apptData.prescribedItems || [];
                }
                // T2.457: capture case-day metadata
                apptCache[rec.appointmentId] = {
                  caseDay: apptData.caseDay || 1,
                  originApptId: apptData.originApptId || null,
                };
              }
            } catch (e) {
              console.warn(`[PatientDashboard] Appointment join failed for ${rec.appointmentId}:`, e);
            }
          }
          return rec;
        }));
        setHistory(historyData);

        // T2.457: Build case-day linkage map from the appointment cache populated above.
        // Only records that are part of a multi-day case (caseDay > 1) receive a badge.
        const cdMap = {};
        historyData.forEach(r => {
          if (!r.appointmentId || !apptCache[r.appointmentId]) return;
          const cached = apptCache[r.appointmentId];
          if (cached.caseDay < 1) return;

          // Walk the chain back to find the root appointment ID
          let rootId = r.appointmentId;
          let walked = apptCache[rootId];
          const seen = new Set();
          while (walked?.originApptId && apptCache[walked.originApptId] && !seen.has(rootId)) {
            seen.add(rootId);
            rootId = walked.originApptId;
            walked = apptCache[rootId];
          }

          // Total days = max caseDay among all cached appointments sharing this root
          const chainMembers = Object.entries(apptCache).filter(([aid]) => {
            let cur = aid;
            let curData = apptCache[cur];
            const visited = new Set();
            while (curData?.originApptId && apptCache[curData.originApptId] && !visited.has(cur)) {
              visited.add(cur);
              cur = curData.originApptId;
              curData = apptCache[cur];
            }
            return cur === rootId;
          });
          const totalDays = Math.max(...chainMembers.map(([, d]) => d.caseDay), cached.caseDay);
          cdMap[r.id] = { caseDay: cached.caseDay, totalDays };
        });
        setCaseDayMap(cdMap);

        // Process vitals — T4.112: ts (epoch ms) added for time-proportional X-axis
        const wt = [], tp = [], hr = [], rr = [], crt = [], bcs = [], pain = [];
        historyData.forEach(rec => {
          if (!rec.date) return;
          const ms = rec.date.seconds * 1000;
          const label = new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const v = resolveVitals(rec);
          if (v.weight) wt.push({ date: label, ts: ms, weight: parseFloat(v.weight) });
          if (v.temp) tp.push({ date: label, ts: ms, temp: parseFloat(v.temp) });
          if (v.hr) hr.push({ date: label, ts: ms, hr: parseInt(v.hr) });
          if (v.rr != null && v.rr !== '') rr.push({ date: label, ts: ms, rr: parseFloat(v.rr) });
          if (v.crt != null && v.crt !== '') crt.push({ date: label, ts: ms, crt: parseFloat(v.crt) });
          if (v.bcs != null && v.bcs !== '') bcs.push({ date: label, ts: ms, bcs: parseFloat(v.bcs) });
          if (v.pain != null && v.pain !== '') pain.push({ date: label, ts: ms, pain: parseFloat(v.pain) });
        });
        setVitalsData(wt.reverse());
        setTempData(tp.reverse());
        setHrData(hr.reverse());
        setRrData(rr.reverse());
        setCrtData(crt.reverse());
        setBcsData(bcs.reverse());
        setPainData(pain.reverse());

        // T2.101: Fetch owner's sales for computed outstanding balance
        if (currentPet?.ownerId && currentPet.ownerId !== 'WALK_IN_USER') {
          try {
            const salesQ = query(collection(db, 'sales'), where('ownerId', '==', currentPet.ownerId));
            const salesSnap = await getDocs(salesQ);
            setOwnerSales(salesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          } catch (e) { console.warn('[PatientDashboard] Sales fetch skipped:', e); }
        }

        // Fetch sibling pets (same owner)
        if (currentPet?.ownerId) {
          try {
            const sibQ = query(collection(db, 'pets'), where('ownerId', '==', currentPet.ownerId));
            const sibSnap = await getDocs(sibQ);
            setSiblings(sibSnap.docs.filter(d => d.id !== id).map(d => ({ id: d.id, ...d.data() })));
          } catch (e) { console.warn('Sibling fetch skipped:', e); }
        }

      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboardData();
  }, [id, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps


  const lastSeenLabel = useMemo(() => {
    if (!history?.length) return null;
    const s = history[0]?.date?.seconds;
    if (!s) return null;
    const d = Math.floor((Date.now() / 1000 - s) / 86400);
    return d === 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 30 ? `${d}d ago` : d < 365 ? `${Math.floor(d/30)}mo ago` : `${Math.floor(d/365)}y ago`;
  }, [history]);

  // --- DYNAMIC DISCOVERY ENGINE ---

  const availableDepts = useMemo(() => {
    const set = new Set();
    history.forEach(r => {
      const dept = resolveDepartmentForRecord(r, deptsList);
      if (dept) set.add(dept);
      if (r.vaccineAdministrations?.length > 0 || r.vaccineData) set.add('Vaccination');
    });
    return Array.from(set).sort();
  }, [history, deptsList]);

  const availableStaff = useMemo(() => {
    const set = new Set();
    history.forEach(r => {
      if (r.vetName) set.add(r.vetName);
      (r.serviceAttribution || []).forEach(a => { if (a.staffName) set.add(a.staffName); });
    });
    return Array.from(set).sort();
  }, [history]);

  const availableMeds = useMemo(() => {
    const set = new Set();
    history.forEach(r => {
      const allRx = [...(r.dispensedProducts || []), ...(r.prescriptions || [])];
      allRx.forEach(rx => {
        if (resolveProductClass(rx) === 'medicine') set.add(rx.name || rx.itemName);
      });
    });
    return Array.from(set).filter(Boolean).sort();
  }, [history]);

  const availableSupplies = useMemo(() => {
    const set = new Set();
    history.forEach(r => {
      const allRx = [...(r.dispensedProducts || []), ...(r.prescriptions || [])];
      allRx.forEach(rx => {
        if (resolveProductClass(rx) === 'medical_supply') set.add(rx.name || rx.itemName);
      });
    });
    return Array.from(set).filter(Boolean).sort();
  }, [history]);

  const availableRetail = useMemo(() => {
    const set = new Set();
    history.forEach(r => {
      const allRx = [...(r.dispensedProducts || []), ...(r.prescriptions || [])];
      allRx.forEach(rx => {
        const pc = resolveProductClass(rx);
        if (pc !== 'medicine' && pc !== 'medical_supply') set.add(rx.name || rx.itemName);
      });
    });
    return Array.from(set).filter(Boolean).sort();
  }, [history]);

  const availableDiagnoses = useMemo(() => {
    const set = new Set();
    history.forEach(r => {
      (r.diagnoses || []).forEach(d => set.add(d.name));
      if (r.diagnosis && r.diagnosis !== '—') set.add(r.diagnosis);
    });
    return Array.from(set).filter(Boolean).sort();
  }, [history]);

  const availableLabs = useMemo(() => {
    const set = new Set();
    history.forEach(r => {
      (r.labResults || []).forEach(l => { if (l.testName) set.add(l.testName); });
    });
    return Array.from(set).filter(Boolean).sort();
  }, [history]);

  const handleToggleRegistry = (setter, current, val) => {
    if (val === 'all') { setter(['all']); return; }
    let next = current.includes('all') ? [] : [...current];
    if (next.includes(val)) {
      next = next.filter(v => v !== val);
      if (next.length === 0) next = ['all'];
    } else {
      next.push(val);
    }
    setter(next);
  };

  const handleClearAllFilters = () => {
    setDeptFilters(['all']); setStaffFilters(['all']); setMedFilters(['all']);
    setSupplyFilters(['all']); setRetailFilters(['all']); setDiagnosisFilters(['all']);
    setLabFilters(['all']); setDateRangeType('all'); setTimelineSearch('');
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (!deptFilters.includes('all')) count += deptFilters.length;
    if (!staffFilters.includes('all')) count += staffFilters.length;
    if (!medFilters.includes('all')) count += medFilters.length;
    if (!supplyFilters.includes('all')) count += supplyFilters.length;
    if (!retailFilters.includes('all')) count += retailFilters.length;
    if (!diagnosisFilters.includes('all')) count += diagnosisFilters.length;
    if (!labFilters.includes('all')) count += labFilters.length;
    if (dateRangeType !== 'all') count += 1;
    return count;
  }, [deptFilters, staffFilters, medFilters, supplyFilters, retailFilters, diagnosisFilters, labFilters, dateRangeType]);


  const handleActionsClick = (event) => setActionMenuAnchor(event.currentTarget);
  const handleActionsClose = () => setActionMenuAnchor(null);

  const processedHistory = useMemo(() => {
    let result = [...history];

    // 1. Depts (Drawer Logic: Partial Matching)
    if (!deptFilters.includes('all')) {
      result = result.filter(r => {
        const hasVax = r.vaccineAdministrations?.length > 0 || !!r.vaccineData;
        const sType = (r.serviceType || r.primaryService || r.department || '').toLowerCase();
        return deptFilters.some(f => {
          if (f.toLowerCase() === 'vaccination') return hasVax;
          return sType.includes(f.toLowerCase());
        });
      });
    }

    // 2. Staff (Drawer Logic: Lead + Attributions + Partial)
    if (!staffFilters.includes('all')) {
      result = result.filter(r => {
        const vetName = (r.vetName || '').toLowerCase();
        const attributions = (r.serviceAttribution || []).map(a => (a.staffName || '').toLowerCase());
        return staffFilters.some(f => {
          const filterName = f.toLowerCase();
          return vetName.includes(filterName) || attributions.some(attr => attr.includes(filterName));
        });
      });
    }

    // 3. Diagnosis (Drawer Logic: DX Array + Assessment Field)
    if (!diagnosisFilters.includes('all')) {
      result = result.filter(r => {
        const recordDxs = [
          ...(r.diagnoses?.map(d => d.name.toUpperCase()) || []),
          (r.diagnosis || r.assessment || '').toUpperCase()
        ].filter(Boolean);
        return diagnosisFilters.some(f => {
          const filterName = f.toUpperCase();
          return recordDxs.some(dx => dx.includes(filterName));
        });
      });
    }

    // 4. Lab Tests
    if (!labFilters.includes('all')) {
      result = result.filter(r => {
        if (!r.labResults?.length) return false;
        const recordTests = r.labResults.map(l => (l.testName || '').toUpperCase());
        return labFilters.some(f => {
          const filterName = f.toUpperCase();
          return recordTests.some(t => t.includes(filterName));
        });
      });
    }

    // 5. Granular Item Classes (Drawer Logic: Partial ID/Name matching)
    if (!medFilters.includes('all')) {
      result = result.filter(r => {
        const allRx = [...(r.dispensedProducts || []), ...(r.prescriptions || [])];
        const recordMeds = allRx.filter(rx => resolveProductClass(rx) === 'medicine').map(rx => (rx.name || rx.itemName || '').toUpperCase());
        return medFilters.some(f => {
          const filterName = f.toUpperCase();
          return recordMeds.some(m => m.includes(filterName));
        });
      });
    }
    if (!supplyFilters.includes('all')) {
      result = result.filter(r => {
        const allRx = [...(r.dispensedProducts || []), ...(r.prescriptions || [])];
        const recordSupplies = allRx.filter(rx => resolveProductClass(rx) === 'medical_supply').map(rx => (rx.name || rx.itemName || '').toUpperCase());
        return supplyFilters.some(f => {
          const filterName = f.toUpperCase();
          return recordSupplies.some(s => s.includes(filterName));
        });
      });
    }
    if (!retailFilters.includes('all')) {
      result = result.filter(r => {
        const allRx = [...(r.dispensedProducts || []), ...(r.prescriptions || [])];
        const recordRetail = allRx.filter(rx => !['medicine', 'medical_supply'].includes(resolveProductClass(rx))).map(rx => (rx.name || rx.itemName || '').toUpperCase());
        return retailFilters.some(f => {
          const filterName = f.toUpperCase();
          return recordRetail.some(ret => ret.includes(filterName));
        });
      });
    }

    // 6. Temporal Hub
    if (dateRangeType !== 'all') {
      const now = new Date();
      let start = null; let end = null;
      if (dateRangeType === 'today') { start = new Date(now.setHours(0,0,0,0)); end = new Date(now.setHours(23,59,59,999)); }
      else if (dateRangeType === '30d') { start = new Date(now.setDate(now.getDate() - 30)); }
      else if (dateRangeType === '6mo') { start = new Date(now.setMonth(now.getMonth() - 6)); }
      else if (dateRangeType === '1yr') { start = new Date(now.setFullYear(now.getFullYear() - 1)); }
      else if (dateRangeType === 'custom' && customStart && customEnd) { start = new Date(customStart); end = new Date(customEnd); end.setHours(23,59,59,999); }

      if (start) {
        result = result.filter(r => {
          const d = resolveRecordDate(r);
          if (isNaN(d.getTime())) return false;
          return d >= start && (!end || d <= end);
        });
      }
    }

    if (timelineSearch) {
      const q = timelineSearch.toLowerCase();
      result = result.filter(r => 
        (r.subjective || '').toLowerCase().includes(q) ||
        (r.diagnosis || '').toLowerCase().includes(q) ||
        (r.assessment || '').toLowerCase().includes(q) ||
        (r.plan || '').toLowerCase().includes(q) ||
        (r.treatment || '').toLowerCase().includes(q) ||
        (r.serviceType || '').toLowerCase().includes(q) ||
        (r.vetName || '').toLowerCase().includes(q)
      );
    }

    if (timelineSort === 'oldest') return result.sort((a,b) => resolveRecordDate(a) - resolveRecordDate(b));
    return result.sort((a,b) => resolveRecordDate(b) - resolveRecordDate(a));
  }, [history, timelineSearch, timelineSort, deptFilters, staffFilters, diagnosisFilters, labFilters, medFilters, supplyFilters, retailFilters, dateRangeType, customStart, customEnd, deptsList]);

  // Visit frequency data (visits per month, last 6 months)
  const visitFreqData = useMemo(() => {
    const months = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString('en-US', { month: 'short' });
      months[key] = 0;
    }
    (history || []).forEach(r => {
      if (!r.date?.seconds) return;
      const d = new Date(r.date.seconds * 1000);
      const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (diff >= 0 && diff < 6) {
        const key = d.toLocaleDateString('en-US', { month: 'short' });
        if (months[key] !== undefined) months[key]++;
      }
    });
    return Object.entries(months).map(([month, visits]) => ({ month, visits }));
  }, [history]);

  // T4.116: Prescription frequency — active/historical split with pin toggle.
  // Active = last 90 days OR pinned. Historical = older, not pinned.
  // Tracks firstDate/firstShort for tenure range display (Item 2).
  const { activeRx, historicalRx } = useMemo(() => {
    const rxMap = new Map(); // name -> { name, count, lastDate, firstDate, firstShort, lastShort, lastRawMs, lastInstructions }
    const sortedHistory = [...(history || [])].sort((a, b) => {
      const aMs = a.date?.seconds ? a.date.seconds * 1000 : 0;
      const bMs = b.date?.seconds ? b.date.seconds * 1000 : 0;
      return aMs - bMs; // oldest first so lastDate = final write
    });
    sortedHistory.forEach(r => {
      (r.dispensedProducts || r.prescriptions || []).forEach(rx => {
        if (!rx.name) return;
        const pc = rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
        if (pc !== 'medicine') return;
        const ms = r.date?.seconds ? r.date.seconds * 1000 : 0;
        const dateStr = ms
          ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '';
        const shortDate = ms
          ? new Date(ms).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          : '';
        const existing = rxMap.get(rx.name);
        if (existing) {
          existing.count += 1;
          existing.lastDate = dateStr;
          existing.lastRawMs = ms;
          existing.lastShort = shortDate;
          // firstDate/firstShort stays as first occurrence
        } else {
          rxMap.set(rx.name, {
            name: rx.name,
            count: 1,
            lastDate: dateStr,
            firstDate: dateStr,
            firstShort: shortDate,
            lastShort: shortDate,
            lastRawMs: ms,
            lastInstructions: rx.instructions || '',
          });
        }
      });
    });

    const all = Array.from(rxMap.values()).sort((a, b) => b.count - a.count);
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const pinned = pet?.pinnedMedications || [];

    const active = [];
    const historical = [];
    all.forEach(rx => {
      const isRecent = (now - rx.lastRawMs) <= NINETY_DAYS_MS;
      const isPinned = pinned.includes(rx.name);
      if (isRecent || isPinned) {
        active.push({ ...rx, isPinned });
      } else {
        historical.push({ ...rx, isPinned: false });
      }
    });

    return { activeRx: active, historicalRx: historical };
  }, [history, pet?.pinnedMedications]);

  // T4.116: Full chronological Rx timeline for zoom modal — drug items only, newest first.
  const rxTimeline = useMemo(() => {
    const entries = [];
    (history || []).forEach(rec => {
      const ms = rec.date?.seconds ? rec.date.seconds * 1000 : 0;
      const dateStr = ms
        ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';
      (rec.dispensedProducts || rec.prescriptions || []).forEach(rx => {
        if (!rx.name) return;
        const pc = rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
        if (pc !== 'medicine') return;
        entries.push({
          name: rx.name,
          date: dateStr,
          ms,
          qty: rx.qty || null,
          instructions: rx.instructions || '',
          vet: rec.vetName || rec.attendingVet || '—',
        });
      });
    });
    return entries.sort((a, b) => b.ms - a.ms); // newest first
  }, [history]);

  const rxUniqueNames = useMemo(() => {
    const set = new Set(rxTimeline.map(e => e.name));
    return Array.from(set).sort();
  }, [rxTimeline]);

  // T2.101: Computed outstanding balance — sum of balanceRemaining across all non-refunded/voided sales.
  // This is authoritative; the legacy outstandingBalance counter on the user doc is no longer updated.
  const computedOutstandingBalance = useMemo(() => {
    return ownerSales
      .filter(s => s.status !== 'refunded' && s.status !== 'voided')
      .reduce((sum, s) => sum + (s.balanceRemaining || 0), 0);
  }, [ownerSales]);

  // T2.459: Aggregated lab results — latest per test with trend context.
  // Walks records oldest-to-newest; last write per testName = most recent value.
  // Retains previous result + date for trend display in the widget.
  const aggregatedLabResults = useMemo(() => {
    const testMap = new Map(); // testName -> { latest entry, previousResult, previousDate }
    (history || []).slice().reverse().forEach(r => {
      const labs = Array.isArray(r.labResults) ? r.labResults : [];
      const dateStr = r.date?.toDate
        ? r.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '';
      labs.forEach(lab => {
        if (!lab.testName) return;
        const existing = testMap.get(lab.testName);
        if (existing) {
          // Existing entry becomes "previous"; this newer one becomes "latest"
          testMap.set(lab.testName, {
            testName: lab.testName,
            result: lab.result,
            status: lab.status || 'normal',
            date: dateStr,
            previousResult: existing.result,
            previousDate: existing.date,
            referenceRange: lab.referenceRange || existing.referenceRange || null,
            unit: lab.unit || existing.unit || null,
            resultType: lab.resultType || existing.resultType || null,
          });
        } else {
          testMap.set(lab.testName, {
            testName: lab.testName,
            result: lab.result,
            status: lab.status || 'normal',
            date: dateStr,
            previousResult: null,
            previousDate: null,
            referenceRange: lab.referenceRange || null,
            unit: lab.unit || null,
            resultType: lab.resultType || null,
          });
        }
      });
    });
    return Array.from(testMap.values());
  }, [history]);

  // T4.120: Full chronological lab timeline for zoom modal — all tests, newest first.
  const labTimeline = useMemo(() => {
    const entries = [];
    (history || []).forEach(rec => {
      const ms = rec.date?.seconds ? rec.date.seconds * 1000 : 0;
      const dateStr = ms
        ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';
      const labs = Array.isArray(rec.labResults) ? rec.labResults : [];
      labs.forEach(lab => {
        if (!lab.testName) return;
        const numericResult = parseFloat(lab.result);
        entries.push({
          testName: lab.testName,
          result: lab.result,
          numericResult: isNaN(numericResult) ? null : numericResult,
          status: lab.status || 'normal',
          unit: lab.unit || '',
          referenceRange: lab.referenceRange || null,
          resultType: lab.resultType || (isNaN(numericResult) ? 'descriptive' : 'numeric'),
          notes: lab.notes || '',
          date: dateStr,
          ms,
          vet: rec.vetName || rec.attendingVet || '—',
          catalogTestId: lab.catalogTestId || null,
        });
      });
    });
    return entries.sort((a, b) => b.ms - a.ms); // newest first
  }, [history]);

  // T4.120: Unique test names for zoom filter chips
  const labUniqueTests = useMemo(() => {
    const set = new Set(labTimeline.map(e => e.testName));
    return Array.from(set).sort();
  }, [labTimeline]);

  // Vaccination tracker — uses live Firestore catalog (vaccineCatalog) for canonical vaccine list.
  // Primary: match vaccineAdministrations[].vaccineName via resolveVaccineFromName (id-based match).
  // Fallback: keyword-match against SOAP text for legacy records pre-dating the structured form.
  const vaccinationStatus = useMemo(() => {
    const records = history || [];

    // T3.100: Filter catalog to species-relevant vaccines before building status entries.
    const sp = (pet?.species || '').toLowerCase();
    const spKey = sp.includes('cat') || sp.includes('feline') ? 'cat' : 'dog';

    return vaccineCatalog.filter(v => v.species?.includes(spKey)).map(catalogVax => {
      // --- Structured path: find the MOST RECENT vaccineAdministration matching this catalog entry ---
      let structuredMatch = null;
      let matchedAdmin = null;
      let bestTime = 0;
      for (const r of records) {
        const admins = getVaccineAdministrations(r);
        const admin = admins.find(a => {
          const resolved = resolveVaccineFromName(a.vaccineName, vaccineCatalog);
          return resolved?.id === catalogVax.id;
        });
        if (admin) {
          const rTime = r.date?.toDate ? r.date.toDate().getTime() : (r.date?.seconds ? r.date.seconds * 1000 : 0);
          if (rTime >= bestTime) { structuredMatch = r; matchedAdmin = admin; bestTime = rTime; }
        }
      }

      if (structuredMatch && matchedAdmin) {
        const sd = matchedAdmin;
        const lastDate = structuredMatch.date?.toDate
          ? structuredMatch.date.toDate()
          : (structuredMatch.date?.seconds ? new Date(structuredMatch.date.seconds * 1000) : null);
        if (!lastDate) return {
          name: catalogVax.name, id: catalogVax.id, intervalDays: catalogVax.intervalDays,
          status: 'unknown', lastDate: null, daysUntilDue: null, lotNumber: sd.lotNumber || null,
        };

        const explicitDue = sd.dueDate ? new Date(sd.dueDate) : null;
        const intervalDays = sd.intervalDays || catalogVax.intervalDays;
        const daysUntilDue = explicitDue
          ? Math.floor((explicitDue.getTime() - Date.now()) / 86400000)
          : intervalDays - Math.floor((Date.now() - lastDate.getTime()) / 86400000);

        const status = daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 30 ? 'due_soon' : 'current';
        return {
          name: catalogVax.name, id: catalogVax.id, intervalDays: catalogVax.intervalDays,
          status, lastDate, daysUntilDue,
          lotNumber: sd.lotNumber || null,
          manufacturer: sd.manufacturer || null,
          routeOfAdmin: sd.routeOfAdmin || null,
        };
      }

      // --- Legacy fallback: keyword-match against SOAP / diagnosis text ---
      const keywordMatches = records.filter(r => {
        const text = [r.diagnosis, r.treatment, r.soap?.subjective, resolveObjectiveText(r)]
          .filter(Boolean).join(' ').toLowerCase();
        return catalogVax.keywords.some(kw => text.includes(kw));
      });

      if (keywordMatches.length === 0) return {
        name: catalogVax.name, id: catalogVax.id, intervalDays: catalogVax.intervalDays,
        status: 'unknown', lastDate: null, daysUntilDue: null,
      };

      const latest = keywordMatches.reduce((a, b) => {
        const aTime = a.date?.toDate ? a.date.toDate().getTime() : (a.date?.seconds ? a.date.seconds * 1000 : 0);
        const bTime = b.date?.toDate ? b.date.toDate().getTime() : (b.date?.seconds ? b.date.seconds * 1000 : 0);
        return aTime >= bTime ? a : b;
      });
      const lastDate = latest.date?.toDate
        ? latest.date.toDate()
        : (latest.date?.seconds ? new Date(latest.date.seconds * 1000) : null);
      if (!lastDate) return {
        name: catalogVax.name, id: catalogVax.id, intervalDays: catalogVax.intervalDays,
        status: 'unknown', lastDate: null, daysUntilDue: null,
      };

      const daysSince = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
      const daysUntilDue = catalogVax.intervalDays - daysSince;
      const status = daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 30 ? 'due_soon' : 'current';
      return { name: catalogVax.name, id: catalogVax.id, intervalDays: catalogVax.intervalDays, status, lastDate, daysUntilDue };
    });
  }, [history, vaccineCatalog, pet?.species]);

  // T3.101: Fast lookup map — vaccineId -> exemption object. Derived from pet.vaccineExemptions.
  const exemptionMap = useMemo(() => {
    const map = new Map();
    (pet?.vaccineExemptions || []).forEach(e => map.set(e.vaccineId, e));
    return map;
  }, [pet?.vaccineExemptions]);

  // T2.465 / T3.100 / T3.101: Vaccine completeness — fraction of administered vaccines out of the
  // species-filtered list, excluding exempted vaccines from the denominator.
  const vaccineCompleteness = useMemo(() => {
    const exemptIds = new Set((pet?.vaccineExemptions || []).map(e => e.vaccineId));
    const countable = vaccinationStatus.filter(v => !exemptIds.has(v.id));
    if (countable.length === 0) return null;
    const administered = countable.filter(v => v.status !== 'unknown').length;
    return {
      administered,
      total: countable.length,
      percentage: Math.round((administered / countable.length) * 100),
    };
  }, [vaccinationStatus, pet?.vaccineExemptions]);

  // Records that contain structured vaccine data — used by the vaccination
  // record printable. Sorted ascending so the document reads oldest-to-newest.
  // Uses getVaccineAdministrations() to handle both new and legacy formats.
  const vaccineRecords = useMemo(() =>
    (history || [])
      .filter(r => getVaccineAdministrations(r).length > 0)
      .sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0)),
    [history]
  );

  useEffect(() => { setExpandedRecords(new Set([0])); }, [timelineSearch, timelineSort, deptFilters, staffFilters, medFilters, supplyFilters, retailFilters, diagnosisFilters, labFilters, dateRangeType]);

  const toggleRecord = (i) => setExpandedRecords(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const toggleObjective = (index) => {
    setExpandedObjectives(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };
  const collapseAll = () => setExpandedRecords(new Set());
  const expandAll = () => setExpandedRecords(new Set(processedHistory.map((_, i) => i)));
  const allExpanded = processedHistory.length > 0 && expandedRecords.size === processedHistory.length;

  const scrollToRecord = useCallback((i) => {
    recordRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setExpandedRecords(p => { const n = new Set(p); n.add(i); return n; });
  }, []);

  // ── IntersectionObserver: highlight active record in TOC ──
  useEffect(() => {
    const container = timelineScrollRef.current;
    if (!container || processedHistory.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let bestIdx = activeRecordIndex;
        let bestRatio = 0;
        entries.forEach(entry => {
          const idx = parseInt(entry.target.dataset.recordIndex, 10);
          if (!isNaN(idx) && entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestIdx = idx;
          }
        });
        if (bestRatio > 0) setActiveRecordIndex(bestIdx);
      },
      { root: container, threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '-10% 0px -60% 0px' }
    );
    Object.values(recordRefs.current).forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [processedHistory]);

  const toggleYear = (year) => setCollapsedYears(p => { const n = new Set(p); n.has(year) ? n.delete(year) : n.add(year); return n; });

  // T2.101: Record a partial payment against an outstanding sale balance.
  // T4.147: Also syncs hasOutstandingBalance on the owner doc after payment.
  const handleRecordPayment = async () => {
    const amount = parseFloat(recordPaymentAmount);
    if (!recordPaymentTarget || isNaN(amount) || amount <= 0) return;
    try {
      const newBalance = Math.max(0, (recordPaymentTarget.balanceRemaining || 0) - amount);
      await updateDoc(doc(db, 'sales', recordPaymentTarget.id), { balanceRemaining: newBalance });
      const updatedSales = ownerSales.map(s =>
        s.id === recordPaymentTarget.id ? { ...s, balanceRemaining: newBalance } : s
      );
      setOwnerSales(updatedSales);
      setRecordPaymentOpen(false);
      setRecordPaymentTarget(null);
      setRecordPaymentAmount('');

      if (owner?.id) {
        const remainingDebt = updatedSales
          .filter(s => s.status !== 'refunded' && s.status !== 'voided')
          .reduce((sum, s) => sum + (s.balanceRemaining || 0), 0);
        await updateDoc(doc(db, 'users', owner.id), {
          hasOutstandingBalance: remainingDebt > 0,
        });
      }
    } catch (e) {
      console.error('[PatientDashboard.handleRecordPayment]:', e.message);
      setErrorSnack('Failed to record payment: ' + e.message);
    }
  };

  // T4.147: Mark a sale as settled externally (off-POS payment — GCash, bank transfer, etc.).
  // Writes an audit trail so the forensic ledger distinguishes POS vs. external settlements.
  const handleMarkSettled = async () => {
    if (!settleTarget) return;
    try {
      const staffName = profile
        ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.fullName || 'Staff'
        : 'Staff';
      await updateDoc(doc(db, 'sales', settleTarget.id), {
        balanceRemaining: 0,
        settledExternally: true,
        settledBy: staffName,
        settledAt: Timestamp.now(),
      });
      let updatedSales;
      setOwnerSales(prev => {
        updatedSales = prev.map(s =>
          s.id === settleTarget.id ? { ...s, balanceRemaining: 0, settledExternally: true, settledBy: staffName, settledAt: new Date() } : s
        );
        return updatedSales;
      });
      setSettleTarget(null);

      if (owner?.id && updatedSales) {
        const remainingDebt = updatedSales
          .filter(s => s.status !== 'refunded' && s.status !== 'voided')
          .reduce((sum, s) => sum + (s.balanceRemaining || 0), 0);
        updateDoc(doc(db, 'users', owner.id), {
          hasOutstandingBalance: remainingDebt > 0,
        }).catch(() => {});

        // T4.204: Recompute balance reminder queue after external settlement.
        // Fire-and-forget — never blocks the settle action.
        computeSingleOwnerBalanceReminder(owner.id, {
          ownerName:  owner.fullName  || '',
          ownerEmail: owner.email     || '',
          ownerPhone: owner.phone     || '',
          pushToken:  owner.expoPushToken || null,
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[PatientDashboard.handleMarkSettled]:', e.message);
      setErrorSnack('Failed to mark as settled: ' + e.message);
    }
  };

  // T4.147 / T4.204: Snooze automated balance reminders for this client.
  // Writes balanceReminderSnoozedUntil to both the user doc (legacy path) and
  // the balance_reminder_queue doc (T4.204 Worker path). The Worker now reads
  // the queue doc exclusively, so both writes are needed during the transition.
  const handleSnoozeReminders = async (daysFromNow) => {
    if (!owner?.id) return;
    try {
      const snoozedUntil = new Date();
      snoozedUntil.setDate(snoozedUntil.getDate() + daysFromNow);
      const snoozedTimestamp = Timestamp.fromDate(snoozedUntil);

      // Primary write — user doc (legacy compat)
      await updateDoc(doc(db, 'users', owner.id), {
        balanceReminderSnoozedUntil: snoozedTimestamp,
      });

      // T4.204: Mirror snooze to balance_reminder_queue doc so the Worker
      // Cron picks it up without querying the user doc.
      // Fire-and-forget via setDoc with merge:true — queue doc may not exist yet.
      setDoc(doc(db, 'balance_reminder_queue', owner.id), {
        balanceReminderSnoozedUntil: snoozedTimestamp,
      }, { merge: true }).catch(() => {});

      setSuccessSnack(`Reminders snoozed for ${daysFromNow} day${daysFromNow !== 1 ? 's' : ''}.`);
    } catch (e) {
      console.error('[PatientDashboard.handleSnoozeReminders]:', e.message);
      setErrorSnack('Failed to snooze reminders: ' + e.message);
    }
  };

  // T3.101: Write a vaccine exemption entry to pets/{id}.vaccineExemptions and re-fetch
  // the pet document so the UI reflects the change immediately (one-shot getDoc, no listener).
  const handleMarkExempt = async () => {
    if (!exemptionTarget || !exemptionReason.trim()) return;
    setExemptionSaving(true);
    try {
      const staffName = profile
        ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Staff'
        : 'Staff';
      await updateDoc(doc(db, 'pets', id), {
        vaccineExemptions: arrayUnion({
          vaccineId: exemptionTarget.vaccineId,
          reason: exemptionReason.trim(),
          exemptedBy: staffName,
          exemptedAt: Timestamp.now(),
        }),
      });
      const petSnap = await getDoc(doc(db, 'pets', id));
      if (petSnap.exists()) setPet({ id: petSnap.id, ...petSnap.data() });
      setExemptionDialogOpen(false);
      setExemptionTarget(null);
      setExemptionReason('');
    } catch (err) {
      console.error('[PatientDashboard.handleMarkExempt]:', err);
      setErrorSnack('Failed to save exemption');
    } finally {
      setExemptionSaving(false);
    }
  };

  // T3.101: Remove an exemption entry using the exact stored object (Firestore arrayRemove
  // uses deep equality — reconstructing the object would fail on Timestamp comparison).
  const handleUndoExemption = async (vaccineId) => {
    try {
      const existing = (pet?.vaccineExemptions || []).find(e => e.vaccineId === vaccineId);
      if (!existing) return;
      await updateDoc(doc(db, 'pets', id), {
        vaccineExemptions: arrayRemove(existing),
      });
      const petSnap = await getDoc(doc(db, 'pets', id));
      if (petSnap.exists()) setPet({ id: petSnap.id, ...petSnap.data() });
    } catch (err) {
      console.error('[PatientDashboard.handleUndoExemption]:', err);
      setErrorSnack('Failed to undo exemption');
    }
  };

  // T4.116: Pin/unpin a medication as permanently active
  const handleTogglePin = async (medName, currentlyPinned) => {
    try {
      const petRef = doc(db, 'pets', id);
      await updateDoc(petRef, {
        pinnedMedications: currentlyPinned ? arrayRemove(medName) : arrayUnion(medName),
      });
      setRxPinSnack(currentlyPinned ? `Unpinned ${medName}` : `Pinned ${medName} as active`);
      // Refresh pet state so useMemo recomputes without a full Firestore round-trip
      setPet(prev => ({
        ...prev,
        pinnedMedications: currentlyPinned
          ? (prev.pinnedMedications || []).filter(n => n !== medName)
          : [...(prev.pinnedMedications || []), medName],
      }));
    } catch (err) {
      console.error('[PatientDashboard.handleTogglePin]:', err);
      setErrorSnack('Failed to update pin status');
    }
  };

  // ── TOC: group records by year ──
  const tocGroups = useMemo(() => {
    const groups = [];
    let currentYear = null;
    processedHistory.forEach((r, i) => {
      const d = r.date?.toDate ? r.date.toDate() : null;
      const year = d?.getFullYear() || 'Unknown';
      if (year !== currentYear) {
        currentYear = year;
        groups.push({ year, records: [] });
      }
      groups[groups.length - 1].records.push({
        index: i,
        dateLabel: d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
        diagnosis: r.diagnoses?.[0]?.name || r.diagnosis || 'Clinical Visit',
        recordType: r.recordType || 'medical',
      });
    });
    return groups;
  }, [processedHistory]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: FONT }}><CircularProgress sx={{ color: COLORS.accentLight }} /></Box>;

  const sexLabel = pet?.gender === 'Male' ? (pet?.isNeutered ? 'MN' : 'MI') : pet?.gender === 'Female' ? (pet?.isNeutered ? 'FS' : 'FI') : '—';

  // T2.119: Normalize allergy reads — `petAllergies` is canonical; `allergies` is the legacy field.
  // Always read via this resolved value so both old and new documents display correctly.
  const resolvedPetAllergies = pet?.petAllergies || pet?.allergies || '';
  const hasAllergies = resolvedPetAllergies.trim().length > 0
    && !['None', 'None recorded', 'none'].includes(resolvedPetAllergies.trim());

  // T2.461: Determine species key for reference-line ranges
  const speciesKey = (pet?.species || '').toLowerCase().includes('cat') || (pet?.species || '').toLowerCase().includes('feline')
    ? 'feline' : 'canine';

  // Step 3.6 (RA 10173): Owner's account has been anonymized.
  // The dashboard remains viewable for historical continuity but all
  // data-creation actions must be blocked to prevent new PII being
  // linked to an erased identity.
  const isErased = owner?.accountStatus === 'erased';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', bgcolor: COLORS.surface, overflow: 'hidden', fontFamily: FONT }}>

      {/* ═══ PATIENT BANNER ═══ */}
      <Box sx={{ bgcolor: COLORS.banner, borderBottom: `2px solid ${COLORS.bannerBorder}`, display: 'flex', alignItems: 'center', flexShrink: 0, boxShadow: '0 1px 4px rgba(62,39,35,0.08)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', py: 1.5, px: 2, gap: 2, flex: 1 }}>
          <IconButton
            onClick={() => {
              if (location.state?.from === 'records') {
                navigate('/records');
              } else {
                navigate('/patients');
              }
            }}
            size="small"
            sx={{ color: COLORS.textMuted, '&:hover': { color: COLORS.brand, bgcolor: COLORS.panelBg } }}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Avatar sx={{ width: 42, height: 42, fontFamily: FONT, bgcolor: getInitialColor(pet?.name), fontWeight: 700, fontSize: '1rem', color: COLORS.cardBg }}>
            {(pet?.name || '?')[0].toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1, ml: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontFamily: FONT, ...TYPE.heading, color: COLORS.brand, textTransform: 'capitalize' }}>{pet?.name}</Typography>
              
              {owner && (
                <Tooltip title={`OWNER: ${owner.fullName || owner.displayName || owner.name} | ${owner.phone || ''} | ${owner.email || ''}`} arrow>
                  <Typography sx={{ 
                    fontFamily: FONT, fontSize: '0.85rem', fontWeight: 700, 
                    color: COLORS.brand, ml: 0.5, opacity: 0.9,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: { xs: 200, sm: 300, md: 500 }
                  }}>
                    ({owner.fullName || owner.displayName || owner.name} 
                    {owner.phone && ` · ${owner.phone}`}
                    {owner.email && ` · ${owner.email}`})
                  </Typography>
                </Tooltip>
              )}
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2.5, rowGap: 1, mt: 0.5 }}>
              {/* Species */}
              <Box>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 1000, color: COLORS.textMuted, mb: -0.2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Species</Typography>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', fontWeight: 800, color: COLORS.textPrimary, textTransform: 'capitalize' }}>
                  {pet?.species || '—'}
                </Typography>
              </Box>

              {/* Breed */}
              <Box>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 1000, color: COLORS.textMuted, mb: -0.2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Breed</Typography>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', fontWeight: 800, color: COLORS.textPrimary }}>
                  {pet?.breed && pet.breed !== 'Unknown Breed' ? pet.breed : 'Unknown'}
                </Typography>
              </Box>

              {/* Gender & Status */}
              <Box>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 1000, color: COLORS.textMuted, mb: -0.2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sex & Status</Typography>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', fontWeight: 800, color: COLORS.textPrimary, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {pet?.gender === 'Female' ? <FemaleIcon sx={{ fontSize: 13, color: '#E91E63' }} /> : pet?.gender === 'Male' ? <MaleIcon sx={{ fontSize: 13, color: '#1976D2' }} /> : null}
                  {pet?.gender || 'Unknown'} {pet?.isNeutered ? `(${pet.gender === 'Female' ? 'Spayed' : 'Neutered'})` : '(Intact)'}
                </Typography>
              </Box>

              {/* Age */}
              <Box>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 1000, color: COLORS.textMuted, mb: -0.2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Age</Typography>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', fontWeight: 800, color: COLORS.brand }}>
                  {calculatePetAge(pet?.dob)}
                </Typography>
              </Box>

              {/* Weight */}
              <Box>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 1000, color: COLORS.textMuted, mb: -0.2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Weight</Typography>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', fontWeight: 800, color: COLORS.textPrimary }}>
                  {pet?.lastWeight ? `${pet.lastWeight} kg` : '—'}
                </Typography>
              </Box>

              {/* Allergy Status */}
              <Box>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 1000, color: COLORS.textMuted, mb: -0.2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Allergies</Typography>
                {hasAllergies ? (
                  <Tooltip title={`ALLERGIES: ${resolvedPetAllergies.toUpperCase()}`} arrow>
                    <Chip 
                      label={resolvedPetAllergies.toUpperCase()} 
                      size="small" 
                      sx={{ 
                        bgcolor: COLORS.surgery, color: COLORS.cardBg, fontWeight: 900, fontSize: '0.65rem', 
                        height: 18, borderRadius: 0, fontFamily: FONT,
                        maxWidth: 180, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' }
                      }} 
                    />
                  </Tooltip>
                ) : (
                  <Tooltip title="ALLERGIES: NO KNOWN ALLERGIES" arrow>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', fontWeight: 800, color: COLORS.success, cursor: 'help' }}>NKA</Typography>
                  </Tooltip>
                )}
              </Box>

              {/* Outstanding Balance */}
              {computedOutstandingBalance > 0 && (
                <Box>
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 1000, color: COLORS.danger, mb: -0.2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Financial Alert</Typography>
                  <Tooltip title="Outstanding balance from unpaid visits.">
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', fontWeight: 1000, color: COLORS.danger, animation: 'pulse 2s infinite' }}>
                      ₱{computedOutstandingBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} DUE
                    </Typography>
                  </Tooltip>
                </Box>
              )}
            </Box>
          </Box>
        </Box>

        {/* Unified Command Bar: Integrated Toggle */}
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, borderLeft: `1px solid ${COLORS.borderLight}`, borderRight: `1px solid ${COLORS.borderLight}`, py: 1.5 }}>
          <TextField
            size="small"
            placeholder="Search records..."
            value={timelineSearch}
            onChange={(e) => setTimelineSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ ml: -1 }}>
                  <Tooltip title={showFilterRibbon ? "Hide Filters" : "Show Filters"}>
                    <IconButton 
                      onClick={() => setShowFilterRibbon(!showFilterRibbon)}
                      sx={{ 
                        color: showFilterRibbon ? COLORS.brand : COLORS.textMuted,
                        borderRight: `1px solid ${COLORS.borderLight}`, borderRadius: 0, mr: 1,
                        bgcolor: showFilterRibbon ? COLORS.surfaceAlt : 'transparent'
                      }}
                    >
                      <Badge badgeContent={activeFilterCount} color="error" sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 16, minWidth: 16 } }}>
                        <FilterListIcon sx={{ fontSize: 18 }} />
                      </Badge>
                    </IconButton>
                  </Tooltip>
                  <SearchIcon sx={{ color: COLORS.textMuted, fontSize: 16, ml: 0.5 }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.brand, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {processedHistory.length} RECORDS
                  </Typography>
                </InputAdornment>
              )
            }}
            sx={{
              minWidth: 320,
              '& .MuiOutlinedInput-root': {
                fontFamily: FONT, fontSize: '0.82rem', color: COLORS.textPrimary,
                bgcolor: COLORS.formBg, borderRadius: 0, height: 36,
                pr: 1.5,
                '& fieldset': { borderColor: COLORS.border },
                '&:hover fieldset': { borderColor: COLORS.brand },
              }
            }}
          />
        </Box>

        {/* Action Hub (Consolidated T4.119) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5 }}>
          <Button
            variant="contained"
            size="small"
            onClick={handleActionsClick}
            endIcon={<ExpandMoreIcon />}
            sx={{
              fontFamily: FONT, fontWeight: 900, fontSize: '0.72rem', textTransform: 'uppercase',
              bgcolor: COLORS.brand, borderRadius: 0, px: 2.5, height: 36, boxShadow: 'none',
              letterSpacing: '0.05em',
              '&:hover': { bgcolor: COLORS.brandHover }
            }}
          >
            Actions
          </Button>
          <Menu
            anchorEl={actionMenuAnchor}
            open={Boolean(actionMenuAnchor)}
            onClose={handleActionsClose}
            PaperProps={{ sx: { borderRadius: 0, mt: 0.5, border: `1px solid ${COLORS.border}`, boxShadow: 'none' } }}
          >
            <MenuItem onClick={() => { handleActionsClose(); setQuickBookOpen(true); }} sx={{ gap: 1.5, py: 1 }}>
              <EventAvailableIcon sx={{ fontSize: 18, color: COLORS.success }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 800 }}>Book Visit</Typography>
            </MenuItem>
            <MenuItem onClick={() => { handleActionsClose(); setReferralOpen(true); }} sx={{ gap: 1.5, py: 1 }}>
              <LocalHospitalIcon sx={{ fontSize: 18, color: COLORS.accent }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 800 }}>Request Referral</Typography>
            </MenuItem>
            <MenuItem 
              disabled={isErased || !pet?.ownerId || pet?.ownerId === 'WALK_IN_USER'}
              onClick={() => { handleActionsClose(); setNotifDialogOpen(true); }} 
              sx={{ gap: 1.5, py: 1 }}
            >
              <NotificationsActiveIcon sx={{ fontSize: 18, color: COLORS.medical }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 800 }}>Notify Owner (Push/Email)</Typography>
            </MenuItem>
          </Menu>

          {/* T4.96: AI History Assistant Tool */}
          {llmConfig.enabled && !!llmConfig.workerUrl && (
            <Button
              variant="outlined"
              size="small"
              disabled={isErased}
              startIcon={<AutoAwesomeIcon sx={{ fontSize: '15px !important' }} />}
              onClick={() => setAiDrawerOpen(true)}
              sx={{
                fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', textTransform: 'none',
                color: COLORS.grooming, borderColor: COLORS.kpiPurpleBorder, borderRadius: 0,
                px: 2, height: 36,
                '&:hover': { borderColor: COLORS.grooming, bgcolor: COLORS.kpiPurpleBg },
              }}
            >
              AI Assistant
            </Button>
          )}
        </Box>
      </Box>

          {/* CLINICAL FILTER RIBBON (T4.118: Expandable Toolbar) */}
          <Collapse in={showFilterRibbon}>
            <Box sx={{ 
              bgcolor: COLORS.surfaceAlt, borderBottom: `1px solid ${COLORS.border}`,
              display: 'flex', alignItems: 'center', px: 2, py: 0.75, gap: 1,
              boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.02)',
              justifyContent: 'flex-end'
            }}>
              <Typography sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 900, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', mr: 1 }}>
                Filters:
              </Typography>
              
              <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', py: 0.5, '&::-webkit-scrollbar': { height: 0 } }}>
                {[
                  { label: 'Depts', icon: <FilterListIcon sx={{ fontSize: 13 }} />, anchor: deptAnchor, setAnchor: setDeptAnchor, active: !deptFilters.includes('all'), color: COLORS.brand },
                  { label: 'Staff', icon: <PersonIcon sx={{ fontSize: 13 }} />, anchor: staffAnchor, setAnchor: setStaffAnchor, active: !staffFilters.includes('all'), color: COLORS.brand },
                  { label: 'Meds', icon: <MedicationIcon sx={{ fontSize: 13 }} />, anchor: medAnchor, setAnchor: setMedAnchor, active: !medFilters.includes('all'), color: COLORS.danger },
                  { label: 'Supplies', icon: <InventoryIcon sx={{ fontSize: 13 }} />, anchor: supplyAnchor, setAnchor: setSupplyAnchor, active: !supplyFilters.includes('all'), color: COLORS.info },
                  { label: 'Retail', icon: <ShoppingBagIcon sx={{ fontSize: 13 }} />, anchor: retailAnchor, setAnchor: setRetailAnchor, active: !retailFilters.includes('all'), color: COLORS.success },
                  { label: 'Diagnoses', icon: <AssignmentIcon sx={{ fontSize: 13 }} />, anchor: diagAnchor, setAnchor: setDiagAnchor, active: !diagnosisFilters.includes('all'), color: COLORS.brand },
                  { label: 'Labs', icon: <BiotechIcon sx={{ fontSize: 13 }} />, anchor: labAnchor, setAnchor: setLabAnchor, active: !labFilters.includes('all'), color: COLORS.info },
                  { label: 'Time', icon: <TodayIcon sx={{ fontSize: 13 }} />, anchor: dateAnchor, setAnchor: setDateAnchor, active: dateRangeType !== 'all', color: COLORS.medical },
                ].map((reg) => (
                  <Button
                    key={reg.label}
                    size="small"
                    startIcon={reg.icon}
                    onClick={(e) => reg.setAnchor(e.currentTarget)}
                    sx={{
                      fontFamily: FONT, fontSize: '0.62rem', fontWeight: 900, textTransform: 'uppercase',
                      px: 1.5, py: 0.5, borderRadius: 0, whiteSpace: 'nowrap',
                      border: `2px solid ${reg.active ? reg.color : COLORS.brand}`,
                      bgcolor: reg.active ? reg.color : 'white',
                      color: reg.active ? 'white' : reg.color,
                      boxShadow: `2px 2px 0 ${reg.active ? reg.color : COLORS.brand}`,
                      letterSpacing: '0.05em',
                      transition: 'all 0.1s ease',
                      '&:hover': { 
                        bgcolor: reg.active ? reg.color : COLORS.surfaceAlt, 
                        transform: 'translate(1px, 1px)',
                        boxShadow: 'none'
                      }
                    }}
                  >
                    {reg.label}
                  </Button>
                ))}
              </Stack>

              <Button 
                size="small" 
                variant="outlined"
                startIcon={<FilterListOffIcon sx={{ fontSize: 13 }} />}
                onClick={handleClearAllFilters}
                sx={{ 
                  fontFamily: FONT, fontSize: '0.62rem', fontWeight: 900, 
                  color: COLORS.danger, textTransform: 'uppercase', ml: 1,
                  border: `2px solid ${COLORS.brand}`, borderRadius: 0,
                  boxShadow: `2px 2px 0 ${COLORS.brand}`,
                  bgcolor: 'white',
                  '&:hover': { bgcolor: COLORS.danger, color: 'white', transform: 'translate(1px, 1px)', boxShadow: 'none' }
                }}
              >
                Clear All
              </Button>
            </Box>
          </Collapse>

          {/* MENUS (Shared for Ribbon) */}
          <Menu anchorEl={deptAnchor} open={Boolean(deptAnchor)} onClose={() => setDeptAnchor(null)} PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.brand}`, boxShadow: `4px 4px 0 ${COLORS.brand}`, mt: 0.5 } }}>
            <MenuItem onClick={() => handleToggleRegistry(setDeptFilters, deptFilters, 'all')} sx={{ py: 0.5, px: 1.5, bgcolor: deptFilters.includes('all') ? `${COLORS.brand}12` : 'transparent' }}>
              <Checkbox size="small" checked={deptFilters.includes('all')} sx={{ color: COLORS.brand }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 800, color: COLORS.brand }}>ALL DEPARTMENTS</Typography>
            </MenuItem>
            <Divider />
            {availableDepts.map(d => (
              <MenuItem key={d} onClick={() => handleToggleRegistry(setDeptFilters, deptFilters, d)} sx={{ py: 0.5, px: 1.5 }}>
                <Checkbox size="small" checked={deptFilters.includes(d)} sx={{ color: COLORS.brand }} />
                <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700 }}>{d.toUpperCase()}</Typography>
              </MenuItem>
            ))}
          </Menu>

          <Menu anchorEl={staffAnchor} open={Boolean(staffAnchor)} onClose={() => setStaffAnchor(null)} PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.brand}`, boxShadow: `4px 4px 0 ${COLORS.brand}`, mt: 0.5 } }}>
            <MenuItem onClick={() => handleToggleRegistry(setStaffFilters, staffFilters, 'all')} sx={{ py: 0.5, px: 1.5, bgcolor: staffFilters.includes('all') ? `${COLORS.brand}12` : 'transparent' }}>
              <Checkbox size="small" checked={staffFilters.includes('all')} sx={{ color: COLORS.brand }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 800, color: COLORS.brand }}>ALL CLINICIANS</Typography>
            </MenuItem>
            <Divider />
            {availableStaff.map(s => (
              <MenuItem key={s} onClick={() => handleToggleRegistry(setStaffFilters, staffFilters, s)} sx={{ py: 0.5, px: 1.5 }}>
                <Checkbox size="small" checked={staffFilters.includes(s)} sx={{ color: COLORS.brand }} />
                <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700 }}>{s.toUpperCase()}</Typography>
              </MenuItem>
            ))}
          </Menu>

          <Menu anchorEl={medAnchor} open={Boolean(medAnchor)} onClose={() => setMedAnchor(null)} PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.brand}`, boxShadow: `4px 4px 0 ${COLORS.brand}`, maxHeight: 400, mt: 0.5 } }}>
            <MenuItem onClick={() => handleToggleRegistry(setMedFilters, medFilters, 'all')} sx={{ py: 0.5, px: 1.5, bgcolor: medFilters.includes('all') ? `${COLORS.brand}12` : 'transparent' }}>
              <Checkbox size="small" checked={medFilters.includes('all')} sx={{ color: COLORS.brand }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 800, color: COLORS.brand }}>ALL MEDICINES</Typography>
            </MenuItem>
            <Divider />
            {availableMeds.map(m => (
              <MenuItem key={m} onClick={() => handleToggleRegistry(setMedFilters, medFilters, m)} sx={{ py: 0.5, px: 1.5 }}>
                <Checkbox size="small" checked={medFilters.includes(m)} sx={{ color: COLORS.brand }} />
                <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700 }}>{m.toUpperCase()}</Typography>
              </MenuItem>
            ))}
          </Menu>

          <Menu anchorEl={supplyAnchor} open={Boolean(supplyAnchor)} onClose={() => setSupplyAnchor(null)} PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.info}`, boxShadow: `4px 4px 0 ${COLORS.info}`, maxHeight: 400, mt: 0.5 } }}>
            <MenuItem onClick={() => handleToggleRegistry(setSupplyFilters, supplyFilters, 'all')} sx={{ py: 0.5, px: 1.5, bgcolor: supplyFilters.includes('all') ? `${COLORS.info}12` : 'transparent' }}>
              <Checkbox size="small" checked={supplyFilters.includes('all')} sx={{ color: COLORS.info }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 800, color: COLORS.info }}>ALL SUPPLIES</Typography>
            </MenuItem>
            <Divider />
            {availableSupplies.map(s => (
              <MenuItem key={s} onClick={() => handleToggleRegistry(setSupplyFilters, supplyFilters, s)} sx={{ py: 0.5, px: 1.5 }}>
                <Checkbox size="small" checked={supplyFilters.includes(s)} sx={{ color: COLORS.info }} />
                <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700 }}>{s.toUpperCase()}</Typography>
              </MenuItem>
            ))}
          </Menu>

          <Menu anchorEl={retailAnchor} open={Boolean(retailAnchor)} onClose={() => setRetailAnchor(null)} PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.success}`, boxShadow: `4px 4px 0 ${COLORS.success}`, maxHeight: 400, mt: 0.5 } }}>
            <MenuItem onClick={() => handleToggleRegistry(setRetailFilters, retailFilters, 'all')} sx={{ py: 0.5, px: 1.5, bgcolor: retailFilters.includes('all') ? `${COLORS.success}12` : 'transparent' }}>
              <Checkbox size="small" checked={retailFilters.includes('all')} sx={{ color: COLORS.success }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 800, color: COLORS.success }}>ALL RETAIL ITEMS</Typography>
            </MenuItem>
            <Divider />
            {availableRetail.map(r => (
              <MenuItem key={r} onClick={() => handleToggleRegistry(setRetailFilters, retailFilters, r)} sx={{ py: 0.5, px: 1.5 }}>
                <Checkbox size="small" checked={retailFilters.includes(r)} sx={{ color: COLORS.success }} />
                <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700 }}>{r.toUpperCase()}</Typography>
              </MenuItem>
            ))}
          </Menu>

          <Menu anchorEl={diagAnchor} open={Boolean(diagAnchor)} onClose={() => setDiagAnchor(null)} PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.brand}`, boxShadow: `4px 4px 0 ${COLORS.brand}`, maxHeight: 400, mt: 0.5 } }}>
            <MenuItem onClick={() => handleToggleRegistry(setDiagnosisFilters, diagnosisFilters, 'all')} sx={{ py: 0.5, px: 1.5, bgcolor: diagnosisFilters.includes('all') ? `${COLORS.brand}12` : 'transparent' }}>
              <Checkbox size="small" checked={diagnosisFilters.includes('all')} sx={{ color: COLORS.brand }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 800, color: COLORS.brand }}>ALL DIAGNOSES</Typography>
            </MenuItem>
            <Divider />
            {availableDiagnoses.map(d => (
              <MenuItem key={d} onClick={() => handleToggleRegistry(setDiagnosisFilters, diagnosisFilters, d)} sx={{ py: 0.5, px: 1.5 }}>
                <Checkbox size="small" checked={diagnosisFilters.includes(d)} sx={{ color: COLORS.brand }} />
                <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700 }}>{d.toUpperCase()}</Typography>
              </MenuItem>
            ))}
          </Menu>

          <Menu anchorEl={labAnchor} open={Boolean(labAnchor)} onClose={() => setLabAnchor(null)} PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.info}`, boxShadow: `4px 4px 0 ${COLORS.info}`, maxHeight: 400, mt: 0.5 } }}>
            <MenuItem onClick={() => handleToggleRegistry(setLabFilters, labFilters, 'all')} sx={{ py: 0.5, px: 1.5, bgcolor: labFilters.includes('all') ? `${COLORS.info}12` : 'transparent' }}>
              <Checkbox size="small" checked={labFilters.includes('all')} sx={{ color: COLORS.info }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 800, color: COLORS.info }}>ALL LAB TESTS</Typography>
            </MenuItem>
            <Divider />
            {availableLabs.map(l => (
              <MenuItem key={l} onClick={() => handleToggleRegistry(setLabFilters, labFilters, l)} sx={{ py: 0.5, px: 1.5 }}>
                <Checkbox size="small" checked={labFilters.includes(l)} sx={{ color: COLORS.info }} />
                <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700 }}>{l.toUpperCase()}</Typography>
              </MenuItem>
            ))}
          </Menu>

          <Menu 
            anchorEl={dateAnchor} 
            open={Boolean(dateAnchor)} 
            onClose={() => setDateAnchor(null)} 
            PaperProps={{ 
              sx: { 
                borderRadius: 0, border: `2px solid ${COLORS.brand}`, 
                boxShadow: `4px 4px 0 ${COLORS.brand}`, p: 1.5, mt: 0.5,
                minWidth: 260
              } 
            }}
          >
            <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.textMuted, mb: 1.5, letterSpacing: 1 }}>PRESET RANGES</Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
              <Button variant="outlined" size="small" onClick={() => { setDateRangeType('all'); setDateAnchor(null); }} sx={{ flex: 1, fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, borderRadius: 0, color: COLORS.brand, borderColor: COLORS.brand }}>ALL</Button>
              <Button variant="outlined" size="small" onClick={() => { setDateRangeType('today'); setDateAnchor(null); }} sx={{ flex: 1, fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, borderRadius: 0, color: COLORS.brand, borderColor: COLORS.brand }}>TODAY</Button>
              <Button variant="outlined" size="small" onClick={() => { setDateRangeType('30d'); setDateAnchor(null); }} sx={{ flex: 1, fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, borderRadius: 0, color: COLORS.brand, borderColor: COLORS.brand }}>30D</Button>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Button variant="outlined" size="small" onClick={() => { setDateRangeType('6mo'); setDateAnchor(null); }} sx={{ flex: 1, fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, borderRadius: 0, color: COLORS.brand, borderColor: COLORS.brand }}>6 MO</Button>
              <Button variant="outlined" size="small" onClick={() => { setDateRangeType('1yr'); setDateAnchor(null); }} sx={{ flex: 1, fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, borderRadius: 0, color: COLORS.brand, borderColor: COLORS.brand }}>1 YR</Button>
            </Stack>

            <Divider sx={{ mb: 2 }} />

            <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.textMuted, mb: 1.5, letterSpacing: 1 }}>CUSTOM RANGE</Typography>
            <Stack spacing={1.5}>
              <Box>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, color: COLORS.brand, mb: 0.5 }}>START DATE</Typography>
                <TextField 
                  type="date" 
                  size="small" 
                  fullWidth 
                  value={customStart}
                  onChange={(e) => { setCustomStart(e.target.value); setDateRangeType('custom'); }}
                  InputProps={{ sx: { borderRadius: 0, fontFamily: FONT, fontSize: '0.75rem' } }} 
                />
              </Box>
              <Box>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, color: COLORS.brand, mb: 0.5 }}>END DATE</Typography>
                <TextField 
                  type="date" 
                  size="small" 
                  fullWidth 
                  value={customEnd}
                  onChange={(e) => { setCustomEnd(e.target.value); setDateRangeType('custom'); }}
                  InputProps={{ sx: { borderRadius: 0, fontFamily: FONT, fontSize: '0.75rem' } }} 
                />
              </Box>
              <Button 
                fullWidth 
                variant="contained" 
                onClick={() => setDateAnchor(null)}
                sx={{ bgcolor: COLORS.brand, borderRadius: 0, fontFamily: FONT, fontSize: '0.7rem', fontWeight: 900, mt: 1 }}
              >
                APPLY RANGE
              </Button>
            </Stack>
          </Menu>

      {/* ═══ RA 10173 ERASURE BANNER ═══ */}
      {isErased && (
        <Box sx={{
          bgcolor: COLORS.dangerSurface,
          borderBottom: `2px solid ${COLORS.danger}`,
          px: 3, py: 1.25,
          display: 'flex', alignItems: 'center', gap: 1.5,
          flexShrink: 0,
        }}>
          <ShieldIcon sx={{ fontSize: 18, color: COLORS.danger, flexShrink: 0 }} />
          <Typography sx={{
            fontFamily: FONT,
            fontSize: '0.82rem',
            fontWeight: 900,
            color: COLORS.danger,
            borderRadius: 0,
            letterSpacing: '0.02em',
          }}>
            This client&apos;s data has been erased under RA 10173. Records shown below are anonymized.
          </Typography>
        </Box>
      )}

      {/* ═══ MAIN SPLIT PANEL ═══ */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT: Collapsible TOC Sidebar ── */}
        {processedHistory.length > 0 && (
          <Box sx={{
            width: sidebarOpen ? 190 : 44, flexShrink: 0, bgcolor: COLORS.surfaceAlt,
            borderRight: `1px solid ${COLORS.borderLight}`, display: 'flex', flexDirection: 'column',
            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)', overflow: 'hidden',
          }}>
            {/* Toggle Button */}
            <Box sx={{ display: 'flex', justifyContent: sidebarOpen ? 'flex-end' : 'center', px: 0.5, py: 0.75, borderBottom: `1px solid ${COLORS.borderLight}`, flexShrink: 0 }}>
              <IconButton size="small" onClick={() => setSidebarOpen(p => !p)} sx={{ color: COLORS.textMuted, width: 28, height: 28, '&:hover': { bgcolor: COLORS.panelBg } }}>
                {sidebarOpen ? <ChevronLeftIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </Box>

            {/* Sidebar Content */}
            <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', '&::-webkit-scrollbar': { width: 3 }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.timelineRail, borderRadius: 4 } }}>
              {sidebarOpen ? (
                /* ── EXPANDED: Readable TOC ── */
                <Box sx={{ py: 1 }}>
                  {tocGroups.map((group) => {
                    const isYearCollapsed = collapsedYears.has(group.year);
                    return (
                      <Box key={group.year}>
                        {/* Year Header */}
                        <Box onClick={() => toggleYear(group.year)} sx={{
                          display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.75,
                          cursor: 'pointer', '&:hover': { bgcolor: COLORS.panelBg },
                        }}>
                          <Box sx={{ color: COLORS.textMuted, display: 'flex', alignItems: 'center' }}>
                            {isYearCollapsed ? <ChevronRightIcon sx={{ fontSize: 14 }} /> : <ExpandMoreIcon sx={{ fontSize: 14 }} />}
                          </Box>
                          <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', fontWeight: 800, color: COLORS.textMuted, letterSpacing: '0.04em' }}>{group.year}</Typography>
                          <Typography sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 600, color: COLORS.textMuted, ml: 'auto' }}>({group.records.length})</Typography>
                        </Box>

                        {/* Record Entries */}
                        <Collapse in={!isYearCollapsed} timeout={200}>
                          {group.records.map((entry) => {
                            const isActive = activeRecordIndex === entry.index;
                            const dotColor = getRecordColor(entry.recordType);
                            return (
                              <Box key={entry.index} onClick={() => scrollToRecord(entry.index)} sx={{
                                display: 'flex', alignItems: 'center', gap: 1, pl: 2, pr: 1, py: 0.6,
                                cursor: 'pointer', transition: 'all 0.15s ease',
                                borderLeft: isActive ? `3px solid ${COLORS.brand}` : '3px solid transparent',
                                bgcolor: isActive ? COLORS.panelBg : 'transparent',
                                '&:hover': { bgcolor: isActive ? COLORS.panelBg : COLORS.surface },
                              }}>
                                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: isActive ? COLORS.brand : COLORS.border, flexShrink: 0 }} />
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', fontWeight: isActive ? 700 : 500, color: isActive ? COLORS.brand : COLORS.textSecondary, lineHeight: 1.3 }}>
                                    {entry.dateLabel}
                                  </Typography>
                                  <Typography sx={{
                                    fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, lineHeight: 1.2,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {entry.diagnosis}
                                  </Typography>
                                </Box>
                              </Box>
                            );
                          })}
                        </Collapse>
                      </Box>
                    );
                  })}
                </Box>
              ) : (
                /* ── COLLAPSED: Minimal Dots ── */
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 1.5, gap: 0.25 }}>
                  {tocGroups.map((group) => (
                    <React.Fragment key={group.year}>
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.55rem', fontWeight: 800, color: COLORS.textMuted, my: 0.5, letterSpacing: '0.04em' }}>
                        {String(group.year).slice(-2)}
                      </Typography>
                      {group.records.map((entry) => {
                        const isActive = activeRecordIndex === entry.index;
                        const dotColor = getRecordColor(entry.recordType);
                        return (
                          <Tooltip key={entry.index} title={`${entry.dateLabel} — ${entry.diagnosis}`} placement="right" arrow>
                            <Box onClick={() => scrollToRecord(entry.index)} sx={{
                              width: 8, height: 8, borderRadius: '50%', my: 0.3,
                              bgcolor: isActive ? COLORS.brand : 'transparent',
                              border: `2px solid ${isActive ? COLORS.brand : COLORS.border}`,
                              cursor: 'pointer', transition: 'all 0.15s ease',
                              '&:hover': { transform: 'scale(1.5)', bgcolor: COLORS.brand },
                            }} />
                          </Tooltip>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        )}

        {/* ── CENTER: Clinical Records (60%) ── */}
        <Box ref={timelineScrollRef} sx={{ flex: 7, overflowY: 'auto', bgcolor: COLORS.surface, borderRight: `1px solid ${COLORS.borderLight}` }}>
          <Box sx={{ py: 2, px: 3 }}>

            {/* T4.13: ACTIVE PROBLEMS — persistent section above timeline.
                 Renders only when the pet has active/monitoring conditions.
                 Shows severity, diagnosis date, severity progression, and resolved history. */}
            {petActiveProblems.length > 0 && (
              <Box sx={{
                bgcolor: COLORS.kpiOrangeBg,
                border: `1px solid ${COLORS.kpiOrangeBorder}`,
                borderRadius: 0,
                mb: 2,
                overflow: 'hidden',
              }}>
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1,
                  px: 2, py: 1,
                  borderBottom: `1px solid ${COLORS.kpiOrangeBorder}`,
                  bgcolor: COLORS.kpiOrangeBg,
                }}>
                  <WarningAmberIcon sx={{ fontSize: 14, color: COLORS.warning }} />
                  <Typography sx={{
                    fontFamily: FONT, ...TYPE.label,
                    color: COLORS.warning, flex: 1,
                  }}>
                    Active Problems ({petActiveProblems.length})
                  </Typography>
                  {petResolvedProblems.length > 0 && (
                    <Typography
                      onClick={() => setShowProblemHistory((prev) => !prev)}
                      sx={{
                        fontFamily: FONT, fontSize: '0.68rem', fontWeight: 700,
                        color: COLORS.textMuted, cursor: 'pointer',
                        '&:hover': { color: COLORS.accent },
                      }}
                    >
                      {showProblemHistory ? 'Hide history' : `${petResolvedProblems.length} resolved`}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ px: 2, py: 1.5 }}>
                  {petActiveProblems.map((p) => {
                    const sinceDate = p.diagnosedAt?.toDate
                      ? p.diagnosedAt.toDate().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                      : '';
                    const hasHistory = (p.severityHistory || []).length > 1;
                    return (
                      <Box key={p.id} sx={{
                        display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.75,
                        borderBottom: `1px solid ${COLORS.borderLight}`,
                        '&:last-child': { borderBottom: 'none' },
                      }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{
                            fontFamily: FONT, fontSize: '0.85rem', fontWeight: 700, color: COLORS.brand,
                          }}>
                            {p.name}
                            {p.severity && (
                              <Typography component="span" sx={{
                                fontFamily: FONT, fontSize: '0.75rem', fontWeight: 600,
                                color: COLORS.warning, ml: 1,
                              }}>
                                ({p.severity})
                              </Typography>
                            )}
                          </Typography>
                          <Typography sx={{
                            fontFamily: FONT, fontSize: '0.72rem', fontWeight: 600,
                            color: COLORS.textMuted,
                          }}>
                            Since {sinceDate}
                            {p.status === 'monitoring' && (
                              <Chip
                                label="MONITORING"
                                size="small"
                                sx={{
                                  fontFamily: FONT, fontWeight: 700, fontSize: '0.6rem',
                                  bgcolor: COLORS.kpiBlueBg, color: COLORS.info,
                                  borderRadius: 0, height: 16, ml: 1,
                                }}
                              />
                            )}
                          </Typography>
                          {/* Severity progression timeline — shown when more than one entry */}
                          {hasHistory && (
                            <Box sx={{ mt: 0.5 }}>
                              {(p.severityHistory || []).map((sh, i) => {
                                const shDate = sh.date?.toDate
                                  ? sh.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                  : '';
                                return (
                                  <Typography key={i} sx={{
                                    fontFamily: FONT, fontSize: '0.65rem', fontWeight: 600,
                                    color: COLORS.textMuted, fontStyle: 'italic',
                                  }}>
                                    {sh.severity} — {shDate}
                                  </Typography>
                                );
                              })}
                            </Box>
                          )}
                        </Box>
                      </Box>
                    );
                  })}

                  {/* Resolved problems — behind toggle */}
                  {showProblemHistory && petResolvedProblems.length > 0 && (
                    <Box sx={{ mt: 1.5, pt: 1, borderTop: `1px dashed ${COLORS.borderLight}` }}>
                      <Typography sx={{
                        fontFamily: FONT, fontSize: '0.65rem', fontWeight: 800,
                        color: COLORS.textMuted, textTransform: 'uppercase',
                        letterSpacing: '0.06em', mb: 0.5,
                      }}>
                        Resolved
                      </Typography>
                      {petResolvedProblems.map((p) => {
                        const resolvedDate = p.resolvedAt?.toDate
                          ? p.resolvedAt.toDate().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                          : '';
                        return (
                          <Typography key={p.id} sx={{
                            fontFamily: FONT, fontSize: '0.78rem', fontWeight: 600,
                            color: COLORS.textMuted, textDecoration: 'line-through',
                            py: 0.25,
                          }}>
                            {p.name} — resolved {resolvedDate}
                          </Typography>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              </Box>
            )}

            {processedHistory.length > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                <Button size="small" startIcon={allExpanded ? <UnfoldLessIcon sx={{ fontSize: '14px !important' }}/> : <UnfoldMoreIcon sx={{ fontSize: '14px !important' }}/>}
                  onClick={allExpanded ? collapseAll : expandAll}
                  sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.75rem', textTransform: 'none', color: COLORS.textMuted, '&:hover': { bgcolor: COLORS.panelBg } }}>
                  {allExpanded ? 'Collapse All' : 'Expand All'}
                </Button>
              </Box>
            )}

            {history.length === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: COLORS.textMuted, py: 10 }}>
                <AssignmentIcon sx={{ fontSize: 52, mb: 2, opacity: 0.2 }} />
                <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.95rem', color: COLORS.textSecondary }}>No Clinical Records</Typography>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontStyle: 'italic' }}>Use "Add Record" to create the first entry.</Typography>
              </Box>
            ) : processedHistory.length === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: COLORS.textMuted, py: 10 }}>
                <SearchIcon sx={{ fontSize: 52, mb: 2, opacity: 0.2 }} />
                <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.95rem', color: COLORS.textSecondary }}>No Matching Records</Typography>
                <Button size="small" sx={{ mt: 1.5, fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', textTransform: 'none', color: COLORS.accent }} onClick={() => { setTimelineSearch(''); setTimelineFilter('All'); }}>Clear Filters</Button>
              </Box>
            ) : processedHistory.map((rec, index) => {
              const isExpanded = expandedRecords.has(index);
              const rc = getRecordColor(rec.recordType);
              const dateStr = rec.date?.toDate ? rec.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
              const hasS = rec.soap?.subjective, hasO = hasExamData(rec.objectiveExam) || rec.soap?.objectiveNotes || rec.soap?.objective, hasT = rec.treatment;
              const rv = resolveVitals(rec);
              const hasV = rv.weight || rv.temp || rv.hr || rv.rr != null || rv.crt != null || rv.bcs != null || rv.pain != null;
              const hasRx = (rec.dispensedProducts || rec.prescriptions)?.length > 0;

              // Determine if we need a sticky year header before this record
              const recDate = rec.date?.toDate ? rec.date.toDate() : null;
              const recYear = recDate?.getFullYear();
              const prevRec = processedHistory[index - 1];
              const prevDate = prevRec?.date?.toDate ? prevRec.date.toDate() : null;
              const prevYear = prevDate?.getFullYear();
              const showYearHeader = index === 0 || recYear !== prevYear;

              return (
                <Box key={rec.id || index} ref={el => recordRefs.current[index] = el} data-record-index={index} sx={{ mb: 1 }}>
                  {showYearHeader && (
                    <Box sx={{ position: 'sticky', top: 0, zIndex: 2, bgcolor: COLORS.surface, py: 0.75, mb: 0.5 }}>
                      <Typography component="div" sx={{ fontFamily: FONT, fontSize: '0.72rem', fontWeight: 800, color: COLORS.accent, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ flex: 1, height: 1, bgcolor: COLORS.border }} />
                        {recYear || '—'}
                        <Box sx={{ flex: 1, height: 1, bgcolor: COLORS.border }} />
                      </Typography>
                    </Box>
                  )}
                  {/* Header Row — High-Density Clinical Command Center */}
                  <Box onClick={() => toggleRecord(index)} sx={{
                    display: 'flex', alignItems: 'center', gap: 2, py: 1.5, px: 2,
                    bgcolor: isExpanded ? COLORS.cardBg : 'transparent',
                    borderRadius: 0,
                    border: isExpanded ? `1px solid ${COLORS.border}` : '1px solid transparent',
                    borderBottom: isExpanded ? 'none' : '1px solid transparent',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    '&:hover': { bgcolor: isExpanded ? COLORS.cardBg : COLORS.borderLight },
                  }}>
                    {/* Vertical indicator removed for minimalist aesthetic */}
                    
                    {/* FORENSIC METADATA STRIP */}
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 800, color: COLORS.textPrimary, minWidth: 100, flexShrink: 0 }}>
                      {dateStr.toUpperCase()}
                    </Typography>

                    <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 700, color: COLORS.textSecondary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {rec.vetName || 'ATTENDING CLINICIAN'}
                    </Typography>

                    {/* T2.457: Case-day badge for multi-day cases */}
                    {caseDayMap[rec.id] && (
                      <Box sx={{ 
                        px: 1, py: 0.25, 
                        bgcolor: caseDayMap[rec.id].caseDay === 1 ? COLORS.chipBlueBg : COLORS.warningSurface,
                        border: `1px solid ${caseDayMap[rec.id].caseDay === 1 ? COLORS.medical : COLORS.warning}`,
                        flexShrink: 0 
                      }}>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 900, color: caseDayMap[rec.id].caseDay === 1 ? COLORS.medical : COLORS.warning, textTransform: 'uppercase' }}>
                          DAY {caseDayMap[rec.id].caseDay}
                        </Typography>
                      </Box>
                    )}

                    {/* STATUS ICONS */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 'auto' }}>
                      {/* Vitals strip removed for simplicity */}
                      {/* SEALED indicator removed */}
                      {rec.legal?.isLocked === true && rec.appointmentId && (
                        <Button
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAmendTargetApptId(rec.appointmentId);
                            setAmendDialogOpen(true);
                          }}
                          sx={{
                            fontFamily: FONT, fontWeight: 900, fontSize: '0.62rem', textTransform: 'uppercase',
                            color: COLORS.warning, borderRadius: 0, py: 0.25, px: 1, minWidth: 0,
                            border: `1px solid ${COLORS.warning}`,
                            '&:hover': { bgcolor: COLORS.warningSurface },
                          }}
                        >
                          Amend
                        </Button>
                      )}
                      <Box sx={{ color: COLORS.accent }}>{isExpanded ? <ExpandLessIcon sx={{ fontSize: 20 }}/> : <ExpandMoreIcon sx={{ fontSize: 20 }}/>}</Box>
                    </Box>
                  </Box>


                  {/* Expanded Body — Clinical Command Center */}
                  <Collapse in={isExpanded} timeout={200}>
                    <Box sx={{ bgcolor: COLORS.cardBg, px: 3, pb: 3, pt: 2, border: `1px solid ${COLORS.border}`, borderTop: `1px solid ${COLORS.borderLight}`, borderRadius: 0 }}>
                      
                      {/* T4.194: Typographic Memo Section (Services & Staff) */}
                      <Box sx={{ mb: 2.5 }}>
                        {(() => {
                          const svcNames = [...(rec.serviceNames?.length > 0 ? rec.serviceNames : [rec.serviceType || rec.recordType || 'medical'])].sort();
                          const servicesText = svcNames.join(', ').toUpperCase();
                          
                          const attrs = (rec.serviceAttribution || []).filter(a => a.staffName);
                          const uniquePerformers = [...new Set(attrs.map(a => a.staffName))];
                          const staffText = uniquePerformers.length > 0 
                            ? uniquePerformers.join(', ').toUpperCase() 
                            : `${rec.vetName || 'ATTENDING CLINICIAN'} (ATTENDING)`;

                          return (
                            <Stack spacing={0.5}>
                              <Box sx={{ display: 'flex', gap: 1.5 }}>
                                <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.textMuted, width: 70, letterSpacing: 1 }}>SERVICES</Typography>
                                <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', fontWeight: 700, color: COLORS.textPrimary, flex: 1 }}>{servicesText}</Typography>
                              </Box>
                              <Box sx={{ display: 'flex', gap: 1.5 }}>
                                <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.textMuted, width: 70, letterSpacing: 1 }}>STAFF</Typography>
                                <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', fontWeight: 700, color: COLORS.textPrimary, flex: 1 }}>{staffText}</Typography>
                              </Box>
                            </Stack>
                          );
                        })()}
                      </Box>

                      {/* T4.194: Borderless Vitals Stream */}
                      {hasV && (
                        <Box sx={{ py: 1.5, borderTop: `1px dashed ${COLORS.border}`, borderBottom: `1px dashed ${COLORS.border}`, mb: 3, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {[
                            { label: 'WT',   value: rv.weight, unit: 'kg' },
                            { label: 'TEMP', value: rv.temp,   unit: '°C' },
                            { label: 'HR',   value: rv.hr,     unit: 'bpm' },
                            { label: 'RR',   value: rv.rr,     unit: 'br/m' },
                            { label: 'CRT',  value: rv.crt,    unit: 's' },
                            { label: 'BCS',  value: rv.bcs,    unit: '/9' },
                            { label: 'PAIN', value: rv.pain,   unit: '/10' },
                          ].filter(v => v.value != null && v.value !== '').map(({ label, value, unit }) => (
                            <Box key={label} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                              <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.textMuted }}>{label}</Typography>
                              <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', fontWeight: 800, color: COLORS.textPrimary }}>
                                {value}<span style={{ fontSize: '0.7rem', fontWeight: 600, color: COLORS.textMuted, marginLeft: 2 }}>{unit}</span>
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      )}

                      {/* MAIN CLINICAL GRID (6:6) */}
                      <Grid container spacing={4}>
                        {/* LEFT COLUMN: HISTORY & EXAM */}
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Stack spacing={3}>
                            {/* Subjective */}
                            <Box>
                              <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.textPrimary, mb: 2, textTransform: 'uppercase', letterSpacing: 2, borderBottom: `3px solid ${COLORS.brand}`, width: 'fit-content', pb: 0.5 }}>S — SUBJECTIVE</Typography>
                              <Box sx={{ height: 200, overflowY: 'auto', pr: 1, '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.border, borderRadius: 0 } }}>
                                <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', color: hasS ? COLORS.textPrimary : COLORS.textMuted, fontStyle: hasS ? 'normal' : 'italic', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                  {hasS ? rec.soap.subjective : '— No subjective notes recorded —'}
                                </Typography>
                              </Box>
                            </Box>
                            
                            {/* Objective */}
                            <Box>
                              <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.textPrimary, mb: 2, textTransform: 'uppercase', letterSpacing: 2, borderBottom: `3px solid ${COLORS.brand}`, width: 'fit-content', pb: 0.5 }}>O — OBJECTIVE</Typography>
                              <Box sx={{ height: 200, overflowY: 'auto', pr: 1, '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.border, borderRadius: 0 } }}>
                                <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', color: hasO ? COLORS.textPrimary : COLORS.textMuted, fontStyle: hasO ? 'normal' : 'italic', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                  {hasO ? resolveObjectiveText(rec) : '— No objective exam recorded —'}
                                </Typography>
                              </Box>
                            </Box>
                          </Stack>
                        </Grid>

                        {/* RIGHT COLUMN: ASSESSMENT & PLAN */}
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Stack spacing={3}>
                            {/* Assessment */}
                            <Box>
                              <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.textPrimary, mb: 2, textTransform: 'uppercase', letterSpacing: 2, borderBottom: `3px solid ${COLORS.brand}`, width: 'fit-content', pb: 0.5 }}>A — ASSESSMENT</Typography>
                              <Box sx={{ height: 200, overflowY: 'auto', pr: 1, '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.border, borderRadius: 0 } }}>
                                {(rec.diagnoses?.length > 0) ? (
                                  <Stack spacing={1} sx={{ mb: 1.5 }}>
                                    {rec.diagnoses.map((dx, i) => (
                                      <Box key={dx.catalogId || i}>
                                        <Typography sx={{ fontFamily: FONT, fontSize: '1.05rem', fontWeight: 900, color: COLORS.textPrimary, lineHeight: 1.2 }}>
                                          • {dx.name.toUpperCase()}
                                          {dx.severity && (
                                            <Typography component="span" sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 900, color: COLORS.warning, ml: 1, textTransform: 'uppercase' }}>
                                              [{dx.severity}]
                                            </Typography>
                                          )}
                                        </Typography>
                                        {dx.notes && <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textPrimary, fontStyle: 'italic', ml: 2, mt: 0.25, opacity: 0.85 }}>{dx.notes}</Typography>}
                                      </Box>
                                    ))}
                                  </Stack>
                                ) : rec.diagnosis ? (
                                  <Typography sx={{ fontFamily: FONT, fontSize: '1.05rem', fontWeight: 900, color: COLORS.textPrimary, mb: 1 }}>
                                    {rec.diagnosis.toUpperCase()}
                                  </Typography>
                                ) : null}
                                {(rec.patientStatus || rec.soap?.prognosis) && (
                                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1.5 }}>
                                    {rec.patientStatus && (
                                      <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 900, color: COLORS.medical, bgcolor: `${COLORS.medical}12`, px: 1, py: 0.25 }}>
                                        STATUS: {rec.patientStatus.toUpperCase()}
                                      </Typography>
                                    )}
                                    {rec.soap?.prognosis && (
                                      <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 900, color: COLORS.accent, bgcolor: `${COLORS.accent}12`, px: 1, py: 0.25 }}>
                                        PROGNOSIS: {rec.soap.prognosis.toUpperCase()}
                                      </Typography>
                                    )}
                                  </Box>
                                )}
                                {(rec.assessmentNotes || rec.soap?.assessment) && (
                                  <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', color: COLORS.textPrimary, whiteSpace: 'pre-wrap', fontStyle: 'italic', lineHeight: 1.6 }}>
                                    {rec.assessmentNotes || rec.soap.assessment}
                                  </Typography>
                                )}
                              </Box>
                            </Box>

                            {/* Plan */}
                            <Box>
                              <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.textPrimary, mb: 2, textTransform: 'uppercase', letterSpacing: 2, borderBottom: `3px solid ${COLORS.brand}`, width: 'fit-content', pb: 0.5 }}>P — PLAN</Typography>
                              <Box sx={{ height: 200, overflowY: 'auto', pr: 1, '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.border, borderRadius: 0 } }}>
                                <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', color: hasT ? COLORS.textPrimary : COLORS.textMuted, fontStyle: hasT ? 'normal' : 'italic', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                  {hasT ? rec.treatment : '— No clinical plan recorded —'}
                                </Typography>
                              </Box>
                            </Box>
                          </Stack>
                        </Grid>
                      </Grid>

                      {/* DIAGNOSTIC FINDINGS (LABS) */}
                      {rec.labResults?.length > 0 && (
                        <Box sx={{ mt: 4, pt: 3, borderTop: `1px solid ${COLORS.border}` }}>
                          <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.info, mb: 2, textTransform: 'uppercase', letterSpacing: 1.2, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <ScienceIcon sx={{ fontSize: 14 }} /> LAB RESULTS ({rec.labResults.length})
                          </Typography>
                          
                          <TableContainer component={Paper} sx={{ borderRadius: 0, border: `1px solid ${COLORS.border}`, boxShadow: 'none' }}>
                            <Table size="small">
                              <TableHead sx={{ bgcolor: COLORS.brand }}>
                                <TableRow>
                                  <TableCell sx={{ color: 'white', fontWeight: 900, fontSize: '0.65rem', py: 1 }}>TEST NAME</TableCell>
                                  <TableCell sx={{ color: 'white', fontWeight: 900, fontSize: '0.65rem', py: 1 }}>RESULT</TableCell>
                                  <TableCell sx={{ color: 'white', fontWeight: 900, fontSize: '0.65rem', py: 1 }}>STATUS</TableCell>
                                  <TableCell sx={{ color: 'white', fontWeight: 900, fontSize: '0.65rem', py: 1 }}>CLINICAL NOTES</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {rec.labResults.map((lab, i) => {
                                  const labStatus = (lab.status || 'normal').toLowerCase();
                                  const colorMap = { critical: COLORS.danger, abnormal: COLORS.warning, normal: COLORS.success };
                                  const statusColor = colorMap[labStatus] || COLORS.success;
                                  return (
                                    <TableRow key={i} sx={{ '&:nth-of-type(even)': { bgcolor: '#FAF8F5' } }}>
                                      <TableCell sx={{ py: 1.5 }}>
                                        <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 900, color: COLORS.brand }}>
                                          {lab.testName.toUpperCase()}
                                        </Typography>
                                        <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted }}>
                                          REF: {(() => {
                                            const sk = (pet?.species || '').toLowerCase().includes('cat') ? 'feline' : 'canine';
                                            const r = lab.referenceRange?.[sk] || lab.referenceRange;
                                            return Array.isArray(r) ? `${r[0]} - ${r[1]}` : (r || 'N/A');
                                          })()}{lab.unit ? ` ${lab.unit}` : ''}
                                        </Typography>
                                      </TableCell>
                                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 1000, color: COLORS.textPrimary }}>
                                        {lab.result}{lab.unit ? ` ${lab.unit}` : ''}
                                      </TableCell>
                                      <TableCell>
                                        <Box sx={{ display: 'inline-block', px: 1, py: 0.25, bgcolor: `${statusColor}12`, border: `1px solid ${statusColor}` }}>
                                          <Typography sx={{ fontFamily: FONT, fontSize: '0.6rem', fontWeight: 900, color: statusColor }}>
                                            {(lab.resultType === 'positive-negative' ? (labStatus === 'normal' ? 'NEGATIVE' : 'POSITIVE') : labStatus).toUpperCase()}
                                          </Typography>
                                        </Box>
                                      </TableCell>
                                      <TableCell sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textSecondary, fontStyle: 'italic' }}>
                                        {lab.notes || '—'}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </Box>
                      )}

                      {/* LOGISTICS & DISPENSING */}
                      {hasRx && (
                        <Box sx={{ mt: 4, pt: 3, borderTop: `1px solid ${COLORS.border}` }}>
                          <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.accent, mb: 2, textTransform: 'uppercase', letterSpacing: 2, borderBottom: `3px solid ${COLORS.accent}`, width: 'fit-content', pb: 0.5 }}>
                            ITEMS
                          </Typography>
                          {(() => {
                            const allRx = rec.dispensedProducts || rec.prescriptions || [];
                            const resolvePC = (rx) => rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
                            const groups = [
                              { label: 'MEDICATIONS', items: allRx.filter(rx => resolvePC(rx) === 'medicine'), color: COLORS.brand },
                              { label: 'MEDICAL SUPPLIES', items: allRx.filter(rx => resolvePC(rx) === 'medical_supply'), color: COLORS.brand },
                              { label: 'RETAIL & OTHER', items: allRx.filter(rx => !['medicine', 'medical_supply'].includes(resolvePC(rx))), color: COLORS.brand },
                            ];
                            return (
                              <Stack spacing={2.5}>
                                {groups.filter(g => g.items.length > 0).map((g, gi) => (
                                  <Box key={gi}>
                                    <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', fontWeight: 900, color: g.color, mb: 1, borderBottom: `1px solid ${g.color}33`, pb: 0.5, width: 'fit-content' }}>
                                      {g.label}
                                    </Typography>
                                    <Stack spacing={1}>
                                      {g.items.map((it, ii) => (
                                        <Box key={ii} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                                          <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', fontWeight: 800, color: COLORS.textPrimary, minWidth: 200 }}>
                                            • {it.name.toUpperCase()} {it.qty ? `[x${it.qty}]` : ''}
                                          </Typography>
                                          <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textSecondary, flex: 1 }}>
                                            {it.instructions || '—'}
                                          </Typography>
                                        </Box>
                                      ))}
                                    </Stack>
                                  </Box>
                                ))}
                              </Stack>
                            );
                          })()}
                        </Box>
                      )}

                      {/* MOBILE-PARITY DISCHARGE NOTES */}
                      {rec.dischargeSummary && (
                        <Box sx={{ mt: 5, pt: 4, borderTop: `2px dashed ${COLORS.border}`, bgcolor: `${COLORS.cream}33`, mx: -3, px: 3 }}>
                          <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.brand, mb: 2, textTransform: 'uppercase', letterSpacing: 2, borderBottom: `3px solid ${COLORS.brand}`, width: 'fit-content', pb: 0.5 }}>
                            DISCHARGE NOTES
                          </Typography>
                          
                          <Stack spacing={4}>
                            <Box>
                              <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', color: COLORS.textPrimary, lineHeight: 1.6 }}>
                                {rec.dischargeSummary.instructions || 'No discharge notes recorded for this visit.'}
                              </Typography>
                            </Box>

                            {/* MEDICATIONS SECTION (MOBILE PARITY) */}
                            {(() => {
                              const allRx = rec.dispensedProducts || rec.prescriptions || [];
                              const resolvePC = (rx) => rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
                              const medItems = allRx.filter(rx => resolvePC(rx) === 'medicine');
                              if (medItems.length === 0) return null;
                              return (
                                <Box sx={{ mt: 2, pt: 2, borderTop: `1px dashed ${COLORS.border}` }}>
                                  <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.brand, mb: 2, textTransform: 'uppercase', letterSpacing: 2, borderBottom: `3px solid ${COLORS.brand}`, width: 'fit-content', pb: 0.5 }}>
                                    MEDICATIONS
                                  </Typography>
                                  <Stack spacing={1.5}>
                                    {medItems.map((it, ii) => (
                                      <Box key={ii}>
                                        <Typography sx={{ fontFamily: FONT, fontSize: '0.9rem', fontWeight: 900, color: COLORS.textPrimary }}>
                                          • {it.name.toUpperCase()} {it.qty ? `x${it.qty}` : ''}
                                        </Typography>

                                        {/* T4.117: Structured Sig Order Tags (Smart Parity) */}
                                        {it.sig && (it.sig.dose || it.sig.frequency || it.sig.route) && (
                                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, ml: 2, mt: 0.5, mb: 0.5 }}>
                                            {[
                                              it.sig.dose ? `DOSE: ${it.sig.dose} ${it.sig.unit || ''}` : '',
                                              it.sig.route ? `ROUTE: ${it.sig.route}` : '',
                                              it.sig.frequency ? `FREQ: ${it.sig.frequency}` : '',
                                              it.sig.duration ? `DUR: ${it.sig.duration}D` : ''
                                            ].filter(Boolean).map((tag, idx) => (
                                              <Typography key={idx} sx={{ 
                                                fontFamily: 'monospace', fontSize: '0.6rem', fontWeight: 900, 
                                                color: COLORS.medical, bgcolor: `${COLORS.medical}12`, 
                                                px: 0.6, py: 0.1, border: `1px solid ${COLORS.medical}33`
                                              }}>
                                                {tag}
                                              </Typography>
                                            ))}
                                          </Box>
                                        )}

                                        {it.instructions && (
                                          <Box sx={{ ml: 2, mt: 0.25 }}>
                                            <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, fontStyle: 'italic' }}>
                                              Directions (Sig):
                                            </Typography>
                                            <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textSecondary, fontStyle: 'italic' }}>
                                              {it.instructions.replace(/^Directions \(Sig\):\s*/i, '')}
                                            </Typography>
                                          </Box>
                                        )}
                                      </Box>
                                    ))}
                                  </Stack>
                                </Box>
                              );
                            })()}

                            <Box sx={{ mt: 2, pt: 2, borderTop: `1px dashed ${COLORS.border}` }}>
                              <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.brand, mb: 2, textTransform: 'uppercase', letterSpacing: 2, borderBottom: `3px solid ${COLORS.brand}`, width: 'fit-content', pb: 0.5 }}>
                                NEXT STEPS
                              </Typography>
                              <Typography sx={{ fontFamily: FONT, fontSize: '0.95rem', color: COLORS.textPrimary }}>
                                Recheck in: <strong>{rec.dischargeSummary.recheckIn || 'As Needed'}</strong>
                              </Typography>
                              {rec.dischargeSummary.nextVisit && (
                                <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textSecondary, mt: 0.5 }}>
                                  Scheduled Visit: {new Date(rec.dischargeSummary.nextVisit.toDate ? rec.dischargeSummary.nextVisit.toDate() : rec.dischargeSummary.nextVisit).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </Typography>
                              )}
                            </Box>

                            <Box sx={{ alignSelf: 'flex-end', textAlign: 'right', minWidth: 250 }}>
                              <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', fontWeight: 700, color: COLORS.textMuted, fontStyle: 'italic', mb: 1 }}>SIGNED BY</Typography>
                              <Typography sx={{ fontFamily: FONT, fontSize: '1.1rem', fontWeight: 900, color: COLORS.brand }}>
                                {rec.dischargeSummary.vetName?.toUpperCase() || 'ATTENDING VETERINARIAN'}
                              </Typography>
                              <Box sx={{ height: 1.5, bgcolor: COLORS.brand, mt: 1, mb: 0.5, width: '100%' }} />
                              <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.textMuted, letterSpacing: 1.5 }}>ATTENDING VETERINARIAN</Typography>
                            </Box>
                          </Stack>
                        </Box>
                      )}

                      {/* ATTACHMENTS FOOTER */}
                      {rec.attachments?.length > 0 && (
                        <Box sx={{ mt: 4, pt: 2, display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>

                                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <AttachFileIcon sx={{ fontSize: 13 }} />
                                  Attachments ({rec.attachments.length})
                                </Typography>
                                <Stack spacing={0.75}>
                                  {rec.attachments.map((file, i) => {
                                    const isImage = file.mimeType?.startsWith('image/');
                                    const typeColors = {
                                      'lab-report':     { bg: COLORS.kpiBlueBg,   color: COLORS.medical },
                                      'clinical-photo': { bg: COLORS.kpiGreenBg,  color: COLORS.success },
                                      'referral':       { bg: COLORS.kpiPurpleBg, color: COLORS.kpiPurpleText },
                                      'other':          { bg: COLORS.kpiOrangeBg, color: COLORS.warning },
                                    };
                                    const tc = typeColors[file.type] || typeColors['other'];
                                    return (
                                      <Box
                                        key={i}
                                        component="a"
                                        href={file.url || file}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        sx={{
                                          display: 'flex', alignItems: 'center', gap: 1, p: 0.75,
                                          bgcolor: COLORS.formBg, border: `1px solid ${COLORS.borderLight}`,
                                          textDecoration: 'none', cursor: 'pointer',
                                          '&:hover': { bgcolor: COLORS.borderLight },
                                        }}
                                      >
                                        {isImage ? (
                                          <Box component="img" src={file.url} sx={{ width: 36, height: 36, objectFit: 'cover', border: `1px solid ${COLORS.border}`, flexShrink: 0 }} />
                                        ) : (
                                          <PictureAsPdfIcon sx={{ fontSize: 28, color: COLORS.danger, flexShrink: 0 }} />
                                        )}
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                          <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700, color: COLORS.medical, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {file.label || file.name || `Attachment ${i + 1}`}
                                          </Typography>
                                        </Box>
                                        {file.type && (
                                          <Chip
                                            label={file.type.replace('-', ' ')}
                                            size="small"
                                            sx={{ height: 16, fontSize: '0.5rem', fontWeight: 900, borderRadius: 0, bgcolor: tc.bg, color: tc.color, textTransform: 'uppercase', flexShrink: 0 }}
                                          />
                                        )}
                                        {file.clientVisible && (
                                          <Chip
                                            label="Shared"
                                            size="small"
                                            sx={{ height: 16, fontSize: '0.5rem', fontWeight: 900, borderRadius: 0, bgcolor: '#E8F5E9', color: COLORS.success, flexShrink: 0 }}
                                          />
                                        )}
                                      </Box>
                                    );
                                  })}
                                </Stack>
                              </Box>
                            )}

                      {/* Clinical Amendments (T2.453) */}
                      {rec.amendments?.length > 0 && (
                        <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px dashed ${COLORS.borderLight}` }}>
                          <Typography sx={{
                            fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 1,
                            display: 'flex', alignItems: 'center', gap: 0.5
                          }}>
                            <ShieldIcon sx={{ fontSize: 13, color: COLORS.warning }} />
                            AMENDMENTS ({rec.amendments.length})
                          </Typography>
                          <Stack spacing={1}>
                            {[...rec.amendments]
                              .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0))
                              .map((amend, idx) => {
                                const ts = amend.timestamp?.toDate
                                  ? amend.timestamp.toDate()
                                  : (amend.timestamp?.seconds ? new Date(amend.timestamp.seconds * 1000) : null);
                                const metaLine = `${amend.vetName || 'Clinician'}${ts ? ` — ${ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}`;

                                // T3.99: Structured amendment — render mini SOAP card
                                if (amend.type === 'structured') {
                                  return (
                                    <Box key={idx} sx={{
                                      pl: 1.5, borderLeft: `3px solid ${COLORS.warning}`,
                                      bgcolor: COLORS.warningSurface, py: 1, px: 1.5,
                                    }}>
                                      <Typography sx={{
                                        fontFamily: FONT, fontSize: '0.7rem', fontWeight: 700,
                                        color: COLORS.warning, textTransform: 'uppercase', mb: 0.5,
                                      }}>
                                        AMENDMENT: {amend.reason}
                                      </Typography>

                                      {/* Mini SOAP grid — only non-empty fields */}
                                      <Stack spacing={0.5}>
                                        {[
                                          { key: 'subjective', label: 'S' },
                                          { key: 'objective',  label: 'O' },
                                          { key: 'assessment', label: 'A' },
                                          { key: 'plan',       label: 'P' },
                                        ].filter(({ key }) => amend.soap?.[key]).map(({ key, label }) => (
                                          <Box key={key}>
                                            <Typography sx={{ fontFamily: FONT, fontSize: '0.6rem', fontWeight: 900, color: COLORS.warning, textTransform: 'uppercase' }}>
                                              {label}
                                            </Typography>
                                            <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textPrimary, whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
                                              {amend.soap[key]}
                                            </Typography>
                                          </Box>
                                        ))}
                                      </Stack>

                                      {/* Vitals row — only if present and non-empty */}
                                      {amend.vitals && Object.values(amend.vitals).some(v => v) && (
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
                                          {[
                                            { label: 'Wt',   val: amend.vitals.weight ? `${amend.vitals.weight} kg` : null },
                                            { label: 'Temp', val: amend.vitals.temp   ? `${amend.vitals.temp} °C`   : null },
                                            { label: 'HR',   val: amend.vitals.hr     ? `${amend.vitals.hr} bpm`    : null },
                                            { label: 'RR',   val: amend.vitals.rr     ? `${amend.vitals.rr} rpm`    : null },
                                            { label: 'CRT',  val: amend.vitals.crt    ? `${amend.vitals.crt}s`      : null },
                                            { label: 'BCS',  val: amend.vitals.bcs    ? `${amend.vitals.bcs}/9`     : null },
                                            { label: 'Pain', val: amend.vitals.pain   ? `${amend.vitals.pain}/4`    : null },
                                          ].filter(e => e.val).map(({ label, val }) => (
                                            <Box key={label} sx={{ px: 0.75, py: 0.4, bgcolor: COLORS.warningSurface, border: `1px solid ${COLORS.warning}`, minWidth: 48, textAlign: 'center' }}>
                                              <Typography sx={{ fontFamily: FONT, fontSize: '0.55rem', fontWeight: 900, color: COLORS.warning, textTransform: 'uppercase' }}>{label}</Typography>
                                              <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', fontWeight: 700, color: COLORS.textPrimary }}>{val}</Typography>
                                            </Box>
                                          ))}
                                        </Box>
                                      )}

                                      {/* Added medications — if present */}
                                      {amend.addedMedications?.length > 0 && (
                                        <Box sx={{ mt: 0.75 }}>
                                          <Typography sx={{ fontFamily: FONT, fontSize: '0.6rem', fontWeight: 900, color: COLORS.warning, textTransform: 'uppercase', mb: 0.25 }}>
                                            Added Medications
                                          </Typography>
                                          {amend.addedMedications.map((med, i) => (
                                            <Typography key={i} sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textPrimary }}>
                                              {med.name}{med.qty ? ` x${med.qty}` : ''}{med.instructions ? ` — ${med.instructions}` : ''}
                                            </Typography>
                                          ))}
                                        </Box>
                                      )}

                                      <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.textMuted, mt: 0.5 }}>
                                        {metaLine}
                                      </Typography>
                                    </Box>
                                  );
                                }

                                // Legacy text blob — unchanged rendering
                                return (
                                  <Box key={idx} sx={{
                                    pl: 1.5, borderLeft: `3px solid ${COLORS.warning}`,
                                    bgcolor: COLORS.cream, py: 1, px: 1.5,
                                  }}>
                                    {amend.reason && (
                                      <Typography sx={{
                                        fontFamily: FONT, fontSize: '0.7rem', fontWeight: 700,
                                        color: COLORS.warning, textTransform: 'uppercase', mb: 0.25
                                      }}>
                                        Reason: {amend.reason}
                                      </Typography>
                                    )}
                                    <Typography sx={{
                                      fontFamily: FONT, ...TYPE.body, color: COLORS.textPrimary,
                                      whiteSpace: 'pre-wrap'
                                    }}>
                                      {amend.text}
                                    </Typography>
                                    <Typography sx={{
                                      fontFamily: FONT, fontSize: '0.7rem', color: COLORS.textMuted, mt: 0.5
                                    }}>
                                      {metaLine}
                                    </Typography>
                                  </Box>
                                );
                              }) }
                          </Stack>
                        </Box>
                      )}


                      {/* T3.92: Inline vaccination details */}
                      {(rec.vaccineAdministrations?.length > 0 || rec.vaccineData?.vaccineName) && (() => {
                        const vaccines = rec.vaccineAdministrations || (rec.vaccineData ? [rec.vaccineData] : []);
                        return (
                          <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px dashed ${COLORS.borderLight}` }}>
                            <Typography sx={{
                              fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 1,
                              display: 'flex', alignItems: 'center', gap: 0.5,
                            }}>
                              <VaccinesIcon sx={{ fontSize: 13, color: COLORS.success }} />
                              Vaccination Details ({vaccines.length})
                            </Typography>
                            <Stack spacing={1}>
                              {vaccines.map((vax, i) => {
                                const rawDue = vax.dueDate;
                                const dueDateStr = rawDue
                                  ? (rawDue.toDate ? rawDue.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : String(rawDue))
                                  : null;
                                return (
                                  <Box key={i} sx={{ bgcolor: COLORS.kpiGreenBg, border: `1px solid ${COLORS.kpiGreenBorder}`, px: 1.5, py: 1, borderRadius: 0 }}>
                                    <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.success }}>
                                      {vax.vaccineName || 'Unknown Vaccine'}
                                    </Typography>
                                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 0.5 }}>
                                      {vax.manufacturer && (
                                        <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: COLORS.textSecondary }}>
                                          Mfr: {vax.manufacturer}
                                        </Typography>
                                      )}
                                      {vax.lotNumber && (
                                        <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: COLORS.textSecondary }}>
                                          Lot: {vax.lotNumber}
                                        </Typography>
                                      )}
                                      {vax.routeOfAdmin && (
                                        <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: COLORS.textSecondary }}>
                                          Route: {vax.routeOfAdmin}
                                        </Typography>
                                      )}
                                      {vax.siteOfInjection && (
                                        <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: COLORS.textSecondary }}>
                                          Site: {vax.siteOfInjection}
                                        </Typography>
                                      )}
                                      {dueDateStr && (
                                        <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: COLORS.textSecondary }}>
                                          Due: {dueDateStr}
                                        </Typography>
                                      )}
                                    </Box>
                                  </Box>
                                );
                              })}
                            </Stack>
                          </Box>
                        );
                      })()}

                      {/* T4.167: Compact action row — Print + Attachments + Rebook */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5, pt: 1, borderTop: `1px solid ${COLORS.borderLight}` }}>
                        <Button
                          size="small"
                          startIcon={<PrintIcon sx={{ fontSize: '14px !important' }} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrintMenuAnchor(e.currentTarget);
                            setPrintMenuRecord(rec);
                          }}
                          sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', textTransform: 'none', color: COLORS.accent }}
                        >
                          Print
                        </Button>
                        {rec.attachments?.length > 0 && (
                          <Button
                            size="small"
                            startIcon={<AttachFileIcon sx={{ fontSize: '14px !important' }} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              const attachEl = recordRefs.current[index]?.querySelector('[data-attachments]');
                              if (attachEl) attachEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            }}
                            sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', textTransform: 'none', color: COLORS.textSecondary }}
                          >
                            Attachments ({rec.attachments.length})
                          </Button>
                        )}
                        <Box sx={{ flex: 1 }} />
                        <Button
                          size="small"
                          disabled={isErased}
                          startIcon={<EventAvailableIcon sx={{ fontSize: '14px !important' }} />}
                          onClick={(e) => { e.stopPropagation(); setQuickBookOpen(true); }}
                          sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', textTransform: 'none', color: COLORS.success }}
                        >
                          Rebook
                        </Button>
                      </Box>
                    </Box>
                  </Collapse>
                  {!isExpanded && <Divider sx={{ mx: 2, borderColor: COLORS.borderLight }} />}
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* ── RIGHT: Analytics Panel (30%) ── */}
        <Box sx={{ flex: 3, maxWidth: 320, minWidth: 240, overflowY: 'auto', bgcolor: COLORS.surfaceAlt, py: 2, px: 2, '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.timelineRail, borderRadius: 2 } }}>

          {/* Weight Trend — T2.460: 1-point display + delta annotation */}
          <Widget title="Weight Trend" icon={<ScaleIcon sx={{ fontSize: 14, color: COLORS.accentLight }} />} onExpand={vitalsData.length > 1 ? () => setVitalsZoom({ open: true, key: 'weight' }) : undefined}>
            {vitalsData.length > 1 ? (
              <>
                <Box sx={{ width: '100%', height: 140, minWidth: 50 }}>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={vitalsData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.borderLight} />
                      <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} tick={{ fontSize: 10, fontFamily: FONT }} />
                      <YAxis tick={{ fontSize: 10, fontFamily: FONT }} domain={['dataMin - 1', 'dataMax + 1']} />
                      <RechartsTooltip contentStyle={{ fontSize: 11, fontFamily: FONT, borderRadius: 0, border: `1px solid ${COLORS.border}` }} labelFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
                      <Line type="monotone" dataKey="weight" stroke={COLORS.accentLight} strokeWidth={2.5} dot={{ r: 3.5, fill: COLORS.accentLight }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
                {/* Delta annotation between last two readings */}
                {(() => {
                  const last = vitalsData[vitalsData.length - 1]?.weight;
                  const prev = vitalsData[vitalsData.length - 2]?.weight;
                  if (last == null || prev == null) return null;
                  const delta = last - prev;
                  const sign = delta > 0 ? '+' : '';
                  const color = delta > 0 ? COLORS.success : delta < 0 ? COLORS.danger : COLORS.textMuted;
                  return (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', fontWeight: 700, color }}>
                        {sign}{delta.toFixed(1)} kg since last visit
                      </Typography>
                    </Box>
                  );
                })()}
              </>
            ) : vitalsData.length === 1 ? (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography sx={{ fontFamily: FONT, fontSize: '1.8rem', fontWeight: 900, color: COLORS.accentLight }}>
                  {vitalsData[0].weight} <span style={{ fontSize: '0.9rem', fontWeight: 600, color: COLORS.textMuted }}>kg</span>
                </Typography>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: COLORS.textMuted }}>
                  Recorded {vitalsData[0].date}
                </Typography>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.68rem', color: COLORS.textMuted, fontStyle: 'italic', mt: 0.5 }}>
                  Trend chart available after 2+ readings
                </Typography>
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 3, color: COLORS.textMuted }}>
                <ScaleIcon sx={{ fontSize: 28, opacity: 0.3, mb: 0.5 }} />
                <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontStyle: 'italic' }}>Insufficient data</Typography>
              </Box>
            )}
          </Widget>

          {/* Temperature Trend */}
          <Widget title="Temperature" icon={<ThermostatIcon sx={{ fontSize: 14, color: '#EF6C00' }} />} onExpand={tempData.length > 1 ? () => setVitalsZoom({ open: true, key: 'temp' }) : undefined}>
            {tempData.length > 1 ? (
              <>
                <Box sx={{ width: '100%', height: 110, minWidth: 50 }}>
                  <ResponsiveContainer width="100%" height={110}>
                    <LineChart data={tempData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.borderLight} />
                      <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} tick={{ fontSize: 10, fontFamily: FONT }} />
                      <YAxis tick={{ fontSize: 10, fontFamily: FONT }} domain={[37, 41]} />
                      <RechartsTooltip contentStyle={{ fontSize: 11, fontFamily: FONT, borderRadius: 0, border: `1px solid ${COLORS.border}` }} labelFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
                      <ReferenceLine y={SPECIES_VITAL_RANGES.temp[speciesKey][0]} stroke="#66BB6A" strokeDasharray="4 4" label={{ value: 'Low', fill: '#66BB6A', fontSize: 9, position: 'right' }} />
                      <ReferenceLine y={SPECIES_VITAL_RANGES.temp[speciesKey][1]} stroke="#66BB6A" strokeDasharray="4 4" label={{ value: 'High', fill: '#66BB6A', fontSize: 9, position: 'right' }} />
                      <Line type="monotone" dataKey="temp" stroke="#EF6C00" strokeWidth={2} dot={{ r: 3, fill: '#EF6C00' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
                {renderVitalsDelta(tempData, 'temp', '°C')}
              </>
            ) : (
              <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', py: 2 }}>No temperature data yet</Typography>
            )}
          </Widget>

          {/* Heart Rate Trend */}
          <Widget title="Heart Rate" icon={<FavoriteIcon sx={{ fontSize: 14, color: '#E53935' }} />} onExpand={hrData.length > 1 ? () => setVitalsZoom({ open: true, key: 'hr' }) : undefined}>
            {hrData.length > 1 ? (
              <>
                <Box sx={{ width: '100%', height: 110, minWidth: 50 }}>
                  <ResponsiveContainer width="100%" height={110}>
                    <LineChart data={hrData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.borderLight} />
                      <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} tick={{ fontSize: 10, fontFamily: FONT }} />
                      <YAxis tick={{ fontSize: 10, fontFamily: FONT }} domain={['dataMin - 10', 'dataMax + 10']} />
                      <RechartsTooltip contentStyle={{ fontSize: 11, fontFamily: FONT, borderRadius: 0, border: `1px solid ${COLORS.border}` }} labelFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
                      <ReferenceLine y={SPECIES_VITAL_RANGES.hr[speciesKey][0]} stroke="#66BB6A" strokeDasharray="4 4" label={{ value: 'Low', fill: '#66BB6A', fontSize: 9, position: 'right' }} />
                      <ReferenceLine y={SPECIES_VITAL_RANGES.hr[speciesKey][1]} stroke="#66BB6A" strokeDasharray="4 4" label={{ value: 'High', fill: '#66BB6A', fontSize: 9, position: 'right' }} />
                      <Line type="monotone" dataKey="hr" stroke="#E53935" strokeWidth={2} dot={{ r: 3, fill: '#E53935' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
                {renderVitalsDelta(hrData, 'hr', 'bpm')}
              </>
            ) : (
              <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', py: 2 }}>No heart rate data yet</Typography>
            )}
          </Widget>

          {/* Respiratory Rate Trend — T2.467 */}
          <Widget title="Resp. Rate" icon={<AccessTimeIcon sx={{ fontSize: 14, color: '#0288D1' }} />} onExpand={rrData.length > 1 ? () => setVitalsZoom({ open: true, key: 'rr' }) : undefined}>
            {rrData.length > 1 ? (
              <>
                <Box sx={{ width: '100%', height: 110, minWidth: 50 }}>
                  <ResponsiveContainer width="100%" height={110}>
                    <LineChart data={rrData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.borderLight} />
                      <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} tick={{ fontSize: 10, fontFamily: FONT }} />
                      <YAxis tick={{ fontSize: 10, fontFamily: FONT }} domain={[10, 50]} />
                      <RechartsTooltip contentStyle={{ fontSize: 11, fontFamily: FONT, borderRadius: 0, border: `1px solid ${COLORS.border}` }} labelFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
                      <ReferenceLine y={SPECIES_VITAL_RANGES.rr[speciesKey][0]} stroke="#66BB6A" strokeDasharray="4 4" label={{ value: 'Low', fill: '#66BB6A', fontSize: 9, position: 'right' }} />
                      <ReferenceLine y={SPECIES_VITAL_RANGES.rr[speciesKey][1]} stroke="#66BB6A" strokeDasharray="4 4" label={{ value: 'High', fill: '#66BB6A', fontSize: 9, position: 'right' }} />
                      <Line type="monotone" dataKey="rr" stroke="#0288D1" strokeWidth={2} dot={{ r: 3, fill: '#0288D1' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
                {renderVitalsDelta(rrData, 'rr', 'bpm')}
              </>
            ) : (
              <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', py: 2 }}>No respiratory rate data yet</Typography>
            )}
          </Widget>

          {/* CRT Trend */}
          <Widget title="Cap. Refill Time" icon={<AccessTimeIcon sx={{ fontSize: 14, color: '#00838F' }} />} onExpand={crtData.length > 1 ? () => setVitalsZoom({ open: true, key: 'crt' }) : undefined}>
            {crtData.length > 1 ? (
              <>
                <Box sx={{ width: '100%', height: 110, minWidth: 50 }}>
                  <ResponsiveContainer width="100%" height={110}>
                    <LineChart data={crtData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.borderLight} />
                      <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} tick={{ fontSize: 10, fontFamily: FONT }} />
                      <YAxis tick={{ fontSize: 10, fontFamily: FONT }} domain={[0, 5]} />
                      <RechartsTooltip contentStyle={{ fontSize: 11, fontFamily: FONT, borderRadius: 0, border: `1px solid ${COLORS.border}` }} labelFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
                      <ReferenceLine y={SPECIES_VITAL_RANGES.crt[speciesKey][0]} stroke="#66BB6A" strokeDasharray="4 4" label={{ value: 'Low', fill: '#66BB6A', fontSize: 9, position: 'right' }} />
                      <ReferenceLine y={SPECIES_VITAL_RANGES.crt[speciesKey][1]} stroke="#66BB6A" strokeDasharray="4 4" label={{ value: 'High', fill: '#66BB6A', fontSize: 9, position: 'right' }} />
                      <Line type="monotone" dataKey="crt" stroke="#00838F" strokeWidth={2} dot={{ r: 3, fill: '#00838F' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
                {renderVitalsDelta(crtData, 'crt', 's')}
              </>
            ) : (
              <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', py: 2 }}>No CRT data yet</Typography>
            )}
          </Widget>

          {/* BCS Trend — T2.468 */}
          <Widget title="Body Condition Score" icon={<ScaleIcon sx={{ fontSize: 14, color: COLORS.grooming }} />} onExpand={bcsData.length > 1 ? () => setVitalsZoom({ open: true, key: 'bcs' }) : undefined}>
            {bcsData.length > 1 ? (
              <>
                <Box sx={{ width: '100%', height: 110, minWidth: 50 }}>
                  <ResponsiveContainer width="100%" height={110}>
                    <LineChart data={bcsData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.borderLight} />
                      <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} tick={{ fontSize: 10, fontFamily: FONT }} />
                      <YAxis tick={{ fontSize: 10, fontFamily: FONT }} domain={[1, 9]} ticks={[1, 3, 5, 7, 9]} />
                      <RechartsTooltip contentStyle={{ fontSize: 11, fontFamily: FONT, borderRadius: 0, border: `1px solid ${COLORS.border}` }} labelFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
                      <ReferenceLine y={SPECIES_VITAL_RANGES.bcs[speciesKey][0]} stroke="#66BB6A" strokeDasharray="4 4" label={{ value: 'Low', fill: '#66BB6A', fontSize: 9, position: 'right' }} />
                      <ReferenceLine y={SPECIES_VITAL_RANGES.bcs[speciesKey][1]} stroke="#66BB6A" strokeDasharray="4 4" label={{ value: 'High', fill: '#66BB6A', fontSize: 9, position: 'right' }} />
                      <Line type="monotone" dataKey="bcs" stroke={COLORS.grooming} strokeWidth={2} dot={{ r: 3, fill: COLORS.grooming }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
                {renderVitalsDelta(bcsData, 'bcs', '/9')}
              </>
            ) : (
              <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', py: 2 }}>No BCS data yet</Typography>
            )}
          </Widget>

          {/* Pain Scale Trend — T2.469 */}
          <Widget title="Pain Scale" icon={<WarningAmberIcon sx={{ fontSize: 14, color: '#D84315' }} />} onExpand={painData.length > 1 ? () => setVitalsZoom({ open: true, key: 'pain' }) : undefined}>
            {painData.length > 1 ? (
              <>
                <Box sx={{ width: '100%', height: 110, minWidth: 50 }}>
                  <ResponsiveContainer width="100%" height={110}>
                    <LineChart data={painData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.borderLight} />
                      <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} tick={{ fontSize: 10, fontFamily: FONT }} />
                      <YAxis tick={{ fontSize: 10, fontFamily: FONT }} domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} />
                      <RechartsTooltip contentStyle={{ fontSize: 11, fontFamily: FONT, borderRadius: 0, border: `1px solid ${COLORS.border}` }} labelFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
                      <Line type="monotone" dataKey="pain" stroke="#D84315" strokeWidth={2} dot={{ r: 3, fill: '#D84315' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
                {renderVitalsDelta(painData, 'pain', '/10')}
              </>
            ) : (
              <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', py: 2 }}>No pain scale data yet</Typography>
            )}
          </Widget>

          {/* Visit Frequency */}
          <Widget title="Visit Frequency (6mo)" icon={<CalendarMonthIcon sx={{ fontSize: 14, color: COLORS.medical }} />}>
            <Box sx={{ width: '100%', height: 100, minWidth: 50 }}>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={visitFreqData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: FONT }} />
                  <YAxis tick={{ fontSize: 10, fontFamily: FONT }} allowDecimals={false} />
                  <RechartsTooltip contentStyle={{ fontSize: 11, fontFamily: FONT, borderRadius: 0, border: `1px solid ${COLORS.border}` }} />
                  <Bar dataKey="visits" fill={COLORS.accentLight} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Widget>

          {/* Active Prescriptions — T4.116: active/historical split with pin toggle */}
          <Widget
            title={`Prescriptions (${activeRx.length + historicalRx.length})`}
            icon={<MedicationIcon sx={{ fontSize: 14, color: COLORS.rxText }} />}
            onExpand={(activeRx.length + historicalRx.length) > 0 ? () => setRxZoom(true) : undefined}
          >
            {activeRx.length > 0 ? (
              <>
                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.75, letterSpacing: '0.05em' }}>
                  ACTIVE MEDICATIONS
                </Typography>
                <Stack spacing={1}>
                  {activeRx.map((rx, i) => (
                    <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.rxText }}>{rx.name}</Typography>
                          {rx.isPinned && (
                            <Tooltip title="Pinned — always shows as active">
                              <PushPinIcon sx={{ fontSize: 12, color: COLORS.warning, transform: 'rotate(45deg)' }} />
                            </Tooltip>
                          )}
                        </Box>
                        {rx.lastInstructions && (
                          <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: '#B45309' }}>{rx.lastInstructions}</Typography>
                        )}
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted }}>
                          {rx.firstShort !== rx.lastShort ? `${rx.firstShort} → ${rx.lastShort}` : rx.lastDate}
                        </Typography>
                        {rx.isPinned && (
                          <Typography sx={{ fontFamily: FONT, fontSize: '0.62rem', color: COLORS.textMuted, fontStyle: 'italic' }}>
                            pinned — last Rx {Math.round((Date.now() - rx.lastRawMs) / 86400000)}d ago
                          </Typography>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, ml: 1 }}>
                        <Chip
                          label={`${rx.count}x`}
                          size="small"
                          sx={{
                            fontFamily: FONT, fontSize: '0.62rem', fontWeight: 800,
                            height: 18, bgcolor: COLORS.kpiOrangeBg, color: COLORS.warning,
                            border: `1px solid ${COLORS.kpiOrangeBorder}`,
                            borderRadius: 0,
                          }}
                        />
                        <Tooltip title={rx.isPinned ? 'Unpin medication' : 'Pin as always active'}>
                          <IconButton
                            size="small"
                            onClick={() => handleTogglePin(rx.name, rx.isPinned)}
                            sx={{ p: 0.25, color: rx.isPinned ? COLORS.warning : COLORS.textMuted, '&:hover': { color: COLORS.brand } }}
                          >
                            <PushPinIcon sx={{ fontSize: 13, transform: rx.isPinned ? 'rotate(45deg)' : 'none' }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </>
            ) : (
              <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', py: 1 }}>
                No active prescriptions
              </Typography>
            )}

            {/* Historical Medications — collapsed by default */}
            {historicalRx.length > 0 && (
              <Box sx={{ mt: 1.5, pt: 1, borderTop: `1px solid ${COLORS.borderLight}` }}>
                <Box
                  onClick={() => setShowHistoricalRx(v => !v)}
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', py: 0.5 }}
                >
                  <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textMuted }}>
                    {showHistoricalRx ? 'Hide' : 'Show'} {historicalRx.length} historical
                  </Typography>
                  {showHistoricalRx
                    ? <ExpandLessIcon sx={{ fontSize: 16, color: COLORS.textMuted }} />
                    : <ExpandMoreIcon sx={{ fontSize: 16, color: COLORS.textMuted }} />
                  }
                </Box>
                <Collapse in={showHistoricalRx}>
                  <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                    {historicalRx.map((rx, i) => (
                      <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.7 }}>
                        <Box>
                          <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.rxText }}>{rx.name}</Typography>
                          <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted }}>
                            {rx.firstShort !== rx.lastShort ? `${rx.firstShort} → ${rx.lastShort}` : rx.lastDate}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, ml: 1 }}>
                          <Chip
                            label={`${rx.count}x`}
                            size="small"
                            sx={{
                              fontFamily: FONT, fontSize: '0.62rem', fontWeight: 800,
                              height: 18, bgcolor: COLORS.formBg, color: COLORS.textMuted,
                              border: `1px solid ${COLORS.borderLight}`,
                              borderRadius: 0,
                            }}
                          />
                          <Tooltip title="Pin as always active">
                            <IconButton
                              size="small"
                              onClick={() => handleTogglePin(rx.name, false)}
                              sx={{ p: 0.25, color: COLORS.textMuted, '&:hover': { color: COLORS.brand } }}
                            >
                              <PushPinIcon sx={{ fontSize: 13 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                </Collapse>
              </Box>
            )}

            {activeRx.length === 0 && historicalRx.length === 0 && (
              <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', py: 2 }}>
                No prescriptions on file
              </Typography>
            )}
          </Widget>

          {/* Vaccination Tracker */}
          <Widget title="Vaccination Status" icon={<VaccinesIcon sx={{ fontSize: 14, color: COLORS.success }} />}>
            {/* T2.465: Completeness bar — species-relevant vaccines only */}
            {vaccineCompleteness && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, pb: 1, borderBottom: `1px solid ${COLORS.borderLight}` }}>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 700, color: COLORS.textSecondary }}>
                  Completeness
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 60, height: 6, bgcolor: COLORS.borderInput, borderRadius: 0, overflow: 'hidden' }}>
                    <Box sx={{
                      width: `${vaccineCompleteness.percentage}%`,
                      height: '100%',
                      bgcolor: vaccineCompleteness.percentage === 100 ? COLORS.success : vaccineCompleteness.percentage >= 50 ? '#F57F17' : COLORS.danger,
                      borderRadius: 0,
                    }} />
                  </Box>
                  <Typography sx={{
                    fontFamily: FONT, fontSize: '0.72rem', fontWeight: 800,
                    color: vaccineCompleteness.percentage === 100 ? COLORS.success : COLORS.textSecondary,
                  }}>
                    {vaccineCompleteness.administered}/{vaccineCompleteness.total} ({vaccineCompleteness.percentage}%)
                  </Typography>
                </Box>
              </Box>
            )}
            <Stack spacing={0.75}>
              {vaccinationStatus.map((vax) => {
                // T3.101: Exempt rows get a neutral grey treatment instead of red "No record".
                const isExempt = exemptionMap.has(vax.id);
                if (isExempt) {
                  const exemption = exemptionMap.get(vax.id);
                  return (
                    <Box key={vax.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5, px: 1, borderRadius: 0, bgcolor: COLORS.tableHeaderBg }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <BlockIcon sx={{ fontSize: 13, color: COLORS.textMuted }} />
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 600, color: COLORS.textMuted }}>{vax.name}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        <Tooltip title={exemption?.reason || ''}>
                          <Typography sx={{ fontFamily: FONT, fontSize: '0.68rem', fontWeight: 700, color: COLORS.textMuted, cursor: 'default' }}>
                            Exempt
                          </Typography>
                        </Tooltip>
                        <Tooltip title="Undo exemption">
                          <IconButton
                            size="small"
                            onClick={() => handleUndoExemption(vax.id)}
                            sx={{ p: 0.25, ml: 0.5 }}
                          >
                            <UndoIcon sx={{ fontSize: 12, color: COLORS.textMuted }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  );
                }

                const statusColors = {
                  current:    { bg: '#E8F5E9',           text: COLORS.success,   icon: <CheckCircleOutlineIcon sx={{ fontSize: 13, color: COLORS.success }} /> },
                  due_soon:   { bg: COLORS.cream,         text: '#F57F17',        icon: <WarningAmberIcon sx={{ fontSize: 13, color: '#F57F17' }} /> },
                  overdue:    { bg: COLORS.dangerSurface, text: COLORS.surgery,   icon: <ErrorOutlineIcon sx={{ fontSize: 13, color: COLORS.surgery }} /> },
                  unknown:    { bg: COLORS.tableHeaderBg, text: COLORS.textMuted, icon: null },
                  incomplete: { bg: '#FFF3E0',            text: '#EF6C00',        icon: <WarningAmberIcon sx={{ fontSize: 13, color: '#EF6C00' }} /> },
                };
                const c = statusColors[vax.status] ?? statusColors.unknown;
                const statusLabel = vax.status === 'current'
                  ? `Due in ${vax.daysUntilDue}d`
                  : vax.status === 'due_soon'
                    ? `Due in ${vax.daysUntilDue}d`
                  : vax.status === 'overdue'
                    ? `${Math.abs(vax.daysUntilDue)}d overdue`
                  : vax.status === 'incomplete' && vax.nextDoseNumber
                    ? (vax.daysUntilDue != null
                        ? `Dose ${vax.nextDoseNumber}/${vax.dosesRequired} in ${vax.daysUntilDue}d`
                        : `Dose ${vax.nextDoseNumber}/${vax.dosesRequired} due`)
                  : 'No record';

                return (
                  <Box key={vax.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5, px: 1, borderRadius: 0, bgcolor: c.bg }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {c.icon}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {/* Dose dots for multi-dose vaccines */}
                        {vax.dosesRequired > 1 && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                            {Array.from({ length: vax.dosesRequired }, (_, i) => (
                              <Typography key={i} sx={{ fontSize: '0.65rem', color: i < vax.dosesGiven ? COLORS.success : COLORS.borderLight, lineHeight: 1 }}>
                                {i < vax.dosesGiven ? '●' : '○'}
                              </Typography>
                            ))}
                          </Box>
                        )}
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 600, color: c.text }}>{vax.name}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.68rem', fontWeight: 700, color: c.text }}>{statusLabel}</Typography>
                      {/* T3.101: "Mark N/A" affordance on unknown-status rows */}
                      {vax.status === 'unknown' && (
                        <Tooltip title="Mark as exempt (N/A)">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setExemptionTarget({ vaccineId: vax.id, vaccineName: vax.name });
                              setExemptionDialogOpen(true);
                            }}
                            sx={{ p: 0.25, ml: 0.5 }}
                          >
                            <BlockIcon sx={{ fontSize: 12, color: COLORS.textMuted }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Stack>

            {vaccineRecords.length > 0 && (
              <Button
                size="small"
                fullWidth
                startIcon={<PrintIcon sx={{ fontSize: '14px !important' }} />}
                onClick={async () => {
                  const staffLookup = await buildStaffLookup(vaccineRecords);
                  const html = generateVaccinationRecordHTML({
                    pet,
                    owner,
                    vaccineRecords,
                    clinicName: clinicSettings.clinicName,
                    clinicAddress: clinicSettings.clinicAddress,
                    clinicPhone: clinicSettings.clinicPhone,
                    clinicBAI: clinicSettings.baiRegistrationNumber,
                    staffLookup,
                  });
                  openPrintWindow(html, () => setPrintBlockedToast(true));
                }}
                sx={{
                  fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem',
                  textTransform: 'none', color: COLORS.success, mt: 1,
                  borderTop: `1px solid ${COLORS.borderLight}`, borderRadius: 0, pt: 1,
                }}
              >
                Print Vaccination Record
              </Button>
            )}

            {vaccineRecords.length > 0 && (
              <Button
                size="small"
                fullWidth
                startIcon={<PrintIcon sx={{ fontSize: '14px !important' }} />}
                onClick={async () => {
                  const staffLookup = await buildStaffLookup(vaccineRecords);
                  const html = generateVaccinationRecordHTML({
                    pet,
                    owner,
                    vaccineRecords,
                    clinicName: clinicSettings.clinicName,
                    clinicAddress: clinicSettings.clinicAddress,
                    clinicPhone: clinicSettings.clinicPhone,
                    clinicBAI: clinicSettings.baiRegistrationNumber,
                    mode: 'passport',
                    vaccineCatalog,
                    staffLookup,
                  });
                  openPrintWindow(html, () => setPrintBlockedToast(true));
                }}
                sx={{
                  fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem',
                  textTransform: 'none', color: COLORS.medical, mt: 0.5,
                  borderRadius: 0,
                }}
              >
                Print Vaccination Passport
              </Button>
            )}
          </Widget>


          {/* T2.459 / T4.120: Lab Results Aggregation — only renders when pet has lab data */}
          {aggregatedLabResults.length > 0 && (
            <Widget
              title={`Lab Results (${aggregatedLabResults.length})`}
              icon={<ScienceIcon sx={{ fontSize: 14, color: COLORS.medical }} />}
              onExpand={labTimeline.length > 0 ? () => setLabZoom(true) : undefined}
            >
              <Stack spacing={1}>
                {aggregatedLabResults.map((lab, i) => {
                  const statusKey = (lab.status || 'normal').toLowerCase();
                  const statusColor = statusKey === 'critical' ? COLORS.danger : statusKey === 'abnormal' ? COLORS.warning : COLORS.success;
                  const statusBg = statusKey === 'critical' ? COLORS.dangerSurface : statusKey === 'abnormal' ? COLORS.warningSurface : '#E8F5E9';
                  // T4.120 Amendment 1: SNAP/positive-negative tests display POSITIVE/NEGATIVE, not ABNORMAL/NORMAL
                  const chipLabel = lab.resultType === 'positive-negative'
                    ? (statusKey === 'normal' ? 'NEGATIVE' : statusKey === 'critical' ? 'CRITICAL' : 'POSITIVE')
                    : statusKey.toUpperCase();
                  return (
                    <Box key={i} sx={{ py: 0.75, borderBottom: i < aggregatedLabResults.length - 1 ? `1px solid ${COLORS.borderLight}` : 'none' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 700, color: COLORS.textPrimary }}>{lab.testName}</Typography>
                        <Chip
                          label={chipLabel}
                          size="small"
                          sx={{ fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, height: 18, bgcolor: statusBg, color: statusColor, border: `1px solid ${statusColor}` }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.25 }}>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', fontWeight: 800, color: statusColor }}>
                          {lab.result}{lab.unit ? ` ${lab.unit}` : ''}
                        </Typography>
                        {lab.referenceRange && (() => {
                          const speciesKey = (pet?.species || '').toLowerCase().includes('cat') ? 'feline' : 'canine';
                          const range = lab.referenceRange?.[speciesKey] ?? lab.referenceRange;
                          const display = Array.isArray(range)
                            ? `${range[0]} – ${range[1]}${lab.unit ? ` ${lab.unit}` : ''}`
                            : typeof range === 'string' ? range : null;
                          return display
                            ? <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted }}>(ref: {display})</Typography>
                            : null;
                        })()}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.68rem', color: COLORS.textMuted }}>{lab.date}</Typography>
                        {lab.previousResult && (
                          <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, fontStyle: 'italic' }}>
                            prev: {lab.previousResult} ({lab.previousDate})
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            </Widget>
          )}

          {/* T2.101: Billing Ledger — outstanding balances from sales */}
          {ownerSales.filter(s => (s.balanceRemaining || 0) > 0 && s.status !== 'refunded' && s.status !== 'voided').length > 0 && (
            <Widget title="Outstanding Balance" icon={<ScaleIcon sx={{ fontSize: 14, color: COLORS.danger }} />}>
              {/* T4.147: Snooze reminders dropdown — writes balanceReminderSnoozedUntil to user doc */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mb: 1 }}>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <Select
                    displayEmpty
                    value=""
                    onChange={(e) => handleSnoozeReminders(Number(e.target.value))}
                    sx={{ fontFamily: FONT, fontSize: '0.7rem', fontWeight: 700, borderRadius: 0, height: 28 }}
                    renderValue={() => 'Snooze Reminders'}
                  >
                    <MenuItem value={7} sx={{ fontFamily: FONT, fontSize: '0.75rem' }}>1 Week</MenuItem>
                    <MenuItem value={14} sx={{ fontFamily: FONT, fontSize: '0.75rem' }}>2 Weeks</MenuItem>
                    <MenuItem value={30} sx={{ fontFamily: FONT, fontSize: '0.75rem' }}>1 Month</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Stack spacing={0.75}>
                {ownerSales.filter(s => (s.balanceRemaining || 0) > 0 && s.status !== 'refunded' && s.status !== 'voided').map((sale, i) => {
                  const saleDateStr = sale.date?.toDate ? sale.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                  return (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
                      <Box>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 700, color: COLORS.textPrimary }}>{saleDateStr}</Typography>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.danger, fontWeight: 700 }}>₱{(sale.balanceRemaining || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} remaining</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={isErased}
                          onClick={() => { setRecordPaymentTarget(sale); setRecordPaymentAmount(''); setRecordPaymentOpen(true); }}
                          sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 800, borderRadius: 0, color: COLORS.success, borderColor: '#A5D6A7', textTransform: 'none', py: 0.25, px: 1 }}
                        >
                          Record Payment
                        </Button>
                        {/* T4.147: Mark Settled — for off-POS payments (GCash, bank transfer) */}
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={isErased}
                          onClick={() => setSettleTarget(sale)}
                          sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 800, borderRadius: 0, color: COLORS.warning, borderColor: COLORS.warning, textTransform: 'none', py: 0.25, px: 1 }}
                        >
                          Mark Settled
                        </Button>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            </Widget>
          )}

          {/* Sibling Pets — collapsed by default */}
          {siblings.length > 0 && (
            <Widget title={`Other Pets (${siblings.length})`} icon={<PetsIcon sx={{ fontSize: 14, color: COLORS.accentLight }} />}>
              <Box
                onClick={() => setSiblingExpanded(v => !v)}
                sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', py: 0.25 }}
              >
                <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textMuted }}>
                  {siblingExpanded ? 'Hide' : `Show ${siblings.length} other pet${siblings.length > 1 ? 's' : ''}`}
                </Typography>
                {siblingExpanded
                  ? <ExpandLessIcon sx={{ fontSize: 16, color: COLORS.textMuted }} />
                  : <ExpandMoreIcon sx={{ fontSize: 16, color: COLORS.textMuted }} />
                }
              </Box>
              <Collapse in={siblingExpanded}>
                <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                  {siblings.map((sib) => (
                    <Box key={sib.id} onClick={() => navigate(`/patients/${sib.id}`, { state: { pet: sib } })}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75, px: 1, borderRadius: 0, cursor: 'pointer', transition: 'all 0.15s ease', '&:hover': { bgcolor: COLORS.panelBg } }}>
                      <Avatar sx={{ width: 28, height: 28, bgcolor: getInitialColor(sib.name), fontFamily: FONT, fontWeight: 700, fontSize: '0.7rem', color: COLORS.cardBg }}>
                        {(sib.name || '?')[0].toUpperCase()}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 600, color: COLORS.textPrimary, textTransform: 'capitalize' }}>{sib.name}</Typography>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted }}>{sib.species}{sib.breed && sib.breed !== 'Unknown Breed' ? ` · ${sib.breed}` : ''}</Typography>
                      </Box>
                      <NavigateNextIcon sx={{ fontSize: 16, color: COLORS.textMuted }} />
                    </Box>
                  ))}
                </Stack>
              </Collapse>
            </Widget>
          )}

        </Box>
      </Box>

      {/* ── Referral Report Modal ── */}
      <ReferralModal
        open={referralOpen}
        onClose={() => setReferralOpen(false)}
        pet={pet}
        owner={owner}
        history={history}
        clinicName={clinicSettings.clinicName}
        clinicAddress={clinicSettings.clinicAddress}
      />

      {/* T2.101: Record Payment Dialog */}
      <Dialog open={recordPaymentOpen} onClose={() => setRecordPaymentOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.95rem', color: COLORS.brand }}>Record Payment</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textSecondary, mb: 1.5 }}>
            Outstanding: ₱{(recordPaymentTarget?.balanceRemaining || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Payment Amount"
            type="number"
            size="small"
            value={recordPaymentAmount}
            onChange={(e) => setRecordPaymentAmount(e.target.value)}
            InputProps={{ startAdornment: <Typography sx={{ mr: 0.5, color: '#aaa' }}>₱</Typography> }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => setRecordPaymentOpen(false)} sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleRecordPayment}
            disabled={!recordPaymentAmount || parseFloat(recordPaymentAmount) <= 0}
            sx={{ fontFamily: FONT, fontWeight: 900, bgcolor: COLORS.success, borderRadius: 0, '&:hover': { bgcolor: '#1B5E20' } }}
          >
            Save Payment
          </Button>
        </DialogActions>
      </Dialog>

      {/* T4.147: Mark as Settled Confirmation Dialog */}
      <Dialog open={!!settleTarget} onClose={() => setSettleTarget(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 0 } }}>
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.95rem', color: COLORS.warning, borderBottom: `2px solid ${COLORS.border}` }}>
          Mark as Settled
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textSecondary }}>
            Mark <strong>₱{(settleTarget?.balanceRemaining || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong> as settled?
            This records that payment was received outside the POS system (e.g. GCash, bank transfer).
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button onClick={() => setSettleTarget(null)} sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0 }}>
            Cancel
          </Button>
          <Button
            onClick={handleMarkSettled}
            variant="contained"
            sx={{ fontFamily: FONT, fontWeight: 900, borderRadius: 0, bgcolor: COLORS.warning, '&:hover': { bgcolor: COLORS.danger } }}
          >
            Confirm Settled
          </Button>
        </DialogActions>
      </Dialog>

      {/* T3.101: Vaccine Exemption Dialog */}
      <Dialog
        open={exemptionDialogOpen}
        onClose={() => { setExemptionDialogOpen(false); setExemptionTarget(null); setExemptionReason(''); }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0 } }}
      >
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.95rem', color: COLORS.brand, borderBottom: `2px solid ${COLORS.border}` }}>
          Mark {exemptionTarget?.vaccineName} as Exempt
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', color: COLORS.textSecondary, mb: 1.5 }}>
            This vaccine will be excluded from the completeness tracker. Provide a reason for the exemption.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            placeholder="e.g., Indoor-only cat — no exposure risk"
            value={exemptionReason}
            onChange={(e) => setExemptionReason(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                fontFamily: FONT,
                fontSize: '0.85rem',
                borderRadius: 0,
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button
            onClick={() => { setExemptionDialogOpen(false); setExemptionTarget(null); setExemptionReason(''); }}
            sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleMarkExempt}
            disabled={!exemptionReason.trim() || exemptionSaving}
            variant="contained"
            sx={{
              fontFamily: FONT,
              fontWeight: 700,
              bgcolor: COLORS.textMuted,
              color: '#fff',
              borderRadius: 0,
              '&:hover': { bgcolor: COLORS.accentLight },
              '&.Mui-disabled': { bgcolor: COLORS.borderLight },
            }}
          >
            {exemptionSaving ? 'Saving...' : 'Mark Exempt'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Print mode dropdown — single instance, controlled by printMenuAnchor/printMenuRecord state */}
      <Menu
        anchorEl={printMenuAnchor}
        open={Boolean(printMenuAnchor)}
        onClose={() => { setPrintMenuAnchor(null); setPrintMenuRecord(null); }}
        sx={{ '& .MuiPaper-root': { borderRadius: 0, border: `2px solid ${COLORS.accent}`, boxShadow: '4px 4px 0px rgba(93,64,55,0.1)' } }}
      >
        <MenuItem onClick={() => handlePrint('client')} sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.8rem' }}>Client Copy</MenuItem>
        <MenuItem onClick={() => handlePrint('internal')} sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.8rem' }}>Internal Copy</MenuItem>
        <Divider />
        <MenuItem onClick={() => handlePrint('both')} sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.8rem' }}>Both (2 Pages)</MenuItem>
      </Menu>

      {/* ── Popup-blocked warning ── */}
      <Snackbar
        open={printBlockedToast}
        autoHideDuration={5000}
        onClose={() => setPrintBlockedToast(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setPrintBlockedToast(false)}
          severity="warning"
          variant="filled"
          sx={{ fontFamily: FONT, width: '100%' }}
        >
          Print window was blocked. Please allow pop-ups for this site and try again.
        </Alert>
      </Snackbar>

      {/* T2.129: Generic error snackbar */}
      <Snackbar
        open={!!errorSnack}
        autoHideDuration={5000}
        onClose={() => setErrorSnack('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setErrorSnack('')} severity="error" variant="filled" sx={{ fontFamily: FONT, width: '100%' }}>
          {errorSnack}
        </Alert>
      </Snackbar>

      {/* T4.147: Generic success snackbar — snooze confirmations, etc. */}
      <Snackbar
        open={!!successSnack}
        autoHideDuration={4000}
        onClose={() => setSuccessSnack('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccessSnack('')} severity="success" variant="filled" sx={{ fontFamily: FONT, width: '100%', borderRadius: 0 }}>
          {successSnack}
        </Alert>
      </Snackbar>

      {/* T4.116: Pin/unpin medication confirmation */}
      <Snackbar
        open={!!rxPinSnack}
        autoHideDuration={2500}
        onClose={() => setRxPinSnack('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="info" onClose={() => setRxPinSnack('')} sx={{ fontFamily: FONT, borderRadius: 0 }}>
          {rxPinSnack}
        </Alert>
      </Snackbar>

      {/* T2.458: Quick-book WalkInModal — pet + owner prefilled */}
      <WalkInModal
        open={quickBookOpen}
        onClose={() => setQuickBookOpen(false)}
        servicesList={servicesList}
        departments={deptsList}
        prefillClient={owner}
        prefillPet={pet}
      />

      {/* T3.118: Shared amendment creation dialog */}
      <AmendmentDialog
        open={amendDialogOpen}
        onClose={() => { setAmendDialogOpen(false); setAmendTargetApptId(null); }}
        appointmentId={amendTargetApptId}
        onSuccess={() => {
          setRefreshKey(k => k + 1);
          setAmendDialogOpen(false);
          setAmendTargetApptId(null);
        }}
      />

      {/* T4.92: Custom notification dialog — no appointmentId context, logs to console only */}
      <SendNotificationDialog
        open={notifDialogOpen}
        onClose={() => setNotifDialogOpen(false)}
        recipientName={owner?.fullName || owner?.displayName || owner?.name || 'Client'}
        ownerId={pet?.ownerId}
        petName={pet?.name}
        onSent={({ title, body }) => {
          console.log('[PatientDashboard] Custom notification sent:', { title, body, ownerId: pet?.ownerId });
        }}
      />

      {/* T4.96: AI History Assistant drawer */}
      <PetHistoryAIDrawer
        open={aiDrawerOpen}
        onClose={() => setAiDrawerOpen(false)}
        pet={pet}
        owner={owner}
        records={history}
        vaccinations={vaccinationStatus}
        workerUrl={llmConfig.workerUrl}
      />

      {/* T4.112: Vitals Zoom Dialog — single shared instance, content resolved from vitalsZoom.key */}
      <Dialog
        open={vitalsZoom.open}
        onClose={() => setVitalsZoom({ open: false, key: null })}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.border}` } }}
      >
        {vitalsZoom.key && (() => {
          const cfg = VITALS_CHART_CONFIG[vitalsZoom.key];
          const dataMap = { weight: vitalsData, temp: tempData, hr: hrData, rr: rrData, crt: crtData, bcs: bcsData, pain: painData };
          const data = dataMap[vitalsZoom.key] || [];
          const strokeColor = cfg.stroke || (vitalsZoom.key === 'weight' ? COLORS.accentLight : COLORS.grooming);
          const rangeKey = cfg.refLines;
          return (
            <>
              <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '1rem', color: COLORS.brand, borderBottom: `2px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 1 }}>
                {cfg.label}{pet?.name ? ` — ${pet.name}` : ''}
              </DialogTitle>
              <DialogContent sx={{ py: 3, px: 3 }}>
                {data.length > 1 ? (
                  <Box sx={{ width: '100%', height: 380 }}>
                    <ResponsiveContainer width="100%" height={380}>
                      <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.borderLight} />
                        <XAxis
                          dataKey="ts"
                          type="number"
                          scale="time"
                          domain={['dataMin', 'dataMax']}
                          tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          tick={{ fontSize: 11, fontFamily: FONT }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fontFamily: FONT }}
                          domain={cfg.yDomain}
                          {...(cfg.yTicks ? { ticks: cfg.yTicks } : {})}
                        />
                        <RechartsTooltip
                          contentStyle={{ fontSize: 12, fontFamily: FONT, borderRadius: 0, border: `1px solid ${COLORS.border}` }}
                          formatter={(value) => [`${value} ${cfg.unit}`, cfg.label]}
                          labelFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        />
                        {rangeKey && SPECIES_VITAL_RANGES[rangeKey] && (
                          <>
                            <ReferenceLine y={SPECIES_VITAL_RANGES[rangeKey][speciesKey][0]} stroke="#66BB6A" strokeDasharray="4 4" label={{ value: 'Low', fill: '#66BB6A', fontSize: 10, position: 'right' }} />
                            <ReferenceLine y={SPECIES_VITAL_RANGES[rangeKey][speciesKey][1]} stroke="#66BB6A" strokeDasharray="4 4" label={{ value: 'High', fill: '#66BB6A', fontSize: 10, position: 'right' }} />
                          </>
                        )}
                        <Line type="monotone" dataKey={cfg.dataKey} stroke={strokeColor} strokeWidth={2.5} dot={{ r: 4, fill: strokeColor }} activeDot={{ r: 7 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                ) : (
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', py: 4 }}>
                    Insufficient data for trend chart
                  </Typography>
                )}
                {renderVitalsDelta(data, cfg.dataKey, cfg.unit)}
              </DialogContent>
              <DialogActions sx={{ px: 2.5, pb: 2, borderTop: `1px solid ${COLORS.borderLight}` }}>
                <Button onClick={() => setVitalsZoom({ open: false, key: null })} sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0 }}>
                  Close
                </Button>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>

      {/* T4.116: Prescription Zoom Dialog — full chronological medication timeline */}
      <Dialog
        open={rxZoom}
        onClose={() => { setRxZoom(false); setRxZoomFilter('All'); setRxZoomSearch(''); }}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.border}` } }}
      >
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '1rem', color: COLORS.brand, borderBottom: `2px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 1 }}>
          <MedicationIcon sx={{ fontSize: 18 }} /> Medication History{pet?.name ? ` — ${pet.name}` : ''}
        </DialogTitle>
        <DialogContent sx={{ py: 2, px: 3 }}>
          {/* Filter chips + optional search */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2, alignItems: 'center' }}>
            <Chip
              label="All"
              size="small"
              onClick={() => setRxZoomFilter('All')}
              sx={{
                fontFamily: FONT, fontSize: '0.7rem', fontWeight: rxZoomFilter === 'All' ? 800 : 500,
                bgcolor: rxZoomFilter === 'All' ? COLORS.brand : COLORS.formBg,
                color: rxZoomFilter === 'All' ? COLORS.cardBg : COLORS.textSecondary,
                border: `1px solid ${rxZoomFilter === 'All' ? COLORS.brand : COLORS.borderLight}`,
                borderRadius: 0, cursor: 'pointer',
              }}
            />
            {rxUniqueNames.map(name => (
              <Chip
                key={name}
                label={name}
                size="small"
                onClick={() => setRxZoomFilter(name)}
                sx={{
                  fontFamily: FONT, fontSize: '0.7rem', fontWeight: rxZoomFilter === name ? 800 : 500,
                  bgcolor: rxZoomFilter === name ? COLORS.rxText : COLORS.formBg,
                  color: rxZoomFilter === name ? COLORS.cardBg : COLORS.rxText,
                  border: `1px solid ${rxZoomFilter === name ? COLORS.rxText : COLORS.rxBorder}`,
                  borderRadius: 0, cursor: 'pointer',
                }}
              />
            ))}
            {rxUniqueNames.length >= 10 && (
              <TextField
                size="small"
                placeholder="Search meds..."
                value={rxZoomSearch}
                onChange={(e) => setRxZoomSearch(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: COLORS.textMuted }} /></InputAdornment> }}
                sx={{ ml: 'auto', '& .MuiOutlinedInput-root': { fontFamily: FONT, fontSize: '0.8rem', height: 32, borderRadius: 0, '& fieldset': { borderColor: COLORS.border } } }}
              />
            )}
          </Box>

          {/* Chronological timeline entries */}
          <Stack spacing={1} sx={{ maxHeight: 450, overflow: 'auto' }}>
            {rxTimeline
              .filter(e => rxZoomFilter === 'All' || e.name === rxZoomFilter)
              .filter(e => !rxZoomSearch || e.name.toLowerCase().includes(rxZoomSearch.toLowerCase()))
              .map((e, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 2, py: 0.75, borderBottom: `1px solid ${COLORS.borderLight}` }}>
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, minWidth: 100, flexShrink: 0 }}>{e.date}</Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.rxText }}>{e.name}</Typography>
                      {e.qty && (
                        <Chip
                          label={`x${e.qty}`}
                          size="small"
                          sx={{ fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, height: 16, bgcolor: COLORS.kpiOrangeBg, color: COLORS.warning, border: `1px solid ${COLORS.kpiOrangeBorder}`, borderRadius: 0 }}
                        />
                      )}
                    </Box>
                    {e.instructions && (
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: '#B45309' }}>{e.instructions}</Typography>
                    )}
                  </Box>
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.textMuted, flexShrink: 0 }}>{e.vet}</Typography>
                </Box>
              ))
            }
            {rxTimeline
              .filter(e => rxZoomFilter === 'All' || e.name === rxZoomFilter)
              .filter(e => !rxZoomSearch || e.name.toLowerCase().includes(rxZoomSearch.toLowerCase()))
              .length === 0 && (
              <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', py: 4 }}>
                No matching prescriptions
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2, borderTop: `1px solid ${COLORS.borderLight}` }}>
          <Button
            onClick={() => { setRxZoom(false); setRxZoomFilter('All'); setRxZoomSearch(''); }}
            sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0 }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* T4.120: Lab Results Zoom Dialog — test trend charting + chronological timeline */}
      <Dialog
        open={labZoom}
        onClose={() => { setLabZoom(false); setLabZoomFilter('All'); }}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.border}` } }}
      >
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '1rem', color: COLORS.brand, borderBottom: `2px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScienceIcon sx={{ fontSize: 18 }} /> Lab Results History{pet?.name ? ` — ${pet.name}` : ''}
        </DialogTitle>
        <DialogContent sx={{ py: 2, px: 3 }}>
          {/* Filter chips — "All" + one per unique test name */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2, alignItems: 'center' }}>
            <Chip
              label="All"
              size="small"
              onClick={() => setLabZoomFilter('All')}
              sx={{
                fontFamily: FONT, fontSize: '0.7rem',
                fontWeight: labZoomFilter === 'All' ? 800 : 500,
                bgcolor: labZoomFilter === 'All' ? COLORS.brand : COLORS.formBg,
                color: labZoomFilter === 'All' ? COLORS.cardBg : COLORS.textSecondary,
                border: `1px solid ${labZoomFilter === 'All' ? COLORS.brand : COLORS.borderLight}`,
                borderRadius: 0, cursor: 'pointer',
              }}
            />
            {labUniqueTests.map(name => (
              <Chip
                key={name}
                label={name}
                size="small"
                onClick={() => setLabZoomFilter(name)}
                sx={{
                  fontFamily: FONT, fontSize: '0.7rem',
                  fontWeight: labZoomFilter === name ? 800 : 500,
                  bgcolor: labZoomFilter === name ? COLORS.medical : COLORS.formBg,
                  color: labZoomFilter === name ? COLORS.cardBg : COLORS.medical,
                  border: `1px solid ${labZoomFilter === name ? COLORS.medical : COLORS.kpiBlueBorder}`,
                  borderRadius: 0, cursor: 'pointer',
                }}
              />
            ))}
          </Box>

          {/* SparkLine chart — shown only when a single numeric test is selected with ≥ 2 data points */}
          {labZoomFilter !== 'All' && (() => {
            const filtered = labTimeline.filter(e => e.testName === labZoomFilter);
            const numericPoints = filtered
              .filter(e => e.numericResult !== null)
              .sort((a, b) => a.ms - b.ms); // oldest to newest for chart
            if (numericPoints.length >= 2) {
              // Resolve reference range from the most recent entry that has one
              const latestRef = filtered.find(e => e.referenceRange);
              const speciesKey = (pet?.species || '').toLowerCase().includes('cat') ? 'feline' : 'canine';
              const refRange = latestRef?.referenceRange?.[speciesKey]
                || (Array.isArray(latestRef?.referenceRange) ? latestRef.referenceRange : null);
              const unit = numericPoints[0]?.unit || '';
              return (
                <Box sx={{ width: '100%', mb: 2 }}>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={numericPoints} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.borderLight} />
                      <XAxis
                        dataKey="ms"
                        type="number"
                        scale="time"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        tick={{ fontSize: 11, fontFamily: FONT }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fontFamily: FONT }}
                        domain={['dataMin - 1', 'dataMax + 1']}
                      />
                      <RechartsTooltip
                        contentStyle={{ fontSize: 12, fontFamily: FONT, borderRadius: 0, border: `1px solid ${COLORS.border}` }}
                        formatter={(value) => [`${value} ${unit}`, labZoomFilter]}
                        labelFormatter={(ts) => new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      />
                      {/* Reference range band: two green dashed lines at low/high */}
                      {Array.isArray(refRange) && refRange.length === 2 && (
                        <>
                          <ReferenceLine y={refRange[0]} stroke="#66BB6A" strokeDasharray="4 4"
                            label={{ value: 'Low', fill: '#66BB6A', fontSize: 10, position: 'right' }} />
                          <ReferenceLine y={refRange[1]} stroke="#66BB6A" strokeDasharray="4 4"
                            label={{ value: 'High', fill: '#66BB6A', fontSize: 10, position: 'right' }} />
                        </>
                      )}
                      <Line
                        type="monotone"
                        dataKey="numericResult"
                        stroke={COLORS.medical}
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: COLORS.medical }}
                        activeDot={{ r: 7 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              );
            }
            return null; // non-numeric or < 2 points — falls through to timeline below
          })()}

          {/* Chronological timeline — always shown */}
          <Stack spacing={1} sx={{ maxHeight: 450, overflow: 'auto' }}>
            {labTimeline
              .filter(e => labZoomFilter === 'All' || e.testName === labZoomFilter)
              .map((e, i) => {
                const statusKey = (e.status || 'normal').toLowerCase();
                const statusColor = statusKey === 'critical' ? COLORS.danger : statusKey === 'abnormal' ? COLORS.warning : COLORS.success;
                // T4.120 Amendment 1: display POSITIVE/NEGATIVE for positive-negative resultType tests
                const statusLabel = e.resultType === 'positive-negative'
                  ? (statusKey === 'normal' ? 'NEGATIVE' : statusKey === 'critical' ? 'CRITICAL' : 'POSITIVE')
                  : statusKey.toUpperCase();
                return (
                  <Box key={i} sx={{ display: 'flex', gap: 2, py: 0.75, borderBottom: `1px solid ${COLORS.borderLight}` }}>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, minWidth: 100, flexShrink: 0 }}>
                      {e.date}
                    </Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.medical }}>{e.testName}</Typography>
                        <Chip
                          label={statusLabel}
                          size="small"
                          sx={{
                            fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, height: 16, borderRadius: 0,
                            bgcolor: statusKey === 'critical' ? COLORS.dangerSurface : statusKey === 'abnormal' ? COLORS.warningSurface : '#E8F5E9',
                            color: statusColor,
                          }}
                        />
                      </Box>
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: statusColor, fontWeight: 700 }}>
                        {e.result}{e.unit ? ` ${e.unit}` : ''}
                      </Typography>
                      {e.referenceRange && (() => {
                        const speciesKey = (pet?.species || '').toLowerCase().includes('cat') ? 'feline' : 'canine';
                        const range = e.referenceRange?.[speciesKey] || e.referenceRange;
                        if (Array.isArray(range)) {
                          return (
                            <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted }}>
                              Ref: {range[0]} – {range[1]}{e.unit ? ` ${e.unit}` : ''}
                            </Typography>
                          );
                        }
                        return null;
                      })()}
                      {e.notes && (
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: COLORS.textMuted, fontStyle: 'italic' }}>
                          {e.notes}
                        </Typography>
                      )}
                    </Box>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.textMuted, flexShrink: 0 }}>
                      {e.vet}
                    </Typography>
                  </Box>
                );
              })
            }
            {labTimeline.filter(e => labZoomFilter === 'All' || e.testName === labZoomFilter).length === 0 && (
              <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', py: 4 }}>
                No lab results recorded
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2, borderTop: `1px solid ${COLORS.borderLight}` }}>
          <Button
            onClick={() => { setLabZoom(false); setLabZoomFilter('All'); }}
            sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0 }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
