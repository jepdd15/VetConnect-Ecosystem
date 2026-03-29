// The React Navigation stack. Determines if the user sees the Authentication flow or the Main App flow based on their Firebase Auth state.

import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";

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
import ManageQueueScreen from "./src/screens/ManageQueueScreen";
import ScannerScreen from "./src/screens/ScannerScreen";
import StaffAppointments from "./src/screens/StaffAppointments";

import ChatbotScreen from "./src/screens/ChatbotScreen";

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: "#FFF8E1" }, // Beige header for everyone
          headerTintColor: "#5D4037", // Brown text
          headerTitleStyle: { fontWeight: "bold" },
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
          options={{ title: "Sign Up" }}
        />

        {/* --- DASHBOARDS --- */}
        <Stack.Screen
          name="ClientDashboard"
          component={ClientDashboard}
          options={{
            title: "Dashboard",
            headerLeft: null, // Prevents back button to login
          }}
        />

        <Stack.Screen
          name="StaffDashboard"
          component={StaffDashboard}
          options={{
            title: "Staff Portal",
            headerLeft: null,
            headerStyle: { backgroundColor: "#EFEBE9" },
            headerTintColor: "#3E2723",
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
          options={{ title: "Medical Records" }}
        />

        {/* --- STAFF FEATURES --- */}
        <Stack.Screen
          name="StaffAppointments"
          component={StaffAppointments}
          options={{
            title: "Incoming Requests",
            headerStyle: { backgroundColor: "#EFEBE9" },
          }}
        />

        <Stack.Screen
          name="ManageQueue"
          component={ManageQueueScreen}
          options={{
            title: "Queue Controller",
            headerStyle: { backgroundColor: "#EFEBE9" },
          }}
        />

        <Stack.Screen
          name="Consultation"
          component={ConsultationScreen}
          options={{
            title: "Medical Consultation",
            headerStyle: { backgroundColor: "#EFEBE9" },
          }}
        />

        <Stack.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{
            title: "QR Check-In",
            headerStyle: { backgroundColor: "#EFEBE9" },
          }}
        />

        <Stack.Screen
          name="Chatbot"
          component={ChatbotScreen}
          options={{ title: "Support" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
