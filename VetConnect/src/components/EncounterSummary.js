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
 *   appointment       {object}   — Full appointment object (encounterItems, finalTotal, id, petId, petName)
 *   collapsed         {boolean}  — Controlled by parent
 *   onToggle          {function} — () => void
 *   onViewRecord      {function} — () => void — navigate to PetHistoryScreen
 *   onRebook          {function} — (appointment) => void — existing handleRebook
 *   salesTotal        {number|null} — From salesByAppt join; shows "Paid" line when set
 *   hideViewRecord    {boolean}  — Suppress "View Full Record" button (default false)
 *   externalMedRecord {object|null} — Pre-fetched medical_records doc; skips the
 *                                     internal getDocs fetch when provided.
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
  hideNextSteps = false,
  hideActions = false,
  externalMedRecord = null,
}) => {
  const [medRecord, setMedRecord] = useState(externalMedRecord);
  const [medRecordLoading, setMedRecordLoading] = useState(false);
  const [medRecordFetched, setMedRecordFetched] = useState(externalMedRecord !== null);

  useEffect(() => {
    if (externalMedRecord !== null) {
      setMedRecord(externalMedRecord);
      setMedRecordFetched(true);
      return;
    }
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
  }, [collapsed, medRecordFetched, appointment.id, externalMedRecord]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const items = appointment.encounterItems || [];
  const services = items.filter((i) => i.type === 'service');
  const products = items.filter((i) => i.type !== 'service');
  const drugs = items.filter((i) => (i.productClass || (i.isDrug ? 'medicine' : 'retail')) === 'medicine');
  const totalAmount = appointment.finalTotal ?? 0;

  // ── Service-grouped items (T4.201) ─────────────────────────────────────────
  // Separate service entries from product entries, then group products under
  // the service that auto-bundled them via sourceServiceId. Products without
  // a matching sourceServiceId (manual adds, legacy data) go to "Other Items".

  const serviceEntries = items.filter((i) => i.type === 'service');
  const productEntries = items.filter((i) => i.type !== 'service');

  const serviceGroups = [];
  const usedProductIndices = new Set();

  serviceEntries.forEach((svc) => {
    const linkedProducts = productEntries
      .map((p, idx) => ({ ...p, _idx: idx }))
      .filter((p) => p.sourceServiceId === svc.id && !usedProductIndices.has(p._idx));

    linkedProducts.forEach((p) => usedProductIndices.add(p._idx));

    serviceGroups.push({
      serviceId: svc.id,
      serviceName: svc.name,
      servicePrice: (svc.price ?? 0) * (svc.qty ?? 1),
      products: linkedProducts,
    });
  });

  // Products that had no matching service entry (manual adds, legacy data)
  const otherProducts = productEntries.filter((_, idx) => !usedProductIndices.has(idx));

  // Single-service: skip group headers entirely — render flat for cleaner look
  const isSingleService = serviceEntries.length <= 1 && otherProducts.length === 0;

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

      {/* SECTION A — SERVICES & ITEMS (grouped) or SERVICES PERFORMED (single-service flat) */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>
          {isSingleService ? 'Services Performed' : 'Services & Items'}
        </Text>

        {/* ── Single-service: flat layout (no group headers) ── */}
        {isSingleService && (
          <>
            {services.map((item, idx) => {
              const lineTotal = (item.price ?? 0) * (item.qty ?? 1);
              return (
                <View key={`svc-${idx}`}>
                  <View style={styles.itemRow}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {'✓ '}{item.name}
                    </Text>
                    <Text style={styles.itemPrice}>₱{lineTotal.toLocaleString()}</Text>
                  </View>
                </View>
              );
            })}

            {products.length > 0 && (
              <>
                {products.map((item, idx) => {
                  const lineTotal = (item.price ?? 0) * (item.qty ?? 1);
                  const instructions = resolveInstructions(item);
                  const pc = item.productClass || (item.isDrug ? 'medicine' : 'retail');
                  const emoji = pc === 'medicine' ? '💊' : pc === 'medical_supply' ? '🩹' : '📦';
                  return (
                    <View key={`prod-${idx}`}>
                      <View style={styles.itemRow}>
                        <Text style={styles.itemName} numberOfLines={2}>
                          {emoji} {item.name}
                          {item.qty > 1 ? ` ×${item.qty}` : ''}
                        </Text>
                        <Text style={styles.itemPrice}>₱{lineTotal.toLocaleString()}</Text>
                      </View>
                      {pc === 'medicine' && instructions ? (
                        <Text style={styles.sigLine}>directions (Sig): {instructions}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* ── Multi-service: grouped layout with dashed service headers ── */}
        {!isSingleService && serviceGroups.map((group, gIdx) => {
          const groupSubtotal = group.servicePrice +
            group.products.reduce((sum, p) => sum + (p.price ?? 0) * (p.qty ?? 1), 0);

          return (
            <View key={`grp-${gIdx}`} style={gIdx > 0 ? styles.groupDivider : undefined}>
              {/* Service header row: ── NAME ──────── ₱price */}
              <View style={styles.groupHeaderRow}>
                <Text style={styles.groupHeaderDash}>──</Text>
                <Text style={styles.groupHeaderName} numberOfLines={1}>
                  {group.serviceName.toUpperCase()}
                </Text>
                <View style={styles.groupHeaderLine} />
                <Text style={styles.groupHeaderPrice}>
                  ₱{group.servicePrice.toLocaleString()}
                </Text>
              </View>

              {/* Indented products under this service */}
              {group.products.map((item, idx) => {
                const lineTotal = (item.price ?? 0) * (item.qty ?? 1);
                const instructions = resolveInstructions(item);
                const pc = item.productClass || (item.isDrug ? 'medicine' : 'retail');
                const emoji = pc === 'medicine' ? '💊' : pc === 'medical_supply' ? '🩹' : '📦';
                return (
                  <View key={`gp-${idx}`}>
                    <View style={[styles.itemRow, styles.indentedItem]}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {emoji} {item.name}{item.qty > 1 ? ` ×${item.qty}` : ''}
                      </Text>
                      <Text style={styles.itemPrice}>₱{lineTotal.toLocaleString()}</Text>
                    </View>
                    {pc === 'medicine' && instructions ? (
                      <Text style={[styles.sigLine, { marginLeft: 36 }]}>
                        directions (Sig): {instructions}
                      </Text>
                    ) : null}
                  </View>
                );
              })}

              {/* Per-service subtotal — only when the group has products */}
              {group.products.length > 0 && (
                <View style={styles.subtotalRow}>
                  <Text style={styles.subtotalLabel}>Subtotal:</Text>
                  <Text style={styles.subtotalValue}>₱{groupSubtotal.toLocaleString()}</Text>
                </View>
              )}
            </View>
          );
        })}

        {/* ── Other Items: manual adds and legacy data without sourceServiceId ── */}
        {!isSingleService && otherProducts.length > 0 && (
          <View style={serviceGroups.length > 0 ? styles.groupDivider : undefined}>
            <View style={styles.groupHeaderRow}>
              <Text style={styles.groupHeaderDash}>──</Text>
              <Text style={styles.groupHeaderName}>OTHER ITEMS</Text>
              <View style={styles.groupHeaderLine} />
            </View>
            {otherProducts.map((item, idx) => {
              const lineTotal = (item.price ?? 0) * (item.qty ?? 1);
              const instructions = resolveInstructions(item);
              const pc = item.productClass || (item.isDrug ? 'medicine' : 'retail');
              const emoji = pc === 'medicine' ? '💊' : pc === 'medical_supply' ? '🩹' : '📦';
              return (
                <View key={`other-${idx}`}>
                  <View style={[styles.itemRow, styles.indentedItem]}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {emoji} {item.name}{item.qty > 1 ? ` ×${item.qty}` : ''}
                    </Text>
                    <Text style={styles.itemPrice}>₱{lineTotal.toLocaleString()}</Text>
                  </View>
                  {pc === 'medicine' && instructions ? (
                    <Text style={[styles.sigLine, { marginLeft: 36 }]}>
                      directions (Sig): {instructions}
                    </Text>
                  ) : null}
                </View>
              );
            })}
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Subtotal:</Text>
              <Text style={styles.subtotalValue}>
                ₱{otherProducts
                  .reduce((sum, p) => sum + (p.price ?? 0) * (p.qty ?? 1), 0)
                  .toLocaleString()}
              </Text>
            </View>
          </View>
        )}

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

      {/* SECTION C — NEXT STEPS (lazy-loaded from medical_records) — hidden when AppointmentCardContent enrichment owns this */}
      {!hideNextSteps && (medRecordLoading || (medRecordFetched && hasNextSteps)) && (
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
                <Text style={styles.nextStepRow}>Recheck in: {recheckIn}</Text>
              ) : null}
              {nextVisit ? (
                <Text style={styles.nextStepRow}>
                  📅 Next visit: {formatDisplayDate(nextVisit)}
                </Text>
              ) : null}
              {prognosis ? (
                <Text style={styles.nextStepRow}>Prognosis: {prognosis}</Text>
              ) : null}
              {patientStatus ? (
                <Text style={styles.nextStepRow}>Status: {patientStatus}</Text>
              ) : null}
            </>
          )}
        </View>
      )}

      {/* SECTION D — ACTION BUTTONS — hidden when AppointmentCardContent renders its own */}
      {!hideActions && (
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
      )}
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
    borderTopColor: COLORS.borderLight,
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

  // ── T4.201: Service group styles ──────────────────────────────────────────

  // Dashed separator row: ── SERVICE NAME ──────── ₱price
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 4,
  },
  groupHeaderDash: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginRight: 4,
  },
  groupHeaderName: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: COLORS.accent,
    flexShrink: 1,
  },
  groupHeaderLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: 4,
  },
  groupHeaderPrice: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  // Divider between service groups
  groupDivider: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderLight,
  },

  // Indented product row under a service header
  indentedItem: {
    marginLeft: 16,
  },

  // Per-service subtotal row
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 2,
    marginBottom: 2,
    gap: 6,
  },
  subtotalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  subtotalValue: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});

export default EncounterSummary;
