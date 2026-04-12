import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../../firebaseConfig";

// Local-time YYYY-MM-DD formatter (Asia/Manila expected on device).
// Exported so BookAppointment can share the same normalizer without duplication.
export const getLocalDateStrMobile = (d) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function useBookingEngine(date, selectedServices = [], selectedPets) {
  const [pets, setPets] = useState([]);
  const [services, setServices] = useState([]);

  // THE FIX: We renamed 'roleCounts' to 'departmentCapacity' because we now use Skill-Based Routing!
  const [departmentCapacity, setDepartmentCapacity] = useState({});

  const [clinicSettings, setClinicSettings] = useState({
    openHour: 8,
    closeHour: 17,
    advanceNoticeMins: 120,
    minSlotInterval: 30,
    lunchEnabled: true,
    lunchStart: 12,
    lunchEnd: 13,
    trafficModerate: 6,
    trafficHigh: 13,
    maxPetsPerBooking: 3,
    closedDates: [], // ISO YYYY-MM-DD strings; populated from clinic_settings/general
  });

  const [availableSlots, setAvailableSlots] = useState([]);
  const [busynessLevel, setBusynessLevel] = useState("checking");
  const [activeCount, setActiveCount] = useState(0);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [fetching, setFetching] = useState(true);

  // 1. INITIAL ECOSYSTEM FETCH & REAL-TIME PETS
  useEffect(() => {
    // A. Real-Time Listener for Pets (Solves the "Missing Pet" bug!)
    const qPets = query(
      collection(db, "pets"),
      where("ownerId", "==", auth.currentUser.uid),
    );
    const unsubscribePets = onSnapshot(qPets, (snapshot) => {
      const activePets = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.status !== "archived");
      setPets(activePets);
    });

    // B. Fetch Clinic Rules (Services, Staff, Settings)
    const fetchEcosystem = async () => {
      try {
        const settingsRef = doc(db, "clinic_settings", "general");
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          setClinicSettings((prev) => ({ ...prev, ...settingsSnap.data() }));
        }

        const qStaff = query(
          collection(db, "users"),
          where("accessLevel", "in", ["admin", "staff"]),
        );

        const [servSnap, staffSnap] = await Promise.all([
          getDocs(collection(db, "services")),
          getDocs(qStaff), // THE FIX: Only fetch documents where accessLevel is 'admin' or 'staff'!
        ]);

        setServices(servSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(s => !s.isArchived));

        // C. THE FIX: Skill-Based Capacity Counter!
        let deptCounts = {};
        staffSnap.docs.forEach((d) => {
          const staff = d.data();

          // Count based on the new 'departments' array
          if (staff.departments && Array.isArray(staff.departments)) {
            staff.departments.forEach((dept) => {
              const deptKey = dept.toLowerCase();
              deptCounts[deptKey] = (deptCounts[deptKey] || 0) + 1;
            });
          }
          // Legacy Fallback for old records
          else if (staff.role) {
            const roleKey = staff.role.toLowerCase();
            deptCounts[roleKey] = (deptCounts[roleKey] || 0) + 1;
          }
        });

        // Save the math to our new state variable
        setDepartmentCapacity(deptCounts);
        setFetching(false);
      } catch (err) {
        console.error(err);
        setFetching(false);
      }
    };

    fetchEcosystem();

    return () => unsubscribePets();
  }, []);

  // 2. SMART BUSYNESS CALCULATOR
  const checkClinicLoad = async (checkDate) => {
    setBusynessLevel("checking");
    const startOfDay = new Date(checkDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(checkDate);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      const qSched = query(
        collection(db, "appointments"),
        where("scheduledDate", ">=", Timestamp.fromDate(startOfDay)),
        where("scheduledDate", "<=", Timestamp.fromDate(endOfDay)),
        where("status", "in", ["confirmed", "pending"]),
      );
      const qPhys = query(
        collection(db, "appointments"),
        where("status", "in", ["arrived", "in-consult", "confined"]),
      );

      const [sSnap, pSnap] = await Promise.all([
        getDocs(qSched),
        getDocs(qPhys),
      ]);
      const total = sSnap.size + pSnap.size;
      setActiveCount(total);

      const modLimit = clinicSettings.trafficModerate || 6;
      const highLimit = clinicSettings.trafficHigh || 13;

      if (total < modLimit) setBusynessLevel("low");
      else if (total < highLimit) setBusynessLevel("moderate");
      else setBusynessLevel("high");
    } catch (e) {
      console.log(e);
    }
  };

  useEffect(() => {
    checkClinicLoad(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // 3. THE ENTERPRISE TETRIS ALGORITHM (Now with Multi-Service Prowess!)
  useEffect(() => {
    const generateSlots = async () => {
      // Closed-date guard — return empty slots immediately if the clinic is
      // explicitly closed on this date. No Firestore reads needed.
      const dateStr = getLocalDateStrMobile(date);
      if ((clinicSettings.closedDates ?? []).includes(dateStr)) {
        setAvailableSlots([]);
        setLoadingSlots(false);
        return;
      }

      if (!selectedServices || selectedServices.length === 0 || selectedPets.length === 0) {
        setAvailableSlots([]);
        return;
      }
      setLoadingSlots(true);
      try {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const q = query(
          collection(db, "appointments"),
          where("scheduledDate", ">=", Timestamp.fromDate(startOfDay)),
          where("scheduledDate", "<=", Timestamp.fromDate(endOfDay)),
          where("status", "in", ["pending", "confirmed"]),
        );
        const snap = await getDocs(q);

        // --- 🧬 CALCULATE BUNDLE PARAMETERS ---
        let bundleTotalMinutes = 0;
        const requiredDepts = []; // Track every department involved!

        selectedServices.forEach(s => {
            const dur = parseInt(String(s.duration).replace(/[^0-9]/g, "")) || 30;
            const buff = parseInt(String(s.bufferTime).replace(/[^0-9]/g, "")) || 0;
            bundleTotalMinutes += (dur + buff);
            
            const dept = (s.department || s.category || "General").toLowerCase();
            requiredDepts.push({ name: dept, duration: (dur + buff) });
        });

        // Total time per pet = bundle duration
        const totalDurationPerPet = bundleTotalMinutes;

        // THE FIX: Collect all booked ranges categorized by department
        const bookedRangesByDept = {};
        snap.docs.forEach(d => {
            const data = d.data();
            const s = data.scheduledDate.toDate();
            const dur = data.serviceDuration || 30;
            const buff = data.serviceBuffer || 0;
            const end = new Date(s.getTime() + (dur + buff) * 60000);
            
            // Check legacy field AND new multi-service array
            const deptsInAppt = new Set();
            if (data.services && Array.isArray(data.services)) {
                data.services.forEach(svc => deptsInAppt.add((svc.department || "General").toLowerCase()));
            } else {
                deptsInAppt.add((data.department || data.serviceCategory || "General").toLowerCase());
            }

            deptsInAppt.forEach(dept => {
                if (!bookedRangesByDept[dept]) bookedRangesByDept[dept] = [];
                bookedRangesByDept[dept].push({ start: s, end });
            });
        });

        let slots = [];
        const now = new Date();
        const advanceNoticeTime = new Date(now.getTime() + (clinicSettings.advanceNoticeMins || 0) * 60000);
        const slotInterval = clinicSettings.minSlotInterval || 30;
        const openH = clinicSettings.openHour || 8;
        const closeH = clinicSettings.closeHour || 17;
        const lEnabled = clinicSettings.lunchEnabled;
        const lStart = clinicSettings.lunchStart || 12;
        const lEnd = clinicSettings.lunchEnd || 13;

        for (let h = openH; h < closeH; h++) {
          if (lEnabled && h >= lStart && h < lEnd) continue;

          for (let m = 0; m < 60; m += slotInterval) {
            const slotStart = new Date(date);
            slotStart.setHours(h, m, 0, 0);
            let slotStatus = "AVAILABLE";

            if (slotStart < now) {
              continue;
            } else if (slotStart < advanceNoticeTime) {
              slotStatus = "TOO_SOON";
            } else {
              let canFitAll = true;
              let conflictType = "TAKEN";

              // Verify SLOTS for EACH PET
              for (let i = 0; i < selectedPets.length; i++) {
                const petStartOffset = i * totalDurationPerPet * 60000;
                const petStartTime = new Date(slotStart.getTime() + petStartOffset);
                const petEndTime = new Date(petStartTime.getTime() + totalDurationPerPet * 60000);

                // FAILURE 1: BOUNDARIES
                if (petStartTime.getHours() >= closeH || petEndTime > new Date(date).setHours(closeH, 0, 0, 0)) {
                  canFitAll = false; conflictType = "OVERFLOW"; break;
                }
                
                // FAILURE 2: LUNCH
                if (lEnabled && ((petStartTime.getHours() >= lStart && petStartTime.getHours() < lEnd) || (petEndTime > new Date(date).setHours(lStart, 0, 0, 0) && petStartTime < new Date(date).setHours(lEnd, 0, 0, 0)))) {
                  canFitAll = false; conflictType = "OVERFLOW"; break;
                }

                // FAILURE 3: MULTI-DEPARTMENT CAPACITY CHECK (THE BRAIN!)
                let serviceOffset = 0;
                for (let rd of requiredDepts) {
                    const svcStart = new Date(petStartTime.getTime() + serviceOffset);
                    const svcEnd = new Date(svcStart.getTime() + rd.duration * 60000);
                    
                    let overlaps = 0;
                    const ranges = bookedRangesByDept[rd.name] || [];
                    for (let r of ranges) {
                        if (svcStart < r.end && svcEnd > r.start) overlaps++;
                    }

                    const capacity = departmentCapacity[rd.name] || 0; // THE FIX: Default to 0, ensuring unstaffed departments are blocked!
                    if (capacity === 0 || overlaps >= capacity) {
                        canFitAll = false; 
                        conflictType = "TAKEN"; 
                        break; 
                    }
                    serviceOffset += rd.duration * 60000; // Move to next service in bundle
                }
                if (!canFitAll) break;
              }
              if (!canFitAll) slotStatus = conflictType;
            }

            slots.push({
              timeValue: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
              display: slotStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              status: slotStatus,
            });
          }
        }
        setAvailableSlots(slots);
      } catch (error) { console.log(error); }
      finally { setLoadingSlots(false); }
    };
    generateSlots();
  }, [date, selectedServices, selectedPets, clinicSettings, departmentCapacity]);

  return {
    pets,
    services,
    availableSlots,
    busynessLevel,
    activeCount,
    fetching,
    loadingSlots,
    clinicSettings,
    departmentCapacity,
  };
}

/**
 * Walks candidate dates around a target and returns the first one that is
 * NOT in clinicSettings.closedDates and NOT in the past.
 *
 * Cascade order:
 *   1. Exact target date (if not closed and not past)
 *   2. target ± 1, ± 2, ..., ± toleranceDays (before before after for each delta)
 *   3. If nothing in tolerance window, linear scan forward from today, up to 14 days
 *   4. If still nothing, return { date: null, matchType: 'none' }
 *
 * NOTE: Does NOT check department capacity — that is handled by generateSlots
 * once the wizard lands on step 3. This helper only answers "is the clinic open on day X".
 *
 * @param {Date} targetDate   - The vet-recommended follow-up date
 * @param {number} toleranceDays - How many days ± to search before falling through to scan
 * @param {object} clinicSettings - Must contain closedDates: string[] (YYYY-MM-DD)
 * @returns {{ date: Date|null, matchType: 'exact'|'tolerance'|'scan'|'none' }}
 */
export const findFirstBookableDate = (targetDate, toleranceDays, clinicSettings) => {
  const closed = new Set(clinicSettings?.closedDates ?? []);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isBookable = (d) => {
    const normalized = new Date(d);
    normalized.setHours(0, 0, 0, 0);
    if (normalized < today) return false;
    return !closed.has(getLocalDateStrMobile(normalized));
  };

  // 1. Exact target date
  const exact = new Date(targetDate);
  exact.setHours(8, 0, 0, 0);
  if (isBookable(exact)) {
    return { date: exact, matchType: 'exact' };
  }

  // 2. Tolerance window — symmetric expand (before, then after, for each delta)
  for (let delta = 1; delta <= toleranceDays; delta++) {
    for (const sign of [-1, 1]) {
      const candidate = new Date(exact);
      candidate.setDate(candidate.getDate() + (sign * delta));
      if (isBookable(candidate)) {
        return { date: candidate, matchType: 'tolerance' };
      }
    }
  }

  // 3. Linear scan from today forward, cap at 14 days
  const scanStart = new Date(today);
  for (let i = 0; i <= 14; i++) {
    const candidate = new Date(scanStart);
    candidate.setDate(candidate.getDate() + i);
    candidate.setHours(8, 0, 0, 0);
    if (isBookable(candidate)) {
      return { date: candidate, matchType: 'scan' };
    }
  }

  return { date: null, matchType: 'none' };
};
