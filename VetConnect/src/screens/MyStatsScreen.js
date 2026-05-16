/**
 * MyStatsScreen — dedicated stats hub for the pet owner.
 *
 * Sections (Day 1):
 *   1. YOUR RELATIONSHIP — loyalty KPIs, profile completeness, consent status
 *   2. VISIT TRENDS — 6-month bar chart lifted from ClientDashboard
 *   3. YOUR PETS — per-pet health cards (weight sparkline, vaccines, meds,
 *                  allergies, recheck countdown, diagnosis history)
 *
 * Data arrives as route.params passed from ClientDashboard — no new Firestore
 * listeners are opened here. Per-pet enrichment is handled by useMyStats.
 */

import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Alert,
  Dimensions,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { LineChart as GiftedLineChart } from 'react-native-gifted-charts';
import { Circle, Path, Svg } from 'react-native-svg';
import { MaterialIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { COLORS, FONTS, SHADOW, SPACING } from '../theme/mobileTokens';
import { useMyStats } from '../hooks/useMyStats';
import VitalsZoomModal from '../components/VitalsZoomModal';

// Enable LayoutAnimation on Android (must run after all imports).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── LAYOUT ──────────────────────────────────────────────────────────────────
const SCREEN_W = Dimensions.get('window').width;

// ─── LOCAL SUB-COMPONENTS ──────────────────────────────────────────────────────

/**
 * KPICard — neubrutalist stat tile: solid offset shadow, thick border.
 *
 * accent: 'danger' | 'success' | 'warning' | undefined (defaults to brand espresso)
 */
function KPICard({ label, value, subtitle, accent, small, wide }) {
  const accentColor = accent === 'danger'  ? COLORS.danger
    : accent === 'success'                 ? COLORS.success
    : accent === 'warning'                 ? COLORS.warning
    : COLORS.brand;

  return (
    <View style={[styles.kpiWrapper, wide && styles.kpiWrapperWide]}>
      <View style={[styles.kpiShadow, { backgroundColor: accentColor }]} />
      <View style={styles.kpiCard}>
        <Text style={[
          styles.kpiValue,
          small && styles.kpiValueSmall,
          accent && { color: accentColor },
        ]}>
          {value}
        </Text>
        <Text style={styles.kpiLabel}>{label}</Text>
        {subtitle ? <Text style={styles.kpiSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

/**
 * SectionHeader — uppercase label row with consistent spacing used between
 * every major section. Accepts an optional style override (e.g. to suppress
 * bottom margin when rendered inside a sectionHeaderRow flex container).
 */
function SectionHeader({ title, style }) {
  return <Text style={[styles.sectionHeader, style]}>{title}</Text>;
}

/**
 * CtaButton — sky-blue action button with press-snap animation, zero
 * border-radius. Used for BOOK NOW / BOOK RECHECK CTAs.
 */
function CtaButton({ label, onPress, danger }) {
  return (
    <View style={styles.ctaWrapper}>
      <View style={[styles.ctaShadow, { backgroundColor: danger ? COLORS.danger : COLORS.brand }]} />
      <Pressable
        style={({ pressed }) => [
          styles.ctaButton,
          { backgroundColor: danger ? COLORS.danger : COLORS.sky },
          pressed && styles.ctaButtonPressed,
        ]}
        onPress={onPress}
      >
        <Text style={[styles.ctaText, danger && { color: COLORS.white }]}>{label}</Text>
      </Pressable>
    </View>
  );
}

/**
 * CircularGauge — SVG progress ring used in pet vaccine rows.
 *
 * Renders a background ring and a foreground arc whose length is proportional to
 * the administered/total ratio. The arc starts at 12 o'clock via a -90° rotation.
 * Color thresholds: green >80%, orange 50-80%, red <50%.
 */
function CircularGauge({ administered, total, size = 56 }) {
  const pct = total > 0 ? administered / total : 0;
  const color = pct > 0.8 ? COLORS.success : pct >= 0.5 ? COLORS.warning : COLORS.danger;
  const radius = (size - 8) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * pct;
  const gapLength = circumference - arcLength;

  return (
    <View style={useMemo(() => ({ width: size, height: size, alignItems: 'center', justifyContent: 'center' }), [size])}>
      <Svg width={size} height={size}>
        {/* Background ring */}
        <Circle
          cx={cx} cy={cy} r={radius}
          stroke={COLORS.borderLight}
          strokeWidth={4}
          fill="none"
        />
        {/* Foreground arc — rotate -90° so arc starts at 12 o'clock */}
        <Circle
          cx={cx} cy={cy} r={radius}
          stroke={color}
          strokeWidth={4}
          fill="none"
          strokeDasharray={`${arcLength} ${gapLength}`}
          strokeLinecap="butt"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>
      <Text style={{
        position: 'absolute',
        fontFamily: FONTS.black,
        fontSize: 12,
        color: COLORS.brand,
      }}>
        {administered}/{total}
      </Text>
    </View>
  );
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TAB_CONFIG = [
  { key: 'overview', label: 'OVERVIEW', icon: 'dashboard'                  },
  { key: 'visits',   label: 'VISITS',   icon: 'event'                      },
  { key: 'spending', label: 'SPENDING', icon: 'account-balance-wallet'     },
  { key: 'health',   label: 'HEALTH',   icon: 'favorite'                   },
];

/** Range options for the spending date selector. */
const SPENDING_RANGE_OPTIONS = [
  { key: '6m',  label: '6 MONTHS'  },
  { key: 'ytd', label: 'THIS YEAR' },
  { key: 'ly',  label: 'LAST YEAR' },
  { key: 'all', label: 'ALL TIME'  },
];

// Chart colors for PieChart slices — cycles through 6 semantic tokens.
const PIE_COLORS = [
  COLORS.sky,
  COLORS.success,
  COLORS.warning,
  COLORS.danger,
  COLORS.accent,
  COLORS.accentLight,
];

/**
 * PieChart — SVG donut chart for visit type breakdown.
 *
 * Renders one arc Path per data slice. When there is only one slice, renders a
 * full Circle instead of an arc (SVG arcs cannot represent 360 degrees).
 * A legend row per category is rendered below.
 */
function PieChart({ data, size = 160 }) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 6;
  const innerR = outerR * 0.55; // donut hole

  // Build cumulative angles from the pct values.
  let cumulativeAngle = -Math.PI / 2; // start at 12 o'clock

  const slices = data.map((entry, idx) => {
    const startAngle = cumulativeAngle;
    const sweep = entry.pct * 2 * Math.PI;
    cumulativeAngle += sweep;
    return { ...entry, startAngle, sweep, color: PIE_COLORS[idx % PIE_COLORS.length] };
  });

  /** Build an SVG arc path string for a donut slice. */
  function slicePath(startAngle, sweep) {
    const endAngle = startAngle + sweep;
    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);
    const large = sweep > Math.PI ? 1 : 0;
    return [
      `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      `A ${outerR} ${outerR} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      `L ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
      `A ${innerR} ${innerR} 0 ${large} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
      'Z',
    ].join(' ');
  }

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {data.length === 1 ? (
          // Single-slice: full ring — SVG arcs cannot represent 360°
          <>
            <Circle cx={cx} cy={cy} r={outerR} fill={PIE_COLORS[0]} />
            <Circle cx={cx} cy={cy} r={innerR} fill={COLORS.white} />
          </>
        ) : (
          slices.map((slice, idx) => (
            <Path
              key={idx}
              d={slicePath(slice.startAngle, slice.sweep)}
              fill={slice.color}
            />
          ))
        )}
      </Svg>

      {/* Legend */}
      <View style={styles.pieLegend}>
        {slices.map((slice, idx) => (
          <View key={idx} style={styles.pieLegendRow}>
            <View style={[styles.pieLegendDot, { backgroundColor: slice.color }]} />
            <Text style={styles.pieLegendLabel}>
              {slice.name}{' '}
              <Text style={styles.pieLegendCount}>
                {Math.round(slice.pct * 100)}% ({slice.count} visit{slice.count !== 1 ? 's' : ''})
              </Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * SpendingPieChart — identical to PieChart but legend rows show currency
 * amounts (P{count.toLocaleString()}) instead of visit counts.
 */
function SpendingPieChart({ data, size = 160 }) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 6;
  const innerR = outerR * 0.55;

  let cumulativeAngle = -Math.PI / 2;
  const slices = data.map((entry, idx) => {
    const startAngle = cumulativeAngle;
    const sweep = entry.pct * 2 * Math.PI;
    cumulativeAngle += sweep;
    return { ...entry, startAngle, sweep, color: PIE_COLORS[idx % PIE_COLORS.length] };
  });

  function slicePath(startAngle, sweep) {
    const endAngle = startAngle + sweep;
    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);
    const large = sweep > Math.PI ? 1 : 0;
    return [
      `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      `A ${outerR} ${outerR} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      `L ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
      `A ${innerR} ${innerR} 0 ${large} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
      'Z',
    ].join(' ');
  }

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {data.length === 1 ? (
          <>
            <Circle cx={cx} cy={cy} r={outerR} fill={PIE_COLORS[0]} />
            <Circle cx={cx} cy={cy} r={innerR} fill={COLORS.white} />
          </>
        ) : (
          slices.map((slice, idx) => (
            <Path
              key={idx}
              d={slicePath(slice.startAngle, slice.sweep)}
              fill={slice.color}
            />
          ))
        )}
      </Svg>
      <View style={styles.pieLegend}>
        {slices.map((slice, idx) => (
          <View key={idx} style={styles.pieLegendRow}>
            <View style={[styles.pieLegendDot, { backgroundColor: slice.color }]} />
            <Text style={styles.pieLegendLabel}>
              {slice.name}{' '}
              <Text style={styles.pieLegendCount}>
                {Math.round(slice.pct * 100)}% (P{slice.count.toLocaleString()})
              </Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── SCREEN ───────────────────────────────────────────────────────────────────

export default function MyStatsScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const {
    allAppointments = [],
    userPets        = [],
    petRecords      = {},
    salesData       = [],
    vaccineAlerts   = [],
    userProfile     = null,
  } = route.params ?? {};

  // ── LOCAL STATE ─────────────────────────────────────────────────────────────
  const [activeTab,      setActiveTab]      = useState('overview');
  const [spendingRange,  setSpendingRange]  = useState('6m');
  const [expandedPet,    setExpandedPet]    = useState(null);
  // weightZoomPet holds { petCard } when the weight zoom modal is open, null when closed.
  const [weightZoomPet,  setWeightZoomPet]  = useState(null);
  // calendarMonth tracks the displayed month in the mini-view (controlled by arrows).
  const [calendarMonth,  setCalendarMonth]  = useState(new Date());
  // selectedCalendarDay: 'YYYY-MM-DD' string or null — filters the appointment list.
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(null);

  // VISITS tab toggles (Step 10)
  const [visitTimeGrouping,   setVisitTimeGrouping]   = useState('monthly');
  const [visitBreakdownMode,  setVisitBreakdownMode]  = useState('total');

  // YoY section toggle: 'visits' | 'spending' (Step 14)
  const [yoyMode, setYoyMode] = useState('visits');

  // Seasonal pattern per-pet filter (Step 16)
  const [seasonalPetFilter, setSeasonalPetFilter] = useState('all');

  // SPENDING tab toggles (Step 17)
  const [spendingTimeGrouping,  setSpendingTimeGrouping]  = useState('monthly');
  const [spendingBreakdownMode, setSpendingBreakdownMode] = useState('total');

  const stats = useMyStats({
    allAppointments,
    userPets,
    petRecords,
    salesData,
    vaccineAlerts,
    userProfile,
    spendingRange,
    activeTab,
  });

  const {
    visitStats,
    financialStats,
    monthlyVisitData,
    relationship,
    petCards,
    spendingBreakdown,
    visitTypePieData,
    upcomingAppointments,
    preventiveCare,
    yoyVisitData,
    yoySpendingData,
    seasonalPattern,
    perPetSeasonalPattern,
    conditionsOverview,
    calendarDots,
    weeklyVisitData,
    visitsByPet,
    visitsByService,
    visitsByDepartment,
    visitFrequencyTrend,
    visitOutcomes,
    preferredDays,
    speciesDistribution,
    weeklySpendingData,
    spendingByDepartment,
    spendingPerVisit,
  } = stats;

  // ── HELPERS ─────────────────────────────────────────────────────────────────

  function navigateToBookAppointment(prefillPetId) {
    navigation.navigate('BookAppointment', { prefillPetId });
  }

  /** Toggle per-pet spending drill-down with a smooth height animation. */
  function handleTogglePet(petName) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedPet(prev => (prev === petName ? null : petName));
  }

  /**
   * Generates a tab-specific HTML summary and shares it as a PDF file.
   * Each tab produces a focused, print-friendly inline-styled table report.
   */
  async function handleExportTab(tabKey) {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    try {
      let html = '';
      const baseStyle = `
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #3E2723; }
          h1 { font-size: 20px; text-transform: uppercase; letter-spacing: 2px; border-bottom: 3px solid #3E2723; padding-bottom: 8px; }
          h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #5D4037; margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th { background: #3E2723; color: #FFF8E1; font-size: 11px; text-transform: uppercase; padding: 8px; text-align: left; }
          td { border-bottom: 1px solid #ddd; padding: 8px; font-size: 12px; }
          tr:nth-child(even) td { background: #FFF8E1; }
          .badge-danger { color: #D32F2F; font-weight: bold; }
          .badge-success { color: #388E3C; font-weight: bold; }
          .badge-warning { color: #F57F17; font-weight: bold; }
          .summary { font-size: 13px; margin: 4px 0; }
        </style>
      `;

      if (tabKey === 'overview') {
        const totalSpent = Math.round(financialStats?.totalSpent ?? 0).toLocaleString();
        const avgPerVisit = financialStats?.avgPerVisit > 0
          ? `P${financialStats.avgPerVisit.toLocaleString()}`
          : '—';
        const followUp = relationship.followUpCompliance
          ? `${relationship.followUpCompliance.attended}/${relationship.followUpCompliance.due} (${relationship.followUpCompliance.pct}%)`
          : '—';

        const upcomingRows = upcomingAppointments.map(a =>
          `<tr><td>${esc(a.serviceNames.join(', '))}</td><td>${esc(a.petName)}</td><td>${
            a.scheduledDate.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
          }</td><td>${esc(a.countdown)}</td></tr>`
        ).join('');

        const conditionRows = conditionsOverview.hasData
          ? Object.entries(conditionsOverview.perPet).map(([petName, conds]) =>
              conds.map(c =>
                `<tr><td>${esc(petName)}</td><td>${esc(c.name)}</td><td class="${c.status === 'active' ? 'badge-danger' : 'badge-warning'}">${c.status.toUpperCase()}</td></tr>`
              ).join('')
            ).join('')
          : '<tr><td colspan="3">No active conditions recorded.</td></tr>';

        html = `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyle}</head><body>
          <h1>Overview — VetConnect Pet Health Summary</h1>
          <p class="summary">Generated: ${new Date().toLocaleDateString('en-PH', { dateStyle: 'long' })}</p>
          <h2>Relationship KPIs</h2>
          <table>
            <tr><th>Metric</th><th>Value</th></tr>
            <tr><td>Client Since</td><td>${relationship.clientSince}</td></tr>
            <tr><td>Total Visits</td><td>${visitStats?.totalVisits ?? 0}</td></tr>
            <tr><td>Lifetime Spend</td><td>P${totalSpent}</td></tr>
            <tr><td>Avg Per Visit</td><td>${avgPerVisit}</td></tr>
            <tr><td>Follow-Up Compliance</td><td>${followUp}</td></tr>
            <tr><td>No-Shows</td><td>${visitStats?.noShowCount ?? 0}</td></tr>
          </table>
          <h2>Upcoming Appointments</h2>
          <table>
            <tr><th>Service</th><th>Pet</th><th>Date</th><th>Countdown</th></tr>
            ${upcomingRows || '<tr><td colspan="4">No upcoming appointments.</td></tr>'}
          </table>
          <h2>Active Conditions</h2>
          <table>
            <tr><th>Pet</th><th>Condition</th><th>Status</th></tr>
            ${conditionRows}
          </table>
        </body></html>`;

      } else if (tabKey === 'visits') {
        const monthRows = (yoyVisitData.months || []).map(m =>
          `<tr><td>${m.label}</td><td>${m.thisYear}</td><td>${m.lastYear}</td></tr>`
        ).join('');

        html = `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyle}</head><body>
          <h1>Visit History — VetConnect</h1>
          <p class="summary">Generated: ${new Date().toLocaleDateString('en-PH', { dateStyle: 'long' })}</p>
          <h2>Summary</h2>
          <table>
            <tr><th>Metric</th><th>Value</th></tr>
            <tr><td>Total Completed Visits</td><td>${visitStats?.totalVisits ?? 0}</td></tr>
            <tr><td>No-Shows</td><td>${visitStats?.noShowCount ?? 0}</td></tr>
            <tr><td>Visit Frequency</td><td>${visitStats?.avgFrequency ?? '—'}</td></tr>
          </table>
          <h2>Monthly Visits — Year Over Year</h2>
          <table>
            <tr><th>Month</th><th>${yoyVisitData.thisYearLabel || 'This Year'}</th><th>${yoyVisitData.lastYearLabel || 'Last Year'}</th></tr>
            ${monthRows || '<tr><td colspan="3">No data available.</td></tr>'}
          </table>
        </body></html>`;

      } else if (tabKey === 'spending') {
        const petRows = (spendingBreakdown.perPetList || []).map(row =>
          `<tr><td>${esc(row.name)}</td><td>P${Math.round(row.amount).toLocaleString()}</td></tr>`
        ).join('');
        const svcRows = (spendingBreakdown.perServiceList || []).map(row =>
          `<tr><td>${esc(row.type)}</td><td>P${Math.round(row.amount).toLocaleString()}</td></tr>`
        ).join('');
        const balanceClass = spendingBreakdown.outstandingBalance > 0 ? 'badge-danger' : 'badge-success';
        const balanceText = spendingBreakdown.outstandingBalance > 0
          ? `P${Math.round(spendingBreakdown.outstandingBalance).toLocaleString()} outstanding`
          : 'P0 — all clear';

        html = `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyle}</head><body>
          <h1>Spending Report — VetConnect</h1>
          <p class="summary">Generated: ${new Date().toLocaleDateString('en-PH', { dateStyle: 'long' })}</p>
          <p class="summary">Outstanding Balance: <span class="${balanceClass}">${balanceText}</span></p>
          <h2>Spending by Pet</h2>
          <table>
            <tr><th>Pet</th><th>Amount</th></tr>
            ${petRows || '<tr><td colspan="2">No data for this period.</td></tr>'}
          </table>
          <h2>Spending by Service Type</h2>
          <table>
            <tr><th>Service</th><th>Amount</th></tr>
            ${svcRows || '<tr><td colspan="2">No data for this period.</td></tr>'}
          </table>
          ${spendingPerVisit.average > 0 ? `<h2>Average Spend Per Visit</h2><p class="summary"><strong>P${spendingPerVisit.average.toLocaleString()}/visit</strong></p>` : ''}
        </body></html>`;

      } else if (tabKey === 'pets') {
        const petRows = petCards.map(pc => {
          const vaccPct = pc.vaccineStatus?.completeness?.percentage ?? null;
          const vaccText = vaccPct !== null
            ? `${pc.vaccineStatus.completeness.administered}/${pc.vaccineStatus.completeness.total} (${vaccPct}%)`
            : '—';
          const lastVisit = pc.lastVisitDate
            ? pc.lastVisitDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
            : '—';
          return `<tr>
            <td>${pc.speciesEmoji} ${esc(pc.name)}</td>
            <td>${esc(pc.species) || '—'}</td>
            <td>${pc.latestWeight != null ? `${pc.latestWeight} kg` : '—'}</td>
            <td>${lastVisit}</td>
            <td class="${vaccPct != null && vaccPct >= 75 ? 'badge-success' : vaccPct != null && vaccPct >= 50 ? 'badge-warning' : 'badge-danger'}">${vaccText}</td>
            <td>${pc.activeMeds.length > 0 ? pc.activeMeds.length + ' active' : 'None'}</td>
          </tr>`;
        }).join('');

        html = `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyle}</head><body>
          <h1>Pet Summary — VetConnect</h1>
          <p class="summary">Generated: ${new Date().toLocaleDateString('en-PH', { dateStyle: 'long' })}</p>
          <h2>All Pets (${petCards.length})</h2>
          <table>
            <tr><th>Pet</th><th>Species</th><th>Weight</th><th>Last Visit</th><th>Vaccines</th><th>Medications</th></tr>
            ${petRows || '<tr><td colspan="6">No pets registered.</td></tr>'}
          </table>
        </body></html>`;

      } else if (tabKey === 'health') {
        const careRows = preventiveCare.map(item =>
          `<tr>
            <td>${esc(item.petName)}</td>
            <td>${esc(item.label)}</td>
            <td class="${item.urgency === 0 ? 'badge-danger' : item.urgency === 1 ? 'badge-warning' : ''}">${esc(item.detail) || ''}</td>
          </tr>`
        ).join('');

        const vaccRows = petCards.map(pc => {
          if (!pc.vaccineStatus?.statuses) return '';
          const statusRows = pc.vaccineStatus.statuses.map(v =>
            `<tr>
              <td>${pc.speciesEmoji} ${esc(pc.name)}</td>
              <td>${esc(v.name)}</td>
              <td class="${v.status === 'overdue' ? 'badge-danger' : v.status === 'current' ? 'badge-success' : v.status === 'due_soon' ? 'badge-warning' : ''}">${
                v.status === 'overdue'
                  ? `OVERDUE (${Math.abs(v.daysUntilDue)} days)`
                  : v.status === 'current' ? 'Current'
                  : v.status === 'due_soon' ? `Due in ${v.daysUntilDue} days`
                  : 'No record'
              }</td>
            </tr>`
          ).join('');
          return statusRows;
        }).join('');

        html = `<!DOCTYPE html><html><head><meta charset="utf-8">${baseStyle}</head><body>
          <h1>Health Report — VetConnect</h1>
          <p class="summary">Generated: ${new Date().toLocaleDateString('en-PH', { dateStyle: 'long' })}</p>
          <h2>Preventive Care Action Items</h2>
          <table>
            <tr><th>Pet</th><th>Item</th><th>Detail</th></tr>
            ${careRows || '<tr><td colspan="3">All care is up to date!</td></tr>'}
          </table>
          <h2>Vaccination Status</h2>
          <table>
            <tr><th>Pet</th><th>Vaccine</th><th>Status</th></tr>
            ${vaccRows || '<tr><td colspan="3">No vaccine records.</td></tr>'}
          </table>
        </body></html>`;
      }

      if (!html) return;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch (err) {
      Alert.alert('Export failed', err.message || 'Could not generate report.');
    }
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── TAB BAR — icon + stacked label per tab (Option A) ───────────── */}
      <View style={styles.tabBar}>
        {TAB_CONFIG.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name={tab.icon}
                size={20}
                color={isActive ? COLORS.sky : COLORS.textMuted}
              />
              <Text style={[
                styles.tabLabel,
                isActive && styles.tabLabelActive,
              ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ══════════════════════════════════════════════════════════════════
          OVERVIEW TAB
          ════════════════════════════════════════════════════════════════ */}

      {/* ── SECTION 1 — YOUR RELATIONSHIP (overview) ────────────────────── */}
      {activeTab === 'overview' && (
      <>
      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 — YOUR RELATIONSHIP
          ════════════════════════════════════════════════════════════════ */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <SectionHeader title="YOUR RELATIONSHIP" style={styles.sectionHeaderNoMargin} />
          <TouchableOpacity
            onPress={() => handleExportTab('overview')}
            style={styles.exportButton}
            activeOpacity={0.7}
          >
            <MaterialIcons name="file-download" size={18} color={COLORS.accentLight} />
          </TouchableOpacity>
        </View>

        {/* 2-column KPI grid */}
        <View style={styles.statsGrid}>
          <KPICard
            label="CLIENT SINCE"
            value={relationship.clientSince}
            small
          />
          <KPICard
            label="COMPLETED VISITS"
            value={visitStats.totalVisits}
          />
          <KPICard
            label="AVG PER VISIT"
            value={financialStats.avgPerVisit > 0
              ? `P${financialStats.avgPerVisit.toLocaleString()}`
              : '—'
            }
            small
          />
          <KPICard
            label="FREQUENCY"
            value={visitStats.avgFrequency ?? '—'}
            small
          />
          {relationship.followUpCompliance != null && (
            <KPICard
              label="FOLLOW-UP"
              value={`${relationship.followUpCompliance.attended}/${relationship.followUpCompliance.due}`}
              subtitle={`${relationship.followUpCompliance.pct}% attended`}
              accent={
                relationship.followUpCompliance.pct >= 75 ? 'success'
                : relationship.followUpCompliance.pct >= 40 ? 'warning'
                : 'danger'
              }
              small
            />
          )}
          {visitStats.noShowCount > 0 && (
            <KPICard
              label="NO-SHOWS"
              value={visitStats.noShowCount}
              accent="danger"
            />
          )}
          <KPICard
            label="LIFETIME SPEND"
            value={`P${Math.round(financialStats.totalSpent || 0).toLocaleString()}`}
            small
          />
        </View>


      </View>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — UPCOMING APPOINTMENTS (with calendar mini-view)
          ════════════════════════════════════════════════════════════════ */}
      <View style={styles.section}>
        <SectionHeader title="UPCOMING APPOINTMENTS" />

        {/* Calendar mini-view (Step 7) */}
        <CalendarMiniView
          calendarMonth={calendarMonth}
          setCalendarMonth={setCalendarMonth}
          selectedDay={selectedCalendarDay}
          setSelectedDay={setSelectedCalendarDay}
          calendarDots={calendarDots}
        />

        {/* Appointment list — filtered by tapped day, or all upcoming */}
        {upcomingAppointments.length === 0 ? (
          <View style={styles.upcomingEmpty}>
            <Text style={styles.emptyState}>No upcoming appointments.</Text>
            <CtaButton
              label="BOOK A VISIT"
              onPress={() => navigateToBookAppointment()}
            />
          </View>
        ) : (
          upcomingAppointments
            .filter(appt => {
              if (!selectedCalendarDay) return true;
              const d = appt.scheduledDate;
              if (!d) return false;
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              return key === selectedCalendarDay;
            })
            .map(appt => (
              <View key={appt.id} style={styles.upcomingRow}>
                <View style={styles.upcomingContent}>
                  <Text style={styles.upcomingService}>
                    {appt.serviceNames.join(', ')}
                  </Text>
                  <Text style={styles.upcomingMeta}>
                    {appt.petName}
                    {' · '}
                    {appt.scheduledDate?.toLocaleDateString('en-PH', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
                <View style={[
                  styles.upcomingBadge,
                  {
                    backgroundColor: appt.status === 'confirmed'
                      ? COLORS.successBg
                      : COLORS.warningBg,
                  },
                ]}>
                  <Text style={[
                    styles.upcomingCountdown,
                    {
                      color: appt.status === 'confirmed'
                        ? COLORS.success
                        : COLORS.warning,
                    },
                  ]}>
                    {appt.countdown}
                  </Text>
                </View>
              </View>
            ))
        )}
      </View>

      {/* ══════════════════════════════════════════════════════════════════
          CONDITIONS OVERVIEW (Step 6) — only renders when problems exist
          ════════════════════════════════════════════════════════════════ */}
      {conditionsOverview.hasData && (
        <View style={styles.section}>
          <SectionHeader title="CONDITIONS OVERVIEW" />
          <View style={styles.conditionsKpiRow}>
            <View style={[styles.conditionsKpiPill, { borderColor: COLORS.danger }]}>
              <Text style={[styles.conditionsKpiValue, { color: COLORS.danger }]}>
                {conditionsOverview.activeCount}
              </Text>
              <Text style={styles.conditionsKpiLabel}>ACTIVE</Text>
            </View>
            <View style={[styles.conditionsKpiPill, { borderColor: COLORS.success }]}>
              <Text style={[styles.conditionsKpiValue, { color: COLORS.success }]}>
                {conditionsOverview.resolvedCount}
              </Text>
              <Text style={styles.conditionsKpiLabel}>RESOLVED</Text>
            </View>
            <View style={[styles.conditionsKpiPill, { borderColor: COLORS.warning }]}>
              <Text style={[styles.conditionsKpiValue, { color: COLORS.warning }]}>
                {conditionsOverview.monitoringCount}
              </Text>
              <Text style={styles.conditionsKpiLabel}>MONITORING</Text>
            </View>
          </View>
          {Object.entries(conditionsOverview.perPet).map(([petName, conditions]) => (
            <View key={petName} style={styles.conditionsPerPet}>
              <Text style={styles.conditionsPerPetName}>{petName}:</Text>
              <Text style={styles.conditionsPerPetList}>
                {conditions.map(c =>
                  `${c.name}${c.status === 'monitoring' ? ' (monitoring)' : ''}`
                ).join(', ')}
              </Text>
            </View>
          ))}
        </View>
      )}
      </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          VISITS TAB
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'visits' && (
      <>
      {/* ── VISIT TRENDS (with toggle chips) ────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <SectionHeader title="VISIT TRENDS" style={styles.sectionHeaderNoMargin} />
          <TouchableOpacity
            onPress={() => handleExportTab('visits')}
            style={styles.exportButton}
            activeOpacity={0.7}
          >
            <MaterialIcons name="file-download" size={18} color={COLORS.accentLight} />
          </TouchableOpacity>
        </View>

        {/* Group 1: TIME GROUPING (Smart Hiding) */}
        {visitBreakdownMode === 'total' && (
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>TIME GROUPING</Text>
            <View style={[styles.segmentedControl, { width: '60%' }]}>
              {[{ key: 'monthly', label: 'MONTHLY' }, { key: 'weekly', label: 'WEEKLY' }].map((item, idx, arr) => (
                <Pressable
                  key={item.key}
                  style={[
                    styles.segmentedItem,
                    visitTimeGrouping === item.key && styles.segmentedItemActive,
                    idx === arr.length - 1 && styles.segmentedItemLast
                  ]}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setVisitTimeGrouping(item.key);
                  }}
                >
                  <Text style={[
                    styles.segmentedText,
                    visitTimeGrouping === item.key && styles.segmentedTextActive
                  ]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Group 2: VIEW MODE (Segmented Control) */}
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>VIEW MODE</Text>
          <View style={styles.segmentedControl}>
            {[
              { key: 'total',        label: 'TOTAL'         },
              { key: 'byPet',        label: 'BY PET'        },
              { key: 'byService',    label: 'BY SERVICE'    },
              { key: 'byDepartment', label: 'BY DEPARTMENT' },
            ].map((item, idx, arr) => (
              <Pressable
                key={item.key}
                style={[
                  styles.segmentedItem,
                  visitBreakdownMode === item.key && styles.segmentedItemActive,
                  idx === arr.length - 1 && styles.segmentedItemLast
                ]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setVisitBreakdownMode(item.key);
                }}
              >
                <Text style={[
                  styles.segmentedText,
                  visitBreakdownMode === item.key && styles.segmentedTextActive
                ]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Toggle-driven chart: TOTAL → bar chart, others → pie chart */}
        {visitBreakdownMode === 'total' ? (
          <View style={styles.chartContainer}>
            <View style={styles.chartShadow} />
            <View style={styles.chartBox}>
              <Text style={styles.chartTitle}>
                {visitTimeGrouping === 'monthly' ? 'VISITS PER MONTH' : 'VISITS PER WEEK'}
              </Text>
              <View style={styles.chartBars}>
                {(visitTimeGrouping === 'monthly' ? monthlyVisitData : weeklyVisitData).map(m => (
                  <View key={m.key} style={styles.chartBarCol}>
                    <View style={styles.chartBarTrack}>
                      <View style={[styles.chartBarFill, { height: `${Math.max(m.pct, 4)}%` }]} />
                    </View>
                    <Text style={styles.chartBarLabel}>{m.label}</Text>
                    {m.count > 0 && <Text style={styles.chartBarCount}>{m.count}</Text>}
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.chartContainer}>
            <View style={styles.chartShadow} />
            <View style={styles.chartBox}>
              <Text style={styles.chartTitle}>
                {visitBreakdownMode === 'byPet'        ? 'VISITS BY PET'
                  : visitBreakdownMode === 'byService'  ? 'VISITS BY SERVICE'
                  : 'VISITS BY DEPARTMENT'}
              </Text>
              {(() => {
                const pieData = visitBreakdownMode === 'byPet'        ? visitsByPet
                  : visitBreakdownMode === 'byService'                ? visitsByService
                  : visitsByDepartment;
                return pieData.length === 0
                  ? <Text style={styles.emptyState}>No completed visits yet.</Text>
                  : <PieChart data={pieData} size={160} />;
              })()}
            </View>
          </View>
        )}
      </View>

      {/* ── YEAR OVER YEAR (with VISITS / SPENDING toggle) ──────────── */}
      {(yoyVisitData.hasLastYear || yoySpendingData.hasLastYear) && (
        <View style={styles.section}>
          <SectionHeader title="YEAR OVER YEAR" />

          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>COMPARE METRIC</Text>
            <View style={[styles.segmentedControl, { width: '60%' }]}>
              {[{ key: 'visits', label: 'VISITS' }, { key: 'spending', label: 'SPENDING' }].map((item, idx, arr) => (
                <Pressable
                  key={item.key}
                  style={[
                    styles.segmentedItem,
                    yoyMode === item.key && styles.segmentedItemActive,
                    idx === arr.length - 1 && styles.segmentedItemLast
                  ]}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setYoyMode(item.key);
                  }}
                >
                  <Text style={[
                    styles.segmentedText,
                    yoyMode === item.key && styles.segmentedTextActive
                  ]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {yoyMode === 'visits' ? (
            <View style={styles.chartContainer}>
              <View style={styles.chartShadow} />
              <View style={styles.chartBox}>
                <Text style={styles.chartTitle}>VISITS PER MONTH</Text>
                <View style={styles.chartBars}>
                  {yoyVisitData.months.map(m => (
                    <View key={m.month} style={styles.chartBarCol}>
                      <View style={styles.chartBarTrack}>
                        <View style={styles.yoyBarGroup}>
                          <View
                            style={[
                              styles.yoyBarThis,
                              { height: `${Math.max(m.thisYearPct, m.thisYear > 0 ? 4 : 0)}%` },
                            ]}
                          />
                          <View
                            style={[
                              styles.yoyBarLast,
                              { height: `${Math.max(m.lastYearPct, m.lastYear > 0 ? 4 : 0)}%` },
                            ]}
                          />
                        </View>
                      </View>
                      <Text style={styles.chartBarLabel}>{m.label}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.yoyLegend}>
                  <View style={styles.yoyLegendItem}>
                    <View style={[styles.yoyLegendDot, { backgroundColor: COLORS.sky }]} />
                    <Text style={styles.yoyLegendText}>{yoyVisitData.thisYearLabel}</Text>
                  </View>
                  <View style={styles.yoyLegendItem}>
                    <View style={[styles.yoyLegendDot, { backgroundColor: COLORS.borderLight }]} />
                    <Text style={styles.yoyLegendText}>{yoyVisitData.lastYearLabel}</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.chartContainer}>
              <View style={styles.chartShadow} />
              <View style={styles.chartBox}>
                <Text style={styles.chartTitle}>SPENDING PER MONTH</Text>
                <View style={styles.chartBars}>
                  {yoySpendingData.months.map(m => (
                    <View key={m.month} style={styles.chartBarCol}>
                      <View style={styles.chartBarTrack}>
                        <View style={styles.yoyBarGroup}>
                          <View
                            style={[
                              styles.yoyBarThis,
                              { height: `${Math.max(m.thisYearPct, m.thisYear > 0 ? 4 : 0)}%` },
                            ]}
                          />
                          <View
                            style={[
                              styles.yoyBarLast,
                              { height: `${Math.max(m.lastYearPct, m.lastYear > 0 ? 4 : 0)}%` },
                            ]}
                          />
                        </View>
                      </View>
                      <Text style={styles.chartBarLabel}>{m.label}</Text>
                      {m.thisYear > 0 && (
                        <Text style={styles.chartBarCount}>
                          P{Math.round(m.thisYear / 1000)}k
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
                <View style={styles.yoyLegend}>
                  <View style={styles.yoyLegendItem}>
                    <View style={[styles.yoyLegendDot, { backgroundColor: COLORS.sky }]} />
                    <Text style={styles.yoyLegendText}>{yoySpendingData.thisYearLabel}</Text>
                  </View>
                  <View style={styles.yoyLegendItem}>
                    <View style={[styles.yoyLegendDot, { backgroundColor: COLORS.borderLight }]} />
                    <Text style={styles.yoyLegendText}>{yoySpendingData.lastYearLabel}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ── VISIT PATTERNS (4 new mini charts) ──────────────────────── */}
      <View style={styles.section}>
        <SectionHeader title="VISIT PATTERNS" />

        {/* 1. Visit frequency trend — days between consecutive visits */}
        {visitFrequencyTrend.length >= 2 && (
          <View style={[styles.chartContainer, { marginBottom: 16 }]}>
            <View style={styles.chartShadow} />
            <View style={styles.chartBox}>
              <Text style={styles.chartTitle}>VISIT FREQUENCY TREND</Text>
              <GiftedLineChart
                data={visitFrequencyTrend.map((d, i) => ({
                  value: d.value,
                  label: i % Math.ceil(visitFrequencyTrend.length / 5) === 0
                    ? (d.label ?? '') : '',
                }))}
                width={SCREEN_W - 72}
                height={150}
                overflowTop={20}
                curved
                areaChart
                color={COLORS.sky}
                startFillColor={COLORS.sky}
                startOpacity={0.3}
                endOpacity={0.05}
                thickness={2}
                yAxisLabelSuffix="d"
                yAxisLabelWidth={40}
                stepValue={1}
                roundToDigits={0}
                yAxisTextStyle={{ fontFamily: FONTS.bold, fontSize: 10, color: COLORS.accent }}
                xAxisLabelTextStyle={{ fontFamily: FONTS.bold, fontSize: 10, color: COLORS.accentLight }}
                dataPointsColor={COLORS.brand}
                dataPointsRadius={4}
                rulesType="solid"
                rulesColor="rgba(0,0,0,0.05)"
                xAxisColor={COLORS.borderLight}
                yAxisColor={COLORS.borderLight}
              />
            </View>
          </View>
        )}

        {/* 2. Visit outcomes — completed / cancelled / no-show pie */}
        {visitOutcomes.length > 0 && (
          <View style={[styles.chartContainer, { marginBottom: 16 }]}>
            <View style={styles.chartShadow} />
            <View style={styles.chartBox}>
              <Text style={styles.chartTitle}>VISIT OUTCOMES</Text>
              <PieChart data={visitOutcomes} size={140} />
            </View>
          </View>
        )}

        {/* 3. Preferred days — Mon-Sun bar chart */}
        {preferredDays.length > 0 && (
          <View style={[styles.chartContainer, { marginBottom: 16 }]}>
            <View style={styles.chartShadow} />
            <View style={styles.chartBox}>
              <Text style={styles.chartTitle}>PREFERRED VISIT DAYS</Text>
              <View style={styles.chartBars}>
                {preferredDays.map(d => (
                  <View key={d.label} style={styles.chartBarCol}>
                    <View style={styles.chartBarTrack}>
                      <View
                        style={[
                          styles.chartBarFill,
                          { height: `${Math.max(d.pct, d.count > 0 ? 4 : 0)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.chartBarLabel}>{d.label}</Text>
                    {d.count > 0 && <Text style={styles.chartBarCount}>{d.count}</Text>}
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* 4. Species distribution — only when 2+ distinct species */}
        {speciesDistribution.length >= 2 && (
          <View style={[styles.chartContainer, { marginBottom: 16 }]}>
            <View style={styles.chartShadow} />
            <View style={styles.chartBox}>
              <Text style={styles.chartTitle}>SPECIES DISTRIBUTION</Text>
              <PieChart data={speciesDistribution} size={140} />
            </View>
          </View>
        )}

        {visitFrequencyTrend.length < 2 && visitOutcomes.length === 0 &&
         !preferredDays.some(d => d.count > 0) && speciesDistribution.length < 2 && (
          <Text style={styles.emptyState}>Not enough visit data yet.</Text>
        )}
      </View>

      {/* ── SEASONAL PATTERNS (with per-pet filter) ──────────────────── */}
      {seasonalPattern.reduce((sum, m) => sum + m.count, 0) >= 3 && (
        <View style={styles.section}>
          <SectionHeader title="SEASONAL PATTERNS" />

          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>FILTER BY PET</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.filterScroll}
              contentContainerStyle={styles.filterChipsContainer}
            >
              <Pressable
                style={[styles.rangeChip, seasonalPetFilter === 'all' && styles.rangeChipActive]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setSeasonalPetFilter('all');
                }}
              >
                <Text style={[
                  styles.rangeChipText,
                  seasonalPetFilter === 'all' && styles.rangeChipTextActive,
                ]}>
                  ALL PETS
                </Text>
              </Pressable>
              {userPets.map(pet => (
                <Pressable
                  key={pet.id}
                  style={[styles.rangeChip, seasonalPetFilter === pet.id && styles.rangeChipActive]}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setSeasonalPetFilter(pet.id);
                  }}
                >
                  <Text style={[
                    styles.rangeChipText,
                    seasonalPetFilter === pet.id && styles.rangeChipTextActive,
                  ]}>
                    {(pet.name || 'PET').toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.chartContainer}>
            <View style={styles.chartShadow} />
            <View style={styles.chartBox}>
              <Text style={styles.chartTitle}>VISITS BY MONTH (ALL YEARS)</Text>
              <View style={styles.heatmapRow}>
                {(perPetSeasonalPattern[seasonalPetFilter] || seasonalPattern).map(cell => (
                  <View key={cell.month} style={styles.heatmapCol}>
                    <View
                      style={[
                        styles.heatmapCell,
                        {
                          backgroundColor: COLORS.sky,
                          opacity: Math.max(0.1, cell.intensity),
                        },
                      ]}
                    >
                      {cell.count > 0 && (
                        <Text style={styles.heatmapCount}>{cell.count}</Text>
                      )}
                    </View>
                    <Text style={styles.heatmapLabel}>{cell.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      )}
      </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SPENDING TAB
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'spending' && (
      <>
      <View style={styles.section}>
        {/* Section header with export button */}
        <View style={styles.sectionHeaderRow}>
          <SectionHeader title="SPENDING BREAKDOWN" style={styles.sectionHeaderNoMargin} />
          <TouchableOpacity
            onPress={() => handleExportTab('spending')}
            style={styles.exportButton}
            activeOpacity={0.7}
          >
            <MaterialIcons name="file-download" size={18} color={COLORS.accentLight} />
          </TouchableOpacity>
        </View>

        {/* Group 1: TIME RANGE */}
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>TIME RANGE</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            style={styles.filterScroll}
            contentContainerStyle={styles.filterChipsContainer}
          >
            {SPENDING_RANGE_OPTIONS.map(chip => (
              <Pressable
                key={chip.key}
                style={[styles.rangeChip, spendingRange === chip.key && styles.rangeChipActive]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setSpendingRange(chip.key);
                }}
              >
                <Text style={[
                  styles.rangeChipText,
                  spendingRange === chip.key && styles.rangeChipTextActive,
                ]}>
                  {chip.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Group 2: BREAKDOWN (Segmented Control) */}
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>BREAKDOWN MODE</Text>
          <View style={styles.segmentedControl}>
            {[
              { key: 'total',        label: 'TOTAL'         },
              { key: 'byPet',        label: 'BY PET'        },
              { key: 'byService',    label: 'BY SERVICE'    },
              { key: 'byDepartment', label: 'BY DEPARTMENT' },
            ].map((item, idx, arr) => (
              <Pressable
                key={item.key}
                style={[
                  styles.segmentedItem,
                  spendingBreakdownMode === item.key && styles.segmentedItemActive,
                  idx === arr.length - 1 && styles.segmentedItemLast
                ]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setSpendingBreakdownMode(item.key);
                }}
              >
                <Text style={[
                  styles.segmentedText,
                  spendingBreakdownMode === item.key && styles.segmentedTextActive
                ]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Group 3: GRANULARITY (Smart Hiding) */}
        {spendingBreakdownMode === 'total' && (
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>GRANULARITY</Text>
            <View style={[styles.segmentedControl, { width: '60%' }]}>
              {[{ key: 'monthly', label: 'MONTHLY' }, { key: 'weekly', label: 'WEEKLY' }].map((item, idx, arr) => (
                <Pressable
                  key={item.key}
                  style={[
                    styles.segmentedItem,
                    spendingTimeGrouping === item.key && styles.segmentedItemActive,
                    idx === arr.length - 1 && styles.segmentedItemLast
                  ]}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setSpendingTimeGrouping(item.key);
                  }}
                >
                  <Text style={[
                    styles.segmentedText,
                    spendingTimeGrouping === item.key && styles.segmentedTextActive
                  ]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {spendingBreakdown.spendingBarData.every(m => m.amount === 0) &&
         spendingBreakdown.perPetList.length === 0 ? (
          <Text style={styles.emptyState}>No spending data for this period.</Text>
        ) : (
          <>
            {/* Toggle-driven main chart */}
            {spendingBreakdownMode === 'total' ? (
              <>
                {/* Bar chart: MONTHLY or WEEKLY */}
                {(spendingTimeGrouping === 'monthly'
                  ? spendingBreakdown.spendingBarData.some(m => m.amount > 0)
                  : weeklySpendingData.some(w => w.amount > 0)
                ) && (
                  <View style={styles.spendingSparklineContainer}>
                    <View style={styles.chartShadow} />
                    <View style={styles.chartBox}>
                      <Text style={styles.chartTitle}>
                        {spendingTimeGrouping === 'monthly' ? 'MONTHLY SPENDING' : 'WEEKLY SPENDING'}
                      </Text>
                      <View style={styles.chartBars}>
                        {(spendingTimeGrouping === 'monthly'
                          ? spendingBreakdown.spendingBarData
                          : weeklySpendingData
                        ).map(m => (
                          <View key={m.key} style={styles.chartBarCol}>
                            <View style={styles.chartBarTrack}>
                              <View
                                style={[
                                  styles.chartBarFill,
                                  { height: `${Math.max(m.pct, 4)}%` },
                                ]}
                              />
                            </View>
                            <Text style={styles.chartBarLabel}>{m.label}</Text>
                            {m.amount > 0 && (
                              <Text style={styles.chartBarCount}>
                                P{Math.round(m.amount / 1000)}k
                              </Text>
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                )}
              </>
            ) : (
              /* Pie chart for BY PET / BY SERVICE / BY DEPARTMENT */
              <View style={styles.spendingSparklineContainer}>
                <View style={styles.chartShadow} />
                <View style={styles.chartBox}>
                  <Text style={styles.chartTitle}>
                    {spendingBreakdownMode === 'byPet'        ? 'SPENDING BY PET'
                      : spendingBreakdownMode === 'byService'  ? 'SPENDING BY SERVICE'
                      : 'SPENDING BY DEPARTMENT'}
                  </Text>
                  {(() => {
                    let pieData;
                    if (spendingBreakdownMode === 'byPet') {
                      const total = spendingBreakdown.perPetList.reduce((s, x) => s + x.amount, 0);
                      pieData = spendingBreakdown.perPetList.map(r => ({
                        name: r.name, count: Math.round(r.amount), pct: total > 0 ? r.amount / total : 0,
                      }));
                    } else if (spendingBreakdownMode === 'byService') {
                      const total = spendingBreakdown.perServiceList.reduce((s, x) => s + x.amount, 0);
                      pieData = spendingBreakdown.perServiceList.map(r => ({
                        name: r.type, count: Math.round(r.amount), pct: total > 0 ? r.amount / total : 0,
                      }));
                    } else {
                      pieData = spendingByDepartment;
                    }
                    return pieData.length === 0
                      ? <Text style={styles.emptyState}>No spending data for this period.</Text>
                      : <SpendingPieChart data={pieData} size={160} />;
                  })()}
                </View>
              </View>
            )}

            {/* Per-pet drill-down — always shown in BY PET mode below the pie */}
            {spendingBreakdownMode === 'byPet' && spendingBreakdown.perPetList.length > 0 && (
              <View style={styles.spendingBlock}>
                <Text style={styles.spendingBlockTitle}>PET BREAKDOWN</Text>
                {spendingBreakdown.perPetList.map(row => {
                  const isExpanded = expandedPet === row.name;
                  const transactions = spendingBreakdown.perPetTransactions?.[row.name] ?? [];
                  return (
                    <View key={row.name}>
                      <Pressable
                        style={styles.spendingRow}
                        onPress={() => handleTogglePet(row.name)}
                      >
                        <Text style={styles.spendingRowName}>{row.name}</Text>
                        <Text style={styles.spendingRowAmount}>
                          P{Math.round(row.amount).toLocaleString()}
                        </Text>
                        <MaterialIcons
                          name={isExpanded ? 'expand-less' : 'expand-more'}
                          size={18}
                          color={COLORS.accentLight}
                          style={styles.spendingExpandIcon}
                        />
                      </Pressable>
                      {isExpanded && transactions.length > 0 && (
                        <View style={styles.transactionList}>
                          {transactions.map((tx, idx) => (
                            <View key={idx} style={styles.transactionRow}>
                              <Text style={styles.transactionDate}>
                                {tx.date
                                  ? tx.date.toLocaleDateString('en-PH', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })
                                  : '—'}
                              </Text>
                              <Text style={styles.transactionService} numberOfLines={1}>
                                {tx.service}
                              </Text>
                              <Text style={styles.transactionAmount}>
                                P{Math.round(tx.amount).toLocaleString()}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* SPENDING PER VISIT trend (Step 18) */}
            {spendingPerVisit.trendData.length >= 2 && (
              <View style={[styles.spendingSparklineContainer, { marginTop: 4 }]}>
                <View style={styles.chartShadow} />
                <View style={styles.chartBox}>
                  <Text style={styles.chartTitle}>
                    SPENDING PER VISIT
                    {'  '}
                    <Text style={styles.spendingAvgLabel}>
                      Avg: P{spendingPerVisit.average.toLocaleString()}/visit
                    </Text>
                  </Text>
                  <GiftedLineChart
                    data={spendingPerVisit.trendData.map((d, i) => ({
                      value: d.value,
                      label: i % Math.ceil(spendingPerVisit.trendData.length / 5) === 0
                        ? (d.label ?? '') : '',
                    }))}
                    width={SCREEN_W - 96}
                    height={150}
                    overflowTop={20}
                    curved
                    areaChart
                    color={COLORS.sky}
                    startFillColor={COLORS.sky}
                    startOpacity={0.3}
                    endOpacity={0.05}
                    thickness={2}
                    yAxisLabelWidth={60}
                    formatYLabel={(val) => {
                      const n = parseFloat(val);
                      const abs = Math.abs(n);
                      if (abs >= 1_000_000) return `₱${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
                      if (abs >= 1_000)     return `₱${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
                      return `₱${Math.round(n)}`;
                    }}
                    yAxisTextStyle={{ fontFamily: FONTS.bold, fontSize: 10, color: COLORS.accent }}
                    xAxisLabelTextStyle={{ fontFamily: FONTS.bold, fontSize: 10, color: COLORS.accentLight }}
                    dataPointsColor={COLORS.brand}
                    dataPointsRadius={4}
                    rulesType="solid"
                    rulesColor="rgba(0,0,0,0.05)"
                    xAxisColor={COLORS.borderLight}
                    yAxisColor={COLORS.borderLight}
                    noOfSections={4}
                  />
                </View>
              </View>
            )}

            {/* Outstanding balance */}
            <View style={[
              styles.balanceSummaryRow,
              spendingBreakdown.outstandingBalance > 0 && styles.balanceSummaryRowDanger,
            ]}>
              <MaterialIcons
                name={spendingBreakdown.outstandingBalance > 0 ? 'account-balance-wallet' : 'check-circle'}
                size={16}
                color={spendingBreakdown.outstandingBalance > 0 ? COLORS.danger : COLORS.success}
              />
              <Text style={[
                styles.balanceSummaryText,
                spendingBreakdown.outstandingBalance > 0 && { color: COLORS.danger },
              ]}>
                {spendingBreakdown.outstandingBalance > 0
                  ? `P${Math.round(spendingBreakdown.outstandingBalance).toLocaleString()} outstanding balance`
                  : 'P0 outstanding — all clear'
                }
              </Text>
            </View>
          </>
        )}
      </View>
      </>
      )}



      {/* ══════════════════════════════════════════════════════════════════
          HEALTH TAB
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'health' && (
      <>
      <View style={styles.section}>
        {/* Section header with export button */}
        <View style={styles.sectionHeaderRow}>
          <SectionHeader title="PREVENTIVE CARE" style={styles.sectionHeaderNoMargin} />
          <TouchableOpacity
            onPress={() => handleExportTab('health')}
            style={styles.exportButton}
            activeOpacity={0.7}
          >
            <MaterialIcons name="file-download" size={18} color={COLORS.accentLight} />
          </TouchableOpacity>
        </View>

        {preventiveCare.length === 0 ? (
          <View style={styles.preventiveClearRow}>
            <MaterialIcons name="check-circle" size={16} color={COLORS.success} />
            <Text style={styles.preventiveClearText}>All care is up to date!</Text>
          </View>
        ) : (
          preventiveCare.map((item, idx) => (
            <PreventiveCareItem
              key={`${item.type}-${item.petName}-${idx}`}
              item={item}
              onCta={() => {
                if (item.ctaNav) {
                  navigation.navigate(item.ctaNav.screen, item.ctaNav.params);
                }
              }}
            />
          ))
        )}
      </View>

      {/* ── VACCINATION STATUS (Step 19) ────────────────────────── */}
      {petCards.some(pc => pc.vaccineStatus?.statuses) && (
        <View style={styles.section}>
          <SectionHeader title="VACCINATION STATUS" />
          {petCards.map(pc => {
            if (!pc.vaccineStatus?.statuses) return null;
            const pct = pc.vaccineStatus.completeness?.percentage ?? 0;
            const barColor = pct >= 75 ? COLORS.success
              : pct >= 50 ? COLORS.warning
              : COLORS.danger;
            return (
              <View key={pc.id} style={styles.vacStatusPetBlock}>
                {/* Pet name + completeness bar */}
                <View style={styles.vacStatusHeader}>
                  <Text style={styles.vacStatusPetName}>
                    {pc.speciesEmoji} {pc.name}
                  </Text>
                  <View style={styles.vacStatusBarTrack}>
                    <View
                      style={[
                        styles.vacStatusBarFill,
                        { width: `${pct}%`, backgroundColor: barColor },
                      ]}
                    />
                  </View>
                  <Text style={[styles.vacStatusFraction, { color: barColor }]}>
                    {pc.vaccineStatus.completeness?.administered ?? 0}/
                    {pc.vaccineStatus.completeness?.total ?? 0} ({pct}%)
                  </Text>
                </View>

                {/* Per-vaccine status lines */}
                {pc.vaccineStatus.statuses.map((v, idx) => {
                  const dotColor = v.status === 'overdue'    ? COLORS.danger
                    : v.status === 'current'                 ? COLORS.success
                    : v.status === 'due_soon'                ? COLORS.warning
                    : v.status === 'incomplete'              ? COLORS.warning
                    : COLORS.textMuted;
                  const dotEmoji = v.status === 'overdue'    ? '🔴'
                    : v.status === 'current'                 ? '🟢'
                    : v.status === 'due_soon'                ? '🟡'
                    : v.status === 'incomplete'              ? '🟠'
                    : '⚪';
                  const detailText = v.status === 'overdue'
                    ? `OVERDUE (${Math.abs(v.daysUntilDue)} days)`
                    : v.status === 'incomplete' && v.nextDoseNumber
                      ? `Dose ${v.nextDoseNumber} ${v.daysUntilDue != null && v.daysUntilDue >= 0 ? `in ${v.daysUntilDue} days` : 'due'}`
                    : v.status === 'current'  ? 'current'
                    : v.status === 'due_soon' ? `in ${v.daysUntilDue} days`
                    : 'no record';
                  return (
                    <View key={idx} style={styles.vacStatusLine}>
                      {v.dosesRequired > 1 ? (
                        <View style={styles.vacDoseRow}>
                          {Array.from({ length: v.dosesRequired }, (_, i) => (
                            <Text key={i} style={{ fontSize: 10, color: i < v.dosesGiven ? COLORS.success : COLORS.borderLight }}>
                              {i < v.dosesGiven ? '●' : '○'}
                            </Text>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.vacStatusDot}>{dotEmoji}</Text>
                      )}
                      <Text style={styles.vacStatusName}>{v.name}</Text>
                      <Text style={[styles.vacStatusDetail, { color: dotColor }]}>
                        {detailText}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      )}

      {/* ── Overall summary line (per-pet circles deleted as redundant
              with the Vaccination Status cards above this section) ────── */}
      {petCards.filter(pc => pc.vaccineStatus?.completeness).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.allPetsOverall}>
            Overall:{' '}
            {petCards.reduce((s, pc) => s + (pc.vaccineStatus?.completeness?.administered ?? 0), 0)}/
            {petCards.reduce((s, pc) => s + (pc.vaccineStatus?.completeness?.total ?? 0), 0)}{' '}
            series complete
          </Text>
        </View>
      )}
      </>
      )}

      {/* Weight zoom modal — rendered at root level (outside all tab guards) */}
      {weightZoomPet != null && (
        <VitalsZoomModal
          visible
          onClose={() => setWeightZoomPet(null)}
          vitalLabel="Weight Trend"
          data={weightZoomPet.allWeightPoints}
          unit="kg"
          lineColor={COLORS.sky}
          normalRange={null}
          petName={weightZoomPet.name}
        />
      )}
    </ScrollView>
  );
}

// ─── CALENDAR MINI-VIEW ───────────────────────────────────────────────────────

/**
 * CalendarMiniView — custom View-based month calendar grid.
 *
 * Shows a 7-column (Mon-Sun) day grid for the given month. Days with
 * appointments in calendarDots are marked with a small sky-blue dot.
 * Today gets a sky-blue background. Tapping a day with dots filters the
 * upcoming appointment list below to that day.
 *
 * Navigation is capped at current month +/- 1 to prevent stale data browsing.
 */
function CalendarMiniView({ calendarMonth, setCalendarMonth, selectedDay, setSelectedDay, calendarDots }) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Compute navigation bounds: one month before and after today's month.
  const now = new Date();
  const minMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const maxMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const canGoPrev = calendarMonth > minMonth;
  const canGoNext = calendarMonth < maxMonth;

  function handlePrevMonth() {
    if (!canGoPrev) return;
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
    setSelectedDay(null);
  }

  function handleNextMonth() {
    if (!canGoNext) return;
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
    setSelectedDay(null);
  }

  // Build the day grid: prefix empty cells for the first week (Mon-based).
  const year  = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
  // Shift so Mon=0, Sun=6
  const startOffset = (firstDayOfWeek + 6) % 7;

  const cells = [];
  // Empty prefix cells
  for (let i = 0; i < startOffset; i++) {
    cells.push({ day: null });
  }
  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, key, dots: calendarDots[key] ?? [] });
  }

  const monthLabel = calendarMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }).toUpperCase();

  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartShadow} />
      <View style={styles.chartBox}>
        {/* Month navigation header */}
        <View style={styles.calendarHeader}>
          <TouchableOpacity
            onPress={handlePrevMonth}
            disabled={!canGoPrev}
            style={styles.calendarArrow}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name="chevron-left"
              size={20}
              color={canGoPrev ? COLORS.brand : COLORS.borderLight}
            />
          </TouchableOpacity>
          <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>
          <TouchableOpacity
            onPress={handleNextMonth}
            disabled={!canGoNext}
            style={styles.calendarArrow}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name="chevron-right"
              size={20}
              color={canGoNext ? COLORS.brand : COLORS.borderLight}
            />
          </TouchableOpacity>
        </View>

        {/* Day-of-week headers: M T W T F S S */}
        <View style={styles.calendarGrid}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <View key={i} style={styles.calendarDayHeader}>
              <Text style={styles.calendarDayHeaderText}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Day cells grid */}
        <View style={styles.calendarGrid}>
          {cells.map((cell, idx) => {
            if (!cell.day) {
              return <View key={`empty-${idx}`} style={styles.calendarCell} />;
            }
            const isToday    = cell.key === todayKey;
            const isSelected = cell.key === selectedDay;
            const hasDots    = cell.dots.length > 0;

            return (
              <TouchableOpacity
                key={cell.key}
                style={[
                  styles.calendarCell,
                  isToday    && styles.calendarCellToday,
                  isSelected && styles.calendarCellSelected,
                ]}
                onPress={() => setSelectedDay(isSelected ? null : cell.key)}
                activeOpacity={hasDots ? 0.7 : 1}
              >
                <Text style={[
                  styles.calendarDayText,
                  (isToday || isSelected) && styles.calendarDayTextToday,
                ]}>
                  {cell.day}
                </Text>
                {hasDots && (
                  <View style={styles.calendarDotRow}>
                    {cell.dots.slice(0, 3).map((_, dotIdx) => (
                      <View key={dotIdx} style={styles.calendarDot} />
                    ))}
                    {cell.dots.length > 3 && (
                      <Text style={styles.calendarDotMore}>+</Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── PET CARD SLIM ────────────────────────────────────────────────────────────

/**
 * PetCardSlim — compact pet card for the PETS tab.
 *
 * Shows: species emoji + name + breed/age line, weight sparkline + latest value
 * + delta, last visit date (with days ago), vaccine CircularGauge, active med
 * count, and a VIEW CHART button navigating to PetHistoryScreen.
 *
 * Deliberately omits clinical details (diagnoses, allergy lists, med details,
 * recheck countdown, lab trends) — those belong in PetHistoryScreen.
 */
function PetCardSlim({ petCard, onWeightZoom, onViewChart }) {
  const now = new Date();
  const lastVisitDaysAgo = petCard.lastVisitDate
    ? Math.floor((now.getTime() - petCard.lastVisitDate.getTime()) / 86400000)
    : null;

  return (
    <View style={styles.petCardWrapper}>
      <View style={styles.petCardShadow} />
      <View style={styles.petCard}>
        {/* Header: emoji + name + breed/age */}
        <View style={styles.petCardHeader}>
          <Text style={styles.petCardEmoji}>{petCard.speciesEmoji}</Text>
          <View style={styles.petCardHeaderText}>
            <Text style={styles.petCardName}>{petCard.name}</Text>
            <Text style={styles.petCardMeta}>
              {[petCard.species, petCard.age].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        <View style={styles.petCardDivider} />

        {/* Weight: sparkline + delta */}
        <View style={styles.petCardRow}>
          <Text style={styles.petCardRowLabel}>WEIGHT</Text>
          <View style={styles.petCardRowContent}>
            {petCard.weightPoints.length >= 3 ? (
              <>
                <TouchableOpacity
                  onPress={onWeightZoom}
                  activeOpacity={0.75}
                  style={styles.weightSparklineHit}
                >
                  <GiftedLineChart
                    data={petCard.weightPoints.map(d => ({ value: d.value }))}
                    width={SCREEN_W - 160}
                    height={60}
                    curved
                    thickness={2}
                    color={COLORS.sky}
                    dataPointsColor={COLORS.brand}
                    dataPointsRadius={4}
                    hideYAxisText
                    hideAxesAndRules
                    hideDataPoints={false}
                  />
                  <MaterialIcons
                    name="zoom-in"
                    size={14}
                    color={COLORS.sky}
                    style={styles.weightZoomIcon}
                  />
                </TouchableOpacity>
                {petCard.weightDelta !== null && (
                  <Text style={[
                    styles.weightDelta,
                    {
                      color: petCard.weightDelta > 0 ? COLORS.success
                        : petCard.weightDelta < 0    ? COLORS.danger
                        : COLORS.textMuted,
                    },
                  ]}>
                    {petCard.weightDelta > 0
                      ? `+${petCard.weightDelta.toFixed(1)}`
                      : petCard.weightDelta.toFixed(1)
                    } kg
                  </Text>
                )}
              </>
            ) : petCard.weightPoints.length === 2 ? (
              // Two readings: a sparkline curve looks visually broken at this size.
              // Show current weight + delta arrow instead — clearer at a glance.
              <TouchableOpacity onPress={onWeightZoom} activeOpacity={0.75} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={styles.petCardValue}>
                  {petCard.weightPoints[petCard.weightPoints.length - 1].value} kg
                </Text>
                {petCard.weightDelta !== null && petCard.weightDelta !== 0 && (
                  <Text style={[
                    styles.weightDelta,
                    {
                      color: petCard.weightDelta > 0 ? COLORS.success : COLORS.danger,
                    },
                  ]}>
                    {petCard.weightDelta > 0 ? '▲' : '▼'} {Math.abs(petCard.weightDelta).toFixed(1)} kg
                  </Text>
                )}
                <Text style={styles.petCardValueMuted}>2 readings</Text>
              </TouchableOpacity>
            ) : petCard.weightPoints.length === 1 ? (
              <TouchableOpacity onPress={onWeightZoom} activeOpacity={0.75}>
                <Text style={styles.petCardValue}>
                  {petCard.weightPoints[0].value} kg
                </Text>
                <Text style={styles.petCardValueMuted}>1 reading</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.petCardValueMuted}>No weight records</Text>
            )}
          </View>
        </View>

        {/* Last visit */}
        <View style={styles.petCardRow}>
          <Text style={styles.petCardRowLabel}>LAST VISIT</Text>
          <View style={styles.petCardRowContent}>
            {petCard.lastVisitDate ? (
              <Text style={styles.petCardValue}>
                {petCard.lastVisitDate.toLocaleDateString('en-PH', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                {lastVisitDaysAgo != null && lastVisitDaysAgo <= 365
                  ? ` (${lastVisitDaysAgo} day${lastVisitDaysAgo !== 1 ? 's' : ''} ago)`
                  : ''}
              </Text>
            ) : (
              <Text style={styles.petCardValueMuted}>No visits yet</Text>
            )}
          </View>
        </View>

        {/* Vaccines: CircularGauge */}
        <View style={styles.petCardRow}>
          <Text style={styles.petCardRowLabel}>VACCINES</Text>
          <View style={[styles.petCardRowContent, styles.petCardSlimGaugeRow]}>
            {petCard.vaccineStatus?.completeness ? (
              <>
                <CircularGauge
                  administered={petCard.vaccineStatus.completeness.administered}
                  total={petCard.vaccineStatus.completeness.total}
                  size={48}
                />
                <Text style={[
                  styles.petCardValue,
                  {
                    marginLeft: 8,
                    color: petCard.vaccineStatus.completeness.percentage >= 75
                      ? COLORS.success : COLORS.warning,
                  },
                ]}>
                  {petCard.vaccineStatus.completeness.administered}/
                  {petCard.vaccineStatus.completeness.total} complete
                </Text>
              </>
            ) : (
              <Text style={styles.petCardValueMuted}>No vaccine records</Text>
            )}
          </View>
        </View>

        {/* Active medication count */}
        <View style={styles.petCardRow}>
          <Text style={styles.petCardRowLabel}>MEDICATIONS</Text>
          <View style={styles.petCardRowContent}>
            <Text style={petCard.activeMeds.length > 0 ? styles.petCardValue : styles.petCardValueMuted}>
              {petCard.activeMeds.length > 0
                ? `${petCard.activeMeds.length} active`
                : 'None active'}
            </Text>
          </View>
        </View>

        {/* VIEW CHART CTA */}
        <View style={styles.petCardSlimCtaRow}>
          <CtaButton label="VIEW CHART" onPress={onViewChart} />
        </View>
      </View>
    </View>
  );
}

// ─── PREVENTIVE CARE ITEM ─────────────────────────────────────────────────────

const URGENCY_ICON = {
  vaccine_overdue: 'warning',
  vaccine_due_soon: 'schedule',
  recheck: 'event-note',
};

const URGENCY_ACCENT_COLOR = (urgency, colors) => {
  if (urgency === 0) return colors.danger;
  if (urgency === 1) return colors.warning;
  return colors.sky;
};

/**
 * PreventiveCareItem — single row in the preventive care timeline.
 * Left accent border color and icon communicate urgency at a glance.
 */
function PreventiveCareItem({ item, onCta }) {
  const accentColor = URGENCY_ACCENT_COLOR(item.urgency, COLORS);
  const iconName = URGENCY_ICON[item.type] || 'info';

  return (
    <View style={[styles.careItemRow, { borderLeftColor: accentColor }]}>
      <MaterialIcons name={iconName} size={18} color={accentColor} style={styles.careItemIcon} />
      <View style={styles.careItemContent}>
        <Text style={styles.careItemPetName}>{item.petName}</Text>
        <Text style={styles.careItemLabel}>{item.label}</Text>
        {item.detail ? (
          <Text style={[styles.careItemDetail, { color: accentColor }]}>{item.detail}</Text>
        ) : null}
        {item.cta && onCta ? (
          <View style={styles.careItemCtaWrapper}>
            <CtaButton
              label={item.cta}
              onPress={onCta}
              danger={item.urgency === 0}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  // ── SCREEN ────────────────────────────────────────────────────────────────
  container: {
    flexGrow: 1,
    padding: SPACING.screenPadding,
    paddingTop: 60,
    backgroundColor: COLORS.cream,
  },

  // ── SECTION ───────────────────────────────────────────────────────────────
  section: {
    marginBottom: 30,
  },
  sectionHeader: {
    fontFamily: FONTS.black,
    fontSize: 13,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 14,
  },

  // ── KPI GRID (mirrors ClientDashboard) ────────────────────────────────────
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  kpiWrapper: {
    width: '48%',
    marginBottom: 14,
    position: 'relative',
  },
  kpiWrapperWide: {
    width: '100%',
  },
  kpiShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: COLORS.brand,
  },
  kpiCard: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    padding: 14,
    minHeight: 80,
    justifyContent: 'center',
  },
  kpiValue: {
    fontFamily: FONTS.black,
    fontSize: 28,
    color: COLORS.brand,
    lineHeight: 30,
  },
  kpiValueSmall: {
    fontSize: 16,
    lineHeight: 20,
  },
  kpiLabel: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  kpiSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // ── PROFILE COMPLETENESS ──────────────────────────────────────────────────
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    marginBottom: 12,
    gap: 8,
  },
  profileProgressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.borderLight,
    borderRadius: 0,
    overflow: 'hidden',
  },
  profileProgressFill: {
    height: '100%',
    backgroundColor: COLORS.sky,
  },
  profileNudgeText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.accent,
    flex: 2,
  },

  // ── MINI BAR CHART (mirrors ClientDashboard) ──────────────────────────────
  // ── Option E (edge-to-edge): chartContainer + chartShadow + chartBox are
  // redefined so the existing JSX renders as full-width sections with brown
  // top/bottom lines only. No boxed cards, no offset shadow.
  // chartContainer breaks out of the page's horizontal padding to reach the
  // screen edges. chartShadow is rendered as a no-op (zero size). chartBox
  // becomes a transparent passthrough that just provides 12px of horizontal
  // breathing room for the chart content.
  chartContainer: {
    marginHorizontal: -SPACING.screenPadding,
    marginBottom: 20,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: COLORS.brand,
    backgroundColor: COLORS.white,
    overflow: 'visible',
  },
  chartShadow: {
    width: 0,
    height: 0,
  },
  chartBox: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  chartTitle: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  chartBars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 80,
  },
  chartBarCol: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  chartBarTrack: {
    width: '100%',
    height: 60,
    justifyContent: 'flex-end',
  },
  chartBarFill: {
    width: '100%',
    backgroundColor: COLORS.sky,
    borderWidth: 1,
    borderColor: COLORS.brand,
    borderRadius: 0,
    minHeight: 3,
  },
  chartBarLabel: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  chartBarCount: {
    fontFamily: FONTS.black,
    fontSize: 10,
    color: COLORS.brand,
    position: 'absolute',
    top: -2,
    left: 0,
    right: 0,
    textAlign: 'center',
  },

  // ── EMPTY STATE ───────────────────────────────────────────────────────────
  emptyState: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },

  // ── PET CARD WRAPPER (offset shadow system) ───────────────────────────────
  petCardWrapper: {
    position: 'relative',
    marginBottom: 24,
  },
  petCardShadow: {
    ...SHADOW.card,
    backgroundColor: COLORS.brand,
  },
  petCard: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    padding: 16,
  },

  // ── PET CARD HEADER ───────────────────────────────────────────────────────
  petCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  petCardEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  petCardHeaderText: {
    flex: 1,
  },
  petCardName: {
    fontFamily: FONTS.black,
    fontSize: 20,
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  petCardMeta: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  petCardDivider: {
    height: 2,
    backgroundColor: COLORS.borderLight,
    marginBottom: 12,
  },

  // ── PET CARD ROW ──────────────────────────────────────────────────────────
  petCardRow: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  petCardRowLabel: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    width: 96,
    paddingTop: 1,
  },
  petCardRowContent: {
    flex: 1,
  },
  petCardValue: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.brand,
  },
  petCardValueMuted: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },

  // ── WEIGHT DELTA ──────────────────────────────────────────────────────────
  weightDelta: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    marginTop: 3,
  },

  // ── CTA BUTTON ────────────────────────────────────────────────────────────
  ctaWrapper: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  ctaShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: COLORS.brand,
  },
  ctaButton: {
    backgroundColor: COLORS.sky,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    alignItems: 'center',
  },
  ctaButtonPressed: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  ctaText: {
    fontFamily: FONTS.black,
    fontSize: 12,
    color: COLORS.textOnSky,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // ── SPENDING BREAKDOWN ────────────────────────────────────────────────────
  // Same Option E treatment as chartContainer — edge-to-edge with top + bottom
  // brown rules. The internal chartShadow/chartBox no-ops apply equally here.
  spendingSparklineContainer: {
    marginHorizontal: -SPACING.screenPadding,
    marginBottom: 16,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: COLORS.brand,
    backgroundColor: COLORS.white,
    overflow: 'visible',
  },
  spendingBlock: {
    marginBottom: 14,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    overflow: 'hidden',
  },
  spendingBlockTitle: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  spendingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  spendingRowName: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.brand,
    flex: 1,
  },
  spendingRowAmount: {
    fontFamily: FONTS.black,
    fontSize: 14,
    color: COLORS.brand,
  },
  balanceSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.success,
    borderRadius: 0,
  },
  balanceSummaryRowDanger: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.cream,
  },
  balanceSummaryText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.success,
    flex: 1,
  },

  // ── UPCOMING APPOINTMENTS ─────────────────────────────────────────────────
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    padding: 12,
    marginBottom: 8,
  },
  upcomingContent: {
    flex: 1,
  },
  upcomingService: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.brand,
  },
  upcomingMeta: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  upcomingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 0,
  },
  upcomingCountdown: {
    fontFamily: FONTS.black,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  upcomingEmpty: {
    alignItems: 'center',
    gap: 12,
  },

  // ── PIE CHART LEGEND ──────────────────────────────────────────────────────
  pieLegend: {
    width: '100%',
    paddingHorizontal: 4,
    marginTop: 12,
    gap: 6,
  },
  pieLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pieLegendDot: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: COLORS.brand,
    borderRadius: 0,
  },
  pieLegendLabel: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.brand,
    flex: 1,
  },
  pieLegendCount: {
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
  },

  // ── PREVENTIVE CARE ───────────────────────────────────────────────────────
  preventiveClearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.success,
    borderRadius: 0,
  },
  preventiveClearText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.success,
  },
  careItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderLeftWidth: 5,
    borderRadius: 0,
    padding: 12,
    marginBottom: 10,
  },
  careItemIcon: {
    marginRight: 10,
    marginTop: 1,
  },
  careItemContent: {
    flex: 1,
  },
  careItemPetName: {
    fontFamily: FONTS.black,
    fontSize: 11,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  careItemLabel: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.brand,
  },
  careItemDetail: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    marginTop: 2,
  },
  careItemCtaWrapper: {
    marginTop: 8,
  },

  // ── YEAR OVER YEAR ────────────────────────────────────────────────────────
  /**
   * yoyBarGroup wraps the two thin bars (this year + last year) for a single
   * month column. It sits inside chartBarTrack so the track controls height.
   */
  yoyBarGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    flex: 1,
    height: '100%',
  },
  yoyBarThis: {
    flex: 1,
    backgroundColor: COLORS.sky,
    borderWidth: 1,
    borderColor: COLORS.brand,
    minHeight: 2,
  },
  yoyBarLast: {
    flex: 1,
    backgroundColor: COLORS.borderLight,
    borderWidth: 1,
    borderColor: COLORS.accentLight,
    minHeight: 2,
  },
  yoyLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 10,
  },
  yoyLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  yoyLegendDot: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: COLORS.brand,
    borderRadius: 0,
  },
  yoyLegendText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ── SPENDING RANGE CHIPS ──────────────────────────────────────────────────
  rangeChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  rangeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: COLORS.brand,
    backgroundColor: COLORS.white,
    borderRadius: 0,
  },
  rangeChipActive: {
    backgroundColor: COLORS.sky,
  },
  rangeChipText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  rangeChipTextActive: {
    color: COLORS.textOnSky,
  },

  // ── WEIGHT SPARKLINE — tappable hit area ─────────────────────────────────
  weightSparklineHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weightZoomIcon: {
    marginLeft: 2,
  },

  // ── SEASONAL PATTERNS HEATMAP ─────────────────────────────────────────────
  heatmapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  heatmapCol: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 1,
  },
  heatmapCell: {
    width: '100%',
    height: 32,
    borderWidth: 1,
    borderColor: COLORS.brand,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heatmapCount: {
    fontFamily: FONTS.black,
    fontSize: 9,
    color: COLORS.brand,
  },
  heatmapLabel: {
    fontFamily: FONTS.bold,
    fontSize: 8,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  // ── TAB BAR ───────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    marginBottom: 20,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.white,
    gap: 3,
  },
  tabItemActive: {
    borderBottomColor: COLORS.sky,
  },
  tabLabel: {
    fontSize: 9,
    fontFamily: FONTS.black,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  tabLabelActive: {
    color: COLORS.sky,
  },

  // ── CONDITIONS OVERVIEW ───────────────────────────────────────────────────
  conditionsKpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  conditionsKpiPill: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderRadius: 0,
    padding: 12,
    alignItems: 'center',
  },
  conditionsKpiValue: {
    fontFamily: FONTS.black,
    fontSize: 28,
    lineHeight: 30,
  },
  conditionsKpiLabel: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  conditionsPerPet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 4,
    gap: 4,
  },
  conditionsPerPetName: {
    fontFamily: FONTS.black,
    fontSize: 12,
    color: COLORS.brand,
  },
  conditionsPerPetList: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.accent,
    flex: 1,
  },

  // ── CALENDAR MINI-VIEW ────────────────────────────────────────────────────
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calendarArrow: {
    padding: 4,
  },
  calendarMonthLabel: {
    fontFamily: FONTS.black,
    fontSize: 12,
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flex: 1,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayHeader: {
    width: '14.28%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  calendarDayHeaderText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
  },
  calendarCell: {
    width: '14.28%',
    alignItems: 'center',
    paddingVertical: 6,
    minHeight: 36,
  },
  calendarCellToday: {
    backgroundColor: COLORS.sky,
  },
  calendarCellSelected: {
    backgroundColor: COLORS.sky,
    opacity: 0.75,
  },
  calendarDayText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.brand,
  },
  calendarDayTextToday: {
    color: COLORS.white,
  },
  calendarDotRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  calendarDot: {
    width: 4,
    height: 4,
    backgroundColor: COLORS.sky,
    borderRadius: 2, // dots are circular — approved exception to zero border-radius
  },
  calendarDotMore: {
    fontFamily: FONTS.black,
    fontSize: 8,
    color: COLORS.sky,
    lineHeight: 4,
  },

  // ── PET CARD SLIM ─────────────────────────────────────────────────────────
  petCardSlimGaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  petCardSlimCtaRow: {
    marginTop: 10,
  },

  // ── SECTION HEADER ROW (with export button) ──────────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  // Suppresses the built-in marginBottom on SectionHeader when inside sectionHeaderRow,
  // because the row itself owns the spacing.
  sectionHeaderNoMargin: {
    marginBottom: 0,
  },
  exportButton: {
    padding: 6,
  },

  // ── SPENDING AVG LABEL ────────────────────────────────────────────────────
  spendingAvgLabel: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: COLORS.textMuted,
    textTransform: 'none',
    letterSpacing: 0,
  },

  // ── VACCINATION STATUS (HEALTH tab) ──────────────────────────────────────
  vacStatusPetBlock: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    padding: 12,
    marginBottom: 12,
  },
  vacStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  vacStatusPetName: {
    fontFamily: FONTS.black,
    fontSize: 13,
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    minWidth: 72,
  },
  vacStatusBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.borderLight,
    borderRadius: 0,
    overflow: 'hidden',
  },
  vacStatusBarFill: {
    height: '100%',
    borderRadius: 0,
  },
  vacStatusFraction: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    minWidth: 72,
    textAlign: 'right',
  },
  vacStatusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    gap: 8,
  },
  vacDoseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  vacStatusDot: {
    fontSize: 12,
    width: 18,
  },
  vacStatusName: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.brand,
    flex: 1,
  },
  vacStatusDetail: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── ALL PETS GAUGE STRIP ─────────────────────────────────────────────────
  allPetsGaugeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  allPetsGaugeCard: {
    alignItems: 'center',
    gap: 4,
    minWidth: 52,
  },
  allPetsGaugeName: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    maxWidth: 56,
    textAlign: 'center',
  },
  allPetsOverall: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── PER-PET SPENDING EXPAND ICON ─────────────────────────────────────────
  spendingExpandIcon: {
    marginLeft: 4,
  },

  // ── TRANSACTION DRILL-DOWN ────────────────────────────────────────────────
  transactionList: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.cream,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: 8,
  },
  transactionDate: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textMuted,
    width: 78,
  },
  transactionService: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.brand,
    flex: 1,
  },
  transactionAmount: {
    fontFamily: FONTS.black,
    fontSize: 12,
    color: COLORS.brand,
  },

  // ── COMMAND CENTER FILTERS ───────────────────────────────────────────────
  filterGroup: {
    marginBottom: 16,
  },
  filterLabel: {
    fontFamily: FONTS.black,
    fontSize: 9,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
    marginLeft: 2,
  },
  filterScroll: {
    marginHorizontal: -16, // using raw value since SPACING.md might be 16
    paddingHorizontal: 16,
  },
  filterChipsContainer: {
    gap: 8,
    paddingRight: 24,
    paddingVertical: 4, 
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    overflow: 'hidden',
  },
  segmentedItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: COLORS.brand,
  },
  segmentedItemLast: {
    borderRightWidth: 0,
  },
  segmentedItemActive: {
    backgroundColor: COLORS.sky,
  },
  segmentedText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  segmentedTextActive: {
    color: COLORS.textOnSky,
  },
});
