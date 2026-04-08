import React, { useState, useEffect, useRef } from 'react';
import { 
  Dialog, Slide, AppBar, Toolbar, IconButton, Typography, Button, 
  Box, Paper, Avatar, Chip, TextField, FormControl, InputLabel, 
  Select, MenuItem, List, ListItemText, ListSubheader, Grid, // MUI v6 Grid
  Stack, Divider, Collapse, Tooltip, InputBase, alpha, FormControlLabel, Switch,
  Autocomplete, CircularProgress
} from '@mui/material';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer 
} from 'recharts';

// Icons (Unified)
import { 
  Close as CloseIcon, Medication as MedicationIcon, AutoFixHigh as AutoFixHighIcon, 
  Warning as WarningIcon, ContentCut as ContentCutIcon, MedicalServices as MedicalServicesIcon, 
  AddCircle as AddCircleIcon, ReceiptLong as ReceiptLongIcon, TrendingUp as TrendingUpIcon, 
  Favorite as FavoriteIcon, CalendarMonth as CalendarMonthIcon, Save as SaveIcon, 
  Search as SearchIcon, HistoryEdu as HistoryEduIcon, Visibility as VisibilityIcon, 
  MedicalInformation as MedicalInformationIcon, LocalHospital as LocalHospitalIcon, 
  ExitToApp as ExitToAppIcon, Info as InfoIcon, Calculate as CalculateIcon, 
  Bolt as BoltIcon, Room as RoomIcon, ContentPaste as ContentPasteIcon,
  CheckCircle as CheckCircleIcon, Report as ReportIcon, Block as BlockIcon,
  ReportProblem as ReportProblemIcon, Shield as ShieldIcon, FlashOn as FlashOnIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon, Print as PrintIcon,
  OpenInFull as OpenInFullIcon, FitScreen as FitScreenIcon
} from '@mui/icons-material';
import { doc, setDoc, collection, addDoc, Timestamp, updateDoc, getDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useInventory } from '../features/Inventory/hooks/useInventory';

