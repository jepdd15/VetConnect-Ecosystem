/**
 * GrowthTab — Growth metrics for the Dashboard.
 *
 * Renders 11 metrics covering client/pet population, appointment volume
 * trends, service popularity, and clinic utilization. Consumes the
 * `growth` computed block from `useDashboardData`.
 *
 * Props:
 *   data           — full return value of useDashboardData (for growth + dateRange)
 *   clinicSettings — clinic_settings/general document data (openHour, closeHour, workingDays)
 */

import React from 'react';
import { Box, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
  Cell,
} from 'recharts';

import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PeopleIcon from '@mui/icons-material/People';
import PetsIcon from '@mui/icons-material/Pets';
import EventIcon from '@mui/icons-material/Event';
import ScheduleIcon from '@mui/icons-material/Schedule';
import LoyaltyIcon from '@mui/icons-material/Loyalty';
import SpeedIcon from '@mui/icons-material/Speed';

import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import KPICard from './KPICard';
import HorizontalBar from './HorizontalBar';

// ── Chart constants ───────────────────────────────────────────────

// 10-color palette for data-viz series (breed ranking, service popularity)
const CHART_COLORS = [
  '#1565C0', '#2E7D32', '#7B1FA2', '#E65100',
  '#C62828', '#00695C', '#4527A0', '#AD1457',
  '#EF6C00', '#1B5E20',
];

const CHART_TOOLTIP_STYLE = {
  fontFamily: FONT,
  fontSize: 11,
  borderRadius: 0,
  border: `2px solid ${COLORS.accent}`,
  boxShadow: `3px 3px 0px ${COLORS.accent}`,
};

const CHART_TICK_STYLE = {
  fontSize: 10,
  fontFamily: FONT,
  fill: COLORS.textSecondary,
};

const CHART_GRID_PROPS = {
  strokeDasharray: '3 3',
  vertical: false,
  stroke: COLORS.borderLight,
};

// ── Component ────────────────────────────────────────────────────

