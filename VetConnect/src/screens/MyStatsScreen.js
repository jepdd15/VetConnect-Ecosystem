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

import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
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
import { Circle, Path, Svg } from 'react-native-svg';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONTS, SHADOW, SPACING } from '../theme/mobileTokens';
import { useMyStats } from '../hooks/useMyStats';
import SparkLine from '../components/SparkLine';
import VitalsZoomModal from '../components/VitalsZoomModal';

// Enable LayoutAnimation on Android (must run after all imports).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
 * every major section.
 */
function SectionHeader({ title }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
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
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
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
  const [spendingRange,  setSpendingRange]  = useState('6m');
  const [expandedPet,    setExpandedPet]    = useState(null);
  // weightZoomPet holds { petCard } when the weight zoom modal is open, null when closed.
  const [weightZoomPet,  setWeightZoomPet]  = useState(null);

  const stats = useMyStats({
    allAppointments,
    userPets,
    petRecords,
    salesData,
    vaccineAlerts,
    userProfile,
    spendingRange,
  });

  const {
    visitStats,
    financialStats,
    monthlyVisitData,
    relationship,
    petCards,
    diagnosisHistory,
    spendingBreakdown,
    visitTypePieData,
    upcomingAppointments,
    preventiveCare,
    yoyVisitData,
    seasonalPattern,
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

  // ── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 — YOUR RELATIONSHIP
          ════════════════════════════════════════════════════════════════ */}
      <View style={styles.section}>
        <SectionHeader title="YOUR RELATIONSHIP" />

        {/* 2-column KPI grid */}
        <View style={styles.statsGrid}>
          <KPICard
            label="CLIENT SINCE"
            value={relationship.clientSince}
            small
          />
          <KPICard
            label="TOTAL VISITS"
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

        {/* Profile completeness + consent removed — not relevant to pet owners */}
        {false && relationship.profileNudge && (
          <TouchableOpacity
            style={styles.profileRow}
            onPress={() => navigation.navigate('UserProfile')}
            activeOpacity={0.75}
          >
            <View style={styles.profileProgressTrack}>
              <View
                style={[
                  styles.profileProgressFill,
                  { width: `${relationship.profilePct}%` },
                ]}
              />
            </View>
            <Text style={styles.profileNudgeText}>{relationship.profileNudge}</Text>
            <MaterialIcons name="chevron-right" size={16} color={COLORS.accentLight} />
          </TouchableOpacity>
        )}

      </View>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — UPCOMING APPOINTMENTS
          ════════════════════════════════════════════════════════════════ */}
      <View style={styles.section}>
        <SectionHeader title="UPCOMING APPOINTMENTS" />

        {upcomingAppointments.length === 0 ? (
          <View style={styles.upcomingEmpty}>
            <Text style={styles.emptyState}>No upcoming appointments.</Text>
            <CtaButton
              label="BOOK A VISIT"
              onPress={() => navigateToBookAppointment()}
            />
          </View>
        ) : (
          upcomingAppointments.map(appt => (
            <View key={appt.id} style={styles.upcomingRow}>
              <View style={styles.upcomingContent}>
                <Text style={styles.upcomingService}>
                  {appt.serviceNames.join(', ')}
                </Text>
                <Text style={styles.upcomingMeta}>
                  {appt.petName}
                  {' · '}
                  {appt.scheduledDate.toLocaleDateString('en-PH', {
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
          SECTION 3 — VISIT TRENDS
          ════════════════════════════════════════════════════════════════ */}
      <View style={styles.section}>
        <SectionHeader title="VISIT TRENDS" />

        <View style={styles.chartContainer}>
          <View style={styles.chartShadow} />
          <View style={styles.chartBox}>
            <Text style={styles.chartTitle}>VISITS PER MONTH</Text>
            <View style={styles.chartBars}>
              {monthlyVisitData.map(m => (
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
                  {m.count > 0 && (
                    <Text style={styles.chartBarCount}>{m.count}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3b — YEAR OVER YEAR (only when prior-year data exists)
          ════════════════════════════════════════════════════════════════ */}
      {yoyVisitData.hasLastYear && (
        <View style={styles.section}>
          <SectionHeader title="YEAR OVER YEAR" />

          <View style={styles.chartContainer}>
            <View style={styles.chartShadow} />
            <View style={styles.chartBox}>
              <Text style={styles.chartTitle}>VISITS PER MONTH</Text>
              <View style={styles.chartBars}>
                {yoyVisitData.months.map(m => (
                  <View key={m.month} style={styles.chartBarCol}>
                    <View style={styles.chartBarTrack}>
                      {/* Side-by-side bars: this year (sky) and last year (borderLight) */}
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
              {/* Legend */}
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
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4 — VISIT BREAKDOWN (donut chart)
          ════════════════════════════════════════════════════════════════ */}
      <View style={styles.section}>
        <SectionHeader title="VISIT BREAKDOWN" />

        {visitTypePieData.length === 0 ? (
          <Text style={styles.emptyState}>No completed visits yet.</Text>
        ) : (
          <View style={styles.chartContainer}>
            <View style={styles.chartShadow} />
            <View style={styles.chartBox}>
              <PieChart data={visitTypePieData} size={160} />
            </View>
          </View>
        )}
      </View>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5 — YOUR PETS
          ════════════════════════════════════════════════════════════════ */}
      <View style={styles.section}>
        <SectionHeader title="YOUR PETS" />

        {petCards.length === 0 ? (
          <Text style={styles.emptyState}>
            No pets registered yet. Add a pet profile to see health cards here.
          </Text>
        ) : (
          petCards.map(petCard => (
            <PetHealthCard
              key={petCard.id}
              petCard={petCard}
              onBookNow={() => navigateToBookAppointment(petCard.id)}
              onBookRecheck={() => navigateToBookAppointment(petCard.id)}
              onWeightZoom={() => setWeightZoomPet(petCard)}
            />
          ))
        )}
      </View>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 6 — DIAGNOSIS HISTORY
          ════════════════════════════════════════════════════════════════ */}
      <View style={styles.section}>
        <SectionHeader title="DIAGNOSIS HISTORY" />

        {diagnosisHistory.totalConditions === 0 ? (
          <Text style={styles.emptyState}>No diagnoses recorded yet.</Text>
        ) : (
          <>
            {/* Summary KPIs */}
            <View style={styles.diagnosisSummaryRow}>
              <View style={styles.diagnosisSummaryPill}>
                <Text style={styles.diagnosisSummaryValue}>
                  {diagnosisHistory.totalConditions}
                </Text>
                <Text style={styles.diagnosisSummaryLabel}>total conditions</Text>
              </View>
              <View style={styles.diagnosisSummaryPill}>
                <Text style={styles.diagnosisSummaryValue}>
                  {diagnosisHistory.thisYearCount}
                </Text>
                <Text style={styles.diagnosisSummaryLabel}>this year</Text>
              </View>
            </View>

            {/* Most recurring */}
            {diagnosisHistory.mostRecurring && (
              <View style={styles.diagnosisRecurringRow}>
                <MaterialIcons name="repeat" size={13} color={COLORS.sky} />
                <Text style={styles.diagnosisRecurringText}>
                  Most recurring: {diagnosisHistory.mostRecurring.name}{' '}
                  <Text style={styles.diagnosisRecurringCount}>
                    ({diagnosisHistory.mostRecurring.count}×)
                  </Text>
                </Text>
              </View>
            )}

            {/* Per-pet timeline */}
            {Object.entries(diagnosisHistory.perPetTimeline).map(([petName, entries]) => (
              <View key={petName} style={styles.diagnosisPetGroup}>
                <Text style={styles.diagnosisPetName}>{petName.toUpperCase()}</Text>
                {entries.map((dx, idx) => (
                  <View key={`${dx.name}-${idx}`} style={styles.diagnosisEntry}>
                    <Text style={styles.diagnosisName}>{dx.name}</Text>
                    {dx.date && (
                      <Text style={styles.diagnosisDate}>
                        {dx.date.toLocaleDateString('en-PH', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </>
        )}
      </View>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5 — SPENDING BREAKDOWN
          ════════════════════════════════════════════════════════════════ */}
      <View style={styles.section}>
        <SectionHeader title="SPENDING BREAKDOWN" />

        {/* Date range toggle chips */}
        <View style={styles.rangeChipRow}>
          {SPENDING_RANGE_OPTIONS.map(chip => (
            <Pressable
              key={chip.key}
              style={[styles.rangeChip, spendingRange === chip.key && styles.rangeChipActive]}
              onPress={() => setSpendingRange(chip.key)}
            >
              <Text style={[
                styles.rangeChipText,
                spendingRange === chip.key && styles.rangeChipTextActive,
              ]}>
                {chip.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {spendingBreakdown.spendingBarData.every(m => m.amount === 0) &&
         spendingBreakdown.perPetList.length === 0 ? (
          <Text style={styles.emptyState}>No spending data for this period.</Text>
        ) : (
          <>
            {/* Monthly spending bar chart */}
            {spendingBreakdown.spendingBarData.some(m => m.amount > 0) && (
              <View style={styles.spendingSparklineContainer}>
                <View style={styles.chartShadow} />
                <View style={styles.chartBox}>
                  <Text style={styles.chartTitle}>MONTHLY SPENDING</Text>
                  <View style={styles.chartBars}>
                    {spendingBreakdown.spendingBarData.map(m => (
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

            {/* Per-pet spending — tappable rows with transaction drill-down */}
            {spendingBreakdown.perPetList.length > 0 && (
              <View style={styles.spendingBlock}>
                <Text style={styles.spendingBlockTitle}>BY PET</Text>
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

            {/* Per-service spending */}
            {spendingBreakdown.perServiceList.length > 0 && (
              <View style={styles.spendingBlock}>
                <Text style={styles.spendingBlockTitle}>BY SERVICE</Text>
                {spendingBreakdown.perServiceList.map(row => (
                  <View key={row.type} style={styles.spendingRow}>
                    <Text style={styles.spendingRowName}>{row.type}</Text>
                    <Text style={styles.spendingRowAmount}>
                      P{Math.round(row.amount).toLocaleString()}
                    </Text>
                  </View>
                ))}
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

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 7 — PREVENTIVE CARE
          ════════════════════════════════════════════════════════════════ */}
      <View style={styles.section}>
        <SectionHeader title="PREVENTIVE CARE" />

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

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 8 — SEASONAL PATTERNS (only when 3+ completed visits)
          ════════════════════════════════════════════════════════════════ */}
      {seasonalPattern.reduce((sum, m) => sum + m.count, 0) >= 3 && (
        <View style={styles.section}>
          <SectionHeader title="SEASONAL PATTERNS" />

          <View style={styles.chartContainer}>
            <View style={styles.chartShadow} />
            <View style={styles.chartBox}>
              <Text style={styles.chartTitle}>VISITS BY MONTH (ALL YEARS)</Text>
              <View style={styles.heatmapRow}>
                {seasonalPattern.map(cell => (
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

      {/* Weight zoom modal — rendered at root level so it overlays everything */}
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

// ─── PET HEALTH CARD ──────────────────────────────────────────────────────────

/**
 * PetHealthCard — rich per-pet summary card.
 *
 * Sections: header (name/emoji/species/age), weight sparkline + delta, last
 * visit, vaccine status, active medications, allergies, recheck countdown,
 * diagnosis history. Booking CTAs appear inline where relevant.
 */
function PetHealthCard({ petCard, onBookNow, onBookRecheck, onWeightZoom }) {
  const overdueVaccines = petCard.vaccineStatus?.statuses?.filter(
    v => v.status === 'overdue'
  ) ?? [];
  const hasOverdueVaccines = overdueVaccines.length > 0;

  const recheckIsOverdue = petCard.recheckInfo?.daysUntil != null
    && petCard.recheckInfo.daysUntil <= 0;
  const recheckIsDue = petCard.recheckInfo != null;

  return (
    <View style={styles.petCardWrapper}>
      <View style={styles.petCardShadow} />
      <View style={styles.petCard}>

        {/* ── PET HEADER ────────────────────────────────────────────── */}
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

        {/* ── WEIGHT ────────────────────────────────────────────────── */}
        <View style={styles.petCardRow}>
          <Text style={styles.petCardRowLabel}>WEIGHT</Text>
          <View style={styles.petCardRowContent}>
            {petCard.weightPoints.length > 0 ? (
              <>
                {/* Tapping the sparkline opens VitalsZoomModal with all weight history */}
                <TouchableOpacity
                  onPress={onWeightZoom}
                  activeOpacity={0.75}
                  style={styles.weightSparklineHit}
                >
                  <SparkLine
                    data={petCard.weightPoints}
                    lineColor={COLORS.sky}
                    unit="kg"
                    height={40}
                    showLatestValue
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
            ) : (
              <Text style={styles.petCardValueMuted}>No weight records</Text>
            )}
          </View>
        </View>

        {/* ── LAST VISIT ────────────────────────────────────────────── */}
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
                {petCard.lastVisitService ? ` · ${petCard.lastVisitService}` : ''}
              </Text>
            ) : (
              <Text style={styles.petCardValueMuted}>No visits yet</Text>
            )}
          </View>
        </View>

        {/* ── VACCINES ──────────────────────────────────────────────── */}
        <View style={styles.petCardRow}>
          <Text style={styles.petCardRowLabel}>VACCINES</Text>
          <View style={styles.petCardRowContent}>
            {petCard.vaccineStatus == null ? (
              <Text style={styles.petCardValueMuted}>Loading…</Text>
            ) : petCard.vaccineStatus.completeness == null ? (
              <Text style={styles.petCardValueMuted}>No vaccine records</Text>
            ) : (
              <>
                <View style={styles.vaccineGaugeRow}>
                  <CircularGauge
                    administered={petCard.vaccineStatus.completeness.administered}
                    total={petCard.vaccineStatus.completeness.total}
                  />
                  <View style={styles.vaccineGaugeText}>
                    <Text style={[
                      styles.petCardValue,
                      {
                        color: petCard.vaccineStatus.completeness.percentage >= 75
                          ? COLORS.success
                          : COLORS.warning,
                      },
                    ]}>
                      {petCard.vaccineStatus.completeness.administered}/
                      {petCard.vaccineStatus.completeness.total} current
                    </Text>
                    {hasOverdueVaccines && (
                      <Text style={styles.vaccineOverdueText}>
                        {overdueVaccines.map(v =>
                          `${v.name} overdue${v.daysUntilDue != null
                            ? ` (${Math.abs(v.daysUntilDue)} days)`
                            : ''
                          }`
                        ).join(', ')}
                      </Text>
                    )}
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
        {hasOverdueVaccines && (
          <View style={styles.petCardCtaRow}>
            <CtaButton label="BOOK VACCINATION VISIT" onPress={onBookNow} />
          </View>
        )}

        {/* ── ACTIVE MEDICATIONS ────────────────────────────────────── */}
        {petCard.activeMeds.length > 0 && (
          <View style={styles.petCardRow}>
            <Text style={styles.petCardRowLabel}>MEDICATIONS</Text>
            <View style={styles.petCardRowContent}>
              {petCard.activeMeds.map((med, idx) => (
                <View key={`${med.name}-${idx}`} style={styles.medEntry}>
                  <Text style={styles.petCardValue}>
                    {med.name}
                    {med.daysRemaining != null ? (
                      med.daysRemaining === 0
                        ? ' — course complete'
                        : ` (${med.daysRemaining} day${med.daysRemaining !== 1 ? 's' : ''} left)`
                    ) : ''}
                  </Text>
                  {/* Adherence bar — only rendered when sig.days was explicitly set */}
                  {med.adherence != null && (
                    <View style={styles.adherenceRow}>
                      <View style={styles.adherenceTrack}>
                        <View
                          style={[
                            styles.adherenceFill,
                            {
                              width: `${Math.min(med.adherence.pct, 100)}%`,
                              backgroundColor:
                                med.adherence.pct >= 100 ? COLORS.success
                                : med.adherence.pct >= 50  ? COLORS.warning
                                : COLORS.sky,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.adherenceLabel}>
                        Day {med.adherence.daysCompleted}/{med.adherence.totalDays}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── LAB TRENDS ────────────────────────────────────────────── */}
        {petCard.labSparklines?.length > 0 && (
          <View style={styles.petCardRow}>
            <Text style={styles.petCardRowLabel}>LAB TRENDS</Text>
            <View style={styles.petCardRowContent}>
              {petCard.labSparklines.slice(0, 3).map(lab => (
                <View key={lab.testName} style={styles.labTrendEntry}>
                  <Text style={styles.labTrendName}>{lab.testName}</Text>
                  <SparkLine
                    data={lab.data}
                    lineColor={COLORS.info}
                    unit={lab.unit ? ` ${lab.unit}` : ''}
                    height={30}
                    showDots
                    showLatestValue
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── ALLERGIES ─────────────────────────────────────────────── */}
        {Array.isArray(petCard.allergies) && petCard.allergies.length > 0 && (
          <View style={[styles.petCardRow, styles.allergyRow]}>
            <MaterialIcons name="warning" size={13} color={COLORS.warning} style={{ marginRight: 4 }} />
            <Text style={styles.petCardRowLabel}>ALLERGIES</Text>
            <View style={styles.petCardRowContent}>
              <Text style={[styles.petCardValue, { color: COLORS.warning }]}>
                {petCard.allergies.join(', ')}
              </Text>
            </View>
          </View>
        )}

        {/* ── RECHECK COUNTDOWN ─────────────────────────────────────── */}
        {recheckIsDue && (
          <>
            <View style={styles.petCardRow}>
              <Text style={styles.petCardRowLabel}>NEXT RECHECK</Text>
              <View style={styles.petCardRowContent}>
                {petCard.recheckInfo.daysUntil == null ? (
                  <Text style={styles.petCardValue}>{petCard.recheckInfo.recheckStr}</Text>
                ) : recheckIsOverdue ? (
                  <Text style={[styles.petCardValue, { color: COLORS.danger }]}>
                    OVERDUE ({Math.abs(petCard.recheckInfo.daysUntil)} {Math.abs(petCard.recheckInfo.daysUntil) === 1 ? 'day' : 'days'} ago)
                  </Text>
                ) : (
                  <Text style={styles.petCardValue}>
                    in {petCard.recheckInfo.daysUntil} day
                    {petCard.recheckInfo.daysUntil !== 1 ? 's' : ''}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.petCardCtaRow}>
              <CtaButton
                label="BOOK RECHECK"
                onPress={onBookRecheck}
                danger={recheckIsOverdue}
              />
            </View>
          </>
        )}

        {/* ── DIAGNOSIS HISTORY ─────────────────────────────────────── */}
        <View style={styles.petCardRow}>
          <Text style={styles.petCardRowLabel}>DIAGNOSES</Text>
          <View style={styles.petCardRowContent}>
            {petCard.diagnosisCount === 0 ? (
              <Text style={styles.petCardValueMuted}>None recorded</Text>
            ) : (
              <>
                <Text style={styles.petCardValue}>
                  {petCard.diagnosisCount} condition
                  {petCard.diagnosisCount !== 1 ? 's' : ''}
                </Text>
                {petCard.latestDiagnosis && (
                  <Text style={styles.petCardValueMuted}>
                    Latest: {petCard.latestDiagnosis.name}
                    {petCard.latestDiagnosis.date
                      ? ` (${petCard.latestDiagnosis.date.toLocaleDateString('en-PH', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })})`
                      : ''}
                  </Text>
                )}
              </>
            )}
          </View>
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
  milestone: 'cake',
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
  screenTitle: {
    fontFamily: FONTS.black,
    fontSize: 36,
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: -1,
    lineHeight: 38,
    marginBottom: 28,
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

  // ── CONSENT ROW ───────────────────────────────────────────────────────────
  consentRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  consentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  consentLabel: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.accent,
  },

  // ── MINI BAR CHART (mirrors ClientDashboard) ──────────────────────────────
  chartContainer: {
    position: 'relative',
    marginBottom: 4,
  },
  chartShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: COLORS.brand,
  },
  chartBox: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    padding: 14,
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

  // ── VACCINES — circular gauge + overdue text ──────────────────────────────
  vaccineGaugeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  vaccineGaugeText: {
    flex: 1,
    justifyContent: 'center',
  },
  vaccineOverdueText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.danger,
    marginTop: 3,
  },

  // ── ALLERGY ROW ───────────────────────────────────────────────────────────
  allergyRow: {
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginHorizontal: -4,
    marginBottom: 10,
    alignItems: 'center',
  },

  // ── CTA BUTTON ────────────────────────────────────────────────────────────
  petCardCtaRow: {
    marginTop: 4,
    marginBottom: 10,
  },
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

  // ── DIAGNOSIS HISTORY ─────────────────────────────────────────────────────
  diagnosisSummaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  diagnosisSummaryPill: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.brand,
    borderRadius: 0,
    padding: 12,
    alignItems: 'center',
  },
  diagnosisSummaryValue: {
    fontFamily: FONTS.black,
    fontSize: 28,
    color: COLORS.brand,
    lineHeight: 30,
  },
  diagnosisSummaryLabel: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
    textAlign: 'center',
  },
  diagnosisRecurringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.sky,
    borderRadius: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  diagnosisRecurringText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.brand,
    flex: 1,
  },
  diagnosisRecurringCount: {
    color: COLORS.sky,
  },
  diagnosisPetGroup: {
    marginBottom: 14,
  },
  diagnosisPetName: {
    fontFamily: FONTS.black,
    fontSize: 11,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  diagnosisEntry: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  diagnosisName: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.brand,
    flex: 1,
  },
  diagnosisDate: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textMuted,
    marginLeft: 8,
  },

  // ── SPENDING BREAKDOWN ────────────────────────────────────────────────────
  spendingSparklineContainer: {
    position: 'relative',
    marginBottom: 16,
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

  // ── MEDICATION ADHERENCE ──────────────────────────────────────────────────
  medEntry: {
    marginBottom: 6,
  },
  adherenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  adherenceTrack: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.borderLight,
    borderRadius: 0,
    overflow: 'hidden',
  },
  adherenceFill: {
    height: '100%',
    borderRadius: 0,
  },
  adherenceLabel: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: COLORS.textMuted,
    width: 60,
  },

  // ── LAB TRENDS ────────────────────────────────────────────────────────────
  labTrendEntry: {
    marginBottom: 10,
  },
  labTrendName: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
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
});
