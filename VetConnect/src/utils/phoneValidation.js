export const isValidPHPhone = (phone) => {
  if (phone == null) return false;
  return /^09\d{9}$/.test(phone.trim());
};
