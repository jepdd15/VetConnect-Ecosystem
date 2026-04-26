import React from 'react';
import { Box, Typography, Chip, Tooltip, IconButton, Button, Stack, Paper } from '@mui/material';
import { STATUS } from '../../utils/statusConstants';
import { formatDuration } from '../../utils/pulseUtils';

// Icons
import CheckCircleIcon from '@mui/icons-material/CheckCircle'; 
import PlayCircleFilledWhiteIcon from '@mui/icons-material/PlayCircleFilledWhite'; 
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk'; 
import LocalHospitalIcon from '@mui/icons-material/LocalHospital'; 
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'; 
import PaidIcon from '@mui/icons-material/Paid';
import PersonAddIcon from '@mui/icons-material/PersonAdd'; 
import MoreVertIcon from '@mui/icons-material/MoreVert'; 
import SmartphoneIcon from '@mui/icons-material/Smartphone'; 
import AccessTimeIcon from '@mui/icons-material/AccessTime'; 
import PauseCircleIcon from '@mui/icons-material/PauseCircle'; 
import WarningIcon from '@mui/icons-material/Warning';
import PhoneIcon from '@mui/icons-material/Phone';
import PersonIcon from '@mui/icons-material/Person';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ScaleIcon from '@mui/icons-material/Scale';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import EventNoteIcon from '@mui/icons-material/EventNote';
import UndoIcon from '@mui/icons-material/Undo';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';

const calculateAgeString = (dob, isAgeExact) => {
    if (!dob) return "AGE UNKNOWN";
    const birthDate = dob.toDate ? dob.toDate() : new Date(dob);
    const now = new Date();
    let years = now.getFullYear() - birthDate.getFullYear();
    let months = now.getMonth() - birthDate.getMonth();
    if (months < 0) {
        years--;
        months += 12;
    }
    const ageBase = years > 0 ? `${years}y ${months}m` : `${months}m`;
    return isAgeExact === false ? `${ageBase} (EST)` : ageBase;
};

