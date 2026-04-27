import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Box, Typography, Grid,
  InputBase, IconButton, CircularProgress, Alert,
} from '@mui/material';
import { Close as CloseIcon, Shield as ShieldIcon } from '@mui/icons-material';
import {
  doc, collection, query, where, getDocs, Timestamp, arrayUnion, writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { useUser } from '../context/UserContext';
import { makePulseEventId } from '../utils/pulseUtils';
import { FONT, TYPE, COLORS } from '../theme/designTokens';

const EMPTY_SOAP = { subjective: '', objective: '', assessment: '', plan: '' };
const EMPTY_VITALS = { weight: '', temp: '', hr: '', rr: '', crt: '', bcs: '', pain: '' };

const SOAP_FIELDS = [
  { key: 'subjective', label: 'S — SUBJECTIVE',  placeholder: 'Subjective amendment...' },
  { key: 'objective',  label: 'O — OBJECTIVE',   placeholder: 'Objective amendment...' },
  { key: 'assessment', label: 'A — ASSESSMENT',  placeholder: 'Assessment amendment...' },
  { key: 'plan',       label: 'P — PLAN',        placeholder: 'Plan amendment...' },
];

const VITALS_FIELDS = [
  { key: 'weight', label: 'Wt (kg)' },
  { key: 'temp',   label: 'Temp (°C)' },
  { key: 'hr',     label: 'HR (bpm)' },
  { key: 'rr',     label: 'RR (rpm)' },
  { key: 'crt',    label: 'CRT (s)' },
  { key: 'bcs',    label: 'BCS /9' },
  { key: 'pain',   label: 'Pain /4' },
];

const inputSx = { bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 0 } };

/**
 * Shared structured SOAP amendment dialog.
 * Encapsulates all form state, validation, and dual-write handler.
 * Consumers only manage open/onClose/onSuccess.
 *
 * @param {boolean}  open          - Controls dialog visibility.
 * @param {Function} onClose       - Called on cancel or backdrop click.
 * @param {string}   appointmentId - Appointment doc ID — used to query medical_records + write pulse event.
 * @param {Function} onSuccess     - Called after successful writeBatch commit.
 */
