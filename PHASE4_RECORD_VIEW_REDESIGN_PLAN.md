# T4.167 — Admin PatientDashboard Record View Redesign

## Overview

Restructure the expanded medical record view in `PatientDashboard.jsx` to follow standard SOAP ordering (S-O-A-P) with Assessment as the visual hero, collapsible Objective, compact 7-vital grid, per-diagnosis notes input in `SoapGrid.jsx`, and header/action bar improvements. The ~700-line `processedHistory.map()` block (lines 1426-2171) is the primary target.

**Architectural decisions (locked):**
- SOAP order: S -> O (collapsible) -> A (hero) -> P -> Discharge Notes
- Assessment = visual hero (large bold diagnosis text, not chips)
- Per-diagnosis notes: hidden "add note" TextField per dx in SoapGrid
- "ASSESSMENT NOTES" label for free-text reasoning block
- Status + Prognosis merged into one line
- Plan: remove green accent, consistent styling
- "DISCHARGE NOTES" rename (from Going-Home Instructions)
- Discharge: cream background, no bordered box, diagnosis NOT repeated
- Amendment button in record header (always visible)
- Service chips overflow: 1-3 inline, 4+ collapse
- "All Types" -> "All Departments"
- Compact action row: Print + Attachments + Rebook

**No external blockers.** No Blaze upgrade needed. No new npm packages.

---

## Day 1 (~2.5 hrs): SOAP Reorder + Visual Hierarchy + Header Actions

### Files touched: `PatientDashboard.jsx` only (except Step 1 adds a utility function to examUtils.js)

---

### Step 1 — Add `examSummaryLine()` helper to examUtils.js

**What:** Add a one-line summary builder for collapsed Objective display.

**Where:** `VetConnect-Admin/src/utils/examUtils.js` — add after `resolveObjectiveText()` (after line 162).

**How:** New exported function:

```js
/**
 * Returns a compact one-line summary for collapsed Objective display.
 * Example: "Dental: Grade 0 · Hydration: Normal · MM: Pink/Moist"
 */
export function examSummaryLine(exam) {
  if (!exam) return null;
  const parts = [];
  if (exam.dental?.grade != null) {
    parts.push(`Dental: Grade ${exam.dental.grade}`);
  }
  if (exam.hydration?.status) {
    const label = HYDRATION_OPTIONS.find(h => h.value === exam.hydration.status)?.label || exam.hydration.status;
    parts.push(`Hydration: ${label}`);
  }
  if (exam.mucousMembranes?.status) {
    const label = MEMBRANE_OPTIONS.find(m => m.value === exam.mucousMembranes.status)?.label || exam.mucousMembranes.status;
    parts.push(`MM: ${label}`);
  }
  const abnormalCount = (exam.systems || []).filter(s => s.status === 'abnormal').length;
  if (abnormalCount > 0) {
    parts.push(`${abnormalCount} abnormal finding${abnormalCount > 1 ? 's' : ''}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