export default function GrowthTab({ data, clinicSettings }) {
  const { growth, dateRange } = data;
  if (!growth) return null;

  // ── T2.314: Clinic utilization rate ────────────────────────────
  // Max capacity = (closeHour - openHour) * 2 slots/hour * working days in period
  const openHour = clinicSettings.openHour || 8;
  const closeHour = clinicSettings.closeHour || 17;
  const slotsPerDay = (closeHour - openHour) * 2; // 2 appointments per hour estimate

  const workingDays = clinicSettings.workingDays || [0, 1, 2, 3, 4, 5, 6];
  let workingDayCount = 0;
  const cursor = new Date(dateRange.startDate);
  const periodEnd = new Date(dateRange.endDate);
  while (cursor <= periodEnd) {
    if (workingDays.includes(cursor.getDay())) workingDayCount++;
    cursor.setDate(cursor.getDate() + 1);
  }

  const maxCapacity = slotsPerDay * Math.max(1, workingDayCount);
  const utilizationRate = Math.min(
    100,
    maxCapacity > 0 ? Math.round((growth.totalAppointments / maxCapacity) * 100) : 0,
  );

  // ── Shared panel style ──────────────────────────────────────────
  const panelSx = {
    bgcolor: COLORS.cardBg,
    border: `2px solid ${COLORS.accent}`,
    borderRadius: 0,
    boxShadow: `4px 4px 0px ${COLORS.brand}`,
    p: 2.5,
    height: '100%',
  };

  // ── Derived: peak hour max for highlight coloring ───────────────
  const maxPeakCount = Math.max(...growth.peakHours.map(h => h.count), 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* ── ROW 1: POPULATION KPIs (T2.282, T2.308, T2.285) ──── */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="NEW CLIENTS"
            value={growth.newClientCount}
            icon={<PersonAddIcon />}
            variant="blue"
            subtitle="registered this period"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="TOTAL ACTIVE CLIENTS"
            value={growth.totalActiveClients}
            icon={<PeopleIcon />}
            variant="green"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="TOTAL ACTIVE PETS"
            value={growth.totalActivePets}
            icon={<PetsIcon />}
            variant="purple"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="TOTAL APPOINTMENTS"
            value={growth.totalAppointments}
            icon={<EventIcon />}
            variant="orange"
            subtitle={`${growth.walkInCount} walk-in / ${growth.scheduledCount} scheduled`}
          />
        </Grid>
      </Grid>

      {/* ── ROW 2: CLIENT REGISTRATION TREND (T2.307) ──────────── */}
      <Box sx={panelSx}>
        <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
          CLIENT REGISTRATION TREND
        </Typography>
        {growth.clientTrend.length > 0 ? (
          <Box sx={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={growth.clientTrend}
                margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid {...CHART_GRID_PROPS} />
                <XAxis dataKey="label" tick={CHART_TICK_STYLE} />
                <YAxis tick={CHART_TICK_STYLE} allowDecimals={false} />
                <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="count" fill={COLORS.info} radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Typography sx={{
            fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted,
            textAlign: 'center', py: 3,
          }}>
            No new registrations in this period
          </Typography>
        )}
      </Box>

      {/* ── ROW 3: SPECIES DISTRIBUTION + TOP BREEDS (T2.308, T2.309) */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={panelSx}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              SPECIES DISTRIBUTION
            </Typography>
            <HorizontalBar
              segments={Object.entries(growth.speciesDistribution)
                .sort(([, a], [, b]) => b - a)
                .map(([species, count], i) => ({
                  label: species,
                  value: count,
                  color: CHART_COLORS[i % CHART_COLORS.length],
                }))
              }
              height={32}
              showLabels
              showLegend
            />
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ ...panelSx }}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              TOP BREEDS
            </Typography>
            {growth.topBreeds.length === 0 ? (
              <Typography sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted }}>
                No breed data available
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {growth.topBreeds.map((b, i) => (
                  <Box key={b.breed} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography sx={{
                      fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted,
                      minWidth: 16, textAlign: 'right',
                    }}>
                      {i + 1}.
                    </Typography>
                    <Typography sx={{
                      fontFamily: FONT, ...TYPE.meta, color: COLORS.textPrimary,
                      flex: 1,
                    }}>
                      {b.breed}
                    </Typography>
                    <Typography sx={{
                      fontFamily: FONT, fontWeight: 800, color: COLORS.accent,
                      fontSize: '0.8rem',
                    }}>
                      {b.count}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Grid>
      </Grid>

      {/* ── ROW 4: APPOINTMENT VOLUME TREND + WALK-IN RATIO (T2.285, T2.280) */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Box sx={panelSx}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              APPOINTMENT VOLUME TREND
            </Typography>
            {growth.appointmentTrend.length > 0 ? (
              <Box sx={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={growth.appointmentTrend}
                    margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid {...CHART_GRID_PROPS} />
                    <XAxis dataKey="label" tick={CHART_TICK_STYLE} />
                    <YAxis tick={CHART_TICK_STYLE} allowDecimals={false} />
                    <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="count" fill={COLORS.medical} radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Typography sx={{
                fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted,
                textAlign: 'center', py: 3,
              }}>
                No appointments in this period
              </Typography>
            )}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
            <Box sx={panelSx}>
              <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
                WALK-IN VS SCHEDULED
              </Typography>
              <HorizontalBar
                segments={[
                  { label: 'Walk-In',   value: growth.walkInCount,   color: COLORS.warning },
                  { label: 'Scheduled', value: growth.scheduledCount, color: COLORS.medical },
                ]}
                height={28}
                showLabels
                showLegend
              />
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* ── ROW 5: PEAK HOURS + SERVICE POPULARITY (T2.310, T2.311) */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={panelSx}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              PEAK HOURS ANALYSIS
            </Typography>
            {growth.peakHours.some(h => h.count > 0) ? (
              <Box sx={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={growth.peakHours}
                    margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid {...CHART_GRID_PROPS} />
                    <XAxis
                      dataKey="label"
                      tick={CHART_TICK_STYLE}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis tick={CHART_TICK_STYLE} allowDecimals={false} />
                    <RechartsTooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value) => [`${value} appointments`, 'Count']}
                    />
                    <Bar dataKey="count" radius={0}>
                      {growth.peakHours.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={
                            entry.count === maxPeakCount && entry.count > 0
                              ? COLORS.warning
                              : COLORS.accentLight
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Typography sx={{
                fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted,
                textAlign: 'center', py: 3,
              }}>
                No appointment time data
              </Typography>
            )}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={panelSx}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              SERVICE POPULARITY
            </Typography>
            {growth.serviceRanking.length === 0 ? (
              <Typography sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted }}>
                No service data
              </Typography>
            ) : (
              <Box sx={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={growth.serviceRanking}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 80, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      vertical
                      stroke={COLORS.borderLight}
                    />
                    <XAxis type="number" tick={CHART_TICK_STYLE} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={CHART_TICK_STYLE}
                      width={75}
                    />
                    <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="count" radius={0}>
                      {growth.serviceRanking.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Box>
        </Grid>
      </Grid>

      {/* ── ROW 6: LEAD TIME + RETENTION + UTILIZATION (T2.312, T2.313, T2.314) */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <KPICard
            title="BOOKING LEAD TIME"
            value={growth.avgLeadTimeHours > 0 ? `${growth.avgLeadTimeHours}h` : '--'}
            icon={<ScheduleIcon />}
            variant="neutral"
            subtitle={
              growth.leadTimeCount > 0
                ? `avg from ${growth.leadTimeCount} bookings`
                : 'no pre-booked appointments'
            }
            compact
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <KPICard
            title="CLIENT RETENTION"
            value={`${growth.retentionRate}%`}
            icon={<LoyaltyIcon />}
            variant={
              growth.retentionRate >= 50 ? 'green'
              : growth.retentionRate >= 25 ? 'orange'
              : 'red'
            }
            subtitle={`${growth.returningClientCount} returning / ${growth.uniqueClientCount} total`}
            compact
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <KPICard
            title="CLINIC UTILIZATION"
            value={`${utilizationRate}%`}
            icon={<SpeedIcon />}
            variant={
              utilizationRate >= 80 ? 'green'
              : utilizationRate >= 50 ? 'orange'
              : 'red'
            }
            subtitle={`${growth.totalAppointments} of ~${maxCapacity} slots`}
            compact
          />
        </Grid>
      </Grid>

    </Box>
  );
}
