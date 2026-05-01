// SuperCard — live status hero card pinned above the appointment list whenever
// the patient has an active in-clinic appointment (arrived, in-consult, on-hold,
// dispensing, billing, confined).
//
// Placement: rendered as a sibling ABOVE the tab row in ClientAppointments so it
// remains visible while the user switches between Upcoming / History tabs.
//
// If `appointment` is null/undefined this component renders nothing — the caller
// passes unconditionally and SuperCard decides whether to paint.

import { useEffect, useRef, useState } from "react";
import { Animated, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { COLORS, SHADOW } from '../theme/mobileTokens';
import { getClientStatusColor, getClientStatusIcon, getClientStatusLabel } from "../utils/statusLabels";
import { formatFirestoreTime } from '../utils/helpers';
import { buildVisitTimeline } from '../utils/buildVisitTimeline';
import VisitTimeline from './VisitTimeline';
import WaitTimeMetrics from './WaitTimeMetrics';

const SPECIES_EMOJI = {
  Dog: '🐶',
  Canine: '🐶',
  Cat: '🐱',
  Feline: '🐱',
};

const getSpeciesEmoji = (species) => SPECIES_EMOJI[species] || '🐾';

const handleDirections = async (address) => {
  const target = address || 'Starbarks Veterinary Clinic, Santa Barbara, Pangasinan';
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`;
  try {
    await Linking.openURL(url);
  } catch (error) {
    console.error('[SuperCard.handleDirections]:', error.message);
  }
};

/**
 * @param {{ appointment: object, clinicPhone: string, clinicAddress: string, queueAhead: number|null }} props
 * - `clinicPhone` — read from `clinic_settings/general.clinicPhone` by the parent.
 *   Falls back to a generic empty string; the Call button is only useful when
 *   the clinic has configured a real number.
 * - `clinicAddress` — read from `clinic_settings/general.clinicAddress` by the parent.
 *   Falls back to the correct Pangasinan address inside handleDirections.
 * - `queueAhead` — count of arrived appointments ahead of this one; null hides the row.
 */
export default function SuperCard({ appointment, clinicPhone = '', clinicAddress = '', queueAhead = null, avgWaitMins = null }) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  const [timelineCollapsed, setTimelineCollapsed] = useState(true);
  // Default expanded so first-time users see the full card immediately.
  const [superCardExpanded, setSuperCardExpanded] = useState(true);

  useEffect(() => {
    if (!appointment) return;

    pulseAnim.setValue(0.4); // Reset to initial opacity on appointment change
    setTimelineCollapsed(true); // Reset timeline collapse when appointment changes
    setSuperCardExpanded(true); // Reset card expand state on appointment change

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => loop.stop();
  }, [appointment?.id]);

  if (!appointment) return null;

  // Derive timeline events from the appointment's pulse history.
  // An empty array (legacy appointments with no clinicalPulse) causes the
  // timeline section to be gated out entirely — no UI noise for old records.
  const timelineEvents = appointment.clinicalPulse
    ? buildVisitTimeline(appointment.clinicalPulse, {
        isActive: true,
        assignedVet: appointment.assignedVet,
        signedOffAt: null,
      })
    : [];

  const statusColors = getClientStatusColor(appointment.status);
  const statusIcon = getClientStatusIcon(appointment.status);
  const statusLabel = getClientStatusLabel(appointment.status);
  const speciesEmoji = getSpeciesEmoji(appointment.petSpecies);

  const ticketLabel =
    appointment.ticketPrefix != null && appointment.queueNumber != null
      ? `${appointment.ticketPrefix}-${String(appointment.queueNumber).padStart(3, '0')}`
      : null;

  const hasAssignedVet =
    appointment.assignedVet &&
    appointment.assignedVet !== 'Unassigned';

  const startedTime =
    formatFirestoreTime(appointment.timeStarted) ||
    formatFirestoreTime(appointment.timeArrived);

  return (
    <View style={styles.shadowContainer}>
      <View style={SHADOW.card} />
      <View style={[styles.wrapper, { borderLeftColor: statusColors.color }]}>
      {/* ── MINI HEADER — always visible, tappable to expand/collapse ── */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setSuperCardExpanded(prev => !prev)}
        style={styles.superCardMiniHeader}
      >
        {/* Left: pet avatar */}
        <View style={[styles.avatar, { borderColor: statusColors.color }]}>
          <Text style={styles.avatarEmoji}>{speciesEmoji}</Text>
        </View>

        {/* Centre: pet name + service type */}
        <View style={styles.miniHeaderInfo}>
          <Text style={styles.petName} numberOfLines={1}>
            {appointment.petName || 'Your Pet'}
          </Text>
          {(appointment.serviceType || appointment.primaryService) ? (
            <Text style={styles.serviceType} numberOfLines={1}>
              {appointment.serviceType || appointment.primaryService}
            </Text>
          ) : null}
        </View>

        {/* Right: status pill + ticket + chevron */}
        <View style={styles.miniHeaderRight}>
          <View style={styles.statusRow}>
            <Animated.View style={[styles.pulseDot, { backgroundColor: statusColors.color, opacity: pulseAnim }]} />
            <View style={[styles.statusPillWrap, { backgroundColor: statusColors.backgroundColor }]}>
              <Text style={[styles.statusPillText, { color: statusColors.color }]}>
                {statusIcon} {statusLabel.toUpperCase()}
              </Text>
            </View>
          </View>
          {ticketLabel ? (
            <Text style={styles.ticketMini}>🎫 {ticketLabel}</Text>
          ) : null}
        </View>

        <MaterialIcons
          name={superCardExpanded ? 'expand-less' : 'expand-more'}
          size={22}
          color={COLORS.accentLight}
          style={styles.chevron}
        />
      </TouchableOpacity>

      {/* ── COLLAPSIBLE BODY — hidden when user collapses the card ── */}
      {superCardExpanded && (
        <View style={styles.superCardBody}>
          {/* Assigned vet */}
          {hasAssignedVet ? (
            <Text style={styles.infoLine}>👨‍⚕️ {appointment.assignedVet}</Text>
          ) : null}

          {/* Time started / arrived */}
          {startedTime ? (
            <Text style={styles.infoLine}>🕐 Started at {startedTime}</Text>
          ) : null}

          {/* Queue-ahead count (arrived status only) */}
          {queueAhead != null && (
            <Text style={styles.infoLine}>
              {queueAhead === 0
                ? "You're next in line!"
                : `${queueAhead} pet${queueAhead !== 1 ? 's' : ''} ahead of you`}
            </Text>
          )}

          {/* Live wait/consult metrics */}
          <WaitTimeMetrics
            appointment={appointment}
            isActive={true}
            avgWaitMins={avgWaitMins}
          />

          {/* Visit timeline (only when pulse data exists) */}
          {timelineEvents.length > 0 && (
            <View style={styles.timelineSection}>
              <VisitTimeline
                events={timelineEvents}
                isActive={true}
                collapsed={timelineCollapsed}
                onToggle={() => setTimelineCollapsed(prev => !prev)}
                assignedVet={appointment.assignedVet}
              />
            </View>
          )}

          {/* CTAs */}
          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={[styles.ctaBtn, !clinicPhone && styles.ctaBtnDisabled]}
              onPress={async () => {
                if (!clinicPhone) return;
                try {
                  await Linking.openURL(`tel:${clinicPhone}`);
                } catch (error) {
                  console.error('[SuperCard.handleCallClinic]:', error.message);
                }
              }}
              disabled={!clinicPhone}
            >
              <Text style={styles.ctaBtnText}>📞 Call Clinic</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ctaBtn, styles.ctaBtnSecondary]}
              onPress={() => handleDirections(clinicAddress)}
            >
              <Text style={[styles.ctaBtnText, styles.ctaBtnSecondaryText]}>🗺️ Directions</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  wrapper: {
    backgroundColor: COLORS.white,
    borderRadius: 0,
    borderLeftWidth: 4,
    overflow: 'hidden',
    zIndex: 1,
  },

  // ── Mini header — always rendered, tappable ──────────────────────
  superCardMiniHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },

  miniHeaderInfo: {
    flex: 1,
  },

  miniHeaderRight: {
    alignItems: 'flex-end',
  },

  chevron: {
    marginLeft: 2,
  },

  ticketMini: {
    fontSize: 11,
    color: COLORS.accentLight,
    marginTop: 3,
  },

  // ── Collapsible body — hidden when collapsed ─────────────────────
  superCardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: 10,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 0,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cream,
    flexShrink: 0,
  },
  avatarEmoji: { fontSize: 22 },
  petName: { fontSize: 15, fontWeight: 'bold', color: COLORS.accent },
  serviceType: {
    fontSize: 11,
    color: COLORS.accentLight,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 1,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 0,
    marginRight: 6,
  },
  statusPillWrap: {
    borderRadius: 0,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },

  infoLine: {
    fontSize: 13,
    color: COLORS.accent,
    marginBottom: 5,
    paddingLeft: 4,
  },

  timelineSection: {
    marginTop: 8,
    marginBottom: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: 8,
  },

  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  ctaBtn: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 0,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ctaBtnText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 13,
  },
  ctaBtnSecondary: {
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
  },
  ctaBtnSecondaryText: {
    color: COLORS.accent,
  },
  ctaBtnDisabled: {
    backgroundColor: COLORS.muted,
  },
});
