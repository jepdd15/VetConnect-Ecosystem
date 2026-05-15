import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, CircularProgress, Tooltip,
  TextField, MenuItem, Button, InputAdornment, Avatar
} from '@mui/material';
import { collection, query, orderBy, limit, where, Timestamp, getDocs } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

import SearchIcon from '@mui/icons-material/Search';
import HistoryIcon from '@mui/icons-material/History';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import EditIcon from '@mui/icons-material/Edit';
import PersonOffIcon from '@mui/icons-material/PersonOff';

import { FONT, COLORS } from '../../../theme/designTokens';

// --- Color token map for each staff/auth action type ---
const STAFF_ACTION_CONFIG = {
  // Auth Events (auth_logs)
  LOGIN_SUCCESS:  { label: 'Login',    color: COLORS.success, bg: COLORS.kpiGreenBg,  Icon: LoginIcon },
  LOGOUT:         { label: 'Logout',   color: COLORS.accent,  bg: COLORS.cream,       Icon: LogoutIcon },
  
  // Profile Events (staff_logs)
  CREATED:        { label: 'Created',  color: COLORS.medical, bg: COLORS.kpiBlueBg,   Icon: PersonAddIcon },
  UPDATED:        { label: 'Updated',  color: COLORS.grooming, bg: COLORS.kpiPurpleBg, Icon: EditIcon },
  ACCESS_REVOKED: { label: 'Revoked',  color: COLORS.danger,  bg: COLORS.dangerSurface, Icon: PersonOffIcon },
};

const ACTION_TYPES = Object.keys(STAFF_ACTION_CONFIG);
const PAGE_SIZE = 50;

const headerSx = {
  fontWeight: 1000, color: COLORS.accent, bgcolor: COLORS.cream,
  fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1,
  borderBottom: `2px solid ${COLORS.accent}`,
  py: 1.5,
};

