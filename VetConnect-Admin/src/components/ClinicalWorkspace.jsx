import React, { useState, useEffect, useRef, useMemo } from 'react';
import './ClinicalWorkspace.css';
import { resolveTieredPrice } from '../utils/resolveTieredPrice';
import {
  Dialog, Slide, AppBar, Toolbar, IconButton, Typography, Button,
  Box, Paper, Avatar, Chip, TextField, MenuItem,
  Grid, // MUI v6 Grid
  Stack, Collapse, Tooltip, InputBase, Switch,
  Autocomplete, Alert, Snackbar
} from '@mui/material';

// Icons (Unified)
import {
  Close as CloseIcon, Medication as MedicationIcon, AutoFixHigh as AutoFixHighIcon,
  Warning as WarningIcon, ContentCut as ContentCutIcon,
  AddCircle as AddCircleIcon, ReceiptLong as ReceiptLongIcon,
  HistoryEdu as HistoryEduIcon,
  Shield as ShieldIcon,
  OpenInFull as OpenInFullIcon, FitScreen as FitScreenIcon,
  SaveAlt as SaveAltIcon
} from '@mui/icons-material';
import { doc, collection, Timestamp, updateDoc, getDoc, query, where, orderBy, getDocs, arrayUnion, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useInventory } from '../features/Inventory/hooks/useInventory';

// Design Tokens
import { FONT, TYPE, COLORS } from '../theme/designTokens';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

// Helper for CRM-style age calculation
const calculateAge = (dob) => {
  if (!dob) return 'AGE UNKNOWN';
  try {
    const birthDate = dob.toDate ? dob.toDate() : new Date(dob);
    if (isNaN(birthDate.getTime())) return 'AGE UNKNOWN';
    const now = new Date();
    let years = now.getFullYear() - birthDate.getFullYear();
    let months = now.getMonth() - birthDate.getMonth();
    if (months < 0) {
        years--;
        months += 12;
    }
    if (years < 0) return 'AGE UNKNOWN';
    return years > 0 ? `${years}y ${months}m` : `${months}m`;
  } catch { return 'AGE UNKNOWN'; }
};

// ── Analytics Widget Shell (From CRM) ──
const Widget = ({ title, icon, children }) => (
  <Box sx={{ bgcolor: COLORS.cardBg, borderRadius: 2, border: `1px solid ${COLORS.borderLight}`, mb: 2, overflow: 'hidden' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: `1px solid ${COLORS.borderLight}`, bgcolor: '#FAF8F5' }}>
      {icon}
      <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 800, color: COLORS.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{title}</Typography>
    </Box>
    <Box sx={{ px: 2, py: 1.5 }}>
      {children}
    </Box>
  </Box>
);

// ---------------------------------------------------------------------------
// Module-scope sub-components — defined here (not inside the parent function)
// so React sees a stable function reference across renders and never unmounts
// the subtree. Each is wrapped in React.memo to prevent unnecessary re-renders
// when unrelated parent state changes. Closed-over parent values are threaded
// through as explicit props.
// ---------------------------------------------------------------------------

/**
 * SoapQuadrant — labelled container for a single S/O/A/P section.
 *
 * @prop {string}   id           - SOAP field key (e.g. "subjective")
 * @prop {string}   label        - Display label rendered in the header
 * @prop {node}     children     - Inner field content
 * @prop {function} onZoomField  - Called with `id` when the Zen Focus button is clicked
 * @prop {object}   [sx]         - Optional MUI sx overrides applied to the outer Box
 */
const SoapQuadrant = React.memo(function SoapQuadrant({ id, label, children, onZoomField, sx: sxOverride = {} }) {
  return (
    <Box sx={{
      height: '100%',
      p: { xs: 2, md: 3 },
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflowY: 'auto',
      scrollbarWidth: 'thin',
      '&::-webkit-scrollbar': { width: '4px' },
      '&::-webkit-scrollbar-track': { background: 'transparent' },
      '&::-webkit-scrollbar-thumb': { background: '#E0E0E0' },
      '&::-webkit-scrollbar-thumb:hover': { background: COLORS.brand },
      '&:focus-within': { bgcolor: '#FDFCFB' },
      transition: 'background 0.2s',
      ...sxOverride,
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexShrink: 0 }}>
        <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, fontWeight: 900 }}>
          {label}
        </Typography>
        <Tooltip title={`Zen Focus: ${id.toUpperCase()}`}>
          <IconButton size="small" onClick={() => onZoomField(id)}
            sx={{ opacity: 0.3, '&:hover': { opacity: 1, bgcolor: '#F5F5F5' }, transition: 'all 0.2s' }}>
            <OpenInFullIcon sx={{ fontSize: 16, color: COLORS.brand }} />
          </IconButton>
        </Tooltip>
      </Box>
      {children}
    </Box>
  );
});

/**
 * VitalsGrid — compact grid of numeric vital-sign inputs with triage colouring.
 *
 * @prop {object}   soapData               - Current SOAP field values
 * @prop {function} updateSoap             - (field, value) => void state setter
 * @prop {function} getTriageLevel         - (type, value) => 'normal'|'warning'|'critical'
 * @prop {function} renderHistoricalLabel  - (field) => ReactNode showing prior-visit value
 * @prop {boolean}  [compact=false]        - Compact spacing variant
 */
const VitalsGrid = React.memo(function VitalsGrid({ soapData, updateSoap, getTriageLevel, renderHistoricalLabel, compact = false }) {
  const vitalsFields = [
    { label: 'WT (kg)',     value: soapData.objWeight,  field: 'objWeight',  icon: '\u2696\uFE0F', status: 'normal' },
    { label: 'TEMP (\u00B0C)', value: soapData.objTemp, field: 'objTemp',    icon: '\uD83C\uDF21\uFE0F', status: getTriageLevel('temp', soapData.objTemp) },
    { label: 'HR (bpm)',    value: soapData.objHR,      field: 'objHR',      icon: '\u2764\uFE0F', status: getTriageLevel('hr', soapData.objHR) },
    { label: 'RR (rpm)',    value: soapData.objRR,      field: 'objRR',      icon: '\uD83E\uDEC1', status: getTriageLevel('rr', soapData.objRR) },
    { label: 'CRT (sec)',   value: soapData.objCRT,     field: 'objCRT',     icon: '\u23F1\uFE0F', status: getTriageLevel('crt', soapData.objCRT) },
    { label: 'BCS (1-9)',   value: soapData.bcs,        field: 'bcs',        icon: '\uD83D\uDC3E', status: 'normal' },
    { label: 'PAIN (0-10)', value: soapData.painScale,  field: 'painScale',  icon: '\uD83E\uDE79', status: getTriageLevel('pain', soapData.painScale) },
  ];

  const triageColor = (status) =>
    status === 'critical' ? '#D32F2F' :
    status === 'warning'  ? '#FF8F00' :
    COLORS.brand;

  const triageBorder = (status) =>
    status === 'critical' ? '2px solid #D32F2F' :
    status === 'warning'  ? '2px solid #FF8F00' :
    '2px solid rgba(0,0,0,0.1)';

  return (
    <Box sx={{ bgcolor: '#FAFAF9', p: compact ? 1.5 : 2, border: '1px solid rgba(0,0,0,0.06)', mb: compact ? 1 : 2, flexShrink: 0 }}>
      <Grid container spacing={compact ? 1 : 1.5}>
        {vitalsFields.map((v, idx) => (
          <Grid key={v.field} size={{ xs: 6, sm: 3, md: idx < 4 ? 3 : 4 }}>
            <Typography variant="caption" sx={{
              fontWeight: 1000, color: COLORS.textSecondary,
              display: 'block', mb: 0.25,
              fontSize: compact ? '0.55rem' : '0.6rem'
            }}>
              {v.icon} {v.label}
            </Typography>
            <InputBase
              size="small"
              value={v.value}
              onChange={(e) => updateSoap(v.field, e.target.value)}
              inputProps={{ 'aria-label': v.label }}
              className={v.status === 'critical' ? 'glow-critical' : v.status === 'warning' ? 'glow-warning' : ''}
              sx={{
                width: '100%',
                fontWeight: 1000,
                color: triageColor(v.status),
                borderBottom: triageBorder(v.status),
                fontSize: compact ? '0.85rem' : '1rem',
                px: 0.5,
                bgcolor: 'white'
              }}
            />
            {renderHistoricalLabel(v.field)}
          </Grid>
        ))}
      </Grid>
    </Box>
  );
});

/**
 * DiagnosticBridge — "Analyze S+O" button + collapsible AI suggestion panel.
 *
 * @prop {object}   soapData       - Current SOAP data (used to determine disabled state)
 * @prop {string}   assistiveText  - Rendered suggestion text
 * @prop {boolean}  diagnosticOpen - Whether the suggestion panel is expanded
 * @prop {function} onAnalyze      - Runs the diagnosis engine and opens the panel
 * @prop {function} onDismiss      - Collapses the suggestion panel
 */
