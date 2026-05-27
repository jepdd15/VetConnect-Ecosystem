/**
 * recordAmendments.js — pure logic engine for T4.243 full-workspace versioned amendments.
 *
 * Write-time materialize model (locked 2026-05-26):
 *   - The signed `medical_records` body holds the CURRENT (latest) clinical values.
 *   - Every revision is appended to `record.amendments[]` as a full-snapshot entry; the
 *     FIRST revision also archives the ORIGINAL signed body as a frozen baseline entry, so
 *     nothing is lost when the body is materialized to the corrected values.
 *   - Readers read the body as current (no read-time resolver needed).
 *
 * These functions are PURE — no Firestore I/O. The caller (Revision Mode save) takes
 * `buildAmendmentUpdate()`'s payload and performs the updateDoc/setDoc.
 *
 * Honors the locked immutability decision (append-only, preserves original SOAP) and the
 * forensicSeal lifecycle (the seal is untouched here).
 */

// Normalize a stored value for comparison: Firestore Timestamps → millis, strings → trimmed.
const norm = (v) => {
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  return typeof v === 'string' ? v.trim() : v;
};

const isEmpty = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

// ── Tracked scalar fields (diff before→after) ──
// `get` reads from a record-shaped object (medical_records doc OR the Revision-Mode body payload,
// which Phase 2 produces in the same shape).
export const SCALAR_FIELDS = [
  { key: 'subjective',         label: 'Subjective',          get: (r) => r?.soap?.subjective },
  { key: 'objective',          label: 'Objective',           get: (r) => r?.soap?.objectiveNotes ?? r?.soap?.objective },
  { key: 'assessment',         label: 'Assessment',          get: (r) => r?.soap?.assessment ?? r?.assessmentNotes },
  { key: 'plan',               label: 'Plan',                get: (r) => r?.soap?.plan ?? r?.treatment },
  { key: 'prognosis',          label: 'Prognosis',           get: (r) => r?.soap?.prognosis },
  { key: 'clientInstructions', label: 'Client Instructions', get: (r) => r?.soap?.clientInstructions },
  { key: 'recheckIn',          label: 'Recheck In',          get: (r) => r?.soap?.recheckIn },
  { key: 'patientStatus',      label: 'Patient Status',      get: (r) => r?.patientStatus },
  { key: 'nextVisit',          label: 'Next Visit',          get: (r) => r?.nextVisit },
  // vitals
  { key: 'weight', label: 'Weight',           get: (r) => r?.vitals?.weight },
  { key: 'temp',   label: 'Temperature',      get: (r) => r?.vitals?.temp },
  { key: 'hr',     label: 'Heart Rate',       get: (r) => r?.vitals?.hr },
  { key: 'rr',     label: 'Respiratory Rate', get: (r) => r?.vitals?.rr },
  { key: 'crt',    label: 'CRT',              get: (r) => r?.vitals?.crt },
  { key: 'bcs',    label: 'BCS',              get: (r) => r?.vitals?.bcs },
  { key: 'pain',   label: 'Pain Score',       get: (r) => r?.vitals?.pain },
];

// ── Tracked list fields (diff per item: added / removed / changed) ──
// `itemId` identifies the logical slot; `itemSig` detects an in-place change; `itemText` is the label.
export const LIST_FIELDS = [
  {
    key: 'diagnoses', label: 'Diagnosis',
    get: (r) => (Array.isArray(r?.diagnoses) ? r.diagnoses : []),
    itemId: (d) => String(d?.catalogId || d?.name || '').toLowerCase(),
    itemText: (d) => d?.name || 'Diagnosis',
    itemSig: (d) => `${d?.name || ''}|${d?.severity || ''}`,
  },
  {
    // itemId keys on name so a qty edit stays a clean 'changed' (not remove+add). This assumes
    // distinct product names per visit (the catalog uses distinct names, e.g. "Amoxicillin 250mg"
    // vs "500mg"). If same-name multi-line dispensing is ever needed, Phase 2 should add a stable
    // per-line id to dispensedProducts and key on that.
    key: 'dispensedProducts', label: 'Medication / Product',
    get: (r) => (Array.isArray(r?.dispensedProducts) ? r.dispensedProducts : []),
    itemId: (p) => String(p?.name || '').toLowerCase(),
    itemText: (p) => `${p?.name || 'Item'}${p?.qty != null ? ` ×${p.qty}` : ''}`,
    itemSig: (p) => `${p?.name || ''}|${p?.qty ?? ''}|${p?.instructions || ''}`,
  },
  {
    key: 'vaccineAdministrations', label: 'Vaccine',
    get: (r) => (Array.isArray(r?.vaccineAdministrations) ? r.vaccineAdministrations : []),
    itemId: (v) => `${String(v?.vaccineName || '').toLowerCase()}|${v?.lotNumber || ''}`,
    itemText: (v) => v?.vaccineName || 'Vaccine',
    itemSig: (v) => `${v?.vaccineName || ''}|${v?.lotNumber || ''}|${v?.doseNumber ?? ''}`,
  },
  {
    key: 'labResults', label: 'Lab Result',
    get: (r) => (Array.isArray(r?.labResults) ? r.labResults : []),
    itemId: (l) => String(l?.testName || '').toLowerCase(),
    itemText: (l) => `${l?.testName || 'Test'}${l?.result ? `: ${l.result}` : ''}`,
    itemSig: (l) => `${l?.testName || ''}|${l?.result || ''}|${l?.status || ''}`,
  },
];

