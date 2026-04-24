# ClinicalWorkspace Deep-Dive — 13 Questions

> **Target file:** [VetConnect-Admin/src/components/ClinicalWorkspace.jsx](VetConnect-Admin/src/components/ClinicalWorkspace.jsx) (1989 lines, commit `9d1f662`)
> **Companion documents:** [ECOSYSTEM_ARCHITECTURE_REPORT.md](ECOSYSTEM_ARCHITECTURE_REPORT.md), [MASTER_TASKLIST.md](MASTER_TASKLIST.md)

---

## Q1 — Treatment Plan Cart robustness & terminology

**Every code path that touches cart state:**

| Path | Line | What it does |
|---|---|---|
| Initial hydration from `patient.services` | `ClinicalWorkspace.jsx:493-506` | Pushes every booked service into the cart using `resolveTieredPrice` with patient weight fallback |
| Auto-bundle from `baseService.linkedProducts` | `ClinicalWorkspace.jsx:508-523` | Adds linked inventory products as `isAutoBundled: true` entries |
| Reserve stock for auto-bundled products | `ClinicalWorkspace.jsx:530-535` | Fires `reserveStock()` for each product AFTER `setRxCart(initialCart)` — **await-in-loop on Firestore** |
| `handleAddRx` | `ClinicalWorkspace.jsx:718-764` | Blocks out-of-stock, deduplicates by id (increments qty instead), reserves 1 unit |
| `handleRemoveRx` | `ClinicalWorkspace.jsx:766-780` | Guards `isBase` items, splices, releases reservation |
| `handleUpdateQty` | `ClinicalWorkspace.jsx:782-811` | ±1 with stock guard, reserves or releases delta of 1 |
| `handleUpdateRxSig` / `handleUpdateRxField` | `ClinicalWorkspace.jsx:812-824` | Direct mutation of cart entry via shallow `[...rxCart]` |
| Unmount cleanup — release all reservations | `ClinicalWorkspace.jsx:345-359` | Uses `rxCartRef` + `hasReleasedRef` double-guard |
| `handleCloseRequest` — mirror release | `ClinicalWorkspace.jsx:630-652` | Same guard, fires before `onClose()` |
| Sign-off persist | `ClinicalWorkspace.jsx:1021-1028` | Writes `prescribedItems: rxCart`, `prescribedItemsVersion: commitTimestamp` |
| Draft save persist | `ClinicalWorkspace.jsx:1104-1145` | Writes `prescribedItems: rxCart` + `prescribedItemsVersion: Timestamp.now()` |
| POS optimistic-lock read | `POSModal.jsx:259-271` | Compares `prescribedItemsVersion` on save |

**Race conditions & bugs found:**

1. **Await-in-loop reservation on mount** (`ClinicalWorkspace.jsx:530-535`). If the vet closes the dialog before the for-loop finishes, reserved counters for items whose `reserveStock` resolved will be inflated but never released — the unmount cleanup reads `rxCartRef.current` which is already populated with all items, so in practice they get released, but only if items are `type: 'product'`. Low risk, but the loop should be `Promise.all`.

2. **`handleUpdateRxField` / `handleUpdateRxSig` mutate objects in place** (`ClinicalWorkspace.jsx:814`, `821`). `newCart[index].field = value` mutates the same object reference that already lives in state. React won't crash because the surrounding array is new, but any downstream `React.memo` comparing the item by reference will miss the change. Not currently a bug, but a landmine.

3. **No lost-update protection in `handleSaveDraft`**. It writes `prescribedItemsVersion: Timestamp.now()` (`ClinicalWorkspace.jsx:1133`) but does not *read* and *compare* the version first. If two vets edit the same appointment in two tabs, the later save silently clobbers the earlier one. `POSModal.handleSaveDraft` has the optimistic-lock read (`POSModal.jsx:259-271`) — ClinicalWorkspace does not.

4. **Empty-cart sign-off is blocked** (`ClinicalWorkspace.jsx:854`), but *consult-only-with-no-Rx* is a real clinical case. This forces a placeholder service into the cart or blocks sign-off — see Q6.

5. **Dedup on `handleAddRx` uses `item.id` only** (`ClinicalWorkspace.jsx:732`). A service and a product with the same id would collide. Unlikely in practice because the autocomplete options are distinct, but worth noting.

6. **Sig edits never trigger a re-reservation**. If a vet increments qty via `handleUpdateRxField('qty', 5)` (which nothing in the UI does — qty is only touched via `handleUpdateQty`), no reservation sync happens. Currently safe only because the UI doesn't expose that path.

7. **Reservation counter inflation if sign-off fails mid-way**. `reserveStock` is called eagerly during the session; the sign-off batch doesn't do any reconciliation. If the batch throws, `isRecordLockedRef.current` stays `false` → close → release fires → safe. But if the vet refreshes the tab between batch commit and React unmount, there's a brief window where reservations are still live but the record is sealed. POSModal's atomic checkout in `POSModal.jsx:283+` uses `runTransaction` with real stock reads, so it catches this — reservations are advisory only.

8. **`handleRemoveRx` allows removing auto-bundled products** but blocks `isBase` services (`ClinicalWorkspace.jsx:767`). Auto-bundled products are `isBase: false` (see line 519). If that's intentional ("vet can de-bundle a product they don't want to administer"), fine. If the thesis narrative promises "service bundles are locked" — it's wrong.

**Is "Treatment Plan" the right name?**

No. The cart holds (a) booked services, (b) mid-consult ad-hoc services, (c) pharmacy products (drugs), (d) supplies (non-drug inventory), and (e) auto-bundled vaccine vials. The final atom is a billable line item that will become a receipt line at POS, some of which also become a dispensing-queue entry. "Treatment Plan" is confusing because the SOAP `plan` field *also* exists next to it and captures the *prose treatment plan*. Suggest: **"Encounter Charges"** or **"Billing Order"** (neutral and true), or **"Services & Items"** (plain-spoken). If the thesis wants medical language, **"Dispensing Order"** — but only the product subset goes to dispensing, so it's half-true. Avoid "Prescription" since most carts contain non-Rx items.

**Recommendation.** Rename the sidebar card label from "Treatment Plan" to **"Encounter Charges"** (one-line UI change at `ClinicalWorkspace.jsx:1675`). Keep the Firestore field `prescribedItems` as-is to avoid a data migration. Fix the three real bugs: (1) add optimistic-lock read to `handleSaveDraft`, (2) allow empty-cart sign-off with a confirm prompt, (3) wrap the initial reservation loop in `Promise.all`. Defer the object-mutation and dedup concerns — they're latent, not active.

---

## Q2 — Top-level "View Pet EMR" button

**Does any such surface exist already?**

Partially. The component *fetches* full history on mount (`ClinicalWorkspace.jsx:543-547`):

```js
const q = query(collection(db, "medical_records"), where("petId", "==", patient.petId), orderBy("date", "desc"));
const snapshot = await getDocs(q);
const historyData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
setHistory(historyData);
```

but `history` is only consumed by two things: (1) `renderHistoricalLabel` to show the "LAST: value" ghost under each vital (`ClinicalWorkspace.jsx:681-706`), and (2) `getWeightDelta` (`ClinicalWorkspace.jsx:1216-1223`). There is **no UI surface that displays past records**. A `Widget` sub-component is imported (`ClinicalWorkspace.jsx:76-86`) but never rendered anywhere in the returned JSX — it's dead. The sidebar (`ClinicalWorkspace.jsx:1670-1782`) has only three things: Treatment Plan card, CRM Sovereignty toggle, and the sign-off buttons.

**Data source is already live.** You do not need new Firestore fetches. `history` is already an array of medical_records objects sorted desc by date, available from the moment the dialog opens.

**Layout placement.** The identity strip at `ClinicalWorkspace.jsx:1256-1332` is the header. There's already an icon button for "God-View" (`FitScreenIcon`) at line 1328. Add a **"VIEW EMR"** IconButton or Button next to it — minimal disruption to the existing row.

