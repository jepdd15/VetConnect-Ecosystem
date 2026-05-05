# T4.142 — 3-Tier Product Classification System + Category Manager Redesign

## Overview

Replace the binary `isMedicine` toggle with a 3-tier `productClass` system (**Medicine**, **Medical Supply**, **Retail**) that drives dispensing routing, auto-dosing, discharge section splitting, and field visibility across 10 files. The current system treats every product as either "drug" or "not drug" — this is Intermediate-grade. The 3-tier system adds a middle tier (Medical Supply) for clinical items that go home with the client (e-collars, wound care kits, therapeutic food) but don't require pharmacy verification or auto-dosing. The data model is dual-write: a new `productClass` field is authoritative, and the legacy `isMedicine` boolean is kept in sync for backward compatibility with any readers not yet migrated.

**Locked decisions:**
- 3 tiers: Medicine / Medical Supply / Retail
- Dual-write: `productClass` + `isMedicine: productClass === 'medicine'`
- Dual-read: check `productClass` first, fall back to `isDrug ? 'medicine' : 'retail'` for legacy docs
- "drug" default category removed with migration
- Category manager: MUI Table + Edit dialog
- Dispensing routing: Medicine only
- Auto-dosing (sig): Medicine only
- Discharge split: `medications[]` + `supplies[]`
- "Unit of Measure" renamed to "Dispensing Unit"
- Dosage/Strength, Lot Number, Expiry Date: shown for Medicine only
- SC/PWD eligibility stays per-item toggle, independent of tier

---

## Day 1 — Data Model + Inventory UI (~3 hrs)

**Goal:** Establish the `productClass` field everywhere in the Inventory module — ProductFormModal, InventoryCategoryManager, Inventory.jsx enrichment — and run the "drug" category migration.

---

### Step 1.1: Add productClass Select to ProductFormModal

**What:** Replace the `isMedicineOverride` useState + Switch toggle with a `productClass` Select dropdown that shows the 3 tiers with per-tier helper text.

**Where:** `VetConnect-Admin/src/features/Inventory/modals/ProductFormModal.jsx`

**How:**

1. **Line 44:** Replace `const [isMedicineOverride, setIsMedicineOverride] = useState(...)` with:
   ```js
   const [productClass, setProductClass] = useState(
     item?.productClass || null  // null = "derive from category default"
   );
   ```

2. **Add a constant** (above the component or inside it) for tier definitions:
   ```js
   const PRODUCT_CLASS_OPTIONS = [
     {
       value: 'medicine',
       label: 'Medicine',
       helper: 'Health product prescribed or recommended by the vet. Routes to dispensing for verification. Auto-generates dosing instructions. Appears in discharge medications.',
       color: COLORS.danger,
     },
     {
       value: 'medical_supply',
       label: 'Medical Supply',
       helper: 'Take-home clinical supply. Goes directly to billing. Appears in discharge as take-home supplies.',
       color: '#757575',
     },
     {
       value: 'retail',
       label: 'Retail',
       helper: 'Non-clinical product. Goes directly to billing. Does not appear on discharge summary.',
       color: COLORS.textMuted,
     },
   ];
   ```

3. **Lines 278-299:** Remove the entire `<Grid size={{ xs: 12 }}>` block containing the `FormControlLabel` + `Switch` for isMedicine override. Replace with a productClass Select:
   ```jsx
   <Grid size={{ xs: 12 }}>
     <TextField
       select
       label="Product Classification"
       fullWidth
       value={
         productClass !== null
           ? productClass
           : (categories.find(c => c.name === formData.category)?.productClass || 'retail')
       }
       onChange={(e) => setProductClass(e.target.value)}
       helperText={
         PRODUCT_CLASS_OPTIONS.find(o => o.value === (
           productClass !== null
             ? productClass
             : (categories.find(c => c.name === formData.category)?.productClass || 'retail')
         ))?.helper || ''
       }
       sx={sxField}
     >
       {PRODUCT_CLASS_OPTIONS.map(opt => (
         <MenuItem key={opt.value} value={opt.value}>
           <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
             <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: opt.color }} />
             {opt.label}
           </Box>
         </MenuItem>
       ))}
     </TextField>
   </Grid>
   ```

4. **Lines 237-239:** Update the Category dropdown `helperText` to show the 3-tier label instead of binary "Medicine/Retail":
   ```js
   helperText={
     errors.category
     || (() => {
       const catPC = categories.find(c => c.name === formData.category)?.productClass;
       if (catPC === 'medicine') return 'Default: Medicine — routes to pharmacy.';
       if (catPC === 'medical_supply') return 'Default: Medical Supply — clinical take-home.';
       return 'Default: Retail — standard checkout.';
     })()
   }
   ```

5. **Lines 243-248:** In the Category `<MenuItem>`, replace the `MedicationIcon` shown for `cat.isMedicine` with a small colored dot based on `cat.productClass`:
   ```jsx
   {(categories || []).map(cat => {
     const pc = cat.productClass || (cat.isMedicine ? 'medicine' : 'retail');
     const dotColor = pc === 'medicine' ? COLORS.danger : pc === 'medical_supply' ? '#757575' : COLORS.textMuted;
     return (
       <MenuItem key={cat.name} value={cat.name} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
         {formatCategory(cat.name)}
         <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
           <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dotColor }} />
           {cat.name === 'vaccine' && <VaccinesIcon sx={{ fontSize: 16, color: COLORS.success, ml: 0.5 }} />}
         </Box>
       </MenuItem>
     );
   })}
   ```

