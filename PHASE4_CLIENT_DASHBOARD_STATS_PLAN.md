# T4.156 — Mobile ClientDashboard Statistics Redesign

## Overview

Add a comprehensive statistics section to the mobile ClientDashboard that gives pet owners at-a-glance data visibility into their visit history, pet health, and spending. The implementation delivers 12+ stats in a neubrutalist 2-column KPI grid with a mini 6-bar visit frequency chart, placed below the existing quick-actions grid. All stats are computed client-side from data already fetched by existing listeners (appointments, pets, medical_records) plus one additional one-shot `getDocs` for the `sales` collection. Zero npm installs required — the chart uses inline View bars with dynamic height.

**Key architectural decisions:**
- Extract a `useClientStats.js` hook that accepts pre-fetched data as parameters (no re-querying Firestore)
- Expand the existing appointment listener to fetch ALL statuses (not just active) for lifetime stats
- Use `useMemo` extensively for expensive date/frequency computations
- Chart: inline `<View>` elements with percentage-based heights (zero dependencies, ~30 LOC)
- All styling via `mobileTokens.js` tokens — zero inline hex colors

**Assumptions:**
- Pet docs have `dob` (Firestore Timestamp or string), `species` (string), `name` (string)
- Medical records have `vitals.weight` (or resolved via `resolveVitals`)
- Sales docs have `total` (number), `appointmentId` (string), `ownerId` (string)
- The `sales` collection allows `read: if isAuth()` (confirmed in firestore.rules line 177)

---

## Prerequisites

| Requirement | Status |
|---|---|
| `mobileTokens.js` tokens | Already exists at `VetConnect/src/theme/mobileTokens.js` |
| `resolveVitals` utility | Already exists at `VetConnect/src/utils/resolveVitals.js` |
| `calculateAge` helper | Already exists at `VetConnect/src/utils/helpers.js` (line 127) |
| `safeDate` helper | Already exists at `VetConnect/src/utils/helpers.js` (line 35) |
| Chart library | NOT needed — using inline View bars |
| Firestore sales read access | Confirmed: `allow read: if isAuth()` |

**No npm installs required.**

---

## Phase 1: Data Expansion — All-Status Appointment Listener

### Step 1.1 — Add `allAppointments` state + listener

**What:** Add a new state variable `allAppointments` and a new `onSnapshot` listener that fetches ALL appointments for the user (all statuses). The existing listener (line 290-343) only fetches active statuses. The stats need completed + no-show + cancelled for lifetime counts.

**Where:** `VetConnect/src/screens/ClientDashboard.js` — lines 55-66 (state), new useEffect after line 284.

**How:**
```javascript
// New state (add after line 65):
const [allAppointments, setAllAppointments] = useState([]);
const [salesData, setSalesData] = useState([]);

// New listener (add after the balance listener, ~line 284):
useEffect(() => {
  if (!auth.currentUser) return;
  const q = query(
    collection(db, 'appointments'),
    where('ownerId', '==', auth.currentUser.uid),
    orderBy('createdAt', 'desc'),
  );
  const unsub = onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setAllAppointments(list);
  }, (err) => {
    console.warn('[ClientDashboard] All appointments listener error:', err.message);
  });
  return () => unsub();
}, []);
```

**Why:** The stats engine needs completed appointments for visit counts, no-show appointments for the no-show stat, and all dates for frequency calculation. The existing listener only gets pending/confirmed/arrived/in-consult/confined/billing/dispensing/on-hold.

**Depends on:** Nothing.

**IMPORTANT NOTE:** This listener replaces the need for the T4.147 balance listener AND the existing active appointments listener. However, to minimize risk, we keep ALL existing listeners untouched and just ADD a new one. The `allAppointments` data is only consumed by the stats hook — existing UI continues to use `activeAppointments` and `computedBalance` from their dedicated listeners.

---

### Step 1.2 — Add `pets` state (expose pet data for stats)

**What:** The existing pet listener (line 432-460) fetches pets but only processes them for vaccine alerts. We need the raw pet array exposed for the stats hook. Add a `userPets` state variable populated by the existing pets onSnapshot callback.

**Where:** `VetConnect/src/screens/ClientDashboard.js` — state section + inside the existing pets onSnapshot callback.

**How:**
```javascript
// New state (add after allAppointments):
const [userPets, setUserPets] = useState([]);

// Inside the existing petsQuery onSnapshot callback (line 438-503), add at the start:
const petsArr = petsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
if (mounted) setUserPets(petsArr);
```

**Why:** The stats hook needs pet data (species, dob, weight) to compute pet overview stats. We piggyback on the existing listener instead of creating a new one.

**Depends on:** Nothing.

---

### Step 1.3 — One-shot sales query for spending stats

