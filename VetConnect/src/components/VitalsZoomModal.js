/**
 * VitalsZoomModal — full-width, tap-to-expand vital trend chart.
 *
 * Renders as a slide-up Modal with a full-width SVG chart, Y-axis labels,
 * X-axis date labels, a species-normal reference band, tappable data-point
 * circles with tooltip bubbles, and a delta annotation.
 *
 * Design: Modern Clinical Neubrutalism — borderRadius 0, solid borders,
 * COLORS from mobileTokens.
 */

import React, { useState } from 'react';
import {
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Circle, Line, Path, Rect, Svg } from 'react-native-svg';
import { COLORS } from '../theme/mobileTokens';
import { valueToY } from '../utils/chartHelpers';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_MARGIN = { top: 20, right: 16, bottom: 40, left: 48 };
const CHART_WIDTH  = SCREEN_WIDTH - 32 - CHART_MARGIN.left - CHART_MARGIN.right;
const CHART_HEIGHT = 260;
const SVG_WIDTH    = CHART_WIDTH + CHART_MARGIN.left + CHART_MARGIN.right;
const SVG_HEIGHT   = CHART_HEIGHT + CHART_MARGIN.top  + CHART_MARGIN.bottom;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * @param {boolean}  visible      - Controls Modal visibility.
 * @param {function} onClose      - Called when user closes the modal.
 * @param {string}   vitalKey     - Identifier for the vital (e.g. 'weight').
 * @param {string}   vitalLabel   - Human-readable vital name (e.g. 'Weight Trend').
 * @param {{ label: string, value: number }[]} data - Ordered chart data (oldest → newest).
 * @param {string}   unit         - Unit suffix (e.g. 'kg', '°C').
 * @param {string}   lineColor    - Stroke colour for the line and dots.
 * @param {{ low: number, high: number } | null} normalRange - Species-normal band, or null.
 * @param {string}   petName      - Displayed below the vital label in the header.
 */
