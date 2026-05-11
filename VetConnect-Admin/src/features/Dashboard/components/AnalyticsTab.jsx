/**
 * AnalyticsTab — Merged Growth + Clinical analytics for the Dashboard.
 *
 * Three sections:
 *   PATIENTS  — client/pet population, species & breed breakdown
 *   APPOINTMENTS — volume trends, walk-in ratio, peak hours, service popularity
 *   CLINICAL  — records, diagnoses, vaccines, prescriptions, vitals
 *
 * Consumes data.growth and data.clinical from useDashboardData.
 * All metrics are now fully wired from useDashboardData (Day 2 complete).
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Divider } from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
  Cell, ReferenceLine, PieChart, Pie, Legend,
} from 'recharts';
import Chip from '@mui/material/Chip';

// Icons for section headers
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PeopleIcon from '@mui/icons-material/People';
import PetsIcon from '@mui/icons-material/Pets';
import EventIcon from '@mui/icons-material/Event';
import ScheduleIcon from '@mui/icons-material/Schedule';
import LoyaltyIcon from '@mui/icons-material/Loyalty';
import SpeedIcon from '@mui/icons-material/Speed';
import AssignmentIcon from '@mui/icons-material/Assignment';
import VaccinesIcon from '@mui/icons-material/Vaccines';
import MedicationIcon from '@mui/icons-material/Medication';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import HotelIcon from '@mui/icons-material/Hotel';
import PersonIcon from '@mui/icons-material/Person';
import TimelineIcon from '@mui/icons-material/Timeline';
import BiotechIcon from '@mui/icons-material/Biotech';

import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import KPICard from './KPICard';
import HorizontalBar from './HorizontalBar';
import {
  CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_TICK_STYLE, CHART_GRID_PROPS, PANEL_SX,
} from './chartConfig';
import { buildDrillDown } from '../utils/drillDownConfig';
import { annotateChartData } from '../utils/annotateChartData';

// ── Section header helper ─────────────────────────────────────────

function SectionHeader({ icon, children }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, mt: 3 }}>
      {React.cloneElement(icon, { sx: { color: COLORS.accent, fontSize: 18 } })}
      <Typography sx={{
        fontFamily: FONT,
        fontWeight: 1000,
        fontSize: '0.85rem',
        color: COLORS.accent,
        textTransform: 'uppercase',
        letterSpacing: 1,
      }}>
        {children}
      </Typography>
    </Box>
  );
}

// ── Component ────────────────────────────────────────────────────

export default function AnalyticsTab({
  data,
  clinicSettings,
  insights = {},
  yearAgoDeltas = null,
}) {
  const navigate = useNavigate();
  const drillDown = buildDrillDown(navigate);
  const { growth, clinical, dateRange, deltas } = data;

  if (!growth || !clinical) return null;

  const goals = clinicSettings?.dashboardGoals || {};
  const hist = data.historical || {};

  const apptAnnotation = React.useMemo(
    () => annotateChartData(growth?.appointmentTrend, 'count'),
    [growth?.appointmentTrend],
  );


  // Utilization rate computation (from GrowthTab)
  const openHour = clinicSettings.openHour || 8;
  const closeHour = clinicSettings.closeHour || 17;
  const slotsPerDay = (closeHour - openHour) * 2;
  const workingDays = clinicSettings.workingDays || [0, 1, 2, 3, 4, 5, 6];
  let workingDayCount = 0;
  if (dateRange?.startDate && dateRange?.endDate) {
    const cursor = new Date(dateRange.startDate);
    const periodEnd = new Date(dateRange.endDate);
    while (cursor <= periodEnd) {
      if (workingDays.includes(cursor.getDay())) workingDayCount++;
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const maxCapacity = slotsPerDay * Math.max(1, workingDayCount);
  const utilizationRate = Math.min(
    100,
    maxCapacity > 0 ? Math.round((growth.totalAppointments / maxCapacity) * 100) : 0,
  );

  const maxPeakCount = Math.max(...(growth.peakHours || []).map(h => h.count), 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* SECTION 1: PATIENTS                                       */}
      {/* ══════════════════════════════════════════════════════════ */}
      <SectionHeader icon={<PeopleIcon />}>Patients</SectionHeader>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="NEW CLIENTS"
            value={growth.newClientCount}
            icon={<PersonAddIcon />}
            variant="blue"
            subtitle="registered this period"
            delta={deltas?.uniqueClients}
            onClick={drillDown['NEW CLIENTS']}
            insight={insights['NEW CLIENTS']}
            goalTarget={goals.monthlyNewClients || 0}
            historicalContext={hist.newClientsPerMonth}
            sparkline={growth.clientTrend?.map(d => ({ value: d.count }))}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="TOTAL ACTIVE CLIENTS"
            value={growth.totalActiveClients}
            icon={<PeopleIcon />}
            variant="green"
            onClick={drillDown['TOTAL ACTIVE CLIENTS']}
            insight={insights['TOTAL ACTIVE CLIENTS']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="TOTAL ACTIVE PETS"
            value={growth.totalActivePets}
            icon={<PetsIcon />}
            variant="purple"
            onClick={drillDown['TOTAL ACTIVE PETS']}
            insight={insights['TOTAL ACTIVE PETS']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {/* NEW — available after Day 2 data hook update */}
          <KPICard
            title="NEW PETS"
            value={growth.newPetsCount ?? '—'}
            icon={<PetsIcon />}
            variant="neutral"
            subtitle="registered this period"
            onClick={drillDown['NEW PETS']}
            insight={insights['NEW PETS']}
          />
        </Grid>
      </Grid>

      {/* Species distribution + top breeds */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              SPECIES DISTRIBUTION
            </Typography>
            <HorizontalBar
              segments={Object.entries(growth.speciesDistribution || {})
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
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              TOP BREEDS
            </Typography>
            {(growth.topBreeds || []).length === 0 ? (
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
                      fontFamily: FONT, ...TYPE.meta, color: COLORS.textPrimary, flex: 1,
                    }}>
                      {b.breed}
                    </Typography>
                    <Typography sx={{ fontFamily: FONT, fontWeight: 800, color: COLORS.accent, fontSize: '0.8rem' }}>
                      {b.count}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Grid>
      </Grid>

      <Divider sx={{ borderColor: COLORS.borderLight }} />

      {/* ══════════════════════════════════════════════════════════ */}
      {/* SECTION 2: APPOINTMENTS                                   */}
      {/* ══════════════════════════════════════════════════════════ */}
      <SectionHeader icon={<EventIcon />}>Appointments</SectionHeader>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="TOTAL APPOINTMENTS"
            value={growth.totalAppointments}
            icon={<EventIcon />}
            variant="orange"
            subtitle={`${growth.walkInCount} walk-in / ${growth.scheduledCount} scheduled`}
            delta={deltas?.appointments}
            onClick={drillDown['TOTAL APPOINTMENTS (GROWTH)']}
            insight={insights['TOTAL APPOINTMENTS (GROWTH)']}
            goalTarget={goals.monthlyAppointments || 0}
            historicalContext={hist.appointmentsPerMonth}
            yearAgoDelta={yearAgoDeltas?.appointments}
            sparkline={growth.appointmentTrend?.map(d => ({ value: d.count }))}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="CLINIC UTILIZATION"
            value={`${utilizationRate}%`}
            icon={<SpeedIcon />}
            variant={utilizationRate >= 80 ? 'green' : utilizationRate >= 50 ? 'orange' : 'red'}
            subtitle={`${growth.totalAppointments} of ~${maxCapacity} slots`}
            compact
            onClick={drillDown['CLINIC UTILIZATION']}
            insight={insights['CLINIC UTILIZATION']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
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
            onClick={drillDown['BOOKING LEAD TIME']}
            insight={insights['BOOKING LEAD TIME']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="CLIENT RETENTION"
            value={`${growth.retentionRate}%`}
            icon={<LoyaltyIcon />}
            variant={growth.retentionRate >= 50 ? 'green' : growth.retentionRate >= 25 ? 'orange' : 'red'}
            subtitle={`${growth.returningClientCount} returning / ${growth.uniqueClientCount} total`}
            compact
            onClick={drillDown['CLIENT RETENTION']}
            insight={insights['CLIENT RETENTION']}
          />
        </Grid>
      </Grid>

      {/* Appointment volume trend */}
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
              <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', py: 3 }}>
                No appointments in this period
              </Typography>
            )}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
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
        </Grid>
      </Grid>

      {/* Peak hours + service popularity */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              PEAK HOURS ANALYSIS
            </Typography>
            {(growth.peakHours || []).some(h => h.count > 0) ? (
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
                      {(growth.peakHours || []).map((entry, i) => (
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
              <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', py: 3 }}>
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
            {(growth.serviceRanking || []).length === 0 ? (
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
                    <YAxis type="category" dataKey="name" tick={CHART_TICK_STYLE} width={75} />
                    <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="count" radius={0}>
                      {(growth.serviceRanking || []).map((_, i) => (
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

      {/* No-show by weekday */}
      {clinical.noShowByWeekday && clinical.noShowByWeekday.some(d => d.count > 0) && (
        <Box sx={PANEL_SX}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
            NO-SHOW RATE BY WEEKDAY
          </Typography>
          <HorizontalBar
            segments={(clinical.noShowByWeekday || []).map((d, i) => ({
              label: d.day,
              value: d.count,
              color: CHART_COLORS[i % CHART_COLORS.length],
            }))}
            height={28}
            showLabels
            showLegend
          />
        </Box>
      )}

      {/* Cancellation reasons */}
      {(clinical.cancellationReasons || []).length > 0 && (
        <Box sx={PANEL_SX}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
            CANCELLATION REASONS
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {clinical.cancellationReasons.map(({ reason, count }) => (
              <Chip
                key={reason}
                label={`${reason} (${count})`}
                size="small"
                sx={{
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: '0.65rem',
                  borderRadius: 0,
                  border: `1px solid ${COLORS.border}`,
                  bgcolor: COLORS.surface,
                  color: COLORS.textPrimary,
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      <Divider sx={{ borderColor: COLORS.borderLight }} />

      {/* ══════════════════════════════════════════════════════════ */}
      {/* SECTION 3: CLINICAL                                       */}
      {/* ══════════════════════════════════════════════════════════ */}
      <SectionHeader icon={<AssignmentIcon />}>Clinical</SectionHeader>

      {/* Primary clinical KPIs */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="RECORDS SIGNED"
            value={clinical.recordsSigned}
            icon={<AssignmentIcon />}
            variant="blue"
            subtitle="this period"
            delta={deltas?.recordsSigned}
            onClick={drillDown['RECORDS SIGNED']}
            insight={insights['RECORDS SIGNED']}
            goalTarget={goals.monthlyRecordsSigned || 0}
            historicalContext={hist.recordsPerMonth}
            yearAgoDelta={yearAgoDeltas?.recordsSigned}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="FOLLOW-UP COMPLIANCE"
            value={`${clinical.followUpComplianceRate}%`}
            icon={<EventRepeatIcon />}
            variant={
              clinical.followUpComplianceRate >= 70 ? 'green'
              : clinical.followUpComplianceRate >= 40 ? 'orange'
              : 'red'
            }
            subtitle={`${clinical.followUpAttended} attended / ${clinical.recordsWithFollowUp} requested`}
            onClick={drillDown['FOLLOW-UP COMPLIANCE']}
            insight={insights['FOLLOW-UP COMPLIANCE']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="CONFINEMENT RATE"
            value={`${clinical.confinementRate}%`}
            icon={<HotelIcon />}
            variant={clinical.confinementRate > 10 ? 'orange' : 'neutral'}
            subtitle={`${clinical.confinedCount} confined / ${clinical.carriedOverCount} carried over`}
            onClick={drillDown['CONFINEMENT RATE']}
            insight={insights['CONFINEMENT RATE']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {/* AMENDMENT RATE — available after Day 2 */}
          <KPICard
            title="AMENDMENT RATE"
            value={clinical.amendmentRate != null ? `${clinical.amendmentRate}%` : '—'}
            icon={<TimelineIcon />}
            variant={
              clinical.amendmentRate == null ? 'neutral'
              : clinical.amendmentRate < 5 ? 'green'
              : clinical.amendmentRate < 15 ? 'orange'
              : 'red'
            }
            subtitle={clinical.amendmentCount != null ? `${clinical.amendmentCount} amendments` : 'Available after Day 2'}
            onClick={drillDown['AMENDMENT RATE']}
            insight={insights['AMENDMENT RATE']}
          />
        </Grid>
      </Grid>

      {/* Top diagnoses */}
      <Box sx={PANEL_SX}>
        <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
          TOP DIAGNOSES
        </Typography>
        {(clinical.topDiagnoses || []).length > 0 ? (
          <Box sx={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={clinical.topDiagnoses}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 120, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  vertical
                  stroke={COLORS.borderLight}
                />
                <XAxis type="number" tick={CHART_TICK_STYLE} allowDecimals={false} />
                <YAxis type="category" dataKey="diagnosis" tick={CHART_TICK_STYLE} width={115} />
                <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="count" radius={0}>
                  {(clinical.topDiagnoses || []).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', py: 3 }}>
            No diagnoses recorded this period
          </Typography>
        )}
      </Box>

      {/* Diagnosis category donut + severity distribution */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              DIAGNOSES BY CATEGORY
            </Typography>
            {(clinical.diagnosisByCategory || []).length > 0 ? (
              <Box sx={{ width: '100%', height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={clinical.diagnosisByCategory}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={45}
                    >
                      {(clinical.diagnosisByCategory || []).map((entry, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value, name) => [`${value} cases`, name]}
                    />
                    <Legend
                      wrapperStyle={{ fontFamily: FONT, fontSize: 10 }}
                      iconType="square"
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', py: 3 }}>
                No diagnosis category data
              </Typography>
            )}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              SEVERITY DISTRIBUTION
            </Typography>
            {(clinical.severityDistribution || []).length > 0 ? (
              <Box sx={{ width: '100%', height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={clinical.severityDistribution}
                    margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid {...CHART_GRID_PROPS} />
                    <XAxis dataKey="name" tick={CHART_TICK_STYLE} />
                    <YAxis tick={CHART_TICK_STYLE} allowDecimals={false} />
                    <RechartsTooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value) => [`${value} cases`, 'Count']}
                    />
                    <Bar dataKey="count" radius={0}>
                      {(clinical.severityDistribution || []).map((entry, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', py: 3 }}>
                No severity data
              </Typography>
            )}
          </Box>
        </Grid>
      </Grid>

      {/* Vaccines + prescriptions */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              VACCINE ADMINISTRATION BY TYPE
            </Typography>
            <Grid container spacing={1} sx={{ mb: 1.5 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <KPICard
                  title="VACCINATIONS"
                  value={clinical.totalVaccinations}
                  icon={<VaccinesIcon />}
                  variant="green"
                  subtitle={`${(clinical.vaccinesByType || []).length} vaccine types`}
                  compact
                  onClick={drillDown['VACCINATIONS']}
                  insight={insights['VACCINATIONS']}
                />
              </Grid>
            </Grid>
            {(clinical.vaccinesByType || []).length > 0 ? (
              <Box sx={{ width: '100%', height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={clinical.vaccinesByType}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      vertical
                      stroke={COLORS.borderLight}
                    />
                    <XAxis type="number" tick={CHART_TICK_STYLE} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={CHART_TICK_STYLE} width={95} />
                    <RechartsTooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value) => [`${value} doses`, 'Administered']}
                    />
                    <Bar dataKey="count" fill={COLORS.success} radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', py: 3 }}>
                No vaccinations this period
              </Typography>
            )}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              TOP PRESCRIBED ITEMS
            </Typography>
            {(clinical.topPrescribed || []).length === 0 ? (
              <Typography sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted }}>
                No prescriptions this period
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {clinical.topPrescribed.map((rx, i) => (
                  <Box key={rx.name} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography sx={{
                      fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted,
                      minWidth: 16, textAlign: 'right',
                    }}>
                      {i + 1}.
                    </Typography>
                    <MedicationIcon sx={{ fontSize: 14, color: COLORS.medical, flexShrink: 0 }} />
                    <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textPrimary, flex: 1 }}>
                      {rx.name}
                    </Typography>
                    <Typography sx={{ fontFamily: FONT, fontWeight: 800, color: COLORS.accent, fontSize: '0.8rem' }}>
                      {rx.qty} units
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Grid>
      </Grid>

      {/* Lab tests KPIs + visualizations */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KPICard
            title="LAB TESTS ORDERED"
            value={clinical.labTestsOrdered ?? 0}
            icon={<BiotechIcon />}
            variant="neutral"
            subtitle={`${(clinical.labStatusDistribution || []).length} result categories`}
            onClick={drillDown['LAB TESTS ORDERED']}
            insight={insights['LAB TESTS ORDERED']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KPICard
            title="VACCINE COMPLIANCE"
            value={`${clinical.complianceRate ?? 0}%`}
            icon={<VaccinesIcon />}
            variant={
              (clinical.complianceRate ?? 0) >= 80 ? 'green'
              : (clinical.complianceRate ?? 0) >= 50 ? 'orange'
              : 'red'
            }
            subtitle="across active pets"
            onClick={drillDown['VACCINE COMPLIANCE']}
            insight={insights['VACCINE COMPLIANCE']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <KPICard
            title="OVERDUE VACCINES"
            value={clinical.overdueCount ?? 0}
            icon={<VaccinesIcon />}
            variant={(clinical.overdueCount ?? 0) > 0 ? 'orange' : 'green'}
            subtitle={`${clinical.petsWithOverdue ?? 0} pets with overdue vaccines`}
            onClick={drillDown['OVERDUE VACCINES']}
            insight={insights['OVERDUE VACCINES']}
          />
        </Grid>
      </Grid>

      {/* Lab status distribution */}
      {(clinical.labStatusDistribution || []).length > 0 && (
        <Box sx={PANEL_SX}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
            LAB RESULT STATUS DISTRIBUTION
          </Typography>
          <HorizontalBar
            segments={(clinical.labStatusDistribution || []).map(s => ({
              label: s.name,
              value: s.value,
              color: s.color,
            }))}
            height={28}
            showLabels
            showLegend
          />
        </Box>
      )}

      {/* Top ordered tests + tests by category */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              MOST ORDERED TESTS
            </Typography>
            {(clinical.topLabTests || []).length === 0 ? (
              <Typography sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted }}>
                No lab test data this period
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {clinical.topLabTests.map((t, i) => (
                  <Box key={t.name} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography sx={{
                      fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted,
                      minWidth: 16, textAlign: 'right',
                    }}>
                      {i + 1}.
                    </Typography>
                    <BiotechIcon sx={{ fontSize: 14, color: COLORS.medical, flexShrink: 0 }} />
                    <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textPrimary, flex: 1 }}>
                      {t.name}
                    </Typography>
                    <Typography sx={{ fontFamily: FONT, fontWeight: 800, color: COLORS.accent, fontSize: '0.8rem' }}>
                      {t.count}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              TESTS BY CATEGORY
            </Typography>
            {(clinical.labTestsByCategory || []).length > 0 ? (
              <Box sx={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={clinical.labTestsByCategory}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={45}
                    >
                      {(clinical.labTestsByCategory || []).map((entry, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value, name) => [`${value} tests`, name]}
                    />
                    <Legend
                      wrapperStyle={{ fontFamily: FONT, fontSize: 10 }}
                      iconType="square"
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', py: 3 }}>
                No lab category data
              </Typography>
            )}
          </Box>
        </Grid>
      </Grid>

      {/* Abnormal rate by test */}
      {(clinical.abnormalRateByTest || []).length > 0 && (
        <Box sx={PANEL_SX}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
            ABNORMAL RATE BY TEST (MIN. 3 SAMPLES)
          </Typography>
          <Box sx={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={clinical.abnormalRateByTest}
                layout="vertical"
                margin={{ top: 5, right: 48, left: 120, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  vertical
                  stroke={COLORS.borderLight}
                />
                <XAxis
                  type="number"
                  tick={CHART_TICK_STYLE}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis type="category" dataKey="name" tick={CHART_TICK_STYLE} width={115} />
                <RechartsTooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value) => [`${value}%`, 'Abnormal rate']}
                />
                <Bar dataKey="rate" radius={0}>
                  {(clinical.abnormalRateByTest || []).map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.rate >= 50 ? COLORS.danger : entry.rate >= 25 ? COLORS.warning : COLORS.medical}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Box>
      )}

      {/* Species visits + records per vet */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              SPECIES DISTRIBUTION OF VISITS
            </Typography>
            <HorizontalBar
              segments={Object.entries(clinical.speciesVisitDistribution || {})
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
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              RECORDS PER VET
            </Typography>
            {(clinical.recordsPerVet || []).length === 0 ? (
              <Typography sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted }}>
                No records this period
              </Typography>
            ) : (() => {
              const maxVetRecords = clinical.recordsPerVet[0]?.count || 1;
              return (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {clinical.recordsPerVet.map(({ vet, count }) => (
                    <Box key={vet} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <PersonIcon sx={{ fontSize: 16, color: COLORS.accent }} />
                      <Typography sx={{
                        fontFamily: FONT, ...TYPE.meta,
                        color: COLORS.textPrimary, minWidth: 120,
                      }}>
                        {vet}
                      </Typography>
                      <Box sx={{
                        flexGrow: 1, height: 16, bgcolor: COLORS.surface,
                        border: `1px solid ${COLORS.border}`, borderRadius: 0, overflow: 'hidden',
                      }}>
                        <Box sx={{
                          height: '100%',
                          width: `${(count / maxVetRecords) * 100}%`,
                          bgcolor: COLORS.medical,
                          transition: 'width 0.3s ease',
                          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pr: 0.5,
                        }}>
                          <Typography sx={{ ...TYPE.tiny, color: '#fff', fontSize: '0.6rem', fontFamily: FONT }}>
                            {count}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              );
            })()}
          </Box>
        </Grid>
      </Grid>

      {/* Average vitals by species */}
      <Box sx={PANEL_SX}>
        <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
          AVERAGE VITALS BY SPECIES
        </Typography>
        {(clinical.avgVitalsBySpecies || []).length > 0 ? (
          <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: FONT,
              '& th, & td': {
                px: 2,
                py: 1,
                textAlign: 'center',
                borderBottom: `1px solid ${COLORS.borderLight}`,
                fontSize: '0.75rem',
              },
              '& th': {
                ...TYPE.label,
                fontSize: '0.6rem',
                color: COLORS.accent,
                bgcolor: COLORS.cream,
                borderBottom: `2px solid ${COLORS.accent}`,
              },
              '& td': {
                color: COLORS.textPrimary,
                fontWeight: 700,
              },
            }}>
              <thead>
                <tr>
                  <Box component="th" sx={{ textAlign: 'left !important' }}>SPECIES</Box>
                  <th>AVG WEIGHT (KG)</th>
                  <th>AVG TEMP (C)</th>
                  <th>AVG HR (BPM)</th>
                  <th>AVG RR (BPM)</th>
                  <th>SAMPLE SIZE</th>
                </tr>
              </thead>
              <tbody>
                {clinical.avgVitalsBySpecies.map(row => (
                  <tr key={row.species}>
                    <Box component="td" sx={{
                      textAlign: 'left !important',
                      fontWeight: '900 !important',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}>
                      {row.species}
                    </Box>
                    <td>{row.avgWeight || '--'}</td>
                    <td>{row.avgTemp || '--'}</td>
                    <td>{row.avgHR || '--'}</td>
                    <td>{row.avgRR || '--'}</td>
                    <td style={{ color: COLORS.textMuted }}>{row.sampleSize}</td>
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
        ) : (
          <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', py: 3 }}>
            No vitals data recorded this period
          </Typography>
        )}
      </Box>

    </Box>
  );
}
