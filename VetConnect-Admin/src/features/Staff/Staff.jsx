import React, { useState, useMemo } from 'react';
import { Box, Typography, Paper, Button, TextField, InputAdornment, Snackbar, Alert, MenuItem } from '@mui/material';

import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SearchIcon from '@mui/icons-material/Search';
import PeopleIcon from '@mui/icons-material/People';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

// Design Tokens
import { FONT, TYPE, COLORS, GLASS } from '../../theme/designTokens';

// Logic & Components
import { useStaffManager } from './hooks/useStaffManager';
import StaffTable from './components/StaffTable';
import StaffFormModal from './modals/StaffFormModal';
import ConfirmRevokeModal from './modals/ConfirmRevokeModal';

// ── Reusable KPI Card (shared token-driven variant) ──────────────
const KPICard = ({ title, value, icon, color, bgcolor, border, onClick, active }) => (
  <Paper
    elevation={0}
    onClick={onClick}
    sx={{
      p: 2.5, display: 'flex', alignItems: 'center', gap: 2,
      borderRadius: 0, 
      border: `2px solid ${active ? color : '#5D4037'}`,
      bgcolor: active ? `${color}18` : '#FFF9F7', // Forensic Flat background
      boxShadow: active ? `4px 4px 0px ${color}30` : '4px 4px 0px rgba(93, 64, 55, 0.1)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.1s ease',
      '&:hover': onClick ? { transform: 'translate(1px, 1px)', boxShadow: `2px 2px 0px ${color}25`, border: `2px solid ${color}` } : {},
      height: '100%',
    }}
  >
    <Box sx={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: `${color}1A`, color: color, border: `1px solid ${color}33` }}>
      {React.cloneElement(icon, { sx: { fontSize: 22, color } })}
    </Box>
    <Box>
      <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, fontSize: '0.65rem' }}>{title}</Typography>
      <Typography variant="h5" sx={{ fontFamily: FONT, color: active ? color : '#3E2723', fontWeight: 1000, fontSize: '1.4rem' }}>{value}</Typography>
    </Box>
  </Paper>
);

