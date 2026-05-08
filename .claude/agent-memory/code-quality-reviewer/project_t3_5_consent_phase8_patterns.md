---
name: T3.5 Phase 8 — Consent Polish & Edge Cases Review Findings
description: Steps 8.2/8.4/8.5 modified + 8.1/8.3 verified: isPendingNoAccount chip uses COLORS.accentLight (brown) with white text — contrast gap; Record Consent button correctly renders for admin_registered; consentVersion one-liner correct; NewClientModal info box PASS
type: project
---

Phase 8 of T3.5 consent system. Three files modified, two verified unchanged.

**Key findings:**

1. ClientDetails.jsx (Step 8.2): `isPendingNoAccount` flag correctly defined (`isAdminRegistered && !hasConsent`). Chip uses `COLORS.accentLight` (#8D6E63 brown) as background with `COLORS.cardBg` (#FFFFFF white) as text color — this renders but is a WARNING: brown on white with chipTextColor set to white-on-brown actually creates dark-on-light inversion (chipTextColor=#fff on COLORS.accentLight brown background reads fine; the concern is that accentLight is a medium brown, not a muted neutral like gray — design spec calls for "muted/neutral" chip). Record Consent button uses `(!hasConsent || isOutdated)` condition — correctly renders for admin_registered clients with no consent. All COLORS tokens, no hardcoded hex, borderRadius: 0. PASS with WARN on accentLight color choice.

2. ClinicalWorkspace.jsx (Step 8.4): `consentVersion: patient?.consentVersion || null` added inside the `legal` object. Additive only — no structural changes. PASS.

3. NewClientModal.jsx (Step 8.5): Info box at line 192-194 uses `COLORS.warningSurface`, `COLORS.warning`, `TYPE.meta`. TYPE was already imported pre-Phase 8 (line 7). `borderRadius: 0` confirmed. PASS.

4. useConsentGate.js (Steps 8.1+8.3): STAFF_ROLES Set with all 4 roles. Graceful degradation via console.warn on missing policy doc. File unmodified in Phase 8. PASS.

**Patterns to watch:**
- `COLORS.accentLight` (#8D6E63) used as a "neutral/muted" chip color — it is a medium brown, semantically closer to espresso-family than neutral gray. Design spec says "muted/neutral" — this is a design-interpretation WARN, not a bug.
- `chipTextColor` defaults to `COLORS.cardBg` (#FFFFFF) for all chip states including the accentLight one — white text on medium brown (#8D6E63) has adequate contrast (~4.5:1 range) so accessibility is acceptable.
