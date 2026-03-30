import React, { useState, useEffect, useRef } from 'react';
import { 
  Dialog, Slide, AppBar, Toolbar, IconButton, Typography, Button, 
  Box, Paper, Avatar, Chip, TextField, FormControl, InputLabel, 
  Select, MenuItem, List, ListItemText, ListSubheader, Grid, // MUI v6 Grid
  Stack, Divider, Collapse, Tooltip, InputBase, alpha
} from '@mui/material';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer 
} from 'recharts';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import MedicationIcon from '@mui/icons-material/Medication';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import WarningIcon from '@mui/icons-material/Warning';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import FavoriteIcon from '@mui/icons-material/Favorite';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import SaveIcon from '@mui/icons-material/Save';
import SearchIcon from '@mui/icons-material/Search';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import VisibilityIcon from '@mui/icons-material/Visibility';
import MedicalInformationIcon from '@mui/icons-material/MedicalInformation';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import InfoIcon from '@mui/icons-material/Info';
import CalculateIcon from '@mui/icons-material/Calculate';
import BoltIcon from '@mui/icons-material/Bolt';
import RoomIcon from '@mui/icons-material/Room';
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

  // THE FIX: Clean, semantic department identification!
  const patientDepartment = patient?.serviceCategory || 'General';
  const isGrooming = patientDepartment.toLowerCase().includes('grooming');

  const [soapData, setSoapData] = useState({
    subjective: '', objWeight: '', objTemp: '', objHR: '', objRR: '', objCRT: '', objBCS: '', objPain: '', objectiveNotes: '',
    assessment: '', patientStatus: 'Stable', plan: '', nextVisit: ''
  });
  const[assistiveText, setAssistiveText] = useState('');

  // THE FIX: Dedicated Grooming State
  const [groomingData, setGroomingData] = useState({
    coatCondition: 'Normal', parasites: 'None', temperament: 'Calm', notes: ''
  });
  
  const [rxCart, setRxCart] = useState([]);
  const[selectedRxItem, setSelectedRxItem] = useState('');

  // --- 🆕 PILLAR NAVIGATION REFS ---
  const soapRef = useRef(null);
  const groomingRef = useRef(null);
  const treatmentRef = useRef(null);
  const diagnosticsRef = useRef(null);
  const dischargeRef = useRef(null);

  const [activeHighlight, setActiveHighlight] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedModule, setFocusedModule] = useState(null); // HUD Focus state
  const [selectedSite, setSelectedSite] = useState(null); 
  const [calcDose, setCalcDose] = useState(''); 
  const [calcConc, setCalcConc] = useState(''); 
  const [calcResult, setCalcResult] = useState(0); 

  // --- 🆕 ADAPTIVE TOOLBELT STATE ---
  const [fluidDehydration, setFluidDehydration] = useState(0); // %
  const [fluidLoss, setFluidLoss] = useState(0); // mL
  const [fluidResult, setFluidResult] = useState(0); // mL/day
  const [surgicalChecklist, setSurgicalChecklist] = useState({ preOpExam: false, equipmentOk: false, spongeCount: false, postOpVitals: false });
  const [groomingSpecs, setGroomingSpecs] = useState({ bladeNumber: '10', coatTexture: 'Normal', stylingNotes: '' });

  const jumpToSection = (sectionId, ref) => {
    setActiveHighlight(sectionId);
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setActiveHighlight(null), 3000); // Reset highlight after 3s
  };

  const navItems = [
    { label: 'SOAP', ref: soapRef, id: 'soap' },
    (!isGrooming ? null : { label: 'Grooming', ref: groomingRef, id: 'grooming' }),
    { label: 'Treatment', ref: treatmentRef, id: 'treatment' },
    { label: 'Diagnostics', ref: diagnosticsRef, id: 'diagnostics' },
    { label: 'Discharge', ref: dischargeRef, id: 'discharge' },
  ].filter(Boolean);

  const deptObj = (departments ||[]).find(d => d.name === patientDepartment);
  const badgeColor = deptObj ? deptObj.color : COLORS.brand;

  const glassStyle = {
    background: 'rgba(255, 255, 255, 0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', 
    border: '1px solid rgba(255, 255, 255, 0.9)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.05)', borderRadius: 4, 
  };

  // --- 1. INITIALIZATION & AUTO-BUNDLE ENGINE ---
  useEffect(() => {
    const fetchPatientContext = async () => {
      if (open && patient) {
        setIsDirty(false);
        setAssistiveText('');
        
        if (isGrooming) {
            setGroomingData({ 
                coatCondition: 'Normal', parasites: 'None', temperament: 'Calm', 
                notes: patient.notes && patient.notes !== 'Walk-in client' ? `Client Request: ${patient.notes}\n` : '' 
            });
        } else {
            setSoapData({
                subjective: patient.notes && patient.notes !== 'Walk-in client' && !patient.notes.includes('QUICK ADMIT') ? `Client noted: "${patient.notes}"\n\n` : '',
                objWeight: '', objTemp: '', objHR: '', objRR: '', objCRT: '', objBCS: '', objPain: '', objectiveNotes: '',
                assessment: '', patientStatus: 'Stable', plan: '', nextVisit: ''
            });
        }

        let initialCart =[];
        const baseService = servicesList.find(s => s.name === patient.serviceType);
        
        initialCart.push({
            type: 'service', id: 'base_service', name: patient.serviceType, 
            price: patient.servicePrice || 0, qty: 1, isDrug: false, isBase: true 
        });

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

            // FETCH RECORDS FOR TRENDS
            const q = query(collection(db, "medical_records"), where("petId", "==", patient.petId), orderBy("date", "desc"));
            const snapshot = await getDocs(q);
            const historyData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
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
            
            // THE FIX: Set prevVitals for the % change calculation
            if (historyData.length > 0) {
              setPrevVitals(historyData[0].vitals || null);
            } else {
              setPrevVitals(null);
            }

             // Upcoming
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
  },[open, patient, isGrooming]);

  // --- 2. HANDLERS ---
  const handlePushDoseToCart = () => {
    if (calcResult <= 0) return alert("Calculate a valid dose first.");
    const drugIdx = rxCart.findIndex(i => i.isDrug);
    if (drugIdx === -1) return alert("Please add the medication to the Treatment Plan first.");
    
    const newCart = [...rxCart];
    newCart[drugIdx].qty = parseFloat(calcResult.toFixed(2));
    setRxCart(newCart);
    alert(`Pushed ${calcResult.toFixed(2)}mL to Treatment Plan!`);
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

  const updateSurgical = (field) => setSurgicalChecklist(prev => ({ ...prev, [field]: !prev[field] }));
  const updateGroomingSpec = (field, value) => { setGroomingSpecs(prev => ({ ...prev, [field]: value })); setIsDirty(true); };

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
      updateSoap('objectiveNotes', "General Appearance: WNL\nEENT: WNL\nCardiovascular: WNL\nRespiratory: WNL\nGastrointestinal: WNL\nMusculoskeletal: WNL\nIntegumentary (Skin): WNL\nLymph Nodes: WNL\nNeurological: WNL\nUrogenital: WNL");
      
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
      if (p) itemObj = { type: 'product', id: p.id, name: p.itemName, price: p.price, qty: 1, isDrug: p.category==='Medicine' || p.category==='Vaccine', instructions: '' };
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
    const newCart =[...rxCart];
    newCart[index].instructions = text;
    setRxCart(newCart);
    setIsDirty(true);
  };

  // --- 4. SAVE LOGIC ---
  const hasDrugsInCart = rxCart.some(item => item.isDrug);
  const nextRouteStatus = hasDrugsInCart ? "dispensing" : "billing";
  const saveBtnText = hasDrugsInCart ? "Sign & Send to Pharmacy" : "Sign & Send to Cashier";

  const handleSaveConsult = async () => {
    if (!isGrooming && (!soapData.assessment || !soapData.plan)) {
        return alert("Assessment and Plan are required for legal medical documentation.");
    }
    if (isGrooming && !groomingData.notes) {
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
        recordType: isGrooming ? 'grooming' : 'medical',
        diagnosis: isGrooming ? 'Grooming Services' : soapData.assessment || "Clinical Visit", 
        treatment: isGrooming ? groomingData.notes : soapData.plan, 
        soap: isGrooming ? null : {
            subjective: soapData.subjective,
            objective: soapData.objectiveNotes,
            assessment: soapData.assessment,
            plan: soapData.plan
        }, 
        vitals: isGrooming ? null : { 
            weight: soapData.objWeight, temp: soapData.objTemp, hr: soapData.objHR, 
            rr: soapData.objRR, crt: soapData.objCRT, bcs: soapData.objBCS, pain: soapData.objPain 
        },
        injectionSite: selectedSite,
        surgicalSafetyAudit: surgicalChecklist,
        fluidPlanTotal: fluidResult,
        groomingTechnicalSpecs: isGrooming ? groomingSpecs : null,
        diagnostics: isGrooming ? null : "Clinical documentation via Bento Workspace", 
        dischargeInstructions: isGrooming ? null : `Follow-up: ${soapData.nextVisit || 'PRN'}. Instructions based on Plan.`,
        patientStatus: isGrooming ? 'Stable' : soapData.patientStatus, 
        nextVisit: soapData.nextVisit ? Timestamp.fromDate(new Date(soapData.nextVisit)) : null, 
      });

      // 2. CREATE FINANCIAL TRANSACTION (CASHIER LEDGER)
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
            isDrug: item.isDrug
        })),
        totalAmount: visitTotal,
        paymentStatus: 'pending',
        type: 'consultation_billing',
        processedBy: vetName
      });

      // 3. PROPAGATE VITALS TO PET PROFILE (DASHBOARD TRENDS)
      if (patient.petId && patient.petId !== "WALK_IN_PET") {
          await updateDoc(doc(db, "pets", patient.petId), {
              "lastVitals.weight": soapData.objWeight || null,
              "lastVitals.temp": soapData.objTemp || null,
              "lastVitals.hr": soapData.objHR || null,
              "lastVitals.rr": soapData.objRR || null,
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
  if (!isGrooming && soapData.patientStatus === 'Critical') headerColor = '#D32F2F'; 
  else if (!isGrooming && soapData.patientStatus === 'Guarded') headerColor = '#F57C00'; 

  return (
    <Dialog fullScreen open={open} onClose={handleCloseRequest} TransitionComponent={Transition} PaperProps={{ sx: { bgcolor: '#FDFCFB' }}}>
      
      {/* ═══ STICKY PATIENT BANNER (CRM STYLE) ═══ */}
      <Box sx={{ bgcolor: COLORS.banner, borderBottom: `2px solid ${COLORS.bannerBorder}`, display: 'flex', alignItems: 'center', flexShrink: 0, boxShadow: '0 1px 4px rgba(62,39,35,0.08)', zIndex: 10 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', py: 1, px: 2, gap: 2, flex: 1 }}>
          <IconButton onClick={handleCloseRequest} size="small" sx={{ color: COLORS.textMuted, bgcolor: 'rgba(0,0,0,0.05)', '&:hover': { bgcolor: '#EFEBE9' } }}>
            <CloseIcon fontSize="small" />
          </IconButton>
          
          <Avatar sx={{ width: 44, height: 44, fontFamily: FONT, bgcolor: getInitialColor(patient?.petName), fontWeight: 700, fontSize: '1.1rem', color: '#FFF', border: `2px solid ${badgeColor}` }}>
            {(patient?.petName || '?')[0].toUpperCase()}
          </Avatar>

          <Box sx={{ minWidth: 200, flexShrink: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
              <Typography sx={{ fontFamily: FONT, fontSize: '1.2rem', fontWeight: 900, color: COLORS.brand, textTransform: 'capitalize' }}>{patient?.petName}</Typography>
              <Chip label={patient?.serviceType} size="small" sx={{ bgcolor: `${badgeColor}15`, color: badgeColor, fontWeight: 900, fontSize: '0.65rem', height: 20, border: `1px solid ${badgeColor}40` }} />
            </Box>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700, color: COLORS.textSecondary, mt: 0.25 }}>
               {petDetails?.gender === 'Female' ? 'FS' : 'MN'} • {calculateAge(petDetails?.dob)} • {patient?.petSpecies}{petDetails?.breed ? `, ${petDetails.breed}` : ''}
            </Typography>
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
                    {item.label === 'SOAP' && <HistoryEduIcon sx={{ fontSize: 18 }} />}
                    {item.label === 'Grooming' && <VisibilityIcon sx={{ fontSize: 18 }} />}
                    {item.label === 'Treatment' && <MedicalInformationIcon sx={{ fontSize: 18 }} />}
                    {item.label === 'Diagnostics' && <LocalHospitalIcon sx={{ fontSize: 18 }} />}
                    {item.label === 'Discharge' && <ExitToAppIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </Tooltip>
              ))}
            </Stack>
          </Paper>

          <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
             <Button variant="contained" onClick={handleSaveConsult} disabled={loading} startIcon={<SaveIcon />} sx={{ bgcolor: COLORS.brand, fontWeight: '900', borderRadius: 2, px: 3 }}>
                {loading ? "Saving..." : saveBtnText}
             </Button>
          </Stack>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }} className="hud-canvas">
        
        {/* ── LEFT: DOCUMENTATION CANVAS (70%) ── */}
        <Box sx={{ flex: 7, overflowY: 'auto', p: 3, transition: 'all 0.5s ease', '&::-webkit-scrollbar': { width: 5 }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.timelineRail, borderRadius: 10 } }}>
            <Grid container spacing={3} sx={{ pb: 3, alignItems: 'stretch' }}>
            
            <Grid size={{ xs: 12, lg: 6 }} sx={{ display: 'flex' }}>
            {/* MODULE 1: CLINICAL / SOAP */}
            {!isGrooming && (
                <Paper 
                    ref={soapRef}
                    className={`${activeHighlight === 'soap' ? 'highlight-module' : ''} elevate-module ${focusedModule && focusedModule !== 'soap' ? 'dim-overlay' : ''}`}
                    sx={{ ...glassStyle, p: 3, borderLeft: `8px solid ${badgeColor}`, transition: 'all 0.4s ease' }}
                >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                        <Typography variant="h5" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.brand, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <MedicalServicesIcon /> Clinical Documentation (S.O.A.P.)
                        </Typography>
                        <Stack direction="row" spacing={1}>
                            <Button size="small" variant="outlined" onClick={() => applyTemplate('vaccine')} sx={{ fontWeight: 800, textTransform: 'none', borderRadius: 2 }}>Vaccine Template</Button>
                            <Button size="small" variant="outlined" onClick={() => applyTemplate('wnl')} sx={{ fontWeight: 800, textTransform: 'none', borderRadius: 2 }}>Auto-Fill WNL</Button>
                        </Stack>
                    </Box>

                    <Grid container spacing={3}>
                        <Grid size={{ xs: 12 }}>
                            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 1 }}>S - SUBJECTIVE (History & Client Report)</Typography>
                            <TextField 
                              multiline rows={3} fullWidth 
                              value={soapData.subjective} 
                              onChange={(e) => updateSoap('subjective', e.target.value)} 
                              onFocus={() => setFocusedModule('soap')}
                              onBlur={() => setFocusedModule(null)}
                              placeholder="Enter history, symptoms, and client concerns..." 
                              sx={{ bgcolor: 'white', borderRadius: 2 }} 
                            />
                        </Grid>

                        <Grid size={{ xs: 12 }}>
                            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 1.5 }}>O - OBJECTIVE (Examination & Vitals)</Typography>
                            <Box sx={{ bgcolor: '#FAF8F5', p: 2, borderRadius: 2, border: `1px solid ${COLORS.borderLight}` }}>
                                <Grid container spacing={2}>
                                    <Grid size={{ xs: 4, md: 2 }}><TextField label="Wt (kg)" size="small" value={soapData.objWeight} onChange={(e) => updateSoap('objWeight', e.target.value)} InputProps={{ sx: { fontWeight: 900, color: COLORS.brand } }} /></Grid>
                                    <Grid size={{ xs: 4, md: 2 }}><TextField label="Temp (°C)" size="small" value={soapData.objTemp} onChange={(e) => updateSoap('objTemp', e.target.value)} error={parseFloat(soapData.objTemp) > 39.2} /></Grid>
                                    <Grid size={{ xs: 4, md: 2 }}><TextField label="HR (bpm)" size="small" value={soapData.objHR} onChange={(e) => updateSoap('objHR', e.target.value)} /></Grid>
                                    <Grid size={{ xs: 4, md: 2 }}><TextField label="RR (rpm)" size="small" value={soapData.objRR} onChange={(e) => updateSoap('objRR', e.target.value)} /></Grid>
                                    <Grid size={{ xs: 4, md: 2 }}><TextField label="CRT (sec)" size="small" value={soapData.objCRT} onChange={(e) => updateSoap('objCRT', e.target.value)} /></Grid>
                                    <Grid size={{ xs: 4, md: 2 }}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel>Status</InputLabel>
                                            <Select value={soapData.patientStatus} label="Status" onChange={(e) => updateSoap('patientStatus', e.target.value)}>
                                                <MenuItem value="Stable">🟢 Stable</MenuItem>
                                                <MenuItem value="Guarded">🟡 Guarded</MenuItem>
                                                <MenuItem value="Critical">🔴 Critical</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                </Grid>
                            </Box>
                            <TextField 
                              multiline rows={4} fullWidth 
                              value={soapData.objectiveNotes} 
                              onChange={(e) => updateSoap('objectiveNotes', e.target.value)} 
                              onFocus={() => setFocusedModule('soap')}
                              onBlur={() => setFocusedModule(null)}
                              placeholder="Describe physical findings (MM, Lungs, Heart, Palpation)..." 
                              sx={{ mt: 2, bgcolor: 'white', borderRadius: 2 }} 
                            />
                        </Grid>

                        <Grid size={{ xs: 12 }}>
                           <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                                <Button variant="contained" onClick={runAssistiveDiagnosis} startIcon={<AutoFixHighIcon/>} sx={{ bgcolor: `${COLORS.accentLight}15`, color: COLORS.accent, fontWeight: 900, borderRadius: 20, px: 4, border: `1px solid ${COLORS.accentLight}40`, boxShadow: 'none' }}>
                                    Run Clinical Support Check (Beta)
                                </Button>
                           </Box>
                           {assistiveText && (
                                <Box sx={{ bgcolor: '#F1F8E9', p: 2, borderRadius: 2, borderLeft: '4px solid #2E7D32', mb: 2 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 900, color: '#2E7D32', display: 'flex', alignItems: 'center', gap: 0.5 }}><LocalHospitalIcon sx={{fontSize: 14}}/> AI ASSISTANT SUGGESTION</Typography>
                                    <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>{assistiveText}</Typography>
                                </Box>
                           )}
                           <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 1 }}>A - ASSESSMENT (Diagnosis)</Typography>
                           <TextField fullWidth value={soapData.assessment} onChange={(e) => updateSoap('assessment', e.target.value)} placeholder="What is your diagnosis?" sx={{ bgcolor: 'white', borderRadius: 2 }} />
                        </Grid>

                        <Grid size={{ xs: 12 }}>
                           <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 1 }}>P - PLAN (Treatment Instructions)</Typography>
                           <TextField 
                             multiline rows={4} fullWidth 
                             value={soapData.plan} 
                             onChange={(e) => updateSoap('plan', e.target.value)} 
                             onFocus={() => setFocusedModule('soap')}
                             onBlur={() => setFocusedModule(null)}
                             placeholder="Procedures performed, internal notes, and doctor instructions..." 
                             sx={{ bgcolor: 'white', borderRadius: 2 }} 
                           />
                        </Grid>
                    </Grid>
                </Paper>
            )}
            </Grid>

            {/* MODULE 2: GROOMING & HYGIENE (Side-by-side with SOAP) */}
            <Grid size={{ xs: 12, lg: 6 }} sx={{ display: 'flex' }}>
            <Paper 
                ref={groomingRef}
                className={`${activeHighlight === 'grooming' ? 'highlight-module' : ''} elevate-module ${focusedModule && focusedModule !== 'grooming' ? 'dim-overlay' : ''}`}
                sx={{ ...glassStyle, p: 3, borderLeft: `8px solid ${isGrooming ? badgeColor : '#795548'}`, transition: 'all 0.4s ease', flex: 1, display: 'flex', flexDirection: 'column' }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <ContentCutIcon sx={{ color: isGrooming ? badgeColor : '#795548' }} />
                    <Typography variant="h6" fontWeight={900} color="#3E2723">Grooming & Aesthetic Notes</Typography>
                    {!isGrooming && <Chip label="Optional" size="small" sx={{ ml: 1, fontWeight: 900, height: 20, fontSize: '0.6rem' }} />}
                </Box>
                
                <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid size={{ xs: 3 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel>Blade #</InputLabel><Select value={groomingSpecs.bladeNumber} label="Blade #" onChange={(e) => updateGroomingSpec('bladeNumber', e.target.value)}><MenuItem value="10">#10 (Standard)</MenuItem><MenuItem value="7">#7 (Short)</MenuItem><MenuItem value="4">#4 (Longer)</MenuItem><MenuItem value="FC">FC (Finish)</MenuItem></Select></FormControl></Grid>
                    <Grid size={{ xs: 3 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel>Texture</InputLabel><Select value={groomingSpecs.coatTexture} label="Texture" onChange={(e) => updateGroomingSpec('coatTexture', e.target.value)}><MenuItem value="Normal">Normal</MenuItem><MenuItem value="Matted">Matted</MenuItem><MenuItem value="Silky">Silky</MenuItem><MenuItem value="Wiry">Wiry</MenuItem></Select></FormControl></Grid>
                    <Grid size={{ xs: 3 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel>Parasites</InputLabel><Select value={groomingData.parasites} label="Parasites" onChange={(e) => updateGrooming('parasites', e.target.value)}><MenuItem value="None">None</MenuItem><MenuItem value="Fleas">Fleas</MenuItem><MenuItem value="Ticks">Ticks</MenuItem></Select></FormControl></Grid>
                    <Grid size={{ xs: 3 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel>Temperament</InputLabel><Select value={groomingData.temperament} label="Temperament" onChange={(e) => updateGrooming('temperament', e.target.value)} onFocus={() => setFocusedModule('grooming')} onBlur={() => setFocusedModule(null)}><MenuItem value="Calm">Calm</MenuItem><MenuItem value="Anxious">Anxious</MenuItem><MenuItem value="Aggressive">Aggressive</MenuItem></Select></FormControl></Grid>
                </Grid>
                <TextField 
                  multiline rows={isGrooming ? 10 : 3} fullWidth 
                  value={groomingData.notes} 
                  onChange={(e) => updateGrooming('notes', e.target.value)} 
                  onFocus={() => setFocusedModule('grooming')}
                  onBlur={() => setFocusedModule(null)}
                  placeholder="Skin condition, styling requests..." 
                  sx={{ bgcolor: 'white', borderRadius: 2, flex: 1 }} 
                />
            </Paper>
            </Grid>

            <Grid size={{ xs: 12, lg: 6 }} sx={{ display: 'flex' }}>
            {/* MODULE 3: TREATMENT PLAN & RX (UNIFIED) */}
            <Paper 
                ref={treatmentRef}
                className={`${activeHighlight === 'treatment' ? 'highlight-module' : ''} elevate-module ${focusedModule && focusedModule !== 'treatment' ? 'dim-overlay' : ''}`}
                sx={{ ...glassStyle, p: 3, borderLeft: `8px solid ${COLORS.accent}`, transition: 'all 0.4s ease' }}
            >
                <Typography variant="h6" fontWeight={900} color="#3E2723" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ReceiptLongIcon sx={{ color: COLORS.accent }} /> Treatment Plan & E-Prescribe
                </Typography>
                <Typography variant="caption" color="textSecondary" sx={{ mb: 2, display: 'block', fontWeight: 800 }}>Search and link billing items or medications to this visit.</Typography>
                
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
                    {rxCart.map((rx, idx) => (
                        <Box key={idx} sx={{ display: 'flex', flexDirection: 'column', bgcolor: rx.isBase ? `${COLORS.accentLight}10` : 'white', p: 1.5, borderRadius: 2, border: `1px solid ${rx.isBase ? COLORS.accentLight : COLORS.borderLight}`, boxShadow: '0 2px 6px rgba(0,0,0,0.01)' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
                                <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 900, color: rx.isDrug ? COLORS.rxText : COLORS.brand, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {rx.isDrug && <MedicationIcon sx={{ fontSize: 14 }}/>} {rx.name}
                                </Typography>
                                {!rx.isBase && !rx.isAutoBundled && <IconButton size="small" color="error" onClick={()=>handleRemoveRx(idx)} sx={{width: 24, height: 24}}><CloseIcon sx={{fontSize: 14}}/></IconButton>}
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 900, color: COLORS.textSecondary }}>₱{rx.price}</Typography>
                                {rx.isBase && <Chip label="BASE" size="small" sx={{ height: 14, fontSize: '0.5rem', fontWeight: 900, bgcolor: COLORS.brand, color: 'white' }} />}
                            </Box>
                            {rx.isDrug && (
                                <TextField 
                                    fullWidth size="small" variant="standard" 
                                    placeholder="Sig: 1 tab BID..." 
                                    value={rx.instructions || ''} 
                                    onChange={(e) => handleUpdateRxSig(idx, e.target.value)} 
                                    InputProps={{ style: { fontSize: '0.75rem', color: '#B45309', fontWeight: 700 } }} 
                                />
                            )}
                        </Box>
                    ))}
                </Stack>
            </Paper>
            </Grid>

            <Grid size={{ xs: 12, lg: 6 }} sx={{ display: 'flex' }}>
            {/* MODULE 4: DIAGNOSTICS & LABS (NEW PILAR) */}
            <Paper 
                ref={diagnosticsRef}
                className={`${activeHighlight === 'diagnostics' ? 'highlight-module' : ''} elevate-module ${focusedModule && focusedModule !== 'diagnostics' ? 'dim-overlay' : ''}`}
                sx={{ ...glassStyle, p: 3, borderLeft: '8px solid #1976D2', transition: 'all 0.4s ease', flex: 1, display: 'flex', flexDirection: 'column' }}
            >
                <Typography variant="h6" fontWeight={900} color="#3E2723" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LocalHospitalIcon sx={{ color: '#1976D2' }} /> Diagnostics & Lab Findings
                </Typography>
                <Typography variant="caption" color="textSecondary" sx={{ mb: 2, display: 'block', fontWeight: 800 }}>Enter lab summaries, bloodwork results, or imaging observations.</Typography>
                <TextField 
                  multiline rows={3} fullWidth 
                  onFocus={() => setFocusedModule('diagnostics')}
                  onBlur={() => setFocusedModule(null)}
                  placeholder="Bloodwork findings..." 
                  sx={{ bgcolor: 'white', borderRadius: 2, flex: 1 }} 
                />
            </Paper>
            </Grid>

            <Grid size={{ xs: 12, lg: 6 }} sx={{ display: 'flex' }}>
            {/* MODULE 5: DISCHARGE & FOLLOW-UP (NEW PILAR) */}
            <Paper 
                ref={dischargeRef}
                className={`${activeHighlight === 'discharge' ? 'highlight-module' : ''} elevate-module ${focusedModule && focusedModule !== 'discharge' ? 'dim-overlay' : ''}`}
                sx={{ ...glassStyle, p: 3, borderLeft: '8px solid #2E7D32', transition: 'all 0.4s ease', flex: 1, display: 'flex', flexDirection: 'column' }}
            >
                <Typography variant="h6" fontWeight={900} color="#3E2723" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ExitToAppIcon sx={{ color: '#2E7D32' }} /> Discharge & Follow-up
                </Typography>
                <Typography variant="caption" color="textSecondary" sx={{ mb: 2, display: 'block', fontWeight: 800 }}>Generate final take-home instructions and schedule the next visit.</Typography>
                <Box sx={{ bgcolor: '#F1F8E9', p: 2, borderRadius: 2, mb: 1, border: '1px solid #C8E6C9' }}>
                    <Typography variant="caption" fontWeight={900} color="#2E7D32">Take Home Preview:</Typography>
                    <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic', color: '#1B5E20' }}>
                        {soapData.plan || "Instructions will populate from the 'Plan' section."}
                    </Typography>
                </Box>
                <TextField 
                  select label="Next Visit Follow-up" size="small" fullWidth 
                  value={soapData.nextVisit} 
                  onChange={(e)=>updateSoap('nextVisit', e.target.value)}
                  onFocus={() => setFocusedModule('discharge')}
                  onBlur={() => setFocusedModule(null)}
                  sx={{ bgcolor: 'white', mt: 'auto' }}
                >
                    <MenuItem value="1 week">In 1 week</MenuItem>
                    <MenuItem value="2 weeks">In 2 weeks</MenuItem>
                    <MenuItem value="1 month">In 1 month</MenuItem>
                    <MenuItem value="none">PRN (As needed)</MenuItem>
                </TextField>
            </Paper>
            </Grid>

            {/* MODULE 6: STAFF PRIVATE NOTES (Symmetry Filler / Flex) */}
            <Grid size={{ xs: 12, lg: 6 }} sx={{ display: 'flex' }}>
            <Paper 
                className={`elevate-module ${focusedModule && focusedModule !== 'internal' ? 'dim-overlay' : ''}`}
                sx={{ ...glassStyle, p: 3, borderLeft: '8px solid #546E7A', transition: 'all 0.4s ease', flex: 1, display: 'flex', flexDirection: 'column' }}
            >
                <Typography variant="h6" fontWeight={900} color="#3E2723" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <InfoIcon sx={{ color: '#546E7A' }} /> Internal Context & Logs
                </Typography>
                <Typography variant="caption" color="textSecondary" sx={{ mb: 2, display: 'block', fontWeight: 800 }}>Non-clinical staff-only notes regarding client behavior or billing.</Typography>
                <TextField 
                    multiline rows={5} fullWidth 
                    onFocus={() => setFocusedModule('internal')}
                    onBlur={() => setFocusedModule(null)}
                    placeholder="E.g. Client requested a detailed receipt; behavior was combative..." 
                    sx={{ bgcolor: 'white', borderRadius: 2, flex: 1 }} 
                />
            </Paper>
            </Grid>

            {/* MODULE 7: CLINICAL DOSE CALCULATOR (NEW) */}
            <Grid size={{ xs: 12, lg: 6 }} sx={{ display: 'flex' }}>
            <Paper 
                className={`elevate-module ${focusedModule && focusedModule !== 'calc' ? 'dim-overlay' : ''}`}
                sx={{ ...glassStyle, p: 3, borderLeft: '8px solid #FF8F00', flex: 1, display: 'flex', flexDirection: 'column' }}
            >
                <Typography variant="h6" fontWeight={900} color="#3E2723" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CalculateIcon sx={{ color: '#FF8F00' }} /> Precision Dose Math
                </Typography>
                <Typography variant="caption" color="textSecondary" sx={{ mb: 2, display: 'block', fontWeight: 800 }}>Weight-based calculation for injectable medications.</Typography>
                
                <Box sx={{ bgcolor: '#FFF8E1', p: 2, borderRadius: 2, mb: 2, border: '1px solid #FFE082', display: 'flex', justifyContent: 'center' }}>
                    <Typography variant="h4" fontWeight={900} color="#FF8F00" sx={{ letterSpacing: -1 }}>
                        {calcResult > 0 ? `${calcResult.toFixed(2)} mL` : '0.00 mL'}
                    </Typography>
                </Box>

                <Grid container spacing={1}>
                    <Grid size={{ xs: 6 }}>
                        <TextField 
                            label="Dose (mg/kg)" size="small" fullWidth type="number"
                            value={calcDose} onChange={(e) => setCalcDose(e.target.value)}
                            onFocus={() => setFocusedModule('calc')} onBlur={() => setFocusedModule(null)}
                        />
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                        <TextField 
                            label="Conc (mg/mL)" size="small" fullWidth type="number"
                            value={calcConc} onChange={(e) => setCalcConc(e.target.value)}
                            onFocus={() => setFocusedModule('calc')} onBlur={() => setFocusedModule(null)}
                        />
                    </Grid>
                </Grid>

                <Button 
                    variant="contained" fullWidth 
                    onClick={handlePushDoseToCart}
                    sx={{ mt: 'auto', bgcolor: '#FF8F00', fontWeight: 900, borderRadius: 2 }}
                    startIcon={<BoltIcon />}
                >
                    Push to Treatment Plan
                </Button>
            </Paper>
            </Grid>

            {/* MODULE 8: INJECTION SITE MAPPING (NEW) */}
            <Grid size={{ xs: 12, lg: 6 }} sx={{ display: 'flex' }}>
            <Paper 
                className={`elevate-module ${focusedModule && focusedModule !== 'site' ? 'dim-overlay' : ''}`}
                sx={{ ...glassStyle, p: 3, borderLeft: '8px solid #9C27B0', flex: 1, display: 'flex', flexDirection: 'column' }}
            >
                <Typography variant="h6" fontWeight={900} color="#3E2723" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <RoomIcon sx={{ color: '#9C27B0' }} /> Injection Site Map
                </Typography>
                <Typography variant="caption" color="textSecondary" sx={{ mb: 2, display: 'block', fontWeight: 800 }}>Maintain medical integrity (RR, LR, RF, LF, SC)</Typography>
                
                <Box sx={{ flex: 1, display: 'flex', position: 'relative', justifyContent: 'center', py: 2 }}>
                    <svg width="220" height="120" viewBox="0 0 200 120">
                        {/* PET SILHOUETTE (ADAPTIVE) */}
                        {patient.petSpecies === 'Feline' ? (
                            <path d="M50,80 Q40,60 60,40 Q90,30 130,40 Q160,50 160,80 Q150,100 130,90 Q90,100 50,80" fill="#EEEEEE" stroke="#BDBDBD" strokeWidth="2" />
                        ) : (
                            <path d="M40,60 Q50,30 150,40 Q180,50 180,80 Q180,110 160,110 Q140,110 130,80 Q40,90 20,80 Q10,70 40,60" fill="#EEEEEE" stroke="#BDBDBD" strokeWidth="2" />
                        )}
                        
                        {[
                            { id: 'RR', cx: 160, cy: 90 },
                            { id: 'LR', cx: 140, cy: 100 },
                            { id: 'RF', cx: 60, cy: 90 },
                            { id: 'LF', cx: 40, cy: 95 },
                            { id: 'SC', cx: 80, cy: 50 }
                        ].map(site => (
                            <g key={site.id} cursor="pointer" onClick={() => setSelectedSite(site.id)}>
                                <circle cx={site.cx} cy={site.cy} r="10" fill={selectedSite === site.id ? '#9C27B0' : 'white'} stroke="#9C27B0" strokeWidth="2" />
                                <text x={site.cx} y={site.cy + 3} textAnchor="middle" fontSize="6" fontWeight="bold" fill={selectedSite === site.id ? 'white' : '#9C27B0'}>{site.id}</text>
                            </g>
                        ))}
                    </svg>
                </Box>
                <Box sx={{ textAlign: 'center', pt: 1 }}>
                    <Typography variant="caption" fontWeight={900} color="#9C27B0">
                        {selectedSite ? `SELECTED: ${selectedSite}` : "PLEASE SELECT A SITE"}
                    </Typography>
                </Box>
            </Paper>
            </Grid>

            {/* MODULE 9: SURGICAL SAFETY & PROTOCOLS (NEW - AUDIT READY) */}
            <Grid size={{ xs: 12, lg: 6 }} sx={{ display: 'flex' }}>
            <Paper 
                className={`elevate-module ${focusedModule && focusedModule !== 'surgery' ? 'dim-overlay' : ''}`}
                sx={{ ...glassStyle, p: 3, borderLeft: '8px solid #D32F2F', flex: 1, display: 'flex', flexDirection: 'column' }}
            >
                <Typography variant="h6" fontWeight={900} color="#3E2723" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningIcon sx={{ color: '#D32F2F' }} /> Surgical Safety Audit
                </Typography>
                <Typography variant="caption" color="textSecondary" sx={{ mb: 2, display: 'block', fontWeight: 800 }}>MANDATORY checklist for operative procedures.</Typography>
                
                <Stack spacing={1} sx={{ bgcolor: '#FFEBEE', p: 1.5, borderRadius: 2 }}>
                    {[
                        { id: 'preOpExam', label: 'Pre-operative Physical Exam Complete' },
                        { id: 'equipmentOk', label: 'Anesthesia Machine/Monitoring Calibrated' },
                        { id: 'spongeCount', label: 'Sponge & Needle Count Initialized' },
                        { id: 'postOpVitals', label: 'Post-op Recovery Monitor Assigned' }
                    ].map(task => (
                        <Box key={task.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => updateSurgical(task.id)}>
                            <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #D32F2F', bgcolor: surgicalChecklist[task.id] ? '#D32F2F' : 'white', flexShrink: 0 }} />
                            <Typography variant="caption" sx={{ fontWeight: 800, color: surgicalChecklist[task.id] ? '#D32F2F' : '#757575' }}>{task.label}</Typography>
                        </Box>
                    ))}
                </Stack>
                <Typography variant="caption" sx={{ mt: 'auto', textAlign: 'center', color: '#D32F2F', fontWeight: 900, py: 1 }}>
                    {Object.values(surgicalChecklist).every(v => v) ? "✅ AUDIT READY" : "⚠️ PROTOCOL INCOMPLETE"}
                </Typography>
            </Paper>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Box sx={{ py: 4, textAlign: 'center' }}>
                  <Typography variant="body2" color="textSecondary" sx={{ fontStyle: 'italic', mb: 2 }}>You are documenting as: <span style={{fontWeight: 900, color: COLORS.brand}}>{auth.currentUser?.displayName || 'Authorized Clinician'}</span></Typography>
                  <Button variant="contained" size="large" onClick={handleSaveConsult} disabled={loading} sx={{ bgcolor: COLORS.brand, px: 6, py: 2, borderRadius: 3, fontWeight: 900, fontSize: '1.1rem', boxShadow: '0 8px 20px rgba(93,64,55,0.2)' }}>
                     {loading ? "Processing Final Sign-off..." : "Finalize & Move to Billing"}
                  </Button>
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
                    <Box sx={{ height: 140, mt: 1 }}>
                        <ResponsiveContainer width="100%" height="100%">
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
                <Box sx={{ height: 80, mb: 2 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={tempData}>
                            <Line type="stepAfter" dataKey="temp" stroke="#EF6C00" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                    <Typography variant="caption" sx={{ textAlign: 'center', display: 'block', fontSize: '0.6rem', fontWeight: 900, color: '#EF6C00' }}>TEMP HISTORY (°C)</Typography>
                </Box>
                <Box sx={{ height: 80 }}>
                    <ResponsiveContainer width="100%" height="100%">
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
                        <Box sx={{ position: 'absolute', left: -7, top: 0, width: 12, height: 12, borderRadius: '50%', bgcolor: COLORS.accentLight, border: '2px solid white', boxShadow: 1 }} />
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 900, color: COLORS.textPrimary }}>{new Date(rec.date?.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Typography>
                        <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, fontStyle: 'italic' }}>{rec.diagnosis || 'Clinical Visit'}</Typography>
                    </Box>
                ))}
                {history.length > 5 && <Typography variant="caption" color="primary" sx={{ textAlign: 'center', cursor: 'pointer', fontWeight: 900 }}>See {history.length - 5} more in CRM Dashboard...</Typography>}
           </Stack>

        </Box>
      </Box>
    </Dialog>
  );
}
