import React, { useState, useMemo, useEffect } from 'react';
import { Box, Typography, Paper, Button, TextField, MenuItem, InputAdornment, Snackbar, Alert, FormControl, Select } from '@mui/material';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

// Icons
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search'; 

// Components
import { useServices } from './hooks/useServices';
import ServiceTable from './components/ServiceTable';
import ServiceFormModal from './modals/ServiceFormModal';

export default function Services() {
  const { services, inventory, saveService, removeService } = useServices();
  
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterSpecies, setFilterSpecies] = useState('All');
  const [departments, setDepartments] = useState([]); // Dynamic Departments State

  const [open, setOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });

  // 1. Listen for Dynamic Departments
  useEffect(() => {
    const unsubDepts = onSnapshot(collection(db, "departments"), (snapshot) => {
      setDepartments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubDepts();
  }, []);

  // 2. Memoized Filter Engine
  const filteredServices = useMemo(() => {
    return services.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(searchText.toLowerCase());
      const matchCategory = filterCategory === 'All' || s.category === filterCategory;
      const matchSpecies = filterSpecies === 'All' || s.targetSpecies === filterSpecies || s.targetSpecies === 'Universal';
      return matchSearch && matchCategory && matchSpecies;
    });
  }, [services, searchText, filterCategory, filterSpecies]);

  const handleSave = async (formData) => {
    try {
      await saveService(selectedItem?.id, formData);
      showToast(selectedItem ? "Service Updated." : "Service Created.", "success");
      setOpen(false);
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to permanently delete ${name}?`)) {
      try { await removeService(id); showToast("Service Deleted.", "success"); } 
      catch (e) { showToast(e.message, "error"); }
    }
  };

  const glassStyle = { 
    background: 'rgba(255, 255, 255, 0.55)', backdropFilter: 'blur(16px)', 
    border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 8px 32px 0 rgba(139, 69, 19, 0.08)', borderRadius: 3 
  };

  return (
    <Box>
      {/* THE UX FIX: Unified High-Contrast Command Center Bar */}
      <Paper sx={{ ...glassStyle, p: 2, mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        
        {/* LEFT SIDE: Title, Search, Filters, & Counter */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: '900', color: '#5D4037', textShadow: '0px 1px 2px rgba(255,255,255,0.8)', mr: 1 }}>
            Services
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.9)' }}>
            <TextField 
            variant="standard" 
            placeholder="Search services..." 
            value={searchText} 
            onChange={(e) => setSearchText(e.target.value)} 
            InputProps={{ 
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 20 }}/>
                  </InputAdornment>
                ),
                disableUnderline: true, 
            }} 
            sx={{ 
                width: 260, 
                bgcolor: '#5D4037', 
                borderRadius: 2, 
                px: 2, 
                py: 1, // Controls the overall thickness of the bar
                boxShadow: 2, 
                // THE PIXEL-PERFECT FIXES:
                '& .MuiInputBase-root': { 
                  color: 'white', 
                  fontWeight: 'bold', 
                  display: 'flex', 
                  alignItems: 'center',
                  height: '100%'
                },
                '& .MuiInputBase-input': { 
                  padding: 0, // Kills the invisible padding pushing the text down!
                  ml: 0.5, // Adds a tiny gap between icon and text
                  '&::placeholder': { color: 'rgba(255,255,255,0.6)', opacity: 1 } 
                },
                '& .MuiInputAdornment-root': {
                  marginTop: '0 !important', // Kills the invisible margin pushing the icon down!
                }
            }} 
          />
          </Box>

          <FormControl size="small" sx={{ width: 180, bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 1 }}>
              <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} displayEmpty sx={{ '& fieldset': { border: 'none' }, fontWeight: 'bold' }}>
                  <MenuItem value="All">All Departments</MenuItem>
                  {departments.map(d => <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>)}
              </Select>
          </FormControl>

          <FormControl size="small" sx={{ width: 160, bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 1 }}>
              <Select value={filterSpecies} onChange={(e) => setFilterSpecies(e.target.value)} sx={{ '& fieldset': { border: 'none' }, fontWeight: 'bold' }}>
                  <MenuItem value="All">All Species</MenuItem>
                  <MenuItem value="Universal">🐾 Universal</MenuItem>
                  <MenuItem value="Canine">🐶 Canine</MenuItem>
                  <MenuItem value="Feline">🐱 Feline</MenuItem>
              </Select>
          </FormControl>
          
          {/* THE MISSING COUNTER FIX: Restored the catalog metric! */}
          <Typography variant="body2" sx={{ color: '#5D4037', fontStyle: 'italic', fontWeight: '900', letterSpacing: 0.5, ml: 1 }}>
            {filteredServices.length} {filteredServices.length === 1 ? 'Record' : 'Records'}
          </Typography>
        </Box>

        {/* RIGHT SIDE: Action Button */}
        <Box>
          <Button 
              variant="contained" 
              startIcon={<AddIcon />} 
              sx={{ bgcolor: '#FF9800', fontWeight: '900', boxShadow: '0 4px 15px rgba(255, 152, 0, 0.4)', textTransform: 'uppercase', letterSpacing: 0.5, px: 3 }} 
              onClick={() => { setSelectedItem(null); setOpen(true); }}
          >
            New Service
          </Button>
        </Box>
      </Paper>

      <ServiceTable 
        data={filteredServices} 
        onEdit={(row) => { setSelectedItem(row); setOpen(true); }} 
        onDelete={handleDelete} 
        glassStyle={glassStyle} 
        departments={departments} // <--- THE FIX: Passing the color map down!
      />

      {open && (
        <ServiceFormModal 
          key={selectedItem?.id || 'new-service'} // THE FIX: Forces a clean reboot!
          open={open} 
          onClose={() => setOpen(false)} 
          item={selectedItem} 
          inventory={inventory} 
          departments={departments} 
          onSave={handleSave} 
          showToast={showToast} 
        />
      )}

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast({...toast, open: false})} anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}>
        <Alert severity={toast.severity} sx={{ width: '100%', fontWeight: 'bold', boxShadow: 3 }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}