/**
 * vaccineReminderQueue.js — T3.55
 *
 * Computes vaccine reminder status and writes to the vaccine_reminder_queue
 * Firestore collection. Two public entry points:
 *
 * 1. computeFullVaccineReminderQueue(clinicSettings)
 *    Reads ALL pets + medical_records + vaccine catalog, rebuilds the entire
 *    collection. Called on the first Dashboard mount of each week.
 *
 * 2. computeSinglePetVaccineReminder(petId, petData, clinicSettings)
 *    Reads one pet's records + vaccine catalog, writes/updates one queue doc.
 *    Called fire-and-forget from ClinicalWorkspace handleSaveConsult.
 *
 * Queue doc schema (vaccine_reminder_queue/{petId}):
 * {
 *   petId: string,
 *   petName: string,
 *   petSpecies: string,
 *   ownerName: string,
 *   ownerId: string,
 *   pushToken: string | null,
 *   ownerEmail: string,          // T4.135 — for email channel in Cron handler
 *   ownerPhone: string,          // T4.135 — populated but not used for vaccine SMS
 *   vaccines: [{ name, status, daysUntilDue }],
 *   updatedAt: Timestamp,
 *   lastReminderSentAt: Timestamp | null,
 * }
 */
import {
  collection, doc, getDocs, getDoc, setDoc, deleteDoc, addDoc,
  query, where, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { resolvePushToken, getWorkerUrl, getCachedOwnerEmail, getCachedOwnerPhone } from './sendPushNotification';
import { DEFAULT_TEMPLATES } from './notificationTemplateConstants';
import { DEFAULT_VACCINE_CATALOG } from '../hooks/useVaccineCatalog';

// ── Legacy keyword map ────────────────────────────────────────────────────────
// Mirrors useVaccineCatalog.js — supplements inventory-product names with
// well-known synonyms so old SOAP free-text records still resolve correctly.
const LEGACY_KEYWORDS = {
  'rabies':        ['rabies'],
  'dhpp':          ['dhpp', 'da2pp', 'distemper', 'parvo', 'parvovirus', '5-in-1', '5 in 1'],
  'bordetella':    ['bordetella', 'kennel cough', 'kennel'],
  'leptospirosis': ['lepto', 'leptospirosis'],
  'fvrcp':         ['fvrcp', 'feline distemper', 'panleukopenia'],
  'felv':          ['felv', 'feline leukemia'],
};

// ── Internal: Vaccine catalog fetch (one-shot, non-reactive) ─────────────────
// Cannot use the useVaccineCatalog React hook outside a component. Instead, do
// a one-shot getDocs read of the inventory collection filtered client-side for
// category === 'vaccine'. Falls back to DEFAULT_VACCINE_CATALOG if nothing exists.

function mapProductToCatalogEntry(product) {
  const vc = product.vaccineConfig || {};
  const nameLower = (product.itemName || '').toLowerCase();
  const legacyKws = Object.entries(LEGACY_KEYWORDS)
    .find(([key]) => nameLower.includes(key))?.[1] || [];
  return {
    id:           product.id,
    name:         product.itemName,
    species:      vc.species      || ['dog', 'cat'],
    intervalDays: vc.intervalDays || 365,
    isActive:     !product.isArchived,
    keywords:     [nameLower, ...legacyKws],
  };
}

async function fetchCatalog() {
  try {
    const snap = await getDocs(collection(db, 'inventory'));
    const vaccines = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => (p.category || '').toLowerCase() === 'vaccine' && !p.isArchived);
    if (vaccines.length > 0) return vaccines.map(mapProductToCatalogEntry);
  } catch {
    // Silent fallback — log nothing, use hardcoded defaults
  }
  return DEFAULT_VACCINE_CATALOG;
}

// ── Internal: Vaccine status computation ──────────────────────────────────────
// Mirrors vaccineHelpers.buildVaccinationStatus but returns ONLY due_soon/overdue
// entries — current and unknown are irrelevant for reminders.

function getVaccineAdministrations(record) {
  if (record?.vaccineAdministrations?.length > 0) return record.vaccineAdministrations;
  if (record?.vaccineData?.vaccineName) return [record.vaccineData];
  return [];
}

