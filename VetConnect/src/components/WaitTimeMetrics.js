/**
 * WaitTimeMetrics — compact duration metrics row for appointment cards.
 *
 * Renders in one of two modes:
 *
 *   Completed mode (isActive === false):
 *     Reads frozen shiftQueue / shiftConsult / shiftConfined from forensicSeal.raw
 *     and renders a single line: "Wait: Xm · Consult: Yh Zm · Total: Ah Bm"
 *     Returns null when forensicSeal.raw is absent (graceful legacy degradation).
 *
 *   Active mode (isActive === true):
 *     Parses clinicalPulse to extract key stage timestamps, then shows a live
 *     elapsed ticker that updates every 60 seconds. Sub-mode display varies by
 *     appointment.status (arrived, in-consult, on-hold, dispensing, billing,
 *     confined). Returns null when arrivedAt cannot be resolved.
 *
 * Design: matches VisitTimeline's 12px/muted style and live-tick pattern.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../theme/mobileTokens';
import { formatDurationMins } from '../utils/buildVisitTimeline';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely converts a Firestore Timestamp or raw value to a JS Date.
 * Mirrors the same helper in buildVisitTimeline.js — kept local here so
 * WaitTimeMetrics has no runtime dependency on that module's internals.
 *
 * @param {*} ts - Firestore Timestamp, ISO string, or number.
 * @returns {Date}
 */
