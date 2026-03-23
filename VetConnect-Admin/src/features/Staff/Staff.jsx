import React, { useState, useMemo } from 'react';
import { Box, Typography, Paper, Button, TextField, InputAdornment, Snackbar, Alert, MenuItem } from '@mui/material';

import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SearchIcon from '@mui/icons-material/Search';

// Logic & Components
import { useStaffManager } from './hooks/useStaffManager';
import StaffTable from './components/StaffTable';
import StaffFormModal from './modals/StaffFormModal';

export default function Staff() {
  // 1. THE BRAIN: We now pull 'activeAppointments' to calculate live status inside our filter!
  const { staffList, departments, getWorkload, activeAppointments, saveStaff, removeStaff } = useStaffManager();
  
  // 2. UI STATES
  const [searchText, setSearchText] = useState('');
  const[open, setOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });

  // --- 3. THE NEW FILTER STATES ---
  const [filterDept, setFilterDept] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const[filterAccess, setFilterAccess] = useState('All');

  // --- 4. THE UPGRADED MULTI-AXIAL FILTER ENGINE ---
  const filteredStaff = useMemo(() => {
    return staffList.filter(u => {
      // A. Search Filter
      const matchSearch = (u.fullName || '').toLowerCase().includes(searchText.toLowerCase());
      
      // B. Department Filter
      const matchDept = filterDept === 'All' || (u.departments ||[]).includes(filterDept);
      
      // C. Access Level Filter
      const role = u.accessLevel || (u.role === 'admin' ? 'admin' : 'staff');
      const matchAccess = filterAccess === 'All' || role.toLowerCase() === filterAccess.toLowerCase();
      
      // D. Live Status (Workload) Filter
      const load = activeAppointments.filter(a => a.assignedVetId === u.id).length;
      const isBusy = load > 0;
      let matchStatus = true;
      if (filterStatus === 'Available') matchStatus = !isBusy;
      if (filterStatus === 'Busy') matchStatus = isBusy;

      return matchSearch && matchDept && matchAccess && matchStatus;
    });
  },[staffList, searchText, filterDept, filterStatus, filterAccess, activeAppointments]);

  // Action Handlers
  const handleSave = async (formData) => {
    try {
      await saveStaff(selectedItem?.id, formData);
      showToast(selectedItem ? "Profile Updated." : "Staff Authorized.", "success");
      setOpen(false);
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to revoke system access for ${name}?`)) {
      try { await removeStaff(id); showToast("Access Revoked.", "success"); } 
      catch (e) { showToast(e.message, "error"); }
    }
  };

  const glassStyle = { 
    background: 'rgba(255, 255, 255, 0.55)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', 
    border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 8px 32px 0 rgba(139, 69, 19, 0.08)', borderRadius: 3, 
  };

  return (
    <Box>
      {/* THE UX FIX: Expanded Command Center Bar */}
      <Paper sx={{ ...glassStyle, p: 2, mb: 3, display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'center' }}>
        
        {/* LEFT & CENTER: Title, Search, and the New Filters */}
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: '900', color: '#5D4037', textShadow: '0px 1px 2px rgba(255,255,255,0.8)', mr: 1 }}>
            Staff
          </Typography>
          
          {/* SEARCH BAR (Pixel-Perfect Alignment Preserved) */}
          <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.9)' }}>
            <TextField 
              variant="standard" size="small" placeholder="Search staff name..." value={searchText} onChange={(e) => setSearchText(e.target.value)} 
              InputProps={{ 
                startAdornment: <InputAdornment position="start" sx={{ mt: 0 }}><SearchIcon sx={{color: 'white'}}/></InputAdornment>,
                disableUnderline: true, style: { color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', height: '100%' } 
              }} 
              sx={{ width: 220, bgcolor: '#5D4037', borderRadius: 2, p: '6px 12px', boxShadow: 2, display: 'flex', justifyContent: 'center', '& .MuiInputBase-input': { padding: 0, ml: 0.5, '&::placeholder': { color: 'rgba(255,255,255,0.6)', opacity: 1 } }, '& .MuiInputAdornment-root': { marginTop: '0 !important' } }} 
            />
          </Box>

          {/* THE NEW FILTERS */}
          <TextField select size="small" value={filterDept} onChange={(e) => setFilterDept(e.target.value)} sx={{ minWidth: 160, bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 1, '& fieldset': { border: 'none' } }}>
              <MenuItem value="All">All Departments</MenuItem>
              {departments.map(d => <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>)}
          </TextField>

          <TextField select size="small" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: 140, bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 1, '& fieldset': { border: 'none' } }}>
              <MenuItem value="All">All Statuses</MenuItem>
              <MenuItem value="Available">🟢 Available</MenuItem>
              <MenuItem value="Busy">🟠 Busy (Active)</MenuItem>
          </TextField>

          <TextField select size="small" value={filterAccess} onChange={(e) => setFilterAccess(e.target.value)} sx={{ minWidth: 140, bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 1, '& fieldset': { border: 'none' } }}>
              <MenuItem value="All">All Access</MenuItem>
              <MenuItem value="Admin">Admin Only</MenuItem>
              <MenuItem value="Staff">Staff Only</MenuItem>
          </TextField>
          
          <Typography variant="body2" sx={{ color: '#5D4037', fontStyle: 'italic', fontWeight: '900', letterSpacing: 0.5, ml: 1 }}>
            {filteredStaff.length} {filteredStaff.length === 1 ? 'Record' : 'Records'}
          </Typography>
        </Box>

        {/* RIGHT SIDE: Action Button */}
        <Box>
          <Button 
            variant="contained" startIcon={<PersonAddIcon />} 
            sx={{ bgcolor: '#FF9800', fontWeight: '900', boxShadow: '0 4px 15px rgba(255, 152, 0, 0.4)', textTransform: 'uppercase', letterSpacing: 0.5, px: 3, whiteSpace: 'nowrap' }} 
            onClick={() => { setSelectedItem(null); setOpen(true); }}
          >
            Add Staff
          </Button>
        </Box>
      </Paper>

      {/* THE TABLE */}
      <StaffTable data={filteredStaff} getWorkload={getWorkload} onEdit={(row) => { setSelectedItem(row); setOpen(true); }} onDelete={handleDelete} glassStyle={glassStyle} departments={departments} />

      {/* THE MODAL */}
      {open && (
        <StaffFormModal key={selectedItem?.id || 'new_staff'} open={open} onClose={() => setOpen(false)} item={selectedItem} dynamicDepartments={departments} onSave={handleSave} showToast={showToast} />
      )}

      {/* ALERTS */}
      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast({...toast, open: false})} anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}>
        <Alert severity={toast.severity} sx={{ width: '100%', fontWeight: 'bold', boxShadow: 3 }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}