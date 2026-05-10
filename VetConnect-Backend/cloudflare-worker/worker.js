// ============================================================================
// VetConnect Cloudflare Worker — AI Proxy + Push + Email + SMS Notification Relay
// Deployed at: https://cool-fire-2d53.jepdd15.workers.dev
//
// THIS FILE IS A REFERENCE COPY. The live Worker is deployed via the
// Cloudflare Dashboard Quick Edit — NOT from this file. Keep this in sync
// manually after any Dashboard edits.
//
// Endpoints:
//   POST /            — AI Clinical Reasoning proxy (Anthropic Claude API)
//   POST /push        — Automatic status notification relay (Expo Push API)
//   POST /push/custom — Free-text notification relay (Expo Push API)
//   POST /email       — Email relay (Resend API)
//   POST /sms         — SMS relay (Semaphore API)
//   OPTIONS *         — CORS preflight
//
// Cron Trigger:
//   0 23 * * * (23:00 UTC = 07:00 AM Asia/Manila daily)
//   Runs: handleVaccineReminders + handleAppointmentReminders
//   Each handler sends push + email (all types) + SMS (critical types only)
//
// Environment variables (set in Cloudflare Dashboard > Workers > Settings):
//   ANTHROPIC_API_KEY      — Claude API key
//   FIREBASE_API_KEY       — Firebase web API key (for Firestore REST reads/writes)
//   RESEND_API_KEY         — Resend email API key (T4.135)
//   RESEND_FROM_EMAIL      — Sender address (default: VetConnect <noreply@starbarks.vet>)
//   SEMAPHORE_API_KEY      — Semaphore SMS API key (T4.135)
//   SEMAPHORE_SENDER_NAME  — SMS sender name (default: STARBARKS)
//
// Last synced: 2026-05-04
// ============================================================================

// ─── PUSH NOTIFICATION TEMPLATES ──────────────────────────────────────────────

const DEFAULT_TEMPLATES = {
  'confirmed': {
    title: 'Booking Confirmed!',
    body: 'Your appointment for {petName} has been approved. See you soon!',
  },
  'cancelled': {
    title: 'Appointment Cancelled',
    body: 'Your booking for {petName} was cancelled. Tap to see details.',
  },
  'arrived': {
    title: 'You are Checked In!',
    body: '{petName} is checked in — ticket #{ticketNumber}. Please watch the Lobby Monitor.',
  },
  'in-consult': {
    title: "It's Your Turn!",
    body: 'The vet is ready for {petName}. Please proceed to the consultation room.',
  },
  'on-hold': {
    title: 'Consultation Paused',
    body: "{petName}'s consultation has been paused. We'll notify you when it resumes.",
  },
  'resumed': {
    title: 'Consultation Resumed',
    body: "{petName}'s consultation has resumed with {vetName}.",
  },
  'dispensing': {
    title: 'Prescriptions Ready',
    body: 'Medications for {petName} are being prepared at the pharmacy.',
  },
  'billing': {
    title: 'Ready for Checkout',
    body: 'Services for {petName} are complete. Please proceed to the cashier.',
  },
  'completed': {
    title: 'Visit Complete',
    body: "{petName}'s visit is complete. Total: PHP {amount}. Thank you for choosing Starbarks!",
  },
  'no-show': {
    title: 'Missed Appointment',
    body: 'Your appointment for {petName} was marked as a no-show. Please rebook if needed.',
  },
  'carried-over': {
    title: 'Appointment Carried Over',
    body: "{petName}'s visit has been carried over to tomorrow. We'll see you then!",
  },
  'confined': {
    title: 'Pet Admitted',
    body: "{petName} has been admitted for observation/confinement. We'll keep you updated.",
  },
  'appointment-upcoming': {
    title: 'Upcoming Appointment',
    body: "{petName} has an appointment in {days} days at Starbarks. We look forward to seeing you!",
  },
  'appointment-tomorrow': {
    title: 'Appointment Tomorrow!',
    body: "Tomorrow! {petName}'s appointment is scheduled. Please arrive 10 minutes early for check-in.",
  },
  'appointment-today': {
    title: "Today's Appointment",
    body: "Today is the day! {petName}'s appointment is today. Please arrive 10 minutes early. See you soon!",
  },
  // T4.147: Balance reminder template (also registered in BALANCE_TEMPLATES below)
  'balance-reminder': {
    title: 'Outstanding Balance Reminder',
    body: 'You have ₱{amount} outstanding from a previous visit. Please settle at your next visit or contact us.',
  },
  // T4.202: Per-service progress notifications (multi-service appointments only)
  // MANUAL DEPLOY REQUIRED — paste this file into the Cloudflare Worker dashboard after changes.
  'service-started': {
    title: 'Service Started!',
    body: "Great news! {serviceName} has started for {petName}. {staffName} is taking care of it.",
  },
  'service-completed': {
    title: 'Service Complete!',
    body: "{serviceName} is done for {petName}! {nextService}",
  },
};

