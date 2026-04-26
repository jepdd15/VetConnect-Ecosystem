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
import { useNavigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
  Cell, ReferenceLine,
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
import DraggableKPIGrid from './DraggableKPIGrid';
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_TICK_STYLE, CHART_GRID_PROPS, PANEL_SX } from './chartConfig';
import { buildDrillDown } from '../utils/drillDownConfig';
import { annotateChartData } from '../utils/annotateChartData';

// ── Component ────────────────────────────────────────────────────

export default function GrowthTab({
  data,
  clinicSettings,
  insights = {},
  yearAgoDeltas = null,
  layout,
  onLayoutChange,
}) {
  const navigate = useNavigate();
  const drillDown = buildDrillDown(navigate);
  const { growth, dateRange } = data;

  const goals = clinicSettings?.dashboardGoals || {};
  const hist = data.historical || {};

  const apptAnnotation = React.useMemo(
    () => annotateChartData(growth?.appointmentTrend, 'count'),
    [growth?.appointmentTrend],
  );

  if (!growth) return null;

  const openHour = clinicSettings.openHour || 8;
  const closeHour = clinicSettings.closeHour || 17;
  const slotsPerDay = (closeHour - openHour) * 2;

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

  const maxPeakCount = Math.max(...growth.peakHours.map(h => h.count), 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* ── ROWS 1 + 6: DRAGGABLE KPI CARDS (T4.2) ──────────────── */}
      <DraggableKPIGrid layout={layout} onLayoutChange={onLayoutChange}>
        <div key="newClients">
          <KPICard
            title="NEW CLIENTS"
            value={growth.newClientCount}
            icon={<PersonAddIcon />}
            variant="blue"
            subtitle="registered this period"
            delta={data.deltas?.uniqueClients}
            onClick={drillDown['NEW CLIENTS']}
            insight={insights['NEW CLIENTS']}
            goalTarget={goals.monthlyNewClients || 0}
            historicalContext={hist.newClientsPerMonth}
            yearAgoDelta={null}
          />
        </div>
        <div key="totalActiveClients">
          <KPICard
            title="TOTAL ACTIVE CLIENTS"
            value={growth.totalActiveClients}
            icon={<PeopleIcon />}
            variant="green"
            onClick={drillDown['TOTAL ACTIVE CLIENTS']}
            insight={insights['TOTAL ACTIVE CLIENTS']}
          />
        </div>
        <div key="totalActivePets">
          <KPICard
            title="TOTAL ACTIVE PETS"
            value={growth.totalActivePets}
            icon={<PetsIcon />}
            variant="purple"
            onClick={drillDown['TOTAL ACTIVE PETS']}
            insight={insights['TOTAL ACTIVE PETS']}
          />
        </div>
        <div key="totalAppointments">
          <KPICard
            title="TOTAL APPOINTMENTS"
            value={growth.totalAppointments}
            icon={<EventIcon />}
            variant="orange"
            subtitle={`${growth.walkInCount} walk-in / ${growth.scheduledCount} scheduled`}
            delta={data.deltas?.appointments}
            onClick={drillDown['TOTAL APPOINTMENTS (GROWTH)']}
            insight={insights['TOTAL APPOINTMENTS (GROWTH)']}
            goalTarget={goals.monthlyAppointments || 0}
            historicalContext={hist.appointmentsPerMonth}
            yearAgoDelta={yearAgoDeltas?.appointments}
          />
        </div>
        <div key="bookingLeadTime">
          <KPICard
            title="BOOKING LEAD TIME"
            value={growth.avgLeadTimeHours > 0 ? `${growth.avgLeadTimeHours}h` : '--'}
            icon={<ScheduleIcon />}
            variant="neutral"
            onClick={drillDown['BOOKING LEAD TIME']}
            subtitle={
              growth.leadTimeCount > 0
                ? `avg from ${growth.leadTimeCount} bookings`
                : 'no pre-booked appointments'
            }
            compact
            insight={insights['BOOKING LEAD TIME']}
          />
        </div>
        <div key="clientRetention">
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
            onClick={drillDown['CLIENT RETENTION']}
            insight={insights['CLIENT RETENTION']}
          />
        </div>
        <div key="clinicUtilization">
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
            onClick={drillDown['CLINIC UTILIZATION']}
            insight={insights['CLINIC UTILIZATION']}
          />
        </div>
      </DraggableKPIGrid>

      {/* ── ROW 2: CLIENT REGISTRATION TREND (T2.307) ──────────── */}
      <Box sx={PANEL_SX}>
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
          <Box sx={PANEL_SX}>
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
          <Box sx={{ ...PANEL_SX }}>
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
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              APPOINTMENT VOLUME TREND
            </Typography>
            {apptAnnotation.data.length > 0 ? (
              <Box sx={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={apptAnnotation.data}
                    margin={{ top: 5, right: 48, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid {...CHART_GRID_PROPS} />
                    <XAxis dataKey="label" tick={CHART_TICK_STYLE} />
                    <YAxis tick={CHART_TICK_STYLE} allowDecimals={false} />
                    <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    {apptAnnotation.refLines.map(rl => (
                      <ReferenceLine
                        key={rl.label}
                        y={rl.y}
                        stroke={rl.color}
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={{
                          value: rl.label,
                          position: 'right',
                          style: { fontSize: 9, fontFamily: FONT, fill: rl.color, fontWeight: 700 },
                        }}
                      />
                    ))}
                    <Bar dataKey="count" radius={0}>
                      {apptAnnotation.data.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={
                            entry.annotation === 'peak'     ? COLORS.warning
                            : entry.annotation === 'trough'   ? COLORS.danger
                            : entry.annotation === 'aboveAvg' ? COLORS.success
                            : entry.annotation === 'belowAvg' ? '#BDBDBD'
                            : COLORS.medical
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
                No appointments in this period
              </Typography>
            )}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
            <Box sx={PANEL_SX}>
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
          <Box sx={PANEL_SX}>
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
          <Box sx={PANEL_SX}>
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


    </Box>
  );
}
