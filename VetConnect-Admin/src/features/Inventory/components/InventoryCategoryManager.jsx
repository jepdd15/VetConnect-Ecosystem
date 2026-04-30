import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Stack, Chip, Select, MenuItem,
  FormControl, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  collection, onSnapshot, addDoc, deleteDoc, doc, getDocs, query, where, Timestamp,
} from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { useUser } from '../../../context/UserContext';
import { COLORS, FONT, TYPE } from '../../../theme/designTokens';
import MedicinePillSwitch from '../../../components/MedicinePillSwitch';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import InventoryIcon from '@mui/icons-material/Inventory';
import MedicationIcon from '@mui/icons-material/Medication';

// ─── Audit logger ────────────────────────────────────────────────────────────

/**
 * Writes an audit entry to settings_logs, preserving the same schema used by
 * Settings.jsx so audit trail continuity is maintained after the move.
 */
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

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Self-contained Inventory Category manager rendered as the "Categories" tab
 * inside the Inventory page.  Has its own Firestore onSnapshot listener so it
 * always reflects the live collection state, independent of the deduplicated
 * list used by the Inventory Table filter dropdown.
 */
export default function InventoryCategoryManager() {
  const { profile } = useUser();

  // --- STATE ---
  const [categories, setCategories] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIsMedicine, setNewCatIsMedicine] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [catSort, setCatSort] = useState('asc');
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: '', name: '' });
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  // --- HELPERS ---
  const showToast = (message, severity = 'success') =>
    setToast({ open: true, message, severity });

  const getPerformedBy = () =>
    profile?.fullName || profile?.email || 'Unknown Admin';

  const closeConfirm = () =>
    setConfirmDelete({ open: false, id: '', name: '' });

  // --- REAL-TIME LISTENER (preserves raw doc IDs for delete/default protection) ---
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inventory_categories'), (snap) => {
      setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // --- HANDLERS ---

  const handleAddCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) {
      return showToast('Category name is required.', 'warning');
    }
    const isDuplicate = categories.some(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      return showToast('Category already exists!', 'error');
    }
    try {
      await addDoc(collection(db, 'inventory_categories'), {
        name: trimmed,
        isMedicine: newCatIsMedicine,
      });
      await logCategoryEvent(
        'CREATE',
        trimmed,
        { isMedicine: newCatIsMedicine },
        getPerformedBy()
      );
      setNewCatName('');
      setNewCatIsMedicine(false);
      showToast('Category added.');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handleDeleteCategory = async (id, name) => {
    // Default categories are system-protected and cannot be removed
    if (id.startsWith('default_')) {
      return showToast(
        `"${name}" is a system default category and cannot be deleted.`,
        'warning'
      );
    }
    // Usage shield: block deletion if active inventory items reference this category
    try {
      const q = query(collection(db, 'inventory'), where('category', '==', name));
      const invSnap = await getDocs(q);
      const itemCount = invSnap.docs.filter((d) => !d.data().isArchived).length;

      if (itemCount > 0) {
        return showToast(
          `Category In Use: ${itemCount} inventory item${itemCount > 1 ? 's' : ''} assigned to "${name}". Re-assign or archive them first.`,
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

  // --- DERIVED DISPLAY LIST ---
  const visibleCategories = [...categories]
    .filter((c) => c.name?.toLowerCase().includes(catSearch.toLowerCase()))
    .sort((a, b) =>
      catSort === 'asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    );

  // --- RENDER ---
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
        <Box
          sx={{
            bgcolor: COLORS.cream,
            px: 3,
            py: 2,
            borderBottom: `2px solid ${COLORS.accent}`,
          }}
        >
          <Typography
            sx={{
              fontFamily: FONT,
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: COLORS.accent,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
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
                flexGrow: 1,
                bgcolor: 'white',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderRadius: 0,
                  border: `1px solid ${COLORS.accent}33`,
                },
              }}
              inputProps={{ spellCheck: 'false', style: { fontWeight: 900 } }}
            />

            {/* Medicine / Retail pill toggle */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 0.5,
                bgcolor: 'white',
                border: `1px solid ${COLORS.accent}33`,
                borderRadius: 0,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 900,
                  color: newCatIsMedicine ? COLORS.dangerHover : '#757575',
                  fontSize: '0.65rem',
                }}
              >
                {newCatIsMedicine ? 'MEDICINE' : 'RETAIL'}
              </Typography>
              <MedicinePillSwitch
                checked={newCatIsMedicine}
                onChange={(e) => setNewCatIsMedicine(e.target.checked)}
              />
            </Box>

            <Button
              variant="contained"
              onClick={handleAddCategory}
              startIcon={<AddCircleOutlineIcon />}
              sx={{
                bgcolor: COLORS.accent,
                fontWeight: 900,
                px: 4,
                py: 1,
                borderRadius: 0,
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
                '& .MuiOutlinedInput-notchedOutline': {
                  borderRadius: 0,
                  borderColor: COLORS.borderInput,
                },
              }}
              inputProps={{ style: { fontWeight: 900 } }}
            />
            <FormControl size="small" sx={{ width: 140, bgcolor: 'rgba(255,255,255,0.9)' }}>
              <Select
                value={catSort}
                onChange={(e) => setCatSort(e.target.value)}
                sx={{
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderRadius: 0,
                    border: `1px solid ${COLORS.borderInput}`,
                  },
                  fontWeight: 900,
                  color: '#555',
                }}
              >
                <MenuItem value="asc">A - Z</MenuItem>
                <MenuItem value="desc">Z - A</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Category chips */}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1.5,
              p: 2.5,
              bgcolor: 'rgba(250,250,250,0.8)',
              borderRadius: 0,
              border: '1px inset rgba(0,0,0,0.1)',
              minHeight: 120,
              alignContent: 'flex-start',
            }}
          >
            {visibleCategories.map((cat) => (
              <Chip
                key={cat.id}
                label={cat.name}
                icon={
                  cat.isMedicine
                    ? <MedicationIcon sx={{ fontSize: '1rem !important', color: `${COLORS.danger} !important` }} />
                    : null
                }
                onDelete={
                  cat.id.startsWith('default_')
                    ? undefined
                    : () => handleDeleteCategory(cat.id, cat.name)
                }
                sx={{
                  fontWeight: 900,
                  bgcolor: 'white',
                  borderRadius: 0,
                  border: cat.isMedicine ? `2px solid ${COLORS.danger}` : '1px solid #ccc',
                  fontSize: '0.75rem',
                  py: 2.2,
                  '& .MuiChip-label': { color: cat.isMedicine ? COLORS.danger : 'inherit' },
                }}
              />
            ))}

            {visibleCategories.length === 0 && (
              <Typography
                variant="body2"
                sx={{
                  width: '100%',
                  textAlign: 'center',
                  mt: 4,
                  fontStyle: 'italic',
                  color: COLORS.textSecondary,
                }}
              >
                No categories match your search.
              </Typography>
            )}
          </Box>
        </Box>
      </Paper>

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
          <Button
            onClick={closeConfirm}
            sx={{ fontWeight: 'bold', color: '#757575', borderRadius: 0 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            variant="contained"
            sx={{
              bgcolor: COLORS.danger,
              fontWeight: 'bold',
              borderRadius: 0,
              '&:hover': { bgcolor: COLORS.dangerHover },
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} sx={{ width: '100%', fontFamily: FONT, fontWeight: 'bold' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