```

**Why:** The collapsed Objective needs a compact preview. This avoids inline logic in the JSX.

**Depends on:** Nothing.

**Done when:** `examSummaryLine(createDefaultExam())` returns `"Dental: Grade 0 · Hydration: Normal · MM: Pink/Moist (normal)"`.

---

### Step 2 — Add `collapsedObjectives` state to PatientDashboard

**What:** Add a Set to track which record indices have their Objective section expanded (default: collapsed).

**Where:** `PatientDashboard.jsx` — near the existing `expandedRecords` state (search for `const [expandedRecords`).

**How:** Add one line:

```js
const [expandedObjectives, setExpandedObjectives] = useState(new Set());
```

Add a toggle helper nearby:

```js
const toggleObjective = (index) => {
  setExpandedObjectives(prev => {
    const next = new Set(prev);
    next.has(index) ? next.delete(index) : next.add(index);
    return next;
  });
};
```

**Why:** Objective is verbose (body systems text) and rarely re-read. Default collapsed with expand toggle.

**Depends on:** Nothing.

**Done when:** State declared, toggle function exists.

---

### Step 3 — Import `examSummaryLine` in PatientDashboard

**What:** Add import for the new helper.

**Where:** `PatientDashboard.jsx` line 16 — update the existing import:

```js
// BEFORE:
import { resolveObjectiveText, hasExamData } from '../../utils/examUtils';

// AFTER:
import { resolveObjectiveText, hasExamData, examSummaryLine } from '../../utils/examUtils';
```

**Depends on:** Step 1.

**Done when:** Import compiles without error.

---

### Step 4 — Service chips overflow (1-3 inline, 4+ collapse)

**What:** Replace the current `.map()` of all service chips (lines 1467-1473) with an overflow pattern: show first 3 chips inline, 4+ collapses with "+N more" toggle.

**Where:** `PatientDashboard.jsx` lines 1466-1473.

**How:** Replace the current service chips block with:

```jsx
{/* T4.167: Service chips — 1-3 inline, 4+ collapses */}
{(() => {
  const svcNames = rec.serviceNames?.length > 0 ? rec.serviceNames : [rec.serviceType || rec.recordType || 'medical'];
  const showAll = expandedServiceChips.has(index);
  const visible = showAll ? svcNames : svcNames.slice(0, 3);
  return (
    <>
      {visible.map((svcName, si) => (
        <Box key={si} sx={{ px: 0.75, py: 0.2, borderRadius: 0, bgcolor: `${rc}12`, textAlign: 'center' }}>
          <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', fontWeight: 800, color: rc, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {svcName}
          </Typography>
        </Box>
      ))}
      {svcNames.length > 3 && !showAll && (
        <Typography
          component="span"
          onClick={(e) => { e.stopPropagation(); setExpandedServiceChips(prev => { const n = new Set(prev); n.add(index); return n; }); }}
          sx={{ fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, color: COLORS.accent, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          +{svcNames.length - 3} more
        </Typography>
      )}
      {svcNames.length > 3 && showAll && (
        <Typography
          component="span"
          onClick={(e) => { e.stopPropagation(); setExpandedServiceChips(prev => { const n = new Set(prev); n.delete(index); return n; }); }}
          sx={{ fontFamily: FONT, fontSize: '0.6rem', fontWeight: 800, color: COLORS.textMuted, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          show less
        </Typography>
      )}
    </>
  );
})()}
```

Also add state near other record-level states:

```js
const [expandedServiceChips, setExpandedServiceChips] = useState(new Set());
```

**Depends on:** Nothing.

**Done when:** Records with <=3 services show all chips. Records with 4+ services show first 3 + "+N more" link that expands on click.

---

### Step 5 — Amendment button moved to header row

**What:** Move the Amendment button from its current position (lines 2056-2081, inside expanded body) into the header row (line 1540, after vet name, before expand icon).

**Where:** `PatientDashboard.jsx` — two locations:

1. **ADD** in header row (after the `rec.vetName` Typography at line 1540, before the expand icon):

```jsx
{/* T4.167: Amendment button in header — always visible for sealed records */}
{rec.legal?.isLocked === true && rec.appointmentId && (
  <Button
    size="small"
    startIcon={<ShieldIcon sx={{ fontSize: 11 }} />}
    onClick={(e) => {
      e.stopPropagation();
      setAmendTargetApptId(rec.appointmentId);
      setAmendDialogOpen(true);
    }}
    sx={{
      fontFamily: FONT, fontWeight: 900, fontSize: '0.62rem', textTransform: 'uppercase',
      color: COLORS.warning, borderRadius: 0, py: 0, px: 0.75, minWidth: 0,
      '&:hover': { bgcolor: COLORS.warningSurface },
      flexShrink: 0,
    }}
  >
    Amend
  </Button>
)}
```

2. **REMOVE** the old Amendment button block (lines 2056-2081).

**Depends on:** Nothing.

**Done when:** "AMEND" button shows in the collapsed header row for sealed records. Old button location removed. Clicking works — opens AmendmentDialog.

---

### Step 6 — SOAP reorder: S -> O (collapsible) -> Vitals grid -> A (hero) -> P -> Discharge Notes

This is the main restructuring step. Replace the expanded body content (lines 1548-1786 in the left column `Grid size={{ xs: 12, md: 8 }}>`) with the new order.

**Where:** `PatientDashboard.jsx` — the `<Stack spacing={1.5}>` inside the left `Grid` column (lines 1549-1786).

**How:** Rewrite the Stack contents in this order:

#### 6a — Intake Notes (unchanged, stays first)
Keep the existing intake context block (lines 1551-1567) as-is.

#### 6b — SUBJECTIVE
Change label from "Subjective" to "SUBJECTIVE". Remove the sentence-case:

```jsx
<Box>
  <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
    Subjective
  </Typography>
  {/* Content unchanged */}
</Box>
```

**Current code (line 1569):**
```jsx
<Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5 }}>Subjective</Typography>
```

The TYPE.label already applies textTransform uppercase in designTokens, so verify. If not, add `textTransform: 'uppercase'`. The label text stays "Subjective" — TYPE.label handles the visual uppercase.

#### 6c — OBJECTIVE (collapsible)
Replace the current Objective block (lines 1572-1574) with:

```jsx
{/* T4.167: OBJECTIVE — collapsible, default collapsed */}
<Box>
  <Box
    onClick={(e) => { e.stopPropagation(); toggleObjective(index); }}
    sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', mb: 0.5 }}
  >
    <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted }}>
      Objective
    </Typography>
    {hasO && !expandedObjectives.has(index) && examSummaryLine(rec.objectiveExam) && (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.72rem', color: COLORS.textMuted, fontStyle: 'italic', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        — {examSummaryLine(rec.objectiveExam)}
      </Typography>
    )}
    {hasO && (
      <Box sx={{ color: COLORS.textMuted }}>
        {expandedObjectives.has(index) ? <ExpandLessIcon sx={{ fontSize: 14 }} /> : <ExpandMoreIcon sx={{ fontSize: 14 }} />}
      </Box>
    )}
  </Box>
  <Collapse in={expandedObjectives.has(index) || !hasO} timeout={150}>
    <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: hasO ? COLORS.textPrimary : COLORS.textMuted, whiteSpace: 'pre-wrap', pl: 1.5, borderLeft: `2px solid ${COLORS.borderLight}`, fontStyle: hasO ? 'normal' : 'italic' }}>
      {hasO ? resolveObjectiveText(rec) : '—'}
    </Typography>
  </Collapse>
