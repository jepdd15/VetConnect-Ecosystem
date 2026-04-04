import React, { useState, useEffect, useRef } from 'react';
import { 
  Dialog, Slide, AppBar, Toolbar, IconButton, Typography, Button, 
  Box, Paper, Avatar, Chip, TextField, FormControl, InputLabel, 
  Select, MenuItem, List, ListItemText, ListSubheader, Grid, // MUI v6 Grid
  Stack, Divider, Collapse, Tooltip, InputBase, alpha, FormControlLabel, Switch
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
    subjective: '', objWeight: '', objTemp: '', objHR: '', objRR: '', objCRT: '', objBCS: '', objPain: '', objectiveNotes: '',
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
  
  const [rxCart, setRxCart] = useState([]);
  const[selectedRxItem, setSelectedRxItem] = useState('');

  // --- 🆕 PILLAR NAVIGATION REFS ---
  const soapRef = useRef(null);
  const groomingRef = useRef(null);
  const treatmentRef = useRef(null);
  const diagnosticsRef = useRef(null);
  const dischargeRef = useRef(null);
  const actionRef = useRef(null);
  const billingRef = useRef(null);
  const surgeryRef = useRef(null);
  const rehabRef = useRef(null);

  const [activeHighlight, setActiveHighlight] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedModule, setFocusedModule] = useState(null); // HUD Focus state
  const [lockedServices, setLockedServices] = useState(new Set()); // IDs of finalized services
  
  // --- 🆕 EXPANSION & VISUAL RHYTHM ---
  const [expandedModules, setExpandedModules] = useState(new Set(['soap', 'action', 'surgery', 'rehab', 'calc', 'internal', 'rx', 'diagnostics', 'discharge']));
  const toggleModule = (id) => {
    setExpandedModules(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
  };

  const handleCompleteService = async (svcId) => {
    const service = patient.services.find(s => s.id === svcId);
    if (!service) return;

    if (window.confirm(`Are you sure you want to finalize [${service.name}]? This will lock the inputs for this section.`)) {
        setLoading(true);
        try {
            const newServices = patient.services.map(s => 
                s.id === svcId ? { ...s, status: 'completed' } : s
            );
            
            await updateDoc(doc(db, "appointments", patient.id), { services: newServices });
            setLockedServices(prev => new Set([...prev, svcId]));
            alert(`✅ ${service.name} finalized and status updated!`);
        } catch (e) { alert(e.message); }
        finally { setLoading(false); }
    }
  };

  // --- 🆕 ADVANCED HUB STATE ---

  const [mappingTab, setMappingTab] = useState('vax'); // vax | exam
  const [examMarkers, setExamMarkers] = useState([]); // [{x, y, type, note}]
  const [vaxLotInfo, setVaxLotInfo] = useState({ lot: '', route: 'SQ' });
  const [groomingChecklist, setGroomingChecklist] = useState({ nails: false, ears: false, glands: false, teeth: false });
  const [calcDose, setCalcDose] = useState(''); 
  const [calcConc, setCalcConc] = useState(''); 
  const [calcResult, setCalcResult] = useState(0); 

  // --- 🆕 ADAPTIVE TOOLBELT STATE ---
  const [fluidDehydration, setFluidDehydration] = useState(0); // %
  const [fluidLoss, setFluidLoss] = useState(0); // mL
  const [fluidResult, setFluidResult] = useState(0); // mL/day
  const [surgicalChecklist, setSurgicalChecklist] = useState({ 
    preOpExam: false, equipmentOk: false, spongeCount: false, postOpVitals: false,
    inductionTime: '', recoveryTime: '', ebl: '0' 
  });
  const [groomingSpecs, setGroomingSpecs] = useState({ bladeNumber: '10', coatTexture: 'Normal', stylingNotes: '' });
  const [selectedSite, setSelectedSite] = useState(null);
  
  // --- 🆕 NICHE COMMAND STATES ---
  const [safetyLevel, setSafetyLevel] = useState('Safe'); // Safe | Bite-Risk | Aggressive
  const [labQuickStats, setLabQuickStats] = useState({ pcv: '', tp: '', glucose: '' });
  const [nutritionFactor, setNutritionFactor] = useState(1.6); // Default: Neutered Adult
  const [fullscreenField, setFullscreenField] = useState(null); 
  const [isUnifiedZen, setIsUnifiedZen] = useState(false);
  const [syncToCRM, setSyncToCRM] = useState(false); // SHIFT 5.6: THE CLINICAL SOVEREIGNTY GATE
  
  // --- 🆕 REHAB & MOBILITY STATES ---
  const [lamenessGrade, setLamenessGrade] = useState(0); // 0-5
  const [jointROM, setJointROM] = useState({
      stifle: { lFlex: '', lExt: '', rFlex: '', rExt: '' },
      hip: { lFlex: '', lExt: '', rFlex: '', rExt: '' },
      elbow: { lFlex: '', lExt: '', rFlex: '', rExt: '' },
      shoulder: { lFlex: '', lExt: '', rFlex: '', rExt: '' }
  });
  const [neuromuscular, setNeuromuscular] = useState({ cpDeficit: false, ataxia: false, knuckling: false, proprioception: false });

  const jumpToSection = (sectionId, ref) => {
    setActiveHighlight(sectionId);
    setExpandedModules(prev => new Set(prev).add(sectionId)); // Auto-expand on jump
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setActiveHighlight(null), 3000); // Reset highlight after 3s
  };

  // --- 🆕 UNIFIED SIDEBAR (The Table of Contents) ---
  const navItems = [
    { label: 'Clinical Story', ref: soapRef, id: 'soap', icon: <HistoryEduIcon sx={{ fontSize: 18 }} /> },
    { label: 'Aesthetic Hub', ref: groomingRef, id: 'grooming', icon: <VisibilityIcon sx={{ fontSize: 18 }} /> },
    { label: 'Action Center', ref: actionRef, id: 'action', icon: <FlashOnIcon sx={{ fontSize: 18 }} /> },
    { label: 'Logistics & RX', ref: treatmentRef, id: 'treatment', icon: <MedicalInformationIcon sx={{ fontSize: 18 }} /> },
    { label: 'Departure Control', ref: dischargeRef, id: 'discharge', icon: <ExitToAppIcon sx={{ fontSize: 18 }} /> },
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
          setSelectedSite(null);
          setExamMarkers([]);
          setSafetyLevel('Safe');
          setLabQuickStats({ pcv: '', tp: '', glucose: '' });
          setLamenessGrade(0);
          setJointROM({
             stifle: { lFlex: '', lExt: '', rFlex: '', rExt: '' },
             hip: { lFlex: '', lExt: '', rFlex: '', rExt: '' },
             elbow: { lFlex: '', lExt: '', rFlex: '', rExt: '' },
             shoulder: { lFlex: '', lExt: '', rFlex: '', rExt: '' }
          });
          setNeuromuscular({ cpDeficit: false, ataxia: false, knuckling: false, proprioception: false });

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

  const addExamMarker = (e) => {
    if (mappingTab !== 'exam') return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(svg.getScreenCTM().inverse());
    setExamMarkers([...examMarkers, { x: local.x, y: local.y, type: 'Finding', note: '' }]);
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

  // --- 3. TREATMENT PLAN LOGIC ---
  const handleAddRx = () => {
    if(!selectedRxItem) return;
    const [type, id] = selectedRxItem.split('|');
    let itemObj = null;
    
    if (type === 'product') {
      const p = inventoryList.find(i => i.id === id);
      if (p) itemObj = { 
        type: 'product', id: p.id, name: p.itemName, price: p.price, qty: 1, 
        isDrug: p.category==='Medicine' || p.category==='Vaccine', 
        isDispensed: false, // Default to Clinic Administration
        sig: { dose: '1', frequency: 'SID', duration: '1', unit: p.unit || 'unit', route: 'SQ' },
        instructions: '' 
      };
    } else {
      const s = servicesList.find(i => i.id === id);
      if (s) itemObj = { type: 'service', id: s.id, name: s.name, price: s.price, qty: 1, isDrug: false };
    }
    
    if (itemObj) { 
        setRxCart([...rxCart, itemObj]); 
        setSelectedRxItem(''); 
        setIsDirty(true); 
        
        // --- SOFT-RESERVE TRIGGER ---
        if (itemObj.type === 'product') {
            reserveStock(itemObj.id, 1);
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
        releaseStock(itemToRemove.id, itemToRemove.qty || 1);
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
        recordType: workflowType === 'AESTHETIC' ? 'grooming' : 'medical',
        diagnosis: workflowType === 'AESTHETIC' ? 'Grooming Services' : soapData.assessment || "Clinical Visit", 
        treatment: workflowType === 'AESTHETIC' ? groomingData.notes : soapData.plan, 
        soap: workflowType === 'AESTHETIC' ? null : {
            subjective: soapData.subjective,
            objective: soapData.objectiveNotes,
            assessment: soapData.assessment,
            prognosis: soapData.prognosis,
            plan: soapData.plan,
            recheckIn: soapData.recheckIn
        }, 
        vitals: workflowType === 'AESTHETIC' ? null : { 
            weight: soapData.objWeight, temp: soapData.objTemp, hr: soapData.objHR, 
            rr: soapData.objRR, crt: soapData.objCRT, bcs: soapData.bcs, pain: soapData.painScale,
            murmur: soapData.murmurGrade, murmurLocation: soapData.murmurLocation, murmurTiming: soapData.murmurTiming
        },
        isolation: isIsolationMode ? { active: true, protocol: isolationProtocol } : null,
        legal: {
            ownerSignature: ownerSignature,
            isLocked: true,
            lockedAt: Timestamp.now()
        },
        examMarkers: examMarkers,
        nursingLog: vaxLotInfo,
        groomingServices: workflowType === 'AESTHETIC' ? groomingChecklist : null,
        injectionSite: selectedSite,
        surgicalSafetyAudit: {
            ...surgicalChecklist,
            auditStatus: Object.values(surgicalChecklist).filter(v => typeof v === 'boolean').every(v => v) ? "CLEARED" : "INCOMPLETE"
        },
        fluidPlanTotal: fluidResult,
        groomingTechnicalSpecs: workflowType === 'AESTHETIC' ? { ...groomingSpecs, ...groomingData } : null,
        nicheData: {
            safetyAlert: safetyLevel,
            dentalHealthGrade: dentalGrade,
            inHouseLabs: labQuickStats,
            nutritionHub: {
                factor: nutritionFactor,
                kcalPerDay: soapData.objWeight ? Math.round(70 * Math.pow(parseFloat(soapData.objWeight), 0.75) * nutritionFactor) : 0
            },
            rehabHub: {
                lamenessGrade: lamenessGrade,
                jointROM: jointROM,
                neuromuscular: neuromuscular
            }
        },
        diagnostics: workflowType === 'AESTHETIC' ? null : "Clinical documentation via Bento Workspace", 
        dischargeInstructions: workflowType === 'AESTHETIC' ? null : `Follow-up: ${soapData.nextVisit || 'PRN'}. Instructions based on Plan.`,
        patientStatus: workflowType === 'AESTHETIC' ? 'Stable' : soapData.patientStatus, 
        nextVisit: soapData.nextVisit ? Timestamp.fromDate(new Date(soapData.nextVisit)) : null, 
      });

      setIsRecordLocked(true);

      // 2. 🧬 PERMANENT INVENTORY RECONCILIATION
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
            bgcolor: isIsolationMode ? '#7B1FA2' : COLORS.banner, 
            borderBottom: isIsolationMode ? '2px solid #FFEB3B' : `2px solid ${COLORS.bannerBorder}`, 
            display: 'flex', alignItems: 'center', flexShrink: 0, boxShadow: '0 1px 4px rgba(62,39,35,0.08)', zIndex: 10 
        }} className={isIsolationMode ? 'header-isolation' : safetyLevel === 'Bite-Risk' ? 'header-bite-risk' : safetyLevel === 'Aggressive' ? 'header-aggressive' : ''}>
            <Box sx={{ display: 'flex', alignItems: 'center', py: 0.75, px: 2, gap: 2, flex: 1 }}>
          <IconButton onClick={handleCloseRequest} size="small" sx={{ color: COLORS.textMuted, bgcolor: 'rgba(0,0,0,0.05)', '&:hover': { bgcolor: '#EFEBE9' } }}>
            <CloseIcon fontSize="small" />
          </IconButton>
          
          <Avatar sx={{ width: 44, height: 44, fontFamily: FONT, bgcolor: getInitialColor(patient?.petName), fontWeight: 700, fontSize: '1.1rem', color: '#FFF', border: `2px solid ${headerColor}` }}>
            {(patient?.petName || '?')[0].toUpperCase()}
          </Avatar>

          <Box sx={{ minWidth: 200, flexShrink: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
              <Typography sx={{ fontFamily: FONT, fontSize: '1.2rem', fontWeight: 900, color: COLORS.brand, textTransform: 'capitalize' }}>{patient?.petName}</Typography>
              <Chip label={patient?.serviceType} size="small" sx={{ bgcolor: `${headerColor}15`, color: headerColor, fontWeight: 900, fontSize: '0.65rem', height: 20, border: `1px solid ${headerColor}40` }} />
            </Box>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700, color: COLORS.textSecondary, mt: 0.25 }}>
               {petDetails?.gender === 'Female' ? 'FS' : 'MN'} • {calculateAge(petDetails?.dob)} • {patient?.petSpecies}{petDetails?.breed ? `, ${petDetails.breed}` : ''}
            </Typography>
          </Box>

          {/* ⚠️ SAFETY-FIRST TOGGLE */}
          <Box sx={{ ml: 2, display: 'flex', alignItems: 'center', gap: 1, p: 0.5, bgcolor: 'rgba(0,0,0,0.03)', borderRadius: 2 }}>
             {['Safe', 'Bite-Risk', 'Aggressive'].map(level => (
               <Chip 
                  key={level} label={level === 'Safe' ? '🟢 Safe' : level === 'Bite-Risk' ? '⚠️ RISK' : '🚫 BITE'} 
                  onClick={() => { setSafetyLevel(level); setIsDirty(true); }}
                  size="small"
                  sx={{ 
                    cursor: 'pointer', fontWeight: 900, fontSize: '0.6rem', height: 24,
                    bgcolor: safetyLevel === level ? (level === 'Safe' ? '#4CAF50' : level === 'Bite-Risk' ? '#FFA000' : '#D32F2F') : 'transparent',
                    color: (safetyLevel === level || isIsolationMode) ? 'white' : COLORS.textMuted,
                    '&:hover': { bgcolor: safetyLevel === level ? null : 'rgba(0,0,0,0.05)' }
                  }} 
               />
             ))}
             <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
             <Chip 
                label="☣️ ISOLATION" 
                onClick={() => { setIsIsolationMode(!isIsolationMode); setIsDirty(true); }}
                size="small"
                sx={{ 
                  cursor: 'pointer', fontWeight: 900, fontSize: '0.6rem', height: 24,
                  bgcolor: isIsolationMode ? '#FFEB3B' : 'transparent',
                  color: isIsolationMode ? '#7B1FA2' : (isIsolationMode ? 'white' : COLORS.textMuted),
                  border: isIsolationMode ? 'none' : '1px dashed #7B1FA2',
                  '&:hover': { bgcolor: isIsolationMode ? '#FDD835' : 'rgba(123, 31, 162, 0.05)' }
                }} 
             />
          </Box>

          {/* 🔍 OMNI-SEARCH NAV BAR */}
          <Paper sx={{ 
              display: 'flex', alignItems: 'center', px: 2, py: 0.5, mx: 4,
              borderRadius: 50, bgcolor: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)',
              flex: 1, maxWidth: 450, transition: 'all 0.3s',
              '&:focus-within': { bgcolor: '#FFF', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', borderColor: badgeColor }
          }}>
            <SearchIcon sx={{ color: COLORS.textMuted, mr: 1, fontSize: 20 }} />
            <InputBase 
              placeholder="Search or Jump: SOAP, Labs, Rx..." 
              fullWidth 
              value={searchTerm}
              onChange={(e) => {
                const term = e.target.value.toLowerCase();
                setSearchTerm(term);
                const found = navItems.find(n => n.label.toLowerCase().includes(term));
                if (found && term.length > 1) jumpToSection(found.id, found.ref);
              }}
              sx={{ fontWeight: 'bold', fontSize: '0.85rem', fontFamily: FONT }}
            />
            <Divider orientation="vertical" flexItem sx={{ mx: 1.5, my: 0.5 }} />
            <Stack direction="row" spacing={0.5}>
              {navItems.map(item => (
                <Tooltip key={item.id} title={`Jump to ${item.label}`}>
                  <IconButton 
                    size="small" 
                    onClick={() => jumpToSection(item.id, item.ref)} 
                    sx={{ 
                      color: activeHighlight === item.id ? badgeColor : COLORS.textMuted,
                      bgcolor: activeHighlight === item.id ? `${badgeColor}15` : 'transparent',
                      '&:hover': { bgcolor: `${badgeColor}10` }
                    }}
                  >
                    {item.icon}
                  </IconButton>
                </Tooltip>
              ))}
            </Stack>
          </Paper>

          {/* 🧬 THE LIVE BUNDLE PROGRESS TRACKER */}
          <Box sx={{ ml: 'auto', mr: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
             <Typography variant="caption" sx={{ fontWeight: 900, color: COLORS.textSecondary, letterSpacing: 1 }}>BUNDLE PROGRESS:</Typography>
             <Chip 
                label={`${lockedServices.size} / ${patient?.services?.length || 0} DONE`} 
                size="small" 
                sx={{ 
                    fontWeight: 900, bgcolor: lockedServices.size === (patient?.services?.length || 0) ? '#4CAF50' : COLORS.brand, 
                    color: 'white', px: 1, boxShadow: 2 
                }} 
             />
          </Box>
        </Box>

        {/* ── 🆕 PILLAR 1: THE PERSISTENT VITALS STRIP (AWARENESS ZONE) ── */}
        <Box sx={{ 
            bgcolor: 'white', borderBottom: `1px solid ${COLORS.borderLight}`, px: 2, py: 0.75, 
            display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
            position: 'sticky', top: 0, zIndex: 1100 // Explicitly Pin to Top 📌
        }}>
            {[
                { label: 'WT (kg)', value: soapData.objWeight, field: 'objWeight', icon: '⚖️', status: 'normal' },
                { label: 'TEMP (°C)', value: soapData.objTemp, field: 'objTemp', icon: '🌡️', status: getTriageLevel('temp', soapData.objTemp) },
                { label: 'HR (bpm)', value: soapData.objHR, field: 'objHR', icon: '❤️', status: getTriageLevel('hr', soapData.objHR) },
                { label: 'RR (rpm)', value: soapData.objRR, field: 'objRR', icon: '🫁', status: 'normal' },
                { label: 'CRT', value: soapData.objCRT, field: 'objCRT', icon: '⏱️', status: 'normal' },
            ].map(v => (
                <Box key={v.field} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: COLORS.textMuted, fontSize: '0.6rem' }}>{v.icon} {v.label}</Typography>
                    <InputBase 
                        size="small" value={v.value} 
                        onChange={(e) => updateSoap(v.field, e.target.value)}
                        className={v.status === 'critical' ? 'glow-critical' : v.status === 'warning' ? 'glow-warning' : ''}
                        sx={{ 
                            width: 60, fontWeight: 900, color: v.status === 'critical' ? '#D32F2F' : COLORS.brand, 
                            borderBottom: '1px dashed rgba(0,0,0,0.2)', fontSize: '0.85rem', px: 0.5 
                        }} 
                    />
                    {renderHistoricalLabel(v.field)}
                </Box>
            ))}
            
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: COLORS.textMuted, fontSize: '0.6rem' }}>🩺 TRIAGE STATUS</Typography>
                    <Select 
                        variant="standard" size="small" value={soapData.patientStatus} 
                        onChange={(e) => updateSoap('patientStatus', e.target.value)}
                        sx={{ fontWeight: 900, fontSize: '0.8rem', color: soapData.patientStatus === 'Critical' ? '#D32F2F' : soapData.patientStatus === 'Guarded' ? '#F57C00' : '#2E7D32' }}
                        disableUnderline
                    >
                        <MenuItem value="Stable">Stable</MenuItem>
                        <MenuItem value="Guarded">Guarded</MenuItem>
                        <MenuItem value="Critical">Critical</MenuItem>
                    </Select>
                </Box>
            </Box>

            {/* 🧬 GLOBAL VISIT PORTFOLIO HUD (LIFTED) */}
            <Box sx={{ px: 2, py: 1, bgcolor: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto' }}>
                <Typography variant="overline" sx={{ fontWeight: 900, color: COLORS.textMuted, flexShrink: 0, letterSpacing: 1.5, fontSize: '0.6rem' }}>VISIT PORTFOLIO:</Typography>
                {(patient.services || []).map((s, idx) => (
                    <Chip 
                        key={idx} label={`${s.name} | ${s.staffName || 'Unassigned'}`} 
                        color={s.status === 'completed' || lockedServices.has(s.id) ? 'success' : 'primary'} 
                        size="small" variant={s.status === 'completed' || lockedServices.has(s.id) ? 'filled' : 'outlined'}
                        icon={s.status === 'completed' || lockedServices.has(s.id) ? <CheckCircleIcon /> : <BoltIcon />}
                        sx={{ fontWeight: 800, fontSize: '0.65rem' }}
                    />
                ))}
            </Box>
        </Box>

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', pointerEvents: isRecordLocked ? 'none' : 'auto', opacity: isRecordLocked ? 0.9 : 1 }} className="hud-canvas">
        
        {/* ── 🏺 PANE 1: NARRATIVE (CLINICAL STORY) ── */}
        <Box sx={{ 
            flex: 6, overflowY: 'auto', p: 2, borderRight: `2px solid ${COLORS.borderLight}`,
            backgroundColor: 'rgba(0,0,0,0.01)',
            '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.timelineRail, borderRadius: 10 } 
        }}>
            <Grid container spacing={3}>
            
            {/* ── PILLAR 1: THE CLINICAL STORY (S.A.O) ── */}
            <Grid size={{ xs: 12, lg: 12 }}>
                <Paper 
                    ref={soapRef}
                    className={`${activeHighlight === 'soap' ? 'highlight-module' : ''} elevate-module ${focusedModule && focusedModule !== 'soap' ? 'dim-overlay' : ''} ${lockedServices.has('medical') ? 'module-locked' : ''}`}
                    sx={{ ...glassStyle, p: 3, borderLeft: `8px solid ${badgeColor}`, transition: 'all 0.4s ease', flex: 1, opacity: lockedServices.has('medical') ? 0.8 : 1, pointerEvents: lockedServices.has('medical') ? 'none' : 'auto' }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mb: 3 }}>
                        <Typography variant="h5" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.brand, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <MedicalServicesIcon /> Clinical Documentation (S.O.A.P.)
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ bgcolor: 'rgba(0,0,0,0.03)', p: 0.5, borderRadius: 2 }}>
                            <Button size="small" variant="text" onClick={() => applyTemplate('vaccine')} sx={{ fontWeight: 800, textTransform: 'none', borderRadius: 1.5, px: 2, color: COLORS.brand }}>Vaccine Template</Button>
                            <Button size="small" variant="text" onClick={() => applyTemplate('wnl')} sx={{ fontWeight: 800, textTransform: 'none', borderRadius: 1.5, px: 2, color: COLORS.brand }}>Auto-Fill WNL</Button>
                            <Tooltip title="Unified Clinical Command Center (God-View)">
                                <IconButton size="small" onClick={() => setIsUnifiedZen(true)} sx={{ color: COLORS.brand, bgcolor: 'rgba(0,0,0,0.05)', ml: 1 }}>
                                    <FitScreenIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Stack>
                    </Box>

                    {lockedServices.has('medical') && (
                        <Alert severity="success" icon={<ShieldIcon/>} sx={{ mb: 2, fontWeight: 900, borderRadius: 2 }}>This clinical record is SIGNED and LOCKED. No further edits are possible.</Alert>
                    )}

                    <Grid container spacing={3}>
                        <Grid size={{ xs: 12 }}>
                             <Box sx={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                 <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, m: 0 }}>S - SUBJECTIVE (History & Client Report)</Typography>
                                 <Tooltip title="Zen Mode: Focus on Subjective">
                                     <IconButton size="small" onClick={() => setFullscreenField('subjective')} sx={{ color: COLORS.textMuted, '&:hover': { color: COLORS.brand } }}>
                                         <OpenInFullIcon fontSize="small" />
                                     </IconButton>
                                 </Tooltip>
                             </Box>
                             <TextField 
                               multiline minRows={4} maxRows={25} fullWidth 
                               value={soapData.subjective} 
                               onChange={(e) => updateSoap('subjective', e.target.value)} 
                               onFocus={() => setFocusedModule('soap')}
                               onBlur={() => setFocusedModule(null)}
                               placeholder="Enter history, symptoms, and client concerns..." 
                               sx={{ bgcolor: 'white', borderRadius: 2, transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }} 
                             />
                        </Grid>

                        {/* ── A: ASSESSMENT ── */}
                        <Grid size={{ xs: 12 }}>
                             <Box sx={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, m: 0 }}>A - ASSESSMENT (The Diagnosis/Conclusion)</Typography>
                                <Tooltip title="Zen Mode: Focus on Assessment">
                                     <IconButton size="small" onClick={() => setFullscreenField('assessment')} sx={{ color: COLORS.textMuted, '&:hover': { color: COLORS.brand } }}>
                                         <OpenInFullIcon fontSize="small" />
                                     </IconButton>
                                 </Tooltip>
                             </Box>
                            <TextField 
                               multiline minRows={4} maxRows={25} fullWidth 
                               value={soapData.assessment} onChange={(e) => updateSoap('assessment', e.target.value)} 
                               placeholder="What is your diagnosis or findings?" 
                               sx={{ 
                                 bgcolor: 'rgba(76, 175, 80, 0.05)', borderRadius: 2,
                                 transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                  '& .MuiOutlinedInput-root': { fontWeight: 900, color: '#2E7D32' } 
                                 }} 
                             />
                        </Grid>

                        {/* 🏺 THE CLINICAL PREDICTION HORIZON (UNIFIED BASELINE) */}
                        <Grid size={{ xs: 12 }}>
                            <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    {/* RECHECK HUD */}
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Typography variant="caption" sx={{ fontWeight: 900, color: '#2E7D32', fontSize: '0.65rem' }}>🗓️ RECHECK WINDOW:</Typography>
                                        <Stack direction="row" spacing={0.5}>
                                            {['Next Week', '2 Weeks', '1 Month', 'PRN', 'Finalized'].map(w => (
                                                <Chip 
                                                    key={w} label={w} size="small"
                                                    onClick={() => updateSoap('recheckIn', w)}
                                                    sx={{ 
                                                        fontSize: '0.6rem', height: 20, fontWeight: 800, cursor: 'pointer',
                                                        bgcolor: soapData.recheckIn === w ? '#2E7D32' : 'white',
                                                        color: soapData.recheckIn === w ? 'white' : 'inherit',
                                                        border: `1px solid ${soapData.recheckIn === w ? 'transparent' : 'rgba(0,0,0,0.1)'}`
                                                    }} 
                                                />
                                            ))}
                                        </Stack>
                                    </Box>
                                    <Button 
                                        size="small" variant="outlined" startIcon={<PrintIcon />}
                                        sx={{ fontWeight: 900, fontSize: '0.6rem', color: COLORS.brand, borderColor: 'rgba(0,0,0,0.1)', borderRadius: 2 }}
                                    >
                                        PRINT CLIENT INSTRUCTIONS
                                    </Button>
                                </Box>

                                <Divider sx={{ opacity: 0.1 }} />

                                {/* PROGNOSIS HUD */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 900, color: COLORS.textMuted, fontSize: '0.65rem' }}>🎯 PROGNOSIS:</Typography>
                                    <Stack direction="row" spacing={0.5}>
                                        {['Excellent', 'Good', 'Guarded', 'Poor', 'Grave'].map(p => (
                                            <Chip 
                                                key={p} label={p} size="small"
                                                onClick={() => updateSoap('prognosis', p)}
                                                sx={{ 
                                                    fontSize: '0.6rem', height: 20, fontWeight: 800, cursor: 'pointer',
                                                    bgcolor: soapData.prognosis === p ? (p === 'Grave' || p === 'Poor' ? '#D32F2F' : COLORS.brand) : 'white',
                                                    color: soapData.prognosis === p ? 'white' : 'inherit',
                                                    border: `1px solid ${soapData.prognosis === p ? 'transparent' : 'rgba(0,0,0,0.1)'}`
                                                }} 
                                            />
                                        ))}
                                    </Stack>
                                </Box>
                            </Box>
                        </Grid>

                        {/* ── O: OBJECTIVE ── */}
                        <Grid size={{ xs: 12 }}>
                           <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                               <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, m: 0 }}>O - OBJECTIVE (Examination & Vitals)</Typography>
                               <Tooltip title="Zen Mode: Focus on Objective">
                                     <IconButton size="small" onClick={() => setFullscreenField('objectiveNotes')} sx={{ color: COLORS.textMuted, '&:hover': { color: COLORS.brand } }}>
                                         <OpenInFullIcon fontSize="small" />
                                     </IconButton>
                                 </Tooltip>
                           </Box>
                           
                           {/* DENSE EXAMINATION CLUSTER */}
                           <Box sx={{ bgcolor: '#FAF8F5', p: 2, borderRadius: 2, border: `1px solid ${COLORS.borderLight}`, mb: 2 }}>
                               <Grid container spacing={2}>
                                   {/* 🧬 OBJECTIVE VITALS HUD (ORGANIZED) */}
                                   <Grid size={{ xs: 12 }} sx={{ mb: 1 }}>
                                       <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.4)', borderRadius: 2, border: '1px dashed rgba(0,0,0,0.05)' }}>
                                           <Grid container spacing={3}>
                                               {[
                                                   { label: 'WT (kg)', value: soapData.objWeight, field: 'objWeight', icon: '⚖️', status: 'normal' },
                                                   { label: 'TEMP (°C)', value: soapData.objTemp, field: 'objTemp', icon: '🌡️', status: getTriageLevel('temp', soapData.objTemp) },
                                                   { label: 'HR (bpm)', value: soapData.objHR, field: 'objHR', icon: '❤️', status: getTriageLevel('hr', soapData.objHR) },
                                                   { label: 'RR (rpm)', value: soapData.objRR, field: 'objRR', icon: '🫁', status: 'normal' },
                                                   { label: 'CRT', value: soapData.objCRT, field: 'objCRT', icon: '⏱️', status: 'normal' },
                                               ].map(v => (
                                                   <Grid key={v.field} size={{ xs: 12, md: 4, lg: 2.4 }}>
                                                       <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                           <Typography variant="caption" sx={{ fontWeight: 800, color: COLORS.textMuted, fontSize: '0.65rem' }}>{v.icon} {v.label}</Typography>
                                                           <InputBase 
                                                               size="small" value={v.value} 
                                                               onChange={(e) => updateSoap(v.field, e.target.value)}
                                                               className={v.status === 'critical' ? 'glow-critical' : v.status === 'warning' ? 'glow-warning' : ''}
                                                               sx={{ 
                                                                   flex: 1, fontWeight: 900, color: v.status === 'critical' ? '#D32F2F' : COLORS.brand, 
                                                                   borderBottom: '1px dashed rgba(0,0,0,0.2)', fontSize: '0.9rem', px: 0.5, bgcolor: 'white', borderRadius: '4px 4px 0 0'
                                                               }} 
                                                           />
                                                           {renderHistoricalLabel(v.field)}
                                                       </Box>
                                                   </Grid>
                                               ))}
                                           </Grid>
                                       </Box>
                                   </Grid>

                                    <Grid size={{ xs: 12 }}>
                                        <Typography variant="caption" sx={{ fontWeight: 800, color: COLORS.textSecondary, mb: 1, display: 'block' }}>BODY SCALES (Pain & Condition)</Typography>
                                        <Grid container spacing={4}>
                                             <Grid size={{ xs: 12, md: 6 }}>
                                                 <Typography variant="caption" sx={{ fontWeight: 900, fontSize: '0.6rem', display: 'flex', justifyContent: 'space-between' }}>
                                                     <span>BCS (1-9)</span>
                                                     <span>SCORE: {soapData.bcs || 5}</span>
                                                 </Typography>
                                                 <Box sx={{ flex: 1, px: 0.5, mt: 1 }}><input type="range" min="1" max="9" step="1" value={soapData.bcs || 5} onChange={(e) => updateSoap('bcs', e.target.value)} style={{ width: '100%', accentColor: COLORS.brand }} /></Box>
                                             </Grid>
                                             <Grid size={{ xs: 12, md: 6 }}>
                                                 <Typography variant="caption" sx={{ fontWeight: 900, fontSize: '0.6rem', display: 'flex', justifyContent: 'space-between' }}>
                                                     <span>PAIN SCALE (0-10)</span>
                                                     <span>SCORE: {soapData.painScale || 0}</span>
                                                 </Typography>
                                                 <Box sx={{ flex: 1, px: 0.5, mt: 1 }}><input type="range" min="0" max="10" step="1" value={soapData.painScale || 0} onChange={(e) => updateSoap('painScale', e.target.value)} style={{ width: '100%', accentColor: (soapData.painScale || 0) > 4 ? '#D32F2F' : COLORS.brand }} /></Box>
                                             </Grid>
                                        </Grid>
                                    </Grid>
                               </Grid>
                           </Box>

                           <TextField 
                               multiline minRows={4} maxRows={25} fullWidth 
                               value={soapData.objectiveNotes} 
                               onChange={(e) => updateSoap('objectiveNotes', e.target.value)} 
                               placeholder="Describe physical findings (Lungs, Heart, Eyes, Ears, Skin)..." 
                               sx={{ bgcolor: 'white', borderRadius: 2, transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }} 
                           />
                        </Grid>

                        {/* ── P: PLAN ── */}
                        <Grid size={{ xs: 12 }}>
                           <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                               <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, m: 0 }}>P - PLAN (Treatment Instructions)</Typography>
                               <Tooltip title="Zen Mode: Focus on Plan">
                                     <IconButton size="small" onClick={() => setFullscreenField('plan')} sx={{ color: COLORS.textMuted, '&:hover': { color: COLORS.brand } }}>
                                         <OpenInFullIcon fontSize="small" />
                                     </IconButton>
                                 </Tooltip>
                           </Box>
                           <TextField 
                             multiline minRows={4} maxRows={25} fullWidth 
                             value={soapData.plan} 
                             onChange={(e) => updateSoap('plan', e.target.value)} 
                             onFocus={() => setFocusedModule('soap')}
                             onBlur={() => setFocusedModule(null)}
                             placeholder="Procedures performed, internal notes, and doctor instructions..." 
                             sx={{ bgcolor: 'white', borderRadius: 2, transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }} 
                           />
                        </Grid>
                    </Grid>

                    {/* MEDICAL SECTION SIGN-OFF */}
                    {!lockedServices.has('medical') && (
                        <Box sx={{ mt: 4, pt: 3, borderTop: '1px dashed rgba(0,0,0,0.1)', textAlign: 'center' }}>
                            <Button 
                                variant="contained" color="success" size="large" 
                                startIcon={<CheckCircleIcon />} sx={{ fontWeight: 900, px: 6, borderRadius: 50 }}
                                onClick={() => handleCompleteService('medical')}
                            >
                                Sign & Finalize Medical Record
                            </Button>
                        </Box>
                    )}
                </Paper>
                </Grid>
                
            {/* ── PILLAR 3: THE ACTION CENTER (PROCEDURALS) ── */}
            <Grid size={{ xs: 12, lg: 12 }}>
                <Paper 
                    ref={groomingRef}
                    className={`${activeHighlight === 'grooming' ? 'highlight-module' : ''} elevate-module ${focusedModule && focusedModule !== 'grooming' ? 'dim-overlay' : ''} ${lockedServices.has('aesthetic') ? 'module-locked' : ''}`}
                    sx={{ ...glassStyle, p: 3, borderLeft: '8px solid #795548', transition: 'all 0.4s ease', flex: 1, display: 'flex', flexDirection: 'column', opacity: lockedServices.has('aesthetic') ? 0.8 : 1, pointerEvents: lockedServices.has('aesthetic') ? 'none' : 'auto' }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <ContentCutIcon sx={{ color: '#795548' }} />
                            <Typography variant="h6" fontWeight={900} color="#3E2723">Aesthetic & Hygiene Notes</Typography>
                        </Box>

                    {/* DYNAMIC SAFETY ALERTS */}
                    <Stack direction="row" spacing={1}>
                        {groomingData.parasites !== 'None' && (
                            <Chip 
                                icon={<ReportProblemIcon sx={{ color: 'white !important' }}/>} 
                                label="☣️ BIO-HAZARD DETECTED" 
                                color="error" 
                                sx={{ fontWeight: 900, animation: 'pulse 1.5s infinite', boxShadow: '0 0 10px rgba(211,47,47,0.4)' }} 
                            />
                        )}
                    </Stack>
                </Box>
                
                {lockedServices.has('aesthetic') && (
                    <Alert severity="success" icon={<ShieldIcon/>} sx={{ mb: 2, fontWeight: 900, borderRadius: 2 }}>This Aesthetic record is COMPLETED and LOCKED.</Alert>
                )}

                <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid size={{ xs: 2.4 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel>Blade #</InputLabel><Select value={groomingSpecs.bladeNumber} label="Blade #" onChange={(e) => updateGroomingSpec('bladeNumber', e.target.value)}><MenuItem value="10">#10 (Std)</MenuItem><MenuItem value="40">#40 (Surgical)</MenuItem><MenuItem value="30">#30 (Sanitary)</MenuItem><MenuItem value="7">#7 (Short)</MenuItem><MenuItem value="4">#4 (Longer)</MenuItem><MenuItem value="5">#5 (Bulk)</MenuItem><MenuItem value="FC">FC (Finish)</MenuItem></Select></FormControl></Grid>
                    <Grid size={{ xs: 2.4 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel>Texture</InputLabel><Select value={groomingSpecs.coatTexture} label="Texture" onChange={(e) => updateGroomingSpec('coatTexture', e.target.value)}><MenuItem value="Normal">Normal</MenuItem><MenuItem value="Matted">Matted</MenuItem><MenuItem value="Greasy">Greasy/Seborrheic</MenuItem><MenuItem value="Dry">Dry/Brittle</MenuItem><MenuItem value="Sparse">Sparse/Alopecic</MenuItem><MenuItem value="Silky">Silky</MenuItem><MenuItem value="Wiry">Wiry</MenuItem></Select></FormControl></Grid>
                    <Grid size={{ xs: 2.4 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel>Shampoo</InputLabel><Select value={groomingData.shampoo} label="Shampoo" onChange={(e) => updateGrooming('shampoo', e.target.value)}><MenuItem value="Oatmeal">Oatmeal</MenuItem><MenuItem value="Chlorhexidine">Chlorhexidine</MenuItem><MenuItem value="Antifungal">Antifungal</MenuItem><MenuItem value="Degreasing">Degreasing</MenuItem><MenuItem value="Hypo">Hypoallergenic</MenuItem><MenuItem value="Whitening">Whitening</MenuItem></Select></FormControl></Grid>
                    <Grid size={{ xs: 2.4 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel>Parasites</InputLabel><Select value={groomingData.parasites} label="Parasites" onChange={(e) => updateGrooming('parasites', e.target.value)}><MenuItem value="None">None</MenuItem><MenuItem value="Fleas">Fleas (Live)</MenuItem><MenuItem value="Flea Dirt">Flea Dirt (Evidence)</MenuItem><MenuItem value="Ticks">Ticks</MenuItem><MenuItem value="Lice">Lice</MenuItem><MenuItem value="Mites">Mites</MenuItem></Select></FormControl></Grid>
                    <Grid size={{ xs: 2.4 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel>Temperament</InputLabel><Select value={groomingData.temperament} label="Temperament" onChange={(e) => updateGrooming('temperament', e.target.value)} onFocus={() => setFocusedModule('grooming')} onBlur={() => setFocusedModule(null)}><MenuItem value="Calm">Calm</MenuItem><MenuItem value="Anxious">Anxious</MenuItem><MenuItem value="Aggressive">Aggressive</MenuItem><MenuItem value="Muzzle Required">🚨 Muzzle Required</MenuItem></Select></FormControl></Grid>
                </Grid>

                <Stack direction="row" spacing={1} sx={{ mb: 2, p: 1.5, bgcolor: 'rgba(0,0,0,0.03)', borderRadius: 2 }}>
                    {[
                        { id: 'nails', label: 'Nails', icon: <ContentCutIcon fontSize="inherit"/> },
                        { id: 'ears', label: 'Ears', icon: <InfoIcon fontSize="inherit"/> },
                        { id: 'glands', label: 'Glands', icon: <LocalHospitalIcon fontSize="inherit"/> },
                        { id: 'teeth', label: 'Teeth', icon: <ContentPasteIcon fontSize="inherit"/> }
                    ].map(svc => {
                        const status = groomingChecklist[svc.id] || '';
                        const statusConfig = {
                            '': { color: '#BBB', label: svc.label, icon: svc.icon, bgcolor: 'white' },
                            'done': { color: '#2E7D32', label: `${svc.label} Done`, icon: <CheckCircleIcon fontSize="inherit"/>, bgcolor: '#E8F5E9' },
                            'alert': { color: '#D32F2F', label: `${svc.label} Alert!`, icon: <ReportIcon fontSize="inherit"/>, bgcolor: '#FFEBEE' },
                            'refused': { color: '#757575', label: `${svc.label} Refused`, icon: <BlockIcon fontSize="inherit"/>, bgcolor: '#F5F5F5' }
                        }[status];

                        return (
                            <Chip 
                                key={svc.id} 
                                icon={statusConfig.icon}
                                label={statusConfig.label} 
                                size="small"
                                onClick={() => {
                                    const nextStatus = status === '' ? 'done' : status === 'done' ? 'alert' : status === 'alert' ? 'refused' : '';
                                    setGroomingChecklist(p => ({ ...p, [svc.id]: nextStatus }));
                                    setIsDirty(true);
                                }}
                                sx={{ 
                                    flex: 1, fontWeight: 900, fontSize: '0.65rem', 
                                    bgcolor: statusConfig.bgcolor, 
                                    color: statusConfig.color,
                                    border: `1px solid ${statusConfig.color}40`,
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    '&:hover': { transform: 'scale(1.02)' }
                                }}
                            />
                        );
                    })}
                </Stack>
                <TextField 
                  multiline rows={5} fullWidth 
                  value={groomingData.notes} 
                  onChange={(e) => updateGrooming('notes', e.target.value)} 
                  onFocus={() => setFocusedModule('grooming')}
                  onBlur={() => setFocusedModule(null)}
                  placeholder="Skin condition, styling requests..." 
                  sx={{ bgcolor: 'white', borderRadius: 2, mb: 3 }} 
                />

                {/* AESTHETIC SECTION SIGN-OFF */}
                {!lockedServices.has('aesthetic') && (
                    <Box sx={{ mt: 'auto', pt: 3, borderTop: '1px dashed rgba(0,0,0,0.1)', textAlign: 'center' }}>
                        <Button 
                            variant="outlined" color="primary" size="small" 
                            startIcon={<CheckCircleIcon />} 
                            sx={{ 
                                fontWeight: 900, px: 3, borderRadius: 2, 
                                border: '1px solid rgba(0,0,0,0.1)', borderLeft: '4px solid #1976D2',
                                bgcolor: 'rgba(0,0,0,0.02)', color: '#1976D2',
                                '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.05)' }
                            }}
                            onClick={() => handleCompleteService('aesthetic')}
                        >
                            FINALIZE AESTHETIC SPECS
                        </Button>
                    </Box>
                )}
            </Paper>
            </Grid>

            </Grid> {/* End Pane 1 Grid */}
        </Box>

        {/* ── 🏺 PANE 2: PROCEDURAL & LOGISTICS (ACTION CENTER) ── */}
        <Box sx={{ 
            flex: 4, overflowY: 'auto', p: 2, borderRight: `1px solid ${COLORS.borderLight}`,
            backgroundColor: '#ffffff',
            '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.timelineRail, borderRadius: 10 } 
        }}>
            <Grid container spacing={3}>
                <Grid size={{ xs: 12, lg: 12 }} sx={{ display: 'flex' }}>
                <Paper 
                    ref={actionRef}
                    className={`elevate-module ${focusedModule && focusedModule !== 'site' ? 'dim-overlay' : ''}`}
                    sx={{ ...glassStyle, p: 3, borderLeft: '8px solid #9C27B0', flex: 1, display: 'flex', flexDirection: 'column' }}
                >
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: expandedModules.has('action') ? 1 : 0 }}>
                        <Typography variant="h6" fontWeight={900} color="#3E2723" sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => toggleModule('action')}>
                            <RoomIcon sx={{ color: '#9C27B0' }} /> Diagnostic HUD
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                            {expandedModules.has('action') && (
                                <Stack direction="row" spacing={1} sx={{ bgcolor: 'rgba(0,0,0,0.05)', p: 0.5, borderRadius: 2 }}>
                                    <Button size="small" onClick={() => setMappingTab('vax')} sx={{ fontSize: '0.6rem', fontWeight: 900, bgcolor: mappingTab === 'vax' ? 'white' : 'transparent', color: '#9C27B0', borderRadius: 1.5 }}>VAX</Button>
                                    <Button size="small" onClick={() => setMappingTab('exam')} sx={{ fontSize: '0.6rem', fontWeight: 900, bgcolor: mappingTab === 'exam' ? 'white' : 'transparent', color: '#9C27B0', borderRadius: 1.5 }}>EXAM</Button>
                                </Stack>
                            )}
                            <IconButton size="small" onClick={() => toggleModule('action')} sx={{ p: 1.5, color: '#9C27B0' }}>
                                <KeyboardArrowUpIcon sx={{ transform: expandedModules.has('action') ? 'rotate(0deg)' : 'rotate(180deg)', transition: '0.3s' }} />
                            </IconButton>
                        </Stack>
                    </Stack>

                    <Collapse in={expandedModules.has('action')}>
                        <Box sx={{ flex: 1, display: 'flex', position: 'relative', justifyContent: 'center', py: 2 }}>
                            <svg width="220" height="120" viewBox="0 0 200 120" onClick={addExamMarker}>
                                {/* PET SILHOUETTE (ADAPTIVE) */}
                                {patient?.petSpecies === 'Feline' ? (
                                    <path d="M50,80 Q40,60 60,40 Q90,30 130,40 Q160,50 160,80 Q150,100 130,90 Q90,100 50,80" fill="#EEEEEE" stroke="#BDBDBD" strokeWidth="1" />
                                ) : (
                                    <path d="M40,60 Q50,30 150,40 Q180,50 180,80 Q180,110 160,110 Q140,110 130,80 Q40,90 20,80 Q10,70 40,60" fill="#EEEEEE" stroke="#BDBDBD" strokeWidth="1" />
                                )}
                                
                                {mappingTab === 'vax' && [
                                    { id: 'RR', cx: 160, cy: 90 }, { id: 'LR', cx: 140, cy: 100 },
                                    { id: 'RF', cx: 60, cy: 90 }, { id: 'LF', cx: 40, cy: 95 }, { id: 'SC', cx: 80, cy: 50 }
                                ].map(site => (
                                    <g key={site.id} cursor="pointer" onClick={() => setSelectedSite(site.id)}>
                                        <circle cx={site.cx} cy={site.cy} r="10" fill={selectedSite === site.id ? '#9C27B0' : 'white'} stroke="#9C27B0" strokeWidth="2" />
                                        <text x={site.cx} y={site.cy + 3} textAnchor="middle" fontSize="6" fontWeight="bold" fill={selectedSite === site.id ? 'white' : '#9C27B0'}>{site.id}</text>
                                    </g>
                                ))}

                                {mappingTab === 'exam' && examMarkers.map((m, idx) => (
                                    <g key={idx}>
                                        <circle cx={m.x} cy={m.y} r="6" fill="#D32F2F" stroke="white" strokeWidth="2" className="glow-critical" />
                                    </g>
                                ))}
                            </svg>
                        </Box>
                        
                        <Box sx={{ maxWidth: 500, mx: 'auto', width: '100%', bgcolor: 'rgba(0,0,0,0.03)', p: 1.5, borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
                            <Grid container spacing={1.5} alignItems="center">
                                {mappingTab === 'vax' ? (
                                    <>
                                        <Grid size={{ xs: 6 }}>
                                            <TextField 
                                                label="LOT #" size="small" fullWidth value={vaxLotInfo.lot} 
                                                onChange={(e) => setVaxLotInfo(p => ({ ...p, lot: e.target.value }))}
                                                slotProps={{ input: { sx: { fontWeight: 900, fontSize: '0.75rem', letterSpacing: '0.02em', background: 'white' } }, inputLabel: { sx: { fontWeight: 900, fontSize: '0.65rem' } } }}
                                            />
                                            {renderHistoricalLabel('vaxLot')}
                                        </Grid>
                                        <Grid size={{ xs: 4 }}>
                                            <TextField 
                                                label="ROUTE" size="small" fullWidth value={vaxLotInfo.route} 
                                                onChange={(e) => setVaxLotInfo(p => ({ ...p, route: e.target.value }))}
                                                slotProps={{ input: { sx: { fontWeight: 900, fontSize: '0.75rem', letterSpacing: '0.02em', background: 'white' } }, inputLabel: { sx: { fontWeight: 900, fontSize: '0.65rem' } } }}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 2 }}>
                                            <Box sx={{ width: '100%', height: 40, bgcolor: selectedSite ? '#9C27B0' : '#E0E0E0', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900, fontSize: '0.8rem', transition: '0.3s' }}>
                                                {selectedSite || '?'}
                                            </Box>
                                        </Grid>
                                    </>
                                ) : (
                                    <Grid size={{ xs: 12 }}>
                                        <Typography variant="overline" sx={{ fontWeight: 900, color: '#D32F2F', textAlign: 'center', display: 'block', letterSpacing: 2 }}>
                                            {examMarkers.length} CLINICAL OBSERVATIONS MARKED
                                        </Typography>
                                    </Grid>
                                )}
                            </Grid>
                        </Box>
                    </Collapse>
                </Paper>
                </Grid>

            {/* MODULE 9: SURGICAL SAFETY & PROTOCOLS */}
            <Grid size={{ xs: 12 }} sx={{ display: 'flex' }}>
                    <Paper 
                        ref={surgeryRef}
                        className={`elevate-module ${focusedModule && focusedModule !== 'surgery' ? 'dim-overlay' : ''}`}
                        sx={{ ...glassStyle, p: 3, borderLeft: '8px solid #D32F2F', flex: 1, display: 'flex', flexDirection: 'column' }}
                    >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: expandedModules.has('surgery') ? 2 : 0 }}>
                            <Typography variant="h6" fontWeight={900} color="#3E2723" sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => toggleModule('surgery')}>
                                <WarningIcon sx={{ color: '#D32F2F' }} /> Surgical Safety Audit
                            </Typography>
                            <IconButton size="small" onClick={() => toggleModule('surgery')} sx={{ p: 1.5, color: '#D32F2F' }}>
                                <KeyboardArrowUpIcon sx={{ transform: expandedModules.has('surgery') ? 'rotate(0deg)' : 'rotate(180deg)', transition: '0.3s' }} />
                            </IconButton>
                        </Stack>

                        <Collapse in={expandedModules.has('surgery')}>
                            <Box sx={{ maxWidth: 800, mx: 'auto', width: '100%' }}>
                                <Box sx={{ bgcolor: 'rgba(211, 47, 47, 0.05)', p: 1.5, borderRadius: 2, border: '1px solid rgba(211, 47, 47, 0.1)' }}>
                                    <Grid container spacing={1}>
                                        {[
                                            { id: 'preOpExam', label: 'PRE-OP EXAM DONE' },
                                            { id: 'equipmentOk', label: 'ANESTHESIA CALIBRATED' },
                                            { id: 'spongeCount', label: 'SPONGE COUNT INITIALIZED' },
                                            { id: 'postOpVitals', label: 'RECOVERY MONITOR ASSIGNED' }
                                        ].map(task => (
                                            <Grid key={task.id} size={{ xs: 12, md: 6 }}>
                                                <Box 
                                                    sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', p: 0.75, bgcolor: surgicalChecklist[task.id] ? 'white' : 'transparent', borderRadius: 1.5, border: '1px solid transparent', '&:hover': { bgcolor: 'white' } }} 
                                                    onClick={() => updateSurgical(task.id)}
                                                >
                                                    <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #D32F2F', bgcolor: surgicalChecklist[task.id] ? '#D32F2F' : 'transparent', flexShrink: 0, transition: '0.2s' }} />
                                                    <Typography variant="caption" sx={{ fontWeight: 900, fontSize: '0.65rem', color: surgicalChecklist[task.id] ? '#D32F2F' : '#757575', letterSpacing: '0.01em' }}>{task.label}</Typography>
                                                </Box>
                                            </Grid>
                                        ))}
                                    </Grid>
                                </Box>

                                <Grid container spacing={1.5} sx={{ mt: 1.5 }}>
                                    <Grid size={{ xs: 4 }}><TextField label="INDUCTION" size="small" type="time" fullWidth value={surgicalChecklist.inductionTime} onChange={(e) => setSurgicalChecklist(p => ({...p, inductionTime: e.target.value}))} slotProps={{ inputLabel: { shrink: true }, input: { sx: { fontWeight: 900, fontSize: '0.75rem', background: 'white' } } }} /></Grid>
                                    <Grid size={{ xs: 4 }}><TextField label="RECOVERY" size="small" type="time" fullWidth value={surgicalChecklist.recoveryTime} onChange={(e) => setSurgicalChecklist(p => ({...p, recoveryTime: e.target.value}))} slotProps={{ inputLabel: { shrink: true }, input: { sx: { fontWeight: 900, fontSize: '0.75rem', background: 'white' } } }} /></Grid>
                                    <Grid size={{ xs: 4 }}><TextField label="EBL (ML)" size="small" type="number" fullWidth value={surgicalChecklist.ebl} onChange={(e) => setSurgicalChecklist(p => ({...p, ebl: e.target.value}))} slotProps={{ input: { sx: { fontWeight: 900, fontSize: '0.75rem', background: 'white' } } }} /></Grid>
                                </Grid>

                                <Box sx={{ mt: 2, textAlign: 'center' }}>
                                    <Typography variant="caption" sx={{ color: '#D32F2F', fontWeight: 900, letterSpacing: 2, fontSize: '0.65rem' }}>
                                        {Object.values(surgicalChecklist).filter(v => typeof v === 'boolean').every(v => v) ? "✅ AUDIT CLEARED" : "⚠️ PROTOCOLS PENDING"}
                                    </Typography>
                                </Box>
                            </Box>
                        </Collapse>
                    </Paper>
                </Grid>

            {/* MODULE 10: REHAB & MOBILITY HUB */}
            <Grid size={{ xs: 12 }} sx={{ display: 'flex' }}>
                    <Paper 
                        ref={rehabRef}
                        className={`elevate-module ${focusedModule && focusedModule !== 'rehab' ? 'dim-overlay' : ''}`}
                        sx={{ ...glassStyle, p: 3, borderLeft: '8px solid #455A64', flex: 1 }}
                    >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: expandedModules.has('rehab') ? 2 : 0 }}>
                            <Typography variant="h6" fontWeight={900} color="#3E2723" sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => toggleModule('rehab')}>
                                <BoltIcon sx={{ color: '#455A64' }} /> Rehab & Mobility Hub
                            </Typography>
                            <IconButton size="small" onClick={() => toggleModule('rehab')} sx={{ p: 1.5, color: '#455A64' }}>
                                <KeyboardArrowUpIcon sx={{ transform: expandedModules.has('rehab') ? 'rotate(0deg)' : 'rotate(180deg)', transition: '0.3s', fontSize: 24 }} />
                            </IconButton>
                        </Stack>

                        <Collapse in={expandedModules.has('rehab')}>
                            <Grid container spacing={3}>
                                <Grid size={{ xs: 12, md: 4 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 900, color: '#455A64', mb: 1.5, display: 'block', letterSpacing: 1 }}>LAMENESS CLASSIFICATION</Typography>
                                    <Box sx={{ px: 1, bgcolor: 'rgba(0,0,0,0.02)', p: 2, borderRadius: 3, border: '1px solid rgba(0,0,0,0.05)' }}>
                                        <input 
                                            type="range" min="0" max="5" step="1" 
                                            value={lamenessGrade} onChange={(e) => { setLamenessGrade(parseInt(e.target.value)); setIsDirty(true); }}
                                            style={{ width: '100%', accentColor: '#455A64' }} 
                                        />
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                                            {['NORM', 'MILD', 'MOD', 'SEV', 'NWB'].map((label, i) => (
                                                <Typography key={i} variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 900, color: lamenessGrade === i ? '#455A64' : '#BBB' }}>{label}</Typography>
                                            ))}
                                        </Box>
                                    </Box>
                                    <Typography variant="caption" sx={{ fontWeight: 900, color: '#455A64', mt: 3, mb: 1, display: 'block', letterSpacing: 1 }}>NEUROLOGICAL STATUS</Typography>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                        {['cpDeficit', 'ataxia', 'knuckling', 'proprioception'].map(id => (
                                            <Chip 
                                                key={id} label={id.toUpperCase()} size="small"
                                                onClick={() => { setNeuromuscular(prev => ({ ...prev, [id]: !prev[id] })); setIsDirty(true); }}
                                                sx={{ 
                                                    fontWeight: 900, fontSize: '0.55rem', height: 22,
                                                    bgcolor: neuromuscular[id] ? '#455A64' : 'white',
                                                    color: neuromuscular[id] ? 'white' : '#455A64',
                                                    border: `1px solid ${neuromuscular[id] ? '#455A64' : '#E0E0E0'}`,
                                                    '&:hover': { bgcolor: neuromuscular[id] ? '#37474F' : 'rgba(0,0,0,0.02)' }
                                                }} 
                                            />
                                        ))}
                                    </Box>
                                </Grid>
                                <Grid size={{ xs: 12, md: 8 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 900, color: '#455A64', mb: 1, display: 'block', letterSpacing: 1 }}>GONIOMETRIC RANGE OF MOTION (ROM)</Typography>
                                    <Grid container spacing={1}>
                                        {['stifle', 'hip', 'elbow', 'shoulder'].map(joint => (
                                            <Grid key={joint} size={{ xs: 6 }}>
                                                <Box sx={{ p: 1, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 2, border: '1px solid rgba(0,0,0,0.05)' }}>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
                                                        <Typography variant="caption" sx={{ fontWeight: 900, textTransform: 'uppercase', color: '#455A64', fontSize: '0.6rem' }}>{joint}</Typography>
                                                        {/* 🧬 SYMMETRY DELTA (NEW) */}
                                                        {parseFloat(jointROM[joint].lFlex) && parseFloat(jointROM[joint].rFlex) ? (
                                                            <Typography variant="caption" sx={{ fontSize: '0.55rem', fontWeight: 900, color: Math.abs(parseFloat(jointROM[joint].lFlex) - parseFloat(jointROM[joint].rFlex)) > 10 ? '#D32F2F' : '#2E7D32' }}>
                                                                Î” {Math.abs(parseFloat(jointROM[joint].lFlex) - parseFloat(jointROM[joint].rFlex))}Â°
                                                            </Typography>
                                                        ) : null}
                                                    </Box>
                                                    <Grid container spacing={0.5}>
                                                          {['L', 'R'].map(side => (
                                                              <React.Fragment key={side}>
                                                                   <Grid size={{ xs: 6 }}>
                                                                       <TextField 
                                                                           label={`${side} FLEX°`} size="small" placeholder={getNormalROM(joint, 'flexion').toString()}
                                                                           value={jointROM[joint][`${side.toLowerCase()}Flex`] || ''} 
                                                                           onChange={(e) => {
                                                                               setJointROM(prev => ({ ...prev, [joint]: { ...prev[joint], [`${side.toLowerCase()}Flex`]: e.target.value } }));
                                                                               setIsDirty(true);
                                                                           }}
                                                                           slotProps={{ input: { sx: { fontWeight: 900, fontSize: '0.65rem', background: 'white' } }, inputLabel: { sx: { fontWeight: 900, fontSize: '0.55rem' } } }}
                                                                       />
                                                                   </Grid>
                                                                   <Grid size={{ xs: 6 }}>
                                                                       <TextField 
                                                                           label={`${side} EXT°`} size="small" placeholder={getNormalROM(joint, 'extension').toString()}
                                                                           value={jointROM[joint][`${side.toLowerCase()}Ext`] || ''} 
                                                                           onChange={(e) => {
                                                                               setJointROM(prev => ({ ...prev, [joint]: { ...prev[joint], [`${side.toLowerCase()}Ext`]: e.target.value } }));
                                                                               setIsDirty(true);
                                                                           }}
                                                                           slotProps={{ input: { sx: { fontWeight: 900, fontSize: '0.65rem', background: 'white' } }, inputLabel: { sx: { fontWeight: 900, fontSize: '0.55rem' } } }}
                                                                       />
                                                                   </Grid>
                                                              </React.Fragment>
                                                          ))}
                                                    </Grid>
                                                </Box>
                                            </Grid>
                                        ))}
                                    </Grid>
                                </Grid>
                            </Grid>
                        </Collapse>
                    </Paper>
                </Grid>

            {/* ── PILLAR 4: UNIVERSAL LOGISTICS (PHARMACY & LABS) ── */}
            {/* MODULE 6: STAFF PRIVATE NOTES */}
            <Grid size={{ xs: 12, lg: 12 }} sx={{ display: 'flex' }}>
            <Paper 
                className={`elevate-module ${focusedModule && focusedModule !== 'internal' ? 'dim-overlay' : ''}`}
                sx={{ ...glassStyle, p: 3, borderLeft: '8px solid #546E7A', transition: 'all 0.4s ease', flex: 1, display: 'flex', flexDirection: 'column' }}
            >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: expandedModules.has('internal') ? 1 : 0 }}>
                    <Typography variant="h6" fontWeight={900} color="#3E2723" sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => toggleModule('internal')}>
                        <InfoIcon sx={{ color: '#546E7A' }} /> Internal Context & Logs
                    </Typography>
                    <IconButton size="small" onClick={() => toggleModule('internal')} sx={{ p: 1.5, color: '#546E7A' }}>
                        <KeyboardArrowUpIcon sx={{ transform: expandedModules.has('internal') ? 'rotate(0deg)' : 'rotate(180deg)', transition: '0.3s', fontSize: 24 }} />
                    </IconButton>
                </Stack>

                <Collapse in={expandedModules.has('internal')}>
                    <Typography variant="caption" color="textSecondary" sx={{ mb: 2, display: 'block', fontWeight: 900, letterSpacing: '0.02em', fontSize: '0.65rem' }}>STAFF-ONLY NOTES & BILLING CONTEXT</Typography>
                    <Box sx={{ maxWidth: 800, mx: 'auto', width: '100%', flex: 1, display: 'flex' }}>
                        <TextField 
                            multiline rows={4} fullWidth 
                            onFocus={() => setFocusedModule('internal')}
                            onBlur={() => setFocusedModule(null)}
                            placeholder="E.g. Client requested a detailed receipt; behavior was combative..." 
                            slotProps={{ input: { sx: { fontWeight: 900, fontSize: '0.75rem', p: 2, background: 'white' } } }}
                        />
                    </Box>
                </Collapse>
            </Paper>
            </Grid>

            {/* MODULE 7: CLINICAL DOSE CALCULATOR */}
            <Grid size={{ xs: 12, lg: 12 }} sx={{ display: 'flex' }}>
            <Paper 
                className={`elevate-module ${focusedModule && focusedModule !== 'calc' ? 'dim-overlay' : ''}`}
                sx={{ ...glassStyle, p: 3, borderLeft: '8px solid #FF8F00', flex: 1, display: 'flex', flexDirection: 'column' }}
            >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: expandedModules.has('calc') ? 1 : 0 }}>
                    <Typography variant="h6" fontWeight={900} color="#3E2723" sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => toggleModule('calc')}>
                        <CalculateIcon sx={{ color: '#FF8F00' }} /> Precision Dose Math
                    </Typography>
                    <IconButton size="small" onClick={() => toggleModule('calc')} sx={{ color: '#FF8F00' }}>
                        <KeyboardArrowUpIcon sx={{ transform: expandedModules.has('calc') ? 'rotate(0deg)' : 'rotate(180deg)', transition: '0.3s' }} />
                    </IconButton>
                </Stack>

                <Collapse in={expandedModules.has('calc')}>
                    <Box sx={{ maxWidth: 500, mx: 'auto', width: '100%', textAlign: 'center' }}>
                        <Box sx={{ bgcolor: '#FFF8E1', p: 1, borderRadius: 2, mb: 1.5, border: '1px solid #FFE082', display: 'flex', justifyContent: 'center' }}>
                            <Typography variant="h5" fontWeight={900} color="#FF8F00" sx={{ letterSpacing: -1 }}>
                                {calcResult > 0 ? `${calcResult.toFixed(2)} mL` : '0.00 mL'}
                            </Typography>
                        </Box>

                        <Grid container spacing={1}>
                            <Grid size={{ xs: 6 }}>
                                <TextField 
                                    label="DOSE (mg/kg)" size="small" fullWidth type="number"
                                    value={calcDose} onChange={(e) => setCalcDose(e.target.value)}
                                    onFocus={() => setFocusedModule('calc')} onBlur={() => setFocusedModule(null)}
                                    slotProps={{ input: { sx: { fontWeight: 900, fontSize: '0.75rem', background: 'white' } }, inputLabel: { sx: { fontWeight: 900, fontSize: '0.65rem' } } }}
                                />
                            </Grid>
                            <Grid size={{ xs: 6 }}>
                                <TextField 
                                    label="CONC (mg/mL)" size="small" fullWidth type="number"
                                    value={calcConc} onChange={(e) => setCalcConc(e.target.value)}
                                    onFocus={() => setFocusedModule('calc')} onBlur={() => setFocusedModule(null)}
                                    slotProps={{ input: { sx: { fontWeight: 900, fontSize: '0.75rem', background: 'white' } }, inputLabel: { sx: { fontWeight: 900, fontSize: '0.65rem' } } }}
                                />
                            </Grid>
                        </Grid>

                        <Button 
                            variant="outlined" fullWidth 
                            onClick={handlePushDoseToCart}
                            sx={{ 
                                mt: 2, fontWeight: 900, borderRadius: 2, py: 0.75, fontSize: '0.75rem',
                                border: '1px solid rgba(0,0,0,0.1)', borderLeft: '4px solid #FF8F00',
                                bgcolor: 'rgba(0,0,0,0.02)', color: '#FF8F00',
                                '&:hover': { bgcolor: 'rgba(255, 143, 0, 0.05)' }
                            }}
                            startIcon={<BoltIcon />}
                        >
                            PUSH TO TREATMENT PLAN
                        </Button>
                    </Box>
                </Collapse>
            </Paper>
            </Grid>

            <Grid size={{ xs: 12, lg: 12 }} sx={{ display: 'flex' }}>
            {/* MODULE 3: TREATMENT PLAN & RX */}
            <Paper 
                ref={treatmentRef}
                className={`${activeHighlight === 'treatment' ? 'highlight-module' : ''} elevate-module ${focusedModule && focusedModule !== 'treatment' ? 'dim-overlay' : ''}`}
                sx={{ ...glassStyle, p: 3, borderLeft: `8px solid ${COLORS.accent}`, transition: 'all 0.4s ease' }}
            >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: expandedModules.has('rx') ? 1 : 0 }}>
                    <Typography variant="h6" fontWeight={900} color="#3E2723" sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => toggleModule('rx')}>
                        <ReceiptLongIcon sx={{ color: COLORS.accent }} /> Treatment Plan & E-Prescribe
                    </Typography>
                    <IconButton size="small" onClick={() => toggleModule('rx')} sx={{ p: 1.5, color: COLORS.accent }}>
                        <KeyboardArrowUpIcon sx={{ transform: expandedModules.has('rx') ? 'rotate(0deg)' : 'rotate(180deg)', transition: '0.3s', fontSize: 24 }} />
                    </IconButton>
                </Stack>

                <Collapse in={expandedModules.has('rx')}>
                    <Typography variant="caption" color="textSecondary" sx={{ mb: 2, display: 'block', fontWeight: 900, letterSpacing: '0.02em', fontSize: '0.65rem' }}>BILLING ITEMS & PHARMACEUTICAL LOGISTICS</Typography>
                
                <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                    <FormControl size="small" fullWidth sx={{ bgcolor: 'white', borderRadius: 2 }}>
                        <InputLabel>Add Services or Meds</InputLabel>
                        <Select value={selectedRxItem} label="Add Services or Meds" onChange={e=>setSelectedRxItem(e.target.value)}>
                            <ListSubheader sx={{fontWeight: 900, bgcolor: '#F5F5F5', color: COLORS.brand}}>MEDICINES & VACCINES</ListSubheader>
                            {inventoryList.filter(i => i.category === 'Medicine' || i.category === 'Vaccine').map(i => <MenuItem key={`product|${i.id}`} value={`product|${i.id}`}>{i.itemName} (Stock: {i.stock})</MenuItem>)}
                            <ListSubheader sx={{fontWeight: 900, bgcolor: '#F5F5F5', color: COLORS.brand}}>CLINIC SERVICES (Add-ons)</ListSubheader>
                            {servicesList.filter(s => s.name !== patient?.serviceType).map(s => <MenuItem key={`service|${s.id}`} value={`service|${s.id}`}>{s.name} (+₱{s.price})</MenuItem>)}
                        </Select>
                    </FormControl>
                    <Button variant="contained" onClick={handleAddRx} sx={{ minWidth: 50, borderRadius: 2, bgcolor: COLORS.brand }}><AddCircleIcon/></Button>
                </Box>

                <Stack spacing={1.5}>
                    {rxCart.map((rx, idx) => {
                        const freqMultiplier = { 'SID': 1, 'BID': 2, 'TID': 3, 'QID': 4, 'EOD': 0.5, 'PRN': 1 };
                        
                        // --- 🧬 THE PREDICTIVE MATH ENGINE ---
                        const updatePredictiveQty = (newSig) => {
                            const d = parseFloat(newSig.dose) || 0;
                            const f = freqMultiplier[newSig.frequency] || 1;
                            const dur = parseFloat(newSig.duration) || 1;
                            const calculatedQty = rx.isDispensed ? (d * f * dur) : (parseFloat(newSig.dose) || 1);
                            
                            const newCart = [...rxCart];
                            newCart[idx].sig = newSig;
                            newCart[idx].qty = calculatedQty;
                            setRxCart(newCart);
                        };

                        return (
                        <Box key={idx} sx={{ 
                            display: 'flex', flexDirection: 'column', bgcolor: rx.isBase ? `${COLORS.accentLight}10` : 'white', 
                            p: 2, borderRadius: 2, border: `1px solid ${rx.isBase ? COLORS.accentLight : COLORS.borderLight}`, 
                            boxShadow: '0 2px 8px rgba(39,23,17,0.04)', position: 'relative', overflow: 'hidden'
                        }}>
                            {/* INTENT HEADER */}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Avatar sx={{ width: 32, height: 32, bgcolor: rx.isDrug ? `${COLORS.rxText}10` : `${COLORS.brand}10`, color: rx.isDrug ? COLORS.rxText : COLORS.brand }}>
                                        {rx.isDrug ? <MedicationIcon fontSize="small"/> : <MedicalServicesIcon fontSize="small"/>}
                                    </Avatar>
                                    <Box>
                                        <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', fontWeight: 900, color: COLORS.brand }}>{rx.name}</Typography>
                                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: COLORS.textMuted }}>{rx.type?.toUpperCase()}</Typography>
                                    </Box>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    {rx.isDrug && (
                                        <Stack direction="row" spacing={0.5} sx={{ bgcolor: '#F5F5F5', p: 0.5, borderRadius: 2 }}>
                                            <Button 
                                                size="small" onClick={() => handleUpdateRxField(idx, 'isDispensed', false)}
                                                sx={{ fontSize: '0.6rem', fontWeight: 900, minWidth: 50, height: 24, bgcolor: !rx.isDispensed ? 'white' : 'transparent', color: !rx.isDispensed ? COLORS.brand : COLORS.textMuted, boxShadow: !rx.isDispensed ? 1 : 0 }}
                                            >🏥 CLINIC</Button>
                                            <Button 
                                                size="small" onClick={() => handleUpdateRxField(idx, 'isDispensed', true)}
                                                sx={{ fontSize: '0.6rem', fontWeight: 900, minWidth: 50, height: 24, bgcolor: rx.isDispensed ? 'white' : 'transparent', color: rx.isDispensed ? COLORS.brand : COLORS.textMuted, boxShadow: rx.isDispensed ? 1 : 0 }}
                                            >🏠 HOME</Button>
                                        </Stack>
                                    )}
                                    {!rx.isBase && <IconButton size="small" color="error" onClick={()=>handleRemoveRx(idx)}><CloseIcon sx={{fontSize: 16}}/></IconButton>}
                                </Box>
                            </Box>

                            {/* MEDICAL PARAMETERS (SIG BUILDER) */}
                            {rx.isDrug && (
                                <Box sx={{ bgcolor: '#FDFCFB', p: 1.5, borderRadius: 2, border: '1px dashed #E0E0E0', mb: 1.5 }}>
                                    <Grid container spacing={1}>
                                        <Grid size={{ xs: 3 }}>
                                            <TextField 
                                                label="Dose" variant="standard" size="small" type="number"
                                                value={rx.sig?.dose} onChange={(e) => updatePredictiveQty({ ...rx.sig, dose: e.target.value })}
                                                InputLabelProps={{ shrink: true, style: { fontSize: '0.65rem', fontWeight: 900 } }}
                                                InputProps={{ style: { fontSize: '0.75rem', fontWeight: 900, color: COLORS.rxText } }}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 3 }}>
                                            <TextField 
                                                label="Unit" variant="standard" size="small"
                                                value={rx.sig?.unit} onChange={(e) => updatePredictiveQty({ ...rx.sig, unit: e.target.value })}
                                                InputLabelProps={{ shrink: true, style: { fontSize: '0.65rem', fontWeight: 900 } }}
                                                InputProps={{ style: { fontSize: '0.75rem', fontWeight: 700 } }}
                                            />
                                        </Grid>
                                        <Grid size={{ xs: 3 }}>
                                            <FormControl variant="standard" fullWidth size="small">
                                                <InputLabel shrink style={{ fontSize: '0.65rem', fontWeight: 900 }}>Freq</InputLabel>
                                                <Select value={rx.sig?.frequency} onChange={(e) => updatePredictiveQty({ ...rx.sig, frequency: e.target.value })} sx={{ fontSize: '0.75rem', fontWeight: 800 }}>
                                                    <MenuItem value="SID">SID</MenuItem>
                                                    <MenuItem value="BID">BID</MenuItem>
                                                    <MenuItem value="TID">TID</MenuItem>
                                                    <MenuItem value="QID">QID</MenuItem>
                                                    <MenuItem value="EOD">EOD</MenuItem>
                                                    <MenuItem value="PRN">PRN</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Grid>
                                        <Grid size={{ xs: 3 }}>
                                            <TextField 
                                                label="Days" variant="standard" size="small" type="number"
                                                value={rx.sig?.duration} onChange={(e) => updatePredictiveQty({ ...rx.sig, duration: e.target.value })}
                                                InputLabelProps={{ shrink: true, style: { fontSize: '0.65rem', fontWeight: 900 } }}
                                                InputProps={{ style: { fontSize: '0.75rem', fontWeight: 900 } }}
                                            />
                                        </Grid>
                                    </Grid>
                                    
                                    {/* STRUCTURED SIG PREVIEW */}
                                    <Typography sx={{ mt: 1.5, fontSize: '0.7rem', fontWeight: 800, color: '#B45309', bgcolor: '#FFFBEB', px: 1, py: 0.5, borderRadius: 1, borderLeft: '3px solid #D97706' }}>
                                        💬 SIG: Give {rx.sig?.dose} {rx.sig?.unit} {rx.route || 'SQ'} {rx.sig?.frequency} for {rx.sig?.duration} days.
                                    </Typography>
                                </Box>
                            )}

                            {/* LOGISTICS & BILLING PREVIEW */}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 'auto' }}>
                                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                                    <Box>
                                        <Typography sx={{ fontSize: '0.6rem', fontWeight: 800, color: COLORS.textMuted, textTransform: 'uppercase' }}>Dispense Qty</Typography>
                                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 900, color: COLORS.brand }}>
                                            {rx.qty} <span style={{fontSize: '0.65rem'}}>{rx.sig?.unit || 'units'}</span>
                                        </Typography>
                                    </Box>
                                    <Divider orientation="vertical" flexItem />
                                    <Box>
                                        <Typography sx={{ fontSize: '0.6rem', fontWeight: 800, color: COLORS.textMuted, textTransform: 'uppercase' }}>Subtotal</Typography>
                                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 900, color: COLORS.brand }}>₱{(rx.price * rx.qty).toLocaleString()}</Typography>
                                    </Box>
                                </Box>
                                {rx.isDrug && (
                                    <TextField 
                                        label="Lot #" variant="outlined" size="small" 
                                        sx={{ width: 80, '& .MuiInputBase-input': { fontSize: '0.65rem', fontWeight: 900, p: 1 } }}
                                        value={rx.lotNumber || ''} onChange={(e) => handleUpdateRxField(idx, 'lotNumber', e.target.value)}
                                    />
                                )}
                            </Box>
                        </Box>
                        );
                    })}
                </Stack>
                </Collapse>
            </Paper>
            </Grid>

            <Grid size={{ xs: 12, lg: 12 }} sx={{ display: 'flex' }}>
            {/* MODULE 4: DIAGNOSTICS & LABS (NEW PILAR) */}
            {/* MODULE 4: DIAGNOSTICS & LABS */}
            <Paper 
                ref={diagnosticsRef}
                className={`${activeHighlight === 'diagnostics' ? 'highlight-module' : ''} elevate-module ${focusedModule && focusedModule !== 'diagnostics' ? 'dim-overlay' : ''}`}
                sx={{ ...glassStyle, p: 3, borderLeft: '8px solid #1976D2', transition: 'all 0.4s ease', flex: 1, display: 'flex', flexDirection: 'column' }}
            >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: expandedModules.has('diagnostics') ? 1 : 0 }}>
                    <Typography variant="h6" fontWeight={900} color="#3E2723" sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => toggleModule('diagnostics')}>
                        <LocalHospitalIcon sx={{ color: '#1976D2' }} /> Diagnostics & Lab Findings
                    </Typography>
                    <IconButton size="small" onClick={() => toggleModule('diagnostics')} sx={{ color: '#1976D2' }}>
                        <KeyboardArrowUpIcon sx={{ transform: expandedModules.has('diagnostics') ? 'rotate(0deg)' : 'rotate(180deg)', transition: '0.3s' }} />
                    </IconButton>
                </Stack>

                <Collapse in={expandedModules.has('diagnostics')}>
                    <Typography variant="caption" color="textSecondary" sx={{ mb: 2, display: 'block', fontWeight: 900, letterSpacing: '0.02em', fontSize: '0.65rem' }}>ENTER LAB SUMMARIES & IMAGING OBSERVATIONS</Typography>
                    <Box sx={{ maxWidth: 800, mx: 'auto', width: '100%', flex: 1, display: 'flex' }}>
                        <TextField 
                          multiline rows={3} fullWidth 
                          onFocus={() => setFocusedModule('diagnostics')}
                          onBlur={() => setFocusedModule(null)}
                          placeholder="Bloodwork findings..." 
                          slotProps={{ input: { sx: { fontWeight: 900, fontSize: '0.75rem', p: 2, background: 'white' } } }}
                        />
                    </Box>
                </Collapse>
            </Paper>
            </Grid>

            <Grid size={{ xs: 12, lg: 12 }} sx={{ display: 'flex' }}>
            <Paper 
                ref={dischargeRef}
                className={`${activeHighlight === 'discharge' ? 'highlight-module' : ''} elevate-module ${focusedModule && focusedModule !== 'discharge' ? 'dim-overlay' : ''}`}
                sx={{ ...glassStyle, p: 3, borderLeft: '8px solid #2E7D32', transition: 'all 0.4s ease', flex: 1, display: 'flex', flexDirection: 'column' }}
            >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: expandedModules.has('discharge') ? 1 : 0 }}>
                    <Typography variant="h6" fontWeight={900} color="#3E2723" sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => toggleModule('discharge')}>
                        <ExitToAppIcon sx={{ color: '#2E7D32' }} /> Discharge & Follow-up
                    </Typography>
                    <IconButton size="small" onClick={() => toggleModule('discharge')} sx={{ color: '#2E7D32' }}>
                        <KeyboardArrowUpIcon sx={{ transform: expandedModules.has('discharge') ? 'rotate(0deg)' : 'rotate(180deg)', transition: '0.3s' }} />
                    </IconButton>
                </Stack>

                <Collapse in={expandedModules.has('discharge')}>
                    <Typography variant="caption" color="textSecondary" sx={{ mb: 2, display: 'block', fontWeight: 900, letterSpacing: '0.02em', fontSize: '0.65rem' }}>TAKE HOME INSTRUCTIONS & FOLLOW-UP SCHEDULING</Typography>
                    <Box sx={{ bgcolor: '#F1F8E9', p: 2, borderRadius: 2, mb: 1, border: '1px solid #C8E6C9' }}>
                        <Typography variant="caption" fontWeight={900} color="#2E7D32">TAKE HOME PREVIEW:</Typography>
                        <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic', color: '#1B5E20', fontSize: '0.75rem' }}>
                            {soapData.plan || "Instructions will populate from the 'Plan' section."}
                        </Typography>
                    </Box>
                    <TextField 
                      select label="NEXT FOLLOW-UP" size="small" fullWidth 
                      value={soapData.nextVisit} 
                      onChange={(e)=>updateSoap('nextVisit', e.target.value)}
                      onFocus={() => setFocusedModule('discharge')}
                      onBlur={() => setFocusedModule(null)}
                      slotProps={{ input: { sx: { fontWeight: 900, fontSize: '0.75rem', background: 'white' } }, inputLabel: { sx: { fontWeight: 900, fontSize: '0.65rem' } } }}
                      sx={{ mt: 'auto' }}
                    >
                        <MenuItem value="1 week">In 1 week</MenuItem>
                        <MenuItem value="2 weeks">In 2 weeks</MenuItem>
                        <MenuItem value="1 month">In 1 month</MenuItem>
                        <MenuItem value="none">PRN (As needed)</MenuItem>
                    </TextField>
                </Collapse>
            </Paper>
            </Grid>





            <Grid size={{ xs: 12 }}>
              <Box sx={{ py: 4, textAlign: 'center' }}>
                  {/* 🧬 SHIFT 5.6: CLINICAL SOVEREIGNTY SYNC BOX */}
                  {!isRecordLocked && (
                      <Box sx={{ 
                          maxWidth: 800, mx: 'auto', mb: 4, p: 3, 
                          bgcolor: '#FFF8E1', border: '1px solid #FFD54F', borderLeft: '8px solid #FF8F00',
                          textAlign: 'left', borderRadius: 2, boxShadow: '0 8px 32px rgba(255, 143, 0, 0.1)'
                      }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1.5 }}>
                              <WarningIcon sx={{ color: '#FF8F00', fontSize: 28 }} />
                              <Typography variant="h6" sx={{ fontWeight: 900, color: '#FF8F00', letterSpacing: 0.5 }}>⚠️ PERMANENT CRM DATA SYNCHRONIZATION</Typography>
                          </Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#5D4037', lineHeight: 1.6, mb: 2 }}>
                              By enabling this toggle, you are authorizing the system to overwrite the <b>Master CRM Record</b> (Owner Info & Pet Biometrics) with today's intake corrections. This action is <b>irreversible</b> and establishes a new baseline for all future clinical visits and historical audits.
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: 'rgba(0,0,0,0.03)', borderRadius: 1 }}>
                              <Typography sx={{ fontWeight: 900, fontSize: '0.8rem', color: '#3E2723' }}>PROPAGATE CHANGES TO MASTER DATABASE</Typography>
                              <FormControlLabel
                                  control={<Switch checked={syncToCRM} onChange={(e) => setSyncToCRM(e.target.checked)} color="warning" />}
                                  label={syncToCRM ? "AUTHORIZED" : "LOCALIZED ONLY"}
                                  labelPlacement="start"
                                  sx={{ '& .MuiFormControlLabel-label': { fontWeight: 1000, fontSize: '0.7rem', mr: 2, color: syncToCRM ? '#2E7D32' : '#757575' } }}
                              />
                          </Box>
                      </Box>
                  )}

                  {!isRecordLocked ? (
                      <>
                        <Typography variant="body2" color="textSecondary" sx={{ fontStyle: 'italic', mb: 2, fontSize: '0.7rem' }}>Authorized Clinician: <span style={{fontWeight: 900, color: COLORS.brand}}>{auth.currentUser?.displayName || 'Session User'}</span></Typography>
                        <Stack direction="row" spacing={2} justifyContent="center">
                            <Button 
                                variant="outlined" size="large" 
                                onClick={() => setOwnerSignature(`signed_${Date.now()}`)} 
                                startIcon={<HistoryEduIcon />}
                                sx={{ 
                                    fontWeight: 900, borderRadius: 2, px: 4, 
                                    border: '1px solid rgba(0,0,0,0.1)', borderLeft: '4px solid #5D4037',
                                    bgcolor: 'rgba(0,0,0,0.02)', color: '#5D4037',
                                    '&:hover': { bgcolor: 'rgba(93, 64, 55, 0.05)' }
                                }}
                            >
                                {ownerSignature ? "CONSENT SIGNED ✅" : "SIGN DIGITAL CONSENT"}
                            </Button>
                            <Button 
                                variant="outlined" size="large" onClick={handleSaveConsult} disabled={loading || !ownerSignature} 
                                sx={{ 
                                    fontWeight: 900, borderRadius: 2, px: 6, 
                                    border: '1px solid rgba(0,0,0,0.1)', borderLeft: '4px solid #2E7D32',
                                    bgcolor: 'rgba(0,0,0,0.02)', color: '#2E7D32',
                                    '&:hover': { bgcolor: 'rgba(46, 125, 50, 0.05)' }
                                }}
                            >
                                {loading ? "FINALIZING..." : "FINALIZE & SEAL RECORD"}
                            </Button>
                        </Stack>
                      </>
                  ) : (
                      <Box sx={{ maxWidth: 500, mx: 'auto', p: 3, bgcolor: '#E8F5E9', borderRadius: 3, border: '2px dashed #2E7D32' }}>
                          <Typography variant="h6" fontWeight={900} color="#2E7D32" sx={{ letterSpacing: 1 }}>🔒 RECORD SEALED & AUTHENTICATED</Typography>
                          <Typography variant="caption" sx={{ fontWeight: 900, display: 'block', mt: 1 }}>DIGITAL FINGERPRINT: VC-{auth.currentUser?.uid?.slice(0,8).toUpperCase()}</Typography>
                      </Box>
                  )}
              </Box>
            </Grid>
          </Grid>
        </Box>

         {/* ── RIGHT: CLINICAL HUB (30%) ── */}
        <Box sx={{ width: '300px', flexShrink: 0, bgcolor: '#FAF8F5', borderLeft: `1px solid ${COLORS.borderLight}`, overflowY: 'auto', p: 2, '&::-webkit-scrollbar': { width: 4 } }}>
           
           {/* FLUID RATE HUB (NEW) */}
           <Widget title="Fluid Rate Hub" icon={<LocalHospitalIcon sx={{ fontSize: 13, color: '#1976D2' }} />}>
                <Box sx={{ p: 1.5 }}>
                    <Box sx={{ bgcolor: '#E3F2FD', p: 2, borderRadius: 2, mb: 1.5, border: '1px solid #BBDEFB', textAlign: 'center' }}>
                        <Typography variant="h5" fontWeight={900} color="#1565C0">
                            {fluidResult ? `${Math.round(fluidResult)}` : '0'} <span style={{fontSize: '0.8rem'}}>mL/day</span>
                        </Typography>
                        <Typography variant="caption" color="#1565C0" sx={{ fontWeight: 800 }}>{Math.round(fluidResult/24)} mL/hr Rate</Typography>
                    </Box>
                    <Grid container spacing={1}>
                        <Grid size={{ xs: 6 }}>
                             <TextField label="Dehyd %" size="small" fullWidth type="number" value={fluidDehydration || ''} onChange={(e)=>setFluidDehydration(e.target.value)} />
                        </Grid>
                        <Grid size={{ xs: 6 }}>
                             <TextField label="Loss (mL)" size="small" fullWidth type="number" value={fluidLoss || ''} onChange={(e)=>setFluidLoss(e.target.value)} />
                        </Grid>
                    </Grid>
                </Box>
           </Widget>

           {/* ☣️ ISOLATION PPE PROTOCOL (NEW) */}
           <Collapse in={isIsolationMode}>
                <Widget title="Isolation PPE Protocol" icon={<WarningIcon sx={{ fontSize: 13, color: '#7B1FA2' }} />}>
                    <Box sx={{ p: 1, bgcolor: '#F3E5F5', borderRadius: 2, border: '1px solid #CE93D8' }}>
                         {[
                             { id: 'gloves', label: 'Double Gloves' },
                             { id: 'gown', label: 'Isolation Gown' },
                             { id: 'shoeCovers', label: 'Fluid-Resist Covers' },
                             { id: 'dedicatedGear', label: 'Dedicated Equipment' }
                         ].map(item => (
                             <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, cursor: 'pointer' }} onClick={() => setIsolationProtocol(p => ({ ...p, [item.id]: !p[item.id] }))}>
                                 <Box sx={{ width: 14, height: 14, borderRadius: '20%', border: '2px solid #7B1FA2', bgcolor: isolationProtocol[item.id] ? '#7B1FA2' : 'white' }} />
                                 <Typography variant="caption" sx={{ fontWeight: 800, color: '#4A148C' }}>{item.label}</Typography>
                             </Box>
                         ))}
                    </Box>
                </Widget>
           </Collapse>


           {/* 🧬 IN-HOUSE LAB HUB (PCV/TP/GLUCOSE) */}
           <Widget title="Lab Quick-Stats" icon={<VisibilityIcon sx={{ fontSize: 13, color: COLORS.brand }} />}>
                <Box sx={{ p: 1.5 }}>
                    <Grid container spacing={1}>
                        <Grid size={{ xs: 4 }}>
                            <TextField 
                                label="PCV (%)" size="small" fullWidth type="number" 
                                value={labQuickStats.pcv} onChange={(e) => setLabQuickStats(p => ({ ...p, pcv: e.target.value }))} 
                            />
                        </Grid>
                        <Grid size={{ xs: 4 }}>
                            <TextField 
                                label="TP (g/dL)" size="small" fullWidth type="number" 
                                value={labQuickStats.tp} onChange={(e) => setLabQuickStats(p => ({ ...p, tp: e.target.value }))} 
                            />
                        </Grid>
                        <Grid size={{ xs: 4 }}>
                            <TextField 
                                label="Glu (mg/dL)" size="small" fullWidth type="number" 
                                className={getGlucoseLevel(labQuickStats.glucose) === 'critical' ? 'glow-critical' : getGlucoseLevel(labQuickStats.glucose) === 'warning' ? 'glow-warning' : ''}
                                value={labQuickStats.glucose} onChange={(e) => setLabQuickStats(p => ({ ...p, glucose: e.target.value }))} 
                            />
                        </Grid>
                    </Grid>
                    {getGlucoseLevel(labQuickStats.glucose) === 'critical' && (
                        <Typography variant="caption" sx={{ color: '#D32F2F', fontWeight: 900, mt: 1, display: 'block', textAlign: 'center' }}>
                           🚨 CRITICAL HYPOGLYCEMIA
                        </Typography>
                    )}
                </Box>
           </Widget>

           {/* 🍎 NUTRITION & CALORIC HUB (RER/DER) */}
           <Widget title="Nutrition Hub" icon={<AutoFixHighIcon sx={{ fontSize: 13, color: '#4CAF50' }} />}>
                <Box sx={{ p: 1.5 }}>
                    <Box sx={{ bgcolor: '#E8F5E9', p: 2, borderRadius: 2, mb: 1.5, border: '1px solid #C8E6C9', textAlign: 'center' }}>
                        <Typography variant="h5" fontWeight={900} color="#2E7D32">
                           {soapData.objWeight ? Math.round(70 * Math.pow(parseFloat(soapData.objWeight), 0.75) * nutritionFactor) : '0'}
                           <span style={{fontSize: '0.8rem'}}> kcal/day</span>
                        </Typography>
                        <Typography variant="caption" color="#2E7D32" sx={{ fontWeight: 800 }}>
                            Prescribed DER (RER x {nutritionFactor})
                        </Typography>
                    </Box>
                    <FormControl fullWidth size="small">
                        <InputLabel>Life Stage / Goal</InputLabel>
                        <Select 
                            label="Life Stage / Goal" value={nutritionFactor} 
                            onChange={(e) => setNutritionFactor(e.target.value)}
                            sx={{ fontSize: '0.75rem' }}
                        >
                            <MenuItem value={1.0}>Weight Loss (1.0)</MenuItem>
                            <MenuItem value={1.2}>Weight Gain (1.2)</MenuItem>
                            <MenuItem value={1.6}>Neutered Adult (1.6)</MenuItem>
                            <MenuItem value={1.8}>Intact Adult (1.8)</MenuItem>
                            <MenuItem value={2.5}>Puppy/Kitten (2.5)</MenuItem>
                            <MenuItem value={3.0}>Active/Work (3.0)</MenuItem>
                        </Select>
                    </FormControl>
                </Box>
           </Widget>

           {/* 🖼️ DIAGNOSTIC MEDIA GALLERY (NEW) */}
           <Widget title="Diagnostic Media Hub" icon={<MedicalInformationIcon sx={{ fontSize: 13, color: COLORS.brand }} />}>
                <Grid container spacing={0.5} sx={{ p: 0.5 }}>
                    {[1, 2, 3].map(i => (
                        <Grid key={i} size={{ xs: 4 }}>
                            <Box sx={{ 
                                aspectRatio: '1/1', bgcolor: '#E0E0E0', borderRadius: 1, 
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '1px solid rgba(0,0,0,0.05)', cursor: 'pointer',
                                '&:hover': { bgcolor: '#D5D5D5' }
                            }}>
                                <VisibilityIcon sx={{ fontSize: 16, color: '#9E9E9E' }} />
                            </Box>
                        </Grid>
                    ))}
                    <Grid size={{ xs: 12 }} sx={{ mt: 0.5 }}>
                        <Button fullWidth size="small" variant="text" sx={{ fontSize: '0.6rem', fontWeight: 900 }}>Upload Imaging / PACS</Button>
                    </Grid>
                </Grid>
           </Widget>


           {/* OWNER COMMUNICATIONS */}
           <Widget title="Owner Status Link" icon={<InfoIcon sx={{ fontSize: 13, color: '#1976D2' }} />}>
                <Box sx={{ p: 1.5 }}>
                    <Typography variant="caption" sx={{ color: '#757575', fontWeight: 'bold', display: 'block', mb: 1 }}>Communication Channel:</Typography>
                    <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                        <Button size="small" variant="outlined" sx={{ flex: 1, fontSize: '0.65rem', fontWeight: 900 }}>SMS</Button>
                        <Button size="small" variant="outlined" sx={{ flex: 1, fontSize: '0.65rem', fontWeight: 900 }}>EMAIL</Button>
                    </Stack>
                    <Box sx={{ bgcolor: '#E3F2FD', p: 1, borderRadius: 1, border: '1px solid #BBDEFB' }}>
                        <Typography variant="caption" sx={{ color: '#1565C0', fontWeight: 'bold' }}>Update Preview:</Typography>
                        <Typography variant="caption" sx={{ display: 'block', color: '#1565C0', mt: 0.5 }}>
                            "{patient?.petName} is currently in-consult. We are finalizing the treatment plan now."
                        </Typography>
                    </Box>
                </Box>
           </Widget>

           {/* WEIGHT TREND */}
           <Widget title="Weight Pattern" icon={<TrendingUpIcon sx={{ fontSize: 13, color: COLORS.accent }} />}>
                {vitalsData.length > 1 ? (
                        <Box sx={{ height: 140, mt: 1, minWidth: 0, display: 'block' }}>
                            <ResponsiveContainer width="99%" height={140} debounce={100}>
                                <LineChart data={vitalsData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.borderLight} />
                                <XAxis dataKey="date" hide />
                                <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                                <RechartsTooltip />
                                <Line type="monotone" dataKey="weight" stroke={COLORS.accent} strokeWidth={3} dot={{ r: 4, fill: COLORS.accent }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </Box>
                ) : (
                    <Box sx={{ textAlign: 'center', py: 3, opacity: 0.5 }}><Typography variant="caption" sx={{ fontStyle: 'italic' }}>Insufficient history for patterns</Typography></Box>
                )}
           </Widget>

           {/* VITALS TRENDS */}
           <Widget title="Temp & Heart Rate" icon={<FavoriteIcon sx={{ fontSize: 13, color: '#D32F2F' }} />}>
                <Box sx={{ height: 80, mb: 2, minWidth: 0, display: 'block' }}>
                    <ResponsiveContainer width="99%" height={80} debounce={100}>
                        <LineChart data={tempData}>
                            <Line type="stepAfter" dataKey="temp" stroke="#EF6C00" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                    <Typography variant="caption" sx={{ textAlign: 'center', display: 'block', fontSize: '0.6rem', fontWeight: 900, color: '#EF6C00' }}>TEMP HISTORY (°C)</Typography>
                </Box>
                <Box sx={{ height: 80, minWidth: 0, display: 'block' }}>
                    <ResponsiveContainer width="99%" height={80} debounce={100}>
                        <LineChart data={hrData}>
                            <Line type="monotone" dataKey="hr" stroke="#D32F2F" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                    <Typography variant="caption" sx={{ textAlign: 'center', display: 'block', fontSize: '0.6rem', fontWeight: 900, color: '#D32F2F' }}>HR HISTORY (BPM)</Typography>
                </Box>
           </Widget>

           {/* NEXT APPOINTMENT */}
           <Widget title="Upcoming Follow-up" icon={<CalendarMonthIcon sx={{ fontSize: 13, color: COLORS.brand }} />}>
                {nextAppointment ? (
                    <Box sx={{ bgcolor: 'white', p: 1.5, borderRadius: 2, border: `1px solid ${COLORS.borderLight}` }}>
                        <Typography variant="body2" fontWeight={900} color={COLORS.brand}>
                            {nextAppointment.date?.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">{nextAppointment.serviceType}</Typography>
                    </Box>
                ) : (
                    <Box sx={{ bgcolor: 'rgba(0,0,0,0.03)', p: 1.5, borderRadius: 2, border: '1px dashed #CCC', textAlign: 'center' }}>
                         <Typography variant="caption" sx={{ fontStyle: 'italic', fontWeight: 800 }}>No future visits scheduled</Typography>
                    </Box>
                )}
           </Widget>

           {/* PAST VISITS TOC */}
           <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900, color: COLORS.textMuted, mt: 4, mb: 1, px: 1, letterSpacing: 1 }}>PAST RECORDS TIMELINE</Typography>
           <Stack spacing={1} sx={{ px: 1 }}>
                {history.slice(0, 5).map((rec, i) => (
                    <Box key={i} sx={{ position: 'relative', pl: 3, pb: 1, borderLeft: '2px solid #E0E0E0' }}>
                        <Box sx={{ position: 'absolute', left: -7, top: 0, width: 14, height: 14, borderRadius: '50%', transition: 'all 0.2s', '&:hover': { transform: 'scale(1.2)' }, bgcolor: COLORS.accentLight, border: '2px solid white', boxShadow: 1 }} />
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 900, color: COLORS.textPrimary }}>{new Date(rec.date?.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Typography>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, fontStyle: 'italic' }}>{rec.diagnosis || 'Clinical Visit'}</Typography>
                    </Box>
                ))}
                {history.length > 5 && <Typography variant="caption" color="primary" sx={{ textAlign: 'center', cursor: 'pointer', fontWeight: 900 }}>See {history.length - 5} more in CRM Dashboard...</Typography>}
           </Stack>

        </Box>
        {/* ── 🆕 PILLAR 5: DEPARTURE CONTROL (STICKY BOTTOM ZONE) ── */}
        <Box sx={{ 
            position: 'fixed', bottom: 0, left: 0, right: 0, 
            bgcolor: 'white', borderTop: `2px solid ${COLORS.brand}40`, 
            p: 2, px: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.08)', zIndex: 1200,
            backdropFilter: 'blur(10px)', background: 'rgba(255,255,255,0.9)'
        }}>
            <Box sx={{ display: 'flex', gap: 4 }}>
                <Box>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: COLORS.textMuted, display: 'block', mb: 0.5 }}>CURRENT VISIT TOTAL</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 900, color: COLORS.brand }}>₱{rxCart.reduce((sum, item) => sum + (item.price * item.qty), 0).toLocaleString()}</Typography>
                </Box>
                <Divider orientation="vertical" flexItem />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box>
                         <Typography variant="caption" sx={{ fontWeight: 800, color: COLORS.textMuted, display: 'block' }}>RECORDS STATUS</Typography>
                         <Typography variant="caption" sx={{ fontWeight: 900, color: lockedServices.size === (patient?.services?.length || 0) ? '#2E7D32' : COLORS.textSecondary }}>
                            {lockedServices.size === (patient?.services?.length || 0) ? '✅ ALL SERVICES FINALIZED' : '⚠️ PENDING SIGN-OFFS'}
                         </Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem variant="middle" />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 800, color: COLORS.textMuted }}>NEXT STATUS:</Typography>
                        <Chip label={hasDrugsInCart ? "PHARMACY" : "CASHIER"} size="small" variant="outlined" sx={{ fontWeight: 900, borderColor: COLORS.brand, color: COLORS.brand }} />
                    </Box>
                </Box>
            </Box>

            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Button 
                    variant="outlined" onClick={handleCloseRequest}
                    sx={{ 
                        fontWeight: 900, borderRadius: 2, px: 3, 
                        border: '1px solid rgba(0,0,0,0.1)', color: '#757575',
                        bgcolor: 'rgba(0,0,0,0.02)',
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' }
                    }}
                >
                    CANCEL
                </Button>
                <Button 
                    variant="outlined" onClick={handleSaveConsult} disabled={loading} 
                    startIcon={<SaveIcon />} 
                    sx={{ 
                        fontWeight: 900, borderRadius: 2, px: 6, py: 1.5,
                        border: '1px solid rgba(0,0,0,0.1)', borderLeft: '4px solid #5D4037',
                        bgcolor: 'rgba(0,0,0,0.02)', color: '#5D4037',
                        '&:hover': { bgcolor: 'rgba(93, 64, 55, 0.05)', transform: 'translateY(-2px)' },
                        transition: '0.3s'
                    }}
                >
                    {loading ? "PROCESSING..." : saveBtnText.toUpperCase()}
                </Button>
            </Stack>
