# A3 — Draft SOAP Recovery Banner

**Feature ID:** A3
**Module:** ClinicalWorkspace (admin, vet-facing)
**Estimated Effort:** Small — 60 to 90 minutes
**Scope:** Single file, one supporting CSS touch-up, low regression surface

---

## 1. Header

### Goal
Surface the existence of a previously-saved SOAP draft so the attending vet can make a deliberate choice to RESUME or DISCARD it, rather than having the draft silently hydrate into the form state with zero awareness (the current behaviour).

### In Scope
- Render a non-dismissible banner at the top of the SOAP 2x2 grid when a saved `soapDraft` exists
- Show metadata (author, relative age, first-line preview of Subjective and Vitals)
- Two actions: RESUME EDITING (apply the draft to form state) and DISCARD DRAFT (null out the draft on Firestore + emit a `DRAFT_DISCARDED` pulse event)
- Session-local suppression flag so the banner does not re-appear after the user explicitly resumes or discards
- Neubrutalist visual treatment consistent with the admin design language

### Out of Scope
- Adding auto-save logic — SAVE DRAFT is currently manual-only and remains so
- Admin Settings UI for draft retention windows (the 24-hour freshness cutoff is hardcoded in this plan)
- Draft authorship transfer (vet A drafting, vet B resuming) — we surface *who* saved it but do not block cross-vet resume
- Admin/settings controls for clearing drafts in bulk
- Push notifications or toast reminders
- Any change to `handleSaveDraft` itself or the SAVE DRAFT button
- Any change to how the consent-gated `handleSaveConsult` works

---

## 2. Critical Prerequisite Finding

**Architect's spec (paraphrased):** "`soapDraft` is written but never read back."

**Actual state of the code (verified):** `soapDraft` IS already read back on mount. See `VetConnect-Admin/src/components/ClinicalWorkspace.jsx` lines 390 to 425 — `fetchPatientContext` reads `patient.soapDraft` and, if present, hydrates `setSoapData(...)` silently with ZERO UI indication that the form state came from a draft rather than a fresh start.

**Implication:**
- The current behaviour is dangerous: if a vet opens the consult, sees partial data, and assumes it's live prior-visit data rather than an unsaved draft from a previous session, they can accidentally sign off on stale or incorrect information.
- A3 is therefore NOT "add a reader for an unread field" — it is "INTERCEPT the silent hydration path and gate it behind explicit user intent."

**The rewritten A3 contract:**
1. On mount, detect `patient.soapDraft` existence.
2. If a draft exists AND is recent (see §5), DO NOT auto-hydrate the form. Instead, initialize form state with the same "fresh defaults" path that runs when `draft` is null today (lines 416 to 425) and set banner visibility = true.
3. The banner exposes RESUME EDITING, which then runs the existing hydration logic (lines 394 to 415) and dismisses the banner.
4. DISCARD wipes the draft in Firestore, logs a pulse event, and dismisses the banner.
5. If a draft exists but is STALE (> 24h) or the appointment is not in an eligible status, fall through to the current auto-hydration path (or force-discard — see §5 decision).

---

## 3. File-by-File Change List

### 3.1 `VetConnect-Admin/src/components/ClinicalWorkspace.jsx` (~1,717 lines currently)

| Approximate region | Current content | Change |
|---|---|---|
| Top-of-file state (look for existing `useState` cluster ~lines 200-300) | Component-level state hooks | Add `const [draftBannerState, setDraftBannerState] = useState(null)` — holds `{ draft, savedAt, savedByName, savedByUid }` or `null` |
| `fetchPatientContext` lines 372 to 425 | Auto-hydrates from `patient.soapDraft` silently | Restructure: if draft exists AND passes eligibility (§5), set `draftBannerState` with snapshot metadata and run the FRESH-defaults branch (lines 416 to 425) instead of hydrating. If draft is stale or ineligible, keep current behaviour. |
| New function ~after `handleSaveDraft` (line 1079) | — | Add `handleResumeDraft()` — applies the captured `draftBannerState.draft` to `setSoapData(...)` via the exact same shape as lines 394-415, then `setDraftBannerState(null)` |
| New function immediately after `handleResumeDraft` | — | Add `handleDiscardDraft()` — opens a MUI `Dialog` confirm, on confirm writes `{ soapDraft: null, draftSavedAt: null, draftSavedBy: null, clinicalPulse: arrayUnion(...) }` with a `DRAFT_DISCARDED` pulse event, then `setDraftBannerState(null)` and `showToast("Draft discarded.", "success")` |
| Render region around line 1199 (just above `{lockedServices.has('medical') && <Alert.../>}`) | Alert stack above the 2x2 grid | Insert `<DraftRecoveryBanner />` above the existing locked-record Alert. Banner is rendered inline as JSX in this file (see §4.1 for JSX). |
| Imports | Existing imports | Add `Dialog`, `DialogTitle`, `DialogContent`, `DialogContentText`, `DialogActions` to the `@mui/material` import if not already present; add `WarningAmberIcon` from `@mui/icons-material/WarningAmber`; ensure `arrayUnion` is imported from `firebase/firestore` (grep to confirm — the file already uses it at line 967). |

