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
 *   normalRange={{ low: 3.0, high: 5.0 }}
 *   showDateLabels
 * />
 */

import { Dimensions, Text, View } from 'react-native';
import { Circle, Path, Rect, Svg } from 'react-native-svg';
import { clamp, valueToY } from '../utils/chartHelpers';
import { COLORS } from '../theme/mobileTokens';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * @param {{ label: string, value: number }[]} data           - Ordered data points (oldest → newest left-to-right).
 * @param {number}  [width]                                    - SVG canvas width in px. Defaults to window width minus 80px card padding.
 * @param {number}  [height=60]                                - SVG canvas height in px.
 * @param {string}  [lineColor]                                - Stroke colour for the line and dots. Defaults to COLORS.accent.
 * @param {string}  [fillColor='transparent']                  - Optional area fill colour below the line.
 * @param {boolean} [showDots=true]                            - Whether to render circles at each data point.
 * @param {boolean} [showLatestValue=true]                     - Whether to display the latest value as text beside the chart.
 * @param {string}  [unit='']                                  - Suffix appended to the latest value display (e.g. "kg", "°C").
 * @param {{ low: number, high: number } | null} [normalRange] - Species-normal range band. When provided, renders a faint green Rect.
 * @param {boolean} [showDateLabels=false]                     - When true, renders first/last date labels below the chart and the oldest value on the left.
 */
export default function SparkLine({
  data,
  width = Dimensions.get('window').width - 160,
  height = 60,
  lineColor = COLORS.accent,
  fillColor = 'transparent',
  showDots = true,
  showLatestValue = true,
  unit = '',
  normalRange = null,
  showDateLabels = false,
}) {
  // Filter out entries without a usable numeric value.
  const validPoints = (data || []).filter(
    (d) => d.value != null && !isNaN(parseFloat(d.value)),
  );

  // Zero points — nothing to render.
  if (validPoints.length === 0) return null;

  // Single point — show the value centered with a "1 reading" subtitle.
  // No line or dots can be drawn from a single coordinate.
  if (validPoints.length === 1) {
    const singleVal = parseFloat(validPoints[0].value);
    return (
      <View style={{ alignItems: 'center', paddingVertical: 4 }}>
        <Text style={{ fontSize: 18, fontWeight: '900', color: lineColor }}>
          {singleVal}{unit}
        </Text>
        <Text style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 2 }}>
          1 reading{showDateLabels ? ` · ${validPoints[0].label}` : ''}
        </Text>
      </View>
    );
  }

  const values = validPoints.map((d) => parseFloat(d.value));
  const rawMin = Math.min(...values, normalRange?.low ?? Infinity);
  const rawMax = Math.max(...values, normalRange?.high ?? -Infinity);

  // Add 10 % padding to the Y axis so extreme points are never flush with edges.
  const padding = (rawMax - rawMin) * 0.1 || 1; // fallback 1 unit when all values identical
  const paddedMin = rawMin - padding;
  const paddedMax = rawMax + padding;

  // Normal range band — computed once, rendered as the first SVG child so it
  // sits behind the line and dots.
  let bandElement = null;
  if (normalRange) {
    const bandTopY    = valueToY(normalRange.high, paddedMin, paddedMax, height);
    const bandBottomY = valueToY(normalRange.low,  paddedMin, paddedMax, height);
    const bandHeight  = Math.abs(bandBottomY - bandTopY);
    if (bandHeight > 0) {
      bandElement = (
        <Rect
          x={0}
          y={Math.min(bandTopY, bandBottomY)}
          width={width}
          height={bandHeight}
          fill="#4CAF50"
          opacity={0.1}
        />
      );
    }
  }

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
  const lastPoint  = points[points.length - 1];
  const firstPoint = points[0];
  const areaPath =
    linePath +
    ` L ${lastPoint.x.toFixed(1)},${height}` +
    ` L ${firstPoint.x.toFixed(1)},${height}` +
    ' Z';

  const latestValue  = values[values.length - 1];
  const oldestValue  = values[0];

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* Oldest value label — shown on the left when showDateLabels is active */}
        {showDateLabels && showLatestValue && (
          <Text
            style={{
              marginRight: 8,
              fontSize: 12,
              fontWeight: '700',
              color: COLORS.textMuted,
            }}
          >
            {oldestValue}{unit}
          </Text>
        )}

        <Svg width={width} height={height}>
          {/* Species-normal reference band — behind everything else */}
          {bandElement}

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

      {/* First/last date labels below the chart */}
      {showDateLabels && validPoints.length >= 2 && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 2,
          }}
        >
          <Text style={{ fontSize: 9, color: COLORS.textMuted }}>
            {validPoints[0].label}
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.textMuted }}>
            {validPoints[validPoints.length - 1].label}
          </Text>
        </View>
      )}
    </View>
  );
}
