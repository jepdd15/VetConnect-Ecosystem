// The security ledger. Logs every single restock, wastage, or audit adjustment with user timestamps to 
// prevent internal theft.

import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, List, Paper, Typography, Box, Chip, Divider } from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';

export default function AuditHistoryModal({ open, onClose, item, logs }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ bgcolor: '#3E2723', color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
        <HistoryIcon /> Stock Audit Trail: {item?.itemName}
      </DialogTitle>
      
      <DialogContent dividers sx={{ bgcolor: '#FAFAFA', p: 3 }}>
        {logs.length === 0 ? (
          <Typography sx={{ textAlign: 'center', py: 4, color: '#aaa', fontStyle: 'italic' }}>
            No history logs found for this item.
          </Typography>
        ) : (
          <List sx={{ p: 0 }}>
            {logs.map((log, i) => {
              const isPositive = log.quantity > 0;
              let typeColor = '#333';
              if (log.type === 'restock') typeColor = 'green';
              if (log.type === 'sale') typeColor = '#1565C0';
              if (log.type === 'reconcile') typeColor = '#E65100';
              if (log.type === 'internal_use') typeColor = '#9C27B0';
              if (log.type === 'wastage') typeColor = '#D32F2F';

              return (
                <Paper key={i} variant="outlined" sx={{ p: 2.5, mb: 2, bgcolor: 'white', borderLeft: `5px solid ${typeColor}`, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box>
                        <Typography fontWeight="bold" sx={{ color: typeColor, display: 'flex', alignItems: 'center', gap: 1 }}>
                          {log.type?.toUpperCase()} 
                          <Chip label={isPositive ? `+${log.quantity}` : log.quantity} size="small" variant="outlined" color={isPositive ? 'success' : 'error'} sx={{ fontWeight: 'bold' }} />
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5, color: '#333' }}>{log.reason}</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" color="textSecondary" display="block" fontWeight="bold">
                          {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleDateString() : 'Recent'}
                        </Typography>
                        <Typography variant="caption" color="textSecondary" display="block">
                          {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString() : ''}
                        </Typography>
                        <Typography variant="caption" sx={{ mt: 0.5, display: 'block', fontStyle: 'italic' }}>User: {log.user}</Typography>
                    </Box>
                  </Box>
                  
                  <Divider sx={{ my: 1.5, borderStyle: 'dashed' }} />
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" color="textSecondary" fontWeight="bold">Batch Reference: {log.batchInfo || 'N/A'}</Typography>
                    <Typography variant="caption" color="textSecondary">Stock Before: {log.oldStock} ➔ After: {log.newStock}</Typography>
                  </Box>
                </Paper>
              );
            })}
          </List>
        )}
      </DialogContent>
      
      <DialogActions sx={{ bgcolor: '#EFEBE9', p: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 'bold', color: '#3E2723' }}>Close Audit Log</Button>
      </DialogActions>
    </Dialog>
  );
}