/**
 * Normalizes inventory_logs documents from all writers (logEvent, POSModal, useSalesData)
 * into a consistent schema. Provides backward compatibility for pre-normalization docs.
 */
export const normalizeInventoryLog = (log) => ({
  ...log,
  action: log.action || (log.type === 'sale' ? 'SOLD' : log.type?.toUpperCase() || 'UNKNOWN'),
  amountChange: log.amountChange ?? (log.quantity || 0),
  userName: log.userName || log.user || 'System',
});
