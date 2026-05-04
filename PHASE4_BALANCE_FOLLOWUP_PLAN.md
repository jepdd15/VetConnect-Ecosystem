# T4.147 — Partial Payment Follow-Up System

## Overview

The clinical loop closes at discharge, but the **financial loop stays open** when POSModal creates a `status: 'completed'` appointment with `balanceRemaining > 0`. Today the only visibility into this gap lives in PatientDashboard (computed balance chip + unpaid-sale listing + Record Payment dialog). The mobile ClientDashboard banner is dead (reads the legacy `userProfile.outstandingBalance` counter that T2.101 stopped updating). No automated reminders exist, no "Mark as Settled" for off-POS payments, and staff cannot snooze nagging reminders for clients on payment plans.

This plan adds **7 capabilities across 6 files** to close the financial follow-up lifecycle:

1. Queue Clinical Passport popover — amber balance chip
2. CRM "Mark as Settled" button + confirmation dialog
3. Per-client reminder snooze dropdown
4. Patients list badge for outstanding balances
5. Mobile ClientDashboard balance banner fix (replace dead legacy read)
6. Mobile BookAppointment warning banner
7. Cloudflare Worker `handleBalanceReminders` cron handler

**Decisions locked:** D (passive + warning + auto), surfaces (Queue popover + CRM + Patients list + mobile booking), Worker Cron, any > 0 threshold, Mark as Settled + snooze.

**Split:** Day 1 (~2.5 hrs) = admin surfaces (tasks 1-4). Day 2 (~2 hrs) = mobile + Worker (tasks 5-7).

---

## Day 1 — Admin Surfaces (~2.5 hrs)

### Task 1: Queue Clinical Passport Popover — Balance Badge

**File:** `VetConnect-Admin/src/features/Queue/queueColumns.jsx`

**What:** Add an amber "BALANCE DUE: ₱X" chip to the Clinical Passport popover card when the appointment's `balanceRemaining > 0`.

**Where:** Inside the `PassportCard` JSX block, after the status badges section (after line 90 — the closing `</Box>` of the `selfCheckedIn`/`confirmedByClient`/`groupSize` badge block), before the `<Stack spacing={1.2}>` at line 92.

**How:**

```jsx
{/* T4.147: Outstanding balance badge */}
{(p.row.balanceRemaining || 0) > 0 && (
  <Box sx={{ mb: 1.5, pb: 1.5, borderBottom: `1px solid ${COLORS.borderLight}` }}>
    <Chip
      label={`BALANCE DUE: ₱${(p.row.balanceRemaining || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
      size="small"
      sx={{
        height: 20,
        fontSize: '0.62rem',
        fontWeight: 900,
        borderRadius: 0,
        bgcolor: COLORS.warningSurface,
        color: COLORS.warning,
        border: `1px solid ${COLORS.warning}`,
      }}
    />
  </Box>
)}
```

**Why:** `balanceRemaining` is already on the appointment document (POSModal writes it at checkout). `enrichDoc` in Queue.jsx spreads `...data`, so the field is available on `p.row`. This only shows on completed-today appointments (visible in the Completed tab) since pre-checkout active appointments have no `balanceRemaining`. No extra query needed.

**Depends on:** Nothing.

**Done when:** Open Queue, go to Completed tab, hover over a patient with partial payment — popover shows amber "BALANCE DUE: ₱X" chip between the status badges and the SPECIES row.

---

### Task 2: CRM "Mark as Settled" Button + Confirmation Dialog

**File:** `VetConnect-Admin/src/features/Patients/PatientDashboard.jsx`

**What:** Add a "Mark as Settled" button alongside each "Record Payment" button in the Outstanding Balance widget, plus a MUI Dialog confirmation. Settling zeroes `balanceRemaining` and writes an audit trail (`settledExternally: true`, `settledBy`, `settledAt`).

**Where:**

A. **State declarations** (near existing `recordPaymentOpen`/`recordPaymentTarget`/`recordPaymentAmount` state, around line 300-310 area). Add:

```jsx
const [settleTarget, setSettleTarget] = useState(null); // sale object to mark as settled
```

B. **Handler function** (near `handleRecordPayment` at line 828). Add:

```jsx
// T4.147: Mark a sale as settled externally (off-POS payment).
const handleMarkSettled = async () => {
  if (!settleTarget) return;
  try {
    await updateDoc(doc(db, 'sales', settleTarget.id), {
      balanceRemaining: 0,
      settledExternally: true,
      settledBy: profile?.fullName || 'Staff',
      settledAt: Timestamp.now(),
    });
    setOwnerSales(prev => prev.map(s =>
      s.id === settleTarget.id ? { ...s, balanceRemaining: 0, settledExternally: true } : s
    ));
    setSettleTarget(null);
  } catch (e) {
    console.error('[PatientDashboard.handleMarkSettled]:', e.message);
    setErrorSnack('Failed to mark as settled: ' + e.message);
  }
};
```

C. **Button in Outstanding Balance widget** (line ~2520, after the existing "Record Payment" button). Add a second button:

```jsx
<Button
  size="small"
  variant="outlined"
  disabled={isErased}
  onClick={() => setSettleTarget(sale)}
  sx={{
    fontFamily: FONT, fontSize: '0.62rem', fontWeight: 800,
    borderRadius: 0, color: COLORS.warning, borderColor: COLORS.warning,
    textTransform: 'none', py: 0.25, px: 1, ml: 0.5,
  }}
