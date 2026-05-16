import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { sendChatMessage } from '../utils/chatbotService';
import SimpleMarkdown from './SimpleMarkdown';
import { COLORS } from '../theme/mobileTokens';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAILY_LIMIT = 10;

const QUICK_ACTIONS = [
  {
    label: 'Last Visit',
    prompt:
      "What happened during my pet's most recent visit? Please summarize the key findings and any instructions.",
  },
  {
    label: 'Medications',
    prompt:
      'What medications is my pet currently on? Include the instructions for each one.',
  },
  {
    label: 'Vaccines',
    prompt: "When is my pet's next vaccination due? Are any overdue?",
  },
  {
    label: 'What to Watch For',
    prompt: "Based on my pet's recent diagnosis and discharge notes, what specific symptoms or changes in behavior should I watch out for at home over the next few days?",
  },
];

// ---------------------------------------------------------------------------
// Rate limiting helpers (AsyncStorage, client-side, 10 queries/day)
// ---------------------------------------------------------------------------

/**
 * Returns the AsyncStorage key for today's usage count for a given user.
 *
 * @param {string} userId - Firebase UID
 * @returns {string}
 */
function buildRateLimitKey(userId) {
  const today = new Date();
  const dateStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  return `ai_pet_history_${userId}_${dateStr}`;
}

/**
 * Checks whether the user is under the daily query limit.
 * Increments the counter if they are allowed.
 *
 * @param {string} userId - Firebase UID
 * @returns {Promise<boolean>} true if the query is allowed, false if rate limited
 */
