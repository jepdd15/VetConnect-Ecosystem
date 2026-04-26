/**
 * Structured adjustment type definitions for inventory stock adjustments.
 *
 * Each entry has:
 *   label     — human-readable display string (shown in dropdown and activity log)
 *   forAction — 'add' | 'remove' | 'both' — limits dropdown to contextually valid types
 *
 * This is the single source of truth referenced by:
 *   - StockAdjustModal (dropdown options)
 *   - useInventory (persisted on inventory_logs documents)
 *   - GlobalActivityLog (secondary filter + chip display)
 */
export const ADJUSTMENT_TYPES = {
  RESTOCK:       { label: 'Restocked from Supplier',  forAction: 'add'    },
  RECOUNT:       { label: 'Physical Recount',          forAction: 'both'   },
  DAMAGE:        { label: 'Damaged / Spoiled',         forAction: 'remove' },
  EXPIRY:        { label: 'Expired (Manual)',           forAction: 'remove' },
  THEFT:         { label: 'Theft / Shrinkage',         forAction: 'remove' },
  INTERNAL_USE:  { label: 'Internal / Clinic Use',     forAction: 'remove' },
  VENDOR_RETURN: { label: 'Vendor Return',             forAction: 'remove' },
  TRANSFER:      { label: 'Transfer / Shipment',       forAction: 'both'   },
  OTHER:         { label: 'Other (see remarks)',        forAction: 'both'   },
};

/**
 * Returns the ADJUSTMENT_TYPES entries that are valid for the given action.
 *
 * @param {'add'|'remove'} action
 * @returns {Array<[string, { label: string, forAction: string }]>}
 *
 * @example
 * getTypesForAction('add')
 * // => [['RESTOCK', {...}], ['RECOUNT', {...}], ['TRANSFER', {...}], ['OTHER', {...}]]
 */
export const getTypesForAction = (action) =>
  Object.entries(ADJUSTMENT_TYPES).filter(
    ([, v]) => v.forAction === 'both' || v.forAction === action
  );
