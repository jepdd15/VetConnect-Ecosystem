---
name: Prompt patterns — planner and execute prompt structure with workflow examples
description: Complete advisory workflow with structural patterns, real examples, and back-and-forth interaction model. Validated across ~90 tasks in April 26-27 sessions. Persist and replicate exactly in all future sessions.
type: feedback
originSessionId: 05b233a5-9ab7-4942-b387-af3fb4bf6f31
---
## The Complete Advisory Workflow (follow this for EVERY task)

### Step 1: User asks to work on a task/batch
User says: "I wanna work on [TASK/BATCH]. how detailed is the task description here?"

### Step 2: Advisory assessment
- Show the one-liner task description from MASTER_TASKLIST
- Identify the backing deep-dive file and handoff.json sections
- State the effort estimate and dependencies
- Ask: "Want me to generate the planner prompt?"

### Step 3: Generate planner prompt (user pastes into implementation session)
See Planner Prompt Structure below.

### Step 4: User shows the plan summary screenshot
Read the full plan file. Provide honest assessment:
- "Verdict: [Approve / Approve with flags / Pushback needed]"
- List what's good (3-5 points)
- List any flags or pushbacks with options + pros/cons
- If pushbacks exist, present decision options and let user choose

### Step 5: If amendments needed → generate amendment prompt
User pastes amendment into implementation session before execution.

### Step 6: Generate execute prompt (user pastes into implementation session)
See Execute Prompt Structure below.
For large tasks (>5 hrs): split into day-sized batch execute prompts.

### Step 7: User shows execution result screenshot
Check: reviewer fixes applied, build passes, tests pass, file count matches plan.
If clean → generate commit prompt.

### Step 8: Generate commit prompt (user pastes into implementation session)
See Commit Prompt Structure below.

### Step 9: Repeat from Step 1 for next task

---

## Planner Prompt Structure (10 elements, always in this order)

1. **Context header** — batch name, task IDs, dependency status, effort estimate, backing files mentioned
2. **Delegation instruction** — "Spawn ONE implementation-planner sub-agent with this brief:"
3. **Source reading steps** — always this order:
   a. MASTER_TASKLIST.md → get task details
   b. [RELEVANT]_DEEPDIVE.md → focus on [SPECIFIC SECTIONS]
   c. handoff.json → search for [SPECIFIC TERMS]
   d. Current source files → [EXACT FILE LIST with line numbers and what to look for]
4. **Historical caveat** — "IMPORTANT: Deep-dive files are HISTORICAL (written April 15-21, before implementation). All bug descriptions, line numbers, and code quotes describe the PRE-FIX state. ~500 tasks have been implemented since. Use deep-dives for architectural context and locked decisions, but trust the CURRENT source files for what the code looks like now."
5. **Per-task specifics** — NOT generic "plan this task" but SPECIFIC questions and pre-researched details:
   - "Where does X live? How does Y work? What needs to change for Z?"
   - Include file paths, field names, line ranges the advisory session already verified
6. **Output format** — "For each task: what files to touch, what to create, one-line 'done when' acceptance check"
7. **Constraint injection** — "ZERO prompt()/alert()/confirm() — MUI Dialog/Snackbar on admin, React Native Alert.alert on mobile only for error paths"
8. **Blocker check** — "Flag anything requiring Blaze upgrade or external blockers"
9. **Save instruction** — "Save as PHASE[N]_[NAME]_PLAN.md"
10. **Approval gate** — "Show me the plan. I will approve before any code changes."

