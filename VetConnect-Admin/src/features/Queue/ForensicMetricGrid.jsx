import React from 'react';
import { Box, Typography, Grid, Divider } from '@mui/material';
import { calculatePulseMetrics, formatDuration, getOperationalMinutes } from '../../utils/pulseUtils';

/**
 * 🧬 VETCONNECT SHARED FORENSIC GRID (PHASE 6.3)
 * Use for Audit Popovers & Command Wizards.
 *
 * liveAge prop: when true, overrides recordAge and opHoursAge with a live clock
 * anchored to new Date() instead of the day-capped auditEnd. Use this for active
 * (non-sealed) records to prevent age metrics from freezing at the last-event day.
 */
export const ForensicMetricGrid = ({ pulse = [], settings = {}, createdAt, targetDate = new Date(), variant = 'dark', sealedMetrics = null, cumulativeTotals = null, auditEnd = null, liveAge = false }) => {
  const metrics = sealedMetrics || calculatePulseMetrics(pulse, settings, createdAt, targetDate, auditEnd);

  // When liveAge is true, recompute Record Age and Op Hours Age using the current wall clock
  // rather than the day-capped auditEnd that calculatePulseMetrics uses internally.
  let displayedMetrics = metrics;
  if (liveAge) {
    const inception = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt || Date.now());
    const now = new Date();
    const liveRecordAgeMins = Math.max(0, Math.round((now - inception) / 60000));
    const liveOpAgeMins = getOperationalMinutes(inception, now, settings, false, inception, 'business');
    displayedMetrics = {
      ...metrics,
      recordAge: formatDuration(liveRecordAgeMins),
      opHoursAge: formatDuration(liveOpAgeMins),
    };
  }

  // If cumulative totals are provided, override the per-record Total values
  const displayTotalQueue = cumulativeTotals ? formatDuration(cumulativeTotals.totalQueue) : metrics.totalQueue;
  const displayTotalConsult = cumulativeTotals ? formatDuration(cumulativeTotals.totalConsult) : metrics.totalConsult;
  const displayTotalConfined = cumulativeTotals ? formatDuration(cumulativeTotals.totalConfined) : metrics.totalConfined;
  
  const labelStyle = { 
    fontSize: '0.6rem', 
    fontWeight: '1000', 
    letterSpacing: 1, 
    color: '#5D4037', 
    opacity: 0.7,
    textTransform: 'uppercase',
    lineHeight: 1
  };

  const valueStyle = { 
    fontSize: '0.9rem', 
    fontWeight: '1000', 
    color: '#1A1A1A',
    lineHeight: 1.2,
    mt: 0.2
  };

  const MetricItem = ({ label, value }) => (
    <Box sx={{ p: 1 }}>
      <Typography sx={labelStyle}>{label}</Typography>
      <Typography sx={valueStyle}>{value}</Typography>
    </Box>
  );

  // PUNCTUALITY LOGIC (Behavioral)
  const resolveDate = (d) => {
    if (!d) return null;
    if (d.toDate) return d.toDate();
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  // Basic punctuality for the footer row
  const calculatePunctuality = () => {
    const arrivedEvent = pulse.find(p => p.toStatus === 'arrived');
    const sch = resolveDate(targetDate); // For now using targetDate as baseline if scheduled is missing
    const arr = arrivedEvent ? (arrivedEvent.timestamp?.toDate ? arrivedEvent.timestamp.toDate() : new Date(arrivedEvent.timestamp)) : null;
    
    if (!arr) return "PENDING ARRIVAL";
    // This is a simplified fallback for the footer display
    return "RECORDED"; 
  };

  return (
    <Box sx={{ bgcolor: 'rgba(93, 64, 55, 0.03)', border: '1px solid rgba(93, 64, 55, 0.1)', borderRadius: 1.5, overflow: 'hidden' }}>
      <Grid container>
        {/* ROW 1: THE CURRENT SHIFT FOCUS */}
        <Grid size={{ xs: 4 }} sx={{ borderRight: '1px solid rgba(0,0,0,0.05)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <MetricItem label="Record Age" value={displayedMetrics.recordAge} />
        </Grid>
        <Grid size={{ xs: 4 }} sx={{ borderRight: '1px solid rgba(0,0,0,0.05)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <MetricItem label="Shift Queue" value={displayedMetrics.shiftQueue} />
        </Grid>
        <Grid size={{ xs: 4 }} sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <MetricItem label="Shift Consult" value={displayedMetrics.shiftConsult} />
        </Grid>

        {/* ROW 2: THE CUMULATIVE CASE FOCUS */}
        <Grid size={{ xs: 4 }} sx={{ borderRight: '1px solid rgba(0,0,0,0.05)' }}>
            <MetricItem label="Op. Hours Age" value={displayedMetrics.opHoursAge} />
        </Grid>
        <Grid size={{ xs: 4 }} sx={{ borderRight: '1px solid rgba(0,0,0,0.05)' }}>
            <MetricItem label="Total Queue" value={displayTotalQueue} />
        </Grid>
        <Grid size={{ xs: 4 }}>
            <MetricItem label="Total Consult" value={displayTotalConsult} />
        </Grid>

        {/* ROW 3: THE ABSOLUTE CLINICAL BURDEN (Pivot 6.9.5) */}
        <Grid size={{ xs: 6 }} sx={{ bgcolor: 'rgba(211, 47, 47, 0.05)', py: 0.8, px: 1.5, borderTop: '1px solid rgba(211, 47, 47, 0.1)', borderRight: '1px solid rgba(211, 47, 47, 0.1)' }}>
            <Typography sx={{ ...labelStyle, color: '#D32F2F', opacity: 1, fontSize: '0.55rem' }}>SHIFT CONFINED TIME</Typography>
            <Typography sx={{ ...valueStyle, color: '#D32F2F', mt: 0 }}>
               {displayedMetrics.shiftConfined}
            </Typography>
        </Grid>
        <Grid size={{ xs: 6 }} sx={{ bgcolor: 'rgba(211, 47, 47, 0.05)', py: 0.8, px: 1.5, borderTop: '1px solid rgba(211, 47, 47, 0.1)' }}>
            <Typography sx={{ ...labelStyle, color: '#D32F2F', opacity: 1, fontSize: '0.55rem' }}>TOTAL CONFINED TIME</Typography>
            <Typography sx={{ ...valueStyle, color: '#D32F2F', mt: 0 }}>
               {displayTotalConfined}
            </Typography>
        </Grid>
      </Grid>
    </Box>
  );
};