</Box>
```

#### 6d — VITALS (compact 7-vital grid, inline below Objective)

Move the vitals display from the right sidebar (lines 1790-1802) into the left column, right after Objective. Show ALL 7 vitals always — missing ones show "not taken" in muted italic.

```jsx
{/* T4.167: Compact 7-vital grid — all vitals always shown */}
<Box sx={{ bgcolor: COLORS.vitalsBg, py: 1, px: 1.5, borderRadius: 0, border: `1px solid ${COLORS.borderLight}` }}>
  <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.75 }}>Vitals</Typography>
  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5 }}>
    {[
      { label: 'Wt',   value: rv.weight, unit: 'kg' },
      { label: 'Temp', value: rv.temp,   unit: '°C' },
      { label: 'HR',   value: rv.hr,     unit: 'bpm' },
      { label: 'RR',   value: rv.rr,     unit: 'br/min' },
      { label: 'CRT',  value: rv.crt,    unit: 'sec' },
      { label: 'BCS',  value: rv.bcs,    unit: '/9' },
      { label: 'Pain', value: rv.pain,   unit: '/10' },
    ].map(({ label, value, unit }) => (
      <Box key={label}>
        <Typography sx={{ fontFamily: FONT, fontSize: '0.65rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>{label}</Typography>
        {value != null && value !== '' ? (
          <Typography sx={{ fontFamily: FONT, ...TYPE.emphasis, color: COLORS.textPrimary }}>
            {value} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: COLORS.textMuted }}>{unit}</span>
          </Typography>
        ) : (
          <Typography sx={{ fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textMuted, fontStyle: 'italic' }}>
            not taken
          </Typography>
        )}
      </Box>
    ))}
  </Box>
