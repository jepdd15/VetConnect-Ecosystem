/**
 * amendmentDisplay.js — pure display helpers for the T4.243 amendments trail.
 *
 * Framework-free (no React/MUI) so BOTH the staff React trail (AmendmentsTrail.jsx,
 * used by PatientDashboard + EMRDrawer) AND the print HTML builder
 * (printInternalRecord.js) render from one source of truth.
 *
 * The trail must render THREE entry shapes that can coexist on one record:
 *   1. NEW full-snapshot revision (T4.243 write-time):
 *      { revisionNumber, kind:'addition'|'correction', reason, author:{uid,name},
 *        timestamp, diff:[{fieldKey,fieldLabel,changeType:'added'|'changed'|'removed',before,after}], snapshot }
 *   2. FROZEN original baseline (prepended at the first revision):
 *      { kind:'original', snapshot, signedBy, lockedAt }
 *   3. LEGACY AmendmentDialog entry (retired creation path, still displayed):
 *      { reason, soap, vitals, type:'structured'|'text', by, timestamp, text, addedMedications, vetName }
 *
 * Detection: kind==='original' → baseline; has diff[]/revisionNumber → new; else legacy.
 */

// Per-change-type display metadata. `tone` lets each renderer pick its own color
// (React → designTokens; print → hex) without re-deriving the mapping.
export const CHANGE_META = {
  added:   { symbol: '+', label: 'Added',   tone: 'added' },
  changed: { symbol: '✎', label: 'Changed', tone: 'changed' },
  removed: { symbol: '−', label: 'Removed', tone: 'removed' },
};

export function isOriginalEntry(e) {
  return e?.kind === 'original';
}

export function isNewEntry(e) {
  return !!e && !isOriginalEntry(e) && (Array.isArray(e.diff) || e.revisionNumber != null);
}

export function isLegacyEntry(e) {
  return !!e && !isOriginalEntry(e) && !isNewEntry(e);
}

// Normalize any timestamp shape (Firestore Timestamp, {seconds}, millis number, Date,
// ISO string) to millis. Returns 0 when absent/unparseable.
export function tsToMillis(t) {
  if (t == null) return 0;
  if (typeof t === 'number') return t;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  if (t instanceof Date) return t.getTime();
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

// An entry's effective time: revisions use `timestamp`, the original baseline uses `lockedAt`.
export function entryMillis(e) {
  return tsToMillis(e?.timestamp ?? e?.lockedAt);
}

export function entryDate(e) {
  const m = entryMillis(e);
  return m ? new Date(m) : null;
}

// Author/clinician name across all three shapes. Falls back to 'Clinician' (never blank).
export function amendmentAuthorName(e) {
  if (!e) return 'Clinician';
  const signed = typeof e.signedBy === 'string' ? e.signedBy : e.signedBy?.name;
  const author = typeof e.author === 'string' ? e.author : e.author?.name;
  return author || e.vetName || e.by || signed || 'Clinician';
}

// Per-entry chip for NEW entries only (auto-derived kind). null for legacy/original.
export function kindChipLabel(e) {
  if (!isNewEntry(e)) return null;
  return e.kind === 'addition' ? 'ADDITION' : 'CORRECTION';
}

// Fields whose diff before/after are stored normalized to millis (buildSnapshot uses toMillis()).
const DATE_FIELD_KEYS = new Set(['nextVisit']);

// Render a diff before/after value for display. Date fields (stored as millis) → readable date.
export function formatDiffValue(fieldKey, value) {
  if (value == null || value === '') return '—';
  if (DATE_FIELD_KEYS.has(fieldKey) && typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
  return String(value);
}

// Split a record's amendments[] into the frozen original + the (newest-first) revision/legacy trail.
// `count` is the number of trail entries (revisions + legacy), excluding the original baseline —
// this matches `amendmentCount` and the "AMENDMENTS (N)" header in the mockups.
export function classifyAmendments(amendments) {
  const list = Array.isArray(amendments) ? amendments : [];
  const original = list.find(isOriginalEntry) || null;
  const trail = list
    .filter((e) => !isOriginalEntry(e))
    .sort((a, b) => (entryMillis(b) - entryMillis(a)) || ((b?.revisionNumber || 0) - (a?.revisionNumber || 0)));
  return { original, trail, count: trail.length };
}

// Compact summary of a snapshot (diagnosis / assessment / plan) for the frozen original block.
export function snapshotSummary(snapshot) {
  if (!snapshot) return [];
  const out = [];
  const dx = Array.isArray(snapshot.diagnoses)
    ? snapshot.diagnoses.map((d) => d?.name).filter(Boolean)
    : [];
  if (dx.length) out.push({ label: 'Diagnosis', value: dx.join(', ') });
  if (snapshot.assessment) out.push({ label: 'Assessment', value: String(snapshot.assessment) });
  if (snapshot.plan) out.push({ label: 'Plan', value: String(snapshot.plan) });
  return out;
}
