import { doc, updateDoc, Timestamp, writeBatch, arrayUnion, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export function useQueueActions() {
  
  // 1. FORWARD STATUS CHANGE (ATOMIC BATCH + PAUSE MATH)
  const changeStatus = async (row, newStatus, currentConfinedCount, maxCages = 5) => {
    if (newStatus === 'confined' && currentConfinedCount >= maxCages) {
      throw new Error(`❌ ADMISSION BLOCKED\nAll ${maxCages} cages are currently occupied.`);
    }

    const batch = writeBatch(db);
    const apptRef = doc(db, "appointments", row.id);
    
    let updateData = { 
        status: newStatus,
        // Push the OLD status into history so we can accurately "Undo" later!
        statusHistory: arrayUnion(row.status) 
    };
    
    const now = new Date();

    // CLINICAL WORKFLOW TIMESTAMPS
    if (newStatus === 'in-consult' && row.status !== 'on-hold') {
        updateData.timeStarted = Timestamp.now();
    }
    if (newStatus === 'completed') {
        updateData.timeCompleted = Timestamp.now();
    }

    // --- THE SMART PAUSE ENGINE ---
    if (newStatus === 'on-hold') {
        // Record the exact second they were put on hold
        updateData.lastPausedAt = Timestamp.now();
    }
    
    if (row.status === 'on-hold' && newStatus === 'in-consult') {
        // They are resuming! Calculate how long they were paused.
        if (row.lastPausedAt) {
            const pausedAt = row.lastPausedAt.toDate();
            const pauseDurationMins = Math.floor((now - pausedAt) / 60000);
            const previousTotal = row.totalPausedMinutes || 0;
            
            updateData.totalPausedMinutes = previousTotal + pauseDurationMins;
            updateData.lastPausedAt = null; // Clear the timer
        }
    }

    batch.update(apptRef, updateData);
    
    if (newStatus === 'in-consult' && row.queueNumber) {
      const queueRef = doc(db, "queue", "daily_queue");
      batch.update(queueRef, { 
          currentServing: row.queueNumber, 
          currentPrefix: row.ticketPrefix || '' 
      });
    }

    await batch.commit();
  };

  // 2. THE SMART UNDO (Using History)
  const revertStatus = async (row) => {
    const history = row.statusHistory ||[];
    if (history.length === 0) throw new Error("Cannot revert. No previous status recorded.");
    
    // Get the last status they were in
    const prevStatus = history[history.length - 1];
    
    // Create a new history array without the last item
    const newHistory = history.slice(0, -1);

    await updateDoc(doc(db, "appointments", row.id), { 
        status: prevStatus,
        statusHistory: newHistory 
    });
  };

  const markNoShow = async (id) => {
    await updateDoc(doc(db, "appointments", id), { status: 'no-show', rejectReason: 'Auto-flagged: Late / No show' });
  };

  const rejectAppointment = async (id, reason) => {
    await updateDoc(doc(db, "appointments", id), { status: 'cancelled', rejectReason: reason || "No reason provided by staff." });
  };

  return { changeStatus, revertStatus, markNoShow, rejectAppointment };
}