# T4.155 — PetHistoryScreen Full Redesign

## Overview

Full redesign of `VetConnect/src/screens/PetHistoryScreen.js` (~3230 lines) to transform it from an endless-scroll expanded-record list into a navigable, neubrutalist timeline with collapsible records, month-picker + dot-timeline navigation, a top health-snapshot strip, and 7 display-gap fixes (prognosis, diagnosis notes, diagnoses expansion, recheckIn, lab notes, lab attachments, admin nextVisit). The admin-side `PatientDashboard.jsx` also receives 3 gap fixes. All styling converts to strict mobileTokens.js usage — zero inline hex colors, zero borderRadius, solid offset shadows, Espresso borders.

**Key architectural decisions:**
- `LayoutAnimation` from `react-native` (built-in, no extra dependency) for expand/collapse animation
- `onViewableItemsChanged` + `useRef` for scroll-sync between month picker, dot timeline, and FlatList
- Fixed 60px collapsed-record height enables `getItemLayout` optimization for 50+ record lists
- Collapsible "Pet Health Snapshot" strip replaces the old `listHeader` approach (vitals + meds + vax bar)
- The existing `listHeader` cards (VITALS TRENDS, MEDICATIONS, VACCINATION STATUS, LAB RESULTS) remain below the snapshot as separate collapsible sections

**Assumptions:**
- `LayoutAnimation` works on both iOS and Android with Expo 54 (Hermes engine enables it by default)
- No npm installs needed — `react-native-reanimated` v4.1.1 is already in `package.json` but LayoutAnimation from core RN is sufficient
- Medical records are already sorted newest-first from Firestore (`orderBy("date", "desc")`)
- Fields `soap.prognosis`, `diagnoses[].notes`, `dischargeSummary.recheckIn` exist in Firestore documents (written by ClinicalWorkspace) but are not currently displayed on mobile

---

## Prerequisites

| Requirement | Status |
|---|---|
| `react-native-reanimated` ~4.1.1 | Already installed |
| `LayoutAnimation` from `react-native` | Built-in, no install |
| `mobileTokens.js` exports: `COLORS`, `FONTS`, `TYPE`, `SHADOW`, `SPACING`, `INPUT`, `BUTTON`, `FORM_BOX` | All available |
| `resolveVitals.js` utility | Available at `VetConnect/src/utils/resolveVitals.js` |
| `vaccineHelpers.js` (fetchVaccineCatalog, buildVaccinationStatus) | Available |
| `VaccinationStatusCard.js` | Available for data reference |

**New mobileTokens.js addition needed (Day 1, Step 1):**
```js
// Add to SHADOW object:
record: {
  position: 'absolute',
  top: 3,
  left: 3,
  right: -3,
  bottom: -3,
  backgroundColor: COLORS.brand,
},
```

---

## Day 1 (~3 hrs): Structure + Navigation + Neubrutalism Styling

### Goal
Convert PetHistoryScreen from an always-expanded record list to a collapsible-card timeline with month-picker navigation, dot timeline, and full neubrutalism restyling.

---

### Step 1.1 — Add `SHADOW.record` token to mobileTokens.js

**What:** Add a 3px offset shadow preset for record cards (smaller than `SHADOW.card` which is 4px).

**Where:** `VetConnect/src/theme/mobileTokens.js` — add inside the `SHADOW` export object (after the existing `card` entry at line 169).

**How:**
```js
/** Record card shadow: +3px offset, brand espresso */
record: {
  position: 'absolute',
  top: 3,
  left: 3,
  right: -3,
  bottom: -3,
  backgroundColor: COLORS.brand,
},
```

**Why:** The plan specifies 3px offset for record cards. mobileTokens is the single source of truth — no inline shadow values.

**Depends on:** Nothing.

**Done when:** `import { SHADOW } from '../theme/mobileTokens'` and `SHADOW.record` resolves without error.

---

### Step 1.2 — Add expand/collapse state management

**What:** Add state for tracking which records are expanded, plus the "expand all" toggle.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — inside the component function, near existing state declarations (~line 517-535).

**How:**
```js
import { LayoutAnimation, UIManager, Platform, ... } from 'react-native';

// Enable LayoutAnimation on Android (required)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Inside component:
const [expandedIds, setExpandedIds] = useState(new Set());
const [allExpanded, setAllExpanded] = useState(false);

// Auto-expand latest record when history loads
useEffect(() => {
  if (filteredHistory.length > 0 && expandedIds.size === 0 && !allExpanded) {
    setExpandedIds(new Set([filteredHistory[0].id]));
  }
}, [filteredHistory]);

const toggleRecord = (id) => {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  setExpandedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};

const toggleAll = () => {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  if (allExpanded) {
    // Collapse all except latest
    setExpandedIds(new Set(filteredHistory.length > 0 ? [filteredHistory[0].id] : []));
    setAllExpanded(false);
  } else {
    setExpandedIds(new Set(filteredHistory.map(r => r.id)));
    setAllExpanded(true);
  }
};
```

**Why:** Decision 1 specifies latest expanded, older collapsed, with a toggle-all button.

**Depends on:** Step 1.1 (needs SHADOW.record for card styling in Step 1.4).

**Done when:** State toggles work — tapping a collapsed record expands it with animation.

---

### Step 1.3 — Month picker horizontal ScrollView

**What:** Add a horizontal scrollable strip of month chips above the FlatList. Active month = Sky Blue background. Tapping a month scrolls the FlatList to the first record in that month.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — new section rendered between the search bar and the FlatList container (between lines 2074 and 2076). Also add a `flatListRef` and month-computation logic.

**How:**
```js
// Ref for FlatList scroll control
const flatListRef = useRef(null);
const monthPickerRef = useRef(null);

// Derive unique months from filteredHistory (ordered newest-first)
const months = useMemo(() => {
  const seen = new Map(); // 'YYYY-MM' -> { key, label, firstIndex }
  filteredHistory.forEach((r, idx) => {
    const d = r.date?.toDate ? r.date.toDate()
      : r.date?.seconds ? new Date(r.date.seconds * 1000)
      : null;
    if (!d) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!seen.has(key)) {
      seen.set(key, {
        key,
        label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        firstIndex: idx,
      });
    }
  });
  return Array.from(seen.values());
}, [filteredHistory]);

// Active month state (auto-updates on scroll)
const [activeMonth, setActiveMonth] = useState(months[0]?.key || '');

const scrollToMonth = (monthKey, firstIndex) => {
  setActiveMonth(monthKey);
  flatListRef.current?.scrollToIndex({ index: firstIndex, animated: true, viewOffset: 50 });
};
```

