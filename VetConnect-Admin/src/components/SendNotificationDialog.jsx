import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Box, Typography, Snackbar, Alert,
  CircularProgress, Checkbox, FormControlLabel, IconButton, Tooltip,
  Divider,
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import SendIcon from '@mui/icons-material/Send';
import RefreshIcon from '@mui/icons-material/Refresh';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import EmailIcon from '@mui/icons-material/Email';
import SmsIcon from '@mui/icons-material/Sms';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { FONT, TYPE, COLORS } from '../theme/designTokens';
import { resolvePushToken, getWorkerUrl, getCachedOwnerEmail, getCachedOwnerPhone } from '../utils/sendPushNotification';
import { buildEmailHtml } from '../utils/notificationTemplateConstants';
import { useUser } from '../context/UserContext';

/**
 * T4.92 — Reusable dialog for sending free-text notifications (Push + Email).
 * 
 * Provides a 'Smart Channel Hub' where staff can toggle between Push and Email,
 * verify destination details, and refresh contact data directly from Firestore.
 */
export default function SendNotificationDialog({
  open, onClose, recipientName, ownerId, petName, onSent,
}) {
  const { profile } = useUser();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  // Channel Destinations (T4.122)
  const [pushToken, setPushToken] = useState(null);
  const [ownerEmail, setOwnerEmail] = useState(null);
  const [ownerPhone, setOwnerPhone] = useState(null);
  const [sendPush, setSendPush] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(false);

  const cleanPhone = (num) => (num || '').replace(/\D/g, '');
  const isSmsReady = (num) => {
    const clean = cleanPhone(num);
    return (clean.startsWith('09') || clean.startsWith('639')) && clean.length >= 10 && clean.length <= 13;
  };

  const resolveDestinations = async () => {
    if (!ownerId) return;
    setResolving(true);
    try {
      // Resolve both channels from Firestore/Cache
      const token = await resolvePushToken(ownerId);
      setPushToken(token);
      
      const email = getCachedOwnerEmail(ownerId);
      setOwnerEmail(email);

      const phone = getCachedOwnerPhone(ownerId);
      setOwnerPhone(phone);

      // Auto-toggle based on availability
      setSendPush(!!token);
      setSendEmail(!!email);
      setSendSms(isSmsReady(phone));
    } catch (err) {
      console.error('[SendNotificationDialog] Resolve failed:', err);
    } finally {
      setResolving(false);
    }
  };

  useEffect(() => {
    if (open) { 
      setTitle(''); 
      setBody(''); 
      resolveDestinations();
    }
  }, [open, ownerId]);

  const handleClose = () => {
    if (sending) return;
    setTitle('');
    setBody('');
    onClose();
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    if (!sendPush && !sendEmail && !sendSms) {
      setSnack({ open: true, message: 'Please select at least one delivery channel.', severity: 'warning' });
      return;
    }

    setSending(true);

    try {
      const workerUrl = await getWorkerUrl();
      if (!workerUrl) {
        setSnack({
          open: true,
          message: 'Notification service is not configured. Set the Worker URL in Settings.',
          severity: 'error',
        });
        setSending(false);
        return;
      }

      const baseEndpoint = workerUrl.replace(/\/+$/, '');
      const channelsSent = [];

      // Channel 1: Push
      if (sendPush && pushToken) {
        const res = await fetch(baseEndpoint + '/push/custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pushToken,
            title: title.trim(),
            body: body.trim(),
          }),
        });

        if (res.ok) {
          channelsSent.push('Push');
          addDoc(collection(db, 'notification_log'), {
            ownerId, ownerName: recipientName || null, status: null, petName: petName || null,
            title: title.trim(), body: body.trim(), appointmentId: null, sentAt: Timestamp.now(),
            sentBy: profile?.fullName || 'Staff', channel: 'push', type: 'custom',
          }).catch(() => {});
        }
      }

      // Channel 2: Email
      if (sendEmail && ownerEmail) {
        const res = await fetch(baseEndpoint + '/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to:      ownerEmail,
            subject: title.trim(),
            html:    buildEmailHtml(title.trim(), body.trim()),
          }),
        });

        if (res.ok) {
          channelsSent.push('Email');
          addDoc(collection(db, 'notification_log'), {
            ownerId, ownerName: recipientName || null, status: null, petName: petName || null,
            title: title.trim(), body: body.trim(), appointmentId: null, sentAt: Timestamp.now(),
            sentBy: profile?.fullName || 'Staff', channel: 'email', type: 'custom',
          }).catch(() => {});
        }
      }

      // Channel 3: SMS (T4.122 Unleashed)
      if (sendSms && ownerPhone) {
        const res = await fetch(baseEndpoint + '/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to:      cleanPhone(ownerPhone),
            message: body.trim(),
          }),
        });

        if (res.ok) {
          channelsSent.push('SMS');
          addDoc(collection(db, 'notification_log'), {
            ownerId, ownerName: recipientName || null, status: null, petName: petName || null,
            title: title.trim(), body: body.trim(), appointmentId: null, sentAt: Timestamp.now(),
            sentBy: profile?.fullName || 'Staff', channel: 'sms', type: 'custom',
          }).catch(() => {});
        }
      }

      if (channelsSent.length === 0) {
        throw new Error('All selected delivery attempts failed. Check connectivity.');
      }

      setSnack({
        open: true,
        message: `Message sent via ${channelsSent.join(' & ')}.`,
        severity: 'success',
      });

      if (onSent) onSent({ title: title.trim(), body: body.trim() });

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
        <DialogTitle
          sx={{
            fontFamily: FONT, fontWeight: 900, fontSize: '0.95rem', color: COLORS.brand,
            display: 'flex', alignItems: 'center', gap: 1, borderBottom: `2px solid ${COLORS.border}`,
            bgcolor: COLORS.cream,
          }}
        >
          <NotificationsActiveIcon sx={{ fontSize: 18, color: COLORS.medical }} />
          Send Notification to {recipientName || 'Client'}
        </DialogTitle>

        <DialogContent sx={{ pt: 2, pb: 1 }}>
          {/* ── Destination Resolver & Status (T4.122) ────────────────── */}
          <Box sx={{ bgcolor: COLORS.panelBg, border: `1px solid ${COLORS.borderLight}`, p: 1.5, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 1000, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Delivery Destinations
              </Typography>
              <Tooltip title="Refresh contact data from Firestore">
                <IconButton size="small" onClick={() => resolveDestinations()} disabled={resolving || sending}>
                  {resolving ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon sx={{ fontSize: 14 }} />}
                </IconButton>
              </Tooltip>
            </Box>
            
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {/* Push Status */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PhoneIphoneIcon sx={{ fontSize: 16, color: pushToken ? COLORS.success : COLORS.textMuted }} />
                <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700, color: pushToken ? COLORS.textPrimary : COLORS.textMuted }}>
                  Push: {pushToken ? 'READY' : ''}
                </Typography>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 1000, color: pushToken ? COLORS.success : COLORS.textMuted, bgcolor: pushToken ? '#E8F5E9' : '#F5F5F5', px: 0.6, py: 0.2, borderRadius: '4px' }}>
                  {pushToken ? 'AVAILABLE' : 'UNAVAILABLE'}
                </Typography>
              </Box>

              {/* Email Status */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <EmailIcon sx={{ fontSize: 16, color: ownerEmail ? COLORS.accent : COLORS.textMuted }} />
                <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700, color: ownerEmail ? COLORS.textPrimary : COLORS.textMuted }}>
                  Email: {ownerEmail ? ownerEmail : ''}
                </Typography>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 1000, color: ownerEmail ? COLORS.success : COLORS.textMuted, bgcolor: ownerEmail ? '#E8F5E9' : '#F5F5F5', px: 0.6, py: 0.2, borderRadius: '4px' }}>
                  {ownerEmail ? 'AVAILABLE' : 'UNAVAILABLE'}
                </Typography>
              </Box>

              {/* SMS Status */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SmsIcon sx={{ fontSize: 16, color: isSmsReady(ownerPhone) ? COLORS.warning : COLORS.textMuted }} />
                <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700, color: isSmsReady(ownerPhone) ? COLORS.textPrimary : COLORS.textMuted }}>
                  SMS: {ownerPhone ? ownerPhone : ''}
                </Typography>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 1000, color: isSmsReady(ownerPhone) ? COLORS.success : COLORS.textMuted, bgcolor: isSmsReady(ownerPhone) ? '#E8F5E9' : '#F5F5F5', px: 0.6, py: 0.2, borderRadius: '4px' }}>
                  {isSmsReady(ownerPhone) ? 'AVAILABLE' : 'UNAVAILABLE'}
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ my: 1.5 }} />

            {/* Channel Selection */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControlLabel
                control={<Checkbox size="small" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} disabled={!pushToken || sending} />}
                label={<Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700 }}>Push Notification</Typography>}
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} disabled={!ownerEmail || sending} />}
                label={<Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700 }}>Email Message</Typography>}
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} disabled={!isSmsReady(ownerPhone) || sending} />}
                label={<Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700 }}>SMS Message</Typography>}
              />
            </Box>
          </Box>

          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textSecondary, mb: 0.5 }}>
            NOTIFICATION TITLE
          </Typography>
          <TextField
            fullWidth size="small" placeholder="e.g., Lab Results Ready"
            value={title} onChange={(e) => setTitle(e.target.value)} disabled={sending}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { fontFamily: FONT, fontWeight: 600, fontSize: '0.9rem', borderRadius: 0, bgcolor: COLORS.formBg, '& fieldset': { borderColor: COLORS.borderInput } } }}
          />

          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textSecondary, mb: 0.5 }}>
            MESSAGE BODY
          </Typography>
          <TextField
            fullWidth multiline rows={3}
            placeholder={petName ? `e.g., ${petName}'s lab results are ready for pickup.` : "e.g., Your pet's lab results are ready for pickup."}
            value={body} onChange={(e) => setBody(e.target.value)} disabled={sending}
            sx={{ mb: 2.5, '& .MuiOutlinedInput-root': { fontFamily: FONT, fontWeight: 500, fontSize: '0.875rem', borderRadius: 0, bgcolor: COLORS.formBg, '& fieldset': { borderColor: COLORS.borderInput } } }}
          />

          {hasPreview && (
            <Box sx={{ border: `1px dashed ${COLORS.border}`, bgcolor: COLORS.surfaceAlt, borderRadius: 0, p: 2 }}>
              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 1, letterSpacing: '0.06em' }}>NOTIFICATION PREVIEW</Typography>
              <Box sx={{ bgcolor: COLORS.cardBg, border: `1px solid ${COLORS.borderLight}`, borderRadius: 0, p: 1.5 }}>
                <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.85rem', color: COLORS.textPrimary, mb: 0.25 }}>{title.trim() || 'Title'}</Typography>
                <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', color: COLORS.textSecondary, whiteSpace: 'pre-wrap' }}>{body.trim() || 'Message body'}</Typography>
              </Box>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 2.5, pb: 2, pt: 1, borderTop: `1px solid ${COLORS.borderLight}` }}>
          <Button onClick={handleClose} disabled={sending} sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0 }}>Cancel</Button>
          <Button
            onClick={handleSend} variant="contained"
            disabled={!title.trim() || !body.trim() || sending || (!sendPush && !sendEmail && !sendSms)}
            startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon sx={{ fontSize: '16px !important' }} />}
            sx={{
              fontFamily: FONT, fontWeight: 700, fontSize: '0.82rem', textTransform: 'none',
              bgcolor: COLORS.medical, borderRadius: 0, px: 3, boxShadow: 'none',
              '&:hover': { bgcolor: '#0D47A1' }, '&.Mui-disabled': { bgcolor: COLORS.borderLight },
            }}
          >
            {sending ? 'Sending...' : 'Send Notification'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={dismissSnack} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={dismissSnack} severity={snack.severity} variant="filled" sx={{ fontFamily: FONT, width: '100%' }}>{snack.message}</Alert>
      </Snackbar>
    </>
  );
}
