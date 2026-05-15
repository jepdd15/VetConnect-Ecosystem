import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Stack, Chip, Select, MenuItem,
  FormControl, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableHead, TableRow, TableCell, TableBody, IconButton, InputAdornment,
} from '@mui/material';
import {
  collection, onSnapshot, addDoc, deleteDoc, doc, getDocs, query, where, Timestamp,
  writeBatch, getDoc,
} from 'firebase/firestore';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { db } from '../../../firebaseConfig';
import { useUser } from '../../../context/UserContext';
import { COLORS, FONT, TYPE } from '../../../theme/designTokens';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import InventoryIcon from '@mui/icons-material/Inventory';
import EditIcon from '@mui/icons-material/Edit';
import LockIcon from '@mui/icons-material/Lock';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';
import { formatCategory } from '../Inventory';

// ─── Audit logger ────────────────────────────────────────────────────────────
const SYSTEM_CATEGORY_NAMES = ['medicine', 'vaccine', 'food', 'supplies', 'accessories', 'lab'];

async function logCategoryEvent(action, entityName, details, performedBy) {
  try {
    const timestamp = Timestamp.now();
    // 1. Log to settings archive
    await addDoc(collection(db, 'settings_logs'), {
      action,
      entityType: 'inventory_category',
      entityName,
      performedBy,
      performedAt: timestamp,
      ...details,
    });

    // 2. Log to unified Inventory Activity Log (The Bridge)
    let reason = details.reason || `Inventory category ${action.toLowerCase()}d: ${entityName}`;
    if (action === 'EDIT' && details.oldName && details.oldName !== entityName) {
      reason = `Category renamed from "${details.oldName}" to "${entityName}".`;
    }

    await addDoc(collection(db, 'inventory_logs'), {
      action: action === 'EDIT' ? 'UPDATED' : (action === 'CREATE' ? 'CREATED' : 'DELETED'),
      itemName: `Category: ${entityName}`,
      amountChange: 0,
      reason,
      userName: performedBy,
      timestamp,
      isTaxonomy: true, // Flag for specific filtering if needed later
    });
  } catch (e) {
    console.error('[InventoryCategoryManager.logCategoryEvent]:', e.message);
  }
}

const CLASS_OPTIONS = [
  { value: 'medicine',       label: 'Medicine' },
  { value: 'medical_supply', label: 'Medical Supply' },
  { value: 'retail',         label: 'Retail' },
];

