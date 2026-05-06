/**
 * PerformanceTab — Forensic performance analytics absorbed from the
 * standalone Reports page into the Dashboard.
 *
 * Auto-generates when data.dateRange changes (no manual "Generate" button).
 * Renders 3 sections directly reusing the existing Reports sub-components:
 *   CONSULT PERFORMANCE  — ConsultPerformanceTab
 *   AUDIT INTEGRITY      — AuditIntegrityTab
 *   STAFF WORKLOAD       — StaffWorkloadTab
 *
 * Props:
 *   data          — full useDashboardData return value; uses data.dateRange
 *   clinicSettings — clinic_settings/general document data
 */

import React, { useEffect, useState } from 'react';
import { Box, Typography, Skeleton, Alert, Button, Chip, Collapse } from '@mui/material';
import Grid from '@mui/material/Grid';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SecurityIcon from '@mui/icons-material/Security';
import GroupIcon from '@mui/icons-material/Group';
import FilterListIcon from '@mui/icons-material/FilterList';
import SpeedIcon from '@mui/icons-material/Speed';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import { FONT, TYPE, COLORS } from '../../../theme/designTokens';
import { useForensicReportData } from '../../Reports/hooks/useForensicReportData';
import ConsultPerformanceTab from '../../Reports/components/ConsultPerformanceTab';
import AuditIntegrityTab from '../../Reports/components/AuditIntegrityTab';
import StaffWorkloadTab from '../../Reports/components/StaffWorkloadTab';
import KPICard from './KPICard';

// ── Section header with collapse toggle ──────────────────────────

function CollapsibleSection({ icon, title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Box>
      <Box
        onClick={() => setOpen(prev => !prev)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: open ? 1.5 : 0,
          cursor: 'pointer',
          p: 1,
          bgcolor: COLORS.surface,
          border: `2px solid ${COLORS.accent}`,
          borderRadius: 0,
          boxShadow: `2px 2px 0px ${COLORS.brand}`,
          transition: 'transform 0.1s ease, box-shadow 0.1s ease',
          '&:hover': {
            transform: 'translate(1px, 1px)',
            boxShadow: `1px 1px 0px ${COLORS.brand}`,
          },
        }}
      >
        {React.cloneElement(icon, { sx: { color: COLORS.accent, fontSize: 18 } })}
        <Typography sx={{
          fontFamily: FONT,
          fontWeight: 1000,
          fontSize: '0.85rem',
          color: COLORS.accent,
          textTransform: 'uppercase',
          letterSpacing: 1,
          flex: 1,
        }}>
          {title}
        </Typography>
        {open ? (
          <ExpandLessIcon sx={{ color: COLORS.textMuted, fontSize: 18 }} />
        ) : (
          <ExpandMoreIcon sx={{ color: COLORS.textMuted, fontSize: 18 }} />
        )}
      </Box>
      <Collapse in={open}>
        {children}
      </Collapse>
    </Box>
  );
}

// ── Component ────────────────────────────────────────────────────

