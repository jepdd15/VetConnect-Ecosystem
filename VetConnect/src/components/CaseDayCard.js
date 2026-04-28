/**
 * CaseDayCard — renders a multi-day carry-over visit as a single card
 * with a swipeable horizontal pager. Each page represents one case day.
 *
 * Props:
 *   caseChain    {object[]}  — appointments sorted by caseDay ascending (from buildCaseChains)
 *   isHistory    {boolean}   — true when rendered in the History tab
 *   salesByAppt  {object}    — keyed by appointmentId; value has { total }
 *   onShowReceipt {function} — (item) => void
 *   onRebook      {function} — (item) => void
 */

import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { COLORS } from '../theme/mobileTokens';
import {
  getClientStatusColor,
  getClientStatusIcon,
  getClientStatusLabel,
  sanitizeCancelReason,
} from '../utils/statusLabels';
import { formatDisplayDate, formatFirestoreTime } from '../utils/helpers';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Converts accumulated minutes to a human-readable clinic time string.
 * Returns null when the value is falsy so the caller can skip rendering.
 *
 * @param {number|null|undefined} mins
 * @returns {string|null}
 */
const formatClinicTime = (mins) => {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

// ─── Component ──────────────────────────────────────────────────────────────

const CaseDayCard = ({ caseChain, isHistory, salesByAppt, onShowReceipt, onRebook }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const pagerRef = useRef(null);
  const { width: windowWidth } = useWindowDimensions();

  // Track which page is visible for the dot indicators.
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });
  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0);
    }
  }, []);

  const pageWidth = windowWidth - 40;

  // Fixed-size pages allow the FlatList to skip layout measurement per item.
  const getItemLayout = useCallback((_data, index) => ({
    length: pageWidth,
    offset: pageWidth * index,
    index,
  }), [pageWidth]);

  // ── Derived header values ────────────────────────────────────────────────

  const firstDay = caseChain[0];
  const lastDay = caseChain[caseChain.length - 1];

  const petName = firstDay.petName || 'Pet';
  const serviceName = firstDay.serviceType || firstDay.primaryService || '';
  const dayCount = caseChain.length;

  const startDateStr = formatDisplayDate(firstDay.scheduledDate, { month: 'short', day: 'numeric' });
  const endDateStr = formatDisplayDate(lastDay.scheduledDate, { month: 'short', day: 'numeric', year: 'numeric' });
  // Show single date if the chain started and ended on the same calendar day (edge case).
  const dateRangeStr = startDateStr === endDateStr ? startDateStr : `${startDateStr} – ${endDateStr}`;

  // accumulatedWaitMins lives on the last appointment in the chain.
  const clinicTimeStr = formatClinicTime(lastDay.accumulatedWaitMins);

  // ── Day page renderer ────────────────────────────────────────────────────

  const renderDayPage = ({ item: appt, index }) => {
    const dayNumber = appt.caseDay || (index + 1);
    const statusColors = getClientStatusColor(appt.status);
    const statusIcon = getClientStatusIcon(appt.status);
    const statusLabel = getClientStatusLabel(appt.status);
    const dateStr = formatDisplayDate(appt.scheduledDate, { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = formatFirestoreTime(appt.scheduledDate);

    const hasSaleData = appt.status === 'completed' && salesByAppt?.[appt.id]?.total != null;
    const saleTotal = hasSaleData ? salesByAppt[appt.id].total : null;

    const cancelReason = (() => {
      const raw = appt.auditReason || appt.rejectReason;
      return sanitizeCancelReason(raw);
    })();

    const showReceiptButton = isHistory && appt.status === 'completed';
    const showRebookButton = isHistory && (
      appt.status === 'completed' ||
      appt.status === 'no-show' ||
      appt.status === 'carried-over'
    );

    return (
      <View style={[styles.dayPage, { width: pageWidth }]}>
        {/* Day label */}
        <View style={styles.dayLabelRow}>
          <Text style={styles.dayLabel}>DAY {dayNumber}</Text>
          <Text style={styles.dayDate}>{dateStr}</Text>
        </View>

        {/* Time */}
        {timeStr ? (
          <Text style={styles.dayTime}>⏰ {timeStr}</Text>
        ) : null}

        {/* Status badge */}
        <View style={[styles.statusBadge, { backgroundColor: statusColors.backgroundColor }]}>
          <Text style={[styles.statusText, { color: statusColors.color }]}>
            {statusIcon} {statusLabel.toUpperCase()}
          </Text>
        </View>

        {/* Paid amount */}
        {hasSaleData && (
          <Text style={styles.paidText}>Paid ₱{saleTotal}</Text>
        )}

        {/* Cancel / carry-over reason */}
        {cancelReason ? (
          <Text style={styles.reasonText}>{cancelReason}</Text>
        ) : null}

        {/* Action buttons */}
        {(showReceiptButton || showRebookButton) && (
          <View style={styles.actionRow}>
            {showReceiptButton && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.receiptBtn]}
                onPress={() => onShowReceipt(appt)}
              >
                <Text style={[styles.actionBtnText, { color: COLORS.accent }]}>
                  🧾 E-Receipt
                </Text>
              </TouchableOpacity>
            )}
            {showRebookButton && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.rebookBtn]}
                onPress={() => onRebook(appt)}
              >
                <Text style={[styles.actionBtnText, { color: COLORS.accent }]}>
                  🔄 Re-Book
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.outerWrapper}>
      {/* Neubrutalism offset shadow layer */}
      <View style={styles.shadowLayer} />

      {/* Card */}
      <View style={styles.card}>
        {/* Pinned case header */}
        <View style={styles.caseHeader}>
          <View style={styles.caseHeaderRow}>
            <Text style={styles.petName} numberOfLines={1}>{petName}</Text>
            <View style={styles.caseBadge}>
              <Text style={styles.caseBadgeText}>CASE: {dayCount} DAYS</Text>
            </View>
          </View>

          {serviceName ? (
            <Text style={styles.serviceName}>{serviceName}</Text>
          ) : null}

          <Text style={styles.dateRange}>{dateRangeStr}</Text>

          {clinicTimeStr && (
            <Text style={styles.clinicTime}>Total clinic time: {clinicTimeStr}</Text>
          )}
        </View>

        {/* Horizontal swipe pager */}
        <FlatList
          ref={pagerRef}
          data={caseChain}
          keyExtractor={(appt) => appt.id}
          renderItem={renderDayPage}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={getItemLayout}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig.current}
          style={styles.pager}
        />

        {/* Dot indicators */}
        {dayCount > 1 && (
          <View style={styles.dotRow}>
            {caseChain.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i === activeIndex ? COLORS.brand : COLORS.borderLight },
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  outerWrapper: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  shadowLayer: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: COLORS.brand,
  },
  card: {
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
  },

  // ── Case header ────────────────────────────────────────────────────────
  caseHeader: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.warning,
  },
  caseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  petName: {
    fontWeight: '900',
    fontSize: 15,
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
    marginRight: 8,
  },
  caseBadge: {
    backgroundColor: COLORS.warning,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 0,
  },
  caseBadgeText: {
    fontWeight: '900',
    fontSize: 11,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  serviceName: {
    fontSize: 13,
    color: COLORS.accent,
    marginBottom: 3,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateRange: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  clinicTime: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 3,
    fontStyle: 'italic',
  },

  // ── Pager ──────────────────────────────────────────────────────────────
  pager: {
    // Height is determined by the content of the tallest day page,
    // but we set a minimum so the pager has consistent visual weight.
    minHeight: 160,
  },

  // ── Day page ───────────────────────────────────────────────────────────
  dayPage: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    // Width is set dynamically via inline style (pageWidth)
  },
  dayLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  dayLabel: {
    fontWeight: '900',
    fontSize: 13,
    color: COLORS.warning,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginRight: 10,
  },
  dayDate: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayTime: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 0,
    marginBottom: 8,
  },
  statusText: {
    fontWeight: '900',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  paidText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.success,
    marginBottom: 6,
  },
  reasonText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginBottom: 8,
  },

  // ── Action buttons ─────────────────────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 0,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.cream,
  },
  receiptBtn: {
    borderColor: COLORS.accent,
  },
  rebookBtn: {
    borderColor: COLORS.accent,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Dot indicators ─────────────────────────────────────────────────────
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4, // dots themselves are circles; only card containers are zero-radius
  },
});

export default CaseDayCard;