>
  Mark Settled
</Button>
```

D. **Confirmation Dialog** (near the existing Record Payment Dialog, after line ~2610). Add:

```jsx
{/* T4.147: Mark as Settled Confirmation Dialog */}
<Dialog open={!!settleTarget} onClose={() => setSettleTarget(null)} maxWidth="xs" fullWidth>
  <DialogTitle sx={{ fontFamily: FONT, fontWeight: 900, fontSize: '0.95rem', color: COLORS.warning }}>
    Mark as Settled
  </DialogTitle>
  <DialogContent sx={{ pt: 2 }}>
    <Typography sx={{ fontFamily: FONT, fontSize: '0.85rem', color: COLORS.textSecondary }}>
      Mark <strong>₱{(settleTarget?.balanceRemaining || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong> as
      settled? This records that payment was received outside the POS system.
    </Typography>
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setSettleTarget(null)} sx={{ fontFamily: FONT, borderRadius: 0 }}>Cancel</Button>
    <Button onClick={handleMarkSettled} variant="contained"
      sx={{ fontFamily: FONT, borderRadius: 0, bgcolor: COLORS.warning, '&:hover': { bgcolor: COLORS.danger } }}>
      Confirm Settled
    </Button>
  </DialogActions>
</Dialog>
```

**Why:** Staff need to zero out balances for clients who paid via bank transfer, GCash, etc. The audit trail (`settledExternally`, `settledBy`, `settledAt`) preserves financial forensics — distinguishes POS payments from off-system settlements.

**Depends on:** Nothing.

**Done when:** Open PatientDashboard for a client with unpaid balance. Click "Mark Settled" next to an unpaid sale. Dialog appears. Click "Confirm Settled" — sale's balance goes to ₱0, button disappears for that sale.

---

### Task 3: Per-Client Reminder Snooze Dropdown

**File:** `VetConnect-Admin/src/features/Patients/PatientDashboard.jsx`

**What:** Add a "Snooze reminders" dropdown at the top of the Outstanding Balance widget that writes `balanceReminderSnoozedUntil` to the user doc. The Worker Cron (Day 2) will respect this timestamp.

**Where:**

A. **Handler** (near `handleMarkSettled`). Add:

```jsx
// T4.147: Snooze balance reminders for this client.
const handleSnoozeReminders = async (daysFromNow) => {
  if (!ownerDoc?.id) return;
  try {
    const snoozedUntil = new Date();
    snoozedUntil.setDate(snoozedUntil.getDate() + daysFromNow);
    await updateDoc(doc(db, 'users', ownerDoc.id), {
      balanceReminderSnoozedUntil: Timestamp.fromDate(snoozedUntil),
    });
    setSuccessSnack(`Reminders snoozed for ${daysFromNow} days.`);
  } catch (e) {
    console.error('[PatientDashboard.handleSnoozeReminders]:', e.message);
    setErrorSnack('Failed to snooze reminders: ' + e.message);
  }
};
```

B. **Snooze dropdown** — inside the Outstanding Balance widget, between the `<Widget title=...>` opening and the `<Stack spacing={0.75}>` that lists unpaid sales (line ~2506). Add:

```jsx
<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mb: 1 }}>
  <FormControl size="small" sx={{ minWidth: 160 }}>
    <Select
      displayEmpty
      value=""
      onChange={(e) => handleSnoozeReminders(Number(e.target.value))}
      sx={{ fontFamily: FONT, fontSize: '0.7rem', fontWeight: 700, borderRadius: 0, height: 28 }}
      renderValue={() => 'Snooze Reminders'}
    >
      <MenuItem value={7} sx={{ fontFamily: FONT, fontSize: '0.75rem' }}>1 Week</MenuItem>
      <MenuItem value={14} sx={{ fontFamily: FONT, fontSize: '0.75rem' }}>2 Weeks</MenuItem>
      <MenuItem value={30} sx={{ fontFamily: FONT, fontSize: '0.75rem' }}>1 Month</MenuItem>
    </Select>
  </FormControl>
