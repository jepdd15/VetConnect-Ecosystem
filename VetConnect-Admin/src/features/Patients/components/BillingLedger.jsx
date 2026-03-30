import React from 'react';
import { Box, Typography, Paper, Chip } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

// Design Tokens
import { FONT, TYPE, COLORS, GLASS } from '../../../theme/designTokens';

export default function BillingLedger({ transactions }) {
  
  const columns =[
    { field: 'date', headerName: 'Date', width: 130, renderCell: (p) => <Typography sx={{ fontFamily: FONT, ...TYPE.meta }}>{new Date(p.value.seconds * 1000).toLocaleDateString()}</Typography> },
    { field: 'petName', headerName: 'Patient', width: 150, renderCell: (p) => <Typography sx={{ fontFamily: FONT, fontWeight: 'bold', color: COLORS.textPrimary }} variant="body2">{p.value}</Typography> },
    { field: 'total', headerName: 'Total', width: 120, renderCell: (p) => <Typography sx={{ fontFamily: FONT, fontWeight: 'bold' }}>₱{parseFloat(p.value||0).toFixed(2)}</Typography> },
    { field: 'depositPaid', headerName: 'Paid', width: 120, renderCell: (p) => <Typography sx={{ fontFamily: FONT, color: COLORS.success, fontWeight: 'bold' }}>₱{parseFloat(p.value||0).toFixed(2)}</Typography> },
    { 
      field: 'balance', headerName: 'Balance', width: 120,
      renderCell: (p) => {
        const bal = (parseFloat(p.row.total) || 0) - (parseFloat(p.row.depositPaid) || 0);
        const status = p.row.status || 'unpaid';
        if (status === 'paid' || status === 'refunded' || bal <= 0) return <Typography sx={{ fontFamily: FONT, color: COLORS.textMuted, fontWeight: 'bold' }} variant="body2">₱0.00</Typography>;
        return <Typography sx={{ fontFamily: FONT, color: COLORS.danger, fontWeight: 'bold' }} variant="body2">₱{bal.toFixed(2)}</Typography>;
      }
    },
    { 
      field: 'status', headerName: 'Status', width: 120, align: 'center', headerAlign: 'center',
      renderCell: (p) => {
        const bal = (parseFloat(p.row.total) || 0) - (parseFloat(p.row.depositPaid) || 0);
        const isPaid = bal <= 0 || p.row.status === 'paid';
        const finalStatus = p.row.status || (isPaid ? 'paid' : 'unpaid');
        return <Chip label={finalStatus.toUpperCase()} color={finalStatus === 'paid' ? "success" : finalStatus === 'refunded' ? "error" : "warning"} size="small" variant={finalStatus === 'paid' ? "outlined" : "filled"} sx={{fontFamily: FONT, fontWeight: 'bold', fontSize: '0.65rem'}} />;
      }
    },
  ];

  return (
    <Box sx={{ p: 4, bgcolor: 'transparent', flexGrow: 1 }}>
      <Typography variant="h6" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.accent, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <ReceiptLongIcon sx={{ color: COLORS.accentWarm }} /> Billing History & Ledger
      </Typography>
      
      {(!transactions || transactions.length === 0) ? (
        <Box sx={{ width: '100%', textAlign: 'center', py: 8, color: COLORS.textMuted, bgcolor: 'rgba(255,255,255,0.6)', borderRadius: 2, border: `1px dashed ${COLORS.border}` }}>
          <ReceiptLongIcon sx={{ fontSize: 60, mb: 1, opacity: 0.5, color: COLORS.timelineRail }} />
          <Typography sx={{ fontFamily: FONT, fontStyle: 'italic', color: COLORS.textMuted }}>No financial transactions found.</Typography>
        </Box>
      ) : (
        <Paper elevation={0} sx={{ height: 'calc(100vh - 280px)', minHeight: 400, width: '100%', borderRadius: 2, border: `1px solid ${COLORS.borderLight}`, ...GLASS.panel, overflow: 'hidden' }}>
          <DataGrid 
            rows={transactions} 
            columns={columns}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            pageSizeOptions={[10, 25, 50]}
            disableRowSelectionOnClick
            rowHeight={60}
            sx={{ 
                border: 'none', 
                fontFamily: FONT,
                bgcolor: 'transparent', 
                '& .MuiDataGrid-columnHeaders': { bgcolor: COLORS.panelBg, color: COLORS.accent, fontWeight: 'bold', fontFamily: FONT },
                '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', borderBottom: `1px solid ${COLORS.borderLight}` },
            }}
          />
        </Paper>
      )}
    </Box>
  );
}