**What:** Add a one-shot `getDocs` query that fetches sales for the user's completed appointments. Uses the same chunked pattern as ClientAppointments.js (line 233-254). Only runs when `allAppointments` is populated.

**Where:** `VetConnect/src/screens/ClientDashboard.js` — new useEffect after the allAppointments listener.

**How:**
```javascript
useEffect(() => {
  if (!auth.currentUser || allAppointments.length === 0) return;
  let cancelled = false;

  const fetchSales = async () => {
    const completedIds = allAppointments
      .filter(a => a.status === 'completed')
      .map(a => a.id);
    if (completedIds.length === 0) { setSalesData([]); return; }

    // Firestore 'in' operator limit: 10 per query
    const chunks = [];
    for (let i = 0; i < completedIds.length; i += 10) {
      chunks.push(completedIds.slice(i, i + 10));
    }

    try {
      const results = [];
      for (const chunk of chunks) {
        const snap = await getDocs(
          query(collection(db, 'sales'), where('appointmentId', 'in', chunk))
        );
        snap.forEach(d => results.push({ id: d.id, ...d.data() }));
      }
      if (!cancelled) setSalesData(results);
    } catch (err) {
      console.warn('[ClientDashboard] Sales fetch error:', err.message);
    }
  };

  fetchSales();
  return () => { cancelled = true; };
}, [allAppointments]);
```

**Why:** Spending stats (total spent, average per visit) require the `total` field from sales docs. This is a one-shot getDocs (not a listener) because spending data changes infrequently and only after checkout. Uses the Firestore 'in' operator chunking pattern already established in ClientAppointments.js.

**Depends on:** Step 1.1.

---

### Step 1.4 — Expose medical records for weight trends

**What:** The existing vaccine alert useEffect (line 428-513) fetches medical_records per pet but only extracts vaccine data. We need the raw records available for weight trend computation. Add a `petRecords` state that collects all per-pet medical records.

**Where:** `VetConnect/src/screens/ClientDashboard.js` — state section + inside the existing vaccine alerts processing loop.

**How:**
```javascript
// New state:
const [petRecords, setPetRecords] = useState({}); // { [petId]: [...records] }

// Inside the petsQuery onSnapshot callback, alongside the vaccine alert processing,
// accumulate records per pet. Modify the for loop (line 445-499):
const recordsByPet = {};
for (const petDoc of petsSnap.docs) {
  const pet = { id: petDoc.id, ...petDoc.data() };
  try {
    const medSnap = await getDocs(
      query(collection(db, 'medical_records'), where('petId', '==', pet.id)),
    );
    recordsByPet[pet.id] = medSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    // ... existing vaccine alert processing continues using medSnap ...
  } catch (e) { /* existing error handling */ }
}
if (mounted) setPetRecords(recordsByPet);
```

**Why:** Weight trends require the most recent `vitals.weight` from each pet's medical records. The data is already being fetched — we just need to expose it.

**Depends on:** Nothing.

---

## Phase 2: useClientStats Hook

### Step 2.1 — Create the hook file

**What:** Create `VetConnect/src/hooks/useClientStats.js` — a pure computation hook that accepts pre-fetched data and returns a stats object. All expensive operations are wrapped in `useMemo`.

**Where:** New file: `VetConnect/src/hooks/useClientStats.js`

**How:**