</Box>
```

**Pre-requisite check:** PatientDashboard already has `FormControl`, `Select`, `MenuItem` imported (line 8-9 area). Verify `ownerDoc` is available — it is the user document loaded for this patient's owner. Grep for `ownerDoc` to confirm the variable name.

**Variable name verification needed:** The engineer must confirm the owner user document reference. It may be called `ownerData`, `clientData`, or derived from the URL params. The owner's Firestore doc ID is the `ownerId` field on the pet. The plan uses `ownerDoc` as a placeholder — replace with the actual variable.

**Why:** Staff on payment plans need a way to stop automated reminders from harassing cooperative clients. The snooze writes to the user doc; the Worker checks it before sending.

**Depends on:** Nothing (standalone). Worker integration in Day 2.

**Done when:** Open PatientDashboard for a client with balance. The "Snooze Reminders" dropdown appears above the unpaid sales list. Select "1 Week" — Snackbar confirms. Firestore user doc now has `balanceReminderSnoozedUntil` timestamp 7 days from now.

---

### Task 4: Patients List Badge

**File:** `VetConnect-Admin/src/features/Patients/components/PatientDirectory.jsx`

**What:** Add a small amber "₱" badge next to client names that have outstanding balance.

**Where:**

The `PatientDirectory` component receives `owners` array. Each owner in the CRM `owners` list does NOT currently have `outstandingBalance` per-owner at the directory level — the `outstandingBalance` is only computed after selecting a client (via `usePatientManager`'s `onSnapshot` on sales).

**Approach:** The cheapest approach is to surface the `clientTag` mechanism that already exists. Line 35-36 of PatientDirectory.jsx already renders `clientTag === 'VIP'` and `clientTag === 'Bad Payer'` badges. The `owners` array comes from `usePatientManager` which loads all users.

However, we do NOT have per-client balance data at the directory level — computing it for every client would require a sales listener per client (N+1). Instead:

**Option chosen:** Add an amber "₱" dot next to the owner name that leverages the `clientTag` field. When staff mark a client tag as "Bad Payer" (existing feature), the dot already shows via the `⚠️` emoji. For balance-specific indication, we add a lighter-weight check: if the `owner` object has a `hasOutstandingBalance` field (a denormalized boolean), show the badge.

**Revised approach — pragmatic denormalization:** When the Mark as Settled handler zeroes a balance (Task 2), or when Record Payment zeros a balance, also check if the owner has ANY remaining unpaid sales. If not, remove the flag. If yes, set it. This keeps the badge in sync without a global sales listener.

**Actually simpler:** Since `outstandingBalance` is already computed in `usePatientManager` when a client is selected, and the directory list just needs a simple indicator, the pragmatic approach is:

1. In PatientDirectory.jsx, check for `owner.outstandingBalance > 0` (a field on the user doc). But wait — T2.101 STOPPED updating this field. So it's stale.

2. Better: add a computed `_hasDebt` flag during the `flushToRows` equivalent — but there's no such thing for the owners list.

**Final approach (zero extra queries):** Skip per-client balance computation in the directory. Instead, add the badge to `ClientHeader.jsx` and `BillingLedger.jsx` which already have the balance data. The Patients list already shows the `⚠️` for "Bad Payer" tag. For a zero-cost directory indicator, rely on the existing `clientTag` mechanism and document that staff should tag chronic non-payers.

**REVISED: Use owner.outstandingBalance as a rough indicator.** Even though T2.101 stopped incrementing it, the legacy counter was only zeroed when the system was set up. For NEW partial payments since T2.101, the counter was NOT updated. So it's unreliable.

**FINAL DECISION:** The safest zero-query approach is to show the badge ONLY for the currently-selected client (already shown in `ClientHeader` via `balance` prop). For the directory sidebar, we add a micro-badge that reads from a new denormalized field `hasOutstandingBalance` (boolean) on the user doc. This field is written by:
- Task 2's `handleMarkSettled` — after settling, check if owner still has debt, set flag accordingly
- `handleRecordPayment` — after payment, check if owner still has debt, set flag accordingly
- POSModal checkout — when `balanceRemaining > 0`, set `hasOutstandingBalance: true` on user doc

For this plan, implement only the read side in PatientDirectory. The write side piggybacks on existing handlers.

**Implementation:**

A. **PatientDirectory.jsx** (line 33-36 area, inside the `<ListItemText primary={...}>` box). After the VIP/Bad Payer badges, add:

```jsx
{owner.hasOutstandingBalance && (
  <Chip
    label="₱"
    size="small"
    sx={{
      height: 16, width: 16, fontSize: '0.55rem',
      fontWeight: 900, borderRadius: 0, p: 0,
      bgcolor: COLORS.warningSurface,
      color: COLORS.warning,
      border: `1px solid ${COLORS.warning}`,
    }}
  />
)}
```

Import additions: Add `Chip` to the MUI imports at line 1.

Import `COLORS` — already imported at line 6.

B. **Write side — PatientDashboard.jsx handlers.** Update `handleRecordPayment` (line 829-843) and `handleMarkSettled` (Task 2) to also update the owner's `hasOutstandingBalance` flag:

After zeroing a sale's balance in both handlers, add:

```jsx
// T4.147: Update denormalized balance flag on owner doc
const remainingDebt = ownerSales
  .filter(s => s.id !== targetSaleId && s.status !== 'refunded' && s.status !== 'voided')
  .reduce((sum, s) => sum + (s.balanceRemaining || 0), 0);
