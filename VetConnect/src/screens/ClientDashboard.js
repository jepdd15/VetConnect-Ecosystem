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
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { auth, db } from "../../firebaseConfig";

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
    const unsubProfile = onSnapshot(doc(db, "users", auth.currentUser.uid), (doc) => {
      if (doc.exists()) setUserProfile(doc.data());
    });
    return () => unsubProfile();
  }, []);

  // ======================================================================
  // 2. FETCH ACTIVE APPOINTMENTS (The Live Feed)
  // ======================================================================
  useEffect(() => {
    const q = query(
      collection(db, "appointments"),
      where("ownerId", "==", auth.currentUser.uid),
      where("status", "in", [
        "confirmed",
        "arrived",
        "in-consult",
        "confined",
        "billing",
        "dispensing",
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

    // Query for all other arrived patients with a lower queue number for the same day
    const q = query(
      collection(db, "appointments"),
      where("status", "==", "arrived"),
      where("date", "==", arrivedAppt.date) // Assumes date is a string YYYY-MM-DD for equality
    );

    const unsubQueue = onSnapshot(q, (snap) => {
      let ahead = 0;
      snap.forEach(doc => {
        if (doc.data().queueNumber < arrivedAppt.queueNumber) ahead++;
      });
      setQueueAhead(ahead);
    });

    return () => unsubQueue();
  }, [activeAppointments]);

  // ======================================================================
  // 3. FETCH HEALTH REMINDERS
  // ======================================================================
  useEffect(() => {
    try {
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

          snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.nextVisit && typeof data.nextVisit.toDate === "function") {
              const visitDate = data.nextVisit.toDate();
              // Only show reminders that are in the future
              if (visitDate >= now) {
                list.push({ id: doc.id, ...data });
              }
            }
          });
          setReminders(list);
        },
        (error) => console.log("Reminders Error:", error),
      );

      return () => unsubReminders();
    } catch (e) {
      console.log("Index missing for reminders");
    }
  }, []);

  const handleLogout = () => {
    auth.signOut();
    navigation.replace("Login");
  };

  // --- RENDER NOTIFICATION CARDS ---
  const renderNotification = (appt) => {
    let bgColor, title, msg, icon, borderColor;

    switch (appt.status) {
      case "confirmed":
        bgColor = "#E8F5E9";
        borderColor = "#A5D6A7";
        title = "Booking Confirmed";
        msg = `${appt.petName} is scheduled for ${appt.scheduledDate?.toDate().toLocaleDateString()}.`;
        icon = "📅";
        break;
      case "arrived":
        bgColor = "#E3F2FD";
        borderColor = "#90CAF9";
        title = "Checked In";
        msg = `You are in the lobby. Ticket #${appt.ticketPrefix || ""}${appt.queueNumber}.`;
        icon = "🎟️";
        break;
      case "in-consult":
        bgColor = "#FFF3E0";
        borderColor = "#FFCC80";
        title = "In Consultation";
        msg = `${appt.petName} is currently with the Vet.`;
        icon = "🩺";
        break;
      case "dispensing":
        bgColor = "#FFF3E0";
        borderColor = "#FFCC80";
        title = "Pharmacy";
        msg = `Medications are being prepared for ${appt.petName}.`;
        icon = "💊";
        break;
      case "confined":
        bgColor = "#F3E5F5";
        borderColor = "#CE93D8";
        title = "Admitted";
        msg = `${appt.petName} is currently confined at the clinic.`;
        icon = "🏥";
        break;
      case "billing":
        bgColor = "#E8F5E9";
        borderColor = "#A5D6A7";
        title = "Ready for Checkout";
        msg = `Services complete. Please proceed to the front desk.`;
        icon = "💰";
        break;
      default:
        return null;
    }

    return (
      <TouchableOpacity
        key={appt.id}
        style={[
          styles.notifCard,
          { backgroundColor: bgColor, borderColor: borderColor, borderLeftWidth: 6 },
        ]}
        onPress={() => navigation.navigate("ClientAppointments")}
      >
        <View style={styles.iconCircle}>
          <Text style={styles.notifIcon}>{icon}</Text>
        </View>
        <View style={styles.notifContent}>
           <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
             <Text style={styles.notifTitle}>{title}</Text>
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
                <View style={[styles.queueProgressFill, { width: queueAhead === 0 ? '100%' : '60%' }]} />
              </View>
              <Text style={styles.queueAheadText}>
                {queueAhead === 0 ? "You're next in line! 🎉" : `${queueAhead} pets ahead of you`}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.arrow}>➔</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* BALANCE ALERT BANNER */}
      {userProfile?.outstandingBalance > 0 && (
        <Animated.View style={[styles.balanceBanner, { transform: [{ scale: pulseAnim }] }]}>
          <LinearGradient colors={["#D32F2F", "#B71C1C"]} style={styles.balanceGradient}>
            <Text style={styles.balanceIcon}>💸</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.balanceTitle}>Outstanding Balance</Text>
              <Text style={styles.balanceMsg}>₱{userProfile.outstandingBalance.toLocaleString()} — Please settle at the counter.</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate("UserProfile")}>
              <Text style={styles.balanceAction}>VIEW ➔</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      )}

      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Hi, {userProfile?.fullName?.split(' ')[0] || 'Member'}! 👋</Text>
          <Text style={styles.subtitle}>
            {activeAppointments.length > 0 ? "Your visit is in progress." : "Your pets are waiting for you!"}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.profileIcon}
          onPress={() => navigation.navigate("UserProfile")}
        >
          <Text style={{ fontSize: 22 }}>👤</Text>
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
          {/* Only show the single most urgent reminder to save space */}
          {reminders.slice(0, 1).map((rec) => (
            <View
              key={rec.id}
              style={[
                styles.notifCard,
                { backgroundColor: "#E1F5FE", borderColor: "#81D4FA" },
              ]}
            >
              <View style={[styles.iconCircle, { backgroundColor: "#B3E5FC" }]}>
                <Text style={{ fontSize: 20 }}>💉</Text>
              </View>
              <View style={styles.notifContent}>
                <Text style={[styles.notifTitle, { color: "#0277BD" }]}>
                  Due: {rec.petName}
                </Text>
                <Text style={styles.notifMsg}>
                  Scheduled for: {rec.nextVisit.toDate().toLocaleDateString()}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* --- MAIN MENU GRID --- */}
      <Text style={styles.sectionHeader}>⚡ Quick Actions</Text>

      <View style={styles.grid}>
        <TouchableOpacity
          style={styles.cardWrapper}
          onPress={() => navigation.navigate("MyPets")}
        >
          <LinearGradient colors={["#8D6E63", "#5D4037"]} style={styles.card}>
            <Text style={styles.cardIcon}>🐾</Text>
            <Text style={styles.cardText}>My Pets</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cardWrapper}
          onPress={() => navigation.navigate("BookAppointment")}
        >
          <LinearGradient colors={["#8D6E63", "#5D4037"]} style={styles.card}>
            <Text style={styles.cardIcon}>📅</Text>
            <Text style={styles.cardText}>Schedule Visit</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cardWrapper}
          onPress={() => navigation.navigate("ClientAppointments")}
        >
          <LinearGradient colors={["#8D6E63", "#5D4037"]} style={styles.card}>
            <Text style={styles.cardIcon}>🎫</Text>
            <Text style={styles.cardText}>My Bookings</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cardWrapper}
          onPress={() => navigation.navigate("QueueScreen")}
        >
          <LinearGradient colors={["#8D6E63", "#5D4037"]} style={styles.card}>
            <Text style={styles.cardIcon}>🔢</Text>
            <Text style={styles.cardText}>Live Queue</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cardWrapper}
          onPress={() => navigation.navigate("Chatbot")}
        >
          <LinearGradient colors={["#1976D2", "#1565C0"]} style={styles.card}>
            <Text style={styles.cardIcon}>🤖</Text>
            <Text style={styles.cardText}>Help Center</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cardWrapper}
          onPress={handleLogout}
        >
          <LinearGradient colors={["#EF5350", "#D32F2F"]} style={styles.card}>
            <Text style={styles.cardIcon}>🚪</Text>
            <Text style={styles.cardText}>Logout</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: "#FFF8E1" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 25,
    marginTop: 10,
  },
  welcome: { fontSize: 26, fontWeight: "bold", color: "#5D4037" },
  subtitle: { fontSize: 15, color: "#8B4513", marginTop: 2 },
  profileIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#D7CCC8",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },

  sectionHeader: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#8D6E63",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  feedSection: { marginBottom: 20 },
  notifCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 15,
    marginBottom: 10,
    borderWidth: 1,
    elevation: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 15,
  },
  notifIcon: { fontSize: 20 },
  notifContent: { flex: 1 },
  notifTitle: {
    fontWeight: "bold",
    fontSize: 15,
    color: "#333",
    marginBottom: 2,
  },
  notifMsg: { fontSize: 13, color: "#555" },
  arrow: { fontSize: 18, color: "#aaa", fontWeight: "bold" },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  cardWrapper: {
    width: "48%",
    marginBottom: 15,
  },
  card: {
    paddingVertical: 25,
    borderRadius: 24, // Smoother corners for premium look
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardIcon: { fontSize: 36, marginBottom: 10 },
  cardText: { color: "white", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },

  // BALANCE BANNER
  balanceBanner: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 5,
  },
  balanceGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
  },
  balanceIcon: { fontSize: 28, marginRight: 15 },
  balanceTitle: { color: "white", fontWeight: "900", fontSize: 16 },
  balanceMsg: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },
  balanceAction: { color: "white", fontWeight: "900", fontSize: 12, marginLeft: 10 },

  // QUEUE PROGRESS
  queueTag: { backgroundColor: 'rgba(0,0,0,0.1)', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10 },
  queueTagText: { fontWeight: '900', fontSize: 12, color: '#333' },
  queueProgressContainer: { marginTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 10 },
  queueProgressBar: { height: 6, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 3, overflow: 'hidden', marginBottom: 5 },
  queueProgressFill: { height: '100%', backgroundColor: '#1976D2', borderRadius: 3 },
  queueAheadText: { fontSize: 11, fontWeight: '700', color: '#1976D2' },
});

export default ClientDashboard;