function resolveVaccineFromName(name, catalog) {
  if (!name) return null;
  const lower = name.toLowerCase();
  return catalog.find(v =>
    v.name.toLowerCase() === lower ||
    (v.keywords || []).some(kw => lower.includes(kw)),
  ) || null;
}

/**
 * Computes vaccine statuses for a single pet. Returns only entries that require
 * a reminder (status === 'due_soon' or 'overdue') within the reminder window.
 *
 * @param {Array<object>} records - Medical records for this pet
 * @param {Array<object>} catalog - Vaccine catalog entries
 * @param {string} petSpecies - e.g. 'Canine', 'Feline', 'Dog', 'Cat'
 * @param {number} windowDays - Reminder window in days (default 30)
 * @returns {Array<{ name: string, status: 'due_soon'|'overdue', daysUntilDue: number }>}
 */
function computePetVaccineStatuses(records, catalog, petSpecies, windowDays = 30) {
  const sp = (petSpecies || '').toLowerCase();
  const spKey = sp.includes('cat') || sp.includes('feline') ? 'cat' : 'dog';

  const results = [];

  for (const catalogVax of catalog.filter(v => v.species?.includes(spKey))) {
    // Path 1: Structured vaccineAdministrations records
    let bestTime = 0;
    let matchedRecord = null;
    let matchedAdmin = null;

    for (const r of records) {
      const admins = getVaccineAdministrations(r);
      const admin = admins.find(a => {
        const resolved = resolveVaccineFromName(a.vaccineName, catalog);
        return resolved?.id === catalogVax.id;
      });
      if (admin) {
        const rTime = r.date?.toDate
          ? r.date.toDate().getTime()
          : (r.date?.seconds ? r.date.seconds * 1000 : 0);
        if (rTime >= bestTime) {
          matchedRecord = r;
          matchedAdmin = admin;
          bestTime = rTime;
        }
      }
    }

    if (matchedRecord && matchedAdmin) {
      const lastDate = matchedRecord.date?.toDate
        ? matchedRecord.date.toDate()
        : matchedRecord.date?.seconds
          ? new Date(matchedRecord.date.seconds * 1000)
          : null;

      if (!lastDate) continue; // Cannot determine date — skip

      const explicitDue = matchedAdmin.dueDate ? new Date(matchedAdmin.dueDate) : null;
      const intervalDays = matchedAdmin.intervalDays || catalogVax.intervalDays;
      const daysUntilDue = explicitDue
        ? Math.floor((explicitDue.getTime() - Date.now()) / 86400000)
        : intervalDays - Math.floor((Date.now() - lastDate.getTime()) / 86400000);

      if (daysUntilDue <= windowDays) {
        results.push({
          name: catalogVax.name,
          status: daysUntilDue < 0 ? 'overdue' : 'due_soon',
          daysUntilDue,
        });
      }
      continue;
    }

    // Path 2: Legacy keyword match against SOAP free-text fields
    const keywordMatches = records.filter(r => {
      const text = [
        r.diagnosis,
        r.treatment,
        r.soap?.subjective,
        r.soap?.objective || r.objectiveNotes || '',
      ].filter(Boolean).join(' ').toLowerCase();
      return (catalogVax.keywords || []).some(kw => text.includes(kw));
    });

    if (keywordMatches.length === 0) continue; // No evidence — skip (unknown status)

    const latest = keywordMatches.reduce((a, b) => {
      const aT = a.date?.toDate ? a.date.toDate().getTime() : (a.date?.seconds ? a.date.seconds * 1000 : 0);
      const bT = b.date?.toDate ? b.date.toDate().getTime() : (b.date?.seconds ? b.date.seconds * 1000 : 0);
      return aT >= bT ? a : b;
    });

    const lastDate = latest.date?.toDate
      ? latest.date.toDate()
      : latest.date?.seconds ? new Date(latest.date.seconds * 1000) : null;

    if (!lastDate) continue; // Cannot determine date — skip

    const daysSince = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
    const daysUntilDue = catalogVax.intervalDays - daysSince;

    if (daysUntilDue <= windowDays) {
      results.push({
        name: catalogVax.name,
        status: daysUntilDue < 0 ? 'overdue' : 'due_soon',
        daysUntilDue,
      });
    }
  }

  return results;
}

