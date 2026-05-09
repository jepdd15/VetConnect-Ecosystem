/**
 * notificationTemplateConstants.js
 *
 * Shared constants for the push notification template system.
 * Used by Settings.jsx (Pillar 13) and sendPushNotification.js (template auto-resolve).
 *
 * DEFAULT_TEMPLATES must match the Cloudflare Worker's DEFAULT_TEMPLATES map exactly (T4.89).
 * Placeholders: {petName}, {vetName}, {ticketNumber}, {amount}, {date}
 */
import { COLORS } from '../theme/designTokens';

// ─── Default Templates ──────────────────────────────────────────────────────
// Keys match the Worker's status keys exactly — do not rename.
export const DEFAULT_TEMPLATES = {
  confirmed: {
    title: 'Booking Confirmed!',
    body: 'Your appointment for {petName} has been approved. See you soon!',
  },
  cancelled: {
    title: 'Appointment Cancelled',
    body: 'Your booking for {petName} was cancelled. Tap to see details.',
  },
  arrived: {
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
  resumed: {
    title: 'Consultation Resumed',
    body: "{petName}'s consultation has resumed with {vetName}.",
  },
  dispensing: {
    title: 'Prescriptions Ready',
    body: 'Medications for {petName} are being prepared at the pharmacy.',
  },
  billing: {
    title: 'Ready for Checkout',
    body: 'Services for {petName} are complete. Please proceed to the cashier.',
  },
  completed: {
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
  confined: {
    title: 'Pet Admitted',
    body: "{petName} has been admitted for observation/confinement. We'll keep you updated.",
  },
  reminder: {
    title: 'Appointment Tomorrow',
    body: "{petName}'s appointment is tomorrow at {time}. See you then!",
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
  'vaccine-due': {
    title: 'Vaccination Reminder',
    body: "Time for {petName}'s checkup! Their {vaccineName} vaccine (Dose {doseNumber}/{totalDoses}) is due in {days} days. Book a visit to keep them protected!",
  },
  'vaccine-overdue': {
    title: 'Overdue Vaccination Alert',
    body: "Warning: {petName}'s {vaccineName} vaccine (Dose {doseNumber}/{totalDoses}) is overdue by {days} days. Please book as soon as possible.",
  },
};

// ─── Template Groups ────────────────────────────────────────────────────────
// Logical sections for the Settings UI. Each group has a label, description, and ordered status keys.
export const TEMPLATE_GROUPS = [
  {
    label: 'BOOKING',
    description: 'Sent when an appointment is scheduled or cancelled.',
    keys: ['confirmed', 'cancelled'],
  },
  {
    label: 'IN-CLINIC',
    description: 'Sent during the live visit workflow.',
    keys: ['arrived', 'in-consult', 'on-hold', 'resumed', 'dispensing', 'billing'],
  },
  {
    label: 'RESOLUTION',
    description: 'Sent when a visit concludes or is deferred.',
    keys: ['completed', 'no-show', 'carried-over', 'confined'],
  },
  {
    label: 'REMINDERS',
    description: 'Sent the day before a scheduled appointment.',
    keys: ['reminder', 'appointment-upcoming', 'appointment-tomorrow', 'appointment-today', 'vaccine-due', 'vaccine-overdue'],
  },
];

// ─── Status Display Labels ──────────────────────────────────────────────────
// Human-readable labels for each status key, shown in the editor UI.
export const STATUS_LABELS = {
  confirmed:       'Confirmed',
  cancelled:       'Cancelled',
  arrived:         'Arrived / Checked In',
  'in-consult':    'In Consultation',
  'on-hold':       'On Hold',
  resumed:         'Resumed',
  dispensing:      'Dispensing',
  billing:         'Billing / Checkout',
  completed:       'Completed',
  'no-show':       'No-Show',
  'carried-over':  'Carried Over',
  confined:        'Confined / Admitted',
  reminder:              'Appointment Reminder',
  'appointment-upcoming':  'Upcoming Appointment Reminder',
  'appointment-tomorrow':  'Tomorrow Appointment Reminder',
  'appointment-today':     'Today Appointment Reminder',
  'vaccine-due':         'Vaccine Due Reminder',
  'vaccine-overdue':     'Vaccine Overdue Alert',
};

// ─── Status Chip Colors ─────────────────────────────────────────────────────
// Matches the OperationsTab STATUS_COLORS palette for visual consistency.
export const STATUS_CHIP_COLORS = {
  confirmed:      { bg: '#E3F2FD', text: '#1565C0',       border: '#90CAF9' },
  cancelled:      { bg: '#FEF2F2', text: COLORS.danger,   border: '#FCA5A5' },
  arrived:        { bg: '#F0FDF4', text: '#2E7D32',       border: '#86EFAC' },
  'in-consult':   { bg: '#FFF7ED', text: '#E65100',       border: '#FDBA74' },
  'on-hold':      { bg: '#F5F5F5', text: '#616161',       border: '#E0E0E0' },
  resumed:        { bg: '#FFF7ED', text: '#E65100',       border: '#FDBA74' },
  dispensing:     { bg: '#F3E8FF', text: '#7B1FA2',       border: '#D8B4FE' },
  billing:        { bg: '#FCE4EC', text: '#C62828',       border: '#F48FB1' },
  completed:      { bg: '#F0FDF4', text: '#2E7D32',       border: '#86EFAC' },
  'no-show':      { bg: '#EFEBE9', text: '#5D4037',       border: '#BCAAA4' },
  'carried-over': { bg: '#EFEBE9', text: '#5D4037',       border: '#BCAAA4' },
  confined:       { bg: '#FEF2F2', text: '#C62828',       border: '#EF9A9A' },
  reminder:              { bg: '#E3F2FD', text: '#1565C0',      border: '#90CAF9' },
  'appointment-upcoming':  { bg: '#E3F2FD', text: '#1565C0',  border: '#90CAF9' },
  'appointment-tomorrow':  { bg: '#FFF7ED', text: '#E65100',  border: '#FDBA74' },
  'appointment-today':     { bg: '#F0FDF4', text: '#2E7D32',  border: '#86EFAC' },
  'vaccine-due':         { bg: '#FFF7ED', text: '#E65100',    border: '#FDBA74' },
  'vaccine-overdue':     { bg: '#FEF2F2', text: COLORS.danger, border: '#FCA5A5' },
};

// ─── Placeholder Reference ──────────────────────────────────────────────────
// Shown as hoverable hint chips in the template editor.
export const PLACEHOLDER_REFERENCE = [
  { token: '{petName}',      description: 'The pet\'s name (e.g., "Coco")' },
  { token: '{vetName}',      description: 'Attending veterinarian name' },
  { token: '{ticketNumber}', description: 'Queue ticket number (arrived only)' },
  { token: '{amount}',       description: 'Total bill amount (completed only)' },
  { token: '{date}',         description: 'Appointment date (available for custom templates)' },
  { token: '{time}',         description: 'Scheduled appointment time (e.g., "2:00 PM")' },
  { token: '{vaccineName}',  description: 'Vaccine name (e.g., "Rabies") — vaccine reminders only' },
  { token: '{days}',        description: 'Days until due, days overdue, or days until appointment — reminders only' },
  { token: '{doseNumber}',  description: 'Current dose number (e.g., "2") — vaccine reminders only' },
  { token: '{totalDoses}',  description: 'Total doses in series (e.g., "3") — vaccine reminders only' },
];

// ── SMS-Eligible Statuses ──────────────────────────────────────────────────
// Only these statuses trigger SMS delivery (cost control).
export const SMS_CRITICAL_STATUSES = new Set([
  'confirmed',
  'appointment-tomorrow',
  'appointment-today',
]);

// ── SMS Templates ──────────────────────────────────────────────────────────
// Max 160 characters per message to avoid multi-part SMS charges.
// Placeholders: {petName} only — SMS must be ultra-concise.
export const SMS_TEMPLATES = {
  confirmed:              "{petName}'s appointment confirmed. See you at Starbarks!",
  'appointment-tomorrow': "Reminder: {petName}'s appointment is tomorrow. Arrive 10 min early.",
  'appointment-today':    "Today! {petName}'s appointment is today. See you soon at Starbarks!",
};

// ── Email HTML Wrapper ─────────────────────────────────────────────────────
/**
 * Wraps a notification title + body in a simple HTML email template.
 * Inline styles only — no CSS framework. Compatible with all major email clients.
 * XSS-safe: all dynamic values are HTML-entity-escaped before insertion.
 *
 * @param {string} title      - Email subject / header text
 * @param {string} body       - Notification body text
 * @param {string} clinicName - Clinic display name (default: Starbarks Veterinary Clinic)
 * @returns {string} Complete HTML document string
 */
export function buildEmailHtml(title, body, clinicName = 'Starbarks Veterinary Clinic') {
  const esc = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F5F0EB;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:24px auto;background:#FFFFFF;border:2px solid #3E2723;">
    <tr>
      <td style="background:#3E2723;padding:18px 24px;">
        <h1 style="margin:0;color:#FFF8E1;font-size:18px;font-weight:900;letter-spacing:0.04em;">
          ${esc(clinicName)}
        </h1>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 24px 12px;">
        <h2 style="margin:0 0 12px;color:#3E2723;font-size:16px;font-weight:800;">
          ${esc(title)}
        </h2>
        <p style="margin:0;color:#5D4037;font-size:14px;line-height:1.6;">
          ${esc(body).replace(/\n/g, '<br>')}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 24px;border-top:1px solid #E0D6CC;">
        <p style="margin:0;color:#A1887F;font-size:11px;line-height:1.5;">
          This is an automated message from ${esc(clinicName)}.<br>
          Please do not reply to this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
