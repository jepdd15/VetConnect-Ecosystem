/**
 * useForensicReportData — One-shot forensic reporting hook.
 *
 * Fetches all appointments within a Manila-timezone-bounded date range via
 * getDocs (not real-time), maps calculatePulseMetrics over each document,
 * and reduces the batch into three aggregate blocks:
 *
 *   consult — duration distributions, averages, medians, by-vet/dept/service
 *   audit   — pulse coverage, seal coverage, correction events
 *   staff   — per-vet workload breakdown
 *
 * AMENDMENT 1: Query uses orderBy('scheduledDate', 'asc') + limit(500).
 *   Ascending order ensures truncation drops the most-recent records,
 *   giving the user a clean contiguous early window.
 *
 * AMENDMENT 2: Date strings are converted to Manila midnight boundaries.
 *   new Date(dateStr + 'T00:00:00+08:00') / new Date(dateStr + 'T23:59:59+08:00')
 *   This prevents missing early-morning appointments that fall before UTC midnight.
 *
 * generate(startDateStr, endDateStr) is called imperatively — nothing fires on mount.
 */

import { useState, useCallback } from 'react';
import {
  collection, query, where, orderBy, limit, getDocs, Timestamp,
} from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { calculatePulseMetrics } from '../../../utils/pulseUtils';
import { TERMINAL_STATUSES } from '../../../utils/statusConstants';

// ── Constants ───────────────────────────────────────────────────

const MAX_DOCS = 500;

/** Duration buckets (in minutes) for consult distribution. */
const DURATION_BUCKETS = [
  { label: '0–15m',   min: 0,   max: 15  },
  { label: '15–30m',  min: 15,  max: 30  },
  { label: '30–60m',  min: 30,  max: 60  },
  { label: '60–120m', min: 60,  max: 120 },
  { label: '120m+',   min: 120, max: Infinity },
];

// ── Pure aggregation helpers ─────────────────────────────────────

/**
 * Returns the median value of a sorted numeric array.
 * Returns 0 for empty arrays.
 */
function median(sortedArr) {
  if (!sortedArr.length) return 0;
  const mid = Math.floor(sortedArr.length / 2);
  return sortedArr.length % 2 !== 0
    ? sortedArr[mid]
    : (sortedArr[mid - 1] + sortedArr[mid]) / 2;
}

/**
 * Returns the P90 value of a sorted numeric array.
 * Returns 0 for empty arrays.
 */
function p90(sortedArr) {
  if (!sortedArr.length) return 0;
  const idx = Math.ceil(sortedArr.length * 0.9) - 1;
  return sortedArr[Math.max(0, idx)];
}

/**
 * Returns the arithmetic mean of a numeric array.
 * Returns 0 for empty arrays.
 */
function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

// ── Hook ─────────────────────────────────────────────────────────

/**
 * @returns {{
 *   generate: (startDateStr: string, endDateStr: string) => Promise<void>,
 *   loading: boolean,
 *   error: string | null,
 *   data: object | null,
 *   truncated: boolean,
 *   truncatedEndDate: string | null,
 * }}
 */
