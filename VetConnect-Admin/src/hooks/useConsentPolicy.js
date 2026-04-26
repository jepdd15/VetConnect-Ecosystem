import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  writeBatch,
  getDocs,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  CONSENT_TYPES,
  DEFAULT_DPA_TEXT,
  DEFAULT_WAIVER_TEXT,
} from '../utils/consentConstants';

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Derives the next version number to assign by incrementing the highest
 * versionNumber across all existing consent_versions documents.
 *
 * @param {Array<object>} currentVersions - Snapshot of all version docs.
 * @returns {number} The next sequential version number (minimum 1).
 */
function deriveNextVersionNumber(currentVersions) {
  if (!currentVersions.length) return 1;
  const maxExisting = Math.max(...currentVersions.map((v) => v.versionNumber || 0));
  return maxExisting + 1;
}

// ---------------------------------------------------------------------------
// HOOK
// ---------------------------------------------------------------------------

/**
 * Manages the consent versioning system for the admin dashboard.
 *
 * Listeners:
 *   - `clinic_settings/consent_policy` — active version metadata
 *   - `consent_versions` collection — all policy versions, newest first
 *
 * Mutations:
 *   - `publishVersion`  — activates a draft; supersedes previous active version(s)
 *   - `createDraft`     — creates a new draft consent_versions document
 *   - `updateDraft`     — updates fields on an existing draft
 *   - `seedDefaults`    — bootstraps DPA v1 + Waiver v1 when zero versions exist
 *
 * @returns {{
 *   activeVersion: number | null,
 *   activatedAt: import('firebase/firestore').Timestamp | null,
 *   activatedBy: string | null,
 *   versions: Array<object>,
 *   loading: boolean,
 *   publishVersion: (versionDocId: string) => Promise<void>,
 *   createDraft: (type: string, title: string, bodyText: string, summary: string) => Promise<string>,
 *   updateDraft: (docId: string, fields: object) => Promise<void>,
 *   seedDefaults: (adminName: string) => Promise<void>,
 * }}
 */
