import { MaterialIcons } from "@expo/vector-icons";
import { createUserWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../../firebaseConfig";

const RegisterScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- PH PHONE VALIDATION ENGINE ---
  const isValidPHPhone = (number) => {
    const phRegex = /^09\d{9}$/; // Exactly 11 digits starting with 09
    return phRegex.test(number.trim());
  };

  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || !password || !phone.trim()) {
      Alert.alert("Missing Info", "Please fill in all fields.");
      return;
    }

    // THE FIX: Strict Phone Validation to ensure Shadow Profile merges work!
    if (!isValidPHPhone(phone)) {
      Alert.alert(
        "Invalid Number",
        "Mobile number must be a valid Philippine number starting with 09 (e.g., 09123456789).",
      );
      return;
    }

    if (password.length < 6) {
      Alert.alert(
        "Weak Password",
        "Password must be at least 6 characters long.",
      );
      return;
    }

    setLoading(true);
    Keyboard.dismiss();

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );
      const uid = userCredential.user.uid;

      // ====================================================================
      // 🤖 THE THICK-CLIENT RECONCILIATION ENGINE
      // ====================================================================
      const guestQuery = query(
        collection(db, "users"),
        where("phone", "==", phone.trim()),
        where("accountStatus", "==", "unclaimed_guest"),
      );
      const guestSnap = await getDocs(guestQuery);

      if (!guestSnap.empty) {
        const guestDoc = guestSnap.docs[0];
        const guestId = guestDoc.id;
        const batch = writeBatch(db);

        const newUserRef = doc(db, "users", uid);
        batch.set(newUserRef, {
          uid: uid,
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          role: "pet_owner",
          accountStatus: "claimed",
          mergedFromGuest: true,
          createdAt: Timestamp.now(),
        });

        batch.delete(doc(db, "users", guestId));

        const petsSnap = await getDocs(
          query(collection(db, "pets"), where("ownerId", "==", guestId)),
        );
        petsSnap.forEach((p) => {
          batch.update(doc(db, "pets", p.id), { ownerId: uid });
        });

        const apptSnap = await getDocs(
          query(
            collection(db, "appointments"),
            where("ownerId", "==", guestId),
          ),
        );
        apptSnap.forEach((a) => {
          batch.update(doc(db, "appointments", a.id), { ownerId: uid });
        });

        await batch.commit();
        console.log("Account successfully merged from walk-in guest!");
      } else {
        // STANDARD REGISTRATION
        await setDoc(doc(db, "users", uid), {
          uid: uid,
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          role: "pet_owner",
          createdAt: Timestamp.now(),
        });
      }

      Alert.alert("Welcome!", "Your account has been created successfully.");
      navigation.replace("ClientDashboard");
    } catch (error) {
      let errorMessage = error.message;
      if (error.code === "auth/email-already-in-use")
        errorMessage = "This email is already registered. Please log in.";
      else if (error.code === "auth/invalid-email")
        errorMessage = "Please enter a valid email address.";
      Alert.alert("Registration Failed", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={{
            ...styles.scrollContent,
            paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 20,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerBox}>
            {/* THE FIX: Added Brand Identity Icon */}
            <View style={styles.iconCircle}>
              <MaterialIcons name="pets" size={40} color="#8B4513" />
            </View>
            <Text style={styles.header}>Create Account</Text>
            <Text style={styles.subHeader}>
              Join Starbarks Veterinary Clinic
            </Text>
          </View>

          {/* THE FIX: Upgraded to Glassmorphism UI */}
          <View style={styles.formBox}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Juan Dela Cruz"
              placeholderTextColor="#999"
              value={fullName}
              onChangeText={setFullName}
            />

            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="09xxxxxxxxx"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
              maxLength={11}
              value={phone}
              onChangeText={setPhone}
            />

            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="juan@example.com"
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Min. 6 characters"
                placeholderTextColor="#999"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
              >
                <MaterialIcons
                  name={showPassword ? "visibility" : "visibility-off"}
                  size={22}
                  color="#8B4513"
                />
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator
                size="large"
                color="#8B4513"
                style={{ marginVertical: 20 }}
              />
            ) : (
              <TouchableOpacity style={styles.button} onPress={handleRegister}>
                <Text style={styles.buttonText}>Sign Up</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{ marginTop: 15, padding: 10 }}
            >
              <Text style={styles.linkText}>
                Already have an account?{" "}
                <Text style={styles.linkBold}>Login</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF8E1" },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  headerBox: { alignItems: "center", marginBottom: 30 },
  iconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  header: {
    fontSize: 32,
    fontWeight: "900",
    color: "#3E2723",
    marginBottom: 5,
  },
  subHeader: {
    fontSize: 15,
    color: "#8B4513",
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  // THE FIX: True Mobile Glassmorphism
  formBox: {
    backgroundColor: "rgba(255, 255, 255, 0.65)", // Translucent White
    padding: 25,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.9)", // Frosted border
    elevation: 0,
  },

  label: {
    fontWeight: "900",
    color: "#5D4037",
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  input: {
    backgroundColor: "rgba(255, 255, 255, 0.85)", // Highly opaque inputs over translucent card
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
    color: "#333",
    borderWidth: 1,
    borderColor: "rgba(139, 69, 19, 0.1)", // Subtle brown tint
  },

  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    borderRadius: 14,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: "rgba(139, 69, 19, 0.1)",
  },
  passwordInput: { flex: 1, padding: 16, fontSize: 16, color: "#333" },
  eyeIcon: { padding: 15 },

  button: {
    backgroundColor: "#8B4513",
    padding: 18,
    borderRadius: 14,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#8B4513",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    marginBottom: 10,
    marginTop: 5,
  },
  buttonText: {
    color: "white",
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 1,
  },

  linkText: {
    color: "#757575",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "500",
  },
  linkBold: { color: "#D32F2F", fontWeight: "900" },
});

export default RegisterScreen;
