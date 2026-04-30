/**
 * chartHelpers.js
 *
 * Shared SVG chart math utilities used by SparkLine and VitalsZoomModal.
 * Extracted from SparkLine.js so the logic is not duplicated across components.
 */

/**
 * Clamps a number to the inclusive [min, max] range.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Maps a data value to a Y pixel coordinate within an SVG canvas of the given
 * height. Adds a 2 px inset on top and bottom so dots at the extremes are
 * never clipped by the canvas edge.
 *
 * Y=0 is the top of the canvas; higher values map to lower Y (SVG convention).
 *
 * @param {number} value      - The data value to position.
 * @param {number} paddedMin  - Lower bound of the padded data range.
 * @param {number} paddedMax  - Upper bound of the padded data range.
 * @param {number} height     - SVG canvas height in pixels.
 * @returns {number} Y coordinate in pixels.
 */
export function valueToY(value, paddedMin, paddedMax, height) {
  const INSET = 2;
  const range = paddedMax - paddedMin;
  if (range === 0) return height / 2;
  const ratio = (value - paddedMin) / range;
  const y = height - ratio * (height - INSET * 2) - INSET;
  return clamp(y, INSET, height - INSET);
}
