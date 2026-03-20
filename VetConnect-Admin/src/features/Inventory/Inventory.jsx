import React, { useState, useMemo } from 'react';
import { Box, Typography, Button, Paper, TextField, InputAdornment, IconButton, Menu, MenuItem, ListItemIcon, Divider } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';

import { useInventory } from './hooks/useInventory';
import InventoryTable from './components/InventoryTable'; 
import ProductFormModal from './modals/ProductFormModal';
import StockAdjustModal from './modals/StockAdjustModal';

export default function Inventory() {
  const { inventory, createItem, updateItem, deleteItem, adjustStock } = useInventory();
  const [search, setSearch] = useState('');
  
  const[openForm, setOpenForm] = useState(false);
  const [openAdjust, setOpenAdjust] = useState(false);
  const[selectedItem, setSelectedItem] = useState(null);

  const filteredItems = useMemo(() => 
    inventory.filter(i => (i.itemName || '').toLowerCase().includes(search.toLowerCase()))
  , [inventory, search]);

  const handleSaveForm = async (data) => {
    try {
      if (selectedItem) await updateItem(selectedItem.id, data);
      else await createItem(data);
      setOpenForm(false);
    } catch (e) { alert(e.message); }
  };

  const handleAdjustStock = async (amount) => {
    try { await adjustStock(selectedItem.id, amount); setOpenAdjust(false); } 
    catch (e) { alert(e.message); }
  };

  const handleDelete = async (item) => {
    if (item.stock > 0) return alert(`Cannot delete. Active Stock is ${item.stock}.`);
    if (window.confirm(`Are you sure you want to delete ${item.itemName}?`)) {
      try { await deleteItem(item.id); } 
      catch (e) { alert(e.message); }
    }
  };

  const glassStyle = { 
    background: 'rgba(255, 255, 255, 0.55)', 
    backdropFilter: 'blur(16px)', 
    border: '1px solid rgba(255, 255, 255, 0.8)', 
    boxShadow: '0 8px 32px 0 rgba(139, 69, 19, 0.08)', 
    borderRadius: 3 
  };

  return (
    <Box>
      {/* THEME FIX: COMMAND CENTER HEADER */}
      <Paper sx={{ ...glassStyle, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: '900', color: '#5D4037', textShadow: '0px 1px 2px rgba(255,255,255,0.8)' }}>
            Inventory
          </Typography>
          
          <TextField 
            variant="standard"
            size="small" 
            placeholder="Search items..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            InputProps={{ 
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{color: 'white'}}/></InputAdornment>,
              disableUnderline: true,
              style: { color: 'white', fontWeight: 'bold' }
            }} 
            sx={{ 
              width: 300, 
              bgcolor: '#5D4037', // <--- STARBARKS BROWN!
              borderRadius: 2,
              p: '6px 12px',
              boxShadow: 2
            }} 
          />
          
          <Typography variant="caption" sx={{ color: '#888', fontStyle: 'italic', fontWeight: 'bold' }}>
            {filteredItems.length} {filteredItems.length === 1 ? 'Record' : 'Records'}
          </Typography>
        </Box>

        <Button 
          variant="contained" 
          startIcon={<AddIcon />} 
          sx={{ bgcolor: '#FF9800', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, px: 3 }} 
          onClick={() => { setSelectedItem(null); setOpenForm(true); }}
        >
          Add Item
        </Button>
      </Paper>

      <InventoryTable 
        data={filteredItems} 
        onEdit={(item) => { setSelectedItem(item); setOpenForm(true); }}
        onAdjust={(item) => { setSelectedItem(item); setOpenAdjust(true); }}
        onDelete={handleDelete}
        glassStyle={glassStyle}
      />

      {openForm && <ProductFormModal key={selectedItem?.id || 'new'} open={openForm} onClose={() => setOpenForm(false)} item={selectedItem} onSave={handleSaveForm} />}
      {openAdjust && <StockAdjustModal key={selectedItem ? `adj-${selectedItem.id}` : 'none'} open={openAdjust} onClose={() => setOpenAdjust(false)} item={selectedItem} onAdjust={handleAdjustStock} />}
    </Box>
  );
}