**Render (between search bar and FlatList):**
```jsx
{months.length > 1 && (
  <ScrollView
    ref={monthPickerRef}
    horizontal
    showsHorizontalScrollIndicator={false}
    style={styles.monthPickerStrip}
    contentContainerStyle={styles.monthPickerContent}
  >
    {months.map(m => (
      <TouchableOpacity
        key={m.key}
        style={[styles.monthChip, activeMonth === m.key && styles.monthChipActive]}
        onPress={() => scrollToMonth(m.key, m.firstIndex)}
      >
        <Text style={[styles.monthChipText, activeMonth === m.key && styles.monthChipTextActive]}>
          {m.label}
        </Text>
      </TouchableOpacity>
    ))}
  </ScrollView>
)}
```

**Styles:**
```js
monthPickerStrip: {
  backgroundColor: COLORS.cream,
  borderBottomWidth: 2,
  borderBottomColor: COLORS.border,
  paddingVertical: 10,
},
monthPickerContent: {
  paddingHorizontal: SPACING.screenPadding,
  gap: 8,
},
monthChip: {
  paddingHorizontal: 14,
  paddingVertical: 6,
  borderWidth: 2,
  borderColor: COLORS.border,
  borderRadius: 0,
  backgroundColor: COLORS.white,
},
monthChipActive: {
  backgroundColor: COLORS.sky,
  borderColor: COLORS.brand,
},
monthChipText: {
  fontSize: 12,
  fontWeight: '900',
  color: COLORS.accent,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
},
monthChipTextActive: {
  color: COLORS.brand,
},
```

**Why:** Decision 2 specifies horizontal month chips with Sky Blue active state, tap-to-scroll.

**Depends on:** Step 1.2 (needs `filteredHistory` and state).

**Done when:** Month chips appear, tapping one scrolls to the correct record group.

---

### Step 1.4 — Dot timeline on left edge

**What:** Replace the existing `timelineGraphic` (16px dots, 2px grey line) with a thin 3px Sky Blue vertical line and 8px dots (12px + ring for expanded/active).

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — modify `renderRecord` and update styles for `timelineRow`, `timelineGraphic`, `dot`, `line`.

**How:**
- The left-edge timeline column shrinks from 30px to 20px
- Line becomes 3px wide, Sky Blue colored
- Dot: 8px default, Sky Blue fill. Active (expanded) dot: 12px, white center with Sky Blue ring.
- Tap on dot triggers `toggleRecord(item.id)`

```jsx
// Inside renderRecord, replace the timelineGraphic block:
<View style={styles.timelineGraphic}>
  <TouchableOpacity onPress={() => toggleRecord(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
    <View style={[
      styles.dot,
      expandedIds.has(item.id) ? styles.dotActive : styles.dotDefault,
    ]} />
  </TouchableOpacity>
  <View style={styles.line} />
</View>
```

**Updated styles:**
```js
timelineRow: { flexDirection: 'row', marginBottom: 16 },
timelineGraphic: { width: 20, alignItems: 'center' },
dot: {
  zIndex: 2,
  marginTop: 18,
},
dotDefault: {
  width: 8,
  height: 8,
  backgroundColor: COLORS.sky,
  borderRadius: 4,  // Exception: dots are circles by convention
},
dotActive: {
  width: 12,
  height: 12,
  backgroundColor: COLORS.white,
  borderWidth: 3,
  borderColor: COLORS.sky,
  borderRadius: 6,  // Exception: dots are circles
},
line: {
  position: 'absolute',
  top: 0,
  bottom: -16,
  left: 9,  // centered in 20px column
  width: 3,
  backgroundColor: COLORS.sky,
  zIndex: 1,
},
```

**Why:** Decision 2 specifies 3px Sky Blue line, 8px dots (12px + ring for active). Dots are circular (explicit exception to zero-borderRadius rule — circles are the timeline convention).

**Depends on:** Step 1.2 (needs `expandedIds` and `toggleRecord`).

**Done when:** Thin Sky Blue line with dots renders on the left; active dot has ring; tapping dot toggles record.

---

### Step 1.5 — Collapsible record card rendering

**What:** Split `renderRecord` into a collapsed header (always visible, ~60px) and an expanded body (only when `expandedIds.has(item.id)`).

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — refactor the `renderRecord` function (lines 1362-2017).

**How:**

The collapsed header shows one row: `[date] [diagnosis] [status pill] [vet name]`

```jsx
const renderRecord = ({ item, index }) => {
  const isExpanded = allExpanded || expandedIds.has(item.id);
  const visitDate = formatDisplayDate(item.date);
  const isGrooming = item.recordType === 'grooming' || item.serviceType?.toLowerCase().includes('grooming');
  const diagnosisLabel = item.diagnoses?.[0]?.name || item.diagnosis || (isGrooming ? 'Grooming' : 'Consultation');
  const statusColors = getStatusColors(item.patientStatus);

  // Year header logic (unchanged)
  const recDate = resolveDate(item.date);
  const recYear = recDate?.getFullYear();
  const prevItem = filteredHistory[index - 1];
  const prevDate = prevItem ? resolveDate(prevItem.date) : null;
  const prevYear = prevDate?.getFullYear();
  const showYearHeader = index === 0 || recYear !== prevYear;

  return (
    <>
      {showYearHeader && recYear && (
        <View style={styles.yearHeader}>
          <View style={styles.yearLine} />
          <Text style={styles.yearText}>{recYear}</Text>
          <View style={styles.yearLine} />
        </View>
      )}
      <View style={styles.timelineRow}>
        {/* Dot timeline */}
        <View style={styles.timelineGraphic}>
          <TouchableOpacity onPress={() => toggleRecord(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <View style={[styles.dot, isExpanded ? styles.dotActive : styles.dotDefault]} />
          </TouchableOpacity>
          <View style={styles.line} />
        </View>

        {/* Record card */}
        <View style={styles.recordCardWrapper}>
          <View style={styles.recordCardShadow} />
          <TouchableOpacity
            style={styles.recordCard}
            onPress={() => toggleRecord(item.id)}
            activeOpacity={0.9}
          >
            {/* COLLAPSED HEADER — always visible */}
            <View style={styles.collapsedHeader}>
              <Text style={styles.collapsedDate}>{visitDate}</Text>
              <Text style={styles.collapsedDiagnosis} numberOfLines={1}>{diagnosisLabel}</Text>
              {item.patientStatus && !isGrooming && (
                <View style={[styles.collapsedStatusPill, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
                  <Text style={[styles.collapsedStatusText, { color: statusColors.text }]}>
                    {item.patientStatus.toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.collapsedVet} numberOfLines={1}>{item.vetName || 'Staff'}</Text>
              <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={18} color={COLORS.accent} />
            </View>

            {/* EXPANDED BODY */}
            {isExpanded && (
              <View style={styles.cardBody}>
                {/* ... existing expanded content (intake, diagnosis, vitals, etc.) ... */}
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
};
```

