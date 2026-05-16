// The booking management list.
// Splits appointments into "Active" and "History." Allows users to cancel appointments,
// immediately freeing up the slot in the database. Provides access to their generated QR Codes.

import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialIcons } from '@expo/vector-icons';
import QRCode from "react-native-qrcode-svg";
import Svg, { Polygon } from "react-native-svg";
import { auth, db } from "../../firebaseConfig";
import { findFirstBookableDate } from "../hooks/useBookingEngine";
import { isActiveStatus } from "../utils/statusLabels";
import SuperCard from "../components/SuperCard";
import CaseDayCard from "../components/CaseDayCard";
import AppointmentCardContent from "../components/AppointmentCardContent";
import { useClinicContact } from "../hooks/useClinicContact";
import { formatDisplayDate, getLocalDateStr } from '../utils/helpers';
import { COLORS, FONTS, SHADOW } from '../theme/mobileTokens';
import { buildCaseChains } from '../utils/buildCaseChains';
import { useNetwork } from "../context/NetworkContext";


const ClientAppointments = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const PAGE_SIZE = 30;
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasLoadedMoreRef = useRef(false);
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

  const { clinicPhone, clinicAddress, clinicName, clinicTIN } = useClinicContact();
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

  // Pull-to-refresh handler.
  // The onSnapshot listener already keeps data fresh. This provides the visual
  // affordance users expect — spinner shows briefly then auto-dismisses.
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const prevCompletedIdsRef = useRef('');
  const prevParentIdsRef = useRef('');

  // 1. Fetch Data
  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, "appointments"),
      where("ownerId", "==", auth.currentUser.uid),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE),
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

        // Pagination cursor tracking — only update if user hasn't loaded older pages yet
        if (!hasLoadedMoreRef.current) {
          const docs = snapshot.docs;
          if (docs.length < PAGE_SIZE) {
            setHasMore(false);
          } else {
            setHasMore(true);
            setLastDoc(docs[docs.length - 1]);
          }
        }

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

  // Load next page of older appointments using getDocs (not real-time).
  // Older pages are static — only page 1 is live via onSnapshot.
  const loadMore = async () => {
    if (!lastDoc || loadingMore || !hasMore) return;
    hasLoadedMoreRef.current = true;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, "appointments"),
        where("ownerId", "==", auth.currentUser.uid),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(PAGE_SIZE),
      );
      const snap = await getDocs(q);
      const older = [];
      snap.forEach((docSnap) => {
        older.push({ id: docSnap.id, ...docSnap.data() });
      });

      if (snap.docs.length < PAGE_SIZE) {
        setHasMore(false);
      } else {
        setLastDoc(snap.docs[snap.docs.length - 1]);
      }

      setAppointments(prev => {
        // Deduplicate — page 1 listener may overlap with older pages
        const existingIds = new Set(prev.map(a => a.id));
        const newItems = older.filter(a => !existingIds.has(a.id));
        return [...prev, ...newItems];
      });
    } catch (error) {
      console.warn('[ClientAppointments.loadMore]:', error.message);
    } finally {
      setLoadingMore(false);
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
    // Prime with basic info from the appointment while loading full sale data
    setReceiptData({ 
      clinicName: item.clinicName, 
      date: item.scheduledDate, 
      items: [] 
    });
    try {
      const q = query(
        collection(db, "sales"),
        where("appointmentId", "==", item.id),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setReceiptData({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setReceiptData({
          items: [
            { name: item.serviceType || item.primaryService || 'General Service', price: item.servicePrice || 0, qty: 1 },
          ],
          total: item.servicePrice || 0,
          clinicName: item.clinicName,
          date: item.scheduledDate,
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
              // T4.205: Read appointment before cancelling to get scheduledDate + departments
              // so we can delete the corresponding reservation docs to free the slot.
              const apptSnap = await getDoc(doc(db, "appointments", id));
              const apptData = apptSnap.exists() ? apptSnap.data() : null;

              await updateDoc(doc(db, "appointments", id), {
                status: "cancelled",
                auditReason: "Cancelled by Pet Owner",
                auditReasons: arrayUnion({ reason: 'Cancelled by Pet Owner', action: 'client-cancel', staffName: 'Client/Self', timestamp: Timestamp.now() }),
                cancelledAt: Timestamp.now(),
              });

              // T4.205: Delete reservation docs to free the slot for other clients
              if (apptData?.scheduledDate) {
                const slotDate = apptData.scheduledDate.toDate();
                const dateStr = `${slotDate.getFullYear()}-${String(slotDate.getMonth() + 1).padStart(2, '0')}-${String(slotDate.getDate()).padStart(2, '0')}`;
                const hh = String(slotDate.getHours()).padStart(2, '0');
                const mm = String(slotDate.getMinutes()).padStart(2, '0');

                const depts = new Set();
                if (apptData.services && Array.isArray(apptData.services)) {
                  apptData.services.forEach(s => depts.add((s.department || "General").toLowerCase()));
                } else {
                  depts.add((apptData.serviceCategory || "General").toLowerCase());
                }

                // Fire-and-forget — the appointment is already cancelled; reservation
                // cleanup is best-effort. Missing docs are silently ignored.
                Promise.all(
                  [...depts].map(dept =>
                    deleteDoc(doc(db, "slot_reservations", `${dateStr}_${hh}_${mm}_${dept}`))
                      .catch(() => {})
                  )
                );
              }

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
    })().catch(err => {
      Alert.alert('Follow-Up Error', err.message || 'Could not prepare follow-up booking.');
    });
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


  const renderItem = ({ item, index }) => {
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

    const stackRotation = !isHistory ? (index % 2 === 0 ? '-0.5deg' : '0.5deg') : '0deg';

    return (
      <View style={[styles.cardOuter, !isHistory && { transform: [{ rotate: stackRotation }] }]}>
        <View style={styles.cardShadow} />
        {!isHistory && <ZigZagEdgeTop />}
        <View style={[
          styles.card, 
          isHistory && styles.historyCard,
          !isHistory && { borderTopWidth: 0, marginTop: -2 }
        ]}>
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
      {/* Offline staleness indicator */}
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <MaterialIcons name="wifi-off" size={16} color={COLORS.warning} />
          <Text style={styles.offlineBannerText}>
            You are offline — data may be stale
          </Text>
        </View>
      )}

      {/* SUPER-CARD — pinned above tabs so it stays visible while switching tabs */}
      <SuperCard
        appointment={activeAppointment}
        clinicPhone={clinicPhone}
        queueAhead={queueAhead}
        queueDepartment={activeArrivedCategory || 'General'}
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
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 60 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.sky}
              colors={[COLORS.sky]}
            />
          }
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
          ListFooterComponent={
            hasMore && !loading ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <ActivityIndicator size="small" color={COLORS.sky} />
                ) : (
                  <Text style={styles.loadMoreText}>LOAD OLDER BOOKINGS</Text>
                )}
              </TouchableOpacity>
            ) : null
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
          <View style={styles.receiptContainer}>
            {/* Neubrutalist Shadow */}
            <View style={styles.receiptShadow} />
            
            <View style={styles.receiptContent}>
              {/* Top Perforation */}
              <View style={styles.perforationRow}>
                {[...Array(12)].map((_, i) => (
                  <View key={i} style={styles.perforationHole} />
                ))}
              </View>

              <View style={styles.receiptInner}>
                <Text style={styles.receiptHeader}>
                  {receiptData?.clinicName || clinicName || 'VET CLINIC'}
                </Text>
                { (receiptData?.clinicAddress || clinicAddress) && (
                  <Text style={[styles.receiptMetaValue, { textAlign: 'center', fontSize: 10, color: COLORS.textMuted }]}>
                    {receiptData?.clinicAddress || clinicAddress}
                  </Text>
                )}
                { (receiptData?.clinicPhone || clinicPhone) && (
                  <Text style={[styles.receiptMetaValue, { textAlign: 'center', fontSize: 10, color: COLORS.textMuted }]}>
                    TEL: {receiptData?.clinicPhone || clinicPhone}
                  </Text>
                )}
                { (receiptData?.clinicTIN || clinicTIN) && (
                  <Text style={[styles.receiptMetaValue, { textAlign: 'center', fontSize: 10, color: COLORS.textMuted }]}>
                    TIN: {receiptData?.clinicTIN || clinicTIN}
                  </Text>
                )}
                <Text style={styles.receiptSub}>Official E-Receipt</Text>
                
                <View style={styles.receiptMetaRow}>
                  <View>
                    <Text style={styles.receiptMetaLabel}>RECEIPT #</Text>
                    <Text style={styles.receiptMetaValue}>
                      {receiptData?.receiptNumber || receiptData?.id?.slice(0, 8).toUpperCase() || 'DRAFT'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.receiptMetaLabel}>DATE</Text>
                    <Text style={styles.receiptMetaValue}>
                      {(() => {
                        const d = receiptData?.date;
                        if (!d) return new Date().toLocaleDateString();
                        if (d.seconds) return new Date(d.seconds * 1000).toLocaleDateString();
                        return new Date(d).toLocaleDateString();
                      })()}
                    </Text>
                  </View>
                </View>

                <View style={[styles.receiptMetaRow, { marginTop: 4 }]}>
                  <View>
                    <Text style={styles.receiptMetaLabel}>CASHIER</Text>
                    <Text style={styles.receiptMetaValue}>
                      {(receiptData?.cashier || receiptData?.processedBy || 'ADMIN').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.receiptDividerDashed} />

                {loadingReceipt ? (
                  <ActivityIndicator color={COLORS.accent} style={{ marginVertical: 20 }} />
                ) : (
                  <ScrollView style={{ width: "100%", maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                    {receiptData?.items?.map((item, i) => (
                      <View key={i} style={styles.receiptItemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.receiptItemName}>{item.name}</Text>
                          <Text style={styles.receiptItemQty}>
                            {item.qty || 1}x @ ₱{(item.price || 0).toLocaleString()}
                          </Text>
                        </View>
                        <Text style={styles.receiptItemTotal}>
                          ₱{((item.qty || 1) * (item.price || 0)).toLocaleString()}
                        </Text>
                      </View>
                    ))}
                    {receiptData?.isFallback && (
                      <View style={styles.receiptFallbackBanner}>
                        <MaterialIcons name="info-outline" size={14} color={COLORS.warning} />
                        <Text style={styles.receiptFallbackText}>
                          Estimated — final receipt available after checkout
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                )}

                <View style={styles.receiptDividerDashed} />

                {receiptData?.refundAmount > 0 && (
                  <View style={styles.receiptRefundRow}>
                    <Text style={styles.receiptRefundLabel}>REFUND</Text>
                    <Text style={styles.receiptRefundValue}>
                      -₱{receiptData.refundAmount?.toLocaleString()}
                    </Text>
                  </View>
                )}

                <View style={styles.receiptTotalRow}>
                  <Text style={styles.receiptTotalLabel}>GRAND TOTAL</Text>
                  <Text style={styles.receiptTotalValue}>
                    ₱{((receiptData?.total || 0) - (receiptData?.refundAmount || 0)).toLocaleString()}
                  </Text>
                </View>

                <View style={styles.receiptFooter}>
                  <Text style={styles.receiptFooterText}>THANK YOU FOR TRUSTING US!</Text>
                  <Text style={styles.receiptFooterSub}>Visit again soon 🐾</Text>
                </View>
              </View>

              {/* Bottom Perforation */}
              <View style={[styles.perforationRow, { marginTop: 10 }]}>
                {[...Array(12)].map((_, i) => (
                  <View key={i} style={styles.perforationHole} />
                ))}
              </View>
            </View>
          </View>

          <View style={{ alignSelf: 'center', position: 'relative', marginTop: 30 }}>
            <View style={styles.receiptCloseBtnShadow} />
            <TouchableOpacity
              style={styles.receiptCloseBtn}
              onPress={() => setShowReceipt(false)}
            >
              <Text style={styles.receiptCloseText}>CLOSE</Text>
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

  receiptContainer: {
    width: '90%',
    position: 'relative',
  },
  receiptShadow: {
    ...SHADOW.form,
  },
  receiptContent: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.border,
    paddingVertical: 10,
  },
  perforationRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 5,
  },
  perforationHole: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  receiptInner: {
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  receiptHeader: {
    fontSize: 24,
    fontFamily: FONTS.black,
    color: COLORS.brand,
    textAlign: "center",
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  receiptSub: {
    fontSize: 11,
    fontFamily: FONTS.bold,
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: 20,
    letterSpacing: 1,
  },
  receiptMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  receiptMetaLabel: {
    fontSize: 9,
    fontFamily: FONTS.bold,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  receiptMetaValue: {
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '900',
    color: COLORS.accent,
  },
  receiptDividerDashed: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderStyle: 'dashed',
    marginVertical: 15,
  },
  receiptItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  receiptItemName: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.brand,
  },
  receiptItemQty: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  receiptItemTotal: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.brand,
  },
  receiptRefundRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    padding: 8,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  receiptRefundLabel: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.danger,
  },
  receiptRefundValue: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: COLORS.danger,
  },
  receiptTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: 'center',
    marginTop: 5,
  },
  receiptTotalLabel: {
    fontSize: 18,
    fontFamily: FONTS.black,
    color: COLORS.brand,
  },
  receiptTotalValue: {
    fontSize: 22,
    fontFamily: FONTS.black,
    color: COLORS.success,
  },
  receiptFooter: {
    marginTop: 30,
    alignItems: 'center',
  },
  receiptFooterText: {
    fontSize: 11,
    fontFamily: FONTS.black,
    color: COLORS.brand,
    letterSpacing: 0.5,
  },
  receiptFooterSub: {
    fontSize: 12,
    marginTop: 4,
  },
  receiptCloseBtnShadow: {
    ...SHADOW.button,
  },
  receiptCloseBtn: {
    paddingVertical: 12,
    paddingHorizontal: 25,
    backgroundColor: COLORS.brand,
    borderWidth: 2,
    borderColor: COLORS.brand,
  },
  receiptCloseText: {
    color: COLORS.cream,
    fontFamily: FONTS.black,
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

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

  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.warningBg,
    borderWidth: 2,
    borderColor: COLORS.warning,
    borderRadius: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  offlineBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  receiptFallbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: 0,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  receiptFallbackText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.warning,
    fontStyle: 'italic',
  },

  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,
    backgroundColor: COLORS.white,
  },
  loadMoreText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.sky,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

});

function ZigZagEdgeTop() {
  return (
    <View style={{ width: '100%', height: 10, overflow: 'hidden', marginBottom: 0, zIndex: 5 }}>
      <Svg height="10" width="100%" preserveAspectRatio="none" viewBox="0 0 100 10">
        <Polygon
          points="0,5 5,0 10,5 15,0 20,5 25,0 30,5 35,0 40,5 45,0 50,5 55,0 60,5 65,0 70,5 75,0 80,5 85,0 90,5 95,0 100,5 100,10 0,10"
          fill={COLORS.white}
          stroke={COLORS.brand}
          strokeWidth="0.5"
        />
      </Svg>
    </View>
  );
}

export default ClientAppointments;
