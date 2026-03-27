import React, { useEffect, useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { 
  Box, Typography, Paper, IconButton, Dialog, DialogTitle, DialogContent, 
  DialogActions, Button, TextField, InputAdornment, MenuItem, Alert
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

  const glassStyle = {
    background: 'rgba(255, 255, 255, 0.55)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', 
    border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 8px 32px 0 rgba(139, 69, 19, 0.08)', borderRadius: 3, 
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
    { field: 'displayDate', headerName: 'Date Logged', width: 200 },
    { field: 'category', headerName: 'Category', width: 150, renderCell: p => <Typography fontWeight="bold" color="textSecondary">{p.value}</Typography> },
    { field: 'description', headerName: 'Description', flex: 1 },
    { field: 'amount', headerName: 'Amount', width: 120, renderCell: p => <Typography fontWeight="900" color="#D32F2F">- ₱{p.value.toFixed(2)}</Typography> },
    { field: 'actions', headerName: '', width: 60, renderCell: p => <IconButton color="error" onClick={() => handleDelete(p.row.id)}><DeleteIcon fontSize="small"/></IconButton> }
  ];

  return (
    <Box>
      <Paper sx={{ ...glassStyle, p: 2, mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <MoneyOffIcon sx={{ fontSize: 35, color: '#D32F2F' }} />
          <Typography variant="h4" sx={{ fontWeight: '900', color: '#5D4037', textShadow: '0px 1px 2px rgba(255,255,255,0.8)' }}>Operational Expenses</Typography>
        </Box>
        <Button variant="contained" color="error" startIcon={<AddIcon />} onClick={() => setOpen(true)} sx={{ fontWeight: 'bold', px: 3 }}>Log Expense</Button>
      </Paper>

      <Paper sx={{ ...glassStyle, height: 'calc(100vh - 190px)', minHeight: 400, width: '100%', overflow: 'hidden' }}>
        <DataGrid rows={expenses} columns={columns} disableSelectionOnClick initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} pageSizeOptions={[10, 25, 50]} sx={{ border: 'none', bgcolor: 'transparent', '& .MuiDataGrid-columnHeaders': { bgcolor: 'rgba(255, 255, 255, 0.4)', color: '#5D4037', fontWeight: 'bold' } }} />
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ bgcolor: '#D32F2F', color: 'white', fontWeight: 'bold' }}>Log Cash Disbursement</DialogTitle>
        <DialogContent sx={{ p: 3, bgcolor: '#FAFAFA' }}>
          <Alert severity="info" sx={{ mb: 3, fontWeight: 'bold' }}>Recorded expenses are deducted from Gross Profit calculations on the Dashboard.</Alert>
          <TextField select label="Category" fullWidth size="small" sx={{ mb: 2, bgcolor: 'white' }} value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
            {['Utilities', 'Payroll', 'Supplies', 'Maintenance', 'Refunds', 'Other'].map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <TextField label="Description" fullWidth size="small" sx={{ mb: 2, bgcolor: 'white' }} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="e.g. Meralco Bill" />
          <TextField label="Amount" type="number" fullWidth size="small" sx={{ bgcolor: 'white' }} value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}><Button onClick={() => setOpen(false)}>Cancel</Button><Button onClick={handleSave} variant="contained" color="error" sx={{ fontWeight: 'bold' }}>Save Record</Button></DialogActions>
      </Dialog>
    </Box>
  );
}