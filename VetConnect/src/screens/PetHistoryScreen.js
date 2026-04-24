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
import { useClinicContact } from "../hooks/useClinicContact";
import { safeDate, formatDisplayDate } from "../utils/helpers";

export default function PetHistoryScreen({ route, navigation }) {
  const { petId, petName } = route.params;
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const { clinicPhone } = useClinicContact();

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
          prescriptions: (data.prescriptions || []).map(({ price, cost, unitPrice, ...rx }) => rx),
          dischargeSummary: data.dischargeSummary ? {
            ...data.dischargeSummary,
            medications: (data.dischargeSummary.medications || []).map(({ price, cost, unitPrice, ...m }) => m),
          } : undefined,
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

  // --- PDF GENERATOR ---
  const generatePDF = async (record) => {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const dateStr = formatDisplayDate(record.date);

    const hasDischarge = !!record.dischargeSummary;
    const dsInstructions = record.dischargeSummary?.instructions || '';
    const dsDiagnosis = record.dischargeSummary?.diagnosis || record.diagnosis || '';
    const dsMeds = record.dischargeSummary?.medications || [];

    const rxHtmlFromDischarge = dsMeds.length > 0
      ? `<h3>Medications</h3><ul>${dsMeds.map((med) =>
          `<li><b>${esc(med.name)}</b> x${esc(med.qty || 1)}: ${esc(med.instructions || 'Use as directed')}</li>`
        ).join('')}</ul>`
      : '';

    let rxHtml = '';
    if (record.prescriptions && record.prescriptions.length > 0 && !dsMeds.length) {
      rxHtml = `<h3>Prescribed Medications</h3><ul>${record.prescriptions.map((rx) =>
        `<li><b>${esc(rx.name)}</b>: ${esc(rx.instructions || "Use as directed")}</li>`
      ).join("")}</ul>`;
    }

    const nextVisitRaw = record.dischargeSummary?.nextVisit || record.nextVisit;
    const nextVisitStr = nextVisitRaw
      ? formatDisplayDate(nextVisitRaw, { month: 'long', day: 'numeric', year: 'numeric' }, null)
      : null;

    const htmlContent = `
      <html>
        <body style="font-family: Helvetica, Arial, sans-serif; padding: 40px; color: #333;">
          <h1 style="color: #8B4513; text-align: center; border-bottom: 2px solid #8B4513; padding-bottom: 10px;">Starbarks Veterinary Clinic</h1>
          <h2 style="text-align: center; margin-top: 0;">Visit Summary</h2>
          <table style="width: 100%; margin-bottom: 30px;">
            <tr><td><b>Patient:</b> ${esc(petName)}</td><td style="text-align: right;"><b>Date:</b> ${esc(dateStr)}</td></tr>
            <tr><td><b>Service:</b> ${esc(record.serviceType)}</td><td style="text-align: right;"><b>Attending Vet:</b> ${esc(record.vetName || "Staff")}</td></tr>
          </table>
          ${record.vitals ? `<h3>Vitals</h3>
          <p><b>Weight:</b> ${esc(record.vitals?.weight || "-")} kg &nbsp;&nbsp; | &nbsp;&nbsp; <b>Temp:</b> ${esc(record.vitals?.temp || "-")} &deg;C &nbsp;&nbsp; | &nbsp;&nbsp; <b>Heart Rate:</b> ${esc(record.vitals?.hr || "-")} bpm</p>` : ''}
          ${dsDiagnosis ? `<h3>Diagnosis</h3><p>${esc(dsDiagnosis)}</p>` : ''}
          ${record.patientStatus ? `<p><b>Status:</b> ${esc(record.patientStatus)}</p>` : ''}
          ${hasDischarge && dsInstructions ? `<h3>Going-Home Instructions</h3><p>${esc(dsInstructions).replace(/\n/g, '<br/>')}</p>` : ''}
          ${rxHtmlFromDischarge || rxHtml}
          ${nextVisitStr ? `<h3 style="color: #D32F2F;">Next Follow-Up Due: ${esc(nextVisitStr)}</h3>` : ""}
          <hr style="margin-top: 50px;" />
          <p style="text-align: center; font-size: 12px; color: #888;">This is an electronically generated visit summary and does not require a physical signature.</p>
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
    const visitDate = formatDisplayDate(item.date);
    const isGrooming =
      item.recordType === "grooming" ||
      item.serviceType?.toLowerCase().includes("grooming");

    // Semantic Theme Colors
    const themeColor = isGrooming ? "#9C27B0" : "#1565C0";
    const themeBg = isGrooming ? "#F3E5F5" : "#E3F2FD";

    const coerceVital = (v) => {
      if (v == null) return '';
      const s = typeof v === 'number' || typeof v === 'string' ? String(v).trim() : '';
      return s;
    };
    const weightStr = coerceVital(item.vitals?.weight);
    const tempStr = coerceVital(item.vitals?.temp);
    const hrStr = coerceVital(item.vitals?.hr);
    const hasWeight = weightStr !== '';
    const hasTemp = tempStr !== '';
    const hasHR = hrStr !== '';
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
            {/* T2.8 Path B: raw SOAP subjective/objective/plan hidden from client view.
                Diagnosis is shown from the top-level field; instructions from dischargeSummary. */}

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
                    <Text style={styles.vitalValue}>{weightStr} kg</Text>
                  </View>
                )}
                {hasTemp && (
                  <View style={styles.vitalItem}>
                    <Text style={styles.vitalLabel}>TEMP</Text>
                    <Text style={styles.vitalValue}>{tempStr} °C</Text>
                  </View>
                )}
                {hasHR && (
                  <View style={styles.vitalItem}>
                    <Text style={styles.vitalLabel}>HR</Text>
                    <Text style={styles.vitalValue}>{hrStr} bpm</Text>
                  </View>
                )}
              </View>
            )}

            {/* T2.8: Show discharge instructions (client-safe) instead of raw SOAP plan */}
            {!item.dischargeSummary && (
              <View
                style={[
                  styles.planBox,
                  { borderLeftColor: themeColor, backgroundColor: themeBg },
                ]}
              >
                <Text style={[styles.planLabel, { color: themeColor }]}>
                  {isGrooming ? "GROOMING NOTES:" : "INSTRUCTIONS:"}
                </Text>
                <Text style={styles.planText}>
                  {isGrooming
                    ? (item.treatment || "No grooming notes recorded.")
                    : "Visit summary not yet available for this record."}
                </Text>
              </View>
            )}

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

            {/* DISCHARGE SUMMARY — polished as "Going-Home Instructions" */}
            {item.dischargeSummary && (() => {
              const ds = item.dischargeSummary;
              const doThisItems = (ds.instructions || '')
                .split('\n')
                .map(s => s.trim())
                .filter(Boolean);
              const nextVisitStr = ds.nextVisit
                ? formatDisplayDate(ds.nextVisit, { weekday: 'long', month: 'long', day: 'numeric' }, null)
                : null;
              const nextVisitDate = ds.nextVisit
                ? (typeof ds.nextVisit?.toDate === 'function' ? ds.nextVisit.toDate()
                   : ds.nextVisit?.seconds != null ? new Date(ds.nextVisit.seconds * 1000)
                   : ds.nextVisit instanceof Date ? ds.nextVisit
                   : new Date(ds.nextVisit))
                : null;

              return (
                <View style={styles.dischargeCard}>
                  <View style={styles.dischargeHeaderRow}>
                    <Text style={styles.dischargeHeader}>GOING-HOME INSTRUCTIONS</Text>
                    {ds.patientStatus && (
                      <Text style={styles.dischargeStatusPill}>{ds.patientStatus}</Text>
                    )}
                  </View>

                  {ds.diagnosis && (
                    <View style={styles.dischargeTldrBlock}>
                      <Text style={styles.dischargeTldrLabel}>TL;DR</Text>
                      <Text style={styles.dischargeTldrText}>{ds.diagnosis}</Text>
                    </View>
                  )}

                  {doThisItems.length > 0 && (
                    <View style={styles.dischargeSection}>
                      <Text style={styles.dischargeSectionLabel}>✓ Do this</Text>
                      {doThisItems.map((line, i) => (
                        <Text key={i} style={styles.dischargeBullet}>• {line}</Text>
                      ))}
                    </View>
                  )}

                  {ds.medications && ds.medications.length > 0 && (
                    <View style={styles.dischargeSection}>
                      <Text style={styles.dischargeSectionLabel}>💊 Medications</Text>
                      {ds.medications.map((med, i) => (
                        <View key={i} style={styles.dischargeMedRow}>
                          <Text style={styles.dischargeMedName}>{med.name}</Text>
                          <Text style={styles.dischargeMedMeta}>
                            ×{med.qty || 1} — {med.instructions || 'Use as directed'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {nextVisitStr && (
                    <View style={styles.dischargeNextVisit}>
                      <Text style={styles.dischargeNextVisitIcon}>📅</Text>
                      <Text style={styles.dischargeNextVisitText}>
                        Follow up <Text style={styles.dischargeNextVisitDate}>{nextVisitStr}</Text>
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.dischargeCallBtn, !clinicPhone && { backgroundColor: '#BDBDBD' }]}
                    onPress={() => {
                      if (!clinicPhone) return;
                      Linking.openURL(`tel:${clinicPhone}`);
                    }}
                    disabled={!clinicPhone}
                  >
                    <Text style={styles.dischargeCallBtnText}>📞 Call us</Text>
                  </TouchableOpacity>

                  {nextVisitDate && (
                    <TouchableOpacity
                      style={styles.dischargeFollowUpBtn}
                      onPress={() => navigation.navigate('BookAppointment', {
                        prefillPetId: petId,
                        prefillServiceType: item.serviceType || null,
                        prefillDate: nextVisitDate.toISOString(),
                        prefillDateMatchType: 'exact',
                        prefillTargetDate: nextVisitDate.toISOString(),
                        fromFollowUp: true,
                      })}
                    >
                      <Text style={styles.dischargeFollowUpBtnText}>Book Follow-Up</Text>
                    </TouchableOpacity>
                  )}

                  {ds.vetName && (
                    <Text style={styles.dischargeSignature}>Signed by {ds.vetName}</Text>
                  )}
                </View>
              );
            })()}

            {/* VACCINATION RECORD — supports multi-vaccine via vaccineAdministrations[] with legacy fallback */}
            {(item.vaccineAdministrations?.length > 0 || item.vaccineData) && (
              <View style={styles.vaccineCard}>
                <Text style={styles.vaccineHeader}>💉 VACCINATION RECORD</Text>
                {(item.vaccineAdministrations || (item.vaccineData ? [item.vaccineData] : [])).map((vax, vIdx) => (
                  <View key={vIdx} style={vIdx > 0 ? { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#C8E6C9' } : undefined}>
                    <Text style={styles.vaccineName}>{vax.vaccineName}</Text>
                    <View style={styles.vaccineGrid}>
                      {vax.manufacturer && (
                        <View style={styles.vaccineCell}>
                          <Text style={styles.vaccineCellLabel}>MFR</Text>
                          <Text style={styles.vaccineCellValue}>{vax.manufacturer}</Text>
                        </View>
                      )}
                      {vax.lotNumber && (
                        <View style={styles.vaccineCell}>
                          <Text style={styles.vaccineCellLabel}>LOT</Text>
                          <Text style={styles.vaccineCellValue}>{vax.lotNumber}</Text>
                        </View>
                      )}
                      {vax.routeOfAdmin && (
                        <View style={styles.vaccineCell}>
                          <Text style={styles.vaccineCellLabel}>ROUTE</Text>
                          <Text style={styles.vaccineCellValue}>{vax.routeOfAdmin}</Text>
                        </View>
                      )}
                      {vax.siteOfInjection && (
                        <View style={styles.vaccineCell}>
                          <Text style={styles.vaccineCellLabel}>SITE</Text>
                          <Text style={styles.vaccineCellValue}>{vax.siteOfInjection}</Text>
                        </View>
                      )}
                    </View>
                    {vax.dueDate && (
                      <View style={styles.vaccineDueBanner}>
                        <Text style={styles.vaccineDueText}>⏰ Next dose due {vax.dueDate}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* LAB RESULTS */}
            {item.labResults?.length > 0 && (
              <View style={styles.labCard}>
                <Text style={styles.labHeader}>🔬 LAB RESULTS</Text>
                {item.labResults.map((lab, i) => {
                  const statusKey = (lab.status || 'normal').toLowerCase();
                  const statusColor =
                    statusKey === 'critical' ? '#D32F2F' :
                    statusKey === 'abnormal' ? '#E65100' :
                    '#2E7D32';
                  const statusBg =
                    statusKey === 'critical' ? '#FFEBEE' :
                    statusKey === 'abnormal' ? '#FFF3E0' :
                    '#E8F5E9';
                  return (
                    <View key={i} style={styles.labRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.labTestName}>{lab.testName}</Text>
                        <Text style={styles.labResult}>{lab.result}</Text>
                      </View>
                      <Text style={[styles.labStatusPill, { color: statusColor, backgroundColor: statusBg }]}>
                        {statusKey.toUpperCase()}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {item.nextVisit && (
            <View style={styles.reminderBanner}>
              <MaterialIcons name="event" size={16} color="#D32F2F" />
              <Text style={styles.reminderText}>
                NEXT VISIT DUE:{" "}
                {safeDate(item.nextVisit, { month: "long", day: "numeric", year: "numeric" }, "an upcoming date")}
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
        <Text style={styles.headerTitle}>{petName}&apos;s Chart</Text>
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

  // --- Discharge card (B4) ---
  dischargeCard: {
    marginTop: 14,
    padding: 16,
    backgroundColor: "#F1F8E9",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#C5E1A5",
    shadowColor: "#2E7D32",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  dischargeHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dischargeHeader: {
    fontSize: 12,
    fontWeight: "900",
    color: "#2E7D32",
    letterSpacing: 1.2,
  },
  dischargeStatusPill: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1B5E20",
    backgroundColor: "#DCEDC8",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    overflow: "hidden",
  },
  dischargeTldrBlock: {
    marginBottom: 12,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#8B4513",
  },
  dischargeTldrLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "#8B4513",
    letterSpacing: 1,
    marginBottom: 2,
  },
  dischargeTldrText: {
    fontSize: 15,
    color: "#3E2723",
    fontWeight: "600",
    lineHeight: 20,
  },
  dischargeSection: {
    marginBottom: 12,
  },
  dischargeSectionLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#2E7D32",
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  dischargeBullet: {
    fontSize: 14,
    color: "#3E2723",
    lineHeight: 20,
    marginLeft: 6,
    marginBottom: 3,
  },
  dischargeMedRow: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  dischargeMedName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#3E2723",
  },
  dischargeMedMeta: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    marginTop: 2,
  },
  dischargeNextVisit: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF3E0",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FFCC80",
  },
  dischargeNextVisitIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  dischargeNextVisitText: {
    fontSize: 13,
    color: "#8B4513",
    flex: 1,
  },
  dischargeNextVisitDate: {
    fontWeight: "900",
    color: "#E65100",
  },
  dischargeCallBtn: {
    backgroundColor: "#8B4513",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  dischargeCallBtnText: {
    color: "white",
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  dischargeFollowUpBtn: {
    backgroundColor: "#FFF3E0",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#FFCC80",
  },
  dischargeFollowUpBtnText: {
    color: "#E65100",
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  dischargeSignature: {
    fontSize: 11,
    color: "#888",
    fontStyle: "italic",
    textAlign: "right",
    marginTop: 4,
  },

  // --- Vaccine card (B4) ---
  vaccineCard: {
    marginTop: 12,
    padding: 14,
    backgroundColor: "#FFF8E1",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FFE0B2",
  },
  vaccineHeader: {
    fontSize: 11,
    fontWeight: "900",
    color: "#E65100",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  vaccineName: {
    fontSize: 16,
    fontWeight: "900",
    color: "#3E2723",
    marginBottom: 10,
  },
  vaccineGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  vaccineCell: {
    backgroundColor: "white",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    minWidth: 70,
  },
  vaccineCellLabel: {
    fontSize: 9,
    color: "#888",
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  vaccineCellValue: {
    fontSize: 12,
    color: "#3E2723",
    fontWeight: "700",
  },
  vaccineDueBanner: {
    backgroundColor: "#FFEBEE",
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FFCDD2",
  },
  vaccineDueText: {
    fontSize: 12,
    color: "#D32F2F",
    fontWeight: "800",
    textAlign: "center",
  },

  // --- Lab results card (B4) ---
  labCard: {
    marginTop: 12,
    padding: 14,
    backgroundColor: "#E3F2FD",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#BBDEFB",
  },
  labHeader: {
    fontSize: 11,
    fontWeight: "900",
    color: "#1565C0",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  labRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  labTestName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#3E2723",
  },
  labResult: {
    fontSize: 12,
    color: "#666",
    marginTop: 1,
  },
  labStatusPill: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: "hidden",
    textTransform: "uppercase",
  },
});
