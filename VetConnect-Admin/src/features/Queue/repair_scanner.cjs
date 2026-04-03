const fs = require('fs');
const path = require('path');

const targetPath = 'c:/Users/jepdd/Documents/VetConnect-Capstone/VetConnect-Admin/src/features/Queue/Queue.jsx';
const content = fs.readFileSync(targetPath, 'utf8');
let lines = content.split(/\r?\n/);

// --- 🛡️ TASK 2: REPAIRING THE MORNING GATEKEEPER (Lines 551-628 approx) ---
console.log('Phase 2: Repairing the Morning Gatekeeper...');

const gateStartIdx = lines.findIndex(line => line.includes('THE MORNING GATEKEEPER'));
const gateEndIdx = lines.findIndex((line, idx) => idx > gateStartIdx && line.trim() === '}, [filterDate, isToday]);');

if (gateStartIdx !== -1 && gateEndIdx !== -1) {
    const hardenedGatekeeper = `  // THE MORNING GATEKEEPER (Forces modal if ghosts exist - REAL-TIME SYNC!)
  useEffect(() => {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayStr = getLocalDateStr();

    const qGhosts = query(
      collection(db, "appointments"),
      where("status", "in",["pending", "confirmed", "arrived", "in-consult", "confined", "on-hold", "dispensing", "billing", "scheduled"])
    );

    const unsubGhosts = onSnapshot(qGhosts, async (snapshot) => {
      // 🧬 FORENSIC FILTER: Only flag records that AREN'T triaged and ARE from the past.
      const rawGhosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const ghosts = rawGhosts.filter(appt => {
          // SHIELD 1: THE FORENSIC STAMP
          if (appt.isTriaged === true) return false;
          
          // SHIELD 2: THE DEFERRAL GATE
          if (appt.triageDate && appt.triageDate >= todayStr) return false;

          // SHIELD 3: THE NOTES CHECK
          if (appt.notes?.includes('[Clinical Triage:')) return false;

          // DETERMINATION: Is it actually a ghost?
          let checkDate;
          if (appt.scheduledDate?.toDate) checkDate = appt.scheduledDate.toDate();
          else if (appt.scheduledDate) checkDate = new Date(appt.scheduledDate);
          else checkDate = appt.createdAt?.toDate ? appt.createdAt.toDate() : new Date();
          
          const finalCheck = new Date(checkDate);
          finalCheck.setHours(0,0,0,0);
          return finalCheck < todayStart;
      });

      if (ghosts.length === 0) {
        setHasGhostPatients(false);
        setOpenEndDay(false);
        setIsForcedCleanup(false);
        setLeftoverPatients([]);
      } else {
        setHasGhostPatients(true);
        if (isToday) {
            // THE FIX: "Live Identity Healing" inside the sync loop!
            const enrichedGhosts = await Promise.all(ghosts.map(async (p) => {
              try {
                if (p.petId && (!p.petGender || p.petGender === 'Unknown' || p.petGender === '???')) {
                  const petSnap = await getDoc(doc(db, 'pets', p.petId));
                  if (petSnap.exists()) {
                    const petData = petSnap.data();
                    return {
                      ...p,
                      petGender: petData.gender || petData.sex || p.petGender,
                      petBreed: petData.breed || p.petBreed,
                      petIsNeutered: petData.isNeutered ?? p.petIsNeutered
                    };
                  }
                }
              } catch (e) { console.error('Ghost Identity Restoration failed:', p.id, e); }
              return p;
            }));

            setLeftoverPatients(enrichedGhosts);
            
            setPatientResolutions(prev => {
              const updated = { ...prev };
              enrichedGhosts.forEach(p => {
                if (!updated[p.id]) {
                  const rawStatus = (p.status || 'unknown').toLowerCase();
                  const isHighStakes = ['arrived', 'in-consult', 'dispensing', 'billing', 'confirmed', 'scheduled', 'payment'].includes(rawStatus);

                  if (rawStatus === 'confined') updated[p.id] = 'confined';
                  else if (rawStatus === 'pending') updated[p.id] = 'defer';
                  else if (isHighStakes) updated[p.id] = null; // FORCE MANUAL CHOICE
                  else updated[p.id] = 'cancel';
                }
              });
              return updated;
            });

            setTouchedPatients(prev => {
              const updated = new Set(prev);
              enrichedGhosts.forEach(p => {
                const rawStatus = (p.status || 'unknown').toLowerCase();
                if (rawStatus === 'pending') updated.add(p.id);
              });
              return updated;
            });
            
            setIsForcedCleanup(true);
            setOpenEndDay(true);
        }
      }
    }, (error) => {
      console.error("Ghost Listener Error:", error);
    });

    return () => unsubGhosts();
  }, [filterDate, isToday]);`;

    lines.splice(gateStartIdx, (gateEndIdx - gateStartIdx) + 1, hardenedGatekeeper);
} else {
    console.warn('Warning: Could not find Morning Gatekeeper anchors.');
}

fs.writeFileSync(targetPath, lines.join('\n'));
console.log('Success: Reconstructed Queue.jsx Gatekeeper Shield.');
