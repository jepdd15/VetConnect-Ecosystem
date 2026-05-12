/**
 * LabZoomModal — full-screen lab results history viewer.
 *
 * Shows all lab results across a pet's medical history with:
 * - A horizontal test-selector chip bar ("All" + one chip per unique test)
 * - A SparkLine chart for numeric tests with >= 2 data points, including the
 *   species-specific reference-range band
 * - A chronological list (newest first) for all result types
 *
 * Design: Modern Clinical Neubrutalism — borderRadius 0, solid borders,
 * COLORS from mobileTokens. Mirrors VitalsZoomModal's visual language.
 */

import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../theme/mobileTokens';
import { LineChart as GiftedLineChart } from 'react-native-gifted-charts';
// LineChart from react-native-gifted-charts replaces react-native-chart-kit.

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 64;



// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves a species-keyed or flat reference range to { low, high } for
 * SparkLine's normalRange prop. Returns null when range is absent or malformed.
 *
 * @param {object|array|null} range - Raw referenceRange from Firestore.
 * @param {string} petSpecies - e.g. 'Canine' or 'Feline'.
 * @returns {{ low: number, high: number } | null}
 */
function resolveNormalRange(range, petSpecies) {
  if (!range) return null;
  const speciesKey = (petSpecies || '').toLowerCase().includes('cat') ? 'feline' : 'canine';
  const resolved = range[speciesKey] || range;
  if (Array.isArray(resolved) && resolved.length === 2) {
    return { low: resolved[0], high: resolved[1] };
  }
  return null;
}

/**
 * Derives the display label for a status pill, handling positive-negative tests.
 *
 * @param {string} resultType - 'positive-negative', 'numeric', or 'descriptive'.
 * @param {string} statusKey  - Lowercase status string (e.g. 'normal', 'abnormal', 'critical').
 * @returns {string} Uppercase display label.
 */
