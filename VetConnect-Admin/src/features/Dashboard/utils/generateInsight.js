/**
 * generateInsight — Rule-based contextual insight engine for Dashboard KPICards.
 *
 * Evaluates 30 prioritized rules against the full Dashboard data object
 * and returns a flat map of KPICard target keys to short insight strings.
 *
 * Design:
 * - Rules are ordered by priority within each tab group (most specific first).
 * - First-match-wins: only the highest-priority matching rule per target fires.
 * - All rules are pure functions — no Firestore, no side effects.
 * - Target keys match the KPICard `title` prop (uppercase, e.g., "AVG WAIT TIME").
 *
 * @param {object} data           - Full return from useDashboardData
 * @param {object} clinicSettings - From useClinicSettings (openHour, closeHour, workingDays)
 * @param {boolean} isOpen        - Whether the clinic is currently open
 * @returns {Object<string, string>} Map of KPICard title -> insight text
 */
export function generateInsight(data, clinicSettings, isOpen) {
  const { ops, growth, clinical, financial, deltas, queueData, appointments, staffList } = data;
  const results = {};

  // Iterate all rules; first match per target wins
  for (const rule of RULES) {
    if (results[rule.target]) continue; // already have a higher-priority match
    try {
      if (rule.condition({ ops, growth, clinical, financial, deltas, queueData, appointments, staffList, clinicSettings, isOpen })) {
        const msg = rule.message({ ops, growth, clinical, financial, deltas, queueData, appointments, staffList, clinicSettings, isOpen });
        if (msg) results[rule.target] = msg;
      }
    } catch {
      // Rule evaluation failed — skip silently. A broken rule must never
      // crash the Dashboard. Log in dev only if needed.
    }
  }

  return results;
}

// ── Rule type definition ─────────────────────────────────────────
/**
 * @typedef {object} InsightRule
 * @property {string} id        - Unique identifier for debugging (e.g., "ops-wait-alert")
 * @property {string} tab       - Which tab this rule belongs to (ops|analytics|financial)
 * @property {string} target    - KPICard title string this insight attaches to
 * @property {function} condition - (ctx) => boolean — should the rule fire?
 * @property {function} message   - (ctx) => string — the insight text to display
 */

// ── Rules array (30 total) ────────────────────────────────────────
// Grouped by tab; priority within each group is top-to-bottom.
// Operations first (P1), then Clinical, Financial, Growth.

