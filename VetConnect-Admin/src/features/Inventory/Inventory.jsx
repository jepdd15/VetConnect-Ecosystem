import React, { useState, useMemo, useEffect } from 'react';
import { 
  Box, Typography, Button, Paper, TextField, InputAdornment, 
  FormControl, Select, MenuItem, Switch, FormControlLabel, 
  Snackbar, Alert, IconButton, Tabs, Tab
} from '@mui/material';
import Grid from '@mui/material/Grid';

// Design Tokens
import { FONT, TYPE, COLORS, GLASS } from '../../theme/designTokens';

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
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const KPICard = ({ title, value, icon, color, bgcolor, border, onClick, active }) => (
  <Paper
    elevation={0}
    onClick={onClick}
    sx={{
      p: 2.5, display: 'flex', alignItems: 'center', gap: 2,
      borderRadius: 2.5,
      border: `${active ? 2 : 1}px solid ${active ? color : border}`,
      bgcolor: active ? `${color}18` : bgcolor,
      boxShadow: active ? `0 6px 20px ${color}30` : '0 4px 20px rgba(0,0,0,0.02)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.2s ease',
      '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: `0 8px 24px ${color}25`, border: `2px solid ${color}` } : {},
    }}
  >
    <Box sx={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: `${color}1A`, color: color }}>
      {icon}
    </Box>
    <Box>
      <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted }}>{title}</Typography>
      <Typography variant="h5" sx={{ fontFamily: FONT, color: active ? color : COLORS.textPrimary, fontWeight: 900 }}>{value}</Typography>
    </Box>
  </Paper>
);

