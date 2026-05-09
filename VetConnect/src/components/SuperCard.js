import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, FlatList, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { COLORS, SHADOW } from '../theme/mobileTokens';
import { getClientStatusColor, getClientStatusIcon, getClientStatusLabel } from "../utils/statusLabels";
import { formatFirestoreTime } from '../utils/helpers';
import { buildVisitTimeline } from '../utils/buildVisitTimeline';
import VisitTimeline from './VisitTimeline';
import WaitTimeMetrics from './WaitTimeMetrics';
import EncounterSummary from './EncounterSummary';

const SPECIES_EMOJI = {
  Dog: '🐶',
  Canine: '🐶',
  Cat: '🐱',
  Feline: '🐱',
};

const getSpeciesEmoji = (species) => SPECIES_EMOJI[species] || '🐾';

const getWhatsNext = (status, caseDay) => {
  switch (status) {
    case 'arrived':
      return "You're checked in! A veterinarian will be with your pet shortly.";
    case 'in-consult':
      return "Your pet is being attended to right now. We'll update you on next steps when they're done.";
    case 'dispensing':
      return "Almost done! Your pet's medications are being prepared. Next: checkout.";
    case 'billing':
      return "Your pet is ready to go home! We're preparing your bill now.";
    case 'confined':
      return `Your pet is resting comfortably under our care.${caseDay > 1 ? ` Day ${caseDay} of care.` : ''} Call us anytime for updates.`;
    case 'on-hold':
      return "The vet has paused briefly — we'll resume shortly.";
    default:
      return null;
  }
};

const formatServiceDuration = (svc) => {
  if (svc.serviceStatus !== 'completed') return '';
  const start = svc.serviceStartedAt;
  const end = svc.serviceCompletedAt;
  if (!start || !end) return '';
  const startMs = typeof start.toDate === 'function' ? start.toDate().getTime() : new Date(start).getTime();
  const endMs = typeof end.toDate === 'function' ? end.toDate().getTime() : new Date(end).getTime();
  const mins = Math.round((endMs - startMs) / 60000);
  if (!Number.isFinite(mins) || mins <= 0) return '';
  return ` (${mins} min)`;
};

