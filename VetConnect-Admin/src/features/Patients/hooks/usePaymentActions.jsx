/**
 * usePaymentActions — shared payment action logic for the Billing Ledger.
 *
 * Extracted from PatientDashboard.jsx (T4.237 Day 3) so that Patients.jsx can
 * wire the same dialogs + handlers into its own BillingLedger instance without
 * duplicating any business logic.
 *
 * Usage:
 *   const paymentActions = usePaymentActions({ owner, ownerSales, setOwnerSales });
 *   // In JSX: {paymentActions.paymentDialogs}
 *   // Pass to BillingLedger:
 *   //   onReversePayment={paymentActions.handleReversePayment}
 *   //   onPrintPayment={paymentActions.handlePrintPayment}
 *   //   onPrintSummary={paymentActions.handlePrintSummary}
 *
 * @param {Object}   owner         — Firestore user doc for the owner (needs id, fullName,
 *                                   email, phone, expoPushToken).
 * @param {Array}    ownerSales    — Array of sale docs for optimistic local state updates.
 * @param {Function} setOwnerSales — Setter for ownerSales. Optional: when omitted (e.g.
 *                                   Patients.jsx where the onSnapshot listener handles
 *                                   refresh), optimistic updates are skipped and Firestore
 *                                   propagates the change via the real-time listener.
 */

