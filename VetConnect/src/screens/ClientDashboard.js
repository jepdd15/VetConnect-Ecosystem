// The user's home screen.
// Contains the Hardware Hook that asks the OS for Push Notification permissions upon login.
// Renders active "In-Clinic" status alerts and upcoming vaccine reminders.

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
} from "react-native";
import { auth, db } from "../../firebaseConfig";
import { getClientStatusLabel } from "../utils/statusLabels";
import { safeDate, getLocalDateStr } from "../utils/helpers";

// --- PUSH NOTIFICATION IMPORTS ---
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

// Tells the app to show notifications even if the app is currently open and active
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});


const ClientDashboard = ({ navigation }) => {
  const [activeAppointments, setActiveAppointments] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [queueAhead, setQueueAhead] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pulseAnim] = useState(new Animated.Value(1));

  // PULSE ANIMATION FOR ALERTS
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

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
  }, []);

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
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }
    return token;
  }

  // ======================================================================
  // 1.5 FETCH USER PROFILE (For Balance & Name)
  // ======================================================================
  useEffect(() => {
    if (!auth.currentUser) return;
    const unsubProfile = onSnapshot(doc(db, "users", auth.currentUser.uid), (doc) => {
      if (doc.exists()) setUserProfile(doc.data());
    });
    return () => unsubProfile();
  }, []);

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

    const unsubQueue = onSnapshot(q, (snap) => {
      let ahead = 0;
      snap.forEach(d => {
        const data = d.data();
        if (data.queueNumber < arrivedAppt.queueNumber && d.id !== arrivedAppt.id) ahead++;
      });
      setQueueAhead(ahead);
    });

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

  const handleLogout = () => {
    auth.signOut();
    navigation.replace("Login");
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
                <Text style={[styles.queueAheadText, { color: '#3ABEF9' }]}>
                  {queueAhead === 0 ? "YOU'RE NEXT IN LINE! 🎉" : `${queueAhead} PETS AHEAD OF YOU`}
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
      {/* BALANCE ALERT BANNER (NEOBRUTALIST REDESIGN) */}
      {userProfile?.outstandingBalance > 0 && (
        <Animated.View style={[styles.balanceContainer, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.balanceShadow} />
          <View style={styles.balanceBox}>
            <Text style={styles.balanceIcon}>💸</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.balanceTitle}>OUTSTANDING BALANCE</Text>
              <Text style={styles.balanceMsg}>₱{userProfile.outstandingBalance.toLocaleString()} — SETTLE AT COUNTER</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate("UserProfile")} style={styles.balanceActionButton}>
              <Text style={styles.balanceActionText}>VIEW ➔</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* NEW NEUBRUTALIST HEADER */}
      <View style={styles.headerBox}>
        <Text style={styles.dashboardTitle}>DASHBOARD</Text>
      </View>

      <View style={styles.greetingRow}>
        <View>
          <Text style={styles.welcome}>Hi, {userProfile?.fullName?.split(' ')[0] || 'Member'}! 👋</Text>
          <Text style={styles.subtitle}>
            {activeAppointments.length > 0 ? "COMMAND CENTER ACTIVE" : "YOUR PETS ARE WAITING"}
          </Text>
        </View>
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

      {/* --- FIRST-TIME USER GUIDANCE --- */}
      {!loading && activeAppointments.length === 0 && reminders.length === 0 && (
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyStateShadow} />
          <View style={styles.emptyStateBox}>
            <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 10 }}>🐾</Text>
            <Text style={styles.emptyStateTitle}>WELCOME TO STARBARKS</Text>
            <Text style={styles.emptyStateMsg}>
              Start by adding your pet, then book your first visit.
            </Text>
          </View>
        </View>
      )}

      {/* --- MAIN MENU GRID --- */}
      <Text style={styles.sectionHeader}>⚡ Quick Actions</Text>

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
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: "#FFF8E1", paddingTop: 60 },

  headerBox: { marginBottom: 15 },
  dashboardTitle: {
    fontFamily: "Inter_900Black",
    fontSize: 48,
    color: "#3E2723",
    textTransform: "uppercase",
    letterSpacing: -1.5,
    lineHeight: 48,
  },

  greetingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
  },
  welcome: { fontFamily: "Inter_900Black", fontSize: 24, color: "#3E2723" },
  subtitle: { fontFamily: "Inter_700Bold", fontSize: 13, color: "#8D6E63", marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },
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

  // FIRST-TIME EMPTY STATE
  emptyStateContainer: {
    marginBottom: 25,
    position: 'relative',
  },
  emptyStateShadow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: -2,
    bottom: -2,
    backgroundColor: '#3ABEF9',
  },
  emptyStateBox: {
    padding: 25,
    backgroundColor: 'white',
    borderWidth: 3,
    borderColor: '#3E2723',
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontFamily: 'Inter_900Black',
    fontSize: 16,
    color: '#3E2723',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  emptyStateMsg: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: '#5D4037',
    textAlign: 'center',
  },

  // QUEUE PROGRESS
  queueTag: { backgroundColor: '#3E2723', paddingHorizontal: 10, paddingVertical: 4 },
  queueTagText: { fontWeight: '900', fontSize: 14, color: 'white' },
  queueProgressContainer: { marginTop: 12, borderTopWidth: 2, borderTopColor: '#3E2723', paddingTop: 10 },
  queueProgressBar: { height: 10, backgroundColor: 'rgba(0,0,0,0.1)', borderWidth: 2, borderColor: '#3E2723', overflow: 'hidden', marginBottom: 5 },
  queueProgressFill: { height: '100%' },
  queueAheadText: { fontSize: 12, fontWeight: '900' },
});

export default ClientDashboard;
