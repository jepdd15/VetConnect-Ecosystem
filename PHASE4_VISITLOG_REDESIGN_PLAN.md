# T4.183 — Visit Log Redesign Plan

## Overview

The Records page (`Records.jsx`, 1462 lines) serves as the clinic's visit logbook but has organizational gaps: 6 tabs with blurry boundaries (ALL VISITS redundant with search, CLINICAL + IN-PATIENT both read-only, jargon names), audit popover hidden behind a tiny clock icon, no per-tab metrics, flat DataGrid with no date anchoring, cryptic action icons, and a barely differentiated Cases view. This plan restructures the page into 3 plain-language tabs matching reception workflow ("what's coming?", "what's happening?", "what's done?"), renames the page to "Visit Log," makes audit popover discoverable via row clicks, adds per-tab KPIs, date section headers, case view headers, and cleans up dead code from T4.172.

### Locked Decisions
1. **3 tabs**: PENDING (pending + confirmed), ACTIVE (arrived + in-consult + on-hold + dispensing + billing + confined), COMPLETED (completed + carried-over + cancelled + no-show)
2. **"VISIT LOG"** name replacing "Records" / "All Records" everywhere
3. **Merged ACTIVE tab** — Clinical + In-Patient combined into one tab

### Assumptions
- T4.172 (multi-pet removal) is DONE — verified: zero `visitGroupId` references remain in Records.jsx
- `setGroupSiblings([])` and `setLoadingGroupSiblings(false)` in `handleCloseAudit` (line 238-239) are orphaned dead code from T4.172 — no corresponding `useState` declarations exist
- The route path stays `/records` (no URL change — avoids breaking saved bookmarks)
- Saved filter presets that reference old silo names (TRIAGE, CLINICAL, IN-PATIENT, ARCHIVE, VOIDED) will gracefully fall back to tab 0 (PENDING) via indexOf returning -1, which becomes 0

---

## Day 1 (~2 hrs): Tab Restructure + Rename + Action Cleanup + Dead Code

### Task 1: useGlobalRecords.js — 3-silo definitions replacing 5

**File**: `VetConnect-Admin/src/features/Records/hooks/useGlobalRecords.js`

**What**: Replace the 5-entry `SILOS` object (lines 21-27) with 3 entries matching the locked decision.

**Where**: Lines 21-27 inside the `useEffect`.

**How**:
```js
// BEFORE (lines 21-27):
const SILOS = {
  'TRIAGE':     ['pending', 'confirmed'],
  'CLINICAL':   ['arrived', 'in-consult', 'on-hold', 'dispensing', 'billing'],
  'IN-PATIENT': ['confined'],
  'ARCHIVE':    ['completed', 'carried-over'],
  'VOIDED':     ['cancelled', 'no-show']
};

// AFTER:
const SILOS = {
  'PENDING':   ['pending', 'confirmed'],
  'ACTIVE':    ['arrived', 'in-consult', 'on-hold', 'dispensing', 'billing', 'confined'],
  'COMPLETED': ['completed', 'carried-over', 'cancelled', 'no-show']
};
```

The `statusFilter = SILOS[silo] || null` fallback on line 29 stays as-is — when `silo === 'GLOBAL'` (old saved presets), it returns `null` and loads all records (same as before, graceful degradation).

**Done when**: Passing silo `'PENDING'` to the hook returns only pending + confirmed appointments; `'ACTIVE'` returns arrived through confined; `'COMPLETED'` returns completed through no-show.

---

### Task 2: Records.jsx — SILO_MAP + Tab restructure (6 tabs to 3)

**File**: `VetConnect-Admin/src/features/Records/Records.jsx`

**What**: Replace the 6-entry `SILO_MAP` array and 6 `<Tab>` elements with 3.

**Where**:
- Line 62: `SILO_MAP` constant
- Lines 754-760: 6 `<Tab>` elements
- Line 776: `checkboxSelection={activeTab === 1}` — update index to match PENDING tab (now index 0)

