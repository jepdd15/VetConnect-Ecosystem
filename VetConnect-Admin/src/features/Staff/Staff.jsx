import React, { useState, useMemo } from 'react';
import { Box, Typography, Paper, Button, TextField, InputAdornment, Snackbar, Alert } from '@mui/material';

import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SearchIcon from '@mui/icons-material/Search';

// Logic & Components
import { useStaffManager } from './hooks/useStaffManager';
import StaffTable from './components/StaffTable';
import StaffFormModal from './modals/StaffFormModal';

export default function Staff() {
  // 1. Pull data from the Brain (The Custom Hook)
  const { staffList, departments, getWorkload, saveStaff, removeStaff } = useStaffManager();
  
  // 2. Local UI States
  const [searchText, setSearchText] = useState('');
  const[open, setOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });

  // 3. Memoized Search Engine
  const filteredStaff = useMemo(() => {
    return staffList.filter(u => (u.fullName || '').toLowerCase().includes(searchText.toLowerCase()));
  }, [staffList, searchText]);

  // 4. Action Handlers
  const handleSave = async (formData) => {
    try {
      await saveStaff(selectedItem?.id, formData);
      showToast(selectedItem ? "Profile Updated." : "Staff Authorized.", "success");
      setOpen(false);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to revoke system access for ${name}?`)) {
      try { await removeStaff(id); showToast("Access Revoked.", "success"); } 
      catch (e) { showToast(e.message, "error"); }
    }
  };

  // 5. Theming
  const glassStyle = { 
    background: 'rgba(255, 255, 255, 0.55)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', 
    border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 8px 32px 0 rgba(139, 69, 19, 0.08)', borderRadius: 3, 
  };

  return (
    <Box>
      {/* THE UX FIX: Unified High-Contrast Command Center Bar with Perfect Alignment */}
      <Paper sx={{ ...glassStyle, p: 2, mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        
        {/* LEFT SIDE: Title & Search */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Typography variant="h4" sx={{ fontWeight: '900', color: '#5D4037', textShadow: '0px 1px 2px rgba(255,255,255,0.8)' }}>
            Staff & Resources
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.9)' }}>
            <TextField 
              variant="standard"
              size="small" 
              placeholder="Search staff name..." 
              value={searchText} 
              onChange={(e) => setSearchText(e.target.value)} 
              InputProps={{ 
                // THE FIX: Added alignItems center and minor margin fixes so text and icon align perfectly
                startAdornment: <InputAdornment position="start" sx={{ mt: 0 }}><SearchIcon sx={{color: 'white'}}/></InputAdornment>,
                disableUnderline: true,
                style: { color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center' } 
              }} 
              sx={{ 
                width: 300, 
                bgcolor: '#5D4037', // Starbarks Dark Brown
                borderRadius: 2,
                p: '6px 12px',
                boxShadow: 2,
                display: 'flex',
                justifyContent: 'center'
              }} 
            />
          </Box>
          
          <Typography variant="body2" sx={{ color: '#5D4037', fontStyle: 'italic', fontWeight: '900', letterSpacing: 0.5 }}>
            {filteredStaff.length} Active Personnel
          </Typography>
        </Box>

        {/* RIGHT SIDE: Action Button */}
        <Box>
          <Button 
            variant="contained" 
            startIcon={<PersonAddIcon />} 
            sx={{ bgcolor: '#FF9800', fontWeight: '900', boxShadow: '0 4px 15px rgba(255, 152, 0, 0.4)', textTransform: 'uppercase', letterSpacing: 0.5, px: 3 }} 
            onClick={() => { setSelectedItem(null); setOpen(true); }}
          >
            Add Staff
          </Button>
        </Box>
      </Paper>

      {/* THE TABLE */}
      <StaffTable 
        data={filteredStaff} 
        getWorkload={getWorkload} 
        onEdit={(row) => { setSelectedItem(row); setOpen(true); }} 
        onDelete={handleDelete} 
        glassStyle={glassStyle}
        departments={departments}
      />

      {/* THE MODAL */}
      {open && (
        <StaffFormModal 
          key={selectedItem?.id || 'new_staff'} 
          open={open} 
          onClose={() => setOpen(false)} 
          item={selectedItem} 
          dynamicDepartments={departments} 
          onSave={handleSave} 
          showToast={showToast} 
        />
      )}

      {/* ALERTS */}
      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast({...toast, open: false})} anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}>
        <Alert severity={toast.severity} sx={{ width: '100%', fontWeight: 'bold', boxShadow: 3 }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}