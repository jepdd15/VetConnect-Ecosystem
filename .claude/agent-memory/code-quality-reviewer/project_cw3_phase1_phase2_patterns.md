---
name: CW3 Phase 1+2 — T2.94, T2.13, T2.95 Review Findings
description: CW3 Phase 1+2 review: multi-toggle serviceProgress Firestore clobber bug, stale comment in vitals block, svc.id undefined safety gap, sign-off does not merge serviceProgress into updatedServices
type: project
---

## Critical Bug: Multi-Service Toggle Clobbers Prior Progress (T2.95)

`handleToggleServiceProgress` builds `newServices` from `patient.services` (the stale mount-time prop). When Service A is toggled to `in-progress`, Firestore has `serviceStatus: 'in-progress'` for A. When Service B is then toggled, the write maps `patient.services` again — Service A still has its original `serviceStatus` (likely `undefined`) in the prop, so the write for B overwrites A's progress back to undefined.

**Fix:** Build `newServices` from the merged source:
```js
const newServices = (patient.services || []).map(s => ({
  ...s,
  serviceStatus: serviceProgress[s.id] ?? s.serviceStatus ?? 'pending',
  ...(s.id === svcId ? { serviceStatus: next } : {}),
}));
```
Or maintain a local `servicesRef` that is updated on each successful write.

## Critical Bug: Sign-Off Overwrites serviceStatus (T2.95 + sign-off)

`updatedServices` at sign-off (line 1102) is built from `patient.services` (stale prop) and only merges `staffId`/`staffName` from `serviceAttribution`. It does NOT merge `serviceProgress` state. After a session where services are toggled to `in-progress` or `completed`, the sign-off write replaces `services[]` with the original (pre-toggle) `serviceStatus` values from the prop.

**Fix (T2.96 scope):** Merge serviceProgress into updatedServices at sign-off:
```js
const updatedServices = [...(patient.services || []), ...addedServices].map(svc => {
  const override = serviceAttribution[svc.id];
  return {
    ...svc,
    serviceStatus: serviceProgress[svc.id] || svc.serviceStatus || 'pending',
    ...(override ? { staffId: override.staffId, staffName: override.staffName } : {}),
  };
});
```

## Warning: Stale Comment in Vitals Block (T2.13)

Line 1074-1075: comment says "CRM identity fields are only written when the user has opted into the sync" — this is now false, the CRM sync was removed by T2.13. The comment was not updated.

## Warning: undefined svc.id Safety Gap (T2.95)

`initProgress[svc.id]` on mount and `key={svc.id}` in JSX both silently accept `undefined` if a service object lacks an `id` field (e.g., follow-up services created without an id). All progress state for id-less services collapses into one `"undefined"` key.

**Fix:** Guard with `if (svc.id)` in the initialization loop. In the sidebar JSX, use `key={svc.id || svc.name}`.

## T2.94 — Fully Complete
- `handleCompleteService` deleted — confirmed 0 references
- `lockedServices` init now uses `patient.signedOffAt` check — confirmed
- Zero `workflowType` references — confirmed

## T2.13 — Fully Complete
- `syncToCRM` state deleted — confirmed 0 references
- Pet identity fields removed from sign-off batch — confirmed
- Owner contact sync removed — confirmed
- `CRM_SYNC_SUCCESS` pulse event removed — confirmed
- CRM Sovereignty Switch UI card removed — confirmed
- `WarningIcon` was actually `WarningAmberIcon` throughout — still in use on line 1698 (stock guard). No import hygiene issue.
- `CRM_SYNC_SUCCESS` was never in pulseUtils.js — removing the emit causes no breakage.

## T2.95 — Partially Complete (core bugs above affect correctness)
- `serviceProgress` state added and hydrated — confirmed
- `handleToggleServiceProgress` handler exists, writes to Firestore and emits pulse events — confirmed
- Rollback on failure confirmed (line 891)
- `makePulseEventId` and `arrayUnion` both used correctly
- Completed state is terminal (line 864: onClick guard + line 866-868: `'completed' => 'completed'`)
- Service Progress card renders after Treatment Plan Paper, before sign-off buttons — confirmed
- `borderRadius: 0` on inner Box items — confirmed
- COLORS tokens used for `medical`, `warning`, `brand` — confirmed; `'#2E7D32'` for completed is hardcoded but non-critical

## Architecture Note: patient prop is stale in ClinicalWorkspace
`patient` prop is set once via `setSelectedRow(row)` in Queue.jsx when the workspace opens. It is NOT refreshed by subsequent onSnapshot fires during the open session. Any code inside ClinicalWorkspace that reads `patient.services` after mount-time writes will see stale data. This affects T2.95's multi-toggle writes and the sign-off `updatedServices` construction.
