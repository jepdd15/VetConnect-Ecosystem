/**
 * sendAppointmentReminders.js
 *
 * One-click reminder sender for the Dashboard (T4.93).
 * Queries tomorrow's confirmed appointments, sends a personalized push
 * notification to each pet owner, and stamps reminderSentAt on each doc
 * to prevent duplicate sends in the same day.
 *
 * Returns { sent, skipped, failed, noToken, total } — never throws.
 */
import {
  collection, query, where, getDocs, getDoc, doc, updateDoc, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { resolvePushToken, getWorkerUrl } from './sendPushNotification';
import { DEFAULT_TEMPLATES } from './notificationTemplateConstants';

// ── Tomorrow's date range ────────────────────────────────────────────────────
// Midnight-to-midnight window for tomorrow using the admin's system clock
// (Asia/Manila — same assumption as Queue.jsx and useDashboardData).
function getTomorrowRange() {
  const now = new Date();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const start = new Date(tomorrow);
  start.setHours(0, 0, 0, 0);

  const end = new Date(tomorrow);
  end.setHours(23, 59, 59, 999);

  // dateKey used for duplicate-send prevention (reminderSentAt day comparison)
  const dateKey = start.toISOString().slice(0, 10);

  return { start, end, dateKey };
}

// ── Placeholder interpolation ────────────────────────────────────────────────
/**
 * Replaces all known {token} placeholders in a template string.
 * Unknown tokens are left unchanged so we never surface undefined to the user.
 */
function interpolate(template, vars) {
  return template
    .replace(/\{petName\}/g,      vars.petName      || 'your pet')
    .replace(/\{time\}/g,         vars.time          || '')
    .replace(/\{date\}/g,         vars.date          || '')
    .replace(/\{vetName\}/g,      vars.vetName       || '')
    .replace(/\{ticketNumber\}/g, vars.ticketNumber  || '')
    .replace(/\{amount\}/g,       vars.amount        || '');
}

// ── Admin-customized template loader ────────────────────────────────────────
/**
 * Reads the 'reminder' doc from the notification_templates collection.
 * Falls back to DEFAULT_TEMPLATES.reminder if the doc is missing or malformed.
 */
async function loadReminderTemplate() {
  try {
    const snap = await getDoc(doc(db, 'notification_templates', 'reminder'));
    if (snap.exists()) {
      const data = snap.data();
      if (data.title && data.body) {
        return { title: data.title, body: data.body };
      }
    }
  } catch {
    // Silent — network or permission failure; fall through to default
  }
  return DEFAULT_TEMPLATES.reminder;
}

// ── Main export: send reminders ──────────────────────────────────────────────
/**
 * Sends push notification reminders for all confirmed appointments tomorrow.
 * Each appointment is processed independently via Promise.allSettled so one
 * failure never blocks the rest.
 *
 * Duplicate prevention: an appointment is skipped if its reminderSentAt field
 * already falls on today's date (the day reminders are sent, not the appointment date).
 *
 * Walk-ins (ownerId === 'WALK_IN_USER' / 'UNKNOWN') are always skipped — they
 * have no mobile app account to receive push notifications.
 *
 * @returns {Promise<{ sent: number, skipped: number, failed: number, noToken: number, total: number }>}
 */
export async function sendAppointmentReminders() {
  const { start, end, dateKey } = getTomorrowRange();
  const startTs = Timestamp.fromDate(start);
  const endTs   = Timestamp.fromDate(end);

  // 1. Query tomorrow's confirmed appointments
  const q = query(
    collection(db, 'appointments'),
    where('status', '==', 'confirmed'),
    where('scheduledDate', '>=', startTs),
    where('scheduledDate', '<=', endTs),
  );

  const snap = await getDocs(q);
  const appointments = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const total = appointments.length;
  if (total === 0) return { sent: 0, skipped: 0, failed: 0, noToken: 0, total: 0 };

  // 2. Load the admin-customized reminder template (or default)
  const template = await loadReminderTemplate();

  // 3. Resolve worker URL once — fail fast if not configured
  const workerUrl = await getWorkerUrl();
  if (!workerUrl) {
    return {
      sent: 0, skipped: 0, failed: total, noToken: 0, total,
      error: 'Worker URL not configured. Set it in Settings > AI & Notifications.',
    };
  }
  const endpoint = workerUrl.replace(/\/+$/, '') + '/push';

  // 4. Send reminders in parallel, collecting per-item counters
  let sent = 0, skipped = 0, failed = 0, noToken = 0;

  await Promise.allSettled(
    appointments.map(async (appt) => {
      // 4a. Duplicate check — skip if a reminder was already sent today
      if (appt.reminderSentAt) {
        const sentDate = appt.reminderSentAt.toDate
          ? appt.reminderSentAt.toDate()
          : new Date(appt.reminderSentAt);
        if (sentDate.toISOString().slice(0, 10) === dateKey) {
          skipped++;
          return;
        }
      }

      // 4b. Skip walk-in appointments — no mobile account
      const ownerId = appt.ownerId;
      if (!ownerId || ownerId === 'WALK_IN_USER' || ownerId === 'UNKNOWN') {
        skipped++;
        return;
      }

      // 4c. Resolve push token — count separately from failures
      const pushToken = await resolvePushToken(ownerId);
      if (!pushToken) {
        noToken++;
        return;
      }

      // 4d. Build personalized message from the appointment data
      const schDate = appt.scheduledDate?.toDate
        ? appt.scheduledDate.toDate()
        : new Date(appt.scheduledDate);

      const timeStr = schDate.toLocaleTimeString('en-PH', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      const dateStr = schDate.toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      const vars = {
        petName: appt.petName || 'your pet',
        time: timeStr,
        date: dateStr,
        vetName: appt.assignedVet || '',
      };

      const title = interpolate(template.title, vars);
      const body  = interpolate(template.body,  vars);

      // 4e. POST to Cloudflare Worker /push endpoint
      try {
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pushToken,
            status: 'reminder',
            petName: vars.petName,
            customTitle: title,
            customBody: body,
            appointmentId: appt.id,
          }),
        });

        // 4f. Stamp reminderSentAt to prevent re-sending today
        await updateDoc(doc(db, 'appointments', appt.id), {
          reminderSentAt: Timestamp.now(),
        });

        sent++;
      } catch (err) {
        console.error(`[sendAppointmentReminders] Failed for ${appt.id}:`, err?.message);
        failed++;
      }
    }),
  );

  return { sent, skipped, failed, noToken, total };
}

// ── Pre-flight count ─────────────────────────────────────────────────────────
/**
 * Returns the number of confirmed appointments tomorrow without sending anything.
 * Used by ReminderWidget to display the count before the user clicks Send.
 */
export async function countTomorrowAppointments() {
  const { start, end } = getTomorrowRange();
  const q = query(
    collection(db, 'appointments'),
    where('status', '==', 'confirmed'),
    where('scheduledDate', '>=', Timestamp.fromDate(start)),
    where('scheduledDate', '<=', Timestamp.fromDate(end)),
  );
  const snap = await getDocs(q);
  return snap.size;
}
