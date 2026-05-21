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
import { BREED_CATALOG } from '../constants/breedConstants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOW, FONTS } from '../theme/mobileTokens';

export default function AddPetScreen({ navigation }) {
  const insets = useSafeAreaInsets();
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


  // THE FIX: Cleaned up Age/DOB Logic
  const [dobMode, setDobMode] = useState("exact"); // 'exact' or 'approximate'
  const [dob, setDob] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [estYears, setEstYears] = useState("");
  const [estMonths, setEstMonths] = useState("");

  const [searchText, setSearchText] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);

  const filteredBreeds = (BREED_CATALOG[species] || []).filter((item) =>
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 20) + 40 }]}
          showsVerticalScrollIndicator={false}
        >


          {/* 1. BASIC INFO */}
          <View style={styles.shadowContainer}>
            <View style={SHADOW.card} />
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionAnchor} />
                <Text style={styles.sectionTitle}>1. BASIC INFO</Text>
              </View>

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
            <View style={{ position: 'relative', zIndex: 1000 }}>
              <TextInput
                style={[styles.input, { marginBottom: showSuggestions ? 0 : 15 }]}
                value={breed}
                onChangeText={(val) => {
                  setBreed(val);
                  setSearchText(val);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Start typing breed..."
                placeholderTextColor={COLORS.muted}
              />
              {showSuggestions && searchText.length > 0 && filteredBreeds.length > 0 && (
                <View style={styles.dropdownList}>
                  {filteredBreeds.slice(0, 5).map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setBreed(item);
                        setSearchText("");
                        setShowSuggestions(false);
                        Keyboard.dismiss();
                      }}
                    >
                      <Text style={styles.dropdownItemText}>{item.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

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
                style={[styles.input, styles.monospaceInput]}
                value={weight}
                onChangeText={setWeight}
                placeholder="e.g. 12.5"
                keyboardType="numeric"
                placeholderTextColor={COLORS.muted}
              />
            </View>
          </View>

          {/* 2. AGE / DOB SECTION */}
          <View style={styles.shadowContainer}>
            <View style={SHADOW.card} />
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionAnchor} />
                <Text style={styles.sectionTitle}>2. AGE & BIRTHDATE</Text>
              </View>


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
                      style={[styles.input, styles.monospaceInput]}
                      keyboardType="numeric"
                      placeholder="0"
                      value={estYears}
                      onChangeText={setEstYears}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 5 }}>
                    <Text style={styles.label}>Months</Text>
                    <TextInput
                      style={[styles.input, styles.monospaceInput]}
                      keyboardType="numeric"
                      placeholder="0"
                      value={estMonths}
                      onChangeText={setEstMonths}
                    />
                  </View>
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
          </View>

          {/* 3. MEDICAL */}
          <View style={styles.shadowContainer}>
            <View style={SHADOW.card} />
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionAnchor} />
                <Text style={styles.sectionTitle}>3. MEDICAL HISTORY</Text>
              </View>

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


            </View>
          </View>

          <View style={styles.shadowContainer}>
            <View style={SHADOW.button} />
            <TouchableOpacity
              style={[styles.saveBtn, loading && { backgroundColor: COLORS.muted }]}
              onPress={handleAddPet}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.saveText}>
                {loading ? "PROCESSING..." : "REGISTER PET"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>


    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
    paddingTop: Platform.OS === "ios" ? 20 : 40,
  },
  header: {
    fontSize: 32,
    fontWeight: "900",
    color: COLORS.brand,
    textAlign: "center",
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  subHeader: {
    fontSize: 14,
    color: COLORS.accentLight,
    textAlign: "center",
    marginBottom: 30,
    paddingHorizontal: 20,
    fontWeight: '700',
  },

  shadowContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  modalShadowContainer: {
    width: '100%',
    position: 'relative',
  },
  card: {
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.brand,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
    gap: 8,
  },
  sectionAnchor: {
    width: 8,
    height: 18,
    backgroundColor: COLORS.brand,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.brand,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: "900",
    color: COLORS.brand,
    marginBottom: 6,
    marginTop: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  helperText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: "italic",
    marginBottom: 15,
    marginTop: -10,
    lineHeight: 16,
  },

  input: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.brand,
    fontSize: 16,
    color: COLORS.textPrimary,
    marginBottom: 15,
  },
  monospaceInput: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: 'bold',
  },
  selectBtn: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.brand,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },

  row: { flexDirection: "row", justifyContent: "space-between" },
  toggleRow: {
    flexDirection: "row",
    borderRadius: 0,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: COLORS.brand,
  },
  toggleBtn: {
    flex: 1,
    padding: 12,
    alignItems: "center",
    backgroundColor: COLORS.white,
  },
  activeBtn: { backgroundColor: COLORS.brand },
  toggleText: { color: COLORS.brand, fontWeight: "900", fontSize: 13, textTransform: 'uppercase' },
  activeText: { color: COLORS.white },

  dateBtn: {
    backgroundColor: COLORS.white,
    padding: 15,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.brand,
    alignItems: "center",
  },
  dateText: { color: COLORS.brand, fontWeight: "900", fontSize: 16 },

  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  switchLabel: { fontSize: 14, color: COLORS.brand, fontWeight: "900", textTransform: 'uppercase' },

  saveBtn: {
    backgroundColor: COLORS.success,
    padding: 18,
    borderRadius: 0,
    borderWidth: 3,
    borderColor: COLORS.brand,
    alignItems: "center",
  },
  saveText: { color: COLORS.white, fontWeight: "900", fontSize: 20, letterSpacing: 2 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    maxHeight: "80%",
    borderRadius: 0,
    padding: 20,
    borderWidth: 3,
    borderColor: COLORS.brand,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.brand,
    marginBottom: 15,
    textAlign: "center",
    textTransform: 'uppercase',
  },
  modalSearch: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.brand,
    marginBottom: 15,
    fontSize: 16,
  },
  modalItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modalItemText: { fontSize: 16, color: COLORS.brand, fontWeight: "bold" },
  closeBtn: {
    marginTop: 15,
    alignItems: "center",
    padding: 15,
    backgroundColor: COLORS.dangerBg,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.danger,
  },
  closeText: { color: COLORS.danger, fontWeight: "900", fontSize: 16 },
  dropdownList: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderTopWidth: 0,
    marginTop: 0,
    marginBottom: 15,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  dropdownItemText: {
    fontSize: 12,
    color: COLORS.brand,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  noticeBox: {
    backgroundColor: COLORS.infoBg,
    padding: 15,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.info,
    borderLeftWidth: 8,
  },
  noticeText: {
    color: COLORS.info,
    fontWeight: "900",
    fontSize: 12,
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  
  allergyContainer: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    marginTop: 10,
    marginBottom: 20,
  },
  allergyContainerActive: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.dangerBg,
  },
  tagCloud: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  tag: {
    backgroundColor: COLORS.danger,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.brand,
  },
  tagText: {
    color: "white",
    fontSize: 11,
    fontWeight: "900",
    marginRight: 6,
  },
  tagClose: { color: "white", fontSize: 12, fontWeight: "900" },
  emptyTags: {
    fontSize: 11,
    color: COLORS.danger,
    fontStyle: "italic",
    fontWeight: "900",
    textTransform: 'uppercase',
  },
  inputRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  addBtn: {
    backgroundColor: COLORS.danger,
    width: 44,
    height: 44,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.brand,
    justifyContent: "center",
    alignItems: "center",
  },
  addBtnText: { color: "white", fontSize: 28, fontWeight: "900" },
});
