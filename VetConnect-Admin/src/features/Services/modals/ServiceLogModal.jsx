import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, CircularProgress, Chip, Divider
} from '@mui/material';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

import HistoryIcon from '@mui/icons-material/History';

import { SERVICE_ACTION_CONFIG } from '../../../utils/serviceLogConfig';
import { COLORS, FONT } from '../../../theme/designTokens';

export default function ServiceLogModal({ open, onClose, item }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!item?.id) return;

    const fetchLogs = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "service_logs"),
          where("serviceId", "==", item.id),
          orderBy("timestamp", "desc"),
          limit(500)
        );
        const snapshot = await getDocs(q);
        setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error('[ServiceLogModal.fetchLogs]:', err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [item?.id]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.accent}` } }}
    >
      <DialogTitle sx={{ bgcolor: COLORS.brand, color: 'white', fontWeight: '900', display: 'flex', alignItems: 'center', gap: 1, fontFamily: FONT }}>
        <HistoryIcon /> Audit Trail: {item?.name}
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, bgcolor: '#FAFAF9', minHeight: 280 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress sx={{ color: COLORS.accent }} />
          </Box>
        ) : logs.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 5, color: COLORS.textMuted }}>
            <Typography variant="body1" fontWeight="bold">No history recorded.</Typography>
            <Typography variant="caption">Events will appear here after the next save.</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {logs.map((log, index) => {
              const cfg = SERVICE_ACTION_CONFIG[log.action] || { color: '#757575', Icon: HistoryIcon };
              const ActionIcon = cfg.Icon;
              const ts = log.timestamp?.toDate ? log.timestamp.toDate() : null;

              return (
                <Box key={log.id}>
                  <Box sx={{ display: 'flex', p: 2, alignItems: 'flex-start', gap: 2, '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' } }}>
                    <Box sx={{ mt: 0.5 }}>
                      <ActionIcon fontSize="small" sx={{ color: cfg.color }} />
                    </Box>

                    <Box sx={{ flexGrow: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2" fontWeight="900" sx={{ color: cfg.color }}>
                          {log.action}
                        </Typography>
                        <Typography variant="caption" color="textSecondary" fontWeight="bold">
                          {ts ? ts.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Just now'}
                        </Typography>
                      </Box>

                      {log.changes && (
                        <Typography variant="body2" color="textSecondary" sx={{ mb: 0.5, fontSize: '0.78rem', fontStyle: 'italic' }}>
                          {log.changes}
                        </Typography>
                      )}

                      {log.reason && (
                        <Typography variant="caption" color="textSecondary" sx={{ mb: 0.5, display: 'block', fontSize: '0.72rem' }}>
                          Reason: {log.reason}
                        </Typography>
                      )}

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={`By: ${log.userName || 'System'}`}
                          size="small"
                          sx={{ fontSize: '0.65rem', height: 20, bgcolor: COLORS.panelBg, color: COLORS.accent, fontWeight: 'bold', borderRadius: 0 }}
                        />
                      </Box>
                    </Box>
                  </Box>
                  {index < logs.length - 1 && <Divider />}
                </Box>
              );
            })}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, bgcolor: COLORS.cardBg, borderTop: `2px solid ${COLORS.accent}` }}>
        <Button
          onClick={onClose}
          variant="contained"
          sx={{ bgcolor: COLORS.accent, fontWeight: 'bold', borderRadius: 0, '&:hover': { bgcolor: COLORS.brand } }}
        >
          Close Ledger
        </Button>
      </DialogActions>
    </Dialog>
  );
}
