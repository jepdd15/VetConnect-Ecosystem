import React, { useEffect, useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { 
  Box, Typography, Paper, IconButton, Dialog, DialogTitle, DialogContent, 
  DialogActions, Button, TextField, InputAdornment, MenuItem, Alert, Chip, Switch, FormControlLabel
} from '@mui/material';
import { collection, query, orderBy, onSnapshot, doc, addDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

import MoneyOffIcon from '@mui/icons-material/MoneyOff';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const[open, setOpen] = useState(false);
  const [formData, setFormData] = useState({ category: 'Utilities', description: '', amount: '' });
 
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
      field: 'amount', headerName: 'AMOUNT', width: 160, align: 'right', headerAlign: 'right',
      renderCell: p => (
        <Typography sx={{ fontWeight: '1000', color: '#D32F2F', fontSize: '1rem' }}>
          - ₱{p.value.toFixed(2)}
        </Typography>
      ) 
    },
    { 
      field: 'actions', headerName: '', width: 80, align: 'center',
      renderCell: p => (
        <IconButton color="error" onClick={() => handleDelete(p.row.id)} sx={{ border: '1px solid rgba(211, 47, 47, 0.2)', borderRadius: 1 }}>
          <DeleteIcon fontSize="small"/>
        </IconButton>
      ) 
    }
  ];
 
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 24px)', overflow: 'hidden' }}>
      
      {/* 1. BOXED FORENSIC HEADER */}
      <Box sx={{ flexShrink: 0, mb: 3 }}>
        <Paper sx={{ ...forensicHeaderStyle, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <MoneyOffIcon sx={{ fontSize: 32, color: '#D32F2F' }} />
            <Box>
              <Typography variant="h5" sx={{ fontWeight: '1000', color: '#5D4037', textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.1 }}>
                Operational Expenses
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: '1000', color: '#9E9E9E', letterSpacing: 1.5 }}>
                ADMINISTRATIVE CASH DISBURSEMENT LEDGER
              </Typography>
            </Box>
          </Box>
          <Button 
            variant="contained" color="error" startIcon={<AddIcon />} 
            onClick={() => setOpen(true)} 
            sx={{ 
                fontWeight: '1000', px: 3, py: 1, borderRadius: 0, 
                bgcolor: '#D32F2F', border: '2px solid #B71C1C',
                boxShadow: '4px 4px 0px rgba(211, 47, 47, 0.1)',
                '&:hover': { bgcolor: '#B71C1C', boxShadow: '2px 2px 0px rgba(211, 47, 47, 0.1)' },
                fontSize: '0.85rem'
            }}
          >
            LOG EXPENSE
          </Button>
        </Paper>
      </Box>
 
      {/* 2. BOXED LEDGER AREA (FLEX: 1) */}
      <Paper sx={{ ...clinicalFlatStyle, flexGrow: 1, minHeight: 0, width: '100%', overflow: 'hidden' }}>
        <DataGrid 
            rows={expenses} columns={columns} disableRowSelectionOnClick 
            hideFooter={true}
            sx={{ 
                border: 'none', 
                bgcolor: 'white',
                '& .MuiDataGrid-columnHeaders': { 
                  bgcolor: '#FFF8E1 !important', 
                  color: '#5D4037', 
                  fontWeight: '1000 !important',
                  borderBottom: '2px solid #5D4037',
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                  letterSpacing: 1
                },
                '& .MuiDataGrid-columnSeparator': { display: 'none' },
                '& .MuiDataGrid-cell': { 
                  display: 'flex', 
                  alignItems: 'center', 
                  borderBottom: '1px solid rgba(93, 64, 55, 0.08)',
                  fontFamily: 'Inter, sans-serif'
                },
                '& .MuiDataGrid-row:hover': { bgcolor: 'rgba(93, 64, 55, 0.04)' },
                '& .MuiDataGrid-virtualScroller': {
                  '&::-webkit-scrollbar': { width: '8px', height: '8px' },
                  '&::-webkit-scrollbar-track': { background: '#FFF8E1' },
                  '&::-webkit-scrollbar-thumb': { background: '#5D4037', borderRadius: '4px' },
                  '&::-webkit-scrollbar-thumb:hover': { background: '#3E2723' }
                }
            }} 
        />
      </Paper>
 
      {/* LOG MODAL */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 0, border: '2px solid #D32F2F', boxShadow: '8px 8px 0px rgba(211, 47, 47, 0.1)' }}}>
        <DialogTitle sx={{ bgcolor: '#FFEBEE', color: '#D32F2F', fontWeight: '1000', borderBottom: '2px solid #D32F2F', textTransform: 'uppercase', letterSpacing: 1, fontSize: '1rem' }}>Log Cash Disbursement</DialogTitle>
        <DialogContent sx={{ p: 4, bgcolor: '#FFF' }}>
          <Alert severity="info" sx={{ mb: 3, fontWeight: '1000', border: '2px solid #1976D2', borderRadius: 0, bgcolor: '#E3F2FD' }}>Recorded expenses are deducted from Gross Profit calculations on the Dashboard.</Alert>
          <TextField select label="Category" fullWidth size="small" sx={{ mb: 2.5, bgcolor: 'white', '& fieldset': { borderColor: '#5D4037', borderRadius: 0 } }} value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
            {['Utilities', 'Payroll', 'Supplies', 'Maintenance', 'Refunds', 'Other'].map(c => <MenuItem key={c} value={c} sx={{ fontWeight: '1000' }}>{c}</MenuItem>)}
          </TextField>
          <TextField label="Description" fullWidth size="small" sx={{ mb: 2.5, bgcolor: 'white', '& fieldset': { borderColor: '#5D4037', borderRadius: 0 } }} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="e.g. Meralco Bill" />
          <TextField label="Amount" type="number" fullWidth size="small" sx={{ bgcolor: 'white', '& fieldset': { borderColor: '#5D4037', borderRadius: 0 } }} value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }} />
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '2px solid #D32F2F', bgcolor: '#FFEBEE', justifyContent: 'space-between' }}>
          <Button onClick={() => setOpen(false)} sx={{ fontWeight: '1000', color: '#555', px: 3 }}>CANCEL</Button>
          <Button 
            onClick={handleSave} variant="contained" color="error" 
            sx={{ 
                fontWeight: '1000', px: 4, py: 1.5, borderRadius: 0, 
                bgcolor: '#D32F2F', border: '2px solid #B71C1C',
                boxShadow: '4px 4px 0px rgba(211, 47, 47, 0.2)',
                '&:hover': { bgcolor: '#B71C1C', boxShadow: '4px 4px 0px rgba(211, 47, 47, 0.2)' },
                fontFamily: 'Inter, sans-serif'
            }}
          >
            SAVE RECORD
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}