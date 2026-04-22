import { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

const MAX_DEPTH = 10; // Safety cap for recursive chain traversal

/**
 * 🧬 THE FORENSIC CHAIN RESOLVER (T2.35: Bidirectional Walker)
 *
 * Walks BACKWARD via originApptId to reconstruct all ancestor records,
 * and FORWARD by querying for appointments whose originApptId points to the
 * current record, to find descendants (carry-over continuations).
 *
 * Returns the full case timeline: ancestors → current → descendants.
 */
export function useAncestorChain(record) {
    const [ancestors, setAncestors] = useState([]);
    const [descendants, setDescendants] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!record?.id) {
            setAncestors([]);
            setDescendants([]);
            return;
        }

        const resolveChain = async () => {
            setLoading(true);
            setError(null);

            // --- BACKWARD WALK (ancestors) ---
            const ancestorChain = [];
            let currentOriginId = record.originApptId;
            let depth = 0;

            while (currentOriginId && depth < MAX_DEPTH) {
                try {
                    const snap = await getDoc(doc(db, "appointments", currentOriginId));
                    if (!snap.exists()) break;
                    const data = { id: snap.id, ...snap.data() };
                    ancestorChain.unshift(data); // Oldest first
                    currentOriginId = data.originApptId;
                } catch (err) {
                    console.error('[useAncestorChain] Backward walk error:', err);
                    setError(err.message);
                    break;
                }
                depth++;
            }

            // --- FORWARD WALK (descendants) ---
            const descendantChain = [];
            let currentId = record.id;
            let fwdDepth = 0;

            while (fwdDepth < MAX_DEPTH) {
                try {
                    const fwdQ = query(
                        collection(db, "appointments"),
                        where("originApptId", "==", currentId),
                        limit(1)
                    );
                    const fwdSnap = await getDocs(fwdQ);
                    if (fwdSnap.empty) break;
                    const desc = { id: fwdSnap.docs[0].id, ...fwdSnap.docs[0].data() };
                    descendantChain.push(desc);
                    currentId = desc.id;
                } catch (err) {
                    console.error('[useAncestorChain] Forward walk error:', err);
                    break;
                }
                fwdDepth++;
            }

            setAncestors(ancestorChain);
            setDescendants(descendantChain);
            setLoading(false);
        };

        resolveChain();
    }, [record?.id, record?.originApptId]);

    /** Merged pulse events: all ancestors → current → all descendants, sorted by time. */
    const combinedPulse = [
        ...ancestors.flatMap(a => (a.clinicalPulse || [])),
        ...(record?.clinicalPulse || []),
        ...descendants.flatMap(d => (d.clinicalPulse || [])),
    ];

    const combinedServices = [
        ...ancestors.map(a => ({ date: a.createdAt, services: a.services || [] })),
        { date: record?.createdAt, services: record?.services || [] },
        ...descendants.map(d => ({ date: d.createdAt, services: d.services || [] })),
    ];

    return { ancestors, descendants, combinedPulse, combinedServices, loading, error };
}
