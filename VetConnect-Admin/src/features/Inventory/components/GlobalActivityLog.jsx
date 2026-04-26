import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, CircularProgress, Tooltip,
  TextField, MenuItem, Button, InputAdornment
} from '@mui/material';
import { collection, query, orderBy, limit, where, Timestamp, startAfter, getDocs } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { normalizeInventoryLog } from '../../../utils/normalizeInventoryLog';

import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import HistoryIcon from '@mui/icons-material/History';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TuneIcon from '@mui/icons-material/Tune';
import PaidIcon from '@mui/icons-material/Paid';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import { FONT, COLORS } from '../../../theme/designTokens';
import { ADJUSTMENT_TYPES } from '../constants/adjustmentTypes';

// --- Color token map for each action type ---
const ACTION_CONFIG = {
  CREATED:  { label: 'Created',   color: COLORS.medical,  bg: COLORS.kpiBlueBg,    Icon: AddCircleOutlineIcon },
  UPDATED:  { label: 'Updated',   color: COLORS.grooming, bg: COLORS.kpiPurpleBg,  Icon: EditOutlinedIcon },
  ADJUSTED: { label: 'Adjusted',  color: COLORS.success,  bg: COLORS.kpiGreenBg,   Icon: TuneIcon },
  DELETED:  { label: 'Deleted',   color: COLORS.surgery,  bg: COLORS.kpiRedBg,     Icon: DeleteOutlineIcon },
  SOLD:     { label: 'Sold',      color: COLORS.success,  bg: COLORS.kpiGreenBg,   Icon: PaidIcon },
  RESTOCK:  { label: 'Restocked', color: COLORS.medical,  bg: COLORS.kpiBlueBg,    Icon: UnarchiveOutlinedIcon },
  ARCHIVED: { label: 'Archived',  color: COLORS.warning,  bg: COLORS.warningSurface, Icon: ArchiveOutlinedIcon },
  RESTORED: { label: 'Restored',  color: COLORS.success,  bg: COLORS.kpiGreenBg,   Icon: UnarchiveOutlinedIcon },
  DISPOSED: { label: 'Disposed',  color: COLORS.danger,   bg: COLORS.dangerSurface, Icon: DeleteOutlineIcon },
};

const ACTION_TYPES = Object.keys(ACTION_CONFIG);
const PAGE_SIZE = 100;

const headerSx = {
  fontWeight: 900, color: COLORS.accent, bgcolor: COLORS.cream,
  fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1,
  borderBottom: `2px solid ${COLORS.accent}`,
  py: 1.5,
};

