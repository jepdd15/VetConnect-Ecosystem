import React, { useState, useMemo } from 'react';
import { 
  Box, Typography, Paper, Button, TextField, InputAdornment, 
  Snackbar, Alert, MenuItem, Dialog, DialogTitle, DialogContent, 
  DialogActions, IconButton, Tabs, Tab 
} from '@mui/material';

import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SearchIcon from '@mui/icons-material/Search';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

// Design Tokens
import { FONT, COLORS } from '../../theme/designTokens';

// Logic & Components
import { useStaffManager } from './hooks/useStaffManager';
import StaffTable from './components/StaffTable';
import StaffActivityLog from './components/StaffActivityLog';
import StaffFormModal from './modals/StaffFormModal';
import ConfirmRevokeModal from './modals/ConfirmRevokeModal';

export default function Staff() {
  const { staffList, departments, getWorkload, activeAppointments, loading, saveStaff, removeStaff } = useStaffManager();

  // UI STATES
  const [tab, setTab] = useState(0);
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

  // --- MULTI-AXIAL FILTER ENGINE ---
  const filteredStaff = useMemo(() => {
    return staffList.filter(u => {
      const matchSearch = (u.fullName || '').toLowerCase().includes(searchText.toLowerCase());
      const matchDept = filterDept === 'All' || (u.departments || []).includes(filterDept);
      return matchSearch && matchDept;
    });
  }, [staffList, searchText, filterDept]);

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
          p: 2.5, px: 4, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center',
          bgcolor: COLORS.cream, border: 'none', borderBottom: `2px solid ${COLORS.accent}`, borderRadius: 0, boxShadow: 'none', width: '100%'
        }}>
          <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: 1000, color: COLORS.brand, whiteSpace: 'nowrap', textTransform: 'uppercase', flexShrink: 0, mr: 1, letterSpacing: 1, fontSize: '1.5rem', lineHeight: 1 }}>
            Staff
          </Typography>

          {tab === 0 && (
            <>
              {/* Search */}
              <TextField
                variant="outlined"
                size="small"
                placeholder="Search staff..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: COLORS.textMuted }} /></InputAdornment>,
                  style: { color: COLORS.textPrimary, fontWeight: 'bold', fontFamily: FONT, fontSize: '0.9rem' },
                }}
                sx={{
                  flex: 1, maxWidth: 350, minWidth: 180, flexShrink: 0,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 0, bgcolor: COLORS.formBg,
                    '& fieldset': { borderColor: COLORS.border },
                    '&:hover fieldset': { borderColor: COLORS.accent },
                    '&.Mui-focused fieldset': { borderColor: COLORS.accent },
                  },
                }}
              />

              {/* Filters grouped */}
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField select size="small" value={filterDept} onChange={(e) => setFilterDept(e.target.value)} sx={{ minWidth: 160, bgcolor: COLORS.cardBg, '& .MuiOutlinedInput-notchedOutline': { borderColor: `${COLORS.accent}33` } }}>
                  <MenuItem value="All">All Departments</MenuItem>
                  {departments.map(d => <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>)}
                </TextField>
              </Box>

              <Typography variant="body2" sx={{ fontFamily: FONT, color: COLORS.accent, fontWeight: 900, whiteSpace: 'nowrap', flexShrink: 0, fontStyle: 'italic', ml: 1 }}>
                {filteredStaff.length} Records
              </Typography>
            </>
          )}

          <Box sx={{ flexGrow: 1 }} />

          {tab === 0 && (
            <Button
              variant="contained" startIcon={<PersonAddIcon />}
              sx={{ bgcolor: COLORS.sky, fontFamily: FONT, fontWeight: 900, boxShadow: '4px 4px 0px rgba(58, 190, 249, 0.15)', textTransform: 'uppercase', letterSpacing: 1, px: 3, py: 1, borderRadius: 0, border: `2px solid ${COLORS.skyHover}`, '&:hover': { bgcolor: COLORS.skyHover } }}
              onClick={() => { setSelectedItem(null); setOpen(true); }}
            >
              Authorize Staff
            </Button>
          )}
        </Paper>
      </Box>

      {/* 2. TABS SECTION */}
      <Box sx={{ borderBottom: `2px solid ${COLORS.accent}`, bgcolor: COLORS.cream, flexShrink: 0 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            px: 4,
            '& .MuiTab-root': {
              fontFamily: FONT, fontWeight: 900, fontSize: '0.8rem', color: COLORS.textMuted,
              minHeight: 48, letterSpacing: 1, px: 4,
            },
            '& .MuiTab-root.Mui-selected': { color: COLORS.accent, bgcolor: 'rgba(93, 64, 55, 0.05)' },
            '& .MuiTabs-indicator': { height: 4, bgcolor: COLORS.accent },
          }}
        >
          <Tab label="Staff Table" />
          <Tab label="Activity Log" />
        </Tabs>
      </Box>

      {/* 3. CONTENT AREA (FLEX: 1) */}
      <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 0 ? (
          <StaffTable data={filteredStaff} getWorkload={getWorkload} onEdit={(row) => { setSelectedItem(row); setOpen(true); }} onDelete={handleDelete} departments={departments} loading={loading} />
        ) : (
          <StaffActivityLog />
        )}
      </Box>

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
        <DialogTitle sx={{ bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.accent}`, fontFamily: FONT, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, fontSize: '1rem', color: COLORS.brand }}>
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
            sx={{ bgcolor: COLORS.cta, fontWeight: 900, px: 4, py: 1, borderRadius: 0, border: `2px solid ${COLORS.ctaHover}`, fontFamily: FONT, '&:hover': { bgcolor: COLORS.ctaHover } }}
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