**UI pattern recommendation: slide-over, not full-screen takeover.** Two reasons: (1) the vet needs the SOAP form still partly visible — a full-screen takeover forces a context switch; (2) the file already uses `Slide`/`Dialog` for the Zen and God-View overlays and another full-screen dialog would visually collide. Mount as an MUI `Drawer anchor="right"` at ~60% viewport width, sitting on top of the SOAP column but leaving the right sidebar (Treatment Plan) visible. Inside, render a list of `history` items with: date, vet name, diagnosis, expandable SOAP, vitals, prescriptions, vaccines, lab results. Reuse `PetHistoryScreen`'s mental model but keep it a *separate admin component* — don't import mobile code.

**Concrete implementation sketch:**

```
1. New component: src/components/EMRDrawer.jsx
   - Props: { open, onClose, history, petName, petSpecies }
   - Renders an MUI Drawer anchor="right" width 60vw
   - Maps history → expandable cards (Accordion) sorted desc
   - Each card: date, vet, diagnosis (big), SOAP collapsible, vitals grid,
     prescriptions list, vaccineData block, labResults block
2. ClinicalWorkspace changes:
   - Add: const [emrOpen, setEmrOpen] = useState(false);
   - Add button in identity strip ~line 1327 (before God-View):
       <Tooltip title="View Full Medical History">
         <IconButton size="small" onClick={() => setEmrOpen(true)}>
           <HistoryEduIcon />  // already imported
         </IconButton>
       </Tooltip>
   - Mount: <EMRDrawer open={emrOpen} onClose={() => setEmrOpen(false)}
              history={history} petName={patient?.petName}
              petSpecies={patient?.petSpecies} />
   - No new Firestore reads. `history` is already populated.
```

Hand this to a code-engineer subagent as a single ~200-line task.

**Recommendation.** Build `EMRDrawer.jsx` as a slide-over, wire it to the existing `history` state, add one icon button to the identity strip. No new data fetches, no refactors to the SOAP grid. ~1 day of work. High defense-demo value: the vet can say "I'm pulling up three years of this dog's records while I palpate the mass" without leaving the workspace.

---

## Q3 — "CRM Sovereignty Sync" — what it is and whether to keep it

**Every occurrence inside ClinicalWorkspace.jsx:**

1. `const [syncToCRM, setSyncToCRM] = useState(true);` (`ClinicalWorkspace.jsx:327`)
2. The sovereignty gate inside `handleSaveConsult` that merges CRM identity fields into the pet doc (`ClinicalWorkspace.jsx:962-1010`)
3. The same block writes a CRM sync pulse event onto the appointment (`ClinicalWorkspace.jsx:1032-1040`)
4. The orange sidebar card labelled "CRM SOVEREIGNTY SYNC" (`ClinicalWorkspace.jsx:1754-1765`) containing a single `Switch` bound to `syncToCRM`

**Outside the file:** `grep sovereignty` returns only this one file across the entire admin tree. It is a local concept, not a shared system.

**What the function actually does.** On sign-off, when the switch is ON (which is the default):

```js
// pet doc — identity fields
name: patient.petName,
species: patient.petSpecies,
breed: patient.petBreed,
gender: patient.petGender,
isNeutered: patient.petIsNeutered,
dob: patient.petBirthdate,
isAgeExact: patient.isAgeExact !== false,
"audit.lastSyncDate": commitTimestamp,
"audit.syncStaff": vetName,
"audit.syncReason": "Clinical Session Biometric Sync",
```
(`ClinicalWorkspace.jsx:983-994`)

```js
// users doc — owner contact
fullName: patient.ownerName,
"audit.lastPhoneUpdate": commitTimestamp,
phone: patient.ownerPhone,  // only if regex matches /^09\d{9}$/
```
(`ClinicalWorkspace.jsx:1001-1008`)

**What triggers it.** Only `handleSaveConsult`. Not draft save, not auto. Switch defaults to `true`, sign-off writes it.

**Comments explaining intent.** Line 961: `// 2. CRM SYNC + VITALS PROPAGATION — merged into a single batch.update per document`. The comment makes clear the *vitals* portion is always written — only the identity sync is gated. Line 1038 explains the pulse: `"Master CRM updated with clinical corrections."`

**Why it exists (inferred).** The idea is: the appointment document is a *snapshot* of pet/owner at booking time. If the vet notices the pet was mis-recorded as "beagle/male" but is actually "basset hound/neutered male", the sovereignty sync propagates the vet's observation back to the master records (`pets` and `users` collections) — the vet becomes the authoritative source of truth ("sovereign"). Without this sync, the master records keep the old values and future bookings re-inject them into new appointments. It's a CRM hygiene loop.

**What would break if deleted.**

