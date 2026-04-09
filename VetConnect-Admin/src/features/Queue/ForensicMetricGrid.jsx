import React from 'react';
import { Box, Typography, Grid, Divider } from '@mui/material';
import { calculatePulseMetrics, formatDuration } from '../../utils/pulseUtils';

/**
 * 🧬 VETCONNECT SHARED FORENSIC GRID (PHASE 6.3)
 * Use for Audit Popovers & Command Wizards.
 */
export const ForensicMetricGrid = ({ pulse = [], settings = {}, createdAt, targetDate = new Date(), variant = 'dark', sealedMetrics = null, cumulativeTotals = null }) => {
  const metrics = sealedMetrics || calculatePulseMetrics(pulse, settings, createdAt, targetDate);

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
            <MetricItem label="Record Age" value={metrics.recordAge} />
        </Grid>
        <Grid size={{ xs: 4 }} sx={{ borderRight: '1px solid rgba(0,0,0,0.05)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <MetricItem label="Shift Queue" value={metrics.shiftQueue} />
        </Grid>
        <Grid size={{ xs: 4 }} sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <MetricItem label="Shift Consult" value={metrics.shiftConsult} />
        </Grid>

        {/* ROW 2: THE CUMULATIVE CASE FOCUS */}
        <Grid size={{ xs: 4 }} sx={{ borderRight: '1px solid rgba(0,0,0,0.05)' }}>
            <MetricItem label="Op. Hours Age" value={metrics.opHoursAge} />
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
               {metrics.shiftConfined}
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
