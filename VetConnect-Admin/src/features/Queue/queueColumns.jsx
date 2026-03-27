import React from 'react';
import { Box, Typography, Chip, Tooltip, IconButton, Button, Stack } from '@mui/material';

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

const formatDuration = (totalMinutes) => {
  const mins = Math.abs(totalMinutes);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
};

export const getQueueColumns = (tabValue, currentTime, actions, isToday, departments) =>[
  { 
    field: 'identity', headerName: 'Patient Identity', flex: 1.8, minWidth: 260, 
    sortable: false, disableColumnMenu: true,
    renderCell: (p) => {
      const isWalkIn = p.row.ownerId === 'WALK_IN_USER' || String(p.row.ownerId).includes('GUEST_');
      
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', py: 1 }}>
          <Box sx={{ 
              width: 55, height: 55, borderRadius: 2, mr: 2, flexShrink: 0,
              bgcolor: p.row.queueNumber ? '#FFF3E0' : '#F5F5F5', 
              border: '2px solid', borderColor: p.row.queueNumber ? '#FFB74D' : '#E0E0E0',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              boxShadow: p.row.queueNumber ? '0 4px 8px rgba(255, 152, 0, 0.15)' : 'none'
          }}>
            {p.row.queueNumber ? (
              <>
                <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: '900', color: '#E65100', lineHeight: 1 }}>
                    {p.row.ticketPrefix || 'TKT'}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: '900', color: '#D32F2F', lineHeight: 1 }}>
                    {p.row.queueNumber}
                </Typography>
              </>
            ) : (
              <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#9E9E9E', textAlign: 'center', lineHeight: 1.2 }}>
                NO<br/>TKT
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography variant="h6" fontWeight="900" color="#3E2723" component="div" noWrap sx={{ lineHeight: 1.1 }}>
                {p.row.petName} 
              </Typography>
              <Typography component="span" variant="caption" color="textSecondary" fontWeight="600" sx={{ mt: 0.5 }}>
                ({p.row.petSpecies || 'Pet'})
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Tooltip title={isWalkIn ? "Walk-In" : "App Booking"}>
                {isWalkIn ? <DirectionsWalkIcon sx={{ fontSize: 14, color: '#757575' }} /> : <SmartphoneIcon sx={{ fontSize: 14, color: '#1976D2' }} />}
              </Tooltip>
              <Typography variant="body2" color="#555" component="div" fontWeight="bold" noWrap>
                {p.row.ownerName && p.row.ownerName.trim() !== '' ? p.row.ownerName : 'Mobile App Client'}
              </Typography>
              {(p.row.ownerPhone || p.row.phone) && (
                  <Typography variant="caption" color="textSecondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.2, ml: 1 }} component="div">
                      <PhoneIcon sx={{ fontSize: 12 }} /> {p.row.ownerPhone || p.row.phone}
                  </Typography>
              )}
            </Box>
          </Box>
        </Box>
      );
    }
  },
  { 
    // THE FIX: This was the elusive 'context' field!
    field: 'context', headerName: 'Service Details', flex: 1.2, minWidth: 160,
    sortable: false, disableColumnMenu: true,
    renderCell: (p) => {
      const hasNotes = p.row.notes && p.row.notes.trim().length > 0 && p.row.notes !== "—";
      
      const serviceCategory = p.row.serviceCategory || 'General';
      const deptObj = (departments || []).find(d => d.name === serviceCategory);
      const badgeColor = deptObj ? deptObj.color : '#424242';

      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 1, pr: 2, width: '100%' }}>
          
          <Chip 
            label={p.row.serviceType} 
            size="small" 
            sx={{ 
                bgcolor: badgeColor, 
                color: 'white', 
                fontWeight: '900', 
                fontSize: '0.7rem', 
                alignSelf: 'flex-start',
                mb: 0.5,
                boxShadow: `0 2px 5px ${badgeColor}40` 
            }} 
          />
          
          {/* THE UX FIX: Smart Truncation & Hover Tooltip for massive paragraphs */}
          {hasNotes ? (
            <Tooltip 
              title={p.row.notes} 
              arrow 
              placement="bottom-start"
              componentsProps={{
                tooltip: { sx: { bgcolor: '#3E2723', color: 'white', fontSize: '0.85rem', p: 1.5, boxShadow: 4, borderRadius: 2 } },
                arrow: { sx: { color: '#3E2723' } }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: '#FFF3E0', p: 1, borderRadius: 1, borderLeft: '3px solid #FF9800', cursor: 'help', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                <WarningIcon sx={{ fontSize: 14, color: '#E65100', flexShrink: 0 }} />
                <Typography 
                  variant="caption" 
                  component="div"
                  sx={{ 
                    color: '#E65100', 
                    fontWeight: '600', 
                    lineHeight: 1.2, 
                    display: '-webkit-box', 
                    WebkitLineClamp: 1, // FORCE TO 1 LINE!
                    WebkitBoxOrient: 'vertical', 
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }} 
                >
                  "{p.row.notes}"
                </Typography>
              </Box>
            </Tooltip>
          ) : (
            <Typography variant="caption" color="textSecondary" component="div" sx={{ fontStyle: 'italic' }}>
              No triage notes provided.
            </Typography>
          )}
        </Box>
      );
    }
  },
  { 
    field: 'timing', headerName: 'Time Tracking', flex: 1, minWidth: 140, align: 'center', headerAlign: 'center',
    sortable: false, disableColumnMenu: true,
    renderCell: (p) => {
      let relativeText = ""; let color = "textSecondary"; let exactTime = '-'; let isLate = false;

      if (['pending', 'confirmed'].includes(p.row.status)) {
        exactTime = `Sch: ${p.row.jsScheduled ? p.row.jsScheduled.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A'}`;
        if (p.row.jsScheduled) {
            const diffMins = Math.floor((currentTime - p.row.jsScheduled) / 60000);
            if (isToday) {
                if (diffMins >= 15) { isLate = true; relativeText = `⚠️ LATE (${formatDuration(diffMins)})`; color = "error.main"; } 
                else if (diffMins > 0 && diffMins < 15) { relativeText = `Expected now`; color = "warning.main"; } 
                else { relativeText = `In ${formatDuration(Math.abs(diffMins))}`; }
            } else {
                if (diffMins > 0) { relativeText = `Past Due`; color = "error.main"; isLate = true; } 
                else { relativeText = `Future Booking`; }
            }
        }
      } 
      else {
        exactTime = p.row.jsArrived ? `Arr: ${p.row.jsArrived.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : '-';
        if (p.row.status === 'on-hold') { relativeText = "⏸️ On Hold"; color = "warning.main"; }
        else if (tabValue === 2 && p.row.jsArrived) { const diff = Math.floor((currentTime - p.row.jsArrived) / 60000); relativeText = `⏳ ${formatDuration(Math.max(0, diff))} wait`; if (diff > 20) color = "error.main"; }
        else if (tabValue === 3 && p.row.jsStarted) { const rawDiff = Math.floor((currentTime - p.row.jsStarted) / 60000); const pausedMins = p.row.totalPausedMinutes || 0; const actualActiveTime = Math.max(0, rawDiff - pausedMins); relativeText = `⏱️ ${formatDuration(actualActiveTime)} active`; color = "info.main"; }
        else if (tabValue === 6 && p.row.jsArrived && p.row.jsCompleted) { const diff = Math.floor((p.row.jsCompleted - p.row.jsArrived) / 60000); relativeText = `Total: ${formatDuration(Math.max(0, diff))}`; color = "textSecondary"; }
      }

      return (
        <Box sx={{ textAlign: 'center', bgcolor: isLate && isToday ? '#FFEBEE' : 'transparent', px: 1.5, py: 0.8, borderRadius: 1.5, border: isLate && isToday ? '1px solid #FFCDD2' : '1px solid transparent' }}>
          <Typography variant="body2" display="block" sx={{ fontWeight: 'bold', color: isLate && isToday ? '#C62828' : '#3E2723' }} component="div">{exactTime}</Typography>
          <Typography variant="caption" color={color} sx={{ fontSize: '0.75rem', fontWeight: '900', mt: 0.2 }} component="div">{relativeText}</Typography>
        </Box>
      );
    }
  },
  { 
    field: 'statusAndStaff', headerName: 'Status & Staff', flex: 1, minWidth: 140, align: 'center', headerAlign: 'center',
    sortable: false, disableColumnMenu: true,
    renderCell: (p) => {
      let color = 'default'; let label = p.row.status.toUpperCase();
      if (['completed', 'carried-over'].includes(p.row.status)) {
        return ( <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}> <Chip label={label} color={p.row.status === 'completed' ? "success" : "default"} size="small" variant="filled" sx={{ height: 24, fontSize: '0.65rem', fontWeight: 'bold', letterSpacing: 0.5 }} /> </Box> );
      }
      if (p.row.status === 'confirmed') color = 'info'; if (p.row.status === 'pending') color = 'warning'; if (p.row.status === 'arrived') { color = 'secondary'; label = "LOBBY"; } if (p.row.status === 'in-consult') { color = 'primary'; label = "DOCTOR"; } if (p.row.status === 'on-hold') { color = 'warning'; label = "ON HOLD"; } if (p.row.status === 'dispensing') { color = 'warning'; label = "PHARMACY"; } if (p.row.status === 'billing') { color = 'success'; label = "PAYMENT"; } if (p.row.status === 'confined') { color = 'error'; label = "CONFINED"; } 
      
      const chip = <Chip label={label} color={color} size="small" variant="filled" sx={{ height: 26, fontSize: '0.7rem', fontWeight: '900', letterSpacing: 0.5, mb: 0.5 }} />;
      const isUnassigned = !p.row.assignedVetId; 
      
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 0.5 }}>
          {p.row.status === 'cancelled' || p.row.status === 'no-show' ? ( <Tooltip title={p.row.rejectReason}><Chip label={label} color="error" size="small" variant="outlined" sx={{ height: 24, fontSize: '0.65rem', fontWeight: 'bold', mb: 0.5 }} /></Tooltip> ) : chip}
          {p.row.depositPaid > 0 && p.row.status !== 'completed' && ( <Tooltip title={`₱${p.row.depositPaid} Deposit Held`}><Chip label="DEPOSIT" size="small" sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', height: 16, fontSize: '0.55rem', fontWeight: 'bold', border: '1px solid #81C784' }} /></Tooltip> )}
          {!['pending', 'cancelled', 'no-show', 'completed', 'carried-over'].includes(p.row.status) && ( isUnassigned ? ( <Button size="small" variant="outlined" color="error" sx={{ fontSize: '0.65rem', fontWeight: 'bold', py: 0.2, mt: 0.5, borderRadius: 2 }} onClick={() => actions.handleOpenAssign(p.row)}> + Assign Staff </Button> ) : ( <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: '#F5F5F5', px: 1, py: 0.2, borderRadius: 1, mt: 0.5 }}> <PersonIcon sx={{ fontSize: 14, color: '#1565C0' }} /> <Typography variant="caption" color="textSecondary" fontWeight="bold" noWrap sx={{ maxWidth: 100 }} component="div">{p.row.assignedVet}</Typography> </Box> ) )}
        </Box>
      );
    }
  },
  {
    field: 'actions', headerName: 'Next Step / Action', flex: 1.5, minWidth: 260, align: 'center', headerAlign: 'center',
    sortable: false, disableColumnMenu: true,
    renderCell: (params) => {
      const btnStyle = { textTransform: 'uppercase', fontWeight: '900', mr: 0.5, boxShadow: 2, px: 3, py: 1, borderRadius: 2, whiteSpace: 'nowrap', letterSpacing: 0.5 };
      const isUnassigned = !params.row.assignedVetId;
      let isVeryLate = false;
      if (params.row.jsScheduled && isToday) { if ((currentTime - params.row.jsScheduled) / 60000 > 30) isVeryLate = true; }

      if (['completed', 'carried-over'].includes(params.row.status)) {
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', overflow: 'hidden' }}>
            <Button size="small" variant="outlined" sx={{...btnStyle, color: '#1565C0', borderColor: '#1565C0', boxShadow: 0}} startIcon={<AssignmentIcon/>} onClick={() => alert('Open Patient Chart (Go to CRM)')}>Chart</Button>
            {params.row.status === 'completed' && <Button size="small" variant="outlined" sx={{...btnStyle, color: '#2E7D32', borderColor: '#2E7D32', boxShadow: 0}} startIcon={<ReceiptIcon/>} onClick={() => alert('View Invoice (Go to Transactions)')}>Invoice</Button>}
            <IconButton onClick={(e) => actions.handleMenuClick(e, params.row)} size="small" sx={{ ml: 'auto' }}><MoreVertIcon fontSize="small" /></IconButton>
          </Box>
        );
      }

      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', overflow: 'hidden' }}>
          {params.row.status === 'pending' && <><Button size="small" variant="contained" color="success" sx={btnStyle} startIcon={<CheckCircleIcon />} onClick={() => actions.handleStatusChange(params.row, 'confirmed')}>Accept</Button><Button size="small" variant="outlined" color="error" sx={{...btnStyle, boxShadow: 0}} onClick={() => { actions.setSelectedId(params.row.id); actions.setOpenReject(true); }}>Reject</Button></>}
          {params.row.status === 'confirmed' && ( <> <Button size="small" variant="contained" color="primary" sx={{...btnStyle, bgcolor: '#1565C0', '&:hover': {bgcolor: '#0D47A1'} }} startIcon={<DirectionsWalkIcon />} onClick={() => actions.handleOpenAssign(params.row)}>CHECK IN</Button> {isVeryLate && <Button size="small" variant="outlined" color="error" sx={{...btnStyle, ml: 1, px: 1, borderWidth: 2, boxShadow: 0 }} onClick={() => actions.handleQuickNoShow(params.row.id)}>No-Show</Button>} </> )}
          {params.row.status === 'arrived' && (isUnassigned ? <Button size="small" variant="contained" color="error" sx={btnStyle} startIcon={<PersonAddIcon />} onClick={() => actions.handleOpenAssign(params.row)}>ASSIGN VET</Button> : <Button size="small" variant="contained" color="success" sx={{...btnStyle, bgcolor: '#2E7D32', fontSize: '0.8rem'}} startIcon={<PlayCircleFilledWhiteIcon />} onClick={() => actions.handleStatusChange(params.row, 'in-consult')}>START VISIT</Button>)}
          {params.row.status === 'in-consult' && ( <> <Button size="small" variant="contained" disabled={isUnassigned} sx={{...btnStyle, bgcolor: isUnassigned ? '#ccc' : '#5D4037'}} onClick={() => actions.handleOpenConsult(params.row)}>Consult Space</Button> <Tooltip title="Wait for Labs"><IconButton size="small" color="warning" sx={{ml: 1}} onClick={() => actions.handleStatusChange(params.row, 'on-hold')}><PauseCircleIcon fontSize="large" /></IconButton></Tooltip> <Tooltip title="Confine"><IconButton size="small" color="error" onClick={() => actions.handleStatusChange(params.row, 'confined')}><LocalHospitalIcon fontSize="large" /></IconButton></Tooltip> </> )}
          {params.row.status === 'on-hold' && <Button size="small" variant="contained" color="warning" sx={btnStyle} startIcon={<PlayCircleFilledWhiteIcon/>} onClick={() => actions.handleStatusChange(params.row, 'in-consult')}>Resume</Button>}
          {params.row.status === 'confined' && <Button size="small" variant="contained" color="warning" sx={btnStyle} startIcon={<ReceiptLongIcon />} onClick={() => actions.handleStatusChange(params.row, 'billing')}>Discharge</Button>}
          {params.row.status === 'dispensing' && <Button size="small" variant="contained" color="success" sx={btnStyle} startIcon={<ReceiptLongIcon />} onClick={() => actions.handleStatusChange(params.row, 'billing')}>To Cashier</Button>}
          {params.row.status === 'billing' && <Button size="small" variant="contained" color="success" sx={btnStyle} startIcon={<PaidIcon />} onClick={() => actions.handleOpenPOS(params.row)}>Generate Invoice</Button>}
          <IconButton onClick={(e) => actions.handleMenuClick(e, params.row)} size="small" sx={{ ml: 'auto' }}><MoreVertIcon fontSize="small" /></IconButton>
        </Box>
      );
    }
  }
];