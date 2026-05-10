// A lightweight version of the Clinical Workspace. Allows a doctor standing in the exam room to
// quickly input Vitals (Weight, Temp, HR) or brief Subjective/Objective notes directly into their
// tablet or phone before returning to their desktop to finish the formal billing.

import DateTimePicker from "@react-native-community/datetimepicker";
import { addDoc, collection, doc, getDoc, Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";

// --- ASSISTIVE CLINICAL SUPPORT DICTIONARY (Thesis Requirement) ---
const CLINICAL_KNOWLEDGE_BASE = [
  {
    keywords: ["vomit", "diarrhea", "lethargic", "blood"],
    suggestion:
      "Possible Canine Parvovirus (CPV). Recommended: CPV Antigen Test, CBC.",
  },
  {
    keywords: ["scratching", "hair loss", "redness", "flea"],
    suggestion:
      "Possible Dermatitis / Mange / Flea Allergy. Recommended: Skin Scraping.",
  },
  {
    keywords: ["cough", "sneezing", "nasal discharge"],
    suggestion:
      "Possible Kennel Cough or Respiratory Infection. Recommended: Isolate patient.",
  },
  {
    keywords: ["not eating", "pale gums", "tick"],
    suggestion:
      "Possible Tick-Borne Disease (Ehrlichia/Babesia). Recommended: 4Dx Snap Test, CBC.",
  },
];

const ConsultationScreen = ({ route, navigation }) => {
  const { appointmentId, petId, petName, ownerId } = route.params || {};

  // --- SOAP STATES ---
  const [subjective, setSubjective] = useState(""); // Owner's complaint
  const [objective, setObjective] = useState(""); // Vet's exam
  const [weight, setWeight] = useState("");
  const [temp, setTemp] = useState("");
  const [assessment, setAssessment] = useState(""); // Diagnosis
  const [plan, setPlan] = useState(""); // Treatment

  const [loading, setLoading] = useState(false);
  const [nextVisit, setNextVisit] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [assistiveText, setAssistiveText] = useState("");

  // 1. Auto-Load the Client's Digital Triage Notes
  useEffect(() => {
    const fetchAppointmentDetails = async () => {
      try {
        const apptDoc = await getDoc(doc(db, "appointments", appointmentId));
        if (apptDoc.exists() && apptDoc.data().notes) {
          // Put the client's booking notes directly into the "Subjective" field
          setSubjective(
            `Client reported during booking: "${apptDoc.data().notes}"\n\n`,
          );
        }
      } catch (error) {
        console.log(error);
      }
    };
    fetchAppointmentDetails();
  }, [appointmentId]);

  // 2. ASSISTIVE CLINICAL SUPPORT LOGIC
  const runAssistiveDiagnosis = () => {
    const combinedNotes = (subjective + " " + objective).toLowerCase();
    let suggestions = [];

    CLINICAL_KNOWLEDGE_BASE.forEach((condition) => {
      // Check if any keyword matches the notes
      const hasMatch = condition.keywords.some((keyword) =>
        combinedNotes.includes(keyword),
      );
      if (hasMatch) {
        suggestions.push(condition.suggestion);
      }
    });

    if (suggestions.length > 0) {
      setAssistiveText(suggestions.join("\n\n"));
    } else {
      setAssistiveText(
        "No specific rule-based suggestions found. Proceed with standard diagnostics.",
      );
    }
  };

  const addMonths = (months) => {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    setNextVisit(d);
  };

  const handleSave = async () => {
    if (!assessment || !plan) {
      Alert.alert(
        "Missing Info",
        "Assessment (Diagnosis) and Plan (Treatment) are required.",
      );
      return;
    }

    setLoading(true);
    try {
      // 1. Create SOAP Medical Record
      await addDoc(collection(db, "medical_records"), {
        appointmentId,
        petId,
        petName,
        ownerId,
        vetId: auth.currentUser.uid,
        date: Timestamp.now(),

        // SOAP DATA
        soap: {
          subjective,
          objective,
          assessment,
          plan,
        },
        // Fallbacks for older history screens
        diagnosis: assessment,
        treatment: plan,
        notes: `Subjective: ${subjective}\nObjective: ${objective}`,

        vitals: { weight, temp },
        nextVisit: nextVisit ? Timestamp.fromDate(nextVisit) : null,
        status: "active",
      });

      Alert.alert("Success", "SOAP Record Saved!");
      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>SOAP Record: {petName}</Text>

      {/* --- S: SUBJECTIVE --- */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>S - Subjective (History)</Text>
        <Text style={styles.helperText}>
          What the owner reports / Chief Complaint.
        </Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="e.g. Vomiting since yesterday..."
          multiline
          value={subjective}
          onChangeText={setSubjective}
        />
      </View>

      {/* --- O: OBJECTIVE --- */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>O - Objective (Exam & Vitals)</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1, marginRight: 5 }]}
            placeholder="Weight (kg)"
            keyboardType="numeric"
            value={weight}
            onChangeText={setWeight}
          />
          <TextInput
            style={[styles.input, { flex: 1, marginLeft: 5 }]}
            placeholder="Temp (°C)"
            keyboardType="numeric"
            value={temp}
            onChangeText={setTemp}
          />
        </View>
        <TextInput
          style={[styles.input, styles.textArea, { marginTop: 5 }]}
          placeholder="Physical exam findings (e.g. Pale gums, dehydration 5%)"
          multiline
          value={objective}
          onChangeText={setObjective}
        />
      </View>

      {/* --- ASSISTIVE AI BUTTON --- */}
      <TouchableOpacity
        style={styles.assistiveBtn}
        onPress={runAssistiveDiagnosis}
      >
        <Text style={styles.assistiveBtnText}>
          🧠 Run Clinical Support Check
        </Text>
      </TouchableOpacity>

      {assistiveText !== "" && (
        <View style={styles.assistiveBox}>
          <Text style={styles.assistiveTitle}>System Suggestion:</Text>
          <Text style={styles.assistiveBody}>{assistiveText}</Text>
          <Text style={styles.assistiveDisclaimer}>
            *This is a support tool, not a definitive diagnosis.
          </Text>
        </View>
      )}

      {/* --- A: ASSESSMENT --- */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>A - Assessment (Diagnosis)</Text>
        <TextInput
          style={styles.input}
          placeholder="Definitive or differential diagnosis..."
          value={assessment}
          onChangeText={setAssessment}
        />
      </View>

      {/* --- P: PLAN --- */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>P - Plan (Treatment & Meds)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Medications, surgeries, instructions to owner..."
          multiline
          value={plan}
          onChangeText={setPlan}
        />
      </View>

      {/* --- FOLLOW UP --- */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📅 Follow Up</Text>
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => addMonths(1)}
          >
            <Text style={styles.quickText}>1 Month</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => addMonths(6)}
          >
            <Text style={styles.quickText}>6 Months</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => addMonths(12)}
          >
            <Text style={styles.quickText}>1 Year</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.dateBtn}
          onPress={() => setShowPicker(true)}
        >
          <Text style={styles.dateText}>
            {nextVisit
              ? `Next Visit: ${nextVisit.toDateString()}`
              : "Select Date (Optional)"}
          </Text>
        </TouchableOpacity>
        {showPicker && (
          <DateTimePicker
            value={nextVisit || new Date()}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowPicker(Platform.OS === "ios");
              if (selectedDate) setNextVisit(selectedDate);
            }}
            minimumDate={new Date()}
          />
        )}
      </View>

      <TouchableOpacity
        style={styles.saveBtn}
        onPress={handleSave}
        disabled={loading}
      >
        <Text style={styles.saveText}>
          {loading ? "Saving..." : "Lock & Save SOAP Record"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 15, backgroundColor: "#EFEBE9", flexGrow: 1 },
  header: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#3E2723",
    marginBottom: 15,
    textAlign: "center",
  },

  card: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#D7CCC8",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#8B4513",
    marginBottom: 5,
  },
  helperText: {
    fontSize: 12,
    color: "#888",
    marginBottom: 10,
    fontStyle: "italic",
  },

  input: {
    backgroundColor: "#FAFAFA",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  textArea: { height: 80, textAlignVertical: "top" },
  row: { flexDirection: "row", justifyContent: "space-between" },

  // Assistive Feature Styles
  assistiveBtn: {
    backgroundColor: "#1565C0",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 15,
  },
  assistiveBtnText: { color: "white", fontWeight: "bold" },
  assistiveBox: {
    backgroundColor: "#E3F2FD",
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#90CAF9",
    marginBottom: 15,
  },
  assistiveTitle: { fontWeight: "bold", color: "#1565C0", marginBottom: 5 },
  assistiveBody: { color: "#333", fontSize: 14 },
  assistiveDisclaimer: {
    color: "#888",
    fontSize: 10,
    fontStyle: "italic",
    marginTop: 10,
  },

  quickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  quickBtn: {
    backgroundColor: "#EFEBE9",
    padding: 10,
    borderRadius: 5,
    width: "30%",
    alignItems: "center",
  },
  quickText: { color: "#5D4037", fontWeight: "bold", fontSize: 12 },
  dateBtn: {
    backgroundColor: "#EFEBE9",
    borderWidth: 1,
    borderColor: "#8B4513",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  dateText: { color: "#8B4513", fontWeight: "bold" },

  saveBtn: {
    backgroundColor: "#2E7D32",
    padding: 18,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 5,
    marginBottom: 40,
  },
  saveText: { color: "white", fontWeight: "bold", fontSize: 18 },
});

export default ConsultationScreen;
