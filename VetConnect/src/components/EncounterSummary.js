/**
 * EncounterSummary — Expandable encounter summary for completed visit cards.
 *
 * Shows services performed, medications dispensed, visit totals, and next-step
 * recommendations from the linked medical_records document. The NEXT STEPS
 * section is lazy-loaded on first expand to avoid N+1 queries on list render.
 *
 * This component is CONTROLLED — collapsed/expanded state lives in the parent.
 * Each integration point manages its own collapse independently.
 *
 * Props:
 *   appointment    {object}   — Full appointment object (encounterItems, finalTotal, id, petId, petName)
 *   collapsed      {boolean}  — Controlled by parent
 *   onToggle       {function} — () => void
 *   onViewRecord   {function} — () => void — navigate to PetHistoryScreen
 *   onRebook       {function} — (appointment) => void — existing handleRebook
 *   salesTotal     {number|null} — From salesByAppt join; shows "Paid" line when set
 *   hideViewRecord {boolean}  — Suppress "View Full Record" button (default false)
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { COLORS } from '../theme/mobileTokens';
import { formatDisplayDate } from '../utils/helpers';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Maps dosing frequency codes to human-readable labels.
 * Used as fallback when item.instructions is empty on a drug item.
 */
const FREQ_LABELS = {
  BID: 'twice daily',
  TID: 'three times daily',
  SID: 'once daily',
  QD:  'once daily',
  QID: 'four times daily',
  PRN: 'as needed',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Builds a dosing instruction string from a sig object.
 * Only used as fallback when item.instructions is empty AND item.isDrug is true.
 *
 * @param {{ dose, unit, frequency, duration, route }} sig
 * @returns {string}
 */
const buildSigLabel = (sig) => {
  if (!sig) return '';
  const freq = FREQ_LABELS[sig.frequency] || sig.frequency || '';
  const parts = [];
  if (sig.dose && sig.unit) parts.push(`${sig.dose} ${sig.unit}`);
  if (freq) parts.push(freq);
  if (sig.duration) parts.push(`for ${sig.duration} days`);
  if (sig.route) parts.push(`(${sig.route})`);
  return parts.join(' ');
};

/**
 * Resolves the display instructions for an encounter item.
 * Prefers the pre-formatted instructions string; falls back to sig construction
 * only for drug items with an empty instructions field.
 *
 * @param {{ instructions: string, sig: object, isDrug: boolean }} item
 * @returns {string}
 */
const resolveInstructions = (item) => {
  if (item.instructions) return item.instructions;
  if (item.isDrug && item.sig) return buildSigLabel(item.sig);
  return '';
};

// ─── Component ────────────────────────────────────────────────────────────────

const EncounterSummary = ({
  appointment,
  collapsed,
  onToggle,
  onViewRecord,
  onRebook,
  salesTotal,
  hideViewRecord = false,
}) => {
  const [medRecord, setMedRecord] = useState(null);
  const [medRecordLoading, setMedRecordLoading] = useState(false);
  const [medRecordFetched, setMedRecordFetched] = useState(false);

  // Lazy-load the linked medical_records doc on first expand.
  // medRecordFetched prevents re-querying if the user collapses and re-expands.
  useEffect(() => {
    if (collapsed || medRecordFetched) return;

    setMedRecordFetched(true);
    setMedRecordLoading(true);

    const q = query(
      collection(db, 'medical_records'),
      where('appointmentId', '==', appointment.id),
      limit(1),
    );

    getDocs(q)
      .then((snap) => {
        if (!snap.empty) setMedRecord(snap.docs[0].data());
      })
      .catch(() => { /* silently fail — legacy data with no linked record */ })
      .finally(() => setMedRecordLoading(false));
  }, [collapsed, medRecordFetched, appointment.id]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const items = appointment.encounterItems || [];
  const drugs = items.filter((i) => i.isDrug);
  const totalAmount = appointment.finalTotal ?? 0;

  // Medical record fields with multi-path fallbacks for schema variants.
  const recheckIn = medRecord?.soap?.recheckIn || medRecord?.dischargeSummary?.recheckIn || null;
  const prognosis = medRecord?.soap?.prognosis || null;
  const nextVisit = medRecord?.nextVisit || medRecord?.dischargeSummary?.nextVisit || null;
  const patientStatus = medRecord?.patientStatus || medRecord?.dischargeSummary?.patientStatus || null;

  const hasNextSteps = recheckIn || prognosis || nextVisit || patientStatus;

  // ── Collapsed mode ──────────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <TouchableOpacity
        style={styles.collapsedRow}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <Text style={styles.toggleLabel}>▼ Visit summary</Text>
        <Text style={styles.collapsedMeta}>
          {items.length} item{items.length !== 1 ? 's' : ''} · ₱{totalAmount.toLocaleString()}
        </Text>
      </TouchableOpacity>
    );
  }

  // ── Expanded mode ───────────────────────────────────────────────────────────

  return (
    <View style={styles.wrapper}>
      {/* Toggle row at top when expanded */}
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
        <Text style={styles.toggleLabel}>▲ Hide summary</Text>
      </TouchableOpacity>

      {/* SECTION A — SERVICES PERFORMED */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Services Performed</Text>

        {items.map((item, idx) => {
          const lineTotal = (item.price ?? 0) * (item.qty ?? 1);
          const instructions = resolveInstructions(item);
          return (
            <View key={`item-${idx}`}>
              <View style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {'✓ '}{item.name}
                  {item.qty > 1 ? ` ×${item.qty}` : ''}
                </Text>
                <Text style={styles.itemPrice}>₱{lineTotal.toLocaleString()}</Text>
              </View>
              {item.isDrug && instructions ? (
                <Text style={styles.sigLine}>💊 {instructions}</Text>
              ) : null}
            </View>
          );
        })}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={styles.totalValue}>₱{totalAmount.toLocaleString()}</Text>
        </View>
        {salesTotal != null && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Paid:</Text>
            <Text style={styles.totalValue}>₱{salesTotal.toLocaleString()}</Text>
          </View>
        )}
      </View>

      {/* SECTION B — MEDICATIONS DISPENSED (only when drug items exist) */}
      {drugs.length > 0 && (
        <View style={[styles.section, styles.sectionDivider]}>
          <Text style={styles.sectionHeader}>Medications Dispensed</Text>

          {drugs.map((drug, idx) => {
            const instructions = resolveInstructions(drug);
            return (
              <View key={`drug-${idx}`} style={styles.drugItem}>
                <Text style={styles.itemName}>💊 {drug.name}</Text>
                {instructions ? (
                  <Text style={styles.sigLine}>{instructions}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {/* SECTION C — NEXT STEPS (lazy-loaded from medical_records) */}
      {(medRecordLoading || (medRecordFetched && hasNextSteps)) && (
        <View style={[styles.section, styles.sectionDivider]}>
          <Text style={styles.sectionHeader}>Next Steps</Text>

          {medRecordLoading ? (
            <ActivityIndicator
              size="small"
              color={COLORS.sky}
              style={styles.loadingIndicator}
            />
          ) : (
            <>
              {recheckIn ? (
                <Text style={styles.nextStepRow}>🔄 Recheck in: {recheckIn}</Text>
              ) : null}
              {nextVisit ? (
                <Text style={styles.nextStepRow}>
                  📅 Next visit: {formatDisplayDate(nextVisit)}
                </Text>
              ) : null}
              {prognosis ? (
                <Text style={styles.nextStepRow}>🩺 Prognosis: {prognosis}</Text>
              ) : null}
              {patientStatus ? (
                <Text style={styles.nextStepRow}>Status: {patientStatus}</Text>
              ) : null}
            </>
          )}
        </View>
      )}

      {/* SECTION D — ACTION BUTTONS */}
      <View style={[styles.section, styles.sectionDivider, styles.actionRow]}>
        {!hideViewRecord && (
          <TouchableOpacity style={styles.actionBtn} onPress={onViewRecord} activeOpacity={0.7}>
            <Text style={styles.actionBtnText}>View Full Record</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onRebook(appointment)}
          activeOpacity={0.7}
        >
          <Text style={styles.actionBtnText}>Rebook</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Collapsed state: single tap target row
  collapsedRow: {
    paddingVertical: 6,
    gap: 2,
  },

  // Expanded wrapper
  wrapper: {
    paddingVertical: 8,
    borderRadius: 0,
  },

  // Toggle label — matches VisitTimeline pattern exactly
  toggleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.sky,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Collapsed meta line: "3 items · ₱1,500"
  collapsedMeta: {
    fontSize: 12,
    color: COLORS.textMuted,
  },

  // Section container
  section: {
    marginTop: 10,
  },
  sectionDivider: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 10,
  },

  // Section headers: uppercase, espresso, tight
  sectionHeader: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.accent,
    marginBottom: 6,
  },

  // Item row: name left, price right
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textPrimary,
    paddingRight: 8,
  },
  itemPrice: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },

  // Drug sig / instructions line
  sigLine: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginLeft: 20,
    marginBottom: 4,
  },

  // Drug item in MEDICATIONS section
  drugItem: {
    marginBottom: 6,
  },

  // Total and paid lines
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 4,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  // Next steps rows
  nextStepRow: {
    fontSize: 13,
    color: COLORS.textPrimary,
    marginBottom: 3,
  },

  // Loading spinner for lazy NEXT STEPS fetch
  loadingIndicator: {
    alignSelf: 'flex-start',
    marginVertical: 4,
  },

  // Action buttons row
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default EncounterSummary;
