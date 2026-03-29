// The booking management list.
// Splits appointments into "Active" and "History." Allows users to cancel appointments,
// immediately freeing up the slot in the database. Provides access to their generated QR Codes.

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { auth, db } from "../../firebaseConfig";

const ICONS = {
  Consultation: "🩺",
  Vaccination: "💉",
  Grooming: "✂️",
  Surgery: "🏥",
  Laboratory: "🔬",
  Emergency: "🚨",
  Default: "🐾",
};

const ClientAppointments = ({ navigation }) => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("upcoming");

  // Filter States
  const [selectedPetFilter, setSelectedPetFilter] = useState("All Pets");
  const [selectedServiceFilter, setSelectedServiceFilter] =
    useState("All Services");

  // QR Modal
  const [showQR, setShowQR] = useState(false);
  const [qrData, setQrData] = useState("");

  // Receipt Modal
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  // 1. Fetch Data
  useEffect(() => {
    const q = query(
      collection(db, "appointments"),
      where("ownerId", "==", auth.currentUser.uid),
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

  // --- HANDLERS ---
  const handleShowQR = (code) => {
    setQrData(code);
    setShowQR(true);
  };

  const handleShowReceipt = async (item) => {
    setLoadingReceipt(true);
    setShowReceipt(true);
    setReceiptData(null);
    try {
      const q = query(
        collection(db, "sales"),
        where("appointmentId", "==", item.id),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setReceiptData(snap.docs[0].data());
      } else {
        setReceiptData({
          items: [
            { name: item.serviceType, price: item.servicePrice || 0, qty: 1 },
          ],
          total: item.servicePrice || 0,
          isFallback: true,
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingReceipt(false);
    }
  };

  const handleRebook = (item) => {
    navigation.navigate("BookAppointment");
  };

  // CLIENT-SIDE CANCELLATION ---
  const handleCancelAppointment = (id, serviceType) => {
    Alert.alert(
      "Cancel Appointment",
      `Are you sure you want to cancel your ${serviceType}? This will forfeit your slot.`,
      [
        { text: "No, keep it", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "appointments", id), {
                status: "cancelled",
                rejectReason: "Cancelled by Pet Owner",
              });
              Alert.alert(
                "Cancelled",
                "Your appointment has been cancelled. The time slot has been freed.",
              );
            } catch (error) {
              Alert.alert(
                "Error",
                "Could not cancel appointment. Please try again.",
              );
            }
          },
        },
      ],
    );
  };

  // --- DYNAMIC FILTER DATA GENERATION ---
  const uniquePets = [
    "All Pets",
    ...new Set(appointments.map((a) => a.petName)),
  ];
  const uniqueServices = [
    "All Services",
    ...new Set(appointments.map((a) => a.serviceType)),
  ];

  // --- FILTER LOGIC (MULTI-AXIS) ---
  const filteredData = appointments.filter((item) => {
    // 1. Tab Check
    const isUpcomingTab = tab === "upcoming";
    const isValidStatus = isUpcomingTab
      ? [
          "pending",
          "confirmed",
          "arrived",
          "in-consult",
          "billing",
          "confined",
          "dispensing",
        ].includes(item.status)
      : ["completed", "cancelled", "no-show", "carried-over"].includes(
          item.status,
        );

    // 2. Pet Check
    const isPetMatch =
      selectedPetFilter === "All Pets" || item.petName === selectedPetFilter;

    // 3. Service Check
    const isServiceMatch =
      selectedServiceFilter === "All Services" ||
      item.serviceType === selectedServiceFilter;

    return isValidStatus && isPetMatch && isServiceMatch;
  });

  const renderItem = ({ item }) => {
    const icon = ICONS[item.serviceType] || ICONS["Default"];
    const isHistory = tab === "history";

    return (
      <View style={[styles.card, isHistory && styles.historyCard]}>
        <View style={styles.row}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 24, marginRight: 10 }}>{icon}</Text>
            <View>
              <Text style={styles.service}>{item.serviceType}</Text>
              <Text style={styles.pet}>Patient: {item.petName}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.status, getStatusColor(item.status)]}>
              {item.status.toUpperCase()}
            </Text>
            {!isHistory && item.servicePrice > 0 && (
              <Text style={styles.price}>Est. ₱{item.servicePrice}</Text>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.date}>
            📅 {item.scheduledDate?.toDate().toDateString()}
          </Text>
          <Text style={styles.date}>
            ⏰{" "}
            {item.scheduledDate
              ?.toDate()
              .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>

        {/* --- ACTION BUTTONS --- */}
        <View style={styles.actionRow}>
          {/* UPCOMING ACTIONS: Cancel & QR */}
          {!isHistory &&
            (item.status === "confirmed" || item.status === "pending") && (
              <>
                <TouchableOpacity
                  style={[
                    styles.btn,
                    {
                      backgroundColor: "#FFEBEE",
                      borderWidth: 1,
                      borderColor: "#D32F2F",
                      marginRight: "auto",
                    },
                  ]}
                  onPress={() =>
                    handleCancelAppointment(item.id, item.serviceType)
                  }
                >
                  <Text style={[styles.btnText, { color: "#D32F2F" }]}>
                    ❌ Cancel
                  </Text>
                </TouchableOpacity>

                {item.status === "confirmed" && (
                  <TouchableOpacity
                    style={[styles.btn, styles.qrBtn]}
                    onPress={() => handleShowQR(item.qrCode)}
                  >
                    <Text style={styles.btnText}>📱 QR Code</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

          {/* HISTORY ACTIONS: Receipt & Re-Book */}
          {isHistory && item.status === "completed" && (
            <>
              <TouchableOpacity
                style={[styles.btn, styles.receiptBtn]}
                onPress={() => handleShowReceipt(item)}
              >
                <Text style={[styles.btnText, { color: "#5D4037" }]}>
                  🧾 E-Receipt
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.rebookBtn]}
                onPress={() => handleRebook(item)}
              >
                <Text style={[styles.btnText, { color: "#5D4037" }]}>
                  🔄 Re-Book
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* CANCELLATION REASON */}
          {item.status === "cancelled" && item.rejectReason && (
            <Text style={styles.reasonText}>Reason: "{item.rejectReason}"</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* TABS */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, tab === "upcoming" && styles.activeTab]}
          onPress={() => setTab("upcoming")}
        >
          <Text
            style={[styles.tabText, tab === "upcoming" && styles.activeTabText]}
          >
            📅 Upcoming
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "history" && styles.activeTab]}
          onPress={() => setTab("history")}
        >
          <Text
            style={[styles.tabText, tab === "history" && styles.activeTabText]}
          >
            📂 History
          </Text>
        </TouchableOpacity>
      </View>

      {/* --- DUAL-AXIS FILTERS --- */}
      {appointments.length > 0 && (
        <View style={styles.filterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
          >
            {uniquePets.map((pet) => (
              <TouchableOpacity
                key={`pet-${pet}`}
                style={[
                  styles.filterChip,
                  selectedPetFilter === pet && styles.activeFilterChip,
                ]}
                onPress={() => setSelectedPetFilter(pet)}
              >
                <Text
                  style={[
                    styles.filterText,
                    selectedPetFilter === pet && styles.activeFilterText,
                  ]}
                >
                  {pet === "All Pets" ? "🐾 All Pets" : pet}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
          >
            {uniqueServices.map((service) => (
              <TouchableOpacity
                key={`srv-${service}`}
                style={[
                  styles.filterChip,
                  selectedServiceFilter === service && styles.activeFilterChip,
                ]}
                onPress={() => setSelectedServiceFilter(service)}
              >
                <Text
                  style={[
                    styles.filterText,
                    selectedServiceFilter === service &&
                      styles.activeFilterText,
                  ]}
                >
                  {service === "All Services" ? "📋 All Services" : service}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* LIST */}
      {loading ? (
        <ActivityIndicator
          size="large"
          color="#8B4513"
          style={{ marginTop: 50 }}
        />
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 40 }}>📭</Text>
              <Text style={styles.empty}>
                No {tab} records match your filters.
              </Text>
              <TouchableOpacity
                style={{ marginTop: 15, padding: 10 }}
                onPress={() => {
                  setSelectedPetFilter("All Pets");
                  setSelectedServiceFilter("All Services");
                }}
              >
                <Text style={{ color: "#8B4513", fontWeight: "bold" }}>
                  Clear Filters
                </Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* QR MODAL */}
      <Modal visible={showQR} transparent={true} animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Scan at Reception</Text>
            <QRCode value={qrData || "error"} size={200} />
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowQR(false)}
            >
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* RECEIPT MODAL */}
      <Modal visible={showReceipt} transparent={true} animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.receiptContent}>
            <Text style={styles.receiptHeader}>STARBARKS VET CLINIC</Text>
            <Text style={styles.receiptSub}>Official E-Receipt</Text>
            <View style={styles.divider} />

            {loadingReceipt ? (
              <ActivityIndicator color="#8B4513" style={{ my: 20 }} />
            ) : (
              <ScrollView style={{ width: "100%", maxHeight: 300 }}>
                {receiptData?.items?.map((item, i) => (
                  <View key={i} style={styles.receiptItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.receiptItemName}>{item.name}</Text>
                      <Text style={styles.receiptItemQty}>
                        {item.qty}x @ ₱{item.price}
                      </Text>
                    </View>
                    <Text style={styles.receiptItemTotal}>
                      ₱{item.qty * item.price}
                    </Text>
                  </View>
                ))}
                {receiptData?.isFallback && (
                  <Text
                    style={{
                      fontSize: 10,
                      color: "#aaa",
                      fontStyle: "italic",
                      textAlign: "center",
                      marginTop: 10,
                    }}
                  >
                    Detailed POS data not found for this legacy record.
                  </Text>
                )}
              </ScrollView>
            )}
            <View style={styles.divider} />
            <View style={styles.receiptTotalRow}>
              <Text style={styles.receiptTotalLabel}>GRAND TOTAL</Text>
              <Text style={styles.receiptTotalValue}>
                ₱{receiptData?.total || 0}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowReceipt(false)}
            >
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const getStatusColor = (status) => {
  switch (status) {
    case "confirmed":
      return { color: "green", backgroundColor: "#E8F5E9" };
    case "cancelled":
      return { color: "#D32F2F", backgroundColor: "#FFEBEE" };
    case "completed":
      return { color: "#1976D2", backgroundColor: "#E3F2FD" };
    case "pending":
      return { color: "#ED6C02", backgroundColor: "#FFF3E0" };
    default:
      return { color: "#555", backgroundColor: "#eee" };
  }
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#FFF8E1" },

  tabContainer: {
    flexDirection: "row",
    marginBottom: 10,
    backgroundColor: "#EFEBE9",
    borderRadius: 10,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8 },
  activeTab: { backgroundColor: "white", elevation: 2 },
  tabText: { fontWeight: "bold", color: "#8D6E63" },
  activeTabText: { color: "#5D4037" },

  filterSection: { marginBottom: 15 },
  chipRow: { flexDirection: "row", marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#EFEBE9",
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#D7CCC8",
  },
  activeFilterChip: { backgroundColor: "#8B4513", borderColor: "#8B4513" },
  filterText: { color: "#5D4037", fontWeight: "600", fontSize: 13 },
  activeFilterText: { color: "white" },

  card: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#eee",
  },
  historyCard: { opacity: 0.9, backgroundColor: "#FAFAFA" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  divider: { height: 1, backgroundColor: "#eee", marginVertical: 10 },
  service: { fontSize: 16, fontWeight: "bold", color: "#5D4037" },
  pet: { fontSize: 14, color: "#555" },
  price: {
    fontWeight: "bold",
    color: "#8B4513",
    fontSize: 12,
    marginTop: 2,
    textAlign: "right",
  },
  status: {
    fontWeight: "bold",
    fontSize: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  date: { fontSize: 13, color: "#666" },

  actionRow: {
    flexDirection: "row",
    marginTop: 10,
    justifyContent: "flex-end",
    gap: 10,
    alignItems: "center",
  },
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  qrBtn: { backgroundColor: "#3E2723" },
  receiptBtn: {
    backgroundColor: "#EFEBE9",
    borderWidth: 1,
    borderColor: "#ccc",
  },
  rebookBtn: { borderWidth: 1, borderColor: "#5D4037" },
  btnText: { color: "white", fontWeight: "bold", fontSize: 12 },
  reasonText: {
    color: "#D32F2F",
    fontStyle: "italic",
    fontSize: 12,
    marginTop: 5,
    backgroundColor: "#FFEBEE",
    padding: 5,
    width: "100%",
  },

  emptyContainer: { alignItems: "center", marginTop: 50, opacity: 0.5 },
  empty: {
    textAlign: "center",
    marginTop: 10,
    color: "#888",
    fontSize: 16,
    paddingHorizontal: 20,
  },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    padding: 30,
    borderRadius: 20,
    alignItems: "center",
    width: "85%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#5D4037",
  },

  receiptContent: {
    backgroundColor: "#FFFAFA",
    padding: 25,
    borderRadius: 10,
    width: "90%",
    borderStyle: "dashed",
    borderWidth: 2,
    borderColor: "#ccc",
  },
  receiptHeader: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    letterSpacing: 1,
  },
  receiptSub: {
    fontSize: 12,
    color: "#888",
    textAlign: "center",
    marginBottom: 10,
  },
  receiptItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  receiptItemName: { fontSize: 14, fontWeight: "bold", color: "#333" },
  receiptItemQty: { fontSize: 12, color: "#777" },
  receiptItemTotal: { fontSize: 14, fontWeight: "bold", color: "#333" },
  receiptTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  receiptTotalLabel: { fontSize: 18, fontWeight: "bold", color: "#333" },
  receiptTotalValue: { fontSize: 20, fontWeight: "bold", color: "#2E7D32" },

  closeBtn: { marginTop: 20, padding: 10, alignSelf: "center" },
  closeText: { color: "#D32F2F", fontWeight: "bold", fontSize: 16 },
});

export default ClientAppointments;
