import React, { useState } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  TextField, Button, MenuItem, Box, InputAdornment, Divider 
} from '@mui/material';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

export default function ProductFormModal({ open, onClose, item, onSave, categories, showToast }) {
  // THE FIX: Initialize state DIRECTLY. No useEffect needed. 
  const [formData, setFormData] = useState({
    itemName: item?.itemName || '',
    category: item?.category || '',
    price: item?.price?.toString() || '',
    costPrice: item?.costPrice?.toString() || '',
    minStock: item?.minStock?.toString() || '10'
  });
  
  // --- STATE FOR THE JIT MICRO-MODAL ---
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const handleSubmit = () => {
    if (!formData.itemName || formData.price === '') {
        return alert("Product Name and Retail Price are required!");
    }
    onSave({
      itemName: formData.itemName,
      category: formData.category,
      price: Number(formData.price) || 0,
      costPrice: Number(formData.costPrice) || 0,
      minStock: Number(formData.minStock) || 0
    });
    onClose();
  };

  const handleQuickAddCategory = async () => {
    if(!newCatName.trim()) return;
    try {
      await addDoc(collection(db, "inventory_categories"), { name: newCatName.trim() });
      setFormData({ ...formData, category: newCatName.trim() }); // Auto-select the new one
      setShowQuickAdd(false);
      setNewCatName('');
      showToast(`Category "${newCatName.trim()}" created.`, "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  return (
    <>
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
            onChange={e => {
              if (e.target.value === 'ADD_NEW') {
                setShowQuickAdd(true);
              } else {
                setFormData({...formData, category: e.target.value})
              }
            }}
            sx={{ bgcolor: 'white' }}
          >
            {/* THE FIX: Dynamically mapping the categories prop! */}
            {(categories || []).map(c => <MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>)}
            
            <Divider />
            <MenuItem value="ADD_NEW" sx={{ color: 'primary.main', fontWeight: 'bold', fontStyle: 'italic' }}>
              <AddCircleIcon sx={{ mr: 1, fontSize: 18 }} /> + Add New Category...
            </MenuItem>

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

      {/* --- THE JIT MICRO-MODAL --- */}
      <Dialog open={showQuickAdd} onClose={() => setShowQuickAdd(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{bgcolor: '#1565C0', color: 'white', fontWeight: 'bold'}}>Create New Category</DialogTitle>
        <DialogContent>
          <TextField 
            autoFocus 
            label="New Category Name" 
            fullWidth sx={{ mt: 3 }}
            value={newCatName} onChange={e => setNewCatName(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setShowQuickAdd(false)}>Cancel</Button>
          <Button onClick={handleQuickAddCategory} variant="contained" sx={{ bgcolor: '#1565C0' }}>Create & Select</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}