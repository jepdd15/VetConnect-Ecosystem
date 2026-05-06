# T4.175 — SuperCard Redesign: Live In-Clinic Patient Portal

## Overview

The SuperCard is the pet owner's single window into what is happening with their pet during a clinic visit. It appears pinned above the tab row in ClientAppointments whenever an active in-clinic appointment exists (arrived, in-consult, on-hold, dispensing, billing, confined). The current implementation shows basic info (pet name, service type, status badge, ticket, vet name, started time, global queue-ahead, timeline, wait metrics, Call Clinic + Directions buttons) but misses the features that answer the four questions every waiting pet owner has: "Where is my pet?", "How much longer?", "How much will it cost?", "Did they get my message?"

This redesign adds per-service progress tracking, stage-aware "What's Next" messaging, encounter items preview, financial transparency, context fields (department, notes, allergies, weight, case day), emergency badge, and a case-day horizontal swipe pager for multi-day hospitalizations/carry-overs. The Directions button is removed (pet owner is already at the clinic for active visits). All data comes from existing appointment document fields written by ClinicalWorkspace and the queue system -- zero new Firestore queries except for the case-chain ancestor lookup.

**Locked decisions:**
- B: Collapsed mini header = pet name + status badge + dept-filtered queue position (service name, ticket, vet move to expanded body)
- A: Financial preview at billing + dispensing stages only
- Skip: Vaccination nudge (no extra reads)
- Call Clinic only (Directions button removed)
- A: Encounter items show names + qty (not prices) at dispensing stage

**Split recommendation:** Day 1 (~2.5 hrs) covers features 1-8, Day 2 (~1.5-2 hrs) covers features 9-10 (case day swipe + duration timestamps).

---

## Files Affected

| File | Role |
|---|---|
| `VetConnect/src/components/SuperCard.js` (370 lines) | Primary target -- all 10 features |
| `VetConnect/src/screens/ClientAppointments.js` | Props: dept-filtered queueAhead, case chain resolution, pass services/pet data |
| `VetConnect/src/utils/buildCaseChains.js` | Already exists -- used to resolve ancestor chain for case day swipe |
| `VetConnect/src/theme/mobileTokens.js` | Tokens only -- no changes needed, just reference |
| `VetConnect/src/utils/statusLabels.js` | Read-only -- getClientStatusLabel, getClientStatusColor, isActiveStatus |
| `VetConnect/src/components/CaseDayCard.js` | Pattern reference for horizontal FlatList pager + dot indicators |

---

## Day 1 (~2.5 hrs): Core SuperCard Redesign

### Feature 1: Collapsed Mini Header Simplification

**What:** Reduce the always-visible mini header to three elements only: pet avatar + pet name, status badge (pulsing dot + pill), and department-filtered queue position. Move service name, ticket number, and vet name into the expanded body.

**Where:** `SuperCard.js` lines 117-161 (mini header JSX), lines 248-303 (related styles).

**How:**

1. Remove from mini header:
   - Lines 133-137: The `serviceType` / `primaryService` text block -- moves to expanded body
   - Lines 150-152: The `ticketMini` ticket label -- moves to expanded body

2. Add to mini header (right side, replacing ticket):
   - Queue position text: `queueAhead` rendered as compact text when non-null.
   - Format: `queueAhead === 0 ? "Next!" : `${queueAhead} ahead``
   - Style: same position as old `miniHeaderRight`, but show queue count instead of ticket.

3. The `statusRow` (pulsing dot + status pill) stays in `miniHeaderRight`.

4. Add to expanded body (top of `superCardBody`, before assigned vet):
   - Service name line: `appointment.serviceType || appointment.primaryService`
   - Ticket label: same `ticketLabel` format already computed (line 100-103)
   - These join the existing vet + time lines in the expanded body.

**Styles to update:**
- `miniHeaderInfo` stays as `flex: 1` for pet name only
- Remove `serviceType` style usage from mini header
- Remove `ticketMini` from mini header
- Add `queuePositionMini` style: `{ fontSize: 11, color: COLORS.sky, fontWeight: 'bold', marginTop: 3 }`

**Done when:** Collapsed SuperCard shows only pet avatar + pet name + status pill + queue position. Service name and ticket appear only when expanded.

---

### Feature 2: Per-Service Progress

**What:** Read `appointment.services[]` array. Each service has `serviceStatus` (pending/in-progress/completed), `serviceStartedAt`, and `serviceCompletedAt` timestamps written by ClinicalWorkspace `handleToggleServiceProgress` (line 1554-1598). Render a compact service progress list.

