// Executes server-side business logic that cannot be trusted to the client application.
// midnightQueueSweep: A Cron Job that fires daily at 11:59 PM (PST) to securely reset the ticket counter 
// to zero, leaving unfinished patients untouched for morning triage.

// secureBookAppointment: The "Bouncer." Checks the server's atomic clock to prevent "Time Travel" hacks 
// and blocks "Schedule Hoarders" by capping active appointments.

// sendAppointmentUpdateNotification: The Hardware Trigger. Listens to Firestore document changes and 
// pushes a real-time payload to Expo/Apple/Google servers to vibrate the client's phone when their status changes.

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const axios = require("axios");

// Initialize Admin privileges (Bypasses security rules to modify any data)
admin.initializeApp();
const db = admin.firestore();

// ============================================================================
// 🤖 1. PHILOSOPHY B: PASSIVE MIDNIGHT SWEEP (CRON JOB)
// Runs automatically at 11:59 PM every day in Manila Time.
// ============================================================================
exports.midnightQueueSweep = functions.pubsub
  .schedule('59 23 * * *') // 11:59 PM every day
  .timeZone('Asia/Manila')
  .onRun(async (context) => {
    console.log("Midnight Sweep: Resetting Ticket Counter ONLY.");

    try {
      const queueRef = db.collection("queue").doc("daily_queue");
      
      
      await queueRef.update({ 
        currentServing: 0, 
        currentPrefix: '',
        lastNumberIssued: 0, 
        status: 'active'
      });

      console.log("Counter reset successful. Awaiting human triage in the morning.");
      return null;

    } catch (error) {
      console.error("Sweep Failed:", error);
      return null;
    }
  });


