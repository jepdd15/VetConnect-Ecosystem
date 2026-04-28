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
import { COLORS } from '../theme/mobileTokens';
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

  useEffect(() => {
    if (!appointment) return;

    pulseAnim.setValue(0.4); // Reset to initial opacity on appointment change
    setTimelineCollapsed(true); // Reset timeline collapse when appointment changes

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
    <View style={[styles.wrapper, { borderLeftColor: statusColors.color }]}>
      {/* Row 1 — Pet avatar + name + species */}
      <View style={styles.petRow}>
        <View style={[styles.avatar, { borderColor: statusColors.color }]}>
          <Text style={styles.avatarEmoji}>{speciesEmoji}</Text>
        </View>
        <View style={styles.petInfo}>
          <Text style={styles.petName}>{appointment.petName || 'Your Pet'}</Text>
          {appointment.petSpecies ? (
            <Text style={styles.petBreed}>{appointment.petSpecies}</Text>
          ) : null}
          {(appointment.serviceType || appointment.primaryService) ? (
            <Text style={styles.serviceType}>
              {appointment.serviceType || appointment.primaryService}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Row 2 — Status pill with pulsing dot */}
      <View style={styles.statusRow}>
        <Animated.View style={[styles.pulseDot, { backgroundColor: statusColors.color, opacity: pulseAnim }]} />
        <Text style={[styles.statusPill, { color: statusColors.color, backgroundColor: statusColors.backgroundColor }]}>
          {statusIcon} {statusLabel.toUpperCase()}
        </Text>
      </View>

      {/* Row 3 — Ticket number */}
      {ticketLabel ? (
        <Text style={styles.infoLine}>🎫 Ticket: {ticketLabel}</Text>
      ) : null}

      {/* Row 4 — Assigned vet */}
      {hasAssignedVet ? (
        <Text style={styles.infoLine}>👨‍⚕️ {appointment.assignedVet}</Text>
      ) : null}

      {/* Row 5 — Time started / arrived */}
      {startedTime ? (
        <Text style={styles.infoLine}>🕐 Started at {startedTime}</Text>
      ) : null}

      {/* Row 6 — Queue-ahead (only shown when patient has arrived status) */}
      {queueAhead != null && (
        <Text style={styles.infoLine}>
          {queueAhead === 0 ? "You're next in line!" : `${queueAhead} pet${queueAhead !== 1 ? 's' : ''} ahead of you`}
        </Text>
      )}

      {/* Row 6.5 — Live wait/consult metrics */}
      <WaitTimeMetrics
        appointment={appointment}
        isActive={true}
        avgWaitMins={avgWaitMins}
      />

      {/* Row 7 — Visit timeline (collapsed by default; only shown when pulse data exists) */}
      {timelineEvents.length > 0 && (
        <View style={styles.timelineSection}>
          <VisitTimeline
            events={timelineEvents}
            isActive={true}
            collapsed={timelineCollapsed}
            onToggle={() => setTimelineCollapsed((prev) => !prev)}
            assignedVet={appointment.assignedVet}
          />
        </View>
      )}

      {/* Row 8 — CTAs */}
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
        <TouchableOpacity style={[styles.ctaBtn, styles.ctaBtnSecondary]} onPress={() => handleDirections(clinicAddress)}>
          <Text style={[styles.ctaBtnText, styles.ctaBtnSecondaryText]}>🗺️ Directions</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderLeftWidth: 4,
    padding: 16,
    marginBottom: 20,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
  },

  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cream,
    marginRight: 12,
  },
  avatarEmoji: { fontSize: 26 },
  petInfo: { flex: 1 },
  petName: { fontSize: 16, fontWeight: 'bold', color: COLORS.accent },
  petBreed: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  serviceType: {
    fontSize: 12,
    color: COLORS.accentLight,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusPill: {
    fontSize: 11,
    fontWeight: 'bold',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    overflow: 'hidden',
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
    borderRadius: 8,
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
