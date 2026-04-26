/**
 * ConsultPerformanceTab — Tab 1 of the Forensic Reports page.
 *
 * Renders 7 layout rows:
 *   Row 1 — 4 primary KPI cards (avg/median consult + avg/median queue)
 *   Row 2 — Duration distribution BarChart (5 buckets)
 *   Row 3 — Avg consult duration by vet (horizontal BarChart)
 *   Row 4 — Department performance (grouped bars: queue + consult)
 *   Row 5 — Top 10 services table
 *   Row 6 — Status transition matrix/heatmap (Step 3.4)
 *   Row 7 — Queue flow analysis: arrival-to-completion KPIs + distribution chart (Step 3.5)
 *
 * All design tokens imported from designTokens.js. borderRadius: 0 throughout.
 * Charts use recharts (already installed): BarChart, Bar, XAxis, YAxis,
 * CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell.
 *
 * @param {{ consult: object }} props.data — from useForensicReportData
 */

import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { Box, Grid, Typography } from '@mui/material';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import KPICard from '../../Dashboard/components/KPICard';
import { formatDuration } from '../../../utils/pulseUtils';

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Custom recharts tooltip styled with neubrutalism tokens.
 */
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

/** Section header typography. */
function SectionHeader({ children }) {
  return (
    <Typography sx={{
      fontFamily: FONT,
      ...TYPE.label,
      fontWeight: 900,
      color: COLORS.accent,
      mb: 1.5,
      fontSize: '0.75rem',
      letterSpacing: '0.1em',
    }}>
      {children}
    </Typography>
  );
}

/** Thin separator between rows. */
function RowDivider() {
  return <Box sx={{ height: 2, bgcolor: COLORS.borderLight, my: 3 }} />;
}

// ── Component ────────────────────────────────────────────────────

// ── Empty state for zero-result reports ────────────────────────

function TabEmptyState({ startDate, endDate }) {
  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      py: 10,
      gap: 1.5,
    }}>
      <QueryStatsIcon sx={{ fontSize: 48, color: COLORS.border }} />
      <Typography sx={{
        fontFamily: FONT,
        fontWeight: 900,
        fontSize: '1rem',
        color: COLORS.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        No Appointment Data Found
      </Typography>
      {(startDate || endDate) && (
        <Typography sx={{
          fontFamily: FONT,
          ...TYPE.meta,
          color: COLORS.textMuted,
          textAlign: 'center',
          maxWidth: 380,
        }}>
          No appointments were found for this date range. Try expanding the
          range or selecting a period with known clinic activity.
        </Typography>
      )}
    </Box>
  );
}