// ── Internal: Write a single pet's queue doc ──────────────────────────────────

/**
 * Writes or updates a single vaccine_reminder_queue doc.
 * If vaccines is empty, removes the doc from the queue instead.
 * Preserves lastReminderSentAt from any existing doc to keep cooldown intact.
 *
 * @param {string} petId
 * @param {{ petName, petSpecies, ownerName, ownerId }} petData
 * @param {Array<{ name, status, daysUntilDue }>} vaccines
 */
async function writeQueueDoc(petId, petData, vaccines) {
  const queueRef = doc(db, 'vaccine_reminder_queue', petId);

  if (vaccines.length === 0) {
    try { await deleteDoc(queueRef); } catch { /* silent — doc may not exist */ }
    return;
  }

  // Resolve the owner's push token for notification delivery.
  // getCachedOwnerEmail/Phone are populated as a side-effect of resolvePushToken.
  const pushToken  = await resolvePushToken(petData.ownerId);
  const ownerEmail = getCachedOwnerEmail(petData.ownerId) || '';
  const ownerPhone = getCachedOwnerPhone(petData.ownerId) || '';

  // Read existing doc to preserve lastReminderSentAt — ensures cooldown logic
  // works correctly even after a full recompute wipes and rewrites the doc.
  let lastReminderSentAt = null;
  try {
    const existing = await getDoc(queueRef);
    if (existing.exists()) {
      lastReminderSentAt = existing.data().lastReminderSentAt || null;
    }
  } catch { /* silent — treat as no prior send */ }

  await setDoc(queueRef, {
    petId,
    petName:           petData.petName    || 'Unknown Pet',
    petSpecies:        petData.petSpecies || '',
    ownerName:         petData.ownerName  || '',
    ownerId:           petData.ownerId    || '',
    pushToken,
    ownerEmail,
    ownerPhone,
    vaccines,
    updatedAt:         Timestamp.now(),
    lastReminderSentAt,
  });
}

// ── Public: Full recompute ────────────────────────────────────────────────────

/**
 * Reads ALL pets and their medical records, computes vaccine reminder status,
 * and writes/updates the entire vaccine_reminder_queue collection.
 *
 * Called on the first Dashboard mount of the week (7-day guard in Dashboard.jsx).
 * Runs fire-and-forget — never blocks the UI.
 *
 * @param {object} clinicSettings - Clinic settings doc (for vaccineReminderWindowDays)
 * @returns {Promise<{ processed: number, queued: number, removed: number }>}
 */
export async function computeFullVaccineReminderQueue(clinicSettings = {}) {
  const windowDays = clinicSettings.vaccineReminderWindowDays ?? 30;

  // Fetch catalog + all pets + all records in parallel to minimize wall time
  const [catalog, petsSnap, recordsSnap] = await Promise.all([
    fetchCatalog(),
    getDocs(collection(db, 'pets')),
    getDocs(collection(db, 'medical_records')),
  ]);

  const allPets    = petsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allRecords = recordsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Index records by petId for O(1) lookup per pet
  const recordsByPet = {};
  for (const r of allRecords) {
    const pid = r.petId;
    if (!pid) continue;
    if (!recordsByPet[pid]) recordsByPet[pid] = [];
    recordsByPet[pid].push(r);
  }

  let processed = 0;
  let queued    = 0;
  let removed   = 0;

  // Process in batches of 10 to avoid overwhelming Firestore with concurrent writes
  const BATCH_SIZE = 10;
  for (let i = 0; i < allPets.length; i += BATCH_SIZE) {
    const batch = allPets.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (pet) => {
      processed++;
      const petRecords = recordsByPet[pet.id] || [];
      const vaccines = computePetVaccineStatuses(
        petRecords,
        catalog,
        pet.species || pet.petSpecies || '',
        windowDays,
      );

      const petData = {
        petName:    pet.name || pet.petName || 'Unknown Pet',
        petSpecies: pet.species || pet.petSpecies || '',
        ownerName:  pet.ownerName || '',
        ownerId:    pet.ownerId || '',
      };

      if (vaccines.length > 0) {
        await writeQueueDoc(pet.id, petData, vaccines);
        queued++;
      } else {
        // Clean up stale docs for pets that no longer need reminders
        try {
          await deleteDoc(doc(db, 'vaccine_reminder_queue', pet.id));
          removed++;
        } catch { /* silent — doc may not exist */ }
      }
    }));
  }

  return { processed, queued, removed };
}

