import React, { useState, useMemo, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, TextField, InputAdornment,
  FormControl, Select, MenuItem,
  Snackbar, Alert, IconButton, Tabs, Tab
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
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ArchiveIcon from '@mui/icons-material/Archive';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import PrintIcon from '@mui/icons-material/Print';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import CloseIcon from '@mui/icons-material/Close';

// Database
import { onSnapshot, collection, doc, writeBatch, getDocs, query } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

// Logic & Components
import { useInventory, findExpiredBatches } from './hooks/useInventory';
import { printReorderList } from '../../utils/printReorderList';
import { exportInventoryCSV } from '../../utils/exportInventoryCSV';
import { printInventoryReport } from '../../utils/printInventoryReport';
import InventoryTable from './components/InventoryTable'; 
import ProductFormModal from './modals/ProductFormModal';
import StockAdjustModal from './modals/StockAdjustModal';
import InventoryLogModal from './modals/InventoryLogModal';
import ConfirmDeleteModal from './modals/ConfirmDeleteModal';
import ExpiredDisposalModal from './modals/ExpiredDisposalModal';
import GlobalActivityLog from './components/GlobalActivityLog';
import InventoryCategoryManager from './components/InventoryCategoryManager';

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
      bgcolor: active ? `${color}1A` : COLORS.formBg,
      boxShadow: 'none',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.1s ease',
      height: '100%',
      width: '100%',
      '&:hover': onClick ? { bgcolor: active ? `${color}25` : COLORS.surfaceHover } : {},
    }}
  >
    <Box sx={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: `${color}1A`, color: color, border: `1px solid ${color}33` }}>
      {icon}
    </Box>
    <Box>
      <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, fontSize: '0.65rem' }}>{title}</Typography>
      <Typography variant="h5" sx={{ fontFamily: FONT, color: active ? color : COLORS.brand, fontWeight: 900, fontSize: '1.4rem' }}>{value}</Typography>
    </Box>
  </Paper>
);

