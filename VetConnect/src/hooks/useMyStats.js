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

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export function useMyStats({
  allAppointments,
  userPets,
  petRecords,
  salesData,
  vaccineAlerts,
  userProfile,
  spendingRange = '6m',
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
        check: v => Array.isArray(v) && v.length > 0 && !!v[0]?.name,
      },
      { key: 'govIdType',         label: 'Government ID' },
    ];

    const filledCount = profileFields.filter(f =>
      f.check ? f.check(userProfile?.[f.key]) : !!userProfile?.[f.key]
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

  // ── DIAGNOSIS HISTORY ─────────────────────────────────────────────────────

  /**
   * Aggregates all diagnosis entries across every pet from medical_records.
   * T4.13 (structured problem list / active-vs-resolved) is not built, so this
   * is a flat chronological log with no status distinction.
   */
  const diagnosisHistory = useMemo(() => {
    const allDx = []; // { name, petName, petId, date }

    userPets.forEach(pet => {
      const records = petRecords[pet.id] || [];
      records.forEach(r => {
        const recordDate = toDate(r.createdAt || r.dateOfVisit || r.date);
        const dxList = r.diagnoses?.length > 0
          ? r.diagnoses
          : r.diagnosis ? [{ name: r.diagnosis }] : [];
        dxList.forEach(dx => {
          if (dx.name) {
            allDx.push({
              name: dx.name,
              petName: pet.name,
              petId: pet.id,
              date: recordDate,
            });
          }
        });
      });
    });

    // Sort newest first.
    allDx.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

    const totalConditions = allDx.length;

    // Per-pet timelines (already in descending order from the sort above).
    const perPetTimeline = {};
    allDx.forEach(dx => {
      if (!perPetTimeline[dx.petName]) perPetTimeline[dx.petName] = [];
      perPetTimeline[dx.petName].push(dx);
    });

    // Most recurring diagnosis name across all pets (only if count > 1).
    const nameCounts = {};
    allDx.forEach(dx => {
      nameCounts[dx.name] = (nameCounts[dx.name] || 0) + 1;
    });
    const sortedNames = Object.entries(nameCounts).sort((a, b) => b[1] - a[1]);
    const mostRecurring = sortedNames.length > 0 && sortedNames[0][1] > 1
      ? { name: sortedNames[0][0], count: sortedNames[0][1] }
      : null;

    const thisYear = new Date().getFullYear();
    const thisYearCount = allDx.filter(dx => dx.date?.getFullYear() === thisYear).length;

    return { totalConditions, perPetTimeline, mostRecurring, thisYearCount };
  }, [userPets, petRecords]);

  // ── YEAR-OVER-YEAR VISIT DATA ─────────────────────────────────────────────

  /**
   * Side-by-side monthly visit counts for the current year vs the previous year.
   * hasLastYear is only true when at least one completed appointment exists in the
   * previous calendar year — controls whether the YoY section renders at all.
   */
  const yoyVisitData = useMemo(() => {
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
  }, [allAppointments]);

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
   */
  const spendingBreakdown = useMemo(() => {
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

    // ── Per pet ─────────────────────────────────────────────────────────────
    const perPet = {};
    filteredSales.forEach(sale => {
      const appt = allAppointments.find(a => a.id === sale.appointmentId);
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
      const appt = allAppointments.find(a => a.id === sale.appointmentId);
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
      const appt = allAppointments.find(a => a.id === sale.appointmentId);
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
  }, [salesData, allAppointments, spendingRange]);

  // ── VISIT TYPE PIE DATA ───────────────────────────────────────────────────

  /**
   * Breakdown of completed visits by department/serviceCategory for the
   * donut chart. Entries are sorted descending by count.
   */
  const visitTypePieData = useMemo(() => {
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
  }, [allAppointments]);

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

  // ── SEASONAL VISIT PATTERNS ───────────────────────────────────────────────

  /**
   * Counts completed visits by calendar month (0 = Jan, 11 = Dec) across ALL
   * years. Returns a 12-element array with intensity values 0.0–1.0 relative
   * to the busiest month. Used to render a heatmap strip in MyStatsScreen.
   */
  const seasonalPattern = useMemo(() => {
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
      if (pc.recheckInfo) {
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

    // Age milestones from the aggregate stats hook.
    (aggregateStats.petOverview?.ageMilestones ?? []).forEach(ms => {
      items.push({
        type: 'milestone',
        urgency: 3,
        petName: ms.petName,
        petId: null,
        label: ms.message,
        detail: null,
        cta: null,
        ctaNav: null,
      });
    });

    // Sort by urgency ascending (lowest number = highest priority).
    items.sort((a, b) => a.urgency - b.urgency);

    return items;
  }, [petCards, aggregateStats]);

  return {
    ...aggregateStats,
    relationship,
    petCards,
    vaccineCatalog,
    diagnosisHistory,
    spendingBreakdown,
    visitTypePieData,
    upcomingAppointments,
    preventiveCare,
    yoyVisitData,
    seasonalPattern,
  };
}
