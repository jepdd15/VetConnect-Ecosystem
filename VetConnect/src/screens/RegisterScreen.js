import { MaterialIcons } from "@expo/vector-icons";
import { createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
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
  Pressable,
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
import { isValidPHPhone } from "../utils/phoneValidation";

const RegisterScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

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
      try {
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

          const guestData = guestDoc.data();
          const newUserRef = doc(db, "users", uid);
          batch.set(newUserRef, {
            ...guestData,
            uid: uid,
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            role: "pet_owner",
            accountStatus: "claimed",
            profileComplete: false,
            mergedFromGuest: true,
            createdAt: guestData.createdAt || Timestamp.now(),
          });

          batch.delete(doc(db, "users", guestId));

          const petsSnap = await getDocs(
            query(collection(db, "pets"), where("ownerId", "==", guestId)),
          );
          petsSnap.forEach((p) => {
            batch.update(doc(db, "pets", p.id), { ownerId: uid });
          });

          // T2.419: Migrate medical_records so ownerId-based queries
          // (e.g. ClientDashboard health reminders) work after merge.
          const medRecSnap = await getDocs(
            query(
              collection(db, "medical_records"),
              where("ownerId", "==", guestId),
            ),
          );
          medRecSnap.forEach((r) => {
            batch.update(doc(db, "medical_records", r.id), { ownerId: uid });
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
            accountStatus: "active",
            profileComplete: false,
            createdAt: Timestamp.now(),
          });
        }
      } catch (firestoreError) {
        // Auth account exists but Firestore profile failed — roll back Auth
        // to prevent the user from being permanently stuck.
        console.error("Firestore write failed, rolling back Auth account:", firestoreError);
        try {
          await deleteUser(userCredential.user);
        } catch (deleteError) {
          // If rollback also fails, log it. The user will see the registration
          // failure alert and can contact support. This is a rare double-fault.
          console.error("Auth rollback also failed:", deleteError);
        }
        throw firestoreError;
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
            paddingBottom: insets.bottom > 0 ? insets.bottom + 60 : 70,
          }}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <MaterialIcons name="arrow-back" size={24} color="#3E2723" />
          </TouchableOpacity>

          <View style={styles.headerBox}>
            <Text style={styles.header}>CREATE ACCOUNT</Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.formShadow} />
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
                  color="#3ABEF9"
                />
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator
                size="large"
                color="#3ABEF9"
                style={{ marginVertical: 20 }}
              />
            ) : (
              <View style={styles.buttonContainer}>
                <View style={styles.buttonShadow} />
                <Pressable
                  onPress={handleRegister}
                  style={({ pressed }) => [
                    styles.button,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.buttonText}>SIGN UP</Text>
                </Pressable>
              </View>
            )}

            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{ marginTop: 15, padding: 10 }}
            >
              <Text style={styles.linkText}>
                ALREADY HAVE AN ACCOUNT?{" "}
                <Text style={styles.linkBold}>LOGIN</Text>
              </Text>
            </TouchableOpacity>
            </View>
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
    paddingHorizontal: 20,
    paddingTop: 80,
  },

  backButton: {
    position: "absolute",
    top: 20,
    left: 20,
    width: 45,
    height: 45,
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#3E2723",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },

  headerBox: { alignItems: "flex-start", marginBottom: 20 },
  header: {
    fontFamily: "Inter_900Black",
    fontSize: 48,
    color: "#3E2723",
    textTransform: "uppercase",
    letterSpacing: -1,
    lineHeight: 48,
  },
  subHeader: {
    fontSize: 14,
    color: "#5D4037",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  formContainer: { position: "relative", marginBottom: 20 },
  formShadow: {
    position: "absolute",
    top: 8,
    left: 8,
    right: -8,
    bottom: -8,
    backgroundColor: "#5D4037",
  },
  formBox: {
    backgroundColor: "white",
    padding: 25,
    borderRadius: 0,
    borderWidth: 3,
    borderColor: "#3E2723",
  },

  label: {
    fontWeight: "900",
    color: "#3E2723",
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  input: {
    fontFamily: "Inter_400Regular",
    backgroundColor: "white",
    borderRadius: 0,
    padding: 16,
    fontSize: 16,
    marginBottom: 15,
    color: "#333",
    borderWidth: 2,
    borderColor: "#3E2723",
  },

  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 0,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: "#3E2723",
  },
  passwordInput: { flex: 1, padding: 16, fontSize: 16, color: "#333" },
  eyeIcon: { padding: 15 },

  buttonContainer: { position: "relative", marginBottom: 10, marginTop: 5 },
  buttonShadow: {
    position: "absolute",
    top: 6,
    left: 6,
    right: 0,
    bottom: 0,
    backgroundColor: "#3E2723",
  },
  button: {
    backgroundColor: "#3ABEF9",
    padding: 18,
    borderRadius: 0,
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#3E2723",
  },
  buttonPressed: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  buttonText: {
    color: "#3E2723",
    fontWeight: "900",
    fontSize: 20,
    letterSpacing: 2,
    textTransform: "uppercase",
  },

  linkText: {
    color: "#3E2723",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  linkBold: {
    fontFamily: "Inter_900Black",
    color: "#3ABEF9",
    textDecorationLine: "underline",
  },
});

export default RegisterScreen;
