import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Stack, Chip, Select, MenuItem,
  FormControl, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableHead, TableRow, TableCell, TableBody, IconButton,
} from '@mui/material';
import {
  collection, onSnapshot, addDoc, deleteDoc, doc, getDocs, query, where, Timestamp,
  writeBatch, getDoc,
} from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { useUser } from '../../../context/UserContext';
import { COLORS, FONT, TYPE } from '../../../theme/designTokens';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import InventoryIcon from '@mui/icons-material/Inventory';
import EditIcon from '@mui/icons-material/Edit';
import LockIcon from '@mui/icons-material/Lock';
import DeleteIcon from '@mui/icons-material/Delete';
import { formatCategory } from '../Inventory';

// ─── Audit logger ────────────────────────────────────────────────────────────

async function logCategoryEvent(action, entityName, details, performedBy) {
  try {
    await addDoc(collection(db, 'settings_logs'), {
      action,
      entityType: 'inventory_category',
      entityName,
      performedBy,
      performedAt: Timestamp.now(),
      ...details,
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
  const [catSort, setCatSort]               = useState('asc');
  const [confirmDelete, setConfirmDelete]   = useState({ open: false, id: '', name: '' });
  const [editDialog, setEditDialog]         = useState({ open: false, id: '', name: '', productClass: 'retail', isDefault: false });
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
  const visibleCategories = [...categories]
    .filter((c) => c.name?.toLowerCase().includes(catSearch.toLowerCase()))
    .sort((a, b) =>
      catSort === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    );

  // ── Handlers ─────────────────────────────────────────────────────────────

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

    if (!isDefault && name !== oldName) {
      const invSnap = await getDocs(query(collection(db, 'inventory'), where('category', '==', oldName)));
      invSnap.docs.forEach(d => batch.update(d.ref, { category: name }));
    }

    if (newPC !== oldPC) {
      const catName = oldName;
      const invSnap = await getDocs(query(collection(db, 'inventory'), where('category', '==', catName)));
      invSnap.docs.forEach(d => {
        const data = d.data();
        if (!data.productClass || data.productClass === oldPC) {
          batch.update(d.ref, { productClass: newPC, isMedicine: newPC === 'medicine' });
        }
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
    <Box sx={{ p: 4 }}>
      <Paper
        elevation={0}
        sx={{
          bgcolor: 'white',
          border: `2px solid ${COLORS.accent}`,
          borderRadius: 0,
          boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Box sx={{ bgcolor: COLORS.cream, px: 3, py: 2, borderBottom: `2px solid ${COLORS.accent}` }}>
          <Typography
            sx={{
              fontFamily: FONT, fontWeight: 900, textTransform: 'uppercase',
              letterSpacing: 1, color: COLORS.accent, display: 'flex', alignItems: 'center', gap: 1,
            }}
          >
            <InventoryIcon /> Inventory Categories
          </Typography>
        </Box>

        <Box sx={{ p: 3 }}>
          <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, mb: 3 }}>
            Manage the taxonomy of your pharmacy and retail shop. These categories
            organize your search filters and financial reports.
          </Typography>

          {/* Add form */}
          <Stack direction="row" spacing={2} sx={{ mb: 4, alignItems: 'center' }}>
            <TextField
              label="New Category Name"
              size="small"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              sx={{
                flexGrow: 1, bgcolor: 'white',
                '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.accent}33` },
              }}
              inputProps={{ spellCheck: 'false', style: { fontWeight: 900 } }}
            />

            <TextField
              select
              label="Classification"
              size="small"
              value={newCatProductClass}
              onChange={(e) => setNewCatProductClass(e.target.value)}
              sx={{
                width: 200, bgcolor: 'white',
                '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 },
              }}
            >
              {CLASS_OPTIONS.map(o => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>

            <Button
              variant="contained"
              onClick={handleAddCategory}
              startIcon={<AddCircleOutlineIcon />}
              sx={{
                bgcolor: COLORS.accent, fontWeight: 900, px: 4, py: 1, borderRadius: 0,
                border: `2px solid ${COLORS.brand}`,
                boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.1)',
                '&:hover': { bgcolor: COLORS.brand },
              }}
            >
              Add
            </Button>
          </Stack>

          {/* Search + sort row */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              placeholder="Quick find category..."
              size="small"
              fullWidth
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              sx={{
                bgcolor: 'rgba(255,255,255,0.9)',
                '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, borderColor: COLORS.borderInput },
              }}
              inputProps={{ style: { fontWeight: 900 } }}
            />
            <FormControl size="small" sx={{ width: 140, bgcolor: 'rgba(255,255,255,0.9)' }}>
              <Select
                value={catSort}
                onChange={(e) => setCatSort(e.target.value)}
                sx={{
                  '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0, border: `1px solid ${COLORS.borderInput}` },
                  fontWeight: 900, color: '#555',
                }}
              >
                <MenuItem value="asc">A - Z</MenuItem>
                <MenuItem value="desc">Z - A</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Category table */}
          <Table size="small" sx={{ '& td, & th': { borderBottom: `1px solid ${COLORS.borderLight}`, py: 1.5 } }}>
            <TableHead>
              <TableRow sx={{ bgcolor: COLORS.cream }}>
                <TableCell sx={{ fontWeight: 900, fontFamily: FONT, textTransform: 'uppercase', fontSize: '0.7rem' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 900, fontFamily: FONT, textTransform: 'uppercase', fontSize: '0.7rem' }}>Classification</TableCell>
                <TableCell align="center" sx={{ fontWeight: 900, fontFamily: FONT, textTransform: 'uppercase', fontSize: '0.7rem' }}>Items</TableCell>
                <TableCell align="center" sx={{ fontWeight: 900, fontFamily: FONT, textTransform: 'uppercase', fontSize: '0.7rem' }}>System</TableCell>
                <TableCell align="right" sx={{ fontWeight: 900, fontFamily: FONT, textTransform: 'uppercase', fontSize: '0.7rem' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleCategories.map((cat) => {
                const pc = cat.productClass || (cat.isMedicine ? 'medicine' : 'retail');
                const { label: chipLabel, color: chipColor } = classChipProps(pc);
                const isDefault = cat.id.startsWith('default_');
                return (
                  <TableRow key={cat.id} hover>
                    <TableCell sx={{ fontWeight: 900, fontFamily: FONT }}>{formatCategory(cat.name)}</TableCell>
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
                    <TableCell align="center">
                      {isDefault && <LockIcon sx={{ fontSize: 16, color: COLORS.textMuted }} />}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => setEditDialog({ open: true, id: cat.id, name: cat.name, productClass: pc, isDefault })}
                      >
                        <EditIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      {!isDefault && (
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteCategory(cat.id, cat.name)}
                          sx={{ color: COLORS.danger }}
                        >
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {visibleCategories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, fontStyle: 'italic', color: COLORS.textSecondary }}>
                    No categories match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
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