```javascript
import { useMemo } from 'react';
import { resolveVitals } from '../utils/resolveVitals';

/**
 * Computes client dashboard statistics from pre-fetched Firestore data.
 * All computations are memoized — no Firestore queries inside this hook.
 *
 * @param {Object} params
 * @param {Array}  params.allAppointments - ALL user appointments (all statuses)
 * @param {Array}  params.userPets        - User's pet documents
 * @param {Object} params.petRecords      - { [petId]: [medical_record_docs] }
 * @param {Array}  params.salesData       - Sales docs for user's completed appointments
 * @param {Array}  params.vaccineAlerts   - Existing vaccine alert objects from ClientDashboard
 * @returns {Object} stats
 */
export function useClientStats({ allAppointments, userPets, petRecords, salesData, vaccineAlerts }) {

  // ─── VISIT STATS ─────────────────────────────────────────────────────────
  const visitStats = useMemo(() => {
    const now = new Date();
    const thisYear = now.getFullYear();

    const completed = allAppointments.filter(a => a.status === 'completed');
    const noShows = allAppointments.filter(a => a.status === 'no-show');

    const totalVisits = completed.length;
    const visitsThisYear = completed.filter(a => {
      const d = toDate(a.timeCompleted || a.scheduledDate);
      return d && d.getFullYear() === thisYear;
    }).length;

    // Last visit: most recent completed appointment date
    let lastVisitDate = null;
    let lastVisitRelative = 'No visits yet';
    if (completed.length > 0) {
      const sorted = [...completed].sort((a, b) => {
        const da = toDate(a.timeCompleted || a.scheduledDate);
        const db2 = toDate(b.timeCompleted || b.scheduledDate);
        return (db2?.getTime() || 0) - (da?.getTime() || 0);
      });
      lastVisitDate = toDate(sorted[0].timeCompleted || sorted[0].scheduledDate);
      lastVisitRelative = lastVisitDate ? formatTimeAgo(lastVisitDate) : 'Unknown';
    }

    // Next upcoming: earliest future confirmed/pending appointment
    let nextUpcoming = null;
    let nextUpcomingCountdown = null;
    const future = allAppointments.filter(a => {
      if (!['pending', 'confirmed'].includes(a.status)) return false;
      const d = toDate(a.scheduledDate);
      return d && d > now;
    }).sort((a, b) => {
      const da = toDate(a.scheduledDate);
      const db2 = toDate(b.scheduledDate);
      return (da?.getTime() || 0) - (db2?.getTime() || 0);
    });
    if (future.length > 0) {
      const nextDate = toDate(future[0].scheduledDate);
      nextUpcoming = future[0];
      if (nextDate) {
        const daysUntil = Math.ceil((nextDate - now) / 86400000);
        nextUpcomingCountdown = daysUntil === 0 ? 'Today'
          : daysUntil === 1 ? 'Tomorrow'
          : `in ${daysUntil} days`;
      }
    }

    // No-show count
    const noShowCount = noShows.length;

    // Average visit frequency: total visits / months since first visit
    let avgFrequency = null;
    if (completed.length >= 2) {
      const dates = completed
        .map(a => toDate(a.timeCompleted || a.scheduledDate))
        .filter(Boolean)
        .sort((a, b) => a.getTime() - b.getTime());
      if (dates.length >= 2) {
        const firstVisit = dates[0];
        const monthsSinceFirst = Math.max(1,
          (now.getFullYear() - firstVisit.getFullYear()) * 12 +
          (now.getMonth() - firstVisit.getMonth())
        );
        const weeksPerVisit = Math.round((monthsSinceFirst * 4.33) / completed.length);
        avgFrequency = weeksPerVisit <= 4 ? `every ${weeksPerVisit} week${weeksPerVisit !== 1 ? 's' : ''}`
          : `every ${Math.round(weeksPerVisit / 4.33)} month${Math.round(weeksPerVisit / 4.33) !== 1 ? 's' : ''}`;
      }
    }

    return {
      totalVisits,
      visitsThisYear,
      lastVisitRelative,
      nextUpcomingCountdown,
      nextUpcomingPetName: nextUpcoming?.petName || null,
      noShowCount,
      avgFrequency,
    };
  }, [allAppointments]);

  // ─── PET OVERVIEW ────────────────────────────────────────────────────────
  const petOverview = useMemo(() => {
    const now = new Date();

    // Species breakdown
    const speciesCount = {};
    userPets.forEach(p => {
      const s = (p.species || 'Unknown').toLowerCase();
      const normalized = s === 'canine' ? 'dog' : s === 'feline' ? 'cat' : s;
      speciesCount[normalized] = (speciesCount[normalized] || 0) + 1;
    });
    const petBreakdown = Object.entries(speciesCount)
      .map(([species, count]) => `${count} ${species}${count > 1 ? 's' : ''}`)
      .join(', ');

    // Vaccination compliance (from vaccineAlerts)
    let totalOverdue = 0;
    let totalDueSoon = 0;
    vaccineAlerts.forEach(alert => {
      totalOverdue += alert.overdue.length;
      totalDueSoon += alert.dueSoon.length;
    });
    // Compute simple compliance: pets with zero overdue / total pets
    const petsCompliant = userPets.length - vaccineAlerts.filter(a => a.overdue.length > 0).length;
    const vaccinationCompliance = userPets.length > 0
      ? { compliant: petsCompliant, total: userPets.length, pct: Math.round((petsCompliant / userPets.length) * 100) }
      : null;

    // Most urgent overdue alert
    let urgentAlert = null;
    if (vaccineAlerts.length > 0) {
      const withOverdue = vaccineAlerts.filter(a => a.overdue.length > 0);
      if (withOverdue.length > 0) {
        urgentAlert = `${withOverdue[0].petName}: ${withOverdue[0].overdue[0]} overdue`;
      }
    }

    // Weight trends: latest weight per pet with delta from previous
    const weightTrends = [];
    userPets.forEach(pet => {
      const records = petRecords[pet.id] || [];
      if (records.length === 0) return;

      // Sort by date descending
      const sorted = [...records]
        .map(r => ({ ...r, _date: toDate(r.createdAt || r.dateOfVisit) }))
        .filter(r => r._date)
        .sort((a, b) => b._date.getTime() - a._date.getTime());

      // Get latest weight via resolveVitals
      let latestWeight = null;
      let previousWeight = null;
      for (const rec of sorted) {
        const vitals = resolveVitals(rec);
        if (vitals.weight != null && vitals.weight !== '') {
          if (latestWeight === null) {
            latestWeight = parseFloat(vitals.weight);
          } else if (previousWeight === null) {
            previousWeight = parseFloat(vitals.weight);
            break;
          }
        }
      }

      if (latestWeight !== null) {
        const delta = previousWeight !== null ? latestWeight - previousWeight : null;
        weightTrends.push({
          petName: pet.name,
          weight: latestWeight,
          delta, // positive = gained, negative = lost, null = no previous
        });
      }
    });

    // Age milestones: pets turning 7+ this month (senior screening)
    const ageMilestones = [];
    userPets.forEach(pet => {
      if (!pet.dob) return;
      const dob = pet.dob?.toDate ? pet.dob.toDate()
        : typeof pet.dob === 'string' ? new Date(pet.dob)
        : pet.dob?.seconds ? new Date(pet.dob.seconds * 1000) : null;
      if (!dob || isNaN(dob.getTime())) return;

      const ageYears = now.getFullYear() - dob.getFullYear();
      const birthdayThisYear = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
      const isThisMonth = birthdayThisYear.getMonth() === now.getMonth()
        && birthdayThisYear.getFullYear() === now.getFullYear();

      if (isThisMonth && ageYears >= 7) {
        ageMilestones.push({
          petName: pet.name,
          age: ageYears,
          message: `${pet.name} turns ${ageYears} this month — senior screening recommended`,
        });
      }
    });

    return {
      petCount: userPets.length,
      petBreakdown,
      vaccinationCompliance,
      urgentAlert,
      weightTrends,
      ageMilestones,
    };
  }, [userPets, petRecords, vaccineAlerts]);

  // ─── FINANCIAL STATS ─────────────────────────────────────────────────────
  const financialStats = useMemo(() => {
    if (salesData.length === 0) return { totalSpent: 0, avgPerVisit: 0 };

    const totalSpent = salesData.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
    const avgPerVisit = salesData.length > 0 ? Math.round(totalSpent / salesData.length) : 0;

    return { totalSpent, avgPerVisit };
  }, [salesData]);

  // ─── MONTHLY VISIT DATA (last 6 months bar chart) ────────────────────────
  const monthlyVisitData = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        count: 0,
      });
    }

    const completed = allAppointments.filter(a => a.status === 'completed');
    completed.forEach(a => {
      const d = toDate(a.timeCompleted || a.scheduledDate);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = months.find(m => m.key === key);
      if (bucket) bucket.count++;
    });

    const maxCount = Math.max(...months.map(m => m.count), 1);
    return months.map(m => ({ ...m, pct: Math.round((m.count / maxCount) * 100) }));
  }, [allAppointments]);

  return {
    visitStats,
    petOverview,
    financialStats,
    monthlyVisitData,
  };
}

// ─── INTERNAL HELPERS ──────────────────────────────────────────────────────

/** Normalize Firestore timestamp to JS Date */
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

/** Format a date as relative time ago string */
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
```

