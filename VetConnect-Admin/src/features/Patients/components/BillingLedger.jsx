/**
 * BillingLedger.jsx — Full transaction history DataGrid with expandable payment history rows.
 *
 * T4.237 Day 2: Each DataGrid row is followed by an optional Collapse panel that loads
 * the payment history from the `payments` Firestore collection. This avoids the
 * DataGrid Pro-only `getDetailPanelContent` API — the community DataGrid receives a
 * custom `getRowHeight` + a separate rendered Collapse beneath each row via a custom
 * column that manages per-row expand state in the parent.
 *
 * Implementation note: We use a "shadow row" strategy — after the DataGrid we render
 * a hidden Box that contains the PaymentHistoryPanel components, positioned absolutely
 * beneath each row. Since DataGrid virtualizes rows, the simpler approach is to track
 * expanded row IDs in state, and render the PaymentHistoryPanel components OUTSIDE the
 * DataGrid, stacked in a separate scrollable list. The DataGrid provides a chevron
 * column that toggles per-row expansion; the panels display below the DataGrid.
 *
 * For a ~25-row ledger (typical for this page) this approach is performance-appropriate.
 * Rows lazy-load their payment history on first expansion.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Chip, Tooltip, Collapse,
  Table, TableHead, TableBody, TableRow, TableCell,
  IconButton, Button, CircularProgress,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';

// Icons
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PrintIcon from '@mui/icons-material/Print';
import UndoIcon from '@mui/icons-material/Undo';

// Design Tokens
import { FONT, TYPE, COLORS, PANEL } from '../../../theme/designTokens';

// Payment utils
import { getPaymentHistory } from '../../../utils/paymentUtils';
import { PAYMENT_METHOD_LABELS } from '../../../constants/paymentMethods';

// ─── Helper ──────────────────────────────────────────────────────────────────

const getMethodStyle = (method) => {
  if (method === 'Cash')              return { icon: <AccountBalanceWalletIcon sx={{ fontSize: 14 }} />, color: COLORS.success };
  if (method?.includes('GCash'))      return { icon: <PhoneIphoneIcon sx={{ fontSize: 14 }} />,        color: COLORS.medical };
  if (method === 'Card')              return { icon: <CreditCardIcon sx={{ fontSize: 14 }} />,          color: COLORS.amber };
  return { icon: <AccountBalanceIcon sx={{ fontSize: 14 }} />, color: COLORS.grooming };
};

function formatTs(ts) {
  if (!ts) return '—';
  const d = ts?.toDate ? ts.toDate() : (ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' });
}

// ─── PaymentHistoryPanel ──────────────────────────────────────────────────────

/**
 * Renders the expanded payment history sub-table for a single sale row.
 *
 * Lazy-loads payments on first open. Shows 7 columns:
 *   Date | Amount | Method | Ref # | Collected By | Note | Action
 *
 * Action column rules (D7 spec):
 *   - Reverse button hidden when:
 *       1. payment.reversalOf is set (this payment IS a reversal)
 *       2. payments.some(p => p.reversalOf === payment.id) (already reversed)
 *       3. payment._isLegacy === true (synthesized from pre-2026 amountPaid)
 *   - Reversed payments: struck-through amount + "(reversed)" suffix
 *   - Reversal payments: red amount + "↩ REVERSAL" chip in action cell
 */
