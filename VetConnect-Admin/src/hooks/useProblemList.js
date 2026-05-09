/**
 * useProblemList.js
 * T4.13 — Structured Problem List
 *
 * Real-time hook for a pet's problem list sub-collection.
 * Uses onSnapshot on pets/{petId}/problems for live updates during
 * a clinical session. Both ClinicalWorkspace and PatientDashboard
 * share this hook so problem list changes propagate in real-time
 * without page refresh.
 *
 * Walk-in guard: returns empty arrays immediately when petId is
 * WALK_IN_PET, WALK_IN_USER, or UNKNOWN — these are transient
 * patients that have no persistent Firestore pet document.
 *
 * @param {string|null|undefined} petId — Firestore pet document ID
 * @returns {{
 *   activeProblems: Array,
 *   resolvedProblems: Array,
 *   allProblems: Array,
 *   loading: boolean,
 * }}
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

const WALK_IN_IDS = new Set(['WALK_IN_PET', 'WALK_IN_USER', 'UNKNOWN']);

export function useProblemList(petId) {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);

  // ─── Real-time listener ───────────────────────────────────────
  useEffect(() => {
    if (!petId || WALK_IN_IDS.has(petId)) {
      setProblems([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'pets', petId, 'problems'),
      orderBy('diagnosedAt', 'desc'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setProblems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('[useProblemList] onSnapshot error:', err);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [petId]);

  // ─── Derived slices ───────────────────────────────────────────
  const activeProblems = useMemo(
    () => problems.filter((p) => p.status === 'active' || p.status === 'monitoring'),
    [problems],
  );

  const resolvedProblems = useMemo(
    () => problems.filter((p) => p.status === 'resolved'),
    [problems],
  );

  // ─── Standalone mutations (for non-batch callers) ──────────────
  const addProblem = useCallback(async (data) => {
    if (!petId || WALK_IN_IDS.has(petId)) return null;
    const ref = await addDoc(collection(db, 'pets', petId, 'problems'), {
      ...data,
      diagnosedAt: data.diagnosedAt || Timestamp.now(),
      lastUpdated: Timestamp.now(),
      resolvedAt: null,
      resolvedByRecordId: null,
      severityHistory: data.severity
        ? [{ severity: data.severity, date: Timestamp.now(), recordId: data.sourceRecordId || null }]
        : [],
    });
    return ref.id;
  }, [petId]);

  const updateProblem = useCallback(async (problemId, data) => {
    if (!petId || WALK_IN_IDS.has(petId)) return;
    await updateDoc(doc(db, 'pets', petId, 'problems', problemId), {
      ...data,
      lastUpdated: Timestamp.now(),
    });
  }, [petId]);

  const resolveProblem = useCallback(async (problemId, resolvedByRecordId) => {
    if (!petId || WALK_IN_IDS.has(petId)) return;
    await updateDoc(doc(db, 'pets', petId, 'problems', problemId), {
      status: 'resolved',
      resolvedAt: Timestamp.now(),
      resolvedByRecordId: resolvedByRecordId || null,
      lastUpdated: Timestamp.now(),
    });
  }, [petId]);

  return {
    activeProblems,
    resolvedProblems,
    allProblems: problems,
    addProblem,
    updateProblem,
    resolveProblem,
    loading,
  };
}
