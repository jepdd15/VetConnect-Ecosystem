import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, TextField, RadioGroup,
  FormControlLabel, Radio, Divider, CircularProgress,
  Snackbar, Alert,
} from '@mui/material';
import {
  collection, doc, writeBatch, Timestamp,
} from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import { CONSENT_TYPES, CONSENT_ACTIONS, SIGNATURE_TYPES } from '../../../utils/consentConstants';

// ---------------------------------------------------------------------------
// Canvas Signature Pad
// ---------------------------------------------------------------------------

/**
 * HTML5 canvas-based signature pad for admin-side use.
 * Returns a base64 PNG via the `onCapture` callback whenever the user
 * lifts the pointer after drawing.
 */
function SignaturePad({ onCapture, onClear: notifyClear }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);

  const getCanvasPoint = (canvas, event) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDraw = useCallback((event) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    lastPointRef.current = getCanvasPoint(canvas, event);
  }, []);

  const draw = useCallback((event) => {
    event.preventDefault();
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const point = getCanvasPoint(canvas, event);

    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.strokeStyle = COLORS.brand;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    lastPointRef.current = point;
  }, []);

  const endDraw = useCallback((event) => {
    event.preventDefault();
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onCapture(canvas.toDataURL('image/png'));
  }, [onCapture]);

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    notifyClear();
  };

  // Paint a white background so the exported PNG is not transparent
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = COLORS.cardBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  return (
    <Box>
      <Box
        sx={{
          border: `2px dashed ${COLORS.border}`,
          borderRadius: 0,
          overflow: 'hidden',
          cursor: 'crosshair',
          bgcolor: COLORS.cardBg,
        }}
      >
        <canvas
          ref={canvasRef}
          width={480}
          height={160}
          style={{ display: 'block', width: '100%', height: 160 }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </Box>
      <Button
        size="small"
        onClick={handleClear}
        sx={{
          mt: 0.75,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: '0.72rem',
          textTransform: 'none',
          color: COLORS.danger,
        }}
      >
        Clear Signature
      </Button>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// ConsentRecordDialog
// ---------------------------------------------------------------------------

/**
 * Admin dialog that records consent on behalf of a walk-in client.
 *
 * Supports two capture modes:
 *   - "paper" — admin notes where the paper form is filed
 *   - "digital" — freehand canvas signature drawn at the counter
 *
 * On submit, atomically writes a consent_records sub-collection entry
 * AND updates the user doc (consentVersion / waiverVersion + legacy booleans).
 *
 * Props:
 *   open            {boolean}
 *   onClose         {function}
 *   clientId        {string}  — Firestore user UID
 *   clientName      {string}
 *   consentType     {string}  — CONSENT_TYPES.DPA or CONSENT_TYPES.WAIVER
 *   activeVersion   {number}  — e.g. 1, 2, 3
 *   activeVersionDocId {string} — Firestore doc ID in consent_versions
 *   onSuccess       {function} — called after a successful commit
 */
export default function ConsentRecordDialog({
  open,
  onClose,
  clientId,
  clientName,
  consentType,
  activeVersion,
  activeVersionDocId,
  onSuccess,
}) {
  const [signatureMode, setSignatureMode] = useState('paper'); // 'paper' | 'digital'
  const [adminNote, setAdminNote] = useState('');
  const [drawnSignature, setDrawnSignature] = useState(null); // base64 PNG
  const [submitting, setSubmitting] = useState(false);
  const [successSnack, setSuccessSnack] = useState(false);
  const [errorSnack, setErrorSnack] = useState('');

  // Derive display label from the consent type constant
  const typeLabel = consentType === CONSENT_TYPES.DPA ? 'DPA (RA 10173)' : 'Liability Waiver';
  const typeVersionField = consentType === CONSENT_TYPES.DPA ? 'consentVersion' : 'waiverVersion';
  const typeGrantedAtField = consentType === CONSENT_TYPES.DPA ? 'consentGrantedAt' : 'waiverGrantedAt';
  const typeLegacyBoolField = consentType === CONSENT_TYPES.DPA ? 'dpaConsent' : 'waiverSigned';

  const isReadyToSubmit = signatureMode === 'paper'
    ? adminNote.trim().length > 0
    : drawnSignature !== null;

  const resetState = () => {
    setSignatureMode('paper');
    setAdminNote('');
    setDrawnSignature(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSubmit = async () => {
    if (!isReadyToSubmit || !clientId) return;
    setSubmitting(true);

    try {
      const now = Timestamp.now();
      const batch = writeBatch(db);

      // 1. Write the consent_records sub-collection entry
      const recordRef = doc(collection(db, 'users', clientId, 'consent_records'));
      batch.set(recordRef, {
        consentType,
        versionNumber: activeVersion,
        versionDocId: activeVersionDocId || null,
        action: CONSENT_ACTIONS.GRANTED,
        signatureType: signatureMode === 'paper' ? SIGNATURE_TYPES.CHECKBOX : SIGNATURE_TYPES.DRAWN,
        signatureData: signatureMode === 'paper' ? null : drawnSignature,
        grantedAt: now,
        grantedVia: 'admin_portal',
        deviceInfo: 'admin',
        adminNote: signatureMode === 'paper' ? adminNote.trim() : null,
        ipAddress: null,
      });

      // 2. Update the user document — new versioned fields + legacy boolean
      const userRef = doc(db, 'users', clientId);
      batch.update(userRef, {
        [typeVersionField]: activeVersion,
        [typeGrantedAtField]: now,
        [typeLegacyBoolField]: true,
      });

      await batch.commit();

      setSuccessSnack(true);
      resetState();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('[ConsentRecordDialog.handleSubmit]:', err.message);
      setErrorSnack('Failed to record consent: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0 } }}
      >
        {/* ── Header ── */}
        <DialogTitle
          sx={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: '1rem',
            color: COLORS.brand,
            bgcolor: COLORS.cream,
            borderBottom: `2px solid ${COLORS.border}`,
            pb: 1.5,
          }}
        >
          Record Consent for {clientName}
        </DialogTitle>

        <DialogContent sx={{ pt: 2.5, px: 3 }}>
          {/* ── Active Policy Summary ── */}
          <Box
            sx={{
              bgcolor: COLORS.warningSurface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 0,
              px: 2,
              py: 1.25,
              mb: 2.5,
            }}
          >
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent }}>
              Active Policy
            </Typography>
            <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary, mt: 0.25 }}>
              {typeLabel} — Version {activeVersion ?? '—'}
            </Typography>
            <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textMuted, mt: 0.25, fontStyle: 'italic' }}>
              You are recording this consent on behalf of the client as the clinic&apos;s authorised representative.
            </Typography>
          </Box>

          {/* ── Signature Mode Selector ── */}
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textSecondary, mb: 1 }}>
            How was consent captured?
          </Typography>
          <RadioGroup
            value={signatureMode}
            onChange={(e) => {
              setSignatureMode(e.target.value);
              setAdminNote('');
              setDrawnSignature(null);
            }}
          >
            <FormControlLabel
              value="paper"
              control={<Radio size="small" sx={{ color: COLORS.accentLight, '&.Mui-checked': { color: COLORS.accent } }} />}
              label={
                <Typography sx={{ fontFamily: FONT, fontSize: '0.875rem', fontWeight: 600, color: COLORS.textPrimary }}>
                  Client signed a physical paper form
                </Typography>
              }
            />
            <FormControlLabel
              value="digital"
              control={<Radio size="small" sx={{ color: COLORS.accentLight, '&.Mui-checked': { color: COLORS.accent } }} />}
              label={
                <Typography sx={{ fontFamily: FONT, fontSize: '0.875rem', fontWeight: 600, color: COLORS.textPrimary }}>
                  Client signed digitally at the counter
                </Typography>
              }
            />
          </RadioGroup>

          <Divider sx={{ my: 2, borderColor: COLORS.borderLight }} />

          {/* ── Mode-specific Input ── */}
          {signatureMode === 'paper' ? (
            <Box>
              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textSecondary, mb: 1 }}>
                File Reference / Admin Note
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={3}
                size="small"
                placeholder='e.g. "Paper form signed 26 Apr 2026 — filed in Client Folder A-12"'
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    fontFamily: FONT,
                    fontSize: '0.875rem',
                    borderRadius: 0,
                    bgcolor: COLORS.formBg,
                  },
                }}
              />
            </Box>
          ) : (
            <Box>
              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textSecondary, mb: 1 }}>
                Capture Signature Below
              </Typography>
              <SignaturePad
                onCapture={(base64) => setDrawnSignature(base64)}
                onClear={() => setDrawnSignature(null)}
              />
              {drawnSignature && (
                <Typography sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.success, mt: 0.75 }}>
                  Signature captured — ready to submit.
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>

        {/* ── Actions ── */}
        <DialogActions
          sx={{
            px: 3,
            pb: 2.5,
            pt: 1,
            borderTop: `1px solid ${COLORS.borderLight}`,
            gap: 1,
          }}
        >
          <Button
            onClick={handleClose}
            disabled={submitting}
            sx={{
              fontFamily: FONT,
              fontWeight: 700,
              color: COLORS.textSecondary,
              textTransform: 'none',
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!isReadyToSubmit || submitting}
            sx={{
              fontFamily: FONT,
              fontWeight: 900,
              textTransform: 'none',
              bgcolor: COLORS.success,
              borderRadius: 0,
              px: 2.5,
              boxShadow: 'none',
              '&:hover': { bgcolor: COLORS.successDark || COLORS.success, boxShadow: 'none' },
              '&.Mui-disabled': { bgcolor: COLORS.borderLight },
            }}
          >
            {submitting ? (
              <CircularProgress size={16} sx={{ color: COLORS.cardBg }} />
            ) : (
              `Record Consent for ${clientName}`
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Success Snackbar ── */}
      <Snackbar
        open={successSnack}
        autoHideDuration={4000}
        onClose={() => setSuccessSnack(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSuccessSnack(false)}
          severity="success"
          variant="filled"
          sx={{ fontFamily: FONT, width: '100%', borderRadius: 0 }}
        >
          Consent recorded successfully for {clientName}.
        </Alert>
      </Snackbar>

      {/* ── Error Snackbar ── */}
      <Snackbar
        open={!!errorSnack}
        autoHideDuration={6000}
        onClose={() => setErrorSnack('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setErrorSnack('')}
          severity="error"
          variant="filled"
          sx={{ fontFamily: FONT, width: '100%', borderRadius: 0 }}
        >
          {errorSnack}
        </Alert>
      </Snackbar>
    </>
  );
}
