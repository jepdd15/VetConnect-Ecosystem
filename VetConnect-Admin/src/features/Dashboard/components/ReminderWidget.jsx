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
import VaccinesIcon from '@mui/icons-material/Vaccines';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import SendIcon from '@mui/icons-material/Send';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import { useUser } from '../../../context/UserContext';
import {
  countTomorrowAppointments,
} from '../../../utils/sendAppointmentReminders';
import {
  countVaccineReminderQueue,
  sendVaccineReminders,
} from '../../../utils/vaccineReminderQueue';
import {
  sendAppointmentRemindersFromQueue,
  countAppointmentReminderQueue,
} from '../../../utils/appointmentReminderQueue';
import { computeFullBalanceReminderQueue } from '../../../utils/computeBalanceReminderQueue';

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
  const { profile }      = useUser();
  const isEnabled        = clinicSettings.enableAppointmentReminders !== false;
  const isVaccineEnabled = clinicSettings.enableVaccineReminders !== false;
  const isBalanceEnabled = clinicSettings.enableBalanceReminders !== false;

  // ── Appointment reminder state ─────────────────────────────────────────────
  const [count, setCount]         = useState(null);
  const [sending, setSending]     = useState(false);
  const [result, setResult]       = useState(null);
  const [toast, setToast]         = useState({ open: false, message: '', severity: 'success' });
  const [queueCount, setQueueCount] = useState(null);

  // ── Vaccine reminder state ─────────────────────────────────────────────────
  const [vaccineCount, setVaccineCount]     = useState(null);
  const [vaccineSending, setVaccineSending] = useState(false);
  const [vaccineResult, setVaccineResult]   = useState(null);

  // ── Balance queue recompute state ──────────────────────────────────────────
  const [balanceRecomputing, setBalanceRecomputing] = useState(false);
  const [balanceResult, setBalanceResult]           = useState(null);

  // Fetch tomorrow's appointment count on mount — only when feature is enabled
  useEffect(() => {
    if (!isEnabled) return;
    countTomorrowAppointments()
      .then(setCount)
      .catch(() => setCount(0));
  }, [isEnabled]);

  // Fetch appointment reminder queue count — shows total across all stages
  useEffect(() => {
    if (!isEnabled) return;
    countAppointmentReminderQueue()
      .then(setQueueCount)
      .catch(() => setQueueCount(0));
  }, [isEnabled]);

  // Fetch vaccine reminder queue count on mount — only when feature is enabled
  useEffect(() => {
    if (!isVaccineEnabled) return;
    countVaccineReminderQueue()
      .then(setVaccineCount)
      .catch(() => setVaccineCount(0));
  }, [isVaccineEnabled]);

  // Feature gate — hide widget entirely when all features are disabled.
  // All hooks are declared above this guard to satisfy the rules-of-hooks.
  if (!isEnabled && !isVaccineEnabled && !isBalanceEnabled) return null;

  const handleSend = async () => {
    setSending(true);
    setResult(null);
    try {
      const staffName = profile?.fullName || 'Staff';
      const res = await sendAppointmentRemindersFromQueue(clinicSettings, staffName);
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
        // Update count to reflect actionable remainder (no token + failed)
        setQueueCount(res.noToken + (res.failed || 0));
      }

      // Refresh tomorrow count — unchanged by queue sends, but keeps display fresh
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

  const handleVaccineSend = async () => {
    setVaccineSending(true);
    setVaccineResult(null);
    try {
      const res = await sendVaccineReminders(clinicSettings);
      setVaccineResult(res);

      if (res.error) {
        setToast({ open: true, message: res.error, severity: 'error' });
      } else {
        const plural = res.sent !== 1 ? 's' : '';
        setToast({
          open: true,
          message: `Sent ${res.sent} vaccine reminder${plural}. ${res.skipped} skipped (cooldown), ${res.noToken} without token.`,
          severity: 'success',
        });
      }
      // Update count to reflect actionable remainder (not raw queue size)
      if (!res.error) {
        setVaccineCount(res.noToken + (res.failed || 0));
      }
    } catch (err) {
      setToast({
        open: true,
        message: err?.message || 'Failed to send vaccine reminders.',
        severity: 'error',
      });
    } finally {
      setVaccineSending(false);
    }
  };

  const handleBalanceRecompute = async () => {
    setBalanceRecomputing(true);
    setBalanceResult(null);
    try {
      const res = await computeFullBalanceReminderQueue();
      setBalanceResult(res);
      setToast({
        open: true,
        message: `Balance queue recomputed: ${res.updated} updated, ${res.deleted} cleared${res.errors > 0 ? `, ${res.errors} errors` : ''}.`,
        severity: res.errors > 0 ? 'warning' : 'success',
      });
    } catch (err) {
      setToast({
        open: true,
        message: err?.message || 'Failed to recompute balance queue.',
        severity: 'error',
      });
    } finally {
      setBalanceRecomputing(false);
    }
  };

  const tomorrowLabel   = getTomorrowLabel();
  const isSendDisabled  = sending || (count === null && queueCount === null) || (!queueCount && !count);
  const sendLabel       = sending ? 'SENDING...' : result ? 'SEND AGAIN' : 'SEND REMINDERS';

  return (
    <>
      {/* ── Appointment Reminder Row ─────────────────────────────────────── */}
      {isEnabled && (
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
                ? `No confirmed appointments tomorrow.${queueCount ? ` ${queueCount} in reminder queue.` : ''}`
                : `${count} confirmed appointment${count !== 1 ? 's' : ''} tomorrow.${queueCount ? ` ${queueCount} total in queue.` : ''}`}
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
      )} {/* end isEnabled appointment row */}

      {/* ── Vaccine Reminder Row (T3.55) ─────────────────────────────────── */}
      {isVaccineEnabled && (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 3,
          py: 1.5,
          bgcolor: COLORS.kpiOrangeBg,
          border: `2px solid ${COLORS.kpiOrangeBorder}`,
          borderRadius: 0,
          mb: 1.5,
        }}>
          <VaccinesIcon sx={{ color: COLORS.warning, fontSize: 22, flexShrink: 0 }} />

          {/* Label + count */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.warning }}>
              VACCINE REMINDERS
            </Typography>
            <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary, mt: 0.25 }}>
              {vaccineCount === null
                ? 'Loading...'
                : vaccineCount === 0
                  ? 'No pets with due or overdue vaccinations.'
                  : `${vaccineCount} pet${vaccineCount !== 1 ? 's' : ''} with due/overdue vaccinations.`}
            </Typography>
          </Box>

          {/* Result chips — visible after a successful send */}
          {vaccineResult && !vaccineSending && (
            <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
              <Chip
                icon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
                label={`${vaccineResult.sent} sent`}
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
              {vaccineResult.skipped > 0 && (
                <Chip
                  label={`${vaccineResult.skipped} cooldown`}
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
              {vaccineResult.noToken > 0 && (
                <Chip
                  label={`${vaccineResult.noToken} no token`}
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
              {vaccineResult.failed > 0 && (
                <Chip
                  label={`${vaccineResult.failed} failed`}
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

          {/* Send Now button */}
          <Button
            onClick={handleVaccineSend}
            disabled={vaccineSending || vaccineCount === null || vaccineCount === 0}
            startIcon={vaccineSending ? <CircularProgress size={14} color="inherit" /> : <SendIcon />}
            sx={{
              fontFamily: FONT,
              ...TYPE.label,
              fontSize: '0.65rem',
              flexShrink: 0,
              color: COLORS.cardBg,
              bgcolor: COLORS.warning,
              border: `2px solid ${COLORS.warning}`,
              borderRadius: 0,
              px: 2.5,
              py: 0.75,
              boxShadow: `2px 2px 0px ${COLORS.accent}`,
              transition: 'transform 0.1s ease, box-shadow 0.1s ease',
              '&:hover': {
                bgcolor: '#E65100',
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
            {vaccineSending ? 'SENDING...' : vaccineResult ? 'SEND AGAIN' : 'SEND NOW'}
          </Button>
        </Box>
      )}

      {/* ── Balance Reminder Queue Row (T4.204) ─────────────────────── */}
      {isBalanceEnabled && (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 3,
          py: 1.5,
          bgcolor: COLORS.kpiRedBg,
          border: `2px solid ${COLORS.kpiRedBorder}`,
          borderRadius: 0,
          mb: 1.5,
        }}>
          <AccountBalanceWalletIcon sx={{ color: COLORS.danger, fontSize: 22, flexShrink: 0 }} />

          {/* Label */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.danger }}>
              BALANCE REMINDER QUEUE
            </Typography>
            <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary, mt: 0.25 }}>
              {balanceResult
                ? `${balanceResult.updated} owner${balanceResult.updated !== 1 ? 's' : ''} in queue, ${balanceResult.deleted} cleared.`
                : 'Recompute to sync outstanding balances from sales.'}
            </Typography>
          </Box>

          {/* Result chips — visible after a successful recompute */}
          {balanceResult && !balanceRecomputing && (
            <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
              <Chip
                icon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
                label={`${balanceResult.updated} queued`}
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
              {balanceResult.deleted > 0 && (
                <Chip
                  label={`${balanceResult.deleted} cleared`}
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
              {balanceResult.errors > 0 && (
                <Chip
                  label={`${balanceResult.errors} errors`}
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

          {/* Recompute button */}
          <Button
            onClick={handleBalanceRecompute}
            disabled={balanceRecomputing}
            startIcon={balanceRecomputing ? <CircularProgress size={14} color="inherit" /> : <SyncIcon />}
            sx={{
              fontFamily: FONT,
              ...TYPE.label,
              fontSize: '0.65rem',
              flexShrink: 0,
              color: COLORS.cardBg,
              bgcolor: COLORS.danger,
              border: `2px solid ${COLORS.danger}`,
              borderRadius: 0,
              px: 2.5,
              py: 0.75,
              boxShadow: `2px 2px 0px ${COLORS.accent}`,
              transition: 'transform 0.1s ease, box-shadow 0.1s ease',
              '&:hover': {
                bgcolor: '#B71C1C',
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
            {balanceRecomputing ? 'RECOMPUTING...' : balanceResult ? 'RECOMPUTE AGAIN' : 'RECOMPUTE QUEUE'}
          </Button>
        </Box>
      )}

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
