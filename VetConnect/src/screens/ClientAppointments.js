// The booking management list.
// Splits appointments into "Active" and "History." Allows users to cancel appointments,
// immediately freeing up the slot in the database. Provides access to their generated QR Codes.

import {
  arrayUnion,
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
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialIcons } from '@expo/vector-icons';
import QRCode from "react-native-qrcode-svg";
import { auth, db } from "../../firebaseConfig";
import { findFirstBookableDate } from "../hooks/useBookingEngine";
import { isActiveStatus } from "../utils/statusLabels";
import SuperCard from "../components/SuperCard";
import CaseDayCard from "../components/CaseDayCard";
import AppointmentCardContent from "../components/AppointmentCardContent";
import { useClinicContact } from "../hooks/useClinicContact";
import { formatDisplayDate, getLocalDateStr } from '../utils/helpers';
import { COLORS } from '../theme/mobileTokens';
import { buildCaseChains } from '../utils/buildCaseChains';
import { useNetwork } from "../context/NetworkContext";


const ClientAppointments = ({ navigation }) => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("upcoming");

  // Search + bottom sheet filter state
  const [searchText, setSearchText] = useState('');
  const [petFilterOpen, setPetFilterOpen] = useState(false);
  const [pendingPetFilters, setPendingPetFilters] = useState(new Set());
  const [activePetFilters, setActivePetFilters] = useState(new Set());
  const [serviceFilterOpen, setServiceFilterOpen] = useState(false);
  const [pendingServiceFilters, setPendingServiceFilters] = useState(new Set());
  const [activeServiceFilters, setActiveServiceFilters] = useState(new Set());

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
  const { isConnected } = useNetwork();

  const [queueAhead, setQueueAhead] = useState(null);

  // Personal clinic average wait time — computed from the client's own completed visits.
  // Only shown when >=3 completed visits have forensicSeal data (insufficient data = hide).
  const avgWaitMins = useMemo(() => {
    const withSeal = appointments.filter(a =>
      a.status === 'completed' && a.forensicSeal?.raw?.shiftQueue != null
    );
    if (withSeal.length < 3) return null;
    const total = withSeal.reduce((sum, a) => sum + a.forensicSeal.raw.shiftQueue, 0);
    return Math.round(total / withSeal.length);
  }, [appointments]);

  // Timeline collapse state for standalone history cards — keyed by appointment ID.
  // A Set of expanded IDs lets each card manage its own open/closed state independently.
  const [expandedTimelines, setExpandedTimelines] = useState(new Set());

  const toggleTimeline = (id) => {
    setExpandedTimelines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Encounter summary collapse state — separate from timeline collapse so both
  // can be expanded/collapsed independently per card.
  const [expandedEncounters, setExpandedEncounters] = useState(new Set());

  const toggleEncounter = (id) => {
    setExpandedEncounters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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

    const unsub = onSnapshot(
      q,
      (snapshot) => {
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
      },
      (error) => {
        console.warn("[ClientAppointments] Listener error:", error.message);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  // Real-time queue-ahead count for the active arrived appointment.
  // Filtered to the same serviceCategory so cross-department patients don't inflate the count.
  const activeArrived = appointments.find(a => a.status === 'arrived');
  const activeArrivedId = activeArrived?.id ?? null;
  const activeArrivedQueueNum = activeArrived?.queueNumber ?? null;
  const activeArrivedCategory = activeArrived?.serviceCategory || null;

  useEffect(() => {
    if (!activeArrivedId) {
      setQueueAhead(null);
      return;
    }

    const todayStr = activeArrived?.scheduledDateStr || getLocalDateStr();
    const myCategory = activeArrivedCategory || 'General';

    const q = query(
      collection(db, "appointments"),
      where("status", "==", "arrived"),
      where("scheduledDateStr", "==", todayStr)
    );

    const unsubQueue = onSnapshot(
      q,
      (snap) => {
        let ahead = 0;
        snap.forEach(d => {
          const data = d.data();
          const sameCategory = (data.serviceCategory || 'General') === myCategory;
          if (sameCategory && data.queueNumber < activeArrivedQueueNum && d.id !== activeArrivedId) ahead++;
        });
        setQueueAhead(ahead);
      },
      (error) => {
        console.warn("[ClientAppointments] Queue ahead error:", error.message);
      },
    );

    return () => unsubQueue();
  }, [activeArrivedId, activeArrivedQueueNum, activeArrivedCategory]);

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

  // CLIENT-SIDE CANCELLATION --- single appointment
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
                auditReasons: arrayUnion({ reason: 'Cancelled by Pet Owner', action: 'client-cancel', staffName: 'Client/Self', timestamp: Timestamp.now() }),
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

  // CLIENT ATTENDANCE CONFIRMATION — single appointment
  const handleConfirmAttendance = async (id) => {
    try {
      await updateDoc(doc(db, "appointments", id), {
        confirmedByClient: true,
        confirmedByClientAt: Timestamp.now(),
      });
    } catch (error) {
      Alert.alert("Error", "Could not confirm. Please try again.");
    }
  };


  // Navigate to BookAppointment in reschedule mode for a single appointment.
  const handleReschedule = (item) => {
    navigation.navigate("BookAppointment", {
      rescheduleMode: true,
      rescheduleAppointmentId: item.id,
      rescheduleAppointment: item,
    });
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
                auditReasons: arrayUnion({ reason: 'client-dismissed-followup', action: 'client-dismissed-followup', staffName: 'Client/Self', timestamp: Timestamp.now() }),
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
  const petCounts = useMemo(() => {
    const counts = new Map();
    appointments.forEach(a => {
      const name = a.petName || 'Unknown';
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return counts;
  }, [appointments]);

  const serviceCounts = useMemo(() => {
    const counts = new Map();
    appointments.forEach(a => {
      const svc = a.serviceType || a.primaryService || 'Other';
      counts.set(svc, (counts.get(svc) || 0) + 1);
    });
    return counts;
  }, [appointments]);

  // --- FILTER LOGIC (MULTI-AXIS) ---
  const filteredData = useMemo(() => {
    return appointments.filter((item) => {
      const isUpcomingTab = tab === 'upcoming';
      const isValidStatus = isUpcomingTab
        ? ['pending', 'confirmed', 'arrived', 'in-consult', 'billing', 'confined', 'dispensing', 'on-hold'].includes(item.status)
        : (
            ['completed', 'cancelled', 'no-show', 'carried-over'].includes(item.status)
            && item.auditReason !== 'client-dismissed-followup'
            && item.auditReason !== 'client-booked-followup'
          );
      if (!isValidStatus) return false;

      if (activePetFilters.size > 0 && !activePetFilters.has(item.petName)) return false;

      if (activeServiceFilters.size > 0) {
        const svc = item.serviceType || item.primaryService || 'Other';
        if (!activeServiceFilters.has(svc)) return false;
      }

      if (searchText.trim()) {
        const q = searchText.toLowerCase().trim();
        const haystack = [
          item.petName,
          item.serviceType,
          item.primaryService,
          ...(item.services || []).map(s => s.name),
          item.diagnosis,
          item.assignedVet,
          item.auditReason,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [appointments, tab, activePetFilters, activeServiceFilters, searchText]);

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
      <View key={item.id} style={{ marginBottom: 20 }}>
        <View style={styles.cardShadow} />
        <View style={styles.followUpCard}>
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
      </View>
    );
  };


  const renderItem = ({ item }) => {
    if (item._isCaseWrapper) {
      return (
        <CaseDayCard
          caseChain={item.caseChain}
          isHistory={tab === 'history'}
          salesByAppt={salesByAppt}
          onShowReceipt={handleShowReceipt}
          onRebook={handleRebook}
          navigation={navigation}
        />
      );
    }

    if (item.isFollowUp === true && item.status === 'pending') {
      return renderFollowUpRow(item);
    }

    const isHistory = tab === 'history';

    return (
      <View style={styles.cardOuter}>
        <View style={styles.cardShadow} />
        <View style={[styles.card, isHistory && styles.historyCard]}>
          <AppointmentCardContent
            appointment={item}
            isUpcoming={!isHistory}
            sale={salesByAppt[item.id]}
            onCancel={handleCancelAppointment}
            onReschedule={handleReschedule}
            onShowQR={handleShowQR}
            onShowReceipt={handleShowReceipt}
            onToggleTimeline={() => toggleTimeline(item.id)}
            isTimelineExpanded={expandedTimelines.has(item.id)}
            onToggleEncounter={() => toggleEncounter(item.id)}
            isEncounterExpanded={expandedEncounters.has(item.id)}
            onConfirmAttendance={handleConfirmAttendance}
            onDismissFollowUp={handleDismissFollowUp}
            onBookFollowUp={handleBookFollowUp}
            navigation={navigation}
            clinicAddress={clinicAddress}
          />
        </View>
      </View>
    );
  };

  // Derive the single active in-clinic appointment (if any) for the SuperCard.
  // Only the first active appointment is surfaced — multi-pet concurrent visits
  // are rare enough that a single-card view is acceptable for this pass.
  const activeAppointment = appointments.find(a => isActiveStatus(a.status)) || null;

  const [caseChainForSuperCard, setCaseChainForSuperCard] = useState([]);

  useEffect(() => {
    if (!activeAppointment || (activeAppointment.caseDay || 1) <= 1) {
      setCaseChainForSuperCard([]);
      return;
    }
    const { chains } = buildCaseChains(appointments);
    for (const [, members] of chains) {
      if (members.some(m => m.id === activeAppointment.id)) {
        setCaseChainForSuperCard(members);
        return;
      }
    }
    setCaseChainForSuperCard([activeAppointment]);
  }, [activeAppointment?.id, appointments]);

  return (
    <View style={styles.container}>
      {/* SUPER-CARD — pinned above tabs so it stays visible while switching tabs */}
      <SuperCard
        appointment={activeAppointment}
        clinicPhone={clinicPhone}
        queueAhead={queueAhead}
        avgWaitMins={avgWaitMins}
        caseChain={caseChainForSuperCard}
        salesByAppt={salesByAppt}
      />

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

      {appointments.length > 0 && (
        <View style={styles.searchFilterBar}>
          <View style={styles.searchInputWrapper}>
            <MaterialIcons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search appointments..."
              placeholderTextColor={COLORS.placeholder}
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <MaterialIcons name="close" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.filterIconBtn}
            onPress={() => { setPendingPetFilters(new Set(activePetFilters)); setPetFilterOpen(true); }}
          >
            <Text style={styles.filterIconEmoji}>🐾</Text>
            {activePetFilters.size > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activePetFilters.size}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.filterIconBtn}
            onPress={() => { setPendingServiceFilters(new Set(activeServiceFilters)); setServiceFilterOpen(true); }}
          >
            <Text style={styles.filterIconEmoji}>📋</Text>
            {activeServiceFilters.size > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeServiceFilters.size}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Expand All / Collapse All toggle — History tab only, above the FlatList */}
      {tab === 'history' && filteredData.length > 0 && (
        <View style={styles.expandCollapseRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              const hasAnyExpanded = expandedTimelines.size > 0 || expandedEncounters.size > 0;
              if (hasAnyExpanded) {
                setExpandedTimelines(new Set());
                setExpandedEncounters(new Set());
              } else {
                // Expand all standalone completed cards — skip group and case wrappers.
                const completedIds = new Set();
                filteredData.forEach((item) => {
                  if (item._isCaseWrapper) return;
                  if (item.status === 'completed') completedIds.add(item.id);
                });
                setExpandedTimelines(new Set(completedIds));
                setExpandedEncounters(new Set(completedIds));
              }
            }}
          >
            <Text style={styles.expandCollapseText}>
              {(expandedTimelines.size > 0 || expandedEncounters.size > 0)
                ? '▲ COLLAPSE ALL'
                : '▼ EXPAND ALL'}
            </Text>
          </TouchableOpacity>
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
            const followUps = tab === 'upcoming'
              ? base.filter(a => a.isFollowUp && a.status === 'pending')
                  .sort((a, b) => (a.scheduledDate?.toMillis() || 0) - (b.scheduledDate?.toMillis() || 0))
              : [];
            const standaloneItems = base.filter(a => !(a.isFollowUp && a.status === 'pending'));

            const { chains, standaloneIds } = buildCaseChains(standaloneItems);

            const caseWrappers = [];
            for (const [rootId, chainMembers] of chains) {
              caseWrappers.push({
                _isCaseWrapper: true,
                id: `case-${rootId}`,
                caseChain: chainMembers,
              });
            }

            const remainingStandalones = standaloneItems.filter(a => standaloneIds.has(a.id));

            return [...followUps, ...caseWrappers, ...remainingStandalones];
          })()}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              {!isConnected ? (
                <>
                  <Text style={{ fontSize: 40 }}>📡</Text>
                  <Text style={styles.empty}>OFFLINE</Text>
                  <Text style={{ color: COLORS.accent, fontSize: 13, textAlign: 'center', marginTop: 6 }}>
                    Your bookings will appear when you reconnect.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 40 }}>📭</Text>
                  <Text style={styles.empty}>
                    No {tab} records match your filters.
                  </Text>
                  <TouchableOpacity
                    style={{ marginTop: 15, padding: 10 }}
                    onPress={() => {
                      setSearchText('');
                      setActivePetFilters(new Set());
                      setActiveServiceFilters(new Set());
                    }}
                  >
                    <Text style={{ color: COLORS.accent, fontWeight: "bold" }}>
                      Clear Filters
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          }
        />
      )}

      {/* PET FILTER BOTTOM SHEET */}
      <Modal visible={petFilterOpen} transparent animationType="slide" onRequestClose={() => setPetFilterOpen(false)}>
        <TouchableOpacity style={styles.filterOverlay} activeOpacity={1} onPress={() => setPetFilterOpen(false)}>
          <View style={styles.filterSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.filterSheetHandle} />
            <Text style={styles.filterSheetTitle}>FILTER BY PET</Text>
            <ScrollView style={styles.filterSheetScroll}>
              {[...petCounts.entries()].map(([pet, count]) => {
                const isChecked = pendingPetFilters.has(pet);
                return (
                  <TouchableOpacity key={pet} style={styles.filterSheetRow} onPress={() => {
                    setPendingPetFilters(prev => {
                      const next = new Set(prev);
                      if (next.has(pet)) next.delete(pet); else next.add(pet);
                      return next;
                    });
                  }}>
                    <MaterialIcons name={isChecked ? 'check-box' : 'check-box-outline-blank'} size={22} color={isChecked ? COLORS.sky : COLORS.textMuted} />
                    <Text style={styles.filterSheetLabel}>{pet}</Text>
                    <Text style={styles.filterSheetCount}>({count})</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.filterSheetActions}>
              <TouchableOpacity onPress={() => setPendingPetFilters(new Set())} style={styles.filterSheetClearBtn}>
                <Text style={styles.filterSheetClearText}>CLEAR ALL</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setActivePetFilters(new Set(pendingPetFilters)); setPetFilterOpen(false); }} style={styles.filterSheetApplyBtn}>
                <Text style={styles.filterSheetApplyText}>APPLY FILTER</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* SERVICE FILTER BOTTOM SHEET */}
      <Modal visible={serviceFilterOpen} transparent animationType="slide" onRequestClose={() => setServiceFilterOpen(false)}>
        <TouchableOpacity style={styles.filterOverlay} activeOpacity={1} onPress={() => setServiceFilterOpen(false)}>
          <View style={styles.filterSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.filterSheetHandle} />
            <Text style={styles.filterSheetTitle}>FILTER BY SERVICE</Text>
            <ScrollView style={styles.filterSheetScroll}>
              {[...serviceCounts.entries()].map(([svc, count]) => {
                const isChecked = pendingServiceFilters.has(svc);
                return (
                  <TouchableOpacity key={svc} style={styles.filterSheetRow} onPress={() => {
                    setPendingServiceFilters(prev => {
                      const next = new Set(prev);
                      if (next.has(svc)) next.delete(svc); else next.add(svc);
                      return next;
                    });
                  }}>
                    <MaterialIcons name={isChecked ? 'check-box' : 'check-box-outline-blank'} size={22} color={isChecked ? COLORS.sky : COLORS.textMuted} />
                    <Text style={styles.filterSheetLabel}>{svc}</Text>
                    <Text style={styles.filterSheetCount}>({count})</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.filterSheetActions}>
              <TouchableOpacity onPress={() => setPendingServiceFilters(new Set())} style={styles.filterSheetClearBtn}>
                <Text style={styles.filterSheetClearText}>CLEAR ALL</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setActiveServiceFilters(new Set(pendingServiceFilters)); setServiceFilterOpen(false); }} style={styles.filterSheetApplyBtn}>
                <Text style={styles.filterSheetApplyText}>APPLY FILTER</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

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
    flexDirection: 'row',
    marginBottom: 10,
    backgroundColor: COLORS.cream,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    padding: 0,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 0 },
  activeTab: { backgroundColor: COLORS.sky },
  tabText: { fontWeight: '900', color: COLORS.accent, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  activeTabText: { color: COLORS.cream },

  searchFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    padding: 0,
  },
  filterIconBtn: {
    width: 40,
    height: 40,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterIconEmoji: {
    fontSize: 18,
  },
  filterBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: COLORS.sky,
    borderRadius: 0,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.brand,
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.cream,
  },
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    backgroundColor: COLORS.cream,
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
    paddingBottom: 30,
    maxHeight: '60%',
  },
  filterSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.borderLight,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  filterSheetTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  filterSheetScroll: {
    paddingHorizontal: 20,
  },
  filterSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  filterSheetLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.brand,
  },
  filterSheetCount: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  filterSheetActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  filterSheetClearBtn: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  filterSheetClearText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterSheetApplyBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: COLORS.sky,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    alignItems: 'center',
  },
  filterSheetApplyText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.cream,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  cardOuter: {
    marginBottom: 20,
  },
  cardShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: COLORS.brand,
  },
  card: {
    backgroundColor: COLORS.white,
    padding: 15,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  historyCard: { backgroundColor: COLORS.white },
  divider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: 10 },

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
    backgroundColor: COLORS.white,
    padding: 30,
    borderRadius: 0,
    alignItems: 'center',
    width: '85%',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    color: COLORS.accent,
  },

  receiptContent: {
    backgroundColor: COLORS.white,
    padding: 25,
    borderRadius: 0,
    width: '90%',
    borderStyle: 'solid',
    borderWidth: 2,
    borderColor: COLORS.border,
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
    borderTopColor: COLORS.danger,
    backgroundColor: COLORS.dangerBg,
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

  closeBtn: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: COLORS.danger,
    borderRadius: 0,
    backgroundColor: COLORS.white,
  },
  closeText: { color: COLORS.danger, fontWeight: '900', fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5 },

  // --- Follow-up ghost card ---
  followUpCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.warningBg,
    borderRadius: 0,
    padding: 15,
    borderWidth: 2,
    borderColor: COLORS.warning,
    overflow: 'hidden',
  },
  followUpAccent: {
    width: 4,
    backgroundColor: COLORS.warning,
    marginRight: 12,
    borderRadius: 0,
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

  expandCollapseRow: {
    alignItems: 'flex-end',
    paddingBottom: 8,
  },
  expandCollapseText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.sky,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

});

export default ClientAppointments;
