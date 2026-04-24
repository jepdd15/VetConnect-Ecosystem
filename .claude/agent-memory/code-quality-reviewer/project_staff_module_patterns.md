---
name: Staff Module — Reviewed Patterns & Known Issues
description: Findings from T2.208-T2.227 staff module implementation review (2026-04-21)
type: project
---

Staff module implementation reviewed across 7 modified files + 1 new file.

**Secondary Firebase App pattern** used in useStaffManager for staff creation (initializeApp + deleteApp in finally) — confirmed correct. Role intentionally only set on create, not edit.

**Hardcoded hex values still present in Staff.jsx** (header bar + temp password dialog) — T2.226 design token migration was incomplete. The temp password Dialog was written with raw hex instead of tokens. This is a known gap to fix.

**ConfirmRevokeModal has hardcoded hex** — `#FFEBEE`, `#B71C1C`, `#FFF3E0`, `#FFE0B2` not mapped to tokens (no `danger10` surface token exists in designTokens.js, so some are genuinely unmappable without adding new tokens).

**Queue.jsx vet filter (T2.215) has a redundancy bug** — filter condition is `u.role === 'veterinarian' || u.role === 'groomer' || ['admin','staff','veterinarian','groomer'].includes(u.accessLevel)`. The role checks are made redundant by the accessLevel includes() check on the same values, but more critically: `u.role === 'disabled'` with `u.accessLevel === 'veterinarian'` (a revoked vet) still passes the filter since accessLevel is not cleared on disable.

**handleConfirmRevoke control flow risk** — setRevoking(false)/setOpenRevoke(false)/setRevokeTarget(null) are called in sequence after the try/catch, not in a finally block. If catch throws (unexpected), state cleanup is skipped. Low severity in practice since catch only calls showToast.

**activeAppointments empty array vs undefined** — correctly initialized as [] in useState, so .filter() on it is always safe.

**navigator.clipboard fallback absent** — temp password copy button crashes silently in non-HTTPS or older browser contexts.

**Why:** Documenting for future review sessions to avoid re-auditing.
**How to apply:** When reviewing Staff module PRs, check for token compliance in the dialog area and the revoke flow state cleanup pattern.