**Why:** Extracting stats computation to a dedicated hook keeps ClientDashboard.js manageable. The hook is purely computational (no side effects, no Firestore calls) making it easy to test and reason about.

**Depends on:** Steps 1.1, 1.2, 1.3, 1.4.

---

## Phase 3: StatsSection UI Component

### Step 3.1 — Create the inline StatsSection within ClientDashboard

**What:** Add a `StatsSection` component rendered below the quick-actions grid. Contains: section header, 2-column KPI grid (8 cards), mini bar chart, weight trends row, and age milestones.

**Where:** `VetConnect/src/screens/ClientDashboard.js` — inline component definition (before the `return`) + rendered after the `grid` View (line 978).

**How:**

The stats section is rendered inside ClientDashboard's ScrollView, immediately after the closing `</View>` of the grid (line 978, before `</ScrollView>`). It is conditionally rendered only when `allAppointments.length > 0` (user has at least one appointment).

**Structure:**

```jsx
{/* --- STATISTICS SECTION --- */}
{!loading && allAppointments.length > 0 && (
  <View style={styles.statsSection}>
    <Text style={styles.statsSectionHeader}>YOUR STATS</Text>

    {/* 2-COLUMN KPI GRID */}
    <View style={styles.statsGrid}>
      {/* Card 1: Total Visits */}
      <KPICard label="TOTAL VISITS" value={visitStats.totalVisits} />

      {/* Card 2: Visits This Year */}
      <KPICard label="THIS YEAR" value={visitStats.visitsThisYear} />

      {/* Card 3: Last Visit */}
      <KPICard label="LAST VISIT" value={visitStats.lastVisitRelative} small />

      {/* Card 4: Next Upcoming */}
      <KPICard
        label="NEXT VISIT"
        value={visitStats.nextUpcomingCountdown || 'None scheduled'}
        small
      />

      {/* Card 5: No-Shows (red accent) */}
      {visitStats.noShowCount > 0 && (
        <KPICard label="NO-SHOWS" value={visitStats.noShowCount} accent="danger" />
      )}

      {/* Card 6: Visit Frequency */}
      {visitStats.avgFrequency && (
        <KPICard label="FREQUENCY" value={visitStats.avgFrequency} small />
      )}

      {/* Card 7: Pets */}
      <KPICard label="MY PETS" value={petOverview.petCount} subtitle={petOverview.petBreakdown} />

      {/* Card 8: Vaccination Compliance */}
      {petOverview.vaccinationCompliance && (
        <KPICard
          label="VACCINES"
          value={`${petOverview.vaccinationCompliance.pct}%`}
          subtitle={`${petOverview.vaccinationCompliance.compliant}/${petOverview.vaccinationCompliance.total} up to date`}
          accent={petOverview.vaccinationCompliance.pct >= 75 ? 'success' : petOverview.vaccinationCompliance.pct >= 50 ? 'warning' : 'danger'}
        />
      )}

      {/* Card 9: Total Spent */}
      {financialStats.totalSpent > 0 && (
        <KPICard
          label="TOTAL SPENT"
          value={`P${financialStats.totalSpent.toLocaleString()}`}
          subtitle={`P${financialStats.avgPerVisit}/visit avg`}
          wide
        />
      )}
    </View>

    {/* MINI BAR CHART: Visits per month, last 6 months */}
    <View style={styles.chartContainer}>
      <View style={styles.chartShadow} />
      <View style={styles.chartBox}>
        <Text style={styles.chartTitle}>VISITS PER MONTH</Text>
        <View style={styles.chartBars}>
          {monthlyVisitData.map(m => (
            <View key={m.key} style={styles.chartBarCol}>
              <View style={styles.chartBarTrack}>
                <View style={[styles.chartBarFill, { height: `${Math.max(m.pct, 4)}%` }]} />
              </View>
              <Text style={styles.chartBarLabel}>{m.label}</Text>
              {m.count > 0 && (
                <Text style={styles.chartBarCount}>{m.count}</Text>
              )}
            </View>
          ))}
        </View>
      </View>
    </View>

    {/* WEIGHT TRENDS */}
    {petOverview.weightTrends.length > 0 && (
      <View style={styles.trendsContainer}>
        <Text style={styles.trendsTitle}>WEIGHT TRENDS</Text>
        {petOverview.weightTrends.map(wt => (
          <View key={wt.petName} style={styles.trendRow}>
            <Text style={styles.trendPetName}>{wt.petName}</Text>
            <Text style={styles.trendWeight}>{wt.weight} kg</Text>
            {wt.delta !== null && (
              <Text style={[
                styles.trendDelta,
                { color: wt.delta > 0 ? COLORS.success : wt.delta < 0 ? COLORS.danger : COLORS.textMuted }
              ]}>
                {wt.delta > 0 ? `+${wt.delta.toFixed(1)}` : wt.delta.toFixed(1)} kg
              </Text>
            )}
          </View>
        ))}
      </View>
    )}

    {/* URGENT VACCINE ALERT */}
    {petOverview.urgentAlert && (
      <View style={styles.urgentAlertRow}>
        <MaterialIcons name="warning" size={14} color={COLORS.danger} />
        <Text style={styles.urgentAlertText}>{petOverview.urgentAlert}</Text>
      </View>
    )}

    {/* AGE MILESTONES */}
    {petOverview.ageMilestones.length > 0 && (
      <View style={styles.milestoneContainer}>
        {petOverview.ageMilestones.map(ms => (
          <View key={ms.petName} style={styles.milestoneRow}>
            <MaterialIcons name="cake" size={14} color={COLORS.sky} />
            <Text style={styles.milestoneText}>{ms.message}</Text>
          </View>
        ))}
      </View>
    )}
  </View>
)}
```