function interpolateTemplate(template, data) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return data[key] !== undefined && data[key] !== null ? String(data[key]) : match;
  });
}

// ── Email HTML builder (standalone — cannot import from admin codebase) ────────
// Uses design tokens: Espresso #3E2723, Cream #FFF8E1, warm neutral #F5F0EB.
function buildWorkerEmailHtml(title, body) {
  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F5F0EB;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:24px auto;background:#FFFFFF;border:2px solid #3E2723;">
    <tr><td style="background:#3E2723;padding:18px 24px;"><h1 style="margin:0;color:#FFF8E1;font-size:18px;font-weight:900;letter-spacing:0.04em;">Starbarks Veterinary Clinic</h1></td></tr>
    <tr><td style="padding:28px 24px 12px;"><h2 style="margin:0 0 12px;color:#3E2723;font-size:16px;font-weight:800;">${esc(title)}</h2><p style="margin:0;color:#5D4037;font-size:14px;line-height:1.6;">${esc(body).replace(/\n/g, '<br>')}</p></td></tr>
    <tr><td style="padding:20px 24px;border-top:1px solid #E0D6CC;"><p style="margin:0;color:#A1887F;font-size:11px;">This is an automated message from Starbarks Veterinary Clinic. Please do not reply.</p></td></tr>
  </table>
</body></html>`;
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

// ─── SHARED EXPO PUSH SENDER ─────────────────────────────────────────────────

async function sendToExpo(pushToken, title, body, extraData) {
  try {
    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        sound: 'default',
        title,
        body,
        data: {
          screen: 'ClientAppointments',
          ...extraData,
        },
      }),
    });

    if (!expoResponse.ok) {
      const errorText = await expoResponse.text();
      return jsonResponse({
        error: 'Expo Push API error.',
        details: errorText,
        expoStatus: expoResponse.status,
      }, 502);
    }

    const expoData = await expoResponse.json();
    return jsonResponse({ success: true, expo: expoData });
  } catch (err) {
    return jsonResponse({
      error: 'Failed to reach Expo Push API.',
      details: err.message,
    }, 502);
  }
}

// ─── PUSH HANDLERS ───────────────────────────────────────────────────────────

async function handlePush(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const {
    pushToken, status, petName, vetName, date, amount, ticketNumber,
    appointmentId, visitGroupId, customTitle, customBody,
    // T4.202: service progress placeholders
    serviceName, staffName, nextService,
  } = payload;

  if (!pushToken) return jsonResponse({ error: 'pushToken is required.' }, 400);
  if (!status) return jsonResponse({ error: 'status is required.' }, 400);

  let title, body;
  if (customTitle && customBody) {
    title = customTitle;
    body = customBody;
  } else {
    const template = DEFAULT_TEMPLATES[status];
    if (!template) {
      return jsonResponse({ error: `No template for status: "${status}".` }, 400);
    }
    title = template.title;
    body = template.body;
  }

  const data = {
    petName: petName || 'your pet', vetName, date, amount, ticketNumber,
    // T4.202: service progress placeholders
    serviceName: serviceName || '', staffName: staffName || '', nextService: nextService || '',
  };
  title = interpolateTemplate(title, data);
  body = interpolateTemplate(body, data);

  return sendToExpo(pushToken, title, body, { appointmentId, visitGroupId });
}

async function handleCustomPush(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const { pushToken, title, body } = payload;

  if (!pushToken) return jsonResponse({ error: 'pushToken is required.' }, 400);
  if (!title) return jsonResponse({ error: 'title is required.' }, 400);
  if (!body) return jsonResponse({ error: 'body is required.' }, 400);

  return sendToExpo(pushToken, title, body, {});
}

// ─── EMAIL RELAY (Resend API) ────────────────────────────────────────────────

async function handleEmail(request, env) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: 'RESEND_API_KEY not configured.' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const { to, subject, html, from } = payload;
  if (!to)      return jsonResponse({ error: 'to is required.' }, 400);
  if (!subject) return jsonResponse({ error: 'subject is required.' }, 400);
  if (!html)    return jsonResponse({ error: 'html is required.' }, 400);

  const fromAddress = from || env.RESEND_FROM_EMAIL || 'VetConnect <noreply@starbarks.vet>';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return jsonResponse({ error: 'Resend API error.', details: errText, resendStatus: res.status }, 502);
    }

    const data = await res.json();
    return jsonResponse({ success: true, resend: data });
  } catch (err) {
    return jsonResponse({ error: 'Failed to reach Resend API.', details: err.message }, 502);
  }
}

// ─── SMS RELAY (Semaphore API) ───────────────────────────────────────────────

async function handleSms(request, env) {
  const apiKey = env.SEMAPHORE_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: 'SEMAPHORE_API_KEY not configured.' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const { to, message } = payload;
  if (!to)      return jsonResponse({ error: 'to (phone number) is required.' }, 400);
  if (!message) return jsonResponse({ error: 'message is required.' }, 400);

  try {
    const res = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: apiKey,
        number: to,
        message,
        sendername: env.SEMAPHORE_SENDER_NAME || 'STARBARKS',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return jsonResponse({ error: 'Semaphore API error.', details: errText, semaphoreStatus: res.status }, 502);
    }

    const data = await res.json();
    return jsonResponse({ success: true, semaphore: data });
  } catch (err) {
    return jsonResponse({ error: 'Failed to reach Semaphore API.', details: err.message }, 502);
  }
}

// ─── AI CLINICAL REASONING PROXY ─────────────────────────────────────────────

async function handleAiProxy(request, env) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured.' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: payload.system || '',
        messages: payload.messages || [],
      }),
    });

    const data = await anthropicResponse.json();
    return jsonResponse(data, anthropicResponse.status);
  } catch (err) {
    return jsonResponse({ error: 'Anthropic API unreachable.', details: err.message }, 502);
  }
}

// ── Vaccine Reminder Cron (T3.55) ─────────────────────────────────────────

// Step 4.5: Dose placeholders added — {doseNumber}/{totalDoses} interpolated at send time.
// Post-interpolation cleanup strips "(Dose X/Y)" when either side is not a digit (legacy path).
// MANUAL DEPLOY required — paste to Cloudflare Dashboard Workers editor after updating this file.
const VACCINE_TEMPLATES = {
  'vaccine-due': {
    title: 'Vaccination Reminder',
    body: "Time for {petName}'s checkup! Their {vaccineName} vaccine (Dose {doseNumber}/{totalDoses}) is due in {days} days. Book a visit to keep them protected!",
  },
  'vaccine-overdue': {
    title: 'Overdue Vaccination Alert',
    body: "Warning: {petName}'s {vaccineName} vaccine (Dose {doseNumber}/{totalDoses}) is overdue by {days} days. Please book as soon as possible.",
  },
};

// T4.147: Balance reminder templates — amount is interpolated at send time.
const BALANCE_TEMPLATES = {
  'balance-reminder': {
    title: 'Outstanding Balance Reminder',
    body: 'You have ₱{amount} outstanding from a previous visit. Please settle at your next visit or contact us for payment options.',
  },
};

async function handleVaccineReminders(env) {
  const FIREBASE_API_KEY = env.FIREBASE_API_KEY;
  const PROJECT_ID = 'starbarks-vetconnect-f6443';

  const settingsUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/clinic_settings/general?key=${FIREBASE_API_KEY}`;
  const settingsRes = await fetch(settingsUrl);
  if (!settingsRes.ok) { console.error('Failed to read clinic_settings:', settingsRes.status); return; }
  const settingsFields = (await settingsRes.json()).fields || {};

  if (settingsFields.enableVaccineReminders?.booleanValue === false) {
    console.log('Vaccine reminders disabled. Skipping.'); return;
  }

  // Channel settings — email defaults true, SMS is never sent for vaccine reminders
  const emailEnabled = settingsFields.enableEmailNotifications?.booleanValue !== false;

  const cooldownDays = parseInt(settingsFields.vaccineReminderCooldownDays?.integerValue || '7');
  const cooldownMs = cooldownDays * 86400000;
  const now = Date.now();

  const queueUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/vaccine_reminder_queue?key=${FIREBASE_API_KEY}&pageSize=500`;
  const queueRes = await fetch(queueUrl);
  if (!queueRes.ok) { console.error('Failed to read queue:', queueRes.status); return; }
  const documents = (await queueRes.json()).documents || [];

  if (documents.length === 0) { console.log('No pets in queue. Skipping.'); return; }

  let sent = 0, skipped = 0, failed = 0, noToken = 0;

  for (const docEntry of documents) {
    const fields = docEntry.fields || {};
    const docName = docEntry.name;
    const pushToken = fields.pushToken?.stringValue;
    const petName = fields.petName?.stringValue || 'your pet';
    const ownerId = fields.ownerId?.stringValue || '';
    const ownerName = fields.ownerName?.stringValue || '';

    // Step 4.3/4.4: Also extract catalogId, doseNumber, totalDoses for preference filtering
    // and dose placeholder interpolation. catalogId written by vaccineReminderQueue.js (Step 4.4).
    const vaccinesArr = (fields.vaccines?.arrayValue?.values || []).map(v => {
      const m = v.mapValue?.fields || {};
      return {
        name:         m.name?.stringValue        || '',
        status:       m.status?.stringValue       || '',
        daysUntilDue: parseInt(m.daysUntilDue?.integerValue || '0'),
        catalogId:    m.catalogId?.stringValue    || '',
        doseNumber:   m.doseNumber?.integerValue  || m.doseNumber?.stringValue || '',
        totalDoses:   m.totalDoses?.integerValue  || m.totalDoses?.stringValue || '',
      };
    });

    const lastSentTs = fields.lastReminderSentAt?.timestampValue;
    if (lastSentTs && (now - new Date(lastSentTs).getTime()) < cooldownMs) { skipped++; continue; }

    if (!pushToken) { noToken++; continue; }

    // Step 4.3: Read vaccine_preferences for this pet — filter out disabled vaccines.
    // Non-blocking: if the read fails for any reason, send all reminders unfiltered.
    // Path: vaccine_preferences/{petId} — ROOT collection (public read rule allows
    // unauthenticated Worker access; subcollection under users/{} would require auth).
    // MANUAL DEPLOY required — paste to Cloudflare Dashboard Workers editor.
    const petId = docName.split('/').pop();
    let disabledVaccines = [];
    if (petId) {
      try {
        const prefUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/vaccine_preferences/${petId}?key=${FIREBASE_API_KEY}`;
        const prefRes = await fetch(prefUrl);
        if (prefRes.ok) {
          const prefFields = (await prefRes.json()).fields || {};
          disabledVaccines = (prefFields.disabledVaccines?.arrayValue?.values || [])
            .map(v => v.stringValue)
            .filter(Boolean);
        }
      } catch {
        // Non-critical — if read fails, send all reminders (no filtering)
      }
    }

    // Filter out vaccines the owner has opted out of. Filtering is by catalogId
    // (set by vaccineReminderQueue.js) for reliable matching vs. name string comparison.
    const filteredVaccinesArr = vaccinesArr.filter(v => !disabledVaccines.includes(v.catalogId));

    const overdueVax = filteredVaccinesArr.filter(v => v.status === 'overdue');
    const dueVax = filteredVaccinesArr.filter(v => v.status === 'due_soon');
    const allVax = [...overdueVax, ...dueVax];
    if (allVax.length === 0) { skipped++; continue; }

    const templateKey = overdueVax.length > 0 ? 'vaccine-overdue' : 'vaccine-due';
    const template = VACCINE_TEMPLATES[templateKey];
    let title, body;

    if (allVax.length === 1) {
      const v = allVax[0];
      // Step 4.5: Interpolate dose placeholders; strip "(Dose X/Y)" when either side is blank
      // (legacy path omits doseNumber/totalDoses — see vaccineReminderQueue.js Path 2).
      title = template.title
        .replace(/\{petName\}/g, petName)
        .replace(/\{vaccineName\}/g, v.name)
        .replace(/\{days\}/g, String(Math.abs(v.daysUntilDue)))
        .replace(/\{doseNumber\}/g, String(v.doseNumber || ''))
        .replace(/\{totalDoses\}/g, String(v.totalDoses || ''))
        .replace(/\s*\(Dose\s*\/\s*\)/g, '')   // both blank: "(Dose /)"
        .replace(/\s*\(Dose\s+\/\d+\)/g, '')    // doseNumber blank
        .replace(/\s*\(Dose\s+\d+\/\s*\)/g, ''); // totalDoses blank
      body = template.body
        .replace(/\{petName\}/g, petName)
        .replace(/\{vaccineName\}/g, v.name)
        .replace(/\{days\}/g, String(Math.abs(v.daysUntilDue)))
        .replace(/\{doseNumber\}/g, String(v.doseNumber || ''))
        .replace(/\{totalDoses\}/g, String(v.totalDoses || ''))
        .replace(/\s*\(Dose\s*\/\s*\)/g, '')
        .replace(/\s*\(Dose\s+\/\d+\)/g, '')
        .replace(/\s*\(Dose\s+\d+\/\s*\)/g, '');
    } else {
      const summary = allVax.map(v => `${v.name} (${v.daysUntilDue < 0 ? `overdue ${Math.abs(v.daysUntilDue)}d` : `due ${v.daysUntilDue}d`})`).join(', ');
      title = overdueVax.length > 0 ? 'Overdue Vaccination Alert' : 'Vaccination Reminder';
      body = `${petName} has ${allVax.length} vaccines needing attention: ${summary}. Book a visit to keep them protected!`;
    }

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: pushToken, title, body, sound: 'default', data: { type: 'vaccine-reminder' } }),
      });

      await fetch(`https://firestore.googleapis.com/v1/${docName}?key=${FIREBASE_API_KEY}&updateMask.fieldPaths=lastReminderSentAt`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { lastReminderSentAt: { timestampValue: new Date().toISOString() } } }),
      });

      fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/notification_log?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: {
          ownerId: { stringValue: ownerId }, ownerName: { stringValue: ownerName },
          status: { stringValue: templateKey }, petName: { stringValue: petName },
          title: { stringValue: title }, body: { stringValue: body },
          sentAt: { timestampValue: new Date().toISOString() },
          sentBy: { stringValue: 'System (Vaccine Cron)' },
          channel: { stringValue: 'push' }, type: { stringValue: 'vaccine-reminder' },
        } }),
      }).catch(() => {});

      // ── Email fallback (fire-and-forget) ──────────────────────────────────
      const ownerEmail = fields.ownerEmail?.stringValue;
      if (emailEnabled && ownerEmail && env.RESEND_API_KEY) {
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: env.RESEND_FROM_EMAIL || 'VetConnect <noreply@starbarks.vet>',
            to: [ownerEmail],
            subject: title,
            html: buildWorkerEmailHtml(title, body),
          }),
        }).then(() => {
          fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/notification_log?key=${FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: {
              ownerId: { stringValue: ownerId }, ownerName: { stringValue: ownerName },
              status: { stringValue: templateKey }, petName: { stringValue: petName },
              title: { stringValue: title }, body: { stringValue: body },
              sentAt: { timestampValue: new Date().toISOString() },
              sentBy: { stringValue: 'System (Vaccine Cron)' },
              channel: { stringValue: 'email' }, type: { stringValue: 'vaccine-reminder' },
            } }),
          }).catch(() => {});
        }).catch(() => {});
      }
      // NOTE: Vaccine reminders do NOT send SMS — not in critical statuses set.

      sent++;
    } catch (err) { console.error(`Failed for ${docName}:`, err.message); failed++; }
  }

  console.log(`Vaccine reminders: ${sent} sent, ${skipped} skipped, ${failed} failed, ${noToken} no token.`);
}

