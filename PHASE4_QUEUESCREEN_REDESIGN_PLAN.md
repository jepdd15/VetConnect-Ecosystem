# T4.178 QueueScreen Redesign Plan

## Overview

Redesign QueueScreen.js (1047 lines) to replace the single-lane "Now Serving" circle with a personal-ticket-first layout, per-department "Now Serving" boxes, multi-department queue breakdown with bottleneck headline, two-row breadcrumb (3+3), stage-aware messaging, elapsed wait counter, countdown-zero handling, and a "Book Now" empty-state CTA. Removes dead multi-pet code left from T4.172 and replaces 3 hardcoded hex colors with COLORS tokens. All changes in a single file: `VetConnect/src/screens/QueueScreen.js`.

**Locked decisions**: Personal ticket as HERO (above Now Serving), per-department Now Serving replacing single-lane circle (same architecture supports FIFO 1-dept and multi-dept), two-row breadcrumb wrap (3+3), per-department breakdown with bottleneck headline, elapsed + remaining counters, stage-aware messages per status, Book Now on empty state, square neubrutalism (borderRadius:0).

## Prerequisites

- T4.172 (multi-pet removal) is DONE -- verify dead code lines 612-676 still present (code exists but feature is dead since visitGroupId system was removed).
- mobileTokens.js has all needed COLORS tokens: `COLORS.cream` (#FFF8E1), `COLORS.white`, `COLORS.warning` (#E65100), `COLORS.brand` (#3E2723), `COLORS.borderLight` (#D7CCC8).
- mobileTokens.js does NOT have `kpiOrangeBg`/`kpiOrangeBorder`/`panelBg` tokens (those are admin-only in designTokens.js). The hardcoded hex colors will map to existing mobile tokens or be defined inline with a comment.
- statusLabels.js exports `getClientStatusLabel` and `isActiveStatus` (already imported).
- Appointment docs contain: `petName`, `services[]` (array of {serviceName, serviceCategory, ...}), `assignedVet` (string), `timeArrived` (Firestore Timestamp), `status`, `queueNumber`, `ticketPrefix`, `serviceCategory`, `priority`.

## Split Recommendation

**Day 1 (~2 hrs)**: Changes 1, 2, 3, 4, 6, 9, 10 -- structural layout (hero, now serving, breakdown, breadcrumb) + cleanup (dead code, hex colors).

**Day 2 (~1.5 hrs)**: Changes 5, 7, 8, 11 -- behavioral (elapsed counter, stage-aware messages, countdown-zero, Book Now CTA).

---

## Day 1 Changes

### Change 1: Delete redundant header

**What**: Remove the `<Text style={styles.header}>Clinic Queue Monitor</Text>` at line 357 and the `styles.header` definition at lines 652-660. The React Navigation header already shows "LIVE QUEUE" -- the in-page header is redundant vertical space.

**Where**: `VetConnect/src/screens/QueueScreen.js`
- Line 357: delete `<Text style={styles.header}>...</Text>`
- Lines 652-660: delete `styles.header` block

**How**: Delete the JSX element and its style definition.

**Done when**: No "Clinic Queue Monitor" text renders on the screen. Only the nav header "LIVE QUEUE" is visible.

---

### Change 2: Personal ticket becomes HERO

**What**: Move the personal ticket display ABOVE the "Now Serving" section (currently it's below). Enhance the ticket card to show pet name, full services list, and assigned vet alongside the ticket number.

**Where**: `VetConnect/src/screens/QueueScreen.js`
- Lines 391-632 (myTicket block): move above the "Now Serving" block (currently lines 366-381)
- Lines 408-412 (ticket number display): add pet name + services + vet below

**How**:

1. **Reorder JSX**: Move the entire `{myTicket ? (...) : (...)}` block to render BEFORE the "Now Serving" section. The new render order inside ScrollView becomes:
   - Turn alert banner (stays first)
   - Personal ticket hero (moved up from below)
   - Now Serving section (moved down from above)
   - Offline stale note (stays)

2. **Add pet name subtitle**: Below the ticket number (`styles.ticketNumber`), add:
   ```jsx
   {myTicket.petName && (
     <Text style={styles.heroSubtitle}>
       {myTicket.petName}
     </Text>
   )}
   ```

3. **Add services list**: Below pet name, render the full services array joined with " + ":
   ```jsx
   {myTicket.services?.length > 0 && (
     <Text style={styles.heroServices}>
       {myTicket.services.map(s => s.serviceName || s.serviceType).join(' + ')}
     </Text>
   )}
   ```
   Fallback to `myTicket.serviceType` if `services` array is empty/missing:
   ```jsx
   {(!myTicket.services?.length && myTicket.serviceType) && (
     <Text style={styles.heroServices}>{myTicket.serviceType}</Text>
   )}
   ```

4. **Add assigned vet**: Below services, show vet name when not "Unassigned":
   ```jsx
   {myTicket.assignedVet && myTicket.assignedVet !== 'Unassigned' && (
     <Text style={styles.heroVet}>
       {myTicket.assignedVet}
     </Text>
   )}
   ```

5. **New styles**:
   ```js
   heroSubtitle: {
     fontFamily: FONTS.bold,
     fontSize: 18,
     color: COLORS.brand,
     textTransform: 'uppercase',
     letterSpacing: 1,
     marginTop: 4,
   },
   heroServices: {
     fontFamily: FONTS.regular,
     fontSize: 14,
     color: COLORS.accent,
     textAlign: 'center',
     marginTop: 4,
   },
   heroVet: {
     fontFamily: FONTS.bold,
     fontSize: 13,
     color: COLORS.textMuted,
     textTransform: 'uppercase',
     letterSpacing: 0.5,
     marginTop: 4,
   },
   ```

**Done when**: The personal ticket card renders above "Now Serving" and shows pet name, services list (e.g., "Anti tick & flea + Consultation"), and assigned vet name when applicable.

---

### Change 3: Per-department "Now Serving" replacing single-lane circle

**What**: Replace the 240px circle showing `daily_queue.currentServing` with per-department "Now Serving" boxes derived from the lobby listener. The circle reads from `daily_queue.currentServing` which is a single-lane FIFO number -- but the clinic operates concurrent departments. Instead, identify which appointments are currently being served (status `in-consult`) per department from the lobby data.

**Where**: `VetConnect/src/screens/QueueScreen.js`
- Lines 150-165 (lobby listener): add `status` and `ticketPrefix` to the extracted fields
- Lines 366-381 (circle JSX): replace with per-department boxes
- Lines 662-692 (circle + statusBadge styles): replace with box styles
- Lines 343-347 (currentServingDisplay): can be simplified but keep queueData for pause/active state

**How**:

1. **Expand lobby listener extraction** (line 153-164): Add `status` and `ticketPrefix` to the stripped fields:
   ```js
   return {
     queueNumber: data.queueNumber ?? null,
     ticketPrefix: data.ticketPrefix ?? null,
     serviceDuration: data.serviceDuration ?? null,
     serviceType: data.serviceType ?? null,
     serviceCategory: data.serviceCategory ?? null,
     priority: data.priority ?? null,
     status: data.status ?? null,
   };
   ```

2. **Add useMemo for per-department now-serving** (after the existing useMemo at line 243):
   ```js
   const nowServingByDept = useMemo(() => {
     // "Now serving" = appointments in active-serve statuses
     const serving = lobbyPatients.filter(p =>
       ['in-consult', 'dispensing', 'billing', 'on-hold'].includes(p.status)
     );
     // Group by department
     const byDept = {};
     serving.forEach(p => {
       const dept = p.serviceCategory || 'General';
       if (!byDept[dept]) byDept[dept] = [];
       byDept[dept].push(p);
     });
     // Sort each department's serving list by queue number
     Object.values(byDept).forEach(arr =>
       arr.sort((a, b) => (a.queueNumber || 999) - (b.queueNumber || 999))
     );
     return byDept;
   }, [lobbyPatients]);
   ```

3. **Replace circle JSX** (lines 366-381) with per-department boxes:
   ```jsx
   {/* --- PER-DEPARTMENT NOW SERVING --- */}
   <View style={styles.nowServingSection}>
     <Text style={styles.nowServingHeader}>NOW SERVING</Text>
     <View style={[
       styles.statusBadge,
       queueData.status === "active" ? styles.active : styles.paused,
     ]}>
       <Text style={styles.statusText}>
         {(queueData.status || "unknown").toUpperCase()}
       </Text>
     </View>
     {Object.keys(nowServingByDept).length > 0 ? (
       Object.entries(nowServingByDept).map(([dept, patients]) => {
         const deptObj = departments.find(
           d => d.name?.toLowerCase() === dept.toLowerCase()
         );
         const color = deptObj?.color || COLORS.sky;
         const firstServing = patients[0];
         return (
           <View key={dept} style={styles.nowServingRow}>
             <View style={[styles.deptDot, { backgroundColor: color }]} />
             <Text style={styles.nowServingDept}>{dept.toUpperCase()}</Text>
             <Text style={styles.nowServingTicket}>
               {formatTicket(firstServing.ticketPrefix, firstServing.queueNumber)}
             </Text>
           </View>
         );
       })
     ) : (
       <Text style={styles.nowServingEmpty}>Waiting for next patient</Text>
     )}
   </View>
   ```
   Keep `queueData.status` for the active/paused badge (still read from `daily_queue`).

4. **New/replacement styles** (replace `styles.circle`, `styles.bigNumber`, `styles.label`):
   ```js
   nowServingSection: {
     width: '100%',
     backgroundColor: COLORS.white,
     borderWidth: 2,
     borderColor: COLORS.brand,
     padding: SPACING.cardPadding,
     marginBottom: 20,
     alignItems: 'center',
   },
   nowServingHeader: {
     fontFamily: FONTS.black,
     fontSize: 14,
     color: COLORS.muted,
     textTransform: 'uppercase',
     letterSpacing: 2,
     marginBottom: 8,
   },
   nowServingRow: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 10,
     paddingVertical: 8,
     width: '100%',
     borderTopWidth: 1,
     borderTopColor: COLORS.borderLight,
   },
   nowServingDept: {
     flex: 1,
     fontFamily: FONTS.bold,
     fontSize: 13,
     color: COLORS.accent,
     textTransform: 'uppercase',
     letterSpacing: 1,
   },
   nowServingTicket: {
     fontFamily: FONTS.black,
     fontSize: 28,
     color: COLORS.brand,
   },
   nowServingEmpty: {
     fontFamily: FONTS.regular,
     fontSize: 14,
     color: COLORS.muted,
     marginTop: 8,
     textTransform: 'uppercase',
     letterSpacing: 0.5,
   },
   ```
   Delete `styles.circle` (lines 663-674), `styles.label` (lines 675-680), `styles.bigNumber` (line 681). Keep `styles.statusBadge` but remove `bottom: 30` and adjust for inline rendering:
   ```js
   statusBadge: {
     paddingHorizontal: 15,
     paddingVertical: 5,
     borderRadius: 0,
     marginBottom: 8,
   },
   ```

**Done when**: The 240px circle is gone. Per-department "Now Serving" boxes render (e.g., "GENERAL: A-003", "GROOMING: A-001"). Single-department clinics show one row. Queue paused/active badge still works.

---

### Change 4: Multi-department queue breakdown with bottleneck headline

**What**: Extend the existing `useMemo` (lines 243-283) to compute per-department ahead counts and wait estimates when the user's appointment spans multiple departments. Show bottleneck headline (longest wait) and per-department breakdown.

**Where**: `VetConnect/src/screens/QueueScreen.js`
- Lines 243-283 (useMemo): extend return value to include `deptBreakdown` array
- Lines 522-593 (waiting display): add bottleneck headline + per-dept breakdown

**How**:

1. **Extend useMemo** to compute per-department breakdown. After the existing `serviceBreakdown` computation, add:
   ```js
   // Per-department breakdown — get all unique departments from the user's services
   const myDepts = myTicket.services?.length > 0
     ? [...new Set(myTicket.services.map(s => s.serviceCategory || s.department || myDept).filter(Boolean))]
     : (myDept ? [myDept] : []);

   const deptBreakdown = myDepts.map(dept => {
     const deptAhead = lobbyPatients.filter(p => {
       if (p.serviceCategory && p.serviceCategory !== dept) return false;
       if (p.priority === 'high' && myTicket.priority !== 'high') return true;
       if (p.queueNumber && p.queueNumber < myTicket.queueNumber) return true;
       return false;
     });
     const deptAvg = deptAvgConsultMins[dept] || deptAvgConsultMins.__global || 30;
     let deptWait = 0;
     deptAhead.forEach(p => {
       deptWait += parseInt(p.serviceDuration, 10) || deptAvg;
     });
     return { department: dept, ahead: deptAhead.length, waitMins: deptWait };
   });

   // Bottleneck = department with longest wait
   const bottleneck = deptBreakdown.length > 0
     ? deptBreakdown.reduce((max, d) => d.waitMins > max.waitMins ? d : max, deptBreakdown[0])
     : null;
   ```

2. **Add `deptBreakdown` and `bottleneck` to the return value**:
   ```js
   return {
     peopleAhead: ahead.length,
     estWaitTimeMins: waitMins,
     serviceBreakdown: breakdown,
     myDepartment: myDept,
     deptBreakdown,
     bottleneck,
   };
   ```

3. **Render bottleneck headline + per-dept breakdown** in the waiting state (around line 552-580). Replace the existing single estimate box with:
   ```jsx
   {/* Bottleneck headline for multi-department */}
   {deptBreakdown.length > 1 && bottleneck && (
     <Text style={styles.bottleneckHeadline}>
       Estimated wait: ~{countdown != null ? countdown : bottleneck.waitMins} min
     </Text>
   )}

   {/* Per-department breakdown */}
   {deptBreakdown.length > 1 && (
     <View style={styles.deptBreakdownBox}>
       {deptBreakdown.map((d) => {
         const isBottleneck = d.department === bottleneck?.department;
         return (
           <View key={d.department} style={styles.deptBreakdownRow}>
             <Text style={styles.deptBreakdownName}>{d.department}</Text>
             <Text style={styles.deptBreakdownCount}>
               {d.ahead} ahead
             </Text>
             <Text style={[
               styles.deptBreakdownTime,
               isBottleneck && { color: COLORS.danger },
             ]}>
               ~{d.waitMins}m{isBottleneck ? ' (bottleneck)' : ''}
             </Text>
           </View>
         );
       })}
     </View>
   )}
   ```

   For single-department, keep the existing estimate box as-is (it already shows department-filtered count).

4. **New styles**:
   ```js
   bottleneckHeadline: {
     fontFamily: FONTS.black,
     fontSize: 18,
     color: COLORS.danger,
     textTransform: 'uppercase',
     letterSpacing: 0.5,
     marginTop: 12,
     textAlign: 'center',
   },
   deptBreakdownBox: {
     width: '100%',
     marginTop: 10,
     paddingHorizontal: 12,
     paddingVertical: 8,
     backgroundColor: COLORS.white,
     borderWidth: 1,
     borderColor: COLORS.borderLight,
   },
   deptBreakdownRow: {
     flexDirection: 'row',
     alignItems: 'center',
     justifyContent: 'space-between',
     paddingVertical: 6,
     borderBottomWidth: 1,
     borderBottomColor: COLORS.borderLight,
   },
   deptBreakdownName: {
     flex: 1,
     fontFamily: FONTS.bold,
     fontSize: 13,
     color: COLORS.accent,
     textTransform: 'uppercase',
   },
   deptBreakdownCount: {
     fontFamily: FONTS.bold,
     fontSize: 12,
     color: COLORS.muted,
     marginHorizontal: 8,
   },
   deptBreakdownTime: {
     fontFamily: FONTS.bold,
     fontSize: 13,
     color: COLORS.warning,
     minWidth: 80,
     textAlign: 'right',
   },
   ```

**Done when**: Multi-department appointments show per-dept ahead counts + wait estimates with bottleneck labeling. Single-department appointments render the existing single estimate (no visual change). Destructure `deptBreakdown` and `bottleneck` from the useMemo.

---

### Change 6: Two-row breadcrumb (3+3)

**What**: Change the breadcrumb from a single compressed row (6 stages, labels truncate on narrow screens) to two rows of 3 stages each. Row 1: Confirmed, Checked in, With the vet. Row 2: Pharmacy, Checkout, Done.

**Where**: `VetConnect/src/screens/QueueScreen.js`
- Lines 460-497 (breadcrumb map rendering)
- Lines 966-1011 (breadcrumb styles)

**How**:

1. **Split BREADCRUMB_STAGES into two rows** in the JSX rendering. Replace the single `BREADCRUMB_STAGES.map(...)` with two consecutive row containers:
   ```jsx
   <View style={styles.breadcrumbContainer}>
     {BREADCRUMB_STAGES.slice(0, 3).map((stage, idx) => {
       const isPast    = idx < currentIdx;
       const isCurrent = idx === currentIdx;
       return (
         <View key={stage.status} style={styles.breadcrumbStep}>
           <View style={styles.breadcrumbDotRow}>
             {idx > 0 && (
               <View style={[
                 styles.breadcrumbLine,
                 (isPast || isCurrent) ? styles.breadcrumbLineActive : styles.breadcrumbLineInactive,
               ]} />
             )}
             <View style={[
               styles.breadcrumbDot,
               isPast    && { backgroundColor: COLORS.success },
               isCurrent && { backgroundColor: COLORS.sky },
               !isPast && !isCurrent && { backgroundColor: COLORS.borderLight },
             ]} />
             {idx < 2 && (
               <View style={[
                 styles.breadcrumbLine,
                 isPast ? styles.breadcrumbLineActive : styles.breadcrumbLineInactive,
               ]} />
             )}
           </View>
           <Text style={[
             styles.breadcrumbLabel,
             isPast    && { color: COLORS.success },
             isCurrent && { color: COLORS.sky, fontWeight: '900' },
           ]} numberOfLines={1}>
             {stage.label}
           </Text>
         </View>
       );
     })}
   </View>
   <View style={styles.breadcrumbContainer}>
     {BREADCRUMB_STAGES.slice(3).map((stage, rawIdx) => {
       const idx = rawIdx + 3;
       const isPast    = idx < currentIdx;
       const isCurrent = idx === currentIdx;
       return (
         <View key={stage.status} style={styles.breadcrumbStep}>
           <View style={styles.breadcrumbDotRow}>
             {rawIdx > 0 && (
               <View style={[
                 styles.breadcrumbLine,
                 (isPast || isCurrent) ? styles.breadcrumbLineActive : styles.breadcrumbLineInactive,
               ]} />
             )}
             <View style={[
               styles.breadcrumbDot,
               isPast    && { backgroundColor: COLORS.success },
               isCurrent && { backgroundColor: COLORS.sky },
               !isPast && !isCurrent && { backgroundColor: COLORS.borderLight },
             ]} />
             {rawIdx < 2 && (
               <View style={[
                 styles.breadcrumbLine,
                 isPast ? styles.breadcrumbLineActive : styles.breadcrumbLineInactive,
               ]} />
             )}
           </View>
           <Text style={[
             styles.breadcrumbLabel,
             isPast    && { color: COLORS.success },
             isCurrent && { color: COLORS.sky, fontWeight: '900' },
           ]} numberOfLines={1}>
             {stage.label}
           </Text>
         </View>
       );
     })}
   </View>
   ```

2. **Adjust styles**: `breadcrumbContainer` stays as `flexDirection: 'row'`. Add `marginBottom: 4` to the first row's container (use a wrapper View or add margin between the two). The `breadcrumbStep` with `flex: 1` already distributes 3 items evenly per row, so labels have ~33% width each -- no truncation.

**Done when**: Breadcrumb renders in two rows of 3 stages. All labels are fully visible without truncation. Current stage highlights Sky Blue, past stages green, future gray.

---

### Change 9: Delete dead multi-pet code

**What**: Remove the multi-pet summary section (lines 611-631) and its styles (lines 877-919). This code renders when `allTickets.length > 1` but T4.172 removed multi-pet booking so `allTickets` will always be 0 or 1.

**Where**: `VetConnect/src/screens/QueueScreen.js`
- Lines 611-631: delete the entire `{allTickets.length > 1 && (...)}` JSX block
- Lines 877-919: delete `styles.multiPetBox`, `styles.multiPetLabel`, `styles.multiPetRow`, `styles.multiPetName`, `styles.multiPetTicket`, `styles.multiPetStatus`
- Line 54: `allTickets` state can remain (used by the query) but the dead rendering is removed

**How**: Delete the JSX block and 6 style definitions.

**Done when**: No "ALL YOUR PETS IN QUEUE" section renders. Multi-pet styles are gone from StyleSheet. `allTickets` state still populated by the listener (harmless).

---

### Change 10: Replace hardcoded hex colors with COLORS tokens

**What**: Replace 3 hardcoded hex colors in styles with COLORS tokens from mobileTokens.js.

**Where**: `VetConnect/src/screens/QueueScreen.js`

**How**:

| Line | Current | Replacement | Rationale |
|------|---------|-------------|-----------|
| 716 | `backgroundColor: "#EFEBE9"` | `backgroundColor: COLORS.cream` | Panel background -- cream is the closest mobile token (admin uses panelBg #EFEBE9 but mobile doesn't have it; cream #FFF8E1 is the canonical mobile surface) |
| 783 | `backgroundColor: "#FFF3E0"` | `backgroundColor: '#FFF7ED'` with comment `// warm orange bg -- matches estBox` | OR add a new token. Since mobileTokens lacks kpiOrangeBg, use the closest: define inline with a comment. Alternatively, add `estBg: '#FFF3E0'` to COLORS in mobileTokens.js. **Recommended**: keep inline but add a `// TODO: promote to mobileTokens.estBg` comment. |
| 790 | `borderColor: "#FFB74D"` | `borderColor: COLORS.warning` | The warning color (#E65100) is darker but semantically correct for an estimated wait box border. Alternatively, keep as inline with comment. **Recommended**: replace with `COLORS.warning` since the box IS a warning indicator. |

**Implementation note**: The task description references `COLORS.kpiOrangeBg` and `COLORS.panelBg` but these tokens do NOT exist in mobileTokens.js (they are admin-only). Use the closest mobile equivalents:
- `#EFEBE9` (myTicketBox bg) --> `COLORS.cream` -- the standard mobile surface color
- `#FFF3E0` (estBox bg) --> keep as literal with comment, or add to mobileTokens
- `#FFB74D` (estBox border) --> `COLORS.warning` (semantic match)

**Done when**: Zero hardcoded hex colors remain outside of mobileTokens imports.

---

## Day 2 Changes

### Change 5: Elapsed wait counter

**What**: Show "Waiting for: X min" alongside "Estimated remaining: ~Y min" when the user has checked in (`timeArrived` exists). Live counter updates every 60 seconds.

**Where**: `VetConnect/src/screens/QueueScreen.js`
- New state: `elapsedMins`
- New useEffect: setInterval reading `myTicket.timeArrived`
- Lines 552-557 (estimate box area): add elapsed display

**How**:

1. **Add state**:
   ```js
   const [elapsedMins, setElapsedMins] = useState(null);
   ```

2. **Add useEffect** (after the countdown effect at line 321):
   ```js
   // Elapsed wait timer — from timeArrived
   useEffect(() => {
     if (!myTicket?.timeArrived) {
       setElapsedMins(null);
       return;
     }

     const arrived = myTicket.timeArrived?.toDate?.() || myTicket.timeArrived;
     if (!(arrived instanceof Date)) {
       setElapsedMins(null);
       return;
     }

     const computeElapsed = () => {
       const now = new Date();
       const mins = Math.max(0, Math.round((now - arrived) / 60000));
       setElapsedMins(mins);
     };

     computeElapsed();
     const interval = setInterval(computeElapsed, 60000);
     return () => clearInterval(interval);
   }, [myTicket?.timeArrived]);
   ```

3. **Render elapsed** inside the estimate box (between the "Estimated Wait Time" display and the breakdown, around line 557):
   ```jsx
   {elapsedMins != null && (
     <View style={styles.elapsedRow}>
       <Text style={styles.elapsedLabel}>WAITING FOR:</Text>
       <Text style={[
         styles.elapsedTime,
         elapsedMins > estWaitTimeMins && { color: COLORS.danger },
       ]}>
         {elapsedMins} min{elapsedMins !== 1 ? 's' : ''}
       </Text>
       {elapsedMins > estWaitTimeMins && (
         <Text style={styles.overEstimate}>
           ~{elapsedMins - estWaitTimeMins} min over estimate
         </Text>
       )}
     </View>
   )}
   ```

4. **New styles**:
   ```js
   elapsedRow: {
     width: '100%',
     alignItems: 'center',
     marginTop: 8,
     paddingTop: 8,
     borderTopWidth: 1,
     borderTopColor: COLORS.borderLight,
   },
   elapsedLabel: {
     fontSize: 12,
     fontWeight: '900',
     color: COLORS.accent,
     textTransform: 'uppercase',
     letterSpacing: 1,
   },
   elapsedTime: {
     fontSize: 20,
     fontWeight: '900',
     color: COLORS.brand,
     marginTop: 2,
   },
   overEstimate: {
     fontSize: 12,
     fontWeight: '700',
     color: COLORS.danger,
     marginTop: 2,
     textTransform: 'uppercase',
   },
   ```

**Done when**: After check-in, "WAITING FOR: 30 mins" counter appears alongside the estimate, updates every 60s. When elapsed > estimate, text turns red with "~10 min over estimate".

---

### Change 7: Stage-aware messages per status

**What**: Replace the generic "Please proceed to the consultation room" text in the "IT'S YOUR TURN" state with status-specific messages.

**Where**: `VetConnect/src/screens/QueueScreen.js`
- Lines 512-518 (readyText + subText block when `peopleAhead <= 0`)

**How**:

1. **Add a helper function** above the component or as a const inside it:
   ```js
   const getStageMessage = (status) => {
     switch (status) {
       case 'arrived':
       case 'confirmed':
         return 'Please proceed to the consultation room.';
       case 'in-consult':
         return 'Your pet is currently being examined.';
       case 'dispensing':
         return 'Your medications are being prepared at the pharmacy.';
       case 'billing':
         return 'Please proceed to the cashier for checkout.';
       case 'confined':
         return 'Your pet is being monitored. Contact the clinic for updates.';
       case 'on-hold':
         return 'Consultation paused — your pet is resting.';
       default:
         return 'Please proceed to the consultation room.';
     }
   };
   ```

2. **Replace the hardcoded subText** (line 516):
   ```jsx
   <Text style={styles.subText}>
     {getStageMessage(myTicket.status)}
   </Text>
   ```

3. **Update the "IT'S YOUR TURN" heading** based on status -- for dispensing/billing, use a more appropriate heading:
   ```jsx
   <Text style={styles.readyText}>
     {['dispensing', 'billing'].includes(myTicket.status)
       ? 'NEXT STEP'
       : "IT'S YOUR TURN!"}
   </Text>
   ```

**Done when**: Status `arrived` shows "Please proceed to the consultation room." Status `dispensing` shows "NEXT STEP" + "Your medications are being prepared at the pharmacy." Status `billing` shows "NEXT STEP" + "Please proceed to the cashier for checkout." Status `confined` shows appropriate hospitalization message.

---

### Change 8: Countdown 0 handling

**What**: When the countdown timer reaches 0 and the user is still waiting (not yet called), replace "~0 mins" with "Almost there" text instead of showing a stale zero.

**Where**: `VetConnect/src/screens/QueueScreen.js`
- Lines 552-557 (estimate display)

**How**:

Replace the estimate time rendering:
```jsx
<Text style={styles.estTime}>
  {(countdown != null ? countdown : estWaitTimeMins) === 0
    ? 'Almost there'
    : `~ ${countdown != null ? countdown : estWaitTimeMins} min${(countdown ?? estWaitTimeMins) !== 1 ? 's' : ''}`}
</Text>
```

Also update `styles.estLabel` to conditionally not show "Estimated Wait Time:" when countdown is 0:
```jsx
<Text style={styles.estLabel}>
  {(countdown != null ? countdown : estWaitTimeMins) === 0
    ? 'HANG TIGHT'
    : 'ESTIMATED WAIT TIME:'}
</Text>
```

**Done when**: When countdown reaches 0, the estimate box shows "HANG TIGHT" + "Almost there" instead of "ESTIMATED WAIT TIME:" + "~0 mins".

---

### Change 11: Book Now empty state CTA

**What**: Add a "Book Now" button to the empty state ("You are not in the queue") that navigates to BookAppointment.

**Where**: `VetConnect/src/screens/QueueScreen.js`
- Lines 634-640 (noTicketBox JSX)
- Lines 921-928 (noTicket styles)

**How**:

1. **Add navigation button** below the existing "Book an appointment to get started" text:
   ```jsx
   <View style={styles.noTicketBox}>
     <Text style={styles.noTicketText}>You are not in the queue.</Text>
     <Text style={styles.noTicketSub}>
       Book an appointment to get started.
     </Text>
     <View style={{ marginTop: 20 }}>
       <View style={SHADOW.button} />
       <TouchableOpacity
         style={styles.bookNowButton}
         onPress={() => navigation.navigate('BookAppointment')}
       >
         <Text style={styles.bookNowText}>BOOK NOW</Text>
       </TouchableOpacity>
     </View>
   </View>
   ```

2. **Import SHADOW** from mobileTokens (already imported along with COLORS, FONTS, TYPE, SPACING -- check line 19). If not, add it:
   ```js
   import { COLORS, FONTS, TYPE, SPACING, SHADOW } from "../theme/mobileTokens";
   ```

3. **New styles**:
   ```js
   bookNowButton: {
     backgroundColor: COLORS.sky,
     paddingVertical: 16,
     paddingHorizontal: 40,
     borderWidth: 3,
     borderColor: COLORS.brand,
     alignItems: 'center',
   },
   bookNowText: {
     fontFamily: FONTS.black,
     fontSize: 18,
     color: COLORS.textOnSky,
     textTransform: 'uppercase',
     letterSpacing: 2,
   },
   ```

4. **Add shadow wrapper**: The button needs the neubrutalism offset shadow. Use a relative-positioned wrapper View with the shadow View positioned absolutely behind it (standard pattern from SHADOW.button):
   ```jsx
   <View style={{ marginTop: 20, position: 'relative' }}>
     <View style={[SHADOW.button, { position: 'absolute', top: 6, left: 6, right: -6, bottom: -6, backgroundColor: COLORS.brand }]} />
     <TouchableOpacity
       style={styles.bookNowButton}
       onPress={() => navigation.navigate('BookAppointment')}
       activeOpacity={0.9}
     >
       <Text style={styles.bookNowText}>BOOK NOW</Text>
     </TouchableOpacity>
   </View>
   ```

**Done when**: Empty state shows a Sky Blue "BOOK NOW" button with neubrutalism offset shadow. Tapping it navigates to BookAppointment. No dead end.

---

## Verification Checklist

### Day 1
- [ ] No "Clinic Queue Monitor" header text on screen
- [ ] Personal ticket card renders ABOVE Now Serving section
- [ ] Ticket card shows pet name, services list, and vet name
- [ ] No 240px circle -- per-department Now Serving boxes render instead
- [ ] Single-department shows one "NOW SERVING IN {DEPT}: X-NNN" row
- [ ] Multi-department shows multiple rows
- [ ] Queue active/paused badge still renders
- [ ] Multi-department breakdown shows per-dept ahead + wait + bottleneck label
- [ ] Single-department shows existing single estimate (no regression)
- [ ] Breadcrumb renders in two rows (3+3), all labels fully visible
- [ ] No "ALL YOUR PETS IN QUEUE" section renders
- [ ] Zero hardcoded hex colors outside of COLORS imports
- [ ] No `borderRadius` on any new container (circles for dots are exceptions)

### Day 2
- [ ] After check-in, "WAITING FOR: X mins" counter appears and updates every 60s
- [ ] When elapsed > estimate, counter turns red with "~N min over estimate"
- [ ] Status `arrived` shows "Please proceed to the consultation room"
- [ ] Status `dispensing` shows "NEXT STEP" + pharmacy message
- [ ] Status `billing` shows "NEXT STEP" + cashier message
- [ ] Status `confined` shows hospitalization message
- [ ] Countdown at 0 shows "HANG TIGHT" + "Almost there" (not "~0 mins")
- [ ] Empty state shows "BOOK NOW" button with offset shadow
- [ ] Tapping "BOOK NOW" navigates to BookAppointment screen
- [ ] ZERO `alert()` / `confirm()` / `prompt()` calls anywhere (the existing Alert.alert at line 534 is React Native Alert, which is correct)

## Risk Assessment

1. **Lobby listener field expansion** (Change 3): Adding `status` and `ticketPrefix` to the lobbyPatients extraction increases memory slightly but these are small string fields. The privacy-scoping comment says "no PII" -- `status` and `ticketPrefix` are not PII, they are queue metadata. Safe to add.

2. **Per-department Now Serving accuracy**: The lobby listener queries `status in ['arrived', 'in-consult', 'dispensing', 'billing', 'on-hold', 'confined']` but "Now Serving" filters to `['in-consult', 'dispensing', 'billing', 'on-hold']`. This means `arrived` patients (waiting, not yet being served) are correctly excluded from the Now Serving display but included in the ahead count. Correct behavior.

3. **services[] array availability**: The `myTicket` query returns full appointment docs, so `services[]` is available. However, older appointments created before the services array feature may only have `serviceType` (string). The plan includes a fallback to `myTicket.serviceType` when `services[]` is empty/missing.

4. **timeArrived availability**: `timeArrived` is written on check-in (QR scan or admin arrival). Pre-arrival appointments (status `pending`/`confirmed`) will not have `timeArrived`, so `elapsedMins` will be `null` and the elapsed counter won't render. Correct behavior.

5. **Breadcrumb two-row on very narrow screens**: With 3 stages per row and `flex: 1`, each stage gets ~33% width. At 320px screen width minus padding, that's ~85px per stage. Labels like "With the vet" (11 chars) fit comfortably. No truncation risk.

6. **SHADOW import**: Line 19 currently imports `COLORS, FONTS, TYPE, SPACING` from mobileTokens. `SHADOW` may not be imported yet. Verify and add to the import if missing.
