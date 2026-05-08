---
name: Decision round workflow — structured design decisions before task formalization
description: When the user asks to discuss a feature that involves architectural or UX choices, run a formal decision round BEFORE formalizing the task. Present numbered decisions with option tables, pros/cons, lean recommendation. Lock each decision with user input. Then formalize with all decisions cited. Validated across 7 decision rounds in the Apr 30 session.
type: feedback
originSessionId: 6aabc38f-f3fb-4eb1-ab1e-bfea9783fc2e
---
## When to trigger a decision round

A decision round is needed when a feature involves ANY of these:
- Data model choices (where does the data live? what shape?)
- UX interaction patterns (modal vs inline? sidebar vs table?)
- Integration strategy (which systems talk to which?)
- Scope boundaries (what's in v1 vs future?)
- Multiple valid approaches with different tradeoffs

**Do NOT skip the decision round** for features with >2 hrs effort that involve design choices. The user wants to make informed decisions, not discover design assumptions in the planner output.

**DO skip the decision round** for:
- Bug fixes (the fix is deterministic)
- Tasks <30 min with zero ambiguity
- Tasks where all decisions were already made in a prior round

## Decision round format (follow exactly)

### Step 1: Present each decision as a numbered section

```
## Decision N: [Question in plain terms]

| Option | What | Pros | Cons |
|---|---|---|---|
| **A: [Name]** | [Description] | [Pros] | [Cons] |
| **B: [Name]** | [Description] | [Pros] | [Cons] |
| **C: [Name]** | [Description] | [Pros] | [Cons] |

**My lean: Option X.** [1-2 sentence reasoning]
```

### Step 2: Collect all picks at the bottom

```
## Summary — your picks needed:

| Decision | Options | My lean |
|---|---|---|
| 1 — [Short name] | A / B / C | [Lean] |
| 2 — [Short name] | A / B / C | [Lean] |
```

### Step 3: Lock decisions and formalize

After the user picks all options:
```
All decisions locked:

| Decision | Choice |
|---|---|
| 1 — [Name] | **[Choice]** |
| 2 — [Name] | **[Choice]** |

Want me to formalize now?
```

Then generate the task formalization prompt with "Decisions locked:" in the notes column citing all choices.

## Real examples from this session

### Example 1: Vaccine Inventory Restructure (T4.117) — 6 decisions

**Decisions presented:**
1. Schema: where do vaccine-specific fields live on inventory products?
   - Options: A (top-level), B (nested vaccineConfig), C (category-driven)
   - Locked: **C** — vaccineConfig sub-object shown when category === 'Vaccine'

2. Keywords field: keep or drop?
   - Options: A (drop entirely), B (keep for backward compat), C (rename to aliases)
   - Locked: **A** — drop entirely, still in development

3. Detection change in ClinicalWorkspace:
   - Options: A (category only), B (category + manual toggle), C (hybrid)
   - Locked: **B** — category-based + manual toggle with vaccine product picker

4. Stock-out behavior:
   - Options: A (hard block), B (soft warning), C (override toggle with audit flag)
   - Locked: **C** — override with noStockDeduction flag

5. Form auto-population: no decision needed — implementation detail
   - Removed from decision list

6. Migration path:
   - Options: A (script), B (dual-read), C (Settings migration button)
   - Locked: **C** — Settings "Migrate to Inventory" button

**Sub-decision triggered during round:** manual toggle location (Plan quadrant / sidebar / both)
- Locked: **Both** — Plan quadrant shortcut + sidebar search

### Example 2: Lab Results Redesign (T4.120) — 6 decisions

**Decisions presented:**
1. Unit + reference range fields: A (add fields), B (test catalog), C (keep minimal)
   - Locked: **A+B combined** — catalog auto-populate + structured fields
   - User requested comprehensive test list (~78 tests brainstormed)
   - User pushed back on free-text fallback → "Add Custom Test" creates permanent catalog entries

2. Lab trend charts: A (text only), B (sparklines), C (zoom modal only)
   - Locked: **C** — zoom modal with test selector dropdown

3. Lab test catalog: A (free-text), B (hardcoded), C (Firestore), D (hardcoded now, Firestore later)
   - User asked "should lab tests be services?" → explained why NOT → locked: **D**

4. File attachments: A (no), B (photo upload), C (PDF parse)
   - Locked: **B** — but deferred to separate task T4.121

5. Sidebar widget placement: A (hide when empty), B (timeline only), C (merge with prescriptions)
   - Locked: **A** — hide when empty

6. Form location: A (keep in Plan), B (move to Objective), C (rename label)
   - Locked: **B** — move to Objective quadrant

### Example 3: Vaccine Reminders (T3.55) — 6 decisions

**Decisions presented:**
1. Trigger mechanism: A (admin button), B (auto cron), C (scheduled), D (button + nudge badge)
   - User asked about Cloudflare Worker Cron complexity → detailed analysis of JWT/pre-computed approaches → revised to hybrid
   - Locked: **C (hybrid)** — sign-off piggyback + weekly recompute + Cloudflare Cron

2. Reminder window: A (30d), B (14d), C (configurable), D (two-stage)
   - Locked: **C** — configurable, default 30 days

3. Overdue handling: A (same batch), B (separate template)
   - Locked: **B** — warm for due_soon, urgent for overdue

4. Dedup: A (per-pet), B (per-vaccine-per-pet), C (per-pet with cooldown)
   - Locked: **C** — per-pet with configurable cooldown (default 7 days)

5. Template tone: A (clinical), B (warm), C (warm + urgent for overdue)
   - User asked "what does overdue mean?" → explained current/due_soon/overdue definitions
   - Locked: **C** — warm + urgent

6. Never-vaccinated pets: A (treat as overdue), B (skip), C (separate template)
   - Locked: **B** — skip unknown status

## Key patterns observed

1. **Users often ask follow-up questions between decisions** — don't present all decisions at once and demand all picks. Present them, let the user respond partially, address follow-ups, then re-summarize remaining picks.

2. **Users sometimes propose combining options** — "what about A+B?" is common. Be ready to evaluate hybrid approaches.

3. **Users sometimes ask "is this really the best?"** — don't just defend your lean. Present the honest tradeoffs again and let them decide.

4. **New decisions emerge during the round** — the vaccine toggle location (Plan/sidebar/both) wasn't in the original 6 decisions. When a follow-up question reveals a new choice point, present it as a new decision.

5. **Some decisions get removed** — T4.117 Decision 5 (form auto-population) was removed because it was an implementation detail, not a choice. Be willing to collapse decisions that don't actually need user input.

6. **Decision rounds for updates** — when a task already exists but needs new decisions (T4.116 prescriptions redesign), run a decision round on the NEW choices, reference the existing task, then update the formalization.

**Why:** The decision round workflow was validated across 7 features in the Apr 30 session. Every decision was locked before formalization. Zero ambiguity in the planner prompts. The planner cites "Decisions locked:" and implements exactly what was decided — no re-debate.

**How to apply:** When the user says "I want to add [feature]" and the feature has design choices, say "Let me lay out the decisions" and run the round BEFORE formalizing. If the user says "formalize now" before decisions are made, push back: "Can we make a few decisions first? This feature has N design choices that affect the implementation."
