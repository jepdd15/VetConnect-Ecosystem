# T4.127 — ClinicalWorkspace Sidebar Split Plan

## Overview

Split the ClinicalWorkspace right sidebar from a single mixed "Services & Items" panel into two visually distinct panels — **SERVICES** (with inline progress toggles) and **ITEMS & MEDICATIONS** — with per-panel subtotals and a grand total. Additionally, ensure mid-consult service additions (via the search bar) are registered on the appointment's `services[]` array so they gain full progress tracking and clinicalPulse audit parity.

**Architectural decision**: One state array (`treatmentCart`) stays unchanged. The visual split is purely a rendering concern — two `.filter()` passes over the same array. This avoids state synchronization bugs and preserves all existing handlers (`handleRemoveRx`, `handleUpdateQty`, `handleUpdateRxSig`, etc.) without modification.

**Assumptions**:
- God View keeps its current compact layout (no sidebar cart rendering exists in God View — confirmed).
- `ServiceProgressCard.jsx` is only consumed by ClinicalWorkspace (confirmed via grep). It will be deleted since its visual pattern is inlined.
- No Blaze upgrade or external blockers required.

---

## Prerequisites

None. All imports (`arrayUnion`, `updateDoc`, `COLORS`, etc.) are already available in ClinicalWorkspace.jsx.

---

## Implementation (Single File: `ClinicalWorkspace.jsx`)

### Change 1 — Mid-Consult Service Registration in `handleAddRx`

**What**: When `handleAddRx` adds a service-type item (detected by `item.stock === undefined`), also push it to the appointment's `services[]` array via `updateDoc` + `arrayUnion`, and seed `serviceProgress` for it.

**Where**: `ClinicalWorkspace.jsx` lines 1402-1403 (after `setTreatmentCart(prev => [...prev, itemObj])` and before the vaccine detection block).

**How**: Insert the following block immediately after `setIsDirty(true);` (line 1403) and BEFORE the `// T4.117: If this is a vaccine-category product...` block (line 1405):

```jsx
    // T4.127: Mid-consult service registration — push to appointment's services[]
    // so handleToggleServiceProgress, clinicalPulse events, and serviceStartedAt/
    // serviceCompletedAt timestamps work for ad-hoc service additions.
    if (itemObj.type === 'service') {
      setServiceProgress(prev => ({ ...prev, [itemObj.id]: 'pending' }));
      try {
        await updateDoc(doc(db, "appointments", patient.id), {
          services: arrayUnion({
            id: itemObj.id,
            name: itemObj.name,
            price: itemObj.price,
            addedDuringConsult: true,
          }),
        });
      } catch (e) {
        console.error('[ClinicalWorkspace] Mid-consult service registration failed:', e);
        // Non-blocking: service still appears in treatmentCart, just won't have
        // full progress tracking. Show warning toast.
        showToast('Service added to cart but progress tracking may be limited.', 'warning');
      }
    }
```

**Why**: Without this, services added mid-consult via the search bar exist only in `treatmentCart` state. They never appear in `patient.services[]`, which means:
- `handleToggleServiceProgress` (line 1526) can't find them in `patient.services`
- No SERVICE_STARTED/SERVICE_COMPLETED clinicalPulse events are emitted
- `serviceStartedAt`/`serviceCompletedAt` timestamps are never recorded

**Depends on**: Nothing (standalone logic change).

**Done when**: Adding a service via the search bar → the appointment doc in Firestore shows the new service in `services[]` with `addedDuringConsult: true` → clicking the inline progress toggle cycles it through pending/in-progress/completed → clinicalPulse array gains SERVICE_STARTED and SERVICE_COMPLETED events.

---

### Change 2 — Replace Mixed Cart with Two-Panel Split (SERVICES panel + ITEMS panel)

**What**: Replace lines 3745-3924 (the single `<Stack spacing={2}>` that renders ALL `treatmentCart` items in one list with one subtotal) with two separate visually distinct panels.

**Where**: `ClinicalWorkspace.jsx` lines 3745-3924.

**How**: Replace the entire block with:

```jsx
                    {/* ═══ T4.127: SERVICES PANEL ═══ */}
                    {(() => {
                      const serviceItems = treatmentCart.filter(rx => rx.type === 'service');
                      if (serviceItems.length === 0) return null;
                      return (
                        <Paper sx={{ p: 2, borderRadius: 0, border: `2px solid ${COLORS.sky}`, bgcolor: '#F8FCFF' }}>
                          <Typography sx={{ fontWeight: 1000, fontSize: '0.75rem', color: COLORS.sky, letterSpacing: '0.08em', mb: 1.5 }}>
                            SERVICES ({serviceItems.length})
                          </Typography>
                          <Stack spacing={1}>
                            {serviceItems.map((rx) => {
                              const cartIdx = treatmentCart.indexOf(rx);
                              const status = serviceProgress[rx.id] || 'pending';
                              const progressColors = {
                                pending: { bg: '#9E9E9E', label: 'PENDING' },
                                'in-progress': { bg: COLORS.warning, label: 'IN PROGRESS' },
                                completed: { bg: COLORS.success, label: 'COMPLETED' },
                              };
                              const pc = progressColors[status] || progressColors.pending;
                              const isToggleable = !isRecordLocked && status !== 'completed';

                              return (
                                <Box
                                  key={rx.id || cartIdx}
                                  sx={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    p: 1.5, bgcolor: 'white', border: `1px solid ${COLORS.borderLight}`, borderRadius: 0,
                                  }}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                                    {!isRecordLocked && (
                                      <IconButton size="small" onClick={() => handleRemoveRx(cartIdx)} sx={{ p: 0.25 }}>
                                        <CloseIcon sx={{ fontSize: 12, color: COLORS.danger }} />
                                      </IconButton>
                                    )}
                                    <Typography sx={{ fontWeight: 900, fontSize: '0.8rem', color: COLORS.brand, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {rx.name}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                                    <Typography sx={{ fontWeight: 900, fontSize: '0.8rem', color: COLORS.brand }}>
                                      ₱{(rx.price * rx.qty).toLocaleString()}
                                    </Typography>
                                    <Chip
                                      label={pc.label}
                                      size="small"
                                      onClick={() => isToggleable && handleToggleServiceProgress(rx.id)}
                                      sx={{
                                        bgcolor: pc.bg, color: '#FFF', fontWeight: 900, fontSize: '0.6rem',
                                        height: 22, borderRadius: 0, cursor: isToggleable ? 'pointer' : 'default',
                                        '&:hover': isToggleable ? { opacity: 0.85 } : {},
                                      }}
                                    />
                                  </Box>
                                </Box>
                              );
                            })}
                          </Stack>
                          {/* Per-panel subtotal */}
                          <Box sx={{ mt: 1.5, pt: 1, borderTop: `1px solid ${COLORS.borderLight}`, display: 'flex', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontWeight: 800, fontSize: '0.7rem', color: COLORS.textMuted, textTransform: 'uppercase' }}>Services</Typography>
                            <Typography sx={{ fontWeight: 900, fontSize: '0.85rem', color: COLORS.brand }}>
                              ₱{serviceItems.reduce((sum, rx) => sum + (rx.price * rx.qty), 0).toLocaleString()}
                            </Typography>
                          </Box>
                        </Paper>
                      );
                    })()}

                    {/* ═══ T4.127: ITEMS & MEDICATIONS PANEL ═══ */}
                    {(() => {
                      const productItems = treatmentCart.filter(rx => rx.type === 'product');
                      if (productItems.length === 0) return null;
                      return (
                        <Paper sx={{ p: 2, borderRadius: 0, border: `2px solid ${COLORS.accent}`, bgcolor: '#FBF9F7' }}>
                          <Typography sx={{ fontWeight: 1000, fontSize: '0.75rem', color: COLORS.accent, letterSpacing: '0.08em', mb: 1.5 }}>
                            ITEMS & MEDICATIONS ({productItems.length})
                          </Typography>
                          <Stack spacing={2}>
                            {productItems.map((rx) => {
                              const cartIdx = treatmentCart.indexOf(rx);
                              return (
                                <Box key={rx.id || cartIdx} sx={{ bgcolor: 'white', p: 2, borderRadius: 0, border: `1px solid ${COLORS.borderLight}` }}>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography sx={{ fontWeight: 1000, fontSize: '0.85rem', color: COLORS.brand }}>{rx.name}</Typography>
                                    {!isRecordLocked && (
                                      <IconButton size="small" onClick={() => handleRemoveRx(cartIdx)}>
                                        <CloseIcon sx={{ fontSize: 14, color: '#D32F2F' }} />
                                      </IconButton>
                                    )}
                                  </Box>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#F5F5F5', borderRadius: 0, px: 0.5 }}>
                                      <IconButton size="small" onClick={() => handleUpdateQty(cartIdx, -1)} sx={{ p: 0.5 }}>
                                        <ContentCutIcon sx={{ fontSize: 14, rotate: '90deg' }} />
                                      </IconButton>
                                      <Typography sx={{ fontWeight: 1000, fontSize: '0.85rem' }}>{rx.qty}</Typography>
                                      <IconButton size="small" onClick={() => handleUpdateQty(cartIdx, 1)} sx={{ p: 0.5 }}>
                                        <AddCircleIcon sx={{ fontSize: 14, color: COLORS.brand }} />
                                      </IconButton>
                                    </Box>
                                    <Typography sx={{ fontWeight: 1000, fontSize: '0.9rem', color: COLORS.brand }}>₱{(rx.price * rx.qty).toLocaleString()}</Typography>
                                  </Box>

                                  {/* Drug instructions (always visible) */}
                                  {rx.isDrug && (
                                    <TextField
                                      size="small" fullWidth multiline minRows={1} maxRows={3}
                                      placeholder="e.g., 1 tab twice daily for 7 days"
                                      value={rx.instructions || ''}
                                      onChange={(e) => handleUpdateRxSig(cartIdx, e.target.value)}
                                      disabled={isRecordLocked}
                                      sx={{
                                        mt: 1,
                                        '& .MuiInputBase-root': {
                                          fontSize: '0.75rem', fontWeight: 700, fontFamily: FONT,
                                          borderRadius: 0, bgcolor: COLORS.rxBg, border: `1px solid ${COLORS.rxBorder}`,
                                        },
                                        '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                                      }}
                                      InputProps={{
                                        startAdornment: <MedicationIcon sx={{ fontSize: 14, color: COLORS.rxText, mr: 0.5, mt: 0.25 }} />,
                                      }}
                                    />
                                  )}

                                  {/* Non-drug collapsible instructions */}
                                  {!rx.isDrug && (
                                    <>
                                      <Typography
                                        onClick={() => !isRecordLocked && handleUpdateRxField(cartIdx, '_showInstructions', !rx._showInstructions)}
                                        sx={{
                                          mt: 0.75, fontSize: '0.65rem', fontWeight: 800,
                                          color: rx.instructions ? COLORS.rxText : COLORS.textMuted,
                                          cursor: isRecordLocked ? 'default' : 'pointer',
                                          fontFamily: FONT, letterSpacing: '0.05em', textTransform: 'uppercase',
                                          '&:hover': !isRecordLocked ? { color: COLORS.accent } : {},
                                        }}
                                      >
                                        {rx._showInstructions ? 'HIDE INSTRUCTIONS' : (rx.instructions ? `INSTRUCTIONS: ${rx.instructions}` : '+ ADD INSTRUCTIONS')}
                                      </Typography>
                                      <Collapse in={!!rx._showInstructions}>
                                        <TextField
                                          size="small" fullWidth
                                          placeholder="Optional usage notes"
                                          value={rx.instructions || ''}
                                          onChange={(e) => handleUpdateRxSig(cartIdx, e.target.value)}
                                          disabled={isRecordLocked}
                                          sx={{
                                            mt: 0.5,
                                            '& .MuiInputBase-root': {
                                              fontSize: '0.75rem', fontWeight: 700, fontFamily: FONT,
                                              borderRadius: 0, bgcolor: COLORS.formBg, border: `1px solid ${COLORS.borderLight}`,
                                            },
                                            '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                                          }}
                                        />
                                      </Collapse>
                                    </>
                                  )}

                                  {/* No-stock-deduction audit badge */}
                                  {rx.noStockDeduction && (
                                    <Alert
                                      severity="warning"
                                      sx={{ py: 0, px: 1, mt: 0.5, fontSize: '0.6rem', fontWeight: 700, borderRadius: 0, '& .MuiAlert-icon': { fontSize: 14 } }}
                                    >
                                      No stock deduction — client-supplied vaccine
                                    </Alert>
                                  )}

                                  {/* Staff attribution for base/booked services rendered as products (legacy) */}
                                  {rx.isBase && (() => {
                                    const dept = rx.department || 'General';
                                    const deptObj = (departments || []).find(d => d.name === dept);
                                    const deptColor = deptObj?.color || '#616161';
                                    const allStaff = vetsList || [];
                                    const matched = allStaff.filter(v => v.departments?.includes(dept));
                                    const others = allStaff.filter(v => !v.departments?.includes(dept));
                                    return (
                                      <TextField
                                        size="small" select fullWidth
                                        value={serviceAttribution[rx.id]?.staffId || ''}
                                        onChange={(e) => {
                                          const vet = allStaff.find(v => v.id === e.target.value);
                                          setServiceAttribution(prev => ({
                                            ...prev,
                                            [rx.id]: { staffId: e.target.value, staffName: vet?.fullName || (e.target.value === '' ? 'Unassigned' : 'Unknown') },
                                          }));
                                        }}
                                        sx={{ mt: 1, '& .MuiInputBase-root': { fontSize: '0.72rem', fontWeight: 800 } }}
                                        label="Performed By"
                                      >
                                        <MenuItem value="" sx={{ fontSize: '0.8rem', fontStyle: 'italic', color: COLORS.textMuted }}>— Unassigned —</MenuItem>
                                        {matched.map(v => (
                                          <MenuItem key={v.id} value={v.id} sx={{ fontSize: '0.8rem' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, width: '100%' }}>
                                              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: deptColor, flexShrink: 0 }} />
                                              <span style={{ fontWeight: 700 }}>{v.fullName}</span>
                                            </Box>
                                          </MenuItem>
                                        ))}
                                        {others.length > 0 && (
                                          <ListSubheader sx={{ fontSize: '0.65rem', fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', color: COLORS.textMuted, lineHeight: '28px', bgcolor: COLORS.formBg }}>
                                            Other Staff
                                          </ListSubheader>
                                        )}
                                        {others.map(v => (
                                          <MenuItem key={v.id} value={v.id} sx={{ fontSize: '0.8rem', color: COLORS.textMuted, fontStyle: 'italic' }}>{v.fullName}</MenuItem>
                                        ))}
                                      </TextField>
                                    );
                                  })()}
                                </Box>
                              );
                            })}
                          </Stack>
                          {/* Per-panel subtotal */}
                          <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${COLORS.borderLight}`, display: 'flex', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontWeight: 800, fontSize: '0.7rem', color: COLORS.textMuted, textTransform: 'uppercase' }}>Items</Typography>
                            <Typography sx={{ fontWeight: 900, fontSize: '0.85rem', color: COLORS.brand }}>
                              ₱{productItems.reduce((sum, rx) => sum + (rx.price * rx.qty), 0).toLocaleString()}
                            </Typography>
                          </Box>
                        </Paper>
                      );
                    })()}
