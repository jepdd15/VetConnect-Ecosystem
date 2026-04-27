// Client self-check-in via static clinic QR code.
// State machine: SCANNING -> CHECKING_GPS -> GPS_WARN -> PROCESSING -> SUCCESS | ERROR
// Locked decisions:
//   - Static QR only (prefix check, no token validation)
//   - GPS geofence is graceful: permission-denied or GPS failure still allows check-in
//   - Ticket prefix from booking origin, not check-in method
//   - Multi-pet visit groups share one queue number (Option C)

import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  Timestamp,
  where,
} from 'firebase/firestore';
import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../../firebaseConfig';
import { useClinicContact } from '../hooks/useClinicContact';
import { COLORS, FONTS, SPACING } from '../theme/mobileTokens';
import { getTicketPrefix } from '../utils/getTicketPrefix';
import { getLocalDateStr } from '../utils/helpers';

// The canonical QR value printed on the clinic poster.
const CLINIC_QR_VALUE = 'STARBARKS-CHECKIN-starbarks-vetconnect-f6443';

// GPS acquisition timeout. Resolves to null so the geofence falls back gracefully.
const GPS_TIMEOUT_MS = 10000;

// Screen state machine values.
const SCREEN_STATE = {
  SCANNING: 'SCANNING',
  CHECKING_GPS: 'CHECKING_GPS',
  GPS_WARN: 'GPS_WARN',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
};

// -----------------------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------------------

/**
 * Haversine distance in meters between two GPS coordinates.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} distance in meters
 */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * One-shot GPS geofence check.
 * Gracefully degrades: if permission is denied or GPS fails, returns ok:true with fallback:true.
 * The clinic's physical presence requirement is enforced by the QR code itself (static, on-site poster).
 *
 * @param {number} clinicLat
 * @param {number} clinicLng
 * @param {number} radiusM
 * @returns {Promise<{ ok: boolean, fallback: boolean, reason?: string, distance?: number }>}
 */
async function checkGeofence(clinicLat, clinicLng, radiusM) {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      return { ok: true, fallback: true, reason: 'Location permission not granted' };
    }

    const loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise((resolve) => setTimeout(() => resolve(null), GPS_TIMEOUT_MS)),
    ]);

    if (!loc) {
      return { ok: true, fallback: true, reason: 'Location check timed out' };
    }

    const distance = haversineMeters(
      loc.coords.latitude,
      loc.coords.longitude,
      clinicLat,
      clinicLng,
    );

    if (distance <= radiusM) {
      return { ok: true, fallback: false, distance };
    }

    return {
      ok: false,
      fallback: false,
      distance,
      reason: `You appear to be ${Math.round(distance)}m from the clinic (limit: ${radiusM}m).`,
    };
  } catch {
    // GPS hardware failure — graceful fallback per locked decision.
    return { ok: true, fallback: true, reason: 'Could not determine your location' };
  }
}

/**
 * Atomic Firestore transaction that transitions all confirmed appointments for
 * the current user (today) to 'arrived', issuing queue numbers.
 *
 * Visit groups (same visitGroupId) share one queue number.
 * Ungrouped appointments each get their own number.
 *
 * @returns {Promise<Array>} resolved appointment data (with updated queueNumber, ticketPrefix)
 */