export default function Inventory() {
  const { inventory, createItem, updateItem, deleteItem, adjustStock, scrubDatabase } = useInventory();
  
  const [searchText, setSearchText] = useState(''); 
  const [filterCategory, setFilterCategory] = useState('All');
  const [stockFilter, setStockFilter] = useState(null); // null | 'low' | 'out'
  
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
          const defaultCategories = ['medicine', 'vaccine', 'food', 'supplies', 'accessories', 'lab'];
          defaultCategories.forEach((catName) => {
            const newDocRef = doc(collection(db, "inventory_categories"));
            batch.set(newDocRef, { name: catName });
          });
          await batch.commit();
        } catch (error) { console.error("Auto-seeding failed:", error); }
      } else {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Ensure UI dropdown only shows unique formatted values
        const uniqueCats = Array.from(new Set(list.map(c => c.name?.toLowerCase().trim()))).filter(Boolean);
        uniqueCats.sort();
        setInvCategories(uniqueCats);
      }
    });

    return () => unsub();
  },[]);  

  // --- KPI ANALYTICS ENGINE ---
  const kpis = useMemo(() => {
    let totalValue = 0, outOfStock = 0, lowStock = 0, expiringSoon = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    inventory.forEach(item => {
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
    return { totalItems: inventory.length, totalValue, outOfStock, lowStock, expiringSoon };
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
      return matchSearch && matchCat && matchStock;
    });
  }, [inventory, searchText, filterCategory, stockFilter]);

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
      showToast(`"${name}" permanently deleted.`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleScrubDB = async () => {
    try {
      await scrubDatabase();
      showToast("Database cleaned & normalized!", "success");
    } catch (e) {
      showToast("Scrub failed.", "error");
    }
  };

  const glassStyle = GLASS.panel;

  return (
    <Box sx={{ overflow: 'hidden', width: '100%' }}>
      
      {/* SINGLE-ROW ACTION BAR — matches Services / Staff pattern */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'nowrap', minWidth: 0 }}>

        {/* Title */}
        <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.accent, letterSpacing: -0.5, flexShrink: 0, mr: 1 }}>
          Inventory Command Center
        </Typography>

        {/* Search — dark brown pill, same as Services */}
        <TextField
          variant="standard"
          placeholder="Search items..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: 'rgba(255,255,255,0.8)' }} /></InputAdornment>,
            disableUnderline: true,
            style: { color: 'white', fontWeight: 'bold' },
          }}
          sx={{ width: 200, flexShrink: 0, bgcolor: COLORS.accent, borderRadius: 2, px: 2, py: 0.5, boxShadow: 2, '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.6)', opacity: 1 } }}
        />

        {/* Category dropdown */}
        <FormControl size="small" sx={{ minWidth: 150, flexShrink: 0 }}>
          <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} displayEmpty sx={{ borderRadius: 2, fontWeight: 'bold', bgcolor: 'white' }}>
            <MenuItem value="All">All Categories</MenuItem>
            {invCategories.map(c => <MenuItem key={c} value={c}>{formatCategory(c)}</MenuItem>)}
          </Select>
        </FormControl>

        {/* Low Stock toggle — linked to stockFilter state */}
        <FormControlLabel
          control={<Switch checked={stockFilter === 'low'} onChange={(e) => setStockFilter(e.target.checked ? 'low' : null)} color="error" size="small" />}
          label={<Typography variant="body2" fontWeight="900" sx={{ whiteSpace: 'nowrap' }} color={stockFilter === 'low' ? 'error.main' : 'textSecondary'}>Low Stock Only</Typography>}
          sx={{ ml: 0, flexShrink: 0 }}
        />

        {/* Record count */}
        <Typography variant="body2" sx={{ fontFamily: FONT, color: COLORS.accent, fontWeight: 900, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {filteredItems.length} {filteredItems.length === 1 ? 'Record' : 'Records'}
        </Typography>

        {/* Spacer */}
        <Box sx={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }} />

        {/* Add Item */}
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          sx={{ bgcolor: COLORS.cta, fontFamily: FONT, fontWeight: 900, boxShadow: `0 4px 15px ${COLORS.cta}66`, textTransform: 'uppercase', letterSpacing: 0.5, px: 3, borderRadius: 2, '&:hover': { bgcolor: COLORS.ctaHover }, whiteSpace: 'nowrap', flexShrink: 0 }}
          onClick={() => { setSelectedItem(null); setOpenForm(true); }}
        >
          Add Item
        </Button>

        {/* Scrub DB */}
        <IconButton size="small" onClick={handleScrubDB} sx={{ color: '#9E9E9E', bgcolor: 'white', border: '1px solid #E0E0E0', flexShrink: 0 }}>
          <AutoFixHighIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* KPI DASHBOARD ROW */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, mb: 2, width: '100%', minWidth: 0 }}>
       <Box sx={{ flex: 1, minWidth: 0 }}>
           <KPICard title="Total Value" value={`₱${kpis.totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} icon={<AttachMoneyIcon />} color={COLORS.success} bgcolor={COLORS.kpiGreenBg} border={COLORS.kpiGreenBorder} />
         </Box>
         <Box sx={{ flex: 1, minWidth: 0 }}>
           <KPICard title="Active SKUs" value={kpis.totalItems} icon={<InventoryIcon />} color={COLORS.info} bgcolor={COLORS.kpiBlueBg} border={COLORS.kpiBlueBorder} />
         </Box>
         <Box sx={{ flex: 1, minWidth: 0 }}>
           <KPICard
             title="Expiring ≤30d" value={kpis.expiringSoon}
             icon={<EventBusyIcon />} color={COLORS.grooming} bgcolor={COLORS.kpiPurpleBg} border={COLORS.kpiPurpleBorder}
             onClick={() => toggleStockFilter('expiring')}
             active={stockFilter === 'expiring'}
           />
         </Box>
         <Box sx={{ flex: 1, minWidth: 0 }}>
           <KPICard
             title="Critically Low" value={kpis.lowStock}
             icon={<WarningAmberIcon />} color="#E65100" bgcolor="#FFF7ED" border="#FDBA74"
             onClick={() => toggleStockFilter('low')}
             active={stockFilter === 'low'}
           />
         </Box>
         <Box sx={{ flex: 1, minWidth: 0 }}>
           <KPICard
             title="Out of Stock" value={kpis.outOfStock}
             icon={<ErrorOutlineIcon />} color={COLORS.danger} bgcolor={COLORS.kpiRedBg} border={COLORS.kpiRedBorder}
             onClick={() => toggleStockFilter('out')}
             active={stockFilter === 'out'}
           />
         </Box>
      </Box>

      {/* VIEW TABS */}
      <Box sx={{ mb: 1.5 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            '& .MuiTab-root': { fontFamily: FONT, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem', minHeight: 40 },
            '& .MuiTabs-indicator': { bgcolor: COLORS.cta, height: 3, borderRadius: 2 },
            '& .Mui-selected': { color: `${COLORS.cta} !important` },
            minHeight: 40,
          }}
        >
          <Tab label="Inventory Table" />
          <Tab label="Activity Log" icon={<span style={{ fontSize: '0.85rem' }}>🕑</span>} iconPosition="start" />
        </Tabs>
      </Box>

      {/* THE TABLE */}
      {activeTab === 0 && (
        <InventoryTable 
          data={filteredItems} 
          onEdit={(item) => { setSelectedItem(item); setOpenForm(true); }}
          onAdjust={(item) => { setSelectedItem(item); setOpenAdjust(true); }}
          onLog={(item) => { setSelectedItem(item); setOpenLog(true); }}
          onDelete={handleDelete}
          glassStyle={glassStyle}
        />
      )}

      {/* GLOBAL ACTIVITY LOG */}
      {activeTab === 1 && <GlobalActivityLog glassStyle={glassStyle} />}

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

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={()=>setToast({...toast, open: false})} anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}>
        <Alert severity={toast.severity} sx={{ width: '100%', fontFamily: FONT, fontWeight: 'bold', boxShadow: 3 }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}