exports.reservationCleanup = functions.pubsub
  .schedule('0 6 * * *')
  .timeZone('Asia/Manila')
  .onRun(async (context) => {
    const invSnap = await db.collection('inventory').where('reserved', '>', 0).get();
    if (invSnap.empty) return null;

    const activeAppts = await db.collection('appointments')
      .where('status', 'in', ['in-consult', 'dispensing'])
      .get();

    const legitimatelyReserved = new Map();
    activeAppts.forEach(doc => {
      const data = doc.data();
      (data.prescribedItems || []).forEach(item => {
        if (item.type === 'product') {
          const current = legitimatelyReserved.get(item.id) || 0;
          legitimatelyReserved.set(item.id, current + (item.qty || 1));
        }
      });
    });

    const batch = db.batch();
    let fixes = 0;
    invSnap.forEach(doc => {
      const legitimate = legitimatelyReserved.get(doc.id) || 0;
      const current = doc.data().reserved || 0;
      if (current > legitimate) {
        batch.update(doc.ref, { reserved: legitimate });
        fixes++;
      }
    });

    if (fixes > 0) {
      await batch.commit();
      console.log(`Reservation cleanup: fixed ${fixes} stranded reservation(s).`);

      // Write audit trail entries for each correction
      const logBatch = db.batch();
      invSnap.forEach(doc => {
        const legitimate = legitimatelyReserved.get(doc.id) || 0;
        const current = doc.data().reserved || 0;
        if (current > legitimate) {
          const logRef = db.collection('inventory_logs').doc();
          logBatch.set(logRef, {
            itemId: doc.id,
            itemName: doc.data().itemName || 'Unknown',
            action: 'ADJUSTED',
            amountChange: 0,
            reason: `Reservation cleanup: stranded reserved ${current} → corrected to ${legitimate}`,
            userId: 'SYSTEM',
            userName: 'Reservation Cleanup Cron',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      });
      await logBatch.commit();
    }
    return null;
  });


// ============================================================================
// 🛡️ 2. SECURE BOOKING ENGINE (THE BOUNCER)
// Prevents Time-Travel Hacks and Schedule Hoarding.
// ============================================================================
exports.secureBookAppointment = functions.https.onCall(async (data, context) => {
  
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to book an appointment.');
  }
  const uid = context.auth.uid;

  const { pets, service, baseDateTime, notes } = data;
  const requestedDate = new Date(baseDateTime);
  const serverNow = new Date(); 

  // Add an absolute 2-hour buffer to the server time.
  const bufferTime = new Date(serverNow.getTime() + (2 * 60 * 60 * 1000));
  
  if (requestedDate < bufferTime) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Appointments must be booked at least 2 hours in advance. Your system clock may be out of sync.'
    );
  }

  // ============================================================================
  // ASPIRATIONAL — THIS FUNCTION IS NOT CURRENTLY CALLED BY THE MOBILE APP.
  // ============================================================================
  // Bookings are currently written directly from the mobile client via
  // `writeBatch(db)` in VetConnect/src/screens/BookAppointment.js — there is no
  // httpsCallable invocation of secureBookAppointment anywhere in the app.
  //
  // This function is preserved as a reference implementation for the correct
  // server-side validation shape. It will activate ONLY if:
  //   (1) the Firebase project upgrades from Spark to Blaze (required to deploy
  //       any Cloud Function under Google's current policy), AND
  //   (2) the mobile BookAppointment.js submit handler is refactored to use
  //       httpsCallable('secureBookAppointment') instead of the direct batch write.
  //
  // Until then, closed-date enforcement lives in two layers:
  //   - Client guard: VetConnect/src/hooks/useBookingEngine.js blocks slot
  //     generation for closed dates in the booking wizard UI.
  //   - Firestore rule: VetConnect-Backend/firestore.rules rejects writes to
  //     `appointments` with a `scheduledDateStr` matching a closed date.
  //
  // Do NOT delete this block — the architecture intent is documented here and
  // the Blaze upgrade path is trivial: redeploy the function, wire the callable
  // in BookAppointment.js, and the server-side check activates automatically.
  // ============================================================================

  // CLOSED-DATE VALIDATION — block bookings on days the clinic is explicitly closed.
  // Cloud Functions run in UTC, so we must convert to Asia/Manila before comparing
  // against the YYYY-MM-DD strings stored in closedDates.
  const settingsSnap = await admin.firestore().collection('clinic_settings').doc('general').get();
  const closedDates = settingsSnap.exists ? (settingsSnap.data().closedDates ?? []) : [];

  // 'en-CA' locale produces YYYY-MM-DD natively — matches the stored format exactly.
  const manilaDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(requestedDate);

  if (closedDates.includes(manilaDateStr)) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'The clinic is closed on the selected date. Please choose another day.'
    );
  }


  const activeApptsQuery = await db.collection("appointments")
    .where("ownerId", "==", uid)
    .where("status", "in", ["pending", "confirmed"])
    .get();

  if (activeApptsQuery.size + pets.length > 4) {
    throw new functions.https.HttpsError(
      'resource-exhausted', 
      'You cannot have more than 4 active appointments at a time. Please complete or cancel existing appointments first.'
    );
  }

  
  const batch = db.batch();
  const baseDuration = service.duration ? parseInt(service.duration) : 30;
  const serviceBuffer = service.bufferTime ? parseInt(service.bufferTime) : 0;
  const trueTimePerPet = baseDuration + serviceBuffer; 

  pets.forEach((pet, index) => {
    
    const petDateTime = new Date(requestedDate.getTime() + (index * trueTimePerPet * 60000));
    const qrData = `VC-${uid.slice(0,5)}-${Date.now()}-${index}`;
    
    const newApptRef = db.collection("appointments").doc(); 
    
    batch.set(newApptRef, {
      ownerId: uid,
      petId: pet.id,       
      petName: pet.name,   
      petSpecies: pet.species,
      serviceType: service.name,
      servicePrice: service.price || 0,
      serviceCategory: service.department || service.category || 'Consultation',
      serviceDuration: baseDuration,
      serviceBuffer: serviceBuffer, 
      notes: pets.length > 1 ? `[Group Booking ${index + 1}/${pets.length}] ${notes}` : notes, 
      status: "pending",           
      scheduledDate: admin.firestore.Timestamp.fromDate(petDateTime), 
      createdAt: admin.firestore.Timestamp.now(), // Stamped by the SERVER clock
      qrCode: qrData               
    });
  });

  await batch.commit();

  return { 
    success: true, 
    message: `Successfully requested ${pets.length} appointment(s). Please wait for clinic confirmation.` 
  };
});