### 3.2 `VetConnect-Admin/src/components/ClinicalWorkspace.css` (if present)

Optional — add `.draft-recovery-banner` keyframe for a subtle slide-in. Not required; inline `sx` will suffice. Skip unless the file already has a similar animation pattern in use.

---

## 4. Implementation Details

### 4.1 Banner JSX (inline in ClinicalWorkspace.jsx render)

```jsx
{draftBannerState && (
  <Box
    sx={{
      flexShrink: 0,
      mx: 2,
      mt: 1.5,
      mb: 1,
      p: 2,
      bgcolor: '#FFF7ED',
      border: `2px solid ${COLORS.warning}`,
      borderLeft: `6px solid ${COLORS.warning}`,
      boxShadow: `4px 4px 0 ${COLORS.brand}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
    }}
  >
    {/* Header row */}
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <WarningAmberIcon sx={{ color: COLORS.warning, fontSize: 22 }} />
      <Typography sx={{ ...TYPE.label, color: COLORS.brand, fontSize: '0.78rem' }}>
        UNSAVED DRAFT FOUND
      </Typography>
      <Typography sx={{ ...TYPE.meta, color: COLORS.textMuted, fontSize: '0.72rem', ml: 'auto' }}>
        saved {formatRelativeTime(draftBannerState.savedAt)} by {draftBannerState.savedByName}
      </Typography>
    </Box>

    {/* Preview (first 140 chars of subjective + vitals line) */}
    <Box sx={{ pl: 3.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      {draftBannerState.draft?.subjective && (
        <Typography sx={{ ...TYPE.body, color: COLORS.textSecondary, fontStyle: 'italic' }}>
          Subjective: "{truncate(draftBannerState.draft.subjective, 140)}"
        </Typography>
      )}
      {(draftBannerState.draft?.objTemp || draftBannerState.draft?.objHR || draftBannerState.draft?.objRR) && (
        <Typography sx={{ ...TYPE.meta, color: COLORS.textSecondary, fontFamily: 'monospace' }}>
          Vitals: {[
            draftBannerState.draft.objTemp && `T ${draftBannerState.draft.objTemp}°C`,
            draftBannerState.draft.objHR && `HR ${draftBannerState.draft.objHR}`,
            draftBannerState.draft.objRR && `RR ${draftBannerState.draft.objRR}`,
          ].filter(Boolean).join(' · ')}
        </Typography>
      )}
    </Box>

    {/* Action row */}
    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 0.5 }}>
      <Button
        variant="outlined"
        size="small"
        onClick={() => setDiscardConfirmOpen(true)}
        sx={{
          fontWeight: 900,
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: COLORS.danger,
          borderColor: COLORS.danger,
          borderRadius: 0,
          px: 2,
        }}
      >
        DISCARD DRAFT
      </Button>
      <Button
        variant="contained"
        size="small"
        onClick={handleResumeDraft}
        sx={{
          fontWeight: 900,
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          bgcolor: COLORS.cta,
          color: '#FFF',
          borderRadius: 0,
          boxShadow: `2px 2px 0 ${COLORS.brand}`,
          px: 2,
          '&:hover': { bgcolor: COLORS.ctaHover, boxShadow: `2px 2px 0 ${COLORS.brand}` },
        }}
      >
        RESUME EDITING
      </Button>
    </Box>
  </Box>
)}
```

### 4.2 Discard confirmation dialog

```jsx
<Dialog open={discardConfirmOpen} onClose={() => setDiscardConfirmOpen(false)}>
  <DialogTitle sx={{ ...TYPE.heading, color: COLORS.danger, fontWeight: 900, textTransform: 'uppercase' }}>
    Discard Draft?
  </DialogTitle>
  <DialogContent>
    <DialogContentText sx={{ ...TYPE.body, color: COLORS.textPrimary }}>
      Discard unsaved notes from {draftBannerState?.savedByName} saved {formatRelativeTime(draftBannerState?.savedAt)}?
      This cannot be undone and the draft will be permanently removed from the appointment record.
    </DialogContentText>
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setDiscardConfirmOpen(false)} sx={{ fontWeight: 800, color: COLORS.textSecondary }}>
      Cancel
    </Button>
    <Button
      onClick={async () => { await handleDiscardDraft(); setDiscardConfirmOpen(false); }}
      sx={{ fontWeight: 900, color: '#FFF', bgcolor: COLORS.danger, '&:hover': { bgcolor: '#B71C1C' } }}
    >
      Discard Permanently
    </Button>
  </DialogActions>