### Example Planner Prompt (T3.100 + T3.101 — Vaccine Quick Wins):
```
I want to work on two vaccine system quick wins — T3.100 + T3.101.
Both modify PatientDashboard.jsx. Total: ~1.5 hrs.

Spawn ONE implementation-planner sub-agent with this brief:

"You are planning 2 vaccine system quick wins for VetConnect.
Tasks: T3.100, T3.101

1. Read MASTER_TASKLIST.md — get task details for T3.100 and T3.101
2. Read the current source files:
   - VetConnect-Admin/src/features/Patients/PatientDashboard.jsx — find the
     vaccinationStatus useMemo (~line 457-533)...
3. IMPORTANT: Deep-dive files are HISTORICAL. Trust current source files.
4. Plan both tasks:
   T3.100 — Species filter on vaccination tracker (~30 min):
   - Where is petSpecies available?...
   T3.101 — Vaccine exemption flag (~1 hr):
   - Data model: vaccineExemptions[] array on pet doc...
5. For each task: what files to touch, one-line 'done when' acceptance check
6. ZERO prompt()/alert()/confirm() — MUI Dialog for the exemption input
7. Flag anything requiring Blaze upgrade or external blockers
8. Save as PHASE3_VACCINE_QUICKWINS_PLAN.md"

Show me the plan. I will approve before any code changes.
```

---

## Execute Prompt Structure (10 elements)

1. **Approval declaration** — "I've approved the [PLAN].md plan (with N amendments applied)."
2. **Scope declaration** — "Execute [Day N only / Phase N only / all steps]:" with prior-phase status
3. **Task breakdown** — each task/phase with step numbers, short descriptions, and effort
4. **Agent delegation** — "Spawn ONE elite-code-engineer sub-agent to implement. Then spawn ONE code-quality-reviewer sub-agent to audit."
5. **Build/test gate** — "After review passes, run: cd VetConnect-Admin && npm run build && npm test"
6. **Tasklist update** — "Also update MASTER_TASKLIST.md: Mark [TASK IDS] as DONE"
7. **IMPORTANT block** — critical constraints, locked design decisions, things NOT to do, lessons from prior tasks
8. **Plan reference** — "The full plan with [specifics] is in [PLAN].md — the engineer MUST read it before coding."
9. **Spec verification checklist** — see below
10. **Commit gate** — "Do NOT commit yet." (or "Do NOT commit yet. [Next batch] will follow.")

### Example Execute Prompt (T3.100 + T3.101):
```
I've approved the PHASE3_VACCINE_QUICKWINS_PLAN.md plan.

Execute both tasks in order (T3.100 first, then T3.101):

T3.100 — Species filter (~20 min):
- Filter vaccinationStatus useMemo by pet species
- Simplify vaccineCompleteness to trivial count

T3.101 — Vaccine exemption flag (~50 min):
- Step 1-7: state, handlers, exemptionMap, rendering, Dialog

Spawn ONE elite-code-engineer sub-agent to implement all steps.
Then spawn ONE code-quality-reviewer sub-agent to audit.

After review passes, run:
cd VetConnect-Admin && npm run build
cd VetConnect-Admin && npm test

Also update MASTER_TASKLIST.md:
- Mark T3.100 as DONE
- Mark T3.101 as DONE

IMPORTANT:
- T3.100 MUST be done before T3.101
- arrayRemove uses EXACT existing object
- ZERO prompt()/alert()/confirm() — MUI Dialog

The full plan is in PHASE3_VACCINE_QUICKWINS_PLAN.md — the engineer MUST read it before coding.

SPEC VERIFICATION (reviewer MUST check each item after engineer completes):
1. ✅ or ❌ — vaccinationStatus useMemo filters by pet species
   Grep: "species" in PatientDashboard.jsx vaccinationStatus block
2. ✅ or ❌ — vaccineExemptions[] array on pet doc with MUI Dialog input
   Grep: "exemption" in PatientDashboard.jsx → Dialog + arrayUnion write

Do NOT commit yet.
```

---

## Spec Verification Checklist — MANDATORY ELEMENT IN EXECUTE PROMPTS

**Why this exists:** Tasks with 5+ spec points have a high miss rate. The engineer
implements 90% but misses subtle conditionals or UI elements. The code-quality
reviewer checks code quality but not spec compliance. The spec check was happening
AFTER shipping — too late. This element shifts verification LEFT into the
implementation session.

