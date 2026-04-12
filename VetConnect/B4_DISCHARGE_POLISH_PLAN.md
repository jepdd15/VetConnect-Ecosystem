# B4 — Discharge Instructions Polish — Implementation Plan

## Header

**Feature**: Aesthetic polish pass on the dischargeSummary / vaccineData / labResults blocks inside `PetHistoryScreen.js`. No new data, no new collections — only turn inline-styled rectangles into soft-rounded, human-feeling cards.

**Effort estimate**: Small (~30-60 min). One file, no hook changes, no schema changes, no new dependencies.

**Core insight**: The functional render already exists (lines 294-361). It just looks like developer scaffolding — inline style objects, generic labels, no visual hierarchy. Owners receive genuinely useful clinical data in a presentation that looks provisional. B4 shifts that presentation to match the rest of the mobile app's warm, rounded aesthetic.

### In scope

1. Transform the discharge block (lines 294-322) into a "Going-Home Instructions" card with:
   - Visual header: `GOING-HOME INSTRUCTIONS`
   - `Diagnosis` sub-field promoted to `TL;DR` with plain-language styling
   - `Instructions` rendered as a `✓ Do this` list (split by newlines when multiline)
   - `Medications` rendered as a `💊 Meds` list with `name · qty · instructions` hierarchy
   - `Next Visit` rendered as a `📅 Follow up` callout
   - Optional `[Call us]` CTA linking to a hardcoded TODO phone number
2. Polish the vaccine block (lines 325-340) — same soft-rounded aesthetic, cleaner hierarchy, less inline-style bloat. Functional fields unchanged.
3. Polish the lab block (lines 343-361) — same aesthetic pass. Keep the color-coded status (`critical`/`abnormal`/`normal`).
4. Move all inline style objects into the existing `StyleSheet.create` block at the bottom of the file.

### Out of scope

- Adding new `dischargeSummary` fields (`plainSummary`, `homeCare[]`, `redFlags[]`, `returnIf[]`). These do not exist today and require admin-side authoring (A5 Discharge Summary Authoring). **Do NOT invent data.**
- Changing the underlying `dischargeSummary` shape or any Firestore fields.
- PDF export of the discharge card (the existing `generatePDF` button at the bottom of each record already exists).
- Share-to-system-sheet functionality.
- Push notifications tied to `nextVisit`.
- Rework of the vaccine or lab blocks beyond cosmetic polish.
- B5 follow-up booking CTA. See **Conditional CTA** section — the "Book Follow-Up" button is gated on B5 being shipped first.

---

## Prerequisites

None. No new dependencies, no new Firestore fields, no config changes.

The file already imports `Linking` from `react-native` (line 16) — we reuse it for the `[Call us]` CTA.

---

## Source-of-truth verification

Read these blocks before touching the file. Line numbers are accurate against the current repo state.

### 1. Current discharge block (`PetHistoryScreen.js` lines 294-322)

```jsx
{/* DISCHARGE SUMMARY */}
{item.dischargeSummary && (
  <View style={{ marginTop: 12, padding: 12, backgroundColor: '#E8F5E9', borderRadius: 8 }}>
    <Text style={{ fontWeight: '900', fontSize: 12, color: '#2E7D32', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
      DISCHARGE SUMMARY
    </Text>
    <Text style={{ fontSize: 13, color: '#333', marginBottom: 4 }}>
      Diagnosis: {item.dischargeSummary.diagnosis}
    </Text>
    <Text style={{ fontSize: 13, color: '#333', marginBottom: 4 }}>
      Instructions: {item.dischargeSummary.instructions}
    </Text>
    {item.dischargeSummary.medications?.length > 0 && (
      <View style={{ marginTop: 4 }}>
        <Text style={{ fontWeight: '800', fontSize: 11, color: '#555', marginBottom: 2 }}>MEDICATIONS:</Text>
        {item.dischargeSummary.medications.map((med, i) => (
          <Text key={i} style={{ fontSize: 12, color: '#333', marginLeft: 8 }}>
            • {med.name} x{med.qty} — {med.instructions}
          </Text>
        ))}
      </View>
    )}
    {item.dischargeSummary.nextVisit && (
      <Text style={{ fontSize: 12, color: '#E65100', fontWeight: '800', marginTop: 6 }}>
        Next Visit: {new Date(item.dischargeSummary.nextVisit?.seconds ? item.dischargeSummary.nextVisit.seconds * 1000 : item.dischargeSummary.nextVisit).toLocaleDateString()}
      </Text>
    )}
  </View>
)}
```

