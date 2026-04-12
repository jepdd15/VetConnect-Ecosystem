/**
 * Returns a local date string in YYYY-MM-DD format.
 * Uses the JS runtime's local wall-clock time (not UTC).
 *
 * TIMEZONE ASSUMPTION: The admin dashboard is expected to run in
 * a browser whose system clock is set to Asia/Manila (UTC+8).
 * Do NOT use this function in Cloud Functions — use explicit
 * timezone conversion with date-fns-tz or Intl.DateTimeFormat there.
 *
 * @param {Date} [d=new Date()] - The date to format
 * @returns {string} e.g. "2026-04-11"
 */
export const getLocalDateStr = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