**When to include:** EVERY execute prompt for tasks with 3+ spec points. Skip only
for trivial tasks (<3 spec points, zero design ambiguity).

**How to write it:**

1. Read the full task description from MASTER_TASKLIST.md
2. For EACH numbered spec point, write ONE verification item with:
   - A short description of what to check
   - A grep-able acceptance criterion (file + pattern to search for)
   - Expected finding (what the grep should return)

**Format in the execute prompt:**

```
SPEC VERIFICATION (reviewer MUST check each item after engineer completes):
1. ✅ or ❌ — [Short description of spec point]
   Grep: "[pattern]" in [file] → [expected finding]
2. ✅ or ❌ — [Short description of spec point]
   Grep: "[pattern]" in [file] → [expected finding]
...
```

**Rules:**
- One checklist item per numbered spec point — no gaps, no merging
- Grep patterns must be specific enough to confirm intent, not just existence
  (e.g., "required for Medicine" not just "required")
- Include NEGATIVE checks for things that should NOT exist
  (e.g., "❌ No window.confirm in ClinicalWorkspace.jsx")
- The reviewer agent is explicitly told: "Check EVERY item in the SPEC
  VERIFICATION block. Report ✅ or ❌ for each. If any ❌, fix before declaring done."

**Real example (T4.142 — would have caught the Dispensing Unit conditional bug):**

```
SPEC VERIFICATION (reviewer MUST check each item after engineer completes):
1. ✅ or ❌ — productClass Select dropdown on ProductFormModal
   Grep: "productClass" in ProductFormModal.jsx → Select with 3 MenuItems
2. ✅ or ❌ — Dispensing Unit required for Medicine, optional for others
   Grep: "required" near "Dispensing Unit" in ProductFormModal.jsx →
   conditional: required={productClass === 'medicine'}
3. ✅ or ❌ — Dosage/Strength shown only for Medicine tier
   Grep: "dosage" or "strength" in ProductFormModal.jsx → conditional render
4. ✅ or ❌ — dischargeSummary.supplies[] written at sign-off
   Grep: "supplies" in ClinicalWorkspace.jsx handleSaveConsult → filter by
   productClass === 'medical_supply'
```

Item 2 would have caught the bug: the reviewer would grep for "required" near
"Dispensing Unit" and find `required={true}` (unconditional) instead of
`required={productClass === 'medicine'}` (conditional per spec).

**Integration with the reviewer agent:**

Add this line to the agent delegation (element 4):

```
Then spawn ONE code-quality-reviewer sub-agent to audit.
The reviewer MUST also verify every item in the SPEC VERIFICATION checklist
and report ✅ or ❌ for each. Fix any ❌ before declaring done.
```

This way the reviewer's scope explicitly includes spec compliance, not just
code quality. The checklist gives it concrete things to grep for.

## Amendment Prompt Structure (for injecting advisory pushback)

1. **Timing** — "Before executing the [PLAN].md, update the plan file with these N amendments from advisory review. Then save the updated plan before any code changes."
2. **Per amendment** — "Amendment N — [TITLE]: [DETAILED DESCRIPTION with exact code patterns, file locations, what to add/remove/change]"
3. **Verification** — "Update [PLAN].md with all amendments, then show me the updated plan summary. I will approve before any code changes."

### Example Amendment (T3.11 RA 10173 Erasure — 6 amendments):
```
Before executing the PHASE3_RA10173_ERASURE_PLAN.md, update the plan file with these
6 amendments from advisory review.

Amendment 1 — Microchip field (Step 1.1, pet anonymization payload):
Preserve the microchip field. Add a code comment:
"// microchip retained for animal welfare — veterinary duty of care per RA 10173 §13(d)"

Amendment 2 — Type-to-confirm safeguard (Step 2.2):
Add a "type ERASE to confirm" TextField...

Update PHASE3_RA10173_ERASURE_PLAN.md with all 6 amendments, then show me the
updated plan summary. I will approve before any code changes.
```

