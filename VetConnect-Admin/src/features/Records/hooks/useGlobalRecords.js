import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';

/**
 * 🛰️ GLOBAL RECORDS ENGINE (V3: UNIFIED HYBRID)
 * Supports Date-Range Epochs, Multi-Segment Silos, and Deep Clinical Facets.
 */
export function useGlobalRecords(dateRange = { start: null, end: null }, searchQuery = '', searchMode = 'petName', silo = 'GLOBAL', facets = {}) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    let q;
    const appointmentsRef = collection(db, "appointments");

    // 🧬 SILO DEFINITIONS
    const SILOS = {
      'TRIAGE': ['pending', 'confirmed'],
      'CLINICAL': ['arrived', 'in-consult', 'on-hold', 'dispensing', 'pharmacy', 'billing', 'payment', 'dispense'],
      'IN-PATIENT': ['hospitalized', 'admitted', 'confined'],
      'ARCHIVE': ['completed', 'done', 'carried-over'],
      'VOIDED': ['cancelled', 'no-show']
    };

    const statusFilter = SILOS[silo] || null;

    // 🧬 PHASE 3: UNIFIED HYBRID ENGINE
    let constraints = [orderBy("createdAt", "desc"), limit(500)];
    
    // 1. Status/Silo Constraint
    if (statusFilter) constraints.unshift(where("status", "in", statusFilter));
    
    // 2. Facet Constraints
    if (facets.assignedVetId) constraints.unshift(where("assignedVetId", "==", facets.assignedVetId));
    if (facets.serviceCategory) constraints.unshift(where("serviceCategory", "==", facets.serviceCategory));
    if (facets.origin) {
      if (facets.origin === 'WALK_IN') constraints.unshift(where("ownerId", "==", "WALK_IN_USER"));
      else constraints.unshift(where("ownerId", "!=", "WALK_IN_USER"));
    }

    // 🧪 SEARCH PIVOT
    if (searchQuery && searchQuery.trim().length >= 2) {
      const qText = searchQuery.trim();
      const fieldMap = { 'petName': 'petName', 'ownerName': 'ownerName', 'phone': 'ownerPhone' };
      const targetField = fieldMap[searchMode] || 'petName';

      // Global Search ignores date/limits to find match across history
      q = query(
        appointmentsRef,
        where(targetField, ">=", qText),
        where(targetField, "<=", qText + '\uf8ff'),
        orderBy(targetField)
      );
    } else if (dateRange.start && dateRange.end) {
      // 🗓️ DEEP HISTORICAL EPOCH (With Silo & Facets!)
      const start = new Date(dateRange.start);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dateRange.end);
      end.setHours(23, 59, 59, 999);

      q = query(
        appointmentsRef,
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<=", Timestamp.fromDate(end)),
        ...constraints
      );
    } else {
      // 🌊 RECENT GLOBAL SANDBOX
      q = query(appointmentsRef, ...constraints);
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let fetchedRecords = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Normalizing typical date fields for the grid
        jsCreatedAt: doc.data().createdAt?.toDate() || null,
        jsScheduled: doc.data().jsScheduled?.toDate?.() || (doc.data().jsScheduled ? new Date(doc.data().jsScheduled) : null),
        jsArrived: doc.data().timeArrived?.toDate?.() || null,
        jsCompleted: doc.data().timeCompleted?.toDate?.() || null,
      }));

      // 🐾 CLIENT-SIDE SPECIES FACET (Avoids complex Firestore indexes)
      if (facets.petSpecies) {
        fetchedRecords = fetchedRecords.filter(r => r.petSpecies === facets.petSpecies);
      }

      setRecords(fetchedRecords);
      setLoading(false);
    }, (error) => {
      console.error("Global records fetch error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [dateRange.start, dateRange.end, searchQuery, searchMode, silo, JSON.stringify(facets)]);

  return { records, loading };
}
