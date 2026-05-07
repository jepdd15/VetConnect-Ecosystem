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

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONTS, SHADOW, SPACING } from '../theme/mobileTokens';
import { useMyStats } from '../hooks/useMyStats';
import SparkLine from '../components/SparkLine';

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

// ─── SCREEN ───────────────────────────────────────────────────────────────────

export default function MyStatsScreen({ route, navigation }) {
  const {
    allAppointments = [],
    userPets        = [],
    petRecords      = {},
    salesData       = [],
    vaccineAlerts   = [],
    userProfile     = null,
  } = route.params ?? {};

  const stats = useMyStats({
    allAppointments,
    userPets,
    petRecords,
    salesData,
    vaccineAlerts,
    userProfile,
  });

  const {
    visitStats,
    financialStats,
    monthlyVisitData,
    relationship,
    petCards,
    diagnosisHistory,
    spendingBreakdown,
    preventiveCare,
  } = stats;

  // ── HELPERS ─────────────────────────────────────────────────────────────────

  function navigateToBookAppointment(prefillPetId) {
    navigation.navigate('BookAppointment', { prefillPetId });
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      contentContainerStyle={styles.container}
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
          SECTION 2 — VISIT TRENDS
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
          SECTION 3 — YOUR PETS
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
            />
          ))
        )}
      </View>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4 — DIAGNOSIS HISTORY
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

        {spendingBreakdown.spendingSparkline.every(m => m.value === 0) &&
         spendingBreakdown.perPetList.length === 0 ? (
          <Text style={styles.emptyState}>No spending data yet.</Text>
        ) : (
          <>
            {/* Monthly sparkline */}
            {spendingBreakdown.spendingSparkline.some(m => m.value > 0) && (
              <View style={styles.spendingSparklineContainer}>
                <View style={styles.chartShadow} />
                <View style={styles.chartBox}>
                  <Text style={styles.chartTitle}>MONTHLY SPENDING</Text>
                  <SparkLine
                    data={spendingBreakdown.spendingSparkline}
                    lineColor={COLORS.sky}
                    unit=""
                    height={50}
                    showDateLabels
                  />
                </View>
              </View>
            )}

            {/* Per-pet spending */}
            {spendingBreakdown.perPetList.length > 0 && (
              <View style={styles.spendingBlock}>
                <Text style={styles.spendingBlockTitle}>BY PET</Text>
                {spendingBreakdown.perPetList.map(row => (
                  <View key={row.name} style={styles.spendingRow}>
                    <Text style={styles.spendingRowName}>{row.name}</Text>
                    <Text style={styles.spendingRowAmount}>
                      P{Math.round(row.amount).toLocaleString()}
                    </Text>
                  </View>
                ))}
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
          SECTION 6 — PREVENTIVE CARE
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
function PetHealthCard({ petCard, onBookNow, onBookRecheck }) {
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
                <SparkLine
                  data={petCard.weightPoints}
                  lineColor={COLORS.sky}
                  unit="kg"
                  height={40}
                  showLatestValue
                />
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
                <Text key={`${med.name}-${idx}`} style={styles.petCardValue}>
                  {med.name}
                  {med.daysRemaining != null ? (
                    med.daysRemaining === 0
                      ? ' — course complete'
                      : ` (${med.daysRemaining} day${med.daysRemaining !== 1 ? 's' : ''} left)`
                  ) : ''}
                </Text>
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

  // ── VACCINES — overdue text ───────────────────────────────────────────────
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
});