---

## Commit Prompt Structure

1. **Status summary** — "[TASK SUMMARY]. Build passes. N/N tests passing."
2. **Tasklist verify** — "Verify MASTER_TASKLIST.md already has [IDS] marked as DONE."
3. **Explicit file list** — every changed file listed, NEW files marked
4. **Commit message** — single line, format: "feat[scope]: [description] ([task IDs])"
5. **Push instruction** — "Then push to origin main."
6. **Trailing line ban** — "Do NOT append Co-Authored-By or any trailing lines to the commit message."

### Example Commit Prompt:
```
T3.100 + T3.101 implemented and reviewed. Build passes. 306/306 tests passing.

1. Verify MASTER_TASKLIST.md already has T3.100 and T3.101 marked as DONE.

2. Stage and commit all changes:
   - VetConnect-Admin/src/features/Patients/PatientDashboard.jsx
   - MASTER_TASKLIST.md

   Commit message:

   feat(admin): vaccine tracker species filter + exemption system with MUI dialog (T3.100, T3.101)

3. Then push to origin main.

Do NOT append Co-Authored-By or any trailing lines to the commit message.
```

---

## Task Formalization — CRITICAL BEHAVIOR RULE

**When to formalize:** Whenever the advisory discussion discovers ANY of these:
- A gap, bug, or missing feature in the codebase
- A discrepancy between two surfaces (admin vs mobile)
- A deferred enhancement from a plan amendment
- A weakness in an existing system (vaccines, prescriptions, etc.)
- An edge case that should be handled but isn't
- A data integrity concern

**IMMEDIATELY formalize it as a task** before continuing to the next topic. Do NOT
leave discovered issues as conversational notes — they get lost between sessions.

**How to formalize:** Generate a prompt the user can paste into the implementation session:

```
Add N new task(s) to MASTER_TASKLIST.md:

In the Phase N section (after T3.XX), add:

| T3.YY | [Name] — [detailed description covering what exists today, what's wrong,
and what the fix should do]. | P[N] | [effort] | [depends] | TODO | [notes with
implementation hints] |

Update header counts:
- Total tasks: ~NNN (was ~MMM)
- TODO: ~NNN (was ~MMM)
```

**Task description quality rules:**
- Description must be self-contained — a planner reading only the task description
  should understand the problem and solution without reading the conversation
- Include the current state ("Currently X does Y")
- Include the desired state ("Should do Z instead")
- Include key file paths if known
- Include dependency on other tasks if applicable
- Priority: P1 = patient safety/legal, P2 = functional gap, P3 = polish/nice-to-have

**Example of a well-formalized task:**
```
| T3.110 | Treatment Plan sidebar: add prescription instructions input per item —
ClinicalWorkspace Treatment Plan sidebar (line ~2668) shows item name, qty, price,
and staff attribution but has NO TextField for dosing instructions. The handler
handleUpdateRxSig exists (line 1234) and the sig object is initialized with defaults
but there is no UI to edit it. Add a compact instructions TextField per product item
so vets can type "1 tab BID x 7 days". Drug items always-visible, non-drug collapsible.
Auto-populate from sig defaults. | P1 | 1 hr | — | TODO | Patient safety — dosing
instructions are critical clinical information that clients need |
```

**Example of a POOR task description (do NOT do this):**
```
| T3.110 | Add instructions input | P2 | 1 hr | — | TODO | |
```
This is useless — no context, no current state, no solution direction.

---

## Planner Prompt Generation — CRITICAL BEHAVIOR RULE

**When to generate a planner prompt:** Whenever the user says "I want to work on [task]"
and the task is >=30 min OR has any design ambiguity, generate the planner prompt
for the user to paste into the implementation session.

