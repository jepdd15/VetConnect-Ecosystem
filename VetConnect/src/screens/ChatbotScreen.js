// Hybrid AI + Rule-Based Virtual Assistant.
//
// Quick-action buttons (Hours, Location, Services, Booking, Emergency) are always
// rule-based: instant, deterministic, zero API tokens. Free-text questions route
// through the Cloudflare Worker proxy → Claude Haiku 4.5.
//
// Session management: in-memory conversation history, 5-second client-side rate
// limiter, 20-message cap, and a "NEW CHAT" reset button.

import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../firebaseConfig";
import { COLORS, FONTS } from '../theme/mobileTokens';
import { useClinicContact } from '../hooks/useClinicContact';
import { getLocalDateStr, formatHour } from '../utils/helpers';
import {
  sendChatMessage,
  DEFAULT_CHATBOT_SYSTEM_PROMPT,
} from '../utils/chatbotService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard caps for session management (T3.67). */
const RATE_LIMIT_MS = 5000;
const MESSAGE_CAP = 20; // user turns; history array cap = MESSAGE_CAP * 2

/** Quick-action chip definitions. Order matters for horizontal scroll UX. */
const INITIAL_OPTIONS = [
  { label: "🕒 Operating Hours", id: "hours" },
  { label: "📍 Clinic Location", id: "location" },
  { label: "💰 Services & Prices", id: "services" },
  { label: "📅 How to Book", id: "booking" },
  { label: "🚨 EMERGENCY", id: "emergency", isRed: true },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function buildGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function buildInitialMessage() {
  return {
    id: Date.now(),
    type: 'bot',
    text: `${buildGreeting()}! 🐾 I am the Starbarks Virtual Assistant. How can I help you today?`,
  };
}

/**
 * Returns a formatted price string for a service.
 * Handles tiered pricing (weight-based) and flat pricing.
 * Moved to module scope so both the component and buildPromptAppendix can use it.
 */
function getDisplayPrice(service) {
  if (service.hasTieredPricing && service.pricingTiers?.length) {
    const prices = service.pricingTiers.map((t) => Number(t.price) || 0).filter((p) => p > 0);
    if (prices.length > 0) return `starts at ₱${Math.min(...prices)}`;
  }
  const base = Number(service.price) || 0;
  return base > 0 ? `₱${base}` : 'Price on consultation';
}

/**
 * Builds a structured text block appended to the base system prompt before every AI call.
 * Grounds Claude in real clinic data — hours, service prices, and admin-managed FAQ entries.
 * Target: ~1500 words / ~2000 tokens maximum to stay within Haiku's budget.
 *
 * @param {{ clinicSettings: object, servicesList: Array, clinicPhone: string, clinicAddress: string, faqEntries: Array }} params
 * @returns {string}
 */
function buildPromptAppendix({ clinicSettings, servicesList, clinicPhone, clinicAddress, faqEntries = [] }) {
  const lines = ['\n\n--- LIVE CLINIC DATA (use this to answer questions accurately) ---'];

  // Clinic contact
  lines.push('\n## Clinic Contact');
  if (clinicPhone) lines.push(`Phone: ${clinicPhone}`);
  if (clinicAddress) lines.push(`Address: ${clinicAddress}`);

  // Operating hours
  const { openHour, closeHour, workingDays = [], closedDates = [] } = clinicSettings;
  const days = [...workingDays].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(', ');
  lines.push('\n## Operating Hours');
  lines.push(`Days: ${days || 'Not configured'}`);
  lines.push(`Hours: ${formatHour(openHour)} - ${formatHour(closeHour)}`);
  if (closedDates.length > 0) {
    lines.push(`Upcoming closed dates: ${closedDates.slice(0, 5).join(', ')}`);
  }

  // Services catalog grouped by department
  if (servicesList.length > 0) {
    lines.push('\n## Services & Pricing');
    const grouped = {};
    servicesList.forEach((s) => {
      const dept = s.department || s.category || 'General';
      if (!grouped[dept]) grouped[dept] = [];
      grouped[dept].push(s);
    });
    Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([dept, svcs]) => {
        lines.push(`\n${dept}:`);
        svcs
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
          .forEach((s) => {
            let detail = getDisplayPrice(s);
            if (s.duration) detail += `, ${s.duration} min`;
            lines.push(`- ${s.name}: ${detail}`);
          });
      });
  }

  // FAQ entries grouped by category (empty until Phase 2 wires them in)
  if (faqEntries.length > 0) {
    lines.push('\n## Frequently Asked Questions');
    const grouped = {};
    faqEntries.forEach((f) => {
      if (!grouped[f.category]) grouped[f.category] = [];
      grouped[f.category].push(f);
    });
    Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([cat, faqs]) => {
        lines.push(`\n### ${cat}`);
        faqs.forEach((f) => {
          lines.push(`Q: ${f.question}`);
          lines.push(`A: ${f.answer}`);
        });
      });
  }

  lines.push('\n--- END LIVE CLINIC DATA ---');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatbotScreen({ navigation }) {
  const scrollViewRef = useRef(null);

  // --- Display state ---
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);      // rule-based 800ms delay
  const [isAiLoading, setIsAiLoading] = useState(false); // Worker round-trip
  const [fetchError, setFetchError] = useState(false);

  // --- Data state ---
  const [servicesList, setServicesList] = useState([]);
  const [clinicSettings, setClinicSettings] = useState({
    openHour: 8,
    closeHour: 17,
    workingDays: [1, 2, 3, 4, 5, 6],
    closedDates: [],
  });
  const [faqEntries, setFaqEntries] = useState([]); // active FAQs injected into prompt (T3.108)
  const [promptAppendix, setPromptAppendix] = useState(''); // rebuilt on data change (T3.108)

  // --- LLM / session state (T3.62, T3.64, T3.66, T3.67) ---
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_CHATBOT_SYSTEM_PROMPT);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [workerUrl, setWorkerUrl] = useState('');
  const [inputText, setInputText] = useState('');
  const [conversationHistory, setConversationHistory] = useState([]); // { role, content }[]
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [messageCapReached, setMessageCapReached] = useState(false);

  // --- Refs ---
  const lastSentRef = useRef(0);
  const rateLimitTimerRef = useRef(null);

  // --- Shared data ---
  const { clinicPhone, clinicAddress } = useClinicContact();

  // ---------------------------------------------------------------------------
  // Mount effects
  // ---------------------------------------------------------------------------

  // T3.66: load system prompt + LLM config from Firestore on mount
  useEffect(() => {
    navigation.setOptions({ headerShown: false });

    const fetchEcosystem = async () => {
      try {
        // Services catalog (T2.358: filter archived)
        const snap = await getDocs(collection(db, "services"));
        setServicesList(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((s) => !s.isArchived)
        );

        // Clinic general settings (T2.355/T2.356: safe merge with defaults)
        const settingsSnap = await getDoc(doc(db, "clinic_settings", "general"));
        if (settingsSnap.exists()) {
          setClinicSettings((prev) => ({ ...prev, ...settingsSnap.data() }));
        }

        // LLM feature flag + Worker URL (T3.66)
        const llmSnap = await getDoc(doc(db, "clinic_settings", "llm_config"));
        if (llmSnap.exists()) {
          const llmData = llmSnap.data();
          setLlmEnabled(llmData.enabled ?? false);
          setWorkerUrl(llmData.workerUrl ?? '');
        }

        // Chatbot system prompt (T3.66) — falls back to DEFAULT if doc missing
        const promptSnap = await getDoc(doc(db, "system_prompts", "chatbot_assistant"));
        if (promptSnap.exists()) {
          setSystemPrompt(promptSnap.data().prompt || DEFAULT_CHATBOT_SYSTEM_PROMPT);
        }

        // FAQ knowledge base (T3.108) — inject active entries into prompt appendix
        const faqSnap = await getDocs(
          query(collection(db, 'faqs'), where('isActive', '==', true))
        );
        setFaqEntries(
          faqSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
        );
      } catch (e) {
        console.warn('[ChatbotScreen.fetchEcosystem]:', e.message);
        setFetchError(true);
      }
    };

    fetchEcosystem();

    // Show greeting after brief delay so the mount animation settles
    setTimeout(() => {
      setMessages([buildInitialMessage()]);
    }, 600);
  }, [navigation]);

  // Clean up rate-limit timer on unmount (T3.67)
  useEffect(() => {
    return () => {
      if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
    };
  }, []);

  // T3.108: Rebuild prompt appendix whenever source data changes.
  // The appendix is stored in state so it is always current when handleSendMessage fires.
  useEffect(() => {
    setPromptAppendix(
      buildPromptAppendix({ clinicSettings, servicesList, clinicPhone, clinicAddress, faqEntries })
    );
  }, [clinicSettings, servicesList, clinicPhone, clinicAddress, faqEntries]);

  // ---------------------------------------------------------------------------
  // Rule-based helpers
  // ---------------------------------------------------------------------------

  const handleCallClinic = () => {
    if (!clinicPhone) return;
    Linking.openURL(`tel:${clinicPhone}`);
  };

  const handleOpenMaps = () => {
    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(clinicAddress)}`);
  };

  // T2.355: consecutive-day compression for display
  const formatWorkingDays = (days) => {
    if (!days || days.length === 0) return 'by appointment only';
    if (days.length === 7) return 'every day';
    const sorted = [...days].sort((a, b) => a - b);
    const isConsecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
    if (isConsecutive && sorted.length >= 3) {
      return `${DAY_NAMES[sorted[0]]} to ${DAY_NAMES[sorted[sorted.length - 1]]}`;
    }
    return sorted.map((d) => DAY_NAMES[d]).join(', ');
  };

  /**
   * Processes structured quick-action button taps via the rule-based switch.
   * Emergency is always handled here — never via AI — for safety.
   * Hours / Location / Services / Booking remain rule-based: instant, free, deterministic.
   */
  const handleSelectOption = (option) => {
    const userMsg = { id: Date.now(), type: "user", text: option.label };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    setTimeout(() => {
      let botText = "";
      let actionButton = null;
      let followUpOptions = null;
      let followUpDeptOptions = null;

      switch (option.id) {
        // T2.355: full working-day and closed-date awareness
        case "hours": {
          const now = new Date();
          const nowHour = now.getHours();
          const todayDay = now.getDay();
          const todayStr = getLocalDateStr();
          const { openHour, closeHour, workingDays = [], closedDates = [] } = clinicSettings;

          const isWorkingDay = workingDays.includes(todayDay);
          const isClosedDate = closedDates.includes(todayStr);
          const isWithinHours = nowHour >= openHour && nowHour < closeHour;
          const isOpen = isWorkingDay && !isClosedDate && isWithinHours;

          const statusText = isOpen ? "🟢 We are currently OPEN." : "🔴 We are currently CLOSED.";
          let reason = '';
          if (!isOpen) {
            if (isClosedDate) reason = '\n(Today is a scheduled closed date.)';
            else if (!isWorkingDay) reason = `\n(We are closed on ${DAY_NAMES[todayDay]}s.)`;
          }

          const daysText = formatWorkingDays(workingDays);
          botText = `${statusText}${reason}\n\nOur regular operating hours are ${daysText}, from ${formatHour(openHour)} to ${formatHour(closeHour)}.`;
          break;
        }

        case "location":
          botText = `We are located at ${clinicAddress}. Look for the brown and beige sign!`;
          actionButton = { label: "🗺️ Open in Google Maps", action: handleOpenMaps, color: COLORS.info };
          break;

        case "booking":
          botText = "Booking is easy! Just go back to your Dashboard and tap 'Schedule Visit'. You can book multiple pets at the same time.";
          actionButton = {
            label: "📅 Go to Booking Screen",
            action: () => navigation.navigate("BookAppointment"),
            color: COLORS.success,
          };
          followUpOptions = [{ label: "⬅️ I have more questions", id: "reset" }];
          break;

        case "emergency":
          botText =
            "⚠️ DO NOT WAIT FOR AN APP BOOKING.\n\nIf your pet is experiencing heavy bleeding, difficulty breathing, or seizures, proceed directly to the clinic immediately. Emergencies are given absolute priority.";
          actionButton = clinicPhone
            ? { label: '📞 Call Clinic Now', action: handleCallClinic, color: COLORS.danger }
            : null;
          break;

        // T2.357: full services catalog grouped by department, tiered pricing (T2.361: dept drill-down)
        case "services": {
          if (servicesList.length > 0) {
            const grouped = {};
            servicesList.forEach((s) => {
              const dept = s.department || s.category || 'General';
              if (!grouped[dept]) grouped[dept] = [];
              grouped[dept].push(s);
            });

            const sections = Object.entries(grouped)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([dept, svcs]) => {
                const lines = svcs
                  .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                  .map((s) => `  • ${s.name}: ${getDisplayPrice(s)}`)
                  .join('\n');
                return `${dept}:\n${lines}`;
              })
              .join('\n\n');

            botText = `Here are our services and prices:\n\n${sections}\n\nPrices may vary based on your pet's weight and specific needs.`;

            const deptNames = Object.keys(grouped).sort();
            if (deptNames.length > 1) {
              followUpDeptOptions = [
                ...deptNames.map((d) => ({ label: `📂 ${d}`, id: `dept_${d}` })),
                { label: '⬅️ Back to main menu', id: 'reset' },
              ];
            }
          } else {
            botText = 'Our service catalog is currently unavailable. Please check the booking screen or call the clinic for prices.';
          }
          break;
        }

        case "reset":
          botText = "What else can I help you with?";
          break;

        default: {
          // T2.361: department sub-intent drill-down
          if (option.id.startsWith('dept_')) {
            const deptName = option.id.replace('dept_', '');
            const deptServices = servicesList.filter(
              (s) => (s.department || s.category || 'General') === deptName
            );

            if (deptServices.length > 0) {
              const lines = deptServices
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .map((s) => {
                  let detail = getDisplayPrice(s);
                  if (s.duration) detail += ` · ${s.duration} min`;
                  if (s.targetSpecies?.length) detail += ` · ${s.targetSpecies.join(', ')}`;
                  return `• ${s.name}: ${detail}`;
                })
                .join('\n');
              botText = `${deptName} Services:\n\n${lines}\n\nPrices may vary based on your pet's weight.`;
            } else {
              botText = `No services found under ${deptName}.`;
            }
            followUpOptions = [
              { label: '💰 All Services', id: 'services' },
              { label: '⬅️ Back to main menu', id: 'reset' },
            ];
            break;
          }
          botText = "I'm sorry, I didn't understand that.";
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          type: "bot",
          text: botText,
          actionButton,
          options: followUpDeptOptions ?? followUpOptions,
        },
      ]);
      setIsTyping(false);
    }, 800);
  };

  // ---------------------------------------------------------------------------
  // AI gateway handler (T3.64)
  // ---------------------------------------------------------------------------

  /**
   * Submits a free-text message through the Cloudflare Worker.
   * Enforces rate limit and message cap before calling the gateway.
   */
  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || isAiLoading || isRateLimited || messageCapReached) return;

    // Rate limit: 5 seconds between sends (T3.67)
    const now = Date.now();
    const elapsed = now - lastSentRef.current;
    if (lastSentRef.current > 0 && elapsed < RATE_LIMIT_MS) {
      setIsRateLimited(true);
      const remaining = RATE_LIMIT_MS - elapsed;
      rateLimitTimerRef.current = setTimeout(() => setIsRateLimited(false), remaining);
      return;
    }

    // Message cap: 20 user turns = 40 history items (T3.67)
    const userTurns = conversationHistory.filter((m) => m.role === 'user').length;
    if (userTurns >= MESSAGE_CAP) {
      setMessageCapReached(true);
      return;
    }

    setInputText('');
    lastSentRef.current = Date.now();

    // Append user bubble immediately for responsiveness
    setMessages((prev) => [...prev, { id: Date.now(), type: 'user', text }]);

    // Build updated history to send (include this new turn)
    const updatedHistory = [...conversationHistory, { role: 'user', content: text }];
    setConversationHistory(updatedHistory);

    setIsAiLoading(true);

    try {
      const result = await sendChatMessage({
        messages: updatedHistory,
        systemPrompt: systemPrompt + promptAppendix,
        workerUrl,
      });

      setMessages((prev) => [
        ...prev,
        { id: Date.now(), type: 'bot', text: result.text },
      ]);

      setConversationHistory((prev) => [
        ...prev,
        { role: 'assistant', content: result.text },
      ]);
    } catch (error) {
      // Errors surface as tinted bot bubbles — never Alert.alert (T3.64)
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          type: 'bot',
          text: error.message || 'Something went wrong. Please try again.',
          isError: true,
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Session management (T3.67)
  // ---------------------------------------------------------------------------

  /** Resets the entire conversation to the initial greeting. */
  const handleClearConversation = () => {
    setConversationHistory([]);
    setMessageCapReached(false);
    setIsRateLimited(false);
    if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
    setInputText('');
    setMessages([buildInitialMessage()]);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const showTypingDots = isTyping || isAiLoading;
  const isLlmReady = llmEnabled && !!workerUrl;

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <View style={styles.botAvatarHeader}>
            <Text style={{ fontSize: 22 }}>🤖</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerText}>Starbarks Virtual Assistant</Text>
            <Text style={styles.subText}>🟢 Online • Automated Support</Text>
          </View>
          {/* NEW CHAT button (T3.67): only visible once a conversation has started */}
          {conversationHistory.length > 0 && (
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.clearBtn} onPress={handleClearConversation}>
                <Text style={styles.clearBtnText}>NEW CHAT</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Persistent quick-action chips (T3.65) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.quickActionsBar}
        contentContainerStyle={styles.quickActionsContent}
      >
        {INITIAL_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.id}
            style={[styles.quickActionChip, opt.isRed && styles.quickActionChipDanger]}
            onPress={() => handleSelectOption(opt)}
          >
            <Text style={[styles.quickActionText, opt.isRed && styles.quickActionTextDanger]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Chat area */}
      <ScrollView
        style={styles.chatArea}
        contentContainerStyle={{ paddingBottom: 20 }}
        ref={scrollViewRef}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.timestampText}>
          Today,{" "}
          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>

        {/* T2.360: Firestore fetch error banner */}
        {fetchError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>
              ⚠️ Some information may be unavailable. Answers are based on default settings.
            </Text>
          </View>
        )}

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
                  msg.isError && styles.errorBubble,
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
                    style={[styles.actionBtn, { backgroundColor: msg.actionButton.color }]}
                    onPress={msg.actionButton.action}
                  >
                    <Text style={styles.actionBtnText}>{msg.actionButton.label}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Inline options for dept drill-down and contextual follow-ups (T3.65 Step 5.2) */}
              {msg.type === "bot" &&
                msg.options &&
                msg.id === messages[messages.length - 1].id &&
                msg.options.some(
                  (o) => o.id.startsWith('dept_') || o.id === 'reset' || o.id === 'services'
                ) && (
                  <View style={styles.optionsContainer}>
                    {msg.options.map((opt) => (
                      <TouchableOpacity
                        key={opt.id}
                        style={[
                          styles.optionButton,
                          opt.isRed && { borderColor: "#EF9A9A", backgroundColor: "#FFEBEE" },
                        ]}
                        onPress={() => handleSelectOption(opt)}
                      >
                        <Text
                          style={[styles.optionText, opt.isRed && { color: "#C62828" }]}
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

        {/* Typing / loading indicator */}
        {showTypingDots && (
          <View style={[styles.messageWrapper, styles.botWrapper]}>
            <View style={styles.botAvatarBubble}>
              <Text style={{ fontSize: 18 }}>🤖</Text>
            </View>
            <View
              style={[
                styles.bubble,
                styles.botBubble,
                { width: 60, height: 40, justifyContent: "center", alignItems: "center" },
              ]}
            >
              <Text style={[styles.botText, { fontSize: 20, lineHeight: 20 }]}>•••</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input area (T3.62, T3.67) */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Rate limit feedback (T3.67) */}
        {isRateLimited && (
          <Text style={styles.rateLimitText}>Please wait a moment...</Text>
        )}

        <View style={styles.inputBar}>
          {/* LLM not configured: show static fallback */}
          {!isLlmReady ? (
            <Text style={styles.chatFooterText}>
              AI chat is not yet configured. Contact clinic staff.
            </Text>
          ) : messageCapReached ? (
            /* Message cap reached: replace input with reset prompt (T3.67) */
            <View style={styles.capReachedBar}>
              <Text style={styles.capReachedText}>Conversation limit reached.</Text>
              <TouchableOpacity style={styles.newConversationBtn} onPress={handleClearConversation}>
                <Text style={styles.newConversationBtnText}>START NEW CONVERSATION</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Normal state: free-text input + send button (T3.62) */
            <>
              <TextInput
                style={styles.textInput}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Ask me anything..."
                placeholderTextColor={COLORS.placeholder}
                multiline
                maxLength={500}
                editable={!isAiLoading}
                onSubmitEditing={handleSendMessage}
                blurOnSubmit={false}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!inputText.trim() || isAiLoading || isRateLimited) && styles.sendButtonDisabled,
                ]}
                onPress={handleSendMessage}
                disabled={!inputText.trim() || isAiLoading || isRateLimited}
              >
                <Text style={styles.sendButtonText}>SEND</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — Phase 7 design compliance pass
// All borderRadius: 0. Colors from COLORS/FONTS tokens only.
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Layout
  container: { flex: 1, backgroundColor: COLORS.cream },
  chatArea: { flex: 1, padding: 15 },

  // Header (T3.67: headerTitleRow accommodates NEW CHAT button on same row)
  header: {
    backgroundColor: COLORS.accent,
    padding: 20,
    paddingTop: Platform.OS === "ios" ? 50 : 40,
    elevation: 4,
  },
  backBtn: { marginBottom: 15 },
  backBtnText: { color: COLORS.borderLight, fontSize: 16, fontWeight: "bold" },
  headerTitleRow: { flexDirection: "row", alignItems: "center" },
  botAvatarHeader: {
    width: 44,
    height: 44,
    borderRadius: 0, // Phase 7: was 22
    backgroundColor: "#EFEBE9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 15,
  },
  headerText: { color: COLORS.white, fontSize: 18, fontWeight: "bold" },
  subText: { color: "#A5D6A7", fontSize: 12, fontWeight: "bold", marginTop: 2 },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginLeft: 8,
  },
  clearBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  clearBtnText: {
    fontFamily: FONTS.bold,
    color: COLORS.white,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Quick-action chip bar (T3.65)
  quickActionsBar: {
    maxHeight: 50,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.brand,
    backgroundColor: COLORS.cream,
  },
  quickActionsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  quickActionChip: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  quickActionChipDanger: {
    backgroundColor: '#FFEBEE',
    borderColor: COLORS.danger,
  },
  quickActionText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.brand,
    letterSpacing: 0.5,
  },
  quickActionTextDanger: { color: COLORS.danger },

  // Chat messages
  timestampText: {
    textAlign: "center",
    color: "#9E9E9E",
    fontSize: 11,
    marginBottom: 20,
    fontWeight: "bold",
  },
  errorBanner: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFB74D',
    padding: 10,
    marginBottom: 15,
    borderRadius: 0,
  },
  errorBannerText: {
    color: COLORS.warning,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
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
    borderRadius: 0, // Phase 7: was 16
    backgroundColor: "#E0E0E0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    marginTop: 4,
  },
  bubbleColumn: { flexShrink: 1 },
  bubble: {
    padding: 14,
    borderRadius: 0, // Phase 7: was 18
    elevation: 1,
  },
  userBubble: {
    // Phase 7: sky blue user bubbles per spec
    backgroundColor: COLORS.sky,
    borderWidth: 2,
    borderColor: COLORS.brand,
  },
  botBubble: {
    // Phase 7: cream bot bubbles, brand border
    backgroundColor: COLORS.cream,
    borderWidth: 2,
    borderColor: COLORS.brand,
  },
  // Error bot bubble: warm orange tint (T3.64)
  errorBubble: {
    backgroundColor: '#FFF3E0',
    borderColor: COLORS.warning,
    borderWidth: 2,
  },
  messageText: { fontSize: 15, lineHeight: 22 },
  userText: { color: COLORS.brand }, // Phase 7: dark on sky blue for contrast
  botText: { color: COLORS.textPrimary },
  actionBtn: {
    marginTop: 15,
    padding: 12,
    borderRadius: 0, // Phase 7: was 10
    alignItems: "center",
    elevation: 2,
  },
  actionBtnText: { color: COLORS.white, fontWeight: "bold", fontSize: 14 },

  // Inline drill-down options (dept + contextual follow-ups)
  optionsContainer: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionButton: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 0, // Phase 7: was 20
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    elevation: 1,
  },
  optionText: { color: COLORS.accent, fontWeight: "bold", fontSize: 13 },

  // Input bar (T3.62)
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 12,
    paddingBottom: 40,
    backgroundColor: COLORS.white,
    borderTopWidth: 2,
    borderTopColor: COLORS.brand,
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: FONTS.regular,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.cream,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: COLORS.sky,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    fontFamily: FONTS.black,
    fontSize: 13,
    color: COLORS.brand,
    letterSpacing: 1,
  },
  sendButtonDisabled: { opacity: 0.4 },

  // LLM not configured fallback text
  chatFooterText: { color: '#9E9E9E', fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'center' },

  // Rate limit feedback (T3.67)
  rateLimitText: {
    fontSize: 11,
    color: COLORS.warning,
    textAlign: 'center',
    fontFamily: FONTS.bold,
    paddingBottom: 2,
    backgroundColor: COLORS.white,
    paddingTop: 4,
  },

  // Message cap UI (T3.67)
  capReachedBar: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  capReachedText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.textMuted,
  },
  newConversationBtn: {
    backgroundColor: COLORS.sky,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  newConversationBtnText: {
    fontFamily: FONTS.black,
    fontSize: 12,
    color: COLORS.brand,
    letterSpacing: 1,
  },
});
