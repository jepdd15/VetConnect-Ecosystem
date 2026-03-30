import React, { useState, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, MenuItem, Box, InputAdornment, Divider, Typography, Grid
} from '@mui/material';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import InsightsIcon from '@mui/icons-material/Insights';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { formatCategory } from '../Inventory';

export default function ProductFormModal({ open, onClose, item, onSave, categories, showToast }) {
  const isEditing = Boolean(item);

  const [formData, setFormData] = useState({
    itemName:     item?.itemName     || '',
    category:     item?.category     || '',
    price:        item?.price?.toString()     || '',
    costPrice:    item?.costPrice?.toString() || '',
    minStock:     item?.minStock?.toString()  || '10',
    sku:          item?.sku      || '',
    dosage:       item?.dosage   || '',
    unit:         item?.unit     || '',
    location:     item?.location || '',
    supplier:     item?.supplier || '',
    lotNumber:    item?.lotNumber  || '',
    expiryDate:   item?.expiryDate || '',
    openingStock: '',   // Only used when creating — ignored on edit
  });

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [newCatName, setNewCatName]     = useState('');
  const [errors, setErrors]             = useState({});

  // Helper: update one field and clear its error
  const set = (key) => (e) => {
    setFormData(prev => ({ ...prev, [key]: e.target.value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }));
  };

  // ── Live Margin Calculator ──────────────────────────────────────────────
  const marginData = useMemo(() => {
    const cost   = Number(formData.costPrice) || 0;
    const retail = Number(formData.price)     || 0;
    if (!cost || !retail || cost >= retail)
      return { percentage: 0, profit: 0, color: '#D32F2F', healthy: false };
    const profit     = retail - cost;
    const percentage = (profit / retail) * 100;
    const isHealthy  = percentage >= 30;
    return { percentage: percentage.toFixed(1), profit: profit.toFixed(2), color: isHealthy ? '#2E7D32' : '#E65100', healthy: isHealthy };
  }, [formData.costPrice, formData.price]);

  // ── Validation ──────────────────────────────────────────────────────────
  const handleSubmit = () => {
    const newErrors = {};
    if (!formData.itemName.trim())
      newErrors.itemName = 'Product name is required.';
    if (formData.price === '' || isNaN(Number(formData.price)) || Number(formData.price) < 0)
      newErrors.price = 'A valid retail price is required.';
    if (!formData.unit.trim())
      newErrors.unit = 'Unit of measure is required (e.g. Box, Vial, Bottle).';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    onSave({
      itemName:  formData.itemName.trim(),
      category:  formData.category.toLowerCase().trim(),
      price:     Number(formData.price)     || 0,
      costPrice: Number(formData.costPrice) || 0,
      minStock:  Number(formData.minStock)  || 0,
      sku:       formData.sku.trim(),
      dosage:    formData.dosage.trim(),
      unit:      formData.unit.trim(),
      location:  formData.location.trim(),
      supplier:  formData.supplier.trim(),
      lotNumber: formData.lotNumber.trim(),
      expiryDate: formData.expiryDate || null,
      // Only include opening stock for new products
      ...(!isEditing && { openingStock: Number(formData.openingStock) || 0 }),
    });
  };

  // ── Quick-add category ──────────────────────────────────────────────────
  const handleQuickAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const lowerName = newCatName.trim().toLowerCase();
      await addDoc(collection(db, 'inventory_categories'), { name: lowerName });
      setFormData(prev => ({ ...prev, category: lowerName }));
      setShowQuickAdd(false);
      setNewCatName('');
      showToast(`Category "${formatCategory(lowerName)}" created.`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const sxField = { bgcolor: 'white', '& .MuiOutlinedInput-root': { borderRadius: 2 } };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ bgcolor: '#3E2723', color: 'white', fontWeight: '900', letterSpacing: 0.5 }}>
          {isEditing ? 'Edit Product Details' : 'Add New Product'}
        </DialogTitle>

        <DialogContent dividers sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 3, bgcolor: '#FAFAF9' }}>

          {/* ── CORE IDENTITY ── */}
          <Box>
            <Typography variant="overline" color="textSecondary" fontWeight="900" display="block" mb={1}>
              Core Identity
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 8 }}>
                <TextField
                  label="Product Name" fullWidth autoFocus
                  value={formData.itemName} onChange={set('itemName')}
                  error={!!errors.itemName} helperText={errors.itemName}
                  sx={sxField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  select label="Category" fullWidth
                  value={formData.category}
                  onChange={e => {
                    if (e.target.value === 'ADD_NEW') setShowQuickAdd(true);
                    else setFormData(prev => ({ ...prev, category: e.target.value }));
                  }}
                  sx={sxField}
                >
                  {(categories || []).map(c => (
                    <MenuItem key={c} value={c}>{formatCategory(c)}</MenuItem>
                  ))}
                  <Divider />
                  <MenuItem value="ADD_NEW" sx={{ color: '#D84315', fontWeight: 'bold' }}>
                    <AddCircleIcon sx={{ mr: 1, fontSize: 18 }} /> Quick Add Category
                  </MenuItem>
                </TextField>
              </Grid>

              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="SKU / Barcode" placeholder="e.g. 019283921" fullWidth
                  value={formData.sku} onChange={set('sku')} sx={sxField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Unit of Measure" placeholder="e.g. Box, Bottle" required fullWidth
                  value={formData.unit} onChange={set('unit')}
                  error={!!errors.unit} helperText={errors.unit || 'Required'}
                  sx={sxField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Dosage / Strength" placeholder="e.g. 50mg, 10ml" fullWidth
                  value={formData.dosage} onChange={set('dosage')} sx={sxField}
                />
              </Grid>
            </Grid>
          </Box>

          <Divider sx={{ borderStyle: 'dashed' }} />

          {/* ── BATCH & TRACEABILITY ── */}
          <Box>
            <Typography variant="overline" color="textSecondary" fontWeight="900" display="block" mb={1}>
              Batch &amp; Traceability
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Lot / Batch Number"
                  placeholder="e.g. LOT-2025-0912"
                  fullWidth
                  value={formData.lotNumber}
                  onChange={set('lotNumber')}
                  sx={sxField}
                  helperText="Found on the product’s packaging or Certificate of Analysis."
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Expiry Date"
                  type="date"
                  fullWidth
                  value={formData.expiryDate}
                  onChange={set('expiryDate')}
                  InputLabelProps={{ shrink: true }}
                  sx={sxField}
                  helperText="Required for vaccines, medications, and biologicals."
                />
              </Grid>
            </Grid>
          </Box>

          <Divider sx={{ borderStyle: 'dashed' }} />

          {/* ── FINANCIALS ── */}
          <Box>
            <Typography variant="overline" color="textSecondary" fontWeight="900" display="block" mb={1}>
              Financials
            </Typography>
            <Grid container spacing={2} alignItems="stretch">
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Cost Price" type="number" fullWidth
                  value={formData.costPrice} onChange={set('costPrice')}
                  InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                  sx={{ ...sxField, height: '100%' }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Retail Price" type="number" fullWidth required
                  value={formData.price} onChange={set('price')}
                  error={!!errors.price} helperText={errors.price}
                  InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                  sx={{ ...sxField, height: '100%' }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Margin Profile"
                  value={`${marginData.percentage}% (₱${marginData.profit})`}
                  InputProps={{
                    readOnly: true,
                    sx: {
                      fontWeight: '900',
                      color:  formData.costPrice && formData.price ? marginData.color : '#9E9E9E',
                      bgcolor: formData.costPrice && formData.price ? `${marginData.color}0A` : '#F5F5F5',
                    },
                  }}
                  fullWidth
                  sx={{
                    height: '100%',
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      '& fieldset': { borderColor: formData.costPrice && formData.price ? marginData.color : '#E0E0E0' },
                    },
                  }}
                />
              </Grid>
            </Grid>
          </Box>

          <Divider sx={{ borderStyle: 'dashed' }} />

          {/* ── LOGISTICS & SOURCING ── */}
          <Box>
            <Typography variant="overline" color="textSecondary" fontWeight="900" display="block" mb={1}>
              Logistics &amp; Sourcing
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Storage Location" placeholder="e.g. Pharmacy A, Main Fridge" fullWidth
                  value={formData.location} onChange={set('location')} sx={sxField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Supplier Name" placeholder="e.g. Covetrus, IDEXX" fullWidth
                  value={formData.supplier} onChange={set('supplier')} sx={sxField}
                />
              </Grid>
            </Grid>
          </Box>

          <Divider sx={{ borderStyle: 'dashed' }} />

          {/* ── STOCK SAFEGUARDS ── */}
          <Box>
            <Typography variant="overline" color="textSecondary" fontWeight="900" display="block" mb={1}>
              Stock Safeguards
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: isEditing ? 12 : 6 }}>
                <TextField
                  label="Low Stock Warning Limit" type="number" fullWidth
                  value={formData.minStock} onChange={set('minStock')}
                  InputProps={{ startAdornment: <InputAdornment position="start"><InsightsIcon color="disabled" /></InputAdornment> }}
                  helperText="A warning badge fires when stock drops to or below this threshold."
                  sx={sxField}
                />
              </Grid>

              {/* Opening Stock — only visible when creating a new product */}
              {!isEditing && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Opening Stock"
                    type="number"
                    fullWidth
                    value={formData.openingStock}
                    onChange={e => setFormData(prev => ({ ...prev, openingStock: e.target.value }))}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          {formData.unit || 'units'}
                        </InputAdornment>
                      ),
                    }}
                    helperText="Initial quantity on hand. Leave at 0 to add stock later."
                    sx={sxField}
                  />
                </Grid>
              )}
            </Grid>
          </Box>

        </DialogContent>

        <DialogActions sx={{ p: 3, bgcolor: '#FFFFFF', borderTop: '1px solid #E0D6CC' }}>
          <Button onClick={onClose} sx={{ color: '#757575', fontWeight: 'bold' }}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            sx={{ bgcolor: '#D84315', fontWeight: '900', px: 4, py: 1, borderRadius: 2, boxShadow: '0 4px 14px rgba(216,67,21,0.4)', '&:hover': { bgcolor: '#BF360C' } }}
          >
            {isEditing ? 'Save Changes' : 'Create Product'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Quick-Add Category micro-modal ── */}
      <Dialog open={showQuickAdd} onClose={() => setShowQuickAdd(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ bgcolor: '#D84315', color: 'white', fontWeight: '900', letterSpacing: 0.5 }}>
          Quick Add Category
        </DialogTitle>
        <DialogContent sx={{ p: 4 }}>
          <TextField
            autoFocus label="Category Name" fullWidth
            sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            value={newCatName} onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleQuickAddCategory()}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '1px solid #E0E0E0' }}>
          <Button onClick={() => setShowQuickAdd(false)} sx={{ fontWeight: 'bold', color: '#757575' }}>Cancel</Button>
          <Button onClick={handleQuickAddCategory} variant="contained" sx={{ bgcolor: '#D84315', fontWeight: 'bold', borderRadius: 2 }}>
            Create &amp; Select
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}