/**
 * OptionJDashboard — Single-layout dashboard with a global time-range selector.
 *
 * Replaces the previous 4-tab Today/Analytics/Financial/Performance layout.
 * Mental model: action banners are always-on (real-time TODOs);
 * everything else is scoped to the selected time range.
 *
 * Composed of five zones:
 *   1. Time Range Bar  — chip row + Compare-vs-previous toggle
 *   2. Performance     — 4 headline KPIs with sparklines
 *   3. Patterns        — 3 ranked top-5 lists (services, breeds, diagnoses)
 *   4. Trends          — revenue line chart with auto-granularity
 *   5. Distribution    — payment methods + species mix (stacked bars)
 *
 * Receives pre-computed `data` from useDashboardData; purely presentational.
 */

import React from 'react';
import { Box, Typography, Chip, Stack, IconButton, Button } from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  Area, AreaChart, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import EventIcon from '@mui/icons-material/Event';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import VaccinesIcon from '@mui/icons-material/Vaccines';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import PetsIcon from '@mui/icons-material/Pets';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PaymentIcon from '@mui/icons-material/Payment';
import CategoryIcon from '@mui/icons-material/Category';
import MedicationIcon from '@mui/icons-material/Medication';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import KPICard from './KPICard';

// ─── Helpers ─────────────────────────────────────────────────────

