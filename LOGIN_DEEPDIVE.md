# Login.jsx Deep Dive

> **Target file:** `VetConnect-Admin/src/pages/Login.jsx` (169 lines, commit `9d1f662`)
> **Companion documents:** [ECOSYSTEM_ARCHITECTURE_REPORT.md](ECOSYSTEM_ARCHITECTURE_REPORT.md), [STAFF_DEEPDIVE.md](STAFF_DEEPDIVE.md)
> **Audit method:** codebase-architecture-researcher sub-agent, forensic file-level analysis with cross-reference against UserContext.jsx, App.jsx, designTokens.js, useStaffManager.js, and mobile LoginScreen.js.

---

## Executive Summary

The admin Login page is a 169-line split-screen component that authenticates staff via Firebase Auth email/password, then performs a one-shot Firestore role check to gate non-staff users. It is the sole entry point for all clinic staff. The scan reveals **7 bugs** (2 CRITICAL, 2 HIGH, 3 MEDIUM) including: revoked/disabled staff can log in because the `disabled` flag is never checked; a catch-block gap where Auth succeeds but Firestore fails leaves the user authenticated with no role check; no email trimming; generic error swallows network failures; and wholesale design system violations (rounded corners, blur shadows, glassmorphism, non-token colors).

---

## File Metadata

| Property | Value |
|---|---|
| **Path** | `VetConnect-Admin/src/pages/Login.jsx` |
| **Lines** | 169 |
| **Imports (MUI)** | Box, Typography, Paper, TextField, Button, IconButton, InputAdornment, CircularProgress, Alert, Fade, Avatar, Divider |
| **Imports (Firebase)** | `signInWithEmailAndPassword`, `doc`, `getDoc` |
| **Imports (Icons)** | Visibility, VisibilityOff, LockOutlinedIcon (DEAD), PetsIcon, AdminPanelSettingsIcon |
| **Dead imports** | `LockOutlinedIcon` (L15) — imported, never rendered |
| **Design token imports** | **NONE** |
| **UserContext imports** | **NONE** |

---

## State Inventory

| Variable | Type | Default | Purpose |
|---|---|---|---|
| `email` | string | `''` | Email input binding |
| `password` | string | `''` | Password input binding |
| `showPassword` | boolean | `false` | Toggle password visibility |
| `loading` | boolean | `false` | Disables submit during async auth |
| `error` | string | `''` | Error message in `<Alert>` |

5 state variables, all local `useState`. No context consumed. No refs. No effects.

---

## Login Flow Diagram

```
┌──────────────┐   submit    ┌───────────────────┐
│  Login Form  │────────────►│ handleLogin(e)    │
│  (L127-163)  │             │ (L26-60)          │
└──────────────┘             └────────┬──────────┘
                                      │
                              ┌───────▼──────────┐
                              │ 1. Validate       │  L28: if (!email || !password) → error
                              │    inputs          │  ⚠ No .trim() on email
                              └───────┬──────────┘
                                      │
                              ┌───────▼──────────┐
                              │ 2. Firebase Auth   │  L35: signInWithEmailAndPassword()
                              │    sign-in         │  ← user is NOW authenticated
                              └───────┬──────────┘
                                      │
                              ┌───────▼──────────┐
                              │ 3. Firestore       │  L39: getDoc(users/{uid})
                              │    profile fetch   │
                              └───────┬──────────┘
                                      │
                          ┌───────────┼───────────┐
                          │           │           │
                    doc exists    doc missing    getDoc throws
                          │           │           │
                  ┌───────▼───┐  ┌────▼─────┐  ┌─▼──────────┐
                  │ 4. Role   │  │ signOut  │  │ catch:     │
                  │ check     │  │ + error  │  │ generic    │
                  │ L43-46    │  │ L51-52   │  │ error msg  │
                  └───┬───┬───┘  └──────────┘  │ ⚠ NO       │
                      │   │                     │   signOut! │
              allowed  rejected                 └────────────┘
                  │        │
           ┌──────▼──┐  ┌──▼──────────┐
           │ SUCCESS  │  │ signOut     │
           │ (falls   │  │ + error     │
           │ through) │  │ L47-48      │
           └──────────┘  └─────────────┘
                 │
     ┌───────────▼────────────┐
     │ UserContext picks up    │  onAuthStateChanged fires
     │ auth state → App.jsx   │  → Navigate to "/"
     │ redirects to dashboard │
     └────────────────────────┘
```

**Critical:** On success (allowed role), the function simply falls through. It does NOT navigate. Navigation is handled by `App.jsx` (L82-84): `!user ? <Login /> : <Navigate to="/" replace />`. The `user` comes from UserContext's `onAuthStateChanged`.

---

## Firestore Read/Write Paths

| Line | Collection | Operation | Method | Purpose |
|---|---|---|---|---|
| L39 | `users/{uid}` | Read | `getDoc` (one-shot) | Role check after Auth sign-in |

No writes. No listeners.

---