```

**Why**: Clinically, services (consultations, grooming, vaccinations) and dispensed items (medications, products) are fundamentally different. Services have progress states; items have quantities and dosing instructions. Mixing them in one list obscures the clinical workflow.

**Depends on**: Nothing (purely rendering change, all handlers already exist).

**Done when**: Sidebar shows two distinct panels — SERVICES (sky blue border) above ITEMS & MEDICATIONS (accent/brown border). Each has its own item count header and subtotal footer. Services show inline progress toggle chips. Items show qty controls + instructions.

---

### Change 3 — Replace Single Subtotal with Grand Total

**What**: Replace lines 3916-3924 (the single "Subtotal" display at the bottom of the old mixed cart) with a grand total that spans both panels.

**Where**: `ClinicalWorkspace.jsx` lines 3916-3924 (the `{/* DYNAMIC TOTAL CALCULATOR */}` block).

**How**: Replace with:

```jsx
                    {/* T4.127: GRAND TOTAL — spans both panels */}
                    {treatmentCart.length > 0 && (
                      <Box sx={{ pt: 2, borderTop: `3px solid ${COLORS.brand}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 1000, color: COLORS.brand, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          TOTAL
                        </Typography>
                        <Typography sx={{ fontWeight: 1000, color: COLORS.brand, fontSize: '1.3rem' }}>
                          ₱{treatmentCart.reduce((sum, item) => sum + (item.price * item.qty), 0).toLocaleString()}
                        </Typography>
                      </Box>
                    )}
```

**Why**: Per-panel subtotals are already rendered inside each panel (Change 2). The grand total at the bottom gives the vet the total billing amount at a glance without mental arithmetic.

**Depends on**: Change 2 (must be in place since the old subtotal block is being replaced).

**Done when**: Bottom of the sidebar shows "TOTAL: (amount)" with a thick brand-colored top border, and the amount equals the sum of Services subtotal + Items subtotal.

---

### Change 4 — Delete Standalone ServiceProgressCard Rendering

**What**: Remove lines 3927-3935 (the standalone `<ServiceProgressCard>` rendered below the cart). Progress toggles are now inline in the Services panel (Change 2).

**Where**: `ClinicalWorkspace.jsx` lines 3927-3935.

**How**: Delete this entire block:

```jsx
                {/* T2.97: Per-Service Progress — rendered via shared ServiceProgressCard */}
                {!isRecordLocked && (
                    <ServiceProgressCard
                        services={patient?.services || []}
                        serviceProgress={serviceProgress}
                        onToggle={handleToggleServiceProgress}
                        sx={{ ...glassStyle }}
                    />
                )}
```

Also remove the import on line 65:
```jsx
import { ServiceProgressCard } from './ServiceProgressCard';
```

And delete the file `VetConnect-Admin/src/components/ServiceProgressCard.jsx` entirely (confirmed: no other consumers exist in the codebase).

**Why**: The standalone card is now redundant — its functionality is merged inline into each service row in the Services panel, providing a more compact and contextual experience.

**Depends on**: Change 2 (inline progress toggles must exist before the standalone card is removed).

**Done when**: No `ServiceProgressCard` import or rendering exists. The file is deleted. Progress toggles work exclusively from the inline chips in the Services panel.

---

## Verification Checkpoint

After all 4 changes:

1. **Open a patient with booked services** (e.g., Grooming + Consultation) → Services panel shows both services with PENDING chips. Items panel is empty (or shows auto-bundled products).
2. **Click a progress chip** → cycles pending (gray) → in-progress (orange/warning) → completed (green). Firestore appointment doc updates with `serviceStatus` + `serviceStartedAt`/`serviceCompletedAt`. `clinicalPulse` array gains events.
3. **Add a SERVICE via search bar** (e.g., "Nail Trimming") → appears in the Services panel with a PENDING chip. Check Firestore: `services[]` on the appointment gains `{ id, name, price, addedDuringConsult: true }`.
4. **Add a PRODUCT via search bar** (e.g., "Cephalexin") → appears in the Items & Medications panel with qty controls + instructions field. Does NOT appear in Services panel.
5. **Subtotals correct**: Services subtotal = sum of service prices. Items subtotal = sum of product price * qty. Grand total = both combined.
6. **Locked state**: when record is signed off, no remove buttons, no progress toggle clickability, no qty changes.
7. **God View**: unchanged — no cart rendering exists there.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `treatmentCart.indexOf(rx)` might be fragile if items lack stable identity | Items always have `rx.id` from inventory/services. The `indexOf` uses object reference equality which is stable within a single render. |
| Mid-consult service push fails (network issue) | Non-blocking: service still renders in cart. Toast warns user. Progress tracking will be limited but cart/billing unaffected. |
| `handleToggleServiceProgress` expects service in `patient.services[]` | The `arrayUnion` write in Change 1 ensures it's there. The `newServices.map()` on line 1536 will find the service by `s.id === svcId`. |
| Booked services that are NOT in `treatmentCart` (e.g., pre-bundled at booking but not in cart) | These still show progress via the inline rendering — the Services panel renders from `treatmentCart`, which is populated from `patient.services[]` during workspace hydration (line ~850-870). If a service was booked but somehow not in the cart, it won't appear. This is existing behavior. |
| ServiceProgressCard deletion affects other files | Confirmed via grep: only ClinicalWorkspace imports it. Safe to delete. |

---

## Styling Reference

| Element | Token |
|---------|-------|
| Services panel border | `COLORS.sky` (#3ABEF9) |
| Services panel header text | `COLORS.sky` |
| Items panel border | `COLORS.accent` (#5D4037) |
| Items panel header text | `COLORS.accent` |
| Progress chip — pending | `#9E9E9E` (Material gray) |
| Progress chip — in-progress | `COLORS.warning` (#E65100) |
| Progress chip — completed | `COLORS.success` (#2E7D32) |
| Grand total border-top | `COLORS.brand` (#3E2723), 3px |
| All borderRadius | 0 (per design system) |

---

## Files Affected

| File | Action |
|------|--------|
| `VetConnect-Admin/src/components/ClinicalWorkspace.jsx` | Modify (4 changes) |
| `VetConnect-Admin/src/components/ServiceProgressCard.jsx` | Delete |

---

## God View Decision

**Recommendation**: God View keeps its current layout (SOAP grid + AI panel, no cart). The God View is a clinical documentation interface focused on SOAP notes and AI reasoning — the billing sidebar is not relevant in that context. The vet returns to the default view to manage the treatment cart. No change needed.

---

## External Blockers

None. No Blaze upgrade, no new npm packages, no API keys, no Cloudflare Worker changes.

---

## Estimated Effort

| Change | Effort |
|--------|--------|
| Change 1 — Mid-consult service registration | 30 min |
| Change 2 — Two-panel JSX split | 1.5 hrs |
| Change 3 — Grand total replacement | 10 min |
| Change 4 — Delete ServiceProgressCard | 10 min |
| **Total** | **~2.5 hrs** |