// ── Public: Single-pet recompute (sign-off piggyback) ────────────────────────

/**
 * Recomputes vaccine reminder status for a single pet and writes/updates their
 * queue doc. Called fire-and-forget from ClinicalWorkspace after batch.commit().
 *
 * Fetches only this pet's medical records — zero extra reads for other pets.
 * Skips walk-in pets that have no Firestore petId.
 *
 * @param {string} petId - Firestore pet document ID
 * @param {{ petName, petSpecies, ownerName, ownerId }} petData
 * @param {object} clinicSettings - Clinic settings doc (for vaccineReminderWindowDays)
 * @returns {Promise<void>}
 */
export async function computeSinglePetVaccineReminder(petId, petData, clinicSettings = {}) {
  if (!petId || petId === 'WALK_IN_PET') return;

  const windowDays = clinicSettings.vaccineReminderWindowDays ?? 30;

  const [catalog, recordsSnap] = await Promise.all([
    fetchCatalog(),
    getDocs(query(
      collection(db, 'medical_records'),
      where('petId', '==', petId),
    )),
  ]);

  const records  = recordsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const vaccines = computePetVaccineStatuses(records, catalog, petData.petSpecies || '', windowDays);

  await writeQueueDoc(petId, petData, vaccines);
}

// ── Public: Count pets needing reminders ──────────────────────────────────────

/**
 * Returns the count of pets currently in the queue.
 * Used by ReminderWidget for the badge count on the Dashboard.
 *
 * @returns {Promise<number>}
 */
export async function countVaccineReminderQueue() {
  const snap = await getDocs(collection(db, 'vaccine_reminder_queue'));
  return snap.size;
}

// ── Public: Send vaccine reminders now ───────────────────────────────────────

/**
 * Reads the vaccine_reminder_queue, filters by per-pet cooldown, sends push
 * notifications via the Cloudflare Worker /push endpoint, stamps
 * lastReminderSentAt on each sent doc, and logs to notification_log.
 *
 * Used by the Dashboard "Send Now" button. The Cloudflare Worker Cron handler
 * uses the same logic implemented in Worker JS (Part 6 — not committed to repo).
 *
 * @param {object} clinicSettings - Clinic settings doc (for vaccineReminderCooldownDays)
 * @returns {Promise<{ sent: number, skipped: number, failed: number, noToken: number, total: number, error?: string }>}
 */
