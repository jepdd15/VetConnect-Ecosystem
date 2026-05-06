# T4.189 — Visit Log Phase-Aware Action Buttons

## Overview

Bring the Queue's full workflow action buttons into the Visit Log (Records.jsx) so staff can perform any status transition — Accept, Check In, Start Consult, open Workspace, Verify Dispensing, Checkout, Revert — directly from the records ledger without navigating to Queue. All actions operate on appointment documents by ID and are date-independent, meaning historical records can be reverted and re-processed. This requires adding 3 Firestore data listeners (inventory, categories, services), 4 modal renders (AssignStaffModal, ClinicalWorkspace, POSModal, DispensingVerificationDialog), a status-gated action column renderCell, an overflow Menu, and a revert Dialog with mandatory auditReason.

**Architecture decision**: Inline the status-to-action mapping directly in the Records.jsx action column renderCell rather than extracting a shared component from queueColumns.jsx. Rationale: the Queue action column (lines 698-880 of queueColumns.jsx) has Queue-specific concerns (isTomorrow lock, auto no-show window, clinicSettings timing, dispense flag/resolve dialogs) that the Visit Log does not need. A shared extraction would require complex prop-gating. The Visit Log version is simpler — ~120 lines of status-gated JSX, straightforward to maintain independently.

**Split recommendation**: 2 sessions.
- Day 1 (~2 hrs): Data listeners + useQueueActions expansion + action column renderCell + overflow menu + revert dialog.
- Day 2 (~1.5 hrs): Modal state + renders (4 modals) + wiring action buttons to modal state + verification testing.

---

## Prerequisites

- T4.183 DONE (Visit Log 3-tab restructure, row-click audit, KPI strip) — confirmed shipped.
- No npm installs needed — all components (AssignStaffModal, ClinicalWorkspace, POSModal, DispensingVerificationDialog) already exist.
- `useQueueActions` already imported in Records.jsx (line 31) but only `rescheduleAppointment` and `rejectAppointment` are destructured (line 115). Needs expansion.

---

## Day 1: Data Listeners + Action Column + Overflow Menu + Revert Dialog

### Step 1 — Expand useQueueActions destructuring

**What**: Expand the existing `useQueueActions` import to destructure all 7 exported handlers.

**Where**: `VetConnect-Admin/src/features/Records/Records.jsx` line 115.

**How**: Change:
```js
const { rescheduleAppointment, rejectAppointment } = useQueueActions();
```
to:
```js
const { changeStatus, revertStatus, markNoShow, rejectAppointment, rescheduleAppointment, deferAppointment } = useQueueActions();
```
Note: `quickAdmitER` is Queue-specific (creates walk-in emergencies) — not needed in Visit Log.

**Why**: `changeStatus` drives Accept/Check-In/Start-Consult transitions. `revertStatus` drives the Revert button. `markNoShow` and `deferAppointment` go in overflow menu. All operate by appointment doc ID with zero date dependency.

**Depends on**: Nothing.

**Done when**: No lint errors, existing reschedule/void functionality unchanged.

---

### Step 2 — Expand useUser destructuring to include profile

**What**: Add `profile` to the `useUser()` destructure. DispensingVerificationDialog requires `staffProfile` prop.

**Where**: `VetConnect-Admin/src/features/Records/Records.jsx` line 49.

**How**: Change:
```js
const { user } = useUser();
```
to:
```js
const { user, profile } = useUser();
```

**Why**: `DispensingVerificationDialog` takes `staffProfile={profile}` for audit attribution. Also useful for forensic pulse events in revert/status change handlers.

**Depends on**: Nothing.

**Done when**: `profile` available in component scope.

---

### Step 3 — Add inventory, categories, services Firestore listeners

**What**: Add 3 `onSnapshot` listeners + `joinedInventory` useMemo. This provides the data POSModal, ClinicalWorkspace, and DispensingVerificationDialog need.

**Where**: `VetConnect-Admin/src/features/Records/Records.jsx` — new state declarations after line 98, new useEffect after the existing departments useEffect (line 136).

**How**:

Add state (after line 98, near other state declarations):
```js
// T4.189: Inventory + services data for workflow modals
const [inventoryList, setInventoryList] = useState([]);
const [inventoryCategories, setInventoryCategories] = useState([]);
const [servicesList, setServicesList] = useState([]);
```

Add useEffect (after the vets listener useEffect, around line 149):
```js
// T4.189: Inventory, categories, services listeners for POSModal/CW/DispensingVerification
React.useEffect(() => {
  const unsubInv = onSnapshot(collection(db, 'inventory'), (snap) =>
    setInventoryList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
  const unsubCat = onSnapshot(collection(db, 'inventory_categories'), (snap) =>
    setInventoryCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
  const unsubSvc = onSnapshot(collection(db, 'services'), (snap) =>
    setServicesList(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !s.isArchived))
  );
  return () => { unsubInv(); unsubCat(); unsubSvc(); };
}, []);
```