**How**:

(a) Line 62 — replace SILO_MAP:
```js
// BEFORE:
const SILO_MAP = ['GLOBAL', 'TRIAGE', 'CLINICAL', 'IN-PATIENT', 'ARCHIVE', 'VOIDED'];

// AFTER:
const SILO_MAP = ['PENDING', 'ACTIVE', 'COMPLETED'];
```

(b) Lines 754-760 — replace 6 Tabs with 3:
```jsx
// BEFORE:
<Tab label="📜 ALL VISITS" />
<Tab label="⚡ TRIAGE" />
<Tab label="🏥 CLINICAL" />
<Tab label="🐾 IN-PATIENT" />
<Tab label="🛡️ ARCHIVE" />
<Tab label="🚫 VOIDED" />

// AFTER:
<Tab label="PENDING" />
<Tab label="ACTIVE" />
<Tab label="COMPLETED" />
```

(c) Line 776 — checkbox selection stays on PENDING (index 0):
```js
// BEFORE:
checkboxSelection={activeTab === 1}

// AFTER:
checkboxSelection={activeTab === 0}
```

(d) Line 781 — `isRowSelectable` stays as-is (already checks `pending`/`confirmed` statuses, correct for PENDING tab).

(e) Line 729 — update the record count label that reads `activeSilo.replace('GLOBAL', 'TOTAL').replace('_', ' ')`:
```js
// BEFORE:
{facets.petSpecies || ''} {activeSilo.replace('GLOBAL', 'TOTAL').replace('_', ' ')} VISITS

// AFTER:
{facets.petSpecies || ''} {activeSilo} VISITS
```

(f) Saved preset loader (line 1331) — `SILO_MAP.indexOf(fs.activeSilo)` will return -1 for old silo names (TRIAGE, CLINICAL, etc.), and `setActiveTab(-1)` is harmless (Tabs treats invalid index as "none selected," defaulting to first). But for safety, clamp:
```js
// BEFORE:
if (fs.activeSilo !== undefined) setActiveTab(SILO_MAP.indexOf(fs.activeSilo));

// AFTER:
if (fs.activeSilo !== undefined) {
  const idx = SILO_MAP.indexOf(fs.activeSilo);
  setActiveTab(idx >= 0 ? idx : 0);
}
```

**Done when**: Page shows exactly 3 tabs (PENDING, ACTIVE, COMPLETED). Clicking each tab loads the correct status subset. Checkbox selection works only on PENDING tab (index 0).

---

### Task 3: Page rename — Records to VISIT LOG

**File 1**: `VetConnect-Admin/src/features/Records/Records.jsx`
**File 2**: `VetConnect-Admin/src/components/Sidebar.jsx`

**What**: Rename all user-visible references from "Records" to "VISIT LOG" / "Visit Log".

**Where**:

(a) Records.jsx line 613-614 — page header Typography:
```jsx
// BEFORE:
RECORDS

// AFTER:
VISIT LOG
```

(b) Records.jsx line 619 — search placeholder:
```jsx
// BEFORE:
placeholder="Search records..."

// AFTER:
placeholder="Search visits..."
```

(c) Records.jsx line 382 — print footer:
```jsx
// BEFORE:
Generated ${new Date().toLocaleString(...)} — VetConnect Visit Ledger

// No change needed — already says "Visit Ledger" which is close enough.
// But for consistency, change to:
Generated ${new Date().toLocaleString(...)} — VetConnect Visit Log
```

(d) Sidebar.jsx line 33:
```js
// BEFORE:
{ name: 'All Records', icon: <HistoryIcon />, path: '/records' },

// AFTER:
{ name: 'Visit Log', icon: <HistoryIcon />, path: '/records' },
```

