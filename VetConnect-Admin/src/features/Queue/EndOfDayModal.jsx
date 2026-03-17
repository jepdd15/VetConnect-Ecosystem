import React from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, 
  Button, List, ListItem, ListItemIcon, ListItemText, Checkbox, Paper
} from '@mui/material';

export default function EndOfDayModal({ 
  open, 
  onClose, 
  leftoverPatients, 
  carryOverSelection, 
  onToggleCarryOver, 
  onConfirmReset 
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: '#D32F2F', fontWeight: 'bold' }}>
        ⚠️ Unfinished Patients Detected
      </DialogTitle>
      
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Select patients to <b>Carry Over</b>. Unselected will be <b>Cancelled</b>.
        </DialogContentText>
        
        <List>
          {leftoverPatients.map((p) => (
            <ListItem key={p.id} divider>
              <ListItemIcon>
                <Checkbox 
                  edge="start" 
                  checked={carryOverSelection.includes(p.id)} 
                  onChange={() => onToggleCarryOver(p.id)} 
                />
              </ListItemIcon>
              <ListItemText 
                primary={`${p.petName} (${p.serviceType})`} 
                secondary={`Status: ${p.status.toUpperCase()} • Vet: ${p.assignedVet || 'None'}`} 
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      
      <DialogActions sx={{ p: 2, bgcolor: '#FAFAFA' }}>
        <Button onClick={onClose} sx={{ color: '#555', fontWeight: 'bold' }}>Cancel</Button>
        <Button onClick={onConfirmReset} variant="contained" color="error" sx={{ fontWeight: 'bold' }}>
          Process & Reset
        </Button>
      </DialogActions>
    </Dialog>
  );
}