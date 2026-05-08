---
name: Wrap prompts in code fences for clean copy
description: All prompt outputs (planner, execute, commit, amendment, session start, task formalization) must be wrapped in code fences so the user can copy numberings, pipe characters, and formatting cleanly.
type: feedback
originSessionId: 59e87189-0db4-417c-b7c4-574b16dbf925
---
Wrap all prompt outputs in triple-backtick code fences (```).

**Why:** Markdown numbered lists and table pipe characters don't copy correctly from the chat UI. Code fences preserve the raw text so the user can copy-paste directly into the implementation session without formatting loss.

**How to apply:** Every prompt the user is meant to copy — planner prompts, execute prompts, commit prompts, amendment prompts, task formalization prompts, session starting prompts — must be inside a code fence block. Explanatory text before/after the fence is fine as regular markdown.