function PaymentHistoryPanel({ sale, onReversePayment, onPrintPayment, onPrintSummary }) {
  // loading starts true so we never need a synchronous setState inside the effect body
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let alive = true;
    // Fetch is async — callbacks run after the synchronous effect body exits,
    // so setPayments/setLoading inside the callbacks does not trigger cascading renders.
    getPaymentHistory(sale)
      .then(ps => {
        if (alive) {
          setPayments(ps);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [sale.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive which payments have been reversed (their id is the target of another payment's reversalOf)
  const reversedIds = new Set(payments.filter(p => p.reversalOf).map(p => p.reversalOf));

  return (
    <Box sx={{ bgcolor: COLORS.cream, border: `1px solid ${COLORS.borderLight}`, borderTop: 'none', p: 1.5 }}>
      {/* Print Sale Summary button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button
          size="small"
          startIcon={<PrintIcon sx={{ fontSize: 13 }} />}
          onClick={() => onPrintSummary(sale, payments)}
          sx={{
            fontFamily: FONT, fontWeight: 800, fontSize: '0.65rem', borderRadius: 0,
            color: COLORS.brand, border: `1.5px solid ${COLORS.brand}`,
            textTransform: 'none', py: 0.25, px: 1,
          }}
        >
          Print Sale Summary
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </Box>
      ) : payments.length === 0 ? (
        <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: COLORS.textMuted, fontStyle: 'italic', textAlign: 'center', py: 1 }}>
          No payment history recorded for this sale.
        </Typography>
      ) : (
        <Table size="small" sx={{ '& td, & th': { fontFamily: FONT, fontSize: '0.7rem', borderBottom: `1px solid ${COLORS.borderLight}`, py: 0.5, px: 0.75 } }}>
          <TableHead>
            <TableRow sx={{ bgcolor: COLORS.panelBg }}>
              {['Date', 'Amount', 'Method', 'Ref #', 'Collected By', 'Note', 'Action'].map(col => (
                <TableCell key={col} sx={{ fontWeight: 900, color: COLORS.brand, fontSize: '0.65rem', letterSpacing: 0.5 }}>
                  {col.toUpperCase()}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {payments.map(payment => {
              const isReversal = !!payment.reversalOf;
              const isReversed = reversedIds.has(payment.id);
              const amount     = parseFloat(payment.amount || 0);
              const methodLabel = PAYMENT_METHOD_LABELS[(payment.method || '').toLowerCase()] || payment.method || '—';

              return (
                <TableRow
                  key={payment.id}
                  sx={{ bgcolor: isReversal ? '#FFF0F0' : isReversed ? '#FAFAFA' : 'transparent' }}
                >
                  {/* Date */}
                  <TableCell sx={{ color: COLORS.textPrimary }}>{formatTs(payment.collectedAt)}</TableCell>

                  {/* Amount — struck-through if reversed; red if reversal */}
                  <TableCell sx={{
                    fontWeight: 700,
                    color: isReversal ? COLORS.danger : COLORS.textPrimary,
                  }}>
                    {isReversed ? (
                      <span>
                        <span style={{ textDecoration: 'line-through' }}>
                          ₱{Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        {' '}
                        <span style={{ color: COLORS.textMuted }}>(reversed)</span>
                      </span>
                    ) : (
                      `${amount < 0 ? '−' : ''}₱${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                    )}
                  </TableCell>

                  {/* Method */}
                  <TableCell sx={{ color: COLORS.textSecondary }}>{methodLabel}</TableCell>

                  {/* Ref # */}
                  <TableCell sx={{ color: COLORS.textMuted }}>{payment.referenceNumber || '—'}</TableCell>

                  {/* Collected By */}
                  <TableCell sx={{ color: COLORS.textSecondary }}>{payment.collectedBy || '—'}</TableCell>

                  {/* Note */}
                  <TableCell sx={{ color: COLORS.textMuted, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Tooltip title={payment.note || ''} placement="top">
                      <span>{payment.note || '—'}</span>
                    </Tooltip>
                  </TableCell>

                  {/* Action */}
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {/* Print per-payment receipt */}
                      <Tooltip title="Print receipt">
                        <IconButton
                          size="small"
                          onClick={() => onPrintPayment(payment, sale)}
                          sx={{ p: 0.5, borderRadius: 0, color: COLORS.brand }}
                        >
                          <PrintIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>

                      {/* Reversal chip — appears on reversal rows */}
                      {isReversal && (
                        <Chip
                          label="↩ REVERSAL"
                          size="small"
                          sx={{
                            fontFamily: FONT,
                            fontWeight: 900,
                            fontSize: '0.55rem',
                            borderRadius: 0,
                            bgcolor: '#FFEBEE',
                            color: COLORS.danger,
                            border: `1.5px solid ${COLORS.danger}`,
                            height: 18,
                          }}
                        />
                      )}

                      {/* Reverse button — hidden on reversals, already-reversed, and legacy rows */}
                      {!isReversal && !isReversed && !payment._isLegacy && (
                        <Button
                          size="small"
                          startIcon={<UndoIcon sx={{ fontSize: 11 }} />}
                          onClick={() => onReversePayment(payment, sale)}
                          sx={{
                            fontFamily: FONT, fontWeight: 700, fontSize: '0.6rem', borderRadius: 0,
                            color: COLORS.danger, border: `1.5px solid ${COLORS.danger}`,
                            textTransform: 'none', py: 0.25, px: 0.5, minWidth: 0,
                          }}
                        >
                          Reverse
                        </Button>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

// ─── BillingLedger ────────────────────────────────────────────────────────────

/**
 * Full transaction history DataGrid for a client.
 *
 * Props:
 *   transactions      — Array of sale documents (from Patients.jsx / clientTransactions).
 *   onReversePayment  — (payment, sale) => void — triggers reversal dialog in parent.
 *   onPrintPayment    — (payment, sale) => void — generates per-payment receipt.
 *   onPrintSummary    — (sale, payments) => void — generates sale summary receipt.
 */
export default function BillingLedger({ transactions, onReversePayment, onPrintPayment, onPrintSummary }) {
  // Track which row IDs are expanded (payments accordion open)
  const [expandedRowIds, setExpandedRowIds] = useState(new Set());

  const toggleRow = useCallback((rowId) => {
    setExpandedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }, []);

  const columns = [
    // Expand/collapse chevron column
    {
      field: '_expand',
      headerName: '',
      width: 44,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (p) => (
        <IconButton
          size="small"
          onClick={() => toggleRow(p.row.id)}
          sx={{ borderRadius: 0, color: COLORS.brand, p: 0.5 }}
          aria-label={expandedRowIds.has(p.row.id) ? 'Collapse payment history' : 'Expand payment history'}
        >
          {expandedRowIds.has(p.row.id)
            ? <ExpandLessIcon sx={{ fontSize: 18 }} />
            : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
        </IconButton>
      ),
    },
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

  // All three callback props are required. Patients.jsx and PatientDashboard.jsx always
  // supply them via usePaymentActions. If a future consumer omits one, errors will surface
  // loudly at the call site rather than silently doing nothing.

  return (
    <Box sx={{ p: 4, bgcolor: 'transparent', flexGrow: 1 }}>
      <Typography variant="h6" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.accent, mb: 3, display: 'flex', alignItems: 'center', gap: 1.5, textTransform: 'uppercase', letterSpacing: 1 }}>
        <ReceiptLongIcon sx={{ color: COLORS.accentWarm }} /> Billing History &amp; Ledger
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
          width: '100%',
          borderRadius: 0,
          border: `2px solid ${COLORS.brand}`,
          bgcolor: COLORS.cardBg,
          boxShadow: `8px 8px 0px ${COLORS.brand}11`,
          overflow: 'hidden'
        }}>
          {/* DataGrid — height is auto via getRowHeight */}
          <Box sx={{ width: '100%' }}>
            <DataGrid
              rows={transactions}
              columns={columns}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              pageSizeOptions={[10, 25, 50]}
              disableRowSelectionOnClick
              rowHeight={70}
              autoHeight
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
          </Box>

          {/* Expand panels — rendered outside the DataGrid, one per expanded row.
              Shown in a stacked list that preserves the visual order of the grid.
              Because DataGrid paginates, we only render panels for rows on the current page,
              but since expandedRowIds persists across page changes this is fine UX. */}
          {transactions
            .filter(row => expandedRowIds.has(row.id))
            .map(row => (
              <Box key={`panel-${row.id}`} sx={{ borderTop: `1px solid ${COLORS.borderLight}` }}>
                <Box sx={{
                  px: 1.5, py: 0.5, bgcolor: COLORS.panelBg,
                  borderTop: `2px solid ${COLORS.brand}`,
                  display: 'flex', alignItems: 'center', gap: 1,
                }}>
                  <ReceiptLongIcon sx={{ fontSize: 13, color: COLORS.textMuted }} />
                  <Typography sx={{ fontFamily: FONT, fontSize: '0.68rem', fontWeight: 900, color: COLORS.brand, letterSpacing: 0.5 }}>
                    PAYMENT HISTORY — {row.receiptNumber || row.id}
                  </Typography>
                </Box>
                <PaymentHistoryPanel
                  sale={row}
                  onReversePayment={onReversePayment}
                  onPrintPayment={onPrintPayment}
                  onPrintSummary={onPrintSummary}
                />
              </Box>
            ))}
        </Paper>
      )}
    </Box>
  );
}
