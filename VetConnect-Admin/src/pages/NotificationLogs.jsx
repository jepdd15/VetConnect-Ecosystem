/**
 * NotificationLogs.jsx — T4.95
 *
 * Filterable, paginated audit log of every push notification sent through
 * VetConnect Admin. Covers three channels:
 *   - status:   status-transition pushes via sendPushNotification
 *   - custom:   free-text sends via SendNotificationDialog
 *   - reminder: scheduled appointment reminders via sendAppointmentReminders
 *
 * Server-side filtering: date range (sentAt).
 * Client-side filtering: type + search text (applied via useMemo).
 * Pagination: cursor-based (startAfter sentAt desc), 50 rows per page.
 * Visible to all staff — not wrapped in AdminRoute.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Chip, TextField, InputAdornment,
  FormControl, Select, MenuItem, IconButton, Tooltip, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import {
  collection, query, where, orderBy, limit, startAfter,
  getDocs, Timestamp, updateDoc, doc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { DEFAULT_TEMPLATES } from '../utils/notificationTemplateConstants';

// Icons
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

// Design
import { FONT, TYPE, COLORS } from '../theme/designTokens';

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;

const TYPE_CHIP_CONFIG = {
  status:   { label: 'STATUS',   bg: COLORS.chipBlueBg,  color: COLORS.medical,  border: COLORS.medical },
  custom:   { label: 'CUSTOM',   bg: COLORS.kpiPurpleBg, color: COLORS.grooming, border: COLORS.grooming },
  reminder: { label: 'REMINDER', bg: COLORS.kpiOrangeBg, color: COLORS.warning,  border: COLORS.warning },
};

/** Returns today's date as YYYY-MM-DD using the local clock. */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Formats a Firestore Timestamp into a two-line date / time string. */
function formatDateTime(ts) {
  if (!ts) return { date: '—', time: '—' };
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return {
    date: d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}

// ─── Column definitions ───────────────────────────────────────────────────────
const buildColumns = (onRowClick) => [
  {
    field: 'sentAt',
    headerName: 'DATE / TIME',
    flex: 1,
    minWidth: 160,
    sortable: false,
    renderCell: ({ row }) => {
      const { date, time } = formatDateTime(row.sentAt);
      return (
        <Box sx={{ py: 0.5 }}>
          <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.8rem', color: COLORS.textPrimary }}>
            {date}
          </Typography>
          <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textMuted }}>
            {time}
          </Typography>
        </Box>
      );
    },
  },
  {
    field: 'ownerName',
    headerName: 'RECIPIENT',
    flex: 1.2,
    minWidth: 180,
    sortable: false,
    renderCell: ({ row }) => (
      <Box sx={{ py: 0.5 }}>
        <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.85rem', color: COLORS.textPrimary }}>
          {row.ownerName || '—'}
        </Typography>
        {row.petName && (
          <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textMuted }}>
            {row.petName}
          </Typography>
        )}
      </Box>
    ),
  },
  {
    field: 'type',
    headerName: 'TYPE',
    width: 120,
    sortable: false,
    renderCell: ({ row }) => {
      const cfg = TYPE_CHIP_CONFIG[row.type] || { label: (row.type || '?').toUpperCase(), bg: COLORS.panelBg, color: COLORS.textSecondary, border: COLORS.border };
      return (
        <Chip
          label={cfg.label}
          size="small"
          sx={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: '0.65rem',
            letterSpacing: '0.06em',
            bgcolor: cfg.bg,
            color: cfg.color,
            border: `1px solid ${cfg.border}`,
            borderRadius: 0,
            height: 22,
          }}
        />
      );
    },
  },
  {
    field: 'title',
    headerName: 'TITLE',
    flex: 1.5,
    minWidth: 200,
    sortable: false,
    renderCell: ({ row }) => (
      <Typography
        sx={{
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: '0.85rem',
          color: row.title ? COLORS.textPrimary : COLORS.textMuted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {row.title || '(Worker default)'}
      </Typography>
    ),
  },
  {
    field: 'status',
    headerName: 'STATUS',
    width: 130,
    sortable: false,
    renderCell: ({ row }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: row.status ? COLORS.textSecondary : COLORS.textMuted, fontWeight: 600 }}>
        {row.status || '—'}
      </Typography>
    ),
  },
  {
    field: 'sentBy',
    headerName: 'SENT BY',
    width: 160,
    sortable: false,
    renderCell: ({ row }) => (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textSecondary, fontWeight: 600 }}>
        {row.sentBy || '—'}
      </Typography>
    ),
  },
  {
    field: '_actions',
    headerName: '',
    width: 60,
    sortable: false,
    renderCell: ({ row }) => (
      <Tooltip title="View details">
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onRowClick(row); }}
          sx={{ color: COLORS.medical }}
        >
          <OpenInNewIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    ),
  },
];

