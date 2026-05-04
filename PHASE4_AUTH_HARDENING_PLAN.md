# PHASE4_AUTH_HARDENING_PLAN.md
## T4.137 — Force Password Change on First Login + T4.138 — Staff Revocation Auth Block

---

## Overview

Two security tasks that close the remaining authentication gaps in the staff lifecycle:

**T4.137** replaces the dismissible Snackbar warning for `mustChangePassword` (App.jsx lines 115-128) with a **blocking MUI Dialog** that prevents all dashboard access until the staff member changes their temporary password. The Dialog uses Firebase Auth's client-side `reauthenticateWithCredential` + `updatePassword` (no Blaze required) and clears the Firestore flag on success.

**T4.138** enforces staff revocation at three layers: (1) Firestore rules add a `disabled != true` check to `isStaff()` so disabled staff cannot read/write any protected collection even with a valid Auth token, (2) App.jsx detects the `disabled` flag via the existing real-time `onSnapshot` profile listener and signs out immediately, (3) Mobile App.js already has the disabled check (lines 70-71) — confirmed complete.

**Key architectural decisions:**
- The blocking Dialog is rendered **above** the Routes in App.jsx (replaces the Snackbar at lines 115-128), so no navigation is possible while it is visible.
- The `isValidStaff` check at App.jsx line 100 **already includes** `!profile.disabled` — so disabled staff are already blocked from seeing the dashboard. T4.138's App.jsx work adds a Snackbar explanation message before signing out, rather than silently redirecting to login.
- The Firestore rules change is defense-in-depth: `removeStaff()` already sets `role: 'disabled'`, which makes `isStaff()` return false. But adding an explicit `disabled != true` check protects against any code path that might set `disabled: true` without also changing the role.

**Assumptions:**
- Firebase Spark plan (no Admin SDK, no Cloud Functions for auth token revocation).
- The `mustChangePassword` flag is set only in `useStaffManager.js` line 180 at staff creation.
- No existing password-change UI exists anywhere in the admin dashboard (confirmed via grep).

---

## Prerequisites

None. Both tasks are self-contained with no new dependencies.

Firebase imports needed for T4.137 (`updatePassword`, `reauthenticateWithCredential`, `EmailAuthProvider`) are already available in the `firebase/auth` package that the project uses.

---

## Files Touched

| File | Action | Task |
|---|---|---|
| `VetConnect-Admin/src/App.jsx` | Modify | T4.137 + T4.138 |
| `VetConnect-Backend/firestore.rules` | Modify | T4.138 |

**Files confirmed NOT needing changes:**
- `VetConnect-Admin/src/pages/Login.jsx` — disabled check already at lines 47-51 (verified complete)
- `VetConnect/App.js` — disabled check already at lines 70-71 (verified complete)
- `VetConnect-Admin/src/features/Staff/hooks/useStaffManager.js` — no changes needed, `mustChangePassword: true` set correctly at line 180
- `VetConnect-Admin/src/context/UserContext.jsx` — uses `onSnapshot` (line 20) for real-time profile updates, which means `profile.disabled` changes are detected immediately without any modification

---

## Phase 1: Blocking Password Change Dialog (T4.137)

**Goal:** Staff with `mustChangePassword: true` cannot access the dashboard until they set a new password.

### Step 1.1 — Add Firebase Auth imports to App.jsx

**What:** Import `updatePassword`, `reauthenticateWithCredential`, `EmailAuthProvider` from `firebase/auth`.

**Where:** `VetConnect-Admin/src/App.jsx`, line 6 (alongside existing `signOut` import).

**How:** Change line 6 from:
```js
import { signOut } from 'firebase/auth';
```
to:
```js
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
```

Also add Firestore `updateDoc` and `doc` imports:
```js
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
```
Note: `auth` is already imported at line 7. Add `db` to the existing import. Add `doc` and `updateDoc` from `firebase/firestore` as a new import line.