**Where:** `SuperCard.js` expanded body, new section after vet/time/queue info lines.

**How:**

1. Derive services list:
   ```js
   const services = appointment.services || [];
   ```

2. Render when `services.length > 0`:
   ```jsx
   {services.length > 0 && (
     <View style={styles.serviceProgressSection}>
       <Text style={styles.sectionLabel}>SERVICES</Text>
       {services.map((svc, i) => {
         const status = svc.serviceStatus || 'pending';
         const icon = status === 'completed' ? '✓' : status === 'in-progress' ? '⏳' : '○';
         const label = status === 'completed' ? 'done' : status === 'in-progress' ? 'in progress' : 'waiting';
         // Duration computed in Feature 9
         return (
           <Text key={svc.id || i} style={[styles.serviceProgressLine, status === 'in-progress' && { color: COLORS.sky }]}>
             {icon} {svc.name || 'Service'} — {label}
           </Text>
         );
       })}
     </View>
   )}
   ```

3. Styles:
   - `serviceProgressSection`: `{ marginTop: 8, marginBottom: 4, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: 8 }`
   - `sectionLabel`: `{ fontSize: 11, fontWeight: '900', color: COLORS.accentLight, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }`
   - `serviceProgressLine`: `{ fontSize: 13, color: COLORS.accent, marginBottom: 3, paddingLeft: 4 }`

**Done when:** Expanding SuperCard shows each booked service with its current status icon and label (waiting/in progress/done).

---

### Feature 3: "What's Next" Stage-Aware Text

**What:** Display a pet-owner-friendly guidance message derived from `appointment.status`. Tells the pet owner what is happening and what comes next.

**Where:** `SuperCard.js` expanded body, immediately after the status/vet/time info block, before service progress.

**How:**

1. Create a helper function at the top of the file:
   ```js
   const getWhatsNext = (status, caseDay) => {
     switch (status) {
       case 'arrived':
         return "Waiting to be seen by the veterinarian.";
       case 'in-consult':
         return "Your pet is with the veterinarian. Next: pharmacy preparation.";
       case 'dispensing':
         return "Medications are being prepared. Next: checkout.";
       case 'billing':
         return "Ready for checkout. Please proceed to the counter.";
       case 'confined':
         return `Hospitalized — your pet is being monitored.${caseDay > 1 ? ` Day ${caseDay} of care.` : ''}`;
       case 'on-hold':
         return "Consultation paused. Your pet is resting.";
       default:
         return null;
     }
   };
   ```

2. Render in the expanded body:
   ```jsx
   {(() => {
     const whatsNext = getWhatsNext(appointment.status, appointment.caseDay);
     return whatsNext ? (
       <View style={styles.whatsNextBox}>
         <Text style={styles.whatsNextText}>{whatsNext}</Text>
       </View>
     ) : null;
   })()}
   ```

3. Styles:
   - `whatsNextBox`: `{ backgroundColor: COLORS.cream, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: COLORS.sky }`
   - `whatsNextText`: `{ fontSize: 13, color: COLORS.accent, fontWeight: '600' }`

**Done when:** Each active status shows a unique, pet-owner-friendly message explaining the current stage and what comes next.

---

### Feature 4: Encounter Items at Dispensing

**What:** Show medication/product names + quantities from `appointment.encounterItems` when the appointment reaches dispensing status. Uses `productClass` (from T4.142) to pick the right emoji. Names and qty only -- no prices (prices shown in Feature 5 at billing).

**Where:** `SuperCard.js` expanded body, new section visible only when `status === 'dispensing'`.

**How:**

1. Gate on status:
   ```js
   const showEncounterItems = appointment.status === 'dispensing' && (appointment.encounterItems || []).length > 0;
   ```

2. Render:
   ```jsx
   {showEncounterItems && (
     <View style={styles.encounterSection}>
       <Text style={styles.sectionLabel}>PREPARING FOR YOU</Text>
       {(appointment.encounterItems || []).map((item, i) => {
         const emoji = (item.productClass === 'medicine' || item.isDrug) ? '💊'
                     : item.productClass === 'medical_supply' ? '🩹'
                     : '📦';
         return (
           <Text key={i} style={styles.encounterLine}>
             {emoji} {item.name}{item.qty > 1 ? ` x${item.qty}` : ''}
           </Text>
         );
       })}
     </View>
   )}
   ```