**Why:** Placing stats below quick actions keeps "Book Visit" above the fold (primary CTA). The 2-column grid maximizes information density without scroll fatigue.

**Depends on:** Step 2.1.

---

### Step 3.2 — KPICard inline sub-component

**What:** Define a `KPICard` functional component above the `ClientDashboard` component definition. It renders a neubrutalist card with number/value + label.

**Where:** `VetConnect/src/screens/ClientDashboard.js` — above the `const ClientDashboard` line (line 54).

**How:**

```jsx
function KPICard({ label, value, subtitle, accent, small, wide }) {
  const accentColor = accent === 'danger' ? COLORS.danger
    : accent === 'success' ? COLORS.success
    : accent === 'warning' ? COLORS.warning
    : COLORS.brand;

  return (
    <View style={[styles.kpiWrapper, wide && styles.kpiWrapperWide]}>
      <View style={[styles.kpiShadow, { backgroundColor: accentColor }]} />
      <View style={styles.kpiCard}>
        <Text style={[
          styles.kpiValue,
          small && styles.kpiValueSmall,
          accent && { color: accentColor },
        ]}>
          {value}
        </Text>
        <Text style={styles.kpiLabel}>{label}</Text>
        {subtitle && <Text style={styles.kpiSubtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}
```

**Why:** Reusable card component keeps the JSX readable. Accepts an `accent` prop for conditional color (no-show = danger red, vaccination = dynamic).

