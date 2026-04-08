import React, { useState, useMemo } from 'react';
import { 
  Box, Typography, Button, Paper, TextField, InputAdornment, 
  FormControl, Select, MenuItem, Snackbar, Alert 
} from '@mui/material';

// Icons
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';

// Logic & Components
import { useServices } from './hooks/useServices';
import ServiceTable from './components/ServiceTable';
import ServiceFormModal from './modals/ServiceFormModal';

// Design Tokens
import { COLORS } from '../../theme/designTokens';

export default function Services() {
  const { services, inventory, departments, saveService, removeService } = useServices();

  // --- UI & MODAL STATES ---
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterSpecies, setFilterSpecies] = useState('All');
  const [open, setOpen] = useState(false);
  const[selectedItem, setSelectedItem] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });

  // Memoized Filter Engine (Sorting is now handled inside the table)
  const filteredServices = useMemo(() => {
    return services.filter(s => {
      const matchSearch = (s.name || '').toLowerCase().includes(searchText.toLowerCase());
      const matchCategory = filterCategory === 'All' || (s.department || s.category) === filterCategory;
      const matchSpecies = filterSpecies === 'All' || s.targetSpecies === filterSpecies || s.targetSpecies === 'Universal';
      return matchSearch && matchCategory && matchSpecies;
    });
  }, [services, searchText, filterCategory, filterSpecies]);

  const handleSave = async (formData) => {
    try {
      await saveService(selectedItem?.id, formData);
      setOpen(false);
      showToast(selectedItem ? "Service updated." : "New service created.", "success");
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete the "${name}" service?`)) {
      try { await removeService(id); showToast("Service deleted.", "success"); } 
      catch (e) { showToast(e.message, "error"); }
    }
  };

  const headerFlatStyle = {
    background: '#FFF8E1', 
    border: '2px solid #5D4037',
    boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)', 
    borderRadius: 0, 
  };

  const clinicalFlatStyle = {
    background: '#FFF', 
    border: '2px solid #5D4037',
    boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)', 
    borderRadius: 0, 
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden', bgcolor: COLORS.surfaceAlt }}>
      <Paper sx={{ 
        bgcolor: '#FFF8E1', 
        border: '0px',
        borderBottom: '2px solid #5D4037',
        borderRadius: 0, 
        p: 2, 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: 2, 
        flexShrink: 0 
      }}>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: '1000', color: '#5D4037', textTransform: 'uppercase', letterSpacing: 0.5, mr: 1, fontSize: '1.5rem' }}>Services</Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#EFEBE9', borderRadius: 0, border: '2px solid #5D4037', p: 0.5 }}>
            <TextField 
              variant="standard" placeholder="SEARCH SERVICES..." value={searchText} onChange={(e) => setSearchText(e.target.value)} 
              InputProps={{ 
                  startAdornment: <InputAdornment position="start"><SearchIcon sx={{color: 'rgba(255,255,255,0.8)', ml: 1}}/></InputAdornment>,
                  disableUnderline: true, style: { color: 'white', fontWeight: 'bold', textTransform: 'uppercase' } 
              }} 
              sx={{ width: 260, bgcolor: '#5D4037', borderRadius: 0, px: 2, py: 0.5, '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.6)', opacity: 1 } }} 
            />
          </Box>

          <FormControl size="small" sx={{ width: 180, bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 0 }}>
              <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} displayEmpty sx={{ '& fieldset': { border: 'none' }, fontWeight: 'bold' }}>
                  <MenuItem value="All">All Departments</MenuItem>
                  {departments.map(d => <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>)}
              </Select>
          </FormControl>

          <FormControl size="small" sx={{ width: 160, bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 0 }}>
              <Select value={filterSpecies} onChange={(e) => setFilterSpecies(e.target.value)} displayEmpty sx={{ '& fieldset': { border: 'none' }, fontWeight: 'bold' }}>
                  <MenuItem value="All">All Species</MenuItem>
                  <MenuItem value="Universal">🐾 Universal</MenuItem>
                  <MenuItem value="Canine">🐶 Canine</MenuItem>
                  <MenuItem value="Feline">🐱 Feline</MenuItem>
              </Select>
          </FormControl>
          
          <Typography variant="body2" sx={{ color: '#5D4037', fontStyle: 'italic', fontWeight: '900', letterSpacing: 0.5, ml: 1 }}>
            {filteredServices.length} {filteredServices.length === 1 ? 'Record' : 'Records'}
          </Typography>
        </Box>

        <Box>
          <Button 
              variant="contained" startIcon={<AddIcon />} 
              sx={{ bgcolor: '#FF9800', fontWeight: '1000', boxShadow: '0 4px 15px rgba(255, 152, 0, 0.4)', textTransform: 'uppercase', letterSpacing: 0.5, px: 3, whiteSpace: 'nowrap' }} 
              onClick={() => { setSelectedItem(null); setOpen(true); }}
          >
            New Service
          </Button>
        </Box>
      </Paper>

      <Box sx={{ flexGrow: 1, overflow: 'hidden', p: 0, bgcolor: COLORS.surface, display: 'flex', flexDirection: 'column' }}>
        <ServiceTable data={filteredServices} onEdit={(row) => { setSelectedItem(row); setOpen(true); }} onDelete={handleDelete} clinicalFlatStyle={clinicalFlatStyle} departments={departments} />
      </Box>

      {open && (
        <ServiceFormModal 
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