/**
 * Normalizes inventory_logs documents from all writers (logEvent, POSModal, useSalesData)
 * into a consistent schema. Provides backward compatibility for pre-normalization docs.
 *
 * Sign convention: SOLD events must carry a negative amountChange so the GlobalActivityLog
 * renders them with a red down-arrow. Legacy docs written before this convention stored
 * quantity as a positive integer -- the guard below corrects them at read time.
 */
export const normalizeInventoryLog = (log) => {
  const action = log.action || (log.type === 'sale' ? 'SOLD' : log.type?.toUpperCase() || 'UNKNOWN');
  let amountChange = log.amountChange ?? (log.quantity || 0);

  // Legacy SOLD logs stored positive quantity — normalize to negative for display consistency
  if (action === 'SOLD' && amountChange > 0) {
    amountChange = -amountChange;
  }

  return {
    ...log,
    action,
    amountChange,
    // T3.26: pass through so GlobalActivityLog can display the chip and filter by type.
    // null for legacy logs written before this field was introduced.
    adjustmentType: log.adjustmentType || null,
    userName: log.userName || log.user || 'System',
  };
};
