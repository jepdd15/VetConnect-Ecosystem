import DateTimePicker from "@react-native-community/datetimepicker";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
  FlatList,
  Modal,
} from "react-native";
import { auth, db } from "../../firebaseConfig";

// THE BRAIN
import { useSafeAreaInsets } from "react-native-safe-area-context"; // <-- THE FIX: Hardware measurement hook
import { useBookingEngine } from "../hooks/useBookingEngine";
import { formatDisplayDate, formatDisplayTime, getLocalDateStr, resolveTieredPrice } from '../utils/helpers';
import { COLORS, FONTS, SHADOW, SPACING } from '../theme/mobileTokens';
import { useNetwork } from "../context/NetworkContext";
import { MaterialIcons } from '@expo/vector-icons';
import { fetchVaccineCatalog, buildVaccinationStatus } from '../utils/vaccineHelpers';
import BookingAISheet from '../components/BookingAISheet';

// T4.206: Default system prompt for the AI Booking Advisor.
// Overridden by system_prompts/booking_assistant Firestore doc when it exists.
const DEFAULT_BOOKING_AI_PROMPT = `You are a Veterinary Clinic AI Booking Advisor, helping pet owners in the Philippines choose the right services and schedule appointments through the app.

YOUR ROLE:
- Help pet owners understand which services their pet needs based on the pet's health data provided below
WHAT YOU MUST DO:
- Recommend when to schedule based on vaccine due dates, follow-up dates, and slot availability
- Explain what each service involves in simple, friendly language
- Suggest optimal timing based on the clinic's available slots
- TRUST THE PROVIDED DATA: The "CLINIC INFO" and "AVAILABLE SLOTS" are the ground truth. If the clinic opens at 1:00 AM, treat these as intentional business rules, not system errors.

WHAT YOU MUST NOT DO:
- Never diagnose medical conditions or prescribe medications
- Never make promises about pricing, outcomes, or specific appointment availability
- Never book appointments -- you can only suggest. The owner books through the app's booking wizard
- Never share information about other clients or their pets

RESPONSE STYLE:
- Keep responses under 150 words unless the question requires detail
- Use simple, warm language -- avoid medical jargon
- When recommending services, explain WHY (e.g. "Rabies vaccine is overdue by 45 days")
- Mention any known pet allergies if relevant to the proposed services
- When suggesting times, mention which slots look less busy if that data is available
- Be encouraging about preventive care and regular check-ups
- Use Filipino cultural context when relevant

BOOKING CONTEXT (current pet and clinic data):
`;

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
  // T4.UX: "inspected" is what the detail card shows — distinct from "selected".
  // Tapping an AVAILABLE tile sets BOTH (you've picked it AND you're reading about it).
  // Tapping a DISABLED tile sets ONLY inspected (peek at why; selection stays put).
  const [inspectedSlot, setInspectedSlot] = useState(null);
  const [loading, setLoading] = useState(false);

  // Reschedule reason — required (Amendment 2). Empty string disables the Confirm button.
  const [rescheduleReason, setRescheduleReason] = useState("");

  // --- SCALABILITY STATES ---
  const [serviceSearch, setServiceSearch] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("All");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [ownerCity, setOwnerCity] = useState("");
  const [emergencyContacts, setEmergencyContacts] = useState([]);
  const [petSearch, setPetSearch] = useState(""); // THE FIX: Searchable Pets!
  
  // --- DEPARTMENT EXPLORER MODAL STATES ---
  const [isDeptModalVisible, setIsDeptModalVisible] = useState(false);
  const [deptModalSearch, setDeptModalSearch] = useState("");
  const [deptSortOrder, setDeptSortOrder] = useState("name"); // Sorting of depts in list
  const [serviceSortOrder, setServiceSortOrder] = useState("name-asc"); // Sorting of actual services

  // --- NO-SHOW DETECTION ---
  // Populated after pet selection. Shown as an informational warning banner.
  const [noShowInfo, setNoShowInfo] = useState(null);

  // T4.147: Outstanding balance from previous completed visits.
  // One-shot query on mount — balance is unlikely to change while booking.
  const [outstandingBalance, setOutstandingBalance] = useState(0);

  // T4.206: AI Booking Advisor
  const [aiSheetVisible, setAiSheetVisible]   = useState(false);
  const [pressedBtn, setPressedBtn]           = useState(null); // 'back' or 'next'
  const [isBundleModalVisible, setIsBundleModalVisible] = useState(false);
  const [workerUrl, setWorkerUrl]             = useState('');
  const [bookingContext, setBookingContext]    = useState('');
  const [customBookingPrompt, setCustomBookingPrompt] = useState('');

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
    visitDurationMin, // T4.UX: drives the YOUR VISIT chip + tile time range
  } = useBookingEngine(date, selectedServices, selectedPet, rescheduleAppointmentId);
  
  // THE FIX: High performance searching for large pet lists!
  const filteredPets = useMemo(() => {
    if (!petSearch) return pets;
    return pets.filter(p => p.name.toLowerCase().includes(petSearch.toLowerCase()));
  }, [pets, petSearch]);

  // T4.UX: STALE-SELECTION GUARD — if another client snipes the slot the user
  // had picked (status flips from AVAILABLE to FULL/OVERFLOW via the real-time
  // reservation listener), drop the selection so the detail card never lies and
  // SELECT THIS TIME can't fire on a slot that would now reject the transaction.
  useEffect(() => {
    if (!selectedSlot) return;
    const live = availableSlots.find(s => s.timeValue === selectedSlot);
    if (!live || live.status !== 'AVAILABLE') {
      setSelectedSlot(null);
    }
  }, [availableSlots, selectedSlot]);

  // T4.UX: when selectedSlot is externally cleared (date change, reset paths),
  // also clear the inspected slot so the detail card disappears with it.
  useEffect(() => {
    if (selectedSlot === null) setInspectedSlot(null);
  }, [selectedSlot]);

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
    if ((prefillPetId || prefillServiceType) && selectedPet && selectedServices.length > 0) {
      if (prefillDate) {
        const parsed = new Date(prefillDate);
        if (!isNaN(parsed.getTime())) {
          setDate(parsed);
          setStep(3);
          prefillApplied.current = true;
        }
      } else {
        // T4.207: If pet and service are prefilled (Re-Book), skip directly to Step 3 (Slot Picker)
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
  useEffect(() => {
    if (!auth.currentUser) return;
    let cancelled = false;
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
        if (!cancelled) setOutstandingBalance(total);
      } catch (err) {
        console.warn('[BookAppointment] Balance check failed:', err.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // T4.206: One-shot fetch for Cloudflare Worker URL. FAB hidden when empty.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'clinic_settings', 'llm_config'));
        if (!cancelled && snap.exists()) {
          const data = snap.data();
          if (data.enabled && data.workerUrl) {
            setWorkerUrl(data.workerUrl);
          }
        }
      } catch {
        // Non-critical -- FAB stays hidden
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // T4.206: Fetch custom system prompt from Firestore (one-shot).
  // Falls back to DEFAULT_BOOKING_AI_PROMPT when the doc does not exist.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'system_prompts', 'booking_assistant'));
        if (!cancelled && snap.exists()) {
          const prompt = snap.data().prompt;
          if (prompt) setCustomBookingPrompt(prompt);
        }
      } catch {
        // Non-critical -- use default
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // T4.206: Build booking context for AI system prompt.
  // Fetches medical_records + vaccine catalog when pet changes, formats everything.
  useEffect(() => {
    if (!selectedPet) {
      setBookingContext('');
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        // 1. Fetch pet's recent medical records
        const recordsSnap = await getDocs(
          query(
            collection(db, 'medical_records'),
            where('petId', '==', selectedPet.id),
          ),
        );
        const allRecords = recordsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const aT = a.date?.toDate ? a.date.toDate().getTime() : a.date?.seconds ? a.date.seconds * 1000 : 0;
            const bT = b.date?.toDate ? b.date.toDate().getTime() : b.date?.seconds ? b.date.seconds * 1000 : 0;
            return bT - aT;
          });

        // 2. Vaccine status
        const catalog = await fetchVaccineCatalog();
        const { statuses: vaccineStatuses } = buildVaccinationStatus(allRecords, catalog, selectedPet.species);

        if (cancelled) return;

        // 3. Build context string
        const lines = [];

        // Pet profile
        lines.push('=== PET PROFILE ===');
        lines.push(`Name: ${selectedPet.name}`);
        lines.push(`Species: ${selectedPet.species || 'Unknown'}`);
        if (selectedPet.breed) lines.push(`Breed: ${selectedPet.breed}`);
        if (selectedPet.age) lines.push(`Age: ${selectedPet.age}`);
        if (selectedPet.weight) lines.push(`Weight: ${selectedPet.weight} kg`);
        const allergies = selectedPet.petAllergies || selectedPet.allergies;
        if (allergies) lines.push(`Allergies: ${allergies}`);

        // Vaccination status
        if (vaccineStatuses && vaccineStatuses.length > 0) {
          lines.push('');
          lines.push('=== VACCINATION STATUS ===');
          for (const vs of vaccineStatuses) {
            const statusLabel = vs.status === 'overdue' ? 'OVERDUE'
              : vs.status === 'due_soon' ? 'DUE SOON'
              : vs.status === 'current' ? 'Current'
              : vs.status === 'incomplete' ? `Incomplete (${vs.dosesGiven}/${vs.dosesRequired} doses)`
              : 'No record';
            const dueInfo = vs.daysUntilDue != null
              ? (vs.daysUntilDue < 0 ? ` (${Math.abs(vs.daysUntilDue)} days overdue)` : ` (due in ${vs.daysUntilDue} days)`)
              : '';
            lines.push(`- ${vs.name}: ${statusLabel}${dueInfo}`);
          }
        }

        // Recent medical history (last 3 for prompt brevity)
        if (allRecords.length > 0) {
          lines.push('');
          lines.push('=== RECENT MEDICAL HISTORY (last 3) ===');
          for (const r of allRecords.slice(0, 3)) {
            const rDate = r.date?.toDate ? r.date.toDate() : r.date?.seconds ? new Date(r.date.seconds * 1000) : null;
            const dateStr = rDate ? rDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date';
            lines.push(`[${dateStr}]`);
            if (r.diagnosis) lines.push(`  Diagnosis: ${r.diagnosis}`);
            if (r.soap?.plan || r.dischargeNotes) lines.push(`  Discharge: ${r.soap?.plan || r.dischargeNotes}`);
            if (r.followUpDate) {
              const fuDate = r.followUpDate?.toDate ? r.followUpDate.toDate() : new Date(r.followUpDate);
              if (!isNaN(fuDate.getTime())) {
                lines.push(`  Follow-up due: ${fuDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`);
              }
            }
          }
        }

        // Selected services (if any)
        if (selectedServices.length > 0) {
          lines.push('');
          lines.push('=== CURRENTLY SELECTED SERVICES ===');
          for (const svc of selectedServices) {
            lines.push(`- ${svc.name} (${svc.department || svc.category || 'General'}) - ${svc.duration || 30} min`);
          }
        }

        // Available services for this pet's species
        const speciesKey = (selectedPet.species || '').toLowerCase();
        const isCat = speciesKey.includes('cat') || speciesKey.includes('feline');
        const speciesFilter = isCat ? 'Feline' : 'Canine';
        const availForSpecies = services.filter(
          s => !s.targetSpecies || s.targetSpecies === 'Universal' || s.targetSpecies === speciesFilter,
        );
        if (availForSpecies.length > 0) {
          lines.push('');
          lines.push('=== AVAILABLE SERVICES ===');
          const byDept = {};
          for (const s of availForSpecies) {
            const dept = s.department || s.category || 'General';
            if (!byDept[dept]) byDept[dept] = [];
            byDept[dept].push(s.name);
          }
          for (const [dept, names] of Object.entries(byDept)) {
            lines.push(`${dept}: ${names.join(', ')}`);
          }
        }

        // Available slots for selected date (AVAILABLE status only, increased visibility)
        if (availableSlots && availableSlots.length > 0) {
          const openSlots = availableSlots.filter(s => s.status === 'AVAILABLE');
          if (openSlots.length > 0) {
            lines.push('');
            lines.push(`=== AVAILABLE SLOTS (${date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}) ===`);
            // Increased visibility (40 slots) ensures afternoon slots are visible even if opening is 1 AM
            const slotLabels = openSlots.slice(0, 40).map(s => s.display);
            lines.push(slotLabels.join(', '));
            if (openSlots.length > 40) {
              lines.push(`(${openSlots.length - 40} more slots available)`);
            }
          }
        }

        // Clinic hours
        if (clinicSettings) {
          lines.push('');
          lines.push('=== CLINIC INFO ===');
          
          const fmt = h => {
            const ampm = h >= 12 ? 'PM' : 'AM';
            const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
            return `${display}:00 ${ampm}`;
          };

          const openH = clinicSettings.openHour;
          const closeH = clinicSettings.closeHour;
          if (openH != null && closeH != null) {
            lines.push(`Hours: ${fmt(openH)} - ${fmt(closeH)}`);
          }
          if (clinicSettings.workingDays) {
            lines.push(`Working days: ${clinicSettings.workingDays.join(', ')}`);
          }
          if (clinicSettings.lunchEnabled) {
            lines.push(`Lunch Break (No Bookings): ${fmt(clinicSettings.lunchStart || 12)} - ${fmt(clinicSettings.lunchEnd || 13)}`);
          }
        }

        setBookingContext(lines.join('\n'));
      } catch (err) {
        if (__DEV__) console.warn('[BookAppointment] Context build failed:', err.message);
        setBookingContext('');
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPet?.id, selectedServices.length, date, availableSlots?.length, clinicSettings, services]);

  // T4.206: Memoized system prompt = default/Firestore prompt + live booking context.
  const bookingSystemPrompt = useMemo(() => {
    const basePrompt = customBookingPrompt || DEFAULT_BOOKING_AI_PROMPT;
    return bookingContext ? `${basePrompt}\n\n${bookingContext}` : basePrompt;
  }, [customBookingPrompt, bookingContext]);

  // T4.206: Fire-and-forget audit logging for AI booking queries.
  const handleBookingAuditLog = useCallback((promptSummary, messageCount) => {
    try {
      addDoc(collection(db, 'llm_audit_logs'), {
        source: 'booking',
        userId: auth.currentUser?.uid || 'anonymous',
        petId: selectedPet?.id || '',
        petName: selectedPet?.name || '',
        species: selectedPet?.species || '',
        timestamp: Timestamp.now(),
        type: messageCount <= 1 ? 'request' : 'follow_up',
        status: 'completed',
        promptSummary,
        messageCount,
      });
    } catch {
      // Non-fatal -- audit failure should never break the booking flow
    }
  }, [selectedPet]);

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
        const manilaTodayStr = new Intl.DateTimeFormat('en-ZA', { timeZone: 'Asia/Manila' }).format(new Date()).replace(/\//g, '-');
        const manilaToday = new Date(`${manilaTodayStr}T00:00:00+08:00`);
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
    // 3. Sorting Step
    list = [...list].sort((a, b) => {
        const petWeight = parseFloat(selectedPet?.lastVitals?.weight ?? selectedPet?.weight ?? selectedPet?.lastWeight) || null;
        const priceA = resolveTieredPrice(a, petWeight);
        const priceB = resolveTieredPrice(b, petWeight);

        switch (serviceSortOrder) {
            case "name-asc": return a.name.localeCompare(b.name);
            case "name-desc": return b.name.localeCompare(a.name);
            case "price-asc": return priceA - priceB;
            case "price-desc": return priceB - priceA;
            default: return 0;
        }
    });

    return list;
  }, [services, selectedDepartment, serviceSearch, selectedPet, serviceSortOrder]);

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
          setOwnerPhone(userData.phone || '');
          setOwnerEmail(userData.email || auth.currentUser.email || '');
          setOwnerAddress(userData.address || '');
          setOwnerCity(userData.city || '');
          setEmergencyContacts(userData.emergencyContacts || []);

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

  // T4.UX: shared tap handler for SlotTile. Every tap moves the detail card to
  // the tapped slot (inspectedSlot); only AVAILABLE slots become selectedSlot.
  // This is the "grid holds SELECTED, card holds INSPECTED" pattern — peeking at
  // a disabled tile to read its reason never clobbers a prior selection.
  const handleTilePress = (slot) => {
    setInspectedSlot(slot.timeValue);
    if (slot.status === 'AVAILABLE') {
      setSelectedSlot(slot.timeValue);
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

      // T4.205: Reservation-based reschedule — delete old reservations, create new ones.
      // JIT pre-flight (getDocs outside transaction) removed — replaced by transactional
      // reservation doc swap for true mutual exclusion.
      const newDateStr = getLocalDateStr(newDateTime);
      const trimmedReason = rescheduleReason.trim();

      // Compute department groups from the appointment's existing services
      const allGroupServices = rescheduleAppointment.services || [];
      const reschDeptGroups = {};
      allGroupServices.forEach(svc => {
        const dept = (svc.department || "General").toLowerCase();
        const dur = parseInt(String(svc.duration).replace(/[^0-9]/g, "")) || 30;
        const buff = parseInt(String(svc.buffer).replace(/[^0-9]/g, "")) || 0;
        reschDeptGroups[dept] = Math.max(reschDeptGroups[dept] || 0, dur + buff);
      });

      await runTransaction(db, async (transaction) => {
        // 1. Read the existing appointment to get the old scheduledDate
        const apptRef = doc(db, "appointments", rescheduleAppointmentId);
        const apptSnap = await transaction.get(apptRef);
        if (!apptSnap.exists()) throw new Error("Appointment not found.");
        const oldData = apptSnap.data();
        const oldDate = oldData.scheduledDate.toDate();
        const oldDateStr = `${oldDate.getFullYear()}-${String(oldDate.getMonth() + 1).padStart(2, '0')}-${String(oldDate.getDate()).padStart(2, '0')}`;
        const oldHH = String(oldDate.getHours()).padStart(2, '0');
        const oldMM = String(oldDate.getMinutes()).padStart(2, '0');

        // 2. Delete old reservation docs (no-op if they don't exist)
        for (const dept of Object.keys(reschDeptGroups)) {
          const oldResId = `${oldDateStr}_${oldHH}_${oldMM}_${dept}`;
          transaction.delete(doc(db, "slot_reservations", oldResId));
        }

        // 3. Write new reservation docs — same conflict-detection pattern as submitBooking
        const newHH = String(newDateTime.getHours()).padStart(2, '0');
        const newMM = String(newDateTime.getMinutes()).padStart(2, '0');
        const newResDateStr = `${newDateTime.getFullYear()}-${String(newDateTime.getMonth() + 1).padStart(2, '0')}-${String(newDateTime.getDate()).padStart(2, '0')}`;

        for (const [dept, duration] of Object.entries(reschDeptGroups)) {
          const newResId = `${newResDateStr}_${newHH}_${newMM}_${dept}`;
          const newResRef = doc(db, "slot_reservations", newResId);

          const existingRes = await transaction.get(newResRef);
          if (existingRes.exists()) {
            const resData = existingRes.data();
            if (resData.expiresAt && resData.expiresAt.toDate() > new Date()) {
              const deptDisplay = dept.charAt(0).toUpperCase() + dept.slice(1);
              throw new Error(
                `The ${deptDisplay} department is fully booked for this time slot. Please select another time.`
              );
            }
          }

          transaction.set(newResRef, {
            ownerId: auth.currentUser.uid,
            petId: oldData.petId,
            appointmentId: rescheduleAppointmentId,
            department: dept,
            scheduledDate: Timestamp.fromDate(newDateTime),
            slotStart: `${newHH}:${newMM}`,
            duration,
            createdAt: Timestamp.now(),
            expiresAt: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
          });
        }

        // 4. Update the appointment
        transaction.update(apptRef, {
          scheduledDate: Timestamp.fromDate(newDateTime),
          scheduledDateStr: newResDateStr,
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
        });
      });

      Alert.alert(
        "Rescheduled",
        `Your appointment has been moved to ${formatDisplayDate(newDateTime)}. The clinic will confirm the new date.`,
      );
      navigation.goBack();
    } catch (error) {
      // T4.205: Slot-taken errors from reservation conflict — reset to slot picker
      if (error.message.includes('fully booked for this time slot')) {
        Alert.alert("Slot Taken", error.message);
        setStep(3);
        setSelectedSlot(null);
      } else {
        Alert.alert("Error", "Could not reschedule. Please try again.");
        console.error("[BookAppointment.submitReschedule]:", error.message);
      }
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

      // T2.87: Use runTransaction for atomic write + retry-on-contention.
      // T4.205: JIT pre-flight (getDocs outside transaction) removed — replaced by
      // reservation doc writes INSIDE the transaction for true mutual exclusion.
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

        // T4.205: Write one reservation doc per department INSIDE the transaction.
        // Deterministic doc ID: {dateStr}_{HH}_{MM}_{department}
        // If two concurrent transactions write the same ID, Firestore retries one.
        const dateStr = `${baseDateTime.getFullYear()}-${String(baseDateTime.getMonth() + 1).padStart(2, '0')}-${String(baseDateTime.getDate()).padStart(2, '0')}`;
        const slotHH = String(baseDateTime.getHours()).padStart(2, '0');
        const slotMM = String(baseDateTime.getMinutes()).padStart(2, '0');

        const reservationDeptGroups = {};
        selectedServices.forEach(s => {
          const dept = (s.department || s.category || "General").toLowerCase();
          const dur = parseInt(String(s.duration).replace(/[^0-9]/g, "")) || 30;
          const buff = parseInt(String(s.bufferTime).replace(/[^0-9]/g, "")) || 0;
          reservationDeptGroups[dept] = Math.max(reservationDeptGroups[dept] || 0, dur + buff);
        });

        for (const [dept] of Object.entries(reservationDeptGroups)) {
          const reservationId = `${dateStr}_${slotHH}_${slotMM}_${dept}`;
          const reservationRef = doc(db, "slot_reservations", reservationId);

          // Read inside the transaction — registers the doc for conflict detection.
          // If two concurrent transactions read then write the same doc, Firestore
          // retries one and the retried client finds the existing reservation.
          const existingRes = await transaction.get(reservationRef);
          if (existingRes.exists()) {
            const resData = existingRes.data();
            const now = new Date();
            // Only block if the reservation is still valid (not expired)
            if (resData.expiresAt && resData.expiresAt.toDate() > now) {
              const deptDisplay = dept.charAt(0).toUpperCase() + dept.slice(1);
              throw new Error(
                `The ${deptDisplay} department is fully booked for this time slot. Please select another time.`
              );
            }
            // Expired reservation — overwrite it below
          }

          transaction.set(reservationRef, {
            ownerId: auth.currentUser.uid,
            petId: pet.id,
            appointmentId: newApptRef.id,
            department: dept,
            scheduledDate: Timestamp.fromDate(baseDateTime),
            slotStart: `${slotHH}:${slotMM}`,
            duration: reservationDeptGroups[dept],
            createdAt: Timestamp.now(),
            expiresAt: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
          });
        }

        transaction.set(newApptRef, {
          ownerId: auth.currentUser.uid,
          ownerName: ownerName,
          ownerPhone: ownerPhone || null,
          ownerEmail: ownerEmail || null,
          ownerAddress: ownerAddress || null,
          ownerCity: ownerCity || null,
          emergencyContacts: emergencyContacts || [],
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
          isAgeExact: pet.isAgeExact ?? true,

          services: petMappedServices,
          primaryService: petMappedServices[0].name,
          serviceType: petMappedServices[0].name,
          serviceCategory: petMappedServices[0].department,
          serviceDuration: petServiceDuration,
          serviceBuffer: petServiceBuffer,
          servicePrice: petBundlePrice,

          status: "pending",
          statusHistory: [],
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
      // T4.205: Slot-taken errors from reservation conflict — reset to slot picker
      if (error.message.includes('fully booked for this time slot')) {
        Alert.alert("Slot Taken", error.message);
        setStep(3);
        setSelectedSlot(null);
      } else {
        Alert.alert("Error", error.message);
      }
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
            <Text style={styles.subText}>Select a pet for this appointment.</Text>
            
            <View style={styles.hubSearchRow}>
                <View style={styles.hubSearchWrapper}>
                    <View style={styles.hubShadowSmall} />
                    <View style={styles.hubSearchContainer}>
                        <MaterialIcons name="search" size={20} color={COLORS.accent} style={{ marginLeft: 12 }} />
                        <TextInput
                            style={styles.hubSearchInput}
                            placeholder="Search pets..."
                            placeholderTextColor={COLORS.textMuted}
                            value={petSearch}
                            onChangeText={setPetSearch}
                        />
                    </View>
                </View>

                <TouchableOpacity 
                    style={styles.hubAddPetBtn}
                    onPress={() => navigation.navigate("AddPet")}
                >
                    <View style={styles.hubShadowSmall} />
                    <View style={styles.hubAddPetBtnContent}>
                        <MaterialIcons name="add" size={24} color={COLORS.white} />
                    </View>
                </TouchableOpacity>
            </View>
            
            {fetching && (
                <ActivityIndicator color={COLORS.accent} size="large" style={{ marginVertical: 20 }} />
            )}
          </View>
        }
        renderItem={({ item: pet }) => {
          const isSelected = selectedPet?.id === pet.id;
          return (
            <TouchableOpacity
              key={pet.id}
              style={styles.petCardWrapper}
              onPress={() => selectPet(pet)}
            >
              <View style={[styles.hubShadowSmall, isSelected && { backgroundColor: COLORS.success }]} />
              <View style={[
                styles.compactPetCard,
                isSelected && styles.selectedPetCard
              ]}>
                <View style={styles.petCardIconBox}>
                    <Text style={{ fontSize: 28 }}>
                        {pet.species === "Canine" || pet.species === "Dog" ? "🐶" : "🐱"}
                    </Text>
                </View>
                <View style={styles.petCardInfo}>
                    <Text style={[styles.petCardName, isSelected && { color: COLORS.white }]} numberOfLines={1}>
                        {pet.name}
                    </Text>
                    <Text style={[styles.petCardMeta, isSelected && { color: COLORS.white }]} numberOfLines={1}>
                        {pet.breed || pet.species}
                    </Text>
                </View>
                {isSelected && (
                    <View style={styles.petCardBadge}>
                        <MaterialIcons name="check-circle" size={16} color={COLORS.white} />
                    </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  // --- BUNDLE CALCULATIONS ---
  const bundleTotals = useMemo(() => {
    return selectedServices.reduce(
      (acc, s) => ({
        price: acc.price + (parseFloat(s.price) || 0),
        duration: acc.duration + (parseInt(s.duration) || 0),
      }),
      { price: 0, duration: 0 }
    );
  }, [selectedServices]);

  const renderBundleModal = () => (
    <Modal
      visible={isBundleModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setIsBundleModalVisible(false)}
    >
      <TouchableOpacity 
        style={styles.receiptOverlay}
        activeOpacity={1}
        onPress={() => setIsBundleModalVisible(false)}
      >
        <View style={styles.receiptWrapper}>
          <TouchableOpacity 
              activeOpacity={1} 
              style={styles.receiptContainer}
          >
            <View style={styles.receiptHeaderBox}>
              <View style={styles.receiptHeaderStamp}>
                  <Text style={styles.receiptHeaderTitle}>VISIT BUNDLE PREVIEW</Text>
              </View>
              <TouchableOpacity 
                  style={styles.receiptCloseBtn}
                  onPress={() => setIsBundleModalVisible(false)}
              >
                  <MaterialIcons name="close" size={24} color={COLORS.brand} />
              </TouchableOpacity>
            </View>

            <ScrollView 
                style={styles.receiptScroll} 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20 }}
            >
              {selectedServices.map((s, idx) => (
                <View key={`${s.id}-${idx}`} style={styles.receiptLineItem}>
                  <View style={styles.receiptItemInfo}>
                    <Text style={styles.receiptItemName}>{s.name.toUpperCase()}</Text>
                    <Text style={styles.receiptItemMeta}>{s.duration} MINS</Text>
                  </View>
                  <Text style={styles.receiptItemPrice}>₱{s.price}</Text>
                </View>
              ))}
              
              {selectedServices.length === 0 && (
                  <Text style={styles.emptyText}>No services selected yet.</Text>
              )}
              
              <View style={{ height: 40 }} />
            </ScrollView>

            <View style={styles.receiptFooter}>
              <View style={styles.receiptFooterContent}>
                  <View style={styles.receiptFooterSilo}>
                      <Text style={styles.receiptSiloLabel}>ESTIMATED TOTAL</Text>
                      <Text style={styles.receiptGrandTotal}>₱{bundleTotals.price}</Text>
                  </View>
                  
                  <View style={styles.receiptSiloDivider} />

                  <View style={styles.receiptFooterSilo}>
                      <Text style={styles.receiptSiloLabel}>TOTAL TIME</Text>
                      <Text style={styles.receiptMetaTotal}>{bundleTotals.duration} MINS</Text>
                  </View>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // --- STEP 2 RENDER: SERVICES ---
  const renderStep2 = () => {
    const renderServiceRow = (s, isSelected, onToggle) => (
      <TouchableOpacity
        key={s.id}
        style={styles.serviceCardWrapper}
        onPress={() => onToggle(s)}
        activeOpacity={0.8}
      >
        <View style={[
            styles.hubShadowSky, 
            { top: 4, left: 4, right: -4, bottom: -4, width: '100%' },
            isSelected && { top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' }
        ]} />
        <View style={[
            styles.hubServiceCard,
            isSelected && styles.hubSelectedServiceCard
        ]}>
            <View style={styles.serviceIdentitySilo}>
                <Text style={styles.hubServiceName} numberOfLines={1}>
                    {s.name}
                </Text>
            </View>

            <View style={styles.serviceValueSilo}>
                <View style={{ alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[styles.hubPriceHero, { color: COLORS.white }]}>₱{s.price}</Text>
                        {isSelected && (
                            <MaterialIcons name="check-circle" size={16} color={COLORS.sky} />
                        )}
                    </View>
                    <Text style={[styles.hubDurationMeta, { color: 'rgba(255,255,255,0.7)' }]}>{s.duration} MINS</Text>
                </View>
            </View>
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
              
              {/* UNIFIED COMMAND HUB */}
              <View style={[styles.hubUnifiedWrapper, { height: 50, marginBottom: 20 }]}>
                <View style={[styles.hubShadowSky, { top: 4, left: 4, right: -4, bottom: -4 }]} />
                <View style={[styles.hubUnifiedBar, { borderWidth: 2 }]}>
                    <TextInput
                        style={[styles.hubUnifiedInput, { paddingLeft: 16 }]}
                        placeholder="Search services..."
                        placeholderTextColor={COLORS.textMuted}
                        value={serviceSearch}
                        onChangeText={setServiceSearch}
                    />
                    <TouchableOpacity
                        style={[styles.hubFilterSilo, { borderLeftWidth: 2 }]}
                        onPress={() => setIsDeptModalVisible(true)}
                    >
                        <MaterialIcons name="tune" size={18} color={COLORS.brand} />
                        <Text style={[styles.hubFilterText, { fontSize: 10 }]}>
                            FILTER
                        </Text>
                    </TouchableOpacity>
                </View>
              </View>

              {/* BUNDLE CHIP-SET (CLICKABLE) */}
              {selectedServices.length > 0 && (
                <TouchableOpacity 
                    style={styles.hubBundleContainer}
                    onPress={() => setIsBundleModalVisible(true)}
                    activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={styles.hubLabel}>SELECTED BUNDLE ({selectedServices.length})</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.hubLabel, { color: COLORS.brand, marginBottom: 0 }]}>VIEW LEDGER</Text>
                        <MaterialIcons name="receipt" size={14} color={COLORS.brand} />
                    </View>
                  </View>
                  <ScrollView
                    horizontal
                    pointerEvents="none"
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.hubBundleScroll}
                  >
                    {selectedServices.map((s) => (
                      <View
                        key={s.id}
                        style={styles.hubBundleChip}
                      >
                        <Text style={styles.hubBundleChipText} numberOfLines={1}>{s.name}</Text>
                        <MaterialIcons name="close" size={14} color={COLORS.brand} />
                      </View>
                    ))}
                  </ScrollView>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item }) =>
            renderServiceRow(item, selectedServices.some((s) => s.id === item.id), toggleService)
          }
        />
      </View>
    );
  };

  // --- STEP 3 RENDER: DATE & TIME ---
  const renderStep3 = () => {
    // Exclude 'PAST' slots completely
    // T4.UX: useBookingEngine never emits a "PAST" status — past slots are
    // dropped inside the slot loop via `if (slotStart < now) continue`. So the
    // earlier filter on s.status !== "PAST" was a no-op. availableSlots already
    // contains only future-or-current slots.
    const futureSlots = availableSlots;

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

        {/* RE-POSITIONED LEGEND (Tier 1 Hardening) */}
        <View style={[styles.legendContainer, { borderTopWidth: 0, marginTop: 5, marginBottom: 15, justifyContent: 'flex-start', gap: 15 }]}>
            <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.borderLight }]} />
                <Text style={styles.legendText}>Available</Text>
            </View>
            <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLORS.danger }]} />
                <Text style={styles.legendText}>Fully Booked</Text>
            </View>
            <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLORS.muted }]} />
                <Text style={styles.legendText}>Unavailable</Text>
            </View>
        </View>

        {/* T4.UX: YOUR VISIT chip — sets context for what every tile's number refers to.
            Hidden when no services picked (the prompt below covers that case). */}
        {selectedServices.length > 0 && selectedPet && (
          <View style={styles.visitChip}>
            <Text style={styles.visitChipLabel}>YOUR VISIT</Text>
            <Text style={styles.visitChipBody}>
              {selectedServices.map(s => s.name).join(' + ')}
              {visitDurationMin > 0 ? `  ·  ~${visitDurationMin} min total` : ''}
            </Text>
          </View>
        )}

        {selectedServices.length === 0 || !selectedPet ? (
          <Text style={styles.subtlePrompt}>
            🕒 Select a service to see available time slots.
          </Text>
        ) : loadingSlots ? (
          <ActivityIndicator
            color={COLORS.accent}
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
            // T4.UX: extra padding when the detail card is visible so the last row
            // of tiles always scrolls clear of both the card and the repositioned FAB.
            contentContainerStyle={{ paddingBottom: inspectedSlot ? 300 : 120 }}
          >
            {morningSlots.length > 0 && (
              <Text style={styles.timeOfDayHeader}>☀️ Morning</Text>
            )}
            <View style={styles.slotGrid}>
              {morningSlots.map((slot) => (
                <SlotTile
                  key={slot.timeValue}
                  slot={slot}
                  isSelected={selectedSlot === slot.timeValue}
                  onPress={() => handleTilePress(slot)}
                />
              ))}
            </View>

            {afternoonSlots.length > 0 && (
              <Text style={styles.timeOfDayHeader}>🌙 Afternoon</Text>
            )}
            <View style={styles.slotGrid}>
              {afternoonSlots.map((slot) => (
                <SlotTile
                  key={slot.timeValue}
                  slot={slot}
                  isSelected={selectedSlot === slot.timeValue}
                  onPress={() => handleTilePress(slot)}
                />
              ))}
            </View>
          </ScrollView>
        )}

        {/* T4.UX: InspectedSlotDetail — appears when a tile (available OR disabled)
            has been tapped. Shows the full breakdown the tile can't fit. */}
        {inspectedSlot && (() => {
          const live = availableSlots.find((s) => s.timeValue === inspectedSlot);
          if (!live) return null;
          return (
            <InspectedSlotDetail
              slot={live}
              services={selectedServices}
              durationMin={visitDurationMin}
              clinicSettings={clinicSettings}
              onDismiss={() => setInspectedSlot(null)}
            />
          );
        })()}
      </View>
    );
  };

  // --- NEW: THE UNIFIED CLINICAL FILTER HUB ---
  const renderDepartmentModal = () => {
    const isNameActive = serviceSortOrder.startsWith('name');
    const isPriceActive = serviceSortOrder.startsWith('price');
    
    const toggleSort = (type) => {
        if (type === 'name') {
            setServiceSortOrder(serviceSortOrder === 'name-asc' ? 'name-desc' : 'name-asc');
        } else {
            setServiceSortOrder(serviceSortOrder === 'price-asc' ? 'price-desc' : 'price-asc');
        }
    };

    const getIcon = (type) => {
        const order = type === 'name' ? (serviceSortOrder.includes('desc') ? 'arrow-downward' : 'arrow-upward')
                                      : (serviceSortOrder.includes('desc') ? 'arrow-downward' : 'arrow-upward');
        return order;
    };

    return (
        <Modal
          visible={isDeptModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsDeptModalVisible(false)}
        >
          <TouchableOpacity 
            style={styles.filterOverlay} 
            activeOpacity={1} 
            onPress={() => setIsDeptModalVisible(false)}
          >
            <View style={styles.filterSheet} onStartShouldSetResponder={() => true}>
              <View style={styles.filterSheetHandle} />
              
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 }}>
                <Text style={styles.filterSheetTitle}>FILTER & SORT</Text>
                <TouchableOpacity onPress={() => setIsDeptModalVisible(false)}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: COLORS.sky, textTransform: 'uppercase' }}>Done</Text>
                </TouchableOpacity>
              </View>
    
              <ScrollView style={styles.filterSheetScroll} showsVerticalScrollIndicator={false}>
                {/* SORT RIBBON SECTION */}
                <Text style={styles.filterSheetSection}>SORT BY</Text>
                <View style={styles.sortRibbon}>
                    <TouchableOpacity 
                        style={[styles.sortToggleButton, isNameActive && styles.sortToggleButtonActive]}
                        onPress={() => toggleSort('name')}
                    >
                        <Text style={[styles.sortToggleText, isNameActive && styles.sortToggleTextActive]}>NAME</Text>
                        <MaterialIcons 
                            name={getIcon('name')} 
                            size={16} 
                            color={isNameActive ? COLORS.white : COLORS.brand} 
                        />
                    </TouchableOpacity>
    
                    <TouchableOpacity 
                        style={[styles.sortToggleButton, isPriceActive && styles.sortToggleButtonActive]}
                        onPress={() => toggleSort('price')}
                    >
                        <Text style={[styles.sortToggleText, isPriceActive && styles.sortToggleTextActive]}>PRICE</Text>
                        <MaterialIcons 
                            name={getIcon('price')} 
                            size={16} 
                            color={isPriceActive ? COLORS.white : COLORS.brand} 
                        />
                    </TouchableOpacity>
                </View>
    
                {/* DEPARTMENT SECTION */}
                <Text style={[styles.filterSheetSection, { marginTop: 10 }]}>DEPARTMENTS</Text>
                {[{ name: 'All', count: services.length }, ...departmentStats].map((item) => {
                  const isSelected = selectedDepartment === item.name;
                  return (
                    <TouchableOpacity
                      key={item.name}
                      style={styles.filterSheetRow}
                      onPress={() => setSelectedDepartment(item.name)}
                    >
                      <MaterialIcons
                        name={isSelected ? 'radio-button-checked' : 'radio-button-unchecked'}
                        size={22}
                        color={isSelected ? COLORS.sky : COLORS.textMuted}
                      />
                      <Text style={[styles.filterSheetLabel, isSelected && styles.filterSheetLabelActive]}>
                        {item.name}
                      </Text>
                      <Text style={styles.filterSheetCount}>({item.count})</Text>
                    </TouchableOpacity>
                  );
                })}
                <View style={{ height: 40 }} />
              </ScrollView>
    
              <View style={styles.filterSheetActions}>
                <TouchableOpacity
                  style={styles.filterSheetClearBtn}
                  onPress={() => {
                    setServiceSearch("");
                    setSelectedDepartment("All");
                    setServiceSortOrder("name-asc");
                  }}
                >
                  <Text style={styles.filterSheetClearText}>RESET ALL FILTERS</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      );
  };

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
          <Text style={styles.stepHeader}>Reschedule</Text>
          <Text style={styles.subText}>Review your updated appointment timing.</Text>

          <View style={styles.hubSection}>
            <View style={styles.hubShadow} />
            <View style={styles.hubCard}>
                <View style={styles.hubIconContainer}>
                    <MaterialIcons name="event-repeat" size={24} color={COLORS.white} />
                </View>
                <View style={styles.hubCardContent}>
                    <Text style={styles.hubLabel}>PATIENT</Text>
                    <Text style={styles.hubValueMajor}>{rescheduleAppointment?.petName}</Text>
                    <Text style={styles.hubValueMeta}>{rescheduleAppointment?.serviceType}</Text>
                </View>
            </View>
          </View>

          <View style={styles.hubSection}>
            <View style={styles.hubShadow} />
            <View style={styles.hubCard}>
                <View style={styles.scheduleRow}>
                    <View style={styles.scheduleCol}>
                        <Text style={styles.hubLabel}>PREVIOUS</Text>
                        <Text style={[styles.hubValueMeta, { textDecorationLine: 'line-through' }]}>
                          {formatDisplayDate(originalDate)} • {formatDisplayTime(originalDate)}
                        </Text>
                    </View>
                    <View style={styles.scheduleDivider} />
                    <View style={styles.scheduleCol}>
                        <Text style={styles.hubLabel}>NEW SLOT</Text>
                        <Text style={[styles.hubValueMajor, { fontSize: 18, color: COLORS.success }]}>
                          {formatDisplayDate(date)}
                        </Text>
                        <Text style={[styles.hubValueMajor, { fontSize: 18, color: COLORS.success }]}>
                          at {selectedSlot}
                        </Text>
                    </View>
                </View>
            </View>
          </View>

          <View style={styles.notesContainer}>
            <Text style={styles.hubLabel}>
              REASON FOR RESCHEDULING <Text style={{ color: COLORS.danger }}>*</Text>
            </Text>
            <View style={styles.notesInputWrapper}>
              <View style={styles.hubShadowSmall} />
              <TextInput
                style={styles.hubNotesInput}
                placeholder="e.g. Schedule conflict, feeling unwell..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={3}
                value={rescheduleReason}
                onChangeText={setRescheduleReason}
              />
            </View>
            {isReasonEmpty && (
              <Text style={{ color: COLORS.danger, fontSize: 11, marginTop: 12, fontWeight: '700', textTransform: 'uppercase' }}>
                A reason is required before confirming.
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  // --- STEP 4 RENDER: REVIEW & NOTES ---
  const renderStep4 = () => {
    // Reschedule mode hijacks Step 4 with its own summary + required reason UI.
    if (rescheduleMode) return renderRescheduleConfirm();

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
            <Text style={styles.stepHeader}>Review Booking</Text>
            <Text style={styles.subText}>Please verify your appointment details below.</Text>

            {/* SECTION 1: THE PATIENT */}
            <View style={styles.hubSection}>
                <View style={styles.hubShadow} />
                <View style={styles.hubCard}>
                    <View style={styles.hubCardContent}>
                        <Text style={styles.hubValueMajor}>{selectedPet?.name}</Text>
                        <Text style={styles.hubValueMeta}>{selectedPet?.species} • {selectedPet?.breed || 'Mixed'}</Text>
                    </View>
                </View>
            </View>

            {/* SECTION 2: THE SCHEDULE */}
            <View style={styles.hubSection}>
                <View style={styles.hubShadow} />
                <View style={styles.hubCard}>
                    <View style={styles.scheduleRow}>
                        <View style={styles.scheduleCol}>
                            <Text style={styles.hubLabel}>DATE</Text>
                            <View style={styles.scheduleDetailRow}>
                                <MaterialIcons name="calendar-today" size={18} color={COLORS.accent} />
                                <Text style={styles.hubValue}>{formatDisplayDate(date)}</Text>
                            </View>
                        </View>
                        <View style={styles.scheduleDivider} />
                        <View style={styles.scheduleCol}>
                            <Text style={styles.hubLabel}>TIME</Text>
                            <View style={styles.scheduleDetailRow}>
                                <MaterialIcons name="access-time" size={18} color={COLORS.accent} />
                                <Text style={styles.hubValue}>{selectedSlot}</Text>
                            </View>
                        </View>
                    </View>
                </View>
            </View>

            {/* SECTION 3: THE SERVICES (LEDGER) */}
            <View style={styles.hubSection}>
                <View style={styles.hubShadow} />
                <View style={styles.ledgerCard}>
                    <Text style={styles.hubLabel}>SELECTED SERVICES ({selectedServices.length})</Text>
                    <View style={styles.ledgerList}>
                        {selectedServices.map((s, idx) => (
                            <View key={s.id} style={styles.ledgerItem}>
                                <Text style={styles.ledgerItemName}>
                                    {idx + 1}. {toTitleCase(s.name)}
                                </Text>
                                <Text style={styles.ledgerItemPrice}>
                                    ₱{resolveTieredPrice(s, petWeight).toLocaleString()}
                                </Text>
                            </View>
                        ))}
                    </View>
                    <View style={styles.ledgerTotalRow}>
                        <Text style={styles.ledgerTotalLabel}>EST. TOTAL</Text>
                        <Text style={styles.ledgerTotalValue}>
                            ₱{grandTotal.toLocaleString()}
                        </Text>
                    </View>
                    <View style={[styles.ledgerTotalRow, { borderTopWidth: 0, paddingTop: 4 }]}>
                        <Text style={[styles.ledgerTotalLabel, { fontSize: 9, color: COLORS.textMuted }]}>EST. DURATION</Text>
                        <Text style={[styles.ledgerTotalValue, { fontSize: 14, color: COLORS.accent }]}>
                            {selectedServices.reduce((sum, s) => sum + (parseInt(s.duration) || 0), 0)} MINS
                        </Text>
                    </View>
                </View>
            </View>

            {/* SECTION 4: CLINICAL NOTES */}
            <View style={styles.notesContainer}>
                <Text style={styles.hubLabel}>REASON FOR VISIT / NOTES</Text>
                <View style={styles.notesInputWrapper}>
                    <View style={styles.hubShadowSmall} />
                    <TextInput
                        style={styles.hubNotesInput}
                        placeholder={notesPlaceholder}
                        placeholderTextColor={COLORS.textMuted}
                        multiline
                        numberOfLines={4}
                        value={notes}
                        onChangeText={setNotes}
                    />
                </View>
            </View>
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
          backgroundColor: COLORS.warningBg,
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

      {/* FLOATING TACTICAL NAVIGATION HUB */}
      <View style={styles.footer}>
        {/* BACK BUTTON HUB */}
        <View style={styles.navBtnWrapper}>
          <View style={styles.navBtnShadow} />
          <TouchableOpacity
            style={[
              styles.navBtn,
              styles.navBtnBack,
              pressedBtn === 'back' && styles.navBtnPressed
            ]}
            onPressIn={() => setPressedBtn('back')}
            onPressOut={() => setPressedBtn(null)}
            onPress={handleBack}
            disabled={loading}
            activeOpacity={1}
          >
            <Text style={styles.navBtnTextBack}>Back</Text>
          </TouchableOpacity>
        </View>

        {/* CONTINUE BUTTON HUB */}
        <View style={[styles.navBtnWrapper, { flex: 1.5 }]}>
          <View style={styles.navBtnShadow} />
          <TouchableOpacity
            style={[
              styles.navBtn,
              styles.navBtnNext,
              (loading ||
                (!isConnected && step === 4 && !rescheduleMode) ||
                (step === 1 && !selectedPet) ||
                (step === 2 && !hasServices) ||
                (step === 3 && !selectedSlot) ||
                (rescheduleMode && step === 4 && rescheduleReason.trim() === '')) &&
                styles.navBtnDisabled,
              pressedBtn === 'next' && styles.navBtnPressed
            ]}
            onPressIn={() => setPressedBtn('next')}
            onPressOut={() => setPressedBtn(null)}
            onPress={handleNext}
            disabled={
              loading ||
              (!isConnected && step === 4 && !rescheduleMode) ||
              (rescheduleMode && step === 4 && rescheduleReason.trim() === '')
            }
            activeOpacity={1}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text
                style={[
                  styles.navBtnTextNext,
                  (loading ||
                    (!isConnected && step === 4 && !rescheduleMode) ||
                    (step === 1 && !selectedPet) ||
                    (step === 2 && !hasServices) ||
                    (step === 3 && !selectedSlot) ||
                    (rescheduleMode && step === 4 && rescheduleReason.trim() === '')) && { color: 'rgba(255,255,255,0.5)' },
                ]}
              >
                {!isConnected && step === 4 && !rescheduleMode
                  ? "OFFLINE — CONNECT"
                  : getButtonText()}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {renderBundleModal()}
      {renderDepartmentModal()}

      {/* T4.206: AI Booking Advisor FAB -- feature-gated on workerUrl, hidden in reschedule mode */}
      {!!workerUrl && !rescheduleMode && !!selectedPet && (
        <TouchableOpacity
          // T4.UX: shift up above the InspectedSlotDetail card when it's visible
          // so the FAB never overlaps the per-department breakdown.
          style={[styles.bookingAiFab, inspectedSlot ? { bottom: 300 } : null]}
          activeOpacity={0.85}
          onPress={() => setAiSheetVisible(true)}
        >
          <View style={styles.bookingAiFabShadow} />
          <View style={styles.bookingAiFabInner}>
            <MaterialIcons name="auto-awesome" size={20} color={COLORS.white} />
            <Text style={styles.bookingAiFabText}>Ask AI</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* T4.206: AI Booking Advisor bottom sheet */}
      <BookingAISheet
        visible={aiSheetVisible}
        onClose={() => setAiSheetVisible(false)}
        petName={selectedPet?.name || ''}
        systemPrompt={bookingSystemPrompt}
        workerUrl={workerUrl}
        userId={auth.currentUser?.uid || 'anonymous'}
        onAuditLog={handleBookingAuditLog}
      />
    </SafeAreaView>
  );
}

// T4.UX: extracted from the duplicated morning/afternoon render blocks so that any
// future tile addition (e.g. time range, accessibility label, inspected highlight)
// lives in ONE place.
function SlotTile({ slot, isSelected, onPress }) {
  const isAvailable = slot.status === "AVAILABLE";
  // T4.UX: drop trailing " AM"/" PM" from the on-tile display because the section
  // header (☀️ Morning / 🌙 Afternoon) already establishes the half of the day —
  // repeating AM/PM on every tile is redundant and was crowding the range string
  // ("1:00 PM – 1:30 PM"). The full versions are preserved for screen readers via
  // accessibilityLabel below.
  const stripAmPm = (s) => (s || '').replace(/\s*(AM|PM)$/i, '');
  const startShort = stripAmPm(slot.display);
  const endShort = slot.endDisplay ? stripAmPm(slot.endDisplay) : '';
  const rangeText = endShort ? `${startShort} – ${endShort}` : startShort;
  const a11yRange = slot.endDisplay ? `${slot.display} to ${slot.endDisplay}` : slot.display;
  return (
    // T4.UX: NOT disabled — even unavailable tiles are tappable so the user can
    // peek at WHY (the parent's handler routes the tap to inspectedSlot only,
    // and only sets selectedSlot when the slot is actually available).
    <TouchableOpacity
      accessibilityLabel={`${a11yRange}, ${
        slot.status === 'OVERFLOW' ? 'unavailable, tap to see why'
        : slot.capacity > 0 ? `${slot.booked} of ${slot.capacity} booked`
        : ''
      }${isSelected ? ', selected' : ''}`}
      style={[
        styles.slotBtn,
        isSelected
          ? styles.slotSelected
          : isAvailable
            ? styles.slotAvailable
            : styles.slotDisabled,
      ]}
      onPress={onPress}
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
        {rangeText}
      </Text>
      {slot.status === "OVERFLOW" ? (
        <Text style={[styles.slotSubText, { color: COLORS.muted }]}>
          UNAVAILABLE
        </Text>
      ) : slot.capacity > 0 ? (
        <Text
          style={[
            styles.slotSubText,
            { color: isSelected ? COLORS.white : isAvailable ? COLORS.textMuted : COLORS.danger },
          ]}
        >
          {slot.booked}/{slot.capacity} booked
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

// T4.UX: detail card for the currently INSPECTED slot — shown above the BACK /
// SELECT THIS TIME footer. Renders the time range + duration, an honest reason
// for unavailable slots (LUNCH / AFTER_HOURS / NO_STAFF / FULL), the per-department
// room availability with text bars, and a recap of the selected services.
function InspectedSlotDetail({ slot, services, durationMin, clinicSettings, onDismiss }) {
  if (!slot) return null;
  const isAvailable = slot.status === 'AVAILABLE';

  const formatHour = (h) => {
    if (h == null) return '';
    const ampm = h >= 12 ? 'PM' : 'AM';
    const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${dh}:00 ${ampm}`;
  };

  let reasonText = null;
  if (slot.reason === 'LUNCH' && clinicSettings) {
    reasonText = `Lunch break (${formatHour(clinicSettings.lunchStart || 12)} – ${formatHour(clinicSettings.lunchEnd || 13)})`;
  } else if (slot.reason === 'AFTER_HOURS') {
    reasonText = 'After closing hours';
  } else if (slot.reason === 'NO_STAFF') {
    const dept = slot.deptLoad?.find((d) => d.capacity === 0);
    reasonText = dept ? `No staff in ${dept.name} today` : 'No staff available for this department';
  } else if (slot.reason === 'FULL') {
    const dept = slot.deptLoad?.find((d) => d.capacity > 0 && d.booked >= d.capacity);
    reasonText = dept ? `${dept.name} is fully booked at this time` : 'Fully booked at this time';
  }

  return (
    <View style={styles.inspectCard}>
      <View style={styles.inspectHeader}>
        <Text style={styles.inspectTime} numberOfLines={1}>
          {isAvailable ? '✓ ' : ''}{slot.display} – {slot.endDisplay}
          {durationMin > 0 ? `  ·  ${durationMin} min` : ''}
        </Text>
        <TouchableOpacity
          onPress={onDismiss}
          style={styles.inspectDismiss}
          accessibilityLabel="Dismiss details"
        >
          <Text style={styles.inspectDismissText}>✕</Text>
        </TouchableOpacity>
      </View>

      {reasonText && <Text style={styles.inspectReason}>{reasonText}</Text>}

      {slot.deptLoad?.length > 0 && (
        <View style={styles.inspectDeptList}>
          <Text style={styles.inspectSectionLabel}>ROOM AVAILABILITY</Text>
          {slot.deptLoad.map((d, i) => {
            const noStaff = d.capacity === 0;
            const isFull = !noStaff && d.booked >= d.capacity;
            const filled = '▮'.repeat(d.booked);
            const empty = '▯'.repeat(Math.max(0, d.capacity - d.booked));
            return (
              <View key={i} style={styles.inspectDeptRow}>
                <Text style={styles.inspectDeptName} numberOfLines={1}>{d.name}</Text>
                <Text
                  style={[
                    styles.inspectDeptBar,
                    { color: noStaff ? COLORS.textMuted : isFull ? COLORS.danger : COLORS.brand },
                  ]}
                >
                  {noStaff ? '— no staff' : `${filled}${empty}`}
                </Text>
                {!noStaff && (
                  <Text
                    style={[
                      styles.inspectDeptCount,
                      { color: isFull ? COLORS.danger : COLORS.textMuted },
                    ]}
                  >
                    {d.booked}/{d.capacity}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {services?.length > 0 && (
        <View style={styles.inspectVisitBlock}>
          <Text style={styles.inspectSectionLabel}>YOUR VISIT</Text>
          {services.map((s, i) => (
            <Text key={i} style={styles.inspectVisitItem} numberOfLines={1}>
              • {s.name} ({s.duration || 30} min · {s.department || s.category || 'General'})
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: COLORS.white },
  wizardHeader: {
    padding: 20,
    paddingTop: Platform.OS === "ios" ? 10 : 20,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  wizardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.accent,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.borderLight,
    borderRadius: 0,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: COLORS.success },

  bodyContainer: { flex: 1 },
  stepContainer: { flex: 1, padding: 20 },
  stepHeader: {
    fontSize: 28,
    fontWeight: "900",
    color: COLORS.brand,
    marginBottom: 5,
  },
  subText: { fontSize: 14, color: COLORS.textMuted, marginBottom: 20 },

  card: {
    width: "47%",
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 0,
    alignItems: "center",
    borderWidth: 2,
    overflow: "visible",
  },
  unselectedCard: { borderColor: COLORS.borderLight },
  selectedCard: { borderColor: COLORS.accent, backgroundColor: COLORS.cream },
  cardText: {
    fontWeight: "700",
    color: COLORS.textSecondary,
    marginTop: 10,
    fontSize: 16,
    textAlign: "center",
  },
  selectedTextBold: { color: COLORS.accent, fontWeight: "900" },
  checkBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: COLORS.success,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  searchInput: {
    backgroundColor: COLORS.borderLight,
    padding: 15,
    borderRadius: 0,
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 15,
  },
  serviceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 0,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
  },
  selectedServiceRow: { borderColor: COLORS.accent, backgroundColor: COLORS.cream },
  serviceName: { fontSize: 16, fontWeight: "800", color: COLORS.brand },
  serviceDuration: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
    fontStyle: "italic",
    fontWeight: "600",
  },
  servicePrice: { fontSize: 18, fontWeight: "900", color: COLORS.success },
  emptyText: {
    textAlign: "center",
    color: COLORS.textMuted,
    marginTop: 20,
    fontStyle: "italic",
  },

  modernDateBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 0,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  modernDateText: {
    flex: 1,
    color: COLORS.brand,
    fontWeight: "800",
    fontSize: 16,
    textAlign: "center",
  },
  modernDateArrow: { color: COLORS.textMuted, fontSize: 12 },
  timeOfDayHeader: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.textMuted,
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
    borderRadius: 0,
    alignItems: "center",
    borderWidth: 2,
  },
  slotAvailable: { backgroundColor: COLORS.white, borderColor: COLORS.borderLight },
  slotSelected: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  // Disabled (Fully Booked / Unavailable) — gray fill so they read as "off" vs the white
  // selectable tiles; the sub-label color (red count vs gray UNAVAILABLE) tells them apart.
  slotDisabled: { backgroundColor: '#EFEAE6', borderColor: COLORS.borderLight },
  slotText: { fontWeight: "800", fontSize: 14 },
  slotTextAvailable: { color: COLORS.brand },
  slotTextSelected: { color: COLORS.white },
  slotTextDisabled: { color: COLORS.textMuted },
  slotSubText: {
    fontSize: 9,
    color: COLORS.danger,
    fontWeight: "900",
    marginTop: 4,
  },

  summaryBox: {
    backgroundColor: COLORS.cream,
    padding: 20,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 15,
    color: COLORS.brand,
    marginBottom: 6,
    fontWeight: "600",
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  notesInput: {
    backgroundColor: COLORS.white,
    padding: 18,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    fontSize: 16,
    textAlignVertical: "top",
    minHeight: 120,
  },

  // T4.UX: YOUR VISIT context chip — anchored above the slot grid
  visitChip: {
    backgroundColor: COLORS.cream,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },

  // T4.UX: InspectedSlotDetail — sits above the BACK / SELECT footer.
  // Shows the time range, an honest reason for unavailable slots, the per-dept
  // room availability with text bars, and a recap of the selected services.
  inspectCard: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    padding: 12,
    marginTop: 8,
  },
  inspectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  inspectTime: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.brand,
  },
  inspectDismiss: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 6,
  },
  inspectDismissText: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.textMuted,
  },
  inspectReason: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  inspectDeptList: {
    marginTop: 4,
    marginBottom: 6,
  },
  inspectSectionLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 1,
    marginBottom: 4,
  },
  inspectDeptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  inspectDeptName: {
    flexShrink: 0,
    minWidth: 100,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  inspectDeptBar: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    paddingHorizontal: 8,
  },
  inspectDeptCount: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '800',
  },
  inspectVisitBlock: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  inspectVisitItem: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textPrimary,
    paddingVertical: 1,
  },
  visitChipLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 1,
    marginBottom: 2,
  },
  visitChipBody: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.brand,
  },

  warningBox: {
    padding: 16,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.danger,
    backgroundColor: COLORS.dangerBg,
    marginTop: 15,
  },
  warningTitle: {
    fontWeight: "900",
    fontSize: 14,
    color: COLORS.danger,
    marginBottom: 6,
  },
  warningText: {
    fontSize: 13,
    color: COLORS.textPrimary,
    lineHeight: 20,
    fontWeight: "600",
  },

  // --- CONFIRMATION HUB STYLES ---
  hubSection: {
    marginBottom: 20,
  },
  hubShadow: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: -6,
    bottom: -6,
    backgroundColor: COLORS.brand,
  },
  hubShadowSmall: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: COLORS.brand,
  },
  hubShadowSky: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: -8,
    bottom: -8,
    backgroundColor: COLORS.sky,
  },
  hubCard: {
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.brand,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hubIconContainer: {
    width: 50,
    height: 50,
    backgroundColor: COLORS.brand,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  hubCardContent: {
    flex: 1,
  },
  hubLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: 1,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  hubValueMajor: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.brand,
    lineHeight: 28,
  },
  hubValueMeta: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '700',
    marginTop: 2,
  },
  hubValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.brand,
    marginLeft: 8,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  scheduleCol: {
    flex: 1,
  },
  scheduleDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  scheduleDivider: {
    width: 2,
    height: '100%',
    backgroundColor: COLORS.borderLight,
    marginHorizontal: 16,
  },
  ledgerCard: {
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.brand,
    padding: 20,
  },
  ledgerList: {
    marginTop: 12,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.borderLight,
    paddingBottom: 12,
  },
  ledgerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ledgerItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    flex: 1,
  },
  ledgerItemPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.brand,
    marginLeft: 10,
  },
  ledgerTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 15,
  },
  ledgerTotalLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.brand,
  },
  ledgerTotalValue: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.success,
  },
  notesContainer: {
    marginTop: 10,
    marginBottom: 30,
  },
  notesInputWrapper: {
    position: 'relative',
    marginTop: 8,
  },
  hubNotesInput: {
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.brand,
    padding: 16,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    minHeight: 160,
    textAlignVertical: 'top',
  },

  // --- STEP 1 HUB STYLES ---
  hubSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
    height: 54,
  },
  hubSearchWrapper: {
    flex: 1,
    height: '100%',
    marginRight: 12,
    position: 'relative',
  },
  hubSearchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.brand,
    height: '100%',
  },
  hubSearchInput: {
    flex: 1,
    paddingVertical: 0,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  hubAddPetBtn: {
    width: 54,
    height: 54,
    position: 'relative',
  },
  hubAddPetBtnContent: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.brand,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.brand,
  },
  petCardWrapper: {
    width: '47%',
    margin: 6,
    position: 'relative',
    height: 120, // Reduced from legacy 140+
  },
  compactPetCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.brand,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedPetCard: {
    backgroundColor: COLORS.brand,
  },
  petCardIconBox: {
    marginBottom: 6,
  },
  petCardInfo: {
    alignItems: 'center',
  },
  petCardName: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.brand,
  },
  petCardMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  petCardBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
  },

  // --- STEP 2 HUB STYLES (CYBER REFINEMENT) ---
  hubUnifiedWrapper: {
    marginBottom: 24,
    position: 'relative',
    height: 56,
    marginHorizontal: 4,
  },
  hubUnifiedBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 3,
    borderColor: COLORS.brand,
  },
  hubSearchIconBox: {
    width: 50,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 3,
    borderRightColor: COLORS.brand,
  },
  hubUnifiedInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.brand,
  },
  hubFilterSilo: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: 12,
    backgroundColor: COLORS.borderLight,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.brand,
    gap: 6,
  },
  hubFilterText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.brand,
  },
  hubBundleContainer: {
    marginBottom: 20,
    marginHorizontal: 4,
  },
  hubBundleScroll: {
    paddingTop: 8,
    gap: 8,
  },
  hubBundleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderStyle: 'dashed',
    gap: 6,
  },
  hubBundleChipText: {
    color: COLORS.brand,
    fontSize: 12,
    fontWeight: '900',
    maxWidth: 150,
  },
  serviceCardWrapper: {
    marginBottom: 16,
    width: '95%',
    alignSelf: 'flex-start',
    marginLeft: 4,
    position: 'relative',
  },
  hubServiceCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderStyle: 'solid',
    height: 64,
  },
  hubSelectedServiceCard: {
    backgroundColor: '#FAFAFA', // Technical Parchment
    borderStyle: 'dashed',
    borderWidth: 2,
  },
  serviceIdentitySilo: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  hubServiceName: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.brand,
  },
  serviceValueSilo: {
    width: 100,
    backgroundColor: COLORS.brand,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.brand,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
  },
  hubPriceHero: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.success,
  },
  hubDurationMeta: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    marginTop: 1,
  },

  // --- THE FIX: Increased Padding for Android Navbar Clearance ---
  scrollContent: { padding: 20, paddingBottom: 160 },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
    backgroundColor: COLORS.white,
    gap: 16,
  },
  navBtnWrapper: {
    flex: 1,
    position: 'relative',
    height: 56,
  },
  navBtnShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: COLORS.brand,
  },
  navBtn: {
    flex: 1,
    height: 56,
    borderWidth: 2,
    borderColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  navBtnPressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  navBtnBack: {
    backgroundColor: COLORS.white,
  },
  navBtnNext: {
    backgroundColor: COLORS.success, // Clinical Green
  },
  navBtnDisabled: {
    backgroundColor: COLORS.borderLight,
    borderColor: COLORS.textMuted,
  },
  navBtnTextBack: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  navBtnTextNext: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },

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
    borderRadius: 0,
    backgroundColor: COLORS.cream,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    justifyContent: "center",
    alignItems: "center",
  },
  inlineAddText: {
    fontSize: 24,
    color: COLORS.accent,
    fontWeight: "bold",
  },

  // --- THE BUNDLE BOX OPTIMIZATION ---
  bundleBox: {
    backgroundColor: COLORS.cream,
    padding: 15,
    borderRadius: 0,
    marginBottom: 15,
    borderLeftWidth: 5,
    borderLeftColor: COLORS.accent,
  },
  bundleTitle: {
    fontWeight: "900",
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 0,
    gap: 6,
  },
  bundlePillText: {
    color: COLORS.white,
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
    backgroundColor: COLORS.white,
    padding: 15,
    borderRadius: 0,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
  },
  deptTriggerLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.accent,
  },
  deptTriggerSub: {
    fontSize: 12,
    color: COLORS.accent,
    marginTop: 2,
  },
  deptTriggerArrow: {
    fontSize: 18,
    color: COLORS.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
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
    color: COLORS.brand,
  },
  modalCloseText: {
    color: COLORS.accent,
    fontWeight: 'bold',
    fontSize: 16,
  },
  modalSearchInput: {
    backgroundColor: COLORS.borderLight,
    padding: 15,
    borderRadius: 0,
    fontSize: 16,
    marginBottom: 15,
    color: COLORS.textPrimary,
  },
  sortOptionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  sortChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 0,
    backgroundColor: COLORS.borderLight,
  },
  sortChipActive: {
    backgroundColor: COLORS.accent,
  },
  sortChipText: {
    fontSize: 12,
    color: COLORS.accent,
    fontWeight: 'bold',
  },
  sortChipTextActive: {
    color: COLORS.white,
  },
  deptModalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  deptModalRowSelected: {
    backgroundColor: COLORS.cream,
    borderRadius: 0,
    paddingHorizontal: 10,
  },
  deptModalName: {
    fontSize: 16,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  deptModalTextSelected: {
    color: COLORS.accent,
    fontWeight: '900',
  },
  deptCountBadge: {
    backgroundColor: COLORS.cream,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 0,
  },
  deptCountText: {
    fontSize: 12,
    color: COLORS.accent,
    fontWeight: 'bold',
  },


  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
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
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },

  // --- STEP 4 SCALABILITY STYLES ---
  summaryPetsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryPetChip: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 0,
  },
  summaryPetName: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  summaryServiceScroll: {
    maxHeight: 120, // Critical for preventing screen take-over
    marginVertical: 5,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 0,
  },
  summaryTotalBig: {
    color: COLORS.success,
    fontWeight: "900",
    marginTop: 12,
    fontSize: 22,
    textAlign: 'right',
  },

  // --- Follow-up date hint (B5) ---
  followUpHint: {
    backgroundColor: COLORS.warningBg,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
    padding: 10,
    marginBottom: 10,
    borderRadius: 0,
  },
  followUpHintText: {
    fontSize: 12,
    color: COLORS.accent,
    fontStyle: 'italic',
  },
  noShowBanner: {
    marginHorizontal: 16,
    marginBottom: 6,
    padding: 10,
    backgroundColor: COLORS.warningBg,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    borderRadius: 0,
  },
  noShowBannerTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.warning,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noShowBannerText: {
    fontSize: 11,
    color: COLORS.danger,
    fontWeight: '700',
  },

  // T4.206: AI Booking Advisor FAB
  bookingAiFab: {
    position: 'absolute',
    bottom: 120,
    right: 20,
    zIndex: 100,
  },
  bookingAiFabShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: COLORS.brand,
  },
  bookingAiFabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.sky,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
  },
  bookingAiFabText: {
    color: COLORS.white,
    fontWeight: '900',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // --- FORENSIC RECEIPT MODAL ---
  receiptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  receiptWrapper: {
    width: '90%',
    maxHeight: '70%',
    position: 'relative',
  },
  receiptContainer: {
    backgroundColor: '#FAFAFA', // Technical Parchment
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: COLORS.brand,
    overflow: 'hidden',
  },
  receiptShadowSky: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: COLORS.sky,
  },
  receiptHeaderBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.brand,
    borderStyle: 'dashed',
    backgroundColor: COLORS.white,
  },
  receiptHeaderStamp: {
    flex: 1,
  },
  receiptHeaderTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.brand,
    letterSpacing: 1,
  },
  receiptCloseBtn: {
    padding: 4,
  },
  receiptScroll: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  receiptLineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
    borderStyle: 'dashed',
  },
  receiptItemInfo: {
    flex: 1,
  },
  receiptItemName: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.brand,
  },
  receiptItemMeta: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 4,
  },
  receiptItemPrice: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.brand,
  },
  receiptFooter: {
    backgroundColor: COLORS.brand,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  receiptFooterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptFooterSilo: {
    flex: 1,
    alignItems: 'center',
  },
  receiptSiloDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  receiptSiloLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.sky,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  receiptGrandTotal: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.white,
  },
  receiptMetaTotal: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.white,
  },

  // --- UNIFIED FILTER HUB STYLES ---
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    backgroundColor: COLORS.cream,
    borderTopWidth: 3,
    borderTopColor: COLORS.brand,
    paddingBottom: 40,
    height: '65%', // Locked for UI stability
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  filterSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.borderLight,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 20,
    borderRadius: 2,
  },
  filterSheetTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.brand,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  filterSheetScroll: {
    paddingHorizontal: 0,
  },
  filterSheetSection: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  filterSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    borderStyle: 'dashed',
  },
  filterSheetLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.accent,
  },
  filterSheetLabelActive: {
    color: COLORS.brand,
    fontWeight: '900',
  },
  filterSheetCount: {
    fontSize: 12,
    color: COLORS.accent, // Hardened from Muted
    fontWeight: '900', // Hardened weight
  },
  filterSheetActions: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sortRibbon: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
    marginTop: 8,
  },
  sortToggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    gap: 8,
  },
  sortToggleButtonActive: {
    backgroundColor: COLORS.brand,
  },
  sortToggleText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.brand,
  },
  sortToggleTextActive: {
    color: COLORS.white,
  },
  filterSheetClearBtn: {
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSheetClearText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.brand,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
