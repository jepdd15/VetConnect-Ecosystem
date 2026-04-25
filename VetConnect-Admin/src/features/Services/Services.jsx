import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Button, Paper, TextField, InputAdornment,
  FormControl, Select, MenuItem, Snackbar, Alert, Tabs, Tab, Switch, FormControlLabel
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

  const handleArchive = async (id, name) => {
    if (window.confirm(`Archive "${name}"? It will be hidden from walk-in and booking, but can be restored.`)) {
      try { await archiveService(id); showToast("Service archived.", "success"); }
      catch (e) { showToast(e.message, "error"); }
    }
  };

  const handleRestore = async (id) => {
    try { await restoreService(id); showToast("Service restored.", "success"); }
    catch (e) { showToast(e.message, "error"); }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Permanently delete "${name}"? This cannot be undone.`)) {
      try { await removeService(id); showToast("Service permanently deleted.", "success"); }
      catch (e) { showToast(e.message, "error"); }
    }
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: COLORS.surfaceAlt }}>

      {/* ── Header / Toolbar ── */}
      <Paper sx={{
        bgcolor: COLORS.cream, border: '0px', borderBottom: `2px solid ${COLORS.accent}`, borderRadius: 0,
        p: 2.5, px: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 2.5, flexShrink: 0,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap', flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontFamily: FONT, fontWeight: 900, color: COLORS.accent, textTransform: 'uppercase', letterSpacing: 1, mr: 1, fontSize: '1.5rem', lineHeight: 1 }}>
            Services
          </Typography>

          {tab === 0 && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: COLORS.panelBg, borderRadius: 0, border: `2px solid ${COLORS.accent}`, p: 0.5 }}>
                <TextField
                  variant="standard" placeholder="SEARCH SERVICES..." value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: 'rgba(255,255,255,0.8)', ml: 1 }} /></InputAdornment>,
                    disableUnderline: true, style: { color: 'white', fontWeight: 'bold', textTransform: 'uppercase' },
                  }}
                  sx={{ width: 260, bgcolor: COLORS.accent, borderRadius: 0, px: 2, py: 0.5, '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.6)', opacity: 1 } }}
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

              <FormControlLabel
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

              <Typography variant="body2" sx={{ color: COLORS.accent, fontStyle: 'italic', fontWeight: 900, letterSpacing: 0.5, ml: 1 }}>
                {filteredServices.length} {filteredServices.length === 1 ? 'Record' : 'Records'}
              </Typography>
            </>
          )}
        </Box>

        {tab === 0 && !showArchived && (
          <Button
            variant="contained" startIcon={<AddIcon />}
            sx={{ bgcolor: COLORS.amber, fontWeight: 900, boxShadow: '0 4px 15px rgba(255, 152, 0, 0.4)', textTransform: 'uppercase', letterSpacing: 0.5, px: 3, whiteSpace: 'nowrap' }}
            onClick={() => { setSelectedItem(null); setOpen(true); }}
          >
            New Service
          </Button>
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
      <Box sx={{ flexGrow: 1, overflow: 'hidden', p: tab === 1 ? 2 : 0, bgcolor: COLORS.surface, display: 'flex', flexDirection: 'column' }}>
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

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast({ ...toast, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} sx={{ width: '100%', fontWeight: 'bold', boxShadow: 3 }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}