export default function GlobalActivityLog() {
  const clinicalFlatStyle = {
    background: COLORS.cardBg,
    border: `2px solid ${COLORS.accent}`,
    boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
    borderRadius: 0,
  };

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  // Filter state
  const [filterAction, setFilterAction] = useState('ALL');
  const [filterAdjType, setFilterAdjType] = useState('ALL');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterUser, setFilterUser] = useState('');

  const buildQuery = useCallback((cursor = null) => {
    const constraints = [
      orderBy('timestamp', 'desc'),
      limit(PAGE_SIZE),
    ];

    // Action filter requires a composite Firestore index: inventory_logs(action ASC, timestamp DESC).
    // Firestore will log the creation URL on first query failure — click to create in console.
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

    return query(collection(db, 'inventory_logs'), ...constraints);
  }, [filterAction, filterDateFrom, filterDateTo]);

  const fetchLogs = useCallback(async (cursor = null) => {
    if (!cursor) setLoading(true);
    setError(null);
    try {
      const q = buildQuery(cursor);
      const snap = await getDocs(q);
      const newLogs = snap.docs.map(d => normalizeInventoryLog({ id: d.id, ...d.data() }));

      if (cursor) {
        setLogs(prev => [...prev, ...newLogs]);
      } else {
        setLogs(newLogs);
      }

      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error('GlobalActivityLog error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  // Re-fetch from the top whenever server-side filters change
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset adjustment type filter when the action filter changes away from ADJUSTED
  useEffect(() => {
    if (filterAction !== 'ADJUSTED') {
      setFilterAdjType('ALL');
    }
  }, [filterAction]);

  // Client-side filtering for product name, user, and adjustment type
  const filteredLogs = useMemo(() => {
    let result = logs;
    if (filterSearch.trim()) {
      const term = filterSearch.toLowerCase();
      result = result.filter(log => (log.itemName || '').toLowerCase().includes(term));
    }
    if (filterUser.trim()) {
      const term = filterUser.toLowerCase();
      result = result.filter(log => (log.userName || '').toLowerCase().includes(term));
    }
    // T3.26: secondary adjustment type filter — only active when action = ADJUSTED
    if (filterAdjType !== 'ALL') {
      result = result.filter(log => log.adjustmentType === filterAdjType);
    }
    return result;
  }, [logs, filterSearch, filterUser, filterAdjType]);

  const hasActiveFilters = filterAction !== 'ALL' || filterAdjType !== 'ALL' || filterDateFrom || filterDateTo || filterSearch || filterUser;

  const handleClearFilters = () => {
    setFilterAction('ALL');
    setFilterAdjType('ALL');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterSearch('');
    setFilterUser('');
  };

  return (
    <TableContainer
      component={Paper}
      elevation={0}
      sx={{
        ...clinicalFlatStyle,
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        '&::-webkit-scrollbar': { width: '8px', height: '8px' },
        '&::-webkit-scrollbar-track': { background: COLORS.cream },
        '&::-webkit-scrollbar-thumb': { background: COLORS.accent, borderRadius: 0 },
        '&::-webkit-scrollbar-thumb:hover': { background: COLORS.brand },
      }}
    >
      {/* T2.170: Header bar with filters */}
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
              Clinic-Wide Inventory Audit Trail
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
              <MenuItem key={a} value={a}>{ACTION_CONFIG[a].label}</MenuItem>
            ))}
          </TextField>

          {/* T3.26: Secondary filter — only visible when action = ADJUSTED */}
          {filterAction === 'ADJUSTED' && (
            <TextField
              select
              size="small"
              value={filterAdjType}
              onChange={e => setFilterAdjType(e.target.value)}
              sx={{ minWidth: 180, '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.75rem', fontWeight: 'bold' } }}
            >
              <MenuItem value="ALL">All Types</MenuItem>
              {Object.entries(ADJUSTMENT_TYPES).map(([key, { label }]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </TextField>
          )}

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
            placeholder="Product name..."
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: COLORS.accent }} />
                </InputAdornment>
              ),
            }}
            sx={{ width: 180, '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.75rem' } }}
          />

          <TextField
            size="small"
            placeholder="Staff name..."
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            sx={{ width: 140, '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.75rem' } }}
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

      {/* Loading state — full-page spinner on initial load */}
      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10, gap: 2 }}>
          <CircularProgress sx={{ color: COLORS.accent }} />
          <Typography variant="body2" color="textSecondary" fontWeight="bold">
            Loading audit trail...
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
        <Box sx={{ textAlign: 'center', py: 12, color: '#9E9E9E' }}>
          <HistoryIcon sx={{ fontSize: 56, mb: 1.5, opacity: 0.25 }} />
          <Typography variant="body1" fontWeight="bold" color="#757575">No Activity Recorded Yet</Typography>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.5 }}>
            {hasActiveFilters
              ? 'No events match your current filters on this page. Try loading more or clearing the filters.'
              : 'Events will appear here as your team adds, adjusts, or removes inventory items.'}
          </Typography>
        </Box>
      )}

      {/* Data table */}
      {!loading && !error && filteredLogs.length > 0 && (
        <Table stickyHeader={false} size="small" sx={{ bgcolor: 'transparent' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...headerSx, pl: 3, minWidth: 130 }}>Timestamp</TableCell>
              <TableCell sx={{ ...headerSx, minWidth: 160 }}>Product</TableCell>
              <TableCell sx={{ ...headerSx, minWidth: 110 }} align="center">Action</TableCell>
              <TableCell sx={{ ...headerSx, minWidth: 80 }} align="center">Qty &Delta;</TableCell>
              <TableCell sx={{ ...headerSx, minWidth: 220 }}>Reason / Remarks</TableCell>
              <TableCell sx={{ ...headerSx, minWidth: 130 }}>Performed By</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {filteredLogs.map((log) => {
              const cfg = ACTION_CONFIG[log.action] || { label: log.action, color: '#757575', bg: '#F5F5F5', Icon: HistoryIcon };
              const ActionIcon = cfg.Icon;
              const isPositive = log.amountChange > 0;
              const isNegative = log.amountChange < 0;
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
                  {/* Timestamp */}
                  <TableCell sx={{ pl: 3 }}>
                    <Typography variant="caption" fontWeight="bold" color={COLORS.brand} sx={{ display: 'block', lineHeight: 1.4 }}>
                      {ts
                        ? ts.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </Typography>
                    <Typography variant="caption" color="textSecondary" sx={{ lineHeight: 1.4 }}>
                      {ts ? ts.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Typography>
                  </TableCell>

                  {/* Product Name */}
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold" color={COLORS.brand} sx={{ lineHeight: 1.3 }}>
                      {log.itemName || '—'}
                    </Typography>
                  </TableCell>

                  {/* Action Badge */}
                  <TableCell align="center">
                    <Tooltip title={`${log.action}`} arrow>
                      <Chip
                        icon={<ActionIcon sx={{ fontSize: '13px !important', color: `${cfg.color} !important` }} />}
                        label={cfg.label}
                        size="small"
                        sx={{
                          bgcolor: cfg.bg,
                          color: cfg.color,
                          fontWeight: '900',
                          fontSize: '0.65rem',
                          letterSpacing: 0.5,
                          borderRadius: 0,
                          '& .MuiChip-icon': { ml: '6px' },
                        }}
                      />
                    </Tooltip>
                  </TableCell>

                  {/* Qty Delta */}
                  <TableCell align="center">
                    {log.amountChange !== 0 ? (
                      <Box sx={{
                        display: 'inline-flex', alignItems: 'center', gap: 0.4,
                        bgcolor: isPositive ? COLORS.kpiGreenBg : isNegative ? COLORS.kpiRedBg : COLORS.tableHeaderBg,
                        px: 1, py: 0.25, borderRadius: 0,
                      }}>
                        {isPositive && <ArrowUpwardIcon sx={{ fontSize: 12, color: COLORS.success }} />}
                        {isNegative && <ArrowDownwardIcon sx={{ fontSize: 12, color: COLORS.surgery }} />}
                        <Typography
                          variant="caption"
                          fontWeight="900"
                          sx={{ color: isPositive ? COLORS.success : isNegative ? COLORS.surgery : '#757575' }}
                        >
                          {isPositive ? '+' : ''}{log.amountChange}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="caption" color="textSecondary">—</Typography>
                    )}
                  </TableCell>

                  {/* Reason — T3.26: structured type chip displayed for ADJUSTED logs */}
                  <TableCell sx={{ maxWidth: 300 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                      {log.adjustmentType && ADJUSTMENT_TYPES[log.adjustmentType] && (
                        <Chip
                          label={ADJUSTMENT_TYPES[log.adjustmentType].label}
                          size="small"
                          sx={{
                            fontSize: '0.6rem',
                            height: 18,
                            borderRadius: 0,
                            fontWeight: 900,
                            bgcolor: COLORS.kpiOrangeBg,
                            color: COLORS.warning,
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <Typography
                        variant="body2"
                        color="textSecondary"
                        sx={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={log.reason}
                      >
                        {log.reason || '—'}
                      </Typography>
                    </Box>
                  </TableCell>

                  {/* Performed By */}
                  <TableCell>
                    <Chip
                      label={log.userName || 'System'}
                      size="small"
                      sx={{
                        bgcolor: COLORS.panelBg,
                        color: COLORS.accent,
                        fontWeight: '900',
                        fontSize: '0.65rem',
                        borderRadius: 0,
                        maxWidth: 130,
                      }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Load More button — appears when there are more server-side results */}
      {hasMore && !loading && (
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