**Depends on:** Nothing (pure presentational).

---

### Step 3.3 — StyleSheet additions for stats section

**What:** Add all styles for the stats grid, KPI cards, bar chart, weight trends, and milestones to the existing `StyleSheet.create` block.

**Where:** `VetConnect/src/screens/ClientDashboard.js` — inside `const styles = StyleSheet.create({ ... })` (line 983-1272).

**How:**

```javascript
// STATS SECTION
statsSection: {
  marginTop: 10,
  marginBottom: 30,
},
statsSectionHeader: {
  fontFamily: FONTS.black,
  fontSize: 13,
  color: COLORS.accentLight,
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  marginBottom: 16,
},
statsGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  marginBottom: 20,
},

// KPI CARD
kpiWrapper: {
  width: '48%',
  marginBottom: 14,
  position: 'relative',
},
kpiWrapperWide: {
  width: '100%',
},
kpiShadow: {
  position: 'absolute',
  top: 4,
  left: 4,
  right: -4,
  bottom: -4,
  backgroundColor: COLORS.brand,
},
kpiCard: {
  backgroundColor: COLORS.white,
  borderWidth: 2,
  borderColor: COLORS.brand,
  borderRadius: 0,
  padding: 14,
  minHeight: 80,
  justifyContent: 'center',
},
kpiValue: {
  fontFamily: FONTS.black,
  fontSize: 28,
  color: COLORS.brand,
  lineHeight: 30,
},
kpiValueSmall: {
  fontSize: 16,
  lineHeight: 20,
},
kpiLabel: {
  fontFamily: FONTS.bold,
  fontSize: 11,
  color: COLORS.accentLight,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  marginTop: 4,
},
kpiSubtitle: {
  fontFamily: FONTS.regular,
  fontSize: 11,
  color: COLORS.textMuted,
  marginTop: 2,
},

// MINI BAR CHART
chartContainer: {
  position: 'relative',
  marginBottom: 20,
},
chartShadow: {
  position: 'absolute',
  top: 4,
  left: 4,
  right: -4,
  bottom: -4,
  backgroundColor: COLORS.brand,
},
chartBox: {
  backgroundColor: COLORS.white,
  borderWidth: 2,
  borderColor: COLORS.brand,
  borderRadius: 0,
  padding: 14,
},
chartTitle: {
  fontFamily: FONTS.bold,
  fontSize: 11,
  color: COLORS.accentLight,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  marginBottom: 12,
},
chartBars: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  height: 80,
},
chartBarCol: {
  flex: 1,
  alignItems: 'center',
  marginHorizontal: 3,
},
chartBarTrack: {
  width: '100%',
  height: 60,
  justifyContent: 'flex-end',
},
chartBarFill: {
  width: '100%',
  backgroundColor: COLORS.sky,
  borderWidth: 1,
  borderColor: COLORS.brand,
  borderRadius: 0,
  minHeight: 3,
},
chartBarLabel: {
  fontFamily: FONTS.bold,
  fontSize: 10,
  color: COLORS.accentLight,
  textTransform: 'uppercase',
  marginTop: 4,
},
chartBarCount: {
  fontFamily: FONTS.black,
  fontSize: 10,
  color: COLORS.brand,
  position: 'absolute',
  top: -2,
},

// WEIGHT TRENDS
trendsContainer: {
  marginBottom: 16,
},
trendsTitle: {
  fontFamily: FONTS.bold,
  fontSize: 11,
  color: COLORS.accentLight,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  marginBottom: 8,
},
trendRow: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingVertical: 6,
  borderBottomWidth: 1,
  borderBottomColor: COLORS.borderLight,
},
trendPetName: {
  fontFamily: FONTS.bold,
  fontSize: 13,
  color: COLORS.brand,
  flex: 1,
},
trendWeight: {
  fontFamily: FONTS.black,
  fontSize: 14,
  color: COLORS.brand,
  marginRight: 8,
},
trendDelta: {
  fontFamily: FONTS.bold,
  fontSize: 12,
},

// URGENT ALERT
urgentAlertRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  marginBottom: 12,
  paddingVertical: 8,
  paddingHorizontal: 10,
  backgroundColor: '#FFEBEE',
  borderWidth: 1,
  borderColor: COLORS.danger,
  borderRadius: 0,
},
urgentAlertText: {
  fontFamily: FONTS.bold,
  fontSize: 12,
  color: COLORS.danger,
  flex: 1,
},

// AGE MILESTONES
milestoneContainer: {
  marginBottom: 12,
},
milestoneRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  paddingVertical: 6,
},
milestoneText: {
  fontFamily: FONTS.regular,
  fontSize: 12,
  color: COLORS.textSecondary,
  flex: 1,
},
```