Add joinedInventory useMemo (after the new useEffect):
```js
const joinedInventory = useMemo(() => {
  return inventoryList
    .filter(item => !item.isArchived)
    .map(item => {
      const catObj = inventoryCategories.find(c => c.name?.toLowerCase() === item.category?.toLowerCase());
      return {
        ...item,
        isMedicine: catObj ? !!catObj.isMedicine : false,
        productClass: catObj?.productClass || (catObj?.isMedicine ? 'medicine' : 'retail'),
      };
    });
}, [inventoryList, inventoryCategories]);
```

This is an exact copy of the pattern from Queue.jsx lines 1579-1599 and Sales.jsx lines 47-71.

**Why**: POSModal requires `inventoryList` + `servicesList`. ClinicalWorkspace requires `inventoryList` + `servicesList` + `departments` (already loaded) + `vetsList` (already loaded as `vets`). DispensingVerificationDialog requires `inventoryList`.

**Depends on**: Nothing (existing Firestore imports already include `onSnapshot`, `collection`).

**Done when**: `joinedInventory`, `servicesList` populate without console errors.

---

### Step 4 — Add useClosingStatus hook for POSModal

**What**: Import and call `useClosingStatus` to get `isDayClosed` and `closingData` props that POSModal needs to tag post-close sales.

**Where**: `VetConnect-Admin/src/features/Records/Records.jsx` — new import + new hook call.

**How**:

Add import (near line 38):
```js
import { useClosingStatus } from '../Sales/hooks/useClosingStatus';
import { getLocalDateStr } from '../../utils/dateUtils';
```

Add hook call (after `const settings = useClinicSettings();` around line 121):
```js
// T4.189: EOD close status for POSModal post-close tagging
const todayStr = getLocalDateStr();
const { isDayClosed, closingData } = useClosingStatus(todayStr);
```

Note: Check if `getLocalDateStr` is already imported — it is NOT currently in Records.jsx imports. Must add.

**Why**: POSModal takes `isDayClosed` and `closingData` props. Without them, post-close sales would not be tagged correctly.

**Depends on**: Nothing.

**Done when**: No console errors from the hook.

---

### Step 5 — Add modal + overflow menu state declarations

**What**: Add state variables for the 4 workflow modals, the overflow menu, the revert dialog, and a selectedActionRow tracker.

**Where**: `VetConnect-Admin/src/features/Records/Records.jsx` — new state block after line 98.

**How**:
```js
// T4.189: Phase-aware action state
const [actionRow, setActionRow] = useState(null);         // Row targeted by action buttons/overflow
const [openCW, setOpenCW] = useState(false);              // ClinicalWorkspace
const [openPOS, setOpenPOS] = useState(false);             // POSModal checkout
const [openAssign, setOpenAssign] = useState(false);       // AssignStaffModal (check-in)
const [openDispenseVerify, setOpenDispenseVerify] = useState(false); // DispensingVerificationDialog
const [dispenseRow, setDispenseRow] = useState(null);      // Separate ref for dispense dialog

// Overflow menu
const [menuAnchor, setMenuAnchor] = useState(null);

// Revert dialog
const [openRevert, setOpenRevert] = useState(false);
const [revertReason, setRevertReason] = useState('');
const [submittingAction, setSubmittingAction] = useState(false);
```

**Why**: Each modal needs open/close state. `actionRow` is the appointment row that the primary action or overflow menu targets. Separate from `activeAuditRow` (which is the audit popover target). `menuAnchor` drives the MUI Menu position. `revertReason` is the mandatory TextField value for the revert dialog.

**Depends on**: Nothing.

**Done when**: State variables declared without lint warnings.

---

### Step 6 — Add action handlers

**What**: Create handler functions for status changes, modal opens, overflow menu, and revert with reason.

**Where**: `VetConnect-Admin/src/features/Records/Records.jsx` — new handler block after the existing `handlePrintVisit` function (around line 420).