export default function Inventory() {
  const { inventory, loading, createItem, updateItem, deleteItem, restoreItem, adjustStock, disposeExpiredBatches } = useInventory();

  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [stockFilter, setStockFilter] = useState(null); // null | 'low' | 'out'
  const [showArchived, setShowArchived] = useState(false);
  const [invCategories, setInvCategories] = useState([]);

  const [openForm, setOpenForm] = useState(false);
  const [openAdjust, setOpenAdjust] = useState(false);
  const [openLog, setOpenLog] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });

  const [activeTab, setActiveTab] = useState(0);
  const [openDisposal, setOpenDisposal] = useState(false);
  const [clinicSettings, setClinicSettings] = useState({});

  // One-shot fetch for clinic info used in printable reports
  useEffect(() => {
    getDocs(query(collection(db, 'clinic_settings'))).then((snap) => {
      const generalDoc = snap.docs.find((d) => d.id === 'general');
      if (generalDoc) setClinicSettings(generalDoc.data());
    }).catch((err) => console.error('[Inventory] clinicSettings fetch failed:', err));
  }, []);

  // Expired batch scan — recomputed whenever inventory changes
  const expiredItems = useMemo(() => findExpiredBatches(inventory), [inventory]);

  // Toggle helper for KPI quick-filters
  const toggleStockFilter = (value) => {
    setStockFilter(prev => prev === value ? null : value);
    setShowArchived(false);
  };
  const toggleArchived = () => {
    setShowArchived(prev => !prev);
    setStockFilter(null);
  };

  // --- REAL-TIME LISTENER FOR DYNAMIC CATEGORIES ---
  useEffect(() => {
    const seedDefaults = () => {
      const batch = writeBatch(db);
      const defaultCategories = [
        { name: 'medicine',    isMedicine: true,  productClass: 'medicine' },
        { name: 'vaccine',     isMedicine: true,  productClass: 'medicine' },
        { name: 'food',        isMedicine: false, productClass: 'retail' },
        { name: 'supplies',    isMedicine: false, productClass: 'medical_supply' },
        { name: 'accessories', isMedicine: false, productClass: 'retail' },
        { name: 'lab',         isMedicine: false, productClass: 'medical_supply' },
      ];
      defaultCategories.forEach((cat) => {
        const catRef = doc(db, "inventory_categories", `default_${cat.name}`);
        batch.set(catRef, cat, { merge: true });
      });
      batch.commit().catch(err => console.error("Auto-seeding failed:", err));
    };

    const unsub = onSnapshot(collection(db, "inventory_categories"), (snap) => {
      if (snap.empty) {
        seedDefaults();
      } else {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const catMap = new Map();
        list.forEach(c => {
          const name = c.name?.toLowerCase().trim();
          if (name && !catMap.has(name)) {
            catMap.set(name, {
              name,
              isMedicine: !!c.isMedicine,
              productClass: c.productClass || (c.isMedicine ? 'medicine' : 'retail'),
            });
          }
        });
        const uniqueCats = Array.from(catMap.values());
        uniqueCats.sort((a,b) => a.name.localeCompare(b.name));
        setInvCategories(uniqueCats);
      }
    });

    return () => unsub();
  },[]);  

  const toDateStr = (val) => {
    if (!val) return null;
    if (typeof val === 'string') return val;
    if (val?.toDate) return val.toDate().toISOString().slice(0, 10);
    return null;
  };

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
      // T2.166: Check both top-level expiryDate and per-batch expiry dates
      let isExpiring = false;
      const topExpiry = toDateStr(item.expiryDate);
      if (topExpiry) {
        const expiry = new Date(topExpiry + 'T00:00:00');
        const daysUntil = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= 30) isExpiring = true;
      }
      if (!isExpiring && item.batches?.length > 0) {
        for (const batch of item.batches) {
          const batchExpiry = toDateStr(batch.expiryDate);
          if (batchExpiry && batch.qty > 0) {
            const expiry = new Date(batchExpiry + 'T00:00:00');
            const daysUntil = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
            if (daysUntil >= 0 && daysUntil <= 30) { isExpiring = true; break; }
          }
        }
      }
      if (isExpiring) expiringSoon++;
    });
    const archivedCount = inventory.filter(item => item.isArchived).length;
    return { totalItems: activeInventory.length, totalValue, outOfStock, lowStock, expiringSoon, archivedCount };
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
        matchStock = false;
        const topExpiry = toDateStr(item.expiryDate);
        if (topExpiry) {
          const expiry = new Date(topExpiry + 'T00:00:00');
          const daysUntil = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
          if (daysUntil >= 0 && daysUntil <= 30) matchStock = true;
        }
        if (!matchStock && item.batches?.length > 0) {
          for (const batch of item.batches) {
            const batchExpiry = toDateStr(batch.expiryDate);
            if (batchExpiry && batch.qty > 0) {
              const expiry = new Date(batchExpiry + 'T00:00:00');
              const daysUntil = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
              if (daysUntil >= 0 && daysUntil <= 30) { matchStock = true; break; }
            }
          }
        }
      }
      const matchArchive = showArchived ? !!item.isArchived : !item.isArchived;
      return matchSearch && matchCat && matchStock && matchArchive;
    });
  }, [inventory, searchText, filterCategory, stockFilter, showArchived]);

  // Items currently at or below their minStock threshold (used by Reorder List button)
  const lowStockItems = useMemo(
    () => inventory.filter(
      (i) => !i.isArchived && (Number(i.stock) || 0) <= (Number(i.minStock) || 10)
    ),
    [inventory]
  );

  // Human-readable description of active filters — printed on the inventory report
  const filterSummary = useMemo(() => {
    const parts = [];
    if (searchText) parts.push(`Search: "${searchText}"`);
    if (filterCategory !== 'All') parts.push(`Category: ${formatCategory(filterCategory)}`);
    if (stockFilter === 'low') parts.push('Low Stock only');
    else if (stockFilter === 'out') parts.push('Out of Stock only');
    else if (stockFilter === 'expiring') parts.push('Expiring Soon only');
    if (showArchived) parts.push('Archived items');
    return parts.join(' | ');
  }, [searchText, filterCategory, stockFilter, showArchived]);

  // --- HANDLERS ---
  const handleSaveForm = async (data) => {
    try {
      const catObj = invCategories.find(c => c.name === (data.category || '').toLowerCase().trim());
      const derivedProductClass = data.productClassOverride
        || catObj?.productClass
        || (catObj?.isMedicine ? 'medicine' : 'retail');
      const enrichedData = {
        ...data,
        productClass: derivedProductClass,
        isMedicine: derivedProductClass === 'medicine',
      };
      delete enrichedData.productClassOverride;
      delete enrichedData.isMedicineOverride;

      if (selectedItem) await updateItem(selectedItem.id, enrichedData, selectedItem);
      else await createItem(enrichedData);
      setOpenForm(false);
      showToast(selectedItem ? "Item updated." : "New item created.");
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleAdjustStock = async (amount, reason, batchInfo = null, adjustmentType = null) => {
    try {
      await adjustStock(selectedItem.id, selectedItem.itemName, amount, reason, batchInfo, adjustmentType);
      setOpenAdjust(false);
      showToast(`Stock adjusted for ${selectedItem.itemName}.`);
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleDelete = (id, name) => {
    // T2.161a: Pass full item so ConfirmDeleteModal can show stock/reserved impact summary
    const fullItem = inventory.find(i => i.id === id);
    setSelectedItem(fullItem || { id, itemName: name });
    setOpenDelete(true);
  };

  const handleConfirmDelete = async (id, name) => {
    try {
      await deleteItem(id, name);
      showToast(`"${name}" archived.`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setOpenDelete(false); }
  };

  const handleRestore = async (id, name) => {
    try {
      await restoreItem(id, name);
      showToast(`"${name}" restored to active inventory.`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleDispose = async (items) => {
    try {
      const results = await disposeExpiredBatches(items);
      const totalDisposed = results.reduce((sum, r) => sum + r.totalDisposed, 0);
      setOpenDisposal(false);
      showToast(
        `Disposed ${totalDisposed} expired unit(s) across ${results.length} product(s).`,
        'success',
      );
    } catch (e) {
      showToast(e.message, 'error');
    }
  };


  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      
      {/* 1. BOXED FORENSIC HEADER */}
      <Box sx={{ flexShrink: 0, mb: 0 }}>
        <Paper sx={{
          p: 2,
          pl: { xs: 8, md: 4 },
          pr: 4,
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: 2, 
          justifyContent: 'space-between',
          alignItems: 'center',
          bgcolor: COLORS.cream, 
          borderBottom: `2px solid ${COLORS.accent}`, 
          borderRadius: 0, 
          boxShadow: 'none',
          minHeight: { xs: 'auto', md: 80 }
        }}>
          
          {/* LEFT SIDE: Identity & Filters */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 3, 
            flexWrap: 'wrap', 
            flexGrow: 1,
            flexBasis: '450px' 
          }}>
            <Box sx={{ flexShrink: 0 }}>
              <Typography variant="h4" sx={{ fontWeight: 1000, color: COLORS.brand, lineHeight: 1.1, textTransform: 'uppercase', letterSpacing: 1 }}>
                INVENTORY
              </Typography>
              <Typography sx={{ fontWeight: 900, color: COLORS.accent, fontSize: '0.85rem', letterSpacing: 1, fontStyle: 'italic' }}>
                {filteredItems.length} {filteredItems.length === 1 ? 'Record' : 'Records'}
              </Typography>
            </Box>

            {activeTab === 0 && (
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexGrow: 1, flexWrap: 'wrap' }}>
                <TextField
                  variant="outlined"
                  size="small"
                  placeholder="Search items..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ fontSize: 18, color: COLORS.brand }} />
                      </InputAdornment>
                    ),
                    ...(searchText && {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setSearchText('')}>
                            <CloseIcon sx={{ fontSize: 14, color: COLORS.brand }} />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }),
                  }}
                  sx={{
                    flex: { xs: '1 1 100%', sm: '1 1 220px' }, 
                    maxWidth: { xs: '100%', lg: 220 }, 
                    minWidth: 160,
                    '& .MuiOutlinedInput-root': {
                      fontWeight: 900,
                      fontSize: '0.85rem',
                      color: COLORS.brand,
                      bgcolor: '#FFF',
                      borderRadius: 0,
                      boxShadow: `2px 2px 0px ${COLORS.brand}`,
                      '& fieldset': { borderColor: COLORS.brand, borderWidth: 2 },
                      '&:hover fieldset': { borderColor: COLORS.brand },
                      '&.Mui-focused fieldset': { borderColor: COLORS.brand },
                    },
                  }}
                />

                <FormControl size="small" sx={{ minWidth: 160, flexShrink: 0 }}>
                  <Select 
                    value={filterCategory} 
                    onChange={(e) => setFilterCategory(e.target.value)} 
                    displayEmpty 
                    sx={{ 
                      bgcolor: COLORS.cardBg, 
                      fontWeight: '900', 
                      fontSize: '0.85rem', 
                      borderRadius: 0,
                      boxShadow: `2px 2px 0px ${COLORS.accent}1A`,
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.accent, borderWidth: 2 } 
                    }}
                  >
                    <MenuItem value="All">All Categories</MenuItem>
                    {invCategories.map(c => <MenuItem key={c.name} value={c.name}>{formatCategory(c.name)}</MenuItem>)}
                  </Select>
                </FormControl>
              </Box>
            )}
          </Box>

          {/* RIGHT SIDE: Actions */}
          <Box sx={{ 
            display: 'flex', 
            gap: 1.5, 
            alignItems: 'center', 
            flexGrow: 2, 
            justifyContent: { xs: 'flex-start', lg: 'flex-end' },
            flexWrap: { xs: 'nowrap', lg: 'wrap' },
            flexBasis: '600px',
            overflowX: { xs: 'auto', lg: 'visible' },
            width: { xs: '100%', lg: 'auto' },
            pb: { xs: 0.5, lg: 0 },
            '&::-webkit-scrollbar': { height: '6px' },
            '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(93, 64, 55, 0.2)', borderRadius: '3px' }
          }}>


            {activeTab === 0 && (
              <Button
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                disabled={filteredItems.length === 0}
                onClick={() => {
                  const timestamp = new Date().toISOString().slice(0, 10);
                  exportInventoryCSV(filteredItems, `inventory_${timestamp}.csv`);
                  showToast(`Exported ${filteredItems.length} items to CSV.`);
                }}
                sx={{
                  flexShrink: 0,
                  fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, px: 2, borderRadius: 0, border: '2px solid',
                  color: COLORS.medical, borderColor: `${COLORS.medical}33`, '&:hover': { bgcolor: COLORS.kpiBlueBg, borderColor: COLORS.medical }
                }}
              >
                Export CSV
              </Button>
            )}

            {/* T3.27: Printable inventory report — always visible on Inventory Table tab */}
            {activeTab === 0 && (
              <Button
                variant="outlined"
                startIcon={<PrintIcon />}
                disabled={filteredItems.length === 0}
                onClick={() => printInventoryReport(
                  filteredItems,
                  clinicSettings,
                  filterSummary,
                  () => showToast('Pop-up blocked — allow pop-ups for this site.', 'warning')
                )}
                sx={{
                  flexShrink: 0,
                  fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, px: 2, borderRadius: 0, border: '2px solid',
                  color: COLORS.accent, borderColor: `${COLORS.accent}33`, '&:hover': { bgcolor: COLORS.cream, borderColor: COLORS.accent }
                }}
              >
                Print Report
              </Button>
            )}



            <Button
              variant="contained"
              startIcon={<AddIcon />}
              sx={{ 
                flexShrink: 0,
                bgcolor: COLORS.sky, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, px: 3, borderRadius: 0, border: `2px solid ${COLORS.skyHover}`, 
                boxShadow: `4px 4px 0px ${COLORS.brand}1A`,
                '&:hover': { bgcolor: COLORS.skyHover } 
              }}
              onClick={() => { setSelectedItem(null); setOpenForm(true); }}
            >
              Add Item
            </Button>
          </Box>
        </Paper>
      </Box>
      <Box sx={{ flexShrink: 0, mb: 0 }}>
      {/* 2. BOXED KPI ROW */}
        <Paper sx={{ 
          p: 0, 
          bgcolor: COLORS.tableHeaderBg, 
          borderBottom: `2px solid ${COLORS.accent}`, 
          borderRadius: 0, 
          boxShadow: 'none',
          overflowX: 'auto',
          width: '100%',
          '&::-webkit-scrollbar': { height: '6px' },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(93, 64, 55, 0.2)', borderRadius: '3px' }
        }}>
          <Grid 
            container 
            spacing={0} 
            sx={{ 
              flexWrap: { xs: 'nowrap', md: 'wrap' },
              width: { xs: 'max-content', md: '100%' },
              minWidth: '100%',
              '& > div:not(:last-child)': { borderRight: `1px solid ${COLORS.accent}1A` } 
            }}
          >
             <Grid size={{ xs: 6, md: 2 }} sx={{ flexShrink: 0, minWidth: { xs: '160px', md: 'auto' } }}><KPICard title="Active Products" value={kpis.totalItems} icon={<InventoryIcon />} color={COLORS.medical} /></Grid>
             <Grid size={{ xs: 6, md: 2 }} sx={{ flexShrink: 0, minWidth: { xs: '160px', md: 'auto' } }}><KPICard title="Expiring Soon" value={kpis.expiringSoon} icon={<EventBusyIcon />} color={COLORS.kpiPurpleText} onClick={() => toggleStockFilter('expiring')} active={stockFilter === 'expiring'} /></Grid>
             <Grid size={{ xs: 6, md: 2 }} sx={{ flexShrink: 0, minWidth: { xs: '160px', md: 'auto' } }}><KPICard title="Low Stock" value={kpis.lowStock} icon={<WarningAmberIcon />} color={COLORS.warning} onClick={() => toggleStockFilter('low')} active={stockFilter === 'low'} /></Grid>
             <Grid size={{ xs: 6, md: 2 }} sx={{ flexShrink: 0, minWidth: { xs: '160px', md: 'auto' } }}><KPICard title="Out of Stock" value={kpis.outOfStock} icon={<ErrorOutlineIcon />} color={COLORS.danger} onClick={() => toggleStockFilter('out')} active={stockFilter === 'out'} /></Grid>
             <Grid size={{ xs: 6, md: 2 }} sx={{ flexShrink: 0, minWidth: { xs: '160px', md: 'auto' } }}><KPICard title="Archived" value={kpis.archivedCount} icon={<ArchiveIcon />} color={COLORS.warning} onClick={toggleArchived} active={showArchived} /></Grid>
             <Grid size={{ xs: 6, md: 2 }} sx={{ flexShrink: 0, minWidth: { xs: '160px', md: 'auto' } }}><KPICard title="Total Value" value={`₱${kpis.totalValue.toLocaleString(undefined, {minimumFractionDigits: 2})}`} icon={<AttachMoneyIcon />} color={COLORS.success} /></Grid>
          </Grid>
        </Paper>
      </Box>

      {/* VIEW TABS */}
      <Box sx={{ mb: 0, px: 4, bgcolor: COLORS.formBg, borderBottom: `1px solid ${COLORS.border}` }}>
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
          <Tab label="Categories" icon={<InventoryIcon sx={{ fontSize: '0.95rem' }} />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* 3. BOXED CONTENT AREA (FLEX: 1) */}
      <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* THE TABLE */}
      {activeTab === 0 && (
        <InventoryTable
          data={filteredItems}
          loading={loading}
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

      {/* INVENTORY CATEGORIES */}
      {activeTab === 2 && <InventoryCategoryManager inventory={inventory} />}
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

      <ExpiredDisposalModal
        open={openDisposal}
        onClose={() => setOpenDisposal(false)}
        expiredItems={expiredItems}
        onDispose={handleDispose}
      />


      <Snackbar open={toast.open} autoHideDuration={4000} onClose={()=>setToast({...toast, open: false})} anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}>
        <Alert severity={toast.severity} sx={{ width: '100%', fontFamily: FONT, fontWeight: 'bold', boxShadow: 3 }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}