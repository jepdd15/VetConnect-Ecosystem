import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';

export default function QuickBookModal({ open, onClose, pet }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ bgcolor: '#2E7D32', color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
            <EventAvailableIcon /> Quick Book: {pet?.name}
        </DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: '#FAFAFA', textAlign: 'center' }}>
            <Typography variant="h6" color="textSecondary" sx={{ mb: 2, mt: 2 }}>
                Internal Scheduling Module Offline
            </Typography>
            <Typography variant="body2" color="textSecondary">
                This feature will allow receptionists to bypass the mobile app and inject appointments directly into the Queue Board. Please use the [ + WALK-IN ] button on the Patient Queue board for immediate triage.
            </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#EFEBE9' }}>
            <Button onClick={onClose} variant="contained" sx={{ bgcolor: '#5D4037', fontWeight: 'bold', px: 3 }}>Close</Button>
        </DialogActions>
    </Dialog>
  );
}