**NEVER skip the planner** for tasks that:
- Touch multiple files
- Involve design decisions (data model, UI layout, field naming)
- Have dependencies on other tasks
- Touch Firestore document structure
- Involve backward compatibility concerns

**ALWAYS skip the planner** (go direct execute) for tasks that:
- Are <30 min AND have zero design ambiguity
- Are pure find-and-replace renames
- Are single-field additions to an existing pattern
- Have a clear precedent in the codebase (e.g., "add the same chip pattern as X")

**Pre-research before generating:** Before writing the planner prompt, the advisory
session MUST:
1. Grep/read the relevant source files to identify exact file paths and line numbers
2. Check handoff.json for any locked decisions related to the task
3. Verify dependencies are actually DONE (not just marked done)
4. Identify any design decisions that need to be made

**Include in EVERY planner prompt:**
- The historical caveat about deep-dive files
- Specific file paths with line numbers (not vague "check the queue files")
- Per-task questions that prevent shallow planning
- "ZERO prompt()/alert()/confirm()" constraint
- "Save as PHASE[N]_[NAME]_PLAN.md"
- "Show me the plan. I will approve before any code changes."

---

## Execute Prompt Generation — CRITICAL BEHAVIOR RULE

**When to generate an execute prompt:** After the user approves the plan (with or
without amendments). NEVER generate the execute prompt before plan approval.

**Batch splitting rule:**
- Total effort >5 hrs → split into day-sized batch execute prompts
- Total effort 2-5 hrs → one execute prompt is fine
- If a single elite-code-engineer agent would struggle with the scope
  (>10 files, >20 steps), split into 2 batches

**Include in EVERY execute prompt:**
- "I've approved the [PLAN].md plan" (with amendments count if applicable)
- Step-by-step task breakdown with effort estimates
- "Spawn ONE elite-code-engineer sub-agent... Then spawn ONE code-quality-reviewer..."
  + "The reviewer MUST also verify every item in the SPEC VERIFICATION checklist
  and report ✅ or ❌ for each. Fix any ❌ before declaring done."
- Build + test commands: "cd VetConnect-Admin && npm run build && npm test"
- "Also update MASTER_TASKLIST.md: Mark [IDS] as DONE"
- IMPORTANT block with task-specific constraints + lessons from prior tasks
- "the engineer MUST read [PLAN].md before coding"
- SPEC VERIFICATION checklist (element 9) — one item per numbered spec point
  with grep-able acceptance criteria. See "Spec Verification Checklist" section.
- "Do NOT commit yet."

**Constraints to ALWAYS carry forward (cross-prompt learning):**
- "ZERO prompt()/alert()/confirm() — MUI Dialog/Snackbar on admin, Alert.alert on mobile"
- "All styling uses designTokens.js (admin) / mobileTokens.js (mobile)"
- "Zero borderRadius everywhere"
- "Do NOT append Co-Authored-By or any trailing lines to the commit message"
- Any task-specific negative constraints ("do NOT change serviceType", etc.)

**After execution result screenshot:** Check:
1. All tasks marked DONE
2. Build passes
3. Tests pass (note the count — should be >= previous count)
4. Reviewer fixes listed — assess if they're legitimate
5. File count matches plan expectation
If all good → generate commit prompt immediately.

---

## Commit Prompt Generation — CRITICAL BEHAVIOR RULE

**When to generate a commit prompt:** Immediately after the user shows the execution
result screenshot and the advisory confirms: build passes, tests pass, reviewer
fixes are legitimate, file count matches.

**NEVER generate a commit prompt if:**
- Build failed
- Tests decreased (fewer than previous count = something broke)
- Reviewer fixes seem suspicious or logic-changing (ask the user first)
- The execution didn't update MASTER_TASKLIST.md

**Include in EVERY commit prompt (exact structure, no deviation):**

