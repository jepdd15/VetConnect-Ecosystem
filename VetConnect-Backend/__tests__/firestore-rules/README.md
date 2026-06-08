# Firestore security-rules test suite (T4.250)

Exhaustive, table-driven tests for `firestore.rules`, run against the local
Firestore emulator. **No production project or data is touched** — the emulator
serves a throwaway `demo-vetconnect` project entirely offline.

## Run

```
npm install            # once, in VetConnect-Backend/
npm run test:rules     # spins up the Firestore emulator and runs the suite
```

This does NOT run as part of the admin app's `npm test` (the 412 pure-unit tests
stay fast and dependency-free) — it is intentionally a separate, opt-in command.

## Prerequisites

- **firebase-tools** (provides the emulator) — installed globally or via `npx`.
- **JDK 21 or newer on `PATH`.** firebase-tools ≥ 14 refuses older runtimes.
  If your default `java` is older (e.g. JDK 11), point `PATH`/`JAVA_HOME` at a
  JDK 21+ for the run. Android Studio ships one you can reuse:

  ```powershell
  # PowerShell, current shell only:
  $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
  $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
  npm run test:rules
  ```

## What it covers

| File | Invariants |
|------|-----------|
| `authBoundary.test.js` | Unauthenticated clients denied on every auth-gated collection; deny-all fallback for unmatched collections. |
| `publicRead.test.js` | The 6 public-read surfaces (`read: if true`) AND their locked write-side — reminder queues are read/update-public but create/delete-locked (anti-poisoning). |
| `appendOnly.test.js` | Frozen-after-create logs + payments (no update, no delete); mutable-but-permanent records (no delete); problem-list delete block. |
| `identityScoping.test.js` | The constraints `isStaff()===isAuth()` does NOT collapse: owner-only `recordFilterPresets`, expense field-identity (`loggedByUid`/`updatedByUid`). |
| `appointments.test.js` | Closed-date enforcement, terminal-status auditReason, no-show gate, forensicSeal-on-triage, no-revert-triage, append-only `clinicalPulse`. |

## Note on the Spark role model

Under the free Spark plan `isStaff() === isAdmin() === isAuth()`, so the rules
cannot distinguish staff from pet owners — only **authenticated vs not** and
**uid identity** (`isOwner`, field-identity checks). These tests assert the
*actual* enforced behavior, not the aspirational admin/staff split, so they
double as a baseline to tighten against if the project moves to Blaze + custom
claims (a Chapter 5 recommendation).
