import React from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip } from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

export default function BillingLedger({ transactions }) {
  return (
    <Box sx={{ p: 4, bgcolor: 'transparent', flexGrow: 1 }}>
      <Typography variant="h6" fontWeight="bold" color="#5D4037" sx={{ mb: 2 }}>Billing History & Ledger</Typography>
      
      {transactions.length === 0 ? (
        <Box sx={{ width: '100%', textAlign: 'center', py: 8, color: '#aaa', bgcolor: 'rgba(255,255,255,0.6)', borderRadius: 2, border: '1px dashed #ccc' }}>
          <ReceiptLongIcon sx={{ fontSize: 60, mb: 1, opacity: 0.5 }} />
          <Typography fontStyle="italic">No financial transactions found.</Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 2, border: '1px solid rgba(0,0,0,0.08)', bgcolor: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)' }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.03)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', color: '#5D4037', py: 1.5 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold', color: '#5D4037' }}>Patient</TableCell>
                <TableCell sx={{ fontWeight: 'bold', color: '#5D4037' }} align="right">Total</TableCell>
                <TableCell sx={{ fontWeight: 'bold', color: '#5D4037' }} align="right">Paid</TableCell>
                <TableCell sx={{ fontWeight: 'bold', color: '#5D4037' }} align="right">Balance</TableCell>
                <TableCell sx={{ fontWeight: 'bold', color: '#5D4037' }} align="center">Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.map((sale) => {
                const total = parseFloat(sale.total) || 0;
                const paid = parseFloat(sale.depositPaid) || 0;
                const balance = total - paid;
                const isPaid = balance <= 0;

                return (
                  <TableRow key={sale.id} hover sx={{ '& > td': { borderBottom: '1px solid rgba(0,0,0,0.04)' } }}>
                    <TableCell>{new Date(sale.date.seconds * 1000).toLocaleDateString()}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', color: '#3E2723' }}>{sale.petName}</TableCell>
                    <TableCell align="right">₱{total.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ color: '#2E7D32', fontWeight: 'bold' }}>₱{paid.toFixed(2)}</TableCell>
                    <TableCell align="right">
                        {balance > 0 ? <Typography color="error" fontWeight="bold" variant="body2">₱{balance.toFixed(2)}</Typography> : <Typography color="textSecondary" variant="body2">₱0.00</Typography>}
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={isPaid ? "PAID" : "UNPAID"} color={isPaid ? "success" : "error"} size="small" variant={isPaid ? "outlined" : "filled"} sx={{fontWeight: 'bold', fontSize: '0.65rem'}} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}