import React, { useState, useEffect } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, MenuItem, Select, TextField, Typography,
} from '@mui/material';
import { collection, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';

import { db } from '../../../firebaseConfig';
import {
  getPaymentHistory,
  recomputeBalance,
  buildPaymentDocPayload,
  validatePaymentInput,
} from '../../../utils/paymentUtils';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  isRefNumberRequired,
} from '../../../constants/paymentMethods';
import {
  printViaIframe,
  generatePaymentReceipt,
  generateSaleSummaryReceipt,
} from '../../../utils/receiptUtils';
import { computeSingleOwnerBalanceReminder } from '../../../utils/computeBalanceReminderQueue';
import { useUser } from '../../../context/UserContext';
import { useClinicSettings } from '../../../hooks/useClinicSettings';
import { FONT, COLORS } from '../../../theme/designTokens';
import PrintIcon from '@mui/icons-material/Print';

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePaymentActions({ owner, ownerSales, setOwnerSales }) {
  const { profile } = useUser();
  const clinicSettings = useClinicSettings();

  // Normalize: when setOwnerSales is not provided (Patients.jsx pattern where the
  // onSnapshot listener refreshes clientTransactions automatically), use a no-op so
  // all handler code can call it unconditionally.
  const updateLocalSales = setOwnerSales ?? (() => {});

  // ── Record Payment dialog state ───────────────────────────────────────────
  const [recordPaymentOpen, setRecordPaymentOpen]     = useState(false);
  const [recordPaymentTarget, setRecordPaymentTarget] = useState(null);
  const [recordPaymentAmount, setRecordPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod]             = useState('cash');
  const [paymentRefNo, setPaymentRefNo]               = useState('');
  const [paymentNote, setPaymentNote]                 = useState('');

  // ── Settle dialog state ───────────────────────────────────────────────────
  const [settleTarget, setSettleTarget] = useState(null);

  // ── Reverse dialog state ──────────────────────────────────────────────────
  const [reverseTarget, setReverseTarget] = useState(null); // { payment, sale }
  const [reverseNote, setReverseNote]     = useState('');

  // ── Error snackbar state (parent renders the Snackbar) ───────────────────
  const [errorSnack, setErrorSnack] = useState('');

  // Pre-fill the reversal note whenever a new reverseTarget is selected.
  useEffect(() => {
    if (reverseTarget?.payment?.id) {
      setReverseNote(`Reversal of payment ${reverseTarget.payment.id}`);
    }
  }, [reverseTarget]);

  // ── Internal helper ───────────────────────────────────────────────────────

  /** Resolve the display name for the currently logged-in staff member. */
  const resolveStaffName = () =>
    profile
      ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.fullName || 'Staff'
      : 'Staff';

  /** Recompute total outstanding debt across all non-voided/refunded sales. */
  const computeTotalDebt = (sales) =>
    (sales ?? ownerSales ?? [])
      .filter((s) => s.status !== 'refunded' && s.status !== 'voided')
      .reduce((sum, s) => sum + (s.balanceRemaining || 0), 0);

  // ── Opener helpers ────────────────────────────────────────────────────────

  const openRecordPayment = (sale) => {
    setRecordPaymentTarget(sale);
    setRecordPaymentAmount('');
    setRecordPaymentOpen(true);
  };

  const openMarkSettled = (sale) => setSettleTarget(sale);

  // BillingLedger callback — sets the reverseTarget which opens the dialog
  const openReversePayment = (payment, sale) => setReverseTarget({ payment, sale });

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * Append an immutable payment doc + recompute denormalized balance.
   * Optimistically updates ownerSales in local state when setOwnerSales is provided.
   */
  const handleRecordPayment = async () => {
    if (!profile?.id) {
      setErrorSnack('Cannot record payment — staff session not loaded. Please sign in again.');
      return;
    }
    const amount = parseFloat(recordPaymentAmount);
    if (!recordPaymentTarget || isNaN(amount) || amount <= 0) return;

    try {
      const existingPayments = await getPaymentHistory(recordPaymentTarget);
      const newBalance = recomputeBalance(
        recordPaymentTarget,
        [...existingPayments, { amount }],
      );

      const staffName = resolveStaffName();
      const batch = writeBatch(db);

      const paymentRef = doc(collection(db, 'payments'));
      batch.set(paymentRef, buildPaymentDocPayload({
        saleId:          recordPaymentTarget.id,
        ownerId:         owner?.id || null,
        amount,
        method:          paymentMethod,
        referenceNumber: paymentRefNo || null,
        note:            paymentNote || null,
        collectedBy:     staffName,
        collectedByUid:  profile?.id || null,
        reversalOf:      null,
      }));

      batch.update(doc(db, 'sales', recordPaymentTarget.id), { balanceRemaining: newBalance });

      await batch.commit();

      const updatedSales = (ownerSales ?? []).map((s) =>
        s.id === recordPaymentTarget.id ? { ...s, balanceRemaining: newBalance } : s,
      );
      updateLocalSales(updatedSales);

      setRecordPaymentOpen(false);
      setRecordPaymentTarget(null);
      setRecordPaymentAmount('');
      setPaymentMethod('cash');
      setPaymentRefNo('');
      setPaymentNote('');

      if (owner?.id) {
        const remainingDebt = computeTotalDebt(updatedSales);
        await updateDoc(doc(db, 'users', owner.id), {
          hasOutstandingBalance: remainingDebt > 0,
        });
      }
    } catch (e) {
      console.error('[usePaymentActions.handleRecordPayment]:', e.message);
      setErrorSnack('Failed to record payment: ' + e.message);
    }
  };

  /**
   * Mark a sale as settled externally (off-POS payment — GCash, bank transfer).
   * Appends a payment doc with note 'External settlement (off-POS)' and zeroes
   * balanceRemaining. Legacy settledExternally flags kept for backward compatibility.
   */
  const handleMarkSettled = async () => {
    if (!profile?.id) {
      setErrorSnack('Cannot record payment — staff session not loaded. Please sign in again.');
      return;
    }
    if (!settleTarget) return;

    try {
      const staffName = resolveStaffName();
      const currentPayments = await getPaymentHistory(settleTarget);
      const remainingBalance = recomputeBalance(settleTarget, currentPayments);

      if (remainingBalance <= 0) {
        setErrorSnack('Balance is already settled (₱0 remaining). No action taken.');
        setSettleTarget(null);
        return;
      }

      const batch = writeBatch(db);

      const paymentRef = doc(collection(db, 'payments'));
      batch.set(paymentRef, buildPaymentDocPayload({
        saleId:          settleTarget.id,
        ownerId:         owner?.id || null,
        amount:          remainingBalance,
        method:          'other',
        referenceNumber: null,
        note:            'External settlement (off-POS)',
        collectedBy:     staffName,
        collectedByUid:  profile?.id || null,
        reversalOf:      null,
      }));

      batch.update(doc(db, 'sales', settleTarget.id), {
        balanceRemaining:  0,
        settledExternally: true,
        settledBy:         staffName,
        settledAt:         Timestamp.now(),
      });

      await batch.commit();

      let updatedSales;
      updateLocalSales((prev) => {
        updatedSales = (prev ?? []).map((s) =>
          s.id === settleTarget.id
            ? { ...s, balanceRemaining: 0, settledExternally: true, settledBy: staffName, settledAt: new Date() }
            : s,
        );
        return updatedSales;
      });

      setSettleTarget(null);

      if (owner?.id && updatedSales) {
        const remainingDebt = computeTotalDebt(updatedSales);
        updateDoc(doc(db, 'users', owner.id), {
          hasOutstandingBalance: remainingDebt > 0,
        }).catch(() => {});

        computeSingleOwnerBalanceReminder(owner.id, {
          ownerName:  owner.fullName       || '',
          ownerEmail: owner.email          || '',
          ownerPhone: owner.phone          || '',
          pushToken:  owner.expoPushToken  || null,
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[usePaymentActions.handleMarkSettled]:', e.message);
      setErrorSnack('Failed to mark as settled: ' + e.message);
    }
  };

  /**
   * Reverse a payment by appending a negative-amount payment doc.
   * Reversal is append-only — the original payment doc is never modified.
   */
  const handleReversePayment = async () => {
    if (!profile?.id) {
      setErrorSnack('Cannot record reversal — staff session not loaded. Please sign in again.');
      return;
    }
    if (!reverseTarget?.payment || !reverseTarget?.sale) return;

    try {
      const { payment: origPayment, sale: targetSale } = reverseTarget;
      const staffName = resolveStaffName();

      const currentPayments = await getPaymentHistory(targetSale);
      const reversalEntry = { amount: -(parseFloat(origPayment.amount) || 0) };
      const newBalance = recomputeBalance(targetSale, [...currentPayments, reversalEntry]);

      const batch = writeBatch(db);

      const reversalRef = doc(collection(db, 'payments'));
      batch.set(reversalRef, buildPaymentDocPayload({
        saleId:          targetSale.id,
        ownerId:         owner?.id || null,
        amount:          reversalEntry.amount,
        method:          origPayment.method || 'cash',
        referenceNumber: origPayment.referenceNumber || null,
        note:            reverseNote || `Reversal of payment ${origPayment.id}`,
        collectedBy:     staffName,
        collectedByUid:  profile?.id || null,
        reversalOf:      origPayment.id,
      }));

      const saleUpdate = { balanceRemaining: newBalance };
      if (newBalance > 0) saleUpdate.settledExternally = false;
      batch.update(doc(db, 'sales', targetSale.id), saleUpdate);

      await batch.commit();

      updateLocalSales((prev) =>
        (prev ?? []).map((s) =>
          s.id === targetSale.id
            ? { ...s, balanceRemaining: newBalance, settledExternally: newBalance <= 0 ? s.settledExternally : false }
            : s,
        ),
      );

      setReverseTarget(null);
      setReverseNote('');

      if (owner?.id) {
        const updatedSales = (ownerSales ?? []).map((s) =>
          s.id === targetSale.id ? { ...s, balanceRemaining: newBalance } : s,
        );
        const remainingDebt = computeTotalDebt(updatedSales);

        updateDoc(doc(db, 'users', owner.id), {
          hasOutstandingBalance: remainingDebt > 0,
        }).catch(() => {});

        computeSingleOwnerBalanceReminder(owner.id, {
          ownerName:  owner.fullName       || '',
          ownerEmail: owner.email          || '',
          ownerPhone: owner.phone          || '',
          pushToken:  owner.expoPushToken  || null,
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[usePaymentActions.handleReversePayment]:', e.message);
      setErrorSnack('Failed to record reversal: ' + e.message);
    }
  };

  /** Print a per-payment receipt, computing the running balance up to that payment. */
  const handlePrintPayment = async (payment, sale) => {
    try {
      const allPayments = await getPaymentHistory(sale);
      const sorted = [...allPayments].sort((a, b) => {
        const aMs = a.collectedAt?.toDate?.()?.getTime() ?? (a.collectedAt?.seconds ? a.collectedAt.seconds * 1000 : 0);
        const bMs = b.collectedAt?.toDate?.()?.getTime() ?? (b.collectedAt?.seconds ? b.collectedAt.seconds * 1000 : 0);
        return aMs - bMs;
      });
      const paymentIdx = sorted.findIndex((p) => p.id === payment.id);
      const paymentsUpTo = paymentIdx >= 0 ? sorted.slice(0, paymentIdx + 1) : sorted;
      const runningBalance = Math.max(
        0,
        parseFloat(sale.total || 0) - paymentsUpTo.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0),
      );
      printViaIframe(generatePaymentReceipt(payment, sale, owner, clinicSettings, runningBalance));
    } catch (e) {
      console.error('[usePaymentActions.handlePrintPayment]:', e.message);
      setErrorSnack('Failed to generate receipt: ' + e.message);
    }
  };

  /**
   * Print a full sale summary with all payments appended.
   *
   * Two call signatures are supported:
   *   handlePrintSummary(sale, payments) — BillingLedger path: payments pre-fetched by
   *     PaymentHistoryPanel, passed directly. No extra Firestore read.
   *   handlePrintSummary(sale)           — Widget path (Outstanding Balance): payments not
   *     available at call site, so we fetch them internally before printing.
   */
  const handlePrintSummary = async (sale, payments) => {
    try {
      const resolvedPayments = (payments != null) ? payments : await getPaymentHistory(sale);
      printViaIframe(generateSaleSummaryReceipt(sale, resolvedPayments, owner, clinicSettings));
    } catch (e) {
      console.error('[usePaymentActions.handlePrintSummary]:', e.message);
      setErrorSnack('Failed to generate sale summary: ' + e.message);
    }
  };

  // ── Dialogs JSX ───────────────────────────────────────────────────────────
  // Returned as a single element so parents just drop {paymentActions.paymentDialogs}
  // once in their JSX tree — no per-dialog state props needed at the call site.

  const paymentDialogs = (
    <>
      {/* Record Payment Dialog */}
      <Dialog
        open={recordPaymentOpen}
        onClose={() => {
          setRecordPaymentOpen(false);
          setRecordPaymentTarget(null);
          setRecordPaymentAmount('');
          setPaymentMethod('cash');
          setPaymentRefNo('');
          setPaymentNote('');
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0 } }}
      >
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.95rem', color: COLORS.brand, borderBottom: `2px solid ${COLORS.border}` }}>
          Record Payment
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', color: COLORS.textSecondary }}>
            Outstanding: <strong>₱{(recordPaymentTarget?.balanceRemaining || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
          </Typography>

          <TextField
            autoFocus
            fullWidth
            label="Payment Amount"
            type="number"
            size="small"
            value={recordPaymentAmount}
            onChange={(e) => setRecordPaymentAmount(e.target.value)}
            InputProps={{ startAdornment: <Typography sx={{ mr: 0.5, color: '#aaa' }}>₱</Typography> }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
          />

          <FormControl fullWidth size="small">
            <Select
              value={paymentMethod}
              onChange={(e) => {
                setPaymentMethod(e.target.value);
                setPaymentRefNo('');
              }}
              sx={{ fontFamily: FONT, borderRadius: 0 }}
              displayEmpty
            >
              {PAYMENT_METHODS.map((m) => (
                <MenuItem key={m} value={m} sx={{ fontFamily: FONT }}>
                  {PAYMENT_METHOD_LABELS[m]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {isRefNumberRequired(paymentMethod) && (
            <TextField
              fullWidth
              label="Reference Number"
              size="small"
              value={paymentRefNo}
              onChange={(e) => setPaymentRefNo(e.target.value)}
              helperText={`Required for ${PAYMENT_METHOD_LABELS[paymentMethod]}`}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
            />
          )}

          <TextField
            fullWidth
            label="Note (optional)"
            size="small"
            multiline
            minRows={2}
            maxRows={3}
            value={paymentNote}
            onChange={(e) => setPaymentNote(e.target.value)}
            placeholder="e.g. GCash sender name, payment date confirmation"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
          />

          <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted }}>
            Collected by:{' '}
            <strong>
              {profile
                ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.fullName || 'Staff'
                : 'Staff'}
            </strong>
          </Typography>

          {(() => {
            const validation = validatePaymentInput({
              amount: recordPaymentAmount,
              method: paymentMethod,
              referenceNumber: paymentRefNo,
            });
            return !validation.valid && recordPaymentAmount ? (
              <Typography color="error" variant="caption" sx={{ fontFamily: FONT }}>
                {validation.error}
              </Typography>
            ) : null;
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button
            onClick={() => {
              setRecordPaymentOpen(false);
              setRecordPaymentTarget(null);
              setRecordPaymentAmount('');
              setPaymentMethod('cash');
              setPaymentRefNo('');
              setPaymentNote('');
            }}
            sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleRecordPayment}
            disabled={!validatePaymentInput({ amount: recordPaymentAmount, method: paymentMethod, referenceNumber: paymentRefNo }).valid}
            sx={{ fontFamily: FONT, fontWeight: 900, bgcolor: COLORS.success, borderRadius: 0, '&:hover': { bgcolor: '#1B5E20' } }}
          >
            Save Payment
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reverse Payment Dialog */}
      <Dialog
        open={!!reverseTarget}
        onClose={() => { setReverseTarget(null); setReverseNote(''); }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0 } }}
      >
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.95rem', color: COLORS.danger, borderBottom: `2px solid ${COLORS.border}` }}>
          Reverse Payment
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', color: COLORS.textSecondary }}>
            This will append a negative payment entry reversing the original. The original record is preserved for audit purposes.
          </Typography>

          <Box sx={{ bgcolor: COLORS.cream, border: `2px solid ${COLORS.borderLight}`, p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, fontWeight: 700, mb: 0.5 }}>ORIGINAL PAYMENT</Typography>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', color: COLORS.textPrimary }}>
              Amount: <strong>₱{Math.abs(parseFloat(reverseTarget?.payment?.amount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
            </Typography>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', color: COLORS.textPrimary }}>
              Method: {PAYMENT_METHOD_LABELS[(reverseTarget?.payment?.method || '').toLowerCase()] || '—'}
            </Typography>
            {reverseTarget?.payment?.referenceNumber && (
              <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', color: COLORS.textPrimary }}>
                Ref #: {reverseTarget.payment.referenceNumber}
              </Typography>
            )}
            <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', color: COLORS.textPrimary }}>
              Collected by: {reverseTarget?.payment?.collectedBy || '—'}
            </Typography>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.82rem', color: COLORS.textMuted }}>
              Date:{' '}
              {reverseTarget?.payment?.collectedAt
                ? (reverseTarget.payment.collectedAt?.toDate
                    ? reverseTarget.payment.collectedAt.toDate().toLocaleString()
                    : new Date(reverseTarget.payment.collectedAt?.seconds * 1000).toLocaleString())
                : '—'}
            </Typography>
          </Box>

          <TextField
            fullWidth
            label="Reversal Note"
            size="small"
            multiline
            minRows={2}
            value={reverseNote}
            onChange={(e) => setReverseNote(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2, justifyContent: 'space-between' }}>
          <Button
            size="small"
            startIcon={<PrintIcon sx={{ fontSize: 14 }} />}
            onClick={() => reverseTarget && handlePrintPayment(reverseTarget.payment, reverseTarget.sale)}
            sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0, fontSize: '0.75rem', textTransform: 'none' }}
          >
            Print Receipt
          </Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              onClick={() => { setReverseTarget(null); setReverseNote(''); }}
              sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0 }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleReversePayment}
              sx={{ fontFamily: FONT, fontWeight: 900, bgcolor: COLORS.danger, borderRadius: 0, '&:hover': { bgcolor: COLORS.dangerHover } }}
            >
              Confirm Reversal
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Mark as Settled Confirmation Dialog */}
      <Dialog
        open={!!settleTarget}
        onClose={() => setSettleTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0 } }}
      >
        <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.95rem', color: COLORS.warning, borderBottom: `2px solid ${COLORS.border}` }}>
          Mark as Settled
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textSecondary }}>
            Mark <strong>₱{(settleTarget?.balanceRemaining || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong> as settled?
            This records that payment was received outside the POS system (e.g. GCash, bank transfer).
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button
            onClick={() => setSettleTarget(null)}
            sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleMarkSettled}
            variant="contained"
            sx={{ fontFamily: FONT, fontWeight: 900, borderRadius: 0, bgcolor: COLORS.warning, '&:hover': { bgcolor: COLORS.danger } }}
          >
            Confirm Settled
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    // Openers — for parent UI buttons (Outstanding Balance widget, etc.)
    openRecordPayment,
    openMarkSettled,
    openReversePayment,

    // BillingLedger callback aliases (semantic names matching BillingLedger prop names)
    handleReversePayment: openReversePayment,  // opens dialog; actual async handler is internal
    handlePrintPayment,
    handlePrintSummary,

    // Snackbar state — parent renders the <Snackbar> / <Alert>
    errorSnack,
    setErrorSnack,

    // Dialogs — drop {paymentActions.paymentDialogs} once in the parent JSX tree
    paymentDialogs,
  };
}
