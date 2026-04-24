import React, { useState, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, MenuItem, Box, InputAdornment, Divider, Typography, Grid, Paper,
  FormControlLabel, Switch, Chip, Stack
} from '@mui/material';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import InsightsIcon from '@mui/icons-material/Insights';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import MedicationIcon from '@mui/icons-material/Medication';
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

  // T2.175: Allergen tags — stored as a string array on the product document.
  const [allergenTags, setAllergenTags] = useState(item?.allergenTags || []);
  const [allergenInput, setAllergenInput] = useState('');
  // T2.167b: Per-item isMedicine override — null means "derive from category"
  const [isMedicineOverride, setIsMedicineOverride] = useState(
    item?.isMedicine !== undefined ? item.isMedicine : null
  );

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
    if (!formData.category)
      newErrors.category = 'Category is required.';
    if (formData.price === '' || isNaN(Number(formData.price)) || Number(formData.price) < 0)
      newErrors.price = 'A valid retail price is required.';
    if (formData.costPrice !== '' && (isNaN(Number(formData.costPrice)) || Number(formData.costPrice) < 0))
      newErrors.costPrice = 'Cost price cannot be negative.';
    if (!formData.unit.trim())
      newErrors.unit = 'Unit of measure is required (e.g. Box, Vial, Bottle).';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    onSave({
      itemName:     formData.itemName.trim(),
      category:     formData.category.toLowerCase().trim(),
      price:        Number(formData.price)     || 0,
      costPrice:    Number(formData.costPrice) || 0,
      minStock:     Number(formData.minStock)  || 0,
      sku:          formData.sku.trim(),
      dosage:       formData.dosage.trim(),
      unit:         formData.unit.trim(),
      location:     formData.location.trim(),
      supplier:     formData.supplier.trim(),
      lotNumber:    formData.lotNumber.trim(),
      expiryDate:   formData.expiryDate || null,
      // T2.175: Allergen tags — stored as string array, empty array when none declared
      allergenTags: allergenTags,
      // Only include opening stock for new products
      ...(!isEditing && { openingStock: Number(formData.openingStock) || 0 }),
      // Pass override so Inventory.jsx can resolve final isMedicine value
      ...(isMedicineOverride !== null && { isMedicineOverride }),
    });
  };

  // ── Quick-add category ──────────────────────────────────────────────────
  const handleQuickAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const lowerName = newCatName.trim().toLowerCase();
      // T2.162: Dedup guard — select existing instead of creating a duplicate
      if (categories.some(c => c.name === lowerName)) {
        setFormData(prev => ({ ...prev, category: lowerName }));
        setShowQuickAdd(false);
        setNewCatName('');
        showToast(`Category "${formatCategory(lowerName)}" already exists. Selected.`, 'info');
        return;
      }
      await addDoc(collection(db, 'inventory_categories'), { name: lowerName, isMedicine: false });
      setFormData(prev => ({ ...prev, category: lowerName }));
      setShowQuickAdd(false);
      setNewCatName('');
      showToast(`Category "${formatCategory(lowerName)}" created.`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const sxField = { 
    bgcolor: 'white', 
    '& .MuiOutlinedInput-root': { 
      borderRadius: 0, 
      '& fieldset': { border: '2px solid #5D4037' },
      '&:hover fieldset': { borderColor: '#3E2723' },
      '&.Mui-focused fieldset': { borderColor: '#5D4037', borderSize: '3px' }
    },
    '& .MuiInputLabel-root': { color: '#5D4037', fontWeight: 'bold' }
  };

  return (
    <>
      <Dialog 
        open={open} 
        onClose={onClose} 
        maxWidth="md" 
        fullWidth 
        PaperProps={{ 
          sx: { 
            borderRadius: 0,
            border: '2px solid #5D4037',
            backgroundColor: '#FFF',
            boxShadow: '8px 8px 0px rgba(93, 64, 55, 0.1)',
            maxHeight: '90vh',
          } 
        }}
      >
        <DialogTitle sx={{ 
          bgcolor: '#FFF8E1', 
          color: '#3E2723', fontWeight: '1000', display: 'flex', alignItems: 'center', gap: 1.5, py: 2,
          borderBottom: '2px solid #5D4037',
          fontFamily: 'Inter, sans-serif',
          textTransform: 'uppercase',
          letterSpacing: 1,
          fontSize: '1.1rem'
        }}>
          {isEditing ? <MedicationIcon sx={{ color: '#5D4037' }} /> : <AddCircleIcon sx={{ color: '#5D4037' }} />}
          {isEditing ? 'Edit Product Details' : 'Add New Product'}
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0, bgcolor: '#FAF9F7' }}>
          <Box sx={{ p: { xs: 2.5, md: 4 }, display: 'flex', flexDirection: 'column', gap: 3 }}>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 1: CORE IDENTITY & CLASSIFICATION
              ═══════════════════════════════════════════════════════════════ */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: '#5D4037', letterSpacing: 1 }}>
              1. CORE IDENTITY &amp; CLASSIFICATION
            </Typography>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 0, border: '2px solid #5D4037', bgcolor: '#FFF' }}>
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
                      else {
                        setFormData(prev => ({ ...prev, category: e.target.value }));
                        setIsMedicineOverride(null); // Reset override so it re-derives from new category
                      }
                    }}
                    error={!!errors.category}
                    helperText={
                      errors.category
                      || ((categories.find(c => c.name === formData.category)?.isMedicine)
                        ? "Medicine: Triggers pharmacy alerts."
                        : "Retail: Standard checkout.")
                    }
                    sx={sxField}
                  >
                    {(categories || []).map(cat => (
                      <MenuItem key={cat.name} value={cat.name} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {formatCategory(cat.name)}
                        {cat.isMedicine && <MedicationIcon sx={{ fontSize: 16, color: '#D32F2F', ml: 1 }} />}
                      </MenuItem>
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

                {/* T2.167b: isMedicine override toggle — defaults to category flag, allows per-item override */}
                <Grid size={{ xs: 12 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={
                          isMedicineOverride !== null
                            ? isMedicineOverride
                            : (categories.find(c => c.name === formData.category)?.isMedicine || false)
                        }
                        onChange={(e) => setIsMedicineOverride(e.target.checked)}
                        color="error"
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#5D4037' }}>
                        Requires pharmacy dispensing verification
                      </Typography>
                    }
                  />
                </Grid>
              </Grid>
            </Paper>
          </Box>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 2: BATCH & TRACEABILITY
              ═══════════════════════════════════════════════════════════════ */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: '#5D4037', letterSpacing: 1 }}>
              2. BATCH &amp; TRACEABILITY
            </Typography>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 0, border: '2px solid #5D4037', bgcolor: '#FFF' }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Lot / Batch Number"
                    placeholder="e.g. LOT-2025-0912"
                    fullWidth
                    value={formData.lotNumber}
                    onChange={set('lotNumber')}
                    sx={sxField}
                    helperText="Found on the product’s packaging or CoA."
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
                    helperText="Required for medications and biologicals."
                  />
                </Grid>
              </Grid>
            </Paper>
          </Box>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 2b: ALLERGEN SAFETY TAGS (T2.175)
              ═══════════════════════════════════════════════════════════════ */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: '#C62828', letterSpacing: 1 }}>
              2b. ALLERGEN SAFETY TAGS
            </Typography>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 0, border: '2px solid #C62828', bgcolor: '#FFF' }}>
              <Typography variant="body2" sx={{ color: '#5D4037', fontWeight: 600, mb: 1.5, fontSize: '0.8rem' }}>
                Tag any allergens present in this product (e.g. Chicken, Penicillin, Latex). The dispensing
                workflow will warn staff if a tagged allergen matches a patient's known allergies.
              </Typography>

              {/* Tag display */}
              <Stack direction="row" flexWrap="wrap" gap={1} mb={allergenTags.length > 0 ? 1.5 : 0}>
                {allergenTags.map((tag, idx) => (
                  <Chip
                    key={idx}
                    label={tag}
                    onDelete={() => setAllergenTags(prev => prev.filter((_, i) => i !== idx))}
                    icon={<WarningAmberIcon sx={{ fontSize: '14px !important', color: 'white !important' }} />}
                    sx={{
                      bgcolor: '#C62828', color: 'white', fontWeight: 900,
                      fontSize: '0.75rem', borderRadius: '4px',
                      '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.8) !important' },
                    }}
                  />
                ))}
              </Stack>

              {/* Tag input */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  size="small"
                  placeholder="Type allergen and press Enter or +"
                  value={allergenInput}
                  onChange={e => setAllergenInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && allergenInput.trim()) {
                      e.preventDefault();
                      const tag = allergenInput.trim();
                      if (!allergenTags.includes(tag)) {
                        setAllergenTags(prev => [...prev, tag]);
                      }
                      setAllergenInput('');
                    }
                  }}
                  sx={{
                    flex: 1,
                    bgcolor: 'white',
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 0,
                      '& fieldset': { border: '2px solid #C62828' },
                      '&:hover fieldset': { borderColor: '#B71C1C' },
                      '&.Mui-focused fieldset': { borderColor: '#C62828' },
                    },
                  }}
                />
                <Button
                  variant="contained"
                  disabled={!allergenInput.trim()}
                  onClick={() => {
                    const tag = allergenInput.trim();
                    if (tag && !allergenTags.includes(tag)) {
                      setAllergenTags(prev => [...prev, tag]);
                    }
                    setAllergenInput('');
                  }}
                  sx={{ bgcolor: '#C62828', borderRadius: 0, border: '2px solid #B71C1C', fontWeight: 1000, '&:hover': { bgcolor: '#B71C1C' } }}
                >
                  +
                </Button>
              </Box>
            </Paper>
          </Box>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 3: FINANCIALS & MARGINS
              ═══════════════════════════════════════════════════════════════ */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: '#5D4037', letterSpacing: 1 }}>
              3. FINANCIALS &amp; MARGINS
            </Typography>
            <Paper elevation={0} sx={{ p: 3, bgcolor: '#EFEBE9', border: '2px solid #5D4037', borderRadius: 0 }}>
              <Grid container spacing={2} alignItems="stretch">
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    label="Cost Price" type="number" fullWidth
                    value={formData.costPrice} onChange={set('costPrice')}
                    error={!!errors.costPrice} helperText={errors.costPrice}
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
                        borderRadius: 0,
                        '& fieldset': { borderColor: formData.costPrice && formData.price ? marginData.color : '#E0E0E0' },
                      },
                    }}
                  />
                </Grid>
              </Grid>
            </Paper>
          </Box>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 4: LOGISTICS & SOURCING
              ═══════════════════════════════════════════════════════════════ */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: '#5D4037', letterSpacing: 1 }}>
              4. LOGISTICS &amp; SOURCING
            </Typography>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 0, border: '2px solid #5D4037', bgcolor: '#FFF' }}>
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
            </Paper>
          </Box>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 5: STOCK SAFEGUARDS
              ═══════════════════════════════════════════════════════════════ */}
          <Box>
            <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: '#5D4037', letterSpacing: 1 }}>
              5. STOCK SAFEGUARDS
            </Typography>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 0, border: '2px solid #5D4037', bgcolor: '#FFF' }}>
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
            </Paper>
          </Box>
        </Box>
      </DialogContent>

        <DialogActions sx={{ p: 2.5, bgcolor: '#FFF8E1', borderTop: '2px solid #5D4037' }}>
          <Button 
            onClick={onClose} 
            sx={{ 
              fontWeight: '1000', color: '#5D4037', px: 3, mr: 1, 
              fontFamily: 'Inter, sans-serif', borderRadius: 0, 
              border: '2px solid #5D4037',
              '&:hover': { bgcolor: 'rgba(93, 64, 55, 0.05)' }
            }}
          >
            CANCEL
          </Button>
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            sx={{ 
              bgcolor: '#D84315', fontWeight: '1000', px: 4, py: 1.2, borderRadius: 0, 
              boxShadow: '4px 4px 0px rgba(216,67,21,0.2)',
              border: '2px solid #BF360C',
              '&:hover': { bgcolor: '#BF360C', boxShadow: '2px 2px 0px rgba(216,67,21,0.2)' },
              fontFamily: 'Inter, sans-serif'
            }}
          >
            {isEditing ? 'SAVE CHANGES' : 'CREATE PRODUCT'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Quick-Add Category micro-modal ── */}
      <Dialog open={showQuickAdd} onClose={() => setShowQuickAdd(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 0, border: '2px solid #5D4037', boxShadow: '8px 8px 0px rgba(0,0,0,0.1)' } }}>
        <DialogTitle sx={{ bgcolor: '#D84315', color: 'white', fontWeight: '1000', letterSpacing: 1, textTransform: 'uppercase', fontSize: '1rem', borderBottom: '2px solid #BF360C' }}>
          Quick Add Category
        </DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: '#FAF9F7' }}>
          <TextField
            autoFocus label="Category Name" fullWidth
            sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: 0, bgcolor: 'white' } }}
            value={newCatName} onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleQuickAddCategory()}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#FFF8E1', borderTop: '2px solid #5D4037' }}>
          <Button onClick={() => setShowQuickAdd(false)} sx={{ fontWeight: '1000', color: '#5D4037', border: '1px solid #5D4037', borderRadius: 0 }}>CANCEL</Button>
          <Button onClick={handleQuickAddCategory} variant="contained" sx={{ bgcolor: '#D84315', fontWeight: '1000', borderRadius: 0, border: '1px solid #BF360C', boxShadow: '2px 2px 0px rgba(0,0,0,0.1)' }}>
            CREATE & SELECT
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}