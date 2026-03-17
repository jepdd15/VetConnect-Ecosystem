import React from 'react';
import { Box, Typography, Chip, Tooltip, IconButton, Button } from '@mui/material';

// Icons
import CheckCircleIcon from '@mui/icons-material/CheckCircle'; 
import PlayCircleFilledWhiteIcon from '@mui/icons-material/PlayCircleFilledWhite'; 
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk'; 
import LocalHospitalIcon from '@mui/icons-material/LocalHospital'; 
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'; 
import PaidIcon from '@mui/icons-material/Paid';
import PersonAddIcon from '@mui/icons-material/PersonAdd'; 
import MoreVertIcon from '@mui/icons-material/MoreVert'; 
import PersonIcon from '@mui/icons-material/Person';
import SmartphoneIcon from '@mui/icons-material/Smartphone'; 
import AccessTimeIcon from '@mui/icons-material/AccessTime'; 
import PauseCircleIcon from '@mui/icons-material/PauseCircle'; 

// We export a FUNCTION that takes our states and handlers as arguments
export const getQueueColumns = (tabValue, currentTime, actions) =>[
  { 
    field: 'identity', headerName: 'Patient Identity', flex: 1.5, minWidth: 200, headerAlign: 'left', align: 'left',
    renderCell: (p) => {
      const isWalkIn = p.row.ownerId === 'WALK_IN_USER' || String(p.row.ownerId).includes('GUEST_');
      let isLate = false;
      if (!isWalkIn && p.row.jsScheduled && p.row.jsArrived) { if ((p.row.jsArrived - p.row.jsScheduled) / 60000 > 15) isLate = true; }
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            {p.row.queueNumber ? ( <Chip label={`Ticket ${p.row.ticketPrefix || ''}-${p.row.queueNumber}`} size="small" sx={{ bgcolor: '#3E2723', color: 'white', fontWeight: 'bold', height: 22, fontSize: '0.7rem' }} /> ) : ( <Chip label="No Ticket" size="small" variant="outlined" sx={{ color: '#aaa', borderColor: '#eee', height: 22, fontSize: '0.7rem', fontStyle: 'italic' }} /> )}
            <Typography variant="body2" fontWeight="bold" noWrap>{p.row.ownerName || 'App Client'}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title={isWalkIn ? "Walk-In" : isLate ? "Late Arrival" : "App Booking"}>{isWalkIn ? <DirectionsWalkIcon sx={{ fontSize: 14, color: '#757575' }} /> : isLate ? <AccessTimeIcon sx={{ fontSize: 14, color: '#D32F2F' }} /> : <SmartphoneIcon sx={{ fontSize: 14, color: '#1976D2' }} />}</Tooltip>
            <Typography variant="caption" color={isLate ? 'error' : 'textSecondary'} noWrap>{p.row.petName} ({p.row.petSpecies || 'Pet'})</Typography>
          </Box>
        </Box>
      );
    }
  },
  { 
    field: 'context', headerName: 'Service Details', flex: 1.5, minWidth: 180, headerAlign: 'left', align: 'left',
    renderCell: (p) => (
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', pr: 2 }}>
        <Typography variant="body2" fontWeight="bold" color="#1565C0" noWrap>{p.row.serviceType}</Typography>
        <Tooltip title={p.row.notes || "No notes"}><Typography variant="caption" color="textSecondary" sx={{ fontStyle: 'italic', display: 'block' }} noWrap>{p.row.notes ? `"${p.row.notes}"` : "—"}</Typography></Tooltip>
      </Box>
    )
  },
  { 
    field: 'timing', headerName: 'Time Tracking', flex: 1.2, minWidth: 150, headerAlign: 'center', align: 'center', 
    renderCell: (p) => {
      let relativeTime = <Typography variant="caption" color="textSecondary">-</Typography>;
      if (p.row.status === 'on-hold') { relativeTime = <Typography sx={{color:'#F57C00', fontWeight:'bold', fontStyle:'italic', fontSize:'0.75rem'}}>⏸️ Paused</Typography>; }
      else if (tabValue === 2 && p.row.jsArrived) { const diff = Math.floor((currentTime - p.row.jsArrived) / 60000); relativeTime = <Typography variant="caption" sx={{color: diff > 30 ? '#D32F2F' : diff > 15 ? '#F57C00' : '#388E3C', fontWeight:'bold'}}>⏳ {diff >= 0 ? diff : 0} mins waiting</Typography>; } 
      else if (tabValue === 3 && p.row.jsStarted) { const diff = Math.floor((currentTime - p.row.jsStarted) / 60000); relativeTime = <Typography variant="caption" sx={{color: '#1976D2', fontWeight:'bold'}}>⏱️ {diff >= 0 ? diff : 0} mins</Typography>; } 
      else if (tabValue === 6 && p.row.jsArrived && p.row.jsCompleted) { const diff = Math.floor((p.row.jsCompleted - p.row.jsArrived) / 60000); relativeTime = <Typography variant="caption" color="textSecondary" fontWeight="bold">Total: {diff}m</Typography>; }
      const exactTime = p.row.status === 'pending' || p.row.status === 'confirmed' ? `Sch: ${p.row.jsScheduled ? p.row.jsScheduled.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A'}` : p.row.jsArrived ? `Arr: ${p.row.jsArrived.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : '-';
      return ( <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Typography variant="caption" color="textSecondary">{exactTime}</Typography>{relativeTime}</Box> );
    }
  },
  { 
    field: 'statusAndStaff', headerName: 'Status & Staff', flex: 1, minWidth: 130, headerAlign: 'center', align: 'center',
    renderCell: (p) => {
      let color = 'default'; let label = p.row.status.toUpperCase();
      if (p.row.status === 'confirmed') color = 'info'; if (p.row.status === 'pending') color = 'warning'; if (p.row.status === 'arrived') { color = 'secondary'; label = "LOBBY"; } if (p.row.status === 'in-consult') { color = 'primary'; label = "DOCTOR"; } if (p.row.status === 'on-hold') { color = 'warning'; label = "ON HOLD"; } if (p.row.status === 'dispensing') { color = 'warning'; label = "PHARMACY"; } if (p.row.status === 'billing') { color = 'success'; label = "PAYMENT"; } if (p.row.status === 'completed') color = 'default'; if (p.row.status === 'confined') { color = 'error'; label = "CONFINED"; } 
      const chip = <Chip label={label} color={color} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 'bold', mb: 0.5 }} />;
      const isUnassigned = !p.row.assignedVet || p.row.assignedVet === 'Unassigned';
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          {p.row.status === 'cancelled' || p.row.status === 'no-show' ? ( <Tooltip title={p.row.rejectReason}><Chip label={label} color="error" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 'bold' }} /></Tooltip> ) : chip}
          {p.row.depositPaid > 0 && p.row.status !== 'completed' && ( <Tooltip title={`₱${p.row.depositPaid} Deposit Held`}><Chip label="DEPOSIT" size="small" sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', height: 16, fontSize: '0.55rem', fontWeight: 'bold', mb: 0.5, border: '1px solid #81C784' }} /></Tooltip> )}
          {!['pending', 'cancelled'].includes(p.row.status) && ( isUnassigned ? ( <Typography variant="caption" color="error" fontWeight="bold" sx={{cursor:'pointer'}} onClick={() => actions.handleOpenAssign(p.row)}> + Assign Staff </Typography> ) : ( <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}> <PersonIcon sx={{ fontSize: 12, color: '#1565C0' }} /> <Typography variant="caption" color="textSecondary" noWrap sx={{ maxWidth: 90 }}>{p.row.assignedVet}</Typography> </Box> ) )}
        </Box>
      );
    }
  },
  {
    field: 'actions', headerName: 'Next Step / Action', flex: 1.5, minWidth: 260, headerAlign: 'center', align: 'center',
    renderCell: (params) => {
      const isUnassigned = !params.row.assignedVet || params.row.assignedVet === 'Unassigned';
      let isSuperLate = false;
      if (params.row.status === 'confirmed' && params.row.jsScheduled) { if ((new Date() - params.row.jsScheduled) / 60000 > 30) isSuperLate = true; }
      const btnStyle = { textTransform: 'none', fontWeight: 'bold', mr: 0.5, boxShadow: 0, px: 1, minWidth: 0, whiteSpace: 'nowrap' };

      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', overflow: 'hidden' }}>
          {params.row.status === 'pending' && <><Button size="small" variant="contained" color="success" sx={btnStyle} startIcon={<CheckCircleIcon />} onClick={() => actions.handleStatusChange(params.row, 'confirmed')}>Accept</Button><Button size="small" variant="outlined" color="error" sx={btnStyle} onClick={() => { actions.setSelectedId(params.row.id); actions.setOpenReject(true); }}>Reject</Button></>}
          {params.row.status === 'confirmed' && <><Button size="small" variant="contained" color="secondary" sx={btnStyle} startIcon={<DirectionsWalkIcon />} onClick={() => actions.handleOpenAssign(params.row)}>Check In</Button>{isSuperLate && <Button size="small" variant="outlined" color="error" sx={btnStyle} onClick={() => actions.handleQuickNoShow(params.row.id)}>No-Show</Button>}</>}
          {params.row.status === 'arrived' && (isUnassigned ? <Button size="small" variant="contained" color="error" sx={btnStyle} startIcon={<PersonAddIcon />} onClick={() => actions.handleOpenAssign(params.row)}>Assign</Button> : <Button size="small" variant="contained" color="primary" sx={btnStyle} startIcon={<PlayCircleFilledWhiteIcon />} onClick={() => actions.handleStatusChange(params.row, 'in-consult')}>Start</Button>)}
          {params.row.status === 'in-consult' && ( <> <Button size="small" variant="contained" disabled={isUnassigned} sx={{...btnStyle, bgcolor: isUnassigned ? '#ccc' : '#1976D2'}} onClick={() => actions.handleOpenConsult(params.row)}>Consult Space</Button> <Tooltip title="Wait for Labs"><IconButton size="small" color="warning" onClick={() => actions.handleStatusChange(params.row, 'on-hold')}><PauseCircleIcon fontSize="small" /></IconButton></Tooltip> <Tooltip title="Confine"><IconButton size="small" color="error" onClick={() => actions.handleStatusChange(params.row, 'confined')}><LocalHospitalIcon fontSize="small" /></IconButton></Tooltip> </> )}
          {params.row.status === 'on-hold' && <Button size="small" variant="contained" color="warning" sx={btnStyle} startIcon={<PlayCircleFilledWhiteIcon/>} onClick={() => actions.handleStatusChange(params.row, 'in-consult')}>Resume</Button>}
          {params.row.status === 'confined' && <Button size="small" variant="contained" color="warning" sx={btnStyle} startIcon={<ReceiptLongIcon />} onClick={() => actions.handleStatusChange(params.row, 'billing')}>Discharge</Button>}
          {params.row.status === 'dispensing' && <Button size="small" variant="contained" color="success" sx={btnStyle} startIcon={<ReceiptLongIcon />} onClick={() => actions.handleStatusChange(params.row, 'billing')}>To Cashier</Button>}
          {params.row.status === 'billing' && <Button size="small" variant="contained" color="success" sx={btnStyle} startIcon={<PaidIcon />} onClick={() => actions.handleOpenPOS(params.row)}>Invoice</Button>}
          <IconButton onClick={(e) => actions.handleMenuClick(e, params.row)} size="small" sx={{ ml: 'auto' }}><MoreVertIcon fontSize="small" /></IconButton>
        </Box>
      );
    }
  }
];