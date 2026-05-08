---
name: Objective system assessment format — style guide for honest feedback
description: When user asks for an honest/objective assessment of any VetConnect system, follow this exact format with "What the system actually has" and "Where it falls short" sections, plus a tier rating table. Validated across 3 assessments (queue/audit, My Bookings, push notifications) in the Apr 29 session.
type: feedback
originSessionId: ab6c4598-f209-4a49-86ad-28276acbf513
---
## When to use
When the user asks "how good is this?", "is it amateur tier?", "give me honest feedback", "objective assessment", or any variant requesting a quality evaluation of a VetConnect system or feature.

## Format (follow exactly)

### 1. "What the system actually has" section
- Lead with the strongest architectural pattern (the thing that would impress a reviewer)
- List 8-12 concrete features/patterns with **bold lead-ins** and explanatory text
- Each point should name specific code patterns, file names, or technical decisions
- Focus on what EXISTS in the code, not what was planned
- Include metrics where available (line counts, coverage percentages, path counts)

### 2. "Where it falls short" section
- List 5-8 weaknesses with **numbered bold headers**
- Each weakness: explain WHAT is missing, WHY it matters, and what a production system would have
- Be specific — "no offline support" is better than "could be improved"
- Distinguish between infrastructure concerns (acceptable for capstone) and design gaps (should be fixed)
- Note which weaknesses are known trade-offs vs actual oversights

### 3. Tier rating table
Use this exact tier structure (adjust tier names per domain):

| Tier | Description | [System Name]? |
|------|-------------|---------------|
| Amateur | [minimal baseline for this domain] | No |
| Student | [basic tutorial-level implementation] | No |
| Intermediate | [competent but standard implementation] | No |
| **Professional** | **[list key features that place it here]** | **Yes** |
| Enterprise | [what would be needed to reach this tier] | Partially |

### 4. Closing paragraph
- One sentence: "The system is [tier]-grade."
- Highlight 1-2 features that exceed the tier (innovative/creative solutions)
- Name the primary weakness category (infrastructure vs design vs feature gaps)
- For capstone context: note what's expected vs what exceeds expectations

## Style rules
- Be completely honest — don't inflate or deflate
- Use concrete technical terms, not vague praise
- Compare to real-world equivalents where possible (commercial products, industry standards)
- Acknowledge Spark plan / capstone constraints as mitigating factors for infrastructure gaps
- The user values transparency — if something is weak, say so directly

## Examples from this session

**Queue/Audit system assessment:** Professional-grade. forensicSeal + correction DNA linking exceed commercial vet PMS. Weakness: 18 write paths without centralized transition function.

**My Bookings assessment:** Professional-grade. Case day chains + forensicSeal-derived client metrics + clinical timeline exposure are innovative. Weakness: 1,629-line god component (ClientAppointments.js), no offline support, no pagination.

**Push notifications assessment:** Professional-grade. Cloudflare Worker bypass of Spark limitations is architecturally creative. 18-path fire-and-forget with 3-level caching. Weakness: no delivery receipts, no stale token cleanup, manual reminders.

**Why:** The user explicitly asked for this format to be persisted so future sessions produce consistent, honest assessments. The format was validated across 3 separate assessments in a single session.

**How to apply:** When the user asks for feedback on any system (e.g., "how good is the inventory module?", "rate the mobile app"), read the relevant source files, then produce the assessment in this exact format. Do NOT skip the tier table. Do NOT soften the "falls short" section.