3. Styles:
   - `encounterSection`: `{ marginTop: 6, marginBottom: 4, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: 8 }`
   - `encounterLine`: `{ fontSize: 13, color: COLORS.accent, marginBottom: 3, paddingLeft: 4 }`

**Done when:** At dispensing status, SuperCard shows each encounter item with product emoji and quantity. Items hidden at all other statuses.

---

### Feature 5: Financial Preview at Billing + Dispensing

**What:** Show estimated total, deposit paid, and balance due from appointment fields. Only visible at `dispensing` and `billing` statuses (locked decision: A).

**Where:** `SuperCard.js` expanded body, section below encounter items (or below service progress when no encounter items).

**How:**

1. Gate:
   ```js
   const showFinancial = appointment.status === 'dispensing' || appointment.status === 'billing';
   ```

2. Derive values from the appointment doc:
   ```js
   const estimatedTotal = appointment.finalTotal || (appointment.encounterItems || []).reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
   const depositPaid = appointment.depositPaid || 0;
   const balanceDue = Math.max(0, estimatedTotal - depositPaid);
   ```
   - `finalTotal` is written by ClinicalWorkspace at sign-off (CW line 1982).
   - `depositPaid` is written by POSModal (line 637, 914).
   - If `finalTotal` is not yet set (pre-sign-off dispensing), compute from encounterItems sum.

3. Render:
   ```jsx
   {showFinancial && estimatedTotal > 0 && (
     <View style={styles.financialSection}>
       <Text style={styles.sectionLabel}>ESTIMATED COST</Text>
       <Text style={styles.financialLine}>Estimated total: ₱{estimatedTotal.toLocaleString()}</Text>
       {depositPaid > 0 && (
         <Text style={styles.financialLine}>Deposit paid: ₱{depositPaid.toLocaleString()}</Text>
       )}
       {depositPaid > 0 && (
         <Text style={[styles.financialLine, { fontWeight: 'bold', color: COLORS.warning }]}>
           Balance due: ₱{balanceDue.toLocaleString()}
         </Text>
       )}
     </View>
   )}
   ```

4. Styles:
   - `financialSection`: `{ marginTop: 6, marginBottom: 4, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: 8 }`
   - `financialLine`: `{ fontSize: 13, color: COLORS.accent, marginBottom: 3, paddingLeft: 4 }`

**Done when:** At dispensing/billing, SuperCard shows estimated total + deposit + balance. Hidden at all other statuses. Zero deposit line hidden when no deposit.

---

### Feature 6: Context Fields

**What:** Surface additional appointment context that answers common pet-owner questions: department, disambiguated timestamps, client notes echo, allergy warning, weight, scheduled vs arrived time, follow-up context, case day.

**Where:** `SuperCard.js` expanded body. Distributed across several UI positions within the body.

**How — each sub-field:**

**(6a) Department name** — below service name in expanded body:
```jsx
{appointment.serviceCategory && (
  <Text style={styles.infoLine}>🏥 {appointment.serviceCategory}</Text>
)}
```
`serviceCategory` is written at booking (BookAppointment.js line 752) and walk-in (WalkInModal.jsx line 242).

**(6b) Disambiguated time** — replace current generic "Started at" with status-aware text:
```js
const timeLabel = appointment.status === 'arrived' ? 'Checked in at'
  : appointment.status === 'in-consult' ? 'Consult started at'
  : appointment.status === 'dispensing' ? 'Pharmacy since'
  : appointment.status === 'billing' ? 'At checkout since'
  : 'Started at';
```
Replace line 173: `<Text style={styles.infoLine}>🕐 Started at {startedTime}</Text>` with:
```jsx
{startedTime ? <Text style={styles.infoLine}>🕐 {timeLabel} {startedTime}</Text> : null}
```

**(6c) Scheduled vs Arrived** — show both when both exist:
```jsx
{appointment.scheduledDate && appointment.timeArrived && (
  <Text style={styles.infoLineSmall}>
    Appointment: {formatFirestoreTime(appointment.scheduledDate)} · Arrived: {formatFirestoreTime(appointment.timeArrived)}
  </Text>
)}
```
Style `infoLineSmall`: `{ fontSize: 11, color: COLORS.accentLight, marginBottom: 3, paddingLeft: 4, fontStyle: 'italic' }`