**How**:
```js
// ======================================================================
// T4.189: PHASE-AWARE ACTION HANDLERS
// ======================================================================
const handleActionMenuOpen = (e, row) => {
  e.stopPropagation(); // Prevent row-click audit on ACTIVE/COMPLETED tabs
  setMenuAnchor(e.currentTarget);
  setActionRow(row);
};
const handleActionMenuClose = () => { setMenuAnchor(null); };

const handleActionStatusChange = async (row, newStatus) => {
  try {
    await changeStatus(row, newStatus, settings);
    setToast({ open: true, message: `Status changed to ${newStatus}`, severity: 'success' });
  } catch (e) {
    setToast({ open: true, message: e.message, severity: 'error' });
  }
};

const handleActionOpenAssign = (row) => {
  setActionRow(row);
  setOpenAssign(true);
};

const handleActionOpenConsult = (row) => {
  const allowed = ['in-consult', 'confined', 'on-hold'];
  if (!allowed.includes(row?.status)) {
    setToast({ open: true, message: `Cannot open workspace for status "${row?.status}"`, severity: 'warning' });
    return;
  }
  setActionRow(row);
  setOpenCW(true);
};

const handleActionOpenPOS = (row) => {
  setActionRow(row);
  setOpenPOS(true);
};

const handleActionOpenDispenseVerify = (row) => {
  setDispenseRow(row);
  setOpenDispenseVerify(true);
};

const handleActionDispenseVerified = async (dispensingData) => {
  try {
    await runTransaction(db, async (transaction) => {
      const apptRef = doc(db, 'appointments', dispenseRow.id);
      const apptDoc = await transaction.get(apptRef);
      if (!apptDoc.exists()) throw new Error('Appointment not found.');
      if (apptDoc.data().dispensingHold) throw new Error('Dispensing was placed on hold. Refresh and try again.');
      const freshData = apptDoc.data();
      transaction.update(apptRef, {
        ...dispensingData,
        status: 'billing',
        timePaymentStarted: Timestamp.now(),
        statusHistory: [...(freshData.statusHistory || []), dispenseRow.status || 'dispensing'],
        clinicalPulse: arrayUnion({
          eventId: makePulseEventId('status'),
          type: 'STATUS_CHANGE',
          from: 'dispensing',
          to: 'billing',
          timestamp: Timestamp.now(),
          staffId: user?.uid || '',
          staffName: profile?.fullName || user?.email || 'System',
          note: 'Dispensing verified — advanced to billing (from Visit Log)',
        }),
      });
    });
    setOpenDispenseVerify(false);
    setDispenseRow(null);
    setToast({ open: true, message: 'Dispensing verified — moved to billing', severity: 'success' });
  } catch (e) {
    setToast({ open: true, message: e.message, severity: 'error' });
  }
};

const handleActionRevertOpen = (row) => {
  setActionRow(row);
  setRevertReason('');
  setOpenRevert(true);
  handleActionMenuClose();
};

const handleActionRevertConfirm = async () => {
  if (!revertReason.trim() || submittingAction) return;
  setSubmittingAction(true);
  try {
    await revertStatus({ ...actionRow, revertReason });
    setOpenRevert(false);
    setToast({ open: true, message: 'Status reverted', severity: 'info' });
  } catch (e) {
    setToast({ open: true, message: e.message, severity: 'error' });
  } finally {
    setSubmittingAction(false);
  }
};

const handleActionNoShow = async () => {
  if (!actionRow) return;
  try {
    await markNoShow(actionRow);
    handleActionMenuClose();
    setToast({ open: true, message: 'Marked as no-show', severity: 'info' });
  } catch (e) {
    setToast({ open: true, message: e.message, severity: 'error' });
  }
};

const handleActionDefer = async (row) => {
  try {
    await deferAppointment(row);
    setToast({ open: true, message: 'Appointment deferred', severity: 'info' });
  } catch (e) {
    setToast({ open: true, message: e.message, severity: 'error' });
  }
};
```

**Why**: Each handler wraps the useQueueActions function with toast feedback and state management. The `handleActionDispenseVerified` replicates Queue.jsx's `handleDispenseVerified` transaction pattern (lines 745-780) for atomic dispense-to-billing advancement.

**Depends on**: Steps 1, 2, 5.

**Done when**: All handlers declared, no lint errors.

---

### Step 7 — Add new icon imports

**What**: Import the icons needed for the phase-aware action buttons that are not already imported in Records.jsx.

**Where**: `VetConnect-Admin/src/features/Records/Records.jsx` — icon imports section (lines 10-24).

**How**: Add to the existing icon imports:
```js
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import PaidIcon from '@mui/icons-material/Paid';
import UndoIcon from '@mui/icons-material/Undo';
import FlagIcon from '@mui/icons-material/Flag';
import EventIcon from '@mui/icons-material/Event';
import PersonOffIcon from '@mui/icons-material/PersonOff';
```

Note: `LocalHospitalIcon` and `PersonIcon` are already imported (lines 41, 18). `Menu` and `MenuItem` are already imported from MUI (line 6). Check for duplicate imports before adding.

Also add the MUI `Menu` component to the existing MUI import if not already present — checking: line 6 already has `MenuItem` and `Menu` is NOT imported. Need to add `Menu` to the line 3-7 import block.

Wait — re-reading line 6: `Snackbar, Alert` — and line 5 has `MenuItem`. Let me check: the MUI import block (lines 2-7) includes:
```
Box, Typography, Paper, TextField, InputAdornment, Chip, Stack, Tooltip,
IconButton, Popover, Divider, Button, Dialog, DialogTitle, DialogContent, DialogActions,
Tabs, Tab, FormControl, InputLabel, Select, MenuItem,
Snackbar, Alert
```

`Menu` is NOT in this list (only `MenuItem`). Must add `Menu` to the import.