export default function ConsultPerformanceTab({ data }) {
  // Defensive defaults — hooks must always run in the same order
  const consult = data?.consult ?? {};
  const isEmpty = !data?.consult || data.totalCount === 0;

  const {
    avgConsultMins    = 0,
    medianConsultMins = 0,
    p90ConsultMins    = 0,
    avgQueueMins      = 0,
    medianQueueMins   = 0,
    distribution      = [],
    byVet             = [],
    byDept            = [],
    byService         = [],
    transitionMatrix  = {},
    queueToCompletion = {},
  } = consult;

  // Recharts expects simple name/value objects
  const vetChartData = byVet
    .filter(v => v.vetName !== 'Unassigned')
    .slice(0, 10)
    .map(v => ({ name: v.vetName.split(' ')[0], value: v.avgConsultMins }));

  const deptChartData = byDept.map(d => ({
    name: d.dept,
    'Avg Queue (min)':   d.avgQueueMins,
    'Avg Consult (min)': d.avgConsultMins,
  }));

  // ── Step 3.4: Status transition matrix ───────────────────────
  // Extract unique fromStatus and toStatus values from keys that actually
  // have transitions — used to size the heatmap grid.
  const { matrixRows, matrixCols, matrixMax } = useMemo(() => {
    const entries = Object.entries(transitionMatrix).filter(([, count]) => count > 0);
    if (!entries.length) return { matrixRows: [], matrixCols: [], matrixMax: 0 };

    const rowSet = new Set();
    const colSet = new Set();
    let max = 0;

    entries.forEach(([key, count]) => {
      const [from, to] = key.split('→');
      if (from) rowSet.add(from.trim());
      if (to)   colSet.add(to.trim());
      if (count > max) max = count;
    });

    return {
      matrixRows: [...rowSet],
      matrixCols: [...colSet],
      matrixMax:  max,
    };
  }, [transitionMatrix]);

  // ── Step 3.5: Queue flow analysis ────────────────────────────
  const q2c = queueToCompletion;
  const q2cChartData = q2c.distribution || [];

  // Guard: show empty state after all hooks have run
  if (isEmpty) {
    return <TabEmptyState />;
  }

  /**
   * Returns an rgb background for a heatmap cell based on its count
   * relative to the max count. White at 0, COLORS.medical at max.
   * COLORS.medical is #1565C0 (r=21, g=101, b=192).
   */
  function heatmapCellBg(count) {
    if (!count || !matrixMax) return 'transparent';
    const intensity = count / matrixMax;                    // 0..1
    const r = Math.round(21  + (255 - 21)  * (1 - intensity));
    const g = Math.round(101 + (255 - 101) * (1 - intensity));
    const b = Math.round(192 + (255 - 192) * (1 - intensity));
    return `rgb(${r},${g},${b})`;
  }

  return (
    <Box>

      {/* ── ROW 1: Primary KPIs ────────────────────────────────── */}
      <SectionHeader>CONSULT DURATION SUMMARY</SectionHeader>
      <Grid container spacing={2} sx={{ mb: 0 }}>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard
            title="AVG CONSULT DURATION"
            value={formatDuration(avgConsultMins)}
            icon={<AccessTimeIcon />}
            variant="blue"
            subtitle={`P90: ${formatDuration(p90ConsultMins)}`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard
            title="MEDIAN CONSULT"
            value={formatDuration(medianConsultMins)}
            icon={<TrendingFlatIcon />}
            variant="blue"
            subtitle="50th percentile"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard
            title="AVG QUEUE WAIT"
            value={formatDuration(avgQueueMins)}
            icon={<HourglassTopIcon />}
            variant="orange"
            subtitle="Time from arrival to consult start"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard
            title="MEDIAN QUEUE WAIT"
            value={formatDuration(medianQueueMins)}
            icon={<QueryStatsIcon />}
            variant="orange"
            subtitle="50th percentile"
          />
        </Grid>
      </Grid>

      <RowDivider />

      {/* ── ROW 2: Duration Distribution ──────────────────────── */}
      <SectionHeader>CONSULT DURATION DISTRIBUTION</SectionHeader>
      <Box sx={{
        bgcolor: COLORS.cardBg,
        border: `2px solid ${COLORS.border}`,
        borderRadius: 0,
        boxShadow: `3px 3px 0px ${COLORS.border}`,
        p: 2.5,
        mb: 0,
      }}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={distribution} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderLight} />
            <XAxis
              dataKey="label"
              tick={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, fill: COLORS.textSecondary }}
            />
            <YAxis
              tick={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, fill: COLORS.textSecondary }}
              allowDecimals={false}
              label={{ value: 'Appointments', angle: -90, position: 'insideLeft', fontFamily: FONT, fontSize: 11, fill: COLORS.textMuted }}
            />
            <Tooltip content={<NeuTooltip />} />
            <Bar dataKey="count" name="Appointments" fill={COLORS.medical} radius={0}>
              {distribution.map((_, i) => (
                <Cell key={i} fill={COLORS.medical} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>

      <RowDivider />

      {/* ── ROW 3: By Vet ─────────────────────────────────────── */}
      <SectionHeader>AVG CONSULT DURATION BY VET</SectionHeader>
      <Box sx={{
        bgcolor: COLORS.cardBg,
        border: `2px solid ${COLORS.border}`,
        borderRadius: 0,
        boxShadow: `3px 3px 0px ${COLORS.border}`,
        p: 2.5,
        mb: 0,
      }}>
        {vetChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(180, vetChartData.length * 40)}>
            <BarChart
              layout="vertical"
              data={vetChartData}
              margin={{ top: 5, right: 30, bottom: 5, left: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderLight} />
              <XAxis
                type="number"
                tick={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, fill: COLORS.textSecondary }}
                label={{ value: 'Minutes', position: 'insideBottom', offset: -2, fontFamily: FONT, fontSize: 11, fill: COLORS.textMuted }}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, fill: COLORS.textPrimary }}
                width={55}
              />
              <Tooltip content={<NeuTooltip />} />
              <Bar dataKey="value" name="Avg Consult (min)" fill={COLORS.accent} radius={0} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textMuted, textAlign: 'center', py: 4 }}>
            No vet assignment data available for this period.
          </Typography>
        )}
      </Box>

      <RowDivider />

      {/* ── ROW 4: By Department ──────────────────────────────── */}
      <SectionHeader>DEPARTMENT PERFORMANCE</SectionHeader>
      <Box sx={{
        bgcolor: COLORS.cardBg,
        border: `2px solid ${COLORS.border}`,
        borderRadius: 0,
        boxShadow: `3px 3px 0px ${COLORS.border}`,
        p: 2.5,
        mb: 0,
      }}>
        {deptChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deptChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderLight} />
              <XAxis
                dataKey="name"
                tick={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, fill: COLORS.textSecondary }}
              />
              <YAxis
                tick={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, fill: COLORS.textSecondary }}
                allowDecimals={false}
                label={{ value: 'Minutes', angle: -90, position: 'insideLeft', fontFamily: FONT, fontSize: 11, fill: COLORS.textMuted }}
              />
              <Tooltip content={<NeuTooltip />} />
              <Legend
                wrapperStyle={{ fontFamily: FONT, fontSize: 11, fontWeight: 700 }}
              />
              <Bar dataKey="Avg Queue (min)"   fill={COLORS.warning} radius={0} />
              <Bar dataKey="Avg Consult (min)" fill={COLORS.medical} radius={0} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textMuted, textAlign: 'center', py: 4 }}>
            No department data available for this period.
          </Typography>
        )}
      </Box>

      <RowDivider />

      {/* ── ROW 5: Top Services Table ─────────────────────────── */}
      <SectionHeader>TOP SERVICES BY APPOINTMENT VOLUME</SectionHeader>
      <Box sx={{
        border: `2px solid ${COLORS.accent}`,
        borderRadius: 0,
        boxShadow: `3px 3px 0px ${COLORS.accent}`,
        overflow: 'hidden',
      }}>
        {/* Table header */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 120px 140px 150px',
          bgcolor: COLORS.accent,
          px: 2,
          py: 1,
        }}>
          {['SERVICE', 'APPOINTMENTS', 'AVG DURATION', 'MEDIAN DURATION'].map(col => (
            <Typography key={col} sx={{
              fontFamily: FONT,
              ...TYPE.label,
              color: COLORS.cream,
              fontSize: '0.65rem',
            }}>
              {col}
            </Typography>
          ))}
        </Box>

        {byService.length === 0 ? (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textMuted }}>
              No service data available.
            </Typography>
          </Box>
        ) : (
          byService.map((row, i) => (
            <Box
              key={row.service}
              sx={{
                display: 'grid',
                gridTemplateColumns: '1fr 120px 140px 150px',
                px: 2,
                py: 1,
                bgcolor: i % 2 === 0 ? COLORS.cardBg : COLORS.surface,
                borderTop: `1px solid ${COLORS.borderLight}`,
              }}
            >
              <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary }}>
                {row.service}
              </Typography>
              <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textSecondary }}>
                {row.count}
              </Typography>
              <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.info }}>
                {row.avgConsultMins > 0 ? formatDuration(row.avgConsultMins) : '—'}
              </Typography>
              <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.info }}>
                {row.medianConsultMins > 0 ? formatDuration(row.medianConsultMins) : '—'}
              </Typography>
            </Box>
          ))
        )}
      </Box>

      <RowDivider />

      {/* ── ROW 6: Status Transition Matrix (Step 3.4) ────────── */}
      <SectionHeader>STATUS TRANSITION FLOW</SectionHeader>
      <Box sx={{
        bgcolor: COLORS.cardBg,
        border: `2px solid ${COLORS.border}`,
        borderRadius: 0,
        boxShadow: `3px 3px 0px ${COLORS.border}`,
        p: 2.5,
        mb: 0,
        overflow: 'auto',
      }}>
        {matrixRows.length === 0 ? (
          <Typography sx={{
            fontFamily: FONT,
            ...TYPE.meta,
            color: COLORS.textMuted,
            textAlign: 'center',
            py: 4,
          }}>
            No status transition events recorded for this period.
          </Typography>
        ) : (
          <>
            <Typography sx={{
              fontFamily: FONT,
              ...TYPE.tiny,
              color: COLORS.textMuted,
              mb: 1.5,
            }}>
              Cell color intensity indicates transition frequency.
              Rows = from-status, Columns = to-status. Only transitions that
              actually occurred are shown.
            </Typography>
            {/* Heatmap table — no recharts, pure styled grid */}
            <Box
              component="table"
              sx={{
                borderCollapse: 'collapse',
                fontFamily: FONT,
                fontSize: '0.72rem',
                minWidth: '100%',
              }}
            >
              {/* Column headers */}
              <thead>
                <Box component="tr">
                  {/* Empty corner cell */}
                  <Box
                    component="th"
                    sx={{
                      border: `1px solid ${COLORS.border}`,
                      bgcolor: COLORS.accent,
                      p: '6px 8px',
                      fontWeight: 900,
                      fontSize: '0.65rem',
                      color: COLORS.cream,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    FROM \ TO
                  </Box>
                  {matrixCols.map(col => (
                    <Box
                      key={col}
                      component="th"
                      sx={{
                        border: `1px solid ${COLORS.border}`,
                        bgcolor: COLORS.accent,
                        p: '6px 8px',
                        fontWeight: 900,
                        fontSize: '0.65rem',
                        color: COLORS.cream,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col}
                    </Box>
                  ))}
                </Box>
              </thead>
              <tbody>
                {matrixRows.map((row) => (
                  <Box component="tr" key={row}>
                    {/* Row header */}
                    <Box
                      component="td"
                      sx={{
                        border: `1px solid ${COLORS.border}`,
                        bgcolor: COLORS.panelBg,
                        p: '5px 10px',
                        fontWeight: 800,
                        fontSize: '0.68rem',
                        color: COLORS.textPrimary,
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row}
                    </Box>
                    {/* Data cells */}
                    {matrixCols.map(col => {
                      const key   = `${row}→${col}`;
                      const count = transitionMatrix?.[key] || 0;
                      const bg    = heatmapCellBg(count);
                      // Use white text when background is dark enough (intensity > 0.5)
                      const textColor = count / matrixMax > 0.45 ? '#fff' : COLORS.textPrimary;
                      return (
                        <Box
                          key={col}
                          component="td"
                          sx={{
                            border:  `1px solid ${COLORS.border}`,
                            bgcolor: bg,
                            p: '5px 8px',
                            fontWeight: count > 0 ? 900 : 400,
                            fontSize: '0.75rem',
                            color: count > 0 ? textColor : COLORS.textMuted,
                            textAlign: 'center',
                            minWidth: 50,
                            transition: 'background-color 0.1s ease',
                          }}
                        >
                          {count > 0 ? count : '—'}
                        </Box>
                      );
                    })}
                  </Box>
                ))}
              </tbody>
            </Box>
          </>
        )}
      </Box>

      <RowDivider />

      {/* ── ROW 7: Queue Flow Analysis (Step 3.5) ─────────────── */}
      <SectionHeader>QUEUE FLOW ANALYSIS</SectionHeader>
      {q2c.count > 0 ? (
        <>
          <Grid container spacing={2} sx={{ mb: 0 }}>
            <Grid item xs={12} sm={6} md={3}>
              <KPICard
                title="AVG QUEUE-TO-COMPLETION"
                value={formatDuration(q2c.avg)}
                icon={<DirectionsRunIcon />}
                variant="blue"
                subtitle={`from ${q2c.count} completed records`}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KPICard
                title="MEDIAN FACILITY TIME"
                value={formatDuration(q2c.median)}
                icon={<TrendingFlatIcon />}
                variant="blue"
                subtitle="50th percentile"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KPICard
                title="P90 FACILITY TIME"
                value={formatDuration(q2c.p90)}
                icon={<HourglassTopIcon />}
                variant="orange"
                subtitle="Worst 10% of patient visits"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <KPICard
                title="RECORDS ANALYZED"
                value={q2c.count}
                icon={<SwapHorizIcon />}
                variant="neutral"
                subtitle="With arrival + completion timestamps"
              />
            </Grid>
          </Grid>

          {q2cChartData.length > 0 && (
            <Box sx={{
              mt: 2,
              bgcolor: COLORS.cardBg,
              border: `2px solid ${COLORS.border}`,
              borderRadius: 0,
              boxShadow: `3px 3px 0px ${COLORS.border}`,
              p: 2.5,
            }}>
              <Typography sx={{
                fontFamily: FONT,
                ...TYPE.tiny,
                color: COLORS.textMuted,
                mb: 1.5,
              }}>
                Total time from patient arrival to checkout completion.
              </Typography>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={q2cChartData}
                  margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderLight} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, fill: COLORS.textSecondary }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, fill: COLORS.textSecondary }}
                    label={{ value: 'Appointments', angle: -90, position: 'insideLeft', fontFamily: FONT, fontSize: 11, fill: COLORS.textMuted }}
                  />
                  <Tooltip content={<NeuTooltip />} />
                  <Bar dataKey="count" name="Appointments" radius={0}>
                    {q2cChartData.map((_, i) => (
                      <Cell key={i} fill={COLORS.warning} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}
        </>
      ) : (
        <Box sx={{
          bgcolor: COLORS.cardBg,
          border: `2px solid ${COLORS.border}`,
          borderRadius: 0,
          boxShadow: `3px 3px 0px ${COLORS.border}`,
          p: 2.5,
        }}>
          <Typography sx={{
            fontFamily: FONT,
            ...TYPE.meta,
            color: COLORS.textMuted,
            textAlign: 'center',
            py: 4,
          }}>
            No completed appointments with both arrival and completion timestamps
            found in this period. Queue flow analysis requires end-to-end timing data.
          </Typography>
        </Box>
      )}

    </Box>
  );
}
