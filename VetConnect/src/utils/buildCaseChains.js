/**
 * Groups appointments linked by originApptId into case chains.
 *
 * Algorithm:
 *   1. Build a lookup map: appointmentId -> appointment (O(1) access)
 *   2. Track which appointment IDs are referenced as originApptId by any
 *      other appointment — these are "parent" nodes in a chain.
 *   3. For each appointment with originApptId, walk backward through the
 *      lookup map to find the root (the appointment whose originApptId is
 *      absent or points outside the current set).
 *   4. A visited Set in findRoot guards against cycles in corrupt data.
 *   5. Group all appointments sharing the same root into a chain.
 *   6. Appointments with no originApptId AND not referenced by anyone
 *      remain standalone.
 *   7. Filter to chains with 2+ members; sort members by caseDay ascending.
 *
 * Legacy compatibility: appointments without originApptId or caseDay are
 * treated as standalone and not modified in any way. The sort comparator
 * treats a missing caseDay as 1.
 *
 * @param {Array<{ id: string, originApptId?: string, caseDay?: number }>} appointments
 * @returns {{
 *   chains: Map<string, object[]>,
 *   standaloneIds: Set<string>
 * }}
 *   chains — Map from rootId to sorted appointment array (only 2+ member chains)
 *   standaloneIds — Set of appointment IDs not part of any chain
 */
export function buildCaseChains(appointments) {
  // Step 1: Build O(1) lookup and identify parent nodes.
  const byId = new Map();
  const childrenOf = new Set(); // IDs that are someone's originApptId

  for (const appt of appointments) {
    byId.set(appt.id, appt);
    if (appt.originApptId) {
      childrenOf.add(appt.originApptId);
    }
  }

  // Step 2: Walk each appointment to the chain root.
  // Cache results so multi-hop chains only traverse each node once.
  const rootCache = new Map(); // id -> rootId

  const findRoot = (startId) => {
    if (rootCache.has(startId)) return rootCache.get(startId);

    const visited = new Set();
    let current = startId;

    while (true) {
      if (visited.has(current)) break; // cycle guard — corrupt data safety
      visited.add(current);

      const appt = byId.get(current);
      if (!appt?.originApptId || !byId.has(appt.originApptId)) break;
      current = appt.originApptId;
    }

    // Cache the resolved root for every node in the traversal path.
    for (const visitedId of visited) {
      rootCache.set(visitedId, current);
    }
    return current;
  };

  // Step 3: Group appointments by their root ID.
  const chainMap = new Map(); // rootId -> appointment[]

  for (const appt of appointments) {
    // Only process nodes that are part of a chain (have a parent or have children).
    if (!appt.originApptId && !childrenOf.has(appt.id)) continue;

    const rootId = findRoot(appt.id);
    if (!chainMap.has(rootId)) chainMap.set(rootId, []);
    chainMap.get(rootId).push(appt);
  }

  // Step 4: Filter to 2+ member chains and sort by caseDay ascending.
  const chains = new Map();
  const chainedIds = new Set();

  for (const [rootId, members] of chainMap) {
    if (members.length >= 2) {
      members.sort((a, b) => (a.caseDay || 1) - (b.caseDay || 1));
      chains.set(rootId, members);
      for (const member of members) {
        chainedIds.add(member.id);
      }
    }
  }

  // Step 5: Everything not in a 2+ chain is standalone.
  const standaloneIds = new Set();
  for (const appt of appointments) {
    if (!chainedIds.has(appt.id)) standaloneIds.add(appt.id);
  }

  return { chains, standaloneIds };
}