**Why**: Action buttons need status-specific icons matching Queue patterns.

**Depends on**: Nothing.

**Done when**: All icons import without errors.

---

### Step 8 — Replace the action column renderCell with phase-aware buttons

**What**: Replace the current 3-icon action column (Audit, CRM, Print at width:160) with a wider column (width:280) that renders a status-gated primary action button + overflow IconButton + the existing Audit + CRM + Print IconButtons.

**Where**: `VetConnect-Admin/src/features/Records/Records.jsx` lines 627-653 (the `field: 'actions'` column definition).

**How**: Replace the entire actions column object with:

```js
{
  field: 'actions', headerName: 'Actions', width: 280, align: 'center', headerAlign: 'center',
  renderCell: (p) => {
    if (p.row._isDateHeader) return null;
    if (p.row._isCaseHeader) return null;

    const row = p.row;
    const status = (row.status || '').toLowerCase();
    const btnStyle = {
      textTransform: 'uppercase', fontWeight: '1000', fontSize: '0.65rem',
      height: 28, borderRadius: 0, letterSpacing: 0.5, px: 1.5,
    };

    // Determine primary action button based on status
    let primaryButton = null;

    if (status === 'pending') {
      primaryButton = (
        <>
          <Button variant="contained" size="small" color="success"
            startIcon={<CheckCircleIcon sx={{ fontSize: '12px !important' }} />}
            sx={{ ...btnStyle, flex: 1, bgcolor: '#2E7D32' }}
            onClick={(e) => { e.stopPropagation(); handleActionStatusChange(row, 'confirmed'); }}
          >Accept</Button>
          <Button variant="outlined" size="small"
            sx={{ ...btnStyle, minWidth: 'auto', px: 1, color: COLORS.accent, borderColor: '#D7CCC8' }}
            onClick={(e) => { e.stopPropagation(); handleActionDefer(row); }}
          >Defer</Button>
        </>
      );
    } else if (status === 'confirmed') {
      primaryButton = (
        <Button variant="contained" size="small"
          startIcon={<HowToRegIcon sx={{ fontSize: '12px !important' }} />}
          sx={{ ...btnStyle, flex: 1, bgcolor: row.caseDay > 1 ? '#E65100' : '#1976D2' }}
          onClick={(e) => { e.stopPropagation(); handleActionOpenAssign(row); }}
        >{row.caseDay > 1 ? 'RE-ARRIVE' : 'Check In'}</Button>
      );
    } else if (status === 'arrived') {
      primaryButton = (
        <Button variant="contained" size="small"
          sx={{ ...btnStyle, flex: 1, bgcolor: row.caseDay > 1 ? '#E65100' : COLORS.accent }}
          onClick={(e) => { e.stopPropagation(); handleActionStatusChange(row, 'in-consult'); }}
        >{row.caseDay > 1 ? 'RESUME' : 'START CONSULT'}</Button>
      );
    } else if (['in-consult', 'confined', 'on-hold'].includes(status)) {
      primaryButton = (
        <Button variant="contained" size="small"
          startIcon={<AutoFixHighIcon sx={{ fontSize: '12px !important' }} />}
          sx={{ ...btnStyle, flex: 1, bgcolor: row.caseDay > 1 ? '#E65100' : '#006064' }}
          onClick={(e) => { e.stopPropagation(); handleActionOpenConsult(row); }}
        >{row.caseDay > 1 ? 'RESUME' : 'WORKSPACE'}</Button>
      );
    } else if (status === 'dispensing') {
      const isHeld = !!row.dispensingHold;
      primaryButton = isHeld ? (
        <Chip label="ON HOLD" size="small"
          sx={{ bgcolor: '#FF9800', color: 'white', fontWeight: 900, fontSize: '0.6rem', height: 20, borderRadius: 0 }}
        />
      ) : (
        <Button variant="contained" size="small"
          startIcon={<LocalHospitalIcon sx={{ fontSize: '12px !important' }} />}
          sx={{ ...btnStyle, flex: 1, bgcolor: '#C62828' }}
          onClick={(e) => { e.stopPropagation(); handleActionOpenDispenseVerify(row); }}
        >VERIFY</Button>
      );
    } else if (status === 'billing') {
      primaryButton = (
        <Button variant="contained" size="small"
          startIcon={<PaidIcon sx={{ fontSize: '12px !important' }} />}
          sx={{ ...btnStyle, flex: 1, bgcolor: '#FF8F00' }}
          onClick={(e) => { e.stopPropagation(); handleActionOpenPOS(row); }}
        >CHECKOUT</Button>
      );
    } else if (TERMINAL_STATUSES.has(status)) {
      // Terminal: completed, cancelled, no-show, carried-over
      primaryButton = row.statusHistory?.length > 0 ? (
        <Button variant="outlined" size="small"
          startIcon={<UndoIcon sx={{ fontSize: '12px !important' }} />}
          sx={{ ...btnStyle, flex: 1, color: '#D32F2F', borderColor: '#D32F2F' }}
          onClick={(e) => { e.stopPropagation(); handleActionRevertOpen(row); }}
        >Revert</Button>
      ) : null;
    }

    return (
      <Stack direction="row" spacing={0.5} sx={{ height: '100%', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
        {primaryButton}
        {/* Overflow menu — shown for non-terminal statuses */}
        {!TERMINAL_STATUSES.has(status) && (
          <IconButton size="small"
            onClick={(e) => handleActionMenuOpen(e, row)}
            sx={{ border: '1px solid rgba(0,0,0,0.1)', color: COLORS.accent, flexShrink: 0 }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        )}
        {/* Always-visible: Audit (on PENDING tab only — ACTIVE/COMPLETED use row-click) */}
        {activeTab === 0 && (
          <Tooltip title="Visit Audit">
            <IconButton size="small"
              onClick={(e) => { e.stopPropagation(); handleOpenAudit(e, row); }}
              sx={{ border: '1px solid #D7CCC8', color: COLORS.accent }}
            >
              <TimelineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="View in Patient CRM">
          <IconButton size="small"
            onClick={(e) => { e.stopPropagation(); navigate(`/patients/${row.petId}`, { state: { from: 'records' } }); }}
            sx={{ border: '1px solid #D7CCC8', color: COLORS.accent }}
          >
            <PersonIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Print Visit Summary">
          <IconButton size="small"
            onClick={async (e) => { e.stopPropagation(); await handlePrintVisit(row); }}
            sx={{ border: '1px solid #D7CCC8', color: COLORS.accent }}
          >
            <PrintIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    );
  }
}
```

