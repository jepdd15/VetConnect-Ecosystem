---
name: T4.110 AI Side Panel — ClinicalAIPanel + ClinicalWorkspace + SoapGrid
description: Review findings for T4.110: collapsible AI drawer + God View 3-column column. Dead imports in ClinicalWorkspace. All critical checks PASS.
type: project
---

T4.110 extracts all LLM display panels from DiagnosticBridge into the new ClinicalAIPanel.jsx component, which renders in either a MUI Drawer (default view) or a persistent third column (God View).

**Why:** DiagnosticBridge was doing too much — buttons + display panels. This separation makes each component focused.

**How to apply:** All future LLM display work goes through ClinicalAIPanel. DiagnosticBridge is now buttons-only.

Key findings:
- Dead imports WARNING: `ReactMarkdown` and `normalizeMarkdownTables` remain imported in ClinicalWorkspace.jsx (~lines 40-41) but are no longer used there (all rendering moved to ClinicalAIPanel). Safe to remove.
- God View SoapGrid passes `onToggleAIPanel={() => {}}` (no-op) and `isAIPanelOpen={true}` — correct; the panel is always visible there.
- Patient change correctly resets `isAIDrawerOpen` to false (line 556).
- All 3 quick-action chips call identical `onAnalyze() + onAskAI()` — they are cosmetically different labels but functionally identical. Intentional design choice (not a bug).
- User message truncated to 300 chars in display only — full content still in `llmMessages` state.
- `isEmpty` gate: chips hide when `diagnosticOpen=true` even without LLM use; bottom action bar takes over for LLM trigger. Correct.
- All 4 DiagnosticBridge call sites updated to new prop contract (9 props max).
- All borderRadius: 0 throughout.
- No alert()/confirm()/prompt().
