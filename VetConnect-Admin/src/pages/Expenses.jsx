import React, { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { DataGrid } from '@mui/x-data-grid';
import {
  Box, Typography, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, Button, TextField, InputAdornment, MenuItem, Alert, Chip,
  Skeleton, Snackbar, Paper, Table, TableHead, TableRow, TableCell,
  TableBody, Collapse, Switch, FormControlLabel, Tooltip, LinearProgress,
} from '@mui/material';
import {
  collection, query, orderBy, onSnapshot, doc, addDoc, updateDoc,
  Timestamp, where, writeBatch, getDocs, deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useUser } from '../context/UserContext';
import { COLORS, TYPE, FONT, PANEL } from '../theme/designTokens';
import { openPrintWindow, PRINT_STYLES, esc } from '../utils/printUtils';

import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PrintIcon from '@mui/icons-material/Print';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Utilities',    monthlyBudget: 0, isDefault: true },
  { name: 'Payroll',      monthlyBudget: 0, isDefault: true },
  { name: 'Supplies',     monthlyBudget: 0, isDefault: true },
  { name: 'Maintenance',  monthlyBudget: 0, isDefault: true },
  { name: 'Refunds',      monthlyBudget: 0, isDefault: true },
  { name: 'Other',        monthlyBudget: 0, isDefault: true },
];

const QUICK_RANGES = [
  { key: 'today',   label: 'TODAY' },
  { key: 'week',    label: 'THIS WEEK' },
  { key: 'month',   label: 'THIS MONTH' },
  { key: 'quarter', label: 'THIS QUARTER' },
];

const SHARED_FIELD_SX = {
  bgcolor: COLORS.cardBg,
  '& .MuiOutlinedInput-root': {
    borderRadius: 0,
    '& fieldset': { border: `2px solid ${COLORS.accent}` },
    '&:hover fieldset': { borderColor: COLORS.brand },
    '&.Mui-focused fieldset': { borderColor: COLORS.accent },
  },
  '& .MuiInputLabel-root': { color: COLORS.accent, fontWeight: 'bold' },
};

const DANGER_FIELD_SX = {
  bgcolor: COLORS.cardBg,
  '& .MuiOutlinedInput-root': {
    borderRadius: 0,
    '& fieldset': { border: `2px solid ${COLORS.danger}` },
    '&:hover fieldset': { borderColor: COLORS.dangerHover },
    '&.Mui-focused fieldset': { borderColor: COLORS.danger },
  },
  '& .MuiInputLabel-root': { color: COLORS.danger, fontWeight: 'bold' },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Returns today's date as 'YYYY-MM-DD' in Manila timezone. */
function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Manila' });
}

/** Returns the first day of the current month as 'YYYY-MM-DD' in Manila timezone. */
function firstOfMonthStr() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('sv-SE', { timeZone: 'Asia/Manila' });
}