**Field shape (confirmed against `VetConnect-Admin/src/components/ClinicalWorkspace.jsx` lines 848-865)**:

```
dischargeSummary: {
  patientName: string,
  ownerName: string,
  visitDate: Timestamp,
  diagnosis: string,
  instructions: string,
  medications: Array<{ name: string, qty: number|string, instructions: string }>,
  nextVisit: string|Timestamp|null,
  recheckIn: string|null,
  vetName: string,
  patientStatus: string,
}
```

**Fields the architect's spec names that DO NOT exist**: `plainSummary`, `homeCare[]`, `redFlags[]`, `returnIf[]`. **Do NOT render them.** Fallback behavior:

- The `Do this` list renders from `instructions`. Split on `\n` if the string contains newlines; otherwise render as a single bullet.
- The `Call us if` red-flags section is OMITTED when no data exists (do not invent a static "contact us if unusual" fallback — it reads as filler).

### 2. Current vaccine block (lines 325-340)

Fields read: `vaccineName`, `manufacturer`, `lotNumber`, `routeOfAdmin`, `siteOfInjection`, `dueDate`. All strings. `dueDate` is a pre-formatted string (NOT a Timestamp).

### 3. Current lab block (lines 343-361)

Fields read: `testName`, `result`, `status`. Status is one of `'critical' | 'abnormal' | 'normal'` (or any other string → default to green).

### 4. Existing file pattern

The rest of the file uses `StyleSheet.create` (starting line 434) with BEM-style flat keys (`recordCard`, `cardHeader`, `planBox`, `rxBox`, etc.). The new discharge/vaccine/lab styles should follow the same naming convention and live in the same block.

### 5. Imports

Line 16 already imports `Linking`. No new imports needed.

### 6. Color palette already in use

- `#FFF8E1` — antique cream (container bg)
- `#8B4513` — saddle brown (espresso accent)
- `#2E7D32` — success green
- `#E65100` — warning amber
- `#D32F2F` — critical red
- `#1565C0` — info blue
- `#FFF3E0` — pale amber (existing `rxBox` bg)
- `#E3F2FD` — pale blue (existing `attachmentBox` chip bg)

Stick to these tokens. Do not introduce new colors.

---

## File-by-file change list

| # | File | Lines | Change |
|---|---|---|---|
| 1 | `VetConnect/src/screens/PetHistoryScreen.js` | 294-361 replaced, new styles appended to 434-712 block | Replace the three inline-styled blocks with polished component calls (or helper functions) + new StyleSheet entries. |

That is the only file.

---

## Data contract

**Reads only.** No writes.

| Field | Source | Handling |
|---|---|---|
| `item.dischargeSummary.diagnosis` | Parent render loop | Shown as `TL;DR` headline |
| `item.dischargeSummary.instructions` | Parent render loop | Split on `\n` into bullets |
| `item.dischargeSummary.medications[]` | Parent render loop | Rendered as cards with `name · qty · instructions` |
| `item.dischargeSummary.nextVisit` | Parent render loop | Rendered as date callout. Handles both Timestamp `{ seconds }` and plain string. |
| `item.dischargeSummary.vetName` | NEW — not currently displayed | Optional signature line at the bottom of the card |
| `item.dischargeSummary.patientStatus` | NEW — not currently displayed | Optional status pill next to the header |
| `item.vaccineData.*` | Parent render loop | Same fields as today, polished layout |
| `item.labResults[]` | Parent render loop | Same fields as today, polished layout |