6. **Line 116:** Replace `...(isMedicineOverride !== null && { isMedicineOverride })` with `...(productClass !== null && { productClassOverride: productClass })` in the `handleSubmit` payload.

7. **Line 231:** On category change, reset productClass override to null: `setProductClass(null);` (already resets isMedicineOverride — rename the call).

8. **Line 152:** In `handleQuickAddCategory`, replace `isMedicine: autoMedicine` with:
   ```js
   isMedicine: autoMedicine,
   productClass: autoMedicine ? 'medicine' : 'retail',
   ```

**Done when:** ProductFormModal shows a 3-option Select dropdown with dynamic helper text. Selecting a category updates the default productClass. Per-item override works. No `isMedicineOverride` state or Switch remains.

**Depends on:** Nothing.

---

### Step 1.2: Rename "Unit of Measure" to "Dispensing Unit" + Conditional Fields

**What:** Rename the Unit field label, and conditionally show Dosage/Strength + Lot/Expiry only for Medicine tier.

**Where:** `VetConnect-Admin/src/features/Inventory/modals/ProductFormModal.jsx`

**How:**

1. **Line 265:** Change `label="Unit of Measure"` to `label="Dispensing Unit"`. Change `placeholder` to `"e.g. Capsule, Tablet, Bottle"`. Change helperText in validation (line 90) from `'Unit of measure is required'` to `'Dispensing unit is required (e.g. Capsule, Vial, Bottle).'`

2. **Lines 271-276 (Dosage/Strength):** Wrap in a conditional block:
   ```jsx
   {resolvedProductClass === 'medicine' && (
     <Grid size={{ xs: 12, sm: 4 }}>
       <TextField label="Dosage / Strength" ... />
     </Grid>
   )}
   ```
   Where `resolvedProductClass` is a computed variable:
   ```js
   const resolvedProductClass = productClass !== null
     ? productClass
     : (categories.find(c => c.name === formData.category)?.productClass || 'retail');
   ```

3. **Section 2 (Lines 306-338, Batch & Traceability):** Wrap the entire section in `{resolvedProductClass === 'medicine' && (...)}`. Lot Number and Expiry Date are only shown for Medicine tier. They remain optional — batch tracking activates based on data presence.

**Done when:** Dosage/Strength and Batch section only appear when the resolved productClass is 'medicine'. Label says "Dispensing Unit".

**Depends on:** Step 1.1.

---

### Step 1.3: Update Inventory.jsx Enrichment with productClass

**What:** Update the default category seed with `productClass` values, and update the enrichment/join logic that derives `isMedicine` to also derive `productClass` with dual-write.

**Where:** `VetConnect-Admin/src/features/Inventory/Inventory.jsx`

**How:**

1. **Lines 124-132:** Update the defaultCategories array:
   ```js
   const defaultCategories = [
     { name: 'medicine',    isMedicine: true,  productClass: 'medicine' },
     { name: 'vaccine',     isMedicine: true,  productClass: 'medicine' },
     // 'drug' removed — handled by migration in InventoryCategoryManager
     { name: 'food',        isMedicine: false, productClass: 'retail' },
     { name: 'supplies',    isMedicine: false, productClass: 'medical_supply' },
     { name: 'accessories', isMedicine: false, productClass: 'retail' },
     { name: 'lab',         isMedicine: false, productClass: 'medical_supply' },
   ];
   ```
   Note: Remove `{ name: 'drug', ... }` from the seed. The migration (Step 1.5) handles the existing `default_drug` doc.

2. **Lines 141-153:** Update the listener to also read `productClass` from category docs:
   ```js
   catMap.set(name, {
     name,
     isMedicine: !!c.isMedicine,
     productClass: c.productClass || (c.isMedicine ? 'medicine' : 'retail'),
   });
   ```

3. **Lines 250-259 (handleSaveForm):** Update the enrichment to derive productClass with dual-write:
   ```js
   const handleSaveForm = async (data) => {
     try {
       const catObj = invCategories.find(c => c.name === (data.category || '').toLowerCase().trim());
       // Resolve productClass: per-item override > category default > fallback
       const derivedProductClass = data.productClassOverride
         || catObj?.productClass
         || (catObj?.isMedicine ? 'medicine' : 'retail');
       const enrichedData = {
         ...data,
         productClass: derivedProductClass,
         isMedicine: derivedProductClass === 'medicine', // dual-write backward compat
       };
       delete enrichedData.productClassOverride;
       // Remove legacy field
       delete enrichedData.isMedicineOverride;
       ...
     }
   };
   ```

**Done when:** New products are saved with both `productClass` and `isMedicine` fields. Category listener carries `productClass`. Default seed has 6 categories (no 'drug').

**Depends on:** Step 1.1.

---

### Step 1.4: Redesign InventoryCategoryManager — MUI Table + Edit Dialog

**What:** Replace the chip-based category display with an MUI Table (Name, Classification, Items, System, Actions). Add Edit Category Dialog. Add batch-update on name/productClass change.

**Where:** `VetConnect-Admin/src/features/Inventory/components/InventoryCategoryManager.jsx`

**How:**

1. **Add imports:** `Table, TableHead, TableRow, TableCell, TableBody, IconButton` from MUI. `EditIcon, LockIcon, DeleteIcon` from MUI icons. Import `writeBatch, updateDoc` from firebase/firestore. Import `useInventory` or accept `inventory` as a prop to compute item counts.