export default function SuperCard({
  appointment,
  clinicPhone = '',
  queueAhead = null,
  queueDepartment = null,
  avgWaitMins = null,
  caseChain = [],
  salesByAppt = {},
}) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const pagerRef = useRef(null);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });
  const { width: windowWidth } = useWindowDimensions();

  const [timelineCollapsed, setTimelineCollapsed] = useState(true);
  const [superCardExpanded, setSuperCardExpanded] = useState(true);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const pageWidth = windowWidth - 28;

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) setActivePageIndex(viewableItems[0].index ?? 0);
  }, []);

  const getItemLayout = useCallback((_data, index) => ({
    length: pageWidth,
    offset: pageWidth * index,
    index,
  }), [pageWidth]);

  const isMultiDay = caseChain.length > 1;
  const activeDayIndex = isMultiDay && appointment
    ? caseChain.findIndex(a => a.id === appointment.id)
    : 0;

  useEffect(() => {
    if (!appointment) return;

    pulseAnim.setValue(0.4);
    setTimelineCollapsed(true);
    setSuperCardExpanded(true);

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => loop.stop();
  }, [appointment?.id]);

  useEffect(() => {
    if (isMultiDay && pagerRef.current && activeDayIndex > 0) {
      pagerRef.current.scrollToIndex({ index: activeDayIndex, animated: false });
    }
  }, [isMultiDay, activeDayIndex]);

  if (!appointment) return null;

  const clampedInitialIndex = Math.min(activeDayIndex >= 0 ? activeDayIndex : 0, Math.max(0, caseChain.length - 1));

  const statusColors = getClientStatusColor(appointment.status);
  const statusIcon = getClientStatusIcon(appointment.status);
  const statusLabel = getClientStatusLabel(appointment.status);
  const speciesEmoji = getSpeciesEmoji(appointment.petSpecies);

  const isEmergency = appointment.priority === 'high' ||
    (appointment.systemChips || []).some(c => c.startsWith('EMERGENCY'));

  const renderActiveDayBody = (dayAppt) => {
    const daySvcStatus = dayAppt.status;
    const dayServices = dayAppt.services || [];
    const dayShowEncounterItems = daySvcStatus === 'dispensing' && (dayAppt.encounterItems || []).length > 0;
    const dayShowFinancial = daySvcStatus === 'dispensing' || daySvcStatus === 'billing';
    const dayEstimatedTotal = dayAppt.finalTotal ||
      (dayAppt.encounterItems || []).reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
    const dayDepositPaid = dayAppt.depositPaid || 0;
    const dayBalanceDue = Math.max(0, dayEstimatedTotal - dayDepositPaid);
    const dayPetAllergies = dayAppt.petAllergies || '';
    const dayHasAllergies = dayPetAllergies.trim().length > 0 && dayPetAllergies.toUpperCase() !== 'NONE';
    const dayWhatsNext = getWhatsNext(daySvcStatus, dayAppt.caseDay);
    const dayTimeLabel = daySvcStatus === 'arrived' ? 'Checked in at'
      : daySvcStatus === 'in-consult' ? 'Consult started at'
      : daySvcStatus === 'dispensing' ? 'Pharmacy since'
      : daySvcStatus === 'billing' ? 'At checkout since'
      : 'Started at';
    const dayStartedTime =
      formatFirestoreTime(dayAppt.timeStarted) ||
      formatFirestoreTime(dayAppt.timeArrived);
    const dayHasAssignedVet = dayAppt.assignedVet && dayAppt.assignedVet !== 'Unassigned';
    const dayTicketLabel = dayAppt.ticketPrefix != null && dayAppt.queueNumber != null
      ? `${dayAppt.ticketPrefix}-${String(dayAppt.queueNumber).padStart(3, '0')}`
      : null;
    const dayTimelineEvents = dayAppt.clinicalPulse
      ? buildVisitTimeline(dayAppt.clinicalPulse, {
          isActive: true,
          assignedVet: dayAppt.assignedVet,
          signedOffAt: null,
        })
      : [];

    return (
      <View style={[styles.superCardBody, isMultiDay && { width: pageWidth }]}>
        {(dayAppt.serviceType || dayAppt.primaryService) ? (
          <Text style={styles.serviceTypeBody} numberOfLines={1}>
            {dayAppt.serviceType || dayAppt.primaryService}
          </Text>
        ) : null}
        {dayTicketLabel ? (
          <Text style={styles.infoLine}>🎫 {dayTicketLabel}</Text>
        ) : null}
        {dayAppt.serviceCategory ? (
          <Text style={styles.infoLine}>🏥 {dayAppt.serviceCategory}</Text>
        ) : null}
        {dayHasAssignedVet ? (
          <Text style={styles.infoLine}>👨‍⚕️ {dayAppt.assignedVet}</Text>
        ) : null}
        {dayStartedTime ? (
          <Text style={styles.infoLine}>🕐 {dayTimeLabel} {dayStartedTime}</Text>
        ) : null}
        {dayAppt.scheduledDate && dayAppt.timeArrived ? (
          <Text style={styles.infoLineSmall}>
            Appointment: {formatFirestoreTime(dayAppt.scheduledDate)} · Arrived: {formatFirestoreTime(dayAppt.timeArrived)}
          </Text>
        ) : null}
        {dayAppt.petWeight ? (
          <Text style={styles.infoLine}>⚖️ Weight: {dayAppt.petWeight} kg</Text>
        ) : null}
        {dayAppt.isFollowUp ? (
          <Text style={styles.infoLineSmall}>🔄 Follow-up visit</Text>
        ) : null}
        {dayAppt.caseDay > 1 ? (
          <Text style={styles.infoLine}>📅 Day {dayAppt.caseDay} of care</Text>
        ) : null}
        {dayHasAllergies ? (
          <View style={styles.allergyBadge}>
            <Text style={styles.allergyText}>⚠ Allergies: {dayPetAllergies}</Text>
          </View>
        ) : null}
        {dayAppt.clientNotes ? (
          <View style={styles.notesEcho}>
            <Text style={styles.notesEchoText}>📝 You mentioned: "{dayAppt.clientNotes}"</Text>
          </View>
        ) : null}
        {dayWhatsNext ? (
          <View style={styles.whatsNextBox}>
            <Text style={styles.whatsNextText}>{dayWhatsNext}</Text>
          </View>
        ) : null}
        {dayServices.length > 0 && (
          <View style={styles.serviceProgressSection}>
            <Text style={styles.sectionLabel}>SERVICES</Text>
            {(() => {
              const uniqueStaff = new Set(dayServices.map(s => s.staffName).filter(Boolean));
              const showStaffPerService = uniqueStaff.size > 1;
              return dayServices.map((svc, i) => {
                const svcStatus = svc.serviceStatus || 'pending';
                const icon = svcStatus === 'completed' ? '✓' : svcStatus === 'in-progress' ? '⏳' : '○';
                const durationStr = formatServiceDuration(svc);
                const label = svcStatus === 'completed' ? `done${durationStr}` : svcStatus === 'in-progress' ? 'in progress' : 'waiting';
                const svcStaff = showStaffPerService && svc.staffName ? svc.staffName : null;
                const svcPrice = svc.price > 0 ? `P${svc.price.toLocaleString()}` : null;
                const isAdded = svc.addedDuringConsult === true;
                const details = [label];
                if (svcStaff) details.push(svcStaff);
                if (svcPrice) details.push(svcPrice);
                return (
                  <View key={svc.id || i} style={styles.serviceProgressRow}>
                    <Text style={[styles.serviceProgressLine, svcStatus === 'in-progress' && { color: COLORS.sky }]}>
                      {icon} {svc.name || 'Service'} — {details.join(' · ')}
                    </Text>
                    {isAdded && (
                      <Text style={styles.serviceAddedLabel}>(added)</Text>
                    )}
                  </View>
                );
              });
            })()}
          </View>
        )}
        {queueAhead != null && (
          <Text style={styles.infoLine}>
            {queueAhead === 0
              ? `You're next${queueDepartment ? ` in ${queueDepartment}` : ''}!`
              : `${queueAhead} pet${queueAhead !== 1 ? 's' : ''} ahead of you${queueDepartment ? ` in ${queueDepartment}` : ''}`}
          </Text>
        )}
        {dayShowEncounterItems && (
          <View style={styles.encounterSection}>
            <Text style={styles.sectionLabel}>PREPARING FOR YOU</Text>
            {(dayAppt.encounterItems || []).map((item, i) => {
              const emoji = (item.productClass === 'medicine' || item.isDrug) ? '💊'
                : item.productClass === 'medical_supply' ? '🩹'
                : '📦';
              return (
                <Text key={i} style={styles.encounterLine}>
                  {emoji} {item.name}{(item.qty ?? 1) > 1 ? ` x${item.qty}` : ''}
                </Text>
              );
            })}
          </View>
        )}
        {dayShowFinancial && dayEstimatedTotal > 0 && (
          <View style={styles.financialSection}>
            <Text style={styles.sectionLabel}>ESTIMATED COST</Text>
            <Text style={styles.financialLine}>Estimated total: ₱{dayEstimatedTotal.toLocaleString()}</Text>
            {dayDepositPaid > 0 && (
              <Text style={styles.financialLine}>Deposit paid: ₱{dayDepositPaid.toLocaleString()}</Text>
            )}
            {dayDepositPaid > 0 && (
              <Text style={[styles.financialLine, { fontWeight: 'bold', color: COLORS.warning }]}>
                Balance due: ₱{dayBalanceDue.toLocaleString()}
              </Text>
            )}
          </View>
        )}
        <WaitTimeMetrics
          appointment={dayAppt}
          isActive={true}
          avgWaitMins={avgWaitMins}
        />
        {dayTimelineEvents.length > 0 && (
          <View style={styles.timelineSection}>
            <VisitTimeline
              events={dayTimelineEvents}
              isActive={true}
              collapsed={timelineCollapsed}
              onToggle={() => setTimelineCollapsed(prev => !prev)}
              assignedVet={dayAppt.assignedVet}
              services={dayAppt.services}
            />
          </View>
        )}
        <TouchableOpacity
          style={[styles.ctaBtn, !clinicPhone && styles.ctaBtnDisabled]}
          onPress={async () => {
            if (!clinicPhone) return;
            try { await Linking.openURL(`tel:${clinicPhone}`); }
            catch (error) { console.error('[SuperCard.handleCallClinic]:', error.message); }
          }}
          disabled={!clinicPhone}
        >
          <Text style={styles.ctaBtnText}>📞 Call Clinic</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderPastDayContent = (dayAppt, index) => {
    const dayNum = dayAppt.caseDay || (index + 1);
    const dayDate = formatFirestoreTime(dayAppt.scheduledDate) || '';
    const dayStatusColors = getClientStatusColor(dayAppt.status);
    const dayStatusLabel = getClientStatusLabel(dayAppt.status);
    const dayStatusIcon = getClientStatusIcon(dayAppt.status);
    const pastTimelineEvents = dayAppt.clinicalPulse
      ? buildVisitTimeline(dayAppt.clinicalPulse, {
          isActive: false,
          assignedVet: dayAppt.assignedVet,
          signedOffAt: dayAppt.signedOffAt,
        })
      : [];
    const sale = salesByAppt[dayAppt.id];

    return (
      <ScrollView
        style={{ width: pageWidth }}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pastDayContent}>
          <Text style={styles.pastDayLabel}>DAY {dayNum}</Text>
          {dayDate ? <Text style={styles.pastDayDate}>{dayDate}</Text> : null}
          <View style={[styles.pastDayStatusRow, { backgroundColor: dayStatusColors.backgroundColor }]}>
            <Text style={[styles.pastDayStatus, { color: dayStatusColors.color }]}>
              {dayStatusIcon} {dayStatusLabel.toUpperCase()}
            </Text>
          </View>
          {pastTimelineEvents.length > 0 && (
            <View style={styles.pastDayTimeline}>
              <Text style={styles.sectionLabel}>TIMELINE</Text>
              {pastTimelineEvents.slice(0, 5).map((evt, i) => (
                <Text key={i} style={styles.pastTimelineEvent}>
                  {evt.icon} {evt.label}
                </Text>
              ))}
            </View>
          )}
          {dayAppt.encounterItems?.length > 0 && (
            <EncounterSummary
              appointment={dayAppt}
              collapsed={true}
              onToggle={() => {}}
              onViewRecord={() => {}}
              onRebook={() => {}}
              salesTotal={sale?.total ?? null}
              hideViewRecord={true}
            />
          )}
          {sale && (
            <Text style={styles.pastDayPaid}>
              Paid: ₱{(sale.total || 0).toLocaleString()}
            </Text>
          )}
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.shadowContainer}>
      <View style={SHADOW.card} />
      <View style={[styles.wrapper, { borderLeftColor: statusColors.color }]}>

        {/* ── MINI HEADER ── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setSuperCardExpanded(prev => !prev)}
          style={styles.superCardMiniHeader}
        >
          <View style={[styles.avatar, { borderColor: statusColors.color }]}>
            <Text style={styles.avatarEmoji}>{speciesEmoji}</Text>
          </View>

          <View style={styles.miniHeaderInfo}>
            <Text style={styles.petName} numberOfLines={1}>
              {appointment.petName || 'Your Pet'}
            </Text>
            {queueAhead != null && (
              <Text style={styles.queuePositionMini}>
                {queueAhead === 0
                  ? `Next${queueDepartment ? ` in ${queueDepartment}` : ''}!`
                  : `${queueAhead} ahead${queueDepartment ? ` in ${queueDepartment}` : ''}`}
              </Text>
            )}
          </View>

          {isEmergency && (
            <View style={styles.emergencyBadge}>
              <Text style={styles.emergencyText}>🚨 EMERGENCY</Text>
            </View>
          )}

          <View style={styles.miniHeaderRight}>
            <View style={styles.statusRow}>
              <Animated.View style={[styles.pulseDot, { backgroundColor: statusColors.color, opacity: pulseAnim }]} />
              <View style={[styles.statusPillWrap, { backgroundColor: statusColors.backgroundColor }]}>
                <Text style={[styles.statusPillText, { color: statusColors.color }]}>
                  {statusIcon} {statusLabel.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          <MaterialIcons
            name={superCardExpanded ? 'expand-less' : 'expand-more'}
            size={22}
            color={COLORS.accentLight}
            style={styles.chevron}
          />
        </TouchableOpacity>

        {/* ── COLLAPSIBLE BODY ── */}
        {superCardExpanded && (
          !isMultiDay ? (
            renderActiveDayBody(appointment)
          ) : (
            <>
              <View style={styles.caseHeaderBar}>
                <Text style={styles.caseHeaderText}>CASE: {caseChain.length} DAYS</Text>
              </View>
              <FlatList
                ref={pagerRef}
                data={caseChain}
                keyExtractor={(appt) => appt.id}
                renderItem={({ item: dayAppt, index }) => (
                  dayAppt.id === appointment.id
                    ? renderActiveDayBody(dayAppt)
                    : renderPastDayContent(dayAppt, index)
                )}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                getItemLayout={getItemLayout}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig.current}
                initialScrollIndex={clampedInitialIndex}
                onScrollToIndexFailed={() => {}}
              />
              <View style={styles.dotRow}>
                {caseChain.map((c, i) => (
                  <View
                    key={c.id}
                    style={[
                      styles.dot,
                      i === activePageIndex && styles.dotActive,
                      c.id === appointment.id && styles.dotCurrent,
                    ]}
                  />
                ))}
              </View>
            </>
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  wrapper: {
    backgroundColor: COLORS.white,
    borderRadius: 0,
    borderLeftWidth: 4,
    overflow: 'hidden',
    zIndex: 1,
  },

  superCardMiniHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },

  miniHeaderInfo: {
    flex: 1,
  },

  miniHeaderRight: {
    alignItems: 'flex-end',
  },

  chevron: {
    marginLeft: 2,
  },

  queuePositionMini: {
    fontSize: 11,
    color: COLORS.sky,
    fontWeight: 'bold',
    marginTop: 3,
  },

  emergencyBadge: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
  },
  emergencyText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.danger,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  superCardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: 10,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 0,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cream,
    flexShrink: 0,
  },
  avatarEmoji: { fontSize: 22 },
  petName: { fontSize: 15, fontWeight: 'bold', color: COLORS.accent },

  serviceTypeBody: {
    fontSize: 12,
    color: COLORS.accentLight,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 0,
    marginRight: 6,
  },
  statusPillWrap: {
    borderRadius: 0,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },

  infoLine: {
    fontSize: 13,
    color: COLORS.accent,
    marginBottom: 5,
    paddingLeft: 4,
  },
  infoLineSmall: {
    fontSize: 11,
    color: COLORS.accentLight,
    marginBottom: 3,
    paddingLeft: 4,
    fontStyle: 'italic',
  },

  allergyBadge: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
  },
  allergyText: {
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: 'bold',
  },

  notesEcho: {
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 6,
  },
  notesEchoText: {
    fontSize: 12,
    color: COLORS.accent,
    fontStyle: 'italic',
  },

  whatsNextBox: {
    backgroundColor: COLORS.cream,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.sky,
  },
  whatsNextText: {
    fontSize: 13,
    color: COLORS.accent,
    fontWeight: '600',
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.accentLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },

  serviceProgressSection: {
    marginTop: 8,
    marginBottom: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: 8,
  },
  serviceProgressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 3,
    paddingLeft: 4,
  },
  serviceProgressLine: {
    fontSize: 13,
    color: COLORS.accent,
    marginBottom: 3,
    paddingLeft: 4,
  },
  serviceAddedLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },

  encounterSection: {
    marginTop: 6,
    marginBottom: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: 8,
  },
  encounterLine: {
    fontSize: 13,
    color: COLORS.accent,
    marginBottom: 3,
    paddingLeft: 4,
  },

  financialSection: {
    marginTop: 6,
    marginBottom: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: 8,
  },
  financialLine: {
    fontSize: 13,
    color: COLORS.accent,
    marginBottom: 3,
    paddingLeft: 4,
  },

  timelineSection: {
    marginTop: 8,
    marginBottom: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: 8,
  },

  ctaBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 0,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  ctaBtnText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 13,
  },
  ctaBtnDisabled: {
    backgroundColor: COLORS.muted,
  },

  caseHeaderBar: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  caseHeaderText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.warning,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.borderLight,
  },
  dotActive: {
    backgroundColor: COLORS.sky,
  },
  dotCurrent: {
    borderWidth: 1,
    borderColor: COLORS.accent,
  },

  pastDayContent: {
    padding: 12,
  },
  pastDayLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.warning,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  pastDayDate: {
    fontSize: 12,
    color: COLORS.accentLight,
    marginBottom: 8,
  },
  pastDayStatusRow: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  pastDayStatus: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pastDayTimeline: {
    marginBottom: 8,
  },
  pastTimelineEvent: {
    fontSize: 12,
    color: COLORS.accentLight,
    marginBottom: 3,
    paddingLeft: 4,
  },
  pastDayPaid: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.success,
    marginTop: 4,
  },
});