- *Vitals propagation stays*, because vitals are written unconditionally (lines 967-979). Tiered pricing on the next visit still recalculates using `pets.lastVitals.weight` — **not broken**.
- *Pet identity drift* would go uncorrected. If a pet was booked as "mixed" and the vet determined it's actually a "French Bulldog", the master `pets` doc keeps saying "mixed" forever. Not clinically dangerous. Annoying for the admin CRM.
- *Owner name/phone corrections* would never flow back. Low frequency and out-of-band fixable via the Patients CRUD UI.
- *Audit trail of who synced what when* would vanish (`audit.lastSyncDate`, `audit.syncStaff`, `audit.syncReason`). Nothing reads these fields anywhere else in the admin tree (I grep-confirmed — they're write-only audit breadcrumbs nobody surfaces).
- *`clinicalPulse` event of type `CRM_SYNC_SUCCESS`* stops being written. Nothing consumes this specific event type outside the file.

**Validating the hypothesis "ClinicalWorkspace could just be SOAP + cart with no sync layer":**

Partially correct. The developer is right that the *identity sync + owner sync* is doing work nobody reads back. But **vitals propagation is load-bearing**: `pets.lastVitals.weight` feeds back into `resolveTieredPrice` at the next booking and is rendered in the Patients CRM. Deleting the entire block would break that path.

**Directional verdict: REFACTOR, not delete.**

Remove:
- The `syncToCRM` state and the Switch UI (`ClinicalWorkspace.jsx:327`, `1754-1765`)
- The conditional identity-field object spread (`ClinicalWorkspace.jsx:982-995`)
- The owner sync block (`ClinicalWorkspace.jsx:999-1009`)
- The `CRM_SYNC_SUCCESS` pulse event (`ClinicalWorkspace.jsx:1032-1040`)

Keep:
- The unconditional `lastVitals.*` writes and `lastVisitDate` (`ClinicalWorkspace.jsx:967-980`)
- The `batch.update(petRef, petUpdate)` call itself — just with the trimmed payload

This removes ~45 lines of cognitive overhead and the confusing "sovereignty" terminology, while preserving the only behavior that matters downstream. The vet never has to decide whether to toggle the switch (they can't meaningfully make that decision mid-consult anyway), and the defense narrative simplifies to "vitals from the consult are cached onto the pet document for fast lookup".

**Recommendation.** REFACTOR: delete the switch, the identity/owner sync, and the pulse event. Keep the vitals propagation. Rename the comment from "CRM SYNC + VITALS PROPAGATION" to "VITALS CACHE". Net: ~45 lines removed, defense narrative simplified, zero downstream breakage.

---

## Q4 — Vaccine fields in the SOAP Plan section

**What the "vaccine details" field collects** (`ClinicalWorkspace.jsx:316-320`, `1532-1579`):

| Field | Type | UI |
|---|---|---|
| `vaccineName` | text | TextField |
| `manufacturer` | text | TextField |
| `lotNumber` | text | TextField |
| `routeOfAdmin` | select: SQ / IM / ID / IN / PO | Select |
| `siteOfInjection` | text, default "Right Scruff" | TextField |
| `dueDate` | date input | date picker |
| `intervalDays` | number, default 365 | number input |

No expiry-of-vial field. No lot-to-batch linkage to the inventory product that was dispensed from the cart. No photo/scan.

**How the vaccine field is triggered to appear.** Conditional render gated by `isVaccinationVisit` (`ClinicalWorkspace.jsx:833-838`, `1532`):

```js
const isVaccinationVisit = useMemo(() => {
    const keywords = ['vaccine', 'vaccination', 'rabies', 'dhpp', 'da2pp', 'bordetella', 'lepto', '5-in-1'];
    const serviceNames = (patient?.services || []).map(s => (s.name || '').toLowerCase()).join(' ');
    const primary = (patient?.primaryService || '').toLowerCase();
    return keywords.some(kw => serviceNames.includes(kw) || primary.includes(kw));
}, [patient]);
```

**Keyword matching against booked service names.** Not manual, not toggle. Booking a "Rabies Vaccine" or "DHPP Booster" service → form appears. Booking a "Consultation" → form hidden. **This is brittle.** If a service is named "Immunization - Combo 5 in 1" it matches "5-in-1". If it's named "Vaccination Package" it matches. If it's named "Anti-Rabies" it matches "rabies". But "Heartworm + Parvo Prevention" wouldn't match anything — and if a vet decides mid-consult to administer a vaccine that wasn't booked, there is no way to reveal the form (no manual toggle).

**How entries are saved to Firestore.** Embedded in the `medical_records` document under a `vaccineData` sub-object (`ClinicalWorkspace.jsx:934-944`). Only written if *both* `isVaccinationVisit === true` AND `vaccineData.vaccineName` is truthy. Conditional object spread.

**No separate `vaccinations` collection, no sub-collection under `pets`.** One vaccine per medical record max. A multi-vaccine visit (DHPP + Rabies + Bordetella) can only record ONE vaccine's metadata — the form is singular.

**How it's accessed later.** Confirmed surfaces:
- `PatientDashboard.jsx:256-280` — has a "vaccination tracker" that iterates known vaccines and finds the most recent matching `medical_records.vaccineData` per pet. Prefers structured, falls back to keyword search of SOAP text for legacy records.
- Mobile `PetHistoryScreen.js:387-425` — renders a vaccination record card per medical record that contains `vaccineData`, showing MFR / LOT / ROUTE / SITE / next-dose-due banner.

**What the pet owner can see on mobile.** The vaccine card renders on `PetHistoryScreen`: vaccine name, manufacturer, lot number, route, site, next due date. This is decent.

**Is there a "vaccination history" surface, or is each entry buried in a single visit?** `PatientDashboard.jsx` (admin) has an aggregated vaccination tracker. Mobile `PetHistoryScreen.js` shows them one per visit card — no aggregated view. **No printable vaccination certificate exists anywhere.** I grep-confirmed no `vaccinationCertificate`, no `printVaccinationRecord`, no `html` vaccine export path in either project.

**The thesis claim of "printable vaccination records".** The data is *structured well enough* to support this (a single `vaccineData` object per record, consistent schema). What's missing is the render layer — a component that takes `records.filter(r => r.vaccineData).map(...)` and produces a print-friendly HTML export. This is ~80 lines of new code, not a data model rewrite.

**Gaps identified:**

1. **Only one vaccine per visit can be recorded.** Multi-vaccine visits require multiple sequential appointments or lossy data entry. Should be an array `vaccineAdministrations: [...]` instead of a singular object.
2. **Form visibility is keyword-gated.** No manual override.
3. **No link between `vaccineData.vaccineName` and the inventory product in `rxCart`** — lot numbers can drift from the actual vial used.
4. **No vial expiry capture.**
5. **No printable certificate renderer anywhere.**

**Recommendation.** For defense: (1) add a manual toggle "Administering a vaccine?" that force-shows the form regardless of keyword match; (2) promote `vaccineData` to an array `vaccineAdministrations[]` so multi-vaccine visits work — breaks backward-compat with `PatientDashboard` tracker, fixable in ~20 lines; (3) build the print-vaccination-record HTML renderer in `PatientDashboard` as a "Print Vaccination Passport" button. The data model is 80% there. Don't rewrite — extend.

---

## Q5 — Auto-bundling of inventory products to services

**Is this actually implemented?** Yes, both ends.

**Admin-facing definition UI:** `ServiceFormModal.jsx:24-113` — multi-select of inventory products via `linkedProducts: [...]` array with backward-compat migration from legacy singular `linkedProduct` field. Persisted by `useServices.js:98-109` which writes both the array and the singular key for migration safety.

**ClinicalWorkspace consumption:** `ClinicalWorkspace.jsx:508-523`

```js
if (baseService) {
    const linkedIds = baseService.linkedProducts
        || (baseService.linkedProduct ? [baseService.linkedProduct] : []);
    linkedIds.forEach(productId => {
        const linkedInv = inventoryList.find(i => i.id === productId);
        if (linkedInv) {
            initialCart.push({
                type: 'product', id: linkedInv.id, name: linkedInv.itemName,
                price: linkedInv.price, qty: 1,
                isDrug: !!linkedInv.isMedicine,
                isBase: false, isAutoBundled: true, instructions: ''
            });
        }
    });
}
```

**Where the associations are stored.** On the `services` collection as a `linkedProducts` array of inventory product ids. Confirmed: `useServices.js:108`.

**Does it work? Concrete trace for "Rabies Vaccine":**

1. Admin opens Services → edits "Rabies Vaccine" → Linked Products section → adds the "Rabies Vaccine Vial" inventory product → saves.
2. services doc now contains `linkedProducts: ['inv_rabies_vial_id']`.
3. Client books "Rabies Vaccine" service → appointment `primaryService: "Rabies Vaccine"`.
4. Vet opens consult → `fetchPatientContext` runs → finds `baseService` by name match (`servicesList.find(s => s.name === patient.primaryService)`, `ClinicalWorkspace.jsx:494`) → iterates `linkedProducts` → pushes product to cart as auto-bundled.
5. `reserveStock` fires for the product (`ClinicalWorkspace.jsx:530-535`).

**Confirmed working.** But with caveats:

**Caveat A — name match is fragile.** `baseService = servicesList.find(s => s.name === patient.primaryService)` uses string equality on `name`, not id lookup. If the service is renamed after booking, the lookup fails silently. No warning, no fallback. A `.id`-based lookup would be stable; I don't see it anywhere in the booking flow. Low-severity but real.

**Caveat B — only `primaryService` is auto-bundled, not the other booked services.** Lines 498-506 loop through `patient.services` and push them as cart line items — but the auto-bundle block at 509 only checks `baseService` (the primaryService). If a client books "Consultation + Rabies Vaccine" with Consultation as primary, the Rabies vaccine's linked inventory will NOT auto-bundle. Bug. The fix is to iterate `(patient.services || []).forEach(svc => { const def = ... def.linkedProducts?.forEach(...) })`.

**Caveat C — What happens if the bundled product is out of stock?** Trace:
- Line 513: `const linkedInv = inventoryList.find(i => i.id === productId);` — found.
- Line 515: push onto cart regardless of stock.
- Line 530-534: `reserveStock` is called inside try/catch, which increments the `reserved` counter. There is NO pre-check for stock availability. The reservation happens even if `stock - reserved <= 0`. The item appears in the cart even if out of stock.
- At POS checkout, `POSModal.jsx:291-312` will throw "Not enough stock for X" and abort the whole sale.

**This is a latent bug.** Vet cheerfully builds a treatment plan including a vaccine that isn't physically in the fridge, signs off, patient walks to cashier, cashier fails to check out. Compare to `handleAddRx` (`ClinicalWorkspace.jsx:722-727`) which *does* check `netAvailable <= 0` for manually-added items.

**Caveat D — Is there an admin UI surface to define bundles?** Yes: `ServiceFormModal.jsx` has a full linked-products multi-select (`ServiceFormModal.jsx:283-307`). Accessible via Services page → edit any service → "Linked Products" section. Works.

**Directional assessment: PARTIAL.**

The happy path works end-to-end. Two real bugs block "production-ready":
1. Only primaryService auto-bundles, not all booked services.
2. No stock guard on auto-bundled items — will fail at POS.

One architectural smell: service lookup by name string, not id.

**Recommendation.** Fix the two bugs in ~15 lines total:
1. Restructure the loop at `ClinicalWorkspace.jsx:493-523` so *every* entry in `patient.services` gets its linked products bundled, not just `baseService`.
2. Before pushing a linked product onto the cart, check `(linkedInv.stock || 0) - (linkedInv.reserved || 0) > 0`; if out of stock, skip the push and queue a toast "Rabies Vaccine Vial is out of stock — please pull manually".

Don't touch the admin-side definition UI; it's fine.

---

## Q6 — In-Consult → Dispensing/Billing handoff process

**Sign-off trigger.** Vet clicks "Sign & Send to Pharmacy" or "Sign & Send to Cashier" button at `ClinicalWorkspace.jsx:1773`. Button is disabled unless `ownerSignature` is set.

**Routing decision.** `ClinicalWorkspace.jsx:840-842`:
```js
const hasDrugsInCart = rxCart.some(item => item.isDrug);
const nextRouteStatus = hasDrugsInCart ? "dispensing" : "billing";
const saveBtnText = hasDrugsInCart ? "Sign & Send to Pharmacy" : "Sign & Send to Cashier";
```

`isDrug` is set per-item from `!!linkedInv.isMedicine` (auto-bundled, `ClinicalWorkspace.jsx:518`) or `!!item.isMedicine` (manually added, `ClinicalWorkspace.jsx:729`). Source of truth: the inventory product's `isMedicine` flag.

**What `handleSaveConsult` writes in its `writeBatch`** (`ClinicalWorkspace.jsx:866-1078`):

1. **New `medical_records/{newId}` doc** (`batch.set`, lines 869-955) — full SOAP + vitals + prescriptions + dischargeSummary + vaccineData (conditional) + labResults (conditional) + legal block with `isLocked: true`.
2. **`pets/{petId}` update** (`batch.update`, lines 962-998) — vitals cache + optional CRM sovereignty fields.
3. **`users/{ownerId}` update** (`batch.update`, lines 1000-1009) — only when sovereignty ON and owner not walk-in.
4. **`appointments/{id}` update** (`batch.update`, lines 1012-1042):
   ```js
   status: nextRouteStatus,  // 'dispensing' or 'billing'
   prescribedItems: rxCart,
   finalTotal: visitTotal,
   signedOffAt: commitTimestamp,
   prescribedItemsVersion: commitTimestamp,
   services: updatedServices,  // merged with mid-consult additions
   ```
5. **Follow-up appointment** (`batch.set`, lines 1044-1075) — only if `soapData.nextVisit` is set.

All in one atomic commit at line 1078.

**Which status: `dispensing` or `billing`?** Controlled by `hasDrugsInCart` (`ClinicalWorkspace.jsx:840`). If the cart contains ANY item with `isDrug: true`, status is `dispensing`. Otherwise `billing`.

**Does the patient skip dispensing entirely for consult-only?** Yes — if no drugs in cart, goes directly to `billing`. This works for pure consultations and for service-only visits (grooming, nail trim) where no medicine is involved.

**Empty-cart handling.** `ClinicalWorkspace.jsx:854-856` blocks sign-off entirely if `rxCart.length === 0`. This is *wrong* for a pure consult where the vet reviewed the pet, determined "all good, no Rx", and wants to bill only the consult fee. The fix is that the consult fee itself is a service that *should* already be in `rxCart` via the service auto-push at line 502 — so if the appointment had a "Consultation" service booked, the cart has at least that line item. The block is really "you must have at least one line item, even if it's just the consult fee." In practice this is enforceable only because the appointment always carries at least the primary service into the cart. Walk-in with a zero-service appointment would fail. Edge case but real for quick-admit flows.

**How cart state is persisted for POSModal.** Written to `appointments.prescribedItems` (line 1023). POSModal reads this: `POSModal.jsx:47-48` — `initialCart = patient.prescribedItems.map(item => ({ ...item, isPrescribed: item.isBase ? false : true }))`. The cart flows through appointments → POSModal → billing with no intermediate storage.

**Inventory reservations during handoff.** Critical: `isRecordLockedRef.current = true` is set SYNCHRONOUSLY after batch commit (`ClinicalWorkspace.jsx:1082`) before `setIsRecordLocked(true)` schedules. This is deliberate so the unmount cleanup at lines 346-358 sees `isRecordLockedRef.current === true` and skips the release. The reservations survive sign-off and persist until POSModal's atomic transaction at `POSModal.jsx:283+` does the real stock deduction (which reads `stock` not `reserved` — the `reserved` counter is advisory only and never actively decremented at POS checkout unless POSModal explicitly does so — **let me verify that gap below**).

**Actually, a reserved-counter leak.** POSModal's checkout (`POSModal.jsx:283-319`) deducts `stock` via `runTransaction` but I don't see it decrementing the `reserved` counter. If true, the `reserved` field keeps climbing forever across sessions. I couldn't fully verify this from the 80-line slice I read — flagging as a suspected leak for the developer to confirm by grepping `POSModal.jsx` for `reserved`.

**Race conditions and edge cases:**

1. **Double sign-off.** `isSavingRef.current` guard at line 845 prevents re-entry while a save is in flight. After commit, `lockedServices.has('medical')` guard at line 847 blocks any re-invocation from the same session (but the second session would also be blocked because `patient.services.find(s.status === 'completed')` is re-read from Firestore on mount). Looks solid.

2. **Sign off with empty cart.** Blocked at line 854 — rejected with an alert. Fine for the common case; painful for the consult-only edge case described above.

3. **Sign off with out-of-stock item in cart.** The batch commit succeeds because the medical record write doesn't touch inventory. The appointment moves to `dispensing`. The dispensing verification dialog (`DispensingVerificationDialog.jsx`) displays the items but is a checklist, not a stock guard. POSModal checkout catches it via `runTransaction` and throws. End state: patient is stuck in billing limbo with a sealed medical record and a cart they can't complete. The cashier must remove the item manually from the cart in POSModal — which works because POSModal's cart is editable. Not broken, but ugly.

4. **Mid-consult ad-hoc services.** Handled at lines 1015-1019: services added to the cart mid-consult but not originally booked are merged into `appointments.services` so downstream stations see the full list. Good.

5. **Follow-up appointment creation failure.** It's inside the same batch so either everything commits or nothing does. If the follow-up doc write fails validation, the sign-off also fails. The vet sees the raw error and tries again. Acceptable; could be friendlier.

6. **`ownerSignature` is just a timestamp string** (`ClinicalWorkspace.jsx:1772`: `consent_witnessed_${Date.now()}`). Not a real signature. Writing it into `medical_records.legal.ownerSignature` is a token audit marker. See Q12.

**Recommendation.** Workflow is defense-walkable as-is. Two fixes for safety: (1) allow empty-cart sign-off with a confirm dialog for true consult-only encounters; (2) verify POSModal decrements `reserved` at checkout (likely missing — audit `POSModal.jsx` for any `reserved` decrement; if absent, add `reserved: increment(-item.qty)` inside the transaction.update loop). The `dispensing` vs `billing` routing logic is clean and demo-ready.

---

## Q7 — "Analyze" feature in the SOAP Assessment quadrant

**What it does today.** `runAssistiveDiagnosis` (`ClinicalWorkspace.jsx:708-715`):

```js
const runAssistiveDiagnosis = () => {
    const combinedNotes = (soapData.subjective + " " + soapData.objectiveNotes).toLowerCase();
    let suggestions =[];
    KNOWLEDGE_BASE.forEach(c => {
      if (c.keywords.some(k => combinedNotes.includes(k))) suggestions.push(c.suggestion);
    });
    setAssistiveText(suggestions.length > 0 ? suggestions.join('\n\n') : 'No rule-based suggestions found. Please proceed with standard diagnostics.');
};
```

Pure substring match. No regex, no stemming, no negation handling ("not coughing" matches "cough"). Results dumped as a single newline-joined string into `assistiveText` state, then rendered inside a `DiagnosticBridge` Collapse panel (`ClinicalWorkspace.jsx:214-263`).

**Inputs.** `soapData.subjective + " " + soapData.objectiveNotes`. NOT vitals, NOT assessment, NOT prior history.

**Outputs.** One fixed suggestion string per matched rule. Concatenated with `\n\n`. No confidence scores, no differential weighting, no ranking.

**KNOWLEDGE_BASE structure** (`ClinicalWorkspace.jsx:266-273`):

```js
const KNOWLEDGE_BASE = [
  { keywords: ['cough', 'hacking', 'trachea'], suggestion: "🩺 RECOMMEND: Thoracic radiographs to rule out Kennel Cough vs. Cardiac (CHF) vs. Tracheal Collapse." },
  { keywords: ['scratching', 'shaking head', 'ear', 'brown discharge'], suggestion: "🧪 RECOMMEND: Ear cytology for Malassezia (Yeast) vs. Bacterial Otitis. Check for Otodectes." },
  { keywords: ['vomiting', 'diarrhea', 'dehydrated'], suggestion: "💧 RECOMMEND: Fluid therapy (IV/SQ) + Parvovirus SNAP test if puppy. Rule out dietary indiscretion vs. pancreatitis." },
  { keywords: ['limping', 'hind', 'cruciate'], suggestion: "🦴 RECOMMEND: Orthopedic exam (Drawer/Tibial Compression) + stifle radiographs. Consider NSAIDs and rest." },
  { keywords: ['seizure', 'fits', 'convulsions'], suggestion: "🧠 RECOMMEND: CBC/Chem to rule out metabolic causes (liver/glucose). Monitor duration/frequency for Phenobarbital start." },
  { keywords: ['peeing', 'straining', 'blood', 'urinary'], suggestion: "🧪 RECOMMEND: Urinalysis + Culture to rule out UTI vs. Crystals/Calculi (Uroliths). Check for bladder stones." }
];
```

**Six rules total.** Hand-crafted. Exhaustive list.

**Rule-based or AI-backed?** Pure rule-based. Deterministic in the "same input → same output" sense, but the thesis calls the tool "non-deterministic, supportive, not diagnostic" which is factually wrong — the current implementation IS deterministic. The thesis language is aspirational, not descriptive.

**Does the thesis claim match the implementation?** No. Six hard-coded substring rules do not meet any reasonable bar for "clinical intelligence". They're a keyword-based reminder system with motivational emojis.

**Could it use an AI API instead?**

*What would change in the data contract.*

You'd POST `{subjective, objectiveNotes, vitals, petSpecies, petAge, petBreed}` to a Claude or OpenAI endpoint with a system prompt like "You are a veterinary differential-diagnosis assistant. Return up to 5 rule-outs ranked by prior probability, with recommended diagnostic tests for each. Do not make definitive diagnoses." Parse the JSON response into a list instead of a concatenated string. The `DiagnosticBridge` UI barely changes — swap the rendering from `whiteSpace: pre-line` text to a list of cards.

*Privacy / RA 10173 implications.* Sending pet medical data to Anthropic or OpenAI crosses an international border and involves a third-party processor. Under RA 10173:
- You need a legal basis. "Legitimate interest" is arguable for a clinical decision-support tool, but weaker than explicit consent.
- You'd need a Data Processing Agreement with the provider.
- The clinic's privacy notice needs to disclose that pet medical data may be processed by an LLM provider.
- Pet data arguably is NOT personal data under RA 10173 because it's not about an identifiable natural person — *until* you include the owner name. Strip owner identity before sending, and you're likely fine.
- For defense: the examiner will ask about this. Have a one-slide answer: "We send anonymized pet health signals only; owner PII is stripped client-side before the API call; users consent via the privacy notice at registration."

*Cost on a Spark plan.* The project is currently on Spark (no Cloud Functions billing). If the API key lives in the admin app's client code, every user with admin access has the key. That's not viable — keys leak in browser dev tools. On Spark you cannot run a Cloud Function gateway. Options:
- Upgrade to Blaze and add a Callable Function as the LLM gateway. ~$0 fixed cost, pay-per-invocation, key stays server-side. Thesis-friendly because you already have Cloud Functions in `VetConnect-Backend/functions/`.
- Use a free tier third-party proxy (brittle, not defensible).
- Call directly from the admin with the key in the bundle (**do not ship this**).

Blaze upgrade just for this is not worth it unless the feature is headlining the defense narrative.

*Does "non-deterministic supportive tool" survive?* Yes, and MORE honestly — an LLM is genuinely non-deterministic and genuinely supportive. The current rule-based implementation is the opposite: fully deterministic. Ironically, going LLM-backed makes the thesis language *more accurate*.

**Directional verdict: HYBRID.**

- Keep the rule-based `KNOWLEDGE_BASE` as the offline/fallback path. It's free, private, and produces something when the LLM gateway is down.
- Add an "Ask AI (beta)" button next to "Analyze S+O" that routes through a Blaze Cloud Function calling Claude/OpenAI. Feature-flag it off by default for defense unless you've secured the Blaze upgrade and the privacy-notice update.
- Expand `KNOWLEDGE_BASE` from 6 rules to 30 if you stay rule-based. Six is thin for a panel demo.
- Feed vitals into the rule engine (species-adjusted temperature, HR) — trivial and makes the rule-based output look more clinical than it is today.

**Recommendation.** For defense, expand `KNOWLEDGE_BASE` to 30+ rules with species-aware vitals inputs, and position the feature honestly as "rule-based clinical reminders, not a differential diagnosis engine." Deferred: LLM integration as a post-defense enhancement, gated behind Blaze upgrade and a privacy-notice revision. Do not ship an LLM integration before the defense — the examiner questions would be harder than the defense gain.

---

## Q8 — Vitals values in the Objective section — how saved & where

**Form state shape** (`ClinicalWorkspace.jsx:299-304`):
```js
{ objWeight, objTemp, objHR, objRR, objCRT, bcs, painScale, ... }
```

All vitals live under `soapData.*` with the `obj`-prefixed keys (except `bcs` and `painScale`).

**Rendering.** `VitalsGrid` at `ClinicalWorkspace.jsx:148-203`, wired with `updateSoap(field, value)` on each input's onChange.

**Save path on sign-off.** Three destinations, all in the same `writeBatch`:

**1. `medical_records.vitals` object** (`ClinicalWorkspace.jsx:891-894`):
```js
vitals: {
    weight: soapData.objWeight, temp: soapData.objTemp, hr: soapData.objHR,
    rr: soapData.objRR, crt: soapData.objCRT, bcs: soapData.bcs, pain: soapData.painScale
},
```

Note the key renaming: `objWeight → weight`, `objTemp → temp`, `painScale → pain`. Symmetric to the `FIELD_TO_VITALS_KEY` map used by `renderHistoricalLabel` (`ClinicalWorkspace.jsx:687-695`).

**2. `pets/{petId}.lastVitals`** (`ClinicalWorkspace.jsx:967-980`):
```js
"lastVitals.weight": soapData.objWeight || null,
"lastVitals.temp": soapData.objTemp || null,
"lastVitals.hr": soapData.objHR || null,
"lastVitals.rr": soapData.objRR || null,
"lastVitals.bcs": soapData.bcs || null,
"lastVitals.painScale": soapData.painScale || null,
"lastVitals.crt": soapData.objCRT || null,
"lastVitals.safetyStatus": 'Safe',
"lastVitals.dentalGrade": dentalGrade,
"lastVitals.lamenessGrade": lamenessGrade,
"lastVitals.recordedAt": commitTimestamp,
lastVisitDate: commitTimestamp,
```

**Inconsistency found:** the embedded `medical_records.vitals.pain` uses key `pain`, but `pets.lastVitals.painScale` uses `painScale`. Asymmetric keys. Whoever reads both will need a shim.

**3. `appointments.{id}`** — vitals NOT written to appointment. Only `prescribedItems`, `finalTotal`, `signedOffAt`, etc. The appointment stays clean of clinical payload; medical_records is the source of truth.

**4. `pets.lastWeight`?** No such field. Weight is written as `lastVitals.weight` only. Any code that expects `pets.lastWeight` will miss it.

**Ghost comparison ("prior vitals in the form").** `renderHistoricalLabel` (`ClinicalWorkspace.jsx:681-706`) reads `history[0].vitals[vKey]` and renders a tiny "LAST: X" caption under each input. The prior-vitals source is `medical_records` (via the `history` array fetched in useEffect at lines 543-547), NOT `pets.lastVitals`. So the "ghost" is always the *last medical record's* vitals, regardless of whether the pets.lastVitals cache has been updated.

`prevVitals` state (`ClinicalWorkspace.jsx:551`) holds the same thing and is used by `getWeightDelta` at lines 1216-1223 to compute a weight % change.

**Is pet weight propagated back to `pets` for tiered-pricing recalc?**

Yes, via `pets.lastVitals.weight` (line 968). But — and this matters — `useBookingEngine` and the resolveTieredPrice path on mobile appointment booking... let me check whether it reads `pets.lastVitals.weight` or `pets.weight`.

I didn't trace the mobile booking path in depth, but `resolveTieredPrice(service, petWeight)` is called in ClinicalWorkspace with `parseFloat(patient.petWeight)` (line 495) — so the *appointment* document's `petWeight` field is the source, not the pet doc. The vitals update to `pets.lastVitals.weight` doesn't directly feed into the next booking unless the booking pre-fill reads `pets.lastVitals.weight`. This is worth confirming.

**Key inconsistencies (summary):**

| Write | Key | Read |
|---|---|---|
| medical_records.vitals.pain | `pain` | `renderHistoricalLabel` via `FIELD_TO_VITALS_KEY.painScale = 'pain'` ✅ |
| pets.lastVitals.painScale | `painScale` | Unknown — no reader found in ClinicalWorkspace |
| medical_records.vitals.weight | `weight` | ghost labels ✅ |
| pets.lastVitals.weight | `weight` | CRM cards, possibly booking pre-fill — unverified |
| appointments.petWeight | `petWeight` | resolveTieredPrice in ClinicalWorkspace |
| pets.weight | (not written by ClinicalWorkspace) | Unknown |

The naming drift (`pain` vs `painScale`, the absence of `pets.weight` vs `pets.lastVitals.weight`) is a minor tech-debt smell but not actively breaking anything I can see.

**Recommendation.** Minor: normalize the pain-key asymmetry — either `pain` everywhere or `painScale` everywhere (the `medical_records.vitals.pain` side is shorter and cleaner; rename the `lastVitals.painScale` write to `lastVitals.pain`). Verify that mobile `useBookingEngine` reads `pets.lastVitals.weight` for tiered-price prefill — if it doesn't, add that as a follow-up task because the current vitals propagation is basically write-only from the tiered-pricing standpoint. Defer unless tiered pricing is a defense focus.

---

## Q9 — "Add Lab Result" function in the Plan quadrant

**Fields captured** (`ClinicalWorkspace.jsx:322-323`, `1582-1622`):

```js
const [labResults, setLabResults] = useState([]);
// Each row: { testName, result, status, notes }
```

Where `status` is one of `normal` / `abnormal` / `critical` via an MUI Select (`ClinicalWorkspace.jsx:1604-1614`).

No unit field. No reference range. No date (inferred = visit date). No attached file / image / PDF upload. The `notes` field exists in state but is not rendered in the UI — the form only has testName, result, status, and a delete button.

**Where it's saved** (`ClinicalWorkspace.jsx:946-954`):

```js
...(labResults.length > 0 ? {
    labResults: labResults.filter(l => l.testName).map(l => ({
        testName: l.testName,
        result: l.result,
        status: l.status,
        notes: l.notes || '',
    }))
} : {}),
```

Embedded directly into the `medical_records` doc as a `labResults` array. No separate collection. No Storage bucket for attachments (there are none).

**Purpose given that thesis excludes "external lab integrations".** Manual entry only. The vet reads a result from an in-house SNAP test / handheld device / external lab report and types it in. Consistent with the thesis scope — this is data entry, not integration.

**Can the pet owner see lab results on mobile?** I grep-confirmed `labResults` is NOT referenced in `VetConnect/src/screens/PetHistoryScreen.js`. The mobile screen renders `soap.subjective`, `vaccineData`, vitals, diagnosis, but not `labResults`. Admin-side, `PatientDashboard.jsx` also does not appear to read `labResults`. **Data is write-only from a rendering standpoint.** It lives in the medical record doc but no UI surfaces it.

**Structured lab result viewer?** None found. Each entry is frozen inside the medical record document it was created with.

**Verdict and recommendation.** This is aspirational scaffolding. The feature writes data nobody reads. Options:

- **Promote to real feature:** add a "Lab Results" section to `PetHistoryScreen.js` (mobile) and `PatientDashboard.jsx` (admin) that renders the `labResults` array with status colour-coding. ~60 lines of new render code. Thesis-defensible.
- **Demote to freeform note:** remove the structured form entirely, tell the vet to paste lab results into the SOAP plan text field. Loses structure but honest.
- **Leave as-is:** hidden write-only data. Works for demo (vet types in a result, shows the row, signs off) but doesn't survive examiner scrutiny if they ask "where does this data go?".

**Recommendation.** Promote. This is a high-value, low-cost extension — the write path is already in place; you only need to render the array in two places. If the defense narrative includes "clinical workspace captures structured lab data", the examiner will ask where it's viewed. Build a simple per-record lab-results card in `PetHistoryScreen.js` and a lab-results aggregation in `PatientDashboard.jsx`. ~1 day total.

---

## Q10 — Subjective (History & Client Report) auto-fill

**Source of the auto-fill.** `ClinicalWorkspace.jsx:437`:

```js
subjective: patient.notes && patient.notes !== 'Walk-in client' && !patient.notes.includes('QUICK ADMIT') 
    ? `Client noted: "${patient.notes}"\n\n` 
    : '',
```

**Source field is `patient.notes`**, which comes from the appointment document. `patient.notes` is populated at booking time — the pet owner's free-text "reason for visit" / "describe your pet's condition" entered in the mobile booking flow.

**Lifecycle moment.** Inside `fetchPatientContext` → the `useEffect` triggered by `[open, patient]` (`ClinicalWorkspace.jsx:400-579`), specifically in the `freshDefaults` initializer when there's no draft and no banner. It runs whenever the Dialog opens with a patient prop.

**Can the vet override it?** Yes. It's a normal editable `TextField` bound to `soapData.subjective` (`ClinicalWorkspace.jsx:1485-1492`). The vet can delete, append, rewrite — no lock.

**Format.** A single prefix string: `Client noted: "<the text>"\n\n`. No structure, no bullet points. Two trailing newlines for the vet to append their own notes underneath.

**Symmetric write/strip logic.**

| Side | Action | Location |
|---|---|---|
| Write (admin) | `Client noted: "${patient.notes}"\n\n` | `ClinicalWorkspace.jsx:437` |
| Write (admin) | Vet edits freely on top of this prefix | Text field at `ClinicalWorkspace.jsx:1485` |
| Persist | `medical_records.soap.subjective` | `ClinicalWorkspace.jsx:884` |
| Strip (mobile) | `.replace('Client noted: "', "").replace('"\n\n', "")` | `PetHistoryScreen.js:182-183` |

The mobile strip is **fragile string replacement**. If the vet adds any character between `"` and `\n\n` (e.g., a period), the trailing replace won't match and the quote + newlines render literally. If the vet deletes the entire prefix and writes a fresh subjective, the mobile side renders it verbatim — exposing whatever the vet wrote as "REPORTED SYMPTOMS / HISTORY". That's the information leak.

**Other potential sources of pre-fill.** None. There is no booking-notes-from-appointment-confirm, no triage-notes-from-queue, no client-submitted-intake-form. The single source is `patient.notes` on the appointment doc, period. Confirmed via grep — `patient.notes` is only read in this one useEffect.

**Implication for Task 2.8 (gating subjective from mobile).** The nuance is that the subjective field starts as client-authored text (via the `Client noted: "..."` pre-fill) and ends as whatever the vet edits on top of it. By the time it's written to Firestore, you cannot distinguish the original client words from the vet's added observations — they're merged into a single string.

Two clean paths:

**Path A — Split storage:** On sign-off, store the original client note separately (`medical_records.clientReport`) and the vet-authored remainder separately (`medical_records.soap.subjective`). Mobile renders `clientReport` only. This requires modifying the sign-off batch to preserve the original `patient.notes` and strip it from the vet's final subjective before writing. Mildly invasive but clean.

**Path B — Hide `soap.subjective` from mobile entirely.** Replace the mobile render block at `PetHistoryScreen.js:173-187` with the `dischargeSummary` (which is already written by the sign-off — see `ClinicalWorkspace.jsx:914-931`). This is the simplest fix and is already recommended in MASTER_TASKLIST.md Task 2.9 per the grep results. Mobile sees clean discharge text only; internal SOAP stays vet-only.

Path B is ~20 lines of mobile changes. Path A is ~40 lines across admin + mobile and adds a new field. Path B is clearly correct.

**Recommendation.** Implement Path B: delete the `soap.subjective` render block in `PetHistoryScreen.js:173-187` and replace with `dischargeSummary` rendering. Keep the auto-fill mechanism on the admin side — it's a useful UX crutch for the vet. This fully resolves the Task 2.8 gating question: subjective is invisible on mobile regardless of its origin.

---

## Q11 — Which consult notes should be visible on pet-owner mobile?

Verdict matrix. Rationale cites the thesis "client portal restriction" language (referenced from ECOSYSTEM_ARCHITECTURE_REPORT.md `:353-357`) and practical UX needs.

| Field | Firestore location | Verdict | Thesis rationale | UX rationale |
|---|---|---|---|---|
| **Subjective (history & client report)** | `medical_records.soap.subjective` | **HIDDEN** | Freeform field conflates client-reported history with vet observations; cannot cleanly distinguish after merge. Treat as internal. | Owner already knows what they reported. Zero new value. |
| **Objective notes** | `medical_records.soap.objective` | **HIDDEN** | Core clinical examination findings — explicitly "sensitive clinical notes". | Unreadable by lay audience ("MM pink/moist, CRT <2s"); no owner value. |
| **Vitals** (weight, temp, HR, RR, CRT, BCS, pain) | `medical_records.vitals.*` | **VISIBLE** | Vitals are factual measurements, not clinical interpretation. Owner has a right to know their pet's weight/temp. | Weight trend is useful for owner-driven nutrition decisions. Temp/HR reassuring on a routine visit. |
| **Assessment** (vet's working diagnosis) | `medical_records.soap.assessment` | **REDACTED** — show `medical_records.diagnosis` only (the top-line summary) | Full assessment is clinical reasoning — internal. Top-line diagnosis IS communicated verbally at discharge; rendering it on mobile is consistent with spoken practice. | Owner needs to know "my dog has kennel cough". Doesn't need to see differentials. |
| **Plan** (treatment plan prose) | `medical_records.soap.plan` | **HIDDEN** — replaced by `dischargeSummary.instructions` | Internal treatment reasoning. Client-safe version already exists in `dischargeSummary`. | Avoids medication dosing written in clinical shorthand that owner might misread. |
| **Vaccine details** | `medical_records.vaccineData.*` | **VISIBLE** | No restriction language applies; vaccine records are explicitly owner-facing (legal requirement in many jurisdictions). | Owner needs MFR/LOT/next-due for travel, boarding, emergency vet visits. |
| **Lab results** | `medical_records.labResults[]` | **VISIBLE** (if promoted to a real feature per Q9) | Factual measurements. Same logic as vitals. | Owner wants to see "PCV 45 (normal)". |
| **Discharge summary** | `medical_records.dischargeSummary.*` | **VISIBLE** | Explicitly designed as the client-safe subset (see `ClinicalWorkspace.jsx:914-931`). | Primary owner-facing artifact. Required. |
| **Next visit / follow-up date** | `medical_records.nextVisit` | **VISIBLE** | No restriction. | Critical for recheck compliance. Already used by B5 one-tap rebook. |
| **Vet name / signature** | `medical_records.vetName`, `.signedBy` | **VISIBLE (name only)** | Attribution is standard. Signature string is an internal audit token. | Owner wants to know who saw their pet. |
| **Prescribed items list** | `medical_records.prescriptions[]` | **VISIBLE (name + qty + instructions only; NO price)** | Medication names and dosing instructions are client-facing by design — dispensing label equivalent. Price belongs to the billing surface. | Owner needs to know "give 1 tablet twice daily for 7 days". |
| **Total cost / billing detail** | `medical_records.prescriptions[].price`, appointments finalTotal | **VISIBLE on a separate "Receipts" surface, HIDDEN from PetHistoryScreen** | Financial data is personal and should live under an "Account / Billing" tab, not a medical history tab. | Clean separation between "my pet's health" and "what I owe". |

**Task 2.8 spec derived from the above:**

> In `PetHistoryScreen.js`, remove renders of `item.soap?.subjective`, `item.soap?.objective`, `item.soap?.assessment` (replace with `item.diagnosis`), and `item.soap?.plan` (replace with `item.dischargeSummary?.instructions`). Keep `item.vitals`, `item.vaccineData`, `item.dischargeSummary`, `item.nextVisit`, `item.vetName`, and `item.prescriptions` (strip `price` before rendering). If `item.labResults` exists and Q9 is promoted, render it as a client-safe card. Do NOT render any field prefixed with `legal.`, `clinicalPulse`, or `draftSavedBy` — all internal audit.

**Recommendation.** Implement the spec table above as Task 2.8. Concrete edit scope: one file (`PetHistoryScreen.js`), delete the subjective block at lines 173-187, replace plan rendering with dischargeSummary rendering, ensure prescription map strips `price`, leave vitals and vaccineData intact. ~30 lines changed.

---

## Q12 — "Sign Digital Consent" — whose, audited how

**The button.** `ClinicalWorkspace.jsx:1770-1772`:

```jsx
{/* Staff-witnessed consent acknowledgement — not a cryptographic digital signature.
    Replace with a canvas-based signature pad if legal requirements escalate. */}
<Button variant="outlined" fullWidth size="large" 
    onClick={() => setOwnerSignature(`consent_witnessed_${Date.now()}`)} 
    startIcon={<HistoryEduIcon />} ...>
    {ownerSignature ? "CONSENT CAPTURED ✅" : "SIGN DIGITAL CONSENT"}
</Button>
```

**Whose consent.** Labelled "owner", captured by the vet. No owner presence required — the vet clicks the button. The inline comment explicitly calls it a "staff-witnessed consent acknowledgement" — in other words, the vet affirms the owner gave verbal consent.

**What is being consented to.** Nothing specific. There is no consent text rendered anywhere. No modal explains what the owner is consenting to. It's a generic "treatment / visit" consent with no scope definition. Not tied to sedation, surgery, euthanasia, or anything specific.

**How it's captured.** A JavaScript click handler that writes a timestamp string: `consent_witnessed_${Date.now()}`. No canvas, no typed name, no checkbox ladder, no second confirmation. One click.

**Where it's saved.** `medical_records.legal.ownerSignature` (`ClinicalWorkspace.jsx:895-899`):

```js
legal: {
    ownerSignature: ownerSignature,
    isLocked: true,
    lockedAt: commitTimestamp
},
```

So the field value at sign-off is literally the string `"consent_witnessed_1697046123456"`. Plus `isLocked: true` and a `lockedAt` Timestamp. Not a cryptographic signature, not a hash, not a base64 image — a sentinel string.

**Gating.** The sign-off button is disabled if `!ownerSignature` (`ClinicalWorkspace.jsx:1773`: `disabled={loading || !ownerSignature}`). So *something* must be clicked before sign-off — but that something is just the button itself. There is no separate consent modal, no owner interaction step.

**Is it audited?** Weakly. The string is written into the medical record. No `clinicalPulse` event is emitted for consent specifically. No `auditLogs` collection entry. No separate consent log. You can tell *that* consent was captured (the string exists) and roughly *when* (the Date.now() embedded in the string, which matches `lockedAt`). You cannot tell *who* clicked the button — `vetId`/`vetName` is captured separately but there's no explicit "consent_captured_by" attribution. The vet identity is inferable from context, not recorded explicitly for the consent event.

**Is the consent text versioned?** There is no consent text. Therefore no version. If the clinic updates its consent form two years from now, every past record says `consent_witnessed_<timestamp>` and you cannot tell which version of the form was agreed to, because there was never a form in the first place.

**Does it satisfy RA 8485 / RA 10173?**

- **RA 8485 (Animal Welfare Act)**: No specific digital consent requirement. RA 8485 mandates humane treatment but does not govern medical record consent mechanics.
- **RA 10173 (Data Privacy Act)**: Requires informed consent for processing personal data. For pet medical data, the subject is the owner (to the extent their identity is linked). The current implementation does not capture the owner's identity as the consenter, does not show them the consent text, does not record what they consented to. It fails "informed" on multiple axes.

The inline comment ("not a cryptographic digital signature. Replace with a canvas-based signature pad if legal requirements escalate") acknowledges this honestly. The developer knew.

**Verdict: VESTIGIAL.**

It's a gating mechanism disguised as a legal artifact. Its real function is to force the vet to take one extra click before sign-off — a deliberate speed-bump against accidental sign-off. It does not satisfy any legal requirement and should not be described as "digital consent" in the thesis unless meaningfully upgraded.

**Options ranked:**

1. **Rename the button** to "CONFIRM VISIT COMPLETE" or "LOCK RECORD" — accurate to what the click actually does. Zero code change beyond the label. Remove references to "consent" everywhere. Safest defense posture — you don't claim something you don't have.
2. **Add a consent modal** with fixed consent text, a "I, [owner name], consent to..." typed field, version tracking. ~100 lines. Half-honest: still not a signature, but at least informed.
3. **Canvas signature pad + dedicated audit log.** Proper implementation. Out of scope for defense, feasible for v2.

**Recommendation.** Option 1. Rename the button to **"LOCK CLINICAL RECORD"** (or similar), strip "consent" terminology from the UI and from any thesis language referencing this feature. Keep the `legal.ownerSignature` field as an internal lock sentinel — rename the field to `legal.lockToken` in a future migration. For the defense narrative: describe the feature honestly as a two-step commit guard ("sign-off requires explicit lock confirmation") rather than as a legal consent mechanism. This defuses the examiner question "where is the consent text versioned?" by not claiming to version consent in the first place.

---

## Q13 — Bonus: top 5 things worth flagging

1. **Dead `Widget` component** (`ClinicalWorkspace.jsx:76-86`). Imported from nowhere, defined inline, never rendered. Remove ~12 lines.

2. **`labQuickStats`, `dentalGrade`, `lamenessGrade` are write-only** (`ClinicalWorkspace.jsx:311-313`). `labQuickStats` is reset on mount but has no input UI and no save destination. `dentalGrade`/`lamenessGrade` are written to `pets.lastVitals.*` on sign-off (lines 976-977) but there's no input UI anywhere in the component to set them — they're stuck at their init values (0, 0) forever. Either delete the state or wire up the inputs. Currently they pollute the pet doc with zeros.

3. **`getGlucoseLevel`** (`ClinicalWorkspace.jsx:622-628`) is defined but never called. Dead function. Part of a vestigial "lab quick stats" feature that was half-built and abandoned.

4. **`applyTemplate` switch statement has only one case** (`ClinicalWorkspace.jsx:656-678`). The `switch` with a `default: break` is overbuilt for a single `wnl` case. Either add more templates (BCS, vax, dental) or collapse to a direct function.

5. **`runAssistiveDiagnosis` does not handle negation.** `"not coughing, no cough, denies cough"` would all trigger the cough rule because substring `cough` matches. Known limitation of naive substring matching. Document it in the thesis as a honest limitation rather than getting ambushed on defense.

**Honorable mentions (over 5, flagging because they're real):**

- **`soapRef`, `treatmentRef`, `dischargeRef`** (`ClinicalWorkspace.jsx:366-368`) — only `treatmentRef` is wired up (line 1673). `soapRef` is attached (line 1254) but never consumed. `dischargeRef` is declared but never attached anywhere. Zen/anchor-scroll feature that was never finished.
- **Duplicate SOAP grid rendering** in God-View (lines 1892-1968) mirrors the main 2x2 grid (lines 1480-1667) — same fields, same bindings. ~180 lines of duplication. Extracting a `SoapGrid` component would halve the JSX and prevent drift between the two views (already diverged slightly — the main Plan quadrant has Vaccine + Lab + Save Draft UI, the God-View Plan quadrant is plain text only).
- **`murmurGrade`, `murmurLocation`, `murmurTiming`, `respEffort`, `palpationFindings`** (`ClinicalWorkspace.jsx:301-302`) — state exists, persists across draft save/resume, but has no input UI anywhere in the rendered component. Same issue as `dentalGrade`: write-only dead state.
- **`isAgeExact: patient.isAgeExact !== false`** at line 990 — reads an undocumented `isAgeExact` flag off the appointment doc. Grep confirmation of where it's set would be worth 10 minutes before defense.
- **`alert()` and `window.confirm()` throughout** (lines 377, 725, 794, 848, 851, 854, 1087, 1092). Browser-native, ugly, not dismissible without focus. Already inconsistent with the Snackbar toast system (line 1973). Migrate all to MUI Dialog/Snackbar before defense — examiner will notice.

**Recommendation for Q13 (bundled).** Cleanup pass: delete `Widget`, `getGlucoseLevel`, `labQuickStats` state, and the unused `murmur/palpation/respEffort` state. Delete `soapRef`/`dischargeRef`. Either wire up `dentalGrade`/`lamenessGrade` inputs or remove their writes to `pets.lastVitals`. Extract a `SoapGrid` component shared between main and God-View. Replace `alert`/`confirm` with toast/Dialog. Net: ~300 lines deleted, zero functional regressions, significantly cleaner defense-walk of the file. Budget: 1-2 days.

---

## Cross-cutting defense-prep summary

Five things to fix before defense (ranked by examiner-question risk):

1. **Rename "Digital Consent" → "Lock Clinical Record"** (Q12). Defuses the legal-consent question entirely.
2. **Task 2.8 — hide `soap.subjective` from mobile** (Q10/Q11). Defuses the client-portal restriction question.
3. **Delete CRM Sovereignty switch, keep vitals cache** (Q3). Simplifies the sign-off narrative.
4. **Fix auto-bundling to cover all booked services + stock-guard bundled items** (Q5). Prevents live demo failure.
5. **Expand KNOWLEDGE_BASE from 6 rules to 30+ with species-aware vitals** (Q7). Makes "Analyze" defensible without LLM risk.

Four things to build if you have an extra week:

1. **EMRDrawer slide-over** for historical context (Q2)
2. **Printable vaccination passport** in PatientDashboard (Q4)
3. **Promote lab results to a real rendered feature** (Q9)
4. **Multi-vaccine-per-visit data model** (Q4)

One thing NOT to do before defense:

- **LLM integration for Analyze** (Q7). Too many privacy/infrastructure questions. Save for v2.