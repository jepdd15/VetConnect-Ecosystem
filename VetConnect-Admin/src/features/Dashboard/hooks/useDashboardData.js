/**
 * useDashboardData — Central data hook for the Dashboard feature.
 *
 * Opens real-time Firestore listeners scoped to a given time period and
 * returns computed metrics for all four Dashboard tabs. Days 2–6 will
 * add `growth`, `clinical`, and `financial` computed blocks inside this
 * same hook without changing the existing return shape.
 *
 * @param {'today'|'week'|'month'|'quarter'|'year'|'3month'|'6month'|'1year'} period
 * @returns {{ loading, error, ops, growth, financial, queueData, appointments, staffList, period, dateRange }}
 */

import { useState, useEffect, useMemo } from 'react';
import {
  collection, doc, onSnapshot, query, where,
  Timestamp, getDocs,
} from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

// ── Date helpers ────────────────────────────────────────────────

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Converts a period key into an inclusive [startDate, endDate] range.
 * All ranges end at the current moment's end-of-day.
 */
function buildDateRange(period) {
  const now = new Date();

  switch (period) {
    case 'today':
      return { startDate: startOfDay(now), endDate: endOfDay(now) };

    case 'week': {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 6);
      return { startDate: startOfDay(weekAgo), endDate: endOfDay(now) };
    }

    case 'month': {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: startOfDay(firstOfMonth), endDate: endOfDay(now) };
    }

    case 'quarter': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const firstOfQuarter = new Date(now.getFullYear(), quarterStartMonth, 1);
      return { startDate: startOfDay(firstOfQuarter), endDate: endOfDay(now) };
    }

    case 'year': {
      const firstOfYear = new Date(now.getFullYear(), 0, 1);
      return { startDate: startOfDay(firstOfYear), endDate: endOfDay(now) };
    }

    case '3month': {
      const start = new Date(now);
      start.setDate(now.getDate() - 89); // 90-day rolling window
      return { startDate: startOfDay(start), endDate: endOfDay(now) };
    }

    case '6month': {
      const start = new Date(now);
      start.setDate(now.getDate() - 179); // 180-day rolling window
      return { startDate: startOfDay(start), endDate: endOfDay(now) };
    }

    case '1year': {
      const start = new Date(now);
      start.setDate(now.getDate() - 364); // 365-day rolling window
      return { startDate: startOfDay(start), endDate: endOfDay(now) };
    }

    default:
      return { startDate: startOfDay(now), endDate: endOfDay(now) };
  }
}

/**
 * Computes the date range for the same period one year ago.
 * Used for year-over-year benchmarking (T4.3).
 *
 * For rolling windows (3month, 6month, 1year) the entire window shifts
 * back 365 days so the comparison is apples-to-apples in duration.
 */
function buildYearAgoRange(period) {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  switch (period) {
    case 'today':
      return { startDate: startOfDay(oneYearAgo), endDate: endOfDay(oneYearAgo) };

    case 'week': {
      const weekStart = new Date(oneYearAgo);
      weekStart.setDate(oneYearAgo.getDate() - 6);
      return { startDate: startOfDay(weekStart), endDate: endOfDay(oneYearAgo) };
    }

    case 'month': {
      const firstOfMonth = new Date(oneYearAgo.getFullYear(), oneYearAgo.getMonth(), 1);
      return { startDate: startOfDay(firstOfMonth), endDate: endOfDay(oneYearAgo) };
    }

    case 'quarter': {
      const qStartMonth = Math.floor(oneYearAgo.getMonth() / 3) * 3;
      const firstOfQ = new Date(oneYearAgo.getFullYear(), qStartMonth, 1);
      return { startDate: startOfDay(firstOfQ), endDate: endOfDay(oneYearAgo) };
    }

    case 'year': {
      const firstOfYear = new Date(now.getFullYear() - 1, 0, 1);
      const lastOfYear = new Date(now.getFullYear() - 1, 11, 31);
      return { startDate: startOfDay(firstOfYear), endDate: endOfDay(lastOfYear) };
    }

    case '3month': {
      // Shift the current 90-day window back 365 days
      const end = new Date(now);
      end.setDate(now.getDate() - 365);
      const start = new Date(end);
      start.setDate(end.getDate() - 89);
      return { startDate: startOfDay(start), endDate: endOfDay(end) };
    }

    case '6month': {
      const end = new Date(now);
      end.setDate(now.getDate() - 365);
      const start = new Date(end);
      start.setDate(end.getDate() - 179);
      return { startDate: startOfDay(start), endDate: endOfDay(end) };
    }

    case '1year': {
      const end = new Date(now);
      end.setDate(now.getDate() - 365);
      const start = new Date(end);
      start.setDate(end.getDate() - 364);
      return { startDate: startOfDay(start), endDate: endOfDay(end) };
    }

    default:
      return { startDate: startOfDay(oneYearAgo), endDate: endOfDay(oneYearAgo) };
  }
}

/**
 * Computes the previous period's date range for delta comparisons.
 * 'today' -> yesterday, 'week' -> prior 7 days, 'month' -> prior month,
 * 'quarter' -> prior quarter, 'year' -> prior year.
 */
