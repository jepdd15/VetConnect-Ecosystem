/**
 * useDashboardData — Central data hook for the Dashboard feature.
 *
 * Opens real-time Firestore listeners scoped to a given time period and
 * returns computed metrics for all four Dashboard tabs. Days 2–6 will
 * add `growth`, `clinical`, and `financial` computed blocks inside this
 * same hook without changing the existing return shape.
 *
 * @param {'today'|'week'|'month'|'quarter'|'year'} period
 * @returns {{ loading, error, ops, growth, financial, queueData, appointments, staffList, period, dateRange }}
 */

import { useState, useEffect, useMemo } from 'react';
import {
  collection, doc, onSnapshot, query, where,
  Timestamp,
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

    default:
      return { startDate: startOfDay(now), endDate: endOfDay(now) };
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
 * For 'month': group by day-of-month. For 'quarter': group by ISO week.
 * For 'year': group by month name.
 *
 * @param {Object[]} docs       - Array of Firestore document objects
 * @param {string}   dateField  - Field name holding a Firestore Timestamp or Date
 * @param {string}   period     - One of 'today' | 'week' | 'month' | 'quarter' | 'year'
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
    } else if (period === 'quarter') {
      const weekOfYear = Math.ceil(
        ((date - new Date(date.getFullYear(), 0, 1)) / 86400000 + 1) / 7,
      );
      key = `W${weekOfYear}`;
    } else {
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
 * @param {string}   period     - One of 'today' | 'week' | 'month' | 'quarter' | 'year'
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
    } else if (period === 'quarter') {
      const weekOfYear = Math.ceil(
        ((date - new Date(date.getFullYear(), 0, 1)) / 86400000 + 1) / 7,
      );
      key = `W${weekOfYear}`;
    } else {
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

export function useDashboardData(period = 'today') {
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

  // True until the first appointments snapshot resolves.
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Derive stable date range from period so the query only rebuilds when
  // the period string actually changes (not on every render).
  const dateRange = useMemo(() => buildDateRange(period), [period]);

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

  return {
    loading: appointmentsLoading,
    error,
    ops,
    growth,
    financial,
    queueData,
    appointments,
    staffList,
    period,
    dateRange,
  };
}
