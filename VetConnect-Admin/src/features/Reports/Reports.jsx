/**
 * Reports — Forensic Reporting page shell.
 *
 * Layout mirrors Dashboard.jsx: 100vh flex column, header + tab bar fixed,
 * content area scrolls. Three tabs:
 *   0 — Consult Performance
 *   1 — Audit Integrity  (Day 2)
 *   2 — Staff Workload   (Day 2)
 *
 * The DateRangePicker lives in the header area (right side, same position as
 * Dashboard's PeriodSelector). Clicking "Generate Report" triggers the hook
 * imperatively — nothing fetches on mount.
 *
 * After generation a count badge appears: "Analyzing N appointments".
 * If results were truncated at 500 records a persistent warning banner renders
 * below the tab bar.
 */

import React, { useState } from 'react';
import {
  Box, Tabs, Tab, Typography, Skeleton, Chip, Button,
} from '@mui/material';
import AssessmentIcon from '@mui/icons-material/Assessment';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import GroupIcon from '@mui/icons-material/Group';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import PrintIcon from '@mui/icons-material/Print';

import { FONT, TYPE, COLORS } from '../../theme/designTokens';
import { useClinicSettings } from '../../hooks/useClinicSettings';
import { useForensicReportData } from './hooks/useForensicReportData';
import { generateForensicReportHTML } from './utils/generateForensicReportHTML';
import DateRangePicker from './components/DateRangePicker';
import ConsultPerformanceTab from './components/ConsultPerformanceTab';
import AuditIntegrityTab from './components/AuditIntegrityTab';
import StaffWorkloadTab from './components/StaffWorkloadTab';

// ── Helpers ──────────────────────────────────────────────────────

/** Returns today's date as YYYY-MM-DD in Manila timezone. */
function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** Returns a date N days ago as YYYY-MM-DD in Manila timezone. */
function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

// ── Tab configuration ─────────────────────────────────────────────

const TABS = [
  { key: 'consult', label: 'Consult Performance', icon: <QueryStatsIcon /> },
  { key: 'audit',   label: 'Audit Integrity',     icon: <VerifiedUserIcon /> },
  { key: 'staff',   label: 'Staff Workload',       icon: <GroupIcon /> },
];

// ── Empty state ───────────────────────────────────────────────────

function EmptyState() {
  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: 2,
      py: 10,
    }}>
      <AssessmentIcon sx={{ fontSize: 64, color: COLORS.border }} />
      <Typography sx={{
        fontFamily: FONT,
        fontWeight: 900,
        fontSize: '1.1rem',
        color: COLORS.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}>
        No Report Generated
      </Typography>
      <Typography sx={{
        fontFamily: FONT,
        ...TYPE.meta,
        color: COLORS.textMuted,
        textAlign: 'center',
        maxWidth: 400,
      }}>
        Select a date range above and click "Generate Report" to analyze
        appointment pulse data for the chosen period.
      </Typography>
    </Box>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 2 }}>
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={90} sx={{ borderRadius: 0, flex: 1 }} />
        ))}
      </Box>
      <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 0 }} />
      <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 0 }} />
    </Box>
  );
}

// ── Component ────────────────────────────────────────────────────