async function checkAndIncrementRate(userId) {
  const key = buildRateLimitKey(userId);
  const raw = await AsyncStorage.getItem(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= DAILY_LIMIT) return false;
  await AsyncStorage.setItem(key, String(count + 1));
  return true;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Bottom-sheet conversational AI chat for pet owners.
 *
 * Opens as a Modal anchored to the bottom of the screen at ~62% height.
 * All AI responses are rendered via SimpleMarkdown to support basic formatting.
 * Conversation state resets on close so each session is independent.
 *
 * Rate limiting is client-side via AsyncStorage: 10 queries per user per day.
 * Error states are shown inline — no Alert.alert in the normal flow.
 *
 * @param {object}   props
 * @param {boolean}  props.visible      - Controls modal visibility
 * @param {function} props.onClose      - Called to dismiss the sheet
 * @param {string}   props.petName      - Pet's display name (for header + empty state)
 * @param {string}   props.systemPrompt - Pre-built system prompt from buildPetOwnerPrompt
 * @param {string}   props.workerUrl    - Cloudflare Worker URL
 * @param {string}   props.userId       - Current user UID (for rate limiting key)
 */
export default function PetHistoryAISheet({
  visible,
  onClose,
  petName,
  systemPrompt,
  workerUrl,
  userId,
}) {
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [rateLimited, setRateLimited] = useState(false);

  const scrollRef = useRef(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /**
   * Resets all conversation state and dismisses the modal.
   * Called by the close button and the backdrop tap.
   */
  const handleClose = useCallback(() => {
    setMessages([]);
    setInput('');
    setError('');
    setRateLimited(false);
    onClose();
  }, [onClose]);

  /**
   * Sends a user message to the Cloudflare Worker and appends the AI reply.
   *
   * Accepts an optional override text (used by quick-action chips so they can
   * pass the chip prompt without mutating the input field state).
   *
   * Sliding window: keeps the first message plus the most recent 19 messages
   * to cap context size while preserving conversation thread continuity.
   *
   * @param {string} [overrideText] - If provided, uses this instead of `input`
   */
  const handleSend = useCallback(async (overrideText, { skipRateCheck = false } = {}) => {
    const trimmed = (overrideText ?? input).trim();
    if (!trimmed || loading) return;

    if (!skipRateCheck) {
      const allowed = await checkAndIncrementRate(userId);
      if (!allowed) {
        setRateLimited(true);
        return;
      }
    }

    const userMsg = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMsg];

    // Sliding window: preserve first message + last 19 to stay within context limits
    const cappedMessages =
      updatedMessages.length > 20
        ? [updatedMessages[0], ...updatedMessages.slice(-19)]
        : updatedMessages;

    setMessages(cappedMessages);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const result = await sendChatMessage({
        messages: cappedMessages,
        systemPrompt,
        workerUrl,
      });
      setMessages(prev => [...prev, { role: 'assistant', content: result.text }]);
    } catch (err) {
      setError(err.message || 'Could not get a response. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, systemPrompt, workerUrl, userId]);

  /**
   * Retries the last failed message. Finds the last user message,
   * drops the orphaned copy (since it had no paired assistant reply),
   * and re-sends it — bypassing the daily rate limit check since this
   * is a retry of an already-counted request.
   */
  const handleRetry = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;
    setError('');
    setMessages(prev => {
      if (prev.length > 0 && prev[prev.length - 1].role === 'user') {
        return prev.slice(0, -1);
      }
      return prev;
    });
    setTimeout(() => handleSend(lastUserMsg.content, { skipRateCheck: true }), 0);
  }, [messages, handleSend]);

  // ── Render ────────────────────────────────────────────────────────────────

  const isInputDisabled = loading || rateLimited;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      {/* Backdrop — tappable to dismiss */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      />

      {/* Bottom sheet container */}
      <View style={styles.sheet}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Ask About {petName}
          </Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialIcons name="close" size={22} color={COLORS.cream} />
          </TouchableOpacity>
        </View>

        {/* Safety disclaimer — always visible */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            AI-generated answers based on your pet's records. Always consult
            your vet for medical advice.
          </Text>
        </View>

        {/* Quick-action chips — shown only in the empty state */}
        {messages.length === 0 && (
          <View style={styles.chipsSection}>
            <Text style={styles.chipsLabel}>QUICK QUESTIONS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsScrollContent}
            >
              {QUICK_ACTIONS.map(qa => (
                <TouchableOpacity
                  key={qa.label}
                  style={styles.chip}
                  onPress={() => handleSend(qa.prompt)}
                  disabled={isInputDisabled}
                >
                  <Text style={styles.chipText}>{qa.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Chat area */}
        <ScrollView
          ref={scrollRef}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {/* Empty state */}
          {messages.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialIcons name="auto-awesome" size={32} color={COLORS.borderLight} />
              <Text style={styles.emptyText}>
                Ask anything about {petName}&apos;s medical history
              </Text>
              <Text style={styles.emptySub}>
                Try a quick question above or type your own below.
              </Text>
            </View>
          )}

          {/* Message bubbles */}
          {messages.map((msg, index) =>
            msg.role === 'user' ? (
              <View key={index} style={styles.userBubble}>
                <Text style={styles.bubbleLabel}>YOU</Text>
                <Text style={styles.userText}>{msg.content}</Text>
              </View>
            ) : (
              <View key={index} style={styles.aiBubble}>
                <Text style={styles.bubbleLabel}>PET HEALTH ASSISTANT</Text>
                <SimpleMarkdown text={msg.content} />
              </View>
            )
          )}

          {/* Loading indicator */}
          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={COLORS.sky} />
              <Text style={styles.loadingText}>Looking through records...</Text>
            </View>
          )}

          {/* Inline error with retry — no Alert.alert */}
          {!!error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorTitle}>AI temporarily unavailable</Text>
              <Text style={styles.errorDetail}>{error}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={handleRetry}
                activeOpacity={0.7}
              >
                <MaterialIcons name="replay" size={16} color={COLORS.danger} />
                <Text style={styles.retryText}>TRY AGAIN</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Rate limit notice — inline, no Alert.alert */}
          {rateLimited && (
            <View style={styles.rateLimitBanner}>
              <Text style={styles.rateLimitText}>
                You've reached your daily question limit ({DAILY_LIMIT}/day). Come back tomorrow!
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Input row */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Ask a question..."
              placeholderTextColor={COLORS.placeholder}
              value={input}
              onChangeText={setInput}
              editable={!isInputDisabled}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={() => handleSend()}
              blurOnSubmit
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!input.trim() || isInputDisabled) && styles.sendBtnDisabled,
              ]}
              onPress={() => handleSend()}
              disabled={!input.trim() || isInputDisabled}
            >
              <MaterialIcons
                name="send"
                size={20}
                color={!input.trim() || isInputDisabled ? COLORS.muted : COLORS.cream}
              />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Modal layers
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    height: '62%',
    backgroundColor: COLORS.cream,
    borderTopWidth: 3,
    borderTopColor: COLORS.brand,
    borderRadius: 0,   // Neubrutalism: zero border-radius
  },

  // Header bar
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.brand,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    color: COLORS.cream,
    fontWeight: '900',
    fontSize: 15,
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
    marginRight: 12,
  },

  // Disclaimer banner
  disclaimer: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#BBDEFB',
  },
  disclaimerText: {
    fontSize: 11,
    color: COLORS.info,
    fontStyle: 'italic',
    lineHeight: 16,
  },

  // Quick-action chips
  chipsSection: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  chipsLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  chipsScrollContent: {
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: COLORS.sky,
    borderRadius: 0,   // Neubrutalism
    backgroundColor: COLORS.white,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.sky,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Chat area
  chatArea: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    paddingBottom: 20,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Message bubbles
  bubbleLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    marginBottom: 12,
    backgroundColor: COLORS.sky,
    padding: 12,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,   // Neubrutalism
  },
  userText: {
    fontSize: 14,
    color: COLORS.white,
    lineHeight: 20,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    maxWidth: '90%',
    marginBottom: 12,
    backgroundColor: COLORS.white,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 0,   // Neubrutalism
  },

  // Loading
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingVertical: 4,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },

  // Error banner (inline, not Alert.alert)
  errorBanner: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    borderRadius: 0,
    padding: 12,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.danger,
    marginBottom: 4,
  },
  errorDetail: {
    fontSize: 12,
    color: '#8D6E63',
    lineHeight: 18,
    marginBottom: 10,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: COLORS.danger,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  retryText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.danger,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Rate limit banner (inline)
  rateLimitBanner: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFE0B2',
    borderRadius: 0,
    padding: 12,
    marginBottom: 12,
  },
  rateLimitText: {
    fontSize: 13,
    color: COLORS.warning,
    fontWeight: '700',
    lineHeight: 18,
  },

  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 0,   // Neubrutalism
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    maxHeight: 80,
    backgroundColor: COLORS.white,
  },
  sendBtn: {
    width: 42,
    height: 42,
    backgroundColor: COLORS.sky,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,   // Neubrutalism
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.borderLight,
    borderColor: COLORS.borderLight,
  },
});