export async function sendVaccineReminders(clinicSettings = {}) {
  const cooldownDays = clinicSettings.vaccineReminderCooldownDays ?? 7;
  const cooldownMs   = cooldownDays * 86400000;
  const now          = Date.now();

  // Read entire queue
  const snap    = await getDocs(collection(db, 'vaccine_reminder_queue'));
  const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const total   = entries.length;

  if (total === 0) return { sent: 0, skipped: 0, failed: 0, noToken: 0, total: 0 };

  // Resolve the Cloudflare Worker URL from clinic_settings
  const workerUrl = await getWorkerUrl();
  if (!workerUrl) {
    return {
      sent: 0, skipped: 0, failed: total, noToken: 0, total,
      error: 'Worker URL not configured. Set it in Settings > AI & Notifications.',
    };
  }
  const endpoint = workerUrl.replace(/\/+$/, '') + '/push';

  // Load admin-customized templates from Firestore, falling back to defaults
  let dueTemplate      = DEFAULT_TEMPLATES['vaccine-due'];
  let overdueTemplate  = DEFAULT_TEMPLATES['vaccine-overdue'];
  try {
    const [dueSnap, overdueSnap] = await Promise.all([
      getDoc(doc(db, 'notification_templates', 'vaccine-due')),
      getDoc(doc(db, 'notification_templates', 'vaccine-overdue')),
    ]);
    if (dueSnap.exists() && dueSnap.data().title && dueSnap.data().body) {
      dueTemplate = { title: dueSnap.data().title, body: dueSnap.data().body };
    }
    if (overdueSnap.exists() && overdueSnap.data().title && overdueSnap.data().body) {
      overdueTemplate = { title: overdueSnap.data().title, body: overdueSnap.data().body };
    }
  } catch { /* silent — use DEFAULT_TEMPLATES fallback already set above */ }

  let sent = 0, skipped = 0, failed = 0, noToken = 0;

  await Promise.allSettled(entries.map(async (entry) => {
    // Cooldown guard — skip pets notified recently
    if (entry.lastReminderSentAt) {
      const sentMs = entry.lastReminderSentAt.toDate
        ? entry.lastReminderSentAt.toDate().getTime()
        : (entry.lastReminderSentAt.seconds ? entry.lastReminderSentAt.seconds * 1000 : 0);
      if (now - sentMs < cooldownMs) {
        skipped++;
        return;
      }
    }

    // Token guard — skip pets whose owners have no push token
    const token = entry.pushToken;
    if (!token) {
      noToken++;
      return;
    }

    // Build the notification payload
    const overdueVax = (entry.vaccines || []).filter(v => v.status === 'overdue');
    const dueVax     = (entry.vaccines || []).filter(v => v.status === 'due_soon');
    const allVax     = [...overdueVax, ...dueVax];

    if (allVax.length === 0) {
      skipped++;
      return;
    }

    // Dominant template: overdue if ANY vaccine is overdue
    const template    = overdueVax.length > 0 ? overdueTemplate : dueTemplate;
    const templateKey = overdueVax.length > 0 ? 'vaccine-overdue' : 'vaccine-due';
    const petName     = entry.petName || 'your pet';

    let title, body;
    if (allVax.length === 1) {
      // Single vaccine — use template interpolation directly
      const v = allVax[0];
      const absDays = String(Math.abs(v.daysUntilDue));
      title = template.title
        .replace(/\{petName\}/g, petName)
        .replace(/\{vaccineName\}/g, v.name)
        .replace(/\{days\}/g, absDays);
      body = template.body
        .replace(/\{petName\}/g, petName)
        .replace(/\{vaccineName\}/g, v.name)
        .replace(/\{days\}/g, absDays);
    } else {
      // Multiple vaccines — grouped summary
      const summary = allVax.map(v => {
        const label = v.daysUntilDue < 0
          ? `overdue ${Math.abs(v.daysUntilDue)}d`
          : `due ${v.daysUntilDue}d`;
        return `${v.name} (${label})`;
      }).join(', ');
      title = overdueVax.length > 0 ? 'Overdue Vaccination Alert' : 'Vaccination Reminder';
      body  = `${petName} has ${allVax.length} vaccines needing attention: ${summary}. Book a visit to keep them protected!`;
    }

    // Send push notification via Cloudflare Worker
    try {
      const pushRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pushToken:   token,
          status:      templateKey,
          petName,
          customTitle: title,
          customBody:  body,
        }),
      });
      if (!pushRes.ok) throw new Error(`Worker responded ${pushRes.status}`);

      // Stamp the cooldown timestamp on the queue doc
      await setDoc(doc(db, 'vaccine_reminder_queue', entry.id), {
        lastReminderSentAt: Timestamp.now(),
      }, { merge: true });

      // Log to notification_log — fire-and-forget, never blocks the send count
      addDoc(collection(db, 'notification_log'), {
        ownerId:   entry.ownerId  || null,
        ownerName: entry.ownerName || null,
        status:    templateKey,
        petName,
        title,
        body,
        sentAt:    Timestamp.now(),
        sentBy:    'System (Vaccine Reminder)',
        channel:   'push',
        type:      'vaccine-reminder',
      }).catch(() => {});

      sent++;
    } catch (err) {
      console.error(`[sendVaccineReminders] Failed for pet ${entry.id}:`, err?.message);
      failed++;
    }
  }));

  return { sent, skipped, failed, noToken, total };
}