</Dialog>
```

### 4.3 `handleDiscardDraft` body

```javascript
const handleDiscardDraft = async () => {
  try {
    const apptRef = doc(db, "appointments", patient.id);
    const pulseEvent = {
      eventId: `pulse_draft_discard_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type: 'DRAFT_DISCARDED',
      timestamp: Timestamp.now(),
      staffId: auth.currentUser?.uid || 'unknown',
      staffName: auth.currentUser?.displayName || 'Authorized Clinician',
      note: `Draft discarded (was saved by ${draftBannerState.savedByName})`,
      discardedDraftSavedAt: draftBannerState.savedAt || null,
      discardedDraftSavedBy: draftBannerState.savedByUid || null,
    };
    await updateDoc(apptRef, {
      soapDraft: null,
      draftSavedAt: null,
      draftSavedBy: null,
      clinicalPulse: arrayUnion(pulseEvent),
    });
    setDraftBannerState(null);
    showToast("Draft discarded.", "success");
  } catch (error) {
    console.error('[ClinicalWorkspace.handleDiscardDraft]:', error.message);
    showToast("Failed to discard draft: " + error.message, "error");
  }
};
```

### 4.4 `handleResumeDraft` body

```javascript
const handleResumeDraft = () => {
  const d = draftBannerState?.draft;
  if (!d) { setDraftBannerState(null); return; }
  setSoapData({
    subjective: d.subjective || '',
    objWeight: d.objWeight || '',
    objTemp: d.objTemp || '',
    objHR: d.objHR || '',
    objRR: d.objRR || '',
    objCRT: d.objCRT || '2',
    bcs: d.bcs ?? 5,
    painScale: d.painScale ?? 0,
    murmurGrade: d.murmurGrade || 'None',
    murmurLocation: d.murmurLocation || 'L Apex (Mitral)',
    murmurTiming: d.murmurTiming || 'Systolic',
    respEffort: d.respEffort || 'Normal',
    palpationFindings: d.palpationFindings || { masses: false, pain: false, tense: false, normal: true },
    objectiveNotes: d.objectiveNotes || '',
    assessment: d.assessment || '',
    prognosis: d.prognosis || 'Good',
    patientStatus: d.patientStatus || 'Stable',
    plan: d.plan || '',
    recheckIn: d.recheckIn || '1 Week',
    nextVisit: d.nextVisit || '',
  });
  setIsDirty(false);
  setDraftBannerState(null);
  showToast("Draft restored. Continue editing.", "success");
};
```

### 4.5 `fetchPatientContext` restructured draft detection

Replace the block at lines 390 to 425 with:

```javascript
const draft = patient.soapDraft;
const savedAtTs = patient.draftSavedAt;
const savedAt = savedAtTs?.toDate ? savedAtTs.toDate() : null;
const isDraftRecent = savedAt && (Date.now() - savedAt.getTime()) < 24 * 60 * 60 * 1000;
const isEligibleStatus = ['arrived', 'in-consult'].includes(patient.status);

if (draft && Object.keys(draft).length > 0 && isDraftRecent && isEligibleStatus) {
  // DO NOT hydrate — stash for banner and initialize fresh
  let savedByName = 'Unknown vet';
  if (patient.draftSavedBy) {
    // Best-effort name resolution from vetsList if passed in; fallback to uid.
    // If vetsList is not in scope here, skip and use uid as display.
    savedByName = patient.draftSavedBy.slice(0, 8);
  }
  setDraftBannerState({
    draft,
    savedAt,
    savedByName,
    savedByUid: patient.draftSavedBy || null,
  });
  // Initialize FRESH defaults (copy of the else-branch below)
  setSoapData({
    subjective: patient.notes && patient.notes !== 'Walk-in client' && !patient.notes.includes('QUICK ADMIT') ? `Client noted: "${patient.notes}"\n\n` : '',
    objWeight: '', objTemp: '', objHR: '', objRR: '', objCRT: '2',
    bcs: 5, painScale: 0,
    murmurGrade: 'None', murmurLocation: 'L Apex (Mitral)', murmurTiming: 'Systolic',
    palpationFindings: { masses: false, pain: false, tense: false, normal: true },
    objectiveNotes: '', assessment: '', patientStatus: 'Stable', plan: '', nextVisit: '',
  });
} else if (draft && Object.keys(draft).length > 0) {
  // Stale or status-ineligible — silently hydrate as before (preserves existing behaviour)
  setSoapData({ /* same hydration body as current lines 394-415 */ });
  setDraftBannerState(null);
} else {
  setSoapData({ /* same fresh defaults as current lines 417-424 */ });
  setDraftBannerState(null);
}
```

### 4.6 Helper utilities (top of file or inline)

```javascript
const formatRelativeTime = (date) => {
  if (!date) return 'recently';
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const truncate = (text, max) => {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
};
```

Prefer placing these at module-top (above the component). Grep for existing `truncate` or `formatRelativeTime` in the file first — do not duplicate.

### 4.7 Name resolution for `savedByName` (IMPORTANT)

`draftSavedBy` is stored as a Firebase Auth UID (line 1069). Resolving it to a display name requires either:
- Option A: Pass `vetsList` into ClinicalWorkspace and look up by `id` — verify whether `vetsList` is already a prop (the component already uses inventory and services lists as props; check the component signature around line 100 and add `vetsList` to the prop list if missing)
- Option B: Accept the UID-stub fallback. Acceptable for MVP.

**Recommendation:** Option A. Verify `vetsList` prop wiring in `Queue.jsx` at line 1552 where `<ClinicalWorkspace vetsList={vets} ... />` is already passed. The UID is resolvable inside `fetchPatientContext` with `const savedByUser = vetsList?.find(v => v.id === patient.draftSavedBy); savedByName = savedByUser?.fullName || 'Unknown vet';`.

---

## 5. Edge Cases and Decisions

| Edge case | Decision |
|---|---|
| Draft exists but is > 24 hours old | Fall through to silent hydration path (legacy behaviour). Rationale: a day-old draft is likely abandoned; showing a stale banner is noise. Alternative considered: force-discard — rejected because it risks data loss on a vet who genuinely took a long break. |
| Draft exists but `status === 'completed'` or `'cancelled'` | Silent hydration fallback. The banner is only meaningful while the consult is in progress. |
| Draft exists but `status === 'pending'` or `'confirmed'` | Same — fallback. ClinicalWorkspace only opens for `in-consult`, `confined`, `on-hold` per `Queue.jsx` line 583, so this case is theoretically unreachable, but guard defensively. |
| User taps RESUME then immediately navigates away without saving | No-op. The form state is now populated; auto-save does not exist, so the draft stays in Firestore exactly as it was. Next open will re-show the banner. |
| User taps DISCARD then immediately taps SAVE DRAFT afterward | Allowed. The Firestore draft was cleared; a new draft is written. This is the desired path for "start fresh." |
| `draftSavedBy === current user` vs `!== current user` | No behavioural difference in MVP. Still show the banner with the author's name. A future enhancement could phrase it differently ("Your unsaved notes" vs "Dr. X's unsaved notes"). |
| User opens the same consult in two tabs | Both tabs show the banner on mount. If tab A resumes and saves, tab B still has stale banner state — but the next Firestore update will refresh via `onSnapshot` if the parent Queue.jsx subscribes (verify). Acceptable — the underlying data is the source of truth. |
| `draft` is `{}` (empty object) rather than `null` | Current hydration check is `Object.keys(draft).length > 0` — preserve this. Empty object = fresh defaults. |
| Banner blocks too much vertical space on small viewports | Banner is ~90px tall; the existing SOAP grid has `flex: 1` and scrolls. Acceptable. If a developer observes overflow, wrap the banner in a `Collapse` with `timeout` to let the user dismiss without action — but keep out of MVP. |

---

## 6. Phase Breakdown

### Phase 1 — State and detection wiring (15 min)
1. Add `draftBannerState` and `discardConfirmOpen` state hooks
2. Restructure the `fetchPatientContext` draft block per §4.5
3. Add `vetsList` prop to component signature if missing; verify Queue.jsx already passes it

**Verification:** Console-log `draftBannerState` in an effect. Open a consult with a previously-saved draft; confirm the state populates. Open a fresh consult; confirm it stays null.

### Phase 2 — Banner render (15 min)
1. Add the JSX block from §4.1 above the existing locked-record Alert at ~line 1199
2. Add the `formatRelativeTime` and `truncate` helpers
3. Verify styling matches the design language — solid 4px offset shadow, zero radius, uppercase action labels

**Verification:** Visual inspection. Open a consult with a draft; the banner appears. Resize the window; banner stays within the grid column and does not overflow.

### Phase 3 — Actions (20 min)
1. Implement `handleResumeDraft` (§4.4)
2. Implement `handleDiscardDraft` (§4.3)
3. Add the discard confirmation `Dialog` (§4.2)
4. Wire `setDraftBannerState(null)` in both paths

**Verification:** Full flow test. Save a draft from one vet session. Close. Reopen. Banner appears. Tap RESUME — form state populates, banner disappears. Reload. Tap DISCARD — confirm, banner disappears, Firestore `soapDraft` is null, `clinicalPulse` has a new `DRAFT_DISCARDED` entry.

### Phase 4 — Polish and regression (10 min)
1. Confirm SAVE DRAFT still works (§ doesn't touch it but regression check)
2. Confirm `isDirty` flag is correctly reset after RESUME
3. Confirm the existing "silent hydrate" fallback still fires for stale drafts

---

## 7. Data Contract

### Fields read
- `appointments/{id}.soapDraft` — object with SOAP fields; existing shape, unchanged
- `appointments/{id}.draftSavedAt` — Timestamp; existing field, unchanged
- `appointments/{id}.draftSavedBy` — string UID; existing field, unchanged
- `appointments/{id}.status` — string enum; used for eligibility gate
- `appointments/{id}.clinicalPulse` — array; unchanged read

### Fields written
On `handleDiscardDraft`:
```
{
  soapDraft: null,
  draftSavedAt: null,
  draftSavedBy: null,
  clinicalPulse: arrayUnion({
    eventId: string,
    type: 'DRAFT_DISCARDED',
    timestamp: Timestamp,
    staffId: string,
    staffName: string,
    note: string,
    discardedDraftSavedAt: Timestamp | null,
    discardedDraftSavedBy: string | null
  })
}
```

No new collections. No new indexes. No schema migration.

---

## 8. Testing Plan

### Manual QA checklist
- [ ] Open a consult with no prior draft → no banner, fresh defaults populate
- [ ] Save a draft via SAVE DRAFT button → banner does NOT appear on the same session (it appears after a fresh mount, not live)
- [ ] Close the consult (navigate away), reopen → banner appears with correct metadata
- [ ] Tap RESUME EDITING → form fields populate, banner disappears, no toast errors
- [ ] Tap DISCARD DRAFT → confirm dialog appears with author name
- [ ] Confirm discard → banner disappears, Firestore doc shows `soapDraft: null`, pulse event is appended
- [ ] Cancel discard → banner stays, nothing changes
- [ ] With a draft > 24h old, open consult → NO banner, silent hydration fallback fires (observable because form is pre-populated)
- [ ] Open a consult where `status === 'completed'` → NO banner (unreachable path but defensive)
- [ ] Open two browser tabs on the same consult → both show banner; resume in tab A; reload tab B → no banner (draft still exists but was discarded/resumed)
- [ ] Draft author is NOT the current user → banner still shows, uses correct author name from `vetsList`
- [ ] `vetsList` prop missing or draftSavedBy unresolvable → falls back to UID stub, no crash

### Regression surface
- SAVE DRAFT button (unchanged, smoke test)
- SIGN & RELEASE flow (unchanged, smoke test)
- `handleSaveConsult` path (unchanged, smoke test)
- Queue → Open Consult navigation (unchanged, smoke test)

---

## 9. Rollback Plan

This is a pure additive change on a single file. To revert:
1. `git revert <commit-sha>`
2. Firestore fields (`soapDraft`, `draftSavedAt`, `draftSavedBy`) are unchanged in shape; any drafts written during the feature lifetime remain readable by the legacy auto-hydrate path.
3. Any `DRAFT_DISCARDED` pulse events remain in the `clinicalPulse` array — benign, no consumer crashes (pulse consumers iterate events by type and ignore unknowns; verify in ForensicMetricGrid.jsx).

No data migration needed either way.

---

## 10. Known Unknowns

1. **Does `vetsList` get passed into ClinicalWorkspace?** Verify at Queue.jsx:1552. Confirmed yes in the audit — the prop exists.
2. **Does `ClinicalWorkspace` already import `arrayUnion`?** Yes, confirmed at line 967.
3. **Does the existing Alert stack have a wrapping Box with `flexShrink: 0`?** Verify at line 1199; if yes, place the banner inside that wrapper so layout stays stable.
4. **Is there a global toast provider in scope?** The existing `handleSaveDraft` already calls `showToast(...)` — reuse the same helper for consistent behaviour.
