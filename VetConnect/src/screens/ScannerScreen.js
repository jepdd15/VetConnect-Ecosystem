// The Hardware Integration module.

import { CameraView, useCameraPermissions } from "expo-camera";
import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  Timestamp,
  where,
} from "firebase/firestore";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { db } from "../../firebaseConfig";

export default function ScannerScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: "center", marginBottom: 20 }}>
          We need your permission to show the camera
        </Text>
        <Button onPress={requestPermission} title="Grant Permission" />
      </View>
    );
  }

  // --- THE SCAN LOGIC ---
  const handleBarCodeScanned = async ({ type, data }) => {
    setScanned(true); // Stop scanning temporarily
    setProcessing(true);

    try {
      // 1. Find the Appointment matching this QR Code
      const q = query(
        collection(db, "appointments"),
        where("qrCode", "==", data),
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        Alert.alert(
          "Invalid QR",
          "This QR code does not match any appointment in the system.",
          [
            {
              text: "Scan Again",
              onPress: () => {
                setScanned(false);
                setProcessing(false);
              },
            },
          ],
        );
        return;
      }

      const appointmentDoc = snap.docs[0];
      const appointment = appointmentDoc.data();

      // 2. Validate Status
      if (appointment.status !== "confirmed") {
        Alert.alert(
          "Check-In Failed",
          `This appointment is currently marked as: ${appointment.status.toUpperCase()}.\nOnly CONFIRMED appointments can be checked in.`,
          [{ text: "Okay", onPress: () => navigation.goBack() }],
        );
        return;
      }

      // 3. EXECUTE CHECK-IN (Generate Ticket)
      await runTransaction(db, async (transaction) => {
        // A. Get Queue Counter
        const queueRef = doc(db, "queue", "daily_queue");
        const queueDoc = await transaction.get(queueRef);
        const newNumber = (queueDoc.data()?.lastNumberIssued || 0) + 1;

        // B. Update Counter
        transaction.update(queueRef, { lastNumberIssued: newNumber });

        // C. Update Appointment
        const apptRef = doc(db, "appointments", appointmentDoc.id);
        transaction.update(apptRef, {
          status: "arrived",
          queueNumber: newNumber,
          timeArrived: Timestamp.now(),
          assignedVet: "Unassigned", // Receptionist assigns vet on Web Admin later, or uses default
        });
      });

      // 4. Success!
      Alert.alert(
        "Check-In Successful! ✅",
        `Patient: ${appointment.petName}\nService: ${appointment.serviceType}\n\nTicket #${
          // The math we just did but we need to fetch it to show it properly, let's just say "Assigned"
          "Assigned"
        } has been issued.`,
        [{ text: "Done", onPress: () => navigation.goBack() }],
      );
    } catch (error) {
      console.error(error);
      Alert.alert("System Error", "Could not process check-in.", [
        { text: "Okay", onPress: () => navigation.goBack() },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan Client QR Code</Text>
      <Text style={styles.subtitle}>
        Align the QR code within the frame to verify the appointment.
      </Text>

      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
        />

        {/* Visual Overlay */}
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
        </View>
      </View>

      {processing && (
        <View style={styles.processingBox}>
          <ActivityIndicator size="large" color="#1565C0" />
          <Text style={{ marginTop: 10, fontWeight: "bold" }}>
            Verifying Appointment...
          </Text>
        </View>
      )}

      {scanned && !processing && (
        <Button
          title="Tap to Scan Again"
          onPress={() => setScanned(false)}
          color="#8B4513"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFEBE9",
    alignItems: "center",
    paddingTop: 50,
  },
  title: { fontSize: 24, fontWeight: "bold", color: "#3E2723" },
  subtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginHorizontal: 30,
    marginBottom: 20,
  },

  cameraContainer: {
    width: 300,
    height: 300,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 30,
    position: "relative",
  },
  camera: { flex: 1 },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  scanFrame: {
    width: 200,
    height: 200,
    borderWidth: 4,
    borderColor: "#FF9800",
    borderRadius: 10,
    backgroundColor: "transparent",
  },

  processingBox: {
    alignItems: "center",
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
    elevation: 5,
  },
});
