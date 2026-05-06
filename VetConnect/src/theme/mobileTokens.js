// ===============================================================
// VetConnect Mobile Design Tokens
// Single source of truth for all mobile UI tokens.
// Uses React Native StyleSheet patterns (no CSS boxShadow).
// ===============================================================

// -- COLORS -----------------------------------------------------
// Mirrors admin COLORS for brand consistency, scoped to mobile needs.
export const COLORS = {
  // Brand Identity
  brand:       '#3E2723',  // Darkest espresso -- headers, borders, shadows
  accent:      '#5D4037',  // Primary brown -- titles, form shadows
  accentLight: '#8D6E63',  // Lighter brown -- subtitles, secondary text
  sky:         '#3ABEF9',  // Sky blue -- primary CTA, links, active states
  danger:      '#D32F2F',  // Red -- destructive actions, alerts, emergency

  // Status
  success:     '#2E7D32',  // Green -- confirmed, available
  warning:     '#E65100',  // Orange -- pending, caution
  warningBg:   '#FFF3E0',  // Light orange -- banners, case headers
  dangerBg:    '#FFEBEE',  // Danger-tinted surface -- cancel, refund, reason
  successBg:   '#E8F5E9',  // Success-tinted surface -- confirm
  infoBg:      '#E3F2FD',  // Sky-tinted surface -- reschedule
  info:        '#1565C0',  // Blue -- informational badges

  // Surfaces
  cream:       '#FFF8E1',  // Warm cream -- screen background
  white:       '#FFFFFF',  // Card background
  muted:       '#A1887F',  // Placeholder text, disabled states

  // Text
  textPrimary:   '#3E2723',
  textSecondary: '#5D4037',
  textMuted:     '#8D6E63',
  textOnSky:     '#3E2723',  // Text on sky-blue buttons (dark for contrast)

  // Borders
  border:      '#3E2723',  // Primary border (neubrutalist thick borders)
  borderLight: '#D7CCC8',  // Subtle dividers

  // Input
  inputBg:     '#FFFFFF',
  inputBorder: '#3E2723',
  placeholder: '#999999',
};

// -- TYPOGRAPHY -------------------------------------------------
// Font families reference the Inter font loaded via expo-font in App.js.
export const FONTS = {
  black:    'Inter_900Black',
  bold:     'Inter_700Bold',
  regular:  'Inter_400Regular',
};

export const TYPE = {
  /** Screen title: 48px, black weight, uppercase */
  screenTitle: {
    fontFamily: FONTS.black,
    fontSize: 48,
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: -1,
    lineHeight: 48,
  },
  /** Section header: 24px, black weight */
  sectionTitle: {
    fontFamily: FONTS.black,
    fontSize: 24,
    color: COLORS.brand,
  },
  /** Subtitle / sub-header: 13-15px, bold, uppercase, spaced */
  subtitle: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  /** Form label: 13px, black weight, uppercase */
  label: {
    fontWeight: '900',
    color: COLORS.brand,
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  /** Body text */
  body: {
    fontFamily: FONTS.regular,
    fontSize: 16,
    color: '#333333',
  },
  /** Bold body / card title */
  bodyBold: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.brand,
  },
  /** Button text: 20px, black weight, uppercase, tracked */
  button: {
    color: COLORS.textOnSky,
    fontWeight: '900',
    fontSize: 20,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  /** Link text: bold, sky blue, uppercase, underlined */
  link: {
    fontFamily: FONTS.black,
    color: COLORS.sky,
    fontSize: 14,
    textTransform: 'uppercase',
    textDecorationLine: 'underline',
  },
  /** Small metadata / caption */
  meta: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
};

// -- SPACING ----------------------------------------------------
export const SPACING = {
  screenPadding: 20,
  cardPadding: 25,
  inputPadding: 16,
  gap: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
};

// -- NEUBRUTALISM SHADOWS ---------------------------------------
// React Native cannot do CSS box-shadow. The VetConnect mobile
// neubrutalism system uses a positioned View behind the content View.
// These helpers return style objects for each role.

/** Shadow layer: position absolute behind its sibling, offset +N px */
export const SHADOW = {
  /** Standard form/card shadow: +8px offset, accent brown */
  form: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: -8,
    bottom: -8,
    backgroundColor: COLORS.accent,
  },
  /** Button shadow: +6px offset, brand espresso */
  button: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.brand,
  },
  /** Small card shadow: +4px offset, brand espresso */
  card: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: COLORS.brand,
  },
  /** Record card shadow: +3px offset, brand espresso */
  record: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: -3,
    bottom: -3,
    backgroundColor: COLORS.brand,
  },
  /** Icon container shadow: +6px offset */
  icon: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.accent,
  },
};

// -- COMPONENT PRESETS ------------------------------------------
// Common style patterns extracted from LoginScreen/RegisterScreen/ClientDashboard.

/** Neubrutalist input field */
export const INPUT = {
  fontFamily: FONTS.regular,
  backgroundColor: COLORS.inputBg,
  borderRadius: 0,
  padding: SPACING.inputPadding,
  fontSize: 16,
  marginBottom: 15,
  color: '#333333',
  borderWidth: 2,
  borderColor: COLORS.inputBorder,
};

/** Neubrutalist primary button (sky blue) */
export const BUTTON = {
  base: {
    backgroundColor: COLORS.sky,
    padding: 18,
    borderRadius: 0,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.brand,
  },
  pressed: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
};

/** Neubrutalist form container (white box with thick border) */
export const FORM_BOX = {
  backgroundColor: COLORS.white,
  padding: SPACING.cardPadding,
  borderRadius: 0,
  borderWidth: 3,
  borderColor: COLORS.brand,
};

/** Password field container */
export const PASSWORD_CONTAINER = {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: COLORS.inputBg,
  borderRadius: 0,
  marginBottom: 15,
  borderWidth: 2,
  borderColor: COLORS.inputBorder,
};
