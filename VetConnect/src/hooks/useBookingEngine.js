import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../../firebaseConfig";
import { getLocalDateStr } from '../utils/helpers';

export function useBookingEngine(date, selectedServices = [], selectedPet = null) {
  const [pets, setPets] = useState([]);
  const [services, setServices] = useState([]);

  // THE FIX: We renamed 'roleCounts' to 'departmentCapacity' because we now use Skill-Based Routing!
  const [departmentCapacity, setDepartmentCapacity] = useState({});

  const [clinicSettings, setClinicSettings] = useState({
    openHour: 8,
    closeHour: 17,
    minSlotInterval: 30,
    lunchEnabled: true,
    lunchStart: 12,
    lunchEnd: 13,
    trafficModerate: 6,
    trafficHigh: 13,
    closedDates: [], // ISO YYYY-MM-DD strings; populated from clinic_settings/general
  });

  const [availableSlots, setAvailableSlots] = useState([]);
  const [busynessLevel, setBusynessLevel] = useState("checking");
  const [activeCount, setActiveCount] = useState(0);
  const [dayAppointments, setDayAppointments] = useState([]); // T2.83: cached day's bookings
  const [dayReservations, setDayReservations] = useState([]); // T4.205: active slot reservations
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [fetching, setFetching] = useState(true);

  // 1. INITIAL ECOSYSTEM FETCH & REAL-TIME PETS
  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    // A. Real-Time Listener for Pets (Solves the "Missing Pet" bug!)
    const qPets = query(
      collection(db, "pets"),
      where("ownerId", "==", uid),
    );
    const unsubscribePets = onSnapshot(
      qPets,
      (snapshot) => {
        const activePets = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.status !== "archived");
        setPets(activePets);
      },
      (error) => {
        console.warn("[useBookingEngine] Pets listener error:", error.message);
        setFetching(false);
      },
    );

    // B. T2.5: Real-Time Listener for Clinic Settings
    // Replaces the one-shot getDoc so setting changes (closed dates, hours, etc.)
    // reflect immediately without remounting the screen.
    const settingsRef = doc(db, "clinic_settings", "general");
    const unsubscribeSettings = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          setClinicSettings((prev) => ({ ...prev, ...snap.data() }));
        }
      },
      (error) => {
        console.warn("[useBookingEngine] Settings listener error:", error.message);
      },
    );

    // C. Fetch Remaining Ecosystem (Services, Staff) — one-shot reads are fine here
    const fetchEcosystem = async () => {
      try {
        const qStaff = query(
          collection(db, "users"),
          where("accessLevel", "in", ["admin", "staff"]),
        );

        const [servSnap, staffSnap] = await Promise.all([
          getDocs(collection(db, "services")),
          getDocs(qStaff),
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
      } catch (error) {
        console.warn("[useBookingEngine] fetchEcosystem error:", error.message);
        setFetching(false);
      }
    };

    fetchEcosystem();

    return () => {
      unsubscribePets();
      unsubscribeSettings();
    };
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
    } catch (error) {
      console.warn("[useBookingEngine] fetchSlots error:", error.message);
    }
  };

  useEffect(() => {
    checkClinicLoad(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, clinicSettings.trafficModerate, clinicSettings.trafficHigh]);

  // 3a. T2.83: EFFECT 1 — Fetch day's appointments from Firestore.
  // Only re-queries when the date or closed-dates config changes.
  // This decouples the Firestore read from service/pet toggling.
  const closedDatesKey = (clinicSettings.closedDates ?? []).join(',');
  useEffect(() => {
    const dateStr = getLocalDateStr(date);
    if (closedDatesKey.split(',').includes(dateStr)) {
      setDayAppointments([]);
      return;
    }

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
    const unsub = onSnapshot(q, (snap) => {
      setDayAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.warn("[useBookingEngine] slot availability error:", error.message);
      setDayAppointments([]);
    });
    return unsub;
  }, [date, closedDatesKey]);

  // 3a-2. T4.205: EFFECT 1b — Listen for slot reservations to block slots claimed by
  // concurrent bookings that haven't yet been written as full appointment docs.
  useEffect(() => {
    const dateStr = getLocalDateStr(date);
    if ((clinicSettings.closedDates ?? []).includes(dateStr)) {
      setDayReservations([]);
      return;
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, "slot_reservations"),
      where("scheduledDate", ">=", Timestamp.fromDate(startOfDay)),
      where("scheduledDate", "<=", Timestamp.fromDate(endOfDay)),
    );
    const unsub = onSnapshot(q, (snap) => {
      // Filter out expired reservations client-side — expired docs are invisible to
      // the slot grid but remain in Firestore until overwritten or cleaned up.
      // `new Date()` evaluated INSIDE the callback so each firing uses the current time.
      const now = new Date();
      const valid = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.expiresAt && r.expiresAt.toDate() > now);
      setDayReservations(valid);
    }, (error) => {
      console.warn("[useBookingEngine] reservation listener error:", error.message);
      setDayReservations([]);
    });
    return unsub;
  }, [date, closedDatesKey]);

  // 3b. T2.83: EFFECT 2 — Compute available slots (pure computation, no Firestore reads).
  // Debounced 300ms so rapid service toggling fires only one computation pass.
  // Depends on dayAppointments (from effect 3a) + services/pets/settings.
  useEffect(() => {
    const dateStr = getLocalDateStr(date);
    if ((clinicSettings.closedDates ?? []).includes(dateStr)) {
      setAvailableSlots([]);
      setLoadingSlots(false);
      return;
    }

    if (!selectedPet || selectedServices.length === 0) {
      setAvailableSlots([]);
      return;
    }

    setLoadingSlots(true);

    const timer = setTimeout(() => {
      try {
        // Compute dept groups for the single pet
        const deptGroups = {};
        selectedServices.forEach(s => {
          const dur = parseInt(String(s.duration).replace(/[^0-9]/g, "")) || 30;
          const buff = parseInt(String(s.bufferTime).replace(/[^0-9]/g, "")) || 0;
          const dept = (s.department || s.category || "General").toLowerCase();
          deptGroups[dept] = (deptGroups[dept] || 0) + (dur + buff);
        });
        const parallelDuration = Object.keys(deptGroups).length > 0
          ? Math.max(...Object.values(deptGroups))
          : 0;

        // Build booked ranges categorized by department from cached day appointments
        const bookedRangesByDept = {};
        dayAppointments.forEach(data => {
          if (!data.scheduledDate?.toDate) return;
          const s = data.scheduledDate.toDate();
          const dur = data.serviceDuration || 30;
          const buff = data.serviceBuffer || 0;
          const end = new Date(s.getTime() + (dur + buff) * 60000);

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

        // T4.205: Merge reservation ranges — these represent slots claimed by concurrent
        // bookings that haven't yet been written as full appointment docs. The reservation
        // listener already filters out expired reservations, so all entries here are valid.
        dayReservations.forEach(res => {
          const dept = (res.department || "General").toLowerCase();
          const start = res.scheduledDate.toDate();
          const dur = res.duration || 30;
          const end = new Date(start.getTime() + dur * 60000);

          if (!bookedRangesByDept[dept]) bookedRangesByDept[dept] = [];
          bookedRangesByDept[dept].push({ start, end });
        });

        const slots = [];
        const manilaDateStr = new Intl.DateTimeFormat('en-ZA', { timeZone: 'Asia/Manila' }).format(new Date()).replace(/\//g, '-');
        const manilaTimeStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
        const now = new Date(`${manilaDateStr}T${manilaTimeStr}+08:00`);
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
            // Capacity counts for the bottleneck (most-utilized) department this booking
            // touches — surfaced on the tile as "X/Y booked". Stays 0 when no capacity check
            // ran (e.g. the slot failed an hours/lunch check first); such tiles show no count.
            let bookedCount = 0;
            let totalCapacity = 0;

            if (slotStart < now) {
              continue;
            } else {
              let canFitAll = true;
              let conflictType = "FULL";

              const petEndTime = new Date(slotStart.getTime() + parallelDuration * 60000);

              // FAILURE 1: BOUNDARIES (service would run past closing)
              if (slotStart.getHours() >= closeH || petEndTime > new Date(date).setHours(closeH, 0, 0, 0)) {
                canFitAll = false; conflictType = "OVERFLOW";
              }

              // FAILURE 2: LUNCH
              if (canFitAll && lEnabled && (
                (slotStart.getHours() >= lStart && slotStart.getHours() < lEnd) ||
                (petEndTime > new Date(date).setHours(lStart, 0, 0, 0) &&
                 slotStart < new Date(date).setHours(lEnd, 0, 0, 0))
              )) {
                canFitAll = false; conflictType = "OVERFLOW";
              }

              // FAILURE 3: DEPARTMENT CAPACITY — also captures the most-constrained
              // department's booked/capacity for the live "X/Y booked" tile count.
              if (canFitAll) {
                let bottleneckRemaining = Infinity;
                for (const [deptName, deptDuration] of Object.entries(deptGroups)) {
                  const svcStart = slotStart;
                  const svcEnd = new Date(slotStart.getTime() + deptDuration * 60000);
                  let overlaps = 0;
                  const ranges = bookedRangesByDept[deptName] || [];
                  for (const r of ranges) {
                    if (svcStart < r.end && svcEnd > r.start) overlaps++;
                  }
                  const capacity = departmentCapacity[deptName] || 0;

                  // No staff assigned to this department — structurally unbookable. A
                  // "0/0 booked" count is meaningless, so render it as Unavailable.
                  if (capacity === 0) {
                    canFitAll = false; conflictType = "OVERFLOW"; break;
                  }

                  // Surface the tightest department (fewest spots remaining).
                  const remaining = capacity - overlaps;
                  if (remaining < bottleneckRemaining) {
                    bottleneckRemaining = remaining;
                    bookedCount = Math.min(overlaps, capacity); // never display X > Y
                    totalCapacity = capacity;
                  }

                  if (overlaps >= capacity) {
                    canFitAll = false; conflictType = "FULL"; break;
                  }
                }
              }

              if (!canFitAll) slotStatus = conflictType;
            }

            slots.push({
              timeValue: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
              display: slotStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              status: slotStatus,
              booked: bookedCount,
              capacity: totalCapacity,
            });
          }
        }
        setAvailableSlots(slots);
      } catch (error) {
        console.log(error);
      } finally {
        setLoadingSlots(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [date, dayAppointments, dayReservations, selectedServices, selectedPet, clinicSettings, departmentCapacity]);

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
 * NOT in clinicSettings.closedDates, NOT in the past, and (optionally)
 * has available department capacity.
 *
 * Cascade order:
 *   1. Exact target date (if not closed, not past, and passes capacity check)
 *   2. target ± 1, ± 2, ..., ± toleranceDays (before then after for each delta)
 *   3. If nothing in tolerance window, linear scan forward from today, up to 14 days
 *   4. If still nothing, return { date: null, matchType: 'none' }
 *
 * @param {Date}     targetDate     - The vet-recommended follow-up date
 * @param {number}   toleranceDays  - How many days ± to search before falling through to scan
 * @param {object}   clinicSettings - Must contain closedDates: string[] (YYYY-MM-DD)
 * @param {Function|null} checkCapacity - Optional async (date: Date) => boolean callback.
 *   When provided, dates that are open but fully booked are also skipped.
 *   Callers on the Spark plan can omit this — the slot grid handles capacity display.
 * @returns {Promise<{ date: Date|null, matchType: 'exact'|'tolerance'|'scan'|'none' }>}
 */
export const findFirstBookableDate = async (targetDate, toleranceDays, clinicSettings, checkCapacity = null) => {
  const closed = new Set(clinicSettings?.closedDates ?? []);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isBookable = async (d) => {
    const normalized = new Date(d);
    normalized.setHours(0, 0, 0, 0);
    if (normalized < today) return false;
    if (closed.has(getLocalDateStr(normalized))) return false;
    if (checkCapacity) return await checkCapacity(normalized);
    return true;
  };

  // 1. Exact target date
  const exact = new Date(targetDate);
  exact.setHours(8, 0, 0, 0);
  if (await isBookable(exact)) {
    return { date: exact, matchType: 'exact' };
  }

  // 2. Tolerance window — symmetric expand (before, then after, for each delta)
  for (let delta = 1; delta <= toleranceDays; delta++) {
    for (const sign of [-1, 1]) {
      const candidate = new Date(exact);
      candidate.setDate(candidate.getDate() + (sign * delta));
      if (await isBookable(candidate)) {
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
    if (await isBookable(candidate)) {
      return { date: candidate, matchType: 'scan' };
    }
  }

  return { date: null, matchType: 'none' };
};