// The sale we just settled/paid now has balance 0, so total remaining is remainingDebt
if (ownerDoc?.id) {
  updateDoc(doc(db, 'users', ownerDoc.id), {
    hasOutstandingBalance: remainingDebt > 0,
  }).catch(() => {}); // fire-and-forget
}
```

**Why:** Staff need at-a-glance visibility into which clients owe money without clicking into each profile. The denormalized boolean avoids N+1 sales queries.

**Depends on:** Task 2 (Mark Settled handler needs the same flag update).

**Done when:** The amber "₱" chip appears next to client names in the Patients sidebar when `hasOutstandingBalance` is true on their user doc. Settling all debts removes the chip.

---

### Day 1 Verification Checkpoint

1. Queue > Completed tab > hover over partial-payment appointment — amber chip visible in passport popover
2. PatientDashboard > Outstanding Balance widget > "Mark Settled" button works with confirmation dialog
3. PatientDashboard > Outstanding Balance widget > "Snooze Reminders" dropdown writes to Firestore
4. Patients sidebar > amber "₱" chip visible for clients with `hasOutstandingBalance: true`

---

## Day 2 — Mobile + Worker (~2 hrs)

### Task 5: Fix Mobile ClientDashboard Balance Banner

**File:** `VetConnect/src/screens/ClientDashboard.js`

**What:** Replace the dead `userProfile.outstandingBalance` read (line 702) with a computed balance from appointments. The legacy counter is no longer updated since T2.101.

**Where:** Lines 700-716 (the balance alert banner block).

**How:**

A. **Add state and query** (near other state declarations, around line 55-60):

```jsx
const [computedBalance, setComputedBalance] = useState(0);
```

B. **Add effect to compute balance** (after the user profile listener, around line 255). Add a new effect:

```jsx
// T4.147: Compute outstanding balance from completed appointments with unpaid balance.
// Replaces the dead userProfile.outstandingBalance counter (T2.101 stopped updating it).
useEffect(() => {
  if (!auth.currentUser) return;
  const q = query(
    collection(db, 'appointments'),
    where('ownerId', '==', auth.currentUser.uid),
    where('status', '==', 'completed'),
  );
  const unsub = onSnapshot(q, (snap) => {
    const total = snap.docs.reduce((sum, d) => {
      const bal = d.data().balanceRemaining || 0;
      return sum + (bal > 0 ? bal : 0);
    }, 0);
    setComputedBalance(total);
  }, (err) => {
    console.warn('[ClientDashboard] Balance listener error:', err.message);
  });
  return () => unsub();
}, []);
```

**Firestore rules check:** `match /appointments/{apptId} { allow read: if isAuth(); }` — confirmed at line 52 of firestore.rules. The mobile user CAN read their own appointments.

**Query note:** This queries ALL completed appointments for the user (not date-scoped). For most pet owners this is a small collection (< 50 lifetime). The `onSnapshot` keeps it live so settling a balance from the admin side instantly updates the client's banner.

C. **Replace the banner condition** (line 702). Change:

```jsx
// OLD (dead):
{userProfile?.outstandingBalance > 0 && (
```

to:

```jsx
// NEW (T4.147 — computed from appointments):
{computedBalance > 0 && (
```

D. **Replace the balance display** (line 709). Change:

```jsx
// OLD:
<Text style={styles.balanceMsg}>₱{userProfile.outstandingBalance.toLocaleString()} — SETTLE AT COUNTER</Text>
```

to:

```jsx
// NEW:
<Text style={styles.balanceMsg}>₱{computedBalance.toLocaleString()} — SETTLE AT COUNTER</Text>
```

**Why:** The banner has been effectively dead since T2.101 removed the `increment()` call from POSModal. This restores it with a computed value that matches the admin's authoritative computation pattern.

**Depends on:** Nothing.

**Done when:** Mobile client with a partial-payment completed appointment sees the amber "OUTSTANDING BALANCE" banner with the correct amount. Settling the balance from admin side makes the banner disappear in real-time.

---

### Task 6: Mobile BookAppointment Warning Banner

**File:** `VetConnect/src/screens/BookAppointment.js`

**What:** Show a non-blocking amber warning banner above the wizard steps when the client has outstanding balance from previous visits.

**Where:** Between the wizard header (line 1785) and the dynamic body (line 1787-1788).

**How:**

A. **Add state** (near other state declarations, around line 92):

```jsx
// T4.147: Outstanding balance warning
const [outstandingBalance, setOutstandingBalance] = useState(0);
```

B. **Add one-shot query** (after the reschedule effects, around line 225). Add a new effect:

```jsx
// T4.147: Check for outstanding balance from previous visits.
useEffect(() => {
  if (!auth.currentUser) return;
  (async () => {
    try {
      const q = query(
        collection(db, 'appointments'),
        where('ownerId', '==', auth.currentUser.uid),
        where('status', '==', 'completed'),
      );
      const snap = await getDocs(q);
      const total = snap.docs.reduce((sum, d) => {
        const bal = d.data().balanceRemaining || 0;
        return sum + (bal > 0 ? bal : 0);
      }, 0);
      setOutstandingBalance(total);
    } catch (err) {
      console.warn('[BookAppointment] Balance check failed:', err.message);
    }
  })();
}, []);
```

**Note:** Uses `getDocs` (one-shot) instead of `onSnapshot` because the balance is unlikely to change while the user is on the booking screen. Keeps it lightweight.

C. **Render warning banner** (between the wizard header closing `</View>` at line 1785 and the `{/* DYNAMIC BODY */}` comment at line 1787):

```jsx
{/* T4.147: Outstanding balance warning — non-blocking */}
{outstandingBalance > 0 && !rescheduleMode && (
  <View style={{
    backgroundColor: '#FFF3E0',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.brand,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  }}>
    <Text style={{ fontSize: 16 }}>💸</Text>
    <Text style={{
      flex: 1,
      fontFamily: 'Inter_700Bold',
      fontSize: 12,
      color: COLORS.brand,
      letterSpacing: 0.3,
    }}>
      You have ₱{outstandingBalance.toLocaleString()} outstanding from a previous visit. Please settle at your next visit.
    </Text>
  </View>
)}
```

**Why:** Clients should see a gentle reminder that they have unpaid balance when booking new appointments. Non-blocking — they can still book freely. Hidden in reschedule mode (irrelevant context).

**Depends on:** Nothing.

**Done when:** Mobile user with outstanding balance opens BookAppointment — amber banner visible above Step 1. User can proceed through all 4 steps normally. Banner hidden in reschedule mode.

---

### Task 7: Cloudflare Worker — `handleBalanceReminders` Cron Handler

**File:** `VetConnect-Backend/cloudflare-worker/worker.js`

**What:** Add a new `handleBalanceReminders` function to the Worker. It queries sales with `balanceRemaining > 0`, groups by owner, respects `balanceReminderSnoozedUntil` on the user doc, and sends push + email reminders. Configurable interval via `balanceReminderIntervalDays` in `clinic_settings`.

**Where:**

A. **Template constants** (after `VACCINE_TEMPLATES` at line 376). Add:

```js
const BALANCE_TEMPLATES = {
  'balance-reminder': {
    title: 'Outstanding Balance Reminder',
    body: 'You have ₱{amount} outstanding from a previous visit. Please settle at your next visit or contact us for payment options.',
  },
};
```

B. **Handler function** (after `handleAppointmentReminders`, before the `export default` block at line ~729). Add the full handler:

```js
// ── T4.147: Automated Balance Reminders ─────────────────────────────────────

async function handleBalanceReminders(env) {
  const PROJECT_ID = env.FIREBASE_PROJECT_ID || 'starbarks-vetconnect-f6443';
  const API_KEY = env.FIREBASE_API_KEY;
  const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  // 1. Read clinic settings
  const settingsRes = await fetch(`${BASE}/clinic_settings/general?key=${API_KEY}`);
  if (!settingsRes.ok) { console.log('[BalanceReminders] Failed to read settings:', settingsRes.status); return; }
  const settings = (await settingsRes.json()).fields || {};

  if (settings.enableBalanceReminders?.booleanValue === false) {
    console.log('[BalanceReminders] Disabled. Skipping.'); return;
  }

  const emailEnabled = settings.enableEmailNotifications?.booleanValue !== false;
  const intervalDays = parseInt(settings.balanceReminderIntervalDays?.integerValue || '7');
  const intervalMs = intervalDays * 86400000;

  // 2. Query sales with balanceRemaining > 0.
  // Firestore REST API doesn't support > 0 filter natively via URL params,
  // so we fetch recent sales and filter client-side.
  // Use structuredQuery for the compound filter.
  const salesQuery = {
    structuredQuery: {
      from: [{ collectionId: 'sales' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'status' },
                op: 'NOT_IN',
                value: { arrayValue: { values: [
                  { stringValue: 'refunded' },
                  { stringValue: 'voided' },
                ] } },
              },
            },
          ],
        },
      },
      limit: 500,
    },
  };

  const salesRes = await fetch(
    `${BASE}:runQuery?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(salesQuery),
    }
  );

  if (!salesRes.ok) { console.log('[BalanceReminders] Sales query failed:', salesRes.status); return; }
  const salesResults = await salesRes.json();

  // 3. Filter to sales with balanceRemaining > 0 and group by ownerId.
  const ownerBalances = new Map(); // ownerId -> { total, ownerName, saleCount }

  for (const result of salesResults) {
    if (!result.document) continue;
    const f = result.document.fields || {};
    const balanceRemaining = parseFloat(f.balanceRemaining?.doubleValue || f.balanceRemaining?.integerValue || '0');
    if (balanceRemaining <= 0) continue;

    // Need ownerId from the appointment linked to this sale.
    // Sales have appointmentId — but querying each appointment is expensive.
    // Sales also have ownerName but NOT ownerId (known bug from SALES_DEEPDIVE).
    // Workaround: use ownerName to group, then look up user by ownerName.
    const ownerName = f.ownerName?.stringValue || '';
    if (!ownerName || ownerName === 'Walk-In') continue;

    const existing = ownerBalances.get(ownerName) || { total: 0, ownerName, saleCount: 0 };
    existing.total += balanceRemaining;
    existing.saleCount += 1;
    ownerBalances.set(ownerName, existing);
  }

  if (ownerBalances.size === 0) {
    console.log('[BalanceReminders] No outstanding balances. Skipping.'); return;
  }

  // 4. For each owner with debt, look up their user doc for push token and snooze status.
  let sent = 0, skipped = 0, failed = 0, snoozed = 0;

  for (const [ownerName, data] of ownerBalances) {
    // Query user by fullName (imperfect but matches current data model)
    const userQuery = {
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'fullName' },
            op: 'EQUAL',
            value: { stringValue: ownerName },
          },
        },
        limit: 1,
      },
    };

    let userFields, userDocPath;
    try {
      const userRes = await fetch(`${BASE}:runQuery?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userQuery),
      });
      const userResults = await userRes.json();
      if (!userResults[0]?.document) { skipped++; continue; }
      userFields = userResults[0].document.fields || {};
      userDocPath = userResults[0].document.name;
    } catch { skipped++; continue; }

    // Check snooze
    const snoozedUntil = userFields.balanceReminderSnoozedUntil?.timestampValue;
    if (snoozedUntil && new Date(snoozedUntil).getTime() > Date.now()) { snoozed++; continue; }

    // Check last balance reminder sent
    const lastSent = userFields.lastBalanceReminderSentAt?.timestampValue;
    if (lastSent && (Date.now() - new Date(lastSent).getTime()) < intervalMs) { skipped++; continue; }

    const pushToken = userFields.expoPushToken?.stringValue;
    const ownerId = userDocPath.split('/').pop();
    const ownerEmail = userFields.email?.stringValue;

    const template = BALANCE_TEMPLATES['balance-reminder'];
    const amount = data.total.toLocaleString(undefined, { maximumFractionDigits: 2 });
    const title = template.title;
    const body = template.body.replace(/\{amount\}/g, amount);

    // Send push notification
    if (pushToken) {
      try {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: pushToken, title, body, sound: 'default',
            data: { type: 'balance-reminder' },
          }),
        });

        // Update lastBalanceReminderSentAt on user doc
        await fetch(`${userDocPath}?key=${API_KEY}&updateMask.fieldPaths=lastBalanceReminderSentAt`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: { lastBalanceReminderSentAt: { timestampValue: new Date().toISOString() } },
          }),
        });

        // Log to notification_log
        fetch(`${BASE}/notification_log?key=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              ownerId: { stringValue: ownerId },
              ownerName: { stringValue: ownerName },
              status: { stringValue: 'balance-reminder' },
              title: { stringValue: title },
              body: { stringValue: body },
              sentAt: { timestampValue: new Date().toISOString() },
              sentBy: { stringValue: 'System (Balance Cron)' },
              channel: { stringValue: 'push' },
              type: { stringValue: 'balance-reminder' },
            },
          }),
        }).catch(() => {});

        sent++;
      } catch (err) {
        console.error(`[BalanceReminders] Push failed for ${ownerName}:`, err.message);
        failed++;
      }
    }

    // Email fallback (fire-and-forget)
    if (emailEnabled && ownerEmail && env.RESEND_API_KEY) {
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: env.RESEND_FROM_EMAIL || 'VetConnect <noreply@starbarks.vet>',
          to: [ownerEmail],
          subject: title,
          html: buildWorkerEmailHtml(title, body),
        }),
      }).then(() => {
        fetch(`${BASE}/notification_log?key=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              ownerId: { stringValue: ownerId },
              ownerName: { stringValue: ownerName },
              status: { stringValue: 'balance-reminder' },
              title: { stringValue: title },
              body: { stringValue: body },
              sentAt: { timestampValue: new Date().toISOString() },
              sentBy: { stringValue: 'System (Balance Cron)' },
              channel: { stringValue: 'email' },
              type: { stringValue: 'balance-reminder' },
            },
          }),
        }).catch(() => {});
      }).catch(() => {});
    }
  }

  console.log(`[BalanceReminders] ${sent} sent, ${skipped} skipped, ${snoozed} snoozed, ${failed} failed.`);
}
```

C. **Add to Cron handler** (line 732-735). Change:

```js
// OLD:
ctx.waitUntil(
  Promise.allSettled([
    handleVaccineReminders(env),
    handleAppointmentReminders(env),
  ])
);
```

to:

```js
// NEW:
ctx.waitUntil(
  Promise.allSettled([
    handleVaccineReminders(env),
    handleAppointmentReminders(env),
    handleBalanceReminders(env),
  ])
);
```

D. **Add `balance-reminder` to DEFAULT_TEMPLATES** (for notification log consistency — around line 35). Add to the existing `DEFAULT_TEMPLATES` object:

```js
'balance-reminder': {
  title: 'Outstanding Balance Reminder',
  body: 'You have ₱{amount} outstanding from a previous visit. Please settle at your next visit or contact us.',
},
```

**Why:** Automated reminders close the follow-up loop without requiring staff to manually track debtors. The Worker pattern matches the existing vaccine/appointment reminder handlers: query Firestore via REST, filter, send, log. Configurable interval prevents harassment. Snooze support (from Task 3) gives staff override control.

**Known limitation:** Sales docs lack `ownerId` (documented in SALES_DEEPDIVE as a known bug — T2.112). The Worker queries users by `fullName` string match, which is imperfect (name collisions, name changes). A proper fix would require backfilling `ownerId` onto sales docs (separate task). For now this is acceptable given the clinic's client volume.

**Depends on:** Task 3 (snooze field on user doc).

**Done when:** Update worker.js in the repo. User pastes the new `handleBalanceReminders` function + updated `scheduled()` handler into Cloudflare Dashboard. Cron fires — clients with outstanding balance receive push + email reminders. Snoozed clients are skipped. notification_log entries appear with `type: 'balance-reminder'`.

---

### Day 2 Verification Checkpoint

1. Mobile ClientDashboard — balance banner shows correct computed amount (not stale legacy value)
2. Mobile BookAppointment — amber warning banner above Step 1 for clients with debt
3. Worker `handleBalanceReminders` — test by temporarily setting interval to 0 days, trigger cron, verify notification_log entry
4. Snoozed client is skipped by Worker

---

## Firestore Schema Additions

### `sales/{saleId}` — new fields (written by Mark Settled)

| Field | Type | Description |
|---|---|---|
| `settledExternally` | boolean | `true` when zeroed via Mark as Settled (not POS) |
| `settledBy` | string | Staff name who marked settled |
| `settledAt` | Timestamp | When the settlement was recorded |

### `users/{userId}` — new fields

| Field | Type | Description |
|---|---|---|
| `balanceReminderSnoozedUntil` | Timestamp | Worker skips reminders until this date |
| `lastBalanceReminderSentAt` | Timestamp | Cooldown tracking for the Worker |
| `hasOutstandingBalance` | boolean | Denormalized flag for Patients directory badge |

### `clinic_settings/general` — new fields

| Field | Type | Default | Description |
|---|---|---|---|
| `enableBalanceReminders` | boolean | `true` | Master toggle for balance reminder cron |
| `balanceReminderIntervalDays` | number | `7` | Minimum days between reminders per client |

---

## Risk Assessment

1. **Sales lack `ownerId`** (T2.112 bug). Worker uses `ownerName` string match as workaround. Risk: name collisions send reminders to wrong client. Mitigation: low probability at clinic scale (< 500 clients). Proper fix is a separate backfill task.

2. **N+1 user queries in Worker.** For each debtor, the Worker runs a `structuredQuery` to find the user by name. With < 20 debtors per run, this is acceptable. If scale grows, batch the queries.

3. **`hasOutstandingBalance` denormalization drift.** If a sale's `balanceRemaining` is modified directly in Firestore console (bypassing the app), the flag won't update. Mitigation: the flag is advisory (Patients sidebar badge only); the authoritative balance is always computed in PatientDashboard and ClientDashboard.

4. **Worker REST API structuredQuery complexity.** The `NOT_IN` filter on sales status may not be supported in all Firestore REST API versions. Fallback: remove the filter and do client-side status checking (already done for `balanceRemaining > 0` check). The engineer should test the query and simplify if needed.

5. **No Blaze upgrade required.** All Worker logic runs on Cloudflare. Mobile/admin queries use existing Firestore indexes. No new Cloud Functions needed.

---

## Pre-Implementation Verification Checklist

Before starting, the engineer should confirm:

- [ ] `ownerDoc` variable name in PatientDashboard.jsx — grep for the owner user doc reference used in the Outstanding Balance widget area. It may be `ownerData` or derived from route params.
- [ ] `profile` variable availability in PatientDashboard.jsx — used for `settledBy` field. Confirm it comes from `useUser()`.
- [ ] `setSuccessSnack` / `setErrorSnack` — confirm these Snackbar setters exist in PatientDashboard.
- [ ] `Timestamp` import in PatientDashboard.jsx — needed for `handleSnoozeReminders`. Confirm it's imported from `firebase/firestore`.
- [ ] `FormControl`, `Select`, `MenuItem` imports in PatientDashboard.jsx — needed for snooze dropdown. Confirm these are already imported.
- [ ] `buildWorkerEmailHtml` utility exists in worker.js — used by the email fallback. Confirm its location.

---

## Files Touched Summary

| File | Day | Change Type |
|---|---|---|
| `VetConnect-Admin/src/features/Queue/queueColumns.jsx` | 1 | Modify — add balance chip to PassportCard |
| `VetConnect-Admin/src/features/Patients/PatientDashboard.jsx` | 1 | Modify — Mark Settled handler/dialog, snooze dropdown, flag updates |
| `VetConnect-Admin/src/features/Patients/components/PatientDirectory.jsx` | 1 | Modify — add balance badge, import Chip |
| `VetConnect/src/screens/ClientDashboard.js` | 2 | Modify — replace dead banner with computed query |
| `VetConnect/src/screens/BookAppointment.js` | 2 | Modify — add balance warning banner + one-shot query |
| `VetConnect-Backend/cloudflare-worker/worker.js` | 2 | Modify — add handleBalanceReminders, templates, cron entry |

---

## Estimated Effort

| Phase | Tasks | Estimate |
|---|---|---|
| Day 1 — Admin Surfaces | Tasks 1-4 | ~2.5 hrs |
| Day 2 — Mobile + Worker | Tasks 5-7 | ~2 hrs |
| **Total** | **7 tasks** | **~4.5 hrs** |

No external blockers. No Blaze upgrade needed. Worker is manual paste to Cloudflare Dashboard.