**Done when**: Sidebar shows "Visit Log" instead of "All Records." Page header reads "VISIT LOG." Search placeholder says "Search visits...".

---

### Task 4: Action column cleanup — 4 icons to 3 (conditional)

**File**: `VetConnect-Admin/src/features/Records/Records.jsx`

**What**: Remove the "Copy Visit ID" button (developer tool, not clinical). Make the "Visit Audit" TimelineIcon button conditional — only show on PENDING tab (where row click is reserved for checkbox selection). On ACTIVE + COMPLETED tabs, the TimelineIcon is removed because row click opens the audit popover (Task 5 Day 2).

**Where**: Lines 564-591 — the `actions` column `renderCell`.

**How**:

Replace the actions column renderCell to conditionally include the Audit button:
```jsx
{
  field: 'actions', headerName: 'Actions', width: 160, align: 'center', headerAlign: 'center',
  renderCell: (p) => (
    <Stack direction="row" spacing={0.5} sx={{ height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      {/* Audit button: only on PENDING tab where row click = checkbox */}
      {activeTab === 0 && (
        <Tooltip title="Visit Audit">
          <IconButton size="small" onClick={(e) => handleOpenAudit(e, p.row)} sx={{ border: '1px solid #D7CCC8', color: COLORS.accent }}>
            <TimelineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title="View in Patient CRM">
        <IconButton size="small" onClick={() => navigate(`/patients/${p.row.petId}`, { state: { from: 'records' } })} sx={{ border: '1px solid #D7CCC8', color: COLORS.accent }}>
          <PersonIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Print Visit Summary">
        <IconButton size="small" onClick={async () => await handlePrintVisit(p.row)}
          sx={{ border: '1px solid #D7CCC8', color: COLORS.accent }}>
          <PrintIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  )
}
```

Changes:
- Remove `ContentCopyIcon` import and `handleCopyId` function (lines 389-395)
- Remove `ContentCopyIcon` import (line 45)
- CRM icon changed from `HistoryIcon` to `PersonIcon` with updated tooltip "View in Patient CRM" (clearer semantics — HistoryIcon on a page called "Visit Log" is confusing)
- Action column width reduced from 210 to 160

**Done when**: PENDING tab shows 3 action icons (Audit, CRM, Print). ACTIVE + COMPLETED tabs show 2 action icons (CRM, Print). Copy ID button is gone. Tooltips are clear.

---

### Task 5: Dead code cleanup — orphaned groupSiblings state

**File**: `VetConnect-Admin/src/features/Records/Records.jsx`

**What**: Remove the two orphaned setter calls left over from T4.172.

**Where**: Lines 238-239 inside `handleCloseAudit`:
```js
// REMOVE these two lines:
setGroupSiblings([]);
setLoadingGroupSiblings(false);
```

These functions are never declared (no `useState` for them) — they would cause a ReferenceError if `handleCloseAudit` were called at runtime. The function works because JavaScript doesn't eagerly evaluate the setter calls until the function body executes, but `setGroupSiblings` is indeed undefined. This is a latent crash bug.

**Done when**: `handleCloseAudit` only calls `setAnchorEl(null)` and `setActiveAuditRow(null)`. No console errors when closing the audit popover.

---

## Day 2 (~1.5 hrs): Row-Click Audit + KPI Strip + Case Headers + Date Headers

### Task 6: Row-click audit — ACTIVE + COMPLETED tabs open popover on click

**File**: `VetConnect-Admin/src/features/Records/Records.jsx`

**What**: On ACTIVE and COMPLETED tabs, clicking a DataGrid row opens the audit popover. On PENDING tab, row click selects the checkbox (existing behavior via `checkboxSelection`).

**Where**: DataGrid component (lines 766-812).