Also add MUI imports for the Dialog:
```js
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button as MuiButton, InputAdornment, IconButton } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import LockResetIcon from '@mui/icons-material/LockReset';
```
Note: `Button` conflicts with any existing import — check if one exists. The existing code uses MUI `Snackbar` and `Alert` (line 4). No `Button` is currently imported in App.jsx, so import `Button` directly (no alias needed). Also import `Alert` if not already present (it is — line 4).

**Depends on:** Nothing.

### Step 1.2 — Add state variables for the password change form

**What:** Add state hooks for the three password fields, visibility toggles, loading state, and error message.

**Where:** `VetConnect-Admin/src/App.jsx`, inside the `AppShell` function, after line 81 (`const [tempPwDismissed, setTempPwDismissed] = ...`).

**How:**
```js
// Password change dialog state (T4.137)
const [currentPw, setCurrentPw] = useState('');
const [newPw, setNewPw] = useState('');
const [confirmPw, setConfirmPw] = useState('');
const [showCurrentPw, setShowCurrentPw] = useState(false);
const [showNewPw, setShowNewPw] = useState(false);
const [pwLoading, setPwLoading] = useState(false);
const [pwError, setPwError] = useState('');
```

Remove the `tempPwDismissed` state (line 81) since it is no longer needed — the dismissible Snackbar is being replaced entirely.

**Depends on:** Step 1.1.

### Step 1.3 — Add the password change handler function

**What:** Create `handleChangePassword` async function that reauthenticates, validates, updates the Firebase Auth password, and clears the `mustChangePassword` flag in Firestore.

**Where:** `VetConnect-Admin/src/App.jsx`, inside `AppShell`, after the state declarations from Step 1.2.

**How:**
```js
const handleChangePassword = async () => {
  setPwError('');

  // Client-side validation
  if (!currentPw || !newPw || !confirmPw) {
    setPwError('All fields are required.');
    return;
  }
  if (newPw.length < 8) {
    setPwError('New password must be at least 8 characters.');
    return;
  }
  if (newPw !== confirmPw) {
    setPwError('New passwords do not match.');
    return;
  }
  if (newPw === currentPw) {
    setPwError('New password must be different from your current password.');
    return;
  }

  setPwLoading(true);
  try {
    // Step 1: Reauthenticate with the temporary password
    const credential = EmailAuthProvider.credential(user.email, currentPw);
    await reauthenticateWithCredential(auth.currentUser, credential);

    // Step 2: Update the Firebase Auth password
    await updatePassword(auth.currentUser, newPw);

    // Step 3: Clear the mustChangePassword flag in Firestore
    await updateDoc(doc(db, 'users', user.uid), { mustChangePassword: false });

    // Reset form state — dialog will close because profile.mustChangePassword is now false
    // (the onSnapshot listener in UserContext will update profile automatically)
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setPwError('');
  } catch (err) {
    const errorMap = {
      'auth/wrong-password':          'Current password is incorrect.',
      'auth/invalid-credential':      'Current password is incorrect.',
      'auth/weak-password':           'New password is too weak. Use at least 6 characters with a mix of letters and numbers.',
      'auth/requires-recent-login':   'Session expired. Please log out and log in again.',
      'auth/too-many-requests':       'Too many attempts. Please wait a few minutes.',
      'auth/network-request-failed':  'Network error. Check your connection and try again.',
    };
    setPwError(errorMap[err.code] || `Password update failed: ${err.message}`);
    console.error('Password change error:', err.code, err.message);
  } finally {
    setPwLoading(false);
  }
};
```

**Why:** Reauthentication is required because Firebase Auth requires a recent sign-in for sensitive operations like password changes. The three-step sequence (reauth -> update Auth password -> clear Firestore flag) ensures the flag is only cleared after the password is actually changed. The `onSnapshot` listener in UserContext will automatically update `profile.mustChangePassword` to `false`, causing the dialog to disappear.

