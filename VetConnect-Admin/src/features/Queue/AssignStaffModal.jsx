import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, Box, Typography, Paper, Chip, Avatar, Alert, 
  Divider, Stack, Popover, List, ListItem // Added Popover, List, ListItem
} from '@mui/material';

// Icons
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import StarIcon from '@mui/icons-material/Star';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonOffIcon from '@mui/icons-material/PersonOff';

import { doc, runTransaction, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

// A dedicated sub-component for ultimate code cleanliness!
const SkillChips = ({ departments, allDepts, onClickMore }) => {
  if (!departments || departments.length === 0) {
    return <Typography variant="caption" fontStyle="italic">No departments assigned</Typography>;
  }

  const MAX_VISIBLE = 3;
  const visibleSkills = departments.slice(0, MAX_VISIBLE);
  const hiddenSkills = departments.slice(MAX_VISIBLE);

  return (
    <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {visibleSkills.map(deptName => {
        const deptObj = (allDepts || []).find(d => d.name === deptName);
        const chipColor = deptObj ? deptObj.color : '#616161';
        return (
          <Chip 
            key={deptName} label={deptName} size="small"
            sx={{ color: 'white', bgcolor: chipColor, fontWeight: 'bold', fontSize: '0.6rem', height: 18 }} 
          />
        );
      })}
      {hiddenSkills.length > 0 && (
        <Chip 
          label={`+${hiddenSkills.length}`}
          size="small"
          onClick={(e) => { e.stopPropagation(); onClickMore(e, hiddenSkills); }} // Stop propagation to prevent card click
          sx={{ 
            color: '#555', bgcolor: '#E0E0E0', fontWeight: 'bold', 
            fontSize: '0.6rem', height: 18, cursor: 'pointer',
            '&:hover': { bgcolor: '#BDBDBD' }
          }} 
        />
      )}
    </Box>
  );
};

export default function AssignStaffModal({ open, onClose, patient, vetsList, activeAppointments, departments }) {
  const [selectedVet, setSelectedVet] = useState(null); 
  const [loading, setLoading] = useState(false);
  const[errorMsg, setErrorMsg] = useState('');

  // --- NEW: POPOVER STATE & HANDLERS ---
  const [popoverAnchorEl, setPopoverAnchorEl] = useState(null);
  const [popoverSkills, setPopoverSkills] = useState([]);

  const handleSkillsPopoverOpen = (event, skills) => {
    setPopoverAnchorEl(event.currentTarget);
    setPopoverSkills(skills);
  };

  const handleSkillsPopoverClose = () => {
    setPopoverAnchorEl(null);
    setPopoverSkills([]);
  };

  useEffect(() => {
    if (open && patient) {
      if (patient.assignedVetId && patient.assignedVetId !== 'Unassigned') {
        const vetObj = vetsList.find(v => v.id === patient.assignedVetId);
        setSelectedVet(vetObj || null);
      } else {
        setSelectedVet(null); 
      }
      setErrorMsg('');
    }
  }, [open, patient, vetsList]);

  const getVetWorkload = (vetId) => {
    if (!activeAppointments) return 0;
    return activeAppointments.filter(a => a.assignedVetId === vetId).length;
  };

  const handleSubmit = async () => {
    if (!patient || !patient.services) return;
    
    setLoading(true);
    setErrorMsg('');

    try {
      const isCheckIn = patient.status === 'confirmed';
      
      // we already have the modified services array in the state-like mapping if we were careful
      // BUT, let's just update the appointment document with the current selectedVet logic
      // In a real multi-staff world, we would have a local state tracking which service gets which vet.
      // FOR THE MVP: We'll assume the user picks a vet for the PRIMARY service if we haven't built the full list yet.
      // WAIT, let's build the full list UI first below!
    } catch (e) { console.error(e); }
  };

  if (!patient) return null;

  const isCheckIn = patient.status === 'confirmed';
  const targetCategory = patient?.serviceCategory || patient?.services?.[0]?.department || 'General';
  const mainDeptObj = (departments || []).find(d => d.name === targetCategory);
  const badgeColor = mainDeptObj ? mainDeptObj.color : '#6D4C41';
  
  // --- 🧬 MULTI-SERVICE ASSIGNMENT RENDERER ---
  const ServiceAssignmentRow = ({ svc, idx }) => {
    const deptObj = (departments || []).find(d => d.name === svc.department);
    const badgeColor = deptObj ? deptObj.color : '#616161';
    
    // Filter staff for THIS specific service's department
    const qualifiedStaff = (vetsList || []).filter(v => v.departments?.includes(svc.department));
    const others = (vetsList || []).filter(v => !v.departments?.includes(svc.department));

    return (
        <Paper key={idx} sx={{ p: 2, mb: 2, border: '1px solid #E0E0E0', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: badgeColor, fontWeight: '900', letterSpacing: 1 }}>SERVICE {idx + 1}</Typography>
                  <Typography variant="subtitle1" fontWeight="900" color="#3E2723">{svc.name}</Typography>
                </Box>
                <Chip label={svc.department} size="small" sx={{ bgcolor: `${badgeColor}20`, color: badgeColor, fontWeight: 'bold' }} />
            </Box>

            <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="textSecondary" fontWeight="bold" sx={{ display: 'block', mb: 1 }}>Assign Professional:</Typography>
                <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 1 }}>
                    {qualifiedStaff.map(v => (
                        <Chip 
                            key={v.id} 
                            avatar={<Avatar>{v.fullName[0]}</Avatar>} 
                            label={v.fullName} 
                            onClick={async () => {
                                // --- DIRECT ASSIGNMENT TRIGGER ---
                                const newServices = [...patient.services];
                                newServices[idx].staffId = v.id;
                                newServices[idx].staffName = v.fullName;
                                await updateDoc(doc(db, "appointments", patient.id), { 
                                    services: newServices,
                                    assignedVet: v.fullName, // Legacy Fallback
                                    assignedVetId: v.id     // Legacy Fallback
                                });
                            }}
                            variant={svc.staffId === v.id ? "filled" : "outlined"}
                            color={svc.staffId === v.id ? "success" : "default"}
                            sx={{ fontWeight: '900' }}
                        />
                    ))}
                    {qualifiedStaff.length === 0 && (
                        <Typography variant="caption" fontStyle="italic">No {svc.department} staff found in the directory.</Typography>
                    )}
                </Stack>
            </Box>
            
            {svc.staffId && (
                <Box sx={{ mt: 1.5, p: 1, bgcolor: '#F1F8E9', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CheckCircleIcon color="success" sx={{ fontSize: 16 }} />
                    <Typography variant="caption" fontWeight="bold" color="#2E7D32">Assigned to: {svc.staffName}</Typography>
                </Box>
            )}
        </Paper>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      {/* DIALOG HEADER */}
      <DialogTitle sx={{ 
          // THE FIX: The header color now matches the department color!
          background: `linear-gradient(135deg, ${badgeColor} 0%, ${badgeColor}CC 100%)`, 
          color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 
      }}>
        <AssignmentIndIcon /> {isCheckIn ? "Check-In & Dispatch Patient" : "Transfer / Re-assign Visit"}
      </DialogTitle>
      
      {/* 2. THE PINNED PATIENT TICKET */}
      <Box sx={{ p: 3, pb: 2, bgcolor: '#FFF8E1', borderBottom: '2px dashed #D7CCC8', zIndex: 10, position: 'relative' }}>
          {errorMsg ? <Alert severity="error" sx={{ mb: 2, fontWeight: 'bold' }}>{errorMsg}</Alert> : null}
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="caption" color="#8B4513" fontWeight="bold" sx={{ letterSpacing: 1 }}>PATIENT ROUTING TICKET</Typography>
              <Chip label={`DEPT: ${targetCategory.toUpperCase()}`} size="small" sx={{ bgcolor: badgeColor, color: 'white', fontWeight: 'bold', boxShadow: `0 2px 5px ${badgeColor}66`, fontSize: '0.65rem' }} />
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: 'white', color: '#5D4037', border: '2px solid #8B4513', width: 60, height: 60, fontSize: 28, boxShadow: 2 }}>
                  {(patient.petSpecies === 'Canine' || patient.petSpecies === 'Dog') ? '🐶' : '🐱'}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                  <Typography variant="h5" fontWeight="900" color="#3E2723" sx={{ lineHeight: 1.1 }}>{patient.petName}</Typography>
                  <Typography variant="body2" color="textSecondary" sx={{fontWeight: '600', mt: 0.5}}>Owner: {patient.ownerName || 'Mobile App Client'}</Typography>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="textSecondary" display="block" fontWeight="bold" sx={{mb: 0.5}}>REQUESTED SERVICE</Typography>
                  {/* THE FIX: The service chip now uses the dynamic color! */}
                  <Chip label={patient.serviceType} sx={{ fontWeight: 'bold', fontSize: '0.85rem', bgcolor: badgeColor, color: 'white', boxShadow: 3 }} />
              </Box>
          </Box>
      </Box>

      {/* SCROLLABLE STAFF LIST */}
      <DialogContent sx={{ p: 0, bgcolor: '#F5F5F5', minHeight: 400 }}>
        <Box sx={{ p: 3 }}>
            {/* 🧬 THE MULTI-SERVICE ROUTING CORRIDOR */}
            <Typography variant="overline" color="#5D4037" fontWeight="bold" sx={{ mb: 2, display: 'block', letterSpacing: 1 }}>
              Service-Level Staff Routing
            </Typography>

            {patient.services && patient.services.length > 0 ? (
                patient.services.map((svc, idx) => (
                    <ServiceAssignmentRow key={idx} svc={svc} idx={idx} />
                ))
            ) : (
                <Alert severity="warning">No services found for this appointment. Using legacy fallback.</Alert>
            )}

            {isCheckIn && (
                <Box sx={{ mt: 4, p: 3, bgcolor: '#E8F5E9', borderRadius: 2, border: '2px solid #2E7D32', textAlign: 'center' }}>
                    <Typography variant="h6" fontWeight="bold" color="#2E7D32" gutterBottom>Ready to Dispatch?</Typography>
                    <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>This will issue a Queue Ticket and notify the assigned staff.</Typography>
                    <Button 
                        fullWidth variant="contained" color="success" size="large" 
                        startIcon={<CheckCircleIcon />} 
                        sx={{ fontWeight: '900', py: 2, borderRadius: 2 }}
                        onClick={async () => {
                            setLoading(true);
                            try {
                                await runTransaction(db, async (transaction) => {
                                    const queueRef = doc(db, "queue", "daily_queue");
                                    const queueDoc = await transaction.get(queueRef);
                                    const newNumber = queueDoc.exists() ? (queueDoc.data().lastNumberIssued || 0) + 1 : 1;
                                    
                                    transaction.set(queueRef, { lastNumberIssued: newNumber }, { merge: true });
                                    transaction.update(doc(db, "appointments", patient.id), { 
                                        status: 'arrived', 
                                        queueNumber: newNumber, 
                                        ticketPrefix: patient.priority === 'high' ? 'E' : 'W', 
                                        timeArrived: Timestamp.now() 
                                    });
                                });
                                onClose();
                            } catch (e) { setErrorMsg(e.message); }
                            finally { setLoading(false); }
                        }}
                    >
                        {loading ? "Generating Ticket..." : "Issue Ticket & Dispatch"}
                    </Button>
                </Box>
            )}
        </Box>
      </DialogContent>

      {/* ACTION FOOTER */}
      <DialogActions sx={{ p: 2.5, bgcolor: '#EFEBE9', justifyContent: 'space-between', borderTop: '1px solid #D7CCC8' }}>
        <Button 
            onClick={() => handleSubmit(true)} 
            color="error" 
            variant="outlined"
            startIcon={<PersonOffIcon />}
            sx={{ fontWeight: 'bold', bgcolor: 'white' }}
        >
            Unassign (Waiting Room)
        </Button>
        <Stack direction="row" spacing={2}>
            <Button onClick={onClose} sx={{ fontWeight: 'bold', color: '#5D4037' }}>Cancel</Button>
            <Button 
              onClick={() => handleSubmit(false)} 
              disabled={loading || !selectedVet} 
              variant="contained" 
              color={isCheckIn ? 'success' : 'primary'} 
              sx={{ fontWeight: 'bold', px: 4, py: 1 }}
            >
              {loading ? "Processing..." : (isCheckIn ? "Check-In" : "Update")}
            </Button>
        </Stack>
      </DialogActions>

      {/* THE POPOVER for "Show More" Skills */}
      <Popover
        open={Boolean(popoverAnchorEl)}
        anchorEl={popoverAnchorEl}
        onClose={handleSkillsPopoverClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{
            sx: { p: 1, bgcolor: '#424242', borderRadius: 2, mt: 0.5 }
        }}
      >
        <List dense>
            {popoverSkills.map(skill => {
                const deptObj = (departments || []).find(d => d.name === skill);
                const chipColor = deptObj ? deptObj.color : '#616161';
                return (
                    <ListItem key={skill}>
                        <Chip label={skill} size="small" sx={{ color: 'white', bgcolor: chipColor, fontWeight: 'bold' }} />
                    </ListItem>
                );
            })}
        </List>
      </Popover>

    </Dialog>
  );
}