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
  Pressable,
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
            paddingBottom: insets.bottom > 0 ? insets.bottom + 60 : 70,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerBox}>
            <Text style={styles.title}>VetConnect</Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.formShadow} />
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
                  color="#3ABEF9"
                />
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator
                size="large"
                color="#3ABEF9"
                style={{ marginVertical: 15 }}
              />
            ) : (
              <View style={styles.buttonContainer}>
                <View style={styles.buttonShadow} />
                <Pressable
                  onPress={handleLogin}
                  style={({ pressed }) => [
                    styles.button,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.buttonText}>LOGIN</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.registerContainer}>
              <Text style={styles.registerText}>New to Starbarks? </Text>
              <TouchableOpacity onPress={() => navigation.navigate("Register")}>
                <Text style={styles.registerLink}>CREATE ACCOUNT</Text>
              </TouchableOpacity>
            </View>
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
  headerBox: { alignItems: "flex-start", marginBottom: 20 },
  neoIconContainer: {
    width: 70,
    height: 70,
    position: "relative",
  },
  iconShadow: {
    position: "absolute",
    width: 70,
    height: 70,
    backgroundColor: "#5D4037",
    top: 6,
    left: 6,
  },
  iconSquare: {
    width: 70,
    height: 70,
    borderRadius: 0,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#3E2723",
  },
  title: {
    fontFamily: "Inter_900Black",
    fontSize: 48,
    color: "#3E2723",
    textTransform: "uppercase",
    letterSpacing: -1,
    lineHeight: 48,
  },
  subtitle: {
    fontSize: 15,
    color: "#5D4037",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  label: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: "#3E2723",
    marginBottom: 8,
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

  buttonContainer: { position: "relative", marginBottom: 20 },
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

  registerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 5,
  },
  registerText: { fontFamily: "Inter_700Bold", color: "#3E2723", fontSize: 14 },
  registerLink: {
    fontFamily: "Inter_900Black",
    color: "#3ABEF9",
    fontSize: 14,
    textTransform: "uppercase",
    textDecorationLine: "underline",
  },
});

export default LoginScreen;
