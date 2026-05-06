import DateTimePicker from "@react-native-community/datetimepicker";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList, // THE FIX: Mandatory for high-performance large lists!
  Modal, // THE FIX: New Explorer Modal!
} from "react-native";
import { auth, db } from "../../firebaseConfig";

// THE BRAIN
import { useSafeAreaInsets } from "react-native-safe-area-context"; // <-- THE FIX: Hardware measurement hook
import { useBookingEngine } from "../hooks/useBookingEngine";
import { formatDisplayDate, formatDisplayTime, getLocalDateStr, resolveTieredPrice } from '../utils/helpers';
import { COLORS } from '../theme/mobileTokens';
import { useNetwork } from "../context/NetworkContext";

export default function BookAppointment({ navigation, route }) {
  const insets = useSafeAreaInsets();

  const prefillPetId = route?.params?.prefillPetId || null;
  const prefillServiceType = route?.params?.prefillServiceType || null;
  const prefillDate = route?.params?.prefillDate || null;
  const prefillDateMatchType = route?.params?.prefillDateMatchType || null;
  const prefillTargetDate = route?.params?.prefillTargetDate || null;
  const fromFollowUp = route?.params?.fromFollowUp === true;
  const ghostAppointmentId = route?.params?.ghostAppointmentId || null;

  // Reschedule mode: reuses Step 3 (slot picker) and a trimmed Step 4 (reason + confirm).
  // The existing appointment is updated in-place — no new document is created.
  const rescheduleMode = route?.params?.rescheduleMode === true;
  const rescheduleAppointmentId = route?.params?.rescheduleAppointmentId || null;
  const rescheduleAppointment = route?.params?.rescheduleAppointment || null;

  // Ensures the prefillDate jump-to-step-3 effect fires at most once per mount.
  const prefillApplied = useRef(false);
  // Ensures the reschedule jump-to-step-3 effect fires at most once per mount.
  const rescheduleApplied = useRef(false);

  // --- ENTERPRISE WIZARD STATE ---
  const [step, setStep] = useState(1);

  // --- DATA STATES ---
  const [selectedPet, setSelectedPet] = useState(null);
  const [selectedServices, setSelectedServices] = useState([]);
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loading, setLoading] = useState(false);

  // Reschedule reason — required (Amendment 2). Empty string disables the Confirm button.
  const [rescheduleReason, setRescheduleReason] = useState("");

  // --- SCALABILITY STATES ---
  const [serviceSearch, setServiceSearch] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("All");
  const [ownerName, setOwnerName] = useState("");
  const [petSearch, setPetSearch] = useState(""); // THE FIX: Searchable Pets!
  
  // --- DEPARTMENT EXPLORER MODAL STATES ---
  const [isDeptModalVisible, setIsDeptModalVisible] = useState(false);
  const [deptModalSearch, setDeptModalSearch] = useState("");
  const [deptSortOrder, setDeptSortOrder] = useState("name"); // "name" (A-Z) or "count" (high to low)

  // --- NO-SHOW DETECTION ---
  // Populated after pet selection. Shown as an informational warning banner.
  const [noShowInfo, setNoShowInfo] = useState(null);

  // T4.147: Outstanding balance from previous completed visits.
  // One-shot query on mount — balance is unlikely to change while booking.
  const [outstandingBalance, setOutstandingBalance] = useState(0);

  const { isConnected } = useNetwork();

  // THE FIX: Destructuring clinicSettings from the hook!
  const {
    pets,
    services,
    availableSlots,
    busynessLevel,
    fetching,
    loadingSlots,
    clinicSettings,
    departmentCapacity, // THE FIX: Essential for the final submitBooking calculation!
  } = useBookingEngine(date, selectedServices, selectedPet);
  
  // THE FIX: High performance searching for large pet lists!
  const filteredPets = useMemo(() => {
    if (!petSearch) return pets;
    return pets.filter(p => p.name.toLowerCase().includes(petSearch.toLowerCase()));
  }, [pets, petSearch]);

  // Pre-select the pet when navigating via Re-Book. Idempotent: only fires when
  // the pet list has loaded and the user hasn't already made a selection.
  useEffect(() => {
    if (prefillPetId && pets.length > 0 && !selectedPet) {
      const match = pets.find(p => p.id === prefillPetId);
      if (match) {
        setSelectedPet(match);
        setSelectedServices([]);
      }
    }
  }, [prefillPetId, pets]);

  // Pre-select the service for the prefilled pet. Matches by serviceType string
  // (stored on the appointment) or by service name as a fallback.
  useEffect(() => {
    if (prefillServiceType && prefillPetId && services.length > 0) {
      if (selectedServices.length > 0) return;
      const match = services.find(
        s => s.serviceType === prefillServiceType || s.name === prefillServiceType,
      );
      if (match) {
        setSelectedServices([match]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillServiceType, prefillPetId, services]);

  // When arriving from a follow-up deep-link, jump directly to the slot picker (step 3)
  // once both pet and service have been pre-selected by the two effects above.
  useEffect(() => {
    if (prefillApplied.current) return;
    if (prefillDate && !fetching && selectedPet && selectedServices.length > 0) {
      const parsed = new Date(prefillDate);
      if (!isNaN(parsed.getTime())) {
        setDate(parsed);
        setStep(3);
        prefillApplied.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillDate, fetching, selectedPet, selectedServices.length]);

  // Reschedule mode: seed pet and services from the appointment object passed via navigation params.
  // Runs only when the pet/service lists have loaded from Firestore.
  useEffect(() => {
    if (!rescheduleMode || !rescheduleAppointment) return;
    if (pets.length > 0 && !selectedPet) {
      const match = pets.find(p => p.id === rescheduleAppointment.petId);
      if (match) {
        setSelectedPet(match);
        setSelectedServices([]);
      }
    }
    if (services.length > 0 && rescheduleAppointment.petId) {
      if (selectedServices.length > 0) return;
      const apptServices = rescheduleAppointment.services || [];
      const matched = apptServices
        .map(as => services.find(s => s.id === as.id || s.name === as.name))
        .filter(Boolean);
      if (matched.length > 0) {
        setSelectedServices(matched);
      } else {
        const fallback = services.find(s => s.name === rescheduleAppointment.serviceType);
        if (fallback) {
          setSelectedServices([fallback]);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rescheduleMode, rescheduleAppointment, pets, services]);

  // Once both pet and services are seeded in reschedule mode, default the date picker to
  // the appointment's existing date and jump straight to the slot picker (Step 3).
  useEffect(() => {
    if (!rescheduleMode || rescheduleApplied.current) return;
    if (selectedPet && selectedServices.length > 0) {
      const rawDate = rescheduleAppointment?.scheduledDate;
      const existingDate = typeof rawDate?.toDate === 'function'
        ? rawDate.toDate()
        : new Date(rawDate);
      if (existingDate && !isNaN(existingDate.getTime())) {
        setDate(existingDate);
      }
      setStep(3);
      rescheduleApplied.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rescheduleMode, selectedPet, selectedServices.length]);

  // Outstanding balance — reads from SALES collection (single source of truth).
  // Matches admin's computation in usePatientManager.js + ClientDashboard.js.
  useEffect(() => {
    if (!auth.currentUser) return;
    (async () => {
      try {
        const q = query(
          collection(db, 'sales'),
          where('ownerId', '==', auth.currentUser.uid),
        );
        const snap = await getDocs(q);
        const total = snap.docs.reduce((sum, d) => {
          const data = d.data();
          if (data.status === 'refunded' || data.status === 'voided') return sum;
          const bal = data.balanceRemaining || 0;
          return sum + (bal > 0 ? bal : 0);
        }, 0);
        setOutstandingBalance(total);
      } catch (err) {
        console.warn('[BookAppointment] Balance check failed:', err.message);
      }
    })();
  }, []);

  // Configured no-show lookback window — falls back to 30 days if Firestore hasn't loaded yet.
  const noShowWindowDays = clinicSettings?.noShowLinkWindowDays || 30;

  // Detect recent no-shows whenever the selected pet changes.
  // Runs an inline query because the mobile app cannot import from VetConnect-Admin.
  useEffect(() => {
    const petIds = selectedPet ? [selectedPet.id].filter(Boolean) : [];
    if (petIds.length === 0) {
      setNoShowInfo(null);
      return;
    }

    let cancelled = false;
    const runDetection = async () => {
      try {
        const manilaToday = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
        manilaToday.setHours(0, 0, 0, 0);
        const cutoff = new Date(manilaToday);
        cutoff.setDate(cutoff.getDate() - noShowWindowDays);

        // Batch in groups of 30 (Firestore `in` limit)
        const batches = [];
        for (let i = 0; i < petIds.length; i += 30) {
          batches.push(petIds.slice(i, i + 30));
        }

        const allNoShows = [];
        for (const batch of batches) {
          const q = query(
            collection(db, 'appointments'),
            where('petId', 'in', batch),
            where('status', '==', 'no-show'),
          );
          const snap = await getDocs(q);
          snap.docs.forEach((d) => {
            const data = { id: d.id, ...d.data() };
            const raw = data.scheduledDate;
            const apptDate = raw?.toDate ? raw.toDate() : new Date(raw);
            if (!isNaN(apptDate.getTime()) && apptDate >= cutoff) {
              allNoShows.push(data);
            }
          });
        }

        if (cancelled) return;

        if (allNoShows.length === 0) {
          setNoShowInfo(null);
          return;
        }

        allNoShows.sort((a, b) => {
          const toMs = (d) => {
            const raw = d.scheduledDate;
            return (raw?.toDate ? raw.toDate() : new Date(raw)).getTime();
          };
          return toMs(b) - toMs(a);
        });

        setNoShowInfo({ count: allNoShows.length, mostRecent: allNoShows[0] });
      } catch (e) {
        if (!cancelled) setNoShowInfo(null);
      }
    };

    runDetection();
    return () => { cancelled = true; };
  }, [selectedPet, noShowWindowDays]);

  // THE FIX: High performance department statistics & sorting!
  const departmentStats = useMemo(() => {
    // 1. Filter services by selected pet's species
    let baseList = services;
    if (selectedPet) {
      const speciesKey = selectedPet.species === "Dog" || selectedPet.species === "Canine" ? "Canine" : "Feline";
      baseList = baseList.filter((s) => !s.targetSpecies || s.targetSpecies === "Universal" || s.targetSpecies === speciesKey);
    }

    // 2. Count occurrences per department
    const counts = {};
    baseList.forEach(s => {
        const d = s.department || s.category || "General";
        counts[d] = (counts[d] || 0) + 1;
    });

    // 3. Convert to filterable/sortable array
    let statsArray = Object.keys(counts).map(name => ({
        name,
        count: counts[name]
    }));

    // 4. Filter by Modal Search
    if (deptModalSearch) {
        statsArray = statsArray.filter(d => 
            d.name.toLowerCase().includes(deptModalSearch.toLowerCase())
        );
    }

    // 5. Sort
    if (deptSortOrder === "name") {
        statsArray.sort((a, b) => a.name.localeCompare(b.name));
    } else {
        statsArray.sort((a, b) => b.count - a.count);
    }

    return statsArray;
  }, [services, selectedPet, deptModalSearch, deptSortOrder]);

  // THE FIX: Memoized filtering for services by department, search, AND species!
  const displayedServices = useMemo(() => {
    // 1. Biological Filter Step
    let list = services;
    if (selectedPet) {
      const speciesKey = selectedPet.species === "Dog" || selectedPet.species === "Canine" ? "Canine" : "Feline";
      list = list.filter((s) =>
        !s.targetSpecies ||
        s.targetSpecies === "Universal" ||
        s.targetSpecies === speciesKey
      );
    }

    // 2. Department & Search Filter Step
    if (selectedDepartment !== "All") {
      list = list.filter((s) => (s.department || s.category) === selectedDepartment);
    }
    if (serviceSearch) {
      list = list.filter((s) =>
        s.name.toLowerCase().includes(serviceSearch.toLowerCase())
      );
    }
    return list;
  }, [services, selectedDepartment, serviceSearch, selectedPet]);

  // --- INITIALIZATION ---
  useEffect(() => {
    // If the app opens and it's already past the default closing time, bump to tomorrow
    const now = new Date();
    const closeHour = clinicSettings?.closeHour || 17;
    if (now.getHours() >= closeHour) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDate(tomorrow);
    }

    const initializeUser = async () => {
      try {
        const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userSnap.exists()) {
          const userData = userSnap.data();

          // RA 10173 Step 3.4: Block erased accounts from creating new bookings.
          // The Firebase Auth account persists on the Spark plan even after PII
          // anonymization, so this guard closes the booking path explicitly.
          if (userData.accountStatus === 'erased') {
            Alert.alert(
              "Account Removed",
              "This account has been erased per your request under RA 10173. Please contact the clinic for assistance.",
              [{ text: "OK", onPress: () => navigation.goBack() }],
              { cancelable: false },
            );
            return;
          }

          setOwnerName(userData.fullName || auth.currentUser.email);

          const hasEmergency = userData.emergencyContacts?.[0]?.name || userData.emergencyName;
          if (!userData.address || !hasEmergency) {
            Alert.alert(
              "Profile Incomplete",
              "Please complete your Address and Emergency Contact details before booking.",
              [
                {
                  text: "Go to Profile",
                  onPress: () =>
                    navigation.navigate("UserProfile", {
                      isBookingRedirect: true,
                    }),
                },
                {
                  text: "Cancel",
                  onPress: () => navigation.goBack(),
                  style: "cancel",
                },
              ],
            );
          }

          // T2.88: Nudge users whose profile hasn't been updated in over 6 months
          const updatedAt = userData.updatedAt?.toDate?.() || userData.updatedAt;
          if (updatedAt) {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            if (new Date(updatedAt) < sixMonthsAgo) {
              Alert.alert(
                "Profile Update Reminder",
                "Your profile was last updated over 6 months ago. Please verify your contact details are current.",
                [
                  { text: "Update Now", onPress: () => navigation.navigate("UserProfile") },
                  { text: "Later", style: "cancel" },
                ],
              );
            }
          }
        }
      } catch (err) {
        console.log(err);
      }
    };
    initializeUser();
  }, [navigation]); // clinicSettings intentionally excluded — initializeUser should not re-fire on live settings changes

  // --- HANDLERS ---
  const selectPet = (pet) => {
    if (selectedPet?.id === pet.id) {
      setSelectedPet(null);
      setSelectedServices([]);
    } else {
      setSelectedPet(pet);
      setSelectedServices([]);
    }
    setSelectedSlot(null);
  };

  const toggleService = (srv) => {
    setSelectedServices(prev =>
      prev.some(s => s.id === srv.id)
        ? prev.filter(s => s.id !== srv.id)
        : [...prev, srv]
    );
    setSelectedSlot(null);
  };

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      setDate(selectedDate);
      setSelectedSlot(null);
    }
  };

  // --- RESCHEDULE: In-place appointment update with JIT capacity check ---
  // Updates the existing appointment document(s) — no new document is created.
  // The JIT capacity check excludes the appointment's own ID(s) to avoid self-blocking.
  const submitReschedule = async () => {
    setLoading(true);
    try {
      const [hours, minutes] = selectedSlot.split(":");
      const newDateTime = new Date(date);
      newDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      // Guard: reject if the computed appointment time is already in the past.
      if (newDateTime < new Date()) {
        Alert.alert("Time Passed", "The selected time slot is now in the past. Please select a new time.");
        setStep(3);
        setSelectedSlot(null);
        setLoading(false);
        return;
      }

      // JIT capacity check — same pattern as submitBooking.
      const startOfDay = new Date(newDateTime);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(newDateTime);
      endOfDay.setHours(23, 59, 59, 999);

      const checkSnap = await getDocs(
        query(
          collection(db, "appointments"),
          where("scheduledDate", ">=", Timestamp.fromDate(startOfDay)),
          where("scheduledDate", "<=", Timestamp.fromDate(endOfDay)),
          where("status", "in", ["pending", "confirmed"]),
        ),
      );

      // Exclude the rescheduled appointment from the capacity count — it is being moved, not added.
      const excludeIds = new Set([rescheduleAppointmentId]);
      const filteredDocs = checkSnap.docs.filter(d => !excludeIds.has(d.id));

      // T4.139: Parallel department JIT check (matches slot generator model)
      const allGroupServices = rescheduleAppointment.services || [];
      const reschDeptGroups = {};
      allGroupServices.forEach(svc => {
        const dept = (svc.department || "General").toLowerCase();
        const dur = parseInt(String(svc.duration).replace(/[^0-9]/g, "")) || 30;
        const buff = parseInt(String(svc.buffer).replace(/[^0-9]/g, "")) || 0;
        reschDeptGroups[dept] = Math.max(reschDeptGroups[dept] || 0, (dur + buff));
      });

      for (const [dept, duration] of Object.entries(reschDeptGroups)) {
        const svcStart = newDateTime;
        const svcEnd = new Date(newDateTime.getTime() + duration * 60000);

        const competing = filteredDocs.filter(d => {
          const data = d.data();
          const deptsInAppt = new Set();
          if (data.services && Array.isArray(data.services)) {
            data.services.forEach(s => deptsInAppt.add((s.department || "General").toLowerCase()));
          } else {
            deptsInAppt.add((data.department || data.serviceCategory || "General").toLowerCase());
          }
          return deptsInAppt.has(dept);
        });

        let overlaps = 0;
        competing.forEach(d => {
          const s = d.data().scheduledDate.toDate();
          const e = new Date(s.getTime() + ((d.data().serviceDuration || 30) + (d.data().serviceBuffer || 0)) * 60000);
          if (svcStart < e && svcEnd > s) overlaps++;
        });

        const capacity = departmentCapacity[dept] || 1;
        if (overlaps >= capacity) {
          const deptDisplay = dept.charAt(0).toUpperCase() + dept.slice(1);
          Alert.alert(
            "Slot Taken",
            `Another client just booked a ${deptDisplay} specialist during this window. Please select another time.`,
          );
          setStep(3);
          setSelectedSlot(null);
          setLoading(false);
          return;
        }
      }

      const newDateStr = getLocalDateStr(newDateTime);
      const trimmedReason = rescheduleReason.trim();

      // Build the update payload. Fields mirror the admin saveReschedule pattern
      // with client-specific attribution. scheduledDateStr is explicitly updated
      // (the admin path currently omits this — this client path fixes that gap).
      const updatePayload = {
        scheduledDate: Timestamp.fromDate(newDateTime),
        scheduledDateStr: newDateStr,
        status: "pending",
        rescheduledAt: Timestamp.now(),
        rescheduledBy: "Client/Self",
        rescheduleReason: trimmedReason,
        auditReason: `Rescheduled by client: ${trimmedReason}`,
        auditReasons: arrayUnion({
          reason: trimmedReason,
          action: "client-reschedule",
          staffName: "Client/Self",
          timestamp: Timestamp.now(),
        }),
        confirmedByClient: false,
      };

      await updateDoc(doc(db, "appointments", rescheduleAppointmentId), updatePayload);

      Alert.alert(
        "Rescheduled",
        `Your appointment has been moved to ${formatDisplayDate(newDateTime)}. The clinic will confirm the new date.`,
      );
      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", "Could not reschedule. Please try again.");
      console.error("[BookAppointment.submitReschedule]:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- THE FATAL FLAW FIX: JIT CONCURRENCY CHECK (Now Multi-Service Aware!) ---
  const submitBooking = async () => {
    if (!isConnected) {
      Alert.alert(
        "No Internet Connection",
        "Booking requires an active internet connection. Please check your network and try again.",
      );
      return;
    }

    setLoading(true);
    try {
      const [hours, minutes] = selectedSlot.split(":");
      const baseDateTime = new Date(date);
      baseDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      // T2.89 — Guard: reject if the computed appointment time is already in the past
      if (baseDateTime < new Date()) {
        Alert.alert("Time Passed", "The selected time slot is now in the past. Please select a new time.");
        setStep(3);
        setSelectedSlot(null);
        setLoading(false);
        return;
      }

      // T2.79: Build mapped services with individual tiered pricing.
      // Accepts the pet's own service list so each Firestore document is independent.
      const buildMappedServices = (petWeight, petServices) => {
        let petBundlePrice = 0;
        const mapped = petServices.map(s => {
          const dur = parseInt(String(s.duration).replace(/[^0-9]/g, "")) || 30;
          const buff = parseInt(String(s.bufferTime).replace(/[^0-9]/g, "")) || 0;
          const price = resolveTieredPrice(s, petWeight);
          petBundlePrice += price;
          return {
            id: s.id || Math.random().toString(36).substr(2, 9),
            name: s.name,
            price: price,
            department: (s.department || s.category || "General"),
            status: "pending",
            workflowType: (s.department === "Grooming" || s.category === "Grooming") ? "AESTHETIC" : "MEDICAL",
            staffId: null,
            staffName: "Unassigned",
            duration: dur,
            buffer: buff,
          };
        });
        return { mapped, petBundlePrice };
      };

      // JIT PRE-FLIGHT CHECK (outside transaction — getDocs queries are not transactional)
      const startOfDay = new Date(baseDateTime);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(baseDateTime);
      endOfDay.setHours(23, 59, 59, 999);

      const checkSnap = await getDocs(
        query(
          collection(db, "appointments"),
          where("scheduledDate", ">=", Timestamp.fromDate(startOfDay)),
          where("scheduledDate", "<=", Timestamp.fromDate(endOfDay)),
          where("status", "in", ["pending", "confirmed"]),
        ),
      );

      // JIT pre-flight: group services by department, taking max duration per dept.
      const jitDeptGroups = {};
      selectedServices.forEach(s => {
        const dept = (s.department || s.category || "General").toLowerCase();
        const dur = parseInt(String(s.duration).replace(/[^0-9]/g, "")) || 30;
        const buff = parseInt(String(s.bufferTime).replace(/[^0-9]/g, "")) || 0;
        jitDeptGroups[dept] = Math.max(jitDeptGroups[dept] || 0, (dur + buff));
      });

      for (const [dept, duration] of Object.entries(jitDeptGroups)) {
        const svcStart = baseDateTime;
        const svcEnd = new Date(svcStart.getTime() + duration * 60000);

        const competing = checkSnap.docs.filter(d => {
          const data = d.data();
          const deptsInAppt = new Set();
          if (data.services && Array.isArray(data.services)) {
            data.services.forEach(s => deptsInAppt.add((s.department || "General").toLowerCase()));
          } else {
            deptsInAppt.add((data.department || data.serviceCategory || "General").toLowerCase());
          }
          return deptsInAppt.has(dept);
        });

        let currentOverlaps = 0;
        competing.forEach(d => {
          const s = d.data().scheduledDate.toDate();
          const e = new Date(s.getTime() + ((d.data().serviceDuration || 30) + (d.data().serviceBuffer || 0)) * 60000);
          if (svcStart < e && svcEnd > s) currentOverlaps++;
        });

        const capacity = departmentCapacity[dept] || 1;
        if (currentOverlaps >= capacity) {
          const deptDisplay = dept.charAt(0).toUpperCase() + dept.slice(1);
          Alert.alert(
            "Slot Taken",
            `Another client just booked a ${deptDisplay} specialist during this window. Please select another time.`,
          );
          setStep(3); setSelectedSlot(null); setLoading(false); return;
        }
      }

      // T2.87: Use runTransaction for atomic write + retry-on-contention
      await runTransaction(db, async (transaction) => {
        const bookingTimestamp = Date.now();
        const pet = selectedPet;

        // T2.23: Weight resolution order: lastVitals (most recent clinical) > weight > lastWeight
        const petWeight = pet.lastVitals?.weight ?? pet.weight ?? pet.lastWeight ?? null;
        const petWeightNum = petWeight != null ? parseFloat(petWeight) : null;

        if (selectedServices.length === 0) {
          throw new Error('No services selected. Please go back and try again.');
        }
        const { mapped: petMappedServices, petBundlePrice } = buildMappedServices(petWeightNum, selectedServices);

        // Parallel duration: max across departments (departments run simultaneously)
        const petDeptGroups = {};
        selectedServices.forEach(s => {
          const dept = (s.department || s.category || "General").toLowerCase();
          const dur = parseInt(String(s.duration).replace(/[^0-9]/g, "")) || 30;
          const buff = parseInt(String(s.bufferTime).replace(/[^0-9]/g, "")) || 0;
          petDeptGroups[dept] = (petDeptGroups[dept] || 0) + (dur + buff);
        });
        const petServiceDuration = Object.keys(petDeptGroups).length > 0
          ? Math.max(...Object.values(petDeptGroups))
          : 0;
        const longestDept = Object.entries(petDeptGroups).reduce(
          (best, [dept, dur]) => dur > best.dur ? { dept, dur } : best,
          { dept: null, dur: 0 }
        );
        const petServiceBuffer = selectedServices
          .filter(s => (s.department || s.category || "General").toLowerCase() === longestDept.dept)
          .reduce((sum, s) => sum + (parseInt(String(s.bufferTime).replace(/[^0-9]/g, "")) || 0), 0);

        const qrData = `VC-${auth.currentUser.uid.slice(0, 5)}-${bookingTimestamp}-0`;
        const newApptRef = doc(collection(db, "appointments"));

        transaction.set(newApptRef, {
          ownerId: auth.currentUser.uid,
          ownerName: ownerName,
          petId: pet.id,
          petName: pet.name,
          petSpecies: pet.species,

          // --- EVOLVED SCHEMA: The Clinical Passport ---
          petBreed: pet.breed === "Mixed/Unknown" || pet.breed === "Mixed" ? "Mixed Breed" : (pet.breed || "Mixed Breed"),
          petGender: pet.gender === "UNK" ? "Unknown" : (pet.gender || "Unknown"),
          petColor: pet.color || "N/A",
          petIsNeutered: pet.isNeutered || false,
          petBirthdate: pet.dob || null,
          // T2.23: Same weight resolution order as pricing
          petWeight: pet.lastVitals?.weight ?? pet.weight ?? pet.lastWeight ?? null,
          petAllergies: pet.petAllergies || pet.allergies || "None",

          services: petMappedServices,
          primaryService: petMappedServices[0].name,
          serviceType: petMappedServices[0].name,
          serviceCategory: petMappedServices[0].department,
          serviceDuration: petServiceDuration,
          serviceBuffer: petServiceBuffer,
          servicePrice: petBundlePrice,

          status: "pending",
          caseDay: 1,
          scheduledDate: Timestamp.fromDate(baseDateTime),
          scheduledDateStr: `${baseDateTime.getFullYear()}-${String(baseDateTime.getMonth() + 1).padStart(2, '0')}-${String(baseDateTime.getDate()).padStart(2, '0')}`,
          triageDate: getLocalDateStr(),
          createdAt: Timestamp.now(),
          qrCode: qrData,
          clientNotes: notes,
          systemChips: [
            ...(noShowInfo?.count > 0 ? [`NO-SHOW-HISTORY:${noShowInfo.count}`] : []),
          ],
          ...(noShowInfo?.count > 0 ? {
            rebookedFromId: noShowInfo.mostRecent?.id || null,
            noShowCount: noShowInfo.count,
          } : {}),
          clinicalPulse: [
            {
              eventId: `pulse_INCEPTION_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`,
              type: 'INCEPTION',
              toStatus: 'pending',
              timestamp: Timestamp.now(),
              staffId: auth.currentUser.uid,
              staffName: ownerName,
              note: 'Online booking by client',
            },
          ],
        });
      });

      // If this booking originated from a follow-up deep-link, cancel the ghost appointment
      // so it no longer appears in the Upcoming list. Non-fatal — the new booking already succeeded.
      if (fromFollowUp && ghostAppointmentId) {
        try {
          await updateDoc(doc(db, 'appointments', ghostAppointmentId), {
            status: 'cancelled',
            auditReason: 'client-booked-followup',
            auditReasons: arrayUnion({ reason: 'client-booked-followup', action: 'client-booked-followup', staffName: 'Client/System', timestamp: Timestamp.now() }),
            cancelledAt: Timestamp.now(),
          });
        } catch (e) {
          console.warn('[BookAppointment] Failed to cancel ghost follow-up:', e.message);
        }
      }

      Alert.alert(
        "Success",
        "Appointment successfully requested!",
      );
      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const hasServices = selectedServices.length > 0;

  // --- WIZARD NAVIGATION LOGIC ---
  const handleNext = () => {
    if (step === 1 && !selectedPet)
      return Alert.alert("Required", "Please select a pet.");
    if (step === 2 && !hasServices)
      return Alert.alert("Required", "Please select at least one service.");
    if (step === 3 && !selectedSlot)
      return Alert.alert("Required", "Please select a time slot.");
    if (step === 4) {
      // Reschedule path: submitReschedule validates reason internally but the button
      // is already disabled when reason is empty, so this is a safety guard only.
      if (rescheduleMode) {
        submitReschedule();
        return;
      }
      if (busynessLevel === "high") {
        Alert.alert(
          "High Demand",
          "The clinic is very busy today. Wait times may be longer than usual. Continue?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Proceed", onPress: submitBooking },
          ],
        );
      } else {
        submitBooking();
      }
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    if (rescheduleMode) {
      // Reschedule is a 2-step flow: Step 3 (slot picker) → Step 4 (confirm).
      // Back on Step 3 exits reschedule mode entirely; Back on Step 4 returns to slot picker.
      if (step === 4) setStep(3);
      else navigation.goBack();
      return;
    }
    if (step > 1) setStep(step - 1);
    else navigation.goBack();
  };

  const getButtonText = () => {
    if (loading) return "Processing...";
    if (rescheduleMode) {
      if (step === 3 && !selectedSlot) return "Select a New Time";
      if (step === 3) return "Continue";
      if (step === 4) return "Confirm Reschedule";
    }
    if (step === 1 && !selectedPet) return "1. Select a Pet";
    if (step === 2 && !hasServices) return "2. Select Service(s)";
    if (step === 3 && !selectedSlot) return "3. Select a Time";
    if (step === 4) return "Book Appointment";
    return "Continue";
  };

  // --- STEP 1 RENDER: PATIENTS (NOW HIGH-PERFORMANCE FLATLIST!) ---
  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <FlatList
        data={filteredPets}
        numColumns={2}
        keyExtractor={item => item.id}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 150 }}
        ListEmptyComponent={
            petSearch ? <Text style={styles.emptyText}>No pets found matching &quot;{petSearch}&quot;</Text> : null
        }
        ListHeaderComponent={
          <View>
            <Text style={styles.stepHeader}>Who is visiting?</Text>
            <Text style={styles.subText}>
              Select a pet for this appointment.
            </Text>
            
            {/* THE SEARCH & QUICK-ADD HUB */}
            <View style={styles.searchAndLinkRow}>
                <TextInput
                    style={[styles.searchInput, { flex: 1, marginBottom: 0 }]}
                    placeholder="🔍 Search pets..."
                    placeholderTextColor="#aaa"
                    value={petSearch}
                    onChangeText={setPetSearch}
                />
                <TouchableOpacity 
                    style={styles.inlineAddBtn}
                    onPress={() => navigation.navigate("AddPet")}
                >
                    <Text style={styles.inlineAddText}>+</Text>
                </TouchableOpacity>
            </View>
            
            {fetching && (
                <ActivityIndicator color="#8B4513" size="large" style={{ marginVertical: 20 }} />
            )}
          </View>
        }
        renderItem={({ item: pet }) => {
          const isSelected = selectedPet?.id === pet.id;
          return (
            <TouchableOpacity
              key={pet.id}
              style={[
                styles.card,
                isSelected ? styles.selectedCard : styles.unselectedCard,
              ]}
              onPress={() => selectPet(pet)}
            >
              {isSelected && (
                <View style={styles.checkBadge}>
                  <Text style={{ color: "white", fontSize: 12, fontWeight: "900" }}>✓</Text>
                </View>
              )}
              <Text style={{ fontSize: 32, marginBottom: 8 }}>
                {pet.species === "Canine" || pet.species === "Dog" ? "🐶" : "🐱"}
              </Text>
              <Text style={[styles.cardText, isSelected && styles.selectedTextBold]} numberOfLines={1}>
                {pet.name}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  // --- STEP 2 RENDER: SERVICES ---
  const renderStep2 = () => {
    const renderServiceRow = (s, isSelected, onToggle) => (
      <TouchableOpacity
        key={s.id}
        style={[styles.serviceRow, isSelected && styles.selectedServiceRow]}
        onPress={() => onToggle(s)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.serviceName}>{s.name}</Text>
          <Text style={styles.serviceDuration}>⏱️ {s.duration} mins</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.servicePrice}>₱{s.price}</Text>
          {isSelected && (
            <View style={[styles.checkBadge, { position: 'relative', top: 5, right: 0 }]}>
              <Text style={{ color: 'white', fontSize: 10, fontWeight: '900' }}>✓</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );

    return (
      <View style={styles.stepContainer}>
        <FlatList
          data={displayedServices}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 150 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No services found matching your criteria.</Text>
          }
          ListHeaderComponent={
            <View>
              <Text style={styles.stepHeader}>What do they need?</Text>
              <Text style={styles.subText}>
                You can select multiple services to bundle them into one visit.
              </Text>
              {/* SEARCH HUB */}
              <TextInput
                style={styles.searchInput}
                placeholder="Search for a service..."
                placeholderTextColor="#aaa"
                value={serviceSearch}
                onChangeText={setServiceSearch}
              />
              {/* TRIGGER FOR DEPARTMENT EXPLORER */}
              <TouchableOpacity
                style={styles.deptTriggerBtn}
                onPress={() => setIsDeptModalVisible(true)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, marginRight: 8 }}>🏷️</Text>
                  <View>
                    <Text style={styles.deptTriggerLabel}>Filter by Department</Text>
                    <Text style={styles.deptTriggerSub}>Currently: {selectedDepartment}</Text>
                  </View>
                </View>
                <Text style={styles.deptTriggerArrow}>❯</Text>
              </TouchableOpacity>
              {/* Bundle pill strip */}
              {selectedServices.length > 0 && (
                <View style={styles.bundleBox}>
                  <Text style={styles.bundleTitle}>
                    Selected Bundle ({selectedServices.length}):
                  </Text>
                  <View style={styles.bundleScrollContainer}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.bundlePillScroll}
                    >
                      {selectedServices.map((s) => (
                        <TouchableOpacity
                          key={s.id}
                          style={styles.bundlePill}
                          onPress={() => toggleService(s)}
                        >
                          <Text style={styles.bundlePillText}>{s.name}</Text>
                          <Text style={styles.bundlePillRemove}>✕</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              )}
            </View>
          }
          renderItem={({ item: s }) => {
            const isSelected = selectedServices.some(serv => serv.id === s.id);
            return renderServiceRow(s, isSelected, toggleService);
          }}
        />
      </View>
    );
  };

  // --- STEP 3 RENDER: DATE & TIME ---
  const renderStep3 = () => {
    // Exclude 'PAST' slots completely
    const futureSlots = availableSlots.filter((s) => s.status !== "PAST");

    // T2.85: Identify if any required department has zero staff capacity
    const blockedDept = selectedServices.length > 0
      ? selectedServices.find(s => {
          const dept = (s.department || s.category || "General").toLowerCase();
          return !departmentCapacity[dept] || departmentCapacity[dept] === 0;
        })
      : null;
    const morningSlots = futureSlots.filter(
      (s) => parseInt(s.timeValue.split(":")[0]) < 12,
    );
    const afternoonSlots = futureSlots.filter(
      (s) => parseInt(s.timeValue.split(":")[0]) >= 12,
    );
    
    // --- SCHEDULING INTELLIGENCE MATH ---
    const totalBundleDuration = selectedServices.reduce((sum, s) => {
        const d = parseInt(String(s.duration).replace(/[^0-9]/g, "")) || 30;
        const b = parseInt(String(s.bufferTime).replace(/[^0-9]/g, "")) || 0;
        return sum + d + b;
    }, 0);

    const leadHours = (clinicSettings?.advanceNoticeMins || 120) / 60;
    const now = new Date();
    const readyTime = new Date(now.getTime() + leadHours * 60 * 60 * 1000);
    const isToday = date.toDateString() === now.toDateString();
    
    const readyTimeString = formatDisplayTime(readyTime);

    // Dynamic cutoff time based on Web Admin settings
    const minDateAllowed = new Date();
    const closeHour = clinicSettings?.closeHour || 17;
    if (minDateAllowed.getHours() >= closeHour) {
      minDateAllowed.setDate(minDateAllowed.getDate() + 1);
    }

    const maxFutureBookingDays = clinicSettings?.maxFutureBookingDays || 30;
    const maxDateAllowed = new Date();
    maxDateAllowed.setDate(maxDateAllowed.getDate() + maxFutureBookingDays);

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepHeader}>When should we expect you?</Text>

        {/* FOLLOW-UP DATE HINT — only shown when the cascade shifted from the recommended date */}
        {fromFollowUp && prefillDateMatchType && prefillDateMatchType !== 'exact' && (
          <View style={styles.followUpHint}>
            <Text style={styles.followUpHintText}>
              Your vet recommended {formatDisplayDate(prefillTargetDate)} —
              showing {formatDisplayDate(prefillDate)} (nearest available).
            </Text>
          </View>
        )}

        {/* CLINICAL INSIGHT BOX (🩺) */}
        <View style={styles.insightBox}>
            <View style={styles.insightHeaderRow}>
                <Text style={{ fontSize: 20 }}>🩺</Text>
                <Text style={styles.insightTitle}>Scheduling Insight</Text>
            </View>
            <Text style={styles.insightText}>
                Your <Text style={{ fontWeight: '900' }}>{totalBundleDuration} minute</Text> visit is ready to be scheduled.
                {isToday && (
                    <>
                        {"\n"}Same-day bookings require a <Text style={{ fontWeight: '900' }}>{leadHours} hour</Text> notice. Available after <Text style={{ fontWeight: '900' }}>{readyTimeString}</Text>.
                    </>
                )}
            </Text>
        </View>

        <TouchableOpacity
          style={styles.modernDateBtn}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={styles.modernDateText}>
            📅{" "}
            {formatDisplayDate(date, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
          <Text style={styles.modernDateArrow}>▼</Text>
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            onChange={handleDateChange}
            minimumDate={minDateAllowed}
            maximumDate={maxDateAllowed}
          />
        )}

        {selectedServices.length === 0 || !selectedPet ? (
          <Text style={styles.subtlePrompt}>
            🕒 Select a service to see available time slots.
          </Text>
        ) : loadingSlots ? (
          <ActivityIndicator
            color="#8B4513"
            style={{ marginVertical: 20 }}
            size="large"
          />
        ) : futureSlots.length === 0 ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              {blockedDept
                ? `The ${blockedDept.department || blockedDept.category || "General"} department has no staff assigned. Please contact the clinic.`
                : "No available slots remaining for this date. Please select another day."}
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 120 }}
          >
            {morningSlots.length > 0 && (
              <Text style={styles.timeOfDayHeader}>☀️ Morning</Text>
            )}
            <View style={styles.slotGrid}>
              {morningSlots.map((slot, index) => {
                const isSelected = selectedSlot === slot.timeValue;
                const isAvailable = slot.status === "AVAILABLE";
                return (
                  <TouchableOpacity
                    key={`m-${index}`}
                    disabled={!isAvailable}
                    style={[
                      styles.slotBtn,
                      isSelected
                        ? styles.slotSelected
                        : isAvailable
                          ? styles.slotAvailable
                          : styles.slotDisabled,
                    ]}
                    onPress={() => setSelectedSlot(slot.timeValue)}
                  >
                    <Text
                      style={[
                        styles.slotText,
                        isSelected
                          ? styles.slotTextSelected
                          : isAvailable
                            ? styles.slotTextAvailable
                            : styles.slotTextDisabled,
                      ]}
                    >
                      {slot.display}
                    </Text>
                    {!isAvailable && (
                      <Text style={styles.slotSubText}>
                        {slot.status === "TOO_SOON"
                          ? "TOO SOON"
                          : slot.status === "OVERFLOW"
                            ? "UNAVAILABLE"
                            : "TAKEN"}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {afternoonSlots.length > 0 && (
              <Text style={styles.timeOfDayHeader}>🌙 Afternoon</Text>
            )}
            <View style={styles.slotGrid}>
              {afternoonSlots.map((slot, index) => {
                const isSelected = selectedSlot === slot.timeValue;
                const isAvailable = slot.status === "AVAILABLE";
                return (
                  <TouchableOpacity
                    key={`a-${index}`}
                    disabled={!isAvailable}
                    style={[
                      styles.slotBtn,
                      isSelected
                        ? styles.slotSelected
                        : isAvailable
                          ? styles.slotAvailable
                          : styles.slotDisabled,
                    ]}
                    onPress={() => setSelectedSlot(slot.timeValue)}
                  >
                    <Text
                      style={[
                        styles.slotText,
                        isSelected
                          ? styles.slotTextSelected
                          : isAvailable
                            ? styles.slotTextAvailable
                            : styles.slotTextDisabled,
                      ]}
                    >
                      {slot.display}
                    </Text>
                    {!isAvailable && (
                      <Text style={styles.slotSubText}>
                        {slot.status === "TOO_SOON"
                          ? "TOO SOON"
                          : slot.status === "OVERFLOW"
                            ? "UNAVAILABLE"
                            : "TAKEN"}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* BOTTOM LEGEND */}
        <View style={styles.legendContainer}>
            <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#8B4513'}]} />
                <Text style={styles.legendText}>Selected</Text>
            </View>
            <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#E0E0E0'}]} />
                <Text style={styles.legendText}>Available</Text>
            </View>
            <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#FF8A65'}]} />
                <Text style={styles.legendText}>Too Soon</Text>
            </View>
            <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#BDBDBD'}]} />
                <Text style={styles.legendText}>Taken/Closed</Text>
            </View>
        </View>
      </View>
    );
  };

  // --- NEW: THE DEPARTMENT EXPLORER MODAL ---
  const renderDepartmentModal = () => (
    <Modal
      visible={isDeptModalVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setIsDeptModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Visit Department</Text>
            <TouchableOpacity onPress={() => setIsDeptModalVisible(false)}>
              <Text style={styles.modalCloseText}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* SEARCH & SORT TOOLS */}
          <TextInput
            style={styles.modalSearchInput}
            placeholder="Search departments..."
            placeholderTextColor="#aaa"
            value={deptModalSearch}
            onChangeText={setDeptModalSearch}
          />
          
          <View style={styles.sortOptionsRow}>
            <TouchableOpacity 
                style={[styles.sortChip, deptSortOrder === 'name' && styles.sortChipActive]}
                onPress={() => setDeptSortOrder('name')}
            >
                <Text style={[styles.sortChipText, deptSortOrder === 'name' && styles.sortChipTextActive]}>A-Z</Text>
            </TouchableOpacity>
            <TouchableOpacity 
                style={[styles.sortChip, deptSortOrder === 'count' && styles.sortChipActive]}
                onPress={() => setDeptSortOrder('count')}
            >
                <Text style={[styles.sortChipText, deptSortOrder === 'count' && styles.sortChipTextActive]}>By Volume</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={[{ name: 'All', count: services.length }, ...departmentStats]}
            keyExtractor={item => item.name}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                    styles.deptModalRow,
                    selectedDepartment === item.name && styles.deptModalRowSelected
                ]}
                onPress={() => {
                  setSelectedDepartment(item.name);
                  setIsDeptModalVisible(false);
                }}
              >
                <Text style={[
                    styles.deptModalName,
                    selectedDepartment === item.name && styles.deptModalTextSelected
                ]}>
                    {item.name}
                </Text>
                <View style={styles.deptCountBadge}>
                  <Text style={styles.deptCountText}>{item.count}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );

  // --- RESCHEDULE CONFIRM RENDER (replaces Step 4 in reschedule mode) ---
  // Shows original vs new date/time comparison and requires a reschedule reason (Amendment 2).
  const renderRescheduleConfirm = () => {
    const rawOriginal = rescheduleAppointment?.scheduledDate;
    const originalDate = typeof rawOriginal?.toDate === 'function'
      ? rawOriginal.toDate()
      : new Date(rawOriginal);
    const isReasonEmpty = rescheduleReason.trim() === '';

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.stepContainer}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.stepHeader}>Confirm Reschedule</Text>

          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>Schedule Change</Text>
            <Text style={styles.summaryText}>
              Patient: {rescheduleAppointment?.petName}
            </Text>
            <Text style={styles.summaryText}>
              Service: {rescheduleAppointment?.serviceType}
            </Text>
            <Text style={[styles.summaryText, { textDecorationLine: 'line-through', color: '#9E9E9E' }]}>
              Original: {formatDisplayDate(originalDate)} at {formatDisplayTime(originalDate)}
            </Text>
            <Text style={[styles.summaryText, { color: COLORS.success, fontWeight: '900' }]}>
              New: {formatDisplayDate(date)} at {selectedSlot}
            </Text>
          </View>

          <Text style={styles.inputLabel}>
            Reason for rescheduling{' '}
            <Text style={{ color: COLORS.danger }}>*</Text>
          </Text>
          <TextInput
            style={styles.notesInput}
            placeholder="e.g. Schedule conflict, feeling unwell..."
            placeholderTextColor="#aaa"
            multiline
            numberOfLines={3}
            value={rescheduleReason}
            onChangeText={setRescheduleReason}
          />
          {isReasonEmpty && (
            <Text style={{ color: COLORS.danger, fontSize: 11, marginTop: 4, fontWeight: '700' }}>
              A reason is required before confirming.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  // --- STEP 4 RENDER: REVIEW & NOTES ---
  const renderStep4 = () => {
    // Reschedule mode hijacks Step 4 with its own summary + required reason UI.
    if (rescheduleMode) return renderRescheduleConfirm();

    // RESILIENT HINTS (Safety check stays for surgery warnings)
    const hasSurgery = selectedServices.some(s =>
        (s.department || s.category || '').toLowerCase().includes('surg') ||
        (s.name || '').toLowerCase().includes('surg')
    );

    // MAXIMUM RESILIENCE: Use generic labels that work for ANY visit type
    const notesTitle = "Comments / Special Instructions";
    const notesPlaceholder = "e.g. Symptoms, special requests, or notes for the clinical staff...";

    // Helper for Title Case
    const toTitleCase = (str) => str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

    // Compute grand total using weight-resolved prices
    const petWeight = parseFloat(selectedPet?.lastVitals?.weight ?? selectedPet?.weight ?? selectedPet?.lastWeight) || null;
    const grandTotal = selectedServices.reduce(
      (sum, s) => sum + resolveTieredPrice(s, petWeight), 0
    );

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.stepContainer}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.stepHeader}>Final Details</Text>

            <View style={styles.summaryBox}>
                <Text style={styles.summaryTitle}>Booking Summary</Text>

                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#5D4037', marginBottom: 8 }}>🐾 Patient:</Text>
                <View style={styles.summaryPetsContainer}>
                  {selectedPet && (
                    <View style={styles.summaryPetChip}>
                      <Text style={styles.summaryPetName}>{selectedPet.name}</Text>
                    </View>
                  )}
                </View>

                {/* Service list */}
                <Text style={{ fontWeight: 'bold', fontSize: 13, color: '#5D4037', marginTop: 15, marginBottom: 4 }}>Selected Services:</Text>
                <View style={styles.summaryServiceScroll}>
                    <ScrollView nestedScrollEnabled={true}>
                        {selectedServices.map(s => (
                            <Text key={s.id} style={{ fontSize: 13, color: '#5D4037', marginBottom: 4 }}>
                                {'•'} {toTitleCase(s.name)} ({'₱'}{resolveTieredPrice(s, petWeight)})
                            </Text>
                        ))}
                    </ScrollView>
                </View>

                <Text style={styles.summaryText}>
                    🕒 Time: {formatDisplayDate(date)} at {selectedSlot}
                </Text>
                <Text style={styles.summaryTotalBig}>
                    Est. Total: {'₱'}{grandTotal.toLocaleString()}
                </Text>
            </View>

            <Text style={styles.inputLabel}>{notesTitle}</Text>
            <TextInput
                style={styles.notesInput}
                placeholder={notesPlaceholder}
                placeholderTextColor="#aaa"
                multiline
                numberOfLines={4}
                value={notes}
                onChangeText={setNotes}
            />

            {hasSurgery && (
                <View style={styles.warningBox}>
                    <Text style={styles.warningTitle}>⚠️ SURGICAL REQUIREMENT</Text>
                    <Text style={styles.warningText}>
                        Strict fasting required: NO food or water for 8-12 hours prior to the visit.
                    </Text>
                </View>
            )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <SafeAreaView style={styles.rootContainer}>
      {/* HEADER WIZARD PROGRESS */}
      <View style={styles.wizardHeader}>
        <Text style={styles.wizardTitle}>
          {rescheduleMode
            ? (step === 3 ? "Reschedule: Pick a New Time" : "Reschedule: Confirm")
            : `Booking: Step ${step} of 4`}
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: rescheduleMode ? (step === 3 ? '50%' : '100%') : `${(step / 4) * 100}%` },
            ]}
          />
        </View>
      </View>

      {/* T4.147: Outstanding balance warning — non-blocking. Hidden in reschedule mode. */}
      {outstandingBalance > 0 && !rescheduleMode && (
        <View style={{
          backgroundColor: '#FFF3E0',
          borderBottomWidth: 2,
          borderBottomColor: COLORS.brand,
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}>
          <Text style={{ fontSize: 16 }}>💸</Text>
          <Text style={{
            flex: 1,
            fontFamily: 'Inter_700Bold',
            fontSize: 12,
            color: COLORS.brand,
            letterSpacing: 0.3,
          }}>
            You have ₱{outstandingBalance.toLocaleString()} outstanding from a previous visit. Please settle at your next visit.
          </Text>
        </View>
      )}

      {/* DYNAMIC BODY */}
      <View style={styles.bodyContainer}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </View>

      {/* NO-SHOW WARNING BANNER — shown when selected pets have recent no-shows */}
      {!rescheduleMode && noShowInfo && noShowInfo.count > 0 && selectedPet && step > 1 && (
        <View style={styles.noShowBanner}>
          <Text style={styles.noShowBannerTitle}>
            No-Show History Detected
          </Text>
          <Text style={styles.noShowBannerText}>
            {noShowInfo.count} no-show{noShowInfo.count > 1 ? 's' : ''} in the last {clinicSettings?.noShowLinkWindowDays || 30} days.
            {(() => {
              if (!noShowInfo.mostRecent?.scheduledDate) return '';
              const raw = noShowInfo.mostRecent.scheduledDate;
              const str = formatDisplayDate(raw, { month: 'short', day: 'numeric', year: 'numeric' }, '');
              return str ? ` Most recent: ${str}.` : '';
            })()}
          </Text>
        </View>
      )}

      {/* SAFE AREA STICKY FOOTER */}
      <View
        style={[
          styles.stickyFooter,
          { paddingBottom: Math.max(insets.bottom, 20) },
        ]}
      >
        <View style={styles.footerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBack}
            disabled={loading}
          >
            <Text style={styles.backBtnText}>
              {rescheduleMode ? (step === 3 ? "Cancel" : "Back") : (step === 1 ? "Cancel" : "Back")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.nextBtn,
              (loading ||
                (!isConnected && step === 4 && !rescheduleMode) ||
                (step === 1 && !selectedPet) ||
                (step === 2 && !hasServices) ||
                (step === 3 && !selectedSlot) ||
                (rescheduleMode && step === 4 && rescheduleReason.trim() === '')) &&
                styles.disabledNextBtn,
            ]}
            onPress={handleNext}
            disabled={
              loading ||
              (!isConnected && step === 4 && !rescheduleMode) ||
              (rescheduleMode && step === 4 && rescheduleReason.trim() === '')
            }
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text
                style={[
                  styles.nextBtnText,
                  (loading ||
                    (!isConnected && step === 4 && !rescheduleMode) ||
                    (step === 1 && !selectedPet) ||
                    (step === 2 && !hasServices) ||
                    (step === 3 && !selectedSlot) ||
                    (rescheduleMode && step === 4 && rescheduleReason.trim() === '')) && { color: "#9E9E9E" },
                ]}
              >
                {!isConnected && step === 4 && !rescheduleMode
                  ? "OFFLINE — CONNECT TO BOOK"
                  : getButtonText()}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
      {renderDepartmentModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: "#FAFAFA" },
  wizardHeader: {
    padding: 20,
    paddingTop: Platform.OS === "ios" ? 10 : 20,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  wizardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#8B4513",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  progressBar: {
    height: 6,
    backgroundColor: "#EEEEEE",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#2E7D32" },

  bodyContainer: { flex: 1 },
  stepContainer: { flex: 1, padding: 20 },
  stepHeader: {
    fontSize: 28,
    fontWeight: "900",
    color: "#3E2723",
    marginBottom: 5,
  },
  subText: { fontSize: 14, color: "#757575", marginBottom: 20 },

  gridWrap: { flexDirection: "row", flexWrap: "wrap", gap: 15 },
  card: {
    width: "47%",
    backgroundColor: "white",
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 2,
    elevation: 2,
  },
  unselectedCard: { borderColor: "#E0E0E0" },
  selectedCard: { borderColor: "#8B4513", backgroundColor: "#FFF8E1" },
  cardText: {
    fontWeight: "700",
    color: "#5D4037",
    marginTop: 10,
    fontSize: 16,
    textAlign: "center",
  },
  selectedTextBold: { color: "#8B4513", fontWeight: "900" },
  checkBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#2E7D32",
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    elevation: 4,
  },

  searchInput: {
    backgroundColor: "#EEEEEE",
    padding: 15,
    borderRadius: 12,
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  catChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#E0E0E0",
    borderRadius: 20,
  },
  catChipSelected: { backgroundColor: "#5D4037" },
  catText: { color: "#555", fontWeight: "800", fontSize: 13 },
  catTextSelected: { color: "white" },

  serviceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "white",
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#eee",
  },
  selectedServiceRow: { borderColor: "#8B4513", backgroundColor: "#FFF8E1" },
  serviceName: { fontSize: 16, fontWeight: "800", color: "#3E2723" },
  serviceDuration: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
    fontStyle: "italic",
    fontWeight: "600",
  },
  servicePrice: { fontSize: 18, fontWeight: "900", color: "#2E7D32" },
  emptyText: {
    textAlign: "center",
    color: "#aaa",
    marginTop: 20,
    fontStyle: "italic",
  },

  modernDateBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    padding: 16,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: "#8B4513",
    elevation: 2,
  },
  modernDateText: {
    flex: 1,
    color: "#3E2723",
    fontWeight: "800",
    fontSize: 16,
    textAlign: "center",
  },
  modernDateArrow: { color: "#aaa", fontSize: 12 },
  timeOfDayHeader: {
    fontSize: 16,
    fontWeight: "900",
    color: "#8D6E63",
    marginTop: 15,
    marginBottom: 10,
  },
  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 10,
  },
  slotBtn: {
    width: "31%",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
  },
  slotAvailable: { backgroundColor: "white", borderColor: "#E0E0E0" },
  slotSelected: { backgroundColor: "#2E7D32", borderColor: "#2E7D32" },
  slotDisabled: { backgroundColor: "#F5F5F5", borderColor: "#EEEEEE" },
  slotText: { fontWeight: "800", fontSize: 14 },
  slotTextAvailable: { color: "#3E2723" },
  slotTextSelected: { color: "white" },
  slotTextDisabled: { color: "#BDBDBD" },
  slotSubText: {
    fontSize: 9,
    color: "#D32F2F",
    fontWeight: "900",
    marginTop: 4,
  },

  summaryBox: {
    backgroundColor: "#FFF8E1",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D7CCC8",
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#5D4037",
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 15,
    color: "#3E2723",
    marginBottom: 6,
    fontWeight: "600",
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#8D6E63",
    marginBottom: 8,
  },
  notesInput: {
    backgroundColor: "white",
    padding: 18,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    fontSize: 16,
    textAlignVertical: "top",
    minHeight: 120,
  },

  warningBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#D32F2F",
    backgroundColor: "#FFEBEE",
    marginTop: 15,
  },
  warningTitle: {
    fontWeight: "900",
    fontSize: 14,
    color: "#D32F2F",
    marginBottom: 6,
  },
  warningText: {
    fontSize: 13,
    color: "#333",
    lineHeight: 20,
    fontWeight: "600",
  },

  // --- THE FIX: Increased Padding for Android Navbar Clearance ---
  scrollContent: { padding: 20, paddingBottom: 160 },
  stickyFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "white",
    paddingHorizontal: 20,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#EEEEEE",
    elevation: 20,
  },

  footerRow: { flexDirection: "row", justifyContent: "space-between", gap: 15 },
  backBtn: {
    flex: 1,
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#F5F5F5",
  },
  backBtnText: { color: "#555", fontWeight: "800", fontSize: 16 },
  nextBtn: {
    flex: 2,
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#8B4513",
    elevation: 3,
  },
  disabledNextBtn: { backgroundColor: "#E0E0E0", elevation: 0 },
  nextBtnText: { color: "white", fontWeight: "900", fontSize: 16 },

  // --- THE SCALABILITY FIX: NEW STYLES ---
  columnWrapper: { justifyContent: "space-between", marginBottom: 15 },
  searchAndLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  inlineAddBtn: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: "#EFEBE9",
    borderWidth: 2,
    borderColor: "#D7CCC8",
    justifyContent: "center",
    alignItems: "center",
    elevation: 1,
  },
  inlineAddText: {
    fontSize: 24,
    color: "#8B4513",
    fontWeight: "bold",
  },

  // --- THE BUNDLE BOX OPTIMIZATION ---
  bundleBox: {
    backgroundColor: "#EFEBE9",
    padding: 15,
    borderRadius: 14,
    marginBottom: 15,
    borderLeftWidth: 5,
    borderLeftColor: "#8B4513",
  },
  bundleTitle: {
    fontWeight: "900",
    color: "#5D4037",
    fontSize: 14,
    marginBottom: 10,
  },
  bundleScrollContainer: {
    flexDirection: "row",
  },
  bundlePillScroll: {
    gap: 8,
    paddingRight: 10,
  },
  bundlePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#8B4513",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  bundlePillText: {
    color: "white",
    fontSize: 12,
    fontWeight: "900",
  },
  bundlePillRemove: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontWeight: "bold",
  },

  // --- DEPARTMENT EXPLORER STYLES ---
  deptTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 14,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#EFEBE9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  deptTriggerLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8B4513',
  },
  deptTriggerSub: {
    fontSize: 12,
    color: '#795548',
    marginTop: 2,
  },
  deptTriggerArrow: {
    fontSize: 18,
    color: '#BDBDBD',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    height: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#2E2E2E',
  },
  modalCloseText: {
    color: '#8B4513',
    fontWeight: 'bold',
    fontSize: 16,
  },
  modalSearchInput: {
    backgroundColor: '#F5F5F5',
    padding: 15,
    borderRadius: 14,
    fontSize: 16,
    marginBottom: 15,
    color: '#333',
  },
  sortOptionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  sortChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  sortChipActive: {
    backgroundColor: '#8B4513',
  },
  sortChipText: {
    fontSize: 12,
    color: '#795548',
    fontWeight: 'bold',
  },
  sortChipTextActive: {
    color: 'white',
  },
  deptModalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  deptModalRowSelected: {
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  deptModalName: {
    fontSize: 16,
    color: '#424242',
    fontWeight: '600',
  },
  deptModalTextSelected: {
    color: '#8B4513',
    fontWeight: '900',
  },
  deptCountBadge: {
    backgroundColor: '#EFEBE9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  deptCountText: {
    fontSize: 12,
    color: '#8B4513',
    fontWeight: 'bold',
  },

  // --- SCHEDULING INTELLIGENCE STYLES ---
  insightBox: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#8B4513',
  },
  insightHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#3E2723',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  insightText: {
    fontSize: 13,
    color: '#5D4037',
    lineHeight: 18,
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9E9E9E',
    textTransform: 'uppercase',
  },

  // --- STEP 4 SCALABILITY STYLES ---
  summaryPetsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryPetChip: {
    backgroundColor: '#8B4513',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  summaryPetName: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  summaryServiceScroll: {
    maxHeight: 120, // Critical for preventing screen take-over
    marginVertical: 5,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 12,
  },
  summaryTotalBig: {
    color: "#2E7D32",
    fontWeight: "900",
    marginTop: 12,
    fontSize: 22,
    textAlign: 'right',
  },

  // --- Follow-up date hint (B5) ---
  followUpHint: {
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 3,
    borderLeftColor: '#E65100',
    padding: 10,
    marginBottom: 10,
    borderRadius: 6,
  },
  followUpHintText: {
    fontSize: 12,
    color: '#8B4513',
    fontStyle: 'italic',
  },
  noShowBanner: {
    marginHorizontal: 16,
    marginBottom: 6,
    padding: 10,
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 4,
    borderLeftColor: '#F57C00',
    borderRadius: 4,
  },
  noShowBannerTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#E65100',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noShowBannerText: {
    fontSize: 11,
    color: '#BF360C',
    fontWeight: '700',
  },
});
