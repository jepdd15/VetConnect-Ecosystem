import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, CircularProgress, Chip, Divider } from '@mui/material';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

import HistoryIcon from '@mui/icons-material/History';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

export default function InventoryLogModal({ open, onClose, item }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!item?.id) return;
    
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "inventory_logs"),
          where("itemId", "==", item.id),
          orderBy("timestamp", "desc")
        );
        const querySnapshot = await getDocs(q);
        const fetchedLogs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setLogs(fetchedLogs);
      } catch (err) {
        console.error("Failed to fetch logs:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [item?.id]);

  const getActivityColor = (action, amount) => {
     if (action === "CREATED") return '#1565C0'; // Blue
     if (action === "DELETED") return '#C62828'; // Red
     if (amount > 0) return '#2E7D32'; // Green
     if (amount < 0) return '#E65100'; // Orange
     return '#757575'; // Grey for updates
  };

  const getActivityIcon = (amount) => {
     if (amount > 0) return <ArrowUpwardIcon fontSize="small" sx={{ color: '#2E7D32' }} />;
     if (amount < 0) return <ArrowDownwardIcon fontSize="small" sx={{ color: '#E65100' }} />;
     return <HistoryIcon fontSize="small" sx={{ color: '#757575' }} />;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ bgcolor: '#3E2723', color: 'white', fontWeight: '900', display: 'flex', alignItems: 'center', gap: 1 }}>
        <HistoryIcon /> Audit Trail: {item?.itemName}
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 0, bgcolor: '#FAFAF9', minHeight: 300 }}>
         {loading ? (
             <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                <CircularProgress color="inherit" />
             </Box>
         ) : logs.length === 0 ? (
             <Box sx={{ textAlign: 'center', py: 5, color: '#9E9E9E' }}>
                <Typography variant="body1" fontWeight="bold">No history recorded.</Typography>
                <Typography variant="caption">Events before this update were not logged.</Typography>
             </Box>
         ) : (
             <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {logs.map((log, index) => (
                    <Box key={log.id}>
                        <Box sx={{ display: 'flex', p: 2, alignItems: 'flex-start', gap: 2, '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' } }}>
                            <Box sx={{ mt: 0.5 }}>{getActivityIcon(log.amountChange)}</Box>
                            
                            <Box sx={{ flexGrow: 1 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                   <Typography variant="body2" fontWeight="900" sx={{ color: getActivityColor(log.action, log.amountChange) }}>
                                      {log.action} {log.amountChange !== 0 && `(${log.amountChange > 0 ? '+' : ''}${log.amountChange})`}
                                   </Typography>
                                   <Typography variant="caption" color="textSecondary" fontWeight="bold">
                                      {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Just now'}
                                   </Typography>
                                </Box>
                                
                                <Typography variant="body2" color="textPrimary" sx={{ mb: 0.5 }}>
                                  {log.reason}
                                </Typography>
                                
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                   <Chip label={`By: ${log.userName || 'System'}`} size="small" sx={{ fontSize: '0.65rem', height: 20, bgcolor: '#EEEEEE', fontWeight: 'bold' }} />
                                </Box>
                            </Box>
                        </Box>
                        {index < logs.length - 1 && <Divider />}
                    </Box>
                ))}
             </Box>
         )}
      </DialogContent>
      
      <DialogActions sx={{ p: 2, bgcolor: '#FFFFFF' }}>
        <Button onClick={onClose} variant="contained" sx={{ bgcolor: '#5D4037', fontWeight: 'bold', '&:hover': { bgcolor: '#3E2723' } }}>
          Close Ledger
        </Button>
      </DialogActions>
    </Dialog>
  );
}
