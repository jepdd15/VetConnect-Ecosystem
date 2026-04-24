// ═══════════════════════════════════════════════════════════════
// VetConnect Unified Clinical Design Language
// Single source of truth for all UI tokens across every page.
// ═══════════════════════════════════════════════════════════════

// ── FONT STACK ─────────────────────────────────────────────────
// Inter is loaded via Google Fonts in index.html.
// Roboto is available as an MUI fallback from @fontsource.
export const FONT = "'Inter', 'Roboto', sans-serif";

// ── TYPOGRAPHIC SCALE ──────────────────────────────────────────
// Every text element in VetConnect should reference one of these
// named slots.  Never use ad-hoc fontSize / fontWeight in sx={{}}
// unless building a hyper-specific one-off component.
export const TYPE = {
  /** Section labels: SUBJECTIVE, VITALS, INVENTORY, etc. */
  label:    { fontSize: '0.7rem',   fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' },
  /** Dates, secondary metadata, table sub-text */
  meta:     { fontSize: '0.8rem',   fontWeight: 600 },
  /** Default body text for S.O.A.P. notes, descriptions */
  body:     { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.7 },
  /** Bold body: diagnosis titles, Rx names, form labels */
  bodyBold: { fontSize: '0.875rem', fontWeight: 700, lineHeight: 1.7 },
  /** Vital values: 38.5 °C, 100 bpm, ₱12,500 */
  emphasis: { fontSize: '1rem',     fontWeight: 700 },
  /** Page / card headings */
  heading:  { fontSize: '1.2rem',   fontWeight: 800 },
  /** Tiny badges, NKA tag, record-count pills */
  tiny:     { fontSize: '0.7rem',   fontWeight: 600 },
};

// ── UNIFIED COLOR PALETTE ──────────────────────────────────────
// Semantic grouping: brand → status → data → surfaces → text
export const COLORS = {
  // Brand Identity (warm espresso family)
  brand:       '#3E2723',  // Darkest — headings, sidebar bg
  accent:      '#5D4037',  // Primary brown — titles, actions
  accentLight: '#8D6E63',  // Lighter brown — sub-headings, chart strokes
  accentWarm:  '#8B4513',  // Saddle brown — links, setting accents
  cta:         '#D84315',  // Call-to-action orange — primary buttons
  ctaHover:    '#BF360C',  // CTA hover state

  // Semantic Status Colors (functional, not decorative)
  medical:  '#1565C0',     // Blue — medical service badge
  grooming: '#7B1FA2',     // Purple — grooming service badge
  surgery:  '#C62828',     // Red — surgery badge, danger
  success:  '#2E7D32',     // Green — available, treatment plan, success toast
  warning:  '#E65100',     // Orange — low stock, busy, warnings
  danger:   '#D32F2F',     // Red — out of stock, admin badge, errors
  info:     '#1565C0',     // Blue — informational

  // Data-viz accents (KPI cards use these for backgrounds)
  kpiBlueBg:   '#EFF6FF',   kpiBlueBorder:   '#93C5FD',  // Total items / info
  kpiGreenBg:  '#F0FDF4',   kpiGreenBorder:  '#86EFAC',  // Available / value
  kpiOrangeBg: '#FFF7ED',   kpiOrangeBorder: '#FDBA74',  // Low / busy / warning
  kpiRedBg:    '#FEF2F2',   kpiRedBorder:    '#FCA5A5',  // Out of stock / admin
  kpiPurpleBg: '#F3E8FF',   kpiPurpleBorder: '#D8B4FE',  kpiPurpleText: '#6A1B9A', // Expiring / grooming

  // Surface palette (page backgrounds, cards, panels)
  surface:     '#F5F0EB',   // Main page background (warm neutral)
  surfaceAlt:  '#FAF8F5',   // Sidebar panels, analytics column
  cardBg:      '#FFFFFF',   // Elevated card backgrounds
  panelBg:     '#EFEBE9',   // Accent panels (Section 2 in forms)
  formBg:      '#FAF9F7',   // Form/modal content area

  // Banner
  banner:       '#FFFFFF',
  bannerBorder: '#A1887F',

  // Borders
  border:      '#E0D6CC',   // Default structural borders
  borderLight: '#EDE7E0',   // Subtle inner dividers
  borderInput: '#E0E0E0',   // Form field borders

  // Text
  textPrimary:   '#3E2723', // Headings, important values
  textSecondary: '#795548', // Body text, labels
  textMuted:     '#A1887F', // Placeholder, disabled, timestamps

  // Rx / Treatment / Plan blocks
  rxBg:     '#FFF7ED',  rxBorder: '#FED7AA',  rxText:   '#9A3412',
  planBg:   '#F0FDF4',  planBorder: '#86EFAC', planText: '#166534',
  vitalsBg: '#FAFAF9',

  // Timeline
  timelineRail: '#D7CCC8',

  // Warm surfaces (cream family)
  cream:        '#FFF8E1',  // Warm cream — dialog headers, section bgs, Settings panels
  peach:        '#FFE0B2',  // Light peach — gradient endpoints, warm borders
  amber:        '#FF9800',  // Amber accent — walk-in buttons, dividers

  // Neutral surfaces
  monitorBg:    '#212121',  // Dark bg — Monitor/TV fullscreen mode
  surfaceHover: '#FAFAFA',  // Near-white — hover states, form field bgs
  tableHeaderBg:'#F5F5F5',  // Neutral gray — DataGrid column headers

  // Chip / badge backgrounds
  chipBlueBg:   '#E3F2FD',  // Light blue — department chips, info badges

  // Danger family
  dangerHover:  '#B71C1C',  // Dark red — danger button hover, revoke border
  dangerSurface:'#FFEBEE',  // Light red surface — revoke dialog header/footer

  // Warning family
  warningSurface:'#FFF3E0', // Light orange surface — info/warning boxes
};

// ── NEUBRUTALISM PANEL PRESETS ─────────────────────────────────
// Replaces the old GLASS presets. Zero radius, solid shadows, no blur.
export const PANEL = {
  card: {
    background: COLORS.cardBg,
    border: `2px solid ${COLORS.brand}`,
    boxShadow: `4px 4px 0px ${COLORS.brand}`,
    borderRadius: 0,
  },
  elevated: {
    background: COLORS.cardBg,
    border: `1px solid ${COLORS.border}`,
    boxShadow: `3px 3px 0px ${COLORS.border}`,
    borderRadius: 0,
  },
};

// ── HELPER FUNCTIONS ───────────────────────────────────────────
/** Get record-type color for timeline badges */
export const getRecordColor = (t) => (
  t === 'grooming' ? COLORS.grooming
  : t === 'surgery' ? COLORS.surgery
  : COLORS.medical
);

/** Get a deterministic avatar color from a name string */
export const getInitialColor = (name) => {
  const palette = [COLORS.accent, '#6D4C41', '#795548', COLORS.accentLight, '#A1887F', COLORS.brand];
  return palette[(name || '').charCodeAt(0) % palette.length];
};
