import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box } from '@mui/material';
import GppBadIcon from '@mui/icons-material/GppBad';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

export default function ConfirmRevokeModal({ open, onClose, staffName, onConfirm }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          border: '2px solid #D32F2F',
          boxShadow: '0 12px 40px rgba(211, 47, 47, 0.25)',
        }
      }}
    >
      <DialogTitle sx={{
        background: 'linear-gradient(135deg, #B71C1C 0%, #D32F2F 100%)',
        color: 'white', fontWeight: '900', display: 'flex', alignItems: 'center', gap: 1.5, py: 2,
      }}>
        <GppBadIcon /> Revoke System Access
      </DialogTitle>

      <DialogContent sx={{ pt: 3, pb: 2, px: 3 }}>
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <WarningAmberIcon sx={{ fontSize: 56, color: '#D32F2F', mb: 1.5 }} />
          <Typography variant="h6" fontWeight="900" color="#3E2723" gutterBottom>
            {staffName || 'this user'}
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ lineHeight: 1.7 }}>
            This will permanently remove their profile from the staff directory.
            They will <strong>no longer appear</strong> in assignment dropdowns,
            scheduling, or workload tracking.
          </Typography>
          <Box sx={{
            mt: 2, p: 1.5, bgcolor: '#FFF3E0', borderRadius: 2,
            border: '1px solid #FFE0B2',
          }}>
            <Typography variant="caption" color="#E65100" fontWeight="bold">
              ⚠ Note: Their Firebase Auth account will be disabled, not deleted.
              A system administrator can re-enable it if needed.
            </Typography>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2.5, borderTop: '1px solid #E0E0E0', justifyContent: 'space-between' }}>
        <Button onClick={onClose} sx={{ fontWeight: 'bold', color: '#5D4037', px: 3 }}>
          CANCEL
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          sx={{
            bgcolor: '#D32F2F', fontWeight: '900', px: 4, py: 1.2,
            borderRadius: 2, boxShadow: '0 4px 15px rgba(211,47,47,0.4)',
            '&:hover': { bgcolor: '#B71C1C' },
          }}
        >
          REVOKE ACCESS
        </Button>
      </DialogActions>
    </Dialog>
  );
}
