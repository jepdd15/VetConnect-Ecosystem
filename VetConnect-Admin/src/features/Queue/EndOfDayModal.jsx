import React from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, Typography, List, ListItem, Box, Chip,
  ToggleButtonGroup, ToggleButton, Divider, Stack, Paper 
} from '@mui/material';

// Icons
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import DoNotDisturbIcon from '@mui/icons-material/DoNotDisturb';
import PetsIcon from '@mui/icons-material/Pets';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'; 
import LocalHospitalIcon from '@mui/icons-material/LocalHospital'; 

export default function EndOfDayModal({ 
  open, onClose, leftoverPatients, patientResolutions, 
  onResolutionChange, onBulkResolution, onConfirmReset, isForced, departments 
}) {
  return (
    <Dialog 
      open={open} 
      onClose={isForced ? null : onClose} 
      disableEscapeKeyDown={isForced}
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.2)'
        }
      }}
    >
      <DialogTitle sx={{ 
        background: isForced ? 'linear-gradient(135deg, #D32F2F 0%, #B71C1C 100%)' : 'linear-gradient(135deg, #E65100 0%, #BF360C 100%)',
        color: 'white', fontWeight: '900', display: 'flex', alignItems: 'center', gap: 1.5,
        textTransform: 'uppercase', letterSpacing: 1, py: 2.5
      }}>
        <WarningAmberIcon fontSize="large" /> 
        {isForced ? "Mandatory Daily Reconciliation" : "End-of-Day Cleanup"}
      </DialogTitle>
      
      <DialogContent dividers sx={{ bgcolor: 'rgba(250, 250, 250, 0.5)', p: 0 }}>
        
        {/* INSTRUCTIONS AREA */}
        <Box sx={{ p: 3, pb: 2, borderBottom: '1px solid #E0E0E0', bgcolor: 'white', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: isForced ? '#FFEBEE' : '#FFF3E0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <WarningAmberIcon sx={{ color: isForced ? '#D32F2F' : '#E65100' }} />
            </Box>
            <Typography variant="body2" sx={{ color: '#555', fontWeight: isForced ? 'bold' : '500', fontSize: '0.95rem' }}>
            {isForced 
                ? "You cannot begin today's queue until you resolve these abandoned patient records from previous days. Please select a final action for each."
                : "Please triage the remaining patients on the board. Unresolved non-confined patients will default to Cancelled."}
            </Typography>
        </Box>

        {/* BULK ACTION TOOLBAR */}
        {leftoverPatients.length > 1 && (
          <Box sx={{ px: 3, py: 1.5, bgcolor: '#E3F2FD', borderBottom: '1px solid #BBDEFB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <Typography variant="caption" fontWeight="900" color="#1565C0" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, textTransform: 'uppercase' }}>
                <AutoFixHighIcon fontSize="small" /> Quick Apply to All (Unlocked)
             </Typography>
             <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" color="success" sx={{ bgcolor: 'white', fontWeight: 'bold' }} onClick={() => onBulkResolution('rebook')}>
                  All Re-book
                </Button>
                <Button size="small" variant="outlined" color="warning" sx={{ bgcolor: 'white', fontWeight: 'bold' }} onClick={() => onBulkResolution('no-show')}>
                  All No-Show
                </Button>
                <Button size="small" variant="outlined" color="error" sx={{ bgcolor: 'white', fontWeight: 'bold' }} onClick={() => onBulkResolution('cancel')}>
                  All Cancel
                </Button>
             </Stack>
          </Box>
        )}

        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {leftoverPatients.map((patient) => {
            const isConfined = patient.status === 'confined';
            const resolution = isConfined ? 'confined' : (patientResolutions[patient.id] || 'cancel');

            let borderColor, bgTint;
            if (isConfined) { borderColor = '#90CAF9'; bgTint = '#F3E5F5'; }
            else if (resolution === 'rebook') { borderColor = '#81C784'; bgTint = '#F1F8E9'; }
            else if (resolution === 'no-show') { borderColor = '#FFB74D'; bgTint = '#FFF8E1'; }
            else { borderColor = '#E57373'; bgTint = '#FFEBEE'; }

            // --- THE DYNAMIC COLOR ENGINE ---
            const serviceCategory = patient.serviceCategory || 'General';
            const deptObj = (departments || []).find(d => d.name === serviceCategory);
            const badgeColor = deptObj ? deptObj.color : '#424242'; // Default to dark grey

            return (
              <Paper 
                key={patient.id} elevation={0}
                sx={{ 
                  display: 'flex', alignItems: 'center', border: '2px solid', borderColor: borderColor, 
                  bgcolor: 'white', borderRadius: 3, overflow: 'hidden',
                  transition: 'all 0.2s ease-in-out', boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                }}
              >
                
                {/* LEFT SIDE: Patient Identity */}
                <Box sx={{ flex: 1, p: 2.5, bgcolor: bgTint, display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid', borderColor: borderColor }}>
                        <PetsIcon sx={{ color: borderColor }} />
                    </Box>
                    <Box>
                        <Typography fontWeight="900" color="#3E2723" component="div" sx={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
                            {patient.petName}
                            <Chip 
                              label={patient.serviceType} 
                              size="small" 
                              sx={{ 
                                  fontWeight: 'bold', 
                                  color: 'white', 
                                  bgcolor: badgeColor, // <-- USING THE DYNAMIC COLOR!
                                  height: 20
                              }} 
                            />
                        </Typography>
                        <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5, fontWeight: '600' }}>
                            Owner: {patient.ownerName || 'Unknown'}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                            <Typography variant="caption" color="textSecondary" fontWeight="bold">Status at closing:</Typography>
                            <Chip label={patient.status.toUpperCase()} size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: '900', bgcolor: 'white', border: '1px solid #ccc' }} />
                        </Box>
                    </Box>
                </Box>

                <Box sx={{ borderLeft: '2px dashed #E0E0E0', height: '100px', mx: 2 }} />

                {/* RIGHT SIDE: Action Toggles */}
                <Box sx={{ p: 2.5, minWidth: 420 }}>
                    <Typography variant="caption" color="textSecondary" fontWeight="bold" sx={{ display: 'block', mb: 1, textTransform: 'uppercase' }}>
                        Required Action
                    </Typography>

                    {isConfined ? (
                        <Chip icon={<LocalHospitalIcon />} label="AUTO-CONTINUE CONFINEMENT" color="primary" sx={{ fontWeight: '900', width: '100%', py: 3, fontSize: '0.9rem', bgcolor: '#E3F2FD', color: '#1565C0', borderRadius: 2 }} />
                    ) : (
                        <ToggleButtonGroup
                            value={resolution}
                            exclusive
                            onChange={(e, newAction) => { if(newAction) onResolutionChange(patient.id, newAction) }}
                            size="small"
                            fullWidth
                            sx={{ 
                                bgcolor: '#F5F5F5', p: 0.5, borderRadius: 2,
                                '& .MuiToggleButtonGroup-grouped': { border: 'none', borderRadius: 1.5, mx: 0.5 }
                            }}
                        >
                            <ToggleButton value="rebook" sx={{ fontWeight: 'bold', '&.Mui-selected': { bgcolor: '#2E7D32', color: 'white', '&:hover': { bgcolor: '#1B5E20' } } }}>
                                <EventRepeatIcon sx={{mr:0.5, fontSize: 18}} /> Re-book
                            </ToggleButton>
                            <ToggleButton value="no-show" sx={{ fontWeight: 'bold', '&.Mui-selected': { bgcolor: '#E65100', color: 'white', '&:hover': { bgcolor: '#BF360C' } } }}>
                                <HelpOutlineIcon sx={{mr:0.5, fontSize: 18}} /> No-Show
                            </ToggleButton>
                            <ToggleButton value="cancel" sx={{ fontWeight: 'bold', '&.Mui-selected': { bgcolor: '#D32F2F', color: 'white', '&:hover': { bgcolor: '#B71C1C' } } }}>
                                <DoNotDisturbIcon sx={{mr:0.5, fontSize: 18}} /> Cancel
                            </ToggleButton>
                        </ToggleButtonGroup>
                    )}
                </Box>
              </Paper>
            );
          })}
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 3, bgcolor: 'white', borderTop: '1px solid #E0E0E0' }}>
        {!isForced && (
            <Button onClick={onClose} sx={{ color: '#5D4037', fontWeight: 'bold', mr: 'auto', px: 3 }}>CANCEL</Button>
        )}
        <Button onClick={onConfirmReset} variant="contained" color="error" sx={{ fontWeight: '900', px: 5, py: 1.5, borderRadius: 2, boxShadow: '0 4px 14px rgba(211, 47, 47, 0.4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {isForced ? "Process & Unlock Queue" : "Process & Reset Board"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}