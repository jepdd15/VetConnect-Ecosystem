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
      field: 'date', headerName: 'Date', width: 100,
      renderCell: (p) => {
        const d = p.value?.toDate?.() ?? (p.value?.seconds ? new Date(p.value.seconds * 1000) : new Date(p.value));
        return <Typography sx={{ fontFamily: FONT, ...TYPE.meta }}>{d.toLocaleDateString()}</Typography>;
      }
    },
    {
      field: 'receiptNumber', headerName: 'Receipt #', width: 150,
      renderCell: (p) => (
        <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', fontWeight: 700, color: COLORS.accent, letterSpacing: 0.3 }}>
          {p.value || '—'}
        </Typography>
      )
    },
    {
      field: 'petName', headerName: 'Patient', flex: 1, minWidth: 90,
      renderCell: (p) => (
        <Typography sx={{ fontFamily: FONT, fontWeight: 'bold', color: COLORS.textPrimary }} variant="body2">
          {p.value || 'Counter Sale'}
        </Typography>
      )
    },
    {
      field: 'items', headerName: 'Items', flex: 1, minWidth: 100,
      renderCell: (p) => {
        const items = p.value || [];
        if (items.length === 0) return <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', color: COLORS.textMuted, fontStyle: 'italic' }}>—</Typography>;
        const preview = items.length <= 2
          ? items.map(i => `${i.qty || 1}× ${i.name}`).join(', ')
          : `${items.slice(0, 1).map(i => `${i.qty || 1}× ${i.name}`).join('')} +${items.length - 1} more`;
        const fullText = items.map(i => `${i.qty || 1}× ${i.name}`).join(', ');
        return (
          <Tooltip title={fullText} placement="top-start">
            <Typography sx={{ fontFamily: FONT, fontSize: '0.7rem', fontWeight: 700, color: COLORS.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {preview}
            </Typography>
          </Tooltip>
        );
      }
    },
    {
      field: 'total', headerName: 'Total', width: 100,
      renderCell: (p) => (
        <Typography sx={{ fontFamily: FONT, fontWeight: 'bold' }}>
          ₱{parseFloat(p.value || 0).toFixed(2)}
        </Typography>
      )
    },
    {
      field: 'paid', headerName: 'Paid', width: 100,
      renderCell: (p) => {
        const total = parseFloat(p.row.total || 0);
        const balance = parseFloat(p.row.balanceRemaining || 0);
        const paid = Math.max(0, total - balance);
        return (
          <Typography sx={{ fontFamily: FONT, color: COLORS.success, fontWeight: 'bold' }}>
            ₱{paid.toFixed(2)}
          </Typography>
        );
      }
    },
    {
      field: 'balanceRemaining', headerName: 'Balance', width: 90,
      renderCell: (p) => {
        const bal = parseFloat(p.value || 0);
        const status = p.row.status || '';
        if (status === 'refunded' || status === 'voided' || bal <= 0) {
          return <Typography sx={{ fontFamily: FONT, color: COLORS.textMuted, fontWeight: 'bold' }} variant="body2">₱0.00</Typography>;
        }
        return <Typography sx={{ fontFamily: FONT, color: COLORS.danger, fontWeight: 'bold' }} variant="body2">₱{bal.toFixed(2)}</Typography>;
      }
    },
    {
      field: 'paymentMethod', headerName: 'Method', width: 100,
      renderCell: (p) => {
        const method = p.value || 'Cash';
        const tenders = p.row.paymentTenders;
        const isSplit = tenders && tenders.length > 1;
        const { icon, color } = getMethodStyle(method);
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', height: '100%' }}>
            <Chip icon={icon} label={method} size="small" sx={{ borderRadius: 0, bgcolor: COLORS.cardBg, color, border: `1px solid ${color}`, fontWeight: 900, fontSize: '0.6rem', height: 22, '& .MuiChip-icon': { color } }} />
            {isSplit && (
              <Typography variant="caption" sx={{ fontSize: '0.55rem', fontWeight: 900, color: COLORS.sky, letterSpacing: 0.3 }}>
                SPLIT ({tenders.length})
              </Typography>
            )}
          </Box>
        );
      }
    },
    {
      field: 'status', headerName: 'Status', width: 90, align: 'center', headerAlign: 'center',
      renderCell: (p) => {
        const bal = parseFloat(p.row.balanceRemaining || 0);
        const rawStatus = p.row.status || '';
        let finalStatus;
        if (rawStatus === 'refunded') finalStatus = 'refunded';
        else if (rawStatus === 'voided') finalStatus = 'voided';
        else if (bal > 0) finalStatus = 'unpaid';
        else finalStatus = 'paid';

        const chipColor = finalStatus === 'paid' ? 'success' : finalStatus === 'refunded' || finalStatus === 'voided' ? 'error' : 'warning';
        const chipVariant = finalStatus === 'paid' ? 'outlined' : 'filled';

        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 0.3 }}>
            <Chip label={finalStatus.toUpperCase()} color={chipColor} size="small" variant={chipVariant} sx={{ fontFamily: FONT, fontWeight: 'bold', fontSize: '0.6rem' }} />
            {finalStatus === 'refunded' && p.row.refundedAt && (
              <Typography variant="caption" sx={{ fontSize: '0.5rem', color: COLORS.danger, fontWeight: 700 }}>
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
      <Typography variant="h6" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.accent, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <ReceiptLongIcon sx={{ color: COLORS.accentWarm }} /> Billing History & Ledger
      </Typography>

      {(!transactions || transactions.length === 0) ? (
        <Box sx={{ width: '100%', textAlign: 'center', py: 8, color: COLORS.textMuted, bgcolor: 'rgba(255,255,255,0.6)', borderRadius: 0, border: `1px dashed ${COLORS.border}` }}>
          <ReceiptLongIcon sx={{ fontSize: 60, mb: 1, opacity: 0.5, color: COLORS.timelineRail }} />
          <Typography sx={{ fontFamily: FONT, fontStyle: 'italic', color: COLORS.textMuted }}>No financial transactions found.</Typography>
        </Box>
      ) : (
        <Paper elevation={0} sx={{ height: 'calc(100vh - 280px)', minHeight: 400, width: '100%', border: `1px solid ${COLORS.borderLight}`, ...PANEL.elevated, overflow: 'hidden' }}>
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
