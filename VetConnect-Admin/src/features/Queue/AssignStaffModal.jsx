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
import { STATUS, TERMINAL_STATUSES } from '../../utils/statusConstants';
import { makePulseEventId } from '../../utils/pulseUtils';
import { getTicketPrefix } from '../../utils/getTicketPrefix';
import { sendPushNotification } from '../../utils/sendPushNotification';

export default function AssignStaffModal({ open, onClose, patient, siblingAppointments = [] }) {
  const { profile, user } = useUser();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Toggle: true = check in ALL group members, false = individual only
  const [groupMode, setGroupMode] = useState(true);

  useEffect(() => {
    if (open) {
      setGroupMode(true);
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

        const isGroupCheckIn = groupMode && siblingAppointments.length > 0;

        // Collect sibling refs to read atomically
        const siblingRefs = isGroupCheckIn
          ? siblingAppointments.map(sib => doc(db, "appointments", sib.id))
          : [];

        // Read all docs in one round-trip
        const reads = await Promise.all([
          transaction.get(primaryRef),
          transaction.get(queueRef),
          ...siblingRefs.map(ref => transaction.get(ref)),
        ]);

        const [primaryDoc, queueDoc, ...siblingDocs] = reads;

        if (!primaryDoc.exists()) throw new Error("Appointment not found. It may have been deleted.");

        const freshPrimaryData = primaryDoc.data();
        const freshPrimaryStatus = freshPrimaryData.status;
        if (freshPrimaryStatus !== STATUS.CONFIRMED) {
          throw new Error(
            `CONCURRENT CONFLICT: This appointment's status is now '${freshPrimaryStatus}'. ` +
            `Another staff member may have already processed it.`
          );
        }

        // Validate sibling statuses — only check-in confirmed siblings
        for (let i = 0; i < siblingDocs.length; i++) {
          const sibDoc = siblingDocs[i];
          if (!sibDoc.exists()) continue;
          const sibStatus = sibDoc.data().status;
          if (sibStatus !== STATUS.CONFIRMED) {
            const sibName = siblingAppointments[i]?.petName || `Pet ${i + 2}`;
            throw new Error(
              `CONCURRENT CONFLICT: ${sibName} is already '${sibStatus}'. ` +
              `Check in the group individually or refresh the queue.`
            );
          }
        }

        // Increment queue counter ONCE — shared number for the entire visit group
        const sharedNumber = queueDoc.exists() ? (queueDoc.data().lastNumberIssued || 0) + 1 : 1;
        const arrivedAt     = Timestamp.now();
        const staffSignature = profile?.fullName || user?.email || 'System/Admin';

        // Write queue counter
        transaction.set(queueRef, { lastNumberIssued: sharedNumber }, { merge: true });

        // Write primary appointment
        const primaryPrimedServices = (patient.services || []).map(s => ({ ...s, status: 'pending' }));
        const primaryPulseEvent = {
          eventId:    makePulseEventId('assign'),
          type:       'STATUS_CHANGE',
          fromStatus: STATUS.CONFIRMED,
          toStatus:   STATUS.ARRIVED,
          timestamp:  arrivedAt,
          staffId:    user?.uid || 'unknown',
          staffName:  staffSignature,
          note:       isGroupCheckIn
            ? `Group check-in (1/${siblingAppointments.length + 1}). Shared queue: ${sharedNumber}.`
            : 'Patient physically arrived and checked-in.',
        };

        transaction.update(primaryRef, {
          status:        STATUS.ARRIVED,
          queueNumber:   sharedNumber,
          ticketPrefix:  getTicketPrefix(patient),
          timeArrived:   arrivedAt,
          services:      primaryPrimedServices,
          statusHistory: [...(freshPrimaryData.statusHistory || []), freshPrimaryStatus],
          clinicalPulse: arrayUnion(primaryPulseEvent),
        });

        if (patient.petId) {
          transaction.update(doc(db, "pets", patient.petId), { lastVisit: arrivedAt });
        }

        // Write sibling appointments (shared queue number)
        siblingDocs.forEach((sibDoc, i) => {
          if (!sibDoc.exists()) return;
          const sib = siblingAppointments[i];
          const freshSibData = sibDoc.data();
          const sibPrimedServices = (sib.services || []).map(s => ({ ...s, status: 'pending' }));
          const sibPulseEvent = {
            eventId:    makePulseEventId('assign'),
            type:       'STATUS_CHANGE',
            fromStatus: STATUS.CONFIRMED,
            toStatus:   STATUS.ARRIVED,
            timestamp:  arrivedAt,
            staffId:    user?.uid || 'unknown',
            staffName:  staffSignature,
            note:       `Group check-in (${i + 2}/${siblingAppointments.length + 1}). Shared queue: ${sharedNumber}.`,
          };

          transaction.update(siblingRefs[i], {
            status:        STATUS.ARRIVED,
            queueNumber:   sharedNumber,
            ticketPrefix:  getTicketPrefix(sib),
            timeArrived:   arrivedAt,
            services:      sibPrimedServices,
            statusHistory: [...(freshSibData.statusHistory || []), freshSibData.status],
            clinicalPulse: arrayUnion(sibPulseEvent),
          });

          if (sib.petId) {
            transaction.update(doc(db, "pets", sib.petId), { lastVisit: arrivedAt });
          }
        });
      });

      // T4.90: Push notification — arrived (check-in)
      sendPushNotification({
        ownerId: patient.ownerId,
        status: 'arrived',
        petName: patient.petName,
        appointmentId: patient.id,
        visitGroupId: patient.visitGroupId,
      });

      if (groupMode && siblingAppointments.length > 0) {
        siblingAppointments.forEach((sib) => {
          sendPushNotification({
            ownerId: sib.ownerId,
            status: 'arrived',
            petName: sib.petName,
            appointmentId: sib.id,
            visitGroupId: sib.visitGroupId,
          });
        });
      }

      onClose();
    } catch (e) {
      setErrorMsg("Failed to check in patient: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!patient) return null;

  const BRAND_BROWN = '#3E2723';
  const isGroupCheckIn = groupMode && siblingAppointments.length > 0;
  const totalPetsInGroup = siblingAppointments.length + 1;

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
      {/* Header */}
      <DialogTitle sx={{
        background: isGroupCheckIn
          ? `linear-gradient(135deg, #0D47A1 0%, #1565C0 100%)`
          : `linear-gradient(135deg, ${BRAND_BROWN} 0%, #1A0D0A 100%)`,
        color: 'white',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 2,
      }}>
        <CheckCircleIcon />
        {isGroupCheckIn
          ? `GROUP CHECK-IN — ${totalPetsInGroup} PETS`
          : 'Check In Patient'}
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
        {/* Error alert */}
        {errorMsg && (
          <Alert
            severity="error"
            sx={{ mb: 2, fontWeight: '900', border: '2px solid #D32F2F', borderRadius: 0 }}
            onClose={() => setErrorMsg('')}
          >
            {errorMsg}
          </Alert>
        )}

        {/* Group check-in mode banner */}
        {siblingAppointments.length > 0 && (
          <Box sx={{
            mb: 3,
            p: 2,
            bgcolor: groupMode ? '#E3F2FD' : '#FFF8E1',
            border: `2px solid ${groupMode ? '#1565C0' : '#FFB74D'}`,
            borderRadius: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
          }}>
            <Box>
              <Typography sx={{
                fontWeight: '900',
                fontSize: '0.85rem',
                color: groupMode ? '#1565C0' : '#E65100',
                letterSpacing: '0.05em',
              }}>
                {groupMode
                  ? `GROUP CHECK-IN — ALL ${totalPetsInGroup} PETS WILL SHARE ONE QUEUE NUMBER`
                  : 'INDIVIDUAL CHECK-IN — ONLY THIS PET WILL BE CHECKED IN'}
              </Typography>
              {groupMode && (
                <Typography sx={{ fontSize: '0.75rem', fontWeight: '700', color: '#5D4037', mt: 0.3 }}>
                  {siblingAppointments.map(s => s.petName).join(', ')} + {patient.petName}
                </Typography>
              )}
            </Box>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setGroupMode(m => !m)}
              sx={{
                fontWeight: '900',
                fontSize: '0.65rem',
                borderRadius: 0,
                borderColor: groupMode ? '#1565C0' : '#E65100',
                color: groupMode ? '#1565C0' : '#E65100',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {groupMode ? 'CHECK IN INDIVIDUALLY' : 'SWITCH TO GROUP CHECK-IN'}
            </Button>
          </Box>
        )}

        {/* Confirmation message */}
        <Typography sx={{ fontWeight: '700', color: BRAND_BROWN, mb: 2, fontSize: '0.9rem' }}>
          Issue queue ticket and mark as arrived?
        </Typography>

        {/* Primary patient services — read-only */}
        {(patient.services || []).length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="overline" sx={{ fontWeight: '900', color: BRAND_BROWN, fontSize: '0.7rem', letterSpacing: 1 }}>
              {isGroupCheckIn ? `${patient.petName} — Services` : 'Services'}
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

        {/* Sibling pet summaries (group mode) */}
        {isGroupCheckIn && siblingAppointments.map((sib, i) => (
          <Box key={sib.id} sx={{ mb: 2 }}>
            <Divider sx={{ mb: 1.5, borderColor: '#1565C0' }} />
            <Typography variant="overline" sx={{ fontWeight: '900', color: '#1565C0', fontSize: '0.7rem', letterSpacing: 1 }}>
              {sib.petName} — {(sib.services || []).length} service{(sib.services || []).length !== 1 ? 's' : ''}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 0.5 }}>
              {(sib.services || []).map((svc, si) => (
                <Chip
                  key={si}
                  label={svc.name}
                  size="small"
                  sx={{
                    fontWeight: '900',
                    fontSize: '0.7rem',
                    bgcolor: '#1565C0',
                    color: 'white',
                    borderRadius: 0,
                  }}
                />
              ))}
            </Stack>
          </Box>
        ))}
      </DialogContent>

      {/* Footer */}
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
            bgcolor: isGroupCheckIn ? '#1565C0' : BRAND_BROWN,
            '&:hover': { bgcolor: isGroupCheckIn ? '#0D47A1' : '#1A0D0A' },
            boxShadow: 4,
          }}
        >
          {loading
            ? 'Processing...'
            : isGroupCheckIn
              ? `CHECK IN ALL ${totalPetsInGroup} PETS`
              : 'CHECK IN & ISSUE TICKET'
          }
        </Button>
      </DialogActions>
    </Dialog>
  );
}