async function batchArrive() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('NOT_AUTHENTICATED');

  const todayStr = getLocalDateStr();

  // Fetch all confirmed appointments for this owner today.
  const q = query(
    collection(db, 'appointments'),
    where('ownerId', '==', uid),
    where('status', '==', 'confirmed'),
    where('scheduledDateStr', '==', todayStr),
  );
  const snap = await getDocs(q);

  if (snap.empty) throw new Error('NO_APPOINTMENTS');

  const appts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Separate into visit groups (shared ticket) and ungrouped (individual tickets).
  const groups = new Map();   // visitGroupId -> appt[]
  const ungrouped = [];

  appts.forEach((a) => {
    if (a.visitGroupId) {
      if (!groups.has(a.visitGroupId)) groups.set(a.visitGroupId, []);
      groups.get(a.visitGroupId).push(a);
    } else {
      ungrouped.push(a);
    }
  });

  let arrivedResults = [];

  await runTransaction(db, async (transaction) => {
    const queueRef = doc(db, 'queue', 'daily_queue');
    const queueDoc = await transaction.get(queueRef);
    let lastNum = queueDoc.exists() ? (queueDoc.data().lastNumberIssued || 0) : 0;
    const localResults = [];

    const arriveGroup = (apptList) => {
      lastNum += 1;
      const sharedNum = lastNum;

      apptList.forEach((a) => {
        const prefix = getTicketPrefix(a);
        const apptRef = doc(db, 'appointments', a.id);

        transaction.update(apptRef, {
          status: 'arrived',
          queueNumber: sharedNum,
          ticketPrefix: prefix,
          timeArrived: Timestamp.now(),
          arrivedBy: 'Self Check-In',
          selfCheckedIn: true,
          clinicalPulse: arrayUnion({
            eventId: `pulse_STATUS_CHANGE_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`,
            type: 'STATUS_CHANGE',
            fromStatus: 'confirmed',
            toStatus: 'arrived',
            timestamp: Timestamp.now(),
            staffId: auth.currentUser.uid,
            staffName: 'Self Check-In',
            note: 'Client self-check-in via clinic QR',
          }),
        });

        if (a.petId) {
          transaction.update(doc(db, 'pets', a.petId), {
            lastVisit: Timestamp.now(),
          });
        }

        localResults.push({
          id: a.id,
          petName: a.petName || 'Your Pet',
          queueNumber: sharedNum,
          ticketPrefix: prefix,
        });
      });
    };

    for (const [, groupAppts] of groups) {
      arriveGroup(groupAppts);
    }

    ungrouped.forEach((a) => arriveGroup([a]));

    transaction.update(queueRef, { lastNumberIssued: lastNum });
    arrivedResults = localResults;
  });

  return arrivedResults;
}

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------

