---
name: Settings Batch 2 — Reviewed Patterns & Known Issues
description: T2.7/T2.182/T2.183/T2.190 review findings: dummy phone fallback, autoNoShowMins zero-value guard, null-field bloat on appointments, timezone drift in 30-day cutoff
type: project
---

Settings Batch 2 covered clinic phone propagation (T2.7), No-Show button time gate (T2.182), date picker max cap (T2.183), and no-show detection/lineage stamping (T2.190).

**Why:** Cross-module plumbing touching mobile screens, admin queue columns, and a shared utility.

**How to apply:** Flag these patterns whenever similar features are implemented.

## Recurring issues found

### 1. `||` vs `??` for zero-valid settings values
`autoNoShowMins || 30` silently replaces an admin-configured `0` (meaning "always enabled") with 30. This pattern appears wherever clinic settings are consumed with a default fallback. Always use `??` when 0 is a valid sentinel.

### 2. Explicit null field writes to Firestore
Both `BookAppointment.js` and `WalkInModal.jsx` write `rebookedFromId: null` and `noShowCount: 0` to every appointment document, even when there is no no-show history. This creates noise and interferes with `!= null` Firestore queries. Pattern: only spread conditional fields when they have meaningful values.

### 3. ChatbotScreen fallback phone number
`clinicSettings.clinicPhone || '09000000000'` — a real-looking placeholder is more dangerous than a disabled button. SuperCard correctly disables its CTA when phone is empty; ChatbotScreen does not follow the same pattern.

### 4. Timezone drift in 30-day cutoff
`noShowDetection.js` and the inline copy in `BookAppointment.js` compute the cutoff with `new Date()` (browser local time). Project convention is Asia/Manila. Edge appointments can be off by hours. Fix: `new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }))`.

### 5. Logic duplication across monorepo boundary
The no-show batching + filter + sort logic is duplicated between the admin utility (`VetConnect-Admin/src/utils/noShowDetection.js`) and `BookAppointment.js`. Comment in BookAppointment acknowledges the monorepo split as the reason. Solution: create `VetConnect/src/utils/noShowDetection.js` as a mobile-side copy so future fixes apply to both.

### 6. Walk-in no-show button permanently disabled
When `jsScheduled` is null (walk-ins), `noShowWindowOpen` is always false because the guard is `scheduled != null && ...`. This may be intentional but is not documented.

### 7. #F57C00 color not in COLORS tokens
Used in ClinicalWorkspace.jsx (no-show chip) and BookAppointment.js (banner border). Closest existing tokens: `COLORS.warning` (#E65100) or `COLORS.amber` (#FF9800). Should be added as `COLORS.warningOrange` or normalized.