**New fields rendered but not written**: `vetName` and `patientStatus`. Both already exist in the current write path from `ClinicalWorkspace.handleSaveConsult` lines 863-864 — they are just not displayed on mobile. Verified against the admin source.

---

## Phase breakdown

### Phase 1 — Extract inline style helpers

**Goal**: Replace the three inline style blocks with references to new named keys in `StyleSheet.create`. Pure refactor with no visual change yet.

**Steps**:

1. Open `VetConnect/src/screens/PetHistoryScreen.js`.
2. Scroll to the `StyleSheet.create` block (line 434).
3. Append the new style keys (full list in Phase 2 below — but add the placeholder keys here first).
4. Replace each inline `style={{ ... }}` in the three blocks (lines 294-361) with `style={styles.<newKey>}`.

**Checkpoint**: The UI renders identically to before. This is a no-op for users; it exists so the subsequent phases don't have to chase inline styles anywhere.

### Phase 2 — Discharge card redesign

**Goal**: Replace the green rectangle with the "Going-Home Instructions" card described in the architect's spec.

**Replacement JSX** (replaces lines 294-322):

```jsx
{/* DISCHARGE SUMMARY — polished as "Going-Home Instructions" */}
{item.dischargeSummary && (() => {
  const ds = item.dischargeSummary;
  const doThisItems = (ds.instructions || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  const nextVisitDate = ds.nextVisit
    ? new Date(ds.nextVisit?.seconds ? ds.nextVisit.seconds * 1000 : ds.nextVisit)
    : null;
  const nextVisitStr = nextVisitDate
    ? nextVisitDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : null;

  return (
    <View style={styles.dischargeCard}>
      <View style={styles.dischargeHeaderRow}>
        <Text style={styles.dischargeHeader}>GOING-HOME INSTRUCTIONS</Text>
        {ds.patientStatus && (
          <Text style={styles.dischargeStatusPill}>{ds.patientStatus}</Text>
        )}
      </View>

      {ds.diagnosis && (
        <View style={styles.dischargeTldrBlock}>
          <Text style={styles.dischargeTldrLabel}>TL;DR</Text>
          <Text style={styles.dischargeTldrText}>{ds.diagnosis}</Text>
        </View>
      )}

      {doThisItems.length > 0 && (
        <View style={styles.dischargeSection}>
          <Text style={styles.dischargeSectionLabel}>✓ Do this</Text>
          {doThisItems.map((line, i) => (
            <Text key={i} style={styles.dischargeBullet}>• {line}</Text>
          ))}
        </View>
      )}

      {ds.medications && ds.medications.length > 0 && (
        <View style={styles.dischargeSection}>
          <Text style={styles.dischargeSectionLabel}>💊 Medications</Text>
          {ds.medications.map((med, i) => (
            <View key={i} style={styles.dischargeMedRow}>
              <Text style={styles.dischargeMedName}>{med.name}</Text>
              <Text style={styles.dischargeMedMeta}>
                ×{med.qty || 1} — {med.instructions || 'Use as directed'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {nextVisitStr && (
        <View style={styles.dischargeNextVisit}>
          <Text style={styles.dischargeNextVisitIcon}>📅</Text>
          <Text style={styles.dischargeNextVisitText}>
            Follow up <Text style={styles.dischargeNextVisitDate}>{nextVisitStr}</Text>
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.dischargeCallBtn}
        onPress={() => Linking.openURL('tel:+639000000000')}
        // TODO: replace hardcoded number with clinic_settings.phone when that field lands
      >
        <Text style={styles.dischargeCallBtnText}>📞 Call us</Text>
      </TouchableOpacity>

      {ds.vetName && (
        <Text style={styles.dischargeSignature}>Signed by {ds.vetName}</Text>
      )}
    </View>
  );
})()}
```

