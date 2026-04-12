// SuperCard — live status hero card pinned above the appointment list whenever
// the patient has an active in-clinic appointment (arrived, in-consult, on-hold,
// dispensing, billing, confined).
//
// Placement: rendered as a sibling ABOVE the tab row in ClientAppointments so it
// remains visible while the user switches between Upcoming / History tabs.
//
// If `appointment` is null/undefined this component renders nothing — the caller
// passes unconditionally and SuperCard decides whether to paint.

import { useEffect, useRef } from "react";
import { Animated, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { getClientStatusColor, getClientStatusIcon, getClientStatusLabel } from "../utils/statusLabels";

// TODO: read clinicPhone and clinicAddress from clinic_settings/general once those
// fields are added to Firestore (see plan §2.5). For now they are hardcoded here.
const CLINIC_PHONE = '+639171234567';
const CLINIC_ADDRESS = 'Starbarks Vet Clinic, Metro Manila, Philippines';

const SPECIES_EMOJI = {
  Dog: '🐶',
  Canine: '🐶',
  Cat: '🐱',
  Feline: '🐱',
};

const getSpeciesEmoji = (species) => SPECIES_EMOJI[species] || '🐾';

const formatTimestamp = (ts) => {
  if (!ts) return null;
  try {
    return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
};

const handleCallClinic = async () => {
  try {
    await Linking.openURL(`tel:${CLINIC_PHONE}`);
  } catch (error) {
    console.error('[SuperCard.handleCallClinic]:', error.message);
  }
};

const handleDirections = async () => {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CLINIC_ADDRESS)}`;
  try {
    await Linking.openURL(url);
  } catch (error) {
    console.error('[SuperCard.handleDirections]:', error.message);
  }
};

export default function SuperCard({ appointment }) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!appointment) return;

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
    formatTimestamp(appointment.timeStarted) ||
    formatTimestamp(appointment.timeArrived);

  return (
    <View style={[styles.wrapper, { borderLeftColor: statusColors.color }]}>
      {/* Row 1 — Pet avatar + name + species */}
      <View style={styles.petRow}>
        <View style={[styles.avatar, { borderColor: statusColors.color }]}>
          <Text style={styles.avatarEmoji}>{speciesEmoji}</Text>
        </View>
        <View style={styles.petInfo}>
          <Text style={styles.petName}>{appointment.petName}</Text>
          {appointment.petSpecies ? (
            <Text style={styles.petBreed}>{appointment.petSpecies}</Text>
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

      {/* Row 6 — Queue-ahead is hidden this pass (client-scope listener underestimates).
          TODO: queue-ahead needs clinic-wide feed before this row is meaningful. */}

      {/* Row 7 — CTAs */}
      <View style={styles.ctaRow}>
        <TouchableOpacity style={styles.ctaBtn} onPress={handleCallClinic}>
          <Text style={styles.ctaBtnText}>📞 Call Clinic</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctaBtn, styles.ctaBtnSecondary]} onPress={handleDirections}>
          <Text style={[styles.ctaBtnText, styles.ctaBtnSecondaryText]}>🗺️ Directions</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'white',
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
    backgroundColor: '#FFF8E1',
    marginRight: 12,
  },
  avatarEmoji: { fontSize: 26 },
  petInfo: { flex: 1 },
  petName: { fontSize: 16, fontWeight: 'bold', color: '#5D4037' },
  petBreed: { fontSize: 13, color: '#888', marginTop: 2 },

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
    color: '#5D4037',
    marginBottom: 5,
    paddingLeft: 4,
  },

  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  ctaBtn: {
    flex: 1,
    backgroundColor: '#5D4037',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ctaBtnText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 13,
  },
  ctaBtnSecondary: {
    backgroundColor: 'white',
    borderWidth: 1.5,
    borderColor: '#5D4037',
  },
  ctaBtnSecondaryText: {
    color: '#5D4037',
  },
});