export default function Staff() {
  const { staffList, departments, getWorkload, activeAppointments, saveStaff, removeStaff } = useStaffManager();
  
  // UI STATES
  const [searchText, setSearchText] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });

  // Confirm Revoke modal state
  const [openRevoke, setOpenRevoke] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);

  // FILTER STATES
  const [filterDept, setFilterDept] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterAccess, setFilterAccess] = useState('All');

  // --- KPI ANALYTICS ENGINE ---
  const kpis = useMemo(() => {
    let admins = 0, busy = 0, available = 0;
    staffList.forEach(u => {
      const role = u.accessLevel || (u.role === 'admin' ? 'admin' : 'staff');
      if (role === 'admin') admins++;
      const load = activeAppointments.filter(a => a.assignedVetId === u.id).length;
      if (load > 0) busy++;
      else available++;
    });
    return { total: staffList.length, admins, busy, available };
  }, [staffList, activeAppointments]);

  // --- MULTI-AXIAL FILTER ENGINE ---
  const filteredStaff = useMemo(() => {
    return staffList.filter(u => {
      const matchSearch = (u.fullName || '').toLowerCase().includes(searchText.toLowerCase());
      const matchDept = filterDept === 'All' || (u.departments || []).includes(filterDept);
      const role = u.accessLevel || (u.role === 'admin' ? 'admin' : 'staff');
      const matchAccess = filterAccess === 'All' || role.toLowerCase() === filterAccess.toLowerCase();
      const load = activeAppointments.filter(a => a.assignedVetId === u.id).length;
      const isBusy = load > 0;
      let matchStatus = true;
      if (filterStatus === 'Available') matchStatus = !isBusy;
      if (filterStatus === 'Busy') matchStatus = isBusy;
      return matchSearch && matchDept && matchAccess && matchStatus;
    });
  }, [staffList, searchText, filterDept, filterStatus, filterAccess, activeAppointments]);

  // --- HANDLERS ---
  const handleSave = async (formData) => {
    try {
      await saveStaff(selectedItem?.id, formData);
      showToast(selectedItem ? "Profile Updated." : "Staff Authorized.", "success");
      setOpen(false);
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleDelete = (id, name) => {
    setRevokeTarget({ id, name });
    setOpenRevoke(true);
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await removeStaff(revokeTarget.id);
      showToast("Access Revoked.", "success");
    } catch (e) { showToast(e.message, "error"); }
    setOpenRevoke(false);
    setRevokeTarget(null);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      
      {/* 1. BOXED FORENSIC HEADER */}
      <Box sx={{ flexShrink: 0 }}>
        <Paper sx={{ 
          p: 2.5, px: 4, display: 'flex', flexWrap: 'nowrap', gap: 2.5, alignItems: 'center',
          bgcolor: '#FFF8E1', border: 'none', borderBottom: '2px solid #5D4037', borderRadius: 0, boxShadow: 'none', width: '100%'
        }}>
          <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: 1000, color: '#5D4037', whiteSpace: 'nowrap', textTransform: 'uppercase', flexShrink: 0, mr: 1, letterSpacing: 1, fontSize: '1.5rem', lineHeight: 1 }}>
            Staff Registry
          </Typography>

          {/* Search */}
          <TextField
            variant="standard"
            placeholder="SEARCH STAFF NAME..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#5D4037', opacity: 0.6, ml: 1 }} /></InputAdornment>,
              disableUnderline: true,
              style: { color: '#3E2723', fontWeight: 'bold', fontFamily: FONT, fontSize: '0.9rem' },
            }}
            sx={{ width: 220, flexShrink: 0, bgcolor: 'rgba(93, 64, 55, 0.05)', border: '1px solid #5D403733', borderRadius: 1, px: 1.5, py: 0.5 }}
          />

          {/* Filters grouped */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField select size="small" value={filterDept} onChange={(e) => setFilterDept(e.target.value)} sx={{ minWidth: 160, bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733' } }}>
              <MenuItem value="All">All Departments</MenuItem>
              {departments.map(d => <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>)}
            </TextField>

            <TextField select size="small" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: 140, bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733' } }}>
              <MenuItem value="All">All Statuses</MenuItem>
              <MenuItem value="Available">🟢 Available</MenuItem>
              <MenuItem value="Busy">🟠 Busy (Active)</MenuItem>
            </TextField>

            <TextField select size="small" value={filterAccess} onChange={(e) => setFilterAccess(e.target.value)} sx={{ minWidth: 170, bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733' } }}>
              <MenuItem value="All">All Access Levels</MenuItem>
              <MenuItem value="staff">Clinical Staff</MenuItem>
              <MenuItem value="admin">Clinic Administrator</MenuItem>
            </TextField>
          </Box>

          <Typography variant="body2" sx={{ fontFamily: FONT, color: '#5D4037', fontWeight: 900, whiteSpace: 'nowrap', flexShrink: 0, fontStyle: 'italic', ml: 1 }}>
            {filteredStaff.length} Records
          </Typography>

          <Box sx={{ flexGrow: 1 }} />

          <Button 
            variant="contained" startIcon={<PersonAddIcon />} 
            sx={{ bgcolor: '#D32F2F', fontFamily: FONT, fontWeight: 1000, boxShadow: '4px 4px 0px rgba(211, 47, 47, 0.1)', textTransform: 'uppercase', letterSpacing: 1, px: 3, py: 1, borderRadius: 0, border: '2px solid #B71C1C', '&:hover': { bgcolor: '#B71C1C' } }} 
            onClick={() => { setSelectedItem(null); setOpen(true); }}
          >
            Authorize Staff
          </Button>
        </Paper>
      </Box>

      {/* 2. BOXED TABLE AREA (FLEX: 1) */}
      <StaffTable data={filteredStaff} getWorkload={getWorkload} onEdit={(row) => { setSelectedItem(row); setOpen(true); }} onDelete={handleDelete} departments={departments} />

      {/* THE MODAL */}
      {open && (
        <StaffFormModal key={selectedItem?.id || 'new_staff'} open={open} onClose={() => setOpen(false)} item={selectedItem} dynamicDepartments={departments} onSave={handleSave} showToast={showToast} />
      )}

      {/* CONFIRM REVOKE MODAL */}
      <ConfirmRevokeModal
        open={openRevoke}
        onClose={() => { setOpenRevoke(false); setRevokeTarget(null); }}
        staffName={revokeTarget?.name}
        onConfirm={handleConfirmRevoke}
      />

      {/* ALERTS */}
      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast({...toast, open: false})} anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}>
        <Alert severity={toast.severity} sx={{ width: '100%', fontFamily: FONT, fontWeight: 'bold', boxShadow: 3 }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}