**How**: Add `onRowClick` handler to DataGrid:
```jsx
<DataGrid
  // ...existing props...
  onRowClick={(params, event) => {
    // Only open audit on ACTIVE (1) and COMPLETED (2) tabs
    if (activeTab === 0) return; // PENDING: let checkbox handle it
    handleOpenAudit(event, params.row);
  }}
  // Change disableRowSelectionOnClick to be conditional:
  disableRowSelectionOnClick={activeTab !== 0}
  // ...rest of props...
/>
```

Also update the DataGrid `sx` to show pointer cursor on ACTIVE/COMPLETED tabs:
```js
// Add to the DataGrid sx:
...(activeTab !== 0 ? {
  '& .MuiDataGrid-row': { cursor: 'pointer' }
} : {}),
```

**Done when**: On ACTIVE tab, clicking any row opens the audit popover with that row's data. On COMPLETED tab, same behavior. On PENDING tab, clicking a row selects/deselects the checkbox. No double-open when clicking the remaining Audit icon button on PENDING tab.

---

### Task 7: Per-tab KPI strip — compact status counts

**File**: `VetConnect-Admin/src/features/Records/Records.jsx`

**What**: Add a compact horizontal row of status count chips between the tab bar and the DataGrid, showing the breakdown of statuses within the current tab.

**Where**: Insert a new `<Box>` between the tab container closing `</Box>` (line 762) and the DataGrid container `<Box>` (line 764).

**How**:

Add a `useMemo` computing status counts:
```js
const tabStatusCounts = useMemo(() => {
  const counts = {};
  filteredRecords.forEach(r => {
    const s = (r.status || '').toLowerCase();
    counts[s] = (counts[s] || 0) + 1;
  });
  return counts;
}, [filteredRecords]);
```

Render the KPI strip:
```jsx
{/* PER-TAB KPI STRIP */}
<Box sx={{
  px: 4, py: 0.75, bgcolor: 'white',
  borderBottom: '1px solid rgba(93, 64, 55, 0.08)',
  display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap'
}}>
  {activeTab === 0 && (
    <>
      <Chip label={`${tabStatusCounts['pending'] || 0} pending`} size="small"
        sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiOrangeBg, border: `1px solid ${COLORS.kpiOrangeBorder}`, color: COLORS.warning }} />
      <Chip label={`${tabStatusCounts['confirmed'] || 0} confirmed`} size="small"
        sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiGreenBg, border: `1px solid ${COLORS.kpiGreenBorder}`, color: COLORS.success }} />
    </>
  )}
  {activeTab === 1 && (
    <>
      <Chip label={`${tabStatusCounts['arrived'] || 0} arrived`} size="small"
        sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiBlueBg, border: `1px solid ${COLORS.kpiBlueBorder}`, color: COLORS.medical }} />
      <Chip label={`${tabStatusCounts['in-consult'] || 0} in-consult`} size="small"
        sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiBlueBg, border: `1px solid ${COLORS.kpiBlueBorder}`, color: COLORS.medical }} />
      <Chip label={`${tabStatusCounts['dispensing'] || 0} dispensing`} size="small"
        sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiPurpleBg, border: `1px solid ${COLORS.kpiPurpleBorder}`, color: COLORS.kpiPurpleText }} />
      <Chip label={`${tabStatusCounts['billing'] || 0} billing`} size="small"
        sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiOrangeBg, border: `1px solid ${COLORS.kpiOrangeBorder}`, color: COLORS.warning }} />
      <Chip label={`${tabStatusCounts['confined'] || 0} confined`} size="small"
        sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiRedBg, border: `1px solid ${COLORS.kpiRedBorder}`, color: COLORS.danger }} />
      <Chip label={`${tabStatusCounts['on-hold'] || 0} on-hold`} size="small"
        sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: '#FFF8E1', border: `1px solid ${COLORS.accentLight}`, color: COLORS.accent }} />
    </>
  )}
  {activeTab === 2 && (
    <>
      <Chip label={`${tabStatusCounts['completed'] || 0} completed`} size="small"
        sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiGreenBg, border: `1px solid ${COLORS.kpiGreenBorder}`, color: COLORS.success }} />
      <Chip label={`${tabStatusCounts['carried-over'] || 0} carried-over`} size="small"
        sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiOrangeBg, border: `1px solid ${COLORS.kpiOrangeBorder}`, color: COLORS.warning }} />
      <Chip label={`${tabStatusCounts['cancelled'] || 0} cancelled`} size="small"
        sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiRedBg, border: `1px solid ${COLORS.kpiRedBorder}`, color: COLORS.danger }} />
      <Chip label={`${tabStatusCounts['no-show'] || 0} no-show`} size="small"
        sx={{ height: 22, fontSize: '0.6rem', fontWeight: 1000, borderRadius: 0, bgcolor: COLORS.kpiRedBg, border: `1px solid ${COLORS.kpiRedBorder}`, color: COLORS.danger }} />
    </>
  )}
</Box>
```

