// Allows a roaming staff member or veterinarian to increment the "Now Serving" ticket number,
// or pause the queue, directly from their pocket without needing to return to the Web Admin PC.

import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../firebaseConfig";

const ManageQueueScreen = () => {
  const [queueData, setQueueData] = useState(null);

  // 1. Listen to the Queue in Real-Time
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "queue", "daily_queue"), (doc) => {
      setQueueData(doc.data());
    });
    return () => unsub();
  }, []);

  // 2. Logic to Next Number
  const handleNext = async () => {
    try {
      const newNumber = queueData.currentServing + 1;
      await updateDoc(doc(db, "queue", "daily_queue"), {
        currentServing: newNumber,
      });
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  // 3. Logic to Reset (Start of Day)
  const handleReset = async () => {
    try {
      await updateDoc(doc(db, "queue", "daily_queue"), {
        currentServing: 0,
        lastNumberIssued: 0,
        status: "active",
      });
      Alert.alert("Queue Reset", "Ready for a new day!");
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  if (!queueData)
    return (
      <ActivityIndicator size="large" color="#8B4513" style={{ flex: 1 }} />
    );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Queue Control 🎛️</Text>

      <View style={styles.displayBox}>
        <Text style={styles.label}>Now Serving:</Text>
        <Text style={styles.bigNumber}>{queueData.currentServing}</Text>
      </View>

      <TouchableOpacity style={styles.btnNext} onPress={handleNext}>
        <Text style={styles.btnText}>🔔 Call Next Patient</Text>
      </TouchableOpacity>

      <View style={styles.row}>
        <TouchableOpacity style={styles.btnSmall} onPress={handleReset}>
          <Text style={styles.btnTextSmall}>Reset Queue</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnSmall, { backgroundColor: "#555" }]}
        >
          <Text style={styles.btnTextSmall}>
            {queueData.status.toUpperCase()}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#EFEBE9",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#3E2723",
    marginBottom: 30,
  },
  displayBox: {
    backgroundColor: "white",
    width: "100%",
    padding: 30,
    borderRadius: 15,
    alignItems: "center",
    marginBottom: 30,
    elevation: 3,
  },
  label: { fontSize: 18, color: "#5D4037" },
  bigNumber: { fontSize: 80, fontWeight: "bold", color: "#8B4513" },

  btnNext: {
    backgroundColor: "#2E7D32",
    width: "100%",
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 20,
    elevation: 5,
  },
  btnText: { color: "white", fontSize: 22, fontWeight: "bold" },

  row: { flexDirection: "row", width: "100%", justifyContent: "space-between" },
  btnSmall: {
    backgroundColor: "#C62828",
    width: "48%",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  btnTextSmall: { color: "white", fontWeight: "bold" },
});

export default ManageQueueScreen;
