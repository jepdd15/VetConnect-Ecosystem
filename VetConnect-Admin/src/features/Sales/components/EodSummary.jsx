import React from 'react';
import { Paper, Typography } from '@mui/material';
import Grid from '@mui/material/Grid'; // THE FIX: Standard MUI Grid, NO Grid2!
import { COLORS } from '../../../theme/designTokens';

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
      border: `2px solid ${COLORS.brand}`,
      bgcolor: isActive ? COLORS.brand : COLORS.formBg,
      boxShadow: isActive ? `1px 1px 0px ${COLORS.accent}33` : `4px 4px 0px ${COLORS.accent}1A`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      height: '100%',
      cursor: 'pointer',
      transition: 'all 0.15s ease-in-out',
      '&:hover': {
        transform: isActive ? 'none' : 'translate(1px, 1px)',
        boxShadow: isActive ? `1px 1px 0px ${COLORS.accent}33` : `2px 2px 0px ${COLORS.accent}1A`,
        bgcolor: isActive ? COLORS.brand : COLORS.peach
      }
    };
  };

  return (
    <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }} onClick={() => handleToggle('Cash')}>
            <Paper sx={{ ...forensicTile('Cash'), borderLeft: filterMethod.includes('Cash') ? `12px solid ${COLORS.success}` : `6px solid ${COLORS.success}` }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: filterMethod.includes('Cash') ? COLORS.cream : COLORS.textMuted, fontSize: '0.65rem', letterSpacing: 0.5 }}>CASH IN DRAWER</Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, color: filterMethod.includes('Cash') ? COLORS.cream : COLORS.success }}>₱{totals.cash.toFixed(2)}</Typography>
            </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }} onClick={() => handleToggle('GCash')}>
            <Paper sx={{ ...forensicTile('GCash'), borderLeft: filterMethod.includes('GCash') ? `12px solid ${COLORS.medical}` : `6px solid ${COLORS.medical}` }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: filterMethod.includes('GCash') ? COLORS.cream : COLORS.textMuted, fontSize: '0.65rem', letterSpacing: 0.5 }}>GCASH / MAYA</Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, color: filterMethod.includes('GCash') ? COLORS.cream : COLORS.medical }}>₱{totals.gcash.toFixed(2)}</Typography>
            </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }} onClick={() => handleToggle('Card')}>
            <Paper sx={{ ...forensicTile('Card'), borderLeft: filterMethod.includes('Card') ? `12px solid ${COLORS.amber}` : `6px solid ${COLORS.amber}` }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: filterMethod.includes('Card') ? COLORS.cream : COLORS.textMuted, fontSize: '0.65rem', letterSpacing: 0.5 }}>CARD & BANK</Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, color: filterMethod.includes('Card') ? COLORS.cream : COLORS.amber }}>₱{(totals.card + totals.bank).toFixed(2)}</Typography>
            </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }} onClick={() => handleToggle('All')}>
            <Paper sx={{
              ...forensicTile('All'),
              borderLeft: filterMethod.includes('All') ? `12px solid ${COLORS.brand}` : `6px solid ${COLORS.brand}`,
              bgcolor: filterMethod.includes('All') ? COLORS.brand : COLORS.cream
            }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: filterMethod.includes('All') ? COLORS.cream : COLORS.accent, fontSize: '0.65rem', letterSpacing: 0.8 }}>COLLECTED TODAY</Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, color: filterMethod.includes('All') ? COLORS.cream : COLORS.brand, fontSize: '1.6rem' }}>₱{totals.totalCollected.toFixed(2)}</Typography>
                <Typography variant="caption" sx={{ fontWeight: 800, color: filterMethod.includes('All') ? `${COLORS.cream}99` : COLORS.accentLight, fontSize: '0.6rem' }}>
                    ₱{totals.totalBilled.toFixed(2)} total billed
                </Typography>
                {totals.totalDeposits > 0 && (
                    <Typography variant="caption" sx={{ fontWeight: 800, color: filterMethod.includes('All') ? `${COLORS.cream}80` : COLORS.textMuted, fontSize: '0.55rem' }}>
                        (₱{totals.totalDeposits.toFixed(2)} via prior deposits)
                    </Typography>
                )}
                {/* T4.149: Custom discount total — visible when non-zero for management oversight */}
                {totals.totalCustomDiscounts > 0 && (
                    <Typography variant="caption" sx={{ fontWeight: 800, color: filterMethod.includes('All') ? `${COLORS.cream}80` : COLORS.amber, fontSize: '0.55rem' }}>
                        (₱{totals.totalCustomDiscounts.toFixed(2)} custom discounts)
                    </Typography>
                )}
                {totals.refunds > 0 && <Typography variant="caption" color={filterMethod.includes('All') ? "white" : "error"} sx={{ fontWeight: 800 }}>REFUNDS TODAY: ₱{totals.refunds.toFixed(2)}</Typography>}
            </Paper>
        </Grid>
    </Grid>
  );
}