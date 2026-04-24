import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';

// Icons
import EventIcon from '@mui/icons-material/Event';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import GroupsIcon from '@mui/icons-material/Groups';
import PersonIcon from '@mui/icons-material/Person';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import BlockIcon from '@mui/icons-material/Block';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';

import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import KPICard from './KPICard';
import HorizontalBar from './HorizontalBar';
import { buildDrillDown } from '../utils/drillDownConfig';

// Hex colors for each appointment status in the distribution bar.
// These are deliberate data-viz colors, not COLORS tokens — they need
// to be visually distinct from each other when displayed side-by-side.
const STATUS_COLORS = {
  pending:        '#90A4AE',
  confirmed:      '#42A5F5',
  arrived:        '#66BB6A',
  'in-consult':   '#FFA726',
  dispensing:     '#AB47BC',
  billing:        '#EC407A',
  completed:      COLORS.success,
  cancelled:      COLORS.danger,
  'no-show':      '#795548',
  confined:       '#EF5350',
  'on-hold':      '#BDBDBD',
  'carried-over': '#8D6E63',
};

// Department bar uses this palette cycling for up to 6 departments.
const DEPT_COLORS = [
  COLORS.medical,
  COLORS.grooming,
  COLORS.success,
  COLORS.warning,
  COLORS.info,
  '#8D6E63',
];

/**
 * Operations tab content for the Dashboard.
 *
 * Organized in 5 progressive rows:
 *   1. Primary KPI strip (overview numbers)
 *   2. Appointment status distribution bar
 *   3. Wait time + consult duration KPIs
 *   4. Department load + staff workload side-by-side
 *   5. No-show / cancellation / emergency compact KPIs
 *
 * Receives pre-computed `data` from useDashboardData — this component
 * is purely presentational.
 *
 * @param {{ ops, queueData }} data - From useDashboardData('today')
 * @param {object} clinicSettings  - From useClinicSettings()
 * @param {boolean} isOpen         - Whether the clinic is currently open
 */
