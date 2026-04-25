import React, { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { DataGrid } from '@mui/x-data-grid';
import {
  Box, Typography, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, Button, TextField, InputAdornment, MenuItem, Alert, Chip,
  Skeleton, Snackbar
} from '@mui/material';
import { collection, query, orderBy, onSnapshot, doc, addDoc, updateDoc, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useUser } from '../context/UserContext';
import { COLORS, TYPE, FONT, PANEL } from '../theme/designTokens';

import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';

export default function Expenses() {
  const { user, profile } = useUser();
  const location = useLocation();
  const [expenses, setExpenses] = useState([]);

  useEffect(() => {
    const df = location.state?.dashboardFilter;
    if (!df) return;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [formData, setFormData] = useState({ category: 'Utilities', description: '', amount: '', expenseDate: '' });
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterDate, setFilterDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // 'YYYY-MM-DD'
  });
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null });
  const [editExpense, setEditExpense] = useState(null); // null or { id, category, description, amount }

  // ── ANALYTICAL CALCULATION ENGINE ──
  const analytics = useMemo(() => {
    const dayTotal = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    const categories = expenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {});

    const catKeys = Object.keys(categories);
    const topCategory = catKeys.length === 0
      ? 'N/A'
      : catKeys.reduce((a, b) => categories[a] >= categories[b] ? a : b);

    return { dayTotal, topCategory, entryCount: expenses.length };
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    if (filterCategory === 'All') return expenses;
    return expenses.filter(e => e.category === filterCategory);
  }, [expenses, filterCategory]);

  useEffect(() => {
    setIsInitialLoad(true);
    const startOfDay = new Date(filterDate + 'T00:00:00+08:00');
    const endOfDay = new Date(filterDate + 'T23:59:59.999+08:00');

    const q = query(
      collection(db, "expenses"),
      where("date", ">=", Timestamp.fromDate(startOfDay)),
      where("date", "<=", Timestamp.fromDate(endOfDay)),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExpenses(
        snapshot.docs
          .filter(d => !d.data().deletedAt)
          .map(d => ({
            id: d.id,
            ...d.data(),
            displayDate: d.data().date?.toDate().toLocaleString('en-PH', {
              timeZone: 'Asia/Manila',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
          }))
      );
      setIsInitialLoad(false);
    }, (error) => {
      console.error('[Expenses] Listener error:', error);
      setIsInitialLoad(false);
      showToast('Failed to load expenses. Check your connection.', 'error');
    });

    return () => unsubscribe();
  }, [filterDate]);

  const handleSave = async () => {
    if (!user?.uid) { showToast('You must be signed in to log expenses.', 'error'); return; }
    if (!formData.description.trim()) {
      showToast('Description is required.', 'error');
      return;
    }
    const parsedAmount = parseFloat(formData.amount);
    if (!isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast('Amount must be a positive number.', 'error');
      return;
    }
    try {
      const { expenseDate, ...cleanData } = formData;
      await addDoc(collection(db, "expenses"), {
        ...cleanData,
        amount: parsedAmount,
        date: expenseDate
          ? Timestamp.fromDate(new Date(expenseDate + 'T04:00:00Z'))
          : Timestamp.now(),
        loggedBy: profile?.fullName || 'Unknown',
        loggedByUid: user?.uid || null,
      });
      setOpen(false);
      setFormData({ category: 'Utilities', description: '', amount: '', expenseDate: '' });
    } catch (error) {
      console.error('[Expenses] Save error:', error);
      showToast('Failed to save expense: ' + error.message, 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete.id) return;
    try {
      await updateDoc(doc(db, "expenses", confirmDelete.id), {
        deletedAt: Timestamp.now(),
        deletedBy: profile?.fullName || 'Unknown',
        deletedByUid: user?.uid || null,
        updatedByUid: user?.uid || null,
      });
      showToast('Expense deleted.', 'success');
    } catch (error) {
      console.error('[Expenses] Delete error:', error);
      showToast('Failed to delete expense: ' + error.message, 'error');
    } finally {
      setConfirmDelete({ open: false, id: null });
    }
  };

  const handleEditSave = async () => {
    if (!editExpense) return;
    if (!user?.uid) { showToast('You must be signed in to edit expenses.', 'error'); return; }
    const live = expenses.find(e => e.id === editExpense.id);
    if (!live) { showToast('This expense has been deleted.', 'error'); setEditExpense(null); return; }
    if (!editExpense.description.trim()) {
      showToast('Description is required.', 'error');
      return;
    }
    const parsedAmount = parseFloat(editExpense.amount);
    if (!isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast('Amount must be a positive number.', 'error');
      return;
    }
    try {
      await updateDoc(doc(db, "expenses", editExpense.id), {
        category: editExpense.category,
        description: editExpense.description.trim(),
        amount: parsedAmount,
        updatedAt: Timestamp.now(),
        updatedBy: profile?.fullName || 'Unknown',
        updatedByUid: user?.uid || null,
      });
      showToast('Expense updated.', 'success');
      setEditExpense(null);
    } catch (error) {
      console.error('[Expenses] Edit error:', error);
      showToast('Failed to update: ' + error.message, 'error');
    }
  };

  const columns = [
    {
      field: 'displayDate', headerName: 'DATE LOGGED', width: 220,
      renderCell: (p) => (
        <Typography variant="body2" sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.brand }}>{p.value}</Typography>
      )
    },
    {
      field: 'category', headerName: 'CATEGORY', width: 180,
      renderCell: (p) => (
        <Chip label={p.value} size="small" sx={{ borderRadius: 0, bgcolor: COLORS.cream, color: COLORS.accent, border: `1px solid ${COLORS.accent}`, fontWeight: TYPE.label.fontWeight, textTransform: 'uppercase', fontSize: '0.65rem' }} />
      )
    },
    {
      field: 'description', headerName: 'DESCRIPTION', flex: 1,
      renderCell: (p) => (
        <Typography variant="body2" sx={{ fontWeight: TYPE.bodyBold.fontWeight, color: COLORS.accent }}>{p.value}</Typography>
      )
    },
    {
      field: 'amount', headerName: 'AMOUNT', width: 180, align: 'right', headerAlign: 'right',
      renderCell: (p) => (
        <Typography sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.danger, fontSize: '1.1rem', letterSpacing: 0.5 }}>
          - ₱{p.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Typography>
      )
    },
    {
      field: 'actions', headerName: '', width: 130, align: 'center', sortable: false,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            onClick={() => setEditExpense({
              id: p.row.id,
              category: p.row.category,
              description: p.row.description,
              amount: String(p.row.amount),
            })}
            sx={{
              color: COLORS.accent,
              border: `2px solid ${COLORS.border}`,
              borderRadius: 0,
              '&:hover': { bgcolor: COLORS.surfaceHover, border: `2px solid ${COLORS.accent}` },
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            onClick={() => setConfirmDelete({ open: true, id: p.row.id })}
            sx={{
              color: COLORS.dangerHover,
              border: `2px solid ${COLORS.danger}`,
              borderRadius: 0,
              '&:hover': { bgcolor: COLORS.dangerSurface, border: `2px solid ${COLORS.danger}` }
            }}
          >
            <DeleteIcon fontSize="small"/>
          </IconButton>
        </Box>
      )
    }
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', m: 0, overflow: 'hidden', bgcolor: COLORS.formBg }}>

      {/* 1. FULL-BLEED INDUSTRIAL HEADER */}
      <Box sx={{
        flexShrink: 0,
        bgcolor: COLORS.cream,
        borderBottom: `2px solid ${COLORS.accent}`,
        p: 2.5,
        px: 4,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: 0
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
          <Box>
            <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: TYPE.label.fontWeight, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: 1, fontSize: '1.5rem', lineHeight: 1, mr: 1 }}>
              Operational Expenses
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained" color="error" startIcon={<AddIcon />}
          onClick={() => setOpen(true)}
          sx={{
              fontWeight: TYPE.label.fontWeight, px: 4, py: 1.2, borderRadius: 0,
              bgcolor: COLORS.danger, border: `2px solid ${COLORS.ctaHover}`,
              boxShadow: `4px 4px 0px ${COLORS.danger}`,
              '&:hover': { bgcolor: COLORS.ctaHover, boxShadow: `2px 2px 0px ${COLORS.danger}` },
              fontFamily: FONT,
          }}
        >
          LOG EXPENSE
        </Button>
      </Box>

      {/* 2. ANALYTICAL KPI STRIP */}
      <Box sx={{ flexShrink: 0, display: 'flex', borderBottom: `2px solid ${COLORS.accent}`, bgcolor: COLORS.cardBg }}>
        <Box sx={{ flex: 1, p: 2, borderRight: `1px solid ${COLORS.borderLight}`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="overline" sx={{ color: COLORS.textSecondary, fontWeight: TYPE.label.fontWeight, fontSize: '0.65rem' }}>Day Total</Typography>
          {isInitialLoad ? (
            <Skeleton variant="text" width="60%" height={32} sx={{ bgcolor: COLORS.kpiRedBg }} />
          ) : (
            <Typography variant="h5" sx={{ color: COLORS.danger, fontWeight: TYPE.label.fontWeight }}>₱{analytics.dayTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography>
          )}
        </Box>
        <Box sx={{ flex: 1, p: 2, borderRight: `1px solid ${COLORS.borderLight}`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="overline" sx={{ color: COLORS.textSecondary, fontWeight: TYPE.label.fontWeight, fontSize: '0.65rem' }}>Top Spend Category</Typography>
          {isInitialLoad ? (
            <Skeleton variant="text" width="60%" height={32} sx={{ bgcolor: COLORS.panelBg }} />
          ) : (
            <Typography variant="h5" sx={{ color: COLORS.brand, fontWeight: TYPE.label.fontWeight, textTransform: 'uppercase' }}>{analytics.topCategory}</Typography>
          )}
        </Box>
        <Box sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="overline" sx={{ color: COLORS.textSecondary, fontWeight: TYPE.label.fontWeight, fontSize: '0.65rem' }}>Entries</Typography>
          {isInitialLoad ? (
            <Skeleton variant="text" width="60%" height={32} sx={{ bgcolor: COLORS.kpiRedBg }} />
          ) : (
            <Typography variant="h5" sx={{ color: COLORS.danger, fontWeight: TYPE.label.fontWeight }}>{analytics.entryCount}</Typography>
          )}
        </Box>
      </Box>

      {/* 3. RIGID COMMAND STRIP (FILTERING) */}
      <Box sx={{ flexShrink: 0, bgcolor: COLORS.formBg, borderBottom: `2px solid ${COLORS.accent}`, p: 1, px: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            type="date"
            size="small"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            sx={{
              width: 180,
              bgcolor: COLORS.cardBg,
              '& .MuiOutlinedInput-root': {
                borderRadius: 0,
                '& fieldset': { border: `2px solid ${COLORS.accent}` },
              },
              '& .MuiInputBase-input': { ...TYPE.label, py: 0.5 },
            }}
          />
          <Typography variant="caption" sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.accent, textTransform: 'uppercase' }}>Category:</Typography>
          {['All', 'Utilities', 'Payroll', 'Supplies', 'Maintenance', 'Refunds', 'Other'].map(cat => (
            <Chip
              key={cat} label={cat} size="small"
              onClick={() => setFilterCategory(cat)}
              sx={{
                borderRadius: 0,
                border: `2px solid ${COLORS.accent}`,
                bgcolor: filterCategory === cat ? COLORS.accent : COLORS.cardBg,
                color: filterCategory === cat ? COLORS.cardBg : COLORS.accent,
                fontWeight: TYPE.label.fontWeight,
                px: 1,
                '&:hover': { bgcolor: filterCategory === cat ? COLORS.brand : COLORS.panelBg }
              }}
            />
          ))}
      </Box>

      {/* 4. LEDGER COMMAND CENTER SHELL (FLEX: 1) */}
      <Box sx={{ flexGrow: 1, minHeight: 0, width: '100%', overflow: 'hidden', p: 0 }}>
        <DataGrid
            rows={filteredExpenses} columns={columns} disableRowSelectionOnClick
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            sx={{
                border: 'none',
                borderRadius: 0,
                bgcolor: 'transparent',
                '& .MuiDataGrid-columnHeaders': {
                  bgcolor: `${COLORS.panelBg} !important`,
                  color: COLORS.brand,
                  fontWeight: `${TYPE.label.fontWeight} !important`,
                  borderBottom: `2px solid ${COLORS.accent}`,
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                  letterSpacing: 1.5,
                  borderRadius: 0
                },
                '& .MuiDataGrid-columnSeparator': { display: 'none' },
                '& .MuiDataGrid-cell': {
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: `1px solid ${COLORS.borderLight}`,
                  fontFamily: FONT,
                  fontWeight: '500'
                },
                '& .MuiDataGrid-row:hover': { bgcolor: COLORS.surfaceHover },
                '& .MuiDataGrid-virtualScroller': {
                  '&::-webkit-scrollbar': { width: '10px', height: '10px' },
                  '&::-webkit-scrollbar-track': { background: COLORS.tableHeaderBg },
                  '&::-webkit-scrollbar-thumb': { background: COLORS.accent, borderRadius: 0 },
                  '&::-webkit-scrollbar-thumb:hover': { background: COLORS.brand }
                }
            }}
        />
      </Box>

      {/* LOG MODAL: HIGH-INTENSITY SQUARE STANDARD */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            ...PANEL.card,
            boxShadow: `8px 8px 0px ${COLORS.brand}`,
          }
        }}
      >
        <DialogTitle sx={{
          bgcolor: COLORS.cream,
          color: COLORS.brand,
          fontWeight: TYPE.label.fontWeight,
          borderBottom: `2px solid ${COLORS.brand}`,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          fontSize: '1.1rem',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5
        }}>
          <MoneyOffIcon sx={{ color: COLORS.danger }} />
          Log Cash Disbursement
        </DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: COLORS.formBg }}>
          <Alert
            severity="info"
            sx={{
              mb: 4,
              fontWeight: TYPE.bodyBold.fontWeight,
              border: `2px solid ${COLORS.info}`,
              borderRadius: 0,
              bgcolor: COLORS.chipBlueBg,
              color: '#0D47A1',
              '& .MuiAlert-icon': { color: COLORS.info }
            }}
          >
            Log operational expenses to maintain an accurate disbursement ledger. All entries are timestamped and attributed to the logged-in user.
          </Alert>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              select label="Disbursement Category" fullWidth size="small"
              value={formData.category}
              onChange={e => setFormData({...formData, category: e.target.value})}
              sx={{
                bgcolor: COLORS.cardBg,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 0,
                  '& fieldset': { border: `2px solid ${COLORS.accent}` },
                  '&:hover fieldset': { borderColor: COLORS.brand },
                  '&.Mui-focused fieldset': { borderColor: COLORS.accent }
                },
                '& .MuiInputLabel-root': { color: COLORS.accent, fontWeight: 'bold' }
              }}
            >
              {['Utilities', 'Payroll', 'Supplies', 'Maintenance', 'Refunds', 'Other'].map(c => (
                <MenuItem key={c} value={c} sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.brand }}>{c}</MenuItem>
              ))}
            </TextField>

            <TextField
              label="Description / Particulars" fullWidth size="small"
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              placeholder="e.g. Meralco Bill - Oct 2023"
              sx={{
                bgcolor: COLORS.cardBg,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 0,
                  '& fieldset': { border: `2px solid ${COLORS.accent}` },
                  '&:hover fieldset': { borderColor: COLORS.brand },
                  '&.Mui-focused fieldset': { borderColor: COLORS.accent }
                },
                '& .MuiInputLabel-root': { color: COLORS.accent, fontWeight: 'bold' }
              }}
            />

            <TextField
              label="Amount to Disburse" type="number" fullWidth size="small"
              value={formData.amount}
              onChange={e => setFormData({...formData, amount: e.target.value})}
              InputProps={{
                startAdornment: <InputAdornment position="start" sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.accent }}>₱</InputAdornment>
              }}
              sx={{
                bgcolor: COLORS.cardBg,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 0,
                  '& fieldset': { border: `2px solid ${COLORS.danger}` },
                  '&:hover fieldset': { borderColor: COLORS.dangerHover },
                  '&.Mui-focused fieldset': { borderColor: COLORS.danger }
                },
                '& .MuiInputLabel-root': { color: COLORS.danger, fontWeight: 'bold' }
              }}
            />

            <TextField
              label="Date of Expense (optional — defaults to today)"
              type="date"
              fullWidth
              size="small"
              value={formData.expenseDate}
              onChange={(e) => setFormData({ ...formData, expenseDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={{
                bgcolor: COLORS.cardBg,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 0,
                  '& fieldset': { border: `2px solid ${COLORS.accent}` },
                  '&:hover fieldset': { borderColor: COLORS.brand },
                  '&.Mui-focused fieldset': { borderColor: COLORS.accent },
                },
                '& .MuiInputLabel-root': { color: COLORS.accent, fontWeight: 'bold' },
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: `2px solid ${COLORS.brand}`, bgcolor: COLORS.cream, justifyContent: 'space-between' }}>
          <Button
            onClick={() => setOpen(false)}
            sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.accent, border: `2px solid ${COLORS.accent}`, borderRadius: 0, px: 3, '&:hover': { bgcolor: COLORS.surfaceHover } }}
          >
            CANCEL
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            sx={{
                fontWeight: TYPE.label.fontWeight, px: 4, py: 1.5, borderRadius: 0,
                bgcolor: COLORS.danger, border: `2px solid ${COLORS.ctaHover}`,
                boxShadow: `4px 4px 0px ${COLORS.brand}`,
                '&:hover': { bgcolor: COLORS.ctaHover, boxShadow: `2px 2px 0px ${COLORS.brand}`, transform: 'translate(-2px, -2px)' },
                fontFamily: FONT,
            }}
          >
            AUTHORIZE DISBURSEMENT
          </Button>
        </DialogActions>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog
        open={confirmDelete.open}
        onClose={() => setConfirmDelete({ open: false, id: null })}
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.brand}`, boxShadow: `4px 4px 0px ${COLORS.brand}` } }}
      >
        <DialogTitle sx={{ bgcolor: COLORS.dangerSurface, color: COLORS.brand, fontWeight: TYPE.label.fontWeight, borderBottom: `2px solid ${COLORS.brand}`, textTransform: 'uppercase', letterSpacing: 1.5, fontSize: '1rem' }}>
          Confirm Deletion
        </DialogTitle>
        <DialogContent sx={{ p: 3, pt: 3 }}>
          <Typography sx={{ ...TYPE.body, color: COLORS.textPrimary }}>
            This will permanently remove the expense record. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: `2px solid ${COLORS.brand}`, bgcolor: COLORS.dangerSurface, justifyContent: 'space-between' }}>
          <Button onClick={() => setConfirmDelete({ open: false, id: null })} sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.accent, border: `2px solid ${COLORS.accent}`, borderRadius: 0, px: 3 }}>
            CANCEL
          </Button>
          <Button onClick={handleDeleteConfirm} variant="contained" sx={{ fontWeight: TYPE.label.fontWeight, px: 4, borderRadius: 0, bgcolor: COLORS.danger, border: `2px solid ${COLORS.dangerHover}`, '&:hover': { bgcolor: COLORS.dangerHover } }}>
            DELETE
          </Button>
        </DialogActions>
      </Dialog>

      {/* EDIT EXPENSE DIALOG */}
      <Dialog
        open={!!editExpense}
        onClose={() => setEditExpense(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { ...PANEL.card, boxShadow: `8px 8px 0px ${COLORS.brand}` } }}
      >
        <DialogTitle sx={{
          bgcolor: COLORS.cream, color: COLORS.brand, fontWeight: TYPE.label.fontWeight,
          borderBottom: `2px solid ${COLORS.brand}`, textTransform: 'uppercase', letterSpacing: 1.5, fontSize: '1.1rem',
          display: 'flex', alignItems: 'center', gap: 1.5,
        }}>
          <EditIcon sx={{ color: COLORS.accent }} />
          Edit Expense
        </DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: COLORS.formBg }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
            <TextField
              select label="Category" fullWidth size="small"
              value={editExpense?.category || ''}
              onChange={(e) => setEditExpense({ ...editExpense, category: e.target.value })}
              sx={{
                bgcolor: COLORS.cardBg,
                '& .MuiOutlinedInput-root': { borderRadius: 0, '& fieldset': { border: `2px solid ${COLORS.accent}` } },
                '& .MuiInputLabel-root': { color: COLORS.accent, fontWeight: 'bold' },
              }}
            >
              {['Utilities', 'Payroll', 'Supplies', 'Maintenance', 'Refunds', 'Other'].map((c) => (
                <MenuItem key={c} value={c} sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.brand }}>{c}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Description" fullWidth size="small"
              value={editExpense?.description || ''}
              onChange={(e) => setEditExpense({ ...editExpense, description: e.target.value })}
              sx={{
                bgcolor: COLORS.cardBg,
                '& .MuiOutlinedInput-root': { borderRadius: 0, '& fieldset': { border: `2px solid ${COLORS.accent}` } },
                '& .MuiInputLabel-root': { color: COLORS.accent, fontWeight: 'bold' },
              }}
            />
            <TextField
              label="Amount" type="number" fullWidth size="small"
              value={editExpense?.amount || ''}
              onChange={(e) => setEditExpense({ ...editExpense, amount: e.target.value })}
              InputProps={{ startAdornment: <InputAdornment position="start" sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.accent }}>₱</InputAdornment> }}
              sx={{
                bgcolor: COLORS.cardBg,
                '& .MuiOutlinedInput-root': { borderRadius: 0, '& fieldset': { border: `2px solid ${COLORS.danger}` } },
                '& .MuiInputLabel-root': { color: COLORS.danger, fontWeight: 'bold' },
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: `2px solid ${COLORS.brand}`, bgcolor: COLORS.cream, justifyContent: 'space-between' }}>
          <Button onClick={() => setEditExpense(null)} sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.accent, border: `2px solid ${COLORS.accent}`, borderRadius: 0, px: 3, '&:hover': { bgcolor: COLORS.surfaceHover } }}>
            CANCEL
          </Button>
          <Button onClick={handleEditSave} variant="contained" sx={{ fontWeight: TYPE.label.fontWeight, px: 4, py: 1.5, borderRadius: 0, bgcolor: COLORS.danger, border: `2px solid ${COLORS.ctaHover}`, boxShadow: `4px 4px 0px ${COLORS.brand}`, '&:hover': { bgcolor: COLORS.ctaHover } }}>
            SAVE CHANGES
          </Button>
        </DialogActions>
      </Dialog>

      {/* TOAST NOTIFICATIONS */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} sx={{ width: '100%', fontFamily: FONT, fontWeight: 'bold', boxShadow: 3 }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}
