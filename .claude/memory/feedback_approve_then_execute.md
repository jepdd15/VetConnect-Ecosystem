---
name: Approve + execute in same reply when no pushbacks
description: When reviewing a plan with no pushbacks or suggestions, generate the execute prompt in the same reply instead of asking "want me to generate it?" — saves a round trip.
type: feedback
originSessionId: 59e87189-0db4-417c-b7c4-574b16dbf925
---
When the advisory review of a plan has zero pushbacks and zero suggestions, combine the verdict and execute prompt into a single reply. Do NOT ask "Ready for the execute prompt — want me to generate it?" — just generate it immediately after the verdict.

**Why:** The user explicitly requested this to eliminate unnecessary back-and-forth. The "want me to generate it?" question adds a wasted round trip when the answer is always "yes" after a clean approval.

**How to apply:** After reading a plan file:
- If pushbacks exist → present them, wait for user decisions, then generate execute prompt after amendments
- If NO pushbacks → write "Verdict: Approve — no pushbacks." followed immediately by the execute prompt in the same message
