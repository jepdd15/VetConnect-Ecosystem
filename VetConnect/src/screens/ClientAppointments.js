// The booking management list.
// Splits appointments into "Active" and "History." Allows users to cancel appointments,
// immediately freeing up the slot in the database. Provides access to their generated QR Codes.

import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
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
import { findFirstBookableDate } from "../hooks/useBookingEngine";
import {
  getClientStatusColor,
  getClientStatusIcon,
  getClientStatusLabel,
  isActiveStatus,
  sanitizeCancelReason,
} from "../utils/statusLabels";
import SuperCard from "../components/SuperCard";

const ICONS = {
  Consultation: "🩺",
  Vaccination: "💉",
  Grooming: "✂️",
  Surgery: "🏥",
  Laboratory: "🔬",
  Emergency: "🚨",
  Default: "🐾",
};

const formatApptTime = (tsDate) => {
  if (!tsDate) return '';
  const d = tsDate.toDate();
  if (d.getHours() === 0 && d.getMinutes() === 0) return 'Walk-in';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

  // Sales cache — keyed by appointmentId, populated after each appointments snapshot.
  // Only populated for completed appointments. Used to show "Paid ₱X" on history cards.
  const [salesByAppt, setSalesByAppt] = useState({});

  // Parent medical record cache — keyed by parentRecordId.
  // Populated for follow-up ghost appointments so we can show the real diagnosis + vet name.
  const [parentRecords, setParentRecords] = useState({});

  // 1. Fetch Data
  useEffect(() => {
    const q = query(
      collection(db, "appointments"),
      where("ownerId", "==", auth.currentUser.uid),
      orderBy("createdAt", "desc"),
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setAppointments(list);
      setLoading(false);
      fetchSalesForCompleted(list);
      fetchParentRecords(list);
    });
    return () => unsub();
  }, []);

  // Batch-fetch sales docs for all completed appointments.
  // Chunked at 10 IDs per query (Firestore 'in' operator limit).
  const fetchSalesForCompleted = async (appointmentList) => {
    const completedIds = appointmentList
      .filter(a => a.status === 'completed')
      .map(a => a.id);

    if (completedIds.length === 0) {
      setSalesByAppt({});
      return;
    }

    const chunks = [];
    for (let i = 0; i < completedIds.length; i += 10) {
      chunks.push(completedIds.slice(i, i + 10));
    }

    try {
      const results = {};
      for (const chunk of chunks) {
        const salesQ = query(
          collection(db, 'sales'),
          where('appointmentId', 'in', chunk),
        );
        const snap = await getDocs(salesQ);
        snap.forEach(docSnap => {
          const d = docSnap.data();
          if (d.appointmentId) results[d.appointmentId] = d;
        });
      }
      setSalesByAppt(results);
    } catch (error) {
      console.error('[ClientAppointments.fetchSalesForCompleted]:', error.message);
    }
  };

  // Batch-fetch parent medical records for all pending follow-up appointments.
  // Chunked at 10 IDs per query (Firestore 'in' operator limit) — same pattern as fetchSalesForCompleted.
  // The parent record holds the real serviceType, vet name, and diagnosis for banner display.
  const fetchParentRecords = async (appointmentList) => {
    const recordIds = [...new Set(
      appointmentList
        .filter(a => a.isFollowUp && a.status === 'pending' && a.parentRecordId)
        .map(a => a.parentRecordId)
    )];

    if (recordIds.length === 0) {
      setParentRecords({});
      return;
    }

    const chunks = [];
    for (let i = 0; i < recordIds.length; i += 10) {
      chunks.push(recordIds.slice(i, i + 10));
    }

    try {
      const results = {};
      for (const chunk of chunks) {
        const q = query(
          collection(db, 'medical_records'),
          where(documentId(), 'in', chunk),
        );
        const snap = await getDocs(q);
        snap.forEach(docSnap => {
          results[docSnap.id] = docSnap.data();
        });
      }
      setParentRecords(results);
    } catch (error) {
      console.error('[ClientAppointments.fetchParentRecords]:', error.message);
    }
  };

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
    navigation.navigate("BookAppointment", {
      prefillPetId: item.petId,
      prefillServiceType: item.serviceType || item.primaryService,
    });
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

  // Navigate to BookAppointment with prefill params derived from the follow-up ghost.
  // Resolves the true parent serviceType via the already-fetched parentRecords join,
  // since the ghost always has serviceType: 'Follow-Up Visit' (hardcoded by ClinicalWorkspace).
  // Also runs the ±3 day closed-date cascade to land the wizard on the best available date.
  const handleBookFollowUp = (item) => {
    // Walk-in ghosts have no linked client account — cannot deep-link to booking.
    if (!item.petId || item.petId === 'WALK_IN_PET') {
      Alert.alert(
        'Call the clinic',
        'Please call to schedule this follow-up — your visit was a walk-in.',
      );
      return;
    }

    // Resolve the true parent service from the joined medical record.
    // The ghost always has serviceType: 'Follow-Up Visit' (hardcoded by ClinicalWorkspace),
    // so we prefer the parent record's real serviceType from the join.
    const parent = parentRecords[item.parentRecordId];
    const resolvedServiceType = parent?.serviceType || item.serviceType || 'Follow-Up Visit';

    (async () => {
      let clinicSettings = { closedDates: [] };
      try {
        const snap = await getDoc(doc(db, 'clinic_settings', 'general'));
        if (snap.exists()) clinicSettings = snap.data();
      } catch (e) {
        console.warn('[ClientAppointments.handleBookFollowUp] clinic_settings fetch failed, using empty closedDates');
      }

      const target = item.scheduledDate?.toDate() || new Date();
      const result = findFirstBookableDate(target, 3, clinicSettings);

      if (result.matchType === 'none') {
        Alert.alert(
          "Couldn't find an open day",
          `We couldn't find an open slot near ${target.toLocaleDateString()}. Please pick a date manually.`,
          [{ text: 'Continue anyway', onPress: () => navigation.navigate('BookAppointment', {
            prefillPetId: item.petId,
            prefillServiceType: resolvedServiceType,
            fromFollowUp: true,
            ghostAppointmentId: item.id,
          }) }],
        );
        return;
      }

      navigation.navigate('BookAppointment', {
        prefillPetId: item.petId,
        prefillServiceType: resolvedServiceType,
        prefillDate: result.date.toISOString(),
        prefillDateMatchType: result.matchType,
        prefillTargetDate: target.toISOString(),
        fromFollowUp: true,
        ghostAppointmentId: item.id,
      });
    })();
  };

  // Confirm-gated dismissal of a follow-up ghost.
  // Stamps status: 'cancelled' + cancelReason: 'client-dismissed-followup' so the row
  // disappears from Upcoming and is filtered out of History. Does NOT touch medical_records.nextVisit.
  const handleDismissFollowUp = (item) => {
    Alert.alert(
      'Dismiss follow-up?',
      `Your vet recommended a visit on ${item.scheduledDate?.toDate().toLocaleDateString()}. You can still book manually from your pet's history later.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Yes, dismiss',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'appointments', item.id), {
                status: 'cancelled',
                cancelReason: 'client-dismissed-followup',
                cancelledAt: Timestamp.now(),
              });
            } catch (error) {
              Alert.alert('Error', 'Could not dismiss. Please try again.');
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
          "on-hold",
        ].includes(item.status)
      : (
          ["completed", "cancelled", "no-show", "carried-over"].includes(item.status)
          && item.cancelReason !== 'client-dismissed-followup'
          && item.cancelReason !== 'client-booked-followup'
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

  // Specialized render for follow-up ghost appointments (isFollowUp: true, status: 'pending').
  // Uses the parentRecords join for vet name and diagnosis — the ghost's own fields are not reliable
  // for those values since ClinicalWorkspace hardcodes serviceType: 'Follow-Up Visit'.
  const renderFollowUpRow = (item) => {
    const parent = parentRecords[item.parentRecordId];
    const vetName = parent?.dischargeSummary?.vetName || 'Your veterinarian';
    const diagnosis = parent?.dischargeSummary?.diagnosis || parent?.diagnosis || 'a recheck';
    const recommendedDate = item.scheduledDate?.toDate();
    const dateStr = recommendedDate?.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }) || 'soon';
    const isWalkIn = !item.petId || item.petId === 'WALK_IN_PET';

    return (
      <View key={item.id} style={styles.followUpCard}>
        <View style={styles.followUpAccent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.followUpRibbon}>FOLLOW-UP RECOMMENDED</Text>
          <Text style={styles.followUpTitle}>{item.petName}</Text>
          <Text style={styles.followUpSubtitle}>
            {vetName} recommends a recheck for {diagnosis}
          </Text>
          <Text style={styles.followUpDate}>Suggested: {dateStr}</Text>
          <View style={styles.followUpActionRow}>
            <TouchableOpacity
              style={[styles.followUpBtn, styles.followUpBtnSecondary]}
              onPress={() => handleDismissFollowUp(item)}
            >
              <Text style={styles.followUpBtnSecondaryText}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.followUpBtn, styles.followUpBtnPrimary]}
              onPress={() => handleBookFollowUp(item)}
            >
              <Text style={styles.followUpBtnPrimaryText}>
                {isWalkIn ? 'Call clinic' : 'Book this visit'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderItem = ({ item }) => {
    // Follow-up ghosts get a dedicated banner treatment — not the regular card layout.
    if (item.isFollowUp === true && item.status === 'pending') {
      return renderFollowUpRow(item);
    }

    const icon = ICONS[item.serviceType] || ICONS["Default"];
    const isHistory = tab === "history";

    return (
      <View style={[styles.card, isHistory && styles.historyCard]}>
        <View style={styles.row}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 24, marginRight: 10 }}>{icon}</Text>
            <View>
              <Text style={styles.service}>{item.serviceType || item.primaryService || ""}</Text>
              <Text style={styles.pet}>Patient: {item.petName}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.status, getClientStatusColor(item.status)]}>
              {getClientStatusIcon(item.status)} {getClientStatusLabel(item.status).toUpperCase()}
            </Text>
            {!isHistory && item.servicePrice > 0 && (
              <Text style={styles.price}>Est. ₱{item.servicePrice}</Text>
            )}
            {isHistory && item.status === "completed" && salesByAppt[item.id]?.total != null && (
              <Text style={styles.price}>Paid ₱{salesByAppt[item.id].total}</Text>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.date}>
            📅 {item.scheduledDate?.toDate().toDateString()}
          </Text>
          <Text style={styles.date}>
            ⏰ {formatApptTime(item.scheduledDate)}
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
                    handleCancelAppointment(item.id, item.serviceType || item.primaryService)
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
          {item.status === "cancelled" && (() => {
            const raw = item.auditReason || item.rejectReason;
            const clean = sanitizeCancelReason(raw);
            return clean ? <Text style={styles.reasonText}>{clean}</Text> : null;
          })()}
        </View>
      </View>
    );
  };

  // Derive the single active in-clinic appointment (if any) for the SuperCard.
  // Only the first active appointment is surfaced — multi-pet concurrent visits
  // are rare enough that a single-card view is acceptable for this pass.
  const activeAppointment = appointments.find(a => isActiveStatus(a.status)) || null;

  return (
    <View style={styles.container}>
      {/* SUPER-CARD — pinned above tabs so it stays visible while switching tabs */}
      <SuperCard appointment={activeAppointment} />

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
          data={(() => {
            const base = activeAppointment
              ? filteredData.filter(a => a.id !== activeAppointment.id)
              : filteredData;
            // Follow-up ghosts float to the top of the Upcoming tab, sorted by scheduledDate ascending.
            if (tab !== 'upcoming') return base;
            const followUps = base
              .filter(a => a.isFollowUp && a.status === 'pending')
              .sort((a, b) => (a.scheduledDate?.toMillis() || 0) - (b.scheduledDate?.toMillis() || 0));
            const rest = base.filter(a => !(a.isFollowUp && a.status === 'pending'));
            return [...followUps, ...rest];
          })()}
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

  // --- Follow-up ghost card (B5) ---
  followUpCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
    elevation: 4,
    shadowColor: '#E65100',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: '#FFCC80',
    overflow: 'hidden',
  },
  followUpAccent: {
    width: 4,
    backgroundColor: '#E65100',
    marginRight: 12,
    borderRadius: 2,
  },
  followUpRibbon: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#E65100',
    marginBottom: 6,
  },
  followUpTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#3E2723',
    marginBottom: 2,
  },
  followUpSubtitle: {
    fontSize: 13,
    color: '#5D4037',
    lineHeight: 18,
    marginBottom: 6,
  },
  followUpDate: {
    fontSize: 13,
    color: '#8B4513',
    fontWeight: '700',
    marginBottom: 10,
  },
  followUpActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  followUpBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  followUpBtnPrimary: {
    backgroundColor: '#E65100',
  },
  followUpBtnPrimaryText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 13,
  },
  followUpBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#8D6E63',
  },
  followUpBtnSecondaryText: {
    color: '#5D4037',
    fontWeight: '700',
    fontSize: 13,
  },
});

export default ClientAppointments;
