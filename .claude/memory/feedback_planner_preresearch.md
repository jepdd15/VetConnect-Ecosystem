---
name: Pre-research before planner prompts — grep/read exact line numbers from current source
description: Before generating a planner prompt, the advisory session MUST pre-research the current source files to provide exact line numbers, variable names, and code patterns. The planner agent starts with zero context — vague instructions like "check the queue files" produce shallow plans. Validated across 12+ planner prompts in the Apr 30 session.
type: feedback
originSessionId: 6aabc38f-f3fb-4eb1-ab1e-bfea9783fc2e
---
## The rule

Before writing ANY planner prompt, the advisory session must:

1. **Grep for the relevant patterns** in the target files to find current line numbers
2. **Read the specific code sections** (10-50 lines) to understand the current structure
3. **Include exact line numbers + variable names + code patterns** in the planner prompt

The planner agent reads the prompt, then reads the files. If the prompt says "check line 482" and line 482 has shifted (because we modified the file earlier this session), the planner wastes time searching. Current line numbers from a fresh grep are always correct.

## What to pre-research

| What | Why | How |
|---|---|---|
| Current line numbers | Files change every session — old line refs are stale | Grep for key patterns, read ±20 lines |
| Variable/function names | Names may have been renamed in prior tasks | Grep for the feature keyword |
| Import paths | Imports may have changed after refactors | Grep for the module name |
| State variable names | useState hooks may have been added/renamed | Grep for useState pattern |
| Props passed to components | Props may have been added/removed | Grep for the component usage |

## Real examples from this session

### Example 1: T4.112 (Admin vitals S-push)

**Pre-research done:**
```
grep "SPECIES_VITAL_RANGES" PatientDashboard.jsx → found at line 93
grep "recharts|ResponsiveContainer|LineChart" PatientDashboard.jsx → found imports at line 62
read PatientDashboard.jsx lines 1680-1800 → confirmed all 7 vitals widgets with exact line ranges
```

**Result in planner prompt:**
- "Lines 93-99: SPECIES_VITAL_RANGES constant — already has temp, hr, rr, crt, bcs"
- "Lines 1681-1855: All 7 vitals Widget blocks"
- "CRT and BCS reference lines ALREADY EXIST (lines 1806-1807, 1827-1828) — skip item (3)"

The planner discovered CRT/BCS were already done because the advisory provided exact lines. Without pre-research, the planner would have planned redundant work.

### Example 2: T3.136 (Vitals input validation)

**Pre-research done:**
```
read ClinicalWorkspace.jsx lines 155-215 → VitalsGrid component, InputBase at lines 198-213
read ClinicalWorkspace.jsx lines 1378-1402 → handleSaveConsult validation gates
grep "updateSoap" → found at line 877, raw (field, value) setter
```

**Result in planner prompt:**
- "Lines 198-213: InputBase has NO type, NO min/max, NO validation"
- "Line 877: updateSoap — raw (field, value) => setSoapData setter, no validation"
- "Lines 1378-1402: handleSaveConsult current validation — only S/A/P check"

### Example 3: T4.117 (Vaccine restructure)

**Pre-research done:**
```
grep "isVaccinationVisit|buildVaccineKeywords" → found in 5 files
grep "isMedicine|vaccineConfig" ProductFormModal.jsx → found isMedicine pattern
read useVaccineCatalog.js full file → understood singleton listener pattern
read vaccineConstants.js full file → identified which functions to keep vs delete
```

**Result in planner prompt:**
- Listed all 5 files that import vaccine keywords
- Identified the isMedicine conditional pattern in ProductFormModal as the model for vaccineConfig
- Specified which vaccineConstants.js functions to DELETE vs KEEP

## Anti-patterns (what NOT to do)

❌ "Check ClinicalWorkspace.jsx for the vitals section"
✅ "ClinicalWorkspace.jsx lines 2834-2857: the 'Performed By' TextField select — currently renders ALL vetsList unfiltered"

❌ "Update the handleSaveConsult validation"
✅ "handleSaveConsult (~line 1352) currently validates: if (!soapData.assessment || !soapData.plan). Add !soapData.subjective.trim() to this gate."

❌ "The vaccine form is somewhere in SoapGrid"
✅ "SoapGrid.jsx lines 158-167: the '+ ADMINISTER VACCINE' Button with canToggleVaccine guard. Replace with species-filtered Autocomplete."

**Why:** Planner prompts with exact line numbers produce plans that the engineer can execute without guessing. Planner prompts with vague references produce plans that start with "search for..." and waste time re-discovering what the advisory already found.

**How to apply:** Before writing any planner prompt, run 2-4 Grep + Read calls to anchor the prompt in the current source state. Include the findings in the planner prompt's "Read the current source files" section with exact line numbers and code descriptions.