</Box>
```

#### 6e — ASSESSMENT (hero)

Replace the current Assessment block (lines 1576-1612) with the hero treatment:

```jsx
{/* T4.167: ASSESSMENT — hero diagnoses + notes + status/prognosis */}
{(rec.diagnoses?.length > 0 || rec.soap?.assessment || rec.assessmentNotes) && (
  <Box>
    <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.75 }}>
      Assessment
    </Typography>

    {/* Hero diagnosis blocks */}
    {rec.diagnoses?.length > 0 && (
      <Stack spacing={1} sx={{ mb: 1, pl: 1.5, borderLeft: `2px solid ${COLORS.borderLight}` }}>
        {rec.diagnoses.map((dx, i) => (
          <Box key={dx.catalogId || i}>
            <Typography sx={{ fontFamily: FONT, fontSize: '1.05rem', fontWeight: 900, color: COLORS.textPrimary, lineHeight: 1.3 }}>
              {dx.name}
              {dx.severity && (
                <Typography component="span" sx={{ fontFamily: FONT, fontSize: '0.8rem', fontWeight: 700, color: COLORS.warning, ml: 1 }}>
                  {dx.severity}
                </Typography>
              )}
            </Typography>
            {dx.notes && (
              <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', color: COLORS.textMuted, fontStyle: 'italic', mt: 0.25 }}>
                {dx.notes}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
    )}

    {/* T4.167: Status + Prognosis merged into one line */}
    {(rec.patientStatus || rec.soap?.prognosis) && (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.78rem', fontWeight: 700, color: COLORS.textSecondary, mb: 0.75 }}>
        {rec.patientStatus || 'Stable'} · Prognosis: {rec.soap?.prognosis || 'Good'}
      </Typography>
    )}

    {/* T4.167: ASSESSMENT NOTES — free-text clinical reasoning */}
    {(rec.assessmentNotes || (!rec.diagnoses?.length && rec.soap?.assessment)) && (
      <Box sx={{ mt: 0.5 }}>
        <Typography sx={{ fontFamily: FONT, fontSize: '0.62rem', fontWeight: 900, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.25 }}>
          Assessment Notes
        </Typography>
        <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textPrimary, whiteSpace: 'pre-wrap', pl: 1.5, borderLeft: `2px solid ${COLORS.borderLight}` }}>
          {rec.assessmentNotes || rec.soap?.assessment}
        </Typography>
      </Box>
    )}
  </Box>
)}
```

#### 6f — PLAN (remove green accent)

Replace the current Plan block (lines 1614-1617):

```jsx
{/* T4.167: PLAN — consistent styling, no green accent */}
<Box>
  <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.5 }}>
    Plan
  </Typography>
  <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: hasT ? COLORS.textPrimary : COLORS.textMuted, whiteSpace: 'pre-wrap', pl: 1.5, borderLeft: `2px solid ${COLORS.borderLight}`, fontStyle: hasT ? 'normal' : 'italic' }}>
    {hasT ? rec.treatment : '—'}
  </Typography>