/** Builds Manila-timezone Firestore Timestamps from a date string pair. */
function toRangeTimestamps(startDate, endDate) {
  return {
    rangeStart: Timestamp.fromDate(new Date(startDate + 'T00:00:00+08:00')),
    rangeEnd:   Timestamp.fromDate(new Date(endDate   + 'T23:59:59.999+08:00')),
  };
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function Expenses() {
  const { user, profile } = useUser();
  const location = useLocation();

  // ── Core data ──
  const [expenses, setExpenses] = useState([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // ── Date range (Fix 2) ──
  const [activeRange, setActiveRange] = useState('month');
  const [startDate, setStartDate] = useState(firstOfMonthStr);
  const [endDate,   setEndDate]   = useState(todayStr);

  // ── Category filter ──
  const [filterCategory, setFilterCategory] = useState('All');

  // ── Dynamic categories (Fix 4) ──
  const [expenseCategories,    setExpenseCategories]    = useState([]);
  const [catManagerOpen,       setCatManagerOpen]       = useState(false);
  const [newCatName,           setNewCatName]           = useState('');
  const [newCatBudget,         setNewCatBudget]         = useState('');
  const [editCat,              setEditCat]              = useState(null);
  const [confirmDeleteCat,     setConfirmDeleteCat]     = useState({ open: false, id: null, name: '' });

  // ── Add / Edit expense ──
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    category: '', description: '', amount: '', expenseDate: '', isRecurring: false,
  });
  const [editExpense, setEditExpense] = useState(null);

  // ── Delete expense ──
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null });

  // ── Budget panel (Fix 5) ──
  const [budgetPanelOpen, setBudgetPanelOpen] = useState(true);

  // ── Recurring repeat (Fix 6) ──
  const [repeatDialogOpen,  setRepeatDialogOpen]  = useState(false);
  const [repeatItems,       setRepeatItems]       = useState([]);
  const [repeatLoading,     setRepeatLoading]     = useState(false);
  const [alreadyRepeated,   setAlreadyRepeated]   = useState(false);

  // ── Toast ──
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') =>
    setToast({ open: true, message, severity });

  // ─── Location-based dashboard filter ─────────────────────────────────────
  useEffect(() => {
    const df = location.state?.dashboardFilter;
    if (!df) return;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Expense categories listener (Fix 4) ──────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'expense_categories'), async (snap) => {
      if (snap.empty) {
        // Auto-seed defaults on first open. addDoc generates unique IDs,
        // so concurrent opens are safe — each will create distinct docs.
        const batch = writeBatch(db);
        DEFAULT_EXPENSE_CATEGORIES.forEach(cat => {
          const ref = doc(collection(db, 'expense_categories'));
          batch.set(ref, { ...cat, createdAt: Timestamp.now() });
        });
        await batch.commit();
        // onSnapshot will re-fire with the seeded docs
        return;
      }
      setExpenseCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // ─── Expenses listener (Fix 2: date range) ────────────────────────────────
  useEffect(() => {
    setIsInitialLoad(true);
    const { rangeStart, rangeEnd } = toRangeTimestamps(startDate, endDate);

    const q = query(
      collection(db, 'expenses'),
      where('date', '>=', rangeStart),
      where('date', '<=', rangeEnd),
      orderBy('date', 'desc'),
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
              year:    'numeric',
              month:   'short',
              day:     'numeric',
              hour:    '2-digit',
              minute:  '2-digit',
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
  }, [startDate, endDate]);

  // ─── Quick range chip handler (Fix 2) ────────────────────────────────────
  const applyRange = (range) => {
    setActiveRange(range);
    const manila = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const today = todayStr();
    const fmtDate = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Manila' });

    if (range === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (range === 'week') {
      const dayOfWeek = manila.getDay();
      const monday = new Date(manila);
      monday.setDate(manila.getDate() - ((dayOfWeek + 6) % 7));
      setStartDate(fmtDate(monday));
      setEndDate(today);
    } else if (range === 'month') {
      setStartDate(fmtDate(new Date(manila.getFullYear(), manila.getMonth(), 1)));
      setEndDate(today);
    } else if (range === 'quarter') {
      const qMonth = Math.floor(manila.getMonth() / 3) * 3;
      setStartDate(fmtDate(new Date(manila.getFullYear(), qMonth, 1)));
      setEndDate(today);
    }
  };

  // ─── Filtered expenses ────────────────────────────────────────────────────
  const filteredExpenses = useMemo(() => {
    if (filterCategory === 'All') return expenses;
    return expenses.filter(e => e.category === filterCategory);
  }, [expenses, filterCategory]);

  // ─── Analytics (Fix 3) ───────────────────────────────────────────────────
  const analytics = useMemo(() => {
    const periodTotal = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    const categories = expenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {});

    const catKeys     = Object.keys(categories);
    const topCategory = catKeys.length === 0
      ? 'N/A'
      : catKeys.reduce((a, b) => categories[a] >= categories[b] ? a : b);

    const start       = new Date(startDate);
    const end         = new Date(endDate);
    const daysInRange = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
    const dailyAverage = periodTotal / daysInRange;

    return { periodTotal, dailyAverage, topCategory, entryCount: expenses.length, daysInRange };
  }, [expenses, startDate, endDate]);

  // ─── Budget status KPI (Fix 3) ───────────────────────────────────────────
  const budgetStatus = useMemo(() => {
    const totalMonthlyBudget = expenseCategories
      .reduce((sum, c) => sum + (c.monthlyBudget || 0), 0);
    if (totalMonthlyBudget === 0) return { spend: 0, budget: 0, pct: 0, configured: false };

    const daysInMonth    = 30.44;
    const daysInRange    = analytics.daysInRange;
    const proRatedBudget = totalMonthlyBudget * (daysInRange / daysInMonth);
    const spend          = analytics.periodTotal;
    const pct            = Math.round((spend / proRatedBudget) * 100);

    return { spend, budget: Math.round(proRatedBudget), pct, configured: true };
  }, [expenseCategories, analytics]);

  // ─── Per-category budget data (Fix 5) ────────────────────────────────────
  const categoryBudgets = useMemo(() => {
    const daysInMonth    = 30.44;
    const proRateFactor  = analytics.daysInRange / daysInMonth;

    const spendByCategory = {};
    expenses.forEach(e => {
      spendByCategory[e.category] = (spendByCategory[e.category] || 0) + (e.amount || 0);
    });

    return expenseCategories
      .filter(c => (c.monthlyBudget || 0) > 0)
      .map(c => {
        const proRatedBudget = c.monthlyBudget * proRateFactor;
        const spend          = spendByCategory[c.name] || 0;
        const pct            = proRatedBudget > 0
          ? Math.round((spend / proRatedBudget) * 100)
          : 0;
        const color = pct < 75 ? COLORS.success : pct < 90 ? COLORS.warning : COLORS.danger;
        return { name: c.name, spend, budget: Math.round(proRatedBudget), pct, color };
      });
  }, [expenses, expenseCategories, analytics.daysInRange]);

  // ─── Add expense ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!user?.uid) { showToast('You must be signed in to log expenses.', 'error'); return; }
    if (!formData.description.trim()) { showToast('Description is required.', 'error'); return; }

    const parsedAmount = parseFloat(formData.amount);
    if (!isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast('Amount must be a positive number.', 'error');
      return;
    }

    try {
      const { expenseDate, ...cleanData } = formData;
      await addDoc(collection(db, 'expenses'), {
        ...cleanData,
        amount:       parsedAmount,
        isRecurring:  formData.isRecurring || false,
        date:         expenseDate
          ? Timestamp.fromDate(new Date(expenseDate + 'T04:00:00Z'))
          : Timestamp.now(),
        loggedBy:     profile?.fullName || 'Unknown',
        loggedByUid:  user?.uid || null,
      });
      setOpen(false);
      setFormData({
        category: expenseCategories[0]?.name || 'Other',
        description: '', amount: '', expenseDate: '', isRecurring: false,
      });
    } catch (error) {
      console.error('[Expenses] Save error:', error);
      showToast('Failed to save expense: ' + error.message, 'error');
    }
  };

  // ─── Delete expense ───────────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!confirmDelete.id) return;
    try {
      await updateDoc(doc(db, 'expenses', confirmDelete.id), {
        deletedAt:     Timestamp.now(),
        deletedBy:     profile?.fullName || 'Unknown',
        deletedByUid:  user?.uid || null,
        updatedByUid:  user?.uid || null,
      });
      showToast('Expense deleted.', 'success');
    } catch (error) {
      console.error('[Expenses] Delete error:', error);
      showToast('Failed to delete expense: ' + error.message, 'error');
    } finally {
      setConfirmDelete({ open: false, id: null });
    }
  };

  // ─── Edit expense ─────────────────────────────────────────────────────────
  const handleEditSave = async () => {
    if (!editExpense) return;
    if (!user?.uid) { showToast('You must be signed in to edit expenses.', 'error'); return; }
    const live = expenses.find(e => e.id === editExpense.id);
    if (!live) { showToast('This expense has been deleted.', 'error'); setEditExpense(null); return; }
    if (!editExpense.description.trim()) { showToast('Description is required.', 'error'); return; }

    const parsedAmount = parseFloat(editExpense.amount);
    if (!isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast('Amount must be a positive number.', 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'expenses', editExpense.id), {
        category:    editExpense.category,
        description: editExpense.description.trim(),
        amount:      parsedAmount,
        isRecurring: editExpense.isRecurring || false,
        updatedAt:   Timestamp.now(),
        updatedBy:   profile?.fullName || 'Unknown',
        updatedByUid: user?.uid || null,
      });
      showToast('Expense updated.', 'success');
      setEditExpense(null);
    } catch (error) {
      console.error('[Expenses] Edit error:', error);
      showToast('Failed to update: ' + error.message, 'error');
    }
  };

  // ─── Category manager handlers (Fix 4) ───────────────────────────────────
  const handleAddCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) { showToast('Category name is required.', 'error'); return; }
    const isDuplicate = expenseCategories.some(
      c => c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) { showToast('A category with that name already exists.', 'error'); return; }

    try {
      await addDoc(collection(db, 'expense_categories'), {
        name:          trimmed,
        monthlyBudget: parseFloat(newCatBudget) || 0,
        isDefault:     false,
        createdAt:     Timestamp.now(),
      });
      setNewCatName('');
      setNewCatBudget('');
    } catch (error) {
      console.error('[Expenses] Add category error:', error);
      showToast('Failed to add category: ' + error.message, 'error');
    }
  };

  const handleEditCategory = async () => {
    if (!editCat) return;
    const trimmed = editCat.name.trim();
    if (!trimmed) { showToast('Category name is required.', 'error'); return; }

    try {
      await updateDoc(doc(db, 'expense_categories', editCat.id), {
        name:          trimmed,
        monthlyBudget: parseFloat(editCat.monthlyBudget) || 0,
      });
      setEditCat(null);
    } catch (error) {
      console.error('[Expenses] Edit category error:', error);
      showToast('Failed to update category: ' + error.message, 'error');
    }
  };

  const handleDeleteCategory = async () => {
    const { id } = confirmDeleteCat;
    if (!id) return;

    const hasExpenses = expenses.some(e => e.category === confirmDeleteCat.name);
    if (hasExpenses) {
      showToast(
        `Cannot delete "${confirmDeleteCat.name}" — it has expenses in the current period. ` +
        'Change those expenses to another category first.',
        'warning',
      );
      setConfirmDeleteCat({ open: false, id: null, name: '' });
      return;
    }

    try {
      await deleteDoc(doc(db, 'expense_categories', id));
      showToast('Category deleted.', 'success');
    } catch (error) {
      console.error('[Expenses] Delete category error:', error);
      showToast('Failed to delete category: ' + error.message, 'error');
    } finally {
      setConfirmDeleteCat({ open: false, id: null, name: '' });
    }
  };

  // ─── Repeat last month (Fix 6) ────────────────────────────────────────────
  const handleOpenRepeatDialog = async () => {
    setRepeatLoading(true);
    try {
      const now           = new Date();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(),   0, 23, 59, 59, 999);

      const startTS = Timestamp.fromDate(
        new Date(lastMonthStart.toISOString().split('T')[0] + 'T00:00:00+08:00')
      );
      const endTS = Timestamp.fromDate(
        new Date(lastMonthEnd.toISOString().split('T')[0] + 'T23:59:59.999+08:00')
      );

      // Fetch all last-month expenses then filter isRecurring client-side
      // to avoid a composite Firestore index requirement.
      const q    = query(
        collection(db, 'expenses'),
        where('date', '>=', startTS),
        where('date', '<=', endTS),
        orderBy('date', 'desc'),
      );
      const snap = await getDocs(q);
      const items = snap.docs
        .filter(d => !d.data().deletedAt && d.data().isRecurring)
        .map(d => ({ id: d.id, ...d.data() }));

      // Idempotency: check if any of these were already repeated this month
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisMonthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      const thisStartTS = Timestamp.fromDate(
        new Date(thisMonthStart.toISOString().split('T')[0] + 'T00:00:00+08:00')
      );
      const thisEndTS = Timestamp.fromDate(
        new Date(thisMonthEnd.toISOString().split('T')[0] + 'T23:59:59.999+08:00')
      );

      const existingQ    = query(
        collection(db, 'expenses'),
        where('date', '>=', thisStartTS),
        where('date', '<=', thisEndTS),
        orderBy('date', 'desc'),
      );
      const existingSnap = await getDocs(existingQ);
      const existingSourceIds = new Set(
        existingSnap.docs.map(d => d.data().sourceExpenseId).filter(Boolean)
      );

      const unrepeated = items.filter(item => !existingSourceIds.has(item.id));
      setRepeatItems(unrepeated);
      setAlreadyRepeated(unrepeated.length === 0 && items.length > 0);
      setRepeatDialogOpen(true);
    } catch (error) {
      console.error('[Expenses] Repeat query error:', error);
      showToast('Failed to load recurring expenses: ' + error.message, 'error');
    } finally {
      setRepeatLoading(false);
    }
  };

  const handleConfirmRepeat = async () => {
    if (repeatItems.length === 0) return;
    setRepeatLoading(true);
    try {
      const batch = writeBatch(db);
      repeatItems.forEach(item => {
        const ref = doc(collection(db, 'expenses'));
        batch.set(ref, {
          category:         item.category,
          description:      item.description,
          amount:           item.amount,
          isRecurring:      true,
          date:             Timestamp.now(),
          loggedBy:         'System (Repeat)',
          loggedByUid:      user?.uid || null,
          sourceExpenseId:  item.id,
        });
      });
      await batch.commit();
      showToast(
        `${repeatItems.length} recurring expense${repeatItems.length > 1 ? 's' : ''} copied to this month.`
      );
      setRepeatDialogOpen(false);
    } catch (error) {
      console.error('[Expenses] Repeat error:', error);
      showToast('Failed to repeat expenses: ' + error.message, 'error');
    } finally {
      setRepeatLoading(false);
    }
  };

  // ─── Export CSV (Fix 7) ───────────────────────────────────────────────────
  const handleExportCSV = () => {
    const headers = ['Date', 'Category', 'Description', 'Amount', 'Logged By', 'Recurring'];
    const escapeCell = (val) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n'))
        return `"${str.replace(/"/g, '""')}"`;
      return str;
    };
    const rows = filteredExpenses.map(e => [
      e.displayDate || '',
      e.category    || '',
      e.description || '',
      (e.amount || 0).toFixed(2),
      e.loggedBy    || '',
      e.isRecurring ? 'Yes' : 'No',
    ].map(escapeCell).join(','));

    const csvBody = [headers.join(','), ...rows].join('\n');
    const blob    = new Blob(['﻿' + csvBody], { type: 'text/csv;charset=utf-8;' });
    const url     = URL.createObjectURL(blob);
    const anchor  = document.createElement('a');
    anchor.href     = url;
    anchor.download = `expenses_${startDate}_to_${endDate}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // ─── Print report (Fix 7) ─────────────────────────────────────────────────
  const handlePrintReport = () => {
    const grouped = {};
    filteredExpenses.forEach(e => {
      if (!grouped[e.category]) grouped[e.category] = [];
      grouped[e.category].push(e);
    });

    const categoryRows = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, items]) => {
        const catTotal  = items.reduce((sum, e) => sum + (e.amount || 0), 0);
        const itemRows  = items.map(e => `
          <tr>
            <td>${esc(e.displayDate)}</td>
            <td>${esc(e.description)}</td>
            <td style="text-align:right;">₱${(e.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td>${esc(e.loggedBy)}</td>
          </tr>
        `).join('');
        return `
          <h2>${esc(cat)}</h2>
          <table>
            <thead><tr><th>Date</th><th>Description</th><th style="text-align:right;">Amount</th><th>Logged By</th></tr></thead>
            <tbody>${itemRows}</tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="font-weight:800; text-align:right; border-top:2px solid #5D4037;">SUBTOTAL</td>
                <td style="font-weight:800; text-align:right; border-top:2px solid #5D4037;">₱${catTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style="border-top:2px solid #5D4037;"></td>
              </tr>
            </tfoot>
          </table>
        `;
      }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Expense Report</title><style>${PRINT_STYLES}</style></head><body>
      <div class="clinic-header">
        <p class="clinic-name">VetConnect Expense Report</p>
        <p class="clinic-address">${esc(startDate)} to ${esc(endDate)}</p>
      </div>
      <div class="doc-title">EXPENSE SUMMARY</div>
      <div class="info-grid">
        <span class="label">Period Total:</span>
        <span class="value">₱${analytics.periodTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        <span></span>
        <span class="label">Daily Average:</span>
        <span class="value">₱${analytics.dailyAverage.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        <span></span>
        <span class="label">Entries:</span>
        <span class="value">${analytics.entryCount}</span>
        <span></span>
      </div>
      ${categoryRows}
      <div style="margin-top:20px; border-top:3px solid #3E2723; padding-top:10px;">
        <p style="font-size:16px; font-weight:900; text-align:right; color:#3E2723;">
          GRAND TOTAL: ₱${analytics.periodTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </p>
      </div>
      <div class="footer">Generated on ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} by VetConnect</div>
    </body></html>`;

    openPrintWindow(html, () => showToast('Pop-up blocked. Please allow pop-ups.', 'warning'));
  };

  // ─── DataGrid columns (Fix 8) ─────────────────────────────────────────────
  const columns = [
    {
      field: 'displayDate', headerName: 'DATE LOGGED', width: 160,
      renderCell: (p) => (
        <Typography variant="body2" sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.brand }}>
          {p.value}
        </Typography>
      ),
    },
    {
      field: 'category', headerName: 'CATEGORY', width: 140,
      renderCell: (p) => (
        <Chip
          label={p.value} size="small"
          sx={{
            borderRadius: 0,
            bgcolor: COLORS.cream,
            color: COLORS.accent,
            border: `1px solid ${COLORS.accent}`,
            fontWeight: TYPE.label.fontWeight,
            textTransform: 'uppercase',
            fontSize: '0.65rem',
          }}
        />
      ),
    },
    {
      field: 'description', headerName: 'DESCRIPTION', flex: 1, minWidth: 120,
      renderCell: (p) => (
        <Typography variant="body2" sx={{ fontWeight: TYPE.bodyBold.fontWeight, color: COLORS.accent }}>
          {p.value}
        </Typography>
      ),
    },
    {
      field: 'amount', headerName: 'AMOUNT', width: 140, align: 'right', headerAlign: 'right',
      renderCell: (p) => (
        <Typography sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.danger, fontSize: '1.1rem', letterSpacing: 0.5 }}>
          - ₱{p.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Typography>
      ),
    },
    {
      field: 'loggedBy', headerName: 'LOGGED BY', width: 140,
      renderCell: (p) => (
        <Typography variant="body2" sx={{ ...TYPE.meta, color: COLORS.textSecondary }}>
          {p.value || '—'}
        </Typography>
      ),
    },
    {
      field: 'updatedAt', headerName: 'UPDATED', width: 160,
      renderCell: (p) => {
        if (!p.row.updatedAt) return null;
        const raw  = p.row.updatedAt;
        const date = raw?.toDate
          ? raw.toDate()
          : raw?.seconds
            ? new Date(raw.seconds * 1000)
            : null;
        const dateStr = date
          ? date.toLocaleString('en-PH', {
              timeZone: 'Asia/Manila',
              month:  'short',
              day:    'numeric',
              hour:   '2-digit',
              minute: '2-digit',
            })
          : '';
        return (
          <Box>
            <Typography variant="body2" sx={{ ...TYPE.tiny, color: COLORS.textMuted }}>
              {dateStr}
            </Typography>
            <Typography variant="body2" sx={{ ...TYPE.tiny, color: COLORS.textSecondary }}>
              {p.row.updatedBy || ''}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'actions', headerName: '', width: 100, align: 'center', sortable: false,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            onClick={() => setEditExpense({
              id:          p.row.id,
              category:    p.row.category,
              description: p.row.description,
              amount:      String(p.row.amount),
              isRecurring: p.row.isRecurring || false,
            })}
            sx={{
              color:   COLORS.accent,
              border:  `2px solid ${COLORS.border}`,
              borderRadius: 0,
              '&:hover': { bgcolor: COLORS.surfaceHover, border: `2px solid ${COLORS.accent}` },
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            onClick={() => setConfirmDelete({ open: true, id: p.row.id })}
            sx={{
              color:   COLORS.dangerHover,
              border:  `2px solid ${COLORS.danger}`,
              borderRadius: 0,
              '&:hover': { bgcolor: COLORS.dangerSurface, border: `2px solid ${COLORS.danger}` },
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  // ─── Derived label helpers ────────────────────────────────────────────────
  const lastMonthLabel = (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - 1, 1)
      .toLocaleString('en-PH', { month: 'long', year: 'numeric' });
  })();

  const thisMonthLabel = (() => {
    return new Date().toLocaleString('en-PH', { month: 'long', year: 'numeric' });
  })();

  const budgetStatusColor = budgetStatus.configured
    ? (budgetStatus.pct < 75 ? COLORS.success : budgetStatus.pct < 90 ? COLORS.warning : COLORS.danger)
    : COLORS.textMuted;

  // ─── Open dialog default category ────────────────────────────────────────
  const openAddDialog = () => {
    setFormData({
      category:    expenseCategories[0]?.name || 'Other',
      description: '',
      amount:      '',
      expenseDate: '',
      isRecurring: false,
    });
    setOpen(true);
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', m: 0, overflow: 'hidden', bgcolor: COLORS.formBg }}>

      {/* ── HEADER (Fix 1): two-row layout ── */}
      <Paper
        elevation={0}
        sx={{
          flexShrink:   0,
          bgcolor:      COLORS.cream,
          borderBottom: `2px solid ${COLORS.accent}`,
          borderRadius: 0,
          p:  2.5,
          px: 4,
          display:       'flex',
          flexDirection: 'column',
          gap:           1.5,
        }}
      >
        {/* Row 1: Title + action buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Typography
            variant="h4"
            sx={{
              fontFamily:    FONT,
              fontWeight:    1000,
              color:         COLORS.brand,
              textTransform: 'uppercase',
              letterSpacing: 1,
              fontSize:      '1.5rem',
              lineHeight:    1,
            }}
          >
            EXPENSES
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openAddDialog}
              sx={{
                fontWeight:  TYPE.label.fontWeight,
                px:          3,
                py:          1,
                borderRadius: 0,
                bgcolor:     COLORS.sky,
                border:      `2px solid ${COLORS.skyHover}`,
                boxShadow:   `4px 4px 0px ${COLORS.skyHover}`,
                fontFamily:  FONT,
                '&:hover':   { bgcolor: COLORS.skyHover, boxShadow: `2px 2px 0px ${COLORS.skyHover}` },
              }}
            >
              LOG EXPENSE
            </Button>

            <Button
              variant="outlined"
              startIcon={<HistoryIcon />}
              onClick={handleOpenRepeatDialog}
              disabled={repeatLoading}
              sx={{
                fontWeight:  TYPE.label.fontWeight,
                px:          2,
                py:          1,
                borderRadius: 0,
                border:      `2px solid ${COLORS.accent}`,
                color:       COLORS.accent,
                '&:hover':   { bgcolor: COLORS.panelBg },
              }}
            >
              REPEAT LAST MONTH
            </Button>

            <Button
              variant="outlined"
              startIcon={<FileDownloadIcon />}
              onClick={handleExportCSV}
              sx={{
                fontWeight:  TYPE.label.fontWeight,
                px:          2,
                py:          1,
                borderRadius: 0,
                border:      `2px solid ${COLORS.accent}`,
                color:       COLORS.accent,
                '&:hover':   { bgcolor: COLORS.panelBg },
              }}
            >
              EXPORT CSV
            </Button>

            <Tooltip title="Print Report">
              <IconButton
                onClick={handlePrintReport}
                sx={{
                  bgcolor:      COLORS.cardBg,
                  border:       `1px solid ${COLORS.accent}44`,
                  color:        COLORS.accent,
                  borderRadius: 0,
                  '&:hover':    { bgcolor: COLORS.panelBg },
                }}
              >
                <PrintIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Row 2: Date range + quick chips + category filter + count */}
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <TextField
            type="date" size="small"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setActiveRange('custom'); }}
            sx={{ width: 160, bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { borderRadius: 0, '& fieldset': { border: `2px solid ${COLORS.accent}` } }, '& .MuiInputBase-input': { ...TYPE.label, py: 0.5 } }}
          />
          <Typography sx={{ ...TYPE.label, color: COLORS.textMuted }}>TO</Typography>
          <TextField
            type="date" size="small"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setActiveRange('custom'); }}
            sx={{ width: 160, bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-root': { borderRadius: 0, '& fieldset': { border: `2px solid ${COLORS.accent}` } }, '& .MuiInputBase-input': { ...TYPE.label, py: 0.5 } }}
          />

          {QUICK_RANGES.map(({ key, label }) => (
            <Chip
              key={key}
              label={label}
              size="small"
              onClick={() => applyRange(key)}
              sx={{
                borderRadius: 0,
                border:       `2px solid ${COLORS.accent}`,
                bgcolor:      activeRange === key ? COLORS.accent  : COLORS.cardBg,
                color:        activeRange === key ? COLORS.cardBg  : COLORS.accent,
                fontWeight:   TYPE.label.fontWeight,
                fontSize:     '0.65rem',
                letterSpacing: '0.06em',
                cursor:       'pointer',
                '&:hover':    { bgcolor: activeRange === key ? COLORS.brand : COLORS.panelBg },
              }}
            />
          ))}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
            <Typography variant="caption" sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.accent, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Category:
            </Typography>
            {['All', ...expenseCategories.map(c => c.name)].map(cat => (
              <Chip
                key={cat}
                label={cat}
                size="small"
                onClick={() => setFilterCategory(cat)}
                sx={{
                  borderRadius: 0,
                  border:       `2px solid ${COLORS.accent}`,
                  bgcolor:      filterCategory === cat ? COLORS.accent : COLORS.cardBg,
                  color:        filterCategory === cat ? COLORS.cardBg : COLORS.accent,
                  fontWeight:   TYPE.label.fontWeight,
                  fontSize:     '0.65rem',
                  cursor:       'pointer',
                  '&:hover':    { bgcolor: filterCategory === cat ? COLORS.brand : COLORS.panelBg },
                }}
              />
            ))}
            <Tooltip title="Manage Categories">
              <IconButton
                size="small"
                onClick={() => setCatManagerOpen(true)}
                sx={{ color: COLORS.accent, borderRadius: 0, '&:hover': { bgcolor: COLORS.panelBg } }}
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Chip
              label={`${filteredExpenses.length} records`}
              size="small"
              sx={{
                borderRadius: 0,
                bgcolor:      COLORS.panelBg,
                color:        COLORS.textSecondary,
                fontWeight:   TYPE.label.fontWeight,
                fontSize:     '0.65rem',
              }}
            />
          </Box>
        </Box>
      </Paper>

      {/* ── KPI STRIP (Fix 3): 5 KPIs ── */}
      <Box sx={{ flexShrink: 0, display: 'flex', borderBottom: `2px solid ${COLORS.accent}`, bgcolor: COLORS.cardBg }}>
        {/* PERIOD TOTAL */}
        <Box sx={{ flex: 1, p: 2, borderRight: `1px solid ${COLORS.borderLight}`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="overline" sx={{ color: COLORS.textSecondary, fontWeight: TYPE.label.fontWeight, fontSize: '0.65rem' }}>
            Period Total
          </Typography>
          {isInitialLoad ? (
            <Skeleton variant="text" width="60%" height={32} sx={{ bgcolor: COLORS.kpiRedBg }} />
          ) : (
            <Typography variant="h5" sx={{ color: COLORS.danger, fontWeight: TYPE.label.fontWeight }}>
              ₱{analytics.periodTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </Typography>
          )}
        </Box>

        {/* DAILY AVERAGE */}
        <Box sx={{ flex: 1, p: 2, borderRight: `1px solid ${COLORS.borderLight}`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="overline" sx={{ color: COLORS.textSecondary, fontWeight: TYPE.label.fontWeight, fontSize: '0.65rem' }}>
            Daily Average
          </Typography>
          {isInitialLoad ? (
            <Skeleton variant="text" width="60%" height={32} sx={{ bgcolor: COLORS.kpiBlueBg }} />
          ) : (
            <Typography variant="h5" sx={{ color: COLORS.accent, fontWeight: TYPE.label.fontWeight }}>
              ₱{analytics.dailyAverage.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Typography>
          )}
        </Box>

        {/* TOP CATEGORY */}
        <Box sx={{ flex: 1, p: 2, borderRight: `1px solid ${COLORS.borderLight}`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="overline" sx={{ color: COLORS.textSecondary, fontWeight: TYPE.label.fontWeight, fontSize: '0.65rem' }}>
            Top Spend Category
          </Typography>
          {isInitialLoad ? (
            <Skeleton variant="text" width="60%" height={32} sx={{ bgcolor: COLORS.panelBg }} />
          ) : (
            <Typography variant="h5" sx={{ color: COLORS.brand, fontWeight: TYPE.label.fontWeight, textTransform: 'uppercase' }}>
              {analytics.topCategory}
            </Typography>
          )}
        </Box>

        {/* ENTRIES */}
        <Box sx={{ flex: 1, p: 2, borderRight: `1px solid ${COLORS.borderLight}`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="overline" sx={{ color: COLORS.textSecondary, fontWeight: TYPE.label.fontWeight, fontSize: '0.65rem' }}>
            Entries
          </Typography>
          {isInitialLoad ? (
            <Skeleton variant="text" width="60%" height={32} sx={{ bgcolor: COLORS.kpiRedBg }} />
          ) : (
            <Typography variant="h5" sx={{ color: COLORS.accent, fontWeight: TYPE.label.fontWeight }}>
              {analytics.entryCount}
            </Typography>
          )}
        </Box>

        {/* BUDGET STATUS */}
        <Box sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="overline" sx={{ color: COLORS.textSecondary, fontWeight: TYPE.label.fontWeight, fontSize: '0.65rem' }}>
            Budget Status
          </Typography>
          {isInitialLoad ? (
            <Skeleton variant="text" width="60%" height={32} sx={{ bgcolor: COLORS.kpiGreenBg }} />
          ) : budgetStatus.configured ? (
            <Typography variant="h5" sx={{ color: budgetStatusColor, fontWeight: TYPE.label.fontWeight, fontSize: '1rem', textAlign: 'center' }}>
              ₱{budgetStatus.spend.toLocaleString()} / ₱{budgetStatus.budget.toLocaleString()} · {budgetStatus.pct}%
            </Typography>
          ) : (
            <Typography variant="h5" sx={{ color: COLORS.textMuted, fontWeight: TYPE.label.fontWeight, fontSize: '0.85rem', textAlign: 'center' }}>
              N/A — Set budgets
            </Typography>
          )}
        </Box>
      </Box>

      {/* ── BUDGET PROGRESS PANEL (Fix 5) ── */}
      {categoryBudgets.length > 0 && (
        <Box sx={{ flexShrink: 0, bgcolor: COLORS.cardBg, borderBottom: `2px solid ${COLORS.accent}` }}>
          <Box
            onClick={() => setBudgetPanelOpen(prev => !prev)}
            sx={{ p: 1, px: 3, display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 1 }}
          >
            <Typography sx={{ ...TYPE.label, color: COLORS.accent }}>BUDGET STATUS</Typography>
            <Typography sx={{ ...TYPE.tiny, color: COLORS.textMuted }}>
              {budgetPanelOpen ? '▾' : '▸'}
            </Typography>
          </Box>
          <Collapse in={budgetPanelOpen}>
            <Box sx={{ px: 3, pb: 2, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {categoryBudgets.map(cb => (
                <Box key={cb.name} sx={{ minWidth: 200, flex: '1 1 220px', maxWidth: 300 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography sx={{ ...TYPE.tiny, fontWeight: 800, color: COLORS.accent, textTransform: 'uppercase' }}>
                      {cb.name}
                    </Typography>
                    <Typography sx={{ ...TYPE.tiny, color: cb.color, fontWeight: 800 }}>
                      {cb.pct}%
                    </Typography>
                  </Box>
                  <Box sx={{ height: 8, bgcolor: COLORS.borderLight, borderRadius: 0, overflow: 'hidden' }}>
                    <Box sx={{
                      height:     '100%',
                      width:      `${Math.min(cb.pct, 100)}%`,
                      bgcolor:    cb.color,
                      transition: 'width 0.3s ease',
                    }} />
                  </Box>
                  <Typography sx={{ ...TYPE.tiny, color: COLORS.textMuted, mt: 0.5 }}>
                    ₱{cb.spend.toLocaleString()} / ₱{cb.budget.toLocaleString()}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}

      {/* ── DATA GRID ── */}
      <Box sx={{ flexGrow: 1, minHeight: 0, width: '100%', overflow: 'hidden', p: 0 }}>
        <DataGrid
          rows={filteredExpenses}
          columns={columns}
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
            sorting:    { sortModel: [{ field: 'displayDate', sort: 'desc' }] },
          }}
          sx={{
            border:       'none',
            borderRadius: 0,
            bgcolor:      'transparent',
            '& .MuiDataGrid-columnHeaders': {
              bgcolor:       `${COLORS.panelBg} !important`,
              color:         COLORS.brand,
              fontWeight:    `${TYPE.label.fontWeight} !important`,
              borderBottom:  `2px solid ${COLORS.accent}`,
              textTransform: 'uppercase',
              fontSize:      '0.75rem',
              letterSpacing: 1.5,
              borderRadius:  0,
            },
            '& .MuiDataGrid-columnSeparator': { display: 'none' },
            '& .MuiDataGrid-cell': {
              display:     'flex',
              alignItems:  'center',
              borderBottom: `1px solid ${COLORS.borderLight}`,
              fontFamily:   FONT,
              fontWeight:   '500',
            },
            '& .MuiDataGrid-row:hover': { bgcolor: COLORS.surfaceHover },
            '& .MuiDataGrid-virtualScroller': {
              '&::-webkit-scrollbar':        { width: '10px', height: '10px' },
              '&::-webkit-scrollbar-track':  { background: COLORS.tableHeaderBg },
              '&::-webkit-scrollbar-thumb':  { background: COLORS.accent, borderRadius: 0 },
              '&::-webkit-scrollbar-thumb:hover': { background: COLORS.brand },
            },
          }}
        />
      </Box>

      {/* ═══════════════════════════════════════
          DIALOGS
      ═══════════════════════════════════════ */}

      {/* ── LOG EXPENSE DIALOG ── */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { ...PANEL.card, boxShadow: `8px 8px 0px ${COLORS.brand}` } }}
      >
        <DialogTitle sx={{
          bgcolor:       COLORS.cream,
          color:         COLORS.brand,
          fontWeight:    TYPE.label.fontWeight,
          borderBottom:  `2px solid ${COLORS.brand}`,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          fontSize:      '1.1rem',
          display:       'flex',
          alignItems:    'center',
          gap:           1.5,
        }}>
          <MoneyOffIcon sx={{ color: COLORS.danger }} />
          Log Cash Disbursement
        </DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: COLORS.formBg }}>
          <Alert severity="info" sx={{ mb: 4, fontWeight: TYPE.bodyBold.fontWeight, border: `2px solid ${COLORS.info}`, borderRadius: 0, bgcolor: COLORS.chipBlueBg, color: COLORS.info, '& .MuiAlert-icon': { color: COLORS.info } }}>
            Log operational expenses to maintain an accurate disbursement ledger. All entries are timestamped and attributed to the logged-in user.
          </Alert>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              select label="Disbursement Category" fullWidth size="small"
              value={formData.category}
              onChange={e => setFormData({ ...formData, category: e.target.value })}
              sx={SHARED_FIELD_SX}
            >
              {expenseCategories.map(c => (
                <MenuItem key={c.id} value={c.name} sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.brand }}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Description / Particulars" fullWidth size="small"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g. Meralco Bill - Oct 2023"
              sx={SHARED_FIELD_SX}
            />
            <TextField
              label="Amount to Disburse" type="number" fullWidth size="small"
              value={formData.amount}
              onChange={e => setFormData({ ...formData, amount: e.target.value })}
              InputProps={{ startAdornment: <InputAdornment position="start" sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.accent }}>₱</InputAdornment> }}
              sx={DANGER_FIELD_SX}
            />
            <TextField
              label="Date of Expense (optional — defaults to today)"
              type="date" fullWidth size="small"
              value={formData.expenseDate}
              onChange={(e) => setFormData({ ...formData, expenseDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={SHARED_FIELD_SX}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.isRecurring || false}
                  onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.sky },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: COLORS.sky },
                  }}
                />
              }
              label={<Typography sx={{ ...TYPE.meta, color: COLORS.accent, fontWeight: 700 }}>Recurring monthly</Typography>}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: `2px solid ${COLORS.brand}`, bgcolor: COLORS.cream, justifyContent: 'space-between' }}>
          <Button onClick={() => setOpen(false)} sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.accent, border: `2px solid ${COLORS.accent}`, borderRadius: 0, px: 3, '&:hover': { bgcolor: COLORS.surfaceHover } }}>
            CANCEL
          </Button>
          <Button
            onClick={handleSave} variant="contained"
            sx={{ fontWeight: TYPE.label.fontWeight, px: 4, py: 1.5, borderRadius: 0, bgcolor: COLORS.danger, border: `2px solid ${COLORS.ctaHover}`, boxShadow: `4px 4px 0px ${COLORS.brand}`, '&:hover': { bgcolor: COLORS.ctaHover, boxShadow: `2px 2px 0px ${COLORS.brand}`, transform: 'translate(-2px, -2px)' }, fontFamily: FONT }}
          >
            AUTHORIZE DISBURSEMENT
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── EDIT EXPENSE DIALOG ── */}
      <Dialog
        open={!!editExpense}
        onClose={() => setEditExpense(null)}
        maxWidth="sm" fullWidth
        PaperProps={{ sx: { ...PANEL.card, boxShadow: `8px 8px 0px ${COLORS.brand}` } }}
      >
        <DialogTitle sx={{ bgcolor: COLORS.cream, color: COLORS.brand, fontWeight: TYPE.label.fontWeight, borderBottom: `2px solid ${COLORS.brand}`, textTransform: 'uppercase', letterSpacing: 1.5, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <EditIcon sx={{ color: COLORS.accent }} />
          Edit Expense
        </DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: COLORS.formBg }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
            <TextField
              select label="Category" fullWidth size="small"
              value={editExpense?.category || ''}
              onChange={(e) => setEditExpense({ ...editExpense, category: e.target.value })}
              sx={SHARED_FIELD_SX}
            >
              {expenseCategories.map((c) => (
                <MenuItem key={c.id} value={c.name} sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.brand }}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Description" fullWidth size="small"
              value={editExpense?.description || ''}
              onChange={(e) => setEditExpense({ ...editExpense, description: e.target.value })}
              sx={SHARED_FIELD_SX}
            />
            <TextField
              label="Amount" type="number" fullWidth size="small"
              value={editExpense?.amount || ''}
              onChange={(e) => setEditExpense({ ...editExpense, amount: e.target.value })}
              InputProps={{ startAdornment: <InputAdornment position="start" sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.accent }}>₱</InputAdornment> }}
              sx={DANGER_FIELD_SX}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={editExpense?.isRecurring || false}
                  onChange={(e) => setEditExpense({ ...editExpense, isRecurring: e.target.checked })}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.sky },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: COLORS.sky },
                  }}
                />
              }
              label={<Typography sx={{ ...TYPE.meta, color: COLORS.accent, fontWeight: 700 }}>Recurring monthly</Typography>}
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

      {/* ── DELETE EXPENSE DIALOG ── */}
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

      {/* ── MANAGE CATEGORIES DIALOG (Fix 4) ── */}
      <Dialog
        open={catManagerOpen}
        onClose={() => { setCatManagerOpen(false); setEditCat(null); setNewCatName(''); setNewCatBudget(''); }}
        maxWidth="sm" fullWidth
        PaperProps={{ sx: { ...PANEL.card, boxShadow: `8px 8px 0px ${COLORS.brand}` } }}
      >
        <DialogTitle sx={{ bgcolor: COLORS.cream, color: COLORS.brand, fontWeight: TYPE.label.fontWeight, borderBottom: `2px solid ${COLORS.accent}`, textTransform: 'uppercase', letterSpacing: 1.5, fontSize: '1.1rem' }}>
          Manage Expense Categories
        </DialogTitle>
        <DialogContent sx={{ p: 3, bgcolor: COLORS.formBg }}>
          {/* Add row */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              size="small" placeholder="Category name" value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              sx={{ flex: 1, ...SHARED_FIELD_SX }}
            />
            <TextField
              size="small" placeholder="Monthly budget" type="number" value={newCatBudget}
              onChange={e => setNewCatBudget(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
              sx={{ width: 140, ...SHARED_FIELD_SX }}
            />
            <Button
              variant="contained" startIcon={<AddIcon />}
              onClick={handleAddCategory}
              sx={{ borderRadius: 0, bgcolor: COLORS.sky, border: `2px solid ${COLORS.skyHover}`, fontWeight: TYPE.label.fontWeight, whiteSpace: 'nowrap', '&:hover': { bgcolor: COLORS.skyHover } }}
            >
              ADD
            </Button>
          </Box>

          {/* Category list */}
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: COLORS.panelBg }}>
                <TableCell sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.brand, ...TYPE.label }}>NAME</TableCell>
                <TableCell sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.brand, ...TYPE.label }}>MONTHLY BUDGET</TableCell>
                <TableCell sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.brand, ...TYPE.label }}>ITEMS</TableCell>
                <TableCell sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.brand, ...TYPE.label }}>ACTIONS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {expenseCategories.map(cat => (
                <TableRow key={cat.id} sx={{ '&:hover': { bgcolor: COLORS.surfaceHover } }}>
                  <TableCell>
                    {editCat?.id === cat.id ? (
                      <TextField
                        size="small" value={editCat.name}
                        onChange={e => setEditCat({ ...editCat, name: e.target.value })}
                        sx={{ width: 120, ...SHARED_FIELD_SX }}
                        disabled={cat.isDefault}
                      />
                    ) : (
                      <Typography sx={{ ...TYPE.meta, color: COLORS.accent }}>
                        {cat.name}
                        {cat.isDefault && (
                          <Typography component="span" sx={{ ...TYPE.tiny, color: COLORS.textMuted, ml: 0.5 }}>(default)</Typography>
                        )}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {editCat?.id === cat.id ? (
                      <TextField
                        size="small" type="number" value={editCat.monthlyBudget}
                        onChange={e => setEditCat({ ...editCat, monthlyBudget: e.target.value })}
                        InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                        sx={{ width: 120, ...SHARED_FIELD_SX }}
                      />
                    ) : (
                      <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary }}>
                        {cat.monthlyBudget > 0 ? `₱${cat.monthlyBudget.toLocaleString()}` : '—'}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted }}>
                      {expenses.filter(e => e.category === cat.name).length}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {editCat?.id === cat.id ? (
                        <>
                          <Button size="small" variant="contained" onClick={handleEditCategory} sx={{ borderRadius: 0, bgcolor: COLORS.sky, fontWeight: TYPE.label.fontWeight, fontSize: '0.65rem', minWidth: 0, px: 1 }}>
                            SAVE
                          </Button>
                          <Button size="small" onClick={() => setEditCat(null)} sx={{ borderRadius: 0, border: `1px solid ${COLORS.accent}`, color: COLORS.accent, fontWeight: TYPE.label.fontWeight, fontSize: '0.65rem', minWidth: 0, px: 1 }}>
                            CANCEL
                          </Button>
                        </>
                      ) : (
                        <>
                          <IconButton
                            size="small"
                            onClick={() => setEditCat({ id: cat.id, name: cat.name, monthlyBudget: cat.monthlyBudget || 0 })}
                            sx={{ color: COLORS.accent, borderRadius: 0, '&:hover': { bgcolor: COLORS.surfaceHover } }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => setConfirmDeleteCat({ open: true, id: cat.id, name: cat.name })}
                            disabled={cat.isDefault}
                            sx={{ color: COLORS.danger, borderRadius: 0, '&:hover': { bgcolor: COLORS.dangerSurface }, '&.Mui-disabled': { color: COLORS.borderLight } }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: `2px solid ${COLORS.brand}`, bgcolor: COLORS.cream }}>
          <Button
            onClick={() => { setCatManagerOpen(false); setEditCat(null); setNewCatName(''); setNewCatBudget(''); }}
            sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.accent, border: `2px solid ${COLORS.accent}`, borderRadius: 0, px: 3 }}
          >
            CLOSE
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── DELETE CATEGORY CONFIRMATION DIALOG ── */}
      <Dialog
        open={confirmDeleteCat.open}
        onClose={() => setConfirmDeleteCat({ open: false, id: null, name: '' })}
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.brand}`, boxShadow: `4px 4px 0px ${COLORS.brand}` } }}
      >
        <DialogTitle sx={{ bgcolor: COLORS.dangerSurface, color: COLORS.brand, fontWeight: TYPE.label.fontWeight, borderBottom: `2px solid ${COLORS.brand}`, textTransform: 'uppercase', letterSpacing: 1.5, fontSize: '1rem' }}>
          Delete Category
        </DialogTitle>
        <DialogContent sx={{ p: 3, pt: 3 }}>
          <Typography sx={{ ...TYPE.body, color: COLORS.textPrimary }}>
            Delete category "{confirmDeleteCat.name}"? Existing expenses in this category will keep their category label but the category will no longer appear in the filter.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: `2px solid ${COLORS.brand}`, bgcolor: COLORS.dangerSurface, justifyContent: 'space-between' }}>
          <Button onClick={() => setConfirmDeleteCat({ open: false, id: null, name: '' })} sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.accent, border: `2px solid ${COLORS.accent}`, borderRadius: 0, px: 3 }}>
            CANCEL
          </Button>
          <Button onClick={handleDeleteCategory} variant="contained" sx={{ fontWeight: TYPE.label.fontWeight, px: 4, borderRadius: 0, bgcolor: COLORS.danger, border: `2px solid ${COLORS.dangerHover}`, '&:hover': { bgcolor: COLORS.dangerHover } }}>
            DELETE
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── REPEAT LAST MONTH DIALOG (Fix 6) ── */}
      <Dialog
        open={repeatDialogOpen}
        onClose={() => setRepeatDialogOpen(false)}
        maxWidth="sm" fullWidth
        PaperProps={{ sx: { ...PANEL.card, boxShadow: `8px 8px 0px ${COLORS.brand}` } }}
      >
        <DialogTitle sx={{ bgcolor: COLORS.cream, color: COLORS.brand, fontWeight: TYPE.label.fontWeight, borderBottom: `2px solid ${COLORS.accent}`, textTransform: 'uppercase', letterSpacing: 1.5, fontSize: '1.1rem' }}>
          Repeat Last Month&apos;s Recurring Expenses
        </DialogTitle>
        <DialogContent sx={{ p: 3, bgcolor: COLORS.formBg }}>
          {alreadyRepeated ? (
            <Alert severity="info" sx={{ borderRadius: 0 }}>
              All recurring expenses from {lastMonthLabel} have already been copied to {thisMonthLabel}.
            </Alert>
          ) : repeatItems.length === 0 ? (
            <Alert severity="info" sx={{ borderRadius: 0 }}>
              No recurring expenses found for {lastMonthLabel}.
            </Alert>
          ) : (
            <>
              <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 2 }}>
                Copy {repeatItems.length} recurring expense{repeatItems.length > 1 ? 's' : ''} from{' '}
                <strong>{lastMonthLabel}</strong> to <strong>{thisMonthLabel}</strong>?
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: COLORS.panelBg }}>
                    <TableCell sx={{ ...TYPE.label, color: COLORS.brand }}>DESCRIPTION</TableCell>
                    <TableCell sx={{ ...TYPE.label, color: COLORS.brand }}>CATEGORY</TableCell>
                    <TableCell sx={{ ...TYPE.label, color: COLORS.brand, textAlign: 'right' }}>AMOUNT</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {repeatItems.map(item => (
                    <TableRow key={item.id}>
                      <TableCell><Typography sx={{ ...TYPE.meta, color: COLORS.accent }}>{item.description}</Typography></TableCell>
                      <TableCell><Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary }}>{item.category}</Typography></TableCell>
                      <TableCell sx={{ textAlign: 'right' }}>
                        <Typography sx={{ ...TYPE.meta, color: COLORS.danger, fontWeight: 700 }}>
                          ₱{(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: COLORS.panelBg }}>
                    <TableCell colSpan={2} sx={{ textAlign: 'right', fontWeight: 800, ...TYPE.label, color: COLORS.brand }}>TOTAL</TableCell>
                    <TableCell sx={{ textAlign: 'right', fontWeight: 800 }}>
                      <Typography sx={{ ...TYPE.meta, color: COLORS.danger, fontWeight: 800 }}>
                        ₱{repeatItems.reduce((s, i) => s + (i.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: `2px solid ${COLORS.brand}`, bgcolor: COLORS.cream, justifyContent: 'space-between' }}>
          <Button onClick={() => setRepeatDialogOpen(false)} sx={{ fontWeight: TYPE.label.fontWeight, color: COLORS.accent, border: `2px solid ${COLORS.accent}`, borderRadius: 0, px: 3 }}>
            CANCEL
          </Button>
          {!alreadyRepeated && repeatItems.length > 0 && (
            <Button
              onClick={handleConfirmRepeat}
              variant="contained"
              disabled={repeatLoading}
              sx={{ fontWeight: TYPE.label.fontWeight, px: 4, borderRadius: 0, bgcolor: COLORS.sky, border: `2px solid ${COLORS.skyHover}`, '&:hover': { bgcolor: COLORS.skyHover } }}
            >
              {repeatLoading ? 'COPYING…' : 'REPEAT'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ── TOAST ── */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} sx={{ width: '100%', fontFamily: FONT, fontWeight: 'bold', boxShadow: 3 }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
