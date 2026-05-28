/**
 * visitClassification — T4.248
 *
 * Determines whether a visit is "non-clinical" (e.g. grooming/boarding only) and
 * may therefore SKIP the SOAP clinical workspace.
 *
 * PATIENT-SAFETY CONTRACT:
 *   - A visit is non-clinical ONLY when it has at least one service AND every one of
 *     its services resolves to `requiresSOAP === false`.
 *   - Any uncertainty (service not found in the catalog, missing flag, empty/no
 *     services, missing catalog) resolves to CLINICAL. We never skip SOAP on doubt.
 *
 * The `requiresSOAP` flag (default true) lives on the service catalog doc. Appointment
 * `services` are booking-time snapshots that may predate the flag, so we resolve each
 * against the live catalog (by id, then name) — unless the snapshot already carries
 * its own `requiresSOAP`, in which case that wins.
 */

/**
 * Resolves whether a single (snapshot) service requires SOAP documentation.
 * Returns TRUE (clinical) on any ambiguity — the safe default.
 *
 * @param {object} svc                 - Appointment service snapshot ({ id, name, requiresSOAP? })
 * @param {Array<object>} [catalog]    - Live services catalog ({ id, name, requiresSOAP })
 * @returns {boolean} true = requires SOAP (clinical), false = non-clinical
 */
export function serviceRequiresSOAP(svc, catalog = []) {
  if (!svc) return true; // no service object → treat as clinical

  // 1. Snapshot carries its own explicit flag → it wins (future-proof).
  if (typeof svc.requiresSOAP === 'boolean') {
    return svc.requiresSOAP !== false;
  }

  const list = Array.isArray(catalog) ? catalog : [];

  // 2. Resolve against the live catalog — by id, then by case-insensitive name.
  let match = svc.id != null ? list.find((c) => c && c.id === svc.id) : undefined;
  if (!match && svc.name) {
    const key = String(svc.name).trim().toLowerCase();
    match = list.find((c) => c && String(c.name || '').trim().toLowerCase() === key);
  }

  // 3. Matched → honor the catalog flag (default true). Unmatched → clinical (safe).
  if (match) return match.requiresSOAP !== false;
  return true;
}

/**
 * True when EVERY service on the visit is non-clinical (requiresSOAP === false),
 * and the visit has at least one service. Otherwise false (including empty/mixed).
 *
 * @param {Array<object>} services     - Appointment services array (snapshots)
 * @param {Array<object>} [catalog]    - Live services catalog
 * @returns {boolean}
 */
export function isNonClinicalVisit(services, catalog = []) {
  if (!Array.isArray(services) || services.length === 0) return false;
  return services.every((svc) => serviceRequiresSOAP(svc, catalog) === false);
}