</Box>
```

Key change: removes `bgcolor: COLORS.planBg`, removes `borderLeft: 3px solid ${COLORS.planBorder}`, removes `color: COLORS.planText`. Uses same styling as Subjective (muted border-left, standard text color).

#### 6g — DISCHARGE NOTES (rename + restyle)

Replace the current Going-Home Instructions block (lines 1618-1698):

```jsx
{/* T4.167: DISCHARGE NOTES — full-width cream, no bordered box */}
{rec.dischargeSummary && (
  <Box sx={{ bgcolor: COLORS.cream, mx: -3, px: 3, py: 1.5 }}>
    <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      Discharge Notes
    </Typography>
    {/* T4.167: Diagnosis NOT repeated here — shown once in Assessment hero */}
    {rec.dischargeSummary.instructions && (
      <Stack spacing={0.25} sx={{ mb: 0.75 }}>
        {rec.dischargeSummary.instructions
          .split('\n')
          .filter(line => line.trim())
          .map((line, i) => (
            <Typography key={i} sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textPrimary }}>
              — {line.trim()}
            </Typography>
          ))}
      </Stack>
    )}
    {rec.dischargeSummary.medications?.length > 0 && (
      <Stack spacing={0.25} sx={{ mb: 0.75 }}>
        {rec.dischargeSummary.medications.map((med, i) => (
          <Typography key={i} sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textPrimary }}>
            <Typography component="span" sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary }}>
              {med.name}
            </Typography>
            {med.qty ? ` x${med.qty}` : ''}
            {med.instructions ? ` — ${med.instructions}` : ''}
          </Typography>
        ))}
      </Stack>
    )}
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
    {rec.dischargeSummary.nextVisit && (
      <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.danger, mb: 0.25 }}>
        Follow-up: {rec.dischargeSummary.nextVisit}
      </Typography>
    )}
    {rec.dischargeSummary.recheckIn && (
      <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.textSecondary, mb: 0.25 }}>
        Recheck in: {rec.dischargeSummary.recheckIn}
      </Typography>
    )}
    {rec.dischargeSummary.vetName && (
      <Typography sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, mt: 0.5 }}>
        Signed by {rec.dischargeSummary.vetName}
      </Typography>
    )}
  </Box>
)}
{/* nextVisit fallback when dischargeSummary absent — keep as-is */}
{!rec.dischargeSummary && rec.nextVisit && (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, p: 1, bgcolor: COLORS.warningSurface, border: `1px solid ${COLORS.peach}`, borderRadius: 0 }}>
    <CalendarMonthIcon sx={{ fontSize: 14, color: COLORS.warning }} />
    <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.warning, fontWeight: 700 }}>
      Follow-up:{' '}
      {rec.nextVisit?.toDate
        ? rec.nextVisit.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : rec.nextVisit}
    </Typography>
  </Box>
)}
```

Key changes:
- Label: "DISCHARGE NOTES" (was "Going-Home Instructions")
- `bgcolor: COLORS.cream` with `mx: -3, px: 3` (negative margin to go full-width past parent padding)
- Removed `border: 1px solid ${COLORS.peach}` (cream background IS the separator)
- Removed `rec.dischargeSummary.diagnosis` rendering (no longer repeated)

#### 6h — Lab Results block

Keep the existing lab results block (lines 1699-1785) exactly as-is in the left column, after Discharge Notes. Its position in the left column is correct (diagnostic data).

#### 6i — Right sidebar: remove Vitals (moved to left column)

In the right sidebar `Grid size={{ xs: 12, md: 4 }}>` (lines 1788-1927):
- **REMOVE** the vitals block (lines 1790-1802) — it's now inline in the left column.
- Keep Rx, Supplies, Other Items, Attachments in the right sidebar (these are dispensing/artifact data, not SOAP content).

**Depends on:** Steps 1, 2, 3.

**Done when:** Expanded record shows: Intake Notes -> SUBJECTIVE -> OBJECTIVE (collapsed with summary, expand toggle) -> Vitals (always 7 rows) -> ASSESSMENT (hero: large bold dx names + severity + notes subtitle + merged status/prognosis + Assessment Notes box) -> PLAN (no green accent) -> DISCHARGE NOTES (cream full-width, no diagnosis dupe). Right sidebar has Rx/supplies/attachments only, no vitals.

---

### Step 7 — Remove patientStatus badge from header row

**What:** The patient status badge (lines 1511-1537) is now rendered in the Assessment section (merged Status + Prognosis line). Remove it from the header to avoid duplication.

**Where:** `PatientDashboard.jsx` lines 1510-1537.

**How:** Delete the entire `{rec.patientStatus && (() => { ... })()}` block from the header row.

**Depends on:** Step 6e.

**Done when:** No status badge in collapsed header. Status shows in Assessment section when expanded.

---

### Verification Checkpoint — Day 1

1. Open any patient with medical records in the admin dashboard.
2. Collapsed record: shows date + service chips (3 max + overflow) + primary diagnosis + case day badge + vitals preview + Rx icon + vet name + AMEND button (if sealed) + expand icon.
3. Expanded record left column: Intake -> SUBJECTIVE -> OBJECTIVE (collapsed with summary line, clicks to expand) -> Vitals (7 slots, missing = "not taken") -> ASSESSMENT hero (large bold dx + severity + dx.notes + merged status/prognosis + Assessment Notes) -> PLAN (no green) -> DISCHARGE NOTES (cream, no dx dupe) -> Lab Results.
4. Expanded record right column: Rx + Supplies + Other Items + Attachments (no vitals — moved).
5. Amendment button works from header — opens AmendmentDialog.
6. Service chips: test with a record having 5+ services — shows 3 + "+2 more".
7. No `alert()`, `confirm()`, `prompt()` calls.

---

## Day 2 (~1.5-2 hrs): Per-Diagnosis Notes Input + Action Row + Filter Label

### Step 8 — Per-diagnosis notes TextField in SoapGrid

**What:** Add a compact "add note" button per diagnosis in SoapGrid's Assessment quadrant. Clicking it reveals a TextField. Populates `dx.notes`.

**Where:** `SoapGrid.jsx` — after the severity selectors block (line 251), before the free-text Assessment Notes TextField (line 253).

**How:** Add between line 251 and line 253:

```jsx
{/* T4.167: Per-diagnosis clinical notes — hidden by default, "add note" reveals */}
{(soapData.diagnoses || []).map((dx, idx) => {
  const hasNote = !!dx.notes;
  return (
    <Box key={`note-${dx.catalogId || idx}`} sx={{ mb: 0.5 }}>
      {!hasNote && !dx._showNoteField && (
        <Typography
          component="span"
          onClick={() => {
            if (disabled) return;
            const updated = [...(soapData.diagnoses || [])];
            updated[idx] = { ...updated[idx], _showNoteField: true };
            updateSoap('diagnoses', updated);
          }}
          sx={{
            fontFamily: FONT, fontSize: '0.65rem', fontWeight: 700,
            color: COLORS.accent, cursor: disabled ? 'default' : 'pointer',
            textTransform: 'uppercase', letterSpacing: '0.03em',
            '&:hover': { textDecoration: disabled ? 'none' : 'underline' },
          }}
        >
          + add note for {dx.name.length > 25 ? `${dx.name.slice(0, 25)}...` : dx.name}
        </Typography>
      )}
      {(hasNote || dx._showNoteField) && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pl: 1 }}>
          <Typography sx={{
            fontFamily: FONT, fontSize: '0.65rem', fontWeight: 900,
            color: COLORS.textMuted, minWidth: 100, textTransform: 'uppercase',
            pt: 0.5,
          }}>
            {dx.name.length > 20 ? `${dx.name.slice(0, 20)}...` : dx.name}
          </Typography>
          <TextField
            size="small" variant="standard" fullWidth
            placeholder="Clinical notes for this diagnosis..."
            value={dx.notes || ''}
            onChange={(e) => {
              if (disabled) return;
              const updated = [...(soapData.diagnoses || [])];
              updated[idx] = { ...updated[idx], notes: e.target.value };
              updateSoap('diagnoses', updated);
            }}
            InputProps={{
              disableUnderline: true,
              sx: { fontFamily: FONT, fontSize: '0.8rem', color: COLORS.textMuted, fontStyle: 'italic' },
            }}
            disabled={disabled}
          />
        </Box>
      )}
    </Box>
  );
})}
```

**Important:** The `_showNoteField` is a transient UI flag on the dx object. It does NOT get written to Firestore because the medical record write path at CW line 1798-1804 explicitly maps only `name`, `catalogId`, `category`, `severity`, `notes` — the underscore-prefixed key is excluded.

**Depends on:** Nothing.

**Done when:** In ClinicalWorkspace Assessment quadrant, each diagnosis shows "+ add note for [name]" link. Clicking reveals a TextField. Typing populates dx.notes. The notes persist through draft saves (already written via `diagnoses: soapData.diagnoses || []` at CW line 2187). The notes appear on the signed medical record (CW line 1803: `notes: d.notes || ''`).

---

### Step 9 — Verify ClinicalWorkspace dx.notes write-through

**What:** Verify that `dx.notes` is already written through to the medical record at sign-off.

**Where:** `ClinicalWorkspace.jsx` line 1798-1804.

**How:** The write path already includes `notes: d.notes || ''` at line 1803. The draft save at line 2187 writes `diagnoses: soapData.diagnoses || []` which includes the full dx objects with notes. **No code change needed** — this step is a verification checkpoint.

Also verify the draft restore path at line 2250: `diagnoses: d.diagnoses || []` — this restores the full dx objects including notes. Confirmed.

**Depends on:** Step 8.

**Done when:** Verified by reading CW lines 1803 and 2250. Both paths include dx.notes.

---

### Step 10 — Compact action row (Print + Attachments + Rebook)

**What:** Replace the current footer (lines 2141-2165) with a compact three-button row: Print, Attachments, Rebook.

**Where:** `PatientDashboard.jsx` — replace the record footer block (lines 2141-2165).

**How:**

```jsx
{/* T4.167: Compact action row — Print + Attachments + Rebook */}
<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5, pt: 1, borderTop: `1px solid ${COLORS.borderLight}` }}>
  <Button
    size="small"
    startIcon={<PrintIcon sx={{ fontSize: '14px !important' }} />}
    onClick={(e) => {
      e.stopPropagation();
      setPrintMenuAnchor(e.currentTarget);
      setPrintMenuRecord(rec);
    }}
    sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', textTransform: 'none', color: COLORS.accent }}
  >
    Print
  </Button>
  {rec.attachments?.length > 0 && (
    <Button
      size="small"
      startIcon={<AttachFileIcon sx={{ fontSize: '14px !important' }} />}
      sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', textTransform: 'none', color: COLORS.textSecondary }}
      onClick={(e) => {
        e.stopPropagation();
        // Scroll to attachments section within this record (already rendered in sidebar)
        const attachEl = recordRefs.current[index]?.querySelector('[data-attachments]');
        if (attachEl) attachEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }}
    >
      Attachments ({rec.attachments.length})
    </Button>
  )}
  <Box sx={{ flex: 1 }} />
  <Button
    size="small"
    disabled={isErased}
    startIcon={<EventAvailableIcon sx={{ fontSize: '14px !important' }} />}
    onClick={(e) => { e.stopPropagation(); setQuickBookOpen(true); }}
    sx={{ fontFamily: FONT, fontWeight: 700, fontSize: '0.72rem', textTransform: 'none', color: COLORS.success }}
  >
    Rebook
  </Button>
