---
name: T3.76 Pulse Event Writers — Review Findings
description: T3.76 review: pulseEventBuilders.js (28 builders) + pulseEventWriters.test.js (~245 tests). Production files confirmed untouched.
type: project
---

T3.76 introduced two new test-only files: pulseEventBuilders.js (28 builders mirroring 7 production source files) and pulseEventWriters.test.js (~245 contract tests). All production files confirmed unmodified. No Firestore calls in builders.

**Issues found:**
- Header comment in pulseEventWriters.test.js says "~103 tests" but actual count is ~245 (5 it.each × 28 + 105 it = ~245). Minor doc discrepancy; tasklist entry correctly says 246.
- `vi.mock('firebase/firestore')` is defined at the top of pulseEventBuilders.js, which is a utility module not a test file. Vitest only auto-hoists vi.mock when globals:true is set and the call is in a test file. In a plain JS module loaded via import, this is not guaranteed to be hoisted before the import of pulseUtils.js. This is a latent risk but works in practice because pulseUtils.js itself does not call Timestamp at import time.
- buildRescheduleEvent builder omits `toStatus` (production code also omits it for this write site — correct omission). Test 2A.16 correctly asserts `fromStatus` only.

**What is done well:**
- All 28 builders cover their source files exactly.
- Phase 6 cross-cutting tests cover all 28 builders via the allEvents array — no gaps.
- eventId uniqueness test is strong (Set size check).
- Note truncation tests (5D.3) verify both inclusion and exclusion of overlong strings.
- W18 follow-up INCEPTION type discrepancy (STATUS_CHANGE not INCEPTION) is explicitly documented in the builder comment.

**Why:** T3.76 is complete with one cosmetic doc bug. No blocking issues.
**How to apply:** If test infrastructure is refactored, check that vi.mock hoisting in the builders file continues to work under the project's globals:true Vitest config.
