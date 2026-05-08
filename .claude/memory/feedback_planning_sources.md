---
name: Planning sources — always read deep-dives and handoff.json
description: When planning or investigating any task, read the module's deep-dive file and referenced handoff.json sections — not just MASTER_TASKLIST.md
type: feedback
originSessionId: 05b233a5-9ab7-4942-b387-af3fb4bf6f31
---
When planning or investigating any task:
- If the task references handoff.json (line numbers or section names), read those sections
- If the task belongs to a module with a deep-dive file, have the planner read it (e.g., CLINICAL_WORKSPACE_DEEPDIVE.md, STAFF_DEEPDIVE.md, etc.)
- The deep-dive files and handoff.json contain locked decisions, architectural context, and code analysis that is NOT duplicated in MASTER_TASKLIST.md
- MASTER_TASKLIST has the task registry; deep-dives have the specs; handoff.json has the decisions

**Why:** The three sources are complementary. Planning against MASTER_TASKLIST alone misses specs, locked decisions, and code-level context that lives in the deep-dives and handoff.json. This caused issues in prior sessions where planners produced shallow or contradictory plans.

**How to apply:** Before generating any implementation plan or investigation, check (1) which module the task belongs to, (2) whether a *_DEEPDIVE.md exists for it, and (3) whether handoff.json lines/sections are cited in the task notes. Read all applicable sources before planning.

**IMPORTANT: Deep-dive files are HISTORICAL, not current.** They were written during audit sessions (April 15-21) BEFORE implementation. All bug descriptions, line numbers, and code quotes describe the PRE-FIX state. ~500 tasks have been implemented since then. Use deep-dives for architectural context, locked decisions, and understanding WHY a task exists — but ALWAYS read the current source file before planning. Never trust a deep-dive's line numbers or code quotes as current.
