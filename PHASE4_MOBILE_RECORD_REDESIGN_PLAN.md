# T4.166 — PetHistoryScreen Record Content Layout Redesign

## Overview

Redesign the expanded record content in `PetHistoryScreen.js` to establish a diagnosis-first visual hierarchy, compact the screen header from 3 rows to 1, replace horizontal department filter chips with a scalable bottom sheet, upgrade the month picker with a year dropdown for multi-year histories, show the SOAP Subjective as "REASON FOR VISIT" for pet owners, restyle discharge as full-width cream "DISCHARGE NOTES", show all 7 vitals with "not taken" for missing values, compact the actions row, and remove per-record AI buttons (already done — only global FAB exists). Rename "GOING-HOME INSTRUCTIONS" to "DISCHARGE NOTES" across mobile + AI prompts.

**Locked decisions:** A (diagnosis-first hierarchy), A (large bold diagnosis: fontSize 20, fontWeight 900, COLORS.brand), "REASON FOR VISIT" label, all 7 vitals with "not taken", C (discharge visually dominant with cream bg), B (global AI FAB — already exists), C (department filter bottom sheet with multi-select + counts), F (year dropdown + month chips), white bg for clinical content / cream ONLY for discharge, discharge full-width (marginHorizontal:-16, paddingHorizontal:16), "GOING-HOME" renamed to "DISCHARGE NOTES" everywhere.

**Files touched:** PetHistoryScreen.js (primary, ~4300 lines), buildPetOwnerPrompt.js (1 line rename), PatientDashboard.jsx (already done in T4.167 — verify only).

**Split:** Day 1 (~2.5 hrs) = content reorder + header compaction + vitals grid + discharge rename/restyle + collapsed header simplification + actions compaction. Day 2 (~2 hrs) = department filter bottom sheet + year dropdown + expand-all-into-search + AI prompt rename + verification.

---

## Day 1: Content Hierarchy + Header Compaction (~2.5 hrs)

### Step 1: Header compaction — merge into single row

**What:** Replace the current `headerBox` (back button + centered "PETNAME's Chart" + 40px spacer) with a single compact header: `[<-] PETNAME'S CHART   N records`.

**Where:** `PetHistoryScreen.js` lines 2398-2409 (JSX) + lines 2684-2710 (styles)

**How:**
- Keep the `headerBox` View with flexDirection:'row', alignItems:'center'.
- Back button stays (styles.backBtn, TouchableOpacity with arrow-back-ios).
- Replace `headerTitle` Text to include record count inline: `{petName}'S CHART` left-aligned after the back button, with `flex:1`.
- Add record count Text next to it: `{filteredHistory.length} RECORDS` in `styles.recordCountHeader` (fontSize:11, fontWeight:'900', color:COLORS.textMuted, letterSpacing:1).
- Remove the `<View style={{ width: 40 }} />` spacer — no need for centering.
- Update `headerTitle` style: remove textTransform:'uppercase' (manually uppercase in JSX via `.toUpperCase()`), keep fontSize:18, fontWeight:'900'. Add `flex:1, marginLeft:12`.

**Done when:** Header shows as single row `[<-] PETNAME'S CHART   4 RECORDS` with no second or third row below it.

**Depends on:** Nothing.

---

### Step 2: Collapsed record header — date + vet only

**What:** Remove diagnosis text and status badge from the collapsed header. The collapsed row becomes: `date | vet name | expand chevron`. Diagnosis and status move inside expanded body only.

**Where:** `PetHistoryScreen.js` lines 1708-1731 (collapsedHeader JSX) + lines 2780-2818 (collapsed styles)

**How:**
- Remove `<Text style={styles.collapsedDiagnosis}>` (lines 1710-1712).
- Remove the `collapsedStatusPill` block (lines 1713-1721).
- Keep `collapsedDate`, `collapsedVet`, and the expand chevron MaterialIcons.
- `collapsedDate` keeps `minWidth:55`. `collapsedVet` gets `flex:1` instead of `maxWidth:65` — fills remaining space.
- Delete `collapsedDiagnosis` and `collapsedStatusPill`/`collapsedStatusText` from styles.

**Done when:** Collapsed record card shows only "May 5, 2026 | Dr. Santos | v" with no diagnosis text or status pill.

**Depends on:** Nothing.

---

### Step 3: Diagnosis hero — all diagnoses large bold, each on own line

**What:** Replace the current primary-only diagnosis display + "+N more" toggle with ALL diagnoses rendered as large bold text immediately. No toggle needed. Each diagnosis on its own line with severity inline.

