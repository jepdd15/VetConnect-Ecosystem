// src/hooks/useQueueActions.js
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

export function useQueueActions() {
  
  // 1. FORWARD STATUS CHANGE
  const changeStatus = async (row, newStatus, currentConfinedCount, maxCages = 5) => {
    // Medical/Physical validation before hitting the database
    if (newStatus === 'confined') {
      if (currentConfinedCount >= maxCages) {
        throw new Error(`❌ ADMISSION BLOCKED\nAll ${maxCages} cages are currently occupied.`);
      }
    }

    let updateData = { status: newStatus };
    
    // Auto-stamp times based on clinical workflow
    if (newStatus === 'in-consult' && row.status !== 'on-hold') {
        updateData.timeStarted = Timestamp.now();
    }
    if (newStatus === 'completed') {
        updateData.timeCompleted = Timestamp.now();
    }

    // Execute Database Update
    await updateDoc(doc(db, "appointments", row.id), updateData);
    
    // If pulling them into the consult room, update the Public Queue Board
    if (newStatus === 'in-consult' && row.queueNumber) {
      await updateDoc(doc(db, "queue", "daily_queue"), { 
          currentServing: row.queueNumber, 
          currentPrefix: row.ticketPrefix || '' 
      });
    }
  };

  // 2. REVERT STATUS (UNDO)
  const revertStatus = async (row) => {
    // A strict State Machine for undoing accidental clicks
    const transitions = { 
        'completed': 'billing', 
        'billing': 'dispensing', 
        'dispensing': 'in-consult', 
        'confined': 'in-consult', 
        'on-hold': 'in-consult', 
        'in-consult': 'arrived', 
        'arrived': 'confirmed' 
    };
    
    const prevStatus = transitions[row.status];
    if (!prevStatus) throw new Error("Cannot revert from this status.");
    
    await updateDoc(doc(db, "appointments", row.id), { status: prevStatus });
  };

  // 3. MARK NO-SHOW
  const markNoShow = async (id) => {
    await updateDoc(doc(db, "appointments", id), { 
        status: 'no-show', 
        rejectReason: 'Auto-flagged: Late / No show' 
    });
  };

  // 4. REJECT APPOINTMENT
  const rejectAppointment = async (id, reason) => {
    await updateDoc(doc(db, "appointments", id), { 
        status: 'cancelled', 
        rejectReason: reason || "No reason provided by staff." 
    });
  };

  return {
    changeStatus,
    revertStatus,
    markNoShow,
    rejectAppointment
  };
}