/**
 * appointmentReminderQueue.js — T4.126
 *
 * Pre-computed queue for the Cloudflare Worker Cron to read at 7 AM daily.
 * Same architecture as vaccineReminderQueue.js (T3.55).
 *
 * Queue doc schema (appointment_reminder_queue/{appointmentId}):
 * {
 *   appointmentId: string,
 *   petName: string,
 *   ownerName: string,
 *   ownerId: string,
 *   pushToken: string | null,
 *   scheduledDate: Timestamp,
 *   scheduledTime: string,         // e.g. "2:00 PM"
 *   remindersSent: {
 *     headsUp: Timestamp | null,
 *     tomorrow: Timestamp | null,
 *     today: Timestamp | null,
 *   },
 *   updatedAt: Timestamp,
 * }
 */
import {
  collection, doc, getDocs, getDoc, setDoc, deleteDoc, addDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { resolvePushToken, getWorkerUrl } from './sendPushNotification';
import { DEFAULT_TEMPLATES } from './notificationTemplateConstants';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Walk-in sentinel values that must never receive reminders. */
const WALK_IN_OWNER_IDS = new Set(['WALK_IN_USER', 'UNKNOWN']);

/**
 * Returns true if the appointment is a walk-in that should be skipped.
 * @param {string|null|undefined} ownerId
 */
function isWalkIn(ownerId) {
  return !ownerId || WALK_IN_OWNER_IDS.has(ownerId);
}

/**
 * Converts a Firestore Timestamp or raw value to a JS Date.
 * @param {import('firebase/firestore').Timestamp|Date|string|number} value
 * @returns {Date}
 */
function toDate(value) {
  if (!value) return new Date();
  if (value?.toDate) return value.toDate();
  return new Date(value);
}

/**
 * Formats a Date to "2:00 PM" style using Philippine locale.
 * @param {Date} date
 * @returns {string}
 */
function formatTime(date) {
  return date.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Calendar-day difference between scheduledDate and a reference "today" Date.
 * Uses date-only comparison — time-of-day is stripped before diffing.
 * Both dates must already be in Manila timezone.
 *
 * @param {import('firebase/firestore').Timestamp|Date} scheduledDate
 * @param {Date} today - Manila-adjusted "today"
 * @returns {number} Positive = future, negative = past, 0 = today
 */
function getDayDiff(scheduledDate, today) {
  const schDate = toDate(scheduledDate);
  const schDay  = new Date(schDate.getFullYear(), schDate.getMonth(), schDate.getDate());
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((schDay - todayDay) / 86400000);
}

/**
 * Returns today's Date adjusted for Asia/Manila timezone.
 * Strips time-of-day so only the calendar date is meaningful.
 * @returns {Date}
 */
function getManilaToday() {
  const manilaStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });
  const manila    = new Date(manilaStr);
  // Return a date-only Date in local coordinates that matches Manila's calendar date
  return new Date(manila.getFullYear(), manila.getMonth(), manila.getDate());
}

// ── Public: Write a single appointment queue doc ──────────────────────────────

/**
 * Writes or updates a single appointment_reminder_queue/{appointmentId} doc.
 * Called fire-and-forget on appointment confirmation.
 *
 * Skips walk-in appointments (ownerId falsy or sentinel value).
 * Preserves any existing remindersSent entries — does NOT clear them on write
 * (clearing happens explicitly on reschedule via updateAppointmentQueueDate).
 *
 * @param {{ id: string, petName: string, ownerName: string, ownerId: string, scheduledDate: Timestamp }} appointment
 * @returns {Promise<void>}
 */
