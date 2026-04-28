/**
 * sendPushNotification.js
 *
 * Fire-and-forget push notification utility for VetConnect Admin (T4.90).
 * POSTs to the Cloudflare Worker /push endpoint. Never blocks the UI.
 * Never causes a status write to fail.
 */
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// ─── Module-level caches ─────────────────────────────────────────────────────
const tokenCache = new Map(); // ownerId → expoPushToken | null
let cachedWorkerUrl = undefined; // undefined = not fetched, null = fetched but empty, string = ready

// ─── Token resolver ──────────────────────────────────────────────────────────
/**
 * Resolves the Expo push token for a given ownerId.
 * Caches results per session to avoid repeated Firestore reads.
 * Returns null if user doc doesn't exist or has no token.
 */
export async function resolvePushToken(ownerId) {
  if (!ownerId || ownerId === 'WALK_IN_USER' || ownerId === 'UNKNOWN') return null;
  if (tokenCache.has(ownerId)) return tokenCache.get(ownerId);

  try {
    const userSnap = await getDoc(doc(db, 'users', ownerId));
    const token = userSnap.exists() ? (userSnap.data().expoPushToken || null) : null;
    tokenCache.set(ownerId, token);
    return token;
  } catch {
    tokenCache.set(ownerId, null);
    return null;
  }
}

// ─── Worker URL resolver ─────────────────────────────────────────────────────
/**
 * Reads the workerUrl from clinic_settings/llm_config (same doc as the LLM system).
 * Caches for the page session. Returns null if not configured.
 */
export async function getWorkerUrl() {
  if (cachedWorkerUrl !== undefined) return cachedWorkerUrl;

  try {
    const snap = await getDoc(doc(db, 'clinic_settings', 'llm_config'));
    cachedWorkerUrl = snap.exists() ? (snap.data().workerUrl || null) : null;
    return cachedWorkerUrl;
  } catch {
    cachedWorkerUrl = null;
    return null;
  }
}

// ─── Notification template cache ────────────────────────────────────────────
let templateCache = undefined; // undefined = not loaded yet, Map = loaded

export function invalidateTemplateCache() {
  templateCache = undefined;
}

/**
 * One-shot loader: reads all notification_templates docs from Firestore.
 * Returns a Map<statusKey, { title, body }>.
 * Caches for the page session — same pattern as tokenCache and cachedWorkerUrl.
 * Silent fallback to empty Map if the collection is unreadable.
 */
async function loadNotificationTemplates() {
  if (templateCache !== undefined) return templateCache;

  try {
    const snap = await getDocs(collection(db, 'notification_templates'));
    const map = new Map();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.title && data.body) {
        map.set(d.id, { title: data.title, body: data.body });
      }
    });
    templateCache = map;
    return map;
  } catch {
    templateCache = new Map(); // Silent fallback — push will use Worker defaults
    return templateCache;
  }
}

/**
 * Returns { customTitle, customBody } if the admin has customized the template
 * for the given status key. Returns null if no override exists.
 */
async function getCustomTemplate(status) {
  const templates = await loadNotificationTemplates();
  const tpl = templates.get(status);
  return tpl ? { customTitle: tpl.title, customBody: tpl.body } : null;
}

// ─── Main push function ──────────────────────────────────────────────────────
/**
 * Sends a push notification to the pet owner via the Cloudflare Worker.
 * FIRE AND FORGET — never awaited by callers, never throws, never blocks.
 *
 * @param {object} params
 * @param {string} params.ownerId - Firestore user ID of the pet owner
 * @param {string} params.status - The new appointment status
 * @param {string} [params.petName] - Pet name for template interpolation
 * @param {string} [params.vetName] - Vet/staff name for template interpolation
 * @param {string|number} [params.ticketNumber] - Queue ticket number
 * @param {string} [params.appointmentId] - Appointment doc ID
 * @param {string} [params.visitGroupId] - Multi-pet visit group ID
 * @param {string} [params.customTitle] - Override title (from notification_templates)
 * @param {string} [params.customBody] - Override body (from notification_templates)
 */
export function sendPushNotification({
  ownerId,
  status,
  petName,
  vetName,
  ticketNumber,
  appointmentId,
  visitGroupId,
  customTitle,
  customBody,
}) {
  // Guard: walk-ins and unknown owners have no mobile app
  if (!ownerId || ownerId === 'WALK_IN_USER' || ownerId === 'UNKNOWN') return;

  // Internal async work — fire and forget
  _dispatchPush({
    ownerId, status, petName, vetName, ticketNumber,
    appointmentId, visitGroupId, customTitle, customBody,
  }).catch((err) => {
    console.error('[sendPushNotification] Silent failure:', err?.message || err);
  });
}

// ─── Internal dispatch (async, never exposed) ────────────────────────────────
async function _dispatchPush({ ownerId, status, petName, vetName, ticketNumber, appointmentId, visitGroupId, customTitle, customBody }) {
  const [pushToken, workerUrl] = await Promise.all([
    resolvePushToken(ownerId),
    getWorkerUrl(),
  ]);

  if (!pushToken || !workerUrl) return; // Silent exit — not configured or no token

  // Auto-resolve admin-customized template if the caller did not provide explicit overrides.
  // The 4 call sites that pass customTitle/customBody (revert, reschedule, carry-over) still take priority.
  let finalTitle = customTitle;
  let finalBody = customBody;
  if (!finalTitle && !finalBody && status) {
    const custom = await getCustomTemplate(status);
    if (custom) {
      finalTitle = custom.customTitle;
      finalBody = custom.customBody;
    }
  }

  const endpoint = workerUrl.replace(/\/+$/, '') + '/push';

  await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pushToken,
      status,
      petName: petName || 'your pet',
      vetName: vetName || '',
      ticketNumber: ticketNumber || '',
      appointmentId: appointmentId || '',
      visitGroupId: visitGroupId || '',
      ...(finalTitle ? { customTitle: finalTitle } : {}),
      ...(finalBody ? { customBody: finalBody } : {}),
    }),
  });
}