2. **Add props:** The component needs access to inventory items to show "Items" count. Currently it's standalone. Add `inventory` prop from `Inventory.jsx`:
   - In `Inventory.jsx` line 530: change `<InventoryCategoryManager />` to `<InventoryCategoryManager inventory={inventory} />`
   - In `InventoryCategoryManager`: `export default function InventoryCategoryManager({ inventory = [] }) {`

3. **Replace state:** Change `newCatIsMedicine` to `newCatProductClass` with default `'retail'`.

4. **Add edit dialog state:**
   ```js
   const [editDialog, setEditDialog] = useState({ open: false, id: '', name: '', productClass: 'retail', isDefault: false });
   ```

5. **Compute item counts client-side:**
   ```js
   const itemCounts = useMemo(() => {
     const counts = {};
     (inventory || []).filter(i => !i.isArchived).forEach(i => {
       const cat = (i.category || '').toLowerCase();
       counts[cat] = (counts[cat] || 0) + 1;
     });
     return counts;
   }, [inventory]);
   ```

6. **Replace the "Add form" row (lines 201-265):** Replace the `MedicinePillSwitch` toggle with a productClass Select:
   ```jsx
   <TextField
     select
     label="Classification"
     size="small"
     value={newCatProductClass}
     onChange={(e) => setNewCatProductClass(e.target.value)}
     sx={{ width: 200, bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 0 } }}
   >
     <MenuItem value="medicine">Medicine</MenuItem>
     <MenuItem value="medical_supply">Medical Supply</MenuItem>
     <MenuItem value="retail">Retail</MenuItem>
   </TextField>
   ```

7. **Replace the category chips (lines 303-357) with MUI Table:**
   ```jsx
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
         const chipColor = pc === 'medicine' ? COLORS.danger : pc === 'medical_supply' ? '#757575' : COLORS.textMuted;
         const chipLabel = pc === 'medicine' ? 'Medicine' : pc === 'medical_supply' ? 'Medical Supply' : 'Retail';
         const isDefault = cat.id.startsWith('default_');
         return (
           <TableRow key={cat.id} hover>
             <TableCell sx={{ fontWeight: 900, fontFamily: FONT }}>{formatCategory(cat.name)}</TableCell>
             <TableCell>
               <Chip label={chipLabel} size="small" sx={{ fontWeight: 900, fontSize: '0.65rem', borderRadius: 0, bgcolor: `${chipColor}1A`, color: chipColor, border: `1px solid ${chipColor}` }} />
             </TableCell>
             <TableCell align="center" sx={{ fontWeight: 700, fontFamily: FONT }}>{itemCounts[cat.name] || 0}</TableCell>
             <TableCell align="center">{isDefault && <LockIcon sx={{ fontSize: 16, color: COLORS.textMuted }} />}</TableCell>
             <TableCell align="right">
               <IconButton size="small" onClick={() => setEditDialog({ open: true, id: cat.id, name: cat.name, productClass: pc, isDefault })}>
                 <EditIcon sx={{ fontSize: 16 }} />
               </IconButton>
               {!isDefault && (
                 <IconButton size="small" onClick={() => handleDeleteCategory(cat.id, cat.name)} sx={{ color: COLORS.danger }}>
                   <DeleteIcon sx={{ fontSize: 16 }} />
                 </IconButton>
               )}
             </TableCell>
           </TableRow>
         );
       })}
     </TableBody>
   </Table>
   ```

8. **Update `handleAddCategory` (line 90-92):** Write both fields:
   ```js
   await addDoc(collection(db, 'inventory_categories'), {
     name: trimmed,
     isMedicine: newCatProductClass === 'medicine',
     productClass: newCatProductClass,
   });
   ```

9. **Add Edit Category Dialog:**
   ```jsx
   <Dialog open={editDialog.open} onClose={() => setEditDialog(d => ({...d, open: false}))} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 0, border: `2px solid ${COLORS.accent}` } }}>
     <DialogTitle sx={{ fontWeight: 900, color: COLORS.brand }}>Edit Category</DialogTitle>
     <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
       <TextField
         label="Category Name"
         fullWidth
         value={editDialog.name}
         onChange={(e) => setEditDialog(d => ({...d, name: e.target.value}))}
         disabled={editDialog.isDefault}
         helperText={editDialog.isDefault ? 'System categories cannot be renamed.' : ''}
         sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
       />
       <TextField
         select
         label="Classification"
         fullWidth
         value={editDialog.productClass}
         onChange={(e) => setEditDialog(d => ({...d, productClass: e.target.value}))}
         sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
       >
         <MenuItem value="medicine">Medicine</MenuItem>
         <MenuItem value="medical_supply">Medical Supply</MenuItem>
         <MenuItem value="retail">Retail</MenuItem>
       </TextField>
     </DialogContent>
     <DialogActions sx={{ p: 2 }}>
       <Button onClick={() => setEditDialog(d => ({...d, open: false}))} sx={{ fontWeight: 900, borderRadius: 0 }}>Cancel</Button>
       <Button variant="contained" onClick={handleEditCategory} sx={{ fontWeight: 900, borderRadius: 0, bgcolor: COLORS.cta }}>Save</Button>
     </DialogActions>
   </Dialog>
   ```