```
[Status summary]. Build passes. N/N tests passing.

1. Verify MASTER_TASKLIST.md already has [IDS] marked as DONE.

2. Stage and commit all changes:
   - [every file listed explicitly, NEW files marked]
   - MASTER_TASKLIST.md

   Commit message:

   [type](scope): [description] ([task IDs])

3. Then push to origin main.

Do NOT append Co-Authored-By or any trailing lines to the commit message.
```

**Commit message format rules:**
- Type: `feat` for features, `fix` for bugs, `refactor` for renames/restructuring, `docs` for documentation
- Scope (optional): `(admin)` for admin-only, `(mobile)` for mobile-only, omit for cross-surface
- Description: one line, lowercase start, describes WHAT was delivered (not HOW)
- Task IDs: always in parentheses at the end
- NO Co-Authored-By line, NO trailing blank lines, NO emoji

**Examples of good commit messages:**
```
feat(admin): prescription instructions input in Treatment Plan sidebar — drug always-visible, non-drug collapsible, sig auto-populate (T3.110)
feat: queue notes restructure — clientNotes/staffNotes/systemChips split, tabbed popover, SOAP context box, intakeContext on records (T3.70)
refactor: rename rxCart→treatmentCart, prescriptions→dispensedProducts, prescribedItems→encounterItems with dual-read fallback (T3.98)
fix: add Firestore rules for system_prompts, llm_audit_logs, faqs, consent_versions, consent_records collections
```

**Examples of BAD commit messages (do NOT do this):**
```
update files
fix stuff
T3.110 done
```

---

## Key Patterns That Make Prompts Effective

- **Pre-researched specifics** — planner prompts include file paths, line numbers, field names already verified by the advisory session. Prevents the planner from guessing.
- **Locked decisions injected as facts** — "LOCKED: Option A" stated at the top. Prevents re-debate.
- **Negative constraints** — explicit "do NOT" instructions for common mistakes.
- **Backward compat callouts** — "dual-read fallback (newField || oldField)" everywhere.
- **Batch splitting rule** — >5 hrs = split into day-sized execute prompts. <30 min with zero design ambiguity = skip planner, go direct execute.
- **Cross-prompt learning** — constraints discovered during one task's review are carried forward.
- **Engineer-must-read** — "the engineer MUST read [PLAN].md before coding" prevents shallow implementation.

---

## Decision-Making Pattern (when advisory finds issues)

When the advisory review identifies a design decision:
1. Present ALL options with pros/cons table
2. State "My lean: Option X" with reasoning
3. Wait for user to choose
4. If user agrees: generate amendment prompt
5. If user disagrees: adjust and regenerate

Example:
```
### 1. Microchip field — anonymize or preserve?

Option A: Preserve (plan's current approach)
- Pros: Clinical utility...
- Cons: Re-identification vector...

Option B: Anonymize (null it)
- Pros: Strict compliance...
- Cons: Loses animal identification...

Option C: Preserve but flag as retained
- Pros: Keeps utility, documents retention basis...

My lean: Option C.
```

**Why:** This workflow was validated across ~90 tasks + 21 additional in the Apr 30/May 1 session. Every deviation caused issues that the reviewer had to fix. The pattern minimizes fixes and produces clean first-pass implementations.

**How to apply:** When the user asks to work on any task, follow this exact flow. Adapt specifics but keep structural elements and their order consistent.

---

## Sophisticated Planner Prompt Patterns (Apr 30/May 1 session additions)

### Multi-day splits for large tasks

For tasks >5 hrs, the planner prompt MUST suggest a day split AND the advisory
generates one execute prompt per day:

```
5. SPLIT RECOMMENDATION: This is 10-12 hrs — split into:
   Day 1 (~4 hrs): Schema + ProductFormModal + hook rewrite + cart field
   Day 2 (~4 hrs): Detection change + manual toggle + auto-population + stock-out
   Day 3 (~3 hrs): Migration button + consumers + cleanup
```

Real example: T4.117 (vaccine restructure) was split into 3 days with 14 steps.
Each day had its own execute prompt + verification checkpoint.

### Locked decisions in planner prompts