const formatPHP = (n) =>
  `₱${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatPHPShort = (n) => {
  const num = n || 0;
  if (num >= 1000000) return `₱${(num / 1000000).toFixed(1)}M`;
  if (num >= 10000) return `₱${(num / 1000).toFixed(0)}k`;
  return formatPHP(num);
};

// Convert {label, count|amount}[] → [{value}] for KPICard sparklines.
const toSparkline = (trend, field = 'count') => {
  if (!Array.isArray(trend) || trend.length < 2) return null;
  return trend.map((p) => ({ value: Number(p[field]) || 0 }));
};

// Returns a human label for "the period currently being viewed", e.g.
// "Today" / "Yesterday" / "May 6 – May 12" / "April 2026" / "Q2 2026" / "2025".
function formatPeriodLabel(period, offset) {
  const now = new Date();
  const anchor = new Date(now);
  switch (period) {
    case 'today':   anchor.setDate(anchor.getDate() + offset); break;
    case 'week':    anchor.setDate(anchor.getDate() + offset * 7); break;
    case 'month':   anchor.setMonth(anchor.getMonth() + offset); break;
    case 'quarter': anchor.setMonth(anchor.getMonth() + offset * 3); break;
    case 'year':    anchor.setFullYear(anchor.getFullYear() + offset); break;
    default: break;
  }

  switch (period) {
    case 'today': {
      if (offset === 0) return 'Today';
      if (offset === -1) return 'Yesterday';
      return anchor.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    case 'week': {
      const weekStart = new Date(anchor);
      weekStart.setDate(anchor.getDate() - 6);
      const s = weekStart.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
      const e = anchor.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
      return offset === 0 ? `This Week (${s} – ${e})` : `${s} – ${e}`;
    }
    case 'month': {
      const label = anchor.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
      return offset === 0 ? `${label} (current)` : label;
    }
    case 'quarter': {
      const q = Math.floor(anchor.getMonth() / 3) + 1;
      const y = anchor.getFullYear();
      return offset === 0 ? `Q${q} ${y} (current)` : `Q${q} ${y}`;
    }
    case 'year': {
      const y = anchor.getFullYear();
      return offset === 0 ? `${y} (current)` : `${y}`;
    }
    default:
      return '';
  }
}

// ─── Time Range Bar ─────────────────────────────────────────────

const PERIODS = [
  { key: 'today',   label: 'Today' },
  { key: 'week',    label: 'This Week' },
  { key: 'month',   label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year',    label: 'This Year' },
];

function TimeRangeBar({
  period,
  onChangePeriod,
  periodOffset,
  onChangePeriodOffset,
  compareEnabled,
  onToggleCompare,
}) {
  const periodLabel = formatPeriodLabel(period, periodOffset);
  const isAtCurrent = periodOffset === 0;
  const canGoForward = periodOffset < 0; // Don't navigate into the future

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        bgcolor: COLORS.cardBg,
        border: `2px solid ${COLORS.brand}`,
        boxShadow: '4px 4px 0px rgba(62, 39, 35, 0.18)',
        px: 2.5,
        py: 1.5,
        mb: 3,
      }}
    >
      {/* Row 1 — chip selector + compare toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography
          sx={{
            ...TYPE.label,
            fontFamily: FONT,
            color: COLORS.textSecondary,
            fontSize: '0.7rem',
          }}
        >
          Time Range
        </Typography>

        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', flex: 1 }}>
          {PERIODS.map((p) => {
            const isActive = period === p.key;
            return (
              <Chip
                key={p.key}
                label={p.label}
                size="small"
                onClick={() => onChangePeriod(p.key)}
                sx={{
                  fontFamily: FONT,
                  ...TYPE.label,
                  fontSize: '0.7rem',
                  borderRadius: 0,
                  border: `2px solid ${isActive ? COLORS.brand : COLORS.border}`,
                  bgcolor: isActive ? COLORS.cream : COLORS.cardBg,
                  color: isActive ? COLORS.brand : COLORS.textSecondary,
                  fontWeight: isActive ? 900 : 700,
                  boxShadow: isActive ? `2px 2px 0px ${COLORS.brand}` : 'none',
                  px: 0.5,
                  '&:hover': {
                    bgcolor: COLORS.cream,
                    border: `2px solid ${COLORS.brand}`,
                  },
                  '& .MuiChip-label': { px: 1.25 },
                }}
              />
            );
          })}
        </Box>

        <Chip
          icon={<CompareArrowsIcon sx={{ fontSize: '14px !important' }} />}
          label={compareEnabled ? 'Compare: ON' : 'Compare vs previous'}
          size="small"
          onClick={onToggleCompare}
          sx={{
            fontFamily: FONT,
            ...TYPE.label,
            fontSize: '0.7rem',
            borderRadius: 0,
            border: `2px solid ${compareEnabled ? COLORS.info : COLORS.border}`,
            bgcolor: compareEnabled ? COLORS.kpiBlueBg : COLORS.cardBg,
            color: compareEnabled ? COLORS.info : COLORS.textSecondary,
            fontWeight: compareEnabled ? 900 : 700,
            boxShadow: compareEnabled ? `2px 2px 0px ${COLORS.info}` : 'none',
            cursor: 'pointer',
            '& .MuiChip-icon': {
              color: compareEnabled ? COLORS.info : COLORS.textMuted,
            },
            '& .MuiChip-label': { px: 1 },
          }}
        />
      </Box>

      {/* Row 2 — period navigation arrows + active period label + back-to-current */}
      <Box
        sx={{
          mt: 1.25,
          pt: 1.25,
          borderTop: `1px dashed ${COLORS.borderLight}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <IconButton
          size="small"
          onClick={() => onChangePeriodOffset(periodOffset - 1)}
          aria-label="Previous period"
          sx={{
            border: `2px solid ${COLORS.brand}`,
            borderRadius: 0,
            color: COLORS.brand,
            p: 0.25,
            '&:hover': { bgcolor: COLORS.cream },
          }}
        >
          <ChevronLeftIcon fontSize="small" />
        </IconButton>

        <Typography
          sx={{
            fontFamily: FONT,
            fontWeight: 900,
            color: COLORS.brand,
            fontSize: '0.85rem',
            minWidth: 200,
            textAlign: 'center',
          }}
        >
          {periodLabel}
        </Typography>

        <IconButton
          size="small"
          onClick={() => onChangePeriodOffset(periodOffset + 1)}
          disabled={!canGoForward}
          aria-label="Next period"
          sx={{
            border: `2px solid ${canGoForward ? COLORS.brand : COLORS.border}`,
            borderRadius: 0,
            color: canGoForward ? COLORS.brand : COLORS.textMuted,
            p: 0.25,
            '&:hover': { bgcolor: COLORS.cream },
            '&.Mui-disabled': { borderColor: COLORS.border },
          }}
        >
          <ChevronRightIcon fontSize="small" />
        </IconButton>

        {!isAtCurrent && (
          <Button
            size="small"
            startIcon={<RestartAltIcon sx={{ fontSize: '14px !important' }} />}
            onClick={() => onChangePeriodOffset(0)}
            sx={{
              fontFamily: FONT,
              ...TYPE.label,
              fontSize: '0.65rem',
              borderRadius: 0,
              border: `2px solid ${COLORS.accent}`,
              color: COLORS.accent,
              bgcolor: COLORS.cardBg,
              ml: 1,
              px: 1.25,
              py: 0.25,
              '&:hover': { bgcolor: COLORS.cream },
            }}
          >
            Back to current
          </Button>
        )}
      </Box>
    </Box>
  );
}

// ─── Section Header ─────────────────────────────────────────────

