import { doc, Timestamp, arrayUnion, runTransaction, collection } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useUser } from '../../context/UserContext';
import { calculatePulseMetrics, makePulseEventId, createPulseEvent } from '../../utils/pulseUtils';
import { STATUS, validateTransition, TERMINAL_STATUSES } from '../../utils/statusConstants';
import { getLocalDateStr } from '../../utils/dateUtils';
import { sendPushNotification } from '../../utils/sendPushNotification';
import { writeAppointmentQueueDoc, removeAppointmentQueueDoc, updateAppointmentQueueDate } from '../../utils/appointmentReminderQueue';

export function useQueueActions() {
  const { profile } = useUser();
  const staffSignature = profile?.fullName || 'System/Admin';
  
  // 1. FORWARD STATUS CHANGE (NOW ATOMIC TRANSACTIONS!)
  const changeStatus = async (row, newStatus, settings = {}) => {
    const transition = validateTransition(row.status, newStatus);
    if (!transition.valid) {
      throw new Error(`❌ INVALID TRANSITION\n${transition.reason}`);
    }

    await runTransaction(db, async (transaction) => {
        const apptRef = doc(db, "appointments", row.id);
        const apptDoc = await transaction.get(apptRef);
        if (!apptDoc.exists()) throw new Error("Appointment not found!");

        const now = new Date();
        const pulseEvent = createPulseEvent('STATUS_CHANGE', {
            fromStatus: row.status || 'unknown',
            toStatus: newStatus,
            staffId: profile?.id || 'unknown',
            staffName: staffSignature,
            note: (newStatus === STATUS.ON_HOLD) ? "Patient placed on-hold (Pause Engine Triggered)" : `Status transition to ${newStatus}`
        });

        // statusHistory is a deliberately denormalized fast-path index for revert operations.
        // It duplicates transition data from clinicalPulse but enables O(1) undo without
        // scanning the full audit log. See T2.45 evaluation: KEEP decision.
        const freshApptData = apptDoc.data();
        let updateData = {
            status: newStatus,
            statusHistory: [...(freshApptData.statusHistory || []), row.status || 'unknown'],
            clinicalPulse: arrayUnion(pulseEvent)
        };

        if (newStatus === STATUS.CONFIRMED && row.status === STATUS.PENDING) {
            updateData.timeAccepted = Timestamp.now();
            updateData.acceptedBy = staffSignature;
        }
        if (newStatus === STATUS.ARRIVED) {
            updateData.arrivedBy = staffSignature;
            updateData.timeArrived = Timestamp.now();
        }
        if (newStatus === STATUS.IN_CONSULT && row.status !== STATUS.ON_HOLD) {
            updateData.timeStarted = Timestamp.now();
            updateData.startedBy = staffSignature;
        }
        if (newStatus === STATUS.COMPLETED) {
            updateData.timeCompleted = Timestamp.now();
            updateData.completedBy = staffSignature;
            // Write seal if not already present (sign-off path writes it earlier).
            // Uses fresh Firestore data from the transaction read.
            const freshData = apptDoc.data();
            if (!freshData.forensicSeal) {
                updateData.forensicSeal = calculatePulseMetrics(
                    freshData.clinicalPulse || [],
                    settings,
                    freshData.createdAt,
                    new Date()
                );
            }
        }
        if (newStatus === STATUS.DISPENSING) {
            updateData.timeDispenseStarted = Timestamp.now();
        }
        if (newStatus === STATUS.BILLING) {
            updateData.timePaymentStarted = Timestamp.now();
        }

        // SMART PAUSE ENGINE
        if (newStatus === STATUS.ON_HOLD) updateData.lastPausedAt = Timestamp.now();

        if (row.status === STATUS.ON_HOLD && newStatus === STATUS.IN_CONSULT) {
            if (row.lastPausedAt) {
                const pausedAt = row.lastPausedAt.toDate();
                const pauseDurationMins = Math.floor((now - pausedAt) / 60000);
                const previousTotal = row.totalPausedMinutes || 0;
                updateData.totalPausedMinutes = previousTotal + pauseDurationMins;
                updateData.lastPausedAt = null; 
            }
        }

        transaction.update(apptRef, updateData);

        if (newStatus === STATUS.IN_CONSULT && row.queueNumber) {
            const queueRef = doc(db, "queue", "daily_queue");
            transaction.update(queueRef, {
                currentServing: row.queueNumber,
                currentPrefix: row.ticketPrefix || ''
            });
        }
    });

    // T4.90: Push notification — fire and forget
    const pushStatus = (row.status === 'on-hold' && newStatus === 'in-consult') ? 'resumed' : newStatus;
    sendPushNotification({
      ownerId: row.ownerId,
      status: pushStatus,
      petName: row.petName,
      vetName: staffSignature,
      ticketNumber: row.queueNumber,
      appointmentId: row.id,
      sentBy: staffSignature,
    });

    // T4.126: Appointment reminder queue management — fire-and-forget
    if (newStatus === STATUS.CONFIRMED) {
      writeAppointmentQueueDoc({
        id:            row.id,
        petName:       row.petName,
        ownerName:     row.ownerName,
        ownerId:       row.ownerId,
        scheduledDate: row.scheduledDate,
      }).catch(() => {});
    }
    if (['cancelled', 'no-show', 'completed'].includes(newStatus)) {
      removeAppointmentQueueDoc(row.id).catch(() => {});
    }
  };

  // 2. THE SMART UNDO
  const revertStatus = async (row) => {
    let freshPrevStatus = null;
    await runTransaction(db, async (transaction) => {
      const apptRef = doc(db, "appointments", row.id);
      const apptDoc = await transaction.get(apptRef);
      if (!apptDoc.exists()) throw new Error("Appointment not found. It may have been deleted.");

      // Read FRESH data from Firestore — not from potentially-stale client-side props.
      const freshData = apptDoc.data();
      const history = freshData.statusHistory || [];
      if (history.length === 0) throw new Error("Cannot revert. No previous status recorded.");

      const prevStatus = history[history.length - 1];
      freshPrevStatus = prevStatus;
      const newHistory = history.slice(0, -1);

      // PHASE 4.3: THE FORENSIC LINKER
      // Identify the EXACT event ID of the mistake we are about to invalidate,
      // sourced from the fresh document to prevent stale-read corruption.
      const pulseArray = freshData.clinicalPulse || [];
      const lastChange = [...pulseArray].reverse().find(p => p.type === 'STATUS_CHANGE');
      const correctedId = lastChange?.eventId || null;

      // Determine if we are reverting FROM a terminal state.
      // If so, the forensicSeal is stale and must be cleared so consumers
      // recompute metrics from the live pulse array.
      const wasTerminal = TERMINAL_STATUSES.has((freshData.status || '').toLowerCase());

      const pulseEvent = createPulseEvent('CORRECTION', {
          fromStatus: freshData.status,
          toStatus: prevStatus,
          staffId: profile?.id || 'unknown',
          staffName: staffSignature,
          note: wasTerminal
              ? `TERMINAL REVERSAL: ${row.revertReason || "Manual Status Reversion"} (seal cleared)`
              : `REVERSION: ${row.revertReason || "Manual Status Reversion"}`,
          correctedEventId: correctedId, // THE DNA LINK — passed via ...extra spread
          isCorrection: true,
      });

      const updateData = {
          status: prevStatus,
          statusHistory: newHistory,
          clinicalPulse: arrayUnion(pulseEvent),
          revertedBy: staffSignature,
          revertReason: row.revertReason || "Manual Status Reversion",
          revertedAt: Timestamp.now(),
          forensicSeal: null, // Any revert invalidates the frozen snapshot
      };

      // GAP A FIX: If we are reverting to Scheduled, wipe the arrival artifacts!
      if (prevStatus === STATUS.CONFIRMED) {
          updateData.queueNumber = null;
          updateData.ticketPrefix = null;
          updateData.timeArrived = null;
      }

      transaction.update(apptRef, updateData);
    });

    // T4.90: Push notification for revert — uses fresh prevStatus from transaction
    if (freshPrevStatus) {
      sendPushNotification({
        ownerId: row.ownerId,
        status: freshPrevStatus,
        petName: row.petName,
        vetName: staffSignature,
        appointmentId: row.id,
        customTitle: 'Status Updated',
        customBody: `${row.petName || 'Your pet'}'s appointment status was corrected to: ${freshPrevStatus}.`,
        sentBy: staffSignature,
      });
    }
  };

  const markNoShow = async (row, reason, settings) => {
    // THE PHYSICAL INTEGRITY GUARD: If they arrived, they are NOT a no-show.
    if (row.timeArrived || row.jsArrived) {
      throw new Error(`❌ INTEGRITY REFUSAL: This patient is physically present (Arrived). Use Cancel or Reschedule instead.`);
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error("❌ AUDIT FAILURE: No-Show flagging requires a mandatory clinical justification.");
    }

    // --- 🧬 SUB-PHASE 4.2: THE INDIVIDUAL FORENSIC SEAL ---
    const forensicSeal = calculatePulseMetrics(
      row.clinicalPulse || [], 
      settings, 
      row.createdAt, 
      new Date()
    );

    const currentServices = row.services || [];
    const clearedServices = (currentServices || []).map(s => ({ ...s, staffId: null, staffName: 'Unassigned' }));
    
    const pulseEvent = createPulseEvent('STATUS_CHANGE', {
      fromStatus: row.status || 'unknown',
      toStatus: 'no-show',
      staffId: profile?.id || 'unknown',
      staffName: staffSignature,
      note: `Individually flagged as No-Show: ${reason}`
    });
    
    await runTransaction(db, async (transaction) => {
      const apptRef = doc(db, "appointments", row.id);
      const apptDoc = await transaction.get(apptRef);
      if (!apptDoc.exists()) throw new Error("Appointment not found!");

      const freshStatus = apptDoc.data().status;
      if (['completed', 'cancelled', 'no-show', 'carried-over'].includes(freshStatus)) {
        throw new Error(`Record already resolved (status: ${freshStatus}). Cannot mark as No-Show.`);
      }

      transaction.update(apptRef, {
        status: 'no-show',
        statusHistory: arrayUnion(apptDoc.data().status),
        assignedVet: "Unassigned",
        assignedVetId: null,
        services: clearedServices,
        cancelledBy: staffSignature,
        clinicalPulse: arrayUnion(pulseEvent),
        isForensicAudit: true,
        auditReason: reason,
        auditReasons: arrayUnion({ reason, action: 'no-show', staffName: staffSignature, timestamp: Timestamp.now() }),
        forensicSeal // THE 8-METRIC STAMP
      });

      if (row.scheduledDate) {
        const slotDate = row.scheduledDate.toDate ? row.scheduledDate.toDate() : new Date(row.scheduledDate);
        const dateStr = `${slotDate.getFullYear()}-${String(slotDate.getMonth() + 1).padStart(2, '0')}-${String(slotDate.getDate()).padStart(2, '0')}`;
        const hh = String(slotDate.getHours()).padStart(2, '0');
        const mm = String(slotDate.getMinutes()).padStart(2, '0');
        const depts = new Set();
        if (row.services && Array.isArray(row.services)) {
          row.services.forEach(s => depts.add((s.department || "General").toLowerCase()));
        } else {
          depts.add((row.serviceCategory || "General").toLowerCase());
        }
        for (const dept of depts) {
          transaction.delete(doc(db, "slot_reservations", `${dateStr}_${hh}_${mm}_${dept}`));
        }
      }
    });

    // T4.90: Push notification
    sendPushNotification({
      ownerId: row.ownerId,
      status: 'no-show',
      petName: row.petName,
      vetName: staffSignature,
      appointmentId: row.id,
      sentBy: staffSignature,
    });

    // T4.126: Remove from appointment reminder queue on no-show — fire-and-forget
    removeAppointmentQueueDoc(row.id).catch(() => {});
  };

  const rejectAppointment = async (id, reason, currentServices = [], isForensic = false, settings, rowData) => {
    if (!rowData) throw new Error("❌ SEAL FAILURE: rowData is required to compute forensicSeal.");
    // --- 🧬 SUB-PHASE 4.2: THE INDIVIDUAL FORENSIC SEAL ---
    const forensicSeal = calculatePulseMetrics(
      rowData.clinicalPulse || [],
      settings,
      rowData.createdAt,
      new Date()
    );

    const clearedServices = (currentServices || []).map(s => ({ ...s, staffId: null, staffName: 'Unassigned' }));
    const pulseEvent = createPulseEvent('STATUS_CHANGE', {
        fromStatus: rowData.status || 'unknown',
        toStatus: 'cancelled',
        staffId: profile?.id || 'unknown',
        staffName: staffSignature,
        note: isForensic ? `Forensic Triage Cleanup: ${reason}` : (reason || 'Individually cancelled')
    });

    await runTransaction(db, async (transaction) => {
      const apptRef = doc(db, "appointments", id);
      const apptDoc = await transaction.get(apptRef);
      if (!apptDoc.exists()) throw new Error("Appointment not found!");

      const freshStatus = apptDoc.data().status;
      if (['completed', 'cancelled', 'no-show', 'carried-over'].includes(freshStatus)) {
        throw new Error(`Record already resolved (status: ${freshStatus}). Cannot cancel.`);
      }

      transaction.update(apptRef, {
        status: 'cancelled',
        statusHistory: [...(apptDoc.data().statusHistory || []), apptDoc.data().status],
        assignedVet: "Unassigned",
        assignedVetId: null,
        services: clearedServices,
        timeRejected: Timestamp.now(),
        cancelledBy: staffSignature,
        clinicalPulse: arrayUnion(pulseEvent),
        isForensicAudit: isForensic,
        auditReason: reason || 'Individually cancelled',
        auditReasons: arrayUnion({ reason: reason || 'Individually cancelled', action: isForensic ? 'forensic-cancel' : 'cancel', staffName: staffSignature, timestamp: Timestamp.now() }),
        forensicSeal // THE 8-METRIC STAMP
      });

      // T4.205: Delete reservation docs to free the slot for client rebooking.
      // transaction.delete() is a no-op on non-existent docs — safe for pre-T4.205 appointments.
      if (rowData.scheduledDate) {
        const slotDate = rowData.scheduledDate.toDate
          ? rowData.scheduledDate.toDate()
          : new Date(rowData.scheduledDate);
        const dateStr = `${slotDate.getFullYear()}-${String(slotDate.getMonth() + 1).padStart(2, '0')}-${String(slotDate.getDate()).padStart(2, '0')}`;
        const hh = String(slotDate.getHours()).padStart(2, '0');
        const mm = String(slotDate.getMinutes()).padStart(2, '0');

        const depts = new Set();
        if (rowData.services && Array.isArray(rowData.services)) {
          rowData.services.forEach(s => depts.add((s.department || "General").toLowerCase()));
        } else {
          depts.add((rowData.serviceCategory || "General").toLowerCase());
        }

        for (const dept of depts) {
          transaction.delete(doc(db, "slot_reservations", `${dateStr}_${hh}_${mm}_${dept}`));
        }
      }
    });

    // T4.90: Push notification
    sendPushNotification({
      ownerId: rowData.ownerId,
      status: 'cancelled',
      petName: rowData.petName,
      vetName: staffSignature,
      appointmentId: id,
      sentBy: staffSignature,
    });

    // T4.126: Remove from appointment reminder queue on cancel — fire-and-forget
    removeAppointmentQueueDoc(id).catch(() => {});
  };

  // 3. THE NEW "CODE BLUE" EMERGENCY ENGINE (Free-Tier Safe)
  const quickAdmitER = async () => {
    await runTransaction(db, async (transaction) => {
      const queueRef = doc(db, "queue", "daily_queue");
      const queueDoc = await transaction.get(queueRef);
      
      let nextNum = 1;
      if (queueDoc.exists()) {
        nextNum = (queueDoc.data().lastNumberIssued || 0) + 1;
        transaction.update(queueRef, { lastNumberIssued: nextNum });
      } else {
        transaction.set(queueRef, { lastNumberIssued: 1, currentServing: 0, currentPrefix: '', status: 'active', lastResetDate: getLocalDateStr() });
      }

      // Generate the Ghost Patient payload
      const newApptRef = doc(collection(db, "appointments"));
      transaction.set(newApptRef, {
        ownerId: "WALK_IN_USER",
        ownerName: "URGENT ER",
        ownerPhone: "EMERGENCY CONTACT PENDING",
        petId: "UNKNOWN",
        petName: "EMERGENCY PATIENT",
        petSpecies: "Unknown",
        serviceType: "Trauma / ER",
        serviceCategory: "General", // Universal fallback department — routing is department-driven
        priority: "high", // THE FLAG THAT FORCES IT TO THE TOP OF THE LIST
        status: "arrived",
        caseDay: 1,
        queueNumber: nextNum,
        ticketPrefix: "E", // E-Series Ticket!
        timeArrived: Timestamp.now(),
        createdAt: Timestamp.now(),
        systemChips: ['EMERGENCY', 'QUICK-ADMIT'],
        assignedVet: "Unassigned",
        clinicalPulse: [
          {
            eventId: makePulseEventId('inception'),
            type: 'INCEPTION',
            toStatus: 'arrived',
            timestamp: Timestamp.now(), // CLIENT-SIDE CLOCK — see W1 in pulseUtils.js
            staffId: profile?.id || 'unknown',
            staffName: staffSignature,
            note: 'Emergency ' + (profile?.fullName ? 'admitted by ' + profile.fullName : 'quick admission')
          }
        ]
      });
    });
  };

  // 4. THE INBOX ENGINE (NEW: Real-Time Triage)
  const deferAppointment = async (id, reason, staffName, settings) => {
    if (!reason || reason.trim().length === 0) {
        throw new Error("❌ AUDIT FAILURE: Deferring clinical triage requires a mandatory justification.");
    }

    await runTransaction(db, async (transaction) => {
        const apptRef = doc(db, "appointments", id);
        const apptDoc = await transaction.get(apptRef);
        if (!apptDoc.exists()) throw new Error("Appointment not found!");

        const data = apptDoc.data();

        // CALCULATION: Shift the administrative triage focus to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const triageKey = getLocalDateStr(tomorrow);

        const signature = staffName || staffSignature;

        const forensicSeal = calculatePulseMetrics(
            data.clinicalPulse || [],
            settings,
            data.createdAt,
            new Date()
        );

        const pulseEvent = createPulseEvent('STATUS_CHANGE', {
            fromStatus: data.status || 'unknown',
            toStatus: 'pending (deferred)',
            staffId: profile?.id || 'unknown',
            staffName: signature,
            note: `Shift Deferred to ${triageKey} (Reason: ${reason})`
        });

        transaction.update(apptRef, {
            triageDate: triageKey,
            systemChips: arrayUnion('DEFERRED'),
            lastTriagedAt: Timestamp.now(),
            triagedBy: signature,
            clinicalPulse: arrayUnion(pulseEvent),
            auditReason: reason,
            auditReasons: arrayUnion({ reason, action: 'defer', staffName: signature, timestamp: Timestamp.now() }),
            forensicSeal
        });
    });
  };

  const rescheduleAppointment = async (row, newDate, reason, settings) => {
    if (!reason || reason.trim().length === 0) {
        throw new Error("❌ AUDIT FAILURE: Rescheduling requires a mandatory forensic justification.");
    }

    const apptRef = doc(db, "appointments", row.id);
    const pulseEvent = createPulseEvent('STATUS_CHANGE', {
        fromStatus: row.status || 'unknown',
        toStatus: 'pending (rescheduled)',
        staffId: profile?.id || 'unknown',
        staffName: staffSignature,
        note: `SCHEDULE SHIFT: ${reason} (Moved to ${new Date(newDate).toLocaleString()})`
    });

    // T2.53: Wrap in runTransaction for atomicity — consistent with all other queue actions.
    // T4.205: `targetDate` used instead of `newDate` to avoid shadowing the parameter.
    const targetDate = new Date(newDate);
    await runTransaction(db, async (transaction) => {
        const apptDoc = await transaction.get(apptRef);
        if (!apptDoc.exists()) throw new Error("Appointment not found.");
        const oldData = apptDoc.data();

        const forensicSeal = calculatePulseMetrics(
            oldData.clinicalPulse || [],
            settings,
            oldData.createdAt,
            new Date()
        );

        // T4.205: Swap reservation docs — delete old slot, create new slot.
        // transaction.delete() is a no-op on non-existent docs — safe for pre-T4.205 appointments.
        if (oldData.scheduledDate) {
          const oldDate = oldData.scheduledDate.toDate();
          const oldDateStr = `${oldDate.getFullYear()}-${String(oldDate.getMonth() + 1).padStart(2, '0')}-${String(oldDate.getDate()).padStart(2, '0')}`;
          const oldHH = String(oldDate.getHours()).padStart(2, '0');
          const oldMM = String(oldDate.getMinutes()).padStart(2, '0');

          const newDateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
          const newHH = String(targetDate.getHours()).padStart(2, '0');
          const newMM = String(targetDate.getMinutes()).padStart(2, '0');

          const depts = new Set();
          if (oldData.services && Array.isArray(oldData.services)) {
            oldData.services.forEach(s => depts.add((s.department || "General").toLowerCase()));
          } else {
            depts.add((oldData.serviceCategory || "General").toLowerCase());
          }

          for (const dept of depts) {
            // Delete old reservation
            transaction.delete(doc(db, "slot_reservations", `${oldDateStr}_${oldHH}_${oldMM}_${dept}`));

            // Compute max duration for this department
            const deptDuration = (oldData.services || [])
              .filter(s => (s.department || "General").toLowerCase() === dept)
              .reduce((max, s) => Math.max(max,
                (parseInt(String(s.duration).replace(/[^0-9]/g, "")) || 30) +
                (parseInt(String(s.buffer).replace(/[^0-9]/g, "")) || 0)
              ), 30);

            // Create new reservation
            transaction.set(doc(db, "slot_reservations", `${newDateStr}_${newHH}_${newMM}_${dept}`), {
              ownerId: oldData.ownerId,
              petId: oldData.petId,
              appointmentId: row.id,
              department: dept,
              scheduledDate: Timestamp.fromDate(targetDate),
              slotStart: `${newHH}:${newMM}`,
              duration: deptDuration,
              createdAt: Timestamp.now(),
              expiresAt: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
            });
          }
        }

        transaction.update(apptRef, {
            scheduledDate: Timestamp.fromDate(targetDate),
            clinicalPulse: arrayUnion(pulseEvent),
            lastModifiedAt: Timestamp.now(),
            modifiedBy: staffSignature,
            auditReason: reason,
            auditReasons: arrayUnion({ reason, action: 'reschedule', staffName: staffSignature, timestamp: Timestamp.now() }),
            forensicSeal
        });
    });
    updateAppointmentQueueDate(row.id, Timestamp.fromDate(targetDate), row).catch(() => {});
  };

  return { changeStatus, revertStatus, markNoShow, rejectAppointment, quickAdmitER, deferAppointment, rescheduleAppointment }; // Exported!
}