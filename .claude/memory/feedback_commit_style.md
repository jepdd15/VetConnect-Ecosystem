---
name: Commit message style — no co-author or extra notes
description: User does not want Co-Authored-By lines or other metadata appended to commit messages
type: feedback
originSessionId: 1a934e62-6783-406e-9455-3bdae326aed0
---
Do NOT include `Co-Authored-By`, `Generated with`, or any other trailing notes in commit messages. Keep commits clean — just the message itself.

**Why:** User explicitly requested this. The default Claude Code behavior appends co-author lines which the user does not want in their commit history.

**How to apply:** When creating git commits, use only the commit message (title + optional body). No trailers, no co-author lines, no tool attribution.
