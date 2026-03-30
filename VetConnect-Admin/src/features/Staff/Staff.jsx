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
      p: 2, display: 'flex', alignItems: 'center', gap: 1.5,
      bgcolor: active ? bgcolor : COLORS.cardBg,
      border: `${active ? '2px' : '1px'} solid ${active ? color : (border || COLORS.borderLight)}`,
      borderRadius: 2.5,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.2s ease',
      '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: `0 6px 20px ${color}25` } : {},
      height: '100%',
    }}
  >
    <Box sx={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: `${color}1A` }}>
      {React.cloneElement(icon, { sx: { fontSize: 22, color } })}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
        {title}
      </Typography>
      <Typography variant="h5" sx={{ fontFamily: FONT, fontWeight: 900, color: active ? color : COLORS.textPrimary, lineHeight: 1 }}>
        {value}
      </Typography>
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
    <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
      {/* COMMAND CENTER BAR */}
      <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 2, alignItems: 'center', mb: 2, minWidth: 0 }}>
        <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.accent, whiteSpace: 'nowrap', flexShrink: 0 }}>
          Staff
        </Typography>

        {/* Search */}
        <TextField
          variant="standard"
          placeholder="Search staff name..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: 'rgba(255,255,255,0.8)' }} /></InputAdornment>,
            disableUnderline: true,
            style: { color: 'white', fontWeight: 'bold', fontFamily: FONT },
          }}
          sx={{ width: 200, flexShrink: 0, bgcolor: COLORS.accent, borderRadius: 2, px: 2, py: 0.5, boxShadow: 2, '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.6)', opacity: 1 } }}
        />

        {/* Department filter */}
        <TextField select size="small" value={filterDept} onChange={(e) => setFilterDept(e.target.value)} sx={{ minWidth: 160, bgcolor: COLORS.cardBg, borderRadius: 1, '& fieldset': { borderColor: COLORS.borderInput }, flexShrink: 0 }}>
          <MenuItem value="All">All Departments</MenuItem>
          {departments.map(d => <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>)}
        </TextField>

        {/* Status filter */}
        <TextField select size="small" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: 140, bgcolor: COLORS.cardBg, borderRadius: 1, '& fieldset': { borderColor: COLORS.borderInput }, flexShrink: 0 }}>
          <MenuItem value="All">All Statuses</MenuItem>
          <MenuItem value="Available">🟢 Available</MenuItem>
          <MenuItem value="Busy">🟠 Busy (Active)</MenuItem>
        </TextField>

        {/* Access filter */}
        <TextField select size="small" value={filterAccess} onChange={(e) => setFilterAccess(e.target.value)} sx={{ minWidth: 140, bgcolor: COLORS.cardBg, borderRadius: 1, '& fieldset': { borderColor: COLORS.borderInput }, flexShrink: 0 }}>
          <MenuItem value="All">All Access</MenuItem>
          <MenuItem value="Admin">Admin Only</MenuItem>
          <MenuItem value="Staff">Staff Only</MenuItem>
        </TextField>

        {/* Record count */}
        <Typography variant="body2" sx={{ fontFamily: FONT, color: COLORS.accent, fontWeight: 900, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {filteredStaff.length} {filteredStaff.length === 1 ? 'Record' : 'Records'}
        </Typography>

        {/* Spacer */}
        <Box sx={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }} />

        {/* Add Staff */}
        <Button 
          variant="contained" startIcon={<PersonAddIcon />} 
          sx={{ bgcolor: COLORS.cta, fontFamily: FONT, fontWeight: 900, boxShadow: `0 4px 15px ${COLORS.cta}66`, textTransform: 'uppercase', letterSpacing: 0.5, px: 3, borderRadius: 2, '&:hover': { bgcolor: COLORS.ctaHover }, whiteSpace: 'nowrap', flexShrink: 0 }} 
          onClick={() => { setSelectedItem(null); setOpen(true); }}
        >
          Add Staff
        </Button>
      </Box>

      {/* KPI DASHBOARD ROW */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, mb: 2, width: '100%', minWidth: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <KPICard title="Total Staff" value={kpis.total} icon={<PeopleIcon />} color={COLORS.info} bgcolor={COLORS.kpiBlueBg} border={COLORS.kpiBlueBorder} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <KPICard title="Currently Busy" value={kpis.busy} icon={<LocalHospitalIcon />} color={COLORS.warning} bgcolor={COLORS.kpiOrangeBg} border={COLORS.kpiOrangeBorder} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <KPICard title="Available Now" value={kpis.available} icon={<EventAvailableIcon />} color={COLORS.success} bgcolor={COLORS.kpiGreenBg} border={COLORS.kpiGreenBorder} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <KPICard title="Administrators" value={kpis.admins} icon={<AdminPanelSettingsIcon />} color={COLORS.danger} bgcolor={COLORS.kpiRedBg} border={COLORS.kpiRedBorder} />
        </Box>
      </Box>

      {/* THE TABLE */}
      <StaffTable data={filteredStaff} getWorkload={getWorkload} onEdit={(row) => { setSelectedItem(row); setOpen(true); }} onDelete={handleDelete} glassStyle={GLASS.panel} departments={departments} />

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