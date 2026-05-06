# T4.176 — My Bookings Neubrutalism Conversion + Filter Redesign

## Overview

Convert ClientAppointments.js (My Bookings) from old rounded/soft styling to full neubrutalism compliance matching the rest of the mobile app. Replace the two horizontal chip ScrollViews (pet filter + service filter) with a search bar and two bottom sheet filter modals. Fix CaseDayCard.js hardcoded hex, pager drift, and height constraints. Two files: `VetConnect/src/screens/ClientAppointments.js` (1421 lines) and `VetConnect/src/components/CaseDayCard.js` (523 lines).

**Assumptions:** SuperCard is already compliant (confirmed). MaterialIcons from `@expo/vector-icons` is already available in the project (used in PetHistoryScreen). `TextInput` is already imported in ClientAppointments. The `COLORS` import from `mobileTokens.js` is already present (line 48).

---

## Prerequisites

- Add `warningBg` token to `mobileTokens.js` — `#FFF3E0` is used in 15+ files but not tokenized. Add `warningBg: '#FFF3E0'` to the COLORS object so CaseDayCard and ClientAppointments can reference it instead of hardcoded hex.
- Add `import { MaterialIcons } from '@expo/vector-icons'` to ClientAppointments.js — needed for search icon, filter icons, and checkboxes in bottom sheets.
- Add `TextInput` to the existing `react-native` import in ClientAppointments.js (currently imports View, Text, TouchableOpacity, FlatList, Modal, ScrollView, ActivityIndicator, Alert, StyleSheet).

---

## Change 1: Tab Bar — borderRadius 0 + Sky Blue Active Indicator

### What
Replace rounded pill toggle with flat neubrutalist tabs matching PetHistoryScreen month picker pattern.

### Where
`VetConnect/src/screens/ClientAppointments.js` — styles at lines 1118-1128

### How

**Style changes (StyleSheet):**

```js
// REPLACE these styles:
tabContainer: {
  flexDirection: 'row',
  marginBottom: 10,
  backgroundColor: COLORS.cream,      // was '#EFEBE9'
  borderWidth: 2,
  borderColor: COLORS.border,
  borderRadius: 0,                    // was 10
  padding: 0,                         // was 4
},
tab: {
  flex: 1,
  paddingVertical: 12,               // was 10
  alignItems: 'center',
  borderRadius: 0,                   // was 8
},
activeTab: {
  backgroundColor: COLORS.sky,       // was COLORS.white + elevation
},
tabText: {
  fontWeight: '900',                 // was 'bold'
  color: COLORS.accent,             // was COLORS.accentLight
  fontSize: 13,
  textTransform: 'uppercase',
  letterSpacing: 1,
},
activeTabText: {
  color: COLORS.cream,              // was COLORS.accent — cream on sky bg
},
```

**Done when:** Tabs render as two flat rectangles with 2px border, no rounded corners, active tab has Sky Blue background with cream text.

---

## Change 2: Filter Redesign — Search Bar + Two Bottom Sheets

This is the critical-path change. Replace the two horizontal chip ScrollViews with a search bar + two icon-button-triggered bottom sheet Modals.

### Where
`VetConnect/src/screens/ClientAppointments.js`

### 2A. State Changes (lines 68-71)

**DELETE these two state variables:**
```js
const [selectedPetFilter, setSelectedPetFilter] = useState("All Pets");
const [selectedServiceFilter, setSelectedServiceFilter] = useState("All Services");
```

**ADD these new state variables (after line 71):**
```js
// Search + bottom sheet filter state
const [searchText, setSearchText] = useState('');
const [petFilterOpen, setPetFilterOpen] = useState(false);
const [pendingPetFilters, setPendingPetFilters] = useState(new Set());
const [activePetFilters, setActivePetFilters] = useState(new Set());
const [serviceFilterOpen, setServiceFilterOpen] = useState(false);
const [pendingServiceFilters, setPendingServiceFilters] = useState(new Set());
const [activeServiceFilters, setActiveServiceFilters] = useState(new Set());
```

