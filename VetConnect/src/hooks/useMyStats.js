/**
 * useMyStats — data engine for MyStatsScreen.
 *
 * Delegates aggregate stats (visit counts, financial totals, monthly chart data)
 * to the existing useClientStats hook. Adds per-pet enrichment: weight sparklines,
 * vaccine status (once catalog loads), active medications, allergies, recheck
 * countdowns, and diagnosis history — all derived from petRecords already fetched
 * by ClientDashboard.
 *
 * Zero new Firestore queries beyond one-shot fetchVaccineCatalog().
 *
 * @param {Object} params
 * @param {Array}  params.allAppointments - All user appointments (all statuses)
 * @param {Array}  params.userPets        - User's pet documents
 * @param {Object} params.petRecords      - { [petId]: [medical_record_docs] }
 * @param {Array}  params.salesData       - Sales docs for user's completed appointments
 * @param {Array}  params.vaccineAlerts   - Vaccine alert objects from ClientDashboard
 * @param {Object} params.userProfile     - User document (for relationship metrics)
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useClientStats } from './useClientStats';
import { resolveVitals } from '../utils/resolveVitals';
import { fetchVaccineCatalog, buildVaccinationStatus } from '../utils/vaccineHelpers';

// ─── INTERNAL HELPERS ──────────────────────────────────────────────────────────

/** Normalize any Firestore timestamp / string / Date to a JS Date, or null. */
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

/**
 * Sort a pet's medical records newest-first and attach a resolved _date field.
 * Records without a resolvable date are excluded.
 */
function sortedRecordsForPet(petRecords, petId) {
  return (petRecords[petId] || [])
    .map(r => ({ ...r, _date: toDate(r.createdAt || r.dateOfVisit || r.date) }))
    .filter(r => r._date)
    .sort((a, b) => b._date.getTime() - a._date.getTime());
}

/**
 * Two visits on the same calendar day produce identical date labels which
 * the chart can't visually distinguish. Walk the array left-to-right and
 * suffix collisions with "#2", "#3", … so the chart shows distinct ticks.
 */
