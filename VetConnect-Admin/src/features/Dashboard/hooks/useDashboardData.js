/**
 * useDashboardData — Central data hook for the Dashboard feature.
 *
 * Opens real-time Firestore listeners scoped to a given time period and
 * returns computed metrics for all four Dashboard tabs. Days 2–6 will
 * add `growth`, `clinical`, and `financial` computed blocks inside this
 * same hook without changing the existing return shape.
 *
 * @param {'today'|'week'|'month'|'quarter'|'year'} period
 * @returns {{ loading, error, ops, queueData, appointments, staffList, period, dateRange }}
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

// ── Hook ────────────────────────────────────────────────────────

export function useDashboardData(period = 'today') {
  const [appointments, setAppointments] = useState([]);
  const [queueData, setQueueData] = useState(null);
  const [staffList, setStaffList] = useState([]);

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

  return {
    loading: appointmentsLoading,
    error,
    ops,
    queueData,
    appointments,
    staffList,
    period,
    dateRange,
  };
}
