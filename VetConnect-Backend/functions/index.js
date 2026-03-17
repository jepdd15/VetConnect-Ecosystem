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
      serviceCategory: service.category || 'Consultation', 
      requiredRole: service.requiredRole || 'veterinarian',
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