export function useForensicReportData() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [data, setData]       = useState(null);
  const [truncated, setTruncated]         = useState(false);
  const [truncatedEndDate, setTruncatedEndDate] = useState(null);

  /**
   * Imperatively fetch + aggregate report data for the given date strings.
   * Date strings must be YYYY-MM-DD. Manila timezone boundaries are applied here.
   */
  const generate = useCallback(async (startDateStr, endDateStr, clinicSettings = {}) => {
    if (!startDateStr || !endDateStr) return;

    setLoading(true);
    setError(null);
    setData(null);
    setTruncated(false);
    setTruncatedEndDate(null);

    try {
      // Amendment 2 — Manila midnight boundaries (+08:00)
      const startDate = new Date(`${startDateStr}T00:00:00+08:00`);
      const endDate   = new Date(`${endDateStr}T23:59:59+08:00`);

      // Amendment 1 — ascending order + limit(500) for deterministic truncation
      const q = query(
        collection(db, 'appointments'),
        where('scheduledDate', '>=', Timestamp.fromDate(startDate)),
        where('scheduledDate', '<=', Timestamp.fromDate(endDate)),
        orderBy('scheduledDate', 'asc'),
        limit(MAX_DOCS),
      );

      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Detect truncation — if we hit the limit, the tail is cut off
      const isTruncated = docs.length >= MAX_DOCS;
      if (isTruncated) {
        const lastDoc = docs[docs.length - 1];
        const lastTs  = lastDoc.scheduledDate?.toDate?.();
        setTruncated(true);
        setTruncatedEndDate(
          lastTs
            ? lastTs.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
            : null,
        );
      }

      // ── Per-appointment pulse metrics ───────────────────────────
      const enriched = docs.map(appt => {
        const pulse     = Array.isArray(appt.clinicalPulse) ? appt.clinicalPulse : [];
        const hasPulse  = pulse.length > 0;
        const createdAt = appt.createdAt ?? appt.scheduledDate ?? null;

        const metrics = hasPulse
          ? calculatePulseMetrics(pulse, clinicSettings, createdAt, new Date())
          : null;

        return { ...appt, pulse, hasPulse, metrics };
      });

      // ── Consult aggregation ─────────────────────────────────────
      const consultMins = enriched
        .filter(a => a.metrics?.raw?.totalConsult > 0)
        .map(a => a.metrics.raw.totalConsult)
        .sort((x, y) => x - y);

      const queueMins = enriched
        .filter(a => a.metrics?.raw?.totalQueue > 0)
        .map(a => a.metrics.raw.totalQueue)
        .sort((x, y) => x - y);

      const avgConsultMins  = Math.round(mean(consultMins));
      const medConsultMins  = Math.round(median(consultMins));
      const p90ConsultMins  = Math.round(p90(consultMins));
      const avgQueueMins    = Math.round(mean(queueMins));
      const medQueueMins    = Math.round(median(queueMins));

      // Duration distribution buckets
      const distribution = DURATION_BUCKETS.map(b => ({
        label: b.label,
        count: enriched.filter(a => {
          const v = a.metrics?.raw?.totalConsult ?? -1;
          return v >= b.min && v < b.max;
        }).length,
      }));

      // By vet — group and aggregate consult minutes
      const vetMap = {};
      enriched.forEach(a => {
        const vetName = a.assignedVet || 'Unassigned';
        const vetId   = a.assignedVetId || vetName;
        if (!vetMap[vetId]) vetMap[vetId] = { vetName, vetId, consultMins: [], queueMins: [], depts: new Set(), count: 0 };
        const entry = vetMap[vetId];
        entry.count++;
        if (a.metrics?.raw?.totalConsult > 0) entry.consultMins.push(a.metrics.raw.totalConsult);
        if (a.metrics?.raw?.totalQueue   > 0) entry.queueMins.push(a.metrics.raw.totalQueue);
        if (a.serviceCategory) entry.depts.add(a.serviceCategory);
      });

      const byVet = Object.values(vetMap).map(v => ({
        vetName:       v.vetName,
        vetId:         v.vetId,
        patients:      v.count,
        totalConsultMins: v.consultMins.reduce((s, m) => s + m, 0),
        avgConsultMins:   Math.round(mean(v.consultMins)),
        avgQueueMins:     Math.round(mean(v.queueMins)),
        departments:   [...v.depts],
      })).sort((a, b) => b.patients - a.patients);

      // By department
      const deptMap = {};
      enriched.forEach(a => {
        const dept = a.serviceCategory || 'Uncategorized';
        if (!deptMap[dept]) deptMap[dept] = { consultMins: [], queueMins: [], total: 0 };
        deptMap[dept].total++;
        if (a.metrics?.raw?.totalConsult > 0) deptMap[dept].consultMins.push(a.metrics.raw.totalConsult);
        if (a.metrics?.raw?.totalQueue   > 0) deptMap[dept].queueMins.push(a.metrics.raw.totalQueue);
      });

      const byDept = Object.entries(deptMap).map(([dept, d]) => ({
        dept,
        avgConsultMins: Math.round(mean(d.consultMins)),
        avgQueueMins:   Math.round(mean(d.queueMins)),
        count:          d.consultMins.length,
        totalCount:     d.total,
      }));

      // By service — top 10 by appointment count
      const serviceMap = {};
      enriched.forEach(a => {
        const svc = a.serviceType || 'Unknown';
        if (!serviceMap[svc]) serviceMap[svc] = { consultMins: [] };
        if (a.metrics?.raw?.totalConsult > 0) serviceMap[svc].consultMins.push(a.metrics.raw.totalConsult);
      });

      const byService = Object.entries(serviceMap)
        .map(([service, s]) => {
          const sorted = [...s.consultMins].sort((x, y) => x - y);
          return {
            service,
            count:        s.consultMins.length,
            avgConsultMins:    Math.round(mean(sorted)),
            medianConsultMins: Math.round(median(sorted)),
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // ── Audit aggregation ───────────────────────────────────────
      const withPulse    = enriched.filter(a => a.hasPulse).length;
      const withoutPulse = enriched.length - withPulse;

      const terminalDocs = enriched.filter(a => TERMINAL_STATUSES.has((a.status || '').toLowerCase()));
      const withSeal     = terminalDocs.filter(a => a.forensicSeal != null).length;
      const withoutSeal  = terminalDocs.length - withSeal;

      // All CORRECTION events across all pulse arrays
      const correctionEvents = [];
      enriched.forEach(a => {
        a.pulse.forEach(evt => {
          if (evt.type === 'CORRECTION') {
            correctionEvents.push({ ...evt, appointmentId: a.id, petName: a.petName });
          }
        });
      });

      const terminalReversals = correctionEvents.filter(e =>
        TERMINAL_STATUSES.has((e.fromStatus || '').toLowerCase()),
      );

      // Event type frequency across all pulse arrays
      const eventTypeCounts = {};
      enriched.forEach(a => {
        a.pulse.forEach(evt => {
          const t = evt.type || 'UNKNOWN';
          eventTypeCounts[t] = (eventTypeCounts[t] || 0) + 1;
        });
      });

      // Status transition matrix
      const transitionMatrix = {};
      enriched.forEach(a => {
        const statusChanges = a.pulse.filter(e => e.type === 'STATUS_CHANGE' && e.fromStatus && e.toStatus);
        statusChanges.forEach(e => {
          const key = `${e.fromStatus}→${e.toStatus}`;
          transitionMatrix[key] = (transitionMatrix[key] || 0) + 1;
        });
      });

      // ── Queue-to-completion time (timeArrived → timeCompleted) ────
      const Q2C_BUCKETS = [
        { label: '0–30m',  min: 0,   max: 30  },
        { label: '30–60m', min: 30,  max: 60  },
        { label: '1–2h',   min: 60,  max: 120 },
        { label: '2–4h',   min: 120, max: 240 },
        { label: '4h+',    min: 240, max: Infinity },
      ];

      const q2cMins = enriched
        .filter(a => a.status === 'completed' && a.timeArrived?.toDate && a.timeCompleted?.toDate)
        .map(a => {
          const arrivedMs   = a.timeArrived.toDate().getTime();
          const completedMs = a.timeCompleted.toDate().getTime();
          return Math.round((completedMs - arrivedMs) / 60000);
        })
        .filter(m => m > 0 && m < 1440)
        .sort((x, y) => x - y);

      const queueToCompletion = {
        avg:    Math.round(mean(q2cMins)),
        median: Math.round(median(q2cMins)),
        p90:    Math.round(p90(q2cMins)),
        count:  q2cMins.length,
        distribution: Q2C_BUCKETS.map(b => ({
          label: b.label,
          count: q2cMins.filter(m => m >= b.min && m < b.max).length,
        })),
      };

      // ── Staff workload aggregation ───────────────────────────────
      const byVetStaff = byVet;
      const activeVets = byVetStaff.filter(v => v.vetName !== 'Unassigned').length;
      const totalConsultHours = Math.round(
        byVetStaff.reduce((s, v) => s + v.totalConsultMins, 0) / 60 * 10,
      ) / 10;

      setData({
        totalCount: docs.length,
        consult: {
          avgConsultMins,
          medianConsultMins: medConsultMins,
          p90ConsultMins,
          avgQueueMins,
          medianQueueMins: medQueueMins,
          distribution,
          byVet,
          byDept,
          byService,
          queueToCompletion,
          transitionMatrix,
        },
        audit: {
          withPulse,
          withoutPulse,
          withSeal,
          withoutSeal,
          terminalCount: terminalDocs.length,
          correctionCount:   correctionEvents.length,
          correctionEvents,
          terminalReversals,
          eventTypeCounts,
          transitionMatrix,
        },
        staff: {
          activeVets,
          totalConsultHours,
          byVet: byVetStaff,
        },
      });
    } catch (err) {
      console.error('[useForensicReportData.generate]:', err.message);
      setError(err.message || 'Failed to load report data. Check your Firestore index on scheduledDate.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { generate, loading, error, data, truncated, truncatedEndDate };
}