**New styles to append to `StyleSheet.create`**:

```js
dischargeCard: {
  marginTop: 14,
  padding: 16,
  backgroundColor: '#F1F8E9',
  borderRadius: 16,
  borderWidth: 1,
  borderColor: '#C5E1A5',
  shadowColor: '#2E7D32',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 4,
  elevation: 2,
},
dischargeHeaderRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 12,
},
dischargeHeader: {
  fontSize: 12,
  fontWeight: '900',
  color: '#2E7D32',
  letterSpacing: 1.2,
},
dischargeStatusPill: {
  fontSize: 10,
  fontWeight: '800',
  color: '#1B5E20',
  backgroundColor: '#DCEDC8',
  paddingHorizontal: 8,
  paddingVertical: 3,
  borderRadius: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
},
dischargeTldrBlock: {
  marginBottom: 12,
  paddingLeft: 10,
  borderLeftWidth: 3,
  borderLeftColor: '#8B4513',
},
dischargeTldrLabel: {
  fontSize: 10,
  fontWeight: '900',
  color: '#8B4513',
  letterSpacing: 1,
  marginBottom: 2,
},
dischargeTldrText: {
  fontSize: 15,
  color: '#3E2723',
  fontWeight: '600',
  lineHeight: 20,
},
dischargeSection: {
  marginBottom: 12,
},
dischargeSectionLabel: {
  fontSize: 12,
  fontWeight: '900',
  color: '#2E7D32',
  marginBottom: 6,
  letterSpacing: 0.5,
},
dischargeBullet: {
  fontSize: 14,
  color: '#3E2723',
  lineHeight: 20,
  marginLeft: 6,
  marginBottom: 3,
},
dischargeMedRow: {
  backgroundColor: '#FFFFFF',
  borderRadius: 10,
  padding: 10,
  marginBottom: 6,
  borderWidth: 1,
  borderColor: '#E0E0E0',
},
dischargeMedName: {
  fontSize: 14,
  fontWeight: '800',
  color: '#3E2723',
},
dischargeMedMeta: {
  fontSize: 12,
  color: '#666',
  fontStyle: 'italic',
  marginTop: 2,
},
dischargeNextVisit: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#FFF3E0',
  padding: 12,
  borderRadius: 12,
  marginBottom: 12,
  borderWidth: 1,
  borderColor: '#FFCC80',
},
dischargeNextVisitIcon: {
  fontSize: 18,
  marginRight: 8,
},
dischargeNextVisitText: {
  fontSize: 13,
  color: '#8B4513',
  flex: 1,
},
dischargeNextVisitDate: {
  fontWeight: '900',
  color: '#E65100',
},
dischargeCallBtn: {
  backgroundColor: '#8B4513',
  paddingVertical: 12,
  borderRadius: 12,
  alignItems: 'center',
  marginBottom: 8,
},
dischargeCallBtnText: {
  color: 'white',
  fontWeight: '900',
  fontSize: 14,
  letterSpacing: 0.5,
},
dischargeSignature: {
  fontSize: 11,
  color: '#888',
  fontStyle: 'italic',
  textAlign: 'right',
  marginTop: 4,
},
```

**Checkpoint**: Navigate to PetHistoryScreen on a pet with at least one medical record that has a `dischargeSummary`. The block now shows:

- Rounded green card with soft shadow
- `GOING-HOME INSTRUCTIONS` header + patientStatus pill
- `TL;DR` block with diagnosis
- `✓ Do this` list (one bullet per newline in instructions, or single bullet if no newlines)
- `💊 Medications` cards (white background, rounded, one per med)
- `📅 Follow up <long date>` callout
- `📞 Call us` brown button
- `Signed by Dr. X` small italic line