### 2B. Derived Filter Data (lines 503-511)

**DELETE the old uniquePets/uniqueServices arrays** (lines 504-511).

**REPLACE with counted Maps:**
```js
// --- DYNAMIC FILTER DATA GENERATION ---
const petCounts = useMemo(() => {
  const counts = new Map();
  appointments.forEach(a => {
    const name = a.petName || 'Unknown';
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return counts;
}, [appointments]);

const serviceCounts = useMemo(() => {
  const counts = new Map();
  appointments.forEach(a => {
    const svc = a.serviceType || a.primaryService || 'Other';
    counts.set(svc, (counts.get(svc) || 0) + 1);
  });
  return counts;
}, [appointments]);
```

### 2C. filteredData useMemo Rewrite (lines 514-544)

**REPLACE the entire `filteredData` definition:**

```js
const filteredData = useMemo(() => {
  return appointments.filter((item) => {
    // 1. Tab Check (unchanged)
    const isUpcomingTab = tab === 'upcoming';
    const isValidStatus = isUpcomingTab
      ? ['pending', 'confirmed', 'arrived', 'in-consult', 'billing', 'confined', 'dispensing', 'on-hold'].includes(item.status)
      : (
          ['completed', 'cancelled', 'no-show', 'carried-over'].includes(item.status)
          && item.auditReason !== 'client-dismissed-followup'
          && item.auditReason !== 'client-booked-followup'
        );
    if (!isValidStatus) return false;

    // 2. Pet filter — Set-based (empty Set = all pets pass)
    if (activePetFilters.size > 0 && !activePetFilters.has(item.petName)) return false;

    // 3. Service filter — Set-based (empty Set = all services pass)
    if (activeServiceFilters.size > 0) {
      const svc = item.serviceType || item.primaryService || 'Other';
      if (!activeServiceFilters.has(svc)) return false;
    }

    // 4. Search — keyword match across multiple fields
    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim();
      const haystack = [
        item.petName,
        item.serviceType,
        item.primaryService,
        ...(item.services || []).map(s => s.name),
        item.diagnosis,
        item.assignedVet,
        item.auditReason,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}, [appointments, tab, activePetFilters, activeServiceFilters, searchText]);
```

### 2D. Empty State Clear Filters Handler (lines 1014-1018)

**REPLACE the old clear filters handler** in the ListEmptyComponent:
```js
// Old:
setSelectedPetFilter("All Pets");
setSelectedServiceFilter("All Services");
// New:
setSearchText('');
setActivePetFilters(new Set());
setActiveServiceFilters(new Set());
```

### 2E. Filter Section JSX (lines 862-918) — DELETE + REPLACE

**DELETE the entire `{appointments.length > 0 && ( <View style={styles.filterSection}> ... </View> )}` block** (lines 862-918, the two horizontal ScrollView chip rows).

**REPLACE with search bar + two icon buttons:**

```jsx
{/* SEARCH + FILTER BAR */}
{appointments.length > 0 && (
  <View style={styles.searchFilterBar}>
    <View style={styles.searchInputWrapper}>
      <MaterialIcons name="search" size={18} color={COLORS.textMuted} />
      <TextInput
        style={styles.searchInput}
        placeholder="Search appointments..."
        placeholderTextColor={COLORS.placeholder}
        value={searchText}
        onChangeText={setSearchText}
        returnKeyType="search"
      />
      {searchText.length > 0 && (
        <TouchableOpacity onPress={() => setSearchText('')}>
          <MaterialIcons name="close" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      )}
    </View>

    {/* Pet filter icon button */}
    <TouchableOpacity
      style={styles.filterIconBtn}
      onPress={() => { setPendingPetFilters(new Set(activePetFilters)); setPetFilterOpen(true); }}
    >
      <Text style={styles.filterIconEmoji}>🐾</Text>
      {activePetFilters.size > 0 && (
        <View style={styles.filterBadge}>
          <Text style={styles.filterBadgeText}>{activePetFilters.size}</Text>
        </View>
      )}
    </TouchableOpacity>

    {/* Service filter icon button */}
    <TouchableOpacity
      style={styles.filterIconBtn}
      onPress={() => { setPendingServiceFilters(new Set(activeServiceFilters)); setServiceFilterOpen(true); }}
    >
      <Text style={styles.filterIconEmoji}>📋</Text>
      {activeServiceFilters.size > 0 && (
        <View style={styles.filterBadge}>
          <Text style={styles.filterBadgeText}>{activeServiceFilters.size}</Text>
        </View>
      )}
    </TouchableOpacity>
  </View>
)}
```

