import React, { useState, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, MenuItem, Box, InputAdornment, Divider, Typography, Grid, Paper,
  Chip, Stack, ToggleButton, ToggleButtonGroup
} from '@mui/material';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import InsightsIcon from '@mui/icons-material/Insights';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import VaccinesIcon from '@mui/icons-material/Vaccines';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import MedicationIcon from '@mui/icons-material/Medication';
import { formatCategory } from '../Inventory';
import { FONT, COLORS } from '../../../theme/designTokens';

const PRODUCT_CLASS_OPTIONS = [
  {
    value: 'medicine',
    label: 'Medicine',
    helper: 'Health product prescribed or recommended by the vet. Routes to dispensing for verification. Auto-generates dosing instructions. Appears in discharge medications.',
    color: COLORS.danger,
  },
  {
    value: 'medical_supply',
    label: 'Medical Supply',
    helper: 'Take-home clinical supply. Goes directly to billing. Appears in discharge as take-home supplies.',
    color: '#757575',
  },
  {
    value: 'retail',
    label: 'Retail',
    helper: 'Non-clinical product. Goes directly to billing. Does not appear on discharge summary.',
    color: COLORS.textMuted,
  },
];

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
  const [productClass, setProductClass] = useState(item?.productClass || null);

  // T4.117: Vaccine-specific configuration — only persisted when category === 'vaccine'
  const [vaccineConfig, setVaccineConfig] = useState({
    species:             item?.vaccineConfig?.species             || ['dog'],
    intervalDays:        item?.vaccineConfig?.intervalDays?.toString() || '365',
    defaultRoute:        item?.vaccineConfig?.defaultRoute        || 'SQ',
    defaultSite:         item?.vaccineConfig?.defaultSite         || 'Right Scruff',
    defaultManufacturer: item?.vaccineConfig?.defaultManufacturer || '',
  });

  // Helper: update one field and clear its error
  const set = (key) => (e) => {
    setFormData(prev => ({ ...prev, [key]: e.target.value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const isVaccineCategory = formData.category === 'vaccine';

  const foundCat = categories.find(c => c.name === formData.category);
  const resolvedProductClass = productClass !== null
    ? productClass
    : (foundCat?.productClass || (foundCat?.isMedicine ? 'medicine' : 'retail'));

  // ── Live Margin Calculator ──────────────────────────────────────────────
  const marginData = useMemo(() => {
    const cost   = Number(formData.costPrice) || 0;
    const retail = Number(formData.price)     || 0;
    if (!cost || !retail || cost >= retail)
      return { percentage: 0, profit: 0, color: COLORS.danger, healthy: false };
    const profit     = retail - cost;
    const percentage = (profit / retail) * 100;
    const isHealthy  = percentage >= 30;
    return { percentage: percentage.toFixed(1), profit: profit.toFixed(2), color: isHealthy ? COLORS.success : COLORS.warning, healthy: isHealthy };
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
      newErrors.unit = 'Dispensing unit is required (e.g. Capsule, Vial, Bottle).';

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
      ...(productClass !== null && { productClassOverride: productClass }),
      // T4.117: Include vaccineConfig sub-object only for vaccine-category products
      ...(isVaccineCategory && {
        vaccineConfig: {
          species:             vaccineConfig.species,
          intervalDays:        Number(vaccineConfig.intervalDays) || 365,
          defaultRoute:        vaccineConfig.defaultRoute,
          defaultSite:         vaccineConfig.defaultSite,
          defaultManufacturer: vaccineConfig.defaultManufacturer,
        },
      }),
    });
  };

  const MEDICINE_KEYWORDS = [
    'antibiotic', 'vaccine', 'dewormer', 'antifungal', 'analgesic',
    'anti-inflammatory', 'sedative', 'anesthetic', 'steroid', 'supplement',
    'ointment', 'injectable', 'serum', 'anthelmintic', 'antimicrobial',
  ];

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
      const autoMedicine = MEDICINE_KEYWORDS.some(kw => lowerName.includes(kw));
      await addDoc(collection(db, 'inventory_categories'), {
        name: lowerName,
        isMedicine: autoMedicine,
        productClass: autoMedicine ? 'medicine' : 'retail',
      });
      setFormData(prev => ({ ...prev, category: lowerName }));
      setShowQuickAdd(false);
      setNewCatName('');
      showToast(`Category "${formatCategory(lowerName)}" created.`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const sxField = {
    bgcolor: COLORS.cardBg,
    '& .MuiOutlinedInput-root': {
      borderRadius: 0,
      '& fieldset': { border: `2px solid ${COLORS.accent}` },
      '&:hover fieldset': { borderColor: COLORS.brand },
      '&.Mui-focused fieldset': { borderColor: COLORS.accent, borderSize: '3px' }
    },
    '& .MuiInputLabel-root': { color: COLORS.accent, fontWeight: 'bold' }
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
            border: `2px solid ${COLORS.accent}`,
            backgroundColor: COLORS.cardBg,
            boxShadow: '8px 8px 0px rgba(93, 64, 55, 0.1)',
            maxHeight: '90vh',
          }
        }}
      >
        <DialogTitle sx={{
          bgcolor: COLORS.cream,
          color: COLORS.brand, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1.5, py: 2,
          borderBottom: `2px solid ${COLORS.accent}`,
          fontFamily: FONT,
          textTransform: 'uppercase',
          letterSpacing: 1,
          fontSize: '1.1rem'
        }}>
          {isEditing ? <MedicationIcon sx={{ color: COLORS.accent }} /> : <AddCircleIcon sx={{ color: COLORS.accent }} />}
          {isEditing ? 'Edit Product Details' : 'Add New Product'}
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0, bgcolor: COLORS.formBg }}>
          <Box sx={{ p: { xs: 2.5, md: 4 }, display: 'flex', flexDirection: 'column', gap: 3 }}>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 1: CORE IDENTITY & CLASSIFICATION
              ═══════════════════════════════════════════════════════════════ */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: COLORS.accent, letterSpacing: 1 }}>
              1. CORE IDENTITY &amp; CLASSIFICATION
            </Typography>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 0, border: `2px solid ${COLORS.accent}`, bgcolor: COLORS.cardBg }}>
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
                        setProductClass(null);
                      }
                    }}
                    error={!!errors.category}
                    helperText={
                      errors.category
                      || (() => {
                        const catPC = categories.find(c => c.name === formData.category)?.productClass;
                        if (catPC === 'medicine') return 'Default: Medicine — routes to pharmacy.';
                        if (catPC === 'medical_supply') return 'Default: Medical Supply — clinical take-home.';
                        return 'Default: Retail — standard checkout.';
                      })()
                    }
                    sx={sxField}
                  >
                    {(categories || []).map(cat => {
                      const pc = cat.productClass || (cat.isMedicine ? 'medicine' : 'retail');
                      const dotColor = pc === 'medicine' ? COLORS.danger : pc === 'medical_supply' ? '#757575' : COLORS.textMuted;
                      return (
                        <MenuItem key={cat.name} value={cat.name} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          {formatCategory(cat.name)}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dotColor }} />
                            {cat.name === 'vaccine' && <VaccinesIcon sx={{ fontSize: 16, color: COLORS.success, ml: 0.5 }} />}
                          </Box>
                        </MenuItem>
                      );
                    })}
                    <Divider />
                    <MenuItem value="ADD_NEW" sx={{ color: COLORS.cta, fontWeight: 'bold' }}>
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
                    label="Dispensing Unit" placeholder="e.g. Capsule, Tablet, Bottle" required fullWidth
                    value={formData.unit} onChange={set('unit')}
                    error={!!errors.unit} helperText={errors.unit || 'Required'}
                    sx={sxField}
                  />
                </Grid>
                {resolvedProductClass === 'medicine' && (
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      label="Dosage / Strength" placeholder="e.g. 50mg, 10ml" fullWidth
                      value={formData.dosage} onChange={set('dosage')} sx={sxField}
                    />
                  </Grid>
                )}

                <Grid size={{ xs: 12 }}>
                  <TextField
                    select
                    label="Product Classification"
                    fullWidth
                    value={resolvedProductClass}
                    onChange={(e) => setProductClass(e.target.value)}
                    helperText={
                      PRODUCT_CLASS_OPTIONS.find(o => o.value === resolvedProductClass)?.helper || ''
                    }
                    sx={sxField}
                  >
                    {PRODUCT_CLASS_OPTIONS.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: opt.color }} />
                          {opt.label}
                        </Box>
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>
            </Paper>
          </Box>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 2: BATCH & TRACEABILITY
              ═══════════════════════════════════════════════════════════════ */}
          {resolvedProductClass === 'medicine' && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: COLORS.accent, letterSpacing: 1 }}>
                2. BATCH &amp; TRACEABILITY
              </Typography>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 0, border: `2px solid ${COLORS.accent}`, bgcolor: COLORS.cardBg }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Lot / Batch Number"
                      placeholder="e.g. LOT-2025-0912"
                      fullWidth
                      value={formData.lotNumber}
                      onChange={set('lotNumber')}
                      sx={sxField}
                      helperText="Found on the product's packaging or CoA."
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
          )}

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 2b: ALLERGEN SAFETY TAGS (T2.175)
              ═══════════════════════════════════════════════════════════════ */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: COLORS.surgery, letterSpacing: 1 }}>
              2b. ALLERGEN SAFETY TAGS
            </Typography>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 0, border: `2px solid ${COLORS.surgery}`, bgcolor: COLORS.cardBg }}>
              <Typography variant="body2" sx={{ color: COLORS.accent, fontWeight: 600, mb: 1.5, fontSize: '0.8rem' }}>
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
                      bgcolor: COLORS.surgery, color: COLORS.cardBg, fontWeight: 900,
                      fontSize: '0.75rem', borderRadius: 0,
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
                      '& fieldset': { border: `2px solid ${COLORS.surgery}` },
                      '&:hover fieldset': { borderColor: COLORS.dangerHover },
                      '&.Mui-focused fieldset': { borderColor: COLORS.surgery },
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
                  sx={{ bgcolor: COLORS.surgery, borderRadius: 0, border: `2px solid ${COLORS.dangerHover}`, fontWeight: 900, '&:hover': { bgcolor: COLORS.dangerHover } }}
                >
                  +
                </Button>
              </Box>
            </Paper>
          </Box>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 2c: VACCINE CONFIGURATION (T4.117 — conditional)
              ═══════════════════════════════════════════════════════════════ */}
          {isVaccineCategory && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="overline" fontWeight="900" display="block" mb={1}
                sx={{ color: COLORS.success, letterSpacing: 1 }}>
                2c. VACCINE CONFIGURATION
              </Typography>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 0,
                border: `2px solid ${COLORS.success}`, bgcolor: COLORS.cardBg }}>

                <Typography variant="body2" sx={{ color: COLORS.accent, fontWeight: 600,
                  mb: 1.5, fontSize: '0.8rem' }}>
                  These fields configure vaccine-specific behavior: species targeting,
                  revaccination interval tracking, and clinical form defaults.
                </Typography>

                <Grid container spacing={2}>
                  {/* Species multi-select */}
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Typography variant="caption" sx={{ fontWeight: 900, color: COLORS.accent,
                      display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Target Species
                    </Typography>
                    <ToggleButtonGroup
                      multiple
                      value={vaccineConfig.species}
                      onChange={(_, val) => {
                        // Prevent deselecting all species
                        if (val.length > 0) setVaccineConfig(prev => ({ ...prev, species: val }));
                      }}
                      size="small"
                      sx={{
                        gap: 0.5,
                        '& .MuiToggleButton-root': {
                          border: `2px solid ${COLORS.success}33 !important`,
                          borderRadius: '0 !important',
                          fontWeight: 900, fontSize: '0.65rem', color: COLORS.accent,
                          px: 1.5, py: 0.5,
                          '&.Mui-selected': {
                            bgcolor: `${COLORS.success} !important`,
                            color: `${COLORS.cardBg} !important`,
                          },
                        },
                      }}
                    >
                      <ToggleButton value="dog">Dog</ToggleButton>
                      <ToggleButton value="cat">Cat</ToggleButton>
                    </ToggleButtonGroup>
                  </Grid>

                  {/* Revaccination interval */}
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField
                      fullWidth label="Revaccination Interval (days)" size="small"
                      type="number"
                      value={vaccineConfig.intervalDays}
                      onChange={(e) => setVaccineConfig(prev => ({
                        ...prev, intervalDays: e.target.value
                      }))}
                      sx={sxField}
                      helperText="Auto-calculates next due date"
                    />
                  </Grid>

                  {/* Default manufacturer */}
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField
                      fullWidth label="Default Manufacturer" size="small"
                      value={vaccineConfig.defaultManufacturer}
                      onChange={(e) => setVaccineConfig(prev => ({
                        ...prev, defaultManufacturer: e.target.value
                      }))}
                      sx={sxField}
                      helperText="Pre-fills in clinical form"
                    />
                  </Grid>

                  {/* Default route */}
                  <Grid size={{ xs: 6, sm: 6 }}>
                    <TextField
                      fullWidth label="Default Route" size="small" select
                      value={vaccineConfig.defaultRoute}
                      onChange={(e) => setVaccineConfig(prev => ({
                        ...prev, defaultRoute: e.target.value
                      }))}
                      sx={sxField}
                    >
                      {['SQ', 'IM', 'ID', 'IN', 'PO'].map(r => (
                        <MenuItem key={r} value={r}>{r}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>

                  {/* Default injection site */}
                  <Grid size={{ xs: 6, sm: 6 }}>
                    <TextField
                      fullWidth label="Default Injection Site" size="small"
                      value={vaccineConfig.defaultSite}
                      onChange={(e) => setVaccineConfig(prev => ({
                        ...prev, defaultSite: e.target.value
                      }))}
                      sx={sxField}
                      helperText="e.g. Right Scruff, Left Thigh"
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Box>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 3: FINANCIALS & MARGINS
              ═══════════════════════════════════════════════════════════════ */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: COLORS.accent, letterSpacing: 1 }}>
              3. FINANCIALS &amp; MARGINS
            </Typography>
            <Paper elevation={0} sx={{ p: 3, bgcolor: COLORS.panelBg, border: `2px solid ${COLORS.accent}`, borderRadius: 0 }}>
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
                        bgcolor: formData.costPrice && formData.price ? `${marginData.color}0A` : COLORS.tableHeaderBg,
                      },
                    }}
                    fullWidth
                    sx={{
                      height: '100%',
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 0,
                        '& fieldset': { borderColor: formData.costPrice && formData.price ? marginData.color : COLORS.borderInput },
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
            <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: COLORS.accent, letterSpacing: 1 }}>
              4. LOGISTICS &amp; SOURCING
            </Typography>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 0, border: `2px solid ${COLORS.accent}`, bgcolor: COLORS.cardBg }}>
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
            <Typography variant="overline" fontWeight="900" display="block" mb={1} sx={{ color: COLORS.accent, letterSpacing: 1 }}>
              5. STOCK SAFEGUARDS
            </Typography>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 0, border: `2px solid ${COLORS.accent}`, bgcolor: COLORS.cardBg }}>
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

        <DialogActions sx={{ p: 2.5, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.accent}` }}>
          <Button
            onClick={onClose}
            sx={{
              fontWeight: 900, color: COLORS.accent, px: 3, mr: 1,
              fontFamily: FONT, borderRadius: 0,
              border: `2px solid ${COLORS.accent}`,
              '&:hover': { bgcolor: 'rgba(93, 64, 55, 0.05)' }
            }}
          >
            CANCEL
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            sx={{
              bgcolor: COLORS.cta, fontWeight: 900, px: 4, py: 1.2, borderRadius: 0,
              boxShadow: '4px 4px 0px rgba(216,67,21,0.2)',
              border: `2px solid ${COLORS.ctaHover}`,
              '&:hover': { bgcolor: COLORS.ctaHover, boxShadow: '2px 2px 0px rgba(216,67,21,0.2)' },
              fontFamily: FONT
            }}
          >
            {isEditing ? 'SAVE CHANGES' : 'CREATE PRODUCT'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Quick-Add Category micro-modal ── */}
      <Dialog open={showQuickAdd} onClose={() => setShowQuickAdd(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.accent}`, boxShadow: '8px 8px 0px rgba(0,0,0,0.1)' } }}>
        <DialogTitle sx={{ bgcolor: COLORS.cta, color: COLORS.cardBg, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', fontSize: '1rem', borderBottom: `2px solid ${COLORS.ctaHover}` }}>
          Quick Add Category
        </DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: COLORS.formBg }}>
          <TextField
            autoFocus label="Category Name" fullWidth
            sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: 0, bgcolor: 'white' } }}
            value={newCatName} onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleQuickAddCategory()}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.accent}` }}>
          <Button onClick={() => setShowQuickAdd(false)} sx={{ fontWeight: 900, color: COLORS.accent, border: `1px solid ${COLORS.accent}`, borderRadius: 0 }}>CANCEL</Button>
          <Button onClick={handleQuickAddCategory} variant="contained" sx={{ bgcolor: COLORS.cta, fontWeight: 900, borderRadius: 0, border: `1px solid ${COLORS.ctaHover}`, boxShadow: '2px 2px 0px rgba(0,0,0,0.1)' }}>
            CREATE & SELECT
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}