### Phase 3 — Vaccine block polish

**Replacement JSX** (replaces lines 325-340):

```jsx
{/* VACCINATION RECORD */}
{item.vaccineData && (
  <View style={styles.vaccineCard}>
    <Text style={styles.vaccineHeader}>💉 VACCINATION RECORD</Text>
    <Text style={styles.vaccineName}>{item.vaccineData.vaccineName}</Text>
    <View style={styles.vaccineGrid}>
      {item.vaccineData.manufacturer && (
        <View style={styles.vaccineCell}>
          <Text style={styles.vaccineCellLabel}>MFR</Text>
          <Text style={styles.vaccineCellValue}>{item.vaccineData.manufacturer}</Text>
        </View>
      )}
      {item.vaccineData.lotNumber && (
        <View style={styles.vaccineCell}>
          <Text style={styles.vaccineCellLabel}>LOT</Text>
          <Text style={styles.vaccineCellValue}>{item.vaccineData.lotNumber}</Text>
        </View>
      )}
      {item.vaccineData.routeOfAdmin && (
        <View style={styles.vaccineCell}>
          <Text style={styles.vaccineCellLabel}>ROUTE</Text>
          <Text style={styles.vaccineCellValue}>{item.vaccineData.routeOfAdmin}</Text>
        </View>
      )}
      {item.vaccineData.siteOfInjection && (
        <View style={styles.vaccineCell}>
          <Text style={styles.vaccineCellLabel}>SITE</Text>
          <Text style={styles.vaccineCellValue}>{item.vaccineData.siteOfInjection}</Text>
        </View>
      )}
    </View>
    {item.vaccineData.dueDate && (
      <View style={styles.vaccineDueBanner}>
        <Text style={styles.vaccineDueText}>⏰ Next dose due {item.vaccineData.dueDate}</Text>
      </View>
    )}
  </View>
)}
```

**New styles**:

```js
vaccineCard: {
  marginTop: 12,
  padding: 14,
  backgroundColor: '#FFF8E1',
  borderRadius: 16,
  borderWidth: 1,
  borderColor: '#FFE0B2',
},
vaccineHeader: {
  fontSize: 11,
  fontWeight: '900',
  color: '#E65100',
  letterSpacing: 1.2,
  marginBottom: 6,
},
vaccineName: {
  fontSize: 16,
  fontWeight: '900',
  color: '#3E2723',
  marginBottom: 10,
},
vaccineGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 8,
  marginBottom: 10,
},
vaccineCell: {
  backgroundColor: 'white',
  borderRadius: 8,
  paddingVertical: 6,
  paddingHorizontal: 10,
  borderWidth: 1,
  borderColor: '#EEEEEE',
  minWidth: 70,
},
vaccineCellLabel: {
  fontSize: 9,
  color: '#888',
  fontWeight: '900',
  letterSpacing: 0.5,
  marginBottom: 1,
},
vaccineCellValue: {
  fontSize: 12,
  color: '#3E2723',
  fontWeight: '700',
},
vaccineDueBanner: {
  backgroundColor: '#FFEBEE',
  padding: 8,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: '#FFCDD2',
},
vaccineDueText: {
  fontSize: 12,
  color: '#D32F2F',
  fontWeight: '800',
  textAlign: 'center',
},
```

**Checkpoint**: Vaccine records on the timeline show a warm amber card with a four-cell grid of manufacturer/lot/route/site and a red due-date banner at the bottom.

### Phase 4 — Lab results block polish

**Replacement JSX** (replaces lines 343-361):

