// The user's home screen.
// Contains the Hardware Hook that asks the OS for Push Notification permissions upon login.
// Renders active "In-Clinic" status alerts and upcoming vaccine reminders.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";
import { getClientStatusLabel } from "../utils/statusLabels";
import { safeDate, getLocalDateStr } from "../utils/helpers";
import { COLORS, FONTS } from "../theme/mobileTokens";
import { useConsentGate } from "../hooks/useConsentGate";
import { useNetwork } from "../context/NetworkContext";
import { useClientStats } from "../hooks/useClientStats";

// --- PUSH NOTIFICATION IMPORTS ---
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { MaterialIcons } from "@expo/vector-icons";

// Tells the app to show notifications even if the app is currently open and active.
// Must be called at module level (outside any component) so it is registered before
// any notification can arrive.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─── KPI CARD ──────────────────────────────────────────────────────────────────
// Neubrutalist stat card: solid offset shadow, thick border, zero borderRadius.
// accent: 'danger' | 'success' | 'warning' | undefined (default = brand espresso)
function KPICard({ label, value, subtitle, accent, small, wide }) {
  const accentColor = accent === 'danger'  ? COLORS.danger
    : accent === 'success' ? COLORS.success
    : accent === 'warning' ? COLORS.warning
    : COLORS.brand;

  return (
    <View style={[styles.kpiWrapper, wide && styles.kpiWrapperWide]}>
      <View style={[styles.kpiShadow, { backgroundColor: accentColor }]} />
      <View style={styles.kpiCard}>
        <Text style={[
          styles.kpiValue,
          small && styles.kpiValueSmall,
          accent && { color: accentColor },
        ]}>
          {value}
        </Text>
        <Text style={styles.kpiLabel}>{label}</Text>
        {subtitle ? <Text style={styles.kpiSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const ClientDashboard = ({ navigation }) => {
  const [activeAppointments, setActiveAppointments] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [vaccineAlerts, setVaccineAlerts] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [queueAhead, setQueueAhead] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [unreadCount, setUnreadCount] = useState(0);
  // T4.147: Computed outstanding balance from completed appointments.
  // Replaces the dead userProfile.outstandingBalance counter (T2.101 stopped updating it).
  const [computedBalance, setComputedBalance] = useState(0);

  // T4.156: Stats data — all-status appointments, raw pets, records by petId, sales.
  const [allAppointments, setAllAppointments] = useState([]);
  const [userPets, setUserPets] = useState([]);
  const [petRecords, setPetRecords] = useState({}); // { [petId]: [...records] }
  const [salesData, setSalesData] = useState([]);

  // --- CONSENT GATE STATE ---
  // consentCompleted prevents re-triggering the gate after the user returns
  // from ConsentScreen. The hook is one-shot (getDoc), so we guard with this
  // flag instead of forcing a re-fetch on focus.
  const [consentCompleted, setConsentCompleted] = useState(false);
  const [waiverBannerVisible, setWaiverBannerVisible] = useState(true);
  const { isConnected } = useNetwork();
  const userId = auth.currentUser?.uid ?? null;
  const {
    loading: consentLoading,
    needsConsent,
    needsWaiver,
    activeDpaPolicy,
    activeWaiverPolicy,
  } = useConsentGate(userId);

  // T4.156: Derive all stats from pre-fetched data — zero Firestore calls inside.
  const { visitStats, petOverview, financialStats, monthlyVisitData } = useClientStats({
    allAppointments,
    userPets,
    petRecords,
    salesData,
    vaccineAlerts,
  });

  // PULSE ANIMATION FOR ALERTS
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Loading timeout safety net — prevents infinite spinners if all listeners fail.
  // The active appointments listener (line ~256) sets setLoading(false) on both success
  // and error, but this 10s fallback guards against any edge case.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) console.warn("[ClientDashboard] Loading timeout — forcing false");
        return false;
      });
    }, 10000);
    return () => clearTimeout(timeout);
  }, []);

  // ======================================================================
  // CONSENT GATE — navigate to ConsentScreen if DPA consent is required.
  // Only fires once per dashboard session (guarded by consentCompleted flag).
  // When the user returns from ConsentScreen after signing, they set
  // consentCompleted via navigation.goBack(), so the gate does not re-trigger.
  // ======================================================================
  useEffect(() => {
    if (consentLoading || consentCompleted) return;
    if (!needsConsent || !activeDpaPolicy) return;

    const userConsentVersion = userProfile?.consentVersion ?? null;

    navigation.navigate('Consent', {
      consentType:        'dpa',
      versionNumber:      activeDpaPolicy.versionNumber,
      versionDocId:       activeDpaPolicy.versionDocId,
      policyText:         activeDpaPolicy.bodyText,
      policyTitle:        activeDpaPolicy.title,
      isPostRegistration: false,
      previousVersion:    userConsentVersion,
      summary:            activeDpaPolicy.summary,
    });

    // Mark as completed so focus listener does not re-fire on return
    setConsentCompleted(true);
  }, [consentLoading, needsConsent, activeDpaPolicy, consentCompleted, userProfile]);

  // ======================================================================
  // 1. PUSH NOTIFICATION SETUP
  // ======================================================================
  useEffect(() => {
    if (!auth.currentUser) return;

    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        // Securely save the hardware token to the User's Database Profile
        const userRef = doc(db, "users", auth.currentUser.uid);
        updateDoc(userRef, { expoPushToken: token }).catch((err) =>
          console.log("Failed to save token", err),
        );
      }
    });

    // Listen for notification taps — fires when the user presses a notification
    // while the app is backgrounded or foregrounded. No deep navigation needed:
    // opening the app lands on ClientDashboard which already shows live status.
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('[Push] Notification tapped:', response.notification.request.content);
      }
    );

    return () => {
      responseSubscription.remove();
    };
  }, []);

  // ======================================================================
  // 1.7 UNREAD NOTIFICATION COUNT
  // One-shot count of notification_log docs newer than lastNotificationReadAt.
  // Not a real-time listener — notifications are infrequent. Re-runs on
  // focus return (e.g., after viewing NotificationHistory clears the badge).
  // ======================================================================
  useEffect(() => {
    if (!auth.currentUser) return;

    const fetchUnreadCount = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        const lastRead = userSnap.exists() ? userSnap.data().lastNotificationReadAt : null;

        const constraints = [
          where('ownerId', '==', auth.currentUser.uid),
          orderBy('sentAt', 'desc'),
        ];
        if (lastRead) {
          constraints.push(where('sentAt', '>', lastRead));
        }
        // Limit to 100 — we only need to know "how many", not fetch thousands
        constraints.push(limit(100));

        const snap = await getDocs(query(collection(db, 'notification_log'), ...constraints));
        setUnreadCount(snap.size);
      } catch (err) {
        console.log('[ClientDashboard] Unread notification count error:', err.message);
        setUnreadCount(0);
      }
    };

    fetchUnreadCount();

    // Re-fetch on screen focus (e.g., returning from NotificationHistory)
    const unsubFocus = navigation.addListener('focus', fetchUnreadCount);
    return () => unsubFocus();
  }, [navigation]);

  async function registerForPushNotificationsAsync() {
    let token;
    if (Device.isDevice) {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") {
        console.log("Failed to get push token for push notification!");
        return;
      }

      // Generate the Token via Expo
      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId:
            Constants.expoConfig?.extra?.eas?.projectId ||
            Constants.easConfig?.projectId,
        })
      ).data;
    } else {
      console.log("Must use physical device for Push Notifications");
    }

    // Android specific channel requirements
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#3ABEF9",
      });
    }
    return token;
  }

  // ======================================================================
  // 1.5 FETCH USER PROFILE (For Balance & Name)
  // ======================================================================
  useEffect(() => {
    if (!auth.currentUser) return;
    const unsubProfile = onSnapshot(
      doc(db, "users", auth.currentUser.uid),
      (docSnap) => {
        if (docSnap.exists()) setUserProfile(docSnap.data());
      },
      (error) => {
        console.warn("[ClientDashboard] Profile listener error:", error.message);
      },
    );
    return () => unsubProfile();
  }, []);

  // ======================================================================
  // 1.6 COMPUTED OUTSTANDING BALANCE — reads from SALES collection (single source of truth)
  // Matches admin's computation in usePatientManager.js (line 155-159).
  // The sales collection is authoritative for financial data — admin "Mark as Settled"
  // updates sales docs, and this listener picks up the change instantly.
  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'sales'),
      where('ownerId', '==', auth.currentUser.uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      const total = snap.docs.reduce((sum, d) => {
        const data = d.data();
        if (data.status === 'refunded' || data.status === 'voided') return sum;
        const bal = data.balanceRemaining || 0;
        return sum + (bal > 0 ? bal : 0);
      }, 0);
      setComputedBalance(total);
    }, (err) => {
      console.warn('[ClientDashboard] Balance listener error:', err.message);
    });
    return () => unsub();
  }, []);

  // ======================================================================
  // 1.7 ALL-STATUS APPOINTMENTS (T4.156 stats — lifetime visit counts)
  // ======================================================================
  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'appointments'),
      where('ownerId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setAllAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn('[ClientDashboard] All-appointments listener error:', err.message);
    });
    return () => unsub();
  }, []);

  // ======================================================================
  // 1.8 SALES DATA — one-shot fetch for spending stats (T4.156)
  // Uses the chunked 'in' pattern because Firestore limits 'in' to 10 values.
  // ======================================================================
  const completedIds = useMemo(
    () => allAppointments.filter(a => a.status === 'completed').map(a => a.id),
    [allAppointments]
  );

  useEffect(() => {
    if (!auth.currentUser || completedIds.length === 0) { setSalesData([]); return; }
    let cancelled = false;

    const fetchSales = async () => {
      const chunks = [];
      for (let i = 0; i < completedIds.length; i += 10) {
        chunks.push(completedIds.slice(i, i + 10));
      }

      try {
        const results = [];
        for (const chunk of chunks) {
          const snap = await getDocs(
            query(collection(db, 'sales'), where('appointmentId', 'in', chunk)),
          );
          snap.forEach(d => results.push({ id: d.id, ...d.data() }));
        }
        if (!cancelled) setSalesData(results);
      } catch (err) {
        console.warn('[ClientDashboard] Sales fetch error:', err.message);
      }
    };

    fetchSales();
    return () => { cancelled = true; };
  }, [completedIds]);

  // ======================================================================
  // 2. FETCH ACTIVE APPOINTMENTS (The Live Feed)
  // ======================================================================
  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, "appointments"),
      where("ownerId", "==", auth.currentUser.uid),
      where("status", "in", [
        "pending",
        "confirmed",
        "arrived",
        "in-consult",
        "confined",
        "billing",
        "dispensing",
        "on-hold",
      ]),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });

        // Sort logic: "In-Clinic" statuses at the very top, then future "Confirmed"
        list.sort((a, b) => {
          const inClinicStatuses = [
            "arrived",
            "in-consult",
            "confined",
            "billing",
            "dispensing",
            "on-hold",
          ];
          const aActive = inClinicStatuses.includes(a.status);
          const bActive = inClinicStatuses.includes(b.status);
          if (aActive && !bActive) return -1;
          if (!aActive && bActive) return 1;
          return 0;
        });

        // Limit to Top 2 to prevent screen clutter
        setActiveAppointments(list.slice(0, 2));
        setLoading(false);
      },
      (error) => {
        console.log("Appointment Sync Error:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // ======================================================================
  // 2.5 LIVE QUEUE TRACKING (People Ahead Logic)
  // ======================================================================
  useEffect(() => {
    const arrivedAppt = activeAppointments.find(a => a.status === 'arrived');
    if (!arrivedAppt) {
      setQueueAhead(0);
      return;
    }

    // Query for all arrived patients on the same day as this appointment
    const todayStr = arrivedAppt.scheduledDateStr || getLocalDateStr();
    const q = query(
      collection(db, "appointments"),
      where("status", "==", "arrived"),
      where("scheduledDateStr", "==", todayStr)
    );

    const unsubQueue = onSnapshot(
      q,
      (snap) => {
        let ahead = 0;
        // T4.134: filter to the same department lane — other departments don't share staff
        const myDept = arrivedAppt.serviceCategory || null;
        snap.forEach(d => {
          const data = d.data();
          if (myDept && data.serviceCategory && data.serviceCategory !== myDept) return;
          if (data.queueNumber != null && data.queueNumber < arrivedAppt.queueNumber && d.id !== arrivedAppt.id) ahead++;
        });
        setQueueAhead(ahead);
      },
      (error) => {
        console.warn("[ClientDashboard] Queue ahead listener error:", error.message);
      },
    );

    return () => unsubQueue();
  }, [activeAppointments]);

  // ======================================================================
  // 3. FETCH HEALTH REMINDERS
  // ======================================================================
  useEffect(() => {
    if (!auth.currentUser) return;

    const qReminders = query(
      collection(db, "medical_records"),
      where("ownerId", "==", auth.currentUser.uid),
      orderBy("nextVisit", "asc"),
    );

    const unsubReminders = onSnapshot(
      qReminders,
      (snapshot) => {
        const now = new Date();
        const list = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.nextVisit && typeof data.nextVisit.toDate === "function") {
            const visitDate = data.nextVisit.toDate();
            if (visitDate >= now) {
              list.push({ id: docSnap.id, ...data });
            }
          }
        });
        setReminders(list);
      },
      (error) => {
        console.warn("[ClientDashboard] Reminders listener error (index may be missing):", error.message);
      },
    );

    return () => unsubReminders();
  }, []);

  // ======================================================================
  // 3.5 FETCH VACCINE ALERTS
  // Queries each pet's medical_records for vaccine due dates. Produces a
  // per-pet alert object with overdue and due-soon vaccine name lists.
  // The onSnapshot on pets triggers a one-time getDocs per pet — acceptable
  // for <10 pets per owner. Pattern mirrors MyPetsScreen vaccineDueDates.
  // ======================================================================
  useEffect(() => {
    if (!auth.currentUser) return;
    let mounted = true;

    const petsQuery = query(
      collection(db, 'pets'),
      where('ownerId', '==', auth.currentUser.uid),
    );

    const unsubPets = onSnapshot(
      petsQuery,
      async (petsSnap) => {
      const alerts = [];
      const now = new Date();
      const thirtyDaysFromNow = new Date(now);
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      // T4.156: expose raw pets array for stats hook (piggyback on this listener)
      const petsArr = petsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // T4.156: collect medical records per pet for weight trend computation
      const recordsByPet = {};

      for (const petDoc of petsSnap.docs) {
        const pet = { id: petDoc.id, ...petDoc.data() };
        try {
          const medSnap = await getDocs(
            query(collection(db, 'medical_records'), where('petId', '==', pet.id)),
          );

          // T4.156: store raw records for stats
          recordsByPet[pet.id] = medSnap.docs.map(d => ({ id: d.id, ...d.data() }));

          const dueDates = [];
          medSnap.docs.forEach((mDoc) => {
            const mData = mDoc.data();
            if (mData.vaccineAdministrations?.length > 0) {
              mData.vaccineAdministrations.forEach((vax) => {
                if (vax.dueDate) {
                  dueDates.push({ vaccineName: vax.vaccineName, dueDate: vax.dueDate });
                }
              });
            } else if (mData.vaccineData?.dueDate) {
              dueDates.push({
                vaccineName: mData.vaccineData.vaccineName,
                dueDate: mData.vaccineData.dueDate,
              });
            }
          });

          const petOverdue = [];
          const petDueSoon = [];

          dueDates.forEach(({ vaccineName, dueDate: d }) => {
            const date =
              d?.toDate ? d.toDate()
              : d?.seconds ? new Date(d.seconds * 1000)
              : typeof d === 'string' ? new Date(d)
              : new Date(d);

            if (isNaN(date.getTime())) return;

            const label = vaccineName || 'Vaccine';
            if (date < now) {
              petOverdue.push(label);
            } else if (date < thirtyDaysFromNow) {
              petDueSoon.push(label);
            }
          });

          if (petOverdue.length > 0 || petDueSoon.length > 0) {
            alerts.push({
              petName: pet.name,
              petId: pet.id,
              overdue: petOverdue,
              dueSoon: petDueSoon,
            });
          }
        } catch (e) {
          console.log('[ClientDashboard] Vaccine alert fetch error:', e.message);
        }
      }

      if (mounted) {
        setVaccineAlerts(alerts);
        // T4.156: update stats inputs from the same fetch
        setUserPets(petsArr);
        setPetRecords(recordsByPet);
      }
      },
      (error) => {
        console.warn("[ClientDashboard] Vaccine alerts listener error:", error.message);
      },
    );

    return () => {
      mounted = false;
      unsubPets();
    };
  }, []);

  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: () => {
            auth.signOut();
            navigation.replace("Login");
          },
        },
      ],
    );
  };

  // Writes confirmedByClient to the appointment document from the dashboard card.
  // Silently fails — the onSnapshot listener on activeAppointments drives the UI update.
  // Users can always retry from the ClientAppointments screen if this fails.
  const handleConfirmFromDashboard = async (appointmentId) => {
    try {
      await updateDoc(doc(db, "appointments", appointmentId), {
        confirmedByClient: true,
        confirmedByClientAt: Timestamp.now(),
      });
    } catch (error) {
      // Silent fail — user can retry from ClientAppointments
    }
  };

  // --- RENDER NOTIFICATION CARDS ---
  const renderNotification = (appt) => {
    let bgColor, title, msg, icon, borderColor;

    switch (appt.status) {
      case "pending":
        bgColor = "#FFF3E0";
        borderColor = "#FFCC80";
        title = "Awaiting Confirmation";
        msg = `${appt.petName}'s booking is being reviewed by the clinic.`;
        icon = "⏳";
        break;
      case "confirmed":
        bgColor = "#F0FDF4"; // planBg
        borderColor = "#86EFAC"; // planBorder
        title = "Booking Confirmed";
        msg = `${appt.petName} is scheduled for ${safeDate(appt.scheduledDate)}.`;
        icon = "📅";
        break;
      case "arrived":
        bgColor = "#EFF6FF"; // kpiBlueBg
        borderColor = "#93C5FD"; // kpiBlueBorder
        title = "Checked In";
        msg = `You are in the lobby. Ticket #${appt.ticketPrefix || ""}${appt.queueNumber}.`;
        icon = "🎟️";
        break;
      case "in-consult":
        bgColor = "#FFF7ED"; // kpiOrangeBg
        borderColor = "#FDBA74"; // kpiOrangeBorder
        title = "In Consultation";
        msg = `${appt.petName} is currently with the Vet.`;
        icon = "🩺";
        break;
      case "dispensing":
        bgColor = "#FFF7ED"; // rxBg
        borderColor = "#FED7AA"; // rxBorder
        title = "Pharmacy";
        msg = `Medications are being prepared for ${appt.petName}.`;
        icon = "💊";
        break;
      case "confined":
        bgColor = "#F3E8FF"; // kpiPurpleBg
        borderColor = "#D8B4FE"; // kpiPurpleBorder
        title = "Admitted";
        msg = `${appt.petName} is currently confined at the clinic.`;
        icon = "🏥";
        break;
      case "billing":
        bgColor = "#F0FDF4"; // planBg
        borderColor = "#86EFAC"; // planBorder
        title = "Ready for Checkout";
        msg = `Services complete. Please proceed to the front desk.`;
        icon = "💰";
        break;
      case "on-hold":
        bgColor = "#ECEFF1";
        borderColor = "#90A4AE";
        title = "On Hold";
        msg = `${appt.petName} is on hold — your vet will resume shortly.`;
        icon = "⏸️";
        break;
      default:
        bgColor = "#FAFAFA";
        borderColor = "#ccc";
        icon = "ℹ️";
        title = getClientStatusLabel(appt.status);
        msg = `Your appointment status has been updated.`;
        break;
    }

    return (
      <View key={appt.id} style={styles.notifContainer}>
        <View style={[styles.notifShadow, { backgroundColor: borderColor }]} />
        <TouchableOpacity
          style={[
            styles.notifCard,
            { backgroundColor: "white", borderColor: "#3E2723", borderLeftWidth: 8, borderLeftColor: borderColor },
          ]}
          onPress={() => navigation.navigate("ClientAppointments")}
        >
          <View style={styles.notifContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.notifTitle}>{icon} {title}</Text>
              {appt.status === 'arrived' && (
                <View style={styles.queueTag}>
                  <Text style={styles.queueTagText}>#{appt.queueNumber}</Text>
                </View>
              )}
            </View>
            <Text style={styles.notifMsg}>{msg}</Text>

            {appt.status === 'confirmed' && !appt.confirmedByClient && (
              <TouchableOpacity
                onPress={() => handleConfirmFromDashboard(appt.id)}
                style={{
                  marginTop: 10,
                  backgroundColor: COLORS.success,
                  borderWidth: 2,
                  borderColor: '#3E2723',
                  borderRadius: 0,
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  alignSelf: 'flex-start',
                }}
              >
                <Text style={{ color: 'white', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 }}>
                  {"CONFIRM I'M COMING"}
                </Text>
              </TouchableOpacity>
            )}

            {appt.status === 'confirmed' && appt.confirmedByClient && (
              <Text style={{ marginTop: 8, color: COLORS.success, fontWeight: '900', fontSize: 12 }}>
                {"✓ YOU'VE CONFIRMED ATTENDANCE"}
              </Text>
            )}

            {appt.status === 'arrived' && (
              <View style={styles.queueProgressContainer}>
                <View style={styles.queueProgressBar}>
                  <View style={[styles.queueProgressFill, {
                    width: queueAhead === 0
                      ? '100%'
                      : `${Math.max(10, Math.round(100 / (queueAhead + 1)))}%`,
                    backgroundColor: '#3ABEF9'
                  }]} />
                </View>
                {/* T4.134: department-filtered count with dept name */}
                <Text style={[styles.queueAheadText, { color: '#3ABEF9' }]}>
                  {queueAhead === 0
                    ? "YOU'RE NEXT IN LINE!"
                    : `${queueAhead} PETS AHEAD IN ${(appt.serviceCategory || 'QUEUE').toUpperCase()}`}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.arrow}>➔</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* WAIVER ADVISORY BANNER — non-blocking, dismissible */}
      {needsWaiver && waiverBannerVisible && !needsConsent && (
        <View style={styles.waiverBannerContainer}>
          <TouchableOpacity
            style={styles.waiverBanner}
            onPress={() => {
              if (activeWaiverPolicy) {
                navigation.navigate('Consent', {
                  consentType:        'waiver',
                  versionNumber:      activeWaiverPolicy.versionNumber,
                  versionDocId:       activeWaiverPolicy.versionDocId,
                  policyText:         activeWaiverPolicy.bodyText,
                  policyTitle:        activeWaiverPolicy.title,
                  isPostRegistration: false,
                  summary:            activeWaiverPolicy.summary,
                });
              } else {
                navigation.navigate('UserProfile');
              }
            }}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.waiverBannerTitle}>WAIVER REQUIRED</Text>
              <Text style={styles.waiverBannerMsg}>
                Tap to review and sign your liability waiver.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setWaiverBannerVisible(false)}
              style={styles.waiverBannerClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.waiverBannerCloseText}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      )}

      {/* BALANCE ALERT BANNER (NEOBRUTALIST REDESIGN) */}
      {/* T4.147: computedBalance replaces the dead userProfile.outstandingBalance counter */}
      {computedBalance > 0 && (
        <Animated.View style={[styles.balanceContainer, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.balanceShadow} />
          <View style={styles.balanceBox}>
            <Text style={styles.balanceIcon}>💸</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.balanceTitle}>OUTSTANDING BALANCE</Text>
              <Text style={styles.balanceMsg}>₱{computedBalance.toLocaleString()} — SETTLE AT COUNTER</Text>
            </View>
          </View>
        </Animated.View>
      )}

      {/* NEUBRUTALIST HEADER — title + bell + profile button inline */}
      <View style={styles.headerBox}>
        <Text style={styles.dashboardTitle}>DASHBOARD</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* NOTIFICATION BELL */}
          <TouchableOpacity
            style={styles.bellSquare}
            onPress={() => navigation.navigate('NotificationHistory')}
          >
            <View style={styles.bellShadow} />
            <View style={styles.bellInner}>
              <MaterialIcons name="notifications" size={24} color={COLORS.brand} />
              {unreadCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* PROFILE BUTTON */}
          <TouchableOpacity
            style={styles.profileSquare}
            onPress={() => navigation.navigate("UserProfile")}
          >
            <View style={styles.profileShadow} />
            <View style={styles.profileInner}>
              <Text style={{ fontSize: 24 }}>👤</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* --- LOADING / OFFLINE STATE --- */}
      {loading && (
        <View style={styles.loadingContainer}>
          {!isConnected ? (
            <>
              <MaterialIcons name="wifi-off" size={48} color={COLORS.muted} />
              <Text style={styles.offlineTitle}>NO INTERNET CONNECTION</Text>
              <Text style={styles.offlineMsg}>
                Connect to the internet to load your dashboard.
              </Text>
            </>
          ) : (
            <Text style={styles.offlineMsg}>Loading your dashboard...</Text>
          )}
        </View>
      )}

      {/* --- ACTIVE STATUS FEED --- */}
      {!loading && activeAppointments.length > 0 && (
        <View style={styles.feedSection}>
          <Text style={styles.sectionHeader}>📌 Current Status</Text>
          {activeAppointments.map(renderNotification)}
        </View>
      )}

      {/* --- UPCOMING REMINDERS --- */}
      {!loading && reminders.length > 0 && (
        <View style={styles.feedSection}>
          <Text style={styles.sectionHeader}>📅 Health Reminders</Text>
          {reminders.slice(0, 1).map((rec) => (
            <View key={rec.id} style={styles.notifContainer}>
              <View style={[styles.notifShadow, { backgroundColor: "#3ABEF9" }]} />
              <View style={[styles.notifCard, { backgroundColor: "white", borderColor: "#3E2723", borderLeftWidth: 8, borderLeftColor: "#3ABEF9" }]}>
                <View style={styles.notifContent}>
                  <Text style={[styles.notifTitle, { color: "#3E2723" }]}>
                    💉 DUE: {(rec.petName || 'YOUR PET').toUpperCase()}
                  </Text>
                  <Text style={styles.notifMsg}>
                    SCHEDULED FOR: {safeDate(rec.nextVisit)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* --- VACCINE ALERTS --- */}
      {!loading && vaccineAlerts.length > 0 && (
        <View style={styles.feedSection}>
          <Text style={styles.sectionHeader}>Vaccination Alerts</Text>
          {vaccineAlerts.map((alert) => (
            <TouchableOpacity
              key={alert.petId}
              onPress={() =>
                navigation.navigate('PetHistory', {
                  petId: alert.petId,
                  petName: alert.petName,
                })
              }
              activeOpacity={0.8}
            >
              <View style={styles.notifContainer}>
                <View
                  style={[
                    styles.notifShadow,
                    { backgroundColor: alert.overdue.length > 0 ? '#D32F2F' : '#F57F17' },
                  ]}
                />
                <View
                  style={[
                    styles.notifCard,
                    {
                      backgroundColor: alert.overdue.length > 0 ? '#FFEBEE' : '#FFF8E1',
                      borderColor: '#3E2723',
                      borderLeftWidth: 8,
                      borderLeftColor: alert.overdue.length > 0 ? '#D32F2F' : '#F57F17',
                    },
                  ]}
                >
                  <View style={styles.notifContent}>
                    <Text
                      style={[
                        styles.notifTitle,
                        { color: alert.overdue.length > 0 ? '#C62828' : '#E65100' },
                      ]}
                    >
                      {alert.overdue.length > 0 ? 'OVERDUE' : 'DUE SOON'} — {alert.petName.toUpperCase()}
                    </Text>
                    {alert.overdue.length > 0 && (
                      <Text style={styles.notifMsg}>
                        OVERDUE: {alert.overdue.join(', ')}
                      </Text>
                    )}
                    {alert.dueSoon.length > 0 && (
                      <Text style={[styles.notifMsg, alert.overdue.length > 0 && { marginTop: 2 }]}>
                        DUE SOON: {alert.dueSoon.join(', ')}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.arrow}>➔</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* --- FIRST-TIME USER GUIDANCE --- */}
      {!loading && activeAppointments.length === 0 && reminders.length === 0 && vaccineAlerts.length === 0 && (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateMsg}>
            No active visits or upcoming reminders. Book a visit to get started!
          </Text>
        </View>
      )}

      {/* --- MAIN MENU GRID --- */}
      <View style={styles.grid}>
        <View style={styles.cardWrapper}>
          <View style={styles.cardShadow} />
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => navigation.navigate("MyPets")}
          >
            <Text style={styles.cardIcon}>🐾</Text>
            <Text style={styles.cardText}>MY PETS</Text>
          </Pressable>
        </View>

        <View style={styles.cardWrapper}>
          <View style={styles.cardShadow} />
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => navigation.navigate("BookAppointment")}
          >
            <Text style={styles.cardIcon}>📅</Text>
            <Text style={styles.cardText}>SCHEDULE VISIT</Text>
          </Pressable>
        </View>

        <View style={styles.cardWrapper}>
          <View style={styles.cardShadow} />
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => navigation.navigate("ClientAppointments")}
          >
            <Text style={styles.cardIcon}>🎫</Text>
            <Text style={styles.cardText}>MY BOOKINGS</Text>
          </Pressable>
        </View>

        <View style={styles.cardWrapper}>
          <View style={styles.cardShadow} />
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => navigation.navigate("QueueScreen")}
          >
            <Text style={styles.cardIcon}>🔢</Text>
            <Text style={styles.cardText}>LIVE QUEUE</Text>
          </Pressable>
        </View>

        <View style={styles.cardWrapper}>
          <View style={[styles.cardShadow, { backgroundColor: '#2E7D32' }]} />
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed, { borderColor: '#3E2723' }]}
            onPress={() => navigation.navigate("SelfCheckIn")}
          >
            <Text style={styles.cardIcon}>📷</Text>
            <Text style={[styles.cardText, { color: '#2E7D32' }]}>CHECK IN</Text>
          </Pressable>
        </View>

        <View style={styles.cardWrapper}>
          <View style={[styles.cardShadow, { backgroundColor: '#3ABEF9' }]} />
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed, { borderColor: '#3E2723' }]}
            onPress={() => navigation.navigate("Chatbot")}
          >
            <Text style={styles.cardIcon}>🤖</Text>
            <Text style={[styles.cardText, { color: '#3ABEF9' }]}>HELP CENTER</Text>
          </Pressable>
        </View>

        <View style={styles.cardWrapper}>
          <View style={[styles.cardShadow, { backgroundColor: '#D32F2F' }]} />
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed, { backgroundColor: '#D32F2F', borderColor: '#3E2723' }]}
            onPress={handleLogout}
          >
            <Text style={styles.cardIcon}>🚪</Text>
            <Text style={[styles.cardText, { color: '#FFFFFF' }]}>LOGOUT</Text>
          </Pressable>
        </View>
      </View>

      {/* ── STATS SECTION (T4.156) — rendered after data loads ─────────── */}
      {!loading && allAppointments.length > 0 && (
        <View style={styles.statsSection}>
          <Text style={styles.statsSectionHeader}>YOUR STATS</Text>

          {/* ── 2-COLUMN KPI GRID ─────────────────────────────────────── */}
          <View style={styles.statsGrid}>
            <KPICard label="TOTAL VISITS"  value={visitStats.totalVisits} />
            <KPICard label="THIS YEAR"     value={visitStats.visitsThisYear} />
            <KPICard label="LAST VISIT"    value={visitStats.lastVisitRelative} small />
            <KPICard
              label="NEXT VISIT"
              value={visitStats.nextUpcomingCountdown ?? 'None scheduled'}
              small
            />
            {visitStats.noShowCount > 0 && (
              <KPICard label="NO-SHOWS" value={visitStats.noShowCount} accent="danger" />
            )}
            {visitStats.avgFrequency != null && (
              <KPICard label="FREQUENCY" value={visitStats.avgFrequency} small />
            )}
            <KPICard
              label="MY PETS"
              value={petOverview.petCount}
              subtitle={petOverview.petBreakdown || undefined}
            />
            {petOverview.vaccinationCompliance != null && (
              <KPICard
                label="VACCINES"
                value={`${petOverview.vaccinationCompliance.pct}%`}
                subtitle={`${petOverview.vaccinationCompliance.compliant}/${petOverview.vaccinationCompliance.total} up to date`}
                accent={
                  petOverview.vaccinationCompliance.pct >= 75 ? 'success'
                  : petOverview.vaccinationCompliance.pct >= 50 ? 'warning'
                  : 'danger'
                }
              />
            )}
            {financialStats.totalSpent > 0 && (
              <KPICard
                label="TOTAL SPENT"
                value={`P${financialStats.totalSpent.toLocaleString()}`}
                subtitle={`P${financialStats.avgPerVisit.toLocaleString()}/visit avg`}
                wide
              />
            )}
          </View>

          {/* ── MINI BAR CHART: Visits per month, last 6 months ─────── */}
          <View style={styles.chartContainer}>
            <View style={styles.chartShadow} />
            <View style={styles.chartBox}>
              <Text style={styles.chartTitle}>VISITS PER MONTH</Text>
              <View style={styles.chartBars}>
                {monthlyVisitData.map(m => (
                  <View key={m.key} style={styles.chartBarCol}>
                    <View style={styles.chartBarTrack}>
                      <View style={[styles.chartBarFill, { height: `${Math.max(m.pct, 4)}%` }]} />
                    </View>
                    <Text style={styles.chartBarLabel}>{m.label}</Text>
                    {m.count > 0 && (
                      <Text style={styles.chartBarCount}>{m.count}</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* ── WEIGHT TRENDS ─────────────────────────────────────────── */}
          {petOverview.weightTrends.length > 0 && (
            <View style={styles.trendsContainer}>
              <Text style={styles.trendsTitle}>WEIGHT TRENDS</Text>
              {petOverview.weightTrends.map(wt => (
                <View key={wt.petName} style={styles.trendRow}>
                  <Text style={styles.trendPetName}>{wt.petName}</Text>
                  <Text style={styles.trendWeight}>{wt.weight} kg</Text>
                  {wt.delta !== null && (
                    <Text style={[
                      styles.trendDelta,
                      {
                        color: wt.delta > 0 ? COLORS.success
                          : wt.delta < 0 ? COLORS.danger
                          : COLORS.textMuted,
                      },
                    ]}>
                      {wt.delta > 0 ? `+${wt.delta.toFixed(1)}` : wt.delta.toFixed(1)} kg
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* ── URGENT VACCINE ALERT ─────────────────────────────────── */}
          {petOverview.urgentAlert != null && (
            <View style={styles.urgentAlertRow}>
              <MaterialIcons name="warning" size={14} color={COLORS.danger} />
              <Text style={styles.urgentAlertText}>{petOverview.urgentAlert}</Text>
            </View>
          )}

          {/* ── AGE MILESTONES ────────────────────────────────────────── */}
          {petOverview.ageMilestones.length > 0 && (
            <View style={styles.milestoneContainer}>
              {petOverview.ageMilestones.map(ms => (
                <View key={ms.petName} style={styles.milestoneRow}>
                  <MaterialIcons name="cake" size={14} color={COLORS.sky} />
                  <Text style={styles.milestoneText}>{ms.message}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: "#FFF8E1", paddingTop: 60 },

  headerBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 25,
  },
  dashboardTitle: {
    fontFamily: "Inter_900Black",
    fontSize: 36,
    color: "#3E2723",
    textTransform: "uppercase",
    letterSpacing: -1.5,
    lineHeight: 38,
  },
  profileSquare: {
    width: 60,
    height: 60,
    position: 'relative',
  },
  profileShadow: {
    position: 'absolute',
    width: 60,
    height: 60,
    backgroundColor: '#3E2723',
    top: 4,
    left: 4,
  },
  profileInner: {
    width: 60,
    height: 60,
    backgroundColor: 'white',
    borderWidth: 3,
    borderColor: '#3E2723',
    alignItems: "center",
    justifyContent: "center",
  },

  // NOTIFICATION BELL BUTTON (neubrutalist offset shadow, matches profileSquare)
  bellSquare: {
    width: 48,
    height: 48,
    position: 'relative',
  },
  bellShadow: {
    position: 'absolute',
    width: 48,
    height: 48,
    backgroundColor: COLORS.brand,
    top: 4,
    left: 4,
  },
  bellInner: {
    width: 48,
    height: 48,
    backgroundColor: 'white',
    borderWidth: 3,
    borderColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // bellBadge intentionally uses borderRadius: 9 — sole exception to zero-radius
  // rule. Status badges are universally circular on mobile platforms.
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.danger,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: 'white',
  },
  bellBadgeText: {
    color: 'white',
    fontSize: 10,
    fontFamily: FONTS.black,
    lineHeight: 12,
  },

  sectionHeader: {
    fontFamily: "Inter_900Black",
    fontSize: 13,
    color: "#8D6E63",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },

  feedSection: { marginBottom: 20 },
  notifContainer: { position: 'relative', marginBottom: 15 },
  notifShadow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: -2,
    bottom: -2,
    backgroundColor: '#3E2723',
  },
  notifCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 0,
    backgroundColor: 'white',
    borderWidth: 3,
    borderColor: '#3E2723',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 0,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 15,
  },
  notifIcon: { fontSize: 20 },
  notifContent: { flex: 1 },
  notifTitle: {
    fontFamily: "Inter_900Black",
    fontSize: 16,
    color: "#3E2723",
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  notifMsg: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#5D4037" },
  arrow: { fontSize: 18, color: "#3E2723", fontWeight: "900" },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingBottom: 20,
  },
  cardWrapper: {
    width: "48%",
    height: 140,
    marginBottom: 20,
    position: 'relative',
  },
  cardShadow: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 0,
    bottom: 0,
    backgroundColor: '#3E2723',
  },
  card: {
    height: 140,
    paddingVertical: 25,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
    borderWidth: 3,
    borderColor: "#3E2723",
  },
  cardPressed: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  cardIcon: { fontSize: 36, marginBottom: 10 },
  cardText: { 
    fontFamily: "Inter_900Black",
    color: "#3E2723", 
    fontSize: 13, 
    letterSpacing: 0.8, 
    textTransform: 'uppercase'
  },

  // BALANCE BANNER REDESIGN
  balanceContainer: {
    marginBottom: 30,
    position: 'relative',
  },
  balanceShadow: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: -4,
    bottom: -4,
    backgroundColor: '#3E2723',
  },
  balanceBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    backgroundColor: "#D32F2F",
    borderWidth: 3,
    borderColor: "#3E2723",
  },
  balanceIcon: { fontSize: 32, marginRight: 15 },
  balanceTitle: { fontFamily: "Inter_900Black", color: "white", fontSize: 18, letterSpacing: 0.5 },
  balanceMsg: { fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.9)", fontSize: 12 },
  balanceActionButton: {
    backgroundColor: "white",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: "#3E2723",
  },
  balanceActionText: { color: "#3E2723", fontWeight: "900", fontSize: 11 },

  // EMPTY STATE
  emptyStateContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 6,
  },
  emptyStateMsg: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: '#5D4037',
    textAlign: 'center',
  },

  // WAIVER ADVISORY BANNER
  waiverBannerContainer: {
    marginBottom: 12,
    position: 'relative',
  },
  waiverBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: COLORS.warning,
    borderWidth: 3,
    borderColor: COLORS.brand,
  },
  waiverBannerTitle: {
    fontFamily: 'Inter_900Black',
    fontSize: 12,
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  waiverBannerMsg: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: COLORS.white,
  },
  waiverBannerClose: {
    paddingLeft: 12,
  },
  waiverBannerCloseText: {
    color: COLORS.white,
    fontWeight: '900',
    fontSize: 16,
  },

  // QUEUE PROGRESS
  queueTag: { backgroundColor: '#3E2723', paddingHorizontal: 10, paddingVertical: 4 },
  queueTagText: { fontWeight: '900', fontSize: 14, color: 'white' },
  queueProgressContainer: { marginTop: 12, borderTopWidth: 2, borderTopColor: '#3E2723', paddingTop: 10 },
  queueProgressBar: { height: 10, backgroundColor: 'rgba(0,0,0,0.1)', borderWidth: 2, borderColor: '#3E2723', overflow: 'hidden', marginBottom: 5 },
  queueProgressFill: { height: '100%' },
  queueAheadText: { fontSize: 12, fontWeight: '900' },

  // LOADING / OFFLINE STATE
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  offlineTitle: {
    fontFamily: 'Inter_900Black',
    fontSize: 16,
    color: COLORS.brand,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12,
  },
  offlineMsg: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 40,
  },

  // ── STATS SECTION (T4.156) ────────────────────────────────────────────────
  statsSection: {
    marginTop: 10,
    marginBottom: 30,
  },
  statsSectionHeader: {
    fontFamily: FONTS.black,
    fontSize: 13,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },

  // KPI CARD
  kpiWrapper: {
    width: '48%',
    marginBottom: 14,
    position: 'relative',
  },
  kpiWrapperWide: {
    width: '100%',
  },
  kpiShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: COLORS.brand,
  },
  kpiCard: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    padding: 14,
    minHeight: 80,
    justifyContent: 'center',
  },
  kpiValue: {
    fontFamily: FONTS.black,
    fontSize: 28,
    color: COLORS.brand,
    lineHeight: 30,
  },
  kpiValueSmall: {
    fontSize: 16,
    lineHeight: 20,
  },
  kpiLabel: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  kpiSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // MINI BAR CHART
  chartContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  chartShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: COLORS.brand,
  },
  chartBox: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    padding: 14,
  },
  chartTitle: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  chartBars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 80,
  },
  chartBarCol: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  chartBarTrack: {
    width: '100%',
    height: 60,
    justifyContent: 'flex-end',
  },
  chartBarFill: {
    width: '100%',
    backgroundColor: COLORS.sky,
    borderWidth: 1,
    borderColor: COLORS.brand,
    borderRadius: 0,
    minHeight: 3,
  },
  chartBarLabel: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  chartBarCount: {
    fontFamily: FONTS.black,
    fontSize: 10,
    color: COLORS.brand,
    position: 'absolute',
    top: -2,
  },

  // WEIGHT TRENDS
  trendsContainer: {
    marginBottom: 16,
  },
  trendsTitle: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  trendPetName: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.brand,
    flex: 1,
  },
  trendWeight: {
    fontFamily: FONTS.black,
    fontSize: 14,
    color: COLORS.brand,
    marginRight: 8,
  },
  trendDelta: {
    fontFamily: FONTS.bold,
    fontSize: 12,
  },

  // URGENT VACCINE ALERT
  urgentAlertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 0,
  },
  urgentAlertText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.danger,
    flex: 1,
  },

  // AGE MILESTONES
  milestoneContainer: {
    marginBottom: 12,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  milestoneText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
  },
});

export default ClientDashboard;