**Done when**: Each tab shows a compact strip of status count chips. Counts update reactively as records load. PENDING shows "N pending / N confirmed." ACTIVE shows 6 status counts. COMPLETED shows 4.

---

### Task 8: Case view headers — visual group separators in viewMode === 'case'

**File**: `VetConnect-Admin/src/features/Records/Records.jsx`

**What**: When `viewMode === 'case'`, enhance the existing case grouping to insert a visible case header row above each chain group. Currently, the first row in each group has `_isCaseHeader: true` but it only gets a subtle `case-continuation` class on non-header rows. Add a prominent visual header.

**Where**: The `groupedRecords` useMemo (lines 186-227) and the DataGrid rendering.

**How**:

(a) Enhance the `groupedRecords` useMemo to attach metadata to case header rows:
```js
// In the loop at lines 217-224, enrich _isCaseHeader rows:
visits.forEach((v, i) => {
  const firstVisit = visits[0];
  const lastVisit = visits[visits.length - 1];
  result.push({
    ...v,
    _caseGroupIndex: i + 1,
    _caseGroupSize: visits.length,
    _isCaseHeader: i === 0,
    _caseLabel: visits.length > 1
      ? `${v.petName || 'Unknown'} — ${(v.services || []).map(s => s.name).join(', ') || v.serviceType || 'Visit'} — Day 1–${visits.length} — ${firstVisit.jsCreatedAt?.toLocaleDateString() || '?'} to ${lastVisit.jsCreatedAt?.toLocaleDateString() || '?'}`
      : null,
  });
});
```

(b) Add `getRowClassName` enhancement and `getRowHeight` to give header rows a visual header:
```js
getRowClassName={(params) => {
  if (viewMode !== 'case') return '';
  if (params.row._isCaseHeader && params.row._caseLabel) return 'case-header';
  if (!params.row._isCaseHeader) return 'case-continuation';
  return '';
}}
```

(c) Add case-header styling to the DataGrid `sx`:
```js
'& .case-header': {
  bgcolor: '#FFF8E1 !important',
  borderTop: `2px solid ${COLORS.accent}`,
  fontWeight: 1000,
},
```

(d) Enhance the `lineage` column `renderCell` to show the case label on header rows:
```js
// In the lineage column renderCell, add for case headers:
if (viewMode === 'case' && p.row._isCaseHeader && p.row._caseLabel) {
  return (
    <Typography sx={{ fontWeight: 1000, fontSize: '0.6rem', color: COLORS.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      CASE: {p.row._caseGroupSize} DAYS
    </Typography>
  );
}
```

**Done when**: In Cases view, each case group is preceded by a visually distinct header row showing pet name, service(s), day range, and date range. Groups are separated by a 2px accent top border.

---

### Task 9: Date section headers — date separators in Visits mode

**File**: `VetConnect-Admin/src/features/Records/Records.jsx`

**What**: In `viewMode === 'visit'`, insert visual date separator rows when the date changes between records. Rendered as a styled row spanning all columns with accent text on cream background.

