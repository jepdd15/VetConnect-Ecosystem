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

const QUICK_ACTIONS = [
  {
    label: 'What does my pet need?',
    prompt:
      "Based on my pet's vaccination status, medical history, and any upcoming recheck dates, what services should I book next? Are any vaccines overdue?",
  },
  {
    label: 'Best time this week?',
    prompt:
      "What are the best available time slots this week? Are there any days that are less busy or have more availability in the departments I need?",
  },
  {
    label: 'Help me choose services',
    prompt:
      "What services are available for my pet's species? Can you recommend which ones my pet might need based on their health history and age?",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Bottom-sheet AI booking advisor chat for pet owners.
 *
 * Opens as a Modal anchored to the bottom of the screen at ~62% height.
 * All AI responses are rendered via SimpleMarkdown to support basic formatting.
 * Conversation state resets on close so each session is fresh.
 *
 * No rate limiting — per spec item (8). Error states are shown inline.
 *
 * @param {object}   props
 * @param {boolean}  props.visible        - Controls modal visibility
 * @param {function} props.onClose        - Called to dismiss the sheet
 * @param {string}   props.petName        - Pet's display name for header + empty state
 * @param {string}   props.systemPrompt   - Pre-built booking context prompt
 * @param {string}   props.workerUrl      - Cloudflare Worker URL
 * @param {string}   props.userId         - Current user UID for audit
 * @param {function} props.onAuditLog     - (promptSummary, messageCount) => void fire-and-forget
 */
export default function BookingAISheet({
  visible,
  onClose,
  petName,
  systemPrompt,
  workerUrl,
  userId,
  onAuditLog,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

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
  const handleSend = useCallback(async (overrideText, baseMessages) => {
    const trimmed = (overrideText ?? input).trim();
    if (!trimmed || loading) return;

    const userMsg = { role: 'user', content: trimmed };
    const updatedMessages = [...(baseMessages ?? messages), userMsg];

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
      // Fire-and-forget audit after successful response
      onAuditLog?.(trimmed.substring(0, 200), cappedMessages.length);
    } catch (err) {
      setError(err.message || 'Could not get a response. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, systemPrompt, workerUrl, onAuditLog]);

  /**
   * Retries the last failed message. Finds the last user message,
   * drops the orphaned copy (it had no paired assistant reply),
   * and re-sends it.
   */
  const handleRetry = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;
    setError('');
    const trimmedMessages = messages[messages.length - 1]?.role === 'user'
      ? messages.slice(0, -1)
      : messages;
    setMessages(trimmedMessages);
    handleSend(lastUserMsg.content, trimmedMessages);
  }, [messages, handleSend]);

  // ── Render ────────────────────────────────────────────────────────────────

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

        {/* Header — single-line: icon + title · petName + close */}
        <View style={styles.header}>
          <MaterialIcons name="auto-awesome" size={18} color={COLORS.white} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            AI BOOKING ADVISOR{petName ? ` · ${petName}` : ''}
          </Text>
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="close" size={22} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* Safety disclaimer — always visible */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            AI-generated booking suggestions. Always confirm availability in the booking wizard.
          </Text>
        </View>

        {/* Quick-action chips — always visible (useful mid-conversation) */}
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
                style={[styles.chip, loading && styles.chipDisabled]}
                onPress={() => handleSend(qa.prompt)}
                disabled={loading}
              >
                <Text style={styles.chipText}>{qa.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

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
                Get help choosing services and times for {petName}
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
                <Text style={styles.bubbleLabel}>BOOKING ADVISOR</Text>
                <SimpleMarkdown text={msg.content} />
              </View>
            )
          )}

          {/* Loading indicator */}
          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={COLORS.sky} />
              <Text style={styles.loadingText}>Thinking about your booking...</Text>
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
              editable={!loading}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={() => handleSend()}
              blurOnSubmit
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!input.trim() || loading) && styles.sendBtnDisabled,
              ]}
              onPress={() => handleSend()}
              disabled={!input.trim() || loading}
            >
              <MaterialIcons
                name="send"
                size={20}
                color={!input.trim() || loading ? COLORS.muted : COLORS.cream}
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
    borderTopColor: COLORS.sky,
    borderRadius: 0,
  },

  // Header bar
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.sky,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    flex: 1,
    color: COLORS.white,
    fontWeight: '900',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginLeft: 8,
  },

  // Disclaimer banner
  disclaimer: {
    backgroundColor: COLORS.infoBg,
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
    borderRadius: 0,
    backgroundColor: COLORS.white,
  },
  chipDisabled: {
    opacity: 0.4,
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
    borderRadius: 0,
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
    borderRadius: 0,
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
    backgroundColor: COLORS.dangerBg,
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
    color: COLORS.textMuted,
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
    borderRadius: 0,
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
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.borderLight,
    borderColor: COLORS.borderLight,
  },
});