const DiagnosticBridge = React.memo(function DiagnosticBridge({ soapData, assistiveText, diagnosticOpen, onAnalyze, onDismiss }) {
  return (
    <Box sx={{ mb: 1.5, flexShrink: 0 }}>
      <Button
        size="small"
        variant="outlined"
        startIcon={<AutoFixHighIcon />}
        onClick={onAnalyze}
        disabled={!soapData.subjective && !soapData.objectiveNotes}
        sx={{
          fontWeight: 900,
          fontSize: '0.65rem',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: COLORS.medical || '#1565C0',
          borderColor: COLORS.medical || '#1565C0',
          mb: 1,
          '&:hover': { bgcolor: 'rgba(21,101,192,0.05)' },
        }}
      >
        Analyze S+O
      </Button>
      <Collapse in={diagnosticOpen && !!assistiveText}>
        <Box sx={{
          bgcolor: 'rgba(21,101,192,0.04)',
          border: '1px solid rgba(21,101,192,0.15)',
          p: 1.5,
          mb: 1,
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
            <Typography sx={{ ...TYPE.label, color: '#1565C0', fontWeight: 900, fontSize: '0.6rem' }}>
              CLINICAL INTELLIGENCE SUGGESTIONS
            </Typography>
            <IconButton size="small" onClick={onDismiss} sx={{ p: 0.25 }}>
              <CloseIcon sx={{ fontSize: 12, color: COLORS.textMuted }} />
            </IconButton>
          </Box>
          <Typography sx={{
            fontSize: '0.8rem',
            color: COLORS.textPrimary,
            whiteSpace: 'pre-line',
            lineHeight: 1.6,
          }}>
            {assistiveText}
          </Typography>
        </Box>
      </Collapse>
    </Box>
  );
});

// --- 🩺 CLINICAL INTELLIGENCE KNOWLEDGE BASE ---
const KNOWLEDGE_BASE = [
  { keywords: ['cough', 'hacking', 'trachea'], suggestion: "🩺 RECOMMEND: Thoracic radiographs to rule out Kennel Cough vs. Cardiac (CHF) vs. Tracheal Collapse." },
  { keywords: ['scratching', 'shaking head', 'ear', 'brown discharge'], suggestion: "🧪 RECOMMEND: Ear cytology for Malassezia (Yeast) vs. Bacterial Otitis. Check for Otodectes." },
  { keywords: ['vomiting', 'diarrhea', 'dehydrated'], suggestion: "💧 RECOMMEND: Fluid therapy (IV/SQ) + Parvovirus SNAP test if puppy. Rule out dietary indiscretion vs. pancreatitis." },
  { keywords: ['limping', 'hind', 'cruciate'], suggestion: "🦴 RECOMMEND: Orthopedic exam (Drawer/Tibial Compression) + stifle radiographs. Consider NSAIDs and rest." },
  { keywords: ['seizure', 'fits', 'convulsions'], suggestion: "🧠 RECOMMEND: CBC/Chem to rule out metabolic causes (liver/glucose). Monitor duration/frequency for Phenobarbital start." },
  { keywords: ['peeing', 'straining', 'blood', 'urinary'], suggestion: "🧪 RECOMMEND: Urinalysis + Culture to rule out UTI vs. Crystals/Calculi (Uroliths). Check for bladder stones." }
];

const ZEN_PLACEHOLDERS = {
  subjective: "Record client's primary concern, history of present illness (HPI), appetite, energy levels, and behavioral reported changes...",
  objectiveNotes: "Document systematic physical exam findings, clinical vitals, auscultation results, palpation abnormalities, and hydration markers...",
  assessment: "Synthesize clinical findings into differential diagnoses (Dx), rule-outs, current patient status, and medical prognosis...",
  plan: "Define treatment trajectory, diagnostic orders, pharmaceutical interventions, surgical steps, and post-consult recheck schedules..."
};

export default function ClinicalWorkspace({ open, onClose, patient, inventoryList, servicesList, departments }) {
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const { reserveStock, releaseStock } = useInventory();
  
  const [history, setHistory] = useState([]);
  const [nextAppointment, setNextAppointment] = useState(null);
  const [petDetails, setPetDetails] = useState(null);
  const [prevVitals, setPrevVitals] = useState(null);

  const [soapData, setSoapData] = useState({
    subjective: '', objWeight: '', objTemp: '', objHR: '', objRR: '', objCRT: '', bcs: 5, painScale: 0, objectiveNotes: '',
    murmurGrade: 'None', murmurLocation: 'L Apex', murmurTiming: 'Systolic', respEffort: 'Normal',
    palpationFindings: { masses: false, pain: false, tense: false, normal: true },
    assessment: '', prognosis: 'Good', plan: '', recheckIn: '1 Week', patientStatus: 'Stable', nextVisit: ''
  });
  const [isRecordLocked, setIsRecordLocked] = useState(false);
  const [ownerSignature, setOwnerSignature] = useState(null);
  const [assistiveText, setAssistiveText] = useState('');
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);

  // Clinical Metadata States
  const [labQuickStats, setLabQuickStats] = useState({ pcv: '', tp: '', glucose: '' });
  const [dentalGrade, setDentalGrade] = useState(0);
  const [lamenessGrade, setLamenessGrade] = useState(0);

  // C1: Structured vaccine administration record
  const [vaccineData, setVaccineData] = useState({
    vaccineName: '', manufacturer: '', lotNumber: '',
    routeOfAdmin: 'SQ', siteOfInjection: 'Right Scruff',
    dueDate: '', intervalDays: 365,
  });

  // C3: Lab results — array of { testName, result, status, notes }
  const [labResults, setLabResults] = useState([]);

  const [rxCart, setRxCart] = useState([]);
  const [selectedRxItem, setSelectedRxItem] = useState('');
  const [syncToCRM, setSyncToCRM] = useState(true);

  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });

  // Refs to access latest cart and lock state inside cleanup closures without stale captures
  const rxCartRef = useRef(rxCart);
  const isRecordLockedRef = useRef(isRecordLocked);
  const hasReleasedRef = useRef(false);

  // Keep refs in sync so the unmount cleanup always sees the latest values
  useEffect(() => { rxCartRef.current = rxCart; }, [rxCart]);
  useEffect(() => { isRecordLockedRef.current = isRecordLocked; }, [isRecordLocked]);

  // On unmount: release all product reservations if the record was never signed off.
  // This prevents the `reserved` counter from being permanently inflated when the vet
  // closes the workspace without completing the encounter.
  // hasReleasedRef guards against double-release when handleCloseRequest already ran.
  useEffect(() => {
    return () => {
      if (!isRecordLockedRef.current && !hasReleasedRef.current) {
        hasReleasedRef.current = true;
        rxCartRef.current.forEach(item => {
          if (item.type === 'product' && releaseStock) {
            releaseStock(item.id, item.qty || 1).catch(e =>
              console.error(`[ClinicalWorkspace] Failed to release reservation for ${item.name}:`, e)
            );
          }
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 🧘 ZEN FOCUS & IMMERSION ---
  const [fullscreenField, setFullscreenField] = useState(null); // Field ID for zoom
  const [isUnifiedZen, setIsUnifiedZen] = useState(false); // Global SOAP zoom

  // --- ZEN NAVIGATION & STATE ---
  const soapRef = useRef(null);
  const treatmentRef = useRef(null);
  const dischargeRef = useRef(null);
  const isSavingRef = useRef(false);

  const [lockedServices, setLockedServices] = useState(new Set());

  const handleCompleteService = async (svcId) => {
    const service = (patient.services || []).find(s => s.id === svcId || s.workflowType === svcId.toUpperCase());
    if (!service && svcId !== 'medical') return;

    if (window.confirm("Finalize clinical documentation for this section?")) {
        setLoading(true);
        try {
            const newServices = (patient.services || []).map(s => 
                (s.id === svcId || s.workflowType === svcId.toUpperCase()) ? { ...s, status: 'completed' } : s
            );
            await updateDoc(doc(db, "appointments", patient.id), { services: newServices });
            setLockedServices(prev => new Set([...prev, svcId]));
        } catch (e) { alert(e.message); }
        finally { setLoading(false); }
    }
  };
  const glassStyle = {
    background: 'rgba(255, 255, 255, 0.65)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.4)',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.08)',
    borderRadius: 4,
  };


  // --- 1. INITIALIZATION & AUTO-BUNDLE ENGINE ---
  useEffect(() => {
    let cancelled = false;

    const fetchPatientContext = async () => {
        if (open && patient) {
          setIsDirty(false);
          setAssistiveText('');
          setLabQuickStats({ pcv: '', tp: '', glucose: '' });
          setLamenessGrade(0);
          setDentalGrade(0);

          // --- 🧬 MULTI-SERVICE SIGN-OFF SYNC ---
          const completedFromDb = new Set();
          (patient.services || []).forEach(s => {
              if (s.status === 'completed') {
                  if (s.workflowType === 'MEDICAL') completedFromDb.add('medical');
                  completedFromDb.add(s.id);
              }
          });
          setLockedServices(completedFromDb);

          // Restore from a previously saved SOAP draft if one exists; otherwise
          // initialize with defaults so the vet starts fresh on first open.
          const draft = patient.soapDraft;
          if (draft && Object.keys(draft).length > 0) {
            setSoapData({
              subjective: draft.subjective || '',
              objWeight: draft.objWeight || '',
              objTemp: draft.objTemp || '',
              objHR: draft.objHR || '',
              objRR: draft.objRR || '',
              objCRT: draft.objCRT || '2',
              bcs: draft.bcs ?? 5,
              painScale: draft.painScale ?? 0,
              murmurGrade: draft.murmurGrade || 'None',
              murmurLocation: draft.murmurLocation || 'L Apex (Mitral)',
              murmurTiming: draft.murmurTiming || 'Systolic',
              respEffort: draft.respEffort || 'Normal',
              palpationFindings: draft.palpationFindings || { masses: false, pain: false, tense: false, normal: true },
              objectiveNotes: draft.objectiveNotes || '',
              assessment: draft.assessment || '',
              prognosis: draft.prognosis || 'Good',
              patientStatus: draft.patientStatus || 'Stable',
              plan: draft.plan || '',
              recheckIn: draft.recheckIn || '1 Week',
              nextVisit: draft.nextVisit || '',
            });
          } else {
            setSoapData({
              subjective: patient.notes && patient.notes !== 'Walk-in client' && !patient.notes.includes('QUICK ADMIT') ? `Client noted: "${patient.notes}"\n\n` : '',
              objWeight: '', objTemp: '', objHR: '', objRR: '', objCRT: '2',
              bcs: 5, painScale: 0,
              murmurGrade: 'None', murmurLocation: 'L Apex (Mitral)', murmurTiming: 'Systolic',
              palpationFindings: { masses: false, pain: false, tense: false, normal: true },
              objectiveNotes: '', assessment: '', patientStatus: 'Stable', plan: '', nextVisit: '',
            });
          }

        let initialCart = [];
        const baseService = servicesList.find(s => s.name === patient.primaryService);
        const patientWeight = patient.petWeight ? parseFloat(patient.petWeight) : null;

        // Push every booked service into the cart — use tiered price if applicable
        (patient.services || []).forEach(svc => {
            const svcDef = servicesList.find(s => s.id === svc.id);
            if (!svcDef && svc.id) console.warn(`[ClinicalWorkspace] Service id="${svc.id}" not found in catalog. Using appointment price.`);
            const resolvedPrice = resolveTieredPrice(svcDef, patientWeight) || svc.price || 0;
            initialCart.push({
                type: 'service', id: svc.id, name: svc.name,
                price: resolvedPrice, qty: 1, isDrug: false, isBase: true
            });
        });

        // Auto-bundle linked inventory products (supports array; falls back to singular for legacy data)
        if (baseService) {
            const linkedIds = baseService.linkedProducts
                || (baseService.linkedProduct ? [baseService.linkedProduct] : []);
            linkedIds.forEach(productId => {
                const linkedInv = inventoryList.find(i => i.id === productId);
                if (linkedInv) {
                    initialCart.push({
                        type: 'product', id: linkedInv.id, name: linkedInv.itemName,
                        price: linkedInv.price, qty: 1,
                        isDrug: !!linkedInv.isMedicine,
                        isBase: false, isAutoBundled: true, instructions: ''
                    });
                }
            });
        }

        if (cancelled) return;
        setRxCart(initialCart);
        setSelectedRxItem('');

        // Reserve stock for auto-bundled products
        for (const cartItem of initialCart) {
            if (cartItem.type === 'product' && reserveStock) {
                try { await reserveStock(cartItem.id, cartItem.qty); }
                catch (e) { console.error(`Failed to reserve stock for ${cartItem.name}:`, e); }
            }
        }

        if (patient.petId && patient.petId !== "WALK_IN_USER" && patient.petId !== "UNKNOWN") {
          try {
            const petDoc = await getDoc(doc(db, "pets", patient.petId));
            if (petDoc.exists()) setPetDetails(petDoc.data());
            else setPetDetails(null);

            const q = query(collection(db, "medical_records"), where("petId", "==", patient.petId), orderBy("date", "desc"));
            const snapshot = await getDocs(q);
            const historyData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setHistory(historyData);

            if (cancelled) return;

            if (historyData.length > 0) {
              setPrevVitals(historyData[0].vitals || null);
            } else {
              setPrevVitals(null);
            }

             const apptQ = query(collection(db, 'appointments'), where('petId', '==', patient.petId));
             const apptSnap = await getDocs(apptQ);
             const now = new Date();
             const future = apptSnap.docs
               .map(d => ({ id: d.id, ...d.data() }))
               .filter(a => {
                 const aDate = a.date?.toDate ? a.date.toDate() : (a.date?.seconds ? new Date(a.date.seconds * 1000) : null);
                 return aDate && aDate > now && !['completed', 'cancelled', 'no-show'].includes(a.status);
               })
               .sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0));
             setNextAppointment(future.length > 0 ? future[0] : null);

          } catch (e) { console.error("Error fetching context:", e); }
        } else {
          if (cancelled) return;
          setPetDetails(null); setHistory([]);
        }
      }
    };
    fetchPatientContext();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patient]);

  // --- 2. HANDLERS ---

  // --- TRIAGE ENGINE ---
  const getTriageLevel = (type, value) => {
    const v = parseFloat(value);
    if (!v && v !== 0) return 'normal';

    // Temperature (species-aware)
    if (type === 'temp') {
        const species = (patient?.petSpecies || '').toLowerCase();
        if (species === 'cat' || species === 'feline') {
            if (v > 39.5 || v < 37.5) return 'critical';
            if (v > 39.2 || v < 38.0) return 'warning';
        } else {
            if (v > 39.5 || v < 37.0) return 'critical';
            if (v > 39.2 || v < 37.5) return 'warning';
        }
    }
    // Heart Rate
    if (type === 'hr') {
        if (v > 180 || v < 40) return 'critical';
        if (v > 140 || v < 60) return 'warning';
    }
    // Respiratory Rate
    if (type === 'rr') {
        if (v > 60 || v < 8) return 'critical';
        if (v > 40 || v < 10) return 'warning';
    }
    // CRT (Capillary Refill Time)
    if (type === 'crt') {
        if (v > 4) return 'critical';
        if (v > 2.5) return 'warning';
    }
    // Pain Scale
    if (type === 'pain') {
        if (v >= 8) return 'critical';
        if (v >= 5) return 'warning';
    }
    return 'normal';
  };
  
  const getGlucoseLevel = (val) => {
    const v = parseFloat(val);
    if (!v) return 'normal';
    if (v < 60) return 'critical';
    if (v > 200) return 'warning';
    return 'normal';
  };

  const handleCloseRequest = () => {
    const doClose = () => {
      // Use refs (not state) to avoid stale closure captures. hasReleasedRef prevents
      // double-release when this runs before the unmount cleanup fires.
      if (!isRecordLockedRef.current && !hasReleasedRef.current) {
        hasReleasedRef.current = true;
        rxCartRef.current.forEach(item => {
          if (item.type === 'product' && releaseStock) {
            releaseStock(item.id, item.qty || 1).catch(e =>
              console.error(`[ClinicalWorkspace] Failed to release reservation for ${item.name}:`, e)
            );
          }
        });
      }
      onClose();
    };

    if (isDirty) {
      if (window.confirm("You have unsaved clinical notes. Use 'Save Draft' in the Plan section to preserve them.\n\nClose anyway and discard changes?")) doClose();
    } else {
      doClose();
    }
  };

  const updateSoap = (field, value) => { setSoapData(prev => ({ ...prev, [field]: value })); setIsDirty(true); };

  const applyTemplate = (type) => {
    switch (type) {
      case 'wnl': {
        // Inject species-appropriate baseline vitals alongside full-body WNL notes
        const isDog = (patient?.petSpecies === 'Canine' || patient?.petSpecies === 'Dog');
        setSoapData(prev => ({
          ...prev,
          objectiveNotes: "MM: Pink/Moist, CRT <2s\nHydration: Normal\nResp Effort: Normal\nAbdomen: Soft/Non-painful\nDental: Grade 0 (No calc/gingivitis)\n\nGeneral Appearance: WNL\nEENT: WNL\nCardiovascular: WNL\nRespiratory: WNL\nGastrointestinal: WNL\nMusculoskeletal: WNL\nIntegumentary (Skin): WNL\nLymph Nodes: WNL\nNeurological: WNL\nUrogenital: WNL",
          objTemp: isDog ? '38.5' : '38.6',
          objHR: isDog ? '100' : '140',
          objRR: isDog ? '20' : '24',
          objCRT: '<2',
          bcs: 5,
          painScale: 0,
        }));
        setIsDirty(true);
        break;
      }

      default:
        break;
    }
  };

  // --- 🆕 CLINCAL COMPARISON ENGINE (THE GHOST) ---
  const renderHistoricalLabel = (field, customVal = null) => {
    if (!history || history.length === 0) return null;
    const last = history[0];
    let val = customVal;

    if (!val) {
        const FIELD_TO_VITALS_KEY = {
            objWeight: 'weight',
            objTemp: 'temp',
            objHR: 'hr',
            objRR: 'rr',
            objCRT: 'crt',
            bcs: 'bcs',
            painScale: 'pain',
        };
        const vKey = FIELD_TO_VITALS_KEY[field];
        val = vKey ? last.vitals?.[vKey] : last[field];
    }

    if (!val || val === '0' || val === 0) return null;
    return (
      <Typography variant="caption" sx={{ display: 'block', fontSize: '0.62rem', color: COLORS.textMuted, fontWeight: 900, mt: 0.25, opacity: 0.8, letterSpacing: 0.5 }}>
        LAST: {val}
      </Typography>
    );
  };

  const runAssistiveDiagnosis = () => {
    const combinedNotes = (soapData.subjective + " " + soapData.objectiveNotes).toLowerCase();
    let suggestions =[];
    KNOWLEDGE_BASE.forEach(c => {
      if (c.keywords.some(k => combinedNotes.includes(k))) suggestions.push(c.suggestion);
    });
    setAssistiveText(suggestions.length > 0 ? suggestions.join('\n\n') : 'No rule-based suggestions found. Please proceed with standard diagnostics.');
  };

  // --- 3. TREATMENT PLAN LOGIC (THE BRIDGE) ---
  const handleAddRx = async (item) => {
    if (!item) return;

    // Block out-of-stock products
    if (item.stock !== undefined) {
        const netAvailable = (item.stock || 0) - (item.reserved || 0);
        if (netAvailable <= 0) {
            return alert("This product is out of stock and cannot be added.");
        }
    }

    const isMedicine = !!item.isMedicine; // 🩺 THE FORENSIC FLAG

    // Deduplicate: if item already in cart, increment qty instead of adding duplicate
    const existingIdx = rxCart.findIndex(rx => rx.id === item.id);
    if (existingIdx >= 0) {
        handleUpdateQty(existingIdx, 1);
        return;
    }

    const itemObj = {
      type: item.stock !== undefined ? 'product' : 'service',
      id: item.id,
      name: item.itemName || item.name,
      price: item.stock !== undefined
          ? (item.price || 0)
          : resolveTieredPrice(item, parseFloat(soapData.objWeight) || (patient?.petWeight ? parseFloat(patient.petWeight) : null)),
      qty: 1,
      isDrug: isMedicine, 
      isDispensed: false, // Default to Clinic Admin
      sig: { dose: '1', frequency: 'SID', duration: '1', unit: item.unit || 'unit', route: 'SQ' },
      instructions: '' 
    };
    
    setRxCart(prev => [...prev, itemObj]); 
    setIsDirty(true); 
    
    // --- SOFT-RESERVE TRIGGER ---
    if (itemObj.type === 'product' && reserveStock) {
        try {
            await reserveStock(itemObj.id, 1);
        } catch (e) {
            console.error(`[ClinicalWorkspace] Stock reservation failed for ${itemObj.name}:`, e);
            alert(`Warning: Could not reserve stock for ${itemObj.name}. The item was added but may not be available at checkout.`);
        }
    }
  };

  const handleRemoveRx = (index) => {
    if (rxCart[index].isBase) return; 
    const itemToRemove = rxCart[index];
    const newCart =[...rxCart];
    newCart.splice(index, 1);
    setRxCart(newCart);
    setIsDirty(true);

    // --- SOFT-RELEASE TRIGGER ---
    if (itemToRemove.type === 'product') {
        releaseStock(itemToRemove.id, itemToRemove.qty || 1).catch(e =>
            console.error(`[ClinicalWorkspace] Failed to release reservation for ${itemToRemove.name}:`, e)
        );
    }
  };

  const handleUpdateQty = async (index, delta) => {
    const newCart = [...rxCart];
    const item = newCart[index];
    const oldQty = item.qty || 1;
    const newQty = Math.max(1, oldQty + delta);
    
    if (newQty === oldQty) return;
    
    // Check Stock Availability if increasing
    if (delta > 0 && item.type === 'product') {
      const invItem = inventoryList.find(i => i.id === item.id);
      if (invItem && (invItem.stock - invItem.reserved) <= 0) {
        return alert("⚠️ STOCK EXHAUSTED: Cannot increase quantity further.");
      }
    }

    item.qty = newQty;
    setRxCart(newCart);
    setIsDirty(true);

    // Sync Inventory Reservation
    if (item.type === 'product') {
        try {
            if (delta > 0) await reserveStock(item.id, 1);
            else await releaseStock(item.id, 1);
        } catch (e) {
            console.error(`[ClinicalWorkspace] Stock reservation sync failed:`, e);
        }
    }
  };
  const handleUpdateRxSig = (index, text) => {
    const newCart = [...rxCart];
    newCart[index].instructions = text;
    setRxCart(newCart);
    setIsDirty(true);
  };

  const handleUpdateRxField = (index, field, value) => {
    const newCart = [...rxCart];
    newCart[index][field] = value;
    setRxCart(newCart);
    setIsDirty(true);
  };

  // --- 4. SAVE LOGIC ---

  /**
   * Detects if the current visit is vaccine-related by matching booked service names
   * against a known set of vaccine keywords. Drives conditional rendering of the
   * structured Vaccine Details form in the Plan quadrant.
   */
  const isVaccinationVisit = useMemo(() => {
    const keywords = ['vaccine', 'vaccination', 'rabies', 'dhpp', 'da2pp', 'bordetella', 'lepto', '5-in-1'];
    const serviceNames = (patient?.services || []).map(s => (s.name || '').toLowerCase()).join(' ');
    const primary = (patient?.primaryService || '').toLowerCase();
    return keywords.some(kw => serviceNames.includes(kw) || primary.includes(kw));
  }, [patient]);

  const hasDrugsInCart = rxCart.some(item => item.isDrug);
  const nextRouteStatus = hasDrugsInCart ? "dispensing" : "billing";
  const saveBtnText = hasDrugsInCart ? "Sign & Send to Pharmacy" : "Sign & Send to Cashier";

  const handleSaveConsult = async () => {
    if (isSavingRef.current) return;

    if (lockedServices.has('medical')) {
        return alert("This clinical record has already been signed off. No duplicate records can be created.");
    }

    if (!soapData.assessment || !soapData.plan) {
        return alert("Assessment and Plan are required for legal medical documentation.");
    }
    if (rxCart.length === 0) {
        return alert("Treatment Plan is empty. Add at least one service or product before signing off.");
    }

    isSavingRef.current = true;
    setLoading(true);
    try {
      const vetUid = auth.currentUser?.uid || "system";
      const vetName = auth.currentUser?.displayName || "Authorized Clinician";
      const visitTotal = rxCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
      const commitTimestamp = Timestamp.now();

      const batch = writeBatch(db);

      // 1. MEDICAL RECORD — batch.set on a pre-created ref (atomic, no orphan risk)
      const recordRef = doc(collection(db, "medical_records"));
      batch.set(recordRef, {
        appointmentId: patient.id,
        petId: patient.petId || "WALK_IN_PET",
        petName: patient.petName,
        ownerId: patient.ownerId,
        ownerName: patient.ownerName || "Walk-In Client",
        vetId: vetUid,
        vetName: vetName,
        signedBy: { uid: vetUid, name: vetName },
        date: commitTimestamp,
        recordType: 'medical',
        diagnosis: soapData.assessment || "Clinical Visit",
        treatment: soapData.plan,
        soap: {
            subjective: soapData.subjective,
            objective: soapData.objectiveNotes,
            assessment: soapData.assessment,
            prognosis: soapData.prognosis,
            plan: soapData.plan,
            recheckIn: soapData.recheckIn
        },
        vitals: {
            weight: soapData.objWeight, temp: soapData.objTemp, hr: soapData.objHR,
            rr: soapData.objRR, crt: soapData.objCRT, bcs: soapData.bcs, pain: soapData.painScale
        },
        legal: {
            ownerSignature: ownerSignature,
            isLocked: true,
            lockedAt: commitTimestamp
        },
        patientStatus: soapData.patientStatus,
        nextVisit: soapData.nextVisit ? Timestamp.fromDate(new Date(soapData.nextVisit)) : null,
        // D5: Prescriptions natively on the medical record
        prescriptions: rxCart
            .filter(item => item.type === 'product')
            .map(item => ({
                name: item.name,
                qty: item.qty,
                instructions: item.instructions || '',
                price: item.price,
                isDrug: !!item.isDrug,
            })),
        serviceType: patient.primaryService || patient.serviceType || 'Clinical Visit',
        // B1: Discharge Summary — client-safe subset of SOAP data
        dischargeSummary: {
            patientName: patient.petName,
            ownerName: patient.ownerName || 'Walk-In Client',
            visitDate: commitTimestamp,
            diagnosis: soapData.assessment || 'Clinical Visit',
            instructions: soapData.plan || '',
            medications: rxCart
                .filter(item => item.isDrug)
                .map(item => ({
                    name: item.name,
                    qty: item.qty,
                    instructions: item.instructions || 'Use as directed',
                })),
            nextVisit: soapData.nextVisit || null,
            recheckIn: soapData.recheckIn || null,
            vetName: vetName,
            patientStatus: soapData.patientStatus || 'Stable',
        },
        // C1: Structured vaccine record — only written when visit is vaccine-related
        // and the vet has entered a vaccine name (avoids polluting non-vax records).
        ...(isVaccinationVisit && vaccineData.vaccineName ? {
            vaccineData: {
                vaccineName: vaccineData.vaccineName,
                manufacturer: vaccineData.manufacturer,
                lotNumber: vaccineData.lotNumber,
                routeOfAdmin: vaccineData.routeOfAdmin,
                siteOfInjection: vaccineData.siteOfInjection,
                dueDate: vaccineData.dueDate || null,
                intervalDays: vaccineData.intervalDays || 365,
            }
        } : {}),
        // C3: Lab results — only written when at least one row has been added.
        // Empty testName rows are filtered to avoid noise.
        ...(labResults.length > 0 ? {
            labResults: labResults.filter(l => l.testName).map(l => ({
                testName: l.testName,
                result: l.result,
                status: l.status,
                notes: l.notes || '',
            }))
        } : {}),
      });

      // NOTE: The orphaned `transactions` collection write has been removed (Issue #5).
      // POSModal's `sales` collection is the canonical billing path — that write happens
      // at checkout after the patient reaches the billing/dispensing station.

      // 2. CRM SYNC + VITALS PROPAGATION — merged into a single batch.update per document
      if (patient.petId && patient.petId !== "WALK_IN_PET") {
          const petRef = doc(db, "pets", patient.petId);

          // Build the pet update payload: vitals are always propagated; CRM identity
          // fields are only written when the user has opted into the sync.
          const petUpdate = {
              "lastVitals.weight": soapData.objWeight || null,
              "lastVitals.temp": soapData.objTemp || null,
              "lastVitals.hr": soapData.objHR || null,
              "lastVitals.rr": soapData.objRR || null,
              "lastVitals.bcs": soapData.bcs || null,
              "lastVitals.painScale": soapData.painScale || null,
              "lastVitals.crt": soapData.objCRT || null,
              "lastVitals.safetyStatus": 'Safe',
              "lastVitals.dentalGrade": dentalGrade,
              "lastVitals.lamenessGrade": lamenessGrade,
              "lastVitals.recordedAt": commitTimestamp,
              lastVisitDate: commitTimestamp,
          };

          if (syncToCRM) {
              Object.assign(petUpdate, {
                  name: patient.petName,
                  species: patient.petSpecies,
                  breed: patient.petBreed,
                  gender: patient.petGender,
                  isNeutered: patient.petIsNeutered,
                  dob: patient.petBirthdate,
                  isAgeExact: patient.isAgeExact !== false,
                  "audit.lastSyncDate": commitTimestamp,
                  "audit.syncStaff": vetName,
                  "audit.syncReason": "Clinical Session Biometric Sync",
              });
          }

          batch.update(petRef, petUpdate);

          // Owner contact sync — only when CRM sync is enabled and owner is not a walk-in
          if (syncToCRM && patient.ownerId && patient.ownerId !== "WALK_IN") {
              const ownerUpdate = {
                  fullName: patient.ownerName,
                  "audit.lastPhoneUpdate": commitTimestamp,
              };
              if (/^09\d{9}$/.test(patient.ownerPhone)) {
                  ownerUpdate.phone = patient.ownerPhone;
              }
              batch.update(doc(db, "users", patient.ownerId), ownerUpdate);
          }
      }

      // 3. APPOINTMENT STATUS ADVANCE — single authoritative write
      // Merge any mid-consult service additions from rxCart into the appointment's
      // service list so the downstream stations see the complete service picture (Issue #14).
      const existingServiceIds = new Set((patient.services || []).map(s => s.id));
      const addedServices = rxCart
          .filter(item => item.type === 'service' && !existingServiceIds.has(item.id))
          .map(item => ({ id: item.id, name: item.name, price: item.price }));
      const updatedServices = [...(patient.services || []), ...addedServices];

      const appointmentUpdate = {
          status: nextRouteStatus,
          prescribedItems: rxCart,
          finalTotal: visitTotal,
          signedOffAt: commitTimestamp,
          prescribedItemsVersion: commitTimestamp,
          services: updatedServices,
      };

      // Fold the CRM sync pulse event into this same appointment write — avoids a
      // separate document write that could be skipped if the browser crashed.
      if (syncToCRM && patient.petId && patient.petId !== "WALK_IN_PET") {
          appointmentUpdate.clinicalPulse = arrayUnion({
              eventId: `sync_${Date.now()}`,
              type: 'CRM_SYNC_SUCCESS',
              timestamp: commitTimestamp,
              staffName: vetName,
              note: "Master CRM updated with clinical corrections.",
          });
      }

      batch.update(doc(db, "appointments", patient.id), appointmentUpdate);

      // B2: Auto-create follow-up appointment (1 conditional write)
      if (soapData.nextVisit) {
          const followUpRef = doc(collection(db, "appointments"));
          const followUpDate = new Date(soapData.nextVisit);
          followUpDate.setHours(8, 0, 0, 0);
          batch.set(followUpRef, {
              petId: patient.petId || 'WALK_IN_PET',
              petName: patient.petName,
              petSpecies: patient.petSpecies || '',
              petBreed: patient.petBreed || '',
              petGender: patient.petGender || '',
              petBirthdate: patient.petBirthdate || null,
              petWeight: soapData.objWeight || patient.petWeight || null,
              petAllergies: patient.petAllergies || '',
              petIsNeutered: patient.petIsNeutered || false,
              ownerId: patient.ownerId || 'WALK_IN_USER',
              ownerName: patient.ownerName || 'Walk-In Client',
              ownerPhone: patient.ownerPhone || '',
              serviceType: 'Follow-Up Visit',
              primaryService: 'Follow-Up Visit',
              services: [{ id: 'follow_up', name: 'Follow-Up Visit', price: 0 }],
              status: 'pending',
              date: Timestamp.fromDate(followUpDate),
              scheduledDate: Timestamp.fromDate(followUpDate),
              createdAt: commitTimestamp,
              notes: `Follow-up from visit on ${new Date().toLocaleDateString()}. Diagnosis: ${soapData.assessment || 'N/A'}. Recheck: ${soapData.recheckIn || 'N/A'}.`,
              isFollowUp: true,
              parentAppointmentId: patient.id,
              parentRecordId: recordRef.id,
              source: 'clinical_workspace',
          });
      }

      // Single atomic commit — all writes succeed together or none do.
      await batch.commit();

      // Set ref SYNCHRONOUSLY so unmount cleanup sees it immediately, before React
      // schedules the state update and re-render that follows.
      isRecordLockedRef.current = true;
      setIsRecordLocked(true);
      setLoading(false);
      setIsDirty(false);
      onClose();
      alert(`✅ ENCOUNTER FINALIZED!\n\nClinical record signed by ${vetName}.\nPatient moved to ${hasDrugsInCart ? 'PHARMACY' : 'CHECKOUT'}.\nTotal: ₱${visitTotal.toLocaleString()}`);
    } catch (error) {
        console.error('[ClinicalWorkspace.handleSaveConsult]:', error.message);
        isSavingRef.current = false;
        setLoading(false);
        alert("🚨 Critical Save Error: " + error.message);
    }
  };

  /**
   * Persists the current SOAP notes and treatment plan to the appointment document
   * as a draft. Does NOT create a medical_records document, does NOT advance
   * appointment status, and does NOT require owner consent.
   *
   * This is the safe mid-consult save path. The consent-gated `handleSaveConsult`
   * remains the sole path to creating a finalized medical record.
   */
  const handleSaveDraft = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const apptRef = doc(db, "appointments", patient.id);
      await updateDoc(apptRef, {
        soapDraft: {
          subjective: soapData.subjective,
          objectiveNotes: soapData.objectiveNotes,
          objWeight: soapData.objWeight,
          objTemp: soapData.objTemp,
          objHR: soapData.objHR,
          objRR: soapData.objRR,
          objCRT: soapData.objCRT,
          bcs: soapData.bcs,
          painScale: soapData.painScale,
          murmurGrade: soapData.murmurGrade,
          murmurLocation: soapData.murmurLocation,
          murmurTiming: soapData.murmurTiming,
          respEffort: soapData.respEffort,
          palpationFindings: soapData.palpationFindings,
          assessment: soapData.assessment,
          prognosis: soapData.prognosis,
          plan: soapData.plan,
          recheckIn: soapData.recheckIn,
          patientStatus: soapData.patientStatus,
          nextVisit: soapData.nextVisit,
        },
        prescribedItems: rxCart,
        prescribedItemsVersion: Timestamp.now(),
        draftSavedAt: Timestamp.now(),
        draftSavedBy: auth.currentUser?.uid || "system",
      });
      setIsDirty(false);
      showToast("Draft saved successfully.", "success");
    } catch (error) {
      console.error('[ClinicalWorkspace.handleSaveDraft]:', error.message);
      showToast("Failed to save draft: " + error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const getWeightDelta = () => {
    if (!soapData.objWeight || !prevVitals?.weight) return null;
    const current = parseFloat(soapData.objWeight);
    const previous = parseFloat(prevVitals.weight);
    if (isNaN(current) || isNaN(previous) || previous === 0) return null;
    return (((current - previous) / previous) * 100).toFixed(1);
  };
  const weightDelta = getWeightDelta();

  const autocompleteOptions = useMemo(() => [
    ...(inventoryList || []).filter(i => !i.isArchived).map(i => {
      const netAvailable = i.stock - (i.reserved || 0);
      return {
        ...i,
        label: `${i.itemName} (${netAvailable} avail)`,
        category: 'Pharmacy/Products',
        isLow: netAvailable <= 5,
        isOut: netAvailable <= 0,
      };
    }),
    ...(servicesList || []).filter(s => !s.isArchived).map(s => ({
      ...s,
      label: s.name,
      category: 'Clinical Services',
      isLow: false,
      isOut: false,
    })),
  ], [inventoryList, servicesList]);

  if (!patient) return null;

  return (
    <Dialog fullScreen open={open} onClose={handleCloseRequest} TransitionComponent={Transition}
      PaperProps={{ sx: { bgcolor: '#FDFCFB' } }}>

      <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

        {/* === SOAP COLUMN (LEFT) === */}
        <Box ref={soapRef} sx={{ flex: 7.5, display: 'flex', flexDirection: 'column', borderRight: '2px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>

          {/* --- IDENTITY STRIP --- */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 0.75,
            bgcolor: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.08)',
            flexShrink: 0, minHeight: 48, maxHeight: 56,
          }}>
            {/* Close button */}
            <IconButton size="small" onClick={handleCloseRequest} sx={{ color: COLORS.textMuted }}>
              <CloseIcon />
            </IconButton>

            {/* Avatar */}
            <Avatar sx={{
              width: 36, height: 36, bgcolor: COLORS.brand, fontFamily: FONT,
              fontWeight: 700, fontSize: '0.9rem', border: `2px solid ${COLORS.border}`,
            }}>
              {(patient?.petName || '?')[0].toUpperCase()}
            </Avatar>

            {/* Pet Name */}
            <Typography sx={{
              fontFamily: FONT, fontSize: '1.1rem', fontWeight: 1000,
              color: COLORS.brand, textTransform: 'uppercase', letterSpacing: -0.3,
              maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {patient?.petName || 'Unknown'}
            </Typography>

            {/* Species Rail */}
            <Typography sx={{
              fontFamily: 'monospace', fontSize: '0.68rem', fontWeight: 900,
              color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {[patient?.petSpecies, patient?.petBreed, patient?.petGender,
                patient?.petAge || calculateAge(patient?.petBirthdate || patient?.dob),
                patient?.petWeight ? `${patient.petWeight} KG` : '??? KG',
                patient?.petIsNeutered ? 'FIXED' : 'INTACT'
              ].filter(Boolean).join(' \u00B7 ')}
            </Typography>

            {/* Owner Info */}
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
              {patient?.ownerName || 'Walk-In'} {patient?.ownerPhone ? `| ${patient.ownerPhone}` : ''}
            </Typography>

            {/* Service Chips */}
            {(patient?.services || []).slice(0, 3).map((svc, i) => (
              <Chip key={i} label={svc.name || svc.serviceName || 'Service'}
                size="small" sx={{ height: 20, fontSize: '0.58rem', fontWeight: 1000 }} />
            ))}

            {/* Allergy */}
            <Chip
              label={patient?.allergies && patient.allergies !== 'None' ? `ALLERGY: ${patient.allergies}` : 'NKA'}
              size="small"
              sx={{
                height: 20, fontSize: '0.58rem', fontWeight: 1000,
                bgcolor: patient?.allergies && patient.allergies !== 'None' ? '#D32F2F' : 'transparent',
                color: patient?.allergies && patient.allergies !== 'None' ? 'white' : COLORS.textMuted,
                border: patient?.allergies && patient.allergies !== 'None' ? 'none' : '1px solid rgba(0,0,0,0.12)',
              }}
            />

            {/* WNL Button */}
            <Button size="small" variant="text" onClick={() => applyTemplate('wnl')}
              sx={{ fontSize: '0.65rem', fontWeight: 800, color: COLORS.brand, minWidth: 'auto', px: 1 }}>
              WNL
            </Button>

            {/* God-View Button */}
            <Tooltip title="God-View (Fullscreen SOAP)">
              <IconButton size="small" onClick={() => setIsUnifiedZen(true)} sx={{ color: COLORS.brand }}>
                <FitScreenIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* --- ALERTS --- */}
          {lockedServices.has('medical') && (
            <Alert severity="success" icon={<ShieldIcon/>}
              sx={{ fontWeight: 900, py: 0.5, fontSize: '0.75rem', flexShrink: 0 }}>
              This clinical record is SIGNED and LOCKED.
            </Alert>
          )}

          {/* --- 2x2 SOAP GRID (fills remaining space) --- */}
          <Grid container spacing={0} sx={{ flex: 1, minHeight: 0, overflow: 'hidden', bgcolor: '#FFF' }}>

            {/* S - SUBJECTIVE (top-left) */}
            <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' }, borderRight: { md: '1px solid #F0F0F0' }, borderBottom: '1px solid #F0F0F0' }}>
              <SoapQuadrant id="subjective" label="S - SUBJECTIVE (HISTORY & CLIENT REPORT)" onZoomField={setFullscreenField}>
                <TextField
                  multiline fullWidth variant="standard"
                  placeholder={ZEN_PLACEHOLDERS.subjective}
                  value={soapData.subjective || ''}
                  onChange={(e) => updateSoap('subjective', e.target.value)}
                  sx={{ flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' } }}
                  InputProps={{ disableUnderline: true, sx: { fontFamily: FONT, fontSize: '1.25rem', color: COLORS.brand, lineHeight: 1.6 } }}
                />
              </SoapQuadrant>
            </Grid>

            {/* O - OBJECTIVE (top-right) */}
            <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' }, borderBottom: '1px solid #F0F0F0' }}>
              <SoapQuadrant id="objectiveNotes" label="O - OBJECTIVE (EXAM & VITALS)" onZoomField={setFullscreenField}>
                <VitalsGrid soapData={soapData} updateSoap={updateSoap} getTriageLevel={getTriageLevel} renderHistoricalLabel={renderHistoricalLabel} compact />
                <TextField
                  multiline fullWidth variant="standard"
                  placeholder={ZEN_PLACEHOLDERS.objectiveNotes}
                  value={soapData.objectiveNotes || ''}
                  onChange={(e) => updateSoap('objectiveNotes', e.target.value)}
                  sx={{ flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' } }}
                  InputProps={{ disableUnderline: true, sx: { fontFamily: FONT, fontSize: '1.25rem', color: COLORS.brand, lineHeight: 1.6 } }}
                />
              </SoapQuadrant>
            </Grid>

            {/* A - ASSESSMENT (bottom-left) */}
            <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' }, borderRight: { md: '1px solid #F0F0F0' } }}>
              <SoapQuadrant id="assessment" label="A - ASSESSMENT (DIAGNOSIS & PROGNOSIS)" onZoomField={setFullscreenField}>
                <DiagnosticBridge soapData={soapData} assistiveText={assistiveText} diagnosticOpen={diagnosticOpen}
                  onAnalyze={() => { runAssistiveDiagnosis(); setDiagnosticOpen(true); }} onDismiss={() => setDiagnosticOpen(false)} />
                <TextField
                  multiline fullWidth variant="standard"
                  placeholder={ZEN_PLACEHOLDERS.assessment}
                  value={soapData.assessment || ''}
                  onChange={(e) => updateSoap('assessment', e.target.value)}
                  sx={{ flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' } }}
                  InputProps={{ disableUnderline: true, sx: { fontFamily: FONT, fontSize: '1.25rem', color: '#2E7D32', fontWeight: 900, lineHeight: 1.6 } }}
                />
              </SoapQuadrant>
            </Grid>

            {/* P - PLAN (bottom-right) */}
            <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' } }}>
              <SoapQuadrant id="plan" label="P - PLAN (TREATMENT & RECHECKS)" onZoomField={setFullscreenField}>

                {/* C1: Vaccine Details — only rendered for vaccination visits */}
                {isVaccinationVisit && (
                  <Box sx={{ mb: 2, p: 2, bgcolor: '#E8F5E9', border: '1px solid #A5D6A7', flexShrink: 0 }}>
                    <Typography sx={{ fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 1, color: '#2E7D32', mb: 1.5 }}>
                      VACCINE DETAILS
                    </Typography>
                    <Grid container spacing={1.5}>
                      <Grid size={{ xs: 6 }}>
                        <TextField size="small" fullWidth label="Vaccine Name" value={vaccineData.vaccineName}
                          onChange={(e) => setVaccineData(prev => ({ ...prev, vaccineName: e.target.value }))}
                          sx={{ bgcolor: 'white' }} />
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <TextField size="small" fullWidth label="Manufacturer" value={vaccineData.manufacturer}
                          onChange={(e) => setVaccineData(prev => ({ ...prev, manufacturer: e.target.value }))}
                          sx={{ bgcolor: 'white' }} />
                      </Grid>
                      <Grid size={{ xs: 4 }}>
                        <TextField size="small" fullWidth label="Lot Number" value={vaccineData.lotNumber}
                          onChange={(e) => setVaccineData(prev => ({ ...prev, lotNumber: e.target.value }))}
                          sx={{ bgcolor: 'white' }} />
                      </Grid>
                      <Grid size={{ xs: 4 }}>
                        <TextField size="small" fullWidth label="Route" select value={vaccineData.routeOfAdmin}
                          onChange={(e) => setVaccineData(prev => ({ ...prev, routeOfAdmin: e.target.value }))}
                          sx={{ bgcolor: 'white' }}>
                          {['SQ', 'IM', 'ID', 'IN', 'PO'].map(r => (
                            <MenuItem key={r} value={r}>{r}</MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                      <Grid size={{ xs: 4 }}>
                        <TextField size="small" fullWidth label="Site" value={vaccineData.siteOfInjection}
                          onChange={(e) => setVaccineData(prev => ({ ...prev, siteOfInjection: e.target.value }))}
                          sx={{ bgcolor: 'white' }} />
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <TextField size="small" fullWidth label="Next Due Date" type="date" value={vaccineData.dueDate}
                          onChange={(e) => setVaccineData(prev => ({ ...prev, dueDate: e.target.value }))}
                          InputLabelProps={{ shrink: true }} sx={{ bgcolor: 'white' }} />
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <TextField size="small" fullWidth label="Interval (days)" type="number" value={vaccineData.intervalDays}
                          onChange={(e) => setVaccineData(prev => ({ ...prev, intervalDays: parseInt(e.target.value) || 365 }))}
                          sx={{ bgcolor: 'white' }} />
                      </Grid>
                    </Grid>
                  </Box>
                )}

                {/* C3: Lab Results — available on any visit type */}
                <Box sx={{ mb: 2, flexShrink: 0 }}>
                  <Button size="small" variant="text"
                    onClick={() => setLabResults(prev => [...prev, { testName: '', result: '', status: 'normal', notes: '' }])}
                    sx={{ fontWeight: 900, fontSize: '0.65rem', textTransform: 'uppercase', color: '#1565C0', mb: 1 }}>
                    + Add Lab Result
                  </Button>
                  {labResults.map((lab, idx) => (
                    <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                      <TextField size="small" placeholder="Test Name" value={lab.testName}
                        onChange={(e) => {
                          const updated = [...labResults];
                          updated[idx] = { ...updated[idx], testName: e.target.value };
                          setLabResults(updated);
                        }}
                        sx={{ flex: 2, bgcolor: 'white' }} />
                      <TextField size="small" placeholder="Result" value={lab.result}
                        onChange={(e) => {
                          const updated = [...labResults];
                          updated[idx] = { ...updated[idx], result: e.target.value };
                          setLabResults(updated);
                        }}
                        sx={{ flex: 2, bgcolor: 'white' }} />
                      <TextField size="small" select value={lab.status}
                        onChange={(e) => {
                          const updated = [...labResults];
                          updated[idx] = { ...updated[idx], status: e.target.value };
                          setLabResults(updated);
                        }}
                        sx={{ flex: 1, bgcolor: 'white' }}>
                        <MenuItem value="normal">Normal</MenuItem>
                        <MenuItem value="abnormal">Abnormal</MenuItem>
                        <MenuItem value="critical">Critical</MenuItem>
                      </TextField>
                      <IconButton size="small"
                        onClick={() => setLabResults(prev => prev.filter((_, i) => i !== idx))}
                        sx={{ color: '#D32F2F' }}>
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  ))}
                </Box>

                <TextField
                  multiline fullWidth variant="standard"
                  placeholder={ZEN_PLACEHOLDERS.plan}
                  value={soapData.plan || ''}
                  onChange={(e) => updateSoap('plan', e.target.value)}
                  sx={{ flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' } }}
                  InputProps={{ disableUnderline: true, sx: { fontFamily: FONT, fontSize: '1.25rem', color: COLORS.brand, lineHeight: 1.6 } }}
                />
                {/* Draft-save button pinned to bottom of P quadrant.
                    Deliberately muted (outlined, small, right-aligned) so it is
                    visually subordinate to the consent-gated sidebar sign-off. */}
                {!lockedServices.has('medical') && (
                  <Box sx={{ pt: 1.5, flexShrink: 0, borderTop: '1px dashed rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<SaveAltIcon />}
                      onClick={handleSaveDraft}
                      disabled={loading || !isDirty}
                      sx={{
                        fontWeight: 800,
                        fontSize: '0.7rem',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        color: COLORS.textSecondary,
                        borderColor: COLORS.border,
                        '&:hover': {
                          borderColor: COLORS.accent,
                          bgcolor: 'rgba(93, 64, 55, 0.04)',
                        },
                        '&.Mui-disabled': {
                          borderColor: COLORS.borderLight,
                          color: COLORS.textMuted,
                        },
                      }}
                    >
                      {loading ? 'Saving...' : 'Save Draft'}
                    </Button>
                  </Box>
                )}
              </SoapQuadrant>
            </Grid>

          </Grid>
        </Box>

        {/* === SIDEBAR (RIGHT) === */}
        <Box sx={{ flex: 2.5, overflowY: 'auto', p: 3, bgcolor: '#FAF8F5' }}>
            <Stack spacing={3}>
                <Paper ref={treatmentRef} sx={{ ...glassStyle, p: 3, borderLeft: `8px solid ${COLORS.accent}` }}>
                    <Typography variant="h6" sx={{ fontWeight: 1000, color: COLORS.brand, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ReceiptLongIcon sx={{ color: COLORS.accent }} /> Treatment Plan
                    </Typography>

                    {/* 🧬 PHASE 3: STOCK GUARD & CLINICAL ALERTS */}
                    {!isRecordLocked && (
                        <Autocomplete
                            id="inventory-search"
                            options={autocompleteOptions}
                            groupBy={(option) => option.category}
                            getOptionLabel={(option) => option.label || ''}
                            getOptionDisabled={(option) => option.isOut === true}
                            onChange={(event, newValue) => handleAddRx(newValue)}
                            renderOption={(props, option) => (
                                <Box component="li" {...props} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', py: 1 }}>
                                    <Box>
                                        <Typography sx={{ fontWeight: 900, fontSize: '0.85rem', color: option.isOut ? COLORS.textMuted : 'inherit', display: 'flex', alignItems: 'center' }}>
                                            {option.itemName || option.name}
                                            {option.isMedicine && <MedicationIcon sx={{ fontSize: 14, color: '#D32F2F', ml: 1 }} />}
                                        </Typography>
                                        {option.stock !== undefined && (
                                            <Typography variant="caption" sx={{ color: option.isOut ? '#D32F2F' : (option.isLow ? '#EF6C00' : COLORS.textMuted), fontWeight: 800 }}>
                                                {option.isOut ? 'EXHAUSTED' : (option.isLow ? `LOW STOCK: ${option.stock - (option.reserved || 0)} left` : `${option.stock - (option.reserved || 0)} available`)}
                                            </Typography>
                                        )}
                                    </Box>
                                    {option.isLow && !option.isOut && <Chip label="LOW" size="small" color="warning" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 1000 }} />}
                                    {option.isOut && <Chip label="OUT" size="small" color="error" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 1000 }} />}
                                </Box>
                            )}
                            renderInput={(params) => (
                                <TextField 
                                    {...params} 
                                    variant="outlined" 
                                    size="small" 
                                    placeholder="Search Inventory / Services..." 
                                    sx={{ 
                                        mb: 2, 
                                        '& .MuiOutlinedInput-root': { 
                                            borderRadius: 2, 
                                            bgcolor: 'white',
                                            fontWeight: 900
                                        } 
                                    }} 
                                />
                            )}
                            sx={{ width: '100%' }}
                        />
                    )}

                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {rxCart.map((rx, idx) => (
                            <Box key={idx} sx={{ bgcolor: 'white', p: 2, borderRadius: 2, border: `1px solid ${COLORS.borderLight}` }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography sx={{ fontWeight: 1000, fontSize: '0.85rem', color: COLORS.brand }}>{rx.name}</Typography>
                                    <IconButton size="small" onClick={()=>handleRemoveRx(idx)}><CloseIcon sx={{ fontSize: 14, color: '#D32F2F' }}/></IconButton>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#F5F5F5', borderRadius: 1.5, px: 0.5 }}>
                                        <IconButton size="small" onClick={() => handleUpdateQty(idx, -1)} sx={{ p: 0.5 }}><ContentCutIcon sx={{ fontSize: 14, rotate: '90deg' }} /></IconButton>
                                        <Typography sx={{ fontWeight: 1000, fontSize: '0.85rem' }}>{rx.qty}</Typography>
                                        <IconButton size="small" onClick={() => handleUpdateQty(idx, 1)} sx={{ p: 0.5 }}><AddCircleIcon sx={{ fontSize: 14, color: COLORS.brand }} /></IconButton>
                                    </Box>
                                    <Typography sx={{ fontWeight: 1000, fontSize: '0.9rem', color: COLORS.brand }}>₱{(rx.price * rx.qty).toLocaleString()}</Typography>
                                </Box>
                            </Box>
                        ))}
                    </Stack>
                    
                    {/* 🧬 PHASE 2: DYNAMIC TOTAL CALCULATOR */}
                    {rxCart.length > 0 && (
                        <Box sx={{ mt: 3, pt: 2, borderTop: `2px solid ${COLORS.borderLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography sx={{ fontWeight: 1000, color: COLORS.textMuted, fontSize: '0.75rem', textTransform: 'uppercase' }}>Subtotal</Typography>
                            <Typography sx={{ fontWeight: 1000, color: COLORS.brand, fontSize: '1.2rem' }}>
                                ₱{rxCart.reduce((sum, item) => sum + (item.price * item.qty), 0).toLocaleString()}
                            </Typography>
                        </Box>
                    )}
                </Paper>

                {!isRecordLocked && (
                    <Paper sx={{ ...glassStyle, p: 3, borderLeft: '8px solid #FF8F00', bgcolor: '#FFF8E1' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1.5 }}>
                            <WarningIcon sx={{ color: '#FF8F00' }} />
                            <Typography sx={{ fontWeight: 1000, color: '#FF8F00', fontSize: '0.9rem' }}>CRM SOVEREIGNTY SYNC</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 2 }}>
                            <Typography sx={{ fontWeight: 1000, fontSize: '0.65rem' }}>Propagate to Master DB</Typography>
                            <Switch checked={syncToCRM} onChange={(e) => setSyncToCRM(e.target.checked)} color="warning" size="small" />
                        </Box>
                    </Paper>
                )}

                <Box sx={{ pt: 2 }}>
                    {!isRecordLocked ? (
                        <Stack spacing={2}>
                            {/* Staff-witnessed consent acknowledgement — not a cryptographic digital signature.
                                Replace with a canvas-based signature pad if legal requirements escalate. */}
                            <Button variant="outlined" fullWidth size="large" onClick={() => setOwnerSignature(`consent_witnessed_${Date.now()}`)} startIcon={<HistoryEduIcon />} sx={{ fontWeight: 1000, borderRadius: 3, py: 1.5 }}>{ownerSignature ? "CONSENT CAPTURED ✅" : "SIGN DIGITAL CONSENT"}</Button>
                            <Button variant="contained" fullWidth size="large" onClick={handleSaveConsult} disabled={loading || !ownerSignature} sx={{ fontWeight: 1000, borderRadius: 3, py: 2, bgcolor: COLORS.brand, textTransform: 'uppercase' }}>{loading ? "PROCESSING..." : saveBtnText}</Button>
                        </Stack>
                    ) : (
                        <Box sx={{ p: 3, bgcolor: '#E8F5E9', borderRadius: 3, border: '2px dashed #2E7D32', textAlign: 'center' }}>
                            <Typography variant="h6" fontWeight={1000} color="#2E7D32">RECORD SEALED</Typography>
                        </Box>
                    )}
                </Box>
            </Stack>
        </Box>
      </Box>

      {/* 🧘 THE ZEN MODE FOCUS OVERLAY (CLINICAL CONCENTRATION) ── */}
      <Dialog 
        fullScreen open={!!fullscreenField} onClose={() => setFullscreenField(null)} 
        TransitionComponent={Transition} PaperProps={{ sx: { bgcolor: 'rgba(253, 252, 251, 0.98)', backdropFilter: 'blur(20px)' } }}
      >
        <AppBar elevation={0} sx={{ position: 'relative', bgcolor: COLORS.banner, borderBottom: `1px solid ${COLORS.bannerBorder}`, py: 1 }}>
          <Toolbar>
            <IconButton edge="start" color="inherit" onClick={() => setFullscreenField(null)} aria-label="close"><CloseIcon sx={{ color: COLORS.textMuted }} /></IconButton>
            <Box sx={{ ml: 2, flex: 1 }}>
                <Typography sx={{ fontFamily: FONT, fontSize: '1.2rem', fontWeight: 1000, color: COLORS.brand, textTransform: 'uppercase', letterSpacing: 1.5, lineHeight: 1 }}>
                  {patient?.petName || 'UNKNOWN PATIENT'}
                </Typography>
                <Typography component="div" sx={{ fontFamily: FONT, fontSize: '0.68rem', fontWeight: 900, color: COLORS.brand, textTransform: 'uppercase', mt: 0.5, opacity: 0.8, display: 'flex', alignItems: 'center', gap: 1 }}>
                    {patient?.petSpecies} • {patient?.petBreed || 'MIXED'} • {patient?.petGender || '??'} • {calculateAge(patient?.petBirthdate || petDetails?.dob)} • {soapData.objWeight || patient.petWeight ? `${soapData.objWeight || patient.petWeight} KG` : 'WEIGH REQUIRED'} • {patient?.petIsNeutered ? 'FIXED' : 'INTACT'}
                    {patient?.petAllergies && patient.petAllergies.trim().length > 0 && patient.petAllergies.toUpperCase() !== 'NONE' ? (
                        <Box component="span" sx={{ bgcolor: '#D32F2F', color: 'white', px: 0.8, py: 0.1, borderRadius: 0.5, fontSize: '0.55rem', fontWeight: 1000, ml: 1, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            ⚠️ {patient.petAllergies.toUpperCase()} ALERT
                        </Box>
                    ) : (
                        <Box component="span" sx={{ opacity: 0.5, fontSize: '0.55rem', fontWeight: 1000, ml: 1 }}>
                            ● NO ALLERGIES
                        </Box>
                    )}
                </Typography>
            </Box>
            <Button 
              autoFocus 
              variant="outlined" 
              onClick={() => setFullscreenField(null)} 
              sx={{ fontWeight: 1000, color: COLORS.brand, borderColor: COLORS.brand, borderRadius: 2 }}
            >
              EXIT {fullscreenField?.includes('obj') ? 'OBJECTIVE' : fullscreenField?.toUpperCase()}
            </Button>
          </Toolbar>
        </AppBar>
        <Box sx={{ p: 10, maxWidth: 1200, mx: 'auto', width: '100%' }}>
          <Typography variant="h3" sx={{ fontFamily: FONT, fontWeight: 1000, color: COLORS.brand, mb: 4, opacity: 0.5 }}>
            {fullscreenField?.includes('obj') ? 'OBJECTIVE' : fullscreenField?.toUpperCase()}
          </Typography>

          {/* Show vitals grid when Zen-expanding the Objective section */}
          {fullscreenField === 'objectiveNotes' && (
            <VitalsGrid
              soapData={soapData}
              updateSoap={updateSoap}
              getTriageLevel={getTriageLevel}
              renderHistoricalLabel={renderHistoricalLabel}
            />
          )}

          {/* Show diagnostic bridge when Zen-expanding the Assessment section */}
          {fullscreenField === 'assessment' && (
            <DiagnosticBridge
              soapData={soapData}
              assistiveText={assistiveText}
              diagnosticOpen={diagnosticOpen}
              onAnalyze={() => { runAssistiveDiagnosis(); setDiagnosticOpen(true); }}
              onDismiss={() => setDiagnosticOpen(false)}
            />
          )}

          <TextField
            autoFocus multiline fullWidth variant="standard"
            placeholder={ZEN_PLACEHOLDERS[fullscreenField] || "Enter clinical notes..."}
            value={soapData[fullscreenField] || ''}
            onChange={(e) => updateSoap(fullscreenField, e.target.value)}
            InputProps={{ 
              disableUnderline: true, 
              sx: { fontSize: '2.5rem', fontFamily: FONT, fontWeight: 500, lineHeight: 1.4, color: COLORS.brand } 
            }}
          />
        </Box>
      </Dialog>

      {/* 🏛️ THE 'GOD-VIEW' UNIFIED CLINICAL COMMAND CENTER ── */}
      <Dialog 
        fullScreen open={isUnifiedZen} onClose={() => setIsUnifiedZen(false)} 
        TransitionComponent={Transition} PaperProps={{ sx: { bgcolor: '#FDFCFB' } }}
      >
        {/* --- 🆕 LEGACY IMMERSION HEADER --- */}
        <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.05)', bgcolor: 'white' }}>
            <Box>
                <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: 1000, color: COLORS.brand, letterSpacing: -1, lineHeight: 1, mb: 0.5 }}>
                    {patient?.petName?.toUpperCase() || 'UNKNOWN PATIENT'}
                </Typography>
                <Typography variant="caption" sx={{ color: COLORS.brand, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.5, opacity: 0.8, display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                    {patient?.petSpecies} • {patient?.petBreed || 'MIXED BREED'} • {patient?.petGender || 'UNKNOWN'} • {calculateAge(patient?.petBirthdate || petDetails?.dob)} • {soapData.objWeight || patient.petWeight ? `${soapData.objWeight || patient.petWeight} KG` : 'WEIGH REQUIRED'} • {patient?.petIsNeutered ? 'FIXED' : 'INTACT'} • {patient?.color || patient?.petColor || petDetails?.color || 'N/A'}
                    {patient?.petAllergies && patient.petAllergies.trim().length > 0 && patient.petAllergies.toUpperCase() !== 'NONE' ? (
                        <Box component="span" sx={{ bgcolor: '#D32F2F', color: 'white', px: 1, py: 0.2, borderRadius: 1, fontSize: '0.6rem', fontWeight: 1000, ml: 1, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            ⚠️ ALLERGY ALERT: {patient.petAllergies.toUpperCase()}
                        </Box>
                    ) : (
                        <Box component="span" sx={{ opacity: 0.5, fontSize: '0.6rem', fontWeight: 1000, ml: 1 }}>
                            ● NO ALLERGIES DISCLOSED
                        </Box>
                    )}
                </Typography>
            </Box>
            <Button 
                variant="contained" 
                onClick={() => setIsUnifiedZen(false)}
                sx={{ bgcolor: '#3E2723', color: 'white', borderRadius: 50, px: 4, py: 1, fontWeight: 1000, '&:hover': { bgcolor: '#2D1D1B' } }}
            >
                EXIT GOD-VIEW
            </Button>
        </Box>

        <Box sx={{ flex: 1, height: 'calc(100vh - 84px)', overflow: 'hidden', bgcolor: '#FFF' }}>
            <Grid container spacing={0} sx={{ height: '100%' }}>
                {/* Top-Left: S - Subjective */}
                <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' } }}>
                    <SoapQuadrant id="subjective" label="S - SUBJECTIVE (HISTORY & CLIENT REPORT)"
                        onZoomField={setFullscreenField}
                        sx={{ borderRight: { md: '1px solid #F0F0F0' }, borderBottom: '1px solid #F0F0F0' }}>
                        <TextField
                            multiline fullWidth variant="standard"
                            placeholder={ZEN_PLACEHOLDERS.subjective}
                            value={soapData.subjective || ''}
                            onChange={(e) => updateSoap('subjective', e.target.value)}
                            sx={{ flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' } }}
                            InputProps={{ disableUnderline: true, sx: { fontFamily: FONT, fontSize: '1.25rem', color: COLORS.brand, lineHeight: 1.6 } }}
                        />
                    </SoapQuadrant>
                </Grid>

                {/* Top-Right: O - Objective (with VitalsGrid) */}
                <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' } }}>
                    <SoapQuadrant id="objectiveNotes" label="O - OBJECTIVE (EXAM & VITALS)"
                        onZoomField={setFullscreenField}
                        sx={{ borderBottom: '1px solid #F0F0F0' }}>
                        <VitalsGrid
                          soapData={soapData}
                          updateSoap={updateSoap}
                          getTriageLevel={getTriageLevel}
                          renderHistoricalLabel={renderHistoricalLabel}
                        />
                        <TextField
                            multiline fullWidth variant="standard"
                            placeholder={ZEN_PLACEHOLDERS.objectiveNotes}
                            value={soapData.objectiveNotes || ''}
                            onChange={(e) => updateSoap('objectiveNotes', e.target.value)}
                            sx={{ flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' } }}
                            InputProps={{ disableUnderline: true, sx: { fontFamily: FONT, fontSize: '1.25rem', color: COLORS.brand, lineHeight: 1.6 } }}
                        />
                    </SoapQuadrant>
                </Grid>

                {/* Bottom-Left: A - Assessment (with DiagnosticBridge) */}
                <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' } }}>
                    <SoapQuadrant id="assessment" label="A - ASSESSMENT (DIAGNOSIS & PROGNOSIS)"
                        onZoomField={setFullscreenField}
                        sx={{ borderRight: { md: '1px solid #F0F0F0' } }}>
                        <DiagnosticBridge
                          soapData={soapData}
                          assistiveText={assistiveText}
                          diagnosticOpen={diagnosticOpen}
                          onAnalyze={() => { runAssistiveDiagnosis(); setDiagnosticOpen(true); }}
                          onDismiss={() => setDiagnosticOpen(false)}
                        />
                        <TextField
                            multiline fullWidth variant="standard"
                            placeholder={ZEN_PLACEHOLDERS.assessment}
                            value={soapData.assessment || ''}
                            onChange={(e) => updateSoap('assessment', e.target.value)}
                            sx={{ flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' } }}
                            InputProps={{ disableUnderline: true, sx: { fontFamily: FONT, fontSize: '1.25rem', color: COLORS.brand, lineHeight: 1.6 } }}
                        />
                    </SoapQuadrant>
                </Grid>

                {/* Bottom-Right: P - Plan */}
                <Grid size={{ xs: 12, md: 6 }} sx={{ height: { xs: 'auto', md: '50%' } }}>
                    <SoapQuadrant id="plan" label="P - PLAN (TREATMENT & RECHECKS)" onZoomField={setFullscreenField}>
                        <TextField
                            multiline fullWidth variant="standard"
                            placeholder={ZEN_PLACEHOLDERS.plan}
                            value={soapData.plan || ''}
                            onChange={(e) => updateSoap('plan', e.target.value)}
                            sx={{ flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' } }}
                            InputProps={{ disableUnderline: true, sx: { fontFamily: FONT, fontSize: '1.25rem', color: COLORS.brand, lineHeight: 1.6 } }}
                        />
                    </SoapQuadrant>
                </Grid>
            </Grid>
        </Box>
      </Dialog>

      {/* Draft-save toast — non-blocking feedback for save success/error */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          onClose={() => setToast(prev => ({ ...prev, open: false }))}
          sx={{ width: '100%', fontFamily: FONT, fontWeight: 'bold', boxShadow: 3 }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}
