/**
 * AuditIntegrityTab — Tab 2 of the Forensic Reports page.
 *
 * Thesis-critical section: proves the forensic audit system works at scale.
 * Renders 5 sections:
 *   Section 1 — Pulse Coverage KPIs (total analyzed, with pulse, missing pulse)
 *   Section 2 — Seal Coverage KPIs (terminal records, with seal, seal gap)
 *   Section 3 — Seal Coverage HorizontalBar (sealed vs unsealed)
 *   Section 4 — Corrections & Reversals (KPIs + scrollable correction event log)
 *   Section 5 — Pulse Event Type Distribution (recharts BarChart)
 *
 * @param {{ audit: object, totalCount: number }} props.data — from useForensicReportData
 */

import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { Box, Grid, Typography } from '@mui/material';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import DataUsageIcon from '@mui/icons-material/DataUsage';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HistoryIcon from '@mui/icons-material/History';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import BarChartIcon from '@mui/icons-material/BarChart';
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import KPICard from '../../Dashboard/components/KPICard';
import HorizontalBar from '../../Dashboard/components/HorizontalBar';

// ── Helpers ─────────────────────────────────────────────────────

/** Custom recharts tooltip matching the neubrutalism design language. */
function NeuTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{
      bgcolor: COLORS.cream,
      border: `2px solid ${COLORS.accent}`,
      borderRadius: 0,
      boxShadow: `3px 3px 0px ${COLORS.accent}`,
      p: 1.5,
    }}>
      <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 0.5 }}>
        {label}
      </Typography>
      {payload.map((p, i) => (
        <Typography key={i} sx={{ fontFamily: FONT, ...TYPE.meta, color: p.color }}>
          {p.name}: {p.value}
        </Typography>
      ))}
    </Box>
  );
}

/** Section header — uppercase, heavy weight, Espresso color. */
function SectionHeader({ icon, children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      {icon && (
        <Box sx={{ color: COLORS.accent, display: 'flex', alignItems: 'center' }}>
          {icon}
        </Box>
      )}
      <Typography sx={{
        fontFamily: FONT,
        ...TYPE.label,
        fontWeight: 900,
        color: COLORS.accent,
        fontSize: '0.75rem',
        letterSpacing: '0.1em',
      }}>
        {children}
      </Typography>
    </Box>
  );
}

/** Thin horizontal divider between sections. */
function RowDivider() {
  return <Box sx={{ height: 2, bgcolor: COLORS.borderLight, my: 3 }} />;
}

/**
 * Formats a Firestore Timestamp or JS Date for display in the correction log.
 * Returns a compact "Jan 15, 2025 02:34 PM" string.
 */
function formatEventTimestamp(ts) {
  if (!ts) return '—';
  try {
    const date = ts?.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Manila',
    });
  } catch {
    return '—';
  }
}

/** Renders a single row in the correction event log. */
function CorrectionRow({ event, isEven }) {
  const fromTo = `${event.fromStatus || '?'} → ${event.toStatus || '?'}`;
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: '180px 140px 180px 1fr',
      px: 2,
      py: 1,
      bgcolor: isEven ? COLORS.cardBg : COLORS.surface,
      borderTop: `1px solid ${COLORS.borderLight}`,
      alignItems: 'start',
      gap: 1,
    }}>
      <Typography sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted }}>
        {formatEventTimestamp(event.timestamp)}
      </Typography>
      <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary, fontSize: '0.8rem' }}>
        {event.staffName || event.staffId || 'Unknown'}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{
          fontFamily: FONT,
          ...TYPE.tiny,
          px: 0.75,
          py: 0.25,
          bgcolor: COLORS.kpiOrangeBg,
          border: `1px solid ${COLORS.kpiOrangeBorder}`,
          borderRadius: 0,
          color: COLORS.warning,
          fontWeight: 800,
          whiteSpace: 'nowrap',
        }}>
          {fromTo}
        </Typography>
      </Box>
      <Typography sx={{
        fontFamily: FONT,
        ...TYPE.meta,
        color: COLORS.textSecondary,
        fontSize: '0.78rem',
        lineHeight: 1.4,
      }}>
        {event.note || event.petName ? (
          <>
            {event.note && <span>{event.note}</span>}
            {event.petName && (
              <Typography component="span" sx={{
                fontFamily: FONT,
                fontSize: '0.7rem',
                color: COLORS.textMuted,
                ml: 0.5,
              }}>
                ({event.petName})
              </Typography>
            )}
          </>
        ) : (
          <Typography component="span" sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted, fontStyle: 'italic' }}>
            No reason recorded
          </Typography>
        )}
      </Typography>
    </Box>
  );
}

