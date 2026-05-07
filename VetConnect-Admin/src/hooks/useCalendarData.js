import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useClinicSettings } from './useClinicSettings';
import { normalizeStatus } from '../utils/statusConstants';

/**
 * Formats a JS Date to a YYYY-MM-DD string using local time (not UTC).
 * @param {Date} date
 * @returns {string}
 */
function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Capacity level thresholds.
 * - empty:    0 appointments
 * - light:    < 50% of slots filled
 * - moderate: 50–80% of slots filled
 * - full:     > 80% of slots filled
 */
function computeCapacityLevel(percent) {
  if (percent <= 0) return 'empty';
  if (percent < 50) return 'light';
  if (percent <= 80) return 'moderate';
  return 'full';
}

/**
 * Custom hook that loads appointments for a date range, groups them by
 * date + hour, and exposes capacity computation helpers.
 *
 * Uses getDocs (one-shot) — NOT onSnapshot. The Refresh button in Calendar.jsx
 * calls refresh() to re-run the query.
 *
 * @param {Date}        startDate        - Query range start (inclusive).
 * @param {Date}        endDate          - Query range end (inclusive, set to 23:59:59.999).
 * @param {string|null} departmentFilter - serviceCategory to filter by, or null for all.
 * @returns {{
 *   appointments: Array,
 *   dayMap: Map<string, Map<number, Array>>,
 *   loading: boolean,
 *   error: string|null,
 *   refresh: () => void,
 *   getSlotCapacity: (dateStr: string, hour: number) => { count: number, maxSlots: number, percent: number, level: string },
 *   isClosedDate: (dateStr: string) => boolean,
 *   isWorkingDay: (dayOfWeek: number) => boolean,
 *   isLunchHour: (hour: number) => boolean,
 * }}
 */
export function useCalendarData(startDate, endDate, departmentFilter) {
  const settings = useClinicSettings();

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Re-run query whenever the date range, filter, or refresh counter changes.
  useEffect(() => {
    if (!startDate || !endDate) return;

    let cancelled = false;

    const fetchAppointments = async () => {
      setLoading(true);
      setError(null);

      try {
        const apptQuery = query(
          collection(db, 'appointments'),
          where('scheduledDate', '>=', Timestamp.fromDate(startDate)),
          where('scheduledDate', '<=', Timestamp.fromDate(endDate)),
          orderBy('scheduledDate', 'asc')
        );

        const snap = await getDocs(apptQuery);

        if (cancelled) return;

        const rawList = snap.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            status: normalizeStatus(data.status),
            jsScheduled: data.scheduledDate?.toDate?.() ?? null,
          };
        });

        // Apply department filter (case-insensitive) when set.
        const filtered = departmentFilter
          ? rawList.filter(
              (a) =>
                (a.serviceCategory || '').toLowerCase() ===
                departmentFilter.toLowerCase()
            )
          : rawList;

        setAppointments(filtered);
      } catch (err) {
        if (!cancelled) {
          console.error('[useCalendarData.fetchAppointments]:', err.message);
          setError(err.message || 'Failed to load appointments.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAppointments();

    return () => {
      cancelled = true;
    };
  }, [
    // Serialize Date objects so the effect only re-fires on actual date changes.
    startDate?.getTime(),
    endDate?.getTime(),
    departmentFilter,
    refreshCounter,
  ]);

  /** Increment the counter to trigger a fresh getDocs call. */
  const refresh = useCallback(() => {
    setRefreshCounter((n) => n + 1);
  }, []);

  /**
   * dayMap: Map<YYYY-MM-DD, Map<hour(0-23), Appointment[]>>
   * Built fresh whenever the appointments list changes.
   */
  const dayMap = useMemo(() => {
    const map = new Map();

    for (const appt of appointments) {
      if (!appt.jsScheduled) continue;

      const dateStr = toLocalDateStr(appt.jsScheduled);
      const hour    = appt.jsScheduled.getHours();

      if (!map.has(dateStr)) map.set(dateStr, new Map());
      const hourMap = map.get(dateStr);

      if (!hourMap.has(hour)) hourMap.set(hour, []);
      hourMap.get(hour).push(appt);
    }

    return map;
  }, [appointments]);

  /**
   * Returns capacity metrics for a specific date + hour.
   * maxSlots = 60 / minSlotInterval (e.g. 30-min slots → 2 per hour).
   */
  const getSlotCapacity = useCallback(
    (dateStr, hour) => {
      const minSlotInterval = settings.minSlotInterval || 30;
      const maxSlots        = Math.floor(60 / minSlotInterval);
      const hourMap         = dayMap.get(dateStr);
      const count           = hourMap?.get(hour)?.length ?? 0;
      const percent         = maxSlots > 0 ? Math.min((count / maxSlots) * 100, 100) : 0;
      const level           = computeCapacityLevel(percent);

      return { count, maxSlots, percent, level };
    },
    [dayMap, settings.minSlotInterval]
  );

  /** True if dateStr (YYYY-MM-DD) appears in the clinic's closedDates list. */
  const isClosedDate = useCallback(
    (dateStr) => {
      const closed = settings.closedDates || [];
      return closed.includes(dateStr);
    },
    [settings.closedDates]
  );

  /**
   * True if dayOfWeek (0 = Sun … 6 = Sat) is a working day.
   * Default: all 7 days are working.
   */
  const isWorkingDay = useCallback(
    (dayOfWeek) => {
      const working = settings.workingDays;
      if (!working || working.length === 0) return true;
      return working.includes(dayOfWeek);
    },
    [settings.workingDays]
  );

  /** True if the hour falls within the configured lunch break. */
  const isLunchHour = useCallback(
    (hour) => {
      if (!settings.lunchEnabled) return false;
      const start = settings.lunchStart ?? 12;
      const end   = settings.lunchEnd   ?? 13;
      return hour >= start && hour < end;
    },
    [settings.lunchEnabled, settings.lunchStart, settings.lunchEnd]
  );

  return {
    appointments,
    dayMap,
    loading,
    error,
    refresh,
    getSlotCapacity,
    isClosedDate,
    isWorkingDay,
    isLunchHour,
  };
}