10. **Add `handleEditCategory` handler:**
    ```js
    const handleEditCategory = async () => {
      const { id, name, productClass: newPC, isDefault } = editDialog;
      const original = categories.find(c => c.id === id);
      if (!original) return;
      const oldName = original.name;
      const oldPC = original.productClass || (original.isMedicine ? 'medicine' : 'retail');
      const batch = writeBatch(db);

      // Update the category doc
      batch.update(doc(db, 'inventory_categories', id), {
        ...(!isDefault && name !== oldName ? { name } : {}),
        productClass: newPC,
        isMedicine: newPC === 'medicine',
      });

      // If name changed: batch-update all inventory items with old category name
      if (!isDefault && name !== oldName) {
        const invSnap = await getDocs(query(collection(db, 'inventory'), where('category', '==', oldName)));
        invSnap.docs.forEach(d => {
          batch.update(d.ref, { category: name });
        });
      }

      // If productClass changed: batch-update items that don't have a per-item override
      if (newPC !== oldPC) {
        const catName = isDefault ? oldName : (name || oldName);
        const invSnap = await getDocs(query(collection(db, 'inventory'), where('category', '==', catName)));
        invSnap.docs.forEach(d => {
          const data = d.data();
          // Only update if the item's productClass matches the OLD category default
          // (i.e., it was inheriting, not overridden)
          if (!data.productClass || data.productClass === oldPC) {
            batch.update(d.ref, {
              productClass: newPC,
              isMedicine: newPC === 'medicine',
            });
          }
        });
      }

      try {
        await batch.commit();
        await logCategoryEvent('EDIT', name || oldName, { oldName, newProductClass: newPC, oldProductClass: oldPC }, getPerformedBy());
        setEditDialog(d => ({...d, open: false}));
        showToast('Category updated.');
      } catch (e) {
        showToast(e.message, 'error');
      }
    };
    ```

11. **Remove the `MedicinePillSwitch` import** (line 12) — no longer used. Remove the import of the component.

**Done when:** Categories tab shows a table with columns Name, Classification (colored chip), Items (count), System (lock), Actions (Edit/Delete). Edit dialog opens, allows name change (non-default) and productClass change. On productClass change, all items inheriting the old class are batch-updated. Default categories show lock icon and have disabled name field.

**Depends on:** Step 1.3 (for `inventory` prop).

---

### Step 1.5: "drug" Category Migration

**What:** Remove the "drug" default category. Migrate all items with `category === 'drug'` to `category: 'medicine'`. Delete the `default_drug` doc. Idempotent — runs on mount, skips if already done.

**Where:** `VetConnect-Admin/src/features/Inventory/components/InventoryCategoryManager.jsx` (add a `useEffect` migration hook)

**How:**

1. Add a `useEffect` that runs once on mount:
   ```js
   useEffect(() => {
     (async () => {
       try {
         const drugDocRef = doc(db, 'inventory_categories', 'default_drug');
         const drugSnap = await getDoc(drugDocRef);
         if (!drugSnap.exists()) return; // Already migrated

         // Batch-update all inventory items with category === 'drug'
         const invSnap = await getDocs(query(collection(db, 'inventory'), where('category', '==', 'drug')));
         if (invSnap.docs.length > 0) {
           const batch = writeBatch(db);
           invSnap.docs.forEach(d => {
             batch.update(d.ref, {
               category: 'medicine',
               productClass: 'medicine',
               isMedicine: true,
             });
           });
           await batch.commit();
           console.log(`[Migration] Migrated ${invSnap.docs.length} items from 'drug' to 'medicine'.`);
         }

         // Delete the default_drug category doc
         await deleteDoc(drugDocRef);
         await logCategoryEvent('MIGRATE', 'drug→medicine', { migratedItems: invSnap.docs.length }, 'system');
         console.log('[Migration] default_drug category removed.');
       } catch (e) {
         console.error('[Migration] drug→medicine failed:', e);
       }
     })();
   }, []);
   ```

2. Add `getDoc` to the firebase/firestore imports.

**Done when:** On first load after deployment, any items with `category === 'drug'` are moved to `category: 'medicine'`, and the `default_drug` doc is deleted. Subsequent loads are a no-op (`!drugSnap.exists()` early return).

**Depends on:** Step 1.3 (updated seed without 'drug').

---

### Day 1 Verification Checkpoint

- [ ] ProductFormModal shows a 3-tier Select dropdown; no Switch toggle remains
- [ ] Selecting "Medicine" shows dosage/batch fields; "Medical Supply" and "Retail" hide them
- [ ] "Unit of Measure" label reads "Dispensing Unit"
- [ ] Category dropdown items show colored dots, not just MedicationIcon
- [ ] Saving a new product writes both `productClass` and `isMedicine` to Firestore
- [ ] Categories tab shows MUI Table with 5 columns
- [ ] Edit dialog works: name change batch-updates items, productClass change batch-updates inheriting items
- [ ] Default categories show lock icon, name field disabled, delete blocked
- [ ] "drug" category is migrated to "medicine" on first load; `default_drug` doc deleted

---

## Day 2 — Clinical Workflow + Queue (~2.5 hrs)

**Goal:** Wire `productClass` into ClinicalWorkspace (dispensing routing, auto-dosing, discharge split, sidebar display), DispensingVerificationDialog labels, queueColumns filter, and Queue.jsx enrichment.

---

### Step 2.1: ClinicalWorkspace — Cart Item productClass + Dual-Write

**What:** When adding items to `treatmentCart`, write `productClass` alongside `isDrug` for dual-write. Update all cart item creation sites.

**Where:** `VetConnect-Admin/src/components/ClinicalWorkspace.jsx`

**How:**