function SectionHeader({ icon, label }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, mt: 0.5 }}>
      {icon && React.cloneElement(icon, { sx: { fontSize: 18, color: COLORS.accent } })}
      <Typography
        sx={{
          ...TYPE.label,
          fontFamily: FONT,
          color: COLORS.accent,
          fontSize: '0.8rem',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: 2, bgcolor: COLORS.borderLight, ml: 1 }} />
    </Box>
  );
}

// ─── Radar Alerts (Leakage Detector) ────────────────────────────

function RadarAlerts({ data }) {
  const { financial } = data;
  if (!financial?.leakageCount || financial.leakageCount === 0) return null;

  return (
    <Box
      sx={{
        mb: 3,
        p: 2,
        bgcolor: COLORS.kpiRedBg,
        border: `2px solid ${COLORS.danger}`,
        boxShadow: `4px 4px 0px ${COLORS.danger}`,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          bgcolor: COLORS.danger,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <TrendingUpIcon sx={{ fontSize: 28, transform: 'rotate(180deg)' }} />
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.danger, fontSize: '0.9rem', lineHeight: 1.2 }}>
          REVENUE LEAKAGE DETECTED
        </Typography>
        <Typography sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textPrimary, fontSize: '0.75rem', mt: 0.25 }}>
          There are <strong>{financial.leakageCount} unbilled completed appointments</strong> in this period. 
          Estimated missing revenue: <strong>{formatPHP(financial.leakageEstimatedAmount)}</strong>.
        </Typography>
      </Box>
      <Button
        size="small"
        sx={{
          fontFamily: FONT,
          ...TYPE.label,
          fontSize: '0.65rem',
          bgcolor: COLORS.danger,
          color: '#fff',
          borderRadius: 0,
          px: 2,
          '&:hover': { bgcolor: '#b71c1c' },
        }}
      >
        VIEW UNBILLED
      </Button>
    </Box>
  );
}

// ─── Performance Zone (4 KPI cards) ─────────────────────────────

function PerformanceZone({ data, compareEnabled }) {
  const { financial, growth, clinical, deltas } = data;

  const revenueSparkline = toSparkline(financial?.revenueTrend, 'amount');
  const appointmentSparkline = toSparkline(growth?.appointmentTrend, 'count');
  const clientSparkline = toSparkline(growth?.clientTrend, 'count');

  // Deltas only shown when compare toggle is on.
  // The hook returns deltas as raw numbers (or null when prev was 0), not objects.
  const revenueDelta = compareEnabled ? (deltas?.revenue ?? null) : null;
  const appointmentsDelta = compareEnabled ? (deltas?.appointments ?? null) : null;
  // The hook exposes uniqueClients delta — closest proxy to "client activity" change.
  const clientsDelta = compareEnabled ? (deltas?.uniqueClients ?? null) : null;

  return (
    <Box sx={{ mb: 4 }}>
      <SectionHeader icon={<TrendingUpIcon />} label="PERFORMANCE" />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KPICard
            title="REVENUE"
            value={formatPHP(financial?.totalCollected || 0)}
            icon={<AttachMoneyIcon />}
            variant="brand"
            iconAccent={COLORS.success}
            subtitle={`${financial?.transactionCount || 0} transactions`}
            delta={revenueDelta}
            sparkline={revenueSparkline}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KPICard
            title="APPOINTMENTS"
            value={growth?.totalAppointments || 0}
            icon={<EventIcon />}
            variant="brand"
            iconAccent={COLORS.info}
            subtitle={`${growth?.walkInCount || 0} walk-in, ${growth?.scheduledCount || 0} scheduled`}
            delta={appointmentsDelta}
            sparkline={appointmentSparkline}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KPICard
            title="NEW CLIENTS"
            value={growth?.newClientCount || 0}
            icon={<PersonAddIcon />}
            variant="brand"
            iconAccent={COLORS.kpiPurpleText}
            subtitle={`${growth?.totalActiveClients || 0} total active`}
            delta={clientsDelta}
            sparkline={clientSparkline}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KPICard
            title="VACCINE COMPLIANCE"
            value={`${clinical?.complianceRate ?? 0}%`}
            icon={<VaccinesIcon />}
            variant="brand"
            iconAccent={clinical?.overdueCount > 0 ? COLORS.warning : COLORS.success}
            subtitle={
              clinical?.overdueCount > 0
                ? `${clinical.petsWithOverdue} pet(s) with overdue vaccines`
                : 'All active pets up to date'
            }
          />
        </Grid>
      </Grid>
    </Box>
  );
}

