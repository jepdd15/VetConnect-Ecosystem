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

export function useBookingEngine(date, selectedService, selectedPets) {
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

        setServices(servSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

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

  // 3. THE ENTERPRISE TETRIS ALGORITHM
  useEffect(() => {
    const generateSlots = async () => {
      if (!selectedService || selectedPets.length === 0) {
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

        // THE FIX: Check required capacity based on Department!
        const requiredDept = (
          selectedService.department ||
          selectedService.category ||
          selectedService.requiredRole ||
          "General"
        ).toLowerCase();

        const bookedRanges = snap.docs
          .filter((d) => {
            const apptDept = (
              d.data().department ||
              d.data().serviceCategory ||
              "General"
            ).toLowerCase();
            return apptDept === requiredDept;
          })
          .map((d) => {
            const s = d.data().scheduledDate.toDate();
            const dur = d.data().serviceDuration || 30;
            const buff = d.data().serviceBuffer || 0;
            return {
              start: s,
              end: new Date(s.getTime() + (dur + buff) * 60000),
            };
          });

        const baseDur =
          parseInt(String(selectedService.duration).replace(/[^0-9]/g, "")) ||
          30;
        const servBuff =
          parseInt(String(selectedService.bufferTime).replace(/[^0-9]/g, "")) ||
          0;
        const trueTimePerPet = baseDur + servBuff;

        // THE FIX: Pull the capacity from the new state variable! (Fallback to 1 if no staff assigned yet)
        const capacity = departmentCapacity[requiredDept] || 1;

        let slots = [];
        const now = new Date();
        const advanceNoticeTime = new Date(
          now.getTime() + (clinicSettings.advanceNoticeMins || 0) * 60000,
        );
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
              let conflictType = "TAKEN"; // Default fallback

              for (let i = 0; i < selectedPets.length; i++) {
                const checkStart = new Date(
                  slotStart.getTime() + i * trueTimePerPet * 60000,
                );
                const checkEnd = new Date(
                  checkStart.getTime() + trueTimePerPet * 60000,
                );

                // FAILURE 1: CLOSING TIME BOUNDARY
                if (
                  checkStart.getHours() >= closeH ||
                  checkEnd > new Date(date).setHours(closeH, 0, 0, 0)
                ) {
                  canFitAll = false;
                  conflictType = "OVERFLOW";
                  break;
                }

                // FAILURE 2: LUNCH BREAK BOUNDARY
                if (lEnabled) {
                  if (
                    checkStart.getHours() >= lStart &&
                    checkStart.getHours() < lEnd
                  ) {
                    canFitAll = false;
                    conflictType = "OVERFLOW";
                    break;
                  }
                  if (
                    checkEnd > new Date(date).setHours(lStart, 0, 0, 0) &&
                    checkStart < new Date(date).setHours(lEnd, 0, 0, 0)
                  ) {
                    canFitAll = false;
                    conflictType = "OVERFLOW";
                    break;
                  }
                }

                // FAILURE 3: DOUBLE-BOOKING (Someone actually took it)
                let overlaps = 0;
                for (let r of bookedRanges) {
                  if (checkStart < r.end && checkEnd > r.start) overlaps++;
                }

                if (overlaps >= capacity) {
                  canFitAll = false;
                  conflictType = "TAKEN";
                  break;
                }
              }
              if (!canFitAll) slotStatus = conflictType; // Pass the exact reason to the UI!
            }

            slots.push({
              timeValue: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
              display: slotStart.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
              status: slotStatus,
            });
          }
        }
        setAvailableSlots(slots);
      } catch (error) {
        console.log(error);
      } finally {
        setLoadingSlots(false);
      }
    };
    generateSlots();
  }, [date, selectedService, selectedPets, clinicSettings, departmentCapacity]);

  return {
    pets,
    services,
    availableSlots,
    busynessLevel,
    activeCount,
    fetching,
    loadingSlots,
    clinicSettings,
  };
}