**Why:** Neubrutalism adherence: zero borderRadius, solid offset shadows (4px), Espresso borders (2px), uppercase labels with letter-spacing, FONTS.black for values, FONTS.bold for labels.

**Depends on:** Nothing (style definitions are independent).

---

## Phase 4: Integration Wiring

### Step 4.1 — Wire the hook into ClientDashboard

**What:** Import and call `useClientStats` inside the `ClientDashboard` component, passing the state variables from Phase 1.

**Where:** `VetConnect/src/screens/ClientDashboard.js` — imports section (line 4) + after all state declarations.

**How:**

```javascript
// Add import (line ~4 area):
import { useClientStats } from '../hooks/useClientStats';

// After all state declarations and before the first useEffect:
const { visitStats, petOverview, financialStats, monthlyVisitData } = useClientStats({
  allAppointments,
  userPets,
  petRecords,
  salesData,
  vaccineAlerts,
});
```

**Why:** Single integration point. The hook returns all computed values needed by the UI.

**Depends on:** Steps 1.1, 1.2, 1.3, 1.4, 2.1.

---

### Step 4.2 — Add FONTS import to existing import line

**What:** The current imports from `mobileTokens` only import `COLORS, FONTS` (line 32). Verify `FONTS` is already imported. It is: `import { COLORS, FONTS } from "../theme/mobileTokens";` (line 32). No change needed.

**Where:** `VetConnect/src/screens/ClientDashboard.js` line 32.

**How:** Already imported. No action.

**Depends on:** Nothing.

---

## Verification Checkpoints

### After Phase 1 (Data Layer)
- [ ] `allAppointments` state populates with ALL user appointments (check console.log length)
- [ ] `userPets` state populates with pet objects including `species`, `dob`, `name`
- [ ] `petRecords` state populates as `{ petId: [records] }` with vitals data
- [ ] `salesData` state populates with sales objects containing `total` field
- [ ] Existing UI (active appointments, balance banner, vaccine alerts) still works unchanged
- [ ] No new Firestore index errors in console

### After Phase 2 (Hook)
- [ ] `useClientStats` returns all expected fields without crashing
- [ ] `visitStats.totalVisits` matches the number of completed appointments
- [ ] `visitStats.lastVisitRelative` shows human-readable "X weeks ago"
- [ ] `monthlyVisitData` has exactly 6 entries with `pct` values 0-100
- [ ] Edge case: user with 0 appointments returns safe defaults (no crash)

### After Phase 3 (UI)
- [ ] Stats section appears below the quick-actions grid
- [ ] KPI cards display in 2-column layout with neubrutalist shadows
- [ ] Bar chart shows 6 month labels with sky-blue bars
- [ ] No-show card only appears if count > 0, with red accent
- [ ] Weight trends show delta arrows (green for gain, red for loss)
- [ ] Spending card shows currency formatted with peso sign

### After Phase 4 (Integration)
- [ ] Full flow: login -> dashboard loads -> stats appear after brief delay
- [ ] Performance: no visible lag (useMemo prevents recomputation on unrelated re-renders)
- [ ] Scroll behavior: Book Visit remains visible without scrolling (above fold)
- [ ] Edge case: new user with 0 appointments sees no stats section (conditional render)

---

## Stat-by-Stat Specification

