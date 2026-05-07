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
      for (const rec of sorted) {
        const vitals = resolveVitals(rec);
        const w = parseFloat(vitals.weight);
        if (!isNaN(w)) {
          weightPoints.push({
            label: rec._date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
            value: w,
          });
          if (weightPoints.length >= 5) break;
        }
      }
      // Reverse so SparkLine receives data oldest → newest (left → right).
      weightPoints.reverse();

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
          if (rx.sig?.days) {
            const endDate = new Date(rec._date.getTime() + rx.sig.days * 86400000);
            const remaining = Math.ceil((endDate.getTime() - now.getTime()) / 86400000);
            daysRemaining = remaining > 0 ? remaining : 0;
          }

          activeMeds.push({
            name: rx.itemName || rx.name || 'Unknown',
            daysRemaining,
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

  // ── SPENDING BREAKDOWN ────────────────────────────────────────────────────

  /**
   * Monthly spending trend, per-pet breakdown, per-service breakdown, and
   * outstanding balance — all derived from the salesData array (no new queries).
   */
  const spendingBreakdown = useMemo(() => {
    const now = new Date();

    // Monthly buckets for the last 6 months.
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        total: 0,
      };
    });

    salesData.forEach(sale => {
      const saleDate = toDate(sale.createdAt || sale.date);
      if (!saleDate) return;
      const key = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
      const bucket = months.find(m => m.key === key);
      if (bucket) bucket.total += parseFloat(sale.total) || 0;
    });

    const spendingSparkline = months.map(m => ({ label: m.label, value: m.total }));

    // Per pet — sales matched to their parent appointment to retrieve petName.
    const perPet = {};
    salesData.forEach(sale => {
      const appt = allAppointments.find(a => a.id === sale.appointmentId);
      if (!appt) return;
      const petName = appt.petName || 'Unknown';
      perPet[petName] = (perPet[petName] || 0) + (parseFloat(sale.total) || 0);
    });
    const perPetList = Object.entries(perPet)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    // Per service type — from appointment metadata.
    const perService = {};
    salesData.forEach(sale => {
      const appt = allAppointments.find(a => a.id === sale.appointmentId);
      const serviceType = appt?.serviceCategory || appt?.department || sale.serviceType || 'Other';
      perService[serviceType] = (perService[serviceType] || 0) + (parseFloat(sale.total) || 0);
    });
    const perServiceList = Object.entries(perService)
      .map(([type, amount]) => ({ type, amount }))
      .sort((a, b) => b.amount - a.amount);

    // Outstanding balance — sum of positive balanceRemaining on non-void/refunded sales.
    const outstandingBalance = salesData.reduce((sum, s) => {
      if (s.status === 'refunded' || s.status === 'voided') return sum;
      const bal = parseFloat(s.balanceRemaining) || 0;
      return sum + (bal > 0 ? bal : 0);
    }, 0);

    return { spendingSparkline, perPetList, perServiceList, outstandingBalance };
  }, [salesData, allAppointments]);

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
                ? `${Math.abs(v.daysUntilDue)} days overdue`
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
              ? `${Math.abs(pc.recheckInfo.daysUntil)} days overdue`
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
    preventiveCare,
  };
}