When a feature went through a decision round, inject ALL locked decisions into
the planner prompt so the planner doesn't re-debate:

```
4. Plan T4.117 with these locked decisions:

   Decision 1 — Schema: Category-driven vaccineConfig sub-object.
   Decision 2 — Detection: Drop keywords entirely.
   Decision 3 — Manual toggle: BOTH Plan quadrant + sidebar search.
   Decision 4 — Stock-out: Override toggle with noStockDeduction audit flag.
   Decision 5 — Migration: Settings "Migrate to Inventory" button.
   Decision 6 — Form auto-population: name from product, lot from batch...
```

### Cloudflare Worker code in planner prompts

When a task involves the Worker (not in repo), the planner prompt MUST:
1. Flag Part N as "NOT committed — code block for manual paste"
2. Include the Worker code in the plan file as a complete code block
3. The execute prompt says "Part N is provided as a code block"
4. The advisory provides the exact paste code when the user is ready

Real example: T3.55 had Part 6 (Worker Cron) as manual paste, T4.126 had Part 5.

### Pre-research findings integrated into prompts

The planner prompt includes EXACT findings from the pre-research grep/read:

```
   - VetConnect-Admin/src/components/ClinicalWorkspace.jsx — focus on:
     a. Line 482: EOD carry-over destructuring — currently excludes 12 fields:
        id, jsScheduled, jsArrived, jsStarted, jsCompleted, queueNumber,
        ticketPrefix, timeArrived, timeStarted, timeCompleted, isTriaged, notes.
        Does NOT exclude signedOffAt.
     b. Lines 1094-1114: Inline carry-over destructuring — currently excludes 24
        fields (all of the above PLUS status, statusHistory, clinicalPulse,
        forensicSeal, processedBy, processedAt, auditReason, auditReasons,
        rescheduledBy, accumulatedWaitMins, assignedVet, assignedVetId).
        Does NOT exclude signedOffAt.
```

NOT "check ClinicalWorkspace for the carry-over code" — EXACT line numbers + field lists.

### Existing plan file detection

When a plan file already exists from a prior planner run, tell the new planner:

```
NOTE: A previous plan file PHASE4_MOBILE_VITALS_SPUSH_PLAN.md exists in the repo
from an earlier planning run. The planner should READ it first, then update/improve
it if needed based on the current source state, or confirm it's still accurate.
```

### Firestore rules in execute prompts

When the task modifies firestore.rules, the execute prompt MUST include:
1. "Firestore rules: update FILES only, do NOT deploy"
2. The commit prompt includes: "REMINDER: After pushing, deploy Firestore rules manually"
3. The advisory reminds the user to deploy after each commit

**UPDATED (May 1 session):** Do NOT rely on manual reminders — the user forgot
to deploy rules multiple times (T3.55, T4.126 both had 403 errors). Instead,
include the deployment command IN the execute prompt's build step:

```
After review passes, run:
cd VetConnect-Admin && npm run build
cd VetConnect-Admin && npm test
cd VetConnect-Backend && firebase deploy --only firestore:rules

(The last command deploys updated Firestore rules. Skip if no rules changed.)
```

This way the implementation session deploys rules automatically as part of
the build verification — no manual step for the user to forget.

### Cloudflare Worker code persistence

The Worker source is now tracked in the repo at:
`VetConnect-Backend/cloudflare-worker/worker.js`

This is a REFERENCE COPY — the live Worker is still deployed via Cloudflare
Dashboard Quick Edit. But having it in the repo means:
1. Version history is tracked in git
2. Future sessions can read the current Worker code
3. The user doesn't have to copy-paste from the Dashboard to share it

When the Worker needs changes, the execute prompt should say:
```
Also update the Worker reference copy:
VetConnect-Backend/cloudflare-worker/worker.js

The engineer updates the file in the repo. The user then pastes the relevant
new function into the Cloudflare Dashboard Quick Edit manually.
```