## Bugs Found

### CRITICAL — No `disabled` Flag Check

**Location:** `Login.jsx:L41-49`

```js
if (userDoc.exists()) {
    const userData = userDoc.data();
    const allowedRoles = ['admin', 'staff', 'veterinarian', 'groomer'];
    
    if (!allowedRoles.includes(userData.role) && !allowedRoles.includes(userData.accessLevel)) {
        await auth.signOut();
        setError('Access Denied. Admin credentials required.');
    }
}
```

The `disabled` boolean (set by `useStaffManager.removeStaff` at L156) is never checked. Current code only works by coincidence — `role: 'disabled'` isn't in the allowed list. But:
- If a future code path sets `disabled: true` without changing role, access is NOT blocked
- The `disabled` flag is the **authoritative** revocation marker
- Firebase Auth is NOT disabled when staff is revoked (T2.212), making this Firestore check the only defense

### CRITICAL — Auth Session Persists on Catch

**Location:** `Login.jsx:L33-56`

```js
try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    const userDoc = await getDoc(doc(db, "users", uid));
    // ... role check ...
} catch (err) {
    setError('Invalid email or password.');
    console.error(err);
    // ⚠ NO auth.signOut() HERE
}
```

If `signInWithEmailAndPassword` succeeds (L35) but `getDoc` throws (Firestore down, network drops), the catch block does NOT call `auth.signOut()`. The user is authenticated — `onAuthStateChanged` has already fired. On next render or page refresh, `App.jsx` sees `user !== null` and redirects to dashboard, **bypassing all role checks**.

### HIGH — Race Condition Between Login.jsx and UserContext

When `signInWithEmailAndPassword` succeeds at L35:
1. Firebase Auth state changes immediately
2. `onAuthStateChanged` in UserContext fires asynchronously
3. `App.jsx` sees `user !== null` and starts redirecting to `/`
4. Meanwhile, Login.jsx is still running its `getDoc` + role check

If the role check determines rejection and calls `auth.signOut()` (L47), there's a window where the dashboard briefly renders (**flash of authenticated content**) before sign-out bounces the user back.

### HIGH — No Email Trimming

**Location:** `Login.jsx:L28, L35`

```js
if (!email || !password) return setError('Please enter both email and password.');
// ...
const userCredential = await signInWithEmailAndPassword(auth, email, password);
```

No `.trim()`. A trailing space (common from mobile keyboard auto-complete or paste) causes "Invalid email or password." Mobile `LoginScreen.js` correctly uses `email.trim()`.

### MEDIUM — Generic Error Swallows Network Failures

**Location:** `Login.jsx:L54-56`

```js
catch (err) {
    setError('Invalid email or password.');
    console.error(err);
}
```

All errors — `auth/network-request-failed`, `auth/too-many-requests`, Firestore permission errors — presented as "Invalid email or password." Misleading when the issue is connectivity or rate limiting.

Firebase error codes that should be handled distinctly:
- `auth/network-request-failed` → "Network error. Check your connection."
- `auth/too-many-requests` → "Too many attempts. Try again later."
- `auth/user-disabled` → "This account has been disabled."

### MEDIUM — Design System Violations

**Border radius violations** (design mandates `borderRadius: 0`):
| Line | Element | Value |
|---|---|---|
| L87 | Divider accent bar | `borderRadius: 2` |
| L110 | Paper login card | `borderRadius: 4` |
| L156 | Button | `borderRadius: 2` |

**Shadow violations** (mandates solid offset, not blur):
| Line | Element | Current |
|---|---|---|
| L78 | Avatar | `boxShadow: 4` (MUI elevation = blur) |
| L114 | Paper | `boxShadow: '0 20px 40px rgba(0,0,0,0.1)'` |
| L158 | Button | `boxShadow: '0 8px 16px rgba(139,69,19,0.3)'` |

**Glassmorphism** (contradicts neubrutalism):
```js
// L111-113
background: 'rgba(255, 255, 255, 0.9)',
backdropFilter: 'blur(20px)',
border: '1px solid rgba(255,255,255,0.3)',
```

**Hardcoded colors** (12+ instances, none from tokens):
- L65: `'#5D4037'` → `COLORS.accent`
- L79, L152: `'#8B4513'` → not in design tokens
- L87: `'#FF9800'` → orphan orange
- L100: `'#FFF8E1'` → admin surface
- L118: `'#3E2723'` → `COLORS.brand`

### LOW — Dead `LockOutlinedIcon` Import

**Location:** `Login.jsx:L15`
```js
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
```
Imported, never used.

---

## Security Analysis

### Can a `pet_owner` bypass role gating?

**Partially.** Login.jsx role check (L46) correctly rejects `pet_owner`. However, BUG 2 (catch-block gap) creates a bypass: if Auth succeeds but getDoc throws, the user is left authenticated and App.jsx redirects to dashboard. The UserContext `onSnapshot` will eventually load their profile, but there is no secondary role check at the route level.