**Where:** `PetHistoryScreen.js` lines 1802-1852 (diagnosisContainer JSX) + lines 2886-2966 (diagnosis styles)

**How:**
- Replace the entire `diagnosisContainer` block with a new hero section:
  ```jsx
  {/* DIAGNOSIS HERO — all diagnoses shown as large bold text */}
  {!isGrooming && (item.diagnoses?.length > 0 || item.diagnosis) && (
    <View style={styles.diagnosisHero}>
      {(item.diagnoses?.length > 0
        ? item.diagnoses
        : [{ name: item.diagnosis }]
      ).map((dx, i) => (
        <View key={i} style={i > 0 ? { marginTop: 4 } : undefined}>
          <Text style={styles.diagnosisHeroText}>
            {dx.name}{dx.severity ? ` (${dx.severity.toUpperCase()})` : ''}
          </Text>
          {dx.notes ? (
            <Text style={styles.diagnosisHeroNotes}>{dx.notes}</Text>
          ) : null}
        </View>
      ))}
    </View>
  )}
  ```
- New styles:
  - `diagnosisHero`: `{ marginBottom: 12 }`
  - `diagnosisHeroText`: `{ fontSize: 20, fontWeight: '900', color: COLORS.brand, lineHeight: 26 }`
  - `diagnosisHeroNotes`: `{ fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 2 }`
- Grooming records: no hero section — service chips in cardHeader are sufficient.
- Remove the `expandedDiagnoses` state, `toggleDiagnoses` callback, and all related UI ("+N more" toggle, extraDiagnosis rows).
- Delete unused styles: `diagnosisContainer`, `diagnosisText`, `statusBadge`, `statusText`, `severityPill`, `severityPillText`, `diagnosesToggle`, `extraDiagnosisRow`, `extraDiagnosisName`, `extraDiagnosisSeverity`, `extraDiagnosisSeverityText`, `diagnosisNotes`.

**Done when:** Expanded record shows all diagnoses immediately as large bold text with severity inline. No "+N more" toggle. Grooming records show no diagnosis hero.

**Depends on:** Nothing.

---

### Step 4: Status + Prognosis merged into one line

**What:** Merge `patientStatus` badge and `soap.prognosis` into a single inline text line below the diagnosis hero: "STABLE . PROGNOSIS: GOOD".

**Where:** `PetHistoryScreen.js` — replace lines 1802-1812 (status badge in diagnosisContainer) and lines 1854-1860 (prognosis row)

**How:**
- After the diagnosis hero (Step 3), add:
  ```jsx
  {!isGrooming && (item.patientStatus || item.soap?.prognosis) && (
    <View style={styles.statusPrognosisRow}>
      {item.patientStatus && (
        <Text style={[styles.statusPrognosisText, { color: statusColors.text }]}>
          {item.patientStatus.toUpperCase()}
        </Text>
      )}
      {item.patientStatus && item.soap?.prognosis && (
        <Text style={styles.statusPrognosisDot}>{' · '}</Text>
      )}
      {item.soap?.prognosis && (
        <Text style={styles.statusPrognosisText}>
          PROGNOSIS: {item.soap.prognosis.toUpperCase()}
        </Text>
      )}
    </View>
  )}
  ```
- New styles:
  - `statusPrognosisRow`: `{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }`
  - `statusPrognosisText`: `{ fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }`
  - `statusPrognosisDot`: `{ fontSize: 11, color: COLORS.textMuted }`
- Delete the standalone `prognosisRow`, `prognosisLabel`, `prognosisText` styles (lines 2968-2986).

**Done when:** Status and prognosis render as one compact line: "STABLE . PROGNOSIS: GOOD". No separate status badge or prognosis row.

**Depends on:** Step 3 (diagnosis hero exists above this line).

---

### Step 5: "REASON FOR VISIT" — show Subjective to pet owners

