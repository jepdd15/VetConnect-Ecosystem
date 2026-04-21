import React, { useState, useMemo, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, TextField, InputAdornment,
  FormControl, Select, MenuItem, Switch, FormControlLabel,
  Snackbar, Alert, IconButton, Tabs, Tab,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import Grid from '@mui/material/Grid';

// Design Tokens
import { FONT, TYPE, COLORS } from '../../theme/designTokens';

// Icons
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import InventoryIcon from '@mui/icons-material/Inventory';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import EventBusyIcon from '@mui/icons-material/EventBusy';

// Database
import { onSnapshot, collection, doc, writeBatch  } from 'firebase/firestore'; 
import { db } from '../../firebaseConfig';

// Logic & Components
import { useInventory } from './hooks/useInventory';
import InventoryTable from './components/InventoryTable'; 
import ProductFormModal from './modals/ProductFormModal';
import StockAdjustModal from './modals/StockAdjustModal';
import InventoryLogModal from './modals/InventoryLogModal';
import ConfirmDeleteModal from './modals/ConfirmDeleteModal';
import GlobalActivityLog from './components/GlobalActivityLog';

// Helper for Capitlizing Category strings
export const formatCategory = (str) => {
  if (!str || typeof str !== 'string') return str?.name || 'Uncategorized';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const KPICard = ({ title, value, icon, color, bgcolor, border, onClick, active }) => (
  <Paper
    elevation={0}
    onClick={onClick}
    sx={{
      p: 2, px: 2.5, display: 'flex', alignItems: 'center', gap: 2,
      borderRadius: 0, 
      border: 0,
      bgcolor: active ? `${color}1A` : '#FFF9F7', 
      boxShadow: 'none',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.1s ease',
      height: '100%',
      '&:hover': onClick ? { bgcolor: active ? `${color}25` : '#F0F0F0' } : {},
    }}
  >
    <Box sx={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: `${color}1A`, color: color, border: `1px solid ${color}33` }}>
      {icon}
    </Box>
    <Box>
      <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, fontSize: '0.65rem' }}>{title}</Typography>
      <Typography variant="h5" sx={{ fontFamily: FONT, color: active ? color : '#3E2723', fontWeight: 1000, fontSize: '1.4rem' }}>{value}</Typography>
    </Box>
  </Paper>
);

