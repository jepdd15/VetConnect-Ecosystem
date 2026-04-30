/**
 * speciesVitalRanges.js
 *
 * Species-normal vital reference ranges for canine and feline patients.
 * Values mirror the admin SPECIES_VITAL_RANGES constant in PatientDashboard.jsx,
 * providing a single authoritative source on the mobile side.
 *
 * Weight and pain are intentionally excluded — weight is breed-specific and
 * has no universal range; pain is subjective with no clinical normal baseline.
 */

/**
 * Vital reference range map.
 * Each key maps to { canine: [low, high], feline: [low, high] }.
 */
export const SPECIES_VITAL_RANGES = {
  temp: { canine: [38.0, 39.2], feline: [38.1, 39.2] },
  hr:   { canine: [60, 140],    feline: [120, 240]    },
  rr:   { canine: [10, 30],     feline: [20, 42]      },
  crt:  { canine: [1.0, 2.0],   feline: [1.0, 2.0]   },
  bcs:  { canine: [4, 5],       feline: [4, 5]        },
};

/**
 * Resolves the normal range for a given vital key and species string.
 *
 * Species matching is case-insensitive and first-character based:
 * - Starts with 'f' → feline (matches "Feline", "feline", "F")
 * - Anything else → canine (safe default for "Canine", missing, or unknown)
 *
 * @param {string} vitalKey - One of: temp, hr, rr, crt, bcs
 * @param {string} species  - Pet species string, e.g. "Canine" or "Feline"
 * @returns {{ low: number, high: number } | null}
 */
export function getNormalRange(vitalKey, species) {
  const entry = SPECIES_VITAL_RANGES[vitalKey];
  if (!entry) return null;
  const key = species?.toLowerCase?.().startsWith('f') ? 'feline' : 'canine';
  const [low, high] = entry[key];
  return { low, high };
}
