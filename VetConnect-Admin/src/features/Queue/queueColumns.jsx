import React from 'react';
import { Box, Typography, Chip, Tooltip, IconButton, Button, Stack, Paper } from '@mui/material';

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

const formatDuration = (totalMinutes) => {
  const mins = Math.abs(totalMinutes);
  
  // Universal Temporal Scaling for Clinical Clarity
  if (mins >= 43200) { // 30+ Days
    const months = Math.floor(mins / 43200);
    return `${months}mo`;
  }
  
  if (mins >= 10080) { // 7-30 Days
    const weeks = Math.floor(mins / 10080);
    return `${weeks}w`;
  }
  
  if (mins >= 1440) { // 1-7 Days
    const days = Math.floor(mins / 1440);
    return `${days}d`;
  }
  
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
};

const calculateAgeString = (dob) => {
    if (!dob) return null;
    const birthDate = dob.toDate ? dob.toDate() : new Date(dob);
    const now = new Date();
    let years = now.getFullYear() - birthDate.getFullYear();
    let months = now.getMonth() - birthDate.getMonth();
    if (months < 0) {
        years--;
        months += 12;
    }
    if (years > 0) return `${years}y ${months}m`;
    return `${months}m`;
};

export const getQueueColumns = (tabValue, currentTime, actions, isToday, departments) => [
  { 
    field: 'identity', headerName: 'Patient Identity', flex: 1, minWidth: 220, 
    resizable: false, sortable: false, disableColumnMenu: true,
    renderCell: (p) => {
      const isWalkIn = p.row.ownerId === 'WALK_IN_USER' || String(p.row.ownerId).includes('GUEST_');
      const hasAllergies = p.row.petAllergies && p.row.petAllergies.trim().length > 0;
      const petAge = calculateAgeString(p.row.petBirthdate);

      const PassportCard = (
        <Box sx={{ p: 1, minWidth: 200 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: '900', color: '#FFF3E0', mb: 1, fontSize: '1rem', borderBottom: '1px solid rgba(255,255,255,0.2)', pb: 0.5 }}>
                {p.row.petName}
            </Typography>
            <Stack spacing={0.8}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" sx={{ color: '#FFB74D', fontWeight: 'bold' }}>SPECIES / GENDER</Typography>
                    <Typography variant="caption" sx={{ color: 'white', fontWeight: '900' }}>{p.row.petSpecies} / {p.row.petGender || 'UNK'}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" sx={{ color: '#FFB74D', fontWeight: 'bold' }}>AGE</Typography>
                    <Typography variant="caption" sx={{ color: 'white', fontWeight: '900' }}>{petAge}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" sx={{ color: '#FFB74D', fontWeight: 'bold' }}>BREED</Typography>
                    <Typography variant="caption" sx={{ color: 'white', fontWeight: '900' }}>{p.row.petBreed || 'Mixed'}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" sx={{ color: '#FFB74D', fontWeight: 'bold' }}>SURGICAL</Typography>
                    <Typography variant="caption" sx={{ color: 'white', fontWeight: '900' }}>{p.row.petIsNeutered ? 'FIXED' : 'INTACT'}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 0.5, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <Typography variant="caption" sx={{ color: '#81C784', fontWeight: 'bold' }}>OWNER</Typography>
                    <Typography variant="caption" sx={{ color: 'white', fontWeight: '900' }}>{p.row.ownerName}</Typography>
                </Box>
                {hasAllergies && (
                     <Box sx={{ mt: 1, p: 0.5, bgcolor: 'rgba(211, 47, 47, 0.2)', borderRadius: 1, border: '1px solid #D32F2F' }}>
                        <Typography variant="caption" sx={{ color: '#FFCDD2', fontWeight: 'bold' }}>⚠️ ALLERGIES: {p.row.petAllergies}</Typography>
                     </Box>
                )}
            </Stack>
        </Box>
      );
      
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', py: 1, px: 0.5, overflow: 'hidden', height: '100%' }}>
          {/* THE TICKET ANCHOR (DYNAMIC) */}
          <Box sx={{ 
              width: 56, height: 56, borderRadius: '12px', mr: 2, flexShrink: 0,
              bgcolor: p.row.queueNumber ? '#FFF3E0' : '#F5F5F5', 
              border: '2px solid', borderColor: p.row.queueNumber ? '#FFB74D' : '#EEEEEE',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}>
            {p.row.queueNumber ? (
              <>
                <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: '900', color: '#E65100', lineHeight: 1 }}>{p.row.ticketPrefix || 'TKT'}</Typography>
                <Typography variant="h6" sx={{ fontWeight: '900', color: '#D32F2F', lineHeight: 1, fontSize: '1.4rem' }}>{p.row.queueNumber}</Typography>
              </>
            ) : (
                <LocalHospitalIcon sx={{ fontSize: 24, color: '#BDBDBD', opacity: 0.8 }} />
            )}
          </Box>

          <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* THE TOTAL IDENTITY STACK (GOD-VIEW TRIGGER) */}
            <Box 
                onMouseEnter={(e) => actions.handleHoverStart(e, 'identity', PassportCard)}
                onMouseLeave={actions.handleHoverEnd}
                sx={{ display: 'flex', flexDirection: 'column', width: '100%', cursor: 'zoom-in', gap: 0 }}
            >
                {/* LINE 1: THE PATIENT HERO */}
                <Typography sx={{ fontSize: '1.18rem', fontWeight: '1000', color: '#1A1A1A', lineHeight: 1, letterSpacing: '-0.01rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pb: 0.2 }}>
                    {p.row.petName} 
                </Typography>

                {/* LINE 2: THE BIOMETRIC STACK (BIO + AGE) */}
                <Typography variant="caption" sx={{ color: '#5D4037', fontWeight: '700', fontSize: '0.72rem', textTransform: 'capitalize', lineHeight: 1.1 }}>
                    {String(p.row.petSpecies || 'PET').toLowerCase()} • {String(p.row.petBreed || 'Mixed Breed').toLowerCase()}
                </Typography>

                <Typography variant="caption" sx={{ color: '#5D4037', fontWeight: '700', fontSize: '0.72rem', textTransform: 'uppercase', lineHeight: 1.1 }}>
                    {petAge ? `AGE: ${petAge}` : 'UNVERIFIED AGE'}
                </Typography>

                {/* LINE 3: THE CLINICAL DNA (BIOLOGICAL) */}
                <Typography variant="caption" sx={{ 
                    color: '#5D4037',
                    fontWeight: '700', fontSize: '0.72rem', textTransform: 'uppercase', lineHeight: 1.1 
                }}>
                    {p.row.petGender && p.row.petGender !== 'Unknown' && p.row.petGender !== '???' ? p.row.petGender : 'SEX UNKNOWN'} • {p.row.petIsNeutered ? 'fixed' : 'intact'}
                </Typography>

                {/* LINE 4: THE PHYSICAL MAPPING (COLOR) */}
                <Typography variant="caption" sx={{ 
                    color: '#5D4037',
                    fontWeight: '700', fontSize: '0.72rem', textTransform: 'uppercase', lineHeight: 1.1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                    {p.row.petColor || 'COLOR UNRECORDED'}
                </Typography>
            </Box>

            {/* LINE 5: THE WAITING ROOM ANCHOR (HUMAN) */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              {isWalkIn ? <DirectionsWalkIcon sx={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }} /> : <SmartphoneIcon sx={{ fontSize: 13, color: '#64B5F6' }} />}
              <Typography variant="caption" sx={{ fontSize: '0.78rem', fontWeight: '900', color: '#5D4037', textTransform: 'uppercase', letterSpacing: '0.01rem', lineHeight: 1 }}>
                {p.row.ownerName || 'Online Client'}
              </Typography>
              {hasAllergies && (
                  <Tooltip title={`Allergies: ${p.row.petAllergies}`}>
                    <WarningIcon sx={{ fontSize: 13, color: '#D32F2F', ml: 0.5 }} />
                  </Tooltip>
              )}
            </Box>
          </Box>
        </Box>
      );
    }
  },
  {
    field: 'notes', headerName: 'Medical Intake / Notes', flex: 1.2, minWidth: 200,
    renderCell: (p) => (
      <Box 
        onMouseEnter={(e) => actions.handleHoverStart(e, 'notes', p.row.notes)}
        onMouseLeave={actions.handleHoverEnd}
        sx={{ 
          display: 'flex',
          alignItems: 'flex-start',
          width: '100%', 
          pt: 1.5, 
          cursor: 'zoom-in',
          '&:hover': { bgcolor: 'rgba(139, 69, 19, 0.04)' },
          transition: 'background-color 0.2s'
        }}
      >
        {p.row.notes ? (
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
            "{p.row.notes}"
          </Typography>
        ) : (
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>No notes provided</Typography>
        )}
      </Box>
    )
  },
  { 
    field: 'services', headerName: 'Services and Staff', flex: 1, minWidth: 220,
    resizable: false, sortable: false, disableColumnMenu: true,
    renderCell: (p) => {
      const services = [...(p.row.services || [])].sort((a,b) => a.name.localeCompare(b.name));
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

          {/* CLINICAL VITALS PILOT (WEIGHT) */}
          {p.row.petWeight && (
            <Box sx={{ 
              display: 'flex', alignItems: 'center', gap: 0.3, px: 0.8, py: 0.2, 
              borderRadius: 1, bgcolor: '#E3F2FD', border: '1px solid #BBDEFB',
              mb: 0.8, alignSelf: 'flex-start'
            }}>
               <ScaleIcon sx={{ fontSize: 11, color: '#1565C0' }} />
               <Typography sx={{ fontSize: '0.65rem', fontWeight: '900', color: '#1565C0' }}>
                  {p.row.petWeight}KG
               </Typography>
            </Box>
          )}

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
      const scheduled = p.row.jsScheduled;
      const isToday = scheduled && scheduled.toDateString() === currentTime.toDateString();
      const arrived = p.row.timeArrived ? (p.row.timeArrived.toDate ? p.row.timeArrived.toDate() : new Date(p.row.timeArrived)) : null;
      const started = p.row.timeStarted ? (p.row.timeStarted.toDate ? p.row.timeStarted.toDate() : new Date(p.row.timeStarted)) : null;
      
      let baseTime = isToday ? (started || arrived || scheduled) : scheduled;
      let primaryLabel = "";
      let secondaryLabel = "";
      let triageColor = "#5D4037"; // Coffee default

      // DYNAMIC TEMPORAL ANCHORS: Adapting to both Phase AND Date!
      if (!isToday && scheduled) {
          // FUTURE/PAST VIEW: Promote the Date
          primaryLabel = scheduled.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase();
          secondaryLabel = scheduled.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          triageColor = "#9E9E9E"; // Neutral for future/past
      } else {
          // TODAY VIEW: Promote the Clinical Milestone
          switch (p.row.status) {
            case 'pending':
            case 'confirmed':
                primaryLabel = `APPT: ${scheduled.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                const diffMins = Math.floor((currentTime - scheduled) / 60000);
                secondaryLabel = diffMins > 0 ? `LATE (${formatDuration(diffMins)})` : `IN ${formatDuration(Math.abs(diffMins))}`;
                if (diffMins > 30) triageColor = "#D32F2F"; 
                break;
            
            case 'arrived':
                baseTime = arrived || scheduled;
                const waitMins = Math.floor((currentTime - baseTime) / 60000);
                const driftMins = scheduled ? Math.floor((baseTime - scheduled) / 60000) : 0;
                
                primaryLabel = `ARRIVED: ${baseTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                secondaryLabel = `WAITING: ${formatDuration(waitMins)}`;
                triageColor = waitMins > 20 ? "#E65100" : "#2E7D32"; 
                
                return (
                    <Box 
                      /* FORCE RELOAD: VETCONNECT-HUD-TIMING-ADAPTIVE */
                      sx={{ 
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                        height: '100%', width: '100%', position: 'relative',
                        paddingLeft: '12px', cursor: 'help'
                      }}
                      onMouseEnter={(e) => actions.handleHoverStart(e, 'timing', p.row)}
                      onMouseLeave={actions.handleHoverEnd}
                    >
                        <Box sx={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 4, bgcolor: triageColor, borderRadius: '0 4px 4px 0' }} />
                        <Typography sx={{ color: '#5D4037', fontWeight: '1000', lineHeight: 1, fontSize: '1.25rem', letterSpacing: '-0.5px' }}>
                          {primaryLabel}
                        </Typography>
                        {scheduled && (
                            <Typography variant="caption" sx={{ color: driftMins > 20 ? '#E65100' : '#5D4037', fontWeight: '900', opacity: 0.8, fontSize: '0.62rem', letterSpacing: 0.5 }}>
                                APPT: {scheduled.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} ({driftMins > 0 ? '+' : ''}{formatDuration(driftMins)} {driftMins > 0 ? 'LATE' : 'EARLY'})
                            </Typography>
                        )}
                        <Typography sx={{ color: triageColor === "#5D4037" ? "#5D4037" : triageColor, fontWeight: '1000', fontSize: '0.72rem', mt: 0.5, letterSpacing: 0.5 }}>
                           {`IN LOBBY: ${formatDuration(waitMins)}`.toUpperCase()}
                        </Typography>
                    </Box>
                );
            
            case 'in-consult':
                baseTime = started || arrived || scheduled;
                const consultMins = Math.floor((currentTime - baseTime) / 60000);
                primaryLabel = `STARTED: ${baseTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                secondaryLabel = `CONSULTING: ${formatDuration(consultMins)}`;
                triageColor = "#2E7D32"; 
                break;
                
            default:
                primaryLabel = scheduled?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) || "";
                secondaryLabel = "PROCESSED";
                break;
          }
      }

      return (
        <Box 
          /* FORCE RELOAD: VETCONNECT-HUD-TIMING-ADAPTIVE */
          sx={{ 
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
            height: '100%', width: '100%', position: 'relative',
            paddingLeft: '12px', cursor: 'help'
          }}
          onMouseEnter={(e) => actions.handleHoverStart(e, 'timing', p.row)}
          onMouseLeave={actions.handleHoverEnd}
        >
            {/* THE PHASE INDICATOR PILLAR */}
            <Box sx={{ 
                position: 'absolute', left: 0, top: 4, bottom: 4, width: 4, 
                bgcolor: triageColor,
                borderRadius: '0 4px 4px 0'
            }} />

            <Typography sx={{ color: '#5D4037', fontWeight: '1000', lineHeight: 1, fontSize: '1.25rem', letterSpacing: '-0.5px' }}>
              {primaryLabel}
            </Typography>
            
            {p.row.status === 'arrived' && scheduled && (
                <Typography variant="caption" sx={{ color: '#5D4037', fontWeight: '800', opacity: 0.5, fontSize: '0.62rem' }}>
                    APPT: {scheduled.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </Typography>
            )}

            <Typography sx={{ color: triageColor === "#5D4037" ? "#5D4037" : triageColor, fontWeight: '1000', fontSize: '0.72rem', mt: 0.5, letterSpacing: 0.5 }}>
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
      const btnStyle = { textTransform: 'uppercase', fontWeight: '900', px: 2, borderRadius: 2, letterSpacing: 0.5, height: 32, fontSize: '0.75rem' };
      const scheduled = params.row.jsScheduled;
      const isVeryLate = scheduled && (currentTime - scheduled) / 60000 >= 30;

      if (params.row.status === 'pending') {
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, width: '100%', height: '100%' }}>
            <Button size="small" variant="contained" color="success" sx={btnStyle} startIcon={<CheckCircleIcon sx={{fontSize:'16px !important'}} />} onClick={() => actions.handleStatusChange(params.row, 'confirmed')}>Accept</Button>
            <Button size="small" variant="outlined" color="error" sx={btnStyle} onClick={() => { actions.setSelectedId(params.row.id); actions.setOpenReject(true); }}>Reject</Button>
          </Box>
        );
      }

      if (params.row.status === 'confirmed') {
        const isWalkIn = params.row.ownerId === 'WALK_IN_USER' || String(params.row.ownerId).includes('GUEST_');
        
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.8, width: '100%', height: '100%', py: 1 }}>
            {/* PRIMARY: CHECK-IN GATE */}
            <Button 
                variant="contained" 
                size="small" 
                color="primary" 
                fullWidth
                sx={{ ...btnStyle, bgcolor: '#1565C0', height: 36 }} 
                startIcon={<DirectionsWalkIcon sx={{ fontSize: '16px !important' }} />} 
                onClick={() => actions.handleOpenAssign(params.row)}
            >
                Check In
            </Button>
            
            {/* SECONDARY UTILITIES */}
            <Stack direction="row" spacing={0.8} sx={{ width: '100%' }}>
                <Button 
                    variant="outlined" 
                    size="small" 
                    fullWidth
                    sx={{ ...btnStyle, fontSize: '0.65rem', px: 0.5, borderColor: 'rgba(255,255,255,0.2)', color: '#FFF3E0' }} 
                    startIcon={<PersonAddIcon sx={{ fontSize: '12px !important' }} />} 
                    onClick={() => actions.handleOpenAssign(params.row)}
                >
                    Assign
                </Button>
                <Button 
                    variant="outlined" 
                    size="small" 
                    color="error"
                    fullWidth
                    sx={{ ...btnStyle, fontSize: '0.65rem', px: 0.5, borderColor: 'rgba(211, 47, 47, 0.4)' }} 
                    startIcon={<PersonOffIcon sx={{ fontSize: '12px !important' }} />} 
                    onClick={() => actions.handleQuickNoShow(params.row.id, params.row.services)}
                >
                    No-Show
                </Button>
            </Stack>
          </Box>
        );
      }

      if (params.row.status === 'arrived') {
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.8, width: '100%', height: '100%' }}>
            <Button 
                variant="contained" 
                size="small" 
                sx={{...btnStyle, bgcolor: '#5D4037', '&:hover': { bgcolor: '#3E2723' }, minWidth: 120}} 
                onClick={() => actions.handleStatusChange(params.row, 'in-consult')}
            >
                START CONSULT
            </Button>
            <Button variant="outlined" size="small" sx={{...btnStyle, color: '#5D4037', borderColor: '#D7CCC8', minWidth: 80}} onClick={(e) => actions.handleMenuClick(e, params.row)}>Options</Button>
            <IconButton size="small" onClick={(e) => actions.handleMenuClick(e, params.row)}><MoreVertIcon fontSize="small" /></IconButton>
          </Box>
        );
      }

      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, width: '100%', height: '100%' }}>
           <Button variant="outlined" size="small" sx={{...btnStyle, color: '#5D4037', borderColor: '#D7CCC8', minWidth: 100}} onClick={(e) => actions.handleMenuClick(e, params.row)}>Options</Button>
           <IconButton size="small" onClick={(e) => actions.handleMenuClick(e, params.row)}><MoreVertIcon fontSize="small" /></IconButton>
        </Box>
      );
    }
  }
];