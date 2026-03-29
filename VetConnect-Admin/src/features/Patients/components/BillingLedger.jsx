import React from 'react';
import { Box, Typography, Paper, Chip } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

export default function BillingLedger({ transactions }) {
  
  // THE FIX: Rebuilt with MUI DataGrid for enterprise consistency
  const columns =[
    { field: 'date', headerName: 'Date', width: 130, renderCell: (p) => new Date(p.value.seconds * 1000).toLocaleDateString() },
    { field: 'petName', headerName: 'Patient', width: 150, fontWeight: 'bold', renderCell: (p) => <Typography fontWeight="bold" color="#3E2723" variant="body2">{p.value}</Typography> },
    { field: 'total', headerName: 'Total', width: 120, renderCell: (p) => <Typography fontWeight="bold">₱{parseFloat(p.value||0).toFixed(2)}</Typography> },
    { field: 'depositPaid', headerName: 'Paid', width: 120, renderCell: (p) => <Typography color="success.main" fontWeight="bold">₱{parseFloat(p.value||0).toFixed(2)}</Typography> },
    { 
      field: 'balance', headerName: 'Balance', width: 120,
      renderCell: (p) => {
        const bal = (parseFloat(p.row.total) || 0) - (parseFloat(p.row.depositPaid) || 0);
        const status = p.row.status || 'unpaid';
        if (status === 'paid' || status === 'refunded' || bal <= 0) return <Typography color="textSecondary" variant="body2" fontWeight="bold">₱0.00</Typography>;
        return <Typography color="error" fontWeight="bold" variant="body2">₱{bal.toFixed(2)}</Typography>;
      }
    },
    { 
      field: 'status', headerName: 'Status', width: 120, align: 'center', headerAlign: 'center',
      renderCell: (p) => {
        const bal = (parseFloat(p.row.total) || 0) - (parseFloat(p.row.depositPaid) || 0);
        const isPaid = bal <= 0 || p.row.status === 'paid';
        const finalStatus = p.row.status || (isPaid ? 'paid' : 'unpaid');
        return <Chip label={finalStatus.toUpperCase()} color={finalStatus === 'paid' ? "success" : finalStatus === 'refunded' ? "error" : "warning"} size="small" variant={finalStatus === 'paid' ? "outlined" : "filled"} sx={{fontWeight: 'bold', fontSize: '0.65rem'}} />;
      }
    },
  ];

  return (
    <Box sx={{ p: 4, bgcolor: 'transparent', flexGrow: 1 }}>
      <Typography variant="h6" fontWeight="900" color="#5D4037" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <ReceiptLongIcon sx={{ color: '#8B4513' }} /> Billing History & Ledger
      </Typography>
      
      {(!transactions || transactions.length === 0) ? (
        <Box sx={{ width: '100%', textAlign: 'center', py: 8, color: '#aaa', bgcolor: 'rgba(255,255,255,0.6)', borderRadius: 2, border: '1px dashed #ccc' }}>
          <ReceiptLongIcon sx={{ fontSize: 60, mb: 1, opacity: 0.5 }} />
          <Typography fontStyle="italic">No financial transactions found.</Typography>
        </Box>
      ) : (
        <Paper elevation={0} sx={{ height: 'calc(100vh - 280px)', minHeight: 400, width: '100%', borderRadius: 2, border: '1px solid rgba(0,0,0,0.08)', bgcolor: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', overflow: 'hidden' }}>
          <DataGrid 
            rows={transactions} 
            columns={columns}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            pageSizeOptions={[10, 25, 50]}
            disableRowSelectionOnClick
            rowHeight={60}
            sx={{ 
                border: 'none', 
                bgcolor: 'transparent', 
                '& .MuiDataGrid-columnHeaders': { bgcolor: 'rgba(0,0,0,0.03)', color: '#5D4037', fontWeight: 'bold' },
                '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.05)' },
            }}
          />
        </Paper>
      )}
    </Box>
  );
}