export default function Reports() {
  const clinicSettings = useClinicSettings();

  // Date range state — default to last 30 days
  const [startDate, setStartDate] = useState(daysAgoStr(30));
  const [endDate,   setEndDate]   = useState(todayStr());

  const [activeTab, setActiveTab] = useState(0);

  const { generate, loading, error, data, truncated, truncatedEndDate } = useForensicReportData();

  const handleGenerate = () => {
    generate(startDate, endDate, clinicSettings);
  };

  const handleTabChange = (_, newIndex) => setActiveTab(newIndex);

  /**
   * Opens a new browser window with the print-ready forensic report HTML,
   * then triggers window.print() so the user goes straight to the print dialog.
   * The tabKey mapping follows TABS order: 0=consult, 1=audit, 2=staff.
   */
  const handleExport = () => {
    if (!data) return;
    const tabKey = TABS[activeTab]?.key ?? 'consult';
    const html   = generateForensicReportHTML({
      tabKey,
      reportData: data,
      clinicSettings,
      startDate,
      endDate,
    });
    const win = window.open('', '_blank');
    if (!win) {
      // Popup was blocked — fall back to a data URL
      const blob = new Blob([html], { type: 'text/html' });
      const url  = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return;
    }
    win.document.write(html);
    win.document.close();
    win.print();
  };

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      bgcolor: COLORS.formBg,
    }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <Box sx={{
        flexShrink: 0,
        bgcolor: COLORS.cream,
        borderBottom: `2px solid ${COLORS.accent}`,
        p: 2.5,
        px: 4,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 2,
      }}>
        {/* Title + clinic name */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <AssessmentIcon sx={{ color: COLORS.accent, fontSize: 28 }} />
          <Box>
            <Typography sx={{
              fontFamily: FONT,
              fontWeight: 900,
              color: COLORS.accent,
              textTransform: 'uppercase',
              letterSpacing: 1,
              fontSize: '1.5rem',
              lineHeight: 1,
            }}>
              Forensic Reports
            </Typography>
            <Typography sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted, mt: 0.25 }}>
              {clinicSettings.clinicName || 'Starbarks Veterinary Clinic'}
            </Typography>
          </Box>
        </Box>

        {/* Right side: date picker + actions row */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
            onGenerate={handleGenerate}
            loading={loading}
          />
          {/* Count badge + Export button side-by-side */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {data && (
              <Chip
                label={`Analyzing ${data.totalCount} appointment${data.totalCount !== 1 ? 's' : ''}`}
                size="small"
                sx={{
                  fontFamily: FONT,
                  fontWeight: 900,
                  fontSize: '0.65rem',
                  bgcolor: COLORS.kpiBlueBg,
                  border: `1.5px solid ${COLORS.kpiBlueBorder}`,
                  borderRadius: 0,
                  color: COLORS.info,
                  height: 22,
                }}
              />
            )}
            {/* Export button — disabled until a report has been generated */}
            <Button
              onClick={handleExport}
              disabled={!data}
              startIcon={<PrintIcon sx={{ fontSize: '0.9rem !important' }} />}
              size="small"
              sx={{
                fontFamily: FONT,
                fontWeight: 900,
                fontSize: '0.65rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                borderRadius: 0,
                border: `2px solid ${data ? COLORS.accent : COLORS.border}`,
                bgcolor: COLORS.cream,
                color: data ? COLORS.accent : COLORS.textMuted,
                boxShadow: data ? `3px 3px 0px ${COLORS.accent}` : 'none',
                px: 1.5,
                py: 0.5,
                minWidth: 'auto',
                height: 28,
                '&:hover': {
                  bgcolor: data ? COLORS.accent : COLORS.cream,
                  color: data ? COLORS.cream : COLORS.textMuted,
                  boxShadow: 'none',
                  transform: data ? 'translate(3px, 3px)' : 'none',
                },
                '&:disabled': {
                  cursor: 'not-allowed',
                  border: `2px solid ${COLORS.border}`,
                  boxShadow: 'none',
                  bgcolor: COLORS.surface,
                  color: COLORS.textMuted,
                },
                transition: 'all 0.08s ease',
              }}
            >
              Export Report
            </Button>
          </Box>
        </Box>
      </Box>

      {/* ── TAB BAR ──────────────────────────────────────────────── */}
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
          {TABS.map(tab => (
            <Tab
              key={tab.key}
              label={tab.label}
              icon={tab.icon}
              iconPosition="start"
            />
          ))}
        </Tabs>
      </Box>

      {/* ── TRUNCATION WARNING BANNER ─────────────────────────────── */}
      {truncated && (
        <Box sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 4,
          py: 1,
          bgcolor: COLORS.warningSurface,
          borderBottom: `2px solid ${COLORS.warning}`,
        }}>
          <WarningAmberIcon sx={{ fontSize: 18, color: COLORS.warning, flexShrink: 0 }} />
          <Typography sx={{ fontFamily: FONT, ...TYPE.meta, fontWeight: 700, color: COLORS.warning }}>
            Results truncated at 500 records.
            {truncatedEndDate
              ? ` Only showing ${startDate} through ${truncatedEndDate}.`
              : ''}{' '}
            Narrow your date range for complete data.
          </Typography>
        </Box>
      )}

      {/* ── ERROR BANNER ─────────────────────────────────────────── */}
      {error && (
        <Box sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 4,
          py: 1,
          bgcolor: COLORS.kpiRedBg,
          borderBottom: `2px solid ${COLORS.danger}`,
        }}>
          <WarningAmberIcon sx={{ fontSize: 18, color: COLORS.danger, flexShrink: 0 }} />
          <Typography sx={{ fontFamily: FONT, ...TYPE.meta, fontWeight: 700, color: COLORS.danger }}>
            {error}
          </Typography>
        </Box>
      )}

      {/* ── TAB CONTENT ──────────────────────────────────────────── */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3 }}>
        {loading ? (
          <LoadingSkeleton />
        ) : !data ? (
          <EmptyState />
        ) : (
          <>
            {activeTab === 0 && <ConsultPerformanceTab data={data} />}
            {activeTab === 1 && <AuditIntegrityTab data={data} />}
            {activeTab === 2 && <StaffWorkloadTab data={data} />}
          </>
        )}
      </Box>

    </Box>
  );
}
