---
name: T3.5 Phase 2 — Mobile Consent Capture Screen Review Findings
description: SignatureCanvas/useConsentGate/useConsentSubmit/ConsentScreen/App.js: dead resize variable (FAIL), type-unsafe version compare (WARN), policy hard-clip (WARN), double pressed state (WARN)
type: project
---

## Files reviewed
- `VetConnect/src/components/SignatureCanvas.js`
- `VetConnect/src/hooks/useConsentGate.js`
- `VetConnect/src/hooks/useConsentSubmit.js`
- `VetConnect/src/screens/ConsentScreen.js`
- `VetConnect/App.js`

## FAIL

**SignatureCanvas.js — dead `var data` in `resize()` causes phantom captured state**
- `var data = canvas.toDataURL()` saves canvas contents before resizing but is never restored after.
- Assigning `canvas.width` / `canvas.height` clears the drawing (HTML Canvas spec).
- On orientation change: drawn strokes are erased visually, but React state still holds the old base64 — the user submits a blank PNG.
- Fix: remove the dead `var data` line and post a `{ type: 'clear' }` message to the parent after resize so state is kept in sync with visual state.

## WARNINGs

**useConsentGate.js — type-unsafe strict-equality version comparison**
- `userConsentVersion !== activeVersion` uses `!==` on values that may be number (from useConsentSubmit writes) vs string (from admin Settings doc).
- If types differ, every user gets stuck in perpetual re-consent.
- Fix: coerce both sides: `String(userConsentVersion) !== String(activeVersion)`.

**useConsentGate.js — single shared `activeVersion` compared for both DPA and waiver**
- `clinic_settings/consent_policy.activeVersion` is used as the gate for both consent types.
- If admin Settings stores separate `activeDpaVersion` / `activeWaiverVersion`, this hook reads the wrong field and incorrectly triggers waiver re-consent when only DPA changed.
- Cross-check against Phase 1 admin Settings implementation to confirm field names.

**ConsentScreen.js — policy box hard-clipped at 320px with no inner scroll**
- `policyBox` uses `maxHeight: 320, overflow: 'hidden'` — policy text past 320px is silently cut off.
- The outer ScrollView scrolls the full page, but the clip means users may not see all policy text before the checkbox.
- Fix: wrap `policyText` in a nested `ScrollView` with `nestedScrollEnabled` and `maxHeight: 320`.

**ConsentScreen.js — double application of `BUTTON.pressed` via both `pressed` callback arg and `isButtonPressed` state**
- `Pressable` style callback already handles press transform via `pressed` arg (line 396).
- `isButtonPressed` state (line 81) + `onPressIn`/`onPressOut` (lines 401–402) redundantly duplicate the same tracking.
- No incorrect behaviour, but the state variable is dead weight. Remove `isButtonPressed` and use only the `pressed` arg.

## PASSes (all confirmed)
- forwardRef + useImperativeHandle pattern correct
- Bidirectional postMessage (parent→WebView and WebView→parent)
- `scrollEnabled={false}` on WebView
- Base64 data URI format from `canvas.toDataURL('image/png')`
- getDoc one-shot reads (no onSnapshot) in useConsentGate
- Staff role bypass checks both `role` and `accessLevel`
- writeBatch atomicity in useConsentSubmit
- consent_records sub-collection path correct
- Legacy booleans `dpaConsent` and `waiverSigned` written correctly
- All mobileTokens tokens validated — no hardcoded hex in ConsentScreen
- Zero borderRadius throughout
- No alert()/prompt()/confirm() — only Alert.alert
- App.js registration correct: name="Consent", headerShown: false, no other screens modified
- Firebase import path `../../firebaseConfig` matches convention
