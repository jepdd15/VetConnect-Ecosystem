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
import { useEffect, useRef, useState } from "react";
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
import { useClinicContact } from "../hooks/useClinicContact";
import { formatFirestoreTime, formatDisplayDate, getLocalDateStr } from '../utils/helpers';
import { COLORS } from '../theme/mobileTokens';

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

  // Sales cache — keyed by appointmentId, populated after each appointments snapshot.
  // Only populated for completed appointments. Used to show "Paid ₱X" on history cards.
  const [salesByAppt, setSalesByAppt] = useState({});

  // Parent medical record cache — keyed by parentRecordId.
  // Populated for follow-up ghost appointments so we can show the real diagnosis + vet name.
  const [parentRecords, setParentRecords] = useState({});

  const { clinicPhone, clinicAddress } = useClinicContact();

  const [queueAhead, setQueueAhead] = useState(null);

  const prevCompletedIdsRef = useRef('');
  const prevParentIdsRef = useRef('');

  // 1. Fetch Data
  useEffect(() => {
    if (!auth.currentUser) return;
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

      // Only re-fetch sales/parent records when the relevant ID sets change
      const completedKey = list.filter(a => a.status === 'completed').map(a => a.id).sort().join(',');
      const parentKey = list
        .filter(a => a.isFollowUp && a.status === 'pending' && a.parentRecordId)
        .map(a => a.parentRecordId).sort().join(',');

      if (completedKey !== prevCompletedIdsRef.current) {
        prevCompletedIdsRef.current = completedKey;
        fetchSalesForCompleted(list);
      }
      if (parentKey !== prevParentIdsRef.current) {
        prevParentIdsRef.current = parentKey;
        fetchParentRecords(list);
      }
    });
    return () => unsub();
  }, []);

  // Real-time queue-ahead count for the active arrived appointment.
  const activeArrived = appointments.find(a => a.status === 'arrived');
  const activeArrivedId = activeArrived?.id ?? null;
  const activeArrivedQueueNum = activeArrived?.queueNumber ?? null;

  useEffect(() => {
    if (!activeArrivedId) {
      setQueueAhead(null);
      return;
    }

    const todayStr = activeArrived?.scheduledDateStr || getLocalDateStr();

    const q = query(
      collection(db, "appointments"),
      where("status", "==", "arrived"),
      where("scheduledDateStr", "==", todayStr)
    );

    const unsubQueue = onSnapshot(q, (snap) => {
      let ahead = 0;
      snap.forEach(d => {
        const data = d.data();
        if (data.queueNumber < activeArrivedQueueNum && d.id !== activeArrivedId) ahead++;
      });
      setQueueAhead(ahead);
    });

    return () => unsubQueue();
  }, [activeArrivedId, activeArrivedQueueNum]);

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
                auditReason: "Cancelled by Pet Owner",
                cancelledAt: Timestamp.now(),
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

      const openH = clinicSettings.openHour || 8;
      const closeH = clinicSettings.closeHour || 17;
      const slotInterval = clinicSettings.minSlotInterval || 30;
      const maxSlotsPerDay = Math.floor(((closeH - openH) * 60) / slotInterval);

      const checkCapacity = async (candidateDate) => {
        const start = new Date(candidateDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(candidateDate);
        end.setHours(23, 59, 59, 999);
        const snap = await getDocs(query(
          collection(db, 'appointments'),
          where('scheduledDate', '>=', Timestamp.fromDate(start)),
          where('scheduledDate', '<=', Timestamp.fromDate(end)),
          where('status', 'in', ['pending', 'confirmed']),
        ));
        return snap.size < maxSlotsPerDay;
      };

      const result = await findFirstBookableDate(target, 3, clinicSettings, checkCapacity);

      if (result.matchType === 'none') {
        Alert.alert(
          "Couldn't find an open day",
          `We couldn't find an open slot near ${formatDisplayDate(target)}. Please pick a date manually.`,
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
      `Your vet recommended a visit on ${formatDisplayDate(item.scheduledDate)}. You can still book manually from your pet's history later.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Yes, dismiss',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'appointments', item.id), {
                status: 'cancelled',
                auditReason: 'client-dismissed-followup',
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
          && item.auditReason !== 'client-dismissed-followup'
          && item.auditReason !== 'client-booked-followup'
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
    const dateStr = recommendedDate
      ? formatDisplayDate(item.scheduledDate, { weekday: 'short', month: 'short', day: 'numeric' })
      : 'soon';
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
            📅 {formatDisplayDate(item.scheduledDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
          <Text style={styles.date}>
            ⏰ {formatFirestoreTime(item.scheduledDate)}
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
                      borderColor: COLORS.danger,
                      marginRight: "auto",
                    },
                  ]}
                  onPress={() =>
                    handleCancelAppointment(item.id, item.serviceType || item.primaryService)
                  }
                >
                  <Text style={[styles.btnText, { color: COLORS.danger }]}>
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
                <Text style={[styles.btnText, { color: COLORS.accent }]}>
                  🧾 E-Receipt
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.rebookBtn]}
                onPress={() => handleRebook(item)}
              >
                <Text style={[styles.btnText, { color: COLORS.accent }]}>
                  🔄 Re-Book
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* RE-BOOK for no-show and carried-over */}
          {isHistory && (item.status === "no-show" || item.status === "carried-over") && (
            <TouchableOpacity
              style={[styles.btn, styles.rebookBtn]}
              onPress={() => handleRebook(item)}
            >
              <Text style={[styles.btnText, { color: COLORS.accent }]}>
                🔄 Re-Book
              </Text>
            </TouchableOpacity>
          )}

        </View>

        {/* CANCELLATION / VOID REASON — outside actionRow to avoid flex conflict */}
        {["cancelled", "no-show", "carried-over"].includes(item.status) && (() => {
          const raw = item.auditReason || item.rejectReason;
          const clean = sanitizeCancelReason(raw);
          return clean ? <Text style={styles.reasonText}>{clean}</Text> : null;
        })()}
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
      <SuperCard appointment={activeAppointment} clinicPhone={clinicPhone} clinicAddress={clinicAddress} queueAhead={queueAhead} />

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
          color={COLORS.accent}
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
                <Text style={{ color: COLORS.accent, fontWeight: "bold" }}>
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
              <ActivityIndicator color={COLORS.accent} style={{ marginVertical: 20 }} />
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
                      color: COLORS.muted,
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
            {receiptData?.refundAmount > 0 && (
              <View style={styles.receiptRefundRow}>
                <Text style={styles.receiptRefundLabel}>REFUND</Text>
                <Text style={styles.receiptRefundValue}>
                  -₱{receiptData.refundAmount}
                </Text>
              </View>
            )}
            <View style={styles.receiptTotalRow}>
              <Text style={styles.receiptTotalLabel}>GRAND TOTAL</Text>
              <Text style={styles.receiptTotalValue}>
                ₱{(receiptData?.total || 0) - (receiptData?.refundAmount || 0)}
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
  container: { flex: 1, padding: 20, backgroundColor: COLORS.cream },

  tabContainer: {
    flexDirection: "row",
    marginBottom: 10,
    backgroundColor: "#EFEBE9",
    borderRadius: 10,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8 },
  activeTab: { backgroundColor: COLORS.white, elevation: 2 },
  tabText: { fontWeight: "bold", color: COLORS.accentLight },
  activeTabText: { color: COLORS.accent },

  filterSection: { marginBottom: 15 },
  chipRow: { flexDirection: "row", marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#EFEBE9",
    marginRight: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  activeFilterChip: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterText: { color: COLORS.accent, fontWeight: "600", fontSize: 13 },
  activeFilterText: { color: COLORS.white },

  card: {
    backgroundColor: COLORS.white,
    padding: 15,
    borderRadius: 0,
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
  service: { fontSize: 16, fontWeight: "bold", color: COLORS.accent },
  pet: { fontSize: 14, color: COLORS.textSecondary },
  price: {
    fontWeight: "bold",
    color: COLORS.accent,
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
  date: { fontSize: 13, color: COLORS.textMuted },

  actionRow: {
    flexDirection: "row",
    marginTop: 10,
    justifyContent: "flex-end",
    gap: 10,
    alignItems: "center",
  },
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 0 },
  qrBtn: { backgroundColor: COLORS.brand },
  receiptBtn: {
    backgroundColor: "#EFEBE9",
    borderWidth: 1,
    borderColor: "#ccc",
  },
  rebookBtn: { borderWidth: 1, borderColor: COLORS.accent },
  btnText: { color: COLORS.white, fontWeight: "bold", fontSize: 12 },
  reasonText: {
    color: COLORS.danger,
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
    color: COLORS.textMuted,
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
    borderRadius: 0,
    alignItems: "center",
    width: "85%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    color: COLORS.accent,
  },

  receiptContent: {
    backgroundColor: "#FFFAFA",
    padding: 25,
    borderRadius: 0,
    width: "90%",
    borderStyle: "dashed",
    borderWidth: 2,
    borderColor: "#ccc",
  },
  receiptHeader: {
    fontSize: 22,
    fontWeight: "bold",
    color: COLORS.textPrimary,
    textAlign: "center",
    letterSpacing: 1,
  },
  receiptSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: 10,
  },
  receiptItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  receiptItemName: { fontSize: 14, fontWeight: "bold", color: COLORS.textPrimary },
  receiptItemQty: { fontSize: 12, color: COLORS.textMuted },
  receiptItemTotal: { fontSize: 14, fontWeight: "bold", color: COLORS.textPrimary },
  receiptRefundRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#FFCDD2',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 5,
  },
  receiptRefundLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.danger,
  },
  receiptRefundValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.danger,
  },
  receiptTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  receiptTotalLabel: { fontSize: 18, fontWeight: "bold", color: COLORS.textPrimary },
  receiptTotalValue: { fontSize: 20, fontWeight: "bold", color: COLORS.success },

  closeBtn: { marginTop: 20, padding: 10, alignSelf: "center" },
  closeText: { color: COLORS.danger, fontWeight: "bold", fontSize: 16 },

  // --- Follow-up ghost card (B5) ---
  followUpCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    borderRadius: 0,
    padding: 15,
    marginBottom: 15,
    elevation: 4,
    shadowColor: COLORS.warning,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: '#FFCC80',
    overflow: 'hidden',
  },
  followUpAccent: {
    width: 4,
    backgroundColor: COLORS.warning,
    marginRight: 12,
    borderRadius: 2,
  },
  followUpRibbon: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    color: COLORS.warning,
    marginBottom: 6,
  },
  followUpTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.brand,
    marginBottom: 2,
  },
  followUpSubtitle: {
    fontSize: 13,
    color: COLORS.accent,
    lineHeight: 18,
    marginBottom: 6,
  },
  followUpDate: {
    fontSize: 13,
    color: COLORS.accent,
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
    borderRadius: 0,
  },
  followUpBtnPrimary: {
    backgroundColor: COLORS.warning,
  },
  followUpBtnPrimaryText: {
    color: COLORS.white,
    fontWeight: '900',
    fontSize: 13,
  },
  followUpBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.accentLight,
  },
  followUpBtnSecondaryText: {
    color: COLORS.accent,
    fontWeight: '700',
    fontSize: 13,
  },
});

export default ClientAppointments;
