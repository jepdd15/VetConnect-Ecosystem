import React, { useState, useMemo } from 'react';
import { Box, Typography, Paper, Button, TextField, InputAdornment, Snackbar, Alert, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, IconButton } from '@mui/material';

import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SearchIcon from '@mui/icons-material/Search';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

// Design Tokens
import { FONT, COLORS } from '../../theme/designTokens';

// Logic & Components
import { useStaffManager } from './hooks/useStaffManager';
import StaffTable from './components/StaffTable';
import StaffFormModal from './modals/StaffFormModal';
import ConfirmRevokeModal from './modals/ConfirmRevokeModal';

export default function Staff() {
  const { staffList, departments, getWorkload, activeAppointments, loading, saveStaff, removeStaff } = useStaffManager();

  // UI STATES
  const [searchText, setSearchText] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });

  // Confirm Revoke modal state
  const [openRevoke, setOpenRevoke] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);

  // Temp password dialog state (T2.208)
  const [tempPasswordInfo, setTempPasswordInfo] = useState(null);

  // Revoke in-flight guard to prevent double-submit (T2.223)
  const [revoking, setRevoking] = useState(false);

  // FILTER STATES
  const [filterDept, setFilterDept] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterAccess, setFilterAccess] = useState('All');

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
      const result = await saveStaff(selectedItem?.id, formData);
      if (result?.tempPassword) {
        // New staff created — show temp password dialog before success toast (T2.208)
        setTempPasswordInfo(result);
      } else {
        showToast("Profile Updated.", "success");
      }
      setOpen(false);
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleDelete = (id, name) => {
    setRevokeTarget({ id, name });
    setOpenRevoke(true);
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget || revoking) return;
    setRevoking(true);
    try {
      await removeStaff(revokeTarget.id);
      showToast("Access Revoked.", "success");
      setOpenRevoke(false);
      setRevokeTarget(null);
    } catch (e) { showToast(e.message, "error"); }
    finally { setRevoking(false); }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* 1. BOXED FORENSIC HEADER */}
      <Box sx={{ flexShrink: 0 }}>
        <Paper sx={{
          p: 2.5, px: 4, display: 'flex', flexWrap: 'nowrap', gap: 2.5, alignItems: 'center',
          bgcolor: COLORS.cream, border: 'none', borderBottom: `2px solid ${COLORS.accent}`, borderRadius: 0, boxShadow: 'none', width: '100%'
        }}>
          <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: 1000, color: COLORS.accent, whiteSpace: 'nowrap', textTransform: 'uppercase', flexShrink: 0, mr: 1, letterSpacing: 1, fontSize: '1.5rem', lineHeight: 1 }}>
            Staff Registry
          </Typography>

          {/* Search */}
          <TextField
            variant="standard"
            placeholder="SEARCH STAFF NAME..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: COLORS.accent, opacity: 0.6, ml: 1 }} /></InputAdornment>,
              disableUnderline: true,
              style: { color: COLORS.brand, fontWeight: 'bold', fontFamily: FONT, fontSize: '0.9rem' },
            }}
            sx={{ width: 220, flexShrink: 0, bgcolor: 'rgba(93, 64, 55, 0.05)', border: '1px solid #5D403733', borderRadius: 0, px: 1.5, py: 0.5 }}
          />

          {/* Filters grouped */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField select size="small" value={filterDept} onChange={(e) => setFilterDept(e.target.value)} sx={{ minWidth: 160, bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733' } }}>
              <MenuItem value="All">All Departments</MenuItem>
              {departments.map(d => <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>)}
            </TextField>

            <TextField select size="small" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: 140, bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733' } }}>
              <MenuItem value="All">All Statuses</MenuItem>
              <MenuItem value="Available">Available</MenuItem>
              <MenuItem value="Busy">Busy (Active)</MenuItem>
            </TextField>

            <TextField select size="small" value={filterAccess} onChange={(e) => setFilterAccess(e.target.value)} sx={{ minWidth: 170, bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#5D403733' } }}>
              <MenuItem value="All">All Access Levels</MenuItem>
              <MenuItem value="staff">Clinical Staff</MenuItem>
              <MenuItem value="admin">Clinic Administrator</MenuItem>
            </TextField>
          </Box>

          <Typography variant="body2" sx={{ fontFamily: FONT, color: COLORS.accent, fontWeight: 900, whiteSpace: 'nowrap', flexShrink: 0, fontStyle: 'italic', ml: 1 }}>
            {filteredStaff.length} Records
          </Typography>

          <Box sx={{ flexGrow: 1 }} />

          <Button
            variant="contained" startIcon={<PersonAddIcon />}
            sx={{ bgcolor: COLORS.danger, fontFamily: FONT, fontWeight: 1000, boxShadow: '4px 4px 0px rgba(211, 47, 47, 0.1)', textTransform: 'uppercase', letterSpacing: 1, px: 3, py: 1, borderRadius: 0, border: `2px solid ${COLORS.dangerHover}`, '&:hover': { bgcolor: COLORS.dangerHover } }}
            onClick={() => { setSelectedItem(null); setOpen(true); }}
          >
            Authorize Staff
          </Button>
        </Paper>
      </Box>

      {/* 2. BOXED TABLE AREA (FLEX: 1) */}
      <StaffTable data={filteredStaff} getWorkload={getWorkload} onEdit={(row) => { setSelectedItem(row); setOpen(true); }} onDelete={handleDelete} departments={departments} loading={loading} />

      {/* THE MODAL */}
      {open && (
        <StaffFormModal key={selectedItem?.id || 'new_staff'} open={open} onClose={() => setOpen(false)} item={selectedItem} dynamicDepartments={departments} onSave={handleSave} />
      )}

      {/* CONFIRM REVOKE MODAL */}
      <ConfirmRevokeModal
        open={openRevoke}
        onClose={() => { setOpenRevoke(false); setRevokeTarget(null); }}
        staffName={revokeTarget?.name}
        onConfirm={handleConfirmRevoke}
        loading={revoking}
      />

      {/* TEMP PASSWORD DIALOG — shown after new staff creation (T2.208) */}
      <Dialog
        open={!!tempPasswordInfo}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.accent}`, boxShadow: '8px 8px 0px rgba(93, 64, 55, 0.1)' } }}
      >
        <DialogTitle sx={{ bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.accent}`, fontFamily: FONT, fontWeight: 1000, textTransform: 'uppercase', letterSpacing: 1, fontSize: '1rem', color: COLORS.brand }}>
          Staff Account Created
        </DialogTitle>
        <DialogContent sx={{ pt: 3, pb: 2 }}>
          <Typography variant="body2" sx={{ mb: 2, fontFamily: FONT, color: COLORS.accent }}>
            A temporary password has been generated for <strong>{tempPasswordInfo?.email}</strong>.
            Share this password securely with the staff member.
          </Typography>
          <Paper elevation={0} sx={{ p: 2, bgcolor: COLORS.cream, border: `2px solid ${COLORS.accent}`, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1.3rem', color: COLORS.brand, letterSpacing: 2 }}>
              {tempPasswordInfo?.tempPassword}
            </Typography>
            <IconButton
              size="small"
              onClick={() => {
                const pwd = tempPasswordInfo?.tempPassword || '';
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(pwd).then(
                    () => showToast('Password copied to clipboard.', 'success'),
                    () => showToast('Copy failed — please copy manually.', 'warning')
                  );
                } else {
                  showToast('Auto-copy unavailable — please copy manually.', 'warning');
                }
              }}
              sx={{ color: COLORS.accent }}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Paper>
          <Typography variant="caption" sx={{ mt: 2, display: 'block', color: COLORS.danger, fontWeight: 'bold', fontFamily: FONT }}>
            This password will NOT be shown again. The staff member should change it on first login.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, bgcolor: COLORS.cream, borderTop: `2px solid ${COLORS.accent}` }}>
          <Button
            variant="contained"
            onClick={() => {
              setTempPasswordInfo(null);
              showToast('Staff Authorized.', 'success');
            }}
            sx={{ bgcolor: COLORS.cta, fontWeight: 1000, px: 4, py: 1, borderRadius: 0, border: `2px solid ${COLORS.ctaHover}`, fontFamily: FONT, '&:hover': { bgcolor: COLORS.ctaHover } }}
          >
            DONE
          </Button>
        </DialogActions>
      </Dialog>

      {/* ALERTS */}
      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast({...toast, open: false})} anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}>
        <Alert severity={toast.severity} sx={{ width: '100%', fontFamily: FONT, fontWeight: 'bold', boxShadow: 3 }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}