**Depends on:** Steps 1.1, 1.2.

### Step 1.4 — Replace the dismissible Snackbar with a blocking Dialog

**What:** Remove the Snackbar (lines 115-128) and replace it with a blocking MUI Dialog that renders when `profile.mustChangePassword === true`.

**Where:** `VetConnect-Admin/src/App.jsx`, lines 115-128 (inside the `isValidStaff` branch, before the inner `<Routes>`).

**How:** Remove the entire Snackbar block:
```jsx
{profile.mustChangePassword && !tempPwDismissed && (
  <Snackbar ... >
    <Alert ...>
      You are using a temporary password. Please change your password in Settings.
    </Alert>
  </Snackbar>
)}
```

Replace with a blocking Dialog:
```jsx
{/* T4.137 — Blocking password change dialog for first login */}
<Dialog
  open={!!profile.mustChangePassword}
  onClose={() => {}}
  disableEscapeKeyDown
  slotProps={{ backdrop: { onClick: (e) => e.stopPropagation() } }}
  PaperProps={{
    sx: {
      borderRadius: 0,
      border: `2px solid ${COLORS.brand}`,
      boxShadow: `6px 6px 0px ${COLORS.brand}`,
      maxWidth: 440,
      width: '100%',
    }
  }}
>
  <DialogTitle sx={{
    bgcolor: COLORS.cream,
    borderBottom: `2px solid ${COLORS.brand}`,
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    fontWeight: 800,
    color: COLORS.brand,
  }}>
    <LockResetIcon sx={{ color: COLORS.warning }} />
    Change Your Password
  </DialogTitle>
  <DialogContent sx={{ pt: 3, pb: 2, px: 3, mt: 1 }}>
    <Typography variant="body2" sx={{ mb: 3, color: COLORS.textSecondary }}>
      You are using a temporary password. You must set a new password before accessing the dashboard.
    </Typography>
    {pwError && (
      <Alert severity="error" sx={{ mb: 2, borderRadius: 0, fontWeight: 600, border: `1px solid ${COLORS.danger}` }}>
        {pwError}
      </Alert>
    )}
    <TextField
      fullWidth
      label="Current Password"
      type={showCurrentPw ? 'text' : 'password'}
      value={currentPw}
      onChange={(e) => setCurrentPw(e.target.value)}
      sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton size="small" onClick={() => setShowCurrentPw(!showCurrentPw)}>
              {showCurrentPw ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
            </IconButton>
          </InputAdornment>
        )
      }}
    />
    <TextField
      fullWidth
      label="New Password"
      type={showNewPw ? 'text' : 'password'}
      value={newPw}
      onChange={(e) => setNewPw(e.target.value)}
      sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton size="small" onClick={() => setShowNewPw(!showNewPw)}>
              {showNewPw ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
            </IconButton>
          </InputAdornment>
        )
      }}
    />
    <TextField
      fullWidth
      label="Confirm New Password"
      type={showNewPw ? 'text' : 'password'}
      value={confirmPw}
      onChange={(e) => setConfirmPw(e.target.value)}
      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
    />
  </DialogContent>
  <DialogActions sx={{ px: 3, pb: 3, borderTop: `1px solid ${COLORS.border}` }}>
    <Button
      fullWidth
      variant="contained"
      onClick={handleChangePassword}
      disabled={pwLoading}
      sx={{
        bgcolor: COLORS.sky,
        color: '#fff',
        fontWeight: 700,
        py: 1.2,
        borderRadius: 0,
        border: `2px solid ${COLORS.brand}`,
        boxShadow: `3px 3px 0px ${COLORS.brand}`,
        '&:hover': { bgcolor: COLORS.skyHover, transform: 'translate(1px, 1px)', boxShadow: `2px 2px 0px ${COLORS.brand}` },
        '&:active': { transform: 'translate(3px, 3px)', boxShadow: 'none' },
        '&.Mui-disabled': { bgcolor: COLORS.border, border: `2px solid ${COLORS.border}` },
      }}
    >
      {pwLoading ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : 'Update Password'}
    </Button>
  </DialogActions>
</Dialog>
```

