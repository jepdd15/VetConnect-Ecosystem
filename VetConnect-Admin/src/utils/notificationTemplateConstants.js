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
    keys: ['reminder'],
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
  reminder:        'Appointment Reminder',
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
  reminder:       { bg: '#E3F2FD', text: '#1565C0',       border: '#90CAF9' },
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
];