function deriveChipLabel(resultType, statusKey) {
  if (resultType === 'positive-negative') {
    if (statusKey === 'normal') return 'NEGATIVE';
    if (statusKey === 'critical') return 'CRITICAL';
    return 'POSITIVE';
  }
  return statusKey.toUpperCase();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * @param {boolean}  visible           - Controls Modal visibility.
 * @param {function} onClose           - Called when user closes the modal.
 * @param {string}   petName           - Pet name for the header.
 * @param {string}   petSpecies        - 'Canine' or 'Feline' for reference range resolution.
 * @param {string|null} initialTest    - Pre-selected test name (or null for 'All').
 * @param {{ testName, result, numericResult, status, unit, referenceRange, resultType, date, ms }[]} timeline
 *   - Full chronological timeline (newest first).
 * @param {string[]} uniqueTests       - Sorted unique test names for the chip selector.
 */
export default function LabZoomModal({
  visible,
  onClose,
  petName,
  petSpecies,
  initialTest,
  timeline,
  uniqueTests,
}) {
  const [selectedTest, setSelectedTest] = useState(initialTest || 'All');

  // Reset selection when modal opens or the tapped test changes.
  useEffect(() => {
    setSelectedTest(initialTest || 'All');
  }, [visible, initialTest]);

  if (!visible) return null;

  // Filter timeline to the selected test (or keep all for 'All').
  const filteredTimeline = selectedTest === 'All'
    ? (timeline || [])
    : (timeline || []).filter(e => e.testName === selectedTest);

  // Numeric points for the SparkLine chart — sorted oldest → newest for a
  // left-to-right time axis. Chart is only shown for a single test with >= 2 points.
  const numericPoints = filteredTimeline
    .filter(e => e.numericResult != null)
    .sort((a, b) => a.ms - b.ms);

  const showChart = selectedTest !== 'All' && numericPoints.length >= 2;

  // Reference range and unit from the most-recent entry with one.
  const chartEntry = numericPoints[numericPoints.length - 1] || null;
  const unit = chartEntry?.unit || '';
  const resolvedRef = showChart
    ? resolveNormalRange(chartEntry?.referenceRange, petSpecies)
    : null;

  // SparkLine data shape: { label: string, value: number }[]
  const sparkData = numericPoints.map(p => ({
    label: p.date ? p.date.split(',')[0] : '',   // "Apr 5" from "Apr 5, 2025"
    value: p.numericResult,
  }));

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
              <Text style={styles.title}>Your Pet's Test Results</Text>
              <Text style={styles.subtitle}>{petName}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <MaterialIcons name="close" size={24} color={COLORS.brand} />
            </TouchableOpacity>
          </View>

          {/* Test selector — horizontal chip bar */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipScrollContent}
          >
            {/* "All" chip */}
            <TouchableOpacity
              style={[
                styles.chip,
                selectedTest === 'All' && styles.chipActive,
              ]}
              onPress={() => setSelectedTest('All')}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedTest === 'All' && styles.chipTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>

            {/* One chip per unique test */}
            {(uniqueTests || []).map(name => (
              <TouchableOpacity
                key={name}
                style={[
                  styles.chip,
                  selectedTest === name && styles.chipActive,
                ]}
                onPress={() => setSelectedTest(name)}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedTest === name && styles.chipTextActive,
                  ]}
                >
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Lab trend chart — single numeric test with >= 2 data points */}
          {showChart && (
            <View style={styles.chartContainer}>
              <GiftedLineChart
                data={sparkData.map((d, i) => ({
                  value: d.value,
                  label: i % Math.ceil(sparkData.length / 5) === 0
                    ? (d.label ?? '') : '',
                }))}
                width={CHART_WIDTH - 40}
                height={160}
                overflowTop={20}
                curved
                areaChart
                color={COLORS.info}
                startFillColor={COLORS.info}
                startOpacity={0.15}
                endOpacity={0.03}
                thickness={2}
                yAxisLabelWidth={55}
                formatYLabel={v =>
                  unit ? `${parseFloat(v).toFixed(1)} ${unit}` : parseFloat(v).toFixed(1)
                }
                yAxisTextStyle={{ fontSize: 10, color: COLORS.accent }}
                xAxisLabelTextStyle={{ fontSize: 9, color: COLORS.accentLight }}
                dataPointsColor={COLORS.brand}
                dataPointsRadius={4}
                rulesType="solid"
                rulesColor="rgba(0,0,0,0.05)"
                xAxisColor="#E0E0E0"
                yAxisColor="#E0E0E0"
                noOfSections={4}
              />
            </View>
          )}

          {/* Reference range legend when chart is shown */}
          {showChart && resolvedRef && (
            <View style={styles.legend}>
              <View style={styles.legendSwatch} />
              <Text style={styles.legendText}>
                Normal range: {resolvedRef.low}{unit ? ` ${unit}` : ''} – {resolvedRef.high}{unit ? ` ${unit}` : ''}
              </Text>
            </View>
          )}

          {/* Chronological list — always shown, newest first */}
          <ScrollView
            style={styles.listScroll}
            showsVerticalScrollIndicator={false}
          >
            {filteredTimeline.length === 0 && (
              <Text style={styles.emptyText}>No results to display.</Text>
            )}
            {filteredTimeline.map((entry, i) => {
              const statusKey = (entry.status || 'normal').toLowerCase();
              const statusColor =
                statusKey === 'critical' ? COLORS.danger :
                statusKey === 'abnormal' ? COLORS.warning :
                COLORS.success;
              const statusBg =
                statusKey === 'critical' ? '#FFEBEE' :
                statusKey === 'abnormal' ? '#FFF3E0' :
                '#E8F5E9';
              const chipLabel = deriveChipLabel(entry.resultType, statusKey);

              const refDisplay = (() => {
                const range = entry.referenceRange;
                if (!range) return null;
                const speciesKey = (petSpecies || '').toLowerCase().includes('cat') ? 'feline' : 'canine';
                const resolved = range[speciesKey] || range;
                if (Array.isArray(resolved) && resolved.length === 2) {
                  return `Ref: ${resolved[0]} – ${resolved[1]}${entry.unit ? ` ${entry.unit}` : ''}`;
                }
                return null;
              })();

              return (
                <View key={i} style={styles.listRow}>
                  <Text style={styles.listDate}>{entry.date}</Text>
                  <View style={styles.listRowBody}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.listTestNameRow}>
                        <Text style={styles.listTestName}>{entry.testName}</Text>
                        <Text
                          style={[styles.listStatusPill, { color: statusColor, backgroundColor: statusBg }]}
                        >
                          {chipLabel}
                        </Text>
                      </View>
                      <Text style={styles.listResult}>
                        {entry.result}{entry.unit ? ` ${entry.unit}` : ''}
                      </Text>
                      {refDisplay && (
                        <Text style={styles.listRefRange}>{refDisplay}</Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
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
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.white,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderColor: COLORS.brand,
    borderRadius: 0,
    maxHeight: '90%',
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

  // Chip selector
  chipScroll: {
    marginBottom: 12,
  },
  chipScrollContent: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    backgroundColor: COLORS.white,
  },
  chipActive: {
    backgroundColor: COLORS.info,
    borderColor: COLORS.info,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipTextActive: {
    color: COLORS.white,
  },

  // Chart section
  chartContainer: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 0,
    padding: 8,
  },

  // Reference range legend
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    backgroundColor: '#4CAF50',
    opacity: 0.3,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 0,
  },
  legendText: {
    fontSize: 10,
    color: COLORS.textMuted,
  },

  // Chronological list
  listScroll: {
    flex: 1,
    marginBottom: 12,
  },
  listRow: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 0,
    padding: 10,
    backgroundColor: '#FAFAFA',
  },
  listDate: {
    fontSize: 10,
    color: '#BDBDBD',
    marginBottom: 4,
  },
  listRowBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  listTestNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  listTestName: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.brand,
    flex: 1,
  },
  listStatusPill: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 0,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  listResult: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  listRefRange: {
    fontSize: 10,
    color: '#9E9E9E',
    marginTop: 1,
  },

  // Empty state
  emptyText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },

  // Close button
  closeBtn: {
    backgroundColor: COLORS.brand,
    padding: 14,
    alignItems: 'center',
    borderRadius: 0,
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
