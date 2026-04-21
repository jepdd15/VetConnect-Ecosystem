import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box } from '@mui/material';
import GppBadIcon from '@mui/icons-material/GppBad';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { COLORS, FONT } from '../../../theme/designTokens';

export default function ConfirmRevokeModal({ open, onClose, staffName, onConfirm, loading }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 0,
          border: `2px solid ${COLORS.danger}`,
          boxShadow: '8px 8px 0px rgba(211, 47, 47, 0.1)',
        }
      }}
    >
      <DialogTitle sx={{
        bgcolor: COLORS.dangerSurface,
        color: COLORS.dangerHover, fontWeight: '1000', display: 'flex', alignItems: 'center', gap: 1.5, py: 2,
        borderBottom: `2px solid ${COLORS.danger}`,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontSize: '1rem',
        fontFamily: FONT,
      }}>
        <GppBadIcon /> Revoke System Access
      </DialogTitle>

      <DialogContent sx={{ pt: 3, pb: 2, px: 3 }}>
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <WarningAmberIcon sx={{ fontSize: 56, color: COLORS.danger, mb: 1.5 }} />
          <Typography variant="h6" fontWeight="900" color={COLORS.brand} gutterBottom>
            {staffName || 'this user'}
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ lineHeight: 1.7 }}>
            This will permanently remove their profile from the staff directory.
            They will <strong>no longer appear</strong> in assignment dropdowns,
            scheduling, or workload tracking.
          </Typography>
          <Box sx={{
            mt: 2, p: 1.5, bgcolor: COLORS.warningSurface, borderRadius: 0,
            border: `2px solid ${COLORS.peach}`,
          }}>
            <Typography variant="caption" color={COLORS.warning} fontWeight="bold">
              This will deactivate the staff profile and block dashboard access.
              Login credentials require separate management via Firebase Console.
            </Typography>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2.5, bgcolor: COLORS.dangerSurface, borderTop: `2px solid ${COLORS.danger}`, justifyContent: 'space-between' }}>
        <Button onClick={onClose} sx={{ fontWeight: '1000', color: COLORS.dangerHover, px: 3, fontFamily: FONT }}>
          CANCEL
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={loading}
          sx={{
            bgcolor: COLORS.danger, fontWeight: '1000', px: 4, py: 1.2,
            borderRadius: 0,
            border: `2px solid ${COLORS.dangerHover}`,
            boxShadow: '4px 4px 0px rgba(211,47,47,0.2)',
            '&:hover': { bgcolor: COLORS.dangerHover, boxShadow: '2px 2px 0px rgba(211,47,47,0.2)' },
            fontFamily: FONT
          }}
        >
          {loading ? 'REVOKING...' : 'REVOKE ACCESS'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