export default function SelfCheckInScreen({ navigation }) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [screenState, setScreenState] = useState(SCREEN_STATE.SCANNING);
  const [scanned, setScanned] = useState(false);
  const [gpsWarningReason, setGpsWarningReason] = useState('');
  const [arrivedAppts, setArrivedAppts] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  const { clinicLat, clinicLng, geofenceRadiusM } = useClinicContact();

  // -----------------------------------------------------------------------
  // QR scan handler
  // -----------------------------------------------------------------------
  const handleBarCodeScanned = async ({ data }) => {
    if (scanned) return;
    setScanned(true);

    // Validate QR prefix.
    if (data !== CLINIC_QR_VALUE) {
      setErrorMessage(
        'This QR code is not a Starbarks check-in code.\nPlease scan the poster displayed in the clinic lobby.',
      );
      setScreenState(SCREEN_STATE.ERROR);
      return;
    }

    // GPS geofence check.
    setScreenState(SCREEN_STATE.CHECKING_GPS);
    const geo = await checkGeofence(clinicLat, clinicLng, geofenceRadiusM);

    if (geo.fallback) {
      // Permission denied or GPS failed — show informational warning, allow check-in.
      setGpsWarningReason(geo.reason);
      setScreenState(SCREEN_STATE.GPS_WARN);
      return;
    }

    if (!geo.ok) {
      // Outside geofence — show distance warning with fallback option.
      setGpsWarningReason(geo.reason);
      setScreenState(SCREEN_STATE.GPS_WARN);
      return;
    }

    // Within geofence — proceed directly.
    await runCheckIn();
  };

  // -----------------------------------------------------------------------
  // Firestore transaction
  // -----------------------------------------------------------------------
  const runCheckIn = async () => {
    setScreenState(SCREEN_STATE.PROCESSING);
    try {
      const results = await batchArrive();
      setArrivedAppts(results);
      setScreenState(SCREEN_STATE.SUCCESS);
    } catch (err) {
      const msg = err.message === 'NO_APPOINTMENTS'
        ? 'No confirmed appointments found for today.\n\nMake sure your booking is confirmed before checking in.'
        : err.message === 'NOT_AUTHENTICATED'
        ? 'You must be logged in to check in.'
        : 'An error occurred during check-in. Please try again or ask staff for assistance.';
      setErrorMessage(msg);
      setScreenState(SCREEN_STATE.ERROR);
    }
  };

  const handleRetry = () => {
    setScanned(false);
    setErrorMessage('');
    setGpsWarningReason('');
    setScreenState(SCREEN_STATE.SCANNING);
  };

  // -----------------------------------------------------------------------
  // Camera permission gates
  // -----------------------------------------------------------------------
  if (!cameraPermission) {
    return <View style={styles.container} />;
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionWrapper}>
          <View style={styles.shadow} />
          <View style={styles.permissionBox}>
            <Text style={styles.permissionIcon}>📷</Text>
            <Text style={styles.permissionTitle}>CAMERA NEEDED</Text>
            <Text style={styles.permissionMsg}>
              Allow camera access to scan the clinic check-in QR code.
            </Text>
            <View style={styles.btnWrapper}>
              <View style={styles.btnShadow} />
              <TouchableOpacity style={styles.btn} onPress={requestCameraPermission}>
                <Text style={styles.btnText}>GRANT PERMISSION</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // -----------------------------------------------------------------------
  // SUCCESS state
  // -----------------------------------------------------------------------
  if (screenState === SCREEN_STATE.SUCCESS) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.successWrapper}>
          <View style={[styles.shadow, { backgroundColor: COLORS.success }]} />
          <View style={styles.successBox}>
            <Text style={styles.successIcon}>🎟️</Text>
            <Text style={styles.successTitle}>CHECK-IN COMPLETE</Text>
            <Text style={styles.successSub}>
              {arrivedAppts.length === 1 ? 'Your ticket has been issued.' : 'Tickets issued for your visit.'}
            </Text>

            {arrivedAppts.map((a, i) => (
              <View key={a.id || i} style={styles.petRow}>
                <View style={styles.petRowLeft}>
                  <Text style={styles.petName}>{a.petName}</Text>
                </View>
                <View style={styles.ticketBadge}>
                  <Text style={styles.ticketText}>
                    {a.ticketPrefix}-{String(a.queueNumber).padStart(3, '0')}
                  </Text>
                </View>
              </View>
            ))}

            <Text style={styles.successInstruction}>
              Please take a seat in the lobby. Staff will call your ticket when ready.
            </Text>

            <View style={styles.btnWrapper}>
              <View style={styles.btnShadow} />
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: COLORS.sky }]}
                onPress={() => navigation.navigate('QueueScreen')}
              >
                <Text style={styles.btnText}>VIEW LIVE QUEUE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  // -----------------------------------------------------------------------
  // ERROR state
  // -----------------------------------------------------------------------
  if (screenState === SCREEN_STATE.ERROR) {
    return (
      <View style={styles.container}>
        <View style={styles.messageWrapper}>
          <View style={[styles.shadow, { backgroundColor: COLORS.danger }]} />
          <View style={[styles.messageBox, { borderColor: COLORS.danger }]}>
            <Text style={styles.messageIcon}>❌</Text>
            <Text style={[styles.messageTitle, { color: COLORS.danger }]}>CHECK-IN FAILED</Text>
            <Text style={styles.messageBody}>{errorMessage}</Text>
          </View>
        </View>
        <View style={styles.btnWrapper}>
          <View style={styles.btnShadow} />
          <TouchableOpacity style={styles.btn} onPress={handleRetry}>
            <Text style={styles.btnText}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // -----------------------------------------------------------------------
  // GPS_WARN state — outside geofence or permission denied, offer fallback
  // -----------------------------------------------------------------------
  if (screenState === SCREEN_STATE.GPS_WARN) {
    return (
      <View style={styles.container}>
        <View style={styles.messageWrapper}>
          <View style={[styles.shadow, { backgroundColor: '#E65100' }]} />
          <View style={[styles.messageBox, { borderColor: '#E65100' }]}>
            <Text style={styles.messageIcon}>📍</Text>
            <Text style={[styles.messageTitle, { color: '#E65100' }]}>LOCATION UNVERIFIED</Text>
            <Text style={styles.messageBody}>{gpsWarningReason}</Text>
            <Text style={styles.messageBodySm}>
              If you are physically at the clinic, you can still check in.
            </Text>
          </View>
        </View>

        <View style={styles.btnWrapper}>
          <View style={[styles.btnShadow, { backgroundColor: COLORS.success }]} />
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: COLORS.success, borderColor: COLORS.brand, opacity: screenState === SCREEN_STATE.PROCESSING ? 0.5 : 1 }]}
            onPress={runCheckIn}
            disabled={screenState === SCREEN_STATE.PROCESSING}
          >
            <Text style={styles.btnText}>CONTINUE CHECK-IN</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.cancelLink} onPress={handleRetry}>
          <Text style={styles.cancelLinkText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // -----------------------------------------------------------------------
  // CHECKING_GPS / PROCESSING states — loading overlay
  // -----------------------------------------------------------------------
  if (
    screenState === SCREEN_STATE.CHECKING_GPS ||
    screenState === SCREEN_STATE.PROCESSING
  ) {
    const label =
      screenState === SCREEN_STATE.CHECKING_GPS
        ? 'VERIFYING LOCATION...'
        : 'CHECKING YOU IN...';
    return (
      <View style={styles.container}>
        <View style={styles.loadingWrapper}>
          <View style={styles.shadow} />
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.sky} />
            <Text style={styles.loadingText}>{label}</Text>
          </View>
        </View>
      </View>
    );
  }

  // -----------------------------------------------------------------------
  // SCANNING state — camera active
  // -----------------------------------------------------------------------
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerBox}>
        <Text style={styles.title}>SCAN TO CHECK IN</Text>
        <Text style={styles.subtitle}>
          Point your camera at the clinic QR code displayed at the front desk.
        </Text>
      </View>

      {/* Camera preview */}
      <View style={styles.cameraWrapper}>
        <View style={[styles.shadow, { top: 6, left: 6 }]} />
        <View style={styles.cameraFrame}>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          />
          <View style={styles.overlay}>
            <View style={styles.scanTarget} />
          </View>
        </View>
      </View>

      {/* Instruction footer */}
      <View style={styles.instructionBox}>
        <Text style={styles.instructionText}>
          The QR code is displayed in the lobby. Staff can also show it to you.
        </Text>
      </View>
    </ScrollView>
  );
}

