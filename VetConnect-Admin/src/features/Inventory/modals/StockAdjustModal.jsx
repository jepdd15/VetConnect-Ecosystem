import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Box, Typography, MenuItem
} from '@mui/material';

export default function StockAdjustModal({ open, onClose, item, onAdjust }) {
  const [action, setAction] = useState('add');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('Restocked from Supplier');
  const [errors, setErrors] = useState({});

  const clearError = (field) => setErrors(prev => ({ ...prev, [field]: undefined }));

  const handleSubmit = () => {
    const amount = parseInt(qty);
    const newErrors = {};

    if (isNaN(amount) || amount <= 0) {
      newErrors.qty = 'Please enter a valid positive quantity.';
    } else if (action === 'remove' && (item?.stock || 0) - amount < 0) {
      newErrors.qty = `Cannot remove ${amount}. Only ${item?.stock || 0} unit(s) currently in stock.`;
    }

    if (!reason.trim()) {
      newErrors.reason = 'A medical or system reason is required for every stock adjustment.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const finalAmount = action === 'add' ? amount : -amount;
    onAdjust(finalAmount, reason.trim());
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ bgcolor: '#1565C0', color: 'white', fontWeight: 'bold' }}>
        Update Stock: {item?.itemName}
      </DialogTitle>

      <DialogContent dividers sx={{ p: 3, bgcolor: '#FAFAFA' }}>
        <Typography variant="body1" sx={{ mb: 3, color: '#555' }}>
          Current Stock Level:{' '}
          <Box component="span" sx={{ fontWeight: '900', fontSize: '1.3rem', color: '#1565C0', ml: 1 }}>
            {item?.stock || 0}
          </Box>
        </Typography>

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
            sx={{ width: 140, bgcolor: 'white' }}
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
            sx={{ bgcolor: 'white' }}
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
          sx={{ bgcolor: 'white', mt: 2 }}
          placeholder="e.g. Product Expired, Damaged in transit, Manual Correction..."
          error={!!errors.reason}
          helperText={errors.reason}
        />
      </DialogContent>

      <DialogActions sx={{ p: 2.5, bgcolor: '#EFEBE9', borderTop: '1px solid #D7CCC8' }}>
        <Button onClick={onClose} sx={{ color: '#5D4037', fontWeight: 'bold' }}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          sx={{ fontWeight: 'bold', px: 3 }}
        >
          Confirm Update
        </Button>
      </DialogActions>
    </Dialog>
  );
}