| # | Stat | Data Source | Computation | Display Format | Done When |
|---|---|---|---|---|---|
| 1 | Total visits (lifetime) | `allAppointments` where `status === 'completed'` | `.filter().length` | Integer (e.g., "23") | KPI card shows correct count matching Firestore |
| 2 | Visits this year | `allAppointments` completed + `timeCompleted` year match | `.filter(yearMatch).length` | Integer (e.g., "7") | Only counts current calendar year |
| 3 | Last visit date | Most recent completed appointment's `timeCompleted` | Sort desc, take [0], `formatTimeAgo()` | Relative string ("3 weeks ago") | Shows human-readable relative time |
| 4 | Next upcoming | Earliest future `pending`/`confirmed` appointment | Filter + sort asc by `scheduledDate` | Countdown string ("in 5 days") | Shows countdown; "None scheduled" if empty |
| 5 | No-show count | `allAppointments` where `status === 'no-show'` | `.filter().length` | Integer with red accent | Red card, only visible if > 0 |
| 6 | Avg visit frequency | Months since first visit / total visits | `(monthsSince * 4.33) / totalVisits` | String ("every 6 weeks") | Only shown if >= 2 completed visits |
| 7 | Pet count + breakdown | `userPets` | Group by `species` | "3" with subtitle "2 dogs, 1 cat" | Matches actual pet count in Firestore |
| 8 | Vaccination compliance | `vaccineAlerts` (existing) | Pets without overdue / total pets | "67%" with "2/3 up to date" | Percentage matches vaccine alert data |
| 9 | Overdue alert | `vaccineAlerts[0].overdue[0]` | First pet's first overdue vaccine | "Yoko: Rabies overdue" | Red inline alert below grid |
| 10 | Weight trends | `petRecords` via `resolveVitals` | Latest weight - previous weight per pet | "12.5 kg +2.1 kg" with color | Delta shows signed number, green/red |
| 11 | Age milestones | `userPets` where DOB month === current month AND age >= 7 | Birthday month match + age calc | "Cynthia turns 7 this month -- senior..." | Only shows for pets with upcoming senior birthday |
| 12 | Total spent + avg | `salesData` | `sum(total)` and `totalSpent / salesData.length` | "P12,450" + "P850/visit avg" | Full-width card at bottom of grid |
| 13 | Monthly visits chart | `allAppointments` completed bucketed by month | Group by YYYY-MM, count, normalize to % | 6 sky-blue bars with month labels | Bar heights proportional to count |

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Performance: extra `onSnapshot` for all appointments | Medium | The listener is identical to existing ones — Firestore SDK handles this efficiently. The stats `useMemo` prevents expensive recomputation. |
| Sales query on large accounts (30+ visits) | Low | Chunked at 10 IDs per query. Max ~3-4 round trips for even heavy users. One-shot (not listener). |
| Empty state crash | Low | All useMemo blocks guard against empty arrays. UI conditionally renders only when `allAppointments.length > 0`. |
| Firestore index missing | Medium | The `allAppointments` query uses `ownerId` + `createdAt` desc — same index as existing active appointments query (which uses `ownerId` + different status filter). The sales query uses `appointmentId` in operator — no composite index needed. |
| Layout shift on slow data load | Low | Stats section only renders after `allAppointments` populates. No layout shift — section appears atomically. |
| Stale weight data | Low | Weight comes from medical_records which are already fetched for vaccine alerts. Real-time via the existing pets onSnapshot cascade. |

---

## Performance Considerations

1. **No additional Firestore indexes required** — the `allAppointments` query (`ownerId == X`, `orderBy createdAt desc`) uses the same composite index as the existing active appointments listener.
2. **Sales query is one-shot** (getDocs, not onSnapshot) — runs once on mount, not continuously.
3. **All stat computations are memoized** — React only recomputes when input arrays change.
4. **Bar chart uses native View elements** — zero JavaScript animation overhead, zero external library.
5. **Conditional rendering** — stats section not rendered during loading or for users with 0 appointments.

---

## External Dependencies

**None.** Zero npm installs required.

- Chart: inline `<View>` bars with dynamic height (percentage-based)
- Date formatting: custom `formatTimeAgo()` inside the hook
- Vitals resolution: existing `resolveVitals.js` utility
- All styling: existing `mobileTokens.js` tokens

---

## File Summary

| File | Action | Lines Changed (est.) |
|---|---|---|
| `VetConnect/src/hooks/useClientStats.js` | CREATE | ~200 lines |
| `VetConnect/src/screens/ClientDashboard.js` | MODIFY | ~300 lines added (state, listeners, UI, styles) |

**Total new code:** ~500 lines across 2 files.

---

## Estimated Effort

| Phase | Effort | Notes |
|---|---|---|
| Phase 1: Data expansion | 30 min | 4 small additions to existing listeners |
| Phase 2: useClientStats hook | 1 hr | Core computation logic, 13 stat computations |
| Phase 3: StatsSection UI | 1.5 hrs | KPI grid, bar chart, weight trends, styles |
| Phase 4: Integration wiring | 15 min | Import + call hook + render section |
| **Total** | **~3.5 hrs** | Single developer, single session |
