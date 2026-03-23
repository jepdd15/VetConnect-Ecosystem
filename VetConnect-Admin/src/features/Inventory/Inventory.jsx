import React, { useState, useMemo, useEffect } from 'react'; // Added useEffect here
import { 
  Box, Typography, Button, Paper, TextField, InputAdornment, 
  FormControl, Select, MenuItem, Switch, FormControlLabel, 
  Snackbar, Alert 
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';

// Database
import { onSnapshot, collection, deleteDoc, doc, writeBatch  } from 'firebase/firestore'; 
import { db } from '../../firebaseConfig';

// Logic & Components
import { useInventory } from './hooks/useInventory';
import InventoryTable from './components/InventoryTable'; 
import ProductFormModal from './modals/ProductFormModal';
import StockAdjustModal from './modals/StockAdjustModal';

export default function Inventory() {
  const { inventory, createItem, updateItem, deleteItem, adjustStock } = useInventory();
  
  // --- UI & FILTER STATES ---
  // THE FIX: Renamed to match the rest of the code logic
  const [searchText, setSearchText] = useState(''); 
  const [filterCategory, setFilterCategory] = useState('All');
  const [showLowStock, setShowLowStock] = useState(false);
  
  const [invCategories, setInvCategories] = useState([]);

  const [openForm, setOpenForm] = useState(false);
  const [openAdjust, setOpenAdjust] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });

  // --- REAL-TIME LISTENER FOR DYNAMIC CATEGORIES ---
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "inventory_categories"), async (snap) => {
      
      // THE FIX: If the database is completely empty, safely auto-seed it!
      if (snap.empty) {
        try {
          const batch = writeBatch(db);
          const defaultCategories = ['Medicine', 'Vaccine', 'Food', 'Supplies', 'Accessories', 'Lab'];
          
          defaultCategories.forEach((catName) => {
            const newDocRef = doc(collection(db, "inventory_categories"));
            batch.set(newDocRef, { name: catName });
          });
          
          await batch.commit(); // This fires ONE single database update. No loops!
        } catch (error) {
          console.error("Auto-seeding failed:", error);
        }
      } else {
        // Normal behavior: load what's in the database
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        setInvCategories(list);
      }
    });

    return () => unsub();
  },[]);  

  // --- MEMOIZED FILTER ENGINE ---
  const filteredItems = useMemo(() => {
    return inventory.filter(item => {
      // 1. Search Filter
      const matchSearch = (item.itemName || '').toLowerCase().includes(searchText.toLowerCase());
      
      // 2. Category Filter
      const matchCat = filterCategory === 'All' || item.category === filterCategory;
      
      // 3. Low Stock Filter
      const isLow = (item.stock || 0) <= (item.minStock || 10);
      const matchStock = showLowStock ? isLow : true;

      return matchSearch && matchCat && matchStock;
    });
  }, [inventory, searchText, filterCategory, showLowStock]);

  // --- HANDLERS ---
  const handleSaveForm = async (data) => {
    try {
      if (selectedItem) await updateItem(selectedItem.id, data);
      else await createItem(data);
      setOpenForm(false);
      showToast(selectedItem ? "Item updated." : "New item created.");
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleAdjustStock = async (amount) => {
    try { 
      await adjustStock(selectedItem.id, amount); 
      setOpenAdjust(false);
      showToast("Stock level adjusted.");
    } 
    catch (e) { showToast(e.message, "error"); }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete ${name}?`)) {
      try { 
        await deleteItem(id); 
        showToast("Item deleted.");
      } catch (e) { showToast(e.message, "error"); }
    }
  };

  const glassStyle = { 
    background: 'rgba(255, 255, 255, 0.55)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', 
    border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 8px 32px 0 rgba(139, 69, 19, 0.08)', borderRadius: 3 
  };

  return (
    <Box>
      {/* HEADER BAR */}
      <Paper sx={{ ...glassStyle, p: 2, mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: '900', color: '#5D4037', textShadow: '0px 1px 2px rgba(255,255,255,0.8)', mr: 1 }}>
            Inventory
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.9)' }}>
            <TextField 
              variant="standard" 
              size="small" 
              placeholder="Search items..." 
              value={searchText} 
              onChange={(e) => setSearchText(e.target.value)} 
              InputProps={{ 
                  // THE ALIGNMENT FIX
                  startAdornment: <InputAdornment position="start" sx={{ mt: 0 }}><SearchIcon sx={{color: 'white'}}/></InputAdornment>,
                  disableUnderline: true, 
                  style: { color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center' } 
              }} 
              sx={{ 
                  width: 250, bgcolor: '#5D4037', borderRadius: 2, px: 2, py: 1, boxShadow: 2, display: 'flex', justifyContent: 'center',
                  '& .MuiInputBase-input': { padding: 0, ml: 0.5, '&::placeholder': { color: 'rgba(255,255,255,0.6)', opacity: 1 } },
                  '& .MuiInputAdornment-root': { marginTop: '0 !important' }
              }} 
            />
          </Box>

          {/* DYNAMIC CATEGORY FILTER */}
          <FormControl size="small" sx={{ width: 180, bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 1 }}>
              <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} displayEmpty sx={{ '& fieldset': { border: 'none' }, fontWeight: 'bold' }}>
                  <MenuItem value="All">All Categories</MenuItem>
                  {invCategories.map(c => <MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>)}
              </Select>
          </FormControl>

          {/* LOW STOCK TOGGLE */}
          <FormControlLabel 
            control={<Switch checked={showLowStock} onChange={(e) => setShowLowStock(e.target.checked)} color="error" size="small" />} 
            label={<Typography variant="body2" fontWeight="900" color={showLowStock ? "error.main" : "textSecondary"}>Low Stock Only</Typography>} 
            sx={{ ml: 1, bgcolor: 'rgba(255,255,255,0.7)', px: 1.5, py: 0.5, borderRadius: 2, border: '1px solid rgba(0,0,0,0.05)' }}
          />
          
          <Typography variant="body2" sx={{ color: '#5D4037', fontStyle: 'italic', fontWeight: '900', letterSpacing: 0.5, ml: 'auto' }}>
            {filteredItems.length} {filteredItems.length === 1 ? 'Item' : 'Items'}
          </Typography>
        </Box>

        <Button 
            variant="contained" 
            startIcon={<AddIcon />} 
            sx={{ bgcolor: '#FF9800', fontWeight: '900', boxShadow: '0 4px 15px rgba(255, 152, 0, 0.4)', textTransform: 'uppercase', letterSpacing: 0.5, px: 3, whiteSpace: 'nowrap' }} 
            onClick={() => { setSelectedItem(null); setOpenForm(true); }}
        >
          Add Item
        </Button>
      </Paper>

      {/* THE TABLE */}
      <InventoryTable 
        data={filteredItems} 
        onEdit={(item) => { setSelectedItem(item); setOpenForm(true); }}
        onAdjust={(item) => { setSelectedItem(item); setOpenAdjust(true); }}
        onDelete={handleDelete}
      />

      {/* MODALS */}
      {openForm && (
        <ProductFormModal 
          key={selectedItem?.id || 'new'} 
          open={openForm} 
          onClose={() => setOpenForm(false)} 
          item={selectedItem} 
          onSave={handleSaveForm}
          categories={invCategories} // Handing over the dynamic list
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

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={()=>setToast({...toast, open: false})} anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}>
        <Alert severity={toast.severity} sx={{ width: '100%', fontWeight: 'bold', boxShadow: 3 }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}