// ─── Detail Dialog ────────────────────────────────────────────────────────────
function LogDetailDialog({ log, onClose, onViewPatient }) {
  if (!log) return null;

  const { date, time } = formatDateTime(log.sentAt);
  const cfg = TYPE_CHIP_CONFIG[log.type] || { label: (log.type || '?').toUpperCase(), bg: COLORS.panelBg, color: COLORS.textSecondary, border: COLORS.border };

  return (
    <Dialog
      open={!!log}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.brand}` } }}
    >
      <DialogTitle
        sx={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: '0.95rem',
          color: COLORS.brand,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: `2px solid ${COLORS.border}`,
          bgcolor: COLORS.cream,
        }}
      >
        <NotificationsActiveIcon sx={{ fontSize: 18, color: COLORS.medical }} />
        Notification Detail
        <Chip
          label={cfg.label}
          size="small"
          sx={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: '0.65rem',
            bgcolor: cfg.bg,
            color: cfg.color,
            border: `1px solid ${cfg.border}`,
            borderRadius: 0,
            ml: 'auto',
            height: 22,
          }}
        />
      </DialogTitle>

      <DialogContent sx={{ pt: 3, pb: 1 }}>
        {/* Metadata grid */}
        {[
          { label: 'SENT AT',    value: `${date} at ${time}` },
          { label: 'SENT BY',    value: log.sentBy || '—' },
          { label: 'RECIPIENT',  value: log.ownerName || '—' },
          { label: 'PET',        value: log.petName || '—' },
          { label: 'STATUS',     value: log.status || '—' },
          { label: 'CHANNEL',    value: log.channel || 'push' },
        ].map(({ label, value }) => (
          <Box key={label} sx={{ display: 'flex', gap: 2, mb: 1.5, alignItems: 'flex-start' }}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, minWidth: 90, mt: 0.1 }}>
              {label}
            </Typography>
            <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary }}>
              {value}
            </Typography>
          </Box>
        ))}

        {/* Title */}
        <Box sx={{ mt: 2, mb: 1 }}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5 }}>
            TITLE
          </Typography>
          <Paper sx={{ p: 1.5, borderRadius: 0, border: `1px solid ${COLORS.border}`, bgcolor: COLORS.surfaceAlt }}>
            <Typography sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.9rem', color: log.title ? COLORS.textPrimary : COLORS.textMuted }}>
              {log.title || '(Generated by notification Worker)'}
            </Typography>
          </Paper>
        </Box>

        {/* Body */}
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5 }}>
            MESSAGE BODY
          </Typography>
          <Paper sx={{ p: 1.5, borderRadius: 0, border: `1px solid ${COLORS.border}`, bgcolor: COLORS.surfaceAlt }}>
            <Typography sx={{ fontFamily: FONT, fontSize: '0.875rem', color: log.body ? COLORS.textPrimary : COLORS.textMuted, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {log.body || '(Generated by notification Worker)'}
            </Typography>
          </Paper>
        </Box>

        {/* Appointment ID (if present) */}
        {log.appointmentId && (
          <Box sx={{ mb: 1 }}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5 }}>
              APPOINTMENT ID
            </Typography>
            <Typography sx={{ ...TYPE.meta, color: COLORS.accentWarm, fontFamily: 'monospace' }}>
              {log.appointmentId}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, pb: 2, pt: 1, borderTop: `1px solid ${COLORS.borderLight}`, gap: 1 }}>
        {log.ownerId && (
          <Button
            onClick={() => onViewPatient(log.ownerId)}
            startIcon={<OpenInNewIcon sx={{ fontSize: '14px !important' }} />}
            sx={{
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: '0.8rem',
              borderRadius: 0,
              color: COLORS.medical,
              border: `1px solid ${COLORS.medical}`,
              mr: 'auto',
            }}
          >
            View Patient
          </Button>
        )}
        <Button
          onClick={onClose}
          sx={{ fontFamily: FONT, fontWeight: 700, color: COLORS.textSecondary, borderRadius: 0 }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NotificationLogs() {
  const navigate = useNavigate();
  const { isAdmin } = useUser();

  const [logs, setLogs]                   = useState([]);
  const [loading, setLoading]             = useState(false);
  const [filterType, setFilterType]       = useState('all');
  const [searchText, setSearchText]       = useState('');
  const [startDate, setStartDate]         = useState(todayStr());
  const [endDate, setEndDate]             = useState(todayStr());
  const [lastDoc, setLastDoc]             = useState(null);
  const [hasMore, setHasMore]             = useState(false);
  const [detailLog, setDetailLog]         = useState(null);
  const [refreshKey, setRefreshKey]       = useState(0);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [snackbar, setSnackbar]           = useState({ open: false, message: '', severity: 'success' });

  // ── Fetch (server-side date range, cursor pagination) ─────────────────────
  const fetchLogs = useCallback(async (append = false) => {
    setLoading(true);
    try {
      const start = new Date(startDate + 'T00:00:00');
      const end   = new Date(endDate + 'T23:59:59.999');

      const constraints = [
        where('sentAt', '>=', Timestamp.fromDate(start)),
        where('sentAt', '<=', Timestamp.fromDate(end)),
        orderBy('sentAt', 'desc'),
        limit(PAGE_SIZE + 1), // +1 to detect whether a next page exists
      ];

      if (append && lastDoc) constraints.push(startAfter(lastDoc));

      const q = query(collection(db, 'notification_log'), ...constraints);
      const snap = await getDocs(q);

      const fetched = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const hasNext = fetched.length > PAGE_SIZE;
      if (hasNext) fetched.pop(); // Drop the sentinel "peek" document

      setLogs((prev) => append ? [...prev, ...fetched] : fetched);

      // Cursor points to the last document actually rendered, not the sentinel
      const lastRendered = snap.docs[fetched.length - 1] || null;
      setLastDoc(lastRendered);
      setHasMore(hasNext);
    } catch (err) {
      console.error('[NotificationLogs] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, lastDoc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch when dates change (resets cursor to page 1)
  useEffect(() => {
    setLastDoc(null);
    setLogs([]);
    // Invoke directly without the stale lastDoc closure by using a one-shot version
    const runFetch = async () => {
      setLoading(true);
      try {
        const start = new Date(startDate + 'T00:00:00');
        const end   = new Date(endDate + 'T23:59:59.999');
        const q = query(
          collection(db, 'notification_log'),
          where('sentAt', '>=', Timestamp.fromDate(start)),
          where('sentAt', '<=', Timestamp.fromDate(end)),
          orderBy('sentAt', 'desc'),
          limit(PAGE_SIZE + 1),
        );
        const snap = await getDocs(q);
        const fetched = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const hasNext = fetched.length > PAGE_SIZE;
        if (hasNext) fetched.pop();
        setLogs(fetched);
        setLastDoc(snap.docs[fetched.length - 1] || null);
        setHasMore(hasNext);
      } catch (err) {
        console.error('[NotificationLogs] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    runFetch();
  }, [startDate, endDate, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Client-side filtering (type + search) ─────────────────────────────────
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchType = filterType === 'all' || log.type === filterType;
      const q = searchText.toLowerCase();
      const matchSearch = !q
        || (log.ownerName || '').toLowerCase().includes(q)
        || (log.petName   || '').toLowerCase().includes(q)
        || (log.title     || '').toLowerCase().includes(q)
        || (log.sentBy    || '').toLowerCase().includes(q);
      return matchType && matchSearch;
    });
  }, [logs, filterType, searchText]);

  const handleViewPatient = (ownerId) => {
    setDetailLog(null);
    navigate(`/patients/${ownerId}`);
  };

  // ── Backfill: patch null title/body entries using DEFAULT_TEMPLATES ─────────
  const handleBackfillMissingText = async () => {
    setIsBackfilling(true);
    try {
      // Fetch all notification_log docs where title is null or empty.
      // Firestore does not support "OR" across two field conditions in one query,
      // so we run two queries and deduplicate by doc ID.
      const [nullSnap, emptySnap] = await Promise.all([
        getDocs(query(collection(db, 'notification_log'), where('title', '==', null), where('type', '==', 'status'))),
        getDocs(query(collection(db, 'notification_log'), where('title', '==', ''), where('type', '==', 'status'))),
      ]);

      // Merge and deduplicate
      const seen = new Set();
      const candidates = [];
      for (const snap of [nullSnap, emptySnap]) {
        for (const d of snap.docs) {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            candidates.push(d);
          }
        }
      }

      if (candidates.length === 0) {
        setSnackbar({ open: true, message: 'All entries already have text.', severity: 'info' });
        return;
      }

      const interpolate = (str, data) =>
        str.replace(/\{(\w+)\}/g, (match, key) =>
          data[key] !== undefined ? String(data[key]) : match,
        );

      let updated = 0;
      await Promise.all(
        candidates.map(async (d) => {
          const data = d.data();
          // Skip docs that already have both fields populated (idempotent guard)
          if (data.title && data.body) return;

          const tpl = data.status ? DEFAULT_TEMPLATES[data.status] : null;
          if (!tpl) return; // Unknown status — cannot backfill

          const interpolationData = {
            petName:      data.petName      || 'your pet',
            vetName:      data.vetName      || '',
            ticketNumber: data.ticketNumber || '',
            amount:       data.amount       || '',
            date:         '',
            days:         '',
            vaccineName:  '',
          };

          await updateDoc(doc(db, 'notification_log', d.id), {
            title: interpolate(tpl.title, interpolationData),
            body:  interpolate(tpl.body,  interpolationData),
          });
          updated++;
        }),
      );

      setSnackbar({ open: true, message: `${updated} ${updated === 1 ? 'entry' : 'entries'} updated.`, severity: 'success' });
      setRefreshKey((k) => k + 1); // Reload the visible log to reflect patches
    } catch (err) {
      console.error('[NotificationLogs.handleBackfillMissingText]:', err.message);
      setSnackbar({ open: true, message: 'Backfill failed. Check console for details.', severity: 'error' });
    } finally {
      setIsBackfilling(false);
    }
  };

  const columns = useMemo(() => buildColumns(setDetailLog), []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: COLORS.surface, fontFamily: FONT }}>

      {/* ── Command strip ─────────────────────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          px: 3,
          py: 2,
          borderRadius: 0,
          borderBottom: `2px solid ${COLORS.border}`,
          bgcolor: COLORS.cardBg,
          flexShrink: 0,
        }}
      >
        {/* Row 1: Title + record count */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Typography sx={{ fontFamily: FONT, fontWeight: 1000, fontSize: '1.5rem', color: COLORS.brand, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Notifications
          </Typography>
          <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textMuted, ml: 'auto' }}>
            {filteredLogs.length} of {logs.length} entries
          </Typography>
        </Box>

        {/* Row 2: Search + filters + actions */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          {/* Search */}
          <TextField
            size="small"
            placeholder="Search notifications..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: COLORS.textMuted }} />
                </InputAdornment>
              ),
            }}
            sx={{
              flex: 1, maxWidth: 350, minWidth: 180,
              '& .MuiOutlinedInput-root': {
                fontFamily: FONT,
                fontSize: '0.85rem',
                borderRadius: 0,
                bgcolor: COLORS.formBg,
                '& fieldset': { borderColor: COLORS.borderInput },
              },
            }}
          />

          {/* Start date */}
          <TextField
            variant="outlined"
            size="small"
            type="date"
            label="From"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{
              width: 155,
              '& .MuiOutlinedInput-root': { fontFamily: FONT, fontSize: '0.85rem', borderRadius: 0, bgcolor: COLORS.formBg },
            }}
          />

          {/* End date */}
          <TextField
            variant="outlined"
            size="small"
            type="date"
            label="To"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{
              width: 155,
              '& .MuiOutlinedInput-root': { fontFamily: FONT, fontSize: '0.85rem', borderRadius: 0, bgcolor: COLORS.formBg },
            }}
          />

          {/* Type filter */}
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              displayEmpty
              sx={{ fontFamily: FONT, fontSize: '0.85rem', borderRadius: 0, bgcolor: COLORS.formBg }}
            >
              <MenuItem value="all" sx={{ fontFamily: FONT }}>All Types</MenuItem>
              <MenuItem value="status" sx={{ fontFamily: FONT }}>Status</MenuItem>
              <MenuItem value="custom" sx={{ fontFamily: FONT }}>Custom</MenuItem>
              <MenuItem value="reminder" sx={{ fontFamily: FONT }}>Reminder</MenuItem>
              <MenuItem value="vaccine-reminder" sx={{ fontFamily: FONT }}>Vaccine Reminder</MenuItem>
              <MenuItem value="appointment-reminder" sx={{ fontFamily: FONT }}>Appointment Reminder</MenuItem>
            </Select>
          </FormControl>

          {/* Refresh */}
          <Tooltip title="Refresh">
            <IconButton
              onClick={() => {
                setSearchText('');
                setFilterType('all');
                setRefreshKey((k) => k + 1);
              }}
              disabled={loading}
              sx={{ color: COLORS.medical }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>

          {/* Backfill button — admin only */}
          {isAdmin && (
            <Tooltip title="Patch log entries that are missing notification text using default templates">
              <span>
                <Button
                  onClick={handleBackfillMissingText}
                  disabled={isBackfilling}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontFamily: FONT,
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    borderRadius: 0,
                    borderColor: COLORS.warning,
                    color: COLORS.warning,
                    whiteSpace: 'nowrap',
                    '&:hover': { bgcolor: COLORS.kpiOrangeBg, borderColor: COLORS.warning },
                    '&.Mui-disabled': { opacity: 0.5 },
                  }}
                >
                  {isBackfilling ? 'Fixing...' : 'Fix Missing Text'}
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>
      </Paper>

      {/* ── DataGrid ──────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, minHeight: 0, px: 3, py: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <DataGrid
          rows={filteredLogs}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.id}
          rowHeight={56}
          disableRowSelectionOnClick={false}
          onRowClick={({ row }) => setDetailLog(row)}
          hideFooter
          disableColumnFilter
          disableColumnMenu
          sx={{
            borderRadius: 0,
            border: `2px solid ${COLORS.border}`,
            fontFamily: FONT,
            bgcolor: COLORS.cardBg,
            cursor: 'pointer',
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: COLORS.tableHeaderBg,
              borderBottom: `2px solid ${COLORS.border}`,
              borderRadius: 0,
            },
            '& .MuiDataGrid-columnHeaderTitle': {
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: '0.7rem',
              letterSpacing: '0.08em',
              color: COLORS.textSecondary,
            },
            '& .MuiDataGrid-row:hover': { bgcolor: COLORS.surfaceAlt },
            '& .MuiDataGrid-cell': {
              borderColor: COLORS.borderLight,
              alignItems: 'center',
              display: 'flex',
            },
            '& .MuiDataGrid-footerContainer': { display: 'none' },
          }}
          slots={{
            noRowsOverlay: () => (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 1 }}>
                <NotificationsActiveIcon sx={{ fontSize: 40, color: COLORS.textMuted, opacity: 0.4 }} />
                <Typography sx={{ fontFamily: FONT, ...TYPE.meta, color: COLORS.textMuted }}>
                  No notifications found for the selected date range.
                </Typography>
              </Box>
            ),
          }}
        />

        {/* Load More */}
        {hasMore && (
          <Button
            onClick={() => fetchLogs(true)}
            disabled={loading}
            variant="outlined"
            sx={{
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: '0.8rem',
              borderRadius: 0,
              alignSelf: 'center',
              px: 4,
              py: 1,
              borderColor: COLORS.border,
              color: COLORS.textSecondary,
              '&:hover': { borderColor: COLORS.medical, color: COLORS.medical, bgcolor: COLORS.chipBlueBg },
            }}
          >
            {loading ? 'Loading...' : `Load More`}
          </Button>
        )}
      </Box>

      {/* ── Detail Dialog ─────────────────────────────────────────────── */}
      <LogDetailDialog
        log={detailLog}
        onClose={() => setDetailLog(null)}
        onViewPatient={handleViewPatient}
      />

      {/* ── Backfill feedback ─────────────────────────────────────────── */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ fontFamily: FONT, fontWeight: 700, borderRadius: 0 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
