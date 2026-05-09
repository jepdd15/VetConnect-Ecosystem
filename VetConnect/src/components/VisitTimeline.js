/**
 * VisitTimeline — Vertical visit timeline component.
 *
 * Renders the mapped event array produced by buildVisitTimeline() in one of
 * two modes, controlled by the parent:
 *
 *   Collapsed: single breadcrumb row ("Checked in → With the vet → ...") with
 *              a "▼ View timeline" toggle link. Keeps screen density compact.
 *
 *   Expanded:  full vertical dot-connector-dot list with timestamps, durations,
 *              and staff attribution. Active visits pulse the current dot and
 *              show live elapsed time.
 *
 * This component is CONTROLLED — all state (collapsed/expanded) lives in the
 * parent. Each integration point manages its own collapse independently.
 *
 * Design: Modern Clinical Neubrutalism — zero borderRadius on containers,
 * borderRadius: 5 on dot circles (per CaseDayCard precedent).
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../theme/mobileTokens';
import { formatDurationMins } from '../utils/buildVisitTimeline';

// ─── Dot ─────────────────────────────────────────────────────────────────────

/**
 * Single timeline dot with optional pulse animation for the active current event.
 * Extracted so the Animated.loop lifecycle is isolated per-dot.
 *
 * @param {{ isCurrent: boolean, isActive: boolean, isCorrection: boolean, isTerminal: boolean, isNotification: boolean, toStatus: string }} props
 */
const TimelineDot = ({ isCurrent, isActive, isCorrection, isTerminal, isNotification, toStatus }) => {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!isCurrent || !isActive) return;

    pulseAnim.setValue(0.4);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isCurrent, isActive]);

  // Terminal icons replace the dot.
  if (isTerminal) {
    if (toStatus === 'completed') {
      return (
        <View style={styles.dotContainer}>
          <Text style={[styles.terminalIcon, { color: COLORS.success }]}>✓</Text>
        </View>
      );
    }
    // cancelled / no-show
    return (
      <View style={styles.dotContainer}>
        <Text style={[styles.terminalIcon, { color: COLORS.danger }]}>✕</Text>
      </View>
    );
  }

  // Correction dot: orange.
  if (isCorrection) {
    return (
      <View style={styles.dotContainer}>
        <View style={[styles.dot, { backgroundColor: COLORS.warning }]} />
      </View>
    );
  }

  // Notification dot: static sky-blue (no pulse — not an active clinical state).
  if (isNotification) {
    return (
      <View style={styles.dotContainer}>
        <View style={[styles.dot, { backgroundColor: COLORS.sky }]} />
      </View>
    );
  }

  // Active current event: pulsing sky-blue dot.
  if (isCurrent && isActive) {
    return (
      <View style={styles.dotContainer}>
        <Animated.View style={[styles.dot, { backgroundColor: COLORS.sky, opacity: pulseAnim }]} />
      </View>
    );
  }

  // Past events: solid green.
  return (
    <View style={styles.dotContainer}>
      <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
    </View>
  );
};

// ─── Connector ────────────────────────────────────────────────────────────────

/**
 * Vertical connector row rendered between two consecutive event rows.
 * Shows the duration spent in the preceding stage, and optionally the
 * staff member who performed the transition.
 *
 * @param {{ durationMins: number|null, staffName: string|null, isLiveActive: boolean, liveElapsed: number|null }} props
 */