### 2F. Bottom Sheet Modals — Add Before Closing `</View>` (before QR Modal, ~line 1030)

**Pet filter bottom sheet:**

```jsx
{/* PET FILTER BOTTOM SHEET */}
<Modal visible={petFilterOpen} transparent animationType="slide" onRequestClose={() => setPetFilterOpen(false)}>
  <TouchableOpacity style={styles.filterOverlay} activeOpacity={1} onPress={() => setPetFilterOpen(false)}>
    <View style={styles.filterSheet} onStartShouldSetResponder={() => true}>
      <View style={styles.filterSheetHandle} />
      <Text style={styles.filterSheetTitle}>FILTER BY PET</Text>
      <ScrollView style={styles.filterSheetScroll}>
        {[...petCounts.entries()].map(([pet, count]) => {
          const isChecked = pendingPetFilters.has(pet);
          return (
            <TouchableOpacity key={pet} style={styles.filterSheetRow} onPress={() => {
              setPendingPetFilters(prev => {
                const next = new Set(prev);
                if (next.has(pet)) next.delete(pet); else next.add(pet);
                return next;
              });
            }}>
              <MaterialIcons name={isChecked ? 'check-box' : 'check-box-outline-blank'} size={22} color={isChecked ? COLORS.sky : COLORS.textMuted} />
              <Text style={styles.filterSheetLabel}>{pet}</Text>
              <Text style={styles.filterSheetCount}>({count})</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={styles.filterSheetActions}>
        <TouchableOpacity onPress={() => setPendingPetFilters(new Set())} style={styles.filterSheetClearBtn}>
          <Text style={styles.filterSheetClearText}>CLEAR ALL</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setActivePetFilters(new Set(pendingPetFilters)); setPetFilterOpen(false); }} style={styles.filterSheetApplyBtn}>
          <Text style={styles.filterSheetApplyText}>APPLY FILTER</Text>
        </TouchableOpacity>
      </View>
    </View>
  </TouchableOpacity>
</Modal>
```

**Service filter bottom sheet (identical pattern, different data):**

```jsx
{/* SERVICE FILTER BOTTOM SHEET */}
<Modal visible={serviceFilterOpen} transparent animationType="slide" onRequestClose={() => setServiceFilterOpen(false)}>
  <TouchableOpacity style={styles.filterOverlay} activeOpacity={1} onPress={() => setServiceFilterOpen(false)}>
    <View style={styles.filterSheet} onStartShouldSetResponder={() => true}>
      <View style={styles.filterSheetHandle} />
      <Text style={styles.filterSheetTitle}>FILTER BY SERVICE</Text>
      <ScrollView style={styles.filterSheetScroll}>
        {[...serviceCounts.entries()].map(([svc, count]) => {
          const isChecked = pendingServiceFilters.has(svc);
          return (
            <TouchableOpacity key={svc} style={styles.filterSheetRow} onPress={() => {
              setPendingServiceFilters(prev => {
                const next = new Set(prev);
                if (next.has(svc)) next.delete(svc); else next.add(svc);
                return next;
              });
            }}>
              <MaterialIcons name={isChecked ? 'check-box' : 'check-box-outline-blank'} size={22} color={isChecked ? COLORS.sky : COLORS.textMuted} />
              <Text style={styles.filterSheetLabel}>{svc}</Text>
              <Text style={styles.filterSheetCount}>({count})</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={styles.filterSheetActions}>
        <TouchableOpacity onPress={() => setPendingServiceFilters(new Set())} style={styles.filterSheetClearBtn}>
          <Text style={styles.filterSheetClearText}>CLEAR ALL</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setActiveServiceFilters(new Set(pendingServiceFilters)); setServiceFilterOpen(false); }} style={styles.filterSheetApplyBtn}>
          <Text style={styles.filterSheetApplyText}>APPLY FILTER</Text>
        </TouchableOpacity>
      </View>
    </View>
  </TouchableOpacity>
</Modal>
```

