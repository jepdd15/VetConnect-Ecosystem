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

import React, { useState } from 'react';
import { Box, Typography, Tabs, Tab, Skeleton } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import BuildIcon from '@mui/icons-material/Build';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';

import { FONT, TYPE, COLORS } from '../../theme/designTokens';
import { useUser } from '../../context/UserContext';
import { useClinicSettings } from '../../hooks/useClinicSettings';
import { useDashboardData } from './hooks/useDashboardData';
import PeriodSelector from './components/PeriodSelector';
import QuickNavTiles from './components/QuickNavTiles';
import OperationsTab from './components/OperationsTab';

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

  const data = useDashboardData(effectivePeriod);
  const isOpen = computeClinicOpenStatus(clinicSettings);

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

        {/* Period selector — hidden for Operations (always "Today") */}
        {currentTab.key !== 'ops' && (
          <PeriodSelector value={effectivePeriod} onChange={setPeriod} />
        )}

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

      {/* ── TAB CONTENT ──────────────────────────────────────── */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3 }}>
        {data.loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 0 }} />
            ))}
          </Box>
        ) : (
          <>
            {currentTab.key === 'growth' && (
              <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted }}>
                Growth tab — coming in Day 2.
              </Typography>
            )}
            {currentTab.key === 'ops' && (
              <OperationsTab data={data} clinicSettings={clinicSettings} isOpen={isOpen} />
            )}
            {currentTab.key === 'clinical' && (
              <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted }}>
                Clinical tab — coming in Day 3.
              </Typography>
            )}
            {currentTab.key === 'financial' && (
              <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted }}>
                Financial tab — coming in Day 4.
              </Typography>
            )}
          </>
        )}
      </Box>

      {/* ── QUICK NAV (sticky bottom) ─────────────────────────── */}
      <QuickNavTiles />

    </Box>
  );
}