// Design Tokens
import { FONT, TYPE, COLORS, getInitialColor } from '../theme/designTokens';

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
  const [vitalsData, setVitalsData] = useState([]);
  const [tempData, setTempData] = useState([]);
  const [hrData, setHrData] = useState([]);
  const [nextAppointment, setNextAppointment] = useState(null);
  const [petDetails, setPetDetails] = useState(null);
  const [prevVitals, setPrevVitals] = useState(null);

  // THE FIX: Concurrent Workflow Mapping (Multi-Service Support)
  const activeWorkflows = new Set(patient?.services?.map(s => s.workflowType) || ['MEDICAL']);
  const workflowType = patient?.services?.[0]?.workflowType || 'MEDICAL';

  const [soapData, setSoapData] = useState({
    subjective: '', objWeight: '', objTemp: '', objHR: '', objRR: '', objCRT: '', bcs: 5, painScale: 0, objectiveNotes: '',
    murmurGrade: 'None', murmurLocation: 'L Apex', murmurTiming: 'Systolic', respEffort: 'Normal',
    palpationFindings: { masses: false, pain: false, tense: false, normal: true },
    assessment: '', prognosis: 'Good', plan: '', recheckIn: '1 Week', patientStatus: 'Stable', nextVisit: ''
  });
  const [isIsolationMode, setIsIsolationMode] = useState(false);
  const [isolationProtocol, setIsolationProtocol] = useState({ gloves: false, gown: false, shoeCovers: false, dedicatedGear: false });
  const [isRecordLocked, setIsRecordLocked] = useState(false);
  const [ownerSignature, setOwnerSignature] = useState(null);
  const [assistiveText, setAssistiveText] = useState('');

  // THE FIX: Dedicated Grooming State
  const [groomingData, setGroomingData] = useState({
    coatCondition: 'Normal', parasites: 'None', temperament: 'Calm', shampoo: 'Oatmeal', notes: ''
  });
  const [groomingSpecs, setGroomingSpecs] = useState({ bladeNumber: '10', coatTexture: 'Normal' });
  const [groomingChecklist, setGroomingChecklist] = useState({ nails: '', ears: '', glands: '', teeth: '' });
  
  // THE FIX: Restored Clinical Metadata & Calculator States
  const [safetyLevel, setSafetyLevel] = useState('Safe');
  const [labQuickStats, setLabQuickStats] = useState({ pcv: '', tp: '', glucose: '' });
  const [dentalGrade, setDentalGrade] = useState(0);
  const [lamenessGrade, setLamenessGrade] = useState(0);
  const [calcDose, setCalcDose] = useState('');
  const [calcConc, setCalcConc] = useState('');
  const [calcResult, setCalcResult] = useState(0);
  const [fluidDehydration, setFluidDehydration] = useState('');
  const [fluidLoss, setFluidLoss] = useState('');
  const [fluidResult, setFluidResult] = useState(0);
  const [nutritionFactor, setNutritionFactor] = useState(1.6);
  
  const [rxCart, setRxCart] = useState([]);
  const [selectedRxItem, setSelectedRxItem] = useState('');
  const [syncToCRM, setSyncToCRM] = useState(true);

  // --- 🧘 ZEN FOCUS & IMMERSION ---
  const [fullscreenField, setFullscreenField] = useState(null); // Field ID for zoom
  const [isUnifiedZen, setIsUnifiedZen] = useState(false); // Global SOAP zoom

  // --- 🆕 ZEN NAVIGATION & STATE ---
  const soapRef = useRef(null);
  const treatmentRef = useRef(null);
  const dischargeRef = useRef(null);

  const [activeHighlight, setActiveHighlight] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedModule, setFocusedModule] = useState(null);
  const [lockedServices, setLockedServices] = useState(new Set());
  const [expandedModules, setExpandedModules] = useState(new Set(['soap', 'treatment', 'sync']));
  const [allergyAnchorEl, setAllergyAnchorEl] = useState(null);

  const toggleModule = (id) => {
    setExpandedModules(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
  };

  const jumpToSection = (sectionId, ref) => {
    setActiveHighlight(sectionId);
    setExpandedModules(prev => new Set(prev).add(sectionId));
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setActiveHighlight(null), 3000);
  };

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
  const navItems = [
    { label: 'Clinical Story', ref: soapRef, id: 'soap', icon: <HistoryEduIcon sx={{ fontSize: 18 }} /> },
    { label: 'Treatment Plan', ref: treatmentRef, id: 'treatment', icon: <MedicalInformationIcon sx={{ fontSize: 18 }} /> },
    { label: 'Sovereignty Sync', ref: dischargeRef, id: 'sync', icon: <ShieldIcon sx={{ fontSize: 18 }} /> },
  ];

  const deptObj = (departments ||[]).find(d => d.name === (patient?.serviceCategory || 'General'));
  const badgeColor = deptObj ? deptObj.color : COLORS.brand;

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
    const fetchPatientContext = async () => {
        if (open && patient) {
          setIsDirty(false);
          setAssistiveText('');
          setSafetyLevel('Safe');
          setLabQuickStats({ pcv: '', tp: '', glucose: '' });
          setLamenessGrade(0);
          setDentalGrade(0);

          // --- 🧬 MULTI-SERVICE SIGN-OFF SYNC ---
          const completedFromDb = new Set();
          (patient.services || []).forEach(s => {
              if (s.status === 'completed') {
                  if (s.workflowType === 'MEDICAL') completedFromDb.add('medical');
                  if (s.workflowType === 'AESTHETIC') completedFromDb.add('aesthetic');
                  completedFromDb.add(s.id);
              }
          });
          setLockedServices(completedFromDb);

          // --- 🧬 MULTI-SERVICE DATA INJECTION ---

          if (activeWorkflows.has('AESTHETIC')) {
            setGroomingData({ 
                parasites: 'None', temperament: 'Calm', 
                shampoo: 'Oatmeal', notes: patient.notes && patient.notes !== 'Walk-in client' ? `Client Request: ${patient.notes}\n` : '' 
            });
            setGroomingSpecs({ bladeNumber: '10', coatTexture: 'Normal' });
            setGroomingChecklist({ nails: '', ears: '', glands: '', teeth: '' });
          }

          if (activeWorkflows.has('MEDICAL')) {
            setSoapData({
                subjective: patient.notes && patient.notes !== 'Walk-in client' && !patient.notes.includes('QUICK ADMIT') ? `Client noted: "${patient.notes}"\n\n` : '',
                objWeight: '', objTemp: '', objHR: '', objRR: '', objCRT: '2', 
                bcs: 5, painScale: 0,
                murmurGrade: 'None', murmurLocation: 'L Apex (Mitral)', murmurTiming: 'Systolic',
                palpationFindings: { masses: false, pain: false, tense: false, normal: true },
                objectiveNotes: '', assessment: '', patientStatus: 'Stable', plan: '', nextVisit: ''
            });
          }

        let initialCart =[];
        const baseService = servicesList.find(s => s.name === patient.primaryService);
        
        // Push every booked service into the cart!
        (patient.services || []).forEach(svc => {
            initialCart.push({
                type: 'service', id: svc.id, name: svc.name, 
                price: svc.price || 0, qty: 1, isDrug: false, isBase: true 
            });
        });

        // Link products for primary service
        if (baseService && baseService.linkedProduct) {
            const linkedInv = inventoryList.find(i => i.id === baseService.linkedProduct);
            if (linkedInv) {
                initialCart.push({
                    type: 'product', id: linkedInv.id, name: linkedInv.itemName, 
                    price: linkedInv.price, qty: 1, isDrug: linkedInv.category === 'Medicine' || linkedInv.category === 'Vaccine', 
                    isBase: false, isAutoBundled: true, instructions: ''
                });
            }
        }
        setRxCart(initialCart);
        setSelectedRxItem('');

        if (patient.petId && patient.petId !== "WALK_IN_USER" && patient.petId !== "UNKNOWN") {
          try {
            const petDoc = await getDoc(doc(db, "pets", patient.petId));
            if (petDoc.exists()) setPetDetails(petDoc.data());
            else setPetDetails(null);

            const q = query(collection(db, "medical_records"), where("petId", "==", patient.petId), orderBy("date", "desc"));
            const snapshot = await getDocs(q);
            const historyData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setHistory(historyData);

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
          setPetDetails(null); setVitalsData([]); setHistory([]);
        }
      }
    };
    fetchPatientContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patient]);

  // --- 2. HANDLERS ---
  const handlePushDoseToCart = () => {
    if (calcResult <= 0) return alert("Calculate a valid dose first.");
    const drugIdx = rxCart.findIndex(i => i.isDrug);
    if (drugIdx === -1) return alert("Please add the medication to the Treatment Plan first.");
    
    const newCart = [...rxCart];
    // --- 🧬 PRECISION DOSE INJECTION ---
    newCart[drugIdx].sig = { 
        ...(newCart[drugIdx].sig || { frequency: 'SID', duration: '1', unit: 'mL', route: 'SQ' }), 
        dose: calcResult.toFixed(2) 
    };
    setRxCart(newCart);
    alert(`Pushed ${calcResult.toFixed(2)}mL to Medication Order!`);
  };

  useEffect(() => {
    const weight = parseFloat(soapData.objWeight) || 0;
    const dose = parseFloat(calcDose) || 0;
    const conc = parseFloat(calcConc) || 0;
    if (weight && dose && conc) setCalcResult((weight * dose) / conc);
    else setCalcResult(0);
  }, [soapData.objWeight, calcDose, calcConc]);

  // Fluid Rate Math: (Wt * %Dehyd * 10) + Maintenance (50ml/kg) + Loss
  useEffect(() => {
    const weight = parseFloat(soapData.objWeight) || 0;
    const dehyd = parseFloat(fluidDehydration) || 0;
    const loss = parseFloat(fluidLoss) || 0;
    if (weight) setFluidResult((weight * dehyd * 10) + (weight * 50) + loss);
    else setFluidResult(0);
  }, [soapData.objWeight, fluidDehydration, fluidLoss]);


  const updateSurgical = (field) => { setSurgicalChecklist(prev => ({ ...prev, [field]: !prev[field] })); setIsDirty(true); };
  const updateGroomingSpec = (field, value) => { setGroomingSpecs(prev => ({ ...prev, [field]: value })); setIsDirty(true); };

  // --- 🩺 TRIAGE ENGINE ---
  const getTriageLevel = (type, val) => {
    const v = parseFloat(val);
    if (!v) return 'normal';
    const species = patient.petSpecies === 'Feline' ? 'cat' : 'dog';
    
    if (type === 'temp') {
        if (v > 39.5 || v < 37.0) return 'critical';
        if (v > 39.2) return 'warning';
    }
    if (type === 'hr') {
        if (species === 'dog') { if (v > 160 || v < 60) return 'critical'; }
        else { if (v > 220 || v < 140) return 'critical'; }
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

  const getNormalROM = (joint, type) => {
    const isCat = patient?.petSpecies === 'Feline';
    const ROM = {
        stifle: { flexion: isCat ? 35 : 40, extension: isCat ? 160 : 165 },
        hip: { flexion: isCat ? 35 : 50, extension: isCat ? 160 : 160 },
        elbow: { flexion: isCat ? 35 : 35, extension: isCat ? 165 : 165 },
        shoulder: { flexion: isCat ? 50 : 60, extension: isCat ? 165 : 160 }
    };
    return ROM[joint]?.[type] || '--';
  };

  const handleCloseRequest = () => {
    if (isDirty) {
      if (window.confirm("⚠️ WARNING: You have unsaved clinical notes. Closing this will discard them. Are you sure?")) onClose();
    } else {
      onClose();
    }
  };

  const updateSoap = (field, value) => { setSoapData(prev => ({ ...prev, [field]: value })); setIsDirty(true); };
  const updateGrooming = (field, value) => { setGroomingData(prev => ({ ...prev, [field]: value })); setIsDirty(true); };

  const applyTemplate = (type) => {
    if (type === 'vaccine') {
      updateSoap('subjective', soapData.subjective + '\nPresented for annual vaccination. No abnormalities reported.');
      updateSoap('objectiveNotes', soapData.objectiveNotes + '\nBAR. Mucous membranes pink. Lungs clear.');
      updateSoap('assessment', soapData.assessment ? soapData.assessment + ' / Healthy for vaccination.' : 'Healthy for vaccination.');
      updateSoap('plan', soapData.plan + '\nAdministered vaccine subQ. Monitored 15 mins.');
    } else if (type === 'wnl') {
      // THE FIX: It now fills BOTH the notes AND the vitals!
      updateSoap('objectiveNotes', "MM: Pink/Moist, CRT <2s\nHydration: Normal\nResp Effort: Normal\nAbdomen: Soft/Non-painful\nDental: Grade 0 (No calc/gingivitis)\n\nGeneral Appearance: WNL\nEENT: WNL\nCardiovascular: WNL\nRespiratory: WNL\nGastrointestinal: WNL\nMusculoskeletal: WNL\nIntegumentary (Skin): WNL\nLymph Nodes: WNL\nNeurological: WNL\nUrogenital: WNL");
      
      // Inject species-appropriate baseline vitals
      const isDog = (patient?.petSpecies === 'Canine' || patient?.petSpecies === 'Dog');
      updateSoap('objTemp', isDog ? '38.5' : '38.6'); // Normal temps
      updateSoap('objHR', isDog ? '100' : '140'); // Normal heart rates
      updateSoap('objRR', isDog ? '20' : '24'); // Normal resp rates
      updateSoap('objCRT', '<2'); // Normal Capillary Refill Time
      updateSoap('objBCS', '5'); // Perfect Body Condition Score
      updateSoap('objPain', '0'); // No pain
    }
  };

  // --- 🆕 CLINCAL COMPARISON ENGINE (THE GHOST) ---
  const renderHistoricalLabel = (field, customVal = null) => {
    if (!history || history.length === 0) return null;
    const last = history[0];
    let val = customVal;

    if (!val) {
        // Try common vitals mapping
        const vKey = field.replace('obj', '').toLowerCase();
        val = last.vitals?.[vKey] || last[field];
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
  const handleAddRx = (item) => {
    if (!item) return;
    
    const isMedicine = !!item.isMedicine; // 🩺 THE FORENSIC FLAG

    const itemObj = { 
      type: item.stock !== undefined ? 'product' : 'service', 
      id: item.id, 
      name: item.itemName || item.name, 
      price: item.price || 0, 
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
        reserveStock(itemObj.id, 1);
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
        releaseStock(itemToRemove.id, itemToRemove.qty || 1);
    }
  };

  const handleUpdateQty = (index, delta) => {
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
        if (delta > 0) reserveStock(item.id, 1);
        else releaseStock(item.id, 1);
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
  const hasDrugsInCart = rxCart.some(item => item.isDrug);
  const nextRouteStatus = hasDrugsInCart ? "dispensing" : "billing";
  const saveBtnText = hasDrugsInCart ? "Sign & Send to Pharmacy" : "Sign & Send to Cashier";

  const handleSaveConsult = async () => {
    if (workflowType !== 'AESTHETIC' && (!soapData.assessment || !soapData.plan)) {
        return alert("Assessment and Plan are required for legal medical documentation.");
    }
    if (workflowType === 'AESTHETIC' && !groomingData.notes) {
        return alert("Please enter grooming notes.");
    }

    setLoading(true);
    try {
      const vetUid = auth.currentUser?.uid || "system";
      const vetName = auth.currentUser?.displayName || "Authorized Clinician";
      const visitTotal = rxCart.reduce((sum, item) => sum + (item.price * item.qty), 0);

      // 1. CREATE PERMANENT MEDICAL RECORD (Clinical MEMORY)
      await addDoc(collection(db, "medical_records"), {
        appointmentId: patient.id, 
        petId: patient.petId || "WALK_IN_PET", 
        petName: patient.petName, 
        ownerId: patient.ownerId, 
        ownerName: patient.ownerName || "Walk-In Client",
        vetId: vetUid,
        vetName: vetName,
        signedBy: { uid: vetUid, name: vetName },
        date: Timestamp.now(), 
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
            lockedAt: Timestamp.now()
        },
        patientStatus: soapData.patientStatus, 
        nextVisit: soapData.nextVisit ? Timestamp.fromDate(new Date(soapData.nextVisit)) : null, 
      });

      setIsRecordLocked(true);

      for (const item of rxCart) {
          if (item.type === 'product') {
              try {
                  const invRef = doc(db, "inventory", item.id);
                  const invSnap = await getDoc(invRef);
                  if (invSnap.exists()) {
                      const currentStock = invSnap.data().stock || 0;
                      await updateDoc(invRef, {
                          stock: Math.max(0, currentStock - item.qty),
                          lastUsed: Timestamp.now(),
                          "audit.lastAdjustment": `Used in Visit: ${patient.petName}`,
                          "audit.adjustmentUser": vetName
                      });
                  }
              } catch (invErr) {
                  console.error("Critical Inventory Reconcile Error:", invErr);
              }
          }
      }

      // 3. CREATE FINANCIAL TRANSACTION (CASHIER LEDGER)
      await addDoc(collection(db, "transactions"), {
        appointmentId: patient.id,
        petId: patient.petId || "UNKNOWN",
        ownerId: patient.ownerId || "WALK_IN",
        date: Timestamp.now(),
        items: rxCart.map(item => ({
            name: item.name,
            qty: item.qty,
            unitPrice: item.price,
            total: item.price * item.qty,
            isDrug: item.isDrug,
            sig: item.sig // Pass structured Sig for bill/label
        })),
        totalAmount: visitTotal,
        paymentStatus: 'pending',
        type: 'consultation_billing',
        processedBy: vetName
      });

      // 4. THE CLINICAL SOVEREIGNTY GATE (IDENTITY SYNC)
      if (syncToCRM && patient.petId && patient.petId !== "WALK_IN_PET") {
          // A. UPDATE MASTER PET (Biometric Alignment)
          await updateDoc(doc(db, "pets", patient.petId), {
              name: patient.petName,
              species: patient.petSpecies,
              breed: patient.petBreed,
              gender: patient.petGender,
              isNeutered: patient.petIsNeutered,
              dob: patient.petBirthdate,
              isAgeExact: patient.isAgeExact !== false,
              "audit.lastSyncDate": Timestamp.now(),
              "audit.syncStaff": vetName,
              "audit.syncReason": "Clinical Session Biometric Sync"
          });

          // B. UPDATE MASTER CLIENT (Logistical Alignment)
          if (patient.ownerId && patient.ownerId !== "WALK_IN") {
              await updateDoc(doc(db, "clients", patient.ownerId), {
                  fullName: patient.ownerName,
                  phone: patient.ownerPhone,
                  "audit.lastPhoneUpdate": Timestamp.now()
              });
          }

          // C. LOG FORENSIC OVERRIDE IN PULSE
          await updateDoc(doc(db, "appointments", patient.id), {
              clinicalPulse: arrayUnion({
                  eventId: `sync_${Date.now()}`,
                  type: 'CRM_SYNC_SUCCESS',
                  timestamp: Timestamp.now(),
                  staffName: vetName,
                  note: "Master CRM updated with clinical corrections."
              })
          });
      }

      // 5. PROPAGATE VITALS TO PET PROFILE (DASHBOARD TRENDS)
      if (patient.petId && patient.petId !== "WALK_IN_PET") {
          await updateDoc(doc(db, "pets", patient.petId), {
              "lastVitals.weight": soapData.objWeight || null,
              "lastVitals.temp": soapData.objTemp || null,
              "lastVitals.hr": soapData.objHR || null,
              "lastVitals.rr": soapData.objRR || null,
              "lastVitals.bcs": soapData.bcs || null,
              "lastVitals.painScale": soapData.painScale || null,
              "lastVitals.crt": soapData.objCRT || null,
              "lastVitals.safetyStatus": safetyLevel,
              "lastVitals.dentalGrade": dentalGrade,
              "lastVitals.lamenessGrade": lamenessGrade,
              "lastVitals.recordedAt": Timestamp.now(),
              lastVisitDate: Timestamp.now()
          });
      }

      // 4. ADVANCE QUEUE / APPOINTMENT STATUS
      await updateDoc(doc(db, "appointments", patient.id), { 
          status: nextRouteStatus,
          prescribedItems: rxCart,
          finalTotal: visitTotal,
          signedOffAt: Timestamp.now()
      });

      setLoading(false); 
      setIsDirty(false); 
      onClose(); 
      alert(`✅ ENCOUNTER FINALIZED!\n\nClinical record signed by ${vetName}.\nPatient moved to ${hasDrugsInCart ? 'PHARMACY' : 'CHECKOUT'}.\nTotal: ₱${visitTotal.toLocaleString()}`);
    } catch (error) { 
        console.error("Save Error:", error);
        setLoading(false); 
        alert("🚨 Critical Save Error: " + error.message); 
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

  let headerColor = badgeColor; 
  if (workflowType !== 'AESTHETIC' && soapData.patientStatus === 'Critical') headerColor = '#D32F2F'; 
  else if (workflowType !== 'AESTHETIC' && soapData.patientStatus === 'Guarded') headerColor = '#F57C00'; 

  if (!patient) return null;

  return (
    <Dialog fullScreen open={open} onClose={handleCloseRequest} TransitionComponent={Transition} PaperProps={{ sx: { bgcolor: '#FDFCFB' }}}>
      <style>{`
        @keyframes glowCritical {
          0% { box-shadow: 0 0 5px rgba(211, 47, 47, 0.4); }
          50% { box-shadow: 0 0 20px rgba(211, 47, 47, 0.8), inset 0 0 10px rgba(211, 47, 47, 0.2); }
          100% { box-shadow: 0 0 5px rgba(211, 47, 47, 0.4); }
        }
        .glow-critical { animation: glowCritical 1s infinite ease-in-out !important; border: 2px solid #D32F2F !important; border-radius: 8px; }
        .glow-warning { border: 2px solid #FF8F00 !important; border-radius: 8px; }
        
        @keyframes glowBiteRisk {
          0% { background-color: #FFF; }
          50% { background-color: #FFF3E0; border-bottom: 3px solid #FF8F00; }
          100% { background-color: #FFF; }
        }
        @keyframes glowAggressive {
          0% { background-color: #FFF; }
          50% { background-color: #FFEBEE; border-bottom: 3px solid #D32F2F; box-shadow: 0 0 20px rgba(211, 47, 47, 0.4); }
          100% { background-color: #FFF; }
        }
        @keyframes glowIsolation {
          0% { background-color: #7B1FA2; }
          50% { background-color: #9C27B0; box-shadow: 0 0 15px rgba(156, 39, 176, 0.5); }
          100% { background-color: #7B1FA2; }
        }
        .header-bite-risk { animation: glowBiteRisk 2s infinite ease-in-out !important; }
        .header-aggressive { animation: glowAggressive 1s infinite ease-in-out !important; }
        .header-isolation { animation: glowIsolation 3s infinite ease-in-out !important; color: white !important; }
      `}</style>
      
      {/* ═══ STICKY PATIENT BANNER (CRM STYLE) ═══ */}
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        {/* ═══ STICKY PATIENT BANNER (CRM STYLE) ═══ */}
        <Box sx={{ 
            bgcolor: isIsolationMode ? '#7B1FA2' : COLORS.brand, 
            borderBottom: isIsolationMode ? '2px solid #FFEB3B' : 'none', 
            display: 'flex', alignItems: 'center', flexShrink: 0, boxShadow: '0 2px 10px rgba(0,0,0,0.15)', zIndex: 1201 
        }} className={isIsolationMode ? 'header-isolation' : safetyLevel === 'Bite-Risk' ? 'header-bite-risk' : safetyLevel === 'Aggressive' ? 'header-aggressive' : ''}>
            <Box sx={{ display: 'flex', alignItems: 'center', py: 0.75, px: 2, gap: 2, flex: 1 }}>
            <IconButton onClick={handleCloseRequest} size="small" sx={{ color: 'rgba(255,255,255,0.8)', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          
            <Avatar sx={{ width: 44, height: 44, fontFamily: FONT, bgcolor: getInitialColor(patient?.petName), fontWeight: 700, fontSize: '1.1rem', color: '#FFF', border: `2.5px solid rgba(255,255,255,0.3)` }}>
              {(patient?.petName || '?')[0].toUpperCase()}
            </Avatar>

          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 3 }}>
                {/* --- 🏷️ PRIMARY IDENTITY (FIXED LEFT) --- */}
                <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 220 }}>
                    <Typography sx={{ fontFamily: FONT, fontSize: '1.2rem', fontWeight: 1000, color: '#FFFFFF', letterSpacing: -0.2, lineHeight: 1.1, textTransform: 'capitalize' }}>
                       {patient?.petName}
                    </Typography>
                    <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 800, color: 'rgba(255,255,255,0.7)', mt: 0.5, letterSpacing: 0.2 }}>
                       {patient?.ownerName || 'GUEST'} • {patient?.ownerPhone || patient?.phone || 'No Contact'}
                    </Typography>
                </Box>

                <Box sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '1.4rem', fontWeight: 100 }}>|</Box>

                {/* --- 🩺 CLINICAL RAIL (EXPANDING CENTER) --- */}
                <Typography component="div" sx={{ flex: 1, textAlign: 'center', fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 1000, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {patient?.petSpecies} • {patient?.breed || patient?.petBreed || 'MIXED'} • {patient?.color || patient?.petColor || 'UNSPECIFIED COLOR'} • {patient?.petGender || '??'} • {calculateAge(patient?.petBirthdate || patient?.dob)} • {soapData.objWeight || patient.petWeight ? `${soapData.objWeight || patient.petWeight} KG` : '??'} • {patient?.petIsNeutered ? 'FIXED' : 'INTACT'}
                </Typography>

              {/* --- ⚠️ HAZARD ZONE (FIXED RIGHT) --- */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: 'auto', minWidth: 'fit-content', justifyContent: 'flex-end' }}>
                  {(() => {
                      const allergiesVal = patient?.petAllergies || patient?.allergies || "None";
                      const hasAllergies = allergiesVal.trim().length > 0 && allergiesVal.toUpperCase() !== 'NONE';

                      if (hasAllergies) {
                         return (
                            <>
                               <Chip 
                                  label={`⚠️ ALLERGIES DETECTED`} 
                                  onClick={(e) => setAllergyAnchorEl(e.currentTarget)}
                                  size="small" 
                                  sx={{ 
                                     height: 22, fontSize: '0.65rem', fontWeight: 1000, bgcolor: '#D32F2F', color: 'white', borderRadius: 1.5, px: 1, cursor: 'pointer',
                                     boxShadow: '0 0 15px rgba(211,47,47,0.5)', border: '1px solid rgba(255,255,255,0.3)',
                                     '&:hover': { bgcolor: '#B71C1C' }
                                  }} 
                               />
                               <Menu
                                  anchorEl={allergyAnchorEl}
                                  open={Boolean(allergyAnchorEl)}
                                  onClose={() => setAllergyAnchorEl(null)}
                                  PaperProps={{ sx: { bgcolor: '#3E2721', border: '1px solid #D32F2F', boxShadow: 24, minWidth: 200 } }}
                               >
                                  <Box sx={{ p: 1.5 }}>
                                     <Typography variant="overline" sx={{ color: '#FF5252', fontWeight: 1000, display: 'block', mb: 1, letterSpacing: 1 }}>ALLERGY LEDGER:</Typography>
                                     <Divider sx={{ bgcolor: 'rgba(255,255,255,0.1)', mb: 1 }} />
                                     {allergiesVal.split(',').map((alg, i) => (
                                        <Typography key={i} sx={{ color: 'white', fontWeight: 800, fontSize: '0.85rem', py: 0.5, textTransform: 'uppercase' }}>
                                           • {alg.trim()}
                                        </Typography>
                                     ))}
                                  </Box>
                               </Menu>
                            </>
                         );
                      } else {
                         return <Chip label="● NO KNOWN ALLERGIES" size="small" sx={{ height: 20, fontSize: '0.55rem', fontWeight: 1000, bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', borderRadius: 1, px: 0.5, border: '1px solid rgba(255,255,255,0.05)' }} />;
                      }
                  })()}
                  
                  <Chip label={patient?.serviceType} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#FFFFFF', fontWeight: 900, fontSize: '0.65rem', height: 20, border: '1px solid rgba(255,255,255,0.2)' }} />
              </Box>
          </Box>
          <Box sx={{ flex: 1 }} />
        </Box>
      </Box>

        {/* ── 🆕 PILLAR 1: THE PERSISTENT VITALS STRIP (PANORAMIC INLAID HUD) ── */}
        <Box sx={{ 
            bgcolor: '#3E2721', borderBottom: `1px solid rgba(255,193,7,0.15)`, px: 4, py: 1.25, 
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
            position: 'sticky', top: 0, zIndex: 1100 
        }}>
            {[
                { label: 'WT (kg)', value: soapData.objWeight, field: 'objWeight', icon: '⚖️', status: 'normal' },
                { label: 'TEMP (°C)', value: soapData.objTemp, field: 'objTemp', icon: '🌡️', status: getTriageLevel('temp', soapData.objTemp) },
                { label: 'HR (bpm)', value: soapData.objHR, field: 'objHR', icon: '❤️', status: getTriageLevel('hr', soapData.objHR) },
                { label: 'RR (rpm)', value: soapData.objRR, field: 'objRR', icon: '🫁', status: 'normal' },
                { label: 'CRT (sec)', value: soapData.objCRT, field: 'objCRT', icon: '⏱️', status: 'normal' },
                { label: 'BCS (1-9)', value: soapData.bcs, field: 'bcs', icon: '🐾', status: 'normal' },
                { label: 'PAIN', value: soapData.painScale, field: 'painScale', icon: '🩹', status: 'normal' },
            ].map(v => (
                <Box key={v.field} sx={{ 
                    display: 'flex', alignItems: 'center', gap: 1.5,
                    bgcolor: '#2D1B16', px: 2, py: 0.5, borderRadius: 1.5,
                    border: '1px solid rgba(255,193,7,0.1)',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
                    transition: 'all 0.3s ease'
                }}>
                    <Typography variant="caption" sx={{ fontWeight: 1000, color: 'rgba(255,255,255,0.7)', fontSize: '0.6rem', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                       {v.label}
                    </Typography>
                    <InputBase 
                        size="small" value={v.value} 
                        onChange={(e) => updateSoap(v.field, e.target.value)}
                        className={v.status === 'critical' ? 'glow-critical' : v.status === 'warning' ? 'glow-warning' : ''}
                        sx={{ 
                            width: 55, fontWeight: 1000, 
                            color: v.status === 'critical' ? '#FF5252' : '#FFD600', 
                            fontSize: '0.9rem', px: 0.5,
                            '& input': { textAlign: 'center', py: 0.2 },
                            '&.Mui-focused': { color: '#FFF', borderBottom: '1px solid #FFD600' }
                        }} 
                    />
                    {renderHistoricalLabel(v.field)}
                </Box>
            ))}
        </Box>

            {/* 🧬 GLOBAL SERVICES HUD (OBSIDIAN INLAID) */}
            <Box sx={{ px: 3, py: 1, bgcolor: '#3E2721', borderBottom: '1px solid rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto' }}>
                <Typography variant="overline" sx={{ fontWeight: 1000, color: '#FFD600', flexShrink: 0, letterSpacing: 1.5, fontSize: '0.6rem', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>SERVICES:</Typography>
                {(patient.services || []).map((s, idx) => {
                    const isDone = s.status === 'completed' || lockedServices.has(s.id);
                    return (
                        <Chip 
                            key={idx} label={`${s.name} | ${s.staffName || 'Unassigned'}`} 
                            size="small" 
                            icon={isDone ? <CheckCircleIcon sx={{ fontSize: '14px !important', color: 'white !important' }} /> : <BoltIcon sx={{ fontSize: '14px !important', color: '#FFD600 !important' }} />}
                            sx={{ 
                                fontWeight: 1000, fontSize: '0.6rem', height: 24,
                                bgcolor: isDone ? '#1B5E20' : 'rgba(45, 27, 22, 0.8)',
                                color: 'white',
                                border: isDone ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,193,7,0.15)',
                                '&:hover': { bgcolor: isDone ? '#2E7D32' : 'rgba(255,255,255,0.05)' }
                            }}
                        />
                    );
                })}
            </Box>
        
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', pointerEvents: isRecordLocked ? 'none' : 'auto', opacity: isRecordLocked ? 0.9 : 1 }} className="hud-canvas">
        
        {/* 🏺 PILLAR 1: CLINICAL NARRATIVE (75% WIDTH) */}
        <Box sx={{ 
            flex: 7.5, overflowY: 'auto', p: 3, borderRight: `2px solid ${COLORS.borderLight}`,
            backgroundColor: 'rgba(0,0,0,0.01)',
            '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.timelineRail, borderRadius: 10 } 
        }}>
            <Paper 
                ref={soapRef}
                className={`${activeHighlight === 'soap' ? 'highlight-module' : ''} elevate-module ${focusedModule && focusedModule !== 'soap' ? 'dim-overlay' : ''} ${lockedServices.has('medical') ? 'module-locked' : ''}`}
                sx={{ ...glassStyle, p: 4, borderLeft: `8px solid ${badgeColor}`, transition: 'all 0.4s ease' }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <HistoryEduIcon sx={{ fontSize: 32, color: COLORS.brand }} />
                        <Typography variant="h5" sx={{ fontFamily: FONT, fontWeight: 1000, color: COLORS.brand }}>
                            Clinical Documentation (S.O.A.P.)
                        </Typography>
                        <Tooltip title="Enter God-View (Unified Layout)">
                            <IconButton size="small" onClick={() => setIsUnifiedZen(true)} sx={{ color: COLORS.brand, bgcolor: `${COLORS.brand}10`, '&:hover': { bgcolor: `${COLORS.brand}20` } }}>
                                <FitScreenIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                    <Stack direction="row" spacing={1} sx={{ bgcolor: 'rgba(0,0,0,0.03)', p: 0.5, borderRadius: 2 }}>
                        <Button size="small" variant="text" onClick={() => applyTemplate('vaccine')} sx={{ fontWeight: 800, textTransform: 'none', borderRadius: 1.5, px: 2, color: COLORS.brand }}>Vaccine Template</Button>
                        <Button size="small" variant="text" onClick={() => applyTemplate('wnl')} sx={{ fontWeight: 800, textTransform: 'none', borderRadius: 1.5, px: 2, color: COLORS.brand }}>Auto-Fill WNL</Button>
                    </Stack>
                </Box>

                {lockedServices.has('medical') && (
                    <Alert severity="success" icon={<ShieldIcon/>} sx={{ mb: 3, fontWeight: 900, borderRadius: 2 }}>This clinical record is SIGNED and LOCKED. No further edits are possible.</Alert>
                )}

                <Stack spacing={4}>
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, fontWeight: 900 }}>S - SUBJECTIVE (Owner Complaint & History)</Typography>
                            <IconButton size="small" onClick={() => setFullscreenField('subjective')} sx={{ color: COLORS.textMuted }}><OpenInFullIcon sx={{ fontSize: 16 }} /></IconButton>
                        </Box>
                        <TextField multiline minRows={4} maxRows={15} fullWidth value={soapData.subjective} onChange={(e) => updateSoap('subjective', e.target.value)} placeholder="Enter history and client concerns..." sx={{ bgcolor: 'white', borderRadius: 2 }} />
                    </Box>

                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, fontWeight: 900 }}>O - OBJECTIVE (Clinical Observation & Vitals)</Typography>
                            <IconButton size="small" onClick={() => setFullscreenField('objectiveNotes')} sx={{ color: COLORS.textMuted }}><OpenInFullIcon sx={{ fontSize: 16 }} /></IconButton>
                        </Box>
                        <Box sx={{ bgcolor: '#FAF8F5', p: 3, borderRadius: 3, border: `1px solid ${COLORS.borderLight}`, mb: 2 }}>
                            <Grid container spacing={3}>
                                {[
                                    { label: 'WEIGHT (kg)', value: soapData.objWeight, field: 'objWeight', icon: '⚖️' },
                                    { label: 'TEMP (°C)', value: soapData.objTemp, field: 'objTemp', icon: '🌡️' },
                                    { label: 'HR (bpm)', value: soapData.objHR, field: 'objHR', icon: '❤️' },
                                    { label: 'RR (rpm)', value: soapData.objRR, field: 'objRR', icon: '🫁' },
                                    { label: 'CRT (sec)', value: soapData.objCRT, field: 'objCRT', icon: '⏱️' },
                                    { label: 'BCS (1-9)', value: soapData.bcs, field: 'bcs', icon: '🐾' },
                                    { label: 'PAIN (0-10)', value: soapData.painScale, field: 'painScale', icon: '🩹' },
                                ].map(v => (
                                    <Grid key={v.field} size={{ xs: 6, md: 1.7 }}>
                                        <Typography variant="caption" sx={{ fontWeight: 1000, color: COLORS.textSecondary, display: 'block', mb: 0.5, fontSize: '0.6rem' }}>{v.icon} {v.label}</Typography>
                                        <InputBase size="small" value={v.value} onChange={(e) => updateSoap(v.field, e.target.value)} sx={{ width: '100%', fontWeight: 1000, color: COLORS.brand, borderBottom: '2px solid rgba(0,0,0,0.1)', fontSize: '1rem', px: 0.5, bgcolor: 'white' }} />
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>
                        <TextField multiline minRows={4} maxRows={15} fullWidth value={soapData.objectiveNotes} onChange={(e) => updateSoap('objectiveNotes', e.target.value)} placeholder="Describe physical examination findings..." sx={{ bgcolor: 'white', borderRadius: 2 }} />
                    </Box>

                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, fontWeight: 900 }}>A - ASSESSMENT (The Diagnosis)</Typography>
                            <IconButton size="small" onClick={() => setFullscreenField('assessment')} sx={{ color: COLORS.textMuted }}><OpenInFullIcon sx={{ fontSize: 16 }} /></IconButton>
                        </Box>
                        <TextField multiline minRows={3} maxRows={10} fullWidth value={soapData.assessment} onChange={(e) => updateSoap('assessment', e.target.value)} placeholder="Medical diagnosis..." sx={{ bgcolor: 'rgba(76, 175, 80, 0.05)', borderRadius: 2, '& .MuiOutlinedInput-root': { fontWeight: 900, color: '#2E7D32' } }} />
                    </Box>

                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, fontWeight: 900 }}>P - PLAN (Instructions & Follow-up)</Typography>
                            <IconButton size="small" onClick={() => setFullscreenField('plan')} sx={{ color: COLORS.textMuted }}><OpenInFullIcon sx={{ fontSize: 16 }} /></IconButton>
                        </Box>
                        <TextField multiline minRows={4} maxRows={15} fullWidth value={soapData.plan} onChange={(e) => updateSoap('plan', e.target.value)} placeholder="Procedures and follow-up instructions..." sx={{ bgcolor: 'white', borderRadius: 2 }} />
                    </Box>
                </Stack>

                {!lockedServices.has('medical') && (
                    <Box sx={{ mt: 5, pt: 4, borderTop: '2px dashed rgba(0,0,0,0.08)', textAlign: 'center' }}>
                        <Button variant="contained" color="success" size="large" startIcon={<ShieldIcon />} sx={{ fontWeight: 1000, px: 8, py: 1.5, borderRadius: 50 }} onClick={() => handleCompleteService('medical')}>Sign & Finalize Medical Record</Button>
                    </Box>
                )}
            </Paper>
        </Box>

        {/* 🏺 PILLAR 2: COMMAND HUB (25% WIDTH) */}
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
                            options={[
                                ...(inventoryList || []).map(i => {
                                    const netAvailable = i.stock - (i.reserved || 0);
                                    return { 
                                        ...i, 
                                        label: `${i.itemName} (${netAvailable} avail)`, 
                                        category: 'Pharmacy/Products',
                                        isLow: netAvailable <= 5,
                                        isOut: netAvailable <= 0
                                    };
                                }),
                                ...(servicesList || []).map(s => ({ ...s, label: s.name, category: 'Clinical Services', isLow: false, isOut: false }))
                            ]}
                            groupBy={(option) => option.category}
                            getOptionLabel={(option) => option.label || ''}
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
                            <Button variant="outlined" fullWidth size="large" onClick={() => setOwnerSignature(`signed_${Date.now()}`)} startIcon={<HistoryEduIcon />} sx={{ fontWeight: 1000, borderRadius: 3, py: 1.5 }}>{ownerSignature ? "CONSENT CAPTURED ✅" : "SIGN DIGITAL CONSENT"}</Button>
                            <Button variant="contained" fullWidth size="large" onClick={handleSaveConsult} disabled={loading || !ownerSignature} sx={{ fontWeight: 1000, borderRadius: 3, py: 2, bgcolor: COLORS.brand }}>{loading ? "PROCESSING..." : (hasDrugsInCart ? "SIGN & DISPENSE" : "SIGN & PAY")}</Button>
                        </Stack>
                    ) : (
                        <Box sx={{ p: 3, bgcolor: '#E8F5E9', borderRadius: 3, border: '2px dashed #2E7D32', textAlign: 'center' }}>
                            <Typography variant="h6" fontWeight={1000} color="#2E7D32">RECORD SEALED</Typography>
                        </Box>
                    )}
                </Box>
            </Stack>
        </Box>
      </Box> {/* Closes hud-canvas (B3) */}
    </Box> {/* Closes 100vh Master Shell (B1) */}

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
                {[
                    { id: 'subjective', label: 'S - SUBJECTIVE (HISTORY & CLIENT REPORT)' },
                    { id: 'objectiveNotes', label: 'O - OBJECTIVE (EXAM & VITALS)' },
                    { id: 'assessment', label: 'A - ASSESSMENT (DIAGNOSIS & PROGNOSIS)' },
                    { id: 'plan', label: 'P - PLAN (TREATMENT & RECHECKS)' }
                ].map((field, index) => (
                    <Grid key={field.id} size={{ xs: 12, md: 6 }} sx={{ height: '50%' }}>
                        <Box sx={{ 
                            height: '100%', p: 4, 
                            borderRight: index % 2 === 0 ? '1px solid #F0F0F0' : 'none',
                            borderBottom: index < 2 ? '1px solid #F0F0F0' : 'none',
                            display: 'flex', flexDirection: 'column', position: 'relative',
                            transition: 'background 0.2s',
                            '&:focus-within': { bgcolor: '#FDFCFB' },
                            overflowY: 'auto',
                            scrollbarWidth: 'thin',
                            '&::-webkit-scrollbar': { width: '4px' },
                            '&::-webkit-scrollbar-track': { background: 'transparent' },
                            '&::-webkit-scrollbar-thumb': { background: '#E0E0E0', borderRadius: '10px' },
                            '&::-webkit-scrollbar-thumb:hover': { background: COLORS.brand }
                        }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography sx={{ fontWeight: 1000, color: COLORS.brand, fontSize: '0.7rem', letterSpacing: 1.2, opacity: 1 }}>
                                    {field.label}
                                </Typography>
                                <Tooltip title={`ZEN FOCUS: ${field.id.toUpperCase()}`}>
                                    <IconButton 
                                        size="small" 
                                        onClick={() => setFullscreenField(field.id)}
                                        sx={{ 
                                            opacity: 0.3, 
                                            '&:hover': { opacity: 1, bgcolor: '#F5F5F5' },
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <OpenInFullIcon sx={{ fontSize: 16, color: '#3E2723' }} />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                            <TextField 
                                multiline fullWidth variant="standard"
                                placeholder={ZEN_PLACEHOLDERS[field.id] || "Clinical documentation..."}
                                value={soapData[field.id] || ''}
                                onChange={(e) => updateSoap(field.id, e.target.value)}
                                sx={{ flex: 1, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' } }}
                                InputProps={{ 
                                    disableUnderline: true,
                                    sx: { fontFamily: FONT, fontSize: '1.25rem', color: COLORS.brand, lineHeight: 1.6 } 
                                }}
                            />
                        </Box>
                    </Grid>
                ))}
            </Grid>
        </Box>
      </Dialog>
    </Dialog>
  );
}