export default function StaffActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filter state
  const [filterAction, setFilterAction] = useState('ALL');
  const [filterStaff, setFilterStaff] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Prepare Constraints
      const dateConstraints = [];
      if (filterDateFrom) {
        const from = new Date(filterDateFrom);
        from.setHours(0, 0, 0, 0);
        dateConstraints.push(where('timestamp', '>=', Timestamp.fromDate(from)));
      }
      if (filterDateTo) {
        const to = new Date(filterDateTo);
        to.setHours(23, 59, 59, 999);
        dateConstraints.push(where('timestamp', '<=', Timestamp.fromDate(to)));
      }

      // 2. Fetch from both collections (since we want a unified view)
      const fetchAuth = async () => {
        const q = query(collection(db, 'auth_logs'), orderBy('timestamp', 'desc'), limit(PAGE_SIZE), ...dateConstraints);
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, source: 'auth', ...d.data() }));
      };

      const fetchStaff = async () => {
        const q = query(collection(db, 'staff_logs'), orderBy('timestamp', 'desc'), limit(PAGE_SIZE), ...dateConstraints);
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, source: 'staff', ...d.data() }));
      };

      const [authResults, staffResults] = await Promise.all([fetchAuth(), fetchStaff()]);

      // 3. Merge and Filter in memory
      let merged = [...authResults, ...staffResults];

      // Local Filter by Action
      if (filterAction !== 'ALL') {
        merged = merged.filter(l => l.action === filterAction);
      }

      // Local Filter by Staff (Name or Email)
      if (filterStaff) {
        const lower = filterStaff.toLowerCase();
        merged = merged.filter(l => 
          (l.userName || '').toLowerCase().includes(lower) || 
          (l.staffName || '').toLowerCase().includes(lower) ||
          (l.userEmail || '').toLowerCase().includes(lower)
        );
      }

      // 4. Sort and Slice
      merged.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
      setLogs(merged.slice(0, PAGE_SIZE));
    } catch (err) {
      console.error('Failed to fetch staff logs:', err);
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterStaff, filterDateFrom, filterDateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <Box sx={{ 
      height: '100%', display: 'flex', flexDirection: 'column', 
      overflow: 'auto', bgcolor: COLORS.surfaceAlt 
    }}>
      {/* HEADER & FILTERS */}
      <Box sx={{
        px: 3, py: 1.5,
        display: 'flex', flexDirection: 'column', gap: 1,
        borderBottom: `2px solid ${COLORS.accent}`,
        bgcolor: COLORS.cream,
        position: 'sticky', top: 0, zIndex: 2,
      }}>
        {/* Title & Counter Row */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon sx={{ color: COLORS.accent, fontSize: 18 }} />
            <Typography variant="body2" fontWeight="900" color={COLORS.brand} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Clinic-Wide Staff Identity & Session Audit Trail
            </Typography>
          </Box>
          <Box sx={{ 
            bgcolor: COLORS.accent, color: 'white', px: 2, py: 0.5, 
            border: `2px solid ${COLORS.brand}`, 
            boxShadow: '4px 4px 0px rgba(0,0,0,0.1)',
            display: 'flex', alignItems: 'center', gap: 1
          }}>
            <Typography variant="caption" sx={{ fontWeight: 1000, fontSize: '0.85rem', letterSpacing: 1, textTransform: 'uppercase' }}>
              {logs.length} event{logs.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
        </Box>

        {/* Filter Row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField
            select size="small"
            value={filterAction} onChange={(e) => setFilterAction(e.target.value)}
            sx={{ 
              minWidth: 160, 
              '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.75rem', fontWeight: 'bold', bgcolor: 'white' }
            }}
            SelectProps={{
              renderValue: (selected) => {
                if (selected === 'ALL') return 'ALL ACTIONS';
                const cfg = STAFF_ACTION_CONFIG[selected];
                if (!cfg) return selected;
                const Icon = cfg.Icon;
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Icon sx={{ fontSize: 14, color: cfg.color }} />
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 900, color: cfg.color, letterSpacing: 0.5 }}>
                      {cfg.label.toUpperCase()}
                    </Typography>
                  </Box>
                );
              }
            }}
          >
            <MenuItem value="ALL" sx={{ fontWeight: 900, fontSize: '0.75rem' }}>ALL ACTIONS</MenuItem>
            {ACTION_TYPES.map(type => {
              const cfg = STAFF_ACTION_CONFIG[type];
              const Icon = cfg.Icon;
              return (
                <MenuItem key={type} value={type} sx={{ py: 1 }}>
                  <Chip
                    icon={<Icon sx={{ fontSize: '12px !important', color: `${cfg.color} !important` }} />}
                    label={cfg.label}
                    size="small"
                    sx={{
                      bgcolor: cfg.bg, color: cfg.color, fontWeight: 900, fontSize: '0.65rem',
                      borderRadius: 0, border: `1px solid ${cfg.color}44`, textTransform: 'uppercase', height: 24
                    }}
                  />
                </MenuItem>
              );
            })}
          </TextField>

          <TextField
            size="small" placeholder="Filter by Staff..."
            value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)}
            sx={{ 
              minWidth: 200, 
              '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.75rem', fontWeight: 'bold', bgcolor: 'white' }
            }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              type="date" size="small"
              value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.75rem', fontWeight: 'bold', bgcolor: 'white' } }}
            />
            <Typography sx={{ fontWeight: 900, fontSize: '0.7rem', color: COLORS.accent }}>TO</Typography>
            <TextField
              type="date" size="small"
              value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.75rem', fontWeight: 'bold', bgcolor: 'white' } }}
            />
          </Box>
        </Box>
      </Box>

      {/* TABLE AREA */}
      <TableContainer sx={{ flexGrow: 1, bgcolor: COLORS.cream }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={headerSx}>Timestamp</TableCell>
              <TableCell sx={headerSx}>Staff Member</TableCell>
              <TableCell sx={headerSx}>Action</TableCell>
              <TableCell sx={headerSx}>Event Details</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 10 }}>
                  <CircularProgress size={30} sx={{ color: COLORS.accent }} />
                  <Typography sx={{ mt: 2, color: COLORS.accent, fontWeight: 'bold' }}>Scanning Audit Trail...</Typography>
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 10 }}>
                  <Typography sx={{ color: COLORS.textMuted, fontStyle: 'italic' }}>No audit events found for selected filters.</Typography>
                </TableCell>
              </TableRow>
            ) : logs.map((log) => {
              const config = STAFF_ACTION_CONFIG[log.action] || { label: log.action, color: COLORS.textMuted, bg: '#eee', Icon: HistoryIcon };
              const { Icon } = config;
              const timestamp = log.timestamp?.toDate ? log.timestamp.toDate() : new Date();

              return (
                <TableRow key={log.id} hover sx={{ '&:hover': { bgcolor: 'rgba(93, 64, 55, 0.04)' } }}>
                  <TableCell sx={{ py: 1.5 }}>
                    <Tooltip title={
                      <Box sx={{ p: 0.5 }}>
                        <Typography variant="caption" sx={{ display: 'block', fontWeight: 800 }}>Platform: {log.metadata?.userAgent?.includes('Mobi') ? 'Mobile' : 'Desktop'} | {log.metadata?.platform || 'Internal'}</Typography>
                        <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>ID: {log.id}</Typography>
                      </Box>
                    } arrow placement="right">
                      <Box>
                        <Typography sx={{ fontWeight: 'bold', color: COLORS.textPrimary, fontSize: '0.85rem' }}>
                          {timestamp.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Typography>
                        <Typography variant="caption" sx={{ color: COLORS.textMuted, display: 'block' }}>
                          {timestamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      </Box>
                    </Tooltip>
                  </TableCell>

                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ 
                        width: 32, height: 32, fontSize: '0.8rem', fontWeight: 900,
                        bgcolor: COLORS.cream, color: COLORS.accent, border: `1px solid ${COLORS.accent}`
                      }}>
                        {(log.userName || log.staffName || '?')[0]}
                      </Avatar>
                      <Box>
                        <Typography sx={{ fontWeight: 800, color: COLORS.brand, fontSize: '0.85rem' }}>
                          {log.userName || log.staffName}
                        </Typography>
                        <Typography variant="caption" sx={{ color: COLORS.accent, fontWeight: 600 }}>
                          {log.userEmail || log.userRole || 'Authorized Staff'}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>

                  <TableCell>
                    <Chip
                      icon={<Icon sx={{ fontSize: '1rem !important', color: `${config.color} !important` }} />}
                      label={config.label}
                      sx={{
                        bgcolor: config.bg,
                        color: config.color,
                        fontWeight: 1000,
                        fontSize: '0.7rem',
                        borderRadius: 0,
                        border: `1px solid ${config.color}44`,
                        textTransform: 'uppercase',
                        height: 24
                      }}
                    />
                  </TableCell>

                  <TableCell sx={{ maxWidth: 400 }}>
                    <Tooltip title={log.details || (log.action === 'LOGIN_SUCCESS' ? 'Secure session initiated' : 'Session terminated')} arrow>
                      <Typography sx={{ 
                        fontSize: '0.85rem', fontWeight: 700, color: COLORS.textPrimary,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {log.details || (log.action === 'LOGIN_SUCCESS' ? 'Secure session initiated' : 'Session terminated')}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
