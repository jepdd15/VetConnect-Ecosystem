import React, { useState } from 'react';
import {
    Box, Typography, Button, Stack, Paper,
    ToggleButtonGroup, ToggleButton, List, ListItem, Divider,
    Menu, MenuItem, ListItemIcon, ListItemText, IconButton, TextField, CircularProgress,
    Chip, Tabs, Tab, Badge
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
import { getDoc, doc, query, collection, where, orderBy, limit, getDocs, onSnapshot, updateDoc } from 'firebase/firestore';
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

// --- 🛰️ FORENSIC TEMPORAL ENGINE (Aligned with Queue.jsx) ---
const getLocalDateStr = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// --- 📡 MEMOIZED AUDIT CARD: THE PERFORMANCE CURE ---
const AuditPatientCard = React.memo(({
    patient, resolution, targetDate, auditReason, realTimeStatus, tabMode, ancestorData, loadingHistory, departments,
    onResolutionChange, onAuditReasonChange, onFetchHistory, onClearHistory, onGenderOpen, CARD_HEIGHT
}) => {
    // PHASE 4.4.2.5: LOCAL-FIRST FOCUS SHIELD
    const [localReason, setLocalReason] = useState(auditReason || "");

    // Keep pulse in sync if external props change (e.g. Batch Action)
    React.useEffect(() => {
        setLocalReason(auditReason || "");
    }, [auditReason]);

    const [expandedNotes, setExpandedNotes] = useState({});
    const toggleNote = (id) => setExpandedNotes(prev => ({ ...prev, [id]: !prev[id] }));

    const handleReasonChange = (newVal) => {
        setLocalReason(newVal);
        onAuditReasonChange(patient.id, newVal);
    };
    // --- 🧬 CHRONOS DATE-INDEXING ENGINE (V2 UNIFICATION) ---
    const uniqueDates = React.useMemo(() => {
        const pulse = patient.clinicalPulse || [];
        if (pulse.length === 0) return [new Date().toDateString()];
        
        const dates = [...new Set(pulse.map(p => {
            const d = p.timestamp?.toDate ? p.timestamp.toDate() : new Date(p.timestamp);
            return d.toDateString();
        }))].sort((a,b) => new Date(a) - new Date(b));
        return dates;
    }, [patient.clinicalPulse]);

    const [activeCaseDay, setActiveCaseDay] = useState(uniqueDates.length - 1);

    // --- ⚓ TEMPORAL ANCHOR (THE MIDNIGHT DETERRENT) ---
    const operationalEnd = React.useMemo(() => {
        const targetDateStr = uniqueDates[activeCaseDay];
        const todayStr = new Date().toDateString();

        if (targetDateStr === todayStr) {
            return new Date(); // LIVE CLOCK for Today
        } else {
            // CAPPED at Midnight of that day (Operationally Fixed)
            const endOfDay = new Date(targetDateStr);
            endOfDay.setHours(23, 59, 59, 999);
            return endOfDay;
        }
    }, [uniqueDates, activeCaseDay]);

    const filteredPulse = React.useMemo(() => {
        const pulse = patient.clinicalPulse || [];
        const targetDateStr = uniqueDates[activeCaseDay];
        return pulse.filter(p => {
            const d = p.timestamp?.toDate ? p.timestamp.toDate() : new Date(p.timestamp);
            return d.toDateString() === targetDateStr;
        });
    }, [patient.clinicalPulse, uniqueDates, activeCaseDay]);

    const milestones = React.useMemo(() => {
        const pulse = patient.clinicalPulse || [];
        const voidedIds = new Set(pulse.filter(p => p.correctedEventId).map(p => p.correctedEventId));

        if (filteredPulse.length === 0 && activeCaseDay === 0) {
            // FALLBACK: If Day 1 Pulse is missing, use basic static milestones
            return [
                { id: 'booked', label: 'BOOKED', val: patient.createdAt },
                { id: 'scheduled', label: 'SCHED', val: patient.jsScheduled },
                { id: 'arrived', label: 'ARRIVED', val: patient.timeArrived, by: patient.arrivedBy },
                { id: 'started', label: 'STARTED', val: patient.timeStarted, by: patient.startedBy }
            ].filter(m => m.val);
        }
        return filteredPulse.map(p => ({
            id: p.eventId,
            label: p.toStatus ? p.toStatus.toUpperCase() : (p.type || 'EVENT'),
            val: p.timestamp,
            by: p.staffName,
            isVoided: voidedIds.has(p.eventId), 
            type: p.type,
            note: p.note
        }));
    }, [filteredPulse, patient, activeCaseDay]);

    const totalEstMins = (patient.services || []).reduce((sum, s) => sum + (Number(s.duration || s.estMinutes) || 0), 0);
    const totalPrice = (patient.services || []).reduce((sum, s) => sum + (Number(s.price) || 0), 0);

    const rawGender = String(patient.petGender || patient.gender || patient.petSex || patient.sex || 'UNKNOWN');
    const upGender = rawGender.toUpperCase();
    const isUnknownGender = !rawGender || upGender === 'UNKNOWN' || upGender === 'SEX UNK' || upGender === '???' || upGender === 'IDENTITY UNKNOWN';
    const isFemale = upGender.startsWith('F');
    const isMale = upGender.startsWith('M');
    const petGenderLabel = isUnknownGender ? 'IDENTITY UNKNOWN' : upGender;
    const petGenderColor = isUnknownGender ? '#D32F2F' : '#5D4037';
    const petFixedStr = (patient.petIsNeutered || patient.isNeutered) ? 'FIXED' : 'INTACT';

    // INTAKE AGE CALCULATION (Absolute Objective Days)
    const intakeDate = patient.createdAt?.toDate ? patient.createdAt.toDate() : new Date(patient.createdAt);
    const intakeAgeDays = Math.floor((new Date() - intakeDate) / (1000 * 60 * 60 * 24));
    const intakeAgeLabel = intakeAgeDays === 0 ? "INTAKE AGE: <1 DAY" : `INTAKE AGE: ${intakeAgeDays} ${intakeAgeDays === 1 ? 'DAY' : 'DAYS'}`;

    // PHASE 1: FORENSIC TIERS
    const rawStatus = (patient.status || 'unknown').toLowerCase();
    const isHighStakes = ['arrived', 'in-consult', 'dispensing', 'billing', 'confirmed', 'payment'].includes(rawStatus);
    const isPhysical = ['arrived', 'in-consult', 'dispensing', 'billing', 'payment'].includes(rawStatus);
    const forensicColor = tabMode === 1 ? '#E65100' : (tabMode === 2 ? '#D32F2F' : '#5D4037');
    const clinicalBorder = '#000000'; // SOLID BLACK FORENSIC ARCHITECTURE
    const forensicBg = '#FFF'; // SOLID WHITE BASELINE

    // PHASE 5: REAL-TIME HUD
    const isResolvedRemotely = ['completed', 'done', 'cancelled', 'no-show', 'carried-over'].includes((realTimeStatus || "").toLowerCase());

    return (
        <Paper elevation={0} sx={{
            borderRadius: 1.5,
            border: isResolvedRemotely ? '2px solid #2E7D32' : `2px solid ${clinicalBorder}`,
            display: 'flex', bgcolor: isResolvedRemotely ? 'rgba(46, 125, 50, 0.05)' : forensicBg,
            overflow: 'hidden', position: 'relative', minHeight: CARD_HEIGHT,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            opacity: isResolvedRemotely ? 0.8 : 1,
            pointerEvents: isResolvedRemotely ? 'none' : 'auto'
        }}>
            {/* REMOTE RESOLUTION BANNER */}
            {isResolvedRemotely && (
                <Box sx={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(2px)'
                }}>
                    <Box sx={{
                        bgcolor: '#2E7D32', color: 'white', px: 4, py: 1.5, borderRadius: 10,
                        display: 'flex', alignItems: 'center', gap: 2, boxShadow: '0 8px 24px rgba(46, 125, 50, 0.4)'
                    }}>
                        <AutoFixHighIcon />
                        <Typography variant="h6" sx={{ fontWeight: 1000, letterSpacing: 1.5 }}>✅ RESOLVED REMOTELY (SYNCED)</Typography>
                    </Box>
                </Box>
            )}
            {/* 1. PATIENT IDENTITY (280px) */}
            <Box sx={{ width: 280, borderRight: `1px solid ${clinicalBorder}`, p: 2, bgcolor: '#FFF', display: 'flex', flexDirection: 'column' }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                    <Box sx={{ width: 56, height: 56, borderRadius: 1.2, border: `2px solid ${forensicColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#FFF', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        {getSpeciesIcon(patient.petSpecies)}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h6" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: -0.5, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{patient.petName}</Typography>
                        <Typography variant="caption" sx={{ fontWeight: '1000', color: '#9E9E9E', textTransform: 'uppercase', fontSize: '0.62rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                            {patient.petSpecies || 'UNK'} • {patient.petBreed || 'MIXED'} 
                            {patient.petColor ? ` • ${patient.petColor.toUpperCase()}` : ''}
                        </Typography>
                        <Typography
                            variant="caption"
                            onClick={(e) => onGenderOpen(e, patient.id)}
                            sx={{
                                fontWeight: '1000', color: petGenderColor, textTransform: 'uppercase', fontSize: '0.62rem',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 0.5, mt: -0.2,
                                cursor: 'pointer', '&:hover': { opacity: 0.7, textDecoration: 'underline' }
                            }}
                        >
                            {isFemale ? <FemaleIcon sx={{ fontSize: 13, color: '#E91E63' }} /> : isMale ? <MaleIcon sx={{ fontSize: 13, color: '#1976D2' }} /> : <HelpCenterIcon sx={{ fontSize: 13, color: '#D32F2F' }} />}
                            {petGenderLabel} • {petFixedStr} {patient.petWeight ? ` • ${patient.petWeight}kg` : ''}
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

                <Box sx={{ mt: 'auto', p: 1.5, borderTop: `1px solid ${clinicalBorder}`, bgcolor: '#FFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="caption" sx={{ fontWeight: '1000', color: '#9E9E9E', display: 'block', mb: 0.2, letterSpacing: 0.5, fontSize: '0.52rem' }}>CLOSING STATUS</Typography>
                    </Box>
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
                            bgcolor: '#E65100', color: 'white', fontWeight: '1000', fontSize: '0.62rem', height: '18px', borderRadius: 1
                        }}
                    />
                </Box>
            </Box>

            {/* 2. SERVICE WATERFALL LEDGER (SYMMETRIC 300px) */}
            <Box sx={{ width: 300, borderRight: `1px solid ${clinicalBorder}`, bgcolor: '#FFF', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ p: 1.2, borderBottom: `1px solid ${clinicalBorder}`, bgcolor: '#FFF' }}>
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
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography variant="caption" sx={{ fontWeight: '1000', textTransform: 'uppercase', fontSize: '0.62rem', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, pr: 1 }}>
                                        {svc.name}
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.6rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        ({svc.duration || svc.estMinutes || 0}M • ₱{Number(svc.price || 0).toLocaleString()})
                                    </Typography>
                                </Stack>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.2 }}>
                                    <Typography variant="caption" sx={{ color: svc.staffName ? '#5D4037' : '#D32F2F', fontWeight: '900', fontSize: '0.55rem', display: 'flex', alignItems: 'center', gap: 0.3 }}>
                                        {svc.staffName ? `👤 ${svc.staffName}` : '❌ UNASSIGNED'}
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontWeight: '800', color: '#9E9E9E', fontSize: '0.55rem', textTransform: 'uppercase' }}>
                                        {svc.department || 'GEN'}
                                    </Typography>
                                </Stack>
                            </ListItem>
                        );
                    })}
                </List>
                <Box sx={{ mt: 'auto', p: 1.5, borderTop: `1px solid ${clinicalBorder}`, bgcolor: '#FFF', display: 'flex', justifyContent: 'space-between' }}>
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
            <Box sx={{ width: 300, borderRight: `1px solid ${clinicalBorder}`, bgcolor: '#FFF', p: 1.5, display: 'flex', flexDirection: 'column' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                    <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 1.2, fontSize: '0.6rem' }}>
                        ⌛ DAY {activeCaseDay + 1} OF {uniqueDates.length} • {uniqueDates[activeCaseDay]}
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                        <IconButton
                            size="small"
                            onClick={() => setActiveCaseDay(prev => Math.max(0, prev - 1))}
                            disabled={activeCaseDay === 0}
                            sx={{ border: '1px solid #D7CCC8' }}
                        >
                            <ArrowBackIosNewIcon sx={{ fontSize: 10 }} />
                        </IconButton>
                        <IconButton
                            size="small"
                            onClick={() => setActiveCaseDay(prev => Math.min(uniqueDates.length - 1, prev + 1))}
                            disabled={activeCaseDay === uniqueDates.length - 1}
                            sx={{ border: '1px solid #D7CCC8' }}
                        >
                            <ArrowForwardIosIcon sx={{ fontSize: 10 }} />
                        </IconButton>
                    </Stack>
                </Stack>

                <Stack spacing={1.5} sx={{ position: 'relative', pl: 2.2, flex: 1, overflowY: 'auto' }}>
                    <Box sx={{ position: 'absolute', left: 8, top: 4, bottom: 4, width: '2px', borderLeft: '2px dashed #D7CCC8' }} />
                    {(ancestorData?.milestones || milestones).map((m, idx) => {
                        const date = m.val.toDate ? m.val.toDate() : new Date(m.val);
                        const isLast = idx === (ancestorData?.milestones || milestones).length - 1;

                        let metricLabel = null;
                        if (m.id === 'arrived') {
                            const schVal = patient.jsScheduled;
                            if (schVal) {
                                const schD = schVal.toDate ? schVal.toDate() : new Date(schVal);
                                const diff = Math.floor((date - schD) / 60000);
                                metricLabel = `Punctuality: ${formatDuration(diff)} ${diff > 0 ? 'Late' : 'Early'}`;
                            }
                        } else if (m.id === 'started') {
                            const arr = (ancestorData?.milestones || milestones).find(i => i.id === 'arrived');
                            if (arr) {
                                const arrD = arr.val.toDate ? arr.val.toDate() : new Date(arr.val);
                                metricLabel = `Lobby Wait: ${formatDuration(Math.floor((date - arrD) / 60000))}`;
                            }
                        }

                        return (
                            <Box key={m.id || idx} sx={{ position: 'relative', opacity: m.isVoided ? 0.4 : 1 }}>
                                <Box sx={{ position: 'absolute', left: -20, top: 4, width: 8, height: 8, borderRadius: '50%', bgcolor: m.isVoided ? '#BDBDBD' : (isLast ? '#2E7D32' : '#9E9E9E'), border: '2px solid white' }} />
                                <Typography variant="caption" sx={{ 
                                    fontWeight: '1000', 
                                    color: m.isVoided ? '#BDBDBD' : (isLast ? '#2E7D32' : '#9E9E9E'), 
                                    fontSize: '0.58rem', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: 0.5, 
                                    letterSpacing: 0.3 
                                }}>
                                    {m.label}
                                    {m.isVoided && <Chip label="REVERTED" size="small" sx={{ height: 12, fontSize: '0.45rem', fontWeight: 1000, bgcolor: '#FFEBEE', color: '#D32F2F', borderRadius: 0.5 }} />}
                                </Typography>
                                <Typography sx={{ 
                                    fontWeight: '1000', 
                                    fontSize: '0.8rem', 
                                    color: m.isVoided ? '#9E9E9E' : '#1A1A1A',
                                    textDecoration: m.isVoided ? 'line-through' : 'none'
                                }}>
                                    {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    {m.by && <span style={{ fontWeight: '1000', marginLeft: '6px', fontSize: '0.75rem', color: m.isVoided ? '#9E9E9E' : '#1A1A1A' }}>● {m.by}</span>}
                                </Typography>
                                {m.note && (
                                    <Typography variant="caption" sx={{ 
                                        fontStyle: 'italic', 
                                        color: '#5D4037', 
                                        fontWeight: '800', 
                                        fontSize: '0.62rem',
                                        lineHeight: 1.3,
                                        display: 'block',
                                        textDecoration: m.isVoided ? 'line-through' : 'none',
                                        opacity: m.isVoided ? 0.6 : 1,
                                        whiteSpace: 'pre-wrap',
                                        mt: 0.5,
                                        cursor: 'pointer'
                                    }} onClick={() => toggleNote(m.id)}>
                                        ↳ {(!expandedNotes[m.id] && m.note.length > 60) ? `${m.note.substring(0, 57)}...` : m.note}
                                        {m.note.length > 60 && <span style={{ color: '#1976D2', marginLeft: '4px', fontWeight: '1000' }}>[{expandedNotes[m.id] ? 'LESS' : 'MORE'}]</span>}
                                    </Typography>
                                )}
                                {metricLabel && !m.isVoided && (
                                    <Typography variant="caption" sx={{ fontStyle: 'italic', fontWeight: '1000', fontSize: '0.55rem', color: '#5D4037', mt: 0.5, display: 'block', textTransform: 'uppercase' }}>
                                        ↳ {metricLabel}
                                    </Typography>
                                )}
                            </Box>
                        );
                    })}
                </Stack>

                <Box sx={{ mt: 'auto', pt: 1.5, borderTop: `2px solid ${forensicColor}`, display: 'flex', justifyContent: 'space-between' }}>
                    <Box>
                        <Typography variant="caption" sx={{ fontWeight: '1000', color: '#9E9E9E', fontSize: '0.52rem', display: 'block' }}>PUNCTUALITY</Typography>
                        <Typography sx={{ fontWeight: '1000', fontSize: '0.75rem', color: '#2E7D32' }}>
                            {(() => {
                                const arr = milestones.find(i => i.label === 'ARRIVED');
                                const schVal = patient.jsScheduled;
                                if (!arr || !schVal) return 'N/A';
                                const arrD = arr.val.toDate ? arr.val.toDate() : new Date(arr.val);
                                const schD = schVal.toDate ? schVal.toDate() : new Date(schVal);
                                
                                // Anchor to operationalEnd for historical punctuality
                                const diff = Math.floor((Math.min(arrD, operationalEnd) - schD) / 60000);
                                if (Math.abs(diff) <= 5) return 'ON-TIME';
                                return `${formatDuration(Math.abs(diff))} ${diff > 0 ? 'LATE' : 'EARLY'}`;
                            })()}
                        </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ fontWeight: '1000', color: '#9E9E9E', fontSize: '0.52rem', display: 'block' }}>TOTAL WAIT</Typography>
                        <Typography sx={{ fontWeight: '1000', fontSize: '0.75rem', color: '#5D4037' }}>
                            {(() => {
                                const arr = milestones.find(i => i.label === 'ARRIVED');
                                if (!arr) return 'N/A';
                                const arrD = arr.val.toDate ? arr.val.toDate() : new Date(arr.val);
                                return formatDuration(Math.floor((operationalEnd - arrD) / 60000));
                            })()}
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {/* 4. RECOMMENDATION & VERDICT (FLEX - EXPANDS ON TRIAGE) */}
            <Box sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', pb: resolution ? 4 : 2 }}>
                <Box sx={{ p: 1.5, bgcolor: !resolution ? '#F5F5F5' : (isHighStakes ? '#FFF9C4' : (resolution === 'rebook' ? '#FFF9C4' : resolution === 'no-show' ? '#FFEBEE' : '#F5F5F5')), border: `2px solid ${forensicColor}`, borderRadius: 1.2, mb: 1.5, transition: 'all 0.2s ease-out' }}>
                    {(() => {
                        const scenarioMap = {
                            'in-consult': "Patient is mid-consult and requires record closing.",
                            'dispensing': "Pharmacy items are unbilled and require a final inventory audit.",
                            'payment': "Invoice is currently unpaid and requires reconciliation.",
                            'arrived': "Patient arrived but was never seen by a clinician.",
                            'pending': "Pending online clinical request awaiting triage.",
                            'confirmed': "Patient was scheduled but never arrived at the clinic."
                        };
                        const advisoryMap = {
                            'rebook': "Move this record to the next operational shift.",
                            'defer': "Carry this request forward for triage in the next shift.",
                            'carry-over': "Carry this active patient forward for treatment in the next shift.",
                            'no-show': "Mark the patient as absent for today's appointment.",
                            'cancel': "Archive this record as a cancellation and clear it from the queue."
                        };

                        const scenarioText = scenarioMap[rawStatus] || 'Unfinished record detected.';
                        const advisoryText = resolution ? advisoryMap[resolution] : null;

                        return (
                            <>
                                <Typography variant="body2" sx={{ fontWeight: '1000', color: '#1A1A1A', fontSize: '0.78rem', lineHeight: 1.4 }}>
                                    {scenarioText}
                                </Typography>
                                {advisoryText ? (
                                    <Typography variant="body2" sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.78rem', mt: 0.5 }}>
                                        Action: {advisoryText}
                                    </Typography>
                                ) : (
                                    <Typography variant="body2" sx={{ fontWeight: '1000', color: '#9E9E9E', fontSize: '0.78rem', mt: 0.5, fontStyle: 'italic' }}>
                                        Decision required: Select a resolution below.
                                    </Typography>
                                )}
                            </>
                        );
                    })()}

                    <Typography variant="overline" sx={{ fontWeight: '1000', color: forensicColor, mt: 1, display: 'block', letterSpacing: 1.5, opacity: 0.8, fontSize: '0.65rem' }}>
                        {intakeAgeLabel}
                    </Typography>
                </Box>

                <Box sx={{ mt: 'auto' }}>
                    <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 2, display: 'block', mb: 1, fontSize: '0.6rem' }}>
                        TRIAGE RESOLUTION
                    </Typography>
                    <ToggleButtonGroup
                        value={resolution}
                        exclusive
                        onChange={(e, newAction) => {
                            onResolutionChange(patient.id, newAction);
                        }}
                        sx={{
                            width: '100%', gap: 0.8,
                            '& .MuiToggleButton-root': {
                                borderRadius: 1.2, border: `2px solid ${forensicColor} !important`, flex: 1, height: '36px',
                                fontWeight: '1000', textTransform: 'uppercase', letterSpacing: 1.2, fontSize: '0.68rem',
                                bgcolor: '#FFF',
                                '&.Mui-selected': { bgcolor: forensicColor, color: 'white', '&:hover': { bgcolor: '#E65100' } }
                            }
                        }}
                    >
                        {/* 📡 ONLINE SILO ACTIONS */}
                        {tabMode === 0 && (
                            <ToggleButton value="defer"><AutoFixHighIcon sx={{ mr: 0.5, fontSize: 16 }} /> Defer</ToggleButton>
                        )}
                        {tabMode === 0 && (
                            <ToggleButton value="rebook"><EventRepeatIcon sx={{ mr: 0.5, fontSize: 16 }} /> Reschedule</ToggleButton>
                        )}

                        {/* 📅 SCHEDULED / 🚑 ACTIVE ACTIONS */}
                        {tabMode !== 0 && (
                            <ToggleButton value={tabMode === 2 ? 'carry-over' : 'rebook'}>
                                <EventRepeatIcon sx={{ mr: 0.5, fontSize: 16 }} /> {tabMode === 2 ? 'Carry-over' : 'Reschedule'}
                            </ToggleButton>
                        )}

                        {/* ABSENTEEISM ONLY FOR SCHEDULED TAB */}
                        {tabMode === 1 && (
                            <ToggleButton value="no-show"><HelpOutlineIcon sx={{ mr: 0.5, fontSize: 16 }} /> No-Show</ToggleButton>
                        )}

                        <ToggleButton value="cancel"><DoNotDisturbIcon sx={{ mr: 0.5, fontSize: 16 }} /> Cancel</ToggleButton>
                    </ToggleButtonGroup>

                    {/* UNIVERSAL REASON FOR EVERY RESOLUTION */}
                    {resolution && (
                        <Box sx={{ mt: 1.5, p: 1, border: `2px solid ${forensicColor}`, borderRadius: 1.2, bgcolor: isHighStakes ? '#FFF9C4' : '#FAFAFA', animation: 'slideIn 0.2s ease-out' }}>
                            <Typography variant="caption" sx={{ fontWeight: '1000', color: forensicColor, display: 'block', mb: 0.8, fontSize: '0.6rem', letterSpacing: 0.5 }}>
                                ✍️ MANDATORY FORENSIC JUSTIFICATION
                            </Typography>
                            <TextField
                                fullWidth
                                multiline
                                rows={2}
                                placeholder="Provide clinical justification for this resolution (Required)"
                                value={localReason}
                                onChange={(e) => handleReasonChange(e.target.value)}
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        fontWeight: '900', fontSize: '0.75rem', bgcolor: 'white',
                                        '& fieldset': { borderColor: !auditReason ? '#D32F2F' : forensicColor }
                                    }
                                }}
                            />
                            {!auditReason && (
                                <Typography variant="caption" sx={{ color: '#D32F2F', fontWeight: '1000', fontSize: '0.55rem', mt: 0.5, display: 'block' }}>
                                    🛑 LOCK ACTIVE: This action requires a forensic justification.
                                </Typography>
                            )}
                        </Box>
                    )}

                    {resolution === 'rebook' && (
                        <Box sx={{ mt: 1.2, p: 1, border: `2px solid ${forensicColor}`, borderRadius: 1.2, bgcolor: '#FFF6E0', animation: 'slideIn 0.2s ease-out' }}>
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
                                        const dateStr = getLocalDateStr(d);
                                        const isActive = targetDate === dateStr || (!targetDate && pick.days === 1);

                                        return (
                                            <Button
                                                key={pick.label}
                                                size="small"
                                                variant={isActive ? "contained" : "outlined"}
                                                onClick={() => onResolutionChange(patient.id, resolution, dateStr)}
                                                sx={{
                                                    flex: 1, fontSize: '0.55rem', fontWeight: '1000', py: 0.2,
                                                    bgcolor: isActive ? forensicColor : 'transparent',
                                                    color: isActive ? 'white' : forensicColor,
                                                    borderColor: forensicColor,
                                                    '&:hover': { bgcolor: isActive ? '#E65100' : 'rgba(255, 160, 0, 0.05)', borderColor: forensicColor }
                                                }}
                                            >
                                                {pick.label}
                                            </Button>
                                        );
                                    })}
                                </Stack>
                            </Stack>
                        </Box>
                    )}
                </Box>
            </Box>
        </Paper>
    );
});

const EndOfDayModal = React.memo(({
    open, leftoverPatients, patientResolutions, touchedPatients, auditReasons, targetDates,
    onResolutionChange, onAuditReasonChange, onBulkResolution, onConfirmReset, isForced, departments, onClose
}) => {
    const [activeTab, setActiveTab] = useState(0);

    // PHASE 5: THE LIVE PULSE - TIER 1 (Anti-Stale Guard)
    const [realTimeStatuses, setRealTimeStatuses] = useState({});
    const [loadingRealTime, setLoadingRealTime] = useState(false);

    // PHASE 6: BATCH FORENSIC LITERACY
    const [bulkReason, setBulkReason] = useState("");
    const [stagedBulkAction, setStagedBulkAction] = useState(null); // PHASE 5.6.19: STAGED BATCHING

    // SILO FILTERING LOGIC
    const siloOnline = leftoverPatients.filter(p => (p.status || "").toLowerCase() === 'pending');
    const siloScheduled = leftoverPatients.filter(p => ['confirmed', 'scheduled'].includes((p.status || "").toLowerCase()));
    const siloActive = leftoverPatients.filter(p => ['arrived', 'in-consult', 'dispensing', 'billing', 'payment', 'confined', 'on-hold'].includes((p.status || "").toLowerCase()));

    const currentSiloPatients = activeTab === 0 ? siloOnline : activeTab === 1 ? siloScheduled : siloActive;

    // --- 🛰️ THE LIVE HUD SYNC (STALE DATA GUARD) ---
    React.useEffect(() => {
        if (!open || leftoverPatients.length === 0) return;

        setLoadingRealTime(true);
        const ids = leftoverPatients.map(p => p.id);

        // We listen to the appointments collection for these specific IDs
        const q = query(collection(db, "appointments"), where("__name__", "in", ids));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const statuses = {};
            snapshot.docs.forEach(doc => {
                statuses[doc.id] = doc.data().status;
            });
            setRealTimeStatuses(statuses);
            setLoadingRealTime(false);
        }, (err) => {
            console.error("Forensic Sync Failure:", err);
        });

        return () => unsubscribe();
    }, [open, leftoverPatients]);

    // RESET STAGED ACTION ON TAB CHANGE
    React.useEffect(() => {
        setStagedBulkAction(null);
        setBulkReason(""); // Clear the reason too to keep the logic clean
    }, [activeTab]);

    // PHASE 4: THE FORENSIC GATE LOCK (MULTI-SILO AWARE)
    // PHASE 4.4.2: THE UNIVERSAL FORENSIC LOCK
    const isGateLocked = leftoverPatients.some(p => {
        const rawStatus = (p.status || 'unknown').toLowerCase();
        const rtStatus = (realTimeStatuses[p.id] || rawStatus).toLowerCase();

        // THE PHYSICAL INTEGRITY CHECK: If they are RESOLVED remotely, they are UNLOCKED for triage
        const isResolvedRemotely = ['completed', 'done', 'cancelled', 'no-show', 'carried-over'].includes(rtStatus);
        if (isResolvedRemotely) return false;

        // We check if the record has a valid resolution
        const resolution = patientResolutions[p.id];
        const hasReason = auditReasons[p.id]?.trim()?.length > 0;

        // Logic: Every record MUST have a resolution selected
        if (!resolution) return true;

        // UNIVERSAL AUDIT: Every action REQUIRES a manual forensic reason
        if (!hasReason) return true;

        return false;
    });

    const resolvedCount = leftoverPatients.filter(p => !!patientResolutions[p.id] || ['completed', 'done', 'cancelled', 'no-show', 'carried-over'].includes((realTimeStatuses[p.id] || p.status || "").toLowerCase())).length;
    const pendingTriageCount = leftoverPatients.length - resolvedCount;

    // PHASE 6: SILO-AWARE PRE-FLIGHT CENSUS
    const census = {
        defer: 0,
        rebook: 0,
        carryOver: 0,
        noShow: 0,
        cancel: 0
    };

    leftoverPatients.forEach(p => {
        const res = patientResolutions[p.id];
        if (!res) return;

        const rawStatus = (p.status || "").toLowerCase();
        const isActive = ['arrived', 'in-consult', 'dispensing', 'billing', 'payment', 'on-hold', 'confined'].includes(rawStatus);

        if (res === 'defer') census.defer++;
        else if (res === 'no-show') census.noShow++;
        else if (res === 'cancel') census.cancel++;
        else if (res === 'rebook') {
            if (isActive) census.carryOver++;
            else census.rebook++;
        }
    });

    const [isConfirming, setIsConfirming] = useState(false);
    const [exitConfirm, setExitConfirm] = useState(false);

    // DNA CORRECTION STATE
    const [genderAnchor, setGenderAnchor] = useState(null);
    const [targetedPid, setTargetedPid] = useState(null);

    // SCHEDULING & ANCESTRY STATE
    const [ancestorData, setAncestorData] = useState({}); // { pid: { milestones: [], currentIdx: 0 } }
    const [loadingHistory, setLoadingHistory] = useState({});

    const handleProcessClick = React.useCallback(() => {
        if (!isConfirming) {
            setIsConfirming(true);
        } else {
            onConfirmReset(targetDates);
            setIsConfirming(false);
        }
    }, [isConfirming, onConfirmReset, targetDates]);

    const handleFetchHistory = React.useCallback(async (patient) => {
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
    }, [leftoverPatients]);

    const handleExitClick = () => {
        if (!exitConfirm) {
            setExitConfirm(true);
        } else {
            onClose();
            setExitConfirm(false);
        }
    };

    const handleGenderOpen = React.useCallback((e, pid) => {
        setTargetedPid(pid);
        setGenderAnchor(e.currentTarget);
    }, []);

    const handleGenderSelect = async (gender) => {
        // Here we simulate healing the local record for the session
        const p = leftoverPatients.find(item => item.id === targetedPid);
        if (p) {
            p.petGender = gender;
            p.gender = gender; // Ensure all keys are healed locally

            // --- 🧬 ATOMIC HEALING: Preserve clinical data immediately! ---
            if (p.petId) {
                try {
                    await updateDoc(doc(db, "pets", p.petId), { gender: gender });
                    console.log(`[Atomic Healing] Hit Database: Healed ${p.petName} gender to ${gender}`);
                } catch (e) {
                    console.error("Atomic Healing Failed:", e);
                }
            }
        }
        setGenderAnchor(null);
    };

    const handleClearHistory = React.useCallback((id) => {
        setAncestorData(prev => {
            const d = { ...prev };
            delete d[id];
            return d;
        });
    }, []);

    if (!open) return null;

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
                boxShadow: '0 32px 100px rgba(93, 64, 55, 0.45)',
                position: 'relative' // THE ANCHOR: Ensure center absolute positioning works for the shield
            }}>
                {/* THE CENTRAL CENSUS SHIELD: High-Impact Final Review */}
                {isConfirming && (
                    <Box sx={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        width: 'max-content', minWidth: '550px', bgcolor: '#3E2723', color: 'white', borderRadius: 4,
                        p: 5, boxShadow: '0 32px 100px rgba(0,0,0,0.8)', zIndex: 100,
                        border: '3px solid #FFD180',
                        animation: 'centerPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                    }}>
                        <style>{`@keyframes centerPop { from { opacity: 0; transform: translate(-50%, -40%) scale(0.9); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }`}</style>
                        <Typography variant="overline" sx={{ fontWeight: 1000, letterSpacing: 4, textAlign: 'center', display: 'block', mb: 3, color: '#FFD180', fontSize: '1rem' }}>
                            🛡️ FINAL CLINICAL TRIAGE SIGN-OFF
                        </Typography>

                        <Stack direction="row" spacing={4} justifyContent="center" sx={{ bgcolor: 'rgba(0,0,0,0.3)', p: 3, borderRadius: 2, mb: 3 }}>
                            <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="h2" sx={{ fontWeight: 1000, color: '#81C784' }}>{census.defer}</Typography>
                                <Typography variant="caption" sx={{ fontWeight: 900, opacity: 0.9, letterSpacing: 1.5 }}>DEFER</Typography>
                            </Box>
                            <Divider orientation="vertical" flexItem sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />
                            <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="h2" sx={{ fontWeight: 1000, color: '#4FC3F7' }}>{census.rebook}</Typography>
                                <Typography variant="caption" sx={{ fontWeight: 900, opacity: 0.9, letterSpacing: 1.5 }}>RESCHEDULE</Typography>
                            </Box>
                            <Divider orientation="vertical" flexItem sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />
                            <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="h2" sx={{ fontWeight: 1000, color: '#64B5F6' }}>{census.carryOver}</Typography>
                                <Typography variant="caption" sx={{ fontWeight: 900, opacity: 0.9, letterSpacing: 1.5 }}>CARRY OVER</Typography>
                            </Box>
                            <Divider orientation="vertical" flexItem sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />
                            <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="h2" sx={{ fontWeight: 1000, color: '#FFB74D' }}>{census.noShow}</Typography>
                                <Typography variant="caption" sx={{ fontWeight: 900, opacity: 0.9, letterSpacing: 1.5 }}>NO-SHOW</Typography>
                            </Box>
                            <Divider orientation="vertical" flexItem sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />
                            <Box sx={{ textAlign: 'center' }}>
                                <Typography variant="h2" sx={{ fontWeight: 1000, color: '#E57373' }}>{census.cancel}</Typography>
                                <Typography variant="caption" sx={{ fontWeight: 900, opacity: 0.9, letterSpacing: 1.5 }}>CANCEL</Typography>
                            </Box>
                        </Stack>

                        <Typography variant="body2" sx={{ textAlign: 'center', opacity: 0.8, fontWeight: '800', fontStyle: 'italic', fontSize: '0.9rem' }}>
                            Verifying 100% forensic resolution for <strong>{leftoverPatients.length} medical records</strong>.
                            <br />
                            This action will permanently archive all resolved sessions.
                        </Typography>
                    </Box>
                )}

                {/* HEADER: CLINICAL ZOOM STYLE */}
                <Box sx={{
                    bgcolor: '#5D4037', color: 'white', p: 2.5,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ width: '100%' }}>
                        <WarningAmberIcon fontSize="large" sx={{ color: '#FFD180' }} />
                        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Typography variant="h5" sx={{ fontWeight: '1000', textTransform: 'uppercase', whiteSpace: 'nowrap', letterSpacing: 1.2, fontSize: '1.25rem' }}>
                                QUEUE INTEGRITY WIZARD
                            </Typography>
                            <Box sx={{ flex: 1, borderBottom: '2px dashed rgba(255,255,255,0.3)', mx: 1, height: '2px' }} />

                            {/* SILO TABS: THE CLINICAL SEGMENTATION */}
                            <Tabs
                                value={activeTab}
                                onChange={(e, v) => setActiveTab(v)}
                                textColor="inherit"
                                indicatorColor="primary"
                                sx={{
                                    '& .MuiTabs-indicator': { backgroundColor: '#FFD180', height: 4 },
                                    '& .MuiTab-root': { color: 'rgba(255,255,255,0.7)', fontWeight: 1000, fontSize: '0.85rem' },
                                    '& .Mui-selected': { color: '#FFD180 !important' }
                                }}
                            >
                                <Tab label={
                                    <Badge badgeContent={siloOnline.length} color="secondary" invisible={siloOnline.length === 0} sx={{ px: 1 }}>
                                        📡 ONLINE
                                    </Badge>
                                } />
                                <Tab label={
                                    <Badge badgeContent={siloScheduled.length} color="secondary" invisible={siloScheduled.length === 0} sx={{ px: 1 }}>
                                        📅 SCHEDULED
                                    </Badge>
                                } />
                                <Tab label={
                                    <Badge badgeContent={siloActive.length} color="secondary" invisible={siloActive.length === 0} sx={{ px: 1 }}>
                                        🚑 ACTIVE
                                    </Badge>
                                } />
                            </Tabs>
                        </Box>
                    </Stack>
                </Box>

                {/* 🕹️ BATCH COMMAND STRIP (Phase 5.6.19: Action-First Architecture) */}
                {currentSiloPatients.length > 0 && (
                    <Box sx={{ 
                        px: 3, py: 1.5, bgcolor: '#FAFAFA', borderBottom: '2px solid #5D4037', 
                        display: 'flex', alignItems: 'center', gap: 2, 
                        transition: 'all 0.3s ease-in-out'
                    }}>
                        {/* 1. BATCH ACTION BUTTONS */}
                        <Stack direction="row" sx={{ border: '2px solid #5D4037', borderRadius: 1.2, overflow: 'hidden', bgcolor: '#FFF' }}>
                            {activeTab === 0 ? (
                                <>
                                    <Button
                                        size="small"
                                        sx={{ borderRadius: 0, px: 3, py: 0.6, color: '#2E7D32', fontWeight: '1000', fontSize: '0.75rem', '&:hover': { bgcolor: '#E8F5E9' } }}
                                        onClick={() => setStagedBulkAction('defer')}
                                    >
                                        BATCH: DEFER ALL ({currentSiloPatients.length})
                                    </Button>
                                    <Divider orientation="vertical" flexItem sx={{ borderRightWidth: 2, borderColor: '#5D4037' }} />
                                    <Button
                                        size="small"
                                        sx={{ borderRadius: 0, px: 3, py: 0.6, color: '#8B4513', fontWeight: '1000', fontSize: '0.75rem', '&:hover': { bgcolor: '#FFF3E0' } }}
                                        onClick={() => setStagedBulkAction('rebook')}
                                    >
                                        BATCH: RESCHEDULE ALL
                                    </Button>
                                </>
                            ) : activeTab === 1 ? (
                                <>
                                    <Button
                                        size="small"
                                        sx={{ borderRadius: 0, px: 3, py: 0.6, color: '#E65100', fontWeight: '1000', fontSize: '0.75rem', '&:hover': { bgcolor: '#FFF3E0' } }}
                                        onClick={() => setStagedBulkAction('no-show')}
                                    >
                                        BATCH: NO-SHOW ALL ({currentSiloPatients.length})
                                    </Button>
                                    <Divider orientation="vertical" flexItem sx={{ borderRightWidth: 2, borderColor: '#5D4037' }} />
                                    <Button
                                        size="small"
                                        sx={{ borderRadius: 0, px: 3, py: 0.6, color: '#8B4513', fontWeight: '1000', fontSize: '0.75rem', '&:hover': { bgcolor: '#FFF3E0' } }}
                                        onClick={() => setStagedBulkAction('rebook')}
                                    >
                                        BATCH: RESCHEDULE ALL
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button
                                        size="small"
                                        sx={{ borderRadius: 0, px: 3, py: 0.6, color: '#1B5E20', fontWeight: '1000', fontSize: '0.75rem', '&:hover': { bgcolor: '#E8F5E9' } }}
                                        onClick={() => setStagedBulkAction('carry-over')}
                                    >
                                        BATCH: CARRY-OVER ALL ({currentSiloPatients.length})
                                    </Button>
                                </>
                            )}
                            <Divider orientation="vertical" flexItem sx={{ borderRightWidth: 2, borderColor: '#5D4037' }} />
                            <Button
                                size="small"
                                sx={{ borderRadius: 0, px: 3, py: 0.6, color: '#D32F2F', fontWeight: '1000', fontSize: '0.75rem', '&:hover': { bgcolor: '#FFEBEE' } }}
                                onClick={() => setStagedBulkAction('cancel')}
                            >
                                BATCH: CANCEL ALL
                            </Button>
                        </Stack>

                        {/* 2. DYNAMIC STAGING AREA */}
                        {stagedBulkAction && (
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, animation: 'slideInRight 0.3s ease-out' }}>
                                <Divider orientation="vertical" flexItem sx={{ height: 24, borderRightWidth: 2, borderColor: '#D7CCC8' }} />
                                <Typography variant="caption" sx={{ fontWeight: 1000, color: '#5D4037', whiteSpace: 'nowrap' }}>
                                    ✍️ REASON FOR {currentSiloPatients.length} {stagedBulkAction.toUpperCase()}S:
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="Enter universal clinical justification..."
                                    variant="standard"
                                    value={bulkReason}
                                    onChange={(e) => setBulkReason(e.target.value)}
                                    InputProps={{ disableUnderline: true, sx: { fontSize: '0.75rem', fontWeight: 900 } }}
                                    autoFocus
                                />
                                <Stack direction="row" spacing={0.5}>
                                    <IconButton size="small" onClick={() => onBulkResolution(stagedBulkAction, bulkReason)} sx={{ color: '#2E7D32', border: '1px solid #2E7D32' }}>
                                        <AutoFixHighIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => setStagedBulkAction(null)} sx={{ color: '#D32F2F', border: '1px solid #D32F2F' }}>
                                        <DoNotDisturbIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </Stack>
                            </Box>
                        )}
                    </Box>
                )}

                {/* CONTENT AREA: SILO-SPECIFIC LIST */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: 3, bgcolor: '#F5F5F5' }}>
                    <Stack spacing={3}>
                        {currentSiloPatients.map((patient) => (
                            <AuditPatientCard
                                key={patient.id}
                                patient={patient}
                                tabMode={activeTab} // 0: Online, 1: Scheduled, 2: Active
                                resolution={patient.status === 'confined' ? 'confined' : patientResolutions[patient.id]}
                                targetDate={targetDates[patient.id]}
                                auditReason={auditReasons[patient.id]}
                                realTimeStatus={realTimeStatuses[patient.id]}
                                ancestorData={ancestorData[patient.id]}
                                loadingHistory={loadingHistory[patient.id]}
                                departments={departments}
                                onResolutionChange={onResolutionChange}
                                onAuditReasonChange={onAuditReasonChange}
                                onFetchHistory={handleFetchHistory}
                                onClearHistory={handleClearHistory}
                                onGenderOpen={handleGenderOpen}
                                CARD_HEIGHT={CARD_HEIGHT}
                            />
                        ))}
                    </Stack>
                </Box>

                {/* FOOTER: PRE-FLIGHT SUMMARY SHIELD */}
                <Box sx={{
                    px: 3, py: 2, borderTop: '2px solid #5D4037',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    bgcolor: isConfirming ? '#FFF8E1' : 'white', // Warm review amber
                    position: 'relative', transition: 'all 0.3s ease'
                }}>
                    {/* THE CENTRAL CENSUS SHIELD: MOVED TO MAIN CONTAINER FOR CENTERING */}

                    <Typography variant="caption" sx={{ fontWeight: '1000', color: isForced ? '#D32F2F' : '#9E9E9E', maxWidth: '400px', lineHeight: 1.3, fontSize: '0.72rem' }}>
                        {isForced
                            ? "MANDATORY RECOVERY: System detected unresolved cases. Forensic sign-off required."
                            : "RECOVERY PROTOCOL: Resolved records will be transitioned to the permanent clinical archive."
                        }
                    </Typography>

                    <Stack direction="row" spacing={2}>
                        {(!isForced || isConfirming) && (
                            <Button
                                variant="outlined"
                                onClick={() => {
                                    if (isConfirming) setIsConfirming(false);
                                    else handleExitClick();
                                }}
                                sx={{
                                    borderRadius: 1.5, borderColor: '#5D4037', color: '#5D4037',
                                    fontWeight: '1000', px: 3,
                                    '&:hover': { bgcolor: '#F5F5F5', borderColor: '#3E2723' }
                                }}
                            >
                                {isConfirming ? "GO BACK & EDIT" : (exitConfirm ? "CANCEL EXIT" : "EXIT AUDIT")}
                            </Button>
                        )}

                        <Button
                            variant="contained"
                            onClick={handleProcessClick}
                            disabled={isGateLocked}
                            sx={{
                                borderRadius: 1.5,
                                bgcolor: isGateLocked ? '#BDBDBD' : (isConfirming ? '#E65100' : '#D32F2F'),
                                color: 'white', fontWeight: '1000', px: 5, py: 1.2,
                                '&:hover': { bgcolor: isConfirming ? '#BF360C' : '#B71C1C' },
                                boxShadow: isGateLocked ? 'none' : (isConfirming ? '0 8px 24px rgba(230, 81, 0, 0.4)' : '0 8px 16px rgba(211, 47, 47, 0.3)'),
                                letterSpacing: 1.5, fontSize: '0.9rem',
                                '&.Mui-disabled': { bgcolor: '#BDBDBD', color: 'rgba(255,255,255,0.7)', border: '2px solid rgba(0,0,0,0.1)' }
                            }}
                        >
                            {isGateLocked ? `🔒 ${pendingTriageCount} RECORD(S) PENDING AUDIT` : (isConfirming ? "⚠️ CONFIRM TRIAGE SIGN-OFF" : "PROCESS & UNLOCK QUEUE")}
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
});

export default EndOfDayModal;
