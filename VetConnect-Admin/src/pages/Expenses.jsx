import React, { useEffect, useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { 
  Box, Typography, Paper, Button, Dialog, DialogTitle, 
  DialogContent, DialogActions, TextField, MenuItem, IconButton, Tooltip 
} from '@mui/material';
import { collection, onSnapshot, addDoc, doc, deleteDoc, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Icons
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import MoneyOffIcon from '@mui/icons-material/MoneyOff'; // Icon for Expenses

export default function Expenses() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  
  // Form State
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Utilities');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); // Default Today

  // 1. Fetch Expenses
  useEffect(() => {
    const q = query(collection(db, "expenses"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Convert Timestamp if needed, or use stored string date
        displayDate: doc.data().date instanceof Timestamp ? doc.data().date.toDate().toLocaleDateString() : doc.data().date
      }));
      setRows(list);
    });
    return () => unsubscribe();
  }, []);

  // 2. Add Expense
  const handleSubmit = async () => {
    if (!description || !amount) return alert("Please fill all fields");

    try {
      await addDoc(collection(db, "expenses"), {
        description,
        category,
        amount: parseFloat(amount),
        date: date, // Saving as string YYYY-MM-DD for simple sorting/filtering later
        createdAt: Timestamp.now(),
        user: "Admin"
      });
      setOpen(false);
      // Reset form
      setDescription('');
      setAmount('');
      setCategory('Utilities');
    } catch (error) {
      alert("Error adding expense: " + error.message);
    }
  };

  // 3. Delete Expense
  const handleDelete = async (id) => {
    if(confirm("Are you sure you want to delete this record?")) {
      await deleteDoc(doc(db, "expenses", id));
    }
  };

  // Columns
  const columns = [
    { field: 'displayDate', headerName: 'Date', width: 150 },
    { field: 'description', headerName: 'Description', flex: 1, minWidth: 200, fontWeight: 'bold' },
    { 
      field: 'category', headerName: 'Category', width: 150,
      renderCell: (params) => (
        <Box sx={{ 
            bgcolor: '#EFEBE9', color: '#5D4037', px: 1, borderRadius: 1, fontSize: '0.8rem', fontWeight: 'bold' 
        }}>
            {params.value.toUpperCase()}
        </Box>
      )
    },
    { 
      field: 'amount', headerName: 'Amount', width: 150,
      renderCell: (params) => (
        <Typography color="error" fontWeight="bold">- ₱{params.value.toLocaleString()}</Typography>
      )
    },
    {
      field: 'actions', headerName: 'Actions', width: 100,
      renderCell: (params) => (
        <IconButton color="error" onClick={() => handleDelete(params.row.id)}>
          <DeleteIcon />
        </IconButton>
      )
    }
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#1565C0' }}>
          Operational Expenses
        </Typography>
        <Button 
          variant="contained" 
          startIcon={<AddIcon />} 
          color="error"
          onClick={() => setOpen(true)}
        >
          Record Expense
        </Button>
      </Box>

      <Paper sx={{ height: 600, width: '100%', boxShadow: 3 }}>
        <DataGrid 
          rows={rows} 
          columns={columns} 
          pageSize={10} 
          disableSelectionOnClick 
          sx={{ '& .MuiDataGrid-columnHeaders': { bgcolor: '#f5f5f5', fontWeight: 'bold' } }}
        />
      </Paper>

      {/* ADD EXPENSE MODAL */}
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle sx={{color: '#D32F2F', fontWeight: 'bold'}}>Record New Expense</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            label="Date"
            type="date"
            fullWidth
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <TextField
            autoFocus
            margin="dense"
            label="Description (e.g. Meralco Bill)"
            fullWidth
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <TextField
            margin="dense"
            select
            label="Category"
            fullWidth
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {['Utilities', 'Rent', 'Payroll', 'Supplies', 'Maintenance', 'Marketing', 'Taxes', 'Other'].map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            margin="dense"
            label="Amount (₱)"
            type="number"
            fullWidth
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            sx={{ input: { color: '#D32F2F', fontWeight: 'bold' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" color="error">
            Record
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}