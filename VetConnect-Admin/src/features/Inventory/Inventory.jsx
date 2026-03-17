import React, { useState } from 'react';
import { Box, Typography, Button, Paper, TextField, InputAdornment, FormControl, Select, MenuItem, FormControlLabel, Switch, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';

// Logic & Components
import { useInventoryManager } from './hooks/useInventoryManager';
import InventoryTable from './components/InventoryTable';
import ProductFormModal from './modals/ProductFormModal';
import AdjustmentModal from './modals/AdjustmentModal';
import AuditHistoryModal from './modals/AuditHistoryModal';

import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export default function Inventory() {
  const { products, getStockDetails, executeAdjustment, fetchItemHistory } = useInventoryManager();

  // Filters
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [showLowStock, setShowLowStock] = useState(false);

  // Global Alerts
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', actionText: 'Confirm', onConfirm: null });

  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });
  const requestConfirm = (title, message, actionText, onConfirmAction) => setConfirmDialog({ open: true, title, message, actionText, onConfirm: onConfirmAction });

  // Modal States
  const [openForm, setOpenForm] = useState(false);
  const [openAdjust, setOpenAdjust] = useState(false);
  const[openHistory, setOpenHistory] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [adjustType, setAdjustType] = useState('restock');
  const[historyLogs, setHistoryLogs] = useState([]);

  // Data Pipeline
  const filtered = products.filter(p => {
    const matchSearch = p.itemName.toLowerCase().includes(searchText.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(searchText.toLowerCase()));
    const matchCat = filterCategory === 'All' || p.category === filterCategory;
    const isLow = getStockDetails(p).active <= (p.minStock || 10);
    return matchSearch && matchCat && (showLowStock ? isLow : true);
  });

  // Action Handlers
  const handleDelete = (item) => {
    if (item.stock > 0) return showToast(`Cannot delete. Active Stock is ${item.stock}.`, "warning");
    requestConfirm("Permanently Delete Item?", `Are you sure you want to delete ${item.itemName}?`, "Delete", async () => {
      try { await deleteDoc(doc(db, "inventory", item.id)); showToast("Item deleted.", "success"); } 
      catch(e) { showToast(e.message, "error"); }
    });
  };

  const handleOpenHistory = async (item) => {
    setSelectedItem(item);
    try {
        const logs = await fetchItemHistory(item.id);
        setHistoryLogs(logs);
        setOpenHistory(true);
    } catch (e) { showToast("Error loading history", "error"); }
  };

  const glassStyle = { background: 'rgba(255, 255, 255, 0.55)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 8px 32px 0 rgba(139, 69, 19, 0.08)', borderRadius: 3 };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#5D4037', textShadow: '0px 1px 2px rgba(255,255,255,0.8)' }}>Inventory Control</Typography>
        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#FF9800', fontWeight: 'bold' }} onClick={() => { setSelectedItem(null); setOpenForm(true); }}>Add New Item</Button>
      </Box>

      <Paper sx={{ ...glassStyle, p: 2, mb: 3, display: 'flex', gap: 3, alignItems: 'center' }}>
        <TextField size="small" placeholder="Search name or SKU..." value={searchText} onChange={e=>setSearchText(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon color="disabled"/></InputAdornment>, spellCheck:'false' }} sx={{ width: 300, bgcolor: 'white' }} />
        <FormControl size="small" sx={{ width: 200, bgcolor: 'white' }}><Select value={filterCategory} onChange={e=>setFilterCategory(e.target.value)}>{['All', 'Medicine', 'Vaccine', 'Food', 'Supplies', 'Accessories', 'Lab'].map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</Select></FormControl>
        <FormControlLabel control={<Switch checked={showLowStock} onChange={e=>setShowLowStock(e.target.checked)} color="error" />} label={<Typography fontWeight="bold" color={showLowStock ? "error" : "textSecondary"}>Low Stock Only</Typography>} />
      </Paper>

      <InventoryTable 
        data={filtered} 
        getStockDetails={getStockDetails}
        onEdit={(item) => { setSelectedItem(item); setOpenForm(true); }}
        onAdjust={(item, type) => { setSelectedItem(item); setAdjustType(type); setOpenAdjust(true); }}
        onViewHistory={handleOpenHistory}
        onDelete={handleDelete}
        showToast={showToast}
        requestConfirm={requestConfirm}
      />

      {openForm && (
        <ProductFormModal 
            key={selectedItem?.id || 'new_item'} 
            open={openForm} 
            onClose={() => setOpenForm(false)} 
            item={selectedItem} 
            showToast={showToast} 
        />
      )}

      {openAdjust && (
        <AdjustmentModal 
            key={selectedItem?.id || 'adj_item'} 
            open={openAdjust} 
            onClose={() => setOpenAdjust(false)} 
            item={selectedItem} 
            type={adjustType} 
            execute={executeAdjustment} 
            showToast={showToast} 
        />
      )}

      <AuditHistoryModal open={openHistory} onClose={() => setOpenHistory(false)} item={selectedItem} logs={historyLogs} />

      {/* GLOBAL ENTERPRISE ALERTS */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({...confirmDialog, open: false})} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 'bold', color: '#D32F2F' }}>{confirmDialog.title}</DialogTitle>
        <DialogContent><Typography>{confirmDialog.message}</Typography></DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#FAFAFA' }}>
          <Button onClick={() => setConfirmDialog({...confirmDialog, open: false})} sx={{ color: '#555', fontWeight: 'bold' }}>Cancel</Button>
          <Button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog({...confirmDialog, open: false}); }} variant="contained" color="error" sx={{ fontWeight: 'bold' }}>{confirmDialog.actionText}</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={toast.open} autoHideDuration={4000} onClose={()=>setToast({...toast, open: false})} anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}>
        <Alert severity={toast.severity} sx={{ width: '100%', fontWeight: 'bold', boxShadow: 3 }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}