**Where**: Enhance the `groupedRecords` useMemo (or create a new `displayRecords` useMemo) to inject synthetic date header rows.

**How**:

Since DataGrid doesn't natively support section headers, implement this via `getRowClassName` + a synthetic date header approach:

(a) Create a `displayRecords` useMemo that wraps `groupedRecords` and injects date markers:
```js
const displayRecords = useMemo(() => {
  if (viewMode === 'case') return groupedRecords;
  
  const result = [];
  let lastDateStr = null;
  
  groupedRecords.forEach(r => {
    const dateStr = r.jsCreatedAt
      ? r.jsCreatedAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()
      : 'UNKNOWN DATE';
    
    if (dateStr !== lastDateStr) {
      // Insert a synthetic date header row
      result.push({
        id: `date-header-${dateStr}-${r.id}`,
        _isDateHeader: true,
        _dateLabel: dateStr,
        // DataGrid requires all fields to exist to avoid warnings
        petName: '', ownerName: '', status: '', services: [],
      });
      lastDateStr = dateStr;
    }
    result.push(r);
  });
  
  return result;
}, [groupedRecords, viewMode]);
```

(b) Use `displayRecords` as the DataGrid `rows` prop instead of `groupedRecords`.

(c) Add `getRowHeight` to make date header rows shorter:
```js
getRowHeight={(params) => {
  if (params.row._isDateHeader) return 32;
  return 70;
}}
```

(d) Add `getRowClassName` for date headers:
```js
// Enhance existing getRowClassName:
getRowClassName={(params) => {
  if (params.row._isDateHeader) return 'date-header-row';
  if (viewMode === 'case' && params.row._isCaseHeader && params.row._caseLabel) return 'case-header';
  if (viewMode === 'case' && !params.row._isCaseHeader) return 'case-continuation';
  return '';
}}
```

(e) Style date header rows in DataGrid `sx`:
```js
'& .date-header-row': {
  bgcolor: '#FFF8E1 !important',
  borderTop: `2px solid ${COLORS.accentLight}`,
  borderBottom: 'none !important',
  pointerEvents: 'none',
},
```

(f) In the first visible column (e.g., `lineage` or `jsCreatedAt`), detect date header rows and render the full-width label. Use `colSpan` if DataGrid supports it, or render the label in the `jsCreatedAt` column:
```js
// In the jsCreatedAt column renderCell:
if (p.row._isDateHeader) {
  return (
    <Typography sx={{ fontWeight: 1000, fontSize: '0.7rem', color: COLORS.accent, letterSpacing: 1, textTransform: 'uppercase' }}>
      {p.row._dateLabel}
    </Typography>
  );
}
```

(g) All other columns return `null` for `_isDateHeader` rows.

(h) Date header rows must not be selectable or clickable:
```js
isRowSelectable={(params) => !params.row._isDateHeader && ['pending', 'confirmed'].includes(params.row.status?.toLowerCase?.())}
```

(i) Update record count display (line 727) to exclude date header rows:
```js
// Use groupedRecords.length (original, no synthetic rows) instead of displayRecords.length
```

**Done when**: In Visits mode, date separators appear between rows when the date changes: "MONDAY, MAY 5" / "SUNDAY, MAY 4". Cream background, accent text, uppercase. Not clickable, not selectable. Do not appear in Cases mode.

---

### Task 10: Verification checkpoint — full acceptance criteria

After both days, verify:

