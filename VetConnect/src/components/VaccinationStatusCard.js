import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../theme/mobileTokens';
import { getVaccineHistory } from '../utils/vaccineHelpers';

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const STATUS_STYLES = {
  current:  { borderColor: COLORS.success, badgeBg: '#E8F5E9', badgeText: COLORS.success },
  due_soon: { borderColor: COLORS.warning, badgeBg: '#FFF3E0', badgeText: COLORS.warning },
  overdue:  { borderColor: COLORS.danger,  badgeBg: '#FFEBEE', badgeText: COLORS.danger  },
  unknown:  { borderColor: '#9E9E9E',      badgeBg: '#F5F5F5', badgeText: '#616161'      },
};

const STATUS_LABELS = {
  current:  'CURRENT',
  due_soon: 'DUE SOON',
  overdue:  'OVERDUE',
  unknown:  'NO RECORD',
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

// ---------------------------------------------------------------------------
// SUB-COMPONENT: individual vaccine status card with tap-to-expand history
// ---------------------------------------------------------------------------

function VaccineCard({ vax, history, catalog }) {
  const [expanded, setExpanded] = useState(false);
  const st = STATUS_STYLES[vax.status] || STATUS_STYLES.unknown;

  const administrationHistory = expanded
    ? getVaccineHistory(vax.id, history, catalog)
    : [];

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

      {/* Tap to expand: full administration history */}
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
 * Shows completeness bar, overdue alert with booking CTA, color-coded per-vaccine
 * cards with tap-to-expand history, and an optional passport download button.
 * Follows the same collapsible pattern as the VITALS TRENDS and Rx Frequency cards.
 *
 * @param {Object}   props
 * @param {Array}    props.statuses           - From buildVaccinationStatus().statuses
 * @param {Object}   props.completeness       - From buildVaccinationStatus().completeness (or null)
 * @param {string}   props.petName            - Pet's display name
 * @param {string}   props.petId              - Pet's Firestore document ID
 * @param {Array}    props.history            - Full medical_records array (for getVaccineHistory)
 * @param {Array}    props.catalog            - Vaccine catalog (for getVaccineHistory)
 * @param {Object}   props.navigation         - React Navigation object
 * @param {Function} props.onDownloadPassport - Callback for passport PDF generation
 * @param {boolean}  props.hasVaccineRecords  - Gates the passport download button
 */
export default function VaccinationStatusCard({
  statuses,
  completeness,
  petName,
  petId,
  history,
  catalog,
  navigation,
  onDownloadPassport,
  hasVaccineRecords,
}) {
  const [collapsed, setCollapsed] = useState(true);

  const overdueCount = statuses.filter(v => v.status === 'overdue').length;
  const hasOverdue   = overdueCount > 0;

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

          {/* 2a: Completeness bar */}
          <View style={styles.completenessSection}>
            {completeness ? (
              <>
                <Text style={styles.completenessText}>
                  {completeness.administered}/{completeness.total} vaccines current ({completeness.percentage}%)
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
            ) : (
              <Text style={styles.completenessEmpty}>
                Keep {petName} protected — no vaccination records yet.
              </Text>
            )}
          </View>

          {/* 2b: Overdue alert banner */}
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
                <TouchableOpacity
                  style={styles.bookBtn}
                  onPress={() => navigation.navigate('BookAppointment', { prefillPetId: petId })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.bookBtnText}>BOOK VACCINATION VISIT</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 2c: Per-vaccine status cards */}
          {statuses.map(vax => (
            <VaccineCard
              key={vax.id}
              vax={vax}
              history={history}
              catalog={catalog}
            />
          ))}

          {/* 2d: Passport download button (gated on having actual records) */}
          {hasVaccineRecords && (
            <TouchableOpacity
              style={styles.passportBtn}
              onPress={onDownloadPassport}
              activeOpacity={0.85}
            >
              <MaterialIcons name="verified" size={16} color={COLORS.accent} />
              <Text style={styles.passportBtnText}>DOWNLOAD OFFICIAL PASSPORT</Text>
            </TouchableOpacity>
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
    backgroundColor: '#FFEBEE',
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
    fontSize: 11,
    color:    COLORS.textMuted,
    marginTop: 1,
  },

  // --- Passport download button (outlined, secondary) ---
  passportBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               8,
    borderWidth:       2,
    borderColor:       COLORS.accent,
    backgroundColor:   'transparent',
    borderRadius:      0,
    paddingVertical:   10,
    paddingHorizontal: 16,
    marginTop:         8,
  },
  passportBtnText: {
    color:         COLORS.accent,
    fontWeight:    '900',
    fontSize:      12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});
