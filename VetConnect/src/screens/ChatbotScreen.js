// The Rule-Based Virtual Assistant.
// Queries the clinic_settings database to calculate if the clinic is currently Open or Closed.
// Provides instant answers for prices, booking methods, and emergency protocols, drastically reducing front-desk phone calls.

import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../firebaseConfig";

export default function ChatbotScreen({ navigation }) {
  const scrollViewRef = useRef();
  const [messages, setMessages] = useState([]);
  const [servicesList, setServicesList] = useState([]);
  const [clinicSettings, setClinicSettings] = useState({
    openHour: 8,
    closeHour: 17,
  });
  const [isTyping, setIsTyping] = useState(false);

  const CLINIC_PHONE = "09123456789";
  const CLINIC_MAPS_URL =
    "https://maps.google.com/?q=Starbarks+Veterinary+Clinic+Malanay+Santa+Barbara+Pangasinan";

  const INITIAL_OPTIONS = [
    { label: "🕒 Operating Hours", id: "hours" },
    { label: "📍 Clinic Location", id: "location" },
    { label: "💰 Services & Prices", id: "services" },
    { label: "📅 How to Book", id: "booking" },
    { label: "🚨 EMERGENCY", id: "emergency", isRed: true },
  ];

  useEffect(() => {
    navigation.setOptions({ headerShown: false });

    const fetchEcosystem = async () => {
      try {
        const snap = await getDocs(collection(db, "services"));
        setServicesList(snap.docs.map((d) => d.data()));

        const settingsRef = doc(db, "clinic_settings", "general");
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          setClinicSettings(settingsSnap.data());
        }
      } catch (e) {
        console.log(e);
      }
    };
    fetchEcosystem();

    const currentHour = new Date().getHours();
    let greeting = "Hi there";
    if (currentHour < 12) greeting = "Good morning";
    else if (currentHour < 18) greeting = "Good afternoon";
    else greeting = "Good evening";

    setTimeout(() => {
      setMessages([
        {
          id: 1,
          type: "bot",
          text: `${greeting}! 🐾 I am the Starbarks Virtual Assistant. How can I help you today?`,
          options: INITIAL_OPTIONS,
        },
      ]);
    }, 600);
  }, [navigation]);

  const handleCallClinic = () => {
    Linking.openURL(`tel:${CLINIC_PHONE}`);
  };
  const handleOpenMaps = () => {
    Linking.openURL(CLINIC_MAPS_URL);
  };

  const formatHour = (hour24) => {
    if (hour24 === 0) return "12:00 AM";
    if (hour24 === 12) return "12:00 PM";
    return hour24 < 12 ? `${hour24}:00 AM` : `${hour24 - 12}:00 PM`;
  };

  const handleSelectOption = (option) => {
    const userMsg = { id: Date.now(), type: "user", text: option.label };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    setTimeout(() => {
      let botResponse = "";
      let actionButton = null;
      let followUpOptions = INITIAL_OPTIONS;

      switch (option.id) {
        case "hours":
          const nowHour = new Date().getHours();
          const isOpen =
            nowHour >= clinicSettings.openHour &&
            nowHour < clinicSettings.closeHour;
          const statusText = isOpen
            ? "🟢 We are currently OPEN."
            : "🔴 We are currently CLOSED.";
          botResponse = `${statusText}\n\nOur regular operating hours are Monday to Saturday, from ${formatHour(clinicSettings.openHour)} to ${formatHour(clinicSettings.closeHour)}.\nWe are closed on Sundays.`;
          break;
        case "location":
          botResponse =
            "We are located in Malanay, Santa Barbara, Pangasinan. Look for the brown and beige sign!";
          actionButton = {
            label: "🗺️ Open in Google Maps",
            action: handleOpenMaps,
            color: "#1976D2",
          };
          break;
        case "booking":
          botResponse =
            "Booking is easy! Just go back to your Dashboard and tap 'Schedule Visit'. You can book multiple pets at the same time.";
          actionButton = {
            label: "📅 Go to Booking Screen",
            action: () => navigation.navigate("BookAppointment"),
            color: "#2E7D32",
          };
          followUpOptions = [
            { label: "⬅️ I have more questions", id: "reset" },
          ];
          break;
        case "emergency":
          botResponse =
            "⚠️ DO NOT WAIT FOR AN APP BOOKING.\n\nIf your pet is experiencing heavy bleeding, difficulty breathing, or seizures, proceed directly to the clinic immediately. Emergencies are given absolute priority.";
          actionButton = {
            label: `📞 Call Clinic Now`,
            action: handleCallClinic,
            color: "#D32F2F",
          };
          break;
        case "services":
          if (servicesList.length > 0) {
            botResponse =
              "Here are some of our base starting prices:\n\n" +
              servicesList
                .slice(0, 5)
                .map((s) => `• ${s.name}: ₱${s.price}`)
                .join("\n") +
              "\n\nPrices may vary based on your pet's specific needs or weight.";
          } else {
            botResponse =
              "We offer Consultations, Vaccinations, Surgery, and Grooming. Please check the booking screen for exact prices.";
          }
          break;
        case "reset":
          botResponse = "What else can I help you with?";
          break;
        default:
          botResponse = "I'm sorry, I didn't understand that.";
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          type: "bot",
          text: botResponse,
          actionButton: actionButton,
          options: followUpOptions,
        },
      ]);
      setIsTyping(false);
    }, 800);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <View style={styles.botAvatarHeader}>
            <Text style={{ fontSize: 22 }}>🤖</Text>
          </View>
          <View>
            <Text style={styles.headerText}>Starbarks Virtual Assistant</Text>
            <Text style={styles.subText}>🟢 Online • Automated Support</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.chatArea}
        contentContainerStyle={{ paddingBottom: 20 }}
        ref={scrollViewRef}
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }
      >
        <Text style={styles.timestampText}>
          Today,{" "}
          {new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>

        {messages.map((msg) => (
          <View
            key={msg.id}
            style={[
              styles.messageWrapper,
              msg.type === "user" ? styles.userWrapper : styles.botWrapper,
            ]}
          >
            {msg.type === "bot" && (
              <View style={styles.botAvatarBubble}>
                <Text style={{ fontSize: 18 }}>🤖</Text>
              </View>
            )}
            <View style={styles.bubbleColumn}>
              <View
                style={[
                  styles.bubble,
                  msg.type === "user" ? styles.userBubble : styles.botBubble,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    msg.type === "user" ? styles.userText : styles.botText,
                  ]}
                >
                  {msg.text}
                </Text>
                {msg.actionButton && (
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      { backgroundColor: msg.actionButton.color },
                    ]}
                    onPress={msg.actionButton.action}
                  >
                    <Text style={styles.actionBtnText}>
                      {msg.actionButton.label}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {msg.type === "bot" &&
                msg.options &&
                msg.id === messages[messages.length - 1].id && (
                  <View style={styles.optionsContainer}>
                    {msg.options.map((opt) => (
                      <TouchableOpacity
                        key={opt.id}
                        style={[
                          styles.optionButton,
                          opt.isRed && {
                            borderColor: "#EF9A9A",
                            backgroundColor: "#FFEBEE",
                          },
                        ]}
                        onPress={() => handleSelectOption(opt)}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            opt.isRed && { color: "#C62828" },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
            </View>
          </View>
        ))}

        {isTyping && (
          <View style={[styles.messageWrapper, styles.botWrapper]}>
            <View style={styles.botAvatarBubble}>
              <Text style={{ fontSize: 18 }}>🤖</Text>
            </View>
            <View
              style={[
                styles.bubble,
                styles.botBubble,
                {
                  width: 60,
                  height: 40,
                  justifyContent: "center",
                  alignItems: "center",
                },
              ]}
            >
              <Text style={[styles.botText, { fontSize: 20, lineHeight: 20 }]}>
                •••
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.chatInputContainer}>
        <TouchableOpacity style={styles.attachBtn}>
          <Text style={{ fontSize: 22, color: "#888" }}>+</Text>
        </TouchableOpacity>
        <View style={styles.fakeInput}>
          <Text style={styles.fakeInputText}>
            Tap an option above to reply...
          </Text>
        </View>
        <View style={styles.sendBtn}>
          <Text style={{ fontSize: 16, color: "#888" }}>➤</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: {
    backgroundColor: "#5D4037",
    padding: 20,
    paddingTop: Platform.OS === "ios" ? 50 : 40,
    elevation: 4,
  },
  backBtn: { marginBottom: 15 },
  backBtnText: { color: "#D7CCC8", fontSize: 16, fontWeight: "bold" },
  headerTitleRow: { flexDirection: "row", alignItems: "center" },
  botAvatarHeader: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EFEBE9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 15,
  },
  headerText: { color: "white", fontSize: 18, fontWeight: "bold" },
  subText: { color: "#A5D6A7", fontSize: 12, fontWeight: "bold", marginTop: 2 },
  chatArea: { flex: 1, padding: 15 },
  timestampText: {
    textAlign: "center",
    color: "#9E9E9E",
    fontSize: 11,
    marginBottom: 20,
    fontWeight: "bold",
  },
  messageWrapper: {
    marginBottom: 20,
    maxWidth: "85%",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  userWrapper: { alignSelf: "flex-end", justifyContent: "flex-end" },
  botWrapper: { alignSelf: "flex-start" },
  botAvatarBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E0E0E0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    marginTop: 4,
  },
  bubbleColumn: { flexShrink: 1 },
  bubble: { padding: 14, borderRadius: 18, elevation: 1 },
  userBubble: { backgroundColor: "#8B4513", borderTopRightRadius: 4 },
  botBubble: {
    backgroundColor: "white",
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#EEEEEE",
  },
  userText: { color: "white", fontSize: 15, lineHeight: 22 },
  botText: { color: "#333", fontSize: 15, lineHeight: 22 },
  actionBtn: {
    marginTop: 15,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    elevation: 2,
  },
  actionBtnText: { color: "white", fontWeight: "bold", fontSize: 14 },
  optionsContainer: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionButton: {
    backgroundColor: "white",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D7CCC8",
    elevation: 1,
  },
  optionText: { color: "#5D4037", fontWeight: "bold", fontSize: 13 },
  chatInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    paddingBottom: 25,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  attachBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  fakeInput: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    marginHorizontal: 10,
  },
  fakeInputText: { color: "#BDBDBD", fontStyle: "italic", fontSize: 14 },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EFEBE9",
    alignItems: "center",
    justifyContent: "center",
  },
});
