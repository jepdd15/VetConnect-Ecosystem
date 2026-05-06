import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Paper, Chip, Avatar, Alert,
  Divider, Stack
} from '@mui/material';

// Icons
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import { doc, runTransaction, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useUser } from '../../context/UserContext';
import { STATUS } from '../../utils/statusConstants';
import { makePulseEventId } from '../../utils/pulseUtils';
import { getTicketPrefix } from '../../utils/getTicketPrefix';
import { sendPushNotification } from '../../utils/sendPushNotification';

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

        const primedServices = (patient.services || []).map(s => ({ ...s, status: 'pending' }));
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

  const BRAND_BROWN = '#3E2723';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 0,
          border: `2px solid ${BRAND_BROWN}`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }
      }}
    >
      <DialogTitle sx={{
        background: `linear-gradient(135deg, ${BRAND_BROWN} 0%, #1A0D0A 100%)`,
        color: 'white',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 2,
      }}>
        <CheckCircleIcon />
        Check In Patient
      </DialogTitle>

      {/* Patient identity strip */}
      <Box sx={{
        p: 3,
        bgcolor: '#FFF8E1',
        borderBottom: '2px dashed #D7CCC8',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 3,
      }}>
        <Avatar sx={{
          bgcolor: 'white',
          color: BRAND_BROWN,
          border: `3px solid ${BRAND_BROWN}`,
          width: 64,
          height: 64,
          fontSize: 32,
        }}>
          {(patient.petSpecies === 'Canine' || patient.petSpecies === 'Dog') ? '🐶' : '🐱'}
        </Avatar>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" fontWeight="900" color={BRAND_BROWN} sx={{ lineHeight: 1.1 }}>
            {patient.petName || 'Unnamed Pet'}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: '800', color: BRAND_BROWN, display: 'block', mt: 0.5 }}>
            {patient.petSpecies} • {patient.petBreed || 'Mixed Breed'}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: '800', color: BRAND_BROWN, display: 'block' }}>
            Owner: {patient.ownerName || 'No Owner Registered'}
          </Typography>

          {(patient.clientNotes || patient.staffNotes || patient.notes) && (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                mt: 1,
                bgcolor: BRAND_BROWN,
                color: 'white',
                px: 1.5,
                py: 0.3,
                cursor: 'help',
              }}
              title={patient.clientNotes || patient.staffNotes || patient.notes}
            >
              <LocalHospitalIcon sx={{ fontSize: 12 }} />
              <Typography variant="caption" sx={{ fontWeight: '900', fontSize: '0.6rem', letterSpacing: 1, textTransform: 'uppercase' }}>
                view intake notes
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <DialogContent sx={{ p: 3, bgcolor: '#F5F5F5' }}>
        {errorMsg && (
          <Alert
            severity="error"
            sx={{ mb: 2, fontWeight: '900', border: '2px solid #D32F2F', borderRadius: 0 }}
            onClose={() => setErrorMsg('')}
          >
            {errorMsg}
          </Alert>
        )}

        <Typography sx={{ fontWeight: '700', color: BRAND_BROWN, mb: 2, fontSize: '0.9rem' }}>
          Issue queue ticket and mark as arrived?
        </Typography>

        {(patient.services || []).length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="overline" sx={{ fontWeight: '900', color: BRAND_BROWN, fontSize: '0.7rem', letterSpacing: 1 }}>
              Services
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 0.5 }}>
              {(patient.services || []).map((svc, i) => (
                <Chip
                  key={i}
                  label={svc.name}
                  size="small"
                  sx={{
                    fontWeight: '900',
                    fontSize: '0.7rem',
                    bgcolor: BRAND_BROWN,
                    color: 'white',
                    borderRadius: 0,
                  }}
                />
              ))}
            </Stack>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{
        p: 2,
        px: 3,
        bgcolor: '#EFEBE9',
        justifyContent: 'flex-end',
        borderTop: '1px solid #D7CCC8',
        gap: 1,
      }}>
        <Button
          onClick={onClose}
          size="small"
          sx={{ fontWeight: 'bold', color: BRAND_BROWN, px: 2 }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={loading}
          variant="contained"
          size="small"
          sx={{
            fontWeight: '1000',
            px: 4,
            py: 1,
            borderRadius: 0,
            bgcolor: BRAND_BROWN,
            '&:hover': { bgcolor: '#1A0D0A' },
            boxShadow: 4,
          }}
        >
          {loading ? 'Processing...' : 'CHECK IN & ISSUE TICKET'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
