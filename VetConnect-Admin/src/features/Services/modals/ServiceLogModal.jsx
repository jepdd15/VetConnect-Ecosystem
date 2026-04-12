import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, CircularProgress, Chip, Divider
} from '@mui/material';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

import HistoryIcon from '@mui/icons-material/History';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';

const ACTION_CONFIG = {
  CREATED:  { color: '#1565C0', Icon: AddCircleOutlineIcon },
  UPDATED:  { color: '#7B1FA2', Icon: EditOutlinedIcon },
  ARCHIVED: { color: '#E65100', Icon: ArchiveOutlinedIcon },
  RESTORED: { color: '#2E7D32', Icon: UnarchiveOutlinedIcon },
  DELETED:  { color: '#C62828', Icon: DeleteOutlineIcon },
};

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
          orderBy("timestamp", "desc")
        );
        const snapshot = await getDocs(q);
        setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Failed to fetch service logs:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [item?.id]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 0, border: '2px solid #5D4037' } }}>
      <DialogTitle sx={{ bgcolor: '#3E2723', color: 'white', fontWeight: '900', display: 'flex', alignItems: 'center', gap: 1 }}>
        <HistoryIcon /> Audit Trail: {item?.name}
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, bgcolor: '#FAFAF9', minHeight: 280 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress sx={{ color: '#5D4037' }} />
          </Box>
        ) : logs.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 5, color: '#9E9E9E' }}>
            <Typography variant="body1" fontWeight="bold">No history recorded.</Typography>
            <Typography variant="caption">Events will appear here after the next save.</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {logs.map((log, index) => {
              const cfg = ACTION_CONFIG[log.action] || { color: '#757575', Icon: HistoryIcon };
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

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={`By: ${log.userName || 'System'}`}
                          size="small"
                          sx={{ fontSize: '0.65rem', height: 20, bgcolor: '#EEEEEE', fontWeight: 'bold' }}
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

      <DialogActions sx={{ p: 2, bgcolor: '#FFFFFF', borderTop: '2px solid #5D4037' }}>
        <Button
          onClick={onClose}
          variant="contained"
          sx={{ bgcolor: '#5D4037', fontWeight: 'bold', borderRadius: 0, '&:hover': { bgcolor: '#3E2723' } }}
        >
          Close Ledger
        </Button>
      </DialogActions>
    </Dialog>
  );
}
