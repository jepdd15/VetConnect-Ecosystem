/**
 * ConsentScreen — Full-screen RA 10173 consent capture screen.
 *
 * Displays the full policy text, requires the user to confirm they have read
 * it, then captures a digital signature (drawn or typed).
 *
 * Navigation params:
 *   consentType      'dpa' | 'waiver'
 *   versionNumber    number
 *   versionDocId     string
 *   policyText       string  — full policy body
 *   policyTitle      string  — display title
 *   isPostRegistration boolean — if true, DECLINE triggers account-deletion warning
 *   previousVersion  number | null — if non-null, this is a re-consent flow
 *   summary          string | null — "what changed" summary for re-consent banner
 */

import {
  useCallback,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth } from '../../firebaseConfig';
import SignatureCanvas from '../components/SignatureCanvas';
import { useConsentSubmit } from '../hooks/useConsentSubmit';
import {
  BUTTON,
  COLORS,
  FONTS,
  FORM_BOX,
  INPUT,
  SHADOW,
  SPACING,
  TYPE,
} from '../theme/mobileTokens';

// ---------------------------------------------------------------------------
// Signature tab identifiers
// ---------------------------------------------------------------------------

const TAB_DRAW = 'draw';
const TAB_TYPE = 'type';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConsentScreen({ navigation, route }) {
  const {
    consentType      = 'dpa',
    versionNumber    = 1,
    versionDocId     = '',
    policyText       = '',
    policyTitle      = 'Consent Policy',
    isPostRegistration = false,
    previousVersion  = null,
    summary          = null,
  } = route.params ?? {};

  const { submitConsent, submitting } = useConsentSubmit();
  const signatureCanvasRef = useRef(null);

  // --- UI state ---------------------------------------------------------------
  const [hasReadPolicy, setHasReadPolicy]       = useState(false);
  const [activeTab, setActiveTab]               = useState(TAB_DRAW);
  const [drawnSignatureData, setDrawnSignatureData] = useState(null);
  const [typedName, setTypedName]               = useState('');
  const [isButtonPressed, setIsButtonPressed]   = useState(false);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const isReConsent   = previousVersion !== null && previousVersion !== versionNumber;
  const buttonLabel   = isReConsent ? 'I ACCEPT THE UPDATED POLICY' : 'I CONSENT';

  const hasSignature  = activeTab === TAB_DRAW
    ? drawnSignatureData !== null
    : typedName.trim().length > 0;

  const canSubmit     = hasReadPolicy && hasSignature && !submitting;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleTabChange(tab) {
    setActiveTab(tab);
    // Clear the opposite signature whenever the user switches tabs
    if (tab === TAB_DRAW) {
      setTypedName('');
    } else {
      setDrawnSignatureData(null);
      signatureCanvasRef.current?.clearSignature();
    }
  }

  function handleDrawnClear() {
    setDrawnSignatureData(null);
    signatureCanvasRef.current?.clearSignature();
  }

  const handleSignatureCapture = useCallback((base64Data) => {
    setDrawnSignatureData(base64Data);
  }, []);

  function handleRequestDrawnSignature() {
    // Ask the WebView to export the current canvas contents.
    // The result arrives asynchronously via handleSignatureCapture.
    signatureCanvasRef.current?.exportSignature();
  }

  async function handleConsent() {
    if (!canSubmit) return;

    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Session Expired', 'Please log in again to continue.');
      return;
    }

    let finalSignatureType = activeTab === TAB_DRAW ? 'drawn' : 'typed';
    let finalSignatureData = activeTab === TAB_DRAW
      ? drawnSignatureData
      : typedName.trim();

    // If the user is on the draw tab but hasn't exported yet, request export
    // and wait — the WebView responds asynchronously so we guard here.
    if (activeTab === TAB_DRAW && !drawnSignatureData) {
      Alert.alert(
        'Signature Required',
        'Please draw your signature on the canvas before consenting.',
      );
      return;
    }

    try {
      await submitConsent({
        userId:        uid,
        consentType,
        versionNumber,
        versionDocId,
        signatureType: finalSignatureType,
        signatureData: finalSignatureData,
      });

      if (isPostRegistration) {
        navigation.replace('ClientDashboard');
      } else {
        navigation.goBack();
      }
    } catch {
      Alert.alert(
        'Submission Failed',
        'Your consent could not be recorded. Please check your connection and try again.',
      );
    }
  }

  function handleDecline() {
    if (isPostRegistration) {
      Alert.alert(
        'Consent Required',
        'You must accept the Data Privacy Policy to use VetConnect. Without consent we cannot process your personal information as required by RA 10173.\n\nWould you like to consent now?',
        [
          { text: 'Consent Now', style: 'default' },
          {
            text: 'Cancel',
            style: 'destructive',
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } else {
      navigation.goBack();
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >

          {/* ---------------------------------------------------------------- */}
          {/* HEADER                                                             */}
          {/* ---------------------------------------------------------------- */}
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={2}>
              {policyTitle}
            </Text>
            <View style={styles.versionBadge}>
              <Text style={styles.versionBadgeText}>VERSION {versionNumber}</Text>
            </View>
          </View>

          {/* ---------------------------------------------------------------- */}
          {/* RE-CONSENT BANNER (shown only when policy was updated)            */}
          {/* ---------------------------------------------------------------- */}
          {isReConsent && (
            <View style={styles.reconsentBanner}>
              <Text style={styles.reconsentBannerTitle}>POLICY UPDATED</Text>
              {summary ? (
                <Text style={styles.reconsentBannerBody}>
                  What changed: {summary}
                </Text>
              ) : (
                <Text style={styles.reconsentBannerBody}>
                  The clinic has published an updated version of this policy.
                  Please review the full text and re-sign below.
                </Text>
              )}
            </View>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* POLICY TEXT                                                        */}
          {/* ---------------------------------------------------------------- */}
          <View style={styles.shadowWrapper}>
            <View style={styles.shadowLayer} />
            <ScrollView
              style={styles.policyBox}
              nestedScrollEnabled
            >
              <Text style={styles.policyText}>{policyText}</Text>
            </ScrollView>
          </View>

          {/* ---------------------------------------------------------------- */}
          {/* READ ACKNOWLEDGEMENT CHECKBOX                                      */}
          {/* ---------------------------------------------------------------- */}
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setHasReadPolicy((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={[
              styles.checkbox,
              hasReadPolicy && styles.checkboxChecked,
            ]}>
              {hasReadPolicy && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>
              I have read and understood the above policy.
            </Text>
          </TouchableOpacity>

          {/* ---------------------------------------------------------------- */}
          {/* SIGNATURE SECTION (enabled only after checkbox)                   */}
          {/* ---------------------------------------------------------------- */}
          <View style={[
            styles.signatureSection,
            !hasReadPolicy && styles.sectionDisabled,
          ]}>
            <Text style={styles.signatureSectionTitle}>YOUR DIGITAL SIGNATURE</Text>

            {/* Tab bar */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[
                  styles.tab,
                  activeTab === TAB_DRAW && styles.tabActive,
                ]}
                onPress={() => handleTabChange(TAB_DRAW)}
                disabled={!hasReadPolicy}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.tabText,
                  activeTab === TAB_DRAW && styles.tabTextActive,
                ]}>
                  DRAW SIGNATURE
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tab,
                  activeTab === TAB_TYPE && styles.tabActive,
                ]}
                onPress={() => handleTabChange(TAB_TYPE)}
                disabled={!hasReadPolicy}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.tabText,
                  activeTab === TAB_TYPE && styles.tabTextActive,
                ]}>
                  TYPE SIGNATURE
                </Text>
              </TouchableOpacity>
            </View>

            {/* Draw tab content */}
            {activeTab === TAB_DRAW && (
              <View style={styles.drawTabContent}>
                <Text style={styles.canvasHint}>
                  Draw your signature below with your finger.
                </Text>
                <SignatureCanvas
                  ref={signatureCanvasRef}
                  onSignatureCapture={handleSignatureCapture}
                  onClear={() => setDrawnSignatureData(null)}
                  height={200}
                />
                <View style={styles.drawActions}>
                  <TouchableOpacity
                    style={styles.clearButton}
                    onPress={handleDrawnClear}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.clearButtonText}>CLEAR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.captureButton,
                      drawnSignatureData !== null && styles.captureButtonDone,
                    ]}
                    onPress={handleRequestDrawnSignature}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.captureButtonText}>
                      {drawnSignatureData !== null ? 'CAPTURED' : 'CAPTURE SIGNATURE'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {drawnSignatureData !== null && (
                  <View style={styles.captureConfirmRow}>
                    <Text style={styles.captureConfirmText}>
                      Signature captured successfully.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Type tab content */}
            {activeTab === TAB_TYPE && (
              <View style={styles.typeTabContent}>
                <Text style={TYPE.label}>Type your full legal name</Text>
                <TextInput
                  style={styles.nameInput}
                  value={typedName}
                  onChangeText={setTypedName}
                  placeholder="Your Full Name"
                  placeholderTextColor={COLORS.placeholder}
                  autoCapitalize="words"
                  returnKeyType="done"
                />
                {typedName.trim().length > 0 && (
                  <View style={styles.typedNamePreview}>
                    <Text style={styles.typedNameDisplay}>{typedName.trim()}</Text>
                    <Text style={styles.typedNameDivider}>____________________________</Text>
                    <Text style={styles.typedSignatureDisclaimer}>
                      By typing your name above, you agree that this constitutes
                      your legally binding digital signature under Philippine law.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ---------------------------------------------------------------- */}
          {/* CONSENT BUTTON                                                     */}
          {/* ---------------------------------------------------------------- */}
          <View style={styles.buttonWrapper}>
            <View style={[
              styles.buttonShadow,
              (!canSubmit) && styles.buttonShadowDisabled,
            ]} />
            <Pressable
              style={({ pressed }) => [
                styles.consentButton,
                pressed && canSubmit && BUTTON.pressed,
                (!canSubmit) && styles.consentButtonDisabled,
                isButtonPressed && canSubmit && BUTTON.pressed,
              ]}
              onPressIn={() => setIsButtonPressed(true)}
              onPressOut={() => setIsButtonPressed(false)}
              onPress={handleConsent}
              disabled={!canSubmit}
            >
              <Text style={[
                styles.consentButtonText,
                (!canSubmit) && styles.consentButtonTextDisabled,
              ]}>
                {submitting ? 'SUBMITTING...' : buttonLabel}
              </Text>
            </Pressable>
          </View>

          {/* ---------------------------------------------------------------- */}
          {/* DECLINE LINK                                                       */}
          {/* ---------------------------------------------------------------- */}
          <TouchableOpacity
            style={styles.declineLink}
            onPress={handleDecline}
            activeOpacity={0.7}
          >
            <Text style={styles.declineLinkText}>DECLINE</Text>
          </TouchableOpacity>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.screenPadding,
    paddingBottom: 40,
  },

  // --- Header ---------------------------------------------------------------
  header: {
    marginBottom: SPACING.gap.lg,
  },
  headerTitle: {
    ...TYPE.sectionTitle,
    fontSize: 22,
    lineHeight: 28,
    marginBottom: SPACING.gap.sm,
  },
  versionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.brand,
    paddingHorizontal: SPACING.gap.md,
    paddingVertical: SPACING.gap.xs,
    borderWidth: 2,
    borderColor: COLORS.brand,
  },
  versionBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.white,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // --- Re-consent banner ----------------------------------------------------
  reconsentBanner: {
    backgroundColor: COLORS.warning,
    borderWidth: 3,
    borderColor: COLORS.brand,
    padding: SPACING.gap.md,
    marginBottom: SPACING.gap.lg,
  },
  reconsentBannerTitle: {
    fontFamily: FONTS.black,
    fontSize: 14,
    color: COLORS.white,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: SPACING.gap.xs,
  },
  reconsentBannerBody: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.white,
    lineHeight: 18,
  },

  // --- Policy text box ------------------------------------------------------
  shadowWrapper: {
    position: 'relative',
    marginBottom: SPACING.gap.xl,
  },
  shadowLayer: {
    ...SHADOW.form,
  },
  policyBox: {
    ...FORM_BOX,
    maxHeight: 320,
    overflow: 'hidden',
  },
  policyText: {
    ...TYPE.body,
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.textPrimary,
  },

  // --- Acknowledgement checkbox ---------------------------------------------
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.gap.lg,
    gap: SPACING.gap.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: COLORS.sky,
    borderColor: COLORS.brand,
  },
  checkmark: {
    color: COLORS.brand,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  checkboxLabel: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.textPrimary,
    flex: 1,
    lineHeight: 20,
  },

  // --- Signature section ----------------------------------------------------
  signatureSection: {
    marginBottom: SPACING.gap.xl,
  },
  sectionDisabled: {
    opacity: 0.4,
  },
  signatureSectionTitle: {
    ...TYPE.label,
    marginBottom: SPACING.gap.md,
  },

  // --- Tab bar --------------------------------------------------------------
  tabBar: {
    flexDirection: 'row',
    borderWidth: 2,
    borderColor: COLORS.brand,
    marginBottom: SPACING.gap.md,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  tabActive: {
    backgroundColor: COLORS.brand,
  },
  tabText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.textPrimary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tabTextActive: {
    color: COLORS.white,
  },

  // --- Draw tab -------------------------------------------------------------
  drawTabContent: {
    borderWidth: 2,
    borderColor: COLORS.border,
    padding: SPACING.gap.md,
    backgroundColor: COLORS.white,
  },
  canvasHint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: SPACING.gap.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  drawActions: {
    flexDirection: 'row',
    gap: SPACING.gap.sm,
    marginTop: SPACING.gap.sm,
  },
  clearButton: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.cream,
  },
  clearButtonText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.textPrimary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  captureButton: {
    flex: 2,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.sky,
  },
  captureButtonDone: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  captureButtonText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.white,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  captureConfirmRow: {
    marginTop: SPACING.gap.xs,
  },
  captureConfirmText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // --- Type tab -------------------------------------------------------------
  typeTabContent: {
    borderWidth: 2,
    borderColor: COLORS.border,
    padding: SPACING.gap.md,
    backgroundColor: COLORS.white,
  },
  nameInput: {
    ...INPUT,
    marginBottom: SPACING.gap.md,
  },
  typedNamePreview: {
    paddingTop: SPACING.gap.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    alignItems: 'center',
  },
  typedNameDisplay: {
    fontFamily: FONTS.regular,        // Closest available to a script/cursive style
    fontSize: 28,
    color: COLORS.brand,
    fontStyle: 'italic',
    letterSpacing: 1,
    marginBottom: SPACING.gap.xs,
  },
  typedNameDivider: {
    fontFamily: FONTS.regular,
    fontSize: 16,
    color: COLORS.accentLight,
    letterSpacing: 4,
    marginBottom: SPACING.gap.sm,
  },
  typedSignatureDisclaimer: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: SPACING.gap.sm,
  },

  // --- Consent button -------------------------------------------------------
  buttonWrapper: {
    position: 'relative',
    marginBottom: SPACING.gap.md,
  },
  buttonShadow: {
    ...SHADOW.button,
  },
  buttonShadowDisabled: {
    backgroundColor: COLORS.borderLight,
  },
  consentButton: {
    ...BUTTON.base,
    backgroundColor: COLORS.sky,
  },
  consentButtonDisabled: {
    backgroundColor: COLORS.borderLight,
    borderColor: COLORS.muted,
  },
  consentButtonText: {
    ...TYPE.button,
    fontSize: 16,
  },
  consentButtonTextDisabled: {
    color: COLORS.muted,
  },

  // --- Decline link ---------------------------------------------------------
  declineLink: {
    alignItems: 'center',
    paddingVertical: SPACING.gap.md,
  },
  declineLinkText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.danger,
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  bottomSpacer: {
    height: 20,
  },
});