export default function AmendmentDialog({ open, onClose, appointmentId, onSuccess }) {
  const { profile } = useUser();

  const [reason, setReason] = useState('');
  const [soap, setSoap] = useState(EMPTY_SOAP);
  const [vitals, setVitals] = useState(EMPTY_VITALS);
  const [meds, setMeds] = useState([]);
  const [showVitals, setShowVitals] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset all form state whenever the dialog opens
  useEffect(() => {
    if (open) {
      setReason('');
      setSoap(EMPTY_SOAP);
      setVitals(EMPTY_VITALS);
      setMeds([]);
      setShowVitals(false);
      setError('');
    }
  }, [open]);

  const updateSoap = (field, val) => setSoap(prev => ({ ...prev, [field]: val }));
  const updateVitals = (field, val) => setVitals(prev => ({ ...prev, [field]: val }));

  const hasAnySoapContent = Object.values(soap).some(v => v.trim());
  const isValid = reason.trim() && hasAnySoapContent;

  const handleSubmit = async () => {
    if (!isValid || !appointmentId) return;
    setSubmitting(true);
    setError('');
    try {
      const q = query(
        collection(db, 'medical_records'),
        where('appointmentId', '==', appointmentId),
        where('legal.isLocked', '==', true),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setError('No sealed record found for this appointment.');
        return;
      }
      const recordRef = snap.docs[0].ref;

      // Build SOAP payload — only non-empty fields
      const soapPayload = {};
      if (soap.subjective.trim()) soapPayload.subjective = soap.subjective.trim();
      if (soap.objective.trim())  soapPayload.objective  = soap.objective.trim();
      if (soap.assessment.trim()) soapPayload.assessment = soap.assessment.trim();
      if (soap.plan.trim())       soapPayload.plan        = soap.plan.trim();

      // Include vitals only when at least one field has a value
      const hasVitals = Object.values(vitals).some(v => v !== '' && v != null);
      const vitalsPayload = hasVitals
        ? Object.fromEntries(Object.entries(vitals).filter(([, v]) => v !== '' && v != null))
        : null;

      // Include medications only when at least one named entry exists
      const medsPayload = meds.filter(m => m.name.trim());

      const staffId   = profile?.id || auth.currentUser?.uid || 'unknown';
      const staffName = profile?.fullName || auth.currentUser?.displayName || 'Clinician';

      const entry = {
        type: 'structured',
        reason: reason.trim(),
        soap: soapPayload,
        ...(vitalsPayload && { vitals: vitalsPayload }),
        ...(medsPayload.length > 0 && { addedMedications: medsPayload }),
        vetId:    staffId,
        vetName:  staffName,
        timestamp: Timestamp.now(),
      };

      const batch = writeBatch(db);
      batch.update(recordRef, { amendments: arrayUnion(entry) });
      batch.update(doc(db, 'appointments', appointmentId), {
        clinicalPulse: arrayUnion({
          eventId:   makePulseEventId('amend'),
          type:      'CLINICAL_AMENDMENT',
          timestamp: Timestamp.now(),
          staffId,
          staffName,
          note: `Structured amendment (${reason.trim().slice(0, 40)}): ${Object.keys(soapPayload).join(', ')} updated`,
        }),
      });
      await batch.commit();

      onSuccess();
    } catch (err) {
      console.error('[AmendmentDialog.handleSubmit]:', err.message);
      setError('Failed to save amendment: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 0 } }}
    >
      <DialogTitle sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        bgcolor: COLORS.warningSurface,
        borderBottom: `2px solid ${COLORS.warning}`,
        py: 1.5, px: 2.5,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <ShieldIcon sx={{ fontSize: 16, color: COLORS.warning }} />
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.warning }}>
            STRUCTURED AMENDMENT
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ borderRadius: 0, color: COLORS.textSecondary }}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ bgcolor: COLORS.formBg, px: 2.5, pt: 2 }}>
        <Stack spacing={2}>
          {error && (
            <Alert severity="error" sx={{ borderRadius: 0, fontFamily: FONT }}>
              {error}
            </Alert>
          )}

          {/* Reason — mandatory */}
          <Box>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.warning, mb: 0.5 }}>
              REASON (REQUIRED)
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="Reason for amendment (required)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              sx={inputSx}
            />
          </Box>

          {/* SOAP fields — at least one required */}
          <Box>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.warning, mb: 1 }}>
              SOAP AMENDMENT
            </Typography>
            <Stack spacing={1}>
              {SOAP_FIELDS.map(({ key, label, placeholder }) => (
                <Box key={key}>
                  <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.4 }}>
                    {label}
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    size="small"
                    placeholder={placeholder}
                    value={soap[key]}
                    onChange={(e) => updateSoap(key, e.target.value)}
                    sx={inputSx}
                  />
                </Box>
              ))}
            </Stack>
          </Box>

          {/* Optional vitals correction */}
          {!showVitals ? (
            <Button
              size="small"
              onClick={() => setShowVitals(true)}
              sx={{
                fontWeight: 700, color: COLORS.warning, borderRadius: 0,
                textTransform: 'none', p: 0, minWidth: 0, fontSize: '0.78rem',
                alignSelf: 'flex-start',
              }}
            >
              + Add Vitals Correction
            </Button>
          ) : (
            <Box>
              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.warning, mb: 0.75 }}>
                VITALS CORRECTION
              </Typography>
              <Grid container spacing={1}>
                {VITALS_FIELDS.map(({ key, label }) => (
                  <Grid key={key} size={{ xs: 4, sm: 3 }}>
                    <Typography sx={{
                      fontFamily: FONT, fontSize: '0.65rem', fontWeight: 700,
                      color: COLORS.textMuted, mb: 0.25,
                    }}>
                      {label}
                    </Typography>
                    <InputBase
                      value={vitals[key]}
                      onChange={(e) => updateVitals(key, e.target.value)}
                      inputProps={{ style: { fontSize: '0.85rem', padding: '4px 6px' } }}
                      sx={{
                        width: '100%',
                        bgcolor: 'white',
                        border: `1px solid ${COLORS.warning}`,
                        borderRadius: 0,
                        px: 0.5,
                      }}
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Optional medication rows */}
          <Box>
            <Button
              size="small"
              onClick={() => setMeds(prev => [...prev, { name: '', qty: '', instructions: '' }])}
              sx={{
                fontWeight: 700, color: COLORS.warning, borderRadius: 0,
                textTransform: 'none', p: 0, minWidth: 0, fontSize: '0.78rem',
              }}
            >
              + Add Medication
            </Button>

            {meds.length > 0 && (
              <Stack spacing={0.75} sx={{ mt: 1 }}>
                <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.warning }}>
                  ADDED MEDICATIONS
                </Typography>
                {meds.map((med, idx) => (
                  <Stack key={idx} direction="row" spacing={0.75} alignItems="center">
                    <TextField
                      size="small"
                      placeholder="Medication name..."
                      value={med.name}
                      onChange={(e) => setMeds(prev => prev.map((m, i) => i === idx ? { ...m, name: e.target.value } : m))}
                      sx={{ flex: 2, ...inputSx }}
                    />
                    <TextField
                      size="small"
                      placeholder="Qty"
                      value={med.qty}
                      onChange={(e) => setMeds(prev => prev.map((m, i) => i === idx ? { ...m, qty: e.target.value } : m))}
                      sx={{ flex: 0.5, ...inputSx }}
                    />
                    <TextField
                      size="small"
                      placeholder="Instructions..."
                      value={med.instructions}
                      onChange={(e) => setMeds(prev => prev.map((m, i) => i === idx ? { ...m, instructions: e.target.value } : m))}
                      sx={{ flex: 3, ...inputSx }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => setMeds(prev => prev.filter((_, i) => i !== idx))}
                      sx={{ color: COLORS.danger, borderRadius: 0, flexShrink: 0 }}
                    >
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5, bgcolor: COLORS.warningSurface, borderTop: `1px solid ${COLORS.borderLight}` }}>
        <Button
          onClick={onClose}
          sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0 }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : null}
          sx={{
            fontFamily: FONT,
            fontWeight: 900,
            borderRadius: 0,
            bgcolor: COLORS.warning,
            '&:hover': { bgcolor: '#BF360C' },
            '&.Mui-disabled': { bgcolor: COLORS.warningSurface, color: COLORS.textMuted },
          }}
        >
          Save Amendment
        </Button>
      </DialogActions>
    </Dialog>
  );
}
