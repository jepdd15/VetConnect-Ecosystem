/**
 * BulkPromoDialog — T4.207
 *
 * 3-step compose / preview / success dialog for sending promotional
 * notifications to all opted-in clients (allowPromos === true).
 *
 * Step 1 — Compose: title + body fields, channel checkboxes, optional template picker.
 * Step 2 — Preview: full scrollable recipient list + count confirmation.
 * Step 3 — Success: per-channel sent counts + 1-hour cooldown countdown.
 *
 * Sequential send loop (for...of with await) — deliberately not Promise.all to avoid
 * Worker rate limiting. One notification_log doc per recipient per channel with type:'promo'.
 * Cooldown persists via localStorage key 'promoCooldownEnd' so a page refresh cannot bypass it.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Box, Typography, Checkbox, FormControlLabel,
  CircularProgress, Snackbar, Alert, List, ListItem, ListItemText,
  Select, MenuItem, FormControl, InputLabel, Chip,
} from '@mui/material';
import CampaignIcon from '@mui/icons-material/Campaign';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LockClockIcon from '@mui/icons-material/LockClock';
import {
  collection, getDocs, addDoc, query, where, orderBy, limit, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { FONT, TYPE, COLORS } from '../theme/designTokens';
import { getWorkerUrl } from '../utils/sendPushNotification';
import { buildEmailHtml } from '../utils/notificationTemplateConstants';
import { useUser } from '../context/UserContext';

// ── Constants ─────────────────────────────────────────────────────────────────

const STAFF_ROLES = ['admin', 'staff', 'veterinarian', 'groomer'];
const COOLDOWN_KEY = 'promoCooldownEnd';
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Formats a seconds-remaining value into "Xm Ys" display. */
function formatCountdown(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @param {{ open: boolean, onClose: function, onSent: function }} props
 */
export default function BulkPromoDialog({ open, onClose, onSent }) {
  const { profile } = useUser();

  // Step control: 'compose' | 'preview' | 'success'
  const [step, setStep] = useState('compose');

  // Compose fields
  const [title, setTitle]             = useState('');
  const [body, setBody]               = useState('');
  const [sendEmail, setSendEmail]     = useState(false);
  const [sendSms, setSendSms]         = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  // Template picker
  const [templates, setTemplates]             = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Recipients
  const [recipients, setRecipients]             = useState([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // Send progress
  const [sending, setSending] = useState(false);
  const [result, setResult]   = useState(null); // { push, email, sms, failed }

  // Cooldown
  const [cooldownEnd, setCooldownEnd]           = useState(null); // Date | null
  const [cooldownRemaining, setCooldownRemaining] = useState(0);   // seconds

  // Feedback
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  // ── Reset + template load on open ────────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    setStep('compose');
    setTitle('');
    setBody('');
    setSendEmail(false);
    setSendSms(false);
    setSaveAsTemplate(false);
    setSelectedTemplateId('');
    setResult(null);

    // Load saved templates
    getDocs(query(collection(db, 'promo_templates'), orderBy('createdAt', 'desc'), limit(20)))
      .then((snap) => setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => setTemplates([]));

    // Restore cooldown from localStorage
    const stored = localStorage.getItem(COOLDOWN_KEY);
    if (stored) {
      const end = new Date(stored);
      if (end > new Date()) {
        setCooldownEnd(end);
      } else {
        localStorage.removeItem(COOLDOWN_KEY);
        setCooldownEnd(null);
      }
    }
  }, [open]);

  // ── Cooldown countdown ticker ─────────────────────────────────────────────

  useEffect(() => {
    if (!cooldownEnd) {
      setCooldownRemaining(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000));
      setCooldownRemaining(remaining);
      if (remaining <= 0) {
        setCooldownEnd(null);
        localStorage.removeItem(COOLDOWN_KEY);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownEnd]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleTemplateSelect = (templateId) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      setTitle(tpl.title || '');
      setBody(tpl.body || '');
    }
  };

  const handlePreview = useCallback(async () => {
    if (!title.trim() || !body.trim()) return;
    setLoadingRecipients(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('allowPromos', '==', true))
      );
      const list = [];
      for (const d of snap.docs) {
        const data = d.data();
        // Exclude clinic staff — promos are client-facing marketing messages
        const role = data.role || data.accessLevel || 'client';
        if (STAFF_ROLES.includes(role)) continue;
        list.push({
          id:             d.id,
          fullName:       data.fullName || data.name || 'Unknown',
          phone:          data.phone || null,
          email:          data.email || null,
          expoPushToken:  data.expoPushToken || null,
        });
      }
      list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
      setRecipients(list);
      setStep('preview');
    } catch (err) {
      setSnack({ open: true, message: `Failed to load recipients: ${err.message}`, severity: 'error' });
    } finally {
      setLoadingRecipients(false);
    }
  }, [title, body]);

  const handleSend = useCallback(async () => {
    setSending(true);

    const workerUrl = await getWorkerUrl();
    if (!workerUrl) {
      setSnack({
        open: true,
        message: 'Push notification service not configured. Set Worker URL in Settings.',
        severity: 'error',
      });
      setSending(false);
      return;
    }

    const baseEndpoint = workerUrl.replace(/\/+$/, '');
    const staffName    = profile?.fullName || 'Staff';
    const trimmedTitle = title.trim();
    const trimmedBody  = body.trim();
    const counts       = { push: 0, email: 0, sms: 0, failed: 0 };

    for (const r of recipients) {
      // ── Push (always attempted if token exists) ──────────────────────────
      if (r.expoPushToken) {
        try {
          const res = await fetch(baseEndpoint + '/push/custom', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ pushToken: r.expoPushToken, title: trimmedTitle, body: trimmedBody }),
          });
          if (res.ok) {
            counts.push++;
            addDoc(collection(db, 'notification_log'), {
              ownerId:       r.id,
              ownerName:     r.fullName,
              status:        null,
              petName:       null,
              title:         trimmedTitle,
              body:          trimmedBody,
              appointmentId: null,
              sentAt:        Timestamp.now(),
              sentBy:        staffName,
              channel:       'push',
              type:          'promo',
            }).catch(() => {});
          } else {
            counts.failed++;
          }
        } catch {
          counts.failed++;
        }
      }

      // ── Email (opt-in per blast) ─────────────────────────────────────────
      if (sendEmail && r.email) {
        try {
          const res = await fetch(baseEndpoint + '/email', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              to:      r.email,
              subject: trimmedTitle,
              html:    buildEmailHtml(trimmedTitle, trimmedBody),
            }),
          });
          if (res.ok) {
            counts.email++;
            addDoc(collection(db, 'notification_log'), {
              ownerId:       r.id,
              ownerName:     r.fullName,
              status:        null,
              petName:       null,
              title:         trimmedTitle,
              body:          trimmedBody,
              appointmentId: null,
              sentAt:        Timestamp.now(),
              sentBy:        staffName,
              channel:       'email',
              type:          'promo',
            }).catch(() => {});
          }
        } catch {
          // Email failure is non-critical — push was already sent
        }
      }

      // ── SMS (opt-in per blast, PH format only) ───────────────────────────
      if (sendSms && r.phone && /^09\d{9}$/.test(r.phone)) {
        try {
          const res = await fetch(baseEndpoint + '/sms', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ to: r.phone, message: `${trimmedTitle}: ${trimmedBody}` }),
          });
          if (res.ok) {
            counts.sms++;
            addDoc(collection(db, 'notification_log'), {
              ownerId:       r.id,
              ownerName:     r.fullName,
              status:        null,
              petName:       null,
              title:         trimmedTitle,
              body:          trimmedBody,
              appointmentId: null,
              sentAt:        Timestamp.now(),
              sentBy:        staffName,
              channel:       'sms',
              type:          'promo',
            }).catch(() => {});
          }
        } catch {
          // SMS failure is non-critical
        }
      }
    }

    // ── Save template if checkbox was checked ────────────────────────────
    if (saveAsTemplate) {
      addDoc(collection(db, 'promo_templates'), {
        name:      trimmedTitle,
        title:     trimmedTitle,
        body:      trimmedBody,
        createdAt: Timestamp.now(),
        createdBy: staffName,
      }).catch(() => {});
    }

    // ── Activate 1-hour cooldown ─────────────────────────────────────────
    const cooldownDate = new Date(Date.now() + COOLDOWN_MS);
    setCooldownEnd(cooldownDate);
    localStorage.setItem(COOLDOWN_KEY, cooldownDate.toISOString());

    setResult(counts);
    setStep('success');
    setSending(false);

    if (onSent) onSent(counts);
  }, [recipients, title, body, sendEmail, sendSms, saveAsTemplate, profile, onSent]);

  const handleClose = () => {
    if (sending) return;
    onClose();
  };

  const dismissSnack = () => setSnack((prev) => ({ ...prev, open: false }));

  // ── Derived state ─────────────────────────────────────────────────────────

  const isPreviewDisabled = !title.trim() || !body.trim() || loadingRecipients || cooldownRemaining > 0;
  const isSendDisabled    = sending;

  // ── Render helpers ────────────────────────────────────────────────────────

  const dialogTitle = step === 'compose'
    ? 'SEND PROMOTIONAL NOTIFICATION'
    : step === 'preview'
      ? 'CONFIRM PROMO SEND'
      : 'PROMO SENT';

  // ── Render ────────────────────────────────────────────────────────────────

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
        {/* ── Header ──────────────────────────────────────────────────── */}
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
          <CampaignIcon sx={{ fontSize: 18, color: COLORS.warning }} />
          {dialogTitle}
        </DialogTitle>

        {/* ── Compose Step ────────────────────────────────────────────── */}
        {step === 'compose' && (
          <DialogContent sx={{ pt: 3, pb: 1 }}>

            {/* Cooldown warning banner */}
            {cooldownRemaining > 0 && (
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1.5,
                mb: 2.5,
                bgcolor: COLORS.cream,
                border: `2px solid ${COLORS.warning}`,
                borderRadius: 0,
              }}>
                <LockClockIcon sx={{ color: COLORS.warning, fontSize: 18, flexShrink: 0 }} />
                <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', fontWeight: 700, color: COLORS.warning }}>
                  Last promo sent recently. Send button available again in {formatCountdown(cooldownRemaining)}.
                </Typography>
              </Box>
            )}

            {/* Template picker — only shown when saved templates exist */}
            {templates.length > 0 && (
              <FormControl fullWidth size="small" sx={{ mb: 2.5 }}>
                <InputLabel sx={{ fontFamily: FONT, fontSize: '0.8rem' }}>Load from template</InputLabel>
                <Select
                  value={selectedTemplateId}
                  label="Load from template"
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  sx={{
                    fontFamily: FONT,
                    fontSize: '0.85rem',
                    borderRadius: 0,
                    bgcolor: COLORS.formBg,
                    '& fieldset': { borderColor: COLORS.borderInput },
                  }}
                >
                  <MenuItem value="" sx={{ fontFamily: FONT }}>— None —</MenuItem>
                  {templates.map((tpl) => (
                    <MenuItem key={tpl.id} value={tpl.id} sx={{ fontFamily: FONT }}>
                      {tpl.name || tpl.title}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Title */}
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textSecondary, mb: 0.5 }}>
              TITLE *
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="e.g., Monthly Grooming Promo — 20% Off"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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

            {/* Body */}
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textSecondary, mb: 0.5 }}>
              MESSAGE *
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={4}
              placeholder="e.g., Book your pet's grooming appointment this week and enjoy 20% off. Valid until May 31."
              value={body}
              onChange={(e) => setBody(e.target.value)}
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

            {/* Channels */}
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textSecondary, mb: 0.75 }}>
              CHANNELS
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
              {/* Push is always included — disabled checkbox for clarity */}
              <FormControlLabel
                control={
                  <Checkbox
                    checked
                    disabled
                    size="small"
                    sx={{ color: COLORS.kpiPurpleText, '&.Mui-checked': { color: COLORS.kpiPurpleText } }}
                  />
                }
                label={
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textSecondary }}>
                    Push Notification (always included)
                  </Typography>
                }
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                    size="small"
                    sx={{ '&.Mui-checked': { color: COLORS.kpiPurpleText } }}
                  />
                }
                label={
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textSecondary }}>
                    Also send Email
                  </Typography>
                }
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={sendSms}
                    onChange={(e) => setSendSms(e.target.checked)}
                    size="small"
                    sx={{ '&.Mui-checked': { color: COLORS.kpiPurpleText } }}
                  />
                }
                label={
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textSecondary }}>
                    Also send SMS{' '}
                    <Typography component="span" sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted }}>
                      (cost per message)
                    </Typography>
                  </Typography>
                }
              />
            </Box>

            {/* Save as template */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={saveAsTemplate}
                  onChange={(e) => setSaveAsTemplate(e.target.checked)}
                  size="small"
                  sx={{ '&.Mui-checked': { color: COLORS.kpiPurpleText } }}
                />
              }
              label={
                <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textSecondary }}>
                  Save as Template for future use
                </Typography>
              }
            />
          </DialogContent>
        )}

        {/* ── Preview Step ─────────────────────────────────────────────── */}
        {step === 'preview' && (
          <DialogContent sx={{ pt: 3, pb: 1 }}>
            {/* Message preview */}
            <Box sx={{
              p: 2,
              mb: 2,
              bgcolor: COLORS.surfaceAlt,
              border: `1px dashed ${COLORS.border}`,
              borderRadius: 0,
            }}>
              <Typography sx={{ fontFamily: FONT, fontWeight: 800, fontSize: '0.9rem', color: COLORS.textPrimary, mb: 0.5 }}>
                "{title}"
              </Typography>
              <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', color: COLORS.textSecondary }}>
                {body.length > 100 ? `${body.slice(0, 100)}...` : body}
              </Typography>
            </Box>

            {/* Channel summary chips */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2.5, flexWrap: 'wrap' }}>
              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textSecondary, alignSelf: 'center' }}>
                CHANNELS:
              </Typography>
              <Chip
                label="PUSH"
                size="small"
                sx={{ fontFamily: FONT, fontWeight: 800, fontSize: '0.65rem', borderRadius: 0, bgcolor: COLORS.chipBlueBg, color: COLORS.medical, border: `1px solid ${COLORS.medical}` }}
              />
              {sendEmail && (
                <Chip
                  label="EMAIL"
                  size="small"
                  sx={{ fontFamily: FONT, fontWeight: 800, fontSize: '0.65rem', borderRadius: 0, bgcolor: COLORS.kpiGreenBg, color: COLORS.success, border: `1px solid ${COLORS.success}` }}
                />
              )}
              {sendSms && (
                <Chip
                  label="SMS"
                  size="small"
                  sx={{ fontFamily: FONT, fontWeight: 800, fontSize: '0.65rem', borderRadius: 0, bgcolor: COLORS.kpiOrangeBg, color: COLORS.warning, border: `1px solid ${COLORS.warning}` }}
                />
              )}
            </Box>

            {/* Recipient list */}
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textSecondary, mb: 0.75 }}>
              RECIPIENTS ({recipients.length} opted-in client{recipients.length !== 1 ? 's' : ''})
            </Typography>
            <Box sx={{
              maxHeight: 300,
              overflow: 'auto',
              border: `1px solid ${COLORS.border}`,
              borderRadius: 0,
              mb: 2,
            }}>
              {recipients.length === 0 ? (
                <Box sx={{ p: 2 }}>
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textMuted }}>
                    No opted-in clients found.
                  </Typography>
                </Box>
              ) : (
                <List dense disablePadding>
                  {recipients.map((r, index) => (
                    <ListItem
                      key={r.id}
                      divider={index < recipients.length - 1}
                      sx={{ py: 0.75, px: 2 }}
                    >
                      <ListItemText
                        primary={
                          <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.85rem', color: COLORS.textPrimary }}>
                            {r.fullName}
                          </Typography>
                        }
                        secondary={
                          <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted }}>
                            {r.phone || '—'}
                          </Typography>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>

            {/* Warning */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <WarningAmberIcon sx={{ color: COLORS.warning, fontSize: 18, flexShrink: 0 }} />
              <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', fontWeight: 700, color: COLORS.warning }}>
                This will send to {recipients.length} client{recipients.length !== 1 ? 's' : ''}. Cannot be undone.
              </Typography>
            </Box>
          </DialogContent>
        )}

        {/* ── Success Step ─────────────────────────────────────────────── */}
        {step === 'success' && result && (
          <DialogContent sx={{ pt: 3, pb: 1 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2 }}>
              <CheckCircleIcon sx={{ fontSize: 48, color: COLORS.success }} />

              <Typography sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '1.1rem', color: COLORS.textPrimary }}>
                Promo sent successfully!
              </Typography>

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Chip
                  icon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
                  label={`${result.push} push`}
                  size="small"
                  sx={{ fontFamily: FONT, fontWeight: 800, fontSize: '0.7rem', borderRadius: 0, bgcolor: COLORS.chipBlueBg, color: COLORS.medical, border: `1px solid ${COLORS.medical}` }}
                />
                {result.email > 0 && (
                  <Chip
                    icon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
                    label={`${result.email} email`}
                    size="small"
                    sx={{ fontFamily: FONT, fontWeight: 800, fontSize: '0.7rem', borderRadius: 0, bgcolor: COLORS.kpiGreenBg, color: COLORS.success, border: `1px solid ${COLORS.success}` }}
                  />
                )}
                {result.sms > 0 && (
                  <Chip
                    icon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
                    label={`${result.sms} SMS`}
                    size="small"
                    sx={{ fontFamily: FONT, fontWeight: 800, fontSize: '0.7rem', borderRadius: 0, bgcolor: COLORS.kpiOrangeBg, color: COLORS.warning, border: `1px solid ${COLORS.warning}` }}
                  />
                )}
                {result.failed > 0 && (
                  <Chip
                    icon={<WarningAmberIcon sx={{ fontSize: '14px !important' }} />}
                    label={`${result.failed} failed`}
                    size="small"
                    sx={{ fontFamily: FONT, fontWeight: 800, fontSize: '0.7rem', borderRadius: 0, bgcolor: COLORS.kpiRedBg, color: COLORS.danger, border: `1px solid ${COLORS.danger}` }}
                  />
                )}
              </Box>

              <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', color: COLORS.textMuted }}>
                Last sent: just now
              </Typography>

              {cooldownRemaining > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LockClockIcon sx={{ color: COLORS.textMuted, fontSize: 16 }} />
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', color: COLORS.textMuted }}>
                    Send button available again in {formatCountdown(cooldownRemaining)}
                  </Typography>
                </Box>
              )}
            </Box>
          </DialogContent>
        )}

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <DialogActions sx={{ px: 2.5, pb: 2, pt: 1, borderTop: `1px solid ${COLORS.borderLight}` }}>
          {step === 'compose' && (
            <>
              <Button
                onClick={handleClose}
                sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0 }}
              >
                Cancel
              </Button>
              <Button
                onClick={handlePreview}
                disabled={isPreviewDisabled}
                startIcon={
                  loadingRecipients
                    ? <CircularProgress size={14} color="inherit" />
                    : <SendIcon sx={{ fontSize: '16px !important' }} />
                }
                sx={{
                  fontFamily: FONT,
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  borderRadius: 0,
                  bgcolor: COLORS.sky,
                  color: COLORS.cardBg,
                  px: 2.5,
                  boxShadow: `2px 2px 0px ${COLORS.accent}`,
                  '&:hover': { bgcolor: '#0288D1', transform: 'translate(1px,1px)', boxShadow: `1px 1px 0px ${COLORS.accent}` },
                  '&.Mui-disabled': { color: COLORS.textMuted, bgcolor: COLORS.surface, borderColor: COLORS.border, boxShadow: 'none' },
                }}
              >
                {loadingRecipients ? 'LOADING...' : 'PREVIEW RECIPIENTS'}
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button
                onClick={() => setStep('compose')}
                disabled={sending}
                startIcon={<ArrowBackIcon sx={{ fontSize: '16px !important' }} />}
                sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0 }}
              >
                Back
              </Button>
              <Button
                onClick={handleSend}
                disabled={isSendDisabled || recipients.length === 0}
                startIcon={
                  sending
                    ? <CircularProgress size={14} color="inherit" />
                    : <SendIcon sx={{ fontSize: '16px !important' }} />
                }
                sx={{
                  fontFamily: FONT,
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  borderRadius: 0,
                  bgcolor: '#D84315',
                  color: COLORS.cardBg,
                  px: 2.5,
                  boxShadow: `2px 2px 0px ${COLORS.accent}`,
                  '&:hover': { bgcolor: '#BF360C', transform: 'translate(1px,1px)', boxShadow: `1px 1px 0px ${COLORS.accent}` },
                  '&.Mui-disabled': { color: COLORS.textMuted, bgcolor: COLORS.surface, borderColor: COLORS.border, boxShadow: 'none' },
                }}
              >
                {sending ? 'SENDING...' : `SEND TO ${recipients.length} CLIENT${recipients.length !== 1 ? 'S' : ''}`}
              </Button>
            </>
          )}

          {step === 'success' && (
            <Button
              onClick={handleClose}
              sx={{
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: '0.82rem',
                borderRadius: 0,
                bgcolor: COLORS.accent,
                color: COLORS.cardBg,
                px: 3,
                boxShadow: `2px 2px 0px ${COLORS.brand}`,
                '&:hover': { bgcolor: COLORS.brand, transform: 'translate(1px,1px)', boxShadow: `1px 1px 0px ${COLORS.brand}` },
              }}
            >
              CLOSE
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Snackbar lives outside Dialog so it survives step transitions */}
      <Snackbar
        open={snack.open}
        autoHideDuration={5000}
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
