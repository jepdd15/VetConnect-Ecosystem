import React from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip } from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

export default function BillingLedger({ transactions }) {
  return (
    <Box sx={{ p: 4, bgcolor: 'white', flexGrow: 1 }}>
      <Typography variant="h6" fontWeight="bold" color="#5D4037" sx={{ mb: 2 }}>Billing History & Ledger</Typography>
      {transactions.length === 0 ? (
        <Box sx={{ width: '100%', textAlign: 'center', py: 8, color: '#aaa', bgcolor: '#FAFAFA', borderRadius: 2, border: '1px dashed #ccc' }}>
          <ReceiptLongIcon sx={{ fontSize: 60, mb: 1, opacity: 0.5 }} />
          <Typography fontStyle="italic">No financial transactions found.</Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#EFEBE9' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Patient</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Total</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Paid</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Balance</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="center">Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.map((sale) => {
                const total = parseFloat(sale.total) || 0;
                const paid = parseFloat(sale.depositPaid) || 0;
                const balance = total - paid;
                const isPaid = balance <= 0;

                return (
                  <TableRow key={sale.id} hover>
                    <TableCell>{new Date(sale.date.seconds * 1000).toLocaleDateString()}</TableCell>
                    <TableCell fontWeight="bold">{sale.petName}</TableCell>
                    <TableCell align="right">₱{total.toFixed(2)}</TableCell>
                    <TableCell align="right" sx={{ color: 'green' }}>₱{paid.toFixed(2)}</TableCell>
                    <TableCell align="right">
                        {balance > 0 ? <Typography color="error" fontWeight="bold">₱{balance.toFixed(2)}</Typography> : "₱0.00"}
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={isPaid ? "PAID" : "UNPAID"} color={isPaid ? "success" : "error"} size="small" variant="outlined" />
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