import React, { useState, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, Checkbox, FormControlLabel,
  Alert, Chip, Stack, Divider, Paper
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import PrintIcon from '@mui/icons-material/Print';
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

export default function DispensingVerificationDialog({ open, onClose, patient, onVerified, staffProfile, clinicSettings }) {
  const prescribedItems = patient?.prescribedItems || [];
  const [checklist, setChecklist] = useState({});

  // Reset checklist when dialog opens — auto-check services (context-only, not verifiable)
  React.useEffect(() => {
    if (open) {
      const initial = {};
      prescribedItems.forEach((item, idx) => {
        if (item.type !== 'product') initial[idx] = true;
      });
      setChecklist(initial);
    }
  }, [open, patient?.id, prescribedItems]);

  const toggleItem = (index) => {
    setChecklist(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const productCount = useMemo(() =>
    prescribedItems.filter(i => i.type === 'product').length,
    [prescribedItems],
  );

  const allChecked = useMemo(() => {
    if (prescribedItems.length === 0) return false;
    return prescribedItems.every((_, idx) => checklist[idx]);
  }, [checklist, prescribedItems]);

  const petAllergies = patient?.petAllergies || '';
  const hasAllergies = petAllergies.trim().length > 0
      && petAllergies.toUpperCase() !== 'NONE';

  const handleConfirmDispensing = () => {
    const dispensingData = {
      dispensedBy: staffProfile?.id || 'system',
      dispensedByName: staffProfile?.fullName || 'System',
      dispensedAt: Timestamp.now(),
      dispensingChecklist: prescribedItems.map((item, idx) => ({
        name: item.name,
        qty: item.qty,
        verified: !!checklist[idx],
      })),
    };
    onVerified(dispensingData);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{
        bgcolor: '#C62828', color: 'white', fontWeight: '1000',
        display: 'flex', alignItems: 'center', gap: 1, py: 2
      }}>
        <LocalPharmacyIcon /> Dispensing Verification: {patient?.petName}
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: '#FAFAFA', p: 3 }}>
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

        {/* Prescribed Items Checklist */}
        <Typography variant="subtitle2" fontWeight="1000" color="textSecondary"
          sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: 1 }}
        >
          Prescribed Items ({prescribedItems.length})
        </Typography>

        <Stack spacing={1.5}>
          {prescribedItems.map((item, idx) => {
            const isProduct = item.type === 'product';
            const isService = !isProduct;

            // T2.175: Check if this item's allergenTags match the patient's known allergies.
            const allergenMatches = findAllergenMatches(item.allergenTags || [], petAllergies);
            const hasAllergenMatch = allergenMatches.length > 0;

            return (
              <Paper key={idx} variant="outlined" sx={{
                p: 2, display: 'flex', alignItems: 'center', gap: 2,
                bgcolor: hasAllergenMatch ? '#FFF3E0' : (checklist[idx] ? '#E8F5E9' : 'white'),
                borderColor: hasAllergenMatch ? '#E65100' : (checklist[idx] ? '#4CAF50' : '#E0E0E0'),
                opacity: isService ? 0.7 : 1,
                transition: 'all 0.2s',
              }}>
                <Checkbox
                  checked={!!checklist[idx]}
                  onChange={() => isProduct && toggleItem(idx)}
                  disabled={isService}
                  color="success"
                />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography fontWeight="900" fontSize="0.9rem"
                      sx={isService ? { color: 'text.secondary', fontStyle: 'italic' } : {}}
                    >
                      {item.name}
                    </Typography>
                    {item.isDrug && (
                      <Chip label="Rx" size="small" color="warning"
                        sx={{ height: 18, fontSize: '0.6rem', fontWeight: 1000 }} />
                    )}
                    {isService && (
                      <Chip label="SERVICE" size="small"
                        sx={{ height: 18, fontSize: '0.6rem', fontWeight: 1000, bgcolor: '#E3F2FD', color: '#1565C0' }} />
                    )}
                    {item.isBase && (
                      <Chip label="Base Service" size="small"
                        sx={{ height: 18, fontSize: '0.6rem', fontWeight: 1000 }} />
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
                          borderRadius: '4px',
                          '& .MuiChip-icon': { color: 'white' },
                        }}
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
                </Box>
                <Box sx={{ textAlign: 'right', minWidth: 80 }}>
                  <Typography fontWeight="1000" fontSize="1rem">
                    x{item.qty}
                  </Typography>
                  {isProduct && (
                    <Typography variant="caption" color="textSecondary" fontWeight="700">
                      {item.isDrug ? 'DRUG' : 'PRODUCT'}
                    </Typography>
                  )}
                </Box>
                {checklist[idx] && (
                  <CheckCircleIcon sx={{ color: '#4CAF50', fontSize: 24 }} />
                )}
              </Paper>
            );
          })}
        </Stack>

        {prescribedItems.length === 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            No prescribed items found on this appointment. The patient may have
            been fast-tracked. Verify with the attending veterinarian.
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2.5, bgcolor: '#EFEBE9', borderTop: '1px solid #D7CCC8', display: 'flex', justifyContent: 'space-between' }}>
        <Button onClick={onClose} sx={{ color: '#5D4037', fontWeight: 'bold' }}>
          Cancel
        </Button>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {/* T2.176: Print Labels button — only visible after all items are verified */}
          {allChecked && (
            <Button
              variant="outlined"
              startIcon={<PrintIcon />}
              onClick={() => printDispensingLabels(prescribedItems, patient, clinicSettings)}
              sx={{
                fontWeight: '1000',
                color: '#5D4037',
                borderColor: '#8D6E63',
                '&:hover': { borderColor: '#5D4037', bgcolor: '#F5F0EB' },
              }}
            >
              Print Labels
            </Button>
          )}
          <Button
            variant="contained"
            color="success"
            size="large"
            disabled={!allChecked}
            onClick={handleConfirmDispensing}
            sx={{ fontWeight: '1000', px: 4 }}
          >
            {allChecked ? 'ALL VERIFIED — SEND TO CASHIER' : `VERIFY ALL ${productCount} PRODUCT${productCount !== 1 ? 'S' : ''}`}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