export const getQueueColumns = (tabValue, currentTime, actions, isToday, departments, isTomorrow, clinicSettings) => [
  { 
    field: 'identity', headerName: 'Patient Identity', flex: 1, minWidth: 220, 
    resizable: false, sortable: false, disableColumnMenu: true,
    renderCell: (p) => {
      const isWalkIn = p.row.isWalkIn === true || p.row.ownerId === 'WALK_IN_USER' || String(p.row.ownerId).includes('GUEST_') || p.row.ticketPrefix === 'W' || p.row.ticketPrefix === 'E';
      const petAllergies = p.row.petAllergies || p.row.allergies || '';
      const hasSpecificAllergies = petAllergies.trim().length > 0 && petAllergies.toUpperCase() !== 'NONE';
      const petAge = calculateAgeString(p.row.petBirthdate, p.row.isAgeExact);

      const PassportCard = (
        <Box sx={{ p: 1, minWidth: 220 }}>
            <Typography variant="overline" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 1.5, display: 'block', mb: 1, opacity: 0.8 }}>
                🩺 CLINICAL PASSPORT
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: '1000', color: '#1A1A1A', mb: 2, fontSize: '1.2rem', lineHeight: 1 }}>
                {p.row.petName?.toUpperCase()}
            </Typography>
            
            <Stack spacing={1.2}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: '#5D4037', fontWeight: '1000', fontSize: '0.65rem', letterSpacing: 0.5 }}>SPECIES</Typography>
                    <Typography sx={{ color: '#1A1A1A', fontWeight: '900', fontSize: '0.85rem' }}>{p.row.petSpecies?.toUpperCase()}</Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: '#5D4037', fontWeight: '1000', fontSize: '0.65rem', letterSpacing: 0.5 }}>GENDER</Typography>
                    <Typography sx={{ color: '#1A1A1A', fontWeight: '900', fontSize: '0.85rem' }}>{p.row.petGender?.toUpperCase() || 'UNKNOWN'}</Typography>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: '#5D4037', fontWeight: '1000', fontSize: '0.65rem', letterSpacing: 0.5 }}>AGE</Typography>
                    <Typography sx={{ color: p.row.petBirthdate ? '#1A1A1A' : '#D32F2F', fontWeight: '900', fontSize: '0.85rem' }}>
                        {petAge}
                    </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: '#5D4037', fontWeight: '1000', fontSize: '0.65rem', letterSpacing: 0.5 }}>BREED</Typography>
                    <Typography sx={{ color: '#1A1A1A', fontWeight: '900', fontSize: '0.82rem' }}>{p.row.petBreed || 'Mixed Breed'}</Typography>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 0.5, borderTop: '1px dashed #D7CCC8' }}>
                    <Typography variant="caption" sx={{ color: '#5D4037', fontWeight: '1000', fontSize: '0.65rem', letterSpacing: 0.5 }}>SURGICAL</Typography>
                    <Chip size="small" label={p.row.petIsNeutered ? 'FIXED' : 'INTACT'} sx={{ height: 18, fontSize: '0.6rem', fontWeight: '1000', bgcolor: p.row.petIsNeutered ? '#E8F5E9' : '#FFF3E0', color: p.row.petIsNeutered ? '#2E7D32' : '#E65100', borderRadius: '4px' }} />
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: '#5D4037', fontWeight: '1000', fontSize: '0.65rem', letterSpacing: 0.5 }}>WEIGHT</Typography>
                    <Typography sx={{ color: '#1A1A1A', fontWeight: '900', fontSize: '0.85rem' }}>{p.row.petWeight ? `${p.row.petWeight} KG` : 'WEIGH REQUIRED'}</Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: '#5D4037', fontWeight: '1000', fontSize: '0.65rem', letterSpacing: 0.5 }}>COLOR / MARKINGS</Typography>
                    <Typography sx={{ color: '#1A1A1A', fontWeight: '900', fontSize: '0.82rem', maxWidth: 120, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.row.color || p.row.petColor || 'NOT RECORDED'}
                    </Typography>
                </Box>

                {/* 🧬 FORENSIC ALLERGY HARDENING: THE VERIFIED NEGATIVE */}
                {/* 🧬 FORENSIC ALLERGY HARDENING: THE ATOMIC ALERT */}
                {hasSpecificAllergies ? (
                     <Box sx={{ mt: 1, p: 0.8, bgcolor: 'rgba(211, 47, 47, 0.05)', borderRadius: 1, border: '1.5px solid #D32F2F' }}>
                        <Typography variant="caption" sx={{ color: '#D32F2F', fontWeight: '1000', fontSize: '0.65rem', display: 'block', mb: 1 }}>
                            ⚠️ CRITICAL MEDICAL ALERTS:
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {petAllergies.split(',').map((allergy, index) => (
                                <Box key={index} sx={{ bgcolor: '#D32F2F', color: 'white', px: 0.8, py: 0.2, borderRadius: '4px', fontSize: '0.65rem', fontWeight: '1000', textTransform: 'uppercase' }}>
                                    {allergy.trim()}
                                </Box>
                            ))}
                        </Box>
                     </Box>
                ) : (
                    <Box sx={{ mt: 1, p: 0.8, bgcolor: '#F5F5F5', borderRadius: 1, border: '1px solid #E0E0E0', opacity: 0.8 }}>
                        <Typography variant="caption" sx={{ color: '#757575', fontWeight: '1000', fontSize: '0.62rem' }}>
                            ✅ ALLERGIES: NONE DISCLOSED
                        </Typography>
                    </Box>
                )}
            </Stack>
        </Box>
      );
      
      // ── VISIT GROUP DISPLAY HELPERS ──────────────────────────────
      const groupSize  = p.row._visitGroupSize  || 0;
      const groupIndex = p.row._visitGroupIndex || 0;
      const isInGroup  = groupSize > 1;
      const isGroupHeader = p.row.isGroupHeader === true;
      // Non-header group members share the queue number — dim the ticket anchor
      const isDimTicket = isInGroup && !isGroupHeader && p.row.queueNumber;

      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', py: 0.5, px: 0.5, overflow: 'hidden', height: '100%', justifyContent: 'center' }}>

          {/* ── MULTI-PET VISIT HEADER CHIP (group header row only) ── */}
          {isGroupHeader && (
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <Box sx={{
                bgcolor: '#3ABEF9',
                color: '#1A1A1A',
                px: 1,
                py: 0.2,
                borderRadius: 0,
                border: '1.5px solid #1A1A1A',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
              }}>
                <Typography sx={{ fontSize: '0.6rem', fontWeight: '900', letterSpacing: '0.08em', lineHeight: 1 }}>
                  MULTI-PET VISIT ({groupSize})
                </Typography>
              </Box>
            </Box>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', overflow: 'hidden' }}>
            {/* THE TICKET ANCHOR (DYNAMIC) */}
            <Box sx={{
                width: 56, height: 56, borderRadius: 0, mr: 2, flexShrink: 0,
                bgcolor: p.row.queueNumber ? (isDimTicket ? '#F5F5F5' : '#FFF3E0') : '#F5F5F5',
                border: '2px solid', borderColor: p.row.queueNumber ? (isDimTicket ? '#E0E0E0' : '#FFB74D') : '#EEEEEE',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                opacity: isDimTicket ? 0.45 : 1,
                boxShadow: isDimTicket ? 'none' : '0 2px 8px rgba(0,0,0,0.04)',
            }}>
              {p.row.queueNumber ? (
                <>
                  <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: '900', color: isDimTicket ? '#9E9E9E' : '#E65100', lineHeight: 1 }}>
                    {p.row.ticketPrefix || 'TKT'}
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: '900', color: isDimTicket ? '#9E9E9E' : '#D32F2F', lineHeight: 1, fontSize: '1.4rem' }}>
                    {p.row.queueNumber}
                  </Typography>
                  {/* Position indicator for non-header group members */}
                  {isDimTicket && (
                    <Typography sx={{ fontSize: '0.55rem', fontWeight: '900', color: '#9E9E9E', lineHeight: 1 }}>
                      {groupIndex + 1}/{groupSize}
                    </Typography>
                  )}
                </>
              ) : (
                  <LocalHospitalIcon sx={{ fontSize: 24, color: '#BDBDBD', opacity: 0.8 }} />
              )}
            </Box>

            <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0, justifyContent: 'center' }}>
              <Box
                  onMouseEnter={(e) => actions.handleHoverStart(e, 'identity', PassportCard)}
                  onMouseLeave={actions.handleHoverEnd}
                  sx={{ display: 'flex', flexDirection: 'column', width: '100%', cursor: 'zoom-in', gap: 0 }}
              >
                  {/* LINE 1: THE PATIENT HERO + SELF CHECK-IN BADGE + GROUP POSITION */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                    <Typography sx={{ fontSize: '1.25rem', fontWeight: '1000', color: '#1A1A1A', lineHeight: 1.1, letterSpacing: '-0.02rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {p.row.petName}
                    </Typography>
                    {/* Group position badge: (1/3), (2/3), etc. */}
                    {isInGroup && (
                      <Box sx={{
                        bgcolor: '#3E2723',
                        color: 'white',
                        px: 0.7,
                        py: 0.15,
                        borderRadius: 0,
                        flexShrink: 0,
                        lineHeight: 1,
                      }}>
                        <Typography sx={{ fontSize: '0.6rem', fontWeight: '900', lineHeight: 1 }}>
                          {groupIndex + 1}/{groupSize}
                        </Typography>
                      </Box>
                    )}
                    {p.row.selfCheckedIn && (
                      <Chip
                        label="SELF"
                        size="small"
                        sx={{
                          fontSize: '0.55rem',
                          height: 16,
                          fontWeight: '1000',
                          bgcolor: '#E8F5E9',
                          color: '#2E7D32',
                          border: '1px solid #2E7D32',
                          borderRadius: 0,
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </Box>

                  {/* LINE 2: THE SEMANTIC ANCHOR (SPECIES * BREED) */}
                  <Typography variant="caption" sx={{ color: '#795548', fontWeight: '900', fontSize: '0.75rem', textTransform: 'uppercase', lineHeight: 1.3, letterSpacing: '0.02rem' }}>
                      {String(p.row.petSpecies || 'PET')} ★ {String(p.row.petBreed || 'Mixed Breed')}
                  </Typography>

                  {/* LINE 3: THE WAITING ROOM ANCHOR (HUMAN) */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.2 }}>
                      {isWalkIn ? <DirectionsWalkIcon sx={{ fontSize: 13, color: 'rgba(0,0,0,0.4)' }} /> : <SmartphoneIcon sx={{ fontSize: 13, color: '#1976D2' }} />}
                      <Typography variant="caption" sx={{ fontSize: '0.85rem', fontWeight: '800', color: '#5D4037', textTransform: 'uppercase', letterSpacing: '0.01rem', lineHeight: 1 }}>
                          {p.row.ownerName || 'Online Client'}
                      </Typography>
                      {hasSpecificAllergies && (
                          <Tooltip title={`Allergies: ${petAllergies}`}>
                              <WarningIcon sx={{ fontSize: 14, color: '#D32F2F' }} />
                          </Tooltip>
                      )}
                  </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      );
    }
  },
  ...(tabValue === 0 ? [{
    field: 'intakeAge', headerName: 'Intake Age', width: 140, sortable: false, disableColumnMenu: true,
    renderCell: (p) => {
        const intakeDate = p.row.createdAt?.toDate ? p.row.createdAt.toDate() : new Date(p.row.createdAt);
        const days = Math.floor((currentTime - intakeDate) / (1000 * 60 * 60 * 24));
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', width: '100%' }}>
                <Typography sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '1rem' }}>
                    {days === 0 ? '< 1 DAY' : `${days} ${days === 1 ? 'DAY' : 'DAYS'}`}
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: '800', opacity: 0.6, fontSize: '0.6rem' }}>
                    INTAKE AGE
                </Typography>
            </Box>
        );
    }
  }] : []),
  {
    field: 'notes',
    headerName: tabValue === 4 ? 'Prescription Preview' : tabValue === 5 ? 'Billing Preview' : 'Medical Intake / Notes',
    flex: 1.2, minWidth: 200, sortable: false,
    renderCell: (p) => {
      // DISPENSE tab — Prescription Preview
      if (tabValue === 4) {
        const items = p.row.prescribedItems || [];
        const drugs = items.filter(i => i.isDrug || i.isMedicine || (i.type === 'product' && i.isMedicine !== false));
        if (drugs.length === 0) {
          return <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>No prescribed items</Typography>;
        }
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', py: 1, gap: 0.5 }}>
            <Typography variant="overline" sx={{ fontWeight: '1000', fontSize: '0.6rem', color: '#C62828', lineHeight: 1, letterSpacing: 1, mb: 0.5 }}>
              PHARMACY CHECKLIST ({drugs.length})
            </Typography>
            {drugs.slice(0, 4).map((item, idx) => (
              <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: '900', color: '#3E2723', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {item.name}
                </Typography>
                <Chip label={`x${item.qty}`} size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: '1000', ml: 1 }} />
              </Box>
            ))}
            {drugs.length > 4 && (
              <Typography variant="caption" sx={{ fontWeight: '800', color: '#795548', opacity: 0.6 }}>
                +{drugs.length - 4} more items
              </Typography>
            )}
          </Box>
        );
      }

      // PAYMENT tab — Billing Preview
      if (tabValue === 5) {
        const items = p.row.prescribedItems || [];
        const total = p.row.finalTotal || items.reduce((sum, i) => sum + ((i.price || 0) * (i.qty || 1)), 0);
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', py: 1, justifyContent: 'center', height: '100%' }}>
            <Typography variant="overline" sx={{ fontWeight: '1000', fontSize: '0.6rem', color: '#FF8F00', lineHeight: 1, letterSpacing: 1, mb: 1 }}>
              BILLING SUMMARY
            </Typography>
            <Typography sx={{ fontSize: '1.4rem', fontWeight: '1000', color: '#2E7D32', lineHeight: 1 }}>
              P{total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: '800', color: '#795548', mt: 0.5 }}>
              {items.filter(i => i.type === 'service').length} services, {items.filter(i => i.type === 'product').length} products
            </Typography>
            {p.row.depositPaid > 0 && (
              <Typography variant="caption" sx={{ fontWeight: '800', color: '#E65100', mt: 0.5 }}>
                Deposit: P{p.row.depositPaid.toLocaleString()}
              </Typography>
            )}
          </Box>
        );
      }

      // Default: Medical Intake / Notes (tabs 0-3, 6, 7)
      const notes = p.row.notes || "";
      const carryMatch = notes.match(/^\[Carried Over from (.*?)\]\s*(.*)/i);

      return (
        <Box
          onMouseEnter={(e) => actions.handleHoverStart(e, 'notes', p.row.notes)}
          onMouseLeave={actions.handleHoverEnd}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            pt: 1.5,
            cursor: 'zoom-in',
            '&:hover': { bgcolor: 'rgba(139, 69, 19, 0.04)' },
            transition: 'background-color 0.2s'
          }}
        >
          {carryMatch ? (
             <>
               <Typography variant="overline" sx={{ fontWeight: '1000', fontSize: '0.6rem', color: '#8D6E63', lineHeight: 1, mb: 0.5, letterSpacing: 1 }}>
                  CARRIED OVER FROM {carryMatch[1]}
               </Typography>
               <Typography
                 variant="body2"
                 sx={{
                   display: '-webkit-box',
                   WebkitLineClamp: 3,
                   WebkitBoxOrient: 'vertical',
                   overflow: 'hidden',
                   fontSize: '0.82rem',
                   lineHeight: 1.3,
                   color: 'text.primary',
                   fontStyle: carryMatch[2] === "No original notes." ? 'italic' : 'normal',
                   fontWeight: 500,
                   opacity: carryMatch[2] === "No original notes." ? 0.5 : 1
                 }}
               >
                 {carryMatch[2]}
               </Typography>
             </>
          ) : notes ? (
            <Typography
              variant="body2"
              sx={{
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                fontSize: '0.82rem',
                lineHeight: 1.4,
                color: 'text.primary',
                fontStyle: 'italic',
                fontWeight: 400
              }}
            >
              "{notes}"
            </Typography>
          ) : (
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>No notes provided</Typography>
          )}
        </Box>
      );
    }
  },
  { 
    field: 'services', headerName: 'Services and Staff', flex: 1, minWidth: 220,
    resizable: false, sortable: false, disableColumnMenu: true,
    renderCell: (p) => {
      const services = [...(p.row.services || [])].sort((a,b) => (a.name || '').localeCompare(b.name || ''));
      if (services.length === 0) return <Chip label={p.row.status.toUpperCase()} color="primary" size="small" sx={{fontWeight:'900', height: 24}}/>;

      return (
        <Box 
          /* FORCE RELOAD: VETCONNECT-HUD-SERVICES-SCALED */
          onMouseEnter={(e) => actions.handleHoverStart(e, 'services', services)}
          onMouseLeave={actions.handleHoverEnd}
          sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            justifyContent: 'center',
            width: '100%', 
            height: '100%',
            cursor: 'zoom-in',
            position: 'relative',
            pr: 2
          }}
        >
          {/* THE MEDICAL BUNDLE BADGE (TOTAL COUNT) */}
          <Box sx={{ 
              position: 'absolute', right: 4, top: 4, 
              width: 18, height: 18, borderRadius: '50%',
              bgcolor: '#5D4037', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              zIndex: 5
          }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: '1000' }}>{services.length}</Typography>
          </Box>

          {/* WEIGHT HIDDEN FROM SERVICES CELL PER FORENSIC CLEANUP */}

          <Stack spacing={0.8} sx={{ width: '100%' }}>
            {services.slice(0, 2).map((svc, idx) => {
                const dept = (departments || []).find(d => d.name === svc.department);
                const barColor = dept ? dept.color : '#9E9E9E';

                return (
                    <Box key={idx} sx={{ 
                        borderLeft: `3px solid ${barColor}`, 
                        pl: 1, py: 0.2, lineHeight: 1,
                        display: 'flex', flexDirection: 'column', gap: 0.2
                    }}>
                        <Typography sx={{ fontWeight: '1000', fontSize: '0.75rem', color: '#5D4037', textTransform: 'uppercase', letterSpacing: '0.01rem', lineHeight: 1 }} noWrap>
                            {svc.name}
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: '800', color: '#5D4037', opacity: 0.6, fontSize: '0.65rem', fontStyle: 'italic', lineHeight: 1 }}>
                            {svc.staffName || 'Unassigned'}
                        </Typography>
                    </Box>
                );
            })}
            
            {/* THE DEPARTMENT PILE (REMAINING VOLUME SIGNAL) */}
            {services.length > 2 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: 1, pt: 0.2 }}>
                    {services.slice(2, 7).map((svc, idx) => {
                        const dept = (departments || []).find(d => d.name === svc.department);
                        return (
                            <Box key={idx} sx={{ width: 12, height: 3, bgcolor: dept ? dept.color : '#9E9E9E', borderRadius: 1 }} />
                        );
                    })}
                    {services.length > 7 && (
                        <Typography variant="caption" sx={{ fontWeight: '1000', color: '#5D4037', opacity: 0.4, fontSize: '0.6rem' }}>
                            ...
                        </Typography>
                    )}
                </Box>
            )}
          </Stack>
        </Box>
      );
    }
  },
  { 
    field: 'timing', headerName: 'Triage Clock', width: 250, align: 'center', headerAlign: 'center',
    resizable: false, sortable: false, disableColumnMenu: true,
    renderCell: (p) => {
      const resolveDate = (d) => {
        if (!d) return null;
        if (d.toDate) return d.toDate();
        const parsed = new Date(d);
        return isNaN(parsed.getTime()) ? null : parsed;
      };

      const scheduled = resolveDate(p.row.jsScheduled);
      const booked = resolveDate(p.row.createdAt);
      const arrived = resolveDate(p.row.timeArrived);
      const started = resolveDate(p.row.timeStarted);
      const completed = resolveDate(p.row.timeCompleted);
      
      // THE FIX: Distinguish between the Dead Past and the Planned Future
      const isHistorical = !isToday && !isTomorrow;
      const isPreview = isTomorrow; 
      
      let primaryLabel = "";
      let secondaryLabel = "";
      let triageColor = "#5D4037"; // Forensic Coffee Default
      const apptLabel = (p.row.ticketPrefix === 'W' || p.row.ticketPrefix === 'E') ? 'QUEUED' : (p.row.ticketPrefix === 'R' ? 'RETURN' : 'APPT');

      if (isHistorical && scheduled) {
          primaryLabel = scheduled.toLocaleDateString([], { 
            month: 'short', 
            day: 'numeric',
            year: scheduled.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined 
          }).toUpperCase();
          const timeStr = scheduled.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          
          if (p.row.status === STATUS.COMPLETED) {
             const end = completed || currentTime;
             const start = arrived || scheduled;
             const totalMins = Math.round((end - start) / 60000);
             secondaryLabel = `VISIT: ${formatDuration(totalMins)}`;
          } else {
             secondaryLabel = timeStr;
          }
      } else {
          switch (p.row.status) {
            case 'pending':
                primaryLabel = scheduled?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) || "ASAP";
                // THE REAL-TIME TRIAGE INDICATOR: If for a future date, show the day/month
                const isLater = !isToday; 
                secondaryLabel = isLater ? scheduled?.toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' }) : "REQUESTED";
                triageColor = isLater ? "#1976D2" : "#5D4037"; // Blue for future, Brown for today
                break;

            case 'confirmed':
                primaryLabel = `${apptLabel}: ${scheduled?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) || '??:??'}`;
                const diffMins = scheduled ? Math.round((currentTime - scheduled) / 60000) : 0;
                const bookedDiff = (booked && scheduled) ? Math.round((scheduled - booked) / 60000) : 0;
                
                secondaryLabel = diffMins > 0 ? `LATE (${formatDuration(diffMins)})` : `IN ${formatDuration(Math.abs(diffMins))}`;
                if (bookedDiff > 0) secondaryLabel += ` | BOOKED: ${formatDuration(bookedDiff)} AGO`;
                
                if (diffMins > 30) triageColor = "#D32F2F"; 
                break;

            case 'arrived':
                const waitMins = arrived ? Math.round((currentTime - arrived) / 60000) : 0;
                const driftMins = (scheduled && arrived) ? Math.round((arrived - scheduled) / 60000) : 0;
                
                primaryLabel = `ARRIVED: ${arrived?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) || '??:??'}`;
                secondaryLabel = `WAITING: ${formatDuration(waitMins)}`;
                if (scheduled) secondaryLabel += ` | ${apptLabel} ${scheduled.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} (${driftMins > 0 ? '+' : ''}${formatDuration(driftMins)})`;
                
                triageColor = waitMins > 20 ? "#E65100" : "#2E7D32"; 
                break;

            case 'in-consult':
                const consultMins = started ? Math.round((currentTime - started) / 60000) : 0;
                const lobbyWait = (started && (arrived || scheduled)) ? Math.round((started - (arrived || scheduled)) / 60000) : 0;
                
                primaryLabel = `STARTED: ${started?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) || '??:??'}`;
                secondaryLabel = `CONSULTING: ${formatDuration(consultMins)}`;
                if (lobbyWait > 0) secondaryLabel += ` | WAITED: ${formatDuration(lobbyWait)}`;
                
                triageColor = "#2E7D32"; 
                break;

            case 'on-hold': {
                const holdMins = resolveDate(p.row.lastPausedAt) ? Math.round((currentTime - resolveDate(p.row.lastPausedAt)) / 60000) : 0;
                const holdTotal = (arrived || scheduled) ? Math.round((currentTime - (arrived || scheduled)) / 60000) : 0;
                primaryLabel = `ON HOLD: ${formatDuration(holdMins)}`;
                secondaryLabel = `TOTAL VISIT: ${formatDuration(holdTotal)}`;
                triageColor = "#E65100";
                break;
            }

            case 'confined': {
                const confinedSince = resolveDate(p.row.timeStarted) || resolveDate(p.row.timeArrived) || resolveDate(p.row.createdAt);
                const confinedMins = confinedSince ? Math.round((currentTime - confinedSince) / 60000) : 0;
                primaryLabel = `CONFINED: DAY ${p.row.caseDay || 1}`;
                secondaryLabel = `TOTAL: ${formatDuration(confinedMins)}`;
                triageColor = "#6A1B9A";
                break;
            }

            case STATUS.DISPENSING:
                const dispenseMins = resolveDate(p.row.timeDispenseStarted) ? Math.round((currentTime - resolveDate(p.row.timeDispenseStarted)) / 60000) : 0;
                const dispenseTotal = (arrived || scheduled) ? Math.round((currentTime - (arrived || scheduled)) / 60000) : 0;
                primaryLabel = `DISPENSING: ${formatDuration(dispenseMins)}`;
                secondaryLabel = `TOTAL VISIT: ${formatDuration(dispenseTotal)}`;
                break;

            case STATUS.BILLING:
                const paymentMins = resolveDate(p.row.timePaymentStarted) ? Math.round((currentTime - resolveDate(p.row.timePaymentStarted)) / 60000) : 0;
                const paymentTotal = (arrived || scheduled) ? Math.round((currentTime - (arrived || scheduled)) / 60000) : 0;
                primaryLabel = `PAYING: ${formatDuration(paymentMins)}`;
                secondaryLabel = `TOTAL VISIT: ${formatDuration(paymentTotal)}`;
                break;

            case STATUS.COMPLETED:
                const end = completed || currentTime;
                const start = arrived || scheduled || booked;
                const totalMins = start ? Math.round((end - start) / 60000) : 0;
                
                primaryLabel = `DONE: ${end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                secondaryLabel = `TOTAL VISIT: ${formatDuration(totalMins)}`;
                break;

            default:
                primaryLabel = scheduled?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) || "";
                secondaryLabel = "PROCESSED";
                break;
          }
      }

      return (
        <Box 
          sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', position: 'relative', paddingLeft: 0, cursor: 'help' }}
          onMouseEnter={(e) => actions.handleHoverStart(e, 'timing', p.row)}
          onMouseLeave={actions.handleHoverEnd}
        >
            {p.row.caseDay > 1 && (
                <Box sx={{ 
                    position: 'absolute', top: 8, right: 12, 
                    bgcolor: '#FFF', border: '1.5px solid #5D4037', 
                    borderRadius: '50%', width: 16, height: 16, 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    zIndex: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                    <Typography sx={{ color: '#5D4037', fontSize: '0.65rem', fontWeight: '1000' }}>
                        {p.row.caseDay}
                    </Typography>
                </Box>
            )}
            <Typography sx={{ color: '#5D4037', fontWeight: '1000', lineHeight: 1, fontSize: '1.2rem', letterSpacing: '-0.5px' }}>
              {primaryLabel}
            </Typography>
            <Typography sx={{ color: triageColor === "#5D4037" ? "#5D4037" : triageColor, fontWeight: '900', fontSize: '0.68rem', mt: 0.5, letterSpacing: 0.5, textAlign: 'center', px: 1 }}>
               {secondaryLabel.toUpperCase()}
            </Typography>
        </Box>
      );
    }
  },
  {
    field: 'actions', headerName: 'Command Action', width: 320, sortable: false, disableColumnMenu: true,
    align: 'center', headerAlign: 'center', resizable: false,
    renderCell: (params) => {
        if (!isToday && !isTomorrow) {
          return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5 }}>
              <WarningIcon sx={{ color: '#5D4037', fontSize: 18, mb: 0.5, opacity: 0.6 }} />
              <Typography variant="caption" sx={{ fontWeight: '1000', color: '#5D4037', letterSpacing: 1, fontSize: '0.65rem' }}>
                ARCHIVED
              </Typography>
            </Box>
          );
        }
      const btnStyle = { textTransform: 'uppercase', fontWeight: '900', px: 2, borderRadius: 2, letterSpacing: 0.5, height: 32, fontSize: '0.75rem' };
      const scheduled = params.row.jsScheduled;
      const autoNoShowMins = clinicSettings?.autoNoShowMins ?? 30;
      const minsLate = scheduled ? (currentTime - scheduled) / 60000 : 0;
      const noShowWindowOpen = scheduled != null && minsLate >= autoNoShowMins;
      const noShowOpenTime = scheduled ? new Date(scheduled.getTime() + autoNoShowMins * 60000) : null;

      if (params.row.status === 'pending') {
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.8, width: '100%', height: '100%', py: 1 }}>
            
            {/* TOP ROW: PRIMARY ACCEPTANCE GATE & AUDIT ANCHOR */}
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1, mb: 0.6 }}>
                <Button 
                    variant="contained" 
                    size="small" 
                    fullWidth
                    color="success"
                    startIcon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />} 
                    sx={{ ...btnStyle, flexGrow: 1, fontWeight: '1000', height: 32, bgcolor: '#2E7D32' }} 
                    onClick={() => actions.handleStatusChange(params.row, 'confirmed')}
                >
                    Accept
                </Button>
                <IconButton size="small" onClick={(e) => actions.handleMenuClick(e, params.row)} sx={{ border: '1px solid rgba(0,0,0,0.1)', color: '#5D4037', flexShrink: 0 }}><MoreVertIcon fontSize="small" /></IconButton>
            </Box>

            {/* SECONDARY TRIAGE UTILITIES (DEFER/REJECT) */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, width: '100%' }}>
                <Button variant="outlined" size="small" sx={{...btnStyle, fontSize: '0.65rem', px: 0, color: '#5D4037', borderColor: '#D7CCC8', minWidth: 0, height: 26}} onClick={() => actions.handleDefer(params.row)}>Defer</Button>
                <Button variant="outlined" size="small" color="error" sx={{...btnStyle, fontSize: '0.65rem', px: 0, fontWeight: 'bold', minWidth: 0, height: 26}} onClick={() => { 
                    actions.setSelectedId(params.row.id); 
                    actions.handleMenuClick({ currentTarget: null }, params.row); // SENSOR SYNC
                    actions.setOpenReject(true); 
                }}>Reject</Button>
            </Box>
          </Box>
        );
      }

      if (params.row.status === 'confirmed') {
        const isWalkIn = params.row.ownerId === 'WALK_IN_USER' || String(params.row.ownerId).includes('GUEST_');
        
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.8, width: '100%', height: '100%', py: 1 }}>
            
            {/* TOP ROW: PRIMARY GATEKEEPER & AUDIT ANCHOR */}
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1, mb: 0.6 }}>
                <Button 
                    variant="contained" 
                    size="small" 
                    fullWidth
                    disabled={isTomorrow}
                    startIcon={<HowToRegIcon sx={{ fontSize: '14px !important' }} />} 
                    sx={{ 
                        ...btnStyle, 
                        flexGrow: 1,
                        bgcolor: isTomorrow ? '#BDBDBD' : (params.row.caseDay > 1 ? '#E65100' : '#1976D2'), 
                        fontWeight: '1000', 
                        height: 32,
                        boxShadow: isTomorrow ? 'none' : '0 4px 10px rgba(25, 118, 210, 0.3)',
                        '&.Mui-disabled': { bgcolor: 'rgba(0,0,0,0.08)', color: 'rgba(0,0,0,0.26)' }
                    }} 
                    onClick={() => actions.handleOpenAssign(params.row, 'check-in')}
                >
                    {isTomorrow ? 'Locked' : (params.row.caseDay > 1 ? '🗂️ RE-ARRIVE & RESUME' : 'Check In')}
                </Button>
                <IconButton size="small" onClick={(e) => actions.handleMenuClick(e, params.row)} sx={{ border: '1px solid rgba(0,0,0,0.1)', color: '#5D4037', flexShrink: 0 }}><MoreVertIcon fontSize="small" /></IconButton>
            </Box>
            
            {/* SECONDARY UTILITY GRID (100% CASE COVERAGE) */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, width: '100%' }}>
                <Button 
                    variant="outlined" 
                    size="small" 
                    disabled={isTomorrow}
                    sx={{ 
                      ...btnStyle, fontSize: '0.6rem', px: 0, borderColor: '#5D4037', color: '#5D4037', opacity: 0.8, minWidth: 0, height: 26,
                      '&.Mui-disabled': { borderColor: 'rgba(0,0,0,0.05)', opacity: 0.3 }
                    }} 
                    startIcon={<PersonAddIcon sx={{ fontSize: '10px !important' }} />} 
                    onClick={() => actions.handleOpenAssign(params.row, 'assign')}
                >
                    Assign
                </Button>
                <Button 
                    variant="outlined" 
                    size="small" 
                    sx={{ ...btnStyle, fontSize: '0.6rem', px: 0, borderColor: '#5D4037', color: '#5D4037', opacity: 0.8, minWidth: 0, height: 26 }} 
                    startIcon={<EventNoteIcon sx={{ fontSize: '10px !important' }} />} 
                    onClick={() => actions.handleRescheduleOpen(params.row)}
                >
                    Time
                </Button>
                <Tooltip
                    title={noShowWindowOpen
                        ? "Flag this patient as No-Show"
                        : `No-Show window opens at ${noShowOpenTime?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '??:??'} per clinic policy`
                    }
                >
                  <span>
                    <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        disabled={!noShowWindowOpen}
                        sx={{ ...btnStyle, fontSize: '0.6rem', px: 0, borderColor: noShowWindowOpen ? 'rgba(211, 47, 47, 0.3)' : 'rgba(0,0,0,0.08)', minWidth: 0, height: 26 }}
                        startIcon={<PersonOffIcon sx={{ fontSize: '10px !important' }} />}
                        onClick={() => actions.handleQuickNoShow(params.row)}
                    >
                        No-Show
                    </Button>
                  </span>
                </Tooltip>
                <Button 
                    variant="outlined" 
                    size="small" 
                    color="inherit"
                    sx={{ ...btnStyle, fontSize: '0.6rem', px: 0, borderColor: 'rgba(0,0,0,0.1)', color: '#757575', minWidth: 0, height: 26 }} 
                    onClick={() => {
                        actions.setSelectedId(params.row.id);
                        actions.handleMenuClick({ currentTarget: null }, params.row); // SYNCING SENSOR
                        actions.setOpenReject(true);
                    }}
                >
                    Cancel
                </Button>
            </Box>
          </Box>
        );
      }

      if (params.row.status === 'arrived') {
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.8, width: '100%', height: '100%' }}>
            <Button 
                variant="contained" 
                size="small" 
                sx={{
                  ...btnStyle, 
                  bgcolor: params.row.caseDay > 1 ? '#E65100' : '#5D4037', 
                  '&:hover': { bgcolor: params.row.caseDay > 1 ? '#BF360C' : '#3E2723' }, 
                  minWidth: params.row.caseDay > 1 ? 160 : 140
                }} 
                onClick={() => actions.handleStatusChange(params.row, 'in-consult')}
            >
                {params.row.caseDay > 1 ? '🔥 RESUME' : 'START CONSULT'}
            </Button>
            <IconButton size="small" onClick={(e) => actions.handleMenuClick(e, params.row)} sx={{ color: '#5D4037' }}><MoreVertIcon fontSize="small" /></IconButton>
          </Box>
        );
      }

      if (['in-consult', 'confined', 'on-hold'].includes(params.row.status)) {
        const isResuming = params.row.caseDay > 1;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.8, width: '100%', height: '100%' }}>
            <Button 
                variant="contained" 
                size="small" 
                startIcon={<AutoFixHighIcon sx={{ fontSize: '14px !important' }} />}
                sx={{
                  ...btnStyle, 
                  bgcolor: isResuming ? '#E65100' : '#006064', 
                  '&:hover': { bgcolor: isResuming ? '#BF360C' : '#004D40' }, 
                  minWidth: isResuming ? 160 : 140
                }} 
                onClick={() => actions.handleOpenConsult(params.row)}
            >
                {isResuming ? '🔥 RESUME' : 'WORKSPACE'}
            </Button>
            <IconButton size="small" onClick={(e) => actions.handleMenuClick(e, params.row)} sx={{ color: '#5D4037' }}><MoreVertIcon fontSize="small" /></IconButton>
          </Box>
        );
      }

      if (params.row.status === STATUS.DISPENSING) {
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.8, width: '100%', height: '100%' }}>
            <Button
                variant="contained"
                size="small"
                startIcon={<LocalHospitalIcon sx={{ fontSize: '14px !important' }} />}
                sx={{...btnStyle, bgcolor: '#C62828', '&:hover': { bgcolor: '#B71C1C' }, minWidth: 160}}
                onClick={() => actions.handleOpenDispenseVerify(params.row)}
            >
                VERIFY ITEMS
            </Button>
            <IconButton size="small" onClick={(e) => actions.handleMenuClick(e, params.row)} sx={{ color: '#5D4037' }}><MoreVertIcon fontSize="small" /></IconButton>
          </Box>
        );
      }

      if (params.row.status === STATUS.BILLING) {
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.8, width: '100%', height: '100%' }}>
            <Button 
                variant="contained" 
                size="small" 
                startIcon={<PaidIcon sx={{ fontSize: '14px !important' }} />}
                sx={{...btnStyle, bgcolor: '#FF8F00', '&:hover': { bgcolor: '#FF6F00' }, minWidth: 140}} 
                onClick={() => actions.handleOpenPOS?.(params.row)}
            >
                OPEN CHECKOUT
            </Button>
            <IconButton size="small" onClick={(e) => actions.handleMenuClick(e, params.row)} sx={{ color: '#5D4037' }}><MoreVertIcon fontSize="small" /></IconButton>
          </Box>
        );
      }

      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
           <IconButton size="small" onClick={(e) => actions.handleMenuClick(e, params.row)} sx={{ border: '1px solid rgba(0,0,0,0.1)', color: '#5D4037' }}><MoreVertIcon fontSize="small" /></IconButton>
        </Box>
      );
    }
  }
];