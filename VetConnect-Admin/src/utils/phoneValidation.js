/**
 * Validates a Philippine mobile phone number.
 * Format: 09 followed by exactly 9 digits (11 digits total).
 * Example: 09171234567
 */
export const isValidPHPhone = (number) => {
  const phRegex = /^09\d{9}$/;
  return phRegex.test((number || '').trim());
};

/**
 * Normalizes a Philippine phone number to the canonical 09xxxxxxxxx format.
 * Handles +63, 63, and 09 prefixes; strips non-digit characters.
 */
export function normalizePhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('63') && digits.length === 12) return '0' + digits.slice(2);
  if (digits.startsWith('09') && digits.length === 11) return digits;
  return digits;
}