| # | Check | Done when |
|---|-------|-----------|
| 1 | Tab count | Exactly 3 tabs: PENDING, ACTIVE, COMPLETED |
| 2 | PENDING tab | Shows only pending + confirmed appointments; checkbox selection works |
| 3 | ACTIVE tab | Shows arrived, in-consult, on-hold, dispensing, billing, confined |
| 4 | COMPLETED tab | Shows completed, carried-over, cancelled, no-show |
| 5 | Page title | Header reads "VISIT LOG", sidebar reads "Visit Log" |
| 6 | Row click (ACTIVE) | Clicking a row opens audit popover |
| 7 | Row click (COMPLETED) | Clicking a row opens audit popover |
| 8 | Row click (PENDING) | Clicking a row toggles checkbox, NOT audit |
| 9 | KPI strip (PENDING) | Shows "N pending / N confirmed" chips |
| 10 | KPI strip (ACTIVE) | Shows 6 status count chips |
| 11 | KPI strip (COMPLETED) | Shows 4 status count chips |
| 12 | Case view headers | Case groups separated by header row with pet name, service, day range, dates |
| 13 | Date headers (Visits) | Date separators between rows when date changes |
| 14 | Date headers (Cases) | NOT shown in Cases mode |
| 15 | Action column (PENDING) | 3 icons: Audit, CRM, Print |
| 16 | Action column (ACTIVE/COMPLETED) | 2 icons: CRM, Print |
| 17 | Copy ID removed | No Copy Visit ID button anywhere |
| 18 | Dead code | `setGroupSiblings` / `setLoadingGroupSiblings` removed from handleCloseAudit |
| 19 | No visitGroupId refs | Grep confirms 0 matches (already clean from T4.172) |
| 20 | Build clean | `npm run build` succeeds with zero errors |
| 21 | Search placeholder | Reads "Search visits..." not "Search records..." |
| 22 | Saved presets | Old presets (TRIAGE, etc.) load gracefully (fallback to PENDING tab) |

---

## Risk Assessment

1. **DataGrid synthetic rows for date headers**: MUI DataGrid expects uniform row shapes. Synthetic date header rows with empty fields may cause console warnings if columns reference fields that don't exist. Mitigation: add defensive guards (`if (p.row._isDateHeader) return null`) to every column `renderCell`.

2. **Row click vs checkbox on PENDING**: DataGrid's built-in checkbox selection listens to row click events. Setting `onRowClick` + `checkboxSelection` together could cause double-handling. Mitigation: `onRowClick` returns early for `activeTab === 0`, and `disableRowSelectionOnClick` is false only on PENDING tab.

3. **Saved presets referencing old silo names**: Users may have saved filter presets with `activeSilo: 'TRIAGE'`. Mitigation: `SILO_MAP.indexOf('TRIAGE')` returns -1, clamped to 0 (PENDING). The presets degrade gracefully — wrong tab, but no crash.

4. **Popover anchor on row click**: `handleOpenAudit(event, row)` uses `event.currentTarget` as anchor. For DataGrid `onRowClick`, `event.currentTarget` is the row element, so the popover anchors to the row. This is actually better UX than anchoring to a tiny icon button.

5. **Performance of date header injection**: The `displayRecords` useMemo iterates all records to inject date headers. With `limit(500)` in the hook, this is at most 500 + ~30 date headers = 530 rows. No performance concern.

---

## Files Modified

| File | Changes |
|------|---------|
| `VetConnect-Admin/src/features/Records/hooks/useGlobalRecords.js` | 3-silo definitions (Task 1) |
| `VetConnect-Admin/src/features/Records/Records.jsx` | SILO_MAP, tabs, title, search placeholder, action column, row click, KPI strip, case headers, date headers, dead code cleanup (Tasks 2-9) |
| `VetConnect-Admin/src/components/Sidebar.jsx` | Menu item rename (Task 3) |

---

## Estimated Effort

| Day | Tasks | Effort |
|-----|-------|--------|
| Day 1 | Tasks 1-5 (silo defs, tab restructure, rename, action cleanup, dead code) | ~2 hrs |
| Day 2 | Tasks 6-9 (row-click audit, KPI strip, case headers, date headers) | ~1.5 hrs |
| **Total** | | **~3.5 hrs** |