**(6d) Client notes echo** — show what the pet owner typed at booking:
```jsx
{appointment.clientNotes ? (
  <View style={styles.notesEcho}>
    <Text style={styles.notesEchoText}>📝 You mentioned: "{appointment.clientNotes}"</Text>
  </View>
) : null}
```
`clientNotes` is written at booking (BookAppointment.js line 764).
Styles: `notesEcho`: `{ backgroundColor: '#FFF8E1', paddingHorizontal: 8, paddingVertical: 6, marginBottom: 6 }`, `notesEchoText`: `{ fontSize: 12, color: COLORS.accent, fontStyle: 'italic' }`

**(6e) Allergy warning** — highlighted when non-empty/non-"None":
```js
const petAllergies = appointment.petAllergies || '';
const hasAllergies = petAllergies.trim().length > 0 && petAllergies.toUpperCase() !== 'NONE';
```
```jsx
{hasAllergies && (
  <View style={styles.allergyBadge}>
    <Text style={styles.allergyText}>⚠ Allergies: {petAllergies}</Text>
  </View>
)}
```
`petAllergies` written at booking (BookAppointment.js line 747) and walk-in (WalkInModal.jsx line 450).
Styles: `allergyBadge`: `{ backgroundColor: '#FFEBEE', paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6 }`, `allergyText`: `{ fontSize: 12, color: COLORS.danger, fontWeight: 'bold' }`

**(6f) Weight** — compact display:
```jsx
{appointment.petWeight ? (
  <Text style={styles.infoLine}>⚖️ Weight: {appointment.petWeight} kg</Text>
) : null}
```
`petWeight` written at booking (BookAppointment.js line 746).

**(6g) Follow-up context** — when `isFollowUp === true`:
```jsx
{appointment.isFollowUp && (
  <Text style={styles.infoLineSmall}>🔄 Follow-up visit</Text>
)}
```

**(6h) Case day for hospitalization** — when `caseDay > 1`:
```jsx
{appointment.caseDay > 1 && (
  <Text style={styles.infoLine}>📅 Day {appointment.caseDay} of care</Text>
)}
```

**Done when:** Expanding SuperCard shows department, status-aware timestamps, client notes echo, allergy warning (red), weight, follow-up badge, and case day when applicable. All fields degrade gracefully when data is absent.

---

### Feature 7: Emergency Badge

**What:** When `appointment.priority === 'high'` or `appointment.systemChips` includes an entry starting with `'EMERGENCY'`, render a prominent red emergency badge in the mini header.

**Where:** `SuperCard.js` mini header, between pet name and status pill.

**How:**

1. Derive:
   ```js
   const isEmergency = appointment.priority === 'high' ||
     (appointment.systemChips || []).some(c => c.startsWith('EMERGENCY'));
   ```

2. Render in mini header (after `miniHeaderInfo`, before `miniHeaderRight`):
   ```jsx
   {isEmergency && (
     <View style={styles.emergencyBadge}>
       <Text style={styles.emergencyText}>🚨 EMERGENCY</Text>
     </View>
   )}
   ```

3. Styles:
   - `emergencyBadge`: `{ backgroundColor: '#FFEBEE', paddingHorizontal: 6, paddingVertical: 2, marginRight: 4 }`
   - `emergencyText`: `{ fontSize: 10, fontWeight: '900', color: COLORS.danger, textTransform: 'uppercase', letterSpacing: 0.5 }`

**Done when:** Emergency walk-ins show a red "EMERGENCY" badge in the collapsed mini header. Non-emergency appointments show nothing.

---

### Feature 8: CTA Simplification — Call Clinic Only

**What:** Remove the Directions button entirely. Make Call Clinic the only CTA, rendered full-width.

**Where:** `SuperCard.js` lines 205-227 (CTA row), line 30-38 (handleDirections function), lines 346-368 (CTA styles).

**How:**

1. Delete `handleDirections` function (lines 30-38).
2. Delete the `clinicAddress` prop from the component signature (line 49). Keep accepting it silently for backward compat or remove from caller.
3. Replace the CTA row:
   ```jsx
   <TouchableOpacity
     style={[styles.ctaBtn, !clinicPhone && styles.ctaBtnDisabled]}
     onPress={async () => {
       if (!clinicPhone) return;
       try { await Linking.openURL(`tel:${clinicPhone}`); }
       catch (error) { console.error('[SuperCard.handleCallClinic]:', error.message); }
     }}
     disabled={!clinicPhone}
   >
     <Text style={styles.ctaBtnText}>📞 Call Clinic</Text>
   </TouchableOpacity>
   ```
