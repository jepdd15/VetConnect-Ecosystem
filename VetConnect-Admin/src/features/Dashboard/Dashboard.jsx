/**
 * Dashboard — Main page component.
 *
 * Four-tab layout: Growth | Operations | Clinical | Financial
 * Financial is admin-only (filtered from visibleTabs for non-admins).
 *
 * The Operations tab is hardcoded to the "Today" period and renders
 * real-time Firestore data via useDashboardData. Other tabs get a
 * PeriodSelector and will be implemented on Days 2–4.
 *
 * Layout pattern: 100vh flex column, header + tab bar fixed, content
 * scrolls, QuickNavTiles pinned at the bottom — mirrors Expenses.jsx
 * and Inventory.jsx.
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Box, Typography, Tabs, Tab, Skeleton, Button, Chip,
  IconButton, Tooltip, Snackbar, Alert,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import SummarizeIcon from '@mui/icons-material/Summarize';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import BuildIcon from '@mui/icons-material/Build';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';

import { FONT, TYPE, COLORS } from '../../theme/designTokens';
import { useUser } from '../../context/UserContext';
import { useClinicSettings } from '../../hooks/useClinicSettings';
import { useDashboardData } from './hooks/useDashboardData';
import { useDashboardPreferences } from './hooks/useDashboardPreferences';
import PeriodSelector from './components/PeriodSelector';
import QuickNavTiles from './components/QuickNavTiles';
import OperationsTab from './components/OperationsTab';
import GrowthTab from './components/GrowthTab';
import FinancialTab from './components/FinancialTab';
import ClinicalTab from './components/ClinicalTab';
import { generateInsight } from './utils/generateInsight';
import { generateReportHTML, generateFullReportHTML } from './utils/generateReportHTML';
import { openPrintWindow } from '../../utils/printUtils';
import AlertStrip from './components/AlertStrip';
import ReminderWidget from './components/ReminderWidget';

// ── Tab registry ─────────────────────────────────────────────────
// defaultPeriod is the period the hook uses when that tab is active.
// Operations is always forced to 'today' regardless of this value.
const TAB_CONFIG = [
  { key: 'growth',    label: 'Growth',     icon: <TrendingUpIcon />,    defaultPeriod: 'month' },
  { key: 'ops',       label: 'Operations', icon: <BuildIcon />,         defaultPeriod: 'today' },
  { key: 'clinical',  label: 'Clinical',   icon: <LocalHospitalIcon />, defaultPeriod: 'month' },
  { key: 'financial', label: 'Financial',  icon: <AttachMoneyIcon />,   defaultPeriod: 'month', adminOnly: true },
];

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Determines clinic open/closed status from clinic settings and current time.
 * Uses client clock — acceptable for admin dashboard where the operator's
 * machine is the reference clock (same approach as Queue.jsx).
 */
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

// ── Component ────────────────────────────────────────────────────