```jsx
{/* LAB RESULTS */}
{item.labResults?.length > 0 && (
  <View style={styles.labCard}>
    <Text style={styles.labHeader}>🔬 LAB RESULTS</Text>
    {item.labResults.map((lab, i) => {
      const statusKey = (lab.status || 'normal').toLowerCase();
      const statusColor =
        statusKey === 'critical' ? '#D32F2F' :
        statusKey === 'abnormal' ? '#E65100' :
        '#2E7D32';
      const statusBg =
        statusKey === 'critical' ? '#FFEBEE' :
        statusKey === 'abnormal' ? '#FFF3E0' :
        '#E8F5E9';
      return (
        <View key={i} style={styles.labRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.labTestName}>{lab.testName}</Text>
            <Text style={styles.labResult}>{lab.result}</Text>
          </View>
          <Text style={[styles.labStatusPill, { color: statusColor, backgroundColor: statusBg }]}>
            {statusKey.toUpperCase()}
          </Text>
        </View>
      );
    })}
  </View>
)}
```

**New styles**:

```js
labCard: {
  marginTop: 12,
  padding: 14,
  backgroundColor: '#E3F2FD',
  borderRadius: 16,
  borderWidth: 1,
  borderColor: '#BBDEFB',
},
labHeader: {
  fontSize: 11,
  fontWeight: '900',
  color: '#1565C0',
  letterSpacing: 1.2,
  marginBottom: 10,
},
labRow: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: 'white',
  padding: 10,
  borderRadius: 10,
  marginBottom: 6,
  borderWidth: 1,
  borderColor: '#E0E0E0',
},
labTestName: {
  fontSize: 13,
  fontWeight: '800',
  color: '#3E2723',
},
labResult: {
  fontSize: 12,
  color: '#666',
  marginTop: 1,
},
labStatusPill: {
  fontSize: 10,
  fontWeight: '900',
  letterSpacing: 0.5,
  paddingHorizontal: 8,
  paddingVertical: 3,
  borderRadius: 8,
  overflow: 'hidden',
  textTransform: 'uppercase',
},
```

**Checkpoint**: Lab rows now appear as stacked white cards with a colored status pill on the right. Critical/abnormal/normal keep their semantic red/amber/green treatment.

---

## Edge case handling

| Case | Decision | Where enforced |
|---|---|---|
| `dischargeSummary.instructions` is null/empty | `Do this` section is skipped entirely (no empty label) | `doThisItems.length > 0` guard |
| `dischargeSummary.instructions` is a single line (no `\n`) | Renders as a single bullet | `split('\n').filter(Boolean)` yields one element |
| `dischargeSummary.medications` is empty/missing | Section skipped | `ds.medications && ds.medications.length > 0` guard |
| `dischargeSummary.nextVisit` is a Firestore Timestamp (not a Date) | Handled by the existing `seconds` branch | `nextVisit?.seconds ? seconds * 1000 : nextVisit` |
| `dischargeSummary.vetName` missing | Signature line skipped | `ds.vetName && ...` |
| `dischargeSummary.patientStatus` missing | Status pill skipped | `ds.patientStatus && ...` |
| `vaccineData.manufacturer` / `lotNumber` / `routeOfAdmin` / `siteOfInjection` missing | Each cell rendered conditionally — missing cells simply don't appear | Per-cell `&&` guard |
| `vaccineData.dueDate` missing | Due-date banner skipped | `dueDate && ...` |
| `labResults[i].status` missing or unknown | Defaults to green/`normal` | `(lab.status \|\| 'normal').toLowerCase()` |
| User taps Call Us with no phone dialer (rare) | `Linking.openURL` quietly fails; no alert | Acceptable — document as minor |
| Hardcoded phone number | TODO comment in source; replace with `clinic_settings.phone` when that field is added | Comment |

---

## Conditional CTA: Book Follow-Up

The architect's note says: *IF B5 has already landed, add a "Book Follow-Up" CTA to the discharge card; otherwise skip it.*

**Decision path**:

- **If B5 is already shipped when B4 is implemented**: Add a second button next to `Call us`:
  ```jsx
  <TouchableOpacity
    style={styles.dischargeBookBtn}
    onPress={() => navigation.navigate('BookAppointment', {
      prefillPetId: petId,
      prefillServiceType: item.serviceType,
      prefillDate: ds.nextVisit,
      fromFollowUp: false, // This is NOT a ghost-backed navigation
    })}
  >
    <Text style={styles.dischargeBookBtnText}>📅 Book Follow-Up</Text>
  </TouchableOpacity>
  ```
  Note that `petId` is available from `route.params` at the top of the screen. The `fromFollowUp: false` flag ensures `BookAppointment` does not try to cancel a nonexistent ghost.
- **If B5 has NOT shipped yet**: OMIT the button entirely. B4 ships with only the `Call us` CTA. The follow-up deep link lives in B5's follow-up row — no competing path.

**Reason for the gate**: Two deep-link entry points with different behaviors (one ghost-backed, one not) would diverge silently. Better to have one canonical entry (the follow-up row in ClientAppointments) until B5 validates the cascade logic.

---

## Testing plan

Run each on an Expo device or simulator:

1. **Rich discharge record**: Open PetHistoryScreen on a pet with a recent consult that has `diagnosis`, multi-line `instructions`, 2+ medications, `nextVisit`, `vetName`, `patientStatus`. Confirm all sections render and the card looks balanced.
2. **Minimal discharge record**: Same pet, older record with only `diagnosis` and `instructions`. Confirm empty sections are suppressed (no `💊 Medications` header with no meds under it).
3. **Single-line instructions**: Record where `instructions` is `"Rest for 5 days and monitor appetite"`. Confirm it renders as a single bullet.
4. **Multi-line instructions**: Record where `instructions` is `"Rest for 5 days\nMonitor appetite\nReturn if no improvement"`. Confirm three bullets.
5. **Call us tap**: Tap the brown `Call us` button. Confirm the device opens the phone dialer with the TODO number (on simulator this shows a "no phone app" toast — acceptable).
6. **Timestamp vs date handling**: Records created via the admin save path have `nextVisit` as an ISO string; records from older paths may have `{ seconds }`. Confirm both render the date correctly.
7. **Vaccine record with all fields**: Confirm four cells appear, due-date banner at bottom in red.
8. **Vaccine record with missing fields**: Confirm only populated cells render, no empty slots.
9. **Lab results with mixed statuses**: Create a record with one normal, one abnormal, one critical lab row. Confirm all three status pills render with correct color.
10. **Pet with NO clinical records**: The empty state at lines 417-426 is unchanged — verify it still renders.
11. **Pet with grooming-only records**: Grooming records don't have `dischargeSummary`/`vaccineData`/`labResults` — confirm the polished blocks simply don't appear, and the existing grooming render is unaffected.

---

## Rollback plan

All changes are scoped to a single file and are additive-by-substitution. To roll back:

1. `git revert <b4-commit-sha>` — restores the inline-styled rectangles. No schema changes, no data changes, nothing else to unwind.
2. **Partial rollback**: If only the Call-Us button breaks (e.g., invalid phone format), comment out the `<TouchableOpacity>` for `dischargeCallBtn` — the rest of the card remains functional.

No Firestore writes means no data cleanup needed.

---

## Appendix — copy/text strings

- Card header: `GOING-HOME INSTRUCTIONS`
- Section labels: `TL;DR`, `✓ Do this`, `💊 Medications`, (implicit `📅 Follow up`)
- Follow-up template: `Follow up <long-form date>` (e.g. `Follow up Monday, April 15`)
- Signature template: `Signed by <vetName>`
- Call button: `📞 Call us`
- Vaccine header: `💉 VACCINATION RECORD`
- Vaccine due template: `⏰ Next dose due <date>`
- Lab header: `🔬 LAB RESULTS`
- Status pill values: `NORMAL`, `ABNORMAL`, `CRITICAL`

All copy is warm-but-concise. No apology copy, no filler.