4. Remove `ctaRow` wrapper (no longer needed for a single button).
5. Update styles:
   - Remove `ctaRow`, `ctaBtnSecondary`, `ctaBtnSecondaryText` styles.
   - `ctaBtn` keeps `flex: 1` but remove `flex` since it is now standalone. Use `width: '100%'` or just let it stretch naturally inside the body padding.

6. In `ClientAppointments.js` line 808, remove `clinicAddress` prop:
   ```jsx
   <SuperCard appointment={activeAppointment} clinicPhone={clinicPhone} queueAhead={queueAhead} avgWaitMins={avgWaitMins} />
   ```

**Done when:** SuperCard CTA section shows a single full-width "Call Clinic" button. No Directions button. `handleDirections` function deleted.

---

### Feature 9: serviceProgress Timestamps for Duration Display

**What:** When a service has `serviceCompletedAt` and `serviceStartedAt` timestamps, compute and display the duration: "done (15 min)" instead of just "done". Written by ClinicalWorkspace `handleToggleServiceProgress` (line 1577-1578).

**Where:** `SuperCard.js` service progress section (Feature 2).

**How:**

1. Enhance the service progress renderer from Feature 2:
   ```js
   const formatServiceDuration = (svc) => {
     if (svc.serviceStatus !== 'completed') return '';
     const start = svc.serviceStartedAt;
     const end = svc.serviceCompletedAt;
     if (!start || !end) return '';
     const startMs = typeof start.toDate === 'function' ? start.toDate().getTime() : new Date(start).getTime();
     const endMs = typeof end.toDate === 'function' ? end.toDate().getTime() : new Date(end).getTime();
     const mins = Math.max(0, Math.round((endMs - startMs) / 60000));
     if (mins === 0) return '';
     return ` (${mins} min)`;
   };
   ```

2. Update the label in the service progress map:
   ```js
   const durationStr = formatServiceDuration(svc);
   const label = status === 'completed' ? `done${durationStr}` : status === 'in-progress' ? 'in progress' : 'waiting';
   ```

**Done when:** Completed services show their actual duration in minutes: "done (15 min)". Services without timestamps just show "done".

---

### Department-Filtered Queue Position (ClientAppointments.js change)

**What:** The current queue-ahead listener (ClientAppointments.js lines 189-219) counts ALL arrived appointments with a lower queue number across ALL departments. This is misleading in a multi-department clinic -- a grooming patient ahead in the global queue is irrelevant to a consultation patient. Filter to the same `serviceCategory` as the active appointment.

**Where:** `ClientAppointments.js` lines 189-219.

**How:**

1. Add `serviceCategory` to the dependencies. The active appointment already has `serviceCategory`:
   ```js
   const activeArrivedCategory = activeArrived?.serviceCategory || null;
   ```

2. Add `serviceCategory` filter to the onSnapshot query:
   ```js
   const q = query(
     collection(db, "appointments"),
     where("status", "==", "arrived"),
     where("scheduledDateStr", "==", todayStr),
     where("serviceCategory", "==", activeArrivedCategory)
   );
   ```
   This requires a composite Firestore index on `(status, scheduledDateStr, serviceCategory)` -- but since this is a client-side filter on an existing listener, we can alternatively keep the broad query and filter client-side:
   ```js
   snap.forEach(d => {
     const data = d.data();
     const sameCategory = (data.serviceCategory || 'General') === (activeArrivedCategory || 'General');
     if (sameCategory && data.queueNumber < activeArrivedQueueNum && d.id !== activeArrivedId) ahead++;
   });
   ```
   Client-side filtering avoids index creation. The query already scopes to arrived+today which is a small result set.

3. Add `activeArrivedCategory` to the useEffect dependency array.

**Done when:** Queue-ahead count reflects only patients in the same department, not the global queue. A pet in Grooming ahead does not inflate the queue count for a Consultation patient.

---

## Day 2 (~1.5-2 hrs): Case Day Swipe + Polish

### Feature 10: Case Day Swipe Pager

**What:** When the active appointment has `caseDay > 1` (multi-day hospitalization or carry-over), resolve the full case chain using `buildCaseChains`, then wrap the SuperCard body in a horizontal FlatList pager with dot indicators. Active day auto-focused on mount. Active day shows full live SuperCard content. Past days show read-only frozen content (timeline + encounter summary if available). Only the active day shows the Call Clinic CTA.

**Where:** `SuperCard.js` (pager logic + multi-day rendering), `ClientAppointments.js` (case chain resolution + prop passing).

**How — ClientAppointments.js changes:**

