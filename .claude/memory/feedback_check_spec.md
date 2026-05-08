---
name: Check spec — verify implemented tasks against their MASTER_TASKLIST specification
description: When the user asks to "check spec" or "verify spec" for a task, systematically verify every numbered spec item against the actual code. Grep each file, check each field, confirm each UI element. Report a pass/fail table. Catches missed implementations that the planner specified but the engineer skipped.
type: feedback
originSessionId: 1d785421-4426-4936-b3d2-d73173d85e8c
---
## When to trigger

When the user says any of:
- "check spec for T4.XXX"
- "verify the spec was respected"
- "investigate if the spec was fully respected"
- "did we miss anything from T4.XXX?"
- After any task is marked DONE, proactively offer: "Want me to check the spec?"

## How to check spec

1. **Read the full task description** from MASTER_TASKLIST.md — every numbered item is a spec point.
2. **For each spec point**, grep the target file(s) for the expected code/field/UI element.
3. **Read the actual implementation** — verify it matches the spec's intent, not just that something exists.
4. **Report a pass/fail table** with one row per spec point.
5. **Flag any partial implementations** — code exists but doesn't match the spec's conditions (e.g., "required for Medicine, optional for others" but implemented as "always required").

## Output format

```
| # | Spec item | Status | Evidence |
|---|---|---|---|
| 1 | ptrNumber on StaffFormModal | ✅ | Line 34: formData init, line 205: TextField |
| 2 | Dispensing Unit conditional | ⚠️ PARTIAL | Line 297: required={true} but spec says required for Medicine only |
| 3 | clientInstructions input | ❌ MISSING | Soft-warning checks it (line 2156) but no TextField exists in SoapGrid |
```

## Real examples from this session

### Example 1: T4.142 — found 1 missed spec item

**Spec said:** "(5) Rename 'Unit of Measure' → 'Dispensing Unit'. Required for Medicine, optional for Medical Supply + Retail."

**What was implemented:** The rename was done, but the field was ALWAYS required (`required` prop on TextField, validation always blocks save without it). The conditional "required for Medicine, optional for others" was missed.

**How it was caught:** User asked "why is there a dispensing unit field still required for Retail?" → advisory investigated → found the unconditional `required` prop → fixed.

**Lesson:** The planner wrote it correctly. The engineer implemented the rename but not the conditional required behavior. The reviewer didn't catch it because the field existed and worked — the subtle conditional was missed.

### Example 2: T4.188 — found 1 partial + 1 missing

**Spec said:** "(11) Client Copy — plain language: 'Discharge Notes' not 'Plan'" and implied a clientInstructions input field.

**What was implemented:** The SOAP grid still shows "Plan" label on the client copy print. The `clientInstructions` field was checked in the soft-warning dialog (T4.164) but had NO input TextField anywhere in the UI — the vet could never populate it.

**How it was caught:** User asked "can you investigate T4.188 spec?" → advisory traced the full SOAP plan data flow → discovered `clientInstructions` was a phantom field (checked but never writable) → added the TextField.

**Lesson:** The soft-warning check for `clientInstructions` was added by T4.164, but the INPUT for it was never built. The field existed in the validation layer but not in the UI layer — a classic "check without input" gap.

### Example 3: T4.168 — fully respected (0 gaps)

**All 12 spec points verified:** Old function deleted, pure FIFO computation, 3-phase ordering, all sale doc fields preserved, services-only cart works, counter bootstrap works, post-transaction code untouched.

**How it was checked:** Advisory grepped each function name, read the transaction body line-by-line, verified Phase 1/2/3 ordering, counted sale doc fields, tested edge cases (services-only, first receipt).

## Why this matters

- **Planners write detailed specs** but engineers may skip subtle conditionals or UI elements
- **Reviewers check code quality** but may miss spec compliance (the code works, just doesn't match all spec points)
- **Spec checking is the THIRD layer** — after implementation and review, verify against the original specification
- Tasks with 10+ spec points have the highest miss rate — the engineer implements 18/20 but misses 2 edge cases

## When to proactively suggest

After the user shows a completed task screenshot and everything looks good, say:
"Want me to check the spec for T4.XXX to make sure all N spec points were implemented?"

This catches issues BEFORE they become bugs in production.

**Why:** Two spec gaps were discovered in this session (T4.142 Dispensing Unit conditional, T4.188 clientInstructions missing input). Both were in shipped, reviewed, build-passing code. The spec check caught what the reviewer missed.

**How to apply:** When asked to verify a task, follow the exact process above. Never assume "it builds and passes review" means "spec is fully respected."
