---
name: T3.5 Consent Viewing Patterns
description: Architectural bug (single activeVersion shared across DPA+Waiver types), canvas hardcoded white, window.confirm pre-existing in usePatientManager, hardcoded hover color in ConsentRecordDialog
type: project
---

useConsentPolicy returns a single `activeVersion` number from clinic_settings/consent_policy. This number is DPA-governed (comment in seedDefaults confirms it). ClientDetails passes the same `activeVersion` to both the DPA and Waiver ConsentStatusCard instances. If DPA is on v2 and Waiver is on v1, the Waiver card will incorrectly show "outdated" for a client who consented to Waiver v1. The per-type version numbers should be derived from `activeDpaVersionDoc?.versionNumber` and `activeWaiverVersionDoc?.versionNumber` instead.

ConsentRecordDialog has two hardcoded hex values: `#FFFFFF` (canvas background fill — acceptable, as it ensures PNG transparency is overridden; COLORS.cardBg would be semantically cleaner but functionally equivalent) and `#1B5E20` (hover state for submit button — this is the dark-green MUI shade not in design tokens; should use COLORS.successDark or a token alias).

window.confirm in usePatientManager.handleDeleteNote is pre-existing (not part of T3.5) but still a rule violation.

PatientDashboard consent audit log: lazy-load pattern (getDocs only when expanded, cancelled flag in useEffect cleanup) is correctly implemented.
**Why:** Documents patterns discovered during T3.5 code review so future reviews can cross-reference.
**How to apply:** Flag if useConsentPolicy activeVersion is used for per-type comparisons again; suggest per-type version derivation from versions array.