### What happens if Firestore is down but Auth succeeds?

`getDoc` throws → catch block shows error but does NOT sign out → user remains authenticated → page refresh → dashboard access without role check → `UserContext.onSnapshot` fails silently → `profile: null`, `loading: true` indefinitely.

### Information leakage?

Low risk. "User profile not found" (L52) confirms valid credentials. "Access Denied" (L48) confirms account exists as non-staff role. These are minor leaks.

### Rate limiting?

None at application level. Firebase Auth has built-in `auth/too-many-requests`, but Login.jsx catches that as "Invalid email or password" (BUG 5) — no feedback that rate-limiting is active.

### Default password scenario?

Staff accounts created with `"vetconnect123!"` (T2.208). Login.jsx has no password strength enforcement, no forced change detection, no warning about default credentials. Staff can use the default password forever.

---

## Cross-Reference: Admin Login vs. Mobile Login

| Aspect | Admin (`Login.jsx`) | Mobile (`LoginScreen.js`) |
|---|---|---|
| Role check | `allowedRoles.includes(role) || allowedRoles.includes(accessLevel)` | `staffRoles.includes(role) || userData.accessLevel` (truthy check) |
| Role rejection | Signs out + error | Routes to ClientDashboard |
| Email trimming | **No** | Yes, `email.trim()` |
| `disabled` check | **None** | **None** |
| Error handling | Generic for all errors | Checks some error codes |
| Firestore read | `getDoc` (one-shot) | `getDoc` (one-shot) |

**Mobile bug discovered:** `LoginScreen.js:L51` uses `userData.accessLevel` as a truthy check. `accessLevel: 'disabled'` is truthy — revoked staff pass the mobile filter too.

---

## Cross-Reference: Login.jsx vs. UserContext

Login.jsx does its own `getDoc` at L39 but does NOT consume `useUser()`. This means:
- Redundant Firestore read (UserContext's `onSnapshot` reads the same doc moments later)
- Role check in Login.jsx and role exposure in UserContext are independent code paths
- If allowed roles change, they must be updated in Login.jsx, UserContext, Sidebar, and mobile LoginScreen independently

**No secondary authorization layer exists.** After login, all routes are accessible to any authenticated user via URL. Sidebar hides `adminOnly` items but routes like `/staff`, `/settings`, `/sales` can be directly navigated.

---

## Auth State Timing Diagram

```
Time ────────────────────────────────────────────────────────────►

Login.jsx:   signIn ──── getDoc ──── roleCheck ──── signOut?
                │                                      │
Firebase Auth:  ├── auth state = SIGNED IN ────────────├── SIGNED OUT
                │                                      │
UserContext:    ├── onAuthStateChanged fires ───────────├── fires again
                │   setUser(authUser)                  │   setUser(null)
                │   onSnapshot starts                  │
                │                                      │
App.jsx:        ├── user !== null                      │
                │   <Navigate to="/" />  ← FLASH! ─────┘
```

---

## What the Page Does Well

1. **Split-screen layout** with responsive collapse (`display: { xs: 'none', md: 'flex' }`)
2. **Dual role/accessLevel check** — checking both with `&&` is defensive
3. **Sign-out on rejection** — correctly signs out users who fail role check (except catch gap)
4. **Form submit via `<form>` element** — enables Enter-key submission
5. **Loading state on button** — properly disabled during auth with spinner replacement
6. **Clear intent comment** — "The split-screen entryway. Blocks mobile clients from accessing the admin panel."

---

## Proposed Tasks

| ID | Name | Priority | Effort | Notes |
|---|---|---|---|---|
| T2.259 | Add `disabled` flag check to admin Login — before role check, reject `userData.disabled === true` | **CRITICAL** | 5 min | Authoritative revocation check missing |
| T2.260 | Sign out in catch block when Auth succeeded — check `auth.currentUser` and call `signOut()` | **CRITICAL** | 5 min | Bypass: Auth succeeds + Firestore fails = unguarded dashboard access |
| T2.261 | Trim email input before auth call — `email.trim()` | **HIGH** | 2 min | Trailing spaces cause login failure |
| T2.262 | Mitigate auth-state race (flash of dashboard) — add route-level role check in App.jsx/MainLayout | **HIGH** | 30 min | Also addresses direct-URL access to admin routes |
| T2.263 | Differentiate network vs. auth errors — check `err.code` for specific Firebase error codes | **MEDIUM** | 10 min | All errors show "Invalid email or password" |
| T2.264 | Neubrutalism design alignment — borderRadius:0, solid shadows, replace glassmorphism, use tokens | **MEDIUM** | 30 min | 12+ color violations, blur shadows, glassmorphism |
| T2.265 | Remove dead `LockOutlinedIcon` import | **LOW** | 1 min | Dead code |
| T2.266 | Add `disabled` check to mobile LoginScreen — `accessLevel: 'disabled'` passes truthy check | **MEDIUM** | 5 min | Cross-project: mobile bug discovered during admin scan |