export default function Dashboard() {
  const { isAdmin } = useUser();
  const clinicSettings = useClinicSettings();

  // Filter admin-only tabs based on role
  const visibleTabs = TAB_CONFIG.filter(t => !t.adminOnly || isAdmin);

  // Default to Operations tab (index 1 in full list, adjusted after filtering)
  const opsIndex = visibleTabs.findIndex(t => t.key === 'ops');
  const [activeTab, setActiveTab] = useState(opsIndex >= 0 ? opsIndex : 0);

  const currentTab = visibleTabs[activeTab] || visibleTabs[0];

  // Per-tab period state (tabs other than Operations use this)
  const [period, setPeriod] = useState(currentTab.defaultPeriod);

  // Switching tabs resets period to that tab's default
  const handleTabChange = (_, newIndex) => {
    setActiveTab(newIndex);
    const nextTab = visibleTabs[newIndex];
    if (nextTab) setPeriod(nextTab.defaultPeriod);
  };

  // Operations is always "today" — override any stale period state
  const effectivePeriod = currentTab.key === 'ops' ? 'today' : period;

  // ── T4.1: Auto-refresh state ────────────────────────────────────
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [isInteracting, setIsInteracting] = useState(false);
  const intervalRef = useRef(null);
  const interactionTimeout = useRef(null);

  // ── T4.3: Year-over-year benchmark toggle ───────────────────────
  const [benchmarkEnabled, setBenchmarkEnabled] = useState(false);

  // ── T4.2: Per-user layout preferences ──────────────────────────
  const { layouts, saveLayout, resetLayouts } = useDashboardPreferences();

  // ── T4.4: Popup-blocked snackbar ───────────────────────────────
  const [popupBlockedOpen, setPopupBlockedOpen] = useState(false);

  const data = useDashboardData(effectivePeriod, refreshKey, benchmarkEnabled);
  const isOpen = computeClinicOpenStatus(clinicSettings);

  // ── T4.1: 30-second interval with three guards ─────────────────
  // Only ticks when user has auto-refresh on, the page is visible,
  // and the user isn't hovering over tab content.
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

  // ── T4.1: Page Visibility API ──────────────────────────────────
  // Pauses the interval when the browser tab is backgrounded.
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // ── T4.1: Interaction pause handlers ──────────────────────────
  // Mouse entering the tab content area pauses auto-refresh immediately.
  // After mouse leaves, a 5-second debounce prevents a refresh mid-read.
  const handleInteractionStart = useCallback(() => {
    if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    setIsInteracting(true);
  }, []);

  const handleInteractionEnd = useCallback(() => {
    if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    interactionTimeout.current = setTimeout(() => setIsInteracting(false), 5000);
  }, []);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    };
  }, []);

  // Day 4: Insight engine — compute once per data/settings change
  const insights = useMemo(
    () => data.loading ? {} : generateInsight(data, clinicSettings, isOpen),
    [data, clinicSettings, isOpen],
  );

  const handleExportReport = () => {
    const html = generateReportHTML(currentTab.key, data, clinicSettings, effectivePeriod);
    openPrintWindow(html, () => setPopupBlockedOpen(true));
  };

  // T4.4: Export all visible tabs as a single combined print document.
  const handleExportAllTabs = () => {
    const html = generateFullReportHTML(data, clinicSettings, period, isAdmin);
    openPrintWindow(html, () => setPopupBlockedOpen(true));
  };

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      bgcolor: COLORS.formBg,
    }}>

      {/* ── HEADER ───────────────────────────────────────────── */}
      <Box sx={{
        flexShrink: 0,
        bgcolor: COLORS.cream,
        borderBottom: `2px solid ${COLORS.accent}`,
        p: 2.5,
        px: 4,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        {/* Title */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <DashboardIcon sx={{ color: COLORS.accent, fontSize: 28 }} />
          <Box>
            <Typography sx={{
              fontFamily: FONT,
              fontWeight: TYPE.label.fontWeight,
              color: COLORS.accent,
              textTransform: 'uppercase',
              letterSpacing: 1,
              fontSize: '1.5rem',
              lineHeight: 1,
            }}>
              Dashboard
            </Typography>
            <Typography sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted, mt: 0.25 }}>
              {clinicSettings.clinicName || 'Starbarks Veterinary Clinic'}
            </Typography>
          </Box>
        </Box>

        {/* Period selector + Export buttons + Auto-refresh toggle */}
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {currentTab.key !== 'ops' && (
            <PeriodSelector value={effectivePeriod} onChange={setPeriod} />
          )}

          {/* T4.3: Year-over-year benchmark toggle */}
          <Chip
            label={benchmarkEnabled ? 'VS LAST YEAR: ON' : 'VS LAST YEAR'}
            size="small"
            onClick={() => setBenchmarkEnabled(prev => !prev)}
            icon={<CompareArrowsIcon sx={{ fontSize: '14px !important' }} />}
            sx={{
              fontFamily: FONT,
              ...TYPE.label,
              fontSize: '0.65rem',
              borderRadius: 0,
              border: `2px solid ${benchmarkEnabled ? COLORS.info : COLORS.border}`,
              bgcolor: benchmarkEnabled ? COLORS.kpiBlueBg : COLORS.cardBg,
              color: benchmarkEnabled ? COLORS.info : COLORS.textSecondary,
              fontWeight: benchmarkEnabled ? 900 : TYPE.label.fontWeight,
              boxShadow: benchmarkEnabled ? `2px 2px 0px ${COLORS.info}` : 'none',
              cursor: 'pointer',
              '& .MuiChip-icon': {
                color: benchmarkEnabled ? COLORS.info : COLORS.textMuted,
              },
            }}
          />

          {/* T4.4: Export current tab as print document */}
          <Button
            onClick={handleExportReport}
            disabled={data.loading}
            startIcon={<PrintIcon />}
            sx={{
              fontFamily: FONT,
              ...TYPE.label,
              fontSize: '0.65rem',
              color: COLORS.accent,
              bgcolor: COLORS.cardBg,
              border: `2px solid ${COLORS.accent}`,
              borderRadius: 0,
              px: 2,
              py: 0.75,
              boxShadow: `2px 2px 0px ${COLORS.accent}`,
              transition: 'transform 0.1s ease, box-shadow 0.1s ease',
              '&:hover': {
                bgcolor: COLORS.cream,
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
            EXPORT REPORT
          </Button>

          {/* T4.4: Export all tabs as a single combined document */}
          <Button
            onClick={handleExportAllTabs}
            disabled={data.loading}
            startIcon={<SummarizeIcon />}
            sx={{
              fontFamily: FONT,
              ...TYPE.label,
              fontSize: '0.65rem',
              color: COLORS.info,
              bgcolor: COLORS.cardBg,
              border: `2px solid ${COLORS.info}`,
              borderRadius: 0,
              px: 2,
              py: 0.75,
              boxShadow: `2px 2px 0px ${COLORS.info}`,
              transition: 'transform 0.1s ease, box-shadow 0.1s ease',
              '&:hover': {
                bgcolor: COLORS.kpiBlueBg,
                transform: 'translate(1px, 1px)',
                boxShadow: `1px 1px 0px ${COLORS.info}`,
              },
              '&.Mui-disabled': {
                color: COLORS.textMuted,
                borderColor: COLORS.border,
                boxShadow: 'none',
              },
            }}
          >
            EXPORT ALL TABS
          </Button>

          {/* T4.2: Reset draggable layout back to defaults */}
          <Tooltip title="Reset KPI card positions to default" arrow>
            <Button
              onClick={resetLayouts}
              startIcon={<RestartAltIcon />}
              sx={{
                fontFamily: FONT,
                ...TYPE.label,
                fontSize: '0.65rem',
                color: COLORS.textSecondary,
                bgcolor: COLORS.cardBg,
                border: `2px solid ${COLORS.border}`,
                borderRadius: 0,
                px: 1.5,
                py: 0.75,
                boxShadow: `2px 2px 0px ${COLORS.border}`,
                transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                '&:hover': {
                  bgcolor: COLORS.surface,
                  transform: 'translate(1px, 1px)',
                  boxShadow: `1px 1px 0px ${COLORS.border}`,
                },
              }}
            >
              RESET LAYOUT
            </Button>
          </Tooltip>

          {/* T4.1: Auto-refresh toggle — spins when all three guards are active */}
          <Tooltip
            title={autoRefresh ? 'Auto-refresh ON (30s)' : 'Auto-refresh paused'}
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
                <AutorenewIcon sx={{
                  fontSize: 20,
                  animation: (autoRefresh && isPageVisible && !isInteracting)
                    ? 'dashboardSpin 2s linear infinite'
                    : 'none',
                  '@keyframes dashboardSpin': {
                    '0%':   { transform: 'rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg)' },
                  },
                }} />
              ) : (
                <PauseCircleIcon sx={{ fontSize: 20 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>

        {/* Clinic open/closed badge (T2.229 partial) */}
        <Box sx={{
          px: 2,
          py: 0.75,
          bgcolor: isOpen ? COLORS.kpiGreenBg : COLORS.kpiRedBg,
          border: `2px solid ${isOpen ? COLORS.success : COLORS.danger}`,
          borderRadius: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          <Box sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: isOpen ? COLORS.success : COLORS.danger,
          }} />
          <Typography sx={{
            fontFamily: FONT,
            ...TYPE.label,
            color: isOpen ? COLORS.success : COLORS.danger,
            fontSize: '0.7rem',
          }}>
            {isOpen ? 'CLINIC OPEN' : 'CLINIC CLOSED'}
          </Typography>
        </Box>
      </Box>

      {/* ── TAB BAR ──────────────────────────────────────────── */}
      <Box sx={{
        flexShrink: 0,
        bgcolor: COLORS.cardBg,
        borderBottom: `2px solid ${COLORS.accent}`,
        px: 4,
      }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          sx={{
            minHeight: 48,
            '& .MuiTab-root': {
              fontFamily: FONT,
              ...TYPE.label,
              fontSize: '0.75rem',
              minHeight: 48,
              textTransform: 'uppercase',
              color: COLORS.textSecondary,
              '&.Mui-selected': { color: COLORS.accent },
            },
            '& .MuiTabs-indicator': {
              bgcolor: COLORS.accent,
              height: 3,
              borderRadius: 0,
            },
          }}
        >
          {visibleTabs.map(tab => (
            <Tab
              key={tab.key}
              label={tab.label}
              icon={tab.icon}
              iconPosition="start"
            />
          ))}
        </Tabs>
      </Box>

      {/* ── ALERT STRIP (Operations tab only, T2.332) ────────── */}
      {currentTab.key === 'ops' && !data.loading && (
        <AlertStrip ops={data.ops} clinicSettings={clinicSettings} />
      )}

      {/* ── REMINDER WIDGET (Operations tab only, T4.93) ─────── */}
      {currentTab.key === 'ops' && !data.loading && (
        <Box sx={{ px: 3, pt: 1.5 }}>
          <ReminderWidget clinicSettings={clinicSettings} />
        </Box>
      )}

      {/* ── TAB CONTENT ──────────────────────────────────────── */}
      {/* T4.1: onMouseEnter/Leave pause auto-refresh while the user is
          hovering over charts or tooltips to prevent refresh mid-read. */}
      <Box
        onMouseEnter={handleInteractionStart}
        onMouseLeave={handleInteractionEnd}
        sx={{ flexGrow: 1, overflow: 'auto', p: 3 }}
      >
        {data.loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 0 }} />
            ))}
          </Box>
        ) : (
          <>
            {currentTab.key === 'growth' && (
              <GrowthTab
                data={data}
                clinicSettings={clinicSettings}
                insights={insights}
                yearAgoDeltas={data.yearAgoDeltas}
                layout={layouts.growth}
                onLayoutChange={(newLayout) => saveLayout('growth', newLayout)}
              />
            )}
            {currentTab.key === 'ops' && (
              <OperationsTab
                data={data}
                clinicSettings={clinicSettings}
                isOpen={isOpen}
                insights={insights}
                yearAgoDeltas={data.yearAgoDeltas}
                layout={layouts.ops}
                onLayoutChange={(newLayout) => saveLayout('ops', newLayout)}
              />
            )}
            {currentTab.key === 'clinical' && (
              <ClinicalTab
                data={data}
                insights={insights}
                clinicSettings={clinicSettings}
                yearAgoDeltas={data.yearAgoDeltas}
                layout={layouts.clinical}
                onLayoutChange={(newLayout) => saveLayout('clinical', newLayout)}
              />
            )}
            {currentTab.key === 'financial' && (
              <FinancialTab
                data={data}
                insights={insights}
                clinicSettings={clinicSettings}
                yearAgoDeltas={data.yearAgoDeltas}
                layout={layouts.financial}
                onLayoutChange={(newLayout) => saveLayout('financial', newLayout)}
              />
            )}
          </>
        )}
      </Box>

      {/* ── QUICK NAV (sticky bottom) ─────────────────────────── */}
      <QuickNavTiles />

      {/* T4.4: Popup-blocked fallback — shown when window.open returns null */}
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