1. After the existing `activeAppointment` derivation (line 803), resolve the case chain when `activeAppointment.caseDay > 1`:

   ```js
   const [caseChainForSuperCard, setCaseChainForSuperCard] = useState([]);

   useEffect(() => {
     if (!activeAppointment || (activeAppointment.caseDay || 1) <= 1) {
       setCaseChainForSuperCard([]);
       return;
     }
     // Use buildCaseChains on all appointments to find the chain containing the active one.
     const { chains } = buildCaseChains(appointments);
     for (const [, members] of chains) {
       if (members.some(m => m.id === activeAppointment.id)) {
         setCaseChainForSuperCard(members);
         return;
       }
     }
     // Fallback: active appointment alone (chain not found -- maybe ancestors are in history)
     setCaseChainForSuperCard([activeAppointment]);
   }, [activeAppointment?.id, appointments]);
   ```

   **Important:** The case chain members are already in the `appointments` array (same owner, loaded by the onSnapshot listener). `buildCaseChains` will group them by `originApptId`. If ancestors are in history (different `scheduledDateStr`), they are still in the `appointments` array because the query has no date filter -- it loads ALL appointments for the owner.

2. Pass to SuperCard:
   ```jsx
   <SuperCard
     appointment={activeAppointment}
     clinicPhone={clinicPhone}
     queueAhead={queueAhead}
     avgWaitMins={avgWaitMins}
     caseChain={caseChainForSuperCard}
     salesByAppt={salesByAppt}
   />
   ```

**How — SuperCard.js changes:**

1. Add new props: `caseChain = []`, `salesByAppt = {}`.

2. Add state and refs for the pager (same pattern as CaseDayCard.js lines 57-107):
   ```js
   const [activePageIndex, setActivePageIndex] = useState(0);
   const pagerRef = useRef(null);
   const { width: windowWidth } = useWindowDimensions();
   const pageWidth = windowWidth - 32; // account for card margins
   ```

3. Add viewability tracking (same pattern as CaseDayCard.js lines 93-98):
   ```js
   const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });
   const onViewableItemsChanged = useCallback(({ viewableItems }) => {
     if (viewableItems.length > 0) setActivePageIndex(viewableItems[0].index ?? 0);
   }, []);
   const getItemLayout = useCallback((_data, index) => ({
     length: pageWidth, offset: pageWidth * index, index,
   }), [pageWidth]);
   ```

4. Determine if multi-day mode is active:
   ```js
   const isMultiDay = caseChain.length > 1;
   const activeDayIndex = isMultiDay
     ? caseChain.findIndex(a => a.id === appointment.id)
     : 0;
   ```

5. Auto-scroll to active day on mount:
   ```js
   useEffect(() => {
     if (isMultiDay && pagerRef.current && activeDayIndex > 0) {
       pagerRef.current.scrollToIndex({ index: activeDayIndex, animated: false });
     }
   }, [isMultiDay, activeDayIndex]);
   ```

6. **Rendering strategy:**
   - If `!isMultiDay`: render the current single-day SuperCard body (all features 1-9) directly. No FlatList.
   - If `isMultiDay`: render the mini header as before, then a case header ("CASE: N DAYS"), then a horizontal FlatList with `renderDayPage`:

   ```jsx
   {isMultiDay && superCardExpanded && (
     <>
       <View style={styles.caseHeaderBar}>
         <Text style={styles.caseHeaderText}>CASE: {caseChain.length} DAYS</Text>
       </View>
       <FlatList
         ref={pagerRef}
         data={caseChain}
         keyExtractor={(appt) => appt.id}
         renderItem={({ item: dayAppt, index }) => {
           const isActiveDay = dayAppt.id === appointment.id;
           return (
             <View style={{ width: pageWidth }}>
               {isActiveDay
                 ? renderActiveDayContent(dayAppt)
                 : renderPastDayContent(dayAppt, index)}
             </View>
           );
         }}
         horizontal
         pagingEnabled
         showsHorizontalScrollIndicator={false}
         getItemLayout={getItemLayout}
         onViewableItemsChanged={onViewableItemsChanged}
         viewabilityConfig={viewabilityConfig.current}
         initialScrollIndex={activeDayIndex}
       />
       {/* Dot indicators */}
       <View style={styles.dotRow}>
         {caseChain.map((_, i) => (
           <View key={i} style={[styles.dot, {
             backgroundColor: i === activePageIndex ? COLORS.sky : COLORS.borderLight,
           }]} />
         ))}
       </View>
     </>
   )}
   ```