const TimelineConnector = ({ durationMins, staffName, isLiveActive, liveElapsed }) => {
  let durationStr;
  if (isLiveActive) {
    const elapsed = liveElapsed != null ? liveElapsed : durationMins;
    const formatted = formatDurationMins(elapsed);
    durationStr = formatted ? `Ongoing · ${formatted}` : 'Ongoing';
  } else {
    durationStr = formatDurationMins(durationMins);
  }

  const label = staffName && durationStr
    ? `${staffName} · ${durationStr}`
    : durationStr || staffName || null;

  return (
    <View style={styles.connectorRow}>
      <View style={styles.connectorLeft}>
        <View style={styles.connectorLine} />
      </View>
      <View style={styles.connectorMiddle}>
        {label ? (
          <Text
            style={[
              styles.connectorText,
              isLiveActive && { color: COLORS.sky },
            ]}
          >
            {label}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   events:      Array,    // from buildVisitTimeline()
 *   isActive:    boolean,  // true = active in-clinic visit (pulsing dot, live elapsed)
 *   collapsed:   boolean,  // controlled by parent
 *   onToggle:    function, // () => void
 *   assignedVet: string,   // "Signed by Dr. X" annotation on completed node
 *   services:    Array,    // appointment.services[] — nested sub-items under in-consult node
 * }} props
 */
const VisitTimeline = ({ events, isActive, collapsed, onToggle, assignedVet, services, scheduledDate, caseDay }) => {
  // Live elapsed ticker — only runs when there is an active appointment.
  const [liveElapsed, setLiveElapsed] = useState(null);
  const lastTimestamp = events?.[events.length - 1]?.timestamp?.getTime() ?? 0;

  useEffect(() => {
    if (!isActive || !lastTimestamp) {
      setLiveElapsed(null);
      return;
    }

    const calculateElapsed = () =>
      Math.max(0, Math.round((Date.now() - lastTimestamp) / 60000));

    setLiveElapsed(calculateElapsed());

    const interval = setInterval(() => {
      setLiveElapsed(calculateElapsed());
    }, 60000);

    return () => clearInterval(interval);
  }, [isActive, lastTimestamp]);

  // Empty state — nothing to render.
  if (!events || events.length === 0) return null;

  // ── Collapsed mode: single breadcrumb row ──────────────────────────────
  if (collapsed) {
    const labels = events.map((e) => e.label);
    const lastLabel = labels[labels.length - 1];
    const prefixLabels = labels.slice(0, -1);

    return (
      <View style={styles.wrapper}>
        <TouchableOpacity style={styles.breadcrumbRow} onPress={onToggle} activeOpacity={0.7}>
          <Text style={styles.toggleLabel}>▼ View timeline</Text>
          <Text style={styles.breadcrumb} numberOfLines={1} ellipsizeMode="middle">
            {prefixLabels.length > 0 ? (
              <>
                <Text style={styles.breadcrumbPast}>{prefixLabels.join(' → ')} → </Text>
              </>
            ) : null}
            <Text style={[styles.breadcrumbCurrent, isActive && { color: COLORS.sky, fontWeight: '700' }]}>
              {lastLabel}
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Expanded mode: full vertical timeline ─────────────────────────────
  return (
    <View style={styles.wrapper}>
      {/* Toggle row — always at top when expanded */}
      <TouchableOpacity style={styles.toggleRow} onPress={onToggle} activeOpacity={0.7}>
        <Text style={styles.toggleLabel}>▲ Hide timeline</Text>
      </TouchableOpacity>

      <View style={styles.timelineBody}>
        {events.map((event, index) => {
          const isLast = index === events.length - 1;
          const isLiveConnector = isActive && event.isCurrent;

          return (
            <View key={index}>
              {/* Event row */}
              <View style={styles.eventRow}>
                {/* Left: dot */}
                <TimelineDot
                  isCurrent={event.isCurrent}
                  isActive={isActive}
                  isCorrection={event.isCorrection}
                  isTerminal={event.isTerminal}
                  isNotification={event.isNotification}
                  toStatus={event.toStatus}
                />

                {/* Middle: label */}
                <View style={styles.eventMiddle}>
                  <Text
                    style={[
                      styles.eventLabel,
                      event.isCorrection && styles.eventLabelCorrection,
                      event.isNotification && styles.eventLabelNotification,
                    ]}
                  >
                    {event.label}
                  </Text>
                  {/* Signed-by line — only on the terminal completed node */}
                  {event.signedOffAt && assignedVet ? (
                    <Text style={styles.signedByText}>Signed by {assignedVet}</Text>
                  ) : null}
                </View>

                {/* Right: timestamp */}
                <Text style={styles.eventTime}>
                  {event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>

              {/* Nested per-service annotation under "With the vet" node */}
              {event.toStatus === 'in-consult' && (services?.length ?? 0) >= 2 && (
                <View style={styles.serviceSubItems}>
                  {services.map((svc, si) => {
                    const svcStatus = svc.serviceStatus || 'pending';
                    const svcIcon = svcStatus === 'completed' ? '✓'
                      : svcStatus === 'in-progress' ? '⏳' : '○';
                    let durationStr = '';
                    if (svcStatus === 'completed' && svc.serviceStartedAt && svc.serviceCompletedAt) {
                      const startMs = typeof svc.serviceStartedAt.toDate === 'function'
                        ? svc.serviceStartedAt.toDate().getTime()
                        : new Date(svc.serviceStartedAt).getTime();
                      const endMs = typeof svc.serviceCompletedAt.toDate === 'function'
                        ? svc.serviceCompletedAt.toDate().getTime()
                        : new Date(svc.serviceCompletedAt).getTime();
                      const mins = Math.round((endMs - startMs) / 60000);
                      if (Number.isFinite(mins) && mins > 0) durationStr = ` (${mins} min)`;
                    }
                    const isPriorDay = svcStatus === 'completed' && svc.serviceCompletedAt && scheduledDate && (caseDay || 1) > 1 && (() => {
                      const schedMs = typeof scheduledDate.toDate === 'function' ? scheduledDate.toDate().getTime() : new Date(scheduledDate).getTime();
                      const compMs = typeof svc.serviceCompletedAt.toDate === 'function' ? svc.serviceCompletedAt.toDate().getTime() : new Date(svc.serviceCompletedAt).getTime();
                      return compMs < schedMs;
                    })();
                    return (
                      <Text key={svc.id || si} style={[
                        styles.serviceSubItem,
                        svcStatus === 'in-progress' && { color: COLORS.sky },
                        svcStatus === 'completed' && { color: COLORS.success },
                      ]}>
                        {svcIcon} {svc.name || 'Service'}{durationStr}{isPriorDay ? ' · prev. day' : ''}
                      </Text>
                    );
                  })}
                </View>
              )}

              {/* Connector between events (not after the last) */}
              {!isLast && (
                <TimelineConnector
                  durationMins={event.durationMins}
                  staffName={event.staffName}
                  isLiveActive={false}
                />
              )}

              {/* Live "ongoing" connector after the current active event */}
              {isLast && isLiveConnector && (
                <TimelineConnector
                  durationMins={event.durationMins}
                  staffName={event.staffName}
                  isLiveActive={true}
                  liveElapsed={liveElapsed}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: 8,
    borderRadius: 0,
  },

  // ── Collapsed mode ──────────────────────────────────────────────────────
  breadcrumbRow: {
    flexDirection: 'column',
    gap: 4,
  },
  breadcrumb: {
    fontSize: 12,
    color: COLORS.textMuted,
    flexShrink: 1,
  },
  breadcrumbPast: {
    color: COLORS.textMuted,
    fontWeight: '400',
  },
  breadcrumbCurrent: {
    color: COLORS.accent,
    fontWeight: '600',
  },

  // ── Toggle label ────────────────────────────────────────────────────────
  toggleRow: {
    marginBottom: 10,
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.sky,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Expanded timeline ───────────────────────────────────────────────────
  timelineBody: {
    paddingLeft: 0,
  },

  // Event row
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  dotContainer: {
    width: 20,
    alignItems: 'center',
    paddingTop: 2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5, // circles are OK per CaseDayCard precedent (line 421)
  },
  terminalIcon: {
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
  eventMiddle: {
    flex: 1,
    paddingHorizontal: 6,
  },
  eventLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
    lineHeight: 18,
  },
  eventLabelCorrection: {
    fontStyle: 'italic',
    color: COLORS.warning,
  },
  // Notification events: sky-blue label to match the static blue dot.
  eventLabelNotification: {
    color: COLORS.sky,
  },
  signedByText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  eventTime: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'right',
    paddingTop: 2,
    minWidth: 60,
  },

  // Per-service sub-items nested under "With the vet" node
  serviceSubItems: {
    paddingLeft: 26,
    marginBottom: 4,
  },
  serviceSubItem: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 2,
    fontWeight: '600',
  },

  // Connector
  connectorRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 2,
    minHeight: 22,
  },
  connectorLeft: {
    width: 20,
    alignItems: 'center',
  },
  connectorLine: {
    width: 1,
    flex: 1,
    backgroundColor: COLORS.borderLight,
  },
  connectorMiddle: {
    flex: 1,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  connectorText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
});

export default VisitTimeline;
