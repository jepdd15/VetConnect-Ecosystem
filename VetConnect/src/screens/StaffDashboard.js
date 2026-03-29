// The launchpad for clinic personnel. Provides quick access to queue management, scanning, and
// incoming appointment requests.

import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../../firebaseConfig";

const StaffDashboard = ({ navigation }) => {
  const handleLogout = () => {
    auth.signOut();
    navigation.replace("Login");
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Starbarks Staff</Text>
          <Text style={styles.subtitle}>{auth.currentUser?.email}</Text>
        </View>
        <View style={styles.profileIcon}>
          <Text style={{ fontSize: 20 }}>🏥</Text>
        </View>
      </View>

      <Text style={styles.sectionHeader}>📌 Clinic Operations</Text>

      {/* 1. MANAGE QUEUE & APPOINTMENTS */}
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate("StaffAppointments")}
      >
        <Text style={styles.cardIcon}>📋</Text>
        <View style={styles.cardContent}>
          <Text style={styles.cardText}>Queue & Requests</Text>
          <Text style={styles.cardSub}>Accept bookings & start consults</Text>
        </View>
        <Text style={styles.arrow}>➔</Text>
      </TouchableOpacity>

      {/* 2. QR SCANNER (FAST CHECK-IN) */}
      <TouchableOpacity
        style={[styles.card, { backgroundColor: "#1565C0" }]}
        onPress={() => navigation.navigate("Scanner")}
      >
        <Text style={styles.cardIcon}>📷</Text>
        <View style={styles.cardContent}>
          <Text style={styles.cardText}>Scan QR Code</Text>
          <Text style={styles.cardSub}>Fast check-in for arriving clients</Text>
        </View>
        <Text style={styles.arrow}>➔</Text>
      </TouchableOpacity>

      {/* 3. WEB ADMIN REMINDER */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          💡 Note: For full Inventory, POS, and CRM management, please log in to
          the Web Admin Panel on a desktop computer.
        </Text>
      </View>

      {/* 4. LOGOUT */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutIcon}>🚪</Text>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: "#EFEBE9" }, // Taupe background for Staff

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
    marginTop: 10,
  },
  welcome: { fontSize: 26, fontWeight: "bold", color: "#3E2723" }, // Dark brown
  subtitle: { fontSize: 14, color: "#5D4037", fontStyle: "italic" },
  profileIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#D7CCC8",
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },

  sectionHeader: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#3E2723",
    marginBottom: 15,
  },

  // CARD STYLES
  card: {
    backgroundColor: "#4E342E",
    width: "100%",
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    elevation: 3,
  },
  cardIcon: { fontSize: 30, marginRight: 15 },
  cardContent: { flex: 1 },
  cardText: { color: "white", fontSize: 18, fontWeight: "bold" },
  cardSub: { color: "#D7CCC8", fontSize: 13, marginTop: 2 },
  arrow: { color: "rgba(255,255,255,0.5)", fontSize: 20, fontWeight: "bold" },

  // INFO BOX
  infoBox: {
    backgroundColor: "#E3F2FD",
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#1976D2",
    marginTop: 10,
    marginBottom: 30,
  },
  infoText: {
    color: "#1565C0",
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 20,
  },

  // LOGOUT
  logoutBtn: {
    backgroundColor: "#D32F2F",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
    borderRadius: 12,
    elevation: 2,
  },
  logoutIcon: { fontSize: 20, marginRight: 10 },
  logoutText: { color: "white", fontWeight: "bold", fontSize: 16 },
});

export default StaffDashboard;
