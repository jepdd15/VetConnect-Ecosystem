/**
 * CaseDayCard — renders a multi-day carry-over visit as a single card
 * with a swipeable horizontal pager. Each page represents one case day.
 *
 * Props:
 *   caseChain     {object[]}  — appointments sorted by caseDay ascending (from buildCaseChains)
 *   isHistory     {boolean}   — true when rendered in the History tab
 *   salesByAppt   {object}    — keyed by appointmentId; value has { total }
 *   onShowReceipt {function}  — (item) => void
 *   onRebook      {function}  — (item) => void
 *   navigation    {object}    — React Navigation object for deep links
 */

import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { COLORS } from '../theme/mobileTokens';
import { formatDisplayDate } from '../utils/helpers';
import { formatDurationMins } from '../utils/buildVisitTimeline';
import AppointmentCardContent from './AppointmentCardContent';

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatClinicTime = (mins) => {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

// ─── Component ──────────────────────────────────────────────────────────────

const CaseDayCard = ({ caseChain, isHistory, salesByAppt, onShowReceipt, onRebook, navigation }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const pagerRef = useRef(null);
  const { width: windowWidth } = useWindowDimensions();

  const [expandedDays, setExpandedDays] = useState(new Set());

  const toggleDayTimeline = (index) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const [expandedEncounterDays, setExpandedEncounterDays] = useState(new Set());

  const toggleDayEncounter = (index) => {
    setExpandedEncounterDays((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });
  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0);
    }
  }, []);

  const pageWidth = windowWidth - 84;

  const getItemLayout = useCallback((_data, index) => ({
    length: pageWidth,
    offset: pageWidth * index,
    index,
  }), [pageWidth]);

  const firstDay = caseChain[0];
  const lastDay = caseChain[caseChain.length - 1];

  const petName = firstDay.petName || 'Pet';
  const serviceName = [...new Set(caseChain.flatMap(a => (a.services || []).map(s => s.name)).filter(Boolean))].join(', ')
    || firstDay.serviceType || firstDay.primaryService || '';
  const dayCount = lastDay.caseDay || caseChain.length;

  const startDateStr = formatDisplayDate(firstDay.scheduledDate, { month: 'short', day: 'numeric' });
  const endDateStr = formatDisplayDate(lastDay.scheduledDate, { month: 'short', day: 'numeric', year: 'numeric' });
  const dateRangeStr = startDateStr === endDateStr ? startDateStr : `${startDateStr} – ${endDateStr}`;

  const clinicTimeStr = (() => {
    const sealedDays = caseChain.filter(a => a.forensicSeal?.raw);
    if (sealedDays.length > 0) {
      const totalMins = sealedDays.reduce((sum, a) => {
        const r = a.forensicSeal.raw;
        return sum + (r.shiftQueue || 0) + (r.shiftConsult || 0) + (r.shiftConfined || 0);
      }, 0);
      return formatDurationMins(totalMins) ?? null;
    }
    return formatClinicTime(lastDay.accumulatedWaitMins);
  })();

  const renderDayPage = ({ item: appt, index }) => {
    const dayNumber = appt.caseDay || (index + 1);
    return (
      <View style={[styles.dayPage, { width: pageWidth }]}>
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={styles.dayPageScroll}
        >
          <AppointmentCardContent
            appointment={appt}
            isUpcoming={!isHistory}
            sale={salesByAppt?.[appt.id]}
            onShowReceipt={onShowReceipt}
            onToggleTimeline={() => toggleDayTimeline(index)}
            isTimelineExpanded={expandedDays.has(index)}
            onToggleEncounter={() => toggleDayEncounter(index)}
            isEncounterExpanded={expandedEncounterDays.has(index)}
            navigation={navigation}
            isCaseDayPage
            caseDayNumber={dayNumber}
          />
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.outerWrapper}>
      <View style={styles.shadowLayer} />

      <View style={styles.card}>
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

          {clinicTimeStr ? (
            <Text style={styles.clinicTime}>Total clinic time: {clinicTimeStr}</Text>
          ) : null}
        </View>

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

  caseHeader: {
    backgroundColor: COLORS.warningBg,
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
    color: COLORS.white,
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

  pager: {},

  dayPage: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dayPageScroll: {},

  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 0,
  },
});

export default CaseDayCard;
