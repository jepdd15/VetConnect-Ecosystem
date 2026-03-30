import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';

export default function ConfirmDeleteModal({ open, onClose, onConfirm, item }) {
  if (!item) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{
        bgcolor: '#B71C1C', color: 'white', fontWeight: '900',
        display: 'flex', alignItems: 'center', gap: 1
      }}>
        <DeleteForeverIcon /> Confirm Permanent Deletion
      </DialogTitle>

      <DialogContent sx={{ p: 4, bgcolor: '#FAFAF9' }}>
        <Box sx={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 2.5, textAlign: 'center', pt: 1
        }}>
          {/* Warning icon */}
          <Box sx={{
            width: 60, height: 60, borderRadius: '50%',
            bgcolor: '#FFEBEE', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <WarningAmberIcon sx={{ color: '#D32F2F', fontSize: 34 }} />
          </Box>

          {/* Product name display */}
          <Box>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
              You are about to permanently delete:
            </Typography>
            <Typography
              variant="h6"
              fontWeight="900"
              color="#3E2723"
              sx={{
                bgcolor: '#EFEBE9', px: 3, py: 1.5, borderRadius: 2,
                border: '1px solid #D7CCC8', display: 'inline-block'
              }}
            >
              {item.itemName}
            </Typography>
          </Box>

          {/* Warning text */}
          <Typography
            variant="body2"
            color="error.main"
            fontWeight="bold"
            sx={{ maxWidth: 280, lineHeight: 1.6 }}
          >
            ⚠ This action cannot be undone. The product and its entire audit history will be permanently erased from the database.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2.5, bgcolor: '#FFFFFF', gap: 1 }}>
        <Button
          onClick={onClose}
          variant="outlined"
          sx={{ fontWeight: 'bold', borderRadius: 2, flex: 1, borderColor: '#BDBDBD', color: '#424242' }}
        >
          Cancel
        </Button>
        <Button
          onClick={() => { onConfirm(item.id, item.itemName); onClose(); }}
          variant="contained"
          color="error"
          sx={{ fontWeight: '900', borderRadius: 2, flex: 1, boxShadow: '0 4px 14px rgba(211,47,47,0.35)' }}
        >
          Delete Permanently
        </Button>
      </DialogActions>
    </Dialog>
  );
}
