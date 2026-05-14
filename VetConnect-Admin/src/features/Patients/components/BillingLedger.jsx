import React from 'react';
import { Box, Typography, Paper, Chip, Tooltip } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';

// Design Tokens
import { FONT, TYPE, COLORS, PANEL } from '../../../theme/designTokens';

const getMethodStyle = (method) => {
  if (method === 'Cash') return { icon: <AccountBalanceWalletIcon sx={{ fontSize: 14 }} />, color: COLORS.success };
  if (method?.includes('GCash')) return { icon: <PhoneIphoneIcon sx={{ fontSize: 14 }} />, color: COLORS.medical };
  if (method === 'Card') return { icon: <CreditCardIcon sx={{ fontSize: 14 }} />, color: COLORS.amber };
  return { icon: <AccountBalanceIcon sx={{ fontSize: 14 }} />, color: COLORS.grooming };
};

export default function BillingLedger({ transactions }) {

  const columns = [
    {
      field: 'date', headerName: 'DATE', width: 100,
      renderCell: (p) => {
        const d = p.value?.toDate?.() ?? (p.value?.seconds ? new Date(p.value.seconds * 1000) : new Date(p.value));
        return <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', fontWeight: 800, color: COLORS.textPrimary }}>{d.toLocaleDateString()}</Typography>;
      }
    },
    {
      field: 'receiptNumber', headerName: 'RECEIPT #', width: 150,
      renderCell: (p) => (
        <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 900, color: COLORS.brand, letterSpacing: 0.5 }}>
          {p.value || '—'}
        </Typography>
      )
    },
    {
      field: 'petName', headerName: 'PATIENT', flex: 1, minWidth: 90,
      renderCell: (p) => (
        <Typography sx={{ fontFamily: FONT, fontWeight: 800, color: COLORS.textPrimary, textTransform: 'uppercase', fontSize: '0.75rem' }}>
          {p.value || 'Counter Sale'}
        </Typography>
      )
    },
    {
      field: 'items', headerName: 'ITEMS', flex: 1.5, minWidth: 150,
      renderCell: (p) => {
        const items = p.value || [];
        if (items.length === 0) return <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.textMuted, fontStyle: 'italic' }}>—</Typography>;
        const preview = items.length <= 2
          ? items.map(i => `${i.qty || 1}× ${i.name}`).join(', ')
          : `${items.slice(0, 1).map(i => `${i.qty || 1}× ${i.name}`).join('')} +${items.length - 1} more`;
        const fullText = items.map(i => `${i.qty || 1}× ${i.name}`).join(', ');
        return (
          <Tooltip title={fullText} placement="top-start">
            <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', fontWeight: 600, color: COLORS.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {preview}
            </Typography>
          </Tooltip>
        );
      }
    },
    {
      field: 'total', headerName: 'TOTAL', width: 110,
      renderCell: (p) => (
        <Typography sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.brand, fontSize: '0.9rem' }}>
          ₱{parseFloat(p.value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </Typography>
      )
    },
    {
      field: 'paid', headerName: 'PAID', width: 110,
      renderCell: (p) => {
        const total = parseFloat(p.row.total || 0);
        const balance = parseFloat(p.row.balanceRemaining || 0);
        const paid = Math.max(0, total - balance);
        return (
          <Typography sx={{ fontFamily: FONT, color: COLORS.success, fontWeight: 900, fontSize: '0.9rem' }}>
            ₱{paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Typography>
        );
      }
    },
    {
      field: 'balanceRemaining', headerName: 'BALANCE', width: 110,
      renderCell: (p) => {
        const bal = parseFloat(p.value || 0);
        const status = p.row.status || '';
        if (status === 'refunded' || status === 'voided' || bal <= 0) {
          return <Typography sx={{ fontFamily: FONT, color: COLORS.textMuted, fontWeight: 800, fontSize: '0.85rem' }}>₱0.00</Typography>;
        }
        return <Typography sx={{ fontFamily: FONT, color: COLORS.danger, fontWeight: 900, fontSize: '0.9rem' }}>₱{bal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography>;
      }
    },
    {
      field: 'paymentMethod', headerName: 'METHOD', width: 120,
      renderCell: (p) => {
        const method = p.value || 'Cash';
        const tenders = p.row.paymentTenders;
        const isSplit = tenders && tenders.length > 1;
        const { icon, color } = getMethodStyle(method);
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', height: '100%' }}>
            <Chip 
              icon={icon} 
              label={method.toUpperCase()} 
              size="small" 
              sx={{ 
                borderRadius: 0, 
                bgcolor: color, 
                color: '#fff', 
                border: `2px solid ${COLORS.brand}`, 
                fontWeight: 900, 
                fontSize: '0.6rem', 
                height: 24, 
                px: 1,
                '& .MuiChip-icon': { color: '#fff !important' },
                boxShadow: `2px 2px 0px ${COLORS.brand}22`
              }} 
            />
            {isSplit && (
              <Typography variant="caption" sx={{ fontSize: '0.55rem', fontWeight: 900, color: COLORS.brand, letterSpacing: 0.5, mt: 0.25 }}>
                SPLIT ({tenders.length})
              </Typography>
            )}
          </Box>
        );
      }
    },
    {
      field: 'status', headerName: 'STATUS', width: 110, align: 'center', headerAlign: 'center',
      renderCell: (p) => {
        const bal = parseFloat(p.row.balanceRemaining || 0);
        const rawStatus = p.row.status || '';
        let finalStatus;
        if (rawStatus === 'refunded') finalStatus = 'refunded';
        else if (rawStatus === 'voided') finalStatus = 'voided';
        else if (bal > 0) finalStatus = 'unpaid';
        else finalStatus = 'paid';

        const chipBg = finalStatus === 'paid' ? COLORS.success : finalStatus === 'refunded' || finalStatus === 'voided' ? COLORS.danger : COLORS.warning;

        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 0.3 }}>
            <Chip 
              label={finalStatus.toUpperCase()} 
              size="small" 
              sx={{ 
                fontFamily: FONT, 
                fontWeight: 900, 
                fontSize: '0.6rem', 
                borderRadius: 0,
                bgcolor: chipBg,
                color: '#fff',
                border: `2px solid ${COLORS.brand}`,
                width: 80,
                boxShadow: `3px 3px 0px ${COLORS.brand}22`
              }} 
            />
            {finalStatus === 'refunded' && p.row.refundedAt && (
              <Typography variant="caption" sx={{ fontSize: '0.55rem', color: COLORS.danger, fontWeight: 900 }}>
                {new Date(p.row.refundedAt?.seconds ? p.row.refundedAt.seconds * 1000 : p.row.refundedAt).toLocaleDateString()}
              </Typography>
            )}
          </Box>
        );
      }
    },
  ];

  return (
    <Box sx={{ p: 4, bgcolor: 'transparent', flexGrow: 1 }}>
      <Typography variant="h6" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.accent, mb: 3, display: 'flex', alignItems: 'center', gap: 1.5, textTransform: 'uppercase', letterSpacing: 1 }}>
        <ReceiptLongIcon sx={{ color: COLORS.accentWarm }} /> Billing History & Ledger
      </Typography>

      {(!transactions || transactions.length === 0) ? (
        <Box sx={{ 
          width: '100%', textAlign: 'center', py: 12, 
          color: COLORS.textMuted, 
          bgcolor: COLORS.cream, 
          borderRadius: 0, 
          border: `2px dashed ${COLORS.brand}`,
          boxShadow: `6px 6px 0px ${COLORS.brand}11`
        }}>
          <ReceiptLongIcon sx={{ fontSize: 64, mb: 2, opacity: 0.2, color: COLORS.brand }} />
          <Typography sx={{ fontFamily: FONT, fontWeight: 800, textTransform: 'uppercase', fontSize: '0.85rem', color: COLORS.brand }}>
            No financial transactions found.
          </Typography>
        </Box>
      ) : (
        <Paper elevation={0} sx={{ 
          height: 'calc(100vh - 280px)', minHeight: 450, width: '100%', 
          borderRadius: 0,
          border: `2px solid ${COLORS.brand}`, 
          bgcolor: COLORS.cardBg,
          boxShadow: `8px 8px 0px ${COLORS.brand}11`,
          overflow: 'hidden' 
        }}>
          <DataGrid
            rows={transactions}
            columns={columns}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            pageSizeOptions={[10, 25, 50]}
            disableRowSelectionOnClick
            rowHeight={70}
            sx={{
                border: 'none',
                fontFamily: FONT,
                '& .MuiDataGrid-columnHeaders': { 
                  bgcolor: COLORS.panelBg, 
                  color: COLORS.brand,
                  fontWeight: 900, 
                  borderBottom: `3px solid ${COLORS.brand}`,
                  '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 900, letterSpacing: 0.5 }
                },
                '& .MuiDataGrid-cell': { 
                  display: 'flex', 
                  alignItems: 'center', 
                  borderBottom: `1px solid ${COLORS.borderLight}`,
                  fontWeight: 600
                },
                '& .MuiDataGrid-row:hover': {
                  bgcolor: `${COLORS.panelBg}44`
                },
                '& .MuiDataGrid-footerContainer': {
                  borderTop: `2px solid ${COLORS.brand}`,
                  bgcolor: COLORS.cream
                }
            }}
          />
        </Paper>
      )}
    </Box>
  );
}