export async function writeAppointmentQueueDoc(appointment) {
  if (!appointment?.id) return;
  if (isWalkIn(appointment.ownerId)) return;

  const pushToken    = await resolvePushToken(appointment.ownerId);
  const schDate      = toDate(appointment.scheduledDate);
  const scheduledTime = formatTime(schDate);

  // Preserve any existing remindersSent — re-writing on confirmation must not
  // reset stages that were already stamped (e.g. headsUp sent, then vet confirms a change).
  let existingRemindersSent = { headsUp: null, tomorrow: null, today: null };
  try {
    const existing = await getDoc(doc(db, 'appointment_reminder_queue', appointment.id));
    if (existing.exists()) {
      existingRemindersSent = existing.data().remindersSent || existingRemindersSent;
    }
  } catch { /* silent — treat as no prior doc */ }

  await setDoc(doc(db, 'appointment_reminder_queue', appointment.id), {
    appointmentId:  appointment.id,
    petName:        appointment.petName    || 'your pet',
    ownerName:      appointment.ownerName  || '',
    ownerId:        appointment.ownerId,
    pushToken,
    scheduledDate:  appointment.scheduledDate instanceof Timestamp
      ? appointment.scheduledDate
      : Timestamp.fromDate(schDate),
    scheduledTime,
    remindersSent:  existingRemindersSent,
    updatedAt:      Timestamp.now(),
  });
}

// ── Public: Remove a queue doc ────────────────────────────────────────────────

/**
 * Deletes the appointment_reminder_queue doc for the given appointment.
 * Called fire-and-forget on cancellation, no-show, or completion.
 * Silently ignores missing docs.
 *
 * @param {string} appointmentId
 * @returns {Promise<void>}
 */
export async function removeAppointmentQueueDoc(appointmentId) {
  if (!appointmentId) return;
  try {
    await deleteDoc(doc(db, 'appointment_reminder_queue', appointmentId));
  } catch { /* silent — doc may not exist */ }
}

// ── Public: Update date on reschedule ────────────────────────────────────────

/**
 * Updates the queue doc with a new scheduled date and clears all remindersSent
 * stages to null. Re-resolves the push token in case it changed.
 *
 * Called fire-and-forget after a reschedule transaction commits.
 *
 * @param {string} appointmentId
 * @param {import('firebase/firestore').Timestamp} newScheduledDate
 * @param {{ ownerId: string, petName: string, ownerName: string }} appointment
 * @returns {Promise<void>}
 */
export async function updateAppointmentQueueDate(appointmentId, newScheduledDate, appointment) {
  if (!appointmentId) return;
  const ownerId = appointment?.ownerId;
  if (isWalkIn(ownerId)) return;

  const pushToken = await resolvePushToken(ownerId);
  const schDate   = toDate(newScheduledDate);
  const scheduledTime = formatTime(schDate);

  await setDoc(doc(db, 'appointment_reminder_queue', appointmentId), {
    appointmentId,
    petName:       appointment.petName   || 'your pet',
    ownerName:     appointment.ownerName || '',
    ownerId,
    pushToken,
    scheduledDate: newScheduledDate instanceof Timestamp
      ? newScheduledDate
      : Timestamp.fromDate(schDate),
    scheduledTime,
    // Clearing remindersSent ensures all 3 stages can fire for the new date.
    remindersSent: { headsUp: null, tomorrow: null, today: null },
    updatedAt:     Timestamp.now(),
  });
}

// ── Public: Send reminders from queue ────────────────────────────────────────

/**
 * Reads the full appointment_reminder_queue collection, evaluates each doc's
 * scheduledDate against today (Manila timezone), and sends push notifications
 * for any of the 3 stages that are due and not yet sent:
 *   - headsUp  → dayDiff === appointmentReminderHeadsUpDays  (default 3)
 *   - tomorrow → dayDiff === 1
 *   - today    → dayDiff === 0
 *
 * On a successful send, stamps the stage in remindersSent and logs to
 * notification_log. Returns a summary object.
 *
 * Used by the Dashboard "Send Reminders" button.
 * The Cloudflare Worker Cron uses the same logic in Worker JS (Part 5).
 *
 * @param {object} clinicSettings - Clinic settings doc
 * @param {string} [staffName]    - Name displayed in sentBy log field
 * @returns {Promise<{ sent: number, skipped: number, failed: number, noToken: number, total: number, error?: string }>}
 */
