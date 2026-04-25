import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, CircularProgress, Chip, Divider } from '@mui/material';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { FONT, COLORS } from '../../../theme/designTokens';

import HistoryIcon from '@mui/icons-material/History';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

import { normalizeInventoryLog } from '../../../utils/normalizeInventoryLog';

export default function InventoryLogModal({ open, onClose, item }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // T2.163: Re-fetch when the modal opens (not just when item changes) + cap at 500 entries
  useEffect(() => {
    if (!item?.id || !open) return;

    const fetchLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const q = query(
          collection(db, "inventory_logs"),
          where("itemId", "==", item.id),
          orderBy("timestamp", "desc"),
          limit(500)
        );
        const querySnapshot = await getDocs(q);
        const fetchedLogs = querySnapshot.docs.map(doc => normalizeInventoryLog({ id: doc.id, ...doc.data() }));
        setLogs(fetchedLogs);
      } catch (err) {
        console.error("Failed to fetch logs:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [item?.id, open]);

  const getActivityColor = (action, amount) => {
     if (action === "CREATED") return COLORS.medical;
     if (action === "DELETED") return COLORS.surgery;
     if (amount > 0) return COLORS.success;
     if (amount < 0) return COLORS.warning;
     return '#757575';
  };

  const getActivityIcon = (amount) => {
     if (amount > 0) return <ArrowUpwardIcon fontSize="small" sx={{ color: COLORS.success }} />;
     if (amount < 0) return <ArrowDownwardIcon fontSize="small" sx={{ color: COLORS.warning }} />;
     return <HistoryIcon fontSize="small" sx={{ color: '#757575' }} />;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.accent}`, boxShadow: '8px 8px 0px rgba(93,64,55,0.1)' } }}>
      <DialogTitle sx={{ bgcolor: COLORS.cream, color: COLORS.brand, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, fontFamily: FONT, textTransform: 'uppercase', letterSpacing: 1, borderBottom: `2px solid ${COLORS.accent}` }}>
        <HistoryIcon /> Audit Trail: {item?.itemName}
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, bgcolor: COLORS.formBg, minHeight: 300 }}>
         {loading ? (
             <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                <CircularProgress color="inherit" />
             </Box>
         ) : error ? (
             <Box sx={{ textAlign: 'center', py: 5, color: COLORS.surgery }}>
                <Typography variant="body1" fontWeight="bold">Failed to load audit trail</Typography>
                <Typography variant="caption" color="textSecondary">{error}</Typography>
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
                                      {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Unknown'}
                                   </Typography>
                                </Box>

                                <Typography variant="body2" color="textPrimary" sx={{ mb: 0.5 }}>
                                  {log.reason}
                                </Typography>

                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                   <Chip label={`By: ${log.userName}`} size="small" sx={{ fontSize: '0.65rem', height: 20, bgcolor: '#EEEEEE', fontWeight: 'bold', borderRadius: 0 }} />  {/* #EEEEEE — log chip bg, keep-as-is */}
                                </Box>
                            </Box>
                        </Box>
                        {index < logs.length - 1 && <Divider />}
                    </Box>
                ))}
             </Box>
         )}
      </DialogContent>

      <DialogActions sx={{ p: 2, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.accent}` }}>
        <Button onClick={onClose} variant="contained" sx={{ bgcolor: COLORS.cta, fontWeight: 900, borderRadius: 0, border: `2px solid ${COLORS.ctaHover}`, boxShadow: '4px 4px 0px rgba(216,67,21,0.2)', fontFamily: FONT, '&:hover': { bgcolor: COLORS.ctaHover } }}>
          Close Ledger
        </Button>
      </DialogActions>
    </Dialog>
  );
}
