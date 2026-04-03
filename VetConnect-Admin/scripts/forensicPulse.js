// scripts/forensicPulse.js
// 🧬 THE FORENSIC PULSE: Clinical Sanity & Data Sync Script
// This script retroactively aligns your existing patient records with the new high-fidelity schema.

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, writeBatch, doc } from "firebase/firestore";

// --- ⚙️ CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDRM1GnQYQkNgZjGPG-ssQh2inHHgDDsO4",
  authDomain: "starbarks-vetconnect-f6443.firebaseapp.com",
  projectId: "starbarks-vetconnect-f6443",
  storageBucket: "starbarks-vetconnect-f6443.firebasestorage.app",
  messagingSenderId: "156967516393",
  appId: "1:156967516393:web:da2f4bf88f0eba39cf5878"
};

const DRY_RUN = false; // 🧬 LIVE SYNC ACTIVE: Modifying clinical database.

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runForensicSync() {
    console.log("🚀 INITIALIZING FORENSIC PULSE...");
    console.log(`📡 STATUS: ${DRY_RUN ? "DRY RUN (ReadOnly)" : "LIVE SYNC (Modifying Database)"}`);
    console.log("--------------------------------------------------");

    const batch = writeBatch(db);
    let totalChanges = 0;

    try {
        // --- 1. SCAN PETS COLLECTION ---
        console.log("⏳ Scanning 'pets' collection...");
        const petsSnap = await getDocs(collection(db, "pets"));
        console.log(`📊 Found ${petsSnap.size} patient records.`);

        petsSnap.forEach((petDoc) => {
            const data = petDoc.data();
            const updates = {};
            let changed = false;

            // taxonomic: Breed Normalization
            if (data.breed === "Mixed") {
                updates.breed = "Mixed Breed";
                changed = true;
            }

            // identity: Microchip Standard
            if (!data.microchip || data.microchip === "") {
                updates.microchip = "N/A";
                changed = true;
            }

            // structural: Weight Sync
            if (data.weight && !data.lastWeight) {
                updates.lastWeight = data.weight;
                changed = true;
            } else if (!data.weight && data.lastWeight) {
                updates.weight = data.lastWeight;
                changed = true;
            }

            // forensic: Chronos Metadata
            if (data.dob && data.isAgeExact === undefined) {
                updates.isAgeExact = true; // Assume history as baseline
                changed = true;
            }

            if (changed) {
                totalChanges++;
                if (DRY_RUN) {
                    console.log(`[DRY RUN] 🐾 Pet: ${data.name} (${petDoc.id}) ->`, updates);
                } else {
                    batch.update(doc(db, "pets", petDoc.id), updates);
                }
            }
        });

        // --- 2. SCAN APPOINTMENTS COLLECTION ---
        console.log("⏳ Scanning 'appointments' collection...");
        const apptsSnap = await getDocs(collection(db, "appointments"));
        console.log(`📊 Found ${apptsSnap.size} appointment records.`);

        apptsSnap.forEach((apptDoc) => {
            const data = apptDoc.data();
            const updates = {};
            let changed = false;

            if (data.petBreed === "Mixed") {
                updates.petBreed = "Mixed Breed";
                changed = true;
            }

            if (data.petBirthdate && data.isAgeExact === undefined) {
                updates.isAgeExact = true;
                changed = true;
            }

            if (changed) {
                totalChanges++;
                if (DRY_RUN) {
                    console.log(`[DRY RUN] 🗓️ Appt: ${apptDoc.id} ->`, updates);
                } else {
                    batch.update(doc(db, "appointments", apptDoc.id), updates);
                }
            }
        });

        // --- 3. COMMIT ---
        if (totalChanges > 0) {
            if (!DRY_RUN) {
                console.log(`💾 COMMITING ${totalChanges} forensic updates to Firestore...`);
                await batch.commit();
                console.log("✅ DATABASE HARDENING COMPLETE.");
            } else {
                console.log(`🎯 DRY RUN FINISHED. ${totalChanges} records flagged for sync.`);
                console.log("💡 Set DRY_RUN = false in the script to perform the live update.");
            }
        } else {
            console.log("✨ DATABASE IS ALREADY FORENSICALLY SOUND. No changes detected.");
        }

    } catch (error) {
        console.error("❌ FORENSIC FAILURE:", error);
    }
}

runForensicSync();
