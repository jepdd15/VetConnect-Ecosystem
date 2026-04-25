import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, CircularProgress, Tooltip,
  TextField, MenuItem, Button, InputAdornment
} from '@mui/material';
import { collection, query, orderBy, limit, where, Timestamp, startAfter, getDocs } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import HistoryIcon from '@mui/icons-material/History';

import { SERVICE_ACTION_CONFIG } from '../../../utils/serviceLogConfig';
import { COLORS, FONT } from '../../../theme/designTokens';

// ── Constants ─────────────────────────────────────────────────────────────
const ACTION_TYPES = Object.keys(SERVICE_ACTION_CONFIG);
const PAGE_SIZE = 100;

// Composite Firestore index required for action filter:
// service_logs(action ASC, timestamp DESC)
// Firestore logs the creation URL on first query failure — click to create in console.

const headerSx = {
  fontFamily: FONT,
  fontWeight: 900,
  color: COLORS.accent,
  bgcolor: COLORS.cream,
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: 1,
  borderBottom: `2px solid ${COLORS.accent}`,
  py: 1.5,
};
// ──────────────────────────────────────────────────────────────────────────

export default function ServiceActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  // Server-side filter state
  const [filterAction, setFilterAction] = useState('ALL');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  // Client-side filter (not indexable by Firestore)
  const [filterSearch, setFilterSearch] = useState('');

  const buildQuery = useCallback((cursor = null) => {
    const constraints = [
      orderBy('timestamp', 'desc'),
      limit(PAGE_SIZE),
    ];

    // Action filter requires a composite index: service_logs(action ASC, timestamp DESC)
    if (filterAction !== 'ALL') {
      constraints.unshift(where('action', '==', filterAction));
    }

    if (filterDateFrom) {
      const from = new Date(filterDateFrom);
      from.setHours(0, 0, 0, 0);
      constraints.push(where('timestamp', '>=', Timestamp.fromDate(from)));
    }

    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      constraints.push(where('timestamp', '<=', Timestamp.fromDate(to)));
    }

    if (cursor) {
      constraints.push(startAfter(cursor));
    }

    return query(collection(db, 'service_logs'), ...constraints);
  }, [filterAction, filterDateFrom, filterDateTo]);

  const fetchLogs = useCallback(async (cursor = null) => {
    if (!cursor) setLoading(true);
    setError(null);
    try {
      const q = buildQuery(cursor);
      const snap = await getDocs(q);
      const newLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (cursor) {
        setLogs(prev => [...prev, ...newLogs]);
      } else {
        setLogs(newLogs);
      }

      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error('[ServiceActivityLog.fetchLogs]:', err.message);
      setError(err.code === 'failed-precondition'
        ? 'A Firestore index is required. Check the browser console for a creation link.'
        : err.message);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  // Re-fetch from the top whenever server-side filters change
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Client-side filter for service name (text search is not indexable server-side)
  const filteredLogs = useMemo(() => {
    if (!filterSearch.trim()) return logs;
    const term = filterSearch.toLowerCase();
    return logs.filter(log => (log.serviceName || '').toLowerCase().includes(term));
  }, [logs, filterSearch]);

  const hasActiveFilters = filterAction !== 'ALL' || filterDateFrom || filterDateTo || filterSearch;

  const handleClearFilters = () => {
    setFilterAction('ALL');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterSearch('');
  };

  return (
    <TableContainer
      component={Paper}
      elevation={0}
      sx={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        border: `2px solid ${COLORS.accent}`,
        borderRadius: 0,
        boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
        '&::-webkit-scrollbar': { width: '8px', height: '8px' },
        '&::-webkit-scrollbar-track': { background: COLORS.cream },
        '&::-webkit-scrollbar-thumb': { background: COLORS.accent, borderRadius: '4px' },
        '&::-webkit-scrollbar-thumb:hover': { background: COLORS.brand },
      }}
    >
      {/* ── Sticky header with filters ── */}
      <Box sx={{
        px: 3, py: 1.5,
        display: 'flex', flexDirection: 'column', gap: 1,
        borderBottom: `2px solid ${COLORS.accent}`,
        bgcolor: COLORS.cream,
        position: 'sticky', top: 0, zIndex: 2,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon sx={{ color: COLORS.accent, fontSize: 18 }} />
            <Typography variant="body2" fontWeight="900" color={COLORS.brand}>
              Clinic-Wide Service Configuration Audit Trail
            </Typography>
          </Box>
          <Chip
            label={`${filteredLogs.length} event${filteredLogs.length !== 1 ? 's' : ''}${hasMore ? '+' : ''}`}
            size="small"
            sx={{ bgcolor: COLORS.panelBg, color: COLORS.accent, fontWeight: '900', fontSize: '0.68rem', borderRadius: 0 }}
          />
        </Box>

        {/* Filter row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <FilterListIcon sx={{ color: COLORS.accent, fontSize: 16 }} />

          <TextField
            select
            size="small"
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            sx={{ minWidth: 130, '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.75rem', fontWeight: 'bold' } }}
          >
            <MenuItem value="ALL">All Actions</MenuItem>
            {ACTION_TYPES.map(a => (
              <MenuItem key={a} value={a}>{SERVICE_ACTION_CONFIG[a].label}</MenuItem>
            ))}
          </TextField>

          <TextField
            size="small"
            type="date"
            label="From"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150, '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.75rem' } }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 150, '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.75rem' } }}
          />

          <TextField
            size="small"
            placeholder="Service name..."
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: COLORS.accent }} />
                </InputAdornment>
              ),
            }}
            sx={{ width: 200, '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.75rem' } }}
          />

          {hasActiveFilters && (
            <Button
              size="small"
              onClick={handleClearFilters}
              sx={{
                fontFamily: FONT, fontWeight: 900, fontSize: '0.7rem',
                color: COLORS.danger, borderRadius: 0, textTransform: 'uppercase',
              }}
            >
              Clear
            </Button>
          )}
        </Box>
      </Box>

      {/* Loading state */}
      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
          <CircularProgress sx={{ color: COLORS.accent }} />
          <Typography variant="body2" color="textSecondary" fontWeight="bold">
            Loading service audit trail...
          </Typography>
        </Box>
      )}

      {/* Error state */}
      {!loading && error && (
        <Box sx={{ textAlign: 'center', py: 8, color: COLORS.surgery }}>
          <HistoryIcon sx={{ fontSize: 48, mb: 1, opacity: 0.4 }} />
          <Typography variant="body1" fontWeight="bold">Failed to load Activity Log</Typography>
          <Typography variant="caption" color="textSecondary">{error}</Typography>
        </Box>
      )}

      {/* Empty state */}
      {!loading && !error && filteredLogs.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 12, color: COLORS.textMuted }}>
          <HistoryIcon sx={{ fontSize: 56, mb: 1.5, opacity: 0.25 }} />
          <Typography variant="body1" fontWeight="bold" color="#757575">No Service Activity Recorded Yet</Typography>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.5 }}>
            {hasActiveFilters
              ? 'No events match your current filters. Try clearing the filters.'
              : 'Events will appear here as your team creates, updates, or archives services.'}
          </Typography>
        </Box>
      )}

      {/* Data table */}
      {!loading && !error && filteredLogs.length > 0 && (
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
            {filteredLogs.map((log) => {
              const cfg = SERVICE_ACTION_CONFIG[log.action] || { label: log.action, color: '#757575', bg: '#F5F5F5', Icon: HistoryIcon };
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
                    <Typography variant="caption" fontWeight="bold" color={COLORS.brand} sx={{ display: 'block', lineHeight: 1.4 }}>
                      {ts ? ts.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </Typography>
                    <Typography variant="caption" color="textSecondary" sx={{ lineHeight: 1.4 }}>
                      {ts ? ts.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2" fontWeight="bold" color={COLORS.brand} sx={{ lineHeight: 1.3 }}>
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
                          fontWeight: '900', fontSize: '0.65rem', letterSpacing: 0.5, borderRadius: 0,
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
                      sx={{ bgcolor: COLORS.panelBg, color: COLORS.accent, fontWeight: '900', fontSize: '0.65rem', borderRadius: 0, maxWidth: 130 }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Load More button — appears when there are more server-side results */}
      {hasMore && !loading && filteredLogs.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, borderTop: `1px solid ${COLORS.borderInput}` }}>
          <Button
            onClick={() => fetchLogs(lastDoc)}
            sx={{
              fontFamily: FONT, fontWeight: 900, fontSize: '0.75rem',
              color: COLORS.accent, borderRadius: 0, border: `1px solid ${COLORS.accent}33`,
              textTransform: 'uppercase',
            }}
          >
            Load More Events
          </Button>
        </Box>
      )}
    </TableContainer>
  );
}
