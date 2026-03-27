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

  const handleSubmit = async (isUnassigning = false) => {
    if (!patient) return;
    
    if (!isUnassigning && !selectedVet) {
        setErrorMsg("Please select a staff member, or click 'Unassign'.");
        return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const isCheckIn = patient.status === 'confirmed';
      
      const assignmentPayload = {
        assignedVetId: isUnassigning ? null : selectedVet.id,
        assignedVet: isUnassigning ? "Unassigned" : selectedVet.fullName
      };

      if (isCheckIn) {
        await runTransaction(db, async (transaction) => {
          const queueRef = doc(db, "queue", "daily_queue");
          const queueDoc = await transaction.get(queueRef);
          const newNumber = queueDoc.exists() ? (queueDoc.data().lastNumberIssued || 0) + 1 : 1;
          
          if (queueDoc.exists()) {
              transaction.update(queueRef, { lastNumberIssued: newNumber });
          } else {
              transaction.set(queueRef, { currentServing: 0, currentPrefix: '', lastNumberIssued: newNumber, status: 'active', lastResetDate: new Date().toISOString().split('T')[0] });
          }

          const appointmentRef = doc(db, "appointments", patient.id);
          transaction.update(appointmentRef, { 
              status: 'arrived', 
              queueNumber: newNumber, 
              ticketPrefix: patient.priority === 'high' ? 'E' : 'A', 
              timeArrived: Timestamp.now(), 
              ...assignmentPayload 
          });
        });
      } else {
        await updateDoc(doc(db, "appointments", patient.id), assignmentPayload);
      }
      onClose();
    } catch (error) {
      setErrorMsg("Error assigning staff: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!patient) return null;

  const isCheckIn = patient.status === 'confirmed';
  const targetCategory = patient.serviceCategory || 'Consultation';
  const deptObj = (departments ||[]).find(d => d.name === targetCategory);
  const badgeColor = deptObj ? deptObj.color : '#616161';

  const recommendedStaff = [];
  const otherStaff =[];

  (vetsList ||[]).forEach(v => {
    const hasSkill = v.departments && v.departments.includes(targetCategory);
    if (hasSkill) {
      recommendedStaff.push(v);
    } else {
      otherStaff.push(v);
    }
  });

  const StaffCard = ({ v }) => {
    const isSelected = selectedVet?.id === v.id;
    const load = getVetWorkload(v.id);
    const isOverloaded = load >= 3;

    return (
      <Paper 
        elevation={isSelected ? 4 : 0}
        onClick={() => setSelectedVet(v)}
        sx={{ 
            p: 2, mb: 1.5, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer',
            border: '2px solid',
            borderColor: isSelected ? '#2E7D32' : '#E0E0E0',
            bgcolor: isSelected ? '#F1F8E9' : 'white',
            borderRadius: 2,
            transition: 'all 0.2s ease',
            '&:hover': { borderColor: isSelected ? '#2E7D32' : '#BCAAA4', bgcolor: isSelected ? '#F1F8E9' : '#FAFAFA' }
        }}
      >
        <Avatar sx={{ bgcolor: isSelected ? '#2E7D32' : (isOverloaded ? '#D32F2F' : '#1565C0'), width: 44, height: 44, fontWeight: 'bold', fontSize: '1.2rem' }}>
            {v.fullName[0]}
        </Avatar>
        <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight="bold" color={isSelected ? '#2E7D32' : '#333'} sx={{ lineHeight: 1.2 }}>
                {v.fullName}
            </Typography>
            {/* The Scalable Skill Chips Component */}
            <SkillChips departments={v.departments} allDepts={departments} onClickMore={handleSkillsPopoverOpen} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
            {isSelected ? (
                <Chip icon={<CheckCircleIcon />} label="Selected" color="success" size="small" sx={{ fontWeight: 'bold' }} />
            ) : (
                <Chip icon={<LocalHospitalIcon fontSize="small"/>} label={`${load} Active`} color={isOverloaded ? "error" : load > 0 ? "warning" : "default"} size="small" variant={isOverloaded ? "filled" : "outlined"} sx={{ fontWeight: 'bold' }} />
            )}
        </Box>
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
      <DialogContent sx={{ p: 0, bgcolor: '#F5F5F5', height: 400 }}>
        <Box sx={{ p: 3 }}>
            <Typography variant="body2" sx={{ mb: 2, color: '#555', fontWeight: 'bold' }}>
              Select the appropriate personnel to handle this visit:
            </Typography>

            {/* RECOMMENDED STAFF */}
            {recommendedStaff.length > 0 && (
                <Box sx={{ mb: 3 }}>
                    <Typography variant="overline" color="#2E7D32" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                        <StarIcon fontSize="small" /> Best Match ({targetCategory})
                    </Typography>
                    {recommendedStaff.map(v => <StaffCard key={v.id} v={v} />)}
                </Box>
            )}

            {/* OTHER STAFF */}
            {otherStaff.length > 0 && (
                <Box sx={{ mb: 2 }}>
                    <Divider sx={{ mb: 2 }} />
                    <Typography variant="overline" color="textSecondary" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
                        Other Available Personnel
                    </Typography>
                    <Box sx={{ opacity: selectedVet ? 1 : 0.8 }}>
                        {otherStaff.map(v => <StaffCard key={v.id} v={v} />)}
                    </Box>
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