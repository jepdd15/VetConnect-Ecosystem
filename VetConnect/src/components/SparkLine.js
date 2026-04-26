/**
 * SparkLine — a reusable SVG mini-chart component for React Native.
 *
 * Renders a polyline trend chart from an ordered array of {label, value}
 * data points. Fully generic: no domain-specific logic lives here.
 *
 * Requires react-native-svg (install via `npx expo install react-native-svg`).
 *
 * @example
 * <SparkLine
 *   data={[{ label: 'Jan', value: 3.5 }, { label: 'Feb', value: 4.2 }]}
 *   lineColor="#1565C0"
 *   unit="kg"
 * />
 */

import { Text, View } from 'react-native';
import { Circle, Path, Svg } from 'react-native-svg';
import { COLORS } from '../theme/mobileTokens';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamps a number to [min, max]. */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Maps a data value to a Y pixel coordinate within the SVG height.
 * Adds 2px inset on top and bottom so dots at extremes are not clipped.
 */
function valueToY(value, paddedMin, paddedMax, height) {
  const INSET = 2;
  const range = paddedMax - paddedMin;
  if (range === 0) return height / 2;
  const ratio = (value - paddedMin) / range;
  const y = height - ratio * (height - INSET * 2) - INSET;
  return clamp(y, INSET, height - INSET);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * @param {{ label: string, value: number }[]} data     - Ordered data points (oldest → newest left-to-right).
 * @param {number}  [width=200]                          - SVG canvas width in px.
 * @param {number}  [height=60]                          - SVG canvas height in px.
 * @param {string}  [lineColor]                          - Stroke colour for the line and dots. Defaults to COLORS.accent.
 * @param {string}  [fillColor='transparent']            - Optional area fill colour below the line.
 * @param {boolean} [showDots=true]                      - Whether to render circles at each data point.
 * @param {boolean} [showLatestValue=true]               - Whether to display the latest value as text beside the chart.
 * @param {string}  [unit='']                            - Suffix appended to the latest value display (e.g. "kg", "°C").
 */
export default function SparkLine({
  data,
  width = 200,
  height = 60,
  lineColor = COLORS.accent,
  fillColor = 'transparent',
  showDots = true,
  showLatestValue = true,
  unit = '',
}) {
  // Filter out entries without a usable numeric value.
  const validPoints = (data || []).filter(
    (d) => d.value != null && !isNaN(parseFloat(d.value)),
  );

  // A single point is not enough to draw a line — render nothing.
  if (validPoints.length < 2) return null;

  const values = validPoints.map((d) => parseFloat(d.value));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);

  // Add 10 % padding to the Y axis so extreme points are never flush with edges.
  const padding = (rawMax - rawMin) * 0.1 || 1; // fallback 1 unit when all values identical
  const paddedMin = rawMin - padding;
  const paddedMax = rawMax + padding;

  // Map each valid point to (x, y) pixel coordinates.
  const points = validPoints.map((d, i) => ({
    x: (i / (validPoints.length - 1)) * width,
    y: valueToY(parseFloat(d.value), paddedMin, paddedMax, height),
  }));

  // Build the SVG polyline path string: M x0,y0 L x1,y1 ...
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  // Closed area path: line + drop to bottom corners → back to start.
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const areaPath =
    linePath +
    ` L ${lastPoint.x.toFixed(1)},${height}` +
    ` L ${firstPoint.x.toFixed(1)},${height}` +
    ' Z';

  const latestValue = values[values.length - 1];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Svg width={width} height={height}>
        {/* Optional area fill beneath the line */}
        {fillColor !== 'transparent' && (
          <Path d={areaPath} fill={fillColor} opacity={0.15} />
        )}

        {/* Trend line */}
        <Path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data point dots */}
        {showDots &&
          points.map((p, i) => (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              // Latest point is slightly larger to draw the eye.
              r={i === points.length - 1 ? 4 : 2.5}
              fill={lineColor}
            />
          ))}
      </Svg>

      {/* Latest value label beside the chart */}
      {showLatestValue && (
        <Text
          style={{
            marginLeft: 8,
            fontSize: 14,
            fontWeight: '900',
            color: lineColor,
          }}
        >
          {latestValue}
          {unit}
        </Text>
      )}
    </View>
  );
}
