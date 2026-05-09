---
name: Spec cross-reference — verify execute prompts cover ALL locked decisions
description: After generating an execute prompt, cross-reference every locked decision against the prompt's phases AND spec verification items. Catches logic gaps that grep-based spec checks miss. Discovered when T4.197 execute prompt missed carried-over appointment handling despite having 13 locked decisions.
type: feedback
originSessionId: afefd8b6-5aac-42ec-9231-c662616b1f84
---
## The rule

After generating an execute prompt for any task with locked decisions, perform a systematic cross-reference BEFORE the user pastes it:

1. List ALL locked decisions in a table
2. For EACH decision, confirm it appears in a phase description
3. For EACH decision, confirm a spec verification item checks it
4. Flag any decision missing from BOTH
5. Flag any spec check that only verifies TEXT PRESENCE (grep) but not LOGIC CORRECTNESS

## Why this matters

Grep-based spec checks confirm a string exists in the code but cannot verify the logic is correct. Example from T4.197:

**Decision:** "Carry-over Day 2: show 'done Day 1' for services completed on prior case day"

**Spec check:** `Grep: "Day 1" or "prior" in AppointmentCardContent.js`

**What happened:** The engineer implemented `(appointment.caseDay || 1) > 1` which is a blanket check — marks ALL completed services as "prev. day" on any Day 2+ appointment, even services completed TODAY on Day 2. The grep found "prev. day" text and passed ✅, but the logic was wrong.

**Correct implementation:** `serviceCompletedAt < scheduledDate` — timestamp comparison that only marks services actually completed on a prior day.

**How it was caught:** The advisory session cross-referenced locked decisions against the execute prompt and found:
- Phase 2 Step 2.2 filtered for `status === 'completed'` only, missing `status === 'carried-over'`
- No spec item verified that carried-over cards show ✗ for non-completed services
- The amendment was generated before execution, preventing the bug from shipping undetected

## How to apply

When generating execute prompts for tasks with 5+ locked decisions:
1. Build the cross-reference table (decision → phase → spec item)
2. Present it to the user: "All N decisions are covered — here are the mappings"
3. If gaps found, inject amendments or additional spec items
4. If a spec check uses grep, ask: "Can this grep distinguish correct logic from incorrect logic?"

**Why:** Two gaps found in a 13-decision execute prompt. Both would have shipped as bugs without the cross-reference. The 10-minute cross-reference saved hours of post-hoc debugging.
