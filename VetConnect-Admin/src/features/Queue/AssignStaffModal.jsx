import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Paper, Chip, Avatar, Alert,
  Divider, Stack, Grid
} from '@mui/material';

// Icons
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import { doc, runTransaction, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useUser } from '../../context/UserContext';
import { STATUS } from '../../utils/statusConstants';
import { makePulseEventId } from '../../utils/pulseUtils';
import { getTicketPrefix } from '../../utils/getTicketPrefix';
import { sendPushNotification } from '../../utils/sendPushNotification';
import { COLORS, TYPE } from '../../theme/designTokens';

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

export default function AssignStaffModal({ open, onClose, patient }) {
  const { profile, user } = useUser();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (open) {
      setErrorMsg('');
    }
  }, [open]);

  const handleSubmit = async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      await runTransaction(db, async (transaction) => {
        const queueRef   = doc(db, "queue", "daily_queue");
        const primaryRef = doc(db, "appointments", patient.id);

        const [primaryDoc, queueDoc] = await Promise.all([
          transaction.get(primaryRef),
          transaction.get(queueRef),
        ]);

        if (!primaryDoc.exists()) throw new Error("Appointment not found. It may have been deleted.");

        const freshPrimaryData = primaryDoc.data();
        const freshPrimaryStatus = freshPrimaryData.status;
        if (freshPrimaryStatus !== STATUS.CONFIRMED) {
          throw new Error(
            `CONCURRENT CONFLICT: This appointment's status is now '${freshPrimaryStatus}'. ` +
            `Another staff member may have already processed it.`
          );
        }

        const queueNumber = queueDoc.exists() ? (queueDoc.data().lastNumberIssued || 0) + 1 : 1;
        const arrivedAt   = Timestamp.now();
        const staffSignature = profile?.fullName || user?.email || 'System/Admin';

        transaction.set(queueRef, { lastNumberIssued: queueNumber }, { merge: true });

        const primedServices = (patient.services || []).map(svc => {
          // If already completed in a previous shift/event, preserve it.
          if (svc.serviceStatus === 'completed') return svc;
          // Otherwise, reset to pending for the new active session.
          return { ...svc, serviceStatus: 'pending' };
        });

        const pulseEvent = {
          eventId:    makePulseEventId('assign'),
          type:       'STATUS_CHANGE',
          fromStatus: STATUS.CONFIRMED,
          toStatus:   STATUS.ARRIVED,
          timestamp:  arrivedAt,
          staffId:    user?.uid || 'unknown',
          staffName:  staffSignature,
          note:       'Patient physically arrived and checked-in.',
        };

        transaction.update(primaryRef, {
          status:        STATUS.ARRIVED,
          queueNumber,
          ticketPrefix:  getTicketPrefix(patient),
          timeArrived:   arrivedAt,
          services:      primedServices,
          statusHistory: [...(freshPrimaryData.statusHistory || []), freshPrimaryStatus],
          clinicalPulse: arrayUnion(pulseEvent),
        });

        if (patient.petId) {
          transaction.update(doc(db, "pets", patient.petId), { lastVisit: arrivedAt });
        }
      });

      const staffSignatureForLog = profile?.fullName || user?.email || 'System/Admin';
      sendPushNotification({
        ownerId: patient.ownerId,
        status: 'arrived',
        petName: patient.petName,
        appointmentId: patient.id,
        sentBy: staffSignatureForLog,
      });

      onClose();
    } catch (e) {
      setErrorMsg("Failed to check in patient: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!patient) return null;


  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 0,
          border: '3px solid #000',
          boxShadow: '8px 8px 0px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }
      }}
    >
      <DialogTitle sx={{
        bgcolor: '#000',
        color: 'white',
        fontWeight: '900',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 2,
        borderRadius: 0,
        textTransform: 'uppercase',
        letterSpacing: 2,
        fontSize: '1rem'
      }}>
        <CheckCircleIcon />
        Check In Patient
      </DialogTitle>

      <DialogContent sx={{ p: 0, bgcolor: '#FAF9F7' }}>
        {errorMsg && (
          <Box sx={{ p: 2 }}>
            <Alert
              severity="error"
              sx={{ fontWeight: '900', border: '2px solid #D32F2F', borderRadius: 0 }}
              onClose={() => setErrorMsg('')}
            >
              {errorMsg}
            </Alert>
          </Box>
        )}

        {/* 🧬 FORENSIC IDENTITY GRID */}
        <Box sx={{ display: 'flex', borderBottom: '2px solid #000' }}>
            {/* COLUMN 1: PATIENT */}
            <Box sx={{ flex: 1, p: 2.5, borderRight: '2px solid #000', bgcolor: COLORS.cream }}>
                <Typography variant="overline" sx={{ ...TYPE.label, color: COLORS.brand, display: 'block', mb: 1.5, opacity: 0.6 }}>
                    [01] PATIENT
                </Typography>
                
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                    <Avatar sx={{ 
                        width: 80, height: 80, borderRadius: 0, border: '3px solid #000', bgcolor: 'white', fontSize: '2.5rem',
                        boxShadow: '4px 4px 0px rgba(0,0,0,0.1)'
                    }}>
                        {(patient.petSpecies === 'Canine' || patient.petSpecies === 'Dog') ? '🐶' : '🐱'}
                    </Avatar>
                    <Box>
                        <Typography variant="h4" sx={{ fontWeight: '1000', color: COLORS.brand, lineHeight: 1, mb: 0.5 }}>
                            {patient.petName}
                        </Typography>
                        <Typography sx={{ fontWeight: '900', fontSize: '0.85rem', color: COLORS.accent, textTransform: 'uppercase' }}>
                            {patient.petSpecies} • {patient.petBreed}
                        </Typography>
                    </Box>
                </Box>

                <Stack spacing={1}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ ...TYPE.tiny, opacity: 0.7 }}>AGE</Typography>
                        <Typography sx={{ fontWeight: '900', fontSize: '0.85rem' }}>{calculateAgeString(patient.petBirthdate, patient.isAgeExact)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ ...TYPE.tiny, opacity: 0.7 }}>WEIGHT</Typography>
                        <Typography sx={{ fontWeight: '900', fontSize: '0.85rem' }}>{patient.petWeight ? `${patient.petWeight} KG` : 'N/A'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ ...TYPE.tiny, opacity: 0.7 }}>SEX / STATUS</Typography>
                        <Typography sx={{ fontWeight: '900', fontSize: '0.85rem' }}>
                            {patient.petGender?.toUpperCase()} ({patient.petIsNeutered ? 'FIXED' : 'INTACT'})
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, p: 1, bgcolor: 'white', border: '1px solid #000' }}>
                        <Typography sx={{ ...TYPE.tiny, color: COLORS.danger }}>ALLERGIES</Typography>
                        <Typography sx={{ fontWeight: '1000', fontSize: '0.75rem', color: COLORS.danger }}>
                            {patient.petAllergies || patient.allergies || 'NONE DISCLOSED'}
                        </Typography>
                    </Box>
                </Stack>
            </Box>

            {/* COLUMN 2: PET OWNER */}
            <Box sx={{ flex: 1, p: 2.5, bgcolor: '#FFF' }}>
                <Typography variant="overline" sx={{ ...TYPE.label, color: COLORS.brand, display: 'block', mb: 1.5, opacity: 0.6 }}>
                    [02] PET OWNER
                </Typography>

                <Typography variant="h5" sx={{ fontWeight: '1000', color: COLORS.brand, mb: 1 }}>
                    {patient.ownerName}
                </Typography>
                
                <Stack spacing={1.5}>
                    <Box>
                        <Typography sx={{ ...TYPE.tiny, opacity: 0.7 }}>PRIMARY CONTACT</Typography>
                        <Typography sx={{ fontWeight: '900', fontSize: '0.9rem', color: COLORS.medical }}>{patient.ownerPhone || 'NO PHONE'}</Typography>
                    </Box>
                    <Box>
                        <Typography sx={{ ...TYPE.tiny, opacity: 0.7 }}>ADDRESS</Typography>
                        <Typography sx={{ fontWeight: '800', fontSize: '0.75rem' }}>
                            {patient.ownerAddress || 'NO ADDRESS RECORDED'}
                        </Typography>
                    </Box>

                    {patient.emergencyContacts && patient.emergencyContacts.length > 0 && (
                        <Box sx={{ mt: 1, p: 1, border: '1px dashed #000', bgcolor: '#FAFAFA' }}>
                            <Typography sx={{ ...TYPE.tiny, mb: 0.5 }}>🚨 EMERGENCY CONTACT</Typography>
                            {patient.emergencyContacts.map((c, i) => (
                                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography sx={{ fontWeight: '900', fontSize: '0.7rem' }}>{c.name}</Typography>
                                    <Typography sx={{ fontWeight: '900', fontSize: '0.7rem', color: COLORS.medical }}>{c.phone}</Typography>
                                </Box>
                            ))}
                        </Box>
                    )}
                </Stack>
            </Box>
        </Box>

        {/* 🧬 REASON FOR VISIT / NOTES */}
        <Box sx={{ p: 2.5, borderBottom: '2px solid #000' }}>
            <Typography variant="overline" sx={{ ...TYPE.label, color: COLORS.brand, display: 'block', mb: 1 }}>
                REASON FOR VISIT / INTAKE NOTES
            </Typography>
            <Box sx={{ p: 1.5, border: '2px solid #000', bgcolor: 'white', minHeight: 60 }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: '500', fontStyle: (patient.clientNotes || patient.staffNotes || patient.notes) ? 'normal' : 'italic', color: (patient.clientNotes || patient.staffNotes || patient.notes) ? '#000' : '#9E9E9E' }}>
                    {patient.clientNotes || patient.staffNotes || patient.notes || "No specific intake notes provided for this visit."}
                </Typography>
            </Box>
        </Box>

        {/* 🧬 SERVICES & PROGRESS */}
        <Box sx={{ p: 2.5 }}>
            <Typography variant="overline" sx={{ ...TYPE.label, color: COLORS.brand, display: 'block', mb: 1.5 }}>
                SERVICES & PROGRESS
            </Typography>

            <Grid container spacing={2}>
                {/* DONE */}
                <Grid item xs={6}>
                    <Typography sx={{ ...TYPE.tiny, mb: 1, color: COLORS.success }}>[ DONE ]</Typography>
                    <Stack spacing={0.5}>
                        {patient.services?.filter(s => s.serviceStatus === 'completed').length > 0 ? (
                            patient.services.filter(s => s.serviceStatus === 'completed').map((svc, i) => (
                                <Box key={i} sx={{ p: 1, border: '1px solid #000', bgcolor: '#E8F5E9', display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <CheckCircleIcon sx={{ fontSize: 14, color: COLORS.success }} />
                                    <Typography sx={{ fontWeight: '900', fontSize: '0.7rem' }}>{svc.name}</Typography>
                                </Box>
                            ))
                        ) : (
                            <Typography sx={{ fontSize: '0.65rem', fontStyle: 'italic', opacity: 0.5 }}>None</Typography>
                        )}
                    </Stack>
                </Grid>

                {/* ACTIVE / PENDING */}
                <Grid item xs={6}>
                    <Typography sx={{ ...TYPE.tiny, mb: 1, color: COLORS.warning }}>[ ACTIVE / PENDING ]</Typography>
                    <Stack spacing={0.5}>
                        {patient.services?.filter(s => s.serviceStatus !== 'completed').length > 0 ? (
                            patient.services.filter(s => s.serviceStatus !== 'completed').map((svc, i) => (
                                <Box key={i} sx={{ p: 1, border: '1px solid #000', bgcolor: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box sx={{ width: 8, height: 8, bgcolor: COLORS.warning }} />
                                    <Typography sx={{ fontWeight: '900', fontSize: '0.7rem' }}>{svc.name}</Typography>
                                    <Typography variant="caption" sx={{ ml: 'auto', fontSize: '0.6rem', fontWeight: 800, opacity: 0.5 }}>
                                        {svc.serviceStatus?.toUpperCase() || 'PENDING'}
                                    </Typography>
                                </Box>
                            ))
                        ) : (
                            <Typography sx={{ fontSize: '0.65rem', fontStyle: 'italic', opacity: 0.5 }}>No pending services</Typography>
                        )}
                    </Stack>
                </Grid>
            </Grid>
        </Box>


      </DialogContent>

      <DialogActions sx={{
        p: 2,
        px: 3,
        bgcolor: '#EFEBE9',
        justifyContent: 'space-between',
        borderTop: '3px solid #000',
      }}>
        <Button
          onClick={onClose}
          sx={{ fontWeight: '1000', color: '#000', border: '2px solid #000', borderRadius: 0, px: 3, bgcolor: 'white', '&:hover': { bgcolor: '#F5F5F5' } }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={loading}
          variant="contained"
          sx={{
            fontWeight: '1000',
            px: 6,
            py: 1.5,
            borderRadius: 0,
            bgcolor: COLORS.brand,
            border: '2px solid #000',
            boxShadow: '4px 4px 0px rgba(0,0,0,1)',
            '&:hover': { bgcolor: '#1A0D0A', boxShadow: '2px 2px 0px rgba(0,0,0,1)', transform: 'translate(2px, 2px)' },
            transition: 'all 0.1s',
            color: 'white'
          }}
        >
          {loading ? 'Processing...' : 'CHECK IN & ISSUE TICKET'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
