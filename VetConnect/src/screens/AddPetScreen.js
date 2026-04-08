import DateTimePicker from "@react-native-community/datetimepicker";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";

const BREED_DATA = {
  Canine: [
    "Aspin (Asong Pinoy)",
    "Shih Tzu",
    "Pomeranian",
    "Golden Retriever",
    "Labrador",
    "Poodle",
    "Chihuahua",
    "Husky",
    "Beagle",
    "Pug",
    "Bulldog",
    "German Shepherd",
    "Mixed Breed",
    "Unknown",
    "Other",
  ],
  Feline: [
    "Puspin (Pusang Pinoy)",
    "Persian",
    "Siamese",
    "British Shorthair",
    "Maine Coon",
    "Bengal",
    "Mixed Breed",
    "Unknown",
    "Other",
  ],
};

export default function AddPetScreen({ navigation }) {
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("Canine");
  const [breed, setBreed] = useState("");
  const [color, setColor] = useState("");
  const [gender, setGender] = useState(""); // EMPTY: Force explicit selection
  const [isNeutered, setIsNeutered] = useState(false);
  const [weight, setWeight] = useState("");
  const [showAllergyToggle, setShowAllergyToggle] = useState(false);
  const [allergyArray, setAllergyArray] = useState([]);
  const [currentAllergy, setCurrentAllergy] = useState("");
  const [microchip, setMicrochip] = useState("");

  // THE FIX: Cleaned up Age/DOB Logic
  const [dobMode, setDobMode] = useState("exact"); // 'exact' or 'approximate'
  const [dob, setDob] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [estYears, setEstYears] = useState("");
  const [estMonths, setEstMonths] = useState("");

  const [showBreedModal, setShowBreedModal] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);

  const filteredBreeds = BREED_DATA[species].filter((item) =>
    item.toLowerCase().includes(searchText.toLowerCase()),
  );

  const handleSpeciesChange = (newSpecies) => {
    setSpecies(newSpecies);
    setBreed("");
    setSearchText("");
  };

  const handleAddPet = async () => {
    // THE FIX: Mandatory Clinical Passport Validation
    if (!name.trim() || !species || !gender || !breed || !color.trim()) {
      Alert.alert(
        "Required Fields",
        "Please provide all clinical details: Name, Species, Gender, Breed, and Color.",
      );
      return;
    }

    setLoading(true);
    Keyboard.dismiss();

    try {
      let finalDob = null;
      let isAgeExact = false;

      if (dobMode === "exact") {
        finalDob = Timestamp.fromDate(dob);
        isAgeExact = true;
      } else if (dobMode === "approximate") {
        const years = parseInt(estYears || "0");
        const months = parseInt(estMonths || "0");

        // --- 🛡️ BIOLOGY SHIELD (30-YEAR CAP) ---
        if (years > 30) {
          Alert.alert(
            "Biometric Error",
            "Physiological Outlier: Please verify the patient age. We currently only accept registrations for patients under 30 years old."
          );
          setLoading(false);
          return;
        }

        if (months > 11) {
          Alert.alert(
            "Validation Error",
            "Month Overflow: Please enter a month value between 0 and 11. Use the 'Years' field for larger increments."
          );
          setLoading(false);
          return;
        }

        if (years === 0 && months === 0) {
          Alert.alert(
            "Missing Age",
            "Please enter an approximate age in years or months, or use 'Vet to Estimate' mode."
          );
          setLoading(false);
          return;
        }

        // --- 🗓️ STANDARD ANCHORING (1st of the Month) ---
        // This prevents the "31st Roll-Over Trap" and provides a stable clinical baseline.
        const d = new Date();
        d.setFullYear(d.getFullYear() - years);
        d.setMonth(d.getMonth() - months);
        d.setDate(1); // UNIVERSAL ANCHOR
        d.setHours(0, 0, 0, 0);

        finalDob = Timestamp.fromDate(d);
        isAgeExact = false;
      }
      // If dobMode is "unknown", finalDob remains null and isAgeExact remains false

      await addDoc(collection(db, "pets"), {
        ownerId: auth.currentUser.uid,
        name: name.trim(),
        species,
        breed: (breed === "Mixed" || !breed) ? "Mixed Breed" : breed,
        color: color.trim(),
        gender: gender === "UNK" ? "Unknown" : gender,
        isNeutered,
        weight: parseFloat(weight) || null,
        lastWeight: parseFloat(weight) || null,
        microchip: microchip.trim() || "N/A",
        petAllergies: showAllergyToggle && allergyArray.length > 0 ? allergyArray.join(", ") : "None",
        dob: finalDob,
        isAgeExact,
        createdAt: Timestamp.now(),
        status: "active",
      });

      Alert.alert("Success", `${name} has been registered!`);
      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    // THE FIX: Keyboard Avoiding Wrapper
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.header}>New Patient Profile 🐾</Text>
          <Text style={styles.subHeader}>
            Register your pet to access medical history and online booking.
          </Text>

          {/* 1. BASIC INFO */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>1. Basic Info</Text>

            <Text style={styles.label}>Patient Name (*)</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Buddy"
              placeholderTextColor="#aaa"
            />

            <Text style={styles.label}>Species (*)</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  species === "Canine" && styles.activeBtn,
                ]}
                onPress={() => handleSpeciesChange("Canine")}
              >
                <Text
                  style={[
                    styles.toggleText,
                    species === "Canine" && styles.activeText,
                  ]}
                >
                  Canine
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  species === "Feline" && styles.activeBtn,
                ]}
                onPress={() => handleSpeciesChange("Feline")}
              >
                <Text
                  style={[
                    styles.toggleText,
                    species === "Feline" && styles.activeText,
                  ]}
                >
                  Feline
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Gender (*)</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, gender === "Male" && styles.activeBtn]}
                onPress={() => setGender("Male")}
              >
                <Text
                  style={[
                    styles.toggleText,
                    gender === "Male" && styles.activeText,
                  ]}
                >
                  Male
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  gender === "Female" && styles.activeBtn,
                ]}
                onPress={() => setGender("Female")}
              >
                <Text
                  style={[
                    styles.toggleText,
                    gender === "Female" && styles.activeText,
                  ]}
                >
                  Female
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Breed (*)</Text>
            <TouchableOpacity
              style={styles.selectBtn}
              onPress={() => setShowBreedModal(true)}
            >
              <Text style={{ color: breed ? "#333" : "#aaa" }}>
                {breed || "Select breed..."}
              </Text>
              <Text style={{ color: "#8B4513", fontWeight: "900" }}>▼</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Primary Color / Markings (*)</Text>
            <TextInput
              style={styles.input}
              value={color}
              onChangeText={setColor}
              placeholder="e.g. Golden, Black & White"
              placeholderTextColor="#aaa"
            />

            <Text style={styles.label}>Current Weight (kg) (Optional)</Text>
            <TextInput
              style={styles.input}
              value={weight}
              onChangeText={setWeight}
              placeholder="e.g. 12.5"
              keyboardType="numeric"
              placeholderTextColor="#aaa"
            />
          </View>

          {/* 2. AGE / DOB SECTION */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>2. Age & Birthdate</Text>
            <Text style={styles.helperText}>
              This helps veterinarians determine required care.
            </Text>

            <View style={[styles.toggleRow, { marginBottom: 20 }]}>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  dobMode === "exact" && styles.activeBtn,
                ]}
                onPress={() => setDobMode("exact")}
              >
                <Text
                  style={[
                    styles.toggleText,
                    dobMode === "exact" && styles.activeText,
                  ]}
                >
                  Exact Birthday
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  dobMode === "approximate" && styles.activeBtn,
                ]}
                onPress={() => setDobMode("approximate")}
              >
                <Text
                  style={[
                    styles.toggleText,
                    dobMode === "approximate" && styles.activeText,
                  ]}
                >
                  Approx. Age
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  dobMode === "unknown" && styles.activeBtn,
                ]}
                onPress={() => setDobMode("unknown")}
              >
                <Text
                  style={[
                    styles.toggleText,
                    dobMode === "unknown" && styles.activeText,
                  ]}
                >
                  Vet to Estimate
                </Text>
              </TouchableOpacity>
            </View>

            {dobMode === "exact" && (
              <TouchableOpacity
                style={styles.dateBtn}
                onPress={() => setShowPicker(true)}
              >
                <Text style={styles.dateText}>
                  🎂{" "}
                  {dob.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </Text>
              </TouchableOpacity>
            )}

            {dobMode === "approximate" && (
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 5 }}>
                  <Text style={styles.label}>Years</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="0"
                    value={estYears}
                    onChangeText={setEstYears}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 5 }}>
                  <Text style={styles.label}>Months</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="0"
                    value={estMonths}
                    onChangeText={setEstMonths}
                  />
                </View>
              </View>
            )}

            {dobMode === "unknown" && (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>
                  No problem! Our veterinarian will estimate your pet's age
                  during their first physical exam.
                </Text>
              </View>
            )}

            {showPicker && dobMode === "exact" && (
              <DateTimePicker
                value={dob}
                mode="date"
                display="default"
                onChange={(e, d) => {
                  setShowPicker(Platform.OS === "ios");
                  if (d) setDob(d);
                }}
                maximumDate={new Date()}
              />
            )}
          </View>

          {/* 3. MEDICAL */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>3. Medical History</Text>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                Is {name || "your pet"} Spayed/Neutered?
              </Text>
              <Switch
                value={isNeutered}
                onValueChange={setIsNeutered}
                trackColor={{ false: "#ccc", true: "#8B4513" }}
              />
            </View>

            <View
              style={[
                styles.allergyContainer,
                showAllergyToggle && styles.allergyContainerActive,
              ]}
            >
              <View style={styles.switchRow}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={[styles.switchLabel, { color: showAllergyToggle ? "#D32F2F" : "#5D4037" }]}>
                    Record Medical Allergies?
                  </Text>
                </View>
                <Switch
                  value={showAllergyToggle}
                  onValueChange={(val) => {
                    setShowAllergyToggle(val);
                    if (!val) setAllergyArray([]);
                  }}
                  trackColor={{ false: "#ccc", true: "#FFCDD2" }}
                  thumbColor={showAllergyToggle ? "#D32F2F" : "#f4f3f4"}
                />
              </View>

              {showAllergyToggle && (
                <View style={{ marginTop: 10 }}>
                  <View style={styles.tagCloud}>
                    {allergyArray.map((item, index) => (
                      <View key={index} style={styles.tag}>
                        <Text style={styles.tagText}>{item.toUpperCase()}</Text>
                        <TouchableOpacity
                          onPress={() =>
                            setAllergyArray((prev) =>
                              prev.filter((_, i) => i !== index)
                            )
                          }
                        >
                          <Text style={styles.tagClose}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    {allergyArray.length === 0 && (
                      <Text style={styles.emptyTags}>No allergies added...</Text>
                    )}
                  </View>

                  <View style={styles.inputRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      value={currentAllergy}
                      onChangeText={setCurrentAllergy}
                      placeholder="e.g. Chicken"
                      placeholderTextColor="#aaa"
                    />
                    <TouchableOpacity
                      style={[
                        styles.addBtn,
                        !currentAllergy.trim() && { opacity: 0.5 },
                      ]}
                      disabled={!currentAllergy.trim()}
                      onPress={() => {
                        setAllergyArray((prev) => [
                          ...prev,
                          currentAllergy.trim(),
                        ]);
                        setCurrentAllergy("");
                      }}
                    >
                      <Text style={styles.addBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            <Text style={styles.label}>Microchip ID</Text>
            <TextInput
              style={styles.input}
              value={microchip}
              onChangeText={setMicrochip}
              placeholder="e.g. 900123... (Optional)"
              keyboardType="numeric"
              placeholderTextColor="#aaa"
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, loading && { opacity: 0.7 }]}
            onPress={handleAddPet}
            disabled={loading}
          >
            <Text style={styles.saveText}>
              {loading ? "Processing..." : "Register Patient"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>

      {/* BREED MODAL */}
      <Modal visible={showBreedModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Select {species === "Canine" ? "Dog" : "Cat"} Breed
            </Text>
            <TextInput
              style={styles.modalSearch}
              placeholder="🔍 Search breed..."
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
            />
            <FlatList
              data={filteredBreeds}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setBreed(item);
                    setShowBreedModal(false);
                    setSearchText("");
                  }}
                >
                  <Text style={styles.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => {
                setShowBreedModal(false);
                setSearchText("");
              }}
            >
              <Text style={styles.closeText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
    paddingTop: Platform.OS === "ios" ? 20 : 40,
  },
  header: {
    fontSize: 28,
    fontWeight: "900",
    color: "#3E2723",
    textAlign: "center",
    marginBottom: 5,
  },
  subHeader: {
    fontSize: 14,
    color: "#757575",
    textAlign: "center",
    marginBottom: 25,
    paddingHorizontal: 10,
  },

  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#EEEEEE",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#8B4513",
    marginBottom: 15,
    textTransform: "uppercase",
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: "#5D4037",
    marginBottom: 6,
    marginTop: 5,
  },
  helperText: {
    fontSize: 12,
    color: "#888",
    fontStyle: "italic",
    marginBottom: 15,
    marginTop: -10,
  },

  input: {
    backgroundColor: "#F5F5F5",
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    fontSize: 16,
    color: "#333",
    marginBottom: 15,
  },
  selectBtn: {
    backgroundColor: "#F5F5F5",
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },

  row: { flexDirection: "row", justifyContent: "space-between" },
  toggleRow: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#8B4513",
  },
  toggleBtn: {
    flex: 1,
    padding: 12,
    alignItems: "center",
    backgroundColor: "#FFF",
  },
  activeBtn: { backgroundColor: "#8B4513" },
  toggleText: { color: "#8B4513", fontWeight: "bold", fontSize: 13 },
  activeText: { color: "white" },

  dateBtn: {
    backgroundColor: "#EFEBE9",
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D7CCC8",
    alignItems: "center",
  },
  dateText: { color: "#5D4037", fontWeight: "900", fontSize: 16 },

  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  switchLabel: { fontSize: 15, color: "#333", fontWeight: "700" },

  saveBtn: {
    backgroundColor: "#2E7D32",
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    elevation: 3,
    marginTop: 10,
  },
  saveText: { color: "white", fontWeight: "900", fontSize: 18 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    width: "90%",
    maxHeight: "80%",
    borderRadius: 20,
    padding: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#3E2723",
    marginBottom: 15,
    textAlign: "center",
  },
  modalSearch: {
    backgroundColor: "#F5F5F5",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 15,
    fontSize: 16,
  },
  modalItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalItemText: { fontSize: 16, color: "#333", fontWeight: "500" },
  closeBtn: {
    marginTop: 15,
    alignItems: "center",
    padding: 15,
    backgroundColor: "#FFEBEE",
    borderRadius: 10,
  },
  closeText: { color: "#D32F2F", fontWeight: "900", fontSize: 16 },
  noticeBox: {
    backgroundColor: "#E3F2FD",
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#1565C0",
  },
  noticeText: {
    color: "#1565C0",
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 20,
  },
  
  // --- ATOMIC ALLERGY STYLES ---
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  switchLabel: { fontSize: 14, fontWeight: "800", color: "#5D4037" },
  allergyContainer: {
    backgroundColor: "#F5F5F5",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    marginTop: 10,
    marginBottom: 20,
  },
  allergyContainerActive: {
    borderColor: "#D32F2F",
    backgroundColor: "#FFF8F8",
  },
  tagCloud: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  tag: {
    backgroundColor: "#D32F2F",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  tagText: {
    color: "white",
    fontSize: 11,
    fontWeight: "900",
    marginRight: 6,
  },
  tagClose: { color: "white", fontSize: 12, fontWeight: "900" },
  emptyTags: {
    fontSize: 12,
    color: "#D32F2F",
    fontStyle: "italic",
    fontWeight: "600",
  },
  inputRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  addBtn: {
    backgroundColor: "#D32F2F",
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  addBtnText: { color: "white", fontSize: 24, fontWeight: "900" },
});