export default function PerformanceTab({ data, clinicSettings, onDataReady }) {
  const { generateFromDates, loading, error, data: reportData, truncated, truncatedEndDate } =
    useForensicReportData();

  const dateRange = data?.dateRange;

  // Auto-generate whenever the Dashboard period changes
  useEffect(() => {
    if (!dateRange?.startDate || !dateRange?.endDate) return;
    generateFromDates(dateRange.startDate, dateRange.endDate, clinicSettings);
  // clinicSettings is a complex object — intentionally omit it to avoid
  // re-firing on every render. Only re-fire when the date range changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange?.startDate, dateRange?.endDate, generateFromDates]);

  // Lift reportData to Dashboard for export
  useEffect(() => {
    if (reportData && onDataReady) onDataReady(reportData);
  }, [reportData, onDataReady]);

  const handleRetry = () => {
    if (!dateRange?.startDate || !dateRange?.endDate) return;
    generateFromDates(dateRange.startDate, dateRange.endDate, clinicSettings);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* Record count badge + truncation warning */}
      {(reportData || loading) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {reportData && (
            <Chip
              label={`Analyzing ${reportData.totalCount} appointment${reportData.totalCount !== 1 ? 's' : ''}`}
              size="small"
              sx={{
                fontFamily: FONT,
                ...TYPE.label,
                fontSize: '0.65rem',
                borderRadius: 0,
                border: `2px solid ${COLORS.info}`,
                bgcolor: COLORS.kpiBlueBg,
                color: COLORS.info,
                fontWeight: 900,
              }}
            />
          )}
          {loading && (
            <Typography sx={{ fontFamily: FONT, ...TYPE.tiny, color: COLORS.textMuted }}>
              Generating report...
            </Typography>
          )}
        </Box>
      )}

      {truncated && (
        <Alert
          severity="warning"
          sx={{ fontFamily: FONT, borderRadius: 0, border: `2px solid ${COLORS.warning}` }}
        >
          Report truncated at 500 records.
          {truncatedEndDate && ` Data shown through ${truncatedEndDate}.`}
          {' '}Narrow the date range for complete analysis.
        </Alert>
      )}

      {/* Error state */}
      {error && (
        <Alert
          severity="error"
          sx={{ fontFamily: FONT, borderRadius: 0, border: `2px solid ${COLORS.danger}` }}
          action={
            <Button
              size="small"
              onClick={handleRetry}
              sx={{ fontFamily: FONT, ...TYPE.label, fontSize: '0.65rem', color: COLORS.danger }}
            >
              RETRY
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* Loading skeletons */}
      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={120} sx={{ borderRadius: 0 }} />
          ))}
        </Box>
      )}

      {/* Report sections — rendered only when data is available */}
      {!loading && reportData && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

          <CollapsibleSection icon={<AssessmentIcon />} title="Consult Performance">
            <ConsultPerformanceTab data={reportData} />
          </CollapsibleSection>

          <CollapsibleSection icon={<SecurityIcon />} title="Audit Integrity">
            <AuditIntegrityTab data={reportData} />
          </CollapsibleSection>

          <CollapsibleSection icon={<GroupIcon />} title="Staff Workload">
            <StaffWorkloadTab data={reportData} />
          </CollapsibleSection>

          {/* ── CONVERSION FUNNEL ──────────────────────────── */}
          {reportData.conversionFunnel && (
            <CollapsibleSection icon={<FilterListIcon />} title="Conversion Funnel">
              <Box sx={{ p: 1 }}>
                {reportData.conversionFunnel.map(stage => (
                  <Box key={stage.stage} sx={{ mb: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography sx={{ fontFamily: FONT, ...TYPE.label, fontSize: '0.7rem' }}>
                        {stage.stage}
                      </Typography>
                      <Typography sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.7rem' }}>
                        {stage.count} ({stage.rate}%)
                      </Typography>
                    </Box>
                    <Box sx={{
                      height: 20,
                      bgcolor: COLORS.surface,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 0,
                    }}>
                      <Box sx={{
                        height: '100%',
                        width: `${stage.rate}%`,
                        bgcolor: COLORS.info,
                        transition: 'width 0.4s',
                        borderRadius: 0,
                      }} />
                    </Box>
                  </Box>
                ))}
              </Box>
            </CollapsibleSection>
          )}

          {/* ── STAFF UTILIZATION ─────────────────────────── */}
          {reportData.staffUtilization && reportData.staffUtilization.length > 0 && (
            <CollapsibleSection icon={<SpeedIcon />} title="Staff Utilization">
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                {reportData.staffUtilization.map(vet => (
                  <Grid key={vet.vetName} size={{ xs: 12, sm: 6, md: 4 }}>
                    <KPICard
                      title={vet.vetName}
                      value={`${vet.utilizationRate}%`}
                      subtitle={`${vet.consultHours}h of ${vet.availableHours}h available`}
                      variant={
                        vet.utilizationRate >= 80 ? 'green'
                        : vet.utilizationRate >= 50 ? 'orange'
                        : 'red'
                      }
                    />
                  </Grid>
                ))}
              </Grid>
            </CollapsibleSection>
          )}

        </Box>
      )}

      {/* Empty state before first generation */}
      {!loading && !reportData && !error && (
        <Box sx={{
          p: 4,
          textAlign: 'center',
          border: `2px dashed ${COLORS.borderLight}`,
          borderRadius: 0,
        }}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textMuted }}>
            Performance report will generate automatically based on the selected period.
          </Typography>
        </Box>
      )}

    </Box>
  );
}