export default function VitalsZoomModal({
  visible,
  onClose,
  vitalLabel,
  data,
  unit,
  lineColor,
  normalRange,
  petName,
}) {
  const [tooltip, setTooltip] = useState(null); // { x, y, value, label }

  if (!visible) return null;

  // Filter to valid numeric points — same logic as SparkLine.
  const validPoints = (data || []).filter(
    (d) => d.value != null && !isNaN(parseFloat(d.value)),
  );

  if (validPoints.length === 0) return null;

  const values   = validPoints.map((d) => parseFloat(d.value));
  const rawMin   = Math.min(...values);
  const rawMax   = Math.max(...values);
  const padding  = (rawMax - rawMin) * 0.1 || 1;
  const paddedMin = rawMin - padding;
  const paddedMax = rawMax + padding;

  // Map data points to pixel coordinates within the chart area.
  const chartPoints = validPoints.map((d, i) => ({
    x: CHART_MARGIN.left + (
      validPoints.length === 1
        ? CHART_WIDTH / 2
        : (i / (validPoints.length - 1)) * CHART_WIDTH
    ),
    y: CHART_MARGIN.top + valueToY(parseFloat(d.value), paddedMin, paddedMax, CHART_HEIGHT),
    value: parseFloat(d.value),
    label: d.label,
  }));

  // SVG line path connecting all data points.
  const linePath = chartPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  // Five evenly-spaced Y-axis tick values.
  const yTicks = Array.from({ length: 5 }, (_, i) =>
    paddedMin + (paddedMax - paddedMin) * (i / 4),
  );

  // Up to 5 evenly-spaced X-axis label indices.
  const maxXLabels    = Math.min(5, validPoints.length);
  const xLabelIndices = maxXLabels <= 1
    ? [0]
    : Array.from({ length: maxXLabels }, (_, i) =>
        Math.round((i / (maxXLabels - 1)) * (validPoints.length - 1)),
      );

  // Species-normal reference band.
  let bandElement = null;
  if (normalRange) {
    const bandTopY    = CHART_MARGIN.top + valueToY(normalRange.high, paddedMin, paddedMax, CHART_HEIGHT);
    const bandBottomY = CHART_MARGIN.top + valueToY(normalRange.low,  paddedMin, paddedMax, CHART_HEIGHT);
    const bandHeight  = Math.abs(bandBottomY - bandTopY);
    if (bandHeight > 0) {
      bandElement = (
        <Rect
          x={CHART_MARGIN.left}
          y={Math.min(bandTopY, bandBottomY)}
          width={CHART_WIDTH}
          height={bandHeight}
          fill="#4CAF50"
          opacity={0.1}
        />
      );
    }
  }

  // Delta annotation — change between the last two readings, direction only.
  // Color is always neutral (COLORS.textMuted) — pet owners should not
  // interpret direction without vet advice.
  let deltaText = null;
  if (values.length >= 2) {
    const diff = values[values.length - 1] - values[values.length - 2];
    if (diff !== 0) {
      const arrow = diff > 0 ? '↑' : '↓';
      const sign  = diff > 0 ? '+' : '';
      deltaText = `${arrow} ${sign}${Number(diff.toFixed(1))}${unit} since last visit`;
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{vitalLabel}</Text>
              <Text style={styles.subtitle}>{petName}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <MaterialIcons name="close" size={24} color={COLORS.brand} />
            </TouchableOpacity>
          </View>

          {/* Chart area — tapping anywhere outside a dot clears the tooltip */}
          <TouchableOpacity activeOpacity={1} onPress={() => setTooltip(null)}>
            <Svg width={SVG_WIDTH} height={SVG_HEIGHT}>
              {/* Species-normal reference band — behind all other elements */}
              {bandElement}

              {/* Y-axis grid lines */}
              {yTicks.map((tick, i) => {
                const y = CHART_MARGIN.top + valueToY(tick, paddedMin, paddedMax, CHART_HEIGHT);
                return (
                  <Line
                    key={`grid-${i}`}
                    x1={CHART_MARGIN.left}
                    y1={y}
                    x2={CHART_MARGIN.left + CHART_WIDTH}
                    y2={y}
                    stroke="#E0E0E0"
                    strokeWidth={1}
                  />
                );
              })}

              {/* Trend line */}
              {chartPoints.length >= 2 && (
                <Path
                  d={linePath}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data point circles — each circle is individually tappable */}
              {chartPoints.map((p, i) => (
                <Circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={5}
                  fill={lineColor}
                  onPress={() => setTooltip({ x: p.x, y: p.y, value: p.value, label: p.label })}
                />
              ))}
            </Svg>

            {/* Y-axis labels — React Native Text positioned absolutely over the SVG */}
            {yTicks.map((tick, i) => {
              const y = CHART_MARGIN.top + valueToY(tick, paddedMin, paddedMax, CHART_HEIGHT);
              return (
                <Text
                  key={`yl-${i}`}
                  style={[styles.axisLabel, { position: 'absolute', top: y - 6, left: 4 }]}
                >
                  {Number(tick.toFixed(1))}
                </Text>
              );
            })}

            {/* X-axis date labels */}
            {xLabelIndices.map((idx, i) => (
              <Text
                key={`xl-${i}`}
                style={[
                  styles.axisLabel,
                  {
                    position: 'absolute',
                    top: CHART_MARGIN.top + CHART_HEIGHT + 8,
                    left: chartPoints[idx].x - 18,
                    width: 40,
                    textAlign: 'center',
                  },
                ]}
              >
                {validPoints[idx].label}
              </Text>
            ))}

            {/* Tooltip bubble — shown when a data dot is tapped */}
            {tooltip && (
              <View
                style={[
                  styles.tooltip,
                  {
                    position: 'absolute',
                    top: tooltip.y - 44,
                    left: Math.min(
                      Math.max(tooltip.x - 40, 8),
                      SVG_WIDTH - 88,
                    ),
                  },
                ]}
              >
                <Text style={styles.tooltipValue}>{tooltip.value}{unit}</Text>
                <Text style={styles.tooltipDate}>{tooltip.label}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Delta annotation */}
          {deltaText && (
            <Text style={styles.delta}>{deltaText}</Text>
          )}

          {/* Normal range legend */}
          {normalRange && (
            <View style={styles.legend}>
              <View style={styles.legendSwatch} />
              <Text style={styles.legendText}>
                Normal range: {normalRange.low}{unit} – {normalRange.high}{unit}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.brand,
    borderRadius: 0,
    width: '100%',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  axisLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
  tooltip: {
    backgroundColor: COLORS.brand,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.brand,
    alignItems: 'center',
  },
  tooltipValue: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.white,
  },
  tooltipDate: {
    fontSize: 9,
    color: '#D7CCC8',
  },
  delta: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    backgroundColor: '#4CAF50',
    opacity: 0.3,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  legendText: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
});
