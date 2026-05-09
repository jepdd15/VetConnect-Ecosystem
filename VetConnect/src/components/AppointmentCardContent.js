import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { COLORS } from '../theme/mobileTokens';
import {
  formatDisplayDate,
  formatFirestoreTime,
} from '../utils/helpers';
import {
  getClientStatusColor,
  getClientStatusIcon,
  getClientStatusLabel,
  sanitizeCancelReason,
} from '../utils/statusLabels';
import { buildVisitTimeline } from '../utils/buildVisitTimeline';
import { generateVisitPDF } from '../utils/generateVisitPDF';
import VisitTimeline from './VisitTimeline';
import EncounterSummary from './EncounterSummary';
import WaitTimeMetrics from './WaitTimeMetrics';

const UPCOMING_STATUSES = new Set([
  'pending', 'confirmed', 'arrived', 'in-consult',
  'dispensing', 'billing', 'on-hold', 'confined',
]);

const EXCEPTION_HISTORY_STATUSES = new Set(['cancelled', 'no-show', 'carried-over']);

const ACTIVE_CLINIC_STATUSES = new Set([
  'arrived', 'in-consult', 'dispensing', 'billing', 'on-hold', 'confined',
]);

const buildServicesList = (appointment) =>
  (appointment.services || []).map(s => s.name || s.serviceName).filter(Boolean).join(' + ')
  || appointment.serviceType
  || appointment.primaryService
  || 'Visit';

