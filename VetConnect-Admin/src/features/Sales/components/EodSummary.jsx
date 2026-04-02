import React from 'react';
import { Paper, Typography } from '@mui/material';
import Grid from '@mui/material/Grid'; // THE FIX: Standard MUI Grid, NO Grid2!

export default function EodSummary({ totals }) {
  const forensicTile = {
    p: 2, 
    borderRadius: 0, 
    border: '2px solid #5D4037',
    bgcolor: '#FFF9F7',
    boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    height: '100%',
    transition: 'all 0.1s ease',
    '&:hover': { transform: 'translate(1px, 1px)', boxShadow: '2px 2px 0px rgba(93, 64, 55, 0.1)' }
  };

  return (
    <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}>
            <Paper sx={{ ...forensicTile, borderLeft: '6px solid #2E7D32' }}>
                <Typography variant="caption" sx={{ fontWeight: '1000', color: '#757575', fontSize: '0.65rem', letterSpacing: 0.5 }}>CASH IN DRAWER</Typography>
                <Typography variant="h5" sx={{ fontWeight: '1000', color: '#2E7D32' }}>₱{totals.cash.toFixed(2)}</Typography>
            </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
            <Paper sx={{ ...forensicTile, borderLeft: '6px solid #1565C0' }}>
                <Typography variant="caption" sx={{ fontWeight: '1000', color: '#757575', fontSize: '0.65rem', letterSpacing: 0.5 }}>GCASH / MAYA</Typography>
                <Typography variant="h5" sx={{ fontWeight: '1000', color: '#1565C0' }}>₱{totals.gcash.toFixed(2)}</Typography>
            </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
            <Paper sx={{ ...forensicTile, borderLeft: '6px solid #F57C00' }}>
                <Typography variant="caption" sx={{ fontWeight: '1000', color: '#757575', fontSize: '0.65rem', letterSpacing: 0.5 }}>CARD & BANK</Typography>
                <Typography variant="h5" sx={{ fontWeight: '1000', color: '#F57C00' }}>₱{(totals.card + totals.bank).toFixed(2)}</Typography>
            </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
            <Paper sx={{ ...forensicTile, borderLeft: '6px solid #5D4037', bgcolor: '#FFF8E1', border: '2px solid #3E2723' }}>
                <Typography variant="caption" sx={{ fontWeight: '1000', color: '#5D4037', fontSize: '0.65rem', letterSpacing: 0.8 }}>TOTAL REVENUE</Typography>
                <Typography variant="h4" sx={{ fontWeight: '1000', color: '#3E2723', fontSize: '1.6rem' }}>₱{totals.total.toFixed(2)}</Typography>
                {totals.refunds > 0 && <Typography variant="caption" color="error" sx={{ fontWeight: '1000' }}>- ₱{totals.refunds.toFixed(2)} [REFUNDS]</Typography>}
            </Paper>
        </Grid>
    </Grid>
  );
}