</Box>
```

Also add `data-attachments` to the attachments section in the right sidebar for scroll targeting:

At the attachments Box (line 1868), add:

```jsx
<Box data-attachments sx={{ bgcolor: COLORS.formBg, ... }}>
```

**Depends on:** Nothing.

**Done when:** Record footer shows [Print] [Attachments (N)] on left, [Rebook] on right. The old "Print ▾" text is now just "Print" (the menu still opens). Attachments button only shows when attachments exist. Rebook is right-aligned.

---

### Step 11 — "All Types" -> "All Departments" filter label

**What:** Change the filter dropdown label.

**Where:** `PatientDashboard.jsx` line 1190.

**How:**

```jsx
// BEFORE:
<MenuItem value="All" sx={{ fontSize: '0.85rem' }}>All Types</MenuItem>

// AFTER:
<MenuItem value="All" sx={{ fontSize: '0.85rem' }}>All Departments</MenuItem>
```

**Depends on:** Nothing.

**Done when:** The timeline filter dropdown shows "All Departments" as the first option.

---

### Verification Checkpoint — Day 2

1. In ClinicalWorkspace: add a diagnosis, click "+ add note", type text, save draft, reload — notes persists.
2. Sign off a consult with per-diagnosis notes, open the record in PatientDashboard — dx.notes shows as italic subtitle under each bold diagnosis name.
3. Action row: Print opens the print menu. Attachments button shows count and scrolls. Rebook opens WalkInModal.
4. Filter dropdown: first option reads "All Departments".
5. Verify no regression on:
   - Amendment rendering (both structured and legacy text amendments)
   - Vaccination details section
   - Lab results rendering
   - Right sidebar Rx/Supplies/Attachments

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `_showNoteField` transient flag leaking to Firestore | The write paths at CW lines 1798-1804 and 2187 explicitly map/spread the diagnosis objects. The sign-off path maps only `name`, `catalogId`, `category`, `severity`, `notes`. The draft save writes the full object but `_showNoteField` is harmless metadata — it just pre-opens the field on draft restore. |
| Negative margin `mx: -3` on Discharge Notes breaking layout | The parent `<Box sx={{ px: 3 }}>` at line 1546 provides 3 units of padding. The `mx: -3, px: 3` on the cream section expands to full width. If the parent padding changes, this breaks. Use a comment to tie them together. |
| Vitals removal from right sidebar breaking responsive layout | The right sidebar still has Rx + Supplies + Attachments. If all are empty, the sidebar column renders but is visually empty. This is acceptable — the sidebar serves the same purpose as before, just without vitals. |
| Status badge removed from header | Status is now in Assessment (merged line). Records without Assessment section (e.g., grooming records with no diagnosis) will not show status. This is by design — grooming records don't have a clinical status. |

## Testing Strategy

**Manual QA checklist:**
- [ ] Record with 1 diagnosis, no severity, no notes
- [ ] Record with 3+ diagnoses, each with severity and notes
- [ ] Record with 5+ services (overflow test)
- [ ] Record with no diagnosis (grooming visit) — no Assessment hero
- [ ] Record with assessmentNotes but no structured diagnoses (legacy)
- [ ] Record with physical exam data — Objective shows collapsed summary, expands on click
- [ ] Record with no physical exam — Objective shows "—", no expand toggle
- [ ] Sealed record — AMEND button visible in header
- [ ] Unsealed record — no AMEND button
- [ ] Record with dischargeSummary — cream section, no diagnosis duplication
- [ ] Record without dischargeSummary but with nextVisit — fallback box shows
- [ ] Record with attachments — action row shows Attachments button
- [ ] Record without attachments — no Attachments button
- [ ] Print button — opens print menu with all options
- [ ] Rebook button — opens WalkInModal
- [ ] ClinicalWorkspace: per-dx note input -> draft save -> sign-off -> PatientDashboard displays notes
- [ ] Filter dropdown shows "All Departments"

## Estimated Effort

| Phase | Scope | Estimate |
|-------|-------|----------|
| Day 1 | Steps 1-7: examSummaryLine, state, SOAP reorder, hero, vitals move, service overflow, header actions | ~2.5 hrs |
| Day 2 | Steps 8-11: per-dx notes in SoapGrid, CW verify, action row, filter label | ~1.5 hrs |
| **Total** | | **~4 hrs** |

Day 1 and Day 2 are sequential — Day 2's per-dx notes input builds on the hero display from Day 1.
