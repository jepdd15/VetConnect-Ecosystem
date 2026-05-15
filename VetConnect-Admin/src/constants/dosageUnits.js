/**
 * dosageUnits.js
 *
 * Shared constants and utilities for the structured Dosage/Strength field.
 * Used across ProductFormModal (write), InventoryTable (display),
 * ClinicalWorkspace (cart pipeline), DispensingVerificationDialog,
 * and printDispensingLabels.
 */

/**
 * Dropdown options for the dosage unit selector.
 * Grouped by pharmaceutical category for the optgroup UI.
 */
export const DOSAGE_UNITS = [
  // Mass (Solid Dosage Forms)
  { value: 'mg',    label: 'mg',    category: 'Mass' },
  { value: 'g',     label: 'g',     category: 'Mass' },
  { value: 'mcg',   label: 'mcg',   category: 'Mass' },

  // Volume (Liquid Dosage Forms)
  { value: 'ml',    label: 'ml',    category: 'Volume' },
  { value: 'L',     label: 'L',     category: 'Volume' },

  // Concentration (Compound Forms)
  { value: 'mg/ml', label: 'mg/ml', category: 'Concentration' },
  { value: 'mg/kg', label: 'mg/kg', category: 'Concentration' },
  { value: '%',     label: '%',     category: 'Concentration' },

  // Biological Units
  { value: 'IU',    label: 'IU',    category: 'Biological' },
  { value: 'mEq',   label: 'mEq',  category: 'Biological' },

  // Practical / Counting
  { value: 'dose',  label: 'dose',  category: 'Practical' },

  // Escape hatch
  { value: 'other', label: 'Other (custom)', category: 'Other' },
];

/**
 * Formats a structured dosage into a human-readable string.
 *
 * @param {number|string|null} value  - Numeric dosage value (e.g. 50)
 * @param {string|null} unit          - Unit code from DOSAGE_UNITS (e.g. 'mg')
 * @param {string|null} customUnit    - Custom unit when unit === 'other'
 * @returns {string} e.g. "50mg", "5mg/ml", "" if no data
 */
export function formatDosage(value, unit, customUnit) {
  if (value == null || value === '' || unit == null || unit === '') return '';
  const resolvedUnit = unit === 'other' ? (customUnit || '') : unit;
  if (!resolvedUnit) return String(value);
  // No space for compact units (mg, ml, %), space for multi-char (mg/ml, mg/kg, IU, mEq, dose)
  const needsSpace = resolvedUnit.length > 2 || resolvedUnit === 'IU';
  return `${value}${needsSpace ? ' ' : ''}${resolvedUnit}`;
}

/**
 * Best-effort parser for legacy free-text dosage strings.
 * Attempts to split "50mg" → { value: 50, unit: 'mg' }.
 * Returns null fields when parsing fails.
 *
 * @param {string|null} dosageString - e.g. "50mg", "5 mg/ml", "10ml", "2%"
 * @returns {{ value: number|null, unit: string|null }}
 */
export function parseLegacyDosage(dosageString) {
  if (!dosageString || typeof dosageString !== 'string') {
    return { value: null, unit: null };
  }

  const trimmed = dosageString.trim();
  if (!trimmed) return { value: null, unit: null };

  // Match a leading number (int or float) followed by optional space and a unit string
  const match = trimmed.match(/^(\d+\.?\d*)\s*(.+)$/);
  if (!match) return { value: null, unit: null };

  const numValue = parseFloat(match[1]);
  const unitStr = match[2].trim().toLowerCase();

  // Try to match against known units (case-insensitive)
  const knownUnit = DOSAGE_UNITS.find(
    u => u.value.toLowerCase() === unitStr && u.value !== 'other'
  );

  return {
    value: isNaN(numValue) ? null : numValue,
    unit: knownUnit ? knownUnit.value : null,
  };
}