7. `renderActiveDayContent(dayAppt)` — returns the full live SuperCard body (features 1-9): vet, time, queue, what's-next, service progress, encounter items, financial, context fields, CTA. Extracted as a function that takes the appointment.

8. `renderPastDayContent(dayAppt, index)` — read-only frozen content for past case days:
   ```jsx
   const renderPastDayContent = (dayAppt, index) => {
     const dayNum = dayAppt.caseDay || (index + 1);
     const dayDate = formatDisplayDate(dayAppt.scheduledDate, { weekday: 'short', month: 'short', day: 'numeric' });
     const dayStatusColors = getClientStatusColor(dayAppt.status);
     const dayStatusLabel = getClientStatusLabel(dayAppt.status);
     const dayStatusIcon = getClientStatusIcon(dayAppt.status);

     return (
       <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
         <Text style={styles.dayLabel}>DAY {dayNum} · {dayDate}</Text>
         <View style={[styles.dayStatusBadge, { backgroundColor: dayStatusColors.backgroundColor }]}>
           <Text style={[styles.dayStatusText, { color: dayStatusColors.color }]}>
             {dayStatusIcon} {dayStatusLabel.toUpperCase()}
           </Text>
         </View>
         {/* Past day timeline */}
         {dayAppt.clinicalPulse && (() => {
           const events = buildVisitTimeline(dayAppt.clinicalPulse, {
             isActive: false,
             assignedVet: dayAppt.assignedVet,
             signedOffAt: dayAppt.signedOffAt,
           });
           return events.length > 0 ? <VisitTimeline events={events} isActive={false} collapsed={true} onToggle={() => {}} /> : null;
         })()}
         {/* Past day encounter summary */}
         {dayAppt.encounterItems?.length > 0 && dayAppt.status === 'completed' && (
           <EncounterSummary appointment={dayAppt} collapsed={true} onToggle={() => {}} onViewRecord={() => {}} onRebook={() => {}} salesTotal={salesByAppt?.[dayAppt.id]?.total ?? null} hideViewRecord={true} />
         )}
       </ScrollView>
     );
   };
   ```

9. Add new imports:
   ```js
   import { FlatList, ScrollView, useWindowDimensions } from 'react-native';
   import { useCallback } from 'react';
   import EncounterSummary from './EncounterSummary';
   ```
   Note: `ScrollView` and `FlatList` are already available from `react-native`. `useCallback` needs to be added to the `react` import (line 11).

10. New styles for case day pager:
    ```js
    caseHeaderBar: { backgroundColor: '#FFF3E0', paddingHorizontal: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
    caseHeaderText: { fontSize: 11, fontWeight: '900', color: COLORS.warning, textTransform: 'uppercase', letterSpacing: 1 },
    dayLabel: { fontSize: 12, fontWeight: '900', color: COLORS.warning, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
    dayStatusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6 },
    dayStatusText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
    dotRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8, gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    ```

**Done when:** A SuperCard for a case day 3 hospitalization shows a swipeable horizontal pager with 3 pages. Day 3 (active) auto-focuses on mount with full live content. Days 1-2 show read-only frozen content. Dot indicators track the current page. Only the active day shows the Call Clinic CTA.

---

## Summary of Changes by File

### `VetConnect/src/components/SuperCard.js`

| Change | Feature | Lines Affected |
|---|---|---|
| Remove service name + ticket from mini header | F1 | 129-152 |
| Add queue position to mini header | F1 | 141-153 |
| Add emergency badge to mini header | F7 | After 138 |
| Add service name + ticket to expanded body | F1 | After 164 |
| Add department context | F6a | Body |
| Replace "Started at" with status-aware label | F6b | 173 |
| Add scheduled vs arrived times | F6c | Body |
| Add "What's Next" box | F3 | Body |
| Add per-service progress section | F2 | Body |
| Add service duration display | F9 | Within F2 |
| Add client notes echo | F6d | Body |
| Add allergy warning | F6e | Body |
| Add weight display | F6f | Body |
| Add follow-up + case day context | F6g/h | Body |
| Add encounter items at dispensing | F4 | Body |
| Add financial preview at billing/dispensing | F5 | Body |
| Remove Directions button + handleDirections | F8 | 30-38, 221-226 |
| Make Call Clinic full width | F8 | 206-227 |
| Add horizontal FlatList pager for multi-day | F10 | New section |
| Add dot indicators | F10 | New section |
| Add past-day read-only rendering | F10 | New section |
| Add case header bar for multi-day | F10 | New section |
| New imports: FlatList, ScrollView, useWindowDimensions, useCallback, EncounterSummary | F10 | Lines 11-18 |
| ~15 new styles | All | StyleSheet |

