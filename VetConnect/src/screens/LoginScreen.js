import { MaterialIcons } from "@expo/vector-icons";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
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
import { useSafeAreaInsets } from "react-native-safe-area-context"; // THE FIX!
import { auth, db } from "../../firebaseConfig";

const LoginScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets(); // THE FIX: Gets hardware dimensions
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (email.trim() === "" || password === "") {
      Alert.alert("Required", "Please enter your email and password.");
      return;
    }

    setLoading(true);
    Keyboard.dismiss();

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );
      const uid = userCredential.user.uid;
      const userDoc = await getDoc(doc(db, "users", uid));

      if (userDoc.exists()) {
        const userData = userDoc.data();
        const staffRoles = ["admin", "staff", "veterinarian", "groomer"];
        if (staffRoles.includes(userData.role) || userData.accessLevel) {
          navigation.replace("StaffDashboard");
        } else {
          navigation.replace("ClientDashboard");
        }
      } else {
        await auth.signOut(); // Log them out if their DB profile is missing
        Alert.alert("Error", "User profile not found. Please contact support.");
      }
    } catch (error) {
      let msg = "Invalid email or password.";
      if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/user-not-found" ||
        error.code === "auth/wrong-password"
      ) {
        msg = "Invalid email or password.";
      }
      Alert.alert("Login Failed", msg);
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
            paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 20, // THE FIX!
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerBox}>
            <View style={styles.iconCircle}>
              <MaterialIcons name="pets" size={40} color="#8B4513" />
            </View>
            <Text style={styles.title}>VetConnect</Text>
            <Text style={styles.subtitle}>Starbarks Veterinary Clinic</Text>
          </View>

          <View style={styles.formBox}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              placeholder="juan@example.com"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                placeholder="Enter your password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
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
                style={{ marginVertical: 15 }}
              />
            ) : (
              <TouchableOpacity style={styles.button} onPress={handleLogin}>
                <Text style={styles.buttonText}>Login</Text>
              </TouchableOpacity>
            )}

            <View style={styles.registerContainer}>
              <Text style={styles.registerText}>New to Starbarks? </Text>
              <TouchableOpacity onPress={() => navigation.navigate("Register")}>
                <Text style={styles.registerLink}>Create Account</Text>
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
  title: { fontSize: 38, fontWeight: "900", color: "#3E2723", marginBottom: 5 },
  subtitle: { fontSize: 16, color: "#8B4513", fontWeight: "600" },

  // THE FIX: True Mobile Glassmorphism
  formBox: {
    backgroundColor: "rgba(255, 255, 255, 0.65)",
    padding: 25,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.9)",
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
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
    color: "#333",
    borderWidth: 1,
    borderColor: "rgba(139, 69, 19, 0.1)",
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
    marginBottom: 20,
  },
  buttonText: {
    color: "white",
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 1,
  },

  registerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  registerText: { color: "#757575", fontSize: 15, fontWeight: "500" },
  registerLink: { color: "#D32F2F", fontWeight: "bold", fontSize: 15 },
});

export default LoginScreen;
