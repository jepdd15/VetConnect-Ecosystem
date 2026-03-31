import { MaterialIcons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { db } from "../../firebaseConfig";

export default function PetHistoryScreen({ route, navigation }) {
  const { petId, petName } = route.params;
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "medical_records"),
      where("petId", "==", petId),
      orderBy("date", "desc"),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // THE ARCHITECTURAL FIX: We no longer do N+1 Queries!
        // We expect 'prescriptions' and 'serviceType' to live natively on this document.
        records.push({
          id: docSnap.id,
          ...data,
          prescriptions: data.prescriptions || [],
          serviceType:
            data.serviceType ||
            (data.recordType === "grooming" ? "Grooming" : "Clinical Visit"),
        });
      });
      setHistory(records);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [petId]);

  // --- PDF GENERATOR (Preserved exactly as you built it) ---
  const generatePDF = async (record) => {
    const dateStr = record.date?.toDate
      ? record.date.toDate().toLocaleDateString()
      : "Unknown Date";
    let rxHtml = "";
    if (record.prescriptions && record.prescriptions.length > 0) {
      rxHtml = `<h3>E-Prescriptions</h3><ul>${record.prescriptions.map((rx) => `<li><b>${rx.name}</b>: ${rx.instructions || "Use as directed"}</li>`).join("")}</ul>`;
    }

    const htmlContent = `
      <html>
        <body style="font-family: Helvetica, Arial, sans-serif; padding: 40px; color: #333;">
          <h1 style="color: #8B4513; text-align: center; border-bottom: 2px solid #8B4513; padding-bottom: 10px;">Starbarks Veterinary Clinic</h1>
          <h2 style="text-align: center; margin-top: 0;">Visit Summary</h2>
          <table style="width: 100%; margin-bottom: 30px;">
            <tr><td><b>Patient:</b> ${petName}</td><td style="text-align: right;"><b>Date:</b> ${dateStr}</td></tr>
            <tr><td><b>Service:</b> ${record.serviceType}</td><td style="text-align: right;"><b>Attending Vet:</b> ${record.vetName || "Staff"}</td></tr>
          </table>
          <h3>Clinical Notes</h3>
          <p><b>Owner Reported:</b> ${record.soap?.subjective || "None recorded."}</p>
          <p><b>Physical Exam:</b> ${record.soap?.objectiveNotes || "None recorded."}</p>
          <h3>Vitals</h3>
          <p><b>Weight:</b> ${record.vitals?.weight || "-"} kg &nbsp;&nbsp; | &nbsp;&nbsp; <b>Temp:</b> ${record.vitals?.temp || "-"} °C &nbsp;&nbsp; | &nbsp;&nbsp; <b>Heart Rate:</b> ${record.vitals?.hr || "-"} bpm</p>
          <h3>Diagnosis & Assessment</h3>
          <p><b>Status:</b> ${record.patientStatus || "Stable"}</p>
          <p>${record.diagnosis || "None recorded."}</p>
          <h3>Treatment Plan & Instructions</h3>
          <p>${record.treatment || "None recorded."}</p>
          ${rxHtml}
          ${record.nextVisit ? `<h3 style="color: #D32F2F;">Next Follow-Up Due: ${new Date(record.nextVisit.seconds * 1000).toLocaleDateString()}</h3>` : ""}
          <hr style="margin-top: 50px;" />
          <p style="text-align: center; font-size: 12px; color: #888;">This is an electronically generated medical record and does not require a physical signature.</p>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, {
        UTI: ".pdf",
        mimeType: "application/pdf",
      });
    } catch (error) {
      Alert.alert("Error generating PDF", error.message);
    }
  };

  const handleOpenAttachment = (url) => {
    Linking.openURL(url).catch(() =>
      Alert.alert("Error", "Cannot open this file."),
    );
  };

  const getStatusColors = (status) => {
    if (!status) return { bg: "#E8F5E9", border: "#A5D6A7", text: "#2E7D32" };
    const s = status.toLowerCase();
    if (s.includes("critical"))
      return { bg: "#FFEBEE", border: "#EF9A9A", text: "#C62828" };
    if (s.includes("guarded"))
      return { bg: "#FFF3E0", border: "#FFCC80", text: "#E65100" };
    return { bg: "#E8F5E9", border: "#A5D6A7", text: "#2E7D32" };
  };

  const renderRecord = ({ item }) => {
    const visitDate = item.date?.toDate
      ? item.date
          .toDate()
          .toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
      : "Unknown Date";
    const isGrooming =
      item.recordType === "grooming" ||
      item.serviceType?.toLowerCase().includes("grooming");

    // Semantic Theme Colors
    const themeColor = isGrooming ? "#9C27B0" : "#1565C0";
    const themeBg = isGrooming ? "#F3E5F5" : "#E3F2FD";

    const hasWeight =
      item.vitals?.weight && item.vitals.weight.toString().trim() !== "";
    const hasTemp =
      item.vitals?.temp && item.vitals.temp.toString().trim() !== "";
    const hasHR = item.vitals?.hr && item.vitals.hr.toString().trim() !== "";
    const hasVitals = hasWeight || hasTemp || hasHR;

    const statusColors = getStatusColors(item.patientStatus);

    return (
      <View style={styles.timelineRow}>
        <View style={styles.timelineGraphic}>
          <View style={[styles.dot, { backgroundColor: themeColor }]} />
          <View style={styles.line} />
        </View>

        <View style={styles.recordCard}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dateText, { color: themeColor }]}>
                {visitDate}
              </Text>
              <Text style={styles.serviceText}>{item.serviceType}</Text>
            </View>
            <View style={styles.vetBadge}>
              <MaterialIcons name="person" size={14} color="#5D4037" />
              <Text style={styles.vetText}>
                {item.vetName || "Clinic Staff"}
              </Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            {item.soap?.subjective && item.soap.subjective.trim() !== "" && (
              <View style={styles.subjectiveBox}>
                <Text style={styles.subjectiveLabel}>
                  REPORTED SYMPTOMS / HISTORY:
                </Text>
                <Text style={styles.subjectiveText}>
                  "
                  {item.soap.subjective
                    .replace('Client noted: "', "")
                    .replace('"\n\n', "")}
                  "
                </Text>
              </View>
            )}

            <View style={styles.diagnosisContainer}>
              {item.patientStatus && !isGrooming && (
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: statusColors.bg,
                      borderColor: statusColors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.statusText, { color: statusColors.text }]}
                  >
                    {item.patientStatus.toUpperCase()}
                  </Text>
                </View>
              )}
              <Text
                style={[
                  styles.diagnosisText,
                  { color: isGrooming ? "#7B1FA2" : "#3E2723" },
                ]}
              >
                {item.diagnosis ||
                  (isGrooming ? "Grooming Services" : "Consultation")}
              </Text>
            </View>

            {!isGrooming && hasVitals && (
              <View style={styles.vitalsBox}>
                {hasWeight && (
                  <View style={styles.vitalItem}>
                    <Text style={styles.vitalLabel}>WEIGHT</Text>
                    <Text style={styles.vitalValue}>
                      {item.vitals.weight} kg
                    </Text>
                  </View>
                )}
                {hasTemp && (
                  <View style={styles.vitalItem}>
                    <Text style={styles.vitalLabel}>TEMP</Text>
                    <Text style={styles.vitalValue}>{item.vitals.temp} °C</Text>
                  </View>
                )}
                {hasHR && (
                  <View style={styles.vitalItem}>
                    <Text style={styles.vitalLabel}>HR</Text>
                    <Text style={styles.vitalValue}>{item.vitals.hr} bpm</Text>
                  </View>
                )}
              </View>
            )}

            <View
              style={[
                styles.planBox,
                { borderLeftColor: themeColor, backgroundColor: themeBg },
              ]}
            >
              <Text style={[styles.planLabel, { color: themeColor }]}>
                {isGrooming
                  ? "GROOMING NOTES:"
                  : "TREATMENT PLAN & INSTRUCTIONS:"}
              </Text>
              <Text style={styles.planText}>
                {item.treatment || "No specific instructions."}
              </Text>
            </View>

            {item.prescriptions && item.prescriptions.length > 0 && (
              <View style={styles.rxBox}>
                <Text style={styles.rxTitle}>💊 Prescribed Medications:</Text>
                {item.prescriptions.map((rx, idx) => (
                  <View key={idx} style={styles.rxItem}>
                    <Text style={styles.rxName}>• {rx.name}</Text>
                    <Text style={styles.rxSig}>
                      Sig: {rx.instructions || "Use as directed"}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {item.attachments && item.attachments.length > 0 && (
              <View style={styles.attachmentBox}>
                <Text style={styles.attachmentTitle}>
                  📎 Lab Results & Files:
                </Text>
                <View style={styles.attachmentList}>
                  {item.attachments.map((file, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.attachmentChip}
                      onPress={() => handleOpenAttachment(file.url || file)}
                    >
                      <Text style={styles.attachmentChipText}>
                        📄 {file.name || `Attachment ${idx + 1}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

          {item.nextVisit && (
            <View style={styles.reminderBanner}>
              <MaterialIcons name="event" size={16} color="#D32F2F" />
              <Text style={styles.reminderText}>
                NEXT VISIT DUE:{" "}
                {new Date(item.nextVisit.seconds * 1000).toLocaleDateString(
                  "en-US",
                  { month: "long", day: "numeric", year: "numeric" },
                )}
              </Text>
            </View>
          )}

          <View style={styles.cardFooter}>
            <TouchableOpacity
              style={styles.pdfBtn}
              onPress={() => generatePDF(item)}
            >
              <MaterialIcons name="picture-as-pdf" size={18} color="#5D4037" />
              <Text style={styles.pdfBtnText}>Download Visit Summary</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerBox}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <MaterialIcons name="arrow-back-ios" size={20} color="#5D4037" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{petName}'s Chart</Text>
        <View style={{ width: 40 }} /> {/* Spacer for centering */}
      </View>

      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator
            size="large"
            color="#8B4513"
            style={{ marginTop: 50 }}
          />
        ) : (
          <FlatList
            data={history}
            keyExtractor={(item) => item.id}
            renderItem={renderRecord}
            contentContainerStyle={{ padding: 20, paddingBottom: 150 }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={{ fontSize: 60, marginBottom: 10 }}>📂</Text>
                <Text style={styles.emptyText}>No medical records found.</Text>
                <Text style={styles.emptySub}>
                  Visit summaries and lab results will appear here after a
                  consultation.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFF8E1" },
  container: { flex: 1, backgroundColor: "#FAFAFA" },

  headerBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF8E1",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    elevation: 2,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  headerTitle: {
    color: "#3E2723",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  timelineRow: { flexDirection: "row", marginBottom: 25 },
  timelineGraphic: { width: 30, alignItems: "center" },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "white",
    zIndex: 2,
    marginTop: 15,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  line: {
    position: "absolute",
    top: 25,
    bottom: -25,
    width: 2,
    backgroundColor: "#E0E0E0",
    zIndex: 1,
  },

  recordCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    elevation: 3,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  dateText: { fontWeight: "900", fontSize: 16, marginBottom: 2 },
  serviceText: {
    fontSize: 12,
    color: "#757575",
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  vetBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFEBE9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  vetText: {
    fontSize: 12,
    color: "#5D4037",
    fontWeight: "bold",
    marginLeft: 4,
  },

  cardBody: { padding: 15 },
  subjectiveBox: {
    marginBottom: 15,
    borderLeftWidth: 3,
    borderLeftColor: "#FFB74D",
    paddingLeft: 10,
  },
  subjectiveLabel: {
    fontSize: 10,
    color: "#F57C00",
    fontWeight: "900",
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  subjectiveText: {
    fontSize: 14,
    color: "#555",
    fontStyle: "italic",
    lineHeight: 20,
  },

  diagnosisContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
    marginBottom: 15,
  },
  diagnosisText: {
    fontSize: 18,
    fontWeight: "900",
    marginTop: 5,
    lineHeight: 24,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  vitalsBox: {
    flexDirection: "row",
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    padding: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#EEEEEE",
  },
  vitalItem: { flex: 1, alignItems: "center" },
  vitalLabel: {
    fontSize: 10,
    color: "#888",
    fontWeight: "900",
    marginBottom: 4,
  },
  vitalValue: { fontSize: 15, color: "#333", fontWeight: "800" },

  planBox: {
    padding: 15,
    borderRadius: 12,
    borderLeftWidth: 4,
    marginBottom: 15,
  },
  planLabel: {
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  planText: { fontSize: 14, color: "#333", lineHeight: 22, fontWeight: "500" },

  rxBox: {
    backgroundColor: "#FFF3E0",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#FFE0B2",
  },
  rxTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#E65100",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  rxItem: { marginBottom: 8 },
  rxName: { fontSize: 15, fontWeight: "800", color: "#3E2723" },
  rxSig: {
    fontSize: 13,
    color: "#555",
    fontStyle: "italic",
    marginLeft: 10,
    marginTop: 2,
  },

  attachmentBox: { marginBottom: 10 },
  attachmentTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1565C0",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  attachmentList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  attachmentChip: {
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#90CAF9",
  },
  attachmentChipText: { color: "#1565C0", fontSize: 12, fontWeight: "bold" },

  reminderBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFEBEE",
    padding: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#FFCDD2",
  },
  reminderText: { color: "#D32F2F", fontWeight: "900", fontSize: 13 },

  cardFooter: { padding: 15, backgroundColor: "#FAFAFA" },
  pdfBtn: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "white",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D7CCC8",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  pdfBtnText: { color: "#5D4037", fontWeight: "900", fontSize: 14 },

  emptyContainer: {
    alignItems: "center",
    marginTop: 100,
    paddingHorizontal: 40,
  },
  emptyText: {
    color: "#5D4037",
    fontWeight: "900",
    fontSize: 22,
    textAlign: "center",
  },
  emptySub: {
    color: "#888",
    fontStyle: "italic",
    fontSize: 15,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 22,
  },
});
