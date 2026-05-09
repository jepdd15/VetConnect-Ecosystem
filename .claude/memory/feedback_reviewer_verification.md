---
name: Verify code-quality-reviewer actually ran as a separate agent
description: The implementation session sometimes skips the code-quality-reviewer sub-agent and declares done after the engineer finishes. The engineer self-checking its own spec is NOT the same as an independent review. Always verify the reviewer ran before accepting results.
type: feedback
originSessionId: afefd8b6-5aac-42ec-9231-c662616b1f84
---
## The rule

After any execute prompt completes in the implementation session, verify that the **code-quality-reviewer sub-agent actually ran as a SEPARATE agent** — not the engineer agent self-checking its own work.

**Signs the reviewer was skipped:**
- The session reports "all N spec items passed" immediately after the engineer finishes, without showing a second Agent tool call
- No "Agent: Review T4.XXX code changes" or "code-quality-reviewer" in the output
- The spec pass/fail table appears in the engineer's summary, not in a separate reviewer block

**What to do when skipped:**
Ask: "did you run the code-quality-reviewer sub-agent?" — this prompts the session to spawn the reviewer.

## Why this matters

The engineer agent checking its own spec is inherently biased — it verifies what it THINKS it implemented, not what was ACTUALLY requested. The reviewer is a second-opinion audit that catches:

- Logic correctness issues (e.g., T4.197 caseDay>1 blanket check vs timestamp comparison)
- Missing spec points the engineer skipped
- Code quality issues (memory leaks, missing cleanup, null guards)
- Style violations the engineer introduced

**Real example from this project:**
- T4.199 Day 1: engineer reported "22/22 spec items passed, bundle clean" and declared Day 1 complete — reviewer had NOT run. User asked "did you run a code-reviewer sub-agent?" and the session spawned one separately. T4.196 reviewer ran automatically without intervention — so the issue is inconsistent, not universal.

## How to apply

When reviewing execution results from the implementation session:
1. Check for a SEPARATE "Agent: Review..." or "code-quality-reviewer" spawn in the output
2. If absent, ask "did you run the code-quality-reviewer sub-agent?"
3. Do NOT accept the task as done until the reviewer has independently verified
4. The reviewer's spec pass/fail should be a separate block from the engineer's summary

**Why:** Two instances of skipped reviews in one session. The execute prompt says "Then spawn ONE code-quality-reviewer" but the word "Then" is sometimes interpreted as optional. The reviewer is NOT optional — it's part of the workflow.