const RULES = [

  // ── OPERATIONS TAB RULES (10) ───────────────────────────────────
  // These only fire when ops is non-null (period === 'today').

  // Rule 1: Wait time alert — high avg wait vs yesterday
  {
    id: 'ops-wait-alert',
    tab: 'ops',
    target: 'AVG WAIT TIME',
    condition: ({ ops, deltas }) =>
      ops && ops.avgWaitMins > 15 && deltas?.avgWait != null && deltas.avgWait > 0,
    message: ({ ops, deltas }) =>
      `${deltas.avgWait}% higher than yesterday`,
  },

  // Rule 2: Wait time good — below threshold
  {
    id: 'ops-wait-good',
    tab: 'ops',
    target: 'AVG WAIT TIME',
    condition: ({ ops }) => ops && ops.avgWaitMins > 0 && ops.avgWaitMins <= 10,
    message: () => 'Wait times are healthy',
  },

  // Rule 3: Queue depth — patients currently waiting
  {
    id: 'ops-queue-depth',
    tab: 'ops',
    target: 'ACTIVE IN FACILITY',
    condition: ({ ops }) =>
      ops && ops.currentWaitingCount > 3,
    message: ({ ops }) =>
      `${ops.currentWaitingCount} waiting, longest ${ops.longestCurrentWait}min`,
  },

  // Rule 4: Staff imbalance — one vet has 2x the average
  {
    id: 'ops-staff-imbalance',
    tab: 'ops',
    target: 'TOTAL APPOINTMENTS',
    condition: ({ ops }) => {
      if (!ops) return false;
      const loads = Object.values(ops.staffWorkload);
      if (loads.length < 2) return false;
      const avg = loads.reduce((a, b) => a + b, 0) / loads.length;
      const max = Math.max(...loads);
      return max >= avg * 2 && avg > 0;
    },
    message: ({ ops }) => {
      const entries = Object.entries(ops.staffWorkload);
      const sorted = entries.sort(([, a], [, b]) => b - a);
      const avg = Math.round(
        Object.values(ops.staffWorkload).reduce((a, b) => a + b, 0) /
        entries.length,
      );
      return `${sorted[0][0]} has ${sorted[0][1]} cases, avg is ${avg}`;
    },
  },

  // Rule 5: No-show trend — multiple no-shows today
  {
    id: 'ops-no-show',
    tab: 'ops',
    target: 'NO-SHOWS',
    condition: ({ ops }) => ops && ops.noShowCount >= 2,
    message: ({ ops }) => {
      const pct = ops.totalAppointments > 0
        ? Math.round((ops.noShowCount / ops.totalAppointments) * 100)
        : 0;
      return `${pct}% no-show rate — consider overbooking`;
    },
  },

  // Rule 6: Emergency spike — more than usual
  {
    id: 'ops-emergency',
    tab: 'ops',
    target: 'EMERGENCIES',
    condition: ({ ops }) => ops && ops.emergencyCount >= 2,
    message: ({ ops }) =>
      `${ops.emergencyCount} emergencies — higher than typical`,
  },

  // Rule 7: Throughput pace — projected completions by close
  {
    id: 'ops-throughput',
    tab: 'ops',
    target: 'COMPLETED',
    condition: ({ ops, isOpen }) => {
      if (!ops || !isOpen) return false;
      return ops.totalAppointments > 0 && (ops.statusCounts.completed || 0) > 0;
    },
    message: ({ ops, clinicSettings }) => {
      const now = new Date();
      const hoursLeft = Math.max(0, (clinicSettings.closeHour || 17) - now.getHours());
      const completed = ops.statusCounts.completed || 0;
      const elapsed = now.getHours() - (clinicSettings.openHour || 8);
      if (elapsed <= 0) return null;
      const rate = completed / elapsed;
      const projected = completed + Math.round(rate * hoursLeft);
      return `On pace for ~${projected} by close`;
    },
  },

  // Rule 8: Department overload — one dept has >60% of today's load
  {
    id: 'ops-dept-overload',
    tab: 'ops',
    target: 'QUEUE SERVING',
    condition: ({ ops }) => {
      if (!ops || ops.totalAppointments < 5) return false;
      const vals = Object.values(ops.deptLoad);
      if (vals.length === 0) return false;
      return Math.max(...vals) / ops.totalAppointments > 0.6;
    },
    message: ({ ops }) => {
      const sorted = Object.entries(ops.deptLoad).sort(([, a], [, b]) => b - a);
      const pct = Math.round((sorted[0][1] / ops.totalAppointments) * 100);
      return `${sorted[0][0]} has ${pct}% of load`;
    },
  },

  // Rule 9: Consult duration — elevated vs yesterday
  {
    id: 'ops-consult-long',
    tab: 'ops',
    target: 'AVG CONSULT DURATION',
    condition: ({ ops, deltas }) =>
      ops && ops.avgConsultMins > 0 && deltas?.avgConsult != null && deltas.avgConsult > 20,
    message: ({ deltas }) =>
      `${deltas.avgConsult}% longer than yesterday`,
  },

  // Rule 10: Queue idle / clinic status
  {
    id: 'ops-clinic-status',
    tab: 'ops',
    target: 'LONGEST CURRENT WAIT',
    condition: ({ ops, isOpen }) =>
      ops && isOpen && ops.currentWaitingCount === 0,
    message: () => 'Queue clear — all patients served',
  },

  // ── ANALYTICS TAB RULES — CLINICAL (8) ─────────────────────────

  // Rule 11: Record volume — vs prior period
  {
    id: 'clin-record-vol',
    tab: 'analytics',
    target: 'RECORDS SIGNED',
    condition: ({ clinical, deltas }) =>
      clinical && clinical.recordsSigned > 0 && deltas?.recordsSigned != null,
    message: ({ deltas }) => {
      const dir = deltas.recordsSigned > 0 ? 'up' : deltas.recordsSigned < 0 ? 'down' : 'flat';
      return dir === 'flat'
        ? 'On par with last period'
        : `${Math.abs(deltas.recordsSigned)}% ${dir} vs last period`;
    },
  },

  // Rule 12: Vaccine trend — total vaccinations this period
  {
    id: 'clin-vaccine',
    tab: 'analytics',
    target: 'VACCINATIONS',
    condition: ({ clinical }) =>
      clinical && clinical.totalVaccinations > 0 && clinical.vaccinesByType.length > 0,
    message: ({ clinical }) => {
      const top = clinical.vaccinesByType[0];
      return `${top.name} is most given (${top.count} doses)`;
    },
  },

  // Rule 13: Follow-up gap — low compliance
  {
    id: 'clin-followup-gap',
    tab: 'analytics',
    target: 'FOLLOW-UP COMPLIANCE',
    condition: ({ clinical }) =>
      clinical && clinical.recordsWithFollowUp > 0 && clinical.followUpComplianceRate < 50,
    message: ({ clinical }) => {
      const overdue = clinical.recordsWithFollowUp - clinical.followUpAttended;
      return `${overdue} patients overdue for follow-up`;
    },
  },

  // Rule 14: Follow-up good — high compliance
  {
    id: 'clin-followup-good',
    tab: 'analytics',
    target: 'FOLLOW-UP COMPLIANCE',
    condition: ({ clinical }) =>
      clinical && clinical.followUpComplianceRate >= 80,
    message: () => 'Strong follow-up adherence',
  },

  // Rule 15: Diagnosis cluster — most common diagnosis
  // Priority below rule 11 (record volume delta takes precedence if data exists)
  {
    id: 'clin-diag-cluster',
    tab: 'analytics',
    target: 'RECORDS SIGNED',
    condition: ({ clinical }) =>
      clinical && clinical.topDiagnoses.length > 0 && clinical.recordsSigned >= 5,
    message: ({ clinical }) => {
      const top = clinical.topDiagnoses[0];
      const pct = Math.round((top.count / clinical.recordsSigned) * 100);
      return `${top.diagnosis} is ${pct}% of cases`;
    },
  },

  // Rule 16: Confinement alert — elevated rate
  {
    id: 'clin-confinement',
    tab: 'analytics',
    target: 'CONFINEMENT RATE',
    condition: ({ clinical }) =>
      clinical && clinical.confinementRate > 10,
    message: ({ clinical }) =>
      `${clinical.confinedCount + clinical.carriedOverCount} patients confined/held`,
  },

  // Rule 17: Vet workload imbalance — one vet signed most records
  // Priority below rules 11 and 15 (fires only when no delta or diagnosis insight matched)
  {
    id: 'clin-vet-imbalance',
    tab: 'analytics',
    target: 'RECORDS SIGNED',
    condition: ({ clinical }) => {
      if (!clinical || clinical.recordsPerVet.length < 2) return false;
      const total = clinical.recordsPerVet.reduce((s, v) => s + v.count, 0);
      return clinical.recordsPerVet[0].count / total > 0.6;
    },
    message: ({ clinical }) => {
      const top = clinical.recordsPerVet[0];
      const total = clinical.recordsPerVet.reduce((s, v) => s + v.count, 0);
      const pct = Math.round((top.count / total) * 100);
      return `${top.vet} signed ${pct}% of records`;
    },
  },

  // Rule 18: Vitals anomaly — avg temp out of normal range for any species
  // Priority below rule 16 (confinement alert is more directly actionable)
  {
    id: 'clin-vitals-anomaly',
    tab: 'analytics',
    target: 'CONFINEMENT RATE',
    condition: ({ clinical }) => {
      if (!clinical || clinical.avgVitalsBySpecies.length === 0) return false;
      return clinical.avgVitalsBySpecies.some(row => {
        if (!row.avgTemp || row.sampleSize < 3) return false;
        // Normal dog temp: 38.3–39.2°C, cat: 38.1–39.2°C
        const sp = row.species.toLowerCase();
        if (sp.includes('dog') || sp.includes('canine')) return row.avgTemp > 39.5 || row.avgTemp < 37.8;
        if (sp.includes('cat') || sp.includes('feline')) return row.avgTemp > 39.5 || row.avgTemp < 37.5;
        return row.avgTemp > 40.0;
      });
    },
    message: ({ clinical }) => {
      const anomaly = clinical.avgVitalsBySpecies.find(row => {
        if (!row.avgTemp || row.sampleSize < 3) return false;
        const sp = row.species.toLowerCase();
        if (sp.includes('dog') || sp.includes('canine')) return row.avgTemp > 39.5 || row.avgTemp < 37.8;
        if (sp.includes('cat') || sp.includes('feline')) return row.avgTemp > 39.5 || row.avgTemp < 37.5;
        return row.avgTemp > 40.0;
      });
      return anomaly
        ? `Avg ${anomaly.species} temp ${anomaly.avgTemp}°C — review`
        : null;
    },
  },

  // ── FINANCIAL TAB RULES (7) ─────────────────────────────────────

  // Rule 19: Revenue trend — vs prior period
  {
    id: 'fin-revenue-trend',
    tab: 'financial',
    target: 'REVENUE COLLECTED',
    condition: ({ financial, deltas }) =>
      financial && financial.totalCollected > 0 && deltas?.revenue != null && deltas.revenue !== 0,
    message: ({ deltas }) => {
      const dir = deltas.revenue >= 0 ? 'above' : 'below';
      return `${Math.abs(deltas.revenue)}% ${dir} last period`;
    },
  },

  // Rule 20: Net margin alert — loss or thin margin
  {
    id: 'fin-margin-alert',
    tab: 'financial',
    target: 'NET MARGIN',
    condition: ({ financial }) =>
      financial && financial.netMargin < 0,
    message: ({ financial }) => {
      const fmt = n => `₱${Math.abs(n).toLocaleString()}`;
      return `Operating at a loss of ${fmt(financial.netMargin)}`;
    },
  },

  // Rule 21: Net margin healthy
  // Priority below rule 20 — only fires when the clinic is profitable
  {
    id: 'fin-margin-healthy',
    tab: 'financial',
    target: 'NET MARGIN',
    condition: ({ financial }) =>
      financial && financial.totalCollected > 0 && financial.netMargin > 0,
    message: ({ financial }) => {
      const pct = Math.round((financial.netMargin / financial.totalCollected) * 100);
      return `${pct}% profit margin`;
    },
  },

  // Rule 22: Refund spike — above 5%
  {
    id: 'fin-refund-spike',
    tab: 'financial',
    target: 'REFUND RATE',
    condition: ({ financial }) =>
      financial && financial.refundRate > 5,
    message: ({ financial }) =>
      `${financial.refundCount} refunds — investigate causes`,
  },

  // Rule 23: Outstanding balances — money in billing
  {
    id: 'fin-outstanding',
    tab: 'financial',
    target: 'OUTSTANDING BALANCES',
    condition: ({ financial }) =>
      financial && financial.outstandingBalances > 0,
    message: ({ financial }) => {
      const fmt = n => `₱${n.toLocaleString()}`;
      return `${fmt(financial.outstandingBalances)} pending collection`;
    },
  },

  // Rule 24: Discount impact — SC/PWD discount percentage of revenue
  {
    id: 'fin-discount-impact',
    tab: 'financial',
    target: 'SC/PWD DISCOUNTS',
    condition: ({ financial }) =>
      financial && financial.totalDiscounts > 0 && financial.totalCollected > 0,
    message: ({ financial }) => {
      const pct = Math.round((financial.totalDiscounts / financial.totalCollected) * 100);
      return `${pct}% of revenue in discounts`;
    },
  },

  // Rule 25: Payment mix — dominant method
  {
    id: 'fin-payment-mix',
    tab: 'financial',
    target: 'AVG TRANSACTION',
    condition: ({ financial }) => {
      if (!financial || financial.transactionCount < 3) return false;
      const methods = Object.entries(financial.paymentMethods || {});
      if (methods.length < 1) return false;
      const total = methods.reduce((s, [, v]) => s + v, 0);
      const sorted = methods.sort(([, a], [, b]) => b - a);
      return sorted[0][1] / total > 0.8;
    },
    message: ({ financial }) => {
      const sorted = Object.entries(financial.paymentMethods || {}).sort(([, a], [, b]) => b - a);
      const total = sorted.reduce((s, [, v]) => s + v, 0);
      const pct = Math.round((sorted[0][1] / total) * 100);
      return `${sorted[0][0]} is ${pct}% of payments`;
    },
  },

  // ── ANALYTICS TAB RULES — GROWTH (5) ───────────────────────────

  // Rule 26: Client acquisition — vs prior period
  {
    id: 'growth-acquisition',
    tab: 'analytics',
    target: 'NEW CLIENTS',
    condition: ({ growth, deltas }) =>
      growth && growth.newClientCount > 0 && deltas?.uniqueClients != null,
    message: ({ deltas }) => {
      const dir = deltas.uniqueClients >= 0 ? 'up' : 'down';
      return `${Math.abs(deltas.uniqueClients)}% ${dir} vs last period`;
    },
  },

  // Rule 27: Retention alert — below 40%
  {
    id: 'growth-retention-low',
    tab: 'analytics',
    target: 'CLIENT RETENTION',
    condition: ({ growth }) =>
      growth && growth.uniqueClientCount >= 5 && growth.retentionRate < 40,
    message: ({ growth }) =>
      `Only ${growth.returningClientCount} returning clients`,
  },

  // Rule 28: Retention healthy — above 60%
  // Priority below rule 27 — positive reinforcement only when truly healthy
  {
    id: 'growth-retention-good',
    tab: 'analytics',
    target: 'CLIENT RETENTION',
    condition: ({ growth }) =>
      growth && growth.retentionRate >= 60,
    message: () => 'Strong client loyalty',
  },

  // Rule 29: Peak hours — name the busiest hour
  // Namespaced target to avoid collision with Rule 4 (ops-staff-imbalance) which also
  // targets 'TOTAL APPOINTMENTS'. First-match-wins logic in generateInsight would
  // silently discard this rule's output when both conditions fire simultaneously.
  {
    id: 'growth-peak',
    tab: 'analytics',
    target: 'TOTAL APPOINTMENTS (ANALYTICS)',
    condition: ({ growth }) => {
      if (!growth || growth.peakHours.length === 0) return false;
      return growth.peakHours.some(h => h.count > 0);
    },
    message: ({ growth }) => {
      const peak = growth.peakHours.reduce(
        (a, b) => b.count > a.count ? b : a,
        growth.peakHours[0],
      );
      return `Peak: ${peak.label} with ${peak.count} appointments`;
    },
  },

  // Rule 30: Service concentration — top service dominance
  {
    id: 'growth-service-conc',
    tab: 'analytics',
    target: 'CLINIC UTILIZATION',
    condition: ({ growth }) => {
      if (!growth || growth.serviceRanking.length === 0 || growth.totalAppointments < 5) return false;
      return growth.serviceRanking[0].count / growth.totalAppointments > 0.4;
    },
    message: ({ growth }) => {
      const top = growth.serviceRanking[0];
      const pct = Math.round((top.count / growth.totalAppointments) * 100);
      return `${top.name} is ${pct}% of appointments`;
    },
  },

  // ── NEW ANALYTICS + FINANCIAL RULES (5) ─────────────────────────

  // Rule 31: Lab abnormal rate spike
  {
    id: 'analytics-lab-abnormal-spike',
    tab: 'analytics',
    target: 'LAB TESTS ORDERED',
    condition: ({ clinical }) => {
      if (!clinical?.labStatusDistribution?.length) return false;
      const abnormal = clinical.labStatusDistribution.find(s => s.name === 'Abnormal');
      const total = clinical.labTestsOrdered;
      return total > 5 && abnormal && (abnormal.value / total) > 0.3;
    },
    message: ({ clinical }) => {
      const abnormal = clinical.labStatusDistribution.find(s => s.name === 'Abnormal');
      const rate = Math.round((abnormal.value / clinical.labTestsOrdered) * 100);
      return `${rate}% abnormal rate — above typical 15-20%. Review flagged tests.`;
    },
  },

  // Rule 32: No-show weekday pattern
  {
    id: 'analytics-noshow-weekday',
    tab: 'analytics',
    target: 'NO-SHOW RATE',
    condition: ({ clinical }) => {
      if (!clinical?.noShowByWeekday) return false;
      const max = Math.max(...clinical.noShowByWeekday.map(d => d.count));
      return max >= 3;
    },
    message: ({ clinical }) => {
      const sorted = [...clinical.noShowByWeekday].sort((a, b) => b.count - a.count);
      return `${sorted[0].day} has the most no-shows (${sorted[0].count}). Consider overbooking.`;
    },
  },

  // Rule 33: Collection rate drop
  {
    id: 'financial-collection-rate',
    tab: 'financial',
    target: 'COLLECTION RATE',
    condition: ({ financial }) =>
      financial && financial.collectionRate < 85 && financial.transactionCount > 5,
    message: ({ financial }) =>
      `Collection rate ${financial.collectionRate}% — below 85% target. Check outstanding balances.`,
  },

  // Rule 34: Amendment rate quality signal
  {
    id: 'analytics-amendment-rate',
    tab: 'analytics',
    target: 'AMENDMENT RATE',
    condition: ({ clinical }) =>
      clinical && clinical.amendmentRate > 15 && clinical.recordsSigned > 10,
    message: ({ clinical }) =>
      `${clinical.amendmentRate}% of records amended — above 15%. May indicate documentation quality issues.`,
  },

  // Rule 35: Revenue forecast available
  {
    id: 'financial-revenue-forecast',
    tab: 'financial',
    target: 'REVENUE FORECAST',
    condition: ({ financial }) => financial && financial.upcomingRevenue > 0,
    message: ({ financial }) =>
      `₱${financial.upcomingRevenue.toLocaleString()} projected from ${financial.upcomingCount} upcoming appointments.`,
  },
];