1. **Line 831 (service base items):** Add `productClass: 'retail'` (services don't have classifications — retail is the neutral default since they never appear in dispensing/discharge items):
   ```js
   initialCart.push({
     type: 'service', id: svc.id, name: svc.name,
     price: resolvedPrice, qty: 1,
     isDrug: false, productClass: 'retail',
     isBase: true, ...
   });
   ```

2. **Line 861 (linked inventory items):** Replace `isDrug: !!linkedInv.isMedicine` with dual-write:
   ```js
   isDrug: !!linkedInv.isMedicine,
   productClass: linkedInv.productClass || (linkedInv.isMedicine ? 'medicine' : 'retail'),
   ```

3. **Line 1373 (handleAddRx):** Replace `const isMedicine = !!item.isMedicine;` with:
   ```js
   const resolvedPC = item.productClass || (item.isMedicine ? 'medicine' : 'retail');
   ```

4. **Line 1394:** Update `itemObj` creation:
   ```js
   isDrug: resolvedPC === 'medicine',    // backward compat
   productClass: resolvedPC,             // new authoritative field
   ```

5. **Line 1408:** Change `if (isMedicine)` to `if (resolvedPC === 'medicine')`.

**Done when:** Every cart item has both `isDrug` and `productClass`. `isDrug` is derived from `productClass === 'medicine'`.

**Depends on:** Day 1 complete (productClass on inventory docs).

---

### Step 2.2: ClinicalWorkspace — Dispensing Routing

**What:** Change `hasDrugsInCart` to check `productClass === 'medicine'` with fallback.

**Where:** `VetConnect-Admin/src/components/ClinicalWorkspace.jsx`, line 1664

**How:**

Replace:
```js
const hasDrugsInCart = treatmentCart.some(item => item.isDrug);
```

With:
```js
const hasDrugsInCart = treatmentCart.some(item =>
  (item.productClass || (item.isDrug ? 'medicine' : 'retail')) === 'medicine'
);
```

This is the dual-read pattern: check `productClass` first, fall back to `isDrug` for legacy cart items from before migration.

**Done when:** Only Medicine-tier items trigger the dispensing route. Medical Supply and Retail go straight to billing.

**Depends on:** Step 2.1.

---

### Step 2.3: ClinicalWorkspace — Discharge Summary Split

**What:** Split `dischargeSummary.medications` into two arrays: `medications` (Medicine tier) and `supplies` (Medical Supply tier). Retail excluded from discharge.

**Where:** `VetConnect-Admin/src/components/ClinicalWorkspace.jsx`, lines 1909-1926

**How:**

Replace the existing `medications` field in `dischargeSummary`:
```js
medications: treatmentCart
    .filter(item => item.isDrug)
    .map(item => ({
        name: item.name,
        qty: item.qty,
        instructions: item.instructions || 'Use as directed',
    })),
```

With:
```js
medications: treatmentCart
    .filter(item => (item.productClass || (item.isDrug ? 'medicine' : 'retail')) === 'medicine')
    .map(item => ({
        name: item.name,
        qty: item.qty,
        instructions: item.instructions || 'Use as directed',
    })),
supplies: treatmentCart
    .filter(item => (item.productClass || (item.isDrug ? 'medicine' : 'retail')) === 'medical_supply')
    .map(item => ({
        name: item.name,
        qty: item.qty,
        instructions: item.instructions || '',
    })),
```

**Done when:** `dischargeSummary` written to Firestore has both `medications[]` and `supplies[]`. Retail items excluded from both.

**Depends on:** Step 2.1.

---

### Step 2.4: ClinicalWorkspace — Sidebar Display

**What:** Update the sidebar Treatment Cart to use `productClass` for the drug/non-drug visual split.

**Where:** `VetConnect-Admin/src/components/ClinicalWorkspace.jsx`, lines 3903-3926

**How:**

1. **Line 3903:** Change `{rx.isDrug && (` to `{(rx.productClass || (rx.isDrug ? 'medicine' : 'retail')) === 'medicine' && (`

2. **Line 3926:** Change `{!rx.isDrug && (` to `{(rx.productClass || (rx.isDrug ? 'medicine' : 'retail')) !== 'medicine' && (`

This ensures the always-visible instructions field shows for Medicine items, and the collapsible instructions shows for Medical Supply + Retail.

**Done when:** Medicine items show always-visible instructions TextField. Medical Supply and Retail show collapsible instructions.

**Depends on:** Step 2.1.

---

### Step 2.5: ClinicalWorkspace — encounterItems productClass in medical record

**What:** Ensure the `encounterItems` array written to the medical record includes `productClass` for each item.

**Where:** `VetConnect-Admin/src/components/ClinicalWorkspace.jsx`, line ~1893

**How:**

Find the `encounterItems` mapping in `handleSaveConsult`. Around line 1893:
```js
encounterItems: treatmentCart.map(item => ({
    id: item.id, name: item.name, type: item.type,
    price: item.price, qty: item.qty,
    isDrug: !!item.isDrug,
})),
```

Add `productClass`:
```js
encounterItems: treatmentCart.map(item => ({
    id: item.id, name: item.name, type: item.type,
    price: item.price, qty: item.qty,
    isDrug: !!item.isDrug,
    productClass: item.productClass || (item.isDrug ? 'medicine' : 'retail'),
})),
```

Also ensure `dispensedProducts` (the renamed field per T3.98) carries `productClass`:
```js
dispensedProducts: treatmentCart.map(item => ({
    ...existingFields,
    productClass: item.productClass || (item.isDrug ? 'medicine' : 'retail'),
})),
```

**Done when:** Medical records written to Firestore include `productClass` on each `encounterItems[]` and `dispensedProducts[]` entry.

**Depends on:** Step 2.1.

---

### Step 2.6: Queue.jsx — Inventory Join Enrichment

**What:** Update the forensic inventory join in Queue.jsx to derive `productClass` alongside `isMedicine`.

**Where:** `VetConnect-Admin/src/features/Queue/Queue.jsx`, lines 1661-1668

**How:**

Replace:
```js
return { ...item, isMedicine: catObj ? !!catObj.isMedicine : false };
```

With:
```js
return {
  ...item,
  isMedicine: catObj ? !!catObj.isMedicine : false,
  productClass: catObj?.productClass || (catObj?.isMedicine ? 'medicine' : 'retail'),
};
```

**Done when:** `joinedInventory` in Queue.jsx carries `productClass` for every item.

**Depends on:** Nothing (independent data path).

---

### Step 2.7: queueColumns — Dispensing Tab Filter

**What:** Change the drugs filter in the Dispense tab's Prescription Preview to use `productClass`.

**Where:** `VetConnect-Admin/src/features/Queue/queueColumns.jsx`, line 297

**How:**

Replace:
```js
const drugs = items.filter(i => i.isDrug || i.isMedicine || (i.type === 'product' && i.isMedicine !== false));
```

With:
```js
const drugs = items.filter(i =>
  (i.productClass || (i.isDrug ? 'medicine' : 'retail')) === 'medicine'
  || (i.type === 'product' && !i.productClass && i.isMedicine !== false)
);
```

The second clause preserves backward compat for legacy queue items that have neither `productClass` nor `isDrug` — rare edge case during migration.

**Done when:** Queue Dispense tab shows only Medicine-tier items in the pharmacy checklist.

**Depends on:** Step 2.6.

---

### Step 2.8: DispensingVerificationDialog — 3-Tier Labels

**What:** Change the "DRUG"/"PRODUCT" labels to "MEDICINE"/"SUPPLY"/"RETAIL" with color-coded badges.

**Where:** `VetConnect-Admin/src/features/Queue/DispensingVerificationDialog.jsx`, lines 481-483

**How:**

Replace:
```jsx
<Typography variant="caption" color="textSecondary" fontWeight="700" display="block">
  {item.isDrug ? 'DRUG' : 'PRODUCT'}
</Typography>
```

With:
```jsx
{isProduct && (() => {
  const pc = item.productClass || (item.isDrug ? 'medicine' : 'retail');
  const label = pc === 'medicine' ? 'MEDICINE' : pc === 'medical_supply' ? 'SUPPLY' : 'RETAIL';
  const color = pc === 'medicine' ? '#C62828' : pc === 'medical_supply' ? '#757575' : '#9E9E9E';
  return (
    <Chip
      label={label}
      size="small"
      sx={{ height: 18, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: `${color}1A`, color, border: `1px solid ${color}33` }}
    />
  );
})()}
```

Also update the Rx chip (line 358-360): Change `{item.isDrug && (` to `{(item.productClass || (item.isDrug ? 'medicine' : 'retail')) === 'medicine' && (` so the Rx badge only shows for Medicine tier.

**Done when:** Dispensing dialog shows "MEDICINE", "SUPPLY", or "RETAIL" colored badges instead of "DRUG"/"PRODUCT". Rx chip only on Medicine items.

**Depends on:** Step 2.5 (productClass on encounterItems).

---

### Day 2 Verification Checkpoint

- [ ] Adding a Medicine item to the treatment cart triggers "Sign & Send to Pharmacy" route
- [ ] Adding only Medical Supply + Retail items shows "Sign & Send to Cashier"
- [ ] Sign-off writes `dischargeSummary.medications[]` (Medicine) and `dischargeSummary.supplies[]` (Medical Supply) to Firestore
- [ ] Sidebar shows always-visible instructions for Medicine; collapsible for others
- [ ] Queue Dispense tab pharmacy checklist only shows Medicine items
- [ ] DispensingVerificationDialog shows MEDICINE/SUPPLY/RETAIL color badges
- [ ] encounterItems on medical records include `productClass`

---

## Day 3 — Display Surfaces + Cleanup (~2 hrs)

**Goal:** Update PatientDashboard (3-section record split, discharge supplies, prescriptions sidebar) and PetHistoryScreen (productClass-based split, Going-Home dedup, supplies section) to read the new `productClass` field.

---

### Step 3.1: PatientDashboard — 3-Section Rx Split

**What:** Replace the 2-section drugs/nonDrugs split with a 3-section split: Rx (medicine), Take-Home Supplies (medical_supply), Other (retail).

**Where:** `VetConnect-Admin/src/features/Patients/PatientDashboard.jsx`, lines 1786-1828

**How:**

Replace:
```js
const drugs = allRx.filter(rx => rx.isDrug || rx.isMedicine);
const nonDrugs = allRx.filter(rx => !rx.isDrug && !rx.isMedicine);
```

With:
```js
const resolvePC = (rx) => rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
const medicines = allRx.filter(rx => resolvePC(rx) === 'medicine');
const supplies = allRx.filter(rx => resolvePC(rx) === 'medical_supply');
const otherItems = allRx.filter(rx => resolvePC(rx) === 'retail');
```

Then update the rendering to show 3 sections:
- **Rx section** (existing, no change — just reference `medicines` instead of `drugs`)
- **Take-Home Supplies section** (new, uses `supplies`):
  ```jsx
  {supplies.length > 0 && (
    <Box sx={{ bgcolor: COLORS.kpiGreenBg, py: 1, px: 1.5, borderRadius: 0, border: `1px solid ${COLORS.success}33` }}>
      <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.success, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Inventory2Icon sx={{ fontSize: 13 }}/> Take-Home Supplies
      </Typography>
      <Stack spacing={0.5}>
        {supplies.map((rx, idx) => (
          <Box key={idx}>
            <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary }}>
              {rx.name}{rx.qty ? ` x${rx.qty}` : ''}
            </Typography>
            {rx.instructions && <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textMuted }}>{rx.instructions}</Typography>}
          </Box>
        ))}
      </Stack>
    </Box>
  )}
  ```
- **Other section** (existing `nonDrugs` section — renamed from "Dispensed Products" to "Other Items", reference `otherItems` instead of `nonDrugs`)

**Done when:** Expanded records show 3 distinct sections with different visual treatments: Rx (warm amber), Take-Home Supplies (green tint), Other (neutral gray).

**Depends on:** Day 2 complete (productClass on medical records).

---

### Step 3.2: PatientDashboard — Discharge Summary Supplies Section

**What:** Add a supplies section inside the Going-Home Instructions block, reading from `dischargeSummary.supplies[]`.

**Where:** `VetConnect-Admin/src/features/Patients/PatientDashboard.jsx`, lines 1639-1650

**How:**

After the medications block (line 1650), add:
```jsx
{rec.dischargeSummary.supplies?.length > 0 && (
  <Stack spacing={0.25} sx={{ mb: 0.75 }}>
    <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.success, fontSize: '0.7rem' }}>
      Take-Home Supplies
    </Typography>
    {rec.dischargeSummary.supplies.map((sup, i) => (
      <Typography key={i} sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textPrimary }}>
        <Typography component="span" sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary }}>
          {sup.name}
        </Typography>
        {sup.qty ? ` x${sup.qty}` : ''}
        {sup.instructions ? ` — ${sup.instructions}` : ''}
      </Typography>
    ))}
  </Stack>
)}
```

**Done when:** Going-Home block on PatientDashboard shows both medications and supplies from `dischargeSummary`.

**Depends on:** Step 2.3 (supplies written to discharge).

---

### Step 3.3: PatientDashboard — Prescriptions Sidebar Widget

**What:** Update the prescriptions sidebar's `activeRx`/`historicalRx` filter to use `productClass`.

**Where:** `VetConnect-Admin/src/features/Patients/PatientDashboard.jsx`, lines 579-581, 641

**How:**

In the `useMemo` for `activeRx`/`historicalRx` (line 581):

Replace:
```js
if (!rx.isDrug && !rx.isMedicine) return;
```

With:
```js
const pc = rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
if (pc !== 'medicine') return;
```

Similarly in the `rxTimeline` useMemo (line 641):
```js
if (!rx.isDrug && !rx.isMedicine) return;
```
becomes:
```js
const pc = rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
if (pc !== 'medicine') return;
```

**Done when:** Prescriptions sidebar only shows Medicine-tier items. Medical Supply and Retail items are excluded from the Rx widget.

**Depends on:** Step 2.5 (productClass on dispensedProducts).

---

### Step 3.4: PetHistoryScreen — productClass-Based Split

**What:** Update the mobile record display to use `productClass` for the medications/other items split.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js`, lines 1923-1953

**How:**

Replace:
```js
{item.prescriptions?.filter(rx => rx.isDrug || rx.isMedicine).length > 0 && (
```
With:
```js
{item.prescriptions?.filter(rx => (rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail')) === 'medicine').length > 0 && (
```

And similarly in the filter inside the map:
```js
{item.prescriptions.filter(rx => (rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail')) === 'medicine').map(...)}
```

For the "OTHER ITEMS" section (line 1939):
```js
{item.prescriptions?.filter(rx => {
  const pc = rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
  return pc !== 'medicine';
}).length > 0 && (
```

**Done when:** Mobile record view splits items by `productClass` with fallback to legacy `isDrug`.

**Depends on:** Step 2.5.

---

### Step 3.5: PetHistoryScreen — Going-Home Supplies Section

**What:** Add a supplies section to the Going-Home Instructions discharge block, reading from `dischargeSummary.supplies[]`.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js`, lines 2074-2085

**How:**

After the medications section (line 2085), add:
```jsx
{ds.supplies && ds.supplies.length > 0 && (
  <View style={styles.dischargeSection}>
    <Text style={styles.dischargeSectionLabel}>TAKE-HOME SUPPLIES</Text>
    {ds.supplies.map((sup, i) => (
      <View key={i} style={styles.dischargeMedRow}>
        <Text style={styles.dischargeMedName}>{sup.name}</Text>
        <Text style={styles.dischargeMedMeta}>
          x{sup.qty || 1}{sup.instructions ? ` — ${sup.instructions}` : ''}
        </Text>
      </View>
    ))}
  </View>
)}
```

**Done when:** Mobile Going-Home Instructions shows both MEDICATIONS and TAKE-HOME SUPPLIES sections.

**Depends on:** Step 2.3.

---

### Step 3.6: PetHistoryScreen — Going-Home Dedup

**What:** When `dischargeSummary` exists, hide the standalone prescriptions items section (Steps 3.4 output) to prevent duplication. The Going-Home block becomes the single source for items.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js`, lines 1922-1953

**How:**

Wrap the standalone prescriptions sections in `{!item.dischargeSummary && (...)}`:
```jsx
{!item.dischargeSummary && item.prescriptions?.filter(rx =>
  (rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail')) === 'medicine'
).length > 0 && (
  <View style={styles.rxBox}>
    <Text style={styles.rxTitle}>PRESCRIBED MEDICATIONS</Text>
    ...
  </View>
)}

{!item.dischargeSummary && item.prescriptions?.filter(rx => {
  const pc = rx.productClass || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
  return pc !== 'medicine';
}).length > 0 && (
  <View style={styles.rxBox}>
    <Text style={styles.rxTitle}>OTHER ITEMS</Text>
    ...
  </View>
)}
```

For legacy records without `dischargeSummary`, the standalone items sections remain visible.

**Done when:** Records with `dischargeSummary` show items only in the Going-Home block (no duplication). Legacy records without discharge still show standalone items.

**Depends on:** Steps 3.4, 3.5.

---

### Step 3.7: PetHistoryScreen — PDF Export Update

**What:** Update the PDF generation (`generatePDF` / `handleShareRecord`) to include supplies from `dischargeSummary.supplies[]`.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js`, lines 1455-1481

**How:**

After the `rxHtmlFromDischarge` variable (line 1459-1463), add:
```js
const dsSupplies = record.dischargeSummary?.supplies || [];
const suppliesHtmlFromDischarge = dsSupplies.length > 0
  ? `<h3>Take-Home Supplies</h3><ul>${dsSupplies.map((sup) =>
      `<li><b>${esc(sup.name)}</b> x${esc(sup.qty || 1)}${sup.instructions ? `: ${esc(sup.instructions)}` : ''}</li>`
    ).join('')}</ul>`
  : '';
```

Then in the HTML template (around line 1513), append `suppliesHtmlFromDischarge` after `rxHtmlFromDischarge`:
```js
${rxHtmlFromDischarge}${suppliesHtmlFromDischarge || rxHtml}
```

Also update the standalone `rxHtml` block (lines 1466-1480) to use `productClass`:
```js
const medications = record.prescriptions.filter(rx =>
  (rx.productClass || (rx.isDrug ? 'medicine' : 'retail')) === 'medicine'
);
const nonDrugItems = record.prescriptions.filter(rx =>
  (rx.productClass || (rx.isDrug ? 'medicine' : 'retail')) !== 'medicine'
);
```

**Done when:** PDF export includes both medications and supplies sections. Legacy records without discharge still show standalone items.

**Depends on:** Steps 3.4, 3.5.

---

### Day 3 Verification Checkpoint

- [ ] PatientDashboard expanded records show 3 sections: Rx, Take-Home Supplies, Other
- [ ] Going-Home block on PatientDashboard shows both medications and supplies
- [ ] Prescriptions sidebar widget only shows Medicine-tier items
- [ ] Mobile PetHistoryScreen uses productClass for item split with legacy fallback
- [ ] Mobile Going-Home shows MEDICATIONS + TAKE-HOME SUPPLIES sections
- [ ] When dischargeSummary exists on mobile, standalone items sections are hidden (dedup)
- [ ] PDF export includes supplies section
- [ ] All legacy records (without productClass) still display correctly via dual-read fallback

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Existing records lack `productClass` field | Dual-read pattern everywhere: `item.productClass \|\| (item.isDrug ? 'medicine' : 'retail')` — never crashes on legacy docs |
| "drug" migration races with category listener | Migration is idempotent (`!drugSnap.exists()` guard). `writeBatch` is atomic. |
| Batch-update in Edit Category hits Firestore 500-doc limit | Unlikely for category-level batches (clinics rarely have 500+ items in one category). If needed, chunk into 450-doc batches. |
| Cart items created before deployment lack `productClass` | The dual-read fallback handles this: `item.productClass \|\| (item.isDrug ? 'medicine' : 'retail')`. Active appointments at deployment time will still route correctly. |
| `MedicinePillSwitch` component becomes dead code | Remove the import from InventoryCategoryManager. Check if any other file imports it — if not, delete the component file. |
| SC/PWD eligibility confusion | SC/PWD stays per-item toggle (`isScPwdEligible`) completely independent of tier. No change to POSModal. |

## External Blockers

- **None.** No Blaze upgrade needed. No new npm dependencies. No API keys. All changes are client-side Firestore reads/writes using existing patterns.

## Files Changed Summary

| File | Day | Changes |
|---|---|---|
| `ProductFormModal.jsx` | 1 | productClass Select, conditional fields, Dispensing Unit rename |
| `Inventory.jsx` | 1 | Default categories, enrichment dual-write, inventory prop to CategoryManager |
| `InventoryCategoryManager.jsx` | 1 | MUI Table, Edit Dialog, batch-update, drug migration |
| `ClinicalWorkspace.jsx` | 2 | Cart dual-write, dispensing routing, discharge split, sidebar display, encounterItems |
| `Queue.jsx` | 2 | Inventory join enrichment with productClass |
| `queueColumns.jsx` | 2 | Dispense tab filter |
| `DispensingVerificationDialog.jsx` | 2 | 3-tier labels + color badges |
| `PatientDashboard.jsx` | 3 | 3-section split, discharge supplies, prescriptions sidebar |
| `PetHistoryScreen.js` | 3 | productClass split, Going-Home supplies, dedup, PDF export |

**Total steps:** 17 across 9 files, 3 days.
