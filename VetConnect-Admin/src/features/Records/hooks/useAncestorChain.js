import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

/**
 * 🧬 THE FORENSIC CHAIN RESOLVER
 * Recursively follows originApptId pointers to reconstruct a continuous clinical history.
 */
export function useAncestorChain(record) {
    const [ancestors, setAncestors] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!record || (!record.originApptId && (record.caseDay || 1) <= 1)) {
            setAncestors([]);
            return;
        }

        const resolveChain = async () => {
            setLoading(true);
            setError(null);
            
            const chain = [];
            let currentOriginId = record.originApptId;
            const MAX_DEPTH = 10;
            let depth = 0;

            while (currentOriginId && depth < MAX_DEPTH) {
                try {
                    const snap = await getDoc(doc(db, "appointments", currentOriginId));
                    if (!snap.exists()) break;
                    
                    const data = snap.id ? { id: snap.id, ...snap.data() } : null;
                    if (data) {
                        chain.unshift(data); // Oldest first
                        currentOriginId = data.originApptId;
                    } else {
                        break;
                    }
                } catch (err) {
                    console.error("Chain resolution error:", err);
                    setError(err.message);
                    break;
                }
                depth++;
            }
            
            setAncestors(chain);
            setLoading(false);
        };

        resolveChain();
    }, [record?.id, record?.originApptId]);

    const combinedPulse = [
        ...ancestors.flatMap(a => (a.clinicalPulse || [])),
        ...(record?.clinicalPulse || [])
    ];

    const combinedServices = [
        ...ancestors.map(a => ({ date: a.createdAt, services: a.services || [] })),
        { date: record?.createdAt, services: record?.services || [] }
    ];

    return { ancestors, combinedPulse, combinedServices, loading, error };
}
