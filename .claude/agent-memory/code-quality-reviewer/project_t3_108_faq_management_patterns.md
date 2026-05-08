---
name: T3.108 FAQ Management System — Review Findings
description: faqConstants.js, ChatbotScreen.js (FAQ fetch + appendix), Settings.jsx Pillar 12 CRUD — sortOrder stale-state, duplicate dayNames array, Dialog PaperProps gap
type: project
---

T3.108 PASS with two warnings and one suggestion.

Key findings:

**WARN — duplicate dayNames array in buildPromptAppendix (ChatbotScreen.js:102)**
`buildPromptAppendix` defines a local `dayNames` array that is identical to the module-level `DAY_NAMES` constant defined at line 53. The local variable should be removed and `DAY_NAMES` referenced instead.

**WARN — sortOrder derived from stale React state (Settings.jsx:1084)**
`const sortOrder = faqList.filter((f) => f.category === faqForm.category).length;`
`faqList` is React state — if two admins create FAQs in the same category near-simultaneously, both reads see the same length and assign the same sortOrder. Low risk in a single-admin settings page but worth noting. A server-side counter or `serverTimestamp` ordering would be safer.

**SUGGESTION — FAQ Dialogs missing PaperProps `borderRadius: 0` (Settings.jsx:3214, 3317)**
Both FAQ dialogs lack `PaperProps={{ sx: { borderRadius: 0 } }}`. The inner `DialogTitle` has `borderRadius: 0` but MUI Dialog Paper has default rounded corners. This is the same pre-existing pattern seen in T3.100/T3.101 (vaccine exemption dialog). Not a blocker — pre-existing pattern across all Settings dialogs.

**PASS — all critical checks:**
- faqConstants.js: 5 categories, 8 seed entries, both exported — PASS
- ChatbotScreen.js: `query`+`where` imported, FAQ fetch with `where('isActive','==',true)` + client-side sortOrder sort, `faqEntries` state, appendix useEffect deps correct, `systemPrompt + promptAppendix` concatenation at call time — PASS
- Settings.jsx: all 7 state vars present, onSnapshot on `faqs` collection sorted by sortOrder, cleanup in return, all 4 handlers present with logSettingsEvent audit, handleSeedFaqs guarded by `faqList.length > 0`, no alert()/confirm()/prompt(), all styling via COLORS/TYPE tokens — PASS
- No cross-contamination between admin and mobile files — PASS
- `SortIcon` unused import is pre-existing (not introduced by T3.108)

**Why:** sortOrder collision is benign in single-admin context but worth a long-term note. dayNames duplication is maintenance debt.
**How to apply:** Flag sortOrder stale-state pattern in any future multi-user concurrent-write path.