// -----------------------------------------------------------------------
// Styles
// -----------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: COLORS.cream,
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: SPACING.screenPadding,
  },

  // Header
  headerBox: {
    width: '100%',
    marginBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontFamily: FONTS.black,
    fontSize: 28,
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.accent,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Camera
  cameraWrapper: {
    width: 300,
    height: 300,
    position: 'relative',
    marginBottom: 30,
  },
  cameraFrame: {
    width: 300,
    height: 300,
    borderWidth: 3,
    borderColor: COLORS.brand,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanTarget: {
    width: 180,
    height: 180,
    borderWidth: 3,
    borderColor: COLORS.sky,
    backgroundColor: 'transparent',
  },

  // Instruction
  instructionBox: {
    width: '100%',
    padding: 16,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
  },
  instructionText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.accentLight,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Shared shadow layer (neubrutalism)
  shadow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: -3,
    bottom: -3,
    backgroundColor: COLORS.brand,
  },

  // Permission screen
  permissionWrapper: {
    width: '100%',
    position: 'relative',
    marginBottom: 32,
  },
  permissionBox: {
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.brand,
    padding: 28,
    alignItems: 'center',
  },
  permissionIcon: { fontSize: 48, marginBottom: 12 },
  permissionTitle: {
    fontFamily: FONTS.black,
    fontSize: 20,
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  permissionMsg: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.accent,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },

  // Button
  btnWrapper: {
    width: '100%',
    position: 'relative',
    marginTop: 12,
  },
  btnShadow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: -3,
    bottom: -3,
    backgroundColor: COLORS.brand,
  },
  btn: {
    backgroundColor: COLORS.brand,
    paddingVertical: 16,
    borderWidth: 3,
    borderColor: COLORS.brand,
    alignItems: 'center',
  },
  btnText: {
    fontFamily: FONTS.black,
    fontSize: 15,
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Loading
  loadingWrapper: {
    width: '100%',
    position: 'relative',
  },
  loadingBox: {
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.brand,
    padding: 40,
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontFamily: FONTS.black,
    fontSize: 14,
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 8,
  },

  // Message box (error / GPS warn)
  messageWrapper: {
    width: '100%',
    position: 'relative',
    marginBottom: 4,
  },
  messageBox: {
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.danger,
    padding: 24,
    alignItems: 'center',
  },
  messageIcon: { fontSize: 40, marginBottom: 10 },
  messageTitle: {
    fontFamily: FONTS.black,
    fontSize: 18,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  messageBody: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.accent,
    textAlign: 'center',
    lineHeight: 20,
  },
  messageBodySm: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.accentLight,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
  },

  // GPS warn cancel link
  cancelLink: { marginTop: 20, padding: 10 },
  cancelLinkText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Success screen
  successWrapper: {
    width: '100%',
    position: 'relative',
    marginBottom: 8,
  },
  successBox: {
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.success,
    padding: 28,
    alignItems: 'center',
  },
  successIcon: { fontSize: 48, marginBottom: 10 },
  successTitle: {
    fontFamily: FONTS.black,
    fontSize: 22,
    color: COLORS.success,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  successSub: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.accent,
    textAlign: 'center',
    marginBottom: 20,
  },

  // Pet row in success screen
  petRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  petRowLeft: { flex: 1 },
  petName: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.brand,
    textTransform: 'uppercase',
  },
  ticketBadge: {
    backgroundColor: COLORS.brand,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  ticketText: {
    fontFamily: FONTS.black,
    fontSize: 16,
    color: COLORS.white,
    letterSpacing: 1,
  },

  successInstruction: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.accentLight,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
    lineHeight: 18,
  },
});