Key design decisions:
- Primary button gets `flex: 1` to fill available space.
- Terminal rows show Revert button only when `statusHistory` has entries (same guard as Queue.jsx line 2424).
- Overflow MoreVertIcon hidden on terminal rows (no further actions possible beyond revert).
- Audit TimelineIcon only on PENDING tab (activeTab === 0) since ACTIVE/COMPLETED tabs use row-click for audit.
- CRM and Print icons remain on ALL rows.
- All onClick handlers call `e.stopPropagation()` to prevent row-click audit on ACTIVE/COMPLETED tabs.
- `TERMINAL_STATUSES` already imported (line 35).

**Why**: This is the core feature — staff sees the correct action for each appointment's current phase.

**Depends on**: Steps 5, 6, 7.

**Done when**: Each status renders its primary button correctly. Clicking does not crash.

---

### Step 9 — Add the overflow Menu render

**What**: Render an MUI Menu component anchored to the overflow IconButton, with status-gated MenuItems mirroring Queue.jsx's overflow options (minus Queue-specific items like Edit Identity, View Medical History, View in Records, Send Notification).

**Where**: `VetConnect-Admin/src/features/Records/Records.jsx` — in the JSX return, after the DataGrid `</Box>` (around line 1040), before the existing dialogs.

**How**:
```jsx
{/* T4.189: PHASE-AWARE OVERFLOW MENU */}
<Menu
  anchorEl={menuAnchor}
  open={Boolean(menuAnchor)}
  onClose={handleActionMenuClose}
  PaperProps={{
    sx: {
      border: '2px solid ' + COLORS.accent,
      boxShadow: '4px 4px 0px rgba(93, 64, 55, 0.15)',
      borderRadius: 0,
      '& .MuiMenuItem-root': { fontWeight: '1000', py: 1.5, fontSize: '0.85rem' },
    }
  }}
>
  {/* On-Hold controls (in-consult → on-hold / on-hold → resume) */}
  {actionRow?.status === 'in-consult' && (
    <MenuItem onClick={() => { handleActionStatusChange(actionRow, 'on-hold'); handleActionMenuClose(); }}>
      <ListItemIcon><PauseCircleIcon fontSize="small" sx={{ color: '#FF9800' }} /></ListItemIcon>
      <ListItemText primary="Put On Hold" sx={{ color: '#FF9800' }} />
    </MenuItem>
  )}
  {actionRow?.status === 'on-hold' && (
    <MenuItem onClick={() => { handleActionStatusChange(actionRow, 'in-consult'); handleActionMenuClose(); }}>
      <ListItemIcon><PlayCircleFilledWhiteIcon fontSize="small" sx={{ color: '#2E7D32' }} /></ListItemIcon>
      <ListItemText primary="Resume Consult" sx={{ color: '#2E7D32' }} />
    </MenuItem>
  )}

  {/* No-Show (confirmed only) */}
  {actionRow?.status === 'confirmed' && (
    <MenuItem onClick={() => { handleActionNoShow(); handleActionMenuClose(); }}>
      <ListItemIcon><PersonOffIcon fontSize="small" /></ListItemIcon>
      <ListItemText primary="Flag as No-Show" />
    </MenuItem>
  )}

  {/* Reschedule (any non-pending, non-terminal) */}
  {actionRow && !['pending'].includes(actionRow.status) && !TERMINAL_STATUSES.has(actionRow.status) && (
    <MenuItem onClick={() => {
      setActiveAuditRow(actionRow); // Reuse existing reschedule flow which reads activeAuditRow
      setRescheduleData({ newDate: '', reason: '' });
      setOpenReschedule(true);
      handleActionMenuClose();
    }}>
      <ListItemIcon><EventIcon fontSize="small" /></ListItemIcon>
      <ListItemText primary="Reschedule" />
    </MenuItem>
  )}

  {/* Revert (any status with statusHistory) */}
  {actionRow?.statusHistory?.length > 0 && (
    <MenuItem onClick={() => handleActionRevertOpen(actionRow)}>
      <ListItemIcon><UndoIcon fontSize="small" sx={{ color: TERMINAL_STATUSES.has(actionRow?.status) ? '#D32F2F' : '#E65100' }} /></ListItemIcon>
      <ListItemText
        primary={TERMINAL_STATUSES.has(actionRow?.status) ? 'Revert Terminal State' : 'Revert Status (Undo)'}
        sx={{ color: TERMINAL_STATUSES.has(actionRow?.status) ? '#D32F2F' : '#E65100' }}
      />
    </MenuItem>
  )}

  {/* Cancel / Void (any non-pending, non-terminal) */}
  {actionRow && actionRow.status !== 'pending' && !TERMINAL_STATUSES.has(actionRow.status) && (
    <>
      <Divider />
      <MenuItem onClick={() => {
        setActiveAuditRow(actionRow); // Reuse existing void flow
        handleCancelAppt();
        handleActionMenuClose();
      }} sx={{ color: '#D32F2F' }}>
        <ListItemIcon><PersonOffIcon fontSize="small" sx={{ color: '#D32F2F' }} /></ListItemIcon>
        <ListItemText primary="Cancel / Void Record" />
      </MenuItem>
    </>
  )}
</Menu>
```

