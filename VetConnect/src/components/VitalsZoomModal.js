/**
 * VitalsZoomModal — full-width, tap-to-expand vital trend chart.
 *
 * Renders as a slide-up Modal with a GiftedLineChart, Y-axis labels with units,
 * X-axis date labels, species-normal reference lines, interactive pointer
 * tooltip, and a delta annotation.
 *
 * Design: Modern Clinical Neubrutalism — borderRadius 0, solid borders,
 * COLORS from mobileTokens.
 */

import React from 'react';
import {
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LineChart as GiftedLineChart } from 'react-native-gifted-charts';
import { COLORS } from '../theme/mobileTokens';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH  = SCREEN_WIDTH - 100; // Account for modal padding + yAxisLabelWidth

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * @param {boolean}  visible      - Controls Modal visibility.
 * @param {function} onClose      - Called when user closes the modal.
 * @param {string}   vitalLabel   - Human-readable vital name (e.g. 'Weight Trend').
 * @param {{ label: string, value: number }[]} data - Ordered chart data (oldest → newest).
 * @param {string}   unit         - Unit suffix (e.g. 'kg', '°C').
 * @param {string}   lineColor    - Stroke colour for the line and dots.
 * @param {{ low: number, high: number } | null} normalRange - Species-normal band, or null.
 * @param {string}   petName      - Displayed below the vital label in the header.
 * @param {{ min: number, max: number } | null} yDomain - Optional fixed Y-axis domain. When
 *   provided, overrides auto-domain derived from data (e.g. pain score always 0–10).
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
  yDomain = null,
}) {
  if (!visible) return null;

  // Filter to valid numeric points.
  const validPoints = (data || []).filter(
    (d) => d.value != null && !isNaN(parseFloat(d.value)),
  );

  if (validPoints.length === 0) return null;

  const values = validPoints.map((d) => parseFloat(d.value));

  // Build chart data array for GiftedLineChart.
  const chartData = validPoints.map((d, i) => ({
    value: parseFloat(d.value),
    label: i % Math.ceil(validPoints.length / 5) === 0
      ? (d.label ?? '') : '',
    dataPointColor: normalRange
      ? (d.value >= normalRange.low && d.value <= normalRange.high
          ? COLORS.success : COLORS.danger)
      : lineColor,
  }));

  // Delta annotation — change between the last two readings.
  let deltaText = null;
  if (values.length >= 2) {
    const diff = values[values.length - 1] - values[values.length - 2];
    if (diff !== 0) {
      const arrow = diff > 0 ? '↑' : '↓';
      const sign  = diff > 0 ? '+' : '';
      deltaText = `${arrow} ${sign}${Number(diff.toFixed(1))}${unit} since last visit`;
    }
  }

  // Y-axis domain props.
  const yAxisProps = {};
  if (yDomain) {
    yAxisProps.maxValue = yDomain.max;
    yAxisProps.minValue = yDomain.min;
    yAxisProps.stepValue = yDomain.max <= 10 ? (yDomain.max <= 5 ? 1 : 2) : undefined;
  }

  // Reference line props for normal range.
  const refLineProps = {};
  if (normalRange) {
    refLineProps.showReferenceLine1 = true;
    refLineProps.referenceLine1Position = normalRange.low;
    refLineProps.referenceLine1Config = {
      color: COLORS.success,
      thickness: 1.5,
    };
    refLineProps.showReferenceLine2 = true;
    refLineProps.referenceLine2Position = normalRange.high;
    refLineProps.referenceLine2Config = {
      color: COLORS.success,
      thickness: 1.5,
    };
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

          {/* Chart */}
          <GiftedLineChart
            data={chartData}
            width={CHART_WIDTH}
            height={260}
            initialSpacing={20}
            endSpacing={20}
            overflowTop={20}
            curved
            areaChart
            color={lineColor}
            startFillColor={lineColor}
            startOpacity={0.1}
            endOpacity={0.02}
            thickness={2.5}
            dataPointsRadius={5}
            yAxisLabelWidth={50}
            formatYLabel={v => `${parseFloat(v).toFixed(1)}${unit}`}
            yAxisTextStyle={{ fontSize: 9, color: COLORS.textMuted }}
            xAxisLabelTextStyle={{ fontSize: 9, color: COLORS.textMuted }}
            rulesType="solid"
            rulesColor="#E0E0E0"
            xAxisColor="#E0E0E0"
            yAxisColor="#E0E0E0"
            noOfSections={5}
            roundToDigits={1}
            pointerConfig={{
              pointerStripHeight: 260,
              pointerStripColor: 'rgba(0,0,0,0.1)',
              pointerStripWidth: 1,
              pointerColor: lineColor,
              radius: 6,
              pointerLabelWidth: 120,
              pointerLabelHeight: 50,
              autoAdjustPointerLabelPosition: true,
              shiftPointerLabelY: -20,
              pointerLabelComponent: (items) => {
                const item = items?.[0];
                if (!item) return null;
                return (
                  <View style={styles.tooltip}>
                    <Text style={styles.tooltipValue}>
                      {item.value}{unit}
                    </Text>
                    <Text style={styles.tooltipDate}>
                      {validPoints[items[0]?.index]?.label || ''}
                    </Text>
                  </View>
                );
              },
            }}
            {...yAxisProps}
            {...refLineProps}
          />

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
