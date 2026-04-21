import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box
} from '@mui/material';
import { FONT } from '../../../theme/designTokens';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';

export default function ConfirmDeleteModal({ open, onClose, onConfirm, item }) {
  if (!item) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 0, border: '2px solid #5D4037', boxShadow: '8px 8px 0px rgba(93,64,55,0.1)' } }}
    >
      <DialogTitle sx={{
        bgcolor: '#FFF8E1', color: '#3E2723', fontWeight: '900',
        display: 'flex', alignItems: 'center', gap: 1,
        fontFamily: FONT, textTransform: 'uppercase', letterSpacing: 1,
        borderBottom: '2px solid #5D4037'
      }}>
        <ArchiveOutlinedIcon /> ARCHIVE PRODUCT
      </DialogTitle>

      <DialogContent sx={{ p: 4, bgcolor: '#FAFAF9' }}>
        <Box sx={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 2.5, textAlign: 'center', pt: 1
        }}>
          {/* Warning icon */}
          <Box sx={{
            width: 60, height: 60, borderRadius: 0,
            bgcolor: '#FFEBEE', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <WarningAmberIcon sx={{ color: '#D32F2F', fontSize: 34 }} />
          </Box>

          {/* Product name display */}
          <Box>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
              You are about to archive:
            </Typography>
            <Typography
              variant="h6"
              fontWeight="900"
              color="#3E2723"
              sx={{
                bgcolor: '#EFEBE9', px: 3, py: 1.5, borderRadius: 0,
                border: '2px solid #5D4037', display: 'inline-block'
              }}
            >
              {item.itemName}
            </Typography>
          </Box>

          {/* T2.161: Impact summary — warns about active reservations and remaining stock */}
          {(item.reserved > 0 || item.stock > 0) && (
            <Box sx={{ bgcolor: '#FFF3E0', border: '1px solid #E65100', p: 1.5, mb: 1, width: '100%' }}>
              {item.reserved > 0 && (
                <Typography variant="body2" fontWeight="bold" color="#E65100" sx={{ fontSize: '0.8rem' }}>
                  {item.reserved} unit(s) are currently reserved by active consults. Reservations will be released.
                </Typography>
              )}
              {item.stock > 0 && (
                <Typography variant="body2" fontWeight="bold" color="#5D4037" sx={{ fontSize: '0.8rem', mt: item.reserved > 0 ? 0.5 : 0 }}>
                  {item.stock} unit(s) still in stock.
                </Typography>
              )}
            </Box>
          )}
          {/* Warning text */}
          <Typography
            variant="body2"
            color="error.main"
            fontWeight="bold"
            sx={{ maxWidth: 280, lineHeight: 1.6 }}
          >
            This product will be hidden from clinical use but retained in the audit trail. You can restore it later from the Archived view.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2.5, bgcolor: '#FFF8E1', borderTop: '2px solid #5D4037', gap: 1 }}>
        <Button
          onClick={onClose}
          variant="outlined"
          sx={{ fontWeight: 1000, borderRadius: 0, flex: 1, border: '2px solid #5D4037', color: '#5D4037', fontFamily: FONT }}
        >
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm(item.id, item.itemName)}
          variant="contained"
          color="error"
          sx={{ fontWeight: 1000, borderRadius: 0, flex: 1, boxShadow: '4px 4px 0px rgba(211,47,47,0.2)', border: '2px solid #B71C1C', fontFamily: FONT }}
        >
          ARCHIVE PRODUCT
        </Button>
      </DialogActions>
    </Dialog>
  );
}