export function useConsentPolicy() {
  const policyDocRef = doc(db, 'clinic_settings', 'consent_policy');
  const versionsColRef = collection(db, 'consent_versions');

  const [policyMeta, setPolicyMeta] = useState({
    activeVersion: null,
    activatedAt: null,
    activatedBy: null,
  });
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Listeners ────────────────────────────────────────────────────────────

  useEffect(() => {
    let resolvedPolicy = false;
    let resolvedVersions = false;

    const checkAllResolved = () => {
      if (resolvedPolicy && resolvedVersions) {
        setLoading(false);
      }
    };

    // Listener 1: clinic_settings/consent_policy
    const unsubPolicy = onSnapshot(policyDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setPolicyMeta({
          activeVersion: data.activeVersion ?? null,
          activatedAt:   data.activatedAt   ?? null,
          activatedBy:   data.activatedBy   ?? null,
        });
      } else {
        setPolicyMeta({ activeVersion: null, activatedAt: null, activatedBy: null });
      }
      resolvedPolicy = true;
      checkAllResolved();
    });

    // Listener 2: consent_versions collection, newest version number first
    const versionsQuery = query(versionsColRef, orderBy('versionNumber', 'desc'));
    const unsubVersions = onSnapshot(versionsQuery, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setVersions(docs);
      resolvedVersions = true;
      checkAllResolved();
    });

    return () => {
      unsubPolicy();
      unsubVersions();
    };
  }, []);

  // ── publishVersion ────────────────────────────────────────────────────────

  /**
   * Publishes a draft version, superseding all currently active versions.
   *
   * Atomically:
   *   1. Sets the target doc's status to "active"
   *   2. Sets all other currently "active" docs to "superseded"
   *   3. Writes clinic_settings/consent_policy with the new active version metadata
   *
   * @param {string} versionDocId - Firestore document ID in `consent_versions`.
   * @param {string} [publishedBy] - Name/email of the admin publishing this version.
   *   Defaults to the draft's original createdBy if omitted.
   */
  async function publishVersion(versionDocId, publishedBy) {
    const targetDoc = versions.find((v) => v.id === versionDocId);
    if (!targetDoc) {
      throw new Error(`[useConsentPolicy.publishVersion] Document "${versionDocId}" not found.`);
    }
    if (targetDoc.status !== 'draft') {
      throw new Error(`[useConsentPolicy.publishVersion] Only draft versions can be published. Status: "${targetDoc.status}".`);
    }

    const batch = writeBatch(db);
    const now = Timestamp.now();
    const who = publishedBy || targetDoc.createdBy || 'Unknown Admin';

    // Supersede all currently active versions
    const activeVersions = versions.filter((v) => v.status === 'active');
    activeVersions.forEach((v) => {
      batch.update(doc(db, 'consent_versions', v.id), { status: 'superseded' });
    });

    // Activate the target version
    batch.update(doc(db, 'consent_versions', versionDocId), {
      status:        'active',
      effectiveDate: now,
      publishedBy:   who,
    });

    // Update the policy pointer — records who published this version for the Settings summary
    batch.set(policyDocRef, {
      activeVersion: targetDoc.versionNumber,
      activatedAt:   now,
      activatedBy:   who,
    });

    await batch.commit();
  }

  // ── createDraft ───────────────────────────────────────────────────────────

  /**
   * Creates a new draft consent_versions document.
   *
   * The versionNumber is derived by incrementing the highest existing number
   * across all consent types — this ensures a single monotonic counter for the
   * version history table.
   *
   * @param {string} type     - CONSENT_TYPES.DPA or CONSENT_TYPES.WAIVER
   * @param {string} title    - Display title for this version
   * @param {string} bodyText - Full policy body text
   * @param {string} summary  - One-line "what changed from previous version" note
   * @param {string} adminName - Name/email of the admin creating the draft
   * @returns {Promise<string>} The new document ID
   */
  async function createDraft(type, title, bodyText, summary, adminName) {
    if (!Object.values(CONSENT_TYPES).includes(type)) {
      throw new Error(`[useConsentPolicy.createDraft] Invalid type "${type}". Must be "dpa" or "waiver".`);
    }
    if (!title.trim()) {
      throw new Error('[useConsentPolicy.createDraft] Title is required.');
    }
    if (!bodyText.trim()) {
      throw new Error('[useConsentPolicy.createDraft] Body text is required.');
    }

    const nextVersion = deriveNextVersionNumber(versions);
    const now = Timestamp.now();

    const newDoc = await addDoc(versionsColRef, {
      versionNumber: nextVersion,
      type,
      title:         title.trim(),
      bodyText:      bodyText.trim(),
      summary:       summary.trim(),
      status:        'draft',
      createdAt:     now,
      createdBy:     adminName || 'Unknown Admin',
      effectiveDate: null,
    });

    return newDoc.id;
  }

  // ── updateDraft ───────────────────────────────────────────────────────────

  /**
   * Updates fields on an existing draft version.
   * Rejects with an error if the target document is not in "draft" status —
   * published and superseded versions are immutable.
   *
   * @param {string} docId  - Firestore document ID of the draft
   * @param {object} fields - Partial fields to merge (title, bodyText, summary)
   */
  async function updateDraft(docId, fields) {
    const target = versions.find((v) => v.id === docId);
    if (!target) {
      throw new Error(`[useConsentPolicy.updateDraft] Document "${docId}" not found.`);
    }
    if (target.status !== 'draft') {
      throw new Error(
        `[useConsentPolicy.updateDraft] Only drafts may be edited. Status: "${target.status}".`
      );
    }

    await updateDoc(doc(db, 'consent_versions', docId), { ...fields });
  }

  // ── seedDefaults ─────────────────────────────────────────────────────────

  /**
   * Bootstraps the consent system with default DPA v1 and Waiver v1 documents.
   *
   * Only executes when zero consent_versions documents exist. If versions already
   * exist, this function throws to prevent accidental re-seeding.
   *
   * @param {string} adminName - Full name or email of the seeding admin (for attribution)
   */
  async function seedDefaults(adminName) {
    // Guard: re-fetch the current count to confirm zero versions exist server-side
    const snapshot = await getDocs(versionsColRef);
    if (!snapshot.empty) {
      throw new Error(
        '[useConsentPolicy.seedDefaults] Consent versions already exist — seeding is not permitted.'
      );
    }

    const batch = writeBatch(db);
    const now = Timestamp.now();
    const who = adminName || 'Unknown Admin';

    // DPA v1 — active immediately on seed
    const dpaRef = doc(versionsColRef);
    batch.set(dpaRef, {
      versionNumber: 1,
      type:          CONSENT_TYPES.DPA,
      title:         'Data Privacy Act Consent (RA 10173) — Version 1',
      bodyText:      DEFAULT_DPA_TEXT,
      summary:       'Initial consent policy.',
      status:        'active',
      createdAt:     now,
      createdBy:     who,
      effectiveDate: now,
    });

    // Waiver v1 — active immediately on seed
    const waiverRef = doc(versionsColRef);
    batch.set(waiverRef, {
      versionNumber: 1,
      type:          CONSENT_TYPES.WAIVER,
      title:         'Veterinary Services Liability Waiver — Version 1',
      bodyText:      DEFAULT_WAIVER_TEXT,
      summary:       'Initial liability waiver.',
      status:        'active',
      createdAt:     now,
      createdBy:     who,
      effectiveDate: now,
    });

    // Set the policy pointer — DPA governs the primary activeVersion field
    batch.set(policyDocRef, {
      activeVersion: 1,
      activatedAt:   now,
      activatedBy:   who,
    });

    await batch.commit();
  }

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    activeVersion: policyMeta.activeVersion,
    activatedAt:   policyMeta.activatedAt,
    activatedBy:   policyMeta.activatedBy,
    versions,
    loading,
    publishVersion,
    createDraft,
    updateDraft,
    seedDefaults,
  };
}
