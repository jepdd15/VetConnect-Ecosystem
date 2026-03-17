// DataGrid UI Configuration.
// Calculates real-time wait times (e.g., ⏳ 15m wait) and renders dynamic action buttons 
// (Check-In, Start, Invoice) based on the patient's exact step in the pipeline.

import React from 'react';
import { Box, Typography, Chip, Tooltip, IconButton, Button } from '@mui/material';

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

export const getQueueColumns = (tabValue, currentTime, actions) =>[
  { 
    field: 'identity', headerName: 'Patient Identity', flex: 1.5, minWidth: 200,
    renderCell: (p) => {
      // THE FIX: isWalkIn is used right here for the Tooltip and Icon!
      const isWalkIn = p.row.ownerId === 'WALK_IN_USER' || String(p.row.ownerId).includes('GUEST_');
      let isLate = false;
      if (!isWalkIn && p.row.jsScheduled && p.row.jsArrived) { 
        if ((p.row.jsArrived - p.row.jsScheduled) / 60000 > 15) isLate = true; 
      }
      
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            {p.row.queueNumber ? (
              <Chip label={`Tkt ${p.row.ticketPrefix || ''}-${p.row.queueNumber}`} size="small" sx={{ bgcolor: '#3E2723', color: 'white', fontWeight: 'bold', height: 20, fontSize: '0.65rem' }} />
            ) : (
              <Chip label="No Tkt" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
            )}
            <Typography variant="body2" fontWeight="bold" component="div" noWrap>{p.row.ownerName || 'Mobile App Client'}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title={isWalkIn ? "Walk-In" : isLate ? "Late Arrival" : "App Booking"}>
              {isWalkIn ? <DirectionsWalkIcon sx={{ fontSize: 14, color: '#757575' }} /> : isLate ? <AccessTimeIcon sx={{ fontSize: 14, color: '#D32F2F' }} /> : <SmartphoneIcon sx={{ fontSize: 14, color: '#1976D2' }} />}
            </Tooltip>
            <Typography variant="caption" color="textSecondary" component="div" noWrap>{p.row.petName} ({p.row.petSpecies || 'Pet'})</Typography>
          </Box>
        </Box>
      );
    }
  },
  { 
    field: 'context', headerName: 'Service Details', flex: 1.2, minWidth: 160,
    renderCell: (p) => (
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
        <Typography variant="body2" fontWeight="bold" color="#1565C0" component="div" noWrap>{p.row.serviceType}</Typography>
        <Typography variant="caption" color="textSecondary" component="div" sx={{ fontStyle: 'italic' }} noWrap>{p.row.notes || "—"}</Typography>
      </Box>
    )
  },
  { 
    field: 'timing', headerName: 'Time Tracking', flex: 1, minWidth: 140, align: 'center', headerAlign: 'center',
    renderCell: (p) => {
      let relativeText = "";
      let color = "textSecondary";
      if (p.row.status === 'on-hold') relativeText = "⏸️ On Hold";
      else if (tabValue === 2 && p.row.jsArrived) {
        const diff = Math.floor((currentTime - p.row.jsArrived) / 60000);
        relativeText = `⏳ ${diff}m wait`;
        if (diff > 20) color = "error.main";
      }
      else if (tabValue === 3 && p.row.jsStarted) {
        const diff = Math.floor((currentTime - p.row.jsStarted) / 60000);
        relativeText = `⏱️ ${diff}m elapsed`;
        color = "info.main";
      }
      return (
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="caption" display="block" sx={{ fontWeight: 'bold' }}>{p.row.jsScheduled ? p.row.jsScheduled.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}</Typography>
          <Typography variant="caption" color={color} sx={{ fontSize: '0.65rem', fontWeight: 'bold' }}>{relativeText}</Typography>
        </Box>
      );
    }
  },
  { 
    field: 'status', headerName: 'Status & Staff', flex: 1, minWidth: 130, align: 'center', headerAlign: 'center',
    renderCell: (p) => (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Chip label={p.row.status.toUpperCase()} size="small" variant="outlined" color="primary" sx={{ height: 20, fontSize: '0.6rem', fontWeight: 'bold', mb: 0.5 }} />
        <Typography variant="caption" color="textSecondary" noWrap sx={{ maxWidth: 100 }}>{p.row.assignedVet || 'Unassigned'}</Typography>
      </Box>
    )
  },
  {
    field: 'actions', headerName: 'Actions', flex: 1.5, minWidth: 220, align: 'center', headerAlign: 'center',
    renderCell: (params) => {
      const btnStyle = { textTransform: 'none', fontWeight: 'bold', ml: 0.5 };
      return (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {params.row.status === 'pending' && <><Button size="small" variant="contained" color="success" sx={btnStyle} onClick={() => actions.handleStatusChange(params.row, 'confirmed')}>Accept</Button><Button size="small" variant="outlined" color="error" sx={btnStyle} onClick={() => { actions.setSelectedId(params.row.id); actions.setOpenReject(true); }}>Reject</Button></>}
          {params.row.status === 'confirmed' && <Button size="small" variant="contained" color="secondary" sx={btnStyle} onClick={() => actions.handleOpenAssign(params.row)}>Check In</Button>}
          {params.row.status === 'arrived' && <Button size="small" variant="contained" color="primary" sx={btnStyle} onClick={() => actions.handleStatusChange(params.row, 'in-consult')}>Start</Button>}
          {params.row.status === 'in-consult' && ( <> <Button size="small" variant="contained" color="info" sx={btnStyle} onClick={() => actions.handleOpenConsult(params.row)}>Consult</Button> <Tooltip title="Hold"><IconButton size="small" color="warning" onClick={() => actions.handleStatusChange(params.row, 'on-hold')}><PauseCircleIcon fontSize="small" /></IconButton></Tooltip> <Tooltip title="Confine"><IconButton size="small" color="error" onClick={() => actions.handleStatusChange(params.row, 'confined')}><LocalHospitalIcon fontSize="small" /></IconButton></Tooltip> </> )}
          {params.row.status === 'on-hold' && <Button size="small" variant="contained" color="warning" sx={btnStyle} onClick={() => actions.handleStatusChange(params.row, 'in-consult')}>Resume</Button>}
          {params.row.status === 'confined' && <Button size="small" variant="contained" color="warning" sx={btnStyle} onClick={() => actions.handleStatusChange(params.row, 'billing')}>Discharge</Button>}
          {params.row.status === 'dispensing' && <Button size="small" variant="contained" color="success" sx={btnStyle} onClick={() => actions.handleStatusChange(params.row, 'billing')}>To Cashier</Button>}
          {params.row.status === 'billing' && <Button size="small" variant="contained" color="success" sx={btnStyle} onClick={() => actions.handleOpenPOS(params.row)}>Invoice</Button>}
          <IconButton size="small" onClick={(e) => actions.handleMenuClick(e, params.row)}><MoreVertIcon fontSize="small" /></IconButton>
        </Box>
      );
    }
  }
];