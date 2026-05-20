import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Button, Paper, TextField, InputAdornment,
  FormControl, Select, MenuItem, Snackbar, Alert, Tabs, Tab, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';

import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import ArchiveIcon from '@mui/icons-material/Archive';

import { useServices } from './hooks/useServices';
import ServiceTable from './components/ServiceTable';
import ServiceActivityLog from './components/ServiceActivityLog';
import ServiceFormModal from './modals/ServiceFormModal';
import ServiceLogModal from './modals/ServiceLogModal';

import { FONT, COLORS } from '../../theme/designTokens';
import { useUser } from '../../context/UserContext';

export default function Services() {
  const { services, inventory, departments, loading, saveService, archiveService, restoreService, removeService } = useServices();
  const { isAdmin } = useUser();

  const [tab, setTab] = useState(0);
  const [showArchived, setShowArchived] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterSpecies, setFilterSpecies] = useState('All');

  const [open, setOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [logItem, setLogItem] = useState(null);

  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const showToast = (message, severity = 'success') => setToast({ open: true, message, severity });
  const [confirmDialog, setConfirmDialog] = useState(null);

  const filteredServices = useMemo(() => {
    return services.filter(s => {
      if (!showArchived && s.isArchived) return false;
      if (showArchived && !s.isArchived) return false;
      const matchSearch   = (s.name || '').toLowerCase().includes(searchText.toLowerCase());
      const matchCategory = filterCategory === 'All' || (s.department || s.category) === filterCategory;
      const matchSpecies  = filterSpecies === 'All' || s.targetSpecies === filterSpecies || s.targetSpecies === 'Universal';
      return matchSearch && matchCategory && matchSpecies;
    });
  }, [services, searchText, filterCategory, filterSpecies, showArchived]);

  const handleSave = async (formData) => {
    try {
      await saveService(selectedItem?.id, formData);
      setOpen(false);
      showToast(selectedItem ? "Service updated." : "New service created.", "success");
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleArchive = (id, name) => {
    setConfirmDialog({
      title: 'Archive Service?',
      message: `Archive "${name}"? It will be hidden from walk-in and booking, but can be restored.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try { await archiveService(id); showToast("Service archived.", "success"); }
        catch (e) { showToast(e.message, "error"); }
      },
    });
  };

  const handleRestore = async (id) => {
    try { await restoreService(id); showToast("Service restored.", "success"); }
    catch (e) { showToast(e.message, "error"); }
  };

  const handleDelete = (id, name) => {
    setConfirmDialog({
      title: 'Permanently Delete?',
      message: `Permanently delete "${name}"? This cannot be undone.`,
      color: 'error',
      onConfirm: async () => {
        setConfirmDialog(null);
        try { await removeService(id); showToast("Service permanently deleted.", "success"); }
        catch (e) { showToast(e.message, "error"); }
      },
    });
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: COLORS.surfaceAlt }}>

      {/* ── Header / Toolbar ── */}
      <Paper sx={{
        bgcolor: COLORS.cream, border: '0px', borderBottom: `2px solid ${COLORS.accent}`, borderRadius: 0,
        p: { xs: 1.5, sm: 2.5 }, pl: { xs: 8, md: 4 }, pr: { xs: 2, md: 4 }, display: 'flex', flexDirection: 'column',
        gap: { xs: 1.5, sm: 2.5 }, flexShrink: 0,
      }}>
        {/* Top Row: Title & Action Button */}
        <Box sx={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: 1000, color: COLORS.brand, textTransform: 'uppercase', letterSpacing: 1, fontSize: '1.5rem', lineHeight: 1 }}>
            Services
          </Typography>

          {tab === 0 && !showArchived && (
            <Button
              variant="contained" startIcon={<AddIcon />}
              sx={{ bgcolor: COLORS.sky, fontWeight: 900, boxShadow: '4px 4px 0px rgba(58, 190, 249, 0.15)', textTransform: 'uppercase', letterSpacing: 0.5, px: { xs: 2, sm: 3 }, whiteSpace: 'nowrap', borderRadius: 0, border: `2px solid ${COLORS.skyHover}`, '&:hover': { bgcolor: COLORS.skyHover } }}
              onClick={() => { setSelectedItem(null); setOpen(true); }}
            >
              New Service
            </Button>
          )}
        </Box>

        {/* Bottom Row: Filters (Tab 0 only) */}
        {tab === 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1.5, sm: 2.5 }, alignItems: 'center', width: '100%' }}>
            <TextField
              variant="outlined" size="small" placeholder="Search services..." value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: COLORS.textMuted }} /></InputAdornment>,
              }}
              sx={{
                flex: { xs: '1 1 100%', sm: '1 1 200px', md: '1 1 350px' }, maxWidth: { xs: '100%', sm: 350 },
                '& .MuiOutlinedInput-root': {
                  borderRadius: 0, bgcolor: COLORS.formBg,
                  '& fieldset': { borderColor: COLORS.border },
                  '&:hover fieldset': { borderColor: COLORS.accent },
                  '&.Mui-focused fieldset': { borderColor: COLORS.accent },
                },
              }}
            />

            <FormControl size="small" sx={{ width: { xs: '100%', sm: 180 }, bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 0 }}>
              <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} displayEmpty sx={{ '& fieldset': { border: 'none' }, fontWeight: 'bold' }}>
                <MenuItem value="All">All Departments</MenuItem>
                {departments.map(d => <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ width: { xs: '100%', sm: 160 }, bgcolor: 'rgba(255,255,255,0.7)', borderRadius: 0 }}>
              <Select value={filterSpecies} onChange={(e) => setFilterSpecies(e.target.value)} displayEmpty sx={{ '& fieldset': { border: 'none' }, fontWeight: 'bold' }}>
                <MenuItem value="All">All Species</MenuItem>
                <MenuItem value="Universal">🐾 Universal</MenuItem>
                <MenuItem value="Canine">🐶 Canine</MenuItem>
                <MenuItem value="Feline">🐱 Feline</MenuItem>
              </Select>
            </FormControl>

            <FormControlLabel
              sx={{ mr: 0, ml: { xs: 0, sm: 1 } }}
              control={
                <Switch
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  size="small"
                  sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.warning }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: COLORS.warning } }}
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ArchiveIcon sx={{ fontSize: 14, color: showArchived ? COLORS.warning : '#9E9E9E' }} />
                  <Typography variant="caption" sx={{ fontWeight: 900, color: showArchived ? COLORS.warning : '#9E9E9E', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Archived
                  </Typography>
                </Box>
              }
            />

            <Typography variant="body2" sx={{ color: COLORS.accent, fontStyle: 'italic', fontWeight: 900, letterSpacing: 0.5, ml: { xs: 0, sm: 1 }, width: { xs: '100%', sm: 'auto' } }}>
              {filteredServices.length} {filteredServices.length === 1 ? 'Record' : 'Records'}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* ── Tabs ── */}
      <Box sx={{ borderBottom: `2px solid ${COLORS.accent}`, bgcolor: COLORS.cream, flexShrink: 0 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': { fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, color: '#9E9E9E', minHeight: 40, fontSize: '0.75rem' },
            '& .Mui-selected': { color: `${COLORS.accent} !important` },
            '& .MuiTabs-indicator': { bgcolor: COLORS.accent, height: 3 },
          }}
        >
          <Tab label="Service Table" />
          <Tab label="Activity Log" />
        </Tabs>
      </Box>

      {/* ── Content ── */}
      <Box sx={{ flexGrow: 1, overflow: 'hidden', p: 0, bgcolor: COLORS.surface, display: 'flex', flexDirection: 'column' }}>
        {tab === 0 && (
          <ServiceTable
            data={filteredServices}
            showArchived={showArchived}
            departments={departments}
            isAdmin={isAdmin}
            loading={loading}
            onEdit={(row) => { setSelectedItem(row); setOpen(true); }}
            onArchive={handleArchive}
            onRestore={handleRestore}
            onDelete={handleDelete}
            onLog={(row) => setLogItem(row)}
          />
        )}
        {tab === 1 && <ServiceActivityLog />}
      </Box>

      {/* ── Modals ── */}
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

      {logItem && (
        <ServiceLogModal
          open={Boolean(logItem)}
          onClose={() => setLogItem(null)}
          item={logItem}
        />
      )}

      <Dialog open={!!confirmDialog} onClose={() => setConfirmDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 900, fontFamily: FONT }}>{confirmDialog?.title}</DialogTitle>
        <DialogContent><Typography>{confirmDialog?.message}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(null)} sx={{ fontFamily: FONT }}>Cancel</Button>
          <Button variant="contained" color={confirmDialog?.color || 'primary'} onClick={confirmDialog?.onConfirm} sx={{ borderRadius: 0, fontWeight: 800, fontFamily: FONT }}>Confirm</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} sx={{ width: '100%', fontWeight: 'bold', boxShadow: 3 }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}
