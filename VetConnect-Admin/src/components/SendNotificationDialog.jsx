import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Box, Typography, Snackbar, Alert,
  CircularProgress,
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import SendIcon from '@mui/icons-material/Send';
import { FONT, TYPE, COLORS } from '../theme/designTokens';
import { resolvePushToken, getWorkerUrl } from '../utils/sendPushNotification';

/**
 * T4.92 — Reusable dialog for sending free-text push notifications to a client.
 *
 * Resolves the client's Expo push token and the Cloudflare Worker URL from
 * Firestore, then POSTs to /push/custom. All success/error feedback is handled
 * internally via Snackbar — callers receive a clean `onSent` callback for any
 * context-specific audit logging they need to perform.
 *
 * Deliberately NOT fire-and-forget: the send is awaited so the admin can see
 * whether the delivery attempt succeeded before the dialog closes.
 *
 * @param {boolean}  open           - Dialog visibility state (controlled by parent).
 * @param {function} onClose        - Called when the dialog should close.
 * @param {string}   recipientName  - Display name shown in the dialog header.
 * @param {string}   ownerId        - Firestore user ID used to resolve expoPushToken.
 * @param {string}   [petName]      - Optional pet name to pre-populate body placeholder.
 * @param {function} [onSent]       - Called after successful send: ({ title, body }) => void.
 */
export default function SendNotificationDialog({
  open, onClose, recipientName, ownerId, petName, onSent,
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    if (open) { setTitle(''); setBody(''); }
  }, [open]);

  const handleClose = () => {
    // Block close while a request is in-flight to prevent the Snackbar from
    // disappearing before the user reads the result.
    if (sending) return;
    setTitle('');
    setBody('');
    onClose();
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending(true);

    try {
      const [pushToken, workerUrl] = await Promise.all([
        resolvePushToken(ownerId),
        getWorkerUrl(),
      ]);

      if (!pushToken) {
        setSnack({
          open: true,
          message: 'This client has not enabled push notifications.',
          severity: 'warning',
        });
        setSending(false);
        return;
      }

      if (!workerUrl) {
        setSnack({
          open: true,
          message: 'Push notification service is not configured. Set the Worker URL in Settings.',
          severity: 'error',
        });
        setSending(false);
        return;
      }

      const endpoint = workerUrl.replace(/\/+$/, '') + '/push/custom';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pushToken,
          title: title.trim(),
          body: body.trim(),
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        throw new Error(errText);
      }

      setSnack({
        open: true,
        message: `Notification sent to ${recipientName || 'client'}.`,
        severity: 'success',
      });

      // Notify the parent for any context-specific audit work (e.g., clinicalPulse write).
      if (onSent) onSent({ title: title.trim(), body: body.trim() });

      // Brief delay so the Snackbar is visible before the dialog dismisses.
      setTimeout(() => {
        setTitle('');
        setBody('');
        onClose();
      }, 800);
    } catch (err) {
      console.error('[SendNotificationDialog] Send failed:', err);
      setSnack({
        open: true,
        message: `Failed to send: ${err.message || 'Unknown error'}`,
        severity: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  const dismissSnack = () => setSnack((prev) => ({ ...prev, open: false }));

  const hasPreview = title.trim() || body.trim();

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 0,
            border: `2px solid ${COLORS.brand}`,
            boxShadow: `4px 4px 0px ${COLORS.brand}`,
          },
        }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <DialogTitle
          sx={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: '0.95rem',
            color: COLORS.brand,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            borderBottom: `2px solid ${COLORS.border}`,
            bgcolor: COLORS.cream,
          }}
        >
          <NotificationsActiveIcon sx={{ fontSize: 18, color: COLORS.medical }} />
          Send Notification to {recipientName || 'Client'}
        </DialogTitle>

        {/* ── Fields ─────────────────────────────────────────────── */}
        <DialogContent sx={{ pt: 3, pb: 1 }}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textSecondary, mb: 0.5 }}>
            NOTIFICATION TITLE
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="e.g., Lab Results Ready"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={sending}
            sx={{
              mb: 2,
              '& .MuiOutlinedInput-root': {
                fontFamily: FONT,
                fontWeight: 600,
                fontSize: '0.9rem',
                borderRadius: 0,
                bgcolor: COLORS.formBg,
                '& fieldset': { borderColor: COLORS.borderInput },
              },
            }}
          />

          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textSecondary, mb: 0.5 }}>
            MESSAGE BODY
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            placeholder={
              petName
                ? `e.g., ${petName}'s lab results are ready for pickup.`
                : "e.g., Your pet's lab results are ready for pickup."
            }
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={sending}
            sx={{
              mb: 2.5,
              '& .MuiOutlinedInput-root': {
                fontFamily: FONT,
                fontWeight: 500,
                fontSize: '0.875rem',
                borderRadius: 0,
                bgcolor: COLORS.formBg,
                '& fieldset': { borderColor: COLORS.borderInput },
              },
            }}
          />

          {/* ── Live preview (only shown when at least one field has text) ── */}
          {hasPreview && (
            <Box
              sx={{
                border: `1px dashed ${COLORS.border}`,
                bgcolor: COLORS.surfaceAlt,
                borderRadius: 0,
                p: 2,
              }}
            >
              <Typography
                sx={{
                  fontFamily: FONT,
                  ...TYPE.label,
                  color: COLORS.textMuted,
                  mb: 1,
                  letterSpacing: '0.06em',
                }}
              >
                NOTIFICATION PREVIEW
              </Typography>
              <Box
                sx={{
                  bgcolor: COLORS.cardBg,
                  border: `1px solid ${COLORS.borderLight}`,
                  borderRadius: 0,
                  p: 1.5,
                }}
              >
                <Typography
                  sx={{
                    fontFamily: FONT,
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    color: COLORS.textPrimary,
                    mb: 0.25,
                  }}
                >
                  {title.trim() || 'Title'}
                </Typography>
                <Typography
                  sx={{
                    fontFamily: FONT,
                    fontSize: '0.82rem',
                    color: COLORS.textSecondary,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {body.trim() || 'Message body'}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>

        {/* ── Actions ─────────────────────────────────────────────── */}
        <DialogActions sx={{ px: 2.5, pb: 2, pt: 1, borderTop: `1px solid ${COLORS.borderLight}` }}>
          <Button
            onClick={handleClose}
            disabled={sending}
            sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            variant="contained"
            disabled={!title.trim() || !body.trim() || sending}
            startIcon={
              sending
                ? <CircularProgress size={16} color="inherit" />
                : <SendIcon sx={{ fontSize: '16px !important' }} />
            }
            sx={{
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: '0.82rem',
              textTransform: 'none',
              bgcolor: COLORS.medical,
              borderRadius: 0,
              px: 3,
              boxShadow: 'none',
              '&:hover': { bgcolor: '#0D47A1' },
              '&.Mui-disabled': { bgcolor: COLORS.borderLight },
            }}
          >
            {sending ? 'Sending...' : 'Send Notification'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Internal Snackbar — lives outside Dialog so it survives dialog close transitions */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={dismissSnack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={dismissSnack}
          severity={snack.severity}
          variant="filled"
          sx={{ fontFamily: FONT, width: '100%' }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </>
  );
}
