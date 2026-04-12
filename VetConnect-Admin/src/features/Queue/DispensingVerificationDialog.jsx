import React, { useState, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, Checkbox, FormControlLabel,
  Alert, Chip, Stack, Divider, Paper
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import { Timestamp } from 'firebase/firestore';

export default function DispensingVerificationDialog({ open, onClose, patient, onVerified, staffProfile }) {
  const prescribedItems = patient?.prescribedItems || [];
  const [checklist, setChecklist] = useState({});

  // Reset checklist when dialog opens with new patient
  React.useEffect(() => {
    if (open) setChecklist({});
  }, [open, patient?.id]);

  const toggleItem = (index) => {
    setChecklist(prev => ({ ...prev, [index]: !prev[index] }));
  };

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
            return (
              <Paper key={idx} variant="outlined" sx={{
                p: 2, display: 'flex', alignItems: 'center', gap: 2,
                bgcolor: checklist[idx] ? '#E8F5E9' : 'white',
                borderColor: checklist[idx] ? '#4CAF50' : '#E0E0E0',
                transition: 'all 0.2s',
              }}>
                <Checkbox
                  checked={!!checklist[idx]}
                  onChange={() => toggleItem(idx)}
                  color="success"
                />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography fontWeight="900" fontSize="0.9rem">
                      {item.name}
                    </Typography>
                    {item.isDrug && (
                      <Chip label="Rx" size="small" color="warning"
                        sx={{ height: 18, fontSize: '0.6rem', fontWeight: 1000 }} />
                    )}
                    {item.isBase && (
                      <Chip label="Base Service" size="small"
                        sx={{ height: 18, fontSize: '0.6rem', fontWeight: 1000 }} />
                    )}
                  </Box>
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
      <DialogActions sx={{ p: 2.5, bgcolor: '#EFEBE9', borderTop: '1px solid #D7CCC8' }}>
        <Button onClick={onClose} sx={{ color: '#5D4037', fontWeight: 'bold' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          size="large"
          disabled={!allChecked}
          onClick={handleConfirmDispensing}
          sx={{ fontWeight: '1000', px: 4 }}
        >
          {allChecked ? 'ALL VERIFIED — SEND TO CASHIER' : `VERIFY ALL ${prescribedItems.length} ITEMS`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