function buildPrevDateRange(period) {
  const now = new Date();

  switch (period) {
    case 'today': {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      return { startDate: startOfDay(yesterday), endDate: endOfDay(yesterday) };
    }
    case 'week': {
      const prevWeekEnd = new Date(now);
      prevWeekEnd.setDate(now.getDate() - 7);
      const prevWeekStart = new Date(prevWeekEnd);
      prevWeekStart.setDate(prevWeekEnd.getDate() - 6);
      return { startDate: startOfDay(prevWeekStart), endDate: endOfDay(prevWeekEnd) };
    }
    case 'month': {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
      return { startDate: startOfDay(prevMonth), endDate: endOfDay(prevMonthEnd) };
    }
    case 'quarter': {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      const prevQStart = new Date(now.getFullYear(), qStart - 3, 1);
      const prevQEnd = new Date(now.getFullYear(), qStart, 0);
      return { startDate: startOfDay(prevQStart), endDate: endOfDay(prevQEnd) };
    }
    case 'year': {
      const prevYear = new Date(now.getFullYear() - 1, 0, 1);
      const prevYearEnd = new Date(now.getFullYear() - 1, 11, 31);
      return { startDate: startOfDay(prevYear), endDate: endOfDay(prevYearEnd) };
    }
    case '3month': {
      // Previous 90 days: [now-179d, now-90d]
      const prevEnd = new Date(now);
      prevEnd.setDate(now.getDate() - 90);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevEnd.getDate() - 89);
      return { startDate: startOfDay(prevStart), endDate: endOfDay(prevEnd) };
    }
    case '6month': {
      // Previous 180 days: [now-359d, now-180d]
      const prevEnd = new Date(now);
      prevEnd.setDate(now.getDate() - 180);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevEnd.getDate() - 179);
      return { startDate: startOfDay(prevStart), endDate: endOfDay(prevEnd) };
    }
    case '1year': {
      // Previous 365 days: [now-729d, now-365d]
      const prevEnd = new Date(now);
      prevEnd.setDate(now.getDate() - 365);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevEnd.getDate() - 364);
      return { startDate: startOfDay(prevStart), endDate: endOfDay(prevEnd) };
    }
    default:
      return buildDateRange(period);
  }
}

// ── Firestore role filter ────────────────────────────────────────

const STAFF_ROLES = ['veterinarian', 'groomer', 'staff', 'admin'];

// ── Trend helpers ────────────────────────────────────────────────

/**
 * Groups documents by date bucket for bar chart trends, returning entries
 * sorted chronologically by the earliest timestamp in each bucket.
 *
 * For 'today': group by hour. For 'week': group by weekday label.
 * For 'month': group by day-of-month. For 'quarter'/'3month'/'6month': group by ISO week.
 * For 'year'/'1year': group by month name.
 *
 * @param {Object[]} docs       - Array of Firestore document objects
 * @param {string}   dateField  - Field name holding a Firestore Timestamp or Date
 * @param {string}   period     - One of 'today' | 'week' | 'month' | 'quarter' | 'year' | '3month' | '6month' | '1year'
 * @returns {{ label: string, count: number }[]}
 */
function buildTrend(docs, dateField, period) {
  if (docs.length === 0) return [];

  const counts = {};
  const sortKeys = {}; // earliest timestamp per bucket for chronological ordering

  docs.forEach(d => {
    const raw = d[dateField];
    if (!raw) return;
    const date = raw.toDate ? raw.toDate() : new Date(raw);
    const ts = date.getTime();

    let key;
    if (period === 'today') {
      key = `${date.getHours()}:00`;
    } else if (period === 'week') {
      key = date.toLocaleDateString('en-PH', { weekday: 'short' });
    } else if (period === 'month') {
      key = `${date.getMonth() + 1}/${date.getDate()}`;
    } else if (period === 'quarter' || period === '3month' || period === '6month') {
      const weekOfYear = Math.ceil(
        ((date - new Date(date.getFullYear(), 0, 1)) / 86400000 + 1) / 7,
      );
      key = `W${weekOfYear}`;
    } else {
      // 'year' and '1year' both bucket by month name
      key = date.toLocaleDateString('en-PH', { month: 'short' });
    }

    counts[key] = (counts[key] || 0) + 1;
    // Track the earliest timestamp per bucket so we can sort chronologically
    if (sortKeys[key] === undefined || ts < sortKeys[key]) sortKeys[key] = ts;
  });

  return Object.entries(counts)
    .sort(([a], [b]) => (sortKeys[a] || 0) - (sortKeys[b] || 0))
    .map(([label, count]) => ({ label, count }));
}

/**
 * Groups financial documents by date bucket, summing a numeric value field.
 * Returns entries sorted chronologically by earliest timestamp per bucket.
 *
 * @param {Object[]} docs       - Array of Firestore document objects
 * @param {string}   dateField  - Field name holding a Firestore Timestamp or Date
 * @param {string}   period     - One of 'today' | 'week' | 'month' | 'quarter' | 'year' | '3month' | '6month' | '1year'
 * @param {string}   valueField - Field name holding the numeric value to sum
 * @returns {{ label: string, amount: number }[]}
 */
function buildFinancialTrend(docs, dateField, period, valueField) {
  if (docs.length === 0) return [];

  const sums = {};
  const sortKeys = {};

  docs.forEach(d => {
    const raw = d[dateField];
    if (!raw) return;
    const date = raw.toDate ? raw.toDate() : new Date(raw);
    const ts = date.getTime();
    const val = parseFloat(d[valueField]) || 0;

    let key;
    if (period === 'today') {
      key = `${date.getHours()}:00`;
    } else if (period === 'week') {
      key = date.toLocaleDateString('en-PH', { weekday: 'short' });
    } else if (period === 'month') {
      key = `${date.getMonth() + 1}/${date.getDate()}`;
    } else if (period === 'quarter' || period === '3month' || period === '6month') {
      const weekOfYear = Math.ceil(
        ((date - new Date(date.getFullYear(), 0, 1)) / 86400000 + 1) / 7,
      );
      key = `W${weekOfYear}`;
    } else {
      // 'year' and '1year' both bucket by month name
      key = date.toLocaleDateString('en-PH', { month: 'short' });
    }

    sums[key] = (sums[key] || 0) + val;
    if (sortKeys[key] === undefined || ts < sortKeys[key]) sortKeys[key] = ts;
  });

  return Object.entries(sums)
    .sort(([a], [b]) => (sortKeys[a] || 0) - (sortKeys[b] || 0))
    .map(([label, amount]) => ({ label, amount: Math.round(amount) }));
}

// ── Hook ────────────────────────────────────────────────────────