### 2G. New Styles for Search + Filter + Bottom Sheets

**DELETE** styles: `filterSection`, `chipRow`, `filterChip`, `activeFilterChip`, `filterText`, `activeFilterText` (lines 1130-1143).

**ADD these new styles** (copied from PetHistoryScreen T4.166 pattern, exact same visual language):

```js
// --- Search + filter bar ---
searchFilterBar: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  marginBottom: 12,
},
searchInputWrapper: {
  flex: 1,
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: COLORS.white,
  borderWidth: 2,
  borderColor: COLORS.border,
  borderRadius: 0,
  paddingHorizontal: 10,
  paddingVertical: 8,
  gap: 6,
},
searchInput: {
  flex: 1,
  fontSize: 14,
  color: COLORS.textPrimary,
  padding: 0,
},
filterIconBtn: {
  width: 40,
  height: 40,
  borderWidth: 2,
  borderColor: COLORS.border,
  borderRadius: 0,
  backgroundColor: COLORS.white,
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
},
filterIconEmoji: {
  fontSize: 18,
},
filterBadge: {
  position: 'absolute',
  top: -6,
  right: -6,
  backgroundColor: COLORS.sky,
  borderRadius: 0,
  minWidth: 16,
  height: 16,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: COLORS.brand,
},
filterBadgeText: {
  fontSize: 9,
  fontWeight: '900',
  color: COLORS.cream,
},

// --- Bottom sheet (same pattern as PetHistoryScreen T4.166) ---
filterOverlay: {
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.4)',
  justifyContent: 'flex-end',
},
filterSheet: {
  backgroundColor: COLORS.cream,
  borderTopWidth: 2,
  borderTopColor: COLORS.border,
  paddingBottom: 30,
  maxHeight: '60%',
},
filterSheetHandle: {
  width: 40,
  height: 4,
  backgroundColor: COLORS.borderLight,
  alignSelf: 'center',
  marginTop: 10,
  marginBottom: 16,
},
filterSheetTitle: {
  fontSize: 12,
  fontWeight: '900',
  color: COLORS.accent,
  letterSpacing: 1,
  textTransform: 'uppercase',
  paddingHorizontal: 20,
  marginBottom: 12,
},
filterSheetScroll: {
  paddingHorizontal: 20,
},
filterSheetRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  paddingVertical: 12,
  borderBottomWidth: 1,
  borderBottomColor: COLORS.borderLight,
},
filterSheetLabel: {
  flex: 1,
  fontSize: 14,
  fontWeight: '700',
  color: COLORS.brand,
},
filterSheetCount: {
  fontSize: 12,
  color: COLORS.textMuted,
},
filterSheetActions: {
  flexDirection: 'row',
  gap: 12,
  paddingHorizontal: 20,
  paddingTop: 16,
},
filterSheetClearBtn: {
  flex: 1,
  paddingVertical: 12,
  borderWidth: 2,
  borderColor: COLORS.border,
  borderRadius: 0,
  alignItems: 'center',
  backgroundColor: COLORS.white,
},
filterSheetClearText: {
  fontSize: 11,
  fontWeight: '900',
  color: COLORS.accent,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
},
filterSheetApplyBtn: {
  flex: 1,
  paddingVertical: 12,
  backgroundColor: COLORS.sky,
  borderWidth: 2,
  borderColor: COLORS.brand,
  borderRadius: 0,
  alignItems: 'center',
},
filterSheetApplyText: {
  fontSize: 11,
  fontWeight: '900',
  color: COLORS.cream,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
},
```

