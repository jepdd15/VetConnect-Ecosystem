/**
 * StaffWorkloadTab — Tab 3 of the Forensic Reports page.
 *
 * Renders 4 sections:
 *   Section 1 — Staff Summary KPIs (active vets, total encounters, total consult hours)
 *   Section 2 — Patient Volume by Vet (horizontal BarChart, COLORS.medical)
 *   Section 3 — Total Consult Time by Vet (horizontal BarChart, COLORS.accent)
 *   Section 4 — Vet Performance Table (full metrics, sorted by patient count desc)
 *
 * @param {{ staff: object }} props.data — from useForensicReportData
 */

import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Box, Grid, Typography } from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import PersonIcon from '@mui/icons-material/Person';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TimerIcon from '@mui/icons-material/Timer';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import CategoryIcon from '@mui/icons-material/Category';
import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import KPICard from '../../Dashboard/components/KPICard';
import { formatDuration } from '../../../utils/pulseUtils';

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

// ── Performance table column definitions ─────────────────────────

const TABLE_COLS = [
  { key: 'vetName',         label: 'VET NAME',           flex: 2 },
  { key: 'patients',        label: 'PATIENTS',           flex: 1 },
  { key: 'totalConsult',    label: 'TOTAL CONSULT',      flex: 1 },
  { key: 'avgConsult',      label: 'AVG CONSULT',        flex: 1 },
  { key: 'avgQueue',        label: 'AVG QUEUE WAIT',     flex: 1 },
  { key: 'departments',     label: 'DEPTS SERVED',       flex: 1 },
];

function VetTableHeader() {
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
      bgcolor: COLORS.accent,
      px: 2,
      py: 1,
      gap: 1,
    }}>
      {TABLE_COLS.map(col => (
        <Typography key={col.key} sx={{
          fontFamily: FONT,
          ...TYPE.label,
          color: COLORS.cream,
          fontSize: '0.62rem',
        }}>
          {col.label}
        </Typography>
      ))}
    </Box>
  );
}

