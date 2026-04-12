import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, CircularProgress, Tooltip
} from '@mui/material';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

import HistoryIcon from '@mui/icons-material/History';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';

const ACTION_CONFIG = {
  CREATED:  { label: 'Created',  color: '#1565C0', bg: '#EFF6FF', Icon: AddCircleOutlineIcon },
  UPDATED:  { label: 'Updated',  color: '#7B1FA2', bg: '#F3E8FF', Icon: EditOutlinedIcon },
  ARCHIVED: { label: 'Archived', color: '#E65100', bg: '#FFF3E0', Icon: ArchiveOutlinedIcon },
  RESTORED: { label: 'Restored', color: '#2E7D32', bg: '#F0FDF4', Icon: UnarchiveOutlinedIcon },
  DELETED:  { label: 'Deleted',  color: '#C62828', bg: '#FEF2F2', Icon: DeleteOutlineIcon },
};

const headerSx = {
  fontWeight: '1000', color: '#5D4037', bgcolor: '#FFF8E1',
  fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1,
  borderBottom: '2px solid #5D4037', py: 1.5,
};

export default function ServiceActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, 'service_logs'),
      orderBy('timestamp', 'desc'),
      limit(300)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('ServiceActivityLog error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
        <CircularProgress sx={{ color: '#5D4037' }} />
        <Typography variant="body2" color="textSecondary" fontWeight="bold">
          Loading service audit trail...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, color: '#C62828' }}>
        <HistoryIcon sx={{ fontSize: 48, mb: 1, opacity: 0.4 }} />
        <Typography variant="body1" fontWeight="bold">Failed to load Activity Log</Typography>
        <Typography variant="caption" color="textSecondary">{error}</Typography>
      </Box>
    );
  }

  if (logs.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 12, color: '#9E9E9E' }}>
        <HistoryIcon sx={{ fontSize: 56, mb: 1.5, opacity: 0.25 }} />
        <Typography variant="body1" fontWeight="bold" color="#757575">No Service Activity Recorded Yet</Typography>
        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.5 }}>
          Events will appear here as your team creates, updates, or archives services.
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer
      component={Paper}
      elevation={0}
      sx={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        border: '2px solid #5D4037',
        borderRadius: 0,
        boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
        '&::-webkit-scrollbar': { width: '8px', height: '8px' },
        '&::-webkit-scrollbar-track': { background: '#FFF8E1' },
        '&::-webkit-scrollbar-thumb': { background: '#5D4037', borderRadius: '4px' },
        '&::-webkit-scrollbar-thumb:hover': { background: '#3E2723' },
      }}
    >
      {/* Header bar */}
      <Box sx={{
        px: 3, py: 1.5,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '2px solid #5D4037',
        bgcolor: '#FFF8E1',
        position: 'sticky', top: 0, zIndex: 2,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon sx={{ color: '#5D4037', fontSize: 18 }} />
          <Typography variant="body2" fontWeight="900" color="#3E2723">
            Clinic-Wide Service Configuration Audit Trail
          </Typography>
        </Box>
        <Chip
          label={`${logs.length} event${logs.length !== 1 ? 's' : ''}`}
          size="small"
          sx={{ bgcolor: '#EFEBE9', color: '#5D4037', fontWeight: '900', fontSize: '0.68rem', borderRadius: 1 }}
        />
      </Box>

      <Table stickyHeader={false} size="small" sx={{ bgcolor: 'transparent' }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...headerSx, pl: 3, minWidth: 130 }}>Timestamp</TableCell>
            <TableCell sx={{ ...headerSx, minWidth: 180 }}>Service</TableCell>
            <TableCell sx={{ ...headerSx, minWidth: 110 }} align="center">Action</TableCell>
            <TableCell sx={{ ...headerSx, minWidth: 280 }}>Changes / Remarks</TableCell>
            <TableCell sx={{ ...headerSx, minWidth: 130 }}>Performed By</TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {logs.map((log) => {
            const cfg = ACTION_CONFIG[log.action] || { label: log.action, color: '#757575', bg: '#F5F5F5', Icon: HistoryIcon };
            const ActionIcon = cfg.Icon;
            const ts = log.timestamp?.toDate ? log.timestamp.toDate() : null;

            return (
              <TableRow
                key={log.id}
                hover
                sx={{
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.7)' },
                  '& > td': { borderBottom: '1px solid rgba(0,0,0,0.04)', py: 1.25 },
                }}
              >
                <TableCell sx={{ pl: 3 }}>
                  <Typography variant="caption" fontWeight="bold" color="#3E2723" sx={{ display: 'block', lineHeight: 1.4 }}>
                    {ts ? ts.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </Typography>
                  <Typography variant="caption" color="textSecondary" sx={{ lineHeight: 1.4 }}>
                    {ts ? ts.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </Typography>
                </TableCell>

                <TableCell>
                  <Typography variant="body2" fontWeight="bold" color="#3E2723" sx={{ lineHeight: 1.3 }}>
                    {log.serviceName || '—'}
                  </Typography>
                </TableCell>

                <TableCell align="center">
                  <Tooltip title={log.action} arrow>
                    <Chip
                      icon={<ActionIcon sx={{ fontSize: '13px !important', color: `${cfg.color} !important` }} />}
                      label={cfg.label}
                      size="small"
                      sx={{
                        bgcolor: cfg.bg, color: cfg.color,
                        fontWeight: '900', fontSize: '0.65rem', letterSpacing: 0.5, borderRadius: 1,
                        '& .MuiChip-icon': { ml: '6px' },
                      }}
                    />
                  </Tooltip>
                </TableCell>

                <TableCell sx={{ maxWidth: 300 }}>
                  <Typography
                    variant="body2" color="textSecondary"
                    sx={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={log.changes || log.reason}
                  >
                    {log.changes || log.reason || '—'}
                  </Typography>
                </TableCell>

                <TableCell>
                  <Chip
                    label={log.userName || 'System'}
                    size="small"
                    sx={{ bgcolor: '#EFEBE9', color: '#5D4037', fontWeight: '900', fontSize: '0.65rem', borderRadius: 1, maxWidth: 130 }}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
