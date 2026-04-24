---
name: CW2 T2.32 + T2.41 — SoapGrid Extraction & caseDay Fix
description: T2.32/T2.41 review findings: pre-rendered node stale-closure risk, missing followUpNode in main SoapGrid call, ZEN_PLACEHOLDERS duplication, T2.41 clean removal confirmed
type: project
---

**T2.41 (Queue.jsx):** Clean removal of 3-line caseDay block from `saveReschedule`. Confirmed by grep — only lines 369 and 423 (EndOfDayModal carry-over paths) still increment caseDay. No regressions.

**T2.32 (SoapGrid.jsx + ClinicalWorkspace.jsx):**

- Sub-component passing pattern: `SoapQuadrant`, `VitalsGrid`, `DiagnosticBridge` are exported from ClinicalWorkspace.jsx and passed as props to SoapGrid to avoid circular imports. SoapGrid does NOT import from ClinicalWorkspace — no circular dependency.

- Pre-rendered JSX nodes (`vaccineFormJSX`, `labResultsJSX`, `draftSaveJSX`) are computed inside the ClinicalWorkspace render function and capture current state/handlers via closure. This is correct but a known stale-closure risk if ever memoized — do not wrap these in useMemo without including all referenced state in the deps array.

- `followUpNode` prop: SoapGrid.jsx declares it in its interface, but neither SoapGrid call site in ClinicalWorkspace passes it. This is correct because T2.28 (follow-up UI) was NOT implemented in this batch — followUpNode defaults to null. Review confirmed this is intentional scope boundary, not a missing prop.

- ZEN_PLACEHOLDERS is defined in BOTH SoapGrid.jsx (module-scope) AND exported from ClinicalWorkspace.jsx (line 290). The Zen-mode Dialog in ClinicalWorkspace references its own local export. This is harmless duplication but the plan noted it as acceptable.

- Assessment TextField uses hardcoded `color: '#2E7D32'` in SoapGrid.jsx line 95 rather than a design token. This is intentional per the plan's risk note — the green is semantic (diagnosis color), not brand color.

- `soapData` is always initialized as a non-null object (useState at line 315), so `soapData.field || ''` in SoapGrid is safe.

- The plan's SoapGrid spec imported `Button` and `SaveAltIcon` — the actual implementation correctly omits them (draftSaveNode is pre-rendered by parent, not by SoapGrid itself).

**How to apply:** When reviewing future ClinicalWorkspace changes, watch for: (1) memoization of pre-rendered node variables without correct deps, (2) circular import if SoapGrid ever imports from ClinicalWorkspace, (3) the duplicate ZEN_PLACEHOLDERS becoming inconsistent if placeholder text is ever updated.
