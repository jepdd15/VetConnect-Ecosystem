import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Box, Typography, MenuItem } from '@mui/material';

export default function StockAdjustModal({ open, onClose, item, onAdjust }) {
  // THE FIX: Initialize directly. No useEffect.
  const [action, setAction] = useState('add');
  const [qty, setQty] = useState('');

  const handleSubmit = () => {
    const amount = parseInt(qty);
    if (isNaN(amount) || amount <= 0) return alert("Please enter a valid positive quantity.");
    
    // If removing, make it a negative number for the math
    const finalAmount = action === 'add' ? amount : -amount;
    
    // Prevent negative stock
    if (action === 'remove' && (item?.stock || 0) - amount < 0) {
        return alert(`Cannot remove ${amount}. You only have ${item?.stock || 0} in stock.`);
    }

    onAdjust(finalAmount);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ bgcolor: '#1565C0', color: 'white', fontWeight: 'bold' }}>
        Update Stock: {item?.itemName}
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 3, bgcolor: '#FAFAFA' }}>
        <Typography variant="body1" sx={{ mb: 3, color: '#555' }}>
          Current Stock Level: <Box component="span" sx={{ fontWeight: '900', fontSize: '1.3rem', color: '#1565C0', ml: 1 }}>{item?.stock || 0}</Box>
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
          <TextField 
            select 
            label="Action" 
            value={action} 
            onChange={e => setAction(e.target.value)} 
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
            onChange={e => setQty(e.target.value)} 
            autoFocus 
            sx={{ bgcolor: 'white' }} 
            placeholder="e.g. 5"
          />
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 2.5, bgcolor: '#EFEBE9', borderTop: '1px solid #D7CCC8' }}>
        <Button onClick={onClose} sx={{ color: '#5D4037', fontWeight: 'bold' }}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" color="primary" sx={{ fontWeight: 'bold', px: 3 }}>
          Confirm Update
        </Button>
      </DialogActions>
    </Dialog>
  );
}