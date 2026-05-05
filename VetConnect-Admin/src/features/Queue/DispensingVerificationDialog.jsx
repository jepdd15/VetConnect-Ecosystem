import React, { useState, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, Checkbox,
  Alert, Chip, Stack, Paper,
  FormControl, InputLabel, Select, MenuItem, TextField,
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import PrintIcon from '@mui/icons-material/Print';
import FlagIcon from '@mui/icons-material/Flag';
import { Timestamp } from 'firebase/firestore';
import { printDispensingLabels } from '../../utils/printDispensingLabels';

/**
 * Returns the subset of allergenTags that match any word in the patient's allergy string.
 * Used by both the item chip and the Print Labels button gating.
 */
function findAllergenMatches(allergenTags = [], patientAllergyStr = '') {
  const lower = patientAllergyStr.toLowerCase().trim();
  if (!lower || lower === 'none') return [];
  return allergenTags.filter(tag => {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(lower);
  });
}

export default function DispensingVerificationDialog({
  open,
  onClose,
  patient,
  onVerified,
  staffProfile,
  clinicSettings,
  inventoryList,
}) {
  const encounterItems = patient?.encounterItems || patient?.prescribedItems || [];
  const [checklist, setChecklist] = useState({});

  // T3.38: batch selection state — keyed by item index, value = batchNumber string
  const [batchSelections, setBatchSelections] = useState({});

  // T3.39 Amendment 1: MUI Dialog for zero-qty confirmation (replaces window.confirm)
  const [confirmZeroOpen, setConfirmZeroOpen] = useState(false);

  // T3.39: dispensed quantity state — keyed by item index, value = number
  const [dispensedQtys, setDispensedQtys] = useState({});

  // Reset all state when the dialog opens for a new patient
  React.useEffect(() => {
    if (open) {
      const initialChecklist = {};
      const initialBatches = {};
      const initialQtys = {};

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      encounterItems.forEach((item, idx) => {
        // Services are auto-checked — they are not physically dispensed
        if (item.type !== 'product') {
          initialChecklist[idx] = true;
        }

        if (item.type === 'product') {
          // T3.39: Default dispensed qty to the prescribed qty (full fill)
          initialQtys[idx] = item.qty;
          // T3.39: Auto-check since default qty > 0
          initialChecklist[idx] = true;

          // T3.38: Auto-select FIFO-first valid batch
          const inv = (inventoryList || []).find(i => i.id === item.id);
          if (inv?.batches?.length > 0) {
            const validBatches = inv.batches
              .filter(b =>
                (b.qty || 0) > 0 &&
                new Date((b.expiryDate || '9999-12-31') + 'T00:00:00') >= today
              )
              .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
            if (validBatches.length > 0) {
              initialBatches[idx] = validBatches[0].batchNumber;
            }
          }
        }
      });

      setChecklist(initialChecklist);
      setBatchSelections(initialBatches);
      setDispensedQtys(initialQtys);
    }
  }, [open, patient?.id, encounterItems, inventoryList]);

  // T3.37: Build O(1) stock lookup map from the live inventory list
  const stockMap = useMemo(() => {
    const map = new Map();
    (inventoryList || []).forEach(inv => {
      map.set(inv.id, {
        stock: inv.stock || 0,
        reserved: inv.reserved || 0,
        available: Math.max(0, (inv.stock || 0) - (inv.reserved || 0)),
        batches: inv.batches || [],
        isArchived: !!inv.isArchived,
      });
    });
    return map;
  }, [inventoryList]);

  // T3.37: Count how many products have insufficient stock for the summary alert
  const stockIssueCount = useMemo(() => {
    return encounterItems.filter(item => {
      if (item.type !== 'product') return false;
      const inv = stockMap.get(item.id);
      if (!inv) return false;
      return inv.available < item.qty;
    }).length;
  }, [encounterItems, stockMap]);

  const productCount = useMemo(() =>
    encounterItems.filter(i => i.type === 'product').length,
    [encounterItems],
  );

  // T3.39: allChecked = every index is marked in the checklist (products auto-set via qty input)
  const allChecked = useMemo(() => {
    if (encounterItems.length === 0) return true;
    return encounterItems.every((_, idx) => checklist[idx]);
  }, [checklist, encounterItems]);

  // T3.39: Whether any product is dispensed at a partial quantity
  const hasPartialItems = useMemo(() =>
    encounterItems.some((item, idx) =>
      item.type === 'product' && (dispensedQtys[idx] ?? item.qty) < item.qty
    ),
    [encounterItems, dispensedQtys]
  );

  // T3.39: Whether any product is set to qty = 0 (not dispensed)
  const hasZeroItems = useMemo(() =>
    encounterItems.some((item, idx) =>
      item.type === 'product' && (dispensedQtys[idx] ?? item.qty) === 0
    ),
    [encounterItems, dispensedQtys]
  );

  const petAllergies = patient?.petAllergies || patient?.allergies || '';
  const hasAllergies = petAllergies.trim().length > 0
      && petAllergies.toUpperCase() !== 'NONE';

  // T3.36: Check if this appointment is on hold for vet review
  const isHeld = !!patient?.dispensingHold;

  const buildAndSubmitDispensing = () => {
    const checkedItems = encounterItems.map((item, idx) => {
      const isProduct = item.type === 'product';
      const dispensedQty = isProduct ? (dispensedQtys[idx] ?? item.qty) : item.qty;
      return {
        id: item.id,
        name: item.name,
        qty: dispensedQty,
        prescribedQty: item.qty,
        verified: !!checklist[idx],
        isPartial: isProduct && dispensedQty < item.qty,
        backorderQty: isProduct ? Math.max(0, item.qty - dispensedQty) : 0,
        ...(batchSelections[idx] ? { selectedBatch: batchSelections[idx] } : {}),
      };
    });

    const hasPartial = checkedItems.some(i => i.isPartial);

    // T3.38: Build a top-level batchSelections map keyed by inventory item ID for audit
    const batchSelectionsMap = Object.entries(batchSelections).reduce((acc, [idx, batch]) => {
      const item = encounterItems[parseInt(idx, 10)];
      if (item && item.type === 'product' && batch) {
        acc[item.id] = batch;
      }
      return acc;
    }, {});

    const dispensingData = {
      dispensedBy: staffProfile?.id || 'system',
      dispensedByName: staffProfile?.fullName || 'System',
      dispensedAt: Timestamp.now(),
      dispensingChecklist: checkedItems,
      hasPartialDispensing: hasPartial,
      batchSelections: batchSelectionsMap,
    };

    onVerified(dispensingData);
  };

  const handleConfirmDispensing = () => {
    if (hasZeroItems) {
      setConfirmZeroOpen(true);
      return;
    }
    buildAndSubmitDispensing();
  };

  const zeroItemNames = useMemo(() =>
    encounterItems
      .filter((item, idx) => item.type === 'product' && (dispensedQtys[idx] ?? item.qty) === 0)
      .map(item => item.name),
  [encounterItems, dispensedQtys]);

  return (
    <>
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{
        bgcolor: '#C62828', color: 'white', fontWeight: '1000',
        display: 'flex', alignItems: 'center', gap: 1, py: 2,
      }}>
        <LocalPharmacyIcon /> Dispensing Verification: {patient?.petName}
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: '#FAFAFA', p: 3 }}>

        {/* T3.36: Dispensing hold banner — disables verification until vet resolves */}
        {isHeld && (
          <Alert
            severity="warning"
            icon={<FlagIcon />}
            sx={{ mb: 2, fontWeight: 900, border: '2px solid #E65100', borderRadius: 0 }}
          >
            <Typography fontWeight="900" fontSize="0.9rem">
              ON HOLD — Flagged for vet review by {patient.dispensingHold.flaggedByName || 'staff'}.
              {patient.dispensingHold.reason && ` Reason: "${patient.dispensingHold.reason}"`}
            </Typography>
            <Typography variant="caption" fontWeight="700">
              Verification is disabled until the hold is resolved by a veterinarian.
            </Typography>
          </Alert>
        )}

        {/* Patient Allergy Alert */}
        {hasAllergies && (
          <Alert severity="error" icon={<WarningIcon />}
            sx={{ mb: 3, fontWeight: '900', '& .MuiAlert-message': { fontWeight: 900 } }}
          >
            ALLERGY ALERT: {petAllergies.toUpperCase()}
            — Verify all items against known patient allergies before dispensing.
          </Alert>
        )}

        {!hasAllergies && (
          <Alert severity="info" icon={false} sx={{ mb: 3, py: 0.5 }}>
            <Typography variant="body2" fontWeight="bold">
              No known allergies on file (NKA).
            </Typography>
          </Alert>
        )}

        {/* T3.37: Summary alert when any products have insufficient stock */}
        {stockIssueCount > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight="900">
              {stockIssueCount} product{stockIssueCount !== 1 ? 's' : ''} may have insufficient
              stock. POSModal checkout will enforce final stock validation.
            </Typography>
          </Alert>
        )}

        {/* Prescribed Items Checklist */}
        <Typography variant="subtitle2" fontWeight="1000" color="textSecondary"
          sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: 1 }}
        >
          Prescribed Items ({encounterItems.length})
        </Typography>

        <Stack spacing={1.5}>
          {encounterItems.map((item, idx) => {
            const isProduct = item.type === 'product';

            // T2.175: Check allergen tags against patient's known allergies
            const allergenMatches = findAllergenMatches(item.allergenTags || [], petAllergies);
            const hasAllergenMatch = allergenMatches.length > 0;

            // T3.37: Look up current stock for this product
            const invData = isProduct ? stockMap.get(item.id) : null;
            const stockWarning = (() => {
              if (!invData || !isProduct) return null;
              if (invData.available === 0) return 'out-of-stock';
              if (invData.available < item.qty) return 'insufficient';
              if (invData.available <= 5) return 'low-stock';
              return null;
            })();

            // T3.39: Current dispensed quantity for this item
            const currentDispensedQty = isProduct ? (dispensedQtys[idx] ?? item.qty) : item.qty;
            const isPartial = isProduct && currentDispensedQty > 0 && currentDispensedQty < item.qty;
            const isNotDispensed = isProduct && currentDispensedQty === 0;

            // T3.38: Valid batches for this product sorted FIFO (earliest expiry first)
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const validBatches = isProduct && invData?.batches?.length > 0
              ? invData.batches
                  .filter(b =>
                    (b.qty || 0) > 0 &&
                    new Date((b.expiryDate || '9999-12-31') + 'T00:00:00') >= today
                  )
                  .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))
              : [];

            return (
              <Paper key={idx} variant="outlined" sx={{
                p: 2,
                bgcolor: hasAllergenMatch
                  ? '#FFF3E0'
                  : (isNotDispensed ? '#FEF2F2' : (checklist[idx] ? '#E8F5E9' : 'white')),
                borderColor: hasAllergenMatch
                  ? '#E65100'
                  : (isNotDispensed ? '#D32F2F' : (checklist[idx] ? '#4CAF50' : '#E0E0E0')),
                opacity: item.type !== 'product' ? 0.7 : 1,
                transition: 'all 0.2s',
                borderRadius: 0,
              }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>

                  {/* T3.39: Products get a qty input; services keep the auto-checked checkbox */}
                  <Box sx={{ pt: 0.5, flexShrink: 0 }}>
                    {isProduct ? (
                      <TextField
                        type="number"
                        size="small"
                        value={currentDispensedQty}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(item.qty, parseInt(e.target.value) || 0));
                          setDispensedQtys(prev => ({ ...prev, [idx]: val }));
                          // Auto-check if qty > 0; uncheck if 0
                          setChecklist(prev => ({ ...prev, [idx]: val > 0 }));
                        }}
                        inputProps={{
                          min: 0,
                          max: item.qty,
                          style: { textAlign: 'center', fontWeight: 900, width: 40 },
                        }}
                        sx={{ width: 64, '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                      />
                    ) : (
                      <Checkbox
                        checked={!!checklist[idx]}
                        disabled
                        color="success"
                      />
                    )}
                  </Box>

                  {/* Item details */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography
                        fontWeight="900"
                        fontSize="0.9rem"
                        sx={item.type !== 'product' ? { color: 'text.secondary', fontStyle: 'italic' } : {}}
                      >
                        {item.name}
                      </Typography>
                      {(item.productClass || (item.isDrug ? 'medicine' : 'retail')) === 'medicine' && (
                        <Chip label="Rx" size="small" color="warning"
                          sx={{ height: 18, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0 }} />
                      )}
                      {item.type !== 'product' && (
                        <Chip label="SERVICE" size="small"
                          sx={{ height: 18, fontSize: '0.6rem', fontWeight: 1000, bgcolor: '#E3F2FD', color: '#1565C0', borderRadius: 0 }} />
                      )}
                      {item.isBase && (
                        <Chip label="Base Service" size="small"
                          sx={{ height: 18, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0 }} />
                      )}
                      {/* T2.175: Allergen match warning chip */}
                      {hasAllergenMatch && (
                        <Chip
                          icon={<WarningIcon sx={{ fontSize: '14px !important', color: 'white !important' }} />}
                          label={`ALLERGEN MATCH: ${allergenMatches.join(', ')}`}
                          size="small"
                          sx={{
                            bgcolor: '#D32F2F', color: 'white',
                            fontWeight: 900, fontSize: '0.62rem', height: 20,
                            borderRadius: 0,
                            '& .MuiChip-icon': { color: 'white' },
                          }}
                        />
                      )}
                      {/* T3.37: Stock warning chips */}
                      {stockWarning === 'out-of-stock' && (
                        <Chip
                          icon={<WarningIcon />}
                          label="OUT OF STOCK"
                          size="small"
                          sx={{ bgcolor: '#D32F2F', color: 'white', fontWeight: 900, fontSize: '0.62rem', height: 20, borderRadius: 0 }}
                        />
                      )}
                      {stockWarning === 'insufficient' && (
                        <Chip
                          icon={<WarningIcon />}
                          label={`ONLY ${invData.available} AVAILABLE`}
                          size="small"
                          sx={{ bgcolor: '#E65100', color: 'white', fontWeight: 900, fontSize: '0.62rem', height: 20, borderRadius: 0 }}
                        />
                      )}
                      {stockWarning === 'low-stock' && (
                        <Chip
                          label={`LOW STOCK: ${invData.available}`}
                          size="small"
                          sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 800, fontSize: '0.62rem', height: 20, borderRadius: 0, border: '1px solid #E65100' }}
                        />
                      )}
                    </Box>

                    {item.dosage && (
                      <Typography variant="caption" color="textSecondary"
                        fontWeight="800" display="block" sx={{ mt: 0.25 }}
                      >
                        {item.dosage}{item.concentration ? ` / ${item.concentration}` : ''}
                      </Typography>
                    )}
                    {item.instructions && (
                      <Typography variant="caption" color="textSecondary"
                        fontWeight="700" display="block" sx={{ mt: 0.5 }}
                      >
                        Sig: {item.instructions}
                      </Typography>
                    )}

                    {/* T3.38: Batch picker dropdown — products with valid batches only */}
                    {isProduct && validBatches.length > 0 && (
                      <FormControl size="small" sx={{ mt: 1, minWidth: 220 }}>
                        <InputLabel sx={{ fontSize: '0.75rem' }}>Batch / Lot</InputLabel>
                        <Select
                          value={batchSelections[idx] || ''}
                          onChange={(e) => setBatchSelections(prev => ({ ...prev, [idx]: e.target.value }))}
                          label="Batch / Lot"
                          sx={{
                            fontSize: '0.75rem',
                            height: 34,
                            '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 },
                          }}
                        >
                          {validBatches.map(b => (
                            <MenuItem key={b.batchNumber} value={b.batchNumber} sx={{ fontSize: '0.75rem' }}>
                              {b.batchNumber} — Exp: {b.expiryDate} — Qty: {b.qty}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}

                    {/* T3.39: Partial / not-dispensed status chips */}
                    {isPartial && (
                      <Chip
                        label={`PARTIAL: ${item.qty - currentDispensedQty} on backorder`}
                        size="small"
                        sx={{
                          bgcolor: '#FFF3E0', color: '#E65100',
                          fontWeight: 800, fontSize: '0.6rem', height: 18,
                          mt: 0.5, borderRadius: 0,
                          display: 'block', width: 'fit-content',
                        }}
                      />
                    )}
                    {isNotDispensed && (
                      <Chip
                        label="NOT DISPENSED"
                        size="small"
                        sx={{
                          bgcolor: '#FEF2F2', color: '#D32F2F',
                          fontWeight: 800, fontSize: '0.6rem', height: 18,
                          mt: 0.5, borderRadius: 0,
                          display: 'block', width: 'fit-content',
                        }}
                      />
                    )}
                  </Box>

                  {/* Quantity + stock availability column */}
                  <Box sx={{ textAlign: 'right', minWidth: 80, flexShrink: 0 }}>
                    <Typography fontWeight="1000" fontSize="1rem">
                      x{item.qty}
                    </Typography>
                    {isProduct && (() => {
                      const pc = item.productClass || (item.isDrug ? 'medicine' : 'retail');
                      const label = pc === 'medicine' ? 'MEDICINE' : pc === 'medical_supply' ? 'SUPPLY' : 'RETAIL';
                      const color = pc === 'medicine' ? '#C62828' : pc === 'medical_supply' ? '#757575' : '#9E9E9E';
                      return (
                        <Chip
                          label={label}
                          size="small"
                          sx={{ height: 18, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: `${color}1A`, color, border: `1px solid ${color}33` }}
                        />
                      );
                    })()}
                    {/* T3.37: Available stock annotation */}
                    {isProduct && invData && (
                      <Typography
                        variant="caption"
                        color={stockWarning ? 'error' : 'textSecondary'}
                        fontWeight="700"
                        display="block"
                      >
                        {invData.available} avail
                      </Typography>
                    )}
                  </Box>

                  {checklist[idx] && !isNotDispensed && (
                    <CheckCircleIcon sx={{ color: '#4CAF50', fontSize: 24, flexShrink: 0 }} />
                  )}
                </Box>
              </Paper>
            );
          })}
        </Stack>

        {encounterItems.length === 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            No prescribed items found on this appointment. The patient may have
            been fast-tracked. Verify with the attending veterinarian.
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2.5, bgcolor: '#EFEBE9', borderTop: '1px solid #D7CCC8', display: 'flex', justifyContent: 'space-between' }}>
        <Button onClick={onClose} sx={{ color: '#5D4037', fontWeight: 'bold', borderRadius: 0 }}>
          Cancel
        </Button>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {/* T2.176: Print Labels button — only visible after all items are verified */}
          {allChecked && !isHeld && (
            <Button
              variant="outlined"
              startIcon={<PrintIcon />}
              onClick={() => printDispensingLabels(encounterItems, patient, clinicSettings)}
              sx={{
                fontWeight: '1000',
                color: '#5D4037',
                borderColor: '#8D6E63',
                borderRadius: 0,
                '&:hover': { borderColor: '#5D4037', bgcolor: '#F5F0EB' },
              }}
            >
              Print Labels
            </Button>
          )}
          {/* T3.36: Confirm button disabled when appointment is on hold */}
          {/* T3.39: Button label changes when partial dispensing is in play */}
          <Button
            variant="contained"
            color="success"
            size="large"
            disabled={!allChecked || isHeld}
            onClick={handleConfirmDispensing}
            sx={{ fontWeight: '1000', px: 4, borderRadius: 0 }}
          >
            {allChecked
              ? (hasPartialItems
                  ? 'VERIFIED (PARTIAL) — SEND TO CASHIER'
                  : 'ALL VERIFIED — SEND TO CASHIER')
              : `VERIFY ALL ${productCount} PRODUCT${productCount !== 1 ? 'S' : ''}`
            }
          </Button>
        </Box>
      </DialogActions>
    </Dialog>

    {/* T3.39 Amendment 1: Zero-qty confirmation dialog (replaces window.confirm) */}
    <Dialog open={confirmZeroOpen} onClose={() => setConfirmZeroOpen(false)}
      PaperProps={{ sx: { borderRadius: 0, border: '2px solid #5D4037' } }}>
      <DialogTitle sx={{ fontWeight: 900, bgcolor: '#FFF3E0', color: '#E65100', borderBottom: '2px solid #5D4037' }}>
        ITEMS NOT DISPENSED
      </DialogTitle>
      <DialogContent sx={{ pt: 2, bgcolor: '#FFF8E1' }}>
        <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>
          The following items will NOT be dispensed:
        </Typography>
        {zeroItemNames.map((name, i) => (
          <Chip key={i} label={name} size="small" sx={{ mr: 0.5, mb: 0.5, bgcolor: '#FFEBEE', color: '#D32F2F', fontWeight: 900, borderRadius: 0 }} />
        ))}
        <Typography variant="body2" sx={{ mt: 1.5, color: '#795548' }}>
          These items will be excluded from the billing cart. Proceed?
        </Typography>
      </DialogContent>
      <DialogActions sx={{ bgcolor: '#FFF8E1', borderTop: '2px solid #5D4037', p: 2 }}>
        <Button onClick={() => setConfirmZeroOpen(false)} sx={{ fontWeight: 900, borderRadius: 0 }}>CANCEL</Button>
        <Button variant="contained" sx={{ fontWeight: 900, borderRadius: 0, bgcolor: '#E65100' }}
          onClick={() => { setConfirmZeroOpen(false); buildAndSubmitDispensing(); }}>
          PROCEED
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
}