// ── Empty state for zero-result reports ────────────────────────

function TabEmptyState() {
  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      py: 10,
      gap: 1.5,
    }}>
      <VerifiedUserIcon sx={{ fontSize: 48, color: COLORS.border }} />
      <Typography sx={{
        fontFamily: FONT,
        fontWeight: 900,
        fontSize: '1rem',
        color: COLORS.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        No Audit Data Found
      </Typography>
      <Typography sx={{
        fontFamily: FONT,
        ...TYPE.meta,
        color: COLORS.textMuted,
        textAlign: 'center',
        maxWidth: 380,
      }}>
        No appointments were found for this date range. Try expanding the range
        or selecting a period with known clinic activity.
      </Typography>
    </Box>
  );
}

// ── Component ────────────────────────────────────────────────────

export default function AuditIntegrityTab({ data }) {
  // Defensive defaults — all hooks must run before any early return
  const isEmpty    = !data?.audit || data.totalCount === 0;
  const audit      = data?.audit ?? {};
  const totalCount = data?.totalCount ?? 0;

  const {
    withPulse       = 0,
    withoutPulse    = 0,
    withSeal        = 0,
    withoutSeal     = 0,
    terminalCount   = 0,
    correctionCount = 0,
    correctionEvents  = [],
    terminalReversals = [],
    eventTypeCounts   = {},
  } = audit;

  // Compute percentages for subtitle display
  const pulsePercent   = totalCount > 0 ? Math.round((withPulse   / totalCount)   * 100) : 0;
  const missingPercent = totalCount > 0 ? Math.round((withoutPulse / totalCount)   * 100) : 0;
  const sealPercent    = terminalCount > 0 ? Math.round((withSeal   / terminalCount) * 100) : 0;
  const sealGapPercent = terminalCount > 0 ? Math.round((withoutSeal / terminalCount) * 100) : 0;

  // Seal coverage bar segments
  const sealSegments = [
    { label: 'Sealed',   value: withSeal,   color: COLORS.success },
    { label: 'Unsealed', value: withoutSeal, color: COLORS.danger  },
  ];

  // Event type distribution chart — sort descending by count
  const eventTypeChartData = useMemo(() => {
    return Object.entries(eventTypeCounts)
      .map(([type, count]) => ({ name: type.replace(/_/g, ' '), rawType: type, count }))
      .sort((a, b) => b.count - a.count);
  }, [eventTypeCounts]);

  // Sort correction events newest-first
  const sortedCorrections = useMemo(() => {
    return [...correctionEvents].sort((a, b) => {
      const aMs = a.timestamp?.toDate?.()?.getTime?.() ?? 0;
      const bMs = b.timestamp?.toDate?.()?.getTime?.() ?? 0;
      return bMs - aMs;
    });
  }, [correctionEvents]);

  // Guard: show empty state after all hooks have run
  if (isEmpty) {
    return <TabEmptyState />;
  }

  return (
    <Box>

      {/* ── SECTION 1: Pulse Coverage KPIs ───────────────────────── */}
      <SectionHeader icon={<DataUsageIcon sx={{ fontSize: 16 }} />}>
        PULSE DATA COVERAGE
      </SectionHeader>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <KPICard
            title="APPOINTMENTS ANALYZED"
            value={totalCount.toLocaleString()}
            icon={<DataUsageIcon />}
            variant="blue"
            subtitle="Total records in date range"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <KPICard
            title="WITH PULSE DATA"
            value={withPulse.toLocaleString()}
            icon={<CheckCircleOutlineIcon />}
            variant="green"
            subtitle={`${pulsePercent}% coverage — forensic timeline active`}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <KPICard
            title="MISSING PULSE DATA"
            value={withoutPulse.toLocaleString()}
            icon={<ErrorOutlineIcon />}
            variant={withoutPulse > 0 ? 'red' : 'neutral'}
            subtitle={`${missingPercent}% — legacy records (pre-Phase 2)`}
          />
        </Grid>
      </Grid>

      <RowDivider />

      {/* ── SECTION 2: Seal Coverage KPIs ────────────────────────── */}
      <SectionHeader icon={<LockIcon sx={{ fontSize: 16 }} />}>
        FORENSIC SEAL COVERAGE
      </SectionHeader>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <KPICard
            title="TERMINAL RECORDS"
            value={terminalCount.toLocaleString()}
            icon={<VerifiedUserIcon />}
            variant="neutral"
            subtitle="Completed, cancelled, or no-show"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <KPICard
            title="WITH FORENSIC SEAL"
            value={withSeal.toLocaleString()}
            icon={<LockIcon />}
            variant="green"
            subtitle={`${sealPercent}% — metrics frozen at terminal state`}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <KPICard
            title="SEAL COVERAGE GAP"
            value={withoutSeal.toLocaleString()}
            icon={<LockOpenIcon />}
            variant={withoutSeal > 0 ? 'red' : 'neutral'}
            subtitle={`${sealGapPercent}% — unsealed terminal records (pre-T2.44)`}
          />
        </Grid>
      </Grid>

      {/* ── SECTION 3: Seal Coverage Bar ─────────────────────────── */}
      <Box sx={{ mt: 2 }}>
        <HorizontalBar segments={sealSegments} height={32} showLabels showLegend />
        <Typography sx={{
          fontFamily: FONT,
          ...TYPE.tiny,
          color: COLORS.textMuted,
          mt: 1,
          textAlign: 'center',
        }}>
          Percentage of resolved records with frozen forensic metrics
        </Typography>
      </Box>

      <RowDivider />

      {/* ── SECTION 4: Corrections & Reversals ───────────────────── */}
      <SectionHeader icon={<HistoryIcon sx={{ fontSize: 16 }} />}>
        CORRECTIONS &amp; REVERSALS
      </SectionHeader>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6}>
          <KPICard
            title="TOTAL CORRECTIONS"
            value={correctionCount.toLocaleString()}
            icon={<HistoryIcon />}
            variant={correctionCount > 0 ? 'orange' : 'neutral'}
            subtitle="CORRECTION events across all pulse arrays"
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <KPICard
            title="TERMINAL REVERSALS"
            value={terminalReversals.length.toLocaleString()}
            icon={<SwapHorizIcon />}
            variant={terminalReversals.length > 0 ? 'red' : 'neutral'}
            subtitle="Corrections applied to already-terminal records"
          />
        </Grid>
      </Grid>

      {/* Correction Event Log */}
      <Box sx={{
        border: `2px solid ${COLORS.accent}`,
        borderRadius: 0,
        boxShadow: `3px 3px 0px ${COLORS.accent}`,
        overflow: 'hidden',
      }}>
        {/* Table header */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: '180px 140px 180px 1fr',
          bgcolor: COLORS.accent,
          px: 2,
          py: 1,
          gap: 1,
        }}>
          {['TIMESTAMP', 'STAFF', 'FROM → TO', 'REASON / PATIENT'].map(col => (
            <Typography key={col} sx={{
              fontFamily: FONT,
              ...TYPE.label,
              color: COLORS.cream,
              fontSize: '0.62rem',
            }}>
              {col}
            </Typography>
          ))}
        </Box>

        {/* Scrollable body */}
        <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
          {sortedCorrections.length === 0 ? (
            <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
              <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textMuted }}>
                No corrections recorded in this period.
              </Typography>
            </Box>
          ) : (
            sortedCorrections.map((evt, i) => (
              <CorrectionRow key={evt.eventId || i} event={evt} isEven={i % 2 === 0} />
            ))
          )}
        </Box>
      </Box>

      <RowDivider />

      {/* ── SECTION 5: Pulse Event Type Distribution ─────────────── */}
      <SectionHeader icon={<BarChartIcon sx={{ fontSize: 16 }} />}>
        PULSE EVENT TYPE DISTRIBUTION
      </SectionHeader>
      <Box sx={{
        bgcolor: COLORS.cardBg,
        border: `2px solid ${COLORS.border}`,
        borderRadius: 0,
        boxShadow: `3px 3px 0px ${COLORS.border}`,
        p: 2.5,
      }}>
        {eventTypeChartData.length === 0 ? (
          <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textMuted, textAlign: 'center', py: 4 }}>
            No pulse events recorded in this period.
          </Typography>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, eventTypeChartData.length * 38)}>
            <BarChart
              layout="vertical"
              data={eventTypeChartData}
              margin={{ top: 5, right: 40, bottom: 5, left: 140 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderLight} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, fill: COLORS.textSecondary }}
                label={{ value: 'Event Count', position: 'insideBottom', offset: -2, fontFamily: FONT, fontSize: 11, fill: COLORS.textMuted }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={130}
                tick={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, fill: COLORS.textPrimary }}
              />
              <Tooltip content={<NeuTooltip />} />
              <Bar dataKey="count" name="Events" radius={0}>
                {eventTypeChartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.rawType === 'CORRECTION' ? COLORS.warning
                      : entry.rawType === 'STATUS_CHANGE' ? COLORS.medical
                      : entry.rawType === 'CHECKOUT_COMPLETED' ? COLORS.success
                      : COLORS.accentLight}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Box>

    </Box>
  );
}
