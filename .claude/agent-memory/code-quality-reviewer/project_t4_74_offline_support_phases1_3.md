---
name: T4.74 Phases 1-3 — Mobile Offline Support Review Findings
description: firebaseConfig initializeFirestore, App.js auth resolver, NetworkContext polling, ClientDashboard logout — all critical checks PASS; 3 advisories
type: project
---

T4.74 Phases 1-3 review: all 10 critical checklist items PASS.

**Why:** Complete offline support — Firestore persistent cache, auth-gated splash routing, polling connectivity banner, logout confirmation.

**Key findings:**
- `initializeFirestore` with `persistentLocalCache` + `persistentSingleTabManager({ forceOwnership: true })` — correct
- Zero `getFirestore` calls anywhere in VetConnect codebase — confirmed by grep
- Offline catch block routes to `ClientDashboard` (not Login) — correct
- Disabled user check correctly awaits `auth.signOut()` before routing Login
- `NetworkProvider` wraps outside `NavigationContainer` — banner floats above all headers
- 5s polling interval with `mounted` guard — no setState-after-unmount risk
- Logout uses `Alert.alert` destructive button; both `signOut` and `navigation.replace` gated behind confirm

**Advisories (non-blocking):**
1. `onLayoutRootView` callback name implies `onLayout` usage but is wired to `onReady` — cosmetic rename suggestion
2. `auth.signOut()` not awaited in logout handler — low-risk but inconsistent with auth resolver pattern
3. Offline banner missing `useSafeAreaInsets` top padding — banner text may be obscured on iOS notched devices; fix with `<SafeAreaView edges={['top']}>` or insets.top padding

**How to apply:** Phases 4-5 (error callbacks + offline UI states) are not yet reviewed.