const resolveDate = (ts) => {
  if (!ts) return new Date(0);
  if (typeof ts.toDate === 'function') return ts.toDate();
  const parsed = new Date(ts);
  return isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

/**
 * Computes elapsed minutes from a reference Date to now.
 * Clamped to zero to handle minor clock skew.
 *
 * @param {Date} fromDate
 * @returns {number}
 */
const elapsedMins = (fromDate) =>
  Math.max(0, Math.round((Date.now() - fromDate.getTime()) / 60000));

/**
 * Finds the first STATUS_CHANGE event in the pulse array whose toStatus
 * matches the target.
 *
 * @param {Array} pulse
 * @param {string} toStatus
 * @returns {object|null}
 */
const findFirstStatusEvent = (pulse, toStatus) =>
  pulse.find(
    (e) => (e.type || '').toUpperCase() === 'STATUS_CHANGE' &&
           (e.toStatus || '').toLowerCase() === toStatus
  ) ?? null;

/**
 * Finds the last STATUS_CHANGE event in the pulse array whose toStatus
 * matches the target.
 *
 * @param {Array} pulse
 * @param {string} toStatus
 * @returns {object|null}
 */
const findLastStatusEvent = (pulse, toStatus) => {
  const matches = pulse.filter(
    (e) => (e.type || '').toUpperCase() === 'STATUS_CHANGE' &&
           (e.toStatus || '').toLowerCase() === toStatus
  );
  return matches.length > 0 ? matches[matches.length - 1] : null;
};

/**
 * Finds the last STATUS_CHANGE event of any toStatus — used to determine
 * when the current stage began.
 *
 * @param {Array} pulse
 * @returns {object|null}
 */
const findLastStatusChange = (pulse) => {
  const changes = pulse.filter(
    (e) => (e.type || '').toUpperCase() === 'STATUS_CHANGE'
  );
  return changes.length > 0 ? changes[changes.length - 1] : null;
};

// ─── Completed mode ───────────────────────────────────────────────────────────

/**
 * Renders frozen forensicSeal metrics for a completed visit.
 * "Wait: Xm · Consult: Yh Zm · Total: Ah Bm"
 */
const CompletedMetrics = ({ appointment }) => {
  const raw = appointment.forensicSeal?.raw;
  if (!raw) return null;

  const waitMins     = raw.shiftQueue    ?? null;
  const consultMins  = raw.shiftConsult  ?? null;
  const confinedMins = raw.shiftConfined ?? null;
  const totalMins    = (waitMins ?? 0) + (consultMins ?? 0) + (confinedMins ?? 0);

  const segments = [];
  if (waitMins != null)    segments.push(`Wait: ${formatDurationMins(waitMins) ?? '0m'}`);
  if (consultMins != null) segments.push(`Consult: ${formatDurationMins(consultMins) ?? '0m'}`);
  segments.push(`Total: ${formatDurationMins(totalMins) ?? '0m'}`);

  if (segments.length === 0) return null;

  return (
    <View style={styles.metricsRow}>
      <Text style={styles.metricsText}>
        {segments.join(' · ')}
      </Text>
    </View>
  );
};

// ─── Active mode ──────────────────────────────────────────────────────────────

/**
 * Renders a live elapsed ticker for an in-clinic appointment.
 * Ticks every 60 seconds via setInterval; cleaned up on unmount.
 */
const ActiveMetrics = ({ appointment, avgWaitMins }) => {
  const pulse = appointment.clinicalPulse;
  const arrivedEvent = pulse?.length ? findFirstStatusEvent(pulse, 'arrived') : null;

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!arrivedEvent) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, [!!arrivedEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  void tick;

  if (!arrivedEvent) return null;

  const status = (appointment.status || '').toLowerCase();
  const consultEvent    = findFirstStatusEvent(pulse, 'in-consult');
  const lastChangeEvent = findLastStatusChange(pulse);

  const arrivedAt  = resolveDate(arrivedEvent.timestamp);
  const totalElapsed = elapsedMins(arrivedAt);
  const totalStr   = formatDurationMins(totalElapsed) ?? '0m';

  // ── arrived ────────────────────────────────────────────────────────────────
  if (status === 'arrived') {
    const elapsed    = elapsedMins(arrivedAt);
    const elapsedStr = `${elapsed}m`;
    const isOverAvg  = avgWaitMins != null && elapsed > avgWaitMins;

    return (
      <View style={styles.metricsRow}>
        <Text style={styles.metricsText}>
          {'Waiting: '}
          <Text style={isOverAvg ? styles.metricsHighlight : undefined}>
            {elapsedStr}
          </Text>
          {avgWaitMins != null ? (
            <Text>{` (your avg: ${avgWaitMins}m)`}</Text>
          ) : null}
        </Text>
      </View>
    );
  }

  // ── in-consult ─────────────────────────────────────────────────────────────
  if (status === 'in-consult') {
    if (!consultEvent) {
      return (
        <View style={styles.metricsRow}>
          <Text style={styles.metricsText}>
            {`In consult · Total: ${totalStr}`}
          </Text>
        </View>
      );
    }
    const consultAt      = resolveDate(consultEvent.timestamp);
    const consultElapsed = elapsedMins(consultAt);
    const consultStr     = formatDurationMins(consultElapsed) ?? '0m';

    return (
      <View style={styles.metricsRow}>
        <Text style={styles.metricsText}>
          {`In consult: ${consultStr}`}
          <Text style={styles.metricsSeparator}>{' · '}</Text>
          {`Total: ${totalStr}`}
        </Text>
      </View>
    );
  }

  // ── on-hold ────────────────────────────────────────────────────────────────
  if (status === 'on-hold') {
    const holdEvent   = findLastStatusEvent(pulse, 'on-hold');
    const holdAt      = holdEvent ? resolveDate(holdEvent.timestamp) : arrivedAt;
    const holdElapsed = elapsedMins(holdAt);
    const holdStr     = formatDurationMins(holdElapsed) ?? '0m';

    return (
      <View style={styles.metricsRow}>
        <Text style={styles.metricsText}>
          {'Paused: '}
          <Text style={styles.metricsHighlight}>{holdStr}</Text>
          <Text style={styles.metricsSeparator}>{' · '}</Text>
          {`Total: ${totalStr}`}
        </Text>
      </View>
    );
  }

  // ── dispensing / billing / confined ───────────────────────────────────────
  const STAGE_LABELS = {
    dispensing: 'At pharmacy',
    billing:    'Checkout',
    confined:   'Admitted',
  };

  if (STAGE_LABELS[status]) {
    const stageAt      = lastChangeEvent ? resolveDate(lastChangeEvent.timestamp) : arrivedAt;
    const stageElapsed = elapsedMins(stageAt);
    const stageStr     = formatDurationMins(stageElapsed) ?? '0m';
    const label        = STAGE_LABELS[status];

    return (
      <View style={styles.metricsRow}>
        <Text style={styles.metricsText}>
          {`${label}: ${stageStr}`}
          <Text style={styles.metricsSeparator}>{' · '}</Text>
          {`Total: ${totalStr}`}
        </Text>
      </View>
    );
  }

  return null;
};

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * @param {{
 *   appointment: object,
 *   isActive:    boolean,
 *   avgWaitMins: number|null,
 * }} props
 */
const WaitTimeMetrics = ({ appointment, isActive, avgWaitMins = null }) => {
  if (!appointment) return null;

  if (!isActive) {
    return <CompletedMetrics appointment={appointment} />;
  }

  return <ActiveMetrics appointment={appointment} avgWaitMins={avgWaitMins} />;
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 6,
    gap: 2,
  },
  metricsText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 0.3,
  },
  metricsSeparator: {
    fontSize: 12,
    color: COLORS.borderLight,
    marginHorizontal: 4,
  },
  metricsHighlight: {
    color: COLORS.warning,
  },
});

export default WaitTimeMetrics;
