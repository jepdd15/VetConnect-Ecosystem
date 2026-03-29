// The Live Lobby.
// Listens to the daily_queue document in real-time, allowing the user to see
// the "Now Serving" number from their phone without crowding the clinic lobby.

import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";

export default function QueueScreen() {
  const [queueData, setQueueData] = useState(null);
  const [myTicket, setMyTicket] = useState(null);
  const [lobbyPatients, setLobbyPatients] = useState([]);

  // 1. Listen to Global Queue (Now Serving)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "queue", "daily_queue"), (doc) => {
      if (doc.exists()) setQueueData(doc.data());
    });
    return () => unsub();
  }, []);

  // 2. Listen to MY Ticket
  useEffect(() => {
    const q = query(
      collection(db, "appointments"),
      where("ownerId", "==", auth.currentUser.uid),
      where("status", "in", ["confirmed", "arrived"]),
    );

    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        // If they have multiple pets checked in, just track the earliest ticket for the UI
        const sortedDocs = snapshot.docs
          .map((d) => d.data())
          .sort((a, b) => (a.queueNumber || 999) - (b.queueNumber || 999));
        setMyTicket(sortedDocs[0]);
      } else {
        setMyTicket(null);
      }
    });
    return () => unsub();
  }, []);

  // 3. Listen to everyone in the lobby to calculate accurate wait times
  useEffect(() => {
    const qLobby = query(
      collection(db, "appointments"),
      where("status", "in", ["arrived", "in-consult"]),
    );

    const unsubLobby = onSnapshot(qLobby, (snapshot) => {
      setLobbyPatients(snapshot.docs.map((d) => d.data()));
    });
    return () => unsubLobby();
  }, []);

  if (!queueData)
    return (
      <ActivityIndicator size="large" color="#8B4513" style={{ flex: 1 }} />
    );

  // --- SMART WAIT TIME ALGORITHM ---
  let peopleAhead = 0;
  let estWaitTimeMins = 0;

  if (myTicket && myTicket.queueNumber) {
    // A. Find all patients ahead of me
    const patientsAhead = lobbyPatients.filter((p) => {
      // 1. Emergencies skip everyone. If an emergency is in the lobby, count them.
      if (p.priority === "high" && myTicket.priority !== "high") return true;

      // 2. Standard Queue Math: Only count them if their ticket # is lower than mine
      if (p.queueNumber && p.queueNumber < myTicket.queueNumber) return true;

      return false;
    });

    peopleAhead = patientsAhead.length;

    // B. Calculate True Duration
    patientsAhead.forEach((p) => {
      if (p.priority === "high") {
        // [TRIAGE PENALTY]: Emergencies disrupt the clinic. Add a heavy buffer.
        estWaitTimeMins += 60;
      } else if (p.serviceDuration) {
        // [DYNAMIC DURATION]: Read the exact minutes defined by Admin for this service
        estWaitTimeMins += parseInt(p.serviceDuration);
      } else {
        // Fallback for old data
        estWaitTimeMins += 30;
      }
    });
  }

  // Format Global Number safely (e.g. A-5, W-6)
  const currentServingDisplay = queueData.currentServing
    ? `${queueData.currentPrefix || ""}${queueData.currentServing}`
    : "0";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Clinic Queue Monitor 📺</Text>

      {/* --- GLOBAL DISPLAY --- */}
      <View style={styles.circle}>
        <Text style={styles.label}>Now Serving</Text>
        <Text style={styles.bigNumber}>{currentServingDisplay}</Text>
        <View
          style={[
            styles.statusBadge,
            queueData.status === "active" ? styles.active : styles.paused,
          ]}
        >
          <Text style={styles.statusText}>
            {queueData.status.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* --- PERSONAL DISPLAY --- */}
      {myTicket ? (
        <View style={styles.myTicketBox}>
          {!myTicket.queueNumber ? (
            <View style={{ alignItems: "center" }}>
              <Text style={styles.ticketLabel}>Appointment Confirmed ✅</Text>
              <Text style={styles.subText}>
                Please proceed to the clinic. Your ticket will be issued upon
                arrival.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.ticketLabel}>🎟️ Your Ticket Number</Text>
              <Text style={styles.ticketNumber}>
                {myTicket.ticketPrefix || ""}
                {myTicket.queueNumber}
              </Text>

              <View style={styles.infoBox}>
                {peopleAhead <= 0 ? (
                  <View style={{ alignItems: "center" }}>
                    <Text style={styles.readyText}>✅ IT'S YOUR TURN!</Text>
                    <Text style={styles.subText}>
                      Please proceed to the consultation room.
                    </Text>
                  </View>
                ) : (
                  <View style={{ alignItems: "center" }}>
                    <Text style={styles.waitingText}>Please Wait...</Text>
                    <Text style={styles.subText}>
                      There are{" "}
                      <Text style={{ fontWeight: "bold", color: "#8B4513" }}>
                        {peopleAhead} patient(s)
                      </Text>{" "}
                      ahead of you.
                    </Text>

                    {/* ACCURATE WAIT TIME UI */}
                    <View style={styles.estBox}>
                      <Text style={styles.estLabel}>Estimated Wait Time:</Text>
                      <Text style={styles.estTime}>
                        ~ {estWaitTimeMins} mins
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      ) : (
        <View style={styles.noTicketBox}>
          <Text style={styles.noTicketText}>You are not in the queue.</Text>
          <Text style={styles.noTicketSub}>
            Book an appointment to get started.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: "#FFF8E1",
    alignItems: "center",
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#5D4037",
    marginBottom: 30,
    marginTop: 10,
  },

  circle: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    borderWidth: 8,
    borderColor: "#8B4513",
    marginBottom: 40,
  },
  label: {
    fontSize: 16,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bigNumber: { fontSize: 80, fontWeight: "bold", color: "#3E2723" },

  statusBadge: {
    position: "absolute",
    bottom: 30,
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 20,
  },
  active: { backgroundColor: "#4CAF50" },
  paused: { backgroundColor: "#F44336" },
  statusText: { color: "white", fontWeight: "bold", fontSize: 12 },

  myTicketBox: {
    width: "100%",
    alignItems: "center",
    padding: 25,
    backgroundColor: "#EFEBE9",
    borderRadius: 20,
    elevation: 3,
  },
  ticketLabel: { fontSize: 18, color: "#5D4037", fontWeight: "bold" },
  ticketNumber: {
    fontSize: 60,
    fontWeight: "bold",
    color: "#1565C0",
    marginVertical: 10,
  },

  infoBox: {
    marginTop: 10,
    width: "100%",
    alignItems: "center",
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#D7CCC8",
  },
  readyText: {
    color: "#2E7D32",
    fontWeight: "bold",
    fontSize: 22,
    marginBottom: 5,
  },
  waitingText: {
    color: "#E65100",
    fontWeight: "bold",
    fontSize: 20,
    marginBottom: 5,
  },
  subText: { color: "#5D4037", textAlign: "center", fontSize: 15 },

  estBox: {
    backgroundColor: "#FFF3E0",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FFB74D",
    width: "100%",
  },
  estLabel: {
    fontSize: 12,
    color: "#E65100",
    textTransform: "uppercase",
    fontWeight: "bold",
  },
  estTime: { fontSize: 22, color: "#D32F2F", fontWeight: "bold", marginTop: 2 },

  noTicketBox: { marginTop: 20, padding: 20, alignItems: "center" },
  noTicketText: { fontSize: 18, fontWeight: "bold", color: "#aaa" },
  noTicketSub: {
    textAlign: "center",
    color: "#bbb",
    marginTop: 5,
    paddingHorizontal: 20,
  },
});
