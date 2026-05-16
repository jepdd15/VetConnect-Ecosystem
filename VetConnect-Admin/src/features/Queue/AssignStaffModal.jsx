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
          boxShadow: '12px 12px 0px #000',
          overflow: 'hidden',
          bgcolor: COLORS.cardBg,
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

      <DialogContent sx={{ p: 0, bgcolor: COLORS.cardBg, position: 'relative' }}>
        {/* Notebook Margin Line */}
        <Box sx={{ 
          position: 'absolute', left: 24, top: 0, bottom: 0, 
          borderLeft: '2px solid #E57373', zIndex: 0, opacity: 0.6 
        }} />
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

        <Box sx={{ display: 'flex', borderBottom: '3px solid #000', position: 'relative', zIndex: 1 }}>
            {/* COLUMN 1: PATIENT */}
            <Box sx={{ flex: 1, p: 3, pl: 6, borderRight: '3px solid #000' }}>
                <Typography variant="overline" sx={{ ...TYPE.label, color: COLORS.brand, fontWeight: 1000, display: 'block', mb: 1.5 }}>
                    [01] PATIENT IDENTIFICATION
                </Typography>
                
                <Box sx={{ display: 'flex', gap: 2.5, mb: 2.5 }}>
                    <Avatar sx={{ 
                        width: 90, height: 90, borderRadius: 0, border: '3px solid #000', bgcolor: 'white', fontSize: '3rem',
                        boxShadow: '5px 5px 0px #000',
                        transform: 'rotate(-2deg)',
                        transition: 'transform 0.2s',
                        '&:hover': { transform: 'rotate(0deg)' }
                    }}>
                        {(patient.petSpecies === 'Canine' || patient.petSpecies === 'Dog') ? '🐶' : '🐱'}
                    </Avatar>
                    <Box>
                        <Typography variant="h3" sx={{ fontWeight: 1000, color: COLORS.brand, lineHeight: 1, mb: 0.5, letterSpacing: '-0.02em' }}>
                            {patient.petName}
                        </Typography>
                        <Typography sx={{ fontWeight: 1000, fontSize: '0.85rem', color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                        <Typography sx={{ 
                            fontWeight: 1000, 
                            fontSize: '0.85rem',
                            color: patient.petGender === 'Male' ? '#1976D2' : patient.petGender === 'Female' ? '#E91E63' : 'inherit'
                        }}>
                            {patient.petGender?.toUpperCase()} ({patient.petIsNeutered ? 'FIXED' : 'INTACT'})
                        </Typography>
                    </Box>
                    <Box sx={{ 
                        display: 'flex', justifyContent: 'space-between', mt: 2, p: 1.5, 
                        bgcolor: COLORS.danger, border: '3px solid #000',
                        boxShadow: '3px 3px 0px #000',
                        color: COLORS.cream
                    }}>
                        <Typography sx={{ ...TYPE.tiny, fontWeight: 1000, color: 'inherit' }}>ALLERGY WARNING</Typography>
                        <Typography sx={{ fontWeight: 1000, fontSize: '0.8rem', color: 'inherit', textTransform: 'uppercase' }}>
                            {patient.petAllergies || patient.allergies || 'NONE DISCLOSED'}
                        </Typography>
                    </Box>
                </Stack>
            </Box>

            {/* COLUMN 2: PET OWNER */}
            <Box sx={{ flex: 1, p: 3, bgcolor: '#FFF' }}>
                <Typography variant="overline" sx={{ ...TYPE.label, color: COLORS.brand, fontWeight: 1000, display: 'block', mb: 1.5 }}>
                    [02] PET OWNER
                </Typography>

                <Typography variant="h4" sx={{ fontWeight: 1000, color: COLORS.brand, mb: 1.5 }}>
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

                    <Box>
                        <Typography sx={{ ...TYPE.tiny, opacity: 0.7, fontWeight: 1000 }}>EMERGENCY CONTACT</Typography>
                        {(patient.emergencyContacts && patient.emergencyContacts.length > 0) ? (
                            patient.emergencyContacts.map((c, i) => (
                                <Box key={i} sx={{ mb: i === patient.emergencyContacts.length - 1 ? 0 : 0.5 }}>
                                    <Typography sx={{ fontWeight: 1000, fontSize: '0.9rem', color: COLORS.medical }}>
                                        {c.phone} <span style={{ color: '#000', fontSize: '0.7rem', opacity: 0.6 }}>— {c.name} {c.relation ? `(${c.relation})` : ''}</span>
                                    </Typography>
                                </Box>
                            ))
                        ) : (patient.emergencyName || patient.emergencyPhone) ? (
                            <Typography sx={{ fontWeight: 1000, fontSize: '0.9rem', color: COLORS.medical }}>
                                {patient.emergencyPhone || 'NO PHONE'} <span style={{ color: '#000', fontSize: '0.7rem', opacity: 0.6 }}>— {patient.emergencyName || 'UNNAMED'}</span>
                            </Typography>
                        ) : (
                            <Typography sx={{ fontWeight: 1000, fontSize: '0.8rem', color: '#9E9E9E' }}>
                                NONE RECORDED
                            </Typography>
                        )}
                    </Box>
                </Stack>
            </Box>
        </Box>

        {/* 🧬 REASON FOR VISIT / NOTES */}
        <Box sx={{ p: 3, pl: 6, borderBottom: '3px solid #000', position: 'relative', zIndex: 1 }}>
            <Typography variant="overline" sx={{ ...TYPE.label, color: COLORS.brand, fontWeight: 1000, display: 'block', mb: 1.5 }}>
                [03] REASON FOR VISIT / CONTEXT NOTES
            </Typography>
            <Box sx={{ 
                p: 2, 
                border: '3px solid #000', 
                bgcolor: 'white', 
                minHeight: 120, 
                boxShadow: '4px 4px 0px rgba(0,0,0,0.1)',
                // 🧬 LEGAL PAD RULED LINES
                backgroundImage: `repeating-linear-gradient(white, white 27px, #90caf9 27px, #90caf9 28px)`,
                backgroundSize: '100% 28px',
                lineHeight: '28px',
                paddingTop: '4px',
            }}>
                <Typography sx={{ 
                    fontSize: '0.95rem', 
                    fontWeight: 800, 
                    fontStyle: (patient.clientNotes || patient.staffNotes || patient.notes) ? 'normal' : 'italic', 
                    color: (patient.clientNotes || patient.staffNotes || patient.notes) ? '#000' : '#9E9E9E',
                    fontFamily: '"Courier New", Courier, monospace', // Typewriter feel
                }}>
                    {patient.clientNotes || patient.staffNotes || patient.notes || "NO CLINICAL NOTES RECORDED FOR THIS ENCOUNTER."}
                </Typography>
            </Box>
        </Box>

        {/* 🧬 SERVICES & PROGRESS */}
        <Box sx={{ p: 3, pl: 6, position: 'relative', zIndex: 1 }}>
            <Typography variant="overline" sx={{ ...TYPE.label, color: COLORS.brand, fontWeight: 1000, display: 'block', mb: 2 }}>
                [04] SERVICE MANIFEST & PROGRESS
            </Typography>

            <Grid container spacing={3}>
                {/* DONE */}
                <Grid item xs={6}>
                    <Typography sx={{ ...TYPE.tiny, mb: 1.5, color: COLORS.success, fontWeight: 1000 }}>[ VERIFIED DONE ]</Typography>
                    <Stack spacing={1}>
                        {patient.services?.filter(s => s.serviceStatus === 'completed').length > 0 ? (
                            patient.services.filter(s => s.serviceStatus === 'completed').map((svc, i) => (
                                <Box key={i} sx={{ 
                                    p: 1.5, border: '2px dashed #000', bgcolor: '#E8F5E9', 
                                    display: 'flex', alignItems: 'center', gap: 1.5,
                                    boxShadow: '2px 2px 0px #000'
                                }}>
                                    <CheckCircleIcon sx={{ fontSize: 16, color: COLORS.success }} />
                                    <Typography sx={{ fontWeight: 1000, fontSize: '0.75rem', textTransform: 'uppercase' }}>{svc.name}</Typography>
                                </Box>
                            ))
                        ) : (
                            <Typography sx={{ fontSize: '0.7rem', fontStyle: 'italic', opacity: 0.5, fontWeight: 700 }}>NO COMPLETED ENTRIES</Typography>
                        )}
                    </Stack>
                </Grid>

                {/* ACTIVE / PENDING */}
                <Grid item xs={6}>
                    <Typography sx={{ ...TYPE.tiny, mb: 1.5, color: COLORS.warning, fontWeight: 1000 }}>[ ACTIVE ENCOUNTER ]</Typography>
                    <Stack spacing={1}>
                        {patient.services?.filter(s => s.serviceStatus !== 'completed').length > 0 ? (
                            patient.services.filter(s => s.serviceStatus !== 'completed').map((svc, i) => (
                                <Box key={i} sx={{ 
                                    p: 1.5, border: '2px solid #000', bgcolor: 'white', 
                                    display: 'flex', alignItems: 'center', gap: 1.5,
                                    boxShadow: '3px 3px 0px #000'
                                }}>
                                    <Box sx={{ width: 10, height: 10, bgcolor: COLORS.warning, border: '1px solid #000' }} />
                                    <Typography sx={{ fontWeight: 1000, fontSize: '0.75rem', textTransform: 'uppercase' }}>{svc.name}</Typography>
                                    <Typography variant="caption" sx={{ ml: 'auto', fontSize: '0.65rem', fontWeight: 1000, color: COLORS.brand }}>
                                        {svc.serviceStatus?.toUpperCase() || 'PENDING'}
                                    </Typography>
                                </Box>
                            ))
                        ) : (
                            <Typography sx={{ fontSize: '0.7rem', fontStyle: 'italic', opacity: 0.5, fontWeight: 700 }}>NO ACTIVE SERVICES</Typography>
                        )}
                    </Stack>
                </Grid>
            </Grid>
        </Box>


      </DialogContent>

      <DialogActions sx={{
        p: 3,
        bgcolor: COLORS.cardBg,
        justifyContent: 'space-between',
        borderTop: '3px solid #000',
        zIndex: 1,
      }}>
        <Button
          onClick={onClose}
          sx={{ 
            fontWeight: 1000, 
            color: '#000', 
            border: '3px solid #000', 
            borderRadius: 0, 
            px: 4, 
            bgcolor: 'white', 
            boxShadow: '3px 3px 0px #000',
            '&:hover': { bgcolor: '#F5F5F5' },
            '&:active': { transform: 'translate(2px, 2px)', boxShadow: 'none' }
          }}
        >
          Abort
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={loading}
          variant="contained"
          sx={{
            fontWeight: 1000,
            px: 6,
            py: 1.5,
            borderRadius: 0,
            bgcolor: COLORS.brand,
            border: '3px solid #000',
            boxShadow: '8px 8px 0px #000',
            '&:hover': { bgcolor: COLORS.accent, boxShadow: '4px 4px 0px #000', transform: 'translate(4px, 4px)' },
            '&:active': { transform: 'translate(8px, 8px)', boxShadow: 'none' },
            transition: 'all 0.1s',
            color: 'white',
            letterSpacing: '0.1em'
          }}
        >
          {loading ? 'SEALING RECORD...' : 'CHECK IN & ISSUE TICKET'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
