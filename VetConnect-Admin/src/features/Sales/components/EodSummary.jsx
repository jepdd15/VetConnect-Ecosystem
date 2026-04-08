import React from 'react';
import { Paper, Typography } from '@mui/material';
import Grid from '@mui/material/Grid'; // THE FIX: Standard MUI Grid, NO Grid2!

export default function EodSummary({ totals, filterMethod, setFilterMethod }) {
  const handleToggle = (method) => {
    if (method === 'All') {
      setFilterMethod(['All']);
      return;
    }
    
    let next;
    if (filterMethod.includes(method)) {
      // Logic: If already selected, remove it. If result is empty, default to 'All'.
      next = filterMethod.filter(m => m !== method);
      if (next.length === 0) next = ['All'];
    } else {
      // Logic: If not selected, add it and purge 'All'.
      next = [...filterMethod.filter(m => m !== 'All'), method];
    }
    setFilterMethod(next);
  };

  const forensicTile = (method) => {
    const isActive = filterMethod.includes(method);
    return {
      p: 2, 
      borderRadius: 0, 
      border: '2px solid #3E2723',
      bgcolor: isActive ? '#3E2723' : '#FFF9F7',
      boxShadow: isActive ? '1px 1px 0px rgba(93, 64, 55, 0.2)' : '4px 4px 0px rgba(93, 64, 55, 0.1)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      height: '100%',
      cursor: 'pointer',
      transition: 'all 0.15s ease-in-out',
      '&:hover': { 
        transform: isActive ? 'none' : 'translate(1px, 1px)', 
        boxShadow: isActive ? '1px 1px 0px rgba(93, 64, 55, 0.2)' : '2px 2px 0px rgba(93, 64, 55, 0.1)',
        bgcolor: isActive ? '#3E2723' : '#FFF3E0'
      }
    };
  };

  return (
    <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }} onClick={() => handleToggle('Cash')}>
            <Paper sx={{ ...forensicTile('Cash'), borderLeft: filterMethod.includes('Cash') ? '12px solid #2E7D32' : '6px solid #2E7D32' }}>
                <Typography variant="caption" sx={{ fontWeight: '1000', color: filterMethod.includes('Cash') ? '#FFF8E1' : '#757575', fontSize: '0.65rem', letterSpacing: 0.5 }}>CASH IN DRAWER</Typography>
                <Typography variant="h5" sx={{ fontWeight: '1000', color: filterMethod.includes('Cash') ? '#FFF8E1' : '#2E7D32' }}>₱{totals.cash.toFixed(2)}</Typography>
            </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }} onClick={() => handleToggle('GCash')}>
            <Paper sx={{ ...forensicTile('GCash'), borderLeft: filterMethod.includes('GCash') ? '12px solid #1565C0' : '6px solid #1565C0' }}>
                <Typography variant="caption" sx={{ fontWeight: '1000', color: filterMethod.includes('GCash') ? '#FFF8E1' : '#757575', fontSize: '0.65rem', letterSpacing: 0.5 }}>GCASH / MAYA</Typography>
                <Typography variant="h5" sx={{ fontWeight: '1000', color: filterMethod.includes('GCash') ? '#FFF8E1' : '#1565C0' }}>₱{totals.gcash.toFixed(2)}</Typography>
            </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }} onClick={() => handleToggle('Card')}>
            <Paper sx={{ ...forensicTile('Card'), borderLeft: filterMethod.includes('Card') ? '12px solid #F57C00' : '6px solid #F57C00' }}>
                <Typography variant="caption" sx={{ fontWeight: '1000', color: filterMethod.includes('Card') ? '#FFF8E1' : '#757575', fontSize: '0.65rem', letterSpacing: 0.5 }}>CARD & BANK</Typography>
                <Typography variant="h5" sx={{ fontWeight: '1000', color: filterMethod.includes('Card') ? '#FFF8E1' : '#F57C00' }}>₱{(totals.card + totals.bank).toFixed(2)}</Typography>
            </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }} onClick={() => handleToggle('All')}>
            <Paper sx={{ 
              ...forensicTile('All'), 
              borderLeft: filterMethod.includes('All') ? '12px solid #3E2723' : '6px solid #3E2723',
              bgcolor: filterMethod.includes('All') ? '#3E2723' : '#FFF8E1' 
            }}>
                <Typography variant="caption" sx={{ fontWeight: '1000', color: filterMethod.includes('All') ? '#FFF8E1' : '#5D4037', fontSize: '0.65rem', letterSpacing: 0.8 }}>TOTAL REVENUE</Typography>
                <Typography variant="h4" sx={{ fontWeight: '1000', color: filterMethod.includes('All') ? '#FFF8E1' : '#3E2723', fontSize: '1.6rem' }}>₱{totals.total.toFixed(2)}</Typography>
                {totals.refunds > 0 && <Typography variant="caption" color={filterMethod.includes('All') ? "white" : "error"} sx={{ fontWeight: '1000' }}>- ₱{totals.refunds.toFixed(2)} [REFUNDS]</Typography>}
            </Paper>
        </Grid>
    </Grid>
  );
}