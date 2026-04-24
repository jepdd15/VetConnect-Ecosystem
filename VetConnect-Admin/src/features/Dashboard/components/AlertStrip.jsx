/**
 * AlertStrip — Threshold-based operational alerts for the Dashboard.
 *
 * Reads configured thresholds from clinicSettings.dashboardAlerts and
 * evaluates them against the current ops metrics from useDashboardData.
 * Each active alert renders as a dismissible chip. Alerts only appear
 * on the Operations tab (period = 'today').
 *
 * Dismissed alerts persist for the session only (local state). If a
 * threshold is still exceeded after a page refresh, the alert reappears.
 *
 * Props:
 *   ops           — Operations metrics from useDashboardData (may be null)
 *   clinicSettings — From useClinicSettings (contains dashboardAlerts object)
 */

import React, { useState } from 'react';
import { Box, Chip } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CloseIcon from '@mui/icons-material/Close';
import { FONT, COLORS } from '../../../theme/designTokens';

export default function AlertStrip({ ops, clinicSettings }) {
  const [dismissed, setDismissed] = useState(new Set());

  if (!ops) return null;

  const thresholds = {
    avgWaitMax: 30,
    longestWaitMax: 45,
    noShowMin: 3,
    emergencyMin: 2,
    queueDepthMax: 8,
    ...(clinicSettings.dashboardAlerts || {}),
  };

  const alerts = [];

  if (thresholds.avgWaitMax && ops.avgWaitMins > thresholds.avgWaitMax) {
    alerts.push({
      id: 'avgWait',
      severity: 'danger',
      text: `Avg wait ${ops.avgWaitMins}min exceeds ${thresholds.avgWaitMax}min threshold`,
    });
  }

  if (thresholds.longestWaitMax && ops.longestCurrentWait > thresholds.longestWaitMax) {
    alerts.push({
      id: 'longestWait',
      severity: 'danger',
      text: `Longest wait ${ops.longestCurrentWait}min exceeds ${thresholds.longestWaitMax}min limit`,
    });
  }

  if (thresholds.noShowMin && ops.noShowCount >= thresholds.noShowMin) {
    alerts.push({
      id: 'noShow',
      severity: 'warning',
      text: `${ops.noShowCount} no-shows today (threshold: ${thresholds.noShowMin})`,
    });
  }

  if (thresholds.emergencyMin && ops.emergencyCount >= thresholds.emergencyMin) {
    alerts.push({
      id: 'emergency',
      severity: 'danger',
      text: `${ops.emergencyCount} emergencies today (threshold: ${thresholds.emergencyMin})`,
    });
  }

  // Active-in-facility count: patients physically present (excludes pending/confirmed/completed)
  const activeCount =
    (ops.statusCounts.arrived || 0) +
    (ops.statusCounts['in-consult'] || 0) +
    (ops.statusCounts.dispensing || 0) +
    (ops.statusCounts.billing || 0) +
    (ops.statusCounts.confined || 0) +
    (ops.statusCounts['on-hold'] || 0);

  if (thresholds.queueDepthMax && activeCount > thresholds.queueDepthMax) {
    alerts.push({
      id: 'queueDepth',
      severity: 'warning',
      text: `${activeCount} patients in facility (limit: ${thresholds.queueDepthMax})`,
    });
  }

  const visible = alerts.filter(a => !dismissed.has(a.id));

  if (visible.length === 0) return null;

  const handleDismiss = (id) => {
    setDismissed(prev => new Set(prev).add(id));
  };

  return (
    <Box sx={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 1,
      px: 4,
      py: 1.5,
      bgcolor: COLORS.kpiRedBg,
      borderBottom: `2px solid ${COLORS.danger}`,
    }}>
      <WarningAmberIcon sx={{ color: COLORS.danger, fontSize: 20, flexShrink: 0 }} />
      {visible.map(alert => (
        <Chip
          key={alert.id}
          label={alert.text}
          size="small"
          deleteIcon={<CloseIcon sx={{ fontSize: '14px !important' }} />}
          onDelete={() => handleDismiss(alert.id)}
          sx={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: '0.65rem',
            borderRadius: 0,
            bgcolor: alert.severity === 'danger' ? COLORS.kpiRedBg : COLORS.kpiOrangeBg,
            border: `2px solid ${alert.severity === 'danger' ? COLORS.danger : COLORS.warning}`,
            color: alert.severity === 'danger' ? COLORS.danger : COLORS.warning,
            boxShadow: `2px 2px 0px ${alert.severity === 'danger' ? COLORS.danger : COLORS.warning}40`,
            '& .MuiChip-deleteIcon': {
              color: alert.severity === 'danger' ? COLORS.danger : COLORS.warning,
            },
          }}
        />
      ))}
    </Box>
  );
}
