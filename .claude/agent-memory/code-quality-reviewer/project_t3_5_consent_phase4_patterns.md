---
name: T3.5 Phase 4 — Re-consent Progress Counter (Settings.jsx Step 4.3)
description: Review findings for Phase 4.3: reconsentProgress state, handleRefreshReconsentProgress handler, LinearProgress UI widget in Pillar 10
type: project
---

Phase 4.3 adds a one-shot re-consent progress counter to Settings.jsx Pillar 10. All critical checklist items pass. Two warnings found.

## PASS items (all verified)
- getDocs (one-shot), NOT onSnapshot — PASS
- Queries role == 'pet_owner' AND accountStatus != 'erased' — PASS
- Division-by-zero guard: `total > 0 ?` branch prevents 0/0 — PASS
- Only shows when `consentActiveVersion !== null` — PASS
- Refresh button triggers query — PASS
- CircularProgress shown in button startIcon while loading — PASS
- LinearProgress bar present — PASS
- Zero hardcoded hex in reconsentProgress widget (lines 1887–1965) — PASS
- Zero borderRadius on new elements — PASS
- No alert/confirm/prompt — PASS
- All 4 new imports (LinearProgress, CircularProgress, RefreshIcon, GroupIcon) used — PASS (getDocs/query/where were pre-existing)
- No console.log — PASS
- No hooks violations — PASS
- Fits within existing Pillar 10 section — PASS
- Error handling in catch: toast + loading reset — PASS
- Mobile files (useConsentGate, ConsentScreen, App.js, ClientDashboard, RegisterScreen, UserProfileScreen) untouched in Phase 4 — PASS

## WARNING items

**W1: Missing composite index for role + accountStatus != query**
- The query `where('role', '==', 'pet_owner'), where('accountStatus', '!=', 'erased')` on the users collection requires a composite index (role ASC + accountStatus ASC) in Firestore.
- firestore.indexes.json in VetConnect-Backend only defines one index (on sales collection) — no index for this combination.
- In dev this may work via emulator but will throw "The query requires an index" error in production until deployed.
- Fix: add `{ collectionGroup: "users", fields: [{fieldPath:"role",...},{fieldPath:"accountStatus",...}] }` to firestore.indexes.json.

**W2: Stale progress counter after a new version is published**
- When an admin publishes a new version, `consentActiveVersion` increments (via onSnapshot in useConsentPolicy), and the widget header updates to "Re-consent Progress — Version 2". But the progress numbers still reflect the previous query (e.g., "5/10 consented" against version 1).
- No useEffect resets reconsentProgress when consentActiveVersion changes.
- Fix: add `useEffect(() => { setReconsentProgress({ consented: 0, total: 0, loading: false }); }, [consentActiveVersion]);` to clear stale counts on version bump.

**W3 (minor): Zero-user result shows misleading "Press Refresh" message**
- If the query runs successfully and finds 0 pet_owner users (e.g., empty dev environment), total stays 0 and the UI shows "Press Refresh to load re-consent progress." even though data was just fetched.
- No `queried` boolean flag to distinguish "never fetched" from "fetched, got zero".
- Low-impact in production (genuine clinics will have users) but can confuse during testing.