export async function sendAppointmentRemindersFromQueue(clinicSettings = {}, staffName = 'Staff') {
  const headsUpDays = clinicSettings.appointmentReminderHeadsUpDays ?? 3;
  const today       = getManilaToday();

  // Resolve the Cloudflare Worker URL from clinic_settings
  const workerUrl = await getWorkerUrl();
  if (!workerUrl) {
    return {
      sent: 0, skipped: 0, failed: 0, noToken: 0, total: 0,
      error: 'Worker URL not configured. Set it in Settings > AI & Notifications.',
    };
  }
  const endpoint = workerUrl.replace(/\/+$/, '') + '/push';

  // Read the full queue
  const snap    = await getDocs(collection(db, 'appointment_reminder_queue'));
  const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const total   = entries.length;

  if (total === 0) return { sent: 0, skipped: 0, failed: 0, noToken: 0, total: 0 };

  // Load admin-customized templates from Firestore, falling back to defaults
  const templateCache = {};
  const templateKeys  = ['appointment-upcoming', 'appointment-tomorrow', 'appointment-today'];
  try {
    await Promise.all(templateKeys.map(async (key) => {
      const tSnap = await getDoc(doc(db, 'notification_templates', key));
      if (tSnap.exists() && tSnap.data().title && tSnap.data().body) {
        templateCache[key] = { title: tSnap.data().title, body: tSnap.data().body };
      } else {
        templateCache[key] = DEFAULT_TEMPLATES[key];
      }
    }));
  } catch {
    // Fallback: use DEFAULT_TEMPLATES for all keys
    templateKeys.forEach(key => { templateCache[key] = DEFAULT_TEMPLATES[key]; });
  }

  let sent = 0, skipped = 0, failed = 0, noToken = 0;

  await Promise.allSettled(entries.map(async (entry) => {
    if (!entry.pushToken) {
      noToken++;
      return;
    }

    const dayDiff = getDayDiff(entry.scheduledDate, today);

    // Build list of stages to fire for this entry
    const rs       = entry.remindersSent || {};
    const toSend   = [];

    if (dayDiff === headsUpDays && !rs.headsUp) {
      toSend.push({ stage: 'headsUp', templateKey: 'appointment-upcoming', days: String(dayDiff) });
    }
    if (dayDiff === 1 && !rs.tomorrow) {
      toSend.push({ stage: 'tomorrow', templateKey: 'appointment-tomorrow', days: '1' });
    }
    if (dayDiff === 0 && !rs.today) {
      toSend.push({ stage: 'today', templateKey: 'appointment-today', days: '0' });
    }

    if (toSend.length === 0) {
      skipped++;
      return;
    }

    const petName = entry.petName || 'your pet';

    for (const { stage, templateKey, days } of toSend) {
      const template = templateCache[templateKey] || DEFAULT_TEMPLATES[templateKey];
      const title = template.title
        .replace(/\{petName\}/g, petName)
        .replace(/\{days\}/g,    days);
      const body  = template.body
        .replace(/\{petName\}/g, petName)
        .replace(/\{days\}/g,    days);

      try {
        const pushRes = await fetch(endpoint, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            pushToken:   entry.pushToken,
            status:      templateKey,
            petName,
            customTitle: title,
            customBody:  body,
          }),
        });
        if (!pushRes.ok) throw new Error(`Worker responded ${pushRes.status}`);

        // Stamp the stage so it does not fire again
        await setDoc(
          doc(db, 'appointment_reminder_queue', entry.id),
          { remindersSent: { ...rs, [stage]: Timestamp.now() }, updatedAt: Timestamp.now() },
          { merge: true },
        );

        // Log to notification_log — fire-and-forget, never blocks the send count
        addDoc(collection(db, 'notification_log'), {
          ownerId:       entry.ownerId    || null,
          ownerName:     entry.ownerName  || null,
          status:        templateKey,
          petName,
          title,
          body,
          appointmentId: entry.id,
          sentAt:        Timestamp.now(),
          sentBy:        `System (Appointment Cron) — ${staffName}`,
          channel:       'push',
          type:          'appointment-reminder',
        }).catch(() => {});

        sent++;
      } catch (err) {
        console.error(`[sendAppointmentRemindersFromQueue] Failed for ${entry.id} stage ${stage}:`, err?.message);
        failed++;
      }
    }
  }));

  return { sent, skipped, failed, noToken, total };
}

// ── Public: Count queue entries ───────────────────────────────────────────────

/**
 * Returns the total count of docs currently in appointment_reminder_queue.
 * Used by ReminderWidget for the badge count on the Dashboard.
 *
 * @returns {Promise<number>}
 */
export async function countAppointmentReminderQueue() {
  const snap = await getDocs(collection(db, 'appointment_reminder_queue'));
  return snap.size;
}