Note: The overflow menu reuses existing Records.jsx handlers (`handleCancelAppt`, reschedule via `activeAuditRow` + `openReschedule`) for Cancel/Void and Reschedule. This avoids duplicating the existing void dialog (lines 1113-1150) and reschedule dialog (lines 1070-1112).

Additional icon imports needed (add to the icon import block):
```js
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleFilledWhiteIcon from '@mui/icons-material/PlayCircleFilledWhite';
```

Also need to add `ListItemIcon, ListItemText` to the MUI import if not present. Checking: line 6 does NOT have these. Must add.

**Why**: The overflow menu provides secondary actions (On-Hold, Resume, No-Show, Reschedule, Revert, Cancel) without cluttering the primary action column.

**Depends on**: Steps 5, 6, 7.

**Done when**: Menu opens on overflow click, shows correct items per status, actions fire without errors.

---

### Step 10 — Add the Revert Dialog render

**What**: Render an MUI Dialog with a mandatory auditReason TextField for revert operations.

**Where**: `VetConnect-Admin/src/features/Records/Records.jsx` — in the JSX return, after the overflow Menu, before existing dialogs.

**How**:
```jsx
{/* T4.189: REVERT STATUS DIALOG */}
<Dialog
  open={openRevert}
  onClose={() => setOpenRevert(false)}
  maxWidth="xs"
  fullWidth
  PaperProps={{ sx: { borderRadius: 0, border: '4px solid #D32F2F' } }}
>
  <DialogTitle sx={{ bgcolor: '#FFEBEE', color: '#D32F2F', fontWeight: '1000', borderBottom: '2px solid #D32F2F' }}>
    REVERT STATUS
  </DialogTitle>
  <DialogContent sx={{ pt: 3 }}>
    <Typography variant="body2" sx={{ mb: 2, color: COLORS.accent }}>
      Reverting <strong>{actionRow?.petName || '—'}</strong> from <strong>{actionRow?.status?.toUpperCase()}</strong> to its previous state.
      This action is audited.
    </Typography>
    <TextField
      fullWidth
      multiline
      rows={3}
      autoFocus
      label="Reason for revert (required)"
      placeholder="e.g., Billing error — need to re-verify dispensing"
      value={revertReason}
      onChange={(e) => setRevertReason(e.target.value)}
      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, fontWeight: 900, fontSize: '0.85rem' } }}
    />
    {!revertReason.trim() && (
      <Typography variant="caption" sx={{ color: '#D32F2F', fontWeight: '1000', fontSize: '0.6rem', mt: 0.5, display: 'block' }}>
        A forensic audit reason is mandatory for status reversals.
      </Typography>
    )}
  </DialogContent>
  <DialogActions sx={{ p: 2, bgcolor: '#FFEBEE', borderTop: '2px solid #D32F2F' }}>
    <Button onClick={() => setOpenRevert(false)} sx={{ fontWeight: '1000', color: '#757575' }}>Cancel</Button>
    <Button
      variant="contained"
      disabled={!revertReason.trim() || submittingAction}
      onClick={handleActionRevertConfirm}
      sx={{ bgcolor: '#D32F2F', fontWeight: '1000', borderRadius: 0 }}
    >
      Confirm Revert
    </Button>
  </DialogActions>
</Dialog>
```