// ─── Ranked List (used inside Patterns zone) ────────────────────

function RankedList({ title, items, emptyMessage, valueFormatter, secondaryFormatter, icon }) {
  if (!items || items.length === 0) {
    return (
      <Box
        sx={{
          bgcolor: COLORS.cardBg,
          border: `2px solid ${COLORS.border}`,
          p: 2,
          height: '100%',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          {icon && React.cloneElement(icon, { sx: { fontSize: 16, color: COLORS.accent } })}
          <Typography sx={{ ...TYPE.label, fontFamily: FONT, color: COLORS.accent }}>
            {title}
          </Typography>
        </Box>
        <Typography
          sx={{
            ...TYPE.meta,
            fontFamily: FONT,
            color: COLORS.textMuted,
            fontStyle: 'italic',
            textAlign: 'center',
            py: 3,
          }}
        >
          {emptyMessage || 'No data yet for this period.'}
        </Typography>
      </Box>
    );
  }

  const top10 = items.slice(0, 10);
  const maxValue = Math.max(...top10.map((i) => i.value));

  return (
    <Box
      sx={{
        bgcolor: COLORS.cardBg,
        border: `2px solid ${COLORS.brand}`,
        boxShadow: '4px 4px 0px rgba(62, 39, 35, 0.18)',
        p: 2,
        height: '100%',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        {icon && React.cloneElement(icon, { sx: { fontSize: 16, color: COLORS.brand } })}
        <Typography sx={{ ...TYPE.label, fontFamily: FONT, color: COLORS.brand }}>
          {title}
        </Typography>
      </Box>
 
      <Stack spacing={1.25}>
        {top10.map((item, idx) => {
          const widthPct = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
          return (
            <Box key={`${item.name}-${idx}`}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
                <Typography
                  sx={{
                    fontFamily: FONT,
                    fontWeight: 700,
                    color: COLORS.textPrimary,
                    fontSize: '0.85rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    mr: 1,
                  }}
                >
                  {idx + 1}. {item.name}
                </Typography>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography
                    sx={{
                      fontFamily: FONT,
                      fontWeight: 900,
                      color: COLORS.brand,
                      fontSize: '0.85rem',
                      lineHeight: 1,
                    }}
                  >
                    {valueFormatter ? valueFormatter(item.value) : item.value}
                  </Typography>
                  {item.secondaryValue !== undefined && (
                    <Typography
                      sx={{
                        fontFamily: FONT,
                        fontSize: '0.75rem',
                        color: COLORS.brand,
                        fontWeight: 900,
                        mt: 0.25,
                      }}
                    >
                      {secondaryFormatter ? secondaryFormatter(item.secondaryValue) : item.secondaryValue}
                    </Typography>
                  )}
                </Box>
              </Box>
              <Box sx={{ height: 6, bgcolor: COLORS.borderLight, position: 'relative' }}>
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    width: `${widthPct}%`,
                    bgcolor: COLORS.accent,
                  }}
                />
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

// ─── Patterns Zone ──────────────────────────────────────────────

function PatternsZone({ data }) {
  const { growth, clinical, financial } = data;

  // T4.184: Dual-metric Service Ranking (Revenue + Volume)
  const topServices = (financial?.revenueByService || []).map((s) => ({
    name: s.name || 'Unknown',
    value: s.count || 0,
    secondaryValue: s.amount || 0,
  }));

  // Top prescribed medications (medically filtered)
  const topPrescribed = (clinical?.topPrescribed || []).map((rx) => ({
    name: rx.name || 'Unknown',
    value: rx.qty || 0,
  }));

  // T4.184: Dual-metric Product Ranking (Revenue + Volume)
  const topSoldProducts = (financial?.topSoldProducts || []).map((p) => ({
    name: p.name || 'Unknown',
    value: p.count || 0,
    secondaryValue: p.amount || 0,
  }));

  // Top breeds from growth.topBreeds
  const topBreeds = (growth?.topBreeds || []).map((b) => ({
    name: b.breed || b.name || 'Unknown',
    value: b.count || b.value || 0,
  }));

  // Top diagnoses from clinical.topDiagnoses
  const topDiagnoses = (clinical?.topDiagnoses || []).map((d) => ({
    name: d.diagnosis || d.name || 'Unknown',
    value: d.count || d.value || 0,
  }));

  // T4.183: Top spending clients (VIP tracking)
  const topClients = (financial?.topSpendingClients || []).map((c) => ({
    name: c.name || 'Unknown',
    value: c.amount || 0,
  }));

  return (
    <Box sx={{ mb: 4 }}>
      <SectionHeader icon={<CategoryIcon />} label="PATTERNS" />

      {/* Unified Grid Container for perfect wrapping on all screen sizes */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <RankedList
            title="TOP SERVICES"
            items={topServices}
            icon={<MedicalServicesIcon />}
            emptyMessage="No services booked yet."
            secondaryFormatter={formatPHPShort}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <RankedList
            title="TOP PRESCRIBED"
            items={topPrescribed}
            icon={<MedicationIcon />}
            emptyMessage="No medications dispensed yet."
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <RankedList
            title="TOP SOLD PRODUCTS"
            items={topSoldProducts}
            icon={<ShoppingCartIcon />}
            emptyMessage="No products sold yet."
            secondaryFormatter={formatPHPShort}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <RankedList
            title="TOP BREEDS"
            items={topBreeds}
            icon={<PetsIcon />}
            emptyMessage="No pets seen yet."
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <RankedList
            title="TOP DIAGNOSES"
            items={topDiagnoses}
            icon={<LocalHospitalIcon />}
            emptyMessage="No medical records signed."
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <RankedList
            title="TOP SPENDERS"
            items={topClients}
            icon={<EmojiEventsIcon />}
            emptyMessage="No transactions yet."
            valueFormatter={formatPHPShort}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

// ─── Trends Zone (revenue trend chart) ──────────────────────────

function TrendsZone({ data, period }) {
  const { financial } = data;
  const trend = financial?.revenueTrend || [];

  const chartData = trend.map((p) => ({
    label: p.label,
    amount: Number(p.amount) || 0,
  }));

  const granularityLabel = {
    today: 'Hourly',
    week: 'Daily',
    month: 'Daily',
    quarter: 'Weekly',
    year: 'Monthly',
  }[period] || 'Per period';

  return (
    <Box sx={{ mb: 4 }}>
      <SectionHeader icon={<TrendingUpIcon />} label={`TRENDS — Revenue (${granularityLabel})`} />

      <Box
        sx={{
          bgcolor: COLORS.cardBg,
          border: `2px solid ${COLORS.brand}`,
          boxShadow: '4px 4px 0px rgba(62, 39, 35, 0.18)',
          p: 2,
          pt: 2.5,
          height: 280,
        }}
      >
        {chartData.length < 2 ? (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography
              sx={{
                ...TYPE.meta,
                fontFamily: FONT,
                color: COLORS.textMuted,
                fontStyle: 'italic',
              }}
            >
              Not enough data to show a trend yet for this period.
            </Typography>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={COLORS.accent} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderLight} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontFamily: FONT, fontSize: 11, fill: COLORS.textSecondary }}
                axisLine={{ stroke: COLORS.border }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatPHPShort}
                tick={{ fontFamily: FONT, fontSize: 11, fill: COLORS.textSecondary }}
                axisLine={{ stroke: COLORS.border }}
                tickLine={false}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  fontFamily: FONT,
                  borderRadius: 0,
                  border: `2px solid ${COLORS.brand}`,
                  background: COLORS.cardBg,
                }}
                labelStyle={{ fontWeight: 900, color: COLORS.brand }}
                formatter={(value) => [formatPHP(value), 'Revenue']}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke={COLORS.brand}
                strokeWidth={2.5}
                fill="url(#revenueGradient)"
                dot={{ fill: COLORS.brand, r: 3 }}
                activeDot={{ r: 5, fill: COLORS.brand }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Box>
  );
}

// ─── Stacked Bar (used inside Distribution zone) ────────────────

function StackedDistributionBar({ title, data, icon, palette, formatter }) {
  const entries = Object.entries(data || {})
    .map(([k, v]) => ({ key: k, value: Number(v) || 0 }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = entries.reduce((sum, e) => sum + e.value, 0);

  return (
    <Box
      sx={{
        bgcolor: COLORS.cardBg,
        border: `2px solid ${COLORS.brand}`,
        boxShadow: '4px 4px 0px rgba(62, 39, 35, 0.18)',
        p: 2,
        height: '100%',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        {icon && React.cloneElement(icon, { sx: { fontSize: 16, color: COLORS.brand } })}
        <Typography sx={{ ...TYPE.label, fontFamily: FONT, color: COLORS.brand }}>
          {title}
        </Typography>
      </Box>

      {entries.length === 0 ? (
        <Typography
          sx={{
            ...TYPE.meta,
            fontFamily: FONT,
            color: COLORS.textMuted,
            fontStyle: 'italic',
            textAlign: 'center',
            py: 3,
          }}
        >
          No data yet for this period.
        </Typography>
      ) : (
        <>
          {/* Single stacked horizontal bar */}
          <Box sx={{ display: 'flex', height: 32, mb: 2, border: `2px solid ${COLORS.brand}` }}>
            {entries.map((e, idx) => {
              const widthPct = (e.value / total) * 100;
              
              // T4.182: Unified forensic colors for payment methods
              const colorMap = {
                'Cash': COLORS.success,
                'GCash': COLORS.medical,
                'Maya': COLORS.medical,
                'GCash / Maya': COLORS.medical,
                'Card': COLORS.amber,
                'Bank Transfer': '#E91E63',
              };
              const color = colorMap[e.key] || palette[idx % palette.length];

              return (
                <Box
                  key={e.key}
                  sx={{
                    width: `${widthPct}%`,
                    bgcolor: color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontFamily: FONT,
                    fontWeight: 900,
                    fontSize: '0.7rem',
                    borderRight: idx < entries.length - 1 ? `1px solid #fff3` : 'none',
                  }}
                  title={`${e.key}: ${formatter ? formatter(e.value) : e.value}`}
                >
                  {widthPct >= 12 ? `${Math.round(widthPct)}%` : ''}
                </Box>
              );
            })}
          </Box>

          {/* Legend */}
          <Stack spacing={0.5}>
            {entries.map((e, idx) => {
              // T4.182: Unified forensic colors for payment methods
              const colorMap = {
                'Cash': COLORS.success,
                'GCash': COLORS.medical,
                'Maya': COLORS.medical,
                'GCash / Maya': COLORS.medical,
                'Card': COLORS.amber,
                'Bank Transfer': '#E91E63',
              };
              const color = colorMap[e.key] || palette[idx % palette.length];

              return (
                <Box
                  key={e.key}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, fontFamily: FONT, fontSize: '0.78rem' }}
                >
                  <Box sx={{ 
                    width: 12, 
                    height: 12, 
                    bgcolor: color, 
                    flexShrink: 0,
                    border: `1px solid ${COLORS.brand}33`
                  }} />
                  <Typography sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textPrimary, fontSize: '0.78rem', flex: 1 }}>
                    {e.key}
                  </Typography>
                  <Typography sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, fontSize: '0.78rem' }}>
                    {formatter ? formatter(e.value) : e.value}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        </>
      )}
    </Box>
  );
}

// ─── Distribution Zone ──────────────────────────────────────────

function DistributionZone({ data }) {
  const { financial, growth } = data;

  // Starbarks brown-dominant palette — primary share is brand brown,
  // remaining shares step through accent variations + one muted accent.
  const paymentPalette = [
    COLORS.brand,        // dark espresso (largest share)
    COLORS.accent,       // primary brown
    COLORS.accentLight,  // light brown
    COLORS.accentWarm,   // saddle brown
  ];

  const speciesPalette = [
    COLORS.brand,        // dark espresso (largest share)
    COLORS.accentLight,  // light brown
    COLORS.accentWarm,   // saddle brown
    COLORS.accent,
  ];

  return (
    <Box sx={{ mb: 2 }}>
      <SectionHeader icon={<CategoryIcon />} label="DISTRIBUTION" />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <StackedDistributionBar
            title="PAYMENT METHODS"
            data={financial?.paymentMethods}
            icon={<PaymentIcon />}
            palette={paymentPalette}
            formatter={formatPHP}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <StackedDistributionBar
            title="SPECIES MIX"
            data={growth?.speciesDistribution}
            icon={<PetsIcon />}
            palette={speciesPalette}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export default function OptionJDashboard({
  data,
  period,
  onChangePeriod,
  periodOffset,
  onChangePeriodOffset,
  compareEnabled,
  onToggleCompare,
}) {
  return (
    <Box>
      <TimeRangeBar
        period={period}
        onChangePeriod={onChangePeriod}
        periodOffset={periodOffset}
        onChangePeriodOffset={onChangePeriodOffset}
        compareEnabled={compareEnabled}
        onToggleCompare={onToggleCompare}
      />

      <RadarAlerts data={data} />
      <PerformanceZone data={data} compareEnabled={compareEnabled} />
      <PatternsZone data={data} />
      <TrendsZone data={data} period={period} />
      <DistributionZone data={data} />
    </Box>
  );
}
