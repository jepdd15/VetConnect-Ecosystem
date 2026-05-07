// The mobile CRM.
// Allows clients to maintain their own pet's biological data. Features a "Deletion Shield" that
// prevents a user from deleting a pet if medical records are attached to it.

import DateTimePicker from "@react-native-community/datetimepicker";
import { doc, Timestamp, updateDoc } from "firebase/firestore";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../firebaseConfig";
import { BREED_CATALOG } from '../constants/breedConstants';

const EditPetScreen = ({ route, navigation }) => {
  // Get the passed pet data
  const { pet } = route.params;

  const [name, setName] = useState(pet.name || "");
  const [species, setSpecies] = useState(pet.species || "Canine");
  const [breed, setBreed] = useState(pet.breed || "");
  const [color, setColor] = useState(pet.color || "");
  const [gender, setGender] = useState(pet.gender === "UNK" ? "Unknown" : (pet.gender || "Unknown"));
  const [isNeutered, setIsNeutered] = useState(pet.isNeutered || false);
  const [weight, setWeight] = useState(pet.weight ? String(pet.weight) : "");
  const initialAllergies = pet.petAllergies || pet.allergies || "";
  const [showAllergyToggle, setShowAllergyToggle] = useState(initialAllergies && initialAllergies !== "None" && initialAllergies !== "");
  const [allergyArray, setAllergyArray] = useState(initialAllergies && initialAllergies !== "None" && initialAllergies !== "" ? initialAllergies.split(", ") : []);
  const [currentAllergy, setCurrentAllergy] = useState("");
  const [microchip, setMicrochip] = useState(pet.microchip || "");

  // Date Logic
  const [dob, setDob] = useState(
    pet.dob && typeof pet.dob.toDate === "function"
      ? pet.dob.toDate()
      : new Date(),
  );
  const [showPicker, setShowPicker] = useState(false);
  const [isAgeTotallyUnknown, setIsAgeTotallyUnknown] = useState(
    pet.isAgeUnknown || false,
  );

  const [showBreedModal, setShowBreedModal] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);

  const filteredBreeds =
    (BREED_CATALOG[species] || []).filter((item) =>
      item.toLowerCase().includes(searchText.toLowerCase()),
    );

  const handleSpeciesChange = (newSpecies) => {
    setSpecies(newSpecies);
    setBreed("");
    setSearchText("");
  };

  const handleUpdatePet = async () => {
    if (!name || !breed || !color) {
      Alert.alert("Missing Info", "Please fill in Name, Breed, and Color.");
      return;
    }

    setLoading(true);
    try {
      const petRef = doc(db, "pets", pet.id);

      await updateDoc(petRef, {
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
        allergies: showAllergyToggle && allergyArray.length > 0 ? allergyArray.join(", ") : "None",
        dob: isAgeTotallyUnknown ? null : Timestamp.fromDate(dob),
        isAgeExact: !isAgeTotallyUnknown, // Forensic Parity!
        updatedAt: Timestamp.now(), // Track when it was edited
      });

      Alert.alert("Success", `${name}'s profile has been updated!`);
      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Edit Profile: {pet.name} 🐾</Text>

      {/* 1. BASIC INFO */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Basic Demographics</Text>

        <Text style={styles.label}>Pet Name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />

        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 5 }}>
            <Text style={styles.label}>Species</Text>
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
          </View>
          <View style={{ flex: 1, marginLeft: 5 }}>
            <Text style={styles.label}>Gender</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  gender === "Male" && styles.activeBtn,
                ]}
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
          </View>
        </View>

        <Text style={styles.label}>Breed *</Text>
        <TouchableOpacity
          style={styles.selectBtn}
          onPress={() => setShowBreedModal(true)}
        >
          <Text style={{ color: breed ? "black" : "#aaa", fontSize: 16 }}>
            {breed || `Select ${species} Breed`}
          </Text>
          <Text style={{ color: "#8B4513" }}>▼</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Color / Markings *</Text>
        <TextInput style={styles.input} value={color} onChangeText={setColor} />

        <Text style={styles.label}>Current Weight (kg)</Text>
        <TextInput
          style={styles.input}
          value={weight}
          onChangeText={setWeight}
          placeholder="e.g. 12.5"
          keyboardType="numeric"
        />
      </View>

      {/* 2. MEDICAL DETAILS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Medical Details</Text>

        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setIsAgeTotallyUnknown(!isAgeTotallyUnknown)}
        >
          <View
            style={[
              styles.checkbox,
              isAgeTotallyUnknown && styles.checkboxChecked,
            ]}
          >
            {isAgeTotallyUnknown && (
              <Text style={{ color: "white", fontWeight: "bold" }}>✓</Text>
            )}
          </View>
          <Text style={styles.checkboxLabel}>I don&apos;t know the exact age</Text>
        </TouchableOpacity>

        {!isAgeTotallyUnknown && (
          <TouchableOpacity
            style={styles.dateBtn}
            onPress={() => {
              setShowPicker(true);
              Platform.OS === "ios" && setShowPicker(true);
            }}
          >
            <Text style={styles.dateText}>🎂 {dob.toDateString()}</Text>
          </TouchableOpacity>
        )}

        {showPicker && (
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

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>
            Is {name || "Pet"} Spayed/Neutered?
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
          keyboardType="numeric"
        />
      </View>

      <TouchableOpacity
        style={styles.saveBtn}
        onPress={handleUpdatePet}
        disabled={loading}
      >
        <Text style={styles.saveText}>
          {loading ? "Updating..." : "Save Changes"}
        </Text>
      </TouchableOpacity>

      {/* MODAL */}
      <Modal visible={showBreedModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select {species} Breed</Text>
            <TextInput
              style={styles.searchInput}
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
              <Text style={styles.closeText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

// Same styles as AddPetScreen
const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: "#FFF8E1" },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#5D4037",
    marginBottom: 20,
    textAlign: "center",
  },
  section: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#8B4513",
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 5,
  },
  label: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#5D4037",
    marginBottom: 5,
    marginTop: 10,
  },
  input: {
    backgroundColor: "#FAFAFA",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    fontSize: 16,
  },
  selectBtn: {
    backgroundColor: "#FAFAFA",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  toggleRow: {
    flexDirection: "row",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#8B4513",
  },
  toggleBtn: {
    flex: 1,
    padding: 10,
    alignItems: "center",
    backgroundColor: "#FFF",
  },
  activeBtn: { backgroundColor: "#8B4513" },
  toggleText: { color: "#8B4513", fontWeight: "bold" },
  activeText: { color: "white" },
  dateBtn: {
    backgroundColor: "#EFEBE9",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D7CCC8",
    alignItems: "center",
    marginTop: 5,
  },
  dateText: { color: "#5D4037", fontWeight: "bold", fontSize: 16 },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 15,
    marginBottom: 5,
  },
  switchLabel: { fontSize: 16, color: "#5D4037", fontWeight: "600" },
  checkboxRow: { flexDirection: "row", alignItems: "center", marginBottom: 15 },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: "#8B4513",
    borderRadius: 4,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: "#8B4513" },
  checkboxLabel: { fontSize: 16, color: "#5D4037", fontStyle: "italic" },
  saveBtn: {
    backgroundColor: "#2E7D32",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 30,
  },
  saveText: { color: "white", fontWeight: "bold", fontSize: 18 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    width: "90%",
    height: "80%",
    borderRadius: 15,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#5D4037",
    marginBottom: 15,
    textAlign: "center",
  },
  searchInput: {
    backgroundColor: "#F5F5F5",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 10,
    fontSize: 16,
  },
  modalItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalItemText: { fontSize: 16, color: "#333" },
  closeBtn: {
    marginTop: 15,
    alignItems: "center",
    padding: 10,
    backgroundColor: "#EFEBE9",
    borderRadius: 8,
  },
  closeText: { color: "#D32F2F", fontWeight: "bold" },
  
  // --- ATOMIC ALLERGY STYLES ---
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

export default EditPetScreen;
