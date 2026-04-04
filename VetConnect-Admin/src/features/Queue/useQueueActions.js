import { doc, updateDoc, Timestamp, writeBatch, arrayUnion, runTransaction, collection } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useUser } from '../../context/UserContext'; 

export function useQueueActions() {
  const { profile } = useUser();
  const staffSignature = profile?.fullName || 'System/Admin';
  
  // 1. FORWARD STATUS CHANGE (NOW ATOMIC TRANSACTIONS!)
  const changeStatus = async (row, newStatus, currentConfinedCount, maxCages = 5) => {
    if (newStatus === 'confined' && currentConfinedCount >= maxCages) {
      throw new Error(`❌ ADMISSION BLOCKED\nAll ${maxCages} cages are currently occupied.`);
    }

    await runTransaction(db, async (transaction) => {
        const apptRef = doc(db, "appointments", row.id);
        const apptDoc = await transaction.get(apptRef);
        if (!apptDoc.exists()) throw new Error("Appointment not found!");

        const now = new Date();
        const pulseEvent = {
            eventId: `pulse_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            type: 'STATUS_CHANGE',
            fromStatus: row.status || 'unknown',
            toStatus: newStatus,
            timestamp: Timestamp.now(),
            staffId: profile?.id || 'unknown',
            staffName: staffSignature,
            note: (newStatus === 'on-hold') ? "Patient placed on-hold (Pause Engine Triggered)" : `Status transition to ${newStatus}`
        };

        let updateData = { 
            status: newStatus,
            statusHistory: arrayUnion(row.status || 'unknown'),
            clinicalPulse: arrayUnion(pulseEvent)
        };

        if (newStatus === 'confirmed' && row.status === 'pending') {
            updateData.timeAccepted = Timestamp.now();
            updateData.acceptedBy = staffSignature;
        }
        if (newStatus === 'arrived') {
            updateData.arrivedBy = staffSignature;
            updateData.timeArrived = Timestamp.now();
        }
        if (newStatus === 'in-consult' && row.status !== 'on-hold') {
            updateData.timeStarted = Timestamp.now();
            updateData.startedBy = staffSignature;
        }
        if (newStatus === 'completed') {
            updateData.timeCompleted = Timestamp.now();
            updateData.completedBy = staffSignature;
        }
        if (newStatus === 'dispense') {
            updateData.timeDispenseStarted = Timestamp.now();
        }
        if (newStatus === 'payment') {
            updateData.timePaymentStarted = Timestamp.now();
        }

        // SMART PAUSE ENGINE
        if (newStatus === 'on-hold') updateData.lastPausedAt = Timestamp.now();
        
        if (row.status === 'on-hold' && newStatus === 'in-consult') {
            if (row.lastPausedAt) {
                const pausedAt = row.lastPausedAt.toDate();
                const pauseDurationMins = Math.floor((now - pausedAt) / 60000);
                const previousTotal = row.totalPausedMinutes || 0;
                updateData.totalPausedMinutes = previousTotal + pauseDurationMins;
                updateData.lastPausedAt = null; 
            }
        }

        transaction.update(apptRef, updateData);
        
        if (newStatus === 'in-consult' && row.queueNumber) {
            const queueRef = doc(db, "queue", "daily_queue");
            transaction.update(queueRef, { 
                currentServing: row.queueNumber, 
                currentPrefix: row.ticketPrefix || '' 
            });
        }
    });
  };

  // 2. THE SMART UNDO
  const revertStatus = async (row) => {
    const history = row.statusHistory ||[];
    if (history.length === 0) throw new Error("Cannot revert. No previous status recorded.");
    const prevStatus = history[history.length - 1];
    const newHistory = history.slice(0, -1);

    // PHASE 4.3: THE FORENSIC LINKER
    // We identify the EXACT event ID of the mistake we are about to invalidate.
    const pulseArray = row.clinicalPulse || [];
    const lastChange = [...pulseArray].reverse().find(p => p.type === 'STATUS_CHANGE');
    const correctedId = lastChange?.eventId || null;

    const pulseEvent = {
        eventId: `pulse_rev_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'CORRECTION',
        correctedEventId: correctedId, // THE DNA LINK
        fromStatus: row.status,
        toStatus: prevStatus,
        timestamp: Timestamp.now(),
        staffId: profile?.id || 'unknown',
        staffName: staffSignature,
        note: `REVERSION: ${row.revertReason || "Manual Status Reversion"}`,
        isCorrection: true
    };

    const updateData = { 
        status: prevStatus,
        statusHistory: newHistory,
        clinicalPulse: arrayUnion(pulseEvent),
        revertedBy: staffSignature,
        revertReason: row.revertReason || "Manual Status Reversion",
        revertedAt: Timestamp.now()
    };

    // GAP A FIX: If we are reverting to Scheduled, wipe the arrival artifacts!
    if (prevStatus === 'confirmed') {
        updateData.queueNumber = null;
        updateData.ticketPrefix = null;
        updateData.timeArrived = null;
    }

    await updateDoc(doc(db, "appointments", row.id), updateData);
  };

  const markNoShow = async (row, reason) => {
    // THE PHYSICAL INTEGRITY GUARD: If they arrived, they are NOT a no-show.
    if (row.timeArrived || row.jsArrived) {
      throw new Error(`❌ INTEGRITY REFUSAL: This patient is physically present (Arrived). Use Cancel or Re-book instead.`);
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error("❌ AUDIT FAILURE: No-Show flagging requires a mandatory clinical justification.");
    }

    const currentServices = row.services || [];
    const clearedServices = (currentServices || []).map(s => ({ ...s, staffId: null, staffName: 'Unassigned' }));
    
    const pulseEvent = {
      eventId: `pulse_noshow_${Date.now()}`,
      type: 'STATUS_CHANGE',
      fromStatus: row.status || 'unknown',
      toStatus: 'no-show',
      timestamp: Timestamp.now(),
      staffId: profile?.id || 'unknown',
      staffName: staffSignature,
      note: `Individually flagged as No-Show: ${reason}`
    };
    
    await updateDoc(doc(db, "appointments", row.id), { 
      status: 'no-show', 
      rejectReason: reason,
      assignedVet: "Unassigned",
      assignedVetId: null,
      services: clearedServices,
      cancelledBy: staffSignature,
      clinicalPulse: arrayUnion(pulseEvent),
      isForensicAudit: true, // THE FORENSIC SEAL
      auditReason: reason
    });
  };

  const rejectAppointment = async (id, reason, currentServices = [], isForensic = false) => {
    const clearedServices = (currentServices || []).map(s => ({ ...s, staffId: null, staffName: 'Unassigned' }));
    const pulseEvent = {
        eventId: `pulse_cancel_${Date.now()}`,
        type: 'STATUS_CHANGE',
        toStatus: 'cancelled',
        timestamp: Timestamp.now(),
        staffId: profile?.id || 'unknown',
        staffName: staffSignature,
        note: isForensic ? `Forensic Triage Cleanup: ${reason}` : (reason || 'Individually cancelled')
    };

    await updateDoc(doc(db, "appointments", id), { 
      status: 'cancelled', 
      rejectReason: reason || "No reason provided by staff.",
      assignedVet: "Unassigned",
      assignedVetId: null,
      services: clearedServices,
      timeRejected: Timestamp.now(),
      cancelledBy: staffSignature,
      clinicalPulse: arrayUnion(pulseEvent),
      isForensicAudit: isForensic, // STAMPING THE AUDIT
      auditReason: isForensic ? `Forensic Triage Cleanup: ${reason}` : (reason || 'Individually cancelled')
    });
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
        transaction.set(queueRef, { lastNumberIssued: 1, currentServing: 0, currentPrefix: '', status: 'active', lastResetDate: new Date().toISOString().split('T')[0] });
      }

      // Generate the Ghost Patient payload
      const newApptRef = doc(collection(db, "appointments"));
      transaction.set(newApptRef, {
        ownerId: "WALK_IN_USER",
        ownerName: "URGENT ER",
        petId: "UNKNOWN",
        petName: "EMERGENCY PATIENT",
        petSpecies: "Unknown",
        serviceType: "Trauma / ER",
        serviceCategory: "General", // THE FIX: Use the universal fallback department
        requiredRole: "veterinarian",
        priority: "high", // THE FLAG THAT FORCES IT TO THE TOP OF THE LIST
        status: "arrived",
        caseDay: 1,
        queueNumber: nextNum,
        ticketPrefix: "E", // E-Series Ticket!
        timeArrived: Timestamp.now(),
        createdAt: Timestamp.now(),
        notes: "QUICK ADMIT: Bypassed registration for immediate triage.",
        assignedVet: "Unassigned",
        clinicalPulse: [
          {
            eventId: `pulse_er_${Date.now()}`,
            type: 'INCEPTION',
            toStatus: 'arrived',
            timestamp: Timestamp.now(),
            staffId: profile?.id || 'unknown',
            staffName: staffSignature,
            note: 'Emergency ' + (profile?.fullName ? 'admitted by ' + profile.fullName : 'quick admission')
          }
        ]
      });
    });
  };

  // 4. THE INBOX ENGINE (NEW: Real-Time Triage)
  const deferAppointment = async (id, reason, staffName) => {
    if (!reason || reason.trim().length === 0) {
        throw new Error("❌ AUDIT FAILURE: Deferring clinical triage requires a mandatory justification.");
    }

    await runTransaction(db, async (transaction) => {
        const apptRef = doc(db, "appointments", id);
        const apptDoc = await transaction.get(apptRef);
        if (!apptDoc.exists()) throw new Error("Appointment not found!");
        
        // CALCULATION: Shift the administrative triage focus to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const triageKey = tomorrow.toISOString().split('T')[0];
        
        const currentNotes = apptDoc.data().notes || "";
        const signature = staffName || staffSignature;

        const pulseEvent = {
            eventId: `pulse_defer_${Date.now()}`,
            type: 'STATUS_CHANGE',
            toStatus: 'pending (deferred)',
            timestamp: Timestamp.now(),
            staffId: profile?.id || 'unknown',
            staffName: signature,
            note: `Shift Deferred to ${triageKey} (Reason: ${reason})`
        };

        transaction.update(apptRef, {
            triageDate: triageKey,
            notes: `(Deferred to next shift by ${signature}) ${currentNotes}`,
            lastTriagedAt: Timestamp.now(),
            triagedBy: signature,
            clinicalPulse: arrayUnion(pulseEvent),
            auditReason: reason // THE FORENSIC SEAL
        });
    });
  };

  return { changeStatus, revertStatus, markNoShow, rejectAppointment, quickAdmitER, deferAppointment }; // Exported!
}