// ── T4.126: Automated Appointment Reminders (3-Stage) ─────────────────────

async function handleAppointmentReminders(env) {
  const PROJECT_ID = env.FIREBASE_PROJECT_ID || 'starbarks-vetconnect-f6443';
  const API_KEY = env.FIREBASE_API_KEY;
  const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  const settingsRes = await fetch(`${BASE}/clinic_settings/general?key=${API_KEY}`);
  if (!settingsRes.ok) { console.log('[ApptReminders] Failed to read settings:', settingsRes.status); return; }
  const fields = (await settingsRes.json()).fields || {};

  if (fields.enableAutoAppointmentReminders?.booleanValue !== true) {
    console.log('[ApptReminders] Auto-reminders disabled. Skipping.'); return;
  }

  // Channel settings — email defaults true, SMS defaults false (admin must opt-in)
  const emailEnabled = fields.enableEmailNotifications?.booleanValue !== false;
  const smsEnabled   = fields.enableSmsNotifications?.booleanValue === true;

  // SMS is limited to critical appointment reminder stages only (cost control)
  const SMS_CRIT_STAGES = new Set(['appointment-tomorrow', 'appointment-today']);

  const headsUpDays = parseInt(fields.appointmentReminderHeadsUpDays?.integerValue || '3');

  const queueRes = await fetch(`${BASE}/appointment_reminder_queue?key=${API_KEY}&pageSize=500`);
  if (!queueRes.ok) { console.log('[ApptReminders] Failed to read queue:', queueRes.status); return; }
  const docs = (await queueRes.json()).documents || [];

  if (docs.length === 0) { console.log('[ApptReminders] Queue empty. Skipping.'); return; }

  const nowManila = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const todayStr = nowManila.toISOString().slice(0, 10);
  const todayMs = new Date(todayStr).getTime();

  let sent = 0, skipped = 0, failed = 0;

  for (const docEntry of docs) {
    const f = docEntry.fields || {};
    const docName = docEntry.name;
    const appointmentId = docName.split('/').pop();

    const pushToken = f.pushToken?.stringValue;
    if (!pushToken) { skipped++; continue; }

    const petName = f.petName?.stringValue || 'your pet';
    const ownerId = f.ownerId?.stringValue || '';
    const ownerName = f.ownerName?.stringValue || '';

    const schTs = f.scheduledDate?.timestampValue;
    if (!schTs) { skipped++; continue; }
    const schDateStr = new Date(schTs).toISOString().slice(0, 10);
    const schMs = new Date(schDateStr).getTime();
    const dayDiff = Math.round((schMs - todayMs) / 86400000);

    if (dayDiff < 0) { skipped++; continue; }

    const rs = f.remindersSent?.mapValue?.fields || {};
    const headsUpSent = !!rs.headsUp?.timestampValue;
    const tomorrowSent = !!rs.tomorrow?.timestampValue;
    const todaySent = !!rs.today?.timestampValue;

    const toSend = [];
    if (dayDiff === headsUpDays && !headsUpSent) {
      toSend.push({ stage: 'headsUp', templateKey: 'appointment-upcoming', days: String(dayDiff) });
    }
    if (dayDiff === 1 && !tomorrowSent) {
      toSend.push({ stage: 'tomorrow', templateKey: 'appointment-tomorrow', days: '1' });
    }
    if (dayDiff === 0 && !todaySent) {
      toSend.push({ stage: 'today', templateKey: 'appointment-today', days: '0' });
    }

    if (toSend.length === 0) { skipped++; continue; }

    for (const { stage, templateKey, days } of toSend) {
      const template = DEFAULT_TEMPLATES[templateKey] || DEFAULT_TEMPLATES.reminder;
      const title = template.title.replace(/\{petName\}/g, petName).replace(/\{days\}/g, days);
      const body = template.body.replace(/\{petName\}/g, petName).replace(/\{days\}/g, days);

      try {
        const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: pushToken, title, body, sound: 'default', data: { appointmentId, type: templateKey } }),
        });

        if (!pushRes.ok) { console.log(`[ApptReminders] Push failed ${appointmentId} ${stage}:`, pushRes.status); failed++; continue; }

        const now = new Date().toISOString();
        await fetch(`${BASE}/appointment_reminder_queue/${appointmentId}?key=${API_KEY}&updateMask.fieldPaths=remindersSent.${stage}&updateMask.fieldPaths=updatedAt`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              remindersSent: { mapValue: { fields: { [stage]: { timestampValue: now } } } },
              updatedAt: { timestampValue: now },
            },
          }),
        });

        fetch(`${BASE}/notification_log?key=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              ownerId: { stringValue: ownerId }, ownerName: { stringValue: ownerName },
              status: { stringValue: templateKey }, petName: { stringValue: petName },
              title: { stringValue: title }, body: { stringValue: body },
              appointmentId: { stringValue: appointmentId },
              sentAt: { timestampValue: now },
              sentBy: { stringValue: 'System (Appointment Cron)' },
              channel: { stringValue: 'push' }, type: { stringValue: 'appointment-reminder' },
            },
          }),
        }).catch(() => {});

        // ── Email fallback (fire-and-forget) ────────────────────────────────
        const ownerEmail = f.ownerEmail?.stringValue;
        if (emailEnabled && ownerEmail && env.RESEND_API_KEY) {
          fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.RESEND_API_KEY}` },
            body: JSON.stringify({
              from: env.RESEND_FROM_EMAIL || 'VetConnect <noreply@starbarks.vet>',
              to: [ownerEmail],
              subject: title,
              html: buildWorkerEmailHtml(title, body),
            }),
          }).then(() => {
            fetch(`${BASE}/notification_log?key=${API_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields: {
                ownerId: { stringValue: ownerId }, ownerName: { stringValue: ownerName },
                status: { stringValue: templateKey }, petName: { stringValue: petName },
                title: { stringValue: title }, body: { stringValue: body },
                appointmentId: { stringValue: appointmentId },
                sentAt: { timestampValue: now },
                sentBy: { stringValue: 'System (Appointment Cron)' },
                channel: { stringValue: 'email' }, type: { stringValue: 'appointment-reminder' },
              } }),
            }).catch(() => {});
          }).catch(() => {});
        }

        // ── SMS (critical stages only: tomorrow + today) ─────────────────────
        const ownerPhone = f.ownerPhone?.stringValue;
        if (smsEnabled && ownerPhone && SMS_CRIT_STAGES.has(templateKey) && env.SEMAPHORE_API_KEY) {
          const smsTemplates = {
            'appointment-tomorrow': `Reminder: ${petName}'s appointment is tomorrow. Arrive 10 min early.`,
            'appointment-today':    `Today! ${petName}'s appointment is today. See you soon at Starbarks!`,
          };
          const smsMsg = smsTemplates[templateKey] || body;

          fetch('https://api.semaphore.co/api/v4/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apikey: env.SEMAPHORE_API_KEY,
              number: ownerPhone,
              message: smsMsg,
              sendername: env.SEMAPHORE_SENDER_NAME || 'STARBARKS',
            }),
          }).then(() => {
            fetch(`${BASE}/notification_log?key=${API_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields: {
                ownerId: { stringValue: ownerId }, ownerName: { stringValue: ownerName },
                status: { stringValue: templateKey }, petName: { stringValue: petName },
                title: { stringValue: title }, body: { stringValue: smsMsg },
                appointmentId: { stringValue: appointmentId },
                sentAt: { timestampValue: now },
                sentBy: { stringValue: 'System (Appointment Cron)' },
                channel: { stringValue: 'sms' }, type: { stringValue: 'appointment-reminder' },
              } }),
            }).catch(() => {});
          }).catch(() => {});
        }

        sent++;
      } catch (err) { console.log(`[ApptReminders] Error ${appointmentId} ${stage}:`, err.message); failed++; }
    }
  }

  console.log(`[ApptReminders] Done: ${sent} sent, ${skipped} skipped, ${failed} failed`);
}

// ── T4.204: Automated Balance Reminders (rewritten) ──────────────────────────
//
// T4.204 REWRITE: Reads the pre-computed balance_reminder_queue collection
// instead of querying the sales collection and user docs at send time.
// The queue is maintained by computeBalanceReminderQueue.js (admin app):
//   - POSModal piggybacks computeSingleOwnerBalanceReminder after every checkout
//   - PatientDashboard piggybacks after handleMarkSettled
//   - Dashboard "Recompute Balance Queue" button calls computeFullBalanceReminderQueue
//
// Each queue doc (balance_reminder_queue/{ownerId}) contains:
//   ownerId, ownerName, ownerEmail, ownerPhone, pushToken,
//   totalBalance, saleCount, lastSaleDate,
//   lastReminderSentAt, balanceReminderSnoozedUntil
//
// The Worker reads up to 500 queue docs, applies snooze + cooldown guards,
// sends push + email, and updates lastReminderSentAt on the QUEUE doc.
// No sales queries. No user doc queries.
//
// MANUAL DEPLOY: paste this file into the Cloudflare Worker dashboard
// (https://dash.cloudflare.com → Workers & Pages → vetconnect-worker → Edit Code)
// after every change — this file is the reference copy, not auto-deployed.

async function handleBalanceReminders(env) {
  const PROJECT_ID = env.FIREBASE_PROJECT_ID || 'starbarks-vetconnect-f6443';
  const API_KEY    = env.FIREBASE_API_KEY;
  const BASE       = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  // 1. Read clinic settings — master toggle and send interval.
  const settingsRes = await fetch(`${BASE}/clinic_settings/general?key=${API_KEY}`);
  if (!settingsRes.ok) {
    console.log('[BalanceReminders] Failed to read settings:', settingsRes.status);
    return;
  }
  const settings = (await settingsRes.json()).fields || {};

  // Intentional: balance reminders default ON (opt-out).
  // Set enableBalanceReminders: false in clinic_settings to disable.
  if (settings.enableBalanceReminders?.booleanValue === false) {
    console.log('[BalanceReminders] Disabled. Skipping.');
    return;
  }

  const emailEnabled = settings.enableEmailNotifications?.booleanValue !== false;
  const intervalDays = parseInt(settings.balanceReminderIntervalDays?.integerValue || '7');
  const intervalMs   = intervalDays * 86400000;
  const now          = Date.now();

  // 2. Read the pre-computed queue — one collection read, no per-owner lookups.
  let queueDocs;
  try {
    const queueRes = await fetch(
      `${BASE}/balance_reminder_queue?key=${API_KEY}&pageSize=500`,
    );
    if (!queueRes.ok) {
      console.log('[BalanceReminders] Queue read failed:', queueRes.status);
      return;
    }
    const queueJson = await queueRes.json();
    queueDocs = queueJson.documents || [];
  } catch (err) {
    console.log('[BalanceReminders] Queue read error:', err.message);
    return;
  }

  if (queueDocs.length === 0) {
    console.log('[BalanceReminders] Queue is empty. Skipping.');
    return;
  }

  const template = BALANCE_TEMPLATES['balance-reminder'];
  let sent = 0, skipped = 0, failed = 0, snoozed = 0, noToken = 0;

  for (const queueDoc of queueDocs) {
    const f        = queueDoc.fields || {};
    const docPath  = queueDoc.name; // full resource path for PATCH

    const ownerId   = f.ownerId?.stringValue   || docPath.split('/').pop();
    const ownerName = f.ownerName?.stringValue  || '';
    const pushToken = f.pushToken?.stringValue  || null;
    const ownerEmail = f.ownerEmail?.stringValue || null;

    const totalBalance = parseFloat(
      f.totalBalance?.doubleValue ?? f.totalBalance?.integerValue ?? '0',
    );

    // Guard: skip docs with no outstanding balance (stale queue entry)
    if (totalBalance <= 0) { skipped++; continue; }

    // Snooze guard — skip if owner snoozed reminders past now
    const snoozedUntilRaw = f.balanceReminderSnoozedUntil?.timestampValue;
    if (snoozedUntilRaw && new Date(snoozedUntilRaw).getTime() > now) {
      snoozed++;
      continue;
    }

    // Cooldown guard — skip if a reminder was sent within the configured interval
    const lastSentRaw = f.lastReminderSentAt?.timestampValue;
    if (lastSentRaw && (now - new Date(lastSentRaw).getTime()) < intervalMs) {
      skipped++;
      continue;
    }

    const amount = totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 });
    const title  = template.title;
    const body   = template.body.replace(/\{amount\}/g, amount);

    // Push notification (primary channel)
    let pushOk = false;
    if (pushToken) {
      try {
        const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to:    pushToken,
            title,
            body,
            sound: 'default',
            data:  { type: 'balance-reminder' },
          }),
        });
        if (!pushRes.ok) {
          console.error(`[BalanceReminders] Expo error for ${ownerName}:`, pushRes.status);
          failed++;
        } else {
          fetch(`${BASE}/notification_log?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                ownerId:   { stringValue: ownerId },
                ownerName: { stringValue: ownerName },
                status:    { stringValue: 'balance-reminder' },
                title:     { stringValue: title },
                body:      { stringValue: body },
                sentAt:    { timestampValue: new Date().toISOString() },
                sentBy:    { stringValue: 'System (Balance Cron)' },
                channel:   { stringValue: 'push' },
                type:      { stringValue: 'balance-reminder' },
              },
            }),
          }).catch(() => {});
          pushOk = true;
          sent++;
        }
      } catch (err) {
        console.error(`[BalanceReminders] Push failed for ${ownerName}:`, err.message);
        failed++;
      }
    } else {
      noToken++;
    }

    // Email channel (fire-and-forget — does not block loop iteration)
    let emailAttempted = false;
    if (emailEnabled && ownerEmail && env.RESEND_API_KEY) {
      emailAttempted = true;
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from:    env.RESEND_FROM_EMAIL || 'VetConnect <noreply@starbarks.vet>',
          to:      [ownerEmail],
          subject: title,
          html:    buildWorkerEmailHtml(title, body),
        }),
      }).then(() => {
        fetch(`${BASE}/notification_log?key=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              ownerId:   { stringValue: ownerId },
              ownerName: { stringValue: ownerName },
              status:    { stringValue: 'balance-reminder' },
              title:     { stringValue: title },
              body:      { stringValue: body },
              sentAt:    { timestampValue: new Date().toISOString() },
              sentBy:    { stringValue: 'System (Balance Cron)' },
              channel:   { stringValue: 'email' },
              type:      { stringValue: 'balance-reminder' },
            },
          }),
        }).catch(() => {});
      }).catch(() => {});
    }

    // Stamp lastReminderSentAt on the QUEUE doc (not the user doc) after any send.
    // Uses PATCH with an updateMask so only this field is touched — preserves all
    // other queue fields including balanceReminderSnoozedUntil.
    if (pushOk || emailAttempted) {
      await fetch(
        `${docPath}?key=${API_KEY}&updateMask.fieldPaths=lastReminderSentAt`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: { lastReminderSentAt: { timestampValue: new Date().toISOString() } },
          }),
        },
      ).catch(() => {});
    }
  }

  console.log(`[BalanceReminders] ${sent} sent, ${skipped} skipped, ${snoozed} snoozed, ${noToken} no token, ${failed} failed.`);
}

// ─── MAIN FETCH HANDLER ──────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405);
    }

    if (url.pathname === '/push') {
      return handlePush(request);
    }

    if (url.pathname === '/push/custom') {
      return handleCustomPush(request);
    }

    if (url.pathname === '/email') {
      return handleEmail(request, env);
    }

    if (url.pathname === '/sms') {
      return handleSms(request, env);
    }

    return handleAiProxy(request, env);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      Promise.allSettled([
        handleVaccineReminders(env),
        handleAppointmentReminders(env),
        handleBalanceReminders(env),
      ])
    );
  },
};
