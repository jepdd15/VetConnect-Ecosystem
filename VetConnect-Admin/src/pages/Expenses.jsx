import React, { useEffect, useState, useMemo } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { 
  Box, Typography, Paper, IconButton, Dialog, DialogTitle, DialogContent, 
  DialogActions, Button, TextField, InputAdornment, MenuItem, Alert, Chip, Switch, FormControlLabel,
  Skeleton
} from '@mui/material';
import { collection, query, orderBy, onSnapshot, doc, addDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [open, setOpen] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [formData, setFormData] = useState({ category: 'Utilities', description: '', amount: '' });
  const [filterCategory, setFilterCategory] = useState('All');
 
  // ── ANALYTICAL CALCULATION ENGINE ──
  const analytics = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date();
    startOfWeek.setDate(now.getDate() - 7);

    const monthlyTotal = expenses
      .filter(e => e.date?.toDate() >= startOfMonth)
      .reduce((sum, e) => sum + e.amount, 0);

    const weeklyTotal = expenses
      .filter(e => e.date?.toDate() >= startOfWeek)
      .reduce((sum, e) => sum + e.amount, 0);

    const categories = expenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {});

    const topCategory = Object.keys(categories).reduce((a, b) => categories[a] > categories[b] ? a : b, 'N/A');

    return { monthlyTotal, weeklyTotal, topCategory };
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    if (filterCategory === 'All') return expenses;
    return expenses.filter(e => e.category === filterCategory);
  }, [expenses, filterCategory]);
 
  const forensicHeaderStyle = {
    bgcolor: '#FFF8E1', 
    border: '2px solid #5D4037',
    borderRadius: 0,
    boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
  };
 
  const clinicalFlatStyle = {
    bgcolor: 'white',
    border: '2px solid #5D4037',
    borderRadius: 0,
    boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
  };
 
  useEffect(() => {
    const q = query(collection(db, "expenses"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), displayDate: doc.data().date?.toDate().toLocaleString() })));
      setIsInitialLoad(false);
    });
    return () => unsubscribe();
  },[]);
 
  const handleSave = async () => {
    if (!formData.description || !formData.amount) return alert("Description and Amount are required.");
    try {
      await addDoc(collection(db, "expenses"), { ...formData, amount: parseFloat(formData.amount), date: Timestamp.now(), loggedBy: "Admin" });
      setOpen(false); setFormData({ category: 'Utilities', description: '', amount: '' });
    } catch (error) { alert("Error: " + error.message); }
  };
 
  const handleDelete = async (id) => {
    if (window.confirm("Delete this expense record?")) await deleteDoc(doc(db, "expenses", id));
  };
 
  const columns =[
    { 
      field: 'displayDate', headerName: 'DATE LOGGED', width: 220,
      renderCell: (p) => (
        <Typography variant="body2" sx={{ fontWeight: '1000', color: '#3E2723' }}>{p.value}</Typography>
      )
    },
    { 
      field: 'category', headerName: 'CATEGORY', width: 180, 
      renderCell: p => (
        <Chip label={p.value} size="small" sx={{ borderRadius: 0, bgcolor: '#FFF8E1', color: '#5D4037', border: '1px solid #5D4037', fontWeight: '1000', textTransform: 'uppercase', fontSize: '0.65rem' }} />
      ) 
    },
    { 
      field: 'description', headerName: 'DESCRIPTION', flex: 1,
      renderCell: (p) => (
        <Typography variant="body2" sx={{ fontWeight: '900', color: '#5D4037' }}>{p.value}</Typography>
      )
    },
    { 
      field: 'amount', headerName: 'AMOUNT', width: 180, align: 'right', headerAlign: 'right',
      renderCell: p => (
        <Typography sx={{ fontWeight: '1000', color: '#D32F2F', fontSize: '1.1rem', letterSpacing: 0.5 }}>
          - ₱{p.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Typography>
      ) 
    },
    { 
      field: 'actions', headerName: '', width: 100, align: 'center',
      renderCell: p => (
        <IconButton 
          onClick={() => handleDelete(p.row.id)} 
          sx={{ 
            color: '#B71C1C',
            border: '2px solid rgba(183, 28, 28, 0.2)', 
            borderRadius: 0,
            '&:hover': { bgcolor: 'rgba(211, 47, 47, 0.05)', border: '2px solid #D32F2F' }
          }}
        >
          <DeleteIcon fontSize="small"/>
        </IconButton>
      ) 
    }
  ];
 
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', m: 0, overflow: 'hidden', bgcolor: '#FAF9F7' }}>
      
      {/* 1. FULL-BLEED INDUSTRIAL HEADER */}
      <Box sx={{ 
        flexShrink: 0, 
        bgcolor: '#FFF8E1', 
        borderBottom: '2px solid #5D4037',
        p: 2.5, 
        px: 4,
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        mb: 0
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: '1000', color: '#3E2723', textTransform: 'uppercase', letterSpacing: 1, fontSize: '1.5rem', lineHeight: 1 }}>
              Operational Expenses
            </Typography>
          </Box>
        </Box>
        <Button 
          variant="contained" color="error" startIcon={<AddIcon />} 
          onClick={() => setOpen(true)} 
          sx={{ 
              fontWeight: '1000', px: 4, py: 1.2, borderRadius: 0, 
              bgcolor: '#D32F2F', border: '2px solid #BF360C',
              boxShadow: '4px 4px 0px rgba(211, 47, 47, 0.2)',
              '&:hover': { bgcolor: '#BF360C', boxShadow: '2px 2px 0px rgba(211, 47, 47, 0.2)' },
              fontFamily: 'Inter, sans-serif'
          }}
        >
          LOG EXPENSE
        </Button>
      </Box>

      {/* 2. ANALYTICAL KPI STRIP */}
      <Box sx={{ flexShrink: 0, display: 'flex', borderBottom: '2px solid #5D4037', bgcolor: '#FFF' }}>
        <Box sx={{ flex: 1, p: 2, borderRight: '1px solid rgba(93, 64, 55, 0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="overline" sx={{ color: '#795548', fontWeight: '1000', fontSize: '0.65rem' }}>Monthly Total OpEx</Typography>
          {isInitialLoad ? (
            <Skeleton variant="text" width="60%" height={32} sx={{ bgcolor: 'rgba(211, 47, 47, 0.1)' }} />
          ) : (
            <Typography variant="h5" sx={{ color: '#D32F2F', fontWeight: '1000' }}>₱{analytics.monthlyTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography>
          )}
        </Box>
        <Box sx={{ flex: 1, p: 2, borderRight: '1px solid rgba(93, 64, 55, 0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="overline" sx={{ color: '#795548', fontWeight: '1000', fontSize: '0.65rem' }}>Top Spend Category</Typography>
          {isInitialLoad ? (
            <Skeleton variant="text" width="60%" height={32} sx={{ bgcolor: 'rgba(93, 64, 55, 0.1)' }} />
          ) : (
            <Typography variant="h5" sx={{ color: '#3E2723', fontWeight: '1000', textTransform: 'uppercase' }}>{analytics.topCategory}</Typography>
          )}
        </Box>
        <Box sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography variant="overline" sx={{ color: '#795548', fontWeight: '1000', fontSize: '0.65rem' }}>7-Day Velocity</Typography>
          {isInitialLoad ? (
            <Skeleton variant="text" width="60%" height={32} sx={{ bgcolor: 'rgba(211, 47, 47, 0.1)' }} />
          ) : (
            <Typography variant="h5" sx={{ color: '#D32F2F', fontWeight: '1000' }}>₱{analytics.weeklyTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography>
          )}
        </Box>
      </Box>

      {/* 3. RIGID COMMAND STRIP (FILTERING) */}
      <Box sx={{ flexShrink: 0, bgcolor: '#FAF9F7', borderBottom: '2px solid #5D4037', p: 1, px: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
          <Typography variant="caption" sx={{ fontWeight: '1000', color: '#5D4037', textTransform: 'uppercase' }}>Filtered By:</Typography>
          {['All', 'Utilities', 'Payroll', 'Supplies', 'Maintenance', 'Refunds', 'Other'].map(cat => (
            <Chip 
              key={cat} label={cat} size="small" 
              onClick={() => setFilterCategory(cat)}
              sx={{ 
                borderRadius: 0, 
                border: '2px solid #5D4037', 
                bgcolor: filterCategory === cat ? '#5D4037' : 'white',
                color: filterCategory === cat ? 'white' : '#5D4037',
                fontWeight: '1000',
                px: 1,
                '&:hover': { bgcolor: filterCategory === cat ? '#3E2723' : '#EFEBE9' }
              }} 
            />
          ))}
      </Box>

      {/* 4. LEDGER COMMAND CENTER SHELL (FLEX: 1) */}
      <Box sx={{ flexGrow: 1, minHeight: 0, width: '100%', overflow: 'hidden', p: 0 }}>
        <DataGrid 
            rows={filteredExpenses} columns={columns} disableRowSelectionOnClick 
            hideFooter={true}
            sx={{ 
                border: 'none', 
                borderRadius: 0,
                bgcolor: 'white',
                '& .MuiDataGrid-columnHeaders': { 
                  bgcolor: '#EFEBE9 !important', 
                  color: '#3E2723', 
                  fontWeight: '1000 !important',
                  borderBottom: '2px solid #5D4037',
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                  letterSpacing: 1.5,
                  borderRadius: 0
                },
                '& .MuiDataGrid-columnSeparator': { display: 'none' },
                '& .MuiDataGrid-cell': { 
                  display: 'flex', 
                  alignItems: 'center', 
                  borderBottom: '1px solid rgba(93, 64, 55, 0.1)',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: '500'
                },
                '& .MuiDataGrid-row:hover': { bgcolor: 'rgba(93, 64, 55, 0.04)' },
                '& .MuiDataGrid-virtualScroller': {
                  '&::-webkit-scrollbar': { width: '10px', height: '10px' },
                  '&::-webkit-scrollbar-track': { background: '#F5F5F5' },
                  '&::-webkit-scrollbar-thumb': { background: '#5D4037', borderRadius: 0 },
                  '&::-webkit-scrollbar-thumb:hover': { background: '#3E2723' }
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
            borderRadius: 0, 
            border: '2px solid #5D4037', 
            boxShadow: '8px 8px 0px rgba(93, 64, 55, 0.1)' 
          }
        }}
      >
        <DialogTitle sx={{ 
          bgcolor: '#FFF8E1', 
          color: '#3E2723', 
          fontWeight: '1000', 
          borderBottom: '2px solid #5D4037', 
          textTransform: 'uppercase', 
          letterSpacing: 1.5, 
          fontSize: '1.1rem',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5
        }}>
          <MoneyOffIcon sx={{ color: '#D32F2F' }} />
          Log Cash Disbursement
        </DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: '#FAF9F7' }}>
          <Alert 
            severity="info" 
            sx={{ 
              mb: 4, 
              fontWeight: '900', 
              border: '2px solid #1565C0', 
              borderRadius: 0, 
              bgcolor: '#E3F2FD',
              color: '#0D47A1',
              '& .MuiAlert-icon': { color: '#1565C0' }
            }}
          >
            Recorded expenses are deducted from Gross Profit calculations on the Dashboard.
          </Alert>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField 
              select label="Disbursement Category" fullWidth size="small" 
              value={formData.category} 
              onChange={e => setFormData({...formData, category: e.target.value})}
              sx={{ 
                bgcolor: 'white', 
                '& .MuiOutlinedInput-root': { 
                  borderRadius: 0, 
                  '& fieldset': { border: '2px solid #5D4037' },
                  '&:hover fieldset': { borderColor: '#3E2723' },
                  '&.Mui-focused fieldset': { borderColor: '#5D4037' }
                },
                '& .MuiInputLabel-root': { color: '#5D4037', fontWeight: 'bold' }
              }}
            >
              {['Utilities', 'Payroll', 'Supplies', 'Maintenance', 'Refunds', 'Other'].map(c => (
                <MenuItem key={c} value={c} sx={{ fontWeight: '1000', color: '#3E2723' }}>{c}</MenuItem>
              ))}
            </TextField>

            <TextField 
              label="Description / Particulars" fullWidth size="small" 
              value={formData.description} 
              onChange={e => setFormData({...formData, description: e.target.value})} 
              placeholder="e.g. Meralco Bill - Oct 2023" 
              sx={{ 
                bgcolor: 'white', 
                '& .MuiOutlinedInput-root': { 
                  borderRadius: 0, 
                  '& fieldset': { border: '2px solid #5D4037' },
                  '&:hover fieldset': { borderColor: '#3E2723' },
                  '&.Mui-focused fieldset': { borderColor: '#5D4037' }
                },
                '& .MuiInputLabel-root': { color: '#5D4037', fontWeight: 'bold' }
              }}
            />

            <TextField 
              label="Amount to Disburse" type="number" fullWidth size="small" 
              value={formData.amount} 
              onChange={e => setFormData({...formData, amount: e.target.value})} 
              InputProps={{ 
                startAdornment: <InputAdornment position="start" sx={{ fontWeight: '1000', color: '#5D4037' }}>₱</InputAdornment> 
              }} 
              sx={{ 
                bgcolor: 'white', 
                '& .MuiOutlinedInput-root': { 
                  borderRadius: 0, 
                  '& fieldset': { border: '2px solid #D32F2F' },
                  '&:hover fieldset': { borderColor: '#B71C1C' },
                  '&.Mui-focused fieldset': { borderColor: '#D32F2F' }
                },
                '& .MuiInputLabel-root': { color: '#D32F2F', fontWeight: 'bold' }
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '2px solid #5D4037', bgcolor: '#FFF8E1', justifyContent: 'space-between' }}>
          <Button 
            onClick={() => setOpen(false)} 
            sx={{ fontWeight: '1000', color: '#5D4037', border: '2px solid #5D4037', borderRadius: 0, px: 3, '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' } }}
          >
            CANCEL
          </Button>
          <Button 
            onClick={handleSave} 
            variant="contained" 
            sx={{ 
                fontWeight: '1000', px: 4, py: 1.5, borderRadius: 0, 
                bgcolor: '#D32F2F', border: '2px solid #BF360C',
                boxShadow: '4px 4px 0px rgba(0,0,0,0.1)',
                '&:hover': { bgcolor: '#BF360C', boxShadow: '2px 2px 0px rgba(0,0,0,0.1)', transform: 'translate(-2px, -2px)' },
                fontFamily: 'Inter, sans-serif'
            }}
          >
            AUTHORIZE DISBURSEMENT
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}