/**
 * Internal: normalizes any Firestore-compatible timestamp into a JS Date.
 * Returns null if conversion fails.
 */
const toJSDate = (ts) => {
  try {
    let d;
    if (typeof ts?.toDate === 'function') {
      d = ts.toDate();
    } else if (ts?.seconds != null) {
      d = new Date(ts.seconds * 1000);
    } else if (ts instanceof Date) {
      d = ts;
    } else if (typeof ts === 'string' || typeof ts === 'number') {
      d = new Date(ts);
    } else {
      return null;
    }
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

/**
 * Safely converts a value that might be a Firestore Timestamp, Date, ISO string,
 * or {seconds} object into a formatted date string.
 * Returns the fallback string if conversion fails.
 *
 * @param {*} ts - Firestore Timestamp, Date, ISO string, or {seconds} object
 * @param {Intl.DateTimeFormatOptions} [opts] - toLocaleDateString options
 * @param {string} [fallback='an upcoming date'] - returned on failure
 * @returns {string}
 */
export const safeDate = (ts, opts, fallback = 'an upcoming date') => {
  const d = toJSDate(ts);
  if (!d) return fallback;
  return opts ? d.toLocaleDateString('en-US', opts) : d.toLocaleDateString();
};

/**
 * Converts a Firestore Timestamp, Date, ISO string, or {seconds} object into
 * a formatted time string (e.g. "2:30 PM").
 *
 * Walk-in appointments (midnight timestamps) return 'Walk-in'.
 * Returns the fallback string on failure.
 *
 * @param {*} ts - Firestore Timestamp, Date, ISO string, or {seconds} object
 * @param {string} [fallback=''] - returned on null/undefined/failure
 * @returns {string}
 */
export const formatFirestoreTime = (ts, fallback = '') => {
  const d = toJSDate(ts);
  if (!d) return fallback;
  // Walk-in detection: midnight timestamps are walk-in markers
  if (d.getHours() === 0 && d.getMinutes() === 0) return 'Walk-in';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * Returns a YYYY-MM-DD string from a Date, using local timezone.
 * Defaults to today if no argument is provided.
 *
 * @param {Date} [d=new Date()] - the date to format
 * @returns {string} e.g. "2026-04-23"
 */
export const getLocalDateStr = (d = new Date()) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Converts a 24-hour integer (0-23) to a 12-hour AM/PM string.
 * Example: 8 -> "8:00 AM", 17 -> "5:00 PM", 0 -> "12:00 AM"
 *
 * @param {number} hour24 - hour in 24-hour format (0-23)
 * @returns {string}
 */
export const formatHour = (hour24) => {
  if (hour24 === 0) return '12:00 AM';
  if (hour24 === 12) return '12:00 PM';
  return hour24 < 12 ? `${hour24}:00 AM` : `${hour24 - 12}:00 PM`;
};

/**
 * Formats a Firestore Timestamp / Date / string / {seconds} into a display date.
 *
 * @param {*} ts - any Firestore-compatible timestamp value
 * @param {Intl.DateTimeFormatOptions} [opts] - toLocaleDateString options
 *   Defaults to { month: 'short', day: 'numeric', year: 'numeric' } -> "Apr 23, 2026"
 * @param {string} [fallback='Unknown Date'] - returned on failure
 * @returns {string}
 */
export const formatDisplayDate = (
  ts,
  opts = { month: 'short', day: 'numeric', year: 'numeric' },
  fallback = 'Unknown Date',
) => {
  const d = toJSDate(ts);
  return d ? d.toLocaleDateString('en-US', opts) : fallback;
};

/**
 * Formats a Firestore Timestamp / Date / string / {seconds} into a display time.
 *
 * @param {*} ts - any Firestore-compatible timestamp value
 * @param {string} [fallback=''] - returned on failure
 * @returns {string} e.g. "2:30 PM"
 */
export const formatDisplayTime = (ts, fallback = '') => {
  const d = toJSDate(ts);
  return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : fallback;
};
