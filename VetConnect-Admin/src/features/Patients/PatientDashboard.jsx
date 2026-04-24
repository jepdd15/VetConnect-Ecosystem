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
import { doc, getDoc, collection, query, where, orderBy, getDocs, Timestamp, updateDoc } from 'firebase/firestore';

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
import EventNoteIcon from '@mui/icons-material/EventNote';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import PrintIcon from '@mui/icons-material/Print';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';

// Charting
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

// ── Design Tokens (shared across all VetConnect pages) ─────────
import { FONT, TYPE, COLORS, getRecordColor, getInitialColor } from '../../theme/designTokens';

// ── Clinic Settings ─────────────────────────────────────────────
import { useClinicSettings } from '../../hooks/useClinicSettings';

// ── Printable Document Generators ──────────────────────────────
import { openPrintWindow } from '../../utils/printUtils';
import { generateVisitSummaryHTML } from '../../utils/printVisitSummary';
import { generateVaccinationRecordHTML } from '../../utils/printVaccinationRecord';

// ── Vaccine Catalog & Helpers ────────────────────────────────────
import { VACCINE_CATALOG, getVaccineAdministrations, resolveVaccineFromName } from '../../utils/vaccineConstants';

// ── Modals ──────────────────────────────────────────────────────
import ReferralModal from './components/ReferralModal';

