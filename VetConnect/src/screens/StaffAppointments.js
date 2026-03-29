// The Triage Inbox.
// Displays all incoming "Pending" requests from the mobile app. Allows a veterinarian to quickly Review,
// Accept, or Reject (with a required reason) bookings while on the move.

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../firebaseConfig";

const StaffAppointments = ({ navigation }) => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. Fetch All Appointments (Ordered by Date)
  useEffect(() => {
    const q = query(
      collection(db, "appointments"),
      orderBy("createdAt", "desc"),
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setAppointments(list);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // 2. LOGIC A: Just Confirm (Scheduling Phase)
  // No ticket assigned yet. Just locking the slot.
  const handleAccept = async (id) => {
    try {
      await updateDoc(doc(db, "appointments", id), {
        status: "confirmed",
      });
      Alert.alert(
        "Confirmed",
        "Booking accepted. Wait for patient to arrive to assign ticket.",
      );
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  // 3. LOGIC B: Check-In / Arrival (Queueing Phase)
  // This is where the Ticket Number is generated.
  const handleArrived = async (id) => {
    try {
      await runTransaction(db, async (transaction) => {
        // A. Read Queue Counter
        const queueRef = doc(db, "queue", "daily_queue");
        const queueDoc = await transaction.get(queueRef);

        if (!queueDoc.exists())
          throw "Queue data missing! Reset queue in settings.";

        // B. Generate Next Number
        const currentLastNumber = queueDoc.data().lastNumberIssued || 0;
        const newQueueNumber = currentLastNumber + 1;

        // C. Update Counter
        transaction.update(queueRef, { lastNumberIssued: newQueueNumber });

        // D. Update Appointment
        const appointmentRef = doc(db, "appointments", id);
        transaction.update(appointmentRef, {
          status: "arrived",
          queueNumber: newQueueNumber,
        });
      });

      Alert.alert("Checked In", "Patient marked as Arrived. Ticket Assigned!");
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  // 4. LOGIC C: Reject
  const handleReject = async (id) => {
    try {
      await updateDoc(doc(db, "appointments", id), {
        status: "cancelled",
        rejectReason: "Declined by Staff App", // Default reason if quick-rejecting
      });
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <Text style={styles.petName}>
          {item.petName} ({item.petSpecies})
        </Text>
        <Text
          style={[
            styles.status,
            item.status === "confirmed"
              ? styles.green
              : item.status === "arrived"
                ? styles.blue
                : item.status === "completed"
                  ? styles.blue
                  : item.status === "cancelled"
                    ? styles.red
                    : styles.orange,
          ]}
        >
          {item.status.toUpperCase()}
        </Text>
      </View>

      {/* Details */}
      <Text style={styles.service}>{item.serviceType}</Text>

      {/* Digital Triage Note */}
      {item.notes ? (
        <Text style={styles.notes}>{`📝 "${item.notes}"`}</Text>
      ) : null}

      <Text style={styles.date}>Request ID: {item.id.slice(0, 6)}...</Text>

      {/* Ticket Display (Only if Arrived) */}
      {item.queueNumber && (
        <View style={styles.ticketBadge}>
          <Text style={styles.ticketText}>🎟️ Ticket #{item.queueNumber}</Text>
        </View>
      )}

      {/* Rejection Reason (If Cancelled) */}
      {item.status === "cancelled" && item.rejectReason && (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonText}>Reason: {item.rejectReason}</Text>
        </View>
      )}

      {/* --- ACTION BUTTONS --- */}

      {/* 1. PENDING: Accept / Reject */}
      {item.status === "pending" && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnApprove]}
            onPress={() => handleAccept(item.id)}
          >
            <Text style={styles.btnText}>✓ Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnReject]}
            onPress={() => handleReject(item.id)}
          >
            <Text style={styles.btnText}>✗ Reject</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 2. CONFIRMED: Mark Arrived (Bridge to Queue) */}
      {item.status === "confirmed" && (
        <TouchableOpacity
          style={[styles.btnFull, styles.btnArrived]}
          onPress={() => handleArrived(item.id)}
        >
          <Text style={styles.btnText}>🚶 Mark Arrived (Check In)</Text>
        </TouchableOpacity>
      )}

      {/* 3. ARRIVED: Start Consultation (Clinical) */}
      {item.status === "arrived" && (
        <TouchableOpacity
          style={[styles.btnFull, styles.btnConsult]}
          onPress={() =>
            navigation.navigate("Consultation", {
              appointmentId: item.id,
              petId: item.petId,
              petName: item.petName,
              ownerId: item.ownerId,
            })
          }
        >
          <Text style={styles.btnText}>🩺 Start Consultation</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#3E2723" />
      ) : (
        <FlatList
          data={appointments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", marginTop: 20, color: "#888" }}>
              No bookings found.
            </Text>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#EFEBE9" },
  card: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    elevation: 2,
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  petName: { fontSize: 18, fontWeight: "bold", color: "#3E2723" },

  status: { fontWeight: "bold", fontSize: 12 },
  green: { color: "green" },
  red: { color: "red" },
  orange: { color: "#F57C00" },
  blue: { color: "#1976D2" },

  service: { fontSize: 16, color: "#5D4037", marginVertical: 5 },
  notes: { fontStyle: "italic", color: "#555", marginBottom: 5 },
  date: { color: "#888", fontSize: 12 },

  ticketBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#FFF3E0",
    padding: 5,
    borderRadius: 5,
    marginTop: 5,
    borderWidth: 1,
    borderColor: "#FFB74D",
  },
  ticketText: { color: "#E65100", fontWeight: "bold" },

  reasonBox: {
    marginTop: 5,
    padding: 5,
    backgroundColor: "#FFEBEE",
    borderRadius: 4,
  },
  reasonText: { color: "#C62828", fontSize: 12, fontStyle: "italic" },

  // Buttons
  actionRow: {
    flexDirection: "row",
    marginTop: 15,
    justifyContent: "space-around",
  },
  btn: { padding: 10, borderRadius: 5, width: "45%", alignItems: "center" },
  btnApprove: { backgroundColor: "#2E7D32" },
  btnReject: { backgroundColor: "#C62828" },

  btnFull: {
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 15,
    width: "100%",
  },
  btnArrived: { backgroundColor: "#0288D1" }, // Blue for Logistics
  btnConsult: { backgroundColor: "#5D4037" }, // Brown for Medical

  btnText: { color: "white", fontWeight: "bold" },
});

export default StaffAppointments;
