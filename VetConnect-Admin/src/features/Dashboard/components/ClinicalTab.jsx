/**
 * ClinicalTab — Clinical metrics for the Dashboard.
 *
 * Renders 9 clinical metrics: records signed, top diagnoses, vaccine
 * administration, top prescribed items, follow-up compliance, species
 * distribution of visits, confinement/carry-over rate, records per vet,
 * and average vitals by species.
 *
 * Props:
 *   data — full return value of useDashboardData (for clinical + deltas)
 */

import React from 'react';
import { Box, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
  Cell,
} from 'recharts';

// Icons
import AssignmentIcon from '@mui/icons-material/Assignment';
import VaccinesIcon from '@mui/icons-material/Vaccines';
import MedicationIcon from '@mui/icons-material/Medication';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import HotelIcon from '@mui/icons-material/Hotel';
import PersonIcon from '@mui/icons-material/Person';

import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import KPICard from './KPICard';
import HorizontalBar from './HorizontalBar';
import {
  CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_TICK_STYLE, CHART_GRID_PROPS, PANEL_SX,
} from './chartConfig';

// ── Component ────────────────────────────────────────────────────

export default function ClinicalTab({ data }) {
  const { clinical, deltas } = data;
  if (!clinical) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* ── ROW 1: PRIMARY KPIs (T2.289, T2.291, T2.293, T2.295) ── */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="RECORDS SIGNED"
            value={clinical.recordsSigned}
            icon={<AssignmentIcon />}
            variant="blue"
            subtitle="this period"
            delta={deltas?.recordsSigned}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="VACCINATIONS"
            value={clinical.totalVaccinations}
            icon={<VaccinesIcon />}
            variant="green"
            subtitle={`${clinical.vaccinesByType.length} vaccine types`}
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
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KPICard
            title="CONFINEMENT RATE"
            value={`${clinical.confinementRate}%`}
            icon={<HotelIcon />}
            variant={clinical.confinementRate > 10 ? 'orange' : 'neutral'}
            subtitle={`${clinical.confinedCount} confined / ${clinical.carriedOverCount} carried over`}
          />
        </Grid>
      </Grid>

      {/* ── ROW 2: TOP 5 DIAGNOSES (T2.290) ─────────────────────── */}
      <Box sx={PANEL_SX}>
        <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
          TOP DIAGNOSES
        </Typography>
        {clinical.topDiagnoses.length > 0 ? (
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
                <YAxis
                  type="category"
                  dataKey="diagnosis"
                  tick={CHART_TICK_STYLE}
                  width={115}
                />
                <RechartsTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="count" radius={0}>
                  {clinical.topDiagnoses.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
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
            No diagnoses recorded this period
          </Typography>
        )}
      </Box>

      {/* ── ROW 3: VACCINES + PRESCRIPTIONS (T2.291, T2.292) ─────── */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              VACCINE ADMINISTRATION BY TYPE
            </Typography>
            {clinical.vaccinesByType.length > 0 ? (
              <Box sx={{ width: '100%', height: 200 }}>
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
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={CHART_TICK_STYLE}
                      width={95}
                    />
                    <RechartsTooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value) => [`${value} doses`, 'Administered']}
                    />
                    <Bar dataKey="count" fill={COLORS.success} radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Typography sx={{
                fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted,
                textAlign: 'center', py: 3,
              }}>
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
            {clinical.topPrescribed.length === 0 ? (
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
                    <Typography sx={{
                      fontFamily: FONT, ...TYPE.meta, color: COLORS.textPrimary,
                      flex: 1,
                    }}>
                      {rx.name}
                    </Typography>
                    <Typography sx={{
                      fontFamily: FONT, fontWeight: 800, color: COLORS.accent,
                      fontSize: '0.8rem',
                    }}>
                      {rx.qty} units
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Grid>
      </Grid>

      {/* ── ROW 4: SPECIES VISITS + RECORDS PER VET (T2.294, T2.296) */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={PANEL_SX}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
              SPECIES DISTRIBUTION OF VISITS
            </Typography>
            <HorizontalBar
              segments={Object.entries(clinical.speciesVisitDistribution)
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
            {clinical.recordsPerVet.length === 0 ? (
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
                          <Typography sx={{ ...TYPE.tiny, color: '#fff', fontSize: '0.6rem' }}>
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

      {/* ── ROW 5: AVERAGE VITALS BY SPECIES (T2.297) ────────────── */}
      <Box sx={PANEL_SX}>
        <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.accent, mb: 1.5 }}>
          AVERAGE VITALS BY SPECIES
        </Typography>
        {clinical.avgVitalsBySpecies.length > 0 ? (
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
          <Typography sx={{
            fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted,
            textAlign: 'center', py: 3,
          }}>
            No vitals data recorded this period
          </Typography>
        )}
      </Box>

    </Box>
  );
}
