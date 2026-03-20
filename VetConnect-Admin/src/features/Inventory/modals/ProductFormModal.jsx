import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, MenuItem, Box, InputAdornment } from '@mui/material';

const CATEGORIES = ['Medicine', 'Vaccine', 'Food', 'Supplies', 'Accessories', 'Lab'];

export default function ProductFormModal({ open, onClose, item, onSave }) {
  // THE FIX: Initialize state DIRECTLY. No useEffect needed. 
  // The 'key' prop on this component in Inventory.jsx guarantees this is fresh every time.
  const [formData, setFormData] = useState({
    itemName: item?.itemName || '',
    category: item?.category || 'Medicine',
    price: item?.price?.toString() || '',
    costPrice: item?.costPrice?.toString() || '',
    minStock: item?.minStock?.toString() || '10'
  });

  const handleSubmit = () => {
    if (!formData.itemName || formData.price === '') {
        return alert("Product Name and Retail Price are required!");
    }
    
    // Pass the sanitized data back up to the parent controller
    onSave({
      itemName: formData.itemName,
      category: formData.category,
      price: Number(formData.price) || 0,
      costPrice: Number(formData.costPrice) || 0,
      minStock: Number(formData.minStock) || 0
    });
    
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: '#5D4037', color: 'white', fontWeight: 'bold' }}>
        {item ? 'Edit Product Details' : 'Add New Product'}
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5, bgcolor: '#FAFAFA' }}>
        <TextField 
          label="Product Name" 
          fullWidth 
          value={formData.itemName} 
          onChange={e => setFormData({...formData, itemName: e.target.value})} 
          autoFocus 
          sx={{ bgcolor: 'white', mt: 1 }} 
        />
        
        <TextField 
          select 
          label="Category" 
          fullWidth 
          value={formData.category} 
          onChange={e => setFormData({...formData, category: e.target.value})} 
          sx={{ bgcolor: 'white' }}
        >
          {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
        
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField 
            label="Cost Price" 
            type="number" 
            fullWidth 
            value={formData.costPrice} 
            onChange={e => setFormData({...formData, costPrice: e.target.value})} 
            InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }} 
            sx={{ bgcolor: 'white' }} 
          />
          <TextField 
            label="Retail Price" 
            type="number" 
            fullWidth 
            value={formData.price} 
            onChange={e => setFormData({...formData, price: e.target.value})} 
            InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }} 
            sx={{ bgcolor: 'white' }} 
          />
        </Box>
        
        <TextField 
          label="Low Stock Alert Level" 
          type="number" 
          fullWidth 
          value={formData.minStock} 
          onChange={e => setFormData({...formData, minStock: e.target.value})} 
          sx={{ bgcolor: 'white' }} 
          helperText="Triggers a red warning badge when stock hits this number"
        />
      </DialogContent>
      
      <DialogActions sx={{ p: 2.5, bgcolor: '#EFEBE9', borderTop: '1px solid #D7CCC8' }}>
        <Button onClick={onClose} sx={{ color: '#5D4037', fontWeight: 'bold' }}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" sx={{ bgcolor: '#2E7D32', fontWeight: 'bold', px: 3 }}>
          {item ? 'Save Changes' : 'Create Item'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}