import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../theme/mobileTokens';
import { getVaccineHistory } from '../utils/vaccineHelpers';

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const STATUS_STYLES = {
  current:    { borderColor: COLORS.success, badgeBg: '#E8F5E9', badgeText: COLORS.success },
  due_soon:   { borderColor: COLORS.warning, badgeBg: '#FFF3E0', badgeText: COLORS.warning },
  overdue:    { borderColor: COLORS.danger,  badgeBg: COLORS.dangerBg, badgeText: COLORS.danger },
  unknown:    { borderColor: '#9E9E9E',      badgeBg: '#F5F5F5', badgeText: '#616161'      },
  incomplete: { borderColor: COLORS.warning, badgeBg: '#FFF3E0', badgeText: COLORS.warning },
};

const STATUS_LABELS = {
  current:    'CURRENT',
  due_soon:   'DUE SOON',
  overdue:    'OVERDUE',
  unknown:    'NO RECORD',
  incomplete: 'INCOMPLETE',
};

/**
 * Philippine vaccination classification per RA 9482 and common clinical practice.
 * Vaccines not in this map default to 'RECOMMENDED'.
 */
const VACCINE_CLASSIFICATION = {
  rabies:        'REQUIRED',    // RA 9482 Anti-Rabies Act of 2007
  dhpp:          'CORE',
  fvrcp:         'CORE',
  bordetella:    'LIFESTYLE',
  leptospirosis: 'LIFESTYLE',
  felv:          'LIFESTYLE',
};

// ---------------------------------------------------------------------------
// INTERNAL HELPERS
// ---------------------------------------------------------------------------

/**
 * Formats a JS Date as a locale-aware short date for pet owners.
 * Returns 'N/A' for null dates.
 *
 * @param {Date|null} date
 * @returns {string}
 */
