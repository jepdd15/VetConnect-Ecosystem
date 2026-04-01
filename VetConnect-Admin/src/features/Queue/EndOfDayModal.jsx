import React, { useState } from 'react';
import { 
  Box, Typography, Button, Stack, Paper, 
  ToggleButtonGroup, ToggleButton, List, ListItem, Divider,
  Menu, MenuItem, ListItemIcon, ListItemText, IconButton, TextField, CircularProgress,
  Chip
} from '@mui/material';

// Icons
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import DoNotDisturbIcon from '@mui/icons-material/DoNotDisturb';
import PetsIcon from '@mui/icons-material/Pets';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'; 
import LocalHospitalIcon from '@mui/icons-material/LocalHospital'; 
import SmartphoneIcon from '@mui/icons-material/Smartphone'; 
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import FemaleIcon from '@mui/icons-material/Female';
import MaleIcon from '@mui/icons-material/Male';
import HelpCenterIcon from '@mui/icons-material/HelpCenter';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { getDoc, doc, query, collection, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import TwitterIcon from '@mui/icons-material/Twitter'; 

const sidebarWidth = 260; // Absolute mapping from Sidebar.jsx
const CARD_HEIGHT = 400;  // FULL BREATHING ROOM for V2 Clinical Re-booking UI

// HELPER: To keep consistency with main grid
const formatDuration = (mins) => {
  const m = Math.abs(mins);
  if (m < 60) return `${m}M`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}H ${rem}M` : `${h}H`;
};

// HELPER: Species Icon Logic (Hardened for Feline/Canine Distinctions)
const getSpeciesIcon = (species) => {
  const s = String(species || "").toLowerCase();
  
  // NOTE: Standard MUI only has PetsIcon (Paw). We distinguish by flipping/styling.
  if (s === 'dog' || s === 'canine') {
    return <PetsIcon sx={{ fontSize: 32, color: '#5D4037' }} />; 
  }
  
  if (s === 'cat' || s === 'feline') {
    // FELINE DISTINCTION: Mirrored Paw + Slightly lighter tone
    return <PetsIcon sx={{ fontSize: 32, transform: 'scaleX(-1) rotate(-15deg)', color: '#8D6E63' }} />; 
  }
  
  if (s === 'bird' || s === 'avian') return <TwitterIcon sx={{ fontSize: 32, color: '#3949AB' }} />;
  
  return <PetsIcon sx={{ fontSize: 32, opacity: 0.4, color: '#9E9E9E' }} />; 
};

export default function EndOfDayModal({ 
  open, leftoverPatients, patientResolutions, 
  onResolutionChange, onBulkResolution, onConfirmReset, isForced, departments, onClose 
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  
  // DNA CORRECTION STATE
  const [genderAnchor, setGenderAnchor] = useState(null);
  const [targetedPid, setTargetedPid] = useState(null);

  // SCHEDULING & ANCESTRY STATE
  const [targetDates, setTargetDates] = useState({}); // { pid: DateString }
  const [ancestorData, setAncestorData] = useState({}); // { pid: { milestones: [], currentIdx: 0 } }
  const [loadingHistory, setLoadingHistory] = useState({});

  if (!open) return null;

  const handleProcessClick = () => {
    if (!isConfirming) {
      setIsConfirming(true);
      setTimeout(() => setIsConfirming(false), 3000);
    } else {
      onConfirmReset(targetDates);
      setIsConfirming(false);
    }
  };

  const handleFetchHistory = async (patient) => {
     let originId = patient.originApptId;
     
     setLoadingHistory(prev => ({ ...prev, [patient.id]: true }));
     try {
        let ancestorDoc = null;

        if (originId) {
           const snap = await getDoc(doc(db, "appointments", originId));
           if (snap.exists()) ancestorDoc = snap;
        } else {
           // FORENSIC FALLBACK: Search for the most recent previous appointment for this pet
           const qAnc = query(
              collection(db, "appointments"),
              where("petId", "==", patient.petId),
              where("createdAt", "<", patient.createdAt),
              orderBy("createdAt", "desc"),
              limit(1)
           );
           const snap = await getDocs(qAnc);
           if (!snap.empty) ancestorDoc = snap.docs[0];
        }

        if (ancestorDoc) {
           const data = ancestorDoc.data();
           const prevMilestones = [
              { id: 'booked', label: 'BOOKED', val: data.createdAt },
              { id: 'scheduled', label: 'SCHED', val: data.jsScheduled },
              { id: 'arrived', label: 'ARRIVED', val: data.timeArrived },
              { id: 'started', label: 'STARTED', val: data.timeStarted }
           ].filter(m => m.val);

           setAncestorData(prev => ({ 
              ...prev, 
              [patient.id]: { 
                 milestones: prevMilestones, 
                 caseDay: Math.max(1, (patient.caseDay || 1) - 1),
                 dateLabel: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString() : 'Previous' 
              } 
           }));
        } else {
           alert("No further ancestry found for this clinical case.");
        }
     } catch (err) { console.error("History fetch failed:", err); }
     setLoadingHistory(prev => ({ ...prev, [patient.id]: false }));
  };

  const handleExitClick = () => {
    if (!exitConfirm) {
      setExitConfirm(true);
      setTimeout(() => setExitConfirm(false), 3000);
    } else {
      onClose();
      setExitConfirm(false);
    }
  };

  const handleGenderOpen = (e, pid) => {
    setTargetedPid(pid);
    setGenderAnchor(e.currentTarget);
  };

  const handleGenderSelect = (gender) => {
     // Here we simulate healing the local record for the session
     const p = leftoverPatients.find(item => item.id === targetedPid);
     if (p) {
        p.petGender = gender;
        p.gender = gender; // Ensure all keys are healed
     }
     setGenderAnchor(null);
  };

  return (
    <Box sx={{ 
      position: 'fixed', top: 0, left: sidebarWidth, right: 0, bottom: 0, 
      width: `calc(100% - ${sidebarWidth}px)`,
      zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      bgcolor: 'rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(30px)',
      animation: 'fadeIn 0.2s ease-out', p: 4
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      
      <Paper elevation={0} sx={{ 
        width: '98%', maxWidth: '1440px', maxHeight: '94vh', 
        display: 'flex', flexDirection: 'column',
        borderRadius: 2, border: '2px solid #5D4037', overflow: 'hidden',
        boxShadow: '0 32px 100px rgba(93, 64, 55, 0.45)'
      }}>
        
        {/* HEADER: CLINICAL ZOOM STYLE */}
        <Box sx={{ 
          bgcolor: '#5D4037', color: 'white', p: 2.5, 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ width: '100%' }}>
            <WarningAmberIcon fontSize="large" sx={{ color: '#FFD180' }} />
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="h5" sx={{ fontWeight: '1000', textTransform: 'uppercase', whiteSpace: 'nowrap', letterSpacing: 1.2, fontSize: '1.25rem' }}>
                FORENSIC RECONCILIATION
              </Typography>
              <Box sx={{ flex: 1, borderBottom: '2px dashed rgba(255,255,255,0.3)', mx: 1, height: '2px' }} />
              <Typography variant="h5" sx={{ fontWeight: '1000', color: '#FFD180', fontSize: '1.25rem' }}>
                {leftoverPatients.length} {leftoverPatients.length === 1 ? 'RECORD' : 'RECORDS'}
              </Typography>
            </Box>
          </Stack>
        </Box>

        {/* BULK ACTION TOOLBAR (GOD-VIEW STYLE) */}
        {leftoverPatients.length > 1 && (
          <Box sx={{ px: 3, py: 1.2, bgcolor: '#FAFAFA', borderBottom: '2px solid #5D4037', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                 BATCH ACTION WIZARD (UNLOCKED)
             </Typography>
             <Stack direction="row" spacing={0} sx={{ border: '2px solid #5D4037', borderRadius: 1.2, overflow: 'hidden' }}>
                <Button size="small" sx={{ borderRadius: 0, px: 3, py: 0.6, color: '#5D4037', fontWeight: '1000', fontSize: '0.75rem', '&:hover': { bgcolor: '#E8F5E9' } }} onClick={() => onBulkResolution('rebook')}>
                  ALL RE-BOOK
                </Button>
                <Divider orientation="vertical" flexItem sx={{ borderRightWidth: 2, borderColor: '#5D4037' }} />
                <Button size="small" sx={{ borderRadius: 0, px: 3, py: 0.6, color: '#5D4037', fontWeight: '1000', fontSize: '0.75rem', '&:hover': { bgcolor: '#FFF3E0' } }} onClick={() => onBulkResolution('no-show')}>
                  ALL NO-SHOW
                </Button>
                <Divider orientation="vertical" flexItem sx={{ borderRightWidth: 2, borderColor: '#5D4037' }} />
                <Button size="small" sx={{ borderRadius: 0, px: 3, py: 0.6, color: '#5D4037', fontWeight: '1000', fontSize: '0.75rem', '&:hover': { bgcolor: '#FFEBEE' } }} onClick={() => onBulkResolution('cancel')}>
                  ALL CANCEL
                </Button>
             </Stack>
          </Box>
        )}

        {/* CONTENT AREA: HIGH DENSITY LIST WITH SCROLLING */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 3, bgcolor: '#F5F5F5' }}>
          <Stack spacing={3}>
            {leftoverPatients.map((patient) => {
              const isConfined = patient.status === 'confined';
              const resolution = isConfined ? 'confined' : (patientResolutions[patient.id] || 'cancel');
              
              const milestones = [
                { id: 'booked', label: 'BOOKED', val: patient.createdAt },
                { id: 'scheduled', label: 'SCHED', val: patient.jsScheduled },
                { id: 'arrived', label: 'ARRIVED', val: patient.timeArrived },
                { id: 'started', label: 'STARTED', val: patient.timeStarted }
              ].filter(m => m.val);

              const totalEstMins = (patient.services || []).reduce((sum, s) => sum + (Number(s.duration || s.estMinutes) || 0), 0);
              const totalPrice = (patient.services || []).reduce((sum, s) => sum + (Number(s.price) || 0), 0);

              // THE FIX: DNA Symbol Restoration & Forensic Labeling (Defensive Guards added for Resilience)
              const rawGender = String(patient.petGender || patient.gender || patient.petSex || patient.sex || 'UNKNOWN');
              const upGender = rawGender.toUpperCase();
              const isUnknownGender = !rawGender || upGender === 'UNKNOWN' || upGender === 'SEX UNK' || upGender === '???' || upGender === 'IDENTITY UNKNOWN';
              
              const isFemale = upGender.startsWith('F');
              const isMale = upGender.startsWith('M');

              const petGenderLabel = isUnknownGender ? 'IDENTITY UNKNOWN' : upGender;
              const petGenderColor = isUnknownGender ? '#D32F2F' : '#5D4037';
              
              const petFixedStr = (patient.petIsNeutered || patient.isNeutered) ? 'FIXED' : 'INTACT';

              return (
                <Paper key={patient.id} elevation={0} sx={{ 
                  borderRadius: 1.5, border: '2px solid #5D4037', display: 'flex', bgcolor: 'white',
                  overflow: 'hidden', position: 'relative', height: CARD_HEIGHT
                }}>
                  {/* 1. PATIENT IDENTITY (280px) */}
                  <Box sx={{ width: 280, borderRight: '2px solid #5D4037', p: 2, bgcolor: '#FAFAFA', display: 'flex', flexDirection: 'column' }}>
                     <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                        <Box sx={{ width: 56, height: 56, borderRadius: 1.2, border: '2px solid #5D4037', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#FFF', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                           {getSpeciesIcon(patient.petSpecies)}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                           <Typography variant="h6" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: -0.5, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{patient.petName}</Typography>
                           <Typography variant="caption" sx={{ fontWeight: '1000', color: '#9E9E9E', textTransform: 'uppercase', fontSize: '0.62rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                             {patient.petSpecies || 'UNK'} • {patient.petBreed || 'MIXED'}
                           </Typography>
                           <Typography 
                             variant="caption" 
                             onClick={(e) => handleGenderOpen(e, patient.id)}
                             sx={{ 
                               fontWeight: '1000', color: petGenderColor, textTransform: 'uppercase', fontSize: '0.62rem', 
                               whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 0.5, mt: -0.2,
                               cursor: 'pointer', '&:hover': { opacity: 0.7, textDecoration: 'underline' }
                             }}
                           >
                             {isFemale ? <FemaleIcon sx={{ fontSize: 13, color: '#E91E63' }} /> : isMale ? <MaleIcon sx={{ fontSize: 13, color: '#1976D2' }} /> : <HelpCenterIcon sx={{ fontSize: 13, color: '#D32F2F' }} />}
                             {petGenderLabel} • {petFixedStr}
                           </Typography>
                        </Box>
                     </Stack>

                     <Divider sx={{ mb: 1.5, borderBottomWidth: 2, borderStyle: 'dashed' }} />

                     <Box sx={{ mb: 1 }}>
                        <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', display: 'block', mb: 0.3, letterSpacing: 0.8, fontSize: '0.6rem' }}>OWNER IDENTITY</Typography>
                        <Typography variant="subtitle2" sx={{ fontWeight: '1000', color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{patient.ownerName?.toUpperCase()}</Typography>
                        <Stack spacing={0.3} sx={{ mt: 0.5 }}>
                           {patient.ownerPhone || patient.ownerEmail ? (
                             <>
                               {patient.ownerPhone && (
                                 <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#5D4037', fontWeight: '800', fontSize: '0.6rem' }}>
                                    <SmartphoneIcon sx={{ fontSize: 12 }} /> {patient.ownerPhone}
                                 </Typography>
                               )}
                               {patient.ownerEmail && (
                                 <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#5D4037', fontWeight: '800', opacity: 0.8, fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    <AlternateEmailIcon sx={{ fontSize: 12 }} /> {patient.ownerEmail}
                                 </Typography>
                               )}
                             </>
                           ) : (
                             <Typography variant="caption" sx={{ fontWeight: '1000', color: '#D32F2F', fontSize: '0.6rem', fontStyle: 'italic', opacity: 0.8 }}>
                                NO CONTACT REGISTERED
                             </Typography>
                           )}
                        </Stack>
                     </Box>

                     <Box sx={{ mt: 'auto', p: 1, border: '1px solid #D7CCC8', bgcolor: 'rgba(93, 64, 55, 0.04)' }}>
                        <Typography variant="caption" sx={{ fontWeight: '1000', color: '#5D4037', display: 'block', mb: 0.2, letterSpacing: 0.5, fontSize: '0.55rem' }}>CLOSING STATUS</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                           <Chip 
                              size="small" 
                              label={(() => {
                                 const statusMap = {
                                    'confirmed': 'SCHEDULED',
                                    'pending': 'SCHEDULED',
                                    'arrived': 'ARRIVED',
                                    'in-consult': 'CONSULT',
                                    'dispensing': 'PHARMACY',
                                    'billing': 'PAYMENT',
                                    'done': 'COMPLETED',
                                    'cancelled': 'CANCELLED',
                                    'carried-over': 'CARRIED OVER'
                                 };
                                 const rawStatus = (patient.status || 'unknown').toLowerCase();
                                 return statusMap[rawStatus] || rawStatus.toUpperCase();
                              })()} 
                              sx={{ 
                                 bgcolor: '#E65100', color: 'white', fontWeight: '1000', fontSize: '0.65rem', height: '22px', borderRadius: 1 
                              }} 
                           />
                        </Box>
                     </Box>
                  </Box>

                  {/* 2. SERVICE WATERFALL LEDGER (SYMMETRIC 300px) */}
                  <Box sx={{ width: 300, borderRight: '2px solid #5D4037', bgcolor: '#FFF', display: 'flex', flexDirection: 'column' }}>
                     <Box sx={{ p: 1.2, borderBottom: '1px solid #eee', bgcolor: '#FAFAFA' }}>
                        <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 1, display: 'block', fontSize: '0.6rem' }}>
                          🏥 SERVICES ({patient.services?.length || 0})
                        </Typography>
                     </Box>
                     <List sx={{ p: 0, flex: 1, overflowY: 'auto' }}>
                        {(patient.services || []).map((svc, i) => {
                           const deptObj = (departments || []).find(d => d.name === svc.department);
                           const bColor = deptObj ? deptObj.color : '#616161';
                           return (
                             <ListItem key={i} sx={{ px: 1.2, py: 0.8, borderLeft: `6px solid ${bColor}`, borderBottom: '1px solid #eee', display: 'block' }}>
                               <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                 <Typography variant="caption" sx={{ fontWeight: '1000', textTransform: 'uppercase', fontSize: '0.62rem', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, pr: 1 }}>
                                    {svc.name}
                                 </Typography>
                                 <Typography variant="caption" sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.6rem', textAlign: 'right', minWidth: '40px' }}>
                                    ₱{Number(svc.price || 0).toLocaleString()}
                                 </Typography>
                               </Stack>
                               <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.2 }}>
                                 <Typography variant="caption" sx={{ color: svc.staffName ? '#5D4037' : '#D32F2F', fontWeight: '900', fontSize: '0.55rem', display: 'flex', alignItems: 'center', gap: 0.3 }}>
                                    {svc.staffName ? `👤 ${svc.staffName}` : '❌ UNASSIGNED'}
                                 </Typography>
                                 <Typography variant="caption" sx={{ fontWeight: '800', color: '#9E9E9E', fontSize: '0.55rem' }}>
                                    {svc.duration || svc.estMinutes || 0}M
                                 </Typography>
                               </Stack>
                             </ListItem>
                           );
                        })}
                     </List>
                     <Box sx={{ mt: 'auto', p: 1.5, borderTop: '2px solid #5D4037', bgcolor: '#FAFAFA', display: 'flex', justifyContent: 'space-between' }}>
                         <Box>
                            <Typography variant="caption" sx={{ fontWeight: '1000', color: '#9E9E9E', fontSize: '0.52rem', display: 'block' }}>EST. TIME</Typography>
                            <Typography sx={{ fontWeight: '1000', fontSize: '0.75rem', color: '#5D4037' }}>{totalEstMins}M</Typography>
                         </Box>
                         <Box sx={{ textAlign: 'right' }}>
                            <Typography variant="caption" sx={{ fontWeight: '1000', color: '#9E9E9E', fontSize: '0.52rem', display: 'block' }}>TOTAL VALUE</Typography>
                            <Typography sx={{ fontWeight: '1000', fontSize: '0.75rem', color: '#1B5E20' }}>₱{totalPrice.toLocaleString()}</Typography>
                         </Box>
                     </Box>
                  </Box>

                  {/* 3. FORENSIC TEMPORAL AUDIT (SYMMETRIC 300px) */}
                  <Box sx={{ width: 300, borderRight: '2px solid #5D4037', bgcolor: '#FAFAFA', p: 1.5, display: 'flex', flexDirection: 'column' }}>
                     <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                        <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 1.2, fontSize: '0.6rem' }}>
                           ⌛ {ancestorData[patient.id] ? `DAY ${ancestorData[patient.id].caseDay}` : `DAY ${patient.caseDay || 1}`} • {ancestorData[patient.id]?.dateLabel || 'TEMPORAL AUDIT'}
                        </Typography>
                        <Stack direction="row" spacing={0.5}>
                           <IconButton 
                             size="small" 
                             onClick={() => handleFetchHistory(patient)} 
                             disabled={!!ancestorData[patient.id] || loadingHistory[patient.id]}
                             sx={{ border: '1px solid #D7CCC8' }}
                           >
                              {loadingHistory[patient.id] ? <CircularProgress size={12} /> : <ArrowBackIosNewIcon sx={{ fontSize: 10 }} />}
                           </IconButton>
                           <IconButton 
                             size="small" 
                             onClick={() => setAncestorData(prev => { const d = {...prev}; delete d[patient.id]; return d; })} 
                             disabled={!ancestorData[patient.id]}
                             sx={{ border: '1px solid #D7CCC8' }}
                           >
                              <ArrowForwardIosIcon sx={{ fontSize: 10 }} />
                           </IconButton>
                        </Stack>
                     </Stack>
                     
                     <Stack spacing={1.5} sx={{ position: 'relative', pl: 2.2, flex: 1, overflowY: 'auto' }}>
                        <Box sx={{ position: 'absolute', left: 8, top: 4, bottom: 4, width: '2px', borderLeft: '2px dashed #D7CCC8' }} />
                        {(ancestorData[patient.id]?.milestones || milestones).map((m, idx) => {
                           const date = m.val.toDate ? m.val.toDate() : new Date(m.val);
                           const isLast = idx === (ancestorData[patient.id]?.milestones || milestones).length - 1;
                           
                           let metricLabel = null;
                           if (m.id === 'arrived') {
                             const schVal = patient.jsScheduled;
                             if (schVal) {
                               const schD = schVal.toDate ? schVal.toDate() : new Date(schVal);
                               const diff = Math.floor((date - schD) / 60000);
                               metricLabel = `Punctuality: ${formatDuration(diff)} ${diff > 0 ? 'Late' : 'Early'}`;
                             }
                           } else if (m.id === 'started') {
                             const arr = (ancestorData[patient.id]?.milestones || milestones).find(i => i.id === 'arrived');
                             if (arr) {
                               const arrD = arr.val.toDate ? arr.val.toDate() : new Date(arr.val);
                               metricLabel = `Lobby Wait: ${formatDuration(Math.floor((date - arrD) / 60000))}`;
                             }
                           }

                           return (
                             <Box key={m.id} sx={{ position: 'relative' }}>
                               <Box sx={{ position: 'absolute', left: -20, top: 4, width: 8, height: 8, borderRadius: '50%', bgcolor: isLast ? '#2E7D32' : '#9E9E9E', border: '2px solid white' }} />
                               <Typography variant="caption" sx={{ fontWeight: '1000', color: isLast ? '#2E7D32' : '#9E9E9E', fontSize: '0.58rem', display: 'block', letterSpacing: 0.3 }}>{m.label}</Typography>
                               <Typography sx={{ fontWeight: '1000', fontSize: '0.8rem', color: '#1A1A1A' }}>
                                 {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                               </Typography>
                               {metricLabel && (
                                 <Typography variant="caption" sx={{ fontStyle: 'italic', fontWeight: '1000', fontSize: '0.55rem', color: '#5D4037', mt: -0.2, display: 'block', textTransform: 'uppercase' }}>
                                    ↳ {metricLabel}
                                 </Typography>
                               )}
                             </Box>
                           );
                        })}
                     </Stack>

                     <Box sx={{ mt: 'auto', pt: 1.5, borderTop: '2px solid #5D4037', display: 'flex', justifyContent: 'space-between' }}>
                         <Box>
                            <Typography variant="caption" sx={{ fontWeight: '1000', color: '#9E9E9E', fontSize: '0.52rem', display: 'block' }}>PUNCTUALITY</Typography>
                            <Typography sx={{ fontWeight: '1000', fontSize: '0.75rem', color: '#2E7D32' }}>
                               {(() => {
                                  const arr = (ancestorData[patient.id]?.milestones || milestones).find(i => i.id === 'arrived');
                                  const schVal = patient.jsScheduled;
                                  if (!arr || !schVal) return 'N/A';
                                  const arrD = arr.val.toDate ? arr.val.toDate() : new Date(arr.val);
                                  const schD = schVal.toDate ? schVal.toDate() : new Date(schVal);
                                  const diff = Math.floor((arrD - schD) / 60000);
                                  if (Math.abs(diff) <= 5) return 'ON-TIME';
                                  return `${formatDuration(Math.abs(diff))} ${diff > 0 ? 'LATE' : 'EARLY'}`;
                               })()}
                            </Typography>
                         </Box>
                         <Box sx={{ textAlign: 'right' }}>
                            <Typography variant="caption" sx={{ fontWeight: '1000', color: '#9E9E9E', fontSize: '0.52rem', display: 'block' }}>TOTAL WAIT</Typography>
                            <Typography sx={{ fontWeight: '1000', fontSize: '0.75rem', color: '#5D4037' }}>
                               {(() => {
                                  const arr = (ancestorData[patient.id]?.milestones || milestones).find(i => i.id === 'arrived');
                                  if (!arr) return 'N/A';
                                  const arrD = arr.val.toDate ? arr.val.toDate() : new Date(arr.val);
                                  return formatDuration(Math.floor((new Date() - arrD) / 60000));
                               })()}
                            </Typography>
                         </Box>
                     </Box>
                  </Box>

                  {/* 4. RECOMMENDATION & VERDICT (FLEX) */}
                  <Box sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column' }}>
                     <Box sx={{ p: 1.5, bgcolor: resolution === 'rebook' ? '#FFF9C4' : resolution === 'no-show' ? '#FFEBEE' : '#F5F5F5', border: '1px solid #D7CCC8', borderRadius: 1.2, mb: 1.5, transition: 'all 0.2s ease-out' }}>
                        <Typography variant="caption" sx={{ fontWeight: '1000', color: '#5D4037', textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 0.3, fontSize: '0.6rem' }}>
                           🧠 {resolution === 'cancel' ? 'FORENSIC ALERT' : resolution === 'rebook' ? 'RECOVERY ADVISORY' : 'CLINICAL INTELLIGENCE'}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: '1000', color: '#1A1A1A', fontSize: '0.78rem', lineHeight: 1.4 }}>
                           {(() => {
                              const scenarioMap = {
                                 'in-consult': "CRITICAL: Consult unfinished.",
                                 'dispensing': "FINANCIAL RISK: Pharmacy items unbilled.",
                                 'arrived': "SERVICE FAILURE: Patient never seen.",
                                 'pending': "RECORD EXPIRED: No-show detected.",
                                 'confirmed': "RECORD EXPIRED: No-show detected."
                              };
                              const advisoryMap = {
                                 'rebook': `📍 RECOVERY PLAN: Prioritizing record for ${new Date(targetDates[patient.id] || new Date().setDate(new Date().getDate() + 1)).toLocaleDateString()}. Medical notes preserved.`,
                                 'no-show': "⚠️ AUDIT WARNING: Flagged as No-Show. Clinic policy for deposits may apply.",
                                 'cancel': "🚨 DATA PURGE: Record archived as Cancelled. No revenue captured."
                              };
                              return `${scenarioMap[patient.status] || 'UNFINISHED RECORD:'} ${advisoryMap[resolution]}`;
                           })()}
                        </Typography>
                     </Box>

                     <Box sx={{ mt: 'auto' }}>
                        <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 2, display: 'block', mb: 1, fontSize: '0.6rem' }}>
                           FORENSIC VERDICT
                        </Typography>
                        <ToggleButtonGroup
                           value={resolution}
                           exclusive
                           onChange={(e, newAction) => { if(newAction) onResolutionChange(patient.id, newAction) }}
                           sx={{ 
                             width: '100%', gap: 0.8,
                             '& .MuiToggleButton-root': { 
                               borderRadius: 1.2, border: '2px solid #5D4037 !important', flex: 1, height: '36px',
                               fontWeight: '1000', textTransform: 'uppercase', letterSpacing: 1.2, fontSize: '0.68rem',
                               bgcolor: '#FFF',
                               '&.Mui-selected': { bgcolor: '#5D4037', color: 'white', '&:hover': { bgcolor: '#3E2723' } }
                             }
                           }}
                        >
                           <ToggleButton value="rebook"><EventRepeatIcon sx={{mr:0.5, fontSize: 16}} /> Re-book</ToggleButton>
                           <ToggleButton value="no-show"><HelpOutlineIcon sx={{mr:0.5, fontSize: 16}} /> No-Show</ToggleButton>
                           <ToggleButton value="cancel"><DoNotDisturbIcon sx={{mr:0.5, fontSize: 16}} /> Cancel</ToggleButton>
                        </ToggleButtonGroup>
                        
                        {resolution === 'rebook' && (
                           <Box sx={{ mt: 1.2, p: 1, border: '2px solid #5D4037', borderRadius: 1.2, bgcolor: '#FFF6E0', animation: 'slideIn 0.2s ease-out' }}>
                              <style>{`@keyframes slideIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }`}</style>
                              <Typography variant="caption" sx={{ fontWeight: '1000', color: '#5D4037', display: 'block', mb: 0.8, fontSize: '0.6rem', letterSpacing: 0.5 }}>
                                 🗓️ TARGET CLINICAL WINDOW
                              </Typography>
                              
                              <Stack spacing={1.5}>
                                 <Stack direction="row" spacing={0.5}>
                                    {[
                                      { label: 'TOMORROW', days: 1 },
                                      { label: '+2 DAYS', days: 2 },
                                      { label: 'NEXT WEEK', days: 7 }
                                    ].map((pick) => {
                                      const d = new Date(); d.setDate(d.getDate() + pick.days);
                                      const dateStr = d.toISOString().split('T')[0];
                                      const isActive = targetDates[patient.id] === dateStr || (!targetDates[patient.id] && pick.days === 1);
                                      
                                      return (
                                        <Button 
                                          key={pick.label}
                                          size="small" 
                                          variant={isActive ? "contained" : "outlined"}
                                          onClick={() => setTargetDates(prev => ({ ...prev, [patient.id]: dateStr }))}
                                          sx={{ 
                                             flex: 1, fontSize: '0.55rem', fontWeight: '1000', py: 0.2, 
                                             bgcolor: isActive ? '#5D4037' : 'transparent',
                                             color: isActive ? 'white' : '#5D4037',
                                             borderColor: '#5D4037',
                                             '&:hover': { bgcolor: isActive ? '#3E2723' : 'rgba(93, 64, 55, 0.05)', borderColor: '#5D4037' }
                                          }}
                                        >
                                           {pick.label}
                                        </Button>
                                      );
                                    })}
                                 </Stack>

                                 <TextField 
                                    label="MANUAL DATE PICKER"
                                    type="date"
                                    size="small"
                                    fullWidth
                                    value={targetDates[patient.id] || new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0]}
                                    onChange={(e) => setTargetDates(prev => ({ ...prev, [patient.id]: e.target.value }))}
                                    inputProps={{ sx: { fontWeight: '1000', fontSize: '0.8rem', bgcolor: 'white', borderRadius: 1 } }}
                                    InputLabelProps={{ shrink: true, sx: { fontSize: '0.65rem', fontWeight: 1000, color: '#5D4037' } }}
                                    sx={{ mt: 1 }}
                                 />
                              </Stack>
                           </Box>
                        )}
                     </Box>
                  </Box>
                </Paper>
              );
            })}
          </Stack>
        </Box>

        {/* FOOTER */}
        <Box sx={{ px: 3, py: 2, borderTop: '2px solid #5D4037', display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'white' }}>
           <Typography variant="caption" sx={{ fontWeight: '1000', color: '#9E9E9E', maxWidth: '600px', lineHeight: 1.3, fontSize: '0.72rem' }}>
              RECONCILIATION PROTOCOL: Historical records analyzed here will be purged from the live grid and transitioned to permanent clinical archive. Processing will unlock the current day's queue.
           </Typography>
           
           <Stack direction="row" spacing={2}>
              <Button 
                variant={exitConfirm ? "contained" : "outlined"} 
                onClick={handleExitClick}
                sx={{ 
                   borderRadius: 1.5, 
                   borderColor: '#5D4037', 
                   bgcolor: exitConfirm ? '#5D4037' : 'transparent',
                   color: exitConfirm ? 'white' : '#5D4037', 
                   fontWeight: '1000', px: 4,
                   '&:hover': { 
                      bgcolor: exitConfirm ? '#3E2723' : 'rgba(93, 64, 55, 0.05)', 
                      borderColor: '#3E2723' 
                   },
                   transition: 'all 0.2s ease-out'
                }}
              >
                {exitConfirm ? "CONFIRM EXIT?" : "EXIT AUDIT"}
              </Button>

              <Button 
                variant="contained" 
                onClick={handleProcessClick}
                sx={{ 
                  borderRadius: 1.5, 
                  bgcolor: isConfirming ? '#E65100' : '#D32F2F', 
                  color: 'white', fontWeight: '1000', px: 5, py: 1.2,
                  '&:hover': { bgcolor: isConfirming ? '#BF360C' : '#B71C1C' }, 
                  boxShadow: isConfirming ? '0 8px 24px rgba(230, 81, 0, 0.4)' : '0 8px 16px rgba(211, 47, 47, 0.3)', 
                  letterSpacing: 1.5, fontSize: '0.9rem'
                }}
              >
                {isConfirming ? "⚠️ ARE YOU SURE? CLICK TO CONFIRM" : "PROCESS & UNLOCK QUEUE"}
              </Button>
           </Stack>
        </Box>

        {/* CLINICAL DNA OVERRIDE MENU */}
        <Menu
          anchorEl={genderAnchor}
          open={Boolean(genderAnchor)}
          onClose={() => setGenderAnchor(null)}
          PaperProps={{ sx: { border: '2px solid #5D4037', borderRadius: 1.2, mt: 1 } }}
        >
          <MenuItem onClick={() => handleGenderSelect('Male')}>
             <ListItemIcon><MaleIcon sx={{ color: '#1976D2' }} /></ListItemIcon>
             <ListItemText primary="SET AS MALE" primaryTypographyProps={{ fontWeight: 1000, fontSize: '0.75rem' }} />
          </MenuItem>
          <MenuItem onClick={() => handleGenderSelect('Female')}>
             <ListItemIcon><FemaleIcon sx={{ color: '#E91E63' }} /></ListItemIcon>
             <ListItemText primary="SET AS FEMALE" primaryTypographyProps={{ fontWeight: 1000, fontSize: '0.75rem' }} />
          </MenuItem>
          <Divider />
          <MenuItem onClick={() => setGenderAnchor(null)} sx={{ color: '#9E9E9E' }}>
             <ListItemText primary="CANCEL" primaryTypographyProps={{ fontWeight: 1000, fontSize: '0.75rem', textAlign: 'center' }} />
          </MenuItem>
        </Menu>
      </Paper>
    </Box>
  );
}