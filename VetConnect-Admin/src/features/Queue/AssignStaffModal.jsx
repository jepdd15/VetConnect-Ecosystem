import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, MenuItem, Box, Typography, Paper,
  FormControl, InputLabel, Select, Chip, Avatar, Alert
} from '@mui/material';

import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';

import { doc, runTransaction, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function AssignStaffModal({ open, onClose, patient, vetsList, activeAppointments }) {
  const [selectedVet, setSelectedVet] = useState('');
  const[loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Automatically pre-fill the currently assigned vet when the modal opens
  useEffect(() => {
    if (open && patient) {
      setSelectedVet(patient.assignedVet && patient.assignedVet !== 'Unassigned' ? patient.assignedVet : '');
      setErrorMsg('');
    }
  }, [open, patient]);

  // Helper to calculate real-time workload
  const getVetWorkload = (vetName) => {
    return activeAppointments.filter(a => a.assignedVet === vetName).length;
  };

  const handleSubmit = async () => {
    if (!patient) return;
    setLoading(true);
    setErrorMsg('');

    try {
      const isCheckIn = patient.status === 'confirmed';

      if (isCheckIn) {
        // --- SCENARIO A: CHECK-IN (Generate Ticket) ---
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
              ticketPrefix: 'A', // 'A' for App-Booked
              timeArrived: Timestamp.now(), 
              assignedVet: selectedVet || "Unassigned" 
          });
        });
      } else {
        // --- SCENARIO B: RE-ASSIGNMENT (Just update Vet) ---
        await updateDoc(doc(db, "appointments", patient.id), { 
            assignedVet: selectedVet || "Unassigned" 
        });
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

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: isCheckIn ? '#2E7D32' : '#1565C0', color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
        <AssignmentIndIcon /> {isCheckIn ? "Check-In & Assign Staff" : "Re-assign Staff Member"}
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 3, bgcolor: '#FAFAFA' }}>
        
        {errorMsg ? <Alert severity="error" sx={{ mb: 3 }}>{errorMsg}</Alert> : null}

        {/* CLINICAL CONTEXT CARD */}
        <Paper variant="outlined" sx={{ p: 2, mb: 4, bgcolor: 'white', borderRadius: 2, borderLeft: `4px solid ${isCheckIn ? '#2E7D32' : '#1565C0'}` }}>
            <Typography variant="overline" color="textSecondary" fontWeight="bold">Patient Routing Details</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
                <Avatar sx={{ bgcolor: '#EFEBE9', color: '#5D4037', fontWeight: 'bold' }}>
                    {(patient.petSpecies === 'Canine' || patient.petSpecies === 'Dog') ? '🐶' : '🐱'}
                </Avatar>
                <Box>
                    <Typography variant="body1" fontWeight="bold" color="#3E2723">{patient.petName}</Typography>
                    <Typography variant="body2" color="textSecondary">Owner: {patient.ownerName}</Typography>
                </Box>
            </Box>
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed #E0E0E0', display: 'flex', gap: 1 }}>
                <Chip label={patient.serviceType} color="primary" size="small" sx={{ fontWeight: 'bold' }} />
                <Chip label={`Req: ${patient.requiredRole ? patient.requiredRole.toUpperCase() : 'VETERINARIAN'}`} variant="outlined" size="small" />
            </Box>
        </Paper>

        <Typography variant="body2" sx={{ mb: 2, color: '#555' }}>
          {isCheckIn ? "Select the initial staff member to handle this visit." : "Transfer this patient to a different staff member."}
        </Typography>

        <FormControl fullWidth size="medium" sx={{ bgcolor: 'white' }}>
          <InputLabel>Assign Staff</InputLabel>
          <Select value={selectedVet} label="Assign Staff" onChange={(e) => setSelectedVet(e.target.value)}>
            <MenuItem value="">
                <Typography fontStyle="italic" color="textSecondary">Leave Unassigned</Typography>
            </MenuItem>
            
            {vetsList.map((v) => { 
                const load = getVetWorkload(v.fullName || v.name); 
                const isOverloaded = load >= 3; 
                
                return (
                    <MenuItem key={v.id} value={v.fullName || v.name}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="body1" fontWeight="bold" color={isOverloaded ? '#aaa' : '#333'}>
                                    {v.fullName || v.name}
                                </Typography>
                                <Typography variant="caption" color="textSecondary">
                                    {v.specialty || 'General'} • {v.role ? v.role.toUpperCase() : 'STAFF'}
                                </Typography>
                            </Box>
                            
                            <Chip 
                                icon={<LocalHospitalIcon fontSize="small"/>}
                                label={`${load} Active`} 
                                color={isOverloaded ? "error" : load > 0 ? "warning" : "success"} 
                                size="small" 
                                variant={isOverloaded ? "filled" : "outlined"} 
                                sx={{ fontWeight: 'bold', height: 20, fontSize: '0.65rem' }} 
                            />
                        </Box>
                    </MenuItem>
                ); 
            })}
          </Select>
        </FormControl>

      </DialogContent>
      <DialogActions sx={{ p: 2, bgcolor: '#EFEBE9' }}>
        <Button onClick={onClose} sx={{ fontWeight: 'bold', color: '#5D4037' }}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={loading} variant="contained" color={isCheckIn ? 'success' : 'primary'} sx={{ fontWeight: 'bold', px: 3 }}>
          {loading ? "Processing..." : (isCheckIn ? "Check-In Patient" : "Update Assignment")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}