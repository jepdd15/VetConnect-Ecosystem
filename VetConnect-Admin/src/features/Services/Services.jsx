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
      {/* THEME FIX: Unified High-Contrast Command Center Bar */}
      <Paper sx={{ ...glassStyle, p: 2, mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexGrow: 1 }}>
            <Typography variant="h4" sx={{ fontWeight: '900', color: '#5D4037', textShadow: '0px 1px 2px rgba(255,255,255,0.8)', mr: 2 }}>
                Services
            </Typography>
            
            <TextField 
                variant="standard" size="small" placeholder="Search services..." value={searchText} onChange={(e) => setSearchText(e.target.value)} 
                InputProps={{ 
                    startAdornment: <InputAdornment position="start"><SearchIcon sx={{color: 'white'}}/></InputAdornment>,
                    disableUnderline: true, style: { color: 'white', fontWeight: 'bold' }
                }} 
                sx={{ width: 280, bgcolor: '#5D4037', borderRadius: 2, p: '6px 12px', boxShadow: 2 }} 
            />

            <FormControl size="small" sx={{ width: 200, bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 1 }}>
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
        </Box>

        <Button 
            variant="contained" startIcon={<AddIcon />} 
            sx={{ bgcolor: '#FF9800', fontWeight: 'bold', px: 3, boxShadow: '0 4px 15px rgba(255, 152, 0, 0.4)' }} 
            onClick={() => { setSelectedItem(null); setOpen(true); }}
        >
          New Service
        </Button>
      </Paper>

      <ServiceTable data={filteredServices} onEdit={(row) => { setSelectedItem(row); setOpen(true); }} onDelete={handleDelete} glassStyle={glassStyle} />

      {open && (
        <ServiceFormModal 
          // THE MAGIC LINE: Whenever 'selectedItem' changes, the modal is recreated.
          key={selectedItem?.id || 'new-service'} 
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