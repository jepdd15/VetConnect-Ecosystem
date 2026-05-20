import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Chip, Button, Box, Typography, Paper, InputAdornment, FormControlLabel,
  Switch, FormControl, InputLabel, Select, Grid, IconButton, Divider,
  ListSubheader, Autocomplete, useTheme, useMediaQuery,
} from '@mui/material';

import { useUser } from '../../../context/UserContext';

import TimerIcon from '@mui/icons-material/Timer';
import DescriptionIcon from '@mui/icons-material/Description';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ScaleIcon from '@mui/icons-material/Scale';
import CircleIcon from '@mui/icons-material/Circle';

import { COLORS, FONT } from '../../../theme/designTokens';

export default function ServiceFormModal({ open, onClose, item, inventory, onSave, showToast, departments }) {

  const { isAdmin } = useUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Build initial linkedProducts — migrate old singular field
  const initLinkedProducts = item?.linkedProducts
    || (item?.linkedProduct ? [item.linkedProduct] : []);

  // Build initial pricingTiers
  const initTiers = item?.pricingTiers?.length > 0
    ? item.pricingTiers
    : [{ minWeight: 0, maxWeight: 10, price: 0 }];

  const [formData, setFormData] = useState({
    name:          item?.name          || '',
    department:    item?.department    || item?.category || '',
    price:         item?.price?.toString()       || '',
    duration:      item?.duration?.toString()    || '30',
    bufferTime:    item?.bufferTime?.toString()  || '5',
    description:   item?.description   || '',
    targetSpecies: item?.targetSpecies  || 'Universal',
    isWalkIn:      item ? item.isWalkIn  : true,
    isInpatient:   item?.isInpatient   || false,
    isEmergency:   item?.isEmergency   || false,
    // Multi-product bundling
    linkedProducts: initLinkedProducts,
    // Tiered pricing
    hasTieredPricing: item?.hasTieredPricing || false,
    pricingTiers:     initTiers,
    // SC/PWD eligibility — default true for backward compat (all existing services remain discountable)
    isScPwdEligible: item?.isScPwdEligible !== false,
  });

  // ── Tiered pricing helpers ───────────────────────────────────────────
  const addTier = () => {
    setFormData(prev => ({
      ...prev,
      pricingTiers: [...prev.pricingTiers, { minWeight: 0, maxWeight: 0, price: 0 }],
    }));
  };

  const removeTier = (idx) => {
    setFormData(prev => ({
      ...prev,
      pricingTiers: prev.pricingTiers.filter((_, i) => i !== idx),
    }));
  };

  const updateTier = (idx, field, value) => {
    setFormData(prev => {
      const tiers = [...prev.pricingTiers];
      tiers[idx] = { ...tiers[idx], [field]: Number(value) || 0 };
      return { ...prev, pricingTiers: tiers };
    });
  };

  // ── Linked products helpers ──────────────────────────────────────────
  const addLinkedProduct = (productId) => {
    if (!productId || formData.linkedProducts.includes(productId)) return;
    setFormData(prev => ({ ...prev, linkedProducts: [...prev.linkedProducts, productId] }));
  };

  const removeLinkedProduct = (productId) => {
    setFormData(prev => ({ ...prev, linkedProducts: prev.linkedProducts.filter(id => id !== productId) }));
  };

  const handleSave = () => {
    if (!formData.name || formData.price === '') {
      return showToast("Service Name and Base Price are required.", "error");
    }

    const parsedPrice    = parseFloat(formData.price);
    const parsedDuration = parseInt(formData.duration, 10);
    const parsedBuffer   = parseInt(formData.bufferTime, 10);

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return showToast("Base Price must be a valid non-negative number.", "error");
    }
    if (isNaN(parsedDuration) || parsedDuration <= 0) {
      return showToast("Duration must be a positive number.", "error");
    }
    if (isNaN(parsedBuffer) || parsedBuffer < 0) {
      return showToast("Buffer Time must be a valid non-negative number.", "error");
    }

    if (formData.hasTieredPricing && formData.pricingTiers.length === 0) {
      return showToast("Add at least one pricing tier or disable tiered pricing.", "error");
    }

    // Tier validation: negative values, inversion, and overlap checks
    if (formData.hasTieredPricing && formData.pricingTiers.length > 0) {
      for (let i = 0; i < formData.pricingTiers.length; i++) {
        const t = formData.pricingTiers[i];
        const min       = Number(t.minWeight) || 0;
        const max       = Number(t.maxWeight) || 0;
        const tierPrice = Number(t.price)     || 0;

        if (min < 0 || max < 0) {
          return showToast(`Tier ${i + 1}: Weight values cannot be negative.`, "error");
        }
        if (tierPrice < 0) {
          return showToast(`Tier ${i + 1}: Price cannot be negative.`, "error");
        }
        if (max !== 0 && min > max) {
          return showToast(`Tier ${i + 1}: Min weight (${min}kg) exceeds Max weight (${max}kg).`, "error");
        }
      }

      // Overlap check: sort by minWeight and verify no tier's range bleeds into the next
      const sorted = formData.pricingTiers
        .map((t, i) => ({ ...t, idx: i }))
        .sort((a, b) => (Number(a.minWeight) || 0) - (Number(b.minWeight) || 0));

      for (let i = 1; i < sorted.length; i++) {
        const prev    = sorted[i - 1];
        const curr    = sorted[i];
        const prevMax = Number(prev.maxWeight) || 0;
        const currMin = Number(curr.minWeight) || 0;

        // A tier with max=0 has no upper bound — no subsequent tier can exist
        if (prevMax === 0) {
          return showToast(`Tier ${prev.idx + 1} has no upper limit (Max=0) but Tier ${curr.idx + 1} also exists. Only the last tier should have Max=0.`, "error");
        }
        // Overlap: current min falls inside the previous tier's range
        if (currMin < prevMax) {
          return showToast(`Tiers ${prev.idx + 1} and ${curr.idx + 1} overlap at ${currMin}kg.`, "error");
        }
      }
    }

    const finalData = {
      ...formData,
      price:      parsedPrice,
      duration:   parsedDuration,
      bufferTime: parsedBuffer,
    };
    onSave(finalData);
  };

  const noExtensionProps = { spellCheck: 'false', 'data-gramm': 'false' };
  const sxField = {
    bgcolor: 'white',
    '& .MuiOutlinedInput-root': {
      borderRadius: 0,
      '& fieldset': { border: `2px solid ${COLORS.accent}` },
      '&:hover fieldset': { borderColor: COLORS.brand },
      '&.Mui-focused fieldset': { borderColor: COLORS.accent, borderWidth: '3px' },
    },
    '& .MuiInputLabel-root': { color: COLORS.accent, fontWeight: 'bold' },
  };

  // Products not yet linked
  const availableToLink = (inventory || []).filter(i => !formData.linkedProducts.includes(i.id));

  return (
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
          maxHeight: '92vh',
        },
      }}
    >
      <DialogTitle sx={{
        bgcolor: COLORS.cream, color: COLORS.brand, fontWeight: 900,
        display: 'flex', alignItems: 'center', gap: 1.5, py: 2,
        borderBottom: `2px solid ${COLORS.accent}`, fontFamily: FONT,
        textTransform: 'uppercase', letterSpacing: 1, fontSize: '1.1rem',
      }}>
        <MedicalServicesIcon sx={{ color: COLORS.accent }} />
        {item ? "Edit Service Configuration" : "Create New Service"}
      </DialogTitle>

      <DialogContent sx={{ p: 0, bgcolor: COLORS.formBg, overflowY: 'auto' }}>
        <Box sx={{ p: { xs: 2, md: 3 } }}>

          {/* ── Section 1: Identity & Routing ── */}
          <Typography variant="overline" sx={{ color: COLORS.accent, fontWeight: 900, mb: 1, display: 'block', letterSpacing: 1 }}>
            1. SERVICE IDENTITY & ROUTING
          </Typography>
          <Paper sx={{ p: 3, mb: 4, borderRadius: 0, border: `2px solid ${COLORS.accent}`, bgcolor: COLORS.cardBg, boxShadow: 'none' }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 8 }}>
                <TextField label="Service Name" fullWidth size="small" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} sx={sxField} inputProps={noExtensionProps} />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControl fullWidth size="small" sx={sxField}>
                  <InputLabel>Target Species</InputLabel>
                  <Select value={formData.targetSpecies || 'Universal'} label="Target Species" onChange={(e) => setFormData({ ...formData, targetSpecies: e.target.value })}>
                    <MenuItem value="Universal">🐾 Universal</MenuItem>
                    <MenuItem value="Canine">🐶 Canine</MenuItem>
                    <MenuItem value="Feline">🐱 Feline</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <FormControl fullWidth size="small" sx={sxField}>
                  <InputLabel>Target Department</InputLabel>
                  <Select
                    value={formData.department || ''}
                    label="Target Department"
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  >
                    <MenuItem value="" disabled><em>Select Department</em></MenuItem>
                    {(departments || []).map((dept) => (
                      <MenuItem key={dept.id} value={dept.name}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <CircleIcon sx={{ color: dept.color || '#616161', fontSize: 16 }} />
                          <Typography variant="body2" fontWeight="bold">{dept.name}</Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Paper>

          {/* ── Section 2: Logistics, Time & Billing ── */}
          <Typography variant="overline" sx={{ color: COLORS.accent, fontWeight: 900, mb: 1, display: 'block', letterSpacing: 1 }}>
            2. LOGISTICS, TIME & BILLING
          </Typography>
          <Paper sx={{ p: 3, mb: 4, bgcolor: COLORS.cardBg, border: `2px solid ${COLORS.accent}`, borderRadius: 0, boxShadow: 'none' }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  label="Base Price" type="number" fullWidth size="small"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                  inputProps={{ min: 0 }}
                  sx={sxField}
                  disabled={formData.hasTieredPricing}
                  helperText={formData.hasTieredPricing ? "Override by weight tiers below" : ""}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <TextField
                  label="Duration" type="number" fullWidth size="small"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  InputProps={{ endAdornment: <InputAdornment position="end">Mins</InputAdornment> }}
                  inputProps={{ min: 1 }}
                  sx={sxField}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <TextField
                  label="Cleanup Buffer" type="number" fullWidth size="small"
                  value={formData.bufferTime}
                  onChange={(e) => setFormData({ ...formData, bufferTime: e.target.value })}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><TimerIcon fontSize="small" sx={{ color: COLORS.accent }} /></InputAdornment>,
                    endAdornment: <InputAdornment position="end">Mins</InputAdornment>,
                  }}
                  inputProps={{ min: 0 }}
                  sx={sxField}
                />
              </Grid>

              {/* ── Weight-Based Pricing Tiers ── */}
              <Grid size={{ xs: 12 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: formData.hasTieredPricing ? 1.5 : 0 }}>
                  <ScaleIcon sx={{ color: COLORS.accent, fontSize: 18 }} />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.hasTieredPricing}
                        onChange={(e) => setFormData({ ...formData, hasTieredPricing: e.target.checked })}
                        sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.accent }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: COLORS.accent } }}
                      />
                    }
                    label={<Typography variant="body2" sx={{ fontWeight: 900, color: COLORS.accent }}>ENABLE WEIGHT-BASED PRICING</Typography>}
                  />
                </Box>

                {formData.hasTieredPricing && (
                  <Box>
                    <Box sx={{ display: { xs: 'none', sm: 'grid' }, gridTemplateColumns: '1fr 1fr 1fr auto', gap: 1, mb: 1 }}>
                      {['Min (kg)', 'Max (kg)', 'Price (₱)', ''].map((h, i) => (
                        <Typography key={i} variant="caption" sx={{ fontWeight: 900, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</Typography>
                      ))}
                    </Box>
                    {formData.pricingTiers.map((tier, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr auto' },
                          gap: 1.5,
                          mb: { xs: 2.5, sm: 1 },
                          alignItems: 'center',
                          p: { xs: 1.5, sm: 0 },
                          bgcolor: { xs: 'rgba(0,0,0,0.02)', sm: 'transparent' },
                          border: { xs: `1px solid ${COLORS.border}`, sm: 'none' },
                        }}
                      >
                        <TextField
                          label={isMobile ? "Min Weight (kg)" : ""}
                          size="small"
                          type="number"
                          value={tier.minWeight}
                          onChange={(e) => updateTier(idx, 'minWeight', e.target.value)}
                          sx={sxField}
                          inputProps={{ min: 0 }}
                        />
                        <TextField
                          label={isMobile ? "Max Weight (kg) (0 = no limit)" : ""}
                          size="small"
                          type="number"
                          value={tier.maxWeight}
                          onChange={(e) => updateTier(idx, 'maxWeight', e.target.value)}
                          sx={sxField}
                          inputProps={{ min: 0 }}
                          placeholder={isMobile ? "" : "0 = no limit"}
                        />
                        <TextField
                          label={isMobile ? "Price (₱)" : ""}
                          size="small"
                          type="number"
                          value={tier.price}
                          onChange={(e) => updateTier(idx, 'price', e.target.value)}
                          sx={sxField}
                          InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                          inputProps={{ min: 0 }}
                        />
                        <IconButton
                          size="small"
                          onClick={() => removeTier(idx)}
                          disabled={formData.pricingTiers.length <= 1}
                          sx={{
                            color: COLORS.danger,
                            alignSelf: { xs: 'flex-end', sm: 'center' },
                            justifySelf: { xs: 'flex-end', sm: 'auto' }
                          }}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                    <Button size="small" startIcon={<AddIcon />} onClick={addTier} sx={{ mt: 0.5, fontWeight: 'bold', color: COLORS.accent, border: `1px dashed ${COLORS.accent}`, borderRadius: 0, px: 2 }}>
                      Add Tier
                    </Button>
                    <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
                      Set Max (kg) to 0 on the last tier for "unlimited". The Base Price above is used as fallback when pet weight is unavailable.
                    </Typography>
                  </Box>
                )}
              </Grid>

              {/* ── Auto-Deduct Inventory (Multi-Bundle) ── */}
              <Grid size={{ xs: 12 }}>
                <Divider sx={{ my: 1, borderColor: COLORS.borderInput }} />
                <Typography variant="caption" sx={{ fontWeight: 900, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1 }}>
                  Auto-Deduct Inventory Bundle
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, alignItems: { xs: 'stretch', sm: 'center' }, mb: 1 }}>
                  <Autocomplete
                    size="small"
                    sx={{ flexGrow: 1, minWidth: { xs: '100%', sm: 280 } }}
                    options={[...availableToLink].sort((a, b) => (a.category || 'Other').localeCompare(b.category || 'Other') || (a.itemName || '').localeCompare(b.itemName || ''))}
                    getOptionLabel={(option) => option.itemName || ''}
                    groupBy={(option) => (option.category || 'Other').toUpperCase()}
                    value={null}
                    onChange={(_, selected) => {
                      if (selected) addLinkedProduct(selected.id);
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Add Inventory Item"
                        placeholder="Search to add…"
                        sx={sxField}
                      />
                    )}
                    renderGroup={(params) => (
                      <li key={params.key}>
                        <ListSubheader sx={{ bgcolor: COLORS.cream, color: COLORS.accent, fontWeight: 900, fontSize: '0.65rem', letterSpacing: 1, lineHeight: '28px' }}>
                          {params.group}
                        </ListSubheader>
                        <ul style={{ padding: 0 }}>{params.children}</ul>
                      </li>
                    )}
                    isOptionEqualToValue={(option, value) => option.id === value?.id}
                    noOptionsText="All items already bundled"
                    blurOnSelect
                  />
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, minHeight: 32 }}>
                  {formData.linkedProducts.length === 0 && (
                    <Typography variant="caption" color="textSecondary" sx={{ fontStyle: 'italic', lineHeight: '32px' }}>
                      No items bundled — service only.
                    </Typography>
                  )}
                  {formData.linkedProducts.map(productId => {
                    const inv = (inventory || []).find(i => i.id === productId);
                    return (
                      <Chip
                        key={productId}
                        label={inv?.itemName || productId}
                        size="small"
                        onDelete={() => removeLinkedProduct(productId)}
                        sx={{ bgcolor: COLORS.chipBlueBg, color: COLORS.medical, fontWeight: 'bold', borderRadius: 0, border: '1px solid #BBDEFB' }}
                      />
                    );
                  })}
                </Box>
                <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.5 }}>
                  These items auto-inject into the treatment cart when this service is performed.
                </Typography>
              </Grid>

              <Grid size={{ xs: 12 }}>
                <TextField
                  label="SOP / Description / Clinic Instructions"
                  fullWidth multiline rows={3} size="small"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  sx={{ ...sxField, mt: 1 }}
                  InputProps={{ startAdornment: <InputAdornment position="start"><DescriptionIcon fontSize="small" sx={{ color: COLORS.accent, mr: 1, mt: -4 }} /></InputAdornment> }}
                  inputProps={noExtensionProps}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.isScPwdEligible !== false}
                      onChange={(e) => setFormData({ ...formData, isScPwdEligible: e.target.checked })}
                      size="small"
                      sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.accent }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: COLORS.accent } }}
                    />
                  }
                  label={
                    <Typography variant="body2" fontWeight="bold" fontSize="0.8rem">
                      SC/PWD Discount Eligible (RA 9994)
                    </Typography>
                  }
                  sx={{ mt: 1 }}
                />
                <Typography variant="caption" color="textSecondary" sx={{ ml: 4, mt: -0.5, display: 'block' }}>
                  When OFF, this service will NOT receive the 20% Senior Citizen / PWD discount at checkout.
                  Turn off for non-medical services (grooming, boarding).
                </Typography>
              </Grid>
            </Grid>
          </Paper>

          {/*
            T4.160: Section 3 OPERATIONAL RULES hidden until isWalkIn / isInpatient / isEmergency
            are wired into booking validation and queue routing. Fields remain in formData state
            and in the save payload so Firestore values are preserved across edits.

            ── Section 3: Operational Rules ──
            <Typography variant="overline" sx={{ color: COLORS.accent, fontWeight: 900, display: 'block', mb: 1, letterSpacing: 1 }}>
              3. OPERATIONAL RULES
            </Typography>
            <Paper sx={{ p: 2.5, bgcolor: COLORS.cardBg, borderRadius: 0, border: `2px solid ${COLORS.accent}`, boxShadow: 'none' }}>
              <Stack direction="row" justifyContent="space-around" flexWrap="wrap" spacing={2}>
                <FormControlLabel
                  control={<Switch checked={formData.isWalkIn} onChange={(e) => setFormData({ ...formData, isWalkIn: e.target.checked })} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.accent }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: COLORS.accent } }} />}
                  label={<Typography variant="body2" sx={{ fontWeight: 900, color: COLORS.accent }}>ALLOW WALK-IN</Typography>}
                />
                <FormControlLabel
                  control={<Switch checked={formData.isInpatient} onChange={(e) => setFormData({ ...formData, isInpatient: e.target.checked })} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.accent }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: COLORS.accent } }} />}
                  label={<Typography variant="body2" sx={{ fontWeight: 900, color: COLORS.accent }}>REQ. CONFINEMENT</Typography>}
                />
                <FormControlLabel
                  control={<Switch checked={formData.isEmergency} onChange={(e) => setFormData({ ...formData, isEmergency: e.target.checked })} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.danger }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: COLORS.danger } }} />}
                  label={<Typography variant="body2" sx={{ fontWeight: 900, color: COLORS.danger }}>IS EMERGENCY</Typography>}
                />
              </Stack>
            </Paper>
          */}

        </Box>
      </DialogContent>

      <DialogActions sx={{
        p: 2.5,
        bgcolor: COLORS.cream,
        borderTop: `2px solid ${COLORS.accent}`,
        borderRadius: 0,
        flexDirection: { xs: 'column-reverse', sm: 'row' },
        gap: { xs: 1.5, sm: 0 },
        alignItems: 'stretch',
        '& .MuiButton-root': {
          width: { xs: '100%', sm: 'auto' },
          ml: { xs: 0, sm: 2 },
        }
      }}>
        <Button onClick={onClose} sx={{ fontWeight: 900, color: COLORS.accent, px: 3, border: `2px solid ${COLORS.accent}`, borderRadius: 0, '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' } }}>
          CANCEL
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          sx={{ bgcolor: COLORS.success, color: COLORS.cardBg, fontWeight: 900, px: 4, py: 1, borderRadius: 0, border: `2px solid ${COLORS.accent}`, boxShadow: '4px 4px 0px rgba(0,0,0,0.1)', '&:hover': { bgcolor: '#1B5E20', transform: 'translate(-2px, -2px)', boxShadow: '6px 6px 0px rgba(0,0,0,0.1)' } }}
        >
          SAVE CONFIGURATION
        </Button>
      </DialogActions>
    </Dialog>
  );
}