**Why:** The Dialog's `onClose={() => {}}` + `disableEscapeKeyDown` + backdrop click prevention makes it impossible to dismiss without completing the password change. The form is rendered inside the authenticated layout so the user is logged in (needed for `reauthenticateWithCredential`), but the Dialog overlays everything preventing navigation.

**Depends on:** Steps 1.1, 1.2, 1.3.

### Step 1.5 — Clean up removed state

**What:** Remove the `tempPwDismissed` state declaration (line 81) since the dismissible Snackbar no longer exists. Also remove the `Snackbar` import from line 4 if it is no longer used anywhere in the file (check first — it may be needed for T4.138's deactivation notice).

**Where:** `VetConnect-Admin/src/App.jsx`, line 81.

**How:** Delete `const [tempPwDismissed, setTempPwDismissed] = React.useState(false);`. Keep `Snackbar` in the import because T4.138 will use it for the deactivation notice.

**Depends on:** Step 1.4.

### Verification Checkpoint — Phase 1

1. Create a test staff account via the Staff module (or have an existing one with `mustChangePassword: true` in Firestore).
2. Log in as that staff account. The blocking Dialog appears immediately.
3. Verify: pressing Escape does nothing. Clicking backdrop does nothing. There is no X/close button.
4. Enter wrong current password — error message "Current password is incorrect."
5. Enter mismatched new/confirm — error message "New passwords do not match."
6. Enter matching new password < 8 chars — error message about length.
7. Enter correct current password + valid new password + matching confirm — Dialog closes, dashboard is accessible.
8. Verify Firestore: the user doc now has `mustChangePassword: false` (or the field is deleted).
9. Log out and log back in with the NEW password — no Dialog appears.

---

## Phase 2: Staff Revocation Defense-in-Depth (T4.138)

**Goal:** Disabled staff are blocked at three layers: Firestore rules (server-side), admin App.jsx (real-time sign-out), and mobile App.js (auth-state sign-out).

### Step 2.1 — Update Firestore rules: add disabled check to isStaff()

**What:** Add `&& getUserRole().disabled != true` to the `isStaff()` helper function. This ensures that even if a disabled staff member has a valid Firebase Auth token, all Firestore reads/writes to staff-protected collections are denied.

**Where:** `VetConnect-Backend/firestore.rules`, lines 19-22.

**How:** Change:
```
function isStaff() {
  return isAuth()
    && getUserRole().role in ['admin', 'staff', 'veterinarian', 'groomer'];
}
```
to:
```
function isStaff() {
  return isAuth()
    && getUserRole().role in ['admin', 'staff', 'veterinarian', 'groomer']
    && getUserRole().disabled != true;
}
```

Also update `isAdmin()` for consistency:
```
function isAdmin() {
  return isAuth()
    && getUserRole().role == 'admin'
    && getUserRole().disabled != true;
}
```

**Why:** The `removeStaff()` function in `useStaffManager.js` (line 208-213) already sets `role: 'disabled'`, which would make the `role in [...]` check fail. But this is fragile — if any future code path sets `disabled: true` without changing `role`, the rules would still allow access. The explicit `disabled != true` check is defense-in-depth. Note: `!= true` is used instead of `== false` because the `disabled` field may not exist on all user documents — `!= true` correctly evaluates to `true` when the field is absent (undefined != true is true in Firestore rules).

**Depends on:** Nothing.

### Step 2.2 — Add deactivation sign-out with Snackbar in App.jsx

**What:** When the real-time profile listener detects `disabled === true`, immediately sign out and show a Snackbar explaining the deactivation. The current code at line 100 already blocks disabled users from seeing the dashboard (`!profile.disabled` in `isValidStaff`), but the user is silently redirected to login with no explanation. This step adds the explanation.

**Where:** `VetConnect-Admin/src/App.jsx`, inside the `AppShell` function.

**How:** Add a `useEffect` that watches `profile?.disabled`:
```js
// T4.138 — Real-time deactivation detection
const [deactivatedMsg, setDeactivatedMsg] = React.useState('');

React.useEffect(() => {
  if (profile?.disabled === true && user) {
    setDeactivatedMsg('Your account has been deactivated. Contact the clinic administrator.');
    signOut(auth).catch(console.error);
  }
}, [profile?.disabled, user]);
```

Then add a Snackbar near the top of the JSX return (before the `<Routes>`, so it shows on the login page after redirect):
```jsx
<Snackbar
  open={!!deactivatedMsg}
  autoHideDuration={8000}
  onClose={() => setDeactivatedMsg('')}
  anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
>
  <Alert
    severity="error"
    onClose={() => setDeactivatedMsg('')}
    sx={{ borderRadius: 0, fontWeight: 700, border: `2px solid ${COLORS.danger}`, boxShadow: `3px 3px 0px ${COLORS.danger}` }}
  >
    {deactivatedMsg}
  </Alert>
</Snackbar>
```

**Important:** This Snackbar must be rendered **outside** the `isValidStaff` conditional, at the top level of the `<Routes>` return. Since the current structure returns `<Routes>` directly, wrap the entire return in a fragment `<>...</>` and place the Snackbar before the Routes.

**Depends on:** Nothing (can be done in parallel with Step 2.1).

### Step 2.3 — Verify mobile App.js disabled check (NO CHANGES NEEDED)

**What:** Confirm that the mobile disabled check at `VetConnect/App.js` lines 70-71 is correct and complete.

**Where:** `VetConnect/App.js`, lines 70-71.

**Current code (verified):**
```js
if (data.disabled === true) {
  await auth.signOut();
  setInitialRoute("Login");
}
```

**Assessment:** This is correct. When a user opens the mobile app and `onAuthStateChanged` fires, if their Firestore profile has `disabled === true`, they are signed out and routed to Login. The only gap is that there is no user-facing message — the user just sees the login screen. This is acceptable for mobile (the user will contact the clinic if confused). If a message is desired later, it would be an `Alert.alert('Account Deactivated', 'Your account has been deactivated. Contact the clinic administrator.')` before `auth.signOut()`, but this is not required for T4.138.

**Status:** ALREADY DONE. No changes needed.

**Depends on:** Nothing.

### Step 2.4 — Deploy Firestore rules

**What:** Deploy the updated Firestore rules to production.

**Where:** Terminal, from project root.

**How:**
```bash
cd VetConnect-Backend
firebase deploy --only firestore:rules
```

**Depends on:** Step 2.1.

### Verification Checkpoint — Phase 2

1. **Firestore rules (server-side):**
   a. In the Firebase Console, manually set `disabled: true` on a test staff user doc.
   b. Attempt to read any staff-protected collection (e.g., `inventory`, `medical_records`) using the Firebase SDK while authenticated as that user — should get PERMISSION_DENIED.
   c. Revert `disabled: false` — access restored.

2. **Admin real-time sign-out:**
   a. Log in as a staff member on the admin dashboard.
   b. In a separate tab/Firebase Console, set `disabled: true` on their user doc.
   c. The staff member should be immediately signed out (the `onSnapshot` in UserContext detects the change, `profile.disabled` becomes true, the `useEffect` fires `signOut`).
   d. A red Snackbar should appear: "Your account has been deactivated. Contact the clinic administrator."

3. **Mobile sign-out:**
   a. Log in as a staff member on the mobile app.
   b. Close and reopen the app (to trigger `onAuthStateChanged`).
   c. If their doc has `disabled: true`, they should be routed to Login.

---

## Data Model Changes

None. Both tasks use existing Firestore fields:
- `mustChangePassword` (boolean) — already set by `useStaffManager.js` line 180 on staff creation.
- `disabled` (boolean) — already set by `removeStaff()` in `useStaffManager.js` line 209 on access revocation.

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `getUserRole()` in Firestore rules calls `get()` which costs one document read per evaluation. Adding `disabled` check does not add a second `get()` — the same `getUserRole()` result is reused. | No additional read cost. |
| Firestore rules `getUserRole().disabled != true` could fail if the field type is not boolean (e.g., string `"true"`). | `removeStaff()` always sets `disabled: true` (boolean). The `!= true` check correctly handles missing fields (undefined != true is true). |
| Password change dialog could trap a user if `reauthenticateWithCredential` fails repeatedly (e.g., admin changed the temp password in Firebase Console). | The error message advises the user to contact the administrator. As a fallback, the admin can set `mustChangePassword: false` directly in Firestore to unblock them. |
| Race condition: profile.mustChangePassword could be set to false by another tab or device. | Not a real risk — the `onSnapshot` listener will detect the change and close the dialog. This is actually desirable behavior. |
| The Firestore `updateDoc` call to clear `mustChangePassword` could fail (permissions, network). | The Auth password is already changed at this point. The flag will remain true, and the dialog will reappear on next login. The user can try again — the "current password" will now be the NEW password. This is self-healing. |

---

## Testing Strategy

### Manual QA Checklist

**T4.137:**
- [ ] Staff with `mustChangePassword: true` sees blocking Dialog on login
- [ ] Dialog cannot be dismissed (Escape, backdrop click, no close button)
- [ ] Wrong current password shows appropriate error
- [ ] Passwords that don't match show error
- [ ] Password under 8 characters shows error
- [ ] New password same as current shows error
- [ ] Correct flow: reauth -> change -> flag cleared -> Dialog closes
- [ ] Subsequent login with new password does not show Dialog
- [ ] Staff without `mustChangePassword` (or with value `false`) never sees Dialog

**T4.138:**
- [ ] Disabled staff cannot log in via Login.jsx (existing check, lines 47-51)
- [ ] Already-logged-in staff is signed out when admin revokes access (real-time via onSnapshot)
- [ ] Red Snackbar appears with deactivation message
- [ ] After sign-out, disabled staff cannot access Firestore data (rules block)
- [ ] Mobile app signs out disabled staff on app reopen
- [ ] Non-disabled staff are completely unaffected

---

## Estimated Effort

| Phase | Task | Effort | Files |
|---|---|---|---|
| Phase 1 | T4.137 — Blocking password change Dialog | ~1 hr | App.jsx |
| Phase 2 | T4.138 — Firestore rules + deactivation sign-out | ~30 min | firestore.rules, App.jsx |
| **Total** | | **~1.5 hrs** | **2 files** |

---

## Done-When Acceptance Checks

**T4.137:** A staff member with `mustChangePassword: true` in Firestore is presented with a non-dismissible password change Dialog immediately after login. The Dialog disappears only after successfully changing the password via Firebase Auth `updatePassword()`. No dashboard content is accessible while the Dialog is open.

**T4.138:** An admin revoking a staff member's access causes: (1) immediate Firestore rules denial for all staff-protected collections, (2) real-time sign-out from the admin dashboard with explanatory Snackbar, (3) sign-out from mobile app on next auth state resolution. All three layers work independently.

---

## Blaze / External Blockers

**None.** Both tasks are fully implementable on the Firebase Spark plan:
- T4.137 uses client-side `updatePassword()` and `reauthenticateWithCredential()` — no Cloud Functions needed.
- T4.138 uses Firestore rules + client-side `signOut()` — no Admin SDK needed. The only remaining gap (Firebase Auth token not revoked server-side) is acknowledged in T3.40 as a Blaze-dependent future task, but is effectively irrelevant since the token grants zero Firestore access.
