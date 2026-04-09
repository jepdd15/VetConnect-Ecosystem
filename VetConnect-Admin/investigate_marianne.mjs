/**
 * 🔍 FORENSIC INVESTIGATION: Marianne Record Trace
 * Queries Firestore for all appointment records containing "Marianne"
 * to determine if the record was carried-over, cancelled, or lost.
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, orderBy } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDRM1GnQYQkNgZjGPG-ssQh2inHHgDDsO4",
  authDomain: "starbarks-vetconnect-f6443.firebaseapp.com",
  projectId: "starbarks-vetconnect-f6443",
  storageBucket: "starbarks-vetconnect-f6443.firebasestorage.app",
  messagingSenderId: "156967516393",
  appId: "1:156967516393:web:da2f4bf88f0eba39cf5878"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function investigate() {
  console.log("=== 🔍 FORENSIC INVESTIGATION: MARIANNE RECORD TRACE ===\n");

  // 1. Query ALL appointments (we need to search by petName/ownerName which aren't indexed for text search)
  const allSnap = await getDocs(collection(db, "appointments"));
  
  const marianneRecords = [];
  
  allSnap.docs.forEach(doc => {
    const data = doc.data();
    const petName = (data.petName || "").toLowerCase();
    const ownerName = (data.ownerName || "").toLowerCase();
    
    if (petName.includes("marianne") || ownerName.includes("marianne")) {
      marianneRecords.push({ id: doc.id, ...data });
    }
  });

  if (marianneRecords.length === 0) {
    console.log("❌ NO RECORDS FOUND with 'Marianne' in petName or ownerName.\n");
    console.log("Attempting broader search across all fields...\n");
    
    // Broader search - check notes, processedBy, etc.
    allSnap.docs.forEach(doc => {
      const raw = JSON.stringify(doc.data()).toLowerCase();
      if (raw.includes("marianne")) {
        const data = doc.data();
        marianneRecords.push({ id: doc.id, ...data, _matchedVia: "deep-scan" });
      }
    });
  }

  if (marianneRecords.length === 0) {
    console.log("❌ ABSOLUTE ZERO: No trace of 'Marianne' found anywhere in the appointments collection.");
    console.log("\n--- Checking queue/daily_queue document ---");
    
    // Check the daily queue doc
    const { getDoc, doc: docRef } = await import("firebase/firestore");
    const queueSnap = await getDoc(docRef(db, "queue", "daily_queue"));
    if (queueSnap.exists()) {
      const qData = queueSnap.data();
      console.log(`Last Reset Date: ${qData.lastResetDate}`);
      console.log(`Current Serving: ${qData.currentServing}`);
      console.log(`Status: ${qData.status}`);
    }
  } else {
    console.log(`✅ FOUND ${marianneRecords.length} RECORD(S) MATCHING 'MARIANNE':\n`);
    
    marianneRecords.forEach((rec, idx) => {
      const scheduledDate = rec.scheduledDate?.toDate ? rec.scheduledDate.toDate() : rec.scheduledDate;
      const createdAt = rec.createdAt?.toDate ? rec.createdAt.toDate() : rec.createdAt;
      const processedAt = rec.processedAt?.toDate ? rec.processedAt.toDate() : rec.processedAt;
      
      console.log(`--- RECORD ${idx + 1} ---`);
      console.log(`  Document ID:    ${rec.id}`);
      console.log(`  Pet Name:       ${rec.petName || 'N/A'}`);
      console.log(`  Owner Name:     ${rec.ownerName || 'N/A'}`);
      console.log(`  Status:         ${rec.status || 'N/A'}`);
      console.log(`  Scheduled Date: ${scheduledDate || 'N/A'}`);
      console.log(`  Created At:     ${createdAt || 'N/A'}`);
      console.log(`  Processed At:   ${processedAt || 'N/A'}`);
      console.log(`  Processed By:   ${rec.processedBy || 'N/A'}`);
      console.log(`  Is Triaged:     ${rec.isTriaged || false}`);
      console.log(`  Origin Appt ID: ${rec.originApptId || 'N/A'}`);
      console.log(`  Case Day:       ${rec.caseDay || 1}`);
      console.log(`  Notes:          ${(rec.notes || 'N/A').substring(0, 200)}`);
      console.log(`  Audit Reason:   ${rec.auditReason || 'N/A'}`);
      console.log(`  Reject Reason:  ${rec.rejectReason || 'N/A'}`);
      
      // Forensic Seal
      if (rec.forensicSeal) {
        console.log(`  Forensic Seal:  YES`);
        console.log(`    - Record Age:    ${rec.forensicSeal.recordAge}`);
        console.log(`    - Total Consult: ${rec.forensicSeal.totalConsult}`);
        console.log(`    - Shift Consult: ${rec.forensicSeal.shiftConsult}`);
      }
      
      // Clinical Pulse Timeline
      if (rec.clinicalPulse && rec.clinicalPulse.length > 0) {
        console.log(`  Clinical Pulse (${rec.clinicalPulse.length} events):`);
        rec.clinicalPulse.forEach((p, i) => {
          const ts = p.timestamp?.toDate ? p.timestamp.toDate() : p.timestamp;
          console.log(`    [${i}] ${p.type || p.toStatus || 'EVENT'} → ${p.toStatus || '?'} at ${ts} by ${p.staffName || '?'}`);
          if (p.note) console.log(`         Note: ${p.note.substring(0, 150)}`);
        });
      }
      
      console.log("");
    });
  }

  // 2. Also check the queue daily doc for last reset info
  console.log("\n=== 📋 QUEUE STATE ===");
  const { getDoc, doc: docRef } = await import("firebase/firestore");
  const queueSnap = await getDoc(docRef(db, "queue", "daily_queue"));
  if (queueSnap.exists()) {
    const qData = queueSnap.data();
    console.log(`Last Reset Date:     ${qData.lastResetDate || 'NEVER'}`);
    console.log(`Current Serving:     ${qData.currentServing}`);
    console.log(`Last Number Issued:  ${qData.lastNumberIssued}`);
    console.log(`Status:              ${qData.status}`);
  } else {
    console.log("Queue document does not exist.");
  }

  // 3. Count total active appointments for context
  console.log("\n=== 📊 APPOINTMENT CENSUS ===");
  const statusCounts = {};
  allSnap.docs.forEach(doc => {
    const s = doc.data().status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });
  Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
    console.log(`  ${status.padEnd(20)} ${count}`);
  });
  console.log(`  ${"TOTAL".padEnd(20)} ${allSnap.size}`);

  console.log("\n=== 🔍 INVESTIGATION COMPLETE ===");
  process.exit(0);
}

investigate().catch(err => {
  console.error("Investigation failed:", err);
  process.exit(1);
});
