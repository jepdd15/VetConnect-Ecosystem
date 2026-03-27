import React, { useState, useEffect } from 'react';
import { 
  Dialog, Slide, AppBar, Toolbar, IconButton, Typography, Button, 
  Box, Paper, Avatar, Chip, TextField, FormControl, InputLabel, 
  Select, MenuItem, List, ListItemText, ListSubheader, Grid // MUI v6 Grid
} from '@mui/material';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import MedicationIcon from '@mui/icons-material/Medication';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import WarningIcon from '@mui/icons-material/Warning';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SaveIcon from '@mui/icons-material/Save';

// Firebase
import { collection, addDoc, Timestamp, doc, updateDoc, getDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

// Knowledge Base for the AI Assistive Tool
const KNOWLEDGE_BASE =[
  { keywords:['vomit', 'diarrhea', 'lethargic', 'blood', 'stool'], suggestion: 'Possible CPV (Canine Parvovirus) or Gastroenteritis. Recommended: CPV Ag Test, CBC.' },
  { keywords:['scratching', 'hair loss', 'redness', 'flea', 'tick', 'itching'], suggestion: 'Possible Dermatitis or Ectoparasites. Recommended: Skin Scraping, 4Dx Snap.' },
  { keywords:['cough', 'sneezing', 'nasal discharge', 'eye discharge'], suggestion: 'Possible Respiratory Infection / Kennel Cough. Recommended: Isolate patient immediately.' }
];

export default function ClinicalWorkspace({ open, onClose, patient, inventoryList, servicesList, departments }) {
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const[petDetails, setPetDetails] = useState(null);
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

  const deptObj = (departments ||[]).find(d => d.name === patientDepartment);
  const badgeColor = deptObj ? deptObj.color : '#1565C0';

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

            const qPrev = query(collection(db, "medical_records"), where("petId", "==", patient.petId), orderBy("date", "desc"), limit(1));
            const prevSnap = await getDocs(qPrev);
            if (!prevSnap.empty) setPrevVitals(prevSnap.docs[0].data().vitals);
            else setPrevVitals(null);
          } catch (e) { console.error("Error fetching context:", e); }
        } else {
          setPetDetails(null); setPrevVitals(null);
        }
      }
    };
    fetchPatientContext();
  // THE FIX: Removed complex arrays from dependencies to kill the ESLint warning!
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open, patient, isGrooming]); 

  // --- 2. HANDLERS ---
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
    
    if (itemObj) { setRxCart([...rxCart, itemObj]); setSelectedRxItem(''); setIsDirty(true); }
  };

  const handleRemoveRx = (index) => {
    if (rxCart[index].isBase) return; 
    const newCart =[...rxCart];
    newCart.splice(index, 1);
    setRxCart(newCart);
    setIsDirty(true);
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
      await addDoc(collection(db, "medical_records"), {
        appointmentId: patient.id, 
        petId: patient.petId || "WALK_IN_PET", 
        petName: patient.petName, 
        ownerId: patient.ownerId, 
        vetId: auth.currentUser?.uid || "Web Admin", 
        vetName: patient.assignedVet || "Admin",
        date: Timestamp.now(), 
        recordType: isGrooming ? 'grooming' : 'medical',
        diagnosis: isGrooming ? 'Grooming Services' : soapData.assessment, 
        treatment: isGrooming ? groomingData.notes : soapData.plan, 
        soap: isGrooming ? null : soapData, 
        groomingDetails: isGrooming ? groomingData : null,
        vitals: isGrooming ? null : { weight: soapData.objWeight, temp: soapData.objTemp, hr: soapData.objHR, rr: soapData.objRR, crt: soapData.objCRT, bcs: soapData.objBCS, pain: soapData.objPain },
        patientStatus: isGrooming ? 'Stable' : soapData.patientStatus, 
        nextVisit: soapData.nextVisit ? Timestamp.fromDate(new Date(soapData.nextVisit)) : null, 
      });

      await updateDoc(doc(db, "appointments", patient.id), { 
          status: nextRouteStatus,
          prescribedItems: rxCart 
      });

      setLoading(false); setIsDirty(false); onClose(); 
      alert(`Record Saved! Patient moved to ${hasDrugsInCart ? 'Pharmacy' : 'Checkout'}.`);
    } catch (error) { setLoading(false); alert("Error saving record: " + error.message); }
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
      
      <AppBar sx={{ position: 'relative', background: `linear-gradient(135deg, ${headerColor} 0%, ${headerColor}DD 100%)`, transition: 'background 0.3s', boxShadow: 3, zIndex: 10 }}>
        <Toolbar>
          <IconButton edge="start" sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.2)', '&:hover': {bgcolor: 'rgba(255,255,255,0.3)'} }} onClick={handleCloseRequest}><CloseIcon /></IconButton>
          <Typography sx={{ ml: 2, flex: 1, display: 'flex', alignItems: 'center', gap: 1 }} variant="h6" component="div" fontWeight="bold">
            {isGrooming ? <ContentCutIcon /> : <MedicalServicesIcon />} {isGrooming ? 'Grooming Workspace' : 'Clinical Workspace'}
          </Typography>
          <Button color="inherit" onClick={handleCloseRequest} sx={{ fontWeight: 'bold' }}>Save as Draft (Close)</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', bgcolor: '#F5F5F5', overflow: 'hidden', p: 2, gap: 2 }}>
        
        {/* ================================================================= */}
        {/* COLUMN 1: PATIENT CONTEXT */}
        {/* ================================================================= */}
        <Paper elevation={0} sx={{ ...glassStyle, width: '25%', minWidth: '280px', p: 3, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ width: 70, height: 70, bgcolor: 'white', fontSize: 35, border: `3px solid ${badgeColor}`, boxShadow: `0 4px 10px ${badgeColor}66` }}>
              {(patient?.petSpecies === 'Canine' || patient?.petSpecies === 'Dog') ? '🐶' : '🐱'}
            </Avatar>
            <Box>
              <Typography variant="h4" fontWeight="900" color="#3E2723">{patient?.petName}</Typography>
              <Typography variant="body2" color="textSecondary" fontWeight="bold">{petDetails?.breed || patient?.petSpecies} • {petDetails?.gender || 'Unknown Sex'}</Typography>
              {petDetails?.isNeutered && <Chip label="Desexed" size="small" color="success" variant="outlined" sx={{height: 20, fontSize: '0.65rem', mt: 0.5, fontWeight: 'bold'}} />}
            </Box>
          </Box>

          <Box>
             <Typography variant="overline" fontWeight="900" color="textSecondary">Triage Notes</Typography>
             <Paper variant="outlined" sx={{ p: 2, bgcolor: '#FFFDE7', border: '1px solid #FFF59D', borderLeft: '4px solid #FBC02D', borderRadius: 2 }}>
               <Typography variant="body2" fontStyle="italic" color="#5D4037">{patient?.notes || "No notes provided at reception."}</Typography>
             </Paper>
          </Box>

          <Box>
             <Typography variant="overline" fontWeight="900" color="textSecondary">Medical Alerts</Typography>
             <Paper variant="outlined" sx={{ p: 0, bgcolor: 'white', borderRadius: 2, overflow: 'hidden', border: '1px solid #EF9A9A' }}>
               <Box sx={{ bgcolor: '#D32F2F', p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                   <WarningIcon sx={{ color: 'white', fontSize: 18 }} />
                   <Typography variant="caption" color="white" fontWeight="bold">ATTENTION</Typography>
               </Box>
               <List dense sx={{ p: 1 }}>
                   {petDetails?.allergies && petDetails?.allergies.toLowerCase() !== 'none' ? (
                       <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1 }}>
                           <Chip label="High" size="small" sx={{ bgcolor: '#D32F2F', color: 'white', fontWeight: 'bold', fontSize: '0.6rem', height: 20 }} />
                           <Typography variant="body2" fontWeight="bold" color="#D32F2F">Allergy: {petDetails.allergies}</Typography>
                       </Box>
                   ) : (
                       <Typography variant="caption" sx={{ px: 1, color: '#888', fontStyle: 'italic' }}>No known allergies.</Typography>
                   )}
               </List>
             </Paper>
          </Box>

          {!isGrooming && (
            <Box>
              <Typography variant="overline" fontWeight="900" color="textSecondary">Previous Vitals</Typography>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: '#FAFAFA', borderRadius: 2, border: '1px solid #E0E0E0' }}>
                {prevVitals ? (
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 6 }}><Typography variant="caption" color="textSecondary" display="block">Weight</Typography><Typography variant="body1" color="#1565C0" fontWeight="900">{prevVitals.weight || '-'} kg</Typography></Grid>
                    <Grid size={{ xs: 6 }}><Typography variant="caption" color="textSecondary" display="block">Temp</Typography><Typography variant="body1" color="#1565C0" fontWeight="900">{prevVitals.temp || '-'} °C</Typography></Grid>
                    <Grid size={{ xs: 6 }}><Typography variant="caption" color="textSecondary" display="block">Heart Rate</Typography><Typography variant="body1" color="#1565C0" fontWeight="900">{prevVitals.hr || '-'} bpm</Typography></Grid>
                    <Grid size={{ xs: 6 }}><Typography variant="caption" color="textSecondary" display="block">BCS</Typography><Typography variant="body1" color="#1565C0" fontWeight="900">{prevVitals.bcs || '-'}/9</Typography></Grid>
                  </Grid>
                ) : (
                  <Typography variant="body2" color="textSecondary" fontStyle="italic">No previous clinical records found for this patient.</Typography>
                )}
              </Paper>
            </Box>
          )}
        </Paper>

        {/* ================================================================= */}
        {/* COLUMN 2: THE MEDICAL/GROOMING CANVAS */}
        {/* ================================================================= */}
        <Paper elevation={0} sx={{ ...glassStyle, flex: 1, p: 4, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
           
           {isGrooming ? (
             <Box>
               <Typography variant="h5" color={badgeColor} fontWeight="900" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                 <ContentCutIcon /> Grooming Instructions & Notes
               </Typography>
               <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>Full S.O.A.P. documentation is not required for retail grooming services.</Typography>
               
               <Grid container spacing={2} sx={{ mb: 3 }}>
                   <Grid size={{ xs: 4 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel>Coat Condition</InputLabel><Select value={groomingData.coatCondition} label="Coat Condition" onChange={(e) => updateGrooming('coatCondition', e.target.value)}><MenuItem value="Normal">Normal</MenuItem><MenuItem value="Matted">Matted</MenuItem><MenuItem value="Greasy">Greasy</MenuItem></Select></FormControl></Grid>
                   <Grid size={{ xs: 4 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel>Parasites</InputLabel><Select value={groomingData.parasites} label="Parasites" onChange={(e) => updateGrooming('parasites', e.target.value)}><MenuItem value="None">None</MenuItem><MenuItem value="Fleas">Fleas</MenuItem><MenuItem value="Ticks">Ticks</MenuItem></Select></FormControl></Grid>
                   <Grid size={{ xs: 4 }}><FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}><InputLabel>Temperament</InputLabel><Select value={groomingData.temperament} label="Temperament" onChange={(e) => updateGrooming('temperament', e.target.value)}><MenuItem value="Calm">Calm</MenuItem><MenuItem value="Anxious">Anxious</MenuItem><MenuItem value="Aggressive">Aggressive</MenuItem></Select></FormControl></Grid>
               </Grid>

               <TextField 
                 multiline rows={10} fullWidth 
                 label="Detailed Grooming Notes"
                 placeholder="e.g. Summer cut. Dog was anxious during nail trim. Ears cleaned and plucked." 
                 value={groomingData.notes} 
                 onChange={(e) => updateGrooming('notes', e.target.value)} 
                 sx={{ bgcolor: 'white', borderRadius: 2, '& fieldset': { borderColor: '#E0E0E0' } }}
               />
             </Box>
           ) : (
             <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h5" fontWeight="900" color="#3E2723">S.O.A.P. Charting</Typography>
                    <Chip label="Routine Vaccine Template" onClick={() => applyTemplate('vaccine')} color="primary" variant="outlined" clickable size="small" sx={{ fontWeight: 'bold' }} />
                </Box>
                
                {/* S - SUBJECTIVE */}
                <Box sx={{ mb: 4 }}>
                  <Typography variant="subtitle2" color="#1565C0" fontWeight="900" gutterBottom>S - SUBJECTIVE (History)</Typography>
                  <TextField multiline rows={3} fullWidth placeholder="What does the owner report? What are the symptoms?" value={soapData.subjective} onChange={(e) => updateSoap('subjective', e.target.value)} sx={{ bgcolor: 'white', borderRadius: 1 }} />
                </Box>

                {/* O - OBJECTIVE */}
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2" color="#1565C0" fontWeight="900">O - OBJECTIVE (Vitals & Exam)</Typography>
                    <Button size="small" variant="outlined" onClick={() => applyTemplate('wnl')} sx={{ fontWeight: 'bold', fontSize: '0.7rem' }}>Auto-Fill WNL</Button>
                  </Box>
                  
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'white', borderRadius: 2, mb: 2 }}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 3 }}>
                        <TextField label="Wt (kg)" size="small" fullWidth value={soapData.objWeight} onChange={(e) => updateSoap('objWeight', e.target.value)} />
                        {weightDelta && ( 
                          <Typography variant="caption" sx={{ color: parseFloat(weightDelta) <= -5.0 ? '#D32F2F' : '#388E3C', fontWeight: '900', mt: 0.5, display: 'block' }}>
                            {parseFloat(weightDelta) > 0 ? '+' : ''}{weightDelta}% vs last visit
                          </Typography> 
                        )}
                      </Grid>
                      <Grid size={{ xs: 3 }}><TextField label="Temp (°C)" size="small" fullWidth value={soapData.objTemp} onChange={(e) => updateSoap('objTemp', e.target.value)} error={parseFloat(soapData.objTemp) > 39.2} /></Grid>
                      <Grid size={{ xs: 3 }}><TextField label="HR (bpm)" size="small" fullWidth value={soapData.objHR} onChange={(e) => updateSoap('objHR', e.target.value)} /></Grid>
                      <Grid size={{ xs: 3 }}><TextField label="RR (rpm)" size="small" fullWidth value={soapData.objRR} onChange={(e) => updateSoap('objRR', e.target.value)} /></Grid>
                      <Grid size={{ xs: 4 }}><TextField label="CRT (sec)" size="small" fullWidth value={soapData.objCRT} onChange={(e) => updateSoap('objCRT', e.target.value)} /></Grid>
                      <Grid size={{ xs: 4 }}><TextField label="BCS (1-9)" size="small" fullWidth value={soapData.objBCS} onChange={(e) => updateSoap('objBCS', e.target.value)} /></Grid>
                      <Grid size={{ xs: 4 }}><TextField label="Pain (0-4)" size="small" fullWidth value={soapData.objPain} onChange={(e) => updateSoap('objPain', e.target.value)} /></Grid>
                    </Grid>
                  </Paper>

                  <TextField multiline rows={4} fullWidth placeholder="Physical exam findings (e.g. MM pink, lungs clear, palpable mass)..." value={soapData.objectiveNotes} onChange={(e) => updateSoap('objectiveNotes', e.target.value)} sx={{ bgcolor: 'white', borderRadius: 1 }} />
                </Box>

                {/* THE UX FIX: Assistive AI Placement */}
                <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
                    <Button 
                      variant="contained" 
                      onClick={runAssistiveDiagnosis} 
                      startIcon={<AutoFixHighIcon/>}
                      sx={{ bgcolor: '#E3F2FD', color: '#1565C0', fontWeight: '900', borderRadius: 20, px: 4, boxShadow: 0, border: '1px solid #BBDEFB', '&:hover': { bgcolor: '#BBDEFB', boxShadow: 0 } }}
                    >
                      Run Clinical Support Check (Beta)
                    </Button>
                </Box>
                
                {assistiveText !== '' && ( 
                  <Paper variant="outlined" sx={{ mb: 4, p: 2, bgcolor: '#F1F8E9', borderRadius: 2, border: '1px solid #A5D6A7' }}>
                    <Typography variant="caption" fontWeight="900" color="#2E7D32" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <LocalHospitalIcon fontSize="small" /> AI Differential Suggestion
                    </Typography>
                    <Typography variant="body2" color="#333" sx={{ mt: 0.5 }}>{assistiveText}</Typography>
                  </Paper> 
                )}

                {/* A - ASSESSMENT */}
                <Box sx={{ mb: 4 }}>
                  <Typography variant="subtitle2" color="#2E7D32" fontWeight="900" gutterBottom>A - ASSESSMENT (Diagnosis)</Typography>
                  <Grid container spacing={2}>
                      <Grid size={{ xs: 8 }}><TextField fullWidth label="Definitive or Differential Diagnosis" size="small" value={soapData.assessment} onChange={(e) => updateSoap('assessment', e.target.value)} sx={{ bgcolor: 'white' }}/></Grid>
                      <Grid size={{ xs: 4 }}>
                        <FormControl fullWidth size="small" sx={{ bgcolor: 'white' }}>
                          <InputLabel>Patient Status</InputLabel>
                          <Select value={soapData.patientStatus} label="Patient Status" onChange={(e) => updateSoap('patientStatus', e.target.value)}>
                            <MenuItem value="Stable"><Typography fontWeight="bold" color="#2E7D32">🟢 Stable</Typography></MenuItem>
                            <MenuItem value="Guarded"><Typography fontWeight="bold" color="#F57C00">🟡 Guarded</Typography></MenuItem>
                            <MenuItem value="Critical"><Typography fontWeight="bold" color="#D32F2F">🔴 Critical</Typography></MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                  </Grid>
                </Box>

                {/* P - PLAN */}
                <Box>
                  <Typography variant="subtitle2" color="#2E7D32" fontWeight="900" gutterBottom>P - PLAN (Treatment)</Typography>
                  <TextField multiline rows={4} fullWidth placeholder="Medical procedures performed, surgeries, internal instructions..." value={soapData.plan} onChange={(e) => updateSoap('plan', e.target.value)} sx={{ bgcolor: 'white', borderRadius: 1 }} />
                </Box>
             </Box>
           )}
        </Paper>

        {/* ================================================================= */}
        {/* COLUMN 3: TREATMENT PLAN & E-PRESCRIBE */}
        {/* ================================================================= */}
        <Paper elevation={0} sx={{ ...glassStyle, width: '25%', minWidth: '320px', p: 3, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            
            <Typography variant="h6" fontWeight="900" color="#3E2723" sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <ReceiptLongIcon /> Treatment Plan
            </Typography>
            <Typography variant="caption" color="textSecondary" sx={{ mb: 2, display: 'block', fontWeight: '600' }}>Add services & prescribe medications.</Typography>
            
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <FormControl size="small" fullWidth sx={{ bgcolor: 'white', borderRadius: 1 }}>
                  <InputLabel>Search Inventory / Services</InputLabel>
                  <Select value={selectedRxItem} label="Search Inventory / Services" onChange={e=>setSelectedRxItem(e.target.value)}>
                    <ListSubheader sx={{fontWeight:'bold', bgcolor:'#EFEBE9', color: '#5D4037'}}>Medicines & Vaccines</ListSubheader>
                    {inventoryList.filter(i => i.category === 'Medicine' || i.category === 'Vaccine').map(i => <MenuItem key={`product|${i.id}`} value={`product|${i.id}`}>{i.itemName} (Stock: {i.stock})</MenuItem>)}
                    
                    <ListSubheader sx={{fontWeight:'bold', bgcolor:'#EFEBE9', color: '#5D4037'}}>Clinic Services (Add-ons)</ListSubheader>
                    {servicesList.filter(s => s.name !== patient?.serviceType).map(s => <MenuItem key={`service|${s.id}`} value={`service|${s.id}`}>{s.name} (+₱{s.price})</MenuItem>)}
                  </Select>
                </FormControl>
                <Button variant="contained" color="primary" onClick={handleAddRx} sx={{ minWidth: 'auto', px: 2, bgcolor: '#8B4513' }}><AddCircleIcon/></Button>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, overflowY: 'auto', flexGrow: 1, mb: 2, pr: 1 }}>
                {rxCart.map((rx, idx) => (
                    <Box key={idx} sx={{ display: 'flex', flexDirection: 'column', bgcolor: rx.isBase ? '#E3F2FD' : 'white', p: 1.5, borderRadius: 2, border: '1px solid', borderColor: rx.isBase ? '#90CAF9' : '#E0E0E0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2" fontWeight="800" color={rx.isDrug ? "#D84315" : "#1565C0"} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {rx.isDrug && <MedicationIcon sx={{ fontSize: 16 }}/>} 
                          {rx.name}
                        </Typography>
                        <IconButton size="small" color="error" disabled={rx.isBase || rx.isAutoBundled} onClick={()=>handleRemoveRx(idx)} sx={{ p: 0.5 }}>
                          <CloseIcon fontSize="small" sx={{opacity: (rx.isBase || rx.isAutoBundled) ? 0.3 : 1}}/>
                        </IconButton>
                      </Box>
                      <Typography variant="caption" color="textSecondary" fontWeight="bold">₱{rx.price}</Typography>
                      
                      {rx.isBase && <Chip label="Base Service" size="small" sx={{ mt: 1, height: 18, fontSize: '0.6rem', fontWeight: 'bold', alignSelf: 'flex-start', bgcolor: '#1976D2', color: 'white' }} />}
                      {rx.isAutoBundled && <Chip label="Auto-Bundled Supply" size="small" sx={{ mt: 1, height: 18, fontSize: '0.6rem', fontWeight: 'bold', alignSelf: 'flex-start', bgcolor: '#757575', color: 'white' }} />}
                      
                      {rx.isDrug && (
                        <TextField 
                          variant="standard" placeholder="Dosage (e.g. 1 tab PO BID x 7 days)" size="small" 
                          value={rx.instructions || ''} onChange={(e) => handleUpdateRxSig(idx, e.target.value)}
                          sx={{ mt: 1.5 }} InputProps={{ style: { fontSize: '0.85rem', fontStyle: 'italic', color: '#555', fontWeight: '600' } }}
                        />
                      )}
                    </Box>
                ))}
            </Box>

            <Box sx={{ pt: 2, borderTop: '2px dashed #E0E0E0' }}>
                <TextField type="date" label="Next Follow-up Visit (Optional)" fullWidth size="small" InputLabelProps={{ shrink: true }} sx={{mb: 2, bgcolor: 'white', borderRadius: 1}} value={soapData.nextVisit} onChange={(e) => updateSoap('nextVisit', e.target.value)} />
                <Button 
                  variant="contained" fullWidth size="large" 
                  color={hasDrugsInCart ? "warning" : "success"}
                  startIcon={<SaveIcon />}
                  sx={{ fontWeight: '900', py: 1.5, fontSize: '0.95rem', boxShadow: 3 }} 
                  onClick={handleSaveConsult} disabled={loading}
                >
                  {loading ? "Processing..." : saveBtnText}
                </Button>
            </Box>
        </Paper>
      </Box>
    </Dialog>
  );
}