const buildGoogleCalendarUrl = (appointment, clinicAddress) => {
  const date = appointment.scheduledDate?.toDate?.();
  if (!date) return null;

  const pad = (n) => String(n).padStart(2, '0');
  const services = buildServicesList(appointment);

  const startStr = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    pad(date.getMinutes()),
    '00',
  ].join('');

  const endDate = new Date(date.getTime() + 60 * 60 * 1000);
  const endStr = [
    endDate.getFullYear(),
    pad(endDate.getMonth() + 1),
    pad(endDate.getDate()),
    'T',
    pad(endDate.getHours()),
    pad(endDate.getMinutes()),
    '00',
  ].join('');

  const title = encodeURIComponent(`Vet Visit: ${appointment.petName} - ${services}`);
  const details = encodeURIComponent(`Pet: ${appointment.petName}\nServices: ${services}`);
  const location = encodeURIComponent(clinicAddress || 'Starbarks Veterinary Clinic');

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}&location=${location}`;
};

const StatusBadge = ({ appointment, isUpcoming }) => {
  const { status, confirmedByClient } = appointment;

  if (isUpcoming) {
    if (status === 'pending') return null;

    if (status === 'confirmed') {
      if (confirmedByClient) {
        return (
          <View style={[styles.statusBadge, { backgroundColor: COLORS.successBg }]}>
            <Text style={[styles.statusText, { color: COLORS.success }]}>CONFIRMED</Text>
          </View>
        );
      }
      return (
        <View style={[styles.statusBadge, { backgroundColor: COLORS.warningBg }]}>
          <Text style={[styles.statusText, { color: COLORS.warning }]}>CONFIRM?</Text>
        </View>
      );
    }

    if (ACTIVE_CLINIC_STATUSES.has(status)) {
      const colors = getClientStatusColor(status);
      return (
        <View style={[styles.statusBadge, { backgroundColor: colors.backgroundColor }]}>
          <Text style={[styles.statusText, { color: colors.color }]}>
            {getClientStatusIcon(status)} {getClientStatusLabel(status).toUpperCase()}
          </Text>
        </View>
      );
    }

    return null;
  }

  if (!EXCEPTION_HISTORY_STATUSES.has(status)) return null;

  const colors = getClientStatusColor(status);
  return (
    <View style={[styles.statusBadge, { backgroundColor: colors.backgroundColor }]}>
      <Text style={[styles.statusText, { color: colors.color }]}>
        {getClientStatusIcon(status)} {getClientStatusLabel(status).toUpperCase()}
      </Text>
    </View>
  );
};

const AppointmentCardContent = ({
  appointment,
  isUpcoming,
  sale,
  onCancel,
  onReschedule,
  onShowQR,
  onShowReceipt,
  onToggleTimeline,
  isTimelineExpanded,
  onToggleEncounter,
  isEncounterExpanded,
  onConfirmAttendance,
  onDismissFollowUp,
  onBookFollowUp,
  navigation,
  clinicAddress,
  isCaseDayPage,
  caseDayNumber,
}) => {
  const [medRecord, setMedRecord] = useState(null);
  const [medRecordLoading, setMedRecordLoading] = useState(false);
  const medRecordFetched = useRef(false);

  useEffect(() => {
    if (isUpcoming || appointment.status !== 'completed' || medRecordFetched.current) return;
    medRecordFetched.current = true;
    setMedRecordLoading(true);

    const q = query(
      collection(db, 'medical_records'),
      where('appointmentId', '==', appointment.id),
      limit(1),
    );

    getDocs(q)
      .then((snap) => { if (!snap.empty) setMedRecord(snap.docs[0].data()); })
      .catch((e) => { console.warn('[AppointmentCardContent] medRecord fetch:', e.message); })
      .finally(() => setMedRecordLoading(false));
  }, [appointment.id, isUpcoming, appointment.status]);

  const servicesList = buildServicesList(appointment);

  const isHistory = !isUpcoming;

  const isEmergency =
    appointment.priority === 'high' ||
    (appointment.systemChips || []).includes('EMERGENCY');

  const hasAllergies = Boolean(appointment.petAllergies);

  const calendarUrl = buildGoogleCalendarUrl(appointment, clinicAddress);

  const showCalendarButton =
    isUpcoming &&
    (appointment.status === 'pending' || appointment.status === 'confirmed') &&
    calendarUrl;

  const timelineEvents =
    appointment.clinicalPulse?.length > 0
      ? buildVisitTimeline(appointment.clinicalPulse, {
          isActive: false,
          assignedVet: appointment.assignedVet,
          signedOffAt: appointment.signedOffAt,
        })
      : [];

  const cancelReason = sanitizeCancelReason(
    appointment.auditReason || appointment.rejectReason,
  );

  const dateDisplay = formatDisplayDate(appointment.scheduledDate, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeDisplay = formatFirestoreTime(appointment.scheduledDate);

  const diagnosisStr =
    medRecord?.diagnoses?.map((d) => d.name).join(' · ') ||
    medRecord?.diagnosis ||
    medRecord?.dischargeSummary?.diagnosis ||
    null;

  const showUpcomingActions =
    isUpcoming &&
    (appointment.status === 'confirmed' || appointment.status === 'pending');

  const showHistoryCompletedActions = isHistory && appointment.status === 'completed';

  const showRebookAction =
    isHistory &&
    (appointment.status === 'no-show' || appointment.status === 'carried-over');

  const medicinItems = (
    medRecord?.dispensedProducts ||
    medRecord?.prescriptions ||
    []
  ).filter(
    (i) => (i.productClass || (i.isDrug ? 'medicine' : 'retail')) === 'medicine',
  );

  return (
    <View>
      {isCaseDayPage && (
        <View style={styles.dayLabelRow}>
          <Text style={styles.dayLabel}>DAY {caseDayNumber}</Text>
        </View>
      )}

      <View style={styles.heroRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dateHero}>{dateDisplay}</Text>
          {timeDisplay ? (
            <Text style={styles.timeDisplay}>{timeDisplay}</Text>
          ) : null}
        </View>
        <StatusBadge appointment={appointment} isUpcoming={isUpcoming} />
      </View>

      <Text style={styles.servicesSubtitle}>
        {appointment.petName} · {isHistory && diagnosisStr ? diagnosisStr : servicesList}
      </Text>

      {isHistory && diagnosisStr ? (
        <Text style={styles.servicesLine}>{servicesList}</Text>
      ) : null}

      {isUpcoming && (
        <View style={styles.contextSection}>
          {appointment.clientNotes ? (
            <Text style={styles.contextNote}>
              You mentioned: "{appointment.clientNotes}"
            </Text>
          ) : null}

          {hasAllergies ? (
            <View style={styles.allergyBadge}>
              <Text style={styles.allergyText}>
                Allergies: {appointment.petAllergies}
              </Text>
            </View>
          ) : null}

          {isEmergency ? (
            <View style={styles.emergencyBadge}>
              <Text style={styles.emergencyText}>EMERGENCY</Text>
            </View>
          ) : null}

          {appointment.serviceCategory ? (
            <Text style={styles.contextMeta}>
              Department: {appointment.serviceCategory}
            </Text>
          ) : null}

          {appointment.assignedVet && appointment.assignedVet !== 'Unassigned' ? (
            <Text style={styles.contextMeta}>Vet: {appointment.assignedVet}</Text>
          ) : null}

          {(appointment.isFollowUp || appointment.originApptId) ? (
            <Text style={styles.contextMeta}>Follow-up visit</Text>
          ) : null}

          {appointment.servicePrice > 0 ? (
            <Text style={styles.contextPrice}>Est. P{appointment.servicePrice}</Text>
          ) : null}

          {appointment.status === 'confined' && (
            <Text style={styles.contextNote}>
              Your pet is staying overnight at the clinic. Call us anytime for updates.
            </Text>
          )}
        </View>
      )}

      {/* Per-service progress — only for multi-service active appointments */}
      {isUpcoming && (appointment.services || []).length >= 2 &&
        ACTIVE_CLINIC_STATUSES.has(appointment.status) && (
        <View style={styles.serviceStatusSection}>
          <Text style={styles.serviceStatusLabel}>SERVICES</Text>
          {(() => {
            const svcs = appointment.services || [];
            const uniqueStaff = new Set(svcs.map(s => s.staffName).filter(Boolean));
            const showStaff = uniqueStaff.size > 1;
            return svcs.map((svc, i) => {
              const status = svc.serviceStatus || 'pending';
              const icon = status === 'completed' ? '✓'
                : status === 'in-progress' ? '⏳'
                : '○';
              const label = status === 'completed' ? 'done'
                : status === 'in-progress' ? 'in progress'
                : 'waiting';
              const parts = [label];
              if (showStaff && svc.staffName) parts.push(svc.staffName);
              if (svc.price > 0) parts.push(`P${svc.price.toLocaleString()}`);
              const isAdded = svc.addedDuringConsult === true;
              return (
                <View key={svc.id || i} style={styles.serviceStatusRow}>
                  <Text style={[
                    styles.serviceStatusLine,
                    status === 'in-progress' && { color: COLORS.sky },
                    status === 'completed' && { color: COLORS.success },
                  ]}>
                    {icon} {svc.name || 'Service'} — {parts.join(' · ')}
                  </Text>
                  {isAdded && (
                    <Text style={styles.serviceStatusAdded}>(added)</Text>
                  )}
                </View>
              );
            });
          })()}
        </View>
      )}

      <View style={styles.divider} />

      {isHistory && appointment.status === 'completed' && (
        <WaitTimeMetrics
          appointment={appointment}
          isActive={false}
          avgWaitMins={null}
        />
      )}

      {/* Per-service status for completed multi-service appointments */}
      {isHistory && appointment.status === 'completed' &&
        (appointment.services || []).length >= 2 && (
        <View style={styles.serviceStatusSection}>
          <Text style={styles.serviceStatusLabel}>SERVICES</Text>
          {(() => {
            const svcs = appointment.services || [];
            const uniqueStaff = new Set(svcs.map(s => s.staffName).filter(Boolean));
            const showStaff = uniqueStaff.size > 1;
            return svcs.map((svc, i) => {
            const durationStr = (() => {
              const start = svc.serviceStartedAt;
              const end = svc.serviceCompletedAt;
              if (!start || !end) return '';
              const startMs = typeof start.toDate === 'function' ? start.toDate().getTime() : new Date(start).getTime();
              const endMs = typeof end.toDate === 'function' ? end.toDate().getTime() : new Date(end).getTime();
              const mins = Math.round((endMs - startMs) / 60000);
              return Number.isFinite(mins) && mins > 0 ? ` (${mins} min)` : '';
            })();
            const parts = [`done${durationStr}`];
            if (showStaff && svc.staffName) parts.push(svc.staffName);
            if (svc.price > 0) parts.push(`P${svc.price.toLocaleString()}`);
            return (
              <Text key={svc.id || i} style={[styles.serviceStatusLine, { color: COLORS.success }]}>
                ✓ {svc.name || 'Service'} — {parts.join(' · ')}
              </Text>
            );
          });
          })()}
        </View>
      )}

      {/* Per-service status for carried-over multi-service appointments (mixed states) */}
      {isHistory && appointment.status === 'carried-over' &&
        (appointment.services || []).length >= 2 && (
        <View style={styles.serviceStatusSection}>
          <Text style={styles.serviceStatusLabel}>SERVICES</Text>
          {(appointment.services || []).map((svc, i) => {
            const status = svc.serviceStatus || 'pending';
            const isCompleted = status === 'completed';
            const icon = isCompleted ? '✓' : '✗';
            const label = isCompleted ? `done${(appointment.caseDay || 1) > 1 ? ' (prev. day)' : ''}` : 'not completed this visit';
            const parts = [label];
            if (isCompleted && svc.staffName) parts.push(svc.staffName);
            if (svc.price > 0) parts.push(`P${svc.price.toLocaleString()}`);
            return (
              <Text key={svc.id || i} style={[
                styles.serviceStatusLine,
                isCompleted ? { color: COLORS.success } : { color: COLORS.textMuted },
              ]}>
                {icon} {svc.name || 'Service'} — {parts.join(' · ')}
              </Text>
            );
          })}
        </View>
      )}

      {isHistory && timelineEvents.length > 0 ? (
        <View style={styles.timelineSection}>
          <VisitTimeline
            events={timelineEvents}
            isActive={false}
            collapsed={!isTimelineExpanded}
            onToggle={onToggleTimeline}
            assignedVet={appointment.assignedVet}
            services={appointment.services}
          />
        </View>
      ) : null}

      {isHistory && appointment.status === 'completed' && appointment.encounterItems?.length > 0 ? (
        <View style={styles.encounterSection}>
          <EncounterSummary
            appointment={appointment}
            collapsed={!isEncounterExpanded}
            onToggle={onToggleEncounter}
            externalMedRecord={medRecord}
            hideNextSteps={!!medRecord}
            hideActions={true}
            onViewRecord={() => {
              if (navigation) {
                navigation.navigate('PetHistory', {
                  petId: appointment.petId,
                  petName: appointment.petName,
                  highlightRecordId: appointment.id,
                });
              }
            }}
            onRebook={(appt) => {
              if (navigation) {
                navigation.navigate('BookAppointment', {
                  prefillPetId: appt.petId,
                  prefillServiceType: appt.serviceType || appt.primaryService,
                });
              }
            }}
            salesTotal={sale?.total ?? null}
          />
        </View>
      ) : null}

      {isHistory && appointment.status === 'completed' && sale?.total != null && !(appointment.encounterItems?.length > 0) ? (
        <Text style={styles.paidText}>Paid P{sale.total}</Text>
      ) : null}

      {isHistory && appointment.status === 'completed' && medRecord ? (
        <View style={styles.clinicalInfoBlock}>
          {medRecord.dischargeSummary?.instructions ? (
            <Text style={styles.clinicalLine} numberOfLines={2}>
              {medRecord.dischargeSummary.instructions.slice(0, 100)}
              {medRecord.dischargeSummary.instructions.length > 100 ? '...' : ''}
            </Text>
          ) : null}

          {medRecord.vetName ? (
            <Text style={styles.clinicalLine}>Treated by {medRecord.vetName}</Text>
          ) : null}

          {(medRecord.dischargeSummary?.recheckIn) ? (
            <Text style={styles.clinicalLine}>Recheck: {medRecord.dischargeSummary.recheckIn}</Text>
          ) : null}

          {sale ? (
            <Text style={styles.clinicalLine}>
              Paid P{(sale.total || 0).toLocaleString()} via {sale.paymentMethod || 'Cash'}
              {sale.hasScPwdDiscount ? ' (SC/PWD)' : ''}
            </Text>
          ) : null}

          {medRecord.vaccineAdministrations?.length > 0 ? (
            <Text style={styles.clinicalLine}>
              Vaccines: {medRecord.vaccineAdministrations.map((v) => v.vaccineName || v.name).join(', ')}
            </Text>
          ) : null}

          {medRecord.labResults?.length > 0 ? (
            <Text style={styles.clinicalLine}>
              {medRecord.labResults.length} lab test{medRecord.labResults.length !== 1 ? 's' : ''} performed
            </Text>
          ) : null}

          {appointment.forensicSeal?.raw?.shiftConsult > 0 ? (
            <Text style={styles.clinicalLine}>
              Visit duration: {Math.round(appointment.forensicSeal.raw.shiftConsult)} min
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actionRow}>
        {showUpcomingActions ? (
          <>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn]}
              activeOpacity={0.8}
              onPress={() => onCancel && onCancel(appointment.id, appointment.serviceType || appointment.primaryService)}
            >
              <Text style={[styles.btnText, { color: COLORS.danger }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.rescheduleBtn]}
              onPress={() => onReschedule && onReschedule(appointment)}
            >
              <Text style={[styles.btnText, { color: COLORS.sky }]}>Reschedule</Text>
            </TouchableOpacity>

            {appointment.status === 'confirmed' && !appointment.confirmedByClient ? (
              <TouchableOpacity
                style={[styles.btn, styles.confirmBtn]}
                onPress={() => onConfirmAttendance && onConfirmAttendance(appointment.id)}
              >
                <Text style={[styles.btnText, { color: COLORS.success }]}>
                  Confirm I'm Coming
                </Text>
              </TouchableOpacity>
            ) : null}

            {appointment.status === 'confirmed' && appointment.confirmedByClient ? (
              <View style={[styles.btn, styles.confirmedBadge]}>
                <Text style={[styles.btnText, { color: COLORS.success }]}>Confirmed</Text>
              </View>
            ) : null}

            {appointment.status === 'confirmed' ? (
              <TouchableOpacity
                style={[styles.btn, styles.qrBtn]}
                onPress={() => onShowQR && onShowQR(appointment.qrCode)}
              >
                <Text style={styles.btnText}>QR Code</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : null}

        {showHistoryCompletedActions ? (
          <>
            <TouchableOpacity
              style={[styles.btn, styles.receiptBtn]}
              onPress={() => onShowReceipt && onShowReceipt(appointment)}
            >
              <Text style={[styles.btnText, { color: COLORS.accent }]}>E-Receipt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.rebookBtn]}
              onPress={() => {
                if (navigation) {
                  navigation.navigate('BookAppointment', {
                    prefillPetId: appointment.petId,
                    prefillServiceType: appointment.serviceType || appointment.primaryService,
                  });
                }
              }}
            >
              <Text style={[styles.btnText, { color: COLORS.accent }]}>Re-Book</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.downloadBtn]}
              disabled={medRecordLoading}
              onPress={() => generateVisitPDF({
                record: medRecord || appointment,
                petName: appointment.petName,
              })}
            >
              <Text style={[styles.btnText, { color: COLORS.sky }]}>
                {medRecordLoading ? 'Loading...' : 'Visit Summary'}
              </Text>
            </TouchableOpacity>
            {navigation ? (
              <TouchableOpacity
                style={[styles.btn, styles.viewRecordBtn]}
                onPress={() => navigation.navigate('PetHistory', {
                  petId: appointment.petId,
                  petName: appointment.petName,
                  highlightRecordId: appointment.id,
                })}
              >
                <Text style={[styles.btnText, { color: COLORS.accent }]}>Full Record</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : null}

        {showRebookAction ? (
          <TouchableOpacity
            style={[styles.btn, styles.rebookBtn]}
            onPress={() => {
              if (navigation) {
                navigation.navigate('BookAppointment', {
                  prefillPetId: appointment.petId,
                  prefillServiceType: appointment.serviceType || appointment.primaryService,
                });
              }
            }}
          >
            <Text style={[styles.btnText, { color: COLORS.accent }]}>Re-Book</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {showCalendarButton ? (
        <TouchableOpacity
          style={[styles.btn, styles.calendarBtn]}
          onPress={() => Linking.openURL(calendarUrl).catch(() => {})}
        >
          <Text style={[styles.btnText, { color: COLORS.sky }]}>Add to Calendar</Text>
        </TouchableOpacity>
      ) : null}

      {cancelReason ? (
        <Text style={styles.reasonText}>{cancelReason}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  dayLabelRow: {
    marginBottom: 6,
  },
  dayLabel: {
    fontWeight: '900',
    fontSize: 13,
    color: COLORS.warning,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  dateHero: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeDisplay: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 0,
    marginLeft: 8,
  },
  statusText: {
    fontWeight: '900',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  servicesSubtitle: {
    fontSize: 14,
    color: COLORS.accent,
    fontWeight: '700',
    marginBottom: 8,
  },

  contextSection: {
    marginBottom: 6,
    gap: 4,
  },
  contextNote: {
    fontSize: 13,
    color: COLORS.accent,
    fontStyle: 'italic',
  },
  allergyBadge: {
    backgroundColor: COLORS.dangerBg,
    borderRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  allergyText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
  },
  emergencyBadge: {
    backgroundColor: COLORS.danger,
    borderRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  emergencyText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.white,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  contextMeta: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  contextPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: 10,
  },

  paidText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.success,
    marginTop: 4,
  },

  timelineSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: 8,
  },
  encounterSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: 8,
  },

  actionRow: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  cancelBtn: {
    backgroundColor: COLORS.dangerBg,
    borderColor: COLORS.danger,
    marginRight: 'auto',
  },
  rescheduleBtn: {
    borderColor: COLORS.sky,
    backgroundColor: COLORS.infoBg,
  },
  confirmBtn: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.successBg,
  },
  confirmedBadge: {
    backgroundColor: COLORS.successBg,
    borderColor: COLORS.success,
    opacity: 0.8,
  },
  qrBtn: {
    backgroundColor: COLORS.brand,
  },
  receiptBtn: {
    backgroundColor: COLORS.cream,
    borderColor: COLORS.borderLight,
  },
  rebookBtn: {
    borderColor: COLORS.accent,
  },
  calendarBtn: {
    marginTop: 6,
    borderColor: COLORS.sky,
    backgroundColor: COLORS.infoBg,
    alignSelf: 'flex-end',
  },
  btnText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 12,
  },

  reasonText: {
    color: COLORS.danger,
    fontStyle: 'italic',
    fontSize: 12,
    marginTop: 8,
    backgroundColor: COLORS.dangerBg,
    padding: 5,
  },

  servicesLine: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 6,
  },

  clinicalInfoBlock: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    gap: 3,
  },
  clinicalLine: {
    fontSize: 12,
    color: COLORS.textMuted,
  },


  downloadBtn: {
    borderColor: COLORS.sky,
    backgroundColor: COLORS.infoBg,
  },
  viewRecordBtn: {
    borderColor: COLORS.accent,
  },

  serviceStatusSection: {
    marginTop: 8,
    marginBottom: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: 8,
  },
  serviceStatusLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  serviceStatusRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 3,
    paddingLeft: 4,
  },
  serviceStatusLine: {
    fontSize: 13,
    color: COLORS.accent,
    marginBottom: 3,
    paddingLeft: 4,
  },
  serviceStatusAdded: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },

});

export default AppointmentCardContent;