**New/updated styles:**
```js
recordCardWrapper: {
  flex: 1,
  position: 'relative',
},
recordCardShadow: {
  ...SHADOW.record,  // 3px offset
},
recordCard: {
  backgroundColor: COLORS.white,
  borderWidth: 2,
  borderColor: COLORS.border,
  borderRadius: 0,
  overflow: 'hidden',
},
collapsedHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 12,
  paddingVertical: 10,
  minHeight: 50,
  gap: 8,
},
collapsedDate: {
  fontSize: 12,
  fontWeight: '900',
  color: COLORS.accent,
  letterSpacing: 0.5,
  minWidth: 60,
},
collapsedDiagnosis: {
  flex: 1,
  fontSize: 13,
  fontWeight: '700',
  color: COLORS.brand,
},
collapsedStatusPill: {
  paddingHorizontal: 6,
  paddingVertical: 2,
  borderWidth: 1,
  borderRadius: 0,
},
collapsedStatusText: {
  fontSize: 9,
  fontWeight: '900',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
},
collapsedVet: {
  fontSize: 11,
  fontWeight: '700',
  color: COLORS.textMuted,
  maxWidth: 70,
},
```

**Why:** Decision 1 — collapsed state = date + diagnosis + status pill + vet name in one ~60px row. Tap anywhere to expand.

**Depends on:** Steps 1.2, 1.4.

**Done when:** Latest record expanded by default, older records show compact one-line header. Tap toggles.

---

### Step 1.6 — Expand All / Collapse All toggle + record count badge

**What:** Add a toggle button in the search/filter area (between search input and filter chips) showing "Expand All" or "Collapse All", plus a record count badge.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — in the `searchFilterBar` section (after the search input wrapper, before filter chips, around line 2050).

**How:**
```jsx
{/* Between search input and filter chips: */}
<View style={styles.searchActionsRow}>
  <Text style={styles.recordCountBadge}>
    {filteredHistory.length} RECORD{filteredHistory.length !== 1 ? 'S' : ''}
  </Text>
  <TouchableOpacity style={styles.expandAllBtn} onPress={toggleAll}>
    <MaterialIcons name={allExpanded ? 'unfold-less' : 'unfold-more'} size={16} color={COLORS.accent} />
    <Text style={styles.expandAllText}>{allExpanded ? 'COLLAPSE ALL' : 'EXPAND ALL'}</Text>
  </TouchableOpacity>
</View>
```

**Styles:**
```js
searchActionsRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
},
recordCountBadge: {
  fontSize: 11,
  fontWeight: '900',
  color: COLORS.textMuted,
  letterSpacing: 1,
},
expandAllBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  paddingHorizontal: 10,
  paddingVertical: 5,
  borderWidth: 2,
  borderColor: COLORS.border,
  borderRadius: 0,
  backgroundColor: COLORS.white,
},
expandAllText: {
  fontSize: 10,
  fontWeight: '900',
  color: COLORS.accent,
  letterSpacing: 0.5,
},
```

**Why:** Decision 1 requires expand/collapse all toggle. Record count badge is specified in the task.

**Depends on:** Steps 1.2, 1.5.

**Done when:** Button appears, toggles all records expanded/collapsed with animation.

---

### Step 1.7 — Scroll sync (month picker auto-highlights on scroll)

**What:** Use `onViewableItemsChanged` on the FlatList to track which records are visible and update `activeMonth` accordingly.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — add to FlatList props.

**How:**
```js
// Outside component or with useRef:
const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 30 }).current;

const onViewableItemsChanged = useRef(({ viewableItems }) => {
  if (!viewableItems || viewableItems.length === 0) return;
  const firstVisible = viewableItems[0]?.item;
  if (!firstVisible) return;
  const d = firstVisible.date?.toDate ? firstVisible.date.toDate()
    : firstVisible.date?.seconds ? new Date(firstVisible.date.seconds * 1000)
    : null;
  if (!d) return;
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  setActiveMonth(key);
}).current;

// FlatList props:
<FlatList
  ref={flatListRef}
  ...
  onViewableItemsChanged={onViewableItemsChanged}
  viewabilityConfig={viewabilityConfig}
  onScrollToIndexFailed={(info) => {
    // Fallback: scroll to closest available offset
    flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
  }}
/>
```

**Why:** Decision 2 specifies auto-highlight as user scrolls. `onViewableItemsChanged` avoids per-frame re-renders.

**Depends on:** Steps 1.3, 1.5.

**Done when:** Scrolling the FlatList updates the highlighted month chip in the picker without jank.

---

### Step 1.8 — Full neubrutalism conversion of ALL existing styles

**What:** Convert every remaining non-neubrutalist style in the StyleSheet to follow the design system: zero borderRadius, Espresso borders, mobileTokens colors only, uppercase headers with letter-spacing, solid offset shadows on interactive elements.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — the `styles = StyleSheet.create({...})` block (lines 2221-3230).

**Key conversions:**

| Old pattern | New pattern |
|---|---|
| `borderRadius: 16` / `12` / `20` / `10` / `8` | `borderRadius: 0` |
| `shadowColor/shadowOffset/shadowOpacity/elevation` (blur shadows) | Remove; use `SHADOW.record` sibling View |
| `backgroundColor: '#FAFAFA'` / `'#F5F5F5'` etc. | `COLORS.cream` or `COLORS.white` |
| `borderColor: '#E0E0E0'` / `'#EEEEEE'` / `'rgba(0,0,0,0.05)'` | `COLORS.borderLight` or `COLORS.border` |
| `color: '#9E9E9E'` / `'#333333'` etc. | Use appropriate `COLORS.*` token |
| `backgroundColor: "rgba(255,255,255,0.9)"` on recordCard | `COLORS.white` |
| `container: { backgroundColor: "#FAFAFA" }` | `COLORS.cream` |
| Header `backBtn` borderRadius 20 | `borderRadius: 0`, add solid border |
| `vetBadge` borderRadius 12 | `borderRadius: 0`, change to `borderWidth: 2, borderColor: COLORS.border` |
| `dischargeCard` borderRadius 16 | `borderRadius: 0` |
| `vaccineCard` cell borderRadius 8 | `borderRadius: 0` |
| `planBox` borderRadius 12 | `borderRadius: 0` |
| `vitalsBox` borderRadius 12 | `borderRadius: 0` |
| `pdfBtn` borderRadius 12 | `borderRadius: 0`, add press-snap |
| `dischargeCallBtn/dischargeFollowUpBtn` borderRadius 12 | `borderRadius: 0`, 2px border |
| Discharge `dischargeMedRow` borderRadius 10 | `borderRadius: 0` |
| `dischargeNextVisit` borderRadius 12 | `borderRadius: 0` |
| `dischargeStatusPill` borderRadius 10 | `borderRadius: 0` |

**Rules:**
- ALL `borderRadius` values become `0` except timeline dots (explicit exception)
- ALL color hex values replaced with `COLORS.*` references
- ALL `shadowColor/shadowOffset/shadowOpacity/shadowRadius/elevation` replaced with solid offset shadow sibling Views (only on major interactive elements like the record card — not every sub-element)
- Import `SHADOW, SPACING, TYPE, FONTS` from mobileTokens if not already imported