function fmtDate(date) {
  if (!date) return 'N/A';
  return date.toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

/**
 * Returns the "next due" date string given lastDate + intervalDays,
 * or 'N/A' when no date is available.
 *
 * @param {Date|null} lastDate
 * @param {number}    intervalDays
 * @returns {string}
 */
function computeNextDueLabel(lastDate, intervalDays) {
  if (!lastDate) return 'N/A';
  const nextDue = new Date(lastDate.getTime() + intervalDays * 86400000);
  return fmtDate(nextDue);
}

/**
 * Formats an interval in days as a human-readable "Recommended every N year(s)/month(s)" string.
 *
 * @param {number} days
 * @returns {string}
 */
function formatInterval(days) {
  if (!days || days <= 0) return '';
  if (days >= 365) {
    const years = Math.round(days / 365);
    return `Recommended every ${years} year${years !== 1 ? 's' : ''}`;
  }
  const months = Math.round(days / 30);
  return `Recommended every ${months} month${months !== 1 ? 's' : ''}`;
}

/**
 * Formats a due date label for the upcoming schedule timeline.
 * Guards against null daysUntilDue.
 *
 * @param {{ daysUntilDue: number|null, status: string }} vax
 * @returns {string}
 */
function formatDueLabel(vax) {
  const days = vax.daysUntilDue;
  if (days == null) return 'Due soon';
  if (days < 0) return 'Now';
  if (days === 0) return 'Today';
  if (days <= 30) return `in ${days} day${days !== 1 ? 's' : ''}`;
  if (days <= 365) {
    const months = Math.round(days / 30);
    return `in ${months} month${months !== 1 ? 's' : ''}`;
  }
  const years = Math.round(days / 365);
  return `in ${years} year${years !== 1 ? 's' : ''}`;
}

// ---------------------------------------------------------------------------
// SUB-COMPONENT: individual vaccine status card with tap-to-expand history
// ---------------------------------------------------------------------------

function VaccineCard({
  vax,
  history,
  catalog,
  navigation,
  petId,
  disabledVaccines,
  onToggleReminder,
  servicesPriceMap,
}) {
  const [expanded, setExpanded] = useState(false);
  const st = STATUS_STYLES[vax.status] || STATUS_STYLES.unknown;

  const administrationHistory = expanded
    ? getVaccineHistory(vax.id, history, catalog)
    : [];

  // Item 16: Resolve REQUIRED / CORE / LIFESTYLE / RECOMMENDED classification
  const classification = VACCINE_CLASSIFICATION[vax.id?.toLowerCase()] || 'RECOMMENDED';

  // Item 19: Cost estimate from services price map (optional prop — graceful fallback)
  const estimatedCost = servicesPriceMap
    ? (servicesPriceMap.get(vax.name?.toLowerCase()) ?? null)
    : null;

  // Item 18: Reminder opt-in state (default: enabled)
  const reminderEnabled = disabledVaccines ? !disabledVaccines.has(vax.id) : true;

  return (
    <View style={[styles.vaxCard, { borderColor: st.borderColor }]}>
      {/* Header row: vaccine name + status badge */}
      <TouchableOpacity
        style={styles.vaxCardHeader}
        onPress={() => setExpanded(prev => !prev)}
        activeOpacity={0.7}
      >
        <Text style={styles.vaxName}>{vax.name}</Text>
        <View style={[styles.statusBadge, { backgroundColor: st.badgeBg }]}>
          <Text style={[styles.statusBadgeText, { color: st.badgeText }]}>
            {STATUS_LABELS[vax.status] || 'UNKNOWN'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Item 16: Classification badge row */}
      <View style={styles.classificationRow}>
        <View style={[
          styles.classificationBadge,
          {
            backgroundColor:
              classification === 'REQUIRED' ? COLORS.dangerBg
              : COLORS.cream,
          },
        ]}>
          <Text style={[
            styles.classificationBadgeText,
            {
              color:
                classification === 'REQUIRED' ? COLORS.danger
                : classification === 'CORE'   ? COLORS.accent
                : COLORS.textMuted,
            },
          ]}>
            {classification}
          </Text>
        </View>
      </View>

      {/* Dose dots row — only shown for multi-dose vaccines */}
      {vax.dosesRequired > 1 && (
        <View style={styles.doseDotsRow}>
          {Array.from({ length: vax.dosesRequired }, (_, i) => (
            <Text key={i} style={[styles.doseDot, {
              color: i < vax.dosesGiven ? COLORS.success : COLORS.borderLight,
            }]}>
              {i < vax.dosesGiven ? '●' : '○'}
            </Text>
          ))}
          <Text style={styles.doseFractionText}>
            Dose {vax.dosesGiven}/{vax.dosesRequired}
          </Text>
        </View>
      )}

      {/* Item 12: Recommended interval text */}
      {vax.intervalDays > 0 && (
        <Text style={styles.vaxInterval}>{formatInterval(vax.intervalDays)}</Text>
      )}

      {/* Date row */}
      <View style={styles.vaxDateRow}>
        <Text style={styles.vaxDateLabel}>
          Last vaccinated: <Text style={styles.vaxDateValue}>{fmtDate(vax.lastDate)}</Text>
        </Text>
        <Text style={styles.vaxDateLabel}>
          Next due: <Text style={styles.vaxDateValue}>{computeNextDueLabel(vax.lastDate, vax.intervalDays)}</Text>
        </Text>
      </View>

      {/* Days annotation */}
      {vax.status === 'due_soon' && vax.daysUntilDue !== null && (
        <Text style={[styles.daysAnnotation, { color: COLORS.warning }]}>
          {vax.daysUntilDue} day{vax.daysUntilDue !== 1 ? 's' : ''} until due
        </Text>
      )}
      {vax.status === 'overdue' && vax.daysUntilDue !== null && (
        <Text style={[styles.daysAnnotation, { color: COLORS.danger }]}>
          {Math.abs(vax.daysUntilDue)} day{Math.abs(vax.daysUntilDue) !== 1 ? 's' : ''} overdue
        </Text>
      )}
      {vax.status === 'incomplete' && vax.daysUntilDue !== null && vax.daysUntilDue >= 0 && (
        <Text style={[styles.daysAnnotation, { color: COLORS.warning }]}>
          Dose {vax.nextDoseNumber} due in {vax.daysUntilDue} day{vax.daysUntilDue !== 1 ? 's' : ''}
        </Text>
      )}
      {vax.status === 'incomplete' && vax.daysUntilDue !== null && vax.daysUntilDue < 0 && (
        <Text style={[styles.daysAnnotation, { color: COLORS.danger }]}>
          Dose {vax.nextDoseNumber} overdue by {Math.abs(vax.daysUntilDue)} day{Math.abs(vax.daysUntilDue) !== 1 ? 's' : ''}
        </Text>
      )}

      {/* Item 14: Per-vaccine SCHEDULE button on overdue / no-record / incomplete cards */}
      {(vax.status === 'overdue' || vax.status === 'unknown' || vax.status === 'incomplete') && navigation && petId && (
        <TouchableOpacity
          style={styles.perVaxBookBtn}
          onPress={() => navigation.navigate('BookAppointment', { prefillPetId: petId })}
          activeOpacity={0.85}
        >
          <Text style={styles.perVaxBookBtnText}>
            {vax.nextDoseNumber && vax.dosesRequired > 1
              ? `SCHEDULE DOSE ${vax.nextDoseNumber}`
              : 'SCHEDULE'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Item 19: Cost estimate */}
      {estimatedCost != null && (
        <Text style={styles.costEstimate}>Estimated cost: ₱{estimatedCost}</Text>
      )}

      {/* Item 18: Push reminder toggle */}
      {onToggleReminder && (
        <View style={styles.reminderRow}>
          <Text style={styles.reminderLabel}>Remind me when due</Text>
          <Switch
            value={reminderEnabled}
            onValueChange={(val) => onToggleReminder(vax.id, val)}
            trackColor={{ false: COLORS.borderLight, true: COLORS.sky }}
            thumbColor={reminderEnabled ? COLORS.sky : COLORS.textMuted}
          />
        </View>
      )}

      {/* Item 11: Only show expand toggle when the vaccine has actual record evidence */}
      {vax.status !== 'unknown' && (
        <TouchableOpacity
          style={styles.expandToggle}
          onPress={() => setExpanded(prev => !prev)}
          activeOpacity={0.7}
        >
          <Text style={styles.expandToggleText}>
            {expanded ? 'Hide history' : 'View history'}
          </Text>
          <MaterialIcons
            name={expanded ? 'expand-less' : 'expand-more'}
            size={16}
            color={COLORS.accentLight}
          />
        </TouchableOpacity>
      )}

      {/* Expanded: full history list */}
      {expanded && (
        <View style={styles.historyContainer}>
          {administrationHistory.length === 0 ? (
            <Text style={styles.historyEmpty}>No detailed history available.</Text>
          ) : (
            administrationHistory.map((entry, i) => (
              <View key={i}>
                {i > 0 && <View style={styles.historySeparator} />}
                <View style={styles.historyEntry}>
                  <Text style={styles.historyDate}>{fmtDate(entry.date)}</Text>
                  {entry.doseNumber ? (
                    <Text style={styles.historyMeta}>Dose {entry.doseNumber}</Text>
                  ) : null}
                  <Text style={styles.historyVet}>Administered by {entry.vetName}</Text>
                  {entry.lotNumber ? (
                    <Text style={styles.historyMeta}>Lot: {entry.lotNumber}</Text>
                  ) : null}
                  {entry.manufacturer ? (
                    <Text style={styles.historyMeta}>Manufacturer: {entry.manufacturer}</Text>
                  ) : null}
                  {entry.routeOfAdmin ? (
                    <Text style={styles.historyMeta}>Route: {entry.routeOfAdmin}</Text>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

/**
 * VaccinationStatusCard — collapsible vaccination dashboard for pet owners.
 *
 * Shows completeness bar (or 0% empty state with booking CTA), overdue alert
 * with booking CTA, color-coded per-vaccine cards with tap-to-expand history,
 * upcoming vaccination timeline, and classification badges.
 *
 * @param {Object}   props
 * @param {Array}    props.statuses             - From buildVaccinationStatus().statuses (pre-sorted by urgency)
 * @param {Object}   props.completeness         - From buildVaccinationStatus().completeness (or null)
 * @param {string}   props.petName              - Pet's display name
 * @param {string}   props.petId                - Pet's Firestore document ID
 * @param {Array}    props.history              - Full medical_records array (for getVaccineHistory)
 * @param {Array}    props.catalog              - Vaccine catalog (for getVaccineHistory)
 * @param {Object}   [props.navigation]         - React Navigation object (optional; needed for book CTAs)
 * @param {Set}      [props.vaccinePreferences] - Set of disabled vaccine IDs (for reminder toggle)
 * @param {Function} [props.onToggleReminder]   - Callback(vaccineId, enabled) for reminder toggle
 * @param {Map}      [props.servicesPriceMap]   - name→price Map from services collection (optional)
 */
export default function VaccinationStatusCard({
  statuses,
  completeness,
  petName,
  petId,
  history,
  catalog,
  navigation,
  vaccinePreferences,
  onToggleReminder,
  servicesPriceMap,
}) {
  const [collapsed, setCollapsed] = useState(true);

  const overdueCount = statuses.filter(v => v.status === 'overdue').length;
  const hasOverdue   = overdueCount > 0;

  // Item 15: Upcoming vaccination timeline — exclude unknown (no date data), sort by daysUntilDue
  const upcomingVaccines = statuses
    .filter(v => v.status !== 'unknown' && v.daysUntilDue != null)
    .sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0));

  // ------------------------------------------------------------------
  // Header (always visible)
  // ------------------------------------------------------------------
  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setCollapsed(prev => !prev)}
        activeOpacity={0.7}
      >
        <Text style={styles.cardTitle}>VACCINATION STATUS</Text>
        <MaterialIcons
          name={collapsed ? 'expand-more' : 'expand-less'}
          size={20}
          color={COLORS.accent}
        />
      </TouchableOpacity>

      {/* ------------------------------------------------------------------
          Body — only rendered when expanded
      ------------------------------------------------------------------ */}
      {!collapsed && (
        <View style={styles.cardBody}>

          {/* Item 13: Completeness bar — 0% shows empty state; else progress bar */}
          <View style={styles.completenessSection}>
            {completeness ? (
              completeness.percentage === 0 ? (
                <>
                  <Text style={styles.zeroStateText}>
                    No vaccinations on record — protect {petName} today
                  </Text>
                  {navigation && petId && (
                    <TouchableOpacity
                      style={styles.bookBtn}
                      onPress={() => navigation.navigate('BookAppointment', { prefillPetId: petId })}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.bookBtnText}>BOOK FIRST VACCINATION</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.completenessText}>
                    {completeness.administered}/{completeness.total} series complete ({completeness.percentage}%)
                  </Text>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${completeness.percentage}%`,
                          backgroundColor:
                            completeness.percentage >= 75 ? COLORS.success
                            : completeness.percentage >= 50 ? COLORS.warning
                            : COLORS.danger,
                        },
                      ]}
                    />
                  </View>
                </>
              )
            ) : (
              <Text style={styles.completenessEmpty}>
                Keep {petName} protected — no vaccination records yet.
              </Text>
            )}
          </View>

          {/* Overdue alert banner */}
          {hasOverdue && (
            <View style={styles.overdueWrapper}>
              <View style={styles.overdueShadow} />
              <View style={styles.overdueBanner}>
                <View style={styles.overdueRow}>
                  <MaterialIcons name="warning" size={18} color={COLORS.danger} />
                  <Text style={styles.overdueText}>
                    {petName} has {overdueCount} overdue vaccine{overdueCount !== 1 ? 's' : ''}
                  </Text>
                </View>
                {navigation && petId && (
                  <TouchableOpacity
                    style={styles.bookBtn}
                    onPress={() => navigation.navigate('BookAppointment', { prefillPetId: petId })}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.bookBtnText}>BOOK VACCINATION VISIT</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Per-vaccine status cards (pre-sorted by urgency from parent) */}
          {statuses.map(vax => (
            <VaccineCard
              key={vax.id}
              vax={vax}
              history={history}
              catalog={catalog}
              navigation={navigation}
              petId={petId}
              disabledVaccines={vaccinePreferences}
              onToggleReminder={onToggleReminder}
              servicesPriceMap={servicesPriceMap}
            />
          ))}

          {/* Item 15: Upcoming vaccination schedule timeline */}
          {upcomingVaccines.length > 0 && (
            <View style={styles.scheduleSection}>
              <Text style={styles.scheduleSectionLabel}>UPCOMING SCHEDULE</Text>
              {upcomingVaccines.map((vax) => (
                <View key={vax.id} style={styles.scheduleRow}>
                  <View style={[
                    styles.scheduleDot,
                    { backgroundColor: STATUS_STYLES[vax.status]?.borderColor || STATUS_STYLES.unknown.borderColor },
                  ]} />
                  <Text style={styles.scheduleName} numberOfLines={1}>{vax.name}</Text>
                  <Text style={styles.scheduleTime}>{formatDueLabel(vax)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // --- Outer card (matches trendsCard / rxFreqCard pattern) ---
  card: {
    backgroundColor: COLORS.white,
    borderWidth:     2,
    borderColor:     COLORS.border,
    borderRadius:    0,
    marginBottom:    16,
  },
  cardHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical:   12,
  },
  cardTitle: {
    fontSize:      12,
    fontWeight:    '900',
    color:         COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingBottom:     14,
  },

  // --- Completeness bar ---
  completenessSection: {
    marginBottom: 12,
  },
  completenessText: {
    fontSize:     13,
    fontWeight:   '700',
    color:        COLORS.textPrimary,
    marginBottom: 6,
  },
  completenessEmpty: {
    fontSize:  13,
    color:     COLORS.textMuted,
    fontStyle: 'italic',
  },
  progressTrack: {
    height:          8,
    backgroundColor: COLORS.white,
    borderWidth:     1,
    borderColor:     COLORS.border,
    borderRadius:    0,
    overflow:        'hidden',
  },
  progressFill: {
    height:       8,
    borderRadius: 0,
  },

  // --- Item 13: 0% completeness empty state ---
  zeroStateText: {
    fontSize:     13,
    fontWeight:   '700',
    color:        COLORS.warning,
    marginBottom: 8,
  },

  // --- Overdue alert banner (neubrutalist offset shadow) ---
  overdueWrapper: {
    marginBottom: 12,
  },
  overdueShadow: {
    position:        'absolute',
    top:             4,
    left:            4,
    right:           -4,
    bottom:          -4,
    backgroundColor: COLORS.brand,
  },
  overdueBanner: {
    backgroundColor: COLORS.dangerBg,
    borderWidth:     2,
    borderColor:     COLORS.danger,
    borderRadius:    0,
    padding:         12,
  },
  overdueRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    marginBottom:  8,
  },
  overdueText: {
    fontSize:   13,
    fontWeight: '700',
    color:      COLORS.danger,
    flex:       1,
  },
  bookBtn: {
    backgroundColor: COLORS.danger,
    borderWidth:     2,
    borderColor:     COLORS.brand,
    borderRadius:    0,
    paddingVertical:   8,
    paddingHorizontal: 12,
    alignItems:      'center',
  },
  bookBtnText: {
    color:         COLORS.white,
    fontWeight:    '900',
    fontSize:      11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // --- Per-vaccine card ---
  vaxCard: {
    borderWidth:  2,
    borderRadius: 0,
    marginBottom: 10,
    padding:      12,
    backgroundColor: COLORS.white,
  },
  vaxCardHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   6,
  },
  vaxName: {
    fontSize:   14,
    fontWeight: '700',
    color:      COLORS.textPrimary,
    flex:       1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      0,
  },
  statusBadgeText: {
    fontSize:      10,
    fontWeight:    '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // --- Item 16: Classification badge ---
  classificationRow: {
    flexDirection: 'row',
    marginBottom:  4,
  },
  classificationBadge: {
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      0,
  },
  classificationBadgeText: {
    fontSize:      9,
    fontWeight:    '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // --- Dose dots row (multi-dose vaccines only) ---
  doseDotsRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    marginTop:     6,
    marginBottom:  4,
    paddingHorizontal: 2,
  },
  doseDot: {
    fontSize: 14,
  },
  doseFractionText: {
    fontSize:   11,
    fontWeight: '700',
    color:      COLORS.accent,
    marginLeft: 6,
  },

  // --- Item 12: Recommended interval text ---
  vaxInterval: {
    fontSize:  10,
    color:     COLORS.textMuted,
    marginTop: 1,
    marginBottom: 4,
  },

  vaxDateRow: {
    gap:          4,
    marginBottom: 4,
  },
  vaxDateLabel: {
    fontSize: 12,
    color:    COLORS.textMuted,
  },
  vaxDateValue: {
    color:      COLORS.textPrimary,
    fontWeight: '600',
  },
  daysAnnotation: {
    fontSize:   11,
    fontWeight: '700',
    marginTop:  2,
  },

  // --- Item 14: Per-vaccine SCHEDULE button ---
  perVaxBookBtn: {
    backgroundColor: COLORS.sky,
    borderWidth:     2,
    borderColor:     COLORS.brand,
    borderRadius:    0,
    paddingVertical:   6,
    paddingHorizontal: 10,
    alignSelf:       'flex-start',
    marginTop:       6,
  },
  perVaxBookBtnText: {
    color:         COLORS.textOnSky,
    fontWeight:    '900',
    fontSize:      10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // --- Item 19: Cost estimate ---
  costEstimate: {
    fontSize:  11,
    color:     COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },

  // --- Item 18: Reminder toggle row ---
  reminderRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      8,
    paddingTop:     8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  reminderLabel: {
    fontSize:   12,
    color:      COLORS.textMuted,
    fontWeight: '600',
  },

  expandToggle: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    marginTop:     8,
  },
  expandToggleText: {
    fontSize:  11,
    color:     COLORS.accentLight,
    fontStyle: 'italic',
  },

  // --- Expanded history ---
  historyContainer: {
    marginTop:       8,
    paddingTop:      8,
    borderTopWidth:  1,
    borderTopColor:  COLORS.borderLight,
  },
  historyEmpty: {
    fontSize:  12,
    color:     COLORS.textMuted,
    fontStyle: 'italic',
  },
  historyEntry: {
    paddingVertical: 6,
  },
  historySeparator: {
    height:          1,
    backgroundColor: COLORS.borderLight,
  },
  historyDate: {
    fontSize:     12,
    fontWeight:   '700',
    color:        COLORS.textPrimary,
    marginBottom: 2,
  },
  historyVet: {
    fontSize: 12,
    color:    COLORS.textSecondary,
  },
  historyMeta: {
    fontSize:  11,
    color:     COLORS.textMuted,
    marginTop: 1,
  },

  // --- Item 15: Upcoming schedule timeline ---
  scheduleSection: {
    marginTop:       12,
    paddingTop:      12,
    borderTopWidth:  1,
    borderTopColor:  COLORS.borderLight,
    gap:             6,
  },
  scheduleSectionLabel: {
    fontSize:      10,
    fontWeight:    '900',
    color:         COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom:  4,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    paddingVertical: 3,
  },
  scheduleDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
    flexShrink:   0,
  },
  scheduleName: {
    fontSize:   12,
    fontWeight: '600',
    color:      COLORS.textPrimary,
    flex:       1,
  },
  scheduleTime: {
    fontSize:   11,
    color:      COLORS.textMuted,
    fontStyle:  'italic',
    flexShrink: 0,
  },
});
