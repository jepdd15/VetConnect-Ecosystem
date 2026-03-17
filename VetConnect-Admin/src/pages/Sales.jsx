import React, { useEffect, useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { 
  Box, Typography, Paper, Chip, IconButton, Tooltip, 
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Checkbox, FormControlLabel 
} from '@mui/material';
import { collection, query, orderBy, onSnapshot, doc, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Icons
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import ReceiptIcon from '@mui/icons-material/Receipt';

export default function Sales() {
  const[sales, setSales] = useState([]);
  const [openRefund, setOpenRefund] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [restock, setRestock] = useState(true); // Toggle to decide if items go back to inventory

  // 1. Fetch Sales History (WITH ERROR LOGGING)
  useEffect(() => {
    const q = query(collection(db, "sales"), orderBy("date", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => {
        const data = doc.data();
        // Safety check for date format
        const dateObj = data.date && data.date.toDate ? data.date.toDate() : new Date();
        
        return {
          id: doc.id,
          ...data,
          displayDate: dateObj.toLocaleString()
        };
      });
      setSales(list);
    }, (error) => {
      // THIS IS THE NEW PART: Catch and Alert Errors
      console.error("Sales Error:", error);
      alert("Error loading sales: " + error.message + "\nCheck Console (F12) for details.");
    });

    return () => unsubscribe();
  }, []);

  // 2. Open Refund Modal
  const handleOpenRefund = (sale) => {
    setSelectedSale(sale);
    setRestock(true); // Default to restocking items
    setOpenRefund(true);
  };

  // 3. THE REVERSE LOGISTICS LOGIC
  const processRefund = async () => {
    if (!selectedSale) return;

    try {
      await runTransaction(db, async (transaction) => {
        // A. Mark Sale as Refunded
        const saleRef = doc(db, "sales", selectedSale.id);
        transaction.update(saleRef, { 
          status: 'refunded',
          refundedAt: Timestamp.now()
        });

        // B. Optional Restock Logic
        if (restock && selectedSale.items) {
          for (const item of selectedSale.items) {
            if (item.type === 'product') {
              const itemRef = doc(db, "inventory", item.id);
              const itemDoc = await transaction.get(itemRef);
              
              if (itemDoc.exists()) {
                const data = itemDoc.data();
                const newStock = (data.stock || 0) + item.qty;
                const batches = data.batches ||[];
                
                // Create a "Refund Batch" with a 1-year expiry safeguard
                const nextYear = new Date();
                nextYear.setFullYear(nextYear.getFullYear() + 1);

                batches.push({
                  batchNumber: `RET-${selectedSale.id.slice(0,4)}`,
                  expiryDate: nextYear.toISOString().split('T')[0],
                  qty: item.qty,
                  dateAdded: new Date().toISOString()
                });

                // Update Inventory
                transaction.update(itemRef, { stock: newStock, batches: batches });

                // Create Audit Log
                const logRef = doc(collection(db, "inventory_logs"));
                transaction.set(logRef, {
                  itemId: item.id, itemName: item.name, 
                  type: 'restock', // Treating return as a restock
                  quantity: item.qty, reason: `Customer Refund (Receipt #${selectedSale.id.slice(0,5)})`, 
                  oldStock: data.stock, newStock: newStock,
                  batchInfo: 'Returned Item', user: "Admin", timestamp: Timestamp.now()
                });
              }
            }
          }
        }
      });

      setOpenRefund(false);
      alert("Refund Processed Successfully!");
    } catch (error) {
      console.error(error);
      alert("Refund failed: " + error.message);
    }
  };

  const columns =[
    { field: 'displayDate', headerName: 'Date & Time', width: 200 },
    { field: 'id', headerName: 'Receipt #', width: 120, renderCell: (p) => p.value.slice(0,6).toUpperCase() },
    { field: 'petName', headerName: 'Patient', width: 150, fontWeight: 'bold' },
    { 
      field: 'items', headerName: 'Items Purchased', flex: 1, minWidth: 200,
      renderCell: (p) => (
        <Typography variant="caption" color="textSecondary">
          {p.value ? p.value.map(i => `${i.qty}x ${i.name}`).join(', ') : 'N/A'}
        </Typography>
      )
    },
    { field: 'total', headerName: 'Total', width: 100, renderCell: (p) => <Typography fontWeight="bold">₱{p.value}</Typography> },
    { 
      field: 'status', headerName: 'Status', width: 120,
      renderCell: (p) => {
        const isRefunded = p.value === 'refunded';
        return <Chip label={isRefunded ? "REFUNDED" : "PAID"} color={isRefunded ? "error" : "success"} size="small" variant={isRefunded ? "outlined" : "filled"} />;
      }
    },
    {
      field: 'actions', headerName: 'Actions', width: 100,
      renderCell: (p) => (
        p.row.status !== 'refunded' ? (
          <Tooltip title="Process Refund">
            <IconButton color="error" onClick={() => handleOpenRefund(p.row)}>
              <SettingsBackupRestoreIcon />
            </IconButton>
          </Tooltip>
        ) : null
      )
    }
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <ReceiptIcon sx={{ fontSize: 40, color: '#1565C0' }} />
        <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#1565C0' }}>Transaction History</Typography>
      </Box>

      <Paper sx={{ height: 600, width: '100%', boxShadow: 3 }}>
        <DataGrid rows={sales} columns={columns} pageSize={10} disableSelectionOnClick sx={{ '& .MuiDataGrid-columnHeaders': { bgcolor: '#EFEBE9', color: '#5D4037', fontWeight: 'bold' } }} />
      </Paper>

      {/* REFUND MODAL */}
      <Dialog open={openRefund} onClose={() => setOpenRefund(false)}>
        <DialogTitle sx={{ color: '#D32F2F', fontWeight: 'bold' }}>Process Refund</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            You are about to refund <b>₱{selectedSale?.total}</b> for patient <b>{selectedSale?.petName}</b>.
          </Typography>
          
          <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f9f9f9', mb: 2 }}>
            <Typography variant="caption" fontWeight="bold">Items to reverse:</Typography>
            {selectedSale?.items?.map((item, i) => (
              <Typography key={i} variant="body2">• {item.qty}x {item.name} (₱{item.price * item.qty})</Typography>
            ))}
          </Paper>

          <FormControlLabel 
            control={<Checkbox checked={restock} onChange={(e) => setRestock(e.target.checked)} color="primary" />} 
            label={
              <Box>
                <Typography variant="body1" fontWeight="bold">Restock physical products?</Typography>
                <Typography variant="caption" color="textSecondary">Uncheck this if the items were opened/damaged and cannot be resold.</Typography>
              </Box>
            }
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenRefund(false)} color="inherit">Cancel</Button>
          <Button onClick={processRefund} variant="contained" color="error" startIcon={<SettingsBackupRestoreIcon />}>
            Confirm Refund
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}