export default function Inventory() {
  const { inventory, createItem, updateItem, deleteItem, restoreItem, adjustStock, scrubDatabase } = useInventory();
  
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [stockFilter, setStockFilter] = useState(null); // null | 'low' | 'out'
  const [showArchived, setShowArchived] = useState(false);
  const [openScrubConfirm, setOpenScrubConfirm] = useState(false);
  
  const [invCategories, setInvCategories] = useState([]);

  const [openForm, setOpenForm] = useState(false);
  const [openAdjust, setOpenAdjust] = useState(false);
  const [openLog, setOpenLog] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });

  const [activeTab, setActiveTab] = useState(0);

  // Toggle helper for KPI quick-filters
  const toggleStockFilter = (value) => setStockFilter(prev => prev === value ? null : value);

  // --- REAL-TIME LISTENER FOR DYNAMIC CATEGORIES ---
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "inventory_categories"), async (snap) => {
      if (snap.empty) {
        try {
          const batch = writeBatch(db);
          const defaultCategories = [
            { name: 'medicine', isMedicine: true },
            { name: 'vaccine', isMedicine: true },
            { name: 'drug', isMedicine: true },
            { name: 'food', isMedicine: false },
            { name: 'supplies', isMedicine: false },
            { name: 'accessories', isMedicine: false },
            { name: 'lab', isMedicine: false }
          ];
          defaultCategories.forEach((cat) => {
            const newDocRef = doc(collection(db, "inventory_categories"));
            batch.set(newDocRef, cat);
          });
          await batch.commit();
        } catch (error) { console.error("Auto-seeding failed:", error); }
      } else {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Ensure UI dropdown only shows unique formatted values with their clinical status
        const catMap = new Map();
        list.forEach(c => {
          const name = c.name?.toLowerCase().trim();
          if (name && !catMap.has(name)) {
            catMap.set(name, { name, isMedicine: !!c.isMedicine });
          }
        });
        const uniqueCats = Array.from(catMap.values());
        uniqueCats.sort((a,b) => a.name.localeCompare(b.name));
        setInvCategories(uniqueCats);
      }
    });

    return () => unsub();
  },[]);  

  // --- KPI ANALYTICS ENGINE ---
  const kpis = useMemo(() => {
    const activeInventory = inventory.filter(item => !item.isArchived);
    let totalValue = 0, outOfStock = 0, lowStock = 0, expiringSoon = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    activeInventory.forEach(item => {
      const stock = Number(item.stock) || 0;
      const min = Number(item.minStock) || 10;
      const cost = Number(item.costPrice) || 0;
      totalValue += (stock * cost);
      if (stock <= 0) outOfStock++;
      else if (stock <= min) lowStock++;
      if (item.expiryDate) {
        const expiry = new Date(item.expiryDate + 'T00:00:00');
        const daysUntil = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= 30) expiringSoon++;
      }
    });
    return { totalItems: activeInventory.length, totalValue, outOfStock, lowStock, expiringSoon };
  }, [inventory]);

  // --- MEMOIZED FILTER ENGINE ---
  const filteredItems = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return inventory.filter(item => {
      const matchSearch = (item.itemName || '').toLowerCase().includes(searchText.toLowerCase());
      const itemCat = (item.category || '').toLowerCase().trim();
      const matchCat = filterCategory === 'All' || itemCat === filterCategory.toLowerCase();
      const stock = Number(item.stock) || 0;
      const min   = Number(item.minStock) || 10;
      let matchStock = true;
      if (stockFilter === 'low')      matchStock = stock > 0 && stock <= min;
      else if (stockFilter === 'out') matchStock = stock <= 0;
      else if (stockFilter === 'expiring') {
        if (!item.expiryDate) { matchStock = false; }
        else {
          const expiry = new Date(item.expiryDate + 'T00:00:00');
          const daysUntil = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
          matchStock = daysUntil >= 0 && daysUntil <= 30;
        }
      }
      const matchArchive = showArchived ? !!item.isArchived : !item.isArchived;
      return matchSearch && matchCat && matchStock && matchArchive;
    });
  }, [inventory, searchText, filterCategory, stockFilter, showArchived]);

  // --- HANDLERS ---
  const handleSaveForm = async (data) => {
    try {
      if (selectedItem) await updateItem(selectedItem.id, data, selectedItem);
      else await createItem(data);
      setOpenForm(false);
      showToast(selectedItem ? "Item updated." : "New item created.");
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleAdjustStock = async (amount, reason) => {
    try { 
      await adjustStock(selectedItem.id, selectedItem.itemName, amount, reason); 
      setOpenAdjust(false);
      showToast(`Stock adjusted for ${selectedItem.itemName}.`);
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleDelete = (id, name) => {
    setSelectedItem({ id, itemName: name });
    setOpenDelete(true);
  };

  const handleConfirmDelete = async (id, name) => {
    try {
      await deleteItem(id, name);
      showToast(`"${name}" archived.`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleRestore = async (id, name) => {
    try {
      await restoreItem(id, name);
      showToast(`"${name}" restored to active inventory.`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleScrubDB = async () => {
    try {
      const count = await scrubDatabase();
      setOpenScrubConfirm(false);
      const msg = count > 0
        ? `Database cleaned: ${count} record(s) normalized.`
        : 'Database is already clean. No changes needed.';
      showToast(msg, "success");
    } catch (e) {
      setOpenScrubConfirm(false);
      showToast("Scrub failed: " + e.message, "error");
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      
      {/* 1. BOXED FORENSIC HEADER */}
      <Box sx={{ flexShrink: 0, mb: 0 }}>
        <Paper sx={{ 
          p: 2.5, px: 4, display: 'flex', flexWrap: 'nowrap', gap: 2.5, alignItems: 'center',
          bgcolor: '#FFF8E1', borderBottom: '2px solid #5D4037', borderRadius: 0, boxShadow: 'none'
        }}>
          <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: 1000, color: '#5D4037', textTransform: 'uppercase', letterSpacing: 1, flexShrink: 0, mr: 1, fontSize: '1.5rem', lineHeight: 1 }}>
            Inventory Command Center
          </Typography>

          {/* Search */}
          <TextField
            variant="standard"
            placeholder="SEARCH ITEMS..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#5D4037', opacity: 0.6, ml: 1 }} /></InputAdornment>,
              disableUnderline: true,
              style: { color: '#3E2723', fontWeight: 'bold', fontSize: '0.9rem' },
            }}
            sx={{ width: 220, flexShrink: 0, bgcolor: 'rgba(93, 64, 55, 0.05)', border: '1px solid #5D403733', borderRadius: 1, px: 1.5, py: 0.5 }}
          />

          {/* Category dropdown */}
          <FormControl size="small" sx={{ minWidth: 160, flexShrink: 0 }}>
            <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} displayEmpty sx={{ bgcolor: 'white', fontWeight: 'bold', fontSize: '0.85rem', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733' } }}>
              <MenuItem value="All">All Categories</MenuItem>
              {invCategories.map(c => <MenuItem key={c.name} value={c.name}>{formatCategory(c.name)}</MenuItem>)}
            </Select>
          </FormControl>

          {/* Low Stock toggle */}
          <FormControlLabel
            control={<Switch checked={stockFilter === 'low'} onChange={(e) => setStockFilter(e.target.checked ? 'low' : null)} color="error" size="small" />}
            label={<Typography variant="body2" sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.65rem', textTransform: 'uppercase' }} color={stockFilter === 'low' ? 'error.main' : '#5D4037'}>Low Stock</Typography>}
            sx={{ ml: 1, flexShrink: 0 }}
          />

          {/* Archived toggle */}
          <FormControlLabel
            control={<Switch checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} color="warning" size="small" />}
            label={<Typography variant="body2" sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.65rem', textTransform: 'uppercase' }} color={showArchived ? '#E65100' : '#5D4037'}>Archived</Typography>}
            sx={{ ml: 1, flexShrink: 0 }}
          />

          <Typography variant="body2" sx={{ fontFamily: FONT, color: '#5D4037', fontWeight: 900, whiteSpace: 'nowrap', flexShrink: 0, fontStyle: 'italic', ml: 1 }}>
            {filteredItems.length} Records
          </Typography>

          <Box sx={{ flexGrow: 1 }} />

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            sx={{ bgcolor: '#D32F2F', fontFamily: FONT, fontWeight: 1000, boxShadow: '4px 4px 0px rgba(211, 47, 47, 0.1)', textTransform: 'uppercase', letterSpacing: 1, px: 3, py: 1, borderRadius: 0, border: '2px solid #B71C1C', '&:hover': { bgcolor: '#B71C1C' } }}
            onClick={() => { setSelectedItem(null); setOpenForm(true); }}
          >
            Add Item
          </Button>

          <IconButton size="small" onClick={() => setOpenScrubConfirm(true)} sx={{ color: '#5D4037', bgcolor: 'transparent', border: '1px solid #5D403733', ml: 1 }}>
            <AutoFixHighIcon fontSize="small" />
          </IconButton>
        </Paper>
      </Box>

      {/* 2. BOXED KPI ROW */}
      <Box sx={{ flexShrink: 0, mb: 0 }}>
        <Paper sx={{ p: 0, px: 4, bgcolor: '#F5F5F5', borderBottom: '2px solid #5D4037', borderRadius: 0, boxShadow: 'none' }}>
          <Grid container spacing={0} sx={{ '& > div:not(:last-child)': { borderRight: '1px solid #5D40371A' } }}>
             <Grid size={{ xs: true }}><KPICard title="Total Value" value={`₱${kpis.totalValue.toLocaleString(undefined, {minimumFractionDigits: 2})}`} icon={<AttachMoneyIcon />} color="#2E7D32" /></Grid>
             <Grid size={{ xs: true }}><KPICard title="Active SKUs" value={kpis.totalItems} icon={<InventoryIcon />} color="#1565C0" /></Grid>
             <Grid size={{ xs: true }}><KPICard title="Expiring Soon" value={kpis.expiringSoon} icon={<EventBusyIcon />} color="#6A1B9A" onClick={() => toggleStockFilter('expiring')} active={stockFilter === 'expiring'} /></Grid>
             <Grid size={{ xs: true }}><KPICard title="Low Stock" value={kpis.lowStock} icon={<WarningAmberIcon />} color="#E65100" onClick={() => toggleStockFilter('low')} active={stockFilter === 'low'} /></Grid>
             <Grid size={{ xs: true }}><KPICard title="Out of Stock" value={kpis.outOfStock} icon={<ErrorOutlineIcon />} color="#D32F2F" onClick={() => toggleStockFilter('out')} active={stockFilter === 'out'} /></Grid>
          </Grid>
        </Paper>
      </Box>

      {/* VIEW TABS */}
      <Box sx={{ mb: 0, px: 4, bgcolor: '#FFFBF5', borderBottom: `1px solid ${COLORS.border}` }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            '& .MuiTab-root': { fontFamily: FONT, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: '0.75rem', minHeight: 44, px: 3 },
            '& .MuiTabs-indicator': { bgcolor: COLORS.cta, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
            '& .Mui-selected': { color: `${COLORS.cta} !important` },
            minHeight: 44,
          }}
        >
          <Tab label="Inventory Table" />
          <Tab label="Activity Log" icon={<span style={{ fontSize: '0.85rem' }}>🕑</span>} iconPosition="start" />
        </Tabs>
      </Box>

      {/* 3. BOXED CONTENT AREA (FLEX: 1) */}
      <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* THE TABLE */}
      {activeTab === 0 && (
        <InventoryTable
          data={filteredItems}
          onEdit={(item) => { setSelectedItem(item); setOpenForm(true); }}
          onAdjust={(item) => { setSelectedItem(item); setOpenAdjust(true); }}
          onLog={(item) => { setSelectedItem(item); setOpenLog(true); }}
          onDelete={handleDelete}
          showArchived={showArchived}
          onRestore={handleRestore}
        />
      )}

      {/* GLOBAL ACTIVITY LOG */}
      {activeTab === 1 && <GlobalActivityLog />}
      </Box>

      {/* MODALS */}
      {openForm && (
        <ProductFormModal 
          key={selectedItem?.id || 'new'} 
          open={openForm} 
          onClose={() => setOpenForm(false)} 
          item={selectedItem} 
          onSave={handleSaveForm}
          categories={invCategories}
          showToast={showToast}
        />
      )}
      
      {openAdjust && (
        <StockAdjustModal 
          key={selectedItem ? `adj-${selectedItem.id}` : 'none'} 
          open={openAdjust} 
          onClose={() => setOpenAdjust(false)} 
          item={selectedItem} 
          onAdjust={handleAdjustStock} 
        />
      )}

      {openLog && (
        <InventoryLogModal
          key={selectedItem ? `log-${selectedItem.id}` : 'log'}
          open={openLog}
          onClose={() => setOpenLog(false)}
          item={selectedItem}
        />
      )}

      <ConfirmDeleteModal
        open={openDelete}
        onClose={() => setOpenDelete(false)}
        item={selectedItem}
        onConfirm={handleConfirmDelete}
      />

      <Dialog open={openScrubConfirm} onClose={() => setOpenScrubConfirm(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: '2px solid #5D4037', boxShadow: '8px 8px 0px rgba(93,64,55,0.1)' } }}>
        <DialogTitle sx={{ bgcolor: '#FFF8E1', color: '#3E2723', fontWeight: 1000, borderBottom: '2px solid #5D4037', fontFamily: FONT, textTransform: 'uppercase', letterSpacing: 1, fontSize: '1rem' }}>
          CONFIRM DATABASE SCRUB
        </DialogTitle>
        <DialogContent sx={{ p: 3, bgcolor: '#FAF9F7' }}>
          <Typography variant="body2" sx={{ fontFamily: FONT, color: '#5D4037' }}>
            This will normalize all category names to lowercase, remove duplicate categories, and update all inventory items to use normalized category names.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#FFF8E1', borderTop: '2px solid #5D4037' }}>
          <Button onClick={() => setOpenScrubConfirm(false)} sx={{ fontWeight: 1000, color: '#5D4037', borderRadius: 0, border: '2px solid #5D4037', fontFamily: FONT }}>CANCEL</Button>
          <Button onClick={handleScrubDB} variant="contained" sx={{ bgcolor: '#D84315', fontWeight: 1000, borderRadius: 0, border: '2px solid #BF360C', boxShadow: '4px 4px 0px rgba(216,67,21,0.2)', fontFamily: FONT, '&:hover': { bgcolor: '#BF360C' } }}>RUN SCRUB</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={()=>setToast({...toast, open: false})} anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}>
        <Alert severity={toast.severity} sx={{ width: '100%', fontFamily: FONT, fontWeight: 'bold', boxShadow: 3 }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}