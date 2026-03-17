import React, { useState, useEffect } from 'react';
import { 
  Dialog, Slide, AppBar, Toolbar, IconButton, Typography, Button, 
  Box, Paper, Avatar, Chip, TextField, FormControl, InputLabel, 
  Select, MenuItem, List, ListItemText, ListSubheader, Divider, Grid // Make sure Grid is here!
} from '@mui/material';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import MedicationIcon from '@mui/icons-material/Medication';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import WarningIcon from '@mui/icons-material/Warning';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';

// Firebase
import { collection, addDoc, Timestamp, doc, updateDoc, getDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

// Knowledge Base for the AI Assistive Tool
const KNOWLEDGE_BASE = [
  { keywords:['vomit', 'diarrhea', 'lethargic', 'blood'], suggestion: 'Possible CPV or Gastroenteritis. Recommended: CPV Ag Test, CBC.' },
  { keywords:['scratching', 'hair loss', 'redness', 'flea', 'tick'], suggestion: 'Possible Dermatitis/Ectoparasites. Recommended: Skin Scraping, 4Dx Snap.' },
  { keywords:['cough', 'sneezing', 'nasal discharge'], suggestion: 'Possible Respiratory Infection / Kennel Cough. Recommended: Isolate patient immediately.' }
];

export default function ClinicalWorkspace({ open, onClose, patient, inventoryList, servicesList }) {
  // --- STATES ---
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Patient Context Data
  const [petDetails, setPetDetails] = useState(null);
  const [prevVitals, setPrevVitals] = useState(null);

  // Is this a Grooming or Medical visit?
  const isGrooming = patient?.serviceCategory === 'Grooming' || patient?.serviceType?.toLowerCase().includes('grooming');

  // Medical State
  const [soapData, setSoapData] = useState({
    subjective: '', objWeight: '', objTemp: '', objHR: '', objRR: '', objCRT: '', objBCS: '', objPain: '', objectiveNotes: '',
    assessment: '', patientStatus: 'Stable', plan: '', nextVisit: ''
  });
  const [assistiveText, setAssistiveText] = useState('');

  // Grooming State
  const [groomingData, setGroomingData] = useState({
    coatCondition: 'Normal', parasites: 'None', temperament: 'Calm', notes: ''
  });
  
  // Smart Cart
  const [rxCart, setRxCart] = useState([]);
  const [selectedRxItem, setSelectedRxItem] = useState('');

  // --- 1. INITIALIZATION ---
  useEffect(() => {
    const fetchPatientContext = async () => {
      if (open && patient) {
        setIsDirty(false);
        setAssistiveText('');
        
        if (isGrooming) {
            setGroomingData({ coatCondition: 'Normal', parasites: 'None', temperament: 'Calm', notes: patient.notes && patient.notes !== 'Walk-in client' ? `Client Request: ${patient.notes}\n` : '' });
        } else {
            setSoapData({
                subjective: patient.notes && patient.notes !== 'Walk-in client' && patient.notes !== '🚨 EMERGENCY WALK-IN' ? `Client noted: "${patient.notes}"\n\n` : '',
                objWeight: '', objTemp: '', objHR: '', objRR: '', objCRT: '', objBCS: '', objPain: '', objectiveNotes: '',
                assessment: '', patientStatus: 'Stable', plan: '', nextVisit: ''
            });
        }

        setRxCart([{
            type: 'service', id: 'base_service', name: patient.serviceType, 
            price: patient.servicePrice || 0, qty: 1, isDrug: false, isBase: true 
        }]);
        setSelectedRxItem('');

        if (patient.petId && patient.petId !== "WALK_IN_USER") {
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
          setPetDetails(null);
          setPrevVitals(null);
        }
      }
    };
    fetchPatientContext();
  }, [open, patient, isGrooming]);

  // --- 2. HANDLERS ---
  const handleCloseRequest = () => {
    if (isDirty) {
      if (window.confirm("⚠️ WARNING: You have unsaved clinical notes. Closing this will discard them. Are you sure?")) {
        onClose();
      }
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
      updateSoap('objectiveNotes', "General Appearance: WNL\nEENT: WNL\nCardiovascular: WNL\nRespiratory: WNL\nGastrointestinal: WNL\nMusculoskeletal: WNL\nIntegumentary (Skin): WNL\nLymph Nodes: WNL\nNeurological: WNL\nUrogenital: WNL");
    } else if (type === 'summer_cut') {
      updateGrooming('notes', groomingData.notes + '\nStandard Summer Cut. Nails trimmed, ears cleaned, anal glands expressed.');
    }
  };

  const runAssistiveDiagnosis = () => {
    const combinedNotes = (soapData.subjective + " " + soapData.objectiveNotes).toLowerCase();
    let suggestions =[];
    KNOWLEDGE_BASE.forEach(c => {
      if (c.keywords.some(k => combinedNotes.includes(k))) suggestions.push(c.suggestion);
    });
    setAssistiveText(suggestions.length > 0 ? suggestions.join('\n\n') : 'No rule-based suggestions found.');
  };

  // --- 3. SMART CART LOGIC ---
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
  const saveBtnText = hasDrugsInCart ? "Save & Send to Pharmacy" : "Save & Send to Checkout";
  const nextRouteStatus = hasDrugsInCart ? "dispensing" : "billing";

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

  // Weight Delta Calculator
  const getWeightDelta = () => {
    if (!soapData.objWeight || !prevVitals?.weight) return null;
    const current = parseFloat(soapData.objWeight);
    const previous = parseFloat(prevVitals.weight);
    if (isNaN(current) || isNaN(previous) || previous === 0) return null;
    return (((current - previous) / previous) * 100).toFixed(1);
  };
  const weightDelta = getWeightDelta();

  let headerColor = '#5D4037'; 
  if (!isGrooming && soapData.patientStatus === 'Critical') headerColor = '#D32F2F'; 
  else if (!isGrooming && soapData.patientStatus === 'Guarded') headerColor = '#F57C00'; 

  return (
    <Dialog fullScreen open={open} onClose={handleCloseRequest} TransitionComponent={Transition}>
      
      <AppBar sx={{ position: 'relative', bgcolor: headerColor, transition: 'background-color 0.3s' }}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={handleCloseRequest}><CloseIcon /></IconButton>
          <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div" fontWeight="bold">
            {isGrooming ? '✂️ Spa & Grooming Workspace' : '🩺 Clinical Medical Workspace'}
          </Typography>
          <Button color="inherit" onClick={handleCloseRequest}>Save as Draft (Close)</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', bgcolor: '#F5F5F5', overflow: 'hidden' }}>
        
        {/* ================================================================= */}
        {/* COLUMN 1: PATIENT CONTEXT (25% WIDTH) */}
        {/* ================================================================= */}
        <Box sx={{ width: '25%', minWidth: '280px', p: 3, borderRight: '1px solid #ddd', bgcolor: 'white', overflowY: 'auto' }}>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <Avatar sx={{ width: 60, height: 60, bgcolor: '#EFEBE9', fontSize: 30 }}>{(patient?.petSpecies === 'Canine' || patient?.petSpecies === 'Dog') ? '🐶' : '🐱'}</Avatar>
            <Box>
              <Typography variant="h5" fontWeight="bold" color="#3E2723">{patient?.petName}</Typography>
              <Typography variant="body2" color="textSecondary" fontWeight="bold">{petDetails?.breed || patient?.petSpecies} • {petDetails?.gender || 'Unknown Sex'}</Typography>
              {petDetails?.isNeutered && <Chip label="Desexed" size="small" color="success" variant="outlined" sx={{height: 16, fontSize: '0.6rem', mt: 0.5}} />}
              <Typography variant="caption" display="block" sx={{mt: 1}}>Owner: {patient?.ownerName}</Typography>
            </Box>
          </Box>
          
          <Chip label={`Service: ${patient?.serviceType}`} color="primary" sx={{ mb: 3, fontWeight: 'bold', width: '100%' }} />

          <Typography variant="overline" fontWeight="bold" color="textSecondary">Triage Notes</Typography>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: '#FFFDE7', mb: 3, borderLeft: '4px solid #FBC02D' }}>
            <Typography variant="body2" fontStyle="italic">{patient?.notes || "No notes provided."}</Typography>
          </Paper>

          <Typography variant="overline" fontWeight="bold" color="textSecondary">Medical Alerts</Typography>
          <Paper variant="outlined" sx={{ p: 0, bgcolor: 'white', borderRadius: 2, mb: 3, overflow: 'hidden', border: '1px solid #e0e0e0' }}>
            <Box sx={{ bgcolor: '#D32F2F', p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <WarningIcon sx={{ color: 'white', fontSize: 18 }} />
                <Typography variant="caption" color="white" fontWeight="bold">ATTENTION</Typography>
            </Box>
            <List dense sx={{ p: 1 }}>
                {petDetails?.allergies && petDetails?.allergies.toLowerCase() !== 'none' ? (
                    <ListItem sx={{ py: 0.5, px: 1 }}>
                        <Chip label="High" size="small" sx={{ bgcolor: '#D32F2F', color: 'white', fontWeight: 'bold', fontSize: '0.6rem', height: 20, mr: 1 }} />
                        <ListItemText primary={<Typography variant="body2" fontWeight="bold">Allergy: {petDetails.allergies}</Typography>} />
                    </ListItem>
                ) : (
                    <Typography variant="caption" sx={{ px: 1, color: '#888', fontStyle: 'italic' }}>No known allergies.</Typography>
                )}
            </List>
          </Paper>

          {!isGrooming && (
            <>
              <Typography variant="overline" fontWeight="bold" color="textSecondary">Previous Vitals</Typography>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: '#FAFAFA' }}>
                {prevVitals ? (
                  <Grid container spacing={1}>
                    <Grid size={{ xs: 6 }}><Typography variant="caption" color="textSecondary">Weight</Typography><Typography variant="body2" fontWeight="bold">{prevVitals.weight || '-'} kg</Typography></Grid>
                    <Grid size={{ xs: 6 }}><Typography variant="caption" color="textSecondary">Temp</Typography><Typography variant="body2" fontWeight="bold">{prevVitals.temp || '-'} °C</Typography></Grid>
                    <Grid size={{ xs: 6 }}><Typography variant="caption" color="textSecondary">HR</Typography><Typography variant="body2" fontWeight="bold">{prevVitals.hr || '-'} bpm</Typography></Grid>
                    <Grid size={{ xs: 6 }}><Typography variant="caption" color="textSecondary">BCS</Typography><Typography variant="body2" fontWeight="bold">{prevVitals.bcs || '-'}/9</Typography></Grid>
                  </Grid>
                ) : (
                  <Typography variant="body2" color="textSecondary" fontStyle="italic">No previous records found.</Typography>
                )}
              </Paper>
            </>
          )}
        </Box>

        {/* ================================================================= */}
        {/* COLUMN 2: THE MEDICAL/GROOMING CANVAS (50% WIDTH) */}
        {/* ================================================================= */}
        <Box sx={{ flex: 1, p: 4, overflowY: 'auto' }}>
           
           {isGrooming ? (
             <Paper sx={{ p: 4, borderTop: '4px solid #9C27B0' }}>
               <Typography variant="h5" color="secondary" fontWeight="bold" gutterBottom>✂️ Grooming Notes</Typography>
               <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>SOAP documentation is not required. Provide general notes.</Typography>
               <TextField 
                 multiline rows={8} fullWidth 
                 placeholder="e.g. Summer cut. Dog was anxious during nail trim." 
                 value={groomingData.notes} 
                 onChange={(e) => updateGrooming('notes', e.target.value)} 
               />
             </Paper>
           ) : (
             <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h5" fontWeight="bold" color="#1565C0">S.O.A.P. Documentation</Typography>
                    <Chip label="Routine Vaccine Template" onClick={() => applyTemplate('vaccine')} color="primary" variant="outlined" clickable size="small" />
                </Box>
                
                {/* S - SUBJECTIVE */}
                <Paper sx={{ p: 3, mb: 3, borderLeft: '4px solid #1976D2' }}>
                  <Typography variant="subtitle1" color="primary" fontWeight="bold" gutterBottom>S - SUBJECTIVE (History)</Typography>
                  <TextField multiline rows={3} fullWidth placeholder="What does the owner report?" value={soapData.subjective} onChange={(e) => updateSoap('subjective', e.target.value)} />
                </Paper>

                {/* O - OBJECTIVE */}
                <Paper sx={{ p: 3, mb: 3, borderLeft: '4px solid #1976D2' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="subtitle1" color="primary" fontWeight="bold">O - OBJECTIVE (Vitals & Exam)</Typography>
                    <Button size="small" variant="outlined" onClick={() => applyTemplate('wnl')}>Auto-Fill WNL</Button>
                  </Box>
                  
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid size={{ xs: 3 }}><TextField label="Wt (kg)" size="small" fullWidth value={soapData.objWeight} onChange={(e) => updateSoap('objWeight', e.target.value)} />{weightDelta && ( <Typography variant="caption" sx={{ color: parseFloat(weightDelta) <= -5.0 ? '#D32F2F' : '#388E3C', fontWeight: 'bold', mt: 0.5, display: 'block' }}>{weightDelta}% vs last visit</Typography> )}</Grid>
                    <Grid size={{ xs: 3 }}><TextField label="Temp (°C)" size="small" fullWidth value={soapData.objTemp} onChange={(e) => updateSoap('objTemp', e.target.value)} error={parseFloat(soapData.objTemp) > 39.2} /></Grid>
                    <Grid size={{ xs: 3 }}><TextField label="HR (bpm)" size="small" fullWidth value={soapData.objHR} onChange={(e) => updateSoap('objHR', e.target.value)} /></Grid>
                    <Grid size={{ xs: 3 }}><TextField label="RR (rpm)" size="small" fullWidth value={soapData.objRR} onChange={(e) => updateSoap('objRR', e.target.value)} /></Grid>
                    <Grid size={{ xs: 4 }}><TextField label="CRT (sec)" size="small" fullWidth value={soapData.objCRT} onChange={(e) => updateSoap('objCRT', e.target.value)} /></Grid>
                    <Grid size={{ xs: 4 }}><TextField label="BCS (1-9)" size="small" fullWidth value={soapData.objBCS} onChange={(e) => updateSoap('objBCS', e.target.value)} /></Grid>
                    <Grid size={{ xs: 4 }}><TextField label="Pain (0-4)" size="small" fullWidth value={soapData.objPain} onChange={(e) => updateSoap('objPain', e.target.value)} /></Grid>
                  </Grid>

                  <TextField multiline rows={4} fullWidth placeholder="Physical exam findings (e.g. MM pink, lungs clear)..." value={soapData.objectiveNotes} onChange={(e) => updateSoap('objectiveNotes', e.target.value)} />
                  
                  <Button variant="contained" fullWidth sx={{ mt: 3, fontWeight: 'bold', bgcolor: '#E3F2FD', color: '#1565C0', elevation: 0 }} onClick={runAssistiveDiagnosis} startIcon={<AutoFixHighIcon/>}>Run Clinical Support Check</Button>
                  {assistiveText !== '' && ( <Box sx={{ mt: 2, p: 2, bgcolor: '#FFF', borderRadius: 1, border: '1px solid #90CAF9' }}><Typography variant="caption" fontWeight="bold" color="primary">System Suggestion:</Typography><Typography variant="body2" sx={{ mt: 0.5 }}>{assistiveText}</Typography></Box> )}
                </Paper>

                {/* A - ASSESSMENT */}
                <Paper sx={{ p: 3, mb: 3, borderLeft: '4px solid #2E7D32' }}>
                  <Typography variant="subtitle1" color="success.main" fontWeight="bold" gutterBottom>A - ASSESSMENT (Diagnosis)</Typography>
                  <Grid container spacing={2}>
                      <Grid size={{ xs: 8 }}><TextField fullWidth label="Definitive or Differential Diagnosis" size="small" value={soapData.assessment} onChange={(e) => updateSoap('assessment', e.target.value)} /></Grid>
                      <Grid size={{ xs: 4 }}><FormControl fullWidth size="small"><InputLabel>Patient Status</InputLabel><Select value={soapData.patientStatus} label="Patient Status" onChange={(e) => updateSoap('patientStatus', e.target.value)}><MenuItem value="Stable">🟢 Stable</MenuItem><MenuItem value="Guarded">🟡 Guarded</MenuItem><MenuItem value="Critical">🔴 Critical</MenuItem></Select></FormControl></Grid>
                  </Grid>
                </Paper>

                {/* P - PLAN */}
                <Paper sx={{ p: 3, borderLeft: '4px solid #2E7D32' }}>
                  <Typography variant="subtitle1" color="success.main" fontWeight="bold" gutterBottom>P - PLAN (Treatment)</Typography>
                  <TextField multiline rows={4} fullWidth placeholder="Medical procedures performed, internal instructions..." value={soapData.plan} onChange={(e) => updateSoap('plan', e.target.value)} />
                </Paper>
             </Box>
           )}
        </Box>

        {/* ================================================================= */}
        {/* COLUMN 3: ACTION CENTER & PRESCRIBE (25% WIDTH) */}
        {/* ================================================================= */}
        <Box sx={{ width: '25%', minWidth: '320px', bgcolor: 'white', borderLeft: '1px solid #ddd', p: 3, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            
            <Typography variant="overline" fontWeight="bold" color="textSecondary" sx={{ mb: 1, display: 'block' }}>Smart Cart (E-Prescribe)</Typography>
            
            <Paper variant="outlined" sx={{ bgcolor: '#FAFAFA', p: 2, borderRadius: 2, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{display:'flex', gap:1, mb: 2}}>
                    <FormControl size="small" fullWidth><InputLabel>Search Inventory/Services</InputLabel><Select value={selectedRxItem} label="Search Inventory/Services" onChange={e=>setSelectedRxItem(e.target.value)}><ListSubheader sx={{fontWeight:'bold', bgcolor:'#f5f5f5'}}>Medicines & Vaccines</ListSubheader>{inventoryList.filter(i => i.category === 'Medicine' || i.category === 'Vaccine').map(i => <MenuItem key={`product|${i.id}`} value={`product|${i.id}`}>{i.itemName} (Stock: {i.stock})</MenuItem>)}<ListSubheader sx={{fontWeight:'bold', bgcolor:'#f5f5f5'}}>Clinic Services</ListSubheader>{servicesList.filter(s => s.name !== patient?.serviceType).map(s => <MenuItem key={`service|${s.id}`} value={`service|${s.id}`}>{s.name} (+₱{s.price})</MenuItem>)}</Select></FormControl>
                    <Button variant="contained" color="primary" onClick={handleAddRx} sx={{minWidth: 'auto', px: 2}}>+</Button>
                </Box>

                <Box sx={{display:'flex', flexDirection:'column', gap: 1, overflowY: 'auto', flexGrow: 1}}>
                    {rxCart.map((rx, idx) => (
                        <Box key={idx} sx={{ display: 'flex', flexDirection: 'column', bgcolor: rx.isBase ? '#E3F2FD' : 'white', p: 1.5, borderRadius: 1, border: '1px solid #eee', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" fontWeight="bold" color={rx.isDrug ? "warning.dark" : "info.main"}>
                              {rx.isDrug ? <MedicationIcon sx={{fontSize:16, verticalAlign:'middle', mr: 0.5}}/> : null} 
                              {rx.name} (₱{rx.price})
                            </Typography>
                            <IconButton size="small" color="error" disabled={rx.isBase} onClick={()=>handleRemoveRx(idx)}>
                              <CloseIcon fontSize="small" sx={{opacity: rx.isBase ? 0.3 : 1}}/>
                            </IconButton>
                          </Box>
                          
                          {rx.isDrug && (
                            <TextField 
                              variant="standard" placeholder="Dosage instructions (Sig)..." size="small" 
                              value={rx.instructions || ''} onChange={(e) => handleUpdateRxSig(idx, e.target.value)}
                              sx={{ mt: 1 }} InputProps={{ style: { fontSize: '0.85rem', fontStyle: 'italic' } }}
                            />
                          )}
                        </Box>
                    ))}
                </Box>
            </Paper>

            <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid #eee' }}>
                <TextField type="date" label="Next Follow-up Visit (Optional)" fullWidth size="small" InputLabelProps={{ shrink: true }} sx={{mb: 2}} value={soapData.nextVisit} onChange={(e) => updateSoap('nextVisit', e.target.value)} />
                <Button 
                  variant="contained" fullWidth size="large" 
                  color={hasDrugsInCart ? "warning" : "success"}
                  sx={{ fontWeight: 'bold', py: 1.5, fontSize: '1rem' }} 
                  onClick={handleSaveConsult} disabled={loading}
                >
                  {loading ? "Saving..." : saveBtnText}
                </Button>
            </Box>
        </Box>
      </Box>
    </Dialog>
  );
}