function dedupeLabels(items) {
  const seen = {};
  return items.map(item => {
    const base = item.label;
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] > 1 ? { ...item, label: `${base} #${seen[base]}` } : item;
  });
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export function useMyStats({
  allAppointments,
  userPets,
  petRecords,
  salesData,
  vaccineAlerts,
  userProfile,
  spendingRange = '6m',
  activeTab = 'overview',
}) {
  // Delegate aggregate stats to existing hook — no duplication of that logic.
  const aggregateStats = useClientStats({
    allAppointments,
    userPets,
    petRecords,
    salesData,
    vaccineAlerts,
  });

  // Vaccine catalog fetched once on mount; defaults to built-in catalog on error.
  const [vaccineCatalog, setVaccineCatalog] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchVaccineCatalog()
      .then(catalog => { if (!cancelled) setVaccineCatalog(catalog); })
      .catch(() => { /* fetchVaccineCatalog handles errors internally */ });
    return () => { cancelled = true; };
  }, []);

  // ── RELATIONSHIP METRICS ────────────────────────────────────────────────────

  const relationship = useMemo(() => {
    const now = new Date();

    // Client since — formatted from the user's createdAt timestamp.
    const createdAt = toDate(userProfile?.createdAt);
    const clientSince = createdAt
      ? createdAt.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
      : 'Unknown';

    // Follow-up compliance — records with a recheckIn are "due"; a subsequent
    // completed appointment for that pet after the record date is "attended".
    const completed = allAppointments.filter(a => a.status === 'completed');
    let rechecksDue = 0;
    let rechecksAttended = 0;

    Object.entries(petRecords).forEach(([petId, records]) => {
      records.forEach(r => {
        if (r.dischargeSummary?.recheckIn) {
          rechecksDue++;
          const recordDate = toDate(r.createdAt || r.dateOfVisit || r.date);
          if (recordDate) {
            const hasFollowUp = completed.some(a =>
              a.petId === petId &&
              (toDate(a.timeCompleted || a.scheduledDate)?.getTime() ?? 0) > recordDate.getTime()
            );
            if (hasFollowUp) rechecksAttended++;
          }
        }
      });
    });

    const followUpCompliance = rechecksDue > 0
      ? {
          attended: rechecksAttended,
          due: rechecksDue,
          pct: Math.round((rechecksAttended / rechecksDue) * 100),
        }
      : null;

    // Profile completeness — fields required for a complete owner profile.
    const profileFields = [
      { key: 'name',              label: 'Full Name' },
      { key: 'email',             label: 'Email' },
      { key: 'phone',             label: 'Phone' },
      { key: 'address',           label: 'Address' },
      { key: 'city',              label: 'City' },
      {
        key: 'emergencyContacts',
        label: 'Emergency Contact',
        check: (v, profile) => (Array.isArray(v) && v.length > 0 && !!v[0]?.name) || !!profile?.emergencyName,
      },
      { key: 'govIdType',         label: 'Government ID' },
    ];

    const filledCount = profileFields.filter(f =>
      f.check ? f.check(userProfile?.[f.key], userProfile) : !!userProfile?.[f.key]
    ).length;

    const profilePct = Math.round((filledCount / profileFields.length) * 100);

    const missingField = profileFields.find(f =>
      f.check ? !f.check(userProfile?.[f.key]) : !userProfile?.[f.key]
    );

    const profileNudge = profilePct < 100 && missingField
      ? `${profilePct}% complete — add ${missingField.label}`
      : null;

    // Consent status — presence of version field means signed.
    const dpaStatus = userProfile?.consentVersion ? 'signed' : 'needed';
    const waiverStatus = userProfile?.waiverVersion ? 'signed' : 'needed';

    return {
      clientSince,
      followUpCompliance,
      profilePct,
      profileNudge,
      dpaStatus,
      waiverStatus,
    };
  }, [userProfile, allAppointments, petRecords]);

  // ── PER-PET HEALTH CARDS ───────────────────────────────────────────────────

  const petCards = useMemo(() => {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);

    return userPets.map(pet => {
      const sorted = sortedRecordsForPet(petRecords, pet.id);

      // --- Weight sparkline (last 5 readings, oldest → newest for SparkLine) ---
      const weightPoints = [];
      // allWeightPoints collects ALL readings for the zoom modal (no 5-limit).
      const allWeightPoints = [];
      for (const rec of sorted) {
        const vitals = resolveVitals(rec);
        const w = parseFloat(vitals.weight);
        if (!isNaN(w)) {
          const point = {
            label: rec._date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
            value: w,
          };
          allWeightPoints.push(point);
          if (weightPoints.length < 5) {
            weightPoints.push(point);
          }
        }
      }
      // Reverse so SparkLine / VitalsZoomModal receive data oldest → newest (left → right).
      weightPoints.reverse();
      allWeightPoints.reverse();

      const latestWeight = weightPoints.length > 0 ? weightPoints[weightPoints.length - 1].value : null;
      const prevWeight   = weightPoints.length > 1 ? weightPoints[weightPoints.length - 2].value : null;
      const weightDelta  = latestWeight !== null && prevWeight !== null
        ? latestWeight - prevWeight
        : null;

      // --- Last completed visit for this pet ---
      const petCompleted = allAppointments
        .filter(a => a.petId === pet.id && a.status === 'completed')
        .sort((a, b) =>
          (toDate(b.timeCompleted || b.scheduledDate)?.getTime() ?? 0) -
          (toDate(a.timeCompleted || a.scheduledDate)?.getTime() ?? 0)
        );
      const lastAppt = petCompleted[0] ?? null;
      const lastVisitDate = lastAppt
        ? toDate(lastAppt.timeCompleted || lastAppt.scheduledDate)
        : null;
      const lastVisitService = lastAppt?.serviceNames?.[0] || lastAppt?.service || null;

      // --- Vaccine status (populated once catalog loads) ---
      const vaccineStatus = vaccineCatalog.length > 0
        ? buildVaccinationStatus(sorted, vaccineCatalog, pet.species || '')
        : null;

      // --- Active medications — dispensed in last 90 days where productClass = medicine ---
      const activeMeds = [];
      for (const rec of sorted) {
        if (rec._date < ninetyDaysAgo) break;
        const products = rec.dispensedProducts || rec.prescriptions || [];
        products.forEach(rx => {
          const productClass = rx.productClass
            || (rx.isDrug || rx.isMedicine ? 'medicine' : 'retail');
          if (productClass !== 'medicine') return;

          let daysRemaining = null;
          let adherence = null;
          if (rx.sig?.days) {
            const totalDays = rx.sig.days;
            const endDate = new Date(rec._date.getTime() + totalDays * 86400000);
            const remaining = Math.ceil((endDate.getTime() - now.getTime()) / 86400000);
            daysRemaining = remaining > 0 ? remaining : 0;

            // Adherence — only computed when sig.days was explicitly set (not 90-day fallback).
            const daysCompleted = Math.min(
              totalDays,
              Math.floor((now.getTime() - rec._date.getTime()) / 86400000),
            );
            adherence = {
              totalDays,
              daysCompleted,
              pct: Math.round((daysCompleted / totalDays) * 100),
            };
          }

          activeMeds.push({
            name: rx.itemName || rx.name || 'Unknown',
            daysRemaining,
            adherence,
            recordDate: rec._date,
          });
        });
      }

      // Deduplicate by name, keeping the entry with the most recent recordDate.
      const seenMedNames = new Set();
      const uniqueMeds = activeMeds.filter(m => {
        if (seenMedNames.has(m.name)) return false;
        seenMedNames.add(m.name);
        return true;
      });

      // --- Allergies ---
      const rawAllergies = pet.petAllergies || pet.allergies || '';
      const allergies = typeof rawAllergies === 'string'
        ? rawAllergies.split(',').map(a => a.trim()).filter(a => a && a.toLowerCase() !== 'none')
        : Array.isArray(rawAllergies) ? rawAllergies : [];

      // --- Next recheck countdown from the most recent discharge summary ---
      let recheckInfo = null;
      if (sorted.length > 0 && sorted[0].dischargeSummary?.recheckIn) {
        const recheckStr = sorted[0].dischargeSummary.recheckIn;
        const recordDate = sorted[0]._date;
        const match = recheckStr.match(/(\d+)\s*(day|week|month)/i);
        if (match) {
          const amount = parseInt(match[1], 10);
          const unit = match[2].toLowerCase();
          const multiplier = unit === 'day' ? 1 : unit === 'week' ? 7 : 30;
          const dueDate = new Date(recordDate.getTime() + amount * multiplier * 86400000);
          const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
          recheckInfo = { recheckStr, dueDate, daysUntil };
        } else {
          // Non-standard string — show it without a countdown.
          recheckInfo = { recheckStr, dueDate: null, daysUntil: null };
        }
      }

      // --- Diagnosis history from medical_records.diagnoses[] (T4.13 not built) ---
      const allDiagnoses = [];
      sorted.forEach(rec => {
        const dxList = rec.diagnoses?.length > 0
          ? rec.diagnoses.map(d => ({ name: d.name || d, date: rec._date }))
          : rec.diagnosis
            ? [{ name: rec.diagnosis, date: rec._date }]
            : [];
        allDiagnoses.push(...dxList.filter(d => d.name));
      });
      const latestDiagnosis = allDiagnoses[0] ?? null;
      const diagnosisCount  = allDiagnoses.length;

      // --- Lab result sparklines — tests with 2+ numeric readings, last 5 per test ---
      const labTestMap = {};
      // sorted is newest-first; iterate all records to collect every lab result.
      for (const rec of sorted) {
        const results = rec.labResults || [];
        results.forEach(lr => {
          const testName = lr.testName || lr.name;
          if (!testName) return;
          const numeric = parseFloat(lr.value ?? lr.result);
          if (isNaN(numeric)) return;
          if (!labTestMap[testName]) {
            labTestMap[testName] = { points: [], unit: lr.unit || '' };
          }
          labTestMap[testName].points.push({
            label: rec._date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
            value: numeric,
            // Store raw date so we can cap at 5 newest and then reverse.
            _date: rec._date,
          });
        });
      }

      // Cap at last 5 readings per test, reverse to oldest → newest, filter 2+.
      const labSparklines = Object.entries(labTestMap)
        .map(([testName, { points, unit }]) => {
          // points are already newest-first (sorted is newest-first)
          const last5 = points.slice(0, 5).reverse();
          return {
            testName,
            unit,
            data: last5.map(p => ({ label: p.label, value: p.value })),
            latestValue: last5[last5.length - 1]?.value ?? null,
          };
        })
        .filter(t => t.data.length >= 2)
        // Sort descending by number of data points (most data first).
        .sort((a, b) => b.data.length - a.data.length);

      // --- Age computed from pet.dob ---
      let age = null;
      const dob = pet.dob?.toDate ? pet.dob.toDate()
        : pet.dob?.seconds       ? new Date(pet.dob.seconds * 1000)
        : typeof pet.dob === 'string' ? new Date(pet.dob)
        : null;
      if (dob && !isNaN(dob.getTime())) {
        const ageYears  = Math.floor((now - dob) / (365.25 * 86400000));
        const ageMonths = Math.floor(((now - dob) / (30.44 * 86400000)) % 12);
        age = ageYears > 0
          ? `${ageYears} yr${ageYears !== 1 ? 's' : ''}${ageMonths > 0 ? ` ${ageMonths} mo` : ''}`
          : `${ageMonths} mo`;
      }

      // --- Species emoji ---
      const spLower = (pet.species || '').toLowerCase();
      const speciesEmoji = spLower.includes('cat') || spLower.includes('feline') ? '🐱'
        : spLower.includes('dog') || spLower.includes('canine')                  ? '🐶'
        : '🐾';

      return {
        id: pet.id,
        name: pet.name,
        species: pet.species,
        speciesEmoji,
        age,
        latestWeight,
        weightDelta,
        weightPoints,
        allWeightPoints,
        labSparklines,
        lastVisitDate,
        lastVisitService,
        vaccineStatus,
        activeMeds: uniqueMeds,
        allergies,
        recheckInfo,
        latestDiagnosis,
        diagnosisCount,
      };
    });
  }, [userPets, petRecords, allAppointments, vaccineCatalog]);

  // ── YEAR-OVER-YEAR VISIT DATA ─────────────────────────────────────────────

  /**
   * Side-by-side monthly visit counts for the current year vs the previous year.
   * hasLastYear is only true when at least one completed appointment exists in the
   * previous calendar year — controls whether the YoY section renders at all.
   *
   * Gated on activeTab === 'visits'.
   */
  const yoyVisitData = useMemo(() => {
    if (activeTab !== 'visits') {
      return {
        months: [], thisYearLabel: '', lastYearLabel: '', hasLastYear: false,
      };
    }

    const now = new Date();
    const thisYear = now.getFullYear();
    const lastYear = thisYear - 1;
    const completed = allAppointments.filter(a => a.status === 'completed');

    const months = Array.from({ length: 12 }, (_, i) => {
      const monthLabel = new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'short' });
      let thisYearCount = 0;
      let lastYearCount = 0;

      completed.forEach(a => {
        const d = toDate(a.timeCompleted || a.scheduledDate);
        if (!d) return;
        if (d.getFullYear() === thisYear && d.getMonth() === i) thisYearCount++;
        if (d.getFullYear() === lastYear && d.getMonth() === i) lastYearCount++;
      });

      return { month: i, label: monthLabel, thisYear: thisYearCount, lastYear: lastYearCount };
    });

    const maxCount = Math.max(...months.map(m => Math.max(m.thisYear, m.lastYear)), 1);

    return {
      months: months.map(m => ({
        ...m,
        thisYearPct: Math.round((m.thisYear / maxCount) * 100),
        lastYearPct: Math.round((m.lastYear / maxCount) * 100),
      })),
      thisYearLabel: String(thisYear),
      lastYearLabel: String(lastYear),
      hasLastYear: completed.some(a => {
        const d = toDate(a.timeCompleted || a.scheduledDate);
        return d && d.getFullYear() === lastYear;
      }),
    };
  }, [allAppointments, activeTab]);

  // ── SPENDING BREAKDOWN ────────────────────────────────────────────────────

  /**
   * Monthly spending trend, per-pet breakdown, per-service breakdown,
   * per-pet transaction drill-down, and outstanding balance — all derived
   * from the salesData array (no new queries).
   *
   * spendingRange controls the date window:
   *   '6m'  — last 6 calendar months (default)
   *   'ytd' — Jan 1 of current year to now
   *   'ly'  — Jan 1 to Dec 31 of previous year
   *   'all' — no date filter
   *
   * Gated on activeTab === 'spending'.
   */
  const spendingBreakdown = useMemo(() => {
    if (activeTab !== 'spending') {
      return {
        spendingBarData: [], perPetList: [], perServiceList: [],
        outstandingBalance: 0, perPetTransactions: {},
      };
    }

    const now = new Date();
    const currentYear = now.getFullYear();

    // ── Compute date bounds from range ──────────────────────────────────────
    let rangeStart = null;
    let rangeEnd = null;

    if (spendingRange === '6m') {
      rangeStart = new Date(currentYear, now.getMonth() - 5, 1);
    } else if (spendingRange === 'ytd') {
      rangeStart = new Date(currentYear, 0, 1);
    } else if (spendingRange === 'ly') {
      rangeStart = new Date(currentYear - 1, 0, 1);
      rangeEnd   = new Date(currentYear - 1, 11, 31, 23, 59, 59);
    }
    // 'all' — rangeStart and rangeEnd remain null (no filter)

    // ── Filter sales to the selected range ──────────────────────────────────
    const filteredSales = salesData.filter(sale => {
      if (!rangeStart && !rangeEnd) return true; // 'all'
      const saleDate = toDate(sale.createdAt || sale.date);
      if (!saleDate) return false;
      if (rangeStart && saleDate < rangeStart) return false;
      if (rangeEnd   && saleDate > rangeEnd)   return false;
      return true;
    });

    // ── Build monthly buckets dynamically based on range ────────────────────
    let months;

    if (spendingRange === '6m') {
      months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(currentYear, now.getMonth() - (5 - i), 1);
        return {
          key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          label: d.toLocaleDateString('en-US', { month: 'short' }),
          total: 0,
        };
      });
    } else if (spendingRange === 'ytd') {
      months = Array.from({ length: now.getMonth() + 1 }, (_, i) => {
        const d = new Date(currentYear, i, 1);
        return {
          key: `${currentYear}-${String(i + 1).padStart(2, '0')}`,
          label: d.toLocaleDateString('en-US', { month: 'short' }),
          total: 0,
        };
      });
    } else if (spendingRange === 'ly') {
      months = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(currentYear - 1, i, 1);
        return {
          key: `${currentYear - 1}-${String(i + 1).padStart(2, '0')}`,
          label: d.toLocaleDateString('en-US', { month: 'short' }),
          total: 0,
        };
      });
    } else {
      // 'all' — group by year-month across all time
      const allKeys = new Set();
      filteredSales.forEach(sale => {
        const saleDate = toDate(sale.createdAt || sale.date);
        if (saleDate) {
          allKeys.add(`${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`);
        }
      });
      months = Array.from(allKeys)
        .sort()
        .map(key => {
          const [yr, mo] = key.split('-');
          const d = new Date(Number(yr), Number(mo) - 1, 1);
          return { key, label: d.toLocaleDateString('en-US', { month: 'short' }), total: 0 };
        });
      // Cap at 12 most recent buckets for readability.
      if (months.length > 12) months = months.slice(months.length - 12);
    }

    filteredSales.forEach(sale => {
      const saleDate = toDate(sale.createdAt || sale.date);
      if (!saleDate) return;
      const key = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
      const bucket = months.find(m => m.key === key);
      if (bucket) bucket.total += parseFloat(sale.total) || 0;
    });

    // ── Pre-build appointment lookup map (O(n) instead of O(n*m) per loop) ──
    const apptMap = new Map(allAppointments.map(a => [a.id, a]));

    // ── Per pet ─────────────────────────────────────────────────────────────
    const perPet = {};
    filteredSales.forEach(sale => {
      const appt = apptMap.get(sale.appointmentId);
      if (!appt) return;
      const petName = appt.petName || 'Unknown';
      perPet[petName] = (perPet[petName] || 0) + (parseFloat(sale.total) || 0);
    });
    const perPetList = Object.entries(perPet)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    // ── Per service type ─────────────────────────────────────────────────────
    const perService = {};
    filteredSales.forEach(sale => {
      const appt = apptMap.get(sale.appointmentId);
      const serviceType = appt?.serviceCategory || appt?.department || sale.serviceType || 'Other';
      perService[serviceType] = (perService[serviceType] || 0) + (parseFloat(sale.total) || 0);
    });
    const perServiceList = Object.entries(perService)
      .map(([type, amount]) => ({ type, amount }))
      .sort((a, b) => b.amount - a.amount);

    // ── Outstanding balance (always from full salesData — not range-filtered) ──
    const outstandingBalance = salesData.reduce((sum, s) => {
      if (s.status === 'refunded' || s.status === 'voided') return sum;
      const bal = parseFloat(s.balanceRemaining) || 0;
      return sum + (bal > 0 ? bal : 0);
    }, 0);

    // ── Bar chart data ───────────────────────────────────────────────────────
    const maxSpending = Math.max(...months.map(m => m.total), 1);
    const spendingBarData = months.map(m => ({
      key: m.key,
      label: m.label,
      amount: m.total,
      pct: (m.total / maxSpending) * 100,
    }));

    // ── Per-pet transaction drill-down ───────────────────────────────────────
    // Keyed by pet name: { [petName]: [{ date, service, amount }] }, newest-first.
    const perPetTransactions = {};
    filteredSales.forEach(sale => {
      const appt = apptMap.get(sale.appointmentId);
      if (!appt) return;
      const petName = appt.petName || 'Unknown';
      if (!perPetTransactions[petName]) perPetTransactions[petName] = [];
      const saleDate = toDate(sale.createdAt || sale.date);
      perPetTransactions[petName].push({
        date: saleDate,
        service: appt.serviceNames?.[0] || appt.service || 'Visit',
        amount: parseFloat(sale.total) || 0,
      });
    });
    Object.values(perPetTransactions).forEach(arr =>
      arr.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    );

    return { spendingBarData, perPetList, perServiceList, outstandingBalance, perPetTransactions };
  }, [salesData, allAppointments, spendingRange, activeTab]);

  // ── VISIT TYPE PIE DATA ───────────────────────────────────────────────────

  /**
   * Breakdown of completed visits by department/serviceCategory for the
   * donut chart. Entries are sorted descending by count.
   *
   * Gated on activeTab === 'visits'.
   */
  const visitTypePieData = useMemo(() => {
    if (activeTab !== 'visits') return [];

    const completed = allAppointments.filter(a => a.status === 'completed');
    const categoryMap = {};
    completed.forEach(a => {
      const cat = a.serviceCategory || a.department || 'Other';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });
    const total = completed.length;
    return Object.entries(categoryMap)
      .map(([name, count]) => ({
        name,
        count,
        pct: total > 0 ? count / total : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [allAppointments, activeTab]);

  // ── UPCOMING APPOINTMENTS ─────────────────────────────────────────────────

  /**
   * Pending/confirmed appointments that are still in the future, sorted
   * soonest-first. Each entry includes a human-readable countdown string.
   */
  const upcomingAppointments = useMemo(() => {
    const now = new Date();
    return allAppointments
      .filter(a => {
        if (!['pending', 'confirmed'].includes(a.status)) return false;
        const d = toDate(a.scheduledDate);
        return d && d > now;
      })
      .map(a => {
        const d = toDate(a.scheduledDate);
        const daysUntil = Math.ceil((d - now) / 86400000);
        const countdown = daysUntil === 0 ? 'Today'
          : daysUntil === 1 ? 'Tomorrow'
          : `in ${daysUntil} days`;
        return {
          id: a.id,
          petName: a.petName || 'Unknown',
          serviceNames: a.serviceNames || [a.service || 'Visit'],
          scheduledDate: d,
          countdown,
          status: a.status,
        };
      })
      .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
  }, [allAppointments]);

  // ── WEEKLY VISIT DATA ─────────────────────────────────────────────────────

  /**
   * 12-week bar chart data (Monday-start ISO-week buckets).
   * Gated on activeTab === 'visits'.
   */
  const weeklyVisitData = useMemo(() => {
    if (activeTab !== 'visits') return [];
    const now = new Date();
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const weekStart = new Date(now);
      const dow = weekStart.getDay() || 7;
      weekStart.setDate(weekStart.getDate() - dow + 1 - (11 - i) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return {
        key: `w${i}`,
        label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        start: weekStart, end: weekEnd, count: 0,
      };
    });

    allAppointments.filter(a => a.status === 'completed').forEach(a => {
      const d = toDate(a.timeCompleted || a.scheduledDate);
      if (!d) return;
      const bucket = weeks.find(w => d >= w.start && d <= w.end);
      if (bucket) bucket.count++;
    });

    const maxCount = Math.max(...weeks.map(w => w.count), 1);
    return weeks.map(w => ({ ...w, pct: Math.round((w.count / maxCount) * 100) }));
  }, [allAppointments, activeTab]);

  // ── VISIT BREAKDOWN BY PET / SERVICE / DEPARTMENT ─────────────────────────

  /** Pie data for completed visits grouped by pet name. */
  const visitsByPet = useMemo(() => {
    if (activeTab !== 'visits') return [];
    const completed = allAppointments.filter(a => a.status === 'completed');
    const petMap = {};
    completed.forEach(a => {
      const name = a.petName || 'Unknown';
      petMap[name] = (petMap[name] || 0) + 1;
    });
    const total = completed.length;
    return Object.entries(petMap)
      .map(([name, count]) => ({ name, count, pct: total > 0 ? count / total : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [allAppointments, activeTab]);

  /** Pie data for completed visits grouped by primary service name. */
  const visitsByService = useMemo(() => {
    if (activeTab !== 'visits') return [];
    const completed = allAppointments.filter(a => a.status === 'completed');
    const svcMap = {};
    completed.forEach(a => {
      const svc = a.serviceNames?.[0] || a.service || 'Other';
      svcMap[svc] = (svcMap[svc] || 0) + 1;
    });
    const total = completed.length;
    return Object.entries(svcMap)
      .map(([name, count]) => ({ name, count, pct: total > 0 ? count / total : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [allAppointments, activeTab]);

  /** Pie data for completed visits grouped by department/serviceCategory. */
  const visitsByDepartment = useMemo(() => {
    if (activeTab !== 'visits') return [];
    const completed = allAppointments.filter(a => a.status === 'completed');
    const deptMap = {};
    completed.forEach(a => {
      const dept = a.department || a.serviceCategory || 'Other';
      deptMap[dept] = (deptMap[dept] || 0) + 1;
    });
    const total = completed.length;
    return Object.entries(deptMap)
      .map(([name, count]) => ({ name, count, pct: total > 0 ? count / total : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [allAppointments, activeTab]);

  // ── YOY SPENDING DATA ─────────────────────────────────────────────────────

  /**
   * Side-by-side monthly spending amounts for this year vs last year.
   * Mirrors the yoyVisitData structure but uses sale totals.
   * Gated on activeTab === 'visits'.
   */
  const yoySpendingData = useMemo(() => {
    if (activeTab !== 'visits') {
      return { months: [], hasLastYear: false, thisYearLabel: '', lastYearLabel: '' };
    }
    const now = new Date();
    const thisYear = now.getFullYear();
    const lastYear = thisYear - 1;
    const months = Array.from({ length: 12 }, (_, i) => {
      let thisYearTotal = 0;
      let lastYearTotal = 0;
      salesData.forEach(s => {
        const d = toDate(s.createdAt || s.date);
        if (!d) return;
        const amount = parseFloat(s.total) || 0;
        if (d.getFullYear() === thisYear && d.getMonth() === i) thisYearTotal += amount;
        if (d.getFullYear() === lastYear && d.getMonth() === i) lastYearTotal += amount;
      });
      return {
        month: i,
        label: new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'short' }),
        thisYear: thisYearTotal,
        lastYear: lastYearTotal,
      };
    });
    const maxAmount = Math.max(...months.map(m => Math.max(m.thisYear, m.lastYear)), 1);
    return {
      months: months.map(m => ({
        ...m,
        thisYearPct: Math.round((m.thisYear / maxAmount) * 100),
        lastYearPct: Math.round((m.lastYear / maxAmount) * 100),
      })),
      thisYearLabel: String(thisYear),
      lastYearLabel: String(lastYear),
      hasLastYear: salesData.some(s => {
        const d = toDate(s.createdAt || s.date);
        return d && d.getFullYear() === lastYear;
      }),
    };
  }, [salesData, activeTab]);

  // ── VISIT PATTERNS ────────────────────────────────────────────────────────

  /**
   * Days-between-visits for the last 10 consecutive completed visit gaps.
   * Used as SparkLine data (unit=" days"). Gated on activeTab === 'visits'.
   */
  const visitFrequencyTrend = useMemo(() => {
    if (activeTab !== 'visits') return [];
    const completed = allAppointments
      .filter(a => a.status === 'completed')
      .map(a => toDate(a.timeCompleted || a.scheduledDate))
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());
    if (completed.length < 2) return [];
    const gaps = [];
    for (let i = 1; i < completed.length; i++) {
      const daysBetween = Math.round((completed[i] - completed[i - 1]) / 86400000);
      gaps.push({
        label: completed[i].toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        value: daysBetween,
      });
    }
    return dedupeLabels(gaps.slice(-10));
  }, [allAppointments, activeTab]);

  /**
   * Completed / cancelled / no-show distribution as pie data.
   * Gated on activeTab === 'visits'.
   */
  const visitOutcomes = useMemo(() => {
    if (activeTab !== 'visits') return [];
    const statusMap = {};
    allAppointments.forEach(a => {
      if (['completed', 'cancelled', 'no-show'].includes(a.status)) {
        statusMap[a.status] = (statusMap[a.status] || 0) + 1;
      }
    });
    const total = Object.values(statusMap).reduce((s, c) => s + c, 0);
    if (total === 0) return [];
    const nameMap = { completed: 'Completed', cancelled: 'Cancelled', 'no-show': 'No-Show' };
    return Object.entries(statusMap)
      .map(([status, count]) => ({
        name: nameMap[status] || status,
        count,
        pct: count / total,
      }))
      .sort((a, b) => b.count - a.count);
  }, [allAppointments, activeTab]);

  /**
   * Monday-first preferred-day bar chart (Mon-Sun counts of completed visits).
   * Gated on activeTab === 'visits'.
   */
  const preferredDays = useMemo(() => {
    if (activeTab !== 'visits') return [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = Array(7).fill(0);
    allAppointments.filter(a => a.status === 'completed').forEach(a => {
      const d = toDate(a.timeCompleted || a.scheduledDate);
      if (d) counts[d.getDay()]++;
    });
    // Reorder to Mon-Sun (getDay: 0=Sun,1=Mon,...,6=Sat)
    const reordered = [1, 2, 3, 4, 5, 6, 0].map(i => ({
      label: dayNames[i],
      count: counts[i],
    }));
    const maxCount = Math.max(...reordered.map(d => d.count), 1);
    return reordered.map(d => ({ ...d, pct: Math.round((d.count / maxCount) * 100) }));
  }, [allAppointments, activeTab]);

  /**
   * Pet species distribution as pie data.
   * Normalises dog/canine → 'Canine', cat/feline → 'Feline'.
   * Only meaningful when 2+ distinct species exist.
   * Gated on activeTab === 'visits'.
   */
  const speciesDistribution = useMemo(() => {
    if (activeTab !== 'visits') return [];
    const speciesMap = {};
    userPets.forEach(pet => {
      const sp = (pet.species || 'Unknown').toLowerCase();
      const label = sp.includes('cat') || sp.includes('feline') ? 'Feline'
        : sp.includes('dog') || sp.includes('canine') ? 'Canine'
        : pet.species || 'Other';
      speciesMap[label] = (speciesMap[label] || 0) + 1;
    });
    const total = userPets.length;
    return Object.entries(speciesMap)
      .map(([name, count]) => ({ name, count, pct: total > 0 ? count / total : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [userPets, activeTab]);

  // ── SEASONAL VISIT PATTERNS ───────────────────────────────────────────────

  /**
   * Counts completed visits by calendar month (0 = Jan, 11 = Dec) across ALL
   * years. Returns a 12-element array with intensity values 0.0–1.0 relative
   * to the busiest month. Used to render a heatmap strip in MyStatsScreen.
   *
   * Gated on activeTab === 'visits'.
   */
  const seasonalPattern = useMemo(() => {
    if (activeTab !== 'visits') {
      return Array.from({ length: 12 }, (_, i) => ({
        month: i,
        label: new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'short' }),
        count: 0,
        intensity: 0,
      }));
    }

    const monthlyCounts = Array(12).fill(0);

    allAppointments.forEach(a => {
      if (a.status !== 'completed') return;
      const d = toDate(a.timeCompleted || a.scheduledDate);
      if (!d) return;
      monthlyCounts[d.getMonth()]++;
    });

    const maxCount = Math.max(...monthlyCounts, 1);

    return monthlyCounts.map((count, i) => ({
      month: i,
      label: new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'short' }),
      count,
      intensity: count / maxCount,
    }));
  }, [allAppointments, activeTab]);

  // ── PER-PET SEASONAL PATTERN ─────────────────────────────────────────────

  /**
   * 12-month heatmap data keyed by 'all' (existing seasonalPattern) or pet.id.
   * Used by the per-pet filter chips on the SEASONAL PATTERNS heatmap.
   * Gated on activeTab === 'visits'.
   */
  const perPetSeasonalPattern = useMemo(() => {
    if (activeTab !== 'visits') return {};
    const result = { all: seasonalPattern };
    userPets.forEach(pet => {
      const monthlyCounts = Array(12).fill(0);
      allAppointments.forEach(a => {
        if (a.status !== 'completed' || a.petId !== pet.id) return;
        const d = toDate(a.timeCompleted || a.scheduledDate);
        if (d) monthlyCounts[d.getMonth()]++;
      });
      const maxCount = Math.max(...monthlyCounts, 1);
      result[pet.id] = monthlyCounts.map((count, i) => ({
        month: i,
        label: new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'short' }),
        count,
        intensity: count / maxCount,
      }));
    });
    return result;
  }, [allAppointments, userPets, activeTab, seasonalPattern]);

  // ── CONDITIONS OVERVIEW ───────────────────────────────────────────────────

  /**
   * One-shot fetch from pets/{petId}/problems for all user pets.
   * Aggregates active/resolved/monitoring counts with per-pet summaries.
   * Non-blocking — defaults to empty when no problem subcollection exists yet.
   */
  const [conditionsRaw, setConditionsRaw] = useState([]);
  const petIds = useMemo(() => userPets.map(p => p.id).join(','), [userPets]);

  useEffect(() => {
    if (userPets.length === 0) return;
    let cancelled = false;

    (async () => {
      const results = await Promise.all(userPets.map(async (pet) => {
        try {
          const snap = await getDocs(
            query(
              collection(db, 'pets', pet.id, 'problems'),
              orderBy('diagnosedAt', 'desc'),
            )
          );
          return snap.docs.map(d => ({ id: d.id, ...d.data(), petName: pet.name, petId: pet.id }));
        } catch {
          return [];
        }
      }));
      if (!cancelled) setConditionsRaw(results.flat());
    })();

    return () => { cancelled = true; };
  }, [petIds]);

  const conditionsOverview = useMemo(() => {
    const active     = conditionsRaw.filter(p => p.status === 'active');
    const resolved   = conditionsRaw.filter(p => p.status === 'resolved');
    const monitoring = conditionsRaw.filter(p => p.status === 'monitoring');

    // Per-pet summary: only active + monitoring are clinically relevant to show
    const perPet = {};
    [...active, ...monitoring].forEach(p => {
      if (!perPet[p.petName]) perPet[p.petName] = [];
      perPet[p.petName].push({ name: p.name, status: p.status });
    });

    return {
      activeCount:     active.length,
      resolvedCount:   resolved.length,
      monitoringCount: monitoring.length,
      perPet,
      hasData: conditionsRaw.length > 0,
    };
  }, [conditionsRaw]);

  // ── CALENDAR DOTS ─────────────────────────────────────────────────────────

  /**
   * Builds a { 'YYYY-MM-DD': [{ petName, service, status }] } map for
   * the current and next calendar month. Used by the calendar mini-view
   * in the OVERVIEW tab.
   */
  const calendarDots = useMemo(() => {
    const now          = new Date();
    const currentMonth = now.getMonth();
    const currentYear  = now.getFullYear();
    const dotMap = {};

    allAppointments.forEach(a => {
      const d = toDate(a.scheduledDate);
      if (!d) return;
      // Include only current month and next month
      const monthDiff =
        (d.getFullYear() - currentYear) * 12 + (d.getMonth() - currentMonth);
      if (monthDiff < 0 || monthDiff > 1) return;

      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!dotMap[key]) dotMap[key] = [];
      dotMap[key].push({
        petName: a.petName || 'Unknown',
        service: a.serviceNames?.[0] || a.service || 'Visit',
        status:  a.status,
      });
    });

    return dotMap;
  }, [allAppointments]);

  // ── PREVENTIVE CARE TIMELINE ──────────────────────────────────────────────

  /**
   * Consolidated list of action items sorted by urgency (overdue first):
   *   0 = vaccine_overdue / recheck_overdue   (danger)
   *   1 = vaccine_due_soon                    (warning)
   *   2 = recheck upcoming                    (sky)
   *   3 = age milestone                       (sky, informational)
   */
  const preventiveCare = useMemo(() => {
    const items = [];

    petCards.forEach(pc => {
      // Vaccine-based items from catalog-enriched vaccineStatus.
      if (pc.vaccineStatus?.statuses) {
        pc.vaccineStatus.statuses
          .filter(v => v.status === 'overdue')
          .forEach(v => {
            items.push({
              type: 'vaccine_overdue',
              urgency: 0,
              petName: pc.name,
              petId: pc.id,
              label: `${v.name} overdue`,
              detail: v.daysUntilDue != null
                ? `${Math.abs(v.daysUntilDue)} ${Math.abs(v.daysUntilDue) === 1 ? 'day' : 'days'} overdue`
                : null,
              cta: 'BOOK NOW',
              ctaNav: { screen: 'BookAppointment', params: { prefillPetId: pc.id } },
            });
          });

        pc.vaccineStatus.statuses
          .filter(v => v.status === 'due_soon')
          .forEach(v => {
            items.push({
              type: 'vaccine_due_soon',
              urgency: 1,
              petName: pc.name,
              petId: pc.id,
              label: `${v.name} due soon`,
              detail: v.daysUntilDue != null ? `in ${v.daysUntilDue} days` : null,
              cta: null,
              ctaNav: null,
            });
          });
      }

      // Recheck reminders — overdue recheck escalates to urgency 0.
      // Guard: only surface a recheck if the pet has actually been visited
      // at least once. Otherwise a stale medical_record without an associated
      // appointment can produce a misleading "Recheck overdue" for a pet that
      // technically has "No visits yet" elsewhere in the UI.
      if (pc.recheckInfo && pc.lastVisitDate) {
        const isOverdue = pc.recheckInfo.daysUntil != null && pc.recheckInfo.daysUntil <= 0;
        items.push({
          type: 'recheck',
          urgency: isOverdue ? 0 : 2,
          petName: pc.name,
          petId: pc.id,
          label: isOverdue ? 'Recheck overdue' : 'Recheck due',
          detail: pc.recheckInfo.daysUntil == null
            ? pc.recheckInfo.recheckStr
            : isOverdue
              ? `${Math.abs(pc.recheckInfo.daysUntil)} ${Math.abs(pc.recheckInfo.daysUntil) === 1 ? 'day' : 'days'} overdue`
              : `in ${pc.recheckInfo.daysUntil} day${pc.recheckInfo.daysUntil !== 1 ? 's' : ''}`,
          cta: 'BOOK RECHECK',
          ctaNav: { screen: 'BookAppointment', params: { prefillPetId: pc.id } },
        });
      }
    });

    // Sort by urgency ascending (lowest number = highest priority).
    items.sort((a, b) => a.urgency - b.urgency);

    return items;
  }, [petCards, aggregateStats]);

  // ── WEEKLY SPENDING DATA ─────────────────────────────────────────────────

  /**
   * 12-week bar chart data bucketed by Monday-start ISO week, summing sale
   * amounts instead of counting visits. Mirrors weeklyVisitData structure.
   * Gated on activeTab === 'spending'.
   */
  const weeklySpendingData = useMemo(() => {
    if (activeTab !== 'spending') return [];
    const now = new Date();
    const currentYear = now.getFullYear();
    let rangeStart = null, rangeEnd = null;
    if (spendingRange === '6m') rangeStart = new Date(currentYear, now.getMonth() - 5, 1);
    else if (spendingRange === 'ytd') rangeStart = new Date(currentYear, 0, 1);
    else if (spendingRange === 'ly') {
      rangeStart = new Date(currentYear - 1, 0, 1);
      rangeEnd   = new Date(currentYear - 1, 11, 31, 23, 59, 59);
    }
    const filtered = salesData.filter(sale => {
      if (!rangeStart && !rangeEnd) return true;
      const d = toDate(sale.createdAt || sale.date);
      if (!d) return false;
      if (rangeStart && d < rangeStart) return false;
      if (rangeEnd   && d > rangeEnd)   return false;
      return true;
    });

    const weeks = Array.from({ length: 12 }, (_, i) => {
      const weekStart = new Date(now);
      const dow = weekStart.getDay() || 7;
      weekStart.setDate(weekStart.getDate() - dow + 1 - (11 - i) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return {
        key: `w${i}`,
        label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        start: weekStart,
        end: weekEnd,
        amount: 0,
      };
    });

    filtered.forEach(sale => {
      const d = toDate(sale.createdAt || sale.date);
      if (!d) return;
      const bucket = weeks.find(w => d >= w.start && d <= w.end);
      if (bucket) bucket.amount += parseFloat(sale.total) || 0;
    });

    const maxAmount = Math.max(...weeks.map(w => w.amount), 1);
    return weeks.map(w => ({
      ...w,
      pct: Math.round((w.amount / maxAmount) * 100),
    }));
  }, [salesData, spendingRange, activeTab]);

  // ── SPENDING BY DEPARTMENT ────────────────────────────────────────────────

  /**
   * Pie data for spending grouped by appointment department/serviceCategory.
   * Gated on activeTab === 'spending'.
   */
  const spendingByDepartment = useMemo(() => {
    if (activeTab !== 'spending') return [];
    const now = new Date();
    const currentYear = now.getFullYear();
    let rangeStart = null, rangeEnd = null;
    if (spendingRange === '6m') rangeStart = new Date(currentYear, now.getMonth() - 5, 1);
    else if (spendingRange === 'ytd') rangeStart = new Date(currentYear, 0, 1);
    else if (spendingRange === 'ly') {
      rangeStart = new Date(currentYear - 1, 0, 1);
      rangeEnd   = new Date(currentYear - 1, 11, 31, 23, 59, 59);
    }
    const filtered = salesData.filter(sale => {
      if (!rangeStart && !rangeEnd) return true;
      const d = toDate(sale.createdAt || sale.date);
      if (!d) return false;
      if (rangeStart && d < rangeStart) return false;
      if (rangeEnd   && d > rangeEnd)   return false;
      return true;
    });
    const deptApptMap = new Map(allAppointments.map(a => [a.id, a]));
    const deptMap = {};
    filtered.forEach(sale => {
      const appt = deptApptMap.get(sale.appointmentId);
      const dept = appt?.department || appt?.serviceCategory || sale.serviceType || 'Other';
      deptMap[dept] = (deptMap[dept] || 0) + (parseFloat(sale.total) || 0);
    });
    const total = Object.values(deptMap).reduce((s, v) => s + v, 0);
    return Object.entries(deptMap)
      .map(([name, amount]) => ({
        name,
        count: Math.round(amount),
        pct: total > 0 ? amount / total : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [salesData, allAppointments, spendingRange, activeTab]);

  // ── SPENDING PER VISIT TREND ──────────────────────────────────────────────

  /**
   * For each completed appointment that has a matching sale, builds a trend
   * data point. Returns last 12 matched points (oldest → newest) + overall
   * average. Gated on activeTab === 'spending'.
   */
  const spendingPerVisit = useMemo(() => {
    if (activeTab !== 'spending') return { trendData: [], average: 0 };

    const completed = allAppointments.filter(a => a.status === 'completed');
    const matched = completed
      .map(a => {
        const sale = salesData.find(s => s.appointmentId === a.id);
        return sale
          ? { date: toDate(a.timeCompleted || a.scheduledDate), amount: parseFloat(sale.total) || 0 }
          : null;
      })
      .filter(Boolean)
      .filter(m => m.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const trendData = dedupeLabels(
      matched.slice(-12).map(m => ({
        label: m.date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        value: Math.round(m.amount),
      })),
    );

    const totalSpend = matched.reduce((s, m) => s + m.amount, 0);
    const average = matched.length > 0 ? Math.round(totalSpend / matched.length) : 0;

    return { trendData, average };
  }, [allAppointments, salesData, activeTab]);

  return {
    ...aggregateStats,
    relationship,
    petCards,
    vaccineCatalog,
    spendingBreakdown,
    visitTypePieData,
    upcomingAppointments,
    preventiveCare,
    yoyVisitData,
    yoySpendingData,
    seasonalPattern,
    perPetSeasonalPattern,
    conditionsOverview,
    calendarDots,
    weeklyVisitData,
    visitsByPet,
    visitsByService,
    visitsByDepartment,
    visitFrequencyTrend,
    visitOutcomes,
    preferredDays,
    speciesDistribution,
    weeklySpendingData,
    spendingByDepartment,
    spendingPerVisit,
  };
}