**What:** Show the SOAP Subjective text (the owner's own words / presenting complaint) with label "REASON FOR VISIT" in a subtle container. Reverses T2.8 for Subjective only. Objective and Plan stay hidden.

**Where:** `PetHistoryScreen.js` — insert new JSX block after status+prognosis line, before vitals. Around line 1784.

**How:**
- After the status+prognosis row (Step 4), add:
  ```jsx
  {/* T4.166: Subjective visible to pet owners as "REASON FOR VISIT" */}
  {!isGrooming && item.soap?.subjective && (
    <View style={styles.reasonForVisitBox}>
      <Text style={styles.reasonForVisitLabel}>REASON FOR VISIT</Text>
      <Text style={styles.reasonForVisitText}>{item.soap.subjective}</Text>
    </View>
  )}
  ```
- New styles:
  - `reasonForVisitBox`: `{ backgroundColor: COLORS.cream, borderWidth: 1, borderColor: COLORS.borderLight, padding: 12, marginBottom: 12, borderRadius: 0 }`
  - `reasonForVisitLabel`: `{ fontWeight: '900', fontSize: 10, color: COLORS.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }`
  - `reasonForVisitText`: `{ fontSize: 14, color: COLORS.textPrimary, lineHeight: 20 }`
- Do NOT remove the existing intake context box (T3.70) — that shows client/staff triage notes which are different from SOAP Subjective. Both can coexist. Intake notes come from the walk-in/booking process; Subjective is the vet's interview.

**Done when:** Expanded record shows "REASON FOR VISIT" section with the Subjective text when present. Objective and Plan remain hidden. Grooming records and records without subjective show nothing.

**Depends on:** Step 4 (precedes vitals in content order).

---

### Step 6: Vitals grid — all 7 shown, "not taken" for missing

**What:** Replace the current conditional vitals display (only shows vitals that have values) with a fixed 7-vital grid that always shows all 7. Missing vitals display "not taken" in muted italic.

**Where:** `PetHistoryScreen.js` lines 1870-1916 (vitals rendering) + lines 2988-3009 (vitals styles)

**How:**
- Replace the conditional `{!isGrooming && hasVitals && (...)}` block with:
  ```jsx
  {!isGrooming && (
    <View style={styles.vitalsGrid}>
      {[
        { label: 'WEIGHT', value: weightStr, unit: 'kg' },
        { label: 'TEMP', value: tempStr, unit: '°C' },
        { label: 'HR', value: hrStr, unit: 'bpm' },
        { label: 'RR', value: rrStr, unit: 'br/min' },
        { label: 'CRT', value: crtStr, unit: 'sec' },
        { label: 'BCS', value: bcsStr, unit: '/9' },
        { label: 'PAIN', value: painStr, unit: '/10' },
      ].map((v, i) => (
        <View key={i} style={styles.vitalsGridItem}>
          <Text style={styles.vitalsGridLabel}>{v.label}</Text>
          {v.value ? (
            <Text style={styles.vitalsGridValue}>{v.value} {v.unit}</Text>
          ) : (
            <Text style={styles.vitalsGridMissing}>not taken</Text>
          )}
        </View>
      ))}
    </View>
  )}
  ```
- Remove the `hasVitals` guard — always render for non-grooming records.
- New styles:
  - `vitalsGrid`: `{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }` — no background (sits on white record card).
  - `vitalsGridItem`: `{ alignItems: 'center', minWidth: 70, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: 0, backgroundColor: COLORS.cream }`
  - `vitalsGridLabel`: same as current `vitalLabel` (fontSize:10, fontWeight:'900', color:COLORS.textMuted, letterSpacing:0.5, textTransform:'uppercase', marginBottom:4)
  - `vitalsGridValue`: same as current `vitalValue` (fontSize:15, fontWeight:'900', color:COLORS.brand)
  - `vitalsGridMissing`: `{ fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' }`
- Delete old `vitalsBox`, `vitalItem`, `vitalLabel`, `vitalValue` styles.
- The `hasVitals` variable at line 1672 can stay — it may be used elsewhere for listHeader logic. Just remove it as a render guard on the vitals block.

**Done when:** All 7 vitals always render for non-grooming records. Measured vitals show values + units. Missing vitals show "not taken" in muted italic. Layout is a 4+3 grid that wraps naturally.

**Depends on:** Step 5 (vitals follow REASON FOR VISIT in content order).

---

### Step 7: Discharge section rename + full-width cream restyle

**What:** (a) Rename "GOING-HOME INSTRUCTIONS" to "DISCHARGE NOTES" in the section header. (b) Remove borders and card treatment. (c) Apply full-width cream background with negative margin. (d) Remove diagnosis repetition from discharge (shown once in hero only).

**Where:** `PetHistoryScreen.js` lines 2057-2176 (discharge JSX) + lines 3190-3358 (discharge styles)

**How:**
- **Header text rename:** Line 2077 — change `GOING-HOME INSTRUCTIONS` to `DISCHARGE NOTES`.
- **Remove diagnosis block:** Delete lines 2083-2087 (`ds.diagnosis` block inside discharge). Diagnosis is already shown in the hero (Step 3).
- **Restyle dischargeCard:** Replace the current bordered card style with full-width cream section:
  ```js
  dischargeSection: {          // renamed from dischargeCard
    marginTop: 12,
    marginHorizontal: -16,    // cancel parent padding (cardBody padding is 12, but record card inner is 12+4 from the original)
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: COLORS.cream,
    // NO borders — color shift is the separator
  },
  ```
  Note: `cardBody` has `padding: 12`. So `marginHorizontal: -12` would cancel it. But the task spec says -16/+16. Check the actual parent padding chain: `cardBody` (padding:12). So use `marginHorizontal: -12, paddingHorizontal: 12` to match actual parent. OR if the intent is to extend beyond the card entirely, use -16 and let the overflow:hidden on `recordCard` clip it.
  
  **Decision: use the parent padding.** `cardBody` has `padding: 12`, so use `marginHorizontal: -12, paddingHorizontal: 12` to exactly cancel and re-add.

- **Rename style keys:** `dischargeCard` -> keep name but update props. Actually, to minimize diff, keep style key `dischargeCard` but update its properties to the full-width cream pattern.
- **Update dischargeHeader style:** Change `color: COLORS.success` to `color: COLORS.accent` (standard section header color). Remove green theme.
- **Add icon:** Prepend a clipboard icon to the header: `<MaterialIcons name="assignment" size={14} color={COLORS.accent} />` before the "DISCHARGE NOTES" text.
- **dischargeHeaderRow:** keep as-is (flexDirection:'row', justifyContent:'space-between').

**Done when:** Discharge section renders as a full-width cream background with no borders. Header says "DISCHARGE NOTES" with clipboard icon. Diagnosis is NOT repeated (shown in hero only). Natural visual break from white clinical content above.

**Depends on:** Step 3 (diagnosis hero replaces the diagnosis-in-discharge).

---

### Step 8: PDF export rename

**What:** Rename "Going-Home Instructions" in the HTML PDF template to "Discharge Notes".

**Where:** `PetHistoryScreen.js` line 1527

**How:**
- Change `Going-Home Instructions` to `Discharge Notes` in the HTML template string.
- Line 1527: `` `<h3>Going-Home Instructions</h3>` `` becomes `` `<h3>Discharge Notes</h3>` ``

**Done when:** Downloaded visit summary PDF says "Discharge Notes" instead of "Going-Home Instructions".

**Depends on:** Nothing.

---

### Step 9: Actions row compaction — icon buttons instead of full-width button

**What:** Replace the full-width "Download Visit Summary" button with a compact horizontal icon row: [Download] [Share].

**Where:** `PetHistoryScreen.js` lines 2380-2388 (cardFooter JSX) + lines 3116-3128 (footer styles)

**How:**
- Replace the `cardFooter` block with:
  ```jsx
  <View style={styles.actionsRow}>
    <TouchableOpacity style={styles.actionBtn} onPress={() => generatePDF(item)}>
      <MaterialIcons name="picture-as-pdf" size={16} color={COLORS.accent} />
      <Text style={styles.actionBtnText}>Download</Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={styles.actionBtn}
      onPress={() => generatePDF(item)}
    >
      <MaterialIcons name="share" size={16} color={COLORS.accent} />
      <Text style={styles.actionBtnText}>Share</Text>
    </TouchableOpacity>
  </View>
  ```
  Note: The `generatePDF` function already uses `Sharing.shareAsync`, so both buttons effectively do the same thing (generate PDF then share). The Share button can call the same function — the OS share sheet handles the distinction between save and send. Alternatively, make Download use `Print.printToFileAsync` alone and Share use `Sharing.shareAsync`. For simplicity, both call `generatePDF` which already ends with `shareAsync`.
- New styles:
  - `actionsRow`: `{ flexDirection: 'row', gap: 12, paddingTop: 12, paddingHorizontal: 12, paddingBottom: 12 }`
  - `actionBtn`: `{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 2, borderColor: COLORS.border, borderRadius: 0, backgroundColor: COLORS.white }`
  - `actionBtnText`: `{ fontSize: 11, fontWeight: '900', color: COLORS.accent, textTransform: 'uppercase', letterSpacing: 0.5 }`
- Delete old `cardFooter`, `pdfBtn`, `pdfBtnText` styles.

**Done when:** Record footer shows two compact icon buttons [Download] [Share] instead of a full-width banner.

**Depends on:** Nothing.

---

### Step 10: Content reorder — establish the new sequence

**What:** Rearrange the expanded body content blocks in the following order:
1. Date + service chips + vet badge (cardHeader — already exists)
2. Diagnosis hero (Step 3)
3. Status + Prognosis line (Step 4)
4. REASON FOR VISIT (Step 5)
5. Intake notes (existing T3.70 — keep)
6. Assessment / VET'S NOTES (existing, only when no discharge)
7. Vitals grid (Step 6)
8. Legacy plan/instructions (when no discharge — existing)
9. Legacy prescriptions (when no discharge — existing)
10. Attachments (existing)
11. DISCHARGE NOTES (Step 7) — cream full-width
12. Vaccination record (existing)
13. Lab results (existing)
14. Amendments (existing)
15. Next visit reminder (existing)
16. Actions row (Step 9)

**Where:** `PetHistoryScreen.js` lines 1735-2395 (the entire `cardBody` expanded section)

**How:**
- Move JSX blocks to match the order above. The current order is:
  - cardHeader (date, services, vet)
  - intakeContext
  - diagnosisContainer (becomes hero)
  - prognosis
  - assessment
  - vitals
  - plan (legacy)
  - prescriptions (legacy)
  - attachments
  - discharge
  - vaccines
  - labs
  - amendments
  - next visit reminder
  - footer
- New order moves diagnosis hero and REASON FOR VISIT above intake notes; vitals move below assessment. Discharge stays in its position.
- This is a JSX block reordering only — no logic changes.

**Done when:** Expanded record content follows the specified hierarchy: diagnosis hero first, then status/prognosis, then REASON FOR VISIT, then clinical details, then discharge section in cream, then labs/vaccines/amendments, then actions.

**Depends on:** Steps 3, 4, 5, 6, 7, 9.

---

### Step 11: Cleanup — remove dead state and styles

**What:** Clean up state variables, callbacks, and style entries made dead by the changes above.

**Where:** `PetHistoryScreen.js` — multiple locations

**How:**
- Remove `expandedDiagnoses` state (line 961) and `toggleDiagnoses` callback (lines 963-973) — no longer needed since all diagnoses are shown.
- Remove unused style entries listed in Steps 3, 4, 6, 9.
- Remove the `T2.8 Path B` comment (line 1782) — no longer accurate since Subjective is now shown.
- Update the discharge JSX comment (line 2057) from `"Going-Home Instructions"` to `"Discharge Notes"`.

**Done when:** No dead code remains. Build is clean.

**Depends on:** All Day 1 steps.

---

## Day 2: Navigation + Filters + AI Prompt (~2 hrs)

### Step 12: Expand All toggle moved into search field endAdornment

**What:** Remove the separate `searchActionsRow` (record count + expand/collapse toggle) and embed the expand toggle as an icon button inside the search TextInput's endAdornment. Record count moves into the header (Step 1).

**Where:** `PetHistoryScreen.js` lines 2411-2445 (search bar JSX) + lines 3790-3821 (styles)

**How:**
- Delete the entire `searchActionsRow` View (lines 2431-2444).
- Inside `searchInputWrapper`, after the clear (X) button, add the expand/collapse icon button:
  ```jsx
  <TouchableOpacity onPress={toggleAll} style={styles.expandToggleInSearch}>
    <MaterialIcons
      name={allExpanded ? 'unfold-less' : 'unfold-more'}
      size={18}
      color={COLORS.accent}
    />
  </TouchableOpacity>
  ```
- Add a thin vertical separator before the icon: `<View style={styles.searchDivider} />` — `{ width: 1, height: 18, backgroundColor: COLORS.borderLight, marginHorizontal: 4 }`.
- New styles:
  - `expandToggleInSearch`: `{ padding: 4 }`
  - `searchDivider`: `{ width: 1, height: 18, backgroundColor: COLORS.borderLight, marginHorizontal: 4 }`
- Delete `searchActionsRow`, `recordCountBadge`, `expandAllBtn`, `expandAllText` styles.
- The record count is now shown in the header (Step 1).

**Done when:** Search bar has a divider + expand/collapse icon at the right end. No separate row for record count + expand all. One fewer row in the UI.

**Depends on:** Step 1 (record count moved to header).

---

### Step 13: Department filter bottom sheet

**What:** Replace horizontal filter chips (ALL, GENERAL, GROOMING, VACCINATION) with a filter icon button that opens a React Native Modal bottom sheet. Multi-select with checkboxes, item counts, CLEAR ALL + APPLY buttons. Filter icon shows badge when filters active.

**Where:** `PetHistoryScreen.js` — replace lines 2447-2474 (chip ScrollView) + add Modal

**How:**
- **State:** Replace `activeFilter` (string, single-select) with `activeFilters` (Set, multi-select). Initialize as `new Set()` (empty = all shown). Add `filterSheetOpen` state (boolean).
  ```js
  const [activeFilters, setActiveFilters] = useState(new Set());
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [pendingFilters, setPendingFilters] = useState(new Set());
  ```
- **Filter icon button:** Replace the `filterChipRow` ScrollView with:
  ```jsx
  <TouchableOpacity
    style={styles.filterIconBtn}
    onPress={() => {
      setPendingFilters(new Set(activeFilters));
      setFilterSheetOpen(true);
    }}
  >
    <MaterialIcons name="filter-list" size={20} color={COLORS.accent} />
    {activeFilters.size > 0 && (
      <View style={styles.filterBadge}>
        <Text style={styles.filterBadgeText}>{activeFilters.size}</Text>
      </View>
    )}
  </TouchableOpacity>
  ```
  Place this inside the `searchInputWrapper`, after the expand toggle (Step 12), separated by another `searchDivider`.

- **Department counts:** Compute per-department record counts:
  ```js
  const departmentCounts = useMemo(() => {
    const counts = new Map();
    history.forEach(r => {
      const dept = resolveDepartmentForRecord(r, departments);
      counts.set(dept, (counts.get(dept) || 0) + 1);
      if (r.vaccineAdministrations?.length > 0 || r.vaccineData) {
        counts.set('Vaccination', (counts.get('Vaccination') || 0) + 1);
      }
    });
    return counts;
  }, [history, departments]);
  ```

- **Bottom sheet Modal:**
  ```jsx
  <Modal
    visible={filterSheetOpen}
    transparent
    animationType="slide"
    onRequestClose={() => setFilterSheetOpen(false)}
  >
    <TouchableOpacity
      style={styles.filterOverlay}
      activeOpacity={1}
      onPress={() => setFilterSheetOpen(false)}
    >
      <View style={styles.filterSheet} onStartShouldSetResponder={() => true}>
        <View style={styles.filterSheetHandle} />
        <Text style={styles.filterSheetTitle}>FILTER BY DEPARTMENT</Text>
        <ScrollView style={styles.filterSheetScroll}>
          {filterOptions.filter(o => o !== 'All').map(opt => {
            const isChecked = pendingFilters.has(opt);
            const count = departmentCounts.get(opt) || 0;
            return (
              <TouchableOpacity
                key={opt}
                style={styles.filterSheetRow}
                onPress={() => {
                  setPendingFilters(prev => {
                    const next = new Set(prev);
                    if (next.has(opt)) next.delete(opt);
                    else next.add(opt);
                    return next;
                  });
                }}
              >
                <MaterialIcons
                  name={isChecked ? 'check-box' : 'check-box-outline-blank'}
                  size={22}
                  color={isChecked ? COLORS.sky : COLORS.textMuted}
                />
                <Text style={styles.filterSheetLabel}>{opt}</Text>
                <Text style={styles.filterSheetCount}>({count})</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={styles.filterSheetActions}>
          <TouchableOpacity
            onPress={() => setPendingFilters(new Set())}
            style={styles.filterSheetClearBtn}
          >
            <Text style={styles.filterSheetClearText}>CLEAR ALL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setActiveFilters(new Set(pendingFilters));
              setFilterSheetOpen(false);
            }}
            style={styles.filterSheetApplyBtn}
          >
            <Text style={styles.filterSheetApplyText}>APPLY FILTER</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  </Modal>
  ```

- **Update filteredHistory:** Change the filter logic (lines 650-656) from single `activeFilter` to multi-select `activeFilters`:
  ```js
  if (activeFilters.size > 0) {
    result = result.filter(r => {
      const dept = resolveDepartmentForRecord(r, departments);
      const isVax = r.vaccineAdministrations?.length > 0 || !!r.vaccineData;
      return activeFilters.has(dept) || (isVax && activeFilters.has('Vaccination'));
    });
  }
  ```

- **Remove:** The defensive reset useEffect (lines 579-583) that syncs activeFilter. Replace with equivalent for Set-based activeFilters (just clear if options change).
- **Delete** all `filterChipRow`, `filterChip`, `filterChipActive`, `filterChipText`, `filterChipTextActive` styles.
- **New styles:**
  - `filterIconBtn`: `{ padding: 4, position: 'relative' }`
  - `filterBadge`: `{ position: 'absolute', top: -4, right: -4, backgroundColor: COLORS.danger, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }`
  - `filterBadgeText`: `{ fontSize: 9, fontWeight: '900', color: COLORS.white }`
  - `filterOverlay`: `{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }`
  - `filterSheet`: `{ backgroundColor: COLORS.cream, borderTopWidth: 2, borderTopColor: COLORS.border, paddingBottom: 30, maxHeight: '60%' }`
  - `filterSheetHandle`: `{ width: 40, height: 4, backgroundColor: COLORS.borderLight, alignSelf: 'center', marginTop: 10, marginBottom: 16 }`
  - `filterSheetTitle`: `{ fontSize: 12, fontWeight: '900', color: COLORS.accent, letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 20, marginBottom: 12 }`
  - `filterSheetScroll`: `{ paddingHorizontal: 20 }`
  - `filterSheetRow`: `{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight }`
  - `filterSheetLabel`: `{ flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.brand }`
  - `filterSheetCount`: `{ fontSize: 12, color: COLORS.textMuted }`
  - `filterSheetActions`: `{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 16 }`
  - `filterSheetClearBtn`: `{ flex: 1, paddingVertical: 12, borderWidth: 2, borderColor: COLORS.border, borderRadius: 0, alignItems: 'center', backgroundColor: COLORS.white }`
  - `filterSheetClearText`: `{ fontSize: 11, fontWeight: '900', color: COLORS.accent, textTransform: 'uppercase', letterSpacing: 0.5 }`
  - `filterSheetApplyBtn`: `{ flex: 1, paddingVertical: 12, backgroundColor: COLORS.sky, borderWidth: 2, borderColor: COLORS.brand, borderRadius: 0, alignItems: 'center' }`
  - `filterSheetApplyText`: `{ fontSize: 11, fontWeight: '900', color: COLORS.cream, textTransform: 'uppercase', letterSpacing: 0.5 }`

**Done when:** Filter chips are gone. Filter icon button in the search bar opens a bottom sheet with checkboxes per department + Vaccination. Multi-select works. Badge count shows on icon. CLEAR ALL and APPLY FILTER buttons work. Filtered records update correctly.

**Depends on:** Step 12 (filter icon inside search bar).

---

### Step 14: Year dropdown + month chips upgrade

**What:** Add a year dropdown above the month chip strip when records span 2+ years. Year dropdown selects which year's months to show. For single-year pets, no dropdown — identical to current behavior.

**Where:** `PetHistoryScreen.js` lines 903-958 (month picker logic) + lines 2503-2530 (month picker JSX) + lines 3823-3855 (month picker styles)

**How:**
- **Derive years from months:**
  ```js
  const years = useMemo(() => {
    const yearSet = new Set();
    months.forEach(m => yearSet.add(m.key.split('-')[0]));
    return Array.from(yearSet).sort((a, b) => b - a); // newest first
  }, [months]);

  const [selectedYear, setSelectedYear] = useState('');

  // Auto-select most recent year when years change
  useEffect(() => {
    if (years.length > 0 && !selectedYear) {
      setSelectedYear(years[0]);
    }
  }, [years, selectedYear]);

  // Filter months to selected year
  const visibleMonths = useMemo(() => {
    if (!selectedYear) return months;
    return months.filter(m => m.key.startsWith(selectedYear));
  }, [months, selectedYear]);
  ```

- **Year dropdown JSX** (only when 2+ years):
  ```jsx
  {years.length >= 2 && (
    <View style={styles.yearDropdownRow}>
      {years.map(y => (
        <TouchableOpacity
          key={y}
          style={[
            styles.yearChip,
            selectedYear === y && styles.yearChipActive,
          ]}
          onPress={() => setSelectedYear(y)}
        >
          <Text style={[
            styles.yearChipText,
            selectedYear === y && styles.yearChipTextActive,
          ]}>
            {y}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )}
  ```
  Place this immediately above the existing month picker ScrollView.

- **Month chips:** Change `months.map(...)` to `visibleMonths.map(...)` in the month picker ScrollView (line 2512).

- **Bidirectional sync:** When scrolling updates `activeMonth`, also update `selectedYear` to match:
  ```js
  // In onViewableItemsChanged (line 948-958):
  const yearPart = key.split('-')[0];
  if (yearPart !== selectedYear) setSelectedYear(yearPart);
  ```
  This requires `selectedYear` to be accessible in the ref callback. Convert `onViewableItemsChanged` from a `useRef` to using `useCallback` with a wrapper, or use a ref for `selectedYear`. Safest: use a ref mirror:
  ```js
  const selectedYearRef = useRef('');
  // Keep in sync:
  useEffect(() => { selectedYearRef.current = selectedYear; }, [selectedYear]);
  ```
  Then in the ref callback, read `selectedYearRef.current`.

- **New styles:**
  - `yearDropdownRow`: `{ flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.screenPadding, paddingVertical: 6, backgroundColor: COLORS.cream }`
  - `yearChip`: `{ paddingHorizontal: 14, paddingVertical: 6, borderWidth: 2, borderColor: COLORS.borderLight, borderRadius: 0, backgroundColor: COLORS.white }`
  - `yearChipActive`: `{ backgroundColor: COLORS.accent, borderColor: COLORS.brand }`
  - `yearChipText`: `{ fontSize: 12, fontWeight: '900', color: COLORS.accent, letterSpacing: 0.5 }`
  - `yearChipTextActive`: `{ color: COLORS.cream }`

**Done when:** Pets with records in 2+ years show year chips above month chips. Tapping a year filters months to that year. Scrolling through records auto-updates both year and month selections. Single-year pets see no year chips.

**Depends on:** Nothing (independent of Day 1 steps).

---

### Step 15: AI prompt rename — buildPetOwnerPrompt.js

**What:** Rename "Going-Home Instructions" to "Discharge Notes" in the AI prompt builder.

**Where:** `VetConnect/src/utils/buildPetOwnerPrompt.js` lines 212-215

**How:**
- Line 212: Change comment from `"going-home instructions"` to `"discharge notes"`.
- Line 215: Change `'Going-Home Instructions:'` to `'Discharge Notes:'`.

**Done when:** AI prompt includes "Discharge Notes:" label instead of "Going-Home Instructions:".

**Depends on:** Nothing.

---

### Step 16: Verification pass

**What:** Full verification across all changes.

**Where:** All modified files.

**Checklist:**
- [ ] Header shows as single row with back button + pet name + record count.
- [ ] Collapsed records show date + vet only (no diagnosis, no status badge).
- [ ] Expanded records: diagnosis hero is first — large bold (fontSize:20, fontWeight:900), all diagnoses shown, severity inline.
- [ ] Status + Prognosis on one line below diagnosis.
- [ ] "REASON FOR VISIT" shows Subjective text when present, hidden for grooming.
- [ ] Vitals grid shows all 7 vitals. Missing = "not taken" in muted italic.
- [ ] Discharge section: cream background, full-width, no borders, header says "DISCHARGE NOTES" with clipboard icon. Diagnosis NOT repeated inside.
- [ ] Actions row: compact [Download] [Share] icon buttons.
- [ ] Filter chips replaced by filter icon in search bar. Bottom sheet opens with checkboxes + counts. Multi-select works. Badge count on icon.
- [ ] Year dropdown appears for 2+ year records. Month chips filter by selected year.
- [ ] Expand/collapse toggle is inside search bar (icon button).
- [ ] PDF export says "Discharge Notes".
- [ ] buildPetOwnerPrompt.js says "Discharge Notes:".
- [ ] PatientDashboard.jsx already says "Discharge Notes" (T4.167 — no change needed).
- [ ] Global AI FAB at bottom-right still works.
- [ ] No per-record AI buttons exist (confirmed: there are none — only global FAB).
- [ ] Build is clean.
- [ ] No `alert()`, `confirm()`, or `prompt()` calls introduced.
- [ ] All new styles use COLORS/SHADOW tokens. Zero inline hex.

**Done when:** All checkboxes pass. Build clean.

**Depends on:** All previous steps.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `marginHorizontal: -12` on discharge causes overflow/clip issues | `recordCard` has `overflow: 'hidden'` — negative margin will be clipped at card boundary. This is the desired behavior (cream extends to card edges). Test on both iOS and Android. |
| Multi-select filter logic change from string to Set breaks search interaction | The `filteredHistory` useMemo computes fresh on every state change. Both `activeFilters` and `searchText` are independent and compose correctly. |
| Year dropdown `onViewableItemsChanged` ref callback doesn't see updated `selectedYear` | Use a `useRef` mirror (`selectedYearRef`) updated via `useEffect`. The ref callback reads `.current` which is always fresh. |
| Removing `expandedDiagnoses` state causes stale closure in memoized callbacks | `expandedDiagnoses` and `toggleDiagnoses` are only used in the diagnosis container. After removal, no other code references them. |
| `soap.subjective` may contain clinical jargon not suitable for pet owners | This is a clinical decision by the vet — whatever they write in Subjective is the owner's presenting complaint. It's their own words echoed back. The label "REASON FOR VISIT" frames it appropriately. |

## External Blockers

**None.** All changes are client-side UI modifications. No Blaze upgrade, no Cloud Functions, no Firestore schema changes, no new npm packages.

## Estimated Effort

| Phase | Steps | Estimate |
|-------|-------|----------|
| Day 1 | Steps 1-11 | ~2.5 hrs |
| Day 2 | Steps 12-16 | ~2 hrs |
| **Total** | | **~4.5 hrs** |
