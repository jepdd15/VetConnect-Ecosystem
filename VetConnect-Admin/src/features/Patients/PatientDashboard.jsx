import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Chip, Paper,
  Stack, Button, CircularProgress, Divider,
  IconButton, Avatar, TextField, InputAdornment,
  FormControl, Select, MenuItem, Popover, Collapse, Tooltip,
  Snackbar, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import Grid from '@mui/material/Grid';

import { db } from '../../firebaseConfig';
import { doc, getDoc, collection, query, where, orderBy, getDocs, Timestamp, updateDoc, onSnapshot, arrayUnion, arrayRemove } from 'firebase/firestore';
import { resolveVitals } from '../../utils/resolveVitals';
import { resolveObjectiveText, hasExamData } from '../../utils/examUtils';

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
import BlockIcon from '@mui/icons-material/Block';
import UndoIcon from '@mui/icons-material/Undo';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import PushPinIcon from '@mui/icons-material/PushPin';
import Inventory2Icon from '@mui/icons-material/Inventory2';

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

// ── Vaccine Catalog & Helpers ────────────────────────────────────
import { getVaccineAdministrations, resolveVaccineFromName } from '../../utils/vaccineConstants';
import { useVaccineCatalog } from '../../hooks/useVaccineCatalog';

// ── Modals ──────────────────────────────────────────────────────
import ReferralModal from './components/ReferralModal';
import WalkInModal from '../Queue/WalkInModal';
import AmendmentDialog from '../../components/AmendmentDialog';
import SendNotificationDialog from '../../components/SendNotificationDialog';
import PetHistoryAIDrawer from './components/PetHistoryAIDrawer';
import { resolveDepartmentForRecord } from '../../utils/resolveDepartmentForRecord';

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
  const [timelineSearch, setTimelineSearch] = useState('');
  const [timelineFilter, setTimelineFilter] = useState('All');
  const [timelineSort, setTimelineSort] = useState('desc');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeRecordIndex, setActiveRecordIndex] = useState(0);
  const [collapsedYears, setCollapsedYears] = useState(new Set());
  const [referralOpen, setReferralOpen] = useState(false);
  const [printBlockedToast, setPrintBlockedToast] = useState(false);
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


  // T3.101: Vaccine exemption dialog
  const [exemptionDialogOpen, setExemptionDialogOpen] = useState(false);
  const [exemptionTarget, setExemptionTarget] = useState(null); // { vaccineId, vaccineName }
  const [exemptionReason, setExemptionReason] = useState('');
  const [exemptionSaving, setExemptionSaving] = useState(false);

  // T3.118: Amendment dialog — single instance shared across all sealed record cards
  const [amendDialogOpen, setAmendDialogOpen] = useState(false);
  const [amendTargetApptId, setAmendTargetApptId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  // T4.116: Other Pets widget — collapsed by default
  const [siblingExpanded, setSiblingExpanded] = useState(false);

  // T4.96: AI History Assistant
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [llmConfig, setLlmConfig] = useState({ enabled: false, workerUrl: '' });

  const clinicSettings = useClinicSettings();

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

  const availableFilters = useMemo(() => {
    // Dynamic department names from Firestore departments collection.
    // Falls back to legacy values if departments haven't loaded yet.
    if (!deptsList.length) return ['medical', 'grooming'];
    return deptsList.map(d => d.name);
  }, [deptsList]);

  useEffect(() => {
    const allOptions = ['All', ...availableFilters, 'Vaccination'];
    if (timelineFilter !== 'All' && !allOptions.includes(timelineFilter)) {
      setTimelineFilter('All');
    }
  }, [availableFilters, timelineFilter]);

  const processedHistory = useMemo(() => {
    let f = [...(history || [])];
    if (timelineSearch) {
      const q = timelineSearch.toLowerCase();
      f = f.filter(r => {
        // Core SOAP fields
        const textFields = [
          r.diagnosis, r.vetName, r.treatment,
          r.soap?.subjective, resolveObjectiveText(r),
          r.soap?.assessment, r.soap?.plan,
        ];
        if (textFields.some(v => v?.toLowerCase().includes(q))) return true;

        // T2.130: Prescriptions — search item names
        if ((r.dispensedProducts || r.prescriptions)?.some(rx => rx.name?.toLowerCase().includes(q))) return true;

        // T2.462: Lab results — handle both string and array shapes
        if (typeof r.labResults === 'string' && r.labResults.toLowerCase().includes(q)) return true;
        if (Array.isArray(r.labResults) && r.labResults.some(lr =>
          (lr.testName || lr.name || lr.result || '').toLowerCase().includes(q)
        )) return true;

        // T2.462: Vaccine data
        if (r.vaccineData?.vaccineName?.toLowerCase().includes(q)) return true;

        return false;
      });
    }
    if (timelineFilter !== 'All') {
      if (timelineFilter === 'Vaccination') {
        f = f.filter(r => r.vaccineAdministrations?.length > 0 || !!r.vaccineData);
      } else {
        f = f.filter(r => resolveDepartmentForRecord(r, deptsList) === timelineFilter);
      }
    }
    f.sort((a, b) => { const dA = a.date?.seconds||0, dB = b.date?.seconds||0; return timelineSort === 'desc' ? dB-dA : dA-dB; });
    return f;
  }, [history, timelineSearch, timelineFilter, timelineSort, deptsList]);

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
        if (!rx.isDrug && !rx.isMedicine) return;
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
        if (!rx.isDrug && !rx.isMedicine) return;
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
          });
        }
      });
    });
    return Array.from(testMap.values());
  }, [history]);

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

  useEffect(() => { setExpandedRecords(new Set([0])); }, [timelineSearch, timelineFilter, timelineSort]);

  const toggleRecord = (i) => setExpandedRecords(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
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
  const handleRecordPayment = async () => {
    const amount = parseFloat(recordPaymentAmount);
    if (!recordPaymentTarget || isNaN(amount) || amount <= 0) return;
    try {
      const newBalance = Math.max(0, (recordPaymentTarget.balanceRemaining || 0) - amount);
      await updateDoc(doc(db, 'sales', recordPaymentTarget.id), { balanceRemaining: newBalance });
      setOwnerSales(prev => prev.map(s => s.id === recordPaymentTarget.id ? { ...s, balanceRemaining: newBalance } : s));
      setRecordPaymentOpen(false);
      setRecordPaymentTarget(null);
      setRecordPaymentAmount('');
    } catch (e) {
      console.error('[PatientDashboard.handleRecordPayment]:', e.message);
      setErrorSnack('Failed to record payment: ' + e.message);
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
        diagnosis: r.diagnosis || 'Clinical Visit',
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
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
              <Typography sx={{ fontFamily: FONT, ...TYPE.heading, color: COLORS.brand, textTransform: 'capitalize' }}>{pet?.name}</Typography>
              <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textMuted, fontStyle: 'italic' }}>
                {pet?.species}{pet?.breed && pet.breed !== 'Unknown Breed' ? `, ${pet.breed}` : ''}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.25 }}>
              <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {pet?.gender === 'Female' ? <FemaleIcon sx={{ fontSize: 13, color: '#E91E63' }} /> : pet?.gender === 'Male' ? <MaleIcon sx={{ fontSize: 13, color: '#1976D2' }} /> : null}
                {sexLabel}
              </Typography>
              <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary }}>Age: <span style={{ color: COLORS.brand, fontWeight: 700 }}>{calculatePetAge(pet?.dob)}</span></Typography>
              <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary }}>Wt: <span style={{ color: COLORS.warning, fontWeight: 700 }}>{pet?.lastWeight ? `${pet.lastWeight}kg` : 'N/A'}</span></Typography>
              {computedOutstandingBalance > 0 && (
                <Tooltip title="This client has an unpaid balance computed from sales records.">
                  <Chip
                    label={`₱${computedOutstandingBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} OWED`}
                    size="small"
                    sx={{
                      bgcolor: COLORS.dangerSurface, color: COLORS.dangerHover,
                      fontWeight: 900, fontSize: '0.72rem',
                      height: 22, border: '1px solid #EF9A9A',
                      fontFamily: FONT, animation: 'pulse 2s infinite'
                    }}
                  />
                </Tooltip>
              )}
              {hasAllergies ? (
                <Chip icon={<WarningAmberIcon sx={{ color: `${COLORS.cardBg} !important`, fontSize: 12 }} />} label={resolvedPetAllergies} size="small" sx={{ bgcolor: COLORS.surgery, color: COLORS.cardBg, fontWeight: 700, fontSize: '0.72rem', height: 22, fontFamily: FONT }} />
              ) : (
                <Typography sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted, bgcolor: COLORS.panelBg, px: 0.75, py: 0.25, borderRadius: 0 }}>NKA</Typography>
              )}
              {lastSeenLabel && (
                <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AccessTimeIcon sx={{ fontSize: 11 }} /> Last seen: <span style={{ fontWeight: 600, color: COLORS.textSecondary }}>{lastSeenLabel}</span>
                </Typography>
              )}
            </Box>
            {/* T4.116: Owner contact row — compact, below the pet vitals row */}
            {owner && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.25 }}>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <PersonIcon sx={{ fontSize: 12 }} /> {owner.fullName || owner.displayName || owner.name || 'Unknown'}
                </Typography>
                {(owner.phone || owner.contactNumber) && (
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <PhoneIcon sx={{ fontSize: 11 }} /> {owner.phone || owner.contactNumber}
                  </Typography>
                )}
                {owner.email && (
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <EmailIcon sx={{ fontSize: 11 }} /> {owner.email}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </Box>

        {/* Search Toolkit */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, borderLeft: `1px solid ${COLORS.borderLight}`, borderRight: `1px solid ${COLORS.borderLight}`, py: 1.5 }}>
          <TextField size="small" placeholder="Search records..." value={timelineSearch} onChange={(e) => setTimelineSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: COLORS.textMuted, fontSize: 18 }} /></InputAdornment> }}
            sx={{ minWidth: 160, '& .MuiOutlinedInput-root': { fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textPrimary, bgcolor: COLORS.formBg, borderRadius: 0, height: 36, '& fieldset': { borderColor: COLORS.border } } }}
          />
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <Select value={timelineFilter} onChange={(e) => setTimelineFilter(e.target.value)}
              sx={{ fontFamily: FONT, fontWeight: 600, fontSize: '0.8rem', color: COLORS.textPrimary, bgcolor: COLORS.formBg, height: 36, borderRadius: 0, '& fieldset': { borderColor: COLORS.border } }}>
              <MenuItem value="All" sx={{ fontSize: '0.85rem' }}>All Types</MenuItem>
              <Divider />
              {availableFilters.map(f => {
                const deptColor = deptsList.find(d => d.name === f)?.color || '#616161';
                return (
                  <MenuItem key={f} value={f} sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    <Box sx={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', bgcolor: deptColor, mr: 1, flexShrink: 0 }} />
                    {f}
                  </MenuItem>
                );
              })}
              <Divider />
              <MenuItem value="Vaccination" sx={{ fontSize: '0.85rem', fontWeight: 600 }}>Vaccination</MenuItem>
            </Select>
          </FormControl>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>{processedHistory.length} rec</Typography>
          <IconButton size="small" onClick={() => setTimelineSort(p => p === 'desc' ? 'asc' : 'desc')}
            sx={{ color: COLORS.textMuted, border: `1px solid ${COLORS.border}`, borderRadius: 0, width: 36, height: 36, '&:hover': { bgcolor: COLORS.panelBg } }}>
            <SortIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5 }}>
          <Button
            variant="contained"
            size="small"
            disabled={isErased}
            startIcon={<EventAvailableIcon sx={{ fontSize: '15px !important' }} />}
            onClick={() => setQuickBookOpen(true)}
            sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.78rem', textTransform: 'none', bgcolor: COLORS.success, borderRadius: 0, px: 2, height: 36, boxShadow: 'none', '&:hover': { bgcolor: '#1B5E20' } }}
          >
            Book Visit
          </Button>
          <Button
            variant="outlined"
            size="small"
            disabled={isErased}
            startIcon={<LocalHospitalIcon sx={{ fontSize: '15px !important' }} />}
            onClick={() => setReferralOpen(true)}
            sx={{
              fontFamily: FONT, fontWeight: 700, fontSize: '0.78rem', textTransform: 'none',
              color: COLORS.accent, borderColor: COLORS.border, borderRadius: 0,
              px: 2, height: 36, '&:hover': { borderColor: COLORS.accentLight, bgcolor: COLORS.panelBg },
            }}
          >
            Referral
          </Button>
          {/* T4.92: Send custom push notification to the pet owner */}
          <Button
            variant="outlined"
            size="small"
            disabled={isErased || !pet?.ownerId || pet?.ownerId === 'WALK_IN_USER'}
            startIcon={<NotificationsActiveIcon sx={{ fontSize: '15px !important' }} />}
            onClick={() => setNotifDialogOpen(true)}
            sx={{
              fontFamily: FONT, fontWeight: 700, fontSize: '0.78rem', textTransform: 'none',
              color: COLORS.medical, borderColor: COLORS.border, borderRadius: 0,
              px: 2, height: 36,
              '&:hover': { borderColor: COLORS.medical, bgcolor: COLORS.chipBlueBg },
            }}
          >
            Notify Owner
          </Button>

          {/* T4.96: AI History Assistant — gated on LLM config */}
          {llmConfig.enabled && !!llmConfig.workerUrl && (
            <Button
              variant="outlined"
              size="small"
              disabled={isErased}
              startIcon={<AutoAwesomeIcon sx={{ fontSize: '15px !important' }} />}
              onClick={() => setAiDrawerOpen(true)}
              sx={{
                fontFamily: FONT, fontWeight: 700, fontSize: '0.78rem', textTransform: 'none',
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
                          <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', fontWeight: 800, color: COLORS.accent, letterSpacing: '0.04em' }}>{group.year}</Typography>
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
                                borderLeft: isActive ? `3px solid ${COLORS.accentLight}` : '3px solid transparent',
                                bgcolor: isActive ? COLORS.panelBg : 'transparent',
                                '&:hover': { bgcolor: isActive ? COLORS.panelBg : COLORS.surface },
                              }}>
                                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: dotColor, flexShrink: 0 }} />
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
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.55rem', fontWeight: 800, color: COLORS.accent, my: 0.5, letterSpacing: '0.04em' }}>
                        {String(group.year).slice(-2)}
                      </Typography>
                      {group.records.map((entry) => {
                        const isActive = activeRecordIndex === entry.index;
                        const dotColor = getRecordColor(entry.recordType);
                        return (
                          <Tooltip key={entry.index} title={`${entry.dateLabel} — ${entry.diagnosis}`} placement="right" arrow>
                            <Box onClick={() => scrollToRecord(entry.index)} sx={{
                              width: 8, height: 8, borderRadius: '50%', my: 0.3,
                              bgcolor: isActive ? dotColor : 'transparent',
                              border: `2px solid ${dotColor}`,
                              cursor: 'pointer', transition: 'all 0.15s ease',
                              '&:hover': { transform: 'scale(1.5)', bgcolor: dotColor },
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
                  {/* Header Row */}
                  <Box onClick={() => toggleRecord(index)} sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, px: 2,
                    bgcolor: isExpanded ? COLORS.cardBg : 'transparent',
                    borderRadius: 0,
                    border: isExpanded ? `1px solid ${COLORS.border}` : '1px solid transparent',
                    borderBottom: isExpanded ? 'none' : '1px solid transparent',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    '&:hover': { bgcolor: isExpanded ? COLORS.cardBg : COLORS.borderLight },
                  }}>
                    <Box sx={{ width: 3, height: 24, borderRadius: 2, bgcolor: rc, flexShrink: 0 }} />
                    <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary, minWidth: 88, flexShrink: 0 }}>{dateStr}</Typography>
                    {/* T3.81: Per-service chips — falls back to [serviceType] for legacy records */}
                    {(rec.serviceNames?.length > 0 ? rec.serviceNames : [rec.serviceType || rec.recordType || 'medical']).map((svcName, si) => (
                      <Box key={si} sx={{ px: 0.75, py: 0.2, borderRadius: 0, bgcolor: `${rc}12`, textAlign: 'center' }}>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 800, color: rc, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                          {svcName}
                        </Typography>
                      </Box>
                    ))}
                    <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.diagnosis || 'Clinical Visit'}</Typography>
                    {/* T2.457: Case-day badge for multi-day cases */}
                    {caseDayMap[rec.id] && (
                      <Chip
                        label={`Day ${caseDayMap[rec.id].caseDay}${caseDayMap[rec.id].totalDays > 1 ? ` of ${caseDayMap[rec.id].totalDays}` : ''}`}
                        size="small"
                        sx={{
                          fontFamily: FONT,
                          fontSize: '0.62rem',
                          fontWeight: 800,
                          height: 20,
                          bgcolor: caseDayMap[rec.id].caseDay === 1 ? COLORS.chipBlueBg : COLORS.warningSurface,
                          color: caseDayMap[rec.id].caseDay === 1 ? COLORS.medical : COLORS.warning,
                          border: `1px solid ${caseDayMap[rec.id].caseDay === 1 ? COLORS.medical : COLORS.warning}`,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    {/* T3.85: Patient status badge */}
                    {rec.patientStatus && (() => {
                      const status = rec.patientStatus.toLowerCase();
                      const statusColors = {
                        critical: { bgcolor: COLORS.dangerSurface, color: COLORS.danger, border: `1px solid ${COLORS.danger}` },
                        guarded:  { bgcolor: COLORS.warningSurface, color: COLORS.warning, border: `1px solid ${COLORS.warning}` },
                        stable:   { bgcolor: COLORS.kpiGreenBg, color: COLORS.success, border: `1px solid ${COLORS.success}` },
                      };
                      const sc = statusColors[status] || statusColors.stable;
                      return (
                        <Chip
                          label={rec.patientStatus.toUpperCase()}
                          size="small"
                          sx={{
                            fontFamily: FONT,
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            height: 20,
                            borderRadius: 0,
                            flexShrink: 0,
                            textTransform: 'uppercase',
                            bgcolor: sc.bgcolor,
                            color: sc.color,
                            border: sc.border,
                          }}
                        />
                      );
                    })()}
                    {!isExpanded && hasV && <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, display: { xs: 'none', md: 'block' } }}>{[rv.weight&&`${rv.weight}kg`,rv.temp&&`${rv.temp}°C`,rv.hr&&`${rv.hr}bpm`].filter(Boolean).join(' · ')}</Typography>}
                    {!isExpanded && hasRx && <MedicationIcon sx={{ fontSize: 14, color: COLORS.rxText, opacity: 0.6 }} />}
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, flexShrink: 0 }}>{rec.vetName || '—'}</Typography>
                    <Box sx={{ color: COLORS.textMuted }}>{isExpanded ? <ExpandLessIcon sx={{ fontSize: 18 }}/> : <ExpandMoreIcon sx={{ fontSize: 18 }}/>}</Box>
                  </Box>

                  {/* Expanded Body */}
                  <Collapse in={isExpanded} timeout={200}>
                    <Box sx={{ bgcolor: COLORS.cardBg, px: 3, pb: 2.5, pt: 1.5, border: `1px solid ${COLORS.border}`, borderTop: `1px solid ${COLORS.borderLight}`, borderRadius: 0, boxShadow: '0 2px 8px rgba(62,39,35,0.04)' }}>
                      <Grid container spacing={3}>
                        <Grid size={{ xs: 12, md: 8 }}>
                          <Stack spacing={1.5}>
                            {/* T3.70: Show intake context for records created after the restructure */}
                            {(rec.intakeContext?.clientNotes || rec.intakeContext?.staffNotes) && (
                              <Box sx={{ bgcolor: COLORS.formBg, border: `1px solid ${COLORS.borderLight}`, p: 1.5, borderRadius: 0 }}>
                                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5, fontSize: '0.6rem' }}>
                                  INTAKE NOTES
                                </Typography>
                                {rec.intakeContext.clientNotes && (
                                  <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.medical, fontWeight: 700, mb: 0.25 }}>
                                    CLIENT: {rec.intakeContext.clientNotes}
                                  </Typography>
                                )}
                                {rec.intakeContext.staffNotes && (
                                  <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.warning, fontWeight: 700 }}>
                                    STAFF TRIAGE: {rec.intakeContext.staffNotes}
                                  </Typography>
                                )}
                              </Box>
                            )}
                            <Box>
                              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5 }}>Subjective</Typography>
                              <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: hasS ? COLORS.textPrimary : COLORS.textMuted, pl: 1.5, borderLeft: `2px solid ${COLORS.borderLight}`, fontStyle: hasS ? 'normal' : 'italic' }}>{hasS ? rec.soap.subjective : '—'}</Typography>
                            </Box>
                            <Box>
                              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5 }}>Objective</Typography>
                              <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: hasO ? COLORS.textPrimary : COLORS.textMuted, whiteSpace: 'pre-wrap', pl: 1.5, borderLeft: `2px solid ${COLORS.borderLight}`, fontStyle: hasO ? 'normal' : 'italic' }}>{hasO ? resolveObjectiveText(rec) : '—'}</Typography>
                            </Box>
                            {/* T3.87: Assessment — the A in SOAP */}
                            {rec.soap?.assessment && (
                              <Box>
                                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5 }}>Assessment</Typography>
                                <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textPrimary, whiteSpace: 'pre-wrap', pl: 1.5, borderLeft: `2px solid ${COLORS.success}` }}>{rec.soap.assessment}</Typography>
                              </Box>
                            )}
                            <Box sx={{ bgcolor: COLORS.planBg, py: 1, px: 1.5, borderRadius: 0, borderLeft: `3px solid ${COLORS.planBorder}` }}>
                              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.planText, mb: 0.25 }}>Plan / Treatment</Typography>
                              <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: hasT ? COLORS.planText : COLORS.textMuted, whiteSpace: 'pre-wrap', fontStyle: hasT ? 'normal' : 'italic' }}>{hasT ? rec.treatment : '—'}</Typography>
                            </Box>
                            {/* T3.83: Discharge / going-home summary */}
                            {rec.dischargeSummary && (
                              <Box sx={{ bgcolor: COLORS.cream, border: `1px solid ${COLORS.peach}`, p: 1.5, borderRadius: 0 }}>
                                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.warning, mb: 0.75 }}>
                                  Going-Home Instructions
                                </Typography>
                                {rec.dischargeSummary.diagnosis && (
                                  <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary, mb: 0.75 }}>
                                    {rec.dischargeSummary.diagnosis}
                                  </Typography>
                                )}
                                {rec.dischargeSummary.instructions && (
                                  <Stack spacing={0.25} sx={{ mb: 0.75 }}>
                                    {rec.dischargeSummary.instructions
                                      .split('\n')
                                      .filter(line => line.trim())
                                      .map((line, i) => (
                                        <Typography key={i} sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textPrimary }}>
                                          — {line.trim()}
                                        </Typography>
                                      ))}
                                  </Stack>
                                )}
                                {rec.dischargeSummary.medications?.length > 0 && (
                                  <Stack spacing={0.25} sx={{ mb: 0.75 }}>
                                    {rec.dischargeSummary.medications.map((med, i) => (
                                      <Typography key={i} sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textPrimary }}>
                                        <Typography component="span" sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary }}>
                                          {med.name}
                                        </Typography>
                                        {med.qty ? ` x${med.qty}` : ''}
                                        {med.instructions ? ` — ${med.instructions}` : ''}
                                      </Typography>
                                    ))}
                                  </Stack>
                                )}
                                {rec.dischargeSummary.nextVisit && (
                                  <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.danger, mb: 0.25 }}>
                                    Follow-up: {rec.dischargeSummary.nextVisit}
                                  </Typography>
                                )}
                                {rec.dischargeSummary.recheckIn && (
                                  <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textSecondary, mb: 0.25 }}>
                                    Recheck in: {rec.dischargeSummary.recheckIn}
                                  </Typography>
                                )}
                                {rec.dischargeSummary.vetName && (
                                  <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, mt: 0.5 }}>
                                    Signed by {rec.dischargeSummary.vetName}
                                  </Typography>
                                )}
                              </Box>
                            )}
                            {/* T3.84: Lab results */}
                            {rec.labResults?.length > 0 && (
                              <Box sx={{ bgcolor: COLORS.kpiBlueBg, border: `1px solid ${COLORS.kpiBlueBorder}`, py: 1, px: 1.5, borderRadius: 0 }}>
                                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.info, mb: 0.75, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <ScienceIcon sx={{ fontSize: 13 }} />
                                  Lab Results ({rec.labResults.length})
                                </Typography>
                                <Stack spacing={1}>
                                  {rec.labResults.map((lab, i) => {
                                    const labStatus = (lab.status || '').toLowerCase();
                                    const labChipColors = {
                                      normal:   { bgcolor: COLORS.kpiGreenBg, color: COLORS.success },
                                      abnormal: { bgcolor: COLORS.warningSurface, color: COLORS.warning },
                                      critical: { bgcolor: COLORS.dangerSurface, color: COLORS.danger },
                                    };
                                    const lc = labChipColors[labStatus] || labChipColors.normal;
                                    return (
                                      <Box key={i}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <Box sx={{ flex: 1, minWidth: 0, mr: 1 }}>
                                            <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary }}>{lab.testName}</Typography>
                                            <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textSecondary }}>{lab.result}</Typography>
                                          </Box>
                                          <Chip
                                            label={(lab.status || 'normal').toUpperCase()}
                                            size="small"
                                            sx={{
                                              fontFamily: FONT,
                                              fontSize: '0.62rem',
                                              fontWeight: 800,
                                              height: 20,
                                              borderRadius: 0,
                                              flexShrink: 0,
                                              bgcolor: lc.bgcolor,
                                              color: lc.color,
                                            }}
                                          />
                                        </Box>
                                        {lab.notes && (
                                          <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted, fontStyle: 'italic', mt: 0.25 }}>
                                            {lab.notes}
                                          </Typography>
                                        )}
                                      </Box>
                                    );
                                  })}
                                </Stack>
                              </Box>
                            )}
                          </Stack>
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                          <Stack spacing={1.5}>
                            {hasV && (
                              <Box sx={{ bgcolor: COLORS.vitalsBg, py: 1, px: 1.5, borderRadius: 0, border: `1px solid ${COLORS.borderLight}` }}>
                                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.75 }}>Vitals</Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5 }}>
                                  {rv.weight && <Box><Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>Wt</Typography><Typography sx={{ fontFamily: FONT, ...TYPE.emphasis, color: COLORS.textPrimary }}>{rv.weight} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: COLORS.textMuted }}>kg</span></Typography></Box>}
                                  {rv.temp && <Box><Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>Temp</Typography><Typography sx={{ fontFamily: FONT, ...TYPE.emphasis, color: COLORS.textPrimary }}>{rv.temp} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: COLORS.textMuted }}>°C</span></Typography></Box>}
                                  {rv.hr && <Box><Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>HR</Typography><Typography sx={{ fontFamily: FONT, ...TYPE.emphasis, color: COLORS.textPrimary }}>{rv.hr} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: COLORS.textMuted }}>bpm</span></Typography></Box>}
                                  {rv.rr != null && rv.rr !== '' && <Box><Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>RR</Typography><Typography sx={{ fontFamily: FONT, ...TYPE.emphasis, color: COLORS.textPrimary }}>{rv.rr} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: COLORS.textMuted }}>br/min</span></Typography></Box>}
                                  {rv.crt != null && rv.crt !== '' && <Box><Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>CRT</Typography><Typography sx={{ fontFamily: FONT, ...TYPE.emphasis, color: COLORS.textPrimary }}>{rv.crt} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: COLORS.textMuted }}>sec</span></Typography></Box>}
                                  {rv.bcs != null && rv.bcs !== '' && <Box><Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>BCS</Typography><Typography sx={{ fontFamily: FONT, ...TYPE.emphasis, color: COLORS.textPrimary }}>{rv.bcs} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: COLORS.textMuted }}>/9</span></Typography></Box>}
                                  {rv.pain != null && rv.pain !== '' && <Box><Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>Pain</Typography><Typography sx={{ fontFamily: FONT, ...TYPE.emphasis, color: COLORS.textPrimary }}>{rv.pain} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: COLORS.textMuted }}>/10</span></Typography></Box>}
                                </Box>
                              </Box>
                            )}
                            {hasRx && (() => {
                              const allRx = rec.dispensedProducts || rec.prescriptions || [];
                              const drugs = allRx.filter(rx => rx.isDrug || rx.isMedicine);
                              const nonDrugs = allRx.filter(rx => !rx.isDrug && !rx.isMedicine);
                              return (
                                <>
                                  {drugs.length > 0 && (
                                    <Box sx={{ bgcolor: COLORS.rxBg, py: 1, px: 1.5, borderRadius: 0, border: `1px solid ${COLORS.rxBorder}` }}>
                                      <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.rxText, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <MedicationIcon sx={{ fontSize: 13 }}/> Rx
                                      </Typography>
                                      <Stack spacing={0.5}>
                                        {drugs.map((rx, idx) => (
                                          <Box key={idx}>
                                            <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.rxText }}>
                                              {rx.name}{rx.qty ? ` x${rx.qty}` : ''}
                                            </Typography>
                                            {rx.instructions && <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: '#B45309' }}>{rx.instructions}</Typography>}
                                          </Box>
                                        ))}
                                      </Stack>
                                    </Box>
                                  )}
                                  {nonDrugs.length > 0 && (
                                    <Box sx={{ bgcolor: COLORS.formBg, py: 1, px: 1.5, borderRadius: 0, border: `1px solid ${COLORS.borderLight}` }}>
                                      <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Inventory2Icon sx={{ fontSize: 13 }}/> Dispensed Products
                                      </Typography>
                                      <Stack spacing={0.5}>
                                        {nonDrugs.map((rx, idx) => (
                                          <Box key={idx}>
                                            <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textSecondary }}>
                                              {rx.name}{rx.qty ? ` x${rx.qty}` : ''}
                                            </Typography>
                                            {rx.instructions && <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textMuted }}>{rx.instructions}</Typography>}
                                          </Box>
                                        ))}
                                      </Stack>
                                    </Box>
                                  )}
                                </>
                              );
                            })()}
                            {/* T3.86: Attachments */}
                            {rec.attachments?.length > 0 && (
                              <Box sx={{ bgcolor: COLORS.formBg, border: `1px solid ${COLORS.borderLight}`, py: 1, px: 1.5, borderRadius: 0 }}>
                                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <AttachFileIcon sx={{ fontSize: 13 }} />
                                  Attachments ({rec.attachments.length})
                                </Typography>
                                <Stack spacing={0.5}>
                                  {rec.attachments.map((file, i) => (
                                    <Typography
                                      key={i}
                                      component="a"
                                      href={file.url || file}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      sx={{
                                        fontFamily: FONT,
                                        ...TYPE.body,
                                        color: COLORS.medical,
                                        textDecoration: 'underline',
                                        cursor: 'pointer',
                                        display: 'block',
                                      }}
                                    >
                                      {file.name || `Attachment ${i + 1}`}
                                    </Typography>
                                  ))}
                                </Stack>
                              </Box>
                            )}
                          </Stack>
                        </Grid>
                      </Grid>

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
                              })}
                          </Stack>
                        </Box>
                      )}

                      {/* T3.118: Amendment creation button — sealed records only */}
                      {rec.legal?.isLocked === true && rec.appointmentId && (
                        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: rec.amendments?.length > 0 ? 'none' : `1px dashed ${COLORS.borderLight}` }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<ShieldIcon sx={{ fontSize: 13 }} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAmendTargetApptId(rec.appointmentId);
                              setAmendDialogOpen(true);
                            }}
                            sx={{
                              fontWeight: 900,
                              borderRadius: 0,
                              color: COLORS.warning,
                              borderColor: COLORS.warning,
                              fontSize: '0.72rem',
                              textTransform: 'uppercase',
                              '&:hover': { bgcolor: COLORS.warningSurface, borderColor: COLORS.warning },
                            }}
                          >
                            Add Amendment
                          </Button>
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

                      {/* Record footer: Rebook + Print Visit Summary */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5, pt: 1, borderTop: `1px solid ${COLORS.borderLight}` }}>
                        {/* T2.458: Rebook — opens WalkInModal with this pet/owner prefilled */}
                        <Button
                          size="small"
                          disabled={isErased}
                          startIcon={<EventAvailableIcon sx={{ fontSize: '14px !important' }} />}
                          onClick={(e) => { e.stopPropagation(); setQuickBookOpen(true); }}
                          sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.75rem', textTransform: 'none', color: COLORS.success }}
                        >
                          Rebook
                        </Button>
                        <Button
                          size="small"
                          startIcon={<PrintIcon sx={{ fontSize: '14px !important' }} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            const html = generateVisitSummaryHTML({
                              record: rec,
                              pet,
                              owner,
                              clinicName: clinicSettings.clinicName,
                              clinicAddress: clinicSettings.clinicAddress,
                            });
                            openPrintWindow(html, () => setPrintBlockedToast(true));
                          }}
                          sx={{
                            fontFamily: FONT, fontWeight: 700, fontSize: '0.75rem',
                            textTransform: 'none', color: COLORS.accent,
                          }}
                        >
                          Print Visit Summary
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
                  current:  { bg: '#E8F5E9',          text: COLORS.success,   icon: <CheckCircleOutlineIcon sx={{ fontSize: 13, color: COLORS.success }} /> },
                  due_soon: { bg: COLORS.cream,        text: '#F57F17',        icon: <WarningAmberIcon sx={{ fontSize: 13, color: '#F57F17' }} /> },
                  overdue:  { bg: COLORS.dangerSurface, text: COLORS.surgery,  icon: <ErrorOutlineIcon sx={{ fontSize: 13, color: COLORS.surgery }} /> },
                  unknown:  { bg: COLORS.tableHeaderBg, text: COLORS.textMuted, icon: null },
                };
                const c = statusColors[vax.status];
                const statusLabel = vax.status === 'current'  ? `Due in ${vax.daysUntilDue}d`
                  : vax.status === 'due_soon' ? `Due in ${vax.daysUntilDue}d`
                  : vax.status === 'overdue'  ? `${Math.abs(vax.daysUntilDue)}d overdue`
                  : 'No record';

                return (
                  <Box key={vax.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5, px: 1, borderRadius: 0, bgcolor: c.bg }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {c.icon}
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 600, color: c.text }}>{vax.name}</Typography>
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
                onClick={() => {
                  const html = generateVaccinationRecordHTML({
                    pet,
                    owner,
                    vaccineRecords,
                    clinicName: clinicSettings.clinicName,
                    clinicAddress: clinicSettings.clinicAddress,
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
                onClick={() => {
                  const html = generateVaccinationRecordHTML({
                    pet,
                    owner,
                    vaccineRecords,
                    clinicName: clinicSettings.clinicName,
                    clinicAddress: clinicSettings.clinicAddress,
                    mode: 'passport',
                    vaccineCatalog,
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


          {/* T2.459: Lab Results Aggregation — only renders when pet has lab data */}
          {aggregatedLabResults.length > 0 && (
            <Widget title={`Lab Results (${aggregatedLabResults.length})`} icon={<AssignmentIcon sx={{ fontSize: 14, color: COLORS.medical }} />}>
              <Stack spacing={1}>
                {aggregatedLabResults.map((lab, i) => {
                  const statusKey = (lab.status || 'normal').toLowerCase();
                  const statusColor = statusKey === 'critical' ? COLORS.danger : statusKey === 'abnormal' ? COLORS.warning : COLORS.success;
                  const statusBg = statusKey === 'critical' ? COLORS.dangerSurface : statusKey === 'abnormal' ? COLORS.warningSurface : '#E8F5E9';
                  return (
                    <Box key={i} sx={{ py: 0.75, borderBottom: i < aggregatedLabResults.length - 1 ? `1px solid ${COLORS.borderLight}` : 'none' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 700, color: COLORS.textPrimary }}>{lab.testName}</Typography>
                        <Chip
                          label={statusKey.toUpperCase()}
                          size="small"
                          sx={{ fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, height: 18, bgcolor: statusBg, color: statusColor, border: `1px solid ${statusColor}` }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.25 }}>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', fontWeight: 800, color: statusColor }}>
                          {lab.result}{lab.unit ? ` ${lab.unit}` : ''}
                        </Typography>
                        {lab.referenceRange && (
                          <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted }}>
                            (ref: {lab.referenceRange})
                          </Typography>
                        )}
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
              <Stack spacing={0.75}>
                {ownerSales.filter(s => (s.balanceRemaining || 0) > 0 && s.status !== 'refunded' && s.status !== 'voided').map((sale, i) => {
                  const saleDateStr = sale.date?.toDate ? sale.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                  return (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
                      <Box>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 700, color: COLORS.textPrimary }}>{saleDateStr}</Typography>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.danger, fontWeight: 700 }}>₱{(sale.balanceRemaining || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} remaining</Typography>
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={isErased}
                        onClick={() => { setRecordPaymentTarget(sale); setRecordPaymentAmount(''); setRecordPaymentOpen(true); }}
                        sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 800, borderRadius: 0, color: COLORS.success, borderColor: '#A5D6A7', textTransform: 'none', py: 0.25, px: 1 }}
                      >
                        Record Payment
                      </Button>
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
    </Box>
  );
}