**Why:** Decision 4 — strict neubrutalism. Zero inline hex values except mobileTokens references.

**Depends on:** Steps 1.1-1.5.

**Done when:** `grep -n 'borderRadius: [^0]' PetHistoryScreen.js` returns only the dot styles. `grep -n '#[0-9A-Fa-f]\{6\}' PetHistoryScreen.js` returns only lines referencing the `COLORS.*` import or the vaccination passport HTML template (which is self-contained and doesn't render in RN).

---

### Step 1.9 — FlatList getItemLayout optimization

**What:** Provide `getItemLayout` for collapsed records (fixed height) to enable instant `scrollToIndex` and improve virtualization.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — FlatList props.

**How:**
```js
// Collapsed height (header row) + margin
const COLLAPSED_HEIGHT = 50 + 16; // 50px header + 16px marginBottom
// Cannot use getItemLayout when items have variable height (expanded vs collapsed)
// Instead, rely on scrollToIndex with onScrollToIndexFailed fallback (already in Step 1.7)
// For performance: use initialNumToRender, maxToRenderPerBatch, windowSize
<FlatList
  ref={flatListRef}
  data={filteredHistory}
  keyExtractor={(item) => item.id}
  renderItem={renderRecord}
  initialNumToRender={15}
  maxToRenderPerBatch={10}
  windowSize={7}
  removeClippedSubviews={Platform.OS === 'android'}
  ...
/>
```

**Note:** Since records have variable height (expanded vs collapsed), we cannot use a static `getItemLayout`. Instead we optimize with `initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, and `removeClippedSubviews`.

**Why:** Performance requirement for 50+ records.

**Depends on:** Step 1.5.

**Done when:** FlatList renders smoothly with 50+ records; no jank on fast scroll.

---

### Verification Checkpoint — Day 1

1. App launches without errors on PetHistoryScreen
2. Latest record expanded, older records collapsed to one-line headers
3. Tap on collapsed header or dot expands record with smooth animation
4. Month picker shows correct months; tapping scrolls to first record in that month
5. Scrolling auto-highlights the correct month chip
6. Expand All / Collapse All button works
7. ALL cards, chips, pills, buttons have `borderRadius: 0`
8. Cards have solid 3px Espresso offset shadow
9. All colors reference `COLORS.*` — no inline hex in style objects
10. FlatList handles 50+ records without jank

---

## Day 2 (~3 hrs): Top Summary Strip + Display Gaps

### Goal
Add the "Pet Health Snapshot" collapsible summary strip and implement all 7 display gaps (prognosis, diagnosis notes, diagnoses expansion, recheckIn, lab notes, lab attachments, admin nextVisit fallback).

---

### Step 2.1 — Pet Health Snapshot strip (vitals + meds + vaccination bar)

**What:** Replace or prepend above the existing `listHeader` a collapsible "PET HEALTH SNAPSHOT" section with 3 sub-sections.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — modify the `listHeader` useMemo (starts at line 873) to prepend the snapshot.

**How:**

```jsx
// State for snapshot collapse
const [snapshotCollapsed, setSnapshotCollapsed] = useState(false);

// Derive latest vitals from most recent record
const latestVitals = useMemo(() => {
  if (!history.length) return null;
  const rv = resolveVitals(history[0]); // history[0] is newest
  if (!rv.weight && !rv.temp && !rv.hr) return null;
  return rv;
}, [history]);

// Derive active medications from most recent record
const latestActiveMeds = useMemo(() => {
  if (!history.length) return [];
  const latest = history[0];
  const products = latest.dispensedProducts || latest.prescriptions || [];
  return products.filter(rx => rx.isDrug || rx.isMedicine).slice(0, 5); // cap at 5
}, [history]);

// In listHeader JSX, BEFORE the existing vitals trends card:
{(latestVitals || latestActiveMeds.length > 0 || vaccineCompleteness) && (
  <View style={styles.snapshotCard}>
    <View style={styles.snapshotShadow} />
    <View style={styles.snapshotInner}>
      <TouchableOpacity
        style={styles.snapshotHeader}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setSnapshotCollapsed(prev => !prev);
        }}
      >
        <Text style={styles.snapshotTitle}>PET HEALTH SNAPSHOT</Text>
        <MaterialIcons name={snapshotCollapsed ? 'expand-more' : 'expand-less'} size={20} color={COLORS.accent} />
      </TouchableOpacity>

      {!snapshotCollapsed && (
        <View style={styles.snapshotBody}>
          {/* Section 1: Latest Vitals */}
          {latestVitals && (
            <View style={styles.snapshotSection}>
              <Text style={styles.snapshotSectionLabel}>LATEST VITALS</Text>
              <View style={styles.snapshotVitalsRow}>
                {latestVitals.weight && (
                  <View style={styles.snapshotVitalChip}>
                    <Text style={styles.snapshotVitalLabel}>WEIGHT</Text>
                    <Text style={styles.snapshotVitalValue}>{latestVitals.weight} kg</Text>
                  </View>
                )}
                {latestVitals.temp && (
                  <View style={styles.snapshotVitalChip}>
                    <Text style={styles.snapshotVitalLabel}>TEMP</Text>
                    <Text style={styles.snapshotVitalValue}>{latestVitals.temp} °C</Text>
                  </View>
                )}
                {latestVitals.hr && (
                  <View style={styles.snapshotVitalChip}>
                    <Text style={styles.snapshotVitalLabel}>HR</Text>
                    <Text style={styles.snapshotVitalValue}>{latestVitals.hr} bpm</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Section 2: Active Medications */}
          <View style={styles.snapshotSection}>
            <Text style={styles.snapshotSectionLabel}>ACTIVE MEDICATIONS</Text>
            {latestActiveMeds.length > 0 ? (
              latestActiveMeds.map((med, i) => (
                <View key={i} style={styles.snapshotMedRow}>
                  <Text style={styles.snapshotMedName}>{med.name}</Text>
                  {med.instructions && (
                    <Text style={styles.snapshotMedSig}>{med.instructions}</Text>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.snapshotEmptyText}>No active medications</Text>
            )}
          </View>

          {/* Section 3: Vaccination Completeness */}
          {vaccineCompleteness && (
            <View style={styles.snapshotSection}>
              <Text style={styles.snapshotSectionLabel}>VACCINATION STATUS</Text>
              <View style={styles.snapshotVaxRow}>
                <Text style={styles.snapshotVaxText}>
                  {vaccineCompleteness.administered}/{vaccineCompleteness.total} current ({vaccineCompleteness.percentage}%)
                </Text>
                <View style={styles.snapshotProgressTrack}>
                  <View style={[styles.snapshotProgressFill, {
                    width: `${vaccineCompleteness.percentage}%`,
                    backgroundColor: vaccineCompleteness.percentage >= 75 ? COLORS.success
                      : vaccineCompleteness.percentage >= 50 ? COLORS.warning
                      : COLORS.danger,
                  }]} />
                </View>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  </View>
)}
```

**Styles (new):**
```js
snapshotCard: { marginBottom: 16, position: 'relative' },
snapshotShadow: { ...SHADOW.card },
snapshotInner: {
  backgroundColor: COLORS.white,
  borderWidth: 2,
  borderColor: COLORS.border,
  borderRadius: 0,
},
snapshotHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 14,
},
snapshotTitle: {
  fontSize: 12,
  fontWeight: '900',
  color: COLORS.accent,
  textTransform: 'uppercase',
  letterSpacing: 1.5,
},
snapshotBody: { padding: 14, paddingTop: 0, gap: 14 },
snapshotSection: { gap: 6 },
snapshotSectionLabel: {
  fontSize: 10,
  fontWeight: '900',
  color: COLORS.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 1,
},
snapshotVitalsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
snapshotVitalChip: {
  backgroundColor: COLORS.cream,
  borderWidth: 1,
  borderColor: COLORS.borderLight,
  borderRadius: 0,
  paddingHorizontal: 10,
  paddingVertical: 6,
  alignItems: 'center',
},
snapshotVitalLabel: { fontSize: 9, fontWeight: '900', color: COLORS.textMuted, letterSpacing: 0.5 },
snapshotVitalValue: { fontSize: 14, fontWeight: '900', color: COLORS.brand, marginTop: 2 },
snapshotMedRow: { paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: COLORS.sky, paddingVertical: 2 },
snapshotMedName: { fontSize: 13, fontWeight: '700', color: COLORS.brand },
snapshotMedSig: { fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' },
snapshotEmptyText: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' },
snapshotVaxRow: { gap: 4 },
snapshotVaxText: { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary },
snapshotProgressTrack: {
  height: 6,
  backgroundColor: COLORS.white,
  borderWidth: 1,
  borderColor: COLORS.border,
  borderRadius: 0,
  overflow: 'hidden',
},
snapshotProgressFill: { height: 6, borderRadius: 0 },
```

**Why:** Decision 5 — collapsible Pet Health Snapshot with vitals, meds, vaccination bar.

**Depends on:** Day 1 complete.

**Done when:** Snapshot strip appears above the vitals trends card, shows latest weight/temp/HR, active meds, and vaccination %, collapses on tap.

---

### Step 2.2 — Gap 1: soap.prognosis display

**What:** Show `item.soap?.prognosis` in the expanded record view, below the diagnosis section, when present.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — in the expanded body of `renderRecord`, after the diagnosis container and before the assessment box.

**How:**
```jsx
{/* Gap 1: Prognosis — shown when soap.prognosis exists */}
{item.soap?.prognosis && !isGrooming && (
  <View style={styles.prognosisRow}>
    <Text style={styles.prognosisLabel}>PROGNOSIS</Text>
    <Text style={styles.prognosisText}>{item.soap.prognosis}</Text>
  </View>
)}
```

**Styles:**
```js
prognosisRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  marginBottom: 10,
},
prognosisLabel: {
  fontSize: 10,
  fontWeight: '900',
  color: COLORS.textMuted,
  letterSpacing: 1,
  textTransform: 'uppercase',
},
prognosisText: {
  fontSize: 13,
  fontWeight: '700',
  color: COLORS.brand,
},
```

**Why:** Gap 1 — `soap.prognosis` is stored by ClinicalWorkspace but never displayed on mobile.

**Depends on:** Day 1 (Step 1.5 expanded body).

**Done when:** Records with a prognosis show "PROGNOSIS: Good" (or similar) below diagnosis.

---

### Step 2.3 — Gap 2: Per-diagnosis notes

**What:** When `item.diagnoses[i].notes` exists, render it as a smaller subtitle below each diagnosis chip.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — in the diagnosis container section of expanded body (around line 1500-1530).

**How:** Modify the diagnoses rendering. Currently only `diagnoses[0]` is shown with severity. We need to show notes for the visible diagnosis(es):

```jsx
{/* After the main diagnosis text */}
{item.diagnoses?.[0]?.notes && (
  <Text style={styles.diagnosisNotes}>{item.diagnoses[0].notes}</Text>
)}
```

**Style:**
```js
diagnosisNotes: {
  fontSize: 12,
  color: COLORS.textMuted,
  fontStyle: 'italic',
  marginTop: 2,
  paddingLeft: 2,
},
```

**Why:** Gap 2 — per-diagnosis notes exist in Firestore but are not rendered.

**Depends on:** Day 1.

**Done when:** Diagnoses with `.notes` show italic text below the diagnosis name.

---

### Step 2.4 — Gap 3: Diagnoses expansion (tap "+N more")

**What:** The existing "+N more diagnoses" text becomes a tappable element that, when pressed, shows all diagnoses inline (with their severity and notes).

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — around line 1521 where `+{item.diagnoses.length - 1} more` is rendered.

**How:**
```jsx
// Add per-record state for diagnosis expansion. Use a ref Map to avoid re-renders:
const [expandedDiagnoses, setExpandedDiagnoses] = useState(new Set());

const toggleDiagnoses = (recordId) => {
  setExpandedDiagnoses(prev => {
    const next = new Set(prev);
    if (next.has(recordId)) next.delete(recordId);
    else next.add(recordId);
    return next;
  });
};

// Replace the static "+N more" text with:
{item.diagnoses?.length > 1 && (
  <TouchableOpacity onPress={() => toggleDiagnoses(item.id)}>
    <Text style={styles.diagnosesToggle}>
      {expandedDiagnoses.has(item.id)
        ? 'Show less'
        : `+${item.diagnoses.length - 1} more ${item.diagnoses.length === 2 ? 'diagnosis' : 'diagnoses'}`}
    </Text>
  </TouchableOpacity>
)}

{/* Show remaining diagnoses when expanded */}
{expandedDiagnoses.has(item.id) && item.diagnoses?.slice(1).map((dx, i) => (
  <View key={i} style={styles.extraDiagnosisRow}>
    <Text style={styles.extraDiagnosisName}>{dx.name}</Text>
    {dx.severity && (
      <View style={styles.extraDiagnosisSeverity}>
        <Text style={styles.extraDiagnosisSeverityText}>{dx.severity}</Text>
      </View>
    )}
    {dx.notes && (
      <Text style={styles.diagnosisNotes}>{dx.notes}</Text>
    )}
  </View>
))}
```

**Styles:**
```js
diagnosesToggle: {
  fontSize: 11,
  fontWeight: '900',
  color: COLORS.sky,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginTop: 4,
},
extraDiagnosisRow: {
  marginTop: 6,
  paddingLeft: 8,
  borderLeftWidth: 2,
  borderLeftColor: COLORS.borderLight,
},
extraDiagnosisName: {
  fontSize: 14,
  fontWeight: '700',
  color: COLORS.brand,
},
extraDiagnosisSeverity: {
  backgroundColor: COLORS.cream,
  paddingHorizontal: 8,
  paddingVertical: 2,
  marginTop: 2,
  borderRadius: 0,
  alignSelf: 'flex-start',
},
extraDiagnosisSeverityText: {
  fontSize: 10,
  fontWeight: '900',
  color: COLORS.warning,
  textTransform: 'uppercase',
},
```

**Why:** Gap 3 — currently "+N more" is non-interactive dead text.

**Depends on:** Day 1.

**Done when:** Tapping "+2 more diagnoses" shows all diagnoses inline with their severity and notes.

---

### Step 2.5 — Gap 4: dischargeSummary.recheckIn display

**What:** Add "Recheck in: {value}" to the Going-Home Instructions section.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — in the discharge summary render block (around line 1773, after the nextVisit banner and before the "Call us" button).

**How:**
```jsx
{/* Gap 4: Recheck interval */}
{ds.recheckIn && (
  <View style={styles.dischargeRecheckRow}>
    <MaterialIcons name="replay" size={14} color={COLORS.accent} />
    <Text style={styles.dischargeRecheckText}>Recheck in: {ds.recheckIn}</Text>
  </View>
)}
```

**Style:**
```js
dischargeRecheckRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  marginBottom: 10,
  paddingVertical: 6,
  paddingHorizontal: 10,
  backgroundColor: COLORS.cream,
  borderWidth: 1,
  borderColor: COLORS.borderLight,
  borderRadius: 0,
},
dischargeRecheckText: {
  fontSize: 13,
  fontWeight: '700',
  color: COLORS.accent,
},
```

**Why:** Gap 4 — `recheckIn` is stored by ClinicalWorkspace discharge form but not shown on mobile.

**Depends on:** Day 1.

**Done when:** Discharge sections with `recheckIn` show "Recheck in: 1 Week" (or similar).

---

### Step 2.6 — Gap 5: Lab notes display

**What:** Show `lab.notes` as italic text below each lab result row.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — in the per-record lab results rendering (around line 1900, after the `labStatusPill`).

**How:**
```jsx
{/* Inside the labRow, after the status pill: */}
{lab.notes && (
  <Text style={styles.labNotes}>{lab.notes}</Text>
)}
```

But since the current `labRow` uses `flexDirection: 'row'`, we need to wrap the left side content to include notes below:

```jsx
// Modify labRow structure:
<View key={i} style={styles.labRow}>
  <View style={{ flex: 1 }}>
    <Text style={styles.labTestName}>{lab.testName}</Text>
    <Text style={styles.labResult}>{lab.result}{lab.unit ? ` ${lab.unit}` : ''}</Text>
    {refRangeNode}
    {lab.notes && <Text style={styles.labNotes}>{lab.notes}</Text>}
  </View>
  <Text style={[styles.labStatusPill, { color: statusColor, backgroundColor: statusBg }]}>
    {chipLabel}
  </Text>
</View>
```

**Style:**
```js
labNotes: {
  fontSize: 11,
  color: COLORS.textMuted,
  fontStyle: 'italic',
  marginTop: 2,
},
```

**Why:** Gap 5 — lab notes are stored but not displayed on mobile (admin already shows them).

**Depends on:** Day 1.

**Done when:** Lab results with notes show italic text below the test name/result.

---

### Step 2.7 — Gap 6: Lab attachment URLs

**What:** Show a tappable link when `lab.attachmentUrl` exists, opening via `Linking.openURL`.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — in the lab results render, after notes.

**How:**
```jsx
{lab.attachmentUrl && (
  <TouchableOpacity
    style={styles.labAttachmentLink}
    onPress={() => Linking.openURL(lab.attachmentUrl).catch(() =>
      Alert.alert('Error', 'Cannot open this attachment.')
    )}
  >
    <MaterialIcons name="attach-file" size={12} color={COLORS.sky} />
    <Text style={styles.labAttachmentText}>View attachment</Text>
  </TouchableOpacity>
)}
```

**Style:**
```js
labAttachmentLink: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  marginTop: 3,
},
labAttachmentText: {
  fontSize: 11,
  fontWeight: '700',
  color: COLORS.sky,
  textDecorationLine: 'underline',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
},
```

**Why:** Gap 6 — admin already renders lab attachment links; mobile does not.

**Depends on:** Step 2.6.

**Done when:** Lab results with `attachmentUrl` show a tappable "View attachment" link.

---

### Step 2.8 — "TL;DR" label removal

**What:** Remove the `dischargeTldrLabel` ("TL;DR") and render `ds.diagnosis` directly as bold text without any prefix label.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — in the discharge summary block (around line 1745-1749).

**How:**

Replace:
```jsx
{ds.diagnosis && (
  <View style={styles.dischargeTldrBlock}>
    <Text style={styles.dischargeTldrLabel}>TL;DR</Text>
    <Text style={styles.dischargeTldrText}>{ds.diagnosis}</Text>
  </View>
)}
```

With:
```jsx
{ds.diagnosis && (
  <View style={styles.dischargeDiagnosisBlock}>
    <Text style={styles.dischargeDiagnosisText}>{ds.diagnosis}</Text>
  </View>
)}
```

**Updated styles (rename):**
```js
dischargeDiagnosisBlock: {
  marginBottom: 12,
  paddingLeft: 10,
  borderLeftWidth: 3,
  borderLeftColor: COLORS.accent,
},
dischargeDiagnosisText: {
  fontSize: 15,
  color: COLORS.brand,
  fontWeight: '900',
  lineHeight: 20,
},
```

Remove: `dischargeTldrLabel`, `dischargeTldrBlock`, `dischargeTldrText`.

**Why:** Decision 3 — "TL;DR" removed entirely. Text renders directly as the summary.

**Depends on:** Day 1.

**Done when:** No "TL;DR" label appears anywhere; diagnosis renders as bold text only.

---

### Verification Checkpoint — Day 2

1. Pet Health Snapshot appears with correct latest vitals, meds, vaccination %
2. Snapshot collapses on header tap
3. Records with `soap.prognosis` show "PROGNOSIS: Good" (etc.)
4. Diagnoses with `.notes` show italic note text
5. Tapping "+N more diagnoses" shows all diagnoses inline
6. Discharge records with `recheckIn` show "Recheck in: X"
7. Lab results with `notes` show italic note text
8. Lab results with `attachmentUrl` show tappable link
9. No "TL;DR" label anywhere in the UI
10. All new elements follow neubrutalism (zero borderRadius, COLORS.* only)

---

## Day 3 (~2 hrs): Polish + Admin Gaps

### Goal
Add pull-to-refresh, loading skeleton, admin-side gap fixes, edge case handling, and label refinements.

---

### Step 3.1 — Pull-to-refresh on FlatList

**What:** Add a RefreshControl to the FlatList that triggers a re-fetch of medical records.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — FlatList props + state.

**How:**
```jsx
import { RefreshControl } from 'react-native';

const [refreshing, setRefreshing] = useState(false);

const onRefresh = useCallback(() => {
  setRefreshing(true);
  // The onSnapshot listener auto-refreshes, so we just need a visual indicator
  // Set a timeout to dismiss the spinner (Firestore listener is real-time)
  setTimeout(() => setRefreshing(false), 1000);
}, []);

// FlatList:
<FlatList
  ...
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={[COLORS.sky]}
      tintColor={COLORS.sky}
    />
  }
/>
```

**Why:** Task spec includes pull-to-refresh. Since data is already real-time via `onSnapshot`, this is primarily a UX affordance to confirm freshness.

**Depends on:** Day 1, Day 2.

**Done when:** Pulling down on the list shows the refresh spinner for ~1 second.

---

### Step 3.2 — Loading skeleton (replace spinner)

**What:** Replace the `ActivityIndicator` with a skeleton placeholder showing 3-4 placeholder record shapes.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` — loading state render (lines 2077-2094).

**How:**
```jsx
// Replace ActivityIndicator with skeleton:
{loading && isConnected && (
  <View style={styles.skeletonContainer}>
    {[0, 1, 2, 3].map(i => (
      <View key={i} style={styles.skeletonRow}>
        <View style={styles.skeletonDot} />
        <View style={styles.skeletonCard}>
          <View style={styles.skeletonLine1} />
          <View style={styles.skeletonLine2} />
        </View>
      </View>
    ))}
  </View>
)}
```

**Styles:**
```js
skeletonContainer: {
  padding: 20,
  gap: 16,
},
skeletonRow: {
  flexDirection: 'row',
  gap: 12,
},
skeletonDot: {
  width: 8,
  height: 8,
  backgroundColor: COLORS.borderLight,
  borderRadius: 4,
  marginTop: 18,
},
skeletonCard: {
  flex: 1,
  backgroundColor: COLORS.white,
  borderWidth: 2,
  borderColor: COLORS.borderLight,
  borderRadius: 0,
  padding: 14,
  gap: 8,
},
skeletonLine1: {
  height: 12,
  backgroundColor: COLORS.borderLight,
  borderRadius: 0,
  width: '70%',
},
skeletonLine2: {
  height: 10,
  backgroundColor: COLORS.borderLight,
  borderRadius: 0,
  width: '40%',
},
```

**Why:** Task spec — loading skeleton replaces generic spinner.

**Depends on:** Day 1.

**Done when:** Loading state shows 4 placeholder cards instead of a spinner.

---

### Step 3.3 — Admin Gap 1+2: Prognosis + Diagnosis notes in PatientDashboard.jsx

**What:** Add `soap.prognosis` display and per-diagnosis `.notes` rendering to the admin PatientDashboard record expansion.

**Where:** `VetConnect-Admin/src/features/Patients/PatientDashboard.jsx` — in the expanded record body, around line 1488-1507 (the Assessment section).

**How:**

After the diagnosis chips block (line 1499), add per-diagnosis notes:
```jsx
{rec.diagnoses?.map((dx, i) => (
  <Chip key={dx.catalogId || i} label={`${dx.name}${dx.severity ? ` — ${dx.severity}` : ''}`} size="small"
    sx={{ ... }} />
))}
{/* Gap 2: Per-diagnosis notes */}
{rec.diagnoses?.filter(dx => dx.notes).length > 0 && (
  <Stack spacing={0.25} sx={{ pl: 1.5, borderLeft: `2px solid ${COLORS.borderLight}`, mt: 0.5 }}>
    {rec.diagnoses.filter(dx => dx.notes).map((dx, i) => (
      <Typography key={i} sx={{ fontFamily: FONT, fontSize: '0.75rem', color: COLORS.textMuted, fontStyle: 'italic' }}>
        {dx.name}: {dx.notes}
      </Typography>
    ))}
  </Stack>
)}
```

After the Assessment section (around line 1507), add prognosis:
```jsx
{/* Gap 1: Prognosis */}
{rec.soap?.prognosis && (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
    <Typography sx={{ fontFamily: FONT, ...TYPE.label, color: COLORS.textMuted }}>Prognosis:</Typography>
    <Typography sx={{ fontFamily: FONT, ...TYPE.bodyBold, color: COLORS.textPrimary }}>{rec.soap.prognosis}</Typography>
  </Box>
)}
```

**Why:** Gaps 1 & 2 — admin PatientDashboard also lacks prognosis and per-diagnosis notes display.

**Depends on:** None (independent file).

**Done when:** Expanded admin records show prognosis label and diagnosis notes where present.

---

### Step 3.4 — Admin Gap 7: nextVisit fallback when dischargeSummary is absent

**What:** When a record has `rec.nextVisit` but no `rec.dischargeSummary`, show a standalone "Next Visit" line.

**Where:** `VetConnect-Admin/src/features/Patients/PatientDashboard.jsx` — after the discharge summary block (line ~1563), add a fallback.

**How:**
```jsx
{/* Gap 7: nextVisit fallback — shown when dischargeSummary is absent but nextVisit exists */}
{!rec.dischargeSummary && rec.nextVisit && (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, p: 1, bgcolor: COLORS.warningSurface, border: `1px solid ${COLORS.peach}`, borderRadius: 0 }}>
    <EventIcon sx={{ fontSize: 14, color: COLORS.warning }} />
    <Typography sx={{ fontFamily: FONT, ...TYPE.body, color: COLORS.warning, fontWeight: 700 }}>
      Follow-up: {typeof rec.nextVisit === 'string' ? rec.nextVisit : formatDate(rec.nextVisit)}
    </Typography>
  </Box>
)}
```

Note: `EventIcon` should already be imported (check for existing CalendarMonth or Event import). If not, add:
```jsx
import EventIcon from '@mui/icons-material/Event';
```

Also verify the admin has a `formatDate` utility or use the existing date formatter pattern.

**Why:** Gap 7 — records written before the discharge system had `nextVisit` at the top level; it's currently invisible without `dischargeSummary`.

**Depends on:** None.

**Done when:** Admin records with `nextVisit` but no `dischargeSummary` show a follow-up line.

---

### Step 3.5 — Edge cases: empty state, single record, 50+ records

**What:** Refine empty state styling, ensure single-record edge case works (no month picker, no year header), and verify performance with large datasets.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js`

**How:**

1. **Empty state** — update the `ListEmptyComponent` to neubrutalism:
```jsx
ListEmptyComponent={
  <View style={styles.emptyContainer}>
    <MaterialIcons name="folder-open" size={48} color={COLORS.textMuted} />
    <Text style={styles.emptyText}>NO MEDICAL RECORDS</Text>
    <Text style={styles.emptySub}>
      Visit summaries and lab results will appear here after a consultation.
    </Text>
  </View>
}
```

2. **Single record** — month picker already gates on `months.length > 1` (won't render). Year header renders for index === 0, which is correct. The single record auto-expands (Step 1.2 logic). No changes needed.

3. **50+ records performance** — already handled by Step 1.9 (FlatList optimization). Verify with `console.time`/`console.timeEnd` in dev that render is under 16ms per frame.

**Styles update:**
```js
emptyContainer: {
  alignItems: 'center',
  marginTop: 80,
  paddingHorizontal: 40,
  gap: 12,
},
emptyText: {
  color: COLORS.brand,
  fontWeight: '900',
  fontSize: 18,
  textTransform: 'uppercase',
  letterSpacing: 2,
  textAlign: 'center',
},
emptySub: {
  color: COLORS.textMuted,
  fontSize: 13,
  textAlign: 'center',
  lineHeight: 20,
},
```

**Why:** Edge case handling per task requirements.

**Depends on:** Days 1-2.

**Done when:** Empty state renders neubrutalist icon + text; single record shows expanded without month picker; 50+ records scroll smoothly.

---

### Step 3.6 — Label refinements

**What:** Rename "CLINICAL ASSESSMENT" to "VET'S NOTES" in the mobile view for pet-owner clarity. Ensure all section headers are uppercase with letter-spacing.

**Where:** `VetConnect/src/screens/PetHistoryScreen.js` ��� around line 1536 (assessmentLabel).

**How:**
```jsx
// Change:
<Text style={styles.assessmentLabel}>CLINICAL ASSESSMENT</Text>
// To:
<Text style={styles.assessmentLabel}>VET'S NOTES</Text>
```

Also verify all header-style Text elements use `textTransform: 'uppercase'` and `letterSpacing >= 1` in their style definitions (audit the styles object during Day 1 Step 1.8).

**Why:** Pet owners are not clinicians — "Clinical Assessment" is jargon. "Vet's Notes" is clearer.

**Depends on:** Day 1.

**Done when:** The label reads "VET'S NOTES" in the expanded record view.

---

### Verification Checkpoint — Day 3

1. Pull-to-refresh works (spinner appears briefly)
2. Loading state shows skeleton cards, not a spinner
3. Admin PatientDashboard shows prognosis below assessment
4. Admin PatientDashboard shows per-diagnosis notes as italic subtitles
5. Admin records with `nextVisit` but no `dischargeSummary` show follow-up line
6. Empty state shows neubrutalist icon + uppercase text
7. Single record: no month picker, no year header, record auto-expanded
8. FlatList with 50+ records: no frame drops on fast scroll
9. "CLINICAL ASSESSMENT" label renamed to "VET'S NOTES"

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `LayoutAnimation` may not work on all Android devices | `UIManager.setLayoutAnimationEnabledExperimental` is enabled. Expo 54 + Hermes enables it. If issues arise, fallback to conditional rendering without animation. |
| `scrollToIndex` fails for items not yet rendered | `onScrollToIndexFailed` fallback scrolls to estimated offset. Also `initialNumToRender: 15` ensures top records are available. |
| Performance with 50+ expanded records | Default is collapsed except latest. `allExpanded` toggle exists but users must opt-in. FlatList virtualization handles the rest. |
| Month picker scroll position not syncing when FlatList scrolls | `onViewableItemsChanged` fires on viewability changes only — no per-frame overhead. |
| Breaking existing features (search, filters, PDF export, AI, lightbox) | All existing functionality is preserved — we only wrap the record body in a conditional. PDF/AI/lightbox are modal-based and unaffected. |
| Admin PatientDashboard changes conflict with other PRs | Changes are additive only (new JSX after existing blocks). No lines are removed. |
| Inline hex colors in vaccination passport HTML template | The HTML template is self-contained (not rendered in RN Views). These are intentional and do not violate the mobileTokens rule. |

---

## Testing Strategy

### Manual QA Checklist

- [ ] Open PetHistoryScreen for a pet with 0 records — empty state renders
- [ ] Open for a pet with 1 record — expanded, no month picker, no year header
- [ ] Open for a pet with 5+ records across multiple months — month picker appears
- [ ] Tap collapsed record header — expands with animation
- [ ] Tap expanded record header — collapses with animation
- [ ] Tap timeline dot — toggles that record
- [ ] Tap month chip — scrolls to correct section
- [ ] Scroll through records — active month chip auto-updates
- [ ] Tap "Expand All" — all records expand; button changes to "Collapse All"
- [ ] Tap "Collapse All" — all collapse except latest
- [ ] Pull to refresh — spinner appears briefly
- [ ] Search filters work with collapsible records
- [ ] Department filter chips work correctly
- [ ] Pet Health Snapshot shows correct vitals from latest record
- [ ] Snapshot shows active medications from latest record
- [ ] Snapshot shows vaccination completeness bar
- [ ] Snapshot collapses on header tap
- [ ] Record with `soap.prognosis` shows prognosis label
- [ ] Record with `diagnoses[].notes` shows italic note text
- [ ] Tap "+N more diagnoses" — shows all inline
- [ ] Discharge with `recheckIn` shows "Recheck in: X"
- [ ] Lab with `notes` shows italic text
- [ ] Lab with `attachmentUrl` shows tappable link
- [ ] No "TL;DR" label anywhere
- [ ] All elements have borderRadius: 0 (except dots)
- [ ] PDF generation still works from expanded record
- [ ] Vaccination passport still works
- [ ] AI FAB and sheet still work
- [ ] Image lightbox still works
- [ ] Vitals zoom still works
- [ ] Lab zoom still works
- [ ] (Admin) PatientDashboard shows prognosis
- [ ] (Admin) PatientDashboard shows diagnosis notes
- [ ] (Admin) PatientDashboard shows nextVisit fallback

---

## Estimated Effort

| Phase | Effort | Can parallelize? |
|---|---|---|
| Day 1: Structure + Navigation + Styling | ~3 hrs | No — foundational |
| Day 2: Top Summary + Display Gaps | ~3 hrs | Steps 2.2-2.8 can be done in any order after 2.1 |
| Day 3: Polish + Admin Gaps | ~2 hrs | Steps 3.1-3.6 are independent of each other |

**Total: ~8 hrs**

---

## Files Modified

| File | Changes |
|---|---|
| `VetConnect/src/theme/mobileTokens.js` | Add `SHADOW.record` |
| `VetConnect/src/screens/PetHistoryScreen.js` | Full redesign (collapsible records, month picker, dot timeline, snapshot strip, 6 display gaps, neubrutalism, skeleton, pull-to-refresh) |
| `VetConnect-Admin/src/features/Patients/PatientDashboard.jsx` | Add prognosis display, diagnosis notes, nextVisit fallback (3 admin gaps) |

**No new files created. No npm installs required.**
