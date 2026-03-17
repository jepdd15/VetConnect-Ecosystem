// Product configuration.
// Captures PDEA Regulated flags. Manages Unit of Measure (UOM) conversions (1 Box = 20 Tablets). 
// Features a live Profitability Margin calculator.

import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  TextField, Button, MenuItem, Switch, FormControlLabel, 
  Typography, Box, Paper, Divider, InputAdornment, Stack, Grid, Alert
} from '@mui/material';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

// Icons
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import StoreIcon from '@mui/icons-material/Store';
import InfoIcon from '@mui/icons-material/Info';

const BASE_UNITS = ['Tablet', 'Capsule', 'Vial', 'Ampoule', 'ml', 'Piece', 'Can', 'Sachet', 'Syringe'];
const BUY_UNITS = ['Box', 'Pack', 'Bottle', 'Tray', 'Case', 'Roll', 'Bag', 'Piece'];
const CATEGORIES = ['Medicine', 'Vaccine', 'Food', 'Supplies', 'Accessories', 'Lab'];

export default function ProductFormModal({ open, onClose, item, showToast }) {
  const [formData, setFormData] = useState({
    itemName: '', strength: '', sku: '', category: 'Medicine', price: '', costPrice: '', 
    minStock: '10', uomBase: 'Tablet', uomPurchase: 'Box', conversionFactor: '1', 
    supplier: '', isRxOnly: false, isRegulated: false
  });

  const noExtensionProps = { spellCheck: 'false', 'data-gramm': 'false' };

  useEffect(() => {
    // Only run this logic when the modal opens or the item changes
    if (open) {
      if (item) {
        // If EDITING, pre-fill the form
        setFormData({
          itemName: item.itemName || '',
          strength: item.strength || '',
          sku: item.sku || '',
          category: item.category || 'Medicine',
          price: item.price?.toString() || '',
          costPrice: item.costPrice?.toString() || '',
          minStock: item.minStock?.toString() || '10',
          uomBase: item.uomBase || 'Tablet',
          uomPurchase: item.uomPurchase || 'Box',
          conversionFactor: item.conversionFactor?.toString() || '1',
          supplier: item.supplier || '',
          isRxOnly: item.isRxOnly || false,
          isRegulated: item.isRegulated || false
        });
      } else {
        // If ADDING NEW, reset to a blank slate
        setFormData({
          itemName: '', strength: '', sku: '', category: 'Medicine', price: '', costPrice: '', 
          minStock: '10', uomBase: 'Tablet', uomPurchase: 'Box', conversionFactor: '1', 
          supplier: '', isRxOnly: false, isRegulated: false
        });
      }
    }
  }, [item, open]); 

  // --- LIVE FINANCIAL CALCULATIONS ---
  const cost = parseFloat(formData.costPrice) || 0;
  const retail = parseFloat(formData.price) || 0;
  const profit = retail - cost;
  const margin = retail > 0 ? ((profit / retail) * 100).toFixed(1) : 0;
  const isLoss = profit < 0;

  const handleSave = async () => {
    if (!formData.itemName || !formData.price) return showToast("Item Name and Price are required.", "error");
    try {
      const data = {
        ...formData,
        price: Number(formData.price),
        costPrice: Number(formData.costPrice) || 0,
        minStock: Number(formData.minStock) || 10,
        conversionFactor: Number(formData.conversionFactor) || 1,
        updatedAt: new Date()
      };
      if (item) {
        await updateDoc(doc(db, "inventory", item.id), data);
        showToast("Configuration Updated.", "success");
      } else {
        await addDoc(collection(db, "inventory"), { ...data, stock: 0, batches: [], createdAt: new Date() });
        showToast("New Item Added.", "success");
      }
      onClose();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ bgcolor: '#5D4037', color: 'white', fontWeight: 'bold', px: 3 }}>
        {item ? 'Update Product Configuration' : 'Create New Inventory Item'}
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 0, bgcolor: '#FAFAFA' }}>
        <Box sx={{ p: 4 }}>
          
          {/* SECTION 1: IDENTITY */}
          <Typography variant="overline" color="primary" fontWeight="bold" sx={{ mb: 2, display: 'block' }}>1. Basic Identity & Compliance</Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={5}>
              <TextField label="Product Name" fullWidth size="small" value={formData.itemName} onChange={e => setFormData({ ...formData, itemName: e.target.value })} sx={{ bgcolor: 'white' }} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField label="Strength" fullWidth size="small" value={formData.strength} onChange={e => setFormData({ ...formData, strength: e.target.value })} sx={{ bgcolor: 'white' }} placeholder="e.g. 500mg" />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField select label="Category" fullWidth size="small" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} sx={{ bgcolor: 'white' }}>
                {CATEGORIES.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Barcode / SKU" fullWidth size="small" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })} sx={{ bgcolor: 'white' }} InputProps={{ startAdornment: <InputAdornment position="start"><QrCodeScannerIcon fontSize="small"/></InputAdornment> }} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Manufacturer / Supplier" fullWidth size="small" value={formData.supplier} onChange={e => setFormData({ ...formData, supplier: e.target.value })} sx={{ bgcolor: 'white' }} InputProps={{ startAdornment: <InputAdornment position="start"><StoreIcon fontSize="small" sx={{color:'#aaa'}}/></InputAdornment> }} />
            </Grid>
            <Grid item xs={12}>
                <Paper variant="outlined" sx={{ px: 2, py: 0.5, bgcolor: 'white', display: 'flex', gap: 4, borderRadius: 2 }}>
                    <FormControlLabel control={<Switch checked={formData.isRegulated} onChange={e => setFormData({ ...formData, isRegulated: e.target.checked })} color="secondary" size="small" />} label={<Typography variant="caption" fontWeight="bold">PDEA Regulated</Typography>} />
                    <FormControlLabel control={<Switch checked={formData.isRxOnly} onChange={e => setFormData({ ...formData, isRxOnly: e.target.checked })} color="error" size="small" />} label={<Typography variant="caption" fontWeight="bold">Rx Only</Typography>} />
                </Paper>
            </Grid>
          </Grid>

          {/* SECTION 2: UOM */}
          <Paper elevation={0} sx={{ p: 3, mb: 4, bgcolor: '#F0F4F8', border: '1px solid #D1D9E6', borderRadius: 2, borderLeft: '4px solid #1976D2' }}>
            <Typography variant="overline" color="#1565C0" fontWeight="bold" sx={{ mb: 2, display: 'block' }}>2. Unit of Measure (UOM) Logic</Typography>
            <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField select label="Selling Unit (Base)" fullWidth size="small" value={formData.uomBase} onChange={e => setFormData({ ...formData, uomBase: e.target.value })} sx={{ bgcolor: 'white' }}>
                    {BASE_UNITS.map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField select label="Buying Unit (Bulk)" fullWidth size="small" value={formData.uomPurchase} onChange={e => setFormData({ ...formData, uomPurchase: e.target.value })} sx={{ bgcolor: 'white' }}>
                    {BUY_UNITS.map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField 
                    label="Packaging Ratio" type="number" fullWidth size="small" 
                    value={formData.conversionFactor} onChange={e => setFormData({ ...formData, conversionFactor: e.target.value })} sx={{ bgcolor: 'white' }} 
                    InputProps={{ endAdornment: <InputAdornment position="end"><Typography variant="caption" fontWeight="bold">{formData.uomBase}s</Typography></InputAdornment> }}
                  />
                </Grid>
            </Grid>
          </Paper>

          {/* SECTION 3: PRICING */}
          <Typography variant="overline" color="primary" fontWeight="bold" sx={{ mb: 2, display: 'block' }}>3. Pricing & Inventory Health</Typography>
          <Grid container spacing={2} sx={{ mb: 1 }}>
            <Grid item xs={12} md={4}>
              <TextField label={`Cost per ${formData.uomBase}`} type="number" fullWidth size="small" value={formData.costPrice} onChange={e => setFormData({ ...formData, costPrice: e.target.value })} InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }} sx={{ bgcolor: 'white' }} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField label={`Retail per ${formData.uomBase}`} type="number" fullWidth size="small" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }} sx={{ bgcolor: 'white' }} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField label="Low Stock Alert" type="number" fullWidth size="small" value={formData.minStock} onChange={e => setFormData({ ...formData, minStock: e.target.value })} sx={{ bgcolor: 'white' }} 
                InputProps={{ endAdornment: <InputAdornment position="end"><Typography variant="caption" fontWeight="bold">{formData.uomBase}s</Typography></InputAdornment> }}
              />
            </Grid>
            <Grid item xs={12}>
                <Box sx={{ mt: 1, p: 2, borderRadius: 2, bgcolor: isLoss ? '#FFEBEE' : '#E8F5E9', border: '1px solid', borderColor: isLoss ? '#EF9A9A' : '#A5D6A7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <TrendingUpIcon color={isLoss ? "error" : "success"} />
                        <Typography variant="body2" fontWeight="bold" color={isLoss ? "error.main" : "success.main"}>{isLoss ? 'Loss Warning' : 'Profitability'}</Typography>
                    </Stack>
                    <Typography variant="body2" fontWeight="bold" color={isLoss ? "error.main" : "success.main"}>Margin: ₱{profit.toFixed(2)} ({margin}%)</Typography>
                </Box>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2.5, bgcolor: '#EFEBE9', borderTop: '1px solid #D7CCC8' }}><Button onClick={onClose} sx={{ fontWeight: 'bold', color: '#5D4037', px: 3 }}>Cancel</Button><Button onClick={handleSave} variant="contained" sx={{ bgcolor: '#2E7D32', fontWeight: 'bold', px: 4, py: 1.2 }}>Save Configuration</Button></DialogActions>
    </Dialog>
  );
}