/**
 * ReminderWidget — One-click appointment reminder sender (T4.93).
 *
 * Displayed on the Dashboard Operations tab above the tab content.
 * Shows tomorrow's confirmed appointment count and a Send button.
 * After sending, result chips appear inline showing sent/skipped/failed counts.
 *
 * Self-hides entirely when clinicSettings.enableAppointmentReminders === false.
 */
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, CircularProgress, Chip, Snackbar, Alert,
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import {
  sendAppointmentReminders,
  countTomorrowAppointments,
} from '../../../utils/sendAppointmentReminders';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a human-readable label for tomorrow, e.g. "Wed, May 1". */
function getTomorrowLabel() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @param {{ clinicSettings: object }} props
 */
export default function ReminderWidget({ clinicSettings }) {
  const isEnabled = clinicSettings.enableAppointmentReminders !== false;

  const [count, setCount]     = useState(null);    // null = still loading
  const [sending, setSending] = useState(false);
  const [result, setResult]   = useState(null);    // { sent, skipped, failed, noToken, total }
  const [toast, setToast]     = useState({ open: false, message: '', severity: 'success' });

  // Fetch tomorrow's appointment count on mount — only when the widget is enabled
  useEffect(() => {
    if (!isEnabled) return;
    countTomorrowAppointments()
      .then(setCount)
      .catch(() => setCount(0));
  }, [isEnabled]);

  // Feature gate — hide widget when the setting is explicitly disabled.
  // All hooks are declared above this guard to satisfy the rules-of-hooks.
  if (!isEnabled) return null;

  const handleSend = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await sendAppointmentReminders();
      setResult(res);

      if (res.error) {
        setToast({ open: true, message: res.error, severity: 'error' });
      } else {
        const plural = res.sent !== 1 ? 's' : '';
        setToast({
          open: true,
          message: `Sent ${res.sent} reminder${plural}. ${res.skipped} skipped, ${res.noToken} without token.`,
          severity: 'success',
        });
      }

      // Refresh count — some appointments are now marked reminderSentAt
      countTomorrowAppointments().then(setCount).catch(() => {});
    } catch (err) {
      setToast({
        open: true,
        message: err?.message || 'Failed to send reminders.',
        severity: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  const tomorrowLabel   = getTomorrowLabel();
  const isSendDisabled  = sending || count === null || count === 0;
  const sendLabel       = sending ? 'SENDING...' : result ? 'SEND AGAIN' : 'SEND REMINDERS';

  return (
    <>
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 3,
        py: 1.5,
        bgcolor: COLORS.kpiBlueBg,
        border: `2px solid ${COLORS.kpiBlueBorder}`,
        borderRadius: 0,
        mb: 1.5,
      }}>

        <NotificationsActiveIcon sx={{ color: COLORS.info, fontSize: 22, flexShrink: 0 }} />

        {/* Label + count */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.info }}>
            TOMORROW'S REMINDERS ({tomorrowLabel})
          </Typography>
          <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary, mt: 0.25 }}>
            {count === null
              ? 'Loading...'
              : count === 0
                ? 'No confirmed appointments tomorrow.'
                : `${count} confirmed appointment${count !== 1 ? 's' : ''} tomorrow.`}
          </Typography>
        </Box>

        {/* Result chips — visible after a successful send */}
        {result && !sending && (
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            <Chip
              icon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
              label={`${result.sent} sent`}
              size="small"
              sx={{
                fontFamily: FONT,
                fontWeight: 900,
                fontSize: '0.65rem',
                borderRadius: 0,
                bgcolor: COLORS.kpiGreenBg,
                color: COLORS.success,
                border: `1px solid ${COLORS.kpiGreenBorder}`,
              }}
            />
            {result.skipped > 0 && (
              <Chip
                label={`${result.skipped} skipped`}
                size="small"
                sx={{
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: '0.65rem',
                  borderRadius: 0,
                  bgcolor: COLORS.kpiOrangeBg,
                  color: COLORS.warning,
                  border: `1px solid ${COLORS.kpiOrangeBorder}`,
                }}
              />
            )}
            {result.noToken > 0 && (
              <Chip
                label={`${result.noToken} no token`}
                size="small"
                sx={{
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: '0.65rem',
                  borderRadius: 0,
                  bgcolor: COLORS.kpiOrangeBg,
                  color: COLORS.warning,
                  border: `1px solid ${COLORS.kpiOrangeBorder}`,
                }}
              />
            )}
            {result.failed > 0 && (
              <Chip
                label={`${result.failed} failed`}
                size="small"
                sx={{
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: '0.65rem',
                  borderRadius: 0,
                  bgcolor: COLORS.kpiRedBg,
                  color: COLORS.danger,
                  border: `1px solid ${COLORS.kpiRedBorder}`,
                }}
              />
            )}
          </Box>
        )}

        {/* Send / Send Again button */}
        <Button
          onClick={handleSend}
          disabled={isSendDisabled}
          startIcon={sending ? <CircularProgress size={14} color="inherit" /> : <SendIcon />}
          sx={{
            fontFamily: FONT,
            ...TYPE.label,
            fontSize: '0.65rem',
            flexShrink: 0,
            color: COLORS.cardBg,
            bgcolor: COLORS.info,
            border: `2px solid ${COLORS.info}`,
            borderRadius: 0,
            px: 2.5,
            py: 0.75,
            boxShadow: `2px 2px 0px ${COLORS.accent}`,
            transition: 'transform 0.1s ease, box-shadow 0.1s ease',
            '&:hover': {
              bgcolor: '#0D47A1',
              transform: 'translate(1px, 1px)',
              boxShadow: `1px 1px 0px ${COLORS.accent}`,
            },
            '&.Mui-disabled': {
              color: COLORS.textMuted,
              bgcolor: COLORS.surface,
              borderColor: COLORS.border,
              boxShadow: 'none',
            },
          }}
        >
          {sendLabel}
        </Button>
      </Box>

      {/* Feedback Snackbar — no window.alert() */}
      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToast(t => ({ ...t, open: false }))}
          severity={toast.severity}
          sx={{
            fontFamily: FONT,
            borderRadius: 0,
            border: `2px solid ${toast.severity === 'error' ? COLORS.danger : COLORS.success}`,
          }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}