function classChipProps(pc) {
  if (pc === 'medicine')       return { label: 'Medicine',       color: COLORS.danger };
  if (pc === 'medical_supply') return { label: 'Medical Supply', color: '#757575' };
  return                              { label: 'Retail',          color: COLORS.textMuted };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InventoryCategoryManager({ inventory = [] }) {
  const { profile } = useUser();

  const [categories, setCategories]         = useState([]);
  const [newCatName, setNewCatName]         = useState('');
  const [newCatProductClass, setNewCatProductClass] = useState('retail');
  const [catSearch, setCatSearch]           = useState('');
  const [catSort, setCatSort]               = useState({ key: 'name', dir: 'asc' });
  const [confirmDelete, setConfirmDelete]   = useState({ open: false, id: '', name: '' });
  const [editDialog, setEditDialog]         = useState({ open: false, id: '', name: '', productClass: 'retail', isDefault: false });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [toast, setToast]                   = useState({ open: false, message: '', severity: 'success' });

  const showToast = (message, severity = 'success') =>
    setToast({ open: true, message, severity });

  const getPerformedBy = () =>
    profile?.fullName || profile?.email || 'Unknown Admin';

  const closeConfirm = () =>
    setConfirmDelete({ open: false, id: '', name: '' });

  // ── Real-time category listener ──────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventory_categories'), (snap) => {
      setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // ── drug→medicine one-time migration ────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const drugDocRef = doc(db, 'inventory_categories', 'default_drug');
        const drugSnap = await getDoc(drugDocRef);
        if (!drugSnap.exists()) return;

        const invSnap = await getDocs(query(collection(db, 'inventory'), where('category', '==', 'drug')));
        if (invSnap.docs.length > 0) {
          const batch = writeBatch(db);
          invSnap.docs.forEach(d => {
            batch.update(d.ref, { category: 'medicine', productClass: 'medicine', isMedicine: true });
          });
          await batch.commit();
          console.log(`[Migration] Migrated ${invSnap.docs.length} items from 'drug' to 'medicine'.`);
        }

        await deleteDoc(drugDocRef);
        await logCategoryEvent('MIGRATE', 'drug→medicine', { migratedItems: invSnap.docs.length }, 'system');
        console.log('[Migration] default_drug category removed.');
      } catch (e) {
        console.error('[Migration] drug→medicine failed:', e);
      }
    })();
  }, []);

  // ── Item counts per category ─────────────────────────────────────────────
  const itemCounts = useMemo(() => {
    const counts = {};
    (inventory || []).filter(i => !i.isArchived).forEach(i => {
      const cat = (i.category || '').toLowerCase();
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [inventory]);

  // ── Derived display list ─────────────────────────────────────────────────
  const visibleCategories = useMemo(() => {
    return [...categories]
      .filter((c) => {
        const matchesSearch = c.name?.toLowerCase().includes(catSearch.toLowerCase());
        const pc = c.productClass || (c.isMedicine ? 'medicine' : 'retail');
        const matchesFilter = selectedClassFilter === 'all' || pc === selectedClassFilter;
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => {
        const key = catSort.key;
        const dir = catSort.dir;

        if (key === 'name') {
          const nameA = a.name.toLowerCase();
          const nameB = b.name.toLowerCase();
          return dir === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        } else {
          // Sort by item counts
          const countA = itemCounts[a.name] || 0;
          const countB = itemCounts[b.name] || 0;
          return dir === 'asc' ? countA - countB : countB - countA;
        }
      });
  }, [categories, catSearch, catSort, itemCounts]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSort = (key) => {
    setCatSort(prev => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'asc' };
    });
  };

  const handleAddCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return showToast('Category name is required.', 'warning');
    if (categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase()))
      return showToast('Category already exists!', 'error');
    try {
      await addDoc(collection(db, 'inventory_categories'), {
        name: trimmed,
        isMedicine: newCatProductClass === 'medicine',
        productClass: newCatProductClass,
      });
      await logCategoryEvent('CREATE', trimmed, { productClass: newCatProductClass }, getPerformedBy());
      setNewCatName('');
      setNewCatProductClass('retail');
      showToast('Category added.');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleDeleteCategory = async (id, name) => {
    if (id.startsWith('default_')) {
      return showToast(`"${name}" is a system default category and cannot be deleted.`, 'warning');
    }
    try {
      const q = query(collection(db, 'inventory'), where('category', '==', name));
      const invSnap = await getDocs(q);
      const itemCount = invSnap.docs.filter(d => !d.data().isArchived).length;
      if (itemCount > 0) {
        return showToast(
          `Category In Use: ${itemCount} item${itemCount > 1 ? 's' : ''} assigned to "${name}". Re-assign or archive them first.`,
          'error'
        );
      }
      setConfirmDelete({ open: true, id, name });
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleConfirmDelete = async () => {
    const { id, name } = confirmDelete;
    closeConfirm();
    try {
      await deleteDoc(doc(db, 'inventory_categories', id));
      await logCategoryEvent('DELETE', name, {}, getPerformedBy());
      showToast('Category deleted.');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleEditCategory = async () => {
    const { id, name, productClass: newPC, isDefault } = editDialog;
    const original = categories.find(c => c.id === id);
    if (!original) return;
    const oldName = original.name;
    const oldPC = original.productClass || (original.isMedicine ? 'medicine' : 'retail');
    const batch = writeBatch(db);

    batch.update(doc(db, 'inventory_categories', id), {
      ...(!isDefault && name !== oldName ? { name } : {}),
      productClass: newPC,
      isMedicine: newPC === 'medicine',
    });

    const nameChanged = !isDefault && name !== oldName;
    const classChanged = newPC !== oldPC;
    if (nameChanged || classChanged) {
      const invSnap = await getDocs(query(collection(db, 'inventory'), where('category', '==', oldName)));
      invSnap.docs.forEach(d => {
        const updates = {};
        if (nameChanged) updates.category = name;
        if (classChanged) {
          const data = d.data();
          if (!data.productClass || data.productClass === oldPC) {
            updates.productClass = newPC;
            updates.isMedicine = newPC === 'medicine';
          }
        }
        if (Object.keys(updates).length > 0) batch.update(d.ref, updates);
      });
    }

    try {
      await batch.commit();
      await logCategoryEvent(
        'EDIT',
        name || oldName,
        { oldName, newProductClass: newPC, oldProductClass: oldPC },
        getPerformedBy()
      );
      setEditDialog(d => ({ ...d, open: false }));
      showToast('Category updated.');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, bgcolor: COLORS.formBg }}>
      <Paper
        elevation={0}
        sx={{
          bgcolor: 'white',
          border: 0,
          borderRadius: 0,
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Add Category Modal */}
      <Dialog
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 0,
            border: `4px solid ${COLORS.accent}`,
            boxShadow: '8px 8px 0px rgba(0,0,0,0.2)',
          }
        }}
      >
        <Box sx={{ bgcolor: COLORS.cream, p: 2, borderBottom: `2px solid ${COLORS.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontWeight: 900, color: COLORS.accent, display: 'flex', alignItems: 'center', gap: 1 }}>
            <AddCircleOutlineIcon /> NEW CATEGORY
          </Typography>
          <IconButton size="small" onClick={() => setIsAddModalOpen(false)} sx={{ color: COLORS.accent }}>
            <ClearIcon />
          </IconButton>
        </Box>
        <DialogContent sx={{ pt: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <TextField
            label="Category Name"
            fullWidth
            autoFocus
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
            inputProps={{ spellCheck: 'false', style: { fontWeight: 900 } }}
          />
          <TextField
            select
            label="Classification"
            fullWidth
            value={newCatProductClass}
            onChange={(e) => setNewCatProductClass(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
          >
            {CLASS_OPTIONS.map(o => (
              <MenuItem key={o.value} value={o.value} sx={{ fontWeight: 700 }}>{o.label}</MenuItem>
            ))}
          </TextField>
          <Typography variant="caption" sx={{ color: COLORS.textMuted, fontStyle: 'italic' }}>
            Categories help organize your inventory and financial reports.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button
            onClick={() => setIsAddModalOpen(false)}
            sx={{ fontWeight: 900, borderRadius: 0, color: COLORS.textMuted }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAddCategory}
            sx={{
              bgcolor: COLORS.cta, fontWeight: 900, borderRadius: 0, px: 4,
              '&:hover': { bgcolor: COLORS.brand }
            }}
          >
            Create Category
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
        {/* Header */}
        <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 1.5, borderBottom: `2px solid ${COLORS.accent}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography
            sx={{
              fontFamily: FONT, fontWeight: 900, textTransform: 'uppercase',
              letterSpacing: 1, color: COLORS.accent, display: 'flex', alignItems: 'center', gap: 1,
            }}
          >
            <InventoryIcon /> Inventory Categories
          </Typography>

          <Button
            variant="contained"
            onClick={() => setIsAddModalOpen(true)}
            startIcon={<AddCircleOutlineIcon />}
            sx={{
              bgcolor: COLORS.accent, fontWeight: 900, px: 3, py: 0.5, borderRadius: 0,
              border: `2px solid ${COLORS.brand}`,
              boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
              '&:hover': { bgcolor: COLORS.brand },
              fontSize: '0.75rem',
            }}
          >
            New Category
          </Button>
        </Box>

        <Box sx={{ p: 3 }}>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
              <TextField
                placeholder="Quick find category..."
                size="small"
                fullWidth
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: COLORS.accent, fontSize: 20 }} />
                    </InputAdornment>
                  ),
                  endAdornment: catSearch && (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setCatSearch('')}>
                        <ClearIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{
                  bgcolor: 'white',
                  '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, borderColor: `${COLORS.accent}33` },
                  flexGrow: 2,
                }}
                inputProps={{ style: { fontWeight: 900, fontSize: '0.85rem' } }}
              />

              <Stack direction="row" spacing={1} sx={{ bgcolor: COLORS.cream, p: 0.5, border: `1px solid ${COLORS.accent}22` }}>
                <Button
                  size="small"
                  variant={catSort.key === 'name' ? 'contained' : 'text'}
                  onClick={() => handleSort('name')}
                  startIcon={catSort.key === 'name' ? (catSort.dir === 'asc' ? <ArrowUpwardIcon sx={{ fontSize: '14px !important' }} /> : <ArrowDownwardIcon sx={{ fontSize: '14px !important' }} />) : null}
                  sx={{
                    borderRadius: 0, fontWeight: 900, fontSize: '0.7rem', letterSpacing: 1, px: 2,
                    bgcolor: catSort.key === 'name' ? COLORS.accent : 'transparent',
                    color: catSort.key === 'name' ? 'white' : COLORS.textMuted,
                    '&:hover': { bgcolor: catSort.key === 'name' ? COLORS.brand : 'rgba(0,0,0,0.05)' }
                  }}
                >
                  Name
                </Button>
                <Button
                  size="small"
                  variant={catSort.key === 'items' ? 'contained' : 'text'}
                  onClick={() => handleSort('items')}
                  startIcon={catSort.key === 'items' ? (catSort.dir === 'asc' ? <ArrowUpwardIcon sx={{ fontSize: '14px !important' }} /> : <ArrowDownwardIcon sx={{ fontSize: '14px !important' }} />) : null}
                  sx={{
                    borderRadius: 0, fontWeight: 900, fontSize: '0.7rem', letterSpacing: 1, px: 2,
                    bgcolor: catSort.key === 'items' ? COLORS.accent : 'transparent',
                    color: catSort.key === 'items' ? 'white' : COLORS.textMuted,
                    '&:hover': { bgcolor: catSort.key === 'items' ? COLORS.brand : 'rgba(0,0,0,0.05)' }
                  }}
                >
                  Items
                </Button>
              </Stack>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 900, color: COLORS.textMuted, textTransform: 'uppercase', mr: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <FilterListIcon sx={{ fontSize: 14 }} /> Filter:
              </Typography>
              <Chip
                label="All Categories"
                size="small"
                onClick={() => setSelectedClassFilter('all')}
                sx={{
                  borderRadius: 0, fontWeight: 900, fontSize: '0.65rem',
                  bgcolor: selectedClassFilter === 'all' ? COLORS.accent : COLORS.cream,
                  color: selectedClassFilter === 'all' ? 'white' : COLORS.textMuted,
                  border: `1px solid ${selectedClassFilter === 'all' ? COLORS.brand : COLORS.accent}33`,
                  '&:hover': { bgcolor: selectedClassFilter === 'all' ? COLORS.brand : 'rgba(0,0,0,0.05)' }
                }}
              />
              {CLASS_OPTIONS.map(opt => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  size="small"
                  onClick={() => setSelectedClassFilter(opt.value)}
                  sx={{
                    borderRadius: 0, fontWeight: 900, fontSize: '0.65rem',
                    bgcolor: selectedClassFilter === opt.value ? COLORS.accent : 'transparent',
                    color: selectedClassFilter === opt.value ? 'white' : COLORS.textMuted,
                    border: `1px solid ${selectedClassFilter === opt.value ? COLORS.brand : COLORS.accent}33`,
                    '&:hover': { bgcolor: selectedClassFilter === opt.value ? COLORS.brand : 'rgba(0,0,0,0.05)' }
                  }}
                />
              ))}
            </Stack>
          </Box>

          {/* Category table container for scrolling */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Table size="small" stickyHeader sx={{ '& td, & th': { borderBottom: `1px solid ${COLORS.borderLight}`, py: 1.5 } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 900, fontFamily: FONT, textTransform: 'uppercase', fontSize: '0.7rem', bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.accent}` }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 900, fontFamily: FONT, textTransform: 'uppercase', fontSize: '0.7rem', bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.accent}` }}>Classification</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 900, fontFamily: FONT, textTransform: 'uppercase', fontSize: '0.7rem', bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.accent}` }}>Items</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900, fontFamily: FONT, textTransform: 'uppercase', fontSize: '0.7rem', bgcolor: COLORS.cream, borderBottom: `2px solid ${COLORS.accent}` }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleCategories.map((cat) => {
                  const pc = cat.productClass || (cat.isMedicine ? 'medicine' : 'retail');
                  const { label: chipLabel, color: chipColor } = classChipProps(pc);
                  const isDefault = cat.id.startsWith('default_') || SYSTEM_CATEGORY_NAMES.includes(cat.name.toLowerCase());
                  return (
                    <TableRow 
                      key={cat.id} 
                      hover 
                      sx={{ 
                        bgcolor: isDefault ? 'rgba(0,0,0,0.02)' : 'inherit',
                        transition: 'all 0.2s',
                      }}
                    >
                      <TableCell sx={{ fontWeight: 900, fontFamily: FONT }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {formatCategory(cat.name)}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={chipLabel}
                          size="small"
                          sx={{
                            fontWeight: 900, fontSize: '0.65rem', borderRadius: 0,
                            bgcolor: `${chipColor}1A`, color: chipColor, border: `1px solid ${chipColor}`,
                          }}
                        />
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, fontFamily: FONT }}>
                        {itemCounts[cat.name] || 0}
                      </TableCell>
                    <TableCell align="right">
                      {!isDefault ? (
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                          <IconButton
                            size="small"
                            onClick={() => setEditDialog({ open: true, id: cat.id, name: cat.name, productClass: pc, isDefault })}
                          >
                            <EditIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteCategory(cat.id, cat.name)}
                            sx={{ color: COLORS.danger }}
                          >
                            <DeleteIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Box>
                      ) : (
                        <Typography variant="caption" sx={{ color: COLORS.textMuted, fontStyle: 'italic', pr: 1, fontWeight: 900 }}>
                          DEFAULT
                        </Typography>
                      )}
                    </TableCell>
                    </TableRow>
                  );
                })}
                {visibleCategories.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, opacity: 0.5 }}>
                        <SearchIcon sx={{ fontSize: 48, color: COLORS.accent }} />
                        <Typography sx={{ fontWeight: 900, color: COLORS.accent, textTransform: 'uppercase', fontSize: '0.8rem' }}>
                          No categories found
                        </Typography>
                        <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                          Try adjusting your search or filters
                        </Typography>
                        <Button 
                          size="small" 
                          onClick={() => { setCatSearch(''); setSelectedClassFilter('all'); }}
                          sx={{ mt: 1, fontWeight: 900, textDecoration: 'underline' }}
                        >
                          Clear all filters
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </Box>
      </Paper>

      {/* Edit Category Dialog */}
      <Dialog
        open={editDialog.open}
        onClose={() => setEditDialog(d => ({ ...d, open: false }))}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.accent}` } }}
      >
        <DialogTitle sx={{ fontWeight: 900, color: COLORS.brand }}>Edit Category</DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Category Name"
            fullWidth
            value={editDialog.name}
            onChange={(e) => setEditDialog(d => ({ ...d, name: e.target.value }))}
            disabled={editDialog.isDefault}
            helperText={editDialog.isDefault ? 'System categories cannot be renamed.' : ''}
            sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
          />
          <TextField
            select
            label="Classification"
            fullWidth
            value={editDialog.productClass}
            onChange={(e) => setEditDialog(d => ({ ...d, productClass: e.target.value }))}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
          >
            {CLASS_OPTIONS.map(o => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setEditDialog(d => ({ ...d, open: false }))}
            sx={{ fontWeight: 900, borderRadius: 0 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleEditCategory}
            sx={{ fontWeight: 900, borderRadius: 0, bgcolor: COLORS.cta }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={confirmDelete.open}
        onClose={closeConfirm}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.accent}` } }}
      >
        <DialogTitle sx={{ fontWeight: 900, color: COLORS.danger, pb: 1 }}>
          Confirm Delete
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: FONT }}>
            Are you sure you want to delete the category{' '}
            <strong>"{confirmDelete.name}"</strong>?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={closeConfirm} sx={{ fontWeight: 'bold', color: '#757575', borderRadius: 0 }}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            variant="contained"
            sx={{ bgcolor: COLORS.danger, fontWeight: 'bold', borderRadius: 0, '&:hover': { bgcolor: COLORS.dangerHover } }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} sx={{ width: '100%', fontFamily: FONT, fontWeight: 'bold' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
