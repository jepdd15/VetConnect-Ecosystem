import React from 'react';
import { Paper, Typography } from '@mui/material';
import Grid from '@mui/material/Grid'; // THE FIX: Standard MUI Grid, NO Grid2!

export default function EodSummary({ totals }) {
  return (
    <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}>
            <Paper sx={{ p: 1.5, borderRadius: 2, borderLeft: '4px solid #2E7D32', bgcolor: 'rgba(255,255,255,0.7)' }}>
                <Typography variant="caption" fontWeight="900" color="textSecondary" sx={{ fontSize: '0.6rem' }}>CASH IN DRAWER</Typography>
                <Typography variant="h6" fontWeight="900" color="#2E7D32">₱{totals.cash.toFixed(2)}</Typography>
            </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
            <Paper sx={{ p: 1.5, borderRadius: 2, borderLeft: '4px solid #1565C0', bgcolor: 'rgba(255,255,255,0.7)' }}>
                <Typography variant="caption" fontWeight="900" color="textSecondary" sx={{ fontSize: '0.6rem' }}>GCASH / MAYA</Typography>
                <Typography variant="h6" fontWeight="900" color="#1565C0">₱{totals.gcash.toFixed(2)}</Typography>
            </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
            <Paper sx={{ p: 1.5, borderRadius: 2, borderLeft: '4px solid #F57C00', bgcolor: 'rgba(255,255,255,0.7)' }}>
                <Typography variant="caption" fontWeight="900" color="textSecondary" sx={{ fontSize: '0.6rem' }}>CARD & BANK</Typography>
                <Typography variant="h6" fontWeight="900" color="#F57C00">₱{(totals.card + totals.bank).toFixed(2)}</Typography>
            </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
            <Paper sx={{ p: 1.5, borderRadius: 2, borderLeft: '4px solid #5D4037', bgcolor: '#EFEBE9' }}>
                <Typography variant="caption" fontWeight="900" color="#5D4037" sx={{ fontSize: '0.6rem' }}>TOTAL REVENUE</Typography>
                <Typography variant="h5" fontWeight="900" color="#3E2723">₱{totals.total.toFixed(2)}</Typography>
                {totals.refunds > 0 && <Typography variant="caption" color="error" fontWeight="900">- ₱{totals.refunds.toFixed(2)}</Typography>}
            </Paper>
        </Grid>
    </Grid>
  );
}