function VetTableRow({ vet, isEven }) {
  const deptDisplay = vet.departments?.length > 0
    ? vet.departments.join(', ')
    : '—';

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
        px: 2,
        py: 1.25,
        bgcolor: isEven ? COLORS.cardBg : COLORS.surface,
        borderTop: `1px solid ${COLORS.borderLight}`,
        gap: 1,
        alignItems: 'center',
        '&:hover': {
          bgcolor: COLORS.kpiBlueBg,
        },
        transition: 'background-color 0.1s ease',
      }}
    >
      <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary, fontSize: '0.875rem' }}>
        {vet.vetName}
      </Typography>
      <Typography sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.medical, fontSize: '1rem' }}>
        {vet.patients}
      </Typography>
      <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.info }}>
        {vet.totalConsultMins > 0 ? formatDuration(vet.totalConsultMins) : '—'}
      </Typography>
      <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.info }}>
        {vet.avgConsultMins > 0 ? formatDuration(vet.avgConsultMins) : '—'}
      </Typography>
      <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.warning }}>
        {vet.avgQueueMins > 0 ? formatDuration(vet.avgQueueMins) : '—'}
      </Typography>
      <Typography sx={{
        fontFamily: FONT,
        ...TYPE.tiny,
        color: COLORS.textMuted,
        fontSize: '0.72rem',
        whiteSpace: 'normal',
        lineHeight: 1.3,
      }}>
        {deptDisplay}
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
      <GroupIcon sx={{ fontSize: 48, color: COLORS.border }} />
      <Typography sx={{
        fontFamily: FONT,
        fontWeight: 900,
        fontSize: '1rem',
        color: COLORS.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        No Staff Workload Data Found
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

export default function StaffWorkloadTab({ data }) {
  // Defensive defaults — all hooks must run before any early return
  const isEmpty  = !data?.staff || data.totalCount === 0;
  const staff    = data?.staff ?? {};

  const {
    activeVets        = 0,
    totalConsultHours = 0,
    byVet             = [],
  } = staff;

  const totalEncounters = useMemo(
    () => byVet.filter(v => v.vetName !== 'Unassigned').reduce((s, v) => s + v.patients, 0),
    [byVet],
  );

  // Filter out "Unassigned" for charts — they would skew the visualization
  const assignedVets = useMemo(
    () => byVet.filter(v => v.vetName !== 'Unassigned').slice(0, 12),
    [byVet],
  );

  // Chart data for patient volume (first name only for space)
  const patientVolumeData = useMemo(
    () => assignedVets.map(v => ({
      name:  v.vetName.split(' ').slice(0, 2).join(' '),
      value: v.patients,
    })),
    [assignedVets],
  );

  // Chart data for total consult time (converted to hours for readability)
  const consultTimeData = useMemo(
    () => assignedVets.map(v => ({
      name:  v.vetName.split(' ').slice(0, 2).join(' '),
      value: Math.round(v.totalConsultMins / 60 * 10) / 10,
    })),
    [assignedVets],
  );

  const chartHeight = (count) => Math.max(180, count * 42);

  // Guard: show empty state after all hooks have run
  if (isEmpty) {
    return <TabEmptyState />;
  }

  return (
    <Box>

      {/* ── SECTION 1: Staff Summary KPIs ────────────────────────── */}
      <SectionHeader icon={<GroupIcon sx={{ fontSize: 16 }} />}>
        STAFF SUMMARY
      </SectionHeader>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <KPICard
            title="ACTIVE VETS"
            value={activeVets.toLocaleString()}
            icon={<PersonIcon />}
            variant="blue"
            subtitle="Unique vets with assigned appointments"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <KPICard
            title="TOTAL PATIENT ENCOUNTERS"
            value={totalEncounters.toLocaleString()}
            icon={<GroupIcon />}
            variant="green"
            subtitle="Appointments with a named vet"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <KPICard
            title="TOTAL CONSULT HOURS"
            value={`${totalConsultHours}h`}
            icon={<AccessTimeIcon />}
            variant="purple"
            subtitle="Aggregate clinical time across all vets"
          />
        </Grid>
      </Grid>

      <RowDivider />

      {/* ── SECTION 2: Patient Volume by Vet ─────────────────────── */}
      <SectionHeader icon={<PersonIcon sx={{ fontSize: 16 }} />}>
        PATIENT VOLUME BY VET
      </SectionHeader>
      <Box sx={{
        bgcolor: COLORS.cardBg,
        border: `2px solid ${COLORS.border}`,
        borderRadius: 0,
        boxShadow: `3px 3px 0px ${COLORS.border}`,
        p: 2.5,
      }}>
        {patientVolumeData.length === 0 ? (
          <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textMuted, textAlign: 'center', py: 4 }}>
            No vet assignment data available for this period.
          </Typography>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight(patientVolumeData.length)}>
            <BarChart
              layout="vertical"
              data={patientVolumeData}
              margin={{ top: 5, right: 40, bottom: 5, left: 90 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderLight} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, fill: COLORS.textSecondary }}
                label={{ value: 'Patients', position: 'insideBottom', offset: -2, fontFamily: FONT, fontSize: 11, fill: COLORS.textMuted }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={85}
                tick={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, fill: COLORS.textPrimary }}
              />
              <Tooltip content={<NeuTooltip />} />
              <Bar dataKey="value" name="Patients" fill={COLORS.medical} radius={0} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Box>

      <RowDivider />

      {/* ── SECTION 3: Consult Time by Vet ───────────────────────── */}
      <SectionHeader icon={<TimerIcon sx={{ fontSize: 16 }} />}>
        TOTAL CONSULT TIME BY VET
      </SectionHeader>
      <Box sx={{
        bgcolor: COLORS.cardBg,
        border: `2px solid ${COLORS.border}`,
        borderRadius: 0,
        boxShadow: `3px 3px 0px ${COLORS.border}`,
        p: 2.5,
      }}>
        {consultTimeData.length === 0 ? (
          <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textMuted, textAlign: 'center', py: 4 }}>
            No consult time data available for this period.
          </Typography>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight(consultTimeData.length)}>
            <BarChart
              layout="vertical"
              data={consultTimeData}
              margin={{ top: 5, right: 40, bottom: 5, left: 90 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderLight} />
              <XAxis
                type="number"
                tick={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, fill: COLORS.textSecondary }}
                label={{ value: 'Hours', position: 'insideBottom', offset: -2, fontFamily: FONT, fontSize: 11, fill: COLORS.textMuted }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={85}
                tick={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, fill: COLORS.textPrimary }}
              />
              <Tooltip content={<NeuTooltip />} />
              <Bar dataKey="value" name="Consult Hours" fill={COLORS.accent} radius={0} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Box>

      <RowDivider />

      {/* ── SECTION 4: Vet Performance Table ─────────────────────── */}
      <SectionHeader icon={<HourglassTopIcon sx={{ fontSize: 16 }} />}>
        VET PERFORMANCE TABLE
      </SectionHeader>
      <Typography sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted, mb: 1.5 }}>
        Sorted by patient count descending. Includes all vets with at least one assigned appointment.
      </Typography>

      <Box sx={{
        border: `2px solid ${COLORS.accent}`,
        borderRadius: 0,
        boxShadow: `3px 3px 0px ${COLORS.accent}`,
        overflow: 'hidden',
      }}>
        <VetTableHeader />
        {byVet.length === 0 ? (
          <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textMuted }}>
              No vet data available for this period.
            </Typography>
          </Box>
        ) : (
          byVet.map((vet, i) => (
            <VetTableRow key={vet.vetId || vet.vetName} vet={vet} isEven={i % 2 === 0} />
          ))
        )}
      </Box>

      {(() => {
        const unassignedEntry = byVet.find(v => v.vetName === 'Unassigned');
        if (!unassignedEntry) return null;

        const unassignedCount  = unassignedEntry.patients ?? 0;
        const allTotal         = byVet.reduce((s, v) => s + v.patients, 0);
        const unassignedPct    = allTotal > 0 ? Math.round((unassignedCount / allTotal) * 100) : 0;
        const isHighUnassigned = unassignedPct > 20;

        return (
          <Box sx={{
            mt: 1.5,
            px: 2,
            py: 1,
            bgcolor: isHighUnassigned ? COLORS.kpiRedBg : COLORS.warningSurface,
            border: `1px solid ${isHighUnassigned ? COLORS.danger : COLORS.kpiOrangeBorder}`,
            borderRadius: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}>
            <CategoryIcon sx={{
              fontSize: 14,
              color: isHighUnassigned ? COLORS.danger : COLORS.warning,
              flexShrink: 0,
            }} />
            <Typography sx={{
              fontFamily: FONT,
              ...TYPE.tiny,
              color: isHighUnassigned ? COLORS.danger : COLORS.warning,
              fontWeight: 700,
            }}>
              {isHighUnassigned
                ? `High unassigned rate: ${unassignedPct}% of appointments (${unassignedCount}) have no assigned vet. Review staff assignment workflow.`
                : `${unassignedCount} appointment(s) have no assigned vet and appear in the "Unassigned" row above.`
              }
            </Typography>
          </Box>
        );
      })()}

    </Box>
  );
}
