/**
 * Validates a Philippine mobile phone number.
 * Format: 09 followed by exactly 9 digits (11 digits total).
 * Example: 09171234567
 */
export const isValidPHPhone = (number) => {
  const phRegex = /^09\d{9}$/;
  return phRegex.test((number || '').trim());
};
