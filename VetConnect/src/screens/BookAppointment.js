import DateTimePicker from "@react-native-community/datetimepicker";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";
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
} from "react-native";
import { auth, db } from "../../firebaseConfig";

// THE BRAIN
import { useSafeAreaInsets } from "react-native-safe-area-context"; // <-- THE FIX: Hardware measurement hook
import { useBookingEngine } from "../hooks/useBookingEngine";

export default function BookAppointment({ navigation }) {
  const insets = useSafeAreaInsets();
  // --- ENTERPRISE WIZARD STATE ---
  const [step, setStep] = useState(1);

  // --- DATA STATES ---
  const [selectedPets, setSelectedPets] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]); // THE FIX: Moving to Array for Bundles!
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loading, setLoading] = useState(false);

  // --- SCALABILITY STATES ---
  const [serviceSearch, setServiceSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [ownerName, setOwnerName] = useState("");

  // THE FIX: Destructuring clinicSettings from the hook!
  const {
    pets,
    services,
    availableSlots,
    busynessLevel,
    fetching,
    loadingSlots,
    clinicSettings,
  } = useBookingEngine(date, selectedServices, selectedPets); // Passing the array to the brain!

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
          setOwnerName(userData.fullName || auth.currentUser.email);

          if (!userData.address || !userData.emergencyName) {
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
        }
      } catch (err) {
        console.log(err);
      }
    };
    initializeUser();
  }, [navigation, clinicSettings]);

  // --- HANDLERS ---
  const togglePetSelection = (pet) => {
    if (selectedPets.find((p) => p.id === pet.id)) {
      // Unselect
      setSelectedPets(selectedPets.filter((p) => p.id !== pet.id));
    } else {
      // THE FIX: Enforce the Web Admin's Dynamic Capacity Rule!
      const maxAllowed = clinicSettings?.maxPetsPerBooking || 3;
      if (selectedPets.length >= maxAllowed) {
        Alert.alert(
          "Limit Reached",
          `The clinic currently allows a maximum of ${maxAllowed} pets per booking online. Please call the clinic for larger group accommodations.`,
        );
        return;
      }
      // Select
      setSelectedPets([...selectedPets, pet]);
    }
    // Always reset downstream choices to prevent conflicting biological filters
    setSelectedServices([]);
    setSelectedSlot(null);
  };

  const toggleServiceSelection = (srv) => {
    if (selectedServices.find(s => s.id === srv.id)) {
        setSelectedServices(selectedServices.filter(s => s.id !== srv.id));
    } else {
        setSelectedServices([...selectedServices, srv]);
    }
    setSelectedSlot(null);
  };

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      setDate(selectedDate);
      setSelectedSlot(null);
    }
  };

  // --- THE FATAL FLAW FIX: JIT CONCURRENCY CHECK (Now Multi-Service Aware!) ---
  const submitBooking = async () => {
    setLoading(true);
    try {
      const [hours, minutes] = selectedSlot.split(":");
      const baseDateTime = new Date(date);
      baseDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      // --- 🧬 CALCULATE BUNDLE PARAMETERS ---
      let bundleTotalMinutes = 0;
      let bundleTotalPrice = 0;
      const mappedServices = selectedServices.map(s => {
          const dur = parseInt(String(s.duration).replace(/[^0-9]/g, "")) || 30;
          const buff = parseInt(String(s.bufferTime).replace(/[^0-9]/g, "")) || 0;
          const price = parseFloat(s.price) || 0;
          
          bundleTotalMinutes += (dur + buff);
          bundleTotalPrice += price;

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
              buffer: buff
          };
      });

      // JIT PRE-FLIGHT CHECK
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

      // Verify availability for EACH service in the bundle
      let serviceOffset = 0;
      for (let svc of mappedServices) {
          const svcStart = new Date(baseDateTime.getTime() + serviceOffset * 60000);
          const svcEnd = new Date(svcStart.getTime() + (svc.duration + svc.buffer) * 60000);
          const requiredDept = svc.department.toLowerCase();

          const competing = checkSnap.docs.filter(d => {
              const data = d.data();
              const deptsInAppt = new Set();
              if (data.services && Array.isArray(data.services)) {
                  data.services.forEach(s => deptsInAppt.add((s.department || "General").toLowerCase()));
              } else {
                  deptsInAppt.add((data.department || data.serviceCategory || "General").toLowerCase());
              }
              return deptsInAppt.has(requiredDept);
          });

          let currentOverlaps = 0;
          competing.forEach(d => {
              const s = d.data().scheduledDate.toDate();
              const e = new Date(s.getTime() + ((d.data().serviceDuration || 30) + (d.data().serviceBuffer || 0)) * 60000);
              if (svcStart < e && svcEnd > s) currentOverlaps++;
          });

          const capacity = departmentCapacity[requiredDept] || 1;
          if (currentOverlaps >= capacity) {
              Alert.alert("Slot Taken", `Another client just booked a ${svc.department} specialist during this window. Please select another time.`);
              setStep(3); setSelectedSlot(null); setLoading(false); return;
          }
          serviceOffset += (svc.duration + svc.buffer);
      }

      // ATOMIC BATCH WRITE
      const batch = writeBatch(db);
      selectedPets.forEach((pet, index) => {
        const petDateTime = new Date(baseDateTime.getTime() + index * bundleTotalMinutes * 60000);
        const qrData = `VC-${auth.currentUser.uid.slice(0, 5)}-${Date.now()}-${index}`;
        const newApptRef = doc(collection(db, "appointments"));

        batch.set(newApptRef, {
          ownerId: auth.currentUser.uid,
          ownerName: ownerName,
          petId: pet.id,
          petName: pet.name,
          petSpecies: pet.species,
          
          // --- EVOLVED SCHEMA ---
          services: mappedServices,
          primaryService: mappedServices[0].name,
          serviceCategory: mappedServices[0].department,
          serviceDuration: bundleTotalMinutes, // Total visit duration
          servicePrice: bundleTotalPrice,
          
          status: "pending",
          scheduledDate: Timestamp.fromDate(petDateTime),
          createdAt: Timestamp.now(),
          qrCode: qrData,
          notes: selectedPets.length > 1 ? `[Group Booking ${index + 1}/${selectedPets.length}] ${notes}` : notes,
        });
      });

      await batch.commit();
      Alert.alert(
        "Success",
        `${selectedPets.length} appointment(s) successfully requested!`,
      );
      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- WIZARD NAVIGATION LOGIC ---
  const handleNext = () => {
    if (step === 1 && selectedPets.length === 0)
      return Alert.alert("Required", "Please select at least one pet.");
    if (step === 2 && !selectedService)
      return Alert.alert("Required", "Please select a service.");
    if (step === 3 && !selectedSlot)
      return Alert.alert("Required", "Please select a time slot.");
    if (step === 4) {
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
    if (step > 1) setStep(step - 1);
    else navigation.goBack();
  };

  const getButtonText = () => {
    if (loading) return "Processing...";
    if (step === 1 && selectedPets.length === 0) return "1. Select a Pet";
    if (step === 2 && selectedServices.length === 0) return "2. Select Service(s)";
    if (step === 3 && !selectedSlot) return "3. Select a Time";
    if (step === 4)
      return `Book ${selectedPets.length} Appointment${selectedPets.length > 1 ? "s" : ""}`;
    return "Continue";
  };

  // --- STEP 1 RENDER: PATIENTS ---
  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepHeader}>Who is visiting?</Text>
      <Text style={styles.subText}>
        Select up to {clinicSettings?.maxPetsPerBooking || 3} pets for a group
        booking.
      </Text>
      {fetching ? (
        <ActivityIndicator
          color="#8B4513"
          size="large"
          style={{ marginTop: 20 }}
        />
      ) : (
        <View style={styles.gridWrap}>
          {pets.map((pet) => {
            const isSelected = selectedPets.find((p) => p.id === pet.id);
            return (
              <TouchableOpacity
                key={pet.id}
                style={[
                  styles.card,
                  isSelected ? styles.selectedCard : styles.unselectedCard,
                ]}
                onPress={() => togglePetSelection(pet)}
              >
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <Text
                      style={{
                        color: "white",
                        fontSize: 12,
                        fontWeight: "900",
                      }}
                    >
                      ✓
                    </Text>
                  </View>
                )}
                <Text style={{ fontSize: 32, marginBottom: 8 }}>
                  {pet.species === "Canine" || pet.species === "Dog"
                    ? "🐶"
                    : "🐱"}
                </Text>
                <Text
                  style={[
                    styles.cardText,
                    isSelected && styles.selectedTextBold,
                  ]}
                >
                  {pet.name}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* THE SEAMLESS FIX: Add Pet Button injected directly into the funnel without Android Shadow Bleed */}
          <TouchableOpacity
            style={[
              styles.card,
              {
                backgroundColor: "rgba(255,255,255,0.5)",
                borderWidth: 2,
                borderColor: "#D7CCC8",
                justifyContent: "center",
                alignItems: "center",
                shadowOpacity: 0, // Explicitly kill shadow if needed
              },
            ]}
            onPress={() => navigation.navigate("AddPet")}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: "#EFEBE9",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text
                style={{ fontSize: 24, color: "#8B4513", fontWeight: "bold" }}
              >
                +
              </Text>
            </View>
            <Text style={{ fontWeight: "900", color: "#8B4513", fontSize: 15 }}>
              Add New Pet
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // --- STEP 2 RENDER: SERVICES ---
  const renderStep2 = () => {
    let filteredServices = [];
    let availableCategories = ["All"];

    // Biological Filter
    const speciesSet = new Set(
      selectedPets.map((p) =>
        p.species === "Dog" || p.species === "Canine" ? "Canine" : "Feline",
      ),
    );
    if (speciesSet.size > 1)
      filteredServices = services.filter(
        (s) => !s.targetSpecies || s.targetSpecies === "Universal",
      );
    else {
      const targetSp = [...speciesSet][0];
      filteredServices = services.filter(
        (s) =>
          !s.targetSpecies ||
          s.targetSpecies === "Universal" ||
          s.targetSpecies === targetSp,
      );
    }
    availableCategories = [
      "All",
      ...new Set(
        filteredServices.map((s) => s.department || s.category || "General"),
      ),
    ];

    // Category & Search Filter
    const displayedServices = filteredServices.filter((s) => {
      const sCat = s.department || s.category || "General";
      const matchCat = selectedCategory === "All" || sCat === selectedCategory;
      const matchSearch = s.name
        .toLowerCase()
        .includes(serviceSearch.toLowerCase());
      return matchCat && matchSearch;
    });

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepHeader}>What do they need?</Text>
        <Text style={styles.subText}>You can select multiple services to bundle them into one visit.</Text>

        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search for a service..."
          placeholderTextColor="#aaa"
          value={serviceSearch}
          onChangeText={setServiceSearch}
        />

        <View style={styles.chipWrap}>
          {availableCategories.map((cat, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.catChip,
                selectedCategory === cat && styles.catChipSelected,
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.catText,
                  selectedCategory === cat && styles.catTextSelected,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* --- 🧬 SERVICE BUNDLE BAR --- */}
        {selectedServices.length > 0 && (
            <View style={{ backgroundColor: '#EFEBE9', padding: 10, borderRadius: 12, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#8B4513' }}>
                <Text style={{ fontWeight: 'bold', color: '#5D4037', fontSize: 13 }}>Selected Bundle ({selectedServices.length}):</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 5 }}>
                    {selectedServices.map(s => (
                        <View key={s.id} style={{ backgroundColor: '#8B4513', borderRadius: 15, paddingHorizontal: 10, paddingVertical: 4, marginRight: 5, marginBottom: 5 }}>
                            <Text style={{ color: 'white', fontSize: 11, fontWeight: 'bold' }}>{s.name}</Text>
                        </View>
                    ))}
                </View>
            </View>
        )}

        <ScrollView
          style={{ flex: 1, marginTop: 10 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 150 }}
        >
          {displayedServices.length === 0 ? (
            <Text style={styles.emptyText}>No services found.</Text>
          ) : (
            displayedServices.map((srv) => {
              const isSelected = selectedServices.find(s => s.id === srv.id);
              return (
              <TouchableOpacity
                key={srv.id}
                style={[
                  styles.serviceRow,
                  isSelected && styles.selectedServiceRow,
                ]}
                onPress={() => toggleServiceSelection(srv)}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.serviceName,
                      isSelected && styles.selectedTextBold,
                    ]}
                  >
                    {srv.name}
                  </Text>
                  <Text style={styles.serviceDuration}>
                    ⏱️{" "}
                    {parseInt(String(srv.duration).replace(/[^0-9]/g, "")) ||
                      30}{" "}
                    mins
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text
                        style={[
                            styles.servicePrice,
                            isSelected && styles.selectedTextBold,
                        ]}
                    >
                        ₱{srv.price}
                    </Text>
                    {isSelected && (
                        <View style={{ backgroundColor: '#2E7D32', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 4 }}>
                            <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>✓</Text>
                        </View>
                    )}
                </View>
              </TouchableOpacity>
            )})
          )}
        </ScrollView>
      </View>
    );
  };

  // --- STEP 3 RENDER: DATE & TIME ---
  const renderStep3 = () => {
    // Exclude 'PAST' slots completely
    const futureSlots = availableSlots.filter((s) => s.status !== "PAST");
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

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepHeader}>When should we expect you?</Text>

        <TouchableOpacity
          style={styles.modernDateBtn}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={styles.modernDateText}>
            📅{" "}
            {date.toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
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
          />
        )}

        {!selectedService || selectedPets.length === 0 ? (
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
              ❌ No available slots remaining for this date. Please select
              another day.
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
                          ? "LEAD TIME"
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
                          ? "LEAD TIME"
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
      </View>
    );
  };

  // --- STEP 4 RENDER: REVIEW & NOTES ---
  const renderStep4 = () => {
    const isSurgery = selectedService?.category === "Surgery";

    // Dynamic Phrasing based on service
    const notesConfig = (() => {
      const cat = selectedService?.category || "Consultation";
      switch (cat) {
        case "Grooming":
          return {
            title: "Styling Instructions",
            ph: "e.g. Summer cut, leave tail fluffy...",
          };
        case "Surgery":
          return {
            title: "Pre-Surgical Notes",
            ph: "e.g. Acknowledged fasting protocol...",
          };
        case "Vaccination":
          return {
            title: "Health Status",
            ph: "Is your pet currently healthy? Any sneezing?",
          };
        default:
          return {
            title: "Reason for Visit / Symptoms",
            ph: "e.g. Vomiting, lethargic for 2 days...",
          };
      }
    })();

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.stepContainer}
      >
        <Text style={styles.stepHeader}>Final Details</Text>

        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Booking Summary</Text>
          <Text style={styles.summaryText}>
            🐾 Patient(s): {selectedPets.map((p) => p.name).join(", ")}
          </Text>
          <View style={{ marginVertical: 5, padding: 8, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 8 }}>
            <Text style={{ fontWeight: 'bold', fontSize: 13, color: '#5D4037', marginBottom: 4 }}>Selected Services:</Text>
            {selectedServices.map(s => (
                <Text key={s.id} style={{ fontSize: 13, color: '#5D4037' }}>• {s.name} (₱{s.price})</Text>
            ))}
          </View>
          <Text style={styles.summaryText}>
            🕒 Time: {date.toLocaleDateString()} at {selectedSlot}
          </Text>
          <Text
            style={[
              styles.summaryText,
              {
                color: "#2E7D32",
                fontWeight: "900",
                marginTop: 10,
                fontSize: 18,
              },
            ]}
          >
            Total: ₱{selectedServices.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0) * selectedPets.length}
          </Text>
        </View>

        <Text style={styles.inputLabel}>{notesConfig.title}</Text>
        <TextInput
          style={styles.notesInput}
          placeholder={notesConfig.ph}
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={4}
          value={notes}
          onChangeText={setNotes}
        />

        {isSurgery && (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>⚠️ SURGICAL REQUIREMENT</Text>
            <Text style={styles.warningText}>
              Strict fasting required: NO food or water for 8-12 hours prior to
              the visit.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    );
  };

  return (
    <SafeAreaView style={styles.rootContainer}>
      {/* HEADER WIZARD PROGRESS */}
      <View style={styles.wizardHeader}>
        <Text style={styles.wizardTitle}>Booking: Step {step} of 4</Text>
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${(step / 4) * 100}%` }]}
          />
        </View>
      </View>

      {/* DYNAMIC BODY */}
      <View style={styles.bodyContainer}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </View>

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
              {step === 1 ? "Cancel" : "Back"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.nextBtn,
              (loading ||
                (step === 1 && selectedPets.length === 0) ||
                (step === 2 && !selectedService) ||
                (step === 3 && !selectedSlot)) &&
                styles.disabledNextBtn,
            ]}
            onPress={handleNext}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text
                style={[
                  styles.nextBtnText,
                  (loading ||
                    (step === 1 && selectedPets.length === 0) ||
                    (step === 2 && !selectedService) ||
                    (step === 3 && !selectedSlot)) && { color: "#9E9E9E" },
                ]}
              >
                {getButtonText()}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
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
});