export function useDashboardData(period = 'today', refreshKey = 0, benchmarkEnabled = false) {
  const [appointments, setAppointments] = useState([]);
  const [queueData, setQueueData] = useState(null);
  const [staffList, setStaffList] = useState([]);

  // Day 2: Growth tab data
  const [clients, setClients] = useState([]);
  const [allClientIds, setAllClientIds] = useState(new Set());
  const [pets, setPets] = useState([]);

  // Day 2: Financial tab data
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);

  // Day 3: Clinical tab data
  const [medicalRecords, setMedicalRecords] = useState([]);

  // Day 3: Previous period data (one-shot, for delta computation)
  const [prevData, setPrevData] = useState({
    appointments: [],
    sales: [],
    expenses: [],
    medicalRecords: [],
  });

  // T4.3: Year-ago data for YoY benchmarking (one-shot, fires when benchmarkEnabled)
  const [yearAgoData, setYearAgoData] = useState({
    appointments: [],
    sales: [],
    expenses: [],
    medicalRecords: [],
  });

  // Day 6: Historical raw data for 6-month min/max/avg (one-shot on mount, T2.338)
  const [historicalData, setHistoricalData] = useState(null);

  // True until the first appointments snapshot resolves.
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Derive stable date range from period so the query only rebuilds when
  // the period string actually changes (not on every render).
  // refreshKey is included so a manual refresh tick (T4.1) forces date
  // recomputation — important for 'today' crossing midnight, and for
  // re-triggering the period-scoped onSnapshot listeners.
  const dateRange = useMemo(() => buildDateRange(period), [period, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Listener 1: Appointments (period-scoped) ──────────────────
  useEffect(() => {
    setAppointmentsLoading(true);
    const startTs = Timestamp.fromDate(dateRange.startDate);
    const endTs = Timestamp.fromDate(dateRange.endDate);

    const q = query(
      collection(db, 'appointments'),
      where('scheduledDate', '>=', startTs),
      where('scheduledDate', '<=', endTs),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setAppointmentsLoading(false);
      },
      (err) => {
        console.error('[useDashboardData] appointments listener:', err.message);
        setError(err.message);
        setAppointmentsLoading(false);
      },
    );

    return unsub;
  }, [dateRange]);

  // ── Listener 2: Queue (today only) ───────────────────────────
  useEffect(() => {
    if (period !== 'today') {
      setQueueData(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'queue', 'daily_queue'),
      (snap) => setQueueData(snap.exists() ? snap.data() : null),
      (err) => console.error('[useDashboardData] queue listener:', err.message),
    );

    return unsub;
  }, [period]);

  // ── Listener 3: Staff users (period-independent, opens once) ──
  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('role', 'in', STAFF_ROLES),
    );

    const unsub = onSnapshot(
      q,
      (snap) => setStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.error('[useDashboardData] staff listener:', err.message),
    );

    return unsub;
  }, []); // intentionally empty — staff list never needs to re-query on period change

  // ── Listener 4: Clients registered in period (Growth tab) ─────
  useEffect(() => {
    const startTs = Timestamp.fromDate(dateRange.startDate);
    const endTs = Timestamp.fromDate(dateRange.endDate);

    const q = query(
      collection(db, 'users'),
      where('role', '==', 'pet_owner'),
      where('createdAt', '>=', startTs),
      where('createdAt', '<=', endTs),
    );

    const unsub = onSnapshot(
      q,
      (snap) => setClients(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.error('[useDashboardData] clients listener:', err.message),
    );

    return unsub;
  }, [dateRange]);

  // ── Listener 4b: All clients (period-independent) — for total active + retention ──
  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'pet_owner'),
    );

    const unsub = onSnapshot(
      q,
      (snap) => setAllClientIds(new Set(snap.docs.map(d => d.id))),
      (err) => console.error('[useDashboardData] allClients listener:', err.message),
    );

    return unsub;
  }, []); // period-independent — only opens once

  // ── Listener 5: All pets (period-independent) ─────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'pets'),
      (snap) => setPets(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(p => !p.deletedAt && !p.archived),
      ),
      (err) => console.error('[useDashboardData] pets listener:', err.message),
    );

    return unsub;
  }, []); // period-independent — only opens once

  // ── Listener 6: Sales in period (Financial tab) ───────────────
  useEffect(() => {
    const startTs = Timestamp.fromDate(dateRange.startDate);
    const endTs = Timestamp.fromDate(dateRange.endDate);

    const q = query(
      collection(db, 'sales'),
      where('date', '>=', startTs),
      where('date', '<=', endTs),
    );

    const unsub = onSnapshot(
      q,
      (snap) => setSales(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.error('[useDashboardData] sales listener:', err.message),
    );

    return unsub;
  }, [dateRange]);

  // ── Listener 7: Expenses in period (Financial tab) ────────────
  useEffect(() => {
    const startTs = Timestamp.fromDate(dateRange.startDate);
    const endTs = Timestamp.fromDate(dateRange.endDate);

    const q = query(
      collection(db, 'expenses'),
      where('date', '>=', startTs),
      where('date', '<=', endTs),
    );

    const unsub = onSnapshot(
      q,
      (snap) => setExpenses(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(e => !e.deletedAt), // exclude soft-deleted entries
      ),
      (err) => console.error('[useDashboardData] expenses listener:', err.message),
    );

    return unsub;
  }, [dateRange]);

  // ── Listener 8: Medical records in period (Clinical tab) ────────
  useEffect(() => {
    const startTs = Timestamp.fromDate(dateRange.startDate);
    const endTs = Timestamp.fromDate(dateRange.endDate);

    const q = query(
      collection(db, 'medical_records'),
      where('date', '>=', startTs),
      where('date', '<=', endTs),
    );

    const unsub = onSnapshot(
      q,
      (snap) => setMedicalRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.error('[useDashboardData] medicalRecords listener:', err.message),
    );

    return unsub;
  }, [dateRange]);

  // ── Previous period data (one-shot, for delta computation) ──────
  useEffect(() => {
    const prevRange = buildPrevDateRange(period);
    const prevStartTs = Timestamp.fromDate(prevRange.startDate);
    const prevEndTs = Timestamp.fromDate(prevRange.endDate);

    const fetchPrev = async () => {
      try {
        const [apptSnap, salesSnap, expSnap, recSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'appointments'),
            where('scheduledDate', '>=', prevStartTs),
            where('scheduledDate', '<=', prevEndTs),
          )),
          getDocs(query(
            collection(db, 'sales'),
            where('date', '>=', prevStartTs),
            where('date', '<=', prevEndTs),
          )),
          getDocs(query(
            collection(db, 'expenses'),
            where('date', '>=', prevStartTs),
            where('date', '<=', prevEndTs),
          )),
          getDocs(query(
            collection(db, 'medical_records'),
            where('date', '>=', prevStartTs),
            where('date', '<=', prevEndTs),
          )),
        ]);

        setPrevData({
          appointments: apptSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          sales: salesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(s => s.status !== 'refunded' && s.status !== 'voided'),
          expenses: expSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(e => !e.deletedAt),
          medicalRecords: recSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        });
      } catch (err) {
        console.error('[useDashboardData] prevPeriod fetch:', err.message);
        // Non-fatal: deltas will show as null if previous data fails
      }
    };

    fetchPrev();
  }, [period, refreshKey]); // Re-fetch on period change or manual refresh tick (T4.1)

  // ── Historical data fetch (one-shot, 6-month lookback for min/max/avg, T2.338) ──
  // Fires only on mount — 6 months is a fixed lookback window that doesn't change
  // with period. This avoids 3 extra real-time listeners for data that changes slowly.
  useEffect(() => {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const startTs = Timestamp.fromDate(startOfDay(sixMonthsAgo));
    const endTs = Timestamp.fromDate(endOfDay(now));

    const fetchHistorical = async () => {
      try {
        const [apptSnap, salesSnap, recSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'appointments'),
            where('scheduledDate', '>=', startTs),
            where('scheduledDate', '<=', endTs),
          )),
          getDocs(query(
            collection(db, 'sales'),
            where('date', '>=', startTs),
            where('date', '<=', endTs),
          )),
          getDocs(query(
            collection(db, 'medical_records'),
            where('date', '>=', startTs),
            where('date', '<=', endTs),
          )),
        ]);

        setHistoricalData({
          appointments: apptSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          sales: salesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(s => s.status !== 'refunded' && s.status !== 'voided'),
          medicalRecords: recSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        });
      } catch (err) {
        console.error('[useDashboardData] historical fetch:', err.message);
        // Non-fatal — tooltip simply shows no data when historicalData is null
      }
    };

    fetchHistorical();
  }, [refreshKey]); // Re-fetches on manual refresh tick (T4.1); 6-month window is otherwise fixed

  // ── T4.3: Year-ago data fetch (one-shot, fires when benchmarkEnabled) ──
  // Fetches same period from one year ago for YoY comparison.
  // Resets to empty arrays when benchmark is disabled to avoid stale state.
  useEffect(() => {
    if (!benchmarkEnabled) {
      setYearAgoData({ appointments: [], sales: [], expenses: [], medicalRecords: [] });
      return;
    }

    const yaRange = buildYearAgoRange(period);
    const yaStartTs = Timestamp.fromDate(yaRange.startDate);
    const yaEndTs = Timestamp.fromDate(yaRange.endDate);

    const fetchYearAgo = async () => {
      try {
        const [apptSnap, salesSnap, expSnap, recSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'appointments'),
            where('scheduledDate', '>=', yaStartTs),
            where('scheduledDate', '<=', yaEndTs),
          )),
          getDocs(query(
            collection(db, 'sales'),
            where('date', '>=', yaStartTs),
            where('date', '<=', yaEndTs),
          )),
          getDocs(query(
            collection(db, 'expenses'),
            where('date', '>=', yaStartTs),
            where('date', '<=', yaEndTs),
          )),
          getDocs(query(
            collection(db, 'medical_records'),
            where('date', '>=', yaStartTs),
            where('date', '<=', yaEndTs),
          )),
        ]);

        setYearAgoData({
          appointments: apptSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          sales: salesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(s => s.status !== 'refunded' && s.status !== 'voided'),
          expenses: expSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(e => !e.deletedAt),
          medicalRecords: recSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        });
      } catch (err) {
        console.error('[useDashboardData] yearAgo fetch:', err.message);
        // Non-fatal — YoY indicators simply won't appear if the fetch fails
      }
    };

    fetchYearAgo();
  }, [period, benchmarkEnabled, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived metrics: Operations tab (today only) ──────────────
  const ops = useMemo(() => {
    if (period !== 'today') return null;

    const todayAppts = appointments;

    // Status breakdown — all 12 lifecycle statuses tracked
    const statusCounts = {
      pending: 0, confirmed: 0, arrived: 0, 'in-consult': 0,
      dispensing: 0, billing: 0, completed: 0, cancelled: 0,
      'no-show': 0, confined: 0, 'on-hold': 0, 'carried-over': 0,
    };
    todayAppts.forEach(a => {
      const s = (a.status || 'pending').toLowerCase();
      if (s in statusCounts) statusCounts[s]++;
    });
    const totalAppointments = todayAppts.length;

    // Lobby wait time: timeArrived → timeStarted (for patients who have been seen)
    const now = new Date();
    const waitTimes = todayAppts
      .filter(a => a.timeArrived && a.timeStarted)
      .map(a => {
        const arrived = a.timeArrived.toDate ? a.timeArrived.toDate() : new Date(a.timeArrived);
        const started = a.timeStarted.toDate ? a.timeStarted.toDate() : new Date(a.timeStarted);
        return Math.max(0, (started - arrived) / 60000);
      });
    const avgWaitMins = waitTimes.length > 0
      ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length)
      : 0;

    // Longest CURRENT wait: patients still in 'arrived' state
    const currentWaits = todayAppts
      .filter(a => a.status === 'arrived' && a.timeArrived)
      .map(a => {
        const arrived = a.timeArrived.toDate ? a.timeArrived.toDate() : new Date(a.timeArrived);
        return Math.round((now - arrived) / 60000);
      });
    const longestCurrentWait = currentWaits.length > 0 ? Math.max(...currentWaits) : 0;

    // Average consult duration: timeStarted → timeCompleted for completed cases
    const consultDurations = todayAppts
      .filter(a => a.status === 'completed' && a.timeStarted && a.timeCompleted)
      .map(a => {
        const started = a.timeStarted.toDate ? a.timeStarted.toDate() : new Date(a.timeStarted);
        const completed = a.timeCompleted.toDate ? a.timeCompleted.toDate() : new Date(a.timeCompleted);
        return Math.max(0, (completed - started) / 60000);
      });
    const avgConsultMins = consultDurations.length > 0
      ? Math.round(consultDurations.reduce((a, b) => a + b, 0) / consultDurations.length)
      : 0;

    // Department load: appointment count per serviceCategory
    const deptLoad = {};
    todayAppts.forEach(a => {
      const dept = a.serviceCategory || 'General';
      deptLoad[dept] = (deptLoad[dept] || 0) + 1;
    });

    // Staff workload: appointment count per assigned vet name
    const staffWorkload = {};
    todayAppts
      .filter(a => a.assignedVet && a.assignedVet !== 'Unassigned')
      .forEach(a => {
        staffWorkload[a.assignedVet] = (staffWorkload[a.assignedVet] || 0) + 1;
      });

    const noShowCount = statusCounts['no-show'];
    const cancelledCount = statusCounts.cancelled;
    const emergencyCount = todayAppts.filter(a => a.priority === 'high').length;

    return {
      totalAppointments,
      statusCounts,
      avgWaitMins,
      longestCurrentWait,
      currentWaitingCount: currentWaits.length,
      avgConsultMins,
      consultCount: consultDurations.length,
      deptLoad,
      staffWorkload,
      noShowCount,
      cancelledCount,
      emergencyCount,
    };
  }, [appointments, period]);

  // ── Derived metrics: Growth tab ──────────────────────────────
  const growth = useMemo(() => {
    // T2.282: New clients registered in the selected period + total active across all time
    const newClientCount = clients.length;
    const totalActiveClients = allClientIds.size;

    // T2.307: Client registration trend — grouped by date bucket
    const clientTrend = buildTrend(clients, 'createdAt', period);

    // T2.308: Total active pets + species distribution (period-independent)
    const totalActivePets = pets.length;
    const speciesMap = {};
    pets.forEach(p => {
      const sp = (p.species || 'Unknown').trim();
      speciesMap[sp] = (speciesMap[sp] || 0) + 1;
    });

    // T2.309: Top 10 breeds by count (period-independent)
    const breedMap = {};
    pets.forEach(p => {
      const breed = (p.breed || '').trim();
      if (breed && breed !== 'Unknown') breedMap[breed] = (breedMap[breed] || 0) + 1;
    });
    const topBreeds = Object.entries(breedMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([breed, count]) => ({ breed, count }));

    // T2.285: Appointment volume trend — grouped by date bucket
    const appointmentTrend = buildTrend(appointments, 'scheduledDate', period);

    // T2.280: Walk-in vs scheduled classification
    let walkInCount = 0;
    let scheduledCount = 0;
    appointments.forEach(a => {
      const isWalkIn =
        a.isWalkIn === true ||
        a.ownerId === 'WALK_IN_USER' ||
        String(a.ownerId || '').includes('GUEST_') ||
        a.ticketPrefix === 'W' ||
        a.ticketPrefix === 'E';
      if (isWalkIn) walkInCount++;
      else scheduledCount++;
    });

    // T2.310: Peak hours — count appointments per hour of day
    const hourCounts = new Array(24).fill(0);
    appointments.forEach(a => {
      if (a.scheduledDate) {
        const d = a.scheduledDate.toDate ? a.scheduledDate.toDate() : new Date(a.scheduledDate);
        hourCounts[d.getHours()]++;
      }
    });
    // Include all hours that have data or fall within operating range (6am–9pm)
    const peakHours = hourCounts
      .map((count, hour) => ({
        hour,
        count,
        label: `${hour % 12 || 12}${hour < 12 ? 'AM' : 'PM'}`,
      }))
      .filter(h => h.count > 0 || (h.hour >= 6 && h.hour <= 21));

    // T2.311: Service popularity — top 10 services by appointment count
    const serviceMap = {};
    appointments.forEach(a => {
      const svcName = a.serviceType || a.primaryService || 'Unknown';
      serviceMap[svcName] = (serviceMap[svcName] || 0) + 1;
    });
    const serviceRanking = Object.entries(serviceMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // T2.312: Booking lead time — scheduled minus created for pre-booked appointments
    const leadTimes = appointments
      .filter(a => a.createdAt && a.scheduledDate && !a.ticketPrefix)
      .map(a => {
        const created = a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const scheduled = a.scheduledDate.toDate ? a.scheduledDate.toDate() : new Date(a.scheduledDate);
        return Math.max(0, (scheduled - created) / (1000 * 60 * 60)); // hours
      })
      .filter(h => h > 0); // exclude same-moment bookings (walk-ins that slipped through)
    const avgLeadTimeHours = leadTimes.length > 0
      ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length)
      : 0;

    // T2.313: Client retention rate
    // "Returning" = had an appointment in this period AND is NOT a new registrant this period.
    // This avoids a separate historical query by treating pre-existing clients as "returning."
    const periodOwnerIds = new Set(
      appointments
        .map(a => a.ownerId)
        .filter(id => id && id !== 'WALK_IN_USER' && !String(id).includes('GUEST_')),
    );
    const newClientIdSet = new Set(clients.map(c => c.id));
    const returningClients = [...periodOwnerIds].filter(id =>
      id !== 'WALK_IN_USER' &&
      !String(id).includes('GUEST_') &&
      !newClientIdSet.has(id),
    );
    const retentionRate = periodOwnerIds.size > 0
      ? Math.round((returningClients.length / periodOwnerIds.size) * 100)
      : 0;

    return {
      newClientCount,
      totalActiveClients,
      clientTrend,
      totalActivePets,
      speciesDistribution: speciesMap,
      topBreeds,
      appointmentTrend,
      walkInCount,
      scheduledCount,
      peakHours,
      serviceRanking,
      avgLeadTimeHours,
      leadTimeCount: leadTimes.length,
      retentionRate,
      returningClientCount: returningClients.length,
      uniqueClientCount: periodOwnerIds.size,
      totalAppointments: appointments.length,
    };
  }, [appointments, clients, allClientIds, pets, period]);

  // ── Derived metrics: Financial tab ────────────────────────────
  const financial = useMemo(() => {
    // Segment sales by status
    const paidSales = sales.filter(s => s.status !== 'refunded' && s.status !== 'voided');
    const refundedSales = sales.filter(s => s.status === 'refunded');

    // T2.230: Revenue collected (sum of total) and billed (sum of subtotal)
    const totalCollected = paidSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
    const totalBilled = paidSales.reduce((sum, s) => sum + (parseFloat(s.subtotal) || 0), 0);

    // T2.283: Net margin = revenue - expenses
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const netMargin = totalCollected - totalExpenses;

    // T2.298: Payment method distribution (amounts per method)
    const paymentMethods = {};
    paidSales.forEach(s => {
      const method = s.paymentMethod || 'Cash';
      paymentMethods[method] = (paymentMethods[method] || 0) + (parseFloat(s.total) || 0);
    });

    // T2.299: SC/PWD discount total and usage rate
    const scPwdSales = paidSales.filter(s => s.hasScPwdDiscount);
    const totalDiscounts = paidSales.reduce((sum, s) => sum + (parseFloat(s.discount) || 0), 0);
    const scPwdUsageRate = paidSales.length > 0
      ? Math.round((scPwdSales.length / paidSales.length) * 100)
      : 0;

    // T2.300: Average transaction value
    const avgTransactionValue = paidSales.length > 0
      ? Math.round(totalCollected / paidSales.length)
      : 0;

    // T2.301 + T2.303: Revenue and expense trends for charting
    const revenueTrend = buildFinancialTrend(paidSales, 'date', period, 'total');
    const expenseTrend = buildFinancialTrend(expenses, 'date', period, 'amount');

    // T2.302: Expense category breakdown
    const expenseCategories = {};
    expenses.forEach(e => {
      const cat = e.category || 'Other';
      expenseCategories[cat] = (expenseCategories[cat] || 0) + (e.amount || 0);
    });

    // T2.304: Refund rate and total refunded
    const totalRefunded = refundedSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
    const refundRate = sales.length > 0
      ? Math.round((refundedSales.length / sales.length) * 100)
      : 0;

    // T2.305: Outstanding balances from appointments in billing or dispensing status
    const outstandingBalances = appointments
      .filter(a =>
        (a.status === 'billing' || a.status === 'dispensing') &&
        (parseFloat(a.balanceRemaining) || 0) > 0,
      )
      .reduce((sum, a) => sum + (parseFloat(a.balanceRemaining) || 0), 0);

    // T2.306: Revenue by service department — cross-reference sales with appointments
    const revByDept = {};
    paidSales.forEach(s => {
      const matchingAppt = appointments.find(a => a.id === s.appointmentId);
      const dept = matchingAppt?.serviceCategory || 'Other';
      revByDept[dept] = (revByDept[dept] || 0) + (parseFloat(s.total) || 0);
    });

    // T2.270: Monthly expense burn rate — daily average extrapolated to 30 days
    const daysInPeriod = Math.max(
      1,
      Math.ceil((dateRange.endDate - dateRange.startDate) / (1000 * 60 * 60 * 24)),
    );
    const dailyExpenseRate = totalExpenses / daysInPeriod;
    const monthlyBurnRate = Math.round(dailyExpenseRate * 30);

    return {
      totalCollected,
      totalBilled,
      netMargin,
      totalExpenses,
      paymentMethods,
      totalDiscounts,
      scPwdCount: scPwdSales.length,
      scPwdUsageRate,
      avgTransactionValue,
      transactionCount: paidSales.length,
      revenueTrend,
      expenseTrend,
      expenseCategories,
      totalRefunded,
      refundCount: refundedSales.length,
      refundRate,
      outstandingBalances,
      revByDept,
      monthlyBurnRate,
      dailyExpenseRate: Math.round(dailyExpenseRate),
    };
  }, [sales, expenses, appointments, period, dateRange]);

  // ── Derived metrics: Clinical tab ─────────────────────────────────
  const clinical = useMemo(() => {
    // T2.289: Records signed this period — simple count
    const recordsSigned = medicalRecords.length;

    // T2.290 + T4.141: Top 5 diagnoses — structured catalogId grouping, legacy string fallback
    const diagnosisMap = {};
    medicalRecords.forEach(r => {
      if (r.diagnoses?.length > 0) {
        // Structured records: count each diagnosis entry by catalogId (or name if custom)
        r.diagnoses.forEach(dx => {
          const key = dx.catalogId || dx.name || 'Unspecified';
          const displayName = dx.name || 'Unspecified';
          if (displayName === 'Clinical Visit') return;
          if (!diagnosisMap[key]) diagnosisMap[key] = { diagnosis: displayName, count: 0 };
          diagnosisMap[key].count += 1;
        });
      } else {
        // Legacy records: fall back to the diagnosis string field
        const diag = (r.diagnosis || 'Unspecified').trim();
        if (diag && diag !== 'Clinical Visit') {
          const key = diag; // no catalogId available for legacy records
          if (!diagnosisMap[key]) diagnosisMap[key] = { diagnosis: diag, count: 0 };
          diagnosisMap[key].count += 1;
        }
      }
    });
    const topDiagnoses = Object.values(diagnosisMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // T2.291: Vaccine administration by type
    // Structured data in `vaccineAdministrations` array (preferred),
    // fallback to legacy `vaccineData` object (single vaccine per record)
    const vaccineMap = {};
    medicalRecords.forEach(r => {
      if (r.vaccineAdministrations && r.vaccineAdministrations.length > 0) {
        r.vaccineAdministrations.forEach(v => {
          const name = (v.vaccineName || 'Unknown').trim();
          if (name) vaccineMap[name] = (vaccineMap[name] || 0) + 1;
        });
      } else if (r.vaccineData && r.vaccineData.vaccineName) {
        const name = r.vaccineData.vaccineName.trim();
        if (name) vaccineMap[name] = (vaccineMap[name] || 0) + 1;
      }
    });
    const vaccinesByType = Object.entries(vaccineMap)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));
    const totalVaccinations = vaccinesByType.reduce((s, v) => s + v.count, 0);

    // T2.292: Top dispensed items — flatten dispensedProducts arrays, group by name
    const rxMap = {};
    medicalRecords.forEach(r => {
      const rxList = r.dispensedProducts || r.prescriptions;
      if (rxList && rxList.length > 0) {
        rxList.forEach(rx => {
          const name = (rx.name || 'Unknown').trim();
          if (name) rxMap[name] = (rxMap[name] || 0) + (rx.qty || 1);
        });
      }
    });
    const topPrescribed = Object.entries(rxMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, qty]) => ({ name, qty }));

    // T2.293: Follow-up compliance rate
    // Numerator: appointments with `isFollowUp: true` that are in a completed or
    // attended status (arrived, in-consult, dispensing, billing, completed)
    // Denominator: medical_records with `nextVisit` set (i.e., a follow-up was requested)
    const recordsWithFollowUp = medicalRecords.filter(r => r.nextVisit).length;
    const followUpAppointments = appointments.filter(a =>
      a.isFollowUp === true &&
      ['arrived', 'in-consult', 'dispensing', 'billing', 'completed'].includes(a.status)
    ).length;
    const followUpComplianceRate = recordsWithFollowUp > 0
      ? Math.min(100, Math.round((followUpAppointments / recordsWithFollowUp) * 100))
      : 0;

    // T2.294: Species distribution of visits — group appointments by petSpecies
    const speciesVisitMap = {};
    appointments.forEach(a => {
      const sp = (a.petSpecies || 'Unknown').trim();
      speciesVisitMap[sp] = (speciesVisitMap[sp] || 0) + 1;
    });

    // T2.295: Confinement + carry-over rate
    const confinedCount = appointments.filter(a => a.status === 'confined').length;
    const carriedOverCount = appointments.filter(a => a.status === 'carried-over').length;
    const totalAppts = appointments.length;
    const confinementRate = totalAppts > 0
      ? Math.round(((confinedCount + carriedOverCount) / totalAppts) * 100)
      : 0;

    // T2.296: Records per vet — group medical_records by vetName
    const vetRecordMap = {};
    medicalRecords.forEach(r => {
      const vet = r.vetName || 'Unknown';
      vetRecordMap[vet] = (vetRecordMap[vet] || 0) + 1;
    });
    const recordsPerVet = Object.entries(vetRecordMap)
      .sort(([, a], [, b]) => b - a)
      .map(([vet, count]) => ({ vet, count }));

    // T2.297: Average vitals by species
    // Group medical_records by pet species (need to cross-reference with appointments
    // via appointmentId to get petSpecies, since medical_records don't store species directly)
    const apptSpeciesLookup = {};
    appointments.forEach(a => {
      if (a.id && a.petSpecies) apptSpeciesLookup[a.id] = a.petSpecies;
    });

    const vitalsBySpecies = {};
    medicalRecords.forEach(r => {
      if (!r.vitals) return;
      const species = apptSpeciesLookup[r.appointmentId] || 'Unknown';
      if (!vitalsBySpecies[species]) {
        vitalsBySpecies[species] = { weights: [], temps: [], hrs: [], rrs: [], count: 0 };
      }
      const v = r.vitals;
      const group = vitalsBySpecies[species];
      if (v.weight && parseFloat(v.weight) > 0) group.weights.push(parseFloat(v.weight));
      if (v.temp && parseFloat(v.temp) > 0) group.temps.push(parseFloat(v.temp));
      if (v.hr && parseFloat(v.hr) > 0) group.hrs.push(parseFloat(v.hr));
      if (v.rr && parseFloat(v.rr) > 0) group.rrs.push(parseFloat(v.rr));
      group.count++;
    });

    const avg = arr => arr.length > 0
      ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1))
      : 0;

    const avgVitalsBySpecies = Object.entries(vitalsBySpecies)
      .filter(([sp]) => sp !== 'Unknown')
      .map(([species, data]) => ({
        species,
        avgWeight: avg(data.weights),
        avgTemp: avg(data.temps),
        avgHR: avg(data.hrs),
        avgRR: avg(data.rrs),
        sampleSize: data.count,
      }))
      .sort((a, b) => b.sampleSize - a.sampleSize);

    return {
      recordsSigned,
      topDiagnoses,
      vaccinesByType,
      totalVaccinations,
      topPrescribed,
      followUpComplianceRate,
      recordsWithFollowUp,
      followUpAttended: followUpAppointments,
      speciesVisitDistribution: speciesVisitMap,
      confinedCount,
      carriedOverCount,
      confinementRate,
      recordsPerVet,
      avgVitalsBySpecies,
    };
  }, [medicalRecords, appointments]);

  // ── Derived: Historical min/max/avg per month (T2.338) ──────────
  const historical = useMemo(() => {
    if (!historicalData) return null;

    // Group appointments by year-month key
    const monthlyAppts = {};
    historicalData.appointments.forEach(a => {
      if (!a.scheduledDate) return;
      const d = a.scheduledDate.toDate ? a.scheduledDate.toDate() : new Date(a.scheduledDate);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!monthlyAppts[key]) monthlyAppts[key] = [];
      monthlyAppts[key].push(a);
    });

    // Group sales by year-month key
    const monthlySales = {};
    historicalData.sales.forEach(s => {
      if (!s.date) return;
      const d = s.date.toDate ? s.date.toDate() : new Date(s.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!monthlySales[key]) monthlySales[key] = [];
      monthlySales[key].push(s);
    });

    // Group medical records by year-month key
    const monthlyRecs = {};
    historicalData.medicalRecords.forEach(r => {
      if (!r.date) return;
      const d = r.date.toDate ? r.date.toDate() : new Date(r.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!monthlyRecs[key]) monthlyRecs[key] = [];
      monthlyRecs[key].push(r);
    });

    /**
     * Computes min/max/avg from a monthly map using a per-month value function.
     * Returns { min: 0, max: 0, avg: 0 } when no months have data.
     */
    const computeStats = (monthlyMap, valueFn) => {
      const values = Object.values(monthlyMap).map(valueFn);
      if (values.length === 0) return { min: 0, max: 0, avg: 0 };
      return {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      };
    };

    return {
      appointmentsPerMonth: computeStats(monthlyAppts, arr => arr.length),
      revenuePerMonth: computeStats(monthlySales, arr =>
        arr.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0),
      ),
      recordsPerMonth: computeStats(monthlyRecs, arr => arr.length),
      // Unique active clients per month — approximated from unique ownerIds in appointments
      newClientsPerMonth: computeStats(monthlyAppts, arr => {
        const owners = new Set(
          arr.map(a => a.ownerId)
            .filter(id => id && id !== 'WALK_IN_USER' && !String(id).includes('GUEST_')),
        );
        return owners.size;
      }),
    };
  }, [historicalData]);

  // ── Derived metrics: Period-over-period deltas (T2.320) ──────────
  const deltas = useMemo(() => {
    /**
     * Computes a percentage change: ((current - prev) / prev) * 100.
     * Returns null if the previous value is zero (avoids division by zero
     * and misleading "infinity" deltas for metrics that had no prior data).
     */
    const pctChange = (current, prev) => {
      if (prev === 0 || prev == null) return null;
      return Math.round(((current - prev) / prev) * 100);
    };

    // Current period metrics
    const currAppointments = appointments.length;
    const currRevenue = sales.filter(s => s.status !== 'refunded' && s.status !== 'voided')
      .reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
    const currExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const currRecordsSigned = medicalRecords.length;

    // Wait / consult times (today only -- deltas compare today vs yesterday)
    const computeAvgWait = (appts) => {
      const waits = appts
        .filter(a => a.timeArrived && a.timeStarted)
        .map(a => {
          const arrived = a.timeArrived.toDate ? a.timeArrived.toDate() : new Date(a.timeArrived);
          const started = a.timeStarted.toDate ? a.timeStarted.toDate() : new Date(a.timeStarted);
          return Math.max(0, (started - arrived) / 60000);
        });
      return waits.length > 0
        ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)
        : 0;
    };

    const computeAvgConsult = (appts) => {
      const durations = appts
        .filter(a => a.status === 'completed' && a.timeStarted && a.timeCompleted)
        .map(a => {
          const started = a.timeStarted.toDate ? a.timeStarted.toDate() : new Date(a.timeStarted);
          const completed = a.timeCompleted.toDate ? a.timeCompleted.toDate() : new Date(a.timeCompleted);
          return Math.max(0, (completed - started) / 60000);
        });
      return durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;
    };

    // Previous period metrics
    const prevAppointments = prevData.appointments.length;
    const prevRevenue = prevData.sales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
    const prevExpenses = prevData.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const prevRecordsSigned = prevData.medicalRecords.length;

    // Unique clients: count unique ownerIds that are NOT walk-ins
    const uniqueOwners = (appts) => new Set(
      appts
        .map(a => a.ownerId)
        .filter(id => id && id !== 'WALK_IN_USER' && !String(id).includes('GUEST_'))
    ).size;

    return {
      appointments: pctChange(currAppointments, prevAppointments),
      revenue: pctChange(currRevenue, prevRevenue),
      expenses: pctChange(currExpenses, prevExpenses),
      netMargin: pctChange(currRevenue - currExpenses, prevRevenue - prevExpenses),
      recordsSigned: pctChange(currRecordsSigned, prevRecordsSigned),
      uniqueClients: pctChange(uniqueOwners(appointments), uniqueOwners(prevData.appointments)),
      avgWait: pctChange(computeAvgWait(appointments), computeAvgWait(prevData.appointments)),
      avgConsult: pctChange(computeAvgConsult(appointments), computeAvgConsult(prevData.appointments)),
      prevPeriodLabel: period === 'today' ? 'yesterday'
        : period === 'week' ? 'prior week'
        : period === 'month' ? 'last month'
        : period === 'quarter' ? 'prior quarter'
        : period === 'year' ? 'last year'
        : period === '3month' ? 'prior 3 months'
        : period === '6month' ? 'prior 6 months'
        : period === '1year' ? 'prior year'
        : 'previous period',
    };
  }, [appointments, sales, expenses, medicalRecords, prevData, period]);

  // ── T4.3: Year-over-year deltas ──────────────────────────────────
  // Returns null when benchmark is disabled so KPICard hides the indicator.
  // Uses the same pctChange pattern as the period-over-period deltas block.
  const yearAgoDeltas = useMemo(() => {
    if (!benchmarkEnabled) return null;

    const pctChange = (current, prev) => {
      if (prev === 0 || prev == null) return null;
      return Math.round(((current - prev) / prev) * 100);
    };

    const currAppointments = appointments.length;
    const yaAppointments = yearAgoData.appointments.length;

    const currRevenue = sales
      .filter(s => s.status !== 'refunded' && s.status !== 'voided')
      .reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
    const yaRevenue = yearAgoData.sales
      .reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);

    const currExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const yaExpenses = yearAgoData.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    const currRecords = medicalRecords.length;
    const yaRecords = yearAgoData.medicalRecords.length;

    return {
      appointments: pctChange(currAppointments, yaAppointments),
      revenue: pctChange(currRevenue, yaRevenue),
      expenses: pctChange(currExpenses, yaExpenses),
      netMargin: pctChange(currRevenue - currExpenses, yaRevenue - yaExpenses),
      recordsSigned: pctChange(currRecords, yaRecords),
      label: 'vs same period last year',
    };
  }, [appointments, sales, expenses, medicalRecords, yearAgoData, benchmarkEnabled]);

  return {
    loading: appointmentsLoading,
    error,
    ops,
    growth,
    financial,
    clinical,     // Day 3: Clinical tab metrics
    deltas,       // Day 3: Period-over-period deltas
    historical,   // Day 6: 6-month min/max/avg per metric (T2.338)
    yearAgoDeltas, // T4.3: Year-over-year deltas (null when benchmarkEnabled is false)
    queueData,
    appointments,
    staffList,
    period,
    dateRange,
  };
}