/**
 * Extract the tracked clinical fields from a record-shaped object into a normalized snapshot.
 */
export function buildSnapshot(record) {
  const snap = {};
  SCALAR_FIELDS.forEach((f) => { snap[f.key] = norm(f.get(record)); });
  LIST_FIELDS.forEach((f) => { snap[f.key] = f.get(record); });
  return snap;
}

/**
 * Field-level diff between two snapshots (prev → next).
 * @returns {Array<{fieldKey, fieldLabel, changeType:'added'|'changed'|'removed', before, after}>}
 */
export function diffSnapshots(prev, next) {
  const P = prev || {};
  const N = next || {};
  const diff = [];

  // scalars
  SCALAR_FIELDS.forEach(({ key, label }) => {
    const before = P[key];
    const after = N[key];
    const beEmpty = isEmpty(before);
    const afEmpty = isEmpty(after);
    if (beEmpty && afEmpty) return;
    if (beEmpty) diff.push({ fieldKey: key, fieldLabel: label, changeType: 'added', before: null, after });
    else if (afEmpty) diff.push({ fieldKey: key, fieldLabel: label, changeType: 'removed', before, after: null });
    else if (String(before) !== String(after)) diff.push({ fieldKey: key, fieldLabel: label, changeType: 'changed', before, after });
  });

  // lists (per item)
  LIST_FIELDS.forEach(({ key, label, itemId, itemText, itemSig }) => {
    const prevItems = Array.isArray(P[key]) ? P[key] : [];
    const nextItems = Array.isArray(N[key]) ? N[key] : [];
    const prevById = new Map(prevItems.map((it) => [itemId(it), it]));
    const nextById = new Map(nextItems.map((it) => [itemId(it), it]));

    nextById.forEach((nItem, id) => {
      if (!prevById.has(id)) {
        diff.push({ fieldKey: key, fieldLabel: label, changeType: 'added', before: null, after: itemText(nItem) });
      } else if (itemSig(prevById.get(id)) !== itemSig(nItem)) {
        diff.push({ fieldKey: key, fieldLabel: label, changeType: 'changed', before: itemText(prevById.get(id)), after: itemText(nItem) });
      }
    });
    prevById.forEach((pItem, id) => {
      if (!nextById.has(id)) {
        diff.push({ fieldKey: key, fieldLabel: label, changeType: 'removed', before: itemText(pItem), after: null });
      }
    });
  });

  return diff;
}

/**
 * Derive the entry kind: 'addition' if every change is an add, else 'correction'.
 */
export function deriveKind(diff) {
  // Empty diff defaults to 'addition' (harmless): buildAmendmentUpdate short-circuits on an
  // empty diff before this runs, so callers never observe the no-change case through here.
  if (!diff || diff.length === 0) return 'addition';
  return diff.every((d) => d.changeType === 'added') ? 'addition' : 'correction';
}

/**
 * Build the write-time amendment-update payload.
 *
 * @param {object} record - current stored medical_records doc data.
 * @param {object} newBodyFields - corrected clinical fields, record-shaped subset
 *   ({ soap, vitals, diagnoses, dispensedProducts, vaccineAdministrations, labResults,
 *      patientStatus, nextVisit, assessmentNotes, treatment, ... }) from the Revision-Mode save.
 *   CONTRACT: this MUST be a COMPLETE snapshot of every tracked field (blanks passed explicitly
 *   as ''/null), NOT a partial delta. Phase 2 must build it by mirroring the sign-off field write
 *   so a cleared field both (a) diffs as 'removed' AND (b) is materialized empty on the body.
 *   The `...newBodyFields` spread only overwrites keys present here — an OMITTED field would not be
 *   cleared on the doc body, producing a diff that disagrees with the stored body.
 * @param {object} meta - { reason, author: {uid,name}, now } (now = a serializable timestamp value).
 * @returns {{ update: object|null, diff: Array, kind: string }}
 *   `update` is the field map to apply to the record doc (materialized body + appended
 *   amendments[]), or null when nothing changed.
 */
export function buildAmendmentUpdate(record, newBodyFields, meta = {}) {
  const prevSnap = buildSnapshot(record);
  const nextSnap = buildSnapshot(newBodyFields);
  const diff = diffSnapshots(prevSnap, nextSnap);

  if (diff.length === 0) return { update: null, diff: [], kind: 'addition' };

  const kind = deriveKind(diff);
  const existing = Array.isArray(record?.amendments) ? record.amendments : [];
  const now = meta.now ?? null;

  // First revision: archive the ORIGINAL signed body as a frozen baseline so it survives
  // the body being materialized to the corrected values.
  const baseline = existing.length === 0
    ? [{
        kind: 'original',
        snapshot: prevSnap,
        signedBy: record?.signedBy || null,
        lockedAt: record?.legal?.lockedAt || record?.date || now,
      }]
    : [];

  const revisionNumber = existing.filter((e) => e.kind !== 'original').length + 1;

  const entry = {
    revisionNumber,
    kind,
    reason: (meta.reason || '').trim(),
    author: meta.author || null,
    timestamp: now,
    diff,
    snapshot: nextSnap,
  };

  return {
    update: {
      ...newBodyFields, // materialize the corrected clinical fields onto the record body
      amendments: [...existing, ...baseline, entry],
      isAmended: true,
      amendmentCount: revisionNumber,
      lastAmendedAt: now,
    },
    diff,
    kind,
  };
}