// ============================================================================
// 📢 3. PUSH NOTIFICATION TRIGGER
// Listens for ANY status update and pushes a payload to Expo/Apple/Google.
// ============================================================================
exports.sendAppointmentUpdateNotification = functions.firestore
  .document("appointments/{appointmentId}")
  .onUpdate(async (change, context) => {
    const newValue = change.after.data();
    const previousValue = change.before.data();

    // Did the status actually change? If not, exit.
    if (newValue.status === previousValue.status) return null;

    const status = newValue.status;
    const petName = newValue.petName;
    const ownerId = newValue.ownerId;

    // We don't notify for walk-in users because they don't have the app.
    if (ownerId === "WALK_IN_USER") return null;

    // Craft the message based on the new status
    let title = "";
    let body = "";

    switch (status) {
      case "confirmed":
        title = "✅ Booking Confirmed!";
        body = `Your appointment for ${petName} has been approved. See you soon!`;
        break;
      case "cancelled":
        title = "🛑 Appointment Declined";
        body = `Your booking for ${petName} was cancelled. Tap to see why.`;
        break;
      case "arrived":
        title = "🎟️ You are Checked In!";
        body = `Ticket #${newValue.ticketPrefix || ''}${newValue.queueNumber} generated. Please check the Lobby Monitor.`;
        break;
      case "in-consult":
        title = "🩺 It's your turn!";
        body = `The Vet is ready for ${petName}. Please proceed to the room.`;
        break;
      case "dispensing":
        title = "💊 Prescriptions Ready";
        body = `Medications for ${petName} are being prepared at the pharmacy.`;
        break;
      case "billing":
        title = "💰 Ready for Checkout";
        body = `Services for ${petName} are complete. Please proceed to the cashier.`;
        break;
      default:
        return null; // Ignore random statuses like 'pending' or 'completed'
    }

    try {
      // Fetch the User's Push Token from the database
      const userDoc = await db.collection("users").doc(ownerId).get();
      if (!userDoc.exists) return null;
      
      const pushToken = userDoc.data().expoPushToken;
      
      // If they didn't allow notifications, exit quietly.
      if (!pushToken) {
        console.log(`User ${ownerId} does not have a push token.`);
        return null;
      }

      // Fire the Laser (Send to Expo)
      const message = {
        to: pushToken,
        sound: 'default',
        title: title,
        body: body,
        data: { appointmentId: context.params.appointmentId }, 
      };

      await axios.post('https://exp.host/--/api/v2/push/send', message, {
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'application/json',
          'Content-Type': 'application/json',
        }
      });

      console.log(`Push notification sent to ${ownerId} for status: ${status}`);
      return null;

    } catch (error) {
      console.error("Error sending push notification:", error);
      return null;
    }
  });

  // --- THE FOREVER-GUEST KILLER (ACCOUNT MERGE ROBOT) ---
exports.mergeGuestAccount = functions.auth.user().onCreate(async (user) => {
    // 1. Get the phone number of the person who just signed up on the Mobile App
    const phone = user.phoneNumber;
    if (!phone) {
        console.log("New user has no phone number, skipping guest check.");
        return null;
    }

    try {
        // 2. Search the database for an "unclaimed_guest" with the exact same phone number
        const guestQuery = db.collection("users")
            .where("phone", "==", phone)
            .where("accountStatus", "==", "unclaimed_guest")
            .limit(1);

        const snapshot = await guestQuery.get();
        if (snapshot.empty) {
            console.log("No matching guest account found for this phone number.");
            return null;
        }

        // 3. WE FOUND A MATCH!
        const guestDoc = snapshot.docs[0];
        console.log(`Match found! Merging new user ${user.uid} with guest profile ${guestDoc.id}.`);

        // 4. MIGRATE DATA:
        // Copy pets and other data from old guest ID to the new REAL ID.
        // (This part can be expanded to move medical records, etc. For now, we move pets)
        const petsQuery = db.collection("pets").where("ownerId", "==", guestDoc.id);
        const petsSnapshot = await petsQuery.get();

        const batch = db.batch();

        petsSnapshot.forEach(petDoc => {
            const petRef = db.collection("pets").doc(petDoc.id);
            batch.update(petRef, { ownerId: user.uid });
        });

        // 5. UPGRADE GUEST TO FULL USER:
        // Update the old guest document to become the new user's REAL profile.
        // This preserves the "Client Since" date and any other notes.
        const finalProfileRef = db.collection("users").doc(guestDoc.id);
        batch.update(finalProfileRef, {
            uid: user.uid, // Link to the Auth account
            accountStatus: 'claimed', // Upgrade from Guest!
            email: user.email // Add their new login email
        });

        // 6. DELETE THE REDUNDANT NEW USER PROFILE:
        // When a user signs up, a blank profile is made. We must delete it
        // because the Guest profile is now the main one.
        const redundantProfileRef = db.collection("users").doc(user.uid);
        batch.delete(redundantProfileRef);

        await batch.commit();
        console.log("Account merge successful!");
        return null;

    } catch (error) {
        console.error("Error during guest account merge:", error);
        return null;
    }
});