**Done when:** Horizontal chip rows are gone. Search bar filters across petName, serviceType, services[].name, diagnosis, assignedVet, auditReason. Pet filter icon (🐾) opens bottom sheet with checkboxes + counts per pet. Service filter icon (📋) opens bottom sheet with checkboxes + counts per service. Badge count shows on icons when filters are active. All three compose via AND logic in filteredData.

---

## Change 3: Appointment Cards — borderRadius 0 + Offset Shadow + 2px Border

### Where
`VetConnect/src/screens/ClientAppointments.js` — card styles (lines 1145-1154)

### How

**REPLACE the card + historyCard styles:**

```js
card: {
  backgroundColor: COLORS.white,
  padding: 15,
  borderRadius: 0,           // already 0, keep
  marginBottom: 20,           // was 15, increase for shadow clearance
  borderWidth: 2,             // was 1
  borderColor: COLORS.border, // was '#eee'
},
historyCard: {
  opacity: 0.85,
  backgroundColor: COLORS.cream, // was '#FAFAFA'
},
```

**ADD a card shadow wrapper:** The neubrutalist offset shadow requires a positioned View behind the card. Wrap each card in `renderItem` with an outer `View`:

In `renderItem` (line 614), replace:
```jsx
<View style={[styles.card, isHistory && styles.historyCard]}>
```
with:
```jsx
<View style={styles.cardOuter}>
  <View style={styles.cardShadow} />
  <View style={[styles.card, isHistory && styles.historyCard]}>
```
and close with an extra `</View>` after the card's closing `</View>` (after line 800).

**ADD shadow styles:**
```js
cardOuter: {
  marginBottom: 20,
},
cardShadow: {
  position: 'absolute',
  top: 4,
  left: 4,
  right: -4,
  bottom: -4,
  backgroundColor: COLORS.brand,
},
```

And **remove** `marginBottom` from the `card` style (shadow wrapper handles spacing).

**Done when:** Every appointment card has borderRadius 0, 2px COLORS.border, and a 4px Espresso offset shadow behind it.

---

## Change 4: Status Badges — borderRadius 0

### Where
`VetConnect/src/screens/ClientAppointments.js` — line 1175

### How
```js
// BEFORE:
status: { ... borderRadius: 4, ... }
// AFTER:
status: { ... borderRadius: 0, ... }
```

The `getClientStatusColor` function returns `{ backgroundColor, color }` inline — those stay. Only the border radius changes.

**Done when:** Status badges are sharp rectangles, not rounded pills.

---

## Change 5: Action Buttons — borderRadius 0 + Press-Snap

### Where
`VetConnect/src/screens/ClientAppointments.js` — btn style (line 1187) and action buttons JSX (lines 696-791)

### How

The `btn` style already has `borderRadius: 0` (line 1187). The buttons need:

1. **Solid 2px border** on all buttons (some already have borderWidth:1, standardize to 2):
```js
btn: {
  paddingHorizontal: 12,
  paddingVertical: 8,   // was 6
  borderRadius: 0,
  borderWidth: 2,
  borderColor: COLORS.border,
},
```

2. **Press-snap interaction** — wrap each button's `onPress` with Animated translation, OR use a simpler approach: add `activeOpacity={0.7}` on all TouchableOpacity buttons (already default, verify), and add a pressed state transform. For simplicity and consistency with other neubrutalism screens, use the inline style override pattern:

In the JSX, add `style` override on press using a wrapper View:
```jsx
// Cancel button at line 700-717:
<TouchableOpacity
  style={[styles.btn, { backgroundColor: '#FFEBEE', borderColor: COLORS.danger }]}
  activeOpacity={0.8}
  onPress={() => handleCancelAppointment(item.id, item.serviceType || item.primaryService)}
>
```

3. **Replace hardcoded hex** in button backgrounds:
   - Cancel: `backgroundColor: '#FFEBEE'` -- keep (danger light, no token available)
   - Reschedule: `backgroundColor: '#E3F2FD'` -- keep (sky light, no token available)
   - Confirm: `backgroundColor: '#E8F5E9'` -- keep (success light, no token available)
   - Receipt: `backgroundColor: '#EFEBE9'` -- replace with `backgroundColor: COLORS.cream`
   - QR: stays `backgroundColor: COLORS.brand`

4. **Fix `receiptBtn` borderColor** from `'#ccc'` to `COLORS.borderLight`:
```js
receiptBtn: {
  backgroundColor: COLORS.cream,   // was '#EFEBE9'
  borderColor: COLORS.borderLight, // was '#ccc'
},
```

**Done when:** All action buttons have borderRadius 0, 2px solid borders, consistent token colors.

---

## Change 6: Follow-Up Ghost Banner — borderRadius 0 + Solid Orange Border

### Where
`VetConnect/src/screens/ClientAppointments.js` — followUp styles (lines 1297-1370)

### How

The `followUpCard` already has `borderRadius: 0` (line 1300). Fix:

1. **Replace hardcoded hex:**
```js
followUpCard: {
  ...
  backgroundColor: COLORS.warningBg,  // was '#FFF3E0' — new token
  borderWidth: 2,                     // was 1
  borderColor: COLORS.warning,        // was '#FFCC80'
  // REMOVE elevation, shadowColor, shadowOffset, shadowOpacity, shadowRadius
  // (native shadows are replaced by neubrutalist offset shadow)
},
```

2. **Replace `followUpAccent` borderRadius:**
```js
followUpAccent: {
  width: 4,
  backgroundColor: COLORS.warning,
  marginRight: 12,
  borderRadius: 0,    // was 2
},
```

3. **Add offset shadow wrapper** in `renderFollowUpRow` (line 560):
```jsx
<View key={item.id} style={{ marginBottom: 20 }}>
  <View style={styles.cardShadow} />
  <View style={styles.followUpCard}>
    ...
  </View>
</View>
```

**Done when:** Follow-up banner has borderRadius 0 on all elements, solid 2px orange border, no native shadow/elevation, 4px Espresso offset shadow behind it.

---

## Change 7: CaseDayCard Fixes — Hex Cleanup, pageWidth, Remove Constraints

### Where
`VetConnect/src/components/CaseDayCard.js`

### 7A. Hardcoded #FFF3E0 (line 358)

```js
// BEFORE:
caseHeader: {
  backgroundColor: '#FFF3E0',
  ...
}
// AFTER:
caseHeader: {
  backgroundColor: COLORS.warningBg,  // new token from mobileTokens.js
  ...
}
```

### 7B. pageWidth Drift Fix (line 99)

The card has `borderWidth: 2` (line 349) on each side = 4px total. Current `windowWidth - 40` does not account for this. The outer wrapper has `marginHorizontal: 20` = 40px. Plus 4px border = 44px.

```js
// BEFORE (line 99):
const pageWidth = windowWidth - 40;
// AFTER:
const pageWidth = windowWidth - 44;
```

### 7C. Remove Height Constraints

**Remove `minHeight: 180`** from `pager` style (line 418):
```js
// BEFORE:
pager: { minHeight: 180 },
// AFTER:
pager: {},
```

**Remove `maxHeight: 400`** from `dayPageScroll` style (line 428):
```js
// BEFORE:
dayPageScroll: { maxHeight: 400 },
// AFTER:
dayPageScroll: {},
```

**Done when:** CaseDayCard case header uses `COLORS.warningBg` instead of `#FFF3E0`, pages are 44px narrower than window (no horizontal overflow), and page content is not artificially clamped.

---

## Change 8: Inline Hex Cleanup Across Both Files

### ClientAppointments.js — All Remaining Hardcoded Hex

| Line | Current | Replacement |
|------|---------|-------------|
| 1121 | `backgroundColor: '#EFEBE9'` (tabContainer) | `COLORS.cream` |
| 1136 | `backgroundColor: '#EFEBE9'` (filterChip — DELETED in Change 2) | N/A |
| 1152 | `borderColor: '#eee'` (card) | `COLORS.borderLight` |
| 1154 | `backgroundColor: '#FAFAFA'` (historyCard) | `COLORS.cream` |
| 1160 | `backgroundColor: '#eee'` (divider) | `COLORS.borderLight` |
| 1190 | `backgroundColor: '#EFEBE9'` (receiptBtn) | `COLORS.cream` |
| 1192 | `borderColor: '#ccc'` (receiptBtn) | `COLORS.borderLight` |
| 1201 | `backgroundColor: '#FFEBEE'` (reasonText) | Keep (danger-light, scoped use) |
| 1217 | `rgba(0,0,0,0.6)` (modalBg) | Keep (standard overlay, no token) |
| 1236 | `backgroundColor: '#FFFAFA'` (receiptContent) | `COLORS.white` |
| 1242 | `borderColor: '#ccc'` (receiptContent) | `COLORS.borderLight` |
| 1271 | `borderTopColor: '#FFCDD2'` (receiptRefundRow) | Keep (danger-light border, scoped use) |
| 1272 | `backgroundColor: '#FFEBEE'` (receiptRefundRow) | Keep (danger-light bg, scoped use) |
| 1299 | `backgroundColor: '#FFF3E0'` (followUpCard) | `COLORS.warningBg` |
| 1309 | `borderColor: '#FFCC80'` (followUpCard) | `COLORS.warning` |
| 1375 | `borderTopColor: '#eee'` (timelineSection) | `COLORS.borderLight` |
| 1382 | `borderTopColor: '#eee'` (encounterSection) | `COLORS.borderLight` |
| 1401 | `backgroundColor: '#E3F2FD'` (rescheduleBtn) | Keep (sky-light, no token) |
| 1409 | `backgroundColor: '#E8F5E9'` (confirmBtn) | Keep (success-light, no token) |
| 1413 | `backgroundColor: '#E8F5E9'` (confirmedBadge) | Keep (success-light, no token) |
| 704 | `backgroundColor: '#FFEBEE'` (inline Cancel btn) | Keep (danger-light, inline) |

**Inline hex in JSX:**
- Line 617: `marginRight: 10` — fine, not hex
- Line 1019: `color: COLORS.accent` — already token
- No other inline hex in JSX besides the cancel button background

### CaseDayCard.js

| Line | Current | Replacement |
|------|---------|-------------|
| 358 | `backgroundColor: '#FFF3E0'` | `COLORS.warningBg` |

No other hardcoded hex in CaseDayCard — it already uses COLORS tokens throughout.

**Done when:** Zero instances of `#EFEBE9`, `#FAFAFA`, `#FFFAFA`, `#FFF3E0`, `#FFCC80` remain. Only status-scoped hex (`#FFEBEE`, `#E3F2FD`, `#E8F5E9`, `#FFCDD2`) and overlay rgba remain as acceptable exceptions.

---

## Change 9: Receipt Modal — borderRadius 0

### Where
`VetConnect/src/screens/ClientAppointments.js` — receipt modal styles (lines 1235-1293)

### How

The `receiptContent` already has `borderRadius: 0` (line 1238). Fix remaining issues:

1. **Replace receipt background and border:**
```js
receiptContent: {
  backgroundColor: COLORS.white,       // was '#FFFAFA'
  padding: 25,
  borderRadius: 0,
  width: '90%',
  borderStyle: 'solid',                // was 'dashed'
  borderWidth: 2,
  borderColor: COLORS.border,          // was '#ccc'
},
```

2. **Replace QR modal content style** to match:
```js
modalContent: {
  backgroundColor: COLORS.white,       // was 'white' string
  padding: 30,
  borderRadius: 0,
  alignItems: 'center',
  width: '85%',
  borderWidth: 2,
  borderColor: COLORS.border,
},
```

3. **Close button styling:**
```js
closeBtn: {
  marginTop: 20,
  paddingVertical: 10,
  paddingHorizontal: 20,
  alignSelf: 'center',
  borderWidth: 2,
  borderColor: COLORS.danger,
  borderRadius: 0,
  backgroundColor: COLORS.white,
},
closeText: {
  color: COLORS.danger,
  fontWeight: '900',
  fontSize: 14,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
},
```

**Done when:** Receipt modal and QR modal have borderRadius 0, solid 2px borders, neubrutalist close button.

---

## mobileTokens.js Prerequisite — Add warningBg Token

### Where
`VetConnect/src/theme/mobileTokens.js` — COLORS object (after line 20)

### How

Add to the Status section:
```js
// Status
success:     '#2E7D32',
warning:     '#E65100',
warningBg:   '#FFF3E0',  // NEW — light orange background for banners/headers
info:        '#1565C0',
```

**Done when:** `COLORS.warningBg` is available for import and resolves to `#FFF3E0`.

---

## Implementation Order

1. **mobileTokens.js** — add `warningBg` token (prerequisite for Changes 7, 8, 6)
2. **Change 1** — tab bar styles (mechanical, independent)
3. **Change 2** — filter redesign (critical path — state, useMemo, JSX, styles)
4. **Change 3** — card shadow wrapper (requires renderItem JSX changes)
5. **Change 4** — status badge borderRadius (one-line)
6. **Change 5** — action buttons (style changes + inline hex)
7. **Change 6** — follow-up ghost banner (style + shadow wrapper)
8. **Change 7** — CaseDayCard fixes (3 changes in separate file)
9. **Change 8** — remaining inline hex sweep
10. **Change 9** — receipt/QR modal styles

---

## Risk Assessment

1. **FlatList re-render on search** — filtering appointments on every keystroke is fine for <100 items typical per user. No debounce needed.
2. **Bottom sheet vs React Native Modal** — Modal with `animationType="slide"` + transparent overlay works identically to PetHistoryScreen's proven pattern. No third-party bottom sheet library needed.
3. **CaseDayCard pageWidth change** — if the card's outer wrapper marginHorizontal changes, this calculation breaks. The value `44` assumes `marginHorizontal: 20` (40px) + `borderWidth: 2` (4px). Both are in the same StyleSheet, coupled but stable.
4. **Height constraint removal on CaseDayCard** — removing minHeight/maxHeight means very short day pages (e.g., 1 line) might look odd. The content minimum (DAY label + status badge + time) is always >60px, so this is acceptable.
5. **Missing TextInput import** — verify `TextInput` is added to the react-native import. It is NOT currently imported in ClientAppointments.js.
6. **MaterialIcons not imported** — must add `import { MaterialIcons } from '@expo/vector-icons'` to ClientAppointments.js for checkbox icons in bottom sheets.

---

## Testing Checklist

- [ ] Tab bar renders with borderRadius 0, Sky Blue active indicator, cream text on active
- [ ] Search bar appears, typing filters appointments across petName/serviceType/diagnosis/assignedVet/auditReason
- [ ] Pet filter icon (🐾) opens bottom sheet with all pets + counts, checkboxes toggle, APPLY commits, CLEAR resets
- [ ] Service filter icon (📋) same behavior with service types
- [ ] Badge count on filter icons updates when filters are active
- [ ] All three filters compose (search AND pets AND services)
- [ ] Empty state "Clear Filters" button resets search + both filter Sets
- [ ] Appointment cards have 4px Espresso offset shadow, 2px border, borderRadius 0
- [ ] Status badges are flat rectangles (borderRadius 0)
- [ ] All action buttons have borderRadius 0, 2px borders
- [ ] Follow-up ghost banner has solid 2px orange border, offset shadow, no elevation
- [ ] CaseDayCard case header uses COLORS.warningBg (not hardcoded #FFF3E0)
- [ ] CaseDayCard pages do not overflow horizontally
- [ ] CaseDayCard pages expand to fit content (no 400px clamp)
- [ ] Receipt modal: borderRadius 0, solid 2px border, neubrutalist close button
- [ ] QR modal: borderRadius 0, solid 2px border
- [ ] Zero `#EFEBE9`, `#FAFAFA`, `#FFFAFA`, `#FFF3E0`, `#FFCC80` in file (grep verify)
- [ ] Build compiles with no errors
- [ ] Both Upcoming and History tabs render correctly with filters applied
