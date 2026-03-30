import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box } from '@mui/material';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNavigate } from 'react-router-dom';
import { FONT, COLORS } from '../../../theme/designTokens';

export default function QuickBookModal({ open, onClose, pet }) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ bgcolor: '#2E7D32', color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
            <EventAvailableIcon /> Quick Book: {pet?.name}
        </DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: COLORS.surface, textAlign: 'center' }}>
            <Box sx={{ mb: 3, mt: 1 }}>
              <Typography sx={{ fontFamily: FONT, fontWeight: 800, color: COLORS.danger, fontSize: '1.1rem', mb: 1 }}>
                  Internal Scheduling Offline
              </Typography>
              <Typography sx={{ fontFamily: FONT, color: COLORS.textSecondary, fontSize: '0.9rem' }}>
                  Please bypass the scheduling module and inject {pet?.name} directly into the Patient Queue board for immediate triage using the Walk-In feature.
              </Typography>
            </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: COLORS.surfaceAlt, gap: 1, justifyContent: 'center' }}>
            <Button onClick={onClose} sx={{ fontFamily: FONT, color: COLORS.textMuted }}>Cancel</Button>
            <Button onClick={() => { onClose(); navigate('/queue'); }} variant="contained" endIcon={<ArrowForwardIcon />} sx={{ bgcolor: COLORS.cta, fontFamily: FONT, fontWeight: 'bold', px: 3, '&:hover': { bgcolor: COLORS.ctaHover } }}>Go to Patient Queue</Button>
        </DialogActions>
    </Dialog>
  );
}