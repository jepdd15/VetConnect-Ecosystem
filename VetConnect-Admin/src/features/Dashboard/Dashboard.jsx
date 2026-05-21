/**
 * Dashboard — Single-layout Option J design.
 *
 * Replaces the previous 4-tab Today/Analytics/Financial/Performance layout.
 * The page has three layers:
 *   1. Slim status strip (date + clinic open/closed + Refresh + Export)
 *   2. Action Banners (ReminderWidget) — always real-time, regardless of period
 *   3. Time-scoped content (OptionJDashboard) — chip-driven period selector,
 *      Compare-vs-previous toggle, Performance / Patterns / Trends / Distribution
 *
 * All staff have full access (T4.154). The Today period is the default.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, Tooltip, Snackbar, Alert,
  Popover, Badge,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';

import { FONT, TYPE, COLORS } from '../../theme/designTokens';
import { useClinicSettings } from '../../hooks/useClinicSettings';
import { useDashboardData } from './hooks/useDashboardData';
import OptionJDashboard from './components/OptionJDashboard';
import ReminderWidget from './components/ReminderWidget';
import { generateReportHTML } from './utils/generateReportHTML';
import { openPrintWindow } from '../../utils/printUtils';
import { computeFullVaccineReminderQueue } from '../../utils/vaccineReminderQueue';
import { exportDashboardCSV } from './utils/exportDashboardCSV';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

// ── Helpers ────────────────────────────────────────────────────

function computeClinicOpenStatus(clinicSettings) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();
  const isWorkingDay = (clinicSettings.workingDays || [0, 1, 2, 3, 4, 5, 6]).includes(currentDay);
  return (
    isWorkingDay &&
    currentHour >= (clinicSettings.openHour || 8) &&
    currentHour < (clinicSettings.closeHour || 17)
  );
}

function formatTodayLabel() {
  return new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Component ───────────────────────────────────────────────────

export default function Dashboard() {
  const clinicSettings = useClinicSettings();

  // Option J: single shared period state — drives all time-scoped zones.
  const [period, setPeriod] = useState('today');
  const [periodOffset, setPeriodOffset] = useState(0); // 0 = current, -1 = previous instance, etc.
  const [compareEnabled, setCompareEnabled] = useState(false);

  // Switching the period unit resets to the current instance.
  const handleChangePeriod = useCallback((newPeriod) => {
    setPeriod(newPeriod);
    setPeriodOffset(0);
  }, []);

  // Auto-refresh state (preserved from previous design)
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [isInteracting, setIsInteracting] = useState(false);
  const intervalRef = useRef(null);
  const interactionTimeout = useRef(null);

  const [popupBlockedOpen, setPopupBlockedOpen] = useState(false);

  // Notification bell — anchors the reminder popover.
  const [bellAnchor, setBellAnchor] = useState(null);
  const [actionCount, setActionCount] = useState(0);
  const handleOpenBell = (e) => setBellAnchor(e.currentTarget);
  const handleCloseBell = () => setBellAnchor(null);
  const isBellOpen = Boolean(bellAnchor);

  // benchmarkEnabled drives the YoY computation inside useDashboardData.
  // The OptionJ Compare toggle controls the period-over-period delta display;
  // the hook still runs prev-period deltas regardless, so Compare toggling
  // does not need to re-fetch — just to reveal/hide already-computed deltas.
  const data = useDashboardData(period, refreshKey, false, periodOffset);
  const isOpen = computeClinicOpenStatus(clinicSettings);

  // ── 30-second auto-refresh with three guards ──────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (autoRefresh && isPageVisible && !isInteracting) {
      intervalRef.current = setInterval(() => {
        setRefreshKey(k => k + 1);
      }, 30000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, isPageVisible, isInteracting]);

  // ── Page Visibility API — pause when tab is backgrounded ───────
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // ── Interaction pause — prevents refresh mid-read ──────────────
  const handleInteractionStart = useCallback(() => {
    if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    setIsInteracting(true);
  }, []);

  const handleInteractionEnd = useCallback(() => {
    if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    interactionTimeout.current = setTimeout(() => setIsInteracting(false), 5000);
  }, []);

  useEffect(() => {
    return () => {
      if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    };
  }, []);

  // ── Weekly vaccine reminder queue recompute (T3.55) ────────────
  useEffect(() => {
    if (data.loading) return;
    if (clinicSettings.enableVaccineReminders === false) return;

    const lastRecompute = clinicSettings.lastVaccineQueueRecomputeAt;
    const lastMs = lastRecompute?.toDate
      ? lastRecompute.toDate().getTime()
      : (lastRecompute?.seconds ? lastRecompute.seconds * 1000 : 0);

    const daysSinceRecompute = (Date.now() - lastMs) / 86400000;
    if (daysSinceRecompute < 7) return;

    computeFullVaccineReminderQueue(clinicSettings)
      .then(({ processed, queued, removed }) => {
        console.info(
          `[Dashboard] Vaccine queue recomputed: ${processed} pets processed, ` +
          `${queued} queued, ${removed} removed.`,
        );
        updateDoc(doc(db, 'clinic_settings', 'general'), {
          lastVaccineQueueRecomputeAt: Timestamp.now(),
        }).catch(() => {});
      })
      .catch((err) => {
        console.error('[Dashboard] Vaccine queue recompute failed:', err?.message);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.loading, clinicSettings.enableVaccineReminders, clinicSettings.lastVaccineQueueRecomputeAt]);

  // ── Export current view as printable HTML ──────────────────────
  const handleExportReport = () => {
    // Export uses the currently-selected period. We pass the period key
    // generateReportHTML used to support so the function continues to work.
    const html = generateReportHTML('analytics', data, clinicSettings, period);
    openPrintWindow(html, () => setPopupBlockedOpen(true));
  };

  const handleExportCSV = () => {
    exportDashboardCSV(data, period, clinicSettings);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        bgcolor: COLORS.formBg,
      }}
    >
      {/* ── SLIM STATUS STRIP ──────────────────────────────────── */}
      <Box
        sx={{
          flexShrink: 0,
          bgcolor: COLORS.cream,
          borderBottom: `2px solid ${COLORS.accent}`,
          px: { xs: 2, md: 4 },
          pl: { xs: 8, md: 4 },
          py: 1.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        {/* Left: Date + clinic open/closed */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography
            sx={{
              fontFamily: FONT,
              fontWeight: 900,
              color: COLORS.brand,
              fontSize: '0.95rem',
            }}
          >
            {formatTodayLabel()}
          </Typography>

          <Box
            sx={{
              px: 1.5,
              py: 0.5,
              bgcolor: isOpen ? COLORS.kpiGreenBg : COLORS.kpiRedBg,
              border: `2px solid ${isOpen ? COLORS.success : COLORS.danger}`,
              borderRadius: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: isOpen ? COLORS.success : COLORS.danger,
              }}
            />
            <Typography
              sx={{
                fontFamily: FONT,
                ...TYPE.label,
                color: isOpen ? COLORS.success : COLORS.danger,
                fontSize: '0.7rem',
              }}
            >
              {isOpen ? 'CLINIC OPEN' : 'CLINIC CLOSED'}
            </Typography>
          </Box>
        </Box>

        {/* Right: Notifications + Export + Refresh */}
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {/* Notification bell — opens reminder panel */}


          <Button
            onClick={handleExportCSV}
            disabled={data.loading}
            variant="outlined"
            sx={{
              fontFamily: FONT,
              ...TYPE.label,
              fontSize: '0.7rem',
              color: COLORS.brand,
              bgcolor: COLORS.cardBg,
              border: `2px solid ${COLORS.brand}`,
              borderRadius: 0,
              px: 2,
              py: 0.75,
              boxShadow: `2px 2px 0px ${COLORS.brand}`,
              transition: 'transform 0.1s ease, box-shadow 0.1s ease',
              '&:hover': {
                bgcolor: COLORS.cream,
                transform: 'translate(1px, 1px)',
                boxShadow: `1px 1px 0px ${COLORS.brand}`,
              },
              '&.Mui-disabled': {
                color: COLORS.textMuted,
                borderColor: COLORS.border,
                boxShadow: 'none',
              },
            }}
          >
            EXPORT CSV
          </Button>

          <Button
            onClick={handleExportReport}
            disabled={data.loading}
            startIcon={<PrintIcon />}
            sx={{
              fontFamily: FONT,
              ...TYPE.label,
              fontSize: '0.7rem',
              color: '#fff',
              bgcolor: COLORS.brand,
              border: `2px solid ${COLORS.brand}`,
              borderRadius: 0,
              px: 2,
              py: 0.75,
              boxShadow: `2px 2px 0px ${COLORS.accent}`,
              transition: 'transform 0.1s ease, box-shadow 0.1s ease',
              '&:hover': {
                bgcolor: COLORS.accent,
                transform: 'translate(1px, 1px)',
                boxShadow: `1px 1px 0px ${COLORS.accent}`,
              },
              '&.Mui-disabled': {
                color: COLORS.textMuted,
                borderColor: COLORS.border,
                boxShadow: 'none',
              },
            }}
          >
            PRINT REPORT
          </Button>

          <Tooltip
            title={autoRefresh ? 'Auto-refresh on (30s)' : 'Auto-refresh paused'}
            arrow
          >
            <IconButton
              onClick={() => setAutoRefresh(prev => !prev)}
              sx={{
                color: autoRefresh ? COLORS.success : COLORS.textMuted,
                border: `2px solid ${autoRefresh ? COLORS.success : COLORS.border}`,
                borderRadius: 0,
                p: 0.75,
                transition: 'color 0.2s ease, border-color 0.2s ease',
              }}
            >
              {autoRefresh ? (
                <AutorenewIcon
                  sx={{
                    fontSize: 20,
                    animation: (autoRefresh && isPageVisible && !isInteracting)
                      ? 'dashboardSpin 2s linear infinite'
                      : 'none',
                    '@keyframes dashboardSpin': {
                      '0%':   { transform: 'rotate(0deg)' },
                      '100%': { transform: 'rotate(360deg)' },
                    },
                  }}
                />
              ) : (
                <PauseCircleIcon sx={{ fontSize: 20 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── REMINDER POPOVER (opened from bell icon) ───────────── */}
      {/*
        keepMounted=true ensures the widget's listeners + counts stay live
        while the popover is closed, so the badge always reflects current state.
      */}
      <Popover
        open={isBellOpen}
        anchorEl={bellAnchor}
        onClose={handleCloseBell}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        keepMounted
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: { xs: 'calc(100vw - 24px)', sm: 520 },
              maxHeight: 'calc(100vh - 120px)',
              overflow: 'auto',
              borderRadius: 0,
              border: `2px solid ${COLORS.brand}`,
              boxShadow: '6px 6px 0px rgba(62, 39, 35, 0.25)',
              bgcolor: COLORS.cardBg,
            },
          },
        }}
      >
        <Box sx={{ p: 1.5, borderBottom: `2px solid ${COLORS.accent}`, bgcolor: COLORS.cream }}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.brand, fontSize: '0.85rem' }}>
            ACTIONS &amp; REMINDERS
          </Typography>
          <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary, fontSize: '0.72rem', mt: 0.25 }}>
            Daily reminders, queues, and outreach you can send from here.
          </Typography>
        </Box>
        <Box sx={{ p: 1.5 }}>
          <ReminderWidget
            clinicSettings={clinicSettings}
            onActionCountChange={setActionCount}
          />
        </Box>
      </Popover>

      {/* ── SCROLLING CONTENT ──────────────────────────────────── */}
      <Box
        onMouseEnter={handleInteractionStart}
        onMouseLeave={handleInteractionEnd}
        sx={{ flexGrow: 1, overflow: 'auto', px: 3, py: 2.5 }}
      >
        {/* Time-scoped dashboard content */}
        {data.loading ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 6,
            }}
          >
            <Typography sx={{ ...TYPE.meta, fontFamily: FONT, color: COLORS.textMuted }}>
              Loading dashboard data…
            </Typography>
          </Box>
        ) : (
          <Box sx={{ mt: 2 }}>
            <OptionJDashboard
              data={data}
              period={period}
              onChangePeriod={handleChangePeriod}
              periodOffset={periodOffset}
              onChangePeriodOffset={setPeriodOffset}
              compareEnabled={compareEnabled}
              onToggleCompare={() => setCompareEnabled((v) => !v)}
            />
          </Box>
        )}
      </Box>

      <Snackbar
        open={popupBlockedOpen}
        autoHideDuration={6000}
        onClose={() => setPopupBlockedOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="warning"
          onClose={() => setPopupBlockedOpen(false)}
          sx={{ fontFamily: FONT, borderRadius: 0, border: `2px solid ${COLORS.warning}` }}
        >
          Pop-up was blocked. Please allow pop-ups for this site and try again.
        </Alert>
      </Snackbar>
    </Box>
  );
}