**Why**: Zero `prompt()`/`alert()`/`confirm()` — MUI Dialog with mandatory reason, matching Queue.jsx revert pattern (lines 992-1006).

**Depends on**: Steps 5, 6.

**Done when**: Dialog opens on Revert click, refuses submit without reason text, calls `revertStatus` successfully.

---

### Day 1 Verification Checkpoint

1. Visit Log loads without console errors.
2. Each tab shows correct primary action buttons per status:
   - PENDING tab: Accept + Defer + overflow + Audit + CRM + Print
   - ACTIVE tab: Check In / Start Consult / Workspace / Verify / Checkout + overflow + CRM + Print
   - COMPLETED tab: Revert (if statusHistory exists) + CRM + Print
3. Overflow menu shows correct items per status.
4. Revert dialog opens, requires reason, submits.
5. Toast confirms each action.
6. No modal opens yet (Day 2 work) — but button handlers set state correctly (verify with React DevTools).

---

## Day 2: Modal Renders + Wiring

### Step 11 — Add modal component imports

**What**: Import the 4 modal components that will be rendered at the bottom of Records.jsx.

**Where**: `VetConnect-Admin/src/features/Records/Records.jsx` — import section.

**How**: Add (checking for existing imports first):
```js
// T4.189: Workflow modals
import ClinicalWorkspace from '../../components/ClinicalWorkspace';
import POSModal from '../../components/POSModal';
import AssignStaffModal from '../Queue/AssignStaffModal';
import DispensingVerificationDialog from '../Queue/DispensingVerificationDialog';
```

Note: Check if `runTransaction` is already in the Firestore import (line 36). Current line 36 includes:
```
query, collection, where, onSnapshot, arrayUnion, doc, updateDoc, Timestamp, writeBatch, getDocs, getDoc
```
`runTransaction` is NOT imported. Must add it to the Firestore import line.

Also verify `arrayUnion` is already imported — yes (line 36).

**Why**: These are the 4 modals that enable full workflow capability from the Visit Log.

**Depends on**: Nothing.

**Done when**: Imports resolve without errors.

---

### Step 12 — Render the 4 workflow modals in JSX

**What**: Render `AssignStaffModal`, `ClinicalWorkspace`, `POSModal`, and `DispensingVerificationDialog` at the bottom of Records.jsx JSX, before the closing `</Box>`.

**Where**: `VetConnect-Admin/src/features/Records/Records.jsx` — at the end of the JSX return, before the final `</Box>` (around line 1526).

**How**: Insert before the closing `</Box>`:
```jsx
{/* T4.189: WORKFLOW MODALS */}
<AssignStaffModal
  open={openAssign}
  onClose={() => setOpenAssign(false)}
  patient={actionRow}
/>
<ClinicalWorkspace
  open={openCW}
  onClose={() => setOpenCW(false)}
  patient={actionRow}
  inventoryList={joinedInventory}
  servicesList={servicesList}
  departments={departments}
  vetsList={vets}
/>
<POSModal
  open={openPOS}
  onClose={() => setOpenPOS(false)}
  patient={actionRow}
  inventoryList={joinedInventory}
  servicesList={servicesList}
  isDayClosed={isDayClosed}
  closingData={closingData}
/>
<DispensingVerificationDialog
  open={openDispenseVerify}
  onClose={() => { setOpenDispenseVerify(false); setDispenseRow(null); }}
  patient={dispenseRow}
  onVerified={handleActionDispenseVerified}
  staffProfile={profile}
  clinicSettings={settings}
  inventoryList={joinedInventory}
/>
```

Props analysis (verified against component signatures):
- `AssignStaffModal({ open, onClose, patient })` — line 20 of AssignStaffModal.jsx
- `ClinicalWorkspace({ open, onClose, patient, inventoryList, servicesList, departments, vetsList })` — line 465 of ClinicalWorkspace.jsx
- `POSModal({ open, onClose, patient, inventoryList, servicesList, isDayClosed, closingData })` — line 45 of POSModal.jsx
- `DispensingVerificationDialog({ open, onClose, patient, onVerified, staffProfile, clinicSettings, inventoryList })` — line 29 of DispensingVerificationDialog.jsx

All prop names match. `departments` and `vets` are already loaded via existing listeners (lines 126-149).

**Why**: Modals must be rendered in the component tree to be opened by the action handlers.

**Depends on**: Steps 3, 4, 5, 6, 11.

**Done when**: All 4 modals render and can be opened/closed without errors.

---

### Step 13 — Wire action buttons to modal state (verification pass)