// ── Analytics Widget Shell ──
const Widget = ({ title, icon, children }) => (
  <Box sx={{ bgcolor: COLORS.cardBg, borderRadius: 2, border: `1px solid ${COLORS.borderLight}`, mb: 2, overflow: 'hidden' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: `1px solid ${COLORS.borderLight}`, bgcolor: '#FAF8F5' }}>
      {icon}
      <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textSecondary, letterSpacing: '0.05em' }}>{title}</Typography>
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

  const [pet, setPet] = useState(location.state?.pet || null);
  const [history, setHistory] = useState([]);
  const [vitalsData, setVitalsData] = useState([]);
  const [tempData, setTempData] = useState([]);
  const [hrData, setHrData] = useState([]);
  const [owner, setOwner] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [nextAppointment, setNextAppointment] = useState(null);
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
  const [recordPaymentTarget, setRecordPaymentTarget] = useState(null);
  const [recordPaymentAmount, setRecordPaymentAmount] = useState('');

  const clinicSettings = useClinicSettings();

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

        const historyData = await Promise.all(snapshot.docs.map(async (docSnap) => {
          const rec = { id: docSnap.id, ...docSnap.data() };
          // D5: Prefer native prescriptions; fall back to appointment join for legacy records
          if (!rec.prescriptions && rec.appointmentId) {
            try {
              const apptDoc = await getDoc(doc(db, "appointments", rec.appointmentId));
              if (apptDoc.exists()) {
                const apptData = apptDoc.data();
                rec.serviceType = rec.serviceType || apptData.serviceType;
                rec.prescriptions = apptData.prescribedItems || [];
              }
            } catch (e) {
              console.warn(`[PatientDashboard] Legacy join failed for ${rec.appointmentId}:`, e);
            }
          }
          return rec;
        }));
        setHistory(historyData);

        // Process vitals
        const wt = [], tp = [], hr = [];
        historyData.forEach(rec => {
          if (!rec.date) return;
          const label = new Date(rec.date.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          if (rec.vitals?.weight) wt.push({ date: label, weight: parseFloat(rec.vitals.weight) });
          if (rec.vitals?.temp) tp.push({ date: label, temp: parseFloat(rec.vitals.temp) });
          if (rec.vitals?.hr) hr.push({ date: label, hr: parseInt(rec.vitals.hr) });
        });
        setVitalsData(wt.reverse());
        setTempData(tp.reverse());
        setHrData(hr.reverse());

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

        // Fetch upcoming appointment
        try {
          const apptQ = query(collection(db, 'appointments'), where('petId', '==', id));
          const apptSnap = await getDocs(apptQ);
          const now = new Date();
          const future = apptSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(a => {
              const aDate = a.date?.toDate ? a.date.toDate() : (a.date?.seconds ? new Date(a.date.seconds * 1000) : null);
              return aDate && aDate > now && !['completed', 'cancelled', 'no-show'].includes(a.status);
            })
            .sort((a, b) => {
              const dA = a.date?.seconds || 0, dB = b.date?.seconds || 0;
              return dA - dB;
            });
          setNextAppointment(future.length > 0 ? future[0] : null);
        } catch (e) { console.warn('Appointment fetch skipped:', e); }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboardData();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const calculateAge = (dob) => {
    if (!dob) return '—';
    try {
      const birthDate = dob.toDate ? dob.toDate() : new Date(dob);
      if (isNaN(birthDate.getTime())) return '—';
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
      if (age < 0) return '—';
      if (age === 0) { const mo = Math.floor((today - birthDate) / (1000*60*60*24*30.44)); return mo > 0 ? `${mo}mo` : 'Newborn'; }
      return `${age}y`;
    } catch { return '—'; }
  };

  const lastSeenLabel = useMemo(() => {
    if (!history?.length) return null;
    const s = history[0]?.date?.seconds;
    if (!s) return null;
    const d = Math.floor((Date.now() / 1000 - s) / 86400);
    return d === 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 30 ? `${d}d ago` : d < 365 ? `${Math.floor(d/30)}mo ago` : `${Math.floor(d/365)}y ago`;
  }, [history]);

  const availableServices = useMemo(() => {
    if (!history?.length) return [];
    return Array.from(new Set(history.map(r => r.recordType || 'medical'))).sort();
  }, [history]);

  const processedHistory = useMemo(() => {
    let f = [...(history || [])];
    if (timelineSearch) {
      const q = timelineSearch.toLowerCase();
      f = f.filter(r => [r.diagnosis, r.vetName, r.soap?.subjective, r.soap?.objectiveNotes, r.treatment].some(v => v?.toLowerCase().includes(q)));
    }
    if (timelineFilter !== 'All') f = f.filter(r => (r.recordType || 'medical') === timelineFilter);
    f.sort((a, b) => { const dA = a.date?.seconds||0, dB = b.date?.seconds||0; return timelineSort === 'desc' ? dB-dA : dA-dB; });
    return f;
  }, [history, timelineSearch, timelineFilter, timelineSort]);

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

  // All prescriptions aggregated
  const allPrescriptions = useMemo(() => {
    const rxMap = new Map();
    (history || []).forEach(r => {
      (r.prescriptions || []).forEach(rx => {
        if (rx.name && !rxMap.has(rx.name)) {
          const dateStr = r.date?.toDate ? r.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          rxMap.set(rx.name, { ...rx, date: dateStr, recordType: r.recordType });
        }
      });
    });
    return Array.from(rxMap.values());
  }, [history]);

  // T2.101: Computed outstanding balance — sum of balanceRemaining across all non-refunded/voided sales.
  // This is authoritative; the legacy outstandingBalance counter on the user doc is no longer updated.
  const computedOutstandingBalance = useMemo(() => {
    return ownerSales
      .filter(s => s.status !== 'refunded' && s.status !== 'voided')
      .reduce((sum, s) => sum + (s.balanceRemaining || 0), 0);
  }, [ownerSales]);

  // T2.24-27: Aggregated lab results — most recent result per test name across all records.
  // Grouped by testName, showing the latest value and date for trend context.
  const aggregatedLabResults = useMemo(() => {
    const testMap = new Map();
    (history || []).slice().reverse().forEach(r => {
      (r.labResults || []).forEach(lab => {
        if (!lab.testName) return;
        const dateStr = r.date?.toDate ? r.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        if (!testMap.has(lab.testName)) {
          testMap.set(lab.testName, { testName: lab.testName, result: lab.result, status: lab.status || 'normal', date: dateStr });
        }
      });
    });
    return Array.from(testMap.values());
  }, [history]);

  // Vaccination tracker — uses VACCINE_CATALOG for canonical vaccine list.
  // Primary: match vaccineAdministrations[].vaccineName via resolveVaccineFromName (id-based match).
  // Fallback: keyword-match against SOAP text for legacy records pre-dating the structured form.
  const vaccinationStatus = useMemo(() => {
    const records = history || [];

    return VACCINE_CATALOG.map(catalogVax => {
      // --- Structured path: find the MOST RECENT vaccineAdministration matching this catalog entry ---
      let structuredMatch = null;
      let matchedAdmin = null;
      let bestTime = 0;
      for (const r of records) {
        const admins = getVaccineAdministrations(r);
        const admin = admins.find(a => {
          const resolved = resolveVaccineFromName(a.vaccineName);
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
        const text = [r.diagnosis, r.treatment, r.soap?.subjective, r.soap?.objectiveNotes]
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
  }, [history]);

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
      alert('Failed to record payment: ' + e.message);
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
  const hasAllergies = pet?.allergies && !['None','None recorded',''].includes(pet.allergies);

  return (
    <Box sx={{ m: -4, display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: COLORS.surface, overflow: 'hidden', fontFamily: FONT }}>

      {/* ═══ PATIENT BANNER ═══ */}
      <Box sx={{ bgcolor: COLORS.banner, borderBottom: `2px solid ${COLORS.bannerBorder}`, display: 'flex', alignItems: 'center', flexShrink: 0, boxShadow: '0 1px 4px rgba(62,39,35,0.08)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', py: 1.5, px: 2, gap: 2, flex: 1 }}>
          <IconButton onClick={() => navigate('/patients')} size="small" sx={{ color: COLORS.textMuted, '&:hover': { color: COLORS.brand, bgcolor: '#EFEBE9' } }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <Avatar sx={{ width: 42, height: 42, fontFamily: FONT, bgcolor: getInitialColor(pet?.name), fontWeight: 700, fontSize: '1rem', color: '#FFF' }}>
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
              <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary }}>Age: <span style={{ color: COLORS.brand, fontWeight: 700 }}>{calculateAge(pet?.dob)}</span></Typography>
              <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary }}>Wt: <span style={{ color: '#E65100', fontWeight: 700 }}>{pet?.lastWeight ? `${pet.lastWeight}kg` : 'N/A'}</span></Typography>
              {computedOutstandingBalance > 0 && (
                <Tooltip title="This client has an unpaid balance computed from sales records.">
                  <Chip
                    label={`₱${computedOutstandingBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} OWED`}
                    size="small"
                    sx={{
                      bgcolor: '#FFEBEE', color: '#B71C1C',
                      fontWeight: 900, fontSize: '0.72rem',
                      height: 22, border: '1px solid #EF9A9A',
                      fontFamily: FONT, animation: 'pulse 2s infinite'
                    }}
                  />
                </Tooltip>
              )}
              {hasAllergies ? (
                <Chip icon={<WarningAmberIcon sx={{ color: '#FFF !important', fontSize: 12 }} />} label={pet.allergies} size="small" sx={{ bgcolor: '#C62828', color: '#FFF', fontWeight: 700, fontSize: '0.72rem', height: 22, fontFamily: FONT }} />
              ) : (
                <Typography sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted, bgcolor: '#EFEBE9', px: 0.75, py: 0.25, borderRadius: 0.5 }}>NKA</Typography>
              )}
              {lastSeenLabel && (
                <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AccessTimeIcon sx={{ fontSize: 11 }} /> Last seen: <span style={{ fontWeight: 600, color: COLORS.textSecondary }}>{lastSeenLabel}</span>
                </Typography>
              )}
            </Box>
          </Box>
        </Box>

        {/* Search Toolkit */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, borderLeft: `1px solid ${COLORS.borderLight}`, borderRight: `1px solid ${COLORS.borderLight}`, py: 1.5 }}>
          <TextField size="small" placeholder="Search records..." value={timelineSearch} onChange={(e) => setTimelineSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: COLORS.textMuted, fontSize: 18 }} /></InputAdornment> }}
            sx={{ minWidth: 160, '& .MuiOutlinedInput-root': { fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textPrimary, bgcolor: '#FAFAF9', borderRadius: 1.5, height: 36, '& fieldset': { borderColor: COLORS.border } } }}
          />
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <Select value={timelineFilter} onChange={(e) => setTimelineFilter(e.target.value)}
              sx={{ fontFamily: FONT, fontWeight: 600, fontSize: '0.8rem', color: COLORS.textPrimary, bgcolor: '#FAFAF9', height: 36, borderRadius: 1.5, '& fieldset': { borderColor: COLORS.border } }}>
              <MenuItem value="All" sx={{ fontSize: '0.85rem' }}>All Types</MenuItem>
              <Divider />
              {availableServices.map(s => <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize', fontSize: '0.85rem', fontWeight: 600 }}>{s}</MenuItem>)}
            </Select>
          </FormControl>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>{processedHistory.length} rec</Typography>
          <IconButton size="small" onClick={() => setTimelineSort(p => p === 'desc' ? 'asc' : 'desc')}
            sx={{ color: COLORS.textMuted, border: `1px solid ${COLORS.border}`, borderRadius: 1.5, width: 36, height: 36, '&:hover': { bgcolor: '#EFEBE9' } }}>
            <SortIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5 }}>
          <Button variant="outlined" size="small" startIcon={<NoteAddIcon sx={{ fontSize: '15px !important' }} />} onClick={() => alert('Coming soon!')}
            sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.78rem', textTransform: 'none', color: COLORS.accent, borderColor: COLORS.border, borderRadius: 0, px: 2, height: 36, '&:hover': { borderColor: COLORS.accentLight, bgcolor: '#EFEBE9' } }}>
            Add Record
          </Button>
          <Button variant="contained" size="small" startIcon={<EventAvailableIcon sx={{ fontSize: '15px !important' }} />} onClick={() => navigate('/queue')}
            sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.78rem', textTransform: 'none', bgcolor: '#2E7D32', borderRadius: 0, px: 2, height: 36, boxShadow: 'none', '&:hover': { bgcolor: '#1B5E20' } }}>
            Book Visit
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<LocalHospitalIcon sx={{ fontSize: '15px !important' }} />}
            onClick={() => setReferralOpen(true)}
            sx={{
              fontFamily: FONT, fontWeight: 700, fontSize: '0.78rem', textTransform: 'none',
              color: COLORS.accent, borderColor: COLORS.border, borderRadius: 0,
              px: 2, height: 36, '&:hover': { borderColor: COLORS.accentLight, bgcolor: '#EFEBE9' },
            }}
          >
            Referral
          </Button>
        </Box>
      </Box>

      {/* ═══ MAIN SPLIT PANEL ═══ */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT: Collapsible TOC Sidebar ── */}
        {processedHistory.length > 0 && (
          <Box sx={{
            width: sidebarOpen ? 190 : 44, flexShrink: 0, bgcolor: '#FAF8F5',
            borderRight: `1px solid ${COLORS.borderLight}`, display: 'flex', flexDirection: 'column',
            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)', overflow: 'hidden',
          }}>
            {/* Toggle Button */}
            <Box sx={{ display: 'flex', justifyContent: sidebarOpen ? 'flex-end' : 'center', px: 0.5, py: 0.75, borderBottom: `1px solid ${COLORS.borderLight}`, flexShrink: 0 }}>
              <IconButton size="small" onClick={() => setSidebarOpen(p => !p)} sx={{ color: COLORS.textMuted, width: 28, height: 28, '&:hover': { bgcolor: '#EFEBE9' } }}>
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
                          cursor: 'pointer', '&:hover': { bgcolor: '#EFEBE9' },
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
                                bgcolor: isActive ? '#EFEBE9' : 'transparent',
                                '&:hover': { bgcolor: isActive ? '#EFEBE9' : '#F5F0EB' },
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
                  sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.75rem', textTransform: 'none', color: COLORS.textMuted, '&:hover': { bgcolor: '#EFEBE9' } }}>
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
              const hasS = rec.soap?.subjective, hasO = rec.soap?.objectiveNotes, hasT = rec.treatment;
              const hasV = rec.vitals && (rec.vitals.weight || rec.vitals.temp || rec.vitals.hr);
              const hasRx = rec.prescriptions?.length > 0;

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
                    borderRadius: isExpanded ? '8px 8px 0 0' : 1.5,
                    border: isExpanded ? `1px solid ${COLORS.border}` : '1px solid transparent',
                    borderBottom: isExpanded ? 'none' : '1px solid transparent',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    '&:hover': { bgcolor: isExpanded ? COLORS.cardBg : '#EDE7E0' },
                  }}>
                    <Box sx={{ width: 3, height: 24, borderRadius: 2, bgcolor: rc, flexShrink: 0 }} />
                    <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary, minWidth: 88, flexShrink: 0 }}>{dateStr}</Typography>
                    <Box sx={{ px: 0.75, py: 0.2, borderRadius: 0.5, bgcolor: `${rc}12`, minWidth: 55, textAlign: 'center' }}>
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 800, color: rc, textTransform: 'uppercase', letterSpacing: 0.8 }}>{rec.recordType || 'medical'}</Typography>
                    </Box>
                    <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.diagnosis || 'Clinical Visit'}</Typography>
                    {!isExpanded && hasV && <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, display: { xs: 'none', md: 'block' } }}>{[rec.vitals.weight&&`${rec.vitals.weight}kg`,rec.vitals.temp&&`${rec.vitals.temp}°C`,rec.vitals.hr&&`${rec.vitals.hr}bpm`].filter(Boolean).join(' · ')}</Typography>}
                    {!isExpanded && hasRx && <MedicationIcon sx={{ fontSize: 14, color: COLORS.rxText, opacity: 0.6 }} />}
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, flexShrink: 0 }}>{rec.vetName || '—'}</Typography>
                    <Box sx={{ color: COLORS.textMuted }}>{isExpanded ? <ExpandLessIcon sx={{ fontSize: 18 }}/> : <ExpandMoreIcon sx={{ fontSize: 18 }}/>}</Box>
                  </Box>

                  {/* Expanded Body */}
                  <Collapse in={isExpanded} timeout={200}>
                    <Box sx={{ bgcolor: COLORS.cardBg, px: 3, pb: 2.5, pt: 1.5, border: `1px solid ${COLORS.border}`, borderTop: `1px solid ${COLORS.borderLight}`, borderRadius: '0 0 8px 8px', boxShadow: '0 2px 8px rgba(62,39,35,0.04)' }}>
                      <Grid container spacing={3}>
                        <Grid size={{ xs: 12, md: 8 }}>
                          <Stack spacing={1.5}>
                            <Box>
                              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5 }}>Subjective</Typography>
                              <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: hasS ? COLORS.textPrimary : COLORS.textMuted, pl: 1.5, borderLeft: `2px solid ${COLORS.borderLight}`, fontStyle: hasS ? 'normal' : 'italic' }}>{hasS ? rec.soap.subjective : '—'}</Typography>
                            </Box>
                            <Box>
                              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5 }}>Objective</Typography>
                              <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: hasO ? COLORS.textPrimary : COLORS.textMuted, whiteSpace: 'pre-wrap', pl: 1.5, borderLeft: `2px solid ${COLORS.borderLight}`, fontStyle: hasO ? 'normal' : 'italic' }}>{hasO ? rec.soap.objectiveNotes : '—'}</Typography>
                            </Box>
                            <Box sx={{ bgcolor: COLORS.planBg, py: 1, px: 1.5, borderRadius: 1.5, borderLeft: `3px solid ${COLORS.planBorder}` }}>
                              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.planText, mb: 0.25 }}>Plan / Treatment</Typography>
                              <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: hasT ? COLORS.planText : COLORS.textMuted, whiteSpace: 'pre-wrap', fontStyle: hasT ? 'normal' : 'italic' }}>{hasT ? rec.treatment : '—'}</Typography>
                            </Box>
                          </Stack>
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                          <Stack spacing={1.5}>
                            {hasV && (
                              <Box sx={{ bgcolor: COLORS.vitalsBg, py: 1, px: 1.5, borderRadius: 1.5, border: `1px solid ${COLORS.borderLight}` }}>
                                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.75 }}>Vitals</Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5 }}>
                                  {rec.vitals.weight && <Box><Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>Wt</Typography><Typography sx={{ fontFamily: FONT, ...TYPE.emphasis, color: COLORS.textPrimary }}>{rec.vitals.weight} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: COLORS.textMuted }}>kg</span></Typography></Box>}
                                  {rec.vitals.temp && <Box><Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>Temp</Typography><Typography sx={{ fontFamily: FONT, ...TYPE.emphasis, color: COLORS.textPrimary }}>{rec.vitals.temp} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: COLORS.textMuted }}>°C</span></Typography></Box>}
                                  {rec.vitals.hr && <Box><Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>HR</Typography><Typography sx={{ fontFamily: FONT, ...TYPE.emphasis, color: COLORS.textPrimary }}>{rec.vitals.hr} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: COLORS.textMuted }}>bpm</span></Typography></Box>}
                                </Box>
                              </Box>
                            )}
                            {hasRx && (
                              <Box sx={{ bgcolor: COLORS.rxBg, py: 1, px: 1.5, borderRadius: 1.5, border: `1px solid ${COLORS.rxBorder}` }}>
                                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.rxText, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}><MedicationIcon sx={{ fontSize: 13 }}/> Rx</Typography>
                                <Stack spacing={0.5}>
                                  {rec.prescriptions.map((rx, idx) => (
                                    <Box key={idx}>
                                      <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.rxText }}>{rx.name}</Typography>
                                      {rx.instructions && <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: '#B45309' }}>{rx.instructions}</Typography>}
                                    </Box>
                                  ))}
                                </Stack>
                              </Box>
                            )}
                          </Stack>
                        </Grid>
                      </Grid>

                      {/* Print Visit Summary — stopPropagation prevents toggling the Collapse */}
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5, pt: 1, borderTop: `1px solid ${COLORS.borderLight}` }}>
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
        <Box sx={{ flex: 3, maxWidth: 320, minWidth: 240, overflowY: 'auto', bgcolor: '#FAF8F5', py: 2, px: 2, '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.timelineRail, borderRadius: 2 } }}>

          {/* Weight Trend */}
          <Widget title="Weight Trend" icon={<ScaleIcon sx={{ fontSize: 14, color: COLORS.accentLight }} />}>
            {vitalsData.length > 1 ? (
              <Box sx={{ width: '100%', height: 140, minWidth: 50 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <LineChart data={vitalsData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.borderLight} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: FONT }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: FONT }} domain={['dataMin - 1', 'dataMax + 1']} />
                    <RechartsTooltip contentStyle={{ fontSize: 11, fontFamily: FONT, borderRadius: 6, border: `1px solid ${COLORS.border}` }} />
                    <Line type="monotone" dataKey="weight" stroke={COLORS.accentLight} strokeWidth={2.5} dot={{ r: 3.5, fill: COLORS.accentLight }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 3, color: COLORS.textMuted }}>
                <ScaleIcon sx={{ fontSize: 28, opacity: 0.3, mb: 0.5 }} />
                <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontStyle: 'italic' }}>Insufficient data</Typography>
              </Box>
            )}
          </Widget>

          {/* Temperature Trend */}
          <Widget title="Temperature" icon={<ThermostatIcon sx={{ fontSize: 14, color: '#EF6C00' }} />}>
            {tempData.length > 1 ? (
              <Box sx={{ width: '100%', height: 110, minWidth: 50 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <LineChart data={tempData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.borderLight} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: FONT }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: FONT }} domain={[37, 41]} />
                    <RechartsTooltip contentStyle={{ fontSize: 11, fontFamily: FONT, borderRadius: 6 }} />
                    <Line type="monotone" dataKey="temp" stroke="#EF6C00" strokeWidth={2} dot={{ r: 3, fill: '#EF6C00' }} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', py: 2 }}>No temperature data yet</Typography>
            )}
          </Widget>

          {/* Heart Rate Trend */}
          <Widget title="Heart Rate" icon={<FavoriteIcon sx={{ fontSize: 14, color: '#E53935' }} />}>
            {hrData.length > 1 ? (
              <Box sx={{ width: '100%', height: 110, minWidth: 50 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <LineChart data={hrData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.borderLight} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: FONT }} />
                    <YAxis tick={{ fontSize: 10, fontFamily: FONT }} domain={['dataMin - 10', 'dataMax + 10']} />
                    <RechartsTooltip contentStyle={{ fontSize: 11, fontFamily: FONT, borderRadius: 6 }} />
                    <Line type="monotone" dataKey="hr" stroke="#E53935" strokeWidth={2} dot={{ r: 3, fill: '#E53935' }} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', py: 2 }}>No heart rate data yet</Typography>
            )}
          </Widget>

          {/* Visit Frequency */}
          <Widget title="Visit Frequency (6mo)" icon={<CalendarMonthIcon sx={{ fontSize: 14, color: COLORS.medical }} />}>
            <Box sx={{ width: '100%', height: 100, minWidth: 50 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <BarChart data={visitFreqData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: FONT }} />
                  <YAxis tick={{ fontSize: 10, fontFamily: FONT }} allowDecimals={false} />
                  <RechartsTooltip contentStyle={{ fontSize: 11, fontFamily: FONT, borderRadius: 6 }} />
                  <Bar dataKey="visits" fill={COLORS.accentLight} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Widget>

          {/* Active Prescriptions */}
          <Widget title={`Prescriptions (${allPrescriptions.length})`} icon={<MedicationIcon sx={{ fontSize: 14, color: COLORS.rxText }} />}>
            {allPrescriptions.length > 0 ? (
              <Stack spacing={1}>
                {allPrescriptions.map((rx, i) => (
                  <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.rxText }}>{rx.name}</Typography>
                      {rx.instructions && <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: '#B45309' }}>{rx.instructions}</Typography>}
                    </Box>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.textMuted, flexShrink: 0, ml: 1 }}>{rx.date}</Typography>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', py: 2 }}>No prescriptions on file</Typography>
            )}
          </Widget>

          {/* Vaccination Tracker */}
          <Widget title="Vaccination Status" icon={<VaccinesIcon sx={{ fontSize: 14, color: '#2E7D32' }} />}>
            <Stack spacing={0.75}>
              {vaccinationStatus.map((vax) => {
                const colors = {
                  current: { bg: '#E8F5E9', text: '#2E7D32', icon: <CheckCircleOutlineIcon sx={{ fontSize: 13, color: '#2E7D32' }} /> },
                  due_soon: { bg: '#FFF8E1', text: '#F57F17', icon: <WarningAmberIcon sx={{ fontSize: 13, color: '#F57F17' }} /> },
                  overdue: { bg: '#FFEBEE', text: '#C62828', icon: <ErrorOutlineIcon sx={{ fontSize: 13, color: '#C62828' }} /> },
                  unknown: { bg: '#F5F5F5', text: COLORS.textMuted, icon: null },
                };
                const c = colors[vax.status];
                const statusLabel = vax.status === 'current' ? `Due in ${vax.daysUntilDue}d`
                  : vax.status === 'due_soon' ? `Due in ${vax.daysUntilDue}d`
                  : vax.status === 'overdue' ? `${Math.abs(vax.daysUntilDue)}d overdue`
                  : 'No record';
                return (
                  <Box key={vax.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5, px: 1, borderRadius: 1, bgcolor: c.bg }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {c.icon}
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 600, color: c.text }}>{vax.name}</Typography>
                    </Box>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.68rem', fontWeight: 700, color: c.text }}>{statusLabel}</Typography>
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
                  textTransform: 'none', color: '#2E7D32', mt: 1,
                  borderTop: `1px solid ${COLORS.borderLight}`, borderRadius: 0, pt: 1,
                }}
              >
                Print Vaccination Record
              </Button>
            )}
          </Widget>

          {/* Upcoming Appointment */}
          <Widget title="Next Appointment" icon={<EventNoteIcon sx={{ fontSize: 14, color: COLORS.medical }} />}>
            {nextAppointment ? (() => {
              const apptDate = nextAppointment.date?.toDate
                ? nextAppointment.date.toDate()
                : (nextAppointment.date?.seconds ? new Date(nextAppointment.date.seconds * 1000) : null);
              const dateStr = apptDate ? apptDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
              const timeStr = apptDate ? apptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
              const daysAway = apptDate ? Math.ceil((apptDate.getTime() - Date.now()) / 86400000) : null;
              return (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary }}>{dateStr}</Typography>
                    {daysAway !== null && (
                      <Chip label={daysAway === 0 ? 'Today' : daysAway === 1 ? 'Tomorrow' : `In ${daysAway}d`} size="small"
                        sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 700, height: 20,
                          bgcolor: daysAway <= 1 ? '#FFF3E0' : '#E3F2FD',
                          color: daysAway <= 1 ? '#E65100' : COLORS.medical }} />
                    )}
                  </Box>
                  <Stack spacing={0.25}>
                    {timeStr && <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textSecondary }}>{timeStr}</Typography>}
                    {nextAppointment.serviceType && (
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: COLORS.textMuted, textTransform: 'capitalize' }}>{nextAppointment.serviceType}</Typography>
                    )}
                    {nextAppointment.vetName && (
                      <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: COLORS.textMuted }}>w/ {nextAppointment.vetName}</Typography>
                    )}
                  </Stack>
                </Box>
              );
            })() : (
              <Box sx={{ textAlign: 'center', py: 1.5 }}>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textMuted, fontStyle: 'italic', mb: 1 }}>No upcoming visits</Typography>
                <Button size="small" variant="outlined" startIcon={<EventAvailableIcon sx={{ fontSize: '14px !important' }} />}
                  sx={{ fontFamily: FONT, fontSize: '0.72rem', fontWeight: 700, textTransform: 'none', color: '#2E7D32', borderColor: '#A5D6A7', borderRadius: 1.5, '&:hover': { bgcolor: '#E8F5E9', borderColor: '#66BB6A' } }}>
                  Book Visit
                </Button>
              </Box>
            )}
          </Widget>

          {/* T2.24-27: Lab Results Aggregation */}
          {aggregatedLabResults.length > 0 && (
            <Widget title={`Lab Results (${aggregatedLabResults.length})`} icon={<AssignmentIcon sx={{ fontSize: 14, color: '#1565C0' }} />}>
              <Stack spacing={0.75}>
                {aggregatedLabResults.map((lab, i) => {
                  const statusKey = (lab.status || 'normal').toLowerCase();
                  const statusColor = statusKey === 'critical' ? '#D32F2F' : statusKey === 'abnormal' ? '#E65100' : '#2E7D32';
                  const statusBg = statusKey === 'critical' ? '#FFEBEE' : statusKey === 'abnormal' ? '#FFF3E0' : '#E8F5E9';
                  return (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
                      <Box>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 700, color: COLORS.textPrimary }}>{lab.testName}</Typography>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.textMuted }}>{lab.result} · {lab.date}</Typography>
                      </Box>
                      <Chip
                        label={statusKey.toUpperCase()}
                        size="small"
                        sx={{ fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, height: 18, bgcolor: statusBg, color: statusColor, border: `1px solid ${statusColor}` }}
                      />
                    </Box>
                  );
                })}
              </Stack>
            </Widget>
          )}

          {/* T2.101: Billing Ledger — outstanding balances from sales */}
          {ownerSales.filter(s => (s.balanceRemaining || 0) > 0 && s.status !== 'refunded' && s.status !== 'voided').length > 0 && (
            <Widget title="Outstanding Balance" icon={<ScaleIcon sx={{ fontSize: 14, color: '#D32F2F' }} />}>
              <Stack spacing={0.75}>
                {ownerSales.filter(s => (s.balanceRemaining || 0) > 0 && s.status !== 'refunded' && s.status !== 'voided').map((sale, i) => {
                  const saleDateStr = sale.date?.toDate ? sale.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
                  return (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
                      <Box>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 700, color: COLORS.textPrimary }}>{saleDateStr}</Typography>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: '#D32F2F', fontWeight: 700 }}>₱{(sale.balanceRemaining || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} remaining</Typography>
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => { setRecordPaymentTarget(sale); setRecordPaymentAmount(''); setRecordPaymentOpen(true); }}
                        sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 800, borderRadius: 0, color: '#2E7D32', borderColor: '#A5D6A7', textTransform: 'none', py: 0.25, px: 1 }}
                      >
                        Record Payment
                      </Button>
                    </Box>
                  );
                })}
              </Stack>
            </Widget>
          )}

          {/* Sibling Pets */}
          {siblings.length > 0 && (
            <Widget title={`Other Pets (${siblings.length})`} icon={<PetsIcon sx={{ fontSize: 14, color: COLORS.accentLight }} />}>
              <Stack spacing={0.75}>
                {siblings.map((sib) => (
                  <Box key={sib.id} onClick={() => navigate(`/patients/${sib.id}`, { state: { pet: sib } })}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75, px: 1, borderRadius: 1.5, cursor: 'pointer', transition: 'all 0.15s ease', '&:hover': { bgcolor: '#EFEBE9' } }}>
                    <Avatar sx={{ width: 28, height: 28, bgcolor: getInitialColor(sib.name), fontFamily: FONT, fontWeight: 700, fontSize: '0.7rem', color: '#FFF' }}>
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
            </Widget>
          )}

          {/* Owner Quick Card */}
          {owner && (
            <Widget title="Pet Owner" icon={<PersonIcon sx={{ fontSize: 14, color: COLORS.accent }} />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: COLORS.accentLight, fontFamily: FONT, fontWeight: 700, fontSize: '0.85rem' }}>
                  {(owner.displayName || owner.name || '?')[0].toUpperCase()}
                </Avatar>
                <Box>
                  <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary }}>{owner.displayName || owner.name || 'Unknown'}</Typography>
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: COLORS.textMuted }}>Pet Owner</Typography>
                </Box>
              </Box>
              <Stack spacing={0.75}>
                {(owner.phone || owner.contactNumber) && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PhoneIcon sx={{ fontSize: 14, color: COLORS.textMuted }} />
                    <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textPrimary }}>{owner.phone || owner.contactNumber}</Typography>
                  </Box>
                )}
                {owner.email && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <EmailIcon sx={{ fontSize: 14, color: COLORS.textMuted }} />
                    <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textPrimary }}>{owner.email}</Typography>
                  </Box>
                )}
              </Stack>
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
            sx={{ fontFamily: FONT, fontWeight: 900, bgcolor: '#2E7D32', borderRadius: 0, '&:hover': { bgcolor: '#1B5E20' } }}
          >
            Save Payment
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
    </Box>
  );
}
