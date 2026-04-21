import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Box, Typography, MenuItem
} from '@mui/material';
import { FONT } from '../../../theme/designTokens';

export default function StockAdjustModal({ open, onClose, item, onAdjust }) {
  const [action, setAction] = useState('add');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('Restocked from Supplier');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  // T2.158: Reset all form state when modal opens or switches to a different item
  useEffect(() => {
    if (open) {
      setAction('add');
      setQty('');
      setReason('Restocked from Supplier');
      setBatchNumber('');
      setExpiryDate('');
      setErrors({});
    }
  }, [open, item?.id]);

  const clearError = (field) => setErrors(prev => ({ ...prev, [field]: undefined }));

  const handleSubmit = async () => {
    const amount = parseInt(qty);
    const newErrors = {};

    if (isNaN(amount) || amount <= 0) {
      newErrors.qty = 'Please enter a valid positive quantity.';
    } else if (action === 'remove' && (item?.stock || 0) - (item?.reserved || 0) - amount < 0) {
      newErrors.qty = `Cannot remove ${amount}. Only ${(item?.stock || 0) - (item?.reserved || 0)} unit(s) available (${item?.reserved || 0} reserved).`;
    }

    if (!reason.trim()) {
      newErrors.reason = 'A medical or system reason is required for every stock adjustment.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const finalAmount = action === 'add' ? amount : -amount;
    const batchInfo = (action === 'add' && batchNumber.trim())
      ? { batchNumber: batchNumber.trim(), expiryDate: expiryDate || null }
      : null;
    setSubmitting(true);
    try {
      await onAdjust(finalAmount, reason.trim(), batchInfo);
    } finally {
      setSubmitting(false);
    }
  };

  const fieldSx = {
    bgcolor: 'white',
    '& .MuiOutlinedInput-root': {
      borderRadius: 0,
      '& fieldset': { border: '2px solid #5D4037' },
      '&:hover fieldset': { borderColor: '#3E2723' },
      '&.Mui-focused fieldset': { borderColor: '#5D4037' }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth
      PaperProps={{ sx: { borderRadius: 0, border: '2px solid #5D4037', boxShadow: '8px 8px 0px rgba(93,64,55,0.1)' } }}>
      <DialogTitle sx={{ bgcolor: '#FFF8E1', color: '#3E2723', fontWeight: 1000, fontFamily: FONT, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '2px solid #5D4037' }}>
        Update Stock: {item?.itemName}
      </DialogTitle>

      <DialogContent dividers sx={{ p: 3, bgcolor: '#FAF9F7' }}>
        <Typography variant="body1" sx={{ mb: 1, color: '#555' }}>
          Current Stock Level:{' '}
          <Box component="span" sx={{ fontWeight: '900', fontSize: '1.3rem', color: '#1565C0', ml: 1 }}>
            {item?.stock || 0}
          </Box>
        </Typography>
        {(item?.reserved || 0) > 0 && (
          <Typography variant="body2" sx={{ mb: 2, color: '#E65100', fontWeight: 'bold' }}>
            Available: {(item?.stock || 0) - (item?.reserved || 0)} ({item?.reserved} reserved by active consults)
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
          <TextField
            select
            label="Action"
            value={action}
            onChange={e => {
              setAction(e.target.value);
              setReason(e.target.value === 'add' ? 'Restocked from Supplier' : 'Dispensed to Patient');
              setErrors({});
            }}
            sx={{ width: 140, ...fieldSx }}
          >
            <MenuItem value="add">Add (+)</MenuItem>
            <MenuItem value="remove">Remove (-)</MenuItem>
          </TextField>

          <TextField
            label="Quantity"
            type="number"
            fullWidth
            value={qty}
            onChange={e => { setQty(e.target.value); clearError('qty'); }}
            autoFocus
            sx={fieldSx}
            placeholder="e.g. 5"
            error={!!errors.qty}
            helperText={errors.qty}
            inputProps={{ min: 1 }}
          />
        </Box>

        <TextField
          label="System Reason / Remarks"
          fullWidth
          value={reason}
          onChange={e => { setReason(e.target.value); clearError('reason'); }}
          sx={{ ...fieldSx, mt: 2 }}
          placeholder="e.g. Product Expired, Damaged in transit, Manual Correction..."
          error={!!errors.reason}
          helperText={errors.reason}
        />

        {action === 'add' && (
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <TextField
              label="Batch / Lot Number"
              placeholder="e.g. LOT-2025-0912"
              value={batchNumber}
              onChange={e => setBatchNumber(e.target.value)}
              sx={{ ...fieldSx, flex: 1 }}
              helperText="Optional. Found on packaging."
            />
            <TextField
              label="Expiry Date"
              type="date"
              value={expiryDate}
              onChange={e => setExpiryDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ ...fieldSx, width: 180 }}
              helperText="Optional."
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2.5, bgcolor: '#FFF8E1', borderTop: '2px solid #5D4037' }}>
        <Button onClick={onClose} sx={{ borderRadius: 0, border: '2px solid #5D4037', fontFamily: FONT, fontWeight: 1000, color: '#5D4037' }}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          variant="contained"
          sx={{ bgcolor: '#D84315', borderRadius: 0, border: '2px solid #BF360C', boxShadow: '4px 4px 0px rgba(216,67,21,0.2)', fontFamily: FONT, fontWeight: 1000, '&:hover': { bgcolor: '#BF360C' } }}
        >
          {submitting ? 'Updating...' : 'Confirm Update'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
