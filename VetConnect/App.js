// The React Navigation stack. Determines if the user sees the Authentication flow or the Main App flow based on their Firebase Auth state.

import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import * as SplashScreen from "expo-splash-screen";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { auth, db } from "./firebaseConfig";
import { NetworkProvider } from "./src/context/NetworkContext";
import {
  useFonts,
  Inter_400Regular,
  Inter_700Bold,
  Inter_900Black,
} from "@expo-google-fonts/inter";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// --- 1. AUTHENTICATION SCREENS ---
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";

// --- 2. DASHBOARDS ---
import ClientDashboard from "./src/screens/ClientDashboard";
import StaffDashboard from "./src/screens/StaffDashboard";

// --- 3. CLIENT FEATURES ---
import AddPetScreen from "./src/screens/AddPetScreen";
import BookAppointment from "./src/screens/BookAppointment";
import ClientAppointments from "./src/screens/ClientAppointments";
import EditPetScreen from "./src/screens/EditPetScreen"; // NEW IMPORT
import MyPetsScreen from "./src/screens/MyPetsScreen";
import PetHistoryScreen from "./src/screens/PetHistoryScreen";
import QueueScreen from "./src/screens/QueueScreen";
import UserProfileScreen from "./src/screens/UserProfileScreen";

// --- 4. STAFF FEATURES ---
import ConsultationScreen from "./src/screens/ConsultationScreen";
import ScannerScreen from "./src/screens/ScannerScreen";
import StaffAppointments from "./src/screens/StaffAppointments";

import SelfCheckInScreen from "./src/screens/SelfCheckInScreen";
import ChatbotScreen from "./src/screens/ChatbotScreen";
import NotificationHistory from "./src/screens/NotificationHistory";

// --- 5. CONSENT ---
import ConsentScreen from "./src/screens/ConsentScreen";

const Stack = createStackNavigator();

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_700Bold,
    Inter_900Black,
  });

  const [authResolved, setAuthResolved] = useState(false);
  const [initialRoute, setInitialRoute] = useState("Login");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userSnap = await getDoc(doc(db, "users", user.uid));
          if (userSnap.exists()) {
            const data = userSnap.data();
            if (data.disabled === true) {
              await auth.signOut();
              setInitialRoute("Login");
            } else {
              const staffRoles = ["admin", "staff", "veterinarian", "groomer"];
              if (staffRoles.includes(data.role) || staffRoles.includes(data.accessLevel)) {
                setInitialRoute("StaffDashboard");
              } else {
                setInitialRoute("ClientDashboard");
              }
            }
          } else {
            // User doc doesn't exist yet — this happens during registration
            // when onAuthStateChanged fires before the registration flow
            // finishes writing the user doc. Route to ClientDashboard and let
            // the registration complete rather than signing out mid-flow.
            setInitialRoute("ClientDashboard");
          }
        } catch {
          // Offline + no cached user doc: route to dashboard since auth token is valid
          setInitialRoute("ClientDashboard");
        }
      } else {
        setInitialRoute("Login");
      }
      setAuthResolved(true);
    });

    return () => unsubscribe();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded || !authResolved) {
    return null; // SplashScreen.preventAutoHideAsync() keeps native splash visible
  }

  return (
    <NetworkProvider>
    <NavigationContainer onReady={onLayoutRootView} onUnhandledAction={() => {}}>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerStyle: { backgroundColor: "#3E2723", borderBottomWidth: 0, elevation: 0, shadowOpacity: 0 }, // Coffee Brown Header
          headerTintColor: "#FAF9F7", // Cream text
          headerTitleStyle: { fontFamily: 'Inter_900Black', letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 16 },
        }}
      >
        {/* --- AUTHENTICATION GROUP --- */}
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{ headerShown: false }}
        />

        {/* --- DASHBOARDS --- */}
        <Stack.Screen
          name="ClientDashboard"
          component={ClientDashboard}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="StaffDashboard"
          component={StaffDashboard}
          options={{
            title: "Staff Portal",
            headerLeft: null,
            headerStyle: { backgroundColor: "#3E2723" },
            headerTintColor: "#FAF9F7",
          }}
        />

        {/* --- CLIENT FEATURES --- */}
        <Stack.Screen
          name="UserProfile"
          component={UserProfileScreen}
          options={{ title: "My Profile" }}
        />

        <Stack.Screen
          name="QueueScreen"
          component={QueueScreen}
          options={{ title: "Live Queue" }}
        />

        <Stack.Screen
          name="BookAppointment"
          component={BookAppointment}
          options={{ title: "Schedule Visit" }}
        />

        <Stack.Screen
          name="MyPets"
          component={MyPetsScreen}
          options={{ title: "My Pets" }}
        />

        <Stack.Screen
          name="AddPet"
          component={AddPetScreen}
          options={{ title: "New Pet Profile" }}
        />

        {/* NEW: Edit Pet Profile Screen */}
        <Stack.Screen
          name="EditPet"
          component={EditPetScreen}
          options={{ title: "Edit Pet Profile" }}
        />

        <Stack.Screen
          name="ClientAppointments"
          component={ClientAppointments}
          options={{ title: "My Bookings" }}
        />

        <Stack.Screen
          name="PetHistory"
          component={PetHistoryScreen}
          options={{ headerShown: false }}
        />

        {/* --- STAFF FEATURES --- */}
        <Stack.Screen
          name="StaffAppointments"
          component={StaffAppointments}
          options={{
            title: "Incoming Requests",
            headerStyle: { backgroundColor: "#3E2723" },
            headerTintColor: "#FAF9F7",
          }}
        />

        <Stack.Screen
          name="Consultation"
          component={ConsultationScreen}
          options={{
            title: "Medical Consultation",
            headerStyle: { backgroundColor: "#3E2723" },
            headerTintColor: "#FAF9F7",
          }}
        />

        <Stack.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{
            title: "QR Check-In",
            headerStyle: { backgroundColor: "#3E2723" },
            headerTintColor: "#FAF9F7",
          }}
        />

        <Stack.Screen
          name="SelfCheckIn"
          component={SelfCheckInScreen}
          options={{ title: "Scan to Check In" }}
        />

        <Stack.Screen
          name="Chatbot"
          component={ChatbotScreen}
          options={{ title: "Support" }}
        />

        <Stack.Screen
          name="NotificationHistory"
          component={NotificationHistory}
          options={{ title: "Notifications" }}
        />

        {/* --- CONSENT --- */}
        <Stack.Screen
          name="Consent"
          component={ConsentScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
    </NetworkProvider>
  );
}