export default function OperationsTab({ data, clinicSettings, isOpen, insights = {} }) {
  const navigate = useNavigate();
  const drillDown = buildDrillDown(navigate);
  const { ops, queueData } = data;

  // Guard: ops is null when period !== 'today'. Dashboard.jsx ensures
  // OperationsTab is only rendered when period is 'today', so this is
  // a defensive fallback only.
  if (!ops) return null;

  const {
    totalAppointments,
    statusCounts,
    avgWaitMins,
    longestCurrentWait,
    currentWaitingCount,
    avgConsultMins,
    consultCount,
    deptLoad,
    staffWorkload,
    noShowCount,
    cancelledCount,
    emergencyCount,
  } = ops;

  // Build status bar segments from non-zero status counts
  const statusSegments = Object.entries(statusCounts)
    .filter(([, v]) => v > 0)
    .map(([status, value]) => ({
      label: status.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase()),
      value,
      color: STATUS_COLORS[status] || '#999',
    }));

  // Build department load bar segments, sorted descending
  const deptSegments = Object.entries(deptLoad)
    .sort(([, a], [, b]) => b - a)
    .map(([dept, value], i) => ({
      label: dept,
      value,
      color: DEPT_COLORS[i % DEPT_COLORS.length],
    }));

  // Staff workload sorted by busiest descending
  const sortedStaff = Object.entries(staffWorkload)
    .sort(([, a], [, b]) => b - a);
  const maxStaffLoad = sortedStaff.length > 0 ? sortedStaff[0][1] : 1;

  // Active in-facility: all statuses where the patient is physically present
  const activeCount =
    (statusCounts.arrived || 0) +
    (statusCounts['in-consult'] || 0) +
    (statusCounts.dispensing || 0) +
    (statusCounts.billing || 0) +
    (statusCounts.confined || 0) +
    (statusCounts['on-hold'] || 0);

  // Queue display: combine prefix + number (e.g. "E3" or plain "5")
  const queueDisplay = queueData
    ? `${queueData.currentPrefix || ''}${queueData.currentServing || 0}`
    : '--';
  const queueSubtitle = queueData
    ? `${queueData.lastNumberIssued || 0} tickets issued`
    : undefined;

  // Throughput: completed / total as a percentage
  const throughputPct = totalAppointments > 0
    ? `${Math.round(((statusCounts.completed || 0) / totalAppointments) * 100)}% throughput`
    : undefined;

  // Adaptive color variants for wait time severity
  const avgWaitVariant = avgWaitMins > 30 ? 'red' : avgWaitMins > 15 ? 'orange' : 'green';
  const longestWaitVariant = longestCurrentWait > 45 ? 'red' : longestCurrentWait > 20 ? 'orange' : 'green';

  const panelSx = {
    bgcolor: COLORS.cardBg,
    border: `2px solid ${COLORS.accent}`,
    borderRadius: 0,
    boxShadow: `4px 4px 0px ${COLORS.brand}`,
    p: 2.5,
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* ROW 1: PRIMARY KPI STRIP */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="TOTAL APPOINTMENTS"
            value={totalAppointments}
            icon={<EventIcon />}
            variant="blue"
            onClick={drillDown['TOTAL APPOINTMENTS']}
            insight={insights['TOTAL APPOINTMENTS']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="COMPLETED"
            value={statusCounts.completed || 0}
            icon={<CheckCircleIcon />}
            variant="green"
            subtitle={throughputPct}
            onClick={drillDown['COMPLETED']}
            insight={insights['COMPLETED']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="ACTIVE IN FACILITY"
            value={activeCount}
            icon={<GroupsIcon />}
            variant="orange"
            onClick={drillDown['ACTIVE IN FACILITY']}
            insight={insights['ACTIVE IN FACILITY']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="QUEUE SERVING"
            value={queueDisplay}
            icon={<PeopleAltIcon />}
            variant="neutral"
            subtitle={queueSubtitle}
            onClick={drillDown['QUEUE SERVING']}
            insight={insights['QUEUE SERVING']}
          />
        </Grid>
      </Grid>

      {/* ROW 2: APPOINTMENT STATUS DISTRIBUTION (T2.228b) */}
      <Box sx={panelSx}>
        <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
          APPOINTMENT STATUS DISTRIBUTION
        </Typography>
        <HorizontalBar segments={statusSegments} height={32} showLabels showLegend />
      </Box>

      {/* ROW 3: WAIT TIMES + CONSULT DURATION (T2.281, T2.271) */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <KPICard
            title="AVG WAIT TIME"
            value={`${avgWaitMins} min`}
            icon={<HourglassTopIcon />}
            variant={avgWaitVariant}
            subtitle={`${currentWaitingCount} currently waiting`}
            onClick={drillDown['AVG WAIT TIME']}
            insight={insights['AVG WAIT TIME']}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <KPICard
            title="LONGEST CURRENT WAIT"
            value={longestCurrentWait > 0 ? `${longestCurrentWait} min` : '--'}
            icon={<AccessTimeIcon />}
            variant={longestWaitVariant}
            onClick={drillDown['LONGEST CURRENT WAIT']}
            insight={insights['LONGEST CURRENT WAIT']}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <KPICard
            title="AVG CONSULT DURATION"
            value={consultCount > 0 ? `${avgConsultMins} min` : '--'}
            icon={<AccessTimeIcon />}
            variant="blue"
            subtitle={consultCount > 0 ? `from ${consultCount} completed` : 'no completed consults yet'}
            onClick={drillDown['AVG CONSULT DURATION']}
            insight={insights['AVG CONSULT DURATION']}
          />
        </Grid>
      </Grid>

      {/* ROW 4: DEPARTMENT LOAD + STAFF WORKLOAD (T2.286, T2.287) */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ ...panelSx, height: '100%' }}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              DEPARTMENT LOAD
            </Typography>
            <HorizontalBar segments={deptSegments} height={28} showLabels showLegend />
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ ...panelSx, height: '100%' }}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              STAFF WORKLOAD
            </Typography>
            {sortedStaff.length === 0 ? (
              <Typography sx={{ ...TYPE.tiny, fontFamily: FONT, color: COLORS.textMuted }}>
                No staff assignments today
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {sortedStaff.map(([name, count]) => (
                  <Box key={name} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <PersonIcon sx={{ fontSize: 16, color: COLORS.accent }} />
                    <Typography sx={{
                      fontFamily: FONT,
                      ...TYPE.meta,
                      color: COLORS.textPrimary,
                      minWidth: 120,
                    }}>
                      {name}
                    </Typography>
                    <Box sx={{
                      flexGrow: 1,
                      height: 16,
                      bgcolor: COLORS.surface,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 0,
                      overflow: 'hidden',
                    }}>
                      <Box sx={{
                        height: '100%',
                        width: `${(count / maxStaffLoad) * 100}%`,
                        bgcolor: COLORS.medical,
                        transition: 'width 0.3s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        pr: 0.5,
                      }}>
                        <Typography sx={{
                          ...TYPE.tiny,
                          fontFamily: FONT,
                          color: '#fff',
                          fontSize: '0.6rem',
                        }}>
                          {count}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Grid>
      </Grid>

      {/* ROW 5: NO-SHOW / CANCELLATION / EMERGENCY (T2.279, T2.288) */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <KPICard
            title="NO-SHOWS"
            value={noShowCount}
            icon={<PersonOffIcon />}
            variant={noShowCount > 0 ? 'orange' : 'green'}
            compact
            onClick={drillDown['NO-SHOWS']}
            insight={insights['NO-SHOWS']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <KPICard
            title="CANCELLATIONS"
            value={cancelledCount}
            icon={<BlockIcon />}
            variant={cancelledCount > 0 ? 'red' : 'green'}
            compact
            onClick={drillDown['CANCELLATIONS']}
            insight={insights['CANCELLATIONS']}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <KPICard
            title="EMERGENCIES"
            value={emergencyCount}
            icon={<LocalHospitalIcon />}
            variant={emergencyCount > 0 ? 'red' : 'neutral'}
            compact
            onClick={drillDown['EMERGENCIES']}
            insight={insights['EMERGENCIES']}
          />
        </Grid>
      </Grid>

    </Box>
  );
}
