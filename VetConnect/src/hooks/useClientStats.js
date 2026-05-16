/**
 * useClientStats — client-side stats engine for ClientDashboard.
 *
 * Accepts pre-fetched Firestore data (no queries inside this hook).
 * All expensive computations are wrapped in useMemo.
 *
 * @param {Object} params
 * @param {Array}  params.allAppointments - ALL user appointments (all statuses)
 * @param {Array}  params.userPets        - User's pet documents
 * @param {Object} params.petRecords      - { [petId]: [medical_record_docs] }
 * @param {Array}  params.salesData       - Sales docs for user's completed appointments
 * @param {Array}  params.vaccineAlerts   - Existing vaccine alert objects from ClientDashboard
 * @returns {{ visitStats, petOverview, financialStats, monthlyVisitData }}
 */

import { useMemo } from 'react';
import { resolveVitals } from '../utils/resolveVitals';

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

/** Normalize any Firestore timestamp/string/Date to a JS Date, or null. */
function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts.seconds != null) return new Date(ts.seconds * 1000);
  if (ts instanceof Date) return ts;
  if (typeof ts === 'string' || typeof ts === 'number') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Format a past Date as a human-readable relative string. */
function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export function useClientStats({ allAppointments, userPets, petRecords, salesData, vaccineAlerts }) {

  // ── VISIT STATS ────────────────────────────────────────────────────────────
  const visitStats = useMemo(() => {
    const now = new Date();
    const thisYear = now.getFullYear();

    const completed = allAppointments.filter(a => a.status === 'completed');
    const noShows   = allAppointments.filter(a => a.status === 'no-show');

    const totalVisits    = completed.length;
    const visitsThisYear = completed.filter(a => {
      const d = toDate(a.timeCompleted || a.scheduledDate);
      return d && d.getFullYear() === thisYear;
    }).length;

    // Most recent completed appointment
    let lastVisitRelative = 'No visits yet';
    if (completed.length > 0) {
      const sorted = [...completed].sort((a, b) => {
        const da = toDate(a.timeCompleted || a.scheduledDate);
        const db = toDate(b.timeCompleted || b.scheduledDate);
        return (db?.getTime() ?? 0) - (da?.getTime() ?? 0);
      });
      const lastDate = toDate(sorted[0].timeCompleted || sorted[0].scheduledDate);
      lastVisitRelative = lastDate ? formatTimeAgo(lastDate) : 'Unknown';
    }

    // Earliest future pending/confirmed appointment
    let nextUpcomingCountdown = null;
    let nextUpcomingPetName   = null;
    const future = allAppointments
      .filter(a => {
        if (!['pending', 'confirmed'].includes(a.status)) return false;
        const d = toDate(a.scheduledDate);
        return d && d > now;
      })
      .sort((a, b) => {
        const da = toDate(a.scheduledDate);
        const db = toDate(b.scheduledDate);
        return (da?.getTime() ?? 0) - (db?.getTime() ?? 0);
      });
    if (future.length > 0) {
      const nextDate = toDate(future[0].scheduledDate);
      if (nextDate) {
        const daysUntil = Math.ceil((nextDate - now) / 86400000);
        nextUpcomingCountdown = daysUntil === 0 ? 'Today'
          : daysUntil === 1 ? 'Tomorrow'
          : `in ${daysUntil} days`;
      }
      nextUpcomingPetName = future[0].petName || null;
    }

    // Average visit frequency — months since first visit / total visits
    let avgFrequency = null;
    if (completed.length >= 2) {
      const dates = completed
        .map(a => toDate(a.timeCompleted || a.scheduledDate))
        .filter(Boolean)
        .sort((a, b) => a.getTime() - b.getTime());
      if (dates.length >= 2) {
        const firstVisit      = dates[0];
        const monthsSinceFirst = Math.max(
          1,
          (now.getFullYear() - firstVisit.getFullYear()) * 12 +
          (now.getMonth() - firstVisit.getMonth()),
        );
        const weeksPerVisit = Math.round((monthsSinceFirst * 4.33) / completed.length);
        avgFrequency = weeksPerVisit <= 4
          ? `every ${weeksPerVisit} week${weeksPerVisit !== 1 ? 's' : ''}`
          : `every ${Math.round(weeksPerVisit / 4.33)} month${Math.round(weeksPerVisit / 4.33) !== 1 ? 's' : ''}`;
      }
    }

    return {
      totalVisits,
      visitsThisYear,
      lastVisitRelative,
      nextUpcomingCountdown,
      nextUpcomingPetName,
      noShowCount: noShows.length,
      avgFrequency,
    };
  }, [allAppointments]);

  // ── PET OVERVIEW ───────────────────────────────────────────────────────────
  const petOverview = useMemo(() => {
    const now = new Date();

    // Species breakdown — normalize canine/feline to dog/cat
    const speciesCount = {};
    userPets.forEach(p => {
      const raw = (p.species || 'Unknown').toLowerCase();
      const label = raw === 'canine' ? 'dog' : raw === 'feline' ? 'cat' : raw;
      speciesCount[label] = (speciesCount[label] || 0) + 1;
    });
    const petBreakdown = Object.entries(speciesCount)
      .map(([species, count]) => `${count} ${species}${count > 1 ? 's' : ''}`)
      .join(', ');

    // Vaccination compliance based on existing vaccineAlerts
    let vaccinationCompliance = null;
    if (userPets.length > 0) {
      const petsCompliant = userPets.length - vaccineAlerts.filter(a => a.overdue.length > 0).length;
      vaccinationCompliance = {
        compliant: petsCompliant,
        total: userPets.length,
        pct: Math.round((petsCompliant / userPets.length) * 100),
      };
    }

    // Most urgent overdue vaccine alert
    let urgentAlert = null;
    const withOverdue = vaccineAlerts.filter(a => a.overdue.length > 0);
    if (withOverdue.length > 0) {
      urgentAlert = `${withOverdue[0].petName}: ${withOverdue[0].overdue[0]} overdue`;
    }

    // Weight trends — latest and previous weight per pet via resolveVitals
    const weightTrends = [];
    userPets.forEach(pet => {
      const records = petRecords[pet.id] || [];
      if (records.length === 0) return;

      const sorted = [...records]
        .map(r => ({ ...r, _date: toDate(r.createdAt || r.dateOfVisit) }))
        .filter(r => r._date)
        .sort((a, b) => b._date.getTime() - a._date.getTime());

      let latestWeight   = null;
      let previousWeight = null;

      for (const rec of sorted) {
        const vitals = resolveVitals(rec);
        const w = parseFloat(vitals.weight);
        if (!isNaN(w)) {
          if (latestWeight === null) {
            latestWeight = w;
          } else if (previousWeight === null) {
            previousWeight = w;
            break;
          }
        }
      }

      if (latestWeight !== null) {
        const delta = previousWeight !== null ? latestWeight - previousWeight : null;
        weightTrends.push({ petName: pet.name, weight: latestWeight, delta });
      }
    });

    return {
      petCount: userPets.length,
      petBreakdown,
      vaccinationCompliance,
      urgentAlert,
      weightTrends,
    };
  }, [userPets, petRecords, vaccineAlerts]);

  // ── FINANCIAL STATS ────────────────────────────────────────────────────────
  const financialStats = useMemo(() => {
    if (salesData.length === 0) return { totalSpent: 0, avgPerVisit: 0 };

    const totalSpent  = salesData.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
    const avgPerVisit = Math.round(totalSpent / salesData.length);

    return { totalSpent, avgPerVisit };
  }, [salesData]);

  // ── MONTHLY VISIT DATA (last 6 months, for bar chart) ─────────────────────
  const monthlyVisitData = useMemo(() => {
    const now = new Date();

    // Build 6-month bucket array oldest → newest
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        count: 0,
      };
    });

    allAppointments
      .filter(a => a.status === 'completed')
      .forEach(a => {
        const d = toDate(a.timeCompleted || a.scheduledDate);
        if (!d) return;
        const key    = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const bucket = months.find(m => m.key === key);
        if (bucket) bucket.count++;
      });

    const maxCount = Math.max(...months.map(m => m.count), 1);
    return months.map(m => ({ ...m, pct: Math.round((m.count / maxCount) * 100) }));
  }, [allAppointments]);

  return { visitStats, petOverview, financialStats, monthlyVisitData };
}