**What**: Verify that each primary action button's onClick correctly opens its target modal with the right row data. This is a testing/verification step, not a code change.

**Where**: Browser — Visit Log page.

**How**: Test each status path:

| Status | Primary Click | Expected |
|--------|---------------|----------|
| pending | Accept | Status changes to confirmed (toast) |
| pending | Defer | Deferred via deferAppointment (toast) |
| confirmed | Check In | AssignStaffModal opens with row as patient |
| arrived | Start Consult | Status changes to in-consult (toast) |
| in-consult | Workspace | ClinicalWorkspace opens with row as patient + inventory data |
| dispensing | Verify | DispensingVerificationDialog opens with row |
| billing | Checkout | POSModal opens with row as patient + inventory data |
| completed | Revert | Revert dialog opens with mandatory reason |
| confirmed (overflow) | No-Show | markNoShow fires (toast) |
| in-consult (overflow) | Put On Hold | Status changes to on-hold (toast) |
| on-hold (overflow) | Resume | Status changes to in-consult (toast) |
| any (overflow) | Reschedule | Reschedule dialog opens (reuses existing) |
| any (overflow) | Cancel/Void | Void dialog opens (reuses existing) |

**Depends on**: Steps 8, 9, 12.

**Done when**: All 14 paths work correctly without errors.

---

### Step 14 — Adjust DataGrid row height for wider actions column

**What**: The action column is now 280px wide with up to 6 elements (primary + overflow + audit + CRM + print). Verify that all buttons fit within the row height of 70px. If buttons wrap or overflow, increase `rowHeight` to 80 or adjust `width` to 300.

**Where**: `VetConnect-Admin/src/features/Records/Records.jsx` — DataGrid props.

**How**: Visual inspection. The primary button has `height: 28` and IconButtons are `size="small"` (~28px). All in a horizontal `Stack` with `spacing={0.5}`. At 280px width with 6 items: primary (~80-100px) + overflow (28px) + audit (28px) + CRM (28px) + print (28px) = ~220-240px. Should fit. If not, increase actions column width to 300.

On PENDING tab with checkbox selection enabled, the first column takes ~50px, which may push the total grid width past viewport. The existing columns already use `flex` for some — verify scrolling behavior.

**Depends on**: Step 8.

**Done when**: All action buttons visible without horizontal scroll or vertical overflow.

---

## Day 2 Verification Checkpoint

1. AssignStaffModal opens for confirmed appointments, completes check-in.
2. ClinicalWorkspace opens for in-consult/confined/on-hold appointments with full inventory and services data.
3. POSModal opens for billing appointments, completes checkout with receipt.
4. DispensingVerificationDialog opens for dispensing appointments, verifies and advances to billing.
5. Revert works on completed/cancelled/no-show appointments across any date.
6. All overflow menu actions (On-Hold, Resume, No-Show, Reschedule, Cancel/Void) work correctly.
7. Row-click audit still works on ACTIVE and COMPLETED tabs.
8. Checkbox selection still works on PENDING tab.
9. No console errors. Toast confirms each action.
10. Build clean (`npm run build` passes).

---

## Files Modified

| File | Changes |
|------|---------|
| `VetConnect-Admin/src/features/Records/Records.jsx` | All changes — expanded imports (icons, modals, Firestore methods, hooks), new state, new listeners, new handlers, action column rewrite, overflow Menu, revert Dialog, 4 modal renders |

No other files modified. `useQueueActions.js` is unchanged — already exports all needed handlers.

---

## Risk Assessment

1. **State collision with audit popover**: Records.jsx uses `anchorEl` + `activeAuditRow` for the audit Popover, and now adds `menuAnchor` + `actionRow` for the overflow Menu. These are separate state variables — no collision. The reschedule and void flows bridge via `setActiveAuditRow(actionRow)` before opening their existing dialogs.

2. **Firestore listener count**: Records.jsx will now have 6 real-time listeners (departments, vets, inventory, categories, services, plus the core records listener in useGlobalRecords). This is acceptable — Queue.jsx has the same count plus more.

3. **ClinicalWorkspace side effects**: When ClinicalWorkspace saves a consult and advances status, the Visit Log's records will update via the existing `useGlobalRecords` listener. No stale state risk.

4. **Date-independent revert safety**: Reverting a 3-week-old completed record to billing is intentionally allowed. The `revertStatus` handler in `useQueueActions` checks `statusHistory` and reverts to the previous entry. The mandatory `revertReason` TextField provides forensic accountability.

5. **POSModal patient prop**: POSModal expects a `patient` object with `id`, `ownerName`, `petName`, `services`, etc. The Visit Log row objects (from useGlobalRecords) contain all these fields from the appointments collection. No mapping needed.

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Day 1: Steps 1-10 (listeners, handlers, action column, overflow, revert) | ~2 hours |
| Day 2: Steps 11-14 (modal imports, renders, wiring, verification) | ~1.5 hours |
| **Total** | **~3.5 hours** |