</Box>
      </Box>

      {/* 🧘 THE ZEN MODE FOCUS OVERLAY (CLINICAL CONCENTRATION) ── */}
      <Dialog 
        fullScreen open={!!fullscreenField} onClose={() => setFullscreenField(null)}
        PaperProps={{ sx: { bgcolor: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(10px)' } }}
      >
        <Box sx={{ p: 4, height: '100vh', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <HistoryEduIcon sx={{ color: COLORS.brand, fontSize: 32 }} />
                    <Box>
                        <Typography variant="h4" sx={{ fontWeight: 900, color: COLORS.brand, letterSpacing: -1 }}>
                            ZEN MODE: {fullscreenField?.toUpperCase()}
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 800, color: COLORS.textMuted }}>
                            {patient?.petName} • Documentation Focus • ESC to Exit
                        </Typography>
                    </Box>
                </Box>
                <IconButton onClick={() => setFullscreenField(null)} sx={{ bgcolor: 'rgba(0,0,0,0.05)' }}><CloseIcon /></IconButton>
            </Box>

            <Divider />

            <TextField 
                multiline fullWidth autoFocus
                value={soapData[fullscreenField] || ''}
                onChange={(e) => updateSoap(fullscreenField, e.target.value)}
                variant="standard"
                placeholder="Proceed with deep clinical documentation..."
                InputProps={{ 
                    disableUnderline: true,
                    sx: { 
                        fontSize: '1.25rem', lineHeight: 1.6, fontWeight: 500, fontFamily: FONT,
                        '& textarea': { minHeight: '60vh' }
                    } 
                }}
            />

            <Box sx={{ mt: 'auto', p: 3, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 4, display: 'flex', justifyContent: 'center' }}>
                <Button 
                    variant="contained" size="large" onClick={() => setFullscreenField(null)}
                    sx={{ fontWeight: 900, px: 10, borderRadius: 50, bgcolor: COLORS.brand }}
                >
                    RETURN TO WORKSPACE
                </Button>
            </Box>
        </Box>
      </Dialog>

      {/* 🏛️ THE 'GOD-VIEW' UNIFIED CLINICAL COMMAND CENTER ── */}
      <Dialog 
        fullScreen open={isUnifiedZen} onClose={() => setIsUnifiedZen(false)}
        PaperProps={{ sx: { bgcolor: '#FDFCFB', backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0,0,0,0.02) 1px, transparent 0)', backgroundSize: '24px 24px' } }}
      >
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* 🛰️ COMMAND HEADER */}
            <Box sx={{ p: 2, px: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.05)', bgcolor: 'white' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <FitScreenIcon sx={{ color: COLORS.brand, fontSize: 32 }} />
                    <Box>
                        <Typography variant="h5" sx={{ fontWeight: 900, color: COLORS.brand, letterSpacing: -1 }}>UNIFIED CLINICAL COMMAND CENTER (GOD-VIEW)</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 800, color: COLORS.textMuted }}>Total Immersion Mode • {patient?.petName} • Documentation & Life-Logic Sync</Typography>
                    </Box>
                </Box>
                <Button 
                    variant="contained" onClick={() => setIsUnifiedZen(false)}
                    sx={{ bgcolor: COLORS.brand, fontWeight: 900, borderRadius: 50, px: 4 }}
                >
                    EXIT GOD-VIEW
                </Button>
            </Box>

            {/* 🧩 THE 4-PANEL GRID */}
            <Box sx={{ flex: 1, p: 2, overflow: 'hidden' }}>
                <Grid container spacing={2} sx={{ height: '100%' }}>
                    {/* TOP ROW: S & A */}
                    <Grid size={{ xs: 6 }} sx={{ height: '50%', display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ p: 2, flex: 1, bgcolor: 'white', borderRadius: 4, border: '1px solid rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                            <Typography sx={{ ...TYPE.label, mb: 1, color: '#FFB300' }}>S - SUBJECTIVE (HISTORY & CLIENT REPORT)</Typography>
                            <TextField 
                                multiline fullWidth 
                                value={soapData.subjective} onChange={(e) => updateSoap('subjective', e.target.value)}
                                placeholder="Narrative history..."
                                InputProps={{ disableUnderline: true, sx: { fontFamily: FONT, fontSize: '0.95rem', flex: 1, alignItems: 'flex-start' } }}
                                sx={{ flex: 1, '& .MuiInputBase-root': { height: '100%' } }}
                            />
                            
                            {/* 🧠 CLINICAL INSIGHT OVERLAY */}
                            {(() => {
                                const insight = KNOWLEDGE_BASE.find(k => k.keywords.some(kw => (soapData.subjective + " " + soapData.assessment).toLowerCase().includes(kw)));
                                if (!insight) return null;
                                return (
                                    <Box sx={{ position: 'absolute', bottom: 12, right: 12, left: 12, p: 1.5, bgcolor: 'rgba(25, 118, 210, 0.08)', borderRadius: 2, border: '1px solid rgba(25, 118, 210, 0.2)', display: 'flex', alignItems: 'center', gap: 1, animation: 'fadeIn 0.5s ease-out' }}>
                                        <AutoFixHighIcon sx={{ color: '#1976D2', fontSize: 16 }} />
                                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, color: '#1976D2' }}>{insight.suggestion}</Typography>
                                    </Box>
                                );
                            })()}
                        </Box>
                    </Grid>

                    <Grid size={{ xs: 6 }} sx={{ height: '50%', display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ p: 2, flex: 1, bgcolor: 'white', borderRadius: 4, border: '1px solid rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <Typography sx={{ ...TYPE.label, color: '#2E7D32' }}>A - ASSESSMENT (DIAGNOSIS & PROGNOSIS)</Typography>
                            <TextField 
                                multiline fullWidth 
                                value={soapData.assessment} onChange={(e) => updateSoap('assessment', e.target.value)}
                                placeholder="Clinical diagnosis..."
                                InputProps={{ disableUnderline: true, sx: { fontFamily: FONT, fontSize: '0.95rem', flex: 1, alignItems: 'flex-start', color: '#2E7D32', fontWeight: 600 } }}
                                sx={{ flex: 1, bgcolor: 'rgba(76, 175, 80, 0.02)', p: 1, borderRadius: 2 }}
                            />
                            {/* PROGNOSIS HUD INJECTED */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 2 }}>
                                <Typography variant="caption" sx={{ fontWeight: 900, color: COLORS.textMuted }}>PROGNOSIS:</Typography>
                                <Stack direction="row" spacing={0.5}>
                                    {['Excellent', 'Good', 'Guarded', 'Poor', 'Grave'].map(p => (
                                        <Chip 
                                            key={p} label={p} size="small"
                                            onClick={() => updateSoap('prognosis', p)}
                                            sx={{ 
                                                fontSize: '0.6rem', height: 20, fontWeight: 800, cursor: 'pointer',
                                                bgcolor: soapData.prognosis === p ? (p === 'Grave' || p === 'Poor' ? '#D32F2F' : COLORS.brand) : 'white',
                                                color: soapData.prognosis === p ? 'white' : 'inherit'
                                            }} 
                                        />
                                    ))}
                                </Stack>
                            </Box>
                        </Box>
                    </Grid>

                    {/* BOTTOM ROW: O & P */}
                    <Grid size={{ xs: 6 }} sx={{ height: '50%', display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ p: 2, flex: 1, bgcolor: 'white', borderRadius: 4, border: '1px solid rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Typography sx={{ ...TYPE.label, color: '#1976D2' }}>O - OBJECTIVE (EXAM & VITALS)</Typography>
                                {/* 🚥 MINI VITALS HUD (COLOR-CODED) */}
                                <Stack direction="row" spacing={2}>
                                    {[
                                        { label: 'Weight', val: soapData.objWeight, unit: 'kg' },
                                        { label: 'Temp', val: soapData.objTemp, crit: soapData.objTemp > 39.5 || soapData.objTemp < 37.5 },
                                        { label: 'HR', val: soapData.objHR, crit: soapData.objHR > 160 || soapData.objHR < 60 },
                                        { label: 'RR', val: soapData.objRR, crit: soapData.objRR > 40 }
                                    ].map(v => (
                                        <Box key={v.label} sx={{ textAlign: 'center' }}>
                                            <Typography variant="caption" sx={{ fontSize: '0.55rem', fontWeight: 900, color: COLORS.textMuted }}>{v.label.toUpperCase()}</Typography>
                                            <Typography variant="body2" sx={{ fontWeight: 900, color: v.crit ? '#D32F2F' : COLORS.brand }}>
                                                {v.val || '—'}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>
                            
                            <Box sx={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                <TextField 
                                    multiline fullWidth 
                                    value={soapData.objectiveNotes} onChange={(e) => updateSoap('objectiveNotes', e.target.value)}
                                    placeholder="Physical findings..."
                                    InputProps={{ disableUnderline: true, sx: { fontFamily: FONT, fontSize: '0.95rem', flex: 1, alignItems: 'flex-start' } }}
                                    sx={{ flex: 1 }}
                                />
                                {/* ⚡ WNL GOD-MODE MACRO */}
                                <Button 
                                    size="small" variant="outlined"
                                    onClick={() => updateSoap('objectiveNotes', 'PE: BAR. Hydration normal. Mucous membranes pink, CRT <2s. All peripheral lymph nodes palpate normal. Thoracic auscultation clear; no murmurs or arrhythmias. Lungs clear in all fields. Abdomen soft, non-painful. Plan: Routine care.')}
                                    sx={{ position: 'absolute', top: 0, right: 0, fontWeight: 900, fontSize: '0.6rem', py: 0, px: 1, borderRadius: 1.5, color: '#1976D2', border: '1px solid rgba(25, 118, 210, 0.3)' }}
                                >
                                    AUTO-FILL WNL
                                </Button>
                            </Box>

                            {/* BODY SCALES INJECTED */}
                            <Grid container spacing={2} sx={{ p: 1, bgcolor: '#FAF8F5', borderRadius: 2 }}>
                                <Grid size={{ xs: 6 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 900, fontSize: '0.6rem' }}>BCS: {soapData.bcs || 5}</Typography>
                                    <input type="range" min="1" max="9" step="1" value={soapData.bcs || 5} onChange={(e) => updateSoap('bcs', e.target.value)} style={{ width: '100%', accentColor: COLORS.brand }} />
                                </Grid>
                                <Grid size={{ xs: 6 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 900, fontSize: '0.6rem' }}>PAIN: {soapData.painScale || 0}</Typography>
                                    <input type="range" min="0" max="10" step="1" value={soapData.painScale || 0} onChange={(e) => updateSoap('painScale', e.target.value)} style={{ width: '100%', accentColor: COLORS.brand }} />
                                </Grid>
                            </Grid>
                        </Box>
                    </Grid>

                    <Grid size={{ xs: 6 }} sx={{ height: '50%', display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ p: 2, flex: 1, bgcolor: 'white', borderRadius: 4, border: '1px solid rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <Typography sx={{ ...TYPE.label, color: '#7B1FA2' }}>P - PLAN (TREATMENT & RECHECKS)</Typography>
                            <TextField 
                                multiline fullWidth 
                                value={soapData.plan} onChange={(e) => updateSoap('plan', e.target.value)}
                                placeholder="Treatment plan..."
                                InputProps={{ disableUnderline: true, sx: { fontFamily: FONT, fontSize: '0.95rem', flex: 1, alignItems: 'flex-start' } }}
                                sx={{ flex: 1 }}
                            />
                            {/* RECHECK HUD INJECTED */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 2 }}>
                                <Typography variant="caption" sx={{ fontWeight: 900, color: '#2E7D32' }}>RECHECK IN:</Typography>
                                <Stack direction="row" spacing={0.5}>
                                    {['Next Week', '2 Weeks', '1 Month', 'PRN', 'Finalized'].map(w => (
                                        <Chip 
                                            key={w} label={w} size="small"
                                            onClick={() => updateSoap('recheckIn', w)}
                                            sx={{ 
                                                fontSize: '0.6rem', height: 20, fontWeight: 800, cursor: 'pointer',
                                                bgcolor: soapData.recheckIn === w ? '#2E7D32' : 'white',
                                                color: soapData.recheckIn === w ? 'white' : 'inherit'
                                            }} 
                                        />
                                    ))}
                                </Stack>
                            </Box>
                        </Box>
                    </Grid>
                </Grid>
            </Box>
        </Box>
      </Dialog>
    </Box>
  </Dialog>
);
}
