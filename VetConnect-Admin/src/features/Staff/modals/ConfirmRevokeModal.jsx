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
          borderRadius: 0,
          border: '2px solid #D32F2F',
          boxShadow: '8px 8px 0px rgba(211, 47, 47, 0.1)',
        }
      }}
    >
      <DialogTitle sx={{
        bgcolor: '#FFEBEE',
        color: '#B71C1C', fontWeight: '1000', display: 'flex', alignItems: 'center', gap: 1.5, py: 2,
        borderBottom: '2px solid #D32F2F',
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontSize: '1rem'
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

      <DialogActions sx={{ p: 2.5, bgcolor: '#FFEBEE', borderTop: '2px solid #D32F2F', justifyContent: 'space-between' }}>
        <Button onClick={onClose} sx={{ fontWeight: '1000', color: '#B71C1C', px: 3, fontFamily: 'Inter, sans-serif' }}>
          CANCEL
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          sx={{
            bgcolor: '#D32F2F', fontWeight: '1000', px: 4, py: 1.2,
            borderRadius: 0, 
            border: '2px solid #B71C1C',
            boxShadow: '4px 4px 0px rgba(211,47,47,0.2)',
            '&:hover': { bgcolor: '#B71C1C', boxShadow: '2px 2px 0px rgba(211,47,47,0.2)' },
            fontFamily: 'Inter, sans-serif'
          }}
        >
          REVOKE ACCESS
        </Button>
      </DialogActions>
    </Dialog>
  );
}