### `VetConnect/src/screens/ClientAppointments.js`

| Change | Feature | Lines Affected |
|---|---|---|
| Add serviceCategory to queue-ahead filter | Dept-filtered queue | 189-219 |
| Add caseChain state + useEffect for SuperCard | F10 | After 803 |
| Add caseChain + salesByAppt props to SuperCard | F10 | 808 |
| Remove clinicAddress prop from SuperCard | F8 | 808 |

---

## Verification Checklist

### Day 1

1. **Collapsed header** — Tap SuperCard collapse chevron. Collapsed state shows ONLY: pet avatar, pet name, status pill with pulsing dot, queue position. Service name and ticket are NOT visible.
2. **Expanded header** — Expand card. Service name, ticket, and vet name appear in the body.
3. **Per-service progress** — With a multi-service appointment (e.g., Grooming + Consultation), expand SuperCard. See each service with status icon: "○ Grooming — waiting", "⏳ Consultation — in progress", "✓ Vaccination — done".
4. **Service duration** — A completed service with timestamps shows "done (15 min)". One without timestamps shows just "done".
5. **What's Next** — Change appointment status. Each status shows a unique message: arrived = "Waiting to be seen", in-consult = "with the veterinarian...", dispensing = "Medications being prepared...", billing = "Ready for checkout...", confined = "Hospitalized...", on-hold = "paused...".
6. **Encounter items** — At dispensing status with encounterItems on the appointment, see medication list with emoji + name + qty. Hidden at all other statuses.
7. **Financial preview** — At billing or dispensing with encounterItems, see estimated total. With deposit, see deposit + balance. Hidden at arrived/in-consult.
8. **Context fields** — Department shows. Time label changes per status. Client notes echo shows in italic. Allergy warning shows red. Weight shows. Follow-up badge shows. Case day shows for day > 1. All absent fields produce no UI noise.
9. **Emergency badge** — Walk-in with priority='high': red EMERGENCY badge in collapsed mini header. Normal appointment: no badge.
10. **CTA** — Single full-width "Call Clinic" button. No Directions button. Disabled when clinicPhone empty.
11. **Queue position** — Department-filtered: a pet in Grooming ahead does not count toward a Consultation patient's queue position.

### Day 2

12. **Case day pager** — Hospitalized pet at caseDay=3: SuperCard shows a swipe pager with 3 dots. Active day (3) auto-focused. Swipe left to see Day 1 and Day 2 with frozen read-only content.
13. **Past day content** — Day 1 page shows day label, date, status badge, collapsed timeline, encounter summary if completed. No CTA button.
14. **Active day content** — Day 3 (active) shows full live content: service progress, what's next, encounter items, financial, Call Clinic.
15. **Single-day fallback** — A normal caseDay=1 appointment renders the SuperCard body directly, no pager, no dots.

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `services[]` array absent on legacy appointments | Guard with `appointment.services \|\| []`. Legacy appointments show no service progress section -- graceful. |
| `serviceProgress` timestamps missing on old services | `formatServiceDuration` returns '' when timestamps absent. Label falls back to "done" without duration. |
| `encounterItems` absent pre-sign-off | Gated on `appointment.status === 'dispensing'` AND `encounterItems.length > 0`. Both conditions required. |
| `finalTotal` not yet written at dispensing | Fall back to `encounterItems.reduce(sum prices)` for estimated total. Imprecise but helpful. |
| Case chain resolution fails (ancestors deleted/archived) | Fallback: `setCaseChainForSuperCard([activeAppointment])` -- single-day mode, no pager. |
| FlatList `initialScrollIndex` crash when index out of bounds | Clamp: `Math.min(activeDayIndex, caseChain.length - 1)`. |
| `serviceCategory` null on old appointments | Client-side filter defaults: `(data.serviceCategory \|\| 'General') === (activeArrivedCategory \|\| 'General')`. Both null = both 'General' = match. |
| ScrollView inside FlatList (past day content) | `nestedScrollEnabled` prop on ScrollView -- same pattern as CaseDayCard.js line 164-166. |

---

## Estimated Effort

| Phase | Effort | Features |
|---|---|---|
| Day 1 | ~2.5 hrs | F1-F9 + dept-filtered queue |
| Day 2 | ~1.5-2 hrs | F10 (case day swipe pager) + polish |
